/**
 * La largeur et la hauteur d'une image, lues à la main dans les premiers
 * octets du fichier (plan des médias, 4.2) : aucune bibliothèque. Le code
 * produit les écrit (`width`, `height`) pour réserver la place de l'image
 * avant qu'elle arrive : la page ne saute pas pendant le chargement.
 *
 * Formats lus : PNG, JPEG (avec l'orientation EXIF), WebP (VP8, VP8L, VP8X),
 * GIF, AVIF (boîte `ispe`) et SVG (`viewBox`, sinon `width` et `height`).
 * Un fichier tronqué, inconnu ou abîmé donne undefined : jamais d'exception.
 */

export type FormatImage = 'png' | 'jpeg' | 'webp' | 'gif' | 'avif' | 'svg';

export interface Dimensions {
  largeur: number;
  hauteur: number;
  format: FormatImage;
}

/** Les dimensions de l'image, ou undefined si le fichier ne se lit pas. */
export function dimensionsImage(octets: Uint8Array): Dimensions | undefined {
  try {
    return png(octets) ?? gif(octets) ?? jpeg(octets) ?? webp(octets) ?? avif(octets) ?? svg(octets);
  } catch {
    return undefined;
  }
}

const valides = (largeur: number, hauteur: number, format: FormatImage): Dimensions | undefined =>
  Number.isFinite(largeur) && Number.isFinite(hauteur) && largeur > 0 && hauteur > 0 ? { largeur, hauteur, format } : undefined;

const commencePar = (o: Uint8Array, debut: number[], a = 0) => o.length >= a + debut.length && debut.every((b, i) => o[a + i] === b);
const texte = (o: Uint8Array, a: number, n: number) => String.fromCharCode(...o.subarray(a, a + n));
const be16 = (o: Uint8Array, a: number) => (o[a] << 8) | o[a + 1];
const le16 = (o: Uint8Array, a: number) => o[a] | (o[a + 1] << 8);
const be32 = (o: Uint8Array, a: number) => ((o[a] << 24) >>> 0) + ((o[a + 1] << 16) | (o[a + 2] << 8) | o[a + 3]);
const le24 = (o: Uint8Array, a: number) => o[a] | (o[a + 1] << 8) | (o[a + 2] << 16);

