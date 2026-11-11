import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error : un script en JavaScript, sans déclaration de types.
import { lireLicence, produirePage } from '../scripts/licence-site.mjs';

/**
 * La page « Licence » du site est produite depuis LICENSE et LICENSE.en.md : les deux textes gardent
 * la même forme, chaque article est sur la page, et la page est celle que donnent les deux fichiers.
 */
const racine = fileURLToPath(new URL('..', import.meta.url));
const fr = lireLicence(readFileSync(new URL('../LICENSE', import.meta.url), 'utf8'));
const en = lireLicence(readFileSync(new URL('../LICENSE.en.md', import.meta.url), 'utf8'));

describe('la page Licence du site', () => {
  it('le français et l’anglais ont la même forme, article par article', () => {
    expect(fr.morceaux.map((m: { sorte: string }) => m.sorte)).toEqual(en.morceaux.map((m: { sorte: string }) => m.sorte));
    expect(fr.morceaux.filter((m: { sorte: string }) => m.sorte === 'article')).toHaveLength(11);
  });

  it('garde chaque article et le contact', () => {
    const page = produirePage();
    for (const m of fr.morceaux.filter((x: { sorte: string }) => x.sorte === 'article')) expect(page).toContain(m.texte);
    expect(page).toContain('contact@humalis.dev');
  });

  it('est à jour', () => {
    expect(() => execFileSync('node', ['scripts/licence-site.mjs', '--verifier'], { cwd: racine, stdio: 'pipe' })).not.toThrow();
  });
});
