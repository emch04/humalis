/**
 * Les valeurs et les conditions Humalis, en Swift typé. Chaque expression
 * produite connaît son type : les données du serveur et les fiches sont de
 * vrais types Swift ; seul ce que le compilateur ne peut pas connaître passe
 * par `ValeurHumalis`.
 */
import type { Application, PartieVariable, PartiesTexte, Test, TypeChamp, TypeValeur, Valeur } from '../../ri/types.js';
import { estCombine } from '../../ri/types.js';
import { chaineSwift, cleJson, echapper, nomSwift, nomType } from './noms.js';

const TEXTE: TypeValeur = { genre: 'texte' };
const NOMBRE: TypeValeur = { genre: 'nombre' };
const BOOLEEN: TypeValeur = { genre: 'booleen' };
const INCONNU: TypeValeur = { genre: 'inconnu' };

/** La marque d'une variable qui reçoit un fichier choisi : son type Swift est `FichierChoisi`. */
export const FICHIER_CHOISI = 'humalis:fichier-choisi';
const estFichierChoisi = (t: TypeValeur): boolean => t.genre === 'fiche' && t.fichier === FICHIER_CHOISI;

/** Une expression Swift : son code, son type, et si elle peut ne pas avoir de valeur (`T?`). */
export interface Expr {
  code: string;
  type: TypeValeur;
  opt: boolean;
}

export interface ChampStruct {
  /** Le nom écrit dans le programme. */
  nom: string;
  swift: string;
  cle: string;
  type: TypeValeur;
  opt: boolean;
}

export interface StructSwift {
  nom: string;
  champs: ChampStruct[];
  commentaire: string;
}

/** Les types de données du programme : une donnée du serveur ou une fiche devient un `struct`. */
export class Types {
  readonly donnees = new Map<string, StructSwift>();
  private readonly fiches = new Map<string, StructSwift>();

  constructor(application: Application, donneesDesPages: (a: Application) => { nom: string; source: string; champs: { nom: string; type: TypeChamp }[] }[]) {
    const liste = donneesDesPages(application);
    // Le nom d'abord : une donnée peut en citer une autre écrite plus bas.
    for (const d of liste) this.donnees.set(d.nom, { nom: nomType(d.nom), champs: [], commentaire: `La donnée « ${d.nom} » de « ${d.source} ».` });
    const dependances = new Map(liste.map((d) => [d.nom, d.champs.flatMap((c) => (c.type.genre === 'donnee' ? [c.type.nom] : []))]));
    // Une donnée qui se contient elle-même (sans liste) n'a pas de taille en Swift : ce champ reste souple.
    const contient = (depuis: string, cherche: string, vus: Set<string>): boolean =>
      depuis === cherche || (!vus.has(depuis) && (dependances.get(depuis) ?? []).some((d) => contient(d, cherche, new Set([...vus, depuis]))));
    for (const d of liste) {
      const champs: ChampStruct[] = d.champs.map((c) => {
        const type = c.type.genre === 'donnee' && contient(c.type.nom, d.nom, new Set()) ? INCONNU : this.typeDeChamp(c.type);
        return { nom: c.nom, swift: nomSwift(c.nom), cle: cleJson(c.nom), type, opt: false };
      });
      if (!champs.some((c) => c.cle === 'id')) champs.unshift({ nom: 'id', swift: 'id', cle: 'id', type: TEXTE, opt: false });
      this.donnees.get(d.nom)!.champs = champs;
    }
  }

  private typeDeChamp(t: TypeChamp): TypeValeur {
    switch (t.genre) {
      case 'liste':
        return { genre: 'liste', de: this.typeDeChamp(t.de) };
      case 'donnee':
        return { genre: 'donnee', nom: t.nom };
      case 'nombre':
        return NOMBRE;
      case 'booleen':
        return BOOLEEN;
      default:
        return TEXTE;
    }
  }

  /** La clé qui identifie une fiche : deux fiches de mêmes champs sont le même type. */
  private cleFiche(type: Extract<TypeValeur, { genre: 'fiche' }>): string {
    return JSON.stringify(type.champs.map((c) => [c.nom, this.signature(c.type)]).sort());
  }

