// Vérifie en vrai les interactions :
// compile exemples/interactions.humalis en site statique et en projet web
// (vérifié par tsc, construit par Vite), les sert avec une petite API
// (/produits, /recherche, /suppressions), puis les pilote dans Chromium :
// messages, minuteries (horloge simulée), copier, partager, recherche
// pendant la frappe (une seule requête, la dernière gagne), raccourcis,
// fenêtre, question, défilement infini, et le réordonnement d'une liste
// (web seulement : le statique le refuse).
//
// Lancer : npm run build && npm run essai:interactions
// Playwright est cherché dans NODE_PATH, puis dans quelques dossiers connus.
// Le projet web reprend les node_modules de NODE_PATH (react, vite…) s'ils y
// sont, sinon il lance npm install.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.env.HUMALIS_TRAVAIL ?? join(tmpdir(), 'humalis-essai-interactions'));
rmSync(travail, { recursive: true, force: true });
mkdirSync(travail, { recursive: true });

const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};

const dossiersModules = [...(process.env.NODE_PATH ?? '').split(':').filter(Boolean), join(process.env.HOME ?? '', 'astratra/node_modules')];

function chargerPlaywright() {
  for (const dossier of dossiersModules) {
    if (existsSync(join(dossier, 'playwright'))) return createRequire(join(dossier, 'x.js'))('playwright');
  }
  throw new Error('Playwright est introuvable : mettez NODE_PATH vers un node_modules qui le contient.');
}

// ─── L'API de l'essai ───────────────────────────────────────────────────────

// « r » trouve aussi « Pagne vert » ; « ro » et « robe » seulement les deux robes.
const CATALOGUE = ['Robe wax', 'Robe longue', 'Pagne vert', 'Boubou'];
const compte = { recherche: [], suppressions: [], produits: 0 };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

/** Sert un dossier (une page inconnue rend index.html) et l'API de l'essai. */
async function servir(dossier) {
  const serveur = createServer(async (requete, reponse) => {
    const chemin = decodeURIComponent(new URL(requete.url, 'http://x').pathname);
    if (requete.method === 'POST') {
      let corps = '';
      for await (const morceau of requete) corps += morceau;
      const donnees = corps ? JSON.parse(corps) : {};
      const json = (valeur) => {
        reponse.writeHead(200, { 'content-type': 'application/json' });
        reponse.end(JSON.stringify(valeur));
      };
      if (chemin === '/produits') {
        compte.produits += 1;
        const numero = Number(donnees.numero ?? 1);
        return json(numero > 3 ? [] : Array.from({ length: 20 }, (_, i) => `Produit ${(numero - 1) * 20 + i + 1}`));
      }
      if (chemin === '/recherche') {
        const texte = String(donnees.recherche ?? '').toLowerCase();
        compte.recherche.push(texte);
        // Une recherche lente (« r ») répond après une plus récente : elle ne doit rien remplacer.
        if (texte === 'r') await new Promise((ok) => setTimeout(ok, 1500));
        return json(CATALOGUE.filter((p) => p.toLowerCase().includes(texte)));
      }
      if (chemin === '/suppressions') {
        compte.suppressions.push(donnees);
        return json({});
      }
    }
    let fichier = join(dossier, chemin.endsWith('/') ? `${chemin}index.html` : chemin);
    if (!existsSync(fichier) || statSync(fichier).isDirectory()) fichier = join(dossier, 'index.html');
    reponse.writeHead(200, { 'content-type': TYPES[extname(fichier)] ?? 'application/octet-stream' });
    reponse.end(readFileSync(fichier));
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  return { adresse: `http://127.0.0.1:${serveur.address().port}`, arreter: () => serveur.close() };
}

// ─── La compilation ─────────────────────────────────────────────────────────

function compiler(source, cible, nom) {
  const dossier = join(travail, nom);
  execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', cible, '--sortie', dossier, '--adresse', 'http://127.0.0.1'], { stdio: 'pipe' });
  return dossier;
}

/** Le projet web : vérifié par tsc et construit par Vite (build:sans-prerendu). */
function construireWeb(dossier) {
  const modules = dossiersModules.find((d) => ['react', 'react-dom', 'react-router', 'vite', 'typescript'].every((m) => existsSync(join(d, m))));
  if (modules) symlinkSync(modules, join(dossier, 'node_modules'), 'dir');
  else execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'ignore' });
  execFileSync('npm', ['run', 'build:sans-prerendu'], { cwd: dossier, stdio: 'pipe' });
  return join(dossier, 'dist');
}

