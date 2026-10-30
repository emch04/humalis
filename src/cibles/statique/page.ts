import { verificationsDuChamp, messageEnCode, libellesEnLangues, type MessageEnLangues } from '../../i18n/messages.js';
/**
 * Un écran de la représentation intermédiaire → une page du site statique :
 * son contenu de départ, écrit dans le HTML (décision T2), et son script,
 * qui le redessine d'après l'état (décision T4).
 *
 * Les deux sont écrits ici, côte à côte, élément par élément, avec les
 * attributs dans le même ordre : le HTML de départ et le premier dessin du
 * script doivent donner exactement la même page.
 */
import { sousActions } from '../../ri/actions.js';
import { arbreWidget, arbreComposite, initiales, type AideWidget, type AideComposite, type Enfant } from './widgets.js';
import { iconeHtml, etoilesHtml } from './html-elements.js';
import { appelGraphique, htmlGraphique } from './graphique.js';
import { chercherIcone } from '../../vocabulaire/icones.js';
import type { Ecran, Etat, NoeudVue, Gestionnaire, Action, Valeur, TypeValeur, ComposantHumalis, Saisie, SorteSaisie, FonctionRI, ImageRI, LangueRI } from '../../ri/types.js';
import { nomDeLaCopie, estFichierLocal, type InfoMedia } from '../../ri/medias.js';
import { simplifier } from '../../analyse/elements.js';
import { Ecrivain } from '../web/ecrivain.js';
import { pascal, camel, chaine } from '../web/noms.js';
import { titreEtDescription } from '../web/ecran.js';
import { ficheAvec, typeDe } from '../web/valeurs.js';
import { echapperTexte, attributs } from './html.js';
import { decrireTouches } from '../web/interactions.js';
import {
  type ContexteJs,
  Environnement,
  nomJs,
  expressionJs,
  contenuJs,
  conditionJs,
  evaluer,
  texteDe,
  verifier,
} from './valeurs.js';

type Element = Extract<NoeudVue, { type: 'element' }>;

/** Ce que les pages du site partagent. */
export interface ContexteSite {
  partages: Etat[];
  /** Le début des clés du stockage du navigateur (« humalis:boutique »), comme sur le web. */
  cle: string;
  /** Pour chaque page : son fichier (« index.html », « panier.html »). */
  fichiers: Map<string, string>;
  /** Les composants écrits en Humalis, par nom. */
  composants: Map<string, ComposantHumalis>;
  /** Les images locales lues par la commande : leurs dimensions réservent la place. */
  medias?: Map<string, InfoMedia>;
  /** Les langues du site (bloc « langues ») : le HTML de départ est dans la première. */
  langues?: LangueRI[];
}

export interface PageStatique {
  /** Le contenu de départ de <main>, une ligne par élément. */
  html: string[];
  /** Le script de la page (ou la fonction d'un composant). */
  script: string;
  titre: string;
  description: string;
  /** Vrai si la page lit ou change la session. */
  session: boolean;
  /** Vrai si la page place un composant écrit en Humalis. */
  composants: boolean;
  /** Vrai si la page parle au serveur. */
  serveur: boolean;
}

interface Parametre {
  nom: string;
  type: TypeValeur;
}

interface Fonction {
  nom: string;
  parametres: Parametre[];
  actions: Action[];
  /** La soumission d'un formulaire : son identifiant (vérifications, puis champs vidés). */
  formulaire?: string;
}

/** Le type HTML d'une saisie d'une ligne, selon sa sorte (« champ telephone "…" »). */
const TYPES_SAISIE: Partial<Record<SorteSaisie, { type: string; autocomplete?: string }>> = {
  email: { type: 'email', autocomplete: 'email' },
  telephone: { type: 'tel', autocomplete: 'tel' },
  nombre: { type: 'number' },
  date: { type: 'date' },
  heure: { type: 'time' },
  motDePasse: { type: 'password', autocomplete: 'new-password' },
  adresseWeb: { type: 'url', autocomplete: 'url' },
};

const EVENEMENTS = { clic: 'onclick', survol: 'onmouseenter' } as const;

/** L'étoile d'un champ obligatoire, lue « obligatoire » par le libellé seulement. */
const ETOILE_JS = "creer('span', { class: 'humalis-obligatoire', 'aria-hidden': 'true' }, ' *')";
const ETOILE_HTML = '<span class="humalis-obligatoire" aria-hidden="true"> *</span>';

export function genererPageStatique(ecran: Ecran, site: ContexteSite, source: string): PageStatique {
  return new GenerateurPage(ecran, site, source).generer();
}

/** La fonction JavaScript d'un composant écrit en Humalis, et rien d'autre. */
/** fonctions.js : les fonctions écrites en haut du fichier (décision L2), chargées avant chaque page. */
export function genererFonctionsStatique(fonctions: FonctionRI[], site: ContexteSite, source: string): string {
  const vide: ComposantHumalis = { nom: 'fonctions', etat: [], calculs: [], vue: [], gestionnaires: [], parametres: [], ligne: 0 };
  const generateur = new GenerateurPage(vide, site, '', []);
  return `// Produit par Humalis depuis ${source} : les fonctions écrites en haut du fichier.
'use strict';

${fonctions.map((f) => generateur.fonctionGlobale(f)).join('\n')}`;
}

export function genererComposantStatique(composant: ComposantHumalis, site: ContexteSite): string {
  return new GenerateurPage(composant, site, '', composant.parametres).fonctionComposant();
}

/** Le contenu de départ d'un composant placé dans une page, avec ses propriétés. */
function htmlDuComposant(composant: ComposantHumalis, site: ContexteSite, proprietes: Map<string, unknown>, lignes: string[]): void {
  new GenerateurPage(composant, site, '', composant.parametres).htmlComposant(proprietes, lignes);
}

class GenerateurPage {
  private readonly contexte: ContexteJs = { types: new Map(), champs: new Map(), calculs: new Set() };
  private readonly montres = new Set<string>();
  private readonly caches = new Set<string>();
  private readonly textesChanges = new Set<string>();
  /** Pour chaque élément : ses événements (« onclick ») et les appels qu'ils font. */
  private readonly evenements = new Map<string, Map<string, string[]>>();
  /** Les champs qui ont une sorte ou des options (« champ nombre "Âge" avec obligatoire »). */
  private readonly saisies = new Map<string, Saisie>();
  /** Le libellé de chaque champ, pour les messages de vérification. */
  private readonly libelles = new Map<string, string>();
  /** Le libellé de chaque champ dans les autres langues (« Nom » en anglais « Name »), pour ses messages. */
  private readonly libellesLangues = new Map<string, Map<string, string>>();
  /** Chaque formulaire : son nom, ses champs, et l'appel de sa soumission s'il en a une. */
  private readonly formulaires = new Map<string, { nom: string; champs: string[]; soumission?: string }>();
  /** Pour un champ ou un bouton placé dans un formulaire : ce formulaire. */
  private readonly formulaireDe = new Map<string, string>();
  /** Pendant l'écriture d'une soumission qui envoie : la variable du compte des échecs du serveur. */
  private echecs?: string;
  private readonly fonctions: Fonction[] = [];
  private readonly chargements: Action[] = [];
  /** Les minuteries écrites dans la page : démarrées par humalis.demarrer. */
  private readonly minuteries: Extract<Action, { type: 'minuterie' }>[] = [];
  /** Dans le bloc d'une minuterie (hors d'une boucle) : « arreter » arrête la minuterie. */
  private dansMinuterie = false;
  /** Les raccourcis de la page : « appuie sur "controle+k" » et « avec raccourci ». */
  private readonly raccourcis: string[] = [];
  /** Les fenêtres de la page : fermées au départ, ouvertes par « montrer ». */
  private readonly fenetres = new Set<string>();
  /** « arrive en bas de "x" » : pour chaque bloc, la fonction et son gestionnaire. */
  private readonly basDesBlocs = new Map<string, { fonction: string; gestionnaire: Gestionnaire }>();
  /** Les lectures écrites dans un événement : « la dernière requête gagne ». */
  private dansEvenement = false;
  private dernieres = 0;
  private readonly nomsPris = new Set<string>();
  /** Pour chaque champ : sa clé dans les données envoyées (« email »), comme sur le web. */
  private readonly clesChamps = new Map<string, string>();
  private readonly champsEmail = new Set<string>();
  private readonly champsMotDePasse = new Set<string>();
  /** Le niveau de chaque titre : le premier de la page est <h1>, les suivants <h2> (comme sur le web). */
  private readonly niveaux = new Map<Element, number>();
  private titreVu = false;
  private besoins = { session: false, composants: false, serveur: false };

  constructor(
    private readonly ecran: Ecran,
    private readonly site: ContexteSite,
    private readonly source: string,
    /** Présents quand l'écran est un composant écrit en Humalis. */
    private readonly parametres?: { nom: string; type: TypeValeur }[],
  ) {
    if (site.langues) this.contexte.langues = true;
    const partages = parametres ? [] : site.partages;
    for (const e of [...partages, ...ecran.etat]) {
      this.contexte.types.set(e.nom, e.type);
      this.nomsPris.add(nomJs(e.nom));
    }
    for (const c of ecran.calculs) {
      this.contexte.types.set(c.nom, c.type);
      this.contexte.calculs.add(c.nom);
      this.nomsPris.add(nomJs(c.nom));
    }
    for (const p of parametres ?? []) this.contexte.types.set(p.nom, p.type);
    // « page "produit" avec parametre id » : lu dans l'adresse (produit.html?id=…), du texte.
    for (const p of ecran.parametresAdresse ?? []) {
      this.contexte.types.set(p, { genre: 'texte' });
      this.nomsPris.add(nomJs(p));
    }
    this.contexte.facultatives = new Set([...ecran.etat, ...ecran.calculs].filter((e) => e.facultatif).map((e) => e.nom));
    this.contexte.sortes = new Map();
    this.recenser(ecran.vue, []);
    for (const g of ecran.gestionnaires) this.enregistrer(g, []);
  }

  // ─── Recensement ────────────────────────────────────────────────────────