  private signature(t: TypeValeur): string {
    switch (t.genre) {
      case 'liste':
        return `[${this.signature(t.de)}]`;
      case 'donnee':
        return `d:${t.nom}`;
      case 'fiche':
        return this.cleFiche(t);
      default:
        return t.genre;
    }
  }

  private structFiche(type: Extract<TypeValeur, { genre: 'fiche' }>): StructSwift {
    const cle = this.cleFiche(type);
    let fiche = this.fiches.get(cle);
    if (!fiche) {
      fiche = {
        nom: `Fiche${this.fiches.size + 1}`,
        champs: type.champs.map((c) => ({ nom: c.nom, swift: nomSwift(c.nom), cle: cleJson(c.nom), type: c.type, opt: false })),
        commentaire: `Une fiche : ${type.champs.map((c) => c.nom).join(', ') || 'sans champ'}.`,
      };
      this.fiches.set(cle, fiche);
    }
    return fiche;
  }

  structDe(type: TypeValeur): StructSwift | undefined {
    if (type.genre === 'donnee') return this.donnees.get(type.nom);
    if (estFichierChoisi(type)) return undefined;
    if (type.genre === 'fiche') return this.structFiche(type);
    return undefined;
  }

  /** Le type Swift d'un type Humalis. */
  swift(type: TypeValeur, opt = false): string {
    const base = this.swiftSeul(type);
    return opt ? `${base}?` : base;
  }

  private swiftSeul(type: TypeValeur): string {
    switch (type.genre) {
      case 'texte':
        return 'String';
      case 'nombre':
        return 'Double';
      case 'booleen':
        return 'Bool';
      case 'liste':
        return `[${this.swiftSeul(type.de)}]`;
      case 'donnee':
        return this.donnees.get(type.nom)?.nom ?? 'ValeurHumalis';
      case 'fiche':
        return estFichierChoisi(type) ? 'FichierChoisi' : this.structFiche(type).nom;
      case 'inconnu':
        return 'ValeurHumalis';
    }
  }

  /** La valeur quand il n'y en a pas (un champ vide, une lecture sans réponse). */
  defaut(type: TypeValeur): string {
    switch (type.genre) {
      case 'texte':
        return '""';
      case 'nombre':
        return '0';
      case 'booleen':
        return 'false';
      case 'liste':
        return '[]';
      case 'inconnu':
        return '.rien';
      default:
        return `${this.swiftSeul(type)}()`;
    }
  }

  egaux(a: TypeValeur, b: TypeValeur): boolean {
    return this.swiftSeul(a) === this.swiftSeul(b);
  }

  /** Les champs lisibles d'un type, pour « p.prix ». */
  champ(type: TypeValeur, nom: string): ChampStruct | undefined {
    return this.structDe(type)?.champs.find((c) => c.cle === cleJson(nom));
  }

  /** Tous les types à écrire dans Donnees.swift (les fiches sont connues après les pages). */
  tous(): StructSwift[] {
    return [...this.donnees.values(), ...this.fiches.values()];
  }
}

/** Le plus précis de deux types : celui de la représentation intermédiaire, complété par celui trouvé ici. */
export function plusPrecis(ri: TypeValeur, trouve: TypeValeur): TypeValeur {
  if (ri.genre === 'inconnu') return trouve;
  if (ri.genre === 'liste' && trouve.genre === 'liste') return { genre: 'liste', de: plusPrecis(ri.de, trouve.de) };
  return ri;
}

export interface Lecture {
  code: string;
  type: TypeValeur;
  opt: boolean;
}

/** Ce que la page sait au moment d'écrire une expression. */
export interface Portee {
  /** Les variables, calculs, paramètres et variables de boucle visibles. */
  variables: Map<string, Lecture>;
  /** Le champ de chaque identifiant : sa variable et sa sorte. */
  champs: Map<string, { variable: string; sorte?: 'nombre' | 'case' }>;
  /** Les fonctions écrites en haut du fichier. */
  fonctions: Map<string, { parametres: { nom: string; type: TypeValeur }[]; retour: TypeValeur; opt: boolean }>;
  /** L'état de requête de chaque variable suivie. */
  etatsRequetes: Set<string>;
  /** Noté par le code qui lit l'environnement (« mouvement est reduit »). */
  besoins: Set<string>;
  /** Avec plusieurs langues : les textes passent par t(). */
  langues: boolean;
}

