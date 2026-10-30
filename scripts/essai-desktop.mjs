// Vérifie la cible desktop (étape 6) en vrai, autant que ce conteneur le
// permet : compile avec --cible desktop, installe chaque projet Electron,
// le construit (types des pages, types du processus principal, Vite), puis
// LANCE Electron et le pilote avec Playwright (_electron.launch) :
//   - la boutique : panier, navigation, menu en français, sécurité ;
//   - les avis : connexion au serveur démarré, à travers le relais ;
//   - un secret (« memorisee en secret ») et une valeur gardée.
//
// Il tourne sous Linux et sur un Mac (le binaire est lu dans
// electron/path.txt). À la main : cd <projet> && npm install && npm start.
//
// Lancer : npm run build && npm run essai:desktop [dossier-de-travail]
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, chownSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { _electron, chromium } = require('playwright');

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-desktop'));
const captures = join(travail, 'captures');
rmSync(travail, { recursive: true, force: true });
mkdirSync(captures, { recursive: true });
chmodSync(travail, 0o755);

const problemes = [];
const notes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};
const noter = (message) => {
  notes.push(message);
  console.log(`• ${message}`);
};
const visible = (element) => element.first().waitFor({ timeout: 5000 }).then(() => true, () => false);
const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ─── Le binaire d'Electron ───────────────────────────────────────────────

const cacheElectron = join(travail, 'cache-electron');

/**
 * Depuis Electron 44, le binaire est téléchargé au premier lancement
 * (install.js). Si ce téléchargement échoue (ici, bug d'undici derrière le
 * mandataire réseau), on télécharge le même zip avec curl, on vérifie son
 * empreinte SHA-256 avec celle publiée dans le paquet electron, et on le
 * range dans le cache qu'install.js lit.
 */
function assurerElectron(dossier) {
  const paquet = join(dossier, 'node_modules', 'electron');
  const env = { ...process.env, electron_config_cache: cacheElectron };
  const essai = spawnSync('node', [join(paquet, 'install.js')], { env, encoding: 'utf8' });
  if (essai.status === 0) return 'téléchargé par install.js (chemin normal)';

  const { version } = JSON.parse(readFileSync(join(paquet, 'package.json'), 'utf8'));
  const fichier = `electron-v${version}-${process.platform}-${process.arch}.zip`;
  const empreinte = JSON.parse(readFileSync(join(paquet, 'checksums.json'), 'utf8'))[fichier];
  if (!empreinte) throw new Error(`aucune empreinte publiée pour ${fichier}`);
  const base = `https://github.com/electron/electron/releases/download/v${version}`;
  const rangement = join(cacheElectron, createHash('sha256').update(base).digest('hex'));
  mkdirSync(rangement, { recursive: true });
  const zip = join(rangement, fichier);
  if (!existsSync(zip)) execFileSync('curl', ['-sSL', '--fail', '-o', zip, `${base}/${fichier}`], { stdio: 'inherit' });
  const obtenue = createHash('sha256').update(readFileSync(zip)).digest('hex');
  if (obtenue !== empreinte) {
    rmSync(zip);
    throw new Error(`empreinte du binaire Electron incorrecte : ${obtenue} au lieu de ${empreinte}`);
  }
  execFileSync('node', [join(paquet, 'install.js')], { env, stdio: 'inherit' });
  return `install.js a échoué (${(essai.stderr.match(/AssertionError[^\n]*|Error[^\n]*/) ?? ['erreur inconnue'])[0].trim()}) ; zip téléchargé par curl, empreinte SHA-256 vérifiée (${empreinte.slice(0, 12)}…)`;
}

// ─── Construire ──────────────────────────────────────────────────────────

function construire(nom, source, options = []) {
  const dossier = join(travail, nom);
  execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'desktop', '--sortie', dossier, ...options], { stdio: 'inherit' });
  // npm 11 : npm 10 échoue sur certains arbres de dépendances (« edgesOut »).
  execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'inherit' });
  const binaire = assurerElectron(dossier);
  if (nom === 'boutique') noter(`binaire Electron : ${binaire}`);
  execFileSync('npm', ['run', 'build'], { cwd: dossier, stdio: 'inherit' });
  verifier(
    existsSync(join(dossier, 'dist', 'index.html')) && existsSync(join(dossier, 'electron', 'dist', 'principal.js')),
    `${nom} : npm run build passe (tsc des pages, tsc du processus principal, vite build)`,
  );
  return dossier;
}

