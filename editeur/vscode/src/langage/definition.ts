/**
 * Le saut à la déclaration (plan `2026-10-29-outils-editeur.md`, D5) :
 * du nom sous le curseur à la ligne qui le déclare, dans ce fichier ou
 * dans un fichier utilisé.
 */
import { dirname, resolve } from 'node:path';
import { normaliser } from '../../../../src/vocabulaire/normaliser.js';
import { dansStyle, jetonsDeLigne, longueurJeton, texteJeton, type Token } from './document.js';
import { entetes, genreBloc, premierMot } from './blocs.js';
import { principal } from './projet.js';
import {
  baseInterpolation,
  elementsDeLaPage,
  symbolesDe,
  variableVisible,
  type Index,
  type Symbole,
} from './portees.js';

/** Un endroit d'un fichier : une ligne, et les colonnes du nom (fin exclue). */
export interface Lieu {
  /** Absent : le document ouvert (s'il n'a pas de fichier). */
  fichier?: string;
  ligne: number;
  colonne: number;
  fin: number;
}

/** Le jeton sous le curseur, et ce qui le précède sur la ligne (sans les petits mots). */
export interface JetonPlace {
  jeton: Token;
  /** Les jetons avant lui, sans les mots de liaison (« l' », « le », « à »). */
  avant: Token[];
  /** Pour un texte : l'interpolation {nom} sous le curseur, s'il y en a une. */
  interpolation?: string;
}

export function jetonPlace(lignes: readonly string[], ligne: number, colonne: number): JetonPlace | undefined {
  if (dansStyle(lignes, ligne)) return undefined;
  const jetons = jetonsDeLigne(lignes[ligne - 1] ?? '', ligne);
  const dedans = (j: Token) => j.type !== 'PONCTUATION' && j.colonne <= colonne && colonne < j.colonne + longueurJeton(j);
  const juste = (j: Token) => j.type !== 'PONCTUATION' && colonne === j.colonne + longueurJeton(j);
  let k = jetons.findIndex(dedans);
  if (k === -1) k = jetons.findIndex(juste);
  if (k === -1) return undefined;
  const jeton = jetons[k];
  const avant = jetons.slice(0, k).filter((j) => j.type !== 'LIAISON');
  if (jeton.type !== 'CHAINE') return { jeton, avant };
  // Dans un texte : l'interpolation {nom} qui contient le curseur.
  const position = colonne - (jeton.colonne + 1);
  const ouverture = jeton.valeur.lastIndexOf('{', position);
  const fermeture = jeton.valeur.indexOf('}', ouverture);
  const interpolation =
    ouverture !== -1 && fermeture !== -1 && position <= fermeture && !jeton.valeur.slice(ouverture, position).includes('}')
      ? baseInterpolation(jeton.valeur.slice(ouverture + 1, fermeture))
      : undefined;
  return interpolation ? { jeton, avant, interpolation } : { jeton, avant };
}

const motDe = (j: Token | undefined) => (j === undefined ? '' : normaliser(texteJeton(j)));
const sansBarre = (adresse: string) => adresse.replace(/^\/+/, '');

/** Le symbole d'un genre déclaré sur cette ligne du document ouvert, s'il y en a un. */
function declareIci(index: Index, ligne: number, nom: string): Symbole | undefined {
  const { chemin } = principal(index.projet);
  return index.symboles.find((s) => s.fichier === chemin && s.ligne === ligne && s.nom === nom);
}

/** Une variable lue à cette ligne : l'analyse l'y a vue, ou la ligne n'a pas pu être lue. */
function estLue(index: Index, ligne: number, nom: string): boolean {
  const { doc } = principal(index.projet);
  return !doc.programme || doc.lignesVidees.has(ligne) || (index.references.get(ligne)?.has(nom) ?? false);
}

/** Le symbole nommé sous le curseur (variable, page, route…), s'il y en a un. */
export function symboleA(index: Index, ligne: number, colonne: number): Symbole | Lieu | undefined {
  const { chemin, doc } = principal(index.projet);
  const lignes = doc.lignes;
  const place = jetonPlace(lignes, ligne, colonne);
  if (!place) return undefined;
  const { jeton, avant, interpolation } = place;
  const precedent = motDe(avant[avant.length - 1]);
  const premier = motDe(avant[0] ?? jeton);

  if (jeton.type === 'CHAINE') {
    if (interpolation !== undefined) return variableVisible(index, interpolation, ligne);
    const valeur = jeton.valeur;
    if (precedent === 'fichier' && chemin !== undefined) {
      return { fichier: resolve(dirname(chemin), valeur), ligne: 1, colonne: 1, fin: 1 };
    }
    const routeVisee =
      (precedent === 'vers' && avant.some((j) => motDe(j) === 'requete')) ||
      // « modifier p dans "produits" », « supprimer p de "produits" » (« de » est un petit mot, déjà retiré).
      (['modifier', 'supprimer'].includes(premier) && avant.length <= 3);
    if (routeVisee) return symbolesDe(index, 'route').find((s) => sansBarre(s.nom) === sansBarre(valeur));
    if (precedent === 'vers') return symbolesDe(index, 'page').find((s) => s.nom === valeur);
    if (precedent === 'sur' || precedent === 'survole' || (precedent === 'champ' && avant.length > 1)) {
      const elements = elementsDeLaPage(index, ligne).filter((s) => precedent !== 'champ' || s.element === 'champ');
      return elements.find((s) => s.nomElement === valeur) ?? elements.find((s) => s.libelle === valeur);
    }
    return declareIci(index, ligne, valeur);
  }

  const nom = texteJeton(jeton);
  // « p.nom » : le champ d'une donnée du serveur.
  const ligneTexte = lignes[ligne - 1] ?? '';
  if (ligneTexte[jeton.colonne - 2] === '.') {
    return symbolesDe(index, 'champDonnee').find((s) => s.nom === nom || s.nom === jeton.valeur);
  }
  const ici = declareIci(index, ligne, nom) ?? declareIci(index, ligne, jeton.valeur);
  if (ici && ici.genre !== 'element') return ici;
  const genre = genreBloc(lignes, entetes(lignes, ligne));
  if (genre === 'route') return symbolesDe(index, 'donnee').find((s) => s.nom === nom);
  if (genre === 'serveur' || genre === 'donnee') return undefined;
  for (const n of new Set([nom, jeton.valeur])) {
    if (!estLue(index, ligne, n)) continue;
    const variable = variableVisible(index, n, ligne);
    if (variable) return variable;
  }
  if (avant.length === 0 || index.composantsPlaces.get(ligne)?.has(nom)) {
    const composant = index.symboles.find((s) => (s.genre === 'composant' || s.genre === 'composantReact') && s.nom === nom);
    if (composant && (avant.length === 0 || premierMot(ligneTexte) !== 'utiliser')) return composant;
  }
  return undefined;
}

/** Le lieu de la déclaration du nom sous le curseur. */
export function definir(index: Index, ligne: number, colonne: number): Lieu | undefined {
  const s = symboleA(index, ligne, colonne);
  if (!s) return undefined;
  return { ...(s.fichier !== undefined ? { fichier: s.fichier } : {}), ligne: s.ligne, colonne: s.colonne, fin: s.fin };
}
