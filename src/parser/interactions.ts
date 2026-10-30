/**
 * L'analyse syntaxique des interactions : les durées, la suite d'un
 * message (`pendant`, `sans disparaitre`, `avec action`), les minuteries
 * (`apres`, `toutes les`), `copier`, `partager`, `confirmer`, `fenetre` et
 * les tournures d'événement nouvelles (`appuie sur`, `ecrit dans`,
 * `arrete d'ecrire dans`, `arrive en bas de`, `l'ordre de … change`).
 *
 * Aucun de ces mots n'est un mot-clé du lexer : ils ne comptent qu'à leur
 * place (`estLeMot`). Ces fonctions vivent hors de `parser.ts` pour que les
 * chantiers du parser ne se marchent pas dessus ; elles reçoivent du parser
 * ce qu'il sait lire (un bloc, une expression, une condition).
 */
import type { Token } from '../lexer/types.js';
import { normaliser } from '../lexer/motsCles.js';
import type { FluxTokens } from './fluxTokens.js';
import { ErreurSyntaxique } from './erreurs.js';
import type {
  ArgumentPage,
  Comparaison,
  Confirmer,
  Copier,
  Duree,
  Evenement,
  Expression,
  Fenetre,
  Instruction,
  Minuterie,
  Partager,
  SuiteMessage,
  UniteDuree,
} from './ast.js';

/** Ce que le parser prête aux interactions. */
export interface OutilsParser {
  bloc(flux: FluxTokens): Instruction[];
  expression(flux: FluxTokens): Expression;
  comparaison(flux: FluxTokens): Comparaison;
  argumentPage(flux: FluxTokens): ArgumentPage;
}

/** Vrai si le token est ce mot, écrit comme mot-clé ou comme nom (sans accent ni majuscule). */
function estLeMot(token: Token, mot: string): boolean {
  return (token.type === 'MOT_CLE' || token.type === 'IDENTIFIANT') && normaliser(token.original ?? token.valeur) === mot;
}

const estNom = (t: Token) => t.type === 'IDENTIFIANT' || (t.type === 'MOT_CLE' && !t.reserve);

// ─── Les durées ───────────────────────────────────────────────────────────

const UNITES: Record<string, UniteDuree> = {
  milliseconde: 'milliseconde',
  millisecondes: 'milliseconde',
  ms: 'milliseconde',
  seconde: 'seconde',
  secondes: 'seconde',
  minute: 'minute',
  minutes: 'minute',
  heure: 'heure',
  heures: 'heure',
};

/** Le nombre de millisecondes d'une unité. */
export const MILLISECONDES: Record<UniteDuree, number> = { milliseconde: 1, seconde: 1000, minute: 60_000, heure: 3_600_000 };

/** L'unité de durée que ce token écrit, s'il en écrit une. */
export function uniteDe(token: Token): UniteDuree | undefined {
  if (token.type !== 'IDENTIFIANT' && token.type !== 'MOT_CLE') return undefined;
  return UNITES[normaliser(token.original ?? token.valeur)];
}

/** Une durée commence à `decalage` : un nombre (ou un nom) suivi d'une unité. */
export function estUneDuree(flux: FluxTokens, decalage = 0): boolean {
  const valeur = flux.regarder(decalage);
  return (valeur.type === 'NOMBRE' || estNom(valeur)) && uniteDe(flux.regarder(decalage + 1)) !== undefined;
}

/** « 3 secondes », « 1,5 seconde », « delai millisecondes ». */
export function lireDuree(flux: FluxTokens, outils: OutilsParser, exemple: string): Duree {
  const debut = flux.actuel();
  if (debut.type !== 'NOMBRE' && !estNom(debut)) {
    throw new ErreurSyntaxique(`il manque une durée : un nombre suivi de son unité, par exemple « ${exemple} ».`, debut.ligne);
  }
  const valeur = outils.expression(flux);
  const unite = uniteDe(flux.actuel());
  if (!unite) {
    throw new ErreurSyntaxique(
      `il manque l’unité de la durée après le nombre : millisecondes, secondes, minutes ou heures (par exemple « ${exemple} »).`,
      flux.actuel().ligne,
    );
  }
  flux.avancer();
  return { valeur, unite, ligne: debut.ligne };
}

// ─── Les messages ─────────────────────────────────────────────────────────

/**
 * Ce qui suit le texte d'un « afficher » : « pendant 10 secondes »,
 * « sans disparaitre », « avec action "Annuler" : » et son bloc. Rien de
 * tout cela : undefined.
 */
