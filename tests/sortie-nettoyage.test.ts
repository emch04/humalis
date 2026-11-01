import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retirerAnciensProduits } from '../src/outils/ecriture.js';

describe('dossier de sortie', () => {
  it('retire ce que Humalis ne produit plus et garde tout le reste', () => {
    const sortie = mkdtempSync(join(tmpdir(), 'humalis-sortie-'));
    const dehors = `${sortie}-dehors.txt`;
    try {
      mkdirSync(join(sortie, 'src/pages/vieux'), { recursive: true });
      mkdirSync(join(sortie, 'public'));
      for (const f of ['src/pages/A.tsx', 'src/pages/vieux/B.tsx', 'public/photo.jpg']) writeFileSync(join(sortie, f), 'x');
      writeFileSync(dehors, 'x');

      retirerAnciensProduits(sortie, new Map([['src/pages/A.tsx', ''], ['src/pages/vieux/B.tsx', '']]));
      writeFileSync(join(sortie, '.humalis-fichiers.json'), JSON.stringify(['src/pages/A.tsx', 'src/pages/vieux/B.tsx', `../${dehors.split('/').pop()}`]));
      retirerAnciensProduits(sortie, new Map([['src/pages/A.tsx', '']]));

      expect(existsSync(join(sortie, 'src/pages/A.tsx'))).toBe(true);
      expect(existsSync(join(sortie, 'src/pages/vieux'))).toBe(false);
      expect(existsSync(join(sortie, 'public/photo.jpg'))).toBe(true);
      // Une liste modifiée à la main ne fait jamais sortir du dossier.
      expect(existsSync(dehors)).toBe(true);
    } finally {
      rmSync(sortie, { recursive: true, force: true });
      rmSync(dehors, { force: true });
    }
  });
});
