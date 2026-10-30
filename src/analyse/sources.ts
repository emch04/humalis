/**
 * Les vérifications des blocs « source » : l'adresse,
 * les doublons, la session, les jetons (un secret ne part jamais dans le
 * navigateur), les données et les routes.
 */
import type { ActionDonnee, Donnee, RegleSource, Requete, RouteSource, Serveur, Source } from '../parser/ast.js';
import { listeDe, type TypeValeur } from './types.js';
import type { Diagnostic } from './erreurs.js';
import { proposerNom } from './suggestions.js';

/** Ce que l'analyse retient de chaque source, pour vérifier les requêtes qui la visent. */
export interface InfoSource {
  source: Source;
  /** Le nom d'une donnée de la source → la clé sous laquelle l'analyse la connaît. */
  cles: Map<string, string>;
}

/** Les noms d'en-tête qui identifient : leur valeur écrite voyagerait jusqu'au navigateur. */
const ENTETES_IDENTIFICATION = /^(authorization|cookie|proxy-authorization|x-api-key|x-auth-token|x-access-token|api-key|apikey|x-csrf-token)$/i;

/** Les formes de secrets qui se reconnaissent : une aide, pas une garantie. */
const FORMES_DE_SECRET: RegExp[] = [
  /\bsk_(live|test)_/i,
  /\bsk-[A-Za-z0-9]{16,}/,
  /\bghp_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_/,
  /\bxox[abprs]-/,
  /\bAKIA[0-9A-Z]{12,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\brk_live_/,
];

export const ressembleAUnSecret = (valeur: string): boolean => FORMES_DE_SECRET.some((forme) => forme.test(valeur));

/** Le chemin d'une route sans barre au début : « /api/shop » et « api/shop » sont la même. */
export const cheminSource = (adresse: string): string => adresse.replace(/^\/+/, '').replace(/\/+$/, '');

export function analyserSources(sources: Source[], serveurs: Serveur[], diagnostics: Diagnostic[]): void {
  const erreur = (message: string, ligne: number) => diagnostics.push({ gravite: 'erreur', message, ligne });
  const avertissement = (message: string, ligne: number) => diagnostics.push({ gravite: 'avertissement', message, ligne });

  const vues = new Map<string, Source>();
  const quiDonneLaSession: Source[] = [];
  for (const source of sources) {
    const deja = vues.get(source.nom);
    if (deja) erreur(`la source « ${source.nom} » est déjà déclarée à la ligne ${deja.ligne}.`, source.ligne);
    vues.set(source.nom, source);
    if (source.session) quiDonneLaSession.push(source);

    if (source.adresse === undefined) {
      erreur(`la source « ${source.nom} » n'a pas d'adresse. Écrivez adresse "https://…".`, source.ligne);
    }

    // Les données et leurs champs.
    const donnees = new Map<string, Donnee>();
    for (const donnee of source.donnees) {
      if (donnees.has(donnee.nom)) erreur(`la donnée « ${donnee.nom} » est déjà déclarée dans la source « ${source.nom} » (ligne ${donnees.get(donnee.nom)!.ligne}).`, donnee.ligne);
      donnees.set(donnee.nom, donnee);
      const champs = new Set<string>();
      for (const champ of donnee.champs) {
        let t = champ.type;
        while (t.genre === 'liste') t = t.de;
        if (t.genre === 'donnee' && !source.donnees.some((d) => d.nom === t.nom || d.cle === t.nom)) {
          erreur(`le champ « ${champ.nom} » parle de « ${t.nom} », qui n'est ni un type (texte, nombre, booleen, date) ni une donnée de la source « ${source.nom} ». Données : ${source.donnees.map((d) => d.nom).join(', ')}.`, champ.ligne);
        }
        if (champs.has(champ.nom)) erreur(`le champ « ${champ.nom} » est déjà déclaré dans la donnée « ${donnee.nom} ».`, champ.ligne);
        champs.add(champ.nom);
      }
    }

    // Les en-têtes fixes sont publics.
    for (const entete of source.entetes) {
      if (ENTETES_IDENTIFICATION.test(entete.nom)) {
        erreur(
          `un en-tête « ${entete.nom} » avec une valeur écrite voyagerait jusqu'au navigateur : déclarez un jeton (jeton public "…" ou jeton secret depuis l'environnement "…").`,
          entete.ligne,
        );
      } else if (ressembleAUnSecret(entete.valeur)) {
        erreur(`la valeur de l'en-tête « ${entete.nom} » ressemble à un secret : elle serait lisible par tout le monde.`, entete.ligne);
      }
    }

    // Les jetons.
    const jeton = source.jeton;
    if (jeton?.genre === 'public' && ressembleAUnSecret(jeton.valeur)) {
      erreur(
        `cette valeur ressemble à un secret : elle serait lisible par tout le monde. Un jeton public est fait pour être vu ; pour un secret, écrivez jeton secret depuis l'environnement "NOM".`,
        jeton.ligne,
      );
    }
    if (jeton?.genre === 'secret') {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(jeton.valeur)) {
        erreur(
          `« ${jeton.valeur} » n'est pas un nom de variable d'environnement (lettres, chiffres et _, comme METEO_CLE). La valeur du secret ne s'écrit jamais ici.`,
          jeton.ligne,
        );
      }
      if (serveurs.length === 0) {
        erreur(
          `la source « ${source.nom} » a un jeton secret, qui ne peut pas partir dans le navigateur. Ajoutez un bloc serveur "…" : il fera l'appel à la place du navigateur.`,
          jeton.ligne,
        );
      } else {
        // La passerelle du serveur produit n'est pas encore écrite : on ne laisse pas croire qu'elle l'est.
        erreur(
          `le jeton secret de la source « ${source.nom} » passera par le serveur, mais cette passerelle n'est pas encore disponible. Le secret n'est écrit nulle part : rien n'est produit.`,
          jeton.ligne,
        );
      }
    }

    // Les routes.
    const adresses = new Map<string, RouteSource>();
    for (const route of source.routes) {
      const deja = adresses.get(cheminSource(route.adresse));
      if (deja) erreur(`la route « ${route.adresse} » est déjà déclarée dans la source « ${source.nom} » (ligne ${deja.ligne}).`, route.ligne);
      adresses.set(cheminSource(route.adresse), route);
      for (const regle of route.regles) {
        if (!donnees.has(regle.donnee)) {
          erreur(
            `la donnée « ${regle.donnee} » n'existe pas dans la source « ${source.nom} ». Données : ${[...donnees.keys()].join(', ') || 'aucune'}.${proposerNom(regle.donnee, donnees.keys())}`,
            regle.ligne,
          );
        }
        if (regle.qui !== undefined && jeton?.genre !== 'secret') {
          erreur(
            `« qui peut » n'a de sens que pour une source à jeton secret, où le serveur Humalis est la porte. Pour « ${source.nom} », c'est l'API qui décide qui peut.`,
            regle.ligne,
          );
        }
        if (regle.qui === undefined && jeton?.genre === 'secret') {
          erreur(
            `la route « ${route.adresse} » passe par le serveur (jeton secret) : écrivez qui peut l'appeler (tout le monde peut …, connecte peut …, seul admin peut …).`,
            regle.ligne,
          );
        }
      }
    }
  }

  if (quiDonneLaSession.length > 1) {
    for (const source of quiDonneLaSession.slice(1)) {
      erreur(`une seule source peut donner la session ; « ${quiDonneLaSession[0].nom} » et « ${source.nom} » le demandent.`, source.ligne);
    }
  }
  if (quiDonneLaSession.length > 0 && serveurs.length > 0) {
    erreur(`la source « ${quiDonneLaSession[0].nom} » donne la session, mais le serveur « ${serveurs[0].nom} » la donne déjà : une seule des deux.`, quiDonneLaSession[0].ligne);
  }
  for (const source of sources) {
    if (source.jeton?.genre === 'public' && source.adresse?.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(source.adresse)) {
      avertissement(`la source « ${source.nom} » envoie un jeton en clair (adresse en http://) : utilisez https://.`, source.ligne);
    }
  }
}

