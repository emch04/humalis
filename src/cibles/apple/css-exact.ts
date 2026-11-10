/**
 * « dessinee pour 1440 par 900 » : le CSS du projet est résolu ici, élément par élément, comme le
 * ferait un navigateur (sélecteurs complets, priorités, héritage). Sur Mac, chaque élément reçoit le
 * style qui en sort, que le moteur de mise en page de Dessin.swift applique au point près.
 * Le survol n'est pas repris : sur Mac, seul l'état réel d'un élément le change.
 */
import type { NoeudVue } from '../../ri/types.js';
import { lireIconesSvg, type IconeDessinee } from '../../icones-svg.js';

export interface Mesure { p?: number; c?: number; v?: number; w?: number }
type Marge = Mesure | 'auto';
type CouleurJ = [number, number, number, number];
interface Arret { c: CouleurJ; p: number }
interface Fond { c?: CouleurJ; l?: { a: number; s: Arret[] }; r?: { x: number; y: number; rx: number; ry: number; s: Arret[] } }
interface Ombre { x: number; y: number; f: number; e: number; c: CouleurJ; i?: boolean }
interface Piste { m?: Mesure; fr?: number; af?: number }

/** Ce qui part vers Swift : seules les valeurs utiles y sont. */
export interface StyleJ {
  d?: string; ix?: boolean; col?: boolean; wr?: boolean; jc?: string; ai?: string; ji?: string; ac?: string; as?: string; js?: string;
  gl?: number; gc?: number; co?: Piste[]; ro?: Piste[]; gcs?: number; gce?: number; grs?: number; gre?: number;
  pa?: [number, number, number, number]; ma?: [Marge, Marge, Marge, Marge];
  la?: Mesure; ha?: Mesure; lm?: Mesure; hm?: Mesure; lM?: Mesure; hM?: Mesure;
  ab?: boolean; to?: Mesure; ri?: Mesure; bo?: Mesure; le?: Mesure; z?: number;
  fg?: number; fs?: number; fb?: Mesure;
  tx?: Mesure; ty?: Mesure; ro2?: number;
  fo?: Fond[]; ar?: [number, number, number, number];
  bd?: ([number, CouleurJ] | null)[]; om?: Ombre[]; po?: [Mesure, Mesure][]; op?: number; oh?: boolean; sc?: boolean; cach?: boolean;
  ic?: number;
  /** Une image de fond SVG (data:), tracée sous le contenu : son rang dans la table des masques. */
  fi?: number;
  // Texte
  t?: number; g?: number; f?: string; c?: CouleurJ; li?: number; lp?: number; tr?: number; ta?: string; cas?: string; nw?: boolean; el?: boolean; it?: boolean; nb?: boolean;
}

interface Selecteur { parties: Compose[]; liens: string[]; pseudo?: 'before' | 'after' }
interface Compose { tag?: string; id?: string; classes: string[]; premier?: boolean; dernier?: boolean; non: Compose[]; a: Compose[]; ou?: Compose[]; sansPoids?: boolean; impossible?: boolean }
/** Les conditions d'une règle : la largeur (« @media »), le mode sombre et l'appareil de sa feuille. */
interface Condition { min?: number; max?: number; sombre?: boolean; os?: 'ios' | 'macos' }

/** Une façon de voir la page : une largeur d'écran, en clair ou en sombre. */
export interface Variante { largeur: number; sombre: boolean }
interface Regle { selecteur: Selecteur; specificite: number; rang: number; declarations: [string, string, boolean][]; condition: Condition }

/** « @media (min-width: 900px) and (max-width: 1200px) » ; undefined : la règle ne vaut jamais pour un dessin. */
export function conditionMedia(requete: string): Condition | undefined {
  const c: Condition = {};
  const texte = requete.replace(/^@media\s*/i, '').trim().toLowerCase();
  // Plusieurs requêtes séparées par des virgules : trop rare pour un dessin, on ne garde que la première.
  for (const morceau of texte.split(',')[0]!.split(/\s+and\s+/)) {
    const m = morceau.trim();
    if (m === '' || m === 'screen' || m === 'all' || m === 'only screen') continue;
    const theme = /^\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)$/.exec(m);
    if (theme) { c.sombre = theme[1] === 'dark'; continue; }
    const l = /^\(\s*(min|max)-width\s*:\s*([\d.]+)\s*(px|em|rem)?\s*\)$/.exec(m);
    if (!l) return undefined;
    const v = Number(l[2]) * (l[3] === 'em' || l[3] === 'rem' ? 16 : 1);
    if (l[1] === 'min') c.min = Math.max(c.min ?? 0, v);
    else c.max = Math.min(c.max ?? Infinity, v);
  }
  return c;
}

/** Un élément de la page, avec ce qui l'entoure. */
interface Boite {
  noeud?: NoeudVue;
  /** Le dessin de « avec icone » : un élément <svg> dans celui-ci, comme sur le web. */
  iconeDe?: NoeudVue;
  /** Le <label> (ou le <fieldset>) qui entoure un champ, comme sur le web. */
  champDe?: NoeudVue;
  tag: string;
  classes: Set<string>;
  parent?: Boite;
  enfants: Boite[];
  boucle?: object;
  branches: [object, number][];
}

/** Dans une boucle, une ligne peut être la première, la dernière, ou entre les deux. */
interface Rang { premier: boolean; dernier: boolean; boucle?: object }
const DEDANS: Rang = { premier: false, dernier: false };

interface Herite { t: number; g: number; f?: string; c: CouleurJ; li?: number; lp?: number; tr?: number; ta?: string; cas?: string; nw?: boolean; it?: boolean; nb?: boolean; vars: Map<string, string> }

export interface EntreeStyle {
  /** Le code Swift du style. */
  code: string;
  /** Celui du style actif, pour un lien vers la page ouverte. */
  actif?: string;
  avant?: string;
  apres?: string;
  masque: boolean;
}

/** Ce que le navigateur donne avant toute feuille : les mêmes valeurs que Chrome et Safari. */
const BASE = `
div,section,header,footer,main,aside,nav,form,fieldset,legend,h1,h2,h3,h4,h5,h6,p,ul,ol,li{display:block}
h1{font-size:2em;font-weight:700;margin:.67em 0} h2{font-size:1.5em;font-weight:700;margin:.83em 0} h3{font-size:1.17em;font-weight:700;margin:1em 0}
h4{font-weight:700;margin:1.33em 0} h5{font-size:.83em;font-weight:700;margin:1.67em 0} h6{font-size:.67em;font-weight:700;margin:2.33em 0}
p{margin:1em 0} ul,ol{margin:1em 0;padding-left:40px}
input,textarea,select{font-size:13.333px;font-weight:400;padding:1px 2px;border:2px solid #767676;background:#ffffff;color:#000000}
textarea{padding:2px}
select{padding:0;border-radius:4px}
button,select{box-sizing:border-box}
fieldset{margin:0 2px;padding:.35em .75em .625em;border:2px solid #c0c0c0}
legend{padding:0 2px}
.humalis-case > input{box-sizing:border-box;width:13px;height:13px;margin:3px 3px 3px 4px;padding:0;border:none;background:transparent}
svg{display:inline-block;width:1em;height:1em} button{display:inline-block;text-align:center} a,span,label{display:inline} img,input,textarea,select{display:inline-block}
.humalis-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem}
.humalis-colonne{display:flex;flex-direction:column;gap:.75rem}
.humalis-grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:1rem}
`;

