import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';

const mots = (source: string) =>
  analyser(source)
    .filter((t) => !['FIN_LIGNE', 'FIN_FICHIER', 'INDENT', 'DEDENT', 'LIAISON'].includes(t.type))
    .map((t) => `${t.type}(${t.valeur})`);

describe('analyser — accents et variantes', () => {
  it('accepte un mot-clé écrit sans accent', () => {
    expect(mots('est egal')).toEqual(['MOT_CLE(est)', 'MOT_CLE(egal)']);
  });

  it('accepte le même mot-clé écrit avec accent', () => {
    expect(mots('est égal')).toEqual(['MOT_CLE(est)', 'MOT_CLE(egal)']);
  });

  it('accepte les accords féminins et pluriels', () => {
    expect(mots('inférieure supérieurs égale')).toEqual([
      'MOT_CLE(inferieur)',
      'MOT_CLE(superieur)',
      'MOT_CLE(egal)',
    ]);
  });

  it('ignore la préposition à', () => {
    expect(mots('est inferieure a 10')).toEqual([
      'MOT_CLE(est)',
      'MOT_CLE(inferieur)',
      'NOMBRE(10)',
    ]);
  });

  it('ne normalise pas les identifiants', () => {
    expect(mots('prénom')).toEqual(['IDENTIFIANT(prénom)']);
  });

  it('ne touche pas aux accents dans les chaînes', () => {
    const tokens = analyser('afficher "Connexion réussie"');
    expect(tokens[1].valeur).toBe('Connexion réussie');
  });
});

describe('analyser — majuscules accentuées', () => {
  it('lit un identifiant qui commence par une majuscule accentuée', () => {
    expect(mots('Élève Ça')).toEqual(['IDENTIFIANT(Élève)', 'IDENTIFIANT(Ça)']);
  });
});
