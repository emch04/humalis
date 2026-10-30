/**
 * Les valeurs de la cible statique, traduites deux fois, côte à côte :
 *
 * - en **expression JavaScript**, pour le script de la page (`dessiner()`
 *   et les événements) ;
 * - en **valeur calculée à la compilation**, pour le contenu de départ
 *   écrit dans le HTML (décision T2).
 *
 * Les deux suivent les mêmes règles que JavaScript (`===`, `+`, gabarits),
 * pour que le HTML de départ et le premier dessin soient identiques.
 */
import { estCombine, type Valeur, type Test, type TypeValeur, type Action, type FonctionRI, type PartiesTexte } from '../../ri/types.js';
import { camel, chaine } from '../web/noms.js';
import { typeDe, dateEnCode, combiner, aParentheser, calculDeListe, operationDeListe, operationDeTexte, habillage } from '../web/valeurs.js';
import { formaterDate, formaterNombre, formaterArgent, formaterTaille, accorder } from '../format.js';

/**
 * Les noms que le script d'une page ne peut pas prendre : ceux du
 * navigateur qu'il utilise (et que `let` ne peut pas cacher), et ceux des
 * outils Humalis (humalis.js, et les fonctions de chaque page).
 */
const PRIS = new Set([
  'document', 'window', 'location', 'history', 'navigator', 'console', 'self', 'top', 'parent', 'frames',
  'localStorage', 'sessionStorage', 'fetch', 'setTimeout', 'clearTimeout', 'addEventListener',
  'JSON', 'Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Promise', 'Error', 'CSS',
  'humalis', 'creer', 'demarrer', 'afficherMessage', 'retirerPremier', 'formaterNombre', 'formaterDate', 'formaterArgent', 'formaterTaille', 'accorder', 'adresseDe', 'dateDuJour', 'maintenant', 'decalerDate', 'joursEntre', 'formaterDepuis',
  'lirePartage', 'garderPartage', 'lireMemoire', 'garderMemoire', 'serveur', 'utilisateur',
  'dessiner', 'relire', 'garder', 'auChargement', 'visibilite', 'textes', 'evenement', 'motDePasseSaisi',
]);

/** « nombre_articles » → « nombreArticles » ; un nom déjà pris reçoit un « _ ». */
export function nomJs(nom: string): string {
  const resultat = camel(nom);
  return PRIS.has(resultat) ? `${resultat}_` : resultat;
}

/** Ce qu'il faut savoir pour écrire une expression. */
export interface ContexteJs {
  types: Map<string, TypeValeur>;
  /** Pour chaque identifiant de champ : sa variable (« champEmail »). */
  champs: Map<string, string>;
  /** Les « calcul x = … », écrits comme des fonctions : `x()`. */
  calculs: Set<string>;
  /** Les variables « = rien », qui n'ont pas encore de valeur : on y lit un champ avec « ?. ». */
  facultatives?: Set<string>;
  /** Les champs nombre et les cases à cocher : leur valeur n'est pas un texte. */
  sortes?: Map<string, 'nombre' | 'case'>;
  /** Dans la condition d'un « dont » : les champs de chaque élément (« prix » → « element.prix »). */
  renommes?: Map<string, string>;
  /** Le site a plusieurs langues : « langue » est la langue courante (humalis.js). */
  langues?: boolean;
}

/** Un texte et ses « {…} » en JavaScript ; `langue` est celle d'une version (« en »). */
function texteJs(parties: PartiesTexte, contexte: ContexteJs, langue?: string): string {
  if (parties.every((p) => 'texte' in p)) {
    return chaine(parties.map((p) => ('texte' in p ? p.texte : '')).join(''));
  }
  const morceaux = parties.map((p) => {
    if ('texte' in p) return p.texte.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    const [premier, ...reste] = p.variable.split('.');
    // Le format français (décision F1) : « 28 000 », « 7 novembre 2026 ».
    const formater = 'variable' in p ? habillage(p, langue) : undefined;
    // Une variable « = rien » pas encore lue : rien ne s'affiche à la place du champ.
    if (reste.length > 0 && contexte.facultatives?.has(premier)) {
      const champ = `${nomJs(premier)}?.${reste.map(camel).join('.')}`;
      return formater ? `\${${formater(champ)}}` : `\${${champ} ?? ''}`;
    }
    if (formater) return `\${${formater(chemin(p.variable, contexte))}}`;
    const type = contexte.types.get(p.variable);
    return type?.genre === 'liste' ? `\${${chemin(p.variable, contexte)}.join(', ')}` : `\${${chemin(p.variable, contexte)}}`;
  });
  return `\`${morceaux.join('')}\``;
}

