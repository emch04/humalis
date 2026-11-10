/**
 * Le CSS du projet traduit en Compose. Comme sur la cible Apple, seules les
 * règles qui visent une classe (`.carte { … }`) se traduisent ; tout le reste
 * est compté et listé dans CSS-SUR-ANDROID.md, jamais perdu en silence.
 *
 * Une feuille « utiliser style "…" sur android » ne vaut que pour Android, et
 * passe après le CSS commun, qui reste facultatif.
 */

type Longueur = number | 'infini';

interface Rendu {
  taille?: number;
  graisse?: string;
  couleur?: string;
  espaceLettres?: number;
  interligne?: number;
  alignement?: string;
  haut?: number; droite?: number; bas?: number; gauche?: number;
  margeHaut?: number; margeDroite?: number; margeBas?: number; margeGauche?: number;
  largeur?: Longueur; hauteur?: Longueur;
  largeurMin?: number; hauteurMin?: number;
  largeurMax?: Longueur; hauteurMax?: Longueur;
  fond?: string | null;
  arrondi?: number;
  bordure?: { epaisseur: number; couleur: string } | null;
  ombre?: number | null;
  opacite?: number;
  ecart?: number;
}

/** D'où vient une règle : le CSS commun, « sur application » (toutes les applications), ou « sur android ». */
export type Portee = 'commun' | 'application' | 'android';
const POIDS_PORTEE: Record<Portee, number> = { commun: 0, application: 1, android: 2 };

interface Regle {
  portee: Portee;
  classes: string[];
  declarations: [string, string][];
  rang: number;
}

const POIDS: Record<string, string> = { '100': 'FontWeight.Thin', '200': 'FontWeight.ExtraLight', '300': 'FontWeight.Light', '400': 'FontWeight.Normal', normal: 'FontWeight.Normal', '500': 'FontWeight.Medium', '600': 'FontWeight.SemiBold', '700': 'FontWeight.Bold', bold: 'FontWeight.Bold', '800': 'FontWeight.ExtraBold', '900': 'FontWeight.Black' };
const NOMMEES: Record<string, string> = { white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080', orange: '#ffa500', yellow: '#ffff00', purple: '#800080', pink: '#ffc0cb' };
const ALIGNE: Record<string, string> = { left: 'TextAlign.Start', start: 'TextAlign.Start', center: 'TextAlign.Center', right: 'TextAlign.End', end: 'TextAlign.End', justify: 'TextAlign.Justify' };
const AGENCEMENT = /^(flex|flex-.*|grid|grid-.*|align-.*|justify-.*|place-.*|order|float|clear|columns?)$/;
const PLACEMENT = /^(position|top|left|right|bottom|inset|inset-.*|z-index|transform|translate|rotate|scale)$/;
const NAVIGATEUR = /^(cursor|outline|outline-.*|box-sizing|user-select|pointer-events|appearance|scroll-.*|overscroll-.*|will-change|touch-action|tap-highlight.*|accent-color|caret-color|content|overflow.*|-webkit-.*|-moz-.*|transition.*|animation.*|backdrop-filter|filter|white-space|text-decoration.*|word-break|overflow-wrap|text-overflow|hyphens|font-variant.*|font-feature.*|text-rendering|vertical-align|list-style.*|object-fit|object-position|aspect-ratio|visibility)$/;

const nombre = (n: number) => String(Number(n.toFixed(2)));
const dp = (n: number) => `${nombre(n)}.dp`;

function separer(texte: string, separateur: RegExp): string[] {
  const parties: string[] = [];
  let profondeur = 0;
  let courant = '';
  for (const c of texte) {
    if (c === '(') profondeur++;
    if (c === ')') profondeur--;
    if (profondeur === 0 && separateur.test(c)) {
      if (courant.trim()) parties.push(courant.trim());
      courant = '';
    } else courant += c;
  }
  if (courant.trim()) parties.push(courant.trim());
  return parties;
}

/** Une couleur CSS en couleur Compose : `Color(0xFF1F5FBF)`. */
export function couleurCompose(valeur: string): string | undefined {
  const v = (NOMMEES[valeur.toLowerCase()] ?? valeur).trim();
  const kt = (r: number, g: number, b: number, a: number) => {
    const h = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0').toUpperCase();
    return `Color(0x${h(a * 255)}${h(r)}${h(g)}${h(b)})`;
  };
  if (v.toLowerCase() === 'transparent') return 'Color.Transparent';
  const hex = /^#([0-9a-f]{3,8})$/i.exec(v)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const plein = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    return kt(parseInt(plein.slice(0, 2), 16), parseInt(plein.slice(2, 4), 16), parseInt(plein.slice(4, 6), 16), plein.length === 8 ? parseInt(plein.slice(6, 8), 16) / 255 : 1);
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(v)?.[1];
  if (rgb) {
    const lus = rgb.split(/[\s,/]+/).filter(Boolean).map((p) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p)));
    if (lus.length >= 3 && lus.every((n) => !Number.isNaN(n))) return kt(lus[0], lus[1], lus[2], lus[3] ?? 1);
  }
  return undefined;
}