// ─── Lancer Electron ─────────────────────────────────────────────────────

/**
 * Sans écran, un écran virtuel (Xvfb). On le démarre nous-mêmes : xvfb-run
 * mêlerait la sortie d'erreur d'Electron à sa sortie normale, où Playwright
 * ne trouverait plus l'adresse de son débogueur.
 */
let ecranVirtuel;
function demarrerEcran() {
  if (process.env.DISPLAY || spawnSync('which', ['Xvfb']).status !== 0) return false;
  const numero = 90 + Math.floor(Math.random() * 400);
  // -ac : le compte ordinaire qui lance Electron peut s'y afficher.
  ecranVirtuel = spawn('Xvfb', [`:${numero}`, '-screen', '0', '1280x1024x24', '-ac', '-nolisten', 'tcp'], { stdio: 'ignore' });
  process.env.DISPLAY = `:${numero}`;
  process.on('exit', () => ecranVirtuel.kill());
  return true;
}

/**
 * En tant que root, Electron refuse son bac à sable. Plutôt que de le
 * couper, on le lance sous un compte ordinaire (runuser) : c'est le vrai
 * bac à sable qui est essayé.
 */
function preparerLanceur() {
  const xvfb = demarrerEcran();
  const racine = process.getuid?.() === 0;
  let compte;
  if (racine && spawnSync('which', ['runuser']).status === 0) {
    compte = readFileSync('/etc/passwd', 'utf8')
      .split('\n')
      .map((l) => l.split(':'))
      .find((c) => Number(c[2]) >= 1000 && Number(c[2]) < 60000 && c[5] && existsSync(c[5]));
  }
  const lanceur = join(travail, 'lancer-electron.sh');
  const devant = [
    ...(compte ? ['runuser', '-u', compte[0], '--'] : []),
    '/usr/bin/env',
    '-u',
    'NODE_OPTIONS',
    ...(compte ? [`HOME=${compte[5]}`] : []),
  ];
  const sansBacASable = racine && !compte;
  // La sortie d'erreur est aussi recopiée dans $JOURNAL, pour relire ce que dit le processus principal.
  writeFileSync(
    lanceur,
    `#!/bin/bash\nexec 2> >(tee -a "$JOURNAL" >&2)\nexec ${devant.map((m) => `'${m}'`).join(' ')} "$ELECTRON_REEL" ${sansBacASable ? '--no-sandbox ' : ''}"$@"\n`,
    { mode: 0o755 },
  );
  noter(
    `Electron lancé ${compte ? `sous le compte ordinaire « ${compte[0]} » (runuser), avec le vrai bac à sable de Chromium` : sansBacASable ? 'en root avec --no-sandbox (aucun compte ordinaire) : le bac à sable du système n’est PAS essayé' : 'sous le compte courant'}${xvfb ? `, sur un écran virtuel (Xvfb ${process.env.DISPLAY})` : ''}`,
  );
  return { lanceur, compte };
}
const { lanceur, compte } = preparerLanceur();
await attendre(500);

/** Le dossier de l'application (XDG_CONFIG_HOME), propre à l'essai et lisible par le compte qui lance. */
function profil(nom) {
  const dossier = join(travail, `profil-${nom}`);
  mkdirSync(dossier, { recursive: true });
  if (compte) chownSync(dossier, Number(compte[2]), Number(compte[3]));
  return dossier;
}

/** Le binaire d'Electron, là où le paquet l'a rangé (dist/electron sous Linux, dist/Electron.app/… sur Mac). */
const binaireElectron = (dossier) => {
  const paquet = join(dossier, 'node_modules', 'electron');
  return join(paquet, 'dist', readFileSync(join(paquet, 'path.txt'), 'utf8').trim());
};

