#!/usr/bin/env node
// Vérifie en vrai les discussions, les appels et les réunions : le vrai serveur produit par Humalis, un vrai
// serveur LiveKit (mode développement) et un navigateur par personne, à la caméra simulée. Laisse le serveur ouvert avec
// --garder, pour y brancher ensuite des appareils.
//
// Lancer : LIVEKIT_BIN=<livekit-server> npm run build && node scripts/essai-reunions.mjs <dossier-de-travail> [--port 4992] [--garder]
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chargerPlaywright } from './outils-essai.mjs';

const args = process.argv.slice(2);
const garder = args.includes('--garder');
const iPort = args.indexOf('--port');
const port = iPort >= 0 ? Number(args[iPort + 1]) : 5700 + Math.floor(Math.random() * 90);
const positionnels = args.filter((a, i) => !a.startsWith('--') && (iPort < 0 || i !== iPort + 1));
if (!positionnels[0] || !process.env.LIVEKIT_BIN) {
  console.error('Donnez un dossier de travail (sur le SSD) et LIVEKIT_BIN.');
  process.exit(2);
}
const travail = resolve(positionnels[0]);
mkdirSync(travail, { recursive: true });
const { chromium, _electron } = chargerPlaywright();
const problemes = [];
const verifier = (ok, message) => {
  if (!ok) problemes.push(message);
  console.log(`${ok ? '✓' : '✗'} ${message}`);
};
const source = 'scripts/essais-temps-reel/reunions.humalis';
const compiler = (cible, dossier, ...plus) => execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', cible, '--sortie', dossier, ...plus], { stdio: ['ignore', 'ignore', 'inherit'] });
const installer = (dossier) => execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund', '--silent'], { cwd: dossier, stdio: 'inherit' });
const processus = [];
const lancer = (commande, argv, options, pret, sur = 'stdout') => new Promise((ok) => {
  const p = spawn(commande, argv, options);
  processus.push(p);
  const lire = (m) => {
    if (process.env.HUMALIS_ESSAI_BAVARD === '2') process.stderr.write(m);
    const trouve = pret(String(m));
    if (trouve) ok(trouve);
  };
  p.stdout.on('data', lire);
  p.stderr.on('data', lire);
  void sur;
});

// Un LiveKit déjà ouvert (celui d'un essai précédent, ou d'un appareil branché) sert tel quel.
const livekitOuvert = await fetch('http://127.0.0.1:7880').then(() => true, () => false);
if (!livekitOuvert) await lancer(process.env.LIVEKIT_BIN, ['--dev', '--bind', '0.0.0.0'], {}, (m) => m.includes('starting LiveKit server'));
const serveur = join(travail, 'serveur');
compiler('serveur', serveur);
installer(serveur);
execFileSync('npm', ['run', 'build'], { cwd: serveur, stdio: 'inherit' });
// Deux comptes de chaque rôle, posés au démarrage : l'essai ne passe pas par les invitations.
const MOT = 'Essai-Solide-2026!';
const demarrer = join(serveur, 'dist/src/demarrer.js');
const code = readFileSync(demarrer, 'utf8');
const graine = `\nfor (const [id, email, role] of [['compte-awa','awa@essai.test','client'],['compte-binta','binta@essai.test','agent'],['compte-chloe','chloe@essai.test','client'],['compte-dia','dia@essai.test','collegue']]) await usersStore.create({ id, email, role, passwordHash: await hashPassword(${JSON.stringify(MOT)}) });\n`;
writeFileSync(demarrer, code.replace(/(const usersStore = [^\n]*\n)/, `$1${graine}`));
const base = `http://127.0.0.1:${port}`;
await lancer('node', ['dist/src/demarrer.js'], { cwd: serveur, env: { ...process.env, JWT_SECRET: randomBytes(32).toString('hex'), PORT: String(port), HUMALIS_LIMITE_CONNEXION: '1000', HUMALIS_LIMITE_API: '100000', // Une machine virtuelle ou un émulateur joint LiveKit par l'adresse du Mac (ESSAI_LIVEKIT_URL=ws://192.168.64.1:7880).
    LIVEKIT_URL: process.env.ESSAI_LIVEKIT_URL ?? 'ws://127.0.0.1:7880', LIVEKIT_API_KEY: 'devkey', LIVEKIT_API_SECRET: 'secret' } }, (m) => m.includes('prêt'));
