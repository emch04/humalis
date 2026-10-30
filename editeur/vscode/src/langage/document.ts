/**
 * Lire un document Humalis pour l'éditeur, même pendant la frappe.
 *
 * Fonctions pures, sans VS Code. Lignes et colonnes comptées à partir de
 * 1, comme dans le compilateur.
 */
import { analyser } from '../../../../src/lexer/lexer.js';
import { ErreurLexicale, type Token } from '../../../../src/lexer/types.js';
import { analyserSyntaxe } from '../../../../src/parser/parser.js';
import { ErreurSyntaxique } from '../../../../src/parser/erreurs.js';
import type { Programme } from '../../../../src/parser/ast.js';

export type { Token };

export interface DocumentLu {
  /** Les lignes telles qu'elles sont écrites (aucune n'est vidée ici). */
  lignes: string[];
  /** Le programme, lu après avoir vidé les lignes fautives ; absent si rien n'a pu être lu. */
  programme?: Programme;
  /** Les lignes vidées pour lire le reste (numéros à partir de 1). */
  lignesVidees: Set<number>;
}

/** Au plus autant de lignes vidées : au-delà, le fichier est trop abîmé pour être lu. */
const ESSAIS_MAX = 50;

/**
 * Lit le programme d'une source. Une ligne fautive (le lexer ou le parser
 * s'arrête à sa première faute) est vidée, et on recommence : les numéros
 * des autres lignes ne bougent pas. `aVider` : des lignes à vider d'office,
 * comme celle du curseur pendant une complétion.
 */
export function lireDocument(source: string, aVider: readonly number[] = []): DocumentLu {
  const lignes = source.split('\n');
  const lignesVidees = new Set(aVider);
  for (let essai = 0; essai < ESSAIS_MAX; essai++) {
    const texte = lignes.map((l, k) => (lignesVidees.has(k + 1) ? '' : l)).join('\n');
    let fautive: number;
    try {
      return { lignes, programme: analyserSyntaxe(analyser(texte)), lignesVidees };
    } catch (erreur) {
      if (!(erreur instanceof ErreurLexicale) && !(erreur instanceof ErreurSyntaxique)) break;
      fautive = erreur.ligne;
    }
    // Une faute signalée sur une ligne vide (la fin du fichier, un bloc vidé) : on vide la ligne écrite juste avant.
    while (fautive >= 1 && (lignesVidees.has(fautive) || (lignes[fautive - 1] ?? '').trim() === '')) fautive--;
    if (fautive < 1) break;
    lignesVidees.add(fautive);
  }
  return { lignes, lignesVidees };
}

/** Le nombre d'espaces au début d'une ligne. */
export const indentation = (ligne: string) => ligne.length - ligne.trimStart().length;

/** La ligne est-elle dans un bloc « style : » (du CSS, recopié tel quel) ? */
export function dansStyle(lignes: readonly string[], ligne: number): boolean {
  const texte = lignes[ligne - 1] ?? '';
  if (texte.trim() !== '' && indentation(texte) === 0) return false;
  for (let k = ligne - 2; k >= 0; k--) {
    const l = lignes[k];
    if (l.trim() === '' || indentation(l) > 0) continue;
    return /^style\s*:\s*$/i.test(l);
  }
  return false;
}

/**
 * Les jetons d'une seule ligne, à leurs vraies colonnes. Le lexer lit la
 * ligne sans son indentation : cela marche même quand le reste du fichier
 * ne se lit pas. Un texte non fermé devient un jeton CHAINE jusqu'à la fin
 * de la ligne (son `original` commence par le guillemet).
 */
export function jetonsDeLigne(texte: string, ligne: number): Token[] {
  const marge = indentation(texte);
  const lire = (morceau: string): Token[] => {
    try {
      return analyser(morceau).filter((j) => !['INDENT', 'DEDENT', 'FIN_LIGNE', 'FIN_FICHIER'].includes(j.type));
    } catch (erreur) {
      if (!(erreur instanceof ErreurLexicale)) return [];
      const avant = lire(morceau.slice(0, erreur.colonne - 1));
      const reste = morceau.slice(erreur.colonne - 1);
      if (!reste.startsWith('"')) return avant;
      return [...avant, { type: 'CHAINE', valeur: reste.slice(1), original: reste, ligne: 1, colonne: erreur.colonne }];
    }
  };
  return lire(texte.slice(marge)).map((j) => ({ ...j, ligne, colonne: j.colonne + marge }));
}

/** La longueur du jeton tel qu'il est écrit dans la ligne. */
export function longueurJeton(jeton: Token): number {
  if (jeton.type === 'CHAINE') return jeton.original?.length ?? jeton.valeur.length + 2;
  return (jeton.original ?? jeton.valeur).length;
}

/** Le texte écrit d'un nom : la forme d'origine d'un mot du vocabulaire, sinon sa valeur. */
export const texteJeton = (jeton: Token) => jeton.original ?? jeton.valeur;

/** Le jeton d'un mot ou d'un texte, sous le curseur ou juste avant lui. */
export function jetonA(lignes: readonly string[], ligne: number, colonne: number): Token | undefined {
  if (dansStyle(lignes, ligne)) return undefined;
  const jetons = jetonsDeLigne(lignes[ligne - 1] ?? '', ligne).filter((j) => j.type !== 'PONCTUATION');
  return (
    jetons.find((j) => j.colonne <= colonne && colonne < j.colonne + longueurJeton(j)) ??
    jetons.find((j) => colonne === j.colonne + longueurJeton(j))
  );
}
