#!/usr/bin/env node
// Vérifie en vrai le temps réel avec le vrai serveur produit par Humalis : deux fenêtres (navigateur, moteur
// et React ; puis Electron) qui se voient en direct, sans recharger. Le serveur reste ouvert si on passe
// --garder : les appareils (iPhone, Android, Windows) peuvent alors s'y brancher.
//
// Lancer : npm run build && node scripts/essai-temps-reel.mjs [dossier-de-travail] [--port 4991] [--garder]
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chargerPlaywright } from './outils-essai.mjs';

const args = process.argv.slice(2);
const garder = args.includes('--garder');
const iPort = args.indexOf('--port');
const port = iPort >= 0 ? Number(args[iPort + 1]) : 5600 + Math.floor(Math.random() * 90);
const positionnels = args.filter((a, i) => !a.startsWith('--') && i !== iPort + 1);
const travail = resolve(positionnels[0] ?? join(tmpdir(), 'humalis-essai-temps-reel'));
mkdirSync(travail, { recursive: true });
const { chromium, _electron } = chargerPlaywright();
const problemes = [];
const verifier = (ok, message) => {
  if (!ok) problemes.push(message);
  console.log(`${ok ? '✓' : '✗'} ${message}`);
};
const source = 'scripts/essais-temps-reel/direct.humalis';
const compiler = (cible, dossier, ...plus) => execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', cible, '--sortie', dossier, ...plus], { stdio: ['ignore', 'ignore', 'pipe'] });
const installer = (dossier) => execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund', '--silent'], { cwd: dossier, stdio: 'inherit' });

const processus = [];
const lancer = (commande, argv, options, pret) => new Promise((ok) => {
  const p = spawn(commande, argv, options);
  processus.push(p);
  p.stdout.on('data', (m) => {
    const trouve = pret(String(m));
    if (trouve) ok(trouve);
  });
});

const serveur = join(travail, 'serveur');
compiler('serveur', serveur);
installer(serveur);
execFileSync('npm', ['run', 'build'], { cwd: serveur, stdio: 'ignore' });
const base = `http://127.0.0.1:${port}`;
await lancer('node', ['dist/src/demarrer.js'], { cwd: serveur, env: { ...process.env, JWT_SECRET: randomBytes(32).toString('hex'), HOST: '0.0.0.0', PORT: String(port) } }, (m) => m.includes('prêt') || m.includes('écoute'));
console.log(`Serveur : ${base}`);

const voit = (page, texte, delai = 6000) => page.getByText(texte).first().waitFor({ timeout: delai }).then(() => true, () => false);
async function ajouter(page, texte) {
  await page.getByLabel('texte').fill(texte);
  await page.getByRole('button', { name: 'Ajouter' }).click();
}
async function deuxFenetres(nom, a, b) {
  const marque = `${nom} ${randomBytes(3).toString('hex')}`;
  await a.evaluate(() => { window.__memePage = true; });
  await b.evaluate(() => { window.__memePage = true; });
  await ajouter(a, `${marque} de A`);
  verifier(await voit(b, `${marque} de A`), `${nom} : la fenêtre B voit la note de A`);
  await ajouter(b, `${marque} de B`);
  verifier(await voit(a, `${marque} de B`), `${nom} : la fenêtre A voit la note de B`);
  verifier(await a.evaluate(() => window.__memePage === true) && await b.evaluate(() => window.__memePage === true), `${nom} : sans recharger`);
}

const navigateur = await chromium.launch();
try {
  for (const moteur of ['humalis', 'react']) {
    const web = join(travail, `web-${moteur}`);
    compiler('web', web, '--moteur', moteur);
    installer(web);
    execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: web, stdio: 'inherit' });
    const adresse = await lancer(join(web, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0', '--strictPort', 'false'], { cwd: web, env: { ...process.env, HUMALIS_SERVEUR: base } }, (m) => m.match(/http:\/\/localhost:\d+/)?.[0]);
    const contexteA = await navigateur.newContext();
    const contexteB = await navigateur.newContext();
    const a = await contexteA.newPage();
    const b = await contexteB.newPage();
    await a.goto(adresse);
    await b.goto(adresse);
    await a.getByRole('heading', { name: 'Notes en direct' }).waitFor();
    await b.getByRole('heading', { name: 'Notes en direct' }).waitFor();
    await a.waitForTimeout(500);
    await deuxFenetres(`web (${moteur})`, a, b);
    await contexteA.close();
    await contexteB.close();
  }

  // Le bureau : Electron et le navigateur se voient, à travers le relais du processus principal.
  if (!args.includes('--sans-bureau')) {
    const bureau = join(travail, 'bureau');
    compiler('desktop', bureau, '--serveur', base);
    installer(bureau);
    spawnSync('node', [join(bureau, 'node_modules/electron/install.js')], { stdio: 'inherit' });
    execFileSync('npm', ['run', 'build'], { cwd: bureau, stdio: 'inherit' });
    const chemin = readFileSync(join(bureau, 'node_modules/electron/path.txt'), 'utf8').trim();
    const executable = join(bureau, 'node_modules/electron/dist', chemin);
    if (!existsSync(executable)) throw new Error(`Electron introuvable : ${executable}`);
    const application = await _electron.launch({ executablePath: executable, args: [bureau], env: { ...process.env, HUMALIS_SERVEUR: base } });
    const fenetre = await application.firstWindow();
    await fenetre.getByRole('heading', { name: 'Notes en direct' }).waitFor();
    const web = join(travail, 'web-humalis');
    const adresse = await lancer(join(web, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0', '--strictPort', 'false'], { cwd: web, env: { ...process.env, HUMALIS_SERVEUR: base } }, (m) => m.match(/http:\/\/localhost:\d+/)?.[0]);
    const page = await navigateur.newPage();
    await page.goto(adresse);
    await page.getByRole('heading', { name: 'Notes en direct' }).waitFor();
    await page.waitForTimeout(500);
    await deuxFenetres('bureau et navigateur', fenetre, page);
    await application.close();
  }
} finally {
  await navigateur.close();
  if (!garder) for (const p of processus) p.kill();
}
console.log(problemes.length ? `\n${problemes.length} problème(s).` : '\nTout est vérifié.');
if (garder) console.log(`Le serveur reste ouvert sur le port ${port}.`);
else process.exit(problemes.length ? 1 : 0);
