// Vérifie en vrai une page à paramètre : exemples/catalogue.humalis, une liste
// de produits et une page par produit à l'adresse /produit/<son identifiant>.
// On compile le serveur et la page (React, ou le moteur de rendu avec
// HUMALIS_MOTEUR=humalis), on démarre le serveur (deux produits créés par
// l'admin ; un visiteur ne peut pas en créer) et la page (avec son relais),
// puis, dans Chromium :
// - le catalogue liste les produits, chaque lien mène à /produit/<id> ;
// - cette page lit ce seul produit (nom et prix) ;
// - une adresse ouverte directement marche aussi, et le retour au catalogue ;
// - un identifiant inconnu : le serveur répond 404, la page reste sur
//   « Chargement du produit… » sans faux message d'erreur ni exception.
//
// Lancer : npm run build && npm run essai:catalogue [dossier-de-travail]
// (ou HUMALIS_TRAVAIL=…). Playwright est cherché dans NODE_PATH.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chargerPlaywright, lancerProcessus, portLibre } from './outils-essai.mjs';

const travail = resolve(process.argv[2] ?? process.env.HUMALIS_TRAVAIL ?? join(tmpdir(), 'humalis-essai-catalogue'));
rmSync(travail, { recursive: true, force: true });
const web = join(travail, 'web');
const serveur = join(travail, 'serveur');
const moteur = process.env.HUMALIS_MOTEUR;
const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};
const source = 'exemples/catalogue.humalis';
const EMAIL = 'admin@boutique.test';
const MOT_DE_PASSE = 'Admin-Solide-2026!';

// 1. Les deux projets : compilés, installés, vérifiés par tsc, construits (prérendu compris pour React).
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'serveur', '--sortie', serveur], { stdio: 'inherit' });
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'web', ...(moteur ? ['--moteur', moteur] : []), '--sortie', web, '--adresse', 'https://catalogue.exemple.test'], { stdio: 'inherit' });
for (const dossier of [serveur, web]) {
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: dossier, stdio: 'inherit' });
}
verifier(true, 'les deux projets produits passent tsc et se construisent');

const processus = [];
const { chromium } = chargerPlaywright();
let navigateur;
try {
  const port = await portLibre();
  const API = `http://127.0.0.1:${port}`;
  await lancerProcessus(processus, 'node', ['dist/src/demarrer.js'], {
    cwd: serveur,
    env: { ...process.env, JWT_SECRET: randomBytes(32).toString('hex'), HUMALIS_ADMIN_EMAIL: EMAIL, HUMALIS_ADMIN_MOT_DE_PASSE: MOT_DE_PASSE, PORT: String(port) },
  }, (sortie) => sortie.includes('prêt'));
  const adresseWeb = await lancerProcessus(processus, join(web, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0', '--strictPort', 'false'], {
    cwd: web,
    env: { ...process.env, HUMALIS_SERVEUR: API },
  }, (sortie) => sortie.match(/http:\/\/localhost:\d+/)?.[0]);

  // 2. Les produits : seul l'admin en crée (« seul admin peut modifier produit »), directement sur le serveur.
  const json = { 'content-type': 'application/json' };
  const refus = await fetch(`${API}/api/produits`, { method: 'POST', headers: json, body: JSON.stringify({ nom: 'Pirate', prix: 1 }) });
  verifier([401, 403].includes(refus.status), `un visiteur ne peut pas créer de produit (${refus.status})`);
  const connexion = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: EMAIL, password: MOT_DE_PASSE }) })).json();
  const jeton = connexion?.data?.token;
  verifier(typeof jeton === 'string' && jeton.length > 0, 'l’admin se connecte au serveur');
  const creer = async (produit) => (await fetch(`${API}/api/produits`, { method: 'POST', headers: { ...json, authorization: `Bearer ${jeton}` }, body: JSON.stringify(produit) })).json();
  const livre = await creer({ nom: 'Livre', prix: 12 });
  const stylo = await creer({ nom: 'Stylo', prix: 3 });
  verifier(Boolean(livre.id && stylo.id), 'deux produits créés sur le serveur');
  const inconnu = await fetch(`${API}/api/produits/inconnu`);
  verifier(inconnu.status === 404, `le serveur répond 404 pour un identifiant inconnu (${inconnu.status})`);

  const visible = (locator) => locator.first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  navigateur = await chromium.launch();
  const page = await navigateur.newPage({ locale: 'fr-FR' });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));

  // 3. Le catalogue, puis la page d'un produit par son lien.
  await page.goto(adresseWeb);
  verifier(await visible(page.getByRole('heading', { name: 'Le catalogue' })), 'le catalogue s’ouvre');
  verifier(await visible(page.getByRole('link', { name: 'Livre' })), 'le catalogue liste « Livre »');
  verifier(await visible(page.getByRole('link', { name: 'Stylo' })), '… et « Stylo »');
  verifier((await page.getByRole('link', { name: 'Stylo' }).getAttribute('href')) === `/produit/${stylo.id}`, 'le lien mène à /produit/<identifiant du Stylo>');

  await page.getByRole('link', { name: 'Stylo' }).click();
  verifier(await visible(page.getByRole('heading', { name: 'Stylo' })), 'la page « produit » affiche le Stylo, lu seul par son identifiant');
  verifier(await visible(page.getByText('3 €')), '… et son prix (3 €)');
  verifier(page.url().endsWith(`/produit/${stylo.id}`), 'l’adresse est /produit/<identifiant>');
  verifier(await page.getByRole('heading', { name: 'Livre' }).count() === 0, '… et seulement lui (pas le Livre)');
  await page.screenshot({ path: join(travail, '1-produit.png'), fullPage: true });

  // 4. Une adresse ouverte directement (un lien partagé, un rechargement), puis le retour.
  await page.goto(`${adresseWeb}/produit/${livre.id}`);
  verifier(await visible(page.getByRole('heading', { name: 'Livre' })), 'une adresse /produit/<id> ouverte directement affiche le Livre');
  verifier(await visible(page.getByText('12 €')), '… et son prix (12 €)');
  await page.getByRole('link', { name: 'Retour au catalogue' }).click();
  verifier(await visible(page.getByRole('heading', { name: 'Le catalogue' })), 'le lien « Retour au catalogue » ramène au catalogue');

  // 5. Un identifiant inconnu : la page reste sur son état de départ (« si produit est rien »), sans faux message.
  const reponses = [];
  page.on('response', (r) => r.url().includes('/api/produits/inconnu') && reponses.push(r.status()));
  await page.goto(`${adresseWeb}/produit/inconnu`);
  await page.waitForLoadState('networkidle');
  verifier(reponses.includes(404), `la page a demandé ce produit et reçu 404 (${reponses.join(', ') || 'aucune demande'})`);
  verifier(await page.getByRole('alert').count() === 0, 'un identifiant inconnu (404) ne dit pas faussement que le serveur n’a pas répondu');
  verifier(await visible(page.getByText('Chargement du produit…')), '… et la page ne casse pas (« est rien » reste vrai)');
  verifier(await visible(page.getByRole('link', { name: 'Retour au catalogue' })), '… le retour au catalogue reste offert');
  verifier(erreurs.length === 0, `aucune erreur JavaScript${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);
} finally {
  await navigateur?.close();
  for (const p of processus) p.kill();
}

console.log(`Captures : ${travail}`);
console.log(problemes.length === 0 ? 'Tout est vérifié.' : `${problemes.length} problème(s).`);
process.exit(problemes.length === 0 ? 0 : 1);
