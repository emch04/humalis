import { describe, it, expect } from 'vitest';
import { programme, avertissements, erreurs } from './aide.js';

describe('analyse — une variable qui porte le nom d’un mot du langage (décision Q14)', () => {
  it('avertit, sans jamais refuser', () => {
    const source = programme('page "a" :', '>variable titre = "Bonjour"', '>titre titre');
    expect(erreurs(source)).toEqual([]);
    expect(avertissements(source)).toEqual([
      "2 : la variable « titre » porte le nom d'un mot du langage ; c'est permis, mais cela peut prêter à confusion.",
    ]);
  });

  it('reconnaît le mot malgré les accents et les accords', () => {
    const source = programme('page "a" :', '>variable Égale = 1', '>texte "{Égale}"');
    expect(avertissements(source)).toEqual([
      "2 : la variable « Égale » porte le nom d'un mot du langage ; c'est permis, mais cela peut prêter à confusion.",
    ]);
  });

  it('avertit aussi pour un calcul et pour la variable d’une boucle', () => {
    const source = programme(
      'page "a" :',
      '>variable menu = ["Accueil"]',
      '>calcul image = 2',
      '>pour chaque lien dans menu :',
      '>>texte lien',
    );
    expect(avertissements(source)).toEqual([
      "3 : la variable « image » porte le nom d'un mot du langage ; c'est permis, mais cela peut prêter à confusion.",
      "4 : la variable « lien » porte le nom d'un mot du langage ; c'est permis, mais cela peut prêter à confusion.",
    ]);
  });

  it('cherche aussi dans les blocs (condition, événement)', () => {
    const source = programme(
      'page "a" :',
      '>variable stock = 1',
      '>si stock est vide :',
      '>>variable vide = 1',
      '>>texte "{vide}"',
    );
    expect(avertissements(source)).toEqual([
      "4 : la variable « vide » porte le nom d'un mot du langage ; c'est permis, mais cela peut prêter à confusion.",
    ]);
  });

  it('se tait pour les noms ordinaires, y compris « nom » et les noms de styles', () => {
    const source = programme(
      'page "a" :',
      '>variable produits = ["Livre"]',
      '>variable couleur = "bleu"',
      '>pour chaque nom dans produits :',
      '>>texte nom',
      '>texte couleur',
    );
    expect(avertissements(source)).toEqual([]);
  });
});
