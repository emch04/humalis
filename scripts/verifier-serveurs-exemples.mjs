// Produit le serveur de chaque programme connu du dépôt (exemples, guide, antisèche, guide pour
// assistants, programmes des tests), vérifie ses types, puis lance les tests que le compilateur a
// écrits pour lui (droits, attaques, synchronisation). Attrape ce que la suite du dépôt ne voit pas :
// un serveur produit qui ne compile plus, ou dont les propres tests échouent.
//   npm run build && npm run verifier:serveurs
// Lent : une installation de paquets, puis tsc et vitest pour chaque serveur.
//   --garder    laisse les serveurs produits sur le disque, pour regarder un échec
//   --seul nom  ne joue que les programmes dont le nom contient « nom »
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const construit = (fichier) => pathToFileURL(join(racine, 'dist', fichier)).href;
if (!existsSync(join(racine, 'dist', 'compilateur.js'))) {
  console.error('Le compilateur n’est pas construit : lancez d’abord « npm run build ».');
  process.exit(2);
}
const { compiler } = await import(construit('compilateur.js'));
const { genererProjetServeur } = await import(construit('cibles/serveur/projet.js'));

const garder = process.argv.includes('--garder');
const seul = process.argv.includes('--seul') ? process.argv[process.argv.indexOf('--seul') + 1] : undefined;

/** Chaque programme du dépôt : son nom, pour le dire en cas d'échec, et son texte. */
function programmes() {
  const trouves = [];
  const lire = (chemin) => readFileSync(join(racine, chemin), 'utf8');
  for (const dossier of ['exemples', 'tests']) {
    for (const fichier of readdirSync(join(racine, dossier)).sort()) {
      if (fichier.endsWith('.humalis')) trouves.push([`${dossier}/${fichier}`, lire(join(dossier, fichier))]);
    }
  }
  for (const guide of ['docs/guide.md', 'docs/antiseche.md', 'llms.txt']) {
    let numero = 0;
    for (const bloc of lire(guide).matchAll(/```humalis[^\n]*\n([\s\S]*?)```/g)) trouves.push([`${guide}, bloc ${++numero}`, bloc[1]]);
  }
  return seul ? trouves.filter(([nom]) => nom.includes(seul)) : trouves;
}

// 1. Produire chaque serveur. Un programme sans serveur, ou qui ne compile pas (un extrait du guide
//    n'est pas toujours un programme entier), ne compte pas.
const travail = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'humalis-serveurs-'));
const serveurs = [];
for (const [nom, source] of programmes()) {
  let resultat;
  try {
    resultat = compiler(source);
  } catch {
    continue;
  }
  if (!resultat.application || resultat.diagnostics.some((d) => d.gravite === 'erreur') || resultat.application.serveurs.length !== 1) continue;
  const dossier = join(travail, String(serveurs.length));
  for (const [chemin, contenu] of genererProjetServeur(resultat.application.serveurs[0], { nom: 'essai', source: 'essai.humalis' })) {
    mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
  serveurs.push({ nom, dossier });
}
if (serveurs.length === 0) {
  console.error('Aucun serveur à vérifier.');
  process.exit(2);
}

// 2. Une seule installation pour tous : la réunion des paquets que les serveurs demandent.
const paquets = { dependencies: {}, devDependencies: {} };
const desaccords = [];
for (const { nom, dossier } of serveurs) {
  const demande = JSON.parse(readFileSync(join(dossier, 'package.json'), 'utf8'));
  for (const genre of ['dependencies', 'devDependencies']) {
    for (const [paquet, version] of Object.entries(demande[genre] ?? {})) {
      const deja = paquets.dependencies[paquet] ?? paquets.devDependencies[paquet];
      if (deja !== undefined && deja !== version) desaccords.push(`${paquet} : ${deja} et ${version} (${nom})`);
      if (deja === undefined) paquets[genre][paquet] = version;
    }
  }
}
if (desaccords.length > 0) {
  console.error(`Deux serveurs produits demandent des versions différentes du même paquet :\n  ${desaccords.join('\n  ')}`);
  process.exit(1);
}
const commun = join(travail, 'commun');
mkdirSync(commun);
writeFileSync(join(commun, 'package.json'), JSON.stringify({ name: 'humalis-serveurs-exemples', private: true, type: 'module', ...paquets }, null, 2));
console.log(`${serveurs.length} serveurs produits ; installation de leurs paquets…`);
execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: commun, stdio: 'pipe' });

// 3. Pour chaque serveur : les types, puis ses tests.
// Dans l'intégration continue, la sortie est en couleurs : on les retire avant de la relire.
const sansCouleurs = (texte) => String(texte).replace(/\u001b\[[0-9;]*m/g, '');
const sortie = (erreur) => sansCouleurs(`${erreur.stdout ?? ''}${erreur.stderr ?? ''}`);
const echecs = [];
let tests = 0;
let fichiers = 0;
for (const { nom, dossier } of serveurs) {
  symlinkSync(join(commun, 'node_modules'), join(dossier, 'node_modules'), 'dir');
  try {
    execFileSync('npx', ['tsc', '--noEmit'], { cwd: dossier, encoding: 'utf8', stdio: 'pipe' });
  } catch (erreur) {
    echecs.push({ nom, dossier, etape: 'types', detail: sortie(erreur).split('\n').slice(0, 8).join('\n') });
    continue;
  }
  if (!existsSync(join(dossier, 'tests'))) continue;
  try {
    const rendu = sansCouleurs(execFileSync('npx', ['vitest', 'run', '--dir', 'tests'], { cwd: dossier, encoding: 'utf8', stdio: 'pipe' }));
    tests += Number(/Tests\s+(\d+) passed/.exec(rendu)?.[1] ?? 0);
    fichiers += Number(/Test Files\s+(\d+) passed/.exec(rendu)?.[1] ?? 0);
  } catch (erreur) {
    const lignes = sortie(erreur).split('\n').filter((ligne) => /×|Error|expected|FAIL/.test(ligne));
    echecs.push({ nom, dossier, etape: 'tests', detail: lignes.slice(0, 8).join('\n') });
  }
}

console.log(`${serveurs.length} serveurs, ${fichiers} fichiers de tests, ${tests} tests réussis, ${echecs.length} échec${echecs.length > 1 ? 's' : ''}.`);
for (const { nom, dossier, etape, detail } of echecs) console.log(`\n--- ${nom} (${etape})${garder ? ` : ${dossier}` : ''}\n${detail}`);
if (garder) console.log(`\nServeurs gardés dans ${travail}`);
else rmSync(travail, { recursive: true, force: true });
process.exit(echecs.length > 0 ? 1 : 0);
