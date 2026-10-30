import { analyserPublication } from './site.js';
import { analyserLangues, type LanguesDuProgramme } from './langues.js';
import { langueDuMot } from '../i18n/langues.js';
import { texteSource } from '../parser/langues.js';
import type {
  Programme,
  RegleSource,
  Page,
  Instruction,
  Expression,
  Comparaison,
  Test,
  DeclarationVariable,
  Boucle,
  Evenement,
  Action,
  Element,
  LitteralChaine,
  ModificationListe,
  DefinitionComposant,
  Parametre,
  UsageComposant,
  AccesChamp,
  Requete,
  Donnee,
  TypeChamp,
  Connexion,
  Formulaire,
  Bloc,
  DefinitionFonction,
  Disposition,
  Suppression,
  EnvoiFichier,
  Modification,
  Minuterie,
  Fenetre,
  GenreEvenement,
  Graphique,
} from '../parser/ast.js';
import {
  verifierMessage,
  verifierMinuterie,
  verifierCopier,
  verifierPartager,
  verifierConfirmer,
  verifierFenetre,
  avertirFenetre,
  verifierTouches,
  verifierSaisie,
  avertirBas,
  fenetreEnDouble,
  blocEnDouble,
  champIntrouvable,
  blocDuBas,
  verifierDeplacement,
  raccourciEnDouble,
  verifierOrdre,
  verifierRaccourciElement,
  type Hote,
  type PlaceGeste,
} from './interactions.js';
import type { Diagnostic } from './erreurs.js';
import type { PartieChaine } from '../lexer/types.js';
import { ElementsPage, type ElementRecense, type FormulaireRecense } from './elements.js';
import { optionCanonique, erreurSurElement, OPTIONS } from './styles.js';
import { contraste, FOND_PAGE } from './couleurs.js';
import { verifierAccessibilite } from './accessibilite.js';
import { verifierElementEcran, verifierBlocEcran, type Signaler } from './ecran.js';
import { verifierChoixFichier, verifierEnvoiFichier, typeFichierChoisi, aUnApercu, recenserFichiers, type FichiersDeLaPage } from './fichiers.js';
import { verifierCarte, verifierMarqueur } from './carte.js';
import { verifierMouvement, verifierDefilementsDeLaPage, verifierImage, verifierAudio, verifierPrioritairesDeLaPage, verifierGraphique } from './medias.js';
import { DEVISES } from '../cibles/format.js';
import { COULEURS_CSS } from '../cibles/web/styles.js';
import { analyserServeur, droitsDeRoute, adresseNormalisee, type Droits } from './serveur.js';
import { simplifier } from './elements.js';
import { analyserNavigation, lireCible } from './navigation.js';
import { analyserSources, indexerSources, verifierRequeteSource, verifierOperationSource, type InfoSource } from './sources.js';
import { avertirNomsDuLangage } from './noms.js';
import { Portees, type Symbole } from './portees.js';
import { proposerNom } from './suggestions.js';
import {
  type TypeValeur,
  TEXTE,
  NOMBRE,
  BOOLEEN,
  INCONNU,
  listeDe,
  decrireType,
  decrireListe,
  estConnu,
  compatibles,
} from './types.js';

/** Les options d'un élément, que « lien … vers "…" avec … » lit avant un paramètre de page. */
const NOMS_OPTIONS_ELEMENT = new Set([...Object.keys(OPTIONS), 'nom', 'style', 'ancre', 'nouvel', 'obligatoire', 'indice', 'minimum', 'maximum']);

/** Les paramètres de chaque page (« page "produit" avec parametre id »), pour vérifier les liens. */
const parametresDesPages = new Map<string, string[]>();
/** Les filtres d'adresse de chaque page (« page "catalogue" avec filtre categorie »), pour vérifier les liens. */
const filtresDesPages = new Map<string, { nom: string; nombre?: boolean }[]>();
/** Les langues déclarées (mot → code) : « langue » et leurs noms deviennent des valeurs intégrées. Vide sans bloc. */
const languesActives = new Map<string, string>();

export interface ResultatAnalyse {
  /** Erreurs et avertissements, triés par ligne. */
  diagnostics: Diagnostic[];
  /** Les éléments de chaque page, avec leurs identifiants. */
  elements: Map<Page, ElementsPage>;
  /** Pour un événement, montrer, cacher ou changer texte : les éléments visés. */
  cibles: Map<Instruction, string[]>;
  /** Pour chaque `champ "…"` : l'identifiant du champ. */
  champs: Map<Expression, string>;
  /** L'adresse réelle d'une requête vers une route du serveur (« /api/produits »). */
  /** L'adresse réelle (« /api/produits ») d'une requête, d'une modification ou d'une suppression. */
  adressesRequetes: Map<Requete | Suppression | Modification, string>;
  /** Le type d'une variable déclarée, ou de la variable d'une boucle. */
  types: Map<DeclarationVariable | Boucle, TypeValeur>;
  /** Chaque composant écrit en Humalis, vu comme une page (pour ses éléments). */
  pagesComposants: Map<DefinitionComposant, Page>;
  /** Les types donnés à chaque paramètre (« Fiche.prix »), usage par usage. */
  typesParametres: Map<string, TypeValeur[]>;
  /** Les variables déclarées « = rien » : elles n'ont pas encore de valeur (« produit est rien »). */
  facultatives: Set<DeclarationVariable>;
  /** La règle de la route de source qui permet chaque requête vers une source (pour `dans`). */
  reglesSources: Map<Requete, RegleSource>;
  /** Pour chaque page : les variables dont elle lit l'état de requête (en chargement, erreur…) ou qu'elle recharge. */
  etatsLus: Map<Page, Set<string>>;
  /** La règle de la route de source qui permet un « supprimer » ou un « modifier ». */
  reglesOperations: Map<Suppression | Modification, RegleSource>;
  /** Les requêtes qui lisent un seul élément par son identifiant (« avec id » d'une page à paramètre). */
  lecturesUn: Set<Requete>;
  /** Le format français d'un « {…} » de texte : un nombre, la date d'un champ du serveur (F1), ou une devise (L6). */
  formats: Map<PartieChaine, 'nombre' | 'date' | 'depuis' | 'FC' | 'EUR' | 'USD' | 'Ko' | 'Mo'>;
  /** « {n article} » : le mot à accorder (décision L6). */
  pluriels: Map<PartieChaine, string>;
  /** « {prix en FC} » : le chemin de la valeur (« prix »), quand il diffère du texte entre accolades. */
  chemins: Map<PartieChaine, string>;
  /** Les fonctions écrites en haut du fichier (décision L2), par nom. */
  fonctions: Map<string, InfoFonction>;
  /** Les fonctions d'actions (sans « rendre ») : leurs appels sont dépliés par le parser. */
  fonctionsActions: Set<string>;
  /** « panier.prix » lu sur une liste : la liste des valeurs de ce champ. */
  projections: Set<AccesChamp>;
  /** « … dont … » : les champs de chaque élément, lus par leur nom dans la condition. */
  filtres: Map<Expression, string[]>;
  /** « trier … » : trier des nombres ou des textes. */
  tris: Map<Expression, 'nombre' | 'texte'>;
  /** Les noms des couleurs du bloc « theme : » : permises comme les couleurs de base. */
  couleursTheme: Set<string>;
  /** L'en-tête et le pied communs, analysés comme des pages. */
  pagesDispositions: Map<Disposition, Page>;
  /** Leurs couleurs claire et sombre, pour avertir d'un texte qui se verrait mal. */
  valeursTheme: Map<string, { clair: string; sombre: string }>;
  /** L'identifiant de chaque fenêtre (« fenetre_details »). */
  fenetres: Map<Fenetre, string>;
  /** L'identifiant de chaque bloc nommé (« bloc_catalogue »), par nom. */
  blocsNommes: Map<string, string>;
  /** Les langues du programme (bloc « langues ») et les versions du bloc « traductions ». */
  langues: LanguesDuProgramme;
  /** « langue » (la langue choisie) ou un nom de langue lu comme valeur : « langue », ou le code (« en »). */
  referencesLangue: Map<Expression, string>;
  /** « changer langue par anglais » : le code de la langue choisie. */
  changementsLangue: Map<Instruction, string>;
}

/** Ce que l'analyse sait d'une fonction : ce qu'elle rend, et les types reçus à chaque appel. */
export interface InfoFonction {
  definition: DefinitionFonction;
  retour: TypeValeur;
  /** Pour chaque appel, le type de chaque valeur donnée. */
  appels: TypeValeur[][];
}

/** Ce que les pages savent du serveur du même fichier (étape 4). */
interface Liens {
  /** Les sources (API existantes) du programme. */
  sources: Map<string, InfoSource>;
  serveur?: string;
  routes: Map<string, { adresse: string; donnee: Donnee; droits: Droits }>;
  donnees: Map<string, Donnee>;
}

/** Ce que l'analyse sait des composants déclarés dans le fichier. */
interface Composants {
  react: Set<string>;
  /** Nom du composant Humalis → ses paramètres. */
  humalis: Map<string, string[]>;
}

/** Ce que la page sait déjà de la personne : connectée, ou admin (« si utilisateur est … »). */
type Garde = 'connecte' | 'admin' | undefined;

/** La garde la plus forte des deux : admin passe avant connecté. */
const plusForte = (a: Garde, b: Garde): Garde => (a === 'admin' || b === 'admin' ? 'admin' : (a ?? b));

/** La garde que pose une condition « si utilisateur est connecte|admin ». */
const gardeDe = (test: Test): Garde => {
  // « … et utilisateur est admin » garde la page ; avec « ou », rien n'est sûr.
  if (test.type === 'Combinaison') return test.operateur === 'et' ? plusForte(gardeDe(test.gauche), gardeDe(test.droite)) : undefined;
  return test.gauche.type === 'EtatUtilisateur' && test.operateur === 'vrai' ? test.gauche.etat : undefined;
};

/** Une instruction est soit affichée (vue), soit exécutée (dans un événement). */
type Contexte = 'vue' | 'evenement';

/**
 * Où se trouve un bloc de la vue : dans la page, ou dans une boucle (avec
 * les éléments de son corps). Un « si » ou un bloc de mise en page garde la
 * place de son parent : un événement y vise les mêmes éléments (décision F2).
 */
type Place =
  | { genre: 'page' }
  | { genre: 'boucle'; elements: ElementRecense[]; formulaires: FormulaireRecense[] };

/**
 * Vérifie le sens d'un programme déjà analysé par le parser : variables
 * déclarées, éléments visés, types simples, place des instructions. Ne
 * modifie pas l'arbre et collecte toutes les erreurs au lieu de
 * s'arrêter à la première.
 */
export function analyserSens(programme: Programme): ResultatAnalyse {
  const resultat: ResultatAnalyse = {
    diagnostics: [],
    elements: new Map(),
    cibles: new Map(),
    champs: new Map(),
    types: new Map(),
    pagesComposants: new Map(),
    pagesDispositions: new Map(),
    typesParametres: new Map(),
    facultatives: new Set(),
    lecturesUn: new Set(),
    reglesSources: new Map(),
    etatsLus: new Map(),
    reglesOperations: new Map(),
    adressesRequetes: new Map(),
    formats: new Map(),
    pluriels: new Map(),
    chemins: new Map(),
    fonctions: new Map(),
    fonctionsActions: new Set(programme.fonctionsActions ?? []),
    projections: new Set(),
    filtres: new Map(),
    tris: new Map(),
    couleursTheme: new Set((programme.theme?.couleurs ?? []).map((c) => c.nom)),
    fenetres: new Map(),
    blocsNommes: new Map(),
    valeursTheme: new Map((programme.theme?.couleurs ?? []).map((c) => [c.nom, { clair: c.clair, sombre: c.sombre ?? c.clair }])),
    langues: { langues: [], traductions: new Map() },
    referencesLangue: new Map(),
    changementsLangue: new Map(),
  };
  // Les langues d'abord : avec elles, « langue » et « anglais » sont des valeurs intégrées.
  resultat.langues = analyserLangues(programme, resultat.diagnostics);
  languesActives.clear();
  for (const langue of resultat.langues.langues) languesActives.set(langue.mot, langue.code);
  const nomsPages = new Set(programme.pages.map((p) => p.nom));
  parametresDesPages.clear();
  for (const p of programme.pages) parametresDesPages.set(p.nom, p.parametres);
  filtresDesPages.clear();
  for (const p of programme.pages) filtresDesPages.set(p.nom, p.filtres ?? []);

  // Les classes définies dans les blocs « style : ». Avec un fichier CSS
  // séparé, que l'analyse ne lit pas, on ne vérifie rien.
  const classes =
    programme.fichiersStyle.length > 0
      ? undefined
      : new Set(programme.styles.flatMap((b) => [...b.css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1])));

  // Les variables du haut du fichier sont partagées entre les pages : on
  // les analyse une fois, puis chaque page les voit (portée « application »).
  const globale = new AnalysePage(
    { type: 'Page', nom: '', parametres: [], corps: [], ligne: 0 },
    nomsPages,
    resultat,
    classes,
  );
  const partages = globale.declarerPartages(programme.partages);

  const liens: Liens = { sources: new Map(), serveur: programme.serveurs[0]?.nom, routes: new Map(), donnees: new Map() };
  for (const serveur of programme.serveurs) {
    for (const donnee of serveur.donnees) liens.donnees.set(donnee.nom, donnee);
    for (const route of serveur.routes) {
      const donnee = liens.donnees.get(route.regles[0]?.donnee ?? '');
      if (donnee) liens.routes.set(adresseNormalisee(route.adresse), { adresse: route.adresse, donnee, droits: droitsDeRoute(route) });
    }
  }

  liens.sources = indexerSources(programme.sources, liens.donnees);

  const composants: Composants = {
    react: new Set(programme.composantsReact.map((c) => c.nom)),
    humalis: new Map(programme.composants.map((c) => [c.nom, c.parametres.map((p) => p.nom)])),
  };

  // Les fonctions d'abord : les pages connaissent ce qu'elles rendent.
  const fonctions = resultat.fonctions;
  for (const definition of programme.fonctions) {
    const deja = fonctions.get(definition.nom);
    if (deja) {
      resultat.diagnostics.push({
        gravite: 'erreur',
        message: `la fonction « ${definition.nom} » est déjà définie (ligne ${deja.definition.ligne}).`,
        ligne: definition.ligne,
      });
      continue;
    }
    fonctions.set(definition.nom, { definition, retour: INCONNU, appels: [] });
  }
  for (const info of fonctions.values()) {
    const page: Page = { type: 'Page', nom: `fonction ${info.definition.nom}`, parametres: [], corps: [], ligne: info.definition.ligne };
    new AnalysePage(page, nomsPages, resultat, classes, [], composants, [], liens, fonctions).analyserFonction(info);
  }

  // Un composant écrit en Humalis s'analyse comme une page dont les
  // paramètres sont des variables déjà déclarées.
  for (const definition of programme.composants) {
    if (!/^\p{Lu}/u.test(definition.nom)) {
      const suggestion = definition.nom.charAt(0).toUpperCase() + definition.nom.slice(1);
      resultat.diagnostics.push({
        gravite: 'erreur',
        message: `le nom d'un composant commence par une majuscule, comme en React : « ${suggestion} ».`,
        ligne: definition.ligne,
      });
    }
    const page: Page = { type: 'Page', nom: definition.nom, parametres: [], corps: definition.corps, ligne: definition.ligne };
    resultat.pagesComposants.set(definition, page);
    new AnalysePage(page, nomsPages, resultat, classes, partages, composants, definition.parametres, liens, fonctions).analyser();
  }

  // L'en-tête et le pied communs s'analysent comme une page : ils voient les variables partagées et la session.
  for (const disposition of [programme.entete, programme.pied]) {
    if (!disposition) continue;
    const page: Page = { type: 'Page', nom: disposition.genre, parametres: [], corps: disposition.corps, ligne: disposition.ligne };
    resultat.pagesDispositions.set(disposition, page);
    for (const style of disposition.styles) {
      const option = optionCanonique(style.propriete, style.valeur, resultat.couleursTheme);
      if ('erreur' in option) resultat.diagnostics.push({ gravite: 'erreur', message: option.erreur, ligne: disposition.ligne });
    }
    new AnalysePage(page, nomsPages, resultat, classes, partages, composants, [], liens).analyser();
  }

  for (const page of programme.pages) {
    new AnalysePage(page, nomsPages, resultat, classes, partages, composants, [], liens, fonctions).analyser();
    resultat.diagnostics.push(...verifierAccessibilite(page, resultat.valeursTheme));
    for (const [sans, genre] of [[page.sansEntete, 'entete'], [page.sansPied, 'pied']] as const) {
      if (sans && !programme[genre]) {
        resultat.diagnostics.push({
          gravite: 'avertissement',
          message: `la page « ${page.nom} » se passe d'un ${genre === 'entete' ? 'en-tête' : 'pied de page'}, mais l'application n'en a pas : écrivez « ${genre} : » en haut du fichier, ou retirez « sans ${genre} ».`,
          ligne: page.ligne,
        });
      }
    }
  }

  for (const serveur of programme.serveurs) analyserServeur(serveur, resultat.diagnostics);
  analyserSources(programme.sources, programme.serveurs, resultat.diagnostics);
  analyserNavigation(programme, resultat.diagnostics);
  analyserPublication(programme, resultat.diagnostics);

  // Un test (décision O3) vise une page de l'application.
  for (const test of programme.tests) {
    if (!nomsPages.has(test.page)) {
      resultat.diagnostics.push({
        gravite: 'erreur',
        message: `le test « ${test.nom} » vise la page « ${test.page} », qui n'existe pas. Pages : ${[...nomsPages].join(', ') || 'aucune'}.${proposerNom(test.page, nomsPages)}`,
        ligne: test.ligne,
      });
    }
  }

  // Un nom déjà refusé pour sa ligne (« utilisateur » pris par la session) n'a pas besoin d'un avertissement en plus.
  const refuses = new Set(resultat.diagnostics.filter((d) => d.message.startsWith('le nom « ')).map((d) => d.ligne));
  resultat.diagnostics.push(...avertirNomsDuLangage(programme).filter((d) => !refuses.has(d.ligne)));
  resultat.diagnostics.sort((a, b) => a.ligne - b.ligne);
  return resultat;
}

