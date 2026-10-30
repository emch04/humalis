import type { PartieChaine } from '../lexer/types.js';

export interface Programme {
  type: 'Programme';
  pages: Page[];
  /** Les blocs « style : », en CSS recopié tel quel. */
  styles: BlocStyle[];
  /** Les « utiliser style "…" » : des fichiers CSS séparés. */
  fichiersStyle: FichierStyle[];
  donneesFichiers: { nom: string; chemin: string; ligne: number }[];
  /** Les variables déclarées en haut du fichier (« avec partagee »). */
  partages: DeclarationVariable[];
  /** Les « utiliser composant "Carte" depuis "./Carte" » : des composants React. */
  composantsReact: ComposantReact[];
  /** Les « composant "Fiche" : » écrits en Humalis. */
  composants: DefinitionComposant[];
  /** Les « serveur "…" : » : données, routes et règles d'accès. */
  serveurs: Serveur[];
  /** Les « source "…" : » : des API existantes (adresse, jeton, forme des réponses). */
  sources: Source[];
  /** Les « utiliser fichier "./panier.humalis" » : les autres fichiers du projet. */
  fichiersHumalis: { chemin: string; ligne: number }[];
  /** Les « fonction prix_ttc avec montant : » écrites en haut du fichier (décision L2). */
  fonctions: DefinitionFonction[];
  /** Les noms des fonctions d'actions (sans « rendre ») : leurs appels sont déjà dépliés. */
  fonctionsActions?: string[];
  /** Les « test "…" de page "…" : » des fichiers *.test.humalis (décision O3). */
  tests: CasTest[];
  /** Le bloc « theme : » : couleurs, polices, mode. */
  theme?: Theme;
  /** Le bloc « site : » : la déclaration « je publie » (nom, description, image, logo, adresse). */
  site?: Site;
  /** Le bloc « langues : » : la première langue est celle des textes écrits (partie 1 du plan qualité). */
  langues?: Langues;
  /** Les blocs « traductions anglais : » : les versions rangées en un seul endroit. */
  traductions?: Traductions[];
  /** « entete : » et « pied : » : communs à toutes les pages. */
  entete?: Disposition;
  pied?: Disposition;
}

/**
 * « test "la page d'accueil salue" de page "accueil" : » : des gestes et des
 * vérifications sur une page, lancés par « humalis tester ».
 */
export interface CasTest {
  type: 'Test';
  nom: string;
  page: string;
  etapes: EtapeTest[];
  ligne: number;
}

export type EtapeTest =
  | { type: 'Cliquer'; cible: string; ligne: number }
  | { type: 'RemplirChamp'; cible: string; valeur: string; ligne: number }
  | { type: 'AllerVers'; cible: string; ligne: number }
  | { type: 'VerifierTexteVisible'; cible: string; ligne: number }
  | { type: 'VerifierTexteAbsent'; cible: string; ligne: number }
  | { type: 'VerifierPage'; cible: string; ligne: number }
  | { type: 'VerifierChamp'; cible: string; valeur: string; ligne: number };

/** « fonction remise avec prix et taux : … rendre … » : un calcul réutilisable. */
export interface DefinitionFonction {
  type: 'Fonction';
  nom: string;
  parametres: { nom: string; ligne: number }[];
  corps: Instruction[];
  ligne: number;
}

/** « essayer : … si erreur : … » (décision L5) : la première erreur arrête le bloc, et « si erreur » la reçoit dans « raison ». */
export interface Essayer {
  type: 'Essayer';
  corps: Instruction[];
  siErreur: Instruction[];
  ligne: number;
}

/** « vider_panier() » seul sur une ligne : l'appel d'une fonction d'actions (déplié avant l'analyse). */
export interface Execution {
  type: 'Execution';
  nom: string;
  arguments: Expression[];
  ligne: number;
}

/** « rendre prix * 2 » : la valeur d'une fonction ; arrête la fonction. */
export interface Rendre {
  type: 'Rendre';
  valeur: Expression;
  ligne: number;
}

/** « remise(prix, 10) » : l'appel d'une fonction. */
export interface Appel {
  type: 'Appel';
  nom: string;
  arguments: Expression[];
  ligne: number;
}

/** Le bloc « theme : » (couleurs et polices du projet). */
export interface Theme {
  type: 'Theme';
  couleurs: { nom: string; clair: string; sombre?: string; ligne: number }[];
  polices: { role: string; nom: string; fichier?: string; ligne: number }[];
  mode?: { valeur: string; ligne: number };
  largeur?: { valeur: string; ligne: number };
  ligne: number;
}

/** « entete : » ou « pied : » : un bloc commun à toutes les pages. */
export interface Disposition {
  type: 'Disposition';
  genre: 'entete' | 'pied';
  styles: Style[];
  classes: string[];
  corps: Instruction[];
  ligne: number;
}

export interface Serveur {
  type: 'Serveur';
  nom: string;
  donnees: Donnee[];
  routes: Route[];
  ligne: number;
}

/** Où un jeton voyage : « dans l'entete "X-Cle" », « dans le parametre "key" ». Par défaut : Authorization: Bearer. */
export type PlaceJeton = { genre: 'autorisation' } | { genre: 'entete'; nom: string } | { genre: 'parametre'; nom: string };

