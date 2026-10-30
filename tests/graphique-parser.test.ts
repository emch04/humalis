import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { formaterSource } from '../src/outils/formatage.js';
import { programme, erreurs } from './analyse/aide.js';

const p = (...lignes: string[]) => programme('page "p" :', '>titre "Ventes"', ...lignes);
const corps = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;
const graphique = (source: string) => corps(source).find((i) => i.type === 'Graphique') as any;

describe('graphiques — le parser', () => {
  it('lit la forme en ligne : genre, liste, etiquette, valeur et sa devise, description', () => {
    expect(graphique(p('>graphique en courbe ventes avec etiquette mois et valeur montant en FC et description "Les ventes montent."'))).toEqual({
      type: 'Graphique',
      genre: 'courbe',
      liste: { type: 'Reference', nom: 'ventes', ligne: 3 },
      etiquette: 'mois',
      valeur: { champ: 'montant', devise: 'FC', ligne: 3 },
      description: { type: 'Chaine', parties: [{ type: 'texte', valeur: 'Les ventes montent.' }], ligne: 3 },
      series: [],
      classes: [],
      ligne: 3,
    });
  });

  it('lit la forme en bloc : une ligne « serie » par série, avec sa devise et sa couleur', () => {
    const g = graphique(
      p(
        '>graphique en barres mois avec etiquette nom et description "Ventes et achats." et proportions 2 sur 1 :',
        '>>serie "Ventes" valeur ventes en FC avec couleur bleu',
        '>>serie "Achats" valeur achats en FC avec couleur orange',
      ),
    );
    expect(g.genre).toBe('barres');
    expect(g.proportions).toEqual([2, 1]);
    expect(g.series).toEqual([
      { nom: 'Ventes', valeur: { champ: 'ventes', devise: 'FC', ligne: 4 }, couleur: 'bleu', ligne: 4 },
      { nom: 'Achats', valeur: { champ: 'achats', devise: 'FC', ligne: 5 }, couleur: 'orange', ligne: 5 },
    ]);
  });

  it('lit une liste de nombres avec ses étiquettes, le camembert, la couleur et le style', () => {
    const g = graphique(p('>graphique en barres [120, 180] avec etiquettes ["Lun", "Mar"] et couleur vert et style "large" et description "Visites."'));
    expect(g.liste.type).toBe('Liste');
    expect(g.etiquettes.type).toBe('Liste');
    expect(g.couleur).toBe('vert');
    expect(g.classes).toEqual(['large']);
    expect(graphique(p('>graphique en camembert depenses avec etiquette poste et valeur total en euros et description "Le loyer pèse la moitié."')).genre).toBe('camembert');
  });

  it('« graphique » et « serie » restent des noms ailleurs', () => {
    expect(erreurs(p('>variable graphique = 1', '>variable serie = 2', '>texte "{graphique} {serie}"'))).toEqual([]);
  });

  it('refuse un genre inconnu ou absent, avec les genres possibles', () => {
    expect(() => corps(p('>graphique en ligne ventes avec description "x"'))).toThrow('en courbe, en barres, en camembert');
    expect(() => corps(p('>graphique ventes avec description "x"'))).toThrow('en courbe, en barres, en camembert');
  });

  it('refuse une option inconnue, une ligne du bloc qui n’est pas une série, et « serie » hors d’un graphique', () => {
    expect(() => corps(p('>graphique en courbe ventes avec etiquete mois'))).toThrow('n’est pas une option de graphique');
    expect(() => corps(p('>graphique en courbe ventes avec description "x" :', '>>texte "Bonjour"'))).toThrow('chaque ligne est une série');
    expect(() => corps(p('>serie "Ventes" valeur ventes'))).toThrow('« serie » se place dans un graphique');
  });

  it('le formateur garde le graphique tel quel (arbre identique, idempotent)', () => {
    const source = p(
      '>graphique   en courbe ventes avec etiquette mois et valeur montant en FC et description "Ventes, en hausse." :',
      '>>serie "Ventes"   valeur montant',
    ).replace('    serie', '    serie');
    const une = formaterSource(source);
    expect(formaterSource(une)).toBe(une);
    expect(une).toContain('graphique en courbe ventes avec etiquette mois');
  });
});
