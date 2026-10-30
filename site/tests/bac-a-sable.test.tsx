import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, matchRoutes } from 'react-router';
import { BacASable, compilerPourBac, EXEMPLES_BAC } from '../src/pages/BacASable';
import { routes } from '../src/routes';

describe('bac à sable', () => {
  it('affiche la page et sa route', () => {
    expect(matchRoutes(routes, '/bac-a-sable')?.at(-1)?.route.path).toBe('bac-a-sable');
    const html = renderToStaticMarkup(<MemoryRouter><BacASable /></MemoryRouter>);
    expect(html).toContain('Écris du Humalis');
    expect(html).toContain('textarea');
  });
  it('compile un exemple en document autonome', () => {
    const resultat = compilerPourBac(EXEMPLES_BAC[0].code);
    expect(resultat.diagnostics).toEqual([]);
    expect(resultat.srcdoc).toContain('<!doctype html>');
    expect(resultat.srcdoc).toContain('<style>');
  });
  it('affiche la ligne d’une erreur et isole le cadre', () => {
    const resultat = compilerPourBac('page "accueil" :\n   titre "Erreur"');
    expect(resultat.diagnostics.join(' ')).toMatch(/Ligne 2/);
    const html = renderToStaticMarkup(<MemoryRouter><BacASable /></MemoryRouter>);
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain('allow-same-origin');
  });
  it('recopie les scripts sans les abîmer (les « $ » du code restent tels quels)', () => {
    const { srcdoc } = compilerPourBac(EXEMPLES_BAC[0].code);
    const scripts = [...srcdoc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(1);
    // Chaque script se lit sans erreur de syntaxe.
    for (const code of scripts) expect(() => new Function(code)).not.toThrow();
  });
});
