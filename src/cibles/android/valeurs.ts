/**
 * Les valeurs et les conditions Humalis, en Kotlin. Une valeur est souple
 * (`Any?`) : un texte, un nombre, vrai ou faux, une liste ou une fiche. Les
 * fonctions de Valeurs.kt (`texte`, `nombre`, `champ`…) la lisent comme il faut.
 */
import type { PartieVariable, PartiesTexte, Test, Valeur } from '../../ri/types.js';
import { estCombine } from '../../ri/types.js';
import { chaineKotlin, cleJson, echapper, nomKotlin } from './noms.js';

/** Ce que les valeurs d'une page peuvent lire. */
export interface Portee {
  /** Le nom Humalis d'une variable, d'un calcul ou d'un paramètre → son code Kotlin. */
  variables: Map<string, string>;
  /** L'identifiant d'un champ → la variable Kotlin de sa saisie, et sa sorte. */
  champs: Map<string, { variable: string; sorte?: 'nombre' | 'case' }>;
  /** Les fonctions écrites en haut du fichier. */
  fonctions: Set<string>;
  /** Les variables dont la page suit l'état de requête. */
  etatsRequetes: Set<string>;
  /** Les variables « avec hors ligne » : sans réseau, elles gardent leur dernière réponse, sans message. */
  horsLigne?: Set<string>;
}

export const nomEtatRequete = (variable: string): string => `etat${nomKotlin(variable).replace(/^./, (c) => c.toUpperCase())}`;

const nombreKotlin = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));

export class Valeurs {
  constructor(
    readonly portee: Portee,
    private readonly refuser: (quoi: string) => void,
  ) {}

  /** Une valeur souple. */
  x(v: Valeur): string {
    switch (v.type) {
      case 'texte':
        return this.texteLitteral(v);
      case 'nombre':
        return nombreKotlin(v.valeur);
      case 'booleen':
        return String(v.valeur);
      case 'rien':
        return 'null';
      case 'liste':
        return `listOf<Any?>(${v.elements.map((e) => this.x(e)).join(', ')})`;
      case 'variable':
        return this.variable(v.nom);
      case 'champ': {
        const champ = this.portee.champs.get(v.id);
        if (!champ) {
          this.refuser(`le champ « ${v.id} », inconnu ici,`);
          return 'null';
        }
        return champ.sorte === 'nombre' ? `nombre(${champ.variable})` : champ.variable;
      }
      case 'calcul':
        if (v.operateur === '+') return `plus(${this.x(v.gauche)}, ${this.x(v.droite)})`;
        return `(${this.n(v.gauche)} ${v.operateur} ${this.n(v.droite)})`;
      case 'compte':
        return `longueur(${this.x(v.liste)})`;
      case 'fiche':
        return `fiche(${v.champs.map((c) => `${chaineKotlin(cleJson(c.nom))} to ${this.x(c.valeur)}`).join(', ')})`;
      case 'appel':
        if (!this.portee.fonctions.has(v.nom)) {
          this.refuser(`la fonction « ${v.nom} », inconnue ici,`);
          return 'null';
        }
        return `${nomKotlin(v.nom)}(${v.arguments.map((a) => this.x(a)).join(', ')})`;
      case 'agregat':
        return `${v.operation}(${this.x(v.liste)})`;
      case 'arrondi':
        return `arrondi(${this.x(v.valeur)}${v.chiffres ? `, ${v.chiffres}` : ''})`;
      case 'hasard':
        return `hasard(${this.x(v.minimum)}, ${this.x(v.maximum)})`;
      case 'dateDuJour':
        return v.maintenant ? 'maintenant()' : 'dateDuJour()';
      case 'dateDecalee':
        return `decalerDate(${this.t(v.date)}, ${v.signe === -1 ? '-' : ''}${this.n(v.nombre)}, ${chaineKotlin(v.unite)})`;
      case 'joursEntre':
        return `joursEntre(${this.t(v.debut)}, ${this.t(v.fin)})`;
      case 'champs':
        return `champs(${this.x(v.liste)}, ${chaineKotlin(cleJson(v.champ))})`;
      case 'filtre':
        return `liste(${this.x(v.liste)}).filter { element -> ${this.dansElement(v.champs, () => this.b(v.test))} }`;
      case 'test':
        return this.b(v.test);
      case 'tri':
        return `trier(${this.x(v.liste)}, ${v.champ ? chaineKotlin(cleJson(v.champ)) : 'null'}, ${v.decroissant}, ${v.genre === 'nombre'})`;
      case 'groupement':
        return `grouper(${this.x(v.liste)}, ${chaineKotlin(cleJson(v.champ))})`;
      case 'premier':
        return `premier(${this.x(v.liste)})`;
      case 'operationTexte':
        if (v.operation === 'longueur') return `longueur(${this.x(v.valeur)})`;
        if (v.operation === 'initiales') return `initialesDe(${this.t(v.valeur)})`;
        return `${v.operation}(${this.x(v.valeur)})`;
      case 'remplacement':
        return `remplacer(${this.x(v.cherche)}, ${this.x(v.remplace)}, ${this.x(v.dans)})`;
      case 'premiers':
        return `premiers(${this.x(v.nombre)}, ${this.x(v.liste)})`;
      case 'champDonnee':
        return `champ(${this.x(v.objet)}, ${chaineKotlin(cleJson(v.champ))})`;
      case 'utilisateur':
        if (v.etat === 'connecte') return 'Session.connecte';
        if (v.etat === 'admin') return 'Session.admin';
        return `Session.aRole(${v.etat.slice(5).split(',').map((r) => chaineKotlin(r.trim())).join(', ')})`;
      case 'etatRequete':
        return `(${nomEtatRequete(v.variable)}.statut == ${chaineKotlin(v.etat)})`;
      case 'erreurRequete':
        return `${nomEtatRequete(v.variable)}.message`;
      case 'mouvementReduit':
        return 'false';
      case 'themeSombre':
        return 'Apparence.sombre()';
    }
  }

