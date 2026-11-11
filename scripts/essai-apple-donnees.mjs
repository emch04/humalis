#!/usr/bin/env node
/**
 * Les données sur l'appareil et le code à six chiffres sur iPhone, en vrai : le serveur produit sur un
 * vrai PostgreSQL, l'application produite dans le simulateur, jouée par XCUITest. Un relais coupe et
 * rétablit le serveur ; le script lit le disque de l'application pour vérifier le chiffrement.
 *
 *   npm run build && node scripts/essai-apple-donnees.mjs [dossier-de-travail]
 *
 * HUMALIS_EQUIPE : l'équipe Apple pour signer ; HUMALIS_XCODEBUILD : des réglages de plus pour xcodebuild.
 * HUMALIS_SIMULATEUR : le nom du simulateur. HUMALIS_SIMULATEUR_LIBRE=1 : en prendre un déjà allumé qui ne sert à personne.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { createServer, request } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

if (process.platform !== 'darwin') {
  console.log('Cet essai demande un Mac avec Xcode : rien à faire ici.');
  process.exit(0);
}

const racine = resolve(import.meta.dirname, '..');
const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-apple-donnees'));
mkdirSync(travail, { recursive: true });
const cli = join(racine, 'dist/cli.js');
const source = join(racine, 'essais/donnees-comptes/notes.humalis');
const appareil = process.env.HUMALIS_SIMULATEUR ?? 'iPhone 17 Pro';
const identifiant = 'local.humalis.essai-notes';
const equipe = process.env.HUMALIS_EQUIPE;
const ADMIN = 'awa@exemple.fr';
const MOT = 'Essai-Solide-2026!';
const PORT_RELAIS = 4978;
const PORT_API = 4979;
const RELAIS = `http://localhost:${PORT_RELAIS}`;

const dejaAllume = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted'], { encoding: 'utf8' }).includes('Booted');
// Un simulateur déjà allumé sert peut-être à une autre session : on ne le prend que si on nous dit qu'il est libre, et on le laisse allumé.
if (dejaAllume && !process.env.HUMALIS_SIMULATEUR_LIBRE) {
  console.log('Un simulateur est déjà allumé : il sert peut-être à une autre session. Attendez qu\'il s\'éteigne, ou réglez HUMALIS_SIMULATEUR_LIBRE=1 s\'il est libre.');
  process.exit(2);
}

const dossierServeur = join(travail, 'serveur');
execFileSync('node', [cli, 'compile', source, '--cible', 'serveur', '--sortie', dossierServeur], { stdio: ['ignore', 'ignore', 'inherit'] });
if (!existsSync(join(dossierServeur, 'node_modules'))) execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund', '--silent'], { cwd: dossierServeur, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: dossierServeur, stdio: 'ignore' });

const dossierApple = join(travail, 'apple');
rmSync(dossierApple, { recursive: true, force: true });
execFileSync('node', [cli, 'compile', source, '--cible', 'apple', '--sortie', dossierApple, '--serveur', RELAIS, '--identifiant', identifiant, ...(equipe ? ['--equipe', equipe] : []), '--essais-ui', join(racine, 'scripts/essais-apple/ParcoursDonnees.swift')], { stdio: ['ignore', 'ignore', 'inherit'] });

// PostgreSQL : une base jetable.
const donneesPg = join(travail, 'pg');
const PORT_PG = 5580 + Math.floor(Math.random() * 40);
rmSync(donneesPg, { recursive: true, force: true });
const PG = process.env.HUMALIS_PG_BIN ?? '/opt/homebrew/opt/postgresql@16/bin';
execFileSync(join(PG, 'initdb'), ['-D', donneesPg, '-U', 'essai', '--auth=trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
execFileSync(join(PG, 'pg_ctl'), ['-D', donneesPg, '-o', `-p ${PORT_PG} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`, '-w', 'start', '-l', join(donneesPg, 'journal.log')], { stdio: 'ignore', env: { ...process.env, LC_ALL: 'en_US.UTF-8' } });

const env = { ...process.env, NODE_ENV: 'development', JWT_SECRET: randomBytes(32).toString('hex'), ENCRYPTION_KEY: randomBytes(32).toString('base64'), HUMALIS_ADMIN_EMAIL: ADMIN, HUMALIS_ADMIN_MOT_DE_PASSE: MOT, DATABASE_URL: `postgres://essai@127.0.0.1:${PORT_PG}/postgres`, PORT: String(PORT_API), WEBAUTHN_ALLOWED_ORIGINS: process.env.HUMALIS_ESSAI_ORIGINE ?? 'https://essai.humalis.test', HUMALIS_LIMITE_CONNEXION: '200', HUMALIS_LIMITE_API: '100000' };
const api = spawn('node', ['dist/src/demarrer.js'], { cwd: dossierServeur, env, stdio: ['ignore', 'pipe', 'pipe'] });
let journal = '';
api.stdout.on('data', (m) => (journal += m));
api.stderr.on('data', (m) => (journal += m));
for (let i = 0; i < 100 && !journal.includes('prêt'); i++) await new Promise((ok) => setTimeout(ok, 100));
if (!journal.includes('prêt')) console.log(`Le serveur n'a pas démarré :\n${journal}`);

// La session du script, ouverte avant que le compte n'ait le code.
const API = `http://127.0.0.1:${PORT_API}`;
const ouverture = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-humalis-mobile': '1' }, body: JSON.stringify({ email: ADMIN, password: MOT }) });
const jeton = (await ouverture.json()).data.token;
const entetes = { 'content-type': 'application/json', 'x-humalis-mobile': '1', authorization: `Bearer ${jeton}` };

function totp(base32, decalage) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const secret = Buffer.from(bits.match(/.{8}/g).map((o) => parseInt(o, 2)));
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + decalage));
  const h = createHmac('sha1', secret).update(compteur).digest();
  return String(h.readUInt32BE(h[h.length - 1] & 15) & 0x7fffffff).slice(-6).padStart(6, '0');
}

/** Ce que l'application a écrit sur le disque, lu à côté d'elle. */
function disque(texte) {
  const conteneur = execFileSync('xcrun', ['simctl', 'get_app_container', appareil, identifiant, 'data'], { encoding: 'utf8' }).trim();
  const dossier = join(conteneur, 'Library/Application Support/humalis/locales');
  const bilan = { bases: 0, fiches: 0, file: 0, clair: false, contenuChiffre: true };
  if (!existsSync(dossier)) return bilan;
  const aiguille = Buffer.from(texte);
  for (const nom of readdirSync(dossier)) {
    const base = join(dossier, nom, 'base.sqlite');
    if (!existsSync(base)) continue;
    bilan.bases++;
    const lire = (sql) => execFileSync('/usr/bin/sqlite3', [base, sql], { encoding: 'utf8' }).trim();
    bilan.fiches += Number(lire('SELECT count(*) FROM fiches'));
    bilan.file += Number(lire('SELECT count(*) FROM file'));
    for (const hexa of lire('SELECT hex(contenu) FROM fiches').split('\n').filter(Boolean)) {
      const contenu = Buffer.from(hexa, 'hex').toString('latin1');
      if (contenu.includes('titre') || contenu.startsWith('{')) bilan.contenuChiffre = false;
    }
    for (const f of readdirSync(join(dossier, nom))) if (readFileSync(join(dossier, nom, f)).includes(aiguille)) bilan.clair = true;
  }
  return bilan;
}