// ─── Les scénarios ──────────────────────────────────────────────────────────

const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
const messages = (page) => page.locator('.humalis-messages .humalis-message-texte').allTextContents();

async function scenario(nom, adresse, navigateur) {
  const erreurs = [];
  const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await contexte.newPage();
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()));
  // navigator.share simulé : on garde ce qu'il reçoit.
  await page.addInitScript(() => {
    window.partages = [];
    navigator.share = async (donnees) => {
      window.partages.push(donnees);
    };
    navigator.canShare = () => true;
  });
  await page.goto(adresse);
  await page.getByRole('heading', { name: 'Rey Store' }).waitFor();

  // Copier : le presse-papier reçoit le code, et la personne le sait.
  await page.getByRole('button', { name: 'Copier le code' }).click();
  await page.getByText('Copié !').waitFor();
  verifier((await page.evaluate(() => navigator.clipboard.readText())) === 'REY-2026-0042', `${nom} : « copier » met le code dans le presse-papier`);
  verifier((await messages(page)).includes('Code copié'), `${nom} : « Code copié » est affiché (role="status")`);
  verifier((await page.locator('.humalis-messages [role="status"]', { hasText: 'Code copié' }).count()) === 1, `${nom} : le message de réussite est une région « status »`);
  // « apres 2 secondes » : « Copié ! » s'éteint.
  await page.getByText('Copié !').waitFor({ state: 'detached', timeout: 4000 }).catch(() => {});
  verifier((await page.getByText('Copié !').count()) === 0, `${nom} : « apres 2 secondes », « Copié ! » a disparu`);

  // Partager : la feuille de partage reçoit le titre, le texte et l'adresse complète.
  await page.getByRole('button', { name: 'Partager le catalogue' }).click();
  await attendre(200);
  const partages = await page.evaluate(() => window.partages);
  verifier(partages.length === 1 && partages[0].title === 'Rey Store' && partages[0].text === 'Viens voir Rey Store' && /^http:\/\/127\.0\.0\.1:\d+\/(index\.html)?$/.test(partages[0].url), `${nom} : « partager » donne titre, texte et adresse complète (${partages[0]?.url})`);
  // Sans feuille de partage : le lien est copié et la personne le sait.
  await page.evaluate(() => {
    delete navigator.share;
    navigator.share = undefined;
  });
  await page.getByRole('button', { name: 'Partager le catalogue' }).click();
  await page.locator('.humalis-message-texte', { hasText: 'Lien copié' }).waitFor({ timeout: 3000 }).catch(() => {});
  verifier((await messages(page)).some((m) => m.startsWith('Lien copié')), `${nom} : sans feuille de partage, le lien est copié et le message le dit`);
  verifier(/^http:\/\/127\.0\.0\.1/.test(await page.evaluate(() => navigator.clipboard.readText())), `${nom} : le presse-papier contient l'adresse de la page`);
  // La pile : au plus trois messages.
  verifier((await page.locator('.humalis-messages > li').count()) <= 3, `${nom} : au plus trois messages à la fois`);

  // Recherche : une seule requête après la pause ; une réponse lente ne remplace pas une plus récente.
  compte.recherche = [];
  const recherche = page.getByRole('textbox', { name: 'recherche' });
  await recherche.click();
  await recherche.pressSequentially('robe', { delay: 60 });
  await attendre(900);
  verifier(compte.recherche.length === 1 && compte.recherche[0] === 'robe', `${nom} : « robe » tapé lettre par lettre envoie une seule requête (${JSON.stringify(compte.recherche)})`);
  verifier((await page.locator('[aria-live="polite"][aria-atomic="true"]').textContent()) === '2 résultats', `${nom} : le compteur (région vivante) dit « 2 résultats »`);
  await recherche.fill('');
  compte.recherche = [];
  await recherche.pressSequentially('r');
  await attendre(450);
  await recherche.pressSequentially('o');
  await attendre(450);
  await attendre(1500);
  verifier(compte.recherche.join(',') === 'r,ro', `${nom} : deux pauses, deux requêtes (${compte.recherche.join(',')})`);
  verifier((await page.locator('[aria-live="polite"][aria-atomic="true"]').textContent()) === '2 résultats' && (await page.getByText('Pagne vert').count()) === 0, `${nom} : la réponse lente de « r » n'a pas remplacé celle de « ro »`);
  // Entrée n'attend pas la pause.
  compte.recherche = [];
  await recherche.fill('pagne');
  await recherche.press('Enter');
  await attendre(150);
  verifier(compte.recherche[0] === 'pagne', `${nom} : Entrée lance la recherche sans attendre la pause`);
  await attendre(500);

  // Raccourcis : « / » met le focus dans la recherche, sauf s'il y est déjà ; Ctrl+K ouvre l'aide.
  await page.getByRole('heading', { name: 'Rey Store' }).click();
  await page.keyboard.press('/');
  verifier(await recherche.evaluate((e) => e === document.activeElement), `${nom} : « / » met le focus dans la recherche`);
  const avant = await recherche.inputValue();
  await page.keyboard.press('/');
  verifier((await recherche.inputValue()) === `${avant}/`, `${nom} : dans le champ, « / » s'écrit (le raccourci ne vole pas la touche)`);
  verifier((await page.getByRole('button', { name: 'Copier le code' }).getAttribute('aria-keyshortcuts')) === 'Control+Shift+C Meta+Shift+C', `${nom} : le raccourci est annoncé (aria-keyshortcuts)`);

  // Fenêtre : ouverte au clic, le focus piégé, Échap ferme, le focus revient au bouton.
  const aide = page.getByRole('button', { name: 'Aide', exact: true });
  await aide.focus();
  await page.keyboard.press('Enter');
  const fenetre = page.getByRole('dialog', { name: 'Raccourcis' });
  await fenetre.waitFor();
  verifier(await fenetre.isVisible(), `${nom} : « montrer » ouvre la fenêtre (role="dialog", nommée par son titre)`);
  let dedans = true;
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    // Le navigateur peut passer par sa propre barre (le focus quitte alors la page) : jamais par la page derrière.
    dedans &&= await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest('dialog'));
  }
  verifier(dedans, `${nom} : dix Tab de suite n'atteignent jamais la page derrière la fenêtre`);
  await page.keyboard.press('Escape');
  await fenetre.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
  verifier(!(await fenetre.isVisible().catch(() => false)), `${nom} : Échap ferme la fenêtre`);
  verifier(await aide.evaluate((e) => e === document.activeElement), `${nom} : le focus est revenu au bouton « Aide »`);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+k');
  await fenetre.waitFor({ timeout: 2000 }).catch(() => {});
  verifier(await fenetre.isVisible(), `${nom} : Ctrl+K ouvre l'aide`);
  await page.getByRole('button', { name: 'Compris' }).click();
  await fenetre.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
  verifier(!(await fenetre.isVisible().catch(() => false)), `${nom} : « Compris » (cacher) ferme l'aide`);

  // Défilement infini : la première tranche arrive en bas de la page, puis la suite en défilant.
  await page.getByText('Produit 20').waitFor({ timeout: 4000 }).catch(() => {});
  await page.mouse.wheel(0, 20000);
  await page.getByText('Produit 40').waitFor({ timeout: 4000 }).catch(() => {});
  await page.mouse.wheel(0, 20000);
  await page.getByText('Produit 60').waitFor({ timeout: 4000 }).catch(() => {});
  await page.mouse.wheel(0, 20000);
  await page.getByText('Tous les produits sont affichés.').waitFor({ timeout: 4000 }).catch(() => {});
  verifier((await page.getByText(/^Produit \d+$/).count()) === 60, `${nom} : en défilant, les 60 produits arrivent par tranches de 20`);
  verifier((await page.getByRole('button', { name: 'Voir plus de produits' }).count()) === 0 && (await page.locator('.humalis-sentinelle').count()) === 0, `${nom} : quand il ne reste rien, le bouton et la sentinelle disparaissent`);

  // Question : Échap répond non (rien n'est envoyé), « Retirer » retire et appelle l'API ; « Annuler » remet.
  compte.suppressions = [];
  const retirer = page.getByRole('button', { name: 'Retirer Produit 3', exact: true });
  await retirer.click();
  const question = page.getByRole('alertdialog');
  await question.waitFor();
  verifier((await question.textContent()).includes('Retirer Produit 3 du catalogue ?'), `${nom} : la question s'affiche (role="alertdialog")`);
  verifier(await page.evaluate(() => document.activeElement?.textContent) === 'Garder', `${nom} : le focus est sur « Garder », le choix sûr`);
  await page.keyboard.press('Escape');
  await page.locator('.humalis-message-texte', { hasText: 'Rien n’a été retiré' }).waitFor({ timeout: 2000 }).catch(() => {});
  verifier((await messages(page)).includes('Rien n’a été retiré') && compte.suppressions.length === 0, `${nom} : Échap répond non : le bloc « sinon » est joué, rien n'est envoyé`);
  verifier(await retirer.evaluate((e) => e === document.activeElement), `${nom} : le focus est rendu au bouton « Retirer »`);
  await retirer.click();
  await question.waitFor();
  await page.getByRole('button', { name: 'Retirer', exact: true }).click();
  await page.locator('.humalis-message-texte', { hasText: 'Produit 3 retiré' }).waitFor({ timeout: 2000 }).catch(() => {});
  verifier((await page.getByText('Produit 3', { exact: true }).count()) === 0 && compte.suppressions.length === 1, `${nom} : « Retirer » retire le produit et appelle l'API une fois`);
  await page.getByRole('button', { name: 'Annuler' }).click();
  await attendre(200);
  verifier((await page.getByText('Produit 3', { exact: true }).count()) === 1, `${nom} : « Annuler » dans le message remet le produit`);

  // Minuterie arrêtée par une variable.
  const secondes = async () => Number((await page.getByText(/^Ouvert depuis \d+ secondes$/).textContent()).match(/\d+/)[0]);
  verifier((await secondes()) > 2, `${nom} : « toutes les 1 seconde » fait avancer le compteur`);
  await page.getByRole('button', { name: 'Arrêter le compteur' }).click();
  const arret = await secondes();
  await attendre(2200);
  verifier((await secondes()) === arret, `${nom} : « tant que compteur est vrai » : le compteur s'arrête quand la variable est fausse`);
  verifier((await page.locator('.humalis-message-avertissement').count()) === 1, `${nom} : « afficher avertissement » a sa classe`);

  verifier(erreurs.length === 0, `${nom} : aucune erreur dans la console (${erreurs.join(' | ')})`);
  await contexte.close();
}

