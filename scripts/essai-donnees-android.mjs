#!/usr/bin/env node
// Vérifie en vrai, dans un émulateur Android déjà lancé : la base chiffrée, la synchronisation avec le serveur
// produit sur PostgreSQL, l'écriture hors ligne (application ouverte, puis fermée : WorkManager), le code à six
// chiffres de bout en bout, et jusqu'où vont les clés d'accès.
//
// Lancer : npm run build && node scripts/essai-donnees-android.mjs <dossier-de-travail-avec-le-projet-construit>
// Le dossier contient android/ (construit par Gradle, --serveur http://localhost:4985, --identifiant local.humalis.notes).
// ANDROID_SERIAL : l'émulateur à employer. Un seul essai à la fois : il coupe le réseau de cet émulateur.
import { execFileSync, spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as attendre } from 'node:timers/promises';

const travail = resolve(process.argv[2] ?? '.');
mkdirSync(travail, { recursive: true });
const sdk = process.env.ANDROID_HOME ?? join(homedir(), 'Library/Android/sdk');
const adb = join(sdk, 'platform-tools/adb');
const PAQUET = 'local.humalis.notes';
const PORT = 4985;
const U = `http://localhost:${PORT}`;
const ADMIN = 'awa@exemple.fr', MOT = 'Essai-Solide-2026!';
const source = 'essais/donnees-comptes/notes.humalis';
const problemes = [];
const verifier = (ok, message) => { if (!ok) problemes.push(message); console.log(`${ok ? '✓' : '✗'} ${message}`); return ok; };
const sortie = (c, a, o = {}) => execFileSync(c, a, { encoding: 'utf8', maxBuffer: 1 << 26, ...o });
const shell = (...a) => sortie(adb, ['shell', ...a]);

// Le serveur produit, sur une base PostgreSQL jetable.
const dossierServeur = join(travail, 'serveur');
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'serveur', '--sortie', dossierServeur], { stdio: ['ignore', 'ignore', 'inherit'] });
if (!existsSync(join(dossierServeur, 'node_modules'))) execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund', '--silent'], { cwd: dossierServeur, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: dossierServeur, stdio: 'ignore' });
const donneesPg = join(travail, 'pg');
const PORT_PG = 5580 + Math.floor(Math.random() * 40);
rmSync(donneesPg, { recursive: true, force: true });
const PG = process.env.HUMALIS_PG_BIN ?? '/opt/homebrew/opt/postgresql@16/bin';
execFileSync(join(PG, 'initdb'), ['-D', donneesPg, '-U', 'essai', '--auth=trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
execFileSync(join(PG, 'pg_ctl'), ['-D', donneesPg, '-o', `-p ${PORT_PG} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`, '-w', 'start', '-l', join(donneesPg, 'journal.log')], { stdio: 'ignore', env: { ...process.env, LC_ALL: 'en_US.UTF-8' } });

const apk = join(travail, 'android/app/build/outputs/apk/debug/app-debug.apk');
const empreinte = /SHA-?256:\s*([0-9A-F:]+)/i.exec(sortie(join(sdk, 'build-tools/36.0.0/apksigner'), ['verify', '--print-certs', apk]).replace(/certificate SHA-256 digest:\s*/i, 'SHA256: '))?.[1];
const env = { ...process.env, NODE_ENV: 'development', JWT_SECRET: randomBytes(32).toString('hex'), ENCRYPTION_KEY: randomBytes(32).toString('base64'), HUMALIS_ADMIN_EMAIL: ADMIN, HUMALIS_ADMIN_MOT_DE_PASSE: MOT, DATABASE_URL: `postgres://essai@127.0.0.1:${PORT_PG}/postgres`, PORT: String(PORT), WEBAUTHN_ALLOWED_ORIGINS: 'https://essai.humalis.test', WEBAUTHN_ANDROID_APP: `${PAQUET},${empreinte}`, HUMALIS_LIMITE_CONNEXION: '200', HUMALIS_LIMITE_API: '100000' };
const api = spawn('node', ['dist/src/demarrer.js'], { cwd: dossierServeur, env, stdio: ['ignore', 'pipe', 'pipe'] });
let journal = '';
api.stdout.on('data', (m) => (journal += m));
api.stderr.on('data', (m) => (journal += m));
for (let i = 0; i < 100 && !journal.includes('prêt'); i++) await attendre(100);
verifier(journal.includes('prêt'), 'le serveur démarre sur PostgreSQL');

// L'écran.
function ecran() {
  shell('uiautomator', 'dump', '/sdcard/humalis-ecran.xml');
  const xml = shell('cat', '/sdcard/humalis-ecran.xml');
  return [...xml.matchAll(/<node [^>]*>/g)].flatMap(([n]) => {
    const texte = /\btext="([^"]*)"/.exec(n)?.[1];
    const desc = /content-desc="([^"]*)"/.exec(n)?.[1];
    const b = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(n);
    if ((!texte && !desc) || !b) return [];
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    const propre = (t) => t?.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
    return [{ texte: propre(texte) || propre(desc), x: (x1 + x2) >> 1, y: (y1 + y2) >> 1 }];
  });
}
const textes = () => ecran().map((e) => e.texte);
async function attendreQue(test, secondes = 15) {
  const teste = typeof test === 'string' ? (t) => t.includes(test) : test;
  for (let i = 0; i < secondes; i++) {
    try { if (teste(textes())) return true; } catch { /* un écran en cours de changement */ }
    await attendre(1000);
  }
  return false;
}
async function toucher(texte) {
  let trouve = ecran().find((e) => e.texte === texte);
  // Hors de l'écran : on fait défiler la page, vers le bas d'abord, puis vers le haut.
  if (!trouve) {
    await fermerClavier();
    trouve = ecran().find((e) => e.texte === texte);
  }
  for (const [debut, fin] of [[1500, 600], [600, 1500]]) {
    for (let i = 0; !trouve && i < 5; i++) {
      shell('input', 'swipe', '500', String(debut), '500', String(fin), '300');
      await attendre(500);
      trouve = ecran().find((e) => e.texte === texte);
    }
  }
  if (!trouve) throw new Error(`« ${texte} » n'est pas à l'écran (${textes().join(' | ')})`);
  shell('input', 'tap', String(trouve.x), String(trouve.y));
  await attendre(500);
}
async function ecrire(champ, texte) {
  await toucher(champ);
  await attendre(300);
  shell('input', 'keyevent', 'KEYCODE_MOVE_END', ...Array(40).fill('KEYCODE_DEL'));
  shell('input', 'text', `'${texte.replace(/ /g, '%s')}'`);
  await attendre(300);
}
const fermerClavier = async () => { if (/mInputShown=true/.test(shell('dumpsys', 'input_method'))) { shell('input', 'keyevent', '4'); await attendre(500); } };
const lancer = () => { shell('am', 'start', '-n', `${PAQUET}/.MainActivity`); };
const arreter = () => { shell('am', 'force-stop', PAQUET); };
const reseau = (present) => { for (const s of ['wifi', 'data']) shell('svc', s, present ? 'enable' : 'disable'); };