/** « jeton public "…" » ou « jeton secret depuis l'environnement "NOM" ». */
export interface JetonSource {
  /** Public : la valeur est écrite dans le fichier. Secret : seulement le nom de la variable d'environnement. */
  genre: 'public' | 'secret';
  valeur: string;
  place: PlaceJeton;
  ligne: number;
}

/** « lire une liste de produit dans "products" » : un verbe d'une route de source. */
export interface RegleSource {
  type: 'RegleSource';
  /** Qui peut appeler la route par la passerelle (seulement pour une source à jeton secret). */
  qui?: Qui;
  action: ActionDonnee;
  /** « lire une liste de … » : une liste ; « lire un … » : un seul élément. */
  liste: boolean;
  donnee: string;
  /** « modifier produit par remplacement » : la route remplace tout (PUT) au lieu de changer des champs (PATCH). */
  remplacement?: boolean;
  /** Le chemin de la valeur utile dans la réponse (« products »). */
  dans?: string;
  ligne: number;
}

export interface RouteSource {
  type: 'RouteSource';
  adresse: string;
  regles: RegleSource[];
  ligne: number;
}

/** « source "boutique" : » — une API qui existe déjà. */
export interface Source {
  type: 'Source';
  nom: string;
  adresse?: string;
  /** « session astratra » : cette API donne la session (cookie et CSRF des packs). */
  session: boolean;
  enveloppe?: string;
  erreurDans?: string;
  entetes: { nom: string; valeur: string; ligne: number }[];
  jeton?: JetonSource;
  cache?: number;
  essais?: number;
  delai?: number;
  donnees: Donnee[];
  routes: RouteSource[];
  ligne: number;
}

export type TypeChamp =
  | { genre: 'texte' }
  | { genre: 'nombre' }
  | { genre: 'booleen' }
  | { genre: 'date' }
  | { genre: 'liste'; de: TypeChamp }
  /** Une autre donnée de la même source (« variants : liste de variante ») : un objet imbriqué. */
  | { genre: 'donnee'; nom: string };

/** « donnee produit : », avec un champ typé par ligne. */
export interface Donnee {
  type: 'Donnee';
  nom: string;
  /** Le nom sous lequel l'analyse la connaît (« boutique_produit » si une autre donnée porte déjà « produit »). */
  cle?: string;
  champs: { nom: string; type: TypeChamp; ligne: number }[];
  ligne: number;
}

export type Qui = 'tout_le_monde' | 'connecte' | 'admin';
export type ActionDonnee = 'lire' | 'creer' | 'modifier' | 'supprimer';

/** « route "produits" : », avec une règle d'accès par ligne. */
export interface Route {
  type: 'Route';
  adresse: string;
  regles: Regle[];
  ligne: number;
}

/** « seul admin peut modifier produit ». */
export interface Regle {
  type: 'Regle';
  qui: Qui;
  actions: ActionDonnee[];
  donnee: string;
  ligne: number;
}

export interface ComposantReact {
  type: 'ComposantReact';
  nom: string;
  chemin: string;
  ligne: number;
}

/** « composant "Fiche" : » : un morceau de page réutilisable, avec ses paramètres. */
export interface DefinitionComposant {
  type: 'DefinitionComposant';
  nom: string;
  parametres: Parametre[];
  corps: Instruction[];
  ligne: number;
}

/** « parametre nom », au début d'un composant. */
export interface Parametre {
  type: 'Parametre';
  nom: string;
  ligne: number;
}

/** « Carte avec titre "Bienvenue" et prix prix » : un composant placé dans la page. */
export interface UsageComposant {
  type: 'Composant';
  nom: string;
  proprietes: { nom: string; valeur: Expression; ligne: number }[];
  ligne: number;
}

export interface BlocStyle {
  type: 'BlocStyle';
  css: string;
  ligne: number;
}

export interface FichierStyle {
  type: 'FichierStyle';
  chemin: string;
  ligne: number;
}

export interface Page {
  type: 'Page';
  nom: string;
  /** « page "produit" avec parametre id : » : les valeurs lues dans l'adresse de la page. */
  parametres: string[];
  /** « page "collection" a l'adresse "/collections/:slug" : » : l'adresse choisie, au lieu de celle du nom. */
  adresse?: string;
  /** « page "admin" reservee a connecte sinon vers "connexion" : » : seulement pour les connectés (ou les admins). */
  reservee?: { qui: 'connecte' | 'admin'; sinon?: string; ligne: number };
  /** « page "connexion" sans entete et sans pied : » : la page se passe de l'en-tête et du pied communs. */
  sansEntete?: boolean;
  sansPied?: boolean;
  /** Le bloc « apercu : » de la page : son titre, sa description et son image de partage. */
  apercu?: Apercu;
  /** « page "commandes" dans "admin" : » : la page s'affiche dans la page parente, à l'endroit de « sous page ». */
  parent?: string;
  /** « page "catalogue" avec filtre categorie : » : des valeurs facultatives lues dans la requête de l'adresse (?categorie=…). */
  filtres?: FiltrePage[];
  corps: Instruction[];
  ligne: number;
}

