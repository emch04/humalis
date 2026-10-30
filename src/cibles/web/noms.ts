import { simplifier } from '../../analyse/elements.js';

/** Mots que JavaScript ou TypeScript réservent : un nom Humalis ne peut pas les prendre tels quels. */
const RESERVES = new Set([
  'arguments', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'enum', 'eval', 'export', 'extends', 'false', 'finally',
  'for', 'function', 'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'let',
  'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'static', 'super',
  'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while',
  'with', 'yield', 'NaN', 'Infinity',
]);

function morceaux(nom: string): string[] {
  return simplifier(nom).split('_').filter(Boolean);
}

const majuscule = (mot: string) => mot.charAt(0).toUpperCase() + mot.slice(1);

/** « liste_produits » → « ListeProduits » : nom d'un composant. */
export function pascal(nom: string): string {
  const resultat = morceaux(nom).map(majuscule).join('');
  if (resultat === '') return 'Page';
  return /^[0-9]/.test(resultat) ? `Page${resultat}` : resultat;
}

/** « email_valide » → « emailValide » : nom d'une variable. */
export function camel(nom: string): string {
  const [premier = 'valeur', ...reste] = morceaux(nom);
  let resultat = premier + reste.map(majuscule).join('');
  if (/^[0-9]/.test(resultat)) resultat = `v${resultat}`;
  return RESERVES.has(resultat) ? `${resultat}_` : resultat;
}

/** « panier » → « setPanier ». */
export const setter = (nom: string) => setterDe(camel(nom));

/** Le setter d'une variable déjà nommée en TypeScript : « champEmail » → « setChampEmail ». */
export const setterDe = (variable: string) => `set${majuscule(variable)}`;

/** Une chaîne JavaScript entre apostrophes, échappée. */
export function chaine(texte: string): string {
  return `'${texte.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}
