/**
 * La représentation intermédiaire (RI) : un arbre neutre, sans aucun mot
 * de plateforme, que chaque cible (React, Expo, Electron, statique) lit
 * pour produire son code. Ce sont des données pures, sérialisables en
 * JSON.
 *
 * Elle sépare ce qui est affiché (la vue, qui dépend de l'état) de ce
 * qui se passe (les gestionnaires d'événements).
 */
import type { TypeValeur } from '../analyse/types.js';
import type { GenreBloc } from '../parser/ast.js';

export type { TypeValeur };

export interface Application {
  ecrans: Ecran[];
  /** Le CSS des blocs « style : », recopié tel quel. */
  css: string[];
  /** Les fichiers CSS séparés (« utiliser style "…" »), à copier par la commande. */
  fichiersStyle: { chemin: string; ligne: number }[];
  /** Les variables partagées entre les pages (« avec partagee »). */
  partages: Etat[];
  /** Les composants React utilisés (« utiliser composant … depuis … »). */
  composantsReact: { nom: string; chemin: string; ligne: number }[];
  /** Les composants écrits en Humalis : des écrans qui reçoivent des paramètres. */
  composants: ComposantHumalis[];
  /** Les serveurs : données, routes et droits. */
  serveurs: ServeurRI[];
  /** Les API existantes que les pages appellent (« source "…" : »). */
  sources: SourceRI[];
  /** Les fonctions écrites en haut du fichier (décision L2) : des calculs réutilisables. */
  fonctions: FonctionRI[];
  /** Le bloc « theme : » (absent si le programme n'en a pas). */
  theme?: ThemeRI;
  /** Le bloc « site : » : la déclaration « je publie » (absent sinon, et rien ne change). */
  site?: SiteRI;
  /**
   * Le bloc « langues : » : la première est celle des textes écrits. Absent
   * sans bloc (ou avec une seule langue) : le code produit ne change pas.
   */
  langues?: LangueRI[];
  /** « entete : » et « pied : » : communs à toutes les pages qui ne s'en passent pas. */
  disposition?: { entete?: DispositionRI; pied?: DispositionRI };
}

/** Une API existante : ce que le code produit doit savoir pour l'appeler. Un jeton secret n'y figure jamais. */
export interface SourceRI {
  nom: string;
  adresse: string;
  /** Les cookies de session et le jeton CSRF des packs voyagent avec les appels. */
  session: boolean;
  enveloppe?: string;
  erreurDans?: string;
  entetes: { nom: string; valeur: string }[];
  /** Un jeton public : sa valeur part dans le code envoyé au client. */
  jetonPublic?: { valeur: string; place: { genre: 'autorisation' } | { genre: 'entete' | 'parametre'; nom: string } };
  /** Secondes. */
  cache?: number;
  essais?: number;
  delai?: number;
  /** Les formes de réponse déclarées (comme les données d'un serveur). */
  donnees: { nom: string; champs: { nom: string; type: TypeChamp }[] }[];
}

/** Un « {…} » d'un texte : la valeur lue, et comment l'écrire en français. */
export interface PartieVariable {
  variable: string;
  format?: 'nombre' | 'date' | 'depuis' | 'FC' | 'EUR' | 'USD' | 'Ko' | 'Mo';
  pluriel?: string;
}

/** « fonction remise avec prix et taux : » ; le type des paramètres vient des appels. */
export interface FonctionRI {
  nom: string;
  parametres: { nom: string; type: TypeValeur }[];
  retour: TypeValeur;
  corps: Action[];
  ligne: number;
}

/** L'en-tête ou le pied de page commun : un écran sans paramètre, et les réglages de son bloc. */
export interface DispositionRI {
  ecran: ComposantHumalis;
  options: Option[];
  /** Les classes CSS (« avec style "…" »). */
  classes: string[];
}

/** Les couleurs, les polices et le mode du projet (bloc « theme : »). */
export interface ThemeRI {
  /** Chaque couleur nommée, avec son « encre » (la couleur du texte lisible dessus) dans les deux modes. */
  couleurs: { nom: string; clair: string; sombre: string; encreClair: string; encreSombre: string }[];
  polices: { role: 'titres' | 'texte' | 'code'; nom: string; fichier?: string }[];
  /** Le mode au départ : « automatique » suit le système. */
  mode: 'automatique' | 'clair' | 'sombre';
  largeur: 'etroite' | 'normale' | 'large' | 'pleine';
}

