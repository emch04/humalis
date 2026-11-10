/**
 * Les noms du code Kotlin produit. Un nom Humalis devient un identifiant
 * lisible (« nombre_articles » → nombreArticles) ; un mot que Kotlin réserve,
 * ou un nom déjà pris par Compose ou par la bibliothèque d'aide, est changé.
 */
import { camel as camelJs, pascal as pascalJs } from '../web/noms.js';
import { simplifier } from '../../analyse/elements.js';

/** Les mots que Kotlin réserve, et les noms que la bibliothèque d'aide emploie déjà. */
const RESERVES = new Set([
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in', 'interface', 'is', 'null', 'object',
  'package', 'return', 'super', 'this', 'throw', 'true', 'try', 'typealias', 'typeof', 'val', 'var', 'when', 'while',
  'by', 'catch', 'constructor', 'delegate', 'dynamic', 'field', 'file', 'finally', 'get', 'import', 'init', 'param',
  'property', 'receiver', 'set', 'setparam', 'value', 'where', 'it', 'Unit', 'Any',
  // Ce que chaque page déclare, et les fonctions de la bibliothèque d'aide : une variable de ce nom les cacherait.
  'nav', 'portee', 'contexte', 'scope', 'raison', 'texte', 'nombre', 'vrai', 'liste', 'champ', 'fiche', 'plus', 'egal', 'comparer',
  'estVide', 'longueur', 'contient', 'dans', 'somme', 'moyenne', 'minimum', 'maximum', 'arrondi', 'hasard', 'trier', 'grouper',
  'premier', 'premiers', 'champs', 'remplacer', 'identifiant', 'accorder', 'formaterNombre', 'formaterArgent', 'formaterDate',
  'formaterDateLongue', 'formaterDepuis', 'formaterEnLettres', 'formaterTaille', 'avecMajuscule', 'initialesDe', 'dateDuJour',
  'maintenant', 'decalerDate', 'joursEntre', 'copier', 'partager', 'confirmer', 'ouvrirExterne', 'avecChamp', 'sansPremier',
  'Messages', 'Serveur', 'Session', 'Memoire', 'Coffre', 'Partage', 'Couleurs', 'Apparence', 'Routes',
]);

/** Le nom d'une clé JSON : celui que le serveur et le web emploient (« prix_avant » → prixAvant). */
export const cleJson = (nom: string): string => camelJs(nom).replace(/_$/, '');

/** « email_valide » → « emailValide » : une variable, une fonction. */
export function nomKotlin(nom: string): string {
  const base = cleJson(nom) || 'valeur';
  const sur = /^[A-Za-z_]/.test(base) ? base : `v${base}`;
  return RESERVES.has(sur) ? `${sur}_` : sur;
}

/** « boutique » → « PageBoutique ». */
export const nomPage = (nom: string): string => `Page${pascalJs(nom)}`;

/** Le composant écrit en Humalis : « carte_produit » → « ComposantCarteProduit ». */
export const nomComposant = (nom: string): string => `Composant${pascalJs(nom)}`;

/** Le nom de la route d'une page (« mentions-legales » → « mentions_legales ») : sans accent ni espace. */
export const nomRoute = (nom: string): string => nom.split(/[^A-Za-z0-9]+/).map(simplifier).filter(Boolean).join('_') || 'page';

/** Une chaîne Kotlin entre guillemets, échappée (le « $ » aussi : il ouvrirait un gabarit). */
export function chaineKotlin(texte: string): string {
  return `"${echapper(texte)}"`;
}

export function echapper(texte: string): string {
  return texte
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/** Le nom de l'application (« ma-boutique » → MaBoutique). */
export const nomApplication = (nom: string): string => {
  const base = pascalJs(nom);
  return /^[A-Za-z]/.test(base) ? base : `Application${base}`;
};

/** L'identifiant Android de l'application : des segments en minuscules, chacun commençant par une lettre. */
export function identifiantAndroid(identifiant: string): string {
  const segments = identifiant
    .split('.')
    .map((s) => s.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
    .filter(Boolean)
    .map((s) => (/^[a-z]/.test(s) ? s : `a${s}`))
    .map((s) => (RESERVES.has(s) ? `${s}_` : s));
  return segments.length >= 2 ? segments.join('.') : `local.humalis.${segments[0] ?? 'application'}`;
}
