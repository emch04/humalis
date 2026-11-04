/**
 * Un document et les fichiers qu'il utilise (« utiliser fichier "…" »),
 * suivis comme le fait le compilateur : chemins depuis le fichier qui les
 * écrit, chaque fichier lu une seule fois. Le disque n'est jamais lu ici :
 * l'appelant donne un lecteur (l'éditeur lit d'abord ses documents ouverts).
 */
import { dirname, join, resolve } from 'node:path';
import { lireDocument, type DocumentLu } from './document.js';

/** Lit un fichier du projet ; undefined s'il n'existe pas. */
export type Lecteur = (chemin: string) => string | undefined;

export interface FichierProjet {
  /** Chemin absolu ; absent pour un document sans fichier (pas encore enregistré). */
  chemin?: string;
  doc: DocumentLu;
}

export interface Projet {
  /** Le document de l'éditeur d'abord, puis les fichiers qu'il utilise. */
  fichiers: FichierProjet[];
}

/** Le document ouvert, celui sur lequel portent les questions de l'éditeur. */
export const principal = (projet: Projet) => projet.fichiers[0];

/** Les fichiers d'un dossier ; aucun s'il est illisible. */
export type Lister = (dossier: string) => string[];

/** Ajoute à la liste les fichiers utilisés, de proche en proche, chacun une seule fois. */
function suivre(fichiers: FichierProjet[], vus: Set<string>, lire: Lecteur): void {
  for (let k = 0; k < fichiers.length; k++) {
    const { chemin: ici, doc } = fichiers[k];
    if (ici === undefined) continue;
    for (const utilise of doc.programme?.fichiersHumalis ?? []) {
      const cible = resolve(dirname(ici), utilise.chemin);
      if (vus.has(cible)) continue;
      vus.add(cible);
      let texte: string | undefined;
      try {
        texte = lire(cible);
      } catch {
        texte = undefined;
      }
      if (texte !== undefined) fichiers.push({ chemin: cible, doc: lireDocument(texte) });
    }
  }
}

/** Un fichier et ce qu'il utilise. */
function descendre(source: string, chemin: string, lire: Lecteur): FichierProjet[] {
  const fichiers: FichierProjet[] = [{ chemin, doc: lireDocument(source) }];
  suivre(fichiers, new Set([chemin]), lire);
  return fichiers;
}

/** Jusqu'où remonter pour trouver le fichier qui en utilise un autre (site/commun/entete → site). */
const NIVEAUX_AU_DESSUS = 4;

/**
 * Le fichier principal qui utilise ce document (« utiliser fichier "…" »,
 * même de loin), cherché dans son dossier puis dans les dossiers au-dessus ;
 * undefined si personne ne l'utilise : il est alors vérifié seul.
 */
export function principalQuiUtilise(chemin: string, lire: Lecteur, lister: Lister): string | undefined {
  let dossier = dirname(chemin);
  for (let niveau = 0; niveau <= NIVEAUX_AU_DESSUS; niveau++) {
    for (const nom of lister(dossier).sort()) {
      if (!nom.endsWith('.humalis') || nom.endsWith('.test.humalis')) continue;
      const candidat = join(dossier, nom);
      if (candidat === chemin) continue;
      const texte = lire(candidat);
      if (texte === undefined) continue;
      if (descendre(texte, candidat, lire).slice(1).some((f) => f.chemin === chemin)) return principalQuiUtilise(candidat, lire, lister) ?? candidat;
    }
    const parent = dirname(dossier);
    if (parent === dossier) break;
    dossier = parent;
  }
  return undefined;
}

/**
 * Le document, ce qu'il utilise, puis, s'il est lui-même utilisé par un fichier
 * principal, tout le reste de ce projet : ses composants, ses pages, ses routes
 * et ses variables partagées sont connus. `lister` : sans lui, seul le document et ce qu'il utilise.
 */
export function lireProjet(
  source: string,
  chemin?: string,
  lire: Lecteur = () => undefined,
  aVider: readonly number[] = [],
  lister: Lister = () => [],
): Projet {
  const fichiers: FichierProjet[] = [{ chemin, doc: lireDocument(source, aVider) }];
  const vus = new Set(chemin === undefined ? [] : [chemin]);
  suivre(fichiers, vus, lire);
  if (chemin === undefined) return { fichiers };
  const racine = principalQuiUtilise(chemin, lire, lister);
  const texte = racine === undefined ? undefined : lire(racine);
  if (racine === undefined || texte === undefined || vus.has(racine)) return { fichiers };
  vus.add(racine);
  const debut = fichiers.length;
  fichiers.push({ chemin: racine, doc: lireDocument(texte) });
  // Le document ouvert garde sa place en tête : ce sont ses questions.
  const autres = fichiers.slice(debut);
  suivre(autres, vus, lire);
  fichiers.length = debut;
  fichiers.push(...autres);
  return { fichiers };
}
