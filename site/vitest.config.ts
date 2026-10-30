import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Depuis site/ : les tests purs (tests/) et ceux qui rendent du React (tests-react/).
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
  test: {
    include: ['tests/**/*.test.{ts,tsx}', 'tests-react/**/*.test.{ts,tsx}'],
    exclude: ['tests/construction.test.ts', 'node_modules/**'],
  },
});