/** Une longueur en dp (1 px CSS vaut 1 dp) ; « clamp » et « min » prennent leur première valeur, celle des petits écrans. */
function longueur(valeur: string, taille = 16): number | undefined {
  const v = valeur.trim();
  const fonction = /^(?:clamp|min)\((.*)\)$/i.exec(v)?.[1];
  if (fonction) return longueur(separer(fonction, /,/)[0], taille);
  if (v === '0') return 0;
  const lue = /^(-?\d*\.?\d+)(px|rem|em)$/i.exec(v);
  if (!lue) return undefined;
  const n = parseFloat(lue[1]);
  return lue[2].toLowerCase() === 'px' ? n : lue[2].toLowerCase() === 'rem' ? n * 16 : n * taille;
}

const quatre = (parties: string[]): [string, string, string, string] | undefined => {
  if (parties.length === 1) return [parties[0], parties[0], parties[0], parties[0]];
  if (parties.length === 2) return [parties[0], parties[1], parties[0], parties[1]];
  if (parties.length === 3) return [parties[0], parties[1], parties[2], parties[1]];
  if (parties.length === 4) return [parties[0], parties[1], parties[2], parties[3]];
  return undefined;
};

/** Ajoute une déclaration au rendu ; le texte rendu dit pourquoi elle ne passe pas. */
function appliquer(r: Rendu, propriete: string, valeurBrute: string): string | undefined {
  const valeur = valeurBrute.replace(/\s*!important\s*$/, '').trim();
  const taille = r.taille ?? 16;
  const pasLisible = 'valeur que Compose ne sait pas lire (calcul, taille d’écran, dégradé…)';
  const lg = (v: string, autoEn0 = false) => (autoEn0 && v === 'auto' ? 0 : longueur(v, taille));
  switch (propriete) {
    case 'color': {
      const c = couleurCompose(valeur);
      if (!c) return pasLisible;
      r.couleur = c;
      return;
    }
    case 'background':
    case 'background-color': {
      if (valeur === 'none') { r.fond = null; return; }
      const c = couleurCompose(valeur);
      if (!c) return pasLisible;
      r.fond = c;
      return;
    }
    case 'font-size': {
      const n = longueur(valeur, 16);
      if (n === undefined) return pasLisible;
      r.taille = n;
      return;
    }
    case 'font-weight':
      if (!POIDS[valeur]) return pasLisible;
      r.graisse = POIDS[valeur];
      return;
    case 'letter-spacing': {
      if (valeur === 'normal') return;
      const em = /^(-?\d*\.?\d+)em$/.exec(valeur);
      const n = em ? parseFloat(em[1]) * taille : longueur(valeur);
      if (n === undefined) return pasLisible;
      r.espaceLettres = n;
      return;
    }
    case 'line-height': {
      if (valeur === 'normal') return;
      const n = /^\d*\.?\d+$/.test(valeur) ? parseFloat(valeur) * taille : longueur(valeur, taille);
      if (n === undefined) return pasLisible;
      r.interligne = n;
      return;
    }
    case 'text-align':
      if (!ALIGNE[valeur]) return pasLisible;
      r.alignement = ALIGNE[valeur];
      return;
    case 'padding': {
      const n = quatre(separer(valeur, /\s/))?.map((v) => lg(v));
      if (!n || n.some((x) => x === undefined)) return pasLisible;
      [r.haut, r.droite, r.bas, r.gauche] = n as number[];
      return;
    }
    case 'margin': {
      const n = quatre(separer(valeur, /\s/))?.map((v) => lg(v, true));
      if (!n || n.some((x) => x === undefined || x < 0)) return pasLisible;
      [r.margeHaut, r.margeDroite, r.margeBas, r.margeGauche] = n as number[];
      return;
    }
    case 'padding-top': case 'padding-right': case 'padding-bottom': case 'padding-left': {
      const n = lg(valeur);
      if (n === undefined) return pasLisible;
      const cote = propriete.slice(8);
      if (cote === 'top') r.haut = n; else if (cote === 'right') r.droite = n; else if (cote === 'bottom') r.bas = n; else r.gauche = n;
      return;
    }
    case 'margin-top': case 'margin-right': case 'margin-bottom': case 'margin-left': {
      const n = lg(valeur, true);
      if (n === undefined || n < 0) return pasLisible;
      const cote = propriete.slice(7);
      if (cote === 'top') r.margeHaut = n; else if (cote === 'right') r.margeDroite = n; else if (cote === 'bottom') r.margeBas = n; else r.margeGauche = n;
      return;
    }
    case 'width': case 'height': case 'max-width': case 'max-height': {
      if (['auto', 'none', 'max-content', 'fit-content', 'min-content'].includes(valeur)) return;
      const n: Longueur | undefined = valeur === '100%' ? 'infini' : lg(valeur);
      if (n === undefined) return pasLisible;
      if (propriete === 'width') r.largeur = n; else if (propriete === 'height') r.hauteur = n; else if (propriete === 'max-width') r.largeurMax = n; else r.hauteurMax = n;
      return;
    }
    case 'min-width': case 'min-height': {
      const n = lg(valeur);
      if (n === undefined) return pasLisible;
      if (propriete === 'min-width') r.largeurMin = n; else r.hauteurMin = n;
      return;
    }
    case 'border-radius': {
      if (valeur === '50%') { r.arrondi = 9999; return; }
      const parties = separer(valeur, /\s/);
      const n = lg(parties[0]);
      if (n === undefined || parties.length > 1) return pasLisible;
      r.arrondi = n;
      return;
    }
    case 'border': {
      if (valeur === 'none' || valeur === '0') { r.bordure = null; return; }
      const parties = separer(valeur, /\s/);
      const epaisseur = parties.map((p) => longueur(p)).find((n) => n !== undefined);
      const c = parties.map(couleurCompose).find(Boolean);
      if (epaisseur === undefined || !c || parties.includes('dashed') || parties.includes('dotted')) return pasLisible;
      r.bordure = { epaisseur, couleur: c };
      return;
    }
    case 'box-shadow': {
      if (valeur === 'none') { r.ombre = null; return; }
      const couche = separer(valeur, /,/).at(-1)!;
      if (/\binset\b/.test(couche)) return pasLisible;
      const longueurs = separer(couche, /\s/).map((p) => longueur(p)).filter((n): n is number => n !== undefined);
      if (longueurs.length < 2) return pasLisible;
      // Compose dessine l'ombre de Material : son élévation suit le flou de l'ombre écrite.
      r.ombre = Math.max(1, Math.round((longueurs[2] ?? longueurs[1]) / 2));
      return;
    }
    case 'opacity': {
      const n = parseFloat(valeur);
      if (Number.isNaN(n)) return pasLisible;
      r.opacite = n;
      return;
    }
    case 'gap': {
      const n = lg(separer(valeur, /\s/)[0]);
      if (n === undefined) return pasLisible;
      r.ecart = n;
      return;
    }
    case 'text-transform':
      return valeur === 'none' ? undefined : 'casse du texte : écrivez le texte comme il doit s’afficher';
    case 'display':
      return valeur === 'none' ? 'cacher un élément : écrivez « cacher … » ou « si … »' : 'agencement : ce sont ligne, colonne et grille qui le décident';
    case 'font-family':
      return 'police : elle vient du thème';
    default:
      if (AGENCEMENT.test(propriete)) return 'agencement : ce sont ligne, colonne et grille qui le décident';
      if (PLACEMENT.test(propriete)) return 'placement libre, sans équivalent dans une colonne Compose';
      if (NAVIGATEUR.test(propriete)) return 'propre au navigateur';
      if (propriete.startsWith('border-')) return 'bordure d’un seul côté ou détail de bordure';
      return 'propriété sans équivalent';
  }
}

