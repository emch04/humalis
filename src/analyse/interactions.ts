/**
 * Les vérifications des interactions : messages, minuteries, copier et
 * partager, confirmations, fenêtres, raccourcis, recherche pendant la
 * frappe, défilement infini, glisser-déposer.
 *
 * L'analyse d'une page (`analyse.ts`) prête ce qu'elle sait faire (types,
 * comparaisons, blocs) ; ce fichier dit ce qui est permis, en français, avec
 * la ligne. Il vit à part pour que les chantiers de l'analyse ne se marchent
 * pas dessus.
 */
import type {
  Action,
  Boucle,
  Element,
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
} from '../parser/ast.js';
import { normaliser } from '../lexer/motsCles.js';
import { MILLISECONDES } from '../parser/interactions.js';
import { type TypeValeur, decrireType, estConnu } from './types.js';

/** Ce que l'analyse d'une page prête aux interactions. */
export interface Hote {
  erreur(message: string, ligne: number): void;
  avertissement(message: string, ligne: number): void;
  typeDe(expression: Expression): TypeValeur;
}

// ─── Les durées ───────────────────────────────────────────────────────────

/** La durée en millisecondes, quand elle est écrite en chiffres ; sinon undefined (une variable). */
export function millisecondesDe(duree: Duree): number | undefined {
  return duree.valeur.type === 'Nombre' ? Math.round(duree.valeur.valeur * MILLISECONDES[duree.unite]) : undefined;
}

/** « 1,5 seconde » : une durée écrite pour un message d'erreur. */
function ecrireDuree(ms: number): string {
  if (ms < 1000) return `${ms} millisecondes`;
  const secondes = String(ms / 1000).replace('.', ',');
  return `${secondes} seconde${ms >= 2000 ? 's' : ''}`;
}

/** Une durée est un nombre ; écrite en chiffres, elle doit être entre `min` et `max` millisecondes. */
function verifierDuree(hote: Hote, duree: Duree, usage: string): number | undefined {
  const type = hote.typeDe(duree.valeur);
  if (estConnu(type) && type.genre !== 'nombre') {
    hote.erreur(`une durée est un nombre suivi de son unité (${usage}) ; ici, c’est ${decrireType(type)}.`, duree.ligne);
    return undefined;
  }
  const ms = millisecondesDe(duree);
  if (ms !== undefined && ms <= 0) {
    hote.erreur(`une durée doit être plus grande que zéro (${usage}).`, duree.ligne);
    return undefined;
  }
  return ms;
}

// ─── Les messages ─────────────────────────────────────────────────────────

/** « afficher reussite "…" pendant 10 secondes avec action "Annuler" : » ; le bloc de l'action est lu par l'appelant. */
export function verifierMessage(hote: Hote, action: Action, dansLaPage: boolean, dansUneMinuterie: boolean): void {
  const suite = action.message;
  if (!suite) return;
  if (dansLaPage) {
    hote.erreur(
      'un message de réussite ou d’avertissement, avec une durée ou un bouton, s’affiche dans un événement (quand …) : dans la page, « afficher "…" » écrit simplement un texte.',
      action.ligne,
    );
    return;
  }
  if (suite.duree) {
    const ms = verifierDuree(hote, suite.duree, 'pendant 10 secondes');
    if (ms !== undefined && (ms < 1000 || ms > 60_000)) {
      hote.erreur(`un message reste affiché de 1 à 60 secondes (ici : ${ecrireDuree(ms)}). Pour qu’il reste, écrivez « sans disparaitre ».`, suite.duree.ligne);
    } else if (ms !== undefined && action.action === 'afficherErreur' && ms < 4000) {
      hote.avertissement(`${ecrireDuree(ms)}, c’est trop court pour lire une erreur : laissez au moins 4 secondes (8 par défaut).`, suite.duree.ligne);
    }
    if (suite.persistant) hote.erreur('« pendant … » et « sans disparaitre » se contredisent : gardez l’un des deux.', action.ligne);
  }
  if (suite.action) {
    if (suite.action.corps.length === 0) {
      hote.erreur(`le bouton « ${suite.action.libelle} » du message ne fait rien : écrivez en dessous, décalé, ce qu’il fait.`, suite.action.ligne);
    }
    if (suite.action.libelle.trim() === '') hote.erreur('le bouton d’un message a besoin d’un texte : avec action "Annuler" :', suite.action.ligne);
    if (dansUneMinuterie) {
      hote.avertissement('un message avec un bouton, dans une minuterie : il peut disparaître avant que la personne le voie. Écrivez-le plutôt dans l’événement d’un clic.', action.ligne);
    }
  }
}