/** Un filtre d'adresse : un texte, ou un nombre quand c'est écrit (« filtre page nombre »). */
export interface FiltrePage {
  nom: string;
  nombre?: boolean;
  ligne: number;
}

/** « sous page » : l'endroit où la page parente montre la sous-page choisie par l'adresse. */
export interface SousPage {
  type: 'SousPage';
  ligne: number;
}

export type Instruction =
  | CodeDocumentation
  | TableauDocumentation
  | DeclarationVariable
  | Affectation
  | ModificationListe
  | Requete
  | UsageComposant
  | Parametre
  | SousPage
  | Element
  | Formulaire
  | Bloc
  | Action
  | Condition
  | Boucle
  | Evenement
  | Connexion
  | Deconnexion
  | Suppression
  | Modification
  | EnvoiFichier
  | Rendre
  | TantQue
  | Repeter
  | Arreter
  | PasserAuSuivant
  | Selon
  | Rechargement
  | Execution
  | Essayer
  | DefinitionFonction
  | Apercu
  | Supposant
  // Les interactions (plan 2026-10-30-interactions)
  | Minuterie
  | Copier
  | Partager
  | Confirmer
  | Fenetre
  | Graphique;

/** Une unité de durée : « 300 millisecondes », « 2 secondes », « 1 minute », « 1 heure ». */
export type UniteDuree = 'milliseconde' | 'seconde' | 'minute' | 'heure';

/** « 3 secondes », « 1,5 seconde », « delai secondes » : un nombre (ou une variable) et son unité. */
export interface Duree {
  valeur: Expression;
  unite: UniteDuree;
  ligne: number;
}

/** « apres 3 secondes : … », « toutes les 5 secondes [tant que …] : … » : une minuterie. */
export interface Minuterie {
  type: 'Minuterie';
  mode: 'apres' | 'toutes';
  duree: Duree;
  /** « tant que actif est vrai » : la minuterie n'existe que tant que la condition est vraie. */
  tantQue?: Comparaison;
  corps: Instruction[];
  ligne: number;
}

/** « copier code », « copier code avec message "Code copié" », « copier code sans message ». */
export interface Copier {
  type: 'Copier';
  valeur: Expression;
  /** Le texte du message de réussite ; null : « sans message ». Absent : « Copié ». */
  message?: string | null;
  /** « avec message "Copié" en anglais "Copied" » : le message et ses versions. */
  texte?: LitteralChaine;
  ligne: number;
}

/** « partager "Regarde" avec titre "…" avec lien vers "produit" avec id p.id ». */
export interface Partager {
  type: 'Partager';
  texte: Expression;
  titre?: Expression;
  /** Une adresse écrite (https://…) ou une page du programme, avec ses paramètres. */
  lien?: { adresse: string; parametres?: ArgumentPage[] };
  ligne: number;
}

/** « confirmer "Supprimer ?" avec oui "Supprimer" et non "Garder" : … sinon : … ». */
export interface Confirmer {
  type: 'Confirmer';
  question: Expression;
  oui?: string;
  non?: string;
  alors: Instruction[];
  sinon: Instruction[];
  ligne: number;
}

/** « fenetre "Détails" avec nom "…" et description "…" et obligatoire : » : fermée au départ, ouverte par « montrer ». */
export interface Fenetre {
  type: 'Fenetre';
  titre: string;
  nom?: string;
  description?: string;
  /** « avec obligatoire » : ni Échap ni un clic à l'extérieur ne la ferment. */
  obligatoire?: boolean;
  classes: string[];
  corps: Instruction[];
  ligne: number;
}

/** La suite d'un « afficher » dans un événement : genre, durée, message qui reste, bouton d'action. */
export interface SuiteMessage {
  genre?: 'reussite' | 'avertissement';
  duree?: Duree;
  /** « sans disparaitre » : le message reste jusqu'à ce qu'on le ferme. */
  persistant?: boolean;
  /** « avec action "Annuler" : » et son bloc, exécuté si l'on clique sur le bouton. */
  action?: { libelle: string; corps: Instruction[]; ligne: number };
}

/** Les genres de graphique (plan des médias, 4.1). */
export type GenreGraphique = 'courbe' | 'barres' | 'camembert';

/**
 * « graphique en courbe ventes avec etiquette mois et valeur montant en FC et
 * description "…" », ou la forme en bloc, une ligne « serie » par série.
 */
export interface Graphique {
  type: 'Graphique';
  genre: GenreGraphique;
  /** La liste dessinée : des fiches, des données, ou des nombres. */
  liste: Expression;
  /** « etiquette mois » : le champ des libellés. */
  etiquette?: string;
  /** « etiquettes ["Lun", "Mar"] » : les libellés d'une liste de nombres. */
  etiquettes?: Expression;
  /** La forme en ligne : « valeur montant en FC » écrit sur la ligne du graphique. */
  valeur?: ValeurGraphique;
  /** La forme en ligne : « couleur vert ». */
  couleur?: string;
  description?: Expression;
  /** « proportions 2 sur 1 ». */
  proportions?: [number, number];
  /** La forme en bloc : une série par ligne « serie "Ventes" valeur ventes … ». */
  series: SerieGraphique[];
  /** Les classes CSS données par « avec style "…" ». */
  classes: string[];
  ligne: number;
}