const web = join(travail, 'web');
compiler('web', web, '--moteur', 'humalis');
installer(web);
execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: web, stdio: 'inherit' });
const adresse = await lancer(join(web, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0', '--strictPort', 'false'], { cwd: web, env: { ...process.env, HUMALIS_SERVEUR: base } }, (m) => m.match(/http:\/\/localhost:\d+/)?.[0]);
console.log(`Serveur : ${base} ; site : ${adresse}`);

// Un navigateur par personne, comme des appareils distincts : un onglet en arrière-plan d'un même navigateur est ralenti.
const navigateurs = [];
const ARGUMENTS = { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--auto-select-desktop-capture-source=Entire screen', '--autoplay-policy=no-user-gesture-required'] };
// Une page cachée ne relit rien tant qu'on n'y revient pas (comme un onglet en arrière-plan) : on regarde la page qu'on vérifie.
const voit = async (p, texte, delai = 8000) => {
  await p.bringToFront().catch(() => undefined);
  return p.getByText(texte).first().waitFor({ timeout: delai }).then(() => true, () => false);
};
const erreurs = [];
async function connecter(email) {
  const navigateur = await chromium.launch(ARGUMENTS);
  navigateurs.push(navigateur);
  const contexte = await navigateur.newContext({ permissions: ['camera', 'microphone'] });
  const page = await contexte.newPage();
  page.on('pageerror', (e) => erreurs.push(`${email} : ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`  [${email}] console : ${m.text()}`.slice(0, 220)); });
  page.on('response', async (r) => { if (r.status() >= 400 && r.url().includes('/api/')) console.log(`  [${email}] ${r.request().method()} ${r.url().replace(adresse, '')} → ${r.status()} ${await r.text().catch(() => '')}`.slice(0, 240)); });
  await page.goto(adresse);
  const code = await page.evaluate(async ([e, m]) => (await fetch('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: m }) })).status, [email, MOT]);
  verifier(code === 200, `${email} se connecte`);
  return page;
}
const allerA = async (p, nom) => {
  await p.goto(`${adresse}/${nom}`);
  await p.waitForLoadState('networkidle').catch(() => undefined);
};
const videoVivante = async (p, n = 1) => {
  // Une page cachée voit ses vidéos suspendues par LiveKit (adaptiveStream) : comme une personne, on regarde la page qu'on vérifie.
  await p.bringToFront().catch(() => undefined);
  const ok = await p.waitForFunction((min) => [...document.querySelectorAll('humalis-reunion video')].filter((v) => v.videoWidth > 0 && !v.paused).length >= min, n, { timeout: 20000 }).then(() => true, () => false);
  if (!ok) console.log('  images :', JSON.stringify(await p.evaluate(() => [document.visibilityState, ...[...document.querySelectorAll('humalis-reunion figure')].map((f) => [f.querySelector('video')?.videoWidth ?? 'sans video', f.querySelector('video')?.paused, f.querySelector('video')?.readyState, f.textContent]), globalThis.humalisReunion?.()])));
  return ok;
};

try {
  const awa = await connecter('awa@essai.test');
  const binta = await connecter('binta@essai.test');
  const chloe = await connecter('chloe@essai.test');

  // La discussion.
  await allerA(awa, 'support');
  await allerA(binta, 'support');
  await awa.getByLabel('Message').fill('Bonjour, ma commande ?');
  await awa.getByRole('button', { name: 'Envoyer', exact: true }).click();
  verifier(await voit(awa, 'Bonjour, ma commande ?'), 'discussion : le client voit son message');
  await binta.getByRole('button', { name: 'Ouvrir' }).first().waitFor({ timeout: 8000 }).catch(() => undefined);
  await binta.getByRole('button', { name: 'Ouvrir' }).first().click();
  verifier(await voit(binta, 'Bonjour, ma commande ?'), 'discussion : l’agent reçoit le message en direct');
  verifier(await voit(awa, 'Lu'), 'discussion : le client voit « Lu »');
  await binta.getByLabel('Message').pressSequentially('Je reg', { delay: 40 });
  verifier(await voit(awa, /écrit…/), 'discussion : le client voit que l’agent écrit');
  await binta.getByRole('button', { name: 'Envoyer', exact: true }).click().catch(() => undefined);
  verifier(await voit(awa, 'Je reg'), 'discussion : le client reçoit la réponse sans recharger');
  await awa.locator('input[type=file]').first().setInputFiles({ name: 'facture.txt', mimeType: 'text/plain', buffer: Buffer.from('contenu de la facture') });
  await awa.getByRole('button', { name: 'Envoyer le fichier' }).click();
  await awa.waitForTimeout(1500);
  if (process.env.HUMALIS_ESSAI_BAVARD) console.log(await awa.evaluate(async () => [document.body.innerText, JSON.stringify(await (await fetch('/api/discussions_support_vue/moi')).json()).slice(0, 900)]));
  verifier(await voit(binta, 'facture.txt'), 'discussion : la pièce jointe arrive');
  const lien = await binta.getByRole('link', { name: 'facture.txt' }).first().getAttribute('href');
  const telecharge = await fetch(lien.replace(/^https?:\/\/[^/]+/, base));
  verifier(telecharge.ok && (await telecharge.text()) === 'contenu de la facture', 'discussion : la pièce jointe se télécharge');
  verifier((await fetch(lien.replace(/^https?:\/\/[^/]+/, base).replace(/signature=.*/, 'signature=faux'))).status === 403, 'discussion : une signature fausse est refusée');

  // Les droits : une autre cliente n'entre pas dans cette conversation.
  const idConversation = await awa.evaluate(async () => (await (await fetch('/api/discussions_support_vue/moi')).json()).id);
  const code = await chloe.evaluate(async (id) => (await fetch(`/api/discussions_support_vue/${id}`)).status, idConversation);
  verifier(code === 404, 'droits : une autre cliente ne lit pas cette conversation');
  verifier((await fetch(`${base}/api/discussions_support_conversations`)).status === 401, 'droits : un visiteur est refusé');
  verifier((await fetch(`${base}/api/discussions_support_vue/direct`)).status === 401, 'droits : un visiteur n’écoute pas le canal');

  // Le badge des non lus, et « quand un message arrive ».
  await allerA(awa, '');
  await binta.getByLabel('Message').fill('Colis parti');
  await binta.getByRole('button', { name: 'Envoyer', exact: true }).click();
  verifier(await voit(awa, 'Colis parti'), '« quand un message arrive » s’exécute');
  verifier(await awa.locator('.humalis-badge').filter({ hasText: /^[1-9]/ }).first().waitFor({ timeout: 8000 }).then(() => true, () => false), 'le badge compte les non lus');
  verifier(await voit(awa, 'En ligne'), 'la présence : Binta est en ligne');

  // Un appel.
  await allerA(binta, '');
  await awa.getByRole('button', { name: 'Appeler' }).nth(1).click();
  verifier(await voit(binta, /Appel de/), 'appel : la sonnerie apparaît');
  await binta.getByRole('button', { name: 'Décrocher' }).click();
  verifier(await videoVivante(awa, 2), 'appel : l’appelante voit deux images vivantes');
  verifier(await videoVivante(binta, 2), 'appel : l’appelée voit deux images vivantes');
  await awa.getByRole('button', { name: 'Couper le micro' }).click();
  verifier(await awa.getByRole('button', { name: 'Activer le micro' }).waitFor({ timeout: 5000 }).then(() => true, () => false), 'appel : le bouton du micro change');
  await binta.getByRole('button', { name: 'Raccrocher' }).click();
  verifier(await awa.getByRole('heading', { name: 'Agence' }).waitFor({ timeout: 10000 }).then(() => true, () => false), 'appel : l’autre côté quitte quand on raccroche');

  // Une réunion.
  await allerA(awa, 'conseil');
  await allerA(binta, 'conseil');
  await allerA(chloe, 'conseil');
  for (const p of [awa, binta, chloe]) await p.getByRole('button', { name: 'Rejoindre' }).click();
  verifier(await videoVivante(awa, 3), 'réunion : trois images vivantes');
  verifier(await voit(awa, 'Présent : binta@essai.test') && await voit(awa, 'Présent : chloe@essai.test'), 'réunion : la liste des participants se met à jour');
  await chloe.getByRole('button', { name: 'Lever la main' }).click();
  verifier(await voit(chloe, 'Main levée'), 'réunion : « main est levee »');
  verifier(await awa.getByText('Main', { exact: true }).first().waitFor({ timeout: 8000 }).then(() => true, () => false), 'réunion : les autres voient la main');
  await awa.getByRole('button', { name: 'Partager l’écran' }).click();
  verifier(await videoVivante(chloe, 4), 'réunion : le partage d’écran arrive');
  await awa.getByRole('button', { name: 'Arrêter le partage' }).click();
  // Une cliente n'anime pas : la modération lui est refusée.
  const refus = await chloe.evaluate(async () => {
    const csrf = document.cookie.match(/astratra_csrf=([^;]+)/)?.[1] ?? '';
    return (await fetch('/api/salles_geste', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': decodeURIComponent(csrf) }, body: JSON.stringify({ salle: 'conseil', participant: 'compte-awa', geste: 'exclure' }) })).status;
  });
  verifier(refus === 403, 'réunion : une personne qui n’anime pas ne peut pas exclure');
  const boutonPourChloe = (nom) => binta.locator('text=Présent : chloe@essai.test').locator(`xpath=following::button[normalize-space()="${nom}"][1]`);
  await boutonPourChloe('Couper').waitFor({ timeout: 5000 });
  await boutonPourChloe('Couper').click();
  await chloe.bringToFront();
  const microCoupe = await chloe.getByRole('button', { name: 'Activer le micro' }).waitFor({ timeout: 8000 }).then(() => true, () => false);
  if (!microCoupe) console.log('  micro de Chloé :', JSON.stringify(await chloe.evaluate(async () => [await (await fetch('/api/salles_moi/conseil')).json().then((v) => ({ microCoupe: v.microCoupe })), globalThis.humalisReunion?.()])));
  verifier(microCoupe || await chloe.getByRole('button', { name: 'Activer le micro' }).waitFor({ timeout: 8000 }).then(() => true, () => false), 'réunion : l’animatrice coupe un micro, la personne le voit');
  await binta.bringToFront();
  await boutonPourChloe('Exclure').click();
  verifier(await binta.getByText('Présent : chloe@essai.test').waitFor({ state: 'detached', timeout: 10000 }).then(() => true, () => false), 'réunion : l’animatrice exclut une personne');
  verifier(await voit(chloe, 'Vous avez été retiré de la réunion.'), 'réunion : la personne exclue le lit');
  await awa.screenshot({ path: join(travail, 'reunion.png') });

  // Le bureau : Electron entre dans la même réunion, à travers son relais.
  if (!args.includes('--sans-bureau')) {
    const bureau = join(travail, 'bureau');
    compiler('desktop', bureau, '--serveur', base);
    installer(bureau);
    const envElectron = { ...process.env, electron_config_cache: join(travail, 'cache-electron') };
    execFileSync('node', [join(bureau, 'node_modules/electron/install.js')], { stdio: 'inherit', env: envElectron });
    execFileSync('npm', ['run', 'build'], { cwd: bureau, stdio: 'inherit' });
    const chemin = readFileSync(join(bureau, 'node_modules/electron/path.txt'), 'utf8').trim();
    const application = await _electron.launch({ executablePath: join(bureau, 'node_modules/electron/dist', chemin), args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', bureau], env: { ...process.env, HUMALIS_SERVEUR: base } });
    const fenetre = await application.firstWindow();
    fenetre.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`  [bureau] ${m.text()}`.slice(0, 220)); });
    await fenetre.getByRole('heading', { name: 'Agence' }).waitFor();
    const statut = await fenetre.evaluate(async ([e, m]) => (await fetch('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: m }) })).status, ['dia@essai.test', MOT]);
    verifier(statut === 200, 'bureau : la connexion passe par le relais');
    await fenetre.evaluate(() => { location.href = '/conseil'; });
    await fenetre.getByRole('button', { name: 'Rejoindre' }).click();
    const vuParElectron = await videoVivante(fenetre, 3);
    if (!vuParElectron) console.log('  Electron :', JSON.stringify(await fenetre.evaluate(() => [...document.querySelectorAll('humalis-reunion video')].map((v) => [v.videoWidth, v.paused, v.readyState, v.muted]))));
    verifier(vuParElectron, 'bureau : Electron voit les images de la réunion');
    verifier(await videoVivante(awa, 3), 'bureau : le navigateur voit l’image d’Electron');
    await application.close();
  }
  verifier(erreurs.length === 0, `aucune erreur de page ${erreurs.join(' | ').slice(0, 400)}`);
} catch (erreur) {
  verifier(false, String(erreur).slice(0, 500));
} finally {
  for (const n of navigateurs) await n.close();
  if (!garder) for (const p of processus) p.kill();
}
console.log(problemes.length ? `\n${problemes.length} problème(s).` : '\nTout est vérifié.');
if (!garder) process.exit(problemes.length ? 1 : 0);