const contexteTypes = (contexte: ContexteJs) => ({ types: contexte.types, champs: contexte.champs, sortes: contexte.sortes });

/** « p.prix » : le premier morceau est une variable (ou un calcul), les suivants des champs. */
function chemin(variable: string, contexte: ContexteJs): string {
  const [premier, ...champs] = variable.split('.');
  const renomme = contexte.renommes?.get(premier);
  const debut = renomme ?? (contexte.calculs.has(premier) ? `${nomJs(premier)}()` : nomJs(premier));
  return [debut, ...champs.map(camel)].join('.');
}

/** Une expression JavaScript. */
export function expressionJs(valeur: Valeur, contexte: ContexteJs): string {
  switch (valeur.type) {
    case 'texte':
      // Un texte en plusieurs langues : t({ fr: '…', en: '…' }) choisit selon la langue de la personne.
      if (valeur.versions) {
        return `t({ ${valeur.versions.map((v, i) => `${v.code}: ${texteJs(v.parties, contexte, i === 0 ? undefined : v.code)}`).join(', ')} })`;
      }
      return texteJs(valeur.parties, contexte);
    case 'nombre':
    case 'booleen':
      return String(valeur.valeur);
    case 'liste':
      return `[${valeur.elements.map((e) => expressionJs(e, contexte)).join(', ')}]`;
    case 'variable':
      // « si langue est anglais » : la langue courante, lue dans humalis.js.
      if (contexte.langues && valeur.nom === 'langue') return 'langue()';
      return chemin(valeur.nom, contexte);
    case 'champ': {
      const variable = contexte.champs.get(valeur.id) ?? nomJs(valeur.id);
      // L'état d'un champ nombre est le texte écrit ; sa valeur, ce nombre (la virgule vaut un point).
      return contexte.sortes?.get(valeur.id) === 'nombre' ? `Number(${variable}.replace(',', '.'))` : variable;
    }
    case 'calcul': {
      const membre = (v: Valeur) => (aParentheser(v) ? `(${expressionJs(v, contexte)})` : expressionJs(v, contexte));
      return `${membre(valeur.gauche)} ${valeur.operateur} ${membre(valeur.droite)}`;
    }
    case 'compte':
      return `${expressionJs(valeur.liste, contexte)}.length`;
    case 'fiche':
      return `{ ${valeur.champs.map((c) => `${camel(c.nom)}: ${expressionJs(c.valeur, contexte)}`).join(', ')} }`;
    case 'appel':
      return `${nomJs(valeur.nom)}(${valeur.arguments.map((a) => expressionJs(a, contexte)).join(', ')})`;
    case 'agregat':
    case 'arrondi':
    case 'hasard':
    case 'champs':
      return calculDeListe(valeur, (v) => expressionJs(v, contexte));
    case 'dateDuJour':
    case 'dateDecalee':
    case 'joursEntre':
      return dateEnCode(valeur, (v) => expressionJs(v, contexte));
    case 'operationTexte':
    case 'remplacement':
      return operationDeTexte(valeur, (v) => expressionJs(v, contexte));
    case 'groupement':
      return `grouper(${expressionJs(valeur.liste, contexte)}, (element) => element.${camel(valeur.champ)})`;
    case 'filtre':
    case 'tri':
    case 'premier':
    case 'premiers':
      return operationDeListe(valeur, (v) => expressionJs(v, contexte), (test, champs) => {
        const avant = contexte.renommes;
        contexte.renommes = new Map([...(avant ?? []), ...champs.map((c): [string, string] => [c, `element.${camel(c)}`])]);
        const texte = conditionJs(test, contexte);
        contexte.renommes = avant;
        return texte;
      });
    case 'champDonnee': {
      const facultatif = valeur.objet.type === 'variable' && contexte.facultatives?.has(valeur.objet.nom);
      return `${expressionJs(valeur.objet, contexte)}${facultatif ? '?.' : '.'}${camel(valeur.champ)}`;
    }
    case 'rien':
      return 'null';
    case 'utilisateur':
      // Lu sur la session (humalis.js), jamais gardé par la page.
      return `utilisateur.${valeur.etat}`;
    case 'mouvementReduit':
      // « réduire les animations » du système (humalis.js), relu à chaque dessin.
      return 'mouvementReduit()';
    case 'etatRequete':
    case 'erreurRequete':
      // Les sources ne sont pas encore produites pour le site statique : l'analyse de la cible les refuse avant.
      return 'null';
  }
}

