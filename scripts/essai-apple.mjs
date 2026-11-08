#!/usr/bin/env node
/**
 * L'essai en vrai de la cible Apple (sur un Mac, avec Xcode) : chaque exemple
 * est compilé, construit pour iPhone et pour Mac, lancé, puis on vérifie qu'il
 * tourne encore après quelques secondes. Une capture de l'iPhone est gardée.
 *
 *   node scripts/essai-apple.mjs [nom-d-exemple …]
 *
 * HUMALIS_ESSAI_APPLE : le dossier de travail (il grossit : mettez-le sur un disque qui a de la place).
 * HUMALIS_SIMULATEUR : le nom du simulateur (« iPhone 17 Pro » par défaut).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { setTimeout as attendre } from 'node:timers/promises';

if (process.platform !== 'darwin') {
  console.log('Cet essai demande un Mac avec Xcode : rien à faire ici.');
  process.exit(0);
}

const racine = resolve(import.meta.dirname, '..');
const travail = process.env.HUMALIS_ESSAI_APPLE ?? join(tmpdir(), 'humalis-essai-apple');
const simulateur = process.env.HUMALIS_SIMULATEUR ?? 'iPhone 17 Pro';
const noms = process.argv.slice(2);
const dossierExemples = join(racine, 'exemples');
const exemples = (noms.length ? noms.map((n) => `${n}.humalis`) : readdirSync(dossierExemples).filter((f) => f.endsWith('.humalis'))).map((f) => join(dossierExemples, f));

mkdirSync(travail, { recursive: true });
execFileSync('npm', ['run', 'build'], { cwd: racine, stdio: 'ignore' });
const cli = join(racine, 'dist/cli.js');

const appareils = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], { encoding: 'utf8', maxBuffer: 1 << 24 })).devices;
const appareil = Object.values(appareils).flat().find((d) => d.name === simulateur);
if (!appareil) {
  console.error(`Le simulateur « ${simulateur} » n'existe pas.`);
  process.exit(1);
}
spawnSync('xcrun', ['simctl', 'boot', appareil.udid]);
execFileSync('xcrun', ['simctl', 'bootstatus', appareil.udid, '-b'], { stdio: 'ignore' });

/** Les erreurs de xcodebuild, ou null si la construction a réussi. */
function construire(projet, schema, destination, derive) {
  const r = spawnSync('xcodebuild', ['-project', projet, '-scheme', schema, '-destination', destination, '-derivedDataPath', derive, 'build'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status === 0) return null;
  const lignes = `${r.stdout}\n${r.stderr}`.split('\n').filter((l) => l.includes('error:'));
  return [...new Set(lignes)].slice(0, 12).join('\n') || 'échec sans message';
}

const bilan = [];
for (const fichier of exemples) {
  const nom = basename(fichier, '.humalis');
  const sortie = join(travail, 'projets', nom);
  rmSync(sortie, { recursive: true, force: true });
  const compilation = spawnSync('node', [cli, 'compile', fichier, '--cible', 'apple', '--sortie', sortie], { encoding: 'utf8' });
  if (compilation.status !== 0) {
    const raison = compilation.stderr.split('\n').find((l) => l.startsWith('Erreur')) ?? compilation.stderr.split('\n').find((l) => l.includes('aucune page')) ?? 'refusé';
    bilan.push({ nom, etat: 'refusé clairement', detail: raison });
    console.log(`— ${nom} : refusé clairement. ${raison}`);
    continue;
  }
  const projet = readdirSync(sortie).find((f) => f.endsWith('.xcodeproj'));
  const schema = basename(projet, '.xcodeproj');
  const derive = join(travail, 'derive', nom);
  const chemin = join(sortie, projet);

  const iphone = construire(chemin, schema, `platform=iOS Simulator,id=${appareil.udid}`, derive);
  const mac = construire(chemin, schema, 'platform=macOS', derive);
  if (iphone || mac) {
    bilan.push({ nom, etat: 'ÉCHEC', detail: iphone ?? mac });
    console.log(`✗ ${nom} : la construction a échoué\n${iphone ?? mac}`);
    continue;
  }

  // iPhone : lancé, et toujours là après quelques secondes.
  const appIphone = join(derive, 'Build/Products/Debug-iphonesimulator', `${schema}.app`);
  execFileSync('xcrun', ['simctl', 'install', appareil.udid, appIphone]);
  const identifiant = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print CFBundleIdentifier', join(appIphone, 'Info.plist')], { encoding: 'utf8' }).trim();
  spawnSync('xcrun', ['simctl', 'terminate', appareil.udid, identifiant]);
  execFileSync('xcrun', ['simctl', 'launch', appareil.udid, identifiant], { stdio: 'ignore' });
  await attendre(5000);
  const liste = execFileSync('xcrun', ['simctl', 'spawn', appareil.udid, 'launchctl', 'list'], { encoding: 'utf8' });
  const iphoneVivant = liste.split('\n').some((l) => l.includes(identifiant) && /^\d+/.test(l));
  mkdirSync(join(travail, 'captures'), { recursive: true });
  // Le simulateur n'écrit pas toujours sur un disque externe : la capture passe par le dossier temporaire.
  const capture = join(tmpdir(), `humalis-capture-${nom}.png`);
  spawnSync('xcrun', ['simctl', 'io', appareil.udid, 'screenshot', capture]);
  if (existsSync(capture)) cpSync(capture, join(travail, 'captures', `${nom}.png`));
  spawnSync('xcrun', ['simctl', 'terminate', appareil.udid, identifiant]);

  // Mac : lancé directement, et toujours là après quelques secondes.
  const appMac = join(derive, 'Build/Products/Debug', `${schema}.app`);
  const executable = join(appMac, 'Contents/MacOS', schema);
  spawnSync('open', ['-g', appMac]);
  await attendre(4000);
  const macVivant = spawnSync('pgrep', ['-f', executable]).status === 0;
  spawnSync('pkill', ['-f', executable]);

  const ok = iphoneVivant && macVivant;
  bilan.push({ nom, etat: ok ? 'ok' : 'ÉCHEC', detail: ok ? '' : `iPhone : ${iphoneVivant ? 'tourne' : 'arrêté'}, Mac : ${macVivant ? 'tourne' : 'arrêté'}` });
  console.log(`${ok ? '✓' : '✗'} ${nom} : iPhone ${iphoneVivant ? 'tourne' : 'ARRÊTÉ'}, Mac ${macVivant ? 'tourne' : 'ARRÊTÉ'}`);
}

// Le simulateur s'éteint à la fin : il occupe beaucoup de mémoire.
spawnSync('xcrun', ['simctl', 'shutdown', appareil.udid]);

const echecs = bilan.filter((b) => b.etat === 'ÉCHEC');
console.log(`\n${bilan.filter((b) => b.etat === 'ok').length} construits et lancés, ${bilan.filter((b) => b.etat === 'refusé clairement').length} refusés clairement, ${echecs.length} en échec. Captures : ${join(travail, 'captures')}`);
if (echecs.length > 0) process.exitCode = 1;
