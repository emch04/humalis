/**
 * Une page Humalis (ou un composant) devient une fonction `@Composable` :
 * ses variables sont des états Compose, ses événements des fonctions
 * `suspend`, et ce qu'elle affiche des éléments Material 3.
 */
import { simplifier } from '../../analyse/elements.js';
import { lireCible } from '../../analyse/navigation.js';
import { verificationsDuChamp } from '../../i18n/messages.js';
import { nomDeLaCopie } from '../../ri/medias.js';
import type { Action, ArgumentsPage, Ecran, Gestionnaire, NoeudVue, Option, Saisie, Valeur } from '../../ri/types.js';
import { EcrivainActions, type HoteActions } from './actions.js';
import { EcrivainKotlin } from './ecrivain.js';
import { chaineKotlin, cleJson, nomComposant, nomKotlin } from './noms.js';
import type { CssAndroid, StyleCompose } from './css.js';
import { modificateurs, styleTexte, type SorteVue } from './styles.js';
import { nomEtatRequete, Valeurs, type Portee } from './valeurs.js';

/** Ce que toutes les pages partagent. */
export interface ContexteAndroid {
  paquet: string;
  /** Pour chaque page : la fonction qui donne sa route, et ce qu'elle attend. */
  pages: Map<string, { parametres: string[]; filtres: { nom: string; nombre?: boolean }[] }>;
  /** La route d'une page, avec ses paramètres déjà écrits en Kotlin. */
  route(page: string, parametres: string[], filtres: string[]): string;
  partages: Map<string, string>;
  fonctions: Set<string>;
  composants: Map<string, { nom: string; type: unknown }[]>;
  /** Les composants React : refusés une fois par la vérification du projet. */
  composantsReact: Set<string>;
  /** Le CSS du projet : le commun, puis « sur application », puis « sur android ». */
  css: CssAndroid;
  /** La clé sous laquelle une variable « avec memorisee » est gardée. */
  cle: string;
  /** Un fichier image recopié dans l'application : son nom dans assets/. */
  ressource(chemin: string): string;
  /** « largeur etroite » du thème : la largeur maximale d'une page, en dp. */
  largeur?: number;
  /** Les icônes employées, dessinées dans Icones.kt. */
  icones: Set<string>;
  refuser(ligne: number, message: string): void;
  avertir(ligne: number, message: string): void;
}

/** Un événement écrit comme une fonction de la page ; dans une boucle, il reçoit les variables de la boucle. */
interface Fonction {
  nom: string;
  parametres: string[];
  gestionnaire: Gestionnaire;
}

interface Champ {
  id: string;
  variable: string;
  libelle: string;
  saisie?: Saisie;
  sorte?: 'nombre' | 'case';
}

const majuscule = (mot: string) => mot.charAt(0).toUpperCase() + mot.slice(1);
const sansGenre = (id: string) => id.replace(/^(titre|texte|image|bouton|lien|champ)_/, '');
const nombreKt = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));

export class GenerateurPage implements HoteActions {
  readonly valeurs: Valeurs;
  readonly clesChamps = new Map<string, string>();
  private readonly portee: Portee;
  private readonly actions: EcrivainActions;
  private ligneCourante: number;
  private readonly noms = new Set<string>();
  private readonly fonctions: Fonction[] = [];
  private readonly clics = new Map<string, Fonction[]>();
  private readonly soumissions = new Map<string, Fonction>();
  private readonly saisiesSuivies = new Map<string, { fonction: Fonction; pause?: number }[]>();
  private readonly basDesBlocs = new Map<string, Fonction>();
  private readonly chargements: Gestionnaire[] = [];
  private readonly champs: Champ[] = [];
  private readonly formulaireDe = new Map<string, string>();
  private readonly champsDuFormulaire = new Map<string, string[]>();
  private readonly visibilites = new Map<string, boolean>();
  private readonly textesChanges = new Map<string, string>();
  private readonly fenetres = new Set<string>();
  /** Vrai à l'intérieur d'une ligne : un bloc y garde la largeur de son contenu. */
  private dansLigne = false;

  constructor(
    private readonly ecran: Ecran,
    private readonly app: ContexteAndroid,
    private readonly parametres?: { nom: string }[],
    private readonly nomFonction?: string,
  ) {
    this.ligneCourante = ecran.ligne;
    this.portee = { variables: new Map(), champs: new Map(), fonctions: app.fonctions, etatsRequetes: new Set(ecran.etatsRequetes ?? []) };
    this.valeurs = new Valeurs(this.portee, (quoi) => this.refuser(`${quoi} ne se traduit pas en Kotlin`));
    this.actions = new EcrivainActions(this);
  }

  refuser(message: string): void {
    this.app.refuser(this.ligneCourante, message);
  }

  private nomUnique(base: string): string {
    let nom = base;
    for (let i = 2; this.noms.has(nom) || [...this.portee.variables.values()].includes(nom); i++) nom = `${base}${i}`;
    this.noms.add(nom);
    return nom;
  }

  // ─── HoteActions ─────────────────────────────────────────────────────────

  visibilite(id: string): string {
    return `visible${majuscule(nomKotlin(sansGenre(id) || id))}`;
  }

  texteChange(id: string): string {
    let nom = this.textesChanges.get(id);
    if (!nom) {
      nom = this.nomUnique(`texte${majuscule(nomKotlin(sansGenre(id) || id))}`);
      this.textesChanges.set(id, nom);
    }
    return nom;
  }

  route(page: string, args?: ArgumentsPage): string | undefined {
    const cible = this.app.pages.get(page);
    if (!cible) return undefined;
    const lire = (nom: string) => {
      const donne = args?.find((a) => a.nom === nom);
      return donne ? this.valeurs.t(donne.valeur) : '""';
    };
    return this.app.route(page, cible.parametres.map(lire), cible.filtres.map((f) => lire(f.nom)));
  }

  // ─── Le recensement ──────────────────────────────────────────────────────

  private declarerVariables(): void {
    const v = this.portee.variables;
    for (const [nom, code] of this.app.partages) v.set(nom, code);
    for (const p of this.parametres ?? []) v.set(p.nom, nomKotlin(p.nom));
    for (const p of this.ecran.parametresAdresse ?? []) v.set(p, nomKotlin(p));
    for (const f of this.ecran.filtres ?? []) v.set(f.nom, nomKotlin(f.nom));
    for (const e of this.ecran.etat) v.set(e.nom, nomKotlin(e.nom));
    for (const c of this.ecran.calculs) v.set(c.nom, `${nomKotlin(c.nom)}()`);
    for (const nom of v.values()) this.noms.add(nom.replace(/\(\)$/, ''));
  }