/** « valeur montant en FC » : un champ, et peut-être sa devise (le mot écrit : « FC », « euros »…). */
export interface ValeurGraphique {
  champ: string;
  devise?: string;
  ligne: number;
}

/** « serie "Ventes" valeur ventes en FC avec couleur bleu ». */
export interface SerieGraphique {
  nom: string;
  /** « serie "Ventes" en anglais "Sales" » : le nom avec ses versions, seulement quand il en a. */
  texteNom?: LitteralChaine;
  valeur?: ValeurGraphique;
  couleur?: string;
  ligne: number;
}

/** Actions locales exécutées avant la requête suivante, puis défaites si elle échoue. */
export interface Supposant {
  type: 'Supposant';
  corps: Instruction[];
  ligne: number;
}

/** « tant que n est inferieur a 10 : » : répète tant que la condition est vraie. */
export interface TantQue {
  type: 'TantQue';
  test: Test;
  corps: Instruction[];
  ligne: number;
}

/** « repeter 3 fois : ». */
export interface Repeter {
  type: 'Repeter';
  fois: Expression;
  corps: Instruction[];
  ligne: number;
}

/** « arreter » : sort de la boucle. */
export interface Arreter {
  type: 'Arreter';
  ligne: number;
}

/** « passer au suivant » : passe au tour suivant de la boucle. */
export interface PasserAuSuivant {
  type: 'PasserAuSuivant';
  ligne: number;
}

/** « selon jour : cas "lundi" : … cas "samedi" ou "dimanche" : … sinon : … ». */
export interface Selon {
  type: 'Selon';
  valeur: Expression;
  cas: { valeurs: Expression[]; corps: Instruction[]; ligne: number }[];
  sinon: Instruction[];
  ligne: number;
}

/** « supprimer p de "produits" » : la donnée est supprimée sur le serveur. */
export interface Suppression {
  type: 'Suppression';
  objet: Expression;
  adresse: string;
  /** « de la source "boutique" » : l'API visée, au lieu du serveur du fichier. */
  source?: string;
  ligne: number;
}

/**
 * « envoyer fichier photo vers "api/photo" de la source "boutique" en corps brut
 * suivi dans envoi et fichier dans adresse » : envoie le fichier choisi, avec
 * sa progression (plan des médias, 4.3).
 */
export interface EnvoiFichier {
  type: 'EnvoiFichier';
  /** La variable qui contient le fichier choisi. */
  variable: string;
  /** La route : celle de la source, ou (refusé pour l'instant) du serveur du fichier. */
  adresse: string;
  source?: string;
  /** « en corps brut » : le fichier seul, sans formulaire. */
  corpsBrut?: boolean;
  /** « sous le nom "photo" » : le nom du champ du formulaire (« fichier » par défaut). */
  champ?: string;
  /** « suivi dans envoi » : la variable nombre qui reçoit 0 à 100 pendant l'envoi. */
  suivi?: string;
  /** « fichier dans adresse » : la variable qui reçoit la réponse de la route. */
  resultat?: string;
  ligne: number;
}

/** « modifier p dans "produits" avec prix = … et nom = … » : sur le serveur. */
export interface Modification {
  type: 'Modification';
  objet: Expression;
  adresse: string;
  source?: string;
  /** Chaque champ changé : « prix = p.prix - 1 », ou « champ "prix" » (la valeur d'un champ de la page). */
  changements: { champ: string; valeur: Expression }[];
  ligne: number;
}

/**
 * « se connecter avec champ "email" et champ "mot de passe" » : la
 * connexion au serveur du même fichier, par ses packs Astratra.
 */
export interface Connexion {
  type: 'Connexion';
  email: Expression;
  motDePasse: Expression;
  ligne: number;
}

/** « se deconnecter ». */
export interface Deconnexion {
  type: 'Deconnexion';
  ligne: number;
}

export interface OptionsVariable {
  /** Visible et modifiable depuis toutes les pages. */
  partagee?: boolean;
  /** Gardée après un rechargement, sur l'appareil du visiteur. */
  memorisee?: boolean;
  /** Avec « memorisee » : un secret, à garder dans le coffre de l'appareil. */
  secret?: boolean;
}

export interface DeclarationVariable {
  type: 'Variable';
  nom: string;
  valeur: Expression;
  /** « calcul x = … » : la valeur se recalcule seule, et ne se change pas. */
  calcul?: boolean;
  /** « constante tva = 16 » : une valeur fixe (un calcul qui ne dépend de rien qui change). */
  constante?: boolean;
  /** « avec partagee », « avec memorisee », « avec memorisee en secret ». */
  options?: OptionsVariable;
  /** Valeur chargée à la compilation depuis un fichier, jamais modifiable. */
  fichierDonnees?: string;
  ligne: number;
}

/** « changer clics par 1 » : nouvelle valeur d'une variable déjà déclarée. */
export interface Affectation {
  type: 'Affectation';
  nom: string;
  /** « changer client.adresse.rue par … » : le chemin des champs changés dans la fiche. */
  champs?: string[];
  valeur: Expression;
  ligne: number;
}