/** Les minuteries avec une horloge simulée : rien ne tourne quand l'onglet est caché ou la page quittée. */
async function scenarioHorloge(nom, adresse, navigateur) {
  const contexte = await navigateur.newContext();
  const page = await contexte.newPage();
  await page.clock.install();
  await page.goto(adresse);
  await page.getByRole('heading', { name: 'Rey Store' }).waitFor();
  const secondes = async () => Number((await page.getByText(/^Ouvert depuis \d+ secondes$/).textContent()).match(/\d+/)[0]);
  await page.clock.runFor(5000);
  verifier((await secondes()) === 5, `${nom} : horloge simulée, 5 secondes donnent 5 tours`);
  // Un onglet caché ne compte pas ses tours.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  });
  await page.clock.runFor(3000);
  verifier((await secondes()) === 5, `${nom} : onglet caché, aucun tour`);
  await contexte.close();
}

/** Le réordonnement d'une liste, au clavier et à la souris (web). */
async function scenarioDeplacement(nom, adresse, navigateur) {
  const contexte = await navigateur.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await contexte.newPage();
  await page.goto(adresse);
  const ordre = () => page.locator('[role="listitem"]').allTextContents();
  await page.getByRole('heading', { name: 'Tâches' }).waitFor();
  verifier(JSON.stringify(await ordre()) === JSON.stringify(['Acheter du pain', 'Appeler Rey', 'Écrire le plan']), `${nom} : la liste est dans l'ordre de départ`);
  // Clavier : Espace prend, flèche haut monte, Espace dépose.
  await page.locator('[role="listitem"]').nth(1).focus();
  await page.keyboard.press(' ');
  verifier((await page.locator('.humalis-annonce-cachee').textContent()).startsWith('Pris : Appeler Rey, position 2 sur 3'), `${nom} : Espace prend l'élément et l'annonce`);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press(' ');
  verifier(JSON.stringify(await ordre()) === JSON.stringify(['Appeler Rey', 'Acheter du pain', 'Écrire le plan']), `${nom} : au clavier seul, « Appeler Rey » est monté en premier`);
  await page.locator('.humalis-message-texte', { hasText: 'Ordre enregistré' }).waitFor({ timeout: 2000 }).catch(() => {});
  verifier((await messages(page)).filter((m) => m === 'Ordre enregistré').length === 1, `${nom} : « quand l'ordre de taches change » est joué une fois`);
  // Échap annule.
  await page.locator('[role="listitem"]').nth(2).focus();
  await page.keyboard.press(' ');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  verifier(JSON.stringify(await ordre()) === JSON.stringify(['Appeler Rey', 'Acheter du pain', 'Écrire le plan']), `${nom} : Échap annule le déplacement`);
  // Souris : glisser le dernier en premier.
  const premier = await page.locator('[role="listitem"]').nth(0).boundingBox();
  const dernier = await page.locator('[role="listitem"]').nth(2).boundingBox();
  await page.mouse.move(dernier.x + 10, dernier.y + dernier.height / 2);
  await page.mouse.down();
  await page.mouse.move(premier.x + 10, premier.y + 2, { steps: 8 });
  await page.mouse.up();
  verifier((await ordre())[0] === 'Écrire le plan', `${nom} : à la souris, le dernier élément glissé en haut passe premier (${(await ordre()).join(', ')})`);
  await contexte.close();
}

