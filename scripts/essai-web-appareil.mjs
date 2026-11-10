// Vérifie dans un vrai Chromium les fonctions de l'appareil sur le web, moteur et React.
// Caméra, biométrie et capteur de position sont simulés par le navigateur d'essai : un vrai téléphone reste à essayer.
//
// Lancer : npm run build && node scripts/essai-web-appareil.mjs [dossier-de-travail]
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-appareil'));
rmSync(travail, { recursive: true, force: true });
mkdirSync(travail, { recursive: true });
const { chromium } = createRequire(import.meta.url)('playwright');
const problemes = [];
const verifier = (ok, message) => { if (!ok) problemes.push(message); console.log(`${ok ? '✓' : '✗'} ${message}`); };
const source = 'essais/web/appareil.humalis';
const serveur = join(travail, 'serveur');
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'serveur', '--sortie', serveur], { stdio: ['ignore', 'ignore', 'inherit'] });
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund', '--silent'], { cwd: serveur, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: serveur, stdio: 'ignore' });
for (const [nom, options] of [['react', ['--moteur', 'react']], ['moteur', ['--moteur', 'humalis']]]) {
  execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'web', ...options, '--sortie', join(travail, nom)], { stdio: ['ignore', 'ignore', 'inherit'] });
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: join(travail, nom), stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: join(travail, nom), stdio: 'inherit' });
}
const image = join(travail, 'photo.png');
writeFileSync(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));

