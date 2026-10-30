import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../src/parser/parser.js';

const corpsDe = (source: string) =>
  analyserSyntaxe(analyser(`page "test" :\n${source}`)).pages[0].corps;

describe('parser — conditions', () => {
  it('reconnaît si / sinon', () => {
    const source = [
      '    si note est inferieure a 10 :',
      '        afficher "Echec"',
      '    sinon :',
      '        afficher "Reussite"',
    ].join('\n');

    expect(corpsDe(source)[0]).toMatchObject({
      type: 'Condition',
      test: {
        gauche: { type: 'Reference', nom: 'note' },
        operateur: 'inferieur',
        droite: { type: 'Nombre', valeur: 10 },
      },
      alors: [{ action: 'afficher' }],
      sinon: [{ action: 'afficher' }],
    });
  });

  it('reconnaît une condition sans sinon', () => {
    const source = ['    si stock est egal a 0 :', '        afficher "Rupture"'].join('\n');
    expect(corpsDe(source)[0]).toMatchObject({ test: { operateur: 'egal' }, sinon: [] });
  });

  it('reconnaît est vrai', () => {
    const source = ['    si connecte est vrai :', '        afficher "Salut"'].join('\n');
    expect(corpsDe(source)[0]).toMatchObject({ test: { operateur: 'vrai' } });
  });

  it('reconnaît superieur ou egal', () => {
    const source = ['    si age est superieur ou egal a 18 :', '        afficher "OK"'].join(
      '\n',
    );
    expect(corpsDe(source)[0]).toMatchObject({ test: { operateur: 'superieurOuEgal' } });
  });

  it('reconnaît un champ vide', () => {
    const source = ['    si champ "email" est vide :', '        afficher "Requis"'].join('\n');
    expect(corpsDe(source)[0]).toMatchObject({
      test: { gauche: { type: 'Champ', nom: 'email' }, operateur: 'vide' },
    });
  });

  it('accepte les accents dans la comparaison', () => {
    const source = ['    si age est supérieur à 18 :', '        afficher "OK"'].join('\n');
    expect(corpsDe(source)[0]).toMatchObject({ test: { operateur: 'superieur' } });
  });
});
