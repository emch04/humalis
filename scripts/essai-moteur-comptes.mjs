// Vérifie en vrai, sur le moteur de rendu, ce que les autres essais ne couvrent pas : invitations, mots de passe,
// session qui se renouvelle, bon en PDF, déplacement au clavier et à la souris, choix et envoi d'un fichier.
// Face à une fausse API (les mêmes adresses que les packs), dans Chromium.
//
// Lancer : npm run build && node scripts/essai-moteur-comptes.mjs [dossier-de-travail]
import { execFile, execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { createServer, request } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-comptes'));
mkdirSync(travail, { recursive: true });
const { chromium } = createRequire(import.meta.url)('playwright');
const problemes = [];
const verifier = (ok, message) => {
  if (!ok) problemes.push(message);
  console.log(`${ok ? '✓' : '✗'} ${message}`);
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

function construire(fichier, nom, env = {}) {
  const dossier = join(travail, nom);
  execFileSync('node', ['dist/cli.js', 'compile', fichier, '--cible', 'web', '--moteur', 'humalis', '--sortie', dossier], { stdio: ['ignore', 'ignore', 'pipe'] });
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: dossier, stdio: 'inherit' });
  execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: dossier, stdio: 'inherit', env: { ...process.env, ...env } });
  return join(dossier, 'dist');
}

function servir(dist, api) {
  const serveur = createServer((q, w) => {
    let corps = '';
    q.on('data', (m) => (corps += m));
    q.on('end', () => {
      const url = new URL(q.url, 'http://x');
      if (/^\/(api|auth)(\/|$)/.test(url.pathname)) return api(q, w, url, corps);
      let p = join(dist, decodeURIComponent(url.pathname));
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
      if (!existsSync(p)) p = join(dist, '404.html');
      w.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' });
      w.end(readFileSync(p));
    });
  });
  return new Promise((ok) => serveur.listen(0, () => ok({ url: `http://localhost:${serveur.address().port}`, fermer: () => serveur.close() })));
}

const navigateur = await chromium.launch();
const json = (w, statut, donnees) => { w.writeHead(statut, { 'content-type': 'application/json' }); w.end(JSON.stringify(donnees)); };
const bouton = (p, nom) => p.getByRole('button', { name: nom, exact: true });
const message = (p, texte) => p.getByText(texte).first().waitFor({ timeout: 5000 }).then(() => true, () => false);

