/**
 * Ce qui s'exécute sur le serveur : « seul gerant peut faire "rembourser" sur commande : »,
 * « tous les jours a 7 h : », et les instructions écrites dedans.
 */
import { FluxTokens } from './fluxTokens.js';
import { ErreurSyntaxique } from './erreurs.js';
import { chaqueLigne, estLeMot, analyserOperande, analyserExpression, analyserTestCombine, analyserCreationLiee, analyserEnvoiEmail, analyserEnvoiNotification } from './parser.js';
import type { ActionServeur, FrequenceTache, InstructionServeur, Qui, TachePlanifiee } from './ast.js';

/** « faire "rembourser" sur commande : » (le « qui » et « peut » sont déjà lus). */
export function analyserActionServeur(flux: FluxTokens, qui: Qui, ligne: number): ActionServeur {
  flux.avancer();
  const nom = flux.attendre('CHAINE', undefined, 'le nom de l’action entre guillemets').valeur;
  if (!estLeMot(flux.actuel(), 'sur')) throw new ErreurSyntaxique(`on écrit : seul gerant peut faire "${nom}" sur commande :`, ligne);
  flux.avancer();
  const donnee = flux.attendreNom('la donnée sur laquelle agit cette action').nom;
  flux.attendre('PONCTUATION', ':', 'deux-points à la fin de l’action');
  return { type: 'ActionServeur', nom, qui, donnee, corps: analyserCorpsServeur(flux), ligne };
}

const estFrequence = (flux: FluxTokens) => {
  const mot = flux.actuel();
  return estLeMot(mot, 'chaque') || estLeMot(mot, 'tous') || estLeMot(mot, 'toutes') || estLeMot(mot, 'tout');
};

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** « a 7 h », « a 7 h 30 » (« a » est déjà sauté par le lexer). */
function lireHeure(flux: FluxTokens): { heure: number; minute: number } {
  const exemple = 'tous les jours a 7 h :';
  if (flux.actuel().type !== 'NOMBRE') throw new ErreurSyntaxique(`à quelle heure ? Écrivez par exemple : ${exemple}`, flux.actuel().ligne);
  const jeton = flux.avancer();
  const heure = Number(jeton.valeur);
  if (!Number.isInteger(heure) || heure < 0 || heure > 23) throw new ErreurSyntaxique(`« ${heure} h » n'est pas une heure : écrivez un nombre entre 0 et 23.`, jeton.ligne);
  if (!estLeMot(flux.actuel(), 'h')) throw new ErreurSyntaxique(`après le nombre, écrivez « h » : ${exemple}`, jeton.ligne);
  flux.avancer();
  if (flux.actuel().type !== 'NOMBRE') return { heure, minute: 0 };
  const minute = Number(flux.avancer().valeur);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new ErreurSyntaxique(`« ${minute} » n'est pas un nombre de minutes : écrivez un nombre entre 0 et 59.`, jeton.ligne);
  return { heure, minute };
}

/** La ligne commence-t-elle une tâche planifiée ? */
export const estTache = estFrequence;

export function analyserTache(flux: FluxTokens): TachePlanifiee {
  const debut = flux.avancer();
  const chaque = estLeMot(debut, 'chaque');
  const unite = flux.actuel();
  let frequence: FrequenceTache;
  const jour = JOURS.findIndex((j) => estLeMot(unite, j));
  if (chaque && jour >= 0) {
    flux.avancer();
    frequence = { genre: 'semaine', jour, ...lireHeure(flux) };
  } else if (!chaque && (estLeMot(unite, 'jours') || estLeMot(unite, 'jour'))) {
    flux.avancer();
    frequence = { genre: 'jour', ...lireHeure(flux) };
  } else if (!chaque && (estLeMot(unite, 'heures') || estLeMot(unite, 'heure'))) {
    flux.avancer();
    frequence = { genre: 'heure' };
  } else {
    throw new ErreurSyntaxique('on écrit : tous les jours a 7 h :, toutes les heures : ou chaque lundi a 8 h :', debut.ligne);
  }
  flux.attendre('PONCTUATION', ':', 'deux-points à la fin de la tâche');
  return { type: 'TachePlanifiee', frequence, corps: analyserCorpsServeur(flux), ligne: debut.ligne };
}

