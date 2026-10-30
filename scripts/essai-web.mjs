// Vérifie en vrai la cible web (étape 1) : compile les exemples, installe et
// construit chaque projet produit (prérendu compris), le sert, puis le pilote
// dans Chromium comme le ferait un visiteur.
//
// Lancer : npm run build && npm run essai:web [dossier-de-travail]
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-web'));
const captures = join(travail, 'captures');
rmSync(travail, { recursive: true, force: true });
mkdirSync(captures, { recursive: true });

const problemes = [];
/** Vrai si l'élément apparaît dans les 5 secondes. */
const apparait = (element) => element.waitFor({ timeout: 5000 }).then(() => true, () => false);

const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};

function construire(nom) {
  const dossier = join(travail, nom);
  execFileSync('node', ['dist/cli.js', 'compile', `exemples/${nom}.humalis`, '--cible', 'web', '--sortie', dossier, '--adresse', `https://${nom}.exemple.cd`], { stdio: 'inherit' });
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: dossier, stdio: 'inherit' });
  return dossier;
}

/** Sert dist/ avec « vite preview » et renvoie l'adresse. */
async function servir(dossier) {
  // Le programme vite lui-même, pas « npx vite » : npx lance un processus
  // enfant que kill() n'arrêterait pas.
  const serveur = spawn(join(dossier, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0', '--strictPort', 'false'], { cwd: dossier });
  const adresse = await new Promise((ok, echec) => {
    serveur.stdout.on('data', (morceau) => {
      const trouve = String(morceau).match(/http:\/\/localhost:\d+/);
      if (trouve) ok(trouve[0]);
    });
    serveur.on('exit', () => echec(new Error('vite preview s\'est arrêté')));
  });
  return { adresse, arreter: () => serveur.kill() };
}

async function essayer(nom, scenario) {
  const dossier = construire(nom);
  const { chromium } = createRequire(join(dossier, 'package.json'))('playwright');
  const { adresse, arreter } = await servir(dossier);
  const navigateur = await chromium.launch();
  try {
    // Sans JavaScript : ce que reçoit un robot, grâce au prérendu.
    const sansJs = await (await navigateur.newContext({ javaScriptEnabled: false })).newPage();
    await sansJs.goto(adresse);
    await scenario.sansJavaScript(sansJs);

    // Avec JavaScript : un visiteur qui clique.
    const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.goto(adresse);
    await scenario.avecJavaScript(page);
    verifier(erreurs.length === 0, `${nom} : aucune erreur dans la console${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);

    // Mobile, thème sombre : une capture pour relire la mise en page.
    const mobile = await (await navigateur.newContext({ viewport: { width: 375, height: 700 }, colorScheme: 'dark' })).newPage();
    await mobile.goto(adresse);
    const largeur = await mobile.evaluate(() => document.documentElement.scrollWidth);
    verifier(largeur <= 375, `${nom} : pas de défilement horizontal à 375 px`);
    await mobile.screenshot({ path: join(captures, `${nom}-375-sombre.png`), fullPage: true });
  } finally {
    await navigateur.close();
    arreter();
  }
}

await essayer('boutique', {
  async sansJavaScript(page) {
    verifier(await page.getByRole('heading', { name: 'Nos produits' }).isVisible(), 'boutique sans JavaScript : « Nos produits » est déjà dans la page');
    verifier((await page.getByRole('button', { name: 'Ajouter' }).count()) === 3, 'boutique sans JavaScript : les trois boutons « Ajouter » sont là');
  },
  async avecJavaScript(page) {
    const compteur = page.getByText(/Articles dans le panier/);
    verifier((await compteur.textContent()) === 'Articles dans le panier : 0', 'boutique : le panier commence vide');
    verifier(await page.getByText('Rupture de stock').isVisible(), 'boutique : « Rupture de stock » s\'affiche (stock à 0)');
    await page.getByRole('button', { name: 'Ajouter' }).nth(0).click();
    await page.getByRole('button', { name: 'Ajouter' }).nth(2).click();
    verifier((await compteur.textContent()) === 'Articles dans le panier : 2', 'boutique : deux clics sur « Ajouter » donnent 2 articles');
    await page.screenshot({ path: join(travail, 'captures', 'boutique-1280.png'), fullPage: true });
    // React Router change l'adresse, puis affiche la page un instant après :
    // on attend l'affichage (5 secondes au plus) avant de vérifier.
    await page.getByRole('button', { name: 'Voir le panier' }).click();
    await page.waitForURL('**/panier');
    verifier(await apparait(page.getByRole('heading', { name: 'Votre panier' })), 'boutique : « Voir le panier » mène à la page panier');
    verifier(await page.waitForFunction(() => document.title === 'Votre panier', null, { timeout: 5000 }).then(() => true, () => false), 'boutique : le titre de l\'onglet suit la page');
    // Le panier est partagé entre les pages (« variable panier = [] avec partagee »).
    const articles = await page.locator('main p').allTextContents();
    verifier(articles.join(',') === 'Livre,Cahier', `panier : la page panier montre les articles ajoutés (${articles.join(', ')})`);
    await page.screenshot({ path: join(travail, 'captures', 'panier-1280.png'), fullPage: true });
    await page.getByRole('button', { name: 'Retirer' }).first().click();
    verifier((await page.locator('main p').allTextContents()).join(',') === 'Cahier', 'panier : « Retirer » enlève l\'article');
    await page.getByRole('link', { name: 'Retour à la boutique' }).click();
    verifier(await apparait(page.getByRole('heading', { name: 'Nos produits' })), 'boutique : le lien ramène à la boutique');
    verifier((await page.getByText(/Articles dans le panier/).textContent()) === 'Articles dans le panier : 1', 'panier : de retour sur la boutique, le compteur dit 1');
  },
});

await essayer('connexion', {
  async sansJavaScript(page) {
    verifier(await page.getByRole('button', { name: 'Se connecter' }).isVisible(), 'connexion sans JavaScript : le bouton est déjà dans la page');
  },
  async avecJavaScript(page) {
    await page.getByRole('button', { name: 'Se connecter' }).click();
    const alerte = page.getByRole('alert');
    verifier((await alerte.textContent()) === 'Email requis', 'connexion : champ vide → « Email requis » en erreur');
    await page.getByLabel('email').fill('awa@exemple.cd');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    verifier((await page.getByRole('status').textContent()) === 'Connexion réussie', 'connexion : avec un email → « Connexion réussie »');
    await page.screenshot({ path: join(travail, 'captures', 'connexion-1280.png') });
  },
});

await essayer('vitrine', {
  async sansJavaScript(page) {
    verifier(await page.getByText('Fournitures scolaires').isVisible(), 'vitrine sans JavaScript : la carte React est déjà dans la page');
  },
  async avecJavaScript(page) {
    // Étape 2, sens 2 : un composant React écrit à la main, et un composant écrit en Humalis.
    const carte = page.locator('[data-carte]');
    verifier((await carte.count()) === 1, 'vitrine : le composant React « Carte » s\'affiche');
    verifier((await carte.textContent()) === 'Fournitures scolairesÀ partir de 2 €', `vitrine : la carte reçoit ses propriétés, dont une variable (${await carte.textContent()})`);
    const textes = await page.locator('main p').allTextContents();
    verifier(textes.includes('Livre') && textes.includes('12 €') && textes.includes('Stylo') && textes.includes('2 €'), 'vitrine : les deux fiches Humalis s\'affichent avec leurs paramètres');
    verifier((await page.title()) === 'Notre vitrine', 'vitrine : les composants ne changent pas le titre de la page');
    await page.screenshot({ path: join(travail, 'captures', 'vitrine-1280.png'), fullPage: true });
  },
});

console.log(`\nCaptures : ${captures}`);
console.log(problemes.length === 0 ? 'Tout est vérifié.' : `${problemes.length} problème(s).`);
process.exit(problemes.length === 0 ? 0 : 1);
