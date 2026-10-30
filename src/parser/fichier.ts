/**
 * L'analyse syntaxique du choix et de l'envoi d'un fichier :
 *
 *     fichier "Choisir une photo" dans photo accepte images avec maximum 5 Mo
 *     envoyer fichier photo vers "api/photo" de la source "boutique" en corps brut suivi dans envoi et fichier dans adresse
 *
 * Aucun de ces mots n'est réservé : `fichier` n'est un élément qu'en tête de
 * ligne suivi d'un texte entre guillemets (`variable fichier = rien` reste
 * permis) ; `accepte`, `maximum`, `plusieurs`, `suivi`, `brut`… ne sont lus
 * qu'à leur place, dans cette ligne.
 */
import type { FluxTokens } from './fluxTokens.js';
import { ErreurSyntaxique } from './erreurs.js';
import type { ChoixFichier, Element, EnvoiFichier, Expression } from './ast.js';
import { analyserSourceSeule } from './source.js';
import { estLeMot } from './miseEnPage.js';
import { normaliser } from '../lexer/motsCles.js';

/** « fichier "Choisir une photo" … » : le mot suivi d'un texte entre guillemets. */
export function estChoixFichier(flux: FluxTokens): boolean {
  return estLeMot(flux.actuel(), 'fichier') && flux.regarder(1).type === 'CHAINE';
}

/** Après « envoyer » : « fichier photo … » (l'autre suite possible est « requete »). */
export function estEnvoiFichier(flux: FluxTokens): boolean {
  return estLeMot(flux.actuel(), 'fichier');
}

/** Les unités de « maximum 5 Mo » : un Ko vaut 1 024 octets, un Mo 1 024 Ko. */
const UNITES: Record<string, number> = { o: 1, octets: 1, octet: 1, ko: 1024, mo: 1024 * 1024, go: 1024 * 1024 * 1024 };

export function analyserChoixFichier(flux: FluxTokens, expression: (flux: FluxTokens) => Expression): Element {
  const debut = flux.avancer();
  const contenu = expression(flux);
  flux.attendre('MOT_CLE', 'dans', '« dans » suivi de la variable qui recevra le fichier : fichier "Choisir une photo" dans photo');
  const variable = flux.attendreNom('le nom de la variable qui recevra le fichier').nom;

  const choix: ChoixFichier = { variable, accepte: [] };
  if (estLeMot(flux.actuel(), 'accepte')) {
    flux.avancer();
    do {
      const mot = flux.actuel();
      if (mot.type !== 'IDENTIFIANT' && mot.type !== 'MOT_CLE') {
        throw new ErreurSyntaxique('il manque ce que le fichier peut être : accepte images, accepte pdf, accepte images ou pdf', mot.ligne);
      }
      choix.accepte.push(normaliser(flux.avancer().valeur));
    } while (flux.accepter('MOT_CLE', 'ou'));
  }

  let nom: string | undefined;
  const classes: string[] = [];
  if (flux.accepter('MOT_CLE', 'avec')) {
    do {
      const option = flux.actuel();
      const mot = normaliser(option.valeur);
      if (mot === 'maximum') {
        flux.avancer();
        const nombre = flux.attendre('NOMBRE', undefined, 'une taille après « maximum » : maximum 5 Mo');
        const unite = flux.actuel();
        const facteur = unite.type === 'IDENTIFIANT' ? UNITES[normaliser(unite.valeur)] : undefined;
        if (facteur === undefined) {
          throw new ErreurSyntaxique('la taille maximale a une unité : « maximum 500 Ko » ou « maximum 5 Mo »', unite.ligne);
        }
        flux.avancer();
        choix.octets = Math.round(Number(nombre.valeur) * facteur);
      } else if (mot === 'plusieurs') {
        flux.avancer();
        choix.plusieurs = true;
      } else if (option.type === 'IDENTIFIANT' && mot === 'nom') {
        flux.avancer();
        nom = flux.attendre('CHAINE', undefined, "le nom de l'élément entre guillemets").valeur;
      } else if (option.type === 'MOT_CLE' && option.valeur === 'style') {
        flux.avancer();
        classes.push(...flux.attendre('CHAINE', undefined, 'le nom de la classe CSS entre guillemets').valeur.split(/\s+/).filter(Boolean));
      } else {
        throw new ErreurSyntaxique(
          `« ${option.original ?? option.valeur} » ne se règle pas sur un choix de fichier. Réglages possibles : maximum 5 Mo, plusieurs, nom "…", style "…".`,
          option.ligne,
        );
      }
    } while (flux.accepter('MOT_CLE', 'et'));
  }

  return { type: 'Element', element: 'fichier', contenu, styles: [], classes, nom, fichier: choix, ligne: debut.ligne };
}

/**
 * « envoyer fichier photo vers "route" [de la source "x"] [en corps brut | sous le nom "n"]
 * [suivi dans envoi] [et] [fichier dans adresse] ». Le mot « envoyer » est déjà lu.
 */
export function analyserEnvoiFichier(flux: FluxTokens, ligne: number): EnvoiFichier {
  flux.avancer(); // fichier
  const variable = flux.attendreNom('le nom de la variable qui contient le fichier choisi').nom;
  flux.attendre('MOT_CLE', 'vers', '« vers » suivi de la route : envoyer fichier photo vers "api/photo" de la source "boutique"');
  const adresse = flux.attendre('CHAINE', undefined, 'la route entre guillemets').valeur;
  const source = analyserSourceSeule(flux);
  const envoi: EnvoiFichier = { type: 'EnvoiFichier', variable, adresse, ...(source !== undefined ? { source } : {}), ligne };

  if (estLeMot(flux.actuel(), 'en') && estLeMot(flux.regarder(1), 'corps') && estLeMot(flux.regarder(2), 'brut')) {
    flux.avancer();
    flux.avancer();
    flux.avancer();
    envoi.corpsBrut = true;
  }
  if (estLeMot(flux.actuel(), 'sous') && estLeMot(flux.regarder(1), 'nom')) {
    if (envoi.corpsBrut) {
      throw new ErreurSyntaxique("« en corps brut » envoie le fichier seul, sans formulaire : il n'a pas de nom de champ. Gardez « en corps brut » ou « sous le nom \"photo\" », pas les deux.", flux.actuel().ligne);
    }
    flux.avancer();
    flux.avancer();
    envoi.champ = flux.attendre('CHAINE', undefined, 'le nom du champ entre guillemets : sous le nom "photo"').valeur;
  }
  if (estLeMot(flux.actuel(), 'suivi')) {
    flux.avancer();
    flux.attendre('MOT_CLE', 'dans', '« dans » suivi de la variable de progression : suivi dans envoi');
    envoi.suivi = flux.attendreNom('le nom de la variable de progression').nom;
  }
  // « et » sépare les deux dernières clauses : « suivi dans envoi et fichier dans adresse ».
  if (estLeMot(flux.actuel(), 'et') && estLeMot(flux.regarder(1), 'fichier')) flux.avancer();
  if (estLeMot(flux.actuel(), 'fichier') && flux.regarder(1).type === 'MOT_CLE' && flux.regarder(1).valeur === 'dans') {
    flux.avancer();
    flux.avancer();
    envoi.resultat = flux.attendreNom('le nom de la variable qui recevra la réponse').nom;
  }
  return envoi;
}
