/**
 * Les noms du code Swift produit. Un nom Humalis devient un identifiant
 * lisible (« nombre_articles » → nombreArticles) ; un mot que Swift réserve,
 * ou un nom déjà pris par SwiftUI ou par la bibliothèque d'aide, est changé.
 */
import { camel as camelJs, pascal as pascalJs } from '../web/noms.js';

/** Les mots que Swift réserve, et les noms qu'une vue SwiftUI utilise déjà. */
const RESERVES = new Set([
  'associatedtype', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'continue', 'default', 'defer', 'deinit',
  'do', 'else', 'enum', 'extension', 'fallthrough', 'false', 'fileprivate', 'for', 'func', 'guard', 'if', 'import', 'in',
  'init', 'inout', 'internal', 'is', 'let', 'nil', 'operator', 'precedencegroup', 'private', 'protocol', 'public',
  'repeat', 'rethrows', 'return', 'self', 'Self', 'static', 'struct', 'subscript', 'super', 'switch', 'throw', 'throws',
  'true', 'try', 'typealias', 'var', 'where', 'while', 'Any', 'some', 'any', 'body', 'type', 'min', 'max', 'abs',
  // Les fonctions de la bibliothèque d'aide : une variable de ce nom les cacherait.
  'accorder', 'activerNotifications', 'enregistrerMedia', 'scannerDocument', 'recadrerPhoto', 'prendrePhoto', 'lirePosition', 'scannerCode', 'verifierIdentite', 'vibrer', 'apparence', 'directs', 'arrondi', 'confirmer', 'copier', 'dateDuJour', 'decalerDate', 'formaterArgent', 'formaterDate',
  'formaterDateLongue', 'formaterEnLettres', 'avecMajuscule', 'initialesDe', 'formaterDepuis', 'formaterNombre', 'formaterTaille', 'grouper', 'hasard', 'jetons', 'joursEntre', 'maintenant', 'maximum',
  'minimum', 'minuterie', 'moyenne', 'mouvementReduit', 'nombreDe', 'ouvrirExterne', 'partager', 'planificateur', 'raisonDe',
  'relances', 'retirerPremier', 'somme', 't', 'telechargerCsv', 'texteDe', 'texteRiche', 'textes', 'trier', 'visibilite',
]);

/** Les types de SwiftUI, de Foundation et de la bibliothèque d'aide : une donnée ne peut pas s'appeler ainsi. */
const TYPES_PRIS = new Set([
  'Alert', 'Angle', 'Animation', 'Application', 'Array', 'Binding', 'Bool', 'Button', 'Calendar', 'Capsule', 'Character',
  'Circle', 'Color', 'Couleurs', 'Data', 'Date', 'Decimal', 'Dictionary', 'Divider', 'Double', 'Environment', 'Error',
  'File', 'Float', 'Font', 'ForEach', 'Form', 'Gradient', 'Grid', 'Group', 'Image', 'Int', 'Label', 'Layout', 'Link',
  'List', 'Locale', 'Map', 'Marker', 'Memoire', 'Menu', 'Messages', 'Model', 'Optional', 'Page', 'Partage', 'Path',
  'Picker', 'Rectangle', 'Result', 'Route', 'Routeur', 'Scene', 'Section', 'Serveur', 'Session', 'Set', 'Shape', 'Slider',
  'Spacer', 'Stepper', 'String', 'Table', 'Task', 'Text', 'TextField', 'Theme', 'Timer', 'Toggle', 'Transaction', 'URL',
  'UUID', 'Unit', 'View', 'Window', 'Langues', 'Confirmation', 'Planificateur',
]);

/** Le nom d'une clé JSON : celui que le serveur et le web emploient (« prix_avant » → prixAvant). */
export const cleJson = (nom: string): string => camelJs(nom).replace(/_$/, '');

/** « email_valide » → « emailValide » : une variable, un champ de fiche, une fonction. */
export function nomSwift(nom: string): string {
  const base = cleJson(nom);
  return RESERVES.has(base) ? `${base}_` : base;
}

/** « liste_produits » → « ListeProduits » : le nom d'un type de données ; un nom pris reçoit « Donnee ». */
export function nomType(nom: string): string {
  const base = pascalJs(nom);
  return TYPES_PRIS.has(base) ? `${base}Donnee` : base;
}

/** « boutique » → « PageBoutique ». */
export const nomPage = (nom: string): string => `Page${pascalJs(nom)}`;

/** Le composant écrit en Humalis : « carte_produit » → « ComposantCarteProduit ». */
export const nomComposant = (nom: string): string => `Composant${pascalJs(nom)}`;

/** Le cas d'une route (« mentions-legales » → mentionsLegales). */
export const nomRoute = (nom: string): string => nomSwift(nom);

/** Une chaîne Swift entre guillemets, échappée. */
export function chaineSwift(texte: string): string {
  return `"${echapper(texte)}"`;
}

/** Le texte tel qu'il s'écrit entre les guillemets d'une chaîne Swift. */
export function echapper(texte: string): string {
  return texte
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/** Le nom de l'application en identifiant Swift (« ma-boutique » → MaBoutique). */
export const nomApplication = (nom: string): string => {
  const base = pascalJs(nom);
  return /^[A-Za-z]/.test(base) ? base : `Application${base}`;
};