/** Le contenu d'un élément : un texte, ou une expression qui devient un texte. */
export function contenuJs(valeur: Valeur, contexte: ContexteJs): string {
  const x = expressionJs(valeur, contexte);
  const type = typeDe(valeur, contexteTypes(contexte));
  if (type.genre === 'liste') return `${x}.join(', ')`;
  if (type.genre === 'booleen') return `String(${x})`;
  return x;
}

const OPERATEURS: Record<string, string> = {
  egal: '===',
  different: '!==',
  inferieur: '<',
  superieur: '>',
  inferieurOuEgal: '<=',
  superieurOuEgal: '>=',
};

/** Une condition JavaScript. */
export function conditionJs(test: Test, contexte: ContexteJs): string {
  if (estCombine(test)) return combiner(test, (t) => conditionJs(t, contexte));
  if (test.negation) return `!(${conditionJs({ ...test, negation: false }, contexte)})`;
  const gauche = expressionJs(test.gauche, contexte);
  const booleen = typeDe(test.gauche, contexteTypes(contexte)).genre === 'booleen';
  switch (test.operateur) {
    case 'dans':
      return `${expressionJs(test.droite!, contexte)}.includes(${gauche})`;
    case 'vide':
      return `${gauche}.length === 0`;
    case 'vrai':
      return booleen ? gauche : `${gauche} === true`;
    case 'faux':
      return booleen ? `!${gauche}` : `${gauche} === false`;
    case 'rien':
      return `${gauche} === null`;
    case 'contient':
      return `${gauche}.includes(${expressionJs(test.droite!, contexte)})`;
    case 'commencePar':
      return `${gauche}.startsWith(${expressionJs(test.droite!, contexte)})`;
    case 'finitPar':
      return `${gauche}.endsWith(${expressionJs(test.droite!, contexte)})`;
    default:
      return `${gauche} ${OPERATEURS[test.operateur]} ${expressionJs(test.droite!, contexte)}`;
  }
}

// ─── Les mêmes valeurs, calculées à la compilation ─────────────────────────

/**
 * Les valeurs connues à la compilation : celles de départ. Un champ est
 * vide, personne n'est connecté, rien n'est encore venu du serveur.
 */
export class Environnement {
  private readonly valeurs = new Map<string, unknown>();
  private readonly calculs = new Map<string, Valeur>();

  constructor(
    readonly types: Map<string, TypeValeur>,
    private readonly parent?: Environnement,
  ) {}

  definir(nom: string, valeur: unknown): this {
    this.valeurs.set(nom, valeur);
    return this;
  }

  definirCalcul(nom: string, valeur: Valeur): this {
    this.calculs.set(nom, valeur);
    return this;
  }

  enfant(): Environnement {
    return new Environnement(this.types, this);
  }

  /** « changer x par … » : la variable est changée là où elle est déclarée. */
  changer(nom: string, valeur: unknown): void {
    if (this.valeurs.has(nom) || !this.parent) this.valeurs.set(nom, valeur);
    else this.parent.changer(nom, valeur);
  }

  lire(nom: string): unknown {
    if (this.valeurs.has(nom)) return this.valeurs.get(nom);
    const calcul = this.calculs.get(nom);
    if (calcul) return evaluer(calcul, this);
    return this.parent?.lire(nom);
  }
}

function lireChemin(variable: string, env: Environnement): unknown {
  const [premier, ...champs] = variable.split('.');
  let valeur = env.lire(premier);
  for (const champ of champs) valeur = valeur == null ? undefined : (valeur as Record<string, unknown>)[camel(champ)];
  return valeur;
}

