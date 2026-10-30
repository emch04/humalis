import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';

const types = (source: string) =>
  analyser(source)
    .map((t) => t.type)
    .filter((t) => t === 'INDENT' || t === 'DEDENT');

describe('analyser — indentation', () => {
  it('émet un INDENT en entrant dans un bloc', () => {
    const source = 'page "accueil" :\n    titre "Bonjour"';
    expect(types(source)).toEqual(['INDENT', 'DEDENT']);
  });

  it('émet plusieurs DEDENT en sortant de blocs imbriqués', () => {
    const source = 'page "a" :\n    si x est vrai :\n        afficher "oui"';
    expect(types(source)).toEqual(['INDENT', 'INDENT', 'DEDENT', 'DEDENT']);
  });

  it('refuse les tabulations', () => {
    expect(() => analyser('page "a" :\n\ttitre "x"')).toThrow(/tabulation/i);
  });

  it('refuse une indentation incohérente', () => {
    expect(() => analyser('page "a" :\n  titre "x"')).toThrow(/indentation/i);
  });

  it('ignore les lignes vides sans casser les niveaux', () => {
    const source = 'page "a" :\n    titre "x"\n\n    texte "y"';
    expect(types(source)).toEqual(['INDENT', 'DEDENT']);
  });
});
