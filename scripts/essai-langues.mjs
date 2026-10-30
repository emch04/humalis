// Vérifie en vrai les deux langues (plan 2026-10-30-qualite-publication,
// partie 1) : compile exemples/deux-langues.humalis en site statique et en
// projet web construit, le sert, puis le pilote dans Chromium :
// - un navigateur réglé en français voit le français, un navigateur réglé en
//   anglais voit l'anglais (montants et pluriels compris), sans rien garder ;
// - le sélecteur change la langue et <html lang>, et le choix est gardé
//   après un rechargement et sur une autre page ;
// - un choix gardé (français) passe avant la langue du navigateur (anglais) ;
// - le site statique sans JavaScript montre la langue de base ;
// - exemples/deux-langues-medias.humalis (statique et web) : les graphiques,
//   le son, l'image, l'icône, l'indice et la description de la page suivent
//   la langue, en direct et après rechargement ;
// - exemples/deux-langues-fichier.humalis (web) : le libellé, les refus
//   (trop lourd, mauvais type) et le serveur muet, dans les deux langues.
//
// Lancer : npm run build && npm run essai:langues [-- --sans-web]
// Playwright est cherché dans NODE_PATH, puis dans quelques dossiers connus.
// Le projet web reprend le node_modules de NODE_PATH s'il a vite et react
// (aucun téléchargement), sinon lance npm install.
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.env.HUMALIS_TRAVAIL ?? join(tmpdir(), 'humalis-essai-langues'));
const sansWeb = process.argv.includes('--sans-web');
rmSync(travail, { recursive: true, force: true });
mkdirSync(join(travail, 'captures'), { recursive: true });

const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};

const dossiersModules = () => [...(process.env.NODE_PATH ?? '').split(':').filter(Boolean), join(process.env.HOME ?? '', 'astratra/node_modules')];

