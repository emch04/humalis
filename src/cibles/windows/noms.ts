/**
 * Les noms du code C# produit. Un nom Humalis devient un identifiant lisible
 * (« nombre_articles » → nombreArticles) ; un mot que C# réserve reçoit « _ ».
 */
import { camel as camelJs, pascal as pascalJs } from '../web/noms.js';

/** Les mots que C# réserve, et les noms des membres d'une page que le code produit emploie déjà. */
const RESERVES = new Set([
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked', 'class', 'const', 'continue',
  'decimal', 'default', 'delegate', 'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false', 'finally',
  'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock',
  'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private', 'protected',
  'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed', 'short', 'sizeof', 'stackalloc', 'static', 'string',
  'struct', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort',
  'using', 'virtual', 'void', 'volatile', 'while', 'var', 'dynamic', 'async', 'await', 'nameof', 'value', 'record',
  'relances', 'aArreter',
]);

/** Le nom d'une clé JSON : celui que le serveur et le web emploient (« prix_avant » → prixAvant). */
export const cleJson = (nom: string): string => camelJs(nom).replace(/_$/, '');

/** « email_valide » → « emailValide » : une variable, un paramètre. */
export function nomCs(nom: string): string {
  const base = cleJson(nom);
  return RESERVES.has(base) ? `${base}_` : base;
}

/** « boutique » → « PageBoutique ». */
export const nomPage = (nom: string): string => `Page${pascalJs(nom)}`;

/** Le composant écrit en Humalis : « carte_produit » → « ComposantCarteProduit ». */
export const nomComposant = (nom: string): string => `Composant${pascalJs(nom)}`;

/** « remise » → « Remise » : une fonction, une méthode, un style nommé. */
export const nomMethode = (nom: string): string => pascalJs(nom);

/** Les classes de la bibliothèque et du projet : l'espace de noms de l'application ne peut pas s'appeler ainsi. */
const CLASSES_PRISES = new Set([
  'Humalis', 'System', 'Windows', 'Microsoft', 'Application', 'Programme', 'Pages', 'Sources', 'Fonctions', 'Partage', 'Styles',
  'Couleurs', 'V', 'UI', 'Session', 'Serveur', 'Routeur', 'Messages', 'Memoire', 'Coffre', 'Apparence', 'Configuration', 'Icones',
  'Minuterie', 'Pause', 'Signal', 'Effet', 'Liste', 'Fiche', 'Arguments', 'Fermeture', 'Entete', 'Pied', 'Source',
  'Langues', 'Svg', 'Palette', 'GraphiqueHumalis', 'GraphiqueFabrique', 'SerieGraphique', 'Fichiers', 'Qr', 'Medias', 'Marqueur', 'CarteHumalis',
  'DonneeLocale', 'DonneesComptes', 'CoeurLocal', 'BaseSqlite', 'BaseEnMemoire', 'CompteSecurise', 'CleAcces',
]);

/** Le nom de l'application en identifiant C# (« ma-boutique » → MaBoutique ; « sources » → SourcesApp). */
export const nomApplication = (nom: string): string => {
  const base = pascalJs(nom);
  const lisible = /^[A-Za-z]/.test(base) ? base : `Application${base}`;
  return CLASSES_PRISES.has(lisible) ? `${lisible}App` : lisible;
};

/** Une chaîne C# entre guillemets, échappée. */
export function chaineCs(texte: string): string {
  const echappee = texte
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    // C# compte U+0085, U+2028 et U+2029 comme des fins de ligne (un texte copié depuis Word ou le web) :
    // ces caractères, et les autres caractères de contrôle, s'écrivent en \uXXXX.
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `"${echappee}"`;
}

/** Un texte mis dans un commentaire C# : une fin de ligne y ferait sortir la suite du commentaire. */
export const commentaireCs = (texte: string): string => texte.replace(/[\r\n\u0085\u2028\u2029]+/g, ' ');

/** Un nombre C# de type double (« 12d », « 0.5d »). */
export function nombreCs(n: number): string {
  if (!Number.isFinite(n)) return '0d';
  const texte = String(n);
  return /e/i.test(texte) ? `${n.toFixed(20).replace(/0+$/, '').replace(/\.$/, '')}d` : `${texte}d`;
}