// ─── Les comptes ────────────────────────────────────────────────────────────
{
  const recu = [];
  let connecte = false;
  let expiree = false;
  const api = (q, w, url, corps) => {
    recu.push(`${q.method} ${url.pathname}${corps ? ` ${corps}` : ''}`);
    if (url.pathname === '/auth/me') return json(w, connecte ? 200 : 401, connecte ? { data: { id: '1', email: 'a@b.cd', role: 'admin' } } : {});
    if (url.pathname === '/auth/login') { connecte = true; return json(w, 200, { data: { token: 'x' } }); }
    if (url.pathname === '/auth/logout') { connecte = false; return json(w, 200, {}); }
    if (url.pathname === '/auth/refresh') { expiree = false; return json(w, 200, { data: { token: 'y' } }); }
    if (url.pathname.startsWith('/auth/')) return json(w, 200, { success: true });
    if (expiree) return json(w, 401, { erreur: 'expirée' });
    if (url.pathname === '/api/equipe') return json(w, 200, [{ id: '1', email: 'a@b.cd', role: 'admin', statut: 'actif' }]);
    if (url.pathname === '/api/commandes') return json(w, 200, [{ id: 'c1', nom: 'Commande Awa', total: 12 }]);
    if (url.pathname === '/api/commandes/c1/bon') { w.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="bon.pdf"' }); return w.end('%PDF-1.4'); }
    return json(w, 404, {});
  };
  const serveur = await servir(construire('essais/moteur/comptes.humalis', 'comptes'), api);
  const contexte = await navigateur.newContext({ acceptDownloads: true, locale: 'fr-FR' });
  const page = await contexte.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));

  await page.goto(`${serveur.url}/equipe`);
  await page.waitForURL('**/');
  verifier(new URL(page.url()).pathname === '/', 'une page réservée renvoie un visiteur');

  // Le déplacement au clavier, puis à la souris.
  const ordre = () => page.locator('[data-deplacable] p').allTextContents();
  await page.locator('[data-deplacable]').first().focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  verifier((await ordre()).join() === 'Deux,Un,Trois', `déplacement au clavier (${(await ordre()).join()})`);
  verifier(await message(page, 'Ordre enregistré'), '« quand l’ordre change » est appelé');
  // Le message de réussite passe au-dessus de la liste : on attend qu'il parte.
  await page.getByText('Ordre enregistré').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  const boite = async (i) => page.locator('[data-deplacable]').nth(i).boundingBox();
  const de = await boite(2);
  const vers = await boite(0);
  await page.mouse.move(de.x + de.width / 2, de.y + de.height / 2);
  await page.mouse.down();
  await page.mouse.move(vers.x + vers.width / 2, vers.y + 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  verifier((await ordre())[0] === 'Trois', `déplacement à la souris (${(await ordre()).join()})`);

  await page.getByLabel('Email').fill('a@b.cd');
  await page.getByLabel('Mot de passe', { exact: true }).fill('Secret-1!');
  await bouton(page, 'Entrer').click();
  await page.getByText('Commande Awa').waitFor({ timeout: 5000 });
  verifier(recu.some((r) => r.startsWith('POST /auth/login')), 'la connexion passe par /auth/login');
  verifier(await page.getByText('a@b.cd (admin)').isVisible(), 'la page réservée s’ouvre pour un admin');

  const attente = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await bouton(page, 'Bon').click();
  const telechargement = await attente;
  verifier(telechargement !== null, 'le bon en PDF se télécharge, sans ouvrir de page');

  await page.getByLabel('Adresse').fill('b@c.de');
  await bouton(page, 'Inviter').click();
  verifier(await message(page, 'Invitation envoyée'), 'une invitation part');
  verifier(recu.some((r) => r.startsWith('POST /auth/invitations') && r.includes('b@c.de') && r.includes('admin')), '… vers /auth/invitations, avec son rôle');

  await page.getByLabel('Actuel').fill('Secret-1!');
  await page.getByLabel('Nouveau').fill('Secret-2!');
  await bouton(page, 'Changer').click();
  verifier(await message(page, 'Mot de passe changé'), 'le mot de passe se change');
  verifier(recu.some((r) => r.startsWith('POST /auth/mot-de-passe')), '… par /auth/mot-de-passe');

  // La session expire : la requête se renouvelle et repart toute seule.
  expiree = true;
  await page.goto(`${serveur.url}/equipe`);
  await page.getByText('Commande Awa').waitFor({ timeout: 8000 }).catch(() => {});
  verifier(recu.some((r) => r.startsWith('POST /auth/refresh')) && await page.getByText('Commande Awa').isVisible(), 'une session expirée se renouvelle toute seule');

  await bouton(page, 'Sortir').click();
  await page.waitForURL('**/');
  verifier(recu.some((r) => r.startsWith('POST /auth/logout')), 'la déconnexion');

  await page.goto(`${serveur.url}/oublie`);
  await page.getByLabel('Email').fill('x@y.zz');
  await bouton(page, 'Recevoir un lien').click();
  verifier(await message(page, 'Un lien vient de partir'), 'demander un lien de mot de passe');
  verifier(recu.some((r) => r.startsWith('POST /auth/forgot-password')), '… par /auth/forgot-password');

  await page.goto(`${serveur.url}/bienvenue#jeton=jeton123`);
  await page.getByLabel('Mot de passe').first().fill('Secret-3!');
  await bouton(page, 'Enregistrer').click();
  verifier(await message(page, 'Mot de passe enregistré'), 'choisir le mot de passe depuis le lien');
  verifier(recu.some((r) => r.startsWith('POST /auth/reset-password') && r.includes('jeton123')), '… avec le jeton de l’adresse');
  verifier(erreurs.length === 0, `comptes : aucune erreur ${erreurs.join(' | ').slice(0, 300)}`);
  await contexte.close();
  serveur.fermer();
}

