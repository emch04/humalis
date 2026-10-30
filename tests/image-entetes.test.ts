import { describe, it, expect } from 'vitest';
import { dimensionsImage } from '../src/medias/entetes-image.js';

const octets = (...morceaux: (number[] | string)[]) =>
  new Uint8Array(morceaux.flatMap((m) => (typeof m === 'string' ? [...m].map((c) => c.charCodeAt(0)) : m)));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];

const PNG = (l: number, h: number) => octets([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), 'IHDR', be32(l), be32(h), [8, 6, 0, 0, 0]);

/** Un JPEG : APP0 (JFIF), un APP1 EXIF facultatif avec l'orientation, puis le SOF0. */
function JPEG(l: number, h: number, orientation?: number, grandOrdre = true) {
  const app0 = [0xff, 0xe0, ...be16(16), ...'JFIF\0'.split('').map((c) => c.charCodeAt(0)), 1, 1, 0, 0, 1, 0, 1, 0, 0];
  let app1: number[] = [];
  if (orientation !== undefined) {
    const u16 = grandOrdre ? be16 : le16;
    const u32 = (n: number) => (grandOrdre ? be32(n) : [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
    const tiff = [...(grandOrdre ? [0x4d, 0x4d] : [0x49, 0x49]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
    const corps = [...'Exif\0\0'.split('').map((c) => c.charCodeAt(0)), ...tiff];
    app1 = [0xff, 0xe1, ...be16(corps.length + 2), ...corps];
  }
  const sof = [0xff, 0xc0, ...be16(17), 8, ...be16(h), ...be16(l), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return octets([0xff, 0xd8], app0, app1, sof, [0xff, 0xd9]);
}

const RIFF = (morceau: string, corps: number[]) => octets('RIFF', [0, 0, 0, 0], 'WEBP', morceau, [0, 0, 0, 0], corps, new Array(16).fill(0));

describe('les dimensions d’une image, lues dans ses premiers octets', () => {
  it('PNG', () => {
    expect(dimensionsImage(PNG(1600, 900))).toEqual({ largeur: 1600, hauteur: 900, format: 'png' });
  });
  it('JPEG sans EXIF', () => {
    expect(dimensionsImage(JPEG(1200, 800))).toEqual({ largeur: 1200, hauteur: 800, format: 'jpeg' });
  });
  it('JPEG avec EXIF : l’orientation 6 (photo prise debout) échange largeur et hauteur, dans les deux ordres d’octets', () => {
    expect(dimensionsImage(JPEG(4032, 3024, 6))).toEqual({ largeur: 3024, hauteur: 4032, format: 'jpeg' });
    expect(dimensionsImage(JPEG(4032, 3024, 8, false))).toEqual({ largeur: 3024, hauteur: 4032, format: 'jpeg' });
    expect(dimensionsImage(JPEG(4032, 3024, 1))).toEqual({ largeur: 4032, hauteur: 3024, format: 'jpeg' });
  });
  it('WebP : VP8, VP8L et VP8X', () => {
    const vp8 = RIFF('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(640), ...le16(480)]);
    expect(dimensionsImage(vp8)).toEqual({ largeur: 640, hauteur: 480, format: 'webp' });
    const bits = (800 - 1) | ((600 - 1) << 14);
    const vp8l = RIFF('VP8L', [0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255]);
    expect(dimensionsImage(vp8l)).toEqual({ largeur: 800, hauteur: 600, format: 'webp' });
    const vp8x = RIFF('VP8X', [0, 0, 0, 0, ...le24(1920 - 1), ...le24(1080 - 1)]);
    expect(dimensionsImage(vp8x)).toEqual({ largeur: 1920, hauteur: 1080, format: 'webp' });
  });
  it('GIF et AVIF', () => {
    expect(dimensionsImage(octets('GIF89a', le16(320), le16(200), [0, 0, 0]))).toEqual({ largeur: 320, hauteur: 200, format: 'gif' });
    const avif = octets(be32(20), 'ftyp', 'avif', [0, 0, 0, 0], 'mif1', be32(20), 'ispe', [0, 0, 0, 0], be32(1000), be32(750));
    expect(dimensionsImage(avif)).toEqual({ largeur: 1000, hauteur: 750, format: 'avif' });
  });
  it('SVG : viewBox, sinon width et height', () => {
    const lire = (s: string) => dimensionsImage(new TextEncoder().encode(s));
    expect(lire('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><path d="M0 0"/></svg>')).toEqual({ largeur: 120, hauteur: 40, format: 'svg' });
    expect(lire('<svg width="64px" height="32" xmlns="http://www.w3.org/2000/svg"></svg>')).toEqual({ largeur: 64, hauteur: 32, format: 'svg' });
    expect(lire('<svg width="100%" height="2em"></svg>')).toBeUndefined();
  });
  it('un fichier tronqué ou inconnu donne undefined', () => {
    expect(dimensionsImage(PNG(10, 10).subarray(0, 20))).toBeUndefined();
    expect(dimensionsImage(JPEG(10, 10).subarray(0, 24))).toBeUndefined();
    expect(dimensionsImage(octets('bonjour tout le monde'))).toBeUndefined();
    expect(dimensionsImage(new Uint8Array())).toBeUndefined();
  });
  it('des octets au hasard ne lèvent jamais d’exception', () => {
    let graine = 42;
    const hasard = () => ((graine = (graine * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 256;
    const debuts = [[0x89, 0x50, 0x4e, 0x47], [0xff, 0xd8], [...'RIFF'].map((c) => c.charCodeAt(0)), [...'GIF89a'].map((c) => c.charCodeAt(0)), []];
    for (let i = 0; i < 2000; i++) {
      const debut = debuts[i % debuts.length];
      const o = new Uint8Array(debut.length + Math.floor(hasard() / 2));
      o.set(debut);
      for (let j = debut.length; j < o.length; j++) o[j] = Math.floor(hasard());
      expect(() => dimensionsImage(o)).not.toThrow();
    }
  });
});