/** Ce qui se passe quand une construction n'existe pas encore ici. */
export type Refus = (quoi: string) => void;

/** Traduit les valeurs d'une page. */
export class Valeurs {
  constructor(
    readonly types: Types,
    readonly portee: Portee,
    private readonly refuser: Refus,
  ) {}

  // ─── Conversions ─────────────────────────────────────────────────────────

  /** L'expression convertie vers ce type, toujours présente. */
  vers(e: Expr, cible: TypeValeur): string {
    const present = e.opt ? `(${e.code} ?? ${this.defautPour(e.type, cible)})` : e.code;
    if (this.types.egaux(e.type, cible)) return present;
    if (cible.genre === 'inconnu') return `ValeurHumalis(${e.code})`;
    if (e.type.genre === 'inconnu') {
      const base = e.opt ? `(${e.code} ?? .rien)` : e.code;
      switch (cible.genre) {
        case 'texte':
          return `${base}.enTexte`;
        case 'nombre':
          return `${base}.enNombre`;
        case 'booleen':
          return `${base}.enBooleen`;
        default:
          return `${base}.converti(sinon: ${this.types.swift(cible)}${cible.genre === 'liste' ? '()' : '()'})`;
      }
    }
    if (cible.genre === 'texte') return `texteDe(${e.code})`;
    if (cible.genre === 'nombre' && e.type.genre === 'texte') return `nombreDe(${present})`;
    if (e.code === '[]') return '[]';
    return `convertirHumalis(${present}, sinon: ${this.types.swift(cible)}())`;
  }

  private defautPour(type: TypeValeur, cible: TypeValeur): string {
    return this.types.egaux(type, cible) ? this.types.defaut(cible) : this.types.defaut(type);
  }

  /** L'expression convertie, en gardant l'absence de valeur (`T?`). */
  versOpt(e: Expr, cible: TypeValeur): string {
    if (!e.opt) return this.vers(e, cible);
    if (e.code === 'nil') return 'nil';
    if (this.types.egaux(e.type, cible)) return e.code;
    return `${e.code}.map { ${this.vers({ code: '$0', type: e.type, opt: false }, cible)} }`;
  }

  /** En texte, comme dans un « {…} » : un nombre au format français, une liste séparée par des virgules. */
  enTexte(v: Valeur): string {
    const e = this.expr(v);
    return e.type.genre === 'texte' && !e.opt ? e.code : `texteDe(${e.code})`;
  }

  nombre(v: Valeur): string {
    return this.vers(this.expr(v, NOMBRE), NOMBRE);
  }

  texte(v: Valeur): string {
    return this.vers(this.expr(v, TEXTE), TEXTE);
  }

  // ─── Expressions ─────────────────────────────────────────────────────────

