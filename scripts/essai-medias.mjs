// Vérifie en vrai les graphiques, les médias et le mouvement : compile
// exemples/medias.humalis en site statique et en projet web construit (avec
// le prérendu), les sert, puis les pilote dans Chromium.
//
// Lancer : npm run build && npm run essai:medias [-- --sans-web]
// Playwright est cherché dans NODE_PATH, puis dans quelques dossiers connus.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const travail = resolve(process.env.HUMALIS_TRAVAIL ?? join(tmpdir(), 'humalis-essai-medias'));
const avecWeb = !process.argv.includes('--sans-web');
rmSync(join(travail, 'statique'), { recursive: true, force: true });
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

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

/** Sert un dossier de fichiers statiques (repli sur index.html, comme un hébergeur de site à une page). */
async function servir(dossier, entetes = {}) {
  const serveur = createServer((requete, reponse) => {
    let chemin = decodeURIComponent(new URL(requete.url, 'http://x').pathname);
    if (chemin.endsWith('/')) chemin += 'index.html';
    let fichier = join(dossier, chemin);
    if (!existsSync(fichier) && existsSync(fichier + '.html')) fichier += '.html';
    if (!existsSync(fichier) || statSync(fichier).isDirectory()) fichier = join(dossier, 'index.html');
    reponse.writeHead(200, { 'content-type': TYPES[extname(fichier)] ?? 'application/octet-stream', ...entetes });
    reponse.end(readFileSync(fichier));
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  return { adresse: `http://127.0.0.1:${serveur.address().port}`, arreter: () => serveur.close() };
}

function compiler(cible) {
  const dossier = join(travail, cible);
  execFileSync('node', ['dist/cli.js', 'compile', 'exemples/medias.humalis', '--cible', cible, '--sortie', dossier, ...(cible === 'web' ? ['--adresse', 'https://lefleuve.cd'] : [])], { stdio: 'ignore' });
  return dossier;
}

/** Ouvre une page dans un nouveau contexte ; les erreurs de la console sont gardées dans `erreurs`. */
async function ouvrir(navigateur, adresse, options, erreurs) {
  const contexte = await navigateur.newContext(options);
  const page = await contexte.newPage();
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(adresse);
  await page.waitForLoadState('networkidle');
  return page;
}

const opacites = (page) => page.$$eval('[class*="humalis-animation-"]', (els) => els.map((el) => getComputedStyle(el).opacity));

/** Le mouvement : rien ne bouge avec « réduire les animations », tout est visible sans JavaScript, les animations tournent sinon. */
async function scenarioMouvement(nom, adresse, navigateur) {
  const erreurs = [];
  // 1. Réduire les animations.
  let page = await ouvrir(navigateur, adresse, { viewport: { width: 1280, height: 500 }, reducedMotion: 'reduce' }, erreurs);
  verifier((await page.evaluate(() => document.getAnimations().length)) === 0, `${nom} : « réduire les animations », aucune animation au chargement`);
  verifier((await opacites(page)).every((o) => o === '1'), `${nom} : « réduire les animations », chaque élément animé est visible (opacité 1)`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  verifier((await page.evaluate(() => document.getAnimations().length)) === 0, `${nom} : « réduire les animations », aucune animation après le défilement`);
  verifier((await opacites(page)).every((o) => o === '1'), `${nom} : « réduire les animations », tout reste visible après le défilement`);
  const transition = await page.$eval('.humalis-transition-douce', (el) => getComputedStyle(el).transitionDuration);
  verifier(transition === '0s', `${nom} : « réduire les animations », la transition douce dure 0 s (${transition})`);
  await page.hover('.humalis-effet-agrandi');
  const transform = await page.$eval('.humalis-effet-agrandi', (el) => getComputedStyle(el).transform);
  verifier(transform === 'none', `${nom} : « réduire les animations », l'effet au survol ne bouge rien (${transform})`);
  await page.context().close();

  // 2. Sans préférence : les animations existent et se terminent.
  const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 320 }, reducedMotion: 'no-preference' });
  page = await contexte.newPage();
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(adresse, { waitUntil: 'commit' });
  await page.waitForSelector('.humalis-animation-apparition');
  const auDepart = await page.evaluate(() => document.getAnimations().length);
  verifier(auDepart > 0, `${nom} : sans préférence, les animations d'entrée tournent (${auDepart})`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(700);
  const enAttente = await page.$eval('.humalis-animation-agrandissement', (el) => ({ vu: el.hasAttribute('data-humalis-vu'), opacite: getComputedStyle(el).opacity }));
  verifier(!enAttente.vu && enAttente.opacite === '0', `${nom} : sans préférence, un bloc « au defilement » sous l'écran attend (opacité ${enAttente.opacite})`);
  await page.$eval('.humalis-animation-agrandissement', (el) => el.scrollIntoView());
  await page.waitForFunction(() => document.querySelector('.humalis-animation-agrandissement')?.hasAttribute('data-humalis-vu'));
  const pendant = await page.evaluate(() => document.getAnimations().length);
  verifier(pendant > 0, `${nom} : sans préférence, il s'anime en entrant à l'écran (${pendant} animation)`);
  await page.waitForTimeout(900);
  verifier((await opacites(page)).every((o) => o === '1') && (await page.evaluate(() => document.getAnimations().length)) === 0, `${nom} : sans préférence, les animations se terminent et tout est visible`);
  await page.hover('.humalis-effet-agrandi');
  await page.waitForTimeout(300);
  const agrandi = await page.$eval('.humalis-effet-agrandi', (el) => getComputedStyle(el).transform);
  verifier(agrandi.startsWith('matrix(1.03'), `${nom} : sans préférence, « effet agrandi » grossit le bouton au survol (${agrandi})`);
  await page.screenshot({ path: join(travail, 'captures', `${nom}-mouvement.png`), fullPage: true });
  // « réduire les animations » demandé pendant que la page est ouverte : tout est montré.
  await page.evaluate(() => window.scrollTo(0, 0));
  await contexte.close();

  // 3. Sans JavaScript (le site statique a son HTML de départ ; le web, son HTML prérendu).
  page = await ouvrir(navigateur, adresse, { viewport: { width: 1280, height: 320 }, javaScriptEnabled: false }, erreurs);
  const sansJsDefilement = await page.$$eval('.humalis-animation-defilement', (els) => els.map((el) => [getComputedStyle(el).opacity, getComputedStyle(el).animationName]));
  verifier(sansJsDefilement.length >= 2 && sansJsDefilement.every(([o, a]) => o === '1' && a === 'none'), `${nom} : sans JavaScript, les blocs « au defilement » sont visibles et immobiles`);
  // Les entrées sans « au defilement » sont du CSS seul : elles se jouent aussi, puis se terminent.
  await page.waitForTimeout(1000);
  const sansJs = await opacites(page);
  verifier(sansJs.length >= 4 && sansJs.every((o) => o === '1'), `${nom} : sans JavaScript, le contenu animé est là et visible (${sansJs.join(', ')})`);
  await page.context().close();

  verifier(erreurs.length === 0, `${nom} : aucune erreur dans la console (mouvement)${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);
}

// ─── Choisir un fichier et l'envoyer (plan, 4.3) ─────────────────────────────

/** Un PNG qui passe la vérification de la page (octets de tête) mais pas celle du serveur d'essai (il lui faut un vrai IHDR). */
const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const unPng = (octets) => Buffer.concat([SIGNATURE_PNG, Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.alloc(Math.max(0, octets - 16), 7)]);

/** Une petite API à la manière de Rey Store : corps brut, enveloppe { success, message, data }, session et CSRF, refus 415 avec son message. */
async function lancerApiDeFichiers() {
  const journal = { posts: [], enTetes: [], corps: [] };
  const etat = { sessionCoupee: false };
  const serveur = createServer((req, res) => {
    const origine = req.headers.origin ?? '*';
    res.setHeader('access-control-allow-origin', origine);
    res.setHeader('access-control-allow-credentials', 'true');
    res.setHeader('access-control-allow-headers', 'content-type, x-csrf-token, accept');
    res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
    res.setHeader('content-type', 'application/json');
    const repondre = (code, corps) => {
      res.statusCode = code;
      res.end(JSON.stringify(corps));
    };
    if (req.method === 'OPTIONS') return repondre(204, {});
    if (req.method === 'POST' && req.url === '/api/shop/photos') {
      const morceaux = [];
      req.on('data', (m) => morceaux.push(m));
      req.on('end', () => {
        const corps = Buffer.concat(morceaux);
        journal.posts.push(req.url);
        journal.enTetes.push(req.headers);
        journal.corps.push(corps);
        if (etat.sessionCoupee) return repondre(401, { success: false, message: 'Session expirée.' });
        const signature = corps.subarray(0, 8).equals(SIGNATURE_PNG);
        const ihdr = corps.subarray(12, 16).toString() === 'IHDR';
        if (!signature || !ihdr) return repondre(415, { success: false, message: 'Photo refusée : JPEG, PNG ou WebP seulement.' });
        repondre(201, { success: true, message: 'Photo enregistrée.', data: { fichier: `/televersements/photo-${journal.posts.length}.png` } });
      });
      return;
    }
    repondre(404, { success: false, message: 'Introuvable.' });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  return { adresse: `http://127.0.0.1:${serveur.address().port}`, journal, etat, arreter: () => serveur.close() };
}

async function scenarioFichier(navigateur) {
  const api = await lancerApiDeFichiers();
  const dossier = join(travail, 'fichier-web');
  rmSync(dossier, { recursive: true, force: true });
  execFileSync('node', ['dist/cli.js', 'compile', 'exemples/fichier.humalis', '--cible', 'web', '--sortie', dossier, '--adresse', 'https://boutique.exemple.cd'], { stdio: 'ignore' });
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--prefer-offline'], { cwd: dossier, stdio: 'ignore' });
  execFileSync('npm', ['run', 'build'], { cwd: dossier, stdio: 'ignore', env: { ...process.env, VITE_HUMALIS_SOURCE_BOUTIQUE: api.adresse } });
  verifier(true, 'fichier : le projet produit passe tsc et se construit (prérendu compris)');
  const fichiersProduits = readdirSync(join(dossier, 'src', 'humalis'));
  verifier(fichiersProduits.includes('televerser.ts') && fichiersProduits.includes('choix-fichier.tsx'), 'fichier : les deux petits fichiers sont écrits');
  verifier(!/axios|uppy|dropzone/.test(readFileSync(join(dossier, 'package.json'), 'utf8')), 'fichier : aucune bibliothèque de plus dans package.json');

  const site = await servir(join(dossier, 'dist'));
  const erreurs = [];
  try {
    const contexte = await navigateur.newContext({ viewport: { width: 900, height: 900 } });
    await contexte.addCookies([{ name: 'astratra_csrf', value: 'jeton-csrf', url: site.adresse }]);
    const page = await contexte.newPage();
    // Chromium note dans la console chaque réponse 4xx : ici, les refus 415 et 401 sont voulus.
    page.on('console', (m) => m.type() === 'error' && !/status of (415|401)/.test(m.text()) && erreurs.push(m.text()));
    page.on('pageerror', (e) => erreurs.push(e.message));
    // Compte les adresses d'aperçu rendues au navigateur.
    await page.addInitScript(() => {
      window.__liberees = 0;
      const revoquer = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (adresse) => {
        window.__liberees += 1;
        revoquer(adresse);
      };
    });
    await page.goto(site.adresse);
    await page.waitForLoadState('networkidle');

    const entree = page.getByLabel('Choisir une photo');
    verifier((await entree.count()) === 1 && (await entree.getAttribute('type')) === 'file', 'fichier : le bouton « Choisir une photo » est une vraie entrée de fichier, nommée par son libellé');
    verifier((await entree.getAttribute('accept'))?.split(',').sort().join() === 'image/avif,image/gif,image/jpeg,image/png,image/webp', 'fichier : « accepte images » donne image/png, jpeg, webp, gif, avif (et pas le SVG)');
    await page.keyboard.press('Tab');
    verifier(await page.evaluate(() => document.activeElement?.getAttribute('type') === 'file'), 'fichier : le clavier atteint l\'entrée de fichier (Tab)');
    verifier((await page.locator('.humalis-fichier-erreur').getAttribute('hidden')) !== null, 'fichier : aucun message tant que rien n\'est refusé');

    // Un fichier d'un mauvais type : refusé par la page, aucun appel réseau.
    await entree.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('bonjour') });
    await page.getByRole('alert').filter({ hasText: 'Ce fichier' }).waitFor({ timeout: 5000 });
    verifier((await page.getByRole('alert').filter({ hasText: 'Ce fichier' }).innerText()) === "Ce fichier n'est pas une image.", 'fichier : un texte n\'est pas une image (message en français, role="alert")');
    verifier((await page.getByRole('button', { name: 'Envoyer la photo' }).count()) === 0, 'fichier : un fichier refusé laisse la variable vide (pas d\'aperçu, pas de bouton d\'envoi)');
    // Un .txt renommé en .png est refusé aussi : le type est lu dans les octets, pas dans le nom.
    await entree.setInputFiles({ name: 'faux.png', mimeType: 'image/png', buffer: Buffer.from('ceci n\'est pas une image') });
    await page.getByRole('alert').filter({ hasText: 'Ce fichier' }).waitFor({ timeout: 5000 });
    verifier((await page.getByRole('alert').filter({ hasText: 'Ce fichier' }).innerText()) === "Ce fichier n'est pas une image.", 'fichier : un .txt renommé en .png est refusé (octets de tête lus)');

    // Trop gros : refusé sans appel réseau.
    await entree.setInputFiles({ name: 'enorme.png', mimeType: 'image/png', buffer: unPng(6 * 1024 * 1024) });
    await page.getByRole('alert').filter({ hasText: 'trop gros' }).waitFor({ timeout: 5000 });
    verifier((await page.getByRole('alert').filter({ hasText: 'trop gros' }).innerText()) === 'Ce fichier est trop gros : 6 Mo, le maximum est 5 Mo.', 'fichier : 6 Mo dépasse 5 Mo, avec les tailles dans le message');
    verifier(api.journal.posts.length === 0, 'fichier : aucun appel réseau pour un fichier refusé par la page');

    // Un bon fichier : aperçu, nom, bouton.
    await entree.setInputFiles({ name: 'moi.png', mimeType: 'image/png', buffer: unPng(1_200_000) });
    const apercu = page.getByRole('img', { name: 'Aperçu de la photo choisie' });
    await apercu.waitFor({ timeout: 5000 });
    verifier((await apercu.getAttribute('src'))?.startsWith('blob:'), 'fichier : l\'aperçu est une adresse locale (blob:)');
    verifier(await page.getByText('moi.png', { exact: true }).first().isVisible(), 'fichier : le nom du fichier choisi est affiché');
    verifier(await page.locator('.humalis-fichier-erreur').isHidden(), 'fichier : le message de refus disparaît quand le fichier convient');
    // Un autre fichier : l'ancienne adresse d'aperçu est rendue.
    const avant = await page.evaluate(() => window.__liberees);
    await entree.setInputFiles({ name: 'moi2.png', mimeType: 'image/png', buffer: unPng(1_200_000) });
    await page.getByText('moi2.png', { exact: true }).first().waitFor({ timeout: 5000 });
    verifier((await page.evaluate(() => window.__liberees)) > avant, 'fichier : changer de fichier rend l\'ancienne adresse d\'aperçu (revokeObjectURL)');

    // L'envoi, réseau ralenti : la progression passe par des valeurs intermédiaires.
    const cdp = await contexte.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: -1, uploadThroughput: 250 * 1024 });
    const valeurs = new Set();
    const surveillance = setInterval(async () => {
      try {
        const v = await page.locator('progress').getAttribute('value', { timeout: 200 });
        if (v !== null) valeurs.add(Number(v));
      } catch {}
    }, 120);
    await page.getByRole('button', { name: 'Envoyer la photo' }).click();
    const image = page.getByRole('img', { name: 'Votre photo de profil' });
    await image.waitFor({ timeout: 30_000 });
    clearInterval(surveillance);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const intermediaires = [...valeurs].filter((v) => v > 0 && v < 100);
    verifier(intermediaires.length >= 2, `fichier : la barre de progression passe par des valeurs intermédiaires (${[...valeurs].sort((a, b) => a - b).join(', ')})`);
    verifier((await page.locator('progress').getAttribute('value')) === '100', 'fichier : elle finit à 100');
    verifier((await image.getAttribute('src')) === '/televersements/photo-1.png', 'fichier : l\'adresse rendue par l\'API (champ « fichier » de data) s\'affiche');
    const entetes = api.journal.enTetes[0];
    verifier(api.journal.posts.length === 1 && entetes['content-type'] === 'image/png', 'fichier : un seul POST, en corps brut, avec le type du fichier');
    verifier(api.journal.corps[0].length === 1_200_000, 'fichier : le serveur a reçu tous les octets du fichier');
    verifier(entetes['x-csrf-token'] === 'jeton-csrf', 'fichier : le jeton CSRF de la session part dans l\'en-tête x-csrf-token');
    verifier(entetes.cookie?.includes('astratra_csrf'), 'fichier : les cookies de la session partent avec l\'envoi (credentials)');
    await page.screenshot({ path: join(travail, 'captures', 'fichier-envoye.png'), fullPage: true });

    // Le serveur refuse ce que la page avait laissé passer : son message s'affiche.
    await entree.setInputFiles({ name: 'faux2.png', mimeType: 'image/png', buffer: Buffer.concat([SIGNATURE_PNG, Buffer.from('pas un vrai png')]) });
    await page.getByText('faux2.png', { exact: true }).first().waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: 'Envoyer la photo' }).click();
    await page.getByText('Photo refusée : JPEG, PNG ou WebP seulement.').waitFor({ timeout: 8000 });
    verifier(true, 'fichier : un envoi que l\'API refuse (415) affiche le message de l\'API (la page ne remplace pas le serveur)');
    verifier(api.journal.posts.length === 2, 'fichier : l\'envoi refusé n\'est pas rejoué tout seul');

    // La session coupée.
    api.etat.sessionCoupee = true;
    await entree.setInputFiles({ name: 'moi3.png', mimeType: 'image/png', buffer: unPng(2000) });
    await page.getByText('moi3.png', { exact: true }).first().waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: 'Envoyer la photo' }).click();
    await page.getByText('Connectez-vous pour continuer.').waitFor({ timeout: 8000 });
    verifier(api.journal.posts.length === 3, 'fichier : session coupée (401), le message invite à se connecter');
    verifier(erreurs.length === 0, `fichier : aucune erreur dans la console${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);
    await contexte.close();
  } finally {
    site.arreter();
    api.arreter();
  }
}

/** L'audio : un lecteur natif qui ne démarre jamais seul, ne télécharge rien avant la lecture, se pilote au clavier. */
async function scenarioAudio(nom, adresse, navigateur) {
  const erreurs = [];
  const contexte = await navigateur.newContext({ viewport: { width: 900, height: 700 } });
  const page = await contexte.newPage();
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  page.on('pageerror', (e) => erreurs.push(e.message));
  const sons = [];
  page.on('request', (r) => /\.wav(\?|$)/.test(r.url()) && sons.push(r.url()));
  await page.goto(adresse);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  const lecteurs = page.locator('audio');
  verifier((await lecteurs.count()) === 2, `${nom} : deux lecteurs de son`);
  const etats = await lecteurs.evaluateAll((els) => els.map((a) => ({ controls: a.controls, preload: a.preload, autoplay: a.autoplay, attribut: a.hasAttribute('autoplay'), paused: a.paused, loop: a.loop, nom: a.getAttribute('aria-label') })));
  verifier(etats.every((e) => e.controls && e.preload === 'none'), `${nom} : commandes natives (controls) et preload="none"`);
  verifier(etats.every((e) => !e.autoplay && !e.attribut && e.paused), `${nom} : aucun son ne démarre seul (autoplay absent, paused avant tout clic)`);
  verifier(sons.length === 0, `${nom} : aucun fichier son téléchargé avant la lecture (${sons.length} requête)`);
  verifier(etats[0].nom === 'Extrait de la chanson Le Fleuve, deux secondes' && etats[1].loop === true, `${nom} : le lecteur porte sa description comme nom, et « boucle » relance le son`);

  // Au clavier : Tab jusqu'au lecteur, Espace lance, Espace arrête.
  await lecteurs.first().focus();
  verifier(await lecteurs.first().evaluate((a) => document.activeElement === a), `${nom} : le lecteur se focalise au clavier`);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !document.querySelector('audio').paused, null, { timeout: 5000 }).catch(() => {});
  verifier(!(await lecteurs.first().evaluate((a) => a.paused)), `${nom} : Espace lance le son`);
  await page.waitForTimeout(500);
  verifier((await lecteurs.first().evaluate((a) => a.currentTime)) > 0.2, `${nom} : la position avance`);
  verifier(sons.length >= 1, `${nom} : le fichier n'est téléchargé qu'à la lecture`);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('audio').paused, null, { timeout: 5000 }).catch(() => {});
  verifier(await lecteurs.first().evaluate((a) => a.paused), `${nom} : Espace arrête le son`);

  // La transcription : un bloc natif, fermé, qui s'ouvre au clavier.
  const resume = page.getByText('Lire la transcription');
  verifier(!(await page.locator('details.humalis-audio-transcription').evaluate((d) => d.open)), `${nom} : la transcription est fermée au départ`);
  await resume.focus();
  await page.keyboard.press('Enter');
  verifier(await page.getByText('Bonjour et bienvenue au Fleuve.').isVisible(), `${nom} : Entrée ouvre la transcription`);
  await page.screenshot({ path: join(travail, 'captures', `${nom}-audio.png`), fullPage: true });
  verifier(erreurs.length === 0, `${nom} : aucune erreur dans la console (audio)${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);
  await contexte.close();
}

