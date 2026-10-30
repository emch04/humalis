// Vérifie la cible mobile (étape 5) autant que ce conteneur le permet :
// compile les exemples avec --cible mobile, installe chaque projet Expo,
// vérifie ses types, construit le paquet iOS (Hermes) et la version web,
// puis pilote la version web dans Chromium, à la taille d'un iPhone.
//
// Ce que ce script NE vérifie PAS : le simulateur iPhone lui-même (il faut
// un Mac avec Xcode). Sur un Mac : cd <projet> && npx expo start, puis « i ».
//
// Lancer : npm run build && npm run essai:mobile [dossier-de-travail]
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-mobile'));
const captures = join(travail, 'captures');
rmSync(travail, { recursive: true, force: true });
mkdirSync(captures, { recursive: true });

const problemes = [];
/** Vrai si l'élément apparaît dans les 5 secondes. */
// Le titre est aussi dans la barre de navigation, et la pile garde les pages
// précédentes : on attend le premier élément visible.
const apparait = (element) => element.filter({ visible: true }).first().waitFor({ timeout: 5000 }).then(() => true, () => false);

const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};

/** Tous les fichiers d'un dossier, sous-dossiers compris. */
const fichiersDe = (dossier) =>
  readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiersDe(chemin) : [chemin];
  });

function construire(nom) {
  const dossier = join(travail, nom);
  execFileSync('node', ['dist/cli.js', 'compile', `exemples/${nom}.humalis`, '--cible', 'mobile', '--sortie', dossier], { stdio: 'inherit' });
  // npm 11 : npm 10 échoue sur certains arbres de dépendances (« edgesOut »).
  execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'inherit' });
  execFileSync('npx', ['tsc', '--noEmit'], { cwd: dossier, stdio: 'inherit' });
  verifier(true, `${nom} : les types du projet Expo passent (tsc)`);

  const env = { ...process.env, CI: '1' };
  execFileSync('npx', ['expo', 'export', '--platform', 'ios', '--output-dir', 'dist-ios'], { cwd: dossier, stdio: 'inherit', env });
  const paquet = fichiersDe(join(dossier, 'dist-ios')).find((f) => f.endsWith('.hbc'));
  verifier(paquet !== undefined, `${nom} : le paquet iOS est construit (Hermes, ${paquet ? Math.round(statSync(paquet).size / 1024) + ' Ko' : 'absent'})`);

  execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-web'], { cwd: dossier, stdio: 'inherit', env });
  return dossier;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };

/** Sert l'export web d'Expo : « /panier » est panier.html. */
async function servir(dossier) {
  const racine = join(dossier, 'dist-web');
  const serveur = createServer((requete, reponse) => {
    const chemin = decodeURIComponent(new URL(requete.url, 'http://x').pathname);
    const candidats = [join(racine, chemin), join(racine, `${chemin}.html`), join(racine, chemin, 'index.html')];
    const trouve = candidats.find((c) => c.startsWith(racine) && existsSync(c) && statSync(c).isFile()) ?? join(racine, '+not-found.html');
    reponse.writeHead(trouve.endsWith('+not-found.html') ? 404 : 200, { 'Content-Type': TYPES[extname(trouve)] ?? 'application/octet-stream' });
    reponse.end(readFileSync(trouve));
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  return { adresse: `http://127.0.0.1:${serveur.address().port}`, arreter: () => serveur.close() };
}

async function essayer(nom, scenario) {
  const dossier = construire(nom);
  const { adresse, arreter } = await servir(dossier);
  const navigateur = await chromium.launch();
  try {
    // La taille et le toucher d'un iPhone (390 × 844).
    const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.goto(adresse);
    await scenario(page, adresse);
    verifier(erreurs.length === 0, `${nom} : aucune erreur dans la console${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);
    await page.screenshot({ path: join(captures, `${nom}-clair.png`), fullPage: true });

    // Thème sombre : une capture pour relire les couleurs.
    const sombre = await (await navigateur.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true })).newPage();
    await sombre.goto(adresse);
    await sombre.getByTestId(scenario.premier).waitFor({ timeout: 5000 });
    await sombre.waitForTimeout(500);
    // Le fond de la page, cherché depuis le premier élément vers le haut.
    const fond = await sombre.getByTestId(scenario.premier).evaluate((element) => {
      for (let e = element; e; e = e.parentElement) {
        const couleur = getComputedStyle(e).backgroundColor;
        if (couleur !== 'rgba(0, 0, 0, 0)') return couleur;
      }
      return 'transparent';
    });
    verifier(fond === 'rgb(20, 20, 22)', `${nom} : le thème sombre donne un fond sombre (${fond})`);
    const largeur = await sombre.evaluate(() => document.documentElement.scrollWidth);
    verifier(largeur <= 390, `${nom} : pas de défilement horizontal à 390 px (thème sombre)`);
    await sombre.screenshot({ path: join(captures, `${nom}-sombre.png`), fullPage: true });
  } finally {
    await navigateur.close();
    arreter();
  }
}

const boutique = async (page, adresse) => {
  const html = await (await fetch(adresse)).text();
  verifier(html.includes('Nos produits'), 'boutique : la page d’entrée est rendue en HTML par l’export statique d’Expo');

  verifier(await apparait(page.getByText('Nos produits')), 'boutique : le titre s’affiche');
  verifier(await apparait(page.getByRole('heading', { name: 'Nos produits' })), 'boutique : le titre est un en-tête pour l’accessibilité');
  verifier(await apparait(page.getByText('Articles dans le panier : 0')), 'boutique : le panier est vide au départ');
  verifier((await page.getByTestId('bouton_ajouter').count()) === 3, 'boutique : un bouton « Ajouter » par produit');
  await page.getByTestId('bouton_ajouter').first().tap();
  verifier(await apparait(page.getByText('Articles dans le panier : 1')), 'boutique : toucher « Ajouter » ajoute au panier');
  await page.getByTestId('bouton_ajouter').nth(2).tap();
  verifier(await apparait(page.getByText('Articles dans le panier : 2')), 'boutique : un deuxième article');

  await page.getByTestId('bouton_voir_le_panier').tap();
  verifier(await apparait(page.getByText('Votre panier')), 'boutique : « Voir le panier » mène au panier');
  await page.waitForURL(/\/panier$/, { timeout: 5000 }).catch(() => {});
  verifier(page.url().endsWith('/panier'), 'boutique : l’adresse du panier est /panier, comme sur le web');
  verifier(await apparait(page.getByText('Livre')), 'boutique : le panier, partagé entre les pages, contient le Livre');
  verifier(await apparait(page.getByText('Cahier')), 'boutique : … et le Cahier');
  const retirer = page.getByTestId('bouton_retirer').filter({ visible: true });
  await retirer.first().tap();
  await retirer.first().tap();
  verifier(await apparait(page.getByText('Votre panier est vide.')), 'boutique : « Retirer » vide le panier');

  await page.getByTestId('lien_retour_a_la_boutique').filter({ visible: true }).tap();
  verifier(await apparait(page.getByText('Articles dans le panier : 0')), 'boutique : le lien ramène à la boutique, panier à jour');
};
boutique.premier = 'titre_nos_produits';

const connexion = async (page) => {
  verifier(await apparait(page.getByTestId('champ_email')), 'connexion : le champ email s’affiche');
  await page.getByTestId('bouton_se_connecter').tap();
  verifier(await apparait(page.getByText('Email requis')), 'connexion : un champ vide affiche le message d’erreur');
  await page.getByTestId('champ_email').fill('emch@exemple.cd');
  await page.getByTestId('bouton_se_connecter').tap();
  verifier(await apparait(page.getByText('Connexion réussie')), 'connexion : un email rempli affiche « Connexion réussie »');
};
connexion.premier = 'champ_email';

await essayer('boutique', boutique);
await essayer('connexion', connexion);
// Les avis : la connexion (jeton des packs dans le coffre du téléphone).
// Sans serveur lancé ici, on vérifie que le projet se construit.
construire('avis');

console.log(`\nCaptures : ${captures}`);
console.log('Non vérifié ici : le simulateur iPhone (Mac + Xcode). Sur un Mac : npx expo start, puis « i ».');
if (problemes.length > 0) {
  console.error(`\n${problemes.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log('\nToutes les vérifications passent.');