  /** Une valeur lue comme un texte (`String`). */
  t(v: Valeur): string {
    if (v.type === 'texte') return this.texteLitteral(v);
    // Un champ de saisie est déjà un texte.
    if (v.type === 'champ' && this.portee.champs.get(v.id) && !this.portee.champs.get(v.id)!.sorte) return this.portee.champs.get(v.id)!.variable;
    return `texte(${this.x(v)})`;
  }

  /** Une valeur lue comme un nombre (`Double`). */
  n(v: Valeur): string {
    if (v.type === 'nombre') return nombreKotlin(v.valeur);
    if (v.type === 'calcul' && v.operateur !== '+') return this.x(v);
    return `nombre(${this.x(v)})`;
  }

  private variable(nom: string): string {
    const lue = this.portee.variables.get(nom);
    if (lue !== undefined) return lue;
    this.refuser(`la variable « ${nom} », inconnue ici,`);
    return 'null';
  }

  /** Un texte écrit ; avec des langues, chaque version, choisie par t() selon la langue de la personne. */
  private texteLitteral(v: Extract<Valeur, { type: 'texte' }>): string {
    if (v.versions && v.versions.length > 1) return `t(mapOf(${v.versions.map((version) => `${chaineKotlin(version.code)} to ${this.parties(version.parties, version.code)}`).join(', ')}))`;
    return this.parties(v.parties);
  }

  /** Une chaîne Kotlin : le texte écrit et les valeurs « ${…} », formatées dans la langue du texte. */
  parties(parties: PartiesTexte, langue?: string): string {
    return `"${parties.map((p) => ('texte' in p ? echapper(p.texte) : `\${${this.partie(p, langue)}}`)).join('')}"`;
  }