  /** Les champs, les formulaires et les événements, avant d'écrire quoi que ce soit. */
  private recenser(noeuds: NoeudVue[], boucles: string[], formulaire?: string): void {
    for (const noeud of noeuds) {
      this.ligneCourante = noeud.ligne;
      switch (noeud.type) {
        case 'element':
          if (noeud.genre === 'champ') this.recenserChamp(noeud, formulaire);
          if (formulaire !== undefined && (noeud.genre === 'champ' || noeud.genre === 'bouton')) this.formulaireDe.set(noeud.id, formulaire);
          break;
        case 'formulaire':
          this.champsDuFormulaire.set(noeud.id, []);
          this.recenser(noeud.corps, boucles, noeud.id);
          break;
        case 'bloc':
          this.recenser(noeud.corps, boucles, formulaire);
          break;
        case 'fenetre':
          this.fenetres.add(noeud.id);
          this.visibilites.set(noeud.id, false);
          this.recenser(noeud.corps, boucles, formulaire);
          break;
        case 'condition':
          this.recenser(noeud.alors, boucles, formulaire);
          this.recenser(noeud.sinon, boucles, formulaire);
          break;
        case 'repetition': {
          const avant = this.portee.variables.get(noeud.variable);
          this.portee.variables.set(noeud.variable, nomKotlin(noeud.variable));
          const dedans = [...boucles, noeud.variable];
          this.recenser(noeud.corps, dedans, formulaire);
          for (const g of noeud.gestionnaires) this.enregistrer(g, dedans);
          if (avant !== undefined) this.portee.variables.set(noeud.variable, avant);
          else this.portee.variables.delete(noeud.variable);
          break;
        }
        default:
          break;
      }
    }
  }

  private recenserChamp(noeud: Extract<NoeudVue, { type: 'element' }>, formulaire?: string): void {
    const libelle = noeud.contenu.type === 'texte' && noeud.contenu.parties.every((p) => 'texte' in p) ? noeud.contenu.parties.map((p) => ('texte' in p ? p.texte : '')).join('') : noeud.id;
    const variable = this.nomUnique(nomKotlin(`champ_${simplifier(libelle) || noeud.id}`));
    const sorte = noeud.saisie?.sorte === 'nombre' || noeud.saisie?.sorte === 'case' ? noeud.saisie.sorte : undefined;
    this.portee.champs.set(noeud.id, { variable, ...(sorte ? { sorte } : {}) });
    this.champs.push({ id: noeud.id, variable, libelle, ...(noeud.saisie ? { saisie: noeud.saisie } : {}), ...(sorte ? { sorte } : {}) });
    this.clesChamps.set(noeud.id, cleJson(libelle));
    if (formulaire !== undefined) this.champsDuFormulaire.get(formulaire)?.push(noeud.id);
  }

  private fonction(base: string, parametres: string[], g: Gestionnaire): Fonction {
    const f = { nom: this.nomUnique(base), parametres, gestionnaire: g };
    this.fonctions.push(f);
    return f;
  }

  private enregistrer(g: Gestionnaire, boucles: string[]): void {
    this.ligneCourante = g.ligne;
    const cible = g.cibles[0] ?? '';
    const nomCible = majuscule(nomKotlin(sansGenre(cible) || 'page'));
    this.noterVisibilites(g.actions);
    switch (g.declencheur) {
      case 'chargement':
      case 'minuterie':
        this.chargements.push(g);
        return;
      case 'clic': {
        const f = this.fonction(`quandClique${nomCible}`, boucles, g);
        for (const id of g.cibles) this.clics.set(id, [...(this.clics.get(id) ?? []), f]);
        return;
      }
      case 'soumission':
        this.soumissions.set(cible, this.fonction(`quandSoumis${nomCible}`, boucles, g));
        return;
      case 'saisie':
      case 'pauseSaisie': {
        const f = this.fonction(`${g.declencheur === 'saisie' ? 'quandEcrit' : 'quandPause'}${nomCible}`, boucles, g);
        for (const id of g.cibles) this.saisiesSuivies.set(id, [...(this.saisiesSuivies.get(id) ?? []), { fonction: f, ...(g.declencheur === 'pauseSaisie' ? { pause: g.millisecondes ?? 500 } : {}) }]);
        return;
      }
      case 'bas':
        this.basDesBlocs.set(cible, this.fonction(`quandArriveEnBas${nomCible}`, boucles, g));
        return;
      case 'survol':
        // Un écran tactile n'a pas de survol : l'événement n'a pas lieu d'être, rien n'est faux.
        return;
      case 'touche':
        this.app.avertir(g.ligne, `« appuie sur "${g.touches}" » est sans effet sur Android : un téléphone n'a en général pas de clavier physique.`);
        return;
      default:
        this.refuser(`« ${g.declencheur} »`);
    }
  }

