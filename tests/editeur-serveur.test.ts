import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error : script JavaScript, sans déclaration de types
import { construireServeurEditeur } from '../scripts/construire-editeur.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = (JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8')) as { version: string }).version;

describe('« humalis editeur --stdio » : le serveur de langage dans le paquet npm', () => {
  it('emballe le serveur de l’extension sans recopier le compilateur, avec la version du paquet', async () => {
    const dossier = mkdtempSync(join(tmpdir(), 'humalis-editeur-'));
    try {
      // Le compilateur visé est src/ lui-même : chaque import doit y trouver son fichier.
      const sortie: string = await construireServeurEditeur({ sortie: join(dossier, 'editeur', 'serveur.js'), compilateur: join(racine, 'src') });
      const code = readFileSync(sortie, 'utf8');
      const imports = [...code.matchAll(/from "(\.[^"]+)"/g)].map((m) => m[1]!);
      expect(imports.length).toBeGreaterThan(5);
      for (const chemin of imports) {
        const fichier = resolve(dirname(sortie), chemin).replace(/\.js$/, '.ts');
        expect(existsSync(fichier), chemin).toBe(true);
      }
      // Aucun module du compilateur n'est recopié dans le serveur.
      expect(code).not.toMatch(/\/\/#region src\//);
      expect(code).toContain(`"version": "${version}"`);
      expect(code).not.toContain('"publisher"');
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it('est construite avec le paquet et décrite dans l’aide', () => {
    const paquet = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8')) as { scripts: Record<string, string>; files: string[] };
    expect(paquet.scripts.build).toContain('node scripts/construire-editeur.mjs');
    expect(paquet.files).toContain('dist');
    const cli = readFileSync(join(racine, 'src', 'cli.ts'), 'utf8');
    expect(cli).toContain('  humalis editeur --stdio\n');
    expect(cli).toContain("await import(serveur)");
  });
});