/**
 * Sous Linux, XDG_CONFIG_HOME place les données de l'application dans le
 * profil de l'essai. Sur un Mac, elles iraient dans ~/Library/Application
 * Support : --user-data-dir les garde au même endroit que sous Linux.
 */
const dossierDonnees = (nom, appli) => (process.platform === 'darwin' ? [`--user-data-dir=${join(profil(nom), appli)}`] : []);

let lancements = 0;
async function lancer(dossier, nom, env = {}) {
  const journal = join(travail, `journal-${nom}-${++lancements}.txt`);
  writeFileSync(journal, '');
  const appli = await _electron.launch({
    executablePath: lanceur,
    args: [dossier, ...dossierDonnees(nom, basename(dossier))],
    cwd: dossier,
    env: { ...process.env, ...env, ELECTRON_REEL: binaireElectron(dossier), XDG_CONFIG_HOME: profil(nom), JOURNAL: journal },
    timeout: 60000,
  });
  const sortie = { lire: () => readFileSync(journal, 'utf8') };
  const page = await appli.firstWindow();
  const erreurs = [];
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.waitForLoadState('domcontentloaded');
  return { appli, page, erreurs, sortie };
}

// ─── 1. La boutique ──────────────────────────────────────────────────────

const dossierBoutique = construire('boutique', 'exemples/boutique.humalis');
{
  const dossier = dossierBoutique;
  const { appli, page, erreurs } = await lancer(dossier, 'boutique');
  try {
    verifier(page.url() === 'humalis://application/', `boutique : la fenêtre ouvre humalis://application/ (${page.url()})`);
    verifier(await visible(page.getByRole('heading', { name: 'Nos produits' })), 'boutique : le titre « Nos produits » s’affiche');
    verifier((await appli.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())) === 'Nos produits', 'boutique : le titre de la page est le titre de la fenêtre');
    verifier(await visible(page.getByText('Articles dans le panier : 0')), 'boutique : le panier est vide au départ');
    const ajouter = page.getByRole('button', { name: 'Ajouter' });
    verifier((await ajouter.count()) === 3, 'boutique : un bouton « Ajouter » par produit');
    await ajouter.nth(0).click();
    verifier(await visible(page.getByText('Articles dans le panier : 1')), 'boutique : « Ajouter » ajoute au panier');
    await ajouter.nth(2).click();
    verifier(await visible(page.getByText('Articles dans le panier : 2')), 'boutique : un deuxième article');
    await page.screenshot({ path: join(captures, 'boutique.png') });

    await page.getByRole('button', { name: 'Voir le panier' }).click();
    verifier(await visible(page.getByRole('heading', { name: 'Votre panier' })), 'boutique : « Voir le panier » mène au panier');
    verifier(page.url() === 'humalis://application/panier', `boutique : l’adresse est /panier, comme sur le web (${page.url()})`);
    verifier(await visible(page.getByText('Livre')) && await visible(page.getByText('Cahier')), 'boutique : le panier, partagé entre les pages, contient le Livre et le Cahier');
    await page.screenshot({ path: join(captures, 'panier.png') });

    // Le menu « Présentation > Page précédente » revient à la boutique.
    await appli.evaluate(({ Menu }) => {
      const presentation = Menu.getApplicationMenu().items.find((i) => i.label === 'Présentation');
      presentation.submenu.items.find((i) => i.label === 'Page précédente').click();
    });
    verifier(await visible(page.getByText('Articles dans le panier : 2')), 'boutique : le menu « Page précédente » revient à la boutique, panier gardé');
    await page.getByRole('button', { name: 'Voir le panier' }).click();
    await page.getByRole('heading', { name: 'Votre panier' }).waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: 'Retirer' }).first().click();
    await page.getByRole('button', { name: 'Retirer' }).first().click();
    verifier(await visible(page.getByText('Votre panier est vide.')), 'boutique : « Retirer » vide le panier');
    await page.getByRole('link', { name: 'Retour à la boutique' }).click();
    verifier(await visible(page.getByText('Articles dans le panier : 0')), 'boutique : le lien ramène à la boutique, panier à jour');
    // Recharger une adresse de page sert index.html (le routeur des pages marche).
    await page.goto('humalis://application/panier');
    verifier(await visible(page.getByRole('heading', { name: 'Votre panier' })), 'boutique : recharger /panier affiche le panier');
    await page.goto('humalis://application/');

    // Avant les essais de sécurité, qui provoquent exprès des refus dans la console.
    verifier(erreurs.length === 0, `boutique : aucune erreur dans la console${erreurs.length ? ` (${erreurs.join(' | ')})` : ''}`);

    // Le menu en français.
    const menu = await appli.evaluate(({ Menu }) =>
      Menu.getApplicationMenu().items.map((i) => ({ libelle: i.label, sous: i.submenu?.items.map((s) => s.label).filter(Boolean) ?? [] })),
    );
    const libelles = menu.map((m) => m.libelle);
    verifier(['Édition', 'Présentation', 'Fenêtre'].every((l) => libelles.includes(l)), `menu en français : ${libelles.join(', ')}`);
    const edition = menu.find((m) => m.libelle === 'Édition')?.sous ?? [];
    verifier(['Annuler', 'Copier', 'Coller', 'Tout sélectionner'].every((l) => edition.includes(l)), `menu Édition : ${edition.join(', ')}`);

    // La sécurité, lue dans l'application qui tourne.
    const reglages = await appli.evaluate(({ BrowserWindow }) => {
      const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return { contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, sandbox: p.sandbox, webSecurity: p.webSecurity };
    });
    verifier(
      reglages.contextIsolation === true && reglages.nodeIntegration === false && reglages.sandbox === true && reglages.webSecurity === true,
      `sécurité : contextIsolation, sans nodeIntegration, sandbox, webSecurity (${JSON.stringify(reglages)})`,
    );
    const node = await page.evaluate(() => [typeof globalThis.require, typeof globalThis.process, typeof globalThis.module]);
    verifier(node.every((t) => t === 'undefined'), `sécurité : la page n’a ni require, ni process, ni module (${node.join(', ')})`);
    const csp = await page.evaluate(async () => (await fetch('/')).headers.get('content-security-policy'));
    verifier(csp?.includes("script-src 'self'") === true, `sécurité : la page reçoit sa politique de contenu (${csp?.slice(0, 40)}…)`);
    const injecte = await page.evaluate(async () => {
      const script = document.createElement('script');
      script.textContent = 'window.__injecte = true;';
      document.head.appendChild(script);
      await new Promise((ok) => setTimeout(ok, 100));
      return globalThis.__injecte === true;
    });
    verifier(!injecte, 'sécurité : un script injecté dans la page ne s’exécute pas (CSP)');
    const fenetre = await page.evaluate(() => window.open('http://exemple.cd/') === null);
    verifier(fenetre, 'sécurité : window.open est refusé');
    await page.evaluate(() => {
      location.href = 'http://exemple.cd/';
    });
    await attendre(1000);
    verifier(page.url().startsWith('humalis://application/'), `sécurité : la fenêtre ne part pas vers un autre site (${page.url()})`);
    await page.evaluate(() => {
      location.href = 'humalis://application/panier';
    });
    verifier(await visible(page.getByRole('heading', { name: 'Votre panier' })), 'la fenêtre peut toujours aller vers ses propres pages (/panier)');
    const permission = await page.evaluate(() => Notification.requestPermission());
    verifier(permission === 'denied', `sécurité : les permissions sont refusées (notifications : ${permission})`);
    const sortie = await page.evaluate(async () => [(await fetch('/%2e%2e/package.json')).status, (await fetch('/../electron/principal.ts')).status]);
    verifier(sortie.every((s) => s === 404), `sécurité : rien n’est servi hors de dist/ (${sortie.join(', ')})`);


    // Le thème sombre. Sous Linux et Xvfb, nativeTheme ne change pas prefers-color-scheme :
    // on l'émule dans la page (le CSS est celui du web) ; sur Mac, le thème du système s'applique.
    const fondFenetre = await appli.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor());
    // Sur un Mac réglé en sombre, la fenêtre s'ouvre déjà sur le fond sombre.
    const systemeSombre = await appli.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors);
    verifier(
      systemeSombre ? /^#141416$/i.test(fondFenetre) : /^#ffffff$/i.test(fondFenetre),
      `boutique : la fenêtre s’ouvre sur le fond du thème ${systemeSombre ? 'sombre (réglage du système)' : 'clair'} (${fondFenetre})`,
    );
    await page.emulateMedia({ colorScheme: 'dark' });
    const fond = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    verifier(fond === 'rgb(20, 20, 22)', `boutique : en thème sombre, le fond est sombre (${fond})`);
    if (process.platform !== 'darwin') noter('thème sombre : vérifié en émulant prefers-color-scheme ; le passage par le réglage du système (nativeTheme) se voit sur un Mac');
    await page.screenshot({ path: join(captures, 'boutique-sombre.png') });
  } finally {
    await appli.close();
  }
}

