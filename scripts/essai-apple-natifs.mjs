#!/usr/bin/env node
/**
 * Les composants natifs sur le simulateur iPhone.
 *
 * HUMALIS_ESSAI_APPLE : le dossier de travail. HUMALIS_SIMULATEUR : le simulateur.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as attendre } from 'node:timers/promises';

if (process.platform !== 'darwin') {
  console.log('Cet essai demande un Mac avec Xcode : rien à faire ici.');
  process.exit(0);
}
const racine = resolve(import.meta.dirname, '..');
const travail = join(process.env.HUMALIS_ESSAI_APPLE ?? join(tmpdir(), 'humalis-essai-apple'), 'natifs');
const simulateur = process.env.HUMALIS_SIMULATEUR ?? 'iPhone 17 Pro';
const apple = join(travail, 'apple');
mkdirSync(travail, { recursive: true });
rmSync(apple, { recursive: true, force: true });
execFileSync('npm', ['run', 'build'], { cwd: racine, stdio: 'ignore' });
execFileSync('node', [join(racine, 'dist/cli.js'), 'compile', join(racine, 'scripts/essais-apple/natifs.humalis'), '--cible', 'apple', '--sortie', apple, '--serveur', 'http://localhost:4990', '--essais-ui', join(racine, 'scripts/essais-apple/Natifs.swift')], { stdio: 'ignore' });

const essai = spawn('node', [join(racine, 'scripts/essais-apple/serveur-natifs.mjs')], { stdio: 'ignore' });
spawnSync('xcrun', ['simctl', 'boot', simulateur]);
execFileSync('xcrun', ['simctl', 'bootstatus', simulateur, '-b'], { stdio: 'ignore' });
spawnSync('xcrun', ['simctl', 'uninstall', simulateur, 'local.humalis.natifs']);

const fin = await new Promise((f) => {
  const p = spawn('xcodebuild', ['-project', join(apple, 'Natifs.xcodeproj'), '-scheme', 'Natifs', '-destination', `platform=iOS Simulator,name=${simulateur}`, '-collect-test-diagnostics', 'never', '-derivedDataPath', join(travail, 'derive'), 'test']);
  let sortie = '';
  p.stdout.on('data', (d) => { sortie += d; });
  p.stderr.on('data', (d) => { sortie += d; });
  p.on('close', (code) => f({ code, sortie }));
});
essai.kill();
await attendre(200);
spawnSync('xcrun', ['simctl', 'shutdown', simulateur]);
const ok = fin.code === 0 && fin.sortie.includes('** TEST SUCCEEDED **');
console.log(ok ? '✓ natifs' : '✗ natifs');
if (!ok) {
  console.log([...new Set(fin.sortie.split('\n').filter((l) => /error:|failed -/.test(l)))].slice(0, 10).join('\n').slice(0, 2400));
  process.exitCode = 1;
}
