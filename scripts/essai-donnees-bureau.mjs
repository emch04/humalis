// Vérifie en vrai, dans Electron : la base locale chiffrée, la synchronisation à travers le relais,
// le code à six chiffres ; et que les clés d'accès y sont refusées à la compilation.
//
// Lancer : npm run build && node scripts/essai-donnees-bureau.mjs [dossier-de-travail]
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const { _electron } = createRequire(import.meta.url)('playwright');
const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-donnees-bureau'));
mkdirSync(travail, { recursive: true });
const problemes = [];
const verifier = (ok, message) => { if (!ok) problemes.push(message); console.log(`${ok ? '✓' : '✗'} ${message}`); };
const ADMIN = 'awa@exemple.fr', MOT = 'Essai-Solide-2026!';
const source = 'essais/donnees-comptes/notes-bureau.humalis';

const refus = spawnSync('node', ['dist/cli.js', 'compile', 'essais/donnees-comptes/notes.humalis', '--cible', 'desktop', '--sortie', join(travail, 'refuse')], { encoding: 'utf8' });
verifier(refus.status !== 0 && /clés d.accès/.test(refus.stderr + refus.stdout), "les clés d'accès sont refusées clairement sur le bureau");

const serveur = join(travail, 'serveur');
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'serveur', '--sortie', serveur], { stdio: ['ignore', 'ignore', 'inherit'] });
if (!existsSync(join(serveur, 'node_modules'))) execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund', '--silent'], { cwd: serveur, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: serveur, stdio: 'ignore' });

const port = 4990 + Math.floor(Math.random() * 9);
const bureau = join(travail, 'bureau');
const cache = join(travail, 'cache-electron');
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'desktop', '--serveur', `http://127.0.0.1:${port}`, '--sortie', bureau], { stdio: ['ignore', 'ignore', 'inherit'] });
const envNpm = { ...process.env, electron_config_cache: cache };
if (!existsSync(join(bureau, 'node_modules'))) execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund', '--silent'], { cwd: bureau, stdio: 'inherit', env: envNpm });
execFileSync('node', [join(bureau, 'node_modules/electron/install.js')], { env: envNpm, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: bureau, stdio: 'inherit' });
verifier(true, 'le projet Electron se construit');

const api = spawn('node', ['dist/src/demarrer.js'], { cwd: serveur, env: { ...process.env, NODE_ENV: 'development', JWT_SECRET: randomBytes(32).toString('hex'), ENCRYPTION_KEY: randomBytes(32).toString('base64'), HUMALIS_ADMIN_EMAIL: ADMIN, HUMALIS_ADMIN_MOT_DE_PASSE: MOT, DATABASE_URL: '', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
let journal = '';
api.stdout.on('data', (m) => (journal += m));
api.stderr.on('data', (m) => (journal += m));
for (let i = 0; i < 100 && !journal.includes('prêt'); i++) await new Promise((ok) => setTimeout(ok, 100));
verifier(journal.includes('prêt'), 'le serveur démarre');

const binaire = join(bureau, 'node_modules/electron/dist', readFileSync(join(bureau, 'node_modules/electron/path.txt'), 'utf8').trim());
const profil = join(travail, 'profil');
rmSync(profil, { recursive: true, force: true });
const ouvrir = async () => {
  const appli = await _electron.launch({ executablePath: binaire, args: [bureau, `--user-data-dir=${profil}`], cwd: bureau, env: { ...process.env, HUMALIS_SERVEUR: `http://127.0.0.1:${port}` }, timeout: 60000 });
  const page = await appli.firstWindow();
  page.erreurs = [];
  page.on('pageerror', (e) => page.erreurs.push(e.message));
  await page.waitForLoadState('domcontentloaded');
  return { appli, page };
};
const voit = (p, t, d = 8000) => p.getByText(t, { exact: true }).first().waitFor({ timeout: d }).then(() => true, () => false);
const totp = (base32, decalage = 0) => {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32) bits += a.indexOf(c).toString(2).padStart(5, '0');
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + decalage));
  const h = createHmac('sha1', Buffer.from(bits.match(/.{8}/g).map((o) => parseInt(o, 2)))).update(compteur).digest();
  return String(h.readUInt32BE(h[h.length - 1] & 15) & 0x7fffffff).slice(-6).padStart(6, '0');
};
const connecter = async (p) => {
  await p.getByLabel('Email').fill(ADMIN);
  await p.locator('input[type=password]').first().fill(MOT);
  await p.getByRole('button', { name: 'Entrer' }).click();
};

