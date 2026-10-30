import { verificationsDuChamp, messageEnCode, libellesEnLangues, type MessageEnLangues } from '../../i18n/messages.js';
import { titreComplet, adresseImage, sansBarreFinale } from '../publication.js';
import { sousActions } from '../../ri/actions.js';
import { nomDeLaCopie, estFichierLocal, type InfoMedia } from '../../ri/medias.js';
import type { Ecran, Etat, NoeudVue, Gestionnaire, Action, Valeur, TypeValeur, Option, Saisie, FonctionRI, ImageRI, SiteRI, LangueRI } from '../../ri/types.js';
import { simplifier } from '../../analyse/elements.js';
import { lireCible } from '../../analyse/navigation.js';
import type { GenreBloc } from '../../parser/ast.js';
import { Ecrivain } from './ecrivain.js';
import { pascal, camel, setter, setterDe, chaine } from './noms.js';
import { WIDGETS_WEB, type RenduWidgets, type WidgetProduit, type CompositeProduit } from './widgets.js';
import type { CarteProduite } from './carte.js';
import { baliseGraphique } from './graphique.js';
import { type Contexte, typeTS, typeDe, expression, contenuJSX, condition, ficheAvec } from './valeurs.js';
import { importsDesInteractions, decrireTouches } from './interactions.js';

/** Une variable de boucle, passée au gestionnaire d'un événement écrit dans la boucle. */
interface Parametre {
  nom: string;
  type: TypeValeur;
}

interface Fonction {
  nom: string;
  parametres: Parametre[];
  actions: Action[];
  /** La soumission d'un formulaire : l'identifiant du formulaire (vérifications, puis champs vidés). */
  formulaire?: string;
}

/** Un attribut d'événement de la plateforme (« onClick », « onPress »). */
type Attribut = string;

/**
 * Ce qui change d'une plateforme à l'autre : les éléments, la navigation et
 * l'enveloppe de la page. Le reste (état, événements, conditions, boucles,
 * requêtes) est écrit une seule fois, pour le web comme pour le mobile.
 */
export interface Rendu {
  /** Les imports propres à la plateforme, lus dans le code produit. */
  imports(code: string): string[];
  /** La déclaration de ce qui permet d'aller vers une autre page. */
  navigateur: string;
  naviguer(chemin: string): string;
  /** L'ouverture et la fermeture d'une page, puis d'un composant. */
  enveloppe: { page: [string, string]; composant: [string, string] };
  /** L'attribut de chaque événement ; absent : l'événement n'existe pas sur la plateforme. */
  evenements: Partial<Record<'clic' | 'survol', Attribut>>;
  /** Une ligne écrite au début de chaque page et composant. */
  debut?: string;
  /** La lecture des paramètres de la page dans son adresse (« page "produit" avec parametre id »). */
  parametres(noms: string[]): string;
  /** L'adresse d'une page à paramètre : `base` (« /produit ») suivie des valeurs, en expression. */
  adresse(base: string, valeurs: string[]): string;
  element(element: ElementProduit): string;
  /**
   * Le formulaire : son ouverture, avec l'appel de sa fonction de
   * soumission (`quandSoumisMessage`, `quandSoumisAvis(sujet)`) s'il en a
   * une, et sa fermeture.
   */
  formulaire: { ouvrir(id: string, soumettre: string | undefined): string; fermer: string };
  /** Un bloc de mise en page (« section », « ligne »…) : son ouverture et sa fermeture. */
  bloc: { ouvrir(genre: GenreBloc, options: Option[], classes: string[], ancre?: string): string; fermer(genre: GenreBloc, options: Option[]): string };
  /**
   * Les attributs par lesquels un bouton ou une saisie d'une ligne envoie
   * son formulaire. Absents : la plateforme le fait seule (le web, avec la
   * balise <form>).
   */
  soumission: { bouton?: Attribut; saisie?: Attribut };
  /** Les éléments d'écran (icône, badge, onglets…) : ce que la plateforme écrit pour chacun. */
  widgets: RenduWidgets;
  /** La liste déroulante est écrite à la main et a besoin d'un état « ouverte » (le mobile). */
  listeAOuvrir?: boolean;
  /** L'attribut de la touche Entrée dans une saisie (« arrete d'ecrire » ne attend plus). */
  entree: Attribut;
  /** Les attributs d'un élément « avec annonce » : une zone qu'un lecteur d'écran lit quand elle change. */
  annonce: string;
  /** Les attributs d'un élément « avec raccourci » ; absent : la plateforme n'a pas de clavier (le téléphone). */
  raccourci?(touches: string, libelle: string | undefined): string;
  /** « confirmer » vient d'un crochet (useConfirmer, le téléphone) plutôt que d'une fonction importée. */
  confirmationParCrochet?: boolean;
  /**
   * Sous un bloc qui a « arrive en bas de » : la sentinelle observée (le web)
   * et le vrai bouton « Voir plus », atteignable au clavier. `bouton` null :
   * « sans bouton » (le téléphone le garde : il n'observe pas le défilement).
   * `bouton` est déjà écrit pour le JSX.
   */
  voirPlus(nom: string, bouton: string | null): string[];
  /** Une liste « avec deplacement » : son ouverture, chaque élément, et ce qui suit (l'annonce). */
  deplacement: {
    ouvrir: string;
    element(nom: string, index: string): [string, string];
    fermer(nom: string): string[];
  };
}

/** Les sortes de champ où l'on écrit une seule ligne : la touche Entrée y envoie le formulaire. */
const UNE_LIGNE = new Set(['texte', 'email', 'telephone', 'nombre', 'date', 'heure', 'motDePasse', 'adresseWeb']);

/** Un texte écrit en clair dans du JSX : tel quel, ou entre accolades s'il contient un caractère du JSX. */
export function contenuTexte(texte: string): string {
  return /[{}<>]/.test(texte) ? `{${chaine(texte)}}` : texte;
}

