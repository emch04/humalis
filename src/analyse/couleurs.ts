/**
 * Un peu de calcul sur les couleurs (formules WCAG), sans dépendance :
 * la couleur d'« encre » lisible sur un fond, et le contraste entre deux
 * couleurs.
 */

/** Le fond de la page, en clair et en sombre (le même que le CSS produit). */
export const FOND_PAGE = { clair: '#ffffff', sombre: '#141416' } as const;
const ENCRE_SOMBRE = '#1d1d1f';

/** « #rgb » ou « #rrggbb » : les trois composantes de 0 à 255, ou undefined. */
export function lireCouleur(texte: string): [number, number, number] | undefined {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(texte.trim());
  if (!m) return undefined;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** La forme complète et minuscule d'une couleur valide : « #0E5A6B » devient « #0e5a6b », « #fff » devient « #ffffff ». */
export function normaliserCouleur(texte: string): string | undefined {
  const c = lireCouleur(texte);
  return c ? `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}` : undefined;
}

/** La luminance relative (0 : noir, 1 : blanc). */
export function luminance(couleur: string): number {
  const c = lireCouleur(couleur) ?? [0, 0, 0];
  const [r, g, b] = c.map((x) => {
    const v = x / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Le rapport de contraste entre deux couleurs, de 1 à 21. */
export function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (clair + 0.05) / (sombre + 0.05);
}

/** La couleur du texte posé sur ce fond : blanche ou foncée, la plus lisible. */
export function encreSur(fond: string): string {
  return contraste(fond, '#ffffff') >= contraste(fond, ENCRE_SOMBRE) ? '#ffffff' : ENCRE_SOMBRE;
}
