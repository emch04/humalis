/**
 * Le cache du serveur produit : « en cache pendant 5 minutes » dans une route, « en cache pendant 30 minutes » dans une
 * source à jeton secret, et « vider le cache de "…" ». Validé avec le mainteneur le 17 novembre 2026 ; revu par Codex
 * le même jour (17 défauts, tous corrigés ici et dans projet.ts).
 *
 * Sans HUMALIS_CACHE_ADRESSE, le cache vit dans la mémoire de chaque exemplaire du serveur, borné en nombre et en
 * octets ; une écriture le vide ici avant de répondre, et chez les autres exemplaires par les annonces de la base. Avec
 * une adresse redis:// ou rediss:// (Redis, Valkey ou un serveur compatible), le cache est partagé par tous les
 * exemplaires, et Redis porte aussi les annonces en direct et les limites de requêtes. La base reste la seule mémoire
 * de référence : Redis ne garde que des copies, et sa panne ne fait que ralentir.
 *
 * Les règles qui gardent les copies justes :
 * - une copie porte la génération de son espace lue avant le calcul : une écriture pendant le calcul la rend caduque ;
 * - une écriture vide les espaces avant que sa réponse parte, et attend aussi les vidages lancés pendant la requête
 *   (une action qui change une autre donnée) ;
 * - un vidage qui n'a pas pu se faire dans Redis arrête toute lecture du cache jusqu'à ce qu'une nouvelle époque
 *   (toutes les copies abandonnées) soit écrite ;
 * - chaque commande Redis a un délai : passé ce délai, Redis est mis de côté quelques secondes.
 */

