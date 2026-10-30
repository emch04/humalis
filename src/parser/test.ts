import type { Token } from '../lexer/types.js';
import { normaliser } from '../lexer/motsCles.js';
import { FluxTokens } from './fluxTokens.js';
import { ErreurSyntaxique } from './erreurs.js';
import type { CasTest, EtapeTest } from './ast.js';

/**
 * Les tests écrits en Humalis (décision O3) : « test "…" de page "…" : »,
 * puis une étape par ligne. Les mots (« cliquer », « verifier »…) ne sont
 * reconnus qu'ici : ailleurs, ce sont des noms ordinaires.
 */

const est = (token: Token, mot: string) =>
  (token.type === 'MOT_CLE' || token.type === 'IDENTIFIANT') && normaliser(token.original ?? token.valeur) === mot;

/** « test "…" de page "…" » commence un test ; « test » seul reste un nom. */
export function estUnTest(flux: FluxTokens): boolean {
  return est(flux.actuel(), 'test') && flux.regarder(1).type === 'CHAINE';
}

export function analyserTest(flux: FluxTokens): CasTest {
  const debut = flux.avancer();
  const nom = flux.attendre('CHAINE', undefined, 'le nom du test entre guillemets').valeur;
  flux.attendre('MOT_CLE', 'page', '« de page » suivi du nom de la page testée');
  const page = flux.attendre('CHAINE', undefined, 'le nom de la page testée entre guillemets').valeur;
  flux.attendre('PONCTUATION', ':', 'deux-points après le nom de la page, puis les étapes du test en dessous, décalées');
  const etapes: EtapeTest[] = [];
  flux.sauterFinsDeLigne();
  if (flux.accepter('INDENT')) {
    flux.sauterFinsDeLigne();
    while (!flux.verifier('DEDENT') && !flux.estFini()) {
      etapes.push(analyserEtape(flux));
      flux.sauterFinsDeLigne();
    }
    flux.accepter('DEDENT');
  }
  return { type: 'Test', nom, page, etapes, ligne: debut.ligne };
}

const chaine = (flux: FluxTokens, description: string) => flux.attendre('CHAINE', undefined, description).valeur;

function analyserEtape(flux: FluxTokens): EtapeTest {
  const debut = flux.actuel();
  const ligne = debut.ligne;
  if (est(debut, 'cliquer')) {
    flux.avancer();
    flux.attendre('MOT_CLE', 'sur', '« sur » suivi du libellé ou du nom de l\'élément');
    return { type: 'Cliquer', cible: chaine(flux, 'le libellé de l\'élément entre guillemets'), ligne };
  }
  if (est(debut, 'remplir')) {
    flux.avancer();
    flux.attendre('MOT_CLE', 'champ', '« champ » suivi du libellé du champ');
    const cible = chaine(flux, 'le libellé du champ entre guillemets');
    flux.attendre('MOT_CLE', 'avec', '« avec » suivi du texte à écrire');
    return { type: 'RemplirChamp', cible, valeur: chaine(flux, 'le texte à écrire entre guillemets'), ligne };
  }
  if (est(debut, 'aller')) {
    flux.avancer();
    flux.attendre('MOT_CLE', 'vers', '« vers » suivi du nom de la page');
    return { type: 'AllerVers', cible: chaine(flux, 'le nom de la page entre guillemets'), ligne };
  }
  if (est(debut, 'verifier')) {
    flux.avancer();
    if (est(flux.actuel(), 'que')) flux.avancer();
    if (flux.accepter('MOT_CLE', 'texte')) {
      const cible = chaine(flux, 'le texte attendu entre guillemets');
      flux.attendre('MOT_CLE', 'est', '« est visible » ou « est absent »');
      const etat = flux.actuel();
      if (est(etat, 'visible')) {
        flux.avancer();
        return { type: 'VerifierTexteVisible', cible, ligne };
      }
      if (est(etat, 'absent')) {
        flux.avancer();
        return { type: 'VerifierTexteAbsent', cible, ligne };
      }
      throw new ErreurSyntaxique('après « est », écrivez « visible » ou « absent ».', etat.ligne);
    }
    if (flux.accepter('MOT_CLE', 'page')) {
      flux.attendre('MOT_CLE', 'est', '« est » suivi du nom de la page attendue');
      return { type: 'VerifierPage', cible: chaine(flux, 'le nom de la page attendue entre guillemets'), ligne };
    }
    if (flux.accepter('MOT_CLE', 'champ')) {
      const cible = chaine(flux, 'le libellé du champ entre guillemets');
      if (!est(flux.actuel(), 'vaut')) {
        throw new ErreurSyntaxique('il manque « vaut » suivi du texte attendu dans le champ.', flux.actuel().ligne);
      }
      flux.avancer();
      return { type: 'VerifierChamp', cible, valeur: chaine(flux, 'le texte attendu entre guillemets'), ligne };
    }
    throw new ErreurSyntaxique(
      'après « verifier que », écrivez texte "…" est visible, texte "…" est absent, page est "…" ou champ "…" vaut "…".',
      ligne,
    );
  }
  throw new ErreurSyntaxique(
    `étape de test inconnue : « ${debut.original ?? debut.valeur} ». Étapes possibles : cliquer sur, remplir champ … avec, aller vers, verifier que …`,
    ligne,
  );
}
