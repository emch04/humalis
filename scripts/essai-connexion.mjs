// Vérifie en vrai la connexion depuis une page (décision L5) :
// exemples/avis.humalis, où seule une personne connectée publie un avis.
// On compile les deux projets, on démarre le serveur et la page (avec son
// relais), puis, dans Chromium : un visiteur ne voit pas le formulaire, un
// mauvais mot de passe est refusé, le bon connecte, l'avis publié apparaît,
// et la déconnexion referme la porte. Les deux formulaires de la page
// s'envoient par la touche Entrée ; l'avis est obligatoire, et son champ
// est vidé après la publication.
//
// Lancer : npm run build && npm run essai:connexion [dossier-de-travail]
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-connexion'));
rmSync(travail, { recursive: true, force: true });
const web = join(travail, 'web');
const serveur = join(travail, 'serveur');
const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};
const source = 'exemples/avis.humalis';
const EMAIL = 'admin@avis.cd';
const MOT_DE_PASSE = 'Admin-Solide-2026!';

execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'serveur', '--sortie', serveur], { stdio: 'inherit' });
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'web', '--sortie', web, '--adresse', 'https://avis.exemple.cd'], { stdio: 'inherit' });
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
/** Une création d'avis faite par la page elle-même (cookie de session et jeton CSRF du navigateur). */
const creerDepuisLaPage = (page, commentaire) =>
  page.evaluate(async (commentaire) => {
    const jeton = document.cookie.match(/(?:^|; )astratra_csrf=([^;]*)/)?.[1] ?? '';
    const reponse = await fetch('/api/avis', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': decodeURIComponent(jeton) },
      body: JSON.stringify({ commentaire }),
    });
    return reponse.status;
  }, commentaire);

const { chromium } = createRequire(join(web, 'package.json'))('playwright');
const navigateur = await chromium.launch();
try {
  const contexte = await navigateur.newContext();
  const page = await contexte.newPage();
  await page.goto(adresseWeb);

  // 1. Un visiteur.
  verifier(await visible(page.getByText('Connectez-vous pour laisser un avis.')), 'un visiteur voit l’invitation à se connecter');
  verifier(await page.getByRole('button', { name: 'Publier' }).count() === 0, 'un visiteur ne voit pas le formulaire d’avis');
  verifier(await creerDepuisLaPage(page, 'Avis de visiteur') === 401, 'le serveur refuse l’avis d’un visiteur (401)');
  const motDePasse = page.locator('[data-humalis="champ_mot_de_passe"]');
  verifier(await motDePasse.getAttribute('type') === 'password', 'le mot de passe s’écrit dans un champ caché (type="password")');

  // 2. Un mauvais mot de passe.
  await page.locator('[data-humalis="champ_email"]').fill(EMAIL);
  await motDePasse.fill('Pas-Le-Bon-2026!');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  verifier(await visible(page.getByRole('alert').getByText('Email ou mot de passe incorrect.')), 'un mauvais mot de passe affiche « Email ou mot de passe incorrect. »');
  verifier(await page.getByText('Bienvenue').count() === 0, 'après un échec, la suite de l’événement ne s’exécute pas (pas de « Bienvenue »)');
  verifier(await page.getByRole('button', { name: 'Publier' }).count() === 0, 'après un échec, la personne reste visiteuse');
  verifier(await motDePasse.inputValue() === '', 'le mot de passe est effacé du champ après l’envoi');
  await page.screenshot({ path: join(travail, '1-mauvais-mot-de-passe.png'), fullPage: true });

  // 3. Le bon mot de passe, envoyé par la touche Entrée (un formulaire).
  await motDePasse.fill(MOT_DE_PASSE);
  await motDePasse.press('Enter');
  verifier(await visible(page.getByRole('button', { name: 'Publier' })), 'avec le bon mot de passe, le formulaire d’avis apparaît');
  verifier(await visible(page.getByText('Bienvenue')), 'puis « Bienvenue » s’affiche');
  const cookies = await contexte.cookies();
  const session = cookies.find((c) => c.name === 'astratra_session');
  verifier(session?.httpOnly === true, 'la session est le cookie astratra_session HttpOnly du pack');
  const vuParLaPage = await page.evaluate(() => ({ cookies: document.cookie, stockage: localStorage.length + sessionStorage.length }));
  verifier(!vuParLaPage.cookies.includes('astratra_session') && vuParLaPage.stockage === 0, 'la page ne voit ni ne garde aucun jeton (cookie illisible, stockage vide)');

  // 4. L'avis publié (un formulaire : champ obligatoire, Entrée, champ vidé).
  const commentaire = page.locator('[data-humalis="champ_commentaire"]');
  await page.getByRole('button', { name: 'Publier' }).click();
  verifier(await visible(page.getByRole('alert').getByText('Le champ « commentaire » est obligatoire.')), 'un avis vide n’est pas envoyé : « Le champ « commentaire » est obligatoire. »');
  await commentaire.fill('Livraison rapide, très bon livre.');
  await commentaire.press('Enter');
  verifier(await visible(page.getByText('Livraison rapide, très bon livre.')), 'Entrée publie l’avis : il est créé et apparaît dans la page');
  verifier(await commentaire.inputValue() === '', 'après la publication, le champ « commentaire » est vidé');
  const lus = await (await fetch(`http://127.0.0.1:${port}/api/avis`)).json();
  verifier(lus.length === 1 && lus[0].commentaire === 'Livraison rapide, très bon livre.', 'le serveur a bien enregistré l’avis');
  await page.screenshot({ path: join(travail, '2-connecte.png'), fullPage: true });

  // 5. Après un rechargement, la session est relue sur /auth/me.
  await page.reload();
  verifier(await visible(page.getByRole('button', { name: 'Publier' })), 'après un rechargement, la personne est toujours connectée (lu sur /auth/me)');

  // 6. La déconnexion.
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  verifier(await visible(page.getByText('Connectez-vous pour laisser un avis.')), 'après « se deconnecter », le formulaire de connexion revient');
  verifier(!(await contexte.cookies()).some((c) => c.name === 'astratra_session' && c.value !== ''), 'le cookie de session est effacé');
  verifier(await creerDepuisLaPage(page, 'Avis après déconnexion') === 401, 'le serveur refuse de nouveau l’avis (401)');
  await page.screenshot({ path: join(travail, '3-deconnecte.png'), fullPage: true });
} finally {
  await navigateur.close();
  for (const p of processus) p.kill();
}

console.log(`Captures : ${travail}`);
console.log(problemes.length === 0 ? 'Tout est vérifié.' : `${problemes.length} problème(s).`);
process.exit(problemes.length === 0 ? 0 : 1);
