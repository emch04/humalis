/**
 * Ce qui s'exécute sur le serveur : « seul gerant peut faire "rembourser" sur commande : »,
 * « tous les jours a 7 h : », et les instructions écrites dedans.
 */
import { FluxTokens } from './fluxTokens.js';
import { ErreurSyntaxique } from './erreurs.js';
import { chaqueLigne, estLeMot, analyserOperande, analyserExpression, analyserTestCombine, analyserCreationLiee, analyserEnvoiEmail, analyserEnvoiNotification, analyserTypeChamp } from './parser.js';
import type { ActionServeur, DocumentServeur, Expression, FiltreServeur, FrequenceTache, InstructionServeur, OperationCalcul, Qui, ResumeServeur, TachePlanifiee, TypeChamp } from './ast.js';

/** « faire "rembourser" sur commande : » (le « qui » et « peut » sont déjà lus). */
export function analyserActionServeur(flux: FluxTokens, qui: Qui, ligne: number): ActionServeur {
  flux.avancer();
  const nom = flux.attendre('CHAINE', undefined, 'le nom de l’action entre guillemets').valeur;
  if (!estLeMot(flux.actuel(), 'sur')) throw new ErreurSyntaxique(`on écrit : seul gerant peut faire "${nom}" sur commande :`, ligne);
  flux.avancer();
  const donnee = flux.attendreNom('la donnée sur laquelle agit cette action').nom;
  const parametres: { nom: string; type: TypeChamp; ligne: number }[] = [];
  if (estLeMot(flux.actuel(), 'avec')) {
    flux.avancer();
    do {
      const champ = flux.attendreNom('le nom de la valeur attendue');
      flux.attendre('PONCTUATION', ':', 'deux-points entre le nom de la valeur et son type (montant : nombre)');
      parametres.push({ nom: champ.nom, type: analyserTypeChamp(flux), ligne: champ.ligne });
    } while (flux.accepter('MOT_CLE', 'et'));
  }
  flux.attendre('PONCTUATION', ':', 'deux-points à la fin de l’action');
  return { type: 'ActionServeur', nom, qui, donnee, ...(parametres.length ? { parametres } : {}), corps: analyserCorpsServeur(flux), ligne };
}

/** « statut est "ouverte" et total est superieur a 100 », après « ou ». */
export function analyserFiltres(flux: FluxTokens): FiltreServeur[] {
  const filtres: FiltreServeur[] = [];
  do {
    const champ = flux.attendreNom('le champ à comparer').nom;
    if (!estLeMot(flux.actuel(), 'est')) throw new ErreurSyntaxique(`on écrit : ${champ} est "valeur", ou ${champ} est superieur a 10`, flux.actuel().ligne);
    flux.avancer();
    let operateur: FiltreServeur['operateur'] = 'egal';
    for (const mot of ['superieur', 'inferieur', 'different', 'egal'] as const) {
      if (estLeMot(flux.actuel(), mot)) {
        operateur = mot;
        flux.avancer();
        break;
      }
    }
    const valeur: Expression = analyserOperande(flux);
    filtres.push({ champ, operateur, valeur });
  } while (flux.accepter('MOT_CLE', 'et'));
  return filtres;
}

const filtresOptionnels = (flux: FluxTokens): FiltreServeur[] => {
  if (!estLeMot(flux.actuel(), 'ou')) return [];
  flux.avancer();
  return analyserFiltres(flux);
};

const OPERATIONS: OperationCalcul[] = ['somme', 'moyenne', 'minimum', 'maximum', 'nombre'];

/** « calcul recette = somme de … » : le nom, puis l'opération. */
function lireOperation(flux: FluxTokens): { nom: string; operation: OperationCalcul; ligne: number } {
  const exemple = 'calcul recette = somme de commande.total';
  const debut = flux.avancer();
  const nom = flux.attendreNom('le nom du calcul').nom;
  flux.attendre('PONCTUATION', '=', `« = » après le nom du calcul : ${exemple}`);
  const operation = OPERATIONS.find((o) => estLeMot(flux.actuel(), o));
  if (!operation) throw new ErreurSyntaxique(`sur le serveur, un calcul est une somme, une moyenne, un minimum, un maximum ou un nombre : ${exemple}`, debut.ligne);
  flux.avancer();
  return { nom, operation, ligne: debut.ligne };
}

