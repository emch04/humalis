import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../src/parser/parser.js';

const corps = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;
const page = (...lignes: string[]) => ['page "a" :', ...lignes.map((l) => `    ${l}`)].join('\n');

describe('parser — les 19 mots réservés (décision Q2)', () => {
  it.each(['par', 'rien', 'non', 'composant', 'serveur', 'dans', 'vers'])(
    'refuse « %s » comme nom de variable, avec un message clair',
    (mot) => {
      expect(() => corps(page(`variable ${mot} = 1`))).toThrow(
        `Ligne 2 : « ${mot} » est un mot réservé du langage : il ne peut pas servir de nom. Choisissez un autre nom pour la variable.`,
      );
    },
  );

  it('refuse un mot réservé employé comme valeur', () => {
    expect(() => corps(page('texte quand'))).toThrow(
      /« quand » est un mot réservé du langage : il ne peut pas servir de nom de variable/,
    );
  });

  it('lit toujours « changer x par … » et « changer texte de … par … »', () => {
    const [, affectation, action] = corps(
      page('variable clics = 0', 'changer clics par 1', 'changer texte de "a" par "b"'),
    );
    expect(affectation).toMatchObject({ type: 'Affectation', nom: 'clics', valeur: { valeur: 1 } });
    expect(action).toMatchObject({ type: 'Action', action: 'changerTexte' });
  });

  it('dit qu’il manque « par » quand il manque', () => {
    expect(() => corps(page('variable clics = 0', 'changer clics 1'))).toThrow(
      /il manque « par » suivi de la nouvelle valeur/,
    );
  });

  it('accepte désormais « chaque » comme nom (il est contextuel)', () => {
    const [declaration, boucle] = corps(
      page('variable chaque = ["a"]', 'pour chaque nom dans chaque :', '    texte nom'),
    );
    expect(declaration).toMatchObject({ type: 'Variable', nom: 'chaque' });
    expect(boucle).toMatchObject({ type: 'Boucle', variable: 'nom', liste: { nom: 'chaque' } });
  });
});

describe('parser — mots prévus', () => {
  it('dit qu’un mot prévu n’est pas encore disponible', () => {
    expect(() => corps(page('tableau "Détails"'))).toThrow(
      /« tableau » n’est pas encore disponible : ce mot est prévu dans le vocabulaire, mais le compilateur ne le comprend pas encore\.$/,
    );
  });

  it('dit qu’un mot réservé prévu n’est pas encore disponible là où une valeur est attendue', () => {
    const message = /« non » n’est pas encore disponible : ce mot est prévu dans le vocabulaire/;
    expect(() => corps(page('variable x = 1', 'si non x :', '    texte "zéro"'))).toThrow(message);
    expect(() => corps(page('variable x = non 1'))).toThrow(message);
  });

  it('garde « instruction inconnue » pour un mot hors du vocabulaire', () => {
    expect(() => corps(page('bidule "x"'))).toThrow(/instruction inconnue : « bidule »/);
  });
});