  /** La valeur en Swift ; `attendu` donne sa forme à une liste vide ou à une fiche. */
  expr(valeur: Valeur, attendu?: TypeValeur): Expr {
    switch (valeur.type) {
      case 'texte':
        return { code: this.texteLitteral(valeur), type: TEXTE, opt: false };
      case 'nombre':
        return { code: String(valeur.valeur), type: NOMBRE, opt: false };
      case 'booleen':
        return { code: String(valeur.valeur), type: BOOLEEN, opt: false };
      case 'liste':
        return this.liste(valeur, attendu);
      case 'variable':
        return this.variable(valeur.nom);
      case 'champ': {
        const champ = this.portee.champs.get(valeur.id);
        if (!champ) {
          this.refuser(`le champ « ${valeur.id} », introuvable dans cette page,`);
          return { code: '""', type: TEXTE, opt: false };
        }
        if (champ.sorte === 'nombre') return { code: `nombreDe(${champ.variable})`, type: NOMBRE, opt: false };
        return { code: champ.variable, type: champ.sorte === 'case' ? BOOLEEN : TEXTE, opt: false };
      }
      case 'calcul':
        return this.calcul(valeur);
      case 'compte': {
        const liste = this.expr(valeur.liste);
        if (liste.type.genre === 'inconnu') return { code: `${liste.opt ? `(${liste.code} ?? .rien)` : liste.code}.longueur`, type: NOMBRE, opt: false };
        return { code: liste.opt ? `Double((${liste.code})?.count ?? 0)` : `Double(${liste.code}.count)`, type: NOMBRE, opt: false };
      }
      case 'fiche':
        return this.fiche(valeur, attendu);
      case 'appel':
        return this.appel(valeur);
      case 'agregat': {
        const liste = this.listeDeNombres(valeur.liste);
        return { code: `${valeur.operation}(${liste})`, type: NOMBRE, opt: false };
      }
      case 'arrondi':
        return { code: `arrondi(${this.nombre(valeur.valeur)}, chiffres: ${valeur.chiffres ?? 0})`, type: NOMBRE, opt: false };
      case 'hasard':
        return { code: `hasard(${this.nombre(valeur.minimum)}, ${this.nombre(valeur.maximum)})`, type: NOMBRE, opt: false };
      case 'dateDuJour':
        return { code: valeur.maintenant ? 'maintenant()' : 'dateDuJour()', type: TEXTE, opt: false };
      case 'dateDecalee':
        return { code: `decalerDate(${this.versOpt(this.expr(valeur.date), TEXTE)}, ${valeur.signe < 0 ? '-' : ''}(${this.nombre(valeur.nombre)}), .${valeur.unite})`, type: TEXTE, opt: false };
      case 'joursEntre':
        return { code: `joursEntre(${this.versOpt(this.expr(valeur.debut), TEXTE)}, ${this.versOpt(this.expr(valeur.fin), TEXTE)})`, type: NOMBRE, opt: false };
      case 'champs': {
        const liste = this.listePresente(valeur.liste);
        const de = this.elementDe(liste.type);
        const champ = this.lireChamp({ code: '$0', type: de, opt: false }, valeur.champ);
        return { code: `${liste.code}.map { ${champ.code} }`, type: { genre: 'liste', de: champ.type }, opt: false };
      }
      case 'filtre': {
        const liste = this.listePresente(valeur.liste);
        return { code: `${liste.code}.filter { ${this.testElement(valeur.test, valeur.champs, this.elementDe(liste.type))} }`, type: liste.type, opt: false };
      }
      case 'tri': {
        const liste = this.listePresente(valeur.liste);
        const de = this.elementDe(liste.type);
        const lu = valeur.champ !== undefined ? this.lireChamp({ code: '$0', type: de, opt: false }, valeur.champ) : { code: '$0', type: de, opt: false };
        const cle = this.vers(lu, valeur.genre === 'texte' ? TEXTE : NOMBRE);
        return { code: `trier(${liste.code}, decroissant: ${valeur.decroissant}) { ${cle} }`, type: liste.type, opt: false };
      }
      case 'groupement': {
        const liste = this.listePresente(valeur.liste);
        const de = this.elementDe(liste.type);
        const groupe: TypeValeur = { genre: 'fiche', champs: [{ nom: 'nom', type: TEXTE }, { nom: 'elements', type: liste.type }] };
        const nom = this.types.swift(groupe);
        const cle = this.vers(this.lireChamp({ code: '$0', type: de, opt: false }, valeur.champ), TEXTE);
        return { code: `grouper(${liste.code}) { ${cle} }.map { ${nom}(nom: $0.nom, elements: $0.elements) }`, type: { genre: 'liste', de: groupe }, opt: false };
      }
      case 'premier': {
        if (valeur.liste.type === 'filtre') {
          const liste = this.listePresente(valeur.liste.liste);
          const de = this.elementDe(liste.type);
          return { code: `${liste.code}.first { ${this.testElement(valeur.liste.test, valeur.liste.champs, de)} }`, type: de, opt: true };
        }
        const liste = this.listePresente(valeur.liste);
        return { code: `${liste.code}.first`, type: this.elementDe(liste.type), opt: true };
      }
      case 'premiers': {
        const liste = this.listePresente(valeur.liste);
        return { code: `Array(${liste.code}.prefix(Swift.max(0, Int(${this.nombre(valeur.nombre)}))))`, type: liste.type, opt: false };
      }
      case 'operationTexte': {
        const texte = this.texte(valeur.valeur);
        if (valeur.operation === 'longueur') return { code: `Double(${texte}.count)`, type: NOMBRE, opt: false };
        if (valeur.operation === 'initiales') return { code: `initialesDe(${texte})`, type: TEXTE, opt: false };
        return { code: `${texte}.${valeur.operation === 'majuscules' ? 'uppercased' : 'lowercased'}(with: Locale(identifier: "fr_FR"))`, type: TEXTE, opt: false };
      }
      case 'remplacement':
        return { code: `${this.texte(valeur.dans)}.replacingOccurrences(of: ${this.texte(valeur.cherche)}, with: ${this.texte(valeur.remplace)})`, type: TEXTE, opt: false };
      case 'champDonnee':
        return this.lireChamp(this.expr(valeur.objet), valeur.champ);
      case 'utilisateur':
        if (valeur.etat.startsWith('role:')) return { code: `Session.commun.aRole([${valeur.etat.slice(5).split(',').map(chaineSwift).join(', ')}])`, type: BOOLEEN, opt: false };
        return { code: `Session.commun.${valeur.etat === 'connecte' ? 'connecte' : 'admin'}`, type: BOOLEEN, opt: false };
      case 'etatRequete':
        return { code: `${this.etatRequete(valeur.variable)}.statut == .${valeur.etat}`, type: BOOLEEN, opt: false };
      case 'erreurRequete':
        return { code: `${this.etatRequete(valeur.variable)}.message`, type: TEXTE, opt: false };
      case 'mouvementReduit':
        this.portee.besoins.add('mouvementReduit');
        return { code: 'mouvementReduit', type: BOOLEEN, opt: false };
      case 'themeSombre':
        this.portee.besoins.add('themeSombre');
        return { code: '(apparence == .dark)', type: BOOLEEN, opt: false };
      case 'rien':
        return { code: 'nil', type: attendu ?? INCONNU, opt: true };
    }
  }

