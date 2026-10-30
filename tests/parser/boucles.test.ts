import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../src/parser/parser.js';

const corpsDe = (source: string) =>
  analyserSyntaxe(analyser(`page "test" :\n${source}`)).pages[0].corps;

describe('parser — boucles', () => {
  it('reconnaît une boucle sur une liste', () => {
    const source = ['    pour chaque nom dans produits :', '        afficher nom'].join('\n');
    expect(corpsDe(source)[0]).toMatchObject({
      type: 'Boucle',
      variable: 'nom',
      liste: { type: 'Reference', nom: 'produits' },
      corps: [{ action: 'afficher' }],
    });
  });

  it('accepte un élément stylé dans le corps', () => {
    const source = [
      '    pour chaque nom dans eleves :',
      '        texte nom avec couleur bleu',
    ].join('\n');
    expect(corpsDe(source)[0]).toMatchObject({
      corps: [{ type: 'Element', element: 'texte' }],
    });
  });

  it('signale « dans » manquant', () => {
    const source = ['    pour chaque nom produits :', '        afficher nom'].join('\n');
    expect(() => corpsDe(source)).toThrow(/dans/);
  });
});
