/**
 * L'analyse syntaxique de la mise en page : les options à
 * tournure propre (`colle en bas`, `degrade bleu vers violet`), les blocs
 * `sur telephone :`, le bloc `theme :`, l'en-tête et le pied de page.
 *
 * Ces fonctions vivent hors de `parser.ts` pour que les autres chantiers
 * du parser ne se marchent pas dessus. Elles reçoivent le flux de tokens
 * et, quand elles ont besoin de lire un bloc indenté, la fonction qui le
 * lit (`corps`).
 */
import type { Token } from '../lexer/types.js';
import { normaliser } from '../lexer/motsCles.js';
import { estDirectionDegrade } from '../analyse/styles.js';
import type { FluxTokens } from './fluxTokens.js';
import { ErreurSyntaxique } from './erreurs.js';
import type { Bloc, Disposition, Instruction, Style } from './ast.js';
import { analyserOptionMedia } from './medias.js';

/** Vrai si le token est ce mot, écrit comme mot-clé ou comme nom (sans accent ni majuscule). */
export function estLeMot(token: Token, mot: string): boolean {
  return (token.type === 'MOT_CLE' || token.type === 'IDENTIFIANT') && normaliser(token.original ?? token.valeur) === mot;
}

export const estMot = (token: Token) => token.type === 'IDENTIFIANT' || token.type === 'MOT_CLE';

/**
 * Les options dont la tournure n'est pas « nom valeur » :
 * - `colle` et `colle en bas` ;
 * - `degrade bleu vers violet` et `degrade bleu vers violet vertical`.
 * Le nom de l'option est déjà lu. Renvoie undefined pour les autres.
 */
export function analyserStylePropre(flux: FluxTokens, propriete: Token): Style | undefined {
  const nom = normaliser(propriete.original ?? propriete.valeur);
  if (nom === 'colle') {
    if (estLeMot(flux.actuel(), 'en') && (estLeMot(flux.regarder(1), 'bas') || estLeMot(flux.regarder(1), 'haut'))) {
      flux.avancer();
      return { propriete: 'colle', valeur: normaliser(flux.avancer().valeur) };
    }
    return { propriete: 'colle', valeur: 'haut' };
  }
  // Les réglages sans valeur : « modifiable », « ouvert », « plusieurs », « pourcentage ».
  if (DRAPEAUX.includes(nom)) return { propriete: nom, valeur: 'oui' };
  // « automatique » seul vaut 5 secondes ; « automatique 8 » en dit plus.
  if (nom === 'automatique' && flux.actuel().type !== 'NOMBRE') return { propriete: nom, valeur: '5' };
  // « photo "{p.photo}" » : un texte, avec ses {variables}.
  if (nom === 'photo') {
    const jeton = flux.attendre('CHAINE', undefined, 'l’image entre guillemets : avec photo "camille.jpg"');
    return { propriete: nom, valeur: jeton.valeur, parties: jeton.parties ?? [] };
  }
  const media = analyserOptionMedia(flux, nom);
  if (media) return media;
  if (nom === 'degrade') {
    if (!estMot(flux.actuel())) {
      throw new ErreurSyntaxique('un dégradé va d’une couleur à une autre : « degrade bleu vers violet »', flux.actuel().ligne);
    }
    const premiere = flux.avancer().valeur;
    if (!flux.accepter('MOT_CLE', 'vers')) {
      throw new ErreurSyntaxique(`il manque « vers » après « ${premiere} » : « degrade ${premiere} vers violet »`, flux.actuel().ligne);
    }
    if (!estMot(flux.actuel())) {
      throw new ErreurSyntaxique(`il manque la deuxième couleur du dégradé : « degrade ${premiere} vers violet »`, flux.actuel().ligne);
    }
    const deuxieme = flux.avancer().valeur;
    let direction = '';
    if (estMot(flux.actuel()) && estDirectionDegrade(flux.actuel().valeur)) direction = `-${flux.avancer().valeur}`;
    return { propriete: 'degrade', valeur: `${premiere}-${deuxieme}${direction}` };
  }
  return undefined;
}

/** Ce que les analyseurs de blocs demandent à `parser.ts`. */
export interface Lecteur {
  /** Lit le bloc indenté qui suit. */
  corps(flux: FluxTokens): Instruction[];
  /** Lit une option de style (« fond vert ») après « avec » ou « et ». */
  style?(flux: FluxTokens): Style;
}

