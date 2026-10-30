import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../src/parser/parser.js';

const corpsDe = (source: string) =>
  analyserSyntaxe(analyser(`page "test" :\n${source}`)).pages[0].corps;

describe('parser — éléments', () => {
  it('reconnaît un titre simple', () => {
    expect(corpsDe('    titre "Bienvenue"')[0]).toMatchObject({
      type: 'Element',
      element: 'titre',
      contenu: { type: 'Chaine' },
      styles: [],
    });
  });

  it('reconnaît un style unique', () => {
    expect(corpsDe('    titre "Bienvenue" avec couleur bleu')[0]).toMatchObject({
      styles: [{ propriete: 'couleur', valeur: 'bleu' }],
    });
  });

  it('reconnaît plusieurs styles reliés par et', () => {
    expect(corpsDe('    bouton "Valider" avec fond vert et texte blanc')[0]).toMatchObject({
      element: 'bouton',
      styles: [
        { propriete: 'fond', valeur: 'vert' },
        { propriete: 'texte', valeur: 'blanc' },
      ],
    });
  });

  it('reconnaît un lien avec sa cible', () => {
    expect(corpsDe('    lien "En savoir plus" vers "apropos"')[0]).toMatchObject({
      element: 'lien',
      cible: 'apropos',
    });
  });

  it('accepte une variable comme contenu', () => {
    expect(corpsDe('    texte nom')[0]).toMatchObject({
      element: 'texte',
      contenu: { type: 'Reference', nom: 'nom' },
    });
  });

  it('reconnaît une image et un champ', () => {
    const corps = corpsDe('    image "photo.png"\n    champ "email"');
    expect(corps.map((i) => (i as { element: string }).element)).toEqual(['image', 'champ']);
  });
});
