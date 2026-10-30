/** Petits outils communs aux tests des outils d'éditeur. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireProjet, type Lecteur } from '../src/langage/projet.js';
import { indexer } from '../src/langage/portees.js';

export const dossierExemples = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'exemples');

export const exemple = (nom: string) => readFileSync(join(dossierExemples, nom), 'utf8');

/** L'index d'une source, avec un chemin et un lecteur en mémoire si on veut un projet. */
export function indexDe(source: string, chemin?: string, fichiers: Record<string, string> = {}, aVider: number[] = []) {
  const lire: Lecteur = (c) => fichiers[c];
  return indexer(lireProjet(source, chemin, lire, aVider));
}

/**
 * La colonne (à partir de 1) d'un morceau de la ligne `ligne`, plus un
 * décalage : col(source, 13, 'panier') est la colonne du « p ».
 */
export function col(source: string, ligne: number, morceau: string, decalage = 0, occurrence = 1): number {
  const texte = source.split('\n')[ligne - 1];
  let i = -1;
  for (let n = 0; n < occurrence; n++) {
    i = texte.indexOf(morceau, i + 1);
    if (i === -1) throw new Error(`« ${morceau} » absent de la ligne ${ligne} : ${texte}`);
  }
  return i + 1 + decalage;
}