/** « ajouter nom à panier », « retirer "Livre" de panier ». */
export interface ModificationListe {
  type: 'ModificationListe';
  operation: 'ajouter' | 'retirer';
  valeur: Expression;
  liste: string;
  ligne: number;
}

/**
 * « envoyer requete vers "/connexion" avec champ "email" dans reponse ».
 * Avec des données, la requête envoie ; sans données, elle lit.
 */
export interface Requete {
  type: 'Requete';
  adresse: string;
  /** « de la source "boutique" » : l'API visée, au lieu du serveur du fichier. */
  source?: string;
  /** « filtrant par categorie = "robes" » : les paramètres d'adresse d'une lecture. */
  filtrant?: { cle: string; valeur: Expression }[];
  donnees: Expression[];
  /** « avec customer = client » : le nom de chaque donnée envoyée, quand il est écrit (sinon celui de la variable ou du champ). */
  cles?: (string | undefined)[];
  resultat?: string;
  ligne: number;
}

export type NomElement =
  | 'titre'
  | 'soustitre'
  | 'texte'
  | 'image'
  | 'bouton'
  | 'lien'
  | 'champ'
  // Les éléments d'écran (plan 2026-10-30, chapitre 5)
  | 'icone'
  | 'badge'
  | 'avatar'
  | 'progression'
  | 'chargement'
  | 'etoiles'
  | 'compteur'
  | 'qr'
  // Les médias (plan 2026-10-30-graphiques-medias)
  | 'fichier'
  | 'audio'
  | 'marqueur'
  /** « selecteur de langue » : le choix de la langue (partie 1 du plan qualité). */
  | 'selecteurLangue';

/**
 * La sorte d'un champ : « champ email "…" », « case a cocher "…" »,
 * « choix "…" parmi … », « liste deroulante "…" parmi … ». Sans sorte
 * écrite, un champ est un texte d'une ligne.
 */
export type SorteChamp =
  | 'texte'
  | 'email'
  | 'telephone'
  | 'nombre'
  | 'date'
  | 'heure'
  | 'motDePasse'
  | 'texteLong'
  | 'adresseWeb'
  | 'case'
  | 'choix'
  | 'liste';

/** « formulaire "message" : » : des champs et un bouton, envoyés ensemble. */
export interface Formulaire {
  type: 'Formulaire';
  nom: string;
  corps: Instruction[];
  ligne: number;
}

/** Les blocs de mise en page : ils regroupent des éléments, que le CSS met en forme. */
export interface CodeDocumentation {
  type: 'CodeDocumentation';
  langage?: string;
  /** « avec animation frappe » : le code s'écrit lettre par lettre, au chargement ou quand il arrive à l'écran. */
  frappe?: 'chargement' | 'defilement';
  code: string;
  ligne: number;
}

/** Les colonnes et les rangées d'un tableau de documentation. */
export interface TableauDocumentation {
  type: 'TableauDocumentation';
  legende?: Expression;
  colonnes: Expression[];
  rangees: Expression[][];
  ligne: number;
}

export type GenreBloc =
  | 'liste'
  | 'listeNumerotee'
  | 'section'
  | 'bloc'
  | 'ligne'
  | 'colonne'
  | 'grille'
  | 'appareil'
  | 'entete'
  | 'pied'
  | 'contenu'
  // Les blocs d'éléments d'écran (plan 2026-10-30, chapitre 5)
  | 'onglets'
  | 'onglet'
  | 'deroulant'
  | 'accordeon'
  | 'carrousel'
  | 'filAriane'
  | 'menu'
  // La carte (plan des médias, 4.5)
  | 'carte';

/**
 * « section "Nos plats" : », « bloc : », « ligne : », « colonne : »,
 * « grille : » : un groupe d'instructions de la vue. Le titre d'une
 * section est le premier élément de son corps (un « titre »).
 */
export interface Bloc {
  type: 'Bloc';
  genre: GenreBloc;
  /** Les styles nommés (« avec fond vert »). */
  styles: Style[];
  /** Les classes CSS données par « avec style "…" ». */
  classes: string[];
  /** `onglet "Avis" :`, `deroulant "Détails" :` : le titre écrit après le mot. */
  titre?: Expression;
  /** « carte "…" avec latitude … et zoom … » : les réglages d'une carte. */
  carte?: OptionsCarte;
  /** « avec ancre "desserts" » : un endroit de la page où un lien peut mener. */
  ancre?: string;
  /** « avec nom "catalogue" » : pour viser le bloc (« quand l'utilisateur arrive en bas de "catalogue" »). */
  nom?: string;
  /** « menu repliable : » : sur un petit écran, les liens se cachent derrière un bouton « Menu ». */
  repliable?: boolean;
  corps: Instruction[];
  ligne: number;
}