  private etatRequete(variable: string): string {
    return `etat${nomSwift(variable).replace(/^./, (c) => c.toUpperCase())}`;
  }

  private variable(nom: string): Expr {
    const lue = this.portee.variables.get(nom);
    if (lue) return { ...lue };
    this.refuser(`la variable « ${nom} », inconnue ici,`);
    return { code: 'ValeurHumalis.rien', type: INCONNU, opt: false };
  }

  private texteLitteral(valeur: Extract<Valeur, { type: 'texte' }>): string {
    if (valeur.versions) {
      return `t([${valeur.versions.map((v) => `${chaineSwift(v.code)}: ${this.parties(v.parties, v.code)}`).join(', ')}])`;
    }
    return this.parties(valeur.parties);
  }

  /** Une chaîne Swift : le texte écrit et les valeurs « \(…) ». */
  parties(parties: PartiesTexte, langue?: string): string {
    return `"${parties.map((p) => ('texte' in p ? echapper(p.texte) : `\\(${this.partie(p, langue)})`)).join('')}"`;
  }

  private partie(p: PartieVariable, langue?: string): string {
    const valeur = p.expression ?? this.cheminVersValeur(p.variable);
    const e = this.expr(valeur);
    const en = langue !== undefined && langue !== 'fr' ? `, langue: ${chaineSwift(langue)}` : '';
    if (p.format === 'dateLongue' || p.format === 'lettres') {
      const lu = p.format === 'lettres' ? `formaterEnLettres(${this.versOpt(e, NOMBRE)}${en})` : `formaterDateLongue(${this.versOpt(e, TEXTE)}${en})`;
      return p.majuscule ? `avecMajuscule(${lu}${en})` : lu;
    }
    if (p.pluriel) return `accorder(${this.versOpt(e, NOMBRE)}, ${chaineSwift(p.pluriel)}${en})`;
    if (p.format === 'date') return `formaterDate(${this.versOpt(e, TEXTE)}${en})`;
    if (p.format === 'nombre') return `formaterNombre(${this.versOpt(e, NOMBRE)}${en})`;
    if (p.format === 'depuis') return `formaterDepuis(${this.versOpt(e, TEXTE)})`;
    if (p.format === 'Ko' || p.format === 'Mo') return `formaterTaille(${this.versOpt(e, NOMBRE)}, ${chaineSwift(p.format)}${en})`;
    if (p.format) return `formaterArgent(${this.versOpt(e, NOMBRE)}, .${p.format}${en})`;
    return e.type.genre === 'texte' && !e.opt ? e.code : `texteDe(${e.code})`;
  }