  private recenser(noeuds: NoeudVue[], boucles: Parametre[], formulaire?: string): void {
    for (const noeud of noeuds) {
      switch (noeud.type) {
        case 'element':
          if (noeud.genre === 'champ') {
            const libelle = texteDeBase(noeud.contenu) ?? noeud.id;
            this.contexte.champs.set(noeud.id, this.nomUnique(`champ_${simplifier(libelle) || noeud.id}`));
            this.clesChamps.set(noeud.id, camel(libelle));
            this.libelles.set(noeud.id, libelle);
            this.libellesLangues.set(noeud.id, libellesEnLangues(noeud.contenu));
            if (noeud.saisie) {
              this.saisies.set(noeud.id, noeud.saisie);
              const sorte = noeud.saisie.sorte;
              if (sorte === 'nombre' || sorte === 'case') this.contexte.sortes?.set(noeud.id, sorte);
            }
            if (formulaire !== undefined) this.formulaires.get(formulaire)?.champs.push(noeud.id);
          }
          if (formulaire !== undefined && (noeud.genre === 'champ' || noeud.genre === 'bouton')) {
            this.formulaireDe.set(noeud.id, formulaire);
          }
          if (noeud.genre === 'titre' || noeud.genre === 'soustitre') {
            this.niveaux.set(noeud, noeud.genre === 'soustitre' ? noeud.niveau ?? 2 : this.titreVu ? 2 : 1);
          }
          if (noeud.genre === 'titre') {
            this.titreVu = true;
          }
          // « avec raccourci » : la touche clique le bouton ou le lien, ou met le focus dans le champ.
          if (noeud.raccourci !== undefined) {
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
        case 'fenetre':
          this.fenetres.add(noeud.id);
          this.recenser(noeud.corps, boucles, formulaire);
          break;
        case 'condition':
          this.recenser(noeud.alors, boucles, formulaire);
          this.recenser(noeud.sinon, boucles, formulaire);
          break;
        case 'repetition': {
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
          this.besoins.composants = true;
          break;
      }
    }
  }

  private enregistrer(gestionnaire: Gestionnaire, parametres: Parametre[]): void {
    this.parcourirActions(gestionnaire.actions);
    if (gestionnaire.declencheur === 'chargement') {
      this.chargements.push(...gestionnaire.actions);
      return;
    }
    if (gestionnaire.declencheur === 'minuterie') {
      for (const a of gestionnaire.actions) if (a.type === 'minuterie') this.minuteries.push(a);
      return;
    }
    // « quand l'utilisateur arrive en bas de "catalogue" » : la même fonction pour le bas atteint et le bouton.
    if (gestionnaire.declencheur === 'bas') {
      const id = gestionnaire.cibles[0] ?? '';
      const fonction = this.nomUnique(`quandArriveEnBas${pascal(id.replace(/^bloc_/, ''))}`, false);
      this.fonctions.push({ nom: fonction, parametres, actions: gestionnaire.actions });
      this.basDesBlocs.set(id, { fonction, gestionnaire });
      return;
    }
    // « quand l'utilisateur appuie sur "controle+k" » : un raccourci de la page.
    if (gestionnaire.declencheur === 'touche') {
      if (gestionnaire.touches === undefined) return;
      const nom = this.nomUnique(`quandAppuie${pascal(gestionnaire.touches.replace(/\+/g, '_').replace(/[^a-z0-9_]/g, '_'))}`, false);
      this.fonctions.push({ nom, parametres, actions: gestionnaire.actions });
      const dans = gestionnaire.cibles[0];
      this.raccourcis.push(`[${chaine(gestionnaire.touches)}, ${nom}${dans !== undefined ? `, ${chaine(dans)}` : ''}]`);
      return;
    }
    // « ecrit dans "x" » : à chaque frappe ; « arrete d'ecrire dans "x" » : après la pause, ou à la touche Entrée.
    if (gestionnaire.declencheur === 'saisie' || gestionnaire.declencheur === 'pauseSaisie') {
      const id = gestionnaire.cibles[0] ?? '';
      const frappe = gestionnaire.declencheur === 'saisie';
      const nom = this.nomUnique(`quand${frappe ? 'Ecrit' : 'ArreteDEcrire'}${pascal(sansGenre(id))}`, false);
      this.fonctions.push({ nom, parametres, actions: gestionnaire.actions });
      const parAttribut = this.evenements.get(id) ?? new Map<string, string[]>();
      parAttribut.set(frappe ? 'onfrappe' : 'onpause', [frappe ? nom : `{ faire: ${nom}, millisecondes: ${gestionnaire.millisecondes ?? 300} }`]);
      this.evenements.set(id, parAttribut);
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
      formulaire.soumission = parametres.length === 0 ? nom : `() => ${nom}(${parametres.map((p) => nomJs(p.nom)).join(', ')})`;
      return;
    }

    if (gestionnaire.declencheur !== 'clic' && gestionnaire.declencheur !== 'survol') return;
    const attribut = EVENEMENTS[gestionnaire.declencheur];
    const verbe = gestionnaire.declencheur === 'clic' ? 'Clique' : 'Survole';
    const nom = this.nomUnique(`quand${verbe}${pascal(sansGenre(gestionnaire.cibles[0] ?? ''))}`, false);
    this.fonctions.push({ nom, parametres, actions: gestionnaire.actions });
    const appel = parametres.length === 0 ? nom : `${nom}(${parametres.map((p) => nomJs(p.nom)).join(', ')})`;
    for (const id of gestionnaire.cibles) {
      const parAttribut = this.evenements.get(id) ?? new Map<string, string[]>();
      parAttribut.set(attribut, [...(parAttribut.get(attribut) ?? []), appel]);
      this.evenements.set(id, parAttribut);
    }
  }

  private parcourirActions(actions: Action[]): void {
    for (const action of actions) {
      switch (action.type) {
        case 'visibilite':
          for (const id of action.ids) (action.visible ? this.montres : this.caches).add(id);
          break;
        case 'changerTexte':
          for (const id of action.ids) this.textesChanges.add(id);
          break;
        case 'requete':
        case 'suppression':
        case 'modification':
          this.besoins.serveur = true;
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
        case 'minuterie':
        case 'confirmation':
        case 'message':
          for (const liste of sousActions(action)) this.parcourirActions(liste);
          break;
      }
    }
  }

  private nomUnique(base: string, enCamel = true): string {
    const nom = enCamel ? nomJs(base) : base;
    let resultat = nom;
    for (let n = 2; this.nomsPris.has(resultat); n++) resultat = `${nom}${n}`;
    this.nomsPris.add(resultat);
    return resultat;
  }

  // ─── La page ────────────────────────────────────────────────────────────

  generer(): PageStatique {
    const { titre, description } = titreEtDescription(this.ecran);

    // Les fonctions et le dessin d'abord : on y lit les variables partagées
    // que la page utilise vraiment.
    const fonctions = new Ecrivain();
    for (const calcul of this.ecran.calculs) this.ecrireCalcul(fonctions, calcul.nom, calcul.valeur);
    for (const fonction of this.fonctions) this.ecrireFonction(fonctions, fonction);
    if (this.chargements.length > 0) {
      fonctions.ligne();
      fonctions.ligne('/** « quand la page se charge » : une fois, au démarrage. */');
      const asynchrone = contientRequete(this.chargements) ? 'async ' : '';
      fonctions.bloc(`${asynchrone}function auChargement() {`, () =>
        this.ecrireActions(fonctions, this.chargements, new Set(), modifiees(this.chargements)),
      );
    }
    if (this.minuteries.length > 0) {
      fonctions.ligne();
      fonctions.ligne('/** Les minuteries de la page : démarrées à son ouverture, chacune seulement tant que sa condition est vraie. */');
      fonctions.bloc('const minuteries = [', () => {
        for (const m of this.minuteries) {
          fonctions.bloc('{', () => {
            this.dansMinuterie = true;
            fonctions.bloc(`${contientRequete(m.corps) ? 'async ' : ''}faire(${arrete(m.corps) ? 'arreter' : ''}) {`, () => this.ecrireActions(fonctions, m.corps, new Set(), modifiees(m.corps)), '},');
            this.dansMinuterie = false;
            fonctions.ligne(`millisecondes: () => ${expressionJs(m.millisecondes, this.contexte)},`);
            if (m.mode === 'toutes') fonctions.ligne('repete: true,');
            if (m.tantQue) fonctions.ligne(`actif: () => ${conditionJs(m.tantQue, this.contexte)},`);
          }, '},');
        }
      }, '];');
    }
    if (this.raccourcis.length > 0) {
      fonctions.ligne();
      fonctions.ligne('/** Les raccourcis de la page : ses touches, ce qu’il fait, et l’élément où doit être le focus. */');
      fonctions.bloc('const raccourcis = [', () => this.raccourcis.forEach((r) => fonctions.ligne(`${r},`)), '];');
    }
    const dessin = new Ecrivain();
    dessin.ligne();
    dessin.ligne('/** Le contenu de la page, d’après l’état : au démarrage, puis après chaque événement. */');
    dessin.bloc('function dessiner() {', () => this.ecrireRetour(dessin, this.ecran.vue));
    const corps = fonctions.texte() + dessin.texte();
    const partages = this.site.partages.filter((p) => new RegExp(`\\b${nomJs(p.nom)}\\b`).test(corps));

    const etat = new Ecrivain();
    this.ecrireEtat(etat, partages);
    const memoire = new Ecrivain();
    const options = this.ecrireMemoire(memoire, partages);
    if (this.chargements.length > 0) options.push('auChargement');
    if (this.minuteries.length > 0) options.push('minuteries');
    if (this.raccourcis.length > 0) options.push('raccourcis');
    this.besoins.session = /\butilisateur\.(connecte|admin|seConnecter|seDeconnecter)\b/.test(corps);
    if (this.besoins.session) options.push('session: true');

    // Un écrivain vide rend une ligne vide : elle est laissée de côté.
    const code = [etat.texte(), fonctions.texte(), memoire.texte(), dessin.texte(), `\nhumalis.demarrer({ ${options.join(', ')} });\n`]
      .filter((partie) => partie !== '\n')
      .join('')
      .replace(/^\n+/, '');
    const outils = OUTILS_PAGE.filter((o) => new RegExp(`\\b${o}(\\(|\\.)`).test(code));
    const entete = [
      `// Produit par Humalis depuis ${this.source} : la page « ${this.ecran.nom} ».`,
      '// Son HTML contient déjà le contenu de départ, lisible sans JavaScript ;',
      '// ce script le redessine d’après l’état, après chaque événement.',
      "'use strict';",
      '',
      ...(outils.length > 0 ? [`const { ${outils.join(', ')} } = humalis;`, ''] : []),
    ].join('\n');

    const html: string[] = [];
    this.ecrireGroupeHtml(this.ecran.vue, this.environnement(), html);
    return {
      html,
      script: `${entete}\n${code}`,
      titre,
      description,
      session: this.besoins.session,
      composants: this.besoins.composants,
      serveur: this.besoins.serveur,
    };
  }

  /** `function Fiche({ nom, prix }) { … }` : un composant rend ses éléments. */
  fonctionComposant(): string {
    const parametres = (this.parametres ?? []).map((p) => nomJs(p.nom)).join(', ');
    const corps = new Ecrivain();
    corps.indenter(() => {
      for (const calcul of this.ecran.calculs) {
        corps.bloc(`function ${nomJs(calcul.nom)}() {`, () => corps.ligne(`return ${expressionJs(calcul.valeur, this.contexte)};`));
      }
      this.ecrireRetour(corps, this.ecran.vue);
    });
    const code = corps.texte();
    // Les outils sont pris dans la fonction : un « const » au niveau du
    // fichier se heurterait à celui du script de la page.
    const outils = OUTILS_PAGE.filter((o) => new RegExp(`\\b${o}(\\(|\\.)`).test(code));
    const prise = outils.length > 0 ? `  const { ${outils.join(', ')} } = humalis;\n` : '';
    return `/** Le composant « ${this.ecran.nom} »${parametres ? ` : il reçoit ${parametres}` : ''}. */
function ${pascal(this.ecran.nom)}(${parametres ? `{ ${parametres} }` : ''}) {
${prise}${code}}
`;
  }

  htmlComposant(proprietes: Map<string, unknown>, lignes: string[]): void {
    const env = new Environnement(this.contexte.types);
    for (const p of this.parametres ?? []) env.definir(p.nom, proprietes.get(p.nom));
    for (const c of this.ecran.calculs) env.definirCalcul(c.nom, c.valeur);
    this.ecrireGroupeHtml(this.ecran.vue, env, lignes);
  }

  // ─── L'état ─────────────────────────────────────────────────────────────

  private ecrireEtat(e: Ecrivain, partages: Etat[]): void {
    if (this.ecran.parametresAdresse?.length) {
      e.ligne('// Les paramètres de la page, lus dans son adresse (produit.html?id=…).');
      for (const p of this.ecran.parametresAdresse) {
        e.ligne(`const ${nomJs(p)} = new URLSearchParams(location.search).get(${chaine(camel(p))}) ?? '';`);
      }
    }
    if (this.ecran.etat.length > 0) {
      e.ligne('// L’état de la page.');
      for (const etat of this.ecran.etat) e.ligne(`let ${nomJs(etat.nom)} = ${expressionJs(etat.initiale, this.contexte)};`);
    }
    if (partages.length > 0) {
      e.ligne('// Partagées entre les pages (« avec partagee ») : relues au démarrage.');
      for (const p of partages) e.ligne(`let ${nomJs(p.nom)} = ${expressionJs(p.initiale, this.contexte)};`);
    }
    if (this.contexte.champs.size > 0) {
      e.ligne('// Ce qui est tapé dans les champs.');
      for (const [id, variable] of this.contexte.champs) e.ligne(`let ${variable} = ${this.contexte.sortes?.get(id) === 'case' ? 'false' : "''"};`);
    }
    const visibles = [...new Set([...this.montres, ...this.caches, ...this.fenetres])];
    if (visibles.length > 0) {
      // Un élément que l'on montre est caché au départ ; un élément que
      // l'on cache seulement est visible au départ ; une fenêtre est fermée.
      e.ligne('// Les éléments montrés ou cachés.');
      e.ligne(`let visibilite = { ${visibles.map((id) => `${chaine(id)}: ${!this.montres.has(id) && !this.fenetres.has(id)}`).join(', ')} };`);
    }
    if (this.textesChanges.size > 0) {
      e.ligne('// Les textes changés par un événement.');
      e.ligne('let textes = {};');
    }
  }

  private ecrireCalcul(e: Ecrivain, nom: string, valeur: Valeur): void {
    e.ligne();
    e.ligne(`/** « calcul ${nom} » : recalculé à chaque fois. */`);
    e.bloc(`function ${nomJs(nom)}() {`, () => e.ligne(`return ${expressionJs(valeur, this.contexte)};`));
  }

  /**
   * `relire()` et `garder()` : ce qui est gardé hors de la page (décision T5).
   * Renvoie les options de `humalis.demarrer`.
   */
  private ecrireMemoire(e: Ecrivain, partages: Etat[]): string[] {
    const gardees: { nom: string; lire: string; garder: string; cle: string }[] = [];
    for (const p of partages) {
      // Les données d'un fichier sont déjà écrites dans chaque page : rien à faire passer d'une page à l'autre.
      if (p.lectureSeule) continue;
      const [lire, garder] = p.memorisee ? ['lireMemoire', 'garderMemoire'] : ['lirePartage', 'garderPartage'];
      gardees.push({ nom: nomJs(p.nom), lire, garder, cle: `${this.site.cle}:partage:${p.nom}` });
    }
    for (const etat of this.ecran.etat) {
      if (!etat.memorisee) continue;
      gardees.push({
        nom: nomJs(etat.nom),
        lire: 'lireMemoire',
        garder: 'garderMemoire',
        cle: `${this.site.cle}:${simplifier(this.ecran.nom)}:${simplifier(etat.nom)}`,
      });
    }
    if (gardees.length === 0) return ['dessiner'];
    e.ligne();
    e.ligne('/** Relit ce qui est gardé hors de la page : partagé entre les pages, ou mémorisé. */');
    e.bloc('function relire() {', () => {
      for (const g of gardees) e.ligne(`${g.nom} = ${g.lire}(${chaine(g.cle)}, ${g.nom});`);
    });
    e.ligne();
    e.ligne('/** Garde ces variables, pour les autres pages et pour le retour du visiteur. */');
    e.bloc('function garder() {', () => {
      for (const g of gardees) e.ligne(`${g.garder}(${chaine(g.cle)}, ${g.nom});`);
    });
    return ['relire', 'garder', 'dessiner'];
  }

  // ─── Les événements ─────────────────────────────────────────────────────

  private ecrireFonction(e: Ecrivain, fonction: Fonction): void {
    const parametres = fonction.parametres.map((p) => nomJs(p.nom)).join(', ');
    const asynchrone = contientRequete(fonction.actions) ? 'async ' : '';
    const locales = new Set(fonction.parametres.map((p) => p.nom));
    const formulaire = fonction.formulaire !== undefined ? this.formulaires.get(fonction.formulaire) : undefined;
    e.ligne();
    this.dansEvenement = true;
    e.bloc(`${asynchrone}function ${fonction.nom}(${parametres}) {`, () => {
      if (!formulaire) {
        this.ecrireActions(e, fonction.actions, locales, modifiees(fonction.actions));
        return;
      }
      // La soumission d'un formulaire, comme sur le web : ses champs sont
      // vérifiés, puis, si tout s'est bien passé, vidés. Une requête refusée
      // arrête l'événement : les champs restent remplis pour corriger.
      for (const id of formulaire.champs) {
        for (const [test, message] of this.verifications(id)) {
          e.bloc(`if (${test}) {`, () => {
            e.ligne(`afficherMessage(${messageEnCode(message, chaine)}, 'erreur');`);
            e.ligne('return;');
          });
        }
      }
      if (contientEnvoi(fonction.actions)) {
        this.echecs = this.nomsPris.has('echecs') ? 'echecsAvantEnvoi' : 'echecs';
        e.ligne(`const ${this.echecs} = serveur.echecs();`);
      }
      this.ecrireActions(e, fonction.actions, locales, modifiees(fonction.actions));
      this.echecs = undefined;
      for (const id of formulaire.champs) {
        const variable = this.contexte.champs.get(id);
        if (variable) e.ligne(`${variable} = ${this.contexte.sortes?.get(id) === 'case' ? 'false' : "''"};`);
      }
    });
    this.dansEvenement = false;
  }

  /** Ce qui est vérifié avant d'envoyer un formulaire, pour ce champ : (condition d'erreur, message), comme sur le web. */
  private verifications(id: string): [string, MessageEnLangues][] {
    const variable = this.contexte.champs.get(id);
    if (variable === undefined) return [];
    const libelle = this.libelles.get(id) ?? id;
    // Le libellé dans chaque langue du site : sa version, sinon celui de base.
    const libelles = (this.site.langues ?? [{ code: 'fr' }]).map(({ code }) => ({ code, libelle: this.libellesLangues.get(id)?.get(code) ?? libelle }));
    return verificationsDuChamp(variable, this.saisies.get(id), libelles);
  }

  /** Une fonction écrite en haut du fichier, en JavaScript : ses paramètres sont des variables locales. */
  fonctionGlobale(f: FonctionRI): string {
    const e = new Ecrivain();
    for (const p of f.parametres) this.contexte.types.set(p.nom, p.type);
    e.bloc(`function ${nomJs(f.nom)}(${f.parametres.map((p) => nomJs(p.nom)).join(', ')}) {`, () =>
      this.ecrireActions(e, f.corps, new Set(f.parametres.map((p) => p.nom)), modifiees(f.corps)),
    );
    return e.texte();
  }

  private ecrireActions(e: Ecrivain, actions: Action[], locales: Set<string>, modifiees: Set<string>): void {
    const x = (v: Valeur) => expressionJs(v, this.contexte);
    for (const action of actions) {
      switch (action.type) {
        case 'rendre':
          e.ligne(`return ${x(action.valeur)};`);
          break;
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
            e.bloc(`action: { libelle: ${chaine(bouton.libelle)}, ${contientRequete(bouton.actions) ? 'async ' : ''}faire() {`, () => this.ecrireActions(e, bouton.actions, new Set(locales), modifiees), '} },');
          }, '});');
          break;
        }
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
          e.ligne(`await copier(${this.enTexte(action.valeur)}${action.message === null ? ', null' : action.message === 'Copié' ? '' : `, ${chaine(action.message)}`});`);
          break;
        case 'partage': {
          // La feuille de partage du système ; sans elle, le lien (ou le texte) est copié.
          const lien = action.lien;
          const adresse = !lien
            ? undefined
            : 'externe' in lien
              ? chaine(lien.externe)
              : `new URL(${lien.arguments?.length ? this.adresseAvec(lien.ecran, lien.arguments) : chaine(this.fichier(lien.ecran))}, location.href).href`;
          const donnees = [`texte: ${this.enTexte(action.texte)}`, ...(action.titre ? [`titre: ${this.enTexte(action.titre)}`] : []), ...(adresse ? [`adresse: ${adresse}`] : [])];
          e.ligne(`await partager({ ${donnees.join(', ')} });`);
          break;
        }
        case 'minuterie': {
          // Lancée par l'événement, annulée quand on quitte la page ; chaque tour redessine la page.
          const options = [...(action.mode === 'toutes' ? ['repete: true'] : []), ...(action.tantQue ? [`tantQue: () => ${conditionJs(action.tantQue, this.contexte)}`] : [])];
          const avant = this.dansMinuterie;
          this.dansMinuterie = true;
          e.bloc(`planifier(${contientRequete(action.corps) ? 'async ' : ''}(${arrete(action.corps) ? 'arreter' : ''}) => {`, () => this.ecrireActions(e, action.corps, new Set(locales), modifiees), `}, ${x(action.millisecondes)}${options.length > 0 ? `, { ${options.join(', ')} }` : ''});`);
          this.dansMinuterie = avant;
          break;
        }
        case 'visibilite':
          for (const id of action.ids) e.ligne(`visibilite = { ...visibilite, ${chaine(id)}: ${action.visible} };`);
          break;
        case 'navigation': {
          const page = texteLitteral(action.ecran);
          const vers = action.arguments && page !== undefined ? this.adresseAvec(page, action.arguments) : this.adresse(action.ecran);
          e.ligne(`location.assign(${vers});`);
          break;
        }
        case 'changerTexte':
          for (const id of action.ids) e.ligne(`textes = { ...textes, ${chaine(id)}: ${x(action.texte)} };`);
          break;
        case 'theme':
          e.ligne(`definirTheme(${chaine(action.valeur)});`);
          break;
        case 'langue':
          e.ligne(`changerLangue(${chaine(action.code)});`);
          break;
        case 'affectation':
          e.ligne(
            `${nomJs(action.nom)} = ${action.champs ? ficheAvec(nomJs(action.nom), action.champs, x(action.valeur)) : x(action.valeur)};`,
          );
          break;
        case 'locale':
          locales.add(action.nom);
          e.ligne(`${modifiees.has(action.nom) ? 'let' : 'const'} ${nomJs(action.nom)} = ${x(action.valeur)};`);
          break;
        case 'ajout':
          e.ligne(`${nomJs(action.liste)} = [...${nomJs(action.liste)}, ${x(action.valeur)}];`);
          break;
        case 'retrait':
          e.ligne(`${nomJs(action.liste)} = retirerPremier(${nomJs(action.liste)}, ${x(action.valeur)});`);
          break;
        case 'requete': {
          const args = [chaine(action.adresse)];
          if (action.mode === 'envoyer') args.push(this.donnees(action.donnees, action.cles));
          // « avec id » : l'identifiant de l'élément à lire.
          if (action.mode === 'lireUn') args.push(x(action.donnees[0]));
          const appel = `await serveur.${action.mode}(${args.join(', ')}`;
          // La valeur actuelle est gardée si le serveur ne répond pas.
          if (action.resultat !== undefined && this.dansEvenement) {
            // Dans un événement, « la dernière requête gagne » : une réponse lente ne remplace pas une plus récente.
            const n = ++this.dernieres;
            e.ligne(`const derniere${n} = derniereRequete(${chaine(action.resultat)});`);
            e.ligne(`const reponse${n} = ${appel}, ${nomJs(action.resultat)});`);
            e.ligne(`if (!derniere${n}()) return;`);
            e.ligne(`${nomJs(action.resultat)} = reponse${n};`);
          } else if (action.resultat !== undefined) e.ligne(`${nomJs(action.resultat)} = ${appel}, ${nomJs(action.resultat)});`);
          else e.ligne(`${appel});`);
          // Un envoi refusé arrête la soumission d'un formulaire : ses champs restent remplis.
          if (this.echecs && action.mode === 'envoyer') e.ligne(`if (serveur.echecs() > ${this.echecs}) return;`);
          break;
        }
        case 'suppression':
        case 'modification': {
          const appel =
            action.type === 'suppression'
              ? `await serveur.supprimer(${chaine(action.adresse)}, ${x(action.objet)}.id);`
              : `await serveur.modifier(${chaine(action.adresse)}, ${x(action.objet)}.id, { ${action.changements
                  .map((c) => (camel(c.champ) === x(c.valeur) ? x(c.valeur) : `${camel(c.champ)}: ${x(c.valeur)}`))
                  .join(', ')} });`;
          // Une variable « = rien » pas encore lue n'a pas d'identifiant : rien n'est envoyé.
          const facultatif = action.objet.type === 'variable' && this.contexte.facultatives?.has(action.objet.nom);
          if (facultatif) e.bloc(`if (${x(action.objet)} !== null) {`, () => e.ligne(appel));
          else e.ligne(appel);
          if (this.echecs) e.ligne(`if (serveur.echecs() > ${this.echecs}) return;`);
          break;
        }
        case 'connexion': {
          // Le mot de passe est effacé de son champ dès l'envoi : il n'est
          // gardé nulle part. Si la connexion échoue, un message s'affiche et
          // la suite de l'événement ne s'exécute pas.
          const champ = action.motDePasse.type === 'champ' ? this.contexte.champs.get(action.motDePasse.id) : undefined;
          let motDePasse = x(action.motDePasse);
          if (champ) {
            e.ligne(`const motDePasseSaisi = ${champ};`);
            e.ligne(`${champ} = '';`);
            motDePasse = 'motDePasseSaisi';
          }
          e.ligne(`if (!(await utilisateur.seConnecter(${x(action.email)}, ${motDePasse}))) return;`);
          break;
        }
        case 'deconnexion':
          e.ligne('await utilisateur.seDeconnecter();');
          break;
        case 'si':
          e.bloc(`if (${conditionJs(action.test, this.contexte)}) {`, () => this.ecrireActions(e, action.alors, locales, modifiees),
            action.sinon.length > 0 ? '} else {' : '}');
          if (action.sinon.length > 0) {
            e.indenter(() => this.ecrireActions(e, action.sinon, locales, modifiees));
            e.ligne('}');
          }
          break;
        case 'repetition':
          locales.add(action.variable);
          e.bloc(`for (const ${nomJs(action.variable)} of ${x(action.liste)}) {`, () =>
            this.dansUneBoucle(() => this.ecrireActions(e, action.corps, locales, modifiees)),
          );
          break;
        case 'tantQue':
          e.bloc(`while (${conditionJs(action.test, this.contexte)}) {`, () => this.dansUneBoucle(() => this.ecrireActions(e, action.corps, locales, modifiees)));
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
    }
  }

