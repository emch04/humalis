import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../src/parser/parser.js';
import { FluxTokens } from '../../src/parser/fluxTokens.js';

const corps = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;
const page = (...lignes: string[]) => ['page "a" :', ...lignes.map((l) => `    ${l}`)].join('\n');

describe('parser — un petit mot ignoré pris pour un nom', () => {
  it('explique que « a » est un petit mot ignoré, au lieu de « il manque le nom »', () => {
    expect(() => corps(page('variable a = 1'))).toThrow(
      'Ligne 2 : « a » est un petit mot ignoré par Humalis : il ne peut pas servir de nom. Choisissez un autre nom pour la variable, par exemple « a_1 » ou un mot plus parlant.',
    );
  });

  it('pareil pour la variable d’une boucle', () => {
    expect(() => corps(page('variable l = []', 'pour chaque de dans l :', '    texte "x"'))).toThrow(
      /« de » est un petit mot ignoré par Humalis/,
    );
  });

  it('pareil pour la liste de « ajouter » et la variable de « changer »', () => {
    expect(() => corps(page('ajouter 1 à la'))).toThrow(/« la » est un petit mot ignoré/);
    expect(() => corps(page('changer le par 2'))).toThrow(/« le » est un petit mot ignoré/);
  });

  it('le signale aussi quand il manque une valeur après un petit mot', () => {
    expect(() => corps(page('texte des'))).toThrow(/« des » est un petit mot ignoré par Humalis/);
  });

  it('ne change rien aux phrases où le petit mot est à sa place', () => {
    const [variable, condition] = corps(page('variable stock = 0', 'si le stock est égal à 0 :', '    texte "Rupture"'));
    expect(variable).toMatchObject({ type: 'Variable', nom: 'stock' });
    expect(condition).toMatchObject({ type: 'Condition', test: { operateur: 'egal', droite: { valeur: 0 } } });
  });
});

describe('FluxTokens — mots de liaison', () => {
  it('saute les mots de liaison par défaut', () => {
    const flux = new FluxTokens(analyser('si le champ'));
    flux.avancer();
    expect(flux.actuel().valeur).toBe('champ');
    expect(flux.regarder(-1).valeur).toBe('si');
  });

  it('dit quel mot de liaison précède le token actuel, et peut l’accepter', () => {
    const flux = new FluxTokens(analyser('augmenter quantite de 1'));
    flux.avancer();
    flux.avancer();
    expect(flux.liaisonAvant()?.valeur).toBe('de');
    expect(flux.accepterLiaison('du')).toBe(false);
    expect(flux.accepterLiaison('de')).toBe(true);
    expect(flux.actuel().valeur).toBe('1');
    flux.avancer();
    expect(flux.liaisonAvant()).toBeUndefined();
  });
});
