import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const fichiers = (dossier: string) => readdirSync(join(src, dossier)).map((f) => join(src, dossier, f));

describe('les outils d’éditeur ne dépendent pas de VS Code', () => {
  for (const fichier of [...fichiers('langage'), ...fichiers('lsp')]) {
    it(`${fichier.slice(src.length + 1)} n’importe ni « vscode » ni de bibliothèque externe`, () => {
      const texte = readFileSync(fichier, 'utf8');
      const imports = [...texte.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      for (const i of imports) expect(i.startsWith('.') || i.startsWith('node:'), i).toBe(true);
    });
  }
});
