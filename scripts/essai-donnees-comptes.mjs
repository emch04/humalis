// Vérifie en vrai les données locales, les clés d'accès et le code à six chiffres :
// le serveur produit sur un vrai PostgreSQL, le site produit dans Chromium (deux appareils),
// un authentificateur virtuel pour les clés d'accès.
//
// Lancer : npm run build && node scripts/essai-donnees-comptes.mjs [dossier-de-travail] [--moteur react]
import { execFileSync, spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer, request } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const moteur = process.argv.includes('react') ? 'react' : 'humalis';
const travail = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : join(tmpdir(), 'humalis-essai-donnees'));
mkdirSync(travail, { recursive: true });
const { chromium } = createRequire(import.meta.url)('playwright');
const problemes = [];
const verifier = (ok, message) => {
  if (!ok) problemes.push(message);
  console.log(`${ok ? '✓' : '✗'} ${message}`);
};
const source = 'essais/donnees-comptes/notes.humalis';
const ADMIN = 'awa@exemple.fr';
const MOT = 'Essai-Solide-2026!';

const dossierServeur = join(travail, 'serveur');
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'serveur', '--sortie', dossierServeur], { stdio: ['ignore', 'ignore', 'inherit'] });
if (!existsSync(join(dossierServeur, 'node_modules'))) execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund', '--silent'], { cwd: dossierServeur, stdio: 'inherit' });
execFileSync('npx', ['tsc', '--noEmit'], { cwd: dossierServeur, stdio: 'inherit' });
verifier(true, 'le serveur produit passe la vérification des types');
const tests = execFileSync('npx', ['vitest', 'run'], { cwd: dossierServeur, encoding: 'utf8' });
verifier(/Tests\s+\d+ passed/.test(tests) && !/failed/.test(tests), `ses tests produits passent (${tests.match(/Tests\s+(\d+) passed/)?.[1]})`);
execFileSync('npm', ['run', 'build'], { cwd: dossierServeur, stdio: 'ignore' });

const dossierWeb = join(travail, `web-${moteur}`);
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'web', '--moteur', moteur, '--sortie', dossierWeb], { stdio: ['ignore', 'ignore', 'inherit'] });
if (!existsSync(join(dossierWeb, 'node_modules'))) execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: dossierWeb, stdio: 'inherit' });
if (moteur === 'react') execFileSync('npx', ['tsc', '--noEmit'], { cwd: dossierWeb, stdio: 'inherit' });
execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: dossierWeb, stdio: 'inherit' });
const dist = join(dossierWeb, 'dist');

// PostgreSQL : une base jetable, sur le disque de travail.
const donneesPg = join(travail, 'pg');
const PORT_PG = 5540 + Math.floor(Math.random() * 40);
rmSync(donneesPg, { recursive: true, force: true });
const PG = process.env.HUMALIS_PG_BIN ?? '/opt/homebrew/opt/postgresql@16/bin';
execFileSync(join(PG, 'initdb'), ['-D', donneesPg, '-U', 'essai', '--auth=trust', '-E', 'UTF8', '--locale=C'], { stdio: 'ignore' });
execFileSync(join(PG, 'pg_ctl'), ['-D', donneesPg, '-o', `-p ${PORT_PG} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`, '-w', 'start', '-l', join(donneesPg, 'journal.log')], { stdio: 'ignore', env: { ...process.env, LC_ALL: 'en_US.UTF-8' } });

