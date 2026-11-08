// Vérifie en vrai les rôles et le temps réel à plusieurs serveurs, avec une vraie base PostgreSQL
// et le vrai serveur produit par Humalis, lancé en deux exemplaires.
//
// Lancer : npm run build && node scripts/essai-moteur-roles.mjs [dossier-de-travail]
// Il faut PostgreSQL (initdb, pg_ctl) et Playwright.
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-roles'));
rmSync(join(travail, 'pg'), { recursive: true, force: true });
mkdirSync(travail, { recursive: true });
const { chromium } = createRequire(import.meta.url)('playwright');
const problemes = [];
const verifier = (ok, message) => {
  if (!ok) problemes.push(message);
  console.log(`${ok ? '✓' : '✗'} ${message}`);
};
const source = 'essais/moteur/ecole.humalis';
const serveur = join(travail, 'serveur');
const web = join(travail, 'web');
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'serveur', '--sortie', serveur], { stdio: ['ignore', 'ignore', 'pipe'] });
execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', 'web', '--moteur', 'humalis', '--sortie', web], { stdio: ['ignore', 'ignore', 'pipe'] });
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund', '--silent'], { cwd: serveur, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: serveur, stdio: 'ignore' });
execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: web, stdio: 'inherit' });
execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: web, stdio: 'inherit' });

const portBase = 5700 + Math.floor(Math.random() * 90);
const donnees = join(travail, 'pg');
const envBase = { ...process.env, LC_ALL: 'C', LANG: 'C' };
execFileSync('initdb', ['-D', donnees, '-A', 'trust', '-U', 'essai', '--no-sync', '--locale=C', '-E', 'UTF8'], { stdio: 'ignore', env: envBase });
execFileSync('pg_ctl', ['-D', donnees, '-o', `-p ${portBase} -k ${travail}`, '-w', '-l', join(travail, 'pg.log'), 'start'], { stdio: 'ignore', env: envBase });
const URL_BASE = `postgres://essai@127.0.0.1:${portBase}/postgres`;
const sql = (requete) => execFileSync('psql', [URL_BASE, '-Atc', requete], { encoding: 'utf8' }).trim();