  /** Un élément que l'on montre est caché au départ ; une fenêtre aussi. */
  private noterVisibilites(actions: Action[]): void {
    const voir = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(voir);
      else if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (o.type === 'visibilite' && Array.isArray(o.ids)) {
          for (const id of o.ids as string[]) {
            if (o.visible) this.visibilites.set(id, false);
            else if (!this.visibilites.has(id)) this.visibilites.set(id, true);
          }
        }
        Object.values(o).forEach(voir);
      }
    };
    voir(actions);
  }

  // ─── La page ─────────────────────────────────────────────────────────────

  generer(): string {
    this.declarerVariables();
    this.recenser(this.ecran.vue, []);
    for (const g of this.ecran.gestionnaires) this.enregistrer(g, []);

    const nom = this.nomFonction ?? `Page${majuscule(simplifier(this.ecran.nom).replace(/_(.)/g, (_, c: string) => c.toUpperCase()))}`;
    const vue = new EcrivainKotlin();
    vue.indenter(() => vue.indenter(() => vue.indenter(() => this.ecrireCorps(vue, this.ecran.vue))));
    const evenements = this.ecrireFonctions();

    const e = new EcrivainKotlin();
    e.ligne(`// Produit par Humalis depuis ${this.parametres ? 'le composant' : 'la page'} « ${this.ecran.nom} ».`);
    e.ligne(`package ${this.app.paquet}`);
    e.ligne();
    for (const i of IMPORTS) e.ligne(`import ${i}`);
    e.ligne();
    const signature = [
      'nav: NavHostController',
      ...(this.parametres ?? []).map((p) => `${nomKotlin(p.nom)}: Any? = null`),
      ...(this.ecran.parametresAdresse ?? []).map((p) => `${nomKotlin(p)}: String`),
      ...(this.ecran.filtres ?? []).map((f) => `${nomKotlin(f.nom)}Lu: String = ""`),
    ];
    e.ligne('@OptIn(ExperimentalMaterial3Api::class)');
    e.ligne('@Composable');
    e.bloc(`fun ${nom}(${signature.join(', ')}) {`, () => {
      e.ligne('val portee = rememberCoroutineScope()');
      e.ligne('val relances = remember { HashMap<String, suspend () -> Unit>() }');
      for (const f of this.ecran.filtres ?? []) {
        const depart = f.nombre ? `${nomKotlin(f.nom)}Lu.toDoubleOrNull()` : `${nomKotlin(f.nom)}Lu.ifEmpty { null }`;
        e.ligne(`var ${nomKotlin(f.nom)} by remember(${nomKotlin(f.nom)}Lu) { mutableStateOf<Any?>(${depart}) }`);
      }
      for (const etat of this.ecran.etat) {
        const depart = this.valeurs.x(etat.initiale);
        if (etat.memorisee || etat.secret) e.ligne(`var ${nomKotlin(etat.nom)} by remember { EtatMemorise(${chaineKotlin(`${this.app.cle}.${this.ecran.nom}.${etat.nom}`)}, ${depart}${etat.secret ? ', secret = true' : ''}) }`);
        else e.ligne(`var ${nomKotlin(etat.nom)} by remember { mutableStateOf<Any?>(${depart}) }`);
      }
      for (const v of this.portee.etatsRequetes) e.ligne(`var ${nomEtatRequete(v)} by remember { mutableStateOf(EtatRequete()) }`);
      for (const c of this.champs) {
        const depart = c.sorte === 'case' ? 'false' : '""';
        e.ligne(`var ${c.variable} by remember { mutableStateOf(${depart}) }`);
        if (c.saisie?.valeur) {
          // « avec valeur … » : la valeur de départ, suivie tant que la personne n'y a rien changé.
          const valeur = c.sorte === 'case' ? `vrai(${this.valeurs.x(c.saisie.valeur)})` : this.valeurs.t(c.saisie.valeur);
          e.ligne(`var ${c.variable}Touche by remember { mutableStateOf(false) }`);
          e.ligne(`val ${c.variable}Depart = ${valeur}`);
          e.ligne(`LaunchedEffect(${c.variable}Depart) { if (!${c.variable}Touche) ${c.variable} = ${c.variable}Depart }`);
        }
      }
      for (const id of this.saisiesSuivies.keys()) {
        if (this.saisiesSuivies.get(id)!.some((s) => s.pause !== undefined)) e.ligne(`var frappes${majuscule(this.champVariable(id) ?? 'x')} by remember { mutableIntStateOf(0) }`);
      }
      for (const [id, depart] of this.visibilites) e.ligne(`var ${this.visibilite(id)} by remember { mutableStateOf(${depart}) }`);
      for (const nom of this.textesChanges.values()) e.ligne(`var ${nom} by remember { mutableStateOf<String?>(null) }`);
      // Un calcul est relu à chaque fois : il suit les variables qu'il lit.
      for (const c of this.ecran.calculs) e.ligne(`fun ${nomKotlin(c.nom)}(): Any? = ${this.valeurs.x(c.valeur)}`);
      for (const ligne of evenements) e.ligne(ligne);
      for (const [i, g] of this.chargements.entries()) {
        const corps = new EcrivainKotlin();
        this.ligneCourante = g.ligne;
        corps.indenter(() => this.actions.ecrire(corps, g.actions));
        const texte = corps.texte();
        // Une page qui lit la session attend de savoir qui est connecté.
        const session = /\bSession\.(connecte|admin|aRole)\b/.test(texte);
        const f = `auChargement${this.chargements.length > 1 ? i + 1 : ''}`;
        e.ligne(`suspend fun ${f}() {`);
        if (session) e.ligne('    Session.attendre()');
        for (const l of texte.trimEnd().split('\n')) e.ligne(l);
        e.ligne('}');
        e.ligne(`LaunchedEffect(Unit) { ${f}() }`);
      }
      for (const [id, suivies] of this.saisiesSuivies) {
        const variable = this.champVariable(id);
        for (const s of suivies) {
          if (s.pause === undefined || !variable) continue;
          const frappes = `frappes${majuscule(variable)}`;
          e.ligne(`LaunchedEffect(${frappes}) { if (${frappes} > 0) { delay(${s.pause}); ${s.fonction.nom}() } }`);
        }
      }
      e.ligne();
      // Une page défile, avec ses marges ; un composant se place là où on l'écrit.
      const largeur = this.app.largeur ? `.widthIn(max = ${this.app.largeur}.dp)` : '';
      const disposition = this.nomFonction === 'EnteteSite' || this.nomFonction === 'PiedSite';
      const racine = disposition
        ? 'ColonneHumalis(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {'
        : this.parametres
        ? 'ColonneHumalis {'
        : `ColonneHumalis(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)${largeur}, espacement = 16.dp) {`;
      e.bloc(racine, () => {
        for (const l of vue.texte().trimEnd().split('\n')) e.ligne(l.slice(12));
      });
    });
    return e.texte();
  }

  private champVariable(id: string): string | undefined {
    return this.portee.champs.get(id)?.variable;
  }

  /** Chaque événement devient une fonction `suspend` locale ; dans une boucle, elle reçoit ses variables. */
  private ecrireFonctions(): string[] {
    const lignes: string[] = [];
    for (const f of this.fonctions) {
      this.ligneCourante = f.gestionnaire.ligne;
      const avant = new Map(this.portee.variables);
      for (const p of f.parametres) this.portee.variables.set(p, nomKotlin(p));
      const corps = new EcrivainKotlin();
      corps.indenter(() => {
        if (f.gestionnaire.declencheur === 'soumission') this.ecrireVerifications(corps, f.gestionnaire.cibles[0] ?? '');
        if (f.gestionnaire.tantQue) corps.ligne(`if (!(${this.valeurs.b(f.gestionnaire.tantQue)})) return`);
        this.actions.ecrire(corps, f.gestionnaire.actions);
        // Après un envoi réussi, les champs du formulaire sont vidés, comme sur le web.
        if (f.gestionnaire.declencheur === 'soumission') {
          for (const id of this.champsDuFormulaire.get(f.gestionnaire.cibles[0] ?? '') ?? []) {
            const champ = this.champs.find((c) => c.id === id);
            // Un champ « avec valeur … » revient à sa valeur de départ ; les autres sont vidés.
            if (champ?.saisie?.valeur) corps.ligne(`${champ.variable} = ${champ.variable}Depart; ${champ.variable}Touche = false`);
            else if (champ) corps.ligne(`${champ.variable} = ${champ.sorte === 'case' ? 'false' : '""'}`);
          }
        }
      });
      this.portee.variables.clear();
      for (const [n, c] of avant) this.portee.variables.set(n, c);
      lignes.push(`suspend fun ${f.nom}(${f.parametres.map((p) => `${nomKotlin(p)}: Any?`).join(', ')}) {`);
      lignes.push(...corps.texte().trimEnd().split('\n').filter((l, i, t) => !(t.length === 1 && l === '')));
      lignes.push('}');
    }
    return lignes;
  }

  /** Avant l'envoi : les messages du web, dans le même ordre. */
  private ecrireVerifications(e: EcrivainKotlin, formulaire: string): void {
    for (const id of this.champsDuFormulaire.get(formulaire) ?? []) {
      const champ = this.champs.find((c) => c.id === id);
      if (!champ) continue;
      const messages = verificationsDuChamp(champ.variable, champ.saisie, [{ code: 'fr', libelle: champ.libelle }]).map(([, m]) => m[0].texte);
      const tests = testsDuChamp(champ.variable, champ.saisie);
      messages.forEach((message, i) => {
        if (tests[i]) e.ligne(`if (${tests[i]}) { Messages.afficher(${chaineKotlin(message)}, "erreur"); return }`);
      });
    }
  }

  // ─── La vue ──────────────────────────────────────────────────────────────

  private ecrireCorps(e: EcrivainKotlin, noeuds: NoeudVue[]): void {
    for (const n of noeuds) this.ecrireNoeud(e, n);
  }

  /** Un élément montré ou caché par la page. */
  private visible(e: EcrivainKotlin, id: string | undefined, ecrire: () => void): void {
    if (id !== undefined && this.visibilites.has(id) && !this.fenetres.has(id)) e.bloc(`if (${this.visibilite(id)}) {`, ecrire);
    else ecrire();
  }

  private ecrireNoeud(e: EcrivainKotlin, noeud: NoeudVue): void {
    this.ligneCourante = noeud.ligne;
    switch (noeud.type) {
      case 'element':
        return this.visible(e, noeud.id, () => this.ecrireElement(e, noeud));
      case 'widget':
        return this.visible(e, noeud.id, () => this.ecrireWidget(e, noeud));
      case 'formulaire':
        e.bloc('ColonneHumalis {', () => this.ecrireCorps(e, noeud.corps));
        return;
      case 'bloc':
        return this.visible(e, noeud.id, () => this.ecrireBloc(e, noeud));
      case 'condition':
        e.ligne(`if (${this.valeurs.b(noeud.test)}) {`);
        e.indenter(() => this.ecrireCorps(e, noeud.alors));
        if (noeud.sinon.length) {
          e.ligne('} else {');
          e.indenter(() => this.ecrireCorps(e, noeud.sinon));
        }
        e.ligne('}');
        return;
      case 'repetition': {
        const nom = nomKotlin(noeud.variable);
        const avant = this.portee.variables.get(noeud.variable);
        if (noeud.deplacement) this.app.avertir(noeud.ligne, "« avec deplacement » : sur Android, les éléments de la liste ne se déplacent pas encore du doigt.");
        e.bloc(`for (${nom} in liste(${this.valeurs.x(noeud.liste)})) {`, () => {
          this.portee.variables.set(noeud.variable, nom);
          e.bloc(`key(identifiant(${nom}).ifEmpty { ${nom}.hashCode().toString() }) {`, () => this.ecrireCorps(e, noeud.corps));
        });
        if (avant !== undefined) this.portee.variables.set(noeud.variable, avant);
        else this.portee.variables.delete(noeud.variable);
        return;
      }
      case 'locale': {
        const nom = this.nomUnique(nomKotlin(noeud.nom));
        e.ligne(`val ${nom}: Any? = ${this.valeurs.x(noeud.valeur)}`);
        this.portee.variables.set(noeud.nom, nom);
        return;
      }
      case 'composant': {
        const parametres = this.app.composants.get(noeud.nom);
        // Un composant React est déjà refusé, une fois, par la vérification du projet.
        if (!parametres) return this.app.composantsReact.has(noeud.nom) ? undefined : this.refuser(`le composant « ${noeud.nom} », inconnu ici,`);
        const args = noeud.proprietes.map((p) => `${nomKotlin(p.nom)} = ${this.valeurs.x(p.valeur)}`);
        e.ligne(`${nomComposant(noeud.nom)}(${['nav', ...args].join(', ')})`);
        return;
      }
      case 'fenetre':
        return this.ecrireFenetre(e, noeud);
      case 'sousPage':
        return this.refuser('« sous page »');
      case 'graphique':
        return this.refuser('« graphique »');
      case 'carte':
        return this.refuser('« carte »');
      case 'marqueur':
        return;
      case 'codeDocumentation':
        e.ligne(`Text(${chaineKotlin(noeud.code)}, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)).padding(12.dp))`);
        return;
      case 'tableauDocumentation':
        return this.refuser('le tableau de documentation');
    }
  }

  /** Ce qu'un clic déclenche : les fonctions des événements, avec les variables des boucles. */
  private auClic(id: string): string | undefined {
    const fonctions = this.clics.get(id);
    if (!fonctions?.length) return undefined;
    return `portee.launch { ${fonctions.map((f) => `${f.nom}(${f.parametres.map((p) => this.portee.variables.get(p) ?? nomKotlin(p)).join(', ')})`).join('; ')} }`;
  }

  private texteDe(noeud: Extract<NoeudVue, { type: 'element' }>): string {
    const ecrit = this.valeurs.t(noeud.contenu);
    const change = this.textesChanges.get(noeud.id);
    return change ? `(${change} ?: ${ecrit})` : ecrit;
  }

  private ecrireElement(e: EcrivainKotlin, noeud: Extract<NoeudVue, { type: 'element' }>): void {
    const options = noeud.options;
    switch (noeud.genre) {
      case 'titre':
      case 'soustitre':
      case 'texte': {
        const sorte: SorteVue = 'texte';
        const css = this.css(noeud.classes, 'texte');
        const style = styleTexte(options, noeud.genre === 'titre' ? `titre${noeud.niveau ?? 1}` : noeud.genre, css.texte);
        const m = modificateurs(options, sorte, css);
        const semantique = noeud.genre === 'texte' ? (noeud.annonce ? '.semantics { liveRegion = LiveRegionMode.Polite }' : '') : '.semantics { heading() }';
        const modificateur = m || semantique ? `modifier = Modifier${m}${semantique}` : '';
        e.ligne(`Text(${this.texteDe(noeud)}, ${style}${modificateur}`.replace(/, $/, '') + ')');
        return;
      }
      case 'image':
        return this.ecrireImage(e, noeud);
      case 'bouton':
        return this.ecrireBouton(e, noeud);
      case 'lien':
        return this.ecrireLien(e, noeud);
      case 'champ':
        return this.ecrireChamp(e, noeud);
    }
  }

  private ecrireImage(e: EcrivainKotlin, noeud: Extract<NoeudVue, { type: 'element' }>): void {
    const locale = noeud.image?.locale;
    let source: string;
    if (locale) {
      if (/\.svg$/i.test(locale)) {
        this.app.avertir(noeud.ligne, `l'image « ${locale} » est un SVG : Android ne sait pas l'afficher comme une photo. Utilisez un PNG, un JPEG ou un WebP ; à cet endroit, l'image reste vide.`);
      }
      source = chaineKotlin(this.app.ressource(nomDeLaCopie(locale)));
    } else source = this.valeurs.t(noeud.contenu);
    const description = noeud.image?.description ? this.valeurs.t(noeud.image.description) : 'null';
    const proportions = noeud.image?.proportions ? `.aspectRatio(${noeud.image.proportions[0]}f / ${noeud.image.proportions[1]}f)` : '';
    const m = modificateurs(noeud.options, 'image', this.css(noeud.classes, 'autre'));
    e.ligne(`ImageHumalis(${source}, ${description}, Modifier.fillMaxWidth()${proportions}${m}${proportions ? ', remplir = true' : ''})`);
  }

  /** Ce que le CSS des classes donne à cet élément. */
  private css(classes: string[] | undefined, sorte: 'texte' | 'bouton' | 'bloc' | 'autre'): StyleCompose {
    return this.app.css.style(classes ?? [], sorte);
  }

  private icone(nom: string, description = 'null', taille = 20, teinte?: string): string {
    this.app.icones.add(nom);
    return `Icon(Icones.${nomKotlin(nom)}, ${description}, Modifier.size(${taille}.dp)${teinte ? `, tint = ${teinte}` : ''})`;
  }

  private ecrireBouton(e: EcrivainKotlin, noeud: Extract<NoeudVue, { type: 'element' }>): void {
    const formulaire = this.formulaireDe.get(noeud.id);
    let action = this.auClic(noeud.id);
    if (!action && formulaire !== undefined) {
      const f = this.soumissions.get(formulaire);
      if (f) action = `portee.launch { ${f.nom}(${f.parametres.map((p) => this.portee.variables.get(p) ?? nomKotlin(p)).join(', ')}) }`;
    }
    const desactive = noeud.desactive === true ? 'enabled = false, ' : noeud.desactive ? `enabled = !(${this.valeurs.b(noeud.desactive)}), ` : '';
    const options = noeud.options;
    const valeur = (n: string) => options.find((o) => o.nom === n)?.valeur;
    const css = this.css(noeud.classes, 'bouton');
    const icone = noeud.reglages?.icone;
    const texte = this.texteDe(noeud);
    if (icone && noeud.reglages?.seule) {
      e.bloc(`IconButton(onClick = {${action ? ` ${action} ` : ''}}${parametre(desactive)}${parametre(modificateur(modificateurs(options, 'bouton', css)))}) {`, () => e.ligne(this.icone(icone, texte, 24)));
      return;
    }
    const fond = valeur('fond');
    const couleurs =
      fond && fond !== 'translucide'
        ? `colors = ButtonDefaults.buttonColors(containerColor = Couleurs.${nomKotlin(fond)}.lue(), contentColor = Couleurs.encre${majuscule(nomKotlin(fond))}.lue()), `
        : css.fond
          ? `colors = ButtonDefaults.buttonColors(containerColor = ${css.fond}${css.texte.has('color') ? `, contentColor = ${css.texte.get('color')}` : ''}), `
          : '';
    const forme = formeBouton(valeur('bordure')) || (css.forme ? `shape = ${css.forme}, ` : '');
    const bordure = css.bordure ? `border = ${css.bordure}, ` : '';
    const genre = valeur('style') === 'secondaire' || valeur('variante') === 'secondaire' ? 'OutlinedButton' : 'Button';
    e.bloc(`${genre}(onClick = {${action ? ` ${action} ` : ''}}${parametre(desactive)}${parametre(couleurs)}${parametre(forme)}${parametre(bordure)}${parametre(modificateur(modificateurs(options, 'bouton', css)))}) {`, () => {
      if (icone) {
        e.ligne(this.icone(icone));
        e.ligne('Spacer(Modifier.width(8.dp))');
      }
      const style = styleTexte(options, 'bouton', css.texte).replace(/, $/, '');
      e.ligne(`Text(${texte}${style ? `, ${style}` : ''})`);
    });
  }

  private ecrireLien(e: EcrivainKotlin, noeud: Extract<NoeudVue, { type: 'element' }>): void {
    let action: string | undefined = this.auClic(noeud.id);
    if (noeud.externe) action = `ouvrirExterne(${chaineKotlin(noeud.externe)})`;
    else if (noeud.externeValeur) action = `ouvrirExterne(${this.valeurs.t(noeud.externeValeur)})`;
    else if (noeud.adresseValeur) action = `ouvrirLien(nav, ${this.valeurs.t(noeud.adresseValeur)})`;
    else if (noeud.cible) {
      const lue = lireCible(noeud.cible);
      const route = lue.page ? this.route(lue.page, noeud.arguments) : undefined;
      if (lue.page && !route) return this.refuser(`le lien vers « ${lue.page} », une page qui n'existe pas,`);
      if (route) action = [action, `allerVers(nav, ${route})`].filter(Boolean).join('; ');
    }
    const icone = noeud.reglages?.icone;
    const css = this.css(noeud.classes, 'texte');
    const m = modificateurs(noeud.options, 'lien', css);
    const style = styleTexte(noeud.options, 'lien', new Map([...css.texte].filter(([nom]) => nom !== 'color')));
    const contenu = `Text(${this.texteDe(noeud)}, ${style}color = MaterialTheme.colorScheme.primary, textDecoration = TextDecoration.Underline)`;
    if (!icone) {
      e.ligne(`${contenu.replace(/\)$/, `, modifier = Modifier.clickable(role = Role.Button) { ${action ?? ''} }${m})`)}`);
      return;
    }
    e.bloc(`Row(Modifier.clickable(role = Role.Button) { ${action ?? ''} }${m}, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {`, () => {
      e.ligne(this.icone(icone, 'null', 20, 'MaterialTheme.colorScheme.primary'));
      e.ligne(contenu);
    });
  }

  private ecrireChamp(e: EcrivainKotlin, noeud: Extract<NoeudVue, { type: 'element' }>): void {
    const champ = this.champs.find((c) => c.id === noeud.id);
    if (!champ) return;
    const v = champ.variable;
    const saisie = noeud.saisie;
    const sorte = saisie?.sorte ?? 'texte';
    const suivies = this.saisiesSuivies.get(noeud.id) ?? [];
    const apres = [
      ...(saisie?.valeur ? [`${v}Touche = true`] : []),
      ...suivies.filter((s) => s.pause === undefined).map((s) => `portee.launch { ${s.fonction.nom}() }`),
      ...(suivies.some((s) => s.pause !== undefined) ? [`frappes${majuscule(v)}++`] : []),
    ];
    const changer = `{ ${v} = it${apres.map((a) => `; ${a}`).join('')} }`;
    const desactive = noeud.desactive === true ? 'enabled = false, ' : noeud.desactive ? `enabled = !(${this.valeurs.b(noeud.desactive)}), ` : '';
    const libelle = this.valeurs.t(noeud.contenu);
    const m = modificateurs(noeud.options, 'champ', this.css(noeud.classes, 'autre'));
    const indice = saisie?.indiceValeur ? this.valeurs.t(saisie.indiceValeur) : saisie?.indice ? chaineKotlin(saisie.indice) : undefined;
    switch (sorte) {
      case 'case':
        e.bloc(`Row(Modifier.toggleable(value = ${v}, role = Role.Checkbox, ${desactive}onValueChange = ${changer})${m}, verticalAlignment = Alignment.CenterVertically) {`, () => {
          e.ligne(`Checkbox(checked = ${v}, onCheckedChange = null${desactive ? `, ${desactive.replace(/, $/, '')}` : ''})`);
          e.ligne('Spacer(Modifier.width(8.dp))');
          e.ligne(`Text(${libelle})`);
        });
        return;
      case 'choix':
        e.bloc(`Column(Modifier.selectableGroup()${m}) {`, () => {
          e.ligne(`Text(${libelle}, style = MaterialTheme.typography.labelLarge)`);
          e.bloc(`for (possible in liste(${saisie?.parmi ? this.valeurs.x(saisie.parmi) : 'null'}).map { texte(it) }) {`, () => {
            e.bloc(`Row(Modifier.fillMaxWidth().selectable(selected = ${v} == possible, role = Role.RadioButton${desactive ? `, ${desactive.replace(/, $/, '')}` : ''}, onClick = { val it = possible; ${changer.slice(2, -2)} }).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {`, () => {
              e.ligne(`RadioButton(selected = ${v} == possible, onClick = null)`);
              e.ligne('Spacer(Modifier.width(8.dp))');
              e.ligne('Text(possible)');
            });
          });
        });
        return;
      case 'liste': {
        const ouvert = this.nomUnique(`${v}Ouvert`);
        e.ligne(`var ${ouvert} by remember { mutableStateOf(false) }`);
        e.bloc(`ExposedDropdownMenuBox(expanded = ${ouvert}, onExpandedChange = { ${ouvert} = it }${m ? `, modifier = Modifier${m}` : ''}) {`, () => {
          e.ligne(`OutlinedTextField(${v}, {}, readOnly = true, ${desactive}label = { Text(${libelle}) }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(${ouvert}) }, modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth())`);
          e.bloc(`ExposedDropdownMenu(expanded = ${ouvert}, onDismissRequest = { ${ouvert} = false }) {`, () => {
            e.bloc(`for (possible in liste(${saisie?.parmi ? this.valeurs.x(saisie.parmi) : 'null'}).map { texte(it) }) {`, () => {
              e.ligne(`DropdownMenuItem(text = { Text(possible) }, onClick = { val it = possible; ${changer.slice(2, -2)}; ${ouvert} = false })`);
            });
          });
        });
        return;
      }
      default: {
        const clavier = { email: 'KeyboardType.Email', telephone: 'KeyboardType.Phone', nombre: 'KeyboardType.Decimal', motDePasse: 'KeyboardType.Password', adresseWeb: 'KeyboardType.Uri', date: 'KeyboardType.Number', heure: 'KeyboardType.Number' }[sorte as string];
        const reglages = [
          `label = { Text(${libelle}) }`,
          ...(indice ? [`placeholder = { Text(${indice}) }`] : sorte === 'date' ? ['placeholder = { Text("AAAA-MM-JJ") }'] : sorte === 'heure' ? ['placeholder = { Text("HH:MM") }'] : []),
          ...(clavier ? [`keyboardOptions = KeyboardOptions(keyboardType = ${clavier})`] : []),
          ...(sorte === 'motDePasse' ? ['visualTransformation = PasswordVisualTransformation()'] : []),
          sorte === 'texteLong' ? 'minLines = 3' : 'singleLine = true',
        ];
        e.ligne(`OutlinedTextField(${v}, ${changer}, ${desactive}${reglages.join(', ')}, modifier = Modifier.fillMaxWidth()${m})`);
      }
    }
  }

  private ecrireWidget(e: EcrivainKotlin, noeud: Extract<NoeudVue, { type: 'widget' }>): void {
    const contenu = noeud.contenu;
    const description = noeud.reglages.description ? chaineKotlin(noeud.reglages.description) : 'null';
    const m = modificateurs(noeud.options, 'bloc', this.css(noeud.classes, 'autre'));
    switch (noeud.genre) {
      case 'icone': {
        const nom = noeud.reglages.icone ?? (contenu.type === 'texte' ? contenu.parties.map((p) => ('texte' in p ? p.texte : '')).join('') : '');
        this.app.icones.add(nom);
        e.ligne(`Icon(Icones.${nomKotlin(nom)}, ${noeud.reglages.decoratif ? 'null' : description}, Modifier.size(24.dp)${m})`);
        return;
      }
      case 'badge':
        e.ligne(`Text(${this.valeurs.t(contenu)}, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier${m}.background(MaterialTheme.colorScheme.secondaryContainer, RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 2.dp))`);
        return;
      case 'avatar': {
        const photo = noeud.reglages.photo;
        e.bloc(`Box(Modifier.size(48.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer)${m}, contentAlignment = Alignment.Center) {`, () => {
          if (photo) e.ligne(`ImageHumalis(${this.valeurs.t(photo)}, ${this.valeurs.t(contenu)}, Modifier.fillMaxSize(), remplir = true)`);
          else e.ligne(`Text(initialesDe(${this.valeurs.t(contenu)}), color = MaterialTheme.colorScheme.onPrimaryContainer, style = MaterialTheme.typography.titleMedium)`);
        });
        return;
      }
      case 'progression': {
        const max = nombreKt(noeud.maximum ?? 100);
        e.ligne(`LinearProgressIndicator(progress = { (${this.valeurs.n(contenu)} / ${max}).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth()${m})`);
        return;
      }
      case 'chargement':
        e.ligne(`CircularProgressIndicator(Modifier.semantics { contentDescription = ${contenu.type === 'texte' && contenu.parties.length ? this.valeurs.t(contenu) : '"Chargement"'} }${m})`);
        return;
      case 'etoiles': {
        this.app.icones.add('etoile');
        const max = noeud.maximum ?? 5;
        e.bloc(`Row(Modifier.semantics(mergeDescendants = true) { contentDescription = formaterNombre(${this.valeurs.n(contenu)}) + " sur ${max}" }${m}) {`, () => {
          e.bloc(`for (rang in 1..${max}) {`, () => {
            e.ligne(`Icon(Icones.etoile, null, Modifier.size(20.dp), tint = if (rang <= Math.round(${this.valeurs.n(contenu)})) Color(0xFFF5A623) else MaterialTheme.colorScheme.outlineVariant)`);
          });
        });
        return;
      }
      case 'compteur':
        e.ligne(`Text(texte(${this.valeurs.x(contenu)}), style = MaterialTheme.typography.displaySmall${m ? `, modifier = Modifier${m}` : ''})`);
        return;
      default:
        return this.refuser(`l'élément ${({ qr: '« qr »', fichier: '« fichier »', audio: '« audio »', video: '« video »', signature: '« signature »', selecteurLangue: '« selecteur de langue »' } as Record<string, string>)[noeud.genre] ?? `« ${noeud.genre} »`}`);
    }
  }

  private ecrireBloc(e: EcrivainKotlin, noeud: Extract<NoeudVue, { type: 'bloc' }>): void {
    const options = noeud.options;
    const valeur = (nom: string) => options.find((o) => o.nom === nom)?.valeur;
    const css = this.css(noeud.classes, 'bloc');
    const espace = { aucune: 0, petite: 8, moyenne: 16, grande: 32 }[valeur('espacement') ?? ''] ?? (css.ecart !== undefined ? Number(css.ecart.toFixed(2)) : noeud.genre === 'grille' ? 16 : 12);
    const m = modificateurs(options, 'bloc', css);
    switch (noeud.genre) {
      case 'ligne':
      case 'menu':
      case 'filAriane':
        if (noeud.genre === 'menu' && valeur('menu') === 'vertical') {
          e.bloc(`ColonneHumalis(Modifier${m}, espacement = ${espace}.dp) {`, () => this.ecrireCorps(e, noeud.corps));
          break;
        }
        {
          const alignement = { debut: 'Alignment.Top', centree: 'Alignment.CenterVertically', fin: 'Alignment.Bottom' }[valeur('alignement') ?? 'centree'] ?? 'Alignment.CenterVertically';
          const avant = this.dansLigne;
          this.dansLigne = true;
          e.bloc(`LigneHumalis(Modifier${m}, espacement = ${noeud.genre === 'filAriane' ? 8 : espace}.dp, repartition = ${chaineKotlin(valeur('repartition') ?? 'debut')}, alignement = ${alignement}) {`, () => {
            noeud.corps.forEach((enfant, i) => {
              if (noeud.genre === 'filAriane' && i > 0) e.ligne('Text("›", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.clearAndSetSemantics { })');
              this.ecrireNoeud(e, enfant);
            });
          });
          this.dansLigne = avant;
        }
        break;
      case 'grille':
        e.bloc(`GrilleHumalis(${Number(valeur('colonnes') ?? 2)}, Modifier${m}, espacement = ${espace}.dp) {`, () => this.ecrireCorps(e, noeud.corps));
        break;
      case 'liste':
      case 'listeNumerotee': {
        const numero = this.nomUnique('rang');
        e.bloc(`ColonneHumalis(Modifier${m}, espacement = 6.dp) {`, () => {
          if (noeud.genre === 'listeNumerotee') e.ligne(`var ${numero} = 0`);
          for (const enfant of noeud.corps) {
            e.bloc('Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {', () => {
              e.ligne(noeud.genre === 'liste' ? 'Text("•")' : `Text("#{++${numero}}.")`.replace('#{', '${'));
              e.bloc('Column(Modifier.weight(1f)) {', () => this.ecrireNoeud(e, enfant));
            });
          }
        });
        break;
      }
      case 'deroulant': {
        const lue = noeud.etat ? this.portee.variables.get(noeud.etat) : undefined;
        const ouvert = lue ? (noeud.index !== undefined ? `egal(${lue}, ${nombreKt(noeud.index)})` : `vrai(${lue})`) : 'false';
        const basculer = lue ? (noeud.index !== undefined ? `${lue} = if (${ouvert}) -1.0 else ${nombreKt(noeud.index)}` : `${lue} = !vrai(${lue})`) : '';
        e.bloc(`Column(Modifier.fillMaxWidth()${m}) {`, () => {
          e.bloc(`Row(Modifier.fillMaxWidth().clickable(role = Role.Button) { ${basculer} }.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {`, () => {
            e.ligne(`Text(${noeud.titre ? this.valeurs.t(noeud.titre) : '""'}, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))`);
            e.ligne(`Text(if (${ouvert}) "−" else "+", style = MaterialTheme.typography.titleMedium)`);
          });
          e.bloc(`if (${ouvert}) {`, () => e.bloc('ColonneHumalis(Modifier.padding(bottom = 12.dp)) {', () => this.ecrireCorps(e, noeud.corps)));
          e.ligne('HorizontalDivider()');
        });
        break;
      }
      case 'onglets': {
        const onglets = noeud.corps.filter((n): n is Extract<NoeudVue, { type: 'bloc' }> => n.type === 'bloc');
        const lue = noeud.etat ? this.portee.variables.get(noeud.etat) : undefined;
        if (!lue) return this.refuser('des onglets sans état');
        e.bloc(`Column(Modifier.fillMaxWidth()${m}) {`, () => {
          e.bloc(`PrimaryTabRow(selectedTabIndex = nombre(${lue}).toInt()) {`, () => {
            onglets.forEach((o, i) => e.ligne(`Tab(selected = nombre(${lue}).toInt() == ${i}, onClick = { ${lue} = ${i}.0 }, text = { Text(${o.titre ? this.valeurs.t(o.titre) : '""'}) })`));
          });
          e.ligne('Spacer(Modifier.height(12.dp))');
          onglets.forEach((o, i) => e.bloc(`if (nombre(${lue}).toInt() == ${i}) {`, () => e.bloc('ColonneHumalis {', () => this.ecrireCorps(e, o.corps))));
        });
        break;
      }
      case 'carrousel':
        e.bloc(`Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())${m}, horizontalArrangement = Arrangement.spacedBy(${espace}.dp)) {`, () => {
          for (const enfant of noeud.corps) e.bloc('Box(Modifier.width(280.dp)) {', () => this.ecrireNoeud(e, enfant));
        });
        break;
      case 'onglet':
      case 'carte':
        return this.refuser(`le bloc « ${noeud.genre} » à cet endroit`);
      default: {
        // section, bloc, contenu, entete, pied, colonne, accordeon, appareil : une colonne.
        const alignement = { debut: 'Alignment.Start', centree: 'Alignment.CenterHorizontally', fin: 'Alignment.End', etire: 'Alignment.Start' }[valeur('alignement') ?? 'debut'] ?? 'Alignment.Start';
        // Comme sur le web, un bloc décoré prend toute la largeur ; dans une ligne, il garde celle de son contenu.
        const plein = !this.dansLigne && (noeud.genre === 'section' || valeur('fond') !== undefined || valeur('ombre') !== undefined || css.decor !== '') ? '.fillMaxWidth()' : '';
        const avantColonne = this.dansLigne;
        e.bloc(`ColonneHumalis(Modifier${plein}${m}, espacement = ${noeud.genre === 'accordeon' ? 0 : espace}.dp, alignement = ${alignement}) {`, () => {
          // Les enfants d'une colonne retrouvent toute sa largeur.
          this.dansLigne = false;
          this.ecrireCorps(e, noeud.corps);
          this.dansLigne = avantColonne;
        });
      }
    }
    // « arrive en bas de » ce bloc : le bouton « Voir plus ».
    if (noeud.id !== undefined && this.basDesBlocs.has(noeud.id)) {
      const f = this.basDesBlocs.get(noeud.id)!;
      const tantQue = f.gestionnaire.tantQue ? this.valeurs.b(f.gestionnaire.tantQue) : 'true';
      const args = f.parametres.map((p) => this.portee.variables.get(p) ?? nomKotlin(p)).join(', ');
      e.bloc(`if (${tantQue}) {`, () => e.ligne(`TextButton(onClick = { portee.launch { ${f.nom}(${args}) } }) { Text(${chaineKotlin(f.gestionnaire.bouton ?? 'Voir plus')}) }`));
    }
  }

  private ecrireFenetre(e: EcrivainKotlin, noeud: Extract<NoeudVue, { type: 'fenetre' }>): void {
    const visible = this.visibilite(noeud.id);
    e.bloc(`if (${visible}) {`, () => {
      e.bloc(`Dialog(onDismissRequest = { ${noeud.obligatoire ? '' : `${visible} = false`} }) {`, () => {
        e.bloc('Surface(shape = RoundedCornerShape(16.dp), tonalElevation = 6.dp) {', () => {
          e.bloc('ColonneHumalis(Modifier.padding(24.dp).verticalScroll(rememberScrollState())) {', () => {
            e.ligne(`Text(${chaineKotlin(noeud.titre)}, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })`);
            if (noeud.description) e.ligne(`Text(${chaineKotlin(noeud.description)}, color = MaterialTheme.colorScheme.onSurfaceVariant)`);
            this.ecrireCorps(e, noeud.corps);
            if (!noeud.obligatoire) e.ligne(`TextButton(onClick = { ${visible} = false }, modifier = Modifier.align(Alignment.End)) { Text("Fermer") }`);
          });
        });
      });
    });
  }
}

