// Vérifie que les trois écritures natives des limites (Swift, Kotlin, C#) répondent comme le serveur :
// les mêmes valeurs, les mêmes limites, les mêmes phrases que horsBornes (src/cibles/serveur/bornes.ts).
// Chaque langage est compilé avec son vrai outil ; celui qui manque sur la machine est sauté, et dit.
//
// Lancer : npm run build && node scripts/essai-limites-natives.mjs [dossier-de-travail]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { horsBornes } from '../dist/cibles/serveur/bornes.js';
import { limitesCsharp, limitesKotlin, limitesSwift } from '../dist/cibles/commun/limites-natives.js';

const dossier = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-limites'));
rmSync(dossier, { recursive: true, force: true });
mkdirSync(dossier, { recursive: true });

/** Une valeur : telle quelle, ou { repete: [début, caractère, nombre] } pour un long texte, ou { liste: […] }. */
const long = (debut, caractere, nombre) => ({ repete: [debut, caractere, nombre] });
const CAS = [
  [5, { min: 0, max: 10 }], [0, { min: 0, max: 10 }], [10, { min: 0, max: 10 }], [-1, { min: 0, max: 10 }], [11, { min: 0, max: 10 }],
  [-1, { min: 0 }], [51, { max: 50 }], [45.5, { min: -20, max: 45.5 }], [45.6, { min: -20, max: 45.5 }],
  [1.5, { entier: true }], [2, { entier: true, min: 1 }], [-5, {}], [1e9, { max: 1000000 }],
  ['ab', { longueurMin: 2, longueurMax: 4 }], ['a', { longueurMin: 2, longueurMax: 4 }], ['abcde', { longueurMin: 2, longueurMax: 4 }],
  ['abcde', { longueurMax: 4 }], ['', { longueurMin: 1 }], ['éà😀', { longueurMax: 3 }], ['éà😀!', { longueurMax: 3 }],
  ['a@b.fr', { format: 'email' }], ['a@b', { format: 'email' }], ['a b@c.fr', { format: 'email' }], ['', { format: 'email' }], ['a@b.fr\n', { format: 'email' }],
  ['+33 6 12 34 56 78', { format: 'telephone' }], ['06.12.34.56.78', { format: 'telephone' }], ['(06) 12-34-56-78', { format: 'telephone' }],
  ['appelle-moi', { format: 'telephone' }], ['12', { format: 'telephone' }], ['+', { format: 'telephone' }],
  ['https://exemple.fr/a?b=1', { format: 'adresse_web' }], ['http://exemple.fr', { format: 'adresse_web' }], ['javascript:alert(1)', { format: 'adresse_web' }],
  ['exemple.fr', { format: 'adresse_web' }], ['https://exemple', { format: 'adresse_web' }], ['https://a b.fr', { format: 'adresse_web' }],
  ['b', { parmi: ['a', 'b'] }], ['c', { parmi: ['a', 'b'] }], ['B', { parmi: ['a', 'b'] }],
  [{ liste: ['a', 'b'] }, { elementsMax: 2 }], [{ liste: ['a', 'b', 'c'] }, { elementsMax: 2 }], [{ liste: [] }, { elementsMax: 2 }],
  [long('', 'a', 10000), {}], [long('', 'a', 10001), {}], [long('', 'a', 10001), { longueurMax: 20000 }],
  [long('data:image/png;base64,', 'A', 50000), {}], [long('data:image/png;base64,', 'A', 95000), {}],
  [{ liste: [long('', 'a', 10001)] }, {}], [true, { min: 0 }], [null, { longueurMin: 2 }],
];

const enJs = (v) => (v === null || typeof v !== 'object' ? v : v.repete ? v.repete[0] + v.repete[1].repeat(v.repete[2]) : v.liste.map(enJs));
const attendus = CAS.map(([valeur, bornes]) => horsBornes(enJs(valeur), bornes) ?? 'rien');
const limites = { '/essai': Object.fromEntries(CAS.map(([, bornes], i) => [`c${i}`, bornes])) };