/** La valeur, telle que JavaScript la calculerait au premier dessin. */
export function evaluer(valeur: Valeur, env: Environnement): unknown {
  switch (valeur.type) {
    case 'texte':
      return valeur.parties
        .map((p) => {
          if ('texte' in p) return p.texte;
          const v = lireChemin(p.variable, env);
          // Le même format que le script : le HTML de départ et le premier dessin sont identiques.
          if (p.pluriel) return accorder(v as number | null | undefined, p.pluriel);
          if (p.format === 'nombre') return formaterNombre(v as number | null | undefined);
          if (p.format === 'date') return v === '' ? '' : formaterDate(v as string | null | undefined);
          if (p.format === 'depuis') return '';
          if (p.format === 'Ko' || p.format === 'Mo') return formaterTaille(v as number | null | undefined, p.format);
          if (p.format) return formaterArgent(v as number | null | undefined, p.format);
          // Le champ d'une variable « = rien » encore vide : `?? ''` dans le script, rien ici non plus.
          if (p.variable.includes('.') && env.lire(p.variable.split('.')[0]) === null) return '';
          return env.types.get(p.variable)?.genre === 'liste' && Array.isArray(v) ? v.join(', ') : String(v);
        })
        .join('');
    case 'nombre':
    case 'booleen':
      return valeur.valeur;
    case 'liste':
      return valeur.elements.map((e) => evaluer(e, env));
    case 'variable':
      return lireChemin(valeur.nom, env);
    case 'champ':
      return '';
    case 'calcul': {
      const g = evaluer(valeur.gauche, env) as number;
      const d = evaluer(valeur.droite, env) as number;
      switch (valeur.operateur) {
        case '+':
          return g + d;
        case '-':
          return g - d;
        case '*':
          return g * d;
        case '/':
          return g / d;
      }
      break;
    }
    case 'compte':
      return (evaluer(valeur.liste, env) as unknown[]).length;
    case 'fiche':
      return Object.fromEntries(valeur.champs.map((c) => [camel(c.nom), evaluer(c.valeur, env)]));
    case 'appel':
      return appeler(valeur.nom, valeur.arguments.map((a) => evaluer(a, env)));
    case 'champs': {
      const liste = evaluer(valeur.liste, env);
      return Array.isArray(liste) ? liste.map((e) => (e as Record<string, unknown>)[camel(valeur.champ)]) : [];
    }
    case 'agregat': {
      const liste = (evaluer(valeur.liste, env) as number[]) ?? [];
      if (valeur.operation === 'minimum') return Math.min(...liste);
      if (valeur.operation === 'maximum') return Math.max(...liste);
      const somme = liste.reduce((s, n) => s + n, 0);
      return valeur.operation === 'somme' ? somme : somme / liste.length;
    }
    case 'arrondi': {
      const facteur = 10 ** (valeur.chiffres ?? 0);
      return Math.round((evaluer(valeur.valeur, env) as number) * facteur) / facteur;
    }
    // Les dates ne sont pas figées dans le HTML de départ : le script les calcule au chargement.
    case 'dateDuJour':
    case 'dateDecalee':
    case 'joursEntre':
      return '';
    case 'hasard':
      // Au hasard : le HTML de départ montre la plus petite valeur, le script tire au sort.
      return evaluer(valeur.minimum, env);
    case 'filtre': {
      const liste = evaluer(valeur.liste, env);
      return (Array.isArray(liste) ? liste : []).filter((element) => verifierElement(valeur.test, valeur.champs, element, env));
    }
    case 'premier': {
      if (valeur.liste.type === 'filtre') {
        const filtre = valeur.liste;
        const liste = evaluer(filtre.liste, env);
        return (Array.isArray(liste) ? liste : []).find((element) => verifierElement(filtre.test, filtre.champs, element, env)) ?? null;
      }
      const liste = evaluer(valeur.liste, env);
      return Array.isArray(liste) ? (liste[0] ?? null) : null;
    }
    case 'premiers': {
      const liste = evaluer(valeur.liste, env);
      return Array.isArray(liste) ? liste.slice(0, Number(evaluer(valeur.nombre, env))) : [];
    }
    case 'operationTexte': {
      const texte = String(evaluer(valeur.valeur, env) ?? '');
      return valeur.operation === 'majuscules'
        ? texte.toLocaleUpperCase('fr')
        : valeur.operation === 'minuscules'
          ? texte.toLocaleLowerCase('fr')
          : texte.length;
    }
    case 'remplacement':
      return String(evaluer(valeur.dans, env) ?? '').replaceAll(String(evaluer(valeur.cherche, env)), String(evaluer(valeur.remplace, env)));
    case 'groupement': {
      // Comme l'outil grouper du site : un groupe par valeur, dans l'ordre d'apparition.
      const groupes: { nom: unknown; elements: unknown[] }[] = [];
      const liste = evaluer(valeur.liste, env);
      for (const element of Array.isArray(liste) ? liste : []) {
        const nom = (element as Record<string, unknown>)[camel(valeur.champ)];
        const groupe = groupes.find((g) => g.nom === nom);
        if (groupe) groupe.elements.push(element);
        else groupes.push({ nom, elements: [element] });
      }
      return groupes;
    }
    case 'tri': {
      const liste = evaluer(valeur.liste, env);
      const lu = (e: unknown) => (valeur.champ !== undefined ? (e as Record<string, unknown>)[camel(valeur.champ)] : e);
      const signe = valeur.decroissant ? -1 : 1;
      return [...(Array.isArray(liste) ? liste : [])].sort(
        (x, y) =>
          signe *
          (valeur.genre === 'texte' ? String(lu(x)).localeCompare(String(lu(y)), 'fr') : (lu(x) as number) - (lu(y) as number)),
      );
    }
    case 'champDonnee': {
      const objet = evaluer(valeur.objet, env) as Record<string, unknown> | null | undefined;
      return objet == null ? undefined : objet[camel(valeur.champ)];
    }
    case 'utilisateur':
    case 'etatRequete':
    // Le HTML de départ n'écrit aucun mouvement.
    case 'mouvementReduit':
      return false;
    case 'erreurRequete':
      return '';
    case 'rien':
      return null;
  }
}