const NOMS_ACTIONS: Record<string, string> = {
  ajouter: 'ajouter',
  retirer: 'retirer',
  afficherErreur: 'afficher erreur',
  montrer: 'montrer',
  cacher: 'cacher',
  rediriger: 'rediriger',
  revenir: 'revenir',
  changerTexte: 'changer texte',
  changerTheme: 'changer theme',
};

const NOMS_OPERATEURS: Record<string, string> = {
  inferieur: 'est inférieur à',
  superieur: 'est supérieur à',
  inferieurOuEgal: 'est inférieur ou égal à',
  superieurOuEgal: 'est supérieur ou égal à',
};

class AnalysePage {
  private readonly portees = new Portees();
  private readonly elements: ElementsPage;
  /** Variables déclarées au premier niveau de la page, avec leur ligne. */
  private readonly declareesPlusLoin = new Map<string, number>();
  /** Variables de boucles déjà fermées, avec la ligne de leur boucle. */
  private readonly boucleFermee = new Map<string, number>();
  /** Les éléments affichés seulement dans un « si utilisateur est … » de la vue. */
  private readonly elementsGardes = new Map<string, Garde>();
  /** La garde du bloc analysé : une requête gardée ne sera pas refusée à un visiteur. */
  private garde: Garde;
  /** La page lit ou change la session ; la ligne d'un nom « utilisateur » déclaré. */
  private litLaSession = false;
  private elementEnCours?: string;
  private ligneNomUtilisateur?: number;
  /** Le formulaire dont on analyse le bloc, s'il y en a un. */
  private formulaireOuvert?: Formulaire;
  /** Les formulaires déjà vus (nom → ligne), et l'événement « est soumis » de chacun (identifiant → ligne). */
  private readonly formulairesVus = new Map<string, number>();
  private readonly soumissions = new Map<string, number>();
  /** Un événement « est soumis » vise un formulaire introuvable (déjà signalé). */
  private soumissionPerdue = false;
  /** Les lignes des éléments animés « au defilement » de la page. */
  private readonly defilements: number[] = [];
  /** Les lignes des images « prioritaire » de la page. */
  private readonly prioritaires: number[] = [];
  /** Les choix de fichier de la page, par variable (pour vérifier « envoyer fichier »). */
  private fichiers: FichiersDeLaPage = new Map();

  // ─── Les interactions (plan 2026-10-30-interactions) ───────────────────
  /** L'événement ouvert, et les blocs où l'on se trouve (minuterie, question, bouton d'un message, fenêtre). */
  private readonly cadre = {
    evenement: undefined as GenreEvenement | undefined,
    minuteries: 0,
    questions: 0,
    actionsMessage: 0,
    fenetres: 0,
    /** Une attente (requête, question) est déjà passée dans cet événement. */
    attente: false,
  };
  /** Les fenêtres de la page, recensées d'avance : « montrer "…" » peut venir avant elles. */
  private readonly fenetres: { noeud: Fenetre; id: string; nom: string; ouverte: boolean; fermee: boolean }[] = [];
  /** Les blocs nommés (« section … avec nom "catalogue" »), et la ligne de leur « arrive en bas de ». */
  private readonly blocsNommes = new Map<string, { id: string; ligne: number; bas?: number }>();
  /** Les listes déplaçables (« pour chaque … dans taches avec deplacement »), avec la ligne de leur boucle. */
  private readonly listesDeplacees = new Map<string, number>();
  /** Les raccourcis de la page (« controle+k », ou « entree@recherche » dans un champ), avec leur ligne. */
  private readonly raccourcis = new Map<string, number>();
  /** Les « quand l'ordre de … change », vérifiés à la fin : la boucle peut venir après. */
  private readonly evenementsOrdre: Evenement[] = [];

  constructor(
    private readonly page: Page,
    private readonly nomsPages: Set<string>,
    private readonly resultat: ResultatAnalyse,
    private readonly classesDefinies?: Set<string>,
    private readonly partages: Symbole[] = [],
    private readonly composants: Composants = { react: new Set(), humalis: new Map() },
    private readonly parametres: Parametre[] = [],
    private readonly liens: Liens = { sources: new Map(), routes: new Map(), donnees: new Map() },
    private readonly fonctions: Map<string, InfoFonction> = new Map(),
  ) {
    this.elements = new ElementsPage(page, resultat.diagnostics);
    resultat.elements.set(page, this.elements);
    this.recenserInteractions(page.corps);

    for (const instruction of page.corps) {
      if (instruction.type === 'Variable' && !this.declareesPlusLoin.has(instruction.nom)) {
        this.declareesPlusLoin.set(instruction.nom, instruction.ligne);
      }
    }
  }

  /** Le nombre de boucles ouvertes dans un événement ou une fonction (pour « arreter »). */
  private boucles = 0;

  /** La fonction dont on analyse le corps, et les types de ce qu'elle rend. */
  private fonctionOuverte?: { info: InfoFonction; rendus: TypeValeur[] };

  /** Le corps d'une fonction : ses paramètres sont déclarés, ses actions calculent. */
  analyserFonction(info: InfoFonction): void {
    this.portees.ouvrir();
    for (const p of info.definition.parametres) this.declarer(p.nom, p.ligne, INCONNU);
    this.fonctionOuverte = { info, rendus: [] };
    this.bloc(info.definition.corps, 'evenement', { genre: 'page' });
    // Ce que rend la fonction : le premier type connu parmi ses « rendre ».
    info.retour = this.fonctionOuverte.rendus.find(estConnu) ?? INCONNU;
    this.fonctionOuverte = undefined;
    this.portees.fermer();
  }

  analyser(): void {
    this.portees.ouvrir();
    // Les mêmes symboles pour toutes les pages : le type d'une liste vide,
    // appris par un ajout dans une page, vaut aussi pour les autres.
    for (const symbole of this.partages) this.portees.declarerSymbole(symbole);
    this.portees.ouvrir();
    for (const p of this.parametres) this.declarer(p.nom, p.ligne, INCONNU);
    // Les paramètres de la page sont lus dans son adresse : du texte.
    for (const p of this.page.parametres) {
      // « lien … vers "produit" avec nom … » lirait l'option « nom » : ce nom ne peut pas servir.
      if (NOMS_OPTIONS_ELEMENT.has(simplifier(p))) {
        this.erreur(
          `« ${p} » ne peut pas nommer un paramètre de page : c'est une option des éléments (avec ${p} …). Choisissez un autre nom.`,
          this.page.ligne,
        );
      }
      this.declarer(p, this.page.ligne, TEXTE);
    }
    // Les filtres sont lus dans la requête de l'adresse : un texte, ou un nombre, et « rien » quand l'adresse ne les a pas.
    for (const f of this.page.filtres ?? []) {
      if (NOMS_OPTIONS_ELEMENT.has(simplifier(f.nom))) {
        this.erreur(`« ${f.nom} » ne peut pas nommer un filtre de page : c'est une option des éléments (avec ${f.nom} …). Choisissez un autre nom.`, f.ligne);
      }
      if (this.page.parametres.includes(f.nom)) {
        this.erreur(`« ${f.nom} » est à la fois un paramètre et un filtre de la page « ${this.page.nom} » : choisissez un seul rôle (un paramètre est dans le chemin, un filtre dans ?${f.nom}=…).`, f.ligne);
        continue;
      }
      this.declarer(f.nom, f.ligne, f.nombre ? NOMBRE : TEXTE);
    }
    this.recenserGardes(this.page.corps, undefined);
    this.fichiers = recenserFichiers(this.page.corps);
    this.bloc(this.page.corps, 'vue', { genre: 'page' });
    // L'aperçu lit les variables de la page, comme un texte (« {produit.nom} | Rey Store »).
    for (const valeur of [this.page.apercu?.titre, this.page.apercu?.description, this.page.apercu?.image]) {
      if (valeur) this.typeDe(valeur);
    }
    this.verifierEtatsRequetes();
    verifierDefilementsDeLaPage(this.defilements, this.signaler());
    verifierPrioritairesDeLaPage(this.prioritaires, this.signaler());
    this.finInteractions();
    this.portees.fermer();
    this.portees.fermer();
    // Un formulaire sans « est soumis » n'envoie rien (un formulaire en double est déjà refusé,
    // et un événement qui vise un nom mal écrit l'est aussi : pas de remarque de plus).
    for (const formulaire of this.soumissionPerdue ? [] : this.elements.formulaires) {
      if (this.soumissions.has(formulaire.id) || this.formulairesVus.get(formulaire.nom) !== formulaire.ligne) continue;
      this.avertissement(
        `le formulaire « ${formulaire.nom} » n’envoie rien : ajoutez quand le formulaire "${formulaire.nom}" est soumis : suivi de ce qu’il faut faire.`,
        formulaire.ligne,
      );
    }
    // Le code produit nomme la session « utilisateur » : une variable du même nom la cacherait.
    // Une variable partagée du même nom aussi, signalée une seule fois à sa déclaration.
    const partagee = this.partages.find((p) => simplifier(p.nom) === 'utilisateur');
    const ligne = this.ligneNomUtilisateur ?? partagee?.ligne;
    const message =
      'le nom « utilisateur » est pris par la session (« si utilisateur est … », « se connecter ») : donnez un autre nom à cette variable, par exemple « membre ».';
    if (this.litLaSession && ligne !== undefined && !this.resultat.diagnostics.some((d) => d.ligne === ligne && d.message === message)) {
      this.erreur(message, ligne);
    }
  }

  /** Les éléments de la vue placés dans un « si utilisateur est connecte|admin : ». */
  private recenserGardes(instructions: Instruction[], garde: Garde): void {
    for (const instruction of instructions) {
      if (instruction.type === 'Element' && garde) {
        const id = this.elements.idDe(instruction);
        if (id) this.elementsGardes.set(id, garde);
      } else if (instruction.type === 'Condition') {
        this.recenserGardes(instruction.alors, plusForte(garde, gardeDe(instruction.test)));
        this.recenserGardes(instruction.sinon, garde);
      } else if (instruction.type === 'Boucle' || instruction.type === 'Formulaire' || instruction.type === 'Bloc' || instruction.type === 'Fenetre') {
        this.recenserGardes(instruction.corps, garde);
      }
    }
  }

  /** Analyse les variables du haut du fichier et renvoie leurs symboles. */
  declarerPartages(declarations: DeclarationVariable[]): Symbole[] {
    this.portees.ouvrir();
    const symboles: Symbole[] = [];
    for (const declaration of declarations) {
      if (!declaration.options?.partagee) {
        this.erreur(
          `en haut du fichier, une variable est partagée entre les pages : ajoutez « avec partagee » (variable ${declaration.nom} = … avec partagee).`,
          declaration.ligne,
        );
      }
      const type = this.typeDe(declaration.valeur);
      if (declaration.fichierDonnees) {
        let fiche = type;
        while (fiche.genre === 'liste') fiche = fiche.de;
        if (fiche.genre === 'fiche') fiche.fichier = declaration.fichierDonnees;
      }
      this.resultat.types.set(declaration, type);
      this.declarer(declaration.nom, declaration.ligne, type, declaration);
      const symbole = this.portees.chercher(declaration.nom);
      if (symbole) symboles.push(symbole);
    }
    this.portees.fermer();
    return symboles;
  }

  private erreur(message: string, ligne: number): void {
    this.resultat.diagnostics.push({ gravite: 'erreur', message, ligne });
  }

  private avertissement(message: string, ligne: number): void {
    this.resultat.diagnostics.push({ gravite: 'avertissement', message, ligne });
  }

  /** `place` dit où se trouve le bloc : dans la page, ou dans une boucle de la vue. */
  private bloc(instructions: Instruction[], contexte: Contexte, place: Place): void {
    for (const instruction of instructions) {
      this.instruction(instruction, contexte, place);
    }
  }

  /** Ouvre une portée le temps d'analyser un bloc, à la même place que son parent. */
  private sousBloc(instructions: Instruction[], contexte: Contexte, place: Place): void {
    this.portees.ouvrir();
    this.bloc(instructions, contexte, place);
    this.portees.fermer();
  }

