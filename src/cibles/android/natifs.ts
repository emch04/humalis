/**
 * Ce qui s'écrit à la main en Kotlin, quand Humalis ne sait pas encore le faire :
 * - une vue (« utiliser composant "Carte" sur android "./natif/Carte.kt" ») : une fonction @Composable
 *   appelée avec les propriétés de la page, par leur nom, au type de ses paramètres ;
 * - des styles (« utiliser style "./android.kt" sur android ») : des « fun Modifier.carte(): Modifier ».
 * Les fichiers rejoignent le paquet de l'application : les pages les voient sans rien importer.
 */
import { normaliser } from '../../lexer/motsCles.js';
import { nomStyleNatif, sansCommentairesNatifs } from '../commun/styles-natifs.js';

export type GenreKotlin = 'texte' | 'nombre' | 'entier' | 'booleen' | 'autre';

export interface VueNatifKt {
  nom: string;
  parametres: { nom: string; genre: GenreKotlin; facultatif: boolean }[];
}

const GENRES: Record<string, GenreKotlin> = { String: 'texte', Double: 'nombre', Float: 'nombre', Int: 'entier', Long: 'entier', Boolean: 'booleen' };

/** Le code sans ses commentaires ni le contenu de ses chaînes. */
function nettoye(code: string): string {
  return sansCommentairesNatifs(code).replace(/"""[\s\S]*?"""/g, '""').replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

/** Découpe « a: Int = f(1, 2), b: String » aux virgules du premier niveau. */
function morceaux(liste: string): string[] {
  const sortie: string[] = [];
  let profondeur = 0;
  let courant = '';
  for (let i = 0; i < liste.length; i++) {
    const c = liste[i]!;
    if ('([{<'.includes(c)) profondeur++;
    // « -> » d'un type fonction (« () -> Unit ») n'ouvre ni ne ferme rien.
    if (')]}'.includes(c) || (c === '>' && liste[i - 1] !== '-')) profondeur--;
    if (c === ',' && profondeur === 0) {
      sortie.push(courant);
      courant = '';
    } else courant += c;
  }
  if (courant.trim() !== '') sortie.push(courant);
  return sortie;
}

/** La fonction @Composable « nom » du fichier et ses paramètres ; une phrase d'erreur sinon. */
export function lireVueNatifKt(nom: string, contenu: string): VueNatifKt | string {
  const code = nettoye(contenu);
  const debut = new RegExp(`@Composable[\\s\\S]*?\\bfun\\s+${nom}\\s*\\(`).exec(code);
  if (!debut) return `la fonction « @Composable fun ${nom}(…) » est introuvable dans le fichier.`;
  let i = debut.index + debut[0].length;
  let profondeur = 1;
  let liste = '';
  for (; i < code.length && profondeur > 0; i++) {
    if (code[i] === '(') profondeur++;
    if (code[i] === ')') profondeur--;
    if (profondeur > 0) liste += code[i];
  }
  const parametres: VueNatifKt['parametres'] = [];
  for (const morceau of morceaux(liste)) {
    const m = /^\s*(?:@\w+\s+)*(\w+)\s*:\s*([^=]+?)\s*(=[\s\S]*)?$/.exec(morceau);
    if (!m) return `le paramètre « ${morceau.trim()} » de « ${nom} » ne se lit pas : écrivez « titre: String », « prix: Double » ou « actif: Boolean ».`;
    parametres.push({ nom: m[1]!, genre: GENRES[m[2]!.trim().replace(/\?$/, '')] ?? 'autre', facultatif: m[3] !== undefined });
  }
  return { nom, parametres };
}

/** Le paramètre qui reçoit la propriété « nom » de la page (sans accent ni majuscule). */
export function parametreKt(vue: VueNatifKt, nom: string): VueNatifKt['parametres'][number] | undefined {
  const cherche = normaliser(nom).replace(/[^a-z0-9]/g, '');
  return vue.parametres.find((p) => p.nom.toLowerCase() === cherche);
}

/** Une valeur Humalis (Any?) convertie au type du paramètre. */
export function convertirKt(code: string, genre: GenreKotlin): string {
  return { texte: `texte(${code})`, nombre: `nombre(${code})`, entier: `nombre(${code}).toInt()`, booleen: `vrai(${code})`, autre: code }[genre];
}

/** Les styles d'un fichier Kotlin : « fun Modifier.carte(): Modifier » → Carte → carte. */
export function stylesKotlinNommes(contenu: string): Map<string, string> {
  return new Map([...nettoye(contenu).matchAll(/\bfun\s+Modifier\.(\w+)\s*\(\s*\)/g)].map((m) => [nomStyleNatif(m[1]!), m[1]!]));
}

/** Le fichier dans le paquet de l'application : sa ligne « package » est posée par Humalis. */
export function dansLePaquet(contenu: string, paquet: string): string {
  const sans = contenu.replace(/^\s*package\s+[\w.]+\s*;?\s*$/m, '');
  return `// Écrit à la main ; placé par Humalis dans le paquet de l'application.\npackage ${paquet}\n\n${sans.replace(/^\n+/, '')}`;
}
