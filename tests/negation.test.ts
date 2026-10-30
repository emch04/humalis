import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// La négation : « n'est pas » (le « n' » est un mot de liaison, sauté par le parser).
const PAGE = programme(
  'page "boutique" :',
  '>titre "Boutique"',
  '>variable panier = ["Pagne"]',
  '>variable stock = 3',
  '>variable choix = rien',
  '>variable categorie = "robes"',
  '>si panier n\'est pas vide :',
  '>>texte "Panier rempli"',
  '>si stock n\'est pas egal a 0 :',
  '>>texte "En stock"',
  '>si choix n\'est pas rien :',
  '>>texte "Choix fait"',
  '>si categorie n\'est pas dans ["pagnes", "wax"] :',
  '>>texte "Hors tissus"',
  '>si stock n\'est pas superieur a 5 :',
  '>>texte "Peu de stock"',
);

describe('la négation', () => {
  it('« n\'est pas » devant vide, egal a, rien, dans, superieur a', () => {
    expect(erreurs(PAGE)).toEqual([]);
  });

  it('« utilisateur n\'est pas connecte » se lit aussi', () => {
    expect(erreurs(programme('source "api" :', '>adresse "https://api.exemple.cd"', '>session astratra', '', 'page "a" :', '>titre "A"', '>si utilisateur n\'est pas connecte :', '>>texte "Bonjour, visiteur"'))).toEqual([]);
  });

  it('web : l\'opérateur contraire quand il existe, sinon « ! »', () => {
    const page = genererProjetWeb(compiler(PAGE).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/pages/Boutique.tsx')!;
    expect(page).toContain('{!(panier.length === 0) && (');
    expect(page).toContain('{stock !== 0 && (');
    expect(page).toContain('{!(choix === null) && (');
    expect(page).toContain("{!(['pagnes', 'wax'].includes(categorie)) && (");
    expect(page).toContain('{stock <= 5 && (');
  });

  it('site statique : le HTML de départ suit la négation', () => {
    const html = genererProjetStatique(compiler(PAGE).application!, { nom: 'b', source: 'b.humalis' }).get('index.html')!;
    for (const texte of ['Panier rempli', 'En stock', 'Hors tissus', 'Peu de stock']) expect(html).toContain(texte);
    expect(html).not.toContain('Choix fait');
  });
});