export type QuiPeut = 'tout_le_monde' | 'connecte' | 'admin';

export type TypeChamp =
  | { genre: 'texte' }
  | { genre: 'nombre' }
  | { genre: 'booleen' }
  | { genre: 'date' }
  | { genre: 'liste'; de: TypeChamp }
  | { genre: 'donnee'; nom: string };

export interface ServeurRI {
  nom: string;
  donnees: { nom: string; champs: { nom: string; type: TypeChamp }[] }[];
  routes: {
    adresse: string;
    donnee: string;
    /** Qui peut faire chaque action ; null : personne, la porte reste fermée. */
    droits: Record<'lire' | 'creer' | 'modifier' | 'supprimer', QuiPeut | null>;
    ligne: number;
  }[];
}

export interface ComposantHumalis extends Ecran {
  parametres: { nom: string; type: TypeValeur }[];
}

export interface Ecran {
  nom: string;
  /** Les variables déclarées au premier niveau de la page. */
  etat: Etat[];
  /** Les « calcul x = … » de la page : recalculés à chaque changement de l'état. */
  calculs: Calcul[];
  /** Ce qui est affiché, dans l'ordre. */
  vue: NoeudVue[];
  /** Ce qui se passe quand l'utilisateur agit, ou au chargement. */
  gestionnaires: Gestionnaire[];
  /** « page "produit" avec parametre id » : les valeurs lues dans l'adresse (vide pour une page simple). */
  parametresAdresse?: string[];
  /** L'adresse choisie (« /collections/:slug »), au lieu de celle du nom de la page. */
  adresse?: string;
  /** Une page réservée aux connectés (ou aux admins) ; `sinon` est la page où l'on renvoie les autres. */
  reservee?: { qui: 'connecte' | 'admin'; sinon: string };
  /** « page "commandes" dans "admin" » : la page parente, qui montre celle-ci à l'endroit de sa « sous page ». */
  parent?: string;
  /** « avec filtre categorie » : les valeurs lues dans la requête de l'adresse (?categorie=…). */
  filtres?: { nom: string; nombre?: boolean }[];
  /** Les variables dont la page lit l'état de requête (en chargement, erreur…) ou qu'elle recharge. */
  etatsRequetes?: string[];
  /** « page "connexion" sans entete et sans pied » : la page se passe de l'en-tête et du pied communs. */
  sansEntete?: boolean;
  sansPied?: boolean;
  /** « apercu : » : le titre, la description et l'image de partage de la page. */
  apercu?: ApercuRI;
  ligne: number;
}

/** Le bloc « site : ». Les chemins d'images sont ceux du projet (« ./logo.svg »). */
export interface SiteRI {
  nom?: string;
  /** Le nom du site dans chaque langue, s'il en a plusieurs versions. */
  nomLangues?: TexteEnLangues;
  description?: string;
  /** La description du site dans chaque langue, s'il en a plusieurs versions. */
  descriptionLangues?: TexteEnLangues;
  image?: string;
  logo?: string;
  adresse?: string;
  /** Faux : « indexation non », le site est fermé aux moteurs de recherche. */
  indexation: boolean;
  ligne: number;
}

/** Le bloc « apercu : » d'une page. */
export interface ApercuRI {
  titre?: Valeur;
  description?: Valeur;
  image?: Valeur;
  /** Faux : « indexation non », la page porte noindex et sort du plan du site. */
  indexation: boolean;
}

/** Une langue du site : son code (« en ») et son nom écrit dans cette langue (« English »). */
export interface LangueRI {
  code: string;
  nom: string;
}

/** Les parties d'un texte : du texte écrit, ou une valeur lue. */
export type PartiesTexte = ({ texte: string; accent?: true; code?: true } | PartieVariable)[];

/** Les paramètres donnés à une page cible : « avec id p.id ». */
export type ArgumentsPage = { nom: string; valeur: Valeur }[];