let appli;
try {
  let ouvert = await ouvrir();
  appli = ouvert.appli;
  let p = ouvert.page;
  await connecter(p);
  verifier(await voit(p, 'Connecté'), 'la connexion passe par le relais');
  await p.getByLabel('Titre').fill('Note du bureau');
  await p.getByRole('button', { name: 'Ajouter', exact: true }).click();
  verifier(await voit(p, 'Note du bureau'), 'la note apparaît');
  await p.waitForTimeout(1500);
  const envoi = await p.evaluate(async () => {
    const noms = (await indexedDB.databases()).map((d) => d.name);
    const nom = noms.find((n) => n.includes(':locale:notes:') && !n.endsWith(':visiteur'));
    const db = await new Promise((ok) => { const r = indexedDB.open(nom); r.onsuccess = () => ok(r.result); });
    const lire = (m, c) => new Promise((ok) => { const r = db.transaction(m).objectStore(m)[c ? 'get' : 'getAll'](c); r.onsuccess = () => ok(r.result); });
    const [fiches, file, cle] = [await lire('fiches'), await lire('file'), await lire('meta', 'cle')];
    const brut = new TextDecoder().decode(fiches[0].contenu.donnees);
    db.close();
    return { fiches: fiches.length, file: file.length, brut, extractable: cle.extractable };
  });
  verifier(envoi.fiches === 1 && !envoi.brut.includes('Note du bureau') && envoi.extractable === false, 'la base est chiffrée, la clé non extractible');
  verifier(envoi.file === 0, 'la note est partie au serveur à travers le relais');
  await appli.close();

  ouvert = await ouvrir();
  appli = ouvert.appli;
  p = ouvert.page;
  verifier(await voit(p, 'Note du bureau'), 'après avoir fermé et rouvert l’application, la note est là');

  await p.getByRole('button', { name: 'Code à six chiffres' }).click();
  await p.getByLabel('Votre mot de passe').fill(MOT);
  await p.getByRole('button', { name: 'Continuer' }).click();
  await p.getByText('Clé à saisir à la main').waitFor({ timeout: 8000 });
  const secret = (await p.getByText('Clé à saisir à la main').innerText()).split(' : ')[1].trim();
  verifier(await p.locator('dialog svg[role=img] path').count() === 1, 'le code QR est dessiné malgré la politique de contenu');
  await p.getByLabel('Code à six chiffres').fill(totp(secret));
  await p.getByRole('button', { name: 'Activer' }).click();
  await p.getByText('Gardez ces codes').waitFor({ timeout: 8000 });
  await p.getByRole('button', { name: 'J’ai gardé ces codes' }).click();
  await p.getByRole('button', { name: 'Sortir' }).click();
  await p.getByText('Connecté', { exact: true }).first().waitFor({ state: 'hidden', timeout: 8000 });
  await connecter(p);
  await p.getByText('Code de vérification').waitFor({ timeout: 8000 });
  await p.getByLabel('Code à six chiffres').fill(totp(secret, 1));
  await p.getByRole('button', { name: 'Vérifier' }).click();
  verifier(await voit(p, 'Connecté'), 'après le mot de passe, le code ouvre la session');
  const webauthn = await p.evaluate(async () => { try { await navigator.credentials.create({ publicKey: { rp: { name: 'x' }, user: { id: new Uint8Array(4), name: 'x', displayName: 'x' }, challenge: new Uint8Array(32), pubKeyCredParams: [{ type: 'public-key', alg: -7 }] } }); return 'accepté'; } catch (e) { return e.name + ' : ' + e.message; } });
  console.log('• WebAuthn dans Electron : ' + webauthn);
  verifier(p.erreurs.length === 0, 'aucune erreur de page' + (p.erreurs[0] ? ' : ' + p.erreurs[0] : ''));
} catch (erreur) {
  verifier(false, 'le parcours va au bout : ' + (erreur?.message ?? erreur));
} finally {
  await appli?.close().catch(() => undefined);
  api.kill();
}
console.log(problemes.length ? `\n${problemes.length} problème(s).` : '\nTout est vérifié.');
process.exit(problemes.length ? 1 : 0);
