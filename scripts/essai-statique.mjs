// Vérifie en vrai la cible statique (étape 7) : compile la boutique et la
// connexion en sites statiques, les sert avec un petit serveur HTTP Node,
// puis les pilote dans Chromium comme le ferait un visiteur. Vérifie aussi
// le HTML écrit (structure, un seul <h1>, lang="fr") et que le contenu écrit
// dans le HTML est celui que le JavaScript redessine.
//
// Avec --avec-serveur, essaie aussi la connexion (exemples/avis.humalis)
// contre le vrai serveur produit par --cible serveur (packs Astratra),
// derrière le même petit serveur, qui relaie /api et /auth.
//
// Lancer : npm run build && npm run essai:statique [dossier-de-travail] [--avec-serveur]
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer, request } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const options = process.argv.slice(2);
const avecServeur = options.includes('--avec-serveur');
const travail = resolve(options.find((o) => !o.startsWith('--')) ?? join(tmpdir(), 'humalis-essai-statique'));
const captures = join(travail, 'captures');
rmSync(travail, { recursive: true, force: true });
mkdirSync(captures, { recursive: true });

const { chromium } = createRequire(import.meta.url)('playwright');

const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};
/** Vrai si l'élément apparaît dans les 5 secondes. */
const apparait = (element) => element.waitFor({ timeout: 5000 }).then(() => true, () => false);

function compiler(nom, cible = 'statique') {
  const dossier = join(travail, `${nom}-${cible}`);
  execFileSync('node', ['dist/cli.js', 'compile', `exemples/${nom}.humalis`, '--cible', cible, '--sortie', dossier], { stdio: 'inherit' });
  return dossier;
}

// ─── Un petit serveur HTTP de fichiers, avec un relais facultatif ──────────

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

/** Sert le dossier ; /api et /auth vont au serveur `relais` s'il est donné. */
function servir(dossier, relais) {
  const serveur = createServer((requete, reponse) => {
    const adresse = new URL(requete.url, 'http://localhost');
    if (relais && /^\/(api|auth)(\/|$)/.test(adresse.pathname)) {
      const cible = new URL(relais);
      const suite = request(
        { host: cible.hostname, port: cible.port, path: requete.url, method: requete.method, headers: { ...requete.headers, host: cible.host } },
        (r) => {
          reponse.writeHead(r.statusCode ?? 502, r.headers);
          r.pipe(reponse);
        },
      );
      suite.on('error', () => reponse.writeHead(502).end());
      requete.pipe(suite);
      return;
    }
    let chemin = normalize(join(dossier, decodeURIComponent(adresse.pathname)));
    if (!chemin.startsWith(dossier)) return reponse.writeHead(403).end();
    if (existsSync(chemin) && statSync(chemin).isDirectory()) chemin = join(chemin, 'index.html');
    if (!existsSync(chemin)) {
      reponse.writeHead(404, { 'content-type': TYPES['.html'] });
      return reponse.end(readFileSync(join(dossier, '404.html')));
    }
    reponse.writeHead(200, { 'content-type': TYPES[extname(chemin)] ?? 'application/octet-stream' });
    reponse.end(readFileSync(chemin));
  });
  return new Promise((ok) => serveur.listen(0, '127.0.0.1', () => ok({ adresse: `http://127.0.0.1:${serveur.address().port}`, arreter: () => serveur.close() })));
}

// ─── Le HTML écrit : structure ─────────────────────────────────────────────

const VIDES = new Set(['meta', 'link', 'img', 'input', 'br', 'hr']);

/**
 * Les remarques sur un fichier HTML : vide si tout va bien. `sansTitre` :
 * la page n'a pas de `titre` dans le programme (Humalis n'en invente pas) ;
 * elle n'a alors pas de <h1>.
 */
