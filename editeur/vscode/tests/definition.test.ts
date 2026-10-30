import { describe, it, expect } from 'vitest';
import { definir } from '../src/langage/definition.js';
import { col, exemple, indexDe } from './aide-langage.js';

const BOUTIQUE = exemple('boutique.humalis');
const CATALOGUE = exemple('catalogue.humalis');
const GESTION = exemple('gestion.humalis');
const VITRINE = exemple('vitrine.humalis');

describe('definir : les variables', () => {
  const index = indexDe(BOUTIQUE);

  it('mène de la liste partagée à sa déclaration en haut du fichier', () => {
    expect(definir(index, 13, col(BOUTIQUE, 13, 'panier', 2))).toMatchObject({ ligne: 1, colonne: 10, fin: 16 });
  });

  it('mène de la variable d’une boucle à son « pour chaque »', () => {
    expect(definir(index, 13, col(BOUTIQUE, 13, 'nom'))).toMatchObject({ ligne: 9, colonne: col(BOUTIQUE, 9, 'nom') });
  });

  it('mène d’un nom écrit dans un texte ({nombre_articles}) à son calcul', () => {
    expect(definir(index, 8, col(BOUTIQUE, 8, 'nombre_articles', 3))).toMatchObject({
      ligne: 6,
      colonne: col(BOUTIQUE, 6, 'nombre_articles'),
    });
  });

  it('mène d’une variable de la page « panier » à la bonne boucle', () => {
    expect(definir(index, 31, col(BOUTIQUE, 31, 'nom'))).toMatchObject({ ligne: 27 });
  });

  it('mène d’un paramètre de page à la ligne de la page', () => {
    const i = indexDe(CATALOGUE);
    expect(definir(i, 22, col(CATALOGUE, 22, ' id ', 1))).toMatchObject({ ligne: 19, colonne: col(CATALOGUE, 19, 'id') });
  });

  it('mène d’un paramètre de composant à son « parametre »', () => {
    const i = indexDe(VITRINE);
    expect(definir(i, 6, col(VITRINE, 6, 'nom'))).toMatchObject({ ligne: 4 });
    expect(definir(i, 7, col(VITRINE, 7, 'prix'))).toMatchObject({ ligne: 5 });
  });

  it('ne confond pas l’option « nom » avec la variable « nom »', () => {
    const source = 'page "a" :\n    pour chaque nom dans ["x"] :\n        bouton "b" avec nom "c"\n';
    expect(definir(indexDe(source), 3, col(source, 3, 'nom'))).toBeUndefined();
  });
});

describe('definir : pages, composants, serveur', () => {
  it('mène de « vers "panier" » à la page', () => {
    const index = indexDe(BOUTIQUE);
    expect(definir(index, 20, col(BOUTIQUE, 20, '"panier"', 2))).toMatchObject({ ligne: 22, colonne: 6, fin: 14 });
    expect(definir(index, 32, col(BOUTIQUE, 32, '"boutique"', 1))).toMatchObject({ ligne: 3 });
  });

  it('mène d’un composant placé à sa définition, écrite en Humalis ou en React', () => {
    const index = indexDe(VITRINE);
    expect(definir(index, 14, col(VITRINE, 14, 'Fiche', 1))).toMatchObject({ ligne: 3, colonne: col(VITRINE, 3, '"Fiche"') });
    expect(definir(index, 13, col(VITRINE, 13, 'Carte'))).toMatchObject({ ligne: 1, colonne: col(VITRINE, 1, '"Carte"') });
  });

  it('mène de la route d’une requête à « route "produits" »', () => {
    const index = indexDe(CATALOGUE);
    expect(definir(index, 15, col(CATALOGUE, 15, '"produits"', 3))).toMatchObject({ ligne: 7 });
    expect(definir(index, 15, col(CATALOGUE, 15, 'dans produits', 6))).toMatchObject({ ligne: 12 });
  });

  it('mène de la route de « modifier » et de « supprimer » à la route', () => {
    const index = indexDe(GESTION);
    expect(definir(index, 21, col(GESTION, 21, '"produits"', 2))).toMatchObject({ ligne: 7 });
    expect(definir(index, 25, col(GESTION, 25, '"produits"', 2))).toMatchObject({ ligne: 7 });
  });

  it('mène d’une donnée dans une règle à « donnee produit »', () => {
    const index = indexDe(CATALOGUE);
    expect(definir(index, 8, col(CATALOGUE, 8, 'produit'))).toMatchObject({ ligne: 4, colonne: col(CATALOGUE, 4, 'produit') });
  });

  it('mène d’un champ (p.nom) au champ de la donnée', () => {
    const index = indexDe(CATALOGUE);
    expect(definir(index, 17, col(CATALOGUE, 17, 'p.nom', 3))).toMatchObject({ ligne: 5, colonne: 9, fin: 12 });
    expect(definir(index, 17, col(CATALOGUE, 17, 'p.nom'))).toMatchObject({ ligne: 16 });
    expect(definir(index, 26, col(CATALOGUE, 26, '.nom', 2))).toMatchObject({ ligne: 5 });
  });
});

