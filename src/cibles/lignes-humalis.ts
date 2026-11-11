/**
 * Relier le code produit aux lignes Humalis.
 *
 * Les générateurs posent un repère au début du code de chaque action
 * (`/*@humalis-ligne 12*\/`, la ligne fusionnée du projet, voir
 * src/fichiers.ts). Le repère est un commentaire valable en JavaScript,
 * Swift, Kotlin et C# : il ne gêne personne tant qu'il n'a pas été lu.
 *
 * Une fois le projet produit, `appliquerLignesHumalis` lit les repères et
 * les remplace par ce que chaque langage sait faire :
 *
 * - JavaScript : une carte de sources (`x.js.map`, `sourceMappingURL`) qui
 *   mène aux fichiers `.humalis` ; Node l'applique aux piles d'erreurs, le
 *   navigateur et VS Code s'en servent pour les points d'arrêt ;
 * - Swift : `#sourceLocation(file:line:)`, lu par le compilateur (piles,
 *   `#line`, débogueur) ;
 * - C# : `#line N "fichier"`, lu de la même façon ;
 * - Kotlin : une table (fichier et ligne produits → ligne Humalis) écrite
 *   dans le projet et lue par la capture des erreurs.
 *
 * Portée d'un repère : sa ligne, puis les lignes plus indentées qui la
 * suivent (le corps d'un « si », d'une boucle), et les lignes de même
 * retrait qui ferment un bloc (`}`, `)`, `]`). Un repère plus intérieur
 * l'emporte sur son parent.
 */
import { DECALAGE, ligneLocale } from '../fichiers.js';
import { REPERE_SOURCES } from './commun/lignes-web.js';

const DEBUT = '/*@humalis-ligne ';
const MOTIF = /\/\*@humalis-ligne (\d+)\*\//g;

/**
 * Les repères ne sont posés que sur demande : la commande `compile` les
 * demande, puis les remplace en écrivant le projet. Un générateur appelé
 * seul (tests, machine) rend un code sans repère.
 */
let reperesActifs = false;

export function activerReperes(oui: boolean): void {
  reperesActifs = oui;
}

/** Le code produit par `faire`, avec les repères de lignes. */
export function avecReperes<T>(faire: () => T): T {
  const avant = reperesActifs;
  reperesActifs = true;
  try {
    return faire();
  } finally {
    reperesActifs = avant;
  }
}

/** Le repère d'une ligne Humalis ; rien si la ligne est inconnue ou si les repères ne sont pas demandés. */
export function repereLigne(ligne: number | undefined): string {
  return reperesActifs && ligne !== undefined && ligne > 0 ? `${DEBUT}${ligne}*/` : '';
}

/** Vrai si le code porte au moins un repère. */
export const aDesReperes = (code: string): boolean => code.includes(DEBUT);

/** Retire les repères sans rien produire (pour un code où ils n'ont pas d'usage). */
export const sansReperes = (code: string): string => code.replace(MOTIF, '');

/** Un morceau de ligne produite relié à une ligne Humalis (0 : à aucune). */
export interface Segment {
  colonne: number;
  ligne: number;
  /** Vrai pour un repère écrit par le générateur (le début d'une action), faux pour une ligne de sa portée. */
  repere?: boolean;
}

export interface CodeLu {
  /** Le code sans ses repères. */
  code: string;
  /** Pour chaque ligne produite, ses segments, dans l'ordre des colonnes ; vide : ligne sans lien. */
  segments: Segment[][];
}

const FERMANTES = /^[}\])]/;

