/**
 * Les sources (API existantes) dans le code web produit : le fichier
 * `src/humalis/sources.ts` (adresse, enveloppe, en-têtes, jeton public…) et
 * le moteur d'appel ajouté à `src/humalis/serveur.ts` (réessais, délai,
 * cache, messages). Sans source dans le programme, rien de tout cela n'est
 * écrit : le code produit reste celui d'avant, à l'octet.
 */
import type { Application, SourceRI } from '../../ri/types.js';
import { chaine } from './noms.js';

/** Le nom de la variable d'environnement qui change l'adresse d'une source (une adresse n'est pas un secret). */
export const variableDAdresse = (source: SourceRI, prefixe: 'VITE' | 'EXPO_PUBLIC'): string =>
  `${prefixe}_HUMALIS_SOURCE_${source.nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`;

/** `src/humalis/sources.ts` : la description de chaque source, lue par le moteur d'appel. */
export function sourcesTs(application: Application): string {
  const lignes = application.sources.map((s) => {
    const entetes = s.entetes.length > 0 ? `{ ${s.entetes.map((e) => `${chaine(e.nom)}: ${chaine(e.valeur)}`).join(', ')} }` : '{}';
    const jeton = s.jetonPublic
      ? `{ valeur: ${chaine(s.jetonPublic.valeur)}, place: ${JSON.stringify(s.jetonPublic.place)} }`
      : 'undefined';
    return `  ${chaine(s.nom)}: {
    base: import.meta.env.${variableDAdresse(s, 'VITE')} ?? ${chaine(s.adresse.replace(/\/+$/, ''))},
    session: ${s.session},
    enveloppe: ${s.enveloppe !== undefined ? chaine(s.enveloppe) : 'undefined'},
    erreur: ${s.erreurDans !== undefined ? chaine(s.erreurDans) : 'undefined'},
    entetes: ${entetes},
    jeton: ${jeton},
    essais: ${s.essais ?? 2},
    delai: ${s.delai ?? 10},
    cache: ${s.cache ?? 0},
  },`;
  });
  return `// Produit par Humalis : les API que les pages appellent (blocs « source »).
// Une adresse se change avec une variable d'environnement ; un jeton public part
// dans le code envoyé au navigateur : un secret n'est jamais écrit ici.

export interface ConfigSource {
  base: string;
  /** Les cookies de session et le jeton CSRF des packs voyagent avec les appels. */
  session: boolean;
  /** Le chemin de la valeur utile dans la réponse (« data »). */
  enveloppe?: string;
  /** Le chemin du message d'une erreur (« message »). */
  erreur?: string;
  entetes: Record<string, string>;
  jeton?: { valeur: string; place: { genre: 'autorisation' } | { genre: 'entete' | 'parametre'; nom: string } };
  essais: number;
  /** Secondes. */
  delai: number;
  /** Secondes ; 0 : pas de cache. */
  cache: number;
}

/** Ce qu'une page précise pour un appel : la source, les paramètres d'adresse, la valeur utile. */
export interface AppelSource {
  source: string;
  filtres?: Record<string, unknown>;
  dans?: string;
  /** Une modification qui remplace tout (PUT) au lieu de changer des champs (PATCH). */
  remplacement?: boolean;
  /** « recharger » : ignorer le cache. */
  contourner?: boolean;
  /** Ce que fait le bouton « Réessayer » du message d'erreur. */
  relancer?: () => void;
  /** Reçoit l'état de la requête (la page lit « produits est en chargement »). */
  suivi?: (etat: EtatRequete) => void;
  /** La page parle elle-même de l'erreur : pas de message automatique. */
  silencieux?: boolean;
}

/** L'état de la requête qui remplit une variable. */
export interface EtatRequete {
  statut: 'repos' | 'chargement' | 'erreur' | 'introuvable';
  /** Le message d'une erreur (vide sinon). */
  message: string;
}

export const REPOS: EtatRequete = { statut: 'repos', message: '' };

export const SOURCES: Record<string, ConfigSource> = {
${lignes.join('\n')}
};
`;
}

