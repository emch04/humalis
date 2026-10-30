import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';

const lisible = (source: string) =>
  analyser(source)
    .filter((t) => !['FIN_LIGNE', 'FIN_FICHIER', 'INDENT', 'DEDENT', 'LIAISON'].includes(t.type))
    .map((t) => `${t.type}(${t.valeur})`);

describe('analyser — traits d’union collés (décision Q12)', () => {
  it('colle un mot du vocabulaire écrit avec un trait d’union', () => {
    expect(lisible('sous-titre')).toEqual(['MOT_CLE(soustitre)']);
    expect(lisible('Sous-Titre')).toEqual(['MOT_CLE(soustitre)']);
  });

  it('garde la colonne et l’orthographe d’origine du mot collé', () => {
    const [mot] = analyser('  sous-titre'.trimStart());
    expect(mot).toMatchObject({ colonne: 1, original: 'sous-titre' });
  });

  it('laisse le moins entre deux noms qui ne forment pas un mot du langage', () => {
    expect(lisible('prix-remise')).toEqual([
      'IDENTIFIANT(prix)',
      'PONCTUATION(-)',
      'IDENTIFIANT(remise)',
    ]);
  });

  it('ne touche pas au moins écrit avec des espaces, ni devant un nombre', () => {
    expect(lisible('total - 1')).toEqual(['IDENTIFIANT(total)', 'PONCTUATION(-)', 'NOMBRE(1)']);
    expect(lisible('total-1')).toEqual(['IDENTIFIANT(total)', 'PONCTUATION(-)', 'NOMBRE(1)']);
  });
});
