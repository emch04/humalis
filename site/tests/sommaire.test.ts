import { describe, it, expect } from 'vitest';
import { SOMMAIRE, voisines } from '../src/contenu/sommaire';

describe('sommaire', () => {
  it('chaque chemin est unique et commence par /documentation', () => {
    const chemins = SOMMAIRE.map((e) => e.chemin);
    expect(new Set(chemins).size).toBe(chemins.length);
    for (const c of chemins) expect(c).toMatch(/^\/documentation(\/|$)/);
  });

  it('contient les pages prévues pour l’étape 0', () => {
    expect(SOMMAIRE.map((e) => e.chemin)).toEqual(
      expect.arrayContaining([
        '/documentation/prise-en-main',
        '/documentation/pages',
        '/documentation/elements',
        '/documentation/styles',
        '/documentation/evenements',
        '/documentation/actions',
        '/documentation/variables',
        '/documentation/conditions',
        '/documentation/listes-et-boucles',
        '/documentation/principes',
        '/documentation/vocabulaire',
        '/documentation/erreurs',
      ]),
    );
  });

  it('chaque entrée a un titre et un résumé', () => {
    for (const e of SOMMAIRE) {
      expect(e.titre).not.toBe('');
      expect(e.resume).not.toBe('');
    }
  });

  it('donne les pages voisines', () => {
    expect(voisines(SOMMAIRE[0].chemin).precedente).toBeUndefined();
    expect(voisines(SOMMAIRE[0].chemin).suivante).toBe(SOMMAIRE[1]);
    expect(voisines('/inconnu')).toEqual({});
  });
});
