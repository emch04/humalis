import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Décision L4 d'Emch : « produits dont prix est inferieur a 20000 » ; tâche 2 : trier, premier de, les n premiers, contient.
const CATALOGUE = programme(
  'page "catalogue" :',
  '>variable produits = [fiche avec nom "Pagne" et prix 25000, fiche avec nom "Livre" et prix 12500, fiche avec nom "Stylo" et prix 1500]',
  '>variable notes = [12, 15, 9]',
  '>calcul pas_chers = produits dont prix est inferieur a 20000',
  '>calcul par_prix = trier produits par prix',
  '>calcul du_plus_cher = trier produits par prix decroissant',
  '>calcul par_nom = trier produits par nom',
  '>calcul notes_triees = trier notes',
  '>calcul livre = premier de produits dont nom contient "Liv"',
  '>calcul vitrine = les 2 premiers de par_prix',
  '>calcul combien = nombre de pas_chers',
  '>texte "{combien} pas chers, le moins cher : {premier de par_prix}"',
  '>pour chaque p dans vitrine :',
  '>>texte "{p.nom}"',
  '>si notes contient 15 :',
  '>>texte "Un 15 !"',
);

describe('listes — l’analyse', () => {
  it('accepte dont, trier, premier de, les n premiers et contient', () => {
    expect(erreurs(CATALOGUE.replace('{premier de par_prix}', '{livre.nom}'))).toEqual([]);
  });

  it('dont lit les champs de chaque élément, et refuse un champ inconnu', () => {
    expect(erreurs(programme('page "a" :', '>variable produits = [fiche avec nom "A" et prix 1]', '>calcul x = produits dont poids est egal a 2'))).toEqual([
      '3 : « poids » n\'est pas un champ des éléments de « produits ». Champs : nom, prix.',
    ]);
  });

  it('trier par un champ qui n’existe pas est refusé', () => {
    expect(erreurs(programme('page "a" :', '>variable produits = [fiche avec nom "A" et prix 1]', '>calcul x = trier produits par poids'))).toEqual([
      '3 : « poids » n\'est pas un champ des éléments de « produits ». Champs : nom, prix.',
    ]);
  });
});

describe('listes — ce que produit chaque cible', () => {
  const source = CATALOGUE.replace('{premier de par_prix}', '{livre.nom}');

  it('web : filter, sort sur une copie, find, slice, includes', () => {
    const page = genererProjetWeb(compiler(source).application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' }).get('src/pages/Catalogue.tsx')!;
    expect(page).toContain('const pasChers = produits.filter((element) => element.prix < 20000);');
    expect(page).toContain('const parPrix = [...produits].sort((x, y) => x.prix - y.prix);');
    expect(page).toContain('const duPlusCher = [...produits].sort((x, y) => y.prix - x.prix);');
    expect(page).toContain("const parNom = [...produits].sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));");
    expect(page).toContain('const notesTriees = [...notes].sort((x, y) => x - y);');
    expect(page).toContain("const livre = produits.find((element) => element.nom.includes('Liv')) ?? null;");
    expect(page).toContain('const vitrine = parPrix.slice(0, 2);');
    expect(page).toContain('notes.includes(15)');
  });

  it('site statique : le HTML de départ est déjà filtré, trié et coupé', () => {
    const html = genererProjetStatique(compiler(source).application!, { nom: 'a', source: 'a.humalis' }).get('index.html')!;
    expect(html).toContain('2 pas chers, le moins cher : Livre');
    expect(html).toContain('>Stylo</p>');
    expect(html).toContain('>Livre</p>');
    expect(html).not.toContain('>Pagne</p>');
    expect(html).toContain('Un 15 !');
  });
});

describe('listes — « premier de » peut ne rien trouver', () => {
  it('un champ lu sur son résultat est facultatif : rien ne s’affiche, et le TypeScript reste juste', () => {
    const source = programme('page "a" :', '>variable produits = [fiche avec nom "Livre" et prix 1]', '>calcul livre = premier de produits dont nom contient "Liv"', '>texte "Trouvé : {livre.nom}"');
    const page = genererProjetWeb(compiler(source).application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' }).get('src/pages/A.tsx')!;
    expect(page).toContain("{`Trouvé : ${livre?.nom ?? ''}`}");
  });
});
