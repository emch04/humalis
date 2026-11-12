/**
 * Les limites sur les valeurs d'une donnée : « nombre entre 0 et 100 », « texte de 2 a 80 caracteres »,
 * « au format email », « parmi … », « liste de … de 5 elements au plus », et les limites par défaut.
 *
 * La vérification est écrite deux fois, à l'identique : ici, pour l'analyse et pour « humalis lancer », et
 * dans BORNES_TS, le texte recopié dans le serveur produit. tests/bornes.test.ts passe les mêmes cas dans
 * les deux : elles ne peuvent pas diverger sans qu'un test échoue. Le texte n'emploie ni gabarit ni accent
 * grave, pour se recopier tel quel.
 */
import type { TypeChamp } from '../../parser/ast.js';

/** Les limites d'un champ, telles que le compilateur les écrit dans le serveur. */
export interface Bornes {
  min?: number;
  max?: number;
  entier?: boolean;
  longueurMin?: number;
  longueurMax?: number;
  format?: 'email' | 'telephone' | 'adresse_web';
  parmi?: string[];
  elementsMax?: number;
}

/** Sans rien écrire : un texte de 10 000 caractères au plus, une liste de 1 000 éléments au plus. */
const TEXTE_PAR_DEFAUT = 10000;
const LISTE_PAR_DEFAUT = 1000;
/** Une image choisie dans la page (data:image/…) garde la limite des images. */
const IMAGE_AU_PLUS = 95000;

/**
 * Ce qui ne va pas dans une valeur déjà du bon type : la fin de la phrase « le champ « prix » … » ;
 * undefined si elle respecte ses limites. Sans limite écrite, celles par défaut valent quand même.
 */
export function horsBornes(valeur: unknown, bornes: Bornes = {}): string | undefined {
  if (typeof valeur === 'number') {
    if (bornes.entier && !Number.isInteger(valeur)) return 'doit être un nombre entier';
    const { min, max } = bornes;
    if ((min !== undefined && valeur < min) || (max !== undefined && valeur > max)) {
      if (min !== undefined && max !== undefined) return 'doit être entre ' + min + ' et ' + max;
      return min !== undefined ? 'doit être au moins ' + min : 'doit être au plus ' + max;
    }
    return undefined;
  }
  if (typeof valeur === 'string') {
    // Les caractères tels qu'on les voit : un émoji compte pour un.
    const longueur = Array.from(valeur).length;
    const bas = bornes.longueurMin ?? 0;
    const haut = bornes.longueurMax ?? (valeur.startsWith('data:image/') ? IMAGE_AU_PLUS : TEXTE_PAR_DEFAUT);
    if (longueur < bas || longueur > haut) {
      if (bornes.longueurMin !== undefined && bornes.longueurMax !== undefined) return 'doit avoir entre ' + bas + ' et ' + haut + ' caractères';
      return longueur < bas ? 'doit avoir au moins ' + bas + ' caractères' : 'doit avoir au plus ' + haut + ' caractères';
    }
    if (bornes.parmi && !bornes.parmi.includes(valeur)) return 'doit être l’une de ces valeurs : ' + bornes.parmi.join(', ');
    if (bornes.format === 'email' && !(longueur <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur))) return 'doit être une adresse e-mail';
    if (bornes.format === 'telephone' && !/^\+?\d{6,15}$/.test(valeur.replace(/[\s.()-]/g, ''))) return 'doit être un numéro de téléphone';
    if (bornes.format === 'adresse_web' && !/^https?:\/\/[^\s"<>.]+\.[^\s"<>]+$/.test(valeur)) return 'doit être une adresse web (https://…)';
    return undefined;
  }
  if (Array.isArray(valeur)) {
    const haut = bornes.elementsMax ?? LISTE_PAR_DEFAUT;
    if (valeur.length > haut) return 'doit avoir au plus ' + haut + ' éléments';
    for (const element of valeur) {
      const faute = horsBornes(element);
      if (faute) return 'a un élément qui ' + faute;
    }
  }
  return undefined;
}

