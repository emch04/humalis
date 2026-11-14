// Produit l'application native de chaque programme d'exemple du dépôt pour une cible, puis la fait
// compiler par les outils de la plateforme. Attrape ce que la suite du dépôt ne voit pas : du Swift,
// du Kotlin ou du C# produit qui ne compile plus.
//   npm run build && npm run verifier:natifs -- --cible apple|android|windows
//
//   apple    xcodebuild, en Debug et en Release, pour iPhone (simulateur) et pour Mac, sans signature :
//            rien n'est lancé ni publié. Il faut un Mac avec Xcode.
//   android  Gradle, compileDebugKotlin. Il faut le JDK 17, le SDK Android (ANDROID_HOME) et Gradle :
//            GRADLE, sinon celui du PATH, sinon le plus récent du cache ($GRADLE_USER_HOME/wrapper/dists).
//   windows  dotnet build (.NET 10). WPF se compile aussi sous macOS et Linux ; seul le lancement
//            demande Windows. DOTNET, sinon celui du PATH, sinon ~/.dotnet/dotnet.
//
// Les programmes : exemples/ (sous-dossiers compris), scripts/essais-<cible>/ et tests/formes/toutes.humalis.
// Un programme sans page n'a rien à compiler. Un refus du compilateur doit être dans REFUS_EXPRES,
// avec sa raison : un refus qui n'y est pas est un échec.
//   --garder              laisse les projets produits sur le disque, pour regarder un échec
//   --seul nom            ne joue que les programmes dont le chemin contient « nom »
//   --configuration nom   Apple : Debug ou Release seulement (sinon les deux)
// HUMALIS_VERIFIER_NATIFS : le dossier de travail (sinon un dossier neuf dans TMPDIR).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(racine, 'dist', 'cli.js');
const CIBLES = ['apple', 'android', 'windows'];

/** Ce que le compilateur refuse exprès, cible par cible : le refus doit contenir « indice ». */
const REFUS_EXPRES = [
  {
    programme: 'exemples/vitrine.humalis',
    cibles: ['apple', 'android', 'windows'],
    indice: 'le composant « Carte » n\'a pas de vue',
    raison: 'son composant React « Carte » n’a pas de vue native',
  },
  {
    programme: 'exemples/applications/terrain.humalis',
    cibles: ['windows'],
    indice: '« scanner document dans bon » : cette action n\'est pas disponible sur la cible Windows',
    raison: 'scanner un document n’existe que sur Apple et Android',
  },
];

const option = (nom) => (process.argv.includes(nom) ? process.argv[process.argv.indexOf(nom) + 1] : undefined);
const cible = option('--cible');
const seul = option('--seul');
const garder = process.argv.includes('--garder');
const configurations = option('--configuration') ? [option('--configuration')] : ['Debug', 'Release'];
if (!CIBLES.includes(cible)) {
  console.error(`Dites quelle cible vérifier : --cible ${CIBLES.join('|')}.`);
  process.exit(2);
}
if (configurations.some((c) => !['Debug', 'Release'].includes(c)) || (option('--configuration') && cible !== 'apple')) {
  console.error('--configuration ne vaut que pour la cible Apple : Debug ou Release.');
  process.exit(2);
}
if (!existsSync(cli)) {
  console.error('Le compilateur n’est pas construit : lancez d’abord « npm run build ».');
  process.exit(2);
}

/** Le premier programme qui répond, ou undefined. */
function trouver(candidats, argument) {
  return candidats.filter(Boolean).find((c) => spawnSync(c, [argument], { stdio: 'ignore' }).status === 0);
}

