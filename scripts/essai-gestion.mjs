// Vérifie en vrai « modifier » et « supprimer » depuis une page (trou G2) :
// exemples/gestion.humalis, où seul l'administrateur change un prix ou
// supprime un produit. On compile les deux projets, on démarre le serveur et
// la page (avec son relais), puis, dans Chromium : un visiteur ne peut rien
// supprimer, l'admin connecté baisse un prix et supprime un produit, et le
// serveur l'a bien enregistré.
//
// Lancer : npm run build && npm run essai:gestion [dossier-de-travail]
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-gestion'));
rmSync(travail, { recursive: true, force: true });
const web = join(travail, 'web');
const serveur = join(travail, 'serveur');
const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};
const source = 'exemples/gestion.humalis';
const EMAIL = 'admin@boutique.cd';
const MOT_DE_PASSE = 'Admin-Solide-2026!';

execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'serveur', '--sortie', serveur], { stdio: 'inherit' });
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'web', '--sortie', web, '--adresse', 'https://gestion.exemple.cd'], { stdio: 'inherit' });
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
const API = `http://127.0.0.1:${port}/api/produits`;
/** Une requête faite par la page elle-même (cookie de session et jeton CSRF du navigateur). */
const depuisLaPage = (page, methode, adresse, corps) =>
  page.evaluate(async ({ methode, adresse, corps }) => {
    const jeton = document.cookie.match(/(?:^|; )astratra_csrf=([^;]*)/)?.[1] ?? '';
    const reponse = await fetch(adresse, {
      method: methode,
      headers: { 'content-type': 'application/json', 'x-csrf-token': decodeURIComponent(jeton) },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    return { statut: reponse.status, corps: reponse.status === 204 ? null : await reponse.json().catch(() => null) };
  }, { methode, adresse, corps });

const { chromium } = createRequire(join(web, 'package.json'))('playwright');
const navigateur = await chromium.launch();
try {
  const contexte = await navigateur.newContext();
  const page = await contexte.newPage();
  await page.goto(adresseWeb);

  // 1. Un visiteur : il ne voit pas la gestion, et le serveur refuse ses suppressions.
  verifier(await visible(page.getByText('Réservé à l\'administrateur.')), 'un visiteur voit « Réservé à l’administrateur. »');
  verifier(await page.getByRole('button', { name: 'Supprimer' }).count() === 0, 'un visiteur ne voit aucun bouton « Supprimer »');

  // 2. L'admin se connecte et crée deux produits.
  await page.locator('[data-humalis="champ_email"]').fill(EMAIL);
  await page.locator('[data-humalis="champ_mot_de_passe"]').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  verifier(await visible(page.getByRole('button', { name: 'Se déconnecter' })), 'l’admin est connecté');
  const livre = await depuisLaPage(page, 'POST', '/api/produits', { nom: 'Livre', prix: 12 });
  await depuisLaPage(page, 'POST', '/api/produits', { nom: 'Stylo', prix: 3 });
  verifier(livre.statut === 201, 'deux produits créés sur le serveur');
  await page.reload();
  verifier(await visible(page.getByText('Livre : 12 €')), 'la page affiche « Livre : 12 € »');
  verifier(await visible(page.getByText('Stylo : 3 €')), '… et « Stylo : 3 € »');

  // Un visiteur (un autre navigateur, sans session) ne peut pas supprimer.
  const visiteur = await (await navigateur.newContext()).newPage();
  await visiteur.goto(adresseWeb);
  await visiteur.waitForTimeout(500);
  const refus = await depuisLaPage(visiteur, 'DELETE', `/api/produits/${livre.corps.id}`);
  verifier(refus.statut === 401, `le serveur refuse la suppression d’un visiteur (${refus.statut})`);

  // 3. « modifier p dans "produits" avec prix = p.prix - 1 ».
  await page.getByRole('button', { name: 'Baisser le prix' }).first().click();
  verifier(await visible(page.getByText('Livre : 11 €')), '« Baisser le prix » change le prix affiché (Livre : 11 €)');
  let lus = await (await fetch(API)).json();
  verifier(lus.find((p) => p.nom === 'Livre')?.prix === 11, 'le serveur a enregistré le nouveau prix (11)');
  verifier(lus.find((p) => p.nom === 'Livre')?.nom === 'Livre', 'les autres champs n’ont pas changé (modification partielle)');
  await page.screenshot({ path: join(travail, '1-prix-baisse.png'), fullPage: true });

  // 4. « supprimer p de "produits" ».
  await page.getByRole('button', { name: 'Supprimer' }).first().click();
  verifier(await visible(page.getByText('Produit supprimé')), 'le message « Produit supprimé » s’affiche');
  await page.getByText('Livre : 11 €').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  verifier(await page.getByText('Livre : 11 €').count() === 0, 'le Livre disparaît de la page');
  verifier(await visible(page.getByText('Stylo : 3 €')), 'le Stylo reste');
  lus = await (await fetch(API)).json();
  verifier(lus.length === 1 && lus[0].nom === 'Stylo', 'le serveur n’a plus que le Stylo');
  await page.screenshot({ path: join(travail, '2-supprime.png'), fullPage: true });
} finally {
  await navigateur.close();
  for (const p of processus) p.kill();
}

console.log(`Captures : ${travail}`);
console.log(problemes.length === 0 ? 'Tout est vérifié.' : `${problemes.length} problème(s).`);
process.exit(problemes.length === 0 ? 0 : 1);