// ─── 1 bis. Le paquet installable (Linux ou Mac, selon la machine) ───────

{
  // electron-builder, comme « npm run paquet », mais en dossier (sans AppImage).
  // Sur un Mac : l'application .app, sans signature (aucun certificat ici).
  const mac = process.platform === 'darwin';
  execFileSync('npx', ['electron-builder', mac ? '--mac' : '--linux', 'dir'], {
    cwd: dossierBoutique,
    stdio: 'inherit',
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  });
  const sortie = join(dossierBoutique, 'paquets', mac ? `mac${process.arch === 'arm64' ? '-arm64' : ''}` : 'linux-unpacked');
  const application = mac ? join(sortie, 'boutique.app', 'Contents', 'MacOS', 'boutique') : join(sortie, 'boutique');
  const ressources = mac ? join(sortie, 'boutique.app', 'Contents', 'Resources') : join(sortie, 'resources');
  verifier(existsSync(join(ressources, 'app.asar')), 'paquet : electron-builder construit l’application, pages dans app.asar');
  const fusibles = execFileSync('npx', ['--no-install', 'electron-fuses', 'read', '--app', application], { cwd: dossierBoutique, encoding: 'utf8' });
  for (const [fusible, etat] of [
    ['RunAsNode', 'Disabled'],
    ['EnableNodeOptionsEnvironmentVariable', 'Disabled'],
    ['EnableNodeCliInspectArguments', 'Disabled'],
    ['OnlyLoadAppFromAsar', 'Enabled'],
    ['EnableCookieEncryption', 'Enabled'],
    ['GrantFileProtocolExtraPrivileges', 'Disabled'],
  ]) {
    verifier(fusibles.includes(`${fusible} is ${etat}`), `paquet : fusible ${fusible} ${etat === 'Enabled' ? 'activé' : 'coupé'}`);
  }

  // Le débogueur de Node est coupé par les fusibles : Playwright se branche par le protocole de Chromium.
  const port = 9300 + Math.floor(Math.random() * 500);
  const journal = join(travail, 'journal-paquet.txt');
  writeFileSync(journal, '');
  const processus = spawn(lanceur, [`--remote-debugging-port=${port}`, ...dossierDonnees('paquet', 'boutique')], {
    env: { ...process.env, ELECTRON_REEL: application, XDG_CONFIG_HOME: profil('paquet'), JOURNAL: journal },
    stdio: 'ignore',
  });
  let navigateur;
  try {
    for (let essai = 0; essai < 60 && !navigateur; essai++) {
      await attendre(500);
      navigateur = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => undefined);
    }
    let page;
    for (let essai = 0; essai < 20 && !page; essai++) {
      page = navigateur?.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('humalis://'));
      if (!page) await attendre(500);
    }
    verifier(page !== undefined, `paquet : l’application construite s’ouvre sur ${page?.url() ?? '(aucune fenêtre)'}`);
    if (page) {
      verifier(await visible(page.getByRole('heading', { name: 'Nos produits' })), 'paquet : la boutique s’affiche depuis app.asar');
      await page.getByRole('button', { name: 'Ajouter' }).first().click();
      verifier(await visible(page.getByText('Articles dans le panier : 1')), 'paquet : « Ajouter » marche dans l’application construite');
      await page.screenshot({ path: join(captures, 'paquet.png') });
    }
  } finally {
    await navigateur?.close().catch(() => {});
    processus.kill();
  }
}

