import { VERSIONS_SERVEUR } from './cibles/serveur/projet.js';
import { VERSIONS } from './cibles/web/projet.js';

/**
 * Les packs Astratra que les applications produites utilisent, avec la
 * version exacte épinglée par le compilateur. Les versions viennent des tables des
 * cibles : elles ne sont écrites qu'à un seul endroit.
 */
export const PACKS: readonly { nom: string; version: string; cible: string }[] = [
  { nom: '@astratra/saas-kit', version: VERSIONS_SERVEUR.saasKit, cible: 'serveur' },
  { nom: '@astratra/security', version: VERSIONS_SERVEUR.security, cible: 'serveur' },
  { nom: '@astratra/store-postgres', version: VERSIONS_SERVEUR.storePostgres, cible: 'serveur' },
  { nom: '@astratra/prerender', version: VERSIONS.prerender, cible: 'web' },
];

export type GenreDeChangement = 'a_jour' | 'correctif' | 'nouveautes' | 'grand_changement' | 'plus_ancienne' | 'illisible';

const lireVersion = (version: string): number[] | undefined => {
  const morceaux = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return morceaux ? morceaux.slice(1).map(Number) : undefined;
};

/**
 * Le genre de changement entre la version épinglée et une autre (décision
 * P1). Une version d'essai (« -beta ») est illisible : elle n'est jamais prise.
 */
export function genreDeChangement(actuelle: string, autre: string): GenreDeChangement {
  const a = lireVersion(actuelle);
  const b = lireVersion(autre);
  if (!a || !b) return 'illisible';
  const difference = b.findIndex((n, i) => n !== a[i]);
  if (difference === -1) return 'a_jour';
  if (b[difference] < a[difference]) return 'plus_ancienne';
  return (['grand_changement', 'nouveautes', 'correctif'] as const)[difference];
}

export interface LignePack {
  nom: string;
  cible: string;
  epinglee: string;
  /** La dernière version publiée ; absente si npm n'a pas répondu. */
  derniere?: string;
  genre: GenreDeChangement | 'inconnu';
  conseil: string;
}

const CONSEILS: Record<LignePack['genre'], string> = {
  a_jour: 'à jour.',
  correctif: 'correctif : change la version dans le compilateur, lance npm run essai:packs, puis publie une version corrective de Humalis.',
  nouveautes: 'nouveautés : change la version, lance npm run essai:packs, et regarde si Humalis peut s’en servir.',
  grand_changement: 'grand changement : jamais automatique. Il faut un plan (l’API peut changer), puis la décision d’Emch.',
  plus_ancienne: 'la version publiée est plus ancienne que celle du compilateur : vérifie le registre npm.',
  illisible: 'version illisible ou d’essai : elle n’est pas prise.',
  inconnu: 'npm n’a pas répondu (pas de réseau ?) : seule la version épinglée est connue.',
};

/** L'état de chaque pack, avec la dernière version donnée par `derniere` (npm view). */
export function etatDesPacks(derniere: (nom: string) => string | undefined): LignePack[] {
  return PACKS.map((pack) => {
    const publiee = derniere(pack.nom);
    const genre = publiee === undefined ? 'inconnu' : genreDeChangement(pack.version, publiee);
    return { nom: pack.nom, cible: pack.cible, epinglee: pack.version, derniere: publiee, genre, conseil: CONSEILS[genre] };
  });
}

export interface Retard {
  nom: string;
  projet: string;
  compilateur: string;
  message: string;
}

/**
 * Les packs d'un projet déjà produit (son package.json) plus anciens que
 * ceux du compilateur (décision P3).
 */
export function verifierProjet(packageJson: string): Retard[] {
  let paquet: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    paquet = JSON.parse(packageJson) as typeof paquet;
  } catch (erreur) {
    throw new ErreurPackageJson(
      `le package.json n'est pas un JSON valide (${erreur instanceof Error ? erreur.message : String(erreur)}) : corrige-le, ou recompile le projet.`,
    );
  }
  const dependances = { ...paquet.devDependencies, ...paquet.dependencies };
  const retards: Retard[] = [];
  for (const pack of PACKS) {
    const version = dependances[pack.nom];
    if (version === undefined) continue;
    const genre = genreDeChangement(version.replace(/^[\^~]/, ''), pack.version);
    if (genre === 'correctif' || genre === 'nouveautes' || genre === 'grand_changement') {
      retards.push({
        nom: pack.nom,
        projet: version,
        compilateur: pack.version,
        message: `${pack.nom} ${version} est plus ancien que ${pack.version} : recompile ton programme avec ce Humalis pour passer à ${pack.version}.`,
      });
    }
  }
  return retards;
}

/** Un package.json illisible : la commande l'affiche en français, sans trace de pile. */
export class ErreurPackageJson extends Error {}
