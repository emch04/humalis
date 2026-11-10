/**
 * « utiliser icones "./icones.svg" » : un fichier SVG dont chaque <symbol id="nom"> est une icône.
 * Le tracé est lu ici une fois pour toutes : le web reprend le SVG, Apple rejoue les commandes.
 */
export interface TraceIcone {
  /** Les commandes absolues : M, L, C (Q, S, H, V et les arcs sont convertis), Z. */
  commandes: string;
  valeurs: number[];
  /** Absent : pas de remplissage. Sans couleur : celle du texte. */
  remplissage?: { opacite: number; couleur?: CouleurSvg; degrade?: DegradeSvg };
  /** Absent : pas de trait. « fixe » : l'épaisseur ne suit pas l'échelle (vector-effect). */
  trait?: { epaisseur: number; opacite: number; couleur?: CouleurSvg; fixe?: boolean };
}

/** Rouge, vert, bleu, opacité, de 0 à 1. */
export type CouleurSvg = [number, number, number, number];
/** Un dégradé linéaire, en proportions de la forme (x1, y1, x2, y2). */
export interface DegradeSvg { de: [number, number]; a: [number, number]; arrets: { p: number; c: CouleurSvg }[] }

const NOMMEES: Record<string, CouleurSvg> = { white: [1, 1, 1, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0], red: [1, 0, 0, 1], blue: [0, 0, 1, 1], green: [0, 0.5, 0, 1] };

/** Une couleur écrite dans un SVG ; undefined pour « currentColor » ou ce qui n'est pas lu. */
export function couleurSvg(v: string | undefined, opacite = 1): CouleurSvg | undefined {
  if (!v) return undefined;
  const t = v.trim().toLowerCase();
  let c: CouleurSvg | undefined = NOMMEES[t];
  const h = /^#([0-9a-f]{3,8})$/.exec(t);
  if (h) {
    const x = h[1]!.length <= 4 ? [...h[1]!].map((k) => k + k).join('') : h[1]!;
    c = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255).concat(x.length === 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1) as CouleurSvg;
  }
  const r = /^rgba?\(([^)]*)\)$/.exec(t);
  if (r) {
    const p = r[1]!.split(/[\s,/]+/).filter(Boolean).map((s) => (s.endsWith('%') ? (parseFloat(s) * 2.55) : parseFloat(s)));
    c = [p[0]! / 255, p[1]! / 255, p[2]! / 255, p[3] ?? 1];
  }
  return c ? [c[0], c[1], c[2], Number((c[3] * opacite).toFixed(4))] : undefined;
}

/** Les dégradés linéaires déclarés dans <defs>, par identifiant. */
function degradesDe(svg: string): Map<string, DegradeSvg> {
  const sortie = new Map<string, DegradeSvg>();
  for (const m of svg.matchAll(/<linearGradient\b([^>]*)>([\s\S]*?)<\/linearGradient>/gi)) {
    const id = attribut(m[1]!, 'id');
    if (!id) continue;
    const prop = (nom: string, d: number) => { const v = attribut(m[1]!, nom); return v === undefined ? d : v.endsWith('%') ? parseFloat(v) / 100 : Number(v); };
    const arrets = [...m[2]!.matchAll(/<stop\b([^>]*?)\/?>/gi)].flatMap((s) => {
      const off = attribut(s[1]!, 'offset') ?? '0';
      const c = couleurSvg(attribut(s[1]!, 'stop-color') ?? 'black', Number(attribut(s[1]!, 'stop-opacity') ?? 1));
      return c ? [{ p: off.endsWith('%') ? parseFloat(off) / 100 : Number(off), c }] : [];
    });
    sortie.set(id, { de: [prop('x1', 0), prop('y1', 0)], a: [prop('x2', 1), prop('y2', 0)], arrets });
  }
  return sortie;
}

export interface IconeDessinee {
  nom: string;
  largeur: number;
  hauteur: number;
  /** L'intérieur du <symbol>, pour le web. */
  svg: string;
  traces: TraceIcone[];
  /** « preserveAspectRatio » : « couvre » (slice) ou « etire » (none) ; absent : tout voir, centré. */
  cadrage?: 'couvre' | 'etire';
}

/** Lit un attribut, sur l'élément ou sur ce dont il hérite. */
function attribut(balise: string, nom: string): string | undefined {
  return new RegExp(`(?:^|\\s)${nom}\\s*=\\s*"([^"]*)"`, 'i').exec(balise)?.[1] ?? new RegExp(`(?:^|\\s)${nom}\\s*=\\s*'([^']*)'`, 'i').exec(balise)?.[1];
}