/** Gradle : GRADLE, celui du PATH, sinon le plus récent du cache de Gradle. */
function trouverGradle() {
  const cache = join(process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle'), 'wrapper', 'dists');
  const versions = existsSync(cache)
    ? readdirSync(cache)
        .filter((d) => /^gradle-\d+(\.\d+)*-(bin|all)$/.test(d))
        .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
        .flatMap((d) => readdirSync(join(cache, d)).map((h) => join(cache, d, h, d.replace(/-(bin|all)$/, ''), 'bin', 'gradle')))
        .filter(existsSync)
    : [];
  return trouver([process.env.GRADLE, 'gradle', ...versions], '--version');
}

// 1. Les outils de la cible. Sans eux, rien n'est vérifié : c'est un échec, pas une réussite.
const environnement = { ...process.env, DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' };
let outil;
if (cible === 'apple') {
  if (process.platform !== 'darwin' || spawnSync('xcodebuild', ['-version'], { stdio: 'ignore' }).status !== 0) {
    console.error('La cible Apple se vérifie sur un Mac avec Xcode (xcodebuild est introuvable).');
    process.exit(2);
  }
  outil = 'xcodebuild';
} else if (cible === 'android') {
  outil = trouverGradle();
  if (!outil) {
    console.error('Gradle est introuvable : donnez son chemin dans GRADLE, mettez-le dans le PATH, ou ouvrez une fois un projet Android dans Android Studio.');
    process.exit(2);
  }
  if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) {
    console.error('Le SDK Android est introuvable : donnez son dossier dans ANDROID_HOME.');
    process.exit(2);
  }
} else {
  outil = trouver([process.env.DOTNET, 'dotnet', join(homedir(), '.dotnet', 'dotnet')], '--version');
  if (!outil) {
    console.error('Le SDK .NET 10 est introuvable (https://dotnet.microsoft.com) : donnez son chemin dans DOTNET, ou mettez dotnet dans le PATH.');
    process.exit(2);
  }
}

/** Chaque programme du dépôt pour cette cible, par son chemin depuis la racine. */
function programmes() {
  const trouves = [];
  const parcourir = (dossier, sousDossiers) => {
    if (!existsSync(join(racine, dossier))) return;
    for (const entree of readdirSync(join(racine, dossier), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const chemin = `${dossier}/${entree.name}`;
      if (entree.isDirectory() && sousDossiers) parcourir(chemin, true);
      else if (entree.isFile() && entree.name.endsWith('.humalis')) trouves.push(chemin);
    }
  };
  parcourir('exemples', true);
  parcourir(`scripts/essais-${cible}`, false);
  trouves.push('tests/formes/toutes.humalis');
  return seul ? trouves.filter((p) => p.includes(seul)) : trouves;
}

/** Une construction bloquée est arrêtée au bout de 20 minutes, et dite comme telle. */
const LIMITE = 20 * 60 * 1000;

/** Une commande, sa réussite et sa sortie entière. */
function lancer(commande, args, dossier) {
  const r = spawnSync(commande, args, { cwd: dossier, encoding: 'utf8', env: environnement, maxBuffer: 1 << 28, timeout: LIMITE, killSignal: 'SIGKILL' });
  const arret = r.error?.code === 'ETIMEDOUT' ? `\nerror: arrêté après ${LIMITE / 60000} minutes sans finir` : r.error ? `\n${r.error.message}` : '';
  return { reussi: r.status === 0, texte: `${r.stdout ?? ''}\n${r.stderr ?? ''}${arret}` };
}
const uniques = (lignes) => [...new Set(lignes.map((l) => l.trim()))];
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * Compile un projet produit avec les outils de la plateforme.
 * Renvoie les erreurs (vide si tout a compilé) et les avertissements, chemins rendus relatifs au projet.
 */
function compilerProjet(dossier, travail) {
  const nettoyer = (ligne) => ligne.replaceAll(`file://${dossier}/`, '').replaceAll(`${dossier}/`, '');
  if (cible === 'apple') {
    const projet = readdirSync(dossier).find((f) => f.endsWith('.xcodeproj'));
    const schema = basename(projet, '.xcodeproj');
    const derive = join(travail, 'derive');
    const erreurs = [];
    const avertissements = [];
    for (const configuration of configurations) {
      for (const [appareil, destination] of [['iPhone', 'generic/platform=iOS Simulator'], ['Mac', 'generic/platform=macOS']]) {
        // Une seule architecture suffit pour vérifier le code ; sans signature, rien ne demande de certificat.
        const r = lancer('xcodebuild', ['-project', projet, '-scheme', schema, '-configuration', configuration, '-destination', destination, '-derivedDataPath', derive, '-quiet', 'build', 'ARCHS=arm64', 'CODE_SIGNING_ALLOWED=NO', 'COMPILER_INDEX_STORE_ENABLE=NO'], dossier);
        const lignes = r.texte.split('\n');
        avertissements.push(...lignes.filter((l) => /: warning: /.test(l) && !/^\s*\|/.test(l)).map(nettoyer));
        if (!r.reussi) {
          // Swift redit chaque erreur dans un dessin (« |  `- error: … ») : seule la ligne qui nomme le fichier compte.
          const trouvees = lignes.filter((l) => /error: /.test(l) && !/^\s*\|/.test(l) && !/failed with exit code/.test(l)).map(nettoyer);
          erreurs.push(`${appareil}, ${configuration} :`, ...(trouvees.length ? uniques(trouvees).slice(0, 10) : lignes.filter(Boolean).slice(-10)));
        }
      }
    }
    rmSync(derive, { recursive: true, force: true });
    return { erreurs, avertissements: uniques(avertissements) };
  }
  if (cible === 'android') {
    const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
    writeFileSync(join(dossier, 'local.properties'), `sdk.dir=${sdk}\n`);
    const r = lancer(outil, ['compileDebugKotlin', '--console=plain', '--quiet', '--warning-mode=none'], dossier);
    const lignes = r.texte.split('\n');
    const avertissements = uniques(lignes.filter((l) => /^w: /.test(l)).map(nettoyer));
    if (r.reussi) return { erreurs: [], avertissements };
    const kotlin = lignes.filter((l) => /^e: /.test(l)).map(nettoyer);
    const gradle = lignes.filter((l) => /^\* What went wrong:|^> |FAILURE/.test(l));
    return { erreurs: uniques(kotlin.length ? kotlin : gradle.length ? gradle : lignes.filter(Boolean).slice(-15)).slice(0, 12), avertissements };
  }
  const r = lancer(outil, ['build', '-nologo', '-v', 'q'], dossier);
  const lignes = r.texte.split('\n').map((l) => nettoyer(l).replace(/ \[.*\]$/, ''));
  const avertissements = uniques(lignes.filter((l) => / warning [A-Z]+\d+/.test(l)));
  if (r.reussi) return { erreurs: [], avertissements };
  const trouvees = lignes.filter((l) => / error [A-Z]*\d*/.test(l));
  return { erreurs: uniques(trouvees.length ? trouvees : lignes.filter(Boolean).slice(-15)).slice(0, 12), avertissements };
}

// 2. Chaque programme : le produire, puis le compiler.
const racineTravail = process.env.HUMALIS_VERIFIER_NATIFS ?? mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), `humalis-natifs-${cible}-`));
mkdirSync(racineTravail, { recursive: true });
const bilan = { compiles: 0, refuses: 0, sansPage: 0, echecs: [] };
let avertissementsTotal = 0;
const liste = programmes();
if (liste.length === 0) {
  console.error('Aucun programme à vérifier.');
  process.exit(2);
}
console.log(`Cible ${cible} : ${pluriel(liste.length, 'programme')}, compilés avec ${cible === 'apple' ? `xcodebuild (${configurations.join(' et ')})` : outil}.`);