describe('definir : les éléments visés', () => {
  it('mène de « clique sur "Ajouter" » au bouton', () => {
    const index = indexDe(BOUTIQUE);
    expect(definir(index, 12, col(BOUTIQUE, 12, '"Ajouter"', 2))).toMatchObject({
      ligne: 11,
      colonne: col(BOUTIQUE, 11, '"Ajouter"'),
      fin: col(BOUTIQUE, 11, '"Ajouter"', 9),
    });
  });

  it('mène de « champ "email" » dans une valeur au champ de la page', () => {
    const index = indexDe(GESTION);
    expect(definir(index, 35, col(GESTION, 35, '"email"', 2))).toMatchObject({ ligne: 31 });
    expect(definir(index, 35, col(GESTION, 35, '"mot de passe"', 2))).toMatchObject({ ligne: 32 });
  });
});

describe('definir : à travers « utiliser fichier »', () => {
  const fichiers = {
    '/projet/pages/panier.humalis': 'page "panier" :\n    pour chaque nom dans panier :\n        texte nom\n',
    '/projet/commun.humalis': 'variable panier = [] avec partagee\n',
  };
  const source =
    'utiliser fichier "./commun.humalis"\nutiliser fichier "./pages/panier.humalis"\n\npage "boutique" :\n    lien "Panier" vers "panier"\n    texte panier\n';
  const index = indexDe(source, '/projet/app.humalis', fichiers);

  it('ouvre le fichier utilisé', () => {
    expect(definir(index, 2, col(source, 2, 'pages'))).toEqual({
      fichier: '/projet/pages/panier.humalis',
      ligne: 1,
      colonne: 1,
      fin: 1,
    });
  });

  it('mène à une page et à une variable partagée d’un autre fichier', () => {
    expect(definir(index, 5, col(source, 5, '"panier"', 2))).toMatchObject({ fichier: '/projet/pages/panier.humalis', ligne: 1 });
    expect(definir(index, 6, col(source, 6, 'panier'))).toMatchObject({ fichier: '/projet/commun.humalis', ligne: 1 });
  });

  it('marche encore pendant la frappe d’une ligne fautive', () => {
    const enCours = source + '    bouton avec avec\n';
    const i = indexDe(enCours, '/projet/app.humalis', fichiers);
    expect(definir(i, 6, col(enCours, 6, 'panier'))).toMatchObject({ fichier: '/projet/commun.humalis' });
  });

  it('ne donne rien sur un mot du vocabulaire ou une ligne vide', () => {
    expect(definir(index, 5, 6)).toBeUndefined();
    expect(definir(index, 3, 1)).toBeUndefined();
  });
});

describe('definir : dans un bloc de mise en page (section, ligne…)', () => {
  const SOURCE = 'page "a" :\n    section "Compteur" :\n        variable n = 0\n        ligne :\n            texte "{n}"\n';
  it('mène d’une variable lue dans une ligne à sa déclaration dans la section', () => {
    expect(definir(indexDe(SOURCE), 5, col(SOURCE, 5, 'n'))).toMatchObject({ ligne: 3, colonne: col(SOURCE, 3, 'n') });
  });
});