/** Le contenu d'un élément, en texte (comme `contenuJs` puis `String`). */
export function texteDe(valeur: Valeur, env: Environnement, champs: Map<string, string>): string {
  const v = evaluer(valeur, env);
  const type = typeDe(valeur, { types: env.types, champs });
  if (type.genre === 'liste' && Array.isArray(v)) return v.join(', ');
  return String(v);
}

/** Le test, calculé comme le ferait JavaScript. */
export function verifier(test: Test, env: Environnement, champs: Map<string, string>): boolean {
  if (!estCombine(test) && test.negation) return !verifier({ ...test, negation: false }, env, champs);
  if (estCombine(test)) {
    return test.operateur === 'et' ? verifier(test.gauche, env, champs) && verifier(test.droite, env, champs) : verifier(test.gauche, env, champs) || verifier(test.droite, env, champs);
  }
  const gauche = evaluer(test.gauche, env);
  const booleen = typeDe(test.gauche, { types: env.types, champs }).genre === 'booleen';
  switch (test.operateur) {
    case 'dans':
      return (evaluer(test.droite!, env) as unknown[]).includes(gauche);
    case 'vide':
      return (gauche as unknown[]).length === 0;
    case 'vrai':
      return booleen ? Boolean(gauche) : gauche === true;
    case 'faux':
      return booleen ? !gauche : gauche === false;
    case 'rien':
      return gauche === null;
    case 'contient': {
      const droite = evaluer(test.droite!, env);
      return Array.isArray(gauche) || typeof gauche === 'string' ? (gauche as unknown[]).includes(droite) : false;
    }
    case 'commencePar':
      return String(gauche).startsWith(String(evaluer(test.droite!, env)));
    case 'finitPar':
      return String(gauche).endsWith(String(evaluer(test.droite!, env)));
    default: {
      const droite = evaluer(test.droite!, env) as number;
      const g = gauche as number;
      switch (test.operateur) {
        case 'egal':
          return g === droite;
        case 'different':
          return g !== droite;
        case 'inferieur':
          return g < droite;
        case 'superieur':
          return g > droite;
        case 'inferieurOuEgal':
          return g <= droite;
        case 'superieurOuEgal':
          return g >= droite;
      }
    }
  }
}

// ─── Les fonctions, calculées à la compilation (HTML de départ) ─────────────

const fonctionsConnues = new Map<string, FonctionRI>();