const processus = [];
const lancer = (commande, args, options, pret) => new Promise((ok, echec) => {
  const p = spawn(commande, args, options);
  processus.push(p);
  const fin = setTimeout(() => echec(new Error('délai de lancement dépassé')), 30000);
  p.stderr.on('data', (m) => console.error(String(m).slice(0, 300)));
  p.stdout.on('data', (m) => {
    const trouve = pret(String(m));
    if (trouve) { clearTimeout(fin); ok(trouve); }
  });
});
const EMAIL = 'chef@ecole.cd';
const MOT = 'Admin-Solide-1!';
const SECRET = randomBytes(32).toString('hex');
const demarrer = (port) => lancer('node', ['dist/src/demarrer.js'], { cwd: serveur, env: { ...process.env, DATABASE_URL: URL_BASE, JWT_SECRET: SECRET, HUMALIS_ADMIN_EMAIL: EMAIL, HUMALIS_ADMIN_MOT_DE_PASSE: MOT, PORT: String(port) } }, (m) => m.includes('prêt'));
const portA = portBase + 1;
const portB = portBase + 2;
const navigateur = await chromium.launch();
try {
  await demarrer(portA);
  await demarrer(portB);
  verifier(true, 'deux exemplaires du serveur démarrent sur la même base');
  const A = `http://127.0.0.1:${portA}`;
  const B = `http://127.0.0.1:${portB}`;
  const adresse = await lancer(join(web, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0', '--strictPort', 'false'], { cwd: web, env: { ...process.env, HUMALIS_SERVEUR: A } }, (m) => m.match(/http:\/\/localhost:\d+/)?.[0]);

  // Le rôle vit dans la fiche du compte : l'essai le change comme le ferait une invitation.
  const donnerRole = (role) => sql(`update astratra_users set role='${role}', data = jsonb_set(data, '{role}', '"${role}"') where email='${EMAIL}'`);
  const json = { 'content-type': 'application/json' };
  const jetonDe = async (role) => {
    donnerRole(role);
    return (await (await fetch(`${A}/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: EMAIL, password: MOT }) })).json()).data.token;
  };
  const lire = (route, jeton) => fetch(`${A}/api/${route}`, { headers: jeton ? { authorization: `Bearer ${jeton}` } : {} }).then((r) => r.status);

  // ─── Les droits sur le vrai serveur ───────────────────────────────
  const jetons = {};
  for (const role of ['directeur', 'enseignant', 'parent', 'admin']) jetons[role] = await jetonDe(role);
  verifier(await lire('notes') === 401, 'un visiteur ne lit pas les notes (401)');
  verifier(await lire('notes', jetons.directeur) === 200, 'un directeur lit les notes');
  verifier(await lire('notes', jetons.enseignant) === 200, 'un enseignant lit les notes');
  verifier(await lire('notes', jetons.parent) === 403, 'un parent ne lit pas les notes (403)');
  verifier(await lire('notes', jetons.admin) === 200, 'un admin passe toujours');
  const creerNote = (jeton) => fetch(`${A}/api/notes`, { method: 'POST', headers: { ...json, authorization: `Bearer ${jeton}` }, body: JSON.stringify({ nom: 'Note de maths' }) }).then((r) => r.status);
  verifier(await creerNote(jetons.enseignant) === 403, 'un enseignant ne peut pas écrire là où seul le directeur peut (403)');
  verifier(await creerNote(jetons.directeur) === 201, 'le directeur peut écrire');

  // ─── Le temps réel à plusieurs serveurs ───────────────────────────
  const page = await navigateur.newPage({ locale: 'fr-FR' });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.goto(adresse);
  await page.getByRole('heading', { name: 'Ecole' }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  const creerAnnonce = (base, titre) => fetch(`${base}/api/annonces`, { method: 'POST', headers: { ...json, authorization: `Bearer ${jetons.directeur}` }, body: JSON.stringify({ titreAnnonce: titre }) }).then((r) => r.status);
  verifier(await creerAnnonce(B, 'Sortie scolaire') === 201, 'une annonce est créée sur le serveur B');
  verifier(await page.getByText('Sortie scolaire').waitFor({ timeout: 5000 }).then(() => true, () => false), 'la page, reliée au serveur A, la reçoit toute seule');

  // Plusieurs envois d'un coup : une seule relecture ou presque.
  let relectures = 0;
  page.on('request', (r) => { if (r.url().endsWith('/api/annonces') && r.method() === 'GET') relectures++; });
  await Promise.all(['Une', 'Deux', 'Trois', 'Quatre', 'Cinq'].map((t) => creerAnnonce(B, `Rafale ${t}`)));
  await page.getByText('Rafale Cinq').waitFor({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1500);
  verifier(await page.getByText('Rafale', { exact: false }).count() === 5, 'une rafale de cinq envois arrive en entier');
  verifier(relectures <= 2, `… en peu de relectures (${relectures})`);

  // ─── Les rôles dans la page ───────────────────────────────────────
  const entrer = async (role) => {
    donnerRole(role);
    const p = await (await navigateur.newContext({ locale: 'fr-FR' })).newPage();
    p.on('pageerror', (e) => erreurs.push(String(e)));
    await p.goto(adresse);
    await p.getByLabel('Email').fill(EMAIL);
    await p.getByLabel('Mot de passe').first().fill(MOT);
    await p.getByRole('button', { name: 'Entrer', exact: true }).click();
    await p.waitForTimeout(1500);
    return p;
  };
  const direction = await entrer('directeur');
  verifier(await direction.getByText('Bonjour la direction').isVisible().catch(() => false), 'un directeur ouvre la page réservée et se voit directeur');
  verifier(await direction.getByText('Note de maths').waitFor({ timeout: 4000 }).then(() => true, () => false), '… et lit les notes');
  await direction.context().close();
  const prof = await entrer('enseignant');
  verifier(await prof.getByText('Bonjour les enseignants').isVisible().catch(() => false) && await prof.getByText('Bonjour la direction').count() === 0, 'un enseignant voit sa partie, pas celle de la direction');
  await prof.context().close();
  const parent = await entrer('parent');
  verifier(new URL(parent.url()).pathname.replace(/\/$/, '') === '/refuse', `un parent est renvoyé hors de la page réservée (${new URL(parent.url()).pathname})`);
  await parent.context().close();
  verifier(erreurs.length === 0, `aucune erreur ${erreurs.join(' | ').slice(0, 300)}`);
} finally {
  await navigateur.close();
  for (const p of processus) p.kill();
  try { execFileSync('pg_ctl', ['-D', donnees, '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch { /* déjà arrêtée */ }
}
console.log(problemes.length ? `\n${problemes.length} problème(s).` : '\nTout est vérifié.');
process.exit(problemes.length ? 1 : 0);
