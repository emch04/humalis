import { expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { camel } from '../src/cibles/web/noms.js';
import { type Base, surBase } from './aide-bases.js';
import { installerSiBesoin } from './aide-installation.js';

/** Une réponse rendue par un scénario : son statut HTTP (0 pour un relevé), et son corps. */
export type Reponse = { statut: number; corps: Record<string, unknown> };

/** Produit le serveur du programme, le construit, et joue le scénario ; rend la dernière ligne qu'il écrit. */
export function jouer(source: string, nom: string, texte: (stockages: string[]) => string, base: Base, apresBase: (code: string) => string = (code) => code): Record<string, Reponse> {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  const serveur = application!.serveurs[0]!;
  const dossier = join(tmpdir(), `humalis-${nom}`);
  rmSync(join(dossier, 'src'), { recursive: true, force: true });
  rmSync(join(dossier, 'dist'), { recursive: true, force: true });
  for (const [chemin, contenu] of genererProjetServeur(serveur, { nom: 'carnet', source: 'carnet.humalis' })) {
    mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
  const code = texte(serveur.donnees.map((d) => camel(d.nom)));
  writeFileSync(join(dossier, 'scenario.mjs'), base === 'memoire' ? code : apresBase(surBase(code, base)));
  // Réinstallé quand les paquets du serveur produit changent (un programme d'essai qui gagne les appels, les notifications…).
  installerSiBesoin(dossier);
  execFileSync('npx', ['tsc'], { cwd: dossier, stdio: 'pipe' });
  return JSON.parse(execFileSync('node', ['scenario.mjs'], { cwd: dossier, encoding: 'utf8' }).trim().split('\n').at(-1)!);
}
