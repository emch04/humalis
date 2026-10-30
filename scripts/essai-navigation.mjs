// Vérifie en vrai la navigation (plan 2026-10-30-donnees-et-navigation, partie B) :
// exemples/navigation.humalis est compilé pour le web, construit (tsc, Vite, prérendu),
// puis piloté dans Chromium face à une fausse API qui a la session de Rey Store (cookie
// de session, /auth/login, /auth/me, enveloppe { success, message, data }) :
// adresse choisie (/admin/commandes), page réservée qui renvoie vers « connexion »,
// « continuer » qui ramène à la page voulue, page 404 personnalisée ; puis les sous-pages
// (/espace, /espace/profil), les filtres d'adresse (?categorie=…) avec le bouton « retour »
// et le rechargement, les ancres (défilement), « revenir », les liens externes, le refus de
// javascript: et le lien actif.
//
// Lancer : npm run build && npm run essai:navigation [dossier-de-travail]
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-navigation'));
rmSync(travail, { recursive: true, force: true });
const web = join(travail, 'web');
const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};

// --- La fausse API : session par cookie, comme les packs Astratra --------------
const appels = [];
const api = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  appels.push(`${req.method} ${url.pathname}`);
  res.setHeader('access-control-allow-origin', req.headers.origin ?? '*');
  res.setHeader('access-control-allow-credentials', 'true');
  res.setHeader('access-control-allow-headers', 'content-type, x-csrf-token');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('content-type', 'application/json');
  const repondre = (code, corps) => {
    res.statusCode = code;
    res.end(JSON.stringify(corps));
  };
  const connecte = /(?:^|; )sid=ok/.test(req.headers.cookie ?? '');
  if (req.method === 'OPTIONS') return repondre(204, {});
  if (url.pathname === '/auth/login' && req.method === 'POST') {
    res.setHeader('set-cookie', 'sid=ok; Path=/; HttpOnly; SameSite=Lax');
    return repondre(200, { success: true, message: 'Connecté.', data: { token: 'jeton-secret-de-l-api' } });
  }
  if (url.pathname === '/auth/me') {
    return connecte ? repondre(200, { success: true, message: 'Compte chargé.', data: { id: 'u1', email: 'rey@exemple.cd', role: 'admin' } }) : repondre(401, { success: false, message: 'Non connecté.' });
  }
  if (url.pathname === '/auth/logout') {
    res.setHeader('set-cookie', 'sid=; Path=/; Max-Age=0');
    return repondre(200, { success: true, message: 'Déconnecté.', data: null });
  }
  if (url.pathname === '/api/admin/orders') {
    return connecte ? repondre(200, { success: true, message: 'Commandes chargées.', data: [{ id: 'c1', number: 'RS-0001' }, { id: 'c2', number: 'RS-0002' }] }) : repondre(401, { success: false, message: 'Connexion requise.' });
  }
  repondre(404, { success: false, message: 'Introuvable.' });
});
await new Promise((ok) => api.listen(0, 'localhost', ok));
const adresseApi = `http://localhost:${api.address().port}`;

// --- Le site -------------------------------------------------------------------
execFileSync('node', ['dist/cli.js', 'compile', 'exemples/navigation.humalis', '--cible', 'web', '--sortie', web, '--adresse', 'https://boutique.exemple.cd'], { stdio: 'inherit' });
execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: web, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: web, stdio: 'inherit', env: { ...process.env, VITE_HUMALIS_SOURCE_COMPTE: adresseApi } });
verifier(true, 'le projet produit passe tsc et se construit (prérendu compris)');