export function lireSuiteMessage(flux: FluxTokens, outils: OutilsParser, genre?: SuiteMessage['genre']): SuiteMessage | undefined {
  const suite: SuiteMessage = genre ? { genre } : {};
  for (;;) {
    if (estLeMot(flux.actuel(), 'pendant') && estUneDuree(flux, 1)) {
      flux.avancer();
      suite.duree = lireDuree(flux, outils, 'pendant 10 secondes');
    } else if (estLeMot(flux.actuel(), 'sans') && estLeMot(flux.regarder(1), 'disparaitre')) {
      flux.avancer();
      flux.avancer();
      suite.persistant = true;
    } else if (flux.verifier('MOT_CLE', 'avec') && estLeMot(flux.regarder(1), 'action')) {
      const ligne = flux.avancer().ligne;
      flux.avancer();
      const libelle = flux.attendre('CHAINE', undefined, 'le texte du bouton entre guillemets (avec action "Annuler" :)').valeur;
      flux.attendre('PONCTUATION', ':', 'deux-points après le texte du bouton, puis ce qu’il fait en dessous, décalé');
      suite.action = { libelle, corps: outils.bloc(flux), ligne };
    } else {
      break;
    }
  }
  return Object.keys(suite).length > 0 ? suite : undefined;
}

// ─── Les instructions ─────────────────────────────────────────────────────

/** Vrai si la ligne commence une instruction des interactions. */
export function estInteraction(flux: FluxTokens): boolean {
  const mot = flux.actuel();
  const suivant = flux.regarder(1);
  const valeurSuit = suivant.type === 'CHAINE' || suivant.type === 'NOMBRE' || estNom(suivant) || (suivant.type === 'PONCTUATION' && ['[', '('].includes(suivant.valeur));
  return (
    // « apres 3 secondes : » ; « apres 3 : » aussi, pour dire qu'il manque l'unité.
    ((estLeMot(mot, 'apres') || estLeMot(mot, 'toutes') || estLeMot(mot, 'tous')) && (estUneDuree(flux, 1) || suivant.type === 'NOMBRE')) ||
    ((estLeMot(mot, 'copier') || estLeMot(mot, 'partager') || estLeMot(mot, 'confirmer')) && valeurSuit) ||
    (estLeMot(mot, 'fenetre') && suivant.type === 'CHAINE')
  );
}

/** Lit l'instruction des interactions qui commence la ligne (estInteraction est vrai). */
export function analyserInteraction(flux: FluxTokens, outils: OutilsParser): Minuterie | Copier | Partager | Confirmer | Fenetre {
  const mot = flux.actuel();
  if (estLeMot(mot, 'copier')) return analyserCopier(flux, outils);
  if (estLeMot(mot, 'partager')) return analyserPartager(flux, outils);
  if (estLeMot(mot, 'confirmer')) return analyserConfirmer(flux, outils);
  if (estLeMot(mot, 'fenetre')) return analyserFenetre(flux, outils);
  return analyserMinuterie(flux, outils);
}

/** « apres 3 secondes : », « toutes les 5 secondes tant que actif est vrai : ». */
function analyserMinuterie(flux: FluxTokens, outils: OutilsParser): Minuterie {
  const debut = flux.avancer();
  const mode = estLeMot(debut, 'apres') ? 'apres' : 'toutes';
  const duree = lireDuree(flux, outils, mode === 'apres' ? 'apres 3 secondes' : 'toutes les 5 secondes');
  let tantQue: Comparaison | undefined;
  if (estLeMot(flux.actuel(), 'tant') && estLeMot(flux.regarder(1), 'que')) {
    flux.avancer();
    flux.avancer();
    tantQue = outils.comparaison(flux);
  }
  const ecrit = mode === 'apres' ? 'apres …' : 'toutes les …';
  flux.attendre('PONCTUATION', ':', `deux-points à la fin de « ${ecrit} », puis ce qu’il faut faire en dessous, décalé`);
  return { type: 'Minuterie', mode, duree, ...(tantQue ? { tantQue } : {}), corps: outils.bloc(flux), ligne: debut.ligne };
}

/** « copier code », « copier code avec message "Code copié" », « copier code sans message ». */
function analyserCopier(flux: FluxTokens, outils: OutilsParser): Copier {
  const debut = flux.avancer();
  const valeur = outils.expression(flux);
  if (flux.verifier('MOT_CLE', 'avec') && estLeMot(flux.regarder(1), 'message')) {
    flux.avancer();
    flux.avancer();
    const message = flux.attendre('CHAINE', undefined, 'le texte du message entre guillemets (copier code avec message "Code copié")').valeur;
    return { type: 'Copier', valeur, message, ligne: debut.ligne };
  }
  if (estLeMot(flux.actuel(), 'sans') && estLeMot(flux.regarder(1), 'message')) {
    flux.avancer();
    flux.avancer();
    return { type: 'Copier', valeur, message: null, ligne: debut.ligne };
  }
  return { type: 'Copier', valeur, ligne: debut.ligne };
}