/**
 * Pour chaque source, la clé de ses données dans l'analyse : le nom lui-même,
 * ou « source.nom » si un serveur (ou une autre source) a déjà une donnée de ce nom.
 */
export function indexerSources(sources: Source[], donneesConnues: Map<string, Donnee>): Map<string, InfoSource> {
  const infos = new Map<string, InfoSource>();
  for (const source of sources) {
    if (infos.has(source.nom)) continue;
    const cles = new Map<string, string>();
    for (const donnee of source.donnees) {
      // Une donnée qui porte le nom d'une autre (d'un serveur ou d'une autre source) est connue sous « source_donnee ».
      const cle = donneesConnues.has(donnee.nom) ? `${source.nom}_${donnee.nom}`.replace(/[^A-Za-z0-9_]/g, '_') : donnee.nom;
      donneesConnues.set(cle, donnee);
      donnee.cle = cle;
      cles.set(donnee.nom, cle);
    }
    // Un champ qui est une autre donnée de la source la désigne par sa clé.
    const versLaCle = (type: import('../parser/ast.js').TypeChamp): void => {
      if (type.genre === 'liste') versLaCle(type.de);
      else if (type.genre === 'donnee') type.nom = cles.get(type.nom) ?? type.nom;
    };
    for (const donnee of source.donnees) for (const champ of donnee.champs) versLaCle(champ.type);
    infos.set(source.nom, { source, cles });
  }
  return infos;
}

