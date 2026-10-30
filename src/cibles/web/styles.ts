/**
 * Les couleurs nommées de Humalis, lisibles sur fond clair et sur fond
 * sombre. `encre` est la couleur du texte posé sur ce fond (« avec fond
 * vert ») : blanche sur une couleur foncée, foncée sur une couleur claire.
 */
export const COULEURS_CSS: Record<
  string,
  { clair: string; sombre: string; encreClair: string; encreSombre: string }
> = {
  bleu: { clair: '#1f5fbf', sombre: '#7fb0ff', encreClair: '#ffffff', encreSombre: '#141416' },
  rouge: { clair: '#c62828', sombre: '#ff8a80', encreClair: '#ffffff', encreSombre: '#141416' },
  vert: { clair: '#2e7d32', sombre: '#81c784', encreClair: '#ffffff', encreSombre: '#141416' },
  jaune: { clair: '#f2c200', sombre: '#ffe066', encreClair: '#1d1d1f', encreSombre: '#141416' },
  orange: { clair: '#e65100', sombre: '#ffab70', encreClair: '#ffffff', encreSombre: '#141416' },
  violet: { clair: '#6a3fb5', sombre: '#c3a6ff', encreClair: '#ffffff', encreSombre: '#141416' },
  rose: { clair: '#c2185b', sombre: '#f48fb1', encreClair: '#ffffff', encreSombre: '#141416' },
  gris: { clair: '#5f6368', sombre: '#b0b3b8', encreClair: '#ffffff', encreSombre: '#141416' },
  noir: { clair: '#1d1d1f', sombre: '#000000', encreClair: '#ffffff', encreSombre: '#f2f2f4' },
  blanc: { clair: '#ffffff', sombre: '#ffffff', encreClair: '#1d1d1f', encreSombre: '#141416' },
};
