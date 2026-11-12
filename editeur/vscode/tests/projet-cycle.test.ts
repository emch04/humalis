import { describe, expect, it } from 'vitest';
import { principalQuiUtilise } from '../src/langage/projet.js';

/** Revue Codex : deux fichiers qui s'utilisent l'un l'autre faisaient chercher la racine sans fin. */
describe('le fichier principal d’un projet', () => {
  it('s’arrête sur deux fichiers qui s’utilisent l’un l’autre', () => {
    const fichiers = new Map([
      ['/p/a.humalis', 'utiliser fichier "b.humalis"\n\npage "a" :\n    titre "A"\n'],
      ['/p/b.humalis', 'utiliser fichier "a.humalis"\n\npage "b" :\n    titre "B"\n'],
    ]);
    let lectures = 0;
    const lire = (chemin: string) => {
      lectures += 1;
      return fichiers.get(chemin);
    };
    const principal = principalQuiUtilise('/p/a.humalis', lire, () => ['a.humalis', 'b.humalis']);
    expect(['/p/a.humalis', '/p/b.humalis', undefined]).toContain(principal);
    expect(lectures).toBeLessThan(50);
  });
});
