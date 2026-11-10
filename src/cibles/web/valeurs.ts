import { estCombine, type Valeur, type Test, type TestCombine, type TypeValeur, type PartieVariable, type PartiesTexte } from '../../ri/types.js';
import { camel, chaine, pascal } from './noms.js';

/** Ce qu'il faut savoir pour traduire une valeur : les types et les champs visibles. */
export interface Contexte {
  types: Map<string, TypeValeur>;
  /** Pour chaque identifiant de champ : le nom de sa variable d'état. */
  champs: Map<string, string>;
  /** Les variables qui peuvent ne pas encore avoir de valeur (« = rien ») : on y lit un champ avec « ?. ». */
  facultatives?: Set<string>;
  /** Les champs nombre et les cases à cocher : leur valeur n'est pas un texte. */
  sortes?: Map<string, 'nombre' | 'case'>;
  /**
   * Dans un événement qui change plusieurs fois une variable d'état (ou dans
   * une boucle) : la copie locale à jour qu'il lit (« panier » → « panierMaj »).
   */
  renommes?: Map<string, string>;
  /** Les filtres d'adresse de la page (« ?recherche=… ») : absents de l'adresse, ils valent null. */
  filtresAdresse?: Set<string>;
}

/** Le nom à lire pour une variable : sa copie à jour dans l'événement, sinon son nom. */
const nomLu = (nom: string, contexte: Contexte) => contexte.renommes?.get(nom) ?? camel(nom);

/** Le type TypeScript d'un type Humalis. Un type inconnu vient du serveur : `any`. */
export function typeTS(type: TypeValeur): string {
  switch (type.genre) {
    case 'texte':
      return 'string';
    case 'nombre':
      return 'number';
    case 'booleen':
      return 'boolean';
    case 'liste':
      return `${typeTS(type.de)}[]`;
    case 'donnee':
      // L'interface produite dans src/humalis/donnees.ts.
      return pascal(type.nom);
    case 'fiche':
      return `{ ${type.champs.map((c) => `${camel(c.nom)}: ${typeTS(c.type)}`).join('; ')} }`;
    case 'inconnu':
      return 'any';
  }
}

export function typeDe(valeur: Valeur, contexte: Contexte): TypeValeur {
  switch (valeur.type) {
    case 'test':
      return { genre: 'booleen' };
    case 'champ': {
      const sorte = contexte.sortes?.get(valeur.id);
      return sorte === 'nombre' ? { genre: 'nombre' } : sorte === 'case' ? { genre: 'booleen' } : { genre: 'texte' };
    }
    case 'texte':
      return { genre: 'texte' };
    case 'nombre':
    case 'calcul':
    case 'compte':
      return { genre: 'nombre' };
    case 'booleen':
    case 'utilisateur':
    case 'etatRequete':
    case 'mouvementReduit':
    case 'themeSombre':
      return { genre: 'booleen' };
    case 'erreurRequete':
      return { genre: 'texte' };
    case 'liste':
      return { genre: 'liste', de: valeur.elements[0] ? typeDe(valeur.elements[0], contexte) : { genre: 'inconnu' } };
    case 'variable':
      return contexte.types.get(valeur.nom) ?? { genre: 'inconnu' };
    case 'fiche':
      return { genre: 'fiche', champs: valeur.champs.map((c) => ({ nom: c.nom, type: typeDe(c.valeur, contexte) })) };
    case 'agregat':
    case 'arrondi':
    case 'hasard':
    case 'joursEntre':
      return { genre: 'nombre' };
    case 'dateDuJour':
    case 'dateDecalee':
      return { genre: 'texte' };
    case 'champs':
    case 'filtre':
    case 'tri':
    case 'premiers':
    case 'groupement':
      return { genre: 'liste', de: { genre: 'inconnu' } };
    case 'premier':
      return { genre: 'inconnu' };
    case 'operationTexte':
      return valeur.operation === 'longueur' ? { genre: 'nombre' } : { genre: 'texte' };
    case 'remplacement':
      return { genre: 'texte' };
    case 'appel':
    case 'champDonnee':
    case 'rien':
      return { genre: 'inconnu' };
  }
}

