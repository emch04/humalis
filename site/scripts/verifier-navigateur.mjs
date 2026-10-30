// Ouvre le site construit (npm run build, puis npm run preview) dans Chromium
// et vérifie chaque page : langue, titre, un seul h1, pas d'erreur de console,
// pas de défilement horizontal, lien d'évitement. Enregistre des captures.
//
// Utilisation :  node scripts/verifier-navigateur.mjs [adresse] [dossier-de-captures]
// Playwright n'est pas une dépendance du site : il doit être installé à part.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const base = process.argv[2] ?? 'http://localhost:4173';
const dossier = process.argv[3] ?? fileURLToPath(new URL('../captures', import.meta.url));
mkdirSync(dossier, { recursive: true });

const sommaire = readFileSync(fileURLToPath(new URL('../src/contenu/sommaire.ts', import.meta.url)), 'utf8');
const chemins = ['/', '/documentation', ...[...sommaire.matchAll(/chemin: '([^']+)'/g)].map((m) => m[1]), '/page-qui-nexiste-pas'];

const LARGEURS = [
  { nom: '1280', width: 1280, height: 800 },
  { nom: '375', width: 375, height: 800 },
];
const THEMES = ['light', 'dark'];

const problemes = [];
const signaler = (page, message) => problemes.push(`${page} : ${message}`);
const nomFichier = (chemin) => (chemin === '/' ? 'accueil' : chemin.slice(1).replaceAll('/', '_'));

const navigateur = await chromium.launch();

for (const theme of THEMES) {
  for (const largeur of LARGEURS) {
    const contexte = await navigateur.newContext({
      viewport: { width: largeur.width, height: largeur.height },
      colorScheme: theme,
    });
    for (const chemin of chemins) {
      const etiquette = `${chemin} [${largeur.nom}, ${theme}]`;
      const page = await contexte.newPage();
      page.on('console', (m) => ['error', 'warning'].includes(m.type()) && signaler(etiquette, `console ${m.type()} : ${m.text()}`));
      page.on('pageerror', (e) => signaler(etiquette, `exception : ${e.message}`));
      page.on('requestfailed', (r) => signaler(etiquette, `requête échouée : ${r.url()}`));
      page.on('response', (r) => {
        if (r.status() >= 400) signaler(etiquette, `HTTP ${r.status()} : ${r.url()}`);
      });
      page.on('request', (r) => {
        if (!r.url().startsWith(base) && !r.url().startsWith('data:')) signaler(etiquette, `ressource externe : ${r.url()}`);
      });

      await page.goto(base + chemin, { waitUntil: 'networkidle' });
      await page.waitForSelector('h1');

      const infos = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        titre: document.title,
        h1: document.querySelectorAll('h1').length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (infos.lang !== 'fr') signaler(etiquette, `lang = « ${infos.lang} »`);
      if (!infos.titre.trim()) signaler(etiquette, 'titre vide');
      if (infos.h1 !== 1) signaler(etiquette, `${infos.h1} h1`);
      if (infos.scrollWidth > infos.clientWidth) signaler(etiquette, `défilement horizontal (${infos.scrollWidth} > ${infos.clientWidth})`);

      // Lien d'évitement : atteignable avec Tab, et il mène au contenu.
      await page.keyboard.press('Tab');
      const premier = await page.evaluate(() => document.activeElement?.textContent?.trim());
      if (premier !== 'Aller au contenu') signaler(etiquette, `premier focus : « ${premier} »`);

      if (chemin === '/documentation/vocabulaire') {
        const total = Number(await page.locator('[data-total]').getAttribute('data-total'));
        const fiches = await page.locator('[data-mot]').count();
        if (fiches !== total || total === 0) signaler(etiquette, `${fiches} fiches pour ${total} entrées`);
        if (theme === 'light' && largeur.nom === '1280') {
          await page.fill('#recherche-mot', 'inférieure');
          const apres = await page.locator('[data-mot]').count();
          if (!(apres > 0 && apres < fiches)) signaler(etiquette, `recherche : ${apres} fiches sur ${fiches}`);
          await page.fill('#recherche-mot', '');
          await page.getByRole('button', { name: 'Éléments' }).click();
          const elements = await page.locator('[data-mot]').count();
          if (!(elements > 0 && elements < fiches)) signaler(etiquette, `filtre catégorie : ${elements} fiches`);
          await page.getByRole('button', { name: 'Toutes' }).click();
        }
      }

      if (chemin === '/documentation/erreurs') {
        const messages = await page.locator('.message--erreur').allTextContents();
        if (!messages.some((m) => /Ligne \d+ : /.test(m))) signaler(etiquette, 'aucun vrai message « Ligne N : »');
      }

      if (chemin === '/page-qui-nexiste-pas' && !(await page.locator('h1', { hasText: 'Page introuvable' }).count())) {
        signaler(etiquette, 'page introuvable non affichée');
      }

      await page.screenshot({ path: join(dossier, `${nomFichier(chemin)}_${largeur.nom}_${theme}.png`), fullPage: true });

      // Navigation mobile : le bouton du sommaire ouvre la liste.
      if (largeur.nom === '375' && chemin === '/documentation/pages' && theme === 'light') {
        await page.getByRole('button', { name: /sommaire/i }).click();
        if (!(await page.locator('#liste-doc').isVisible())) signaler(etiquette, 'le sommaire ne s’ouvre pas');
        await page.screenshot({ path: join(dossier, `${nomFichier(chemin)}_${largeur.nom}_${theme}_menu.png`) });
        await page.getByRole('link', { name: 'Les éléments', exact: true }).click();
        await page.waitForURL('**/documentation/elements');
      }

      await page.close();
    }
    await contexte.close();
  }
}

await navigateur.close();

if (problemes.length) {
  console.error(problemes.join('\n'));
  console.error(`\n${problemes.length} problème(s).`);
  process.exit(1);
}
console.log(`0 problème. ${chemins.length} pages × ${LARGEURS.length} largeurs × ${THEMES.length} thèmes. Captures : ${dossier}`);