const port = 5990 + Math.floor(Math.random() * 9);
const A = `http://127.0.0.1:${port}`;
const EMAIL = 'chef@atelier.fr';
const MOT = 'Admin-Solide-1!';
const processus = [];
const lancer = (commande, args, options, trouve) => new Promise((ok, echec) => {
  const p = spawn(commande, args, options);
  processus.push(p);
  const fin = setTimeout(() => echec(new Error('délai dépassé')), 30000);
  p.stderr.on('data', (m) => { if (!String(m).includes('security_event')) console.error(String(m).slice(0, 200)); });
  p.stdout.on('data', (m) => { const r = trouve(String(m).replace(/\x1b\[[0-9;]*m/g, '')); if (r) { clearTimeout(fin); ok(r); } });
});
const navigateur = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
try {
  await lancer('node', ['dist/src/demarrer.js'], { cwd: serveur, env: { ...process.env, JWT_SECRET: randomBytes(32).toString('hex'), HUMALIS_ADMIN_EMAIL: EMAIL, HUMALIS_ADMIN_MOT_DE_PASSE: MOT, PORT: String(port), NODE_ENV: 'development', HUMALIS_LIMITE_API: '100000', HUMALIS_LIMITE_CONNEXION: '1000' } }, () => true);
  const jeton = (await (await fetch(`${A}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: MOT }) })).json()).data.token;
  const taches = async () => (await (await fetch(`${A}/api/taches`, { headers: { authorization: `Bearer ${jeton}` } })).json());
  const combien = async (nom) => (await taches()).filter((t) => t.nom === nom).length;

  for (const nom of ['moteur', 'react']) {
    const dossier = join(travail, nom);
    const adresse = await lancer(join(dossier, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0', '--strictPort', 'false'], { cwd: dossier, env: { ...process.env, HUMALIS_SERVEUR: A } }, (m) => m.match(/http:\/\/localhost:\d+/)?.[0]);
    const contexte = await navigateur.newContext({ locale: 'fr-FR', geolocation: { latitude: 48.85, longitude: 2.35, accuracy: 12 }, permissions: ['geolocation', 'camera'] });
    await contexte.addInitScript(() => {
      window.__vibre = 0;
      navigator.vibrate = () => { window.__vibre++; return true; };
      window.BarcodeDetector = class { async detect() { return [{ rawValue: 'CODE-123' }]; } };
    });
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    const cdp = await contexte.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: false, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    const entrer = async () => {
      await page.getByLabel('Email').fill(EMAIL);
      await page.getByLabel('Mot de passe').first().fill(MOT);
      await page.getByRole('button', { name: 'Entrer' }).click();
      await page.getByRole('button', { name: 'Photo' }).waitFor({ timeout: 15000 });
    };
    const voir = (texte, message) => page.getByText(texte).first().waitFor({ timeout: 8000 }).then(() => verifier(true, `${nom} : ${message}`), () => verifier(false, `${nom} : ${message}`));
    const bouton = (n) => page.getByRole('button', { name: n, exact: true });
    const fileLocale = () => page.evaluate(() => Object.keys(localStorage).filter((c) => c.startsWith('humalis-envois:')).reduce((n, c) => n + JSON.parse(localStorage.getItem(c)).length, 0));
    const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

    await page.goto(`${adresse}/bienvenue`);
    await entrer();
    const choix = page.waitForEvent('filechooser', { timeout: 8000 });
    await bouton('Photo').click();
    await (await choix).setFiles(image);
    await voir('Photo prise', '« photo dans » reçoit le fichier');
    await bouton('Scanner').click();
    await voir('Code : CODE-123', '« scanner code » lit la valeur (détecteur simulé)');
    verifier(await page.evaluate(() => window.__vibre) === 1, `${nom} : « vibrer » appelle le navigateur`);
    await bouton('Position').click();
    await voir(/Latitude\s: 48[.,]85/, '« position dans » donne la position');
    await bouton('Identite').click();
    await voir('Identité : reconnue', '« verifier identite » : première fois, clé créée (authentificateur simulé)');
    await page.evaluate(() => undefined);
    await bouton('Identite').click();
    await pause(400);
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
    await bouton('Identite').click();
    await voir('Identité : refusee', '« verifier identite » : personne non reconnue, le bloc « sinon » s’exécute');
    const toile = await page.locator('canvas').boundingBox();
    await page.mouse.move(toile.x + 20, toile.y + 20);
    await page.mouse.down();
    await page.mouse.move(toile.x + 120, toile.y + 90, { steps: 6 });
    await page.mouse.up();
    await voir('Signée', '« signature dans » donne une image');

    // Hors ligne : sans réseau, l'envoi attend.
    await contexte.setOffline(true);
    await bouton('Ajouter').click();
    await pause(300);
    verifier(await fileLocale() === 1, `${nom} : sans réseau, l'envoi est gardé`);
    const avant = await combien('gardee');
    await contexte.setOffline(false);
    await pause(1200);
    verifier(await fileLocale() === 0 && await combien('gardee') === avant + 1, `${nom} : au retour du réseau, il part une fois`);

    // Le serveur a reçu l'envoi, mais la réponse est perdue.
    const reçus = await combien('gardee');
    await page.route('**/api/taches', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fetch();
      await route.abort();
    });
    await bouton('Ajouter').click();
    await pause(500);
    verifier(await fileLocale() === 1, `${nom} : une réponse perdue garde l'envoi`);
    await page.unroute('**/api/taches');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await pause(1200);
    verifier(await fileLocale() === 0 && await combien('gardee') === reçus + 1, `${nom} : renvoyé, il n'y a aucun doublon`);

    // « avec hors ligne » : la dernière réponse reste lisible quand le serveur ne répond plus.
    await page.reload();
    await page.getByRole('button', { name: 'Photo' }).waitFor({ timeout: 15000 });
    await page.getByText('Tache : gardee').first().waitFor({ timeout: 8000 });
    await page.route('**/api/taches', (route) => route.abort());
    await page.reload();
    await bouton('Photo').waitFor({ timeout: 15000 });
    await voir('Tache : gardee', '« avec hors ligne » montre la dernière réponse sans serveur');

    // Un envoi appartient à son compte : il attend, et personne d'autre ne peut l'envoyer.
    await bouton('Ajouter').click();
    await pause(400);
    verifier(await fileLocale() === 1, `${nom} : un envoi attend le serveur`);
    await page.unroute('**/api/taches');
    const dansLaFile = await combien('gardee');
    await page.evaluate(() => undefined);
    await bouton('Sortir').click();
    await page.getByLabel('Email').waitFor({ timeout: 8000 });
    verifier(await page.evaluate(() => Object.keys(localStorage).filter((c) => c.startsWith('humalis-hors-ligne:')).length) === 0, `${nom} : la déconnexion efface les lectures gardées`);
    verifier(await fileLocale() >= 0, `${nom} : la file reste sur l'appareil`);
    await entrer();
    await pause(1200);
    verifier(await combien('gardee') === dansLaFile + 1 && await fileLocale() === 0, `${nom} : la même personne reconnectée, l'envoi part`);
    verifier(erreurs.length === 0, `${nom} : aucune erreur dans la page ${erreurs.join(' ; ')}`);
    await contexte.close();
  }
} finally {
  await navigateur.close();
  for (const p of processus) p.kill();
}
console.log(problemes.length ? `\n${problemes.length} problème(s)` : '\nTout est vérifié.');
process.exit(problemes.length ? 1 : 0);
