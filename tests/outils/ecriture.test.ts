import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { ecrireSiChange } from '../../src/outils/ecriture.js';

const dossiers: string[] = [];
afterEach(() => { for (const dossier of dossiers.splice(0)) rmSync(dossier, { recursive: true, force: true }); });

it('conserve le fichier identique, son inode et sa date de modification', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'humalis-ecriture-'));
  dossiers.push(dossier);
  const fichier = join(dossier, 'vite.config.ts');
  writeFileSync(fichier, 'export default {}\n');
  const avant = statSync(fichier);
  expect(ecrireSiChange(fichier, 'export default {}\n')).toBe(false);
  const apres = statSync(fichier);
  expect([apres.ino, apres.mtimeMs]).toEqual([avant.ino, avant.mtimeMs]);
  expect(readFileSync(fichier, 'utf8')).toBe('export default {}\n');
});

it('écrit un fichier nouveau puis actualise uniquement un contenu différent', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'humalis-ecriture-'));
  dossiers.push(dossier);
  const fichier = join(dossier, 'src', 'pages', 'Accueil.tsx');
  expect(ecrireSiChange(fichier, 'ancien')).toBe(true);
  expect(ecrireSiChange(fichier, 'nouveau')).toBe(true);
  expect(readFileSync(fichier, 'utf8')).toBe('nouveau');
});

it('une modification du texte ne touche que la page web produite', async () => {
  const { compiler } = await import('../../src/compilateur.js');
  const { genererProjetWeb } = await import('../../src/cibles/web/projet.js');
  const dossier = mkdtempSync(join(tmpdir(), 'humalis-pages-'));
  dossiers.push(dossier);
  const produire = (texte: string) => {
    const application = compiler(`page "accueil" :\n    titre "Titre stable"\n    texte "${texte}"\n`).application!;
    const fichiers = genererProjetWeb(application, { nom: 'essai', source: 'essai.humalis', adresse: 'http://localhost' });
    return [...fichiers].filter(([nom, contenu]) => ecrireSiChange(join(dossier, nom), contenu)).map(([nom]) => nom);
  };
  const premiers = produire('Avant');
  expect(premiers).toContain('src/pages/Accueil.tsx');
  const configuration = statSync(join(dossier, 'vite.config.ts'));
  const index = statSync(join(dossier, 'index.html'));
  expect(produire('Avant')).toEqual([]);
  expect(produire('Après')).toEqual(['src/pages/Accueil.tsx']);
  expect([statSync(join(dossier, 'vite.config.ts')).ino, statSync(join(dossier, 'vite.config.ts')).mtimeMs])
    .toEqual([configuration.ino, configuration.mtimeMs]);
  expect([statSync(join(dossier, 'index.html')).ino, statSync(join(dossier, 'index.html')).mtimeMs])
    .toEqual([index.ino, index.mtimeMs]);
});