function relireHtml(html, sansTitre) {
  const remarques = [];
  if (!html.startsWith('<!doctype html>')) remarques.push('pas de <!doctype html> en tête');
  if (!/<html lang="fr">/.test(html)) remarques.push('pas de lang="fr"');
  if (!/<meta charset="utf-8">/.test(html)) remarques.push('pas de <meta charset>');
  if (!/<title>[^<]+<\/title>/.test(html)) remarques.push('pas de titre');
  if (!/<meta name="description" content="[^"]+">/.test(html)) remarques.push('pas de description');
  const h1 = (html.match(/<h1\b/g) ?? []).length;
  if (h1 !== (sansTitre ? 0 : 1)) remarques.push(`${h1} balises <h1> au lieu de ${sansTitre ? 0 : 1}`);
  for (const img of html.match(/<img\b[^>]*>/g) ?? []) if (!/\balt="/.test(img)) remarques.push(`image sans alt : ${img}`);
  // Chaque balise ouverte est fermée, dans le bon ordre ; un attribut n'apparaît qu'une fois.
  const pile = [];
  for (const [balise, fermante, nom, attributs] of html.slice(15).matchAll(/<(\/?)([a-z0-9]+)\b([^>]*)>/g)) {
    const noms = [...attributs.matchAll(/\s([a-z-]+)=/g)].map((m) => m[1]);
    if (new Set(noms).size !== noms.length) remarques.push(`attribut en double : ${balise}`);
    if (VIDES.has(nom)) continue;
    if (!fermante) pile.push(nom);
    else if (pile.pop() !== nom) remarques.push(`</${nom}> ferme une autre balise`);
  }
  if (pile.length > 0) remarques.push(`balises non fermées : ${pile.join(', ')}`);
  return remarques;
}

/** Les fichiers HTML d'un site, relus un à un ; `sansTitre` : les pages écrites sans `titre`. */
function relireSite(nom, dossier, sansTitre = []) {
  for (const fichier of readdirSync(dossier).filter((f) => f.endsWith('.html'))) {
    const remarques = relireHtml(readFileSync(join(dossier, fichier), 'utf8'), sansTitre.includes(fichier));
    const h1 = sansTitre.includes(fichier) ? 'aucun <h1>, la page n’a pas de titre' : 'un seul <h1>';
    verifier(remarques.length === 0, `${nom} : ${fichier} est du HTML bien formé (doctype, lang="fr", ${h1}, balises fermées)${remarques.length ? ` — ${remarques.join(' ; ')}` : ''}`);
  }
}

/**
 * Chromium relit la page sans JavaScript : s'il a dû corriger le HTML
 * (balise mal placée), le nombre d'éléments de <main> ne correspond plus.
 */
async function relueParChromium(page, html) {
  const ecrits = (html.slice(html.indexOf('<main'), html.indexOf('</main>')).match(/<[a-z][a-z0-9]*\b/g) ?? []).length;
  const lus = await page.evaluate(() => document.querySelectorAll('main, main *').length);
  return ecrits === lus;
}

// ─── Les essais ────────────────────────────────────────────────────────────

const navigateur = await chromium.launch();
const erreurs = [];
/**
 * Une page qui note ses erreurs de console. `refusAttendus` : les réponses 401
 * du serveur sont prévues (un visiteur sur /auth/me, un mauvais mot de passe,
 * un envoi refusé) ; Chromium les signale quand même dans la console.
 */
async function nouvellePage(contexte, refusAttendus = false) {
  const page = await contexte.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (refusAttendus && /status of 401/.test(m.text())) return;
    erreurs.push(`${page.url()} : ${m.text()}`);
  });
  page.on('pageerror', (e) => erreurs.push(`${page.url()} : ${e.message}`));
  return page;
}
/** Le contenu de <main>, sans les espaces entre balises. */
const contenu = (page) => page.evaluate(() => document.querySelector('main').innerHTML.replace(/>\s+</g, '><').trim());