// ─── La carte (plan, 4.5) ────────────────────────────────────────────────────

/** Une tuile de 256 x 256 pixels, bleu-gris uni : l'essai ne dépend pas d'OpenStreetMap et ne le sollicite pas. */
function tuilePng() {
  const morceau = (type, donnees) => {
    const tete = Buffer.alloc(4);
    tete.writeUInt32BE(donnees.length);
    const corps = Buffer.concat([Buffer.from(type), donnees]);
    const somme = Buffer.alloc(4);
    somme.writeUInt32BE(crc32(corps));
    return Buffer.concat([tete, corps, somme]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(256, 0);
  ihdr.writeUInt32BE(256, 4);
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 2; // couleurs RVB
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 256 }, () => [170, 211, 223]).flat())]);
  const image = deflateSync(Buffer.concat(Array.from({ length: 256 }, () => ligne)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), morceau('IHDR', ihdr), morceau('IDAT', image), morceau('IEND', Buffer.alloc(0))]);
}

const HOTES_DE_TUILES = /^https:\/\/(tile\.openstreetmap\.org|tuiles\.exemple\.cd)\//;
const SE_PRESENTER_COMME_UNE_PERSONNE = () => Object.defineProperty(navigator, 'webdriver', { get: () => false });

/**
 * Les cartes : Leaflet dessine les tuiles (servies par l'essai, jamais par OpenStreetMap), les repères
 * se focalisent au clavier, l'attribution est affichée, la liste des lieux est lue par l'arbre
 * d'accessibilité, et elle est là sans JavaScript.
 */
