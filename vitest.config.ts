import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Les tests du site qui n'ont pas besoin de ses dépendances tournent aussi ici.
    include: ['tests/**/*.test.ts', 'site/tests/**/*.test.ts'],
    exclude: ['site/tests/construction.test.ts', 'node_modules/**', 'site/node_modules/**'],
  },
});