  /** Une valeur écrite en texte, comme dans « {…} » : un nombre au format français. */
  private enTexte(valeur: Valeur): string {
    const code = expressionJs(valeur, this.contexte);
    const type = typeDe(valeur, { types: this.contexte.types, champs: this.contexte.champs, sortes: this.contexte.sortes }).genre;
    return type === 'texte' ? code : type === 'nombre' ? `formaterNombre(${code})` : `String(${code})`;
  }

  /** La sentinelle (observée par humalis.js) et le bouton « Voir plus », qui appellent la même fonction. */
  private voirPlusJs(id: string, fonction: string, bouton: string | null): string[] {
    return [
      `creer('div', { class: 'humalis-sentinelle', 'data-humalis': ${chaine(`${id}-bas`)}, 'aria-hidden': 'true', onbas: ${fonction} })`,
      ...(bouton === null
        ? []
        : [`creer('button', { type: 'button', class: 'humalis-voir-plus', 'data-humalis': ${chaine(`${id}-voir-plus`)}, onclick: ${fonction} }, ${bouton === 'Voir plus' && this.site.langues ? "t({ fr: 'Voir plus', en: 'See more' })" : chaine(bouton)})`]),
    ];
  }

  /** Le corps d'une boucle : « arreter » y sort de la boucle, pas de la minuterie qui l'entoure. */
  private dansUneBoucle(ecrire: () => void): void {
    const avant = this.dansMinuterie;
    this.dansMinuterie = false;
    ecrire();
    this.dansMinuterie = avant;
  }

