/**
 * Le CSS du projet traduit en modificateurs SwiftUI. Seules les règles qui visent une classe
 * se traduisent ; tout le reste est compté et listé dans CSS-SUR-APPLE.md, jamais perdu en silence.
 */
type Couleur = string;
type Longueur = number | 'infini';

interface Rendu {
  taille?: number;
  graisse?: string;
  couleur?: Couleur;
  casse?: string;
  espaceLettres?: { px?: number; em?: number };
  interligne?: number | { fois: number };
  alignement?: string;
  haut?: number; droite?: number; bas?: number; gauche?: number;
  margeHaut?: number; margeDroite?: number; margeBas?: number; margeGauche?: number;
  largeur?: Longueur; hauteur?: Longueur;
  largeurMin?: number; hauteurMin?: number;
  largeurMax?: Longueur; hauteurMax?: Longueur;
  fond?: Couleur | null;
  arrondi?: number;
  bordure?: { epaisseur: number; couleur: Couleur } | null;
  ombre?: { couleur: Couleur; rayon: number; x: number; y: number } | null;
  opacite?: number;
  ecart?: number;
  masque?: boolean;
}

interface Regle {
  /** « utiliser style "…" sur ios » : la feuille d'un seul système. */
  os?: 'ios' | 'macos';
  classes: string[];
  declarations: [string, string][];
  rang: number;
}

const AGENCEMENT = /^(flex|flex-.*|grid|grid-.*|align-.*|justify-.*|place-.*|order|float|clear|columns?)$/;
const PLACEMENT = /^(position|top|left|right|bottom|inset|inset-.*|z-index|transform|translate|rotate|scale)$/;
const NAVIGATEUR = /^(cursor|outline|outline-.*|box-sizing|user-select|pointer-events|appearance|scroll-.*|overscroll-.*|will-change|touch-action|tap-highlight.*|accent-color|caret-color|content|overflow.*|-webkit-.*|-moz-.*|transition.*|animation.*|backdrop-filter|filter|white-space|text-decoration.*|word-break|overflow-wrap|text-overflow|hyphens|font-variant.*|font-feature.*|text-rendering|vertical-align|list-style.*|object-fit|object-position|aspect-ratio|visibility)$/;

const POIDS: Record<string, string> = { '100': '.ultraLight', '200': '.thin', '300': '.light', '400': '.regular', normal: '.regular', '500': '.medium', '600': '.semibold', '700': '.bold', bold: '.bold', '800': '.heavy', '900': '.black' };
const NOMMEES: Record<string, string> = { white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080', orange: '#ffa500', yellow: '#ffff00', purple: '#800080', pink: '#ffc0cb' };
const ALIGNE: Record<string, string> = { left: '.leading', start: '.leading', center: '.center', right: '.trailing', end: '.trailing' };

const nombre = (n: number) => String(Number(n.toFixed(3)));

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

function couleur(valeur: string): Couleur | undefined {
  const v = (NOMMEES[valeur.toLowerCase()] ?? valeur).trim();
  const swift = (r: number, g: number, b: number, a: number) => `Color(red: ${nombre(r / 255)}, green: ${nombre(g / 255)}, blue: ${nombre(b / 255)}, opacity: ${nombre(a)})`;
  if (v.toLowerCase() === 'transparent') return swift(0, 0, 0, 0);
  const hex = /^#([0-9a-f]{3,8})$/i.exec(v)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const plein = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    return swift(parseInt(plein.slice(0, 2), 16), parseInt(plein.slice(2, 4), 16), parseInt(plein.slice(4, 6), 16), plein.length === 8 ? parseInt(plein.slice(6, 8), 16) / 255 : 1);
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(v)?.[1];
  if (rgb) {
    const lus = rgb.split(/[\s,/]+/).filter(Boolean).map((p) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p)));
    if (lus.length >= 3 && lus.every((n) => !Number.isNaN(n))) return swift(lus[0], lus[1], lus[2], lus[3] ?? 1);
  }
  return undefined;
}

