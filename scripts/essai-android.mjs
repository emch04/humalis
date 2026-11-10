#!/usr/bin/env node
/**
 * L'essai de bout en bout de la cible Android, sur un émulateur déjà lancé :
 * un vrai serveur Humalis, l'application construite par Gradle, puis le
 * parcours piloté par adb (lire le serveur, chercher, page réservée,
 * connexion, ajouter, confirmer et supprimer, session gardée au redémarrage).
 *
 * Il faut : le SDK Android (ANDROID_HOME), Gradle (sur le PATH, ou celui du
 * cache de Gradle) et un émulateur démarré (un seul à la fois), par exemple :
 *   $ANDROID_HOME/emulator/emulator -avd <nom> &
 *
 * HUMALIS_ESSAI_ANDROID : le dossier de travail.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as attendre } from 'node:timers/promises';
import { randomBytes } from 'node:crypto';

const racine = resolve(import.meta.dirname, '..');
const travail = process.env.HUMALIS_ESSAI_ANDROID ?? join(tmpdir(), 'humalis-essai-android');
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), 'Library/Android/sdk');
const adb = join(sdk, 'platform-tools/adb');
const PORT = 4990;
const ADMIN = 'admin@essai.test';
const MOT_DE_PASSE = 'Admin-Essai-2026!';
const IDENTIFIANT = 'local.humalis.taches';

/** Gradle : celui du PATH, sinon le plus récent du cache de Gradle. */
function gradle() {
  try {
    execFileSync('gradle', ['--version'], { stdio: 'ignore' });
    return 'gradle';
  } catch {
    const dists = join(homedir(), '.gradle/wrapper/dists');
    const trouve = existsSync(dists)
      ? readdirSync(dists)
          .filter((d) => /^gradle-9/.test(d))
          .sort()
          .reverse()
          .flatMap((d) => readdirSync(join(dists, d)).map((h) => join(dists, d, h, d.replace(/-bin$|-all$/, ''), 'bin/gradle')))
          .find(existsSync)
      : undefined;
    if (!trouve) throw new Error('Gradle est introuvable : installez-le, ou ouvrez une fois un projet Android dans Android Studio.');
    return trouve;
  }
}

const sortie = (commande, args, options = {}) => execFileSync(commande, args, { encoding: 'utf8', ...options });
const shell = (...args) => sortie(adb, ['shell', ...args]);

if (!sortie(adb, ['devices']).split('\n').slice(1).some((l) => /\tdevice$/.test(l))) {
  console.error(`Aucun émulateur n'est lancé : démarrez-en un (${join(sdk, 'emulator/emulator')} -avd <nom>), puis relancez l'essai.`);
  process.exit(1);
}

rmSync(travail, { recursive: true, force: true });
mkdirSync(travail, { recursive: true });
const source = join(racine, 'scripts/essais-android/taches.humalis');
const dossierServeur = join(travail, 'serveur');
const dossierApp = join(travail, 'android');
execFileSync('npm', ['run', 'build'], { cwd: racine, stdio: 'ignore' });
execFileSync('node', [join(racine, 'dist/cli.js'), 'compile', source, '--cible', 'serveur', '--sortie', dossierServeur], { stdio: 'ignore' });
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund'], { cwd: dossierServeur, stdio: 'ignore' });
execFileSync('npm', ['run', 'build'], { cwd: dossierServeur, stdio: 'ignore' });
execFileSync('node', [join(racine, 'dist/cli.js'), 'compile', source, '--cible', 'android', '--sortie', dossierApp, '--serveur', `http://localhost:${PORT}`], { stdio: 'ignore' });
writeFileSync(join(dossierApp, 'local.properties'), `sdk.dir=${sdk}\n`);
console.log('Construction de l\'application avec Gradle…');
execFileSync(gradle(), ['assembleDebug', '--console=plain', '-q'], { cwd: dossierApp, stdio: 'inherit' });

const serveur = spawn('node', ['--env-file-if-exists=.env', 'dist/src/demarrer.js'], {
  cwd: dossierServeur,
  stdio: 'ignore',
  env: { ...process.env, JWT_SECRET: randomBytes(32).toString('hex'), HUMALIS_ADMIN_EMAIL: ADMIN, HUMALIS_ADMIN_MOT_DE_PASSE: MOT_DE_PASSE, PORT: String(PORT) },
});

let echecs = 0;
const verifier = (ok, phrase) => {
  console.log(`${ok ? '✓' : '✗'} ${phrase}`);
  if (!ok) echecs++;
};

/** Les éléments à l'écran : leur texte et leur centre. */
function ecran() {
  shell('uiautomator', 'dump', '/sdcard/humalis-ecran.xml');
  const xml = shell('cat', '/sdcard/humalis-ecran.xml');
  return [...xml.matchAll(/<node [^>]*>/g)].flatMap(([n]) => {
    const texte = /\btext="([^"]*)"/.exec(n)?.[1];
    const b = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(n);
    if (!texte || !b) return [];
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    return [{ texte: texte.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'"), x: (x1 + x2) >> 1, y: (y1 + y2) >> 1 }];
  });
}
const textes = () => ecran().map((e) => e.texte);