export interface Element {
  type: 'Element';
  element: NomElement;
  contenu: Expression;
  styles: Style[];
  /** Niveau explicite d'un sous-titre, entre 2 et 6. */
  niveau?: number;
  /** Donné par « avec nom "…" » pour viser l'élément depuis un événement. */
  nom?: string;
  /** Les classes CSS données par « avec style "…" ». */
  classes: string[];
  cible?: string;
  /** « lien … vers "produit" avec id p.id » : les paramètres donnés à la page cible. */
  arguments?: ArgumentPage[];
  /** « avec ancre "desserts" » : un endroit de la page où un lien peut mener. */
  ancre?: string;
  /** « lien … vers "https://…" avec nouvel onglet ». */
  nouvelOnglet?: boolean;
  /** Les champs seulement, et seulement quand c'est écrit : la sorte et ses options. */
  sorte?: SorteChamp;
  /** « parmi ["S", "M"] » : les valeurs d'un choix ou d'une liste déroulante. */
  parmi?: Expression;
  /** « avec obligatoire » : le formulaire n'est pas envoyé sans ce champ. */
  obligatoire?: boolean;
  /** « avec indice "…" » : le texte gris d'un champ vide. */
  indice?: string;
  /** « avec indice "Votre nom" en anglais "Your name" » : l'indice avec ses versions, seulement quand il en a. */
  indiceTexte?: LitteralChaine;
  /** « avec minimum 1 », « avec maximum 10 » : pour un champ nombre. */
  minimum?: number;
  maximum?: number;
  /** « avec raccourci "controle+k" » : la touche qui clique le bouton (ou met le focus dans le champ). */
  raccourci?: string;
  /** « avec annonce » : un lecteur d'écran lit ce texte quand il change. */
  annonce?: boolean;
  /** « fichier "Choisir" dans photo accepte images avec maximum 5 Mo » : le choix d'un fichier. */
  fichier?: ChoixFichier;
  /** « marqueur "Gombe" avec latitude … et longitude … » : où il est. */
  lieu?: LieuMarqueur;
  ligne: number;
}

/** Ce que dit « carte "…" avec latitude … et longitude … et zoom … et tuiles "…" et attribution "…" ». */
export interface OptionsCarte {
  latitude?: Expression;
  longitude?: Expression;
  zoom?: Expression;
  /** L'adresse des tuiles d'un autre fournisseur, avec {z}, {x} et {y}. */
  tuiles?: string;
  attribution?: string;
}

/** La position d'un marqueur : latitude et longitude (obligatoires, vérifiées par l'analyse), adresse facultative. */
export interface LieuMarqueur {
  latitude?: Expression;
  longitude?: Expression;
  adresse?: Expression;
}

/** Ce que dit la ligne « fichier "…" dans photo accepte … avec maximum … ». */
export interface ChoixFichier {
  /** La variable qui reçoit le fichier choisi (ou une liste avec « plusieurs »). */
  variable: string;
  /** Les mots de « accepte » (images, audio, videos, pdf, documents), sans accent ; vide : tout fichier. */
  accepte: string[];
  /** « maximum 5 Mo », en octets. */
  octets?: number;
  plusieurs?: boolean;
}

/** Un paramètre donné à une page : « id p.id ». */
export interface ArgumentPage {
  nom: string;
  valeur: Expression;
}

export interface Style {
  propriete: string;
  valeur: string;
  /** Un texte avec des {variables} (`photo "{p.photo}"`) : ses parties. */
  parties?: PartieChaine[];
  /**
   * « description "Le fleuve" en anglais "The river" » : le texte avec ses
   * versions, seulement quand il en a (pour la description et la transcription).
   */
  texte?: LitteralChaine;
  /** « animation montee au defilement » : l'animation attend que l'élément entre à l'écran. */
  defilement?: boolean;
  /** « … au defilement et en cascade » : les enfants du bloc apparaissent l'un après l'autre. */
  cascade?: boolean;
}

export type NomAction =
  | 'afficher'
  | 'cacher'
  | 'montrer'
  | 'rediriger'
  | 'revenir'
  | 'changerTexte'
  | 'changerTheme'
  | 'afficherErreur';

export interface Action {
  type: 'Action';
  action: NomAction;
  arguments: Expression[];
  /** « rediriger vers "produit" avec id p.id » : les paramètres de la page cible. */
  parametres?: ArgumentPage[];
  /** « continuer vers "admin" » : là où la personne allait avant de se connecter, sinon cette page. */
  continuer?: boolean;
  /** « afficher reussite "…" pendant 10 secondes » : ce qui suit le texte d'un message. */
  message?: SuiteMessage;
  ligne: number;
}

export interface Condition {
  type: 'Condition';
  test: Test;
  alors: Instruction[];
  sinon: Instruction[];
  ligne: number;
}

export type Operateur =
  | 'different'
  | 'egal'
  | 'inferieur'
  | 'superieur'
  | 'inferieurOuEgal'
  | 'superieurOuEgal'
  | 'vide'
  | 'vrai'
  | 'faux'
  | 'rien'
  /** « panier contient "Livre" », « nom contient "Liv" » (tâche 2). */
  | 'contient'
  /** « nom commence par "Awa" », « nom finit par "Mbuyi" ». */
  | 'commencePar'
  | 'finitPar'
  /** « categorie est dans ["robes", "pagnes"] » : la valeur fait partie de la liste. */
  | 'dans';

/** Une condition : une comparaison, ou plusieurs reliées par « et » et « ou » (« et » lie plus fort). */
export type Test = Comparaison | Combinaison;