/** Convertit un arc SVG en courbes, en coordonnées absolues (méthode du standard SVG). */
function arcEnCourbes(x0: number, y0: number, rxLu: number, ryLu: number, angle: number, grand: boolean, sens: boolean, x: number, y: number): number[][] {
  if (rxLu === 0 || ryLu === 0) return [[x0, y0, x, y, x, y]];
  let rx = Math.abs(rxLu);
  let ry = Math.abs(ryLu);
  const phi = (angle * Math.PI) / 180;
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const dx = (x0 - x) / 2;
  const dy = (y0 - y) / 2;
  const xp = c * dx + s * dy;
  const yp = -s * dx + c * dy;
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  const k = (grand === sens ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * yp) / ry;
  const cyp = (-k * ry * xp) / rx;
  const cx = c * cxp - s * cyp + (x0 + x) / 2;
  const cy = s * cxp + c * cyp + (y0 + y) / 2;
  const t1 = Math.atan2((yp - cyp) / ry, (xp - cxp) / rx);
  let dt = Math.atan2((-yp - cyp) / ry, (-xp - cxp) / rx) - t1;
  if (sens && dt < 0) dt += 2 * Math.PI;
  if (!sens && dt > 0) dt -= 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const pas = dt / n;
  const t = (4 / 3) * Math.tan(pas / 4);
  const point = (a: number, b: number) => [c * rx * a - s * ry * b + cx, s * rx * a + c * ry * b + cy];
  const sorties: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * pas;
    const b = a + pas;
    sorties.push([
      ...point(Math.cos(a) - t * Math.sin(a), Math.sin(a) + t * Math.cos(a)),
      ...point(Math.cos(b) + t * Math.sin(b), Math.sin(b) - t * Math.cos(b)),
      ...point(Math.cos(b), Math.sin(b)),
    ]);
  }
  return sorties;
}

/** Un chemin SVG (« M3 11l9-8 … ») en commandes absolues M, L, C, Z. */
export function lireChemin(d: string): { commandes: string; valeurs: number[] } {
  const jetons = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  let commandes = '';
  const valeurs: number[] = [];
  let x = 0, y = 0, departX = 0, departY = 0, controleX = 0, controleY = 0;
  let cmd = '';
  let precedente = '';
  const nombre = (): number => Number(jetons[i++]);
  // Les drapeaux d'un arc peuvent être collés : « a1 1 0 01.5 2 ».
  const drapeau = (): boolean => {
    const j = jetons[i];
    if (j === '0' || j === '1') { i++; return j === '1'; }
    const v = j[0] === '1';
    jetons[i] = j.slice(1);
    return v;
  };
  const courbe = (a: number, b: number, c: number, e: number, f: number, g: number) => {
    commandes += 'C';
    valeurs.push(a, b, c, e, f, g);
    controleX = c; controleY = e; x = f; y = g;
  };
  while (i < jetons.length) {
    if (/^[a-zA-Z]$/.test(jetons[i])) cmd = jetons[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        x = ox + nombre(); y = oy + nombre(); departX = x; departY = y;
        commandes += 'M'; valeurs.push(x, y);
        cmd = rel ? 'l' : 'L';
        precedente = 'M';
        continue;
      case 'L': x = ox + nombre(); y = oy + nombre(); commandes += 'L'; valeurs.push(x, y); break;
      case 'H': x = ox + nombre(); commandes += 'L'; valeurs.push(x, y); break;
      case 'V': y = oy + nombre(); commandes += 'L'; valeurs.push(x, y); break;
      case 'C': { const a = ox + nombre(), b = oy + nombre(), c = ox + nombre(), e = oy + nombre(), f = ox + nombre(), g = oy + nombre(); courbe(a, b, c, e, f, g); break; }
      case 'S': {
        const a = precedente === 'C' || precedente === 'S' ? 2 * x - controleX : x;
        const b = precedente === 'C' || precedente === 'S' ? 2 * y - controleY : y;
        const c = ox + nombre(), e = oy + nombre(), f = ox + nombre(), g = oy + nombre();
        courbe(a, b, c, e, f, g);
        break;
      }
      case 'Q': case 'T': {
        let qx: number, qy: number;
        if (cmd.toUpperCase() === 'Q') { qx = ox + nombre(); qy = oy + nombre(); }
        else { qx = precedente === 'Q' || precedente === 'T' ? 2 * x - controleX : x; qy = precedente === 'Q' || precedente === 'T' ? 2 * y - controleY : y; }
        const f = ox + nombre(), g = oy + nombre();
        const x0 = x, y0 = y;
        courbe(x0 + (2 / 3) * (qx - x0), y0 + (2 / 3) * (qy - y0), f + (2 / 3) * (qx - f), g + (2 / 3) * (qy - g), f, g);
        controleX = qx; controleY = qy;
        break;
      }
      case 'A': {
        const rx = nombre(), ry = nombre(), angle = nombre(), grand = drapeau(), sens = drapeau(), f = ox + nombre(), g = oy + nombre();
        for (const c of arcEnCourbes(x, y, rx, ry, angle, grand, sens, f, g)) courbe(c[0], c[1], c[2], c[3], c[4], c[5]);
        break;
      }
      case 'Z':
        commandes += 'Z'; x = departX; y = departY;
        break;
      default:
        i++;
    }
    precedente = cmd.toUpperCase();
  }
  return { commandes, valeurs: valeurs.map((v) => Number(v.toFixed(3))) };
}

