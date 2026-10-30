/**
 * La reconnaissance des éléments d'écran :
 * `icone`, `badge`, `avatar`, `progression`, `chargement`, `etoiles`,
 * `compteur`, `code qr`, et les blocs `onglets`, `deroulant`, `accordeon`,
 * `carrousel`, `fil d'Ariane`.
 *
 * Aucun de ces mots n'est réservé : ils ne sont des éléments qu'en tête de
 * ligne, suivis de ce qu'ils attendent (un texte, une valeur, `:`, `avec`).
 * `variable compteur = 0` et `afficher badge` restent permis.
 */
import type { Token } from '../lexer/types.js';
import type { FluxTokens } from './fluxTokens.js';
import type { GenreBloc, NomElement } from './ast.js';
import { estLeMot } from './miseEnPage.js';

/** Les éléments d'une ligne, qui prennent une valeur (ou rien, pour `chargement`). */
const ELEMENTS_ECRAN: NomElement[] = ['icone', 'badge', 'avatar', 'progression', 'chargement', 'etoiles', 'compteur', 'audio'];

/** Une valeur commence ici : un texte, un nombre, un nom, `[`, `-`. */
export function commenceUneValeur(token: Token): boolean {
  return (
    token.type === 'CHAINE' ||
    token.type === 'NOMBRE' ||
    token.type === 'IDENTIFIANT' ||
    (token.type === 'MOT_CLE' && (!token.reserve || ['vrai', 'faux', 'rien'].includes(token.valeur))) ||
    (token.type === 'PONCTUATION' && token.valeur === '[')
  );
}

/**
 * Un élément d'écran en tête de ligne : le ou les mots sont consommés et le
 * nom de l'élément renvoyé. `code qr` s'écrit en deux mots (`code` seul reste
 * un nom).
 */
export function lireElementEcran(flux: FluxTokens): NomElement | undefined {
  const actuel = flux.actuel();
  if (estLeMot(actuel, 'code') && estLeMot(flux.regarder(1), 'qr') && commenceUneValeur(flux.regarder(2))) {
    flux.avancer();
    flux.avancer();
    return 'qr';
  }
  const nom = ELEMENTS_ECRAN.find((n) => estLeMot(actuel, n));
  if (!nom) return undefined;
  const suivant = flux.regarder(1);
  const ouAvec = suivant.type === 'FIN_LIGNE' || (suivant.type === 'MOT_CLE' && suivant.valeur === 'avec');
  // `chargement` seul (ou suivi de `avec`) est un indicateur sans texte.
  if (nom === 'chargement' ? ouAvec || commenceUneValeur(suivant) : commenceUneValeur(suivant)) {
    flux.avancer();
    return nom;
  }
  return undefined;
}

/** Les blocs de la vue qui ont un titre entre guillemets : leur titre est celui du bloc. */
export const GENRES_AVEC_TITRE: GenreBloc[] = ['onglet', 'deroulant'];
/** Les blocs de la vue qui contiennent d'autres blocs ou éléments, introduits par `:`. */
export const GENRES_COMPOSITES: GenreBloc[] = ['onglets', 'onglet', 'deroulant', 'accordeon', 'carrousel', 'filAriane'];

/** `fil d'Ariane :` s'écrit en deux mots (`d'` est un mot de liaison déjà sauté) : `fil` seul reste un nom. */
export function estFilAriane(flux: FluxTokens): boolean {
  return estLeMot(flux.actuel(), 'fil') && estLeMot(flux.regarder(1), 'ariane') && flux.regarder(2).valeur === ':';
}
