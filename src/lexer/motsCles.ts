/**
 * Les mots que le lexer reconnaît. Rien n'est écrit à la main ici : tout
 * est calculé depuis la table de vocabulaire (`src/vocabulaire/table.ts`),
 * la seule liste qui fait foi. Les exports restent ceux d'avant la table,
 * car l'extension VS Code et le site les lisent.
 */
import { VOCABULAIRE } from '../vocabulaire/table.js';
import { estMotCleDuLexer, estReserve } from '../vocabulaire/recherche.js';
import { normaliser } from '../vocabulaire/normaliser.js';

export { normaliser };

const motsClesDeLaTable = VOCABULAIRE.filter(estMotCleDuLexer);

/** Les mots pour lesquels le lexer produit un MOT_CLE (forme canonique). */
export const MOTS_CLES: Set<string> = new Set(motsClesDeLaTable.map((e) => e.mot));

export function estMotCle(mot: string): boolean {
  return MOTS_CLES.has(mot);
}

/**
 * Mots réservés partout (décision Q2 du plan du vocabulaire) : la
 * structure et la logique du langage. Ils ne peuvent jamais servir de nom
 * de variable.
 *
 * Tous les autres mots-clés sont contextuels : `titre` n'est un élément
 * qu'en début d'instruction, et peut ailleurs nommer une variable.
 */
export const MOTS_RESERVES: Set<string> = new Set(VOCABULAIRE.filter(estReserve).map((e) => e.mot));

export const MOTS_CONTEXTUELS: Set<string> = new Set([...MOTS_CLES].filter((mot) => !MOTS_RESERVES.has(mot)));

/** Prend la forme canonique : « Égal » est réservé si « egal » l'est. */
export function estMotReserve(mot: string): boolean {
  return MOTS_RESERVES.has(formeCanonique(mot) ?? normaliser(mot));
}

/**
 * Accords féminins et pluriels ramenés à la forme canonique du mot-clé
 * (« inférieure » → « inferieur »). Les variantes des options et des
 * valeurs de style ne sont pas ici : elles ne valent qu'après « avec ».
 */
export const VARIANTES: Map<string, string> = new Map(
  motsClesDeLaTable.flatMap((e) => e.variantes.map((v) => [v, e.mot] as [string, string])),
);

/**
 * Forme canonique d'un mot-clé, ou null si ce n'en est pas un.
 * Insensible aux accents et aux accords : les mots-clés peuvent
 * s'écrire sans accent, ce qui évite les fautes de frappe bloquantes.
 */
export function formeCanonique(mot: string): string | null {
  const normalise = normaliser(mot);
  const canonique = VARIANTES.get(normalise) ?? normalise;
  return MOTS_CLES.has(canonique) ? canonique : null;
}

const liaisons = VOCABULAIRE.filter((e) => e.categorie === 'liaison');

/**
 * Articles et petits mots sans valeur pour le compilateur. Le lexer ne les
 * jette pas : il les marque (token LIAISON), et le parser les saute, sauf
 * là où il en a besoin (décision Q3).
 *
 * Les élisions (l', d', s'...) sont à part, car l'apostrophe colle le
 * déterminant au mot suivant.
 */
export const MOTS_LIAISON: Set<string> = new Set(liaisons.filter((e) => !e.elision).map((e) => e.mot));

export function estMotLiaison(mot: string): boolean {
  return MOTS_LIAISON.has(normaliser(mot));
}

/** Déterminants pouvant précéder une apostrophe : l'utilisateur, d'accord. */
export const ELISIONS: Set<string> = new Set(liaisons.filter((e) => e.elision).map((e) => e.mot));

export function estElision(mot: string): boolean {
  return ELISIONS.has(mot);
}
