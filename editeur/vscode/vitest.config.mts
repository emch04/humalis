import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Le module « vscode » n'existe que dans VS Code : les tests de l'adaptateur en utilisent un faux.
    alias: { vscode: fileURLToPath(new URL('./tests/faux-vscode.ts', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