/** Lit les repères d'un code, calcule leur portée, et rend le code nettoyé. */
export function lireReperes(code: string): CodeLu {
  const lignes = code.split('\n');
  const segments: Segment[][] = [];
  const pile: { retrait: number; ligne: number }[] = [];
  const sortie: string[] = [];
  for (const brute of lignes) {
    const reperes: Segment[] = [];
    let nette = '';
    let dernier = 0;
    for (const trouve of brute.matchAll(MOTIF)) {
      nette += brute.slice(dernier, trouve.index);
      reperes.push({ colonne: nette.length, ligne: Number(trouve[1]), repere: true });
      dernier = trouve.index! + trouve[0].length;
    }
    nette += brute.slice(dernier);
    sortie.push(nette);
    const contenu = nette.trimStart();
    if (contenu === '') {
      segments.push(pile.length > 0 ? [{ colonne: 0, ligne: pile.at(-1)!.ligne }] : []);
      continue;
    }
    const retrait = nette.length - contenu.length;
    const repereAuDebut = reperes.length > 0 && reperes[0]!.colonne === retrait;
    while (pile.length > 0) {
      const haut = pile.at(-1)!;
      if (retrait > haut.retrait) break;
      if (retrait === haut.retrait && !repereAuDebut && FERMANTES.test(contenu)) break;
      pile.pop();
    }
    const ici: Segment[] = [];
    if (repereAuDebut) {
      pile.push({ retrait, ligne: reperes[0]!.ligne });
      ici.push(...reperes);
    } else {
      if (pile.length > 0) ici.push({ colonne: retrait, ligne: pile.at(-1)!.ligne });
      // Des repères au milieu de la ligne (« { a; b } » écrit d'un trait) : chacun son morceau.
      for (const r of reperes) ici.push(r);
    }
    segments.push(ici);
  }
  return { code: sortie.join('\n'), segments };
}

/** « pages/panier.humalis », ligne 6 : la ligne fusionnée rendue à son fichier. */
export function situerLigne(ligne: number, fichiers: readonly string[]): { fichier: string; ligne: number } | undefined {
  const fichier = fichiers[Math.floor(ligne / DECALAGE)];
  const locale = ligneLocale(ligne);
  return fichier === undefined || locale <= 0 ? undefined : { fichier, ligne: locale };
}

/** « ligne 6 de panier.humalis » : la forme montrée aux personnes. */
export function ligneEnClair(fichier: string, ligne: number): string {
  return `ligne ${ligne} de ${fichier}`;
}

// --- Cartes de sources (JavaScript) ---------------------------------------

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(valeur: number): string {
  let v = valeur < 0 ? (-valeur << 1) | 1 : valeur << 1;
  let sortie = '';
  do {
    let chiffre = v & 31;
    v >>>= 5;
    if (v > 0) chiffre |= 32;
    sortie += BASE64[chiffre];
  } while (v > 0);
  return sortie;
}

export function decoderVlq(texte: string): number[] {
  const valeurs: number[] = [];
  let valeur = 0;
  let decalage = 0;
  for (const caractere of texte) {
    const chiffre = BASE64.indexOf(caractere);
    if (chiffre < 0) continue;
    valeur += (chiffre & 31) << decalage;
    if (chiffre & 32) decalage += 5;
    else {
      valeurs.push(valeur & 1 ? -(valeur >>> 1) : valeur >>> 1);
      valeur = 0;
      decalage = 0;
    }
  }
  return valeurs;
}

export interface CarteDeSources {
  version: 3;
  file: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  names: string[];
  mappings: string;
}

/**
 * La carte d'un fichier produit. `chemins` donne, pour chaque fichier
 * Humalis du projet, le chemin écrit dans la carte (relatif à la carte) ;
 * `contenus` son texte, pour que l'outil n'ait pas à le chercher.
 */
