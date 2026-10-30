import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { compiler } from '../aide-qualite.js';
import { programme } from '../analyse/aide.js';

// Décision L1 d'Emch : « 2,5 » (virgule collée aux chiffres), « 2.5 » accepté aussi.
const nombres = (source: string) => analyser(source).filter((t) => t.type === 'NOMBRE').map((t) => t.valeur);

describe('lexer — les nombres décimaux (décision L1)', () => {
  it('lit « 2,5 » et « 2.5 » comme le même nombre, écrit avec un point', () => {
    expect(nombres('variable remise = 2,5')).toEqual(['2.5']);
    expect(nombres('variable remise = 2.5')).toEqual(['2.5']);
    expect(nombres('variable tva = 0,16')).toEqual(['0.16']);
  });

  it('une virgule suivie d’une espace sépare toujours les éléments d’une liste', () => {
    expect(nombres('variable notes = [12, 15, 9]')).toEqual(['12', '15', '9']);
    expect(nombres('variable notes = [2,5, 3]')).toEqual(['2.5', '3']);
  });

  it('un nombre suivi d’une virgule ou d’un point sans chiffre reste entier', () => {
    expect(nombres('variable n = 3.')).toEqual(['3']);
    expect(nombres('variable notes = [1 ,2]')).toEqual(['1', '2']);
  });
});

describe('les décimaux dans un programme', () => {
  it('se calculent et gardent leur type nombre', () => {
    const { application, diagnostics } = compiler(programme('page "a" :', '>variable prix = 12,5', '>calcul double = prix * 2', '>texte "{double}"'));
    expect(diagnostics).toEqual([]);
    expect(application!.ecrans[0].etat[0]).toMatchObject({ nom: 'prix', initiale: { type: 'nombre', valeur: 12.5 } });
  });

  it('marchent aussi dans une comparaison et après un moins', () => {
    expect(compiler(programme('page "a" :', '>variable t = -0,5', '>si t est inferieur a 1,5 :', '>>texte "ok"')).diagnostics).toEqual([]);
  });
});
