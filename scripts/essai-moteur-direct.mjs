// Vérifie en vrai le temps réel du moteur, avec le vrai serveur produit par Humalis :
// une page se met à jour quand le serveur change, sans recharger, et rien de privé ne passe par ce canal.
//
// Lancer : npm run build && node scripts/essai-moteur-direct.mjs [dossier-de-travail]
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-direct'));
mkdirSync(travail, { recursive: true });
const { chromium } = createRequire(import.meta.url)('playwright');
const problemes = [];
const verifier = (ok, message) => {
  if (!ok) problemes.push(message);
  console.log(`${ok ? '✓' : '✗'} ${message}`);
};
const source = 'essais/moteur/direct.humalis';
const serveur = join(travail, 'serveur');
const web = join(travail, 'web');
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'serveur', '--sortie', serveur], { stdio: ['ignore', 'ignore', 'pipe'] });
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'web', '--moteur', 'humalis', '--sortie', web], { stdio: ['ignore', 'ignore', 'pipe'] });
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund', '--silent'], { cwd: serveur, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: serveur, stdio: 'ignore' });
execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: web, stdio: 'inherit' });
execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: web, stdio: 'inherit' });

const port = 5500 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}`;
const processus = [];
const lancer = (commande, args, options, pret) => new Promise((ok) => {
  const p = spawn(commande, args, options);
  processus.push(p);
  p.stdout.on('data', (m) => {
    const trouve = pret(String(m));
    if (trouve) ok(trouve);
  });
});
const EMAIL = 'admin@club.cd';
const MOT = 'Admin-Solide-1!';
await lancer('node', ['dist/src/demarrer.js'], { cwd: serveur, env: { ...process.env, JWT_SECRET: randomBytes(32).toString('hex'), HUMALIS_ADMIN_EMAIL: EMAIL, HUMALIS_ADMIN_MOT_DE_PASSE: MOT, PORT: String(port) } }, (m) => m.includes('prêt'));
const adresse = await lancer(join(web, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0', '--strictPort', 'false'], { cwd: web, env: { ...process.env, HUMALIS_SERVEUR: base } }, (m) => m.match(/http:\/\/localhost:\d+/)?.[0]);

const navigateur = await chromium.launch();
try {
  const json = { 'content-type': 'application/json' };
  const jeton = (await (await fetch(`${base}/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: EMAIL, password: MOT }) })).json()).data.token;
  const creer = (route, nom) => fetch(`${base}/api/${route}`, { method: 'POST', headers: { ...json, authorization: `Bearer ${jeton}` }, body: JSON.stringify({ nom }) });

  const page = await navigateur.newPage();
  const erreurs = [];
  const lectures = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('request', (r) => { if (r.url().endsWith('/api/produits')) lectures.push(r.url()); });
  await page.goto(adresse);
  await page.getByText('Aucun produit').waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__memePage = true; });

  verifier((await creer('produits', 'Livre rouge')).status === 201, 'l’admin crée un produit, depuis ailleurs');
  verifier(await page.getByText('Livre rouge').waitFor({ timeout: 4000 }).then(() => true, () => false), 'la page l’affiche toute seule');
  verifier(await page.evaluate(() => window.__memePage === true), '… sans recharger');
  verifier(await page.getByText('Aucun produit').count() === 0, '… et « Aucun produit » a disparu');
  await creer('produits', 'Livre vert');
  verifier(await page.getByText('Livre vert').waitFor({ timeout: 4000 }).then(() => true, () => false), 'un deuxième changement arrive aussi');

  // Ce que transporte le canal : une annonce, jamais une donnée.
  const controle = new AbortController();
  const flux = await fetch(`${base}/api/produits/direct`, { signal: controle.signal });
  const lecteur = flux.body.getReader();
  await creer('produits', 'Secret du canal');
  let recu = '';
  const decodeur = new TextDecoder();
  for (let i = 0; i < 4 && !recu.includes('change'); i++) recu += decodeur.decode((await lecteur.read()).value);
  controle.abort();
  verifier(recu.includes('data: change') && !recu.includes('Secret du canal'), 'le canal annonce un changement, sans aucune donnée');
  verifier((await fetch(`${base}/api/commandes/direct`)).status === 401, 'une route réservée refuse le canal à un visiteur');

  // Quitter la page ferme l'écoute.
  await page.getByRole('link', { name: 'Autre' }).click();
  await page.getByRole('heading', { name: 'Autre page' }).waitFor();
  const avant = lectures.length;
  await creer('produits', 'Après le départ');
  await page.waitForTimeout(800);
  verifier(lectures.length === avant, 'après avoir quitté la page, plus rien n’est relu');
  verifier(erreurs.length === 0, `aucune erreur ${erreurs.join(' | ').slice(0, 300)}`);
} finally {
  await navigateur.close();
  for (const p of processus) p.kill();
}
console.log(problemes.length ? `\n${problemes.length} problème(s).` : '\nTout est vérifié.');
process.exit(problemes.length ? 1 : 0);