const NOMMEES: Record<string, string> = { white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080', orange: '#ffa500', yellow: '#ffff00', purple: '#800080', pink: '#ffc0cb' };
const ETATS = new Set(['hover', 'focus', 'focus-visible', 'focus-within', 'active', 'visited', 'checked', 'disabled', 'placeholder', 'selection', 'target', 'open', 'empty', 'invalid', 'valid', 'required', 'marker', '-webkit-scrollbar', '-webkit-search-cancel-button', 'backdrop', 'modal']);

function separer(texte: string, separateur: (c: string) => boolean): string[] {
  const parties: string[] = [];
  let profondeur = 0, courant = '', guillemet = '';
  for (const c of texte) {
    if (guillemet) { courant += c; if (c === guillemet) guillemet = ''; continue; }
    if (c === '"' || c === "'") { guillemet = c; courant += c; continue; }
    if (c === '(') profondeur++;
    if (c === ')') profondeur--;
    if (profondeur === 0 && separateur(c)) { if (courant.trim()) parties.push(courant.trim()); courant = ''; } else courant += c;
  }
  if (courant.trim()) parties.push(courant.trim());
  return parties;
}
const parEspaces = (v: string) => separer(v, (c) => /\s/.test(c));
const parVirgules = (v: string) => separer(v, (c) => c === ',');
const quatre = <T>(p: T[]): [T, T, T, T] | undefined => (p.length === 1 ? [p[0], p[0], p[0], p[0]] : p.length === 2 ? [p[0], p[1], p[0], p[1]] : p.length === 3 ? [p[0], p[1], p[2], p[1]] : p.length === 4 ? [p[0], p[1], p[2], p[3]] : undefined);
const arrondir = (n: number) => Number(n.toFixed(3));

/** Le contenu d'un sélecteur « a b > c + d », découpé. */
function lireSelecteur(brut: string): Selecteur | undefined {
  let texte = brut.trim();
  let pseudo: Selecteur['pseudo'];
  const avant = /::?(before|after)\s*$/.exec(texte);
  if (avant) { pseudo = avant[1] as 'before' | 'after'; texte = texte.slice(0, avant.index); }
  const morceaux: string[] = [];
  const liens: string[] = [];
  let courant = '', profondeur = 0;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (c === '(' || c === '[') profondeur++;
    if (c === ')' || c === ']') profondeur--;
    if (profondeur === 0 && (c === '>' || c === '+' || c === '~' || /\s/.test(c))) {
      let j = i;
      let lien = ' ';
      while (j < texte.length && (/\s/.test(texte[j]) || '>+~'.includes(texte[j]))) { if ('>+~'.includes(texte[j])) lien = texte[j]; j++; }
      if (courant) { morceaux.push(courant); courant = ''; liens.push(lien); }
      i = j - 1;
    } else courant += c;
  }
  if (courant) morceaux.push(courant);
  else if (liens.length) liens.pop();
  if (morceaux.length === 0) { if (pseudo) morceaux.push('*'); else return undefined; }
  const parties: Compose[] = [];
  for (const m of morceaux) {
    const c = lireCompose(m);
    if (!c || c.impossible) return undefined;
    parties.push(c);
  }
  return { parties, liens, ...(pseudo ? { pseudo } : {}) };
}

function lireCompose(m: string): Compose | undefined {
  const c: Compose = { classes: [], non: [], a: [] };
  let i = 0;
  const nom = () => { const debut = i; while (i < m.length && /[\w-]|\\/.test(m[i])) i++; return m.slice(debut, i); };
  if (m[0] === '*') i = 1;
  else if (/[a-zA-Z]/.test(m[0] ?? '')) c.tag = nom().toLowerCase();
  while (i < m.length) {
    const s = m[i++];
    if (s === '.') c.classes.push(nom());
    else if (s === '#') c.id = nom();
    else if (s === '[') { c.impossible = true; return c; }
    else if (s === ':') {
      if (m[i] === ':') i++;
      const p = nom();
      let argument = '';
      if (m[i] === '(') {
        let profondeur = 1, j = i + 1;
        while (j < m.length && profondeur > 0) { if (m[j] === '(') profondeur++; if (m[j] === ')') profondeur--; j++; }
        argument = m.slice(i + 1, j - 1);
        i = j;
      }
      if (p === 'first-child') c.premier = true;
      else if (p === 'last-child') c.dernier = true;
      else if (p === 'not') for (const a of parVirgules(argument)) { const n = lireCompose(a); if (n) c.non.push(n); }
      else if (p === 'has') { const n = lireCompose(argument.trim()); if (n) c.a.push(n); }
      else if (p === 'root') c.tag = 'html';
      else if (p === 'is' || p === 'where') { c.ou = parVirgules(argument).flatMap((a) => { const n = lireCompose(a); return n && !n.impossible ? [n] : []; }); if (p === 'where') c.sansPoids = true; }
      else { c.impossible = true; return c; }
      if (ETATS.has(p)) { c.impossible = true; return c; }
    } else { c.impossible = true; return c; }
  }
  return c;
}

const specificiteDe = (s: Selecteur): number => s.parties.reduce((t, c) => t + poids(c), s.pseudo ? 1 : 0);
function poids(c: Compose): number {
  return (c.id ? 10000 : 0) + (c.classes.length + (c.premier ? 1 : 0) + (c.dernier ? 1 : 0) + (c.a.length ? 1 : 0)) * 100 + (c.tag ? 1 : 0) + c.non.reduce((t, n) => t + poids(n), 0) + (c.ou && !c.sansPoids ? Math.max(0, ...c.ou.map(poids)) : 0);
}

function couleur(valeur: string, courante?: CouleurJ): CouleurJ | undefined {
  const v = (NOMMEES[valeur.toLowerCase()] ?? valeur).trim();
  const b = v.toLowerCase();
  if (b === 'transparent') return [0, 0, 0, 0];
  if (b === 'currentcolor' || b === 'inherit') return courante;
  const hex = /^#([0-9a-f]{3,8})$/i.exec(v)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const p = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    return [parseInt(p.slice(0, 2), 16) / 255, parseInt(p.slice(2, 4), 16) / 255, parseInt(p.slice(4, 6), 16) / 255, p.length === 8 ? parseInt(p.slice(6, 8), 16) / 255 : 1].map(arrondir) as CouleurJ;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(v)?.[1];
  if (rgb) {
    const l = rgb.split(/[\s,/]+/).filter(Boolean).map((p) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p)));
    if (l.length >= 3 && l.every((n) => !Number.isNaN(n))) return [l[0] / 255, l[1] / 255, l[2] / 255, l[3] ?? 1].map(arrondir) as CouleurJ;
  }
  return undefined;
}

interface Contexte { taille: number; dessin: { largeur: number; hauteur: number }; courante: CouleurJ }

/** Une longueur : pixels, pourcentage, vh, vw, ou une somme calculée de ces valeurs. */
function mesure(v0: string, ctx: Contexte): Mesure | undefined {
  const v = v0.trim();
  if (v === '0') return { p: 0 };
  const simple = /^(-?\d*\.?\d+)(px|rem|em|%|vh|vw)$/i.exec(v);
  if (simple) {
    const n = parseFloat(simple[1]);
    switch (simple[2].toLowerCase()) {
      case 'px': return { p: n };
      case 'rem': return { p: n * 16 };
      case 'em': return { p: n * ctx.taille };
      case '%': return { c: n };
      case 'vh': return { v: n };
      default: return { w: n };
    }
  }
  const f = /^(calc|min|max|clamp)\((.*)\)$/is.exec(v);
  if (!f) return undefined;
  if (f[1].toLowerCase() === 'calc') return calcul(f[2], ctx);
  const parties = parVirgules(f[2]).map((p) => mesure(p, ctx));
  if (parties.some((p) => !p)) return undefined;
  const nombre = (m: Mesure) => (m.c !== undefined ? undefined : (m.p ?? 0) + ((m.v ?? 0) * ctx.dessin.hauteur) / 100 + ((m.w ?? 0) * ctx.dessin.largeur) / 100);
  const lus = parties as Mesure[];
  const valeurs = lus.map(nombre);
  if (valeurs.some((x) => x === undefined)) return lus[f[1].toLowerCase() === 'clamp' ? 1 : 0];
  const n = valeurs as number[];
  if (f[1].toLowerCase() === 'min') return { p: Math.min(...n) };
  if (f[1].toLowerCase() === 'max') return { p: Math.max(...n) };
  return { p: Math.min(n[2], Math.max(n[0], n[1])) };
}

function calcul(texte: string, ctx: Contexte): Mesure | undefined {
  const termes = separer(texte, (c) => /\s/.test(c));
  const somme: Mesure = {};
  let signe = 1;
  for (let i = 0; i < termes.length; i++) {
    const t = termes[i];
    if (t === '+') { signe = 1; continue; }
    if (t === '-') { signe = -1; continue; }
    let m = t.startsWith('(') ? calcul(t.slice(1, -1), ctx) : mesure(t, ctx);
    let facteur = 1;
    if (!m && /^-?\d*\.?\d+$/.test(t) && termes[i + 1] === '*') { facteur = parseFloat(t); i += 2; m = mesure(termes[i], ctx); }
    while (termes[i + 1] === '*' || termes[i + 1] === '/') {
      const n = parseFloat(termes[i + 2]);
      facteur = termes[i + 1] === '*' ? facteur * n : facteur / n;
      i += 2;
    }
    if (!m) return undefined;
    for (const k of ['p', 'c', 'v', 'w'] as const) if (m[k] !== undefined) somme[k] = (somme[k] ?? 0) + signe * facteur * m[k]!;
    signe = 1;
  }
  return somme;
}