// ─── Choisir et envoyer un fichier ──────────────────────────────────────────
{
  const recu = [];
  const api = (q, w, url, corps) => {
    recu.push(`${q.method} ${url.pathname} ${q.headers['content-type'] ?? ''} ${corps.length}`);
    if (url.pathname === '/auth/me') return json(w, 200, { data: null });
    if (url.pathname.startsWith('/api/shop/photos')) return json(w, 200, { data: { fichier: 'https://exemple.test/photo.png' } });
    return json(w, 404, {});
  };
  const dist = construire('exemples/fichier.humalis', 'fichier', { VITE_HUMALIS_SOURCE_BOUTIQUE: '' });
  const serveur = await servir(dist, api);
  const page = await navigateur.newPage({ locale: 'fr-FR' });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.goto(`${serveur.url}/`);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'chat.png', mimeType: 'image/png', buffer: png });
  await page.getByText('chat.png').first().waitFor({ timeout: 5000 });
  verifier(true, 'un fichier choisi apparaît, avec son nom');
  await bouton(page, 'Envoyer la photo').click();
  await page.waitForTimeout(800);
  verifier(recu.some((r) => r.startsWith('POST /api/shop/photos')), `le fichier part vers la source (${recu.filter((r) => r.includes('photos')).join(', ').slice(0, 120)})`);
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  verifier(await message(page, 'image'), 'un fichier du mauvais type est refusé, en français');
  verifier(erreurs.length === 0, `fichier : aucune erreur ${erreurs.join(' | ').slice(0, 300)}`);
  await page.close();
  serveur.fermer();
}

// ─── La connexion avec Google (la fenêtre de Google est simulée) ────────────
{
  let connecte = false;
  const recu = [];
  const api = (q, w, url, corps) => {
    recu.push(`${q.method} ${url.pathname} ${corps}`);
    if (url.pathname === '/auth/me') return json(w, connecte ? 200 : 401, connecte ? { data: { id: '1', email: 'g@b.cd', role: 'membre' } } : {});
    if (url.pathname === '/auth/google' && q.method === 'GET') return json(w, 200, { clientId: 'client-essai' });
    if (url.pathname === '/auth/google') { connecte = JSON.parse(corps).idToken === 'jeton-google'; return json(w, connecte ? 200 : 401, connecte ? {} : { erreur: 'refusé' }); }
    if (url.pathname === '/auth/refresh') return json(w, 200, {});
    return json(w, 404, {});
  };
  const dist = construire('essais/moteur/google.humalis', 'google');
  verifier(existsSync(join(dist, 'auth-google.html')), 'google : la page de retour est écrite');
  const serveur = await servir(dist, api);
  const contexte = await navigateur.newContext({ locale: 'fr-FR' });
  await contexte.route('https://accounts.google.com/**', (route) => {
    const parametres = new URL(route.request().url()).searchParams;
    route.fulfill({ status: 302, headers: { location: `${parametres.get('redirect_uri')}#id_token=jeton-google&state=${parametres.get('state')}` } });
  });
  const page = await contexte.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.goto(`${serveur.url}/`);
  await page.getByText("Vous n'êtes pas connecté").waitFor({ timeout: 5000 });
  await bouton(page, 'Google').click();
  verifier(await message(page, 'Bienvenue'), 'google : la fenêtre s’ouvre, le jeton revient, la connexion réussit');
  verifier(await page.getByText('Vous êtes connecté').first().isVisible(), 'google : la page sait que la personne est connectée');
  verifier(recu.some((r) => r.startsWith('POST /auth/google') && r.includes('jeton-google') && r.includes('nonce')), 'google : le jeton et le nonce partent au serveur');
  verifier(erreurs.length === 0, `google : aucune erreur ${erreurs.join(' | ').slice(0, 200)}`);
  await contexte.close();
  serveur.fermer();
}

