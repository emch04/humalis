/**
 * Une page Humalis devient une vue SwiftUI : une variable est un `@State`,
 * un calcul une propriété recalculée, un événement une fonction, et la vue le
 * `body`. Ce qui n'existe pas encore ici est refusé avec la ligne du programme.
 */
import { simplifier } from '../../analyse/elements.js';
import { verificationsDuChamp, libellesEnLangues } from '../../i18n/messages.js';
import type { Ecran, Etat, Gestionnaire, LangueRI, NoeudVue, Saisie, TypeValeur, Valeur } from '../../ri/types.js';
import { nomDeLaCopie } from '../../ri/medias.js';
import { Ecrivain } from '../web/ecrivain.js';
import { titreEtDescription } from '../web/ecran.js';
import { EcrivainActions, type HotePage } from './actions.js';
import { nomIcone } from './icones.js';
import { chaineSwift, cleJson, nomComposant, nomPage, nomSwift } from './noms.js';
import { clavier, modificateurs, touches, ESPACES, type Option } from './styles.js';
import type { CssApple } from './css.js';
import { FICHIER_CHOISI, plusPrecis, Valeurs, type Expr, type Lecture, type Portee, type Types } from './valeurs.js';

const TEXTE: TypeValeur = { genre: 'texte' };
const NOMBRE: TypeValeur = { genre: 'nombre' };
const BOOLEEN: TypeValeur = { genre: 'booleen' };

export interface ContexteApple {
  /** Le CSS du projet, traduit en modificateurs. */
  css: CssApple;
  types: Types;
  partages: Etat[];
  fonctions: Portee['fonctions'];
  langues?: LangueRI[];
  /** Les pages du programme : leurs paramètres et leurs filtres, pour écrire les routes. */
  pages: HotePage['pages'];
  /** Le début des clés gardées sur l'appareil. */
  cle: string;
  /** Les paramètres de chaque composant écrit en Humalis. */
  composants: Map<string, { nom: string; type: TypeValeur }[]>;
  /** Les vues Swift écrites à la main (« sur apple "Carte.swift" »). */
  natifs: Set<string>;
  /** Le nom Swift d'un fichier local copié dans l'application. */
  ressource(chemin: string): string;
  /** Un refus : rien ne sera écrit. */
  refuser(ligne: number, message: string): void;
  /** Ce qui reste possible, avec une différence à connaître. */
  avertir(ligne: number, message: string): void;
  /** Vrai si la page lit la session. */
  session: boolean;
  /** La police des titres du bloc « theme ». */
  policeTitres?: string;
  /** La page d'entrée : elle reste sous les autres, et se relit quand on y revient. */
  pageEntree?: string;
}

interface Fonction {
  nom: string;
  parametres: { nom: string; type: TypeValeur; opt: boolean }[];
  gestionnaire: Gestionnaire;
  formulaire?: string;
  asynchrone?: boolean;
  code?: string;
}

const majuscule = (mot: string) => mot.charAt(0).toUpperCase() + mot.slice(1);
const sansGenre = (id: string) => id.replace(/^(titre|texte|image|bouton|lien|champ)_/, '');
const UNE_LIGNE = new Set(['texte', 'email', 'telephone', 'nombre', 'date', 'heure', 'motDePasse', 'adresseWeb']);

export class GenerateurPage implements HotePage {
  valeurs!: Valeurs;
  private dansReglages = false;
  /** Les tables de la page : chacune garde son ordre de tri. */
  private readonly tablesTriees: { nom: string; type: string }[] = [];
  ligne = 0;
  pages: HotePage['pages'];
  etatsRequetes: Set<string>;
  private readonly portee: Portee;
  private readonly actions: EcrivainActions;
  private readonly clesChamps = new Map<string, string>();
  private readonly libelles = new Map<string, string>();
  private readonly libellesLangues = new Map<string, Map<string, string>>();
  private readonly saisies = new Map<string, Saisie>();
  private readonly champsEtat: { id: string; variable: string; sorte?: 'nombre' | 'case' }[] = [];
  private readonly formulaires = new Map<string, { nom: string; champs: string[]; fonction?: Fonction; parametres: string[] }>();
  private readonly formulaireDe = new Map<string, string>();
  private readonly montres = new Set<string>();
  private readonly caches = new Set<string>();
  private readonly fenetres = new Set<string>();
  private readonly textesChanges = new Set<string>();
  private readonly fonctions: Fonction[] = [];
  private readonly clics = new Map<string, Fonction[]>();
  private readonly survols = new Map<string, Fonction[]>();
  private readonly chargements: Gestionnaire[] = [];
  private readonly minuteries: Gestionnaire[] = [];
  private readonly saisiesSuivies: { gestionnaire: Gestionnaire; fonction: Fonction }[] = [];
  private readonly raccourcis: { touches: string; fonction: Fonction }[] = [];
  private readonly basDesBlocs = new Map<string, Fonction>();
  private readonly ordres = new Map<string, Fonction>();
  private readonly champsMotDePasse = new Set<string>();
  private readonly champsEmail = new Set<string>();
  private readonly nomsPris = new Set<string>();
  private titreVu = false;
  private dansLigne = false;

  private readonly ecran: Ecran;

  constructor(
    ecran: Ecran,
    private readonly app: ContexteApple,
    private readonly parametres?: { nom: string; type: TypeValeur }[],
    /** Le nom du type, quand ce n'est pas celui de la page (l'en-tête, le pied). */
    private readonly nomForce?: string,
    /** L'en-tête : son premier menu passe dans la barre latérale, sur iPad et Mac. */
    private menuAReplier = false,
  ) {
    // Une variable qui reçoit un fichier choisi : son type est celui du fichier, pas une fiche ordinaire.
    const choisis = variablesDeFichier(ecran.vue);
    for (const m of JSON.stringify([ecran.vue, ecran.gestionnaires]).matchAll(/"type":"prisePhoto","variable":"([^"]+)"/g)) choisis.add(m[1]);
    this.ecran = {
      ...ecran,
      // « en arriere plan » n'appartient pas à la page ouverte : voir arrierePlanSwift.
      gestionnaires: ecran.gestionnaires.filter((g) => g.declencheur !== 'arrierePlan' && g.declencheur !== 'commandeMenu'),
      etat: ecran.etat.map((e) => {
        if (!choisis.has(e.nom)) return e;
        const de = e.type.genre === 'liste' ? e.type.de : e.type;
        const type: TypeValeur = de.genre === 'fiche' ? { ...de, fichier: FICHIER_CHOISI } : { genre: 'fiche', champs: [], fichier: FICHIER_CHOISI };
        return { ...e, type: e.type.genre === 'liste' ? { genre: 'liste', de: type } : type };
      }),
    };
    this.pages = app.pages;
    this.etatsRequetes = new Set(ecran.etatsRequetes ?? []);
    this.portee = {
      variables: new Map(),
      champs: new Map(),
      fonctions: app.fonctions,
      etatsRequetes: this.etatsRequetes,
      besoins: new Set(),
      langues: app.langues !== undefined,
    };
    this.valeurs = new Valeurs(app.types, this.portee, (quoi) => this.refuser(this.ligne, `${quoi} ne se traduit pas en Swift`));
    this.actions = new EcrivainActions(this, this.clesChamps);
  }

  refuser(ligne: number, quoi: string): void {
    this.app.refuser(ligne, `${quoi} (page « ${this.ecran.nom} »).`);
  }

  estEtat(nom: string): boolean {
    return this.portee.variables.has(nom);
  }

  estHorsLigne(nom: string): boolean {
    return [...this.ecran.etat, ...this.app.partages].some((e) => e.nom === nom && e.horsLigne);
  }

  nomEtatRequete(nom: string): string {
    return `etat${majuscule(nomSwift(nom))}`;
  }

  private nomUnique(base: string): string {
    let resultat = base;
    for (let n = 2; this.nomsPris.has(resultat); n++) resultat = `${base}${n}`;
    this.nomsPris.add(resultat);
    return resultat;
  }

  private get nomStruct(): string {
    return this.nomForce ?? (this.parametres ? nomComposant(this.ecran.nom) : nomPage(this.ecran.nom));
  }

  // ─── Recensement ─────────────────────────────────────────────────────────

  private declarerVariables(): void {
    const v = this.portee.variables;
    if (this.app.langues) v.set('langue', { code: 'Langues.commun.code', type: TEXTE, opt: false });
    for (const e of this.app.partages) v.set(e.nom, { code: `Partage.commun.${nomSwift(e.nom)}`, type: e.type, opt: e.facultatif ?? false });
    for (const p of this.parametres ?? []) v.set(p.nom, { code: nomSwift(p.nom), type: p.type, opt: false });
    for (const p of this.ecran.parametresAdresse ?? []) v.set(p, { code: nomSwift(p), type: TEXTE, opt: false });
    for (const f of this.ecran.filtres ?? []) v.set(f.nom, { code: nomSwift(f.nom), type: f.nombre ? NOMBRE : TEXTE, opt: true });
    for (const e of this.ecran.etat) v.set(e.nom, { code: nomSwift(e.nom), type: e.type, opt: e.facultatif ?? false });
    // Un calcul peut lire ceux écrits plus haut : leur type se précise dans l'ordre.
    for (const c of this.ecran.calculs) {
      const e = this.valeurs.expr(c.valeur, c.type.genre === 'inconnu' ? undefined : c.type);
      v.set(c.nom, { code: nomSwift(c.nom), type: plusPrecis(c.type, e.type), opt: c.facultatif ?? e.opt });
    }
  }