  /** `{ email: champEmail, age }` : les données envoyées au serveur, comme sur le web. */
  private donnees(valeurs: Valeur[], cles?: (string | undefined)[]): string {
    const paires = valeurs.map((v, i) => {
      const ecrite = cles?.[i];
      const cle = ecrite !== undefined ? (/^[A-Za-z_]\w*$/.test(ecrite) ? ecrite : JSON.stringify(ecrite)) : v.type === 'champ' ? (this.clesChamps.get(v.id) ?? camel(v.id)) : v.type === 'variable' ? nomJs(v.nom) : 'valeur';
      const valeur = expressionJs(v, this.contexte);
      return cle === valeur ? cle : `${cle}: ${valeur}`;
    });
    return `{ ${paires.join(', ')} }`;
  }

  /** L'adresse d'une page à paramètre : `produit.html?id=${…}`. */
  private adresseAvec(page: string, args: { nom: string; valeur: Valeur }[]): string {
    const requete = args.map((a) => `${camel(a.nom)}=\${encodeURIComponent(String(${expressionJs(a.valeur, this.contexte)}))}`).join('&');
    return `\`${this.fichier(page)}?${requete}\``;
  }

  /** L'adresse d'une page : son fichier, écrit en clair quand on le connaît. */
  private adresse(ecran: Valeur): string {
    const nom = texteLitteral(ecran);
    if (nom !== undefined) return chaine(this.fichier(nom));
    return `adresseDe(${expressionJs(ecran, this.contexte)})`;
  }

  /** Une page absente (déjà signalée par un avertissement) : le nom de la page, en .html. */
  private fichier(nom: string): string {
    return this.site.fichiers.get(nom) ?? `${simplifier(nom) || 'index'}.html`;
  }

  // ─── La vue, en JavaScript ──────────────────────────────────────────────

  /** `return [ … ];` : les éléments d'un groupe, avec ses variables locales d'abord. */
  private ecrireRetour(e: Ecrivain, noeuds: NoeudVue[]): void {
    for (const l of noeuds) {
      if (l.type === 'locale') e.ligne(`const ${nomJs(l.nom)} = ${expressionJs(l.valeur, this.contexte)};`);
    }
    e.ligne('return [');
    e.indenter(() => this.ecrireVue(e, noeuds));
    e.ligne('];');
  }

  /** Un groupe placé dans une expression : `[ … ]`, ou une petite fonction s'il a des variables locales. */
  private ecrireGroupe(e: Ecrivain, noeuds: NoeudVue[], ouverture: string, fermeture: string): void {
    if (noeuds.some((n) => n.type === 'locale')) {
      e.bloc(`${ouverture}(() => {`, () => this.ecrireRetour(e, noeuds), `})()${fermeture}`);
    } else {
      e.bloc(`${ouverture}[`, () => this.ecrireVue(e, noeuds), `]${fermeture}`);
    }
  }