/** « stock est superieur a 0 et prix est inferieur a 20000 ». */
export interface Combinaison {
  type: 'Combinaison';
  operateur: 'et' | 'ou';
  gauche: Test;
  droite: Test;
  ligne: number;
}

export interface Comparaison {
  type: 'Comparaison';
  gauche: Expression;
  operateur: Operateur;
  droite?: Expression;
  /** « n'est pas vide » : le contraire, quand l'opérateur n'a pas de contraire direct. */
  negation?: boolean;
  ligne: number;
}

export interface Boucle {
  type: 'Boucle';
  variable: string;
  liste: Expression;
  /** « pour chaque t dans taches avec deplacement : » : chaque élément peut être pris et déplacé. */
  deplacement?: boolean;
  corps: Instruction[];
  ligne: number;
}

export type GenreEvenement =
  | 'clic'
  | 'survol'
  | 'chargement'
  | 'soumission'
  // Les interactions (plan 2026-10-30-interactions)
  | 'touche'
  | 'saisie'
  | 'pauseSaisie'
  | 'bas'
  | 'ordre';

export interface Evenement {
  type: 'Evenement';
  genre: GenreEvenement;
  cible?: string;
  /** « appuie sur "controle+k" » : les touches, telles qu'elles sont écrites. */
  touches?: string;
  /** « arrete d'ecrire dans "x" apres 500 millisecondes ». */
  duree?: Duree;
  /** « arrive en bas de "x" tant que il_reste est vrai ». */
  tantQue?: Comparaison;
  /** « avec bouton "Voir plus" » ; null : « sans bouton ». */
  bouton?: string | null;
  /** « quand l'ordre de taches change » : la variable de liste. */
  variable?: string;
  corps: Instruction[];
  ligne: number;
}

export type Expression =
  | LitteralChaine
  | LitteralNombre
  | LitteralBooleen
  | LitteralListe
  | ReferenceVariable
  | ReferenceChamp
  | Calcul
  | Compte
  | AccesChamp
  | EtatUtilisateur
  | EtatRequete
  | ErreurRequete
  | LitteralFiche
  | Appel
  | Agregat
  | Arrondi
  | Hasard
  | DateDuJour
  | DateDecalee
  | JoursEntre
  | Filtre
  | Tri
  | Groupement
  | Premier
  | Premiers
  | OperationTexte
  | Remplacement
  | MouvementReduit
  | ThemeSombre
  | Rien;

/** « majuscules de nom », « minuscules de nom », « longueur de nom ». */
export interface OperationTexte {
  type: 'OperationTexte';
  operation: 'majuscules' | 'minuscules' | 'longueur';
  valeur: Expression;
  ligne: number;
}

/** « remplacer "a" par "b" dans nom ». */
export interface Remplacement {
  type: 'Remplacement';
  cherche: Expression;
  remplace: Expression;
  dans: Expression;
  ligne: number;
}

/** « produits dont prix est inferieur a 20000 » (décision L4) : les éléments qui vérifient la condition. */
export interface Filtre {
  type: 'Filtre';
  liste: Expression;
  /** La condition, où les noms des champs désignent ceux de chaque élément. */
  test: Comparaison;
  ligne: number;
}

/** « trier produits par prix [decroissant] », « trier notes ». */
/** « grouper produits par categorie » : un groupe par valeur du champ, avec « nom » et « elements ». */
export interface Groupement {
  type: 'Groupement';
  liste: Expression;
  champ: string;
  ligne: number;
}

export interface Tri {
  type: 'Tri';
  liste: Expression;
  champ?: string;
  decroissant: boolean;
  ligne: number;
}

/** « premier de produits [dont …] » : le premier élément, ou rien. */
export interface Premier {
  type: 'Premier';
  liste: Expression;
  ligne: number;
}

/** « les 4 premiers de produits ». */
export interface Premiers {
  type: 'Premiers';
  nombre: Expression;
  liste: Expression;
  ligne: number;
}

/** « moyenne de notes », « somme de panier.prix », « minimum de … », « maximum de … ». */
export interface Agregat {
  type: 'Agregat';
  operation: 'moyenne' | 'somme' | 'minimum' | 'maximum';
  liste: Expression;
  ligne: number;
}

/** « arrondi de x », « arrondi de x a 2 chiffres ». */
export interface Arrondi {
  type: 'Arrondi';
  valeur: Expression;
  chiffres?: number;
  ligne: number;
}

/** « hasard entre 1 et 6 » : un nombre entier au hasard, bornes comprises. */
/** « aujourd'hui » (la date du jour) ou « maintenant » (l'instant présent). */
export interface DateDuJour {
  type: 'DateDuJour';
  maintenant: boolean;
  ligne: number;
}

/** « aujourd'hui plus 3 jours », « livraison moins 1 semaine ». */
export interface DateDecalee {
  type: 'DateDecalee';
  date: Expression;
  nombre: Expression;
  unite: 'jours' | 'semaines' | 'mois';
  /** 1 pour « plus », -1 pour « moins ». */
  signe: 1 | -1;
  ligne: number;
}

/** « jours entre debut et fin » : un nombre de jours. */
export interface JoursEntre {
  type: 'JoursEntre';
  debut: Expression;
  fin: Expression;
  ligne: number;
}