// ─── Les minuteries ───────────────────────────────────────────────────────

/** « apres … : », « toutes les … : » (le corps et la condition sont lus par l'appelant). */
export function verifierMinuterie(hote: Hote, minuterie: Minuterie, place: { page: boolean; auPremierNiveau: boolean; survol: boolean }): void {
  if (place.page && !place.auPremierNiveau) {
    hote.erreur('une minuterie de la page s’écrit au premier niveau de la page (elle démarre à son ouverture), ou dans un événement.', minuterie.ligne);
  }
  const usage = minuterie.mode === 'apres' ? 'apres 3 secondes' : 'toutes les 5 secondes';
  const ms = verifierDuree(hote, minuterie.duree, usage);
  if (minuterie.mode === 'toutes' && ms !== undefined && ms < 250) {
    hote.erreur(
      `« toutes les ${ecrireDuree(ms)} » réveillerait l’appareil plus de quatre fois par seconde : au moins 250 millisecondes. Pour une animation, utilisez le CSS.`,
      minuterie.duree.ligne,
    );
  } else if (minuterie.mode === 'toutes' && ms !== undefined && ms < 1000) {
    hote.avertissement(`« toutes les ${ecrireDuree(ms)} » : moins d’une seconde, c’est beaucoup de travail pour l’appareil. Une seconde suffit souvent.`, minuterie.duree.ligne);
  }
  if (minuterie.mode === 'apres' && minuterie.tantQue) {
    hote.erreur('« tant que » suit « toutes les … » : une minuterie « apres … » ne passe qu’une fois. Écrivez un « si » dans son bloc.', minuterie.ligne);
  }
  if (minuterie.corps.length === 0) {
    hote.erreur('cette minuterie ne fait rien : écrivez en dessous, décalé, ce qu’elle fait.', minuterie.ligne);
  }
  if (place.survol) {
    hote.avertissement('une minuterie dans « survole » repart à chaque passage du pointeur : préférez un clic.', minuterie.ligne);
  }
  // WCAG 2.2.2 : un contenu qui se met à jour seul doit pouvoir se mettre en pause.
  if (place.page && minuterie.mode === 'toutes' && !minuterie.tantQue && changeQuelqueChose(minuterie.corps) && !contientArreter(minuterie.corps)) {
    hote.avertissement(
      'cette page se met à jour toute seule, sans moyen de l’arrêter : ajoutez une pause avec une variable, par exemple « toutes les 5 secondes tant que actif est vrai : » et un bouton qui change « actif ».',
      minuterie.ligne,
    );
  }
}

/** Vrai si des instructions changent une variable ou rechargent des données. */
function changeQuelqueChose(corps: Instruction[]): boolean {
  return parcourir(corps).some((i) => ['Affectation', 'ModificationListe', 'Requete', 'Rechargement'].includes(i.type));
}

function contientArreter(corps: Instruction[]): boolean {
  return parcourir(corps).some((i) => i.type === 'Arreter');
}

/** Les instructions d'un bloc d'actions, blocs imbriqués compris. */
export function parcourir(corps: Instruction[]): Instruction[] {
  const toutes: Instruction[] = [];
  for (const i of corps) {
    toutes.push(i);
    if (i.type === 'Condition' || i.type === 'Confirmer') toutes.push(...parcourir(i.alors), ...parcourir(i.sinon));
    else if (i.type === 'Boucle' || i.type === 'TantQue' || i.type === 'Repeter' || i.type === 'Minuterie' || i.type === 'Bloc' || i.type === 'Formulaire' || i.type === 'Fenetre') {
      toutes.push(...parcourir(i.corps));
    }
    else if (i.type === 'Selon') toutes.push(...i.cas.flatMap((c) => parcourir(c.corps)), ...parcourir(i.sinon));
    else if (i.type === 'Action' && i.message?.action) toutes.push(...parcourir(i.message.action.corps));
  }
  return toutes;
}

// ─── Copier et partager ───────────────────────────────────────────────────

/** Où se trouve un « copier » ou un « partager » : il lui faut le geste de la personne. */
export interface PlaceGeste {
  dansLaPage: boolean;
  /** « quand la page se charge » ou une minuterie : personne n'a rien demandé. */
  sansGeste?: 'chargement' | 'minuterie';
  /** Une attente (requête, confirmation) avant, dans le même événement. */
  apresUneAttente: boolean;
}