// ─── 2. Les avis : connexion au serveur, par le relais ───────────────────

{
  const serveur = join(travail, 'serveur-avis');
  execFileSync('node', ['dist/cli.js', 'compile', 'exemples/avis.humalis', '--cible', 'serveur', '--sortie', serveur], { stdio: 'inherit' });
  execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund'], { cwd: serveur, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: serveur, stdio: 'inherit' });
  const port = 5400 + Math.floor(Math.random() * 90);
  const EMAIL = 'admin@avis.cd';
  const MOT_DE_PASSE = 'Admin-Solide-2026!';
  const processus = spawn('node', ['dist/src/demarrer.js'], {
    cwd: serveur,
    env: { ...process.env, JWT_SECRET: randomBytes(32).toString('hex'), HUMALIS_ADMIN_EMAIL: EMAIL, HUMALIS_ADMIN_MOT_DE_PASSE: MOT_DE_PASSE, PORT: String(port) },
  });
  await new Promise((ok) => processus.stdout.on('data', (m) => String(m).includes('prêt') && ok()));

  // L'adresse du serveur est écrite à la compilation (--serveur).
  const dossier = construire('avis', 'exemples/avis.humalis', ['--serveur', `http://127.0.0.1:${port}`]);
  const { appli, page } = await lancer(dossier, 'avis');
  const champ = (nom) => page.locator(`[data-humalis="${nom}"]`);
  const envoyerDepuisLaPage = () =>
    page.evaluate(async () => (await fetch('/api/avis', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commentaire: 'Sans connexion' }) })).status);
  try {
    verifier(await visible(page.getByText('Connectez-vous pour laisser un avis.')), 'avis : un visiteur voit l’invitation à se connecter (lu sur /auth/me par le relais)');
    verifier((await envoyerDepuisLaPage()) === 401, 'avis : le serveur refuse l’avis d’un visiteur, à travers le relais (401)');

    await champ('champ_email').fill(EMAIL);
    await champ('champ_mot_de_passe').fill('Pas-Le-Bon-2026!');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    verifier(await visible(page.getByRole('alert').getByText('Email ou mot de passe incorrect.')), 'avis : un mauvais mot de passe affiche « Email ou mot de passe incorrect. »');

    await champ('champ_mot_de_passe').fill(MOT_DE_PASSE);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    verifier(await visible(page.getByRole('button', { name: 'Publier' })), 'avis : avec le bon mot de passe, le formulaire d’avis apparaît');
    const cookies = await appli.evaluate(async ({ session }) => (await session.defaultSession.cookies.get({})).map((c) => ({ nom: c.name, httpOnly: c.httpOnly, domaine: c.domain })));
    verifier(cookies.some((c) => c.nom === 'astratra_session' && c.httpOnly), `avis : la session du pack est gardée par le processus principal (${cookies.map((c) => c.nom).join(', ')})`);
    const vuParLaPage = await page.evaluate(() => ({ cookies: document.cookie, stockage: localStorage.length + sessionStorage.length }));
    verifier(vuParLaPage.cookies === '' && vuParLaPage.stockage === 0, 'avis : la page ne voit aucun cookie ni jeton');

    await champ('champ_commentaire').fill('Livraison rapide, très bon livre.');
    await page.getByRole('button', { name: 'Publier' }).click();
    verifier(await visible(page.getByText('Livraison rapide, très bon livre.')), 'avis : l’avis publié (jeton CSRF recopié par le relais) apparaît dans la page');
    const lus = await (await fetch(`http://127.0.0.1:${port}/api/avis`)).json();
    verifier(lus.length === 1 && lus[0].commentaire === 'Livraison rapide, très bon livre.', 'avis : le serveur a bien enregistré l’avis');
    await page.screenshot({ path: join(captures, 'avis-connecte.png') });

    await page.reload();
    verifier(await visible(page.getByRole('button', { name: 'Publier' })), 'avis : après un rechargement, la personne est toujours connectée');
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    verifier(await visible(page.getByText('Connectez-vous pour laisser un avis.')), 'avis : « se deconnecter » ramène le formulaire de connexion');
    verifier((await envoyerDepuisLaPage()) === 401, 'avis : après la déconnexion, le serveur refuse de nouveau (401)');
  } finally {
    await appli.close();
    processus.kill();
  }
}