/** « partager "…" avec titre "…" avec lien vers "produit" avec id p.id ». */
function analyserPartager(flux: FluxTokens, outils: OutilsParser): Partager {
  const debut = flux.avancer();
  const texte = outils.expression(flux);
  const partage: Partager = { type: 'Partager', texte, ligne: debut.ligne };
  while (flux.accepter('MOT_CLE', 'avec') || flux.accepter('MOT_CLE', 'et')) {
    const option = flux.actuel();
    if (estLeMot(option, 'titre')) {
      flux.avancer();
      partage.titre = outils.expression(flux);
    } else if (estLeMot(option, 'lien')) {
      flux.avancer();
      flux.accepter('MOT_CLE', 'vers');
      const adresse = flux.attendre('CHAINE', undefined, 'l’adresse du lien entre guillemets (avec lien "https://…" ou avec lien vers "produit")').valeur;
      partage.lien = { adresse };
    } else if (partage.lien && estNom(option)) {
      // « avec id p.id » : un paramètre de la page du lien, comme pour « rediriger vers ».
      (partage.lien.parametres ??= []).push(outils.argumentPage(flux));
    } else {
      throw new ErreurSyntaxique(
        `après « partager … avec », on écrit « titre "…" » ou « lien "…" » (ici : « ${option.original ?? option.valeur} »).`,
        option.ligne,
      );
    }
  }
  return partage;
}

/** « confirmer "Supprimer ?" avec oui "Supprimer" et non "Garder" : », son bloc, puis « sinon : » facultatif. */
function analyserConfirmer(flux: FluxTokens, outils: OutilsParser): Confirmer {
  const debut = flux.avancer();
  const question = outils.expression(flux);
  const reponses: { oui?: string; non?: string } = {};
  if (flux.accepter('MOT_CLE', 'avec')) {
    do {
      const reponse = flux.actuel();
      const quel = estLeMot(reponse, 'oui') ? 'oui' : estLeMot(reponse, 'non') ? 'non' : undefined;
      if (!quel) {
        throw new ErreurSyntaxique(
          `après « confirmer … avec », on nomme les boutons : avec oui "Supprimer" et non "Garder" (ici : « ${reponse.original ?? reponse.valeur} »).`,
          reponse.ligne,
        );
      }
      flux.avancer();
      reponses[quel] = flux.attendre('CHAINE', undefined, `le texte du bouton « ${quel} » entre guillemets`).valeur;
    } while (flux.accepter('MOT_CLE', 'et'));
  }
  flux.attendre('PONCTUATION', ':', 'deux-points à la fin de « confirmer … », puis ce qu’il faut faire si la personne répond oui, décalé');
  const alors = outils.bloc(flux);
  let sinon: Instruction[] = [];
  flux.sauterFinsDeLigne();
  if (flux.accepter('MOT_CLE', 'sinon')) {
    flux.attendre('PONCTUATION', ':', 'deux-points après « sinon »');
    sinon = outils.bloc(flux);
  }
  return { type: 'Confirmer', question, ...reponses, alors, sinon, ligne: debut.ligne };
}

/** « fenetre "Détails" avec nom "…" et description "…" et obligatoire et style "…" : ». */
function analyserFenetre(flux: FluxTokens, outils: OutilsParser): Fenetre {
  const debut = flux.avancer();
  const titre = flux.attendre('CHAINE', undefined, 'le titre de la fenêtre entre guillemets').valeur;
  const fenetre: Fenetre = { type: 'Fenetre', titre, classes: [], corps: [], ligne: debut.ligne };
  if (flux.accepter('MOT_CLE', 'avec')) {
    do {
      const option = flux.actuel();
      if (estLeMot(option, 'nom')) {
        flux.avancer();
        fenetre.nom = flux.attendre('CHAINE', undefined, 'le nom de la fenêtre entre guillemets').valeur;
      } else if (estLeMot(option, 'description')) {
        flux.avancer();
        fenetre.description = flux.attendre('CHAINE', undefined, 'la description entre guillemets').valeur;
      } else if (estLeMot(option, 'obligatoire')) {
        flux.avancer();
        fenetre.obligatoire = true;
      } else if (estLeMot(option, 'style')) {
        flux.avancer();
        fenetre.classes.push(...flux.attendre('CHAINE', undefined, 'le nom de la classe CSS entre guillemets').valeur.split(/\s+/).filter(Boolean));
      } else {
        throw new ErreurSyntaxique(
          `« ${option.original ?? option.valeur} » n’est pas une option de fenêtre. Options possibles : nom, description, obligatoire, style.`,
          option.ligne,
        );
      }
    } while (flux.accepter('MOT_CLE', 'et'));
  }
  flux.attendre('PONCTUATION', ':', 'deux-points à la fin de la ligne « fenetre », puis son contenu en dessous, décalé');
  fenetre.corps = outils.bloc(flux);
  return fenetre;
}

