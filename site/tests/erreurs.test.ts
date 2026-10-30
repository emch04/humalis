import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ENTREES_ERREURS } from '../src/contenu/erreurs';
import { diagnostiquer as diagnostiquerActuel, formater } from '../src/contenu/verification';

const diagnostiquer = (source: string) => diagnostiquerActuel(source).filter((d) => d.categorie !== 'accessibilite');
const diagnosticsDe = (entree: { id: string }, source: string) => entree.id.startsWith('accessibilite-') ? diagnostiquerActuel(source).filter((d) => d.categorie === 'accessibilite') : diagnostiquer(source);
const messageDe = (entree: { id: string }, source: string) => {
  const diagnostics = diagnosticsDe(entree, source);
  const premier = diagnostics.find((d) => d.gravite === 'erreur') ?? diagnostics[0];
  return premier ? formater(premier) : null;
};

const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(`../../${chemin}`, import.meta.url)), 'utf8');
const compter = (source: string, motif: RegExp) => (source.match(motif) ?? []).length;

describe('catalogue des erreurs', () => {
  it('les identifiants sont uniques', () => {
    const ids = ENTREES_ERREURS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const entree of ENTREES_ERREURS.filter((x) => x.atteignable)) {
    it(`« ${entree.id} » : le programme fautif produit le message annoncé`, () => {
      const diagnostics = diagnosticsDe(entree, entree.fautif);
      const trouves = diagnostics.filter((d) => d.message.includes(entree.motif));
      expect(trouves.length, messageDe(entree, entree.fautif) ?? 'aucun message').toBeGreaterThan(0);
      expect(trouves[0].gravite).toBe(entree.gravite);
      // Une seule remarque, pour que le lecteur voie exactement la cause.
      expect(diagnostics).toHaveLength(1);
    });
    it(`« ${entree.id} » : le programme corrigé ne signale rien`, () => {
      expect(messageDe(entree, entree.corrige)).toBeNull();
    });
  }

  it('le message produit commence bien par « Ligne N : »', () => {
    for (const entree of ENTREES_ERREURS.filter((x) => x.atteignable)) {
      expect(messageDe(entree, entree.fautif)).toMatch(/^Ligne \d+ : /);
    }
  });

  it('couvre chaque endroit du compilateur qui produit un message', () => {
    const sites =
      compter(lire('src/lexer/lexer.ts'), /new ErreurLexicale\(/g) +
      compter(lire('src/parser/parser.ts'), /new ErreurSyntaxique\(/g) +
      compter(lire('src/parser/fluxTokens.ts'), /new ErreurSyntaxique\(/g) +
      compter(lire('src/analyse/analyse.ts'), /this\.(erreur|avertissement|horsEvenement)\(/g) +
      compter(lire('src/analyse/noms.ts'), /gravite: 'avertissement'/g) +
      compter(lire('src/analyse/serveur.ts'), /\b(erreur|avertissement)\(\s*`/g) +
      compter(lire('src/parser/source.ts'), /new ErreurSyntaxique\(/g) +
      compter(lire('src/analyse/sources.ts'), /\b(erreur|avertissement)\(\s*[`'"]/g) +
      compter(lire('src/parser/navigation.ts'), /new ErreurSyntaxique\(/g) +
      compter(lire('src/analyse/navigation.ts'), /\b(erreur|avertissement)\(\s*[`'"]/g) +
      compter(lire('src/parser/site.ts'), /new ErreurSyntaxique\(/g) +
      compter(lire('src/parser/fonctionsActions.ts'), /new ErreurSyntaxique\(/g) +
      compter(lire('src/analyse/site.ts'), /\bavertir\(\s*[`'"]|gravite: 'erreur'/g) +
      compter(lire('src/parser/medias.ts'), /new ErreurSyntaxique\(/g) +
      compter(lire('src/analyse/medias.ts'), /\b(erreur|avertissement)\(\s*[`'"]/g) +
      compter(lire('src/parser/interactions.ts'), /new ErreurSyntaxique\(/g) +
      compter(lire('src/analyse/interactions.ts'), /\b(erreur|avertissement)\(\s*[`'"]/g) +
      compter(lire('src/parser/langues.ts'), /new ErreurSyntaxique\(/g) +
      compter(lire('src/analyse/langues.ts'), /\b(erreur|avertir)\(\s*[`'"]/g) +
      compter(lire('src/parser/fichier.ts'), /new ErreurSyntaxique\(/g) +
      compter(lire('src/analyse/fichiers.ts'), /\bs\.(erreur|avertissement)\(/g) +
      compter(lire('src/parser/carte.ts'), /new ErreurSyntaxique\(/g) +
      compter(lire('src/analyse/carte.ts'), /\bs\.(erreur|avertissement)\(|gravite: 'avertissement'/g);
    const sitesQualite = compter(lire('src/analyse/accessibilite.ts'), /\bsignaler\('(?:erreur|avertissement)'/g);
    const expliques = ENTREES_ERREURS.reduce((n, x) => n + x.sites, 0);
    // Si le compilateur gagne ou perd un message, ce test échoue : ajoute ou retire une entrée.
    expect(expliques).toBe(sites + sitesQualite);
  });
});
