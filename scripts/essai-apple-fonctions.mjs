#!/usr/bin/env node
/**
 * Essaie pour de vrai les fonctions des exemples sur le simulateur iPhone :
 * langues, son, carte, fenêtres, minuteries, dates, filtres, sous-pages, thème.
 *
 *   node scripts/essai-apple-fonctions.mjs [Classe …]
 *
 * HUMALIS_ESSAI_APPLE : le dossier de travail.
 * HUMALIS_SIMULATEUR : le nom du simulateur.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

if (process.platform !== 'darwin') {
  console.log('Cet essai demande un Mac avec Xcode : rien à faire ici.');
  process.exit(0);
}

const racine = resolve(import.meta.dirname, '..');
const travail = join(process.env.HUMALIS_ESSAI_APPLE ?? join(tmpdir(), 'humalis-essai-apple'), 'fonctions');
const simulateur = process.env.HUMALIS_SIMULATEUR ?? 'iPhone 17 Pro';
const TOUS = { DeuxLangues: 'deux-langues', Medias: 'medias', Interactions: 'interactions', Inscription: 'inscription', Navigation: 'navigation', Vitrine: 'vitrine-complete' };
const choisis = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(TOUS);

mkdirSync(travail, { recursive: true });
execFileSync('npm', ['run', 'build'], { cwd: racine, stdio: 'ignore' });
spawnSync('xcrun', ['simctl', 'boot', simulateur]);
execFileSync('xcrun', ['simctl', 'bootstatus', simulateur, '-b'], { stdio: 'ignore' });

let echecs = 0;
for (const classe of choisis) {
  const exemple = TOUS[classe];
  const sortie = join(travail, exemple);
  rmSync(sortie, { recursive: true, force: true });
  execFileSync('node', [join(racine, 'dist/cli.js'), 'compile', join(racine, 'exemples', `${exemple}.humalis`), '--cible', 'apple', '--sortie', sortie, '--essais-ui', join(racine, 'scripts/essais-apple/Fonctions.swift')], { stdio: 'ignore' });
  const schema = exemple.split('-').map((m) => m[0].toUpperCase() + m.slice(1)).join('');
  const r = spawnSync('xcodebuild', ['-project', join(sortie, `${schema}.xcodeproj`), '-scheme', schema, '-destination', `platform=iOS Simulator,name=${simulateur}`, '-derivedDataPath', join(travail, 'derive', exemple), `-only-testing:${schema}Essais/${classe}`, 'test'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const texte = `${r.stdout}\n${r.stderr}`;
  const ok = r.status === 0 && texte.includes('** TEST SUCCEEDED **');
  console.log(`${ok ? '✓' : '✗'} ${classe}`);
  if (!ok) {
    echecs++;
    console.log([...new Set(texte.split('\n').filter((l) => /error:|XCTAssert/.test(l)))].slice(0, 6).join('\n').slice(0, 1400));
  }
}
spawnSync('xcrun', ['simctl', 'shutdown', simulateur]);
if (echecs > 0) process.exitCode = 1;