  private instruction(instruction: Instruction, contexte: Contexte, place: Place): void {
    // Une fonction calcule : elle n'affiche rien, n'envoie rien, ne change pas de page.
    const interdite = this.fonctionOuverte ? actionInterditeDansUneFonction(instruction) : undefined;
    if (interdite) {
      this.erreur(`une fonction calcule une valeur : « ${interdite} » s'écrit dans un événement, pas dans une fonction.`, instruction.ligne);
      return;
    }
    switch (instruction.type) {
      case 'Essayer':
        if (contexte !== 'evenement') {
          this.erreur('« essayer » s\'écrit dans un événement : il attrape l\'erreur d\'une requête ou d\'une action.', instruction.ligne);
          return;
        }
        this.sousBloc(instruction.corps, contexte, place);
        // « raison » : le message de l'erreur, lisible seulement dans « si erreur ».
        this.portees.ouvrir();
        this.declarer('raison', instruction.ligne, TEXTE);
        this.sousBloc(instruction.siErreur, contexte, place);
        this.portees.fermer();
        return;

      case 'Supposant':
        if (contexte !== 'evenement') this.erreur('« en supposant que ça marche » ne sert que dans un événement.', instruction.ligne);
        for (const action of instruction.corps) {
          if (action.type !== 'Affectation' && action.type !== 'ModificationListe') this.erreur('un élément ne se défait pas : placez ici changer, ajouter ou retirer.', action.ligne);
          this.instruction(action, contexte, place);
        }
        return;
      case 'TantQue':
      case 'Repeter':
      case 'Selon': {
        const mot = instruction.type === 'TantQue' ? 'tant que' : instruction.type === 'Repeter' ? 'repeter' : 'selon';
        if (contexte === 'vue') {
          this.erreur(
            mot === 'selon'
              ? '« selon » s\'écrit dans un événement ou une fonction : dans la page, utilisez « si ».'
              : `« ${mot} » s'écrit dans un événement ou une fonction : dans la page, « pour chaque » affiche une liste.`,
            instruction.ligne,
          );
        }
        if (instruction.type === 'Selon') {
          this.typeDe(instruction.valeur);
          for (const cas of instruction.cas) {
            cas.valeurs.forEach((v) => this.typeDe(v));
            this.sousBloc(cas.corps, contexte, place);
          }
          this.sousBloc(instruction.sinon, contexte, place);
          return;
        }
        if (instruction.type === 'TantQue') {
          this.comparaison(instruction.test);
          // Une condition dont aucune variable ne change dans la boucle ne devient jamais fausse.
          const lues = nomsLus(instruction.test);
          const changees = nomsChanges(instruction.corps);
          if (lues.length > 0 && !lues.some((n) => changees.has(n))) {
            this.avertissement(`cette boucle ne change jamais « ${lues[0]} » : elle risque de ne jamais s'arrêter.`, instruction.ligne);
          }
        } else {
          const type = this.typeDe(instruction.fois);
          if (estConnu(type) && type.genre !== 'nombre') {
            this.erreur(`« repeter » attend un nombre de fois ; ${decrire(instruction.fois)} est ${decrireType(type)}.`, instruction.ligne);
          }
        }
        this.boucles++;
        this.sousBloc(instruction.corps, contexte, place);
        this.boucles--;
        return;
      }

      case 'Arreter':
      case 'PasserAuSuivant': {
        const mot = instruction.type === 'Arreter' ? 'arreter' : 'passer au suivant';
        if (this.boucles === 0) this.erreur(`« ${mot} » s'écrit dans une boucle (pour chaque, tant que, repeter).`, instruction.ligne);
        return;
      }

      case 'Rendre': {
        const type = this.typeDe(instruction.valeur);
        if (!this.fonctionOuverte) {
          this.erreur('« rendre » ne s\'écrit que dans une fonction (fonction … avec … :).', instruction.ligne);
        } else {
          this.fonctionOuverte.rendus.push(type);
        }
        return;
      }

      case 'Variable': {
        if (instruction.options?.partagee) {
          this.erreur('une variable partagée se déclare en haut du fichier, hors des pages.', instruction.ligne);
        }
        const type = this.typeDe(instruction.valeur);
        this.resultat.types.set(instruction, type);
        // « = rien » et « premier de … » : il peut ne pas y avoir de valeur.
        if (instruction.valeur.type === 'Rien' || instruction.valeur.type === 'Premier') this.resultat.facultatives.add(instruction);
        this.declarer(instruction.nom, instruction.ligne, type, instruction);
        return;
      }

      case 'Affectation': {
        if (contexte === 'vue') this.horsEvenement('changer … par', instruction.ligne);
        // Sans bloc « langues », « changer langue par … » le demande, une seule fois.
        if (languesActives.size === 0 && simplifier(instruction.nom) === 'langue' && !this.portees.chercher(instruction.nom)) {
          this.variable(instruction.nom, instruction.ligne);
          return;
        }
        // « changer langue par anglais » : la langue choisie par la personne.
        if (this.valeurDeLangue(instruction.nom) === 'langue' && !instruction.champs) {
          const choisie = instruction.valeur.type === 'Reference' ? languesActives.get(simplifier(instruction.valeur.nom)) : undefined;
          if (choisie === undefined) {
            const mots = [...languesActives.keys()];
            this.erreur(`« changer langue par » attend une langue du bloc « langues » : ${mots.join(' ou ')} (sans guillemets).`, instruction.ligne);
          } else {
            this.resultat.changementsLangue.set(instruction, choisie);
          }
          return;
        }
        const symbole = this.variable(instruction.nom, instruction.ligne);
        if (symbole?.origine?.type === 'Variable' && symbole.origine.fichierDonnees) {
          this.erreur(`« ${instruction.nom} » vient d'un fichier : on peut la lire, pas la changer. Pour la modifier, copiez-la : variable mes_${instruction.nom} = ${instruction.nom}.`, instruction.ligne);
          return;
        }
        const type = this.typeDe(instruction.valeur);
        if (symbole && this.page.parametres.includes(instruction.nom)) {
          this.erreur(`« changer » sur « ${instruction.nom} » : un paramètre vient du chemin de l'adresse, on ne le change pas. Changez de page avec rediriger vers "${this.page.nom}" avec ${instruction.nom} …`, instruction.ligne);
          return;
        }
        if (symbole && (this.page.filtres ?? []).some((f) => f.nom === instruction.nom)) {
          if (instruction.champs) this.erreur(`« ${instruction.nom} » est un filtre d'adresse : il n'a pas de champs.`, instruction.ligne);
          else if (!compatibles(symbole.type, type)) this.erreur(`le filtre « ${instruction.nom} » est ${decrireType(symbole.type)} ; on ne peut pas lui donner ${decrireType(type)}.`, instruction.ligne);
          return;
        }
        if (symbole && this.estCalcul(symbole, instruction.ligne)) return;
        // « changer client.ville par … » : le type du champ visé dans la fiche.
        let cible: TypeValeur | undefined = symbole?.type;
        if (symbole && instruction.champs) {
          let objet: Expression = { type: 'Reference', nom: instruction.nom, ligne: instruction.ligne };
          for (const champ of instruction.champs) objet = { type: 'AccesChamp', objet, champ, ligne: instruction.ligne };
          cible = this.typeDe(objet);
        }
        const nom = [instruction.nom, ...(instruction.champs ?? [])].join('.');
        if (cible && !compatibles(cible, type)) {
          this.erreur(`« ${nom} » est ${decrireType(cible)} ; on ne peut pas lui donner ${decrireType(type)}.`, instruction.ligne);
        }
        return;
      }

      case 'ModificationListe':
        this.modificationListe(instruction, contexte);
        return;

      case 'Rechargement':
        if (contexte === 'evenement') this.cadre.attente = true;
        if (contexte === 'vue') this.horsEvenement('recharger', instruction.ligne);
        this.usagesEtat.push({ nom: instruction.variable, ligne: instruction.ligne, mot: 'recharger' });
        return;

      case 'Suppression':
      case 'Modification': {
        const verbe = instruction.type === 'Suppression' ? 'supprimer' : 'modifier';
        if (contexte === 'evenement') this.cadre.attente = true;
        if (contexte === 'vue') this.horsEvenement(verbe, instruction.ligne);
        this.operationServeur(instruction);
        return;
      }

      case 'EnvoiFichier':
        if (contexte === 'vue') this.horsEvenement('envoyer fichier', instruction.ligne, " Un fichier se choisit par une action de la personne : placez-le dans un événement (quand … clique sur …).");
        this.envoiFichier(instruction);
        return;

      case 'Requete':
        if (contexte === 'evenement') this.cadre.attente = true;
        if (contexte === 'vue') {
          this.horsEvenement(
            'envoyer requete',
            instruction.ligne,
            " Pour charger des données à l'ouverture de la page, placez-la dans : quand la page se charge :",
          );
        }
        this.requete(instruction);
        return;

      case 'Element':
        this.element(instruction, contexte);
        return;

      case 'Graphique':
        this.graphique(instruction, contexte);
        return;

      case 'Formulaire':
        this.formulaire(instruction, contexte, place);
        return;

      case 'Bloc':
        this.blocMiseEnPage(instruction, contexte, place);
        return;

      case 'Action':
        this.action(instruction, contexte);
        if (instruction.message) {
          verifierMessage(this.hote(), instruction, contexte === 'vue', this.cadre.minuteries > 0);
          if (instruction.message.action && contexte === 'evenement') {
            this.cadre.actionsMessage++;
            this.sousBloc(instruction.message.action.corps, 'evenement', place);
            this.cadre.actionsMessage--;
          }
        }
        return;

      case 'Condition': {
        this.comparaison(instruction.test);
        const avant = this.garde;
        this.garde = plusForte(avant, gardeDe(instruction.test));
        this.sousBloc(instruction.alors, contexte, place);
        this.garde = avant;
        this.sousBloc(instruction.sinon, contexte, place);
        return;
      }

      case 'Connexion':
      case 'Deconnexion': {
        const nom = instruction.type === 'Connexion' ? 'se connecter' : 'se deconnecter';
        this.litLaSession = true;
        if (contexte === 'vue') this.horsEvenement(nom, instruction.ligne);
        this.demandeUnServeur(nom, instruction.ligne);
        if (instruction.type === 'Connexion') this.connexion(instruction);
        return;
      }

      case 'Boucle':
        this.boucle(instruction, contexte, place);
        return;

      case 'Composant':
        this.usageComposant(instruction, contexte);
        return;

      case 'Apercu':
        this.erreur('« apercu » décrit toute la page : écrivez-le directement sous « page "…" : », hors des blocs et des événements.', instruction.ligne);
        return;

      // Un appel resté tel quel : une fonction de calcul, ou une fonction inconnue (les fonctions d'actions sont déjà dépliées).
      case 'Execution':
        if (this.fonctions.has(instruction.nom)) {
          this.erreur(`« ${instruction.nom} » rend une valeur : emploie-la dans un calcul, par exemple « calcul x = ${instruction.nom}(…) ».`, instruction.ligne);
        } else this.typeDe({ type: 'Appel', nom: instruction.nom, arguments: instruction.arguments, ligne: instruction.ligne });
        return;

      case 'SousPage':
        if (contexte === 'evenement') this.erreur('« sous page » est un endroit de la page, pas une action : placez-le dans la page, hors des événements.', instruction.ligne);
        return;

      case 'Parametre':
        this.erreur('« parametre » ne s\'utilise qu\'au début d\'un composant (composant "…" :).', instruction.ligne);
        return;

      case 'Evenement':
        this.evenement(instruction, contexte, place);
        return;

      case 'Minuterie':
        this.minuterie(instruction, contexte, place);
        return;

      case 'Copier':
        verifierCopier(this.hote(), instruction, this.placeGeste(contexte));
        return;

      case 'Partager':
        verifierPartager(this.hote(), instruction, this.placeGeste(contexte));
        if (instruction.lien) {
          this.pageCible(instruction.lien.adresse, instruction.ligne);
          const page = lireCible(instruction.lien.adresse).page;
          if (page !== undefined && page !== '') this.argumentsPage(page, instruction.lien.parametres ?? [], 'partager … avec lien vers', instruction.ligne);
        }
        return;

      case 'Confirmer': {
        const geste = this.placeGeste(contexte);
        verifierConfirmer(this.hote(), instruction, { dansLaPage: contexte === 'vue', sansGeste: geste.sansGeste, dansUneAction: this.cadre.actionsMessage > 0, profondeur: this.cadre.questions });
        // La réponse se fait attendre : un « copier » après elle a perdu le geste de la personne.
        this.cadre.attente = true;
        this.cadre.questions++;
        this.sousBloc(instruction.alors, contexte, place);
        this.cadre.questions--;
        this.sousBloc(instruction.sinon, contexte, place);
        return;
      }

      case 'Fenetre':
        verifierFenetre(this.hote(), instruction, { dansUnEvenement: contexte === 'evenement', dansUneFenetre: this.cadre.fenetres > 0 });
        this.cadre.fenetres++;
        this.sousBloc(instruction.corps, 'vue', place);
        this.cadre.fenetres--;
        return;
    }
  }

  // ─── Les interactions ───────────────────────────────────────────────────

  /** Ce que l'analyse prête au fichier des interactions (ses messages sont comptés dans ce fichier-là). */
  private hote(): Hote {
    return {
      erreur: (message, ligne) => this.resultat.diagnostics.push({ gravite: 'erreur', message, ligne }),
      avertissement: (message, ligne) => this.resultat.diagnostics.push({ gravite: 'avertissement', message, ligne }),
      typeDe: (expression) => this.typeDe(expression),
    };
  }

  /** Où se trouve un « copier », un « partager » ou un « confirmer » : il leur faut le geste de la personne. */
  private placeGeste(contexte: Contexte): PlaceGeste {
    return {
      dansLaPage: contexte === 'vue',
      sansGeste: this.cadre.minuteries > 0 ? 'minuterie' : this.cadre.evenement === 'chargement' ? 'chargement' : undefined,
      apresUneAttente: this.cadre.attente,
    };
  }

  /** Les fenêtres et les blocs nommés de la page, recensés avant l'analyse. */
  private recenserInteractions(instructions: Instruction[]): void {
    for (const i of instructions) {
      if (i.type === 'Fenetre') {
        const nom = i.nom ?? i.titre;
        const deja = this.fenetres.find((f) => f.nom === nom);
        if (deja) {
          fenetreEnDouble(this.hote(), nom, deja.noeud.ligne, i.ligne);
        } else {
          this.fenetres.push({ noeud: i, id: `fenetre_${simplifier(nom) || i.ligne}`, nom, ouverte: false, fermee: false });
        }
        this.recenserInteractions(i.corps);
      } else if (i.type === 'Bloc') {
        if (i.nom !== undefined) {
          const deja = this.blocsNommes.get(i.nom);
          if (deja) blocEnDouble(this.hote(), i.nom, deja.ligne, i.ligne);
          else this.blocsNommes.set(i.nom, { id: `bloc_${simplifier(i.nom) || i.ligne}`, ligne: i.ligne });
        }
        this.recenserInteractions(i.corps);
      } else if (i.type === 'Condition') {
        this.recenserInteractions(i.alors);
        this.recenserInteractions(i.sinon);
      } else if (i.type === 'Boucle' || i.type === 'Formulaire') {
        this.recenserInteractions(i.corps);
      }
    }
  }

