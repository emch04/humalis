import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { formaterArgent, accorder } from '../src/cibles/format.js';
import { programme, erreurs } from './analyse/aide.js';

// Décision L6 d'Emch : « {prix en FC} », « {prix en euros} », « {n article} » ; tâche 2 : le texte.
const BOUTIQUE = programme(
  'page "boutique" :',
  '>variable prix = 15000',
  '>variable prix_euros = 12,5',
  '>variable panier = ["Pagne", "Livre", "Stylo"]',
  '>variable nom = "Awa Mbuyi"',
  '>calcul n = nombre de panier',
  '>calcul cri = majuscules de nom',
  '>calcul discret = minuscules de nom',
  '>calcul taille = longueur de nom',
  '>calcul poli = remplacer "Awa" par "Madame" dans nom',
  '>texte "{prix en FC} ou {prix_euros en euros}, {n article}"',
  '>texte "{cri} {discret} {taille} {poli}"',
  '>si nom commence par "Awa" :',
  '>>texte "Bonjour Awa"',
  '>si nom finit par "Mbuyi" :',
  '>>texte "Famille Mbuyi"',
);

describe('argent et pluriels — les outils', () => {
  it('l’argent : francs congolais, euros, dollars', () => {
    expect(formaterArgent(15000, 'FC')).toBe('15 000 FC');
    expect(formaterArgent(12.5, 'EUR')).toBe('12,50 €');
    expect(formaterArgent(12.5, 'USD')).toBe('12,50 $');
    expect(formaterArgent(undefined, 'FC')).toBe('');
  });

  it('les pluriels français', () => {
    expect(accorder(1, 'article')).toBe('1 article');
    expect(accorder(3, 'article')).toBe('3 articles');
    expect(accorder(0, 'article')).toBe('0 article');
    expect(accorder(2, 'journal')).toBe('2 journaux');
    expect(accorder(4, 'gâteau')).toBe('4 gâteaux');
    expect(accorder(2, 'prix')).toBe('2 prix');
    expect(accorder(1200, 'pagne')).toBe('1 200 pagnes');
  });
});

describe('argent, pluriels et texte — l’analyse', () => {
  it('accepte l’argent, les pluriels et les opérations sur le texte', () => {
    expect(erreurs(BOUTIQUE)).toEqual([]);
  });

  it('refuse une devise inconnue, en donnant celles qui existent', () => {
    expect(erreurs(programme('page "a" :', '>variable prix = 1', '>texte "{prix en yens}"'))).toEqual([
      '3 : « yens » n\'est pas une devise connue. Devises : FC, euros, dollars (et Ko, Mo pour une taille).',
    ]);
  });

  it('refuse l’argent ou un pluriel sur autre chose qu’un nombre', () => {
    expect(erreurs(programme('page "a" :', '>variable nom = "Awa"', '>texte "{nom en FC}"'))).toEqual([
      '3 : « nom » est un texte ; « en FC » s\'écrit après un nombre.',
    ]);
  });

  it('les opérations sur le texte attendent un texte', () => {
    expect(erreurs(programme('page "a" :', '>variable n = 3', '>calcul m = majuscules de n'))).toEqual([
      '3 : « majuscules de » attend un texte ; « n » est un nombre.',
    ]);
  });
});

describe('argent, pluriels et texte — ce que produit chaque cible', () => {
  it('web : les outils d’argent et de pluriel, et des méthodes de texte lisibles', () => {
    const fichiers = genererProjetWeb(compiler(BOUTIQUE).application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' });
    const page = fichiers.get('src/pages/Boutique.tsx')!;
    expect(page).toContain("${formaterArgent(prix, 'FC')} ou ${formaterArgent(prixEuros, 'EUR')}, ${accorder(n, 'article')}");
    expect(page).toContain("import { accorder, formaterArgent, formaterNombre } from '../humalis/outils';");
    expect(page).toContain("const cri = nom.toLocaleUpperCase('fr');");
    expect(page).toContain("const discret = nom.toLocaleLowerCase('fr');");
    expect(page).toContain('const taille = nom.length;');
    expect(page).toContain("const poli = nom.replaceAll('Awa', 'Madame');");
    expect(page).toContain("nom.startsWith('Awa')");
    expect(page).toContain("nom.endsWith('Mbuyi')");
    expect(fichiers.get('src/humalis/outils.ts')).toContain('export function accorder(');
  });

  it('site statique : le HTML de départ est déjà écrit en français', () => {
    const html = genererProjetStatique(compiler(BOUTIQUE).application!, { nom: 'a', source: 'a.humalis' }).get('index.html')!;
    expect(html).toContain('15 000 FC ou 12,50 €, 3 articles');
    expect(html).toContain('AWA MBUYI awa mbuyi 9 Madame Mbuyi');
    expect(html).toContain('Bonjour Awa');
    expect(html).toContain('Famille Mbuyi');
  });
});