  private cheminVersValeur(chemin: string): Valeur {
    const [premier, ...reste] = chemin.split('.');
    return reste.reduce<Valeur>((objet, champ) => ({ type: 'champDonnee', objet, champ }), { type: 'variable', nom: premier });
  }

  private liste(valeur: Extract<Valeur, { type: 'liste' }>, attendu?: TypeValeur): Expr {
    const deAttendu = attendu?.genre === 'liste' ? attendu.de : undefined;
    const premier = valeur.elements[0] ? this.expr(valeur.elements[0], deAttendu) : undefined;
    const de = deAttendu ?? premier?.type ?? INCONNU;
    return { code: `[${valeur.elements.map((e) => this.vers(this.expr(e, de), de)).join(', ')}]`, type: { genre: 'liste', de }, opt: false };
  }

  private fiche(valeur: Extract<Valeur, { type: 'fiche' }>, attendu?: TypeValeur): Expr {
    const type = attendu && this.types.structDe(attendu) ? attendu : ({ genre: 'fiche', champs: valeur.champs.map((c) => ({ nom: c.nom, type: this.expr(c.valeur).type })) } satisfies TypeValeur);
    const struct = this.types.structDe(type)!;
    // Les champs dans l'ordre de la déclaration : c'est l'ordre des arguments en Swift.
    const donnes = valeur.champs.flatMap((c) => {
      const champ = struct.champs.find((s) => s.cle === cleJson(c.nom));
      return champ ? [{ champ, valeur: c.valeur }] : [];
    });
    donnes.sort((a, b) => struct.champs.indexOf(a.champ) - struct.champs.indexOf(b.champ));
    return { code: `${struct.nom}(${donnes.map((d) => `${d.champ.swift}: ${this.vers(this.expr(d.valeur, d.champ.type), d.champ.type)}`).join(', ')})`, type, opt: false };
  }

  private appel(valeur: Extract<Valeur, { type: 'appel' }>): Expr {
    const fonction = this.portee.fonctions.get(valeur.nom);
    if (!fonction) {
      this.refuser(`la fonction « ${valeur.nom} », inconnue ici,`);
      return { code: 'ValeurHumalis.rien', type: INCONNU, opt: false };
    }
    const args = valeur.arguments.map((a, i) => {
      const parametre = fonction.parametres[i];
      return parametre ? `${nomSwift(parametre.nom)}: ${this.vers(this.expr(a, parametre.type), parametre.type)}` : '';
    });
    return { code: `${nomSwift(valeur.nom)}(${args.filter(Boolean).join(', ')})`, type: fonction.retour, opt: fonction.opt };
  }

  private calcul(valeur: Extract<Valeur, { type: 'calcul' }>): Expr {
    const gauche = this.expr(valeur.gauche);
    const droite = this.expr(valeur.droite);
    if (valeur.operateur === '+' && (gauche.type.genre === 'texte' || droite.type.genre === 'texte')) {
      return { code: `(${this.vers(gauche, TEXTE)} + ${this.vers(droite, TEXTE)})`, type: TEXTE, opt: false };
    }
    return { code: `(${this.vers(gauche, NOMBRE)} ${valeur.operateur} ${this.vers(droite, NOMBRE)})`, type: NOMBRE, opt: false };
  }

  private listeDeNombres(valeur: Valeur): string {
    const liste = this.listePresente(valeur);
    const de = this.elementDe(liste.type);
    return de.genre === 'nombre' ? liste.code : `${liste.code}.map { ${this.vers({ code: '$0', type: de, opt: false }, NOMBRE)} }`;
  }

