/**
 * L'analyse syntaxique de la carte et de ses marqueurs :
 *
 *     carte "Le restaurant Le Fleuve" avec latitude -4,3250 et longitude 15,3222 et zoom 15
 *     carte "Nos agences" :
 *         marqueur "Gombe" avec adresse "12 avenue du Port" et latitude -4,3047 et longitude 15,3070
 *
 * Aucun de ces mots n'est réservé : `carte` n'est un bloc qu'en tête de
 * ligne suivi d'un texte entre guillemets, `marqueur` qu'en tête de ligne
 * suivi d'une valeur ; `latitude`, `longitude`, `zoom`, `tuiles`,
 * `attribution` et `adresse` ne sont lus qu'après « avec » ou « et », dans
 * ces deux lignes. `variable carte = 1` reste permis.
 */
import type { FluxTokens } from './fluxTokens.js';
import { ErreurSyntaxique } from './erreurs.js';
import type { Bloc, Element, Expression, Instruction, LieuMarqueur, OptionsCarte } from './ast.js';
import { estLeMot } from './miseEnPage.js';
import { normaliser } from '../lexer/motsCles.js';
import { commenceUneValeur } from './elements.js';

/** « carte "Le restaurant" … » : le mot suivi d'un texte entre guillemets. */
export function estCarte(flux: FluxTokens): boolean {
  return estLeMot(flux.actuel(), 'carte') && flux.regarder(1).type === 'CHAINE' && !/^\p{Lu}/u.test(flux.actuel().valeur);
}

/** « marqueur "Gombe" avec … » ou « marqueur a.nom avec … » : le mot suivi d'une valeur. */
export function estMarqueur(flux: FluxTokens): boolean {
  return estLeMot(flux.actuel(), 'marqueur') && commenceUneValeur(flux.regarder(1));
}

interface Lecture {
  expression: (flux: FluxTokens) => Expression;
  corps: (flux: FluxTokens) => Instruction[];
}

/** « style "…" » : les classes CSS, comme sur les autres éléments. */
function lireClasses(flux: FluxTokens): string[] {
  flux.avancer();
  return flux.attendre('CHAINE', undefined, 'le nom de la classe CSS entre guillemets').valeur.split(/\s+/).filter(Boolean);
}

export function analyserCarte(flux: FluxTokens, lecture: Lecture): Bloc {
  const debut = flux.avancer();
  const titre = lecture.expression(flux);
  const carte: OptionsCarte = {};
  const classes: string[] = [];
  if (flux.accepter('MOT_CLE', 'avec')) {
    do {
      const option = flux.actuel();
      const mot = normaliser(option.original ?? option.valeur);
      if (option.type === 'MOT_CLE' && option.valeur === 'style') {
        classes.push(...lireClasses(flux));
      } else if (mot === 'latitude' || mot === 'longitude' || mot === 'zoom') {
        flux.avancer();
        const exemple = mot === 'zoom' ? 'zoom 15' : mot === 'latitude' ? 'latitude -4,3250' : 'longitude 15,3222';
        if (!commenceUneValeur(flux.actuel()) && !(flux.actuel().type === 'PONCTUATION' && ['-', '('].includes(flux.actuel().valeur))) {
          throw new ErreurSyntaxique(`il manque la valeur après « ${mot} » : ${exemple}`, option.ligne);
        }
        carte[mot] = lecture.expression(flux);
      } else if (mot === 'tuiles' || mot === 'attribution') {
        flux.avancer();
        carte[mot] = flux.attendre(
          'CHAINE',
          undefined,
          mot === 'tuiles' ? 'l’adresse des tuiles entre guillemets : tuiles "https://exemple.cd/{z}/{x}/{y}.png"' : 'le texte de l’attribution entre guillemets : attribution "© MapTiler"',
        ).valeur;
      } else {
        throw new ErreurSyntaxique(
          `« ${option.original ?? option.valeur} » ne se règle pas sur une carte. Réglages possibles : latitude, longitude, zoom, tuiles, attribution, style.`,
          option.ligne,
        );
      }
    } while (flux.accepter('MOT_CLE', 'et'));
  }
  // Sans « : », la carte n'a pas de marqueurs : elle montre sa position.
  const corps = flux.accepter('PONCTUATION', ':') ? lecture.corps(flux) : [];
  return { type: 'Bloc', genre: 'carte', styles: [], classes, titre, carte, corps, ligne: debut.ligne };
}

export function analyserMarqueur(flux: FluxTokens, expression: (flux: FluxTokens) => Expression): Element {
  const debut = flux.avancer();
  const contenu = expression(flux);
  const lieu: LieuMarqueur = {};
  const classes: string[] = [];
  if (flux.accepter('MOT_CLE', 'avec')) {
    do {
      const option = flux.actuel();
      const mot = normaliser(option.original ?? option.valeur);
      if (option.type === 'MOT_CLE' && option.valeur === 'style') {
        classes.push(...lireClasses(flux));
      } else if (mot === 'latitude' || mot === 'longitude' || mot === 'adresse') {
        flux.avancer();
        if (!commenceUneValeur(flux.actuel()) && !(flux.actuel().type === 'PONCTUATION' && ['-', '('].includes(flux.actuel().valeur))) {
          throw new ErreurSyntaxique(`il manque la valeur après « ${mot} » : marqueur "Gombe" avec latitude -4,3047 et longitude 15,3070`, option.ligne);
        }
        lieu[mot] = expression(flux);
      } else {
        throw new ErreurSyntaxique(
          `« ${option.original ?? option.valeur} » ne se règle pas sur un marqueur. Réglages possibles : latitude, longitude, adresse, style.`,
          option.ligne,
        );
      }
    } while (flux.accepter('MOT_CLE', 'et'));
  }
  return { type: 'Element', element: 'marqueur', contenu, styles: [], classes, lieu, ligne: debut.ligne };
}
