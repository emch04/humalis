import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Plan du langage de base (tâche 1) et B20 : « et », « ou », « est dans ».
const PAGE = programme(
  'page "boutique" :',
  '>variable stock = 3',
  '>variable prix = 15000',
  '>variable categorie = "robes"',
  '>variable panier = []',
  '>si stock est superieur a 0 et prix est inferieur a 20000 :',
  '>>texte "Bonne affaire"',
  '>si panier est vide ou stock est egal a 0 :',
  '>>texte "Rien à commander"',
  '>si categorie est dans ["robes", "pagnes"] :',
  '>>texte "Tissus"',
  '>si stock est egal a 0 ou prix est inferieur a 100 et categorie est egal a "robes" :',
  '>>texte "Cas rare"',
  '>si stock est inferieur ou egal a 5 et stock est superieur a 0 :',
  '>>texte "Bientôt épuisé"',
);

describe('conditions combinées — l’analyse', () => {
  it('accepte et, ou, est dans, et garde « inferieur ou egal » comme avant', () => {
    expect(erreurs(PAGE)).toEqual([]);
  });

  it('vérifie chaque morceau d’une condition combinée', () => {
    expect(erreurs(programme('page "a" :', '>variable n = 1', '>si n est egal a 1 et m est egal a 2 :', '>>texte "x"'))).toEqual([
      '3 : la variable « m » n\'est pas déclarée. Déclarez-la avec : variable m = … Peut-être « n » ?',
    ]);
  });

  it('« est dans » attend une liste', () => {
    expect(erreurs(programme('page "a" :', '>variable n = 1', '>si n est dans 3 :', '>>texte "x"'))).toEqual([
      '3 : « est dans » cherche dans une liste ; cette valeur est un nombre.',
    ]);
  });
});

describe('conditions combinées — ce que produit chaque cible', () => {
  it('web : && et || avec des parenthèses quand il le faut, includes pour « est dans »', () => {
    const page = genererProjetWeb(compiler(PAGE).application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' }).get('src/pages/Boutique.tsx')!;
    expect(page).toContain('{stock > 0 && prix < 20000 && (');
    expect(page).toContain('{(panier.length === 0 || stock === 0) && (');
    expect(page).toContain("{['robes', 'pagnes'].includes(categorie) && (");
    expect(page).toContain("{(stock === 0 || (prix < 100 && categorie === 'robes')) && (");
    expect(page).toContain('{stock <= 5 && stock > 0 && (');
  });

  it('site statique : le HTML de départ suit les conditions combinées', () => {
    const html = genererProjetStatique(compiler(PAGE).application!, { nom: 'a', source: 'a.humalis' }).get('index.html')!;
    expect(html).toContain('Bonne affaire');
    expect(html).toContain('Rien à commander');
    expect(html).toContain('Tissus');
    expect(html).not.toContain('Cas rare');
    expect(html).toContain('Bientôt épuisé');
  });
});