  /** « montrer "Détails" » ouvre une fenêtre, « cacher "Détails" » la ferme : son identifiant, si c'en est une. */
  private fenetreVisee(action: Action, texte: string): string | undefined {
    const fenetre = this.fenetres.find((f) => f.nom === texte);
    if (!fenetre) return undefined;
    if (action.action === 'montrer') fenetre.ouverte = true;
    if (action.action === 'cacher') fenetre.fermee = true;
    return fenetre.id;
  }

  /** « apres 3 secondes : », « toutes les 5 secondes tant que … : », dans la page ou dans un événement. */
  private minuterie(minuterie: Minuterie, contexte: Contexte, place: Place): void {
    const dePage = contexte === 'vue';
    verifierMinuterie(this.hote(), minuterie, { page: dePage, auPremierNiveau: this.page.corps.includes(minuterie), survol: this.cadre.evenement === 'survol' });
    if (minuterie.tantQue) this.comparaison(minuterie.tantQue);
    // « arreter » arrête la minuterie, comme une boucle.
    this.cadre.minuteries++;
    this.boucles++;
    this.sousBloc(minuterie.corps, 'evenement', place);
    this.boucles--;
    this.cadre.minuteries--;
  }

  /** Les événements des interactions : touches, frappe, bas d'un bloc, ordre d'une liste. */
  private evenementInteraction(evenement: Evenement, place: Place): void {
    const parmi = place.genre === 'boucle' ? place.elements : undefined;
    switch (evenement.genre) {
      case 'touche': {
        if (evenement.cible !== undefined) this.cible(evenement, evenement.cible, parmi);
        const touches = verifierTouches(this.hote(), evenement.touches ?? '', evenement.ligne, { dansUnChamp: evenement.cible !== undefined });
        if (touches !== undefined) this.raccourci(touches, evenement.cible, evenement.ligne);
        return;
      }
      case 'saisie':
      case 'pauseSaisie': {
        const nom = evenement.cible ?? '';
        const resolution = this.elements.resoudre(nom, 'champ', parmi);
        if (!('ids' in resolution)) {
          const champs = this.elements.elements.filter((e) => e.noeud.element === 'champ').map((e) => e.nom ?? e.libelle).filter((n): n is string => !!n);
          champIntrouvable(this.hote(), nom, this.page.nom, champs, evenement.ligne);
          return;
        }
        this.resultat.cibles.set(evenement, resolution.ids);
        const sorte = this.elements.parId(resolution.ids[0])?.noeud.sorte;
        verifierSaisie(this.hote(), evenement, sorte, place.genre === 'boucle');
        return;
      }
      case 'bas': {
        const nom = evenement.cible ?? '';
        const bloc = this.blocsNommes.get(nom);
        if (!bloc || bloc.bas !== undefined) {
          blocDuBas(this.hote(), nom, bloc?.bas, evenement.ligne);
        } else {
          bloc.bas = evenement.ligne;
          this.resultat.cibles.set(evenement, [bloc.id]);
        }
        if (evenement.tantQue) this.comparaison(evenement.tantQue);
        avertirBas(this.hote(), evenement, evenement.tantQue ? nomsLus(evenement.tantQue) : []);
        return;
      }
      case 'ordre':
        this.variable(evenement.variable ?? '', evenement.ligne);
        this.evenementsOrdre.push(evenement);
        return;
    }
  }

  /** « pour chaque t dans taches avec deplacement » : une variable de liste de la page, une seule boucle par liste. */
  private deplacement(boucle: Boucle, contexte: Contexte): void {
    const liste = boucle.liste;
    const symbole = liste.type === 'Reference' ? this.portees.chercher(liste.nom) : undefined;
    const origine = symbole?.origine;
    const variable = liste.type === 'Reference' && origine?.type === 'Variable' && !origine.calcul ? liste.nom : undefined;
    const deja = variable !== undefined ? this.listesDeplacees.get(variable) : undefined;
    if (verifierDeplacement(this.hote(), boucle, { dansUnEvenement: contexte === 'evenement', variable, deja }) && variable !== undefined) {
      this.listesDeplacees.set(variable, boucle.ligne);
    }
  }

  /** Un raccourci de la page : deux effets pour les mêmes touches, c'est une erreur. */
  private raccourci(touches: string, champ: string | undefined, ligne: number): void {
    const cle = champ !== undefined ? `${touches}@${champ}` : touches;
    const deja = this.raccourcis.get(cle);
    if (deja !== undefined) {
      raccourciEnDouble(this.hote(), touches, deja, ligne);
    } else {
      this.raccourcis.set(cle, ligne);
    }
  }

  /** Ce qui ne se vérifie qu'une fois la page lue : fenêtres ouvertes et fermées, listes déplacées. */
  private finInteractions(): void {
    for (const f of this.fenetres) avertirFenetre(this.hote(), f.noeud, f.ouverte, f.fermee);
    for (const evenement of this.evenementsOrdre) verifierOrdre(this.hote(), evenement, this.listesDeplacees.has(evenement.variable ?? ''));
    for (const f of this.fenetres) this.resultat.fenetres.set(f.noeud, f.id);
    for (const [nom, bloc] of this.blocsNommes) this.resultat.blocsNommes.set(nom, bloc.id);
  }

  private element(element: Element, contexte: Contexte): void {
    if (contexte === 'evenement') {
      this.erreur(
        'un élément ne peut pas être créé dans un événement. Placez-le dans la page, puis utilisez montrer "…" pour le faire apparaître.',
        element.ligne,
      );
    }
    this.elementEnCours = element.element;
    this.typeDe(element.contenu);
    this.elementEnCours = undefined;
    if (element.cible !== undefined) {
      this.pageCible(element.cible, element.ligne);
      const lue = lireCible(element.cible);
      if (lue.page !== undefined) this.argumentsPage(lue.page, element.arguments ?? [], `${element.element} … vers`, element.ligne);
      else if (element.arguments?.length) {
        this.erreur(lue.externe ? `une adresse externe (${element.cible}) n'a pas de paramètres de page : retirez « avec ${element.arguments[0].nom} … ».` : `« avec ${element.arguments[0].nom} … » demande une page : écrivez vers "page" avec …`, element.ligne);
      }
    }
    if (element.nouvelOnglet && element.element !== 'lien') {
      this.erreur(`« avec nouvel onglet » s'applique à un lien, pas à un ${element.element}.`, element.ligne);
    }
    for (const style of element.styles) {
      // « description "…" en anglais "…" » : la version lit les variables de la page.
      if (style.texte && !style.texte.parties.some((p) => p.type === 'variable')) this.versionsLues(style.texte);
      if (style.propriete === 'decoratif') continue;
      // Un son qui démarre seul est refusé par verifierAudio, avec son explication.
      if (element.element === 'audio' && style.propriete === 'automatique') continue;
      const option = optionCanonique(style.propriete, style.valeur, this.resultat.couleursTheme);
      if ('erreur' in option) this.erreur(option.erreur, element.ligne);
      else {
        const refus = erreurSurElement(style.propriete, element.element);
        if (refus) this.erreur(refus, element.ligne);
        this.contrasteDuTheme(option.propriete, option.valeur, element.ligne);
      }
    }
    for (const classe of element.classes) {
      if (this.classesDefinies && !this.classesDefinies.has(classe)) {
        this.avertissement(`la classe CSS « ${classe} » n'est définie dans aucun bloc style.`, element.ligne);
      }
    }
    verifierElementEcran(element, this.signaler());
    if (verifierMouvement(element.styles, element.element, this.formulaireOuvert !== undefined, element.ligne, this.signaler())) this.defilements.push(element.ligne);
    if (element.element === 'image' && verifierImage(element, this.signaler())) this.prioritaires.push(element.ligne);
    if (element.element === 'fichier') this.choixFichier(element);
    if (element.element === 'audio') verifierAudio(element, this.signaler());
    if (element.element === 'marqueur') verifierMarqueur(element, this.pileBlocs.some((b) => b.genre === 'carte'), this.signaler());
    this.optionsDeChamp(element);
    // « avec raccourci "controle+k" » : la touche clique le bouton ou le lien, ou met le focus dans le champ.
    if (element.raccourci !== undefined) {
      const touches = verifierRaccourciElement(this.hote(), element);
      if (touches !== undefined) this.raccourci(touches, undefined, element.ligne);
    }
  }

  /** « fichier "Choisir" dans photo accepte images » : la variable reçoit un fichier choisi (une fiche de quatre champs). */
  private choixFichier(element: Element): void {
    verifierChoixFichier(element, this.signaler());
    const choix = element.fichier!;
    const symbole = this.variable(choix.variable, element.ligne);
    if (!symbole) return;
    const origine = symbole.origine?.type === 'Variable' ? symbole.origine : undefined;
    if (origine?.options?.memorisee || origine?.options?.partagee) {
      this.erreur('un fichier choisi ne se garde pas (ni mémorisé dans le navigateur, ni partagé entre les pages) : déclarez variable ' + choix.variable + ' = rien dans la page.', element.ligne);
    }
    const type = typeFichierChoisi(choix.plusieurs);
    if (!estConnu(symbole.type) || (symbole.type.genre === 'liste' && !estConnu(symbole.type.de))) {
      symbole.type = type;
      if (symbole.origine) this.resultat.types.set(symbole.origine, type);
    } else if (!compatibles(symbole.type, type)) {
      this.erreur(`« ${choix.variable} » est ${decrireType(symbole.type)} ; elle reçoit un fichier choisi. Déclarez variable ${choix.variable} = rien.`, element.ligne);
    }
  }

  /** « envoyer fichier photo vers "…" de la source "…" » : voir `analyse/fichiers.ts`. */
  private envoiFichier(envoi: EnvoiFichier): void {
    const typeDe = (nom: string, ligne: number) => this.variable(nom, ligne)?.type;
    verifierEnvoiFichier(envoi, { fichiers: this.fichiers, sources: this.liens.sources, typeDe }, this.signaler());
    // La réponse peut être suivie comme celle d'une requête : « adresse est en chargement », « erreur de adresse ».
    if (envoi.resultat !== undefined) this.ciblesSources.add(envoi.resultat);
  }

  /** Les valeurs d'un champ (« parmi ») et ses options (décisions F4 à F6 du plan des formulaires). */
  private optionsDeChamp(element: Element): void {
    // Les bornes servent aussi à la progression, aux étoiles et au compteur (vérifiés avec eux).
    const avecBornes = ['progression', 'etoiles', 'compteur'].includes(element.element);
    const options = (['obligatoire', 'indice', 'minimum', 'maximum'] as const).filter(
      (o) => element[o] !== undefined && !(avecBornes && (o === 'minimum' || o === 'maximum')),
    );
    if (element.element !== 'champ') {
      if (options.length > 0) {
        this.erreur(
          `l’option « ${options[0]} » s’applique à un champ (champ, case à cocher, choix, liste déroulante), pas à un ${element.element}.`,
          element.ligne,
        );
      }
      return;
    }

    if (element.parmi) {
      const type = this.typeDe(element.parmi);
      const textes = type.genre === 'liste' && (type.de.genre === 'texte' || !estConnu(type.de));
      if (estConnu(type) && !textes) {
        this.erreur(
          `après « parmi », il faut une liste de textes, par exemple ["S", "M", "L"] ; ici, c’est ${type.genre === 'liste' ? decrireListe(type) : decrireType(type)}.`,
          element.ligne,
        );
      }
    }

    for (const borne of ['minimum', 'maximum'] as const) {
      if (element[borne] !== undefined && element.sorte !== 'nombre' && !avecBornes) {
        this.erreur(`l’option « ${borne} » s’applique à un champ nombre : écrivez champ nombre "…" avec ${borne} ….`, element.ligne);
      }
    }
    if (element.minimum !== undefined && element.maximum !== undefined && element.minimum > element.maximum) {
      this.erreur(`le minimum (${element.minimum}) est plus grand que le maximum (${element.maximum}).`, element.ligne);
    }
    if (element.indice !== undefined && (element.sorte === 'case' || element.sorte === 'choix')) {
      this.erreur('l’option « indice » ne s’applique pas à une case à cocher ni à un choix : il n’y a rien à écrire dedans.', element.ligne);
    }
    const verifie = element.obligatoire || element.minimum !== undefined || element.maximum !== undefined;
    if (verifie && !this.formulaireOuvert) {
      this.avertissement(
        '« obligatoire », « minimum » et « maximum » sont vérifiés à l’envoi d’un formulaire : placez ce champ dans un bloc formulaire "…" :',
        element.ligne,
      );
    }
  }

  /** « formulaire "message" : » : un bloc de la vue, qui regroupe des champs et un bouton (décision F1). */
  private formulaire(formulaire: Formulaire, contexte: Contexte, place: Place): void {
    if (contexte === 'evenement') {
      this.erreur(
        'un formulaire ne peut pas être créé dans un événement. Placez-le dans la page, puis utilisez montrer "…" pour le faire apparaître.',
        formulaire.ligne,
      );
    } else if (this.formulaireOuvert) {
      this.erreur(
        `un formulaire ne peut pas contenir un autre formulaire : placez « ${formulaire.nom} » à côté de « ${this.formulaireOuvert.nom} ».`,
        formulaire.ligne,
      );
    } else {
      const deja = this.formulairesVus.get(formulaire.nom);
      if (deja !== undefined) {
        this.erreur(`le formulaire « ${formulaire.nom} » existe déjà dans cette page (ligne ${deja}).`, formulaire.ligne);
      } else {
        this.formulairesVus.set(formulaire.nom, formulaire.ligne);
      }
    }

    // Le bloc se lit comme celui d'une condition de la vue.
    const avant = this.formulaireOuvert;
    this.formulaireOuvert ??= formulaire;
    this.sousBloc(formulaire.corps, 'vue', place);
    this.formulaireOuvert = avant;
  }

  /** Les blocs ouverts autour de celui qu'on analyse (un onglet doit être dans des onglets). */
  private readonly pileBlocs: Bloc[] = [];

  private signaler(): Signaler {
    return {
      erreur: (message, ligne) => this.resultat.diagnostics.push({ gravite: 'erreur', message, ligne }),
      avertissement: (message, ligne) => this.resultat.diagnostics.push({ gravite: 'avertissement', message, ligne }),
      typeDe: (expression) => this.typeDe(expression),
    };
  }

  /** Un graphique (plan des médias, 4.1) : les vérifications sont dans medias.ts. */
  private graphique(graphique: Graphique, contexte: Contexte): void {
    if (graphique.description?.type === 'Chaine' && !graphique.description.parties.some((p) => p.type === 'variable')) this.versionsLues(graphique.description);
    verifierGraphique(graphique, {
      ...this.signaler(),
      dansEvenement: contexte === 'evenement',
      champsDe: (type) => this.champsDesElements(type),
      // La liste écrite dans le programme : la liste elle-même, ou la valeur de départ de sa variable.
      listeEcrite: (expression) => {
        if (expression.type === 'Liste') return expression;
        const origine = expression.type === 'Reference' ? this.portees.chercher(expression.nom)?.origine : undefined;
        return origine?.type === 'Variable' && origine.valeur.type === 'Liste' ? origine.valeur : undefined;
      },
      couleur: (nom) => {
        const option = optionCanonique('couleur', nom, this.resultat.couleursTheme);
        if ('erreur' in option) return option;
        const valeur = this.resultat.valeursTheme.get(option.valeur) ?? COULEURS_CSS[option.valeur];
        return { nom: option.valeur, clair: valeur.clair, sombre: valeur.sombre };
      },
    });
  }