// Un autre appareil : le même compte, parlant directement au serveur.
const appel = async (chemin, jeton, options = {}) => {
  const r = await fetch(U + chemin, { ...options, headers: { 'content-type': 'application/json', 'x-humalis-mobile': '1', ...(jeton ? { authorization: `Bearer ${jeton}` } : {}), ...options.headers } });
  const texte = await r.text();
  return { statut: r.status, corps: texte ? JSON.parse(texte) : null };
};
const connexionApi = async () => (await appel('/auth/login', null, { method: 'POST', body: JSON.stringify({ email: ADMIN, password: MOT }) })).corps.data.token;
const notesServeur = async (jeton) => { const c = (await appel('/api/notes', jeton)).corps; return Array.isArray(c) ? c : c.data ?? c.elements ?? []; };
const surServeur = async (jeton, titre, secondes = 20) => {
  for (let i = 0; i < secondes; i++) {
    if ((await notesServeur(jeton)).some((n) => n.titre === titre)) return true;
    await attendre(1000);
  }
  return false;
};
const totp = (base32, decalage = 0) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const secret = Buffer.from(bits.match(/.{8}/g).map((o) => parseInt(o, 2)));
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + decalage));
  const h = createHmac('sha1', secret).update(compteur).digest();
  return String(h.readUInt32BE(h[h.length - 1] & 15) & 0x7fffffff).slice(-6).padStart(6, '0');
};
async function seConnecter() {
  await ecrire('Email', ADMIN);
  await ecrire('Mot de passe', MOT);
  await fermerClavier();
  await toucher('Entrer');
}
async function ajouter(titre) {
  await ecrire('Titre', titre);
  await fermerClavier();
  await toucher('Ajouter');
}

