import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('..', import.meta.url));

// Lent : lancé à part, avec TEST_SITE_BUILD=1 (voir le plan, tâche 13).
describe.skipIf(!process.env.TEST_SITE_BUILD)('construction du site', () => {
  it('npm run build produit dist/index.html', () => {
    execSync('npm run build', { cwd: site, stdio: 'pipe' });
    expect(existsSync(`${site}/dist/index.html`)).toBe(true);
  }, 180_000);
});