export interface Etat {
  nom: string;
  type: TypeValeur;
  initiale: Valeur;
  /** « avec memorisee » : gardée après un rechargement. */
  memorisee?: boolean;
  /** « avec memorisee en secret » : à garder dans un coffre sûr. */
  secret?: boolean;
  /** « = rien » : pas encore de valeur (null dans le code produit). */
  facultatif?: boolean;
  /** Les données d'un fichier (« utiliser donnees … depuis ») : en lecture seule, jamais gardées dans le navigateur. */
  lectureSeule?: boolean;
  ligne: number;
}

export interface Calcul {
  nom: string;
  type: TypeValeur;
  valeur: Valeur;
  /** « premier de … » : il peut ne pas y avoir de valeur (on y lit un champ avec « ?. »). */
  facultatif?: boolean;
}

export type GenreElement = 'titre' | 'soustitre' | 'texte' | 'image' | 'bouton' | 'lien' | 'champ';

/** Les éléments d'écran d'une ligne (plan 2026-10-30, chapitre 5). */
export type GenreWidget = 'icone' | 'badge' | 'avatar' | 'progression' | 'chargement' | 'etoiles' | 'compteur' | 'qr' | 'fichier' | 'audio' | 'selecteurLangue';

/**
 * Un texte écrit en clair dans chaque langue du site, la langue de base en
 * premier (`[{ code: 'fr', texte: 'Ventes' }, { code: 'en', texte: 'Sales' }]`).
 * Absent sans bloc « langues » : le code produit est alors celui d'avant.
 */
export type TexteEnLangues = { code: string; texte: string }[];

/** Les réglages qui ne sont pas des styles : ils changent ce que l'élément dessine. */
export interface Reglages {
  /** Le texte lu par un lecteur d'écran. */
  description?: string;
  /** Le même texte dans chaque langue du site, s'il en a plusieurs versions. */
  descriptionLangues?: TexteEnLangues;
  decoratif?: boolean;
  /** Le nom canonique d'une icône (`panier`). */
  icone?: string;
  /** L'image d'un avatar. */
  photo?: Valeur;
  modifiable?: boolean;
  ouvert?: boolean;
  plusieurs?: boolean;
  pourcentage?: boolean;
  /** Un audio : le texte de ce qui est dit, et la relance à la fin. */
  transcription?: string;
  boucle?: boolean;
  /** Secondes entre deux diapositives. */
  automatique?: number;
  visibles?: number;
}

/** Le choix d'un fichier (plan des médias, 4.3) : la variable, les types acceptés et la taille maximale. */
export interface ChoixFichierRI {
  variable: string;
  /** Les familles demandées (images, pdf…), pour dire « Ce fichier n'est pas une image ». */
  familles: { nom: string; mime: string[] }[];
  /** La taille maximale, en octets. */
  octets?: number;
  plusieurs: boolean;
  /** Faux pour un PDF : pas d'aperçu à fabriquer. */
  apercu: boolean;
}

/** Ce qu'une image sait d'elle-même (plan des médias, 4.2). */
export interface ImageRI {
  /** Le texte de remplacement ; absent : l'image est décorative (alt=""). */
  description?: Valeur;
  /** Le fichier écrit dans le programme, quand il est à côté du fichier Humalis (« salle.jpg ») : il est recopié. */
  locale?: string;
  /** « proportions 4 sur 3 ». */
  proportions?: [number, number];
  /** « prioritaire » : chargée tout de suite, en premier. */
  prioritaire?: boolean;
}

/**
 * Un graphique : la liste dessinée, ses libellés, ses séries, sa
 * description. Chaque cible le confie à la même géométrie
 * (`cibles/commun/graphique/geometrie.ts`).
 */