// ─── Lire le serveur à la construction, et garder les clics d'avant la reprise ──
{
  const lectures = [];
  let redirige = false;
  const dehors = createServer((q, w) => {
    lectures.push({ url: q.url, cookie: q.headers.cookie, autorisation: q.headers.authorization });
    if (redirige) { w.writeHead(302, { location: 'http://localhost:1/ailleurs' }); return w.end(); }
    w.writeHead(200, { 'content-type': 'application/json' });
    w.end(JSON.stringify([{ id: '1', nom: 'Livre rouge' }, { id: '2', nom: '<img src=x onerror=window.__attaque=1>' }]));
  });
  await new Promise((ok) => dehors.listen(0, ok));
  const adresse = `http://localhost:${dehors.address().port}`;
  const dossier = join(travail, 'donnees');
  // Sans bloquer : la fausse API tourne dans ce même processus.
  const compiler = () => promisify(execFile)('node', ['dist/cli.js', 'compile', 'essais/moteur/vitrine-donnees.humalis', '--cible', 'web', '--moteur', 'humalis', '--sortie', dossier, '--lire-serveur', adresse]);
  await compiler();
  verifier(lectures.length === 1 && lectures[0].url === '/api/produits' && !lectures[0].cookie && !lectures[0].autorisation, 'construction : une seule lecture, publique, sans cookie ni clé');
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: dossier, stdio: 'inherit' });
  execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: dossier, stdio: 'inherit' });
  const dist = join(dossier, 'dist');
  const brut = readFileSync(join(dist, 'index.html'), 'utf8');
  verifier(brut.includes('Livre rouge'), 'construction : le contenu du serveur est dans le HTML');
  verifier(!brut.includes('<img src=x') && brut.includes('&lt;img src=x'), 'construction : une donnée piégée reste du texte');
  const serveur = await servir(dist, (_q, w) => json(w, 200, [{ id: '1', nom: 'Livre rouge' }, { id: '3', nom: 'Nouveau livre' }]));
  const page = await navigateur.newPage();
  // Le code met du temps à arriver : la personne clique avant.
  await page.route('**/assets/*.js', async (route) => { await new Promise((z) => setTimeout(z, 900)); route.continue(); });
  await page.goto(`${serveur.url}/`, { waitUntil: 'commit' });
  await page.getByRole('button', { name: 'Dire', exact: true }).click({ noWaitAfter: true });
  await page.getByText('Dit 1 fois', { exact: true }).waitFor({ timeout: 8000 }).catch(() => {});
  verifier(await page.getByText('Dit 1 fois', { exact: true }).isVisible(), 'un clic fait avant que la page soit prête n’est pas perdu');
  await page.getByText('Nouveau livre').waitFor({ timeout: 5000 }).catch(() => {});
  verifier(await page.getByText('Nouveau livre').isVisible(), 'la page se met ensuite à jour avec le serveur');
  verifier(await page.evaluate(() => window.__attaque === undefined), 'construction : aucune donnée n’a été exécutée');
  await page.close();
  serveur.fermer();

  redirige = true;
  await compiler();
  verifier(!readFileSync(join(dossier, 'index.html'), 'utf8').includes('Livre rouge'), 'construction : une redirection n’est pas suivie, la page garde son état de départ');
  dehors.close();
}

// ─── Vue et Svelte, par le même contrat ─────────────────────────────────────
{
  const serveur = await servir(construire('essais/moteur/frameworks.humalis', 'frameworks'), (_q, w) => json(w, 404, {}));
  const page = await navigateur.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.goto(`${serveur.url}/`);
  await bouton(page, 'Vue Emch 0').click();
  await bouton(page, 'Vue Emch 1').waitFor({ timeout: 8000 });
  verifier(true, 'vue : le composant marche, avec son propre état');
  await bouton(page, 'Svelte Emch 0').click();
  await bouton(page, 'Svelte Emch 1').waitFor({ timeout: 8000 });
  verifier(true, 'svelte : le composant marche, avec son propre état');
  await bouton(page, 'Changer').click();
  await bouton(page, 'Vue Rey 1').waitFor({ timeout: 5000 });
  verifier(true, 'vue : une propriété changée arrive sans perdre son état');
  await bouton(page, 'Svelte Rey 0').waitFor({ timeout: 5000 });
  verifier(true, 'svelte : une propriété changée arrive (le composant repart de zéro)');
  verifier(erreurs.length === 0, `frameworks : aucune erreur ${erreurs.join(' | ').slice(0, 300)}`);
  await page.close();
  serveur.fermer();
}

