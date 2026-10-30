import { normaliser } from '../../../src/lexer/motsCles';
import type { EntreeVocabulaire } from './adaptateur';

/** Regroupe les entrées par catégorie, dans l'ordre où les catégories apparaissent. */
export function regrouperParCategorie(table: readonly EntreeVocabulaire[]): Map<string, EntreeVocabulaire[]> {
  const groupes = new Map<string, EntreeVocabulaire[]>();
  for (const entree of table) {
    const groupe = groupes.get(entree.categorie) ?? [];
    groupe.push(entree);
    groupes.set(entree.categorie, groupe);
  }
  return groupes;
}

/**
 * Cherche dans le mot, ses variantes, son concept et sa catégorie, sans
 * tenir compte des accents ni de la casse (la même normalisation que le
 * lexer). Un texte vide garde tout.
 */
export function filtrer(
  table: readonly EntreeVocabulaire[],
  texte: string,
  categorie?: string,
): EntreeVocabulaire[] {
  const recherche = normaliser(texte.trim());
  return table.filter((entree) => {
    if (categorie && entree.categorie !== categorie) return false;
    if (recherche === '') return true;
    const foin = [entree.mot, ...entree.variantes, entree.concept];
    return foin.some((m) => normaliser(m).includes(recherche));
  });
}
