import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Plan du langage de base (tâche 2) : « grouper produits par categorie », chaque groupe a nom et elements.
const CATALOGUE = programme(
  'page "catalogue" :',
  '>titre "Catalogue"',
  '>variable produits = [fiche avec nom "Pagne" et categorie "Tissus", fiche avec nom "Robe" et categorie "Mode", fiche avec nom "Wax" et categorie "Tissus"]',
  '>calcul rayons = grouper produits par categorie',
  '>pour chaque rayon dans rayons :',
  '>>soustitre rayon.nom',
  '>>pour chaque p dans rayon.elements :',
  '>>>texte p.nom',
);

describe('grouper', () => {
  it('chaque groupe a un nom et ses éléments, lus comme des champs', () => {
    expect(erreurs(CATALOGUE)).toEqual([]);
  });

  it('le champ doit exister, la liste doit être une liste de fiches', () => {
    expect(erreurs(programme('page "a" :', '>titre "A"', '>variable produits = [fiche avec nom "Pagne" et categorie "Tissus"]', '>calcul r = grouper produits par rayon', '>texte "{r}"'))[0]).toMatch(/« rayon » n'est pas un champ des éléments/);
    expect(erreurs(programme('page "a" :', '>titre "A"', '>variable notes = [12, 15]', '>calcul r = grouper notes par note', '>texte "{r}"'))[0]).toMatch(/« grouper » range une liste de fiches/);
  });

  it('web : l’outil grouper, dans l’ordre d’apparition', () => {
    const fichiers = genererProjetWeb(compiler(CATALOGUE).application!, { nom: 'c', adresse: 'https://c.cd', source: 'c.humalis' });
    expect(fichiers.get('src/pages/Catalogue.tsx')).toContain('const rayons = grouper(produits, (element) => element.categorie);');
    expect(fichiers.get('src/pages/Catalogue.tsx')).toContain("import { grouper } from '../humalis/outils';");
    expect(fichiers.get('src/humalis/outils.ts')).toContain('export function grouper<');
  });

  it('site statique : le HTML de départ est déjà groupé', () => {
    const html = genererProjetStatique(compiler(CATALOGUE).application!, { nom: 'c', source: 'c.humalis' }).get('index.html')!;
    expect(html.indexOf('Tissus')).toBeLessThan(html.indexOf('Wax'));
    expect(html.indexOf('Wax')).toBeLessThan(html.indexOf('Mode'));
  });
});
