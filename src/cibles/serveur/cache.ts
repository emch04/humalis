/**
 * Le cache du serveur produit : « en cache pendant 5 minutes » dans une route, « en cache pendant 30 minutes » dans une
 * source à jeton secret, et « vider le cache de "…" ». Validé avec le mainteneur le 17 novembre 2026.
 *
 * Sans HUMALIS_CACHE_ADRESSE, le cache vit dans la mémoire de chaque exemplaire du serveur, borné en taille ; une
 * écriture le vide ici avant de répondre, et chez les autres exemplaires par les annonces de la base. Avec une adresse
 * redis:// ou rediss:// (Redis, Valkey ou un serveur compatible), le cache est partagé par tous les exemplaires, et Redis
 * porte aussi les annonces en direct. La base reste la seule mémoire de référence : Redis ne garde que des copies, et sa
 * panne ne fait que ralentir (chaque lecture repasse par la base).
 *
 * Une réponse n'est gardée que si aucune écriture ne l'a précédée pendant qu'elle se calculait : la génération de
 * l'espace est lue avant la lecture, et la copie porte cette génération.
 */

/** src/humalis/cache.ts */
export const CACHE = String.raw`import type { Request, RequestHandler, Response } from 'express';

type Client = {
  isReady: boolean;
  connect(): Promise<unknown>;
  on(evenement: string, faire: (...valeurs: unknown[]) => void): unknown;
  mGet(cles: string[]): Promise<(string | null)[]>;
  get(cle: string): Promise<string | null>;
  set(cle: string, valeur: string, options: { EX: number }): Promise<unknown>;
  incr(cle: string): Promise<number>;
  publish(canal: string, message: string): Promise<number>;
  pExpire(cle: string, millisecondes: number, mode?: 'NX'): Promise<unknown>;
  pTTL(cle: string): Promise<number>;
  decr(cle: string): Promise<number>;
  del(cle: string): Promise<number>;
  subscribe(canal: string, faire: (message: string) => void): Promise<unknown>;
  duplicate(): Client;
  quit(): Promise<unknown>;
};

/** Le préfixe des clés : un serveur et une base à lui, pour que deux applications (ou deux bases) ne se mélangent pas. */
let PREFIXE = 'humalis:cache:';
const MAXIMUM = Number(process.env.HUMALIS_CACHE_MAX) > 0 ? Math.floor(Number(process.env.HUMALIS_CACHE_MAX)) : 5000;

// ─── En mémoire ────────────────────────────────────────────────────────────
const generations = new Map<string, number>();
/** Les copies, de la plus ancienne à la plus récente lue : la première part quand la mémoire est pleine. */
const copies = new Map<string, { valeur: string; fin: number; generation: number }>();
const generationLocale = (espace: string): number => generations.get(espace) ?? 0;

// ─── Dans Redis ────────────────────────────────────────────────────────────
let client: Client | null = null;
let abonne: Client | null = null;
/** Une écriture n'a pas pu vider Redis : au retour de Redis, toutes les copies sont abandonnées d'un coup. */
let epoqueEnRetard = false;
const abonnements = new Map<string, ((message: string) => void)[]>();
const cleGeneration = (espace: string): string => PREFIXE + 'g:' + espace;
const cleEpoque = (): string => PREFIXE + 'epoque';
const cleCopie = (espace: string, cle: string): string => PREFIXE + 'v:' + espace + ':' + cle;
const redisPret = (): boolean => client !== null && client.isReady;

/** La génération d'un espace, lue avant de calculer la réponse : « époque/génération » avec Redis. */
async function generation(espace: string): Promise<string | null> {
  if (client === null) return String(generationLocale(espace));
  if (!redisPret()) return null;
  try {
    const [epoque, g] = await client.mGet([cleEpoque(), cleGeneration(espace)]);
    return (epoque ?? '0') + '/' + (g ?? '0');
  } catch {
    return null;
  }
}

async function lire(espace: string, cle: string, attendue: string): Promise<string | undefined> {
  if (client === null) {
    const copie = copies.get(espace + '\u0000' + cle);
    if (!copie) return undefined;
    if (copie.fin <= Date.now() || String(copie.generation) !== attendue) {
      copies.delete(espace + '\u0000' + cle);
      return undefined;
    }
    // Lue à l'instant : elle passe en dernier, loin de la sortie.
    copies.delete(espace + '\u0000' + cle);
    copies.set(espace + '\u0000' + cle, copie);
    return copie.valeur;
  }
  if (!redisPret()) return undefined;
  try {
    const brute = await client.get(cleCopie(espace, cle));
    if (brute === null) return undefined;
    const copie = JSON.parse(brute) as { g: string; v: string };
    return copie.g === attendue ? copie.v : undefined;
  } catch {
    return undefined;
  }
}

async function garder(espace: string, cle: string, valeur: string, secondes: number, lue: string): Promise<void> {
  if (client === null) {
    if (String(generationLocale(espace)) !== lue) return;
    while (copies.size >= MAXIMUM) copies.delete(copies.keys().next().value!);
    copies.set(espace + '\u0000' + cle, { valeur, fin: Date.now() + secondes * 1000, generation: generationLocale(espace) });
    return;
  }
  if (!redisPret()) return;
  try {
    await client.set(cleCopie(espace, cle), JSON.stringify({ g: lue, v: valeur }), { EX: Math.max(1, Math.round(secondes)) });
  } catch {
    // Pas de copie : la prochaine lecture repassera par la base.
  }
}

/** Une écriture : les copies de l'espace ne servent plus, ici et sur tous les exemplaires (Redis). */
async function vider(espace: string): Promise<void> {
  generations.set(espace, generationLocale(espace) + 1);
  if (client === null) return;
  try {
    if (!redisPret()) throw new Error('Redis absent');
    await client.incr(cleGeneration(espace));
  } catch {
    epoqueEnRetard = true;
  }
}

/** L'hôte et le nom de la base, jamais l'utilisateur ni le mot de passe de l'adresse. */
function lieuDeLaBase(base: string): string {
  try {
    const url = new URL(base);
    return url.host + url.pathname;
  } catch {
    return base;
  }
}

/** « livre|boutique-3 » (l'annonce d'un groupe) : l'espace est la donnée. */
const espaceDe = (cle: string): string => cle.split('|')[0]!;

export const cacheHumalis = {
  /**
   * Au démarrage : avec une adresse, Redis ; sinon, la mémoire de ce serveur. « base » (DATABASE_URL) sépare les clés
   * de deux bases. Chaque démarrage abandonne les copies d'avant : un nouveau programme, ou une base restaurée, ne
   * relit jamais une réponse d'avant.
   */
  async brancher(adresse: string | undefined, serveur: string, base: string): Promise<'memoire' | 'redis'> {
    if (!adresse) return 'memoire';
    PREFIXE = 'humalis:' + serveur + ':' + lieuDeLaBase(base) + ':';
    epoqueEnRetard = true;
    if (!/^rediss?:\/\//i.test(adresse)) throw new Error('HUMALIS_CACHE_ADRESSE doit commencer par redis:// ou rediss:// (chiffré).');
    const { createClient } = await import('redis');
    const reconnecter = (essais: number): number => Math.min(200 * 2 ** essais, 5000);
    // Sans file d'attente : quand Redis manque, une commande échoue tout de suite et la lecture repasse par la base.
    client = createClient({ url: adresse, disableOfflineQueue: true, socket: { reconnectStrategy: reconnecter, connectTimeout: 3000 } }) as unknown as Client;
    let signale = false;
    client.on('error', (erreur) => {
      if (signale) return;
      signale = true;
      console.warn('Cache : Redis ne répond pas (' + (erreur instanceof Error ? erreur.message : String(erreur)) + ') ; les lectures repassent par la base.');
    });
    client.on('ready', () => {
      if (signale) console.log('Cache : Redis répond de nouveau.');
      signale = false;
      if (epoqueEnRetard && client) {
        epoqueEnRetard = false;
        void client.incr(cleEpoque()).catch(() => { epoqueEnRetard = true; });
      }
    });
    // Le serveur démarre même si Redis manque : il le rejoindra dès qu'il répondra.
    const attendre = (promesse: Promise<unknown>) => Promise.race([promesse.catch(() => undefined), new Promise((fin) => setTimeout(fin, 3000).unref())]);
    await attendre(client.connect());
    abonne = client.duplicate();
    abonne.on('error', () => undefined);
    abonne.on('ready', () => {
      for (const [canal, faire] of abonnements) void abonne!.subscribe(canal, (message) => { for (const f of faire) f(message); }).catch(() => undefined);
    });
    await attendre(abonne.connect());
    return 'redis';
  },

  /** Redis branché et prêt : il porte aussi les annonces en direct entre exemplaires. */
  pret: redisPret,

  /** Une annonce à tous les exemplaires, par Redis. */
  async publier(canal: string, message: string): Promise<void> {
    if (!redisPret()) throw new Error('Redis absent');
    await client!.publish(canal, message);
  },

  /** Les annonces reçues par Redis (branchées avant ou après le démarrage). */
  abonner(canal: string, faire: (message: string) => void): void {
    const liste = abonnements.get(canal) ?? [];
    liste.push(faire);
    abonnements.set(canal, liste);
    if (abonne?.isReady && liste.length === 1) void abonne.subscribe(canal, (message) => { for (const f of abonnements.get(canal) ?? []) f(message); }).catch(() => undefined);
  },

  /**
   * La lecture d'une route ou d'une source en cache, placée après la garde des droits. « variante » sépare ce qui
   * dépend de la personne (son compte, quand la donnée est séparée ou que la règle la regarde).
   */
  lecture(espace: string, secondes: number, variante: (req: Request) => string = () => ''): RequestHandler {
    return async (req, res, next) => {
      if (req.method !== 'GET') return next();
      const cle = variante(req) + ' ' + req.originalUrl;
      const lue = await generation(espace);
      if (lue === null) return next();
      const copie = await lire(espace, cle, lue);
      if (copie !== undefined) {
        res.set('X-Humalis-Cache', 'garde').type('application/json').send(copie);
        return;
      }
      const envoyer = res.json.bind(res);
      res.json = ((corps: unknown) => {
        if (res.statusCode === 200) void garder(espace, cle, JSON.stringify(corps), secondes, lue);
        return envoyer(corps);
      }) as Response['json'];
      next();
    };
  },

  /** Une écriture réussie vide ces espaces avant que la réponse parte : la page relit aussitôt la donnée à jour. */
  ecriture(espaces: string[]): RequestHandler {
    return (req, res, next) => {
      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
      const terminer = res.end.bind(res) as (...valeurs: unknown[]) => Response;
      res.end = ((...valeurs: unknown[]) => {
        if (res.statusCode >= 400) return terminer(...valeurs);
        void Promise.all(espaces.map(vider)).finally(() => terminer(...valeurs));
        return res;
      }) as Response['end'];
      next();
    };
  },

  vider,

  /** Une annonce faite ici (action, tâche) : l'espace est vidé partout. */
  annonceLocale(cle: string): void {
    void vider(espaceDe(cle));
  },

  /** Une annonce venue d'un autre exemplaire : sans Redis, les copies de cette mémoire ne servent plus. */
  annonceDistante(cle: string): void {
    if (client === null) generations.set(espaceDe(cle), generationLocale(espaceDe(cle)) + 1);
  },

  /** Le relais d'une source : la même chose qu'une route, avec la réponse brute de l'API. */
  async relire(espace: string, cle: string): Promise<{ lue: string | null; copie?: string }> {
    const lue = await generation(espace);
    return lue === null ? { lue } : { lue, copie: await lire(espace, cle, lue) };
  },
  garder,

  /**
   * Le magasin des limites de requêtes (« nom » : api, connexion) : dans Redis, les mêmes pour tous les exemplaires ;
   * s'il manque ou tombe, dans la mémoire de ce serveur, sans jamais faire échouer la requête.
   */
  limites(nom: string) {
    let duree = 15 * 60 * 1000;
    const locales = new Map<string, { coups: number; fin: number }>();
    const enMemoire = (cle: string) => {
      const maintenant = Date.now();
      let compte = locales.get(cle);
      if (!compte || compte.fin <= maintenant) {
        compte = { coups: 0, fin: maintenant + duree };
        locales.set(cle, compte);
      }
      compte.coups++;
      if (locales.size > 50_000) for (const [c, v] of locales) if (v.fin <= maintenant) locales.delete(c);
      return { totalHits: compte.coups, resetTime: new Date(compte.fin) };
    };
    const cleRedis = (cle: string) => PREFIXE + 'limite:' + nom + ':' + cle;
    return {
      localKeys: false,
      init(options: { windowMs: number }) {
        duree = options.windowMs;
      },
      async increment(cle: string) {
        if (redisPret()) {
          try {
            const coups = await client!.incr(cleRedis(cle));
            if (coups === 1) await client!.pExpire(cleRedis(cle), duree);
            const reste = await client!.pTTL(cleRedis(cle));
            return { totalHits: coups, resetTime: new Date(Date.now() + (reste > 0 ? reste : duree)) };
          } catch {
            // Redis vient de tomber : la mémoire compte à sa place.
          }
        }
        return enMemoire(cle);
      },
      async decrement(cle: string) {
        const compte = locales.get(cle);
        if (compte && compte.coups > 0) compte.coups--;
        if (redisPret()) await client!.decr(cleRedis(cle)).catch(() => undefined);
      },
      async resetKey(cle: string) {
        locales.delete(cle);
        if (redisPret()) await client!.del(cleRedis(cle)).catch(() => undefined);
      },
    };
  },
};
`;
