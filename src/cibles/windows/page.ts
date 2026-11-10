/**
 * Une page (ou un composant écrit en Humalis) en C# : une classe dont les variables sont
 * des Signal, les calculs des propriétés, les événements des méthodes `async Task`, et
 * l'affichage une seule expression qui assemble les éléments de la bibliothèque (UI.*).
 */
import type { ComposantHumalis, Ecran, Etat, Gestionnaire, NoeudVue, Option, Saisie, Valeur } from '../../ri/types.js';
import type { Diagnostic } from '../../analyse/erreurs.js';
import { simplifier } from '../../analyse/elements.js';
import { sousActions } from '../../ri/actions.js';
import { estFichierLocal, nomDeLaCopie } from '../../ri/medias.js';
import { libellesEnLangues, verificationsDuChamp } from '../../i18n/messages.js';
import { Ecrivain } from '../web/ecrivain.js';
import { EcrivainActions, type HoteActions } from './actions.js';
import { chaineCs, cleJson, commentaireCs, nomComposant, nomCs, nomMethode, nomPage } from './noms.js';
import { OPTIONS_NON_DESSINEES, styleDesOptions } from './styles.js';
import { ExpressionsCs, type ChampPage, type Lieu, type Portee } from './valeurs.js';

/** Ce que toutes les pages partagent : le reste du programme. */
export interface ContexteWindows {
  /** Les variables partagées entre les pages (« avec partagee »). */
  partages: Map<string, Lieu>;
  fonctions: Set<string>;
  composants: Map<string, ComposantHumalis>;
  /** Les couleurs nommées (thème et couleurs de Humalis). */
  couleurs: Set<string>;
  /** Les styles nommés traduits (« carte » → Styles.Carte). */
  styles: Set<string>;
  diagnostics: Diagnostic[];
  /** Les options qui ne se dessinent pas encore, rencontrées (dites une fois). */
  nonDessinees: Set<string>;
  /** Les codes des langues du bloc « langues », la langue de base en premier. */
  langues?: string[];
}

interface Methode {
  nom: string;
  /** Les variables de boucle reçues en paramètres (noms Humalis). */
  boucles: string[];
}

const GLYPHES_WIDGETS = new Set(['icone', 'badge', 'avatar', 'progression', 'chargement', 'etoiles', 'compteur', 'selecteurLangue', 'fichier', 'qr', 'audio', 'video']);

/** Indente un morceau de code de plusieurs lignes (sauf sa première ligne). */
const decaler = (code: string, espaces = '  ') => code.replace(/\n/g, `\n${espaces}`);

/** `UI.Pile(\n    a,\n    b)` : un appel dont chaque argument est sur sa ligne. */
function appel(fonction: string, args: string[]): string {
  if (args.length === 0) return `${fonction}()`;
  if (args.length === 1 && !args[0].includes('\n') && args[0].length < 80) return `${fonction}(${args[0]})`;
  return `${fonction}(\n  ${args.map((a) => decaler(a)).join(',\n  ')})`;
}

export class GenerateurBloc implements HoteActions {
  readonly x: ExpressionsCs;
  readonly etatsRequetes = new Set<string>();
  readonly fenetres = new Set<string>();
  readonly dansUnePage = true;
  private readonly portee: Portee;
  private readonly actions: EcrivainActions;
  private ligne: number;

  private readonly clics = new Map<string, Methode[]>();
  private readonly survols = new Map<string, Methode[]>();
  private readonly soumissions = new Map<string, Methode>();
  private readonly formulaires = new Map<string, string[]>();
  private readonly saisies = new Map<string, Saisie | undefined>();
  private readonly libellesLangues = new Map<string, Map<string, string>>();
  private readonly textesChanges = new Set<string>();
  private readonly visibles = new Set<string>();
  private readonly raccourcis = new Map<string, string>();
  private readonly methodes: string[] = [];
  private readonly chargements: string[] = [];
  private readonly constructeur: string[] = [];
  private readonly touches: { touches: string; appel: string }[] = [];
  private readonly nomsPris = new Set<string>();
  private titreVu = false;
  /** « arrive en bas de "catalogue" » : la méthode, et le bouton « Voir plus » sous le bloc. */
  private readonly bas = new Map<string, { methode: Methode; g: Gestionnaire }>();
  /** Les événements écrits dans une boucle : enregistrés quand tous les champs sont connus. */
  private readonly enAttente: { g: Gestionnaire; boucles: string[] }[] = [];

  constructor(
    private readonly ecran: Ecran,
    private readonly ctx: ContexteWindows,
    private readonly genre: 'page' | 'composant',
    private readonly classe: string,
    private readonly racine?: { classes: string[]; options: Option[] },
  ) {
    this.ligne = ecran.ligne;
    this.portee = { variables: new Map(ctx.partages), champs: new Map(), fonctions: ctx.fonctions };
    this.x = new ExpressionsCs(this.portee, (quoi) => this.refuser(quoi));
    this.actions = new EcrivainActions(this);
    for (const nom of ecran.etatsRequetes ?? []) this.etatsRequetes.add(nom);
  }

  refuser(quoi: string): void {
    const message = quoi.startsWith('«') || quoi.startsWith('une ') || quoi.startsWith('un ')
      ? `${quoi} n'existe pas encore sur la cible Windows : compilez avec une autre cible, ou retirez cette ligne.`
      : `${quoi} ne se traduit pas en C# : vérifiez cette ligne.`;
    if (!this.ctx.diagnostics.some((d) => d.ligne === this.ligne && d.message === message)) this.ctx.diagnostics.push({ gravite: 'erreur', ligne: this.ligne, message });
  }

  private nomUnique(base: string): string {
    let nom = base;
    let i = 2;
    while (this.nomsPris.has(nom) || this.portee.variables.has(nom)) nom = `${base}${i++}`;
    this.nomsPris.add(nom);
    return nom;
  }

  // ─── Le recensement ──────────────────────────────────────────────────────

