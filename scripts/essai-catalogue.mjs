// Vérifie en vrai une page à paramètre (trou G3) : exemples/catalogue.humalis.
// On compile les deux projets, on démarre le serveur (deux produits créés par
// l'admin) et la page (avec son relais), puis, dans Chromium : le catalogue
// liste les produits, un lien mène à /produit/<id>, cette page lit ce seul
// produit, une adresse ouverte directement marche aussi, et un identifiant
// inconnu laisse la page en attente avec un message.
//
// Lancer : npm run build && npm run essai:catalogue [dossier-de-travail]
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-catalogue'));
rmSync(travail, { recursive: true, force: true });
const web = join(travail, 'web');
const serveur = join(travail, 'serveur');
const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};
const source = 'exemples/catalogue.humalis';
const EMAIL = 'admin@boutique.cd';
const MOT_DE_PASSE = 'Admin-Solide-2026!';

execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'serveur', '--sortie', serveur], { stdio: 'inherit' });
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'web', '--sortie', web, '--adresse', 'https://catalogue.exemple.cd'], { stdio: 'inherit' });
// npm 11 (celui de Node 24) : npm 10 échoue parfois sur « edgesOut ».
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund'], { cwd: serveur, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: serveur, stdio: 'inherit' });
execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: web, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: web, stdio: 'inherit' });
verifier(true, 'les deux projets produits passent tsc et se construisent (prérendu compris)');

const port = 5200 + Math.floor(Math.random() * 90);
const processus = [];
const lancer = (commande, args, options, pret) =>
  new Promise((ok) => {
    const p = spawn(commande, args, options);
    processus.push(p);
    p.stdout.on('data', (m) => {
      const trouve = pret(String(m));
      if (trouve) ok(trouve);
    });
  });

await lancer('node', ['dist/src/demarrer.js'], {
  cwd: serveur,
  env: { ...process.env, JWT_SECRET: randomBytes(32).toString('hex'), HUMALIS_ADMIN_EMAIL: EMAIL, HUMALIS_ADMIN_MOT_DE_PASSE: MOT_DE_PASSE, PORT: String(port) },
}, (m) => m.includes('prêt'));
const adresseWeb = await lancer(join(web, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0', '--strictPort', 'false'], {
  cwd: web,
  env: { ...process.env, HUMALIS_SERVEUR: `http://127.0.0.1:${port}` },
}, (m) => m.match(/http:\/\/localhost:\d+/)?.[0]);

const visible = (locator) => locator.waitFor({ timeout: 5000 }).then(() => true, () => false);

// L'admin crée deux produits, directement sur le serveur (connexion du pack).
const API = `http://127.0.0.1:${port}`;
const connexion = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: MOT_DE_PASSE }) });
const { data } = await connexion.json();
const creer = async (produit) =>
  (await (await fetch(`${API}/api/produits`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${data.token}` }, body: JSON.stringify(produit) })).json());
const livre = await creer({ nom: 'Livre', prix: 12 });
const stylo = await creer({ nom: 'Stylo', prix: 3 });
verifier(Boolean(livre.id && stylo.id), 'deux produits créés sur le serveur');

const { chromium } = createRequire(join(web, 'package.json'))('playwright');
const navigateur = await chromium.launch();
try {
  const page = await navigateur.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(adresseWeb);
  verifier(await visible(page.getByRole('link', { name: 'Livre' })), 'le catalogue liste « Livre »');
  verifier(await visible(page.getByRole('link', { name: 'Stylo' })), '… et « Stylo »');
  verifier((await page.getByRole('link', { name: 'Stylo' }).getAttribute('href')) === `/produit/${stylo.id}`, 'le lien mène à /produit/<identifiant du Stylo>');

  await page.getByRole('link', { name: 'Stylo' }).click();
  verifier(await visible(page.getByRole('heading', { name: 'Stylo' })), 'la page « produit » affiche le Stylo, lu seul par son identifiant');
  verifier(await visible(page.getByText('3 €')), '… et son prix (3 €)');
  verifier(page.url().endsWith(`/produit/${stylo.id}`), 'l’adresse est /produit/<identifiant>');
  await page.screenshot({ path: join(travail, '1-produit.png'), fullPage: true });

  // Une adresse ouverte directement (un lien partagé, un rechargement).
  await page.goto(`${adresseWeb}/produit/${livre.id}`);
  verifier(await visible(page.getByRole('heading', { name: 'Livre' })), 'une adresse /produit/<id> ouverte directement affiche le Livre');

  await page.getByRole('link', { name: 'Retour au catalogue' }).click();
  verifier(await visible(page.getByRole('heading', { name: 'Le catalogue' })), 'le lien « Retour au catalogue » ramène au catalogue');

  // Un identifiant inconnu : le serveur répond 404, la page le dit et reste en attente.
  await page.goto(`${adresseWeb}/produit/inconnu`);
  verifier(await visible(page.getByRole('alert')), 'un identifiant inconnu affiche un message d’erreur');
  verifier(await visible(page.getByText('Chargement du produit…')), '… et la page ne casse pas (« est rien » reste vrai)');
  verifier(erreurs.length === 0, `aucune erreur JavaScript${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);
} finally {
  await navigateur.close();
  for (const p of processus) p.kill();
}

console.log(`Captures : ${travail}`);
console.log(problemes.length === 0 ? 'Tout est vérifié.' : `${problemes.length} problème(s).`);
process.exit(problemes.length === 0 ? 0 : 1);
