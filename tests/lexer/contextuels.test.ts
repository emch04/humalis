import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { estMotReserve } from '../../src/lexer/motsCles.js';

describe('analyser — mots réservés et contextuels', () => {
  it('marque les mots réservés partout', () => {
    const [si] = analyser('si');
    expect(si).toMatchObject({ type: 'MOT_CLE', valeur: 'si', reserve: true });
  });

  it('marque les mots contextuels comme non réservés', () => {
    const [titre] = analyser('titre');
    expect(titre).toMatchObject({ type: 'MOT_CLE', valeur: 'titre', reserve: false });
  });

  it("garde l'orthographe d'origine d'un mot-clé", () => {
    const [mot] = analyser('Égale');
    expect(mot).toMatchObject({ valeur: 'egal', original: 'Égale' });
  });

  it('réserve partout une liste courte de mots (les 19 de la décision Q2)', () => {
    for (const mot of ['page', 'composant', 'serveur', 'variable', 'si', 'sinon', 'quand', 'pour',
      'et', 'ou', 'non', 'est', 'vrai', 'faux', 'rien', 'avec', 'vers', 'dans', 'par']) {
      expect(estMotReserve(mot), mot).toBe(true);
    }
    for (const mot of ['chaque', 'titre', 'texte', 'bouton', 'afficher', 'vide', 'egal', 'utilisateur']) {
      expect(estMotReserve(mot), mot).toBe(false);
    }
  });

  it('marque « par » comme mot réservé, et « chaque » comme contextuel', () => {
    const [, , par] = analyser('changer x par 1');
    expect(par).toMatchObject({ type: 'MOT_CLE', valeur: 'par', reserve: true });
    const [, chaque] = analyser('pour chaque nom');
    expect(chaque).toMatchObject({ type: 'MOT_CLE', valeur: 'chaque', reserve: false });
  });
});
