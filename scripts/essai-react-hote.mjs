// Vérifie en vrai l'étape 2, sens 1 : un projet React écrit à la main
// (essais/react-hote) importe les pages Humalis de la boutique, compilées
// en mode --composants, et elles marchent dans Chromium.
//
// Lancer : npm run build && npm run essai:react-hote
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const hote = resolve('essais/react-hote');
const pages = join(hote, 'src', 'humalis-boutique');
const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};
const apparait = (element) => element.waitFor({ timeout: 5000 }).then(() => true, () => false);

rmSync(pages, { recursive: true, force: true });
execFileSync('node', ['dist/cli.js', 'compile', 'exemples/boutique.humalis', '--cible', 'web', '--composants', pages], { stdio: 'inherit' });
execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: hote, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: hote, stdio: 'inherit' });

const serveur = spawn(join(hote, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0', '--strictPort', 'false'], { cwd: hote });
const adresse = await new Promise((ok) => serveur.stdout.on('data', (m) => {
  const trouve = String(m).match(/http:\/\/localhost:\d+/);
  if (trouve) ok(trouve[0]);
}));

const { chromium } = createRequire(join(hote, 'package.json'))('playwright');
const navigateur = await chromium.launch();
try {
  const page = await navigateur.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  await page.goto(adresse);
  verifier(await apparait(page.getByText('Projet React hôte')), 'hôte : l\'en-tête écrit à la main en React s\'affiche');
  verifier(await apparait(page.getByRole('heading', { name: 'Nos produits' })), 'hôte : la page Humalis « Boutique » s\'affiche dans le projet React');
  await page.getByRole('button', { name: 'Ajouter' }).nth(1).click();
  verifier((await page.getByText(/Articles dans le panier/).textContent()) === 'Articles dans le panier : 1', 'hôte : « Ajouter » marche dans la page importée');
  await page.getByRole('link', { name: 'Panier' }).click();
  verifier(await apparait(page.getByText('Stylo')), 'hôte : le panier partagé suit, par un lien du projet React');
  await page.screenshot({ path: join(hote, 'dist', 'capture-hote.png'), fullPage: true });
  verifier(erreurs.length === 0, `hôte : aucune erreur dans la console${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);
} finally {
  await navigateur.close();
  serveur.kill();
}

console.log(problemes.length === 0 ? 'Tout est vérifié.' : `${problemes.length} problème(s).`);
process.exit(problemes.length === 0 ? 0 : 1);