/** « lire "resume" de commande ou statut est "payee" : » (le « qui » et « peut » sont déjà lus). */
export function analyserResume(flux: FluxTokens, qui: Qui, ligne: number): ResumeServeur {
  flux.avancer();
  const nom = flux.attendre('CHAINE', undefined, 'le nom du résumé entre guillemets').valeur;
  const donnee = flux.attendreNom('la donnée à résumer').nom;
  const filtres = filtresOptionnels(flux);
  flux.attendre('PONCTUATION', ':', 'deux-points à la fin du résumé');
  const resume: ResumeServeur = { type: 'ResumeServeur', nom, qui, donnee, filtres, calculs: [], ligne };
  chaqueLigne(flux, () => {
    if (estLeMot(flux.actuel(), 'regroupe')) {
      flux.avancer();
      flux.avancer();
      resume.regroupePar = flux.attendreNom('le champ qui regroupe les lignes').nom;
      return;
    }
    if (!estLeMot(flux.actuel(), 'calcul')) throw new ErreurSyntaxique('dans un résumé, on écrit « calcul recette = somme de total » ou « regroupe par statut ».', flux.actuel().ligne);
    const { nom: calcul, operation, ligne: ligneCalcul } = lireOperation(flux);
    const champ = flux.attendreNom('le champ à calculer').nom;
    resume.calculs.push({ nom: calcul, operation, ...(operation === 'nombre' ? {} : { champ }), ligne: ligneCalcul });
  });
  return resume;
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

/** « document "facture" de commande : » (« de » est déjà sauté par le lexer). */
export function analyserDocument(flux: FluxTokens): DocumentServeur {
  const debut = flux.avancer();
  const nom = flux.attendre('CHAINE', undefined, 'le nom du document entre guillemets').valeur;
  const donnee = flux.attendreNom('la donnée que montre ce document').nom;
  flux.attendre('PONCTUATION', ':', 'deux-points à la fin de « document »');
  const lignes: DocumentServeur['lignes'] = [];
  chaqueLigne(flux, () => {
    const mot = flux.actuel();
    if (estLeMot(mot, 'tableau')) {
      flux.avancer();
      const liee = flux.attendreNom('la donnée dont viennent les lignes').nom;
      const filtres = filtresOptionnels(flux);
      if (!estLeMot(flux.actuel(), 'avec') || !estLeMot(flux.regarder(1), 'colonnes')) throw new ErreurSyntaxique('on écrit : tableau de ligne ou commande est commande.id avec colonnes produit, quantite et prix', mot.ligne);
      flux.avancer();
      flux.avancer();
      const colonnes: string[] = [];
      while (!flux.verifier('FIN_LIGNE') && !flux.estFini()) {
        const jeton = flux.avancer();
        if (jeton.valeur !== ',' && !estLeMot(jeton, 'et')) colonnes.push(jeton.valeur);
      }
      lignes.push({ genre: 'tableau', donnee: liee, filtres, colonnes, ligne: mot.ligne });
      return;
    }
    const genre = estLeMot(mot, 'titre') ? 'titre' : estLeMot(mot, 'texte') ? 'texte' : null;
    if (genre === null || flux.regarder(1).type !== 'CHAINE') throw new ErreurSyntaxique('dans un document, on écrit « titre "…" » ou « texte "…" ».', mot.ligne);
    flux.avancer();
    const chaine = flux.avancer();
    lignes.push({ genre, parties: chaine.parties ?? [{ type: 'texte', valeur: chaine.valeur }], ligne: mot.ligne });
  });
  return { type: 'DocumentServeur', nom, donnee, lignes, ligne: debut.ligne };
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
    const filtres = filtresOptionnels(flux);
    flux.attendre('PONCTUATION', ':', 'deux-points à la fin de « pour chaque »');
    return { type: 'PourChaqueServeur', variable, donnee, filtres, corps: analyserCorpsServeur(flux), ligne };
  }
  if (estLeMot(debut, 'calcul')) {
    const { nom, operation } = lireOperation(flux);
    const donnee = flux.attendreNom('la donnée à calculer').nom;
    let champ: string | undefined;
    if (flux.actuel().valeur === '.') {
      flux.avancer();
      champ = flux.avancer().valeur;
    }
    if (operation !== 'nombre' && champ === undefined) throw new ErreurSyntaxique(`quel champ ? On écrit : calcul ${nom} = ${operation} de ${donnee}.total`, ligne);
    return { type: 'CalculServeur', nom, operation, donnee, ...(champ !== undefined ? { champ } : {}), filtres: filtresOptionnels(flux), ligne };
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
  // « mettre a jour activite "livraison" pour commande.client » : l'activité en direct, application fermée.
  if (estLeMot(debut, 'mettre') && estLeMot(flux.regarder(1), 'jour') && estLeMot(flux.regarder(2), 'activite')) {
    const exemple = 'mettre a jour activite "livraison" pour commande.client';
    flux.avancer();
    flux.avancer();
    flux.avancer();
    const nom = flux.attendre('CHAINE', undefined, `le nom de l’activité entre guillemets : ${exemple}`).valeur;
    flux.attendre('MOT_CLE', 'pour', `« pour » et la personne : ${exemple}`);
    const donnee = flux.attendreNom(`la fiche et son champ compte : ${exemple}`).nom;
    let pour: { genre: 'roles'; roles: string[] } | { genre: 'compte'; donnee: string; champ: string };
    if (flux.accepter('PONCTUATION', '.')) pour = { genre: 'compte', donnee, champ: flux.attendreNom(`le champ qui désigne le compte : ${exemple}`).nom };
    else pour = { genre: 'roles', roles: [donnee] };
    return { type: 'MiseAJourActivite', nom, pour, ligne };
  }
  if (estLeMot(debut, 'envoyer')) return { type: 'EmailServeur', envoi: analyserEnvoiEmail(flux), ligne };
  throw new ErreurSyntaxique(`sur le serveur, on écrit « si », « pour chaque », « calcul », « changer … par », « creer », « supprimer », « refuser » ou « envoyer … », mais « ${debut.original ?? debut.valeur} » a été trouvé`, ligne);
}