function verifierGeste(hote: Hote, mot: string, place: PlaceGeste, ligne: number): boolean {
  if (place.dansLaPage) {
    hote.erreur(`« ${mot} » demande un geste de la personne : il s’écrit dans un événement (quand l’utilisateur clique sur …).`, ligne);
    return false;
  }
  if (place.sansGeste) {
    const ou = place.sansGeste === 'chargement' ? 'à l’ouverture de la page' : 'dans une minuterie';
    hote.erreur(`« ${mot} » ${ou} : personne n’a rien demandé, et le navigateur le refuserait. Écrivez-le dans l’événement d’un clic.`, ligne);
    return false;
  }
  if (place.apresUneAttente) {
    hote.avertissement(
      `« ${mot} » après une attente (une requête ou une question) : le navigateur, surtout Safari, peut le refuser, le geste de la personne étant passé. Placez « ${mot} » avant l’attente.`,
      ligne,
    );
  }
  return true;
}

export function verifierCopier(hote: Hote, copier: Copier, place: PlaceGeste): void {
  const type = hote.typeDe(copier.valeur);
  if (!verifierGeste(hote, 'copier', place, copier.ligne)) return;
  if (estConnu(type) && type.genre !== 'texte' && type.genre !== 'nombre') {
    hote.erreur(`« copier » attend un texte ou un nombre ; ici, c’est ${decrireType(type)}. Écrivez le texte voulu : copier "{p.nom}".`, copier.ligne);
  }
  if (copier.message === '') hote.erreur('le message de « copier » est vide : écrivez un texte, ou « sans message ».', copier.ligne);
}

/** « partager … » : le texte, le titre et le lien (vérifié par l'appelant, comme un lien). */
export function verifierPartager(hote: Hote, partage: Partager, place: PlaceGeste): void {
  hote.typeDe(partage.texte);
  if (partage.titre) hote.typeDe(partage.titre);
  verifierGeste(hote, 'partager', place, partage.ligne);
}

// ─── Les confirmations ────────────────────────────────────────────────────

export function verifierConfirmer(hote: Hote, confirmer: Confirmer, place: { dansLaPage: boolean; sansGeste?: 'chargement' | 'minuterie'; dansUneAction: boolean; profondeur: number }): void {
  hote.typeDe(confirmer.question);
  if (place.dansLaPage) {
    hote.erreur('« confirmer » pose une question à la personne : il s’écrit dans un événement (quand l’utilisateur clique sur …).', confirmer.ligne);
    return;
  }
  if (place.sansGeste) {
    const ou = place.sansGeste === 'chargement' ? 'à l’ouverture de la page' : 'dans une minuterie';
    hote.erreur(`« confirmer » ${ou} : personne n’a rien demandé à ce moment-là. Posez la question après un clic.`, confirmer.ligne);
    return;
  }
  if (place.dansUneAction) {
    hote.erreur('pas de « confirmer » dans le bouton d’un message : le bouton « Annuler » remplace déjà la question.', confirmer.ligne);
  }
  for (const [quel, texte] of [['oui', confirmer.oui], ['non', confirmer.non]] as const) {
    if (texte !== undefined && texte.trim() === '') hote.erreur(`le bouton « ${quel} » de la question n’a pas de texte : avec ${quel} "…".`, confirmer.ligne);
  }
  const oui = confirmer.oui ?? 'Oui';
  const non = confirmer.non ?? 'Non';
  if (normaliser(oui.trim()) === normaliser(non.trim())) {
    hote.erreur(`les deux boutons de la question s’appellent « ${oui} » : la personne ne saurait pas lequel choisir. Donnez-leur des verbes différents (« Supprimer » et « Garder »).`, confirmer.ligne);
  }
  if (confirmer.alors.length === 0) {
    hote.erreur('« confirmer » sans rien à faire si la personne répond oui : écrivez en dessous, décalé, ce qui doit se passer.', confirmer.ligne);
  }
  if (place.profondeur >= 2) {
    hote.avertissement('trois questions de suite, c’est beaucoup : une ou deux suffisent.', confirmer.ligne);
  }
}

// ─── Les fenêtres ─────────────────────────────────────────────────────────

