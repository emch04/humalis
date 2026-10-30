import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../src/parser/parser.js';

const corpsDe = (source: string) =>
  analyserSyntaxe(analyser(`page "test" :\n${source}`)).pages[0].corps;

describe('parser — événements', () => {
  it('reconnaît un clic', () => {
    const source = [
      '    quand l\'utilisateur clique sur "bouton" :',
      '        afficher "Clic"',
    ].join('\n');
    expect(corpsDe(source)[0]).toMatchObject({
      type: 'Evenement',
      genre: 'clic',
      cible: 'bouton',
      corps: [{ action: 'afficher' }],
    });
  });

  it('reconnaît un survol', () => {
    const source = [
      '    quand l\'utilisateur survole "image" :',
      '        afficher "Apercu"',
    ].join('\n');
    expect(corpsDe(source)[0]).toMatchObject({ genre: 'survol', cible: 'image' });
  });

  it('reconnaît le chargement de page', () => {
    const source = ['    quand la page se charge :', '        afficher "Pret"'].join('\n');
    expect(corpsDe(source)[0]).toMatchObject({ genre: 'chargement', cible: undefined });
  });

  it('reconnaît la soumission de formulaire', () => {
    const source = [
      '    quand le formulaire "connexion" est soumis :',
      '        afficher "Envoye"',
    ].join('\n');
    expect(corpsDe(source)[0]).toMatchObject({ genre: 'soumission', cible: 'connexion' });
  });

  it('accepte une condition dans le corps', () => {
    const source = [
      '    quand l\'utilisateur clique sur "valider" :',
      '        si champ "email" est vide :',
      '            afficher erreur "Email requis"',
      '        sinon :',
      '            afficher "Merci"',
    ].join('\n');
    expect(corpsDe(source)[0]).toMatchObject({
      genre: 'clic',
      corps: [{ type: 'Condition' }],
    });
  });
});