/** `modifier = Modifier…`, ou rien quand il n'y a aucun modificateur. */
const modificateur = (m: string): string => (m ? `modifier = Modifier${m}` : '');
/** Un paramètre de plus, précédé de sa virgule ; « enabled = false, » perd sa virgule finale. */
const parametre = (p: string): string => (p ? `, ${p.replace(/, $/, '')}` : '');

/** La forme d'un bouton : « bordure arrondie » (le défaut de Material), « carree », « douce ». */
function formeBouton(bordure: string | undefined): string {
  if (bordure === 'carree') return 'shape = RectangleShape, ';
  if (bordure === 'douce') return 'shape = RoundedCornerShape(8.dp), ';
  return '';
}

/** Les tests Kotlin, dans l'ordre des messages de `verificationsDuChamp`. */
function testsDuChamp(v: string, saisie: Saisie | undefined): string[] {
  const sorte = saisie?.sorte ?? 'texte';
  const vide = `${v}.isBlank()`;
  const tests: string[] = [];
  if (saisie?.obligatoire) {
    if (sorte === 'case') tests.push(`!${v}`);
    else if (sorte === 'choix' || sorte === 'liste') tests.push(`${v}.isEmpty()`);
    else tests.push(vide);
  }
  const forme = (motif: string) => tests.push(`!${vide} && !Regex(${chaineKotlin(motif)}).matches(${v}.trim())`);
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
      tests.push(`!${vide} && ${v}.trim().replace(',', '.').toDoubleOrNull() == null`);
      if (saisie?.minimum !== undefined) tests.push(`!${vide} && nombre(${v}) < ${nombreKt(saisie.minimum)}`);
      if (saisie?.maximum !== undefined) tests.push(`!${vide} && nombre(${v}) > ${nombreKt(saisie.maximum)}`);
      break;
  }
  return tests;
}