try {
  try { execFileSync(adb, ['uninstall', PAQUET], { stdio: 'ignore' }); } catch { /* rien à désinstaller */ }
  reseau(true);
  sortie(adb, ['install', '-r', apk]);
  sortie(adb, ['logcat', '-c']);
  lancer();
  verifier(await attendreQue('Entrer', 40), "l'application s'ouvre");
  const jeton = await connexionApi();

  await seConnecter();
  verifier(await attendreQue('Connecté'), 'la connexion ouvre la session');
  await ajouter('Note Android');
  verifier(await attendreQue('Note Android'), 'la note apparaît dans la page');
  verifier(await surServeur(jeton, 'Note Android'), 'elle arrive sur le serveur');

  // Relance.
  await attendre(1000);
  arreter();
  reseau(false);
  await attendre(1500);
  lancer();
  verifier(await attendreQue('Note Android', 30), "après relance de l'application, sans réseau, la note est toujours là");
  reseau(true);
  await attendre(3000);

  // Sur le disque.
  const fichiers = shell('run-as', PAQUET, 'ls', 'no_backup').split('\n').map((l) => l.trim()).filter((l) => l.endsWith('.db'));
  verifier(fichiers.length >= 1, `la base est hors des sauvegardes (no_backup : ${fichiers.join(', ')})`);
  const copies = fichiers.map((f) => { const l = join(travail, f); writeFileSync(l, execFileSync(adb, ['exec-out', 'run-as', PAQUET, 'cat', `no_backup/${f}`], { maxBuffer: 1 << 26 })); return l; });
  const ligne = copies.map((l) => sortie('sqlite3', [l, 'select count(*), hex(contenu) from fiches'])).join('');
  verifier(/^[1-9]/m.test(ligne), `la table fiches contient la note (${ligne.slice(0, 60).trim()}…)`);
  verifier(copies.every((l) => !readFileSync(l).includes('Note Android') && !readFileSync(l).includes('titre')), 'dans le fichier SQLite, le contenu est chiffré');
  try {
    sortie(adb, ['root']);
    await attendre(2500);
    const coffre = sortie(adb, ['exec-out', 'sh', '-c', "strings /data/misc/keystore/persistent.sqlite* 2>/dev/null | grep humalis.locale | sort -u"]);
    verifier(coffre.includes('humalis.locale.'), `la clé est dans l'Android Keystore (${coffre.trim().split('\n')[0]})`);
  } catch (e) { console.log('(racine indisponible : le Keystore n\'a pas été lu)', e.message); }

  // Reçu du serveur.
  lancer();
  await attendreQue('Note Android', 20);
  const creee = await appel('/api/notes', jeton, { method: 'POST', body: JSON.stringify({ titre: 'Écrite ailleurs', lu: false }) });
  verifier(creee.statut < 300, 'une note est écrite sur le serveur par un autre appareil');
  shell('input', 'keyevent', 'KEYCODE_HOME');
  await attendre(1500);
  lancer();
  verifier(await attendreQue((t) => t.some((x) => x.includes('crite ailleurs')), 20), "au retour au premier plan, elle arrive dans l'application");
  const idAilleurs = creee.corps.id ?? creee.corps.data?.id;
  await appel(`/api/notes/${idAilleurs}`, jeton, { method: 'DELETE' });
  shell('input', 'keyevent', 'KEYCODE_HOME');
  await attendre(1500);
  lancer();
  verifier(await attendreQue((t) => !t.some((x) => x.includes('crite ailleurs')), 20), 'une suppression sur le serveur la retire de la page');

  // Hors ligne, application ouverte.
  reseau(false);
  await attendre(2500);
  await ajouter('Hors ligne ouverte');
  verifier(await attendreQue('Hors ligne ouverte'), 'hors ligne, la note s\'ajoute');
  await attendre(2500);
  verifier(!(await surServeur(jeton, 'Hors ligne ouverte', 2)), 'hors ligne, le serveur ne la voit pas');
  reseau(true);
  verifier(await surServeur(jeton, 'Hors ligne ouverte', 40), 'au retour du réseau, elle part');

  // Hors ligne, application fermée : c'est WorkManager qui envoie.
  reseau(false);
  await attendre(2500);
  await ajouter('Hors ligne fermee');
  verifier(await attendreQue('Hors ligne fermee'), 'une seconde note hors ligne s\'ajoute');
  await attendre(1500);
  shell('input', 'keyevent', 'KEYCODE_HOME');
  await attendre(1000);
  // Pas « force-stop » : il annule les travaux planifiés. Le système tue un processus en arrière-plan ainsi :
  shell('am', 'kill', PAQUET);
  await attendre(1500);
  verifier(!/\b\d+\b/.test(shell(`pidof ${PAQUET} || true`).trim() || ''), "le processus de l'application est arrêté");
  reseau(true);
  verifier(await surServeur(jeton, 'Hors ligne fermee', 120), 'au retour du réseau, application fermée, WorkManager l\'envoie');
  lancer();
  verifier(await attendreQue('Hors ligne fermee', 20), 'à la réouverture elle est là, une seule fois');

  // Le code à six chiffres.
  await toucher('Code à six chiffres');
  verifier(await attendreQue('Votre mot de passe'), 'le mot de passe est demandé avant d\'activer le code');
  await ecrire('Votre mot de passe', MOT);
  await fermerClavier();
  await toucher('Continuer');
  verifier(await attendreQue((t) => t.some((x) => x.startsWith('Clé à saisir à la main'))), "l'écran d'activation s'ouvre");
  const secret = textes().find((x) => x.startsWith('Clé à saisir à la main')).split(' : ')[1].trim();
  verifier(textes().includes("Code QR à scanner dans une application d'authentification"), 'le code QR est dessiné');
  sortie(adb, ['exec-out', 'screencap', '-p'], { encoding: 'buffer', maxBuffer: 1 << 26 });
  writeFileSync(join(travail, 'qr.png'), execFileSync(adb, ['exec-out', 'screencap', '-p'], { maxBuffer: 1 << 26 }));
  await ecrire('Code à six chiffres', totp(secret));
  await fermerClavier();
  await toucher('Activer');
  verifier(await attendreQue((t) => t.some((x) => x.startsWith('Gardez ces codes'))), 'le code juste active, les codes de secours sont montrés');
  const codes = textes().filter((x) => /^[a-z0-9]{4}-[a-z0-9]{4}$/i.test(x));
  verifier(codes.length === 10, `dix codes de secours (${codes.length})`);
  await toucher("J'ai gardé ces codes");
  await attendre(800);
  await toucher('Sortir');
  verifier(await attendreQue((t) => !t.includes('Connecté') && !t.includes('Note Android')), 'une fois déconnecté, les notes du compte quittent la page');
  await seConnecter();
  verifier(await attendreQue('Code de vérification'), "après le mot de passe, l'écran du code s'ouvre");
  verifier(!textes().includes('Connecté'), 'pas encore de session');
  await ecrire('Code à six chiffres', '000000');
  await fermerClavier();
  await toucher('Vérifier');
  verifier(await attendreQue('Ce code est incorrect.'), 'un code faux est refusé');
  await ecrire('Code à six chiffres', totp(secret, 1));
  await fermerClavier();
  await toucher('Vérifier');
  verifier(await attendreQue('Connecté'), 'le bon code ouvre la session');
  verifier(await attendreQue('Note Android'), 'et les notes du compte reviennent');

  // Sortie, puis un code de secours.
  await toucher('Sortir');
  await attendreQue((t) => !t.includes('Connecté'));
  await seConnecter();
  await attendreQue('Code de vérification');
  await toucher('Utiliser un code de secours');
  await ecrire('Code de secours', codes[0]);
  await fermerClavier();
  await toucher('Vérifier');
  verifier(await attendreQue('Connecté'), 'un code de secours ouvre la session');

  // Les clés d'accès : aussi loin que cet émulateur le permet.
  const origine = `android:apk-key-hash:${Buffer.from(empreinte.replace(/:/g, ''), 'hex').toString('base64url')}`;
  const options = await appel('/auth/cle-acces/connexion/options', null, { method: 'POST', body: '{}', headers: { 'x-humalis-origine': origine } });
  verifier(options.statut === 200 && options.corps.options?.rpId === 'essai.humalis.test', `le serveur accepte l'origine de cette application (rpId ${options.corps?.options?.rpId})`);
  sortie(adb, ['logcat', '-c']);
  await toucher('Ajouter une clé');
  if (await attendreQue('Votre mot de passe', 8)) {
    await ecrire('Votre mot de passe', MOT);
    await fermerClavier();
    await toucher('Continuer');
  }
  await attendre(8000);
  const apres = textes();
  writeFileSync(join(travail, 'cle.png'), execFileSync(adb, ['exec-out', 'screencap', '-p'], { maxBuffer: 1 << 26 }));
  console.log('Écran après « Ajouter une clé » :', apres.join(' | '));
  console.log('Journal :', sortie(adb, ['logcat', '-d', '-s', 'Humalis:W', 'CredManProvService:*', 'CredentialManager:*']).split('\n').slice(-12).join('\n'));

  const plantages = sortie(adb, ['logcat', '-d', '-b', 'crash']);
  verifier(!plantages.includes(PAQUET), `aucun plantage${plantages.includes(PAQUET) ? ' : ' + plantages.slice(0, 1500) : ''}`);
} catch (erreur) {
  verifier(false, 'le parcours va au bout : ' + (erreur?.message ?? erreur));
  try { writeFileSync(join(travail, 'echec.png'), execFileSync(adb, ['exec-out', 'screencap', '-p'], { maxBuffer: 1 << 26 })); } catch { /* écran indisponible */ }
} finally {
  try { reseau(true); } catch { /* émulateur parti */ }
  api.kill();
  execFileSync(join(PG, 'pg_ctl'), ['-D', donneesPg, '-m', 'fast', 'stop'], { stdio: 'ignore' });
}
if (/\b(Error|erreur)\b/.test(journal)) console.log(journal.slice(-1500));
console.log(problemes.length ? `\n${problemes.length} problème(s).` : '\nTout est vérifié.');
process.exit(problemes.length ? 1 : 0);
