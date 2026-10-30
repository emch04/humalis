import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../src/parser/parser.js';

const corpsDe = (source: string) =>
  analyserSyntaxe(analyser(`page "test" :\n${source}`)).pages[0].corps;

describe('parser — actions', () => {
  it('reconnaît afficher avec une chaîne', () => {
    expect(corpsDe('    afficher "Bonjour"')[0]).toMatchObject({
      type: 'Action',
      action: 'afficher',
      arguments: [{ type: 'Chaine' }],
    });
  });

  it('reconnaît afficher erreur', () => {
    expect(corpsDe('    afficher erreur "Email requis"')[0]).toMatchObject({
      action: 'afficherErreur',
    });
  });

  it('reconnaît cacher', () => {
    expect(corpsDe('    cacher "popup"')[0]).toMatchObject({ action: 'cacher' });
  });

  it('reconnaît rediriger vers', () => {
    expect(corpsDe('    rediriger vers "accueil"')[0]).toMatchObject({
      action: 'rediriger',
      arguments: [{ type: 'Chaine' }],
    });
  });

  it('reconnaît changer texte de X par Y', () => {
    expect(corpsDe('    changer texte de "description" par "Nouveau"')[0]).toMatchObject({
      action: 'changerTexte',
      arguments: [{ type: 'Chaine' }, { type: 'Chaine' }],
    });
  });

  it('accepte une variable affichée', () => {
    expect(corpsDe('    afficher nom')[0]).toMatchObject({
      action: 'afficher',
      arguments: [{ type: 'Reference', nom: 'nom' }],
    });
  });
});