export const IMPORTS = [
  'android.net.Uri',
  'androidx.compose.foundation.*',
  'androidx.compose.foundation.layout.*',
  'androidx.compose.foundation.selection.*',
  'androidx.compose.foundation.shape.CircleShape',
  'androidx.compose.foundation.shape.RoundedCornerShape',
  'androidx.compose.foundation.text.KeyboardOptions',
  'androidx.compose.material3.*',
  'androidx.compose.runtime.*',
  'androidx.compose.ui.Alignment',
  'androidx.compose.ui.Modifier',
  'androidx.compose.ui.draw.clip',
  'androidx.compose.ui.draw.shadow',
  'androidx.compose.ui.graphics.Brush',
  'androidx.compose.ui.graphics.Color',
  'androidx.compose.ui.graphics.RectangleShape',
  'androidx.compose.ui.platform.LocalConfiguration',
  'androidx.compose.ui.semantics.*',
  'androidx.compose.ui.text.font.FontFamily',
  'androidx.compose.ui.text.font.FontWeight',
  'androidx.compose.ui.text.input.KeyboardType',
  'androidx.compose.ui.text.input.PasswordVisualTransformation',
  'androidx.compose.ui.text.style.TextAlign',
  'androidx.compose.ui.text.style.TextDecoration',
  'androidx.compose.ui.unit.dp',
  'androidx.compose.ui.unit.sp',
  'androidx.compose.ui.window.Dialog',
  'androidx.navigation.NavHostController',
  'kotlinx.coroutines.delay',
  'kotlinx.coroutines.launch',
];

export type { Option, Valeur };