/** src/humalis/cache.ts */
export const CACHE = String.raw`import type { Request, RequestHandler, Response } from 'express';

/** Un lot de commandes Redis, jouées ensemble (MULTI … EXEC). */
type Lot = { set(cle: string, valeur: string, options: { PX: number; NX: true }): Lot; incr(cle: string): Lot; pTTL(cle: string): Lot; exec(): Promise<unknown[]> };

type Client = {
  isReady: boolean;
  connect(): Promise<unknown>;
  on(evenement: string, faire: (...valeurs: unknown[]) => void): unknown;
  mGet(cles: string[]): Promise<(string | null)[]>;
  get(cle: string): Promise<string | null>;
  set(cle: string, valeur: string, options: { EX: number }): Promise<unknown>;
  incr(cle: string): Promise<number>;
  publish(canal: string, message: string): Promise<number>;
  pExpire(cle: string, millisecondes: number): Promise<unknown>;
  decr(cle: string): Promise<number>;
  del(cle: string): Promise<number>;
  multi(): Lot;
  subscribe(canal: string, faire: (message: string) => void): Promise<unknown>;
  duplicate(): Client;
};

/** Un entier positif lu dans l'environnement, sinon la valeur par défaut. */
const entierPositif = (valeur: string | undefined, defaut: number): number => {
  const n = Number(valeur);
  return Number.isSafeInteger(n) && n >= 1 ? n : defaut;
};
const MAXIMUM = entierPositif(process.env.HUMALIS_CACHE_MAX, 5000);
/** Une réponse plus grosse ne se garde pas (en caractères) ; la mémoire de ce serveur garde au plus OCTETS caractères. */
const TAILLE = entierPositif(process.env.HUMALIS_CACHE_TAILLE, 512 * 1024);
const OCTETS = entierPositif(process.env.HUMALIS_CACHE_OCTETS, 64 * 1024 * 1024);
/** Le délai d'une commande Redis, en millisecondes. */
const DELAI = entierPositif(process.env.HUMALIS_CACHE_DELAI, 500);

/** Le préfixe des clés : un serveur et une base à lui, pour que deux applications (ou deux bases) ne se mélangent pas. */
let PREFIXE = 'humalis:cache:';

// ─── En mémoire ────────────────────────────────────────────────────────────
const generations = new Map<string, number>();
/** Les copies, de la plus ancienne à la plus récente lue : la première part quand la mémoire est pleine. */
const copies = new Map<string, { valeur: string; fin: number; generation: number }>();
let octets = 0;
const generationLocale = (espace: string): number => generations.get(espace) ?? 0;
const oublier = (cle: string): void => {
  const copie = copies.get(cle);
  if (copie) octets -= copie.valeur.length;
  copies.delete(cle);
};

// ─── Dans Redis ────────────────────────────────────────────────────────────
let client: Client | null = null;
let abonne: Client | null = null;
/** Un vidage n'a pas pu se faire dans Redis : aucune lecture du cache tant qu'une nouvelle époque n'est pas écrite. */
let epoqueEnRetard = false;
/** Redis a dépassé son délai : il est mis de côté jusqu'à cet instant. */
let ecarteJusqua = 0;
const abonnements = new Map<string, ((message: string) => void)[]>();
const cleGeneration = (espace: string): string => PREFIXE + 'g:' + espace;
const cleEpoque = (): string => PREFIXE + 'epoque';
const cleCopie = (espace: string, cle: string): string => PREFIXE + 'v:' + espace + ':' + cle;
const redisPret = (): boolean => client !== null && client.isReady && Date.now() >= ecarteJusqua;

/** Une commande Redis bornée dans le temps : au-delà, elle échoue, et Redis est mis de côté cinq secondes. */
function borne<T>(commande: Promise<T>): Promise<T> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_, refuser) => {
    minuteur = setTimeout(() => {
      ecarteJusqua = Date.now() + 5000;
      refuser(new Error('Redis ne répond pas à temps'));
    }, DELAI);
  });
  return Promise.race([commande, delai]).finally(() => clearTimeout(minuteur));
}

/** Écrit une nouvelle époque : toutes les copies d'avant sont abandonnées ; tant qu'elle n'est pas écrite, on réessaie. */
let reparation: ReturnType<typeof setInterval> | undefined;
function essayerReparer(): void {
  if (!epoqueEnRetard || !redisPret()) return;
  borne(client!.incr(cleEpoque())).then(
    () => {
      epoqueEnRetard = false;
      clearInterval(reparation);
      reparation = undefined;
    },
    () => undefined,
  );
}
function reparer(): void {
  epoqueEnRetard = true;
  essayerReparer();
  reparation ??= setInterval(essayerReparer, 1000);
  reparation.unref?.();
}

/** La génération d'un espace, lue avant de calculer la réponse (« époque/génération » avec Redis) ; null : pas de cache. */
async function generation(espace: string): Promise<string | null> {
  if (client === null) return String(generationLocale(espace));
  if (!redisPret() || epoqueEnRetard) return null;
  try {
    const [epoque, g] = await borne(client.mGet([cleEpoque(), cleGeneration(espace)]));
    return (epoque ?? '0') + '/' + (g ?? '0');
  } catch {
    return null;
  }
}

async function lire(espace: string, cle: string, attendue: string): Promise<string | undefined> {
  if (client === null) {
    const nom = espace + '\u0000' + cle;
    const copie = copies.get(nom);
    if (!copie) return undefined;
    if (copie.fin <= Date.now() || String(copie.generation) !== attendue) {
      oublier(nom);
      return undefined;
    }
    // Lue à l'instant : elle passe en dernier, loin de la sortie.
    copies.delete(nom);
    copies.set(nom, copie);
    return copie.valeur;
  }
  if (!redisPret() || epoqueEnRetard) return undefined;
  try {
    const brute = await borne(client.get(cleCopie(espace, cle)));
    if (brute === null) return undefined;
    const copie = JSON.parse(brute) as { g: string; v: string };
    return copie.g === attendue ? copie.v : undefined;
  } catch {
    return undefined;
  }
}

async function garder(espace: string, cle: string, valeur: string, secondes: number, lue: string): Promise<void> {
  if (valeur.length > TAILLE) return;
  if (client === null) {
    if (String(generationLocale(espace)) !== lue) return;
    const nom = espace + '\u0000' + cle;
    oublier(nom);
    while (copies.size > 0 && (copies.size >= MAXIMUM || octets + valeur.length > OCTETS)) oublier(copies.keys().next().value!);
    copies.set(nom, { valeur, fin: Date.now() + secondes * 1000, generation: generationLocale(espace) });
    octets += valeur.length;
    return;
  }
  if (!redisPret() || epoqueEnRetard) return;
  try {
    await borne(client.set(cleCopie(espace, cle), JSON.stringify({ g: lue, v: valeur }), { EX: Math.max(1, Math.round(secondes)) }));
  } catch {
    // Pas de copie : la prochaine lecture repassera par la base.
  }
}

/** Les vidages pas encore finis : une écriture les attend avant de répondre. */
const enCours = new Set<Promise<void>>();

/** Une écriture : les copies de l'espace ne servent plus, ici et sur tous les exemplaires (Redis). */
function vider(espace: string): Promise<void> {
  generations.set(espace, generationLocale(espace) + 1);
  if (client === null) return Promise.resolve();
  const travail = (async () => {
    try {
      if (!redisPret()) throw new Error('Redis absent');
      await borne(client!.incr(cleGeneration(espace)));
    } catch {
      // Le vidage n'a pas pu se faire : plus aucune copie ne sert tant qu'une nouvelle époque n'est pas écrite.
      reparer();
    }
  })();
  enCours.add(travail);
  void travail.finally(() => enCours.delete(travail));
  return travail;
}

/** « livre|boutique-3 » (l'annonce d'un groupe) : l'espace est la donnée. */
const espaceDe = (cle: string): string => cle.split('|')[0]!;

/** L'endroit de la base, sans l'utilisateur, le mot de passe, ni un paramètre secret ; ce qui change de base reste. */
export function lieuDeLaBase(base: string): string {
  const sansIdentite = base.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i, '$1');
  const [debut, requete = ''] = sansIdentite.split('?');
  const gardes = requete
    .split('&')
    .filter((p) => p !== '' && !/pass|secret|key|token|cert|cle/i.test(p.split('=')[0]!))
    .sort();
  return debut + (gardes.length ? '?' + gardes.join('&') : '');
}

let annonceur: ((cle: string) => void) | null = null;

export const cacheHumalis = {
  /**
   * Au démarrage : avec une adresse, Redis ; sinon, la mémoire de ce serveur. « base » (DATABASE_URL) sépare les clés
   * de deux bases. Chaque démarrage abandonne les copies d'avant : un nouveau programme, ou une base restaurée, ne
   * relit jamais une réponse d'avant.
   */
  async brancher(adresse: string | undefined, serveur: string, base: string): Promise<'memoire' | 'redis'> {
    if (!adresse) return 'memoire';
    if (!/^rediss?:\/\//i.test(adresse)) throw new Error('HUMALIS_CACHE_ADRESSE doit commencer par redis:// ou rediss:// (chiffré).');
    PREFIXE = 'humalis:' + serveur + ':' + lieuDeLaBase(base) + ':';
    const { createClient } = await import('redis');
    const reconnecter = (essais: number): number => Math.min(200 * 2 ** essais, 5000);
    // Sans file d'attente : quand Redis manque, une commande échoue tout de suite et la lecture repasse par la base.
    client = createClient({ url: adresse, disableOfflineQueue: true, socket: { reconnectStrategy: reconnecter, connectTimeout: 3000 } }) as unknown as Client;
    // Une nouvelle époque dès que Redis répond : les copies d'avant ce démarrage ne servent plus.
    reparer();
    let signale = false;
    client.on('error', (erreur) => {
      if (signale) return;
      signale = true;
      console.warn('Cache : Redis ne répond pas (' + (erreur instanceof Error ? erreur.message : String(erreur)) + ') ; les lectures repassent par la base.');
    });
    client.on('ready', () => {
      if (signale) console.log('Cache : Redis répond de nouveau.');
      signale = false;
      essayerReparer();
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
    await borne(client!.publish(canal, message));
  },

  /** Les annonces reçues par Redis (branchées avant ou après le démarrage). */
  abonner(canal: string, faire: (message: string) => void): void {
    const liste = abonnements.get(canal) ?? [];
    liste.push(faire);
    abonnements.set(canal, liste);
    if (abonne?.isReady && liste.length === 1) void abonne.subscribe(canal, (message) => { for (const f of abonnements.get(canal) ?? []) f(message); }).catch(() => undefined);
  },

  /** Les annonces du serveur (« direct.annonce ») : un vidage fait à la main prévient aussi les autres exemplaires. */
  relierAnnonces(annoncer: (cle: string) => void): void {
    annonceur = annoncer;
  },

  /**
   * La lecture d'une route en cache, placée après la garde des droits. « variante » sépare ce qui dépend de la
   * personne ; « parametres » : les seuls paramètres de l'adresse que la route comprend (les autres ne font pas une
   * nouvelle copie). Une lecture rejouée à l'intérieur du serveur (la synchronisation) ne passe pas par le cache.
   */
  lecture(espace: string, secondes: number, variante: (req: Request) => string = () => '', parametres: readonly string[] = []): RequestHandler {
    return async (req, res, next) => {
      if (req.method !== 'GET' || typeof res.type !== 'function' || typeof res.json !== 'function') return next();
      const requete = Object.entries(req.query as Record<string, unknown>)
        .filter(([nom, valeur]) => parametres.includes(nom) && typeof valeur === 'string')
        .map(([nom, valeur]) => encodeURIComponent(nom) + '=' + encodeURIComponent(valeur as string))
        .sort();
      const cle = variante(req) + ' ' + req.baseUrl + req.path + (requete.length ? '?' + requete.join('&') : '');
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

  /**
   * Une écriture vide ces espaces avant que la réponse parte, qu'elle réussisse ou non (une création liée défaite
   * après un échec), et attend aussi les vidages lancés pendant la requête : la page relit aussitôt la donnée à jour.
   */
  ecriture(espaces: readonly string[] = []): RequestHandler {
    return (req, res, next) => {
      if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS' || typeof res.end !== 'function') return next();
      const terminer = res.end.bind(res) as (...valeurs: unknown[]) => Response;
      res.end = ((...valeurs: unknown[]) => {
        void Promise.all([...espaces.map(vider), ...enCours]).finally(() => terminer(...valeurs));
        return res;
      }) as Response['end'];
      next();
    };
  },

  vider,

  /** « vider le cache de "…" », une écriture par la passerelle : ici, dans Redis, et chez les autres exemplaires. */
  async viderPartout(espace: string): Promise<void> {
    await vider(espace);
    annonceur?.(espace);
  },

  /** Une annonce faite ici (action, tâche, suppression de compte) : l'espace est vidé partout. */
  annonceLocale(cle: string): void {
    void vider(espaceDe(cle));
  },

  /**
   * Une annonce venue d'un autre exemplaire : les copies de cette mémoire ne servent plus, et dans Redis l'espace est
   * vidé aussi (l'autre exemplaire n'a peut-être pas pu le faire, s'il avait perdu Redis).
   */
  annonceDistante(cle: string): void {
    if (client === null) generations.set(espaceDe(cle), generationLocale(espaceDe(cle)) + 1);
    else void vider(espaceDe(cle));
  },

  /** Le relais d'une source : la même chose qu'une route, avec la réponse brute de l'API. */
  async relire(espace: string, cle: string): Promise<{ lue: string | null; copie?: string }> {
    const lue = await generation(espace);
    return lue === null ? { lue } : { lue, copie: await lire(espace, cle, lue) };
  },
  garder,

  /**
   * Le magasin des limites de requêtes (« nom » : api, connexion) : dans Redis, les mêmes pour tous les exemplaires ;
   * s'il manque ou tombe, dans la mémoire de ce serveur, sans jamais faire échouer la requête. Le compteur et son
   * expiration s'écrivent ensemble : une panne entre les deux ne laisse jamais un compteur sans fin.
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
      // Chaque magasin a son préfixe : le limiteur de @astratra/security distingue alors celui des requêtes et celui des connexions,
      // qui comptent tous deux une connexion (« compté deux fois » n'était qu'une confusion entre les deux).
      prefix: 'humalis:limite:' + nom + ':',
      init(options: { windowMs: number }) {
        duree = options.windowMs;
      },
      async increment(cle: string) {
        if (redisPret()) {
          try {
            const [, coups, reste] = (await borne(client!.multi().set(cleRedis(cle), '0', { PX: duree, NX: true }).incr(cleRedis(cle)).pTTL(cleRedis(cle)).exec())) as [unknown, number, number];
            // Un compteur d'avant sans expiration : il la reçoit.
            if (reste < 0) await borne(client!.pExpire(cleRedis(cle), duree));
            return { totalHits: Number(coups), resetTime: new Date(Date.now() + (reste > 0 ? reste : duree)) };
          } catch {
            // Redis vient de tomber : la mémoire compte à sa place.
          }
        }
        return enMemoire(cle);
      },
      async decrement(cle: string) {
        const compte = locales.get(cle);
        if (compte && compte.coups > 0) compte.coups--;
        if (redisPret()) await borne(client!.decr(cleRedis(cle))).catch(() => undefined);
      },
      async resetKey(cle: string) {
        locales.delete(cle);
        if (redisPret()) await borne(client!.del(cleRedis(cle))).catch(() => undefined);
      },
    };
  },
};
`;