async function essayer(nom, dossier, relais, scenario, sansTitre = []) {
  relireSite(nom, dossier, sansTitre);
  const { adresse, arreter } = await servir(dossier, relais);
  try {
    // Sans JavaScript : ce que reçoit un robot ou un lecteur sans script.
    const sansJs = await (await navigateur.newContext({ javaScriptEnabled: false })).newPage();
    await sansJs.goto(adresse);
    await scenario.sansJavaScript(sansJs, adresse);
    await sansJs.goto(adresse);
    const html = readFileSync(join(dossier, 'index.html'), 'utf8');
    verifier(await relueParChromium(sansJs, html), `${nom} : Chromium relit le HTML sans rien corriger`);
    const depart = await contenu(sansJs);

    // Avec JavaScript : le premier dessin du script est le même que le HTML de départ.
    const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await nouvellePage(contexte);
    await page.goto(adresse);
    await page.waitForLoadState('load');
    verifier((await contenu(page)) === depart, `${nom} : le script redessine exactement le contenu écrit dans le HTML`);
    await scenario.avecJavaScript(page, adresse);

    // Téléphone, thème sombre.
    const mobile = await nouvellePage(await navigateur.newContext({ viewport: { width: 375, height: 700 }, colorScheme: 'dark' }));
    await mobile.goto(adresse);
    const largeur = await mobile.evaluate(() => document.documentElement.scrollWidth);
    verifier(largeur <= 375, `${nom} : pas de défilement horizontal à 375 px (${largeur} px)`);
    const fond = await mobile.evaluate(() => getComputedStyle(document.body).backgroundColor);
    verifier(fond === 'rgb(20, 20, 22)', `${nom} : le thème sombre s'applique (fond ${fond})`);
    await mobile.screenshot({ path: join(captures, `${nom}-375-sombre.png`), fullPage: true });
  } finally {
    arreter();
  }
}

// La boutique : deux pages, un panier partagé.
const boutique = compiler('boutique');
await essayer('boutique', boutique, undefined, {
  async sansJavaScript(page, adresse) {
    verifier(await page.getByRole('heading', { name: 'Nos produits' }).isVisible(), 'boutique sans JavaScript : « Nos produits » est déjà dans la page');
    verifier((await page.getByRole('button', { name: 'Ajouter' }).count()) === 3, 'boutique sans JavaScript : les trois produits et leurs boutons « Ajouter » sont là');
    verifier((await page.getByText('Articles dans le panier : 0').count()) === 1, 'boutique sans JavaScript : le compteur est écrit');
    await page.goto(`${adresse}/panier.html`);
    verifier(await page.getByText('Votre panier est vide.').isVisible(), 'panier sans JavaScript : « Votre panier est vide. » est déjà dans la page');
    const introuvable = await page.goto(`${adresse}/nulle-part.html`);
    verifier(introuvable.status() === 404 && (await page.getByRole('heading', { name: 'Page introuvable' }).isVisible()), 'une adresse inconnue donne la page « Page introuvable » (404)');
  },
  async avecJavaScript(page) {
    const compteur = page.getByText(/Articles dans le panier/);
    verifier((await compteur.textContent()) === 'Articles dans le panier : 0', 'boutique : le panier commence vide');
    verifier(await page.getByText('Rupture de stock').isVisible(), 'boutique : « Rupture de stock » s’affiche (stock à 0)');
    await page.getByRole('button', { name: 'Ajouter' }).nth(0).click();
    await page.getByRole('button', { name: 'Ajouter' }).nth(2).click();
    verifier((await compteur.textContent()) === 'Articles dans le panier : 2', 'boutique : deux clics sur « Ajouter » donnent 2 articles');
    // Au clavier : après le redessin, le bouton garde le focus.
    await page.getByRole('button', { name: 'Ajouter' }).nth(1).focus();
    await page.keyboard.press('Enter');
    const focus = await page.evaluate(() => [document.activeElement?.textContent, [...document.querySelectorAll('[data-humalis="bouton_ajouter"]')].indexOf(document.activeElement)]);
    verifier((await compteur.textContent()) === 'Articles dans le panier : 3' && focus[0] === 'Ajouter' && focus[1] === 1, `boutique : au clavier, « Entrée » ajoute et le même bouton garde le focus (${focus})`);
    await page.screenshot({ path: join(captures, 'boutique-1280.png'), fullPage: true });

    await page.getByRole('button', { name: 'Voir le panier' }).click();
    await page.waitForURL('**/panier.html');
    verifier(await apparait(page.getByRole('heading', { name: 'Votre panier' })), 'boutique : « Voir le panier » mène à panier.html');
    verifier((await page.title()) === 'Votre panier', 'panier : le titre de l’onglet est celui de la page');
    const articles = await page.locator('main p').allTextContents();
    verifier(articles.join(',') === 'Livre,Cahier,Stylo', `panier : la page panier (un autre fichier HTML) montre les articles ajoutés (${articles.join(', ')})`);
    await page.screenshot({ path: join(captures, 'panier-1280.png'), fullPage: true });
    await page.getByRole('button', { name: 'Retirer' }).first().click();
    verifier((await page.locator('main p').allTextContents()).join(',') === 'Cahier,Stylo', 'panier : « Retirer » enlève l’article');
    await page.reload();
    verifier((await page.locator('main p').allTextContents()).join(',') === 'Cahier,Stylo', 'panier : après un rechargement, le panier est toujours là (le temps de la visite)');

    await page.getByRole('link', { name: 'Retour à la boutique' }).click();
    await page.waitForURL(/\/index\.html$/);
    verifier(await apparait(page.getByRole('heading', { name: 'Nos produits' })), 'panier : le lien ramène à la boutique');
    verifier((await compteur.textContent()) === 'Articles dans le panier : 2', 'boutique : de retour, le compteur dit 2');

    // Le bouton « retour » du navigateur, après un changement sur l'autre page.
    await page.getByRole('button', { name: 'Voir le panier' }).click();
    await page.waitForURL('**/panier.html');
    await page.getByRole('button', { name: 'Retirer' }).first().click();
    await page.goBack();
    await page.waitForURL(/\/index\.html$/);
    verifier(await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('Articles dans le panier : 1'), null, { timeout: 5000 }).then(() => true, () => false), 'boutique : avec le bouton « retour » du navigateur, le compteur suit le panier (1)');
  },
});