  /** Un texte dans une couleur du thème qui se verrait mal sur le fond de la page (contraste inférieur à 3:1). */
  private contrasteDuTheme(propriete: string, valeur: string, ligne: number): void {
    if (propriete !== 'couleur' && propriete !== 'texte') return;
    const couleur = this.resultat.valeursTheme.get(valeur);
    if (!couleur) return;
    for (const mode of ['clair', 'sombre'] as const) {
      const rapport = contraste(couleur[mode], FOND_PAGE[mode]);
      if (rapport < 3) {
        this.avertissement(
          `la couleur « ${valeur} » (mode ${mode}) se voit mal sur le fond de la page (contraste ${rapport.toFixed(1).replace('.', ',')} pour 1, il en faut au moins 3). Choisissez une couleur plus ${mode === 'clair' ? 'foncée' : 'claire'} pour ce mode.`,
          ligne,
        );
        return;
      }
    }
  }

  /** « section », « bloc », « ligne », « colonne », « grille » : un groupe de la vue, mis en forme par le CSS. */
  private blocMiseEnPage(bloc: Bloc, contexte: Contexte, place: Place): void {
    if (contexte === 'evenement') {
      this.erreur(
        'un bloc ne peut pas être créé dans un événement. Placez-le dans la page, puis utilisez montrer "…" pour faire apparaître ce qu’il contient.',
        bloc.ligne,
      );
    }
    for (const style of bloc.styles) {
      const option = optionCanonique(style.propriete, style.valeur, this.resultat.couleursTheme);
      if ('erreur' in option) this.erreur(option.erreur, bloc.ligne);
      else {
        const refus = erreurSurElement(style.propriete, bloc.genre);
        if (refus) this.erreur(refus, bloc.ligne);
        this.contrasteDuTheme(option.propriete, option.valeur, bloc.ligne);
      }
    }
    for (const classe of bloc.classes) {
      if (this.classesDefinies && !this.classesDefinies.has(classe)) {
        this.avertissement(`la classe CSS « ${classe} » n'est définie dans aucun bloc style.`, bloc.ligne);
      }
    }
    verifierBlocEcran(bloc, this.pileBlocs[this.pileBlocs.length - 1], this.signaler());
    if (bloc.genre === 'carte') verifierCarte(bloc, this.signaler());
    if (verifierMouvement(bloc.styles, bloc.genre, this.formulaireOuvert !== undefined, bloc.ligne, this.signaler())) this.defilements.push(bloc.ligne);
    // Dans un événement, le bloc est déjà refusé : son contenu se vérifie
    // comme celui de la page, sans une erreur de plus par élément.
    this.pileBlocs.push(bloc);
    this.sousBloc(bloc.corps, 'vue', place);
    this.pileBlocs.pop();
  }

  private action(action: Action, contexte: Contexte): void {
    const nom = NOMS_ACTIONS[action.action];
    if (contexte === 'vue' && action.action !== 'afficher') {
      this.horsEvenement(nom, action.ligne);
    }

    switch (action.action) {
      case 'afficher':
      case 'afficherErreur':
        this.typeDe(action.arguments[0]);
        return;

      case 'changerTheme': {
        const valeur = texteLitteral(action.arguments[0]);
        if (valeur === undefined || !['clair', 'sombre', 'automatique'].includes(valeur)) {
          this.erreur(`« changer theme par … » prend clair, sombre ou automatique (ici : « ${valeur ?? '?'} »).`, action.ligne);
        }
        return;
      }

      case 'rediriger': {
        const texte = texteLitteral(action.arguments[0]);
        if (texte !== undefined) this.pageCible(texte, action.ligne);
        else this.typeDe(action.arguments[0]);
        const page = texte !== undefined ? lireCible(texte).page : undefined;
        if (texte !== undefined && page !== undefined) this.argumentsPage(page, action.parametres ?? [], 'rediriger vers', action.ligne);
        else if (texte !== undefined && action.parametres?.length) this.erreur('« rediriger vers … avec … » demande une page : rediriger vers "produit" avec id …', action.ligne);
        else if (action.parametres?.length) {
          // La page n'est connue qu'à l'exécution : ses paramètres ne peuvent pas être vérifiés ni placés.
          for (const a of action.parametres) this.typeDe(a.valeur);
          this.erreur(
            '« rediriger vers … avec … » demande le nom de la page entre guillemets : rediriger vers "produit" avec id …',
            action.ligne,
          );
        }
        return;
      }

      case 'revenir': {
        if (action.arguments.length > 0) {
          const texte = texteLitteral(action.arguments[0]);
          if (texte === undefined) {
            this.typeDe(action.arguments[0]);
            this.erreur('« revenir vers » demande le nom de la page entre guillemets : revenir vers "catalogue"', action.ligne);
          } else if (!this.nomsPages.has(texte)) {
            this.erreur(`« revenir vers ${texte} » : la page n'existe pas. Pages : ${[...this.nomsPages].join(', ')}.${proposerNom(texte, this.nomsPages)}`, action.ligne);
          }
        }
        return;
      }

      case 'montrer':
      case 'cacher':
      case 'changerTexte': {
        const texte = texteLitteral(action.arguments[0]);
        if (texte === undefined) {
          const exemple =
            action.action === 'changerTexte'
              ? 'changer texte de "description" par …'
              : `${nom} "menu"`;
          this.erreur(
            `écrivez le nom de l'élément entre guillemets, par exemple : ${exemple}`,
            action.ligne,
          );
        } else {
          this.cible(action, texte);
        }
        if (action.action === 'changerTexte') this.typeDe(action.arguments[1]);
        return;
      }
    }
  }

  private usageComposant(usage: UsageComposant, contexte: Contexte): void {
    if (contexte === 'evenement') {
      this.erreur(
        'un composant ne peut pas être créé dans un événement. Placez-le dans la page, puis utilisez montrer "…" pour le faire apparaître.',
        usage.ligne,
      );
    }
    const types = usage.proprietes.map((p) => this.typeDe(p.valeur));

    const parametres = this.composants.humalis.get(usage.nom);
    if (parametres) {
      usage.proprietes.forEach((p, i) => {
        if (!parametres.includes(p.nom)) {
          this.erreur(
            `« ${p.nom} » n'est pas un paramètre du composant « ${usage.nom} ». Paramètres : ${parametres.join(', ')}.`,
            usage.ligne,
          );
          return;
        }
        const cle = `${usage.nom}.${p.nom}`;
        this.resultat.typesParametres.set(cle, [...(this.resultat.typesParametres.get(cle) ?? []), types[i]]);
      });
      for (const parametre of parametres) {
        if (!usage.proprietes.some((p) => p.nom === parametre)) {
          this.avertissement(
            `le paramètre « ${parametre} » du composant « ${usage.nom} » n'est pas donné.`,
            usage.ligne,
          );
        }
      }
    } else if (!this.composants.react.has(usage.nom)) {
      this.erreur(
        `le composant « ${usage.nom} » n'est pas déclaré. Ajoutez en haut du fichier : utiliser composant "${usage.nom}" depuis "…", ou écrivez-le avec composant "${usage.nom}" :`,
        usage.ligne,
      );
    }
  }

  private boucle(boucle: Boucle, contexte: Contexte, parent: Place): void {
    const typeListe = this.typeDe(boucle.liste);
    if (estConnu(typeListe) && typeListe.genre !== 'liste') {
      this.erreur(
        `${decrire(boucle.liste)} est ${decrireType(typeListe)} ; pour chaque … dans attend une liste.`,
        boucle.ligne,
      );
    }

    const typeVariable = typeListe.genre === 'liste' ? typeListe.de : INCONNU;
    this.resultat.types.set(boucle, typeVariable);
    if (boucle.deplacement) this.deplacement(boucle, contexte);

    this.portees.ouvrir();
    this.declarer(boucle.variable, boucle.ligne, typeVariable, boucle);
    const place: Place =
      contexte === 'vue'
        ? { genre: 'boucle', elements: this.elements.elementsDe(boucle.corps), formulaires: this.elements.formulairesDe(boucle.corps) }
        : parent;
    if (contexte === 'evenement') this.boucles++;
    this.bloc(boucle.corps, contexte, place);
    if (contexte === 'evenement') this.boucles--;
    this.portees.fermer();

    this.boucleFermee.set(boucle.variable, boucle.ligne);
  }

  private evenement(evenement: Evenement, contexte: Contexte, place: Place): void {
    if (contexte === 'evenement') {
      this.erreur(
        'un événement ne se place pas dans un autre événement : écrivez-le dans la page, sous son élément.',
        evenement.ligne,
      );
    }

    if (evenement.genre === 'soumission') {
      this.soumission(evenement, place);
    } else if (['touche', 'saisie', 'pauseSaisie', 'bas', 'ordre'].includes(evenement.genre)) {
      this.evenementInteraction(evenement, place);
    } else if (evenement.cible !== undefined) {
      if (place.genre === 'boucle' && !place.elements.some((e) => vise(e, evenement.cible!))) {
        this.erreur(
          `« ${evenement.cible} » n’est pas dans cette boucle : un événement placé dans une boucle vise un élément de la même boucle.`,
          evenement.ligne,
        );
      } else {
        this.cible(evenement, evenement.cible, place.genre === 'boucle' ? place.elements : undefined);
      }
    }

    // Un événement dont l'élément n'est affiché qu'à une personne connectée
    // est gardé comme son élément.
    const ids = this.resultat.cibles.get(evenement) ?? [];
    const gardes = ids.map((id) => this.elementsGardes.get(id));
    const avant = this.garde;
    if (ids.length > 0 && gardes.every((g) => g !== undefined)) {
      this.garde = plusForte(avant, gardes.includes('connecte') ? 'connecte' : 'admin');
    }
    evenement.corps.forEach((action, index) => {
      if (action.type === 'Supposant' && !(['Requete', 'Suppression', 'Modification'] as const).some((type) => evenement.corps[index + 1]?.type === type)) {
        this.erreur('« en supposant que ça marche » demande une requête juste après : sinon il n’y a rien à défaire.', action.ligne);
      }
    });
    const cadre = { ...this.cadre };
    this.cadre.evenement = evenement.genre;
    this.cadre.attente = false;
    this.sousBloc(evenement.corps, 'evenement', place);
    Object.assign(this.cadre, cadre);
    this.garde = avant;
  }

  /** « quand le formulaire "message" est soumis » : le formulaire existe, et n'a qu'un événement. */
  private soumission(evenement: Evenement, place: Place): void {
    const nom = evenement.cible ?? '';
    const tous = this.elements.formulaires;
    const formulaire = (place.genre === 'boucle' ? place.formulaires : tous).find((f) => f.nom === nom);
    if (!formulaire) {
      this.soumissionPerdue = true;
      if (place.genre === 'boucle' && tous.some((f) => f.nom === nom)) {
        this.erreur(
          `« ${nom} » n’est pas dans cette boucle : un événement placé dans une boucle vise un formulaire de la même boucle.`,
          evenement.ligne,
        );
      } else if (tous.length === 0) {
        this.erreur(
          `le formulaire « ${nom} » n’existe pas dans cette page : créez-le avec formulaire "${nom}" : suivi de ses champs et d’un bouton.`,
          evenement.ligne,
        );
      } else {
        this.erreur(
          `le formulaire « ${nom} » n’existe pas dans cette page. Formulaires de la page : ${[...new Set(tous.map((f) => f.nom))].join(', ')}.`,
          evenement.ligne,
        );
      }
      return;
    }
    const deja = this.soumissions.get(formulaire.id);
    if (deja !== undefined) {
      this.erreur(
        `le formulaire « ${nom} » a déjà son événement « est soumis » (ligne ${deja}) : réunissez les deux dans le même événement.`,
        evenement.ligne,
      );
      return;
    }
    this.soumissions.set(formulaire.id, evenement.ligne);
    this.resultat.cibles.set(evenement, [formulaire.id]);
  }

  /**
   * « se connecter avec champ "email" et champ "mot de passe" » : deux
   * champs de la page, différents. Le mot de passe ne vit que dans son champ.
   */
  private connexion(connexion: Connexion): void {
    const champs = [connexion.email, connexion.motDePasse];
    for (const champ of champs) this.typeDe(champ);
    // Deux champs où l'on écrit : pas une case à cocher, un choix ni une liste déroulante.
    const sortes = champs.map((c) => (c.type === 'Champ' ? this.sorteDuChamp(c) : undefined));
    if (champs.some((c) => c.type !== 'Champ') || sortes.some((s) => s === 'case' || s === 'choix' || s === 'liste')) {
      this.erreur(
        '« se connecter » attend deux champs de la page : se connecter avec champ "email" et champ "mot de passe"',
        connexion.ligne,
      );
      return;
    }
    const [email, motDePasse] = champs.map((c) => this.resultat.champs.get(c));
    if (email !== undefined && email === motDePasse) {
      this.erreur('« se connecter » attend deux champs différents : l’email, puis le mot de passe.', connexion.ligne);
    }
  }

  /** La connexion passe par le serveur du même fichier (packs Astratra) : il en faut un. */
  private demandeUnServeur(nom: string, ligne: number): void {
    if (this.liens.serveur !== undefined || [...this.liens.sources.values()].some((i) => i.source.session)) return;
    this.erreur(
      `« ${nom} » demande un serveur dans le même fichier : la connexion passe par ses packs Astratra. Ajoutez un bloc serveur "…" :`,
      ligne,
    );
  }

