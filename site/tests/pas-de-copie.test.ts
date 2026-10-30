import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOTS_CLES } from '../../src/lexer/motsCles';

const src = fileURLToPath(new URL('../src', import.meta.url));
const fichiers = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fichiers(join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(d, e.name)] : [],
  );

describe('rien n’est recopié du compilateur', () => {
  it('aucun fichier du site ne redéclare la liste des mots-clés', () => {
    // Une liste en dur contiendrait plusieurs mots-clés « rares » côte à côte.
    const motif = /['"]inferieur['"][^\n]*['"]superieur['"]|['"]requete['"][^\n]*['"]formulaire['"]/;
    const coupables = fichiers(src).filter((f) => !f.endsWith('adaptateur.ts') && motif.test(readFileSync(f, 'utf8')));
    expect(coupables).toEqual([]);
  });

  it('aucun fichier du site ne décrit les mots un par un : ils viennent de la table du compilateur', () => {
    const decrits = fichiers(src).filter((f) => /DETAILS\s*[:=]/.test(readFileSync(f, 'utf8')));
    expect(decrits).toEqual([]);
    const adaptateur = readFileSync(join(src, 'vocabulaire/adaptateur.ts'), 'utf8');
    expect(adaptateur).toContain("from '../../../src/vocabulaire/table'");
  });

  it('la page vocabulaire ne lit que l’adaptateur et regrouper', () => {
    const page = readFileSync(join(src, 'pages/documentation/Vocabulaire.tsx'), 'utf8');
    const imports = [...page.matchAll(/from '([^']+)'/g)].map((m) => m[1]).filter((i) => i.includes('vocabulaire/'));
    expect(imports.sort()).toEqual(['../../vocabulaire/adaptateur', '../../vocabulaire/regrouper']);
    expect(MOTS_CLES.size).toBeGreaterThan(0);
  });
});