  private recenser(noeuds: NoeudVue[], boucles: string[], formulaire?: string): void {
    for (const n of noeuds) {
      switch (n.type) {
        case 'element':
          if (n.genre === 'champ') this.recenserChamp(n, formulaire);
          if (n.raccourci) this.raccourcis.set(n.id, n.raccourci);
          break;
        case 'formulaire':
          this.formulaires.set(n.id, []);
          this.recenser(n.corps, boucles, n.id);
          break;
        case 'bloc':
        case 'carte':
          this.recenser(n.corps, boucles, formulaire);
          break;
        case 'fenetre':
          this.fenetres.add(n.id);
          this.recenser(n.corps, boucles, formulaire);
          break;
        case 'condition':
          this.recenser(n.alors, boucles, formulaire);
          this.recenser(n.sinon, boucles, formulaire);
          break;
        case 'repetition': {
          const dedans = [...boucles, n.variable];
          for (const g of n.gestionnaires) this.enAttente.push({ g, boucles: dedans });
          this.recenser(n.corps, dedans, formulaire);
          break;
        }
      }
    }
  }

  private recenserChamp(n: Extract<NoeudVue, { type: 'element' }>, formulaire?: string): void {
    const libelle = n.contenu.type === 'texte' && n.contenu.parties.every((p) => 'texte' in p) ? n.contenu.parties.map((p) => ('texte' in p ? p.texte : '')).join('') : n.id;
    const signal = this.nomUnique(nomCs(`champ_${simplifier(libelle) || n.id}`));
    this.portee.champs.set(n.id, { signal, sorte: n.saisie?.sorte ?? 'texte', libelle, cle: cleJson(libelle) });
    this.saisies.set(n.id, n.saisie);
    this.libellesLangues.set(n.id, libellesEnLangues(n.contenu));
    if (formulaire !== undefined) this.formulaires.get(formulaire)?.push(n.id);
  }

  /** Un événement devient une méthode ; on retient ce qui l'appelle. */
  private enregistrer(g: Gestionnaire, boucles: string[]): void {
    const cible = g.cibles[0] ? nomMethode(simplifier(g.cibles[0]) || 'element') : '';
    const base = {
      clic: `QuandClique${cible}`, survol: `QuandSurvole${cible}`, soumission: `QuandEnvoie${cible}`, chargement: 'QuandLaPageSeCharge',
      minuterie: 'QuandLaMinuterieSonne', touche: 'QuandOnAppuie', saisie: `QuandOnEcritDans${cible}`, pauseSaisie: `QuandOnArreteDEcrireDans${cible}`,
      bas: 'QuandOnArriveEnBas', ordre: 'QuandLOrdreChange', commandeMenu: 'QuandLaCommandeEstChoisie', arrierePlan: 'EnArrierePlan',
    }[g.declencheur];
    if (['ordre', 'commandeMenu', 'arrierePlan'].includes(g.declencheur)) {
      this.ligne = g.ligne;
      const nom = { bas: '« quand on arrive en bas de »', ordre: '« avec deplacement »', commandeMenu: '« menu de l\'application »', arrierePlan: '« en arriere plan »' }[g.declencheur as 'bas'];
      this.refuser(nom);
      return;
    }
    const methode: Methode = { nom: this.nomUnique(base), boucles };
    this.ecrireMethode(methode, g);
    for (const id of g.cibles) {
      if (g.declencheur === 'clic') this.clics.set(id, [...(this.clics.get(id) ?? []), methode]);
      if (g.declencheur === 'survol') this.survols.set(id, [...(this.survols.get(id) ?? []), methode]);
      if (g.declencheur === 'soumission') this.soumissions.set(id, methode);
      if (g.declencheur === 'bas') this.bas.set(id, { methode, g });
    }
    const lancer = `UI.Lancer(${methode.nom})`;
    switch (g.declencheur) {
      case 'chargement':
      case 'minuterie':
        this.chargements.push(`await ${methode.nom}();`);
        break;
      case 'touche':
        if (g.touches) this.touches.push({ touches: g.touches, appel: lancer });
        break;
      case 'saisie':
      case 'pauseSaisie':
        for (const id of g.cibles) {
          const champ = this.portee.champs.get(id);
          if (!champ) continue;
          if (g.declencheur === 'saisie') this.constructeur.push(`${champ.signal}.Change += _ => ${lancer};`);
          else {
            const pause = this.nomUnique('hPause');
            this.constructeur.push(`var ${pause} = new Pause(${g.millisecondes ?? 500}, ${methode.nom});`, `Arreter(${pause});`, `${champ.signal}.Change += _ => ${pause}.Relancer();`);
          }
        }
        break;
    }
  }

  private ecrireMethode(m: Methode, g: Gestionnaire): void {
    this.ligne = g.ligne;
    const e = new Ecrivain();
    const params = m.boucles.map((b) => `object? ${nomCs(b)}`).join(', ');
    e.ligne(`private async Task ${m.nom}(${params})`);
    e.ligne('{');
    e.indenter(() => {
      const noms: [string, Lieu][] = m.boucles.map((b) => [b, { lire: nomCs(b), locale: nomCs(b) }]);
      this.x.avec(noms, () => {
        if (g.declencheur === 'soumission') for (const id of g.cibles) this.verifications(e, id);
        // Une page qui lit la session attend de savoir qui est connecté.
        const corps = new Ecrivain();
        this.actions.ecrire(corps, g.actions, { formulaire: g.declencheur === 'soumission' });
        const texte = corps.texte();
        if (/\bSession\.(Connecte|Admin|ARole)\b/.test(texte)) e.ligne('await Session.Attendre();');
        if (g.tantQue) e.ligne(`if (!(${this.x.condition(g.tantQue)})) return;`);
        for (const l of texte.trimEnd().split('\n')) if (l.length) e.ligne(l);
      });
      e.ligne('await Task.CompletedTask;');
    });
    e.ligne('}');
    this.methodes.push(e.texte());
  }

