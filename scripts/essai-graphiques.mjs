// Vérifie en vrai les graphiques : compile exemples/graphiques.humalis en site
// statique et en projet web construit (avec le prérendu), les sert, puis les
// pilote dans Chromium : HTML de départ identique au dessin du script (statique),
// prérendu sans avertissement d'hydratation (web), 375 et 1280 px, clair et
// sombre, contraste des couleurs, arbre d'accessibilité, table au clavier.
//
// Lancer : npm run build && npm run essai:graphiques [-- --sans-web]
// Playwright est cherché dans NODE_PATH, puis dans quelques dossiers connus.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.env.HUMALIS_TRAVAIL ?? join(tmpdir(), 'humalis-essai-graphiques'));
const avecWeb = !process.argv.includes('--sans-web');
rmSync(join(travail, 'statique'), { recursive: true, force: true });
mkdirSync(join(travail, 'captures'), { recursive: true });

const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};

function chargerPlaywright() {
  const candidats = [...(process.env.NODE_PATH ?? '').split(':').filter(Boolean), join(process.env.HOME ?? '', 'astratra/node_modules'), join(travail, 'web/node_modules')];
  for (const dossier of candidats) {
    if (existsSync(join(dossier, 'playwright'))) return createRequire(join(dossier, 'x.js'))('playwright');
  }
  throw new Error('Playwright est introuvable : mettez NODE_PATH vers un node_modules qui le contient.');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

/** Sert un dossier de fichiers statiques. */
async function servir(dossier) {
  const serveur = createServer((requete, reponse) => {
    let chemin = decodeURIComponent(new URL(requete.url, 'http://x').pathname);
    if (chemin.endsWith('/')) chemin += 'index.html';
    let fichier = join(dossier, chemin);
    if (!existsSync(fichier) && existsSync(fichier + '.html')) fichier += '.html';
    if (!existsSync(fichier) || statSync(fichier).isDirectory()) fichier = join(dossier, 'index.html');
    reponse.writeHead(200, { 'content-type': TYPES[extname(fichier)] ?? 'application/octet-stream' });
    reponse.end(readFileSync(fichier));
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  return { adresse: `http://127.0.0.1:${serveur.address().port}`, arreter: () => serveur.close() };
}

function compiler(cible) {
  const dossier = join(travail, cible);
  execFileSync('node', ['dist/cli.js', 'compile', 'exemples/graphiques.humalis', '--cible', cible, '--sortie', dossier, ...(cible === 'web' ? ['--adresse', 'https://lefleuve.cd'] : [])], { stdio: 'ignore' });
  return dossier;
}

/** Ouvre une page ; les erreurs et avertissements de la console sont gardés. */
async function ouvrir(navigateur, adresse, options, messages) {
  const contexte = await navigateur.newContext(options);
  const page = await contexte.newPage();
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && messages.push(`${m.type()} : ${m.text()}`));
  page.on('pageerror', (e) => messages.push(`exception : ${e.message}`));
  await page.goto(adresse);
  await page.waitForLoadState('networkidle');
  return page;
}

const figures = (page) => page.$$eval('figure.humalis-graphique', (els) => els.map((el) => el.outerHTML));

/** Le contraste WCAG entre deux couleurs « rgb(r, g, b) ». */
function contraste(a, b) {
  const lum = (texte) => {
    const [r, g, bl] = texte.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((x) => {
      const v = x / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [clair, sombre] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (clair + 0.05) / (sombre + 0.05);
}

async function scenario(nom, adresse, navigateur) {
  const messages = [];
  // 1. Sans JavaScript : le HTML de départ (statique) ou prérendu (web) contient déjà les dessins.
  let page = await ouvrir(navigateur, adresse, { viewport: { width: 1280, height: 900 }, javaScriptEnabled: false }, messages);
  const sansJs = await figures(page);
  verifier(sansJs.length === 4 && sansJs.every((f) => f.includes('role="img"') && f.includes('<desc') && f.includes('Voir les données')), `${nom} : sans JavaScript, les 4 graphiques sont dans le HTML (dessin, description, table)`);
  await page.context().close();

  // 2. Avec JavaScript : le dessin est le même, caractère pour caractère.
  page = await ouvrir(navigateur, adresse, { viewport: { width: 1280, height: 900 } }, messages);
  const avecJs = await figures(page);
  verifier(avecJs.length === 4 && avecJs.every((f, i) => f === sansJs[i]), `${nom} : avec JavaScript, chaque graphique est identique au HTML de départ (${avecJs.filter((f, i) => f === sansJs[i]).length}/4)`);

  // 3. L'arbre d'accessibilité : un nom par graphique (le dessin caché n'y est pas), la table au clavier.
  const images = await page.getByRole('img', { name: /^Graphique en (courbe|barres|camembert)/ }).count();
  verifier(images === 4, `${nom} : l'arbre d'accessibilité donne 4 images nommées (une par graphique, pas le dessin étroit caché) : ${images}`);
  const arbre = await page.locator('main').ariaSnapshot();
  verifier(arbre.includes('img "Graphique en courbe Les ventes passent de 120 000 FC en janvier'), `${nom} : le nom lu du premier graphique est son genre et sa description`);
  const resume = page.locator('summary').first();
  await resume.focus();
  await page.keyboard.press('Enter');
  const ouvert = await page.$eval('details.humalis-graphique-donnees', (d) => d.open);
  const lignes = await page.getByRole('table').first().getByRole('row').count();
  verifier(ouvert && lignes === 5, `${nom} : « Voir les données » s'ouvre au clavier (Entrée) et la table a son en-tête et 4 lignes (${lignes})`);
  const enTetes = await page.getByRole('table').first().getByRole('columnheader').allInnerTexts();
  verifier(enTetes.join('|') === 'Mois|Montant', `${nom} : les en-têtes de la table sont « Mois » et « Montant » (${enTetes.join(', ')})`);
  const arbreTable = await page.getByRole('table').first().ariaSnapshot();
  verifier(/row "Février 180 000 FC"/.test(arbreTable.replace(/ /g, ' ')), `${nom} : la table est lue ligne par ligne (« Février 180 000 FC »)`);
  await page.context().close();

  // 4. Les tailles et les modes : le dessin large sur ordinateur, l'étroit sur téléphone ; les couleurs suivent le mode.
  for (const [largeur, attendu] of [[1280, 'large'], [375, 'etroit']]) {
    for (const mode of ['light', 'dark']) {
      page = await ouvrir(navigateur, adresse, { viewport: { width: largeur, height: 900 }, colorScheme: mode }, messages);
      const visibles = await page.$$eval('figure.humalis-graphique > svg', (els) => els.filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.getAttribute('class')));
      verifier(visibles.length === 4 && visibles.every((c) => c === `humalis-graphique-${attendu}`), `${nom} : ${largeur} px, ${mode === 'light' ? 'clair' : 'sombre'} : le dessin ${attendu} est montré (${visibles.join(', ')})`);
      const debord = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      verifier(!debord, `${nom} : ${largeur} px, ${mode === 'light' ? 'clair' : 'sombre'} : rien ne dépasse de la largeur de l'écran`);
      const couleurs = await page.$$eval('.humalis-graphique-barre, .humalis-graphique-courbe, path.humalis-graphique-part', (els) => {
        const fond = getComputedStyle(document.body).backgroundColor;
        return els.filter((el) => el.closest('svg') && getComputedStyle(el.closest('svg')).display !== 'none').map((el) => {
          const style = getComputedStyle(el);
          return { teinte: el.classList.contains('humalis-graphique-courbe') ? style.stroke : style.fill, fond };
        });
      });
      const pire = Math.min(...couleurs.map((c) => contraste(c.teinte, c.fond)));
      verifier(couleurs.length > 0 && pire >= 3, `${nom} : ${largeur} px, ${mode === 'light' ? 'clair' : 'sombre'} : chaque série se voit sur le fond (contraste le plus faible ${pire.toFixed(2)} pour 1)`);
      const tailleTexte = await page.$eval(`figure.humalis-graphique > svg.humalis-graphique-${attendu} text`, (el) => el.getBoundingClientRect().height).catch(() => 0);
      if (largeur === 375) verifier(tailleTexte >= 9, `${nom} : 375 px : le texte des axes reste lisible (hauteur ${tailleTexte.toFixed(1)} px)`);
      await page.screenshot({ path: join(travail, 'captures', `${nom}-${largeur}-${mode}.png`), fullPage: true });
      await page.context().close();
    }
  }
  verifier(messages.length === 0, `${nom} : console propre, aucun avertissement d'hydratation${messages.length ? ` (${messages.join(' | ')})` : ''}`);
}

const { chromium } = chargerPlaywright();
const navigateur = await chromium.launch();
try {
  const statique = compiler('statique');
  verifier(readFileSync(join(statique, 'index.html'), 'utf8').includes('<svg class="humalis-graphique-large"'), 'statique : le HTML de départ contient le SVG');
  const a = await servir(statique);
  try {
    await scenario('statique', a.adresse, navigateur);
  } finally {
    a.arreter();
  }

  if (avecWeb) {
    const dossier = compiler('web');
    execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'ignore' });
    execFileSync('npx', ['tsc', '--noEmit'], { cwd: dossier, stdio: 'inherit' });
    verifier(true, 'web : le projet produit passe tsc');
    // La construction complète, prérendu compris : le HTML de départ de chaque page est écrit dans dist/.
    execFileSync('npm', ['run', 'build'], { cwd: dossier, stdio: 'ignore' });
    const prerendu = readFileSync(join(dossier, 'dist', 'index.html'), 'utf8');
    verifier((prerendu.match(/<svg class="humalis-graphique-large"/g) ?? []).length === 4, 'web : le HTML prérendu contient les 4 dessins');
    const b = await servir(join(dossier, 'dist'));
    try {
      await scenario('web', b.adresse, navigateur);
    } finally {
      b.arreter();
    }
  }
} finally {
  await navigateur.close();
}

console.log(problemes.length === 0 ? '\nTout est vérifié.' : `\n${problemes.length} vérification(s) en échec.`);
process.exit(problemes.length === 0 ? 0 : 1);
