#!/usr/bin/env node
/**
 * Rôles, temps réel, IA et paiement sur iPhone : un vrai serveur Humalis pour les
 * deux premiers, un serveur d'essai pour les deux autres (ils demandent des clés).
 *
 * HUMALIS_ESSAI_APPLE : le dossier de travail. HUMALIS_SIMULATEUR : le simulateur.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as attendre } from 'node:timers/promises';

if (process.platform !== 'darwin') {
  console.log('Cet essai demande un Mac avec Xcode : rien à faire ici.');
  process.exit(0);
}
const racine = resolve(import.meta.dirname, '..');
const travail = join(process.env.HUMALIS_ESSAI_APPLE ?? join(tmpdir(), 'humalis-essai-apple'), 'capacites');
const simulateur = process.env.HUMALIS_SIMULATEUR ?? 'iPhone 17 Pro';
const programme = join(racine, 'scripts/essais-apple/capacites.humalis');
const cli = join(racine, 'dist/cli.js');
const serveur = join(travail, 'serveur');
const apple = join(travail, 'apple');

mkdirSync(travail, { recursive: true });
rmSync(apple, { recursive: true, force: true });
execFileSync('npm', ['run', 'build'], { cwd: racine, stdio: 'ignore' });
execFileSync('node', [cli, 'compile', programme, '--cible', 'serveur', '--sortie', serveur], { stdio: 'ignore' });
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund'], { cwd: serveur, stdio: 'ignore' });
execFileSync('npm', ['run', 'build'], { cwd: serveur, stdio: 'ignore' });
execFileSync('node', [cli, 'compile', programme, '--cible', 'apple', '--sortie', apple, '--serveur', 'http://localhost:4977', '--essais-ui', join(racine, 'scripts/essais-apple/Capacites.swift')], { stdio: 'ignore' });
writeFileSync(join(serveur, '.env'), [`JWT_SECRET=${randomBytes(32).toString('hex')}`, 'HUMALIS_ADMIN_EMAIL=admin@essai.test', 'HUMALIS_ADMIN_MOT_DE_PASSE=Admin-Essai-2026!', 'PORT=4977', 'STRIPE_CLE_SECRETE=sk_test_essai', 'STRIPE_SECRET_WEBHOOK=whsec_essai', 'HUMALIS_ADRESSE_SITE=http://localhost:4977'].join('\n') + '\n');

const vrai = spawn('node', ['--env-file-if-exists=.env', 'dist/src/demarrer.js'], { cwd: serveur, stdio: 'ignore' });
const essai = spawn('node', [join(racine, 'scripts/essais-apple/serveur-ia-paiement.mjs')], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) {
  if (await fetch('http://localhost:4977/api/produits').then((r) => r.ok, () => false)) break;
  await attendre(500);
}
spawnSync('xcrun', ['simctl', 'boot', simulateur]);
execFileSync('xcrun', ['simctl', 'bootstatus', simulateur, '-b'], { stdio: 'ignore' });
spawnSync('xcrun', ['simctl', 'uninstall', simulateur, 'local.humalis.capacites']);
const r = spawnSync('xcodebuild', ['-project', join(apple, 'Capacites.xcodeproj'), '-scheme', 'Capacites', '-destination', `platform=iOS Simulator,name=${simulateur}`, '-derivedDataPath', join(travail, 'derive'), 'test'], { encoding: 'utf8', maxBuffer: 1 << 28 });
vrai.kill();
essai.kill();
spawnSync('xcrun', ['simctl', 'shutdown', simulateur]);
const sortie = `${r.stdout}\n${r.stderr}`;
const ok = r.status === 0 && sortie.includes('** TEST SUCCEEDED **');
console.log(ok ? '✓ capacités' : '✗ capacités');
if (!ok) {
  console.log([...new Set(sortie.split('\n').filter((l) => /error:|failed -/.test(l)))].slice(0, 10).join('\n').slice(0, 2400));
  process.exitCode = 1;
}