  /** Une liste toujours présente ; une valeur souple est lue comme une liste de valeurs souples. */
  listePresente(valeur: Valeur): Expr {
    const e = this.expr(valeur);
    if (e.type.genre === 'liste') return { code: e.opt ? `(${e.code} ?? [])` : e.code, type: e.type, opt: false };
    if (e.type.genre === 'inconnu') return { code: `${e.opt ? `(${e.code} ?? .rien)` : e.code}.enListe`, type: { genre: 'liste', de: INCONNU }, opt: false };
    this.refuser('une liste attendue à cet endroit, qui n\'en est pas une,');
    return { code: '[ValeurHumalis]()', type: { genre: 'liste', de: INCONNU }, opt: false };
  }

  elementDe(type: TypeValeur): TypeValeur {
    return type.genre === 'liste' ? type.de : INCONNU;
  }

  /** « p.prix » : un champ d'une donnée, d'une fiche ou d'une valeur souple. */
  lireChamp(objet: Expr, nom: string): Expr {
    const point = objet.opt ? '?.' : '.';
    if (objet.type.genre === 'inconnu') {
      return { code: `${objet.opt ? `(${objet.code} ?? .rien)` : objet.code}[${chaineSwift(cleJson(nom))}]`, type: INCONNU, opt: false };
    }
    if (estFichierChoisi(objet.type)) {
      const type = objet.type.genre === 'fiche' ? (objet.type.champs.find((c) => c.nom === nom)?.type ?? TEXTE) : TEXTE;
      return { code: `${objet.code}${point}${cleJson(nom)}`, type, opt: objet.opt || nom === 'apercu' };
    }
    const champ = this.types.champ(objet.type, nom);
    if (!champ) {
      if (nom === 'id') return { code: `ValeurHumalis(${objet.code})["id"]`, type: INCONNU, opt: false };
      this.refuser(`le champ « ${nom} », inconnu sur cette valeur,`);
      return { code: 'ValeurHumalis.rien', type: INCONNU, opt: false };
    }
    return { code: `${objet.code}${point}${champ.swift}`, type: champ.type, opt: objet.opt || champ.opt };
  }

  // ─── Conditions ──────────────────────────────────────────────────────────

  /** Dans « produits dont prix est inferieur a 10 », chaque nom de champ est lu sur l'élément. */
  private testElement(test: Test, champs: string[], de: TypeValeur): string {
    const avant = new Map(this.portee.variables);
    for (const nom of champs) {
      // « dont club est egal a club » : à droite, le nom garde son sens dans la page.
      const champ = this.lireChamp({ code: '$0', type: de, opt: false }, nom);
      this.portee.variables.set(nom, champ);
    }
    const page = champs.filter((c) => avant.has(c));
    const code = this.condition(test, page.length > 0 ? avant : undefined);
    this.portee.variables.clear();
    for (const [nom, lecture] of avant) this.portee.variables.set(nom, lecture);
    return code;
  }

