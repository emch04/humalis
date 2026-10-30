import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decouvrirTests, lireCasTests } from '../../src/outils/tests.js';

it('découvre les tests dans un ordre stable', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'humalis-tests-'));
  try {
    mkdirSync(join(dossier, 'tests'));
    writeFileSync(join(dossier, 'tests', 'z.test.humalis'), '');
    writeFileSync(join(dossier, 'tests', 'a.test.humalis'), '');
    writeFileSync(join(dossier, 'tests', 'ignore.humalis'), '');
    expect(decouvrirTests(dossier).map((f) => f.split('/').at(-1))).toEqual(['a.test.humalis', 'z.test.humalis']);
  } finally { rmSync(dossier, { recursive: true, force: true }); }
});

it('lit les cas du vrai parser et leurs lignes', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'humalis-cas-'));
  try {
    const fichier = join(dossier, 'accueil.test.humalis');
    writeFileSync(fichier, 'test "bonjour" de page "accueil" :\n    cliquer sur "Dire bonjour"\n    verifier que texte "Bonjour !" est visible\n');
    expect(lireCasTests(fichier)).toMatchObject([{ nom: 'bonjour', page: 'accueil', ligne: 1, etapes: [{ type: 'Cliquer', ligne: 2 }, { type: 'VerifierTexteVisible', ligne: 3 }] }]);
  } finally { rmSync(dossier, { recursive: true, force: true }); }
});