export function carteDeSources(nom: string, segments: Segment[][], fichiers: readonly string[], chemins: (fichier: string) => string, contenus?: (fichier: string) => string | undefined): CarteDeSources {
  const index = new Map<string, number>();
  const sources: string[] = [];
  const textes: (string | null)[] = [];
  let precedent = { source: 0, ligne: 0 };
  const lignes: string[] = [];
  let avaitLien = false;
  for (const morceaux of segments) {
    let colonnePrecedente = 0;
    const codes: string[] = [];
    for (const s of morceaux) {
      const situe = s.ligne > 0 ? situerLigne(s.ligne, fichiers) : undefined;
      if (!situe) {
        codes.push(vlq(s.colonne - colonnePrecedente));
        colonnePrecedente = s.colonne;
        continue;
      }
      let i = index.get(situe.fichier);
      if (i === undefined) {
        i = sources.length;
        index.set(situe.fichier, i);
        sources.push(chemins(situe.fichier));
        textes.push(contenus?.(situe.fichier) ?? null);
      }
      codes.push(vlq(s.colonne - colonnePrecedente) + vlq(i - precedent.source) + vlq(situe.ligne - 1 - precedent.ligne) + vlq(0));
      colonnePrecedente = s.colonne;
      precedent = { source: i, ligne: situe.ligne - 1 };
    }
    // Une ligne sans lien après une ligne reliée : un segment vide, pour que rien ne déborde.
    if (codes.length === 0 && avaitLien) codes.push(vlq(0));
    avaitLien = morceaux.length > 0;
    lignes.push(codes.join(','));
  }
  return {
    version: 3,
    file: nom,
    sources,
    ...(textes.some((t) => t !== null) ? { sourcesContent: textes } : {}),
    names: [],
    mappings: lignes.join(';'),
  };
}

/** Une entrée de table : ligne et colonne produites (à partir de 1), fichier Humalis (index), ligne Humalis ; 0 : sans lien. */
export type EntreeTable = [number, number, number, number];

/**
 * La table compacte d'une carte : ce que la capture des erreurs lit pour
 * rendre une pile à ses lignes Humalis. `estHumalis` choisit les sources
 * gardées (celles qui finissent par .humalis).
 */
export function tableDepuisCarte(carte: { sources: string[]; mappings: string }, fichiers: string[], nomSource: (source: string) => string | undefined): EntreeTable[] {
  const table: EntreeTable[] = [];
  let source = 0;
  let ligneSource = 0;
  carte.mappings.split(';').forEach((ligne, numero) => {
    let colonne = 0;
    for (const morceau of ligne.split(',')) {
      if (morceau === '') continue;
      const v = decoderVlq(morceau);
      colonne += v[0] ?? 0;
      if (v.length < 4) {
        table.push([numero + 1, colonne + 1, -1, 0]);
        continue;
      }
      source += v[1]!;
      ligneSource += v[2]!;
      const nom = nomSource(carte.sources[source] ?? '');
      if (nom === undefined) {
        table.push([numero + 1, colonne + 1, -1, 0]);
        continue;
      }
      let i = fichiers.indexOf(nom);
      if (i < 0) {
        i = fichiers.length;
        fichiers.push(nom);
      }
      const precedente = table.at(-1);
      // Deux entrées de suite pour la même ligne Humalis : la première suffit.
      if (precedente && precedente[2] === i && precedente[3] === ligneSource + 1) continue;
      table.push([numero + 1, colonne + 1, i, ligneSource + 1]);
    }
  });
  return table;
}

// --- Swift, C#, Kotlin ------------------------------------------------------

/** Le chemin écrit dans le code natif : le fichier Humalis tel que l'auteur le nomme. */
const guillemets = (texte: string) => JSON.stringify(texte);

/** Pour chaque ligne produite, la ligne Humalis qui la couvre (0 : aucune). */
function lignesCouvertes(segments: Segment[][]): number[] {
  return segments.map((s) => s.find((m) => m.ligne > 0)?.ligne ?? 0);
}

/**
 * Swift : `#sourceLocation` devant chaque instruction reliée. La directive
 * n'est permise qu'entre deux instructions : elle n'est posée que devant une
 * ligne qui en commence une (celle d'un repère, ou une ligne de sa portée
 * qui ne prolonge pas l'expression d'avant).
 */