  private recenser(noeuds: NoeudVue[], boucles: Fonction['parametres'], formulaire?: string): void {
    for (const noeud of noeuds) {
      this.ligne = noeud.ligne;
      switch (noeud.type) {
        case 'element':
          if (noeud.genre === 'champ') this.recenserChamp(noeud, formulaire);
          if (formulaire !== undefined && (noeud.genre === 'champ' || noeud.genre === 'bouton')) this.formulaireDe.set(noeud.id, formulaire);
          break;
        case 'formulaire':
          this.formulaires.set(noeud.id, { nom: noeud.nom, champs: [], parametres: boucles.map((b) => nomSwift(b.nom)) });
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
          const liste = this.valeurs.listePresente(noeud.liste);
          const type = plusPrecis(noeud.typeVariable, this.valeurs.elementDe(liste.type));
          this.portee.variables.set(noeud.variable, { code: nomSwift(noeud.variable), type, opt: false });
          const dedans = [...boucles, { nom: noeud.variable, type, opt: false }];
          this.recenser(noeud.corps, dedans, formulaire);
          for (const g of noeud.gestionnaires) this.enregistrer(g, dedans);
          break;
        }
        case 'locale': {
          const e = this.valeurs.expr(noeud.valeur, noeud.typeValeur.genre === 'inconnu' ? undefined : noeud.typeValeur);
          this.portee.variables.set(noeud.nom, { code: nomSwift(noeud.nom), type: plusPrecis(noeud.typeValeur, e.type), opt: e.opt });
          break;
        }
        default:
          break;
      }
    }
  }

  private recenserChamp(noeud: Extract<NoeudVue, { type: 'element' }>, formulaire?: string): void {
    const libelle = noeud.contenu.type === 'texte' && noeud.contenu.parties.every((p) => 'texte' in p) ? noeud.contenu.parties.map((p) => ('texte' in p ? p.texte : '')).join('') : noeud.id;
    const variable = this.nomUnique(nomSwift(`champ_${simplifier(libelle) || noeud.id}`));
    const sorte = noeud.saisie?.sorte === 'nombre' || noeud.saisie?.sorte === 'case' ? noeud.saisie.sorte : undefined;
    this.portee.champs.set(noeud.id, { variable, ...(sorte ? { sorte } : {}) });
    this.champsEtat.push({ id: noeud.id, variable, ...(sorte ? { sorte } : {}) });
    this.clesChamps.set(noeud.id, cleJson(libelle));
    this.libelles.set(noeud.id, libelle);
    this.libellesLangues.set(noeud.id, libellesEnLangues(noeud.contenu));
    if (noeud.saisie) this.saisies.set(noeud.id, noeud.saisie);
    if (formulaire !== undefined) this.formulaires.get(formulaire)?.champs.push(noeud.id);
  }

  private fonction(nom: string, parametres: Fonction['parametres'], gestionnaire: Gestionnaire, formulaire?: string): Fonction {
    const f: Fonction = { nom: this.nomUnique(nom), parametres, gestionnaire, ...(formulaire ? { formulaire } : {}) };
    this.fonctions.push(f);
    return f;
  }

  private enregistrer(g: Gestionnaire, parametres: Fonction['parametres']): void {
    this.ligne = g.ligne;
    this.parcourirActions(g.actions);
    const cible = g.cibles[0] ?? '';
    const nomCible = majuscule(nomSwift(sansGenre(cible) || 'page'));
    switch (g.declencheur) {
      case 'chargement':
        this.chargements.push(g);
        return;
      case 'minuterie':
        this.minuteries.push(g);
        return;
      case 'bas':
        this.basDesBlocs.set(cible, this.fonction(`quandArriveEnBas${nomCible}`, parametres, g));
        return;
      case 'ordre':
        this.ordres.set(g.variable ?? '', this.fonction(`quandOrdreChange${majuscule(nomSwift(g.variable ?? 'liste'))}`, parametres, g));
        return;
      case 'touche':
        if (g.touches !== undefined) this.raccourcis.push({ touches: g.touches, fonction: this.fonction(`quandAppuie${majuscule(nomSwift(g.touches.replace(/\+/g, '_')))}`, parametres, g) });
        return;
      case 'saisie':
      case 'pauseSaisie':
        this.saisiesSuivies.push({ gestionnaire: g, fonction: this.fonction(`${g.declencheur === 'saisie' ? 'quandEcrit' : 'quandPause'}${nomCible}`, parametres, g) });
        return;
      case 'soumission': {
        const formulaire = this.formulaires.get(cible);
        if (formulaire) formulaire.fonction = this.fonction(`quandSoumis${majuscule(nomSwift(formulaire.nom))}`, parametres, g, cible);
        return;
      }
      case 'clic':
      case 'survol': {
        const f = this.fonction(`${g.declencheur === 'clic' ? 'quandClique' : 'quandSurvole'}${nomCible}`, parametres, g);
        const table = g.declencheur === 'clic' ? this.clics : this.survols;
        for (const id of g.cibles) table.set(id, [...(table.get(id) ?? []), f]);
        return;
      }
    }
  }

  private parcourirActions(actions: Gestionnaire['actions']): void {
    for (const a of actions) {
      if (a.type === 'visibilite') for (const id of a.ids) (a.visible ? this.montres : this.caches).add(id);
      if (a.type === 'changerTexte') for (const id of a.ids) this.textesChanges.add(id);
      if (a.type === 'connexion') {
        if (a.email.type === 'champ') this.champsEmail.add(a.email.id);
        if (a.motDePasse.type === 'champ') this.champsMotDePasse.add(a.motDePasse.id);
      }
      if (a.type === 'si') {
        this.parcourirActions(a.alors);
        this.parcourirActions(a.sinon);
      } else if (a.type === 'repetition' || a.type === 'tantQue' || a.type === 'repeter' || a.type === 'minuterie' || a.type === 'optimiste') this.parcourirActions(a.corps);
      else if (a.type === 'essayer') {
        this.parcourirActions(a.corps);
        this.parcourirActions(a.siErreur);
      } else if (a.type === 'selon') {
        a.cas.forEach((c) => this.parcourirActions(c.corps));
        this.parcourirActions(a.sinon);
      } else if (a.type === 'confirmation') {
        this.parcourirActions(a.alors);
        this.parcourirActions(a.sinon);
      } else if (a.type === 'message' && a.action) this.parcourirActions(a.action.actions);
    }
  }

  // ─── La page ─────────────────────────────────────────────────────────────

  generer(): string {
    this.ligne = this.ecran.ligne;
    this.declarerVariables();
    this.recenser(this.ecran.vue, []);
    const variablesDeLaPage = new Map(this.portee.variables);
    for (const g of this.ecran.gestionnaires) this.enregistrer(g, []);
    for (const f of this.fonctions) this.ecrireFonction(f, variablesDeLaPage);

    const chargements = this.corpsDesChargements(variablesDeLaPage);
    const minuteries = this.corpsDesMinuteries(variablesDeLaPage);

    const vue = new Ecrivain();
    this.restaurer(variablesDeLaPage);
    vue.indenter(() => vue.indenter(() => vue.indenter(() => this.ecrireVue(vue, this.ecran.vue))));
    const corps = vue.texte();

    const tout = corps + this.fonctions.map((f) => f.code ?? '').join('') + chargements.join('') + minuteries.map((m) => m.corps).join('');
    const e = new Ecrivain();
    e.ligne('// Produit par Humalis.');
    e.ligne('import SwiftUI');
    if (/\bMarker\(/.test(tout)) e.ligne('import MapKit');
    e.ligne();
    e.bloc(`struct ${this.nomStruct}: View {`, () => {
      this.ecrireProprietes(e, tout);
      e.ligne();
      this.ecrireBody(e, corps, chargements, minuteries);
      for (const f of this.fonctions) e.ligne(`\n${f.code}`.trimEnd());
      chargements.forEach((c) => {
        e.ligne();
        for (const l of c.trimEnd().split('\n')) e.ligne(l);
      });
    });
    return e.texte();
  }

  private restaurer(variables: Map<string, Lecture>): void {
    this.portee.variables.clear();
    for (const [n, l] of variables) this.portee.variables.set(n, l);
  }

  /** Une fonction d'événement : `async` seulement si elle attend quelque chose. */
  private ecrireFonction(f: Fonction, variables: Map<string, Lecture>): void {
    this.restaurer(variables);
    for (const p of f.parametres) this.portee.variables.set(p.nom, { code: nomSwift(p.nom), type: p.type, opt: p.opt });
    this.ligne = f.gestionnaire.ligne;
    const corps = new Ecrivain();
    corps.indenter(() => {
      if (f.formulaire !== undefined) this.ecrireVerifications(corps, f.formulaire);
      this.actions.ecrire(corps, f.gestionnaire.actions, { formulaire: f.formulaire !== undefined });
      if (f.formulaire !== undefined) {
        for (const id of this.formulaires.get(f.formulaire)?.champs ?? []) {
          const champ = this.portee.champs.get(id);
          if (champ) corps.ligne(`${champ.variable} = ${champ.sorte === 'case' ? 'false' : '""'}`);
        }
      }
    });
    const texte = corps.texte();
    f.asynchrone = /\bawait\b/.test(texte);
    const parametres = f.parametres.map((p) => `_ ${nomSwift(p.nom)}: ${this.app.types.swift(p.type, p.opt)}`).join(', ');
    const indente = texte.replace(/^(?=.)/gm, '  ');
    f.code = `  private func ${f.nom}(${parametres})${f.asynchrone ? ' async' : ''} {\n${indente}  }\n`;
  }

  private ecrireVerifications(e: Ecrivain, formulaire: string): void {
    for (const id of this.formulaires.get(formulaire)?.champs ?? []) {
      const champ = this.portee.champs.get(id);
      if (!champ) continue;
      const saisie = this.saisies.get(id);
      const libelle = this.libelles.get(id) ?? id;
      const libelles = (this.app.langues ?? [{ code: 'fr' }]).map(({ code }) => ({ code, libelle: this.libellesLangues.get(id)?.get(code) ?? libelle }));
      const messages = verificationsDuChamp(champ.variable, saisie, libelles).map(([, message]) => message);
      const tests = testsDuChamp(champ.variable, saisie);
      messages.forEach((message, i) => {
        const texte = message.length === 1 ? chaineSwift(message[0].texte) : `t([${message.map((m) => `${chaineSwift(m.code)}: ${chaineSwift(m.texte)}`).join(', ')}])`;
        e.bloc(`if ${tests[i]} {`, () => {
          e.ligne(`Messages.commun.afficher(${texte}, .erreur)`);
          e.ligne('return');
        });
      });
    }
  }

  private corpsDesChargements(variables: Map<string, Lecture>): string[] {
    return this.chargements.map((g, i) => {
      this.restaurer(variables);
      this.ligne = g.ligne;
      const corps = new Ecrivain();
      corps.indenter(() => this.actions.ecrire(corps, g.actions));
      const texte = corps.texte();
      // Une page qui lit la session attend de savoir qui est connecté.
      const session = /\bSession\.commun\.(connecte|admin|aRole)\b/.test(texte) ? '  await Session.commun.attendre()\n' : '';
      const nom = `auChargement${this.chargements.length > 1 ? i + 1 : ''}`;
      return `private func ${nom}() async {\n${session}${texte}}\n`;
    });
  }

  private corpsDesMinuteries(variables: Map<string, Lecture>): { nom: string; corps: string; id?: string; garde?: string; ms: string; repete: boolean }[] {
    return this.minuteries.flatMap((g, i) =>
      g.actions.flatMap((a) => {
        if (a.type !== 'minuterie') return [];
        this.restaurer(variables);
        this.ligne = g.ligne;
        const corps = new Ecrivain();
        this.actions.ecrireMinuterie(corps, a.corps);
        const garde = a.tantQue ? this.valeurs.condition(a.tantQue) : undefined;
        return [{ nom: `minuterie${i + 1}`, corps: corps.texte(), ...(garde ? { garde, id: garde } : {}), ms: this.valeurs.nombre(a.millisecondes), repete: a.mode === 'toutes' }];
      }),
    );
  }

  private ecrireProprietes(e: Ecrivain, tout: string): void {
    const types = this.app.types;
    e.indenter(() => {});
    for (const p of this.parametres ?? []) e.ligne(`let ${nomSwift(p.nom)}: ${types.swift(p.type)}`);
    for (const p of this.ecran.parametresAdresse ?? []) e.ligne(`let ${nomSwift(p)}: String`);
    if (/\bsousPage\b/.test(tout)) e.ligne('var sousPage: AnyView? = nil');
    for (const f of this.ecran.filtres ?? []) e.ligne(`@State var ${nomSwift(f.nom)}: ${f.nombre ? 'Double?' : 'String?'}`);
    for (const etat of this.ecran.etat) this.ecrireEtat(e, etat);
    for (const champ of this.champsEtat) e.ligne(`@State private var ${champ.variable} = ${champ.sorte === 'case' ? 'false' : '""'}`);
    const visibles = [...new Set([...this.montres, ...this.caches, ...this.fenetres])];
    if (visibles.length > 0) {
      const initiales = visibles.map((id) => `${chaineSwift(id)}: ${!this.montres.has(id) && !this.fenetres.has(id)}`).join(', ');
      e.ligne(`@State private var visibilite: [String: Bool] = [${initiales}]`);
    }
    if (this.textesChanges.size > 0) e.ligne('@State private var textes: [String: String] = [:]');
    for (const nom of this.etatsRequetes) e.ligne(`@State private var ${this.nomEtatRequete(nom)} = EtatRequete()`);
    if (/\brelances\[/.test(tout)) e.ligne('@State private var relances: [String: @MainActor () async -> Void] = [:]');
    if (/\bjetons\./.test(tout)) e.ligne('@State private var jetons = JetonsRequetes()');
    if (this.tablesTriees.length > 0) {
      e.ligne('#if os(macOS)');
      for (const t of this.tablesTriees) e.ligne(`@State private var ${t.nom}: [KeyPathComparator<LigneTableHumalis<${t.type}>>] = []`);
      e.ligne('#endif');
    }
    if (/\bplanificateur\./.test(tout)) e.ligne('@State private var planificateur = Planificateur()');
    if (/\bdirects\./.test(tout)) e.ligne('@State private var directs = ConnexionsDirect()');
    if (this.portee.besoins.has('mouvementReduit')) e.ligne('@Environment(\\.accessibilityReduceMotion) private var mouvementReduit');
    if (this.portee.besoins.has('themeSombre')) e.ligne('@Environment(\\.colorScheme) private var apparence');
    if (/\bmenuLateral\b/.test(tout)) e.ligne('@Environment(\\.menuLateral) private var menuLateral');
    for (const c of this.ecran.calculs) {
      const lecture = this.calculs(c.nom);
      if (!lecture) continue;
      const v = this.valeurs.expr(c.valeur, lecture.type.genre === 'inconnu' ? undefined : lecture.type);
      e.ligne(`private var ${lecture.code}: ${types.swift(lecture.type, lecture.opt)} { ${lecture.opt ? this.valeurs.versOpt(v, lecture.type) : this.valeurs.vers(v, lecture.type)} }`);
    }
  }

  private calculs(nom: string): Lecture | undefined {
    return this.portee.variables.get(nom);
  }

  private ecrireEtat(e: Ecrivain, etat: Etat): void {
    const types = this.app.types;
    const opt = etat.facultatif ?? false;
    const type = types.swift(etat.type, opt);
    const v = this.valeurs.expr(etat.initiale, etat.type);
    const initiale = opt ? this.valeurs.versOpt(v, etat.type) : this.valeurs.vers(v, etat.type);
    const nom = nomSwift(etat.nom);
    if (etat.memorisee || etat.horsLigne) {
      const cle = `${this.app.cle}:${simplifier(this.ecran.nom)}:${simplifier(etat.nom)}`;
      e.ligne(`@Memorisee(${chaineSwift(cle)}${etat.secret ? ', secret: true' : ''}${etat.horsLigne ? ', fichier: true' : ''}) private var ${nom}: ${type} = ${initiale}`);
    } else e.ligne(`@State private var ${nom}: ${type} = ${initiale}`);
  }

  /** L'appel d'une fonction d'événement, avec ses variables de boucle. */
  private appel(f: Fonction): string {
    const args = f.parametres.map((p) => nomSwift(p.nom)).join(', ');
    return f.asynchrone ? `Task { await ${f.nom}(${args}) }` : `${f.nom}(${args})`;
  }

  private ecrireBody(e: Ecrivain, corps: string, chargements: string[], minuteries: ReturnType<GenerateurPage['corpsDesMinuteries']>): void {
    const { titre } = titreEtDescription(this.ecran, this.app.langues);
    const titreCode = this.titreCode(titre);
    e.bloc('var body: some View {', () => {
      // Une ancre doit exister pour qu'on y aille : une page qui en a construit tout son contenu.
      const paresseuse = this.ecran.vue.some((n) => n.type === 'repetition') && !JSON.stringify(this.ecran.vue).includes('"ancre"');
      const racine = this.ecran.vue.some((n) => n.type === 'formulaire' && n.reglages) ? ', racine: .reglages' : this.ecran.vue.some((n) => n.type === 'repetition' && n.corps.some((c) => c.type === 'bloc' && c.natif?.genre === 'glisser')) ? ', racine: .liste' : '';
      e.ligne(this.parametres || this.nomForce ? 'Group {' : `PageHumalis(titre: ${titreCode}${paresseuse ? ', paresseuse: true' : ''}${racine}) {`);
      for (const l of corps.trimEnd().split('\n')) if (l !== '') e.ligne(l.slice(2));
      e.ligne('}');
      e.indenter(() => {
        for (const n of this.ecran.vue) if (n.type === 'bloc' && n.natif) this.modificateurNatif(e, n);
        chargements.forEach((_, i) => {
          const nom = `auChargement${chargements.length > 1 ? i + 1 : ''}`;
          const parametres = (this.ecran.parametresAdresse ?? []).map(nomSwift);
          if (this.ecran.nom === this.app.pageEntree && !this.parametres && !this.nomForce) {
            // Sur Mac, la page d'entrée reste sous les autres : son chargement ne repart pas seul au retour.
            e.ligne(`.task(id: Routeur.commun.chemin.isEmpty) { if Routeur.commun.chemin.isEmpty { await ${nom}() } }`);
            return;
          }
          e.ligne(`.task${parametres.length ? `(id: ${parametres.length === 1 ? parametres[0] : `[${parametres.join(', ')}]`})` : ''} { await ${nom}() }`);
        });
        for (const m of minuteries) {
          e.bloc(`.task${m.id ? `(id: ${m.id})` : ''} {`, () => {
            if (m.garde) e.ligne(`guard ${m.garde} else { return }`);
            e.bloc(`await minuterie(${m.ms}, repete: ${m.repete}) { arreter in`, () => {
              e.ligne('_ = arreter');
              for (const l of m.corps.trimEnd().split('\n')) if (l !== '') e.ligne(l);
            });
          });
        }
        for (const { gestionnaire, fonction } of this.saisiesSuivies) {
          const champ = this.portee.champs.get(gestionnaire.cibles[0] ?? '');
          if (!champ) continue;
          if (gestionnaire.declencheur === 'saisie') e.ligne(`.onChange(of: ${champ.variable}) { ${this.appel(fonction)} }`);
          else e.ligne(`.task(id: ${champ.variable}) { try? await Task.sleep(for: .milliseconds(${gestionnaire.millisecondes ?? 300})); if !Task.isCancelled { ${fonction.asynchrone ? 'await ' : ''}${fonction.nom}() } }`);
        }
        for (const { touches: t, fonction } of this.raccourcis) e.ligne(`.background { Button("") { ${this.appel(fonction)} }${touches(t)}.opacity(0).accessibilityHidden(true) }`);
        const code = this.fonctions.map((f) => f.code).join('') + chargements.join('');
        const fermer = [...(/planificateur\./.test(code) ? ['planificateur.annuler()'] : []), ...(/\bdirects\./.test(code) ? ['directs.annuler()'] : [])];
        if (fermer.length > 0) e.ligne(`.onDisappear { ${fermer.join('; ')} }`);
      });
    });
  }

  /** Ce qu'un composant natif pose sur la page entière : barre d'outils, recherche, actualisation. */
  private modificateurNatif(e: Ecrivain, n: Extract<NoeudVue, { type: 'bloc' }>): void {
    const natif = n.natif!;
    if (natif.genre === 'outils') {
      e.bloc('.toolbar {', () => e.bloc('ToolbarItemGroup(placement: .primaryAction) {', () => this.ecrireCorps(e, n.corps)));
    } else if (natif.genre === 'recherche') {
      const lue = this.portee.variables.get(natif.variable!);
      if (!lue) return this.refuser(n.ligne, `« recherche dans ${natif.variable} » : cette variable est inconnue ici`);
      const lien = lue.code.includes('.') ? `Binding(get: { ${lue.code} }, set: { ${lue.code} = $0 })` : `$${lue.code}`;
      e.ligne(`.searchable(text: ${lien}, prompt: ${chaineSwift(natif.indice ?? 'Rechercher')})`);
    } else if (natif.genre === 'actualiser') {
      const bouton = n.corps.find((c) => c.type === 'element');
      const f = bouton && bouton.type === 'element' ? this.clics.get(bouton.id)?.[0] : undefined;
      if (!f) return;
      const args = f.parametres.map((p) => nomSwift(p.nom)).join(', ');
      e.ligne('#if os(iOS)');
      e.ligne(`.refreshable { ${f.asynchrone ? 'await ' : ''}${f.nom}(${args}) }`);
      e.ligne('#else');
      e.bloc('.toolbar {', () => e.bloc('ToolbarItem(placement: .primaryAction) {', () => this.ecrireCorps(e, n.corps)));
      e.ligne('#endif');
    }
  }

  /** Vrai si le composant natif s'est écrit ; sinon, le bloc s'écrit comme son équivalent. */
  private ecrireNatif(e: Ecrivain, n: Extract<NoeudVue, { type: 'bloc' }>): boolean {
    const natif = n.natif!;
    const enTete = this.ecran.vue.includes(n);
    switch (natif.genre) {
      case 'vide': {
        const titre = n.corps[0];
        const description = n.corps[1];
        const texte = (v: NoeudVue | undefined) => (v && v.type === 'element' ? this.valeurs.enTexte(v.contenu) : '""');
        e.ligne(`ContentUnavailableView { Label(${texte(titre)}, systemImage: ${chaineSwift(natif.icone ? nomIcone(natif.icone) : 'tray')}) }${description ? ` description: { Text(verbatim: ${texte(description)}) }` : ''}`);
        return true;
      }
      case 'outils':
      case 'recherche':
      case 'actualiser':
        return enTete;
      case 'options':
      case 'glisser':
        return true;
      case 'groupe': {
        if (!this.dansReglages) return false;
        const titre = n.corps[0];
        e.bloc(`Section(${titre && titre.type === 'element' ? this.valeurs.enTexte(titre.contenu) : '""'}) {`, () => this.ecrireCorps(e, n.corps.slice(1)));
        return true;
      }
      case 'table': {
        const rangee = n.corps[0];
        const ligne = rangee?.type === 'repetition' ? rangee.corps[0] : undefined;
        if (rangee?.type !== 'repetition' || ligne?.type !== 'bloc') return false;
        const liste = this.valeurs.listePresente(rangee.liste);
        const nom = nomSwift(rangee.variable);
        const avant = new Map(this.portee.variables);
        this.portee.variables.set(rangee.variable, { code: nom, type: plusPrecis(rangee.typeVariable, this.valeurs.elementDe(liste.type)), opt: false });
        const typeLigne = this.app.types.swift(this.portee.variables.get(rangee.variable)!.type);
        const tri = `triTable${this.tablesTriees.length + 1}`;
        this.tablesTriees.push({ nom: tri, type: typeLigne });
        // Chaque colonne a sa clé de tri : un nombre se trie comme un nombre, le reste comme un texte.
        const cles = ligne.corps.map((cellule) => {
          if (cellule.type !== 'element') return '.texte("")';
          const lue = this.valeurs.expr(cellule.contenu);
          return lue.type.genre === 'nombre' ? `.nombre(${lue.opt ? `${lue.code} ?? 0` : lue.code})` : `.texte(${this.valeurs.enTexte(cellule.contenu)})`;
        });
        e.ligne('#if os(macOS)');
        // Les types écrits en entier : sans eux, le compilateur Swift abandonne à partir de quatre colonnes.
        const ligneTable = `LigneTableHumalis<${typeLigne}>`;
        e.ligne(`let lignes${tri}: [${ligneTable}] = ${liste.code}.enumerated().map { (rangTable: Int, ${nom}: ${typeLigne}) -> ${ligneTable} in ${ligneTable}(id: rangTable, valeur: ${nom}, cles: [${cles.join(', ')}]) }.sorted(using: ${tri})`);
        e.bloc(`Table(lignes${tri}, sortOrder: $${tri}) {`, () => {
          (natif.colonnes ?? []).forEach((titre, i) => {
            e.bloc(`TableColumn(${chaineSwift(titre)}, value: \\${ligneTable}.cles[${i}]) { rangee in`, () => {
              e.ligne(`let ${nom} = rangee.valeur`);
              this.ecrireNoeud(e, ligne.corps[i]);
            });
          });
        });
        e.indenter(() => e.ligne('.frame(minHeight: 320)'));
        e.ligne('#else');
        this.restaurer(avant);
        this.ecrireCorps(e, n.corps);
        e.ligne('#endif');
        return true;
      }
      default:
        return false;
    }
  }

  private titreCode(titre: string): string {
    const premier = (noeuds: NoeudVue[]): Valeur | undefined => {
      for (const n of noeuds) {
        if (n.type === 'element' && n.genre === 'titre') return n.contenu;
        if (n.type === 'bloc') {
          const v = premier(n.corps);
          if (v) return v;
        }
      }
      return undefined;
    };
    const valeur = premier(this.ecran.vue);
    return valeur?.type === 'texte' && valeur.versions ? this.valeurs.texte(valeur) : chaineSwift(titre);
  }

  // ─── La vue ──────────────────────────────────────────────────────────────

  private ecrireVue(e: Ecrivain, noeuds: NoeudVue[]): void {
    noeuds.forEach((noeud, i) => {
      const suivant = noeuds[i + 1];
      // « menu d'options » : il se pose sur l'élément juste au-dessus.
      if (suivant?.type === 'bloc' && suivant.natif?.genre === 'options') {
        e.bloc('Group {', () => this.ecrireNoeud(e, noeud));
        e.indenter(() => e.bloc('.contextMenu {', () => this.boutonsSysteme(e, suivant.corps)));
      } else this.ecrireNoeud(e, noeud);
    });
  }

  /** Glisser et menus n'acceptent que des boutons simples : un titre et une icône, sans mise en forme. */
  private boutonsSysteme(e: Ecrivain, noeuds: NoeudVue[]): void {
    for (const n of noeuds) {
      if (n.type !== 'element' || n.genre !== 'bouton') continue;
      const faire = (this.clics.get(n.id) ?? []).map((f) => this.appel(f)).join('; ');
      const titre = this.valeurs.enTexte(n.contenu);
      e.ligne(n.reglages?.icone ? `Button(${titre}, systemImage: ${chaineSwift(nomIcone(n.reglages.icone))}) { ${faire} }` : `Button(${titre}) { ${faire} }`);
    }
  }

  /** Le corps d'une ligne de boucle, avec ses actions en glissant. */
  private ecrireLigneDeBoucle(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'repetition' }>): void {
    const actions = noeud.corps.flatMap((n) => (n.type === 'bloc' && n.natif?.genre === 'glisser' ? n.corps : []));
    if (actions.length === 0) return this.ecrireCorps(e, noeud.corps);
    if (!this.ecran.vue.includes(noeud)) this.app.avertir(noeud.ligne, "« action en glissant » : la boucle n'est pas directement dans la page, l'action est proposée au toucher prolongé.");
    e.bloc('Group {', () => this.ecrireCorps(e, noeud.corps));
    e.indenter(() => {
      e.bloc('.contextMenu {', () => this.boutonsSysteme(e, actions));
      e.ligne('#if os(iOS)');
      e.bloc('.swipeActions(edge: .trailing) {', () => this.boutonsSysteme(e, actions));
      e.ligne('#endif');
    });
  }

  /** Les enfants d'un bloc ; rien à montrer : une vue vide (un `if` vide ne se compile pas toujours). */
  private ecrireCorps(e: Ecrivain, noeuds: NoeudVue[]): void {
    const avant = new Map(this.portee.variables);
    if (noeuds.length === 0) e.ligne('EmptyView()');
    else this.ecrireVue(e, noeuds);
    this.restaurer(avant);
  }

  /** Enveloppe un nœud dans « montré ou caché », si un événement le demande. */
  private visible(e: Ecrivain, id: string, ecrire: () => void): void {
    if (this.montres.has(id) || this.caches.has(id)) e.bloc(`if visibilite[${chaineSwift(id)}] == true {`, ecrire);
    else ecrire();
  }

  private ecrireNoeud(e: Ecrivain, noeud: NoeudVue): void {
    this.ligne = noeud.ligne;
    switch (noeud.type) {
      case 'element':
        return this.visible(e, noeud.id, () => this.ecrireElement(e, noeud));
      case 'widget':
        return this.visible(e, noeud.id, () => this.ecrireWidget(e, noeud));
      case 'formulaire':
        return this.visible(e, noeud.id, () => {
          if (noeud.reglages) {
            const avant = this.dansReglages;
            this.dansReglages = true;
            this.ecrireCorps(e, noeud.corps);
            this.dansReglages = avant;
            return;
          }
          e.bloc('VStack(alignment: .leading, spacing: 12) {', () => this.ecrireCorps(e, noeud.corps));
          e.indenter(() => e.ligne(`.identifiantHumalis(${chaineSwift(noeud.id)})`));
        });
      case 'bloc':
        return this.ecrireBloc(e, noeud);
      case 'condition':
        return this.ecrireCondition(e, noeud);
      case 'repetition':
        return this.ecrireRepetition(e, noeud);
      case 'locale': {
        const v = this.valeurs.expr(noeud.valeur, noeud.typeValeur.genre === 'inconnu' ? undefined : noeud.typeValeur);
        const type = plusPrecis(noeud.typeValeur, v.type);
        const code = v.opt ? this.valeurs.versOpt(v, type) : this.valeurs.vers(v, type);
        e.ligne(`let ${nomSwift(noeud.nom)}: ${this.app.types.swift(type, v.opt)} = ${code}`);
        this.portee.variables.set(noeud.nom, { code: nomSwift(noeud.nom), type, opt: v.opt });
        return;
      }
      case 'composant':
        return this.ecrireComposant(e, noeud);
      case 'sousPage':
        e.bloc('if let sousPage {', () => e.ligne('sousPage'));
        return;
      case 'fenetre':
        return this.ecrireFenetre(e, noeud);
      case 'graphique':
        return this.ecrireGraphique(e, noeud);
      case 'carte':
        return this.ecrireCarte(e, noeud);
      case 'marqueur':
        return;
      case 'codeDocumentation':
        e.ligne(`CodeHumalis(code: ${chaineSwift(noeud.code)})`);
        return;
      case 'tableauDocumentation': {
        const ligne = (l: Valeur[]) => `[${l.map((c) => this.valeurs.enTexte(c)).join(', ')}]`;
        e.ligne(`TableauHumalis(legende: ${this.valeurs.enTexte(noeud.legende)}, colonnes: ${ligne(noeud.colonnes)}, rangees: [${noeud.rangees.map(ligne).join(', ')}])`);
        return;
      }
    }
  }

  private ecrireCondition(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'condition' }>): void {
    const test = this.valeurs.condition(noeud.test);
    // Une condition sur la session attend la réponse du serveur : sinon la page montrerait un instant la version « visiteur ».
    const attente = /\bSession\.commun\.(connecte|admin|aRole)\b/.test(test);
    e.ligne(`if ${attente ? 'Session.commun.pret && ' : ''}${attente ? `(${test})` : test} {`);
    e.indenter(() => this.ecrireCorps(e, noeud.alors));
    if (noeud.sinon.length > 0) {
      if (attente) {
        e.ligne(`} else if Session.commun.pret {`);
      } else e.ligne('} else {');
      e.indenter(() => this.ecrireCorps(e, noeud.sinon));
    }
    e.ligne('}');
  }

  private ecrireRepetition(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'repetition' }>): void {
    const liste = this.valeurs.listePresente(noeud.liste);
    const nom = nomSwift(noeud.variable);
    const type = plusPrecis(noeud.typeVariable, this.valeurs.elementDe(liste.type));
    const avant = new Map(this.portee.variables);
    this.portee.variables.set(noeud.variable, { code: nom, type, opt: false });
    const index = `index${majuscule(nom)}`;
    if (noeud.deplacement && noeud.liste.type === 'variable') {
      const lue = this.portee.variables.get(noeud.liste.nom);
      const ordre = this.ordres.get(noeud.liste.nom);
      e.bloc(`ForEach(Array(${liste.code}.enumerated()), id: \\.offset) { ${index}, ${nom} in`, () => {
        e.bloc(`LigneDeplacableHumalis(index: ${index}, total: ${liste.code}.count) { depart, arrivee in`, () => {
          e.ligne(`${lue!.code}.swapAt(depart, arrivee)`);
          if (ordre) e.ligne(this.appel(ordre));
        }, '} contenu: {');
        e.indenter(() => this.ecrireCorps(e, noeud.corps));
        e.ligne('}');
      });
    } else {
      // Une donnée du serveur a son identifiant : une ligne garde son état quand la liste change.
      const identite = type.genre === 'donnee' && this.app.types.champ(type, 'id') ? '\\.element.id' : '\\.offset';
      e.bloc(`ForEach(Array(${liste.code}.enumerated()), id: ${identite}) { ${index}, ${nom} in`, () => {
        e.ligne(`let _ = ${index}`);
        this.ecrireLigneDeBoucle(e, noeud);
      });
    }
    if (noeud.animation) {
      this.portee.besoins.add('mouvementReduit');
      e.indenter(() => e.ligne(`.animation(mouvementReduit ? nil : .default, value: ${liste.code})`));
    }
    this.restaurer(avant);
  }

  private ecrireComposant(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'composant' }>): void {
    if (this.app.natifs.has(noeud.nom)) {
      const args = noeud.proprietes.map((p) => `${nomSwift(p.nom)}: ${this.valeurs.expr(p.valeur).code}`).join(', ');
      e.ligne(`${noeud.nom}(${args})`);
      return;
    }
    const parametres = this.app.composants.get(noeud.nom);
    // Un composant React sans vue Swift : déjà refusé par la vérification du programme.
    if (!parametres) return;
    // Les arguments dans l'ordre de la déclaration : c'est l'ordre des paramètres en Swift.
    const args = parametres.flatMap((p) => {
      const donne = noeud.proprietes.find((x) => cleJson(x.nom) === cleJson(p.nom));
      return [`${nomSwift(p.nom)}: ${donne ? this.valeurs.vers(this.valeurs.expr(donne.valeur, p.type), p.type) : this.app.types.defaut(p.type)}`];
    });
    e.ligne(`${nomComposant(noeud.nom)}(${args.join(', ')})`);
  }

  private ecrireFenetre(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'fenetre' }>): void {
    const lien = `Binding(get: { visibilite[${chaineSwift(noeud.id)}] == true }, set: { visibilite[${chaineSwift(noeud.id)}] = $0 })`;
    e.ligne(`FenetreHumalis(ouverte: ${lien}, titre: ${chaineSwift(noeud.titre)}${noeud.description !== undefined ? `, description: ${chaineSwift(noeud.description)}` : ''}${noeud.obligatoire ? ', obligatoire: true' : ''}) {`);
    e.indenter(() => this.ecrireCorps(e, noeud.corps));
    e.ligne('}');
  }

  private modifieurs(e: Ecrivain, noeudOptions: Option[], sorte: Parameters<typeof modificateurs>[1], extra: string[] = []): void {
    const classes = noeudOptions.find((o) => o.nom === 'css')?.valeur.split(' ').filter(Boolean) ?? [];
    const lignes = [...modificateurs(noeudOptions, sorte, { dansLigne: this.dansLigne }), ...this.app.css.modificateurs(classes, sorte), ...extra];
    e.indenter(() => lignes.forEach((l) => e.ligne(l)));
  }

  private ecrireBloc(e: Ecrivain, noeudLu: Extract<NoeudVue, { type: 'bloc' }>): void {
    if (noeudLu.natif && this.ecrireNatif(e, noeudLu)) return;
    // « sur ios : », « sur macos : » : le projet Xcode est commun aux deux.
    if (noeudLu.plateforme === 'ios' || noeudLu.plateforme === 'macos') {
      e.ligne(`#if os(${noeudLu.plateforme === 'ios' ? 'iOS' : 'macOS'})`);
      this.ecrireCorps(e, noeudLu.corps);
      e.ligne('#endif');
      return;
    }
    const noeud = { ...noeudLu, options: [...noeudLu.options, { nom: 'css', valeur: noeudLu.classes.join(' ') }] };
    const options = noeud.options;
    const valeurDe = (nom: string) => options.find((o) => o.nom === nom)?.valeur;
    const espace = valeurDe('espacement') !== undefined ? (ESPACES[valeurDe('espacement')!] ?? 12) : this.app.css.ecart(noeud.classes);
    const avecAncre = noeud.ancre !== undefined ? [`.id(${chaineSwift(noeud.ancre)})`] : [];
    const dansLigneAvant = this.dansLigne;
    switch (noeud.genre) {
      case 'section':
      case 'bloc':
      case 'contenu':
      case 'entete':
      case 'pied':
      case 'colonne': {
        const alignement = { debut: '.leading', centree: '.center', fin: '.trailing', etire: '.leading' }[valeurDe('alignement') ?? 'debut'] ?? '.leading';
        this.dansLigne = false;
        // Une liste longue dans un bloc : seules les lignes visibles sont construites.
        const pile = noeud.corps.some((n) => n.type === 'repetition') && noeud.ancre === undefined ? 'LazyVStack' : 'VStack';
        e.bloc(`${pile}(alignment: ${alignement}, spacing: ${espace ?? 12}) {`, () => this.ecrireCorps(e, noeud.corps));
        this.dansLigne = dansLigneAvant;
        this.modifieurs(e, options, 'bloc', avecAncre);
        break;
      }
      case 'ligne':
      case 'menu': {
        const vertical = noeud.genre === 'menu' && valeurDe('menu') === 'vertical';
        if (noeud.genre === 'menu' && this.menuAReplier) {
          this.menuAReplier = false;
          e.bloc('if !menuLateral {', () => this.ecrireBloc(e, noeud));
          break;
        }
        if (vertical) {
          e.bloc(`VStack(alignment: .leading, spacing: ${espace ?? 12}) {`, () => this.ecrireCorps(e, noeud.corps));
        } else {
          const alignement = { debut: '.top', centree: '.center', fin: '.bottom' }[valeurDe('alignement') ?? 'centree'] ?? '.center';
          const repartition = valeurDe('repartition') ?? 'debut';
          this.dansLigne = true;
          e.bloc(`LigneHumalis(espacement: ${espace ?? 12}, alignement: ${alignement}, repartition: .${repartition}) {`, () => this.ecrireCorps(e, noeud.corps));
          this.dansLigne = dansLigneAvant;
        }
        this.modifieurs(e, options, 'bloc', avecAncre);
        break;
      }
      case 'grille':
        this.dansLigne = false;
        e.bloc(`GrilleHumalis(colonnes: ${Number(valeurDe('colonnes') ?? 3)}, espacement: ${espace ?? 16}) {`, () => this.ecrireCorps(e, noeud.corps));
        this.dansLigne = dansLigneAvant;
        this.modifieurs(e, options, 'bloc', avecAncre);
        break;
      case 'appareil':
        e.bloc(`SurAppareilHumalis([${options.filter((o) => o.nom === 'sur').map((o) => `.${o.valeur}`).join(', ')}]) {`, () => this.ecrireCorps(e, noeud.corps));
        break;
      case 'liste':
      case 'listeNumerotee':
        this.ecrireListe(e, noeud);
        break;
      case 'onglets': {
        const onglets = noeud.corps.filter((n): n is Extract<NoeudVue, { type: 'bloc' }> => n.type === 'bloc');
        const variable = noeud.etat ? this.portee.variables.get(noeud.etat)!.code : '';
        const titres = onglets.map((o) => (o.titre ? this.valeurs.enTexte(o.titre) : '""'));
        e.bloc(`OngletsHumalis(choisi: Binding(get: { Int(${variable}) }, set: { ${variable} = Double($0) }), titres: [${titres.join(', ')}]) {`, () => {
          onglets.forEach((o, i) => e.bloc(`if Int(${variable}) == ${i} {`, () => this.ecrireCorps(e, o.corps)));
        });
        break;
      }
      case 'deroulant': {
        const lue = noeud.etat ? this.portee.variables.get(noeud.etat)!.code : '';
        const groupe = noeud.index !== undefined;
        const ouvert = groupe ? `Binding(get: { ${lue} == ${noeud.index} }, set: { ${lue} = $0 ? ${noeud.index} : -1 })` : `$${lue}`;
        e.bloc(`DeroulantHumalis(titre: ${noeud.titre ? this.valeurs.enTexte(noeud.titre) : '""'}, ouvert: ${ouvert}) {`, () => this.ecrireCorps(e, noeud.corps));
        break;
      }
      case 'accordeon':
        e.bloc('VStack(alignment: .leading, spacing: 0) {', () => this.ecrireCorps(e, noeud.corps));
        break;
      case 'carrousel':
        e.bloc('CarrouselHumalis {', () => this.ecrireCorps(e, noeud.corps));
        break;
      case 'filAriane':
        e.bloc('LigneHumalis(espacement: 8, alignement: .center) {', () => {
          noeud.corps.forEach((enfant, i) => {
            if (i > 0) e.ligne('Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary).accessibilityHidden(true)');
            this.ecrireVue(e, [enfant]);
          });
        });
        break;
      case 'onglet':
      case 'carte':
        this.refuser(noeud.ligne, `le bloc « ${noeud.genre} » à cet endroit ne se traduit pas en SwiftUI`);
        break;
    }
    // « arrive en bas de » ce bloc : le bouton « Voir plus », et la suite qui se charge seule en bas de la page.
    if (noeud.id !== undefined && this.basDesBlocs.has(noeud.id)) {
      const f = this.basDesBlocs.get(noeud.id)!;
      const tantQue = f.gestionnaire.tantQue ? this.valeurs.condition(f.gestionnaire.tantQue) : undefined;
      const bouton = f.gestionnaire.bouton;
      const ecrire = () => e.ligne(`VoirPlusHumalis(libelle: ${bouton === undefined || bouton === null ? 'nil' : chaineSwift(bouton)}) { ${f.asynchrone ? 'await ' : ''}${f.nom}() }`);
      if (tantQue) e.bloc(`if ${tantQue} {`, ecrire);
      else ecrire();
    }
  }

  private ecrireListe(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'bloc' }>): void {
    const puce = (i: string) => (noeud.genre === 'liste' ? '"•"' : `"\\(${i} + 1)."`);
    e.bloc('VStack(alignment: .leading, spacing: 6) {', () => {
      noeud.corps.forEach((enfant, i) => {
        if (enfant.type === 'repetition') {
          const liste = this.valeurs.listePresente(enfant.liste);
          const nom = nomSwift(enfant.variable);
          const type = plusPrecis(enfant.typeVariable, this.valeurs.elementDe(liste.type));
          const avant = new Map(this.portee.variables);
          this.portee.variables.set(enfant.variable, { code: nom, type, opt: false });
          e.bloc(`ForEach(Array(${liste.code}.enumerated()), id: \\.offset) { position, ${nom} in`, () => {
            e.bloc('HStack(alignment: .firstTextBaseline, spacing: 8) {', () => {
              e.ligne(`Text(verbatim: ${puce('position')})`);
              e.bloc('VStack(alignment: .leading, spacing: 4) {', () => this.ecrireCorps(e, enfant.corps));
            });
          });
          this.restaurer(avant);
          return;
        }
        e.bloc('HStack(alignment: .firstTextBaseline, spacing: 8) {', () => {
          e.ligne(`Text(verbatim: ${noeud.genre === 'liste' ? '"•"' : `"${i + 1}."`})`);
          this.ecrireVue(e, [enfant]);
        });
      });
    });
    this.modifieurs(e, noeud.options, 'bloc');
  }

  // ─── Les éléments ────────────────────────────────────────────────────────

  private contenuTexte(valeur: Valeur, id?: string): string {
    if (id !== undefined && this.textesChanges.has(id)) return `Text(verbatim: textes[${chaineSwift(id)}] ?? ${this.valeurs.enTexte(valeur)})`;
    if (valeur.type === 'texte' && !valeur.versions && valeur.parties.some((p) => 'texte' in p && (p.accent || p.code))) {
      const morceaux = valeur.parties.map((p) => ('texte' in p ? `.init(${chaineSwift(p.texte)}${p.accent ? ', accent: true' : ''}${p.code ? ', code: true' : ''})` : `.init(${this.valeurs.parties([p])})`));
      return `texteRiche([${morceaux.join(', ')}])`;
    }
    return `Text(verbatim: ${this.valeurs.enTexte(valeur)})`;
  }

  private ecrireElement(e: Ecrivain, noeudLu: Extract<NoeudVue, { type: 'element' }>): void {
    const noeud = { ...noeudLu, options: [...noeudLu.options, { nom: 'css', valeur: noeudLu.classes.join(' ') }] };
    const id = `.accessibilityIdentifier(${chaineSwift(noeud.id)})`;
    const ancre = noeud.ancre !== undefined ? [`.id(${chaineSwift(noeud.ancre)})`] : [];
    const survol = (this.survols.get(noeud.id) ?? []).map((f) => `.onHover { dedans in if dedans { ${this.appel(f)} } }`);
    const annonce = noeud.annonce ? ['.accessibilityAddTraits(.updatesFrequently)'] : [];
    const clics = this.clics.get(noeud.id) ?? [];
    switch (noeud.genre) {
      case 'titre':
      case 'soustitre': {
        const premier = noeud.genre === 'titre' && !this.titreVu;
        if (noeud.genre === 'titre') this.titreVu = true;
        e.ligne(this.contenuTexte(noeud.contenu, noeud.id));
        e.indenter(() => {
          const aTaille = noeud.options.some((o) => o.nom === 'taille');
          const police = this.app.policeTitres;
          if (!aTaille) e.ligne(police ? `.font(.custom(PolicesHumalis.vrai(${chaineSwift(police)}), size: ${premier ? 34 : 22}, relativeTo: ${premier ? '.largeTitle' : '.title2'}))` : premier ? '.font(.largeTitle)' : '.font(.title2)');
          e.ligne('.bold()');
          e.ligne('.accessibilityAddTraits(.isHeader)');
        });
        this.modifieurs(e, noeud.options, 'texte', [...this.toucher(clics), ...survol, ...annonce, id, ...ancre]);
        return;
      }
      case 'texte':
        e.ligne(this.contenuTexte(noeud.contenu, noeud.id));
        if (noeud.reglages?.decoratif) e.indenter(() => e.ligne('.accessibilityHidden(true)'));
        this.modifieurs(e, noeud.options, 'texte', [...this.toucher(clics), ...survol, ...annonce, id, ...ancre]);
        return;
      case 'bouton':
        return this.ecrireBouton(e, noeud, id, ancre, survol);
      case 'lien':
        return this.ecrireLien(e, noeud, id, ancre, survol);
      case 'image':
        return this.ecrireImage(e, noeud, id, ancre, clics, survol);
      case 'champ':
        return this.ecrireChamp(e, noeud, id);
    }
  }

  private toucher(clics: Fonction[]): string[] {
    if (clics.length === 0) return [];
    return [`.onTapGesture { ${clics.map((f) => this.appel(f)).join('; ')} }`, '.accessibilityAddTraits(.isButton)'];
  }

  private icone(nom: string | undefined): string {
    return nom ? `Image(systemName: ${chaineSwift(nomIcone(nom))}).accessibilityHidden(true)` : '';
  }

  /** Le libellé d'un bouton ou d'un lien, avec son icône ; une icône seule garde son nom pour le lecteur d'écran. */
  private ecrireLibelle(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'element' }>): void {
    const icone = this.icone(noeud.reglages?.icone);
    const texte = this.contenuTexte(noeud.contenu, noeud.id);
    if (icone) {
      e.bloc('HStack(spacing: 6) {', () => {
        e.ligne(icone);
        e.ligne(texte);
      });
    } else e.ligne(texte);
  }

  private ecrireBouton(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'element' }>, id: string, ancre: string[], survol: string[]): void {
    const clics = this.clics.get(noeud.id) ?? [];
    const formulaire = this.formulaireDe.get(noeud.id);
    const soumission = formulaire !== undefined && clics.length === 0 ? this.formulaires.get(formulaire)?.fonction : undefined;
    const faire = [...clics, ...(soumission ? [soumission] : [])].map((f) => this.appel(f));
    e.ligne(`Button { ${faire.join('; ')} } label: {`);
    e.indenter(() => this.ecrireLibelle(e, noeud));
    e.ligne('}');
    const fond = noeud.options.find((o) => o.nom === 'fond')?.valeur;
    const raccourci = noeud.raccourci !== undefined ? [touches(noeud.raccourci)] : [];
    this.modifieurs(e, noeud.options, 'bouton', [
      ...(fond ? ['.buttonStyle(.borderedProminent)', `.tint(Couleurs.${nomSwift(fond)})`, `.foregroundStyle(Couleurs.encre${nomSwift(fond).charAt(0).toUpperCase()}${nomSwift(fond).slice(1)})`] : ['.buttonStyle(.bordered)']),
      ...raccourci,
      ...survol,
      id,
      ...ancre,
    ]);
  }

  private ecrireLien(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'element' }>, id: string, ancre: string[], survol: string[]): void {
    const clics = (this.clics.get(noeud.id) ?? []).map((f) => this.appel(f));
    let aller: string;
    if (noeud.externeValeur !== undefined) aller = `ouvrirExterne(${this.valeurs.enTexte(noeud.externeValeur)})`;
    else if (noeud.externe !== undefined) aller = `ouvrirExterne(${chaineSwift(noeud.externe)})`;
    else if (noeud.cible !== undefined) aller = `Routeur.commun.aller(${this.actions.route(noeud.cible, noeud.arguments)}${noeud.versAncre !== undefined ? `, ancre: ${chaineSwift(noeud.versAncre)}` : ''})`;
    else if (noeud.versAncre !== undefined) aller = `Routeur.commun.ancre = ${chaineSwift(noeud.versAncre)}`;
    else aller = 'Routeur.commun.aller(.accueilHumalis)';
    e.ligne(`Button { ${[...clics, aller].join('; ')} } label: {`);
    e.indenter(() => this.ecrireLibelle(e, noeud));
    e.ligne('}');
    const couleur = noeud.options.some((o) => o.nom === 'couleur' || o.nom === 'texte');
    this.modifieurs(e, noeud.options, 'lien', ['.buttonStyle(.plain)', ...(couleur ? [] : ['.foregroundStyle(.tint)']), '.accessibilityAddTraits(.isLink)', ...(noeud.raccourci !== undefined ? [touches(noeud.raccourci)] : []), ...survol, id, ...ancre]);
  }

  private ecrireImage(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'element' }>, id: string, ancre: string[], clics: Fonction[], survol: string[]): void {
    const image = noeud.image;
    const texte = noeud.contenu.type === 'texte' && noeud.contenu.parties.every((p) => 'texte' in p) ? noeud.contenu.parties.map((p) => ('texte' in p ? p.texte : '')).join('') : undefined;
    const source = image?.locale !== undefined ? `.locale(${chaineSwift(this.app.ressource(nomDeLaCopie(image.locale)))})` : `.adresse(${this.valeurs.enTexte(noeud.contenu)})`;
    const description = noeud.reglages?.decoratif ? '""' : image?.description ? this.valeurs.enTexte(image.description) : noeud.reglages?.description ? chaineSwift(noeud.reglages.description) : texte !== undefined && !image?.locale ? chaineSwift(texte.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ')) : '""';
    const proportions = image?.proportions ? `, proportions: ${image.proportions[0]} / ${image.proportions[1]}` : '';
    const ajustement = noeud.options.find((o) => o.nom === 'ajustement')?.valeur;
    e.ligne(`ImageHumalis(source: ${source}, description: ${description}${proportions}${ajustement ? `, ajustement: .${ajustement}` : ''})`);
    this.modifieurs(e, noeud.options, 'image', [...(this.nomForce === 'EnteteSite' ? ['.frame(maxHeight: 44, alignment: .leading)'] : []), ...this.toucher(clics), ...survol, id, ...ancre]);
  }

  private ecrireChamp(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'element' }>, idBrut: string): void {
    const id = idBrut.replace('.accessibilityIdentifier(', '.identifiantHumalis(');
    const champ = this.portee.champs.get(noeud.id)!;
    const saisie = noeud.saisie;
    const sorte = saisie?.sorte ?? 'texte';
    const libelle = this.valeurs.enTexte(noeud.contenu);
    const lien = `$${champ.variable}`;
    const formulaire = this.formulaireDe.get(noeud.id);
    const soumission = formulaire !== undefined ? this.formulaires.get(formulaire)?.fonction : undefined;
    const obligatoire = saisie?.obligatoire ? ', obligatoire: true' : '';
    const indice = saisie?.indiceValeur ? `, indice: ${this.valeurs.enTexte(saisie.indiceValeur)}` : saisie?.indiceLangues ? `, indice: t([${saisie.indiceLangues.map((v) => `${chaineSwift(v.code)}: ${chaineSwift(v.texte)}`).join(', ')}])` : saisie?.indice !== undefined ? `, indice: ${chaineSwift(saisie.indice)}` : '';
    const parmi = saisie?.parmi ? this.valeurs.listePresente(saisie.parmi) : undefined;
    const valeurs = parmi ? (parmi.type.genre === 'liste' && parmi.type.de.genre === 'texte' ? parmi.code : `${parmi.code}.map { texteDe($0) }`) : '[]';
    const envoi: string[] = [];
    if (soumission && UNE_LIGNE.has(sorte)) envoi.push(`.onSubmit { ${this.appel(soumission)} }`, '.submitLabel(.send)');
    const pause = this.saisiesSuivies.find((s) => s.gestionnaire.cibles[0] === noeud.id && s.gestionnaire.declencheur === 'pauseSaisie');
    if (pause && !soumission) envoi.push(`.onSubmit { ${this.appel(pause.fonction)} }`);
    const estMotDePasse = sorte === 'motDePasse' || this.champsMotDePasse.has(noeud.id);
    switch (sorte) {
      case 'case':
        e.ligne(`Toggle(isOn: ${lien}) { Text(verbatim: ${libelle}${saisie?.obligatoire ? ' + " *"' : ''}) }`);
        break;
      case 'choix':
        e.ligne(`ChoixHumalis(libelle: ${libelle}, valeurs: ${valeurs}, choisi: ${lien}${obligatoire})`);
        break;
      case 'liste':
        e.ligne(`ListeHumalis(libelle: ${libelle}, valeurs: ${valeurs}, choisi: ${lien}${obligatoire}${indice})`);
        break;
      case 'texteLong':
        e.ligne(`TexteLongHumalis(libelle: ${libelle}, texte: ${lien}${obligatoire}${indice})`);
        break;
      case 'date':
      case 'heure':
        e.ligne(`ChampDateHumalis(libelle: ${libelle}, texte: ${lien}, genre: .${sorte}${obligatoire})`);
        break;
      default:
        if (estMotDePasse) e.ligne(`MotDePasseHumalis(libelle: ${libelle}, texte: ${lien}, nouveau: ${!this.champsMotDePasse.has(noeud.id)}${obligatoire}${indice})`);
        else e.ligne(`ChampHumalis(libelle: ${libelle}, texte: ${lien}, clavier: .${clavier(sorte, this.champsEmail.has(noeud.id))}${obligatoire}${indice})`);
    }
    if (noeud.raccourci !== undefined) this.app.avertir(noeud.ligne, "un raccourci clavier sur un champ n'est pas encore produit sur la cible Apple : il est ignoré.");
    this.modifieurs(e, noeud.options, 'champ', [...envoi, id]);
  }

  // ─── Les éléments d'écran ────────────────────────────────────────────────

  private ecrireWidget(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'widget' }>): void {
    const id = `.identifiantHumalis(${chaineSwift(noeud.id)})`;
    const r = noeud.reglages;
    const description = r.description !== undefined ? chaineSwift(r.description) : 'nil';
    const lue = noeud.contenu.type === 'variable' ? this.portee.variables.get(noeud.contenu.nom) : undefined;
    const lien = (type: TypeValeur): string => {
      if (!lue) {
        this.refuser(noeud.ligne, `« ${noeud.genre} » demande une variable pour garder sa valeur`);
        return '.constant(0)';
      }
      return this.app.types.egaux(lue.type, type) && !lue.opt ? (lue.code.includes('.') ? `Binding(get: { ${lue.code} }, set: { ${lue.code} = $0 })` : `$${lue.code}`) : `Binding(get: { ${this.valeurs.vers(lue, type)} }, set: { ${lue.code} = $0 })`;
    };
    switch (noeud.genre) {
      case 'icone': {
        // Le nom est le texte de l'élément : « icone "panier" ».
        const nom = nomIcone(r.icone ?? (this.valeurs.enTexte(noeud.contenu).replace(/^"|"$/g, '') || 'info'));
        e.ligne(`Image(systemName: ${chaineSwift(nom)})`);
        this.modifieurs(e, noeud.options, 'texte', [r.description !== undefined ? `.accessibilityLabel(${chaineSwift(r.description)})` : '.accessibilityHidden(true)', id]);
        return;
      }
      case 'badge':
        e.ligne(`BadgeHumalis(texte: ${this.valeurs.enTexte(noeud.contenu)})`);
        this.modifieurs(e, noeud.options.filter((o) => o.nom !== 'fond'), 'bloc', [id]);
        return;
      case 'avatar': {
        const photo = r.photo ? `, photo: ${this.valeurs.enTexte(r.photo)}` : '';
        e.ligne(`AvatarHumalis(nom: ${this.valeurs.enTexte(noeud.contenu)}${photo})`);
        this.modifieurs(e, noeud.options, 'bloc', [id]);
        return;
      }
      case 'progression':
        e.ligne(`ProgressionHumalis(valeur: ${this.valeurs.nombre(noeud.contenu)}, maximum: ${r.pourcentage ? 100 : (noeud.maximum ?? 100)}, description: ${description}, pourcentage: ${r.pourcentage ?? false})`);
        this.modifieurs(e, noeud.options, 'bloc', [id]);
        return;
      case 'chargement':
        e.ligne(`ChargementHumalis(texte: ${this.valeurs.enTexte(noeud.contenu)})`);
        this.modifieurs(e, noeud.options, 'bloc', [id]);
        return;
      case 'etoiles':
        if (r.modifiable) e.ligne(`EtoilesHumalis(note: ${lien(NOMBRE)}, maximum: ${noeud.maximum ?? 5})`);
        else e.ligne(`EtoilesHumalis(note: .constant(${this.valeurs.nombre(noeud.contenu)}), maximum: ${noeud.maximum ?? 5}, modifiable: false)`);
        this.modifieurs(e, noeud.options, 'bloc', [id]);
        return;
      case 'compteur':
        e.ligne(`CompteurHumalis(valeur: ${lien(NOMBRE)}, minimum: ${noeud.minimum ?? 0}, maximum: ${noeud.maximum ?? 'Double.greatestFiniteMagnitude'}, description: ${description})`);
        this.modifieurs(e, noeud.options, 'bloc', [id]);
        return;
      case 'qr':
        e.ligne(`QrHumalis(texte: ${this.valeurs.enTexte(noeud.contenu)}, description: ${description})`);
        this.modifieurs(e, noeud.options, 'bloc', [id]);
        return;
      case 'audio': {
        const fichier = noeud.contenu.type === 'texte' && noeud.contenu.parties.every((p) => 'texte' in p) ? noeud.contenu.parties.map((p) => ('texte' in p ? p.texte : '')).join('') : undefined;
        const local = fichier !== undefined && !/^([a-z][a-z0-9+.-]*:|\/)/i.test(fichier.trim());
        const source = local ? `.locale(${chaineSwift(this.app.ressource(fichier!))})` : `.adresse(${this.valeurs.enTexte(noeud.contenu)})`;
        const textes = noeud.textes;
        e.ligne(`LecteurHumalis(source: ${source}, description: ${textes?.description ? this.valeurs.enTexte(textes.description) : description}, transcription: ${textes?.transcription ? this.valeurs.enTexte(textes.transcription) : 'nil'}, boucle: ${r.boucle ?? false})`);
        this.modifieurs(e, noeud.options, 'bloc', [id]);
        return;
      }
      case 'signature':
        e.ligne(`SignatureHumalis(trace: ${lien(TEXTE)})`);
        this.modifieurs(e, noeud.options, 'bloc', [id]);
        return;
      case 'selecteurLangue':
        e.ligne('SelecteurLangueHumalis()');
        this.modifieurs(e, noeud.options, 'bloc', [id]);
        return;
      case 'fichier':
        return this.ecrireFichier(e, noeud, id);
    }
  }

  private ecrireFichier(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'widget' }>, id: string): void {
    const choix = noeud.fichier!;
    const lue = this.portee.variables.get(choix.variable);
    if (!lue) return this.refuser(noeud.ligne, `« fichier dans ${choix.variable} » : cette variable est inconnue ici`);
    const familles = `[${choix.familles.map((f) => `FamilleFichier(nom: ${chaineSwift(f.nom)}, mime: [${f.mime.map(chaineSwift).join(', ')}])`).join(', ')}]`;
    const lien = `Binding(get: { ${lue.code} }, set: { ${lue.code} = $0 })`;
    e.ligne(`ChoixFichierHumalis(libelle: ${this.valeurs.enTexte(noeud.contenu)}, ${choix.plusieurs ? 'liste' : 'fichier'}: ${lien}, familles: ${familles}${choix.octets !== undefined ? `, maximum: ${choix.octets}` : ''}, apercu: ${choix.apercu})`);
    this.modifieurs(e, noeud.options, 'bloc', [id]);
  }

  private ecrireGraphique(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'graphique' }>): void {
    const liste = this.valeurs.listePresente(noeud.liste);
    const de = this.valeurs.elementDe(liste.type);
    const element: Expr = { code: '$0', type: de, opt: false };
    const etiquettes = noeud.etiquette !== undefined
      ? `${liste.code}.map { ${this.valeurs.vers(this.valeurs.lireChamp(element, noeud.etiquette), TEXTE)} }`
      : noeud.etiquettes
        ? `${this.valeurs.listePresente(noeud.etiquettes).code}.map { texteDe($0) }`
        : `${liste.code}.indices.map { String($0 + 1) }`;
    const series = noeud.series.map((s) => {
      const valeurs = s.valeur !== undefined ? `${liste.code}.map { ${this.valeurs.vers(this.valeurs.lireChamp(element, s.valeur), NOMBRE)} }` : de.genre === 'nombre' ? liste.code : `${liste.code}.map { ${this.valeurs.vers(element, NOMBRE)} }`;
      const nom = s.nomLangues ? `t([${s.nomLangues.map((v) => `${chaineSwift(v.code)}: ${chaineSwift(v.texte)}`).join(', ')}])` : chaineSwift(s.nom);
      return `SerieHumalis(nom: ${nom}, valeurs: ${valeurs}${s.couleur ? `, couleur: Couleurs.${nomSwift(s.couleur)}` : ''})`;
    });
    const proportions = noeud.proportions ? `, proportions: ${noeud.proportions[0]} / ${noeud.proportions[1]}` : '';
    const titre = noeud.titreLangues ? `t([${noeud.titreLangues.map((v) => `${chaineSwift(v.code)}: ${chaineSwift(v.texte)}`).join(', ')}])` : chaineSwift(noeud.titre);
    e.ligne(`GraphiqueHumalis(genre: .${noeud.genre}, titre: ${titre}, description: ${this.valeurs.enTexte(noeud.description)}, etiquettes: ${etiquettes}, series: [${series.join(', ')}]${noeud.devise ? `, devise: .${noeud.devise}` : ''}${proportions})`);
    e.indenter(() => e.ligne(`.accessibilityIdentifier(${chaineSwift(noeud.id)})`));
  }

  private ecrireCarte(e: Ecrivain, noeud: Extract<NoeudVue, { type: 'carte' }>): void {
    if (noeud.tuiles) this.app.avertir(noeud.ligne, "sur la cible Apple, une carte utilise toujours Plans d'Apple : le fournisseur de tuiles choisi est ignoré.");
    const centre = noeud.latitude && noeud.longitude ? `, latitude: ${this.valeurs.nombre(noeud.latitude)}, longitude: ${this.valeurs.nombre(noeud.longitude)}` : '';
    const zoom = noeud.zoom ? `, zoom: ${this.valeurs.nombre(noeud.zoom)}` : '';
    e.bloc(`CarteHumalis(nom: ${this.valeurs.enTexte(noeud.nom)}${centre}${zoom}) {`, () => this.ecrireMarqueurs(e, noeud.corps));
    e.indenter(() => e.ligne(`.accessibilityIdentifier(${chaineSwift(noeud.id)})`));
  }

  private ecrireMarqueurs(e: Ecrivain, noeuds: NoeudVue[]): void {
    for (const n of noeuds) {
      this.ligne = n.ligne;
      if (n.type === 'marqueur') {
        const adresse = n.adresse ? ` + " — " + ${this.valeurs.enTexte(n.adresse)}` : '';
        e.ligne(`Marker(${this.valeurs.enTexte(n.nom)}${adresse}, coordinate: CLLocationCoordinate2D(latitude: ${this.valeurs.nombre(n.latitude)}, longitude: ${this.valeurs.nombre(n.longitude)}))`);
      } else if (n.type === 'condition') {
        e.ligne(`if ${this.valeurs.condition(n.test)} {`);
        e.indenter(() => this.ecrireMarqueurs(e, n.alors));
        if (n.sinon.length > 0) {
          e.ligne('} else {');
          e.indenter(() => this.ecrireMarqueurs(e, n.sinon));
        }
        e.ligne('}');
      } else if (n.type === 'repetition') {
        const liste = this.valeurs.listePresente(n.liste);
        const nom = nomSwift(n.variable);
        const type = plusPrecis(n.typeVariable, this.valeurs.elementDe(liste.type));
        const avant = new Map(this.portee.variables);
        this.portee.variables.set(n.variable, { code: nom, type, opt: false });
        e.bloc(`ForEach(Array(${liste.code}.enumerated()), id: \\.offset) { _, ${nom} in`, () => this.ecrireMarqueurs(e, n.corps));
        this.restaurer(avant);
      }
    }
  }
}

