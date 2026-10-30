import { describe, it, expect } from 'vitest';
import { symbolesDuDocument, type SymboleDocument } from '../src/langage/symboles.js';
import { jetonsSemantiques, encoderJetons, TYPES_JETONS, MODIFICATEURS_JETONS } from '../src/langage/semantique.js';
import { col, exemple, indexDe } from './aide-langage.js';

const CATALOGUE = exemple('catalogue.humalis');
const VITRINE = exemple('vitrine.humalis');
const BOUTIQUE = exemple('boutique.humalis');

const plan = (symboles: SymboleDocument[]): unknown[] =>
  symboles.map((s) => (s.enfants.length > 0 ? [`${s.genre} ${s.nom}`, plan(s.enfants)] : `${s.genre} ${s.nom}`));

describe('symbolesDuDocument', () => {
  it('donne le serveur (données, champs, routes) et les pages, avec leurs variables', () => {
    expect(plan(symbolesDuDocument(indexDe(CATALOGUE)))).toEqual([
      ['serveur boutique', [['donnee produit', ['champ nom', 'champ prix']], 'route produits']],
      ['page catalogue', ['variable produits']],
      ['page produit', ['parametre id', 'variable produit']],
    ]);
  });

  it('donne les composants, Humalis et React, et les variables partagées', () => {
    expect(plan(symbolesDuDocument(indexDe(VITRINE)))).toEqual([
      'composantReact Carte',
      ['composant Fiche', ['parametre nom', 'parametre prix']],
      ['page accueil', ['variable prix_minimum']],
    ]);
    expect(plan(symbolesDuDocument(indexDe(BOUTIQUE)))[0]).toEqual('variable panier');
  });

  it('couvre tout le bloc, et sélectionne le nom', () => {
    const [, catalogue] = symbolesDuDocument(indexDe(CATALOGUE));
    expect(catalogue).toMatchObject({
      debut: 11,
      fin: 17,
      finColonne: CATALOGUE.split('\n')[16].length + 1,
      selection: { ligne: 11, colonne: 6, fin: 17 },
    });
  });
});

describe('jetonsSemantiques', () => {
  const jetons = jetonsSemantiques(indexDe(BOUTIQUE));
  const a = (ligne: number, colonne: number) => jetons.find((j) => j.ligne === ligne && j.colonne === colonne);

  it('marque la variable d’une boucle nommée comme un mot du vocabulaire (« nom »)', () => {
    expect(a(9, col(BOUTIQUE, 9, 'nom'))).toEqual({ ligne: 9, colonne: col(BOUTIQUE, 9, 'nom'), longueur: 3, type: 'variable', modificateurs: ['declaration'] });
    expect(a(10, col(BOUTIQUE, 10, 'nom'))).toMatchObject({ type: 'variable', modificateurs: [] });
  });

  it('marque un calcul en lecture seule, y compris dans un texte', () => {
    expect(a(6, col(BOUTIQUE, 6, 'nombre_articles'))).toMatchObject({ type: 'variable', modificateurs: ['declaration', 'readonly'] });
    expect(a(8, col(BOUTIQUE, 8, 'nombre_articles'))).toMatchObject({ type: 'variable', modificateurs: ['readonly'], longueur: 15 });
  });

  it('ne marque pas les mots du vocabulaire', () => {
    expect(a(11, col(BOUTIQUE, 11, 'bouton'))).toBeUndefined();
    expect(a(7, col(BOUTIQUE, 7, 'couleur'))).toBeUndefined();
  });

  it('marque paramètres, composants placés, données et champs', () => {
    const v = jetonsSemantiques(indexDe(VITRINE));
    expect(v.find((j) => j.ligne === 4)).toMatchObject({ type: 'parameter', modificateurs: ['declaration'] });
    expect(v.find((j) => j.ligne === 14 && j.colonne === 5)).toMatchObject({ type: 'class', longueur: 5 });
    const c = jetonsSemantiques(indexDe(CATALOGUE));
    expect(c.find((j) => j.ligne === 4)).toMatchObject({ type: 'type', modificateurs: ['declaration'] });
    expect(c.find((j) => j.ligne === 5)).toMatchObject({ type: 'property', modificateurs: ['declaration'] });
    expect(c.find((j) => j.ligne === 8)).toMatchObject({ type: 'type', modificateurs: [] });
    expect(c.find((j) => j.ligne === 17 && j.colonne === col(CATALOGUE, 17, 'nom'))).toMatchObject({ type: 'property' });
  });

  it('encode les jetons comme le demande le protocole (écarts, à partir de 0)', () => {
    const encodes = encoderJetons([
      { ligne: 2, colonne: 5, longueur: 3, type: 'variable', modificateurs: ['declaration'] },
      { ligne: 2, colonne: 12, longueur: 2, type: 'parameter', modificateurs: [] },
      { ligne: 4, colonne: 9, longueur: 4, type: 'variable', modificateurs: ['declaration', 'readonly'] },
    ]);
    const v = TYPES_JETONS.indexOf('variable');
    const p = TYPES_JETONS.indexOf('parameter');
    const d = 1 << MODIFICATEURS_JETONS.indexOf('declaration');
    const r = 1 << MODIFICATEURS_JETONS.indexOf('readonly');
    expect(encodes).toEqual([1, 4, 3, v, d, 0, 7, 2, p, 0, 2, 8, 4, v, d | r]);
  });
});
