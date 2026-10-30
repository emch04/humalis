// Vérifie en vrai l'étape 3 : compile exemples/boutique-serveur.humalis
// vers un serveur Node + packs Astratra, l'installe, vérifie ses types,
// lance ses propres tests de règles d'accès, puis le démarre et
// l'interroge comme une application le ferait. Il démarre par son vrai
// « npm start », réglé par un fichier .env, comme le dit le LISEZMOI.
//
// Avec une base PostgreSQL d'essai (vide, elle sera remplie), il vérifie
// aussi que les données y sont écrites et retrouvées après un redémarrage :
//   HUMALIS_ESSAI_POSTGRES=postgres://… npm run essai:serveur
//
// Lancer : npm run build && npm run essai:serveur [dossier-de-travail]
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const dossier = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-serveur'));
rmSync(dossier, { recursive: true, force: true });
const problemes = [];
const verifier = (condition, message) => {
  if (!condition) problemes.push(message);
  console.log(`${condition ? '✓' : '✗'} ${message}`);
};

execFileSync('node', ['dist/cli.js', 'compile', 'exemples/boutique-serveur.humalis', '--cible', 'serveur', '--sortie', dossier], { stdio: 'inherit' });
// npm 11 (celui de Node 24) : npm 10 échoue parfois sur « edgesOut ».
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'inherit' });
execFileSync('npx', ['tsc', '--noEmit'], { cwd: dossier, stdio: 'inherit' });
verifier(true, 'le code produit passe la vérification des types');
const tests = execFileSync('npx', ['vitest', 'run'], { cwd: dossier, encoding: 'utf8' });
verifier(/Tests\s+\d+ passed/.test(tests) && !/failed/.test(tests), `les tests de règles produits passent (${tests.match(/Tests\s+(\d+) passed/)?.[1]} tests)`);
execFileSync('npm', ['run', 'build'], { cwd: dossier, stdio: 'inherit' });
const apresConstruction = execFileSync('npm', ['test'], { cwd: dossier, encoding: 'utf8' });
verifier(apresConstruction.match(/Tests\s+(\d+) passed/)?.[1] === tests.match(/Tests\s+(\d+) passed/)?.[1], 'après la construction, npm test ne relance pas les tests compilés de dist/');

// Un visiteur qui crée (« tout le monde peut creer ») : ses tests produits
// doivent passer aussi (cookie CSRF « Secure » hors développement).
const inscriptions = `${dossier}-inscriptions`;
rmSync(inscriptions, { recursive: true, force: true });
execFileSync('node', ['dist/cli.js', 'compile', 'exemples/inscription.humalis', '--cible', 'serveur', '--sortie', inscriptions], { stdio: 'inherit' });
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund'], { cwd: inscriptions, stdio: 'inherit' });
const testsInscriptions = execFileSync('npm', ['test'], { cwd: inscriptions, encoding: 'utf8' });
verifier(/Tests\s+\d+ passed/.test(testsInscriptions) && !/failed/.test(testsInscriptions), `les tests produits passent quand tout le monde peut créer (${testsInscriptions.match(/Tests\s+(\d+) passed/)?.[1]} tests)`);

const port = 4900 + Math.floor(Math.random() * 90);
const u = `http://127.0.0.1:${port}`;
const json = { 'content-type': 'application/json' };
const postgres = process.env.HUMALIS_ESSAI_POSTGRES;

/** Démarre le serveur par la commande de son « npm start », réglé par un fichier .env (rien d'autre dans l'environnement). */
async function demarrer(base) {
  writeFileSync(
    join(dossier, '.env'),
    [`JWT_SECRET=${randomBytes(32).toString('hex')}`, 'HUMALIS_ADMIN_EMAIL=admin@boutique.cd', 'HUMALIS_ADMIN_MOT_DE_PASSE=Admin-Solide-2026!', `DATABASE_URL=${base ?? ''}`, `PORT=${port}`].join('\n'),
  );
  const [commande, ...args] = JSON.parse(readFileSync(join(dossier, 'package.json'), 'utf8')).scripts.start.split(' ');
  const env = { ...process.env };
  for (const cle of ['JWT_SECRET', 'HUMALIS_ADMIN_EMAIL', 'HUMALIS_ADMIN_MOT_DE_PASSE', 'DATABASE_URL', 'PORT', 'HUMALIS_ESSAI_POSTGRES']) delete env[cle];
  const processus = spawn(commande, args, { cwd: dossier, env });
  let sortie = '';
  const pret = await new Promise((ok) => {
    processus.stdout.on('data', (m) => { sortie += m; if (sortie.includes('prêt')) ok(true); });
    processus.stderr.on('data', (m) => { sortie += m; });
    processus.on('exit', () => ok(false));
  });
  return { processus, pret, sortie: () => sortie };
}