// ─── Les événements ───────────────────────────────────────────────────────

type SuiteEvenement = Omit<Evenement, 'type' | 'corps' | 'ligne'>;

/**
 * Les tournures après « quand l'utilisateur » : « appuie sur "…" [dans "…"] »,
 * « ecrit dans "…" », « arrete d'ecrire dans "…" [apres …] », « arrive en
 * bas de "…" [tant que …] [avec bouton "…" | sans bouton] ». undefined si
 * ce n'en est pas une.
 */
export function lireEvenementUtilisateur(flux: FluxTokens, outils: OutilsParser): SuiteEvenement | undefined {
  const mot = flux.actuel();
  if (estLeMot(mot, 'appuie') || estLeMot(mot, 'appuies')) {
    flux.avancer();
    flux.attendre('MOT_CLE', 'sur', '« sur » suivi des touches entre guillemets (appuie sur "controle+k")');
    const touches = flux.attendre('CHAINE', undefined, 'les touches entre guillemets, par exemple "controle+k"').valeur;
    const cible = flux.accepter('MOT_CLE', 'dans') ? flux.attendre('CHAINE', undefined, 'le nom du champ entre guillemets').valeur : undefined;
    return { genre: 'touche', touches, ...(cible !== undefined ? { cible } : {}) };
  }
  if (estLeMot(mot, 'ecrit') || estLeMot(mot, 'ecrire')) {
    flux.avancer();
    flux.attendre('MOT_CLE', 'dans', '« dans » suivi du nom du champ (ecrit dans "recherche")');
    return { genre: 'saisie', cible: flux.attendre('CHAINE', undefined, 'le nom du champ entre guillemets').valeur };
  }
  if (estLeMot(mot, 'arrete') && estLeMot(flux.regarder(1), 'ecrire')) {
    flux.avancer();
    flux.avancer();
    flux.attendre('MOT_CLE', 'dans', '« dans » suivi du nom du champ (arrete d’ecrire dans "recherche")');
    const cible = flux.attendre('CHAINE', undefined, 'le nom du champ entre guillemets').valeur;
    let duree: Duree | undefined;
    if (estLeMot(flux.actuel(), 'apres')) {
      flux.avancer();
      duree = lireDuree(flux, outils, 'apres 300 millisecondes');
    }
    return { genre: 'pauseSaisie', cible, ...(duree ? { duree } : {}) };
  }
  if (estLeMot(mot, 'arrive') && estLeMot(flux.regarder(1), 'en') && estLeMot(flux.regarder(2), 'bas')) {
    flux.avancer();
    flux.avancer();
    flux.avancer();
    const suite: SuiteEvenement = { genre: 'bas', cible: flux.attendre('CHAINE', undefined, 'le nom du bloc entre guillemets (arrive en bas de "catalogue")').valeur };
    for (;;) {
      if (estLeMot(flux.actuel(), 'tant') && estLeMot(flux.regarder(1), 'que')) {
        flux.avancer();
        flux.avancer();
        suite.tantQue = outils.comparaison(flux);
      } else if (flux.verifier('MOT_CLE', 'avec') && estLeMot(flux.regarder(1), 'bouton')) {
        flux.avancer();
        flux.avancer();
        suite.bouton = flux.attendre('CHAINE', undefined, 'le texte du bouton entre guillemets (avec bouton "Voir plus")').valeur;
      } else if (estLeMot(flux.actuel(), 'sans') && estLeMot(flux.regarder(1), 'bouton')) {
        flux.avancer();
        flux.avancer();
        suite.bouton = null;
      } else {
        break;
      }
    }
    return suite;
  }
  return undefined;
}

/** « quand l'ordre de taches change » (le « l' » et le « de » sont des petits mots, déjà sautés). */
export function estEvenementOrdre(flux: FluxTokens): boolean {
  return estLeMot(flux.actuel(), 'ordre') && estNom(flux.regarder(1)) && estLeMot(flux.regarder(2), 'change');
}

export function lireEvenementOrdre(flux: FluxTokens): SuiteEvenement {
  flux.avancer();
  const variable = flux.attendreNom('le nom de la liste').nom;
  flux.avancer();
  return { genre: 'ordre', variable };
}