async function scenarioCarte(nom, adresse, navigateur) {
  const tuile = tuilePng();
  const erreurs = [];
  const contexte = await navigateur.newContext({ viewport: { width: 1000, height: 900 }, reducedMotion: 'no-preference' });
  // Le prérendu pilote un navigateur : la carte n'y est pas dessinée. L'essai se présente comme une personne.
  await contexte.addInitScript(SE_PRESENTER_COMME_UNE_PERSONNE);
  const tuiles = [];
  const dehors = [];
  await contexte.route(HOTES_DE_TUILES, (route) => {
    tuiles.push({ url: route.request().url(), referer: route.request().headers().referer });
    route.fulfill({ status: 200, contentType: 'image/png', body: tuile });
  });
  const page = await contexte.newPage();
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  page.on('pageerror', (e) => erreurs.push(e.message));
  const origine = new URL(adresse).origin;
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== origine && !/^(tile\.openstreetmap\.org|tuiles\.exemple\.cd)$/.test(url.hostname)) dehors.push(r.url());
  });
  await page.goto(adresse);
  await page.waitForLoadState('networkidle');
  await page.locator('.leaflet-container').first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(500);

  verifier((await page.locator('.leaflet-container').count()) === 2, `${nom} : deux cartes dessinées par Leaflet`);
  verifier((await page.locator('.leaflet-marker-icon').count()) === 3, `${nom} : 3 marqueurs (deux agences d'une liste et l'entrepôt)`);
  verifier(tuiles.length > 0 && tuiles.every((t) => t.url.startsWith('https://tile.openstreetmap.org/')), `${nom} : les tuiles viennent d'OpenStreetMap (${tuiles.length} demandées, servies par l'essai)`);
  verifier(tuiles.every((t) => !!t.referer), `${nom} : chaque tuile part avec un Referer (politique d'usage d'OpenStreetMap)`);
  verifier(await page.locator('.leaflet-tile-loaded').first().isVisible(), `${nom} : au moins une tuile est affichée`);
  verifier(dehors.length === 0, `${nom} : aucune autre adresse tierce appelée que les tuiles (aucun CDN)${dehors.length ? ` (${dehors.join(', ')})` : ''}`);

  // L'attribution : toujours affichée, lisible, avec son lien.
  const attribution = page.locator('.leaflet-control-attribution').first();
  verifier(await attribution.isVisible(), `${nom} : l'attribution est affichée sur la carte`);
  verifier((await attribution.innerText()).includes('contributeurs d’OpenStreetMap'), `${nom} : « © les contributeurs d’OpenStreetMap »`);
  verifier((await attribution.locator('a[href="https://www.openstreetmap.org/copyright"]').count()) === 1, `${nom} : l'attribution renvoie à openstreetmap.org/copyright`);
  const dansLeCadre = await attribution.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const c = el.closest('.leaflet-container').getBoundingClientRect();
    return r.width > 0 && r.bottom <= c.bottom + 1 && r.right <= c.right + 1;
  });
  verifier(dansLeCadre, `${nom} : l'attribution est dans le cadre de la carte (pas cachée dehors)`);

  // Les commandes de zoom en français.
  verifier(
    (await page.locator('a.leaflet-control-zoom-in').first().getAttribute('aria-label')) === 'Agrandir' && (await page.locator('a.leaflet-control-zoom-out').first().getAttribute('aria-label')) === 'Réduire',
    `${nom} : les commandes de zoom s'appellent « Agrandir » et « Réduire »`,
  );

  // L'arbre d'accessibilité : une région par carte, la liste des lieux, ses liens.
  verifier((await page.getByRole('region', { name: 'Le restaurant Le Fleuve, avenue de la Gombe' }).count()) === 1, `${nom} : la carte est une région nommée par son texte`);
  const liste = page.getByRole('list', { name: "Les lieux de la carte : Nos deux agences à Kinshasa, et l'entrepôt" });
  verifier((await liste.getByRole('listitem').count()) === 3, `${nom} : la liste des lieux a 3 éléments, lue par l'arbre d'accessibilité`);
  verifier((await liste.getByText('12 avenue du Port').count()) === 1, `${nom} : l'adresse d'une agence est dans la liste`);
  const lien = liste.getByRole('link', { name: 'Ouvrir dans OpenStreetMap : Gombe' });
  verifier((await lien.getAttribute('href')) === 'https://www.openstreetmap.org/?mlat=-4.3047&mlon=15.307#map=15/-4.3047/15.307', `${nom} : le lien « Ouvrir dans OpenStreetMap : Gombe » a les bonnes coordonnées`);
  const taille = await page.locator('.humalis-carte-lieux').first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [r.width, r.height];
  });
  verifier(taille[0] <= 1 && taille[1] <= 1, `${nom} : la liste est masquée à l'œil (1 px) mais reste dans l'arbre d'accessibilité`);

  // Au clavier : les repères se focalisent et Entrée ouvre la bulle.
  const reperes = page.locator('.leaflet-marker-icon');
  verifier((await reperes.first().getAttribute('tabindex')) === '0' && (await reperes.first().getAttribute('role')) === 'button', `${nom} : un repère est un bouton focalisable (tabindex 0)`);
  verifier((await reperes.first().getAttribute('aria-label')) === 'Gombe', `${nom} : il porte le nom du lieu`);
  await reperes.first().focus();
  verifier(await reperes.first().evaluate((el) => document.activeElement === el), `${nom} : le repère reçoit le focus du clavier`);
  await page.keyboard.press('Enter');
  const bulle = page.locator('.leaflet-popup-content');
  await bulle.first().waitFor({ timeout: 3000 });
  const texte = await bulle.first().innerText();
  verifier(texte.includes('Gombe') && texte.includes('12 avenue du Port'), `${nom} : Entrée ouvre la bulle du repère (${texte.replace(/\n/g, ' / ')})`);
  // Tab passe d'un repère au suivant.
  await page.keyboard.press('Tab');
  const suivant = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  verifier(suivant === 'Limete', `${nom} : Tab passe du repère « Gombe » au repère suivant (${suivant})`);
  await page.screenshot({ path: join(travail, 'captures', `${nom}-carte.png`), fullPage: true });
  verifier(erreurs.length === 0, `${nom} : aucune erreur dans la console (carte)${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);
  await contexte.close();

  // « Réduire les animations » : la carte ne s'anime pas ; sans préférence, elle garde son zoom animé.
  for (const [preference, anime] of [['reduce', false], ['no-preference', true]]) {
    const c = await navigateur.newContext({ viewport: { width: 1000, height: 900 }, reducedMotion: preference });
    await c.addInitScript(SE_PRESENTER_COMME_UNE_PERSONNE);
    await c.route(HOTES_DE_TUILES, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: tuile }));
    const p = await c.newPage();
    await p.goto(adresse);
    await p.locator('.leaflet-container').first().waitFor({ timeout: 10_000 });
    // Leaflet marque son conteneur (fondu) quand les animations sont permises, et son volet (zoom animé) quand le navigateur sait le faire.
    const zoomAnime = (await p.locator('.leaflet-map-pane.leaflet-zoom-animated').count()) > 0;
    const fonduAnime = (await p.locator('.leaflet-container.leaflet-fade-anim').count()) > 0;
    const animee = fonduAnime;
    verifier(anime ? animee : !zoomAnime && !fonduAnime, anime ? `${nom} : sans préférence, la carte garde ses animations de zoom` : `${nom} : « réduire les animations », la carte ne s'anime pas (ni zoom, ni fondu)`);
    await c.close();
  }

  // Sans JavaScript : la liste des lieux est le contenu.
  const sansJs = await navigateur.newContext({ viewport: { width: 1000, height: 900 }, javaScriptEnabled: false });
  const p4 = await sansJs.newPage();
  await p4.goto(adresse);
  const items = await p4.locator('.humalis-carte-lieux li').allInnerTexts();
  verifier(items.some((t) => t.includes('Gombe') && t.includes('12 avenue du Port')) && items.some((t) => t.includes('Entrepôt')), `${nom} : sans JavaScript, la liste des lieux est dans la page (${items.length} éléments)`);
  verifier((await p4.locator('.leaflet-container').count()) === 0, `${nom} : sans JavaScript, aucune carte dessinée (la liste est l'alternative)`);
  await sansJs.close();
}

