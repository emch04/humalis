/**
 * Les types de la table de vocabulaire. La table elle-même est dans `table.ts`.
 */

/** Les cinq cibles de la feuille de route. */
export type Cible = 'web' | 'mobile' | 'desktop' | 'serveur' | 'statique';

export type Categorie =
  | 'structure' // page, composant, serveur
  | 'controle' // si, sinon, pour chaque
  | 'comparaison' // egal, inferieur, vide
  | 'valeur' // vrai, faux, rien
  | 'liaison' // le, la, de, l'… (marqués, puis sautés par le parser)
  | 'element' // bouton, texte, champ
  | 'saisie' // les sortes de champ : email, nombre, case à cocher, choix, liste déroulante
  | 'option' // nom, et plus tard indice, obligatoire
  | 'style' // couleur, fond, taille
  | 'valeurStyle' // bleu, grande, centree
  | 'evenement' // clique, survole, se charge
  | 'action' // afficher, rediriger, ajouter
  | 'etat' // variable, calcul
  | 'appareil' // camera, position (Expo et web)
  | 'bureau' // fenetre, menu (Electron)
  | 'donnee' // types de champs du serveur
  | 'droit'; // peut, seul, tout le monde (serveur)

/** Là où le mot est un mot-clé. Ailleurs, c'est un nom libre. */
export type Contexte =
  | 'partout' // mot réservé : jamais un nom de variable
  | 'instruction' // en tête de ligne dans un bloc d'écran
  | 'expression' // à la place d'une valeur (« le champ "email" », « nombre de »)
  | 'option' // après « avec » ou « et » dans une liste d'options
  | 'valeurStyle' // juste après un nom de style
  | 'evenement' // dans la tournure qui suit « quand »
  | 'comparaison' // après « est »
  | 'tournure' // mots lus à leur texte dans une comparaison
  | 'bureau' // dans un bloc « bureau » (desktop)
  | 'serveur' // en tête de ligne dans un bloc « serveur »
  | 'source' // dans un bloc « source » (API existante), ou après l'adresse d'une requête
  | 'donnee' // dans un bloc « donnee » (types de champs)
  | 'route' // dans un bloc « route » (règles d'accès)
  | 'composant' // en tête de ligne dans un bloc « composant » (parametre)
  | 'declaration' // dans une déclaration en haut du fichier (« utiliser composant … depuis »)
  | 'session' // dans une page : « se connecter », « se deconnecter », « utilisateur est connecte »
  | 'navigation' // dans une page ou son en-tête : « sous page », « revenir », « filtre »
  | 'miseEnPage' // en tête de ligne, suivi de « : », de « avec », d'un texte ou d'une valeur (« section », « ligne », « grille », « badge », « onglets »…)
  | 'interaction' // les interactions : en tête de ligne (« copier », « apres »), dans la tournure d'un événement (« appuie sur »), ou après le texte d'un message (« pendant », « sans disparaitre »)
  | 'saisie'; // un champ : sa sorte après « champ » (« champ telephone "…" »), « case a cocher », « choix », « liste deroulante », « parmi »

export interface Traduction {
  /** Ce que produit le générateur, écrit comme dans le code produit. */
  produit: string;
  /** Une précision pour le générateur ou la documentation. */
  note?: string;
}

export interface EntreeVocabulaire {
  /**
   * Forme canonique : minuscules, sans accent, sans trait d'union. Une
   * tournure de plusieurs mots s'écrit avec des espaces, sans les mots de
   * liaison.
   */
  mot: string;
  /** L'orthographe usuelle, avec ses accents, pour la documentation (« égal »). */
  accentue?: string;
  /**
   * Autres formes acceptées, déjà normalisées (sans accent) : féminins,
   * pluriels, conjugaisons. Les accents n'ont pas besoin d'être listés.
   */
  variantes: readonly string[];
  categorie: Categorie;
  /** Concept neutre, nom de l'idée dans la représentation intermédiaire (« element.bouton »). */
  concept: string;
  /**
   * Les places où le mot est un mot-clé. Vide pour un mot de liaison, qui
   * n'est jamais un mot-clé.
   */
  contextes: readonly Contexte[];
  /** Valeurs de style seulement : les styles qui acceptent cette valeur. */
  valeurDe?: readonly string[];
  /**
   * Options de style seulement : les éléments sur lesquels l'option se
   * règle (« grille » pour `colonnes`). Absent : tous les éléments.
   * Les noms sont ceux des éléments (`texte`, `bouton`…) et des blocs
   * (`grille`, `ligne`, `appareil`…).
   */
  surElements?: readonly string[];
  /**
   * Options de style seulement : la valeur est libre (un nom d'icône, un
   * texte, un nombre, ou aucune pour un réglage sans valeur) et vérifiée par
   * l'analyse des éléments d'écran, pas par une liste de mots.
   */
  valeurLibre?: boolean;
  /** Mots de liaison seulement : élision, écrite devant une apostrophe (« l' »). */
  elision?: boolean;
  /**
   * Une traduction par cible. null : l'idée n'existe pas (ou pas encore)
   * sur cette cible. Les cinq clés sont obligatoires.
   */
  cibles: Readonly<Record<Cible, Traduction | null>>;
  /** Ce que l'entrée couvre dans les sources : « html:button », « react:onClick ». */
  couvre: readonly string[];
  /** Une phrase pour la documentation, compréhensible par un débutant. */
  description: string;
  /** Un programme Humalis complet, qui passe l'analyse si le mot est « supporte ». */
  exemple: string;
  /** « supporte » : le compilateur l'accepte. « prevu » : il répond « pas encore ». */
  statut: 'supporte' | 'prevu';
  /** Étape de la feuille de route où le mot devient « supporte » (0 : déjà là). */
  etape: number;
  /** Une précision honnête, par exemple « reconnu mais sans effet pour l'instant ». */
  note?: string;
}