function chargerPlaywright() {
  for (const dossier of dossiersModules()) {
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

function compiler(cible, exemple = 'deux-langues') {
  const dossier = join(travail, exemple === 'deux-langues' ? cible : `${exemple}-${cible}`);
  execFileSync('node', ['dist/cli.js', 'compile', `exemples/${exemple}.humalis`, '--cible', cible, '--sortie', dossier], { stdio: 'inherit' });
  return dossier;
}

const espaces = (texte) => texte.replace(/[  ]/g, ' ');
const titre = (page) => page.locator('h1').first().innerText();
const langueHtml = (page) => page.evaluate(() => document.documentElement.lang);
const gardee = (page) => page.evaluate(() => localStorage.getItem('humalis-langue'));

async function scenario(nom, adresse, navigateur) {
  const erreurs = [];
  const ouvrir = async (options, chemin = '/') => {
    const contexte = await navigateur.newContext({ viewport: { width: 1000, height: 800 }, ...options });
    const page = await contexte.newPage();
    page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.goto(adresse + chemin);
    await page.waitForLoadState('networkidle');
    return page;
  };

  // Un navigateur en français : la langue de base, rien de gardé.
  let page = await ouvrir({ locale: 'fr-FR' });
  verifier((await titre(page)) === 'Bienvenue chez Rey Store', `${nom} : navigateur en français, le titre est en français`);
  verifier((await langueHtml(page)) === 'fr', `${nom} : <html lang="fr">`);
  verifier((await page.title()) === 'Bienvenue chez Rey Store', `${nom} : l'onglet est en français`);
  verifier(espaces(await page.getByText('Total :').innerText()) === 'Total : 1 234,50 €', `${nom} : le montant au format français (1 234,50 €)`);
  verifier((await gardee(page)) === null, `${nom} : rien n'est gardé tant que la personne n'a rien choisi`);
  await page.screenshot({ path: join(travail, 'captures', `${nom}-francais.png`), fullPage: true });

  // Le sélecteur : l'anglais, gardé, retrouvé après rechargement et sur une autre page.
  const selecteur = page.locator('select.humalis-selecteur-langue');
  verifier((await selecteur.getAttribute('aria-label')) === 'Langue', `${nom} : le sélecteur a un nom pour les lecteurs d'écran`);
  verifier((await selecteur.locator('option[lang="en"]').innerText()).trim() === 'English', `${nom} : l'anglais est écrit dans sa langue (English)`);
  await selecteur.selectOption('en');
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  verifier((await titre(page)) === 'Welcome to Rey Store', `${nom} : le sélecteur passe la page en anglais`);
  verifier((await langueHtml(page)) === 'en', `${nom} : <html lang="en"> après le choix`);
  verifier((await gardee(page)) === 'en', `${nom} : le choix est gardé dans le navigateur`);
  verifier((await page.locator('select.humalis-selecteur-langue').getAttribute('aria-label')) === 'Language', `${nom} : le nom du sélecteur suit la langue`);
  await page.reload();
  await page.waitForLoadState('networkidle');
  verifier((await titre(page)) === 'Welcome to Rey Store', `${nom} : après rechargement, la page reste en anglais`);
  verifier((await page.locator('select.humalis-selecteur-langue').inputValue()) === 'en', `${nom} : le sélecteur montre l'anglais choisi`);
  await page.getByRole('button', { name: 'See the catalogue' }).click();
  await page.waitForURL(/catalogue/);
  await page.waitForLoadState('networkidle');
  await page.locator('h1', { hasText: /catalogue/ }).waitFor();
  verifier((await titre(page)) === 'The catalogue', `${nom} : une autre page s'ouvre en anglais`);
  await page.context().close();

  // Un navigateur en anglais : l'anglais au premier affichage, montants et pluriels compris, rien de gardé.
  page = await ouvrir({ locale: 'en-GB' });
  verifier((await titre(page)) === 'Welcome to Rey Store', `${nom} : navigateur en anglais, le titre est en anglais dès le départ`);
  verifier((await langueHtml(page)) === 'en', `${nom} : <html lang="en"> pour un navigateur en anglais`);
  verifier((await page.title()) === 'Welcome to Rey Store', `${nom} : l'onglet est en anglais`);
  verifier((await page.getByText('in the cart').innerText()) === '3 items in the cart', `${nom} : le pluriel anglais (3 items)`);
  verifier((await page.getByText('Total:').innerText()) === 'Total: €1,234.50', `${nom} : le montant au format anglais (€1,234.50)`);
  verifier((await page.getByRole('button', { name: 'See the catalogue' }).count()) === 1, `${nom} : le bloc « traductions » traduit le bouton`);
  verifier((await gardee(page)) === null, `${nom} : une langue seulement détectée n'est pas gardée`);
  await page.screenshot({ path: join(travail, 'captures', `${nom}-anglais.png`), fullPage: true });

  // Le bouton écrit en Humalis (« si langue est anglais », « changer langue par francais »).
  await page.getByRole('button', { name: 'Switch to French' }).click();
  await page.waitForFunction(() => document.documentElement.lang === 'fr');
  verifier((await titre(page)) === 'Bienvenue chez Rey Store', `${nom} : « changer langue par francais » repasse en français`);
  verifier((await gardee(page)) === 'fr', `${nom} : ce choix est gardé aussi`);
  // Un choix gardé passe avant la langue du navigateur.
  await page.reload();
  await page.waitForLoadState('networkidle');
  verifier((await titre(page)) === 'Bienvenue chez Rey Store', `${nom} : navigateur en anglais, mais le français choisi est retrouvé`);
  verifier((await langueHtml(page)) === 'fr', `${nom} : <html lang="fr"> d'après le choix gardé`);
  await page.context().close();

  // Les messages de Humalis suivent la langue : l'erreur d'un champ oublié, la page introuvable.
  for (const [locale, attendu, introuvable] of [
    ['en-GB', 'The field “Email address” is required.', 'Page not found'],
    ['fr-FR', 'Le champ « Email » est obligatoire.', 'Page introuvable'],
  ]) {
    page = await ouvrir({ locale }, `/contact${nom === 'statique' ? '.html' : ''}`);
    await page.locator('form button').click();
    await page.locator('.humalis-message').waitFor();
    verifier((await page.locator('.humalis-message-texte').innerText()).trim() === attendu, `${nom} : l'erreur du champ oublié, en ${locale} (${attendu})`);
    await page.goto(adresse + (nom === 'statique' ? '/404.html' : '/nulle-part'));
    await page.waitForLoadState('networkidle');
    await page.locator('h1', { hasText: introuvable }).waitFor({ timeout: 5000 }).catch(() => {});
    verifier((await titre(page)) === introuvable, `${nom} : la page introuvable, en ${locale} (${introuvable})`);
    await page.context().close();
  }

  if (nom === 'statique') {
    // Sans JavaScript : le HTML de départ, dans la langue de base.
    page = await ouvrir({ locale: 'en-GB', javaScriptEnabled: false });
    verifier((await titre(page)) === 'Bienvenue chez Rey Store', `${nom} : sans JavaScript, la page se lit dans la langue de base`);
    verifier((await langueHtml(page)) === 'fr', `${nom} : sans JavaScript, <html lang="fr">`);
    await page.context().close();
  }
  verifier(erreurs.length === 0, `${nom} : aucune erreur dans la console${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);
}

/** Ouvre une page dans un navigateur de la langue demandée ; les erreurs de la console sont gardées. */
function ouvreur(adresse, navigateur, erreurs, ignorer = /$^/) {
  return async (options, chemin = '/') => {
    const contexte = await navigateur.newContext({ viewport: { width: 1000, height: 900 }, ...options });
    const page = await contexte.newPage();
    page.on('console', (m) => m.type() === 'error' && !ignorer.test(m.text()) && erreurs.push(m.text()));
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.goto(adresse + chemin);
    await page.waitForLoadState('networkidle');
    return page;
  };
}

const TEXTES_MEDIAS = {
  fr: {
    titre: 'Le Fleuve en chiffres',
    courbe: 'Graphique en courbe',
    barres: 'Graphique en barres',
    voir: 'Voir les données',
    montant: '120 000 FC',
    legende: ['Ventes', 'Achats'],
    colonneLibelle: 'Libellé',
    colonneValeur: 'Valeur',
    etiquettes: ['Lun', 'Mar', 'Mer'],
    descriptionCourbe: 'Les ventes passent de 120 000 FC à 180 000 FC.',
    audio: 'Extrait de la chanson Le Fleuve',
    transcription: 'Lire la transcription',
    texteTranscription: 'Bonjour et bienvenue au Fleuve.',
    image: 'Le logo du restaurant',
    icone: 'Notre plat favori',
    indice: 'Votre nom complet',
    pays: 'Choisir un pays',
    description: 'Cuisine du fleuve, tous les soirs, à Kinshasa, au bord de l’eau.',
  },
  en: {
    titre: 'The River in numbers',
    courbe: 'Line chart',
    barres: 'Bar chart',
    voir: 'View the data',
    montant: '120,000 FC',
    legende: ['Sales', 'Purchases'],
    colonneLibelle: 'Label',
    colonneValeur: 'Value',
    etiquettes: ['Mon', 'Tue', 'Wed'],
    descriptionCourbe: 'Sales go from 120,000 FC to 180,000 FC.',
    audio: 'Excerpt of the song Le Fleuve',
    transcription: 'Read the transcript',
    texteTranscription: 'Hello and welcome to the River.',
    image: 'The restaurant logo',
    icone: 'Our favourite dish',
    indice: 'Your full name',
    pays: 'Pick a country',
    description: 'River cooking, every evening, in Kinshasa, by the water.',
  },
};

/** Ce que la page des graphiques, du son, de l'image et du champ montre dans une langue. */
async function verifierMedias(page, nom, code, motif) {
  const t = TEXTES_MEDIAS[code];
  const etiquette = `${nom} (${motif})`;
  verifier((await titre(page)) === t.titre, `${etiquette} : le titre est en ${code}`);
  const figures = page.locator('figure.humalis-graphique');
  verifier((await figures.count()) === 3, `${etiquette} : trois graphiques`);
  verifier((await figures.nth(0).locator('svg.humalis-graphique-large > title').textContent()) === t.courbe, `${etiquette} : le nom du dessin (${t.courbe})`);
  verifier((await figures.nth(1).locator('svg.humalis-graphique-large > title').textContent()) === t.barres, `${etiquette} : le nom du dessin en barres (${t.barres})`);
  verifier((await figures.nth(0).locator('svg.humalis-graphique-large > desc').textContent()) === t.descriptionCourbe, `${etiquette} : la description du graphique`);
  verifier((await figures.nth(0).locator('summary').innerText()) === t.voir, `${etiquette} : « ${t.voir} »`);
  verifier(espaces(await figures.nth(0).locator('tbody td').first().textContent()) === t.montant, `${etiquette} : le montant du graphique (${t.montant})`);
  verifier((await figures.nth(1).locator('figcaption li').allInnerTexts()).map((x) => x.trim()).join('|') === t.legende.join('|'), `${etiquette} : la légende (${t.legende.join(', ')})`);
  verifier((await figures.nth(1).locator('thead th').allTextContents()).slice(1).join('|') === t.legende.join('|'), `${etiquette} : les séries dans la table`);
  verifier((await figures.nth(2).locator('thead th').allTextContents()).join('|') === `${t.colonneLibelle}|${t.colonneValeur}`, `${etiquette} : les en-têtes par défaut (${t.colonneLibelle}, ${t.colonneValeur})`);
  verifier((await figures.nth(2).locator('tbody th').allTextContents()).join('|') === t.etiquettes.join('|'), `${etiquette} : les étiquettes (${t.etiquettes.join(', ')})`);
  verifier((await page.locator('audio').getAttribute('aria-label')) === t.audio, `${etiquette} : la description du son`);
  verifier((await page.locator('audio').getAttribute('src')).endsWith('extrait.wav'), `${etiquette} : le nom du fichier son ne change pas`);
  verifier((await page.locator('.humalis-audio-transcription summary').innerText()) === t.transcription, `${etiquette} : « ${t.transcription} »`);
  verifier((await page.locator('.humalis-audio-transcription p').textContent()) === t.texteTranscription, `${etiquette} : la transcription`);
  verifier((await page.locator('img[data-humalis]').getAttribute('alt')) === t.image, `${etiquette} : le texte de remplacement de l'image`);
  verifier((await page.locator(`[aria-label="${t.icone}"]`).count()) === 1, `${etiquette} : la description de l'icône`);
  verifier((await page.locator('input[placeholder]').getAttribute('placeholder')) === t.indice, `${etiquette} : l'indice du champ`);
  verifier((await page.locator('select[data-humalis="champ_pays"] option').first().innerText()) === t.pays, `${etiquette} : la première ligne de la liste`);
}

/** Les graphiques, le son, l'image et l'indice dans les deux langues, et le basculement en direct. */
async function scenarioMedias(nom, adresse, navigateur) {
  const erreurs = [];
  const ouvrir = ouvreur(adresse, navigateur, erreurs);

  let page = await ouvrir({ locale: 'fr-FR' });
  await verifierMedias(page, nom, 'fr', 'navigateur en français');
  await page.screenshot({ path: join(travail, 'captures', `medias-${nom}-francais.png`), fullPage: true });
  // La description de la page (web : posée à l'affichage ; statique : écrite dans le HTML de départ).
  verifier((await page.locator('meta[name="description"]').getAttribute('content')) === TEXTES_MEDIAS.fr.description, `${nom} : la description de la page, en français`);

  // Le sélecteur : tout bascule en direct, sans recharger.
  await page.locator('select.humalis-selecteur-langue').selectOption('en');
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await verifierMedias(page, nom, 'en', 'après le sélecteur');
  if (nom === 'web') {
    verifier((await page.locator('meta[name="description"]').getAttribute('content')) === TEXTES_MEDIAS.en.description, `${nom} : la description de la page suit la langue`);
  }
  await page.screenshot({ path: join(travail, 'captures', `medias-${nom}-anglais.png`), fullPage: true });
  // Le choix est gardé : le rechargement reste en anglais.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await verifierMedias(page, nom, 'en', 'après rechargement');
  await page.context().close();

  page = await ouvrir({ locale: 'en-GB' });
  await verifierMedias(page, nom, 'en', 'navigateur en anglais');
  await page.context().close();

  if (nom === 'statique') {
    // Sans JavaScript : le HTML de départ, dans la langue de base.
    page = await ouvrir({ locale: 'en-GB', javaScriptEnabled: false });
    verifier((await page.locator('figure.humalis-graphique summary').first().innerText()) === TEXTES_MEDIAS.fr.voir, `${nom} : sans JavaScript, « ${TEXTES_MEDIAS.fr.voir} »`);
    verifier((await page.locator('audio').getAttribute('aria-label')) === TEXTES_MEDIAS.fr.audio, `${nom} : sans JavaScript, la description du son est en français`);
    await page.context().close();
  }
  verifier(erreurs.length === 0, `${nom} : aucune erreur dans la console${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);
}

/** Un PNG de 1 pixel (70 octets) et de faux octets de PNG d'une taille donnée. */
const PNG_MINUSCULE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const faussePng = (octets) => Buffer.concat([PNG_MINUSCULE.subarray(0, 8), Buffer.alloc(octets - 8)]);

/** Le choix et l'envoi d'un fichier : le bouton, la taille, le type refusé et le serveur muet, dans les deux langues. */
async function scenarioFichier(adresse, navigateur) {
  const erreurs = [];
  // Le serveur de l'API n'existe pas dans cet essai : sa connexion refusée est attendue.
  const ouvrir = ouvreur(adresse, navigateur, erreurs, /Failed to load resource|ERR_CONNECTION|XMLHttpRequest|CORS|net::/);
  const nom = 'web, fichier';
  const entree = (page) => page.locator('input[type="file"]');
  const erreurDuChoix = (page) => page.locator('.humalis-fichier-erreur');

  let page = await ouvrir({ locale: 'en-GB' });
  verifier((await page.locator('label.humalis-fichier-bouton').innerText()) === 'Choose a photo', `${nom} : le libellé du bouton en anglais`);
  await entree(page).setInputFiles({ name: 'grosse.png', mimeType: 'image/png', buffer: faussePng(1572864) });
  await erreurDuChoix(page).filter({ hasText: 'too large' }).waitFor();
  verifier(espaces(await erreurDuChoix(page).innerText()) === 'This file is too large: 1.5 MB, the maximum is 1 KB.', `${nom} : fichier trop lourd, en anglais (1.5 MB)`);
  await entree(page).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('bonjour') });
  await erreurDuChoix(page).filter({ hasText: 'not' }).waitFor();
  verifier((await erreurDuChoix(page).innerText()) === 'This file is not an image.', `${nom} : type refusé, en anglais`);
  await page.screenshot({ path: join(travail, 'captures', 'fichier-anglais.png'), fullPage: true });

  // En direct vers le français : le même refus se lit en français, la taille avec une virgule.
  await page.locator('select.humalis-selecteur-langue').selectOption('fr');
  await page.waitForFunction(() => document.documentElement.lang === 'fr');
  verifier((await page.locator('label.humalis-fichier-bouton').innerText()) === 'Choisir une photo', `${nom} : le libellé du bouton suit la langue`);
  await entree(page).setInputFiles({ name: 'grosse.png', mimeType: 'image/png', buffer: faussePng(1572864) });
  await erreurDuChoix(page).filter({ hasText: 'trop gros' }).waitFor();
  verifier(espaces(await erreurDuChoix(page).innerText()) === 'Ce fichier est trop gros : 1,5 Mo, le maximum est 1 Ko.', `${nom} : fichier trop lourd, en français (1,5 Mo)`);
  await entree(page).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('bonjour') });
  await erreurDuChoix(page).filter({ hasText: "n'est pas" }).waitFor();
  verifier((await erreurDuChoix(page).innerText()) === "Ce fichier n'est pas une image.", `${nom} : type refusé, en français`);

  // Une vraie image, l'envoi vers un serveur absent : le message du serveur muet suit la langue.
  await entree(page).setInputFiles({ name: 'point.png', mimeType: 'image/png', buffer: PNG_MINUSCULE });
  await page.getByRole('button', { name: 'Envoyer la photo' }).click();
  await page.locator('.humalis-message-texte').waitFor();
  verifier((await page.locator('.humalis-message-texte').innerText()).trim() === "Le serveur n'a pas répondu. Réessayez dans un instant.", `${nom} : le serveur muet, en français`);
  await page.context().close();

  page = await ouvrir({ locale: 'en-GB' });
  await entree(page).setInputFiles({ name: 'point.png', mimeType: 'image/png', buffer: PNG_MINUSCULE });
  await page.getByRole('button', { name: 'Send the photo' }).click();
  await page.locator('.humalis-message-texte').waitFor();
  verifier((await page.locator('.humalis-message-texte').innerText()).trim() === 'The server did not answer. Try again in a moment.', `${nom} : le serveur muet, en anglais`);
  verifier((await page.locator('progress').getAttribute('aria-label')) === 'Sending the photo', `${nom} : la description de la barre de progression`);
  await page.context().close();
  verifier(erreurs.length === 0, `${nom} : aucune autre erreur dans la console${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);
}

/** Le projet web, construit sans prérendu : node_modules repris de NODE_PATH s'il suffit, sinon npm install. */
function construireWeb(dossier) {
  const modules = dossiersModules().find((d) => ['vite', 'react', 'react-dom', 'react-router', '@vitejs/plugin-react'].every((m) => existsSync(join(d, m))));
  // Une icône demande lucide-react : s'il manque à `modules`, un dossier à part reprend chaque paquet de `modules` et une copie de celui de NODE_PATH.
  const lucide = dossiersModules().find((d) => existsSync(join(d, 'lucide-react')));
  const besoinLucide = /lucide-react/.test(readFileSync(join(dossier, 'package.json'), 'utf8'));
  if (modules && besoinLucide && lucide && !existsSync(join(modules, 'lucide-react'))) {
    mkdirSync(join(dossier, 'node_modules'));
    for (const entree of readdirSync(modules)) symlinkSync(join(modules, entree), join(dossier, 'node_modules', entree));
    // Copié, pas lié : lucide-react doit trouver le react du projet, pas celui de son dossier d'origine (deux React, erreur 525).
    cpSync(join(lucide, 'lucide-react'), join(dossier, 'node_modules', 'lucide-react'), { recursive: true });
  } else if (modules) symlinkSync(modules, join(dossier, 'node_modules'), 'dir');
  else execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'ignore' });
  execFileSync('npm', ['run', 'build:sans-prerendu'], { cwd: dossier, stdio: 'inherit' });
}

/** Construit un exemple pour le web, le sert avec `vite preview`, lance le scénario, puis arrête le serveur. */
async function surLeWeb(exemple, scenarioWeb) {
  const dossier = compiler('web', exemple);
  construireWeb(dossier);
  const vite = spawn(join(dossier, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0'], { cwd: dossier });
  const adresse = await new Promise((ok, echec) => {
    vite.stdout.on('data', (m) => String(m).match(/http:\/\/localhost:\d+/) && ok(String(m).match(/http:\/\/localhost:\d+/)[0]));
    vite.on('exit', () => echec(new Error('vite preview s\'est arrêté')));
  });
  try {
    await scenarioWeb(adresse);
  } finally {
    vite.kill();
  }
}

const { chromium } = chargerPlaywright();
const navigateur = await chromium.launch();
try {
  const statique = compiler('statique');
  const a = await servir(statique);
  await scenario('statique', a.adresse, navigateur);
  a.arreter();

  const medias = await servir(compiler('statique', 'deux-langues-medias'));
  await scenarioMedias('statique', medias.adresse, navigateur);
  medias.arreter();

  if (!sansWeb) {
    await surLeWeb('deux-langues', (adresse) => scenario('web', adresse, navigateur));
    await surLeWeb('deux-langues-medias', (adresse) => scenarioMedias('web', adresse, navigateur));
    await surLeWeb('deux-langues-fichier', (adresse) => scenarioFichier(adresse, navigateur));
  }
} finally {
  await navigateur.close();
}

console.log(problemes.length === 0 ? '\nTout est vérifié.' : `\n${problemes.length} vérification(s) en échec.`);
process.exit(problemes.length === 0 ? 0 : 1);