const MOTEUR = `
  // Les API existantes (« de la source ») : réessais des lectures, délai, cache, messages.
  const cache = cacheDesSources;

  async function appelerSource<T>(adresse: string, options: RequestInit, actuelle: T, appel: AppelSource): Promise<T> {
    const source = SOURCES[appel.source];
    const lecture = options.method === 'GET';
    appel.suivi?.({ statut: 'chargement', message: '' });
    try {
      const parametres = new URLSearchParams();
      // Une valeur absente n'est pas envoyée : un filtre vide ne fait pas « ?categorie=null ».
      for (const [cle, valeur] of Object.entries(appel.filtres ?? {})) {
        if (valeur !== null && valeur !== undefined && valeur !== '') parametres.set(cle, String(valeur));
      }
      if (source.jeton?.place.genre === 'parametre') parametres.set(source.jeton.place.nom, source.jeton.valeur);
      const chemin = adresse.replace(/^\\/+/, '');
      const url = \`\${source.base}/\${chemin}\${parametres.size > 0 ? \`?\${parametres}\` : ''}\`;
      const entetes = new Headers(options.headers);
      for (const [nom, valeur] of Object.entries(source.entetes)) entetes.set(nom, valeur);
      if (source.jeton?.place.genre === 'autorisation') entetes.set('Authorization', \`Bearer \${source.jeton.valeur}\`);
      if (source.jeton?.place.genre === 'entete') entetes.set(source.jeton.place.nom, source.jeton.valeur);
      // Les envois portent le jeton CSRF des packs (cookie astratra_csrf), pour une source qui donne la session.
      const csrf = document.cookie.match(/(?:^|; )astratra_csrf=([^;]*)/)?.[1];
      if (source.session && !lecture && csrf) entetes.set('x-csrf-token', decodeURIComponent(csrf));

      const cle = \`\${source.session ? 'session' : 'public'} \${url}\`;
      if (lecture && source.cache > 0 && !appel.contourner) {
        const garde = cache.valeurs.get(cle);
        if (garde && garde.fin > Date.now()) return extraire(garde.valeur, source, appel, actuelle);
      }
      // Deux lectures identiques en même temps ne font qu'un seul appel.
      let attente = lecture && !appel.contourner ? cache.enCours.get(cle) : undefined;
      if (!attente) {
        attente = executer(url, options, entetes, source, lecture);
        if (lecture) {
          cache.enCours.set(cle, attente);
          void attente.then(
            (valeur) => {
              cache.enCours.delete(cle);
              if (source.cache > 0) cache.valeurs.set(cle, { valeur, fin: Date.now() + source.cache * 1000 });
            },
            () => cache.enCours.delete(cle),
          );
        }
      }
      const brut = await attente;
      // Un envoi réussi vide les réponses gardées de cette source : elles ont peut-être changé.
      if (!lecture) cache.vider(source.base);
      appel.suivi?.(REPOS);
      return extraire(brut, source, appel, actuelle);
    } catch (erreur) {
      const message = messageDeLErreur(erreur);
      appel.suivi?.({ statut: erreur instanceof ErreurSource && erreur.code === 404 ? 'introuvable' : 'erreur', message });
      // Si la page parle de l'erreur, elle la montre à sa façon : Humalis se tait.
      if (!appel.silencieux) afficherMessage(message, 'erreur', appel.relancer);
      return actuelle;
    }
  }
`;