/** Vrai si la ligne commence une instruction Swift (et ne prolonge pas l'expression de la ligne d'avant). */
function commenceUneInstruction(contenu: string, precedente: string): boolean {
  if (contenu === '') return false;
  if (/^[.)\]},:?&|+*/%=<>!-]/.test(contenu) || /^(else\b|catch\b|case |default:|@|#)/.test(contenu)) return false;
  if (precedente.endsWith('{') || /\bin$/.test(precedente)) return /^\S/.test(contenu);
  return !/[,(\[=+\-*/&|?:.]$|\breturn$/.test(precedente);
}

export function versSwift(lu: CodeLu, fichiers: readonly string[], chemin: (fichier: string) => string, suivre = false): string {
  const lignes = lu.code.split('\n');
  const couvertes = lignesCouvertes(lu.segments);
  const sortie: string[] = [];
  let active = 0;
  let precedente = '';
  let dansChaine = false;
  for (let i = 0; i < lignes.length; i++) {
    const texte = lignes[i]!;
    const contenu = texte.trim();
    const voulue = couvertes[i]!;
    const debutInstruction = !dansChaine && commenceUneInstruction(contenu, precedente);
    // Chaque instruction reliée redit sa ligne (sinon Swift compte +1 par ligne produite) ; hors de toute portée, on revient au fichier produit.
    if (debutInstruction && (voulue > 0 || active > 0)) {
      const situe = voulue > 0 ? situerLigne(voulue, fichiers) : undefined;
      const retrait = texte.slice(0, texte.length - texte.trimStart().length);
      if (situe) {
        sortie.push(`${retrait}#sourceLocation(file: ${guillemets(chemin(situe.fichier))}, line: ${situe.ligne})`);
        active = voulue;
        // La capture des erreurs fatales lit la dernière ligne Humalis commencée (un signal ne peut rien lire d'autre).
        if (suivre && lu.segments[i]![0]?.repere && lu.segments[i]![0]!.colonne === retrait.length) sortie.push(`${retrait}HumalisLignes.ici = ${voulue}`);
      } else {
        sortie.push(`${retrait}#sourceLocation()`);
        active = 0;
      }
    }
    sortie.push(texte);
    if ((texte.match(/"""/g)?.length ?? 0) % 2 === 1) dansChaine = !dansChaine;
    if (contenu !== '' && !dansChaine) precedente = contenu.replace(/\/\/.*$/, '').trimEnd();
  }
  if (active > 0) sortie.push('#sourceLocation()');
  return sortie.join('\n');
}

/** C# : `#line N "fichier"` devant chaque ligne reliée, `#line default` après. */
export function versCSharp(lu: CodeLu, fichiers: readonly string[], chemin: (fichier: string) => string): string {
  const lignes = lu.code.split('\n');
  const couvertes = lignesCouvertes(lu.segments);
  const sortie: string[] = [];
  let active = 0;
  for (let i = 0; i < lignes.length; i++) {
    const texte = lignes[i]!;
    const voulue = couvertes[i]!;
    // Une chaîne verbatim ou brute sur plusieurs lignes : on n'y glisse rien.
    if (voulue > 0) {
      const situe = situerLigne(voulue, fichiers);
      // Chaque ligne reliée redit sa ligne : sinon C# compterait +1 à chaque ligne produite.
      if (situe) sortie.push(`#line ${situe.ligne} ${guillemets(chemin(situe.fichier))}`);
      active = situe ? voulue : 0;
    } else if (active > 0) {
      sortie.push('#line default');
      active = 0;
    }
    sortie.push(texte);
  }
  if (active > 0) sortie.push('#line default');
  return sortie.join('\n');
}

/**
 * Kotlin : rien dans le code (pas de directive de ligne), une table à part.
 * Rend, pour le fichier, les plages [ligne produite de début, ligne de fin,
 * index du fichier Humalis, ligne Humalis].
 */
export function plagesKotlin(lu: CodeLu, fichiers: readonly string[], index: (fichier: string) => number): [number, number, number, number][] {
  const couvertes = lignesCouvertes(lu.segments);
  const plages: [number, number, number, number][] = [];
  couvertes.forEach((ligne, i) => {
    if (ligne <= 0) return;
    const situe = situerLigne(ligne, fichiers);
    if (!situe) return;
    const k = index(situe.fichier);
    const derniere = plages.at(-1);
    if (derniere && derniere[1] === i && derniere[2] === k && derniere[3] === situe.ligne) derniere[1] = i + 1;
    else plages.push([i + 1, i + 1, k, situe.ligne]);
  });
  return plages;
}

// --- Le projet entier -------------------------------------------------------

export type LangageProduit = 'js' | 'ts' | 'swift' | 'csharp' | 'kotlin';

export function langageDe(chemin: string): LangageProduit | undefined {
  if (/\.(m|c)?js$/.test(chemin)) return 'js';
  if (/\.(m|c)?tsx?$/.test(chemin) && !chemin.endsWith('.d.ts')) return 'ts';
  if (chemin.endsWith('.swift')) return 'swift';
  if (chemin.endsWith('.cs')) return 'csharp';
  if (chemin.endsWith('.kt')) return 'kotlin';
  return undefined;
}

export interface OptionsLignes {
  /** Les fichiers Humalis du projet, le principal en premier (chemins relatifs au principal). */
  fichiers: readonly string[];
  /**
   * Le chemin du dossier du fichier principal vu depuis la racine du projet
   * produit (« ../.. ») ; les cartes de sources s'en servent.
   */
  versLesSources: string;
  /** Le texte d'un fichier Humalis, pour l'écrire dans la carte ; undefined : non écrit. */
  lire?: (fichier: string) => string | undefined;
  /** Kotlin : le paquet et le dossier de la table (`app/src/main/java/…`). */
  kotlin?: { paquet: string; dossier: string };
  /** Faux : les cartes ne portent pas le texte des fichiers Humalis (un site publié tel quel). */
  contenus?: boolean;
  /** Le chemin absolu du dossier des fichiers Humalis : Swift l'écrit dans `#sourceLocation`, pour le débogueur. */
  dossierAbsolu?: string;
}

const dossierDe = (chemin: string) => (chemin.includes('/') ? chemin.slice(0, chemin.lastIndexOf('/')) : '');
const nomDe = (chemin: string) => chemin.slice(chemin.lastIndexOf('/') + 1);

/** « a/b/c.js » + « ../x.humalis » vu de la racine → le même fichier vu de « a/b ». */
function depuis(dossier: string, cheminRacine: string): string {
  const profondeur = dossier === '' ? 0 : dossier.split('/').length;
  const relatif = '../'.repeat(profondeur) + cheminRacine;
  // « a/../b » : simplifié.
  const parties: string[] = [];
  for (const p of relatif.split('/')) {
    if (p === '..' && parties.length > 0 && parties.at(-1) !== '..') parties.pop();
    else if (p !== '.' && p !== '') parties.push(p);
  }
  return parties.join('/');
}

/**
 * Remplace les repères de tous les fichiers produits. Les fichiers JS
 * reçoivent leur carte (`.map`) ; Kotlin reçoit sa table ; les autres
 * fichiers sont rendus sans repère.
 */
export function appliquerLignesHumalis(fichiers: Map<string, string>, options: OptionsLignes): Map<string, string> {
  const resultat = new Map<string, string>();
  const racine = options.versLesSources.replace(/\/+$/, '');
  const versSource = (fichier: string) => (racine === '' || racine === '.' ? fichier : `${racine}/${fichier}`);
  const tablesKotlin: { fichier: string; plages: [number, number, number, number][] }[] = [];
  // Une application Apple qui capture ses erreurs suit la dernière ligne Humalis commencée.
  const captureSwift = [...fichiers.keys()].find((c) => c.endsWith('.swift') && fichiers.get(c)!.includes('enum HumalisLignes'));
  const suivreSwift = captureSwift !== undefined;
  const indexKotlin = new Map<string, number>();
  for (const [chemin, brut] of fichiers) {
    // Le module Vite des lignes apprend ici où sont les fichiers Humalis.
    const contenu = brut.includes(REPERE_SOURCES) ? brut.replaceAll(JSON.stringify(REPERE_SOURCES), JSON.stringify(depuis('', racine === '' ? '.' : racine) || '.')) : brut;
    if (!aDesReperes(contenu)) {
      resultat.set(chemin, contenu);
      continue;
    }
    const langage = langageDe(chemin);
    if (langage === undefined) {
      resultat.set(chemin, sansReperes(contenu));
      continue;
    }
    const lu = lireReperes(contenu);
    if (langage === 'js') {
      const nom = nomDe(chemin);
      const dossier = dossierDe(chemin);
      const carte = carteDeSources(nom, lu.segments, options.fichiers, (f) => depuis(dossier, versSource(f)), options.contenus === false ? undefined : options.lire);
      resultat.set(chemin, `${lu.code.replace(/\n?$/, '\n')}//# sourceMappingURL=${nom}.map\n`);
      resultat.set(`${chemin}.map`, JSON.stringify(carte));
    } else if (langage === 'ts') {
      // TypeScript : la carte va à côté, sans commentaire ; après tsc, humalis-cartes.mjs la compose avec celle de tsc.
      const nom = nomDe(chemin);
      const dossier = dossierDe(chemin);
      resultat.set(chemin, lu.code);
      resultat.set(`${chemin}.map`, JSON.stringify(carteDeSources(nom, lu.segments, options.fichiers, (f) => depuis(dossier, versSource(f)), options.contenus === false ? undefined : options.lire)));
    } else if (langage === 'swift') {
      const absolu = (f: string) => (options.dossierAbsolu ? `${options.dossierAbsolu.replace(/\/+$/, '')}/${f}` : f);
      resultat.set(chemin, versSwift(lu, options.fichiers, absolu, suivreSwift));
    } else if (langage === 'csharp') {
      resultat.set(chemin, versCSharp(lu, options.fichiers, (f) => f));
    } else {
      resultat.set(chemin, lu.code);
      const plages = plagesKotlin(lu, options.fichiers, (f) => {
        let i = indexKotlin.get(f);
        if (i === undefined) {
          i = indexKotlin.size;
          indexKotlin.set(f, i);
        }
        return i;
      });
      if (plages.length > 0) tablesKotlin.push({ fichier: nomDe(chemin), plages });
    }
  }
  if (captureSwift) {
    // La table des fichiers Humalis de la capture Apple : connue seulement ici.
    resultat.set(captureSwift, resultat.get(captureSwift)!.replace('[/*@humalis-fichiers*/]', `[${options.fichiers.map(guillemets).join(', ')}]`));
  }
  if (options.kotlin) {
    resultat.set(`${options.kotlin.dossier}/HumalisLignes.kt`, tableKotlin(options.kotlin.paquet, [...indexKotlin.keys()], tablesKotlin));
  }
  return resultat;
}

/**
 * La table Kotlin : chaque fichier produit, ses plages, encodées dans un
 * texte (une ligne par plage) pour garder le fichier petit et la méthode
 * sous la limite de la JVM.
 */
export function tableKotlin(paquet: string, fichiersHumalis: string[], tables: { fichier: string; plages: [number, number, number, number][] }[]): string {
  const donnees = tables.map((t) => `${t.fichier}\n${t.plages.map((p) => p.join(' ')).join('\n')}`).join('\n\n');
  return `// Produit par Humalis : les lignes Humalis du code produit, pour les piles d'erreurs.
package ${paquet}

object HumalisLignes {
    private val fichiers = arrayOf(${fichiersHumalis.map(guillemets).join(', ')})
    private val plages: Map<String, List<IntArray>> by lazy {
        val resultat = HashMap<String, MutableList<IntArray>>()
        var courant: MutableList<IntArray>? = null
        for (ligne in DONNEES.lineSequence()) {
            if (ligne.isEmpty()) { courant = null; continue }
            val parties = ligne.split(' ')
            if (parties.size == 1) { courant = resultat.getOrPut(parties[0]) { mutableListOf() }; continue }
            courant?.add(IntArray(4) { parties[it].toInt() })
        }
        resultat
    }

    /** « ligne 12 de boutique.humalis », ou null si la ligne produite n'en vient pas. */
    fun situer(fichier: String?, ligne: Int): Pair<String, Int>? {
        val liste = plages[fichier ?: return null] ?: return null
        var bas = 0
        var haut = liste.size - 1
        while (bas <= haut) {
            val milieu = (bas + haut) ushr 1
            val p = liste[milieu]
            when {
                ligne < p[0] -> haut = milieu - 1
                ligne > p[1] -> bas = milieu + 1
                else -> return fichiers[p[2]] to p[3]
            }
        }
        return null
    }

    /** La première ligne Humalis d'une pile : « boutique.humalis:12 », ou "" si aucune. */
    fun ligne(erreur: Throwable): String {
        for (cadre in erreur.stackTrace) situer(cadre.fileName, cadre.lineNumber)?.let { return "\${it.first}:\${it.second}" }
        return erreur.cause?.let { ligne(it) } ?: ""
    }

    /** La pile, chaque ligne produite rendue à sa ligne Humalis quand elle en vient. */
    fun pile(erreur: Throwable): String = buildString {
        append(erreur.toString())
        for (cadre in erreur.stackTrace) {
            val situe = situer(cadre.fileName, cadre.lineNumber)
            append("\\n    at ").append(cadre.className).append('.').append(cadre.methodName).append(" (")
            if (situe != null) append("ligne ").append(situe.second).append(" de ").append(situe.first)
            else append(cadre.fileName ?: "?").append(':').append(cadre.lineNumber)
            append(')')
        }
        erreur.cause?.let { append("\\nCaused by: ").append(pile(it)) }
    }

    private const val DONNEES = ${guillemets(donnees)}
}
`;
}

/**
 * Le script écrit dans un projet TypeScript (serveur, bureau) : après tsc,
 * il compose chaque carte `dist/…/x.js.map` (JavaScript → TypeScript) avec
 * la carte `src/…/x.ts.map` écrite par Humalis (TypeScript → Humalis). Node,
 * lancé avec --enable-source-maps, montre alors les lignes Humalis dans les
 * piles d'erreurs, et le débogueur pose ses points d'arrêt dans les
 * fichiers `.humalis`.
 */
export const COMPOSER_CARTES_JS = `// Produit par Humalis : relie le JavaScript construit aux lignes Humalis.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function decoder(texte) {
  const valeurs = [];
  let valeur = 0;
  let decalage = 0;
  for (const caractere of texte) {
    const chiffre = BASE64.indexOf(caractere);
    if (chiffre < 0) continue;
    valeur += (chiffre & 31) << decalage;
    if (chiffre & 32) decalage += 5;
    else {
      valeurs.push(valeur & 1 ? -(valeur >>> 1) : valeur >>> 1);
      valeur = 0;
      decalage = 0;
    }
  }
  return valeurs;
}
function coder(valeur) {
  let v = valeur < 0 ? (-valeur << 1) | 1 : valeur << 1;
  let sortie = '';
  do {
    let chiffre = v & 31;
    v >>>= 5;
    if (v > 0) chiffre |= 32;
    sortie += BASE64[chiffre];
  } while (v > 0);
  return sortie;
}

/** Une carte décodée : par ligne, des segments [colonne, source, ligne, colonne source] (source -1 : sans lien). */
function lire(carte) {
  const lignes = [];
  let source = 0, ligne = 0, colonneSource = 0;
  for (const texte of carte.mappings.split(';')) {
    const segments = [];
    let colonne = 0;
    for (const morceau of texte.split(',')) {
      if (!morceau) continue;
      const v = decoder(morceau);
      colonne += v[0] ?? 0;
      if (v.length >= 4) {
        source += v[1]; ligne += v[2]; colonneSource += v[3];
        segments.push([colonne, source, ligne, colonneSource]);
      } else segments.push([colonne, -1, 0, 0]);
    }
    lignes.push(segments);
  }
  return lignes;
}

function ecrireMappings(lignes) {
  let source = 0, ligne = 0, colonneSource = 0;
  return lignes.map((segments) => {
    let colonne = 0;
    return segments.map(([c, s, l, cs]) => {
      let code = coder(c - colonne);
      colonne = c;
      if (s >= 0) {
        code += coder(s - source) + coder(l - ligne) + coder(cs - colonneSource);
        source = s; ligne = l; colonneSource = cs;
      }
      return code;
    }).join(',');
  }).join(';');
}

/** Le segment d'une ligne qui couvre la colonne (le premier si la colonne est avant). */
function couvrant(segments, colonne) {
  if (!segments || segments.length === 0) return undefined;
  let trouve = segments[0];
  for (const s of segments) if (s[0] <= colonne) trouve = s; else break;
  return trouve;
}

function fichiers(dossier) {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : chemin.endsWith('.js.map') ? [chemin] : [];
  });
}

let composees = 0;
for (const cheminCarte of fichiers(resolve(process.argv[2] ?? 'dist'))) {
  const exterieure = JSON.parse(readFileSync(cheminCarte, 'utf8'));
  const ici = dirname(cheminCarte);
  const interieures = exterieure.sources.map((s) => {
    const ts = resolve(ici, exterieure.sourceRoot ?? '', s);
    if (!existsSync(ts + '.map')) return undefined;
    const carte = JSON.parse(readFileSync(ts + '.map', 'utf8'));
    return { carte, lignes: lire(carte), dossier: dirname(ts) };
  });
  if (interieures.every((i) => i === undefined)) continue;
  const sources = [];
  const contenus = [];
  const indexDe = (chemin, contenu) => {
    let i = sources.indexOf(chemin);
    if (i < 0) { i = sources.push(chemin) - 1; contenus.push(contenu ?? null); }
    return i;
  };
  const lignes = lire(exterieure).map((segments) => segments.map(([c, s, l, cs]) => {
    if (s < 0) return [c, -1, 0, 0];
    const interieure = interieures[s];
    const cheminTs = resolve(ici, exterieure.sourceRoot ?? '', exterieure.sources[s]);
    if (interieure) {
      const segment = couvrant(interieure.lignes[l], cs);
      if (segment && segment[1] >= 0) {
        const humalis = resolve(interieure.dossier, interieure.carte.sources[segment[1]]);
        return [c, indexDe(relative(ici, humalis).split(sep).join('/'), interieure.carte.sourcesContent?.[segment[1]]), segment[2], 0];
      }
    }
    return [c, indexDe(relative(ici, cheminTs).split(sep).join('/'), exterieure.sourcesContent?.[s]), l, cs];
  }));
  const composee = { version: 3, file: exterieure.file, sources, names: [], mappings: ecrireMappings(lignes) };
  if (contenus.some((c) => c !== null)) composee.sourcesContent = contenus;
  writeFileSync(cheminCarte, JSON.stringify(composee));
  composees++;
}
if (composees > 0) console.error('Lignes Humalis : ' + composees + ' carte(s) composée(s).');
`;
