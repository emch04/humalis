import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyser } from '../lexer/lexer.js';
import { analyserSyntaxe } from '../parser/parser.js';
import type { CasTest } from '../parser/ast.js';

export type { CasTest } from '../parser/ast.js';

export function decouvrirTests(projet: string): string[] {
  const dossiers = [join(projet, 'tests')];
  const fichiers: string[] = [];
  while (dossiers.length) {
    const dossier = dossiers.pop()!;
    let entrees;
    try { entrees = readdirSync(dossier, { withFileTypes: true }); } catch { continue; }
    for (const entree of entrees) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) dossiers.push(chemin);
      else if (entree.isFile() && entree.name.endsWith('.test.humalis')) fichiers.push(chemin);
    }
  }
  return fichiers.sort((a, b) => a.localeCompare(b, 'fr'));
}

export function lireCasTests(fichier: string): CasTest[] {
  try { return analyserSyntaxe(analyser(readFileSync(fichier, 'utf8'))).tests; }
  catch (erreur) { throw new Error(`${fichier} : ${(erreur as Error).message}`); }
}

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trouverPrincipal } from './developpement.js';
import { executerDansChromium } from './tests-web.js';
import { ligneVerification, resumeVerifications } from './rapport-tests.js';

export async function testerProjet(cible: string, detail = false): Promise<number> {
  const fichierUnique = cible.endsWith('.test.humalis');
  const projet = fichierUnique ? dirname(dirname(resolve(cible))) : resolve(cible);
  const fichiers = fichierUnique ? [resolve(cible)] : decouvrirTests(projet);
  if (fichiers.length === 0) { console.error(`Aucun fichier *.test.humalis trouvé dans « ${cible} ».`); return 1; }
  const cas = fichiers.flatMap((fichier) => lireCasTests(fichier).map((test) => ({ fichier, test })));
  if (cas.length === 0) { console.error('Aucun bloc test trouvé.'); return 1; }
  const principal = trouverPrincipal(projet);
  const sortie = join(projet, '.humalis', 'tests', 'web');
  mkdirSync(dirname(sortie), { recursive: true });
  const cli = fileURLToPath(new URL('../cli.js', import.meta.url));
  const compilation = spawnSync(process.execPath, [cli, 'compile', principal, '--cible', 'web', '--sortie', sortie], { encoding: 'utf8' });
  if (compilation.status !== 0) { console.error(compilation.stderr || compilation.error?.message || 'Compilation impossible.'); return 1; }
  if (!existsSync(join(sortie, 'node_modules', 'vite'))) {
    const installation = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: sortie, encoding: 'utf8' });
    if (installation.status !== 0) { console.error(`Installation impossible dans « ${sortie} » : ${installation.stderr || installation.error?.message}`); return 1; }
  }
  const construction = spawnSync('npm', ['run', 'build'], { cwd: sortie, encoding: 'utf8' });
  if (construction.status !== 0) { console.error(`Construction impossible : ${construction.stderr || construction.error?.message}`); return 1; }
  const serveur = spawn(join(sortie, 'node_modules', '.bin', 'vite'), ['preview', '--host', '127.0.0.1', '--port', '0'], { cwd: sortie });
  try {
    const adresse = await new Promise<string>((ok, echec) => {
      const minuteur = setTimeout(() => echec(new Error('Délai de lancement de Vite dépassé.')), 10000);
      serveur.stdout?.on('data', (donnees) => { const valeur = String(donnees).match(/http:\/\/(?:localhost|127\.0\.0\.1):\d+/u); if (valeur) { clearTimeout(minuteur); ok(valeur[0]); } });
      serveur.once('error', (erreur) => { clearTimeout(minuteur); echec(erreur); });
      serveur.once('exit', () => { clearTimeout(minuteur); echec(new Error('Vite s’est arrêté avant les tests.')); });
    });
    const resultats = await executerDansChromium(sortie, adresse, cas, detail);
    for (const resultat of resultats) console.log(ligneVerification(projet, resultat));
    const echecs = resultats.filter((r) => !r.succes).length;
    console.log(resumeVerifications(resultats.length - echecs, echecs));
    return echecs ? 1 : 0;
  } finally { serveur.kill(); }
}
