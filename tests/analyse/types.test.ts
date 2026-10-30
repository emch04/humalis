import { describe, it, expect } from 'vitest';
import { programme, erreurs } from './aide.js';

describe('analyse — types simples', () => {
  it('refuse « pour chaque » sur autre chose qu’une liste (A9)', () => {
    expect(
      erreurs(programme('page "a" :', '>variable stock = 3', '>pour chaque n dans stock :', '>>texte n')),
    ).toEqual(['3 : « stock » est un nombre ; pour chaque … dans attend une liste.']);
  });

  it('refuse une comparaison numérique sur un texte (A10)', () => {
    expect(
      erreurs(programme('page "a" :', '>variable nom = "Awa"', '>si nom est inferieur a 10 :', '>>texte "x"')),
    ).toEqual(['3 : « nom » est un texte ; « est inférieur à » compare des nombres.']);
  });

  it('refuse l’égalité entre un texte et un nombre (A10)', () => {
    expect(
      erreurs(programme('page "a" :', '>variable nom = "Awa"', '>si nom est egal a 3 :', '>>texte "x"')),
    ).toEqual(['3 : on ne peut pas comparer un texte et un nombre.']);
  });

  it('refuse « est vide » sur un nombre (A10)', () => {
    expect(
      erreurs(programme('page "a" :', '>variable n = 3', '>si n est vide :', '>>texte "x"')),
    ).toEqual(["3 : « n » est un nombre ; « est vide » s'applique à un texte ou à une liste."]);
  });

  it('refuse « est vrai » sur un non-booléen (A11)', () => {
    expect(
      erreurs(programme('page "a" :', '>variable note = 12', '>si note est vrai :', '>>texte "x"')),
    ).toEqual(['3 : « note » est un nombre ; « est vrai » attend vrai ou faux.']);
  });

  it('refuse de changer un nombre en texte (A10)', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>variable clics = 0',
          '>bouton "Go"',
          '>quand utilisateur clique sur "Go" :',
          '>>changer clics par "beaucoup"',
        ),
      ),
    ).toEqual(['5 : « clics » est un nombre ; on ne peut pas lui donner un texte.']);
  });

  it('donne son type à la variable de boucle', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>variable notes = [8, 14]',
          '>pour chaque note dans notes :',
          '>>si note est inferieure a 10 :',
          '>>>texte "Échec"',
        ),
      ),
    ).toEqual([]);
  });

  it('ne refuse rien sur une liste vide, dont le type est inconnu', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>variable panier = []',
          '>pour chaque n dans panier :',
          '>>si n est inferieur a 3 :',
          '>>>texte "x"',
        ),
      ),
    ).toEqual([]);
  });

  it('accepte « est vide » sur un champ', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>champ "email"',
          '>bouton "Go"',
          '>quand utilisateur clique sur "Go" :',
          '>>si champ "email" est vide :',
          '>>>afficher erreur "Email requis"',
        ),
      ),
    ).toEqual([]);
  });
});
