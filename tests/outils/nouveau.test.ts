import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creerProjet } from '../../src/outils/nouveau.js';
import { compilerProjet } from '../../src/fichiers.js';
import { lireCasTests } from '../../src/outils/tests.js';

describe('nouveau', () => {
  it('crée le manifeste, la page, le style, le test et le guide', () => {
    const racine = mkdtempSync(join(tmpdir(), 'humalis-nouveau-'));
    try {
      const dossier = creerProjet(racine, 'Bonjour');
      expect(JSON.parse(readFileSync(join(dossier, 'humalis.projet.json'), 'utf8'))).toEqual({ principal: 'Bonjour.humalis' });
      for (const fichier of ['Bonjour.humalis', 'theme.css', 'LISEZMOI.md', '.gitignore', 'tests/accueil.test.humalis']) {
        expect(readFileSync(join(dossier, fichier), 'utf8').length).toBeGreaterThan(20);
      }
      const resultat = compilerProjet(join(dossier, 'Bonjour.humalis'), (chemin) => readFileSync(chemin, 'utf8'));
      expect(resultat.application?.ecrans.map((page) => page.nom)).toEqual(['accueil']);
      expect(lireCasTests(join(dossier, 'tests/accueil.test.humalis')).map((test) => test.nom)).toEqual(["la page d'accueil présente le site", 'le bouton dit bonjour']);
      expect(() => creerProjet(racine, 'Bonjour')).toThrow();
      expect(() => creerProjet(racine, '../danger')).toThrow();
    } finally { rmSync(racine, { recursive: true, force: true }); }
  });
});
