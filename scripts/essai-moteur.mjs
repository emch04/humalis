// Vérifie en vrai le moteur de rendu : compile des programmes avec « --moteur humalis »,
// les assemble avec Vite, les sert, puis les pilote dans Chromium.
//
// Lancer : npm run build && npm run essai:moteur [dossier-de-travail]
// Il faut Playwright : npm i --no-save playwright
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-moteur'));
mkdirSync(travail, { recursive: true });
const racineDepot = process.cwd();
const { chromium } = createRequire(import.meta.url)('playwright');

const problemes = [];
export const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};

if (!existsSync(join(travail, 'node_modules/vite'))) {
  writeFileSync(join(travail, 'package.json'), '{"private":true}');
  execFileSync('npm', ['i', 'vite@8.3.4', '@astratra/client@1.1.0', '@astratra/centrale@1.10.0', '@vitejs/plugin-react@6.1.2', 'react@19.3.1', 'react-dom@19.3.1', 'three@0.187.0', '--no-audit', '--no-fund', '--silent'], { cwd: travail, stdio: 'inherit' });
}

function compiler(fichier, nom) {
  const dossier = join(travail, nom);
  execFileSync('node', [join(racineDepot, 'dist/cli.js'), 'compile', join(racineDepot, fichier), '--cible', 'web', '--moteur', 'humalis', '--sortie', dossier], { stdio: ['ignore', 'ignore', 'inherit'] });
  execFileSync('npx', ['vite', 'build', '--logLevel', 'warn'], { cwd: dossier, stdio: 'inherit' });
  return join(dossier, 'dist');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

function servir(dossier) {
  const redirections = existsSync(join(dossier, '_redirects'))
    ? readFileSync(join(dossier, '_redirects'), 'utf8').trim().split('\n').map((l) => l.split(' ')).map(([a, b]) => [new RegExp(`^${a.replace(/\*/g, '[^/]+')}/?$`), b])
    : [];
  const serveur = createServer((requete, reponse) => {
    let chemin = decodeURIComponent(new URL(requete.url, 'http://x').pathname);
    for (const [motif, vers] of redirections) if (motif.test(chemin)) chemin = vers;
    let fichier = join(dossier, chemin);
    if (existsSync(fichier) && statSync(fichier).isDirectory()) fichier = join(fichier, 'index.html');
    if (!existsSync(fichier)) {
      reponse.writeHead(404, { 'content-type': TYPES['.html'] });
      reponse.end(readFileSync(join(dossier, '404.html')));
      return;
    }
    reponse.writeHead(200, { 'content-type': TYPES[extname(fichier)] ?? 'application/octet-stream' });
    reponse.end(readFileSync(fichier));
  });
  return new Promise((ok) => serveur.listen(0, () => ok({ url: `http://localhost:${serveur.address().port}`, fermer: () => serveur.close() })));
}

/** Avant les scripts : retient les nœuds écrits et compte ce que la reprise touche dans <main>. */
const ESPION = () => {
  window.__mutations = { ajouts: 0, retraits: 0, textes: 0, attributs: 0 };
  document.addEventListener('readystatechange', () => {
    if (document.readyState !== 'interactive') return;
    new MutationObserver((liste) => {
      for (const m of liste) {
        if (m.type === 'childList') {
          window.__mutations.ajouts += m.addedNodes.length;
          window.__mutations.retraits += m.removedNodes.length;
        } else if (m.type === 'characterData') window.__mutations.textes++;
        else window.__mutations.attributs++;
      }
    }).observe(document.querySelector('main'), { childList: true, subtree: true, characterData: true, attributes: true });
  });
};

const navigateur = await chromium.launch({ channel: process.env.CANAL || undefined });
async function ouvrir(serveur, chemin = '/') {
  const contexte = await navigateur.newContext();
  const page = await contexte.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  await page.addInitScript(ESPION);
  await page.goto(serveur.url + chemin, { waitUntil: 'load' });
  await page.waitForTimeout(100);
  return { page, erreurs };
}
const mutations = (page) => page.evaluate(() => ({ ...window.__mutations }));
const remettre = (page) => page.evaluate(() => { window.__mutations = { ajouts: 0, retraits: 0, textes: 0, attributs: 0 }; });
const bouton = (page, nom) => page.getByRole('button', { name: nom, exact: true });

// ─── Le labo : ce que le moteur promet ──────────────────────────────────────
{
  const dist = compiler('essais/moteur/labo.humalis', 'labo');
  const serveur = await servir(dist);
  const brut = await (await fetch(serveur.url)).text();
  verifier(brut.includes('Compteur : 0') && brut.includes('Ligne b'), 'labo : le contenu est dans le HTML, sans JavaScript');
  const { page, erreurs } = await ouvrir(serveur);
  let m = await mutations(page);
  verifier(m.ajouts === 0 && m.retraits === 0 && m.textes === 0, `labo : la reprise ne touche rien (${JSON.stringify(m)})`);

  await page.evaluate(() => { window.__h1 = document.querySelector('h1'); window.__p = [...document.querySelectorAll('p')].find((p) => p.textContent === 'Ligne a'); });
  await remettre(page);
  await bouton(page, 'Plus').click();
  await page.getByText('Compteur : 1', { exact: true }).waitFor();
  m = await mutations(page);
  verifier(m.textes === 1 && m.ajouts === 0 && m.retraits === 0, `labo : un clic change un seul texte (${JSON.stringify(m)})`);
  verifier(await page.evaluate(() => window.__h1.isConnected && window.__p.isConnected), 'labo : les éléments ne sont pas recréés');

  // Le focus dans un champ pendant une mise à jour.
  const champ = page.getByLabel('Nom');
  await champ.click();
  await page.keyboard.type('ab');
  await page.getByText('Tape : ab', { exact: true }).waitFor();
  verifier(await champ.evaluate((c) => c === document.activeElement && c.selectionStart === 2), 'labo : le champ garde le focus et le curseur');

  // Déplacer une ligne sans perdre son focus ni la recréer.
  const choisir = bouton(page, 'Choisir').nth(0);
  await choisir.focus();
  await page.evaluate(() => { window.__b = document.activeElement; });
  await remettre(page);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Inverser').click());
  await page.waitForFunction(() => [...document.querySelectorAll('p')].filter((p) => /^Ligne/.test(p.textContent)).map((p) => p.textContent).join() === 'Ligne c,Ligne b,Ligne a');
  verifier(await page.evaluate(() => window.__b.isConnected && window.__b === document.activeElement && window.__p.isConnected), 'labo : inverser la liste garde les lignes et le focus');

  await remettre(page);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Ajouter').click());
  await page.getByText('Ligne z', { exact: true }).waitFor();
  m = await mutations(page);
  verifier(m.retraits === 0 && m.ajouts <= 3, `labo : ajouter une ligne n'ajoute qu'elle (${JSON.stringify(m)})`);

  await page.evaluate(() => { window.__p2 = [...document.querySelectorAll('p')].find((p) => p.textContent === 'Ligne b'); });
  await bouton(page, 'Basculer').click();
  await page.getByText('Cache', { exact: true }).waitFor();
  verifier(await page.getByText('Visible', { exact: true }).count() === 0, 'labo : la condition change de branche');
  verifier(await page.evaluate(() => window.__p2.isConnected), 'labo : la condition ne touche pas la liste');
  await bouton(page, 'Choisir').nth(0).click();
  await page.getByText('Compteur : 11', { exact: true }).waitFor();
  verifier(true, 'labo : un événement de ligne lit bien sa ligne');
  verifier(erreurs.length === 0, `labo : aucune erreur dans la console ${erreurs.join(' | ')}`);
  await page.context().close();
  serveur.fermer();
}

// ─── La boutique : pages, panier partagé, navigation ────────────────────────
{
  const dist = compiler('exemples/boutique.humalis', 'boutique');
  const serveur = await servir(dist);
  const { page, erreurs } = await ouvrir(serveur);
  const m = await mutations(page);
  verifier(m.ajouts === 0 && m.retraits === 0, `boutique : la reprise ne touche rien (${JSON.stringify(m)})`);
  await page.evaluate(() => { window.__memePage = true; });
  await bouton(page, 'Ajouter').nth(1).click();
  await page.getByText('Articles dans le panier : 1', { exact: true }).waitFor();
  await bouton(page, 'Voir le panier').click();
  await page.waitForURL('**/panier');
  await page.getByText('Votre panier', { exact: true }).waitFor();
  verifier(await page.evaluate(() => window.__memePage === true), 'boutique : changer de page ne recharge pas');
  verifier(await page.getByText('Stylo', { exact: true }).count() === 1, 'boutique : le panier est partagé entre les pages');
  verifier((await page.title()).length > 0, 'boutique : la page a un titre');
  await page.goBack();
  await page.getByText('Articles dans le panier : 1', { exact: true }).waitFor();
  verifier(await page.evaluate(() => window.__memePage === true), 'boutique : le retour arrière ne recharge pas');
  await page.goto(`${serveur.url}/panier`);
  await page.getByText('Stylo', { exact: true }).waitFor();
  verifier(true, 'boutique : le panier revient après un rechargement');
  await bouton(page, 'Retirer').click();
  await page.getByText('Votre panier est vide.', { exact: true }).waitFor();
  verifier(true, 'boutique : retirer du panier');
  verifier(erreurs.length === 0, `boutique : aucune erreur dans la console ${erreurs.join(' | ')}`);
  await page.context().close();
  serveur.fermer();
}

// ─── Les adaptateurs : un seul contrat ──────────────────────────────────────
{
  const dossier = join(travail, 'modules');
  execFileSync('node', [join(racineDepot, 'dist/cli.js'), 'compile', join(racineDepot, 'essais/moteur/modules.humalis'), '--cible', 'web', '--moteur', 'humalis', '--sortie', dossier], { stdio: ['ignore', 'ignore', 'inherit'] });
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: dossier, stdio: 'inherit' });
  execFileSync('npx', ['vite', 'build', '--logLevel', 'warn'], { cwd: dossier, stdio: 'inherit' });
  const serveur = await servir(join(dossier, 'dist'));
  const { page, erreurs } = await ouvrir(serveur);
  const reacts = [];
  page.on('response', (r) => { if (/react|client-/i.test(r.url())) reacts.push(r.url()); });
  await page.getByText('Module : 1', { exact: true }).waitFor();
  await page.getByText('Web component : 1', { exact: true }).waitFor();
  await bouton(page, 'Plus').click();
  await page.getByText('Module : 2', { exact: true }).waitFor();
  await page.getByText('Web component : 2', { exact: true }).waitFor();
  verifier(await page.evaluate(() => window.__montages === 1 && window.__misesAJour === 1), 'modules : le module est mis à jour, jamais recréé');
  const chargesAvant = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /react/i.test(n)));
  verifier(chargesAvant.length === 0, `modules : React n'est pas chargé sur une page qui ne s'en sert pas (${chargesAvant.join()})`);
  await page.getByRole('link', { name: 'Page React' }).click();
  await page.waitForURL('**/reactive');
  verifier(await page.evaluate(() => window.__destructions === 1), 'modules : quitter la page nettoie le module');
  await bouton(page, 'React Emch 0').click();
  await bouton(page, 'React Emch 1').waitFor();
  verifier(true, 'modules : un composant React marche, avec son propre état');
  verifier(erreurs.length === 0, `modules : aucune erreur ${erreurs.join(' | ')}`);
  await page.context().close();
  serveur.fermer();
}