const portApi = 4950 + Math.floor(Math.random() * 40);
const env = { ...process.env, NODE_ENV: 'development', JWT_SECRET: randomBytes(32).toString('hex'), ENCRYPTION_KEY: randomBytes(32).toString('base64'), HUMALIS_ADMIN_EMAIL: ADMIN, HUMALIS_ADMIN_MOT_DE_PASSE: MOT, DATABASE_URL: `postgres://essai@127.0.0.1:${PORT_PG}/postgres`, PORT: String(portApi), WEBAUTHN_ALLOWED_ORIGINS: 'http://localhost:5173', HUMALIS_LIMITE_CONNEXION: '200', HUMALIS_LIMITE_API: '100000' };
const api = spawn('node', [join('dist', existsSync(join(dossierServeur, 'dist/src/demarrer.js')) ? 'src/demarrer.js' : 'demarrer.js')], { cwd: dossierServeur, env, stdio: ['ignore', 'pipe', 'pipe'] });
let journal = '';
api.stdout.on('data', (m) => (journal += m));
api.stderr.on('data', (m) => (journal += m));
for (let i = 0; i < 100 && !journal.includes('prêt'); i++) await new Promise((ok) => setTimeout(ok, 100));
verifier(journal.includes('prêt'), 'le serveur démarre sur PostgreSQL');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
let api_coupee = false;
const site = createServer((q, w) => {
  const url = new URL(q.url, 'http://x');
  if (/^\/(api|auth)(\/|$)/.test(url.pathname)) {
    if (api_coupee) return q.socket.destroy();
    const relais = request({ port: portApi, path: q.url, method: q.method, headers: q.headers }, (r) => { w.writeHead(r.statusCode, r.headers); r.pipe(w); });
    relais.on('error', () => w.destroy());
    return void q.pipe(relais);
  }
  let p = join(dist, decodeURIComponent(url.pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) p = join(dist, moteur === 'react' ? 'index.html' : '404.html');
  w.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' });
  w.end(readFileSync(p));
});
await new Promise((ok) => site.listen(5173, ok));
const U = 'http://localhost:5173';

const navigateur = await chromium.launch();
async function appareil() {
  const contexte = await navigateur.newContext({ locale: 'fr-FR' });
  const page = await contexte.newPage();
  page.erreurs = [];
  page.on('pageerror', (e) => page.erreurs.push(String(e)));
  await page.goto(U + '/');
  return { contexte, page };
}
const texteVisible = (p, t, delai = 8000) => p.getByText(t, { exact: true }).first().waitFor({ timeout: delai }).then(() => true, () => false);
const absent = (p, t, delai = 8000) => p.getByText(t, { exact: true }).first().waitFor({ state: 'hidden', timeout: delai }).then(() => true, () => false);
async function connecter(p) {
  await p.getByLabel('Email').fill(ADMIN);
  await p.locator('input[type=password]').first().fill(MOT);
  await p.getByRole('button', { name: 'Entrer' }).click();
}
async function ajouter(p, titre) {
  await p.getByLabel('Titre').fill(titre);
  await p.getByRole('button', { name: 'Ajouter', exact: true }).click();
}
const reveiller = (p) => p.evaluate(() => { dispatchEvent(new Event('online')); });

try {
  const a = await appareil();
  const b = await appareil();
  await connecter(a.page);
  verifier(await texteVisible(a.page, 'Connecté'), 'A se connecte');
  await connecter(b.page);
  verifier(await texteVisible(b.page, 'Connecté'), 'B se connecte');

  await ajouter(a.page, 'Note de A');
  verifier(await texteVisible(a.page, 'Note de A'), 'la note apparaît sur A');
  await a.page.waitForTimeout(1200);
  await reveiller(b.page);
  verifier(await texteVisible(b.page, 'Note de A'), 'la note arrive sur B');

  // La base : chiffrée, et sa clé non extractible.
  const coffre = await a.page.evaluate(async () => {
    const noms = (await indexedDB.databases()).map((d) => d.name);
    const nom = noms.find((n) => n.includes(':locale:notes:') && !n.endsWith(':visiteur'));
    const db = await new Promise((ok) => { const r = indexedDB.open(nom); r.onsuccess = () => ok(r.result); });
    const lire = (magasin, cle) => new Promise((ok) => { const r = db.transaction(magasin).objectStore(magasin)[cle ? 'get' : 'getAll'](cle); r.onsuccess = () => ok(r.result); });
    const fiches = await lire('fiches');
    const cle = await lire('meta', 'cle');
    const brut = new TextDecoder().decode(fiches[0].contenu.donnees);
    db.close();
    return { n: fiches.length, brut, extractable: cle.extractable, type: cle.type, algo: cle.algorithm.name };
  });
  verifier(coffre.n === 1 && !coffre.brut.includes('Note de A'), 'dans IndexedDB, le contenu est chiffré');
  verifier(coffre.extractable === false && coffre.algo === 'AES-GCM', 'la clé WebCrypto est non extractible');

  // Rechargement : la note revient de la base.
  await a.page.reload();
  verifier(await texteVisible(a.page, 'Note de A'), 'après un rechargement, la note est toujours là');

  // Hors ligne.
  await a.contexte.setOffline(true);
  await ajouter(a.page, 'Écrite hors ligne');
  verifier(await texteVisible(a.page, 'Écrite hors ligne'), 'hors ligne, la note s\'ajoute');
  await a.page.waitForTimeout(800);
  await reveiller(b.page);
  await b.page.waitForTimeout(800);
  verifier(await b.page.getByText('Écrite hors ligne').count() === 0, 'hors ligne, B ne la voit pas');
  await a.contexte.setOffline(false);
  await a.page.waitForTimeout(1500);
  await reveiller(b.page);
  verifier(await texteVisible(b.page, 'Écrite hors ligne'), 'au retour du réseau, elle part et arrive sur B');

  // Le code à six chiffres.
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
  await a.page.getByRole('button', { name: 'Code à six chiffres' }).click();
  await a.page.getByLabel('Votre mot de passe').fill(MOT);
  await a.page.getByRole('button', { name: 'Continuer' }).click();
  await a.page.getByText('Clé à saisir à la main').waitFor({ timeout: 8000 });
  const secret = (await a.page.getByText('Clé à saisir à la main').innerText()).split(' : ')[1].trim();
  verifier(await a.page.locator('dialog svg[role=img] path').count() === 1, 'le code QR est dessiné');
  await a.page.screenshot({ path: join(travail, `qr-${moteur}.png`) });
  await a.page.getByLabel('Code à six chiffres').fill(totp(secret));
  await a.page.getByRole('button', { name: 'Activer' }).click();
  await a.page.getByText('Gardez ces codes').waitFor({ timeout: 8000 });
  const codes = (await a.page.locator('dialog pre').innerText()).split('\n').filter(Boolean);
  verifier(codes.length === 10, 'dix codes de secours sont montrés');
  await a.page.getByRole('button', { name: 'J’ai gardé ces codes' }).click();

  await a.page.getByRole('button', { name: 'Sortir' }).click();
  await absent(a.page, 'Connecté');
  verifier(await absent(a.page, 'Note de A'), 'une fois déconnecté, les notes du compte disparaissent de la page');
  await connecter(a.page);
  await a.page.getByText('Code de vérification').waitFor({ timeout: 8000 });
  verifier(await a.page.getByText('Connecté', { exact: true }).count() === 0, 'après le mot de passe, pas encore de session');
  await a.page.getByLabel('Code à six chiffres').fill('000000');
  await a.page.getByRole('button', { name: 'Vérifier' }).click();
  verifier(await texteVisible(a.page, 'Ce code est incorrect.'), 'un code faux est refusé');
  await a.page.getByLabel('Code à six chiffres').fill(totp(secret, 1));
  await a.page.getByRole('button', { name: 'Vérifier' }).click();
  verifier(await texteVisible(a.page, 'Connecté'), 'le bon code ouvre la session');
  verifier(await texteVisible(a.page, 'Note de A'), 'et les notes du compte reviennent');

  // Les clés d'accès.
  const cdp = await a.contexte.newCDPSession(a.page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await a.page.getByRole('button', { name: 'Ajouter une clé' }).click();
  await a.page.getByLabel('Votre mot de passe').fill(MOT);
  await a.page.getByRole('button', { name: 'Continuer' }).click();
  verifier(await texteVisible(a.page, "Clé d'accès ajoutée."), "une clé d'accès s'ajoute (WebAuthn, vérifiée par le serveur)");
  await a.page.getByRole('button', { name: 'Sortir' }).click();
  await absent(a.page, 'Connecté');
  await a.page.getByRole('button', { name: 'Avec une clé' }).click();
  verifier(await texteVisible(a.page, 'Connecté'), "la connexion par clé d'accès ouvre la session, sans adresse ni code");

  for (const [nom, p] of [['A', a.page], ['B', b.page]]) verifier(p.erreurs.length === 0, `aucune erreur de page sur ${nom}${p.erreurs.length ? ' : ' + p.erreurs[0] : ''}`);
} catch (erreur) {
  verifier(false, 'le parcours va au bout : ' + (erreur?.message ?? erreur));
} finally {
  await navigateur.close();
  site.close();
  api.kill();
  execFileSync(join(PG, 'pg_ctl'), ['-D', donneesPg, '-m', 'fast', 'stop'], { stdio: 'ignore' });
}
if (journal.includes('Error') || journal.includes('erreur')) console.log(journal.slice(-2000));
console.log(problemes.length ? `\n${problemes.length} problème(s).` : '\nTout est vérifié.');
process.exit(problemes.length ? 1 : 0);
