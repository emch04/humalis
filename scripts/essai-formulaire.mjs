// Vérifie en vrai les formulaires
// sur exemples/inscription.humalis, qui a chaque sorte de champ et un serveur.
//
// Web : on compile le serveur et la page, on les démarre, puis, dans
// Chromium : un champ obligatoire vide bloque l'envoi avec un message en
// français, une forme fausse aussi (email, nombre hors bornes), la touche
// Entrée envoie, les champs sont vidés après l'envoi, et le serveur a reçu
// chaque valeur avec son type (nombre, booléen, date). Serveur arrêté :
// l'envoi échoue et les champs restent remplis.
//
// Mobile : le même exemple en --cible mobile passe tsc et expo export, puis
// sa version web se pilote à la taille d'un iPhone (sans serveur : l'envoi
// échoue, les champs restent remplis).
//
// Lancer : npm run build && npm run essai:formulaire [dossier-de-travail]
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-formulaire'));
rmSync(travail, { recursive: true, force: true });
const web = join(travail, 'web');
const serveur = join(travail, 'serveur');
const mobile = join(travail, 'mobile');
const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};
const source = 'exemples/inscription.humalis';
const EMAIL = 'admin@ateliers.cd';
const MOT_DE_PASSE = 'Admin-Solide-2026!';

execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'serveur', '--sortie', serveur], { stdio: 'inherit' });
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'web', '--sortie', web, '--adresse', 'https://ateliers.exemple.cd'], { stdio: 'inherit' });
// npm 11 (celui de Node 24) : npm 10 échoue parfois sur « edgesOut ».
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund'], { cwd: serveur, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: serveur, stdio: 'inherit' });
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund'], { cwd: web, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: web, stdio: 'inherit' });
verifier(true, 'web : les deux projets produits passent tsc et se construisent (prérendu compris)');

const port = 5300 + Math.floor(Math.random() * 90);
const processus = [];
/** Démarre un processus et attend qu'il se dise prêt ; s'il s'arrête avant, l'essai s'arrête avec ce qu'il a écrit. */
const lancer = (commande, args, options, pret) =>
  new Promise((ok, echec) => {
    const p = spawn(commande, args, options);
    processus.push(p);
    let sortie = '';
    p.stdout.on('data', (m) => {
      sortie += m;
      const trouve = pret(String(m));
      if (trouve) ok({ p, trouve });
    });
    p.stderr.on('data', (m) => (sortie += m));
    p.on('exit', (code) => echec(new Error(`${commande} s'est arrêté (code ${code}) :\n${sortie}`)));
  });

const { p: processusServeur } = await lancer('node', ['dist/src/demarrer.js'], {
  cwd: serveur,
  env: { ...process.env, JWT_SECRET: randomBytes(32).toString('hex'), HUMALIS_ADMIN_EMAIL: EMAIL, HUMALIS_ADMIN_MOT_DE_PASSE: MOT_DE_PASSE, PORT: String(port) },
}, (m) => m.includes('prêt'));
const { trouve: adresseWeb } = await lancer(join(web, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0', '--strictPort', 'false'], {
  cwd: web,
  env: { ...process.env, HUMALIS_SERVEUR: `http://127.0.0.1:${port}` },
}, (m) => m.match(/http:\/\/localhost:\d+/)?.[0]);

const visible = (locator) => locator.first().waitFor({ timeout: 5000 }).then(() => true, () => false);
/** Le message du bandeau, qui remplace le précédent. */
const message = (page, texte) => visible(page.locator('.humalis-message').filter({ hasText: texte }));