const connecter = async () => {
  const connexion = await (await fetch(`${u}/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: 'admin@boutique.cd', password: 'Admin-Solide-2026!' }) })).json();
  return { ...json, authorization: `Bearer ${connexion.data.token}` };
};

let serveur = await demarrer();
verifier(serveur.pret, `npm start lit le fichier .env et démarre le serveur${serveur.pret ? '' : ` (${serveur.sortie().trim()})`}`);
try {
  verifier((await fetch(`${u}/api/produits`)).status === 200, 'un visiteur lit les produits (200)');
  const livre = JSON.stringify({ nom: 'Livre', prix: 12, stock: 3, disponible: true });
  verifier((await fetch(`${u}/api/produits`, { method: 'POST', headers: json, body: livre })).status === 401, 'un visiteur ne peut pas créer de produit (401)');
  const admin = await connecter();
  const cree = await fetch(`${u}/api/produits`, { method: 'POST', headers: admin, body: livre });
  verifier(cree.status === 201, 'l\'admin connecté crée un produit (201)');
  const faux = await fetch(`${u}/api/produits`, { method: 'POST', headers: admin, body: JSON.stringify({ nom: 'Stylo', prix: 'deux', stock: 1, disponible: true }) });
  verifier(faux.status === 400 && (await faux.json()).erreur === 'le champ « prix » doit être un nombre', 'un prix en texte est refusé, avec un message en français (400)');
  const liste = await (await fetch(`${u}/api/produits`)).json();
  verifier(liste.length === 1 && liste[0].nom === 'Livre', 'le produit créé est relu par un visiteur');
  verifier((await fetch(`${u}/api/avis/x`, { method: 'PATCH', headers: admin, body: '{}' })).status === 403, 'une action sans règle est refusée, même à l\'admin (403)');
} finally {
  serveur.processus.kill();
}

// Les données dans PostgreSQL : écrites, modifiées, retrouvées après un redémarrage.
if (postgres) {
  serveur = await demarrer(postgres);
  verifier(serveur.pret && serveur.sortie().includes('Administrateur créé'), 'PostgreSQL : le serveur démarre sur la base et crée l\'administrateur');
  let livre;
  try {
    const admin = await connecter();
    const reponse = await fetch(`${u}/api/produits`, { method: 'POST', headers: admin, body: JSON.stringify({ nom: 'Livre « été »', prix: 12.5, stock: 3, disponible: true }) });
    livre = await reponse.json();
    verifier(reponse.status === 201, 'PostgreSQL : l\'admin crée un produit, accents et guillemets compris (201)');
    const modifie = await fetch(`${u}/api/produits/${livre.id}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ stock: 2 }) });
    verifier(modifie.status === 200 && (await modifie.json()).stock === 2, 'PostgreSQL : le produit est modifié');
    const avis = await fetch(`${u}/api/avis`, { method: 'POST', headers: admin, body: JSON.stringify({ produit: livre.id, note: 5, commentaire: "L'apostrophe ' et \"guillemets\"" }) });
    verifier(avis.status === 201, 'PostgreSQL : un avis est créé');
    const injection = await fetch(`${u}/api/produits/${encodeURIComponent("1' OR '1'='1")}`);
    verifier(injection.status === 404, `PostgreSQL : un identifiant piégé ne trouve rien (${injection.status})`);
  } finally {
    serveur.processus.kill();
  }
  await new Promise((ok) => setTimeout(ok, 500));
  serveur = await demarrer(postgres);
  try {
    verifier(serveur.pret && !serveur.sortie().includes('Administrateur créé'), 'PostgreSQL : au redémarrage, l\'administrateur existe déjà');
    const relu = await (await fetch(`${u}/api/produits/${livre?.id}`)).json();
    verifier(relu.nom === 'Livre « été »' && relu.prix === 12.5 && relu.stock === 2, 'PostgreSQL : après le redémarrage, le produit modifié est retrouvé');
    const avis = await (await fetch(`${u}/api/avis`)).json();
    verifier(avis.length === 1 && avis[0].commentaire === "L'apostrophe ' et \"guillemets\"", 'PostgreSQL : après le redémarrage, l\'avis est retrouvé tel quel');
    const admin = await connecter();
    verifier((await fetch(`${u}/api/produits/${livre?.id}`, { method: 'DELETE', headers: admin })).status === 204, 'PostgreSQL : l\'admin supprime le produit (204)');
    verifier((await (await fetch(`${u}/api/produits`)).json()).length === 0, 'PostgreSQL : le produit supprimé a disparu');
  } finally {
    serveur.processus.kill();
  }
} else {
  console.log('Non vérifié : PostgreSQL (donner HUMALIS_ESSAI_POSTGRES=postgres://… pour l\'essayer).');
}

console.log(problemes.length === 0 ? 'Tout est vérifié.' : `${problemes.length} problème(s).`);
process.exit(problemes.length === 0 ? 0 : 1);