const FICHIER_MOTEUR = `
/** Une réponse refusée : son code, et le message de l'API quand la source dit où le lire. */
class ErreurSource extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

const cacheDesSources = {
  valeurs: new Map<string, { valeur: unknown; fin: number }>(),
  enCours: new Map<string, Promise<unknown>>(),
  /** Vide les réponses gardées dont l'adresse commence par cette base (après un envoi). */
  vider(base: string) {
    for (const cle of [...this.valeurs.keys()]) if (cle.split(' ')[1].startsWith(base)) this.valeurs.delete(cle);
  },
};

/** L'identifiant d'une donnée dans l'adresse : à la place de « :id », sinon à la fin. */
const avecId = (adresse: string, id: string) =>
  adresse.includes(':id') ? adresse.replace(':id', encodeURIComponent(id)) : adresse + '/' + encodeURIComponent(id);

const attendre = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Suit un chemin (« data.liste ») dans une réponse. */
function suivre(valeur: unknown, chemin?: string): unknown {
  if (!chemin) return valeur;
  return chemin.split('.').reduce<unknown>((courant, cle) => (courant !== null && typeof courant === 'object' ? (courant as Record<string, unknown>)[cle] : undefined), valeur);
}

/** L'appel, avec ses réessais : seules les lectures sont rejouées (un envoi rejoué pourrait commander deux fois). */
async function executer(url: string, options: RequestInit, entetes: Headers, source: ConfigSource, lecture: boolean): Promise<unknown> {
  const essais = lecture ? source.essais : 0;
  for (let tentative = 0; ; tentative++) {
    const controle = new AbortController();
    const minuteur = setTimeout(() => controle.abort(), source.delai * 1000);
    try {
      const reponse = await fetch(url, { ...options, headers: entetes, credentials: source.session ? 'include' : 'omit', redirect: 'follow', signal: controle.signal });
      const texte = await reponse.text();
      const corps: unknown = texte === '' ? undefined : (() => { try { return JSON.parse(texte); } catch { return undefined; } })();
      if (reponse.ok) return corps;
      if (tentative < essais && [429, 502, 503, 504].includes(reponse.status)) {
        const pause = Number(reponse.headers.get('Retry-After'));
        await attendre(pause > 0 ? Math.min(pause, 10) * 1000 : tentative === 0 ? 500 : 1500);
        continue;
      }
      const message = suivre(corps, source.erreur);
      throw new ErreurSource(reponse.status, typeof message === 'string' ? message : '');
    } catch (erreur) {
      if (erreur instanceof ErreurSource) throw erreur;
      // Coupure du réseau ou délai dépassé : une lecture est rejouée.
      if (tentative < essais) {
        await attendre(tentative === 0 ? 500 : 1500);
        continue;
      }
      throw erreur;
    } finally {
      clearTimeout(minuteur);
    }
  }
}

/** La valeur utile : sous l'enveloppe de la source, puis sous le chemin de la route. */
function extraire<T>(brut: unknown, source: ConfigSource, appel: AppelSource, actuelle: T): T {
  if (brut === undefined) return actuelle;
  const valeur = suivre(suivre(brut, source.enveloppe), appel.dans);
  if (valeur === undefined || valeur === null) return actuelle;
  // On attendait une liste et on reçoit autre chose : la valeur actuelle est gardée.
  return (Array.isArray(actuelle) && !Array.isArray(valeur) ? actuelle : valeur) as T;
}

/** Le message à montrer : celui de l'API pour un refus, sinon un texte clair selon le code. */
function messageDeLErreur(erreur: unknown): string {
  if (erreur instanceof ErreurSource) {
    if (erreur.code === 429) return 'Trop de demandes en peu de temps. Patientez un moment, puis réessayez.';
    if (erreur.code === 401) return 'Connectez-vous pour continuer.';
    if (erreur.message !== '' && erreur.code >= 400 && erreur.code < 500) return erreur.message;
    if (erreur.code === 404) return "Ce que vous cherchez n'existe pas.";
  }
  return "Le serveur n'a pas répondu. Réessayez dans un instant.";
}
`;

