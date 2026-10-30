// Vérifie en vrai un bloc source (plan 2026-10-30-donnees-et-navigation) :
// exemples/sources.humalis est compilé pour le web et construit (tsc, Vite,
// prérendu), puis piloté dans Chromium face à une fausse API qui a la forme de
// celle de Rey Store : enveloppe { success, message, data }, adresse sur une
// autre origine, une panne 503 au premier appel (le réessai doit la masquer),
// un filtre ?categorie=, un produit par identifiant, un 404 avec son message.
//
// Lancer : npm run build && npm run essai:sources [dossier-de-travail]
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-sources'));
rmSync(travail, { recursive: true, force: true });
const web = join(travail, 'web');
const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};

// --- La fausse API de boutique -------------------------------------------------
const PRODUITS = [
  { id: 'p1', name: 'Costume croisé camel', price: 45000, category: 'costumes', variants: [{ id: 'v1', label: 'Camel', images: [] }] },
  { id: 'p2', name: 'Maillot RDC rouge', price: 9000, category: 'maillots' },
  { id: 'p3', name: 'Maillot PSG', price: 9500, category: 'maillots', variants: [{ id: 'v1', label: 'Domicile', images: ['a.jpg'] }, { id: 'v2', label: 'Extérieur', images: [] }] },
];
const appels = [];
let membres = [{ id: 'm1', name: 'Rey' }, { id: 'm2', name: 'Awa' }];
const corpsRecus = [];
const commandesRecues = [];
let panneRestante = 1; // la première lecture du catalogue échoue en 503
const api = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  appels.push(`${req.method} ${url.pathname}${url.search}`);
  res.setHeader('access-control-allow-origin', req.headers.origin ?? '*');
  res.setHeader('access-control-allow-headers', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('content-type', 'application/json');
  const repondre = (code, corps) => {
    res.statusCode = code;
    res.end(JSON.stringify(corps));
  };
  if (req.method === 'OPTIONS') return repondre(204, {});
  if (url.pathname === '/api/shop/orders' && req.method === 'POST') {
    let corps = '';
    req.on('data', (c) => (corps += c));
    req.on('end', () => {
      commandesRecues.push(corps);
      repondre(201, { success: true, message: 'Commande enregistrée.', data: { order: { number: 'RS-0001' }, whatsappUrl: 'https://wa.me/243' } });
    });
    return;
  }
  if (url.pathname === '/__panne') {
    panneRestante = Number(url.searchParams.get('n') ?? 0);
    return repondre(200, { ok: true });
  }
  if (url.pathname === '/api/admin/equipe' && req.method === 'GET') return repondre(200, { success: true, message: 'Équipe chargée.', data: { membres } });
  const retrait = url.pathname.match(/^\/api\/admin\/equipe\/(.+)$/);
  if (retrait && req.method === 'DELETE') {
    membres = membres.filter((m) => m.id !== retrait[1]);
    return repondre(200, { success: true, message: 'Membre retiré.', data: null });
  }
  const remplace = url.pathname.match(/^\/api\/admin\/products\/(.+)$/);
  if (remplace && req.method === 'PUT') {
    let corps = '';
    req.on('data', (c) => (corps += c));
    req.on('end', () => {
      corpsRecus.push(corps);
      repondre(200, { success: true, message: 'Produit remplacé.', data: { product: PRODUITS[0] } });
    });
    return;
  }
  if (url.pathname === '/api/shop/products') {
    if (panneRestante > 0) {
      panneRestante -= 1;
      return repondre(503, { success: false, message: 'Panne' });
    }
    const categorie = url.searchParams.get('categorie');
    const products = categorie ? PRODUITS.filter((p) => p.category === categorie) : PRODUITS;
    return repondre(200, { success: true, message: 'Catalogue chargé.', data: { products, categories: ['costumes', 'maillots'] } });
  }
  const un = url.pathname.match(/^\/api\/shop\/products\/(.+)$/);
  if (un) {
    const product = PRODUITS.find((p) => p.id === decodeURIComponent(un[1]));
    return product ? repondre(200, { success: true, message: 'Pièce chargée.', data: { product } }) : repondre(404, { success: false, message: 'Pièce introuvable.', data: null });
  }
  repondre(404, { success: false, message: 'Introuvable.' });
});
await new Promise((ok) => api.listen(0, '127.0.0.1', ok));
const adresseApi = `http://127.0.0.1:${api.address().port}`;

// --- Le site -------------------------------------------------------------------
execFileSync('node', ['dist/cli.js', 'compile', 'exemples/sources.humalis', '--cible', 'web', '--sortie', web, '--adresse', 'https://boutique.exemple.cd'], { stdio: 'inherit' });
execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: web, stdio: 'inherit' });
// L'adresse de l'API se règle sans recompiler Humalis : variable d'environnement de la construction.
execFileSync('npm', ['run', 'build'], { cwd: web, stdio: 'inherit', env: { ...process.env, VITE_HUMALIS_SOURCE_BOUTIQUE: adresseApi } });
verifier(true, 'le projet produit passe tsc et se construit (prérendu compris)');