for (const [rang, programme] of liste.entries()) {
  const debut = Date.now();
  const travail = join(racineTravail, String(rang));
  const projet = join(travail, 'projet');
  rmSync(travail, { recursive: true, force: true });
  mkdirSync(travail, { recursive: true });
  const duree = () => `${Math.round((Date.now() - debut) / 1000)} s`;
  const attendu = REFUS_EXPRES.find((r) => r.programme === programme && r.cibles.includes(cible));

  const production = spawnSync('node', [cli, 'compile', join(racine, programme), '--cible', cible, '--sortie', projet], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (production.status !== 0) {
    const sortie = `${production.stdout}\n${production.stderr}`;
    const premiereErreur = sortie.split('\n').find((l) => l.startsWith('Erreur')) ?? sortie.split('\n').filter(Boolean).slice(-1)[0] ?? 'aucun message';
    if (production.status === 1 && /ne contient aucune page/.test(sortie) && !/^Erreur/m.test(sortie)) {
      bilan.sansPage++;
      console.log(`· ${programme} : aucune page, rien à compiler.`);
    } else if (attendu && production.status === 1 && sortie.includes(attendu.indice)) {
      bilan.refuses++;
      console.log(`— ${programme} : refusé exprès, ${attendu.raison}.`);
    } else {
      bilan.echecs.push({ programme, etape: 'production', detail: [premiereErreur], travail });
      console.log(`✗ ${programme} : le compilateur Humalis l’a refusé${attendu ? ', mais pas pour la raison attendue' : ''}.\n    ${premiereErreur}`);
    }
    if (!garder) rmSync(travail, { recursive: true, force: true });
    continue;
  }
  if (attendu) console.log(`  (${programme} n’est plus refusé pour ${cible} : retirez-le de REFUS_EXPRES.)`);

  const { erreurs, avertissements } = compilerProjet(projet, travail);
  avertissementsTotal += avertissements.length;
  if (erreurs.length > 0) {
    bilan.echecs.push({ programme, etape: 'compilation', detail: erreurs, travail });
    console.log(`✗ ${programme} : ne compile pas (${duree()}).\n    ${erreurs.join('\n    ')}`);
  } else {
    bilan.compiles++;
    const note = avertissements.length ? `, ${pluriel(avertissements.length, 'avertissement')}` : '';
    console.log(`✓ ${programme} : compilé (${duree()}${note}).${avertissements.length ? `\n    ${avertissements.slice(0, 4).join('\n    ')}` : ''}`);
  }
  if (!garder) rmSync(travail, { recursive: true, force: true });
}

console.log(
  `\nCible ${cible} : ${pluriel(bilan.compiles, 'compilé')}, ${pluriel(bilan.refuses, 'refusé')} exprès, ${bilan.sansPage} sans page, ` +
    `${pluriel(bilan.echecs.length, 'échec')}${avertissementsTotal ? ` (${pluriel(avertissementsTotal, 'avertissement')} au total)` : ''}.`,
);
for (const { programme, etape, travail } of bilan.echecs) console.log(`  ✗ ${programme} (${etape})${garder ? ` : ${travail}` : ''}`);
if (garder) console.log(`Projets gardés dans ${racineTravail}`);
else if (!process.env.HUMALIS_VERIFIER_NATIFS) rmSync(racineTravail, { recursive: true, force: true });
process.exit(bilan.echecs.length > 0 ? 1 : 0);