/** Une longueur en points ; « clamp » et « min » prennent leur première valeur, celle des petits écrans. */
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
  const pasLisible = 'valeur que SwiftUI ne sait pas lire (calcul, taille d’écran, dégradé…)';
  const lg = (v: string, autoEn0 = false) => (autoEn0 && v === 'auto' ? 0 : longueur(v, taille));
  switch (propriete) {
    case 'color': {
      const c = couleur(valeur);
      if (!c) return pasLisible;
      r.couleur = c;
      return;
    }
    case 'background':
    case 'background-color': {
      if (valeur === 'none') { r.fond = null; return; }
      const c = couleur(valeur);
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
    case 'text-transform':
      if (valeur === 'uppercase') r.casse = '.uppercase';
      else if (valeur === 'lowercase') r.casse = '.lowercase';
      else if (valeur !== 'none') return pasLisible;
      return;
    case 'letter-spacing': {
      if (valeur === 'normal') return;
      const em = /^(-?\d*\.?\d+)em$/.exec(valeur);
      if (em) { r.espaceLettres = { em: parseFloat(em[1]) }; return; }
      const n = longueur(valeur);
      if (n === undefined) return pasLisible;
      r.espaceLettres = { px: n };
      return;
    }
    case 'line-height': {
      if (/^\d*\.?\d+$/.test(valeur)) { r.interligne = { fois: parseFloat(valeur) }; return; }
      if (valeur === 'normal') return;
      const n = longueur(valeur, taille);
      if (n === undefined) return pasLisible;
      r.interligne = n;
      return;
    }
    case 'text-align':
      if (!ALIGNE[valeur]) return pasLisible;
      r.alignement = ALIGNE[valeur];
      return;
    case 'padding': {
      const q = quatre(separer(valeur, /\s/));
      const n = q?.map((v) => lg(v));
      if (!n || n.some((x) => x === undefined)) return pasLisible;
      [r.haut, r.droite, r.bas, r.gauche] = n as number[];
      return;
    }
    case 'margin': {
      const q = quatre(separer(valeur, /\s/));
      const n = q?.map((v) => lg(v, true));
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
      if (['auto', 'none', 'max-content', 'fit-content', 'min-content'].includes(valeur) && propriete !== 'width' && propriete !== 'height') return;
      if (valeur === 'auto') return;
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
      const n = lg(separer(valeur, /\s/)[0]);
      if (n === undefined || separer(valeur, /\s/).length > 1) return pasLisible;
      r.arrondi = n;
      return;
    }
    case 'border': {
      if (valeur === 'none' || valeur === '0') { r.bordure = null; return; }
      const parties = separer(valeur, /\s/);
      const epaisseur = parties.map((p) => longueur(p)).find((n) => n !== undefined);
      const c = parties.map(couleur).find(Boolean);
      if (epaisseur === undefined || !c || parties.includes('dashed') || parties.includes('dotted')) return pasLisible;
      r.bordure = { epaisseur, couleur: c };
      return;
    }
    case 'box-shadow': {
      if (valeur === 'none') { r.ombre = null; return; }
      const couche = separer(valeur, /,/).at(-1)!;
      if (/\binset\b/.test(couche)) return pasLisible;
      const parties = separer(couche, /\s/);
      const longueurs = parties.map((p) => longueur(p)).filter((n): n is number => n !== undefined);
      const c = parties.map(couleur).find(Boolean);
      if (longueurs.length < 2 || !c) return pasLisible;
      r.ombre = { couleur: c, x: longueurs[0], y: longueurs[1], rayon: (longueurs[2] ?? 0) / 2 };
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
    case 'display':
      if (valeur === 'none') { r.masque = true; return; }
      return 'agencement : ce sont ligne, colonne et grille qui le décident';
    case 'font-family':
      return 'police : elle vient du thème';
    default:
      if (AGENCEMENT.test(propriete)) return 'agencement : ce sont ligne, colonne et grille qui le décident';
      if (PLACEMENT.test(propriete)) return 'placement libre, sans équivalent dans une pile SwiftUI';
      if (NAVIGATEUR.test(propriete)) return 'propre au navigateur';
      if (propriete.startsWith('border-')) return 'bordure d’un seul côté ou détail de bordure';
      return 'propriété sans équivalent';
  }
}

export class CssApple {
  private readonly regles: Regle[] = [];
  private readonly variables = new Map<string, string>();
  total = 0;
  traduites = 0;
  /** Pourquoi une déclaration ne passe pas → ce qui n'est pas passé. */
  readonly restes = new Map<string, string[]>();

  constructor(feuilles: { css: string; os?: 'ios' | 'macos' }[]) {
    let rang = 0;
    const blocs: { selecteur: string; corps: string; os?: 'ios' | 'macos' }[] = [];
    for (const feuille of feuilles) {
      const debut = blocs.length;
      this.lire(feuille.css.replace(/\/\*[\s\S]*?\*\//g, ''), blocs);
      for (const b of blocs.slice(debut)) if (feuille.os) b.os = feuille.os;
    }
    for (const b of blocs) if (b.selecteur === ':root') for (const [p, v] of this.declarations(b.corps)) if (p.startsWith('--')) this.variables.set(p, v);
    for (const b of blocs) {
      if (b.selecteur === ':root') continue;
      const selecteurs = b.selecteur.split(',').map((s) => s.trim());
      const classes = selecteurs.flatMap((s) => (/^\.[\w-]+$/.test(s) ? [s.slice(1)] : []));
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
      if (classes.length > 0) this.regles.push({ ...(b.os ? { os: b.os } : {}), classes, declarations, rang: rang++ });
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

  /** Le rendu pour un système : ce qui lui est propre passe après ce qui vaut pour les deux. */
  private rendu(classes: string[], os: 'ios' | 'macos'): Rendu {
    const communes = new Set(classes.filter((c) => !c.includes(':')));
    const propres = new Set(classes.flatMap((c) => (c.startsWith(`${os}:`) ? [c.slice(os.length + 1)] : [])));
    const r: Rendu = {};
    const choisies = this.regles.filter((regle) => (regle.os === undefined || regle.os === os) && regle.classes.some((c) => communes.has(c) || propres.has(c)));
    const precise = (regle: Regle) => (regle.os !== undefined || regle.classes.some((c) => propres.has(c)) ? 1 : 0);
    for (const regle of [...choisies].sort((a, b) => precise(a) - precise(b) || a.rang - b.rang)) {
      for (const [p, v] of regle.declarations) appliquer(r, p, v);
    }
    return r;
  }

  /** L'écart entre les enfants d'un bloc (« gap »), selon le système s'il diffère. */
  ecart(classes: string[]): number | string | undefined {
    if (classes.length === 0) return undefined;
    const ios = this.rendu(classes, 'ios').ecart;
    const mac = this.rendu(classes, 'macos').ecart;
    if (ios === mac) return ios;
    return `ecartHumalis(ios: ${ios ?? 12}, mac: ${mac ?? 12})`;
  }

  /** Un bloc garde la hauteur de son contenu : une taille fixe pensée pour une page web le ferait déborder. */
  modificateurs(classes: string[], sorte?: string): string[] {
    if (classes.length === 0) return [];
    const ajuster = (r: Rendu): Rendu => (sorte === 'bloc' ? { ...r, hauteur: undefined, hauteurMin: undefined, hauteurMax: undefined, largeur: r.largeur === 'infini' ? 'infini' : undefined, largeurMin: undefined } : r);
    const ios = this.lignes(ajuster(this.rendu(classes, 'ios')));
    const mac = this.lignes(ajuster(this.rendu(classes, 'macos')));
    if (ios.join() === mac.join()) return ios;
    // Swift refuse une branche vide devant des modificateurs : on n'écrit que la plateforme concernée.
    if (ios.length === 0) return mac.length ? ['#if os(macOS)', ...mac, '#endif'] : [];
    if (mac.length === 0) return ['#if os(iOS)', ...ios, '#endif'];
    return ['#if os(iOS)', ...ios, '#else', ...mac, '#endif'];
  }

  private lignes(r: Rendu): string[] {
    const l: string[] = [];
    if (r.taille !== undefined) l.push(`.font(.system(size: ${nombre(r.taille)}))`);
    if (r.graisse) l.push(`.fontWeight(${r.graisse})`);
    if (r.couleur) l.push(`.foregroundStyle(${r.couleur})`);
    if (r.casse) l.push(`.textCase(${r.casse})`);
    if (r.espaceLettres) l.push(`.tracking(${nombre(r.espaceLettres.px ?? (r.espaceLettres.em ?? 0) * (r.taille ?? 16))})`);
    if (r.interligne !== undefined) {
      const taille = r.taille ?? 16;
      const hauteur = typeof r.interligne === 'number' ? r.interligne : r.interligne.fois * taille;
      if (hauteur > taille * 1.2) l.push(`.lineSpacing(${nombre(hauteur - taille * 1.2)})`);
    }
    if (r.alignement) l.push(`.multilineTextAlignment(${r.alignement})`);
    const cote = (nom: string, n?: number) => { if (n) l.push(`.padding(.${nom}, ${nombre(n)})`); };
    cote('top', r.haut); cote('trailing', r.droite); cote('bottom', r.bas); cote('leading', r.gauche);
    const dim = (n?: Longueur) => (n === 'infini' ? '.infinity' : n === undefined ? undefined : nombre(n));
    const cadre = [
      r.largeurMin !== undefined ? `minWidth: ${nombre(r.largeurMin)}` : '',
      r.largeur !== undefined && r.largeur !== 'infini' ? `idealWidth: ${nombre(r.largeur)}` : '',
      r.largeurMax !== undefined || r.largeur !== undefined ? `maxWidth: ${dim(r.largeur ?? r.largeurMax)}` : '',
      r.hauteurMin !== undefined ? `minHeight: ${nombre(r.hauteurMin)}` : '',
      r.hauteur !== undefined && r.hauteur !== 'infini' ? `idealHeight: ${nombre(r.hauteur)}` : '',
      r.hauteurMax !== undefined || r.hauteur !== undefined ? `maxHeight: ${dim(r.hauteur ?? r.hauteurMax)}` : '',
    ].filter(Boolean);
    if (cadre.length) l.push(`.frame(${cadre.join(', ')})`);
    if (r.fond) l.push(`.background(${r.fond})`);
    if (r.arrondi) l.push(`.clipShape(RoundedRectangle(cornerRadius: ${nombre(r.arrondi)}))`);
    if (r.bordure) l.push(`.overlay(RoundedRectangle(cornerRadius: ${nombre(r.arrondi ?? 0)}).stroke(${r.bordure.couleur}, lineWidth: ${nombre(r.bordure.epaisseur)}))`);
    if (r.ombre) l.push(`.shadow(color: ${r.ombre.couleur}, radius: ${nombre(r.ombre.rayon)}, x: ${nombre(r.ombre.x)}, y: ${nombre(r.ombre.y)})`);
    if (r.opacite !== undefined) l.push(`.opacity(${nombre(r.opacite)})`);
    cote('top', r.margeHaut); cote('trailing', r.margeDroite); cote('bottom', r.margeBas); cote('leading', r.margeGauche);
    if (r.masque) l.push('.frame(width: 0, height: 0)', '.hidden()');
    return l;
  }

  /** Ce qui est passé et ce qui ne l'est pas, pour la personne qui écrit le CSS. */
  rapport(): string {
    const part = this.total ? Math.round((this.traduites * 100) / this.total) : 0;
    const lignes = ['# Le CSS sur la cible Apple', '', `${this.traduites} déclarations sur ${this.total} sont traduites en SwiftUI (${part} %).`, '', 'Ce qui ne passe pas, et pourquoi :', ''];
    for (const [raison, quoi] of [...this.restes].sort((a, b) => b[1].length - a[1].length)) {
      lignes.push(`## ${raison} (${quoi.length})`, '', ...quoi.map((q) => `- \`${q.replace(/`/g, "'")}\``), '');
    }
    return `${lignes.join('\n')}\n`;
  }
}