const processus = [];
const adresseWeb = await new Promise((ok) => {
  const p = spawn(join(web, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0'], { cwd: web });
  processus.push(p);
  p.stdout.on('data', (m) => {
    const trouve = String(m).match(/http:\/\/localhost:\d+/)?.[0];
    if (trouve) ok(trouve);
  });
});

const visible = (locator) => locator.waitFor({ timeout: 6000 }).then(() => true, () => false);
const { chromium } = createRequire(join(web, 'package.json'))('playwright');
const navigateur = await chromium.launch();
try {
  const page = await navigateur.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));

  // Un visiteur ouvre directement la page réservée.
  await page.goto(`${adresseWeb}/admin/commandes`);
  verifier(await visible(page.getByRole('heading', { name: 'Connexion' })), "l'adresse choisie /admin/commandes existe, et un visiteur est renvoyé vers « connexion »");
  verifier(new URL(page.url()).pathname === '/connexion', '… l\'adresse est /connexion');
  verifier(!appels.includes('GET /api/admin/orders'), "… et la page réservée n'a rien demandé à l'API");

  await page.getByLabel('email').fill('rey@exemple.cd');
  await page.getByLabel('mot de passe').fill('Mot-de-passe-solide-1');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  verifier(await visible(page.getByText('RS-0002')), '« continuer » ramène à la page voulue (/admin/commandes), dont la liste vient de l\'API');
  verifier(new URL(page.url()).pathname === '/admin/commandes', '… l\'adresse est /admin/commandes');

  // Une adresse inconnue : la page 404 écrite en Humalis.
  await page.goto(`${adresseWeb}/nimporte-quoi`);
  verifier(await visible(page.getByRole('heading', { name: "Cette page n'existe pas" })), 'une adresse inconnue montre la page « introuvable » personnalisée');

  // La connexion directe (sans page voulue) mène à l'accueil.
  await page.context().clearCookies();
  await page.goto(`${adresseWeb}/connexion`);
  await page.getByLabel('email').fill('rey@exemple.cd');
  await page.getByLabel('mot de passe').fill('Mot-de-passe-solide-1');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  verifier(await visible(page.getByRole('heading', { name: 'Rey Store' })), 'sans page voulue, « continuer vers "accueil" » mène à l\'accueil');

  // --- Lien actif et menu ------------------------------------------------------
  await page.goto(`${adresseWeb}/`);
  verifier(await visible(page.locator('nav.humalis-menu')), "« menu » devient un <nav>");
  const actifs = await page.locator('nav.humalis-menu a[aria-current="page"]').allTextContents();
  verifier(actifs.length === 1 && actifs[0] === 'Accueil', `le lien de la page courante est marqué aria-current (${actifs.join(',')})`);
  verifier(await page.locator('nav.humalis-menu a.humalis-actif').count() === 1, '… et porte la classe humalis-actif');

  // --- Liens externes -----------------------------------------------------------
  const whatsapp = page.getByRole('link', { name: 'WhatsApp' });
  verifier((await whatsapp.getAttribute('href')) === 'https://wa.me/243000000', 'un lien externe garde son adresse https');
  verifier((await whatsapp.getAttribute('target')) === '_blank' && (await whatsapp.getAttribute('rel')) === 'noopener noreferrer', '« avec nouvel onglet » : target=_blank et rel=noopener noreferrer');

  // --- Filtres d'adresse ---------------------------------------------------------
  await page.getByRole('link', { name: 'Catalogue', exact: true }).click();
  verifier(await visible(page.getByText('Toutes les catégories')), 'sans filtre, le filtre vaut rien');
  verifier(new URL(page.url()).search === '', '… et l\'adresse n\'a pas de requête');
  const tout = await page.locator('nav.humalis-menu a[aria-current="page"]').allTextContents();
  verifier(tout.length === 1 && tout[0] === 'Tout', `sans filtre, seul « Tout » est actif (${tout.join(',')})`);
  await page.getByRole('link', { name: 'Maillots' }).click();
  verifier(await visible(page.getByText('Catégorie : maillots')), 'un lien « avec categorie "maillots" » donne le filtre');
  verifier(new URL(page.url()).search === '?categorie=maillots', '… dans la requête de l\'adresse');
  const maillots = await page.locator('nav.humalis-menu a[aria-current="page"]').allTextContents();
  verifier(maillots.length === 1 && maillots[0] === 'Maillots', `avec ce filtre, seul « Maillots » est actif (${maillots.join(',')})`);
  await page.getByRole('button', { name: 'Passer aux robes' }).click();
  verifier(await visible(page.getByText('Catégorie : robes')) && new URL(page.url()).search === '?categorie=robes', '« changer categorie par … » change l\'adresse');
  await page.goBack();
  verifier(await visible(page.getByText('Catégorie : maillots')), 'le bouton « retour » du navigateur ramène au filtre d\'avant');
  await page.reload();
  verifier(await visible(page.getByText('Catégorie : maillots')), 'un rechargement redonne le même filtre');
  await page.getByRole('link', { name: 'Tout', exact: true }).click();
  verifier(await visible(page.getByText('Toutes les catégories')) && new URL(page.url()).search === '', 'un lien sans filtre efface le filtre');

  // --- revenir ----------------------------------------------------------------------
  // Une arrivée directe (lien partagé) : on part d'une page vide, pour que l'entrée d'historique soit neuve.
  await page.goto('about:blank');
  await page.goto(`${adresseWeb}/catalogue`);
  await page.getByRole('button', { name: 'Retour' }).click();
  verifier(await visible(page.getByRole('heading', { name: 'Rey Store' })) && new URL(page.url()).pathname === '/', '« revenir vers "accueil" » : arrivé directement, va à la page de secours');
  await page.getByRole('link', { name: 'Catalogue', exact: true }).click();
  await page.getByRole('button', { name: 'Retour' }).click();
  verifier(await visible(page.getByRole('heading', { name: 'Rey Store' })) && new URL(page.url()).pathname === '/', '« revenir » après une navigation interne : le retour du navigateur');

  // --- Ancres ---------------------------------------------------------------------------
  await page.goto(`${adresseWeb}/carte`);
  verifier((await page.evaluate(() => window.scrollY)) === 0, 'la page « carte » s\'ouvre en haut');
  const posAvant = await page.evaluate(() => document.getElementById('desserts')?.getBoundingClientRect().top ?? 0);
  const hauteur = await page.evaluate(() => window.innerHeight);
  verifier(posAvant > hauteur, `avant le clic, l'ancre « desserts » est hors de l'écran (${Math.round(posAvant)} px, écran de ${hauteur} px)`);
  await page.getByRole('link', { name: 'Aller aux desserts' }).click();
  await page.waitForFunction(() => window.scrollY > 100, null, { timeout: 4000 }).catch(() => {});
  const posDesserts = await page.evaluate(() => document.getElementById('desserts')?.getBoundingClientRect().top ?? 9999);
  verifier(new URL(page.url()).hash === '#desserts' && (await page.evaluate(() => window.scrollY)) > 100 && posDesserts >= 0 && posDesserts < hauteur, `« vers "#desserts" » défile jusqu'à l'ancre (haut de l'ancre à ${Math.round(posDesserts)} px)`);
  await page.goto(`${adresseWeb}/`);
  await page.getByRole('link', { name: 'Nos desserts' }).click();
  await page.waitForFunction(() => window.scrollY > 100, null, { timeout: 4000 }).catch(() => {});
  verifier(new URL(page.url()).pathname === '/carte' && new URL(page.url()).hash === '#desserts' && (await page.evaluate(() => window.scrollY)) > 100, '« vers "carte#desserts" » ouvre la page puis défile jusqu\'à l\'ancre');

  // --- Sous-pages ---------------------------------------------------------------------------
  await page.goto(`${adresseWeb}/espace`);
  verifier(await visible(page.getByText('Vos réglages')), 'la sous-page d\'index s\'affiche à /espace, dans la page parente');
  verifier(await page.getByRole('heading', { name: 'Espace' }).count() === 1, '… avec le titre de la page parente');
  await page.getByRole('link', { name: 'Profil' }).click();
  verifier(await visible(page.getByText('Votre profil')) && new URL(page.url()).pathname === '/espace/profil', 'une sous-page sans adresse a celle de son parent suivie de son nom (/espace/profil)');
  verifier(await page.getByRole('heading', { name: 'Espace' }).count() === 1 && await page.getByText('Vos réglages').count() === 0, '… le parent reste, le contenu change');
  const profil = await page.locator('nav.humalis-menu a[aria-current="page"]').allTextContents();
  verifier(profil.length === 1 && profil[0] === 'Profil', `le lien de la sous-page affichée est actif (${profil.join(',')})`);
  await page.reload();
  verifier(await visible(page.getByText('Votre profil')), 'un rechargement de /espace/profil montre la sous-page');

  // --- javascript: refusé ----------------------------------------------------------------------
  await page.goto(`${adresseWeb}/danger`);
  await page.getByRole('button', { name: 'Aller' }).click();
  verifier(await visible(page.getByText(/Adresse refusée/)), 'une adresse javascript: reçue est refusée, avec un message');
  verifier((await page.evaluate(() => window.__pwned)) === undefined, '… et rien n\'a été exécuté');
  verifier(erreurs.length === 0, `aucune erreur JavaScript dans la page (${erreurs.join(' | ') || 'aucune'})`);
} finally {
  await navigateur.close();
  for (const p of processus) p.kill();
  api.close();
}

if (problemes.length > 0) {
  console.error(`\n${problemes.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log('\nToutes les vérifications passent.');