  private ecrireVue(e: Ecrivain, noeuds: NoeudVue[]): void {
    for (const noeud of noeuds) {
      switch (noeud.type) {
        case 'element': {
          const element = this.elementJs(noeud);
          if (this.montres.has(noeud.id) || this.caches.has(noeud.id)) {
            e.ligne(`...(visibilite[${chaine(noeud.id)}] ? [${element}] : []),`);
          } else {
            e.ligne(`${element},`);
          }
          break;
        }
        case 'condition': {
          e.ligne(`...(${conditionJs(noeud.test, this.contexte)}`);
          e.indenter(() => {
            this.ecrireGroupe(e, noeud.alors, '? ', '');
            if (noeud.sinon.length > 0) this.ecrireGroupe(e, noeud.sinon, ': ', '),');
            else e.ligne(': []),');
          });
          break;
        }
        case 'repetition': {
          const debut = `...${expressionJs(noeud.liste, this.contexte)}.flatMap((${nomJs(noeud.variable)}) => `;
          if (noeud.corps.some((n) => n.type === 'locale')) {
            e.bloc(`${debut}{`, () => this.ecrireRetour(e, noeud.corps), '}),');
          } else {
            e.bloc(`${debut}[`, () => this.ecrireVue(e, noeud.corps), ']),');
          }
          break;
        }
        case 'widget':
          this.ecrireEnfantJs(e, arbreWidget(noeud.genre, this.aide(noeud, this.environnement())));
          break;
        case 'carte':
          this.carteJs(e, noeud);
          break;
        case 'marqueur':
          // Écrit par sa carte.
          break;
        case 'fenetre': {
          // Fermée au départ ; « montrer » l'ouvre ; Échap, la croix ou un clic à côté la ferment (humalis.fenetre).
          const reglages = [
            `titre: ${chaine(noeud.titre)}`,
            ...(noeud.description !== undefined ? [`description: ${chaine(noeud.description)}`] : []),
            ...(noeud.obligatoire ? ['obligatoire: true'] : []),
            ...(noeud.classes.length > 0 ? [`classes: ${chaine(noeud.classes.join(' '))}`] : []),
            `ouverte: visibilite[${chaine(noeud.id)}]`,
            `fermer: () => { visibilite = { ...visibilite, ${chaine(noeud.id)}: false }; }`,
          ];
          this.ecrireGroupe(e, noeud.corps, `fenetre(${chaine(noeud.id)}, { ${reglages.join(', ')} }, ...`, '),');
          break;
        }
        case 'graphique':
          e.ligne(`${appelGraphique(noeud, (v) => expressionJs(v, this.contexte))},`);
          break;
        case 'bloc': {
          if (COMPOSITES.has(noeud.genre)) {
            this.ecrireEnfantJs(e, arbreComposite(this.aideComposite(noeud, this.environnement())));
            break;
          }
          const balise = BALISES_BLOC[noeud.genre] ?? 'div';
          this.ecrireGroupe(e, noeud.corps, `creer('${balise}', { class: ${chaine(classesDuBloc(noeud))} }, ...`, '),');
          // « arrive en bas de » ce bloc : la sentinelle observée et le vrai bouton « Voir plus », tant que la condition est vraie.
          const bas = noeud.id !== undefined ? this.basDesBlocs.get(noeud.id) : undefined;
          if (bas) {
            const enfants = this.voirPlusJs(noeud.id!, bas.fonction, bas.gestionnaire.bouton ?? null);
            const tantQue = bas.gestionnaire.tantQue ? conditionJs(bas.gestionnaire.tantQue, this.contexte) : undefined;
            if (tantQue) e.ligne(`...(${tantQue} ? [${enfants.join(', ')}] : []),`);
            else enfants.forEach((enfant) => e.ligne(`${enfant},`));
          }
          break;
        }
        case 'formulaire': {
          // Entrée ou le bouton envoient le formulaire, sans recharger la page.
          const soumission = this.formulaires.get(noeud.id)?.soumission ?? '() => {}';
          const ouverture = `creer('form', { 'data-humalis': ${chaine(noeud.id)}, class: 'humalis-formulaire', novalidate: true, onsubmit: ${soumission} }, ...`;
          if (this.montres.has(noeud.id) || this.caches.has(noeud.id)) {
            this.ecrireGroupe(e, noeud.corps, `...(visibilite[${chaine(noeud.id)}] ? [${ouverture}`, ')] : []),');
          } else {
            this.ecrireGroupe(e, noeud.corps, ouverture, '),');
          }
          break;
        }
        case 'composant': {
          const proprietes = noeud.proprietes.map((p) => `${nomJs(p.nom)}: ${expressionJs(p.valeur, this.contexte)}`);
          e.ligne(`...${noeud.nom}(${proprietes.length ? `{ ${proprietes.join(', ')} }` : ''}),`);
          break;
        }
        case 'locale':
          // Écrite au début de son groupe (ecrireRetour).
          break;
      }
    }
  }

  /** `creer('p', { … }, contenu)`. */
  private elementJs(noeud: Element): string {
    const commun = (avant: [string, string][] = []): [string, string][] => {
      const liste: [string, string][] = [...avant, ["'data-humalis'", chaine(noeud.id)]];
      const classes = this.classes(noeud);
      if (classes) liste.push(['class', chaine(classes)]);
      // « avec annonce » : un lecteur d'écran lit l'élément quand il change.
      if (noeud.annonce) liste.push(["'aria-live'", "'polite'"], ["'aria-atomic'", "'true'"]);
      for (const [nom, valeur] of attributsRaccourci(noeud)) liste.push([chaine(nom), chaine(valeur)]);
      for (const [attribut, appels] of this.evenements.get(noeud.id) ?? []) {
        const reference = appels.length === 1 && !appels[0].includes('(');
        const valeur = reference
          ? appels[0]
          : appels.length === 1
            ? `() => ${appels[0]}`
            : `async () => { ${appels.map((a) => `await ${a.includes('(') ? a : `${a}()`};`).join(' ')} }`;
        liste.push([attribut, valeur]);
      }
      return liste;
    };
    const objet = (liste: [string, string][]) => `{ ${liste.map(([n, v]) => `${n}: ${v}`).join(', ')} }`;
    // Une icône avant le texte (avec icone "panier") : un enfant de plus, avant le contenu.
    const lucideIcone = noeud.reglages?.icone ? chercherIcone(noeud.reglages.icone)?.lucide : undefined;
    const contenu =
      (lucideIcone ? `icone(${chaine(lucideIcone)}, 'humalis-icone'), ` : '') +
      (this.textesChanges.has(noeud.id)
        ? `textes[${chaine(noeud.id)}] ?? ${contenuJs(noeud.contenu, this.contexte)}`
        : contenuJs(noeud.contenu, this.contexte));

    switch (noeud.genre) {
      case 'titre':
      case 'soustitre':
        return `creer('h${this.niveaux.get(noeud) ?? 1}', ${objet(commun())}, ${contenu})`;
      case 'texte':
        return `creer('p', ${objet(commun())}, ${contenu})`;
      case 'bouton': {
        // Le bouton d'un formulaire l'envoie (Entrée aussi) ; un bouton qui a son propre clic garde son clic.
        const envoie = this.formulaireDe.has(noeud.id) && !this.evenements.has(noeud.id);
        return `creer('button', ${objet(commun([['type', envoie ? "'submit'" : "'button'"]]))}, ${contenu})`;
      }
      case 'lien': {
        const vers = noeud.arguments && noeud.cible !== undefined ? this.adresseAvec(noeud.cible, noeud.arguments) : chaine(this.fichier(noeud.cible ?? ''));
        return `creer('a', ${objet(commun([['href', vers]]))}, ${contenu})`;
      }
      case 'image': {
        if (noeud.image) return `creer('img', ${objet(commun(this.attributsImage(noeud.image, noeud.contenu, (v) => expressionJs(v, this.contexte), chaine, (n) => `'${n}'`)))})`;
        const source = texteLitteral(noeud.contenu);
        const src = source !== undefined ? chaine(source) : expressionJs(noeud.contenu, this.contexte);
        return `creer('img', ${objet(commun([['src', src], ['alt', chaine(noeud.reglages?.decoratif ? '' : noeud.reglages?.description ?? alt(source))], ...(noeud.reglages?.decoratif ? [['aria-hidden', "'true'"] as [string, string]] : [])]))})`;
      }
      case 'champ':
        return this.champJs(noeud, commun, objet, contenu);
    }
  }

  /** Un champ, selon sa sorte : saisie d'une ligne, texte long, case, choix ou liste (comme sur le web). */
  private champJs(
    noeud: Element,
    commun: (avant?: [string, string][]) => [string, string][],
    objet: (liste: [string, string][]) => string,
    contenu: string,
  ): string {
    const variable = this.contexte.champs.get(noeud.id)!;
    const saisie = noeud.saisie;
    const sorte = saisie?.sorte ?? 'texte';
    const lu = `(evenement) => { ${variable} = evenement.target.value; }`;
    const libelle = saisie?.obligatoire ? `creer('span', {}, ${contenu}, ${ETOILE_JS})` : contenu;
    const options = (liste: [string, string][]) => {
      if (saisie?.obligatoire) liste.push(['required', 'true']);
      if (saisie?.indice !== undefined && sorte !== 'liste') liste.push(['placeholder', saisie.indiceLangues ? messageEnCode(saisie.indiceLangues, chaine) : chaine(saisie.indice)]);
      if (saisie?.minimum !== undefined) liste.push(['min', String(saisie.minimum)]);
      if (saisie?.maximum !== undefined) liste.push(['max', String(saisie.maximum)]);
      return liste;
    };
    switch (sorte) {
      case 'case': {
        const liste = options(commun([['type', "'checkbox'"]]));
        liste.push(['checked', variable], ['oninput', `(evenement) => { ${variable} = evenement.target.checked; }`]);
        return `creer('label', { class: 'humalis-case' }, creer('input', ${objet(liste)}), ${libelle})`;
      }
      case 'choix': {
        const parmi = saisie?.parmi ? expressionJs(saisie.parmi, this.contexte) : '[]';
        const radio = `creer('input', { type: 'radio', name: ${chaine(noeud.id)}, value: valeur, checked: ${variable} === valeur, oninput: () => { ${variable} = valeur; } })`;
        const classes = this.classes(noeud);
        const groupe: [string, string][] = [["'data-humalis'", chaine(noeud.id)], ['class', chaine(classes ? `${classes} humalis-choix` : 'humalis-choix')]];
        return `creer('fieldset', ${objet(groupe)}, creer('legend', {}, ${libelle}), ...${parmi}.map((valeur) => creer('label', {}, ${radio}, valeur)))`;
      }
      case 'liste': {
        const parmi = saisie?.parmi ? expressionJs(saisie.parmi, this.contexte) : '[]';
        const liste = options(commun());
        liste.push(['oninput', lu]);
        const premiere = `creer('option', { value: '', selected: ${variable} === '' }, ${saisie?.indiceLangues ? messageEnCode(saisie.indiceLangues, chaine) : chaine(saisie?.indice ?? 'Choisissez…')})`;
        return `creer('label', { class: 'humalis-champ' }, ${libelle}, creer('select', ${objet(liste)}, ${premiere}, ...${parmi}.map((valeur) => creer('option', { value: valeur, selected: ${variable} === valeur }, valeur))))`;
      }
      case 'texteLong': {
        const liste = options(commun([['rows', '4']]));
        liste.push(['value', variable], ['oninput', lu]);
        return `creer('label', { class: 'humalis-champ' }, ${libelle}, creer('textarea', ${objet(liste)}))`;
      }
      default: {
        // Les champs de « se connecter » gardent le rôle que le navigateur connaît (username, current-password).
        const genre = this.genreChamp(noeud) ?? TYPES_SAISIE[sorte];
        const liste = commun();
        if (genre) liste.push(['type', chaine(genre.type)]);
        if (genre?.autocomplete) liste.push(['autocomplete', chaine(genre.autocomplete)]);
        options(liste);
        liste.push(['value', variable], ['oninput', lu]);
        return `creer('label', { class: 'humalis-champ' }, ${libelle}, creer('input', ${objet(liste)}))`;
      }
    }
  }

