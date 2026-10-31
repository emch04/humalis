import { describe, it, expect } from 'vitest';
import { lireProjet } from '../src/langage/projet.js';
import { entetes, genreBloc } from '../src/langage/blocs.js';
import { indexer, variableVisible, variablesVisibles } from '../src/langage/portees.js';

const BOUCLE = [
  'page "a" :', //                     1
  '    variable produits = ["x"]', //  2
  '    pour chaque nom dans produits :', // 3
  '        texte nom', //               4
  '    si produits est vide :', //      5
  '        texte "vide"', //            6
  '    texte produits', //              7
  '', //                                8
].join('\n');

describe('les blocs d’une ligne', () => {
  it('donne les en-têtes, du plus proche au plus lointain', () => {
    const lignes = BOUCLE.split('\n');
    expect(entetes(lignes, 4)).toEqual([3, 1]);
    expect(entetes(lignes, 7)).toEqual([1]);
    expect(entetes(lignes, 1)).toEqual([]);
  });

  it('lit le bloc d’une ligne en cours de frappe par sa seule indentation', () => {
    const lignes = [...BOUCLE.split('\n').slice(0, 6), '        '];
    expect(entetes(lignes, 7)).toEqual([5, 1]);
    expect(entetes(lignes, 7, 4)).toEqual([1]);
  });

  it('reconnaît le genre du bloc', () => {
    const lignes = [
      'serveur "s" :',
      '    donnee produit :',
      '        nom : texte',
      '    route "produits" :',
      '        tout le monde peut lire produit',
      'page "a" :',
      '    quand la page se charge :',
      '        si 1 est egal a 1 :',
      '            afficher "x"',
    ];
    expect(genreBloc(lignes, entetes(lignes, 3))).toBe('donnee');
    expect(genreBloc(lignes, entetes(lignes, 5))).toBe('route');
    expect(genreBloc(lignes, entetes(lignes, 2))).toBe('serveur');
    expect(genreBloc(lignes, entetes(lignes, 7))).toBe('vue');
    expect(genreBloc(lignes, entetes(lignes, 9))).toBe('evenement');
    expect(genreBloc(lignes, entetes(lignes, 6))).toBe('fichier');
  });
});

describe('les portées', () => {
  it('voit la variable d’une boucle dans la boucle, pas après', () => {
    const index = indexer(lireProjet(BOUCLE));
    expect(variableVisible(index, 'nom', 4)).toMatchObject({ genre: 'boucle', ligne: 3, colonne: 17, fin: 20 });
    expect(variableVisible(index, 'nom', 7)).toBeUndefined();
  });

  it('voit une variable de page dans ses blocs', () => {
    const index = indexer(lireProjet(BOUCLE));
    expect(variableVisible(index, 'produits', 6)).toMatchObject({ genre: 'variable', ligne: 2, colonne: 14 });
    expect(variablesVisibles(index, 4).map((s) => s.nom).sort()).toEqual(['nom', 'produits']);
  });

  it('lit les variables des deux côtés d’une condition en « et » ou en « ou »', () => {
    const source = 'page "a" :\n    variable prix = 1\n    variable stock = 2\n    variable nom = ""\n    si prix est superieur a stock et nom est vide ou stock est egal a 2 :\n        texte "oui"\n';
    const index = indexer(lireProjet(source));
    expect([...(index.references.get(5) ?? [])].sort()).toEqual(['nom', 'prix', 'stock']);
  });

  it('distingue deux pages qui ont chacune leur variable x', () => {
    const source = 'page "a" :\n    variable x = 1\n    texte x\npage "b" :\n    variable x = 2\n    texte x\n';
    const index = indexer(lireProjet(source));
    expect(variableVisible(index, 'x', 3)?.ligne).toBe(2);
    expect(variableVisible(index, 'x', 6)?.ligne).toBe(5);
  });

  it('trouve la variable partagée d’un fichier utilisé', () => {
    const fichiers: Record<string, string> = {
      '/projet/commun.humalis': 'variable panier = [] avec partagee\n',
    };
    const source = 'utiliser fichier "./commun.humalis"\n\npage "a" :\n    texte panier\n';
    const index = indexer(lireProjet(source, '/projet/app.humalis', (c) => fichiers[c]));
    expect(variableVisible(index, 'panier', 4)).toMatchObject({
      genre: 'partagee',
      fichier: '/projet/commun.humalis',
      ligne: 1,
      colonne: 10,
    });
  });

  it('voit les paramètres d’une page et d’un composant', () => {
    const source = 'composant "Fiche" :\n    parametre prix\n    texte prix\n\npage "produit" avec parametre id :\n    texte id\n';
    const index = indexer(lireProjet(source));
    expect(variableVisible(index, 'prix', 3)).toMatchObject({ genre: 'parametreComposant', ligne: 2 });
    expect(variableVisible(index, 'id', 6)).toMatchObject({ genre: 'parametrePage', ligne: 5, colonne: 31 });
    expect(variableVisible(index, 'prix', 6)).toBeUndefined();
  });

  it('suit un fichier utilisé une seule fois, même en boucle', () => {
    const fichiers: Record<string, string> = {
      '/p/a.humalis': 'utiliser fichier "./b.humalis"\npage "a" :\n    texte "a"\n',
      '/p/b.humalis': 'utiliser fichier "./a.humalis"\npage "b" :\n    texte "b"\n',
    };
    const projet = lireProjet(fichiers['/p/a.humalis'], '/p/a.humalis', (c) => fichiers[c]);
    expect(projet.fichiers.map((f) => f.chemin)).toEqual(['/p/a.humalis', '/p/b.humalis']);
  });
});