/** Un autre fournisseur de tuiles : ses tuiles et son attribution remplacent celles d'OpenStreetMap. */
async function scenarioTuiles(navigateur) {
  const dossier = join(travail, 'carte-tuiles');
  rmSync(dossier, { recursive: true, force: true });
  const source = join(travail, 'tuiles.humalis');
  writeFileSync(source, 'page "plan" :\n    carte "Le plan" avec latitude -4,325 et longitude 15,3222 et tuiles "https://tuiles.exemple.cd/{z}/{x}/{y}.png" et attribution "© Tuiles <b>Exemple</b>"\n');
  execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'statique', '--sortie', dossier], { stdio: 'ignore' });
  const site = await servir(dossier);
  const tuile = tuilePng();
  const appelees = [];
  const contexte = await navigateur.newContext({ viewport: { width: 800, height: 700 } });
  await contexte.route(/^https:\/\//, (route) => {
    appelees.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'image/png', body: tuile });
  });
  const page = await contexte.newPage();
  await page.goto(site.adresse);
  await page.locator('.leaflet-tile-loaded').first().waitFor({ timeout: 10_000 });
  verifier(appelees.length > 0 && appelees.every((u) => u.startsWith('https://tuiles.exemple.cd/')), `tuiles : seul le fournisseur choisi est appelé (${appelees.length} tuiles, aucune d'OpenStreetMap)`);
  const credit = await page.locator('.leaflet-control-attribution').innerText();
  verifier(credit.includes('© Tuiles <b>Exemple</b>') && !credit.includes('OpenStreetMap'), `tuiles : son attribution est affichée telle quelle, sans HTML interprété (${credit.replace(/\n/g, ' ')})`);
  await contexte.close();
  site.arreter();
}