let coupe = false;
const relais = createServer((q, w) => {
  const url = new URL(q.url, 'http://x');
  if (url.pathname.startsWith('/__essai/')) {
    const repondre = (o) => { w.writeHead(200, { 'content-type': 'application/json' }); w.end(JSON.stringify(o)); };
    const ordre = url.pathname.slice('/__essai/'.length);
    if (ordre === 'couper') { coupe = true; return repondre({}); }
    if (ordre === 'retablir') { coupe = false; return repondre({}); }
    if (ordre === 'totp') return repondre({ code: totp(url.searchParams.get('secret'), Number(url.searchParams.get('decalage'))) });
    if (ordre === 'disque') return repondre(disque(url.searchParams.get('texte')));
    if (ordre === 'serveur') return void fetch(`${API}/api/notes`, { headers: entetes }).then((r) => r.text()).then((t) => repondre({ present: t.includes(url.searchParams.get('titre')) }), (e) => repondre({ erreur: String(e) }));
    if (ordre === 'ajouter') return void fetch(`${API}/api/notes`, { method: 'POST', headers: entetes, body: JSON.stringify({ titre: url.searchParams.get('titre'), lu: false }) }).then((r) => repondre({ statut: r.status }), (e) => repondre({ erreur: String(e) }));
    w.writeHead(404);
    return void w.end();
  }
  if (coupe) return q.socket.destroy();
  const suite = request({ port: PORT_API, path: q.url, method: q.method, headers: q.headers }, (r) => { w.writeHead(r.statusCode, r.headers); r.pipe(w); });
  suite.on('error', () => w.destroy());
  q.pipe(suite);
});
await new Promise((ok) => relais.listen(PORT_RELAIS, ok));

spawnSync('xcrun', ['simctl', 'boot', appareil]);
execFileSync('xcrun', ['simctl', 'bootstatus', appareil, '-b'], { stdio: 'ignore' });
spawnSync('xcrun', ['simctl', 'uninstall', appareil, identifiant]);
const reglages = (process.env.HUMALIS_XCODEBUILD ?? '').split(' ').filter(Boolean);
const bilanFichier = join(travail, `resultat-${Date.now()}`);
const tache = spawn('xcodebuild', ['-project', join(dossierApple, 'Notes.xcodeproj'), '-scheme', 'Notes', '-destination', `platform=iOS Simulator,name=${appareil}`, '-collect-test-diagnostics', 'never', '-derivedDataPath', join(travail, 'derive'), '-resultBundlePath', bilanFichier, ...reglages, 'test'], { stdio: ['ignore', 'pipe', 'pipe'] });
let sortie = '';
const lire = (m) => {
  sortie += m;
  for (const ligne of String(m).split('\n')) if (ligne.includes('ESSAI')) console.log(ligne.replace(/^.*ESSAI/, 'ESSAI'));
};
tache.stdout.on('data', lire);
tache.stderr.on('data', lire);
const code = await new Promise((ok) => tache.on('close', ok));

relais.close();
api.kill();
execFileSync(join(PG, 'pg_ctl'), ['-D', donneesPg, '-m', 'fast', 'stop'], { stdio: 'ignore' });
if (!dejaAllume) spawnSync('xcrun', ['simctl', 'shutdown', appareil]);

const ok = code === 0 && sortie.includes('** TEST SUCCEEDED **');
if (!ok) console.log([...new Set(sortie.split('\n').filter((l) => /error:|XCTAssert|failed -|Testing failed/.test(l)))].slice(0, 20).join('\n').slice(0, 5000));
console.log(`Résultats : ${bilanFichier}`);
console.log(ok ? '\nTout est vérifié.' : '\nL\'essai a échoué.');
process.exit(ok ? 0 : 1);