export function verifierFenetre(hote: Hote, fenetre: Fenetre, place: { dansUnEvenement: boolean; dansUneFenetre: boolean }): void {
  if (place.dansUnEvenement) {
    hote.erreur('une fenêtre ne se crée pas dans un événement : écrivez-la dans la page, puis ouvrez-la avec montrer "…".', fenetre.ligne);
  }
  if (place.dansUneFenetre) {
    hote.erreur('une fenêtre dans une fenêtre perd les personnes qui utilisent le clavier : placez-la à côté de l’autre, dans la page.', fenetre.ligne);
  }
  if (fenetre.titre.trim() === '') hote.erreur('une fenêtre a besoin d’un titre : fenetre "Détails" :', fenetre.ligne);
}

/** Une fenêtre jamais ouverte, ou ouverte sans moyen d’en sortir. */
export function avertirFenetre(hote: Hote, fenetre: Fenetre, ouverte: boolean, fermee: boolean): void {
  if (!ouverte) {
    hote.avertissement(`la fenêtre « ${fenetre.nom ?? fenetre.titre} » ne s’ouvre jamais : ajoutez montrer "${fenetre.nom ?? fenetre.titre}" dans un événement.`, fenetre.ligne);
  } else if (fenetre.obligatoire && !fermee) {
    hote.avertissement(
      `la fenêtre « ${fenetre.nom ?? fenetre.titre} » est obligatoire, et rien ne la ferme : ajoutez un bouton qui fait cacher "${fenetre.nom ?? fenetre.titre}".`,
      fenetre.ligne,
    );
  }
}

// ─── Les touches ──────────────────────────────────────────────────────────

const MODIFICATEURS = ['controle', 'maj', 'alt'] as const;
const NOMMEES = ['entree', 'echap', 'espace', 'tab', 'suppr', 'retour', 'haut', 'bas', 'gauche', 'droite', 'debut', 'fin', 'plus', 'moins'];
const SIGNES = ['/', '?'];
/** Les combinaisons que le navigateur ou le système gardent souvent pour eux. */
const RESERVEES = ['controle+t', 'controle+w', 'controle+n', 'controle+l', 'controle+r', 'controle+q', 'controle+tab', 'controle+maj+t', 'controle+maj+n', 'alt+f4', 'f5', 'f11', 'f12'];

/**
 * « Contrôle+K » → « controle+k » : les touches sous leur forme canonique
 * (modificateurs dans l'ordre controle, maj, alt, puis la touche), ou un
 * message qui dit ce qui ne va pas.
 */
export function lireTouches(texte: string): { touches: string } | { erreur: string } {
  const possibles = `modificateurs ${MODIFICATEURS.join(', ')} ; touches : une lettre, un chiffre, ${NOMMEES.join(', ')}, f1 à f12, / et ?`;
  const morceaux = normaliser(texte.trim()).split(/\s*\+\s*/).map((m) => (m === '' ? '+' : m));
  // « controle++ » : la touche plus s'écrit « plus ».
  if (texte.trim() === '' || morceaux.some((m) => m === '+')) {
    return { erreur: `« ${texte} » n’est pas une touche : écrivez par exemple "controle+k" (${possibles}).` };
  }
  const touche = morceaux[morceaux.length - 1];
  const mods = morceaux.slice(0, -1);
  const estTouche = /^[a-z0-9]$/.test(touche) || NOMMEES.includes(touche) || SIGNES.includes(touche) || /^f([1-9]|1[0-2])$/.test(touche);
  const inconnu = [...mods.filter((m) => !(MODIFICATEURS as readonly string[]).includes(m)), ...(estTouche ? [] : [touche])][0];
  if (inconnu !== undefined) {
    const conseil = ({ ctrl: 'controle', cmd: 'controle', commande: 'controle', shift: 'maj', majuscule: 'maj', esc: 'echap', escape: 'echap', enter: 'entree' } as Record<string, string>)[inconnu];
    return { erreur: `la touche « ${inconnu} » n’existe pas dans « ${texte} »${conseil ? ` : écrivez « ${conseil} »` : ''}. Touches possibles : ${possibles}.` };
  }
  if (new Set(mods).size !== mods.length) return { erreur: `« ${texte} » répète un modificateur.` };
  const ordonnes = MODIFICATEURS.filter((m) => mods.includes(m));
  return { touches: [...ordonnes, touche].join('+') };
}