  private comparaison(test: Test): void {
    // « … et … », « … ou … » : chaque morceau est vérifié.
    if (test.type === 'Combinaison') {
      this.comparaison(test.gauche);
      this.comparaison(test.droite);
      return;
    }
    const gauche = this.typeDe(test.gauche);
    const droite = test.droite ? this.typeDe(test.droite) : INCONNU;

    switch (test.operateur) {
      case 'dans':
        if (estConnu(droite) && droite.genre !== 'liste') {
          this.erreur(`« est dans » cherche dans une liste ; cette valeur est ${decrireType(droite)}.`, test.ligne);
        } else if (droite.genre === 'liste' && estConnu(droite.de) && !compatibles(gauche, droite.de)) {
          this.erreur(`on ne peut pas chercher ${decrireType(gauche)} dans ${decrireListe(droite)}.`, test.ligne);
        }
        return;

      case 'egal':
      case 'different':
        if (!compatibles(gauche, droite)) {
          this.erreur(
            `on ne peut pas comparer ${decrireType(gauche)} et ${decrireType(droite)}.`,
            test.ligne,
          );
        }
        return;

      case 'vide':
        if (estConnu(gauche) && gauche.genre !== 'texte' && gauche.genre !== 'liste') {
          this.erreur(
            `${decrire(test.gauche)} est ${decrireType(gauche)} ; « est vide » s'applique à un texte ou à une liste.`,
            test.ligne,
          );
        }
        return;

      // « produit est rien » : toute variable peut ne pas encore avoir de valeur.
      case 'rien':
        return;

      case 'commencePar':
      case 'finitPar':
        if (estConnu(gauche) && gauche.genre !== 'texte') {
          this.erreur(`${decrire(test.gauche)} est ${decrireType(gauche)} ; « ${test.operateur === 'commencePar' ? 'commence par' : 'finit par'} » s'applique à un texte.`, test.ligne);
        }
        return;

      // « panier contient "Livre" », « nom contient "Liv" » : une liste ou un texte.
      case 'contient':
        if (estConnu(gauche) && gauche.genre !== 'texte' && gauche.genre !== 'liste') {
          this.erreur(`${decrire(test.gauche)} est ${decrireType(gauche)} ; « contient » s'applique à un texte ou à une liste.`, test.ligne);
        }
        return;

      case 'vrai':
      case 'faux':
        if (estConnu(gauche) && gauche.genre !== 'booleen') {
          this.erreur(
            `${decrire(test.gauche)} est ${decrireType(gauche)} ; « est ${test.operateur} » attend vrai ou faux.`,
            test.ligne,
          );
        }
        return;

      default:
        for (const [expression, type] of [
          [test.gauche, gauche],
          [test.droite, droite],
        ] as const) {
          if (expression && estConnu(type) && type.genre !== 'nombre') {
            this.erreur(
              `${decrire(expression)} est ${decrireType(type)} ; « ${NOMS_OPERATEURS[test.operateur]} » compare des nombres.`,
              test.ligne,
            );
          }
        }
    }
  }

  /** Les versions d'autres langues d'un texte lisent les mêmes variables que lui. */
  private versionsLues(texte: LitteralChaine): void {
    for (const version of texte.versions ?? []) this.interpolations({ type: 'Chaine', parties: version.parties, ligne: version.ligne });
    for (const parties of this.resultat.langues.traductions.get(texteSource(texte.parties))?.values() ?? []) {
      this.interpolations({ type: 'Chaine', parties, ligne: texte.ligne });
    }
  }

  private typeDe(expression: Expression): TypeValeur {
    switch (expression.type) {
      case 'Chaine':
        this.interpolations(expression);
        this.versionsLues(expression);
        return TEXTE;
      case 'Nombre':
        return NOMBRE;
      case 'Booleen':
        return BOOLEEN;
      case 'Liste': {
        const types = expression.elements.map((e) => this.typeDe(e));
        return listeDe(types[0] ?? INCONNU);
      }
      case 'Reference': {
        const langue = this.valeurDeLangue(expression.nom);
        if (langue !== undefined) {
          this.resultat.referencesLangue.set(expression, langue);
          return TEXTE;
        }
        return this.variable(expression.nom, expression.ligne)?.type ?? INCONNU;
      }
      case 'Calcul':
        return this.calcul(expression);
      case 'AccesChamp':
        return this.accesChamp(expression);
      case 'Rien':
        // « rien » : pas encore de valeur. Le type viendra de ce que la variable reçoit (une requête).
        return INCONNU;
      case 'Appel':
        return this.appel(expression);
      case 'Agregat': {
        const type = this.typeDe(expression.liste);
        const mot = `« ${expression.operation} de »`;
        if (estConnu(type) && (type.genre !== 'liste' || (estConnu(type.de) && type.de.genre !== 'nombre'))) {
          this.erreur(
            `${mot} calcule sur une liste de nombres ; ${decrire(expression.liste)} est ${type.genre === 'liste' ? decrireListe(type) : decrireType(type)}.`,
            expression.ligne,
          );
        }
        return NOMBRE;
      }
      case 'Filtre':
      case 'Tri':
      case 'Premier':
      case 'Premiers':
      case 'Groupement':
        return this.operationDeListe(expression);
      case 'OperationTexte':
      case 'Remplacement': {
        const valeurs = expression.type === 'OperationTexte' ? [expression.valeur] : [expression.cherche, expression.remplace, expression.dans];
        const mot = expression.type === 'OperationTexte' ? `« ${expression.operation} de »` : '« remplacer »';
        for (const valeur of valeurs) {
          const type = this.typeDe(valeur);
          if (estConnu(type) && type.genre !== 'texte') this.erreur(`${mot} attend un texte ; ${decrire(valeur)} est ${decrireType(type)}.`, expression.ligne);
        }
        return expression.type === 'OperationTexte' && expression.operation === 'longueur' ? NOMBRE : TEXTE;
      }
      case 'DateDuJour':
        return TEXTE;
      case 'DateDecalee':
      case 'JoursEntre': {
        const dates = expression.type === 'DateDecalee' ? [expression.date] : [expression.debut, expression.fin];
        for (const date of dates) {
          const type = this.typeDe(date);
          if (estConnu(type) && type.genre !== 'texte') this.erreur(`une date s'écrit comme « aujourd'hui » ou « 2026-11-07 » ; ${decrire(date)} est ${decrireType(type)}.`, expression.ligne);
        }
        if (expression.type === 'DateDecalee') {
          const nombre = this.typeDe(expression.nombre);
          if (estConnu(nombre) && nombre.genre !== 'nombre') this.erreur(`« ${expression.signe > 0 ? 'plus' : 'moins'} … ${expression.unite} » attend un nombre ; ${decrire(expression.nombre)} est ${decrireType(nombre)}.`, expression.ligne);
          return TEXTE;
        }
        return NOMBRE;
      }
      case 'Arrondi':
      case 'Hasard': {
        const valeurs = expression.type === 'Arrondi' ? [expression.valeur] : [expression.minimum, expression.maximum];
        for (const valeur of valeurs) {
          const type = this.typeDe(valeur);
          if (estConnu(type) && type.genre !== 'nombre') {
            this.erreur(`« ${expression.type === 'Arrondi' ? 'arrondi de' : 'hasard entre'} » attend un nombre ; ${decrire(valeur)} est ${decrireType(type)}.`, expression.ligne);
          }
        }
        return NOMBRE;
      }
      case 'Fiche': {
        const champs: { nom: string; type: TypeValeur }[] = [];
        for (const champ of expression.champs) {
          if (champs.some((c) => c.nom === champ.nom)) {
            this.erreur(`le champ « ${champ.nom} » est donné deux fois dans cette fiche.`, champ.ligne);
            continue;
          }
          champs.push({ nom: champ.nom, type: this.typeDe(champ.valeur) });
        }
        return { genre: 'fiche', champs };
      }
      case 'EtatRequete':
        this.usagesEtat.push({ nom: expression.variable, ligne: expression.ligne, mot: `est ${expression.etat === 'introuvable' ? '' : 'en '}${expression.etat}` });
        return BOOLEEN;
      case 'ErreurRequete':
        this.usagesEtat.push({ nom: expression.variable, ligne: expression.ligne, mot: 'erreur de' });
        return TEXTE;
      case 'MouvementReduit':
        return BOOLEEN;
      case 'EtatUtilisateur':
        this.litLaSession = true;
        this.demandeUnServeur(`utilisateur est ${expression.etat}`, expression.ligne);
        return BOOLEEN;
      case 'Compte': {
        const type = this.typeDe(expression.liste);
        if (estConnu(type) && type.genre !== 'liste') {
          this.erreur(
            `${decrire(expression.liste)} est ${decrireType(type)} ; « nombre de » compte les éléments d’une liste.`,
            expression.ligne,
          );
        }
        return NOMBRE;
      }
      case 'Champ': {
        const resolution = this.elements.resoudre(expression.nom, 'champ');
        if ('ids' in resolution) {
          this.resultat.champs.set(expression, resolution.ids[0]);
        } else {
          this.erreur(
            `aucun champ « ${expression.nom} » dans la page « ${this.page.nom} ».${proposerNom(expression.nom, this.elements.elements.filter((e) => e.noeud.element === 'champ').flatMap((e) => [e.nom, e.libelle].filter((nom): nom is string => nom !== undefined)))}`,
            expression.ligne,
          );
        }
        // Un champ nombre vaut un nombre, une case à cocher vrai ou faux, les autres un texte.
        const sorte = this.sorteDuChamp(expression);
        return sorte === 'nombre' ? NOMBRE : sorte === 'case' ? BOOLEEN : TEXTE;
      }
    }
  }

  /** « remise(prix, 10) » : la fonction existe et reçoit autant de valeurs qu'elle en attend. */
  private appel(appel: Extract<Expression, { type: 'Appel' }>): TypeValeur {
    const types = appel.arguments.map((a) => this.typeDe(a));
    const info = this.fonctions.get(appel.nom);
    if (!info && this.resultat.fonctionsActions.has(appel.nom)) {
      this.erreur(`« ${appel.nom} » fait des actions sans rendre de valeur : appelle-la seule sur une ligne, dans un événement (« ${appel.nom}() »).`, appel.ligne);
      return INCONNU;
    }
    if (!info) {
      const connues = [...this.fonctions.keys()];
      this.erreur(
        connues.length > 0
          ? `la fonction « ${appel.nom} » n'existe pas. Fonctions : ${connues.join(', ')}.${proposerNom(appel.nom, connues)}`
          : `la fonction « ${appel.nom} » n'existe pas : écrivez-la en haut du fichier, avec fonction ${appel.nom} avec … :`,
        appel.ligne,
      );
      return INCONNU;
    }
    const attendus = info.definition.parametres.map((p) => p.nom);
    if (attendus.length !== types.length) {
      const valeurs = (n: number) => `${n} valeur${n > 1 ? 's' : ''}`;
      this.erreur(
        `la fonction « ${appel.nom} » attend ${valeurs(attendus.length)}${attendus.length > 0 ? ` (${attendus.join(', ')})` : ''}, mais en reçoit ${types.length}.`,
        appel.ligne,
      );
    } else {
      info.appels.push(types);
    }
    return info.retour;
  }

  /** « … dont … », « trier … par … », « premier de … », « les n premiers de … » (tâche 2). */
  private operationDeListe(expression: Extract<Expression, { type: 'Filtre' | 'Tri' | 'Premier' | 'Premiers' | 'Groupement' }>): TypeValeur {
    const type = this.typeDe(expression.liste);
    if (estConnu(type) && type.genre !== 'liste') {
      const mot = { Filtre: '« dont »', Tri: '« trier »', Premier: '« premier de »', Premiers: '« les … premiers de »', Groupement: '« grouper »' }[expression.type];
      this.erreur(`${mot} s'applique à une liste ; ${decrire(expression.liste)} est ${decrireType(type)}.`, expression.ligne);
      return INCONNU;
    }
    const element = type.genre === 'liste' ? type.de : INCONNU;
    const champs = this.champsDesElements(element);
    const inconnu = (nom: string) =>
      this.erreur(
        `« ${nom} » n'est pas un champ des éléments de ${decrire(expression.liste)}. Champs : ${champs.map((c) => c.nom).join(', ')}.${proposerNom(nom, champs.map((c) => c.nom))}`,
        expression.ligne,
      );
    switch (expression.type) {
      case 'Groupement': {
        if (estConnu(element) && !champs.length) {
          this.erreur(`« grouper » range une liste de fiches ou de données du serveur par un de leurs champs ; ${decrire(expression.liste)} est ${decrireListe(type)}.`, expression.ligne);
          return INCONNU;
        }
        const champ = champs.find((c) => c.nom === expression.champ);
        if (!champ && estConnu(element)) inconnu(expression.champ);
        // Chaque groupe : son nom (la valeur commune du champ) et ses éléments.
        return { genre: 'liste', de: { genre: 'fiche', champs: [{ nom: 'nom', type: champ?.type ?? INCONNU }, { nom: 'elements', type }] } };
      }
      case 'Filtre': {
        if (estConnu(element) && !champs.length) {
          this.erreur(`« dont » filtre une liste de fiches ou de données du serveur ; ${decrire(expression.liste)} est ${decrireListe(type)}.`, expression.ligne);
          return type;
        }
        // Les noms de la condition qui ne sont ni des champs ni des variables visibles.
        const absents = nomsLus(expression.test).filter((n) => !champs.some((c) => c.nom === n) && !this.portees.chercher(n));
        if (absents.length > 0 && champs.length > 0) {
          inconnu(absents[0]);
          return type;
        }
        // Les champs de chaque élément se lisent par leur nom, le temps de la condition.
        this.portees.ouvrir();
        for (const c of champs) this.portees.declarerSymbole({ nom: c.nom, ligne: expression.ligne, type: c.type });
        this.comparaison(expression.test);
        this.portees.fermer();
        this.resultat.filtres.set(expression, champs.map((c) => c.nom));
        return type;
      }
      case 'Tri': {
        if (expression.champ === undefined) {
          this.resultat.tris.set(expression, element.genre === 'texte' ? 'texte' : 'nombre');
          return type;
        }
        const champ = champs.find((c) => c.nom === expression.champ);
        if (!champ) {
          if (estConnu(element)) inconnu(expression.champ);
          return type;
        }
        this.resultat.tris.set(expression, champ.type.genre === 'texte' ? 'texte' : 'nombre');
        return type;
      }
      case 'Premier':
        return element;
      case 'Premiers': {
        const nombre = this.typeDe(expression.nombre);
        if (estConnu(nombre) && nombre.genre !== 'nombre') this.erreur('« les … premiers de » attend un nombre.', expression.ligne);
        return type;
      }
    }
  }

  /** Les champs d'un élément : ceux d'une fiche, ou d'une donnée du serveur (avec son identifiant). */
  private champsDesElements(element: TypeValeur): { nom: string; type: TypeValeur }[] {
    if (element.genre === 'fiche') return element.champs;
    if (element.genre === 'donnee') {
      const donnee = this.liens.donnees.get(element.nom);
      return donnee ? [{ nom: 'id', type: TEXTE }, ...donnee.champs.map((c) => ({ nom: c.nom, type: this.typeDeChamp(c.type) }))] : [];
    }
    return [];
  }

  /** La sorte du champ que désigne « champ "…" », s'il est trouvé. */
  private sorteDuChamp(expression: Extract<Expression, { type: 'Champ' }>): Element['sorte'] {
    const resolution = this.elements.resoudre(expression.nom, 'champ');
    return 'ids' in resolution ? this.elements.parId(resolution.ids[0])?.noeud.sorte : undefined;
  }

  private calcul(calcul: Extract<Expression, { type: 'Calcul' }>): TypeValeur {
    for (const membre of [calcul.gauche, calcul.droite]) {
      const type = this.typeDe(membre);
      if (estConnu(type) && type.genre !== 'nombre') {
        const conseil =
          type.genre === 'texte' && calcul.operateur === '+'
            ? ' Pour coller du texte, écrivez par exemple : "Total : {total}"'
            : '';
        this.erreur(
          `${decrire(membre)} est ${decrireType(type)} ; « ${calcul.operateur} » calcule avec des nombres.${conseil}`,
          calcul.ligne,
        );
      }
    }
    if (calcul.operateur === '/' && calcul.droite.type === 'Nombre' && calcul.droite.valeur === 0) {
      this.erreur('division par zéro : le nombre après « / » ne peut pas être 0.', calcul.ligne);
    }
    return NOMBRE;
  }

