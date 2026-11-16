import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Humalis 2.0.0 : un projet produit avec React (demandé, gardé ou imposé par le programme) avertit que React sera
 * retiré d'une prochaine version. Le moteur Humalis, le défaut, n'avertit pas.
 */
const construction = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'humalis-commande-'));
const COMMANDE = join(construction, 'cli.js');
const dossier = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'humalis-avertissement-react-'));
const fichier = join(dossier, 'essai.humalis');
const AVERTISSEMENT = 'Avertissement : React sera retiré dans une prochaine version de Humalis ; le moteur Humalis est le défaut.';

const compiler = (sortie: string, ...options: string[]) => {
  try {
    execFileSync('node', [COMMANDE, 'compile', fichier, ...options, '--sortie', join(dossier, sortie)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    throw new Error('la sortie d’erreur est attendue');
  } catch (erreur) {
    const e = erreur as { status?: number; stderr?: string };
    if (e.status === undefined) throw erreur;
    return { code: e.status, texte: String(e.stderr ?? '') };
  }
};
// execFileSync ne rend pas la sortie d'erreur quand tout va bien : la commande passe par un shell qui la réunit.
const lancer = (sortie: string, ...options: string[]) => {
  const ligne = ['node', COMMANDE, 'compile', fichier, ...options, '--sortie', join(dossier, sortie)].map((m) => `'${m}'`).join(' ');
  return execFileSync('sh', ['-c', `${ligne} 2>&1`], { encoding: 'utf8' });
};

describe('l’avertissement sur React', () => {
  beforeAll(() => {
    execFileSync('npx', ['tsc', '--outDir', construction], { stdio: 'pipe' });
    writeFileSync(join(construction, 'package.json'), '{"type":"module"}');
    writeFileSync(fichier, 'page "accueil" :\n    titre "Accueil"\n    texte "Bonjour"\n');
  }, 120_000);
  afterAll(() => {
    rmSync(construction, { recursive: true, force: true });
    rmSync(dossier, { recursive: true, force: true });
  });

  it('le web avec --moteur react avertit ; le moteur Humalis non', () => {
    expect(lancer('web-react', '--cible', 'web', '--moteur', 'react')).toContain(AVERTISSEMENT);
    expect(lancer('web-moteur', '--cible', 'web')).not.toContain(AVERTISSEMENT);
  });

  it('le bureau avec --moteur react avertit ; le moteur Humalis non', () => {
    expect(lancer('bureau-react', '--cible', 'desktop', '--moteur', 'react')).toContain(AVERTISSEMENT);
    expect(lancer('bureau-moteur', '--cible', 'desktop')).not.toContain(AVERTISSEMENT);
  });

  it('un moteur inconnu reste refusé, sans avertissement', () => {
    const refus = compiler('inconnu', '--cible', 'web', '--moteur', 'autre');
    expect(refus.code).toBe(2);
    expect(refus.texte).not.toContain(AVERTISSEMENT);
  });
});
