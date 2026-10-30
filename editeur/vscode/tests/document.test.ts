import { describe, it, expect } from 'vitest';
import { lireDocument, jetonsDeLigne, jetonA, longueurJeton } from '../src/langage/document.js';

describe('lireDocument', () => {
  it('lit un fichier correct sans vider de ligne', () => {
    const doc = lireDocument('page "a" :\n    texte "b"\n');
    expect(doc.programme?.pages.map((p) => p.nom)).toEqual(['a']);
    expect([...doc.lignesVidees]).toEqual([]);
  });

  it('vide une ligne fautive au milieu et lit le reste', () => {
    const doc = lireDocument('page "a" :\n    variable x = 1\n    bouton avec avec\n    texte x\n');
    expect([...doc.lignesVidees]).toEqual([3]);
    expect(doc.programme?.pages[0].corps.map((i) => i.type)).toEqual(['Variable', 'Element']);
  });

  it('vide une ligne au guillemet non fermé', () => {
    const doc = lireDocument('page "a" :\n    texte "b\n    titre "c"\n');
    expect([...doc.lignesVidees]).toEqual([2]);
    expect(doc.programme?.pages[0].corps).toHaveLength(1);
  });

  it('vide d’office les lignes demandées (la ligne du curseur)', () => {
    const doc = lireDocument('page "a" :\n    texte "b"\n    ave\n', [3]);
    expect(doc.lignesVidees.has(3)).toBe(true);
    expect(doc.programme?.pages[0].corps).toHaveLength(1);
  });

  it('garde les lignes d’origine, même vidées', () => {
    const doc = lireDocument('page "a" :\n    bouton avec avec\n');
    expect(doc.lignes[1]).toBe('    bouton avec avec');
  });
});

describe('jetonsDeLigne et jetonA', () => {
  it('donne les jetons d’une ligne à leurs vraies colonnes', () => {
    const jetons = jetonsDeLigne('    bouton "Ajouter" avec fond vert', 5);
    expect(jetons.map((j) => [j.valeur, j.colonne, j.ligne])).toEqual([
      ['bouton', 5, 5],
      ['Ajouter', 12, 5],
      ['avec', 22, 5],
      ['fond', 27, 5],
      ['vert', 32, 5],
    ]);
  });

  it('lit encore les mots d’une ligne au guillemet non fermé', () => {
    const jetons = jetonsDeLigne('    bouton "Ajou', 1);
    expect(jetons[0].valeur).toBe('bouton');
  });

  it('trouve le jeton sous le curseur, y compris juste après sa dernière lettre', () => {
    const lignes = ['page "a" :', '    bouton "Ajouter"'];
    expect(jetonA(lignes, 2, 5)?.valeur).toBe('bouton');
    expect(jetonA(lignes, 2, 11)?.valeur).toBe('bouton');
    expect(jetonA(lignes, 2, 14)?.type).toBe('CHAINE');
    expect(jetonA(lignes, 2, 2)).toBeUndefined();
  });

  it('mesure un mot accentué par sa forme écrite', () => {
    const [, , , egal] = jetonsDeLigne('si x est égal à 0 :', 1);
    expect(egal.valeur).toBe('egal');
    expect(longueurJeton(egal)).toBe(4);
    const [chaine] = jetonsDeLigne('"Été"', 1);
    expect(longueurJeton(chaine)).toBe(5);
  });

  it('ne lit pas les lignes d’un bloc style (du CSS)', () => {
    const lignes = ['style :', '    .carte { color: red; }', 'page "a" :', '    texte "b"'];
    expect(jetonA(lignes, 2, 6)).toBeUndefined();
    expect(jetonA(lignes, 4, 6)?.valeur).toBe('texte');
  });
});