const n = (balise: string, nom: string, defaut = 0) => Number(attribut(balise, nom) ?? defaut);

/** Une forme SVG en chemin. */
function cheminDe(genre: string, b: string): string | undefined {
  switch (genre) {
    case 'path': return attribut(b, 'd');
    case 'circle': { const r = n(b, 'r'), cx = n(b, 'cx'), cy = n(b, 'cy'); return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`; }
    case 'ellipse': { const rx = n(b, 'rx'), ry = n(b, 'ry'), cx = n(b, 'cx'), cy = n(b, 'cy'); return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`; }
    case 'line': return `M${n(b, 'x1')} ${n(b, 'y1')}L${n(b, 'x2')} ${n(b, 'y2')}`;
    case 'polyline': case 'polygon': { const p = (attribut(b, 'points') ?? '').trim().split(/[\s,]+/); let d = ''; for (let i = 0; i + 1 < p.length; i += 2) d += `${i === 0 ? 'M' : 'L'}${p[i]} ${p[i + 1]}`; return genre === 'polygon' ? `${d}Z` : d; }
    case 'rect': {
      const x = n(b, 'x'), y = n(b, 'y'), l = n(b, 'width'), h = n(b, 'height');
      const r = Math.min(n(b, 'rx', n(b, 'ry')), l / 2, h / 2);
      if (r <= 0) return `M${x} ${y}H${x + l}V${y + h}H${x}Z`;
      return `M${x + r} ${y}H${x + l - r}A${r} ${r} 0 0 1 ${x + l} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + l - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
    }
    default: return undefined;
  }
}

/** Une valeur écrite sur la forme, sinon sur le symbole, sinon sur le fichier. */
const herite = (nom: string, ...balises: string[]): string | undefined => {
  for (const b of balises) { const v = attribut(b, nom); if (v !== undefined) return v; }
  return undefined;
};

export function lireIconesSvg(contenu: string): IconeDessinee[] {
  const racine = /<svg\b([^>]*)>/i.exec(contenu)?.[1] ?? '';
  return [...contenu.matchAll(/<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/gi)].flatMap((m) => {
    const entete = m[1];
    const nom = attribut(entete, 'id');
    if (!nom) return [];
    const boite = (attribut(entete, 'viewBox') ?? '0 0 24 24').trim().split(/[\s,]+/).map(Number);
    const traces: TraceIcone[] = [];
    const degrades = degradesDe(m[2]);
    for (const f of m[2].matchAll(/<(path|circle|ellipse|line|polyline|polygon|rect)\b([^>]*?)\/?>/gi)) {
      const b = f[2];
      const d = cheminDe(f[1].toLowerCase(), b);
      if (!d) continue;
      const fill = herite('fill', b, entete, racine);
      const stroke = herite('stroke', b, entete, racine);
      const opacite = Number(herite('opacity', b) ?? 1);
      // Une couleur écrite (« #FFD0BE », « rgba(…) ») est gardée ; « currentColor » suit le texte.
      const degrade = /^url\(#([^)]+)\)$/.exec(fill ?? '')?.[1];
      const couleurFond = couleurSvg(fill);
      const couleurTrait = couleurSvg(stroke);
      traces.push({
        ...lireChemin(d),
        // Comme en SVG, une forme sans « fill » est remplie.
        ...(fill !== 'none' && !(fill === undefined && f[1].toLowerCase() === 'line') ? { remplissage: { opacite: opacite * Number(herite('fill-opacity', b, entete) ?? 1), ...(couleurFond ? { couleur: couleurFond } : {}), ...(degrade && degrades.has(degrade) ? { degrade: degrades.get(degrade)! } : {}) } } : {}),
        ...(stroke !== undefined && stroke !== 'none' ? { trait: { epaisseur: Number(herite('stroke-width', b, entete, racine) ?? 1), opacite: opacite * Number(herite('stroke-opacity', b, entete) ?? 1), ...(couleurTrait ? { couleur: couleurTrait } : {}), ...(attribut(b, 'vector-effect') === 'non-scaling-stroke' ? { fixe: true } : {}) } } : {}),
      });
    }
    const cadre = attribut(entete, 'preserveAspectRatio') ?? '';
    const cadrage = /slice/.test(cadre) ? 'couvre' : cadre.trim() === 'none' ? 'etire' : undefined;
    return [{ nom, largeur: boite[2] ?? 24, hauteur: boite[3] ?? 24, svg: m[2].trim(), traces, ...(cadrage ? { cadrage } : {}) }];
  });
}
