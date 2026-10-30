import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../src/parser/parser.js';

const corpsDe = (source: string) =>
  analyserSyntaxe(analyser(`page "test" :\n${source}`)).pages[0].corps;

describe('parser — variables', () => {
  it('déclare une variable nombre', () => {
    expect(corpsDe('    variable note = 12')[0]).toMatchObject({
      type: 'Variable',
      nom: 'note',
      valeur: { type: 'Nombre', valeur: 12 },
    });
  });

  it('déclare une variable texte', () => {
    expect(corpsDe('    variable nom = "Camille"')[0]).toMatchObject({
      type: 'Variable',
      nom: 'nom',
      valeur: { type: 'Chaine' },
    });
  });

  it('déclare une variable booléenne', () => {
    expect(corpsDe('    variable connecte = faux')[0]).toMatchObject({
      type: 'Variable',
      valeur: { type: 'Booleen', valeur: false },
    });
  });

  it('déclare une liste', () => {
    expect(corpsDe('    variable produits = ["Pomme", "Banane"]')[0]).toMatchObject({
      type: 'Variable',
      valeur: { type: 'Liste', elements: [{ type: 'Chaine' }, { type: 'Chaine' }] },
    });
  });

  it('déclare une liste vide', () => {
    expect(corpsDe('    variable panier = []')[0]).toMatchObject({
      valeur: { type: 'Liste', elements: [] },
    });
  });

  it('signale un signe = manquant', () => {
    expect(() => corpsDe('    variable note 12')).toThrow(/=/);
  });

  it('lit plusieurs pages', () => {
    const arbre = analyserSyntaxe(
      analyser('page "a" :\n    variable x = 1\npage "b" :\n    variable y = 2'),
    );
    expect(arbre.pages.map((p) => p.nom)).toEqual(['a', 'b']);
  });
});
