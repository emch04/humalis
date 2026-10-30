import { describe, it, expect } from 'vitest';
import { colorer } from '../src/coloration/colorer';

const recomposer = (src: string) => colorer(src).map((s) => s.texte).join('');

describe('colorer', () => {
  it('recompose exactement la source', () => {
    const src = 'page "a" :\n    titre "x" avec couleur bleu';
    expect(recomposer(src)).toBe(src);
  });

  it('distingue mots réservés, mots contextuels et chaînes', () => {
    const r = colorer('page "a" :\n    titre "x"');
    expect(r[0]).toEqual({ texte: 'page', classe: 'reserve' });
    expect(r.find((s) => s.texte === 'titre')?.classe).toBe('contextuel');
    expect(r.find((s) => s.texte === '"x"')?.classe).toBe('chaine');
  });

  it('ne plante pas sur un programme invalide et recompose la source', () => {
    for (const src of ['page "a" :\n      titre "x"\n   texte "y"', 'titre "ouvert', '\ttitre {', '']) {
      expect(recomposer(src)).toBe(src);
    }
  });

  it('colore les variantes accentuées comme des mots-clés', () => {
    const r = colorer('est inférieure');
    expect(r[2]).toEqual({ texte: 'inférieure', classe: 'contextuel' });
  });

  it('repère les {variables} dans une chaîne', () => {
    const r = colorer('texte "Bonjour {nom} !"');
    expect(r.map((s) => s.classe)).toContain('variable');
    expect(r.find((s) => s.classe === 'variable')?.texte).toBe('{nom}');
  });

  it('repère les commentaires, sauf entre guillemets', () => {
    const r = colorer('titre "Article #1" # note');
    expect(r.find((s) => s.classe === 'commentaire')?.texte).toBe('# note');
    expect(r.find((s) => s.texte === '"Article #1"')?.classe).toBe('chaine');
  });

  it('repère les nombres et les mots de liaison', () => {
    const r = colorer("quand l'utilisateur clique sur 12");
    expect(r.find((s) => s.texte === "l'")?.classe).toBe('liaison');
    expect(r.find((s) => s.texte === '12')?.classe).toBe('nombre');
  });

  it('colore les mots du serveur à leur place seulement', () => {
    const src = 'serveur "s" :\n    donnee date :\n        admin : date\n    route "dates" :\n        tout le monde peut lire date';
    const r = colorer(src);
    expect(r.map((x) => x.texte).join('')).toBe(src);
    const classes = (mot: string) => r.filter((x) => x.texte === mot).map((x) => x.classe);
    expect(classes('donnee')).toEqual(['contextuel']);
    expect(classes('route')).toEqual(['contextuel']);
    expect(classes('peut')).toEqual(['contextuel']);
    expect(classes('tout')).toEqual(['contextuel']);
    // « admin » est ici un nom de champ, « date » un nom de donnée, puis un type, puis encore un nom de donnée.
    expect(classes('admin')).toEqual(['identifiant']);
    expect(classes('date')).toEqual(['identifiant', 'contextuel', 'identifiant']);
  });

  it('ne colore pas ces mots hors d’un serveur', () => {
    const r = colorer('page "p" :\n    variable route = 1\n    texte "{route}"');
    expect(r.find((x) => x.texte === 'route')?.classe).toBe('identifiant');
  });
});