/** La route d'une source qui porte cette adresse. */
export function routeDeSource(source: Source, adresse: string): RouteSource | undefined {
  return source.routes.find((r) => cheminSource(r.adresse) === cheminSource(adresse));
}

/** La règle d'une route pour une action (liste ou un seul élément). */
export function regleDeRoute(route: RouteSource, action: ActionDonnee, liste?: boolean): RegleSource | undefined {
  return route.regles.find((r) => r.action === action && (liste === undefined || r.liste === liste));
}

/**
 * Une requête vers une source : la source et la route doivent exister, la
 * route doit dire qu'elle permet cette action. Rend le type de la réponse
 * (liste d'une donnée, ou une donnée), ou undefined si rien n'est connu.
 */
export function verifierRequeteSource(
  requete: Requete,
  sources: Map<string, InfoSource>,
  parUnId: boolean,
  erreur: (message: string, ligne: number) => void,
): { type?: TypeValeur; regle?: RegleSource } | undefined {
  if (requete.source === undefined) {
    erreur('« filtrant par » demande la source visée : envoyer requete vers "…" de la source "nom" filtrant par …', requete.ligne);
    return undefined;
  }
  const info = sources.get(requete.source);
  if (!info) {
    erreur(`aucune source « ${requete.source} ». Sources : ${[...sources.keys()].join(', ') || 'aucune'}.${proposerNom(requete.source, sources.keys())}`, requete.ligne);
    return undefined;
  }
  if (requete.filtrant && requete.donnees.length > 0) {
    erreur("une requête ne lit et n'envoie pas à la fois : « filtrant par » sert à lire, « avec » à envoyer.", requete.ligne);
  }
  // Pas de route déclarée : tout reste permis, non vérifié.
  if (info.source.routes.length === 0) return undefined;
  const route = routeDeSource(info.source, requete.adresse);
  if (!route) {
    erreur(
      `aucune route « ${requete.adresse} » dans la source « ${info.source.nom} ». Routes : ${info.source.routes.map((r) => r.adresse).join(', ')}.`,
      requete.ligne,
    );
    return undefined;
  }
  const envoi = requete.donnees.length > 0 && !parUnId;
  const regle = envoi ? regleDeRoute(route, 'creer') : parUnId ? regleDeRoute(route, 'lire', false) : regleDeRoute(route, 'lire', true);
  if (!regle) {
    const attendu = envoi ? 'creer …' : parUnId ? 'lire un …' : 'lire une liste de …';
    erreur(`la route « ${route.adresse} » de la source « ${info.source.nom} » ne dit pas « ${attendu} » : la requête n'est pas permise.`, requete.ligne);
    return undefined;
  }
  const cle = info.cles.get(regle.donnee);
  if (cle === undefined) return { regle };
  const donnee: TypeValeur = { genre: 'donnee', nom: cle };
  return { type: regle.liste ? listeDe(donnee) : donnee, regle };
}


/**
 * « supprimer p de "…" de la source "x" » et « modifier p dans "…" de la source "x" » :
 * la source et la route existent, la route permet l'action, et l'objet est
 * une donnée de cette route. Rend la règle trouvée.
 */
export function verifierOperationSource(
  operation: { type: 'Suppression' | 'Modification'; source?: string; adresse: string; ligne: number },
  sources: Map<string, InfoSource>,
  typeObjet: TypeValeur,
  erreur: (message: string, ligne: number) => void,
): RegleSource | undefined {
  const verbe = operation.type === 'Suppression' ? 'supprimer' : 'modifier';
  const info = sources.get(operation.source ?? '');
  if (!info) {
    erreur(`aucune source « ${operation.source} ». Sources : ${[...sources.keys()].join(', ') || 'aucune'}.${proposerNom(operation.source ?? '', sources.keys())}`, operation.ligne);
    return undefined;
  }
  if (info.source.routes.length === 0) return undefined;
  const route = routeDeSource(info.source, operation.adresse);
  if (!route) {
    erreur(`aucune route « ${operation.adresse} » dans la source « ${info.source.nom} ». Routes : ${info.source.routes.map((r) => r.adresse).join(', ')}.`, operation.ligne);
    return undefined;
  }
  const regle = regleDeRoute(route, verbe === 'supprimer' ? 'supprimer' : 'modifier');
  if (!regle) {
    erreur(`la route « ${route.adresse} » de la source « ${info.source.nom} » ne dit pas « ${verbe} … » : l'action n'est pas permise.`, operation.ligne);
    return undefined;
  }
  const cle = info.cles.get(regle.donnee);
  if (cle !== undefined && typeObjet.genre !== 'inconnu' && !(typeObjet.genre === 'donnee' && typeObjet.nom === cle)) {
    erreur(`« ${verbe} » attend un « ${regle.donnee} » lu sur cette route (par exemple la variable d'une boucle « pour chaque p dans … »).`, operation.ligne);
  }
  return regle;
}