const { chromium } = chargerPlaywright();
const navigateur = await chromium.launch();
try {
  await scenarioFichier(navigateur);
  const statique = compiler('statique');
  const a = await servir(statique);
  try {
    await scenarioMouvement('statique', a.adresse, navigateur);
    await scenarioAudio('statique', a.adresse, navigateur);
    await scenarioCarte('statique', a.adresse, navigateur);
    await scenarioTuiles(navigateur);
  } finally {
    a.arreter();
  }

  if (avecWeb) {
    const dossier = compiler('web');
    execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'ignore' });
    // La construction complète, prérendu compris : le HTML de départ de chaque page est écrit dans dist/.
    execFileSync('npm', ['run', 'build'], { cwd: dossier, stdio: 'ignore' });
    const prerendu = readFileSync(join(dossier, 'dist', 'index.html'), 'utf8');
    verifier(prerendu.includes('Poisson braisé'), 'web : le HTML prérendu contient le contenu de la page');
    verifier(!/humalis-js|data-humalis-vu/.test(prerendu), 'web : le HTML prérendu ne garde aucune marque du mouvement');
    const b = await servir(join(dossier, 'dist'));
    try {
      await scenarioMouvement('web', b.adresse, navigateur);
      await scenarioAudio('web', b.adresse, navigateur);
      await scenarioCarte('web', b.adresse, navigateur);
    } finally {
      b.arreter();
    }
    // Le desktop sert les mêmes pages sous sa politique de contenu stricte : la carte doit s'y dessiner sans la violer.
    const csp = ["default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data: https:", "font-src 'self' data:", "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"].join('; ');
    const d = await servir(join(dossier, 'dist'), { 'content-security-policy': csp });
    try {
      await scenarioCarte('desktop (politique de contenu)', d.adresse, navigateur);
    } finally {
      d.arreter();
    }
  }
} finally {
  await navigateur.close();
}

console.log(problemes.length === 0 ? '\nTout est vérifié.' : `\n${problemes.length} vérification(s) en échec.`);
process.exit(problemes.length === 0 ? 0 : 1);
