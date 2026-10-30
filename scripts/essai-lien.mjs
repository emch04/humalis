// Vérifie en vrai l'étape 4 : exemples/boutique-complete.humalis contient
// le serveur et les pages. On compile les deux projets, on démarre le
// serveur, l'admin y crée un produit, puis la page web (servie avec son
// relais vers le serveur) l'affiche dans Chromium.
//
// Lancer : npm run build && npm run essai:lien [dossier-de-travail]
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-lien'));
rmSync(travail, { recursive: true, force: true });
const web = join(travail, 'web');
const serveur = join(travail, 'serveur');
const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};
const source = 'exemples/boutique-complete.humalis';

execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'serveur', '--sortie', serveur], { stdio: 'inherit' });
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'web', '--sortie', web, '--adresse', 'https://boutique.exemple.cd'], { stdio: 'inherit' });
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund'], { cwd: serveur, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: serveur, stdio: 'inherit' });
execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: web, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: web, stdio: 'inherit' });

const port = 5100 + Math.floor(Math.random() * 90);
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
  env: { ...process.env, JWT_SECRET: randomBytes(32).toString('hex'), HUMALIS_ADMIN_EMAIL: 'admin@boutique.cd', HUMALIS_ADMIN_MOT_DE_PASSE: 'Admin-Solide-2026!', PORT: String(port) },
}, (m) => m.includes('prêt'));
const adresseWeb = await lancer(join(web, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0', '--strictPort', 'false'], {
  cwd: web,
  env: { ...process.env, HUMALIS_SERVEUR: `http://127.0.0.1:${port}` },
}, (m) => m.match(/http:\/\/localhost:\d+/)?.[0]);

const { chromium } = createRequire(join(web, 'package.json'))('playwright');
const navigateur = await chromium.launch();
try {
  const page = await navigateur.newPage();
  await page.goto(adresseWeb);
  verifier(await page.getByText('Aucun produit pour l\'instant.').waitFor({ timeout: 5000 }).then(() => true, () => false), 'sans produit sur le serveur, la page le dit');

  // L'admin crée un produit sur le serveur, comme le ferait un back-office.
  const json = { 'content-type': 'application/json' };
  const connexion = await (await fetch(`http://127.0.0.1:${port}/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: 'admin@boutique.cd', password: 'Admin-Solide-2026!' }) })).json();
  const cree = await fetch(`http://127.0.0.1:${port}/api/produits`, { method: 'POST', headers: { ...json, authorization: `Bearer ${connexion.data.token}` }, body: JSON.stringify({ nom: 'Livre', prix: 12 }) });
  verifier(cree.status === 201, 'l\'admin crée « Livre » sur le serveur (201)');

  await page.reload();
  verifier(await page.getByText('Livre').waitFor({ timeout: 5000 }).then(() => true, () => false), 'la page web affiche le produit lu sur son serveur');
  verifier(await page.getByText('12 €').isVisible(), 'le champ p.prix est affiché (« 12 € »)');
  await page.screenshot({ path: join(travail, 'boutique-complete.png'), fullPage: true });
} finally {
  await navigateur.close();
  for (const p of processus) p.kill();
}

console.log(`Capture : ${join(travail, 'boutique-complete.png')}`);
console.log(problemes.length === 0 ? 'Tout est vérifié.' : `${problemes.length} problème(s).`);
process.exit(problemes.length === 0 ? 0 : 1);