const APPAREILS = ['telephone', 'tablette', 'ordinateur'];
const DRAPEAUX = ['modifiable', 'ouvert', 'plusieurs', 'pourcentage', 'boucle', 'fixe'];

/** « sur telephone : », « sur tablette ou ordinateur : » (en tête de ligne, suivi d'un appareil). */
export function estSurAppareil(flux: FluxTokens): boolean {
  return flux.verifier('MOT_CLE', 'sur') && estMot(flux.regarder(1)) && APPAREILS.includes(normaliser(flux.regarder(1).valeur));
}

export function analyserSurAppareil(flux: FluxTokens, lecteur: Lecteur): Bloc {
  const debut = flux.avancer();
  const styles: Style[] = [];
  do {
    const jeton = flux.actuel();
    const appareil = normaliser(jeton.valeur);
    if (!estMot(jeton) || !APPAREILS.includes(appareil)) {
      throw new ErreurSyntaxique(`« ${jeton.valeur} » n’est pas un appareil. Appareils possibles : ${APPAREILS.join(', ')}.`, jeton.ligne);
    }
    if (styles.some((s) => s.valeur === appareil)) {
      throw new ErreurSyntaxique(`l’appareil « ${appareil} » est écrit deux fois dans la même ligne « sur ».`, jeton.ligne);
    }
    flux.avancer();
    styles.push({ propriete: 'sur', valeur: appareil });
  } while (flux.accepter('MOT_CLE', 'ou'));
  flux.attendre('PONCTUATION', ':', 'deux-points à la fin de la ligne « sur », puis son contenu en dessous, décalé');
  return { type: 'Bloc', genre: 'appareil', styles, classes: [], corps: lecteur.corps(flux), ligne: debut.ligne };
}

// ─── L'en-tête et le pied de page communs ────────────────────────────────

/** « entete : », « pied avec colle : » en haut du fichier. */
export function estDisposition(flux: FluxTokens): boolean {
  if (!(estLeMot(flux.actuel(), 'entete') || estLeMot(flux.actuel(), 'pied'))) return false;
  const suivant = flux.regarder(1);
  return (suivant.type === 'PONCTUATION' && suivant.valeur === ':') || (suivant.type === 'MOT_CLE' && suivant.valeur === 'avec');
}

export function analyserDisposition(flux: FluxTokens, lecteur: Required<Lecteur>): Disposition {
  const debut = flux.avancer();
  const genre = normaliser(debut.original ?? debut.valeur) as 'entete' | 'pied';
  const styles: Style[] = [];
  const classes: string[] = [];
  if (flux.accepter('MOT_CLE', 'avec')) {
    do {
      if (flux.verifier('MOT_CLE', 'style')) {
        flux.avancer();
        const valeur = flux.attendre('CHAINE', undefined, 'le nom de la classe CSS entre guillemets').valeur;
        classes.push(...valeur.split(/\s+/).filter(Boolean));
      } else {
        styles.push(lecteur.style(flux));
      }
    } while (flux.accepter('MOT_CLE', 'et'));
  }
  flux.attendre('PONCTUATION', ':', `deux-points à la fin de la ligne « ${genre} », puis son contenu en dessous, décalé`);
  return { type: 'Disposition', genre, styles, classes, corps: lecteur.corps(flux), ligne: debut.ligne };
}

/** « sans entete », « sans pied » (et « et » entre les deux), après le nom d'une page. */
export function analyserSansDisposition(flux: FluxTokens): { sansEntete?: boolean; sansPied?: boolean } {
  const resultat: { sansEntete?: boolean; sansPied?: boolean } = {};
  while (estLeMot(flux.actuel(), 'sans')) {
    flux.avancer();
    const jeton = flux.actuel();
    const quoi = normaliser(jeton.original ?? jeton.valeur);
    if (!estMot(jeton) || (quoi !== 'entete' && quoi !== 'pied')) {
      throw new ErreurSyntaxique('après « sans », il faut « entete » ou « pied » : page "connexion" sans entete et sans pied :', jeton.ligne);
    }
    flux.avancer();
    if (quoi === 'entete') resultat.sansEntete = true;
    else resultat.sansPied = true;
    flux.accepter('MOT_CLE', 'et');
  }
  return resultat;
}