  /**
   * Les attributs d'une image (décision M4 à M6), dans le même ordre pour le HTML de départ et le script :
   * la copie locale, la description (vide si décorative), les dimensions lues, la priorité, les proportions.
   * `valeur` traduit une valeur, `texte` écrit un texte fixe (entre guillemets pour le script).
   */
  private attributsImage(image: ImageRI, contenu: Valeur, valeur: (v: Valeur) => string, texte: (t: string) => string, cle: (n: string) => string = (n) => n): [string, string][] {
    const info = image.locale !== undefined ? this.site.medias?.get(image.locale) : undefined;
    const attributs: [string, string][] = [
      [cle('src'), image.locale !== undefined ? texte(`images/${nomDeLaCopie(image.locale)}`) : valeur(contenu)],
      [cle('alt'), image.description ? valeur(image.description) : texte('')],
    ];
    if (info?.largeur && info.hauteur) attributs.push([cle('width'), texte(String(info.largeur))], [cle('height'), texte(String(info.hauteur))]);
    attributs.push(image.prioritaire ? [cle('fetchpriority'), texte('high')] : [cle('loading'), texte('lazy')], [cle('decoding'), texte('async')]);
    if (!image.description) attributs.push([cle('aria-hidden'), texte('true')]);
    if (image.proportions) attributs.push([cle('style'), texte(`aspect-ratio: ${image.proportions[0]} / ${image.proportions[1]}`)]);
    return attributs;
  }

  private classes(noeud: Element): string {
    // Les styles nommés d'abord, puis les classes CSS de l'utilisateur, comme sur le web.
    return [...noeud.options.map((o) => `humalis-${o.nom}-${o.valeur}`), ...noeud.classes].join(' ');
  }

  private genreChamp(noeud: Element): { type: string; autocomplete: string } | undefined {
    if (this.champsMotDePasse.has(noeud.id)) return { type: 'password', autocomplete: 'current-password' };
    if (this.champsEmail.has(noeud.id)) return { type: 'email', autocomplete: 'username' };
    return undefined;
  }

  // ─── La vue, en HTML de départ ──────────────────────────────────────────

  /** Les valeurs de départ de la page : variables, partagées, calculs. */
  private environnement(): Environnement {
    const env = new Environnement(this.contexte.types);
    // Un paramètre de l'adresse n'est connu qu'à l'ouverture de la page : vide au départ.
    for (const p of this.ecran.parametresAdresse ?? []) env.definir(p, '');
    // Le HTML de départ est écrit dans la première langue du site.
    if (this.site.langues) env.definir('langue', this.site.langues[0].code);
    for (const e of [...this.site.partages, ...this.ecran.etat]) env.definir(e.nom, evaluer(e.initiale, env));
    for (const c of this.ecran.calculs) env.definirCalcul(c.nom, c.valeur);
    return env;
  }

  private ecrireHtml(noeuds: NoeudVue[], env: Environnement, lignes: string[]): void {
    for (const noeud of noeuds) {
      switch (noeud.type) {
        case 'element':
          // Un élément que l'on montre est caché au départ.
          if (!this.montres.has(noeud.id)) lignes.push(this.elementHtml(noeud, env));
          break;
        case 'condition':
          this.ecrireGroupeHtml(verifier(noeud.test, env, this.contexte.champs) ? noeud.alors : noeud.sinon, env, lignes);
          break;
        case 'repetition': {
          const liste = evaluer(noeud.liste, env);
          for (const element of Array.isArray(liste) ? liste : []) {
            this.ecrireGroupeHtml(noeud.corps, env.enfant().definir(noeud.variable, element), lignes);
          }
          break;
        }
        case 'widget':
          this.ecrireEnfantHtml(arbreWidget(noeud.genre, this.aide(noeud, env)), env, lignes);
          break;
        case 'carte':
          this.carteHtml(noeud, env, lignes);
          break;
        case 'marqueur':
          // Écrit par sa carte.
          break;
        case 'fenetre': {
          // Écrite fermée (sans « open ») : le HTML de départ est celui d'une page sans fenêtre ouverte.
          lignes.push(`<dialog${attributs([['data-humalis', noeud.id], ['class', ['humalis-fenetre', ...noeud.classes].join(' ')], ['aria-labelledby', `${noeud.id}-titre`], ['aria-describedby', noeud.description !== undefined ? `${noeud.id}-description` : undefined]])}>`);
          lignes.push('<div class="humalis-fenetre-contenu">');
          lignes.push(`<h2${attributs([['id', `${noeud.id}-titre`]])}>${echapperTexte(noeud.titre)}</h2>`);
          if (noeud.description !== undefined) lignes.push(`<p${attributs([['id', `${noeud.id}-description`]])}>${echapperTexte(noeud.description)}</p>`);
          this.ecrireGroupeHtml(noeud.corps, env, lignes);
          lignes.push('<button type="button" class="humalis-fenetre-fermer" aria-label="Fermer">×</button>');
          lignes.push('</div>');
          lignes.push('</dialog>');
          break;
        }
        case 'graphique':
          lignes.push(htmlGraphique(noeud, (v) => this.initial(v, env), (v) => this.texteInitial(v, env)));
          break;
        case 'bloc': {
          if (COMPOSITES.has(noeud.genre)) {
            this.ecrireEnfantHtml(arbreComposite(this.aideComposite(noeud, env)), env, lignes);
            break;
          }
          const balise = BALISES_BLOC[noeud.genre] ?? 'div';
          lignes.push(`<${balise}${attributs([['class', classesDuBloc(noeud)]])}>`);
          this.ecrireGroupeHtml(noeud.corps, env, lignes);
          lignes.push(`</${balise}>`);
          const bas = noeud.id !== undefined ? this.basDesBlocs.get(noeud.id) : undefined;
          if (bas && (!bas.gestionnaire.tantQue || verifier(bas.gestionnaire.tantQue, env, this.contexte.champs))) {
            lignes.push(`<div class="humalis-sentinelle" data-humalis="${noeud.id}-bas" aria-hidden="true"></div>`);
            if (bas.gestionnaire.bouton !== null) lignes.push(`<button type="button" class="humalis-voir-plus" data-humalis="${noeud.id}-voir-plus">${echapperTexte(bas.gestionnaire.bouton ?? 'Voir plus')}</button>`);
          }
          break;
        }
        case 'formulaire': {
          // Un formulaire que l'on montre est caché au départ.
          if (this.montres.has(noeud.id)) break;
          lignes.push(`<form${attributs([['data-humalis', noeud.id], ['class', 'humalis-formulaire'], ['novalidate', 'true']])}>`);
          this.ecrireGroupeHtml(noeud.corps, env, lignes);
          lignes.push('</form>');
          break;
        }
        case 'composant': {
          const composant = this.site.composants.get(noeud.nom);
          if (!composant) throw new Error(`le composant « ${noeud.nom} » n'est pas écrit en Humalis`);
          const proprietes = new Map(noeud.proprietes.map((p) => [p.nom, evaluer(p.valeur, env)]));
          htmlDuComposant(composant, this.site, proprietes, lignes);
          break;
        }
        case 'locale':
          break;
      }
    }
  }

  private ecrireGroupeHtml(noeuds: NoeudVue[], env: Environnement, lignes: string[]): void {
    const dedans = env.enfant();
    for (const l of noeuds) if (l.type === 'locale') dedans.definir(l.nom, evaluer(l.valeur, dedans));
    this.ecrireHtml(noeuds, dedans, lignes);
  }

  // ─── Les éléments d'écran (widgets.ts) ──────────────────────────────────

  private initial(valeur: Valeur, env: Environnement): unknown {
    try {
      return evaluer(valeur, env);
    } catch {
      return undefined;
    }
  }

  private texteInitial(valeur: Valeur, env: Environnement): string {
    try {
      return texteDe(valeur, env, this.contexte.champs);
    } catch {
      return '';
    }
  }

  private classesDe(noeud: { options: { nom: string; valeur: string }[]; classes: string[] }): string {
    return [...noeud.options.map((o) => `humalis-${o.nom}-${o.valeur}`), ...noeud.classes].join(' ');
  }

  private aide(noeud: Extract<NoeudVue, { type: 'widget' }>, env: Environnement): AideWidget {
    const texte = texteLitteral(noeud.contenu);
    return {
      valeur: { js: expressionJs(noeud.contenu, this.contexte), initial: this.initial(noeud.contenu, env) },
      texte: { js: contenuJs(noeud.contenu, this.contexte), initial: this.texteInitial(noeud.contenu, env) },
      ...(texte !== undefined ? { litteral: texte } : {}),
      classes: this.classesDe(noeud),
      styles: noeud.options.map((o) => `${o.nom}_${o.valeur}`),
      reglages: noeud.reglages,
      ...(noeud.minimum !== undefined ? { minimum: noeud.minimum } : {}),
      ...(noeud.maximum !== undefined ? { maximum: noeud.maximum } : {}),
      ...(noeud.reglages.photo ? { photo: { js: expressionJs(noeud.reglages.photo, this.contexte), initial: this.texteInitial(noeud.reglages.photo, env) } } : {}),
      ...(noeud.contenu.type === 'variable' ? { variable: nomJs(noeud.contenu.nom) } : {}),
      ...(this.site.langues ? { langues: this.site.langues } : {}),
      ...(noeud.genre === 'audio' ? { audio: this.audioDe(noeud, env) } : {}),
      id: noeud.id,
    };
  }