export interface GraphiqueRI {
  type: 'graphique';
  /** L'identifiant de la figure : ses dessins s'y rattachent par aria-labelledby. */
  id: string;
  genre: 'courbe' | 'barres' | 'camembert';
  liste: Valeur;
  /** Le champ des libellés (liste de fiches ou de données). */
  etiquette?: string;
  /** Les libellés d'une liste de nombres. */
  etiquettes?: Valeur;
  /** L'en-tête de la colonne des libellés, dans la table de données (« Mois »). */
  nomEtiquettes: string;
  /** Avec des langues : l'en-tête de la colonne des libellés dans chaque langue. */
  nomEtiquettesLangues?: TexteEnLangues;
  /** Une série par courbe ou groupe de barres ; le camembert en a une. `valeur` absent : la liste est une liste de nombres. */
  series: { nom: string; nomLangues?: TexteEnLangues; valeur?: string; couleur?: string }[];
  devise?: 'FC' | 'EUR' | 'USD';
  /** Le nom du dessin, lu par les lecteurs d'écran (« Graphique en courbe »). */
  titre: string;
  /** Avec des langues : le nom du dessin dans chaque langue. */
  titreLangues?: TexteEnLangues;
  description: Valeur;
  proportions?: [number, number];
  classes: string[];
  ligne: number;
}

export type NoeudVue =
  | { type: 'codeDocumentation'; langage?: string; code: string; ligne: number }
  | { type: 'tableauDocumentation'; legende: Valeur; colonnes: Valeur[]; rangees: Valeur[][]; ligne: number }
  | {
      type: 'element';
      /** Identifiant stable : c'est par lui que les gestionnaires visent l'élément. */
      id: string;
      genre: GenreElement;
      niveau?: number;
      contenu: Valeur;
      options: Option[];
      /** Les classes CSS (« avec style "…" »). */
      classes: string[];
      /** Pour un lien : l'écran visé. */
      cible?: string;
      /** Pour un lien vers une page à paramètre ou à filtre : les valeurs données. */
      arguments?: ArgumentsPage;
      /** « avec ancre "desserts" » : l'endroit de la page où un lien peut mener. */
      ancre?: string;
      /** Pour un lien : « carte#desserts » / « #desserts », l'ancre visée (sur la page `cible`, ou sur la page courante). */
      versAncre?: string;
      /** Pour un lien : une adresse externe (https://, http://, mailto:, tel:). */
      externe?: string;
      /** « avec nouvel onglet ». */
      nouvelOnglet?: boolean;
      /** Pour un champ qui a une sorte ou des options : comment on y écrit, et ce qui est vérifié. */
      saisie?: Saisie;
      /** Une icône avant le texte (`avec icone "panier"`). */
      reglages?: Reglages;
      /** Une image : sa description, son fichier local et ses réglages (plan des médias, 4.2). */
      image?: ImageRI;
      /** « avec raccourci "controle+k" » : les touches, sous leur forme canonique. */
      raccourci?: string;
      /** « avec annonce » : une région vivante (aria-live). */
      annonce?: boolean;
      ligne: number;
    }
  /**
   * Un élément d'écran d'une ligne : icône, badge, avatar, progression,
   * chargement, étoiles, compteur, code QR. `contenu` est sa valeur (le
   * texte du badge, le nombre de la progression, la variable du compteur).
   */
  | {
      type: 'widget';
      genre: GenreWidget;
      id: string;
      contenu: Valeur;
      options: Option[];
      classes: string[];
      reglages: Reglages;
      minimum?: number;
      maximum?: number;
      /** « fichier "Choisir" dans photo … » : ce que le choix accepte et la variable qui le reçoit. */
      fichier?: ChoixFichierRI;
      /** Un audio : sa description et sa transcription, avec leurs {variables}. */
      textes?: { description?: Valeur; transcription?: Valeur };
      ligne: number;
    }
  /**
   * Un formulaire : ses champs et ses boutons, envoyés ensemble (touche
   * Entrée ou bouton). Son gestionnaire de soumission le vise par `id`.
   */
  | { type: 'formulaire'; id: string; nom: string; corps: NoeudVue[]; ligne: number }
  /**
   * Un bloc de mise en page (« section », « bloc », « ligne », « colonne »,
   * « grille ») : il regroupe des nœuds, que le CSS met en forme.
   */
  | {
      type: 'bloc';
      genre: GenreBloc;
      options: Option[];
      classes: string[];
      /** « avec ancre "desserts" » : un endroit de la page où un lien peut mener. */
      ancre?: string;
      corps: NoeudVue[];
      /** `onglet "Avis"`, `deroulant "Détails"` : le titre. */
      titre?: Valeur;
      reglages?: Reglages;
      /**
       * L'état caché des blocs qui s'ouvrent : l'onglet ouvert (nombre) pour des onglets,
       * l'index ouvert pour un accordéon, ouvert ou non (booléen) pour un deroulant seul.
       * Un onglet ou un deroulant d'un groupe porte celui de son groupe et son `index`.
       */
      etat?: string;
      index?: number;
      /** « avec nom "catalogue" » : l'identifiant du bloc, visé par « arrive en bas de ». */
      id?: string;
      ligne: number;
    }
  /**
   * Une carte (plan des médias, 4.5) : son nom (lu par les lecteurs d'écran), son centre
   * et son zoom quand ils sont écrits (sinon elle s'ajuste à ses marqueurs), ses tuiles, et
   * ses marqueurs (des `marqueur`, dans des `repetition` et des `condition`).
   */
  | {
      type: 'carte';
      id: string;
      nom: Valeur;
      latitude?: Valeur;
      longitude?: Valeur;
      zoom?: Valeur;
      /** Un autre fournisseur de tuiles : son adresse et son attribution (toujours affichée). */
      tuiles?: { adresse: string; attribution: string };
      classes: string[];
      corps: NoeudVue[];
      ligne: number;
    }
  /** Un marqueur d'une carte : son nom (la bulle), son adresse facultative, sa position. */
  | { type: 'marqueur'; nom: Valeur; adresse?: Valeur; latitude: Valeur; longitude: Valeur; ligne: number }
  /** Un graphique (plan des médias, 4.1) : la géométrie est calculée par chaque cible. */
  | GraphiqueRI
  /** « sous page » : l'endroit où la page montre sa sous-page. */
  | { type: 'sousPage'; ligne: number }
  /**
   * « fenetre "Détails" : » : fermée au départ ; « montrer » l'ouvre et
   * « cacher » la ferme, par l'état de visibilité de son `id`.
   */
  | { type: 'fenetre'; id: string; titre: string; description?: string; obligatoire?: boolean; classes: string[]; corps: NoeudVue[]; ligne: number }
  | { type: 'condition'; test: Test; alors: NoeudVue[]; sinon: NoeudVue[]; ligne: number }
  | {
      type: 'repetition';
      variable: string;
      typeVariable: TypeValeur;
      liste: Valeur;
      corps: NoeudVue[];
      /** Les événements écrits dans la boucle : ils voient sa variable. */
      gestionnaires: Gestionnaire[];
      /** « avec deplacement » : les éléments se déplacent ; la liste est une variable de la page. */
      deplacement?: boolean;
      ligne: number;
    }
  /** Un composant placé dans la vue : « Carte avec titre "…" ». */
  | { type: 'composant'; nom: string; proprietes: { nom: string; valeur: Valeur }[]; ligne: number }
  /** Une variable déclarée dans un bloc de la vue (si, pour chaque). */
  | { type: 'locale'; nom: string; typeValeur: TypeValeur; valeur: Valeur; ligne: number };