  /** Ce qui est vérifié avant d'envoyer un formulaire : un champ obligatoire vide, un email mal écrit… */
  private verifications(e: Ecrivain, formulaire: string): void {
    for (const id of this.formulaires.get(formulaire) ?? []) {
      const champ = this.portee.champs.get(id);
      if (!champ) continue;
      const saisie = this.saisies.get(id);
      const versions = this.libellesLangues.get(id) ?? new Map<string, string>();
      const langues = this.ctx.langues ?? ['fr'];
      const messages = verificationsDuChamp('v', saisie, langues.map((code) => ({ code, libelle: versions.get(code) ?? champ.libelle }))).map(([, m]) => (m.length > 1 ? `Langues.T(${m.map((x) => `(${chaineCs(x.code)}, ${chaineCs(x.texte)})`).join(', ')})` : chaineCs(m[0].texte)));
      const tests = testsDuChamp(`${champ.signal}.Valeur`, saisie);
      messages.forEach((message, i) => {
        if (tests[i] === undefined) return;
        e.ligne(`if (${tests[i]}) { Messages.Afficher(${message}, "erreur"); return; }`);
      });
    }
  }

  // ─── La classe ───────────────────────────────────────────────────────────

  generer(espace: string): string {
    const ecran = this.ecran;
    const e = new Ecrivain();
    const champsEtat: string[] = [];
    const initialisations: string[] = [];

    // Les paramètres d'un composant : des valeurs lues à chaque dessin.
    const parametres = this.genre === 'composant' ? (ecran as ComposantHumalis).parametres ?? [] : [];
    for (const p of parametres) {
      const nom = nomCs(p.nom);
      this.nomsPris.add(nom);
      champsEtat.push(`private readonly Func<object?> ${nom};`);
      this.portee.variables.set(p.nom, { lire: `${nom}()` });
    }
    // Les valeurs lues dans l'adresse et les filtres d'une page.
    for (const p of ecran.parametresAdresse ?? []) {
      const nom = this.nomUnique(nomCs(p));
      champsEtat.push(`private readonly Signal ${nom};`);
      initialisations.push(`${nom} = new Signal(arguments.Lire(${chaineCs(p)}));`);
      this.portee.variables.set(p, { lire: `${nom}.Lire()`, signal: nom });
    }
    for (const f of ecran.filtres ?? []) {
      const nom = this.nomUnique(nomCs(f.nom));
      champsEtat.push(`private readonly Signal ${nom};`);
      initialisations.push(`${nom} = new Signal(${f.nombre ? `V.N(arguments.Lire(${chaineCs(f.nom)}))` : `arguments.Lire(${chaineCs(f.nom)}) ?? ""`});`);
      this.portee.variables.set(f.nom, { lire: `${nom}.Lire()`, signal: nom });
    }
    // Les variables : des Signal ; leur valeur de départ peut lire les précédentes.
    for (const etat of ecran.etat) {
      const nom = this.nomUnique(nomCs(etat.nom));
      champsEtat.push(`private readonly Signal ${nom};`);
      initialisations.push(`${nom} = ${this.signalDeDepart(etat)};`);
      this.portee.variables.set(etat.nom, { lire: `${nom}.Lire()`, signal: nom });
    }
    this.recenser(ecran.vue, []);
    this.preparer();
    // Les calculs : des propriétés, recalculées à chaque lecture.
    const calculs: string[] = [];
    const nomsCalculs = ecran.calculs.map((c) => {
      const nom = this.nomUnique(nomCs(c.nom));
      this.portee.variables.set(c.nom, { lire: nom });
      return nom;
    });
    ecran.calculs.forEach((c, i) => calculs.push(`private object? ${nomsCalculs[i]} => ${this.x.expr(c.valeur)};`));
    for (const { g, boucles } of this.enAttente) this.enregistrer(g, boucles);
    for (const g of ecran.gestionnaires) this.enregistrer(g, []);
    for (const champ of this.portee.champs.values()) champsEtat.push(`private readonly Signal ${champ.signal} = new(${champ.sorte === 'case' ? 'false' : champ.sorte === 'nombre' ? 'null' : '""'});`);
    this.ligne = ecran.ligne;
    const vue = this.racine ? this.styler(this.vue(ecran.vue, [], undefined), this.racine.classes, this.racine.options, 'bloc') : this.vue(ecran.vue, [], undefined);

    e.ligne('// Produit par Humalis : ne pas modifier à la main, recompiler le fichier .humalis.');
    e.ligne('using System;');
    e.ligne('using System.Linq;');
    e.ligne('using System.Threading.Tasks;');
    e.ligne('using System.Windows;');
    e.ligne('using System.Windows.Controls;');
    e.ligne('using System.Windows.Media;');
    e.ligne('using Humalis;');
    e.ligne();
    e.ligne(`namespace ${espace};`);
    e.ligne();
    e.ligne(`/// <summary>${this.genre === 'page' ? `La page « ${commentaireCs(ecran.nom)} »` : `Le composant « ${commentaireCs(ecran.nom)} »`} (ligne ${ecran.ligne}).</summary>`);
    e.ligne(`public sealed class ${this.classe} : ${this.genre === 'page' ? 'PageHumalis' : 'ComposantHumalis'}`);
    e.ligne('{');
    e.indenter(() => {
      for (const c of champsEtat) e.ligne(c);
      if (champsEtat.length) e.ligne();
      for (const c of calculs) e.ligne(c);
      if (calculs.length) e.ligne();
      if (this.genre === 'page') {
        e.ligne(`public ${this.classe}(Arguments arguments)`);
      } else {
        e.ligne(`public ${this.classe}(${parametres.map((p) => `Func<object?> ${nomCs(p.nom)}`).join(', ')})`);
      }
      e.ligne('{');
      e.indenter(() => {
        for (const p of parametres) e.ligne(`this.${nomCs(p.nom)} = ${nomCs(p.nom)};`);
        for (const i of initialisations) e.ligne(i);
        for (const c of this.constructeur) e.ligne(c);
      });
      e.ligne('}');
      e.ligne();
      if (this.genre === 'page') {
        e.ligne(`public override string Nom => ${chaineCs(ecran.nom)};`);
        if (ecran.reservee) {
          e.ligne(`public override string? Reservee => ${chaineCs(ecran.reservee.qui)};`);
          e.ligne(`public override string? Sinon => ${chaineCs(ecran.reservee.sinon)};`);
        }
        if (ecran.sansEntete) e.ligne('public override bool SansEntete => true;');
        if (ecran.sansPied) e.ligne('public override bool SansPied => true;');
        e.ligne();
      }
      e.ligne(`public override FrameworkElement Construire() => ${decaler(vue)};`);
      if (this.chargements.length) {
        e.ligne();
        e.ligne('public override async Task Charger()');
        e.ligne('{');
        e.indenter(() => this.chargements.forEach((c) => e.ligne(c)));
        e.ligne('}');
      }
      const touches = [...this.touches];
      for (const [id, t] of this.raccourcis) {
        const clics = this.clics.get(id);
        const soumission = this.soumissions.get(id);
        if (clics?.length && clics.every((m) => m.boucles.length === 0)) touches.push({ touches: t, appel: `UI.Lancer(${clics[0].nom})` });
        else if (soumission) touches.push({ touches: t, appel: `UI.Lancer(${soumission.nom})` });
      }
      if (this.bas.size) {
        e.ligne();
        e.ligne('public override async Task EnBas()');
        e.ligne('{');
        e.indenter(() => {
          for (const { methode, g } of this.bas.values()) e.ligne(g.tantQue ? `if (${this.x.condition(g.tantQue)}) await ${methode.nom}();` : `await ${methode.nom}();`);
        });
        e.ligne('}');
      }
      if (touches.length) {
        e.ligne();
        e.ligne('public override bool Touche(string touches)');
        e.ligne('{');
        e.indenter(() => {
          e.ligne('switch (touches)');
          e.ligne('{');
          e.indenter(() => {
            for (const [t, appels] of regrouper(touches)) e.ligne(`case ${chaineCs(t)}: ${appels.map((a) => `${a};`).join(' ')} return true;`);
          });
          e.ligne('}');
          e.ligne('return false;');
        });
        e.ligne('}');
      }
      for (const m of this.methodes) {
        e.ligne();
        for (const l of m.trimEnd().split('\n')) e.ligne(l);
      }
    });
    e.ligne('}');
    return quatreEspaces(e.texte());
  }