  /** Un audio : un fichier local est copié dans audio/ ; les textes sont fixes ou calculés par le script. */
  private audioDe(noeud: Extract<NoeudVue, { type: 'widget' }>, env: Environnement): NonNullable<AideWidget['audio']> {
    const attribut = (valeur: Valeur): string | { js: string; initial: string } =>
      texteLitteral(valeur) ?? { js: contenuJs(valeur, this.contexte), initial: this.texteInitial(valeur, env) };
    const fichier = texteLitteral(noeud.contenu);
    const { description, transcription } = noeud.textes ?? {};
    return {
      source: fichier !== undefined && estFichierLocal(fichier) ? `audio/${nomDeLaCopie(fichier)}` : attribut(noeud.contenu),
      ...(description ? { description: attribut(description) } : {}),
      ...(transcription ? { transcription: { js: contenuJs(transcription, this.contexte), initial: this.texteInitial(transcription, env) } } : {}),
    };
  }

  private aideComposite(noeud: Extract<NoeudVue, { type: 'bloc' }>, env: Environnement): AideComposite {
    const enfants = noeud.corps.filter((n): n is Extract<NoeudVue, { type: 'bloc' }> => n.type === 'bloc');
    const titre = (v: Valeur | undefined) => (v ? { js: contenuJs(v, this.contexte), initial: this.texteInitial(v, env) } : { js: "''", initial: '' });
    const etat = noeud.etat ? { js: nomJs(noeud.etat), initial: this.initial({ type: 'variable', nom: noeud.etat }, env) as number | boolean } : undefined;
    const aide: AideComposite = {
      genre: noeud.genre as AideComposite['genre'],
      id: `${noeud.genre}-${noeud.ligne % 1_000_000}`,
      classes: this.classesDe(noeud),
      reglages: noeud.reglages ?? {},
      parties:
        noeud.genre === 'onglets'
          ? enfants.map((o) => ({ titre: titre(o.titre), icone: o.reglages?.icone, corps: o.corps }))
          : noeud.genre === 'deroulant'
            ? [{ titre: titre(noeud.titre), icone: noeud.reglages?.icone, corps: noeud.corps }]
            : noeud.genre === 'filAriane'
              ? noeud.corps.map((c) => ({ titre: titre(undefined), corps: [c] }))
              : [],
      ...(etat ? { etat } : {}),
      corps: noeud.corps,
    };
    if (noeud.genre === 'deroulant' && etat) {
      const groupe = noeud.index !== undefined;
      aide.ouvert = groupe
        ? { js: `${etat.js} === ${noeud.index}`, initial: etat.initial === noeud.index }
        : { js: etat.js, initial: etat.initial === true };
      aide.basculer = groupe ? `${etat.js} = ${etat.js} === ${noeud.index} ? -1 : ${noeud.index}` : `${etat.js} = !${etat.js}`;
    }
    return aide;
  }

  // ─── La carte (plan des médias, 4.5) ────────────────────────────────────

  /** Les classes de la carte, comme sur le web : celle de Humalis, puis celles de l'utilisateur. */
  private classesCarte(noeud: Extract<NoeudVue, { type: 'carte' }>): string {
    return ['humalis-carte', ...noeud.classes].join(' ');
  }

  /** Les lieux de départ : les marqueurs, boucles et conditions évalués avec les valeurs de départ. */
  private lieuxInitiaux(noeuds: NoeudVue[], env: Environnement): { nom: string; adresse?: string; latitude: number; longitude: number }[] {
    return noeuds.flatMap((noeud) => {
      if (noeud.type === 'marqueur') {
        return [{
          nom: this.texteInitial(noeud.nom, env),
          ...(noeud.adresse ? { adresse: this.texteInitial(noeud.adresse, env) } : {}),
          latitude: Number(this.initial(noeud.latitude, env)),
          longitude: Number(this.initial(noeud.longitude, env)),
        }];
      }
      if (noeud.type === 'condition') return this.lieuxInitiaux(verifier(noeud.test, env, this.contexte.champs) ? noeud.alors : noeud.sinon, env);
      if (noeud.type === 'repetition') {
        const liste = evaluer(noeud.liste, env);
        return (Array.isArray(liste) ? liste : []).flatMap((element) => this.lieuxInitiaux(noeud.corps, env.enfant().definir(noeud.variable, element)));
      }
      return [];
    });
  }

  /** Le HTML de départ d'une carte : sa zone (vide) et la liste des lieux, lisible sans JavaScript. */
  private carteHtml(noeud: Extract<NoeudVue, { type: 'carte' }>, env: Environnement, lignes: string[]): void {
    const nom = this.texteInitial(noeud.nom, env);
    const lieux = this.lieuxInitiaux(noeud.corps, env);
    const lien = (l: { latitude: number; longitude: number }) => `https://www.openstreetmap.org/?mlat=${l.latitude}&mlon=${l.longitude}#map=15/${l.latitude}/${l.longitude}`;
    lignes.push(`<section${attributs([['aria-label', nom], ['class', this.classesCarte(noeud)]])}>`);
    lignes.push('<div class="humalis-carte-zone"></div>');
    lignes.push(`<ul${attributs([['aria-label', `Les lieux de la carte : ${nom}`], ['class', 'humalis-carte-lieux']])}>`);
    for (const lieu of lieux) {
      lignes.push(
        `<li><strong>${echapperTexte(lieu.nom)}</strong>${lieu.adresse ? `<span>${echapperTexte(lieu.adresse)}</span>` : ''}<a${attributs([['href', lien(lieu)], ['aria-label', `Ouvrir dans OpenStreetMap : ${lieu.nom}`]])}>Ouvrir dans OpenStreetMap</a></li>`,
      );
    }
    if (lieux.length === 0 && noeud.latitude && noeud.longitude) {
      const centre = { latitude: Number(this.initial(noeud.latitude, env)), longitude: Number(this.initial(noeud.longitude, env)) };
      lignes.push(`<li><a${attributs([['href', lien(centre)]])}>Ouvrir dans OpenStreetMap</a></li>`);
    }
    lignes.push('</ul>');
    lignes.push('</section>');
  }

  /** Les lieux d'une carte en JavaScript : un objet par marqueur, un `flatMap` par « pour chaque », un choix par « si ». */
  private lieuxJs(e: Ecrivain, noeuds: NoeudVue[]): void {
    for (const noeud of noeuds) {
      if (noeud.type === 'marqueur') {
        const adresse = noeud.adresse ? `, adresse: ${contenuJs(noeud.adresse, this.contexte)}` : '';
        e.ligne(`{ nom: ${contenuJs(noeud.nom, this.contexte)}${adresse}, latitude: ${expressionJs(noeud.latitude, this.contexte)}, longitude: ${expressionJs(noeud.longitude, this.contexte)} },`);
      } else if (noeud.type === 'condition') {
        e.ligne(`...(${conditionJs(noeud.test, this.contexte)} ? [`);
        e.indenter(() => this.lieuxJs(e, noeud.alors));
        if (noeud.sinon.length > 0) {
          e.ligne('] : [');
          e.indenter(() => this.lieuxJs(e, noeud.sinon));
          e.ligne(']),');
        } else {
          e.ligne('] : []),');
        }
      } else if (noeud.type === 'repetition') {
        e.bloc(`...${expressionJs(noeud.liste, this.contexte)}.flatMap((${nomJs(noeud.variable)}) => [`, () => this.lieuxJs(e, noeud.corps), ']),');
      }
    }
  }