/** Ce qu'une classe donne à un texte, un bouton ou un bloc. */
export interface StyleCompose {
  /** Les paramètres d'un Text : `fontSize`, `color`… (sans virgule). */
  texte: Map<string, string>;
  /** Les modificateurs dehors (marges, taille) puis le décor (ombre, fond, bordure) puis le remplissage. */
  dehors: string;
  decor: string;
  dedans: string;
  /** Pour un bouton : sa couleur de fond, sa forme et sa bordure passent par ses paramètres. */
  fond?: string;
  forme?: string;
  bordure?: string;
  ecart?: number;
}

export class CssAndroid {
  private readonly regles: Regle[] = [];
  private readonly variables = new Map<string, string>();
  total = 0;
  traduites = 0;
  /** Pourquoi une déclaration ne passe pas → ce qui n'est pas passé. */
  readonly restes = new Map<string, string[]>();

  constructor(feuilles: { css: string; portee: Portee }[]) {
    let rang = 0;
    const blocs: { selecteur: string; corps: string; portee: Portee }[] = [];
    for (const feuille of feuilles) {
      const lus: { selecteur: string; corps: string }[] = [];
      this.lire(feuille.css.replace(/\/\*[\s\S]*?\*\//g, ''), lus);
      blocs.push(...lus.map((b) => ({ ...b, portee: feuille.portee })));
    }
    for (const b of blocs) if (b.selecteur === ':root') for (const [p, v] of this.declarations(b.corps)) if (p.startsWith('--')) this.variables.set(p, v);
    for (const b of blocs) {
      if (b.selecteur === ':root') continue;
      const classes = b.selecteur.split(',').map((s) => s.trim()).flatMap((s) => (/^\.[\w-]+$/.test(s) ? [s.slice(1)] : []));
      const declarations = this.declarations(b.corps).filter(([p]) => !p.startsWith('--')).map(([p, v]) => [p, this.resoudre(v)] as [string, string]);
      for (const [p, v] of declarations) {
        this.total++;
        if (classes.length === 0) {
          this.reste('sélecteur composé, de balise ou d’état (survol…)', `${b.selecteur} { ${p}: ${v} }`);
          continue;
        }
        const raison = appliquer({}, p, v);
        if (raison) this.reste(raison, `${b.selecteur} { ${p}: ${v} }`);
        else this.traduites++;
      }
      if (classes.length > 0) this.regles.push({ portee: b.portee, classes, declarations, rang: rang++ });
    }
  }

  private reste(raison: string, quoi: string): void {
    this.restes.set(raison, [...(this.restes.get(raison) ?? []), quoi]);
  }

  private lire(css: string, blocs: { selecteur: string; corps: string }[]): void {
    let i = 0;
    while (i < css.length) {
      const ouvre = css.indexOf('{', i);
      if (ouvre < 0) break;
      const selecteur = css.slice(i, ouvre).trim();
      let profondeur = 1;
      let j = ouvre + 1;
      while (j < css.length && profondeur > 0) {
        if (css[j] === '{') profondeur++;
        if (css[j] === '}') profondeur--;
        j++;
      }
      const corps = css.slice(ouvre + 1, j - 1);
      if (selecteur.startsWith('@')) {
        const genre = selecteur.split(/[\s(]/)[0];
        const interieur: { selecteur: string; corps: string }[] = [];
        if (corps.includes('{')) this.lire(corps, interieur);
        else interieur.push({ selecteur, corps });
        for (const b of interieur) {
          for (const [p, v] of this.declarations(b.corps)) {
            this.total++;
            this.reste(`${genre} : règle réservée à un navigateur`, `${selecteur} ${b.selecteur} { ${p}: ${v} }`);
          }
        }
      } else if (selecteur) blocs.push({ selecteur, corps });
      i = j;
    }
  }

  private declarations(corps: string): [string, string][] {
    return separer(corps, /;/).flatMap((d) => {
      const deux = d.indexOf(':');
      return deux > 0 ? [[d.slice(0, deux).trim().toLowerCase(), d.slice(deux + 1).trim()] as [string, string]] : [];
    });
  }

  private resoudre(valeur: string): string {
    let v = valeur;
    for (let i = 0; i < 6 && v.includes('var('); i++) {
      v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (tout, nom: string, repli?: string) => this.variables.get(nom) ?? repli?.trim() ?? tout);
    }
    return v;
  }

  /** Le rendu des classes : le CSS commun d'abord, puis « sur application », puis « sur android » ; à égalité, l'ordre d'écriture. */
  private rendu(classes: string[]): Rendu {
    const voulues = new Set(classes);
    const r: Rendu = {};
    const choisies = this.regles.filter((regle) => regle.classes.some((c) => voulues.has(c)));
    for (const regle of choisies.sort((a, b) => POIDS_PORTEE[a.portee] - POIDS_PORTEE[b.portee] || a.rang - b.rang)) {
      for (const [p, v] of regle.declarations) appliquer(r, p, v);
    }
    return r;
  }

  /** Vrai si au moins une règle vise une de ces classes. */
  vise(classes: string[]): boolean {
    return classes.length > 0 && this.regles.some((regle) => regle.classes.some((c) => classes.includes(c)));
  }

  /** Ce que donnent les classes ; un bloc garde la hauteur de son contenu, une taille fixe pensée pour une page web le ferait déborder. */
  style(classes: string[], sorte: 'texte' | 'bouton' | 'bloc' | 'autre'): StyleCompose {
    const r = this.vise(classes) ? this.rendu(classes) : {};
    if (sorte === 'bloc') Object.assign(r, { hauteur: undefined, hauteurMin: undefined, hauteurMax: undefined });
    const texte = new Map<string, string>();
    if (r.taille !== undefined) texte.set('fontSize', `${nombre(r.taille)}.sp`);
    if (r.graisse) texte.set('fontWeight', r.graisse);
    if (r.couleur) texte.set('color', r.couleur);
    if (r.espaceLettres !== undefined) texte.set('letterSpacing', `${nombre(r.espaceLettres)}.sp`);
    if (r.interligne !== undefined) texte.set('lineHeight', `${nombre(r.interligne)}.sp`);
    if (r.alignement) texte.set('textAlign', r.alignement);

    const dehors: string[] = [];
    const marges = [r.margeGauche, r.margeHaut, r.margeDroite, r.margeBas];
    if (marges.some((m) => m)) dehors.push(`.padding(start = ${dp(r.margeGauche ?? 0)}, top = ${dp(r.margeHaut ?? 0)}, end = ${dp(r.margeDroite ?? 0)}, bottom = ${dp(r.margeBas ?? 0)})`);
    const borne = (nom: 'width' | 'height', n?: Longueur, min?: number, max?: Longueur) => {
      if (n === 'infini') dehors.push(nom === 'width' ? '.fillMaxWidth()' : '.fillMaxHeight()');
      else if (n !== undefined) dehors.push(`.${nom}(${dp(n)})`);
      if (max === 'infini' && n === undefined) dehors.push(nom === 'width' ? '.fillMaxWidth()' : '.fillMaxHeight()');
      const bornes = [min !== undefined ? `min = ${dp(min)}` : '', typeof max === 'number' ? `max = ${dp(max)}` : ''].filter(Boolean);
      if (bornes.length) dehors.push(`.${nom}In(${bornes.join(', ')})`);
    };
    borne('width', r.largeur, r.largeurMin, r.largeurMax);
    borne('height', r.hauteur, r.hauteurMin, r.hauteurMax);
    if (r.opacite !== undefined) dehors.push(`.alpha(${nombre(r.opacite)}f)`);

    const forme = r.arrondi ? (r.arrondi >= 9999 ? 'CircleShape' : `RoundedCornerShape(${dp(r.arrondi)})`) : undefined;
    const decor: string[] = [];
    const bouton = sorte === 'bouton';
    if (r.ombre) decor.push(`.shadow(${dp(r.ombre)}, ${forme ?? 'RectangleShape'})`);
    // Une ombre sans fond se verrait au travers du bloc : il prend la couleur de la surface.
    if (r.ombre && !r.fond && !bouton) decor.push(`.background(MaterialTheme.colorScheme.surface${forme ? `, ${forme}` : ''})`);
    if (r.fond && !bouton) decor.push(`.background(${r.fond}${forme ? `, ${forme}` : ''})`);
    if (r.bordure && !bouton) decor.push(`.border(${dp(r.bordure.epaisseur)}, ${r.bordure.couleur}${forme ? `, ${forme}` : ''})`);
    if (forme && !bouton && !r.fond && !r.bordure && !r.ombre) decor.push(`.clip(${forme})`);

    const dedans: string[] = [];
    const remplissage = [r.gauche, r.haut, r.droite, r.bas];
    if (remplissage.some((m) => m) && !bouton) dedans.push(`.padding(start = ${dp(r.gauche ?? 0)}, top = ${dp(r.haut ?? 0)}, end = ${dp(r.droite ?? 0)}, bottom = ${dp(r.bas ?? 0)})`);
    return {
      texte,
      dehors: dehors.join(''),
      decor: decor.join(''),
      dedans: dedans.join(''),
      ...(bouton && r.fond ? { fond: r.fond } : {}),
      ...(bouton && forme ? { forme } : {}),
      ...(bouton && r.bordure ? { bordure: `BorderStroke(${dp(r.bordure.epaisseur)}, ${r.bordure.couleur})` } : {}),
      ...(r.ecart !== undefined ? { ecart: r.ecart } : {}),
    };
  }

  /** Ce qui est passé et ce qui ne l'est pas, pour la personne qui écrit le CSS. */
  rapport(): string {
    const part = this.total ? Math.round((this.traduites * 100) / this.total) : 0;
    const lignes = ['# Le CSS sur la cible Android', '', `${this.traduites} déclarations sur ${this.total} sont traduites en Compose (${part} %).`, '', 'Ce qui ne passe pas, et pourquoi :', ''];
    for (const [raison, quoi] of [...this.restes].sort((a, b) => b[1].length - a[1].length)) {
      lignes.push(`## ${raison} (${quoi.length})`, '', ...quoi.map((q) => `- \`${q.replace(/`/g, "'")}\``), '');
    }
    return `${lignes.join('\n')}\n`;
  }
}