/** Les couleurs d'un dégradé : les positions manquantes sont réparties, le transparent garde la teinte voisine. */
function arrets(parties: string[], ctx: Contexte): Arret[] {
  const lus: { c: CouleurJ; p?: number }[] = [];
  for (const partie of parties) {
    const mots = parEspaces(partie);
    const c = couleur(mots[0], ctx.courante);
    if (!c) continue;
    const positions = mots.slice(1).filter((m) => m.endsWith('%')).map((m) => parseFloat(m) / 100);
    if (positions.length === 0) lus.push({ c });
    for (const p of positions) lus.push({ c, p });
  }
  if (lus.length === 0) return [];
  lus[0].p ??= 0;
  lus[lus.length - 1].p ??= 1;
  for (let i = 1; i < lus.length - 1; i++) {
    if (lus[i].p !== undefined) continue;
    let j = i;
    while (lus[j].p === undefined) j++;
    const debut = lus[i - 1].p!, fin = lus[j].p!;
    for (let k = i; k < j; k++) lus[k].p = debut + ((fin - debut) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  return lus.map((a, i) => {
    let c = a.c;
    if (c[3] === 0) {
      const voisin = lus.slice(i + 1).find((x) => x.c[3] > 0) ?? [...lus.slice(0, i)].reverse().find((x) => x.c[3] > 0);
      if (voisin) c = [voisin.c[0], voisin.c[1], voisin.c[2], 0];
    }
    return { c, p: arrondir(a.p!) };
  });
}

function lireFond(valeur: string, ctx: Contexte): Fond[] | undefined {
  if (valeur === 'none' || valeur === 'transparent') return [];
  const couches: Fond[] = [];
  for (const couche of parVirgules(valeur)) {
    const l = /^(?:-webkit-)?linear-gradient\((.*)\)/is.exec(couche);
    const r = /^(?:-webkit-)?radial-gradient\((.*)\)/is.exec(couche);
    if (l) {
      const parties = parVirgules(l[1]);
      let angle = 180;
      const a = /^(-?\d*\.?\d+)deg$/.exec(parties[0]);
      if (a) { angle = parseFloat(a[1]); parties.shift(); }
      else if (parties[0].startsWith('to ')) {
        const sens = parties.shift()!.slice(3).trim();
        angle = { top: 0, right: 90, bottom: 180, left: 270, 'top right': 45, 'right top': 45, 'bottom right': 135, 'right bottom': 135, 'bottom left': 225, 'left bottom': 225, 'top left': 315, 'left top': 315 }[sens] ?? 180;
      }
      couches.push({ l: { a: angle, s: arrets(parties, ctx) } });
    } else if (r) {
      const parties = parVirgules(r[1]);
      let x = 50, y = 50, rx = 70.7, ry = 70.7;
      if (!couleur(parEspaces(parties[0])[0], ctx.courante)) {
        const forme = parties.shift()!;
        const [taille, centre] = forme.split(/\s+at\s+/);
        if (centre !== undefined) {
          const p = parEspaces(centre).map((m) => ({ left: 0, top: 0, center: 50, right: 100, bottom: 100 } as Record<string, number>)[m] ?? parseFloat(m));
          x = p[0] ?? 50;
          y = p[1] ?? 50;
        }
        const d = parEspaces(taille === undefined || /^at\b/.test(forme) ? '' : taille).filter((m) => m.endsWith('%'));
        if (d.length >= 1) { rx = parseFloat(d[0]); ry = parseFloat(d[1] ?? d[0]); }
        else {
          // « farthest-corner » : la distance au coin le plus éloigné, en proportion des côtés.
          const fx = Math.max(x, 100 - x), fy = Math.max(y, 100 - y);
          rx = fx * Math.SQRT2;
          ry = fy * Math.SQRT2;
        }
      }
      couches.push({ r: { x, y, rx, ry, s: arrets(parties, ctx) } });
    } else {
      const mots = parEspaces(couche);
      const c = mots.map((m) => couleur(m, ctx.courante)).find(Boolean);
      if (c) couches.push({ c });
    }
  }
  return couches.reverse();
}

function lirePistes(valeur: string, ctx: Contexte): Piste[] {
  if (valeur === 'none') return [];
  const pistes: Piste[] = [];
  for (const mot of parEspaces(valeur)) {
    const rep = /^repeat\((.*)\)$/is.exec(mot);
    if (rep) {
      const [n, ...reste] = parVirgules(rep[1]);
      const interieur = reste.join(',');
      if (/^auto-(fill|fit)$/.test(n)) {
        const m = /^minmax\(([^,]+(?:\([^)]*\))?),/.exec(interieur);
        const lue = m ? mesure(m[1], ctx) : undefined;
        pistes.push({ af: lue?.p ?? 160 });
      } else for (let i = 0; i < Number(n); i++) pistes.push(...lirePistes(interieur, ctx));
      continue;
    }
    const mm = /^minmax\((.*)\)$/is.exec(mot);
    const lu = mm ? (parVirgules(mm[1])[1] ?? '') : mot;
    if (lu.endsWith('fr')) pistes.push({ fr: parseFloat(lu) });
    else if (lu === 'auto' || lu.endsWith('content')) pistes.push({});
    else { const m = mesure(lu, ctx); pistes.push(m ? { m } : {}); }
  }
  return pistes;
}

const FLEX: Record<string, string> = { 'flex-start': 's', start: 's', left: 's', 'flex-end': 'e', end: 'e', right: 'e', center: 'c', 'space-between': 'b', 'space-around': 'a', 'space-evenly': 'v', stretch: 'x', normal: 'x', baseline: 'l', 'first baseline': 'l' };
const COTES = ['top', 'right', 'bottom', 'left'] as const;

/** Une icône donnée en masque CSS, dans une adresse data:. */
function iconeDUnMasque(valeur: string): IconeDessinee | undefined {
  const url = /url\(\s*(["']?)data:image\/svg\+xml[^,]*,(.*?)\1\s*\)/is.exec(valeur);
  if (!url) return undefined;
  let svg = url[2];
  try { svg = decodeURIComponent(svg); } catch { /* écrit tel quel */ }
  const entete = /<svg\b([^>]*)>/i.exec(svg);
  if (!entete) return undefined;
  const interieur = svg.slice(entete.index + entete[0].length).replace(/<\/svg>\s*$/i, '');
  return lireIconesSvg(`<svg><symbol id="masque"${entete[1]}>${interieur}</symbol></svg>`)[0];
}

export class CssExact {
  private readonly regles: Regle[] = [];
  private readonly styles = new Map<string, number>();
  readonly iconesDeMasque: IconeDessinee[] = [];
  private readonly indexIcones = new Map<string, number>();

  /** Le dessin en cours : sa largeur et son appareil choisissent les règles. */
  private courant: { largeur: number; sombre: boolean; os: 'ios' | 'macos' } = { largeur: 1440, sombre: false, os: 'macos' };

  /**
   * « base » : la feuille que le site pose avant celles du projet (styles.css de Humalis et le thème) ;
   * le dessin part ainsi du même point que le navigateur.
   */
  constructor(feuilles: { css: string; os?: 'ios' | 'macos' }[], private readonly polices: Set<string>, base = '') {
    let rang = 0;
    for (const { css, os } of [{ css: BASE }, { css: base }, ...feuilles] as { css: string; os?: 'ios' | 'macos' }[]) {
      for (const { selecteur, corps, condition: media } of this.blocs(css.replace(/\/\*[\s\S]*?\*\//g, ''))) {
        const condition: Condition = { ...media, ...(os ? { os } : {}) };
        const declarations = separer(corps, (c) => c === ';').flatMap((d): [string, string, boolean][] => {
          const deux = d.indexOf(':');
          if (deux <= 0) return [];
          const v = d.slice(deux + 1).trim();
          const important = /!important\s*$/.test(v);
          return [[d.slice(0, deux).trim().toLowerCase(), v.replace(/\s*!important\s*$/, ''), important]];
        });
        for (const s of parVirgules(selecteur)) {
          const lu = lireSelecteur(s);
          if (lu) this.regles.push({ selecteur: lu, specificite: specificiteDe(lu), rang: rang++, declarations, condition });
        }
      }
    }
  }

  private blocs(css: string, condition: Condition = {}): { selecteur: string; corps: string; condition: Condition }[] {
    const sortie: { selecteur: string; corps: string; condition: Condition }[] = [];
    let i = 0;
    while (i < css.length) {
      const ouvre = css.indexOf('{', i);
      if (ouvre < 0) break;
      const selecteur = css.slice(i, ouvre).trim();
      let p = 1, j = ouvre + 1;
      while (j < css.length && p > 0) { if (css[j] === '{') p++; if (css[j] === '}') p--; j++; }
      const corps = css.slice(ouvre + 1, j - 1);
      // « @media » : seule la largeur compte ; elle est comparée à celle du dessin au moment de résoudre.
      if (selecteur.startsWith('@media')) {
        const c = conditionMedia(selecteur);
        if (c) {
          const sombre = c.sombre ?? condition.sombre;
          // « (prefers-color-scheme: dark) » dans « (prefers-color-scheme: light) » : jamais.
          if (c.sombre === undefined || condition.sombre === undefined || c.sombre === condition.sombre) {
            sortie.push(...this.blocs(corps, { min: Math.max(condition.min ?? 0, c.min ?? 0), max: Math.min(condition.max ?? Infinity, c.max ?? Infinity), ...(sombre !== undefined ? { sombre } : {}) }));
          }
        }
      } else if (!selecteur.startsWith('@') && selecteur) sortie.push({ selecteur, corps, condition });
      i = j;
    }
    return sortie;
  }

  /** Vrai si une règle change en mode sombre : la page se résout alors deux fois. */
  get aDuSombre(): boolean { return this.regles.some((r) => r.condition.sombre !== undefined); }

  /**
   * Les largeurs où les règles changent, pour un appareil : le début de chaque plage.
   * Sur iPhone et iPad, l'écran choisit la plage en direct ; sur Mac, seule compte la largeur du dessin.
   */
  debutsDesPlages(os: 'ios' | 'macos'): number[] {
    const debuts = new Set<number>([0]);
    for (const { condition: c } of this.regles) {
      if (c.os !== undefined && c.os !== os) continue;
      if (c.min !== undefined && c.min > 0) debuts.add(c.min);
      if (c.max !== undefined && c.max !== Infinity) debuts.add(arrondir(c.max + 0.01));
    }
    return [...debuts].sort((a, b) => a - b);
  }

  /** Les façons de voir la page sur cet appareil, dans l'ordre que lit varianteHumalis. */
  variantes(os: 'ios' | 'macos', dessin: { largeur: number }): Variante[] {
    const largeurs = os === 'ios' ? this.debutsDesPlages('ios') : [dessin.largeur];
    const sombres = this.aDuSombre ? [false, true] : [false];
    return largeurs.flatMap((largeur) => sombres.map((sombre) => ({ largeur, sombre })));
  }

  /**
   * Résout une page pour chacune de ses variantes : un style qui change d'une variante à l'autre
   * est choisi à l'écran par « varianteHumalis(…) ».
   */
  resoudreVariantes(vue: NoeudVue[], dessin: { largeur: number; hauteur: number }, os: 'ios' | 'macos', cadre: Cadre = 'page'): ResolutionPage {
    const variantes = this.variantes(os, dessin);
    const lues = variantes.map((v) => this.resoudre(vue, { largeur: v.largeur, hauteur: dessin.hauteur }, cadre, os, v.sombre));
    if (lues.length === 1) return lues[0];
    const choisir = (codes: string[]) => (new Set(codes).size === 1 ? codes[0] : `varianteHumalis(${codes.join(', ')})`);
    const aucun = this.ref({ d: 'none' });
    const resolution = new ResolutionPage();
    resolution.fond = choisir(lues.map((l) => l.fond));
    resolution.page = choisir(lues.map((l) => l.page));
    for (const [noeud] of lues[0].toutesLesEnveloppes()) {
      const de = (l: ResolutionPage) => l.enveloppe(noeud)!;
      resolution.ajouterEnveloppe(noeud, { code: choisir(lues.map((l) => de(l).code)), texte: choisir(lues.map((l) => de(l).texte)), masque: lues.every((l) => de(l).masque) });
    }
    for (const [noeud] of lues[0].toutes()) {
      const entrees = lues.map((l) => l.de(noeud)!);
      const code = choisir(entrees.map((x) => x.code));
      const entree: EntreeStyle = { code, masque: entrees.every((x) => x.masque) };
      const actif = choisir(entrees.map((x) => x.actif ?? x.code));
      if (actif !== code) entree.actif = actif;
      const avant = choisir(entrees.map((x) => x.avant ?? aucun));
      if (avant !== aucun) entree.avant = avant;
      const apres = choisir(entrees.map((x) => x.apres ?? aucun));
      if (apres !== aucun) entree.apres = apres;
      resolution.ajouter(noeud, entree);
    }
    for (const [noeud] of lues[0].toutesLesIcones()) resolution.ajouterIcone(noeud, choisir(lues.map((l) => l.icone(noeud)!)));
    return resolution;
  }

  /**
   * Résout une page : à chaque nœud, ses styles. Comme sur le web : html > body > div (la racine),
   * puis main.humalis-page pour une page, ou directement la barre latérale (header.humalis-entete).
   */
  resoudre(vue: NoeudVue[], dessin: { largeur: number; hauteur: number }, cadre: Cadre = 'page', os: 'ios' | 'macos' = 'macos', sombre = false): ResolutionPage {
    this.courant = { largeur: dessin.largeur, sombre, os };
    const html: Boite = { tag: 'html', classes: new Set(), enfants: [], branches: [] };
    const body: Boite = { tag: 'body', classes: new Set(), parent: html, enfants: [], branches: [] };
    html.enfants.push(body);
    const racine: Boite = { tag: 'div', classes: new Set(), parent: body, enfants: [], branches: [] };
    body.enfants.push(racine);
    const page: Boite = cadre === 'page' ? { tag: 'main', classes: new Set(['humalis-page']), parent: racine, enfants: [], branches: [] } : racine;
    if (cadre === 'page') racine.enfants.push(page);
    this.construire(vue, page, undefined, []);
    const resolution = new ResolutionPage();
    const heriteDeBase: Herite = { t: 16, g: 400, c: [0, 0, 0, 1], vars: new Map() };
    const hHtml = this.calculer(html, DEDANS, heriteDeBase, dessin).herite;
    const hBody = this.calculer(body, DEDANS, hHtml, dessin).herite;
    const hRacine = this.calculer(racine, DEDANS, hBody, dessin).herite;
    const milieuPage = cadre === 'page' ? this.calculer(page, DEDANS, hRacine, dessin) : { style: {} as StyleJ, herite: hRacine };
    const hPage = milieuPage.herite;
    // Le fond du site, de html à body : sur iPhone, il passe sous l'encoche et la barre du bas.
    const fond = [this.calculer(body, DEDANS, hHtml, dessin).style, this.calculer(html, DEDANS, heriteDeBase, dessin).style].find((s) => s.fo?.length)?.fo;
    resolution.fond = this.ref({ d: 'block', la: { c: 100 }, ha: { c: 100 }, ...(fond ? { fo: fond } : {}) });
    // La boîte main.humalis-page elle-même : marges, largeur maximale, fond.
    if (cadre === 'page') resolution.page = this.ref(milieuPage.style);
    const parcourir = (b: Boite, h: Herite) => {
      for (const enfant of b.enfants) {
        const milieu = this.calculer(enfant, DEDANS, h, dessin);
        if (enfant.noeud) resolution.ajouter(enfant.noeud, this.entree(enfant, h, milieu.style, dessin, milieu.herite));
        if (enfant.iconeDe) resolution.ajouterIcone(enfant.iconeDe, this.ref(milieu.style));
        if (enfant.champDe) {
          // Le texte du libellé : le texte du <label>, sans sa boîte.
          const t = milieu.style;
          const texte: StyleJ = { d: 'block', t: t.t, g: t.g, c: t.c, ...(t.f ? { f: t.f } : {}), ...(t.li !== undefined ? { li: t.li } : {}), ...(t.lp !== undefined ? { lp: t.lp } : {}), ...(t.tr !== undefined ? { tr: t.tr } : {}), ...(t.ta ? { ta: t.ta } : {}), ...(t.cas ? { cas: t.cas } : {}), ...(t.it ? { it: true } : {}) };
          resolution.ajouterEnveloppe(enfant.champDe, { code: this.ref(t), texte: this.ref(texte), masque: t.d === 'none' });
        }
        parcourir(enfant, milieu.herite);
      }
    };
    parcourir(page, hPage);
    return resolution;
  }

  /** Le code Swift d'un style déjà connu, ou tout juste enregistré. */
  private ref(style: StyleJ): string {
    const cle = JSON.stringify(style);
    if (!this.styles.has(cle)) this.styles.set(cle, this.styles.size);
    return `StylesDessines.s${this.styles.get(cle)}`;
  }

  private entree(b: Boite, h: Herite, style: StyleJ, dessin: { largeur: number; hauteur: number }, herite: Herite): EntreeStyle {
    const n = b.noeud!;
    const entree: EntreeStyle = { code: this.ref(style), masque: style.d === 'none' };
    // Une ligne de boucle, et ce qu'elle contient, peut changer de style selon sa place : première, dernière.
    let boucle: object | undefined;
    for (let p: Boite | undefined = b; p && !boucle; p = p.parent) boucle = p.boucle;
    const selon = (lire: (rang: Rang) => StyleJ): string => {
      if (!boucle) return this.ref(lire(DEDANS));
      const code = (premier: boolean, dernier: boolean) => this.ref(lire({ premier, dernier, boucle }));
      const v = [code(true, true), code(true, false), code(false, true), code(false, false)];
      return new Set(v).size > 1 ? `rangHumalis(§, ${v.join(', ')})` : v[3];
    };
    entree.code = selon((rang) => this.calculer(b, rang, h, dessin).style);
    if (n.type === 'element' && n.genre === 'lien') {
      const actif = this.calculer({ ...b, classes: new Set([...b.classes, 'humalis-actif']) }, DEDANS, h, dessin).style;
      const code = this.ref(actif);
      if (code !== entree.code) entree.actif = code;
    }
    for (const quoi of ['before', 'after'] as const) {
      const code = selon((rang) => this.pseudo(b, quoi, herite, dessin, rang) ?? { d: 'none' });
      if (code !== this.ref({ d: 'none' })) entree[quoi === 'before' ? 'avant' : 'apres'] = code;
    }
    return entree;
  }

  private construire(noeuds: NoeudVue[], parent: Boite, boucle: object | undefined, branches: [object, number][]): void {
    for (const n of noeuds) {
      switch (n.type) {
        case 'bloc': {
          // « sur ios : », « sur macos : » : seul celui de l'appareil en cours compte.
          if (n.plateforme === 'ios' || n.plateforme === 'macos') {
            if (n.plateforme === this.courant.os) this.construire(n.corps, parent, boucle, branches);
            break;
          }
          if (n.natif && n.natif.genre === 'recherche') { this.ajouter(n, parent, boucle, branches); break; }
          const b = this.ajouter(n, parent, boucle, branches);
          this.construire(n.corps, b, undefined, []);
          break;
        }
        case 'formulaire': {
          // Un formulaire « en reglages » reste celui du système ; sinon, le <form> du site.
          if (n.reglages) { this.construire(n.corps, parent, boucle, branches); break; }
          const f = this.ajouter(n, parent, boucle, branches);
          this.construire(n.corps, f, undefined, []);
          break;
        }
        case 'condition':
          this.construire(n.alors, parent, boucle, [...branches, [n, 0]]);
          this.construire(n.sinon, parent, boucle, [...branches, [n, 1]]);
          break;
        case 'repetition':
          this.construire(n.corps, parent, n, branches);
          break;
        case 'element': case 'widget': case 'composant':
          this.ajouter(n, parent, boucle, branches);
          break;
        default:
          break;
      }
    }
  }

  private ajouter(n: NoeudVue, parent: Boite, boucle: object | undefined, branches: [object, number][]): Boite {
    // « ios:carte », « macos:carte » : la classe ne vaut que sur son appareil.
    const classes = new Set<string>(((n as { classes?: string[] }).classes ?? []).flatMap((c) => {
      const lue = /^(ios|macos):(.+)$/.exec(c);
      return !lue ? [c] : lue[1] === this.courant.os ? [lue[2]] : [];
    }));
    let tag = 'div';
    if (n.type === 'bloc') {
      classes.add(`humalis-${n.genre}`);
      if (n.natif?.genre === 'recherche') tag = 'input';
      else tag = ({ section: 'section', entete: 'header', pied: 'footer', menu: 'nav' } as Record<string, string>)[n.genre] ?? 'div';
    } else if (n.type === 'element') {
      // Comme sur le web, un élément ne porte que ses propres classes ; le <label> d'un champ porte humalis-champ.
      tag = { titre: 'h1', soustitre: 'h2', texte: 'p', bouton: 'button', lien: 'a', image: 'img', champ: 'input' }[n.genre] ?? 'div';
    } else if (n.type === 'formulaire') {
      tag = 'form';
      classes.add('humalis-formulaire');
    } else if (n.type === 'widget') {
      tag = n.genre === 'icone' ? 'svg' : 'div';
      classes.add(`humalis-${n.genre}`);
    }
    // Un champ est écrit dans son <label>, comme sur le web : le libellé, puis la saisie.
    if (n.type === 'element' && n.genre === 'champ') {
      const sorte = n.saisie?.sorte ?? 'texte';
      if (sorte === 'choix') {
        const f: Boite = { noeud: n, tag: 'fieldset', classes: new Set([...classes].filter((c) => c !== 'humalis-champ').concat('humalis-choix')), parent, enfants: [], ...(boucle ? { boucle } : {}), branches };
        parent.enfants.push(f);
        return f;
      }
      const label: Boite = { champDe: n, tag: 'label', classes: new Set([sorte === 'case' ? 'humalis-case' : 'humalis-champ']), parent, enfants: [], ...(boucle ? { boucle } : {}), branches };
      parent.enfants.push(label);
      const saisie: Boite = { noeud: n, tag: sorte === 'texteLong' ? 'textarea' : sorte === 'liste' ? 'select' : 'input', classes: new Set([...classes].filter((c) => c !== 'humalis-champ')), parent: label, enfants: [], branches: [] };
      label.enfants.push(saisie);
      return saisie;
    }
    // La barre latérale est l'en-tête du site : header.humalis-entete.humalis-barre-laterale.
    if (classes.has('humalis-barre-laterale')) { tag = 'header'; classes.add('humalis-entete'); }
    const b: Boite = { noeud: n, tag, classes, parent, enfants: [], ...(boucle ? { boucle } : {}), branches };
    parent.enfants.push(b);
    if (n.type === 'element' && n.reglages?.icone) b.enfants.push({ iconeDe: n, tag: 'svg', classes: new Set(['humalis-icone']), parent: b, enfants: [], branches: [] });
    return b;
  }

  private exclus(a: Boite, b: Boite): boolean {
    return a.branches.some(([c, i]) => b.branches.some(([d, j]) => c === d && i !== j));
  }

  /** Ce qui peut précéder cet élément parmi ses frères. */
  private precedents(b: Boite, rang: Rang): Boite[] {
    const freres = b.parent?.enfants ?? [];
    const i = freres.indexOf(b);
    const possibles: Boite[] = [];
    if (b.boucle && !rang.premier) possibles.push(...freres.filter((f) => f.boucle === b.boucle && !this.exclus(f, b)), ...freres.filter((f) => f.boucle === b.boucle && this.exclus(f, b)));
    if (possibles.length > 0) return possibles;
    for (let j = i - 1; j >= 0; j--) {
      const f = freres[j];
      if (b.boucle && f.boucle === b.boucle) continue;
      if (this.exclus(f, b)) continue;
      possibles.push(f);
      if (f.branches.length === 0 && !f.boucle) break;
    }
    return possibles;
  }

  private estPremier(b: Boite, rang: Rang): boolean {
    if (b.boucle && !rang.premier) return false;
    const freres = b.parent?.enfants ?? [];
    for (const f of freres.slice(0, freres.indexOf(b))) {
      if (b.boucle && f.boucle === b.boucle) continue;
      if (this.exclus(f, b)) continue;
      if (f.branches.length === 0 && !f.boucle) return false;
    }
    return true;
  }

  private estDernier(b: Boite, rang: Rang): boolean {
    if (b.boucle && !rang.dernier) return false;
    const freres = b.parent?.enfants ?? [];
    for (const f of freres.slice(freres.indexOf(b) + 1)) {
      if (b.boucle && f.boucle === b.boucle) continue;
      if (this.exclus(f, b)) continue;
      if (f.branches.length === 0 && !f.boucle) return false;
    }
    return true;
  }

  /** La place dans la boucle ne vaut que pour une ligne de cette boucle. */
  private rangDe(b: Boite, rang: Rang): Rang { return b.boucle && b.boucle === rang.boucle ? rang : DEDANS; }

  private convient(c: Compose, b: Boite, rangLu: Rang): boolean {
    const rang = this.rangDe(b, rangLu);
    if (c.tag && c.tag !== b.tag) return false;
    if (c.id) return false;
    if (c.classes.some((x) => !b.classes.has(x))) return false;
    if (c.premier && !this.estPremier(b, rang)) return false;
    if (c.dernier && !this.estDernier(b, rang)) return false;
    if (c.non.some((n) => this.convient(n, b, rang))) return false;
    if (c.ou && !c.ou.some((n) => this.convient(n, b, rang))) return false;
    if (c.a.some((n) => !this.contient(b, n))) return false;
    return true;
  }

  private contient(b: Boite, c: Compose): boolean {
    return b.enfants.some((e) => this.convient(c, e, DEDANS) || this.contient(e, c));
  }

  private correspond(s: Selecteur, b: Boite, rang: Rang): boolean {
    const verifier = (i: number, ici: Boite, r: Rang): boolean => {
      if (!this.convient(s.parties[i], ici, r)) return false;
      if (i === 0) return true;
      const lien = s.liens[i - 1];
      if (lien === '>') return !!ici.parent && verifier(i - 1, ici.parent, r);
      if (lien === '+' || lien === '~') return this.precedents(ici, this.rangDe(ici, r)).some((f) => verifier(i - 1, f, DEDANS));
      for (let p = ici.parent; p; p = p.parent) if (verifier(i - 1, p, r)) return true;
      return false;
    };
    return verifier(s.parties.length - 1, b, rang);
  }

  /** Le rang d'un SVG donné en data: dans la table des masques, ajouté s'il est nouveau. */
  private imageDeFond(valeur: string): number | undefined {
    const icone = iconeDUnMasque(valeur);
    if (!icone) return undefined;
    const cle = JSON.stringify([icone.traces, icone.cadrage]);
    if (!this.indexIcones.has(cle)) { this.indexIcones.set(cle, this.iconesDeMasque.length); this.iconesDeMasque.push(icone); }
    return this.indexIcones.get(cle)!;
  }

  private vaut(c: Condition): boolean {
    const { largeur, sombre, os } = this.courant;
    return (c.os === undefined || c.os === os) && (c.sombre === undefined || c.sombre === sombre) && largeur >= (c.min ?? 0) && largeur <= (c.max ?? Infinity);
  }

  private declarationsDe(b: Boite, rang: Rang, pseudo?: 'before' | 'after'): [string, string][] {
    const choisies = this.regles.filter((r) => this.vaut(r.condition) && r.selecteur.pseudo === pseudo && this.correspond(r.selecteur, b, rang));
    const normales = choisies.flatMap((r) => r.declarations.filter((d) => !d[2]).map((d) => ({ d, r })));
    const fortes = choisies.flatMap((r) => r.declarations.filter((d) => d[2]).map((d) => ({ d, r })));
    const ordre = (a: { r: Regle }, c: { r: Regle }) => a.r.specificite - c.r.specificite || a.r.rang - c.r.rang;
    return [...normales.sort(ordre), ...fortes.sort(ordre)].map(({ d }) => [d[0], d[1]]);
  }

  private pseudo(b: Boite, quoi: 'before' | 'after', h: Herite, dessin: { largeur: number; hauteur: number }, rang: Rang): StyleJ | undefined {
    const decl = this.declarationsDe(b, rang, quoi);
    const contenu = decl.filter(([p]) => p === 'content').at(-1)?.[1];
    if (contenu === undefined || contenu === 'none' || contenu === 'normal') return undefined;
    const r = this.appliquer(decl, h, dessin, 'inline');
    return r.style.d === 'none' ? undefined : r.style;
  }

  private calculer(b: Boite, rang: Rang, h: Herite, dessin: { largeur: number; hauteur: number }): { style: StyleJ; herite: Herite } {
    const r = this.appliquer(this.declarationsDe(b, rang), h, dessin, 'block');
    // La barre latérale : la coquille la met à côté de la page ; son placement (« position: fixed ») n'y sert pas.
    if (b.tag === 'header' && b.classes.has('humalis-barre-laterale')) for (const k of ['ab', 'to', 'ri', 'bo', 'le', 'z'] as const) delete r.style[k];
    return r;
  }

  private appliquer(declarations: [string, string][], parent: Herite, dessin: { largeur: number; hauteur: number }, _defaut: string): { style: StyleJ; herite: Herite } {
    const vars = new Map(parent.vars);
    for (const [p, v] of declarations) if (p.startsWith('--')) vars.set(p, v);
    const resoudre = (v: string) => {
      let x = v;
      for (let i = 0; i < 8 && x.includes('var('); i++) x = x.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (tout, nom: string, repli?: string) => vars.get(nom) ?? repli?.trim() ?? '');
      // Comme dans Safari sans « viewport-fit=cover » : le contenu reste dans la zone sûre, les marges valent 0.
      return x.replace(/env\(\s*safe-area-inset-(?:top|right|bottom|left)\s*(?:,[^()]*(?:\([^()]*\))?[^()]*)?\)/gi, '0px');
    };
    const decl = declarations.filter(([p]) => !p.startsWith('--')).map(([p, v]) => [p, resoudre(v)] as [string, string]);
    const h: Herite = { ...parent, vars };
    const contexte0: Contexte = { taille: parent.t, dessin, courante: parent.c };

    // D'abord ce dont dépendent les autres : la taille du texte, puis la couleur courante.
    const lireLigne = (v: string, taille: number) => {
      if (v === 'normal') { delete h.li; delete h.lp; return; }
      if (/^\d*\.?\d+$/.test(v)) { h.li = parseFloat(v); delete h.lp; return; }
      const m = mesure(v, { ...contexte0, taille });
      if (m?.p !== undefined) { h.lp = m.p; delete h.li; }
      else if (m?.c !== undefined) { h.lp = (m.c * taille) / 100; delete h.li; }
    };
    const famille = (v: string) => {
      const premiere = parVirgules(v)[0]?.replace(/^["']|["']$/g, '');
      if (premiere && this.polices.has(premiere)) h.f = premiere;
      else delete h.f;
    };
    const graisse = (v: string) => { const n = v === 'bold' ? 700 : v === 'normal' ? 400 : v === 'bolder' ? 700 : v === 'lighter' ? 300 : parseFloat(v); if (!Number.isNaN(n)) h.g = n; };
    for (const [p, v] of decl) {
      if (v === 'inherit') continue;
      if (p === 'font-size') {
        const m = mesure(v, contexte0);
        if (m?.p !== undefined) h.t = m.p;
        else if (m?.c !== undefined) h.t = (parent.t * m.c) / 100;
      } else if (p === 'font') {
        const f = /^((?:[a-z-]+|\d+)\s+)*?(-?\d*\.?\d+(?:px|em|rem|%))(?:\/([^\s]+))?\s+(.*)$/i.exec(v);
        if (f) {
          const avant = v.slice(0, v.indexOf(f[2])).trim();
          h.g = 400;
          delete h.it;
          for (const mot of avant.split(/\s+/).filter(Boolean)) {
            if (/^\d+$/.test(mot) || mot === 'bold') graisse(mot);
            if (mot === 'italic') h.it = true;
          }
          const m = mesure(f[2], contexte0);
          if (m?.p !== undefined) h.t = m.p;
          delete h.li; delete h.lp;
          if (f[3]) lireLigne(f[3], h.t);
          famille(f[4]);
        } else if (v === 'inherit') { /* hérité */ }
      }
    }
    for (const [p, v] of decl) {
      if (v === 'inherit') continue;
      switch (p) {
        case 'color': { const c = couleur(v, parent.c); if (c) h.c = c; break; }
        case 'font-weight': graisse(v); break;
        case 'font-family': famille(v); break;
        case 'font-style': if (v === 'italic') h.it = true; else delete h.it; break;
        case 'font-variant-numeric': if (v.includes('tabular')) h.nb = true; else delete h.nb; break;
        case 'line-height': lireLigne(v, h.t); break;
        case 'letter-spacing': { if (v === 'normal') delete h.tr; else { const m = mesure(v, { ...contexte0, taille: h.t }); if (m?.p !== undefined) h.tr = m.p; } break; }
        case 'text-align': h.ta = { left: 's', start: 's', center: 'c', right: 'e', end: 'e' }[v] ?? 's'; break;
        case 'text-transform': if (v === 'none') delete h.cas; else h.cas = v === 'uppercase' ? 'u' : v === 'lowercase' ? 'l' : undefined; break;
        case 'white-space': if (v === 'nowrap' || v === 'pre') h.nw = true; else delete h.nw; break;
      }
    }

    const ctx: Contexte = { taille: h.t, dessin, courante: h.c };
    const s: StyleJ = {};
    const lg = (v: string) => mesure(v, ctx);
    const mg = (v: string): Marge | undefined => (v === 'auto' ? 'auto' : lg(v));
    const bords: ([number, CouleurJ] | null)[] = [null, null, null, null];
    let boiteAuBord = false;
    const lireBord = (v: string): [number, CouleurJ] | null => {
      if (v === 'none' || v === '0') return null;
      const mots = parEspaces(v);
      if (mots.includes('none')) return null;
      const e = mots.map((m) => (m === 'thin' ? { p: 1 } : m === 'medium' ? { p: 3 } : m === 'thick' ? { p: 5 } : lg(m))).find((m) => m?.p !== undefined);
      const c = mots.map((m) => couleur(m, h.c)).find(Boolean);
      return [e?.p ?? 3, c ?? h.c];
    };
    for (const [p, v] of decl) {
      switch (p) {
        case 'display': {
          if (v === 'none') { s.d = 'none'; break; }
          if (v === 'inline-flex') { s.d = 'flex'; s.ix = true; }
          else if (v === 'inline-grid') { s.d = 'grid'; s.ix = true; }
          else if (v === 'inline' || v === 'inline-block') { s.d = 'block'; s.ix = true; }
          else if (v === 'flex' || v === 'grid') { s.d = v; delete s.ix; }
          else { s.d = 'block'; delete s.ix; }
          break;
        }
        case 'flex-direction': s.col = v.startsWith('column'); break;
        case 'flex-wrap': s.wr = v === 'wrap'; break;
        case 'flex-flow': { const m = parEspaces(v); if (m.some((x) => x.startsWith('column'))) s.col = true; if (m.includes('wrap')) s.wr = true; break; }
        case 'justify-content': s.jc = FLEX[v] ?? 's'; break;
        case 'align-items': s.ai = FLEX[v] ?? 'x'; break;
        case 'justify-items': s.ji = FLEX[v] ?? 'x'; break;
        case 'align-content': s.ac = FLEX[v] ?? 'x'; break;
        case 'place-items': { const m = parEspaces(v); s.ai = FLEX[m[0]] ?? 'x'; s.ji = FLEX[m[1] ?? m[0]] ?? 'x'; break; }
        case 'place-content': { const m = parEspaces(v); s.ac = FLEX[m[0]] ?? 'x'; s.jc = FLEX[m[1] ?? m[0]] ?? 's'; break; }
        case 'align-self': s.as = FLEX[v] ?? 'x'; break;
        case 'justify-self': s.js = FLEX[v] ?? 'x'; break;
        case 'gap': case 'grid-gap': { const m = parEspaces(v).map(lg); if (m[0]?.p !== undefined) { s.gl = m[0].p; s.gc = m[1]?.p ?? m[0].p; } break; }
        case 'row-gap': { const m = lg(v); if (m?.p !== undefined) s.gl = m.p; break; }
        case 'column-gap': { const m = lg(v); if (m?.p !== undefined) s.gc = m.p; break; }
        case 'grid-template-columns': s.co = lirePistes(v, ctx); break;
        case 'grid-template-rows': s.ro = lirePistes(v, ctx); break;
        case 'grid-column': case 'grid-row': {
          const [a, b] = v.split('/').map((x) => x.trim());
          const span = (x?: string) => /^span\s+(\d+)$/.exec(x ?? '')?.[1];
          const debut = span(a) ? undefined : parseInt(a, 10);
          const fin = span(a) ? Number(span(a)) * 1000 : span(b) ? Number(span(b)) * 1000 : b !== undefined ? parseInt(b, 10) : undefined;
          if (p === 'grid-column') { if (debut && !Number.isNaN(debut)) s.gcs = debut; if (fin !== undefined && !Number.isNaN(fin)) s.gce = fin; }
          else { if (debut && !Number.isNaN(debut)) s.grs = debut; if (fin !== undefined && !Number.isNaN(fin)) s.gre = fin; }
          break;
        }
        case 'padding': { const q = quatre(parEspaces(v).map(lg)); if (q && q.every((x) => x?.p !== undefined)) s.pa = q.map((x) => x!.p!) as [number, number, number, number]; break; }
        case 'padding-top': case 'padding-right': case 'padding-bottom': case 'padding-left': { const m = lg(v); if (m?.p !== undefined) { s.pa ??= [0, 0, 0, 0]; s.pa[COTES.indexOf(p.slice(8) as 'top')] = m.p; } break; }
        case 'margin': { const q = quatre(parEspaces(v).map(mg)); if (q && q.every((x) => x !== undefined)) s.ma = q as [Marge, Marge, Marge, Marge]; break; }
        case 'margin-top': case 'margin-right': case 'margin-bottom': case 'margin-left': { const m = mg(v); if (m !== undefined) { s.ma ??= [{ p: 0 }, { p: 0 }, { p: 0 }, { p: 0 }]; s.ma[COTES.indexOf(p.slice(7) as 'top')] = m; } break; }
        case 'box-sizing': boiteAuBord = v === 'border-box'; break;
        case 'width': if (v === 'auto' || v.endsWith('content')) delete s.la; else { const m = lg(v); if (m) s.la = m; } break;
        case 'height': if (v === 'auto' || v.endsWith('content')) delete s.ha; else { const m = lg(v); if (m) s.ha = m; } break;
        case 'min-width': { if (v === 'auto') delete s.lm; else { const m = lg(v); if (m) s.lm = m; } break; }
        case 'min-height': { if (v === 'auto') delete s.hm; else { const m = lg(v); if (m) s.hm = m; } break; }
        case 'max-width': { if (v === 'none') delete s.lM; else { const m = lg(v); if (m) s.lM = m; } break; }
        case 'max-height': { if (v === 'none') delete s.hM; else { const m = lg(v); if (m) s.hM = m; } break; }
        case 'position': if (v === 'absolute' || v === 'fixed') s.ab = true; else delete s.ab; break;
        case 'top': if (v === 'auto') delete s.to; else { const m = lg(v); if (m) s.to = m; } break;
        case 'right': if (v === 'auto') delete s.ri; else { const m = lg(v); if (m) s.ri = m; } break;
        case 'bottom': if (v === 'auto') delete s.bo; else { const m = lg(v); if (m) s.bo = m; } break;
        case 'left': if (v === 'auto') delete s.le; else { const m = lg(v); if (m) s.le = m; } break;
        case 'inset': { const q = quatre(parEspaces(v).map(lg)); if (q) { [s.to, s.ri, s.bo, s.le] = q as [Mesure, Mesure, Mesure, Mesure]; } break; }
        case 'z-index': if (v === 'auto') delete s.z; else s.z = Number(v); break;
        case 'flex': {
          if (v === 'none') { s.fg = 0; s.fs = 0; delete s.fb; break; }
          if (v === 'auto') { s.fg = 1; s.fs = 1; delete s.fb; break; }
          const m = parEspaces(v);
          if (/^[\d.]+$/.test(m[0])) {
            s.fg = Number(m[0]);
            s.fs = m[1] !== undefined && /^[\d.]+$/.test(m[1]) ? Number(m[1]) : 1;
            const base = m.find((x, i) => i > 0 && !/^[\d.]+$/.test(x));
            if (base && base !== 'auto') { const b = lg(base); if (b) s.fb = b; } else if (base === 'auto') delete s.fb; else s.fb = { c: 0 };
          } else { const b = lg(m[0]); if (b) s.fb = b; s.fg = 1; s.fs = 1; }
          break;
        }
        case 'flex-grow': s.fg = Number(v); break;
        case 'flex-shrink': s.fs = Number(v); break;
        case 'flex-basis': if (v === 'auto') delete s.fb; else { const b = lg(v); if (b) s.fb = b; } break;
        case 'background': { const f = lireFond(v, ctx); if (f) s.fo = f; const i = this.imageDeFond(v); if (i !== undefined) s.fi = i; else delete s.fi; break; }
        case 'background-color': { const c = couleur(v, h.c); if (c) s.fo = c[3] === 0 ? [] : [...(s.fo ?? []).filter((x) => !x.c), { c }].sort((a, b) => (a.c ? 0 : 1) - (b.c ? 0 : 1)); break; }
        case 'background-image': { const f = lireFond(v, ctx); if (f) s.fo = [...(s.fo ?? []).filter((x) => x.c), ...f]; const i = this.imageDeFond(v); if (i !== undefined) s.fi = i; else delete s.fi; break; }
        case 'border-radius': {
          const q = quatre(parEspaces(v.split('/')[0]).map(lg));
          if (q) s.ar = q.map((m) => (m?.c !== undefined ? (m.c >= 50 ? 99999 : m.c) : (m?.p ?? 0))) as [number, number, number, number];
          break;
        }
        case 'border-top-left-radius': case 'border-top-right-radius': case 'border-bottom-right-radius': case 'border-bottom-left-radius': {
          const i = { 'border-top-left-radius': 0, 'border-top-right-radius': 1, 'border-bottom-right-radius': 2, 'border-bottom-left-radius': 3 }[p]!;
          const m = lg(v);
          s.ar ??= [0, 0, 0, 0];
          s.ar[i] = m?.c !== undefined ? 99999 : (m?.p ?? 0);
          break;
        }
        case 'border': { const b = lireBord(v); bords[0] = bords[1] = bords[2] = bords[3] = b; break; }
        case 'border-top': case 'border-right': case 'border-bottom': case 'border-left': bords[COTES.indexOf(p.slice(7) as 'top')] = lireBord(v); break;
        case 'border-color': { const q = quatre(parEspaces(v).map((m) => couleur(m, h.c))); if (q) bords.forEach((b, i) => { if (b && q[i]) b[1] = q[i]!; }); break; }
        case 'border-top-color': case 'border-right-color': case 'border-bottom-color': case 'border-left-color': {
          // « border: » donne le même bord aux quatre côtés : on en change une copie.
          const i = COTES.indexOf(p.slice(7, -6) as 'top');
          const b = bords[i];
          const c = couleur(v, h.c);
          if (b && c) bords[i] = [b[0], c];
          break;
        }
        case 'border-width': { const q = quatre(parEspaces(v).map(lg)); if (q) bords.forEach((b, i) => { if (b && q[i]?.p !== undefined) b[0] = q[i]!.p!; }); break; }
        case 'box-shadow': {
          if (v === 'none') { delete s.om; break; }
          s.om = parVirgules(v).flatMap((couche): Ombre[] => {
            const mots = parEspaces(couche);
            const n = mots.map(lg).filter((m): m is Mesure => m?.p !== undefined).map((m) => m.p!);
            const c = mots.map((m) => couleur(m, h.c)).find(Boolean);
            if (n.length < 2 || !c) return [];
            return [{ x: n[0], y: n[1], f: n[2] ?? 0, e: n[3] ?? 0, c, ...(mots.includes('inset') ? { i: true } : {}) }];
          });
          break;
        }
        case 'clip-path': {
          const m = /^polygon\((.*)\)$/is.exec(v);
          if (m) {
            const points = parVirgules(m[1]).map((pt) => parEspaces(pt).map(lg));
            if (points.every((pt) => pt.length >= 2 && pt[0] && pt[1])) s.po = points.map((pt) => [pt[0]!, pt[1]!]);
          } else if (v === 'none') delete s.po;
          break;
        }
        case 'opacity': s.op = parseFloat(v); break;
        case 'visibility': if (v === 'hidden') s.cach = true; else delete s.cach; break;
        case 'overflow': case 'overflow-y': case 'overflow-x': {
          if (v === 'hidden' || v === 'clip') { s.oh = true; delete s.sc; }
          else if ((v === 'auto' || v === 'scroll') && p !== 'overflow-x') { s.sc = true; delete s.oh; }
          else if (v === 'visible') { delete s.oh; delete s.sc; }
          break;
        }
        case 'text-overflow': s.el = v === 'ellipsis'; break;
        case 'transform': {
          if (v === 'none') { delete s.tx; delete s.ty; delete s.ro2; break; }
          for (const f of v.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)) {
            const a = parVirgules(f[2]);
            const nom = f[1].toLowerCase();
            if (nom === 'translate') { const x = lg(a[0]); const y = a[1] ? lg(a[1]) : undefined; if (x) s.tx = x; if (y) s.ty = y; }
            else if (nom === 'translatex') { const x = lg(a[0]); if (x) s.tx = x; }
            else if (nom === 'translatey') { const y = lg(a[0]); if (y) s.ty = y; }
            else if (nom === 'rotate') s.ro2 = parseFloat(a[0]);
          }
          break;
        }
        case 'mask': case '-webkit-mask': case 'mask-image': case '-webkit-mask-image': {
          const ic = this.imageDeFond(v);
          if (ic !== undefined) s.ic = ic;
          break;
        }
      }
    }
    if (bords.some((b) => b && b[0] > 0)) s.bd = bords.map((b) => (b && b[0] > 0 ? [b[0], b[1]] : null));
    // « box-sizing: content-box », la valeur par défaut : width et height ne comptent ni l'espace intérieur ni le bord.
    // Le moteur mesure au bord : on les ajoute, comme le navigateur.
    if (!boiteAuBord) {
      const pa = s.pa ?? [0, 0, 0, 0];
      const ep = (i: number) => (bords[i] && bords[i]![0] > 0 ? bords[i]![0] : 0);
      const enLargeur = pa[1] + pa[3] + ep(1) + ep(3), enHauteur = pa[0] + pa[2] + ep(0) + ep(2);
      const ajouter = (m: Mesure | undefined, n: number): Mesure | undefined => (m && n ? { ...m, p: arrondir((m.p ?? 0) + n) } : m);
      for (const k of ['la', 'lm', 'lM'] as const) if (s[k]) s[k] = ajouter(s[k], enLargeur);
      for (const k of ['ha', 'hm', 'hM'] as const) if (s[k]) s[k] = ajouter(s[k], enHauteur);
    }
    // Le texte : tout est écrit sur chaque élément, l'héritage est déjà fait.
    s.t = h.t; s.g = h.g; s.c = h.c;
    if (h.f) s.f = h.f;
    if (h.li !== undefined) s.li = h.li;
    if (h.lp !== undefined) s.lp = h.lp;
    if (h.tr !== undefined) s.tr = h.tr;
    if (h.ta) s.ta = h.ta;
    if (h.cas) s.cas = h.cas;
    if (h.nw) s.nw = true;
    if (h.it) s.it = true;
    if (h.nb) s.nb = true;
    return { style: s, herite: h };
  }

  /** Le code qui déclare tous les styles rencontrés ; une chaîne par style garde la compilation rapide. */
  swift(): string {
    const lignes = [...this.styles].map(([json, i]) => `    static let s${i} = StyleHumalis.lire(#"${json}"#)`);
    const liste = (l: number[]) => l.map((n) => String(n)).join(', ');
    // Les plages de largeur et le mode sombre que lit varianteHumalis : le même ordre que resoudreVariantes.
    const plages = `enum PlagesDessinees {
    #if os(iOS)
    static let debuts: [CGFloat] = [${liste(this.debutsDesPlages('ios'))}]
    #else
    static let debuts: [CGFloat] = [0]
    #endif
    static let sombre = ${this.aDuSombre}
}
`;
    return `enum StylesDessines {\n${lignes.join('\n')}\n}\n\n${plages}`;
  }
}

/** Où se place ce qu'on résout : dans main.humalis-page, ou à côté (la barre latérale). */
export type Cadre = 'page' | 'barre';

/** Le <label> d'un champ : sa boîte, et le style de son libellé. */
export interface EnveloppeChamp { code: string; texte: string; masque: boolean }

export class ResolutionPage {
  /** Le style du fond du site (html, body), dessiné sous la zone sûre sur iPhone. */
  fond = 'StyleHumalis.racine';
  /** Le style de la boîte main.humalis-page. */
  page = 'StyleHumalis.racine';
  private readonly enveloppes = new Map<NoeudVue, EnveloppeChamp>();
  ajouterEnveloppe(noeud: NoeudVue, e: EnveloppeChamp): void { this.enveloppes.set(noeud, e); }
  enveloppe(noeud: NoeudVue): EnveloppeChamp | undefined { return this.enveloppes.get(noeud); }
  toutesLesEnveloppes(): IterableIterator<[NoeudVue, EnveloppeChamp]> { return this.enveloppes.entries(); }
  private readonly entrees = new Map<NoeudVue, EntreeStyle>();
  ajouter(noeud: NoeudVue, entree: EntreeStyle): void { this.entrees.set(noeud, entree); }
  de(noeud: NoeudVue): EntreeStyle | undefined { return this.entrees.get(noeud); }
  toutes(): IterableIterator<[NoeudVue, EntreeStyle]> { return this.entrees.entries(); }
  private readonly icones = new Map<NoeudVue, string>();
  ajouterIcone(noeud: NoeudVue, code: string): void { this.icones.set(noeud, code); }
  icone(noeud: NoeudVue): string | undefined { return this.icones.get(noeud); }
  toutesLesIcones(): IterableIterator<[NoeudVue, string]> { return this.icones.entries(); }
}