/** « changer client.adresse.rue par v » : la fiche recopiée, le champ visé changé (`{ ...client, adresse: { ...client.adresse, rue: v } }`). */
export function ficheAvec(base: string, champs: string[], valeur: string): string {
  const [premier, ...reste] = champs;
  const nom = camel(premier);
  return `{ ...${base}, ${nom}: ${reste.length > 0 ? ficheAvec(`${base}.${nom}`, reste, valeur) : valeur} }`;
}

/** Une expression TypeScript. */
export function expression(valeur: Valeur, contexte: Contexte): string {
  switch (valeur.type) {
    case 'test':
      return `(${condition(valeur.test, contexte)})`;
    case 'texte': {
      // Un texte en plusieurs langues : t({ fr: '…', en: '…' }) choisit selon la langue de la personne.
      if (valeur.versions) {
        return `t({ ${valeur.versions.map((v, i) => `${v.code}: ${texteTS(v.parties, contexte, i === 0 ? undefined : v.code)}`).join(', ')} })`;
      }
      return texteTS(valeur.parties, contexte);
    }
    case 'nombre':
      return String(valeur.valeur);
    case 'booleen':
      return String(valeur.valeur);
    case 'liste':
      return `[${valeur.elements.map((e) => expression(e, contexte)).join(', ')}]`;
    case 'variable':
      return nomLu(valeur.nom, contexte);
    case 'champ': {
      const variable = contexte.champs.get(valeur.id) ?? camel(valeur.id);
      // L'état d'un champ nombre est le texte écrit ; sa valeur, ce nombre (la virgule vaut un point).
      return contexte.sortes?.get(valeur.id) === 'nombre' ? `Number(${variable}.replace(',', '.'))` : variable;
    }
    case 'calcul': {
      // Un champ d'une donnée pas encore chargée (« produit?.prix ») compte pour 0 dans un calcul.
      const facultatif = (v: Valeur) => v.type === 'champDonnee' && v.objet.type === 'variable' && contexte.facultatives?.has(v.objet.nom);
      const membre = (v: Valeur) => (facultatif(v) ? `(${expression(v, contexte)} ?? 0)` : aParentheser(v) ? `(${expression(v, contexte)})` : expression(v, contexte));
      return `${membre(valeur.gauche)} ${valeur.operateur} ${membre(valeur.droite)}`;
    }
    case 'compte':
      return `${expression(valeur.liste, contexte)}.length`;
    case 'fiche':
      return `{ ${valeur.champs.map((c) => `${camel(c.nom)}: ${expression(c.valeur, contexte)}`).join(', ')} }`;
    case 'appel':
      return `${camel(valeur.nom)}(${valeur.arguments.map((a) => expression(a, contexte)).join(', ')})`;
    case 'agregat':
    case 'arrondi':
    case 'hasard':
    case 'champs':
      return calculDeListe(valeur, (v) => expression(v, contexte));
    case 'dateDuJour':
    case 'dateDecalee':
    case 'joursEntre':
      return dateEnCode(valeur, (v) => expression(v, contexte));
    case 'operationTexte':
    case 'remplacement':
      // Un filtre absent de l'adresse (null) compte comme un texte vide : « minuscules de recherche ».
      return operationDeTexte(valeur, (v) =>
        v.type === 'variable' && contexte.filtresAdresse?.has(v.nom) ? `(${expression(v, contexte)} ?? '')` : expression(v, contexte),
      );
    case 'groupement':
      return `grouper(${expression(valeur.liste, contexte)}, (element) => element.${camel(valeur.champ)})`;
    case 'filtre':
    case 'tri':
    case 'premier':
    case 'premiers':
      return operationDeListe(valeur, (v) => expression(v, contexte), (test, champs) => {
        // Dans la condition, les noms des champs désignent ceux de chaque élément.
        const avant = contexte.renommes;
        const tous = new Map([...(avant ?? []), ...champs.map((c): [string, string] => [c, `element.${camel(c)}`])]);
        // Un champ qui porte le nom d'une variable de la page (« club ») : à droite d'une comparaison, c'est la variable.
        const ambigus = champs.filter((c) => contexte.types.has(c));
        const droite = ambigus.length ? new Map([...tous].filter(([nom]) => !ambigus.includes(nom))) : undefined;
        contexte.renommes = tous;
        const texte = condition(test, contexte, droite);
        contexte.renommes = avant;
        return texte;
      });
    case 'champDonnee': {
      const facultatif = valeur.objet.type === 'variable' && contexte.facultatives?.has(valeur.objet.nom);
      return `${expression(valeur.objet, contexte)}${facultatif ? '?.' : '.'}${camel(valeur.champ)}`;
    }
    case 'rien':
      return 'null';
    case 'utilisateur':
      // Lu sur la session (src/humalis/session.tsx), jamais gardé par la page.
      return valeur.etat.startsWith('role:') ? `(utilisateur.personne?.role === '${valeur.etat.slice(5)}')` : `utilisateur.${valeur.etat}`;
    case 'mouvementReduit':
      // « réduire les animations » du système, suivi en direct (src/humalis/temps.ts).
      return 'mouvementReduit';
    case 'themeSombre':
      // Le thème affiché, suivi en direct (src/humalis/temps.ts).
      return 'themeSombre';
    case 'etatRequete':
      // L'état de la requête de la variable (src/humalis/serveur.ts) : chargement, erreur ou introuvable.
      return `${camel(valeur.variable)}Req.statut === '${valeur.etat}'`;
    case 'erreurRequete':
      return `${camel(valeur.variable)}Req.message`;
  }
}

