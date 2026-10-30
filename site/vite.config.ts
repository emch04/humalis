import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Le site lit le compilateur du dépôt (../src) : on autorise Vite à servir
// le dossier parent. La base est configurable pour un futur hébergement.
export default defineConfig({
  base: process.env.HUMALIS_BASE ?? '/',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
});
