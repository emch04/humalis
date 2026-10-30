import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyser } from '../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../src/parser/parser.js';
import { ErreurSyntaxique } from '../../src/parser/erreurs.js';

const arbreDe = (chemin: string) => analyserSyntaxe(analyser(readFileSync(chemin, 'utf8')));

describe('parser — exemples réels', () => {
  it('analyse la boutique sans erreur', () => {
    const arbre = arbreDe('exemples/boutique.humalis');

    expect(arbre.pages.map((p) => p.nom)).toEqual(['boutique', 'panier']);
    expect(arbre.partages.map((v) => v.nom)).toEqual(['panier']);
    expect(arbre.pages[0].corps.map((i) => i.type)).toEqual([
      'Variable',
      'Variable',
      'Variable',
      'Element',
      'Element',
      'Boucle',
      'Condition',
      'Element',
      'Evenement',
    ]);
  });

  it('analyse la page de connexion sans erreur', () => {
    const arbre = arbreDe('exemples/connexion.humalis');

    expect(arbre.pages[0].nom).toBe('connexion');
    expect(arbre.pages[0].corps.map((i) => i.type)).toEqual([
      'Variable',
      'Element',
      'Element',
      'Evenement',
    ]);
  });

  it('refuse une page déclarée deux fois', () => {
    const source = 'page "a" :\n    titre "x"\npage "a" :\n    titre "y"';
    expect(() => analyserSyntaxe(analyser(source))).toThrow(ErreurSyntaxique);
    expect(() => analyserSyntaxe(analyser(source))).toThrow(/déjà déclarée/);
  });
});
