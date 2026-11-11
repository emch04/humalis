import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOTS_CONTEXTUELS, MOTS_RESERVES, VARIANTES } from '../src/lexer/motsCles.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (chemin: string) => readFileSync(join(racine, chemin), 'utf8');

/** Les mots que colorent les éditeurs, calculés comme scripts/generer-mots.mjs depuis le vocabulaire. */
function motsAttendus() {
  const constantes = new Set(['vrai', 'faux']);
  const avecVariantes = (mots: string[]) => {
    const formes = new Set(mots);
    for (const [variante, canonique] of VARIANTES) if (formes.has(canonique)) formes.add(variante);
    return [...formes].sort();
  };
  return {
    reserves: avecVariantes([...MOTS_RESERVES].filter((m) => !constantes.has(m))),
    contextuels: avecVariantes([...MOTS_CONTEXTUELS]),
    constantes: [...constantes].sort(),
  };
}

describe('les extensions des autres éditeurs suivent le vocabulaire', () => {
  it('mots.json (Zed, Helix, Neovim, JetBrains) a les mots du compilateur', () => {
    expect(JSON.parse(lire('editeur/tree-sitter-humalis/mots.json'))).toEqual(motsAttendus());
  });

  it('le mode Emacs a les mêmes mots', () => {
    const mots = motsAttendus();
    const emacs = lire('editeur/emacs/humalis-mode.el');
    const liste = (nom: string) => [...(new RegExp(`\\(defconst ${nom}\\s+'\\(([^)]*)\\)\\)`).exec(emacs)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(liste('humalis--mots-reserves')).toEqual(mots.reserves);
    expect(liste('humalis--mots-contextuels')).toEqual(mots.contextuels);
    expect(liste('humalis--constantes')).toEqual(mots.constantes);
  });

  it('la grammaire de Sublime Text est à jour avec celle de VS Code', () => {
    execFileSync(process.execPath, [join(racine, 'editeur/sublime/generer.mjs'), '--verifier'], { stdio: 'pipe' });
    // Sublime refuse les regards en arrière de longueur variable : il n'en reste aucun.
    expect(lire('editeur/sublime/Humalis/Humalis.tmLanguage')).not.toMatch(/\(\?&lt;=[^)]*[*+]/);
  });

  it('Zed colore avec les requêtes de la grammaire tree-sitter', () => {
    expect(lire('editeur/zed/languages/humalis/highlights.scm')).toBe(lire('editeur/tree-sitter-humalis/queries/zed/highlights.scm'));
  });

  it('chaque éditeur lance « humalis editeur --stdio »', () => {
    expect(lire('editeur/neovim/humalis.lua')).toContain("cmd = { 'humalis', 'editeur', '--stdio' }");
    expect(lire('editeur/helix/languages.toml')).toContain('command = "humalis"\nargs = ["editeur", "--stdio"]');
    expect(lire('editeur/emacs/humalis-mode.el')).toContain(`'("humalis" "editeur" "--stdio")`);
    expect(lire('editeur/sublime/Humalis/LSP-humalis.sublime-settings')).toContain('"command": ["humalis", "editeur", "--stdio"]');
    expect(lire('editeur/zed/src/lib.rs')).toContain('vec!["editeur".into(), "--stdio".into()]');
    expect(lire('editeur/jetbrains/src/main/kotlin/dev/humalis/intellij/HumalisServeur.kt')).toContain('"editeur", "--stdio"');
    expect(lire('editeur/visual-studio/Humalis.VisualStudio/HumalisServeur.cs')).toContain('editeur --stdio');
  });

  it('les numéros de version des extensions se suivent', () => {
    const zed = /^version = "([^"]+)"/m.exec(lire('editeur/zed/extension.toml'))?.[1];
    expect(/^version = "([^"]+)"/m.exec(lire('editeur/zed/Cargo.toml'))?.[1]).toBe(zed);
    expect(/^version=(.+)$/m.exec(lire('editeur/jetbrains/gradle.properties'))?.[1]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