/**
 * Un texte et ses « {…} » en TypeScript : une chaîne, ou un gabarit. `langue`
 * est la langue d'une version (« en ») : les montants et les pluriels la suivent.
 */
function texteTS(parties: PartiesTexte, contexte: Contexte, langue?: string): string {
  if (parties.every((p) => 'texte' in p)) {
    return chaine(parties.map((p) => ('texte' in p ? p.texte : '')).join(''));
  }
  const morceaux = parties.map((p) => {
    if ('texte' in p) return p.texte.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    // « {nombre de panier} » : le calcul lui-même, avec son habillage.
    if (p.expression) {
      const calcul = expression(p.expression, contexte);
      const habille = habillage(p, langue);
      return habille ? `\${${habille(calcul)}}` : `\${${calcul} ?? ''}`;
    }
    // « {p.prix} » : chaque morceau du chemin est un nom.
    const [premier, ...reste] = p.variable.split('.');
    // Le format français (décision F1) : « 28 000 », « 7 novembre 2026 ».
    const formater = 'variable' in p ? habillage(p, langue) : undefined;
    // Une variable « = rien » pas encore lue : rien ne s'affiche à la place du champ.
    if (reste.length > 0 && contexte.facultatives?.has(premier)) {
      const champ = `${nomLu(premier, contexte)}?.${reste.map(camel).join('.')}`;
      return formater ? `\${${formater(champ)}}` : `\${${champ} ?? ''}`;
    }
    const chemin = [nomLu(premier, contexte), ...reste.map(camel)].join('.');
    if (formater) return `\${${formater(chemin)}}`;
    const type = contexte.types.get(p.variable);
    if (type?.genre === 'liste') return `\${${chemin}.join(', ')}`;
    // Une valeur peut-être absente (« reglage?.boutique », une variable « = rien ») : rien, plutôt que « undefined ».
    return chemin.includes('?.') || contexte.facultatives?.has(premier) ? `\${${chemin} ?? ''}` : `\${${chemin}}`;
  });
  return `\`${morceaux.join('')}\``;
}

/**
 * Une adresse externe à trous (« https://wa.me/…?text={message} ») : après le « ? » ou le « # »,
 * chaque valeur est encodée (encodeURIComponent), pour qu'un « & », un « # » ou une espace ne
 * coupent pas l'adresse. Avant, la valeur reste telle quelle (une adresse entière donnée par l'API).
 */