const require = createRequire(join(web, 'package.json'));
const { chromium } = require('playwright');
const navigateur = await chromium.launch();
try {
  const contexte = await navigateur.newContext();
  const page = await contexte.newPage();
  const erreursConsole = [];
  page.on('pageerror', (e) => erreursConsole.push(e.message));
  await page.goto(adresseWeb);
  const champ = (id) => page.locator(`[data-humalis="${id}"]`);
  let envois = 0;
  page.on('request', (r) => r.method() === 'POST' && r.url().includes('/api/inscriptions') && envois++);

  // 1. Les balises de chaque sorte.
  verifier(await visible(page.locator('form[data-humalis="formulaire_inscription"]')), 'web : le formulaire est une vraie balise <form>');
  const types = await page.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll('[data-humalis^="champ_"]')].map((e) => [e.dataset.humalis, e.tagName.toLowerCase() + (e.type ? `:${e.type}` : '')])),
  );
  verifier(
    JSON.stringify(types) ===
      JSON.stringify({
        champ_nom: 'input:text',
        champ_email: 'input:email',
        champ_telephone: 'input:tel',
        champ_age: 'input:number',
        champ_naissance: 'input:date',
        champ_heure: 'input:time',
        champ_site: 'input:url',
        champ_presentation: 'textarea:textarea',
        champ_newsletter: 'input:checkbox',
        champ_taille: 'fieldset:fieldset',
        champ_pays: 'select:select-one',
      }),
    `web : chaque sorte a sa balise (${JSON.stringify(types)})`,
  );
  verifier(await page.getByRole('group', { name: 'Taille' }).count() === 1, 'web : le choix est un groupe nommé « Taille » pour les lecteurs d’écran (fieldset, legend)');
  verifier(await page.getByRole('radio').count() === 4, 'web : un bouton radio par taille');

  // 2. Un champ obligatoire vide : Entrée n'envoie rien, un message le dit.
  await champ('champ_nom').press('Enter');
  verifier(await message(page, 'Le champ « Nom » est obligatoire.'), 'web : Entrée dans un champ vide affiche « Le champ « Nom » est obligatoire. »');
  verifier(await page.getByRole('alert').count() === 1, 'web : le message est une alerte (role="alert")');
  await page.screenshot({ path: join(travail, 'web-1-obligatoire.png'), fullPage: true });

  // 3. On remplit, avec des erreurs de forme d'abord.
  await champ('champ_nom').fill('Emch');
  await champ('champ_email').fill('pas-un-email');
  await page.getByRole('button', { name: "S'inscrire" }).click();
  verifier(await message(page, 'n’a pas la forme d’une adresse email'), 'web : un email mal formé est refusé avec un message');
  await champ('champ_email').fill('emch@exemple.cd');
  await champ('champ_telephone').fill('+243 81 234 5678');
  await champ('champ_age').fill('130');
  await champ('champ_email').press('Enter');
  verifier(await message(page, '« Âge » doit être au plus 120.'), 'web : un nombre au-dessus du maximum est refusé');
  await champ('champ_age').fill('34');
  await champ('champ_naissance').fill('1992-05-14');
  await champ('champ_heure').fill('14:30');
  await champ('champ_site').fill('https://emch.cd');
  await champ('champ_presentation').fill('Bonjour');
  await champ('champ_presentation').press('Enter');
  await champ('champ_presentation').pressSequentially('Je découvre Humalis.');
  verifier((await champ('champ_presentation').inputValue()) === 'Bonjour\nJe découvre Humalis.', 'web : dans un texte long, Entrée va à la ligne au lieu d’envoyer');
  await page.getByLabel('Newsletter').check();
  await page.getByRole('radio', { name: 'M', exact: true }).check();
  await page.getByRole('button', { name: "S'inscrire" }).click();
  verifier(await message(page, 'Choisissez une valeur pour « Pays ».'), 'web : une liste déroulante obligatoire sans choix est refusée');
  await champ('champ_pays').selectOption('Belgique');
  verifier(envois === 0, 'web : rien n’a été envoyé au serveur tant que le formulaire était faux');
  await page.screenshot({ path: join(travail, 'web-2-rempli.png'), fullPage: true });

  // 4. Entrée envoie ; les champs sont vidés.
  await champ('champ_telephone').press('Enter');
  verifier(await message(page, 'Merci, votre inscription est enregistrée.'), 'web : Entrée envoie le formulaire, « Merci » s’affiche');
  verifier(envois === 1, `web : un seul envoi au serveur (${envois})`);
  const valeurs = await page.evaluate(() => ({
    textes: [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]), textarea, select')].map((e) => e.value),
    coches: document.querySelectorAll('input:checked').length,
  }));
  verifier(valeurs.textes.every((v) => v === '') && valeurs.coches === 0, `web : après l’envoi, tous les champs sont vidés (${JSON.stringify(valeurs)})`);
  await page.screenshot({ path: join(travail, 'web-3-envoye.png'), fullPage: true });

  // 5. Le serveur a reçu chaque valeur avec son type : on le lit en admin, depuis la page.
  await page.getByRole('link', { name: 'Espace admin' }).click();
  await page.getByText('Connectez-vous (admin) pour voir les inscriptions.').waitFor({ timeout: 5000 });
  await champ('champ_email').fill(EMAIL);
  await champ('champ_mot_de_passe').fill(MOT_DE_PASSE);
  verifier(await champ('champ_mot_de_passe').getAttribute('autocomplete') === 'current-password', 'web : le mot de passe de « se connecter » garde autoComplete="current-password"');
  await champ('champ_mot_de_passe').press('Enter');
  verifier(await message(page, 'Bienvenue'), 'web : Entrée envoie le formulaire de connexion');
  await page.getByRole('button', { name: 'Voir les inscriptions' }).click();
  verifier(
    await visible(page.getByText('Emch (emch@exemple.cd) : 34 ans, né le 1992-05-14, taille M, Belgique, lettre : true')),
    'web : l’admin voit l’inscription dans la page',
  );
  const lues = await page.evaluate(async () => (await fetch('/api/inscriptions')).json());
  const recue = lues[0] ?? {};
  verifier(
    lues.length === 1 &&
      recue.nom === 'Emch' &&
      recue.age === 34 &&
      recue.newsletter === true &&
      recue.naissance === '1992-05-14' &&
      recue.heure === '14:30' &&
      recue.presentation === 'Bonjour\nJe découvre Humalis.' &&
      recue.taille === 'M' &&
      recue.pays === 'Belgique',
    `web : le serveur a reçu chaque valeur avec son type (âge nombre, lettre booléen, date) : ${JSON.stringify(recue)}`,
  );
  await page.screenshot({ path: join(travail, 'web-4-admin.png'), fullPage: true });

  // 6. Serveur arrêté : l'envoi échoue, les champs restent remplis.
  processusServeur.kill();
  await page.getByRole('link', { name: "Retour à l'inscription" }).click();
  await page.getByRole('heading', { name: "Inscription à l'atelier" }).waitFor({ timeout: 5000 });
  await champ('champ_nom').fill('Zola');
  await champ('champ_email').fill('zola@exemple.cd');
  await champ('champ_age').fill('28');
  await champ('champ_naissance').fill('1998-01-31');
  await page.getByRole('radio', { name: 'L', exact: true }).check();
  await champ('champ_pays').selectOption('Congo');
  await champ('champ_nom').press('Enter');
  verifier(await message(page, "Le serveur n'a pas répondu."), 'web : serveur arrêté, l’échec de l’envoi est dit en français');
  verifier(await page.getByText('Merci, votre inscription est enregistrée.').count() === 0, 'web : après l’échec, la suite de l’événement ne s’exécute pas (pas de « Merci »)');
  verifier(
    (await champ('champ_nom').inputValue()) === 'Zola' && (await champ('champ_pays').inputValue()) === 'Congo',
    'web : après l’échec, les champs restent remplis pour réessayer',
  );
  await page.screenshot({ path: join(travail, 'web-5-echec.png'), fullPage: true });
  verifier(erreursConsole.length === 0, `web : aucune erreur dans la page${erreursConsole.length ? ` (${erreursConsole.join(' | ')})` : ''}`);
} finally {
  await navigateur.close();
  for (const p of processus) p.kill();
}