/** Les touches d'un raccourci écrit dans la page : une erreur si elles n'existent pas, des avertissements utiles. */
export function verifierTouches(hote: Hote, texte: string, ligne: number, place: { dansUnChamp: boolean }): string | undefined {
  const lu = lireTouches(texte);
  if ('erreur' in lu) {
    hote.erreur(lu.erreur, ligne);
    return undefined;
  }
  if (RESERVEES.includes(lu.touches)) {
    hote.avertissement(`« ${texte} » est souvent gardé par le navigateur ou le système : il peut ne pas laisser passer cette touche. Choisissez-en une autre.`, ligne);
  } else if (!place.dansUnChamp && /^[a-z0-9]$/.test(lu.touches)) {
    hote.avertissement(
      `un raccourci d’une seule lettre (« ${texte} ») se déclenche sans le vouloir avec la reconnaissance vocale : ajoutez controle ou alt (par exemple "alt+${lu.touches}").`,
      ligne,
    );
  }
  return lu.touches;
}

// ─── Les événements ───────────────────────────────────────────────────────

/** « ecrit dans "x" », « arrete d'ecrire dans "x" » : un champ où l'on écrit. */
export function verifierSaisie(hote: Hote, evenement: Evenement, sorte: string | undefined, dansUneBoucle: boolean): void {
  if (dansUneBoucle) {
    hote.erreur(`« ${evenement.genre === 'saisie' ? 'ecrit dans' : 'arrete d’ecrire dans'} » suit un seul champ : placez le champ et son événement hors de la boucle.`, evenement.ligne);
    return;
  }
  if (sorte === 'case' || sorte === 'choix' || sorte === 'liste') {
    hote.erreur(`on ne tape pas dans « ${evenement.cible} » (une case à cocher, un choix ou une liste) : « ecrit » et « arrete d’ecrire » vont avec un champ où l’on écrit.`, evenement.ligne);
  }
  if (evenement.genre === 'pauseSaisie') verifierPauseSaisie(hote, evenement);
  avertirSaisie(hote, evenement, sorte === 'motDePasse');
}

/** « arrete d'ecrire dans … apres … » : de 100 millisecondes à 5 secondes. */
function verifierPauseSaisie(hote: Hote, evenement: Evenement): void {
  if (!evenement.duree) return;
  const ms = verifierDuree(hote, evenement.duree, 'apres 300 millisecondes');
  if (ms === undefined && evenement.duree.valeur.type !== 'Nombre') {
    hote.erreur('la pause d’une frappe s’écrit en chiffres : apres 500 millisecondes.', evenement.duree.ligne);
  } else if (ms !== undefined && (ms < 100 || ms > 5000)) {
    hote.erreur(`la pause d’une frappe va de 100 millisecondes à 5 secondes (ici : ${ecrireDuree(ms)}) ; 300 millisecondes par défaut.`, evenement.duree.ligne);
  }
}

/** « ecrit dans "x" » qui envoie une requête : une requête par touche. */
function avertirSaisie(hote: Hote, evenement: Evenement, motDePasse: boolean): void {
  const toutes = parcourir(evenement.corps);
  const envoie = toutes.some((i) => i.type === 'Requete' || i.type === 'Rechargement');
  if (motDePasse && envoie) {
    hote.avertissement('ce que la personne tape dans un mot de passe ne doit pas partir sur le réseau à chaque touche : vérifiez-le à l’envoi du formulaire.', evenement.ligne);
  } else if (evenement.genre === 'saisie' && envoie) {
    hote.avertissement('« ecrit dans » envoie une requête à chaque touche : utilisez « arrete d’ecrire dans … » pour attendre une pause.', evenement.ligne);
  }
}

/** « arrive en bas de "…" » : le bloc doit grandir, et la condition changer. */
export function avertirBas(hote: Hote, evenement: Evenement, lues: string[]): void {
  const toutes = parcourir(evenement.corps);
  if (!toutes.some((i) => i.type === 'Requete' || i.type === 'Rechargement' || (i.type === 'ModificationListe' && i.operation === 'ajouter'))) {
    hote.avertissement('rien ne grandit quand le bas est atteint : ajoutez des éléments (ajouter … a …) ou chargez la suite (envoyer requete …).', evenement.ligne);
  }
  const changees = new Set(toutes.flatMap((i) => (i.type === 'Affectation' ? [i.nom] : i.type === 'ModificationListe' ? [i.liste] : i.type === 'Requete' && i.resultat ? [i.resultat] : [])));
  if (evenement.tantQue && lues.length > 0 && !lues.some((n) => changees.has(n))) {
    hote.avertissement(`cet événement ne change jamais « ${lues[0]} » : il ne s’arrêtera pas tout seul.`, evenement.ligne);
  }
  if (evenement.bouton === null) {
    hote.avertissement('sans bouton « Voir plus », une personne au clavier ne peut plus atteindre le bas de la page : gardez le bouton (avec bouton "…").', evenement.ligne);
  }
}