/** PNG : la signature, puis l'en-tête IHDR (largeur et hauteur aux octets 16 à 24). */
function png(o: Uint8Array): Dimensions | undefined {
  if (!commencePar(o, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || o.length < 24 || texte(o, 12, 4) !== 'IHDR') return undefined;
  return valides(be32(o, 16), be32(o, 20), 'png');
}

/** GIF : « GIF87a » ou « GIF89a », puis la largeur et la hauteur (petit-boutiste). */
function gif(o: Uint8Array): Dimensions | undefined {
  if (o.length < 10 || !/^GIF8[79]a$/.test(texte(o, 0, 6))) return undefined;
  return valides(le16(o, 6), le16(o, 8), 'gif');
}

/**
 * JPEG : les segments jusqu'au premier SOF (début d'image), qui donne la
 * hauteur puis la largeur. L'orientation EXIF 5 à 8 tourne l'image d'un
 * quart de tour à l'affichage : largeur et hauteur s'échangent.
 */
function jpeg(o: Uint8Array): Dimensions | undefined {
  if (!commencePar(o, [0xff, 0xd8])) return undefined;
  let a = 2;
  let orientation = 1;
  while (a + 4 <= o.length) {
    if (o[a] !== 0xff) return undefined;
    const marqueur = o[a + 1];
    // Octets de remplissage (0xFF répétés) entre deux segments.
    if (marqueur === 0xff) {
      a += 1;
      continue;
    }
    // Les marqueurs sans longueur : début d'image, redémarrages.
    if (marqueur === 0xd8 || marqueur === 0x01 || (marqueur >= 0xd0 && marqueur <= 0xd7)) {
      a += 2;
      continue;
    }
    if (marqueur === 0xd9 || marqueur === 0xda) return undefined;
    const longueur = be16(o, a + 2);
    if (longueur < 2) return undefined;
    if (marqueur === 0xe1 && texte(o, a + 4, 6) === 'Exif\0\0') orientation = orientationExif(o, a + 10, a + 2 + longueur) ?? orientation;
    const sof = marqueur >= 0xc0 && marqueur <= 0xcf && marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc;
    if (sof) {
      if (a + 9 > o.length) return undefined;
      const hauteur = be16(o, a + 5);
      const largeur = be16(o, a + 7);
      return orientation >= 5 && orientation <= 8 ? valides(hauteur, largeur, 'jpeg') : valides(largeur, hauteur, 'jpeg');
    }
    a += 2 + longueur;
  }
  return undefined;
}

/** L'orientation (étiquette 0x0112) dans le premier répertoire TIFF d'un bloc EXIF. */
function orientationExif(o: Uint8Array, debut: number, fin: number): number | undefined {
  if (debut + 8 > Math.min(fin, o.length)) return undefined;
  const petit = texte(o, debut, 2) === 'II';
  if (!petit && texte(o, debut, 2) !== 'MM') return undefined;
  const u16 = (a: number) => (petit ? le16(o, a) : be16(o, a));
  const u32 = (a: number) => (petit ? (le16(o, a) + le16(o, a + 2) * 0x10000) : be32(o, a));
  const repertoire = debut + u32(debut + 4);
  if (repertoire + 2 > Math.min(fin, o.length)) return undefined;
  const entrees = u16(repertoire);
  for (let i = 0; i < entrees; i++) {
    const e = repertoire + 2 + i * 12;
    if (e + 12 > Math.min(fin, o.length)) return undefined;
    if (u16(e) === 0x0112) return u16(e + 8);
  }
  return undefined;
}

/** WebP : un fichier RIFF « WEBP », puis un morceau VP8 (avec perte), VP8L (sans perte) ou VP8X (étendu). */
function webp(o: Uint8Array): Dimensions | undefined {
  if (o.length < 30 || texte(o, 0, 4) !== 'RIFF' || texte(o, 8, 4) !== 'WEBP') return undefined;
  const morceau = texte(o, 12, 4);
  if (morceau === 'VP8 ') {
    if (!commencePar(o, [0x9d, 0x01, 0x2a], 23)) return undefined;
    return valides(le16(o, 26) & 0x3fff, le16(o, 28) & 0x3fff, 'webp');
  }
  if (morceau === 'VP8L') {
    if (o[20] !== 0x2f) return undefined;
    const bits = o[21] | (o[22] << 8) | (o[23] << 16) | (o[24] << 24);
    return valides((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1, 'webp');
  }
  if (morceau === 'VP8X') return valides(le24(o, 24) + 1, le24(o, 27) + 1, 'webp');
  return undefined;
}

/** AVIF : un fichier ISO (« ftyp » avif ou avis), dont la boîte « ispe » donne la largeur et la hauteur. */
function avif(o: Uint8Array): Dimensions | undefined {
  if (o.length < 16 || texte(o, 4, 4) !== 'ftyp' || !/^avi[fs]$/.test(texte(o, 8, 4))) return undefined;
  const limite = Math.min(o.length - 16, 4096);
  for (let a = 12; a <= limite; a++) {
    if (o[a] === 0x69 && texte(o, a, 4) === 'ispe') return valides(be32(o, a + 8), be32(o, a + 12), 'avif');
  }
  return undefined;
}

/** SVG : la boîte de dessin (`viewBox`), sinon `width` et `height` sans unité ou en pixels. */
function svg(o: Uint8Array): Dimensions | undefined {
  const debut = new TextDecoder().decode(o.subarray(0, 4096));
  const balise = /<svg\b[^>]*>/i.exec(debut)?.[0];
  if (!balise) return undefined;
  const boite = /\bviewBox\s*=\s*["']\s*[-\d.eE]+[\s,]+[-\d.eE]+[\s,]+([\d.eE]+)[\s,]+([\d.eE]+)\s*["']/.exec(balise);
  if (boite) return valides(Number(boite[1]), Number(boite[2]), 'svg');
  const mesure = (nom: string) => /^([\d.]+)(px)?$/.exec(new RegExp(`\\b${nom}\\s*=\\s*["']([^"']+)["']`).exec(balise)?.[1]?.trim() ?? '')?.[1];
  const largeur = mesure('width');
  const hauteur = mesure('height');
  return largeur && hauteur ? valides(Number(largeur), Number(hauteur), 'svg') : undefined;
}
