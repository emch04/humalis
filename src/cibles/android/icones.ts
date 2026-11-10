/**
 * Les icônes de Humalis sur Android : les mêmes dessins que sur le web
 * (Lucide), traduits en chemins de vecteur que Compose sait tracer.
 * Seules les icônes employées par le programme sont écrites.
 */
import { FORMES_LUCIDE } from '../icones-donnees.js';
import { ICONES } from '../../vocabulaire/icones.js';
import { EcrivainKotlin } from './ecrivain.js';
import { chaineKotlin, nomKotlin } from './noms.js';

const attribut = (balise: string, nom: string): string | undefined => new RegExp(`\\b${nom}="([^"]*)"`).exec(balise)?.[1];
const n = (balise: string, nom: string): number => Number(attribut(balise, nom) ?? 0);

/** Une forme SVG de Lucide (path, circle, rect, line, polyline, polygon, ellipse) en données de chemin. */
function enChemin(forme: string): string | undefined {
  const genre = /^<(\w+)/.exec(forme)?.[1];
  switch (genre) {
    case 'path':
      return attribut(forme, 'd');
    case 'circle': {
      const [cx, cy, r] = [n(forme, 'cx'), n(forme, 'cy'), n(forme, 'r')];
      return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
    }
    case 'ellipse': {
      const [cx, cy, rx, ry] = [n(forme, 'cx'), n(forme, 'cy'), n(forme, 'rx'), n(forme, 'ry')];
      return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
    }
    case 'rect': {
      const [x, y, w, h] = [n(forme, 'x'), n(forme, 'y'), n(forme, 'width'), n(forme, 'height')];
      const r = Math.min(n(forme, 'rx') || n(forme, 'ry'), w / 2, h / 2);
      if (!r) return `M${x} ${y}h${w}v${h}h${-w}z`;
      return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
    }
    case 'line':
      return `M${n(forme, 'x1')} ${n(forme, 'y1')}L${n(forme, 'x2')} ${n(forme, 'y2')}`;
    case 'polyline':
    case 'polygon': {
      const points = (attribut(forme, 'points') ?? '').trim().split(/[\s,]+/).map(Number);
      if (points.length < 4) return undefined;
      let d = `M${points[0]} ${points[1]}`;
      for (let i = 2; i + 1 < points.length; i += 2) d += `L${points[i]} ${points[i + 1]}`;
      return genre === 'polygon' ? `${d}z` : d;
    }
    default:
      return undefined;
  }
}

/** Le nom Lucide d'une icône Humalis (ou d'un de ses alias). */
export function lucideDe(nom: string): string | undefined {
  return ICONES.find((i) => i.nom === nom || i.alias?.includes(nom))?.lucide;
}

/** Icones.kt : une propriété par icône employée, tracée au trait comme sur le web. */
export function iconesKotlin(paquet: string, noms: Set<string>): string {
  const e = new EcrivainKotlin();
  e.ligne("// Produit par Humalis : les icônes employées, dessinées d'après Lucide (https://lucide.dev, licence ISC).");
  e.ligne(`package ${paquet}`);
  e.ligne();
  for (const i of ['androidx.compose.ui.graphics.Color', 'androidx.compose.ui.graphics.SolidColor', 'androidx.compose.ui.graphics.StrokeCap', 'androidx.compose.ui.graphics.StrokeJoin', 'androidx.compose.ui.graphics.vector.ImageVector', 'androidx.compose.ui.graphics.vector.PathParser', 'androidx.compose.ui.unit.dp']) e.ligne(`import ${i}`);
  e.ligne();
  e.bloc('private fun icone(nom: String, vararg chemins: String): ImageVector {', () => {
    e.ligne('val dessin = ImageVector.Builder(nom, 24.dp, 24.dp, 24f, 24f)');
    e.ligne('for (d in chemins) dessin.addPath(PathParser().parsePathString(d).toNodes(), stroke = SolidColor(Color.Black), strokeLineWidth = 2f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round)');
    e.ligne('return dessin.build()');
  });
  e.ligne();
  e.bloc('object Icones {', () => {
    for (const nom of [...noms].sort()) {
      const formes = FORMES_LUCIDE[lucideDe(nom) ?? ''] ?? FORMES_LUCIDE['circle-help'] ?? '<circle cx="12" cy="12" r="10" />';
      const chemins = (formes.match(/<\w+[^>]*\/>/g) ?? []).flatMap((f) => enChemin(f) ?? []);
      e.ligne(`val ${nomKotlin(nom)} by lazy { icone(${[chaineKotlin(nom), ...chemins.map(chaineKotlin)].join(', ')}) }`);
    }
  });
  return e.texte();
}