// ─── Mobile ─────────────────────────────────────────────────────────────

execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'mobile', '--sortie', mobile], { stdio: 'inherit' });
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund'], { cwd: mobile, stdio: 'inherit' });
execFileSync('npx', ['tsc', '--noEmit'], { cwd: mobile, stdio: 'inherit' });
verifier(true, 'mobile : les types du projet Expo passent (tsc)');
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-web'], { cwd: mobile, stdio: 'inherit', env: { ...process.env, CI: '1' } });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };
const racine = join(mobile, 'dist-web');
const statique = createServer((requete, reponse) => {
  const chemin = decodeURIComponent(new URL(requete.url, 'http://x').pathname);
  const candidats = [join(racine, chemin), join(racine, `${chemin}.html`), join(racine, chemin, 'index.html')];
  const trouve = candidats.find((c) => c.startsWith(racine) && existsSync(c) && statSync(c).isFile()) ?? join(racine, '+not-found.html');
  reponse.writeHead(trouve.endsWith('+not-found.html') ? 404 : 200, { 'Content-Type': TYPES[extname(trouve)] ?? 'application/octet-stream' });
  reponse.end(readFileSync(trouve));
});
await new Promise((ok) => statique.listen(0, '127.0.0.1', ok));
const navigateurMobile = await chromium.launch();
try {
  const contexte = await navigateurMobile.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await contexte.newPage();
  await page.goto(`http://127.0.0.1:${statique.address().port}`);
  const champ = (id) => page.getByTestId(id).filter({ visible: true }).first();
  const apparait = (locator) => locator.filter({ visible: true }).first().waitFor({ timeout: 5000 }).then(() => true, () => false);

  verifier(await apparait(page.getByTestId('formulaire_inscription')), 'mobile : le formulaire s’affiche');
  // React Native Web traduit le clavier demandé : phone-pad → type="tel", email-address → type="email".
  verifier(await champ('champ_telephone').getAttribute('type') === 'tel', 'mobile : le téléphone ouvre le clavier des numéros (keyboardType="phone-pad")');
  verifier(await champ('champ_age').getAttribute('inputmode') === 'numeric', 'mobile : l’âge ouvre le clavier des chiffres (keyboardType="numeric")');
  verifier(await champ('champ_email').getAttribute('type') === 'email', 'mobile : l’email ouvre le clavier des adresses (keyboardType="email-address")');
  verifier(await champ('champ_email').getAttribute('enterkeyhint') === 'send', 'mobile : la touche du clavier dit « Envoyer » (returnKeyType="send")');
  verifier(await champ('champ_naissance').getAttribute('placeholder') === 'AAAA-MM-JJ', 'mobile : la date se tape, avec l’indice AAAA-MM-JJ');

  await page.getByTestId('bouton_s_inscrire').filter({ visible: true }).tap();
  verifier(await apparait(page.getByText('Le champ « Nom » est obligatoire.')), 'mobile : le bouton vérifie les champs obligatoires');
  await champ('champ_nom').fill('Emch');
  await champ('champ_email').fill('emch@exemple.cd');
  await champ('champ_age').fill('34');
  await champ('champ_naissance').fill('14/05/1992');
  await champ('champ_nom').press('Enter');
  verifier(await apparait(page.getByText('« Naissance » doit être une date écrite AAAA-MM-JJ')), 'mobile : la touche Entrée (onSubmitEditing) envoie, et une date mal écrite est refusée');
  await champ('champ_naissance').fill('1992-05-14');
  await page.getByRole('radio').filter({ hasText: /^. M$/ }).first().tap();
  verifier(
    await page.getByRole('radio', { checked: true }).filter({ hasText: /^. M$/ }).count() === 1 && (await page.getByRole('radio', { checked: true }).count()) === 1,
    'mobile : un appui coche le choix « M », et lui seul (role="radio", aria-checked)',
  );
  await page.getByRole('switch').first().tap();
  verifier(await page.getByRole('switch').first().isChecked(), 'mobile : la case à cocher est un Switch, qu’un appui coche');
  await page.getByRole('button', { name: 'Pays' }).tap();
  await page.getByRole('radio', { name: 'Belgique' }).tap();
  verifier(await apparait(page.getByText('Belgique ▾')), 'mobile : la liste déroulante s’ouvre, et la valeur choisie s’affiche');
  await page.screenshot({ path: join(travail, 'mobile-1-rempli.png'), fullPage: true });
  await champ('champ_email').press('Enter');
  // Pas de serveur ici : l'envoi échoue, les champs restent remplis.
  verifier(await apparait(page.getByText("Le serveur n'a pas répondu.")), 'mobile : sans serveur, l’échec de l’envoi est dit en français');
  verifier((await champ('champ_nom').inputValue()) === 'Emch', 'mobile : après l’échec, les champs restent remplis');
  await page.screenshot({ path: join(travail, 'mobile-2-echec.png'), fullPage: true });
} finally {
  await navigateurMobile.close();
  statique.close();
}

console.log(`Captures : ${travail}`);
console.log('Non vérifié ici : le simulateur iPhone (Mac + Xcode).');
console.log(problemes.length === 0 ? 'Tout est vérifié.' : `${problemes.length} problème(s).`);
process.exit(problemes.length === 0 ? 0 : 1);