/** Attend qu'un texte apparaisse (ou qu'un test sur les textes soit vrai), 10 secondes au plus. */
async function attendreQue(test) {
  const teste = typeof test === 'string' ? (t) => t.includes(test) : test;
  for (let i = 0; i < 20; i++) {
    if (teste(textes())) return true;
    await attendre(500);
  }
  return false;
}

async function toucher(texte, rang = 0) {
  const trouves = ecran().filter((e) => e.texte === texte);
  if (!trouves[rang]) throw new Error(`« ${texte} » n'est pas à l'écran (${textes().join(' | ')})`);
  shell('input', 'tap', String(trouves[rang].x), String(trouves[rang].y));
  await attendre(400);
}

async function ecrire(champ, texte) {
  await toucher(champ);
  // Le champ est vidé d'abord : fin du texte, puis effacement.
  shell('input', 'keyevent', 'KEYCODE_MOVE_END', ...Array(40).fill('KEYCODE_DEL'));
  // adb écrit une espace avec « %s » ; le reste est protégé pour le shell de l'émulateur.
  shell('input', 'text', `'${texte.replace(/ /g, '%s').replace(/'/g, '')}'`);
  shell('input', 'keyevent', '4');
  await attendre(300);
}

const lireServeur = async () => (await fetch(`http://localhost:${PORT}/api/taches`)).json();

for (let i = 0; i < 60; i++) {
  if (await fetch(`http://localhost:${PORT}/api/taches`).then((r) => r.ok, () => false)) break;
  await attendre(500);
}
// Une installation précédente garderait sa session : l'essai part d'une application neuve.
try {
  execFileSync(adb, ['uninstall', IDENTIFIANT], { stdio: 'ignore' });
} catch {
  // Rien à désinstaller.
}
execFileSync(adb, ['logcat', '-c']);

try {
  sortie(adb, ['install', '-r', join(dossierApp, 'app/build/outputs/apk/debug/app-debug.apk')]);
  shell('am', 'start', '-n', `${IDENTIFIANT}/.MainActivity`);

  verifier(await attendreQue('Acheter du pain'), 'la page d\'accueil lit les tâches du serveur au chargement');
  verifier(textes().includes('✓ Appeler le plombier'), '« si t.faite » montre la tâche faite autrement');
  verifier(textes().includes('2 tâches sur 2'), 'le calcul et le texte suivent la liste reçue');

  await ecrire('Chercher', 'pain');
  verifier(await attendreQue((t) => t.includes('1 tâches sur 2') && !t.includes('✓ Appeler le plombier')), '« ecrit dans » filtre la liste pendant la frappe');

  await toucher('Ajouter une tâche');
  verifier(await attendreQue('Se connecter'), 'la page réservée renvoie vers la connexion');
  await toucher('Se connecter');
  verifier(await attendreQue('Le champ « Email » est obligatoire.'), 'le formulaire vérifie ses champs avant l\'envoi');

  await ecrire('Email', ADMIN);
  await ecrire('Mot de passe', 'mauvais');
  await toucher('Se connecter');
  verifier(await attendreQue('Email ou mot de passe incorrect.'), 'un mauvais mot de passe est refusé, sans dire lequel est faux');

  await ecrire('Mot de passe', MOT_DE_PASSE);
  await toucher('Se connecter');
  verifier(await attendreQue('Nouvelle tâche'), 'après la connexion, « continuer vers » ramène à la page réservée');

  await ecrire('Titre', 'Arroser les plantes');
  await toucher('Enregistrer');
  verifier(await attendreQue('Tâche ajoutée'), 'l\'envoi réussit et le message s\'affiche');
  verifier((await lireServeur()).some((t) => t.titre === 'Arroser les plantes'), 'la tâche est enregistrée sur le serveur');
  verifier(await attendreQue((t) => t.filter((x) => x === 'Arroser les plantes').length === 1), 'la liste est relue, et le champ est vidé après l\'envoi');

  await toucher('Supprimer', 0);
  verifier(await attendreQue('Supprimer « Acheter du pain » ?'), '« confirmer » pose la question');
  await toucher('Non');
  verifier((await lireServeur()).some((t) => t.titre === 'Acheter du pain'), '« Non » ne supprime rien');
  await toucher('Supprimer', 0);
  await attendreQue('Oui');
  await toucher('Oui');
  verifier(await attendreQue((t) => !t.includes('Acheter du pain')), '« Oui » supprime la tâche, et la liste est relue');
  verifier(!(await lireServeur()).some((t) => t.titre === 'Acheter du pain'), 'la tâche est supprimée sur le serveur');

  shell('am', 'force-stop', IDENTIFIANT);
  shell('am', 'start', '-n', `${IDENTIFIANT}/.MainActivity`);
  await attendreQue('Ajouter une tâche');
  await toucher('Ajouter une tâche');
  verifier(await attendreQue('Nouvelle tâche'), 'la session est gardée au coffre : après un redémarrage, la page réservée s\'ouvre');

  const plantes = sortie(adb, ['logcat', '-d', '-s', 'AndroidRuntime:E']);
  verifier(!/FATAL EXCEPTION/.test(plantes), 'l\'application ne s\'est jamais arrêtée');
} catch (erreur) {
  verifier(false, String(erreur.message ?? erreur));
} finally {
  serveur.kill();
}
console.log(echecs ? `✗ ${echecs} échec(s)` : '✓ application Android');
process.exitCode = echecs ? 1 : 0;