export interface Hasard {
  type: 'Hasard';
  minimum: Expression;
  maximum: Expression;
  ligne: number;
}

/** « fiche avec nom "Livre" et prix 12 » : une fiche (décision L3), lue par « livre.prix ». */
export interface LitteralFiche {
  type: 'Fiche';
  champs: { nom: string; valeur: Expression; ligne: number }[];
  ligne: number;
}

/** « rien » : pas encore de valeur (un produit pas encore lu sur le serveur). */
export interface Rien {
  type: 'Rien';
  ligne: number;
}

/** « mouvement est reduit » : la personne a demandé à son système de réduire les animations. */
export interface MouvementReduit {
  type: 'MouvementReduit';
  ligne: number;
}

/** « theme est sombre » : le thème affiché (choix du visiteur ou du projet, sinon le système) est sombre. */
export interface ThemeSombre {
  type: 'ThemeSombre';
  ligne: number;
}

/** « utilisateur est connecte » (ou « admin ») : vrai ou faux, lu sur la session du serveur. */
export interface EtatUtilisateur {
  type: 'EtatUtilisateur';
  etat: 'connecte' | 'admin';
  ligne: number;
}

/** « recharger produits » : relance la requête qui remplit la variable, sans le cache. */
export interface Rechargement {
  type: 'Rechargement';
  variable: string;
  ligne: number;
}

/** « produits est en chargement », « est en erreur », « est introuvable » : l'état de la requête d'une variable. */
export interface EtatRequete {
  type: 'EtatRequete';
  variable: string;
  etat: 'chargement' | 'erreur' | 'introuvable';
  ligne: number;
}

/** « erreur de produits » : le message de la dernière requête refusée (un texte). */
export interface ErreurRequete {
  type: 'ErreurRequete';
  variable: string;
  ligne: number;
}

/** « p.prix » : le champ d'une donnée. */
export interface AccesChamp {
  type: 'AccesChamp';
  objet: Expression;
  champ: string;
  ligne: number;
}

export type OperateurCalcul = '+' | '-' | '*' | '/';

/** « prix * 2 + livraison ». */
export interface Calcul {
  type: 'Calcul';
  operateur: OperateurCalcul;
  gauche: Expression;
  droite: Expression;
  ligne: number;
}

/** « nombre de panier » : le nombre d'éléments d'une liste. */
export interface Compte {
  type: 'Compte';
  liste: Expression;
  ligne: number;
}

export interface LitteralChaine {
  type: 'Chaine';
  parties: PartieChaine[];
  /** « "Bienvenue" en anglais "Welcome" » : les versions écrites à côté, dans l'ordre. */
  versions?: VersionChaine[];
  /** « "GitHub" sans traduction » : le même texte dans toutes les langues, sans avertissement. */
  sansTraduction?: boolean;
  ligne: number;
}

/** « en anglais "Welcome" » : une version du texte dans une autre langue. */
export interface VersionChaine {
  /** Le mot de la langue, sans accent (« anglais »). */
  langue: string;
  parties: PartieChaine[];
  ligne: number;
}

/** « langues : » puis une langue par ligne. */
export interface Langues {
  type: 'Langues';
  langues: { mot: string; ligne: number }[];
  ligne: number;
}

/** « traductions anglais : » puis des lignes « "texte" : "version" ». */
export interface Traductions {
  type: 'Traductions';
  langue: string;
  entrees: { texte: PartieChaine[]; version: PartieChaine[]; ligne: number }[];
  ligne: number;
}

export interface LitteralNombre {
  type: 'Nombre';
  valeur: number;
  ligne: number;
}

export interface LitteralBooleen {
  type: 'Booleen';
  valeur: boolean;
  ligne: number;
}

export interface LitteralListe {
  type: 'Liste';
  elements: Expression[];
  ligne: number;
}

export interface ReferenceVariable {
  type: 'Reference';
  nom: string;
  ligne: number;
}

export interface ReferenceChamp {
  type: 'Champ';
  nom: string;
  ligne: number;
}

/** Le bloc « site : » en haut du fichier (plan 2026-10-30-qualite-publication, partie 3). */
export interface Site {
  type: 'Site';
  nom?: string;
  description?: string;
  /** L'image de partage, chemin du projet (« ./partage/rey-store.jpg ») ou adresse https. */
  image?: string;
  /** L'icône du site : un SVG, ou un PNG carré. */
  logo?: string;
  adresse?: string;
  /** « indexation non » : le site est fermé aux moteurs de recherche. */
  indexation: boolean;
  /** « nom "Le Fleuve" en anglais "The River" » : le texte avec ses versions, seulement quand il en a. */
  textes?: Partial<Record<'nom' | 'description', LitteralChaine>>;
  /** La ligne de chaque réglage, pour les messages. */
  lignes: Partial<Record<'nom' | 'description' | 'image' | 'logo' | 'adresse', number>>;
  ligne: number;
}

/** « apercu : » dans une page : ce que montrent l'onglet, les moteurs et les réseaux sociaux. */
export interface Apercu {
  type: 'Apercu';
  titre?: Expression;
  description?: Expression;
  image?: Expression;
  /** « indexation non » : la page est cachée aux moteurs (noindex). */
  indexation: boolean;
  ligne: number;
}
