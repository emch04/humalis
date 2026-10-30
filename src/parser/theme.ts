/**
 * L'analyse syntaxique du thème (plan 2026-10-30-mise-en-page-et-elements,
 * chapitre 4.3) : le bloc « theme : » en haut du fichier, et l'action
 * « changer theme par sombre ».
 */
import { normaliser } from '../lexer/motsCles.js';
import { normaliserCouleur } from '../analyse/couleurs.js';
import type { FluxTokens } from './fluxTokens.js';
import { ErreurSyntaxique } from './erreurs.js';
import { estLeMot, estMot } from './miseEnPage.js';
import type { Action, Theme } from './ast.js';

export const MODES = ['automatique', 'clair', 'sombre'];
const LARGEURS = ['etroite', 'normale', 'large', 'pleine'];
const ROLES_POLICE = ['titres', 'texte', 'code'];
const EXTENSIONS_POLICE = /\.(woff2|woff|ttf|otf)$/i;
/** Les noms que les variables CSS du projet utilisent déjà. */
const NOMS_PRIS = ['page', 'encre'];

/** « theme : » en haut du fichier. */
export function estTheme(flux: FluxTokens): boolean {
  return estLeMot(flux.actuel(), 'theme') && flux.regarder(1).type === 'PONCTUATION' && flux.regarder(1).valeur === ':';
}

function mot(flux: FluxTokens, description: string): string {
  const jeton = flux.actuel();
  if (!estMot(jeton)) {
    throw new ErreurSyntaxique(`il manque ${description} : à la place, on trouve « ${jeton.valeur || jeton.type} »`, jeton.ligne);
  }
  flux.avancer();
  return normaliser(jeton.original ?? jeton.valeur);
}

function couleurHexa(flux: FluxTokens, nom: string): string {
  const jeton = flux.attendre('CHAINE', undefined, `la couleur de « ${nom} » entre guillemets, par exemple "#0e5a6b"`);
  const forme = normaliserCouleur(jeton.valeur);
  if (!forme) {
    throw new ErreurSyntaxique(`« ${jeton.valeur} » n’est pas une couleur. Écrivez-la entre guillemets sous la forme "#0e5a6b" (ou "#fff").`, jeton.ligne);
  }
  return forme;
}

export function analyserTheme(flux: FluxTokens): Theme {
  const debut = flux.avancer();
  flux.avancer();
  const theme: Theme = { type: 'Theme', couleurs: [], polices: [], ligne: debut.ligne };
  flux.sauterFinsDeLigne();
  if (!flux.accepter('INDENT')) return theme;
  flux.sauterFinsDeLigne();
  while (!flux.verifier('DEDENT') && !flux.estFini()) {
    const ligne = flux.actuel().ligne;
    const genre = mot(flux, 'une ligne du thème (couleur, police, mode ou largeur)');
    if (genre === 'couleur') {
      const { nom: original } = flux.attendreNom('le nom de la couleur');
      const nom = normaliser(original);
      if (NOMS_PRIS.includes(nom)) {
        throw new ErreurSyntaxique(`le nom « ${nom} » est pris par le thème lui-même : choisissez un autre nom pour la couleur.`, ligne);
      }
      if (!/^[a-z][a-z0-9_]*$/.test(nom)) {
        throw new ErreurSyntaxique(`le nom de couleur « ${original} » ne doit contenir que des lettres, des chiffres et des tirets bas.`, ligne);
      }
      if (theme.couleurs.some((c) => c.nom === nom)) {
        throw new ErreurSyntaxique(`la couleur « ${nom} » est déjà déclarée dans le thème.`, ligne);
      }
      let clair: string;
      let sombre: string | undefined;
      if (estLeMot(flux.actuel(), 'clair')) {
        flux.avancer();
        clair = couleurHexa(flux, nom);
        if (!estLeMot(flux.actuel(), 'sombre')) {
          throw new ErreurSyntaxique(`il manque « sombre » suivi de la couleur du mode sombre : couleur ${nom} clair "${clair}" sombre "#…"`, flux.actuel().ligne);
        }
        flux.avancer();
        sombre = couleurHexa(flux, nom);
      } else {
        clair = couleurHexa(flux, nom);
      }
      theme.couleurs.push({ nom, clair, ...(sombre ? { sombre } : {}), ligne });
    } else if (genre === 'police') {
      const role = mot(flux, 'le rôle de la police (titres, texte ou code)');
      if (!ROLES_POLICE.includes(role)) {
        throw new ErreurSyntaxique(`« ${role} » n’est pas un rôle de police. Rôles possibles : ${ROLES_POLICE.join(', ')}.`, ligne);
      }
      if (theme.polices.some((p) => p.role === role)) {
        throw new ErreurSyntaxique(`la police « ${role} » est déjà déclarée dans le thème.`, ligne);
      }
      const nom = flux.attendre('CHAINE', undefined, 'le nom de la police entre guillemets').valeur;
      let fichier: string | undefined;
      if (estLeMot(flux.actuel(), 'depuis')) {
        flux.avancer();
        fichier = flux.attendre('CHAINE', undefined, 'le chemin du fichier de police entre guillemets').valeur;
        if (!EXTENSIONS_POLICE.test(fichier)) {
          throw new ErreurSyntaxique(`le fichier de police « ${fichier} » doit finir par .woff2, .woff, .ttf ou .otf.`, ligne);
        }
      }
      theme.polices.push({ role, nom, ...(fichier ? { fichier } : {}), ligne });
    } else if (genre === 'mode' || genre === 'largeur') {
      const permis = genre === 'mode' ? MODES : LARGEURS;
      const valeur = mot(flux, `la valeur de « ${genre} »`);
      if (!permis.includes(valeur)) {
        throw new ErreurSyntaxique(`« ${valeur} » n’est pas une valeur possible pour « ${genre} ». Valeurs possibles : ${permis.join(', ')}.`, ligne);
      }
      theme[genre] = { valeur, ligne };
    } else {
      throw new ErreurSyntaxique(`« ${genre} » n’est pas une ligne du thème. Lignes possibles : couleur, police, mode, largeur.`, ligne);
    }
    flux.sauterFinsDeLigne();
  }
  flux.accepter('DEDENT');
  return theme;
}

/** « changer theme par sombre » (ou par "sombre") : le choix du visiteur, gardé par son appareil. */
export function estChangerTheme(flux: FluxTokens): boolean {
  if (!(flux.verifier('MOT_CLE', 'changer') && estLeMot(flux.regarder(1), 'theme') && flux.regarder(2).valeur === 'par')) return false;
  const valeur = flux.regarder(3);
  return valeur.type === 'CHAINE' || (estMot(valeur) && MODES.includes(normaliser(valeur.valeur)));
}

export function analyserChangerTheme(flux: FluxTokens): Action {
  const debut = flux.avancer();
  flux.avancer();
  flux.avancer();
  const jeton = flux.avancer();
  const valeur = jeton.type === 'CHAINE' ? jeton.valeur : normaliser(jeton.valeur);
  return {
    type: 'Action',
    action: 'changerTheme',
    arguments: [{ type: 'Chaine', parties: [{ type: 'texte', valeur }], ligne: jeton.ligne }],
    ligne: debut.ligne,
  };
}
