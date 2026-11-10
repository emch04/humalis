// Vérifie en vrai la connexion depuis une page : exemples/avis.humalis, où tout
// le monde lit les avis et seule une personne connectée en publie.
// On compile le serveur et la page (React, ou le moteur de rendu avec
// HUMALIS_MOTEUR=humalis), on les démarre (la page avec son relais vers le
// serveur), puis, dans Chromium :
// - un visiteur ne voit pas le formulaire d'avis, et le serveur le refuse (401) ;
// - un mauvais mot de passe est refusé, sans exécuter la suite de l'événement ;
// - le bon connecte (formulaire envoyé par Entrée) : la session est un cookie
//   HttpOnly, la page ne garde ni jeton ni mot de passe ;
// - l'avis est obligatoire, Entrée le publie, son champ est vidé, le serveur l'a ;
// - un autre visiteur lit l'avis publié ;
// - la session survit au rechargement (/auth/me) ;
// - la déconnexion efface le cookie, dit « À bientôt », et le serveur refuse de nouveau.
//
// Lancer : npm run build && npm run essai:connexion [dossier-de-travail]
// (ou HUMALIS_TRAVAIL=…). Playwright est cherché dans NODE_PATH.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chargerPlaywright, lancerProcessus, portLibre } from './outils-essai.mjs';

const travail = resolve(process.argv[2] ?? process.env.HUMALIS_TRAVAIL ?? join(tmpdir(), 'humalis-essai-connexion'));
rmSync(travail, { recursive: true, force: true });
const web = join(travail, 'web');
const serveur = join(travail, 'serveur');
const moteur = process.env.HUMALIS_MOTEUR;
const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};
const source = 'exemples/avis.humalis';
const EMAIL = 'admin@avis.test';
const MOT_DE_PASSE = 'Admin-Solide-2026!';
const COMMENTAIRE = 'Livraison rapide, très bon livre.';