// Aucun jeton, aucune adresse secrète : le code envoyé ne contient que ce qui est public.
const fichiersJs = [];
const parcourir = (dossier) => {
  for (const f of readdirSync(dossier)) {
    const chemin = join(dossier, f);
    if (statSync(chemin).isDirectory()) parcourir(chemin);
    else if (/\.(js|html)$/.test(f)) fichiersJs.push(chemin);
  }
};
parcourir(join(web, 'dist'));
verifier(fichiersJs.some((f) => readFileSync(f, 'utf8').includes(adresseApi)), "l'adresse de la source est celle de VITE_HUMALIS_SOURCE_BOUTIQUE");

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

  await page.goto(adresseWeb);
  verifier(await visible(page.getByRole('link', { name: 'Maillot PSG' })), 'le catalogue de la source est affiché (extrait de data.products)');
  const lectures = appels.filter((a) => a.startsWith('GET /api/shop/products') && !a.includes('p1')).length;
  verifier(lectures >= 2, 'la panne 503 est réessayée toute seule (au moins 2 appels, la page n\'a rien écrit)');
  verifier((await page.locator('main a').count()) === 3, 'les trois produits sont là');

  await page.getByRole('button', { name: 'Maillots' }).click();
  await page.waitForFunction(() => document.querySelectorAll('main a').length === 2, null, { timeout: 6000 }).catch(() => {});
  verifier((await page.locator('main a').count()) === 2, '« filtrant par categorie = "maillots" » : deux produits');
  verifier(appels.some((a) => a.endsWith('?categorie=maillots')), '… et l\'adresse appelée porte ?categorie=maillots');

  await page.getByRole('link', { name: 'Maillot PSG' }).click();
  verifier(await visible(page.getByRole('heading', { name: 'Maillot PSG' })), 'la page d\'un produit lit data.product par son identifiant');
  verifier(await visible(page.getByText('Coloris : Extérieur')), 'les données imbriquées (p.variants, v.label) sont lues dans la page du produit');
  verifier(appels.includes('GET /api/shop/products/p3'), '… sur /api/shop/products/p3');

  await page.goto(`${adresseWeb}/produit/inconnu`);
  verifier(await visible(page.getByText("Pièce introuvable.")), 'un produit inconnu (404) affiche le message de l\'API, sans que la page ne gère l\'erreur');
  await page.goto(`${adresseWeb}/equipe`);
  verifier(await visible(page.getByText('Awa')), '« supprimer » : la liste de l\'équipe vient de la source');
  await page.getByRole('button', { name: 'Retirer' }).first().click();
  await page.waitForFunction(() => !document.body.innerText.includes('Rey'), null, { timeout: 6000 }).catch(() => {});
  verifier(appels.includes('DELETE /api/admin/equipe/m1'), '… et « Retirer » envoie DELETE /api/admin/equipe/m1 (l\'identifiant au bout de la route)');
  verifier(!(await page.getByText('Rey').count()), '… puis la liste relue ne montre plus ce membre');

  await page.goto(`${adresseWeb}/reglage`);
  await page.getByRole('button', { name: 'Baisser' }).first().click();
  await page.waitForTimeout(800);
  verifier(appels.includes('PUT /api/admin/products/p1'), '« modifier … par remplacement » : PUT, avec l\'identifiant à la place de :id');
  verifier(corpsRecus.some((c) => JSON.parse(c).price === 44000), '… et le champ changé (price = p.price - 1000) est envoyé');
  // Une panne plus longue que les réessais : sans rien écrire, un message propose « Réessayer ».
  await fetch(`${adresseApi}/__panne?n=3`);
  await page.goto(adresseWeb);
  const reessayer = page.getByRole('button', { name: 'Réessayer' });
  verifier(await visible(reessayer), "panne durable : le message automatique propose « Réessayer » (la page n'a rien écrit)");
  await reessayer.click();
  verifier(await visible(page.getByRole('link', { name: 'Maillot PSG' })), '… et le bouton rejoue la lecture : le catalogue apparaît');

  // La page qui parle de l'état : elle montre l'erreur elle-même, Humalis se tait.
  await fetch(`${adresseApi}/__panne?n=3`);
  await page.goto(`${adresseWeb}/vitrine`);
  verifier(await visible(page.getByText("Le serveur n'a pas répondu")), '« erreur de produits » montre le message de la panne');
  verifier((await page.getByRole('button', { name: 'Réessayer', exact: true }).count()) === 0, '… sans le message automatique (la page a pris la main)');
  await page.getByRole('button', { name: 'Réessayer maintenant' }).click();
  verifier(await visible(page.getByText('Maillot PSG')), '« recharger produits » rejoue la requête et la liste apparaît');
  await page.goto(`${adresseWeb}/commande`);
  await page.getByRole('button', { name: 'Commander' }).click();
  verifier(await visible(page.getByText('Commande RS-0001')), 'une commande est enregistrée et son numéro (data.order) est affiché');
  const corps = JSON.parse(commandesRecues[0] ?? '{}');
  verifier(corps.customer?.name === 'Awa' && corps.lines?.[0]?.productId === 'p3' && corps.lines[0].quantity === 2, 'le corps JSON est imbriqué comme celui de Rey Store : { customer: {…}, lines: [{…}] }');
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