// La boutique ouverte depuis le disque (double clic sur index.html).
{
  const page = await nouvellePage(await navigateur.newContext());
  await page.goto(pathToFileURL(join(boutique, 'index.html')).href);
  await page.getByRole('button', { name: 'Ajouter' }).first().click();
  await page.getByRole('button', { name: 'Voir le panier' }).click();
  await page.waitForURL('**/panier.html');
  verifier((await page.locator('main p').allTextContents()).join(',') === 'Livre', 'boutique ouverte depuis le disque (file://) : le panier passe d’une page à l’autre');
}

// La connexion : un champ, des messages.
const connexion = compiler('connexion');
await essayer('connexion', connexion, undefined, {
  async sansJavaScript(page) {
    verifier(await page.getByRole('button', { name: 'Se connecter' }).isVisible(), 'connexion sans JavaScript : le bouton est déjà dans la page');
    verifier(await page.getByLabel('email').isVisible(), 'connexion sans JavaScript : le champ et son libellé sont déjà là');
  },
  async avecJavaScript(page) {
    await page.getByRole('button', { name: 'Se connecter' }).click();
    verifier((await page.getByRole('alert').textContent()) === 'Email requis', 'connexion : champ vide → « Email requis » en erreur (role="alert")');
    const couleur = await page.locator('.humalis-message').evaluate((e) => getComputedStyle(e).backgroundColor);
    verifier(couleur === 'rgb(198, 40, 40)', `connexion : le message d’erreur est rouge (${couleur})`);
    await page.getByLabel('email').fill('awa@exemple.cd');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    verifier((await page.getByRole('status').textContent()) === 'Connexion réussie', 'connexion : avec un email → « Connexion réussie » (role="status")');
    verifier((await page.getByLabel('email').inputValue()) === 'awa@exemple.cd', 'connexion : ce qui est tapé reste dans le champ après le redessin');
    await page.screenshot({ path: join(captures, 'connexion-1280.png') });
    // Une information part après 4 secondes ; une erreur reste 8 secondes (décision I3 des interactions).
    verifier(await page.waitForFunction(() => document.querySelectorAll('.humalis-messages [role="status"]').length === 0, null, { timeout: 6000 }).then(() => true, () => false), 'connexion : le message d’information disparaît seul après 4 secondes');
    verifier(await page.waitForFunction(() => document.querySelector('.humalis-messages').childElementCount === 0, null, { timeout: 6000 }).then(() => true, () => false), 'connexion : le message d’erreur disparaît seul après 8 secondes');
  },
}, ['index.html']);