/** Le modèle de `serveur.ts` avec le moteur des sources ajouté. */
export function serveurAvecSources(modele: string): string {
  const remplacer = (texte: string, avant: string, apres: string) => {
    if (!texte.includes(avant)) throw new Error(`modèle du serveur inattendu : ${avant}`);
    return texte.replace(avant, apres);
  };
  let texte = modele;
  texte = remplacer(texte, "import { useMessages } from './messages';\n", "import { useMessages } from './messages';\nimport { SOURCES, REPOS, type AppelSource, type ConfigSource } from './sources';\n");
  texte = remplacer(texte, '\n/**\n * Les requêtes (« envoyer requete »)', `${FICHIER_MOTEUR}\n/**\n * Les requêtes (« envoyer requete »)`);
  texte = remplacer(texte, '\n  // Avec une valeur actuelle, la réponse a son type', `${MOTEUR}\n  // Avec une valeur actuelle, la réponse a son type`);
  texte = remplacer(
    texte,
    "    lire: (adresse: string, actuelle?: unknown) => appeler(adresse, { method: 'GET' }, actuelle),",
    "    lire: (adresse: string, actuelle?: unknown, appel?: AppelSource) =>\n      appel ? appelerSource(adresse, { method: 'GET' }, actuelle, appel) : appeler(adresse, { method: 'GET' }, actuelle),",
  );
  texte = remplacer(
    texte,
    "    lireUn: (adresse: string, id: string, actuelle?: unknown) =>\n      appeler(`${adresse}/${encodeURIComponent(id)}`, { method: 'GET' }, actuelle),",
    "    lireUn: (adresse: string, id: string, actuelle?: unknown, appel?: AppelSource) =>\n      appel\n        ? appelerSource(avecId(adresse, id), { method: 'GET' }, actuelle, appel)\n        : appeler(`${adresse}/${encodeURIComponent(id)}`, { method: 'GET' }, actuelle),",
  );
  texte = remplacer(
    texte,
    "    envoyer: (adresse: string, donnees: Record<string, unknown>, actuelle?: unknown) =>\n      appeler(\n        adresse,\n        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(donnees) },\n        actuelle,\n      ),",
    "    envoyer: (adresse: string, donnees: Record<string, unknown>, actuelle?: unknown, appel?: AppelSource) => {\n      const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(donnees) };\n      return appel ? appelerSource(adresse, options, actuelle, appel) : appeler(adresse, options, actuelle);\n    },",
  );
  texte = remplacer(
    texte,
    "    supprimer: (adresse: string, id: string) =>\n      appeler(`${adresse}/${encodeURIComponent(id)}`, { method: 'DELETE' }, undefined),",
    "    supprimer: (adresse: string, id: string, appel?: AppelSource) =>\n      appel\n        ? appelerSource(avecId(adresse, id), { method: 'DELETE' }, undefined, appel)\n        : appeler(`${adresse}/${encodeURIComponent(id)}`, { method: 'DELETE' }, undefined),",
  );
  texte = remplacer(
    texte,
    "    modifier: (adresse: string, id: string, donnees: Record<string, unknown>) =>\n      appeler(\n        `${adresse}/${encodeURIComponent(id)}`,\n        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(donnees) },\n        undefined,\n      ),",
    "    modifier: (adresse: string, id: string, donnees: Record<string, unknown>, appel?: AppelSource) =>\n      appel\n        ? appelerSource(avecId(adresse, id), { method: appel.remplacement ? 'PUT' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(donnees) }, undefined, appel)\n        : appeler(\n            `${adresse}/${encodeURIComponent(id)}`,\n            { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(donnees) },\n            undefined,\n          ),",
  );
  texte = remplacer(texte, '  supprimer(adresse: string, id: string): Promise<unknown>;\n  modifier(adresse: string, id: string, donnees: Record<string, unknown>): Promise<unknown>;\n', '  supprimer(adresse: string, id: string, appel?: AppelSource): Promise<unknown>;\n  modifier(adresse: string, id: string, donnees: Record<string, unknown>, appel?: AppelSource): Promise<unknown>;\n');
  texte = remplacer(texte, '  lire<T>(adresse: string, actuelle: T): Promise<T>;\n  lire(adresse: string): Promise<unknown>;\n  lireUn<T>(adresse: string, id: string, actuelle: T): Promise<T>;\n  envoyer<T>(adresse: string, donnees: Record<string, unknown>, actuelle: T): Promise<T>;\n  envoyer(adresse: string, donnees: Record<string, unknown>): Promise<unknown>;\n',
    '  lire<T>(adresse: string, actuelle: T, appel?: AppelSource): Promise<T>;\n  lire(adresse: string, actuelle?: undefined, appel?: AppelSource): Promise<unknown>;\n  lireUn<T>(adresse: string, id: string, actuelle: T, appel?: AppelSource): Promise<T>;\n  envoyer<T>(adresse: string, donnees: Record<string, unknown>, actuelle: T, appel?: AppelSource): Promise<T>;\n  envoyer(adresse: string, donnees: Record<string, unknown>, actuelle?: undefined, appel?: AppelSource): Promise<unknown>;\n');
  return texte;
}

/**
 * La session d'une source (`session astratra`) : /auth/login, /auth/me et /auth/logout
 * sont ceux de l'API, à l'adresse de la source, avec ses cookies.
 */
export function sessionDeLaSource(modele: string, source: SourceRI): string {
  if (!modele.includes("const BASE = import.meta.env.VITE_HUMALIS_SERVEUR ?? '';")) throw new Error('modèle de la session inattendu : BASE');
  return modele
    .replace(
      "const BASE = import.meta.env.VITE_HUMALIS_SERVEUR ?? '';",
      `const BASE = import.meta.env.${variableDAdresse(source, 'VITE')} ?? ${chaine(source.adresse.replace(/\/+$/, ''))};`,
    )
    .replaceAll("credentials: 'same-origin'", "credentials: 'include'");
}