/**
 * La sorte d'un champ (une idée, pas une balise) : chaque cible choisit sa
 * saisie (clavier, case, liste).
 */
export type SorteSaisie =
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

export interface Saisie {
  sorte: SorteSaisie;
  /** Un choix ou une liste déroulante : la liste des valeurs possibles (des textes). */
  parmi?: Valeur;
  /** Vérifié avant l'envoi du formulaire, comme les bornes d'un nombre. */
  obligatoire?: boolean;
  /** Le texte gris d'un champ vide. */
  indice?: string;
  /** Le même texte dans chaque langue du site, s'il en a plusieurs versions. */
  indiceLangues?: TexteEnLangues;
  minimum?: number;
  maximum?: number;
}

export interface Gestionnaire {
  declencheur:
    | 'clic'
    | 'survol'
    | 'soumission'
    | 'chargement'
    /** Une minuterie écrite dans la page (« apres 3 secondes : ») : elle démarre à l'ouverture de la page. */
    | 'minuterie'
    /** « appuie sur "controle+k" » : `touches` ; avec « dans "x" », les cibles. */
    | 'touche'
    /** « ecrit dans "x" » : à chaque changement de la valeur du champ. */
    | 'saisie'
    /** « arrete d'ecrire dans "x" » : après `millisecondes` sans frappe. */
    | 'pauseSaisie'
    /** « arrive en bas de "x" » : le bas du bloc devient visible (et le bouton « Voir plus »). */
    | 'bas'
    /** « l'ordre de taches change » : après chaque déplacement d'un élément de la liste. */
    | 'ordre';
  /** Les éléments visés (vide pour « chargement »). */
  cibles: string[];
  actions: Action[];
  /** Les touches, écrites sous leur forme canonique (« controle+maj+a »). */
  touches?: string;
  millisecondes?: number;
  /** L'événement n'est actif que tant que ce test est vrai. */
  tantQue?: Test;
  /** Le texte du bouton « Voir plus » ; null : pas de bouton. */
  bouton?: string | null;
  /** La variable de liste réordonnée. */
  variable?: string;
  ligne: number;
}