/** Le bloc d'instructions d'une action ou d'une tâche. */
export function analyserCorpsServeur(flux: FluxTokens): InstructionServeur[] {
  const corps: InstructionServeur[] = [];
  chaqueLigne(flux, () => {
    corps.push(analyserInstructionServeur(flux));
  });
  return corps;
}

function analyserInstructionServeur(flux: FluxTokens): InstructionServeur {
  const debut = flux.actuel();
  const { ligne } = debut;
  if (estLeMot(debut, 'si')) {
    flux.avancer();
    const test = analyserTestCombine(flux);
    flux.attendre('PONCTUATION', ':', 'deux-points à la fin de la condition');
    const alors = analyserCorpsServeur(flux);
    flux.sauterFinsDeLigne();
    let sinon: InstructionServeur[] = [];
    if (estLeMot(flux.actuel(), 'sinon')) {
      flux.avancer();
      flux.attendre('PONCTUATION', ':', 'deux-points après « sinon »');
      sinon = analyserCorpsServeur(flux);
    }
    return { type: 'SiServeur', test, alors, sinon, ligne };
  }
  if (estLeMot(debut, 'pour')) {
    const exemple = 'pour chaque c dans commande ou statut est "en_attente" :';
    flux.avancer();
    if (!estLeMot(flux.actuel(), 'chaque')) throw new ErreurSyntaxique(`on écrit : ${exemple}`, ligne);
    flux.avancer();
    const variable = flux.attendreNom('le nom de chaque fiche').nom;
    if (!estLeMot(flux.actuel(), 'dans')) throw new ErreurSyntaxique(`on écrit : ${exemple}`, ligne);
    flux.avancer();
    const donnee = flux.attendreNom('la donnée à parcourir').nom;
    let filtre: { champ: string; valeur: ReturnType<typeof analyserOperande> } | undefined;
    if (estLeMot(flux.actuel(), 'ou')) {
      flux.avancer();
      const champ = flux.attendreNom('le champ à comparer').nom;
      if (!estLeMot(flux.actuel(), 'est')) throw new ErreurSyntaxique(`on écrit : ${exemple}`, ligne);
      flux.avancer();
      filtre = { champ, valeur: analyserOperande(flux) };
    }
    flux.attendre('PONCTUATION', ':', 'deux-points à la fin de « pour chaque »');
    return { type: 'PourChaqueServeur', variable, donnee, ...(filtre ? { filtre } : {}), corps: analyserCorpsServeur(flux), ligne };
  }
  if (estLeMot(debut, 'changer')) {
    flux.avancer();
    const cible = flux.attendreNom('la fiche à changer').nom;
    if (flux.actuel().valeur !== '.') throw new ErreurSyntaxique('on écrit : changer commande.statut par "remboursee"', ligne);
    flux.avancer();
    const champ = flux.avancer().valeur;
    if (!estLeMot(flux.actuel(), 'par')) throw new ErreurSyntaxique('on écrit : changer commande.statut par "remboursee"', ligne);
    flux.avancer();
    return { type: 'ChangerChamp', cible, champ, valeur: analyserExpression(flux), ligne };
  }
  if (estLeMot(debut, 'supprimer')) {
    flux.avancer();
    return { type: 'SupprimerFiche', cible: flux.attendreNom('la fiche à supprimer').nom, ligne };
  }
  if (estLeMot(debut, 'refuser')) {
    flux.avancer();
    return { type: 'Refuser', message: analyserExpression(flux), ligne };
  }
  if (estLeMot(debut, 'creer')) return { type: 'CreerFiche', creation: analyserCreationLiee(flux), ligne };
  if (estLeMot(debut, 'envoyer') && estLeMot(flux.regarder(1), 'notification')) return { type: 'NotificationServeur', envoi: analyserEnvoiNotification(flux), ligne };
  if (estLeMot(debut, 'envoyer')) return { type: 'EmailServeur', envoi: analyserEnvoiEmail(flux), ligne };
  throw new ErreurSyntaxique(`sur le serveur, on écrit « si », « pour chaque », « changer … par », « creer », « supprimer », « refuser » ou « envoyer … », mais « ${debut.original ?? debut.valeur} » a été trouvé`, ligne);
}