  private modificationListe(modification: ModificationListe, contexte: Contexte): void {
    if (contexte === 'vue') this.horsEvenement(modification.operation, modification.ligne);

    const typeValeur = this.typeDe(modification.valeur);
    const symbole = this.variable(modification.liste, modification.ligne);
    if (symbole?.origine?.type === 'Variable' && symbole.origine.fichierDonnees) {
      this.erreur(`« ${modification.liste} » vient d'un fichier : on peut la lire, pas la changer. Pour la modifier, copiez-la : variable mes_${modification.liste} = ${modification.liste}.`, modification.ligne);
      return;
    }
    if (!symbole || this.estCalcul(symbole, modification.ligne)) return;

    const type = symbole.type;
    if (estConnu(type) && type.genre !== 'liste') {
      this.erreur(
        `« ${modification.liste} » est ${decrireType(type)} ; on ne peut ajouter ou retirer que dans une liste.`,
        modification.ligne,
      );
      return;
    }
    if (type.genre !== 'liste') return;

    if (!estConnu(type.de)) {
      // Une liste vide prend le type de ce qu'on y ajoute.
      if (modification.operation === 'ajouter' && estConnu(typeValeur)) {
        symbole.type = listeDe(typeValeur);
        if (symbole.origine) this.resultat.types.set(symbole.origine, symbole.type);
      }
    } else if (!compatibles(type.de, typeValeur)) {
      const verbe = modification.operation === 'ajouter' ? 'y ajouter' : 'en retirer';
      this.erreur(
        `« ${modification.liste} » est ${decrireListe(type)} ; on ne peut pas ${verbe} ${decrireType(typeValeur)}.`,
        modification.ligne,
      );
    }
  }

  /** Un calcul ne se change pas : on le signale et on renvoie vrai. */
  private estCalcul(symbole: Symbole, ligne: number): boolean {
    if (symbole.origine?.type !== 'Variable' || !symbole.origine.calcul) return false;
    if (symbole.origine.constante) {
      this.erreur(`« ${symbole.nom} » est une constante : sa valeur ne change pas (ligne ${symbole.ligne}). Écrivez « variable ${symbole.nom} = … » si elle doit changer.`, ligne);
      return true;
    }
    this.erreur(
      `« ${symbole.nom} » est un calcul : sa valeur se recalcule seule (ligne ${symbole.ligne}). Changez plutôt les variables dont il dépend.`,
      ligne,
    );
    return true;
  }

  private interpolations(chaine: LitteralChaine): void {
    for (const partie of chaine.parties) {
      if (partie.type !== 'variable') continue;
      // « {prix en FC} » (argent) et « {n article} » (pluriel), décision L6.
      const habillage = habillageDe(partie.valeur);
      if ('erreur' in habillage) {
        this.erreur(habillage.erreur, chaine.ligne);
        continue;
      }
      if (habillage.chemin !== partie.valeur) this.resultat.chemins.set(partie, habillage.chemin);
      // « {p.prix} » : la variable, puis ses champs.
      const [racine, ...champs] = habillage.chemin.split('.');
      if (!this.portees.chercher(racine)) {
        this.erreur(
          `le texte utilise {${partie.valeur}}, mais la variable « ${racine} » n'est pas déclarée.${proposerNom(racine, this.portees.nomsVisibles())}`,
          chaine.ligne,
        );
        continue;
      }
      let expression: Expression = { type: 'Reference', nom: racine, ligne: chaine.ligne };
      for (const champ of champs) expression = { type: 'AccesChamp', objet: expression, champ, ligne: chaine.ligne };
      const type = champs.length > 0 ? this.typeDe(expression) : this.portees.chercher(racine)!.type;
      if ('depuis' in habillage && habillage.depuis) {
        if (estConnu(type) && type.genre !== 'texte') {
          this.erreur(`« ${habillage.chemin} » est ${decrireType(type)} ; « depuis » s'écrit après une date.`, chaine.ligne);
          continue;
        }
        this.resultat.formats.set(partie, 'depuis');
        continue;
      }
      if (habillage.devise || habillage.pluriel) {
        if (estConnu(type) && type.genre !== 'nombre') {
          const suite = habillage.devise ? `« en ${habillage.mot} »` : `« ${habillage.pluriel} »`;
          this.erreur(`« ${habillage.chemin} » est ${decrireType(type)} ; ${suite} s'écrit après un nombre.`, chaine.ligne);
          continue;
        }
        if (habillage.devise) this.resultat.formats.set(partie, habillage.devise);
        if (habillage.pluriel) this.resultat.pluriels.set(partie, habillage.pluriel);
        continue;
      }
      // Le format français (décision F1) : les nombres, les champs « date » du serveur, et les dates du programme.
      if (type.genre === 'nombre') this.resultat.formats.set(partie, 'nombre');
      else if (champs.length === 1 && this.estChampDate(racine, champs[0])) this.resultat.formats.set(partie, 'date');
      else if (champs.length === 0 && this.estUneDate(racine)) this.resultat.formats.set(partie, 'date');
    }
  }

  /** « r.jour » : le champ « jour » de la donnée que porte « r » est une date. */
  /** Une variable qui contient une date du programme (« aujourd'hui », « … plus 3 jours »). */
  private estUneDate(nom: string): boolean {
    const origine = this.portees.chercher(nom)?.origine;
    const valeur = origine?.type === 'Variable' ? origine.valeur : undefined;
    return valeur?.type === 'DateDuJour' || valeur?.type === 'DateDecalee';
  }

  private estChampDate(racine: string, champ: string): boolean {
    const type = this.portees.chercher(racine)?.type;
    if (type?.genre !== 'donnee') return false;
    return this.liens.donnees.get(type.nom)?.champs.find((c) => c.nom === champ)?.type.genre === 'date';
  }

  /** Le type d'un champ de donnée, vu depuis une page. */
  private typeDeChamp(type: TypeChamp): TypeValeur {
    if (type.genre === 'liste') return listeDe(this.typeDeChamp(type.de));
    if (type.genre === 'donnee') return { genre: 'donnee', nom: type.nom };
    if (type.genre === 'nombre') return NOMBRE;
    if (type.genre === 'booleen') return BOOLEEN;
    return TEXTE;
  }

  /** Les paramètres et les filtres donnés à une page : chacun existe, et aucun paramètre ne manque. */
  private argumentsPage(page: string, donnes: { nom: string; valeur: Expression }[], ecrit: string, ligne: number): void {
    const types = donnes.map((a) => this.typeDe(a.valeur));
    const attendus = parametresDesPages.get(page);
    if (attendus === undefined) return;
    const filtres = filtresDesPages.get(page) ?? [];
    donnes.forEach((a, i) => {
      const filtre = filtres.find((f) => f.nom === a.nom);
      if (filtre) {
        const attendu = filtre.nombre ? NOMBRE : TEXTE;
        if (!compatibles(attendu, types[i]) && a.valeur.type !== 'Rien') {
          this.erreur(`le filtre « ${filtre.nom} » de la page « ${page} » est ${decrireType(attendu)} ; on ne peut pas lui donner ${decrireType(types[i])}.`, ligne);
        }
        return;
      }
      if (attendus.includes(a.nom)) return;
      this.erreur(
        filtres.length > 0
          ? `« ${a.nom} » n'est ni un paramètre ni un filtre de la page « ${page} ». Paramètres : ${attendus.join(', ') || 'aucun'}. Filtres : ${filtres.map((f) => f.nom).join(', ')}.`
          : `la page « ${page} » n'a pas de paramètre « ${a.nom} ». Paramètres : ${attendus.join(', ') || 'aucun'}.`,
        ligne,
      );
    });
    const manquant = attendus.find((nom) => !donnes.some((a) => a.nom === nom));
    if (manquant !== undefined) {
      this.erreur(`la page « ${page} » attend le paramètre « ${manquant} » : écrivez ${ecrit} "${page}" avec ${manquant} …`, ligne);
    }
  }

  private accesChamp(acces: AccesChamp): TypeValeur {
    const type = this.typeDe(acces.objet);
    // « photo.apercu » d'un PDF : il n'y a rien à montrer.
    if (acces.champ === 'apercu' && acces.objet.type === 'Reference') {
      const choisi = this.fichiers.get(acces.objet.nom);
      if (choisi && !aUnApercu(choisi.choix)) this.erreur(`un fichier accepté « ${choisi.choix.accepte.join(' ou ')} » n'a pas d'aperçu : « apercu » existe pour des images, des sons et des vidéos.`, acces.ligne);
    }
    // « panier.prix » sur une liste de fiches ou de données : la liste des prix.
    if (type.genre === 'liste' && (type.de.genre === 'fiche' || type.de.genre === 'donnee')) {
      this.resultat.projections.add(acces);
      return listeDe(this.champDe(type.de, acces));
    }
    return this.champDe(type, acces);
  }

  /** Le type d'un champ lu sur une donnée du serveur ou une fiche. */
  private champDe(type: TypeValeur, acces: AccesChamp): TypeValeur {
    // Chaque donnée du serveur a son identifiant, donné par le serveur.
    if (type.genre === 'donnee' && acces.champ === 'id') return TEXTE;
    if (type.genre === 'donnee') {
      const donnee = this.liens.donnees.get(type.nom);
      const champ = donnee?.champs.find((c) => c.nom === acces.champ);
      if (donnee && !champ) {
        this.erreur(
          `le champ « ${acces.champ} » n'existe pas dans la donnée « ${donnee.nom} ». Champs : ${donnee.champs.map((c) => c.nom).join(', ')}.${proposerNom(acces.champ, donnee.champs.map((c) => c.nom))}`,
          acces.ligne,
        );
        return INCONNU;
      }
      return champ ? this.typeDeChamp(champ.type) : INCONNU;
    }
    if (type.genre === 'fiche') {
      const champ = type.champs.find((c) => c.nom === acces.champ);
      if (!champ) {
        this.erreur(
          `le champ « ${acces.champ} » n'existe pas dans ${type.fichier ? `le fichier « ${type.fichier} »` : 'cette fiche'}. ${type.fichier ? 'Colonnes' : 'Champs'} : ${type.champs.map((c) => c.nom).join(', ')}.${proposerNom(acces.champ, type.champs.map((c) => c.nom))}`,
          acces.ligne,
        );
        return INCONNU;
      }
      return champ.type;
    }
    if (estConnu(type)) {
      this.erreur(
        `${decrire(acces.objet)} est ${decrireType(type)} ; on ne lit un champ (${nomExpression(acces)}) que sur une donnée du serveur ou une fiche.`,
        acces.ligne,
      );
    }
    return INCONNU;
  }

  /**
   * Une requête vers le serveur du même fichier : la route doit exister ;
   * la réponse donne son type à la variable ; les champs envoyés doivent
   * exister dans la donnée ; et on prévient si la règle d'accès refusera
   * la requête à un visiteur.
   */
  private requete(requete: Requete): void {
    const types = requete.donnees.map((d) => this.typeDe(d));
    const symbole = requete.resultat !== undefined ? this.variable(requete.resultat, requete.ligne) : undefined;
    if (requete.resultat !== undefined) (requete.source !== undefined ? this.ciblesSources : this.ciblesAutres).add(requete.resultat);
    if (requete.source !== undefined || requete.filtrant !== undefined) {
      this.requeteSource(requete, symbole);
      return;
    }
    if (this.liens.routes.size === 0) return;

    const route = this.routeDe(requete);
    if (!route) return;

    // « avec id dans produit », dans une page à paramètre : un seul élément, lu par son identifiant.
    const seul = requete.donnees[0];
    if (requete.donnees.length === 1 && seul.type === 'Reference' && this.page.parametres.includes(seul.nom) && symbole) {
      this.resultat.lecturesUn.add(requete);
      const type: TypeValeur = { genre: 'donnee', nom: route.donnee.nom };
      if (!estConnu(symbole.type)) {
        symbole.type = type;
        if (symbole.origine) this.resultat.types.set(symbole.origine, type);
      }
      this.avertirDroits(route, 'lire', requete.ligne);
      return;
    }

    const envoi = requete.donnees.length > 0;
    if (symbole && !envoi) {
      // La réponse d'une lecture est une liste de la donnée de la route.
      const type = listeDe({ genre: 'donnee', nom: route.donnee.nom });
      if (!estConnu(symbole.type) || (symbole.type.genre === 'liste' && !estConnu(symbole.type.de))) {
        symbole.type = type;
        if (symbole.origine) this.resultat.types.set(symbole.origine, type);
      }
    }

    requete.donnees.forEach((donnee, i) => {
      const cle = donnee.type === 'Champ' ? simplifier(donnee.nom) : donnee.type === 'Reference' ? donnee.nom : undefined;
      if (cle !== undefined) this.verifierChamp(route, cle, donnee, types[i], requete.ligne);
    });

    this.avertirDroits(route, envoi ? 'creer' : 'lire', requete.ligne);
  }

  /** Les variables qui reçoivent une requête vers une source (ils ont un état : chargement, erreur…). */
  private readonly ciblesSources = new Set<string>();
  /** Les variables remplies par une requête vers le serveur du fichier ou une adresse : sans état pour l'instant. */
  private readonly ciblesAutres = new Set<string>();
  private readonly usagesEtat: { nom: string; ligne: number; mot: string }[] = [];

  /** « produits est en chargement », « erreur de produits », « recharger produits » : la variable doit recevoir une requête vers une source. */
  private verifierEtatsRequetes(): void {
    const lus = new Set<string>();
    for (const usage of this.usagesEtat) {
      lus.add(usage.nom);
      if (this.ciblesSources.has(usage.nom)) continue;
      this.resultat.diagnostics.push({
        gravite: 'erreur',
        ligne: usage.ligne,
        message: this.ciblesAutres.has(usage.nom)
          ? `« ${usage.mot} » ne marche pas encore pour « ${usage.nom} » : l'état d'une requête n'existe que pour une requête vers une source (de la source "…").`
          : `« ${usage.nom} » ne reçoit aucune requête vers une source : « ${usage.mot} » n'a pas de sens. Ajoutez envoyer requete vers "…" de la source "…" dans ${usage.nom}.`,
      });
    }
    this.resultat.etatsLus.set(this.page, lus);
  }

  /** Une requête vers une source (« de la source \"boutique\" ») : voir `analyse/sources.ts`. */
  private requeteSource(requete: Requete, symbole: Symbole | undefined): void {
    for (const f of requete.filtrant ?? []) this.typeDe(f.valeur);
    const parUnId =
      requete.donnees.length === 1 && requete.donnees[0].type === 'Reference' && this.page.parametres.includes(requete.donnees[0].nom) && symbole !== undefined;
    const verifie = verifierRequeteSource(requete, this.liens.sources, parUnId, (m, l) => this.resultat.diagnostics.push({ gravite: 'erreur', message: m, ligne: l }));
    if (verifie?.regle) this.resultat.reglesSources.set(requete, verifie.regle);
    const type = verifie?.type;
    if (!type || !symbole) return;
    if (parUnId) this.resultat.lecturesUn.add(requete);
    if (!estConnu(symbole.type) || (symbole.type.genre === 'liste' && !estConnu(symbole.type.de))) {
      symbole.type = type;
      if (symbole.origine) this.resultat.types.set(symbole.origine, type);
    }
  }

