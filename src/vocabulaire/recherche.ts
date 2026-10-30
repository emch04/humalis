/**
 * Index de la table de vocabulaire, construits une fois au chargement.
 * Le lexer, l'analyse, l'extension et le site passent par ici plutôt que
 * de parcourir la table eux-mêmes.
 */
import { VOCABULAIRE } from './table.js';
import { normaliser } from './normaliser.js';
import type { Contexte, EntreeVocabulaire } from './types.js';

/** Le mot et ses variantes : toutes les formes normalisées qui le désignent. */
export function formesDe(entree: EntreeVocabulaire): string[] {
  return [entree.mot, ...entree.variantes];
}

/** Réservé partout : il ne peut jamais nommer une variable. */
export const estReserve = (entree: EntreeVocabulaire): boolean => entree.contextes.includes('partout');

/**
 * Les contextes où le parser reconnaît le mot par son texte (« estLeMot »),
 * sans que le lexer en fasse un MOT_CLE. Les mots du serveur, des composants
 * et du partage y restent de simples noms pour le lexer : aucun programme
 * existant ne change de sens, et « date », « route » ou « admin » peuvent
 * toujours nommer une variable ou un champ.
 */
const CONTEXTES_SANS_MOT_CLE: readonly Contexte[] = [
  'tournure',
  'option',
  'valeurStyle',
  'serveur',
  'source',
  'donnee',
  'route',
  'composant',
  'declaration',
  'session',
  'miseEnPage',
  'saisie',
  'navigation',
  'interaction',
];

/**
 * Le lexer produit un MOT_CLE pour ce mot. C'est le cas des mots réservés
 * (même prévus, pour qu'aucun programme ne les prenne comme noms) et des
 * mots pris en charge qui vivent ailleurs qu'après « avec » : les noms
 * d'options et les valeurs de style restent des noms ordinaires pour le
 * lexer, et l'analyse les reconnaît à leur place (`optionCanonique`).
 */
export function estMotCleDuLexer(entree: EntreeVocabulaire): boolean {
  if (entree.categorie === 'liaison') return false;
  if (estReserve(entree)) return true;
  return (
    entree.statut === 'supporte' && entree.contextes.some((c) => !CONTEXTES_SANS_MOT_CLE.includes(c))
  );
}

const parForme = new Map<string, EntreeVocabulaire[]>();
for (const entree of VOCABULAIRE) {
  for (const forme of formesDe(entree)) {
    const liste = parForme.get(forme) ?? [];
    liste.push(entree);
    parForme.set(forme, liste);
  }
}

/** Les entrées qu'un mot écrit peut désigner, tous contextes confondus. */
export function entreesDe(mot: string): EntreeVocabulaire[] {
  return parForme.get(normaliser(mot).replace(/-/g, '')) ?? [];
}

/** L'entrée que désigne ce mot à cette place, s'il y en a une. */
export function chercher(mot: string, contexte: Contexte): EntreeVocabulaire | undefined {
  return entreesDe(mot).find((e) => e.contextes.includes(contexte) || estReserve(e));
}

/** Le mot est-il une forme connue de la table (hors mots de liaison) ? */
export function estFormeConnue(mot: string): boolean {
  return entreesDe(mot).some((e) => e.categorie !== 'liaison');
}

/** Un mot prévu mais pas encore pris en charge, pour dire « pas encore disponible ». */
export function entreePrevue(mot: string): EntreeVocabulaire | undefined {
  const entrees = entreesDe(mot);
  if (entrees.some((e) => e.statut === 'supporte')) return undefined;
  return entrees.find((e) => e.statut === 'prevu');
}
