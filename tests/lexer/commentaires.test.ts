import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';

const lisible = (source: string) =>
  analyser(source)
    .filter((t) => !['FIN_FICHIER'].includes(t.type))
    .map((t) => (t.valeur ? `${t.type}(${t.valeur})` : t.type));

describe('analyser — commentaires', () => {
  it('ignore un commentaire en fin de ligne', () => {
    expect(lisible('titre "Bonjour" # le grand titre')).toEqual([
      'MOT_CLE(titre)',
      'CHAINE(Bonjour)',
      'FIN_LIGNE',
    ]);
  });

  it('ignore une ligne qui ne contient qu’un commentaire, quelle que soit son indentation', () => {
    expect(lisible('page "a" :\n   # trois espaces, sans erreur\n    titre "x"')).toEqual([
      'MOT_CLE(page)',
      'CHAINE(a)',
      'PONCTUATION(:)',
      'FIN_LIGNE',
      'INDENT',
      'MOT_CLE(titre)',
      'CHAINE(x)',
      'FIN_LIGNE',
      'DEDENT',
    ]);
  });

  it('garde un # à l’intérieur d’une chaîne', () => {
    const [chaine] = analyser('"Article #3"');
    expect(chaine).toMatchObject({ type: 'CHAINE', valeur: 'Article #3' });
  });
});