const texte = (t) => JSON.stringify(t);
const ecrire = (nom, contenu) => {
  mkdirSync(join(dossier, nom, '..'), { recursive: true });
  writeFileSync(join(dossier, nom), contenu);
};
const problemes = [];
const comparer = (langage, sortie) => {
  const recus = sortie.trim().split('\n');
  let justes = 0;
  CAS.forEach((cas, i) => {
    if (recus[i] === attendus[i]) justes++;
    else problemes.push(`${langage}, cas ${i} ${JSON.stringify(cas).slice(0, 90)} : attendu « ${attendus[i]} », reçu « ${recus[i]} »`);
  });
  console.log(`${justes === CAS.length ? '✓' : '✗'} ${langage} : ${justes} cas sur ${CAS.length} répondent comme le serveur`);
};
const sauter = (langage, raison) => console.log(`– ${langage} : sauté (${raison})`);
const lancer = (commande, args, options = {}) => execFileSync(commande, args, { cwd: dossier, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
const trouve = (commande) => {
  try {
    lancer('which', [commande]);
    return true;
  } catch {
    return false;
  }
};

// ─── Swift ──────────────────────────────────────────────────────────────
{
  const valeur = (v) =>
    v === null ? '.rien' : typeof v === 'boolean' ? `.booleen(${v})` : typeof v === 'number' ? `.nombre(${v})` : typeof v === 'string' ? `.texte(${texte(v)})` : v.repete ? `.texte(${texte(v.repete[0])} + String(repeating: ${texte(v.repete[1])}, count: ${v.repete[2]}))` : `.liste([${v.liste.map(valeur).join(', ')}])`;
  ecrire('swift/Limites.swift', limitesSwift(limites));
  ecrire(
    'swift/main.swift',
    `enum ValeurHumalis { case rien, booleen(Bool), nombre(Double), texte(String), liste([ValeurHumalis]), fiche([String: ValeurHumalis]) }
let route = Limites.routes["/essai"]!
${CAS.map(([v], i) => `print(Limites.horsBornes(${valeur(v)}, route["c${i}"] ?? BornesHumalis()) ?? "rien")`).join('\n')}
`,
  );
  if (!trouve('xcrun')) sauter('Swift', 'xcrun introuvable : il faut Xcode');
  else {
    try {
      lancer('xcrun', ['swiftc', 'swift/Limites.swift', 'swift/main.swift', '-o', 'swift/essai']);
      comparer('Swift', lancer(join(dossier, 'swift', 'essai'), []));
    } catch (erreur) {
      problemes.push(`Swift ne compile pas : ${String(erreur.stderr ?? erreur).slice(0, 600)}`);
    }
  }
}

// ─── C# ─────────────────────────────────────────────────────────────────
{
  const valeur = (v) =>
    v === null ? 'null' : typeof v === 'boolean' ? String(v) : typeof v === 'number' ? `${v}d` : typeof v === 'string' ? texte(v) : v.repete ? `${texte(v.repete[0])} + new string('${v.repete[1]}', ${v.repete[2]})` : `new List<object?> { ${v.liste.map(valeur).join(', ')} }`;
  ecrire('csharp/Limites.cs', limitesCsharp(limites));
  ecrire('csharp/essai.csproj', '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><InvariantGlobalization>true</InvariantGlobalization></PropertyGroup></Project>\n');
  ecrire(
    'csharp/Program.cs',
    `using Humalis;
Console.OutputEncoding = System.Text.Encoding.UTF8;
var route = Limites.Routes["/essai"];
${CAS.map(([v], i) => `Console.WriteLine(Limites.HorsBornes(${valeur(v)}, route.GetValueOrDefault("c${i}")) ?? "rien");`).join('\n')}
`,
  );
  const dotnet = trouve('dotnet') ? 'dotnet' : [process.env.DOTNET_ROOT && join(process.env.DOTNET_ROOT, 'dotnet'), join(homedir(), '.dotnet', 'dotnet')].find((c) => c && existsSync(c));
  if (!dotnet) sauter('C#', 'dotnet introuvable');
  else {
    try {
      comparer('C#', lancer(dotnet, ['run', '--project', 'csharp/essai.csproj', '-v', 'q', '--nologo']));
    } catch (erreur) {
      problemes.push(`C# ne compile pas : ${String(erreur.stdout ?? erreur).slice(0, 600)}`);
    }
  }
}

// ─── Kotlin ─────────────────────────────────────────────────────────────
{
  const valeur = (v) =>
    v === null ? 'null' : typeof v === 'boolean' ? String(v) : typeof v === 'number' ? (Number.isInteger(v) ? `${v}.0` : String(v)) : typeof v === 'string' ? texte(v).replace(/\$/g, '\\$') : v.repete ? `${texte(v.repete[0])} + ${texte(v.repete[1])}.repeat(${v.repete[2]})` : `listOf<Any?>(${v.liste.map(valeur).join(', ')})`;
  ecrire('kotlin/Limites.kt', limitesKotlin(limites).replace('package PAQUET', 'package essai'));
  ecrire(
    'kotlin/Main.kt',
    `package essai
fun main() {
    val route = Limites.routes["/essai"]!!
${CAS.map(([v], i) => `    println(Limites.horsBornes(${valeur(v)}, route["c${i}"] ?: BornesHumalis()) ?: "rien")`).join('\n')}
}
`,
  );
  // Le compilateur Kotlin livré avec Gradle (GRADLE_USER_HOME), ou celui de HUMALIS_KOTLIN_LIB.
  const gradle = process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle');
  const distributions = join(gradle, 'wrapper', 'dists');
  const dossiersDe = (chemin) => (existsSync(chemin) ? readdirSync(chemin, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(chemin, e.name)) : []);
  const deGradle = dossiersDe(distributions).flatMap(dossiersDe).flatMap(dossiersDe).map((racine) => join(racine, 'lib'));
  const bibliotheques = [process.env.HUMALIS_KOTLIN_LIB, ...deGradle].filter((c) => c && existsSync(c) && readdirSync(c).some((n) => n.startsWith('kotlin-compiler-embeddable')));
  const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', 'java') : trouve('java') ? 'java' : undefined;
  if (bibliotheques.length === 0) sauter('Kotlin', 'aucun compilateur Kotlin (Gradle absent : réglez GRADLE_USER_HOME ou HUMALIS_KOTLIN_LIB)');
  else if (!java) sauter('Kotlin', 'java introuvable (réglez JAVA_HOME)');
  else {
    const lib = bibliotheques.at(-1);
    const stdlib = join(lib, readdirSync(lib).find((n) => /^kotlin-stdlib-\d/.test(n)));
    try {
      lancer(java, ['-cp', join(lib, '*'), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-cp', stdlib, '-d', 'kotlin/sortie', 'kotlin/Limites.kt', 'kotlin/Main.kt']);
      comparer('Kotlin', lancer(java, ['-cp', `${join(dossier, 'kotlin', 'sortie')}:${stdlib}`, 'essai.MainKt']));
    } catch (erreur) {
      problemes.push(`Kotlin ne compile pas : ${String(erreur.stderr ?? erreur).slice(0, 600)}`);
    }
  }
}

if (problemes.length > 0) {
  console.error(`\n${problemes.length} écart(s) :\n${problemes.join('\n')}`);
  process.exit(1);
}