// ─── 3. Un secret et une valeur gardée ───────────────────────────────────

{
  const source = join(travail, 'coffre.humalis');
  writeFileSync(
    source,
    `# Un secret (dans le coffre de l'ordinateur) et une valeur gardée.
variable visites = 0 avec partagee et memorisee

page "coffre" :
    variable jeton = "aucun" avec memorisee en secret
    titre "Le coffre"
    texte "Jeton : {jeton}"
    texte "Visites : {visites}"
    bouton "Garder"
    quand l'utilisateur clique sur "Garder" :
        changer jeton par "abc123"
        changer visites par visites + 1
`,
  );
  const dossier = construire('coffre', source);
  let essai = await lancer(dossier, 'coffre');
  let coffreSur = false;
  try {
    const { appli, page, sortie } = essai;
    const moteur = await appli.evaluate(({ safeStorage }) => ({
      disponible: safeStorage.isEncryptionAvailable(),
      moteur: process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : 'système',
    }));
    coffreSur = moteur.disponible && moteur.moteur !== 'basic_text';
    noter(`coffre de cet ordinateur : safeStorage ${moteur.disponible ? 'disponible' : 'indisponible'}, moteur « ${moteur.moteur} »`);
    const pont = await page.evaluate(() => Object.keys(window.humalisCoffre ?? {}).sort().join(','));
    verifier(pont === 'ecrire,lire', `coffre : la page ne reçoit que deux fonctions du pont (${pont})`);
    verifier(await visible(page.getByText('Jeton : aucun')) && await visible(page.getByText('Visites : 0')), 'coffre : les valeurs de départ s’affichent');
    await page.getByRole('button', { name: 'Garder' }).click();
    verifier(await visible(page.getByText('Jeton : abc123')) && await visible(page.getByText('Visites : 1')), 'coffre : le bouton change le secret et la valeur gardée');
    await attendre(500);
    await page.reload();
    verifier(await visible(page.getByText('Jeton : abc123')), 'coffre : après un rechargement, le secret est relu par le pont');
    verifier(await visible(page.getByText('Visites : 1')), 'coffre : après un rechargement, la valeur gardée est relue');
    const dossierCoffre = join(travail, 'profil-coffre', 'coffre', 'coffre');
    const ecrits = existsSync(dossierCoffre) ? readdirSync(dossierCoffre) : [];
    if (coffreSur) {
      const contenu = ecrits.map((f) => readFileSync(join(dossierCoffre, f), 'latin1')).join('');
      verifier(ecrits.length === 1 && !contenu.includes('abc123'), 'coffre : le secret est écrit chiffré sur le disque');
    } else {
      verifier(ecrits.length === 0, 'coffre : sans vrai coffre, aucun secret n’est écrit sur le disque');
      verifier(sortie.lire().includes("n'a pas de coffre sûr"), 'coffre : un avertissement le dit au lancement');
    }
  } finally {
    await essai.appli.close();
  }

  // Relancer l'application : la valeur gardée reste ; le secret aussi, s'il y a un vrai coffre.
  essai = await lancer(dossier, 'coffre');
  try {
    verifier(await visible(essai.page.getByText('Visites : 1')), 'coffre : après avoir relancé l’application, la valeur gardée est retrouvée');
    const attendu = coffreSur ? 'Jeton : abc123' : 'Jeton : aucun';
    verifier(await visible(essai.page.getByText(attendu)), `coffre : après avoir relancé l’application, « ${attendu} » (${coffreSur ? 'relu dans le coffre' : 'secret oublié, faute de coffre'})`);
    await essai.page.screenshot({ path: join(captures, 'coffre.png') });
  } finally {
    await essai.appli.close();
  }
}

console.log(`\nCaptures : ${captures}`);
for (const note of notes) console.log(`Note : ${note}`);
if (process.platform !== 'darwin') console.log('Non vérifié ici : l’application Mac (il faut un Mac). Sur un Mac, relancer ce script.');
if (problemes.length > 0) {
  console.error(`\n${problemes.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log('\nToutes les vérifications passent.');