  /** `carteLieux(id, nom, réglages, [lieux], classes),` : humalis.js dessine la carte et la liste. */
  private carteJs(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'carte' }>): void {
    const reglages = [
      ...(noeud.latitude && noeud.longitude ? [`latitude: ${expressionJs(noeud.latitude, this.contexte)}`, `longitude: ${expressionJs(noeud.longitude, this.contexte)}`] : []),
      ...(noeud.zoom ? [`zoom: ${expressionJs(noeud.zoom, this.contexte)}`] : []),
      ...(noeud.tuiles ? [`tuiles: ${chaine(noeud.tuiles.adresse)}`, `attribution: ${chaine(noeud.tuiles.attribution)}`] : []),
    ];
    e.bloc(`carteLieux(${chaine(noeud.id)}, ${contenuJs(noeud.nom, this.contexte)}, ${reglages.length > 0 ? `{ ${reglages.join(', ')} }` : '{}'}, [`, () => this.lieuxJs(e, noeud.corps), `], ${chaine(this.classesCarte(noeud))}),`);
  }

  /** Un arbre de widgets.ts, en JavaScript : `creer('tag', { … }, enfants…),`. */
  private ecrireEnfantJs(e: Ecrivain, enfant: Enfant): void {
    if ('tag' in enfant) {
      const attrs = enfant.attrs
        .filter(([, v]) => v !== false)
        .map(([nom, v]) => {
          const cle = /^[a-z]+$/.test(nom) ? nom : chaine(nom);
          return `${cle}: ${typeof v === 'string' ? (nom.startsWith('on') ? v : chaine(v)) : typeof v === 'boolean' ? String(v) : v.js}`;
        });
      e.bloc(`creer(${chaine(enfant.tag)}, { ${attrs.join(', ')} },`, () => enfant.enfants.forEach((c) => this.ecrireEnfantJs(e, c)), '),');
    } else if ('texte' in enfant) {
      e.ligne(`${chaine(enfant.texte)},`);
    } else if ('js' in enfant) {
      e.ligne(`${enfant.js},`);
    } else if ('vue' in enfant) {
      this.ecrireGroupe(e, enfant.vue, '...', ',');
    } else if ('icone' in enfant) {
      e.ligne(`icone(${chaine(enfant.icone)}, ${chaine(enfant.classe ?? 'humalis-icone')}${enfant.label ? `, ${typeof enfant.label === 'string' ? chaine(enfant.label) : enfant.label.js}` : ''}),`);
    } else if ('qr' in enfant) {
      e.ligne(`codeQr(${enfant.qr}),`);
    } else if ('avatar' in enfant) {
      e.ligne(`avatar(${enfant.avatar.nom}, ${enfant.avatar.photo ?? "''"}),`);
    } else {
      const { js, maximum, change, label, classes } = enfant.etoiles;
      e.ligne(`etoiles(${js}, ${maximum}, ${change ?? 'undefined'}, ${typeof label === 'string' ? chaine(label) : label.js}, ${chaine(classes)}),`);
    }
  }

  /** Un arbre de widgets.ts, en HTML de départ. */
  private ecrireEnfantHtml(enfant: Enfant, env: Environnement, lignes: string[]): void {
    if ('tag' in enfant) {
      const attrs = attributs(
        enfant.attrs
          .filter(([nom]) => !nom.startsWith('on'))
          .map(([nom, v]): [string, string | undefined] => {
            const valeur = typeof v === 'object' ? v.initial : v;
            return [nom, valeur === false ? undefined : valeur === true ? 'true' : valeur];
          }),
      );
      const vides = ['progress'].includes(enfant.tag) && enfant.enfants.length === 0;
      if (vides) {
        lignes.push(`<${enfant.tag}${attrs}></${enfant.tag}>`);
        return;
      }
      lignes.push(`<${enfant.tag}${attrs}>`);
      for (const c of enfant.enfants) this.ecrireEnfantHtml(c, env, lignes);
      lignes.push(`</${enfant.tag}>`);
    } else if ('texte' in enfant) {
      lignes.push(echapperTexte(enfant.texte));
    } else if ('js' in enfant) {
      lignes.push(echapperTexte(enfant.initial));
    } else if ('vue' in enfant) {
      this.ecrireGroupeHtml(enfant.vue, env, lignes);
    } else if ('icone' in enfant) {
      lignes.push(iconeHtml(enfant.icone, enfant.classe ?? 'humalis-icone', typeof enfant.label === 'object' ? enfant.label.initial : enfant.label));
    } else if ('qr' in enfant) {
      // Le code est dessiné par le script : aucun encodeur dans le compilateur.
    } else if ('avatar' in enfant) {
      const { initialNom, initialPhoto } = enfant.avatar;
      lignes.push(initialPhoto ? `<img${attributs([['src', initialPhoto], ['alt', '']])}>` : `<span aria-hidden="true">${echapperTexte(initiales(initialNom))}</span>`);
    } else {
      const { initial, maximum, change, label, classes } = enfant.etoiles;
      lignes.push(etoilesHtml(initial, maximum, change !== undefined, typeof label === 'string' ? label : label.initial, classes));
    }
  }

  /** Le même champ que champJs, en HTML de départ : vide, rien de coché, rien de choisi. */
  private champHtml(noeud: Element, env: Environnement, classes: string | undefined, contenu: string): string {
    const saisie = noeud.saisie;
    const sorte = saisie?.sorte ?? 'texte';
    const libelle = saisie?.obligatoire ? `<span>${contenu}${ETOILE_HTML}</span>` : contenu;
    const base: [string, string | undefined][] = [['data-humalis', noeud.id], ['class', classes]];
    const options = (liste: [string, string | undefined][]) => [
      ...liste,
      ['required', saisie?.obligatoire ? 'true' : undefined] as [string, string | undefined],
      ['placeholder', sorte !== 'liste' ? saisie?.indice : undefined] as [string, string | undefined],
      ['min', saisie?.minimum !== undefined ? String(saisie.minimum) : undefined] as [string, string | undefined],
      ['max', saisie?.maximum !== undefined ? String(saisie.maximum) : undefined] as [string, string | undefined],
    ];
    const parmi = () => {
      const valeurs = saisie?.parmi ? evaluer(saisie.parmi, env) : [];
      return (Array.isArray(valeurs) ? valeurs : []).map(String);
    };
    switch (sorte) {
      case 'case':
        return `<label class="humalis-case"><input${attributs(options([['type', 'checkbox'], ...base]))}>${libelle}</label>`;
      case 'choix': {
        const radios = parmi()
          .map((v) => `<label><input${attributs([['type', 'radio'], ['name', noeud.id], ['value', v]])}>${echapperTexte(v)}</label>`)
          .join('');
        return `<fieldset${attributs([['data-humalis', noeud.id], ['class', classes ? `${classes} humalis-choix` : 'humalis-choix']])}><legend>${libelle}</legend>${radios}</fieldset>`;
      }
      case 'liste': {
        const choix = parmi().map((v) => `<option${attributs([['value', v]])}>${echapperTexte(v)}</option>`).join('');
        return `<label class="humalis-champ">${libelle}<select${attributs(options(base))}><option value="" selected="true">${echapperTexte(saisie?.indice ?? 'Choisissez…')}</option>${choix}</select></label>`;
      }
      case 'texteLong':
        return `<label class="humalis-champ">${libelle}<textarea${attributs(options([['rows', '4'], ...base]))}></textarea></label>`;
      default: {
        const genre = this.genreChamp(noeud) ?? TYPES_SAISIE[sorte];
        const liste = options([...base, ['type', genre?.type], ['autocomplete', genre?.autocomplete]]);
        return `<label class="humalis-champ">${libelle}<input${attributs(liste)}></label>`;
      }
    }
  }

  private elementHtml(noeud: Element, env: Environnement): string {
    const classes = this.classes(noeud) || undefined;
    const commun = (avant: [string, string | undefined][] = []) =>
      attributs([...avant, ['data-humalis', noeud.id], ['class', classes], ...(noeud.annonce ? ([['aria-live', 'polite'], ['aria-atomic', 'true']] as [string, string][]) : []), ...attributsRaccourci(noeud)]);
    const lucideHtml = noeud.reglages?.icone ? chercherIcone(noeud.reglages.icone)?.lucide : undefined;
    const contenu = (lucideHtml ? iconeHtml(lucideHtml, 'humalis-icone') : '') + echapperTexte(texteDe(noeud.contenu, env, this.contexte.champs));
    switch (noeud.genre) {
      case 'titre':
      case 'soustitre': {
        const h = `h${this.niveaux.get(noeud) ?? 1}`;
        return `<${h}${commun()}>${contenu}</${h}>`;
      }
      case 'texte':
        return `<p${commun()}>${contenu}</p>`;
      case 'bouton': {
        const envoie = this.formulaireDe.has(noeud.id) && !this.evenements.has(noeud.id);
        return `<button${commun([['type', envoie ? 'submit' : 'button']])}>${contenu}</button>`;
      }
      case 'lien': {
        // Les mêmes valeurs que le script, calculées à la compilation.
        const requete = (noeud.arguments ?? []).map((a) => `${camel(a.nom)}=${encodeURIComponent(String(evaluer(a.valeur, env)))}`).join('&');
        return `<a${commun([['href', this.fichier(noeud.cible ?? '') + (requete ? `?${requete}` : '')]])}>${contenu}</a>`;
      }
      case 'image': {
        if (noeud.image) return `<img${commun(this.attributsImage(noeud.image, noeud.contenu, (v) => String(evaluer(v, env)), (t) => t))}>`;
        const source = texteLitteral(noeud.contenu);
        return `<img${commun([['src', String(evaluer(noeud.contenu, env))], ['alt', noeud.reglages?.decoratif ? '' : noeud.reglages?.description ?? alt(source)], ...(noeud.reglages?.decoratif ? [['aria-hidden', 'true'] as [string, string]] : [])])}>`;
      }
      case 'champ':
        return this.champHtml(noeud, env, classes, contenu);
    }
  }
}

/** Les blocs d'éléments d'écran, décrits par widgets.ts. */
const COMPOSITES = new Set<string>(['onglets', 'deroulant', 'accordeon', 'carrousel', 'filAriane']);

/** La balise de chaque bloc : une section, l'en-tête et le pied de la page, sinon une boîte. */
const BALISES_BLOC: Partial<Record<string, string>> = { section: 'section', entete: 'header', pied: 'footer', menu: 'nav' };

/** Les outils de humalis.js qu'une page peut prendre. */
/** « avec raccourci » : annoncé au lecteur d'écran (aria-keyshortcuts) et visible au survol (title). */
function attributsRaccourci(noeud: Element): [string, string][] {
  if (noeud.raccourci === undefined) return [];
  const { aria, texte } = decrireTouches(noeud.raccourci);
  const libelle = texteLitteral(noeud.contenu);
  return [['aria-keyshortcuts', aria], ['title', libelle ? `${libelle} (${texte})` : texte]];
}

const OUTILS_PAGE = [
  'creer',
  'icone',
  'avatar',
  'etoiles',
  'codeQr',
  'carteLieux',
  'definirTheme',
  't',
  'langue',
  'changerLangue',
  'afficherMessage',
  'planifier',
  'mouvementReduit',
  'copier',
  'partager',
  'derniereRequete',
  'cliquer',
  'focaliser',
  'fenetre',
  'confirmer',
  'retirerPremier',
  'grouper',
  'formaterNombre',
  'formaterDate',
  'formaterArgent',
  'accorder',
  'formaterTaille',
  'dateDuJour',
  'maintenant',
  'decalerDate',
  'joursEntre',
  'formaterDepuis',
  'adresseDe',
  'lirePartage',
  'garderPartage',
  'lireMemoire',
  'garderMemoire',
  'serveur',
  'utilisateur',
];

/** Le texte de remplacement d'une image, tiré de son nom de fichier (comme sur le web). */
function alt(source: string | undefined): string {
  return source !== undefined ? source.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ') : '';
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

/** Un envoi vers le serveur (création, modification, suppression), boucles et conditions comprises. */
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

const ATTENTES = new Set<Action['type']>(['requete', 'suppression', 'modification', 'connexion', 'deconnexion', 'confirmation', 'copie', 'partage']);

/** Vrai si le bloc d'une minuterie contient « arreter » pour elle (hors d'une boucle). */
function arrete(actions: Action[]): boolean {
  return actions.some((a) => a.type === 'arreter' || (!['repetition', 'tantQue', 'repeter', 'minuterie', 'message'].includes(a.type) && sousActions(a).some(arrete)));
}

/** Les noms changés par des actions : déclarés avec `let` s'ils sont locaux. */
function modifiees(actions: Action[], noms = new Set<string>()): Set<string> {
  for (const a of actions) {
    if (a.type === 'affectation') noms.add(a.nom);
    if (a.type === 'ajout' || a.type === 'retrait') noms.add(a.liste);
    if (a.type === 'requete' && a.resultat !== undefined) noms.add(a.resultat);
    for (const liste of sousActions(a)) modifiees(liste, noms);
  }
  return noms;
}

/** « humalis-ligne humalis-fond-vert fiche » : la classe du bloc, ses styles nommés, puis les classes CSS de l'utilisateur. */
function classesDuBloc(noeud: Extract<NoeudVue, { type: 'bloc' }>): string {
  return [`humalis-${noeud.genre}`, ...noeud.options.map((o) => `humalis-${o.nom}-${o.valeur}`), ...noeud.classes].join(' ');
}
