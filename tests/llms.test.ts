import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../src/compilateur';
import { produireLlms } from '../scripts/generer-llms.mjs';

const contenu = readFileSync(new URL('../llms.txt', import.meta.url), 'utf8');

describe('guide des assistants', () => {
  it('est identique à la génération', () => {
    expect(contenu).toBe(produireLlms());
  });
  it('compile chaque bloc Humalis sans erreur', () => {
    const blocs = [...contenu.matchAll(/```humalis\n([\s\S]*?)\n```/g)];
    expect(blocs.length).toBeGreaterThan(0);
    for (const bloc of blocs) {
      const resultat = compiler(bloc[1]);
      expect(resultat.application, bloc[1]).toBeDefined();
      expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur'), bloc[1]).toEqual([]);
    }
  });
});
