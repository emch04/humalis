import { describe, it, expect } from 'vitest';
import { estMotCle } from '../../src/lexer/motsCles.js';

describe('estMotCle', () => {
  it('reconnaît les mots-clés du langage', () => {
    expect(estMotCle('page')).toBe(true);
    expect(estMotCle('si')).toBe(true);
    expect(estMotCle('sinon')).toBe(true);
    expect(estMotCle('quand')).toBe(true);
    expect(estMotCle('pour')).toBe(true);
    expect(estMotCle('afficher')).toBe(true);
  });

  it('ne reconnaît pas un identifiant libre', () => {
    expect(estMotCle('note')).toBe(false);
    expect(estMotCle('nom')).toBe(false);
  });
});