/** Les variables qui reçoivent un fichier (« fichier "…" dans photo »). */
function variablesDeFichier(noeuds: NoeudVue[]): Set<string> {
  const noms = new Set<string>();
  const voir = (liste: NoeudVue[]) => {
    for (const n of liste) {
      if (n.type === 'widget' && n.fichier) noms.add(n.fichier.variable);
      if (n.type === 'condition') {
        voir(n.alors);
        voir(n.sinon);
      } else if ('corps' in n && Array.isArray(n.corps)) voir(n.corps as NoeudVue[]);
    }
  };
  voir(noeuds);
  return noms;
}

/** Les tests Swift, dans l'ordre des messages de `verificationsDuChamp`. */
function testsDuChamp(v: string, saisie: Saisie | undefined): string[] {
  const sorte = saisie?.sorte ?? 'texte';
  const vide = `estVideHumalis(${v})`;
  const tests: string[] = [];
  if (saisie?.obligatoire) {
    if (sorte === 'case') tests.push(`!${v}`);
    else if (sorte === 'choix' || sorte === 'liste') tests.push(`${v}.isEmpty`);
    else tests.push(vide);
  }
  const forme = (motif: string) => tests.push(`!${vide} && !correspondHumalis(${v}, ${chaineSwift(motif)})`);
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
      tests.push(`!${vide} && !estUnNombre(${v})`);
      if (saisie?.minimum !== undefined) tests.push(`!${vide} && nombreDe(${v}) < ${saisie.minimum}`);
      if (saisie?.maximum !== undefined) tests.push(`!${vide} && nombreDe(${v}) > ${saisie.maximum}`);
      break;
  }
  return tests;
}