/** Le même code, pour src/humalis/verifier.ts du serveur produit. */
export const BORNES_TS = String.raw`/** Les limites d'un champ, telles que le compilateur les écrit dans le serveur. */
export interface Bornes {
  min?: number;
  max?: number;
  entier?: boolean;
  longueurMin?: number;
  longueurMax?: number;
  format?: 'email' | 'telephone' | 'adresse_web';
  parmi?: string[];
  elementsMax?: number;
}

/** Sans rien écrire : un texte de 10 000 caractères au plus, une liste de 1 000 éléments au plus. */
const TEXTE_PAR_DEFAUT = 10000;
const LISTE_PAR_DEFAUT = 1000;
/** Une image choisie dans la page (data:image/…) garde la limite des images. */
const IMAGE_AU_PLUS = 95000;

/**
 * Ce qui ne va pas dans une valeur déjà du bon type : la fin de la phrase « le champ « prix » … » ;
 * undefined si elle respecte ses limites. Sans limite écrite, celles par défaut valent quand même.
 */
export function horsBornes(valeur: unknown, bornes: Bornes = {}): string | undefined {
  if (typeof valeur === 'number') {
    if (bornes.entier && !Number.isInteger(valeur)) return 'doit être un nombre entier';
    const { min, max } = bornes;
    if ((min !== undefined && valeur < min) || (max !== undefined && valeur > max)) {
      if (min !== undefined && max !== undefined) return 'doit être entre ' + min + ' et ' + max;
      return min !== undefined ? 'doit être au moins ' + min : 'doit être au plus ' + max;
    }
    return undefined;
  }
  if (typeof valeur === 'string') {
    // Les caractères tels qu'on les voit : un émoji compte pour un.
    const longueur = Array.from(valeur).length;
    const bas = bornes.longueurMin ?? 0;
    const haut = bornes.longueurMax ?? (valeur.startsWith('data:image/') ? IMAGE_AU_PLUS : TEXTE_PAR_DEFAUT);
    if (longueur < bas || longueur > haut) {
      if (bornes.longueurMin !== undefined && bornes.longueurMax !== undefined) return 'doit avoir entre ' + bas + ' et ' + haut + ' caractères';
      return longueur < bas ? 'doit avoir au moins ' + bas + ' caractères' : 'doit avoir au plus ' + haut + ' caractères';
    }
    if (bornes.parmi && !bornes.parmi.includes(valeur)) return 'doit être l’une de ces valeurs : ' + bornes.parmi.join(', ');
    if (bornes.format === 'email' && !(longueur <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur))) return 'doit être une adresse e-mail';
    if (bornes.format === 'telephone' && !/^\+?\d{6,15}$/.test(valeur.replace(/[\s.()-]/g, ''))) return 'doit être un numéro de téléphone';
    if (bornes.format === 'adresse_web' && !/^https?:\/\/[^\s"<>.]+\.[^\s"<>]+$/.test(valeur)) return 'doit être une adresse web (https://…)';
    return undefined;
  }
  if (Array.isArray(valeur)) {
    const haut = bornes.elementsMax ?? LISTE_PAR_DEFAUT;
    if (valeur.length > haut) return 'doit avoir au plus ' + haut + ' éléments';
    for (const element of valeur) {
      const faute = horsBornes(element);
      if (faute) return 'a un élément qui ' + faute;
    }
  }
  return undefined;
}
`;

/** Une valeur du bon type qui respecte ces limites : ce que les tests produits envoient. */
export function exempleDansLesBornes(type: TypeChamp, bornes: Bornes | undefined): string | undefined {
  if (!bornes) return undefined;
  if (type.genre === 'nombre') {
    const bas = bornes.min ?? (bornes.max !== undefined ? Math.min(1, bornes.max) : 1);
    const valeur = bornes.entier ? Math.ceil(bas) : bas;
    return String(horsBornes(1, bornes) === undefined ? 1 : valeur);
  }
  if (type.genre === 'texte' && !type.image) {
    if (bornes.parmi?.length) return JSON.stringify(bornes.parmi[0]).replace(/^"|"$/g, "'");
    if (bornes.format === 'email') return "'a@exemple.fr'";
    if (bornes.format === 'telephone') return "'+33123456789'";
    if (bornes.format === 'adresse_web') return "'https://exemple.fr'";
    const longueur = Math.max(bornes.longueurMin ?? 0, Math.min(7, bornes.longueurMax ?? 7));
    return "'" + 'exemple'.repeat(Math.ceil(longueur / 7) || 1).slice(0, longueur || 7) + "'";
  }
  return undefined;
}

/** Le même code sans ses types, pour les pages (JavaScript du navigateur). */
export const BORNES_JS = BORNES_TS.replace(/\/\*\* Les limites d'un champ[\s\S]*?\n\}\n\n/, '').replace(
  'export function horsBornes(valeur: unknown, bornes: Bornes = {}): string | undefined {',
  'function horsBornes(valeur, bornes = {}) {',
);

/** Les limites de chaque route de données, par adresse (« /api/produits ») ; une route sans limite écrite garde celles par défaut. */
export function limitesDesRoutes(serveurs: { donnees: { nom: string; champs: { nom: string; bornes?: Bornes }[] }[]; routes: { adresse: string; donnee: string; interne?: string }[] }[], camel: (nom: string) => string): Record<string, Record<string, Bornes>> {
  const limites: Record<string, Record<string, Bornes>> = {};
  for (const serveur of serveurs) {
    for (const route of serveur.routes) {
      const donnee = serveur.donnees.find((d) => d.nom === route.donnee);
      if (!donnee || route.interne) continue;
      limites[`/api/${route.adresse.replace(/^\/+/, '')}`] = Object.fromEntries(donnee.champs.flatMap((c) => (c.bornes ? [[camel(c.nom), c.bornes]] : [])));
    }
  }
  return limites;
}

/**
 * Dans la page : la vérification avant l'envoi. Une création (POST sur la route) ou une modification
 * (PATCH sur une fiche) dont une valeur sort de ses limites n'est pas envoyée : la personne lit tout de
 * suite la même phrase que celle du serveur, qui reste seul juge.
 */
export function codeAvantEnvoi(limites: Record<string, Record<string, Bornes>>): string {
  return `// Les limites des données du serveur, vérifiées avant l'envoi. Le serveur les revérifie toujours.
const LIMITES = ${JSON.stringify(limites)};
${BORNES_JS}
function fauteAvantEnvoi(adresse, options) {
  if ((options.method !== 'POST' && options.method !== 'PATCH') || typeof options.body !== 'string') return undefined;
  const route = Object.keys(LIMITES).find((r) => (options.method === 'POST' ? adresse === r : adresse.startsWith(r + '/') && !adresse.slice(r.length + 1).includes('/')));
  if (route === undefined) return undefined;
  let donnees;
  try { donnees = JSON.parse(options.body); } catch { return undefined; }
  if (donnees === null || typeof donnees !== 'object' || Array.isArray(donnees)) return undefined;
  for (const [champ, valeur] of Object.entries(donnees)) {
    const faute = horsBornes(valeur, LIMITES[route][champ]);
    if (faute) return 'Le champ « ' + champ + ' » ' + faute + '.';
  }
  return undefined;
}
`;
}