  /** Une condition Swift. `droitePage` : les variables de la page, pour la droite d'une comparaison dans « dont ». */
  condition(test: Test, droitePage?: Map<string, Lecture>): string {
    if (estCombine(test)) {
      const partie = (t: Test) => (estCombine(t) ? `(${this.condition(t, droitePage)})` : this.condition(t, droitePage));
      return `${partie(test.gauche)} ${test.operateur === 'et' ? '&&' : '||'} ${partie(test.droite)}`;
    }
    if (test.negation) return `!(${this.condition({ ...test, negation: false }, droitePage)})`;
    const gauche = this.expr(test.gauche);
    const lireDroite = (attendu?: TypeValeur): Expr => {
      if (!test.droite) return { code: 'nil', type: INCONNU, opt: true };
      if (!droitePage) return this.expr(test.droite, attendu);
      const ici = new Map(this.portee.variables);
      this.portee.variables.clear();
      for (const [n, l] of ici) if (!droitePage.has(n)) this.portee.variables.set(n, l);
      for (const [n, l] of droitePage) this.portee.variables.set(n, l);
      const e = this.expr(test.droite, attendu);
      this.portee.variables.clear();
      for (const [n, l] of ici) this.portee.variables.set(n, l);
      return e;
    };
    switch (test.operateur) {
      case 'dans': {
        const droite = lireDroite();
        if (droite.type.genre === 'texte') return `${this.vers(droite, TEXTE)}.contains(${this.vers(gauche, TEXTE)})`;
        const liste = droite.type.genre === 'liste' ? this.versListe(droite) : `${this.vers(droite, INCONNU)}.enListe`;
        const de = droite.type.genre === 'liste' ? droite.type.de : INCONNU;
        return `${liste}.contains(${this.vers(gauche, de)})`;
      }
      case 'vide':
        if (gauche.type.genre === 'inconnu') return `${gauche.opt ? `(${gauche.code} ?? .rien)` : gauche.code}.estVide`;
        if (gauche.type.genre === 'texte' || gauche.type.genre === 'liste') return gauche.opt ? `((${gauche.code})?.isEmpty ?? true)` : `${gauche.code}.isEmpty`;
        return gauche.opt ? `(${gauche.code} == nil)` : 'false';
      case 'vrai':
        return gauche.type.genre === 'booleen' && !gauche.opt ? gauche.code : `(${this.vers(gauche, BOOLEEN)} == true)`;
      case 'faux':
        return gauche.type.genre === 'booleen' && !gauche.opt ? `!${gauche.code}` : `(${this.vers(gauche, BOOLEEN)} == false)`;
      case 'rien':
        if (gauche.type.genre === 'inconnu') return `${gauche.opt ? `(${gauche.code} ?? .rien)` : gauche.code}.estRien`;
        return gauche.opt ? `(${gauche.code} == nil)` : 'false';
      case 'contient': {
        if (gauche.type.genre === 'liste') {
          return `${this.versListe(gauche)}.contains(${this.vers(lireDroite(gauche.type.de), gauche.type.de)})`;
        }
        // Une recherche vide trouve tout, comme sur le web : Foundation répond non pour un texte vide.
        const cherche = this.vers(lireDroite(TEXTE), TEXTE);
        return `(${cherche}.isEmpty || ${this.vers(gauche, TEXTE)}.contains(${cherche}))`;
      }
      case 'commencePar':
        return `${this.vers(gauche, TEXTE)}.hasPrefix(${this.vers(lireDroite(TEXTE), TEXTE)})`;
      case 'finitPar':
        return `${this.vers(gauche, TEXTE)}.hasSuffix(${this.vers(lireDroite(TEXTE), TEXTE)})`;
      default:
        return this.comparaison(test.operateur, gauche, lireDroite(gauche.type));
    }
  }

  private versListe(e: Expr): string {
    return e.opt ? `(${e.code} ?? [])` : e.code;
  }

  private comparaison(operateur: string, gauche: Expr, droite: Expr): string {
    const symbole: Record<string, string> = { egal: '==', different: '!=', inferieur: '<', superieur: '>', inferieurOuEgal: '<=', superieurOuEgal: '>=' };
    // Deux valeurs dont le type n'est connu qu'à l'exécution : un « plus grand que » les compare comme des nombres.
    if (!['egal', 'different'].includes(operateur) && gauche.type.genre === 'inconnu' && droite.type.genre === 'inconnu') {
      return `(${gauche.opt ? `(${gauche.code} ?? .rien)` : gauche.code}).enNombre ${symbole[operateur]} (${droite.opt ? `(${droite.code} ?? .rien)` : droite.code}).enNombre`;
    }
    const op = symbole[operateur];
    // Comparer à « rien », ou deux valeurs qui peuvent manquer : l'absence compte.
    if (droite.code === 'nil') {
      if (gauche.type.genre === 'inconnu') return `${gauche.opt ? `(${gauche.code} ?? .rien)` : gauche.code}${operateur === 'egal' ? '.estRien' : '.estPresent'}`;
      return gauche.opt ? `(${gauche.code} ${op} nil)` : operateur === 'egal' ? 'false' : 'true';
    }
    const type = gauche.type.genre === 'inconnu' ? droite.type : gauche.type;
    if (op === '==' || op === '!=') return `(${this.versOpt(gauche, type)} ${op} ${this.versOpt(droite, type)})`;
    return `(${this.vers(gauche, type)} ${op} ${this.vers(droite, type)})`;
  }
}