// ─── Ce que l'analyse de la page recense ──────────────────────────────────

export function fenetreEnDouble(hote: Hote, nom: string, premiere: number, ligne: number): void {
  hote.erreur(`deux fenêtres s’appellent « ${nom} » (lignes ${premiere} et ${ligne}) : montrer "${nom}" ne saurait pas laquelle ouvrir. Donnez un nom à l’une d’elles : avec nom "…".`, ligne);
}

export function blocEnDouble(hote: Hote, nom: string, premiere: number, ligne: number): void {
  hote.erreur(`le nom « ${nom} » est déjà donné à un bloc (ligne ${premiere}).`, ligne);
}

export function champIntrouvable(hote: Hote, nom: string, page: string, champs: string[], ligne: number): void {
  hote.erreur(`aucun champ « ${nom} » dans la page « ${page} »${champs.length ? `. Champs : ${champs.join(', ')}` : ''}.`, ligne);
}

/** « arrive en bas de "x" » : le bloc nommé n'existe pas, ou il a déjà son événement. */
export function blocDuBas(hote: Hote, nom: string, deja: number | undefined, ligne: number): void {
  if (deja === undefined) {
    hote.erreur(`aucun bloc nommé « ${nom} » dans la page : nommez le bloc qui grandit, par exemple section "Produits" avec nom "${nom}" :`, ligne);
  } else {
    hote.erreur(`le bloc « ${nom} » a déjà son « arrive en bas de » (ligne ${deja}) : réunissez les deux.`, ligne);
  }
}

/**
 * « pour chaque t dans taches avec deplacement » : une variable de liste de la
 * page, une seule boucle par liste. Vrai si la boucle est acceptée.
 */
export function verifierDeplacement(hote: Hote, boucle: Boucle, place: { dansUnEvenement: boolean; variable?: string; deja?: number }): boolean {
  if (place.dansUnEvenement) {
    hote.erreur('« avec deplacement » s’écrit sur une boucle de la page, qui affiche la liste : pas dans un événement.', boucle.ligne);
    return false;
  }
  if (place.variable === undefined) {
    hote.erreur(
      'on ne peut déplacer que les éléments d’une liste écrite dans une variable (pas un calcul ni une liste filtrée) : variable taches = [...], puis pour chaque t dans taches avec deplacement :',
      boucle.ligne,
    );
    return false;
  }
  if (place.deja !== undefined) {
    hote.erreur(`la liste « ${place.variable} » a déjà une boucle avec deplacement (ligne ${place.deja}) : une seule par liste.`, boucle.ligne);
    return false;
  }
  if (parcourir(boucle.corps).some((i) => i.type === 'Element' && i.element === 'champ')) {
    hote.avertissement('un champ dans une liste qu’on déplace : prendre un élément gêne la sélection du texte. Placez le champ hors de la boucle.', boucle.ligne);
  }
  return true;
}

export function raccourciEnDouble(hote: Hote, touches: string, premiere: number, ligne: number): void {
  hote.erreur(`le raccourci « ${touches} » est déjà pris dans cette page (ligne ${premiere}) : choisissez d’autres touches.`, ligne);
}

/** « quand l'ordre de taches change » : une boucle doit déplacer cette liste. */
export function verifierOrdre(hote: Hote, evenement: Evenement, deplacee: boolean): void {
  if (!deplacee) {
    hote.erreur(`personne ne déplace rien dans « ${evenement.variable} » : écrivez pour chaque … dans ${evenement.variable} avec deplacement :`, evenement.ligne);
  }
}

/** « avec raccourci "…" » sur un élément : un bouton, un lien ou un champ. Rend les touches, sous leur forme canonique. */
export function verifierRaccourciElement(hote: Hote, element: Element): string | undefined {
  if (!['bouton', 'lien', 'champ'].includes(element.element)) {
    hote.erreur(`« avec raccourci » s’applique à un bouton, un lien ou un champ : un ${element.element} ne se clique pas.`, element.ligne);
    return undefined;
  }
  return verifierTouches(hote, element.raccourci ?? '', element.ligne, { dansUnChamp: false });
}
