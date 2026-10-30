import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';

describe('analyser — tokens simples', () => {
  it('reconnaît une chaîne littérale', () => {
    const tokens = analyser('"Bienvenue"');
    expect(tokens[0]).toMatchObject({ type: 'CHAINE', valeur: 'Bienvenue' });
  });

  it('reconnaît un nombre', () => {
    const tokens = analyser('12');
    expect(tokens[0]).toMatchObject({ type: 'NOMBRE', valeur: '12' });
  });

  it('distingue mot-clé et identifiant', () => {
    const tokens = analyser('page note');
    expect(tokens[0]).toMatchObject({ type: 'MOT_CLE', valeur: 'page' });
    expect(tokens[1]).toMatchObject({ type: 'IDENTIFIANT', valeur: 'note' });
  });

  it('signale une chaîne non fermée', () => {
    expect(() => analyser('"oubli')).toThrow(/cha[îi]ne/i);
  });
});
