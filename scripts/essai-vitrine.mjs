// Vérifie en vrai la mise en page et les éléments d'écran : compile
// exemples/vitrine-complete.humalis en site statique (et, avec --web, en
// projet web construit), le sert, puis le pilote dans Chromium à 375, 768 et
// 1280 pixels, en clair et en sombre.
//
// Lancer : npm run build && npm run essai:vitrine [-- --web]
// Playwright est cherché dans NODE_PATH, puis dans quelques dossiers connus.
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.env.HUMALIS_TRAVAIL ?? join(tmpdir(), 'humalis-essai-vitrine'));
const avecWeb = process.argv.includes('--web');
rmSync(travail, { recursive: true, force: true });
mkdirSync(join(travail, 'captures'), { recursive: true });

const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};

function chargerPlaywright() {
  const candidats = [
    ...(process.env.NODE_PATH ?? '').split(':').filter(Boolean),
    join(process.env.HOME ?? '', 'astratra/node_modules'),
    join(travail, 'web/node_modules'),
  ];
  for (const dossier of candidats) {
    if (existsSync(join(dossier, 'playwright'))) return createRequire(join(dossier, 'x.js'))('playwright');
  }
  throw new Error('Playwright est introuvable : mettez NODE_PATH vers un node_modules qui le contient.');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/** Sert un dossier de fichiers statiques et renvoie son adresse. */
async function servir(dossier) {
  const serveur = createServer((requete, reponse) => {
    let chemin = decodeURIComponent(new URL(requete.url, 'http://x').pathname);
    if (chemin.endsWith('/')) chemin += 'index.html';
    let fichier = join(dossier, chemin);
    if (!existsSync(fichier) || statSync(fichier).isDirectory()) fichier = join(dossier, 'index.html');
    reponse.writeHead(200, { 'content-type': TYPES[extname(fichier)] ?? 'application/octet-stream' });
    reponse.end(readFileSync(fichier));
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  return { adresse: `http://127.0.0.1:${serveur.address().port}`, arreter: () => serveur.close() };
}

function compiler(cible) {
  const dossier = join(travail, cible);
  execFileSync('node', ['dist/cli.js', 'compile', 'exemples/vitrine-complete.humalis', '--cible', cible, '--sortie', dossier], { stdio: 'ignore' });
  return dossier;
}

const colonnes = (page, selecteur) =>
  page.$eval(selecteur, (el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
const visible = (page, texte) => page.getByText(texte, { exact: true }).first().isVisible();
const fond = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

async function scenario(nom, adresse, navigateur) {
  const erreurs = [];
  const ouvrir = async (options, chemin = '/') => {
    const contexte = await navigateur.newContext(options);
    const page = await contexte.newPage();
    page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.goto(adresse + chemin);
    await page.waitForLoadState('networkidle');
    return page;
  };

  // Ordinateur.
  let page = await ouvrir({ viewport: { width: 1280, height: 800 } });
  verifier(await visible(page, 'La carte'), `${nom} : ordinateur, le menu de l'en-tête est visible`);
  verifier(await visible(page, 'Passez la souris sur un plat pour le découvrir.'), `${nom} : ordinateur, le conseil de l'ordinateur est visible`);
  verifier(!(await visible(page, 'Touchez un plat pour le découvrir.')), `${nom} : ordinateur, le conseil du téléphone est caché`);
  verifier((await colonnes(page, '.humalis-grille')) === 3, `${nom} : ordinateur, la grille a 3 colonnes`);
  verifier(await visible(page, 'Ouvert de mardi à dimanche'), `${nom} : le pied de page commun est là`);
  await page.screenshot({ path: join(travail, 'captures', `${nom}-1280-clair.png`), fullPage: true });
  await page.context().close();

  // Tablette.
  page = await ouvrir({ viewport: { width: 768, height: 900 } });
  verifier(await visible(page, 'La carte'), `${nom} : tablette, le menu est visible`);
  verifier((await colonnes(page, '.humalis-grille')) === 2, `${nom} : tablette, la grille a 2 colonnes`);
  await page.context().close();

  // Téléphone.
  page = await ouvrir({ viewport: { width: 375, height: 800 } });
  verifier(!(await visible(page, 'La carte')), `${nom} : téléphone, le menu de l'en-tête est caché`);
  verifier(await visible(page, 'Touchez un plat pour le découvrir.'), `${nom} : téléphone, le conseil du téléphone est visible`);
  verifier((await colonnes(page, '.humalis-grille')) === 1, `${nom} : téléphone, la grille a 1 colonne`);
  verifier((await page.evaluate(() => document.documentElement.scrollWidth)) <= 375, `${nom} : téléphone, pas de défilement horizontal`);
  verifier(await visible(page, 'Mode sombre'), `${nom} : téléphone, le bouton du thème est visible`);
  await page.screenshot({ path: join(travail, 'captures', `${nom}-375-clair.png`), fullPage: true });
  await page.context().close();

  // Thème : clair, sombre du système, puis choix du visiteur.
  page = await ouvrir({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
  const clair = await fond(page);
  verifier(clair === 'rgb(255, 255, 255)', `${nom} : thème clair, le fond est blanc (${clair})`);
  const marqueClair = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--humalis-marque').trim());
  verifier(marqueClair === '#0e5a6b', `${nom} : la couleur « marque » est celle du thème clair (${marqueClair})`);
  await page.getByText('Mode sombre', { exact: true }).click();
  verifier((await fond(page)) === 'rgb(20, 20, 22)', `${nom} : « changer theme par sombre » assombrit la page`);
  const marqueSombre = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--humalis-marque').trim());
  verifier(marqueSombre === '#5fc3d6', `${nom} : la couleur « marque » passe à celle du thème sombre (${marqueSombre})`);
  await page.screenshot({ path: join(travail, 'captures', `${nom}-1280-sombre-choisi.png`), fullPage: true });
  await page.reload();
  verifier((await fond(page)) === 'rgb(20, 20, 22)', `${nom} : le choix du visiteur est retrouvé après rechargement`);
  await page.context().close();

  page = await ouvrir({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  verifier((await fond(page)) === 'rgb(20, 20, 22)', `${nom} : le thème sombre du système est suivi`);
  await page.context().close();

  // Collé : l'en-tête reste en haut pendant le défilement.
  page = await ouvrir({ viewport: { width: 1280, height: 300 } }, '/carte' + (nom === 'statique' ? '.html' : ''));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const haut = await page.$eval('.humalis-entete', (el) => el.getBoundingClientRect().top);
  verifier(haut === 0, `${nom} : l'en-tête collé reste en haut après défilement (top = ${haut})`);
  await page.context().close();

  // Une page sans pied.
  page = await ouvrir({ viewport: { width: 1280, height: 800 } }, '/reservation' + (nom === 'statique' ? '.html' : ''));
  verifier(!(await visible(page, 'Ouvert de mardi à dimanche')), `${nom} : la page « sans pied » n'a pas de pied`);
  verifier(await visible(page, 'Le Fleuve'), `${nom} : mais elle a l'en-tête`);
  await page.context().close();

  verifier(erreurs.length === 0, `${nom} : aucune erreur dans la console${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);
}

/** jsQR, pour relire le code QR : cherché dans NODE_PATH ou HUMALIS_JSQR ; sans lui, le décodage n'est pas vérifié. */
function chargerJsQr() {
  const candidats = [process.env.HUMALIS_JSQR, ...(process.env.NODE_PATH ?? '').split(':')].filter(Boolean);
  for (const dossier of candidats) {
    const fichier = join(dossier, 'jsqr/dist/jsQR.js');
    if (existsSync(fichier)) return readFileSync(fichier, 'utf8');
  }
  return undefined;
}

/** Les éléments d'écran de la page « plat » : icône, badge, avatar, étoiles, compteur, progression, chargement, onglets, accordéon, carrousel, fil d'Ariane, code QR. */
async function scenarioElements(nom, adresse, navigateur) {
  const erreurs = [];
  const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await contexte.newPage();
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(adresse + '/plat' + (nom === 'statique' ? '.html' : ''));
  await page.waitForLoadState('networkidle');

  // Fil d'Ariane.
  verifier((await page.locator('nav[aria-label="Fil d\'Ariane"] li').count()) === 3, `${nom} : le fil d'Ariane a trois éléments`);
  verifier((await page.locator('nav[aria-label="Fil d\'Ariane"] [aria-current="page"]').count()) === 1, `${nom} : le dernier est la page en cours`);
  // Icône, badge, avatar.
  verifier((await page.locator('svg[aria-label="Produit du marché"]').count()) === 1, `${nom} : l'icône est un SVG avec sa description`);
  verifier(await visible(page, 'Nouveau'), `${nom} : le badge est visible`);
  verifier((await page.locator('[role="img"][aria-label="Chef Mbala"]').innerText()) === 'CM', `${nom} : l'avatar montre les initiales CM`);
  // Étoiles : lecture avec demi-étoile, saisie.
  const note = page.locator('[aria-label="Note moyenne : 4,5 sur 5"]');
  verifier((await note.locator('.humalis-etoile').count()) === 5, `${nom} : cinq étoiles`);
  verifier((await note.locator('.humalis-etoile-pleine').count()) === 4 && (await note.locator('.humalis-etoile-demi').count()) === 1, `${nom} : 4,5 donne quatre étoiles pleines et une demie`);
  const saisie = page.locator('[role="radiogroup"]');
  await saisie.getByRole('radio', { name: '4 sur 5' }).click();
  verifier((await saisie.getByRole('radio', { name: '4 sur 5' }).getAttribute('aria-checked')) === 'true', `${nom} : cliquer sur la 4e étoile change la note`);
  verifier((await saisie.locator('.humalis-etoile-pleine').count()) === 4, `${nom} : quatre étoiles pleines après le clic`);
  // Compteur.
  const compteur = page.locator('[aria-label="Quantité"]');
  verifier((await compteur.locator('output').innerText()) === '1', `${nom} : le compteur démarre à 1`);
  verifier(await compteur.getByRole('button', { name: 'Diminuer' }).isDisabled(), `${nom} : « – » est désactivé au minimum`);
  await compteur.getByRole('button', { name: 'Augmenter' }).click();
  verifier((await compteur.locator('output').innerText()) === '2', `${nom} : « + » passe à 2`);
  verifier((await page.getByText('Total :', { exact: false }).first().innerText()).replace(/\s/g, ' ').includes('56 000 FC'), `${nom} : le total suit le compteur (56 000 FC)`);
  for (let i = 0; i < 5; i++) if (await compteur.getByRole('button', { name: 'Augmenter' }).isEnabled()) await compteur.getByRole('button', { name: 'Augmenter' }).click();
  verifier((await compteur.locator('output').innerText()) === '5' && (await compteur.getByRole('button', { name: 'Augmenter' }).isDisabled()), `${nom} : « + » s'arrête au maximum 5`);
  // Progression.
  verifier((await page.locator('progress').getAttribute('value')) === '40', `${nom} : la progression est à 40`);
  await page.getByRole('button', { name: 'Avancer' }).click();
  verifier((await page.locator('progress').getAttribute('value')) === '50' && (await visible(page, '50 %')), `${nom} : « Avancer » la porte à 50, avec son pourcentage`);
  // Chargement.
  verifier((await page.locator('[role="status"]', { hasText: 'Préparation en cours' }).count()) === 1, `${nom} : l'indicateur de chargement est là`);
  // Onglets.
  const onglets = page.getByRole('tablist');
  verifier((await onglets.getByRole('tab', { name: 'Description' }).getAttribute('aria-selected')) === 'true', `${nom} : le premier onglet est ouvert`);
  verifier(await visible(page, 'Poisson braisé, riz et banane plantain.'), `${nom} : son contenu est visible`);
  await onglets.getByRole('tab', { name: 'Avis' }).click();
  verifier(await visible(page, 'Un régal.'), `${nom} : cliquer sur « Avis » montre son contenu`);
  verifier(!(await visible(page, 'Poisson braisé, riz et banane plantain.')), `${nom} : et cache celui de « Description »`);
  if (nom === 'web') {
    await onglets.getByRole('tab', { name: 'Avis' }).focus();
    await page.keyboard.press('ArrowRight');
    verifier(await visible(page, 'Servi de midi à 23 h.'), `${nom} : la flèche droite ouvre l'onglet suivant`);
  }
  // Accordéon : un seul ouvert à la fois.
  verifier(await visible(page, 'Sur place, en espèces ou par mobile.'), `${nom} : le deroulant « ouvert » l'est au départ`);
  await page.getByRole('button', { name: 'Allergènes' }).click();
  verifier(await visible(page, 'Poisson.'), `${nom} : cliquer sur « Allergènes » l'ouvre`);
  verifier(!(await visible(page, 'Sur place, en espèces ou par mobile.')), `${nom} : dans un accordéon, l'autre se ferme`);
  verifier((await page.getByRole('button', { name: 'Allergènes' }).getAttribute('aria-expanded')) === 'true', `${nom} : aria-expanded suit`);
  // Carrousel.
  const carrousel = page.locator('[aria-roledescription="carrousel"]');
  verifier((await carrousel.locator('.humalis-carrousel-piste > *').count()) === 3, `${nom} : le carrousel a trois diapositives`);
  await carrousel.getByRole('button', { name: 'Suivant' }).click();
  await page.waitForTimeout(600);
  const decalage = await carrousel.locator('.humalis-carrousel-piste').evaluate((el) => el.scrollLeft);
  verifier(decalage > 100, `${nom} : « Suivant » fait défiler le carrousel (scrollLeft = ${Math.round(decalage)})`);
  verifier((await carrousel.locator('[aria-current="true"]').count()) === 1, `${nom} : un point est actif`);
  // Code QR : dessiné, puis relu.
  const svg = page.locator('.humalis-qr svg');
  verifier((await svg.count()) === 1 && ((await svg.locator('path').last().getAttribute('d')) ?? '').length > 200, `${nom} : le code QR est dessiné`);
  const jsqr = chargerJsQr();
  if (jsqr) {
    await page.addScriptTag({ content: jsqr });
    const lu = await page.evaluate(async () => {
      const el = document.querySelector('.humalis-qr svg');
      const xml = new XMLSerializer().serializeToString(el);
      const image = new Image();
      await new Promise((ok) => { image.onload = ok; image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); });
      const taille = 400;
      const toile = document.createElement('canvas');
      toile.width = toile.height = taille + 80;
      const c = toile.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, toile.width, toile.height);
      c.drawImage(image, 40, 40, taille, taille);
      const donnees = c.getImageData(0, 0, toile.width, toile.height);
      return window.jsQR(donnees.data, donnees.width, donnees.height)?.data ?? null;
    });
    verifier(lu === 'https://lefleuve.cd/plat/poisson-braise', `${nom} : le code QR relu donne l'adresse écrite (${lu})`);
  } else {
    console.log(`- ${nom} : décodage du code QR non vérifié (jsQR introuvable : HUMALIS_JSQR)`);
  }
  // Code QR et thème sombre : le code reste noir sur blanc.
  await page.emulateMedia({ colorScheme: 'dark' });
  verifier((await page.locator('.humalis-qr').evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(255, 255, 255)', `${nom} : le code QR reste sur fond blanc en mode sombre`);
  await page.screenshot({ path: join(travail, 'captures', `${nom}-plat-sombre.png`), fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: join(travail, 'captures', `${nom}-plat-clair.png`), fullPage: true });
  // Téléphone : pas de défilement horizontal.
  await page.setViewportSize({ width: 375, height: 800 });
  verifier((await page.evaluate(() => document.documentElement.scrollWidth)) <= 375, `${nom} : téléphone, la page des éléments ne déborde pas`);
  verifier(erreurs.length === 0, `${nom} : aucune erreur dans la console (page des éléments)${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);
  await contexte.close();
}

const { chromium } = chargerPlaywright();
const navigateur = await chromium.launch();
try {
  const statique = compiler('statique');
  const a = await servir(statique);
  await scenario('statique', a.adresse, navigateur);
  await scenarioElements('statique', a.adresse, navigateur);
  a.arreter();

  if (avecWeb) {
    const dossier = compiler('web');
    execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'ignore' });
    execFileSync('npm', ['run', 'build:sans-prerendu'], { cwd: dossier, stdio: 'ignore' });
    const vite = spawn(join(dossier, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0'], { cwd: dossier });
    const adresse = await new Promise((ok, echec) => {
      vite.stdout.on('data', (m) => String(m).match(/http:\/\/localhost:\d+/) && ok(String(m).match(/http:\/\/localhost:\d+/)[0]));
      vite.on('exit', () => echec(new Error('vite preview s\'est arrêté')));
    });
    try {
      await scenario('web', adresse, navigateur);
      await scenarioElements('web', adresse, navigateur);
    } finally {
      vite.kill();
    }
  }
} finally {
  await navigateur.close();
}

console.log(problemes.length === 0 ? '\nTout est vérifié.' : `\n${problemes.length} vérification(s) en échec.`);
process.exit(problemes.length === 0 ? 0 : 1);