  private signalDeDepart(etat: Etat): string {
    const depart = etat.facultatif ? '(object?)null' : this.x.expr(etat.initiale);
    if (etat.memorisee) return `Memoire.Garder(${chaineCs(`${this.ecran.nom}.${etat.nom}`)}, ${depart}${etat.secret ? ', secret: true' : ''})`;
    return `new Signal(${depart})`;
  }

  // ─── La vue ──────────────────────────────────────────────────────────────

  /** Des nœuds en une seule expression : une pile, ou l'élément seul. */
  private vue(noeuds: NoeudVue[], boucles: string[], formulaire: string | undefined, conteneur = 'UI.Pile'): string {
    const elements: string[] = [];
    for (let i = 0; i < noeuds.length; i++) {
      const n = noeuds[i];
      if (n.type === 'locale') {
        // Une variable de la vue : la suite est redessinée quand elle change.
        const nom = nomCs(n.nom);
        const valeur = this.x.expr(n.valeur);
        const reste = this.x.avec([[n.nom, { lire: nom, locale: nom }]], () => this.vue(noeuds.slice(i + 1), boucles, formulaire, conteneur));
        elements.push(`UI.Zone(() =>\n{\n  object? ${nom} = ${valeur};\n  return ${decaler(reste)};\n})`);
        break;
      }
      const code = this.noeud(n, boucles, formulaire);
      if (code !== undefined) elements.push(code);
    }
    if (elements.length === 1 && conteneur === 'UI.Pile') return elements[0];
    // Une ligne ou une grille dont le seul contenu est une boucle : chaque élément y prend sa place.
    if (noeuds.length === 1 && noeuds[0].type === 'repetition' && conteneur !== 'UI.Pile' && elements[0]?.startsWith('UI.Pour(')) {
      const panneau = conteneur === 'UI.Ligne' ? 'new PileHumalis { Horizontale = true }' : `new GrilleHumalis${conteneur.startsWith('UI.GrilleDe(') ? ` { Colonnes = ${/\d+/.exec(conteneur)![0]} }` : ''}`;
      return elements[0].replace(/\)$/, `, ${panneau})`);
    }
    if (conteneur.startsWith('UI.GrilleDe(')) return appel('UI.GrilleDe', [/\d+/.exec(conteneur)![0], ...elements]);
    return appel(conteneur, elements);
  }

  private noeud(n: NoeudVue, boucles: string[], formulaire: string | undefined): string | undefined {
    if ('ligne' in n && typeof n.ligne === 'number') this.ligne = n.ligne;
    switch (n.type) {
      case 'element':
        return this.element(n, boucles, formulaire);
      case 'widget':
        return this.widget(n);
      case 'formulaire':
        return this.styler(this.vue(n.corps, boucles, n.id, 'UI.Pile'), n.classes ?? [], [], 'bloc');
      case 'bloc':
        return this.bloc(n, boucles, formulaire);
      case 'condition': {
        const alors = this.vue(n.alors, boucles, formulaire);
        const sinon = n.sinon.length ? `, () => ${decaler(this.vue(n.sinon, boucles, formulaire))}` : '';
        return `UI.Si(() => ${this.x.condition(n.test)}, () => ${decaler(alors)}${sinon})`;
      }
      case 'repetition': {
        const nom = nomCs(n.variable);
        const rang = this.x.nouveauNom('Rang');
        const corps = this.x.avec([[n.variable, { lire: nom, locale: nom }]], () => this.vue(n.corps, [...boucles, n.variable], formulaire));
        return `UI.Pour(() => ${this.x.expr(n.liste)}, (${nom}, ${rang}) => ${decaler(corps)})`;
      }
      case 'composant':
        return this.composant(n);
      case 'fenetre': {
        const corps = this.vue(n.corps, boucles, formulaire);
        return `Fenetre(${chaineCs(n.id)}, ${chaineCs(n.titre)}, () => ${decaler(corps)}${n.obligatoire ? ', obligatoire: true' : ''})`;
      }
      case 'codeDocumentation':
        return `UI.Code(${chaineCs(n.code)})`;
      case 'tableauDocumentation':
        return `UI.Tableau(new Func<string>[] { ${n.colonnes.map((c) => `() => ${this.x.enTexte(c)}`).join(', ')} }, new Func<string>[][] { ${n.rangees.map((r) => `new Func<string>[] { ${r.map((c) => `() => ${this.x.enTexte(c)}`).join(', ')} }`).join(', ')} })`;
      case 'sousPage':
        return 'SousPage()';
      case 'graphique':
        return this.graphique(n);
      case 'carte':
        return this.carte(n);
      case 'marqueur':
      case 'locale':
        return undefined;
    }
  }

  /** Un fichier du projet (« extrait.wav ») : le nom de sa copie dans l'application ; une adresse reste telle quelle. */
  private copieLocale(chemin: string): string {
    return estFichierLocal(chemin) ? nomDeLaCopie(chemin) : chemin;
  }

  /** Une carte : son centre et son zoom écrits, sinon ses marqueurs (dans des boucles et des conditions). */
  private carte(n: Extract<NoeudVue, { type: 'carte' }>): string {
    const nombre = (v: Valeur | undefined) => (v === undefined ? '(double?)null' : `(double?)${this.x.enNombre(v)}`);
    const marqueurs = (noeuds: NoeudVue[]): string => {
      const morceaux = noeuds.flatMap((m): string[] => {
        if (m.type === 'marqueur') return [`new[] { new Marqueur(${this.x.enNombre(m.latitude)}, ${this.x.enNombre(m.longitude)}, ${this.x.enTexte(m.nom)}, ${m.adresse ? this.x.enTexte(m.adresse) : 'null'}) }`];
        if (m.type === 'repetition') {
          const nom = nomCs(m.variable);
          const dedans = this.x.avec([[m.variable, { lire: nom, locale: nom }]], () => marqueurs(m.corps));
          return [`V.L(${this.x.expr(m.liste)}).SelectMany((object? ${nom}) => ${dedans})`];
        }
        if (m.type === 'condition') return [`(${this.x.condition(m.test)} ? ${marqueurs(m.alors)} : ${marqueurs(m.sinon)})`];
        return [];
      });
      return morceaux.length === 0 ? 'Array.Empty<Marqueur>()' : morceaux.length === 1 ? morceaux[0] : `${morceaux[0]}${morceaux.slice(1).map((x) => `.Concat(${x})`).join('')}.ToArray()`;
    };
    const args = [this.x.enTexte(n.nom), `() => (${nombre(n.latitude)}, ${nombre(n.longitude)}, ${nombre(n.zoom)})`, `() => ${marqueurs(n.corps)}.ToArray()`];
    if (n.tuiles) args.push(`modele: ${chaineCs(n.tuiles.adresse)}`, `attribution: ${chaineCs(n.tuiles.attribution.replace(/<[^>]+>/g, ''))}`, 'lienAttribution: null');
    return this.styler(`CarteHumalis.Creer(${args.join(', ')})`, n.classes, [], 'bloc');
  }

  /** Un graphique : la liste, ses libellés, ses séries ; le dessin est fait par la bibliothèque. */
  private graphique(n: Extract<NoeudVue, { type: 'graphique' }>): string {
    const enLangues = (texte: string, langues?: { code: string; texte: string }[]) => (langues?.length ? `Langues.T(${langues.map((l) => `(${chaineCs(l.code)}, ${chaineCs(l.texte)})`).join(', ')})` : chaineCs(texte));
    const series = n.series.map((s, i) => {
      const couleur = s.couleur && this.ctx.couleurs.has(s.couleur) ? `Couleurs.${nomMethode(s.couleur)}` : `Palette.Couleur(${i})`;
      return `new SerieGraphique(${enLangues(s.nom, s.nomLangues)}, ${couleur}, ${s.valeur !== undefined ? chaineCs(cleJson(s.valeur)) : 'null'})`;
    });
    const args = [
      chaineCs(n.genre),
      `() => ${this.x.expr(n.liste)}`,
      n.etiquette !== undefined ? chaineCs(cleJson(n.etiquette)) : 'null',
      n.etiquettes !== undefined ? `() => ${this.x.expr(n.etiquettes)}` : 'null',
      `new[] { ${series.join(', ')} }`,
      n.devise !== undefined ? chaineCs(n.devise) : 'null',
      `() => ${enLangues(n.titre, n.titreLangues)}`,
      `() => ${this.x.enTexte(n.description)}`,
    ];
    if (n.proportions) args.push(String(Number((n.proportions[0] / n.proportions[1]).toFixed(4))));
    return this.styler(`GraphiqueFabrique.Creer(${args.join(', ')})`, n.classes, [], 'bloc');
  }

  /** L'appel d'une méthode d'événement, avec les variables de boucle qu'elle reçoit. */
  private appelMethodes(methodes: Methode[] | undefined, ensuite?: string): string | undefined {
    const appels = (methodes ?? []).map((m) => `${m.nom}(${m.boucles.map(nomCs).join(', ')})`);
    if (ensuite !== undefined) appels.push(ensuite);
    if (appels.length === 0) return undefined;
    return appels.length === 1 ? `() => ${appels[0]}` : `async () => { ${appels.map((a) => `await ${a};`).join(' ')} }`;
  }

  private styler(code: string, classes: string[], options: Option[], sorte: 'texte' | 'bloc' | 'bouton' | 'champ' | 'image'): string {
    for (const o of options) if (OPTIONS_NON_DESSINEES.has(o.nom)) this.ctx.nonDessinees.add(o.nom);
    const styles = classes.filter((c) => this.ctx.styles.has(c)).map((c) => `Styles.${nomMethode(c)}`);
    const options_ = styleDesOptions(options, this.ctx.couleurs, sorte);
    if (options_) styles.push(options_);
    return styles.length ? `UI.Styler(${code}, ${styles.join(', ')})` : code;
  }

  private visible(id: string, code: string): string {
    return this.visibles.has(id) ? `UI.Visible(() => EstVisible(${chaineCs(id)}), ${code})` : code;
  }

  private texteDe(n: Extract<NoeudVue, { type: 'element' }>): string {
    const texte = this.x.enTexte(n.contenu);
    return this.textesChanges.has(n.id) ? `() => TexteDe(${chaineCs(n.id)}, () => ${texte})` : `() => ${texte}`;
  }

  private element(n: Extract<NoeudVue, { type: 'element' }>, boucles: string[], formulaire: string | undefined): string {
    const id = chaineCs(n.id);
    const clics = this.appelMethodes(this.clics.get(n.id));
    const survols = this.appelMethodes(this.survols.get(n.id));
    const desactive = n.desactive === undefined ? undefined : n.desactive === true ? '() => true' : `() => ${this.x.condition(n.desactive)}`;
    const avecClic = (code: string) => {
      let r = code;
      if (clics) r = `UI.AuClic(${r}, ${clics})`;
      if (survols) r = `UI.AuSurvol(${r}, ${survols})`;
      return r;
    };
    let code: string;
    switch (n.genre) {
      case 'titre':
      case 'soustitre': {
        const premier = n.genre === 'titre' && !this.titreVu;
        if (n.genre === 'titre') this.titreVu = true;
        const niveau = n.niveau ?? (n.genre === 'soustitre' ? 3 : premier ? 1 : 2);
        code = avecClic(this.styler(`UI.Titre(${niveau}, ${this.texteDe(n)}, ${id})`, n.classes, n.options, 'texte'));
        break;
      }
      case 'texte':
        code = avecClic(this.styler(`UI.Texte(${this.texteDe(n)}, ${id})`, n.classes, n.options, 'texte'));
        break;
      case 'bouton': {
        const soumission = formulaire !== undefined ? this.soumissions.get(formulaire) : undefined;
        const action = clics ?? (soumission ? this.appelMethodes([soumission]) : undefined) ?? 'null';
        const args = [this.texteDe(n), action, id];
        if (desactive || n.reglages?.icone || (soumission && !clics)) args.push(desactive ?? 'null');
        if (n.reglages?.icone || (soumission && !clics)) args.push(n.reglages?.icone ? chaineCs(n.reglages.icone) : 'null');
        if (soumission && !clics) args.push('principal: true');
        code = this.styler(`UI.Bouton(${args.join(', ')})`, n.classes, n.options, 'bouton');
        if (survols) code = `UI.AuSurvol(${code}, ${survols})`;
        break;
      }
      case 'lien': {
        const action = this.appelMethodes(this.clics.get(n.id), this.allerDuLien(n)) ?? 'null';
        code = this.styler(`UI.Lien(${this.texteDe(n)}, ${action}, ${id})`, n.classes, n.options, 'texte');
        break;
      }
      case 'image':
        code = avecClic(this.styler(this.image(n), n.classes, n.options, 'image'));
        break;
      case 'champ':
        code = this.styler(this.champ(n, formulaire), n.classes, n.options, 'champ');
        break;
    }
    if (n.ancre !== undefined) code = `Routeur.Ancre(${chaineCs(n.ancre)}, ${code})`;
    return this.visible(n.id, code);
  }

  /** Ce que fait un lien : aller à une page, ou ouvrir une adresse externe. */
  private allerDuLien(n: Extract<NoeudVue, { type: 'element' }>): string | undefined {
    if (n.externe !== undefined) return `UI.OuvrirExterne(${chaineCs(n.externe)})`;
    if (n.externeValeur !== undefined) return `UI.OuvrirExterne(${this.x.enTexte(n.externeValeur)})`;
    if (n.adresseValeur !== undefined) return `Routeur.AllerAdresse(${this.x.enTexte(n.adresseValeur)})`;
    // « vers "carte#desserts" » ou « vers "#desserts" » : la page (ou celle-ci), puis l'endroit.
    if (n.versAncre !== undefined) return `Routeur.VersAncre(${n.cible !== undefined ? chaineCs(n.cible) : 'null'}, ${chaineCs(n.versAncre)}${this.actions.arguments(n.arguments)})`;
    if (n.cible !== undefined) return `Routeur.AllerVers(${chaineCs(n.cible)}${this.actions.arguments(n.arguments)})`;

    return undefined;
  }

  private image(n: Extract<NoeudVue, { type: 'element' }>): string {
    const description = n.image?.description ? this.x.enTexte(n.image.description) : '""';
    const source = n.image?.locale !== undefined ? chaineCs(nomDeLaCopie(n.image.locale)) : this.x.enTexte(n.contenu);
    return `UI.Image(() => ${source}, ${description}, ${chaineCs(n.id)})`;
  }

  private champ(n: Extract<NoeudVue, { type: 'element' }>, formulaire: string | undefined): string {
    const champ = this.portee.champs.get(n.id) as ChampPage;
    const saisie = n.saisie;
    const args = [chaineCs(n.id), this.x.enTexte(n.contenu), champ.signal, chaineCs(champ.sorte)];
    const nommes: string[] = [];
    if (saisie?.indiceValeur) nommes.push(`indice: ${this.x.enTexte(saisie.indiceValeur)}`);
    else if (saisie?.indiceLangues?.length) nommes.push(`indice: Langues.T(${saisie.indiceLangues.map((l) => `(${chaineCs(l.code)}, ${chaineCs(l.texte)})`).join(', ')})`);
    else if (saisie?.indice) nommes.push(`indice: ${chaineCs(saisie.indice)}`);
    if (saisie?.parmi) nommes.push(`parmi: () => ${this.x.expr(saisie.parmi)}`);
    if (n.desactive !== undefined) nommes.push(`desactive: ${n.desactive === true ? '() => true' : `() => ${this.x.condition(n.desactive)}`}`);
    const soumission = formulaire !== undefined ? this.soumissions.get(formulaire) : undefined;
    if (soumission) nommes.push(`entree: () => UI.Lancer(${this.appelMethodes([soumission])})`);
    if (saisie?.valeur) nommes.push(`depart: () => ${this.x.expr(saisie.valeur)}`);
    return `UI.Champ(${[...args, ...nommes].join(', ')})`;
  }

  private widget(n: Extract<NoeudVue, { type: 'widget' }>): string | undefined {
    if (!GLYPHES_WIDGETS.has(n.genre)) {
      this.refuser(`« ${n.genre === 'selecteurLangue' ? 'selecteur de langue' : n.genre} »`);
      return undefined;
    }
    let code: string;
    switch (n.genre) {
      case 'icone':
        code = `Icones.Element(${chaineCs(n.reglages.icone ?? 'info')}, 20)`;
        break;
      case 'badge':
        code = `UI.Badge(() => ${this.x.enTexte(n.contenu)})`;
        break;
      case 'avatar':
        code = `UI.Badge(() => V.Initiales(${this.x.expr(n.contenu)}))`;
        break;
      case 'progression':
        code = `UI.Progression(() => ${this.x.enNombre(n.contenu)}${n.maximum !== undefined ? `, ${n.maximum}` : ''})`;
        break;
      case 'chargement':
        code = 'UI.Chargement()';
        break;
      case 'selecteurLangue':
        return 'UI.SelecteurLangue()';
      case 'audio':
      case 'video': {
        const source = n.contenu.type === 'texte' && !n.contenu.versions && n.contenu.parties.every((p) => 'texte' in p)
          ? chaineCs(this.copieLocale(n.contenu.parties.map((p) => ('texte' in p ? p.texte : '')).join('')))
          : this.x.enTexte(n.contenu);
        const description = n.textes?.description ? this.x.enTexte(n.textes.description) : chaineCs(n.reglages.description ?? (n.genre === 'audio' ? 'Audio' : 'Vidéo'));
        const args = [`() => ${source}`, description, n.genre === 'video' ? 'true' : 'false'];
        if (n.reglages.boucle) args.push('boucle: true');
        if (n.textes?.transcription) args.push(`transcription: ${this.x.enTexte(n.textes.transcription)}`);
        code = `Medias.Lecteur(${args.join(', ')})`;
        break;
      }
      case 'qr': {
        const taille = { petite: 128, normale: 192, grande: 256, tres_grande: 320 }[n.options.find((o) => o.nom === 'taille')?.valeur ?? 'normale'] ?? 192;
        const description = n.reglages.descriptionLangues?.length ? `Langues.T(${n.reglages.descriptionLangues.map((l) => `(${chaineCs(l.code)}, ${chaineCs(l.texte)})`).join(', ')})` : chaineCs(n.reglages.description ?? 'Code QR');
        return `Qr.Element(() => ${this.x.enTexte(n.contenu)}, ${description}${taille !== 192 ? `, ${taille}` : ''})`;
      }
      case 'fichier': {
        const f = n.fichier;
        const lieu = f ? this.portee.variables.get(f.variable) : undefined;
        if (!f || !lieu?.signal) {
          this.refuser(`« fichier … dans ${f?.variable ?? '?'} » : la variable doit être une variable de la page,`);
          return undefined;
        }
        const familles = `new (string, string[])[] { ${f.familles.map((fa) => `(${chaineCs(fa.nom)}, new[] { ${fa.mime.map(chaineCs).join(', ')} })`).join(', ')} }`;
        code = `Fichiers.Choix(() => ${this.x.enTexte(n.contenu)}, ${lieu.signal}, ${familles}${f.octets !== undefined ? `, octets: ${f.octets}` : ''}${f.plusieurs ? ', plusieurs: true' : ''}${f.apercu ? '' : ', apercu: false'}, id: ${chaineCs(n.id)})`;
        break;
      }
      case 'etoiles':
        code = `UI.Etoiles(() => ${this.x.enNombre(n.contenu)}${n.maximum !== undefined ? `, ${n.maximum}` : ''})`;
        break;
      default:
        code = `UI.Texte(() => V.Nombre(${this.x.expr(n.contenu)}), ${chaineCs(n.id)})`;
    }
    return this.styler(code, n.classes, n.options, 'texte');
  }

  private bloc(n: Extract<NoeudVue, { type: 'bloc' }>, boucles: string[], formulaire: string | undefined): string | undefined {
    if (n.natif && !['vide', 'groupe', 'outils', 'actualiser', 'recherche', 'options'].includes(n.natif.genre)) {
      this.refuser(n.natif.genre === 'table' ? 'une table native' : `« ${n.natif.genre} »`);
      return undefined;
    }
    let code: string;
    const titre = n.titre ? `() => ${this.x.enTexte(n.titre)}` : '() => ""';
    switch (n.genre) {
      case 'ligne':
      case 'menu':
        code = this.vue(n.corps, boucles, formulaire, 'UI.Ligne');
        if (!code.startsWith('UI.Ligne') && !code.startsWith('UI.Pour(')) code = `UI.Ligne(${code})`;
        break;
      case 'grille': {
        const colonnes = Number(n.options.find((o) => o.nom === 'colonnes')?.valeur);
        code = this.vue(n.corps, boucles, formulaire, Number.isInteger(colonnes) && colonnes > 0 ? `UI.GrilleDe(${colonnes})` : 'UI.Grille');
        if (!code.startsWith('UI.Grille') && !code.startsWith('UI.Pour(')) code = `UI.Grille(${code})`;
        break;
      }
      case 'liste':
      case 'listeNumerotee': {
        const enfants = n.corps.map((c) => this.noeud(c, boucles, formulaire)).filter((c): c is string => c !== undefined);
        code = appel('UI.Puces', [n.genre === 'listeNumerotee' ? 'true' : 'false', ...enfants]);
        break;
      }
      case 'deroulant':
        code = `UI.Deroulant(${titre}, ${decaler(this.vue(n.corps, boucles, formulaire, 'UI.Pile'))})`;
        break;
      case 'accordeon':
        code = appel('UI.Pile', n.corps.map((c) => (c.type === 'bloc' && c.genre === 'deroulant' ? `UI.Deroulant(${c.titre ? `() => ${this.x.enTexte(c.titre)}` : '() => ""'}, ${decaler(this.vue(c.corps, boucles, formulaire, 'UI.Pile'))})` : this.noeud(c, boucles, formulaire))).filter((c): c is string => c !== undefined));
        break;
      case 'onglets': {
        const onglets = n.corps.filter((c): c is Extract<NoeudVue, { type: 'bloc' }> => c.type === 'bloc' && c.genre === 'onglet');
        code = appel('UI.Onglets', onglets.map((o) => `(${o.titre ? `() => ${this.x.enTexte(o.titre)}` : '() => ""'}, () => ${decaler(this.vue(o.corps, boucles, formulaire, 'UI.Pile'))})`));
        break;
      }
      case 'carte':
        code = `UI.Styler(${decaler(this.vue(n.corps, boucles, formulaire, 'UI.Pile'))}, Styles.CarteHumalis)`;
        break;
      case 'carrousel':
      case 'filAriane':
      case 'appareil':
        this.ctx.diagnostics.push({ gravite: 'avertissement', ligne: n.ligne, message: `« ${n.genre === 'filAriane' ? 'fil d\'ariane' : n.genre} » s'affiche sur Windows comme un simple bloc : ses éléments, les uns sous les autres.` });
        code = this.vue(n.corps, boucles, formulaire, 'UI.Pile');
        break;
      default:
        code = this.vue(n.corps, boucles, formulaire, 'UI.Pile');
        if (n.titre) code = appel('UI.Pile', [`UI.Titre(2, ${titre})`, code]);
    }
    if (!code.startsWith('UI.')) code = `UI.Pile(${code})`;
    code = this.styler(code, n.classes, n.options, 'bloc');
    if (n.ancre !== undefined) code = `Routeur.Ancre(${chaineCs(n.ancre)}, ${code})`;
    const bas = n.id !== undefined ? this.bas.get(n.id) : undefined;
    if (bas && bas.g.bouton !== null) {
      // Le bouton « Voir plus » : pour le clavier, et quand la page ne défile pas.
      const bouton = `UI.Bouton(() => ${chaineCs(bas.g.bouton ?? 'Voir plus')}, ${bas.methode.nom}, ${chaineCs(`${n.id}_voir_plus`)})`;
      code = appel('UI.Pile', [code, bas.g.tantQue ? `UI.Si(() => ${this.x.condition(bas.g.tantQue)}, () => ${bouton})` : bouton]);
    }
    return code;
  }

  private composant(n: Extract<NoeudVue, { type: 'composant' }>): string | undefined {
    const c = this.ctx.composants.get(n.nom);
    if (!c) {
      this.refuser(`« ${n.nom} » (un composant React)`);
      return undefined;
    }
    const args = c.parametres.map((p) => {
      const donne = n.proprietes.find((pr) => pr.nom === p.nom);
      return `() => ${donne ? this.x.expr(donne.valeur) : '(object?)null'}`;
    });
    return `UI.Composant(() => new ${nomComposant(n.nom)}(${args.join(', ')}))`;
  }

  /** Avant d'écrire la vue : ce qui change de texte ou de visibilité (pour ne suivre que ce qui en a besoin). */
  preparer(): void {
    const voir = (actions: Gestionnaire['actions']) => {
      for (const a of actions) {
        if (a.type === 'visibilite') a.ids.forEach((id) => this.visibles.add(id));
        if (a.type === 'changerTexte') a.ids.forEach((id) => this.textesChanges.add(id));
        sousActions(a).forEach(voir);
      }
    };
    const parcourir = (noeuds: NoeudVue[]) => {
      for (const n of noeuds) {
        if ('gestionnaires' in n) n.gestionnaires.forEach((g) => voir(g.actions));
        for (const enfants of ['corps', 'alors', 'sinon'] as const) if (enfants in n) parcourir((n as unknown as Record<string, NoeudVue[]>)[enfants]);
      }
    };
    this.ecran.gestionnaires.forEach((g) => voir(g.actions));
    parcourir(this.ecran.vue);
    // Une fenêtre a sa propre visibilité : elle n'est pas enveloppée.
    for (const id of this.fenetres) this.visibles.delete(id);
  }
}