export type Action =
  | { type: 'optimiste'; corps: Action[]; variables: string[] }
  /** « recharger produits » : relance la requête de la variable, sans le cache. */
  | { type: 'recharger'; variable: string }
  | {
      type: 'message';
      genre: 'info' | 'erreur' | 'reussite' | 'avertissement';
      texte: Valeur;
      /** « pendant 10 secondes » : en millisecondes. */
      duree?: Valeur;
      /** « sans disparaitre ». */
      persistant?: boolean;
      /** « avec action "Annuler" : » : le bouton du message et ce qu'il fait. */
      action?: { libelle: string; actions: Action[] };
    }
  /**
   * « apres 3 secondes : », « toutes les 5 secondes : » : une minuterie, annulée
   * quand la page est quittée. `tantQue` : elle n'existe que tant que le test est vrai.
   */
  | { type: 'minuterie'; mode: 'apres' | 'toutes'; millisecondes: Valeur; tantQue?: Test; corps: Action[] }
  /** « copier code » ; `message` null : sans message. */
  | { type: 'copie'; valeur: Valeur; message: string | null; texte?: Valeur }
  /** « partager … » : la feuille de partage du système, sinon le lien copié. */
  | { type: 'partage'; texte: Valeur; titre?: Valeur; lien?: { externe: string } | { ecran: string; arguments?: ArgumentsPage } }
  /** « confirmer "…" : … sinon : … » : une question, Oui ou Non. */
  | { type: 'confirmation'; question: Valeur; oui: string; non: string; alors: Action[]; sinon: Action[] }
  | { type: 'visibilite'; ids: string[]; visible: boolean }
  | { type: 'navigation'; ecran: Valeur; arguments?: ArgumentsPage; continuer?: boolean }
  /** « changer categorie par "costumes" » : change le filtre dans l'adresse (rien l'enlève). */
  | { type: 'filtre'; nom: string; valeur: Valeur }
  /** « revenir » : le retour du navigateur ; avec `vers`, la page où aller si l'on n'a pas d'historique. */
  | { type: 'retour'; vers?: string }
  | { type: 'changerTexte'; ids: string[]; texte: Valeur }
  /** « changer theme par sombre » : le choix du visiteur, gardé par son appareil. */
  | { type: 'theme'; valeur: 'clair' | 'sombre' | 'automatique' | 'bascule' }
  /** « changer langue par anglais » : le choix de la personne, gardé par son appareil. */
  | { type: 'langue'; code: string }
  /** « rendre … » : la valeur d'une fonction. */
  | { type: 'rendre'; valeur: Valeur }
  /** `champs` : « changer client.adresse.rue par … », le chemin dans la fiche. */
  | { type: 'affectation'; nom: string; champs?: string[]; valeur: Valeur }
  | { type: 'locale'; nom: string; typeValeur: TypeValeur; valeur: Valeur }
  | {
      type: 'requete';
      adresse: string;
      /** Avec des données, la requête envoie ; sans données, elle lit. */
      /** « lireUn » : un seul élément, par l'identifiant donné dans `donnees`. */
      mode: 'lire' | 'envoyer' | 'lireUn';
      donnees: Valeur[];
      /** Les noms écrits (« avec customer = client ») ; sinon celui de la variable ou du champ. */
      cles?: (string | undefined)[];
      /** La variable qui reçoit la réponse. */
      resultat?: string;
      /** « de la source "boutique" » : l'API visée. */
      source?: string;
      /** « filtrant par k = v » : les paramètres d'adresse d'une lecture. */
      filtrant?: { cle: string; valeur: Valeur }[];
      /** Le chemin de la valeur utile dans la réponse de la source (« products »). */
      dans?: string;
    }
  /** « supprimer p de "produits" » : sur le serveur, par l'identifiant de la donnée. */
  | { type: 'suppression'; adresse: string; objet: Valeur; source?: string }
  /** « modifier p dans "produits" avec prix = … » : seuls les champs nommés changent. */
  | { type: 'modification'; adresse: string; objet: Valeur; changements: { champ: string; valeur: Valeur }[]; source?: string; remplacement?: boolean }
  /** « envoyer fichier photo vers "…" de la source "…" » : le fichier choisi, avec sa progression (plan des médias, 4.3). */
  | {
      type: 'envoiFichier';
      variable: string;
      adresse: string;
      source: string;
      /** Le fichier seul comme corps ; sinon un formulaire (multipart) sous le nom `champ`. */
      corpsBrut: boolean;
      champ: string;
      /** La variable nombre qui reçoit 0 à 100. */
      suivi?: string;
      /** La variable qui reçoit la réponse. */
      resultat?: string;
    }
  | { type: 'ajout'; liste: string; valeur: Valeur }
  /** Retire la première valeur égale ; ne fait rien si la liste ne la contient pas. */
  | { type: 'retrait'; liste: string; valeur: Valeur }
  | { type: 'si'; test: Test; alors: Action[]; sinon: Action[] }
  /** « tant que … : », « repeter n fois : », « arreter », « passer au suivant » (tâche 1). */
  | { type: 'tantQue'; test: Test; corps: Action[] }
  /** « essayer : … si erreur : … » : la première erreur arrête « corps » ; « siErreur » lit « raison ». */
  | { type: 'essayer'; corps: Action[]; siErreur: Action[] }
  | { type: 'repeter'; fois: Valeur; corps: Action[] }
  | { type: 'arreter' }
  | { type: 'passer' }
  /** « selon jour : cas "lundi" : … sinon : … » : le premier cas égal à la valeur. */
  | { type: 'selon'; valeur: Valeur; cas: { valeurs: Valeur[]; corps: Action[] }[]; sinon: Action[] }
  /**
   * La connexion au serveur, avec deux champs de la page : l'email, puis le
   * mot de passe. En cas d'échec, un message s'affiche et la suite des
   * actions ne s'exécute pas. La session est gardée par le serveur.
   */
  | { type: 'connexion'; email: Valeur; motDePasse: Valeur }
  | { type: 'deconnexion' }
  | {
      type: 'repetition';
      variable: string;
      typeVariable: TypeValeur;
      liste: Valeur;
      corps: Action[];
    };

