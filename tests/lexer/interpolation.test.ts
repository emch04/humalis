import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';

describe('analyser — interpolation', () => {
  it('découpe une chaîne interpolée en parties', () => {
    const tokens = analyser('"Échec pour {nom}"');
    expect(tokens[0].parties).toEqual([
      { type: 'texte', valeur: 'Échec pour ' },
      { type: 'variable', valeur: 'nom' },
    ]);
  });

  it('laisse une chaîne simple en une seule partie texte', () => {
    const tokens = analyser('"Bonjour"');
    expect(tokens[0].parties).toEqual([{ type: 'texte', valeur: 'Bonjour' }]);
  });

  it('gère une variable au milieu du texte', () => {
    const tokens = analyser('"Bonjour {nom}, bienvenue"');
    expect(tokens[0].parties).toEqual([
      { type: 'texte', valeur: 'Bonjour ' },
      { type: 'variable', valeur: 'nom' },
      { type: 'texte', valeur: ', bienvenue' },
    ]);
  });

  it('signale une accolade non fermée', () => {
    expect(() => analyser('"Bonjour {nom"')).toThrow(/accolade/i);
  });
});