export function adresseEncodee(valeur: Valeur, contexte: Contexte): string {
  if (valeur.type !== 'texte' || valeur.versions || valeur.parties.every((p) => 'texte' in p)) return expression(valeur, contexte);
  let requete = false;
  const morceaux = valeur.parties.map((p) => {
    if ('texte' in p) {
      if (/[?#]/.test(p.texte)) requete = true;
      // Un retour à la ligne s'écrit %0A dans une adresse.
      return p.texte.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\n/g, '%0A');
    }
    if (p.expression) {
      const calcul = expression(p.expression, contexte);
      return requete ? `\${encodeURIComponent(String(${calcul} ?? ''))}` : `\${${calcul} ?? ''}`;
    }
    const [premier, ...reste] = p.variable.split('.');
    const lu = [nomLu(premier, contexte), ...reste.map(camel)].join(contexte.facultatives?.has(premier) && reste.length > 0 ? '?.' : '.');
    // Une liste s'écrit comme dans un texte : ses éléments séparés par des virgules.
    const chemin = contexte.types.get(p.variable)?.genre === 'liste' ? `${lu}.join(', ')` : lu;
    return requete ? `\${encodeURIComponent(String(${chemin} ?? ''))}` : `\${${chemin} ?? ''}`;
  });
  return `\`${morceaux.join('')}\``;
}

/** Le contenu d'un élément dans du JSX : `Bienvenue`, `{nom}`, `{panier.join(', ')}`. */
export function contenuJSX(valeur: Valeur, contexte: Contexte): string {
  if (valeur.type === 'texte' && (valeur.parties.some((p) => 'texte' in p && (p.accent || p.code)) || valeur.versions?.some((v) => v.parties.some((p) => 'texte' in p && (p.accent || p.code))))) {
    const enfants = (parties: PartiesTexte) => parties.map((p) => {
      if ('texte' in p) return p.accent
        ? `<span className="humalis-accent">{${chaine(p.texte)}}</span>`
        : p.code ? `<code className="humalis-code-ligne">{${chaine(p.texte)}}</code>`
        : `{${chaine(p.texte)}}`;
      return contenuJSX({ type: 'texte', parties: [p] }, contexte);
    }).join('');
    if (valeur.versions) return valeur.versions.map((v) => `{langue === ${chaine(v.code)} && <>${enfants(v.parties)}</>}`).join('');
    return enfants(valeur.parties);
  }
  if (valeur.type === 'texte' && !valeur.versions && valeur.parties.every((p) => 'texte' in p)) {
    const texte = valeur.parties.map((p) => ('texte' in p ? p.texte : '')).join('');
    // Les caractères qui ont un sens en JSX passent par une chaîne.
    return /[{}<>\n]/.test(texte) || texte !== texte.trim() ? `{${chaine(texte)}}` : texte;
  }
  const type = typeDe(valeur, contexte);
  if (type.genre === 'liste') return `{${expression(valeur, contexte)}.join(', ')}`;
  if (type.genre === 'booleen') return `{String(${expression(valeur, contexte)})}`;
  return `{${expression(valeur, contexte)}}`;
}

const OPERATEURS: Record<string, string> = {
  egal: '===',
  different: '!==',
  inferieur: '<',
  superieur: '>',
  inferieurOuEgal: '<=',
  superieurOuEgal: '>=',
};

/**
 * « a et b », « a ou b » en JavaScript : un « ou » est toujours entre parenthèses
 * (il se lit d'un bloc, même devant « && ( » dans le JSX), un « et » seulement dans un « ou ».
 */
export function combiner(test: TestCombine, ecrire: (t: Test) => string): string {
  const partie = (t: Test): string => {
    if (!estCombine(t)) return ecrire(t);
    const code = combiner(t, ecrire);
    // Un « ou » dans un « ou » se lit sans parenthèses de plus.
    return t.operateur === 'ou' && test.operateur === 'ou' ? code.slice(1, -1) : t.operateur === 'et' && test.operateur === 'ou' ? `(${code})` : code;
  };
  return test.operateur === 'et' ? `${partie(test.gauche)} && ${partie(test.droite)}` : `(${partie(test.gauche)} || ${partie(test.droite)})`;
}

/** Une condition TypeScript. */
export function condition(test: Test, contexte: Contexte, renommesDroite?: Map<string, string>): string {
  if (estCombine(test)) return combiner(test, (t) => condition(t, contexte, renommesDroite));
  if (test.negation) return `!(${condition({ ...test, negation: false }, contexte, renommesDroite)})`;
  const gauche = expression(test.gauche, contexte);
  const type = typeDe(test.gauche, contexte);
  // Dans « dont club est egal a club », la droite lit la variable de la page, pas le champ.
  const x = (v: Valeur) => {
    if (!renommesDroite) return expression(v, contexte);
    const avant = contexte.renommes;
    contexte.renommes = renommesDroite;
    const texte = expression(v, contexte);
    contexte.renommes = avant;
    return texte;
  };

  switch (test.operateur) {
    case 'dans':
      return `${x(test.droite!)}.includes(${gauche})`;
    case 'vide':
      // Un champ absent d'une fiche reçue (« reglage.email ») compte comme vide, sans planter.
      return `(${gauche}?.length ?? 0) === 0`;
    case 'vrai':
      return type.genre === 'booleen' ? gauche : `${gauche} === true`;
    case 'faux':
      return type.genre === 'booleen' ? `!${gauche}` : `${gauche} === false`;
    case 'rien':
      // « rien » : null, ou un champ absent (undefined).
      return `${gauche} == null`;
    case 'contient':
      return `${gauche}.includes(${x(test.droite!)})`;
    case 'commencePar':
      return `${gauche}.startsWith(${x(test.droite!)})`;
    case 'finitPar':
      return `${gauche}.endsWith(${x(test.droite!)})`;
    default:
      return `${gauche} ${OPERATEURS[test.operateur]} ${x(test.droite!)}`;
  }
}

/** Une valeur qui demande des parenthèses dans un calcul (« x / moyenne de notes »). */
export function aParentheser(v: Valeur): boolean {
  return v.type === 'calcul' || v.type === 'hasard' || (v.type === 'agregat' && v.operation === 'moyenne');
}

/**
 * Les calculs sur les nombres et les listes, en JavaScript lisible (le même
 * texte pour le web, le mobile et le site statique).
 */
export function calculDeListe(
  valeur: Extract<Valeur, { type: 'agregat' | 'arrondi' | 'hasard' | 'champs' }>,
  x: (v: Valeur) => string,
): string {
  const membre = (v: Valeur) => (aParentheser(v) ? `(${x(v)})` : x(v));
  switch (valeur.type) {
    case 'champs':
      return `${membre(valeur.liste)}.map((element) => element.${camel(valeur.champ)})`;
    case 'agregat': {
      const liste = membre(valeur.liste);
      switch (valeur.operation) {
        case 'somme':
          return `${liste}.reduce((somme, n) => somme + n, 0)`;
        case 'moyenne':
          return `${liste}.reduce((somme, n) => somme + n, 0) / ${liste}.length`;
        case 'minimum':
          return `Math.min(...${liste})`;
        case 'maximum':
          return `Math.max(...${liste})`;
      }
      break;
    }
    case 'arrondi': {
      if (valeur.chiffres === undefined || valeur.chiffres === 0) return `Math.round(${x(valeur.valeur)})`;
      const facteur = 10 ** valeur.chiffres;
      return `Math.round(${membre(valeur.valeur)} * ${facteur}) / ${facteur}`;
    }
    case 'hasard': {
      const min = membre(valeur.minimum);
      return `${min} + Math.floor(Math.random() * (${membre(valeur.maximum)} - ${min} + 1))`;
    }
  }
  return '';
}

/**
 * Les opérations sur les listes (tâche 2), en JavaScript lisible : la
 * liste d'origine n'est jamais changée (`[...liste].sort`).
 */
export function operationDeListe(
  valeur: Extract<Valeur, { type: 'filtre' | 'tri' | 'premier' | 'premiers' }>,
  x: (v: Valeur) => string,
  conditionDe: (test: Test, champs: string[]) => string,
): string {
  const membre = (v: Valeur) => (aParentheser(v) ? `(${x(v)})` : x(v));
  switch (valeur.type) {
    case 'filtre':
      return `${membre(valeur.liste)}.filter((element) => ${conditionDe(valeur.test, valeur.champs)})`;
    case 'premier':
      // « premier de … dont … » : le premier qui vérifie la condition.
      return valeur.liste.type === 'filtre'
        ? `${membre(valeur.liste.liste)}.find((element) => ${conditionDe(valeur.liste.test, valeur.liste.champs)}) ?? null`
        : `${membre(valeur.liste)}[0] ?? null`;
    case 'premiers':
      return `${membre(valeur.liste)}.slice(0, ${x(valeur.nombre)})`;
    case 'tri': {
      const lu = (nom: string) => (valeur.champ !== undefined ? `${nom}.${camel(valeur.champ)}` : nom);
      const [a, b] = valeur.decroissant ? ['y', 'x'] : ['x', 'y'];
      const comparer = valeur.genre === 'texte' ? `${lu(a)}.localeCompare(${lu(b)}, 'fr')` : `${lu(a)} - ${lu(b)}`;
      return `[...${membre(valeur.liste)}].sort((x, y) => ${comparer})`;
    }
  }
}

/**
 * Comment écrire un « {…} » en français (décisions F1 et L6) : la fonction
 * qui l'habille (`formaterNombre(x)`, `formaterArgent(x, 'FC')`, `accorder(x, 'article')`), ou rien.
 */
export function habillage(p: PartieVariable, langue?: string): ((x: string) => string) | undefined {
  const base = habillageSeul(p, langue);
  return base && p.majuscule ? (x) => `avecMajuscule(${base(x)})` : base;
}

function habillageSeul(p: PartieVariable, langue?: string): ((x: string) => string) | undefined {
  // La langue d'une version (« en ») : le français reste la langue par défaut des fonctions.
  const en = langue !== undefined && langue !== 'fr' ? `, '${langue}'` : '';
  if (p.pluriel) return (x) => `accorder(${x}, ${chaine(p.pluriel!)}${en})`;
  if (p.format === 'date') return (x) => `formaterDate(${x}${en})`;
  if (p.format === 'nombre') return (x) => `formaterNombre(${x}${en})`;
  if (p.format === 'depuis') return (x) => `formaterDepuis(${x})`;
  if (p.format === 'dateLongue') return (x) => `formaterDateLongue(${x})`;
  if (p.format === 'lettres') return (x) => `formaterEnLettres(${x})`;
  if (p.format === 'Ko' || p.format === 'Mo') return (x) => `formaterTaille(${x}, '${p.format}'${en})`;
  if (p.format) return (x) => `formaterArgent(${x}, '${p.format}'${en})`;
  return undefined;
}

/** Les dates (tâche 2), en JavaScript lisible : les outils de humalis/outils.ts ou de humalis.js. */
export function dateEnCode(valeur: Extract<Valeur, { type: 'dateDuJour' | 'dateDecalee' | 'joursEntre' }>, X: (v: Valeur) => string): string {
  if (valeur.type === 'dateDuJour') return valeur.maintenant ? 'maintenant()' : 'dateDuJour()';
  if (valeur.type === 'joursEntre') return `joursEntre(${X(valeur.debut)}, ${X(valeur.fin)})`;
  return `decalerDate(${X(valeur.date)}, ${valeur.signe < 0 ? (/^[\w.]+$/.test(X(valeur.nombre)) ? `-${X(valeur.nombre)}` : `-(${X(valeur.nombre)})`) : X(valeur.nombre)}, '${valeur.unite}')`;
}

/** Le texte (tâche 2), en JavaScript lisible : majuscules, minuscules et longueur, remplacement. */
export function operationDeTexte(
  valeur: Extract<Valeur, { type: 'operationTexte' | 'remplacement' }>,
  x: (v: Valeur) => string,
): string {
  const membre = (v: Valeur) => (aParentheser(v) ? `(${x(v)})` : x(v));
  if (valeur.type === 'remplacement') return `${membre(valeur.dans)}.replaceAll(${x(valeur.cherche)}, ${x(valeur.remplace)})`;
  switch (valeur.operation) {
    case 'majuscules':
      return `${membre(valeur.valeur)}.toLocaleUpperCase('fr')`;
    case 'minuscules':
      return `${membre(valeur.valeur)}.toLocaleLowerCase('fr')`;
    case 'longueur':
      return `${membre(valeur.valeur)}.length`;
    case 'initiales':
      return `initialesDe(${x(valeur.valeur)})`;
  }
}
