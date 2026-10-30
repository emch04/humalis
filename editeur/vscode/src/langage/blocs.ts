/**
 * Le bloc qui contient une ligne, lu sur l'indentation du texte : cela
 * marche aussi pour une ligne en cours de frappe, que le parser ne lit pas.
 */
import { normaliser } from '../../../../src/vocabulaire/normaliser.js';
import { indentation } from './document.js';

/** Où se trouve une ligne : hors de tout bloc, dans une page, un événement, le serveur… */
export type GenreBloc = 'fichier' | 'vue' | 'evenement' | 'serveur' | 'donnee' | 'route' | 'style';

const estVide = (ligne: string) => ligne.trim() === '' || ligne.trim().startsWith('#');

/**
 * Les lignes d'en-tête des blocs qui contiennent la ligne `ligne`, de la
 * plus proche à la plus lointaine (la page, le serveur…). `marge` :
 * l'indentation de la ligne, si on la connaît mieux que son texte (le
 * curseur sur une ligne encore vide).
 */
export function entetes(lignes: readonly string[], ligne: number, marge = indentation(lignes[ligne - 1] ?? '')): number[] {
  const resultat: number[] = [];
  let courante = marge;
  for (let k = ligne - 1; k >= 1 && courante > 0; k--) {
    const texte = lignes[k - 1] ?? '';
    if (estVide(texte)) continue;
    const i = indentation(texte);
    if (i < courante) {
      resultat.push(k);
      courante = i;
    }
  }
  return resultat;
}

/** Le premier mot d'une ligne, sans accent ni majuscule. */
export function premierMot(ligne: string): string {
  return normaliser(ligne.trim().match(/^[\p{L}_]+/u)?.[0] ?? '');
}

/** Le genre du bloc le plus proche, d'après ses en-têtes. */
export function genreBloc(lignes: readonly string[], chaine: readonly number[]): GenreBloc {
  if (chaine.length === 0) return 'fichier';
  const mots = chaine.map((k) => premierMot(lignes[k - 1] ?? ''));
  if (mots.includes('quand')) return 'evenement';
  for (const mot of mots) {
    if (mot === 'donnee') return 'donnee';
    if (mot === 'route') return 'route';
    if (mot === 'serveur') return 'serveur';
    if (mot === 'page' || mot === 'composant') return 'vue';
    if (mot === 'style') return 'style';
  }
  return 'vue';
}

/** La page ou le composant qui contient la ligne : la ligne de son en-tête. */
export function enteteRacine(lignes: readonly string[], chaine: readonly number[]): number | undefined {
  const racine = chaine[chaine.length - 1];
  return racine !== undefined && ['page', 'composant'].includes(premierMot(lignes[racine - 1] ?? '')) ? racine : undefined;
}
