import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../src/parser/parser.js';

const corps = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;

describe('parser — mots-clés contextuels', () => {
  it('accepte une variable nommée comme un élément', () => {
    const [declaration, element] = corps(
      'page "a" :\n    variable titre = "Bonjour"\n    titre titre',
    );
    expect(declaration).toMatchObject({ type: 'Variable', nom: 'titre' });
    expect(element).toMatchObject({
      type: 'Element',
      element: 'titre',
      contenu: { type: 'Reference', nom: 'titre' },
    });
  });

  it("garde l'orthographe d'origine du nom de variable", () => {
    const [declaration] = corps('page "a" :\n    variable Vide = vrai');
    expect(declaration).toMatchObject({ type: 'Variable', nom: 'Vide' });
  });

  it('accepte un mot contextuel comme variable de boucle et comme liste', () => {
    const [, boucle] = corps(
      'page "a" :\n    variable menu = ["Accueil"]\n    pour chaque lien dans menu :\n        texte lien',
    );
    expect(boucle).toMatchObject({
      type: 'Boucle',
      variable: 'lien',
      liste: { type: 'Reference', nom: 'menu' },
      corps: [{ type: 'Element', element: 'texte', contenu: { type: 'Reference', nom: 'lien' } }],
    });
  });

  it('compare une variable nommée comme un mot du langage', () => {
    const [, condition] = corps(
      'page "a" :\n    variable image = 3\n    si image est egal a 3 :\n        texte "ok"',
    );
    expect(condition).toMatchObject({
      type: 'Condition',
      test: { gauche: { type: 'Reference', nom: 'image' }, operateur: 'egal' },
    });
  });

  it('affiche une variable nommée « erreur » sans la prendre pour un message d’erreur', () => {
    const [, action] = corps('page "a" :\n    variable erreur = "x"\n    afficher erreur');
    expect(action).toMatchObject({
      type: 'Action',
      action: 'afficher',
      arguments: [{ type: 'Reference', nom: 'erreur' }],
    });
  });

  it('reconnaît toujours « afficher erreur "…" »', () => {
    const [action] = corps('page "a" :\n    afficher erreur "Email requis"');
    expect(action).toMatchObject({ type: 'Action', action: 'afficherErreur' });
  });

  it('refuse un mot réservé comme nom de variable', () => {
    expect(() => corps('page "a" :\n    variable si = 1')).toThrow(
      /« si » est un mot réservé du langage/,
    );
  });

  it('refuse un mot réservé comme variable de boucle', () => {
    expect(() =>
      corps('page "a" :\n    variable l = []\n    pour chaque page dans l :\n        texte "x"'),
    ).toThrow(/« page » est un mot réservé du langage/);
  });
});