/** Les fonctions de l'application, pour calculer leurs appels dans le HTML de départ. */
export function connaitreFonctions(fonctions: FonctionRI[]): void {
  fonctionsConnues.clear();
  for (const f of fonctions) fonctionsConnues.set(f.nom, f);
}

/** L'appel d'une fonction, comme le navigateur le ferait ; `undefined` si elle fait autre chose que calculer. */
function appeler(nom: string, valeurs: unknown[]): unknown {
  const fonction = fonctionsConnues.get(nom);
  if (!fonction) return undefined;
  const env = new Environnement(new Map(fonction.parametres.map((p) => [p.nom, p.type])));
  fonction.parametres.forEach((p, i) => env.definir(p.nom, valeurs[i]));
  const fin = executer(fonction.corps, env);
  return typeof fin === 'object' ? fin.valeur : undefined;
}

/** Ce qui interrompt une suite d'actions : une valeur rendue, ou la sortie d'une boucle. */
type Interruption = { valeur: unknown } | 'arreter' | 'passer' | 'impossible';

/** Un tour de boucle en trop : la boucle ne s'arrête pas, le HTML de départ ne la calcule pas. */
const TOURS_MAXIMUM = 100_000;

/** Exécute des actions de calcul ; s'interrompt sur « rendre », « arreter », « passer au suivant ». */
function executer(actions: Action[], env: Environnement): Interruption | undefined {
  for (const action of actions) {
    switch (action.type) {
      case 'rendre':
        return { valeur: evaluer(action.valeur, env) };
      case 'arreter':
        return 'arreter';
      case 'passer':
        return 'passer';
      case 'locale':
        env.definir(action.nom, evaluer(action.valeur, env));
        break;
      case 'affectation': {
        const valeur = evaluer(action.valeur, env);
        if (!action.champs) {
          env.changer(action.nom, valeur);
          break;
        }
        const avec = (objet: unknown, champs: string[]): unknown => {
          const [premier, ...reste] = champs;
          const copie = { ...(objet as Record<string, unknown>) };
          copie[camel(premier)] = reste.length > 0 ? avec(copie[camel(premier)], reste) : valeur;
          return copie;
        };
        env.changer(action.nom, avec(env.lire(action.nom), action.champs));
        break;
      }
      case 'si': {
        const fin = executer(verifier(action.test, env, new Map()) ? action.alors : action.sinon, env.enfant());
        if (fin) return fin;
        break;
      }
      case 'selon': {
        const valeur = evaluer(action.valeur, env);
        const cas = action.cas.find((c) => c.valeurs.some((v) => evaluer(v, env) === valeur));
        const fin = executer(cas ? cas.corps : action.sinon, env.enfant());
        if (fin) return fin;
        break;
      }
      case 'repetition':
      case 'repeter':
      case 'tantQue': {
        const liste = action.type === 'repetition' ? evaluer(action.liste, env) : undefined;
        const elements = action.type === 'repetition' ? (Array.isArray(liste) ? liste : []) : undefined;
        for (let tour = 0; ; tour++) {
          if (tour >= TOURS_MAXIMUM) return 'impossible';
          if (action.type === 'repetition' && tour >= elements!.length) break;
          if (action.type === 'repeter' && tour >= Number(evaluer(action.fois, env))) break;
          if (action.type === 'tantQue' && !verifier(action.test, env, new Map())) break;
          const tourEnv = env.enfant();
          if (action.type === 'repetition') tourEnv.definir(action.variable, elements![tour]);
          const fin = executer(action.corps, tourEnv);
          if (fin === 'arreter') break;
          if (fin === 'passer') continue;
          if (fin) return fin;
        }
        break;
      }
      case 'ajout':
        env.changer(action.liste, [...((env.lire(action.liste) as unknown[]) ?? []), evaluer(action.valeur, env)]);
        break;
      default:
        // Une action qui n'est pas un calcul : le HTML de départ ne la prévoit pas.
        return 'impossible';
    }
  }
  return undefined;
}

/** La condition d'un « dont » pour un élément : ses champs se lisent par leur nom. */
function verifierElement(test: Test, champs: string[], element: unknown, env: Environnement): boolean {
  const dedans = env.enfant();
  for (const c of champs) dedans.definir(c, (element as Record<string, unknown>)[camel(c)]);
  return verifier(test, dedans, new Map());
}