// 1. Les deux projets : compilés, installés, vérifiés par tsc, construits (prérendu compris pour React).
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'serveur', '--sortie', serveur], { stdio: 'inherit' });
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'web', ...(moteur ? ['--moteur', moteur] : []), '--sortie', web, '--adresse', 'https://avis.exemple.test'], { stdio: 'inherit' });
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

  const visible = (locator) => locator.first().waitFor({ timeout: 5000 }).then(() => true, () => false);
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

  navigateur = await chromium.launch();
  const contexte = await navigateur.newContext({ locale: 'fr-FR' });
  const page = await contexte.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(adresseWeb);

  // 2. Un visiteur.
  verifier(await visible(page.getByText('Connectez-vous pour laisser un avis.')), 'un visiteur voit l’invitation à se connecter');
  verifier(await visible(page.getByText('Aucun avis pour l\'instant.')), 'un visiteur lit la liste des avis (vide pour l’instant)');
  verifier(await page.getByRole('button', { name: 'Publier' }).count() === 0, 'un visiteur ne voit pas le formulaire d’avis');
  verifier(await creerDepuisLaPage(page, 'Avis de visiteur') === 401, 'le serveur refuse l’avis d’un visiteur (401)');
  const motDePasse = page.locator('[data-humalis="champ_mot_de_passe"]');
  verifier(await motDePasse.getAttribute('type') === 'password', 'le mot de passe s’écrit dans un champ caché (type="password")');

  // 3. Un mauvais mot de passe.
  await page.locator('[data-humalis="champ_email"]').fill(EMAIL);
  await motDePasse.fill('Pas-Le-Bon-2026!');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  verifier(await visible(page.getByRole('alert').getByText('Email ou mot de passe incorrect.')), 'un mauvais mot de passe affiche « Email ou mot de passe incorrect. »');
  verifier(await page.getByText('Bienvenue').count() === 0, 'après un échec, la suite de l’événement ne s’exécute pas (pas de « Bienvenue »)');
  verifier(await page.getByRole('button', { name: 'Publier' }).count() === 0, 'après un échec, la personne reste visiteuse');
  verifier(await motDePasse.inputValue() === '', 'le mot de passe est effacé du champ après l’envoi');
  await page.screenshot({ path: join(travail, '1-mauvais-mot-de-passe.png'), fullPage: true });

  // 4. Le bon mot de passe, envoyé par la touche Entrée (un formulaire).
  await motDePasse.fill(MOT_DE_PASSE);
  await motDePasse.press('Enter');
  verifier(await visible(page.getByRole('button', { name: 'Publier' })), 'avec le bon mot de passe, le formulaire d’avis apparaît');
  verifier(await visible(page.getByText('Bienvenue')), 'puis « Bienvenue » s’affiche');
  const session = (await contexte.cookies()).find((c) => c.name === 'astratra_session');
  verifier(session?.httpOnly === true, 'la session est le cookie astratra_session HttpOnly du pack');
  // La page garde des choses à elle (l'état de la session, ses lectures), jamais un jeton ni le mot de passe.
  const vuParLaPage = await page.evaluate(() => ({ cookies: document.cookie, stockage: JSON.stringify([{ ...localStorage }, { ...sessionStorage }]) }));
  verifier(!vuParLaPage.cookies.includes('astratra_session'), 'le cookie de session est illisible pour la page');
  verifier(!/eyJ|token|jeton|Bearer/i.test(vuParLaPage.stockage) && !vuParLaPage.stockage.includes(MOT_DE_PASSE), 'le stockage du navigateur ne contient ni jeton ni mot de passe');

  // 5. L'avis publié (un formulaire : champ obligatoire, Entrée, champ vidé).
  const commentaire = page.locator('[data-humalis="champ_commentaire"]');
  await page.getByRole('button', { name: 'Publier' }).click();
  verifier(await visible(page.getByRole('alert').getByText('Le champ « commentaire » est obligatoire.')), 'un avis vide n’est pas envoyé : « Le champ « commentaire » est obligatoire. »');
  await commentaire.fill(COMMENTAIRE);
  await commentaire.press('Enter');
  verifier(await visible(page.getByText(COMMENTAIRE)), 'Entrée publie l’avis : il est créé et apparaît dans la page');
  verifier(await commentaire.inputValue() === '', 'après la publication, le champ « commentaire » est vidé');
  const lus = await (await fetch(`${API}/api/avis`)).json();
  verifier(Array.isArray(lus) && lus.length === 1 && lus[0].commentaire === COMMENTAIRE, 'le serveur a bien enregistré l’avis');
  await page.screenshot({ path: join(travail, '2-connecte.png'), fullPage: true });

  // 6. Tout le monde lit les avis : un autre visiteur, sans session, voit celui-ci.
  const autre = await navigateur.newContext({ locale: 'fr-FR' });
  const pageAutre = await autre.newPage();
  await pageAutre.goto(adresseWeb);
  verifier(await visible(pageAutre.getByText(COMMENTAIRE)), 'un autre visiteur lit l’avis publié');
  verifier(await pageAutre.getByRole('button', { name: 'Publier' }).count() === 0, '… sans pouvoir en publier');
  await autre.close();

  // 7. Après un rechargement, la session est relue sur /auth/me.
  await page.reload();
  verifier(await visible(page.getByRole('button', { name: 'Publier' })), 'après un rechargement, la personne est toujours connectée (lu sur /auth/me)');

  // 8. La déconnexion.
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  verifier(await visible(page.getByText('Connectez-vous pour laisser un avis.')), 'après « se deconnecter », le formulaire de connexion revient');
  verifier(await visible(page.getByText('À bientôt')), '… et « À bientôt » s’affiche');
  verifier(!(await contexte.cookies()).some((c) => c.name === 'astratra_session' && c.value !== ''), 'le cookie de session est effacé');
  verifier(await creerDepuisLaPage(page, 'Avis après déconnexion') === 401, 'le serveur refuse de nouveau l’avis (401)');
  await page.screenshot({ path: join(travail, '3-deconnecte.png'), fullPage: true });
  verifier(erreurs.length === 0, `aucune erreur JavaScript${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);
} finally {
  await navigateur?.close();
  for (const p of processus) p.kill();
}

console.log(`Captures : ${travail}`);
console.log(problemes.length === 0 ? 'Tout est vérifié.' : `${problemes.length} problème(s).`);
process.exit(problemes.length === 0 ? 0 : 1);