export type Valeur =
  /**
   * Un texte ; un « {…} » au format français porte `format` (nombre et date :
   * décision F1 ; devise : L6), et un mot à accorder porte `pluriel` (L6).
   */
  | {
      type: 'texte';
      parties: PartiesTexte;
      /**
       * Un texte qui a des versions dans d'autres langues : toutes les
       * versions, celle de la langue de base (`parties`) en premier. Absent
       * pour un texte d'une seule langue.
       */
      versions?: { code: string; parties: PartiesTexte }[];
    }
  | { type: 'nombre'; valeur: number }
  | { type: 'booleen'; valeur: boolean }
  | { type: 'liste'; elements: Valeur[] }
  | { type: 'variable'; nom: string }
  | { type: 'champ'; id: string }
  | { type: 'calcul'; operateur: '+' | '-' | '*' | '/'; gauche: Valeur; droite: Valeur }
  /** Le nombre d'éléments d'une liste. */
  | { type: 'compte'; liste: Valeur }
  /** « fiche avec nom "Livre" et prix 12 » (décision L3). */
  | { type: 'fiche'; champs: { nom: string; valeur: Valeur }[] }
  /** « remise(prix, 10) » : l'appel d'une fonction (décision L2). */
  | { type: 'appel'; nom: string; arguments: Valeur[] }
  /** « moyenne de notes », « somme de … », « minimum de … », « maximum de … ». */
  | { type: 'agregat'; operation: 'moyenne' | 'somme' | 'minimum' | 'maximum'; liste: Valeur }
  /** « arrondi de x [a n chiffres] ». */
  | { type: 'arrondi'; valeur: Valeur; chiffres?: number }
  /** « hasard entre 1 et 6 » : un entier, bornes comprises. */
  | { type: 'hasard'; minimum: Valeur; maximum: Valeur }
  /** « aujourd'hui », « maintenant », « … plus 3 jours », « jours entre … et … » : des dates en texte (AAAA-MM-JJ). */
  | { type: 'dateDuJour'; maintenant: boolean }
  | { type: 'dateDecalee'; date: Valeur; nombre: Valeur; unite: 'jours' | 'semaines' | 'mois'; signe: 1 | -1 }
  | { type: 'joursEntre'; debut: Valeur; fin: Valeur }
  /** « panier.prix » sur une liste : la liste des valeurs du champ. */
  | { type: 'champs'; liste: Valeur; champ: string }
  /** « produits dont … » : `champs` sont les noms lus sur chaque élément dans `test`. */
  | { type: 'filtre'; liste: Valeur; champs: string[]; test: Test }
  /** « trier … [par champ] [decroissant] » : des nombres ou des textes. */
  | { type: 'tri'; liste: Valeur; champ?: string; decroissant: boolean; genre: 'nombre' | 'texte' }
  /** « grouper produits par categorie » : des fiches { nom, elements }, dans l'ordre d'apparition. */
  | { type: 'groupement'; liste: Valeur; champ: string }
  /** « premier de … » : le premier élément, ou rien. */
  | { type: 'premier'; liste: Valeur }
  /** « majuscules de nom », « minuscules de … », « longueur de … ». */
  | { type: 'operationTexte'; operation: 'majuscules' | 'minuscules' | 'longueur'; valeur: Valeur }
  /** « remplacer "a" par "b" dans nom ». */
  | { type: 'remplacement'; cherche: Valeur; remplace: Valeur; dans: Valeur }
  /** « les n premiers de … ». */
  | { type: 'premiers'; nombre: Valeur; liste: Valeur }
  /** « p.prix » : le champ d'une donnée du serveur. */
  | { type: 'champDonnee'; objet: Valeur; champ: string }
  /** « utilisateur est connecte » (ou « admin ») : vrai ou faux, selon la session. */
  | { type: 'utilisateur'; etat: 'connecte' | 'admin' }
  /** « produits est en chargement » : l'état de la requête qui remplit la variable. */
  | { type: 'etatRequete'; variable: string; etat: 'chargement' | 'erreur' | 'introuvable' }
  /** « erreur de produits » : le message de la dernière requête refusée. */
  | { type: 'erreurRequete'; variable: string }
  /** « mouvement est reduit » : la personne a demandé de réduire les animations. */
  | { type: 'mouvementReduit' }
  | { type: 'themeSombre' }
  /** « rien » : pas encore de valeur. */
  | { type: 'rien' };

/** Une condition : une comparaison, ou deux conditions reliées par « et » ou « ou ». */
export type Test = TestSimple | TestCombine;

/** « stock est superieur a 0 et prix est inferieur a 20000 ». */
export interface TestCombine {
  operateur: 'et' | 'ou';
  gauche: Test;
  droite: Test;
}

/** Vrai pour « … et … » ou « … ou … ». */
export function estCombine(test: Test): test is TestCombine {
  return test.operateur === 'et' || test.operateur === 'ou';
}

export interface TestSimple {
  gauche: Valeur;
  operateur:
    | 'dans'
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
    | 'contient'
    | 'commencePar'
    | 'finitPar';
  droite?: Valeur;
  /** « n'est pas vide » : le contraire du test. */
  negation?: boolean;
}

export interface Option {
  nom: string;
  valeur: string;
}