// ─── Tous les exemples : chaque page s'ouvre, sans erreur, sans rien reconstruire ──
const pagesDe = (d, prefixe = '/') => readdirSync(d, { withFileTypes: true }).flatMap((f) => {
  if (f.isDirectory()) return f.name === 'assets' ? [] : pagesDe(join(d, f.name), `${prefixe}${f.name}/`);
  return f.name === 'index.html' ? [prefixe.replace(/_\/$/, '1/')] : [];
});
for (const f of readdirSync('exemples').filter((n) => n.endsWith('.humalis')).map((n) => n.replace('.humalis', ''))) {
  if (['boutique-serveur'].includes(f)) continue;
  let dist;
  try {
    dist = compiler(`exemples/${f}.humalis`, `ex-${f}`);
  } catch {
    verifier(false, `${f} : compile et s'assemble`);
    continue;
  }
  const serveur = await servir(dist);
  for (const chemin of pagesDe(dist)) {
    const { page, erreurs } = await ouvrir(serveur, chemin);
    const m = await mutations(page);
    const texte = (await page.locator('main').innerText()).trim();
    verifier(erreurs.filter((e) => !/Failed to load resource|ERR_/.test(e)).length === 0, `${f} ${chemin} : sans erreur ${erreurs.join(' | ').slice(0, 300)}`);
    verifier(texte.length > 0 || f === 'connexion' || f === 'sources', `${f} ${chemin} : la page montre quelque chose`);
    console.log(`   reprise ${JSON.stringify(m)}`);
    await page.context().close();
  }
  serveur.fermer();
}

await navigateur.close();
if (problemes.length > 0) {
  console.error(`\n${problemes.length} problème(s).`);
  process.exit(1);
}
console.log('\nTout est vert.');
