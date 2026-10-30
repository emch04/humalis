/**
 * Un document et les fichiers qu'il utilise (« utiliser fichier "…" »),
 * suivis comme le fait le compilateur : chemins depuis le fichier qui les
 * écrit, chaque fichier lu une seule fois. Le disque n'est jamais lu ici :
 * l'appelant donne un lecteur (l'éditeur lit d'abord ses documents ouverts).
 */
import { dirname, resolve } from 'node:path';
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

export function lireProjet(
  source: string,
  chemin?: string,
  lire: Lecteur = () => undefined,
  aVider: readonly number[] = [],
): Projet {
  const fichiers: FichierProjet[] = [{ chemin, doc: lireDocument(source, aVider) }];
  const vus = new Set(chemin === undefined ? [] : [chemin]);
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
  return { fichiers };
}