  private partie(p: PartieVariable, langue?: string): string {
    const valeur = p.expression ?? cheminVersValeur(p.variable);
    const x = this.x(valeur);
    const en = langue !== undefined && langue !== 'fr' ? `, ${chaineKotlin(langue)}` : '';
    const lu = (() => {
      if (p.pluriel) return `accorder(nombre(${x}), ${chaineKotlin(p.pluriel)}${en})`;
      switch (p.format) {
        case 'lettres':
          return `formaterEnLettres(nombre(${x})${en})`;
        case 'dateLongue':
          return `formaterDateLongue(texte(${x})${en})`;
        case 'date':
          return `formaterDate(texte(${x})${en})`;
        case 'nombre':
          return `formaterNombre(nombre(${x})${en})`;
        case 'depuis':
          return `formaterDepuis(texte(${x}))`;
        case 'Ko':
        case 'Mo':
          return `formaterTaille(nombre(${x}), ${chaineKotlin(p.format)}${en})`;
        case 'FC':
        case 'EUR':
        case 'USD':
          return `formaterArgent(nombre(${x}), ${chaineKotlin(p.format)}${en})`;
        default:
          return `texte(${x})`;
      }
    })();
    return p.majuscule ? `avecMajuscule(${lu}${en})` : lu;
  }

  /** Dans « produits dont prix est inferieur a 10 », chaque nom de champ est lu sur l'élément. */
  private dansElement(champs: string[], ecrire: () => string): string {
    const avant = new Map(this.portee.variables);
    for (const nom of champs) this.portee.variables.set(nom, `champ(element, ${chaineKotlin(cleJson(nom))})`);
    const code = ecrire();
    this.portee.variables.clear();
    for (const [nom, lecture] of avant) this.portee.variables.set(nom, lecture);
    return code;
  }

  /** Une condition (`Boolean`). */
  b(test: Test): string {
    if (estCombine(test)) {
      const partie = (t: Test) => (estCombine(t) ? `(${this.b(t)})` : this.b(t));
      return `${partie(test.gauche)} ${test.operateur === 'et' ? '&&' : '||'} ${partie(test.droite)}`;
    }
    if (test.negation) return `!(${this.b({ ...test, negation: false })})`;
    const g = this.x(test.gauche);
    const d = test.droite ? this.x(test.droite) : 'null';
    switch (test.operateur) {
      case 'dans':
        return `contient(${d}, ${g})`;
      case 'contient':
        return `contient(${g}, ${d})`;
      case 'vide':
        return `estVide(${g})`;
      case 'vrai':
        // Ce qui vaut déjà vrai ou faux n'a pas besoin d'être converti.
        return ['booleen', 'utilisateur', 'etatRequete', 'test', 'themeSombre', 'mouvementReduit'].includes(test.gauche.type) ? g : `vrai(${g})`;
      case 'faux':
        return `!vrai(${g})`;
      case 'rien':
        return `(${g} == null)`;
      case 'commencePar':
        return `texte(${g}).startsWith(texte(${d}))`;
      case 'finitPar':
        return `texte(${g}).endsWith(texte(${d}))`;
      case 'egal':
        return d === 'null' ? `(${g} == null)` : `egal(${g}, ${d})`;
      case 'different':
        return d === 'null' ? `(${g} != null)` : `!egal(${g}, ${d})`;
      case 'inferieur':
        return `(comparer(${g}, ${d}) < 0)`;
      case 'superieur':
        return `(comparer(${g}, ${d}) > 0)`;
      case 'inferieurOuEgal':
        return `(comparer(${g}, ${d}) <= 0)`;
      case 'superieurOuEgal':
        return `(comparer(${g}, ${d}) >= 0)`;
    }
  }
}

/** « p.prix » écrit dans un texte : la variable, puis chaque champ. */
export function cheminVersValeur(chemin: string): Valeur {
  const [premier, ...reste] = chemin.split('.');
  return reste.reduce<Valeur>((objet, champ) => ({ type: 'champDonnee', objet, champ }), { type: 'variable', nom: premier });
}
