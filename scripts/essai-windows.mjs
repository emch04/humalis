#!/usr/bin/env node
/**
 * L'essai en vrai de la cible Windows : chaque exemple (et l'essai complet de
 * scripts/essais-windows) est compilé avec --cible windows, puis construit par le
 * SDK .NET 10 (`dotnet build`). Cela marche sur Windows, sur macOS et sur Linux :
 * WPF se compile partout, seul le lancement demande Windows.
 *
 *   node scripts/essai-windows.mjs [nom-d-exemple …] [--publier]
 *
 * --publier : publie aussi l'essai complet en un seul .exe (win-x64 et win-arm64).
 * HUMALIS_ESSAI_WINDOWS : le dossier de travail.
 * DOTNET : le programme dotnet (sinon celui du PATH, ou ~/.dotnet/dotnet).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const racine = resolve(import.meta.dirname, '..');
const travail = process.env.HUMALIS_ESSAI_WINDOWS ?? join(tmpdir(), 'humalis-essai-windows');
const publier = process.argv.includes('--publier');
const noms = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const candidats = [process.env.DOTNET, 'dotnet', join(homedir(), '.dotnet', 'dotnet')].filter(Boolean);
const dotnet = candidats.find((c) => spawnSync(c, ['--version'], { encoding: 'utf8' }).status === 0);
if (!dotnet) {
  console.log('Le SDK .NET 10 est introuvable (https://dotnet.microsoft.com) : rien à faire ici.');
  process.exit(0);
}
const environnement = { ...process.env, DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' };

const dossierExemples = join(racine, 'exemples');
const essais = join(racine, 'scripts', 'essais-windows');
const fichiers = noms.length
  ? noms.map((n) => [join(essais, `${n}.humalis`), join(racine, 'tests', 'formes', `${n}.humalis`)].find((f) => existsSync(f)) ?? join(dossierExemples, `${n}.humalis`))
  : [...readdirSync(essais).filter((f) => f.endsWith('.humalis')).map((f) => join(essais, f)), join(racine, 'tests', 'formes', 'toutes.humalis'), ...readdirSync(dossierExemples).filter((f) => f.endsWith('.humalis')).map((f) => join(dossierExemples, f))];

mkdirSync(travail, { recursive: true });
execFileSync('npm', ['run', 'build'], { cwd: racine, stdio: 'ignore' });
const cli = join(racine, 'dist/cli.js');

/** Les erreurs et avertissements du compilateur C#, ou une liste vide. */
function construire(dossier, ...args) {
  const r = spawnSync(dotnet, [...args, '-nologo', '-v', 'q'], { cwd: dossier, encoding: 'utf8', env: environnement, maxBuffer: 1 << 26 });
  const lignes = `${r.stdout}\n${r.stderr}`.split('\n').filter((l) => / (error|warning) [A-Z]+\d+/.test(l)).map((l) => l.replace(dossier + '/', '').replace(/ \[.*\]$/, '').trim());
  return { reussi: r.status === 0, lignes: [...new Set(lignes)] };
}

const bilan = [];
for (const fichier of fichiers) {
  const nom = basename(fichier, '.humalis');
  const sortie = join(travail, nom);
  rmSync(sortie, { recursive: true, force: true });
  const compilation = spawnSync('node', [cli, 'compile', fichier, '--cible', 'windows', '--sortie', sortie], { encoding: 'utf8' });
  if (compilation.status !== 0) {
    const raison = compilation.stderr.split('\n').find((l) => l.startsWith('Erreur')) ?? compilation.stderr.split('\n').find((l) => l.includes('aucune page')) ?? 'refusé';
    bilan.push({ nom, etat: 'refusé clairement' });
    console.log(`— ${nom} : refusé clairement. ${raison}`);
    continue;
  }
  const { reussi, lignes } = construire(sortie, 'build');
  const avertissements = lignes.filter((l) => l.includes(' warning '));
  if (!reussi) {
    bilan.push({ nom, etat: 'ÉCHEC' });
    console.log(`✗ ${nom} : la construction .NET a échoué\n  ${lignes.slice(0, 12).join('\n  ')}`);
    continue;
  }
  bilan.push({ nom, etat: avertissements.length ? `construit (${avertissements.length} avertissement(s))` : 'construit' });
  console.log(`✓ ${nom} : construit${avertissements.length ? `\n  ${avertissements.slice(0, 6).join('\n  ')}` : ''}`);
  if (publier && nom === 'complet') {
    for (const processeur of ['win-x64', 'win-arm64']) {
      const p = construire(sortie, 'publish', '-c', 'Release', '-r', processeur);
      const exe = readdirSync(join(sortie, 'bin', 'Release', 'net10.0-windows', processeur, 'publish')).find((f) => f.endsWith('.exe'));
      const chemin = exe && join(sortie, 'bin', 'Release', 'net10.0-windows', processeur, 'publish', exe);
      console.log(p.reussi && chemin ? `  .exe ${processeur} : ${chemin} (${Math.round(statSync(chemin).size / 1e6)} Mo)` : `  ✗ publication ${processeur} :\n  ${p.lignes.join('\n  ')}`);
    }
  }
}

const echecs = bilan.filter((b) => b.etat === 'ÉCHEC');
console.log(`\n${bilan.length} programme(s) : ${bilan.filter((b) => b.etat.startsWith('construit')).length} construit(s), ${bilan.filter((b) => b.etat === 'refusé clairement').length} refusé(s) clairement, ${echecs.length} échec(s).`);
process.exit(echecs.length ? 1 : 0);
