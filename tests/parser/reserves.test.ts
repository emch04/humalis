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
    expect(() => corps(page('tableau "Détails"'))).toThrow(/deux-points après la légende du tableau/);
  });

  it('dit qu’un mot prévu n’est pas encore disponible', () => {
    expect(() => corps(page('video "film.mp4"'))).toThrow(/« video » n’est pas encore disponible : ce mot est prévu dans le vocabulaire/);
  });

  it('« non » devant une valeur en fait une condition (validé le 10 novembre)', () => {
    expect(corps(page('variable x = non ouvert'))[0]).toMatchObject({ type: 'Variable', valeur: { type: 'TestValeur' } });
  });

  it('garde « instruction inconnue » pour un mot hors du vocabulaire', () => {
    expect(() => corps(page('bidule "x"'))).toThrow(/instruction inconnue : « bidule »/);
  });
});
