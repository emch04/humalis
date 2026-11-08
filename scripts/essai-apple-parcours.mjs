#!/usr/bin/env node
/**
 * Le parcours de A à Z de la cible Apple, en vrai : exemples/magasin-complet.humalis
 * donne un serveur et une application ; le serveur démarre, et XCUITest joue le
 * parcours (connexion, formulaires, panier, commande) sur iPhone, iPad et Mac.
 *
 *   node scripts/essai-apple-parcours.mjs [iphone] [ipad] [mac]
 *
 * HUMALIS_ESSAI_APPLE : le dossier de travail.
 * HUMALIS_SIMULATEUR, HUMALIS_SIMULATEUR_IPAD : les noms des simulateurs.
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
const travail = join(process.env.HUMALIS_ESSAI_APPLE ?? join(tmpdir(), 'humalis-essai-apple'), 'parcours');
const demandes = process.argv.slice(2);
const cibles = {
  iphone: `platform=iOS Simulator,name=${process.env.HUMALIS_SIMULATEUR ?? 'iPhone 17 Pro'}`,
  ipad: `platform=iOS Simulator,name=${process.env.HUMALIS_SIMULATEUR_IPAD ?? 'iPad Pro 13 essai'}`,
  mac: 'platform=macOS',
};
const choisies = demandes.length ? demandes : Object.keys(cibles);
const PORT = 4977;

rmSync(join(travail, 'apple'), { recursive: true, force: true });
mkdirSync(travail, { recursive: true });
if (!process.env.HUMALIS_ESSAI_SANS_CONSTRUCTION) execFileSync('npm', ['run', 'build'], { cwd: racine, stdio: 'ignore' });
const cli = process.env.HUMALIS_CLI ?? join(racine, 'dist/cli.js');
const exemple = join(racine, 'exemples/magasin-complet.humalis');
const serveur = join(travail, 'serveur');
const apple = join(travail, 'apple');

execFileSync('node', [cli, 'compile', exemple, '--cible', 'serveur', '--sortie', serveur], { stdio: 'ignore' });
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund'], { cwd: serveur, stdio: 'ignore' });
execFileSync('npm', ['run', 'build'], { cwd: serveur, stdio: 'ignore' });
execFileSync('node', [cli, 'compile', exemple, '--cible', 'apple', '--sortie', apple, '--serveur', `http://localhost:${PORT}`, '--essais-ui', join(racine, 'scripts/essais-apple/ParcoursMagasin.swift')], { stdio: 'ignore' });
writeFileSync(join(serveur, '.env'), [`JWT_SECRET=${randomBytes(32).toString('hex')}`, 'HUMALIS_ADMIN_EMAIL=admin@essai.test', 'HUMALIS_ADMIN_MOT_DE_PASSE=Admin-Essai-2026!', `PORT=${PORT}`].join('\n') + '\n');

const bilan = [];
for (const nom of choisies) {
  // Un serveur neuf et une application neuve pour chaque appareil : les données sont en mémoire.
  spawnSync('pkill', ['-f', 'dist/src/demarrer.js']);
  await attendre(500);
  const processus = spawn('node', ['--env-file-if-exists=.env', 'dist/src/demarrer.js'], { cwd: serveur, stdio: 'ignore' });
  // Le serveur doit répondre avant que l'application ne l'appelle.
  for (let i = 0; i < 60; i++) {
    if (await fetch(`http://localhost:${PORT}/api/produits`).then((r) => r.ok, () => false)) break;
    await attendre(500);
  }
  if (nom !== 'mac') {
    const appareil = cibles[nom].split('name=')[1];
    spawnSync('xcrun', ['simctl', 'boot', appareil]);
    execFileSync('xcrun', ['simctl', 'bootstatus', appareil, '-b'], { stdio: 'ignore' });
    spawnSync('xcrun', ['simctl', 'uninstall', appareil, 'local.humalis.magasin-complet']);
  } else {
    // Le Mac aussi repart de zéro : le panier gardé par un essai précédent fausserait celui-ci.
    spawnSync('defaults', ['delete', 'local.humalis.magasin-complet']);
  }
  const r = spawnSync('xcodebuild', ['-project', join(apple, 'MagasinComplet.xcodeproj'), '-scheme', 'MagasinComplet', '-destination', cibles[nom], '-derivedDataPath', join(travail, 'derive'), '-resultBundlePath', join(travail, `resultat-${nom}-${Date.now()}`), 'test'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  processus.kill();
  // Un seul simulateur à la fois : celui-ci s'éteint avant le suivant.
  if (nom !== 'mac') spawnSync('xcrun', ['simctl', 'shutdown', cibles[nom].split('name=')[1]]);
  const sortie = `${r.stdout}\n${r.stderr}`;
  const ok = r.status === 0 && sortie.includes('** TEST SUCCEEDED **');
  bilan.push({ nom, ok });
  console.log(`${ok ? '✓' : '✗'} ${nom}`);
  if (!ok) console.log([...new Set(sortie.split('\n').filter((l) => /error:|XCTAssert|failed -|Testing failed/.test(l)))].slice(0, 12).join('\n').slice(0, 3000));
}
spawnSync('pkill', ['-f', 'dist/src/demarrer.js']);
if (bilan.some((b) => !b.ok)) process.exitCode = 1;