// ─── Le vrai serveur produit par Humalis, avec les vrais packs ──────────────
{
  const dossierServeur = join(travail, 'vrai-serveur');
  const source = 'essais/moteur/comptes.humalis';
  execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'serveur', '--sortie', dossierServeur], { stdio: ['ignore', 'ignore', 'pipe'] });
  execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund', '--silent'], { cwd: dossierServeur, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: dossierServeur, stdio: 'ignore' });
  const port = 5400 + Math.floor(Math.random() * 90);
  const processus = spawn('node', ['dist/src/demarrer.js'], { cwd: dossierServeur, env: { ...process.env, PORT: String(port), JWT_SECRET: randomBytes(32).toString('hex'), HUMALIS_ADMIN_EMAIL: 'admin@club.cd', HUMALIS_ADMIN_MOT_DE_PASSE: 'Admin-Solide-1!', } });
  const pret = await new Promise((ok) => {
    const fin = setTimeout(() => ok(false), 20000);
    const lire = (m) => { if (String(m).includes('prêt')) { clearTimeout(fin); ok(true); } };
    processus.stdout.on('data', lire);
    processus.stderr.on('data', (m) => console.error(String(m).slice(0, 200)));
  });
  verifier(pret, 'vrai serveur : il démarre');
  if (pret) {
    const dist = join(travail, 'comptes', 'dist');
    const relais = (q, w, url, corps) => {
      const suite = request({ host: '127.0.0.1', port, path: q.url, method: q.method, headers: q.headers }, (r) => { w.writeHead(r.statusCode, r.headers); r.pipe(w); });
      suite.end(corps);
    };
    const serveur = await servir(dist, relais);
    const contexte = await navigateur.newContext({ acceptDownloads: true, locale: 'fr-FR' });
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto(`${serveur.url}/`);
    await page.getByLabel('Email').fill('admin@club.cd');
    await page.getByLabel('Mot de passe', { exact: true }).fill('Admin-Solide-1!');
    await bouton(page, 'Entrer').click();
    verifier(await message(page, 'admin@club.cd (admin)'), 'vrai serveur : la connexion, la page réservée, la liste des comptes');
    verifier((await contexte.cookies()).some((c) => c.name === 'astratra_session' && c.httpOnly), 'vrai serveur : la session est un cookie illisible par la page');
    await page.getByLabel('Actuel').fill('Admin-Solide-1!');
    await page.getByLabel('Nouveau').fill('Admin-Solide-2!');
    await bouton(page, 'Changer').click();
    verifier(await message(page, 'Mot de passe changé'), 'vrai serveur : changer le mot de passe');
    await bouton(page, 'Sortir').click();
    await page.waitForURL('**/');
    await page.getByLabel('Email').fill('admin@club.cd');
    await page.getByLabel('Mot de passe', { exact: true }).fill('Admin-Solide-1!');
    await bouton(page, 'Entrer').click();
    verifier(await page.getByRole('alert').first().waitFor({ timeout: 5000 }).then(() => true, () => false), 'vrai serveur : l’ancien mot de passe est refusé, avec un message');
    await page.getByLabel('Mot de passe', { exact: true }).fill('Admin-Solide-2!');
    await bouton(page, 'Entrer').click();
    verifier(await message(page, 'admin@club.cd (admin)'), 'vrai serveur : le nouveau mot de passe marche');
    verifier(erreurs.length === 0, `vrai serveur : aucune erreur ${erreurs.join(' | ').slice(0, 300)}`);
    await contexte.close();
    serveur.fermer();
  }
  processus.kill();
}

await navigateur.close();
console.log(problemes.length ? `\n${problemes.length} problème(s).` : '\nTout est vérifié.');
process.exit(problemes.length ? 1 : 0);