const DEPLACEMENT = `page "taches" :
    variable taches = ["Acheter du pain", "Appeler Rey", "Écrire le plan"]
    titre "Tâches"
    pour chaque t dans taches avec deplacement :
        texte t
    quand l'ordre de taches change :
        afficher reussite "Ordre enregistré"
`;

const { chromium } = chargerPlaywright();
const navigateur = await chromium.launch();
try {
  // Le site statique.
  const statique = compiler('exemples/interactions.humalis', 'statique', 'statique');
  let serveur = await servir(statique);
  try {
    await scenario('statique', serveur.adresse, navigateur);
    await scenarioHorloge('statique', serveur.adresse, navigateur);
  } finally {
    serveur.arreter();
  }

  // Le projet web : vérifié par tsc, construit par Vite.
  let dist;
  try {
    dist = construireWeb(compiler('exemples/interactions.humalis', 'web', 'web'));
    verifier(true, 'web : le projet produit passe tsc et se construit avec Vite');
  } catch (erreur) {
    verifier(false, `web : le projet produit ne se construit pas : ${String(erreur.stdout ?? erreur).slice(0, 2000)}`);
  }
  if (dist) {
    serveur = await servir(dist);
    try {
      await scenario('web', serveur.adresse, navigateur);
      await scenarioHorloge('web', serveur.adresse, navigateur);
    } finally {
      serveur.arreter();
    }
  }

  // Le réordonnement d'une liste (web).
  writeFileSync(join(travail, 'taches.humalis'), DEPLACEMENT);
  try {
    const distTaches = construireWeb(compiler(join(travail, 'taches.humalis'), 'web', 'taches'));
    serveur = await servir(distTaches);
    try {
      await scenarioDeplacement('web (réordonner)', serveur.adresse, navigateur);
    } finally {
      serveur.arreter();
    }
  } catch (erreur) {
    verifier(false, `web (réordonner) : le projet ne se construit pas : ${String(erreur.stdout ?? erreur).slice(0, 2000)}`);
  }
} finally {
  await navigateur.close();
}

console.log(problemes.length === 0 ? '\nTout est vérifié.' : `\n${problemes.length} vérification(s) en échec.`);
process.exit(problemes.length === 0 ? 0 : 1);