/** Une chaîne dans un attribut JSX : entre guillemets si c'est possible, sinon entre accolades. */
export function attributTexte(texte: string): string {
  return /["\\{}\n]/.test(texte) ? `{${chaine(texte)}}` : `"${texte}"`;
}

/** `/produit/${encodeURIComponent(String(p.id))}` : chaque valeur devient un morceau de l'adresse. */
const adresseParMorceaux = (base: string, valeurs: string[]) =>
  `\`${base === '/' ? '' : base}${valeurs.map((v) => `/\${encodeURIComponent(String(${v}))}`).join('')}\``;

/** Un élément prêt à être écrit par le rendu de la plateforme. */
export interface ElementProduit {
  genre: Extract<NoeudVue, { type: 'element' }>['genre'];
  id: string;
  options: Option[];
  classes: string[];
  /** Le contenu, déjà traduit pour le JSX. */
  contenu: string;
  /** Les attributs d'événement, déjà écrits (`onClick={quandCliqueAjouter}`). */
  evenements: string[];
  /** Le titre de la page (1) ou un titre suivant (2). */
  niveau: number;
  /** L'adresse d'un lien. */
  vers: string;
  /** L'adresse d'un lien vers une page à paramètre, en expression (`\`/produit/${…}\``). */
  versExpression?: string;
  /** Un lien vers une adresse externe (https://, mailto:, tel:), et « avec nouvel onglet ». */
  externe?: string;
  nouvelOnglet?: boolean;
  /** « avec ancre "…" » : l'identifiant de l'élément dans la page. */
  ancre?: string;
  /** Les filtres de la page visée : un lien n'est « actif » que si ces filtres sont ceux de l'adresse courante. */
  filtresCible?: string[];
  /** La source d'une image : une chaîne JSX (`"logo.png"`) ou une expression (`{url}`), et son texte de remplacement. */
  source: { jsx: string; expression: string; alt: string };
  decoratif?: boolean;
  /** L'état d'un champ, la fonction qui le change, et ce qu'il reçoit (« se connecter avec … »). */
  champ: {
    variable: string;
    setter: string;
    genre?: 'email' | 'motDePasse';
    /** La sorte et les options, quand le programme en écrit. */
    saisie?: Saisie;
    /** Un choix ou une liste déroulante : l'expression de la liste des valeurs. */
    valeurs?: string;
    /** Une saisie d'une ligne d'un formulaire qui a sa soumission : la touche du clavier l'envoie. */
    envoie?: boolean;
    /** Une liste déroulante écrite à la main : l'état qui dit si elle est ouverte. */
    ouvert?: { variable: string; setter: string };
  };
  /** Un bouton d'un formulaire, sans clic propre : il envoie le formulaire. */
  envoie?: boolean;
  /** Une image : sa source, sa description et ses réglages (plan des médias, 4.2). */
  image?: ImageProduite;
}

/** Une image prête à écrire. */
export interface ImageProduite {
  /** La copie du fichier local, relative au dossier des images du projet (« salle.jpg »). */
  locale?: string;
  /** La source telle qu'écrite dans le programme, en expression (une adresse, une donnée). */
  expression: string;
  /** La description en attribut JSX (`"…"` ou `{…}`) et en expression ; `""` pour une image décorative. */
  alt: { jsx: string; expression: string; decorative: boolean };
  /** Les dimensions lues dans le fichier local. */
  largeur?: number;
  hauteur?: number;
  proportions?: [number, number];
  prioritaire?: boolean;
}

/** `<img>` sur le web : dimensions, chargement différé (sauf prioritaire), décodage à part, proportions. */
function imageWeb(image: ImageProduite, attributs: string): string {
  const src = image.locale !== undefined ? JSON.stringify(`/images/${image.locale}`) : `{${image.expression}}`;
  const dimensions = image.largeur && image.hauteur ? ` width={${image.largeur}} height={${image.hauteur}}` : '';
  const chargement = image.prioritaire ? ' fetchPriority="high"' : ' loading="lazy"';
  const proportions = image.proportions ? ` style={{ aspectRatio: '${image.proportions[0]} / ${image.proportions[1]}' }}` : '';
  // Une image décorative est sautée par les lecteurs d'écran : alt vide et aria-hidden.
  const cachee = image.alt.decorative ? ' aria-hidden="true"' : '';
  return `<img src=${src} alt=${image.alt.jsx}${cachee}${dimensions}${chargement} decoding="async" ${attributs}${proportions} />`;
}

/** Ce que le web écrit pour chaque sorte de champ d'une ligne : le type et l'aide du navigateur. */
const TYPES_WEB: Record<string, string> = {
  texte: '',
  email: ' type="email" autoComplete="email"',
  telephone: ' type="tel" autoComplete="tel"',
  nombre: ' type="number"',
  date: ' type="date"',
  heure: ' type="time"',
  motDePasse: ' type="password" autoComplete="new-password"',
  adresseWeb: ' type="url" autoComplete="url"',
};

/** L'étoile d'un champ obligatoire, cachée aux lecteurs d'écran (ils lisent « required »). */
const ETOILE_WEB = '<span className="humalis-obligatoire" aria-hidden="true"> *</span>';

/** Un champ sur le web : <input>, <textarea>, case, boutons radio ou <select>, selon sa sorte. */
function champWeb(el: ElementProduit, a: string): string {
  const { variable: v, setter, saisie } = el.champ;
  const sorte = saisie?.sorte ?? 'texte';
  // Le libellé et son étoile restent sur la même ligne (le libellé est en colonne, au-dessus de la saisie).
  const libelle = saisie?.obligatoire ? `<span>${el.contenu}${ETOILE_WEB}</span>` : el.contenu;
  const requis = saisie?.obligatoire ? ' required' : '';
  const indice = saisie?.indice !== undefined ? ` placeholder=${saisie.indiceLangues ? `{${messageEnCode(saisie.indiceLangues, chaine)}}` : attributTexte(saisie.indice)}` : '';
  const changer = `onChange={(evenement) => ${setter}(evenement.target.value)}`;
  switch (sorte) {
    case 'case':
      return `<label className="humalis-case"><input ${a} type="checkbox"${requis} checked={${v}} onChange={(evenement) => ${setter}(evenement.target.checked)} />${libelle}</label>`;
    case 'choix': {
      // Un groupe de boutons radio : le <fieldset> et sa <legend> le nomment pour les lecteurs d'écran.
      const classes = ['humalis-choix', ...el.options.map((o) => `humalis-${o.nom}-${o.valeur}`), ...el.classes];
      const attributs = [`data-humalis="${el.id}"`, `className="${classes.join(' ')}"`, ...el.evenements].join(' ');
      return `<fieldset ${attributs}><legend>${libelle}</legend>{${el.champ.valeurs}.map((option) => (<label key={option}><input type="radio" name="${el.id}" value={option} checked={${v} === option} onChange={() => ${setter}(option)}${requis} />{option}</label>))}</fieldset>`;
    }
    case 'liste': {
      const premiere = saisie?.indice ?? 'Choisissez…';
      return `<label className="humalis-champ">${libelle}<select ${a}${requis} value={${v}} ${changer}><option value="">${saisie?.indiceLangues ? `{${messageEnCode(saisie.indiceLangues, chaine)}}` : /[{}<>]/.test(premiere) ? `{${chaine(premiere)}}` : premiere}</option>{${el.champ.valeurs}.map((option) => (<option key={option} value={option}>{option}</option>))}</select></label>`;
    }
    case 'texteLong':
      return `<label className="humalis-champ">${libelle}<textarea ${a} rows={4}${indice}${requis} value={${v}} ${changer} /></label>`;
    default: {
      // Les champs de « se connecter » gardent le rôle que le navigateur connaît (username, current-password).
      const genre =
        el.champ.genre === 'motDePasse'
          ? ' type="password" autoComplete="current-password"'
          : el.champ.genre === 'email'
            ? ' type="email" autoComplete="username"'
            : TYPES_WEB[sorte];
      const bornes =
        (saisie?.minimum !== undefined ? ` min={${saisie.minimum}}` : '') + (saisie?.maximum !== undefined ? ` max={${saisie.maximum}}` : '');
      return `<label className="humalis-champ">${libelle}<input ${a}${genre}${bornes}${indice}${requis} value={${v}} ${changer} /></label>`;
    }
  }
}

/** Le rendu web : React DOM et react-router. */
export const RENDU_WEB: Rendu = {
  imports(code) {
    const routeur: string[] = [];
    if (/<Link\b/.test(code)) routeur.push('Link');
    if (/\buseNavigate\(/.test(code)) routeur.push('useNavigate');
    if (/\buseLocation\(/.test(code)) routeur.push('useLocation');
    if (/\buseParams\(/.test(code)) routeur.push('useParams');
    if (/\buseSearchParams\(/.test(code)) routeur.push('useSearchParams');
    if (/<Outlet\b/.test(code)) routeur.push('Outlet');
    if (/\buseOutlet\(/.test(code)) routeur.push('useOutlet');
    return routeur.length ? [`import { ${routeur.join(', ')} } from 'react-router';`] : [];
  },
  parametres: (noms) => `const { ${noms.map((n) => `${camel(n)} = ''`).join(', ')} } = useParams();`,
  adresse: adresseParMorceaux,
  navigateur: 'const naviguer = useNavigate();',
  naviguer: (chemin) => `naviguer(${chemin});`,
  enveloppe: { page: ['<main className="humalis-page">', '</main>'], composant: ['<>', '</>'] },
  evenements: { clic: 'onClick', survol: 'onMouseEnter' },
  element(el) {
    const attributs = [`data-humalis="${el.id}"`];
    // Les styles nommés d'abord, puis les classes CSS de l'utilisateur.
    const classes = [...el.options.map((o) => `humalis-${o.nom}-${o.valeur}`), ...el.classes];
    if (classes.length > 0) attributs.push(`className="${classes.join(' ')}"`);
    if (el.ancre !== undefined) attributs.push(`id=${JSON.stringify(el.ancre)}`);
    attributs.push(...el.evenements);
    const a = attributs.join(' ');
    switch (el.genre) {
      case 'titre':
      case 'soustitre':
        return `<h${el.niveau} ${a}>${el.contenu}</h${el.niveau}>`;
      case 'texte':
        return `<p ${a}>${el.contenu}</p>`;
      case 'bouton':
        // Le bouton d'un formulaire l'envoie (Entrée aussi) ; un bouton qui a son propre clic garde son clic.
        return `<button type="${el.envoie ? 'submit' : 'button'}" ${a}>${el.contenu}</button>`;
      case 'lien': {
        if (el.externe !== undefined) {
          return `<a href=${JSON.stringify(el.externe)}${el.nouvelOnglet ? ' target="_blank" rel="noopener noreferrer"' : ''} ${a}>${el.contenu}</a>`;
        }
        const filtres = el.filtresCible?.length ? ` filtres={[${el.filtresCible.map((f) => JSON.stringify(f)).join(', ')}]}` : '';
        return `<Lien to=${el.versExpression ? `{${el.versExpression}}` : JSON.stringify(el.vers)}${filtres}${el.nouvelOnglet ? ' target="_blank" rel="noopener noreferrer"' : ''} ${a}>${el.contenu}</Lien>`;
      }
      case 'image':
        return el.image ? imageWeb(el.image, a) : `<img src=${el.source.jsx} alt=${JSON.stringify(el.source.alt)}${el.decoratif ? ' aria-hidden="true"' : ''} ${a} />`;
      case 'champ':
        return champWeb(el, a);
    }
  },
  // Une vraie balise <form> : Entrée dans un champ, ou le bouton, l'envoie. Les
  // vérifications sont celles de Humalis (messages en français) : noValidate.
  formulaire: {
    ouvrir: (id, soumettre) =>
      `<form data-humalis="${id}" className="humalis-formulaire" noValidate onSubmit={${
        soumettre === undefined
          ? '(evenement) => evenement.preventDefault()'
          : `(evenement) => { evenement.preventDefault(); void ${soumettre.includes('(') ? soumettre : `${soumettre}()`}; }`
      }}>`,
    fermer: '</form>',
  },
  // Une section est une partie de page ; les autres blocs, des boîtes pour le CSS.
  bloc: {
    ouvrir: (genre, options, classes, ancre) => {
      const toutes = [`humalis-${genre}`, ...options.map((o) => `humalis-${o.nom}-${o.valeur}`), ...classes];
      const balise = genre === 'section' ? 'section' : genre === 'menu' ? 'nav' : 'div';
      return `<${balise} className="${toutes.join(' ')}"${ancre !== undefined ? ` id=${JSON.stringify(ancre)}` : ''}>`;
    },
    fermer: (genre) => (genre === 'section' ? '</section>' : genre === 'menu' ? '</nav>' : '</div>'),
  },
  soumission: {},
  widgets: WIDGETS_WEB,
  entree: 'onKeyDown',
  annonce: 'aria-live="polite" aria-atomic="true"',
  voirPlus: (nom, bouton) => [
    `<div ref={${nom}.sentinelle} className="humalis-sentinelle" aria-hidden="true" />`,
    ...(bouton === null
      ? []
      : [`<button type="button" className="humalis-voir-plus" disabled={${nom}.enCours} aria-busy={${nom}.enCours} onClick={() => void ${nom}.charger()}>${bouton}</button>`]),
  ],
  deplacement: {
    ouvrir: '<div role="list" className="humalis-liste-deplacable">',
    element: (nom, index) => [`<div role="listitem" {...${nom}.element(${index})}>`, '</div>'],
    // Ce qui se passe au clavier est dit au lecteur d'écran.
    fermer: (nom) => ['</div>', `<p className="humalis-annonce-cachee" aria-live="assertive">{${nom}.annonce}</p>`],
  },
  // Le raccourci est annoncé (aria-keyshortcuts) et visible au survol (title).
  raccourci(touches, libelle) {
    const { aria, texte } = decrireTouches(touches);
    return `aria-keyshortcuts="${aria}" title=${attributTexte(libelle ? `${libelle} (${texte})` : texte)}`;
  },
};

export interface PageProduite {
  composant: string;
  code: string;
  titre: string;
  description: string;
  /** Vrai si la page lit ou change la session (« se connecter », « utilisateur est … »). */
  session: boolean;
}

/**
 * Traduit un écran de la représentation intermédiaire en un composant
 * React lisible : un état par variable, une fonction par événement, et
 * le JSX de la vue.
 */
export function genererEcran(
  ecran: Ecran,
  chemins: Map<string, string>,
  application: ContexteApplication = { partages: [], cle: 'humalis', modulesComposants: new Map(), donnees: [] },
  parametres?: { nom: string; type: TypeValeur }[],
): PageProduite {
  return new GenerateurEcran(ecran, chemins, application, parametres).generer();
}

/** Ce que les pages partagent : variables partagées, clé de mémoire, composants. */
export interface ContexteApplication {
  partages: Etat[];
  /** Le début des clés du stockage du navigateur (« humalis:boutique »). */
  cle: string;
  /** Nom d'un composant → son module dans src/composants (« Carte »). */
  modulesComposants: Map<string, string>;
  /** Les données du serveur du même fichier (« produit »). */
  donnees: string[];
  /** La plateforme : le web par défaut. */
  rendu?: Rendu;
  /** Les fonctions écrites en haut du fichier (humalis/fonctions.ts). */
  fonctions?: string[];
  /** Les filtres d'adresse de chaque page, pour écrire les liens (?categorie=…). */
  filtres?: Map<string, { nom: string; nombre?: boolean }[]>;
  /** Les fichiers locaux lus par la commande (dimensions des images). */
  medias?: Map<string, InfoMedia>;
  /** Le bloc « site » (ou un « apercu ») : chaque page pose ses balises de partage. */
  publication?: { site?: SiteRI; adresse: string };
  /** Les langues du site (bloc « langues ») : les textes à versions passent par t(). */
  langues?: LangueRI[];
}

/**
 * humalis/fonctions.ts : les fonctions écrites en haut du fichier (décision
 * L2), des fonctions TypeScript que les pages importent.
 */
export function genererFonctions(fonctions: FonctionRI[], application: ContexteApplication): string {
  const generateur = new GenerateurEcran({ nom: 'fonctions', etat: [], calculs: [], vue: [], gestionnaires: [], ligne: 0 }, new Map(), application);
  const corps = fonctions.map((f) => generateur.fonction(f)).join('\n');
  const outils = ['accorder', 'formaterArgent', 'formaterDate', 'formaterNombre', 'retirerPremier'].filter((o) => new RegExp(`\\b${o}\\(`).test(corps));
  // Un texte à versions (« t({ fr, en }) ») : la langue courante, sans crochet (une fonction n'est pas un composant).
  const langue = application.langues && /\bt\(\{/.test(corps) ? `import { t } from './langue';\n` : '';
  const entete = `// Produit par Humalis : les fonctions écrites en haut du fichier.\n${outils.length ? `import { ${outils.join(', ')} } from './outils';\n` : ''}${langue}`;
  return `${entete}\n${corps}`;
}

class GenerateurEcran {
  private readonly contexte: Contexte = { types: new Map(), champs: new Map(), sortes: new Map() };
  /** Les champs qui ont une sorte ou des options, et le libellé de chaque champ (pour les messages). */
  private readonly saisies = new Map<string, Saisie>();
  private readonly libelles = new Map<string, string>();
  /** Le libellé de chaque champ dans les autres langues (« Nom » en anglais « Name »), pour ses messages. */
  private readonly libellesLangues = new Map<string, Map<string, string>>();
  /** Chaque formulaire : son nom, ses champs, et l'appel de sa soumission s'il en a une. */
  private readonly formulaires = new Map<string, { nom: string; champs: string[]; soumission?: string }>();
  /** Pour un champ ou un bouton placé dans un formulaire : ce formulaire. */
  private readonly formulaireDe = new Map<string, string>();
  /** Une liste déroulante écrite à la main (le mobile) : l'état qui dit si elle est ouverte. */
  private readonly ouvertes = new Map<string, string>();
  /** Pendant l'écriture d'une soumission qui envoie : la variable du compte des échecs du serveur. */
  private echecs?: string;
  /** Dans « essayer » : le nom du compte des échecs pris avant le bloc. */
  private essai?: string;
  private essais = 0;
  /** Pour chaque champ : sa clé dans les données envoyées (« email »). */
  private readonly clesChamps = new Map<string, string>();
  private readonly montres = new Set<string>();
  private readonly caches = new Set<string>();
  private readonly textesChanges = new Set<string>();
  private readonly attributs = new Map<string, Map<Attribut, string[]>>();
  private readonly fonctions: Fonction[] = [];
  private readonly chargements: Action[][] = [];
  /** Les minuteries écrites dans la page (« apres 3 secondes : ») : elles démarrent à son ouverture. */
  private readonly minuteries: Action[] = [];
  /** « ecrit dans » et « arrete d'ecrire dans » : un effet sur la valeur du champ. */
  private readonly saisiesSuivies: { gestionnaire: Gestionnaire; nom: string }[] = [];
  /** Les raccourcis de la page : « appuie sur "controle+k" » et « avec raccourci ». */
  private readonly raccourcis: string[] = [];
  /** Les fenêtres de la page : fermées au départ, ouvertes par « montrer ». */
  private readonly fenetres = new Set<string>();
  /** « arrive en bas de "x" » : pour chaque bloc, le crochet et le texte du bouton. */
  private readonly basDesBlocs = new Map<string, { nom: string; fonction: string; gestionnaire: Gestionnaire }>();
  /** « quand l'ordre de taches change » : la fonction de chaque liste. */
  private readonly ordres = new Map<string, string>();
  /** Les listes « avec deplacement » de la page. */
  private readonly listesDeplacees: { nom: string }[] = [];
  /** Les lectures écrites dans un événement : « la dernière requête gagne ». */
  private dansEvenement = false;
  private dernieres = 0;
  /** Dans le bloc d'une minuterie (hors d'une boucle) : « arreter » arrête la minuterie. */
  private dansMinuterie = false;
  private readonly nomsPris = new Set<string>();
  private readonly etat = new Set<string>();
  /** Les champs de « se connecter » : le mot de passe devient un champ caché. */
  private readonly champsEmail = new Set<string>();
  private readonly champsMotDePasse = new Set<string>();
  private titreVu = false;
  /** Le nombre de lectures rejouables déjà écrites (charger1, charger2…). */
  private chargeurs = 0;
  private besoins = {
    navigation: false,
    messages: false,
    serveur: false,
    retirer: false,
    fragment: false,
    lien: false,
    memoire: false,
    secret: false,
    partage: false,
    session: false,
    apres: false,
    /** La page lit ou change la langue (« t({ fr, en }) », « changer langue par … »). */
    langue: false,
    /** La page montre une sous-page (« sous page »). */
    sousPage: false,
    /** Les filtres d'adresse : lus et changés dans la requête. */
    filtres: false,
    /** « revenir » : a besoin de l'emplacement courant (location.key). */
    retour: false,
    /** Les aides de src/humalis/navigation.tsx utilisées par la page. */
    aides: new Set<string>(),
  };

  constructor(
    private readonly ecran: Ecran,
    private readonly chemins: Map<string, string>,
    private readonly application: ContexteApplication,
    /** Présents quand l'écran est un composant écrit en Humalis. */
    private readonly parametres?: { nom: string; type: TypeValeur }[],
  ) {}

  private readonly composantsUtilises = new Set<string>();
  /** Les données du serveur nommées dans les types écrits par la page. */
  private readonly donneesTypees = new Set<string>();

  /** Le type TypeScript, en notant les interfaces de données à importer. */
  private typer(type: TypeValeur): string {
    for (let t = type; ; t = t.de) {
      if (t.genre === 'donnee') this.donneesTypees.add(t.nom);
      if (t.genre !== 'liste') break;
    }
    return typeTS(type);
  }
  private typesDonnees: string[] = [];
  private get rendu(): Rendu {
    return this.application.rendu ?? RENDU_WEB;
  }

  generer(): PageProduite {
    for (const e of [...this.application.partages, ...this.ecran.etat]) {
      this.contexte.types.set(e.nom, e.type);
      this.etat.add(e.nom);
    }
    for (const c of this.ecran.calculs) this.contexte.types.set(c.nom, c.type);
    for (const p of this.ecran.parametresAdresse ?? []) this.contexte.types.set(p, { genre: 'texte' });
    for (const f of this.ecran.filtres ?? []) this.contexte.types.set(f.nom, { genre: f.nombre ? 'nombre' : 'texte' });
    this.contexte.facultatives = new Set([
      ...[...this.ecran.etat, ...this.ecran.calculs].filter((e) => e.facultatif).map((e) => e.nom),
      ...(this.ecran.filtres ?? []).map((f) => f.nom),
    ]);
    for (const p of this.parametres ?? []) this.contexte.types.set(p.nom, p.type);

    this.recenser(this.ecran.vue, []);
    for (const g of this.ecran.gestionnaires) this.enregistrer(g, []);

    const composant = pascal(this.ecran.nom);
    const { titre, description } = titreEtDescription(this.ecran);

    // Un composant reçoit ses paramètres comme des propriétés React, et ne
    // change pas le titre de la page qui l'affiche.
    const signature = this.parametres
      ? `{ ${this.parametres.map((p) => camel(p.nom)).join(', ')} }: { ${this.parametres.map((p) => `${camel(p.nom)}: ${this.typer(p.type)}`).join('; ')} }`
      : '';
    const corps = new Ecrivain();
    corps.bloc(`export default function ${composant}(${this.parametres?.length ? signature : ''}) {`, () => {
      this.ecrireEtat(corps);
      if (!this.parametres) {
        // Une page qui montre une sous-page lui cède le titre ; une sous-page lit son propre titre.
        if (this.besoins.sousPage) corps.ligne('const sousPageActive = useOutlet() !== null;');
        const options = [...(this.ecran.parent !== undefined ? ['sousPage: true'] : []), ...(this.besoins.sousPage ? ['cede: sousPageActive'] : [])];
        corps.ligne(
          this.application.publication
            ? this.usePagePublie(titre, description, options)
            : `usePage(${this.traduit('titre') ?? chaine(titre)}, ${this.traduit('texte') ?? chaine(description)}${options.length ? `, { ${options.join(', ')} }` : ''});`,
        );
      }
      this.ecrireChargements(corps);
      this.ecrireMinuteries(corps);
      this.ecrireSaisies(corps);
      if (this.raccourcis.length > 0) {
        corps.ligne();
        corps.bloc('useRaccourcis([', () => this.raccourcis.forEach((r) => corps.ligne(`${r},`)), ']);');
      }
      for (const { nom, fonction, gestionnaire } of this.basDesBlocs.values()) {
        corps.ligne(`const ${nom} = useVoirPlus(${fonction}, ${gestionnaire.tantQue ? condition(gestionnaire.tantQue, this.contexte) : 'true'});`);
      }
      for (const liste of this.listesDeplacees) {
        const nom = `deplacement${pascal(liste.nom)}`;
        const ordre = this.ordres.get(liste.nom);
        corps.ligne(`const ${nom} = useDeplacement(${camel(liste.nom)}, ${setter(liste.nom)}, (element) => String(element)${ordre ? `, ${ordre}` : ''});`);
      }
      for (const fonction of this.fonctions) this.ecrireFonction(corps, fonction);
      corps.ligne();
      corps.ligne('return (');
      // Une page a son enveloppe (<main> sur le web) ; un composant n'est qu'un morceau de page.
      let [ouverture, fermeture] = this.parametres ? this.rendu.enveloppe.composant : this.rendu.enveloppe.page;
      // Une sous-page est dans le <main> de son parent : un <div>, pour n'avoir qu'un seul <main>.
      if (this.ecran.parent !== undefined && !this.parametres && this.application.rendu === undefined) {
        [ouverture, fermeture] = ['<div className="humalis-page humalis-sous-page">', '</div>'];
      }
      corps.indenter(() => {
        corps.ligne(ouverture);
        corps.indenter(() => this.ecrireVue(corps, this.ecran.vue));
        corps.ligne(fermeture);
      });
      corps.ligne(');');
    });

    // Les variables partagées que la page utilise vraiment, lues dans son code.
    let code = corps.texte();
    const utilises = this.application.partages.flatMap((p) =>
      [camel(p.nom), setter(p.nom)].filter((n) => new RegExp(`\\b${n}\\b`).test(code)),
    );
    const lignePartage = utilises.length > 0 ? `  const { ${utilises.join(', ')} } = usePartage();\n` : '';
    this.besoins.partage = utilises.length > 0;
    // La session, quand la page la lit (« utilisateur est … ») ou la change.
    this.besoins.session = /\butilisateur\.(connecte|admin|seConnecter|seDeconnecter)\b/.test(code);
    const ligneSession = this.besoins.session ? '  const utilisateur = useUtilisateur();\n' : '';
    // La langue (« t({ fr, en }) », « si langue est anglais », « changer langue par … »).
    const langue = ['t', 'langue', 'changerLangue'].filter((n) => new RegExp(n === 't' ? '\\bt\\(\\{' : `\\b${n}\\b`).test(code));
    this.besoins.langue = this.application.langues !== undefined && langue.length > 0;
    const ligneLangue = this.besoins.langue ? `  const { ${langue.join(', ')} } = useLangue();\n` : '';
    code = code.replace('  /*PARTAGE*/\n', lignePartage + ligneSession + ligneLangue);
    // Les dernières valeurs, pour ce qui s'exécute plus tard (une minuterie lancée par un clic, le bouton d'un message).
    const lues = [...new Set([...code.matchAll(/\bactuel\.current\.(\w+)/g)].map((m) => m[1]))];
    code = code.replace('  /*ACTUEL*/\n', lues.length > 0 ? `  const actuel = useActuel({ ${lues.join(', ')} });\n` : '');
    // « mouvement est reduit » : suivi en direct (src/humalis/temps.ts).
    code = code.replace(
      '  /*MOUVEMENT*/\n',
      (/\bmouvementReduit\b/.test(code) ? '  const mouvementReduit = useMouvementReduit();\n' : '') +
        // « theme est sombre » : le thème affiché, suivi en direct.
        (/\bthemeSombre\b/.test(code) ? '  const themeSombre = useThemeSombre();\n' : ''),
    );
    // Sur le téléphone, « confirmer » vient d'un crochet : la question est une fenêtre de l'application.
    code = code.replace('  /*CONFIRMER*/\n', this.rendu.confirmationParCrochet && /\bconfirmer\(/.test(code) ? '  const confirmer = useConfirmer();\n' : '');
    code = code.replace('  /*PLANIFIER*/\n', (/\bplanifier\(/.test(code) ? '  const planifier = usePlanifier();\n' : '') + (/\bderniereRequete\(/.test(code) ? '  const derniereRequete = useDerniere();\n' : ''));
    // Les interfaces des données du serveur que la page utilise. Une page
    // qui porte le nom de l'une d'elles (la page et la donnée « avis »)
    // s'appelle PageAvis, pour ne pas cacher l'interface.
    this.typesDonnees = this.application.donnees.filter((d) => this.donneesTypees.has(d)).map(pascal);
    if (this.typesDonnees.includes(composant)) {
      code = code.replace(`export default function ${composant}(`, `export default function Page${composant}(`);
    }

    return { composant, code: this.imports(code) + '\n' + code, titre, description, session: this.besoins.session };
  }

  /** Le premier titre (ou texte) de la page, s'il a des versions : il suit la langue (« t({ fr, en }) »). */
  private traduit(genre: 'titre' | 'texte'): string | undefined {
    const valeur = this.application.langues ? premiereValeur(genre, this.ecran.vue) : undefined;
    return valeur?.type === 'texte' && valeur.versions ? expression(valeur, this.contexte) : undefined;
  }

  // ─── Recensement : champs, cibles des événements, besoins ───────────────

  private recenser(noeuds: NoeudVue[], boucles: Parametre[], formulaire?: string): void {
    for (const noeud of noeuds) {
      switch (noeud.type) {
        case 'element':
          if (noeud.genre === 'champ') {
            const libelle = texteDeBase(noeud.contenu) ?? noeud.id;
            const variable = this.nomUnique(`champ_${simplifier(libelle) || noeud.id}`);
            this.contexte.champs.set(noeud.id, variable);
            this.clesChamps.set(noeud.id, camel(libelle));
            this.libelles.set(noeud.id, libelle);
            this.libellesLangues.set(noeud.id, libellesEnLangues(noeud.contenu));
            if (noeud.saisie) {
              this.saisies.set(noeud.id, noeud.saisie);
              const sorte = noeud.saisie.sorte;
              if (sorte === 'nombre' || sorte === 'case') this.contexte.sortes?.set(noeud.id, sorte);
              if (sorte === 'liste' && this.rendu.listeAOuvrir) {
                this.ouvertes.set(noeud.id, this.nomUnique(`ouvert_${simplifier(libelle) || noeud.id}`));
              }
            }
            if (formulaire !== undefined) this.formulaires.get(formulaire)?.champs.push(noeud.id);
          }
          if (formulaire !== undefined && (noeud.genre === 'champ' || noeud.genre === 'bouton')) {
            this.formulaireDe.set(noeud.id, formulaire);
          }
          if (noeud.genre === 'lien') this.besoins.lien = true;
          // « avec raccourci » : la touche clique le bouton ou le lien, ou met le focus dans le champ.
          if (noeud.raccourci !== undefined && this.rendu.raccourci) {
            this.raccourcis.push(`[${chaine(noeud.raccourci)}, () => ${noeud.genre === 'champ' ? 'focaliser' : 'cliquer'}(${chaine(noeud.id)})]`);
          }
          break;
        case 'formulaire':
          this.formulaires.set(noeud.id, { nom: noeud.nom, champs: [] });
          this.recenser(noeud.corps, boucles, noeud.id);
          break;
        case 'bloc':
          this.recenser(noeud.corps, boucles, formulaire);
          break;
        case 'sousPage':
          this.besoins.sousPage = true;
          break;
        case 'fenetre':
          this.fenetres.add(noeud.id);
          this.recenser(noeud.corps, boucles, formulaire);
          break;
        case 'condition':
          this.recenser(noeud.alors, boucles, formulaire);
          this.recenser(noeud.sinon, boucles, formulaire);
          break;
        case 'repetition': {
          this.besoins.fragment = true;
          if (noeud.deplacement && noeud.liste.type === 'variable') this.listesDeplacees.push({ nom: noeud.liste.nom });
          this.contexte.types.set(noeud.variable, noeud.typeVariable);
          const dedans = [...boucles, { nom: noeud.variable, type: noeud.typeVariable }];
          this.recenser(noeud.corps, dedans, formulaire);
          for (const g of noeud.gestionnaires) this.enregistrer(g, dedans);
          break;
        }
        case 'locale':
          this.contexte.types.set(noeud.nom, noeud.typeValeur);
          break;
        case 'composant':
          this.composantsUtilises.add(noeud.nom);
          break;
      }
    }
  }

  private enregistrer(gestionnaire: Gestionnaire, parametres: Parametre[]): void {
    this.parcourirActions(gestionnaire.actions);

    if (gestionnaire.declencheur === 'chargement') {
      this.chargements.push(gestionnaire.actions);
      return;
    }
    if (gestionnaire.declencheur === 'minuterie') {
      this.minuteries.push(...gestionnaire.actions);
      return;
    }
    // « quand l'utilisateur arrive en bas de "catalogue" » : la même fonction pour le bas atteint et le bouton.
    if (gestionnaire.declencheur === 'bas') {
      const id = gestionnaire.cibles[0] ?? '';
      const fonction = this.nomUnique(`quandArriveEnBas${pascal(id.replace(/^bloc_/, ''))}`, false);
      this.fonctions.push({ nom: fonction, parametres, actions: gestionnaire.actions });
      this.basDesBlocs.set(id, { nom: this.nomUnique(`voir_plus_${id.replace(/^bloc_/, '')}`), fonction, gestionnaire });
      return;
    }
    // « quand l'ordre de taches change » : une fois par déplacement terminé.
    if (gestionnaire.declencheur === 'ordre') {
      const fonction = this.nomUnique(`quandOrdreChange${pascal(gestionnaire.variable ?? '')}`, false);
      this.fonctions.push({ nom: fonction, parametres, actions: gestionnaire.actions });
      this.ordres.set(gestionnaire.variable ?? '', fonction);
      return;
    }
    // « quand l'utilisateur appuie sur "controle+k" » : rien sur une plateforme sans clavier.
    if (gestionnaire.declencheur === 'touche') {
      if (!this.rendu.raccourci || gestionnaire.touches === undefined) return;
      const nom = this.nomUnique(`quandAppuie${pascal(gestionnaire.touches.replace(/\+/g, '_').replace(/[^a-z0-9_]/g, '_'))}`, false);
      this.fonctions.push({ nom, parametres, actions: gestionnaire.actions });
      const dans = gestionnaire.cibles[0];
      this.raccourcis.push(`[${chaine(gestionnaire.touches)}, ${nom}${dans !== undefined ? `, ${chaine(dans)}` : ''}]`);
      return;
    }
    // « arrete d'ecrire dans "recherche" » : la touche Entrée n'attend pas la pause.
    if (gestionnaire.declencheur === 'saisie' || gestionnaire.declencheur === 'pauseSaisie') {
      const id = gestionnaire.cibles[0] ?? '';
      const nom = this.nomUnique(`${gestionnaire.declencheur === 'saisie' ? 'frappe' : 'pause'}_${sansGenre(id)}`);
      this.saisiesSuivies.push({ gestionnaire, nom });
      if (gestionnaire.declencheur === 'pauseSaisie') {
        const parAttribut = this.attributs.get(id) ?? new Map<Attribut, string[]>();
        parAttribut.set(this.rendu.entree, [`${nom}.entree`]);
        this.attributs.set(id, parAttribut);
      }
      return;
    }
    // « quand le formulaire "message" est soumis » : la fonction quandSoumisMessage,
    // appelée par le formulaire (Entrée, bouton), qui vérifie ses champs, puis les vide.
    if (gestionnaire.declencheur === 'soumission') {
      const id = gestionnaire.cibles[0] ?? '';
      const formulaire = this.formulaires.get(id);
      if (!formulaire) return;
      const nom = this.nomUnique(`quandSoumis${pascal(formulaire.nom)}`, false);
      this.fonctions.push({ nom, parametres, actions: gestionnaire.actions, formulaire: id });
      formulaire.soumission = parametres.length === 0 ? nom : `${nom}(${parametres.map((p) => camel(p.nom)).join(', ')})`;
      if (formulaire.champs.some((c) => this.verifications(c).length > 0)) this.besoins.messages = true;
      return;
    }
    // Un événement qui n'existe pas sur la plateforme (le survol sur un téléphone).
    if (gestionnaire.declencheur !== 'clic' && gestionnaire.declencheur !== 'survol') return;
    const attribut = this.rendu.evenements[gestionnaire.declencheur];
    if (attribut === undefined) return;

    const verbe = gestionnaire.declencheur === 'clic' ? 'Clique' : 'Survole';
    const cible = gestionnaire.cibles[0] ?? '';
    const nom = this.nomUnique(`quand${verbe}${pascal(sansGenre(cible))}`, false);
    this.fonctions.push({ nom, parametres, actions: gestionnaire.actions });

    const appel =
      parametres.length === 0 ? nom : `${nom}(${parametres.map((p) => camel(p.nom)).join(', ')})`;
    for (const id of gestionnaire.cibles) {
      const parAttribut = this.attributs.get(id) ?? new Map<Attribut, string[]>();
      parAttribut.set(attribut, [...(parAttribut.get(attribut) ?? []), appel]);
      this.attributs.set(id, parAttribut);
    }
  }

  private parcourirActions(actions: Action[]): void {
    for (const action of actions) {
      switch (action.type) {
        case 'message':
          this.besoins.messages = true;
          if (action.action) this.parcourirActions(action.action.actions);
          break;
        case 'copie':
          if (action.message !== null) this.besoins.messages = true;
          break;
        case 'partage':
          this.besoins.messages = true;
          break;
        case 'minuterie':
        case 'confirmation':
          for (const liste of sousActions(action)) this.parcourirActions(liste);
          break;
        case 'visibilite':
          for (const id of action.ids) (action.visible ? this.montres : this.caches).add(id);
          break;
        case 'changerTexte':
          for (const id of action.ids) this.textesChanges.add(id);
          break;
        case 'navigation': {
          this.besoins.navigation = true;
          if (action.continuer) this.besoins.apres = true;
          const page = texteLitteral(action.ecran);
          if (page === undefined) {
            // Une adresse reçue : page ou adresse externe, vérifiée au moment d'y aller.
            this.besoins.aides.add('allerVers');
            this.besoins.messages = true;
          } else if (lireCible(page).externe) {
            this.besoins.aides.add('ouvrirExterne');
          }
          if (action.arguments?.length) this.besoins.aides.add('adresseAvecFiltres');
          break;
        }
        case 'filtre':
          this.besoins.filtres = true;
          this.besoins.aides.add('changerFiltre');
          break;
        case 'retour':
          this.besoins.navigation = true;
          this.besoins.retour = true;
          this.besoins.aides.add('revenirEnArriere');
          break;
        case 'requete':
        case 'suppression':
        case 'modification':
          this.besoins.serveur = true;
          break;
        case 'envoiFichier':
          this.besoins.messages = true;
          break;
        case 'retrait':
          this.besoins.retirer = true;
          break;
        case 'connexion':
          for (const [champ, ids] of [[action.email, this.champsEmail], [action.motDePasse, this.champsMotDePasse]] as const) {
            if (champ.type === 'champ') ids.add(champ.id);
          }
          break;
        case 'locale':
          this.contexte.types.set(action.nom, action.typeValeur);
          break;
        case 'si':
          this.parcourirActions(action.alors);
          this.parcourirActions(action.sinon);
          break;
        case 'repetition':
          this.contexte.types.set(action.variable, action.typeVariable);
          this.parcourirActions(action.corps);
          break;
        case 'tantQue':
        case 'repeter':
        case 'selon':
          for (const liste of sousActions(action)) this.parcourirActions(liste);
          break;
        case 'essayer':
          this.contexte.types.set('raison', { genre: 'texte' });
          for (const liste of sousActions(action)) this.parcourirActions(liste);
          break;
      }
    }
  }

  private nomUnique(base: string, enCamel = true): string {
    const nom = enCamel ? camel(base) : base;
    let resultat = nom;
    for (let n = 2; this.nomsPris.has(resultat); n++) resultat = `${nom}${n}`;
    this.nomsPris.add(resultat);
    return resultat;
  }

  // ─── En-tête du composant ───────────────────────────────────────────────

  private imports(code: string): string {
    const react: string[] = [];
    if (this.besoins.fragment) react.push('Fragment');
    if (this.chargements.length > 0) react.push('useEffect');
    if (this.aDeLEtat() || (this.ecran.etatsRequetes?.length ?? 0) > 0) react.push('useState');
    if ((this.ecran.etatsRequetes?.length ?? 0) > 0) react.push('useRef');

    const lignes: string[] = [];
    if (react.length) lignes.push(`import { ${react.join(', ')} } from 'react';`);
    lignes.push(...this.rendu.imports(code));
    lignes.push(...this.rendu.widgets.imports(code));
    if (this.besoins.messages) lignes.push(`import { useMessages } from '../humalis/messages';`);
    const outils = [
      ...['accorder', 'dateDuJour', 'decalerDate', 'formaterArgent', 'formaterDate', 'formaterDepuis', 'formaterNombre', 'formaterTaille', 'grouper', 'joursEntre', 'maintenant'].filter((o) => new RegExp(`\\b${o}\\(`).test(code)),
      ...(this.besoins.retirer ? ['retirerPremier'] : []),
    ];
    if (outils.length) lignes.push(`import { ${outils.join(', ')} } from '../humalis/outils';`);
    const fonctions = (this.application.fonctions ?? []).map(camel).filter((f) => new RegExp(`\\b${f}\\(`).test(code)).sort();
    if (fonctions.length) lignes.push(`import { ${fonctions.join(', ')} } from '../humalis/fonctions';`);
    const crochets = [...(this.besoins.memoire ? ['useMemorise'] : []), ...(this.besoins.secret ? ['useMemoriseSecret'] : [])];
    if (crochets.length) lignes.push(`import { ${crochets.join(', ')} } from '../humalis/memoire';`);
    if (!this.parametres) lignes.push(`import { usePage } from '../humalis/page';`);
    if (this.besoins.partage) lignes.push(`import { usePartage } from '../humalis/partage';`);
    if (this.besoins.serveur) lignes.push(`import { useServeur } from '../humalis/serveur';`);
    if (this.besoins.apres) lignes.push(`import { apresLaGarde } from '../humalis/reservee';`);
    if (this.application.rendu === undefined) {
      const aides = ['Lien', 'adresseAvecFiltres', 'allerVers', 'changerFiltre', 'lireFiltre', 'lireFiltreNombre', 'ouvrirExterne', 'revenirEnArriere'].filter((a) =>
        new RegExp(a === 'Lien' ? '<Lien\\b' : `\\b${a}\\(`).test(code),
      );
      if (aides.length) lignes.push(`import { ${aides.join(', ')} } from '../humalis/navigation';`);
    }
    if ((this.ecran.etatsRequetes?.length ?? 0) > 0) lignes.push(`import { REPOS, type EtatRequete } from '../humalis/sources';`);
    if (this.besoins.session) lignes.push(`import { useUtilisateur } from '../humalis/session';`);
    if (this.besoins.langue) {
      // Le sélecteur et le crochet viennent du même fichier : une seule ligne.
      const selecteur = lignes.indexOf(`import { SelecteurLangue } from '../humalis/langue';`);
      if (selecteur >= 0) lignes[selecteur] = `import { SelecteurLangue, useLangue } from '../humalis/langue';`;
      else lignes.push(`import { useLangue } from '../humalis/langue';`);
    }
    if (/\bdefinirTheme\(/.test(code)) lignes.push(`import { definirTheme } from '../humalis/theme';`);
    lignes.push(...importsDesInteractions(code, '../humalis'));
    if (this.typesDonnees.length > 0) {
      lignes.push(`import type { ${this.typesDonnees.join(', ')} } from '../humalis/donnees';`);
    }
    const dossier = this.parametres ? '.' : '../composants';
    for (const nom of this.composantsUtilises) {
      lignes.push(`import ${nom} from '${dossier}/${this.application.modulesComposants.get(nom) ?? nom}';`);
    }
    return lignes.join('\n') + '\n';
  }

  private aDeLEtat(): boolean {
    return (
      this.ecran.etat.some((e) => !e.memorisee) ||
      this.contexte.champs.size > 0 ||
      this.montres.size + this.caches.size + this.fenetres.size > 0 ||
      this.textesChanges.size > 0
    );
  }

  private ecrireEtat(e: Ecrivain): void {
    if (this.rendu.debut) e.ligne(this.rendu.debut);
    if (this.ecran.parametresAdresse?.length) e.ligne(this.rendu.parametres(this.ecran.parametresAdresse));
    // Les filtres d'adresse : la requête de l'adresse est la source de vérité (?categorie=…).
    if (this.ecran.filtres?.length) {
      e.ligne('const [filtresAdresse, setFiltresAdresse] = useSearchParams();');
      for (const f of this.ecran.filtres) {
        e.ligne(`const ${camel(f.nom)} = ${f.nombre ? 'lireFiltreNombre' : 'lireFiltre'}(filtresAdresse, ${chaine(f.nom)});`);
      }
    }
    e.ligne('/*PARTAGE*/');
    e.ligne('/*MOUVEMENT*/');
    for (const etat of this.ecran.etat) {
      // Une variable « = rien » attend sa valeur : son type admet null.
      const annotation = etat.facultatif
        ? `<${this.typer(etat.type)} | null>`
        : besoinAnnotation(etat.type)
          ? `<${this.typer(etat.type)}>`
          : '';
      const initiale = expression(etat.initiale, this.contexte);
      if (etat.memorisee) {
        // Gardée dans le navigateur (ou le téléphone), sous une clé propre à
        // la page ; un secret, seulement sur le mobile, dans son coffre.
        if (etat.secret) this.besoins.secret = true;
        else this.besoins.memoire = true;
        const crochet = etat.secret ? 'useMemoriseSecret' : 'useMemorise';
        const cle = `${this.application.cle}:${simplifier(this.ecran.nom)}:${simplifier(etat.nom)}`;
        e.ligne(`const [${camel(etat.nom)}, ${setter(etat.nom)}] = ${crochet}${annotation}(${chaine(cle)}, ${initiale});`);
      } else {
        e.ligne(`const [${camel(etat.nom)}, ${setter(etat.nom)}] = useState${annotation}(${initiale});`);
      }
    }
    for (const [id, variable] of this.contexte.champs) {
      // Une case à cocher vaut vrai ou faux ; les autres champs, le texte écrit.
      e.ligne(`const [${variable}, ${setterDe(variable)}] = useState(${this.vide(id)});`);
      const ouvert = this.ouvertes.get(id);
      if (ouvert) e.ligne(`const [${ouvert}, ${setterDe(ouvert)}] = useState(false);`);
    }
    const visibles = [...new Set([...this.montres, ...this.caches, ...this.fenetres])];
    if (visibles.length > 0) {
      // Un élément que l'on montre est caché au départ ; un élément que
      // l'on cache seulement est visible au départ ; une fenêtre est fermée.
      const initiales = visibles.map((id) => `${chaine(id)}: ${!this.montres.has(id) && !this.fenetres.has(id)}`).join(', ');
      e.ligne(`const [visibilite, setVisibilite] = useState<Record<string, boolean>>({ ${initiales} });`);
    }
    if (this.textesChanges.size > 0) {
      e.ligne('const [textes, setTextes] = useState<Record<string, string>>({});');
    }
    for (const calcul of this.ecran.calculs) {
      e.ligne(`const ${camel(calcul.nom)} = ${expression(calcul.valeur, this.contexte)};`);
    }
    if (this.besoins.navigation) e.ligne(this.rendu.navigateur);
    if (this.besoins.apres || this.besoins.retour) e.ligne('const location = useLocation();');
    if (this.besoins.messages) e.ligne('const { afficherMessage } = useMessages();');
    if (this.besoins.serveur) e.ligne('const serveur = useServeur();');
    e.ligne('/*CONFIRMER*/');
    e.ligne('/*ACTUEL*/');
    e.ligne('/*PLANIFIER*/');
    // L'état de la requête de chaque variable dont la page parle, et de quoi la recharger.
    const suivies = this.ecran.etatsRequetes ?? [];
    if (suivies.length > 0) {
      for (const nom of suivies) e.ligne(`const [${camel(nom)}Req, set${pascal(nom)}Req] = useState<EtatRequete>(REPOS);`);
      e.ligne('const relances = useRef<Record<string, (() => Promise<void>) | undefined>>({});');
    }
  }

  // ─── Gestionnaires ──────────────────────────────────────────────────────

  /**
   * L'appel de usePage avec le bloc « site » (plan qualité et publication, partie 3) :
   * l'aperçu de la page gagne, sinon son premier titre et son premier texte, sinon le site.
   */
  private usePagePublie(titre: string, description: string, options: string[]): string {
    const { site, adresse } = this.application.publication!;
    const apercu = this.ecran.apercu;
    // Avec des langues, le nom et la description du site suivent la langue courante (« t({ fr, en }) »).
    const siteEn = (code: string): SiteRI | undefined =>
      site ? { ...site, nom: site.nomLangues?.find((v) => v.code === code)?.texte ?? site.nom } : site;
    const titreLitteral = (lu: string): string =>
      site?.nomLangues ? messageEnCode(site.nomLangues.map(({ code }) => ({ code, texte: titreComplet(lu, siteEn(code)) })), chaine) : chaine(titreComplet(lu, site));
    const suffixe = (): string =>
      site?.nomLangues ? messageEnCode(site.nomLangues.map(({ code, texte }) => ({ code, texte: ` | ${texte}` })), chaine) : chaine(` | ${site!.nom}`);
    const enCode = (valeur: Valeur | undefined, complet = false): string | undefined => {
      if (!valeur) return undefined;
      const lu = texteLitteral(valeur);
      if (lu !== undefined) return complet ? titreLitteral(lu) : chaine(lu);
      const code = expression(valeur, this.contexte);
      return complet && site?.nom ? `${code} + ${suffixe()}` : code;
    };
    const titreCode = enCode(apercu?.titre ?? premiereValeur('titre', this.ecran.vue), true) ?? titreLitteral(titre);
    const descriptionCode =
      enCode(apercu?.description ?? premiereValeur('texte', this.ecran.vue)) ??
      (site?.descriptionLangues ? messageEnCode(site.descriptionLangues, chaine) : chaine(site?.description ?? description));
    const chemin = this.chemins.get(this.ecran.nom) ?? `/${simplifier(this.ecran.nom)}`;
    const image = apercu?.image ?? (site?.image !== undefined ? ({ type: 'texte', parties: [{ texte: site.image }] } as Valeur) : undefined);
    const imageLue = image && texteLitteral(image);
    const reglages = [
      // L'adresse complète d'une page à paramètre dépend des données : pas de lien canonique.
      ...(site && !chemin.includes(':') ? [`adresse: ${chaine(sansBarreFinale(adresse) + chemin)}`] : []),
      ...(imageLue !== undefined ? (adresseImage(imageLue, adresse) ? [`image: ${chaine(adresseImage(imageLue, adresse)!)}`] : []) : image ? [`image: ${enCode(image)}`] : []),
      ...(apercu?.indexation === false || site?.indexation === false || this.ecran.reservee || this.ecran.nom === 'introuvable' ? ['noindex: true'] : []),
      ...options,
    ];
    return `usePage(${titreCode}, ${descriptionCode}${reglages.length ? `, { ${reglages.join(', ')} }` : ''});`;
  }

  private ecrireChargements(e: Ecrivain): void {
    for (const actions of this.chargements) {
      const corps = new Ecrivain();
      if (contientRequete(actions)) {
        corps.bloc('async function auChargement() {', () => this.ecrireActionsSuivies(corps, actions, new Set()));
        corps.ligne('void auChargement();');
      } else {
        this.ecrireActionsSuivies(corps, actions, new Set());
      }
      // Un chargement qui lit la session attend la réponse de /auth/me :
      // sinon un admin déjà connecté serait pris pour un visiteur.
      const session = /\butilisateur\.(connecte|admin)\b/.test(corps.texte());
      e.ligne();
      e.bloc('useEffect(() => {', () => {
        if (session) e.ligne('if (!utilisateur.pret) return;');
        for (const ligne of corps.texte().replace(/\n$/, '').split('\n')) e.ligne(ligne);
      }, session ? '}, [utilisateur.pret]);' : '}, []);');
    }
  }

  private ecrireFonction(e: Ecrivain, fonction: Fonction): void {
    const parametres = fonction.parametres.map((p) => `${camel(p.nom)}: ${this.typer(p.type)}`).join(', ');
    const asynchrone = contientRequete(fonction.actions) ? 'async ' : '';
    const locales = new Set(fonction.parametres.map((p) => p.nom));
    const formulaire = fonction.formulaire !== undefined ? this.formulaires.get(fonction.formulaire) : undefined;
    e.ligne();
    this.dansEvenement = true;
    e.bloc(`${asynchrone}function ${fonction.nom}(${parametres}) {`, () => {
      if (!formulaire) {
        this.ecrireActionsSuivies(e, fonction.actions, locales);
        return;
      }
      // La soumission d'un formulaire : ses champs sont vérifiés, puis, si
      // tout s'est bien passé, vidés. Une requête refusée arrête l'événement
      // (comme « se connecter ») : les champs restent remplis pour corriger.
      for (const id of formulaire.champs) {
        for (const [test, message] of this.verifications(id)) {
          e.bloc(`if (${test}) {`, () => {
            e.ligne(`afficherMessage(${messageEnCode(message, chaine)}, 'erreur');`);
            e.ligne('return;');
          });
        }
      }
      if (contientEnvoi(fonction.actions)) {
        this.echecs = this.contexte.types.has('echecs') ? 'echecsAvantEnvoi' : 'echecs';
        e.ligne(`const ${this.echecs} = serveur.echecs();`);
      }
      this.ecrireActionsSuivies(e, fonction.actions, locales);
      this.echecs = undefined;
      for (const id of formulaire.champs) {
        const variable = this.contexte.champs.get(id);
        if (variable) e.ligne(`${setterDe(variable)}(${this.vide(id)});`);
      }
    });
    this.dansEvenement = false;
  }

  /**
   * Les actions d'un événement. Une variable d'état changée plusieurs fois,
   * ou dans une boucle, est lue dans une copie à jour (« panierMaj ») : en
   * React, l'état ne change qu'au prochain affichage.
   */
  private ecrireActionsSuivies(e: Ecrivain, actions: Action[], locales: Set<string>): void {
    // Dans un événement, la réponse d'une requête peut être lue juste après : elle a sa copie à jour.
    const suivies = [...variablesASuivre(actions, this.dansEvenement)].filter((nom) => this.etat.has(nom) && !locales.has(nom));
    if (suivies.length > 0) {
      this.contexte.renommes = new Map(suivies.map((nom) => [nom, `${camel(nom)}Maj`]));
      for (const nom of suivies) e.ligne(`let ${camel(nom)}Maj = ${camel(nom)};`);
    }
    this.ecrireActions(e, actions, locales, modifiees(actions));
    this.contexte.renommes = undefined;
  }

  /** La valeur d'un champ vide : faux pour une case à cocher, un texte vide sinon. */
  private vide(id: string): string {
    return this.contexte.sortes?.get(id) === 'case' ? 'false' : "''";
  }

  /**
   * Ce qui est vérifié avant d'envoyer un formulaire, pour ce champ : des
   * paires (condition d'erreur, message). Le premier champ fautif arrête
   * l'envoi, avec un message en français. Cela aide la personne ; cela ne
   * protège rien (le serveur vérifie de nouveau).
   */
  private verifications(id: string): [string, MessageEnLangues][] {
    const variable = this.contexte.champs.get(id);
    if (variable === undefined) return [];
    const libelle = this.libelles.get(id) ?? id;
    // Le libellé dans chaque langue du site : sa version, sinon celui de base.
    const libelles = (this.application.langues ?? [{ code: 'fr' }]).map(({ code }) => ({ code, libelle: this.libellesLangues.get(id)?.get(code) ?? libelle }));
    return verificationsDuChamp(variable, this.saisies.get(id), libelles);
  }

  /**
   * `locales` : les noms qui ne sont pas de l'état (paramètres, variables
   * de l'événement) ; `modifiees` : ceux que l'événement change, déclarés
   * avec `let`.
   */
  /** Une fonction écrite en haut du fichier : ses paramètres sont des variables locales. */
  fonction(f: FonctionRI): string {
    const e = new Ecrivain();
    for (const p of f.parametres) this.contexte.types.set(p.nom, p.type);
    const parametres = f.parametres.map((p) => `${camel(p.nom)}: ${typeTS(p.type)}`).join(', ');
    const rend = contientRendre(f.corps);
    const retour = !rend ? ': void' : f.retour.genre === 'inconnu' ? '' : `: ${typeTS(f.retour)}`;
    e.bloc(`export function ${camel(f.nom)}(${parametres})${retour} {`, () =>
      this.ecrireActions(e, f.corps, new Set(f.parametres.map((p) => p.nom)), modifiees(f.corps)),
    );
    return e.texte();
  }

  private ecrireActions(e: Ecrivain, actions: Action[], locales: Set<string>, modifiees: Set<string>): void {
    const x = (v: Valeur) => expression(v, this.contexte);
    const renommes = this.contexte.renommes;
    const actuel = (nom: string) => renommes?.get(nom) ?? camel(nom);
    const changer = (nom: string, valeur: string) => {
      const copie = renommes?.get(nom);
      if (copie) {
        // La copie à jour d'abord, pour la suite de l'événement ; React ensuite, pour l'affichage.
        e.ligne(`${copie} = ${valeur};`);
        e.ligne(`${setter(nom)}(${copie});`);
      } else if (this.etat.has(nom) && !locales.has(nom)) e.ligne(`${setter(nom)}(${valeur});`);
      else e.ligne(`${camel(nom)} = ${valeur};`);
    };

    let optimiste: { avant: string; echecs: string; variables: string[] } | undefined;
    for (const action of actions) {
      switch (action.type) {
        case 'optimiste': {
          const numero = ++this.chargeurs;
          const avant = `avantOptimiste${numero}`;
          const echecs = `echecsOptimiste${numero}`;
          e.ligne(`const ${avant} = structuredClone({ ${action.variables.map((nom) => `${camel(nom)}: ${actuel(nom)}`).join(', ')} });`);
          e.ligne(`const ${echecs} = serveur.echecs();`);
          this.ecrireActions(e, action.corps, locales, modifiees);
          optimiste = { avant, echecs, variables: action.variables };
          break;
        }
        case 'message': {
          // « pendant 10 secondes », « sans disparaitre » ; « avec action "Annuler" : » est un bouton du message.
          const reglages = [...(action.duree ? [`duree: ${x(action.duree)}`] : []), ...(action.persistant ? ['persistant: true'] : [])];
          const appel = `afficherMessage(${x(action.texte)}, '${action.genre}'`;
          if (!action.action) {
            e.ligne(`${appel}${reglages.length > 0 ? `, { ${reglages.join(', ')} }` : ''});`);
            break;
          }
          const bouton = action.action;
          e.bloc(`${appel}, {`, () => {
            for (const r of reglages) e.ligne(`${r},`);
            e.bloc(`action: { libelle: ${chaine(bouton.libelle)}, faire: ${contientRequete(bouton.actions) ? 'async ' : ''}() => {`, () => this.ecrireDiffere(e, bouton.actions, locales), '} },');
          }, '});');
          break;
        }
        case 'minuterie':
          this.ecrirePlanifier(e, action, locales);
          break;
        case 'confirmation':
          // Une question, Oui ou Non : la suite attend la réponse. Elle aide la personne, elle ne protège rien.
          e.bloc(`if (await confirmer(${x(action.question)}${action.oui !== 'Oui' || action.non !== 'Non' ? `, { oui: ${chaine(action.oui)}, non: ${chaine(action.non)} }` : ''})) {`, () =>
            this.ecrireActions(e, action.alors, locales, modifiees),
          action.sinon.length > 0 ? '} else {' : '}');
          if (action.sinon.length > 0) {
            e.indenter(() => this.ecrireActions(e, action.sinon, locales, modifiees));
            e.ligne('}');
          }
          break;
        case 'copie':
          // « copier code » : le résultat est dit à la personne, sauf « sans message ».
          e.ligne(
            `await copier(${this.enTexte(action.valeur)}${action.message === null ? '' : `, afficherMessage${action.texte ? `, ${x(action.texte)}` : action.message === 'Copié' ? '' : `, ${chaine(action.message)}`}`});`,
          );
          break;
        case 'partage': {
          // La feuille de partage du système ; sans elle, le lien (ou le texte) est copié.
          const lien = action.lien;
          const adresse = !lien
            ? undefined
            : 'externe' in lien
              ? chaine(lien.externe)
              : `adresseAbsolue(${lien.arguments?.length ? this.adresseAvec(lien.ecran, lien.arguments) : this.chemin({ type: 'texte', parties: [{ texte: lien.ecran }] })})`;
          const donnees = [`texte: ${this.enTexte(action.texte)}`, ...(action.titre ? [`titre: ${this.enTexte(action.titre)}`] : []), ...(adresse ? [`adresse: ${adresse}`] : [])];
          e.ligne(`await partager({ ${donnees.join(', ')} }, afficherMessage);`);
          break;
        }
        case 'visibilite':
          for (const id of action.ids) {
            e.ligne(`setVisibilite((v) => ({ ...v, ${chaine(id)}: ${action.visible} }));`);
          }
          break;
        case 'navigation': {
          const page = texteLitteral(action.ecran);
          if (page === undefined) {
            // Une adresse reçue (le whatsappUrl d'une API) : une page, ou une adresse permise ; sinon refusée avec un message.
            e.ligne(`allerVers(naviguer, String(${x(action.ecran)}), afficherMessage);`);
            break;
          }
          const lue = lireCible(page);
          if (lue.externe) {
            e.ligne(`ouvrirExterne(${chaine(page)});`);
            break;
          }
          const vers = action.arguments && lue.page ? this.adresseAvec(lue.page, action.arguments, lue.ancre) : this.chemin(action.ecran);
          // « continuer vers » : la page voulue avant la connexion, sinon celle-ci.
          e.ligne(this.rendu.naviguer(action.continuer ? `apresLaGarde(location.state) ?? ${vers}` : vers));
          break;
        }
        case 'filtre':
          e.ligne(`changerFiltre(setFiltresAdresse, ${chaine(action.nom)}, ${x(action.valeur)});`);
          break;
        case 'retour':
          e.ligne(`revenirEnArriere(naviguer, location.key${action.vers !== undefined ? `, ${this.chemin({ type: 'texte', parties: [{ texte: action.vers }] })}` : ''});`);
          break;
        case 'changerTexte':
          for (const id of action.ids) {
            e.ligne(`setTextes((t) => ({ ...t, ${chaine(id)}: ${x(action.texte)} }));`);
          }
          break;
        case 'rendre':
          e.ligne(`return ${x(action.valeur)};`);
          break;
        case 'theme':
          e.ligne(`definirTheme(${chaine(action.valeur)});`);
          break;
        case 'langue':
          e.ligne(`changerLangue(${chaine(action.code)});`);
          break;
        case 'affectation':
          if (action.champs && this.etat.has(action.nom) && !locales.has(action.nom) && !renommes?.has(action.nom)) {
            // La forme fonctionnelle : deux changements de champ dans le même événement s'ajoutent.
            const nom = camel(action.nom);
            e.ligne(`${setter(action.nom)}((${nom}) => (${ficheAvec(nom, action.champs, x(action.valeur))}));`);
          } else {
            changer(action.nom, action.champs ? ficheAvec(actuel(action.nom), action.champs, x(action.valeur)) : x(action.valeur));
          }
          break;
        case 'locale':
          locales.add(action.nom);
          e.ligne(`${modifiees.has(action.nom) ? 'let' : 'const'} ${camel(action.nom)} = ${x(action.valeur)};`);
          break;
        case 'ajout':
          changer(action.liste, `[...${actuel(action.liste)}, ${x(action.valeur)}]`);
          break;
        case 'retrait':
          changer(action.liste, `retirerPremier(${actuel(action.liste)}, ${x(action.valeur)})`);
          break;
        case 'requete': {
          const methode = action.mode;
          const args = [chaine(action.adresse)];
          if (action.mode === 'envoyer') args.push(this.donnees(action.donnees, action.cles));
          // « avec id » : l'identifiant de l'élément à lire.
          if (action.mode === 'lireUn') args.push(x(action.donnees[0]));
          if (action.resultat !== undefined) {
            // La valeur actuelle est gardée si le serveur ne répond pas.
            args.push(actuel(action.resultat));
          } else if (action.source !== undefined) {
            args.push('undefined');
          }
          // « de la source "…" » : quelle API, quels paramètres d'adresse, où est la valeur utile.
          if (action.source !== undefined) {
            const filtres = (action.filtrant ?? []).map((f) => `${/^[A-Za-z_]\w*$/.test(f.cle) ? f.cle : chaine(f.cle)}: ${x(f.valeur)}`);
            const options = [`source: ${chaine(action.source)}`, ...(filtres.length > 0 ? [`filtres: { ${filtres.join(', ')} }`] : []), ...(action.dans !== undefined ? [`dans: ${chaine(action.dans)}`] : [])];
            args.push(`{ ${options.join(', ')} }`);
          }
          if (action.resultat !== undefined) {
            const suivie = this.ecran.etatsRequetes?.includes(action.resultat) ?? false;
            const lecture = action.source !== undefined && action.mode !== 'envoyer';
            if (action.source !== undefined) {
              // La page parle de l'état de la variable : elle montre l'erreur elle-même.
              const dernier = args.pop()!;
              const extras = [...(lecture ? ['contourner', 'relancer: () => ' + `charger${this.chargeurs + 1}(true)`] : []), ...(suivie ? [`suivi: set${pascal(action.resultat)}Req`, 'silencieux: true'] : [])];
              args.push(extras.length > 0 ? dernier.replace(/ \}$/, `, ${extras.join(', ')} }`) : dernier);
            }
            if (lecture) {
              // Une lecture sait se rejouer : le bouton « Réessayer » et « recharger » s'en servent.
              const n = ++this.chargeurs;
              e.bloc(`const charger${n} = async (contourner = false) => {`, () => this.ecrireReponse(e, action.resultat!, `await serveur.${methode}(${args.join(', ')})`, changer), '};');
              if (suivie) e.ligne(`relances.current.${camel(action.resultat)} = charger${n};`);
              e.ligne(`await charger${n}();`);
            } else {
              this.ecrireReponse(e, action.resultat, `await serveur.${methode}(${args.join(', ')})`, changer);
            }
          } else {
            e.ligne(`await serveur.${methode}(${args.join(', ')});`);
          }
          // Un envoi refusé arrête la soumission d'un formulaire : ses champs restent remplis.
          // Dans « essayer », un échec arrête le bloc et passe à « si erreur ».
          if (this.essai) e.ligne(`if (serveur.echecs() > ${this.essai}) return "Le serveur n'a pas répondu.";`);
          else if (this.echecs && action.mode === 'envoyer' && !optimiste) e.ligne(`if (serveur.echecs() > ${this.echecs}) return;`);
          break;
        }
        case 'recharger':
          e.ligne(`await relances.current.${camel(action.variable)}?.();`);
          break;
        case 'envoiFichier': {
          // L'envoi passe par XMLHttpRequest (humalis/televerser.ts) : c'est lui qui connaît la progression.
          const suivie = action.resultat !== undefined && (this.ecran.etatsRequetes?.includes(action.resultat) ?? false);
          const options = [
            `source: ${chaine(action.source)}`,
            action.corpsBrut ? 'corpsBrut: true' : `champ: ${chaine(action.champ)}`,
            ...(action.suivi !== undefined ? [`progression: ${setter(action.suivi)}`] : []),
            ...(suivie ? [`suivi: set${pascal(action.resultat!)}Req`, 'silencieux: true'] : ['message: afficherMessage']),
          ];
          const appel = `await televerser(${actuel(action.variable)}, ${chaine(action.adresse)}, { ${options.join(', ')} }, ${action.resultat !== undefined ? actuel(action.resultat) : 'null'})`;
          if (action.resultat !== undefined) changer(action.resultat, appel);
          else e.ligne(`${appel};`);
          break;
        }
        case 'connexion': {
          // Le mot de passe est effacé de son champ dès l'envoi : il n'est
          // gardé nulle part ailleurs. Si la connexion échoue, un message
          // s'affiche et la suite de l'événement ne s'exécute pas.
          const motDePasse = action.motDePasse.type === 'champ' ? this.contexte.champs.get(action.motDePasse.id) : undefined;
          if (motDePasse) e.ligne(`${setterDe(motDePasse)}('');`);
          e.ligne(`if (!(await utilisateur.seConnecter(${x(action.email)}, ${x(action.motDePasse)}))) return;`);
          break;
        }
        case 'deconnexion':
          e.ligne('await utilisateur.seDeconnecter();');
          break;
        case 'suppression':
        case 'modification': {
          // « de la source "…" » : quelle API, et PUT si la route remplace au lieu de changer des champs.
          const appelSource = action.source !== undefined ? `, { source: ${chaine(action.source)}${action.type === 'modification' && action.remplacement ? ', remplacement: true' : ''} }` : '';
          const appel =
            action.type === 'suppression'
              ? `await serveur.supprimer(${chaine(action.adresse)}, ${x(action.objet)}.id${appelSource});`
              : `await serveur.modifier(${chaine(action.adresse)}, ${x(action.objet)}.id, { ${action.changements
                  .map((c) => (camel(c.champ) === x(c.valeur) ? x(c.valeur) : `${camel(c.champ)}: ${x(c.valeur)}`))
                  .join(', ')} }${appelSource});`;
          // Une variable « = rien » pas encore lue n'a pas d'identifiant : rien n'est envoyé.
          const objet = action.objet.type === 'variable' && this.contexte.facultatives?.has(action.objet.nom) ? x(action.objet) : undefined;
          if (objet) e.bloc(`if (${objet} !== null) {`, () => e.ligne(appel.replace(`${objet}?.id`, `${objet}.id`)));
          else e.ligne(appel);
          if (this.essai) e.ligne(`if (serveur.echecs() > ${this.essai}) return "Le serveur n'a pas répondu.";`);
          else if (this.echecs && !optimiste) e.ligne(`if (serveur.echecs() > ${this.echecs}) return;`);
          break;
        }
        case 'si':
          e.bloc(`if (${condition(action.test, this.contexte)}) {`, () =>
            this.ecrireActions(e, action.alors, locales, modifiees),
          action.sinon.length > 0 ? '} else {' : '}');
          if (action.sinon.length > 0) {
            e.indenter(() => this.ecrireActions(e, action.sinon, locales, modifiees));
            e.ligne('}');
          }
          break;
        case 'repetition':
          locales.add(action.variable);
          e.bloc(`for (const ${camel(action.variable)} of ${x(action.liste)}) {`, () =>
            this.dansUneBoucle(() => this.ecrireActions(e, action.corps, locales, modifiees)),
          );
          break;
        case 'essayer': {
          // « essayer : … si erreur : … » (décision L5) : le bloc est une fonction qui rend la raison d'un échec.
          const n = ++this.essais;
          const echecs = `echecsEssai${n > 1 ? n : ''}`;
          const raison = `raisonEssai${n > 1 ? n : ''}`;
          const requetes = contientRequete(action.corps);
          if (requetes) {
            e.ligne(`const ${echecs} = serveur.echecs();`);
            // Le message automatique se tait : c'est « si erreur » qui parle.
            e.ligne('serveur.taire(true);');
          }
          e.ligne(`let ${raison}: string | undefined;`);
          e.ligne('try {');
          e.indenter(() =>
            e.bloc(`${raison} = await (async (): Promise<string | undefined> => {`, () => {
              const avant = this.essai;
              if (requetes) this.essai = echecs;
              this.ecrireActions(e, action.corps, locales, modifiees);
              this.essai = avant;
              e.ligne('return undefined;');
            }, '})();'),
          );
          e.ligne('} catch (erreur) {');
          e.indenter(() => e.ligne(`${raison} = erreur instanceof Error ? erreur.message : String(erreur);`));
          if (requetes) {
            e.ligne('} finally {');
            e.indenter(() => e.ligne('serveur.taire(false);'));
          }
          e.ligne('}');
          if (action.siErreur.length) {
            e.bloc(`if (${raison} !== undefined) {`, () => {
              e.ligne(`const raison = ${raison};`);
              this.ecrireActions(e, action.siErreur, new Set([...locales, 'raison']), modifiees);
            });
          }
          // Dans un formulaire, un échec arrête la soumission : ses champs restent remplis.
          if (this.echecs) e.ligne(`if (${raison} !== undefined) return;`);
          break;
        }
        case 'tantQue':
          e.bloc(`while (${condition(action.test, this.contexte)}) {`, () => this.dansUneBoucle(() => this.ecrireActions(e, action.corps, locales, modifiees)));
          break;
        case 'repeter':
          e.bloc(`for (let fois = 0; fois < ${x(action.fois)}; fois++) {`, () => this.dansUneBoucle(() => this.ecrireActions(e, action.corps, locales, modifiees)));
          break;
        case 'arreter':
          // Dans une minuterie, « arreter » l'arrête pour de bon ; dans une boucle, il en sort.
          if (this.dansMinuterie) {
            e.ligne('arreter();');
            e.ligne('return;');
          } else {
            e.ligne('break;');
          }
          break;
        case 'passer':
          e.ligne('continue;');
          break;
        case 'selon': {
          // Une suite de « if » : le premier cas égal à la valeur.
          const valeur = x(action.valeur);
          action.cas.forEach((c, i) => {
            const test = c.valeurs.map((v) => `${valeur} === ${x(v)}`).join(' || ');
            e.ligne(`${i === 0 ? '' : '} else '}if (${test}) {`);
            e.indenter(() => this.ecrireActions(e, c.corps, locales, modifiees));
          });
          if (action.sinon.length > 0) {
            e.ligne(action.cas.length > 0 ? '} else {' : '{');
            e.indenter(() => this.ecrireActions(e, action.sinon, locales, modifiees));
          }
          if (action.cas.length > 0 || action.sinon.length > 0) e.ligne('}');
          break;
        }
      }
      if (optimiste && (action.type === 'requete' || action.type === 'suppression' || action.type === 'modification')) {
        const { avant, echecs, variables } = optimiste;
        e.bloc(`if (serveur.echecs() > ${echecs}) {`, () => {
          for (const nom of variables) {
            if (renommes?.has(nom)) e.ligne(`${actuel(nom)} = ${avant}.${camel(nom)};`);
            e.ligne(`${setter(nom)}(${avant}.${camel(nom)});`);
          }
          e.ligne(`afficherMessage("L'action n'a pas été prise en compte : on a remis les choses comme avant.", 'erreur');`);
          e.ligne('return;');
        });
        optimiste = undefined;
      }
    }
  }

  /**
   * La réponse d'une requête rangée dans sa variable. Dans un événement,
   * « la dernière requête gagne » : une réponse arrivée après celle d'une
   * requête plus récente (une recherche tapée vite) ne remplace rien.
   */
  private ecrireReponse(e: Ecrivain, variable: string, appel: string, changer: (nom: string, valeur: string) => void): void {
    if (!this.dansEvenement) {
      changer(variable, appel);
      return;
    }
    const n = ++this.dernieres;
    e.ligne(`const derniere${n} = derniereRequete(${chaine(variable)});`);
    e.ligne(`const reponse${n} = ${appel};`);
    e.ligne(`if (!derniere${n}()) return;`);
    changer(variable, `reponse${n}`);
  }

  /** Une valeur écrite en texte, comme dans « {…} » : un nombre au format français. */
  private enTexte(valeur: Valeur): string {
    const code = expression(valeur, this.contexte);
    const type = typeDe(valeur, this.contexte).genre;
    return type === 'texte' ? code : type === 'nombre' ? `formaterNombre(${code})` : `String(${code})`;
  }

  /** Le corps d'une boucle : « arreter » y sort de la boucle, pas de la minuterie qui l'entoure. */
  private dansUneBoucle(ecrire: () => void): void {
    const avant = this.dansMinuterie;
    this.dansMinuterie = false;
    ecrire();
    this.dansMinuterie = avant;
  }

  /**
   * Des actions exécutées plus tard (une minuterie lancée par un clic, le
   * bouton d'un message) : elles lisent et changent les dernières valeurs de
   * la page (`actuel.current`), pas celles du moment du clic.
   */
  private ecrireDiffere(e: Ecrivain, actions: Action[], locales: Set<string>): void {
    const avant = this.contexte.renommes;
    const etat = [...this.etat].filter((nom) => !locales.has(nom));
    this.contexte.renommes = new Map([...(avant ?? []), ...etat.map((nom): [string, string] => [nom, `actuel.current.${camel(nom)}`])]);
    this.ecrireActions(e, actions, new Set(locales), modifiees(actions));
    this.contexte.renommes = avant;
  }

  /** Une minuterie lancée par un événement : annulée quand la page est quittée. */
  private ecrirePlanifier(e: Ecrivain, minuterie: Extract<Action, { type: 'minuterie' }>, locales: Set<string>): void {
    const options = [...(minuterie.mode === 'toutes' ? ['repete: true'] : [])];
    const asynchrone = contientRequete(minuterie.corps) ? 'async ' : '';
    const avant = this.dansMinuterie;
    this.dansMinuterie = true;
    e.ligne(`planifier(${asynchrone}${arrete(minuterie.corps) ? '(arreter)' : '()'} => {`);
    e.indenter(() => this.ecrireDiffere(e, minuterie.corps, locales));
    this.dansMinuterie = avant;
    if (minuterie.tantQue) {
      // « tant que » : relu à chaque tour, sur les dernières valeurs.
      const renommes = this.contexte.renommes;
      this.contexte.renommes = new Map([...(renommes ?? []), ...[...this.etat].filter((n) => !locales.has(n)).map((n): [string, string] => [n, `actuel.current.${camel(n)}`])]);
      options.push(`tantQue: () => ${condition(minuterie.tantQue, this.contexte)}`);
      this.contexte.renommes = renommes;
    }
    e.ligne(`}, ${expression(minuterie.millisecondes, this.contexte)}${options.length > 0 ? `, { ${options.join(', ')} }` : ''});`);
  }

  /**
   * « quand l'utilisateur ecrit dans "x" » : à chaque changement de la valeur ;
   * « arrete d'ecrire dans "x" » : quand elle n'a plus changé depuis la pause.
   */
  private ecrireSaisies(e: Ecrivain): void {
    for (const { gestionnaire, nom } of this.saisiesSuivies) {
      const valeur = this.contexte.champs.get(gestionnaire.cibles[0] ?? '');
      if (valeur === undefined) continue;
      const asynchrone = contientRequete(gestionnaire.actions) ? 'async ' : '';
      const ouverture =
        gestionnaire.declencheur === 'saisie'
          ? `useQuandChange(${valeur}, ${asynchrone}() => {`
          : `const ${nom} = useQuandPause(${valeur}, ${gestionnaire.millisecondes ?? 300}, ${asynchrone}() => {`;
      e.ligne();
      this.dansEvenement = true;
      e.bloc(ouverture, () => this.ecrireActionsSuivies(e, gestionnaire.actions, new Set()), '});');
      this.dansEvenement = false;
    }
  }

  /**
   * Les minuteries de la page (« apres 3 secondes : » écrit dans la page) :
   * démarrées à son ouverture, annulées quand on la quitte ; « tant que »
   * les fait exister seulement pendant que c'est vrai.
   */
  private ecrireMinuteries(e: Ecrivain): void {
    for (const action of this.minuteries) {
      if (action.type !== 'minuterie') continue;
      const options = [...(action.mode === 'toutes' ? ['repete: true'] : []), ...(action.tantQue ? [`actif: ${condition(action.tantQue, this.contexte)}`] : [])];
      const asynchrone = contientRequete(action.corps) ? 'async ' : '';
      e.ligne();
      this.dansMinuterie = true;
      e.bloc(`useMinuterie(${asynchrone}${arrete(action.corps) ? '(arreter)' : '()'} => {`, () => this.ecrireDiffere(e, action.corps, new Set()), `}, ${expression(action.millisecondes, this.contexte)}${options.length > 0 ? `, { ${options.join(', ')} }` : ''});`);
      this.dansMinuterie = false;
    }
  }

  /** `{ email: champEmail, age }` : les données envoyées au serveur. */
  private donnees(valeurs: Valeur[], cles?: (string | undefined)[]): string {
    const paires = valeurs.map((v, i) => {
      const ecrite = cles?.[i];
      const cle = ecrite !== undefined ? (/^[A-Za-z_]\w*$/.test(ecrite) ? ecrite : chaine(ecrite)) : v.type === 'champ' ? (this.clesChamps.get(v.id) ?? camel(v.id)) : v.type === 'variable' ? camel(v.nom) : 'valeur';
      const valeur = expression(v, this.contexte);
      return cle === valeur ? cle : `${cle}: ${valeur}`;
    });
    return `{ ${paires.join(', ')} }`;
  }

  /** L'adresse d'une page à paramètre, avec les valeurs données (« avec id p.id »). */
  private adresseAvec(page: string, args: { nom: string; valeur: Valeur }[], ancre?: string): string {
    const chemin = this.chemins.get(page) ?? `/${simplifier(page)}`;
    const morceaux = [...chemin.matchAll(/:(\w+)/g)].map((m) => m[1]);
    const valeurs = morceaux.map((nom) => {
      const donne = args.find((a) => camel(a.nom) === nom);
      return donne ? expression(donne.valeur, this.contexte) : "''";
    });
    // Les filtres vont dans la requête de l'adresse (?categorie=costumes), un filtre « rien » est omis.
    const filtres = (this.application.filtres?.get(page) ?? []).filter((f) => args.some((a) => a.nom === f.nom));
    let adresse = this.rendu.adresse(chemin.replace(/\/:\w+/g, '') || '/', valeurs);
    if (filtres.length > 0) {
      const paires = filtres.map((f) => `${/^[A-Za-z_]\w*$/.test(f.nom) ? f.nom : chaine(f.nom)}: ${expression(args.find((a) => a.nom === f.nom)!.valeur, this.contexte)}`);
      adresse = `${adresse.slice(0, -1)}\${adresseAvecFiltres({ ${paires.join(', ')} })}\``;
    }
    if (ancre !== undefined) adresse = `${adresse.slice(0, -1)}#${ancre}\``;
    return adresse;
  }

  private chemin(ecran: Valeur): string {
    const nom = texteLitteral(ecran);
    if (nom !== undefined) {
      const lue = lireCible(nom);
      const base = lue.page ? (this.chemins.get(lue.page) ?? `/${simplifier(lue.page)}`) : '';
      return chaine(lue.ancre !== undefined ? `${base}#${lue.ancre}` : base);
    }
    return `\`/\${${expression(ecran, this.contexte)}}\``;
  }

  // ─── Vue ────────────────────────────────────────────────────────────────

  private ecrireVue(e: Ecrivain, noeuds: NoeudVue[]): void {
    for (const noeud of noeuds) {
      switch (noeud.type) {
        case 'element':
          this.ecrireElement(e, noeud);
          break;

        case 'widget':
          e.ligne(this.rendu.widgets.widget(this.widget(noeud)));
          break;

        case 'carte':
          for (const ligne of this.rendu.widgets.carte(this.carte(noeud))) e.ligne(ligne);
          break;

        case 'marqueur':
          // Écrit par sa carte (lieuxDeLaCarte) : un marqueur seul n'a pas de place dans la vue.
          break;

        // Un graphique : le même composant <Graphique> sur le web et le mobile (graphique.ts).
        case 'graphique':
          e.ligne(baliseGraphique(noeud, (v) => expression(v, this.contexte), texteLitteral));
          break;

        case 'condition': {
          const test = condition(noeud.test, this.contexte);
          // Une condition sur la session attend la réponse du serveur : sinon la
          // page montrerait un instant la version « visiteur » à une personne connectée.
          const attente = /\butilisateur\.(connecte|admin)\b/.test(test) ? 'utilisateur.pret && ' : '';
          if (noeud.sinon.length === 0) {
            e.ligne(`{${attente}${test} && (`);
            e.indenter(() => this.ecrireGroupe(e, noeud.alors));
            e.ligne(')}');
          } else {
            e.ligne(attente ? `{${attente}(${test} ? (` : `{${test} ? (`);
            e.indenter(() => this.ecrireGroupe(e, noeud.alors));
            e.ligne(') : (');
            e.indenter(() => this.ecrireGroupe(e, noeud.sinon));
            e.ligne(attente ? '))}' : ')}');
          }
          break;
        }

        case 'repetition': {
          const variable = camel(noeud.variable);
          const index = `index${pascal(noeud.variable)}`;
          const liste = expression(noeud.liste, this.contexte);
          const locales = noeud.corps.filter((n) => n.type === 'locale');
          const contenu = noeud.corps.filter((n) => n.type !== 'locale');
          if (noeud.deplacement && noeud.liste.type === 'variable') {
            // « avec deplacement » : chaque élément se prend et se déplace, au pointeur et au clavier.
            const nom = `deplacement${pascal(noeud.liste.nom)}`;
            const [ouvrir, fermer] = this.rendu.deplacement.element(nom, index);
            e.ligne(this.rendu.deplacement.ouvrir);
            e.indenter(() => {
              e.ligne(`{${liste}.map((${variable}, ${index}) => (`);
              e.indenter(() => {
                e.ligne(ouvrir.replace(/>$/, ` key={${index}}>`));
                e.indenter(() => (locales.length > 0 ? this.ecrireGroupe(e, noeud.corps) : this.ecrireVue(e, contenu)));
                e.ligne(fermer);
              });
              e.ligne('))}');
            });
            for (const ligne of this.rendu.deplacement.fermer(nom)) e.ligne(ligne);
          } else if (locales.length === 0) {
            e.ligne(`{${liste}.map((${variable}, ${index}) => (`);
            e.indenter(() => {
              e.ligne(`<Fragment key={${index}}>`);
              e.indenter(() => this.ecrireVue(e, contenu));
              e.ligne('</Fragment>');
            });
            e.ligne('))}');
          } else {
            e.bloc(`{${liste}.map((${variable}, ${index}) => {`, () => {
              this.ecrireLocales(e, locales);
              e.ligne('return (');
              e.indenter(() => {
                e.ligne(`<Fragment key={${index}}>`);
                e.indenter(() => this.ecrireVue(e, contenu));
                e.ligne('</Fragment>');
              });
              e.ligne(');');
            }, '})}');
          }
          break;
        }

        case 'locale':
          // Traité par le bloc qui la contient (ecrireGroupe, répétition).
          break;

        case 'sousPage':
          e.ligne('<Outlet />');
          break;

        case 'fenetre': {
          // Fermée au départ ; « montrer » l'ouvre, « cacher », Échap, la croix ou un clic à côté la ferment.
          const proprietes = [
            `ouverte={visibilite[${chaine(noeud.id)}]}`,
            `fermer={() => setVisibilite((v) => ({ ...v, ${chaine(noeud.id)}: false }))}`,
            `titre=${attributTexte(noeud.titre)}`,
            ...(noeud.description !== undefined ? [`description=${attributTexte(noeud.description)}`] : []),
            ...(noeud.obligatoire ? ['obligatoire'] : []),
            ...(noeud.classes.length > 0 ? [`className=${attributTexte(noeud.classes.join(' '))}`] : []),
          ];
          e.ligne(`<Fenetre ${proprietes.join(' ')}>`);
          e.indenter(() => (noeud.corps.some((n) => n.type === 'locale') ? this.ecrireGroupe(e, noeud.corps) : this.ecrireVue(e, noeud.corps)));
          e.ligne('</Fenetre>');
          break;
        }

        case 'bloc':
          if (COMPOSITES.has(noeud.genre)) {
            this.ecrireComposite(e, noeud);
            break;
          }
          e.ligne(this.rendu.bloc.ouvrir(noeud.genre, noeud.options, noeud.classes, noeud.ancre));
          // Des variables dans le bloc : écrites comme dans une condition.
          e.indenter(() =>
            noeud.corps.some((n) => n.type === 'locale') ? this.ecrireGroupe(e, noeud.corps) : this.ecrireVue(e, noeud.corps),
          );
          e.ligne(this.rendu.bloc.fermer(noeud.genre, noeud.options));
          // « arrive en bas de » ce bloc : la sentinelle et le bouton « Voir plus », tant que la condition est vraie.
          if (noeud.id !== undefined && this.basDesBlocs.has(noeud.id)) {
            const { nom, gestionnaire } = this.basDesBlocs.get(noeud.id)!;
            // Le texte par défaut est celui de Humalis : avec des langues, il suit la langue choisie.
            const bouton = gestionnaire.bouton ?? null;
            const texte = bouton === null ? null : bouton === 'Voir plus' && this.application.langues ? "{t({ fr: 'Voir plus', en: 'See more' })}" : contenuTexte(bouton);
            const lignes = this.rendu.voirPlus(nom, texte);
            const tantQue = gestionnaire.tantQue ? condition(gestionnaire.tantQue, this.contexte) : undefined;
            if (tantQue) {
              e.ligne(`{${tantQue} && (`);
              e.indenter(() => {
                e.ligne('<>');
                e.indenter(() => lignes.forEach((l) => e.ligne(l)));
                e.ligne('</>');
              });
              e.ligne(')}');
            } else {
              lignes.forEach((l) => e.ligne(l));
            }
          }
          break;

        case 'formulaire': {
          const ecrire = () => {
            e.ligne(this.rendu.formulaire.ouvrir(noeud.id, this.formulaires.get(noeud.id)?.soumission));
            // Des variables dans le bloc : écrites comme dans une condition.
            e.indenter(() =>
              noeud.corps.some((n) => n.type === 'locale') ? this.ecrireGroupe(e, noeud.corps) : this.ecrireVue(e, noeud.corps),
            );
            e.ligne(this.rendu.formulaire.fermer);
          };
          if (this.montres.has(noeud.id) || this.caches.has(noeud.id)) {
            e.ligne(`{visibilite[${chaine(noeud.id)}] && (`);
            e.indenter(ecrire);
            e.ligne(')}');
          } else {
            ecrire();
          }
          break;
        }

        case 'composant': {
          // Un texte écrit en clair devient un attribut, le reste une expression.
          const proprietes = noeud.proprietes.map((p) => {
            const texte = p.valeur.type === 'texte' && p.valeur.parties.every((x) => 'texte' in x)
              ? p.valeur.parties.map((x) => ('texte' in x ? x.texte : '')).join('')
              : undefined;
            const valeur = texte !== undefined && !/["{}]/.test(texte) ? JSON.stringify(texte) : `{${expression(p.valeur, this.contexte)}}`;
            return ` ${camel(p.nom)}=${valeur}`;
          });
          e.ligne(`<${noeud.nom}${proprietes.join('')} />`);
          break;
        }
      }
    }
  }

  /** Un élément d'écran d'une ligne, avec ses valeurs en expressions. */
  private widget(noeud: Extract<NoeudVue, { type: 'widget' }>): WidgetProduit {
    const texte = texteLitteral(noeud.contenu);
    const variable = noeud.fichier
      ? { lecture: camel(noeud.fichier.variable), setter: setter(noeud.fichier.variable) }
      : noeud.contenu.type === 'variable' ? { lecture: camel(noeud.contenu.nom), setter: setter(noeud.contenu.nom) } : undefined;
    return {
      genre: noeud.genre,
      id: noeud.id,
      classes: [...noeud.options.map((o) => `humalis-${o.nom}-${o.valeur}`), ...noeud.classes].join(' '),
      styles: noeud.options.map((o) => `${o.nom}_${o.valeur}`),
      valeur: expression(noeud.contenu, this.contexte),
      ...(texte !== undefined ? { texte } : {}),
      contenu: texte === '' ? '' : contenuJSX(noeud.contenu, this.contexte),
      dynamique: texte === undefined,
      reglages: noeud.reglages,
      ...(noeud.reglages.photo ? { photo: expression(noeud.reglages.photo, this.contexte) } : {}),
      ...(noeud.minimum !== undefined ? { minimum: noeud.minimum } : {}),
      ...(noeud.maximum !== undefined ? { maximum: noeud.maximum } : {}),
      ...(variable ? { variable } : {}),
      ...(noeud.fichier ? { fichier: noeud.fichier } : {}),
      ...(noeud.genre === 'audio' ? { audio: this.audio(noeud) } : {}),
    };
  }

  /** Une carte : ses réglages en expressions, et ses lieux en lignes de tableau. */
  private carte(noeud: Extract<NoeudVue, { type: 'carte' }>): CarteProduite {
    return {
      id: noeud.id,
      classes: noeud.classes.join(' '),
      nom: this.texteJs(noeud.nom),
      ...(noeud.latitude ? { latitude: expression(noeud.latitude, this.contexte) } : {}),
      ...(noeud.longitude ? { longitude: expression(noeud.longitude, this.contexte) } : {}),
      ...(noeud.zoom ? { zoom: expression(noeud.zoom, this.contexte) } : {}),
      ...(noeud.tuiles ? { tuiles: noeud.tuiles } : {}),
      lieux: this.lieuxDeLaCarte(noeud.corps),
    };
  }

  /** Une valeur dont le composant attend un texte : écrite telle quelle si c'est un texte, sinon passée par String. */
  private texteJs(valeur: Valeur): string {
    return valeur.type === 'texte' ? expression(valeur, this.contexte) : `String(${expression(valeur, this.contexte)})`;
  }

  /** Les lieux d'une carte : un objet par marqueur, un `flatMap` par « pour chaque », un choix par « si ». */
  private lieuxDeLaCarte(noeuds: NoeudVue[]): string[] {
    const lignes: string[] = [];
    const decale = (l: string[]) => l.map((x) => `  ${x}`);
    for (const noeud of noeuds) {
      if (noeud.type === 'marqueur') {
        const adresse = noeud.adresse ? `, adresse: ${this.texteJs(noeud.adresse)}` : '';
        lignes.push(`{ nom: ${this.texteJs(noeud.nom)}${adresse}, latitude: ${expression(noeud.latitude, this.contexte)}, longitude: ${expression(noeud.longitude, this.contexte)} },`);
      } else if (noeud.type === 'condition') {
        const sinon = this.lieuxDeLaCarte(noeud.sinon);
        lignes.push(`...(${condition(noeud.test, this.contexte)} ? [`, ...decale(this.lieuxDeLaCarte(noeud.alors)), ...(sinon.length > 0 ? ['] : [', ...decale(sinon), ']),'] : ['] : []),']));
      } else if (noeud.type === 'repetition') {
        lignes.push(`...${expression(noeud.liste, this.contexte)}.flatMap((${camel(noeud.variable)}) => [`, ...decale(this.lieuxDeLaCarte(noeud.corps)), ']),');
      }
    }
    return lignes;
  }

  /** Un audio : sa source (un fichier local est copié dans /audio/) et ses textes. */
  private audio(noeud: Extract<NoeudVue, { type: 'widget' }>): NonNullable<WidgetProduit['audio']> {
    const attribut = (valeur: Valeur): string => {
      const texte = texteLitteral(valeur);
      if (texte === undefined) return `{${expression(valeur, this.contexte)}}`;
      return /["\\{}\n<>]/.test(texte) ? `{${chaine(texte)}}` : `"${texte}"`;
    };
    const fichier = texteLitteral(noeud.contenu);
    const source = fichier !== undefined && estFichierLocal(fichier) ? `"/audio/${fichier}"` : attribut(noeud.contenu);
    const { description, transcription } = noeud.textes ?? {};
    return {
      source,
      ...(description ? { description: attribut(description) } : {}),
      ...(transcription ? { transcription: contenuJSX(transcription, this.contexte) } : {}),
    };
  }

  /** Un bloc d'éléments d'écran : onglets, dépliant, accordéon, carrousel, fil d'Ariane. */
  private ecrireComposite(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'bloc' }>): void {
    const titre = (v: Valeur | undefined) => (v ? contenuJSX(v, this.contexte) : '');
    const etat = noeud.etat ? { lecture: camel(noeud.etat), setter: setter(noeud.etat) } : undefined;
    const enfants = noeud.corps.filter((n): n is Extract<NoeudVue, { type: 'bloc' }> => n.type === 'bloc');
    const composite: CompositeProduit = {
      genre: noeud.genre,
      id: `${noeud.genre}-${simplifier(String(noeud.ligne))}`,
      classes: [...noeud.options.map((o) => `humalis-${o.nom}-${o.valeur}`), ...noeud.classes].join(' '),
      styles: noeud.options.map((o) => `${o.nom}_${o.valeur}`),
      reglages: noeud.reglages ?? {},
      parties:
        noeud.genre === 'onglets'
          ? enfants.map((o) => ({ titre: titre(o.titre), icone: o.reglages?.icone }))
          : noeud.genre === 'deroulant'
            ? [{ titre: titre(noeud.titre), icone: noeud.reglages?.icone }]
            : noeud.genre === 'filAriane'
              ? noeud.corps.map(() => ({ titre: '' }))
              : [],
      ...(etat ? { etat } : {}),
    };
    if (noeud.genre === 'deroulant' && etat) {
      // Seul : un booléen. Dans un accordéon : l'index ouvert du groupe.
      const groupe = noeud.index !== undefined;
      composite.ouvert = groupe ? `${etat.lecture} === ${noeud.index}` : etat.lecture;
      composite.basculer = groupe ? `${etat.setter}(${etat.lecture} === ${noeud.index} ? -1 : ${noeud.index})` : `${etat.setter}(!${etat.lecture})`;
    }
    const plan = this.rendu.widgets.composite(composite);
    for (const ligne of plan.avant) e.ligne(ligne);
    e.indenter(() => {
      if (!plan.parties) {
        this.ecrireVue(e, noeud.corps);
        return;
      }
      plan.parties.forEach((partie, i) => {
        for (const ligne of partie.ouvrir) e.ligne(ligne);
        // Un onglet ou un dépliant : le contenu du bloc ; une partie du fil d'Ariane : son élément.
        const corps = noeud.genre === 'onglets' ? enfants[i].corps : noeud.genre === 'filAriane' ? [noeud.corps[i]] : noeud.corps;
        e.indenter(() => this.ecrireVue(e, corps));
        for (const ligne of partie.fermer) e.ligne(ligne);
      });
    });
    for (const ligne of plan.apres) e.ligne(ligne);
  }

  /** Les enfants d'une condition : un fragment, avec ses variables locales s'il en a. */
  private ecrireGroupe(e: Ecrivain, noeuds: NoeudVue[]): void {
    const locales = noeuds.filter((n) => n.type === 'locale');
    const contenu = noeuds.filter((n) => n.type !== 'locale');
    const seul = contenu[0];
    if (
      locales.length === 0 &&
      contenu.length === 1 &&
      seul.type === 'element' &&
      !this.montres.has(seul.id) &&
      !this.caches.has(seul.id)
    ) {
      // Un seul élément n'a pas besoin de fragment.
      this.ecrireVue(e, contenu);
      return;
    }
    if (locales.length === 0) {
      e.ligne('<>');
      e.indenter(() => this.ecrireVue(e, contenu));
      e.ligne('</>');
      return;
    }
    e.bloc('(() => {', () => {
      this.ecrireLocales(e, locales);
      e.ligne('return (');
      e.indenter(() => {
        e.ligne('<>');
        e.indenter(() => this.ecrireVue(e, contenu));
        e.ligne('</>');
      });
      e.ligne(');');
    }, '})()');
  }

  private ecrireLocales(e: Ecrivain, locales: NoeudVue[]): void {
    for (const l of locales) {
      if (l.type === 'locale') e.ligne(`const ${camel(l.nom)} = ${expression(l.valeur, this.contexte)};`);
    }
  }

  /** Une image : la copie du fichier local et ses dimensions lues, sa description en attribut. */
  private image(image: ImageRI, contenu: Valeur): ImageProduite {
    const info = image.locale !== undefined ? this.application.medias?.get(image.locale) : undefined;
    const description = image.description;
    const texte = description ? texteLitteral(description) : '';
    const alt =
      texte !== undefined
        ? { jsx: attributTexte(texte), expression: chaine(texte), decorative: description === undefined }
        : { jsx: `{${expression(description!, this.contexte)}}`, expression: expression(description!, this.contexte), decorative: false };
    return {
      ...(image.locale !== undefined ? { locale: nomDeLaCopie(image.locale) } : {}),
      expression: expression(contenu, this.contexte),
      alt,
      ...(info?.largeur && info.hauteur ? { largeur: info.largeur, hauteur: info.hauteur } : {}),
      ...(image.proportions ? { proportions: image.proportions } : {}),
      ...(image.prioritaire ? { prioritaire: true } : {}),
    };
  }

  private ecrireElement(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'element' }>): void {
    const parAttribut = new Map(this.attributs.get(noeud.id) ?? []);
    // Dans un formulaire : un bouton sans clic propre l'envoie, une saisie d'une ligne aussi (touche du clavier).
    const formulaire = this.formulaireDe.get(noeud.id);
    const soumission = formulaire !== undefined ? this.formulaires.get(formulaire)?.soumission : undefined;
    const clic = this.rendu.evenements.clic;
    const aSonClic = clic !== undefined && parAttribut.has(clic);
    const saisie = this.saisies.get(noeud.id);
    const uneLigne = noeud.genre === 'champ' && UNE_LIGNE.has(saisie?.sorte ?? 'texte');
    const envoiClavier = soumission !== undefined && uneLigne && this.rendu.soumission.saisie !== undefined;
    for (const [attribut, envoie] of [
      [this.rendu.soumission.bouton, noeud.genre === 'bouton' && !aSonClic],
      [this.rendu.soumission.saisie, envoiClavier],
    ] as const) {
      if (soumission !== undefined && attribut !== undefined && envoie) parAttribut.set(attribut, [soumission]);
    }

    // « avec annonce » : un lecteur d'écran lit l'élément quand il change.
    const evenements: string[] = noeud.annonce ? [this.rendu.annonce] : [];
    if (noeud.raccourci !== undefined && this.rendu.raccourci) evenements.push(this.rendu.raccourci(noeud.raccourci, texteLitteral(noeud.contenu)));
    for (const [attribut, appels] of parAttribut) {
      const reference = appels.length === 1 && !appels[0].includes('(');
      const corps = appels.length === 1 ? appels[0] : `{ ${appels.join('; ')}; }`;
      evenements.push(`${attribut}={${reference ? appels[0] : `() => ${corps}`}}`);
    }

    // Une icône avant le texte d'un bouton, d'un lien… (avec icone "panier").
    const icone = noeud.reglages?.icone ? this.rendu.widgets.icone(noeud.reglages.icone) : '';
    const contenu =
      icone +
      (this.textesChanges.has(noeud.id)
        ? `{textes[${chaine(noeud.id)}] ?? ${expression(noeud.contenu, this.contexte)}}`
        : contenuJSX(noeud.contenu, this.contexte));

    const niveau = noeud.genre === 'soustitre' ? noeud.niveau ?? 2 : noeud.genre === 'titre' && this.titreVu ? 2 : 1;
    if (noeud.genre === 'titre') this.titreVu = true;
    const source = texteLitteral(noeud.contenu);
    const variable = this.contexte.champs.get(noeud.id) ?? '';
    const ouvert = this.ouvertes.get(noeud.id);
    const balise = this.rendu.element({
      genre: noeud.genre,
      id: noeud.id,
      options: noeud.options,
      classes: noeud.classes,
      contenu,
      evenements,
      niveau,
      vers:
        noeud.cible !== undefined
          ? (this.chemins.get(noeud.cible) ?? `/${simplifier(noeud.cible)}`) + (noeud.versAncre !== undefined ? `#${noeud.versAncre}` : '')
          : noeud.versAncre !== undefined
            ? `#${noeud.versAncre}`
            : '/',
      ...(noeud.cible !== undefined && noeud.arguments ? { versExpression: this.adresseAvec(noeud.cible, noeud.arguments, noeud.versAncre) } : {}),
      ...(noeud.externe !== undefined ? { externe: noeud.externe } : {}),
      ...(noeud.nouvelOnglet ? { nouvelOnglet: true } : {}),
      ...(noeud.ancre !== undefined ? { ancre: noeud.ancre } : {}),
      ...(noeud.cible !== undefined ? { filtresCible: (this.application.filtres?.get(noeud.cible) ?? []).map((f) => f.nom) } : {}),
      source: {
        jsx: source !== undefined ? JSON.stringify(source) : `{${expression(noeud.contenu, this.contexte)}}`,
        expression: source !== undefined ? chaine(source) : expression(noeud.contenu, this.contexte),
        alt: noeud.reglages?.decoratif ? '' : noeud.reglages?.description ?? (source !== undefined ? source.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ') : ''),
      },
      ...(noeud.reglages?.decoratif ? { decoratif: true } : {}),
      champ: {
        variable,
        setter: variable ? setterDe(variable) : '',
        genre: this.champsMotDePasse.has(noeud.id) ? 'motDePasse' : this.champsEmail.has(noeud.id) ? 'email' : undefined,
        ...(saisie ? { saisie } : {}),
        ...(saisie?.parmi ? { valeurs: expression(saisie.parmi, this.contexte) } : {}),
        ...(envoiClavier ? { envoie: true } : {}),
        ...(ouvert ? { ouvert: { variable: ouvert, setter: setterDe(ouvert) } } : {}),
      },
      envoie: noeud.genre === 'bouton' && formulaire !== undefined && !aSonClic,
      ...(noeud.image ? { image: this.image(noeud.image, noeud.contenu) } : {}),
    });

    if (this.montres.has(noeud.id) || this.caches.has(noeud.id)) {
      e.ligne(`{visibilite[${chaine(noeud.id)}] && ${balise}}`);
    } else {
      e.ligne(balise);
    }
  }
}

/** Les blocs d'éléments d'écran, écrits par le rendu de la plateforme. */
const COMPOSITES = new Set<string>(['onglets', 'deroulant', 'accordeon', 'carrousel', 'filAriane']);

/** Les listes et les types inconnus ont besoin d'être annotés pour TypeScript. */
function besoinAnnotation(type: TypeValeur): boolean {
  return type.genre === 'liste' || type.genre === 'inconnu';
}

/** Le texte écrit en clair, sans « {…} » ni versions dans d'autres langues ; sinon rien. */
function texteLitteral(valeur: Valeur): string | undefined {
  if (valeur.type === 'texte' && valeur.versions) return undefined;
  return texteDeBase(valeur);
}

/** Le texte écrit en clair dans la langue de base (son identité), même s'il a d'autres versions. */
function texteDeBase(valeur: Valeur): string | undefined {
  if (valeur.type !== 'texte' || !valeur.parties.every((p) => 'texte' in p)) return undefined;
  return valeur.parties.map((p) => ('texte' in p ? p.texte : '')).join('');
}

/** « bouton_voir_le_panier » → « voir_le_panier ». */
function sansGenre(id: string): string {
  return id.replace(/^(titre|texte|image|bouton|lien|champ)_/, '');
}

/** Vrai si les actions envoient des données au serveur, même dans un « si » ou une boucle. */
function contientEnvoi(actions: Action[]): boolean {
  return actions.some(
    (a) =>
      (a.type === 'requete' && a.mode === 'envoyer') ||
      a.type === 'suppression' ||
      a.type === 'modification' ||
      sousActions(a).some((liste) => contientEnvoi(liste)),
  );
}

/**
 * Vrai si les actions attendent quelque chose (une requête, une réponse, le
 * presse-papier) : la fonction est alors `async`. Le bloc d'une minuterie ou
 * du bouton d'un message s'exécute plus tard, à part : il ne compte pas.
 */
function contientRequete(actions: Action[]): boolean {
  return actions.some(
    (a) =>
      ATTENTES.has(a.type) ||
      (a.type !== 'minuterie' && a.type !== 'message' && sousActions(a).some((liste) => contientRequete(liste))),
  );
}

/** Vrai si le bloc d'une minuterie contient « arreter » pour elle (hors d'une boucle). */
function arrete(actions: Action[]): boolean {
  return actions.some((a) => a.type === 'arreter' || (!['repetition', 'tantQue', 'repeter', 'minuterie', 'message'].includes(a.type) && sousActions(a).some(arrete)));
}

const ATTENTES = new Set<Action['type']>(['requete', 'recharger', 'suppression', 'modification', 'connexion', 'deconnexion', 'envoiFichier', 'confirmation', 'copie', 'partage']);

/** Les noms changés par des actions : affectations, ajouts, retraits, réponses. */
function modifiees(actions: Action[], noms = new Set<string>()): Set<string> {
  for (const a of actions) {
    if (a.type === 'affectation') noms.add(a.nom);
    if (a.type === 'ajout' || a.type === 'retrait') noms.add(a.liste);
    if (a.type === 'requete' && a.resultat !== undefined) noms.add(a.resultat);
    if (a.type === 'envoiFichier') {
      if (a.suivi !== undefined) noms.add(a.suivi);
      if (a.resultat !== undefined) noms.add(a.resultat);
    }
    for (const liste of sousActions(a)) modifiees(liste, noms);
  }
  return noms;
}

/** La première valeur d'un élément de ce genre, affiché sans condition (même dans un bloc de mise en page). */
function premiereValeur(genre: string, noeuds: NoeudVue[]): Valeur | undefined {
  for (const n of noeuds) {
    if (n.type === 'element' && n.genre === genre) return n.contenu;
    if (n.type === 'bloc') {
      const trouvee = premiereValeur(genre, n.corps);
      if (trouvee) return trouvee;
    }
  }
  return undefined;
}

/**
 * Le titre et la description de la page (décision W7) : le premier titre
 * et le premier texte écrits en clair, à défaut le nom de la page.
 */
export function titreEtDescription(ecran: Ecran): { titre: string; description: string } {
  const premier = (genre: string, noeuds: NoeudVue[]): string | undefined => {
    for (const n of noeuds) {
      if (n.type === 'element' && n.genre === genre) {
        const texte = texteDeBase(n.contenu);
        if (texte) return texte;
      }
      // Toujours affiché : le contenu d'un bloc de mise en page compte aussi.
      if (n.type === 'bloc') {
        const texte = premier(genre, n.corps);
        if (texte) return texte;
      }
    }
    return undefined;
  };
  const nom = ecran.nom.replace(/_/g, ' ');
  const titre = premier('titre', ecran.vue) ?? nom.charAt(0).toUpperCase() + nom.slice(1);
  return { titre, description: premier('texte', ecran.vue) ?? titre };
}

/** Vrai si des actions contiennent un « rendre » (une fonction qui rend une valeur). */
function contientRendre(actions: Action[]): boolean {
  return actions.some(
    (a) =>
      a.type === 'rendre' ||
      sousActions(a).some((liste) => contientRendre(liste)),
  );
}

/** Les variables changées plus d'une fois, ou dans une boucle : elles ont besoin d'une copie à jour. */
function variablesASuivre(actions: Action[], lueEnsuite = false): Set<string> {
  const changements = new Map<string, number>();
  const suivies = new Set<string>();
  const parcourir = (liste: Action[], dansUneBoucle: boolean) => {
    for (const a of liste) {
      const nom =
        a.type === 'affectation' ? a.nom : a.type === 'ajout' || a.type === 'retrait' ? a.liste : a.type === 'requete' ? a.resultat : undefined;
      if (nom !== undefined) {
        changements.set(nom, (changements.get(nom) ?? 0) + 1);
        // La réponse d'une requête est souvent lue juste après (« pour chaque n dans nouveaux ») : elle a sa copie à jour.
        if (dansUneBoucle || changements.get(nom)! > 1 || (lueEnsuite && a.type === 'requete')) suivies.add(nom);
      }
      const boucle = a.type === 'repetition' || a.type === 'tantQue' || a.type === 'repeter';
      // Le bloc d'une minuterie ou du bouton d'un message lit les dernières valeurs à part (actuel).
      if (a.type === 'minuterie' || a.type === 'message') continue;
      for (const sous of sousActions(a)) parcourir(sous, dansUneBoucle || boucle);
    }
  };
  parcourir(actions, false);
  return suivies;
}