// Les avis, contre le vrai serveur (packs Astratra) : seulement avec --avec-serveur.
if (avecServeur) {
  const EMAIL = 'admin@avis.cd';
  const MOT_DE_PASSE = 'Admin-Solide-2026!';
  const dossierServeur = compiler('avis', 'serveur');
  const site = compiler('avis');
  execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund'], { cwd: dossierServeur, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: dossierServeur, stdio: 'inherit' });
  const port = 5300 + Math.floor(Math.random() * 90);
  const processus = spawn('node', ['dist/src/demarrer.js'], {
    cwd: dossierServeur,
    env: { ...process.env, JWT_SECRET: randomBytes(32).toString('hex'), HUMALIS_ADMIN_EMAIL: EMAIL, HUMALIS_ADMIN_MOT_DE_PASSE: MOT_DE_PASSE, PORT: String(port) },
  });
  await new Promise((ok) => processus.stdout.on('data', (m) => String(m).includes('prêt') && ok()));
  const { adresse, arreter } = await servir(site, `http://127.0.0.1:${port}`);
  try {
    relireSite('avis', site);
    const page = await nouvellePage(await navigateur.newContext(), true);
    await page.goto(adresse);
    verifier(await apparait(page.getByText('Aucun avis pour l’instant.'.replace('’', "'"))), 'avis : la liste lue sur le serveur est vide au départ');
    verifier(await page.getByText('Connectez-vous pour laisser un avis.').isVisible(), 'avis : un visiteur voit l’invitation à se connecter');
    await page.getByLabel('email').fill(EMAIL);
    await page.getByLabel('mot de passe').fill('mauvais');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    verifier(await apparait(page.getByRole('alert').getByText('Email ou mot de passe incorrect.')), 'avis : un mauvais mot de passe est refusé, avec le message');
    verifier((await page.getByLabel('mot de passe').inputValue()) === '', 'avis : le mot de passe est effacé du champ dès l’envoi');
    await page.getByLabel('mot de passe').fill(MOT_DE_PASSE);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    verifier(await apparait(page.getByRole('button', { name: 'Publier' })), 'avis : le bon mot de passe connecte (le formulaire de publication apparaît)');
    await page.getByLabel('commentaire').fill('Très bon site statique');
    await page.getByRole('button', { name: 'Publier' }).click();
    verifier(await apparait(page.getByText('Très bon site statique')), 'avis : l’avis publié (POST avec le jeton CSRF du pack) revient du serveur et s’affiche');
    await page.reload();
    verifier(await apparait(page.getByRole('button', { name: 'Publier' })), 'avis : après un rechargement, la session est relue sur /auth/me');
    const stockage = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    verifier(!stockage.includes(MOT_DE_PASSE) && !/eyJ/.test(stockage), 'avis : ni mot de passe ni jeton dans le stockage du navigateur');
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    verifier(await apparait(page.getByText('Connectez-vous pour laisser un avis.')), 'avis : la déconnexion ramène la page du visiteur');
    const refus = await page.evaluate(async () => {
      const jeton = document.cookie.match(/(?:^|; )astratra_csrf=([^;]*)/)?.[1] ?? '';
      const r = await fetch('/api/avis', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': decodeURIComponent(jeton) }, body: '{"commentaire":"x"}' });
      return r.status;
    });
    verifier(refus === 401, `avis : déconnecté, le serveur refuse un envoi (${refus})`);
    await page.screenshot({ path: join(captures, 'avis-1280.png'), fullPage: true });
  } finally {
    arreter();
    processus.kill();
  }
}

await navigateur.close();
verifier(erreurs.length === 0, `aucune erreur dans la console${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);
console.log(`\nCaptures : ${captures}`);
console.log(problemes.length === 0 ? 'Tout est vérifié.' : `${problemes.length} problème(s).`);
process.exit(problemes.length === 0 ? 0 : 1);
