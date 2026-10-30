import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Décision A1 d'Emch : « est plus grand que », « est plus petit que », « est différent de »,
// synonymes de « est superieur a », « est inferieur a » et du contraire de « est egal a ».
const condition = (texte: string) => {
  const [page] = analyserSyntaxe(analyser(programme('page "a" :', '>variable prix = 12', `>si ${texte} :`, '>>texte "oui"'))).pages;
  const si = page.corps.find((i) => i.type === 'Condition')!;
  return (si as { test: { operateur: string } }).test.operateur;
};

describe('comparaisons en français courant — le parseur', () => {
  it('lit « plus grand que », « plus petit que », avec ou sans accord', () => {
    expect(condition('prix est plus grand que 10')).toBe('superieur');
    expect(condition('prix est plus petit que 10')).toBe('inferieur');
    expect(condition('prix est plus grande que 10')).toBe('superieur');
    expect(condition('prix est plus petite que 10')).toBe('inferieur');
  });

  it('lit « plus grand ou égal à », « plus petit ou égal à »', () => {
    expect(condition('prix est plus grand ou égal à 10')).toBe('superieurOuEgal');
    expect(condition('prix est plus petit ou egal a 10')).toBe('inferieurOuEgal');
  });

  it('lit « différent de », avec ou sans accent ni accord', () => {
    expect(condition('prix est différent de 10')).toBe('different');
    expect(condition('prix est differente de 10')).toBe('different');
  });

  it('« grand », « petit » et « different » restent des noms de variables', () => {
    expect(erreurs(programme('page "a" :', '>variable grand = 3', '>variable petit = 2', '>variable different = 1', '>texte "{grand} {petit} {different}"'))).toEqual([]);
  });

  it('dit ce qui manque après « plus grand »', () => {
    expect(() => analyserSyntaxe(analyser(programme('page "a" :', '>variable prix = 1', '>si prix est plus grand 3 :', '>>texte "x"')))).toThrow(
      /« plus grand que »/,
    );
  });
});

describe('comparaisons en français courant — l’analyse', () => {
  it('« différent de » demande deux valeurs comparables, comme « égal à »', () => {
    expect(erreurs(programme('page "a" :', '>variable prix = 1', '>si prix est different de "x" :', '>>texte "x"'))).toEqual([
      '3 : on ne peut pas comparer un nombre et un texte.',
    ]);
  });

  it('« plus grand que » compare des nombres', () => {
    expect(erreurs(programme('page "a" :', '>variable nom = "Awa"', '>si nom est plus grand que 3 :', '>>texte "x"'))).toEqual([
      '3 : « nom » est un texte ; « est supérieur à » compare des nombres.',
    ]);
  });
});

const BOUTIQUE = programme(
  'page "boutique" :',
  '>variable stock = 3',
  '>si stock est plus grand que 2 :',
  '>>texte "En stock"',
  '>si stock est different de 0 :',
  '>>texte "Disponible"',
  '>si stock est plus petit que 1 :',
  '>>texte "Rupture"',
);

describe('comparaisons en français courant — les cibles', () => {
  it('web : >, < et !==', () => {
    const page = genererProjetWeb(compiler(BOUTIQUE).application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' }).get('src/pages/Boutique.tsx')!;
    expect(page).toContain('stock > 2');
    expect(page).toContain('stock !== 0');
    expect(page).toContain('stock < 1');
  });

  it('mobile : la même condition produit !==', () => {
    const fichiers = genererProjetMobile(compiler(BOUTIQUE).application!, { nom: 'a', source: 'a.humalis' });
    expect(fichiers.get('app/index.tsx')).toContain('stock !== 0');
  });

  it('site statique : le HTML de départ est déjà juste', () => {
    const html = genererProjetStatique(compiler(BOUTIQUE).application!, { nom: 'a', source: 'a.humalis' }).get('index.html')!;
    expect(html).toContain('En stock');
    expect(html).toContain('Disponible');
    expect(html).not.toContain('Rupture');
  });
});