  /** « supprimer p de "produits" », « modifier p dans "produits" avec … » (trou G2). */
  private operationServeur(operation: Suppression | Modification): void {
    const verbe = operation.type === 'Suppression' ? 'supprimer' : 'modifier';
    const typeObjet = this.typeDe(operation.objet);
    const types = operation.type === 'Modification' ? operation.changements.map((c) => this.typeDe(c.valeur)) : [];
    if (operation.source !== undefined) {
      const regle = verifierOperationSource(operation, this.liens.sources, typeObjet, (m, l) => this.resultat.diagnostics.push({ gravite: 'erreur', message: m, ligne: l }));
      if (regle) this.resultat.reglesOperations.set(operation, regle);
      return;
    }
    if (this.liens.routes.size === 0) {
      this.erreur(
        `« ${verbe} » demande un serveur dans le même fichier : ajoutez un bloc serveur "…" : avec la route « ${adresseNormalisee(operation.adresse)} ».`,
        operation.ligne,
      );
      return;
    }
    const route = this.routeDe(operation);
    if (!route) return;

    // Il faut une donnée lue sur cette route : c'est son identifiant qui est envoyé.
    if (estConnu(typeObjet) && !(typeObjet.genre === 'donnee' && typeObjet.nom === route.donnee.nom)) {
      const ecrit = verbe === 'supprimer' ? `supprimer … de "${route.adresse}"` : `modifier … dans "${route.adresse}"`;
      this.erreur(
        `${decrire(operation.objet)} est ${decrireType(typeObjet)} : « ${ecrit} » attend un « ${route.donnee.nom} » lu sur cette route (par exemple la variable d’une boucle « pour chaque p dans ${route.adresse} »).`,
        operation.ligne,
      );
    }
    if (operation.type === 'Modification') {
      operation.changements.forEach((c, i) => this.verifierChamp(route, simplifier(c.champ), c.valeur, types[i], operation.ligne));
    }
    this.avertirDroits(route, verbe, operation.ligne);
  }

  /** La route visée, et son adresse réelle ; une erreur si elle n'existe pas. */
  private routeDe(operation: Requete | Suppression | Modification) {
    const route = this.liens.routes.get(adresseNormalisee(operation.adresse));
    if (!route) {
      this.erreur(
        `aucune route « ${adresseNormalisee(operation.adresse)} » dans le serveur « ${this.liens.serveur} ». Routes : ${[...this.liens.routes.values()].map((r) => r.adresse).join(', ')}.`,
        operation.ligne,
      );
      return undefined;
    }
    this.resultat.adressesRequetes.set(operation, `/api/${adresseNormalisee(route.adresse)}`);
    return route;
  }

  /** Un champ envoyé au serveur : il existe dans la donnée, avec le bon type. */
  private verifierChamp(
    route: NonNullable<ReturnType<AnalysePage['routeDe']>>,
    cle: string,
    valeur: Expression,
    type: TypeValeur,
    ligne: number,
  ): void {
    const champ = route.donnee.champs.find((c) => c.nom === cle);
    if (!champ) {
      this.erreur(
        `la donnée « ${route.donnee.nom} » n'a pas de champ « ${cle} ». Champs : ${route.donnee.champs.map((c) => c.nom).join(', ')}.${proposerNom(cle, route.donnee.champs.map((c) => c.nom))}`,
        ligne,
      );
    } else if (!compatibles(this.typeDeChamp(champ.type), type)) {
      this.erreur(
        `${decrire(valeur)} est ${decrireType(type)} ; le champ « ${champ.nom} » de « ${route.donnee.nom} » attend ${decrireType(this.typeDeChamp(champ.type))}.`,
        ligne,
      );
    }
  }

  /** Prévient quand la règle d'accès refusera l'action à un visiteur. */
  private avertirDroits(route: NonNullable<ReturnType<AnalysePage['routeDe']>>, action: 'lire' | 'creer' | 'modifier' | 'supprimer', ligne: number): void {
    const verbe = action === 'creer' ? 'créer' : action;
    const qui = route.droits[action];
    // Une action que personne ne peut faire est déjà signalée sur la route ;
    // une requête déjà gardée par « si utilisateur est … » ne sera pas refusée.
    if (qui === 'connecte' && this.garde !== undefined) return;
    if (qui === 'admin' && this.garde === 'admin') return;
    if (qui === 'connecte') {
      this.avertissement(`il faut être connecté pour ${verbe} « ${route.donnee.nom} » : cette requête sera refusée à un visiteur.`, ligne);
    } else if (qui === 'admin') {
      this.avertissement(`seul un admin peut ${verbe} « ${route.donnee.nom} » : cette requête sera refusée à un visiteur.`, ligne);
    }
  }

  private declarer(
    nom: string,
    ligne: number,
    type: TypeValeur,
    origine?: DeclarationVariable | Boucle,
  ): void {
    if (simplifier(nom) === 'utilisateur') this.ligneNomUtilisateur ??= ligne;
    if (languesActives.size > 0 && simplifier(nom) === 'langue') {
      this.erreur('« langue » est la langue choisie par la personne (« si langue est anglais », « changer langue par anglais ») : donnez un autre nom à cette variable.', ligne);
      return;
    }
    const existant = this.portees.declarer({ nom, ligne, type, origine });
    if (existant) {
      this.erreur(
        `la variable « ${nom} » existe déjà (ligne ${existant.ligne}). Pour changer sa valeur, écrivez : changer ${nom} par …`,
        ligne,
      );
    }
  }

  /**
   * Avec un bloc « langues », « langue » (la langue choisie) et le nom d'une
   * langue déclarée (« anglais ») sont des valeurs intégrées, sauf si une
   * variable du même nom est visible. Rend « langue » ou le code, sinon rien.
   */
  private valeurDeLangue(nom: string): string | undefined {
    if (languesActives.size === 0 || this.portees.chercher(nom)) return undefined;
    const simple = simplifier(nom);
    return simple === 'langue' ? 'langue' : languesActives.get(simple);
  }

  /** Une variable utilisée : visible ici, ou une erreur qui dit pourquoi. */
  private variable(nom: string, ligne: number) {
    const symbole = this.portees.chercher(nom);
    if (symbole) return symbole;

    const plusLoin = this.declareesPlusLoin.get(nom);
    const boucle = this.boucleFermee.get(nom);

    if (plusLoin !== undefined && plusLoin > ligne) {
      this.erreur(
        `la variable « ${nom} » est utilisée avant d'être déclarée (ligne ${plusLoin}).`,
        ligne,
      );
    } else if (boucle !== undefined) {
      this.erreur(`« ${nom} » n'existe que dans la boucle de la ligne ${boucle}.`, ligne);
    } else if (languesActives.size === 0 && (simplifier(nom) === 'langue' || langueDuMot(nom)?.disponible)) {
      // « si langue est anglais » sans bloc « langues » : le bloc manque, pas une variable.
      this.erreur(
        `« ${nom} » ${simplifier(nom) === 'langue' ? 'est la langue choisie par la personne' : 'est une langue'} : déclarez d'abord les langues en haut du fichier, avec « langues : » puis « francais » et « anglais » sur deux lignes décalées.`,
        ligne,
      );
    } else {
      this.erreur(
        `la variable « ${nom} » n'est pas déclarée. Déclarez-la avec : variable ${nom} = …${proposerNom(nom, this.portees.nomsVisibles())}${this.elementEnCours ? ` Si c'est un texte, mettez-le entre guillemets : ${this.elementEnCours} "${nom}"` : ''}`,
        ligne,
      );
    }
    return undefined;
  }

  private cible(instruction: Evenement | Action, texte: string, parmi?: ElementRecense[]): void {
    const resolution = this.elements.resoudre(texte, undefined, parmi);
    // « montrer "message" », « cacher "message" » : un formulaire se vise aussi par son nom.
    const formulaire =
      instruction.type === 'Action' && (instruction.action === 'montrer' || instruction.action === 'cacher')
        ? this.elements.formulaires.find((f) => f.nom === texte)
        : undefined;
    // « montrer "Détails" » : une fenêtre se vise par son titre ou son nom.
    const fenetre = instruction.type === 'Action' ? this.fenetreVisee(instruction, texte) : undefined;
    if (fenetre !== undefined) {
      this.resultat.cibles.set(instruction, [fenetre]);
    } else if ('ids' in resolution) {
      this.resultat.cibles.set(instruction, resolution.ids);
    } else if (formulaire) {
      this.resultat.cibles.set(instruction, [formulaire.id]);
    } else if (resolution.erreur === 'inconnu') {
      this.erreur(`aucun élément « ${texte} » dans la page « ${this.page.nom} ».${proposerNom(texte, (parmi ?? this.elements.elements).flatMap((e) => [e.nom, e.libelle].filter((nom): nom is string => nom !== undefined)))}`, instruction.ligne);
    } else {
      const [a, b] = resolution.lignes;
      this.erreur(
        `deux éléments s'appellent « ${texte} » (lignes ${a} et ${b}). Donnez un nom à l'un d'eux : avec nom "…"`,
        instruction.ligne,
      );
    }
  }

  private pageCible(cible: string, ligne: number): void {
    const lue = lireCible(cible);
    if (lue.refus) {
      this.erreur(lue.refus, ligne);
      return;
    }
    if (lue.externe || lue.page === undefined || lue.page === '') return;
    if (!this.nomsPages.has(lue.page)) {
      this.avertissement(`la page « ${lue.page} » n'existe pas dans ce fichier.${proposerNom(lue.page, this.nomsPages)}`, ligne);
    }
  }

  private horsEvenement(nom: string, ligne: number, conseil = ''): void {
    this.erreur(`« ${nom} » ne s'utilise que dans un événement (quand …).${conseil}`, ligne);
  }
}

/** Vrai si l'élément porte ce nom ou ce libellé. */
function vise(element: ElementRecense, texte: string): boolean {
  return element.nom === texte || element.libelle === texte;
}

/** Le texte d'une chaîne écrite sans {variable}, sinon undefined. */
function texteLitteral(expression: Expression): string | undefined {
  if (expression.type !== 'Chaine') return undefined;
  if (expression.parties.some((p) => p.type === 'variable')) return undefined;
  return expression.parties.map((p) => p.valeur).join('');
}

/** « « stock » », « le champ « email » » ou « cette valeur ». */
/** « p.prix » : l'écriture d'une variable ou d'un champ. */
function nomExpression(expression: Expression): string {
  if (expression.type === 'Reference') return expression.nom;
  if (expression.type === 'AccesChamp') return `${nomExpression(expression.objet)}.${expression.champ}`;
  return '…';
}

function decrire(expression: Expression): string {
  if (expression.type === 'Reference' || expression.type === 'AccesChamp') return `« ${nomExpression(expression)} »`;
  if (expression.type === 'Champ') return `le champ « ${expression.nom} »`;
  return 'cette valeur';
}

/** Ce qu'une fonction ne peut pas faire (elle calcule une valeur) : le nom de l'action, ou rien. */
function actionInterditeDansUneFonction(instruction: Instruction): string | undefined {
  switch (instruction.type) {
    case 'Action':
      return instruction.action === 'afficher' ? 'afficher' : NOMS_ACTIONS[instruction.action];
    case 'Requete':
      return 'envoyer requete';
    case 'Connexion':
      return 'se connecter';
    case 'Deconnexion':
      return 'se deconnecter';
    case 'Suppression':
      return 'supprimer';
    case 'Modification':
      return 'modifier';
    case 'Minuterie':
      return instruction.mode === 'apres' ? 'apres …' : 'toutes les …';
    case 'Copier':
      return 'copier';
    case 'Partager':
      return 'partager';
    case 'Confirmer':
      return 'confirmer';
    default:
      return undefined;
  }
}

/** Les variables lues par une comparaison (« n est inferieur a fin » : n, fin). */
function nomsLus(test: Test): string[] {
  if (test.type === 'Combinaison') return [...nomsLus(test.gauche), ...nomsLus(test.droite)];
  const noms: string[] = [];
  const lire = (e: Expression | undefined): void => {
    if (!e) return;
    if (e.type === 'Reference') noms.push(e.nom);
    else if (e.type === 'AccesChamp') lire(e.objet);
    else if (e.type === 'Calcul') {
      lire(e.gauche);
      lire(e.droite);
    } else if (e.type === 'Compte') lire(e.liste);
  };
  lire(test.gauche);
  lire(test.droite);
  return noms;
}

/** Les variables changées par des instructions (changer, ajouter, retirer, une réponse de requête), blocs compris. */
function nomsChanges(instructions: Instruction[], noms = new Set<string>()): Set<string> {
  for (const i of instructions) {
    if (i.type === 'Affectation') noms.add(i.nom);
    else if (i.type === 'ModificationListe') noms.add(i.liste);
    else if (i.type === 'Requete' && i.resultat !== undefined) noms.add(i.resultat);
    else if (i.type === 'EnvoiFichier') {
      if (i.suivi !== undefined) noms.add(i.suivi);
      if (i.resultat !== undefined) noms.add(i.resultat);
    } else if (i.type === 'Condition') {
      nomsChanges(i.alors, noms);
      nomsChanges(i.sinon, noms);
    } else if (i.type === 'Boucle' || i.type === 'TantQue' || i.type === 'Repeter') nomsChanges(i.corps, noms);
    else if (i.type === 'Selon') {
      for (const c of i.cas) nomsChanges(c.corps, noms);
      nomsChanges(i.sinon, noms);
    }
  }
  return noms;
}

/**
 * Ce qui habille un « {…} » de texte (décision L6) : « prix en FC » (une
 * devise) ou « n article » (un mot à accorder), et le chemin de la valeur.
 */
function habillageDe(texte: string): { chemin: string; devise?: 'FC' | 'EUR' | 'USD' | 'Ko' | 'Mo'; mot?: string; pluriel?: string; depuis?: boolean } | { erreur: string } {
  // « {r.cree depuis} » : « il y a 3 jours ».
  const depuis = /^(\S+)\s+depuis$/u.exec(texte);
  if (depuis) return { chemin: depuis[1], depuis: true };
  const argent = /^(\S+)\s+en\s+(\S+)$/u.exec(texte);
  if (argent) {
    // « {photo.taille en Mo} » : une taille de fichier, écrite en kilo-octets ou en mégaoctets.
    const unite = ({ ko: 'Ko', mo: 'Mo' } as const)[argent[2].toLowerCase() as 'ko' | 'mo'];
    if (unite) return { chemin: argent[1], devise: unite, mot: argent[2] };
    const devise = DEVISES[argent[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()];
    if (!devise) return { erreur: `« ${argent[2]} » n'est pas une devise connue. Devises : FC, euros, dollars (et Ko, Mo pour une taille).${proposerNom(argent[2], [...Object.keys(DEVISES), 'Ko', 'Mo'])}` };
    return { chemin: argent[1], devise, mot: argent[2] };
  }
  const pluriel = /^(\S+)\s+(\p{L}[\p{L}'-]*)$/u.exec(texte);
  if (pluriel) return { chemin: pluriel[1], pluriel: pluriel[2] };
  return { chemin: texte };
}