/** L'écrivain indente de deux espaces ; le C# s'écrit d'habitude avec quatre. */
export const quatreEspaces = (code: string): string => code.replace(/^( +)/gm, (m) => m + m);

/** Plusieurs événements pour les mêmes touches : tous partent. */
function regrouper(liste: { touches: string; appel: string }[]): Map<string, string[]> {
  const parTouches = new Map<string, string[]>();
  for (const { touches, appel: a } of liste) parTouches.set(touches, [...(parTouches.get(touches) ?? []), a]);
  return parTouches;
}

/** Les conditions d'erreur d'un champ, dans l'ordre des messages de verificationsDuChamp. */
function testsDuChamp(v: string, saisie: Saisie | undefined): string[] {
  const sorte = saisie?.sorte ?? 'texte';
  const vide = `V.Vide(${v})`;
  const tests: string[] = [];
  if (saisie?.obligatoire) {
    if (sorte === 'case') tests.push(`!V.B(${v})`);
    else tests.push(vide);
  }
  const forme = (motif: string) => tests.push(`!${vide} && !V.Correspond(${v}, ${chaineCs(motif)})`);
  switch (sorte) {
    case 'email':
      forme('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');
      break;
    case 'date':
      forme('^\\d{4}-\\d{2}-\\d{2}$');
      break;
    case 'heure':
      forme('^\\d{2}:\\d{2}$');
      break;
    case 'adresseWeb':
      forme('^https?://\\S+$');
      break;
    case 'nombre':
      tests.push(`!${vide} && !V.EstNombre(${v})`);
      if (saisie?.minimum !== undefined) tests.push(`!${vide} && V.N(${v}) < ${saisie.minimum}`);
      if (saisie?.maximum !== undefined) tests.push(`!${vide} && V.N(${v}) > ${saisie.maximum}`);
      break;
  }
  return tests;
}

/** Le nom de la classe d'une page ou d'un composant. */
export const classeDe = (ecran: Ecran, genre: 'page' | 'composant'): string => (genre === 'page' ? nomPage(ecran.nom) : nomComposant(ecran.nom));

export type { Valeur };
