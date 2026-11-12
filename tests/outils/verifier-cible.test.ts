import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * « humalis verifier fichier.humalis --cible statique » (revue du 12 novembre 2026, T3) : ce que la cible
 * refuserait ou ignorerait, sans compiler dans un dossier. Avant, on ne l'apprenait qu'en compilant.
 */
const cli = readFileSync('src/cli.ts', 'utf8');
// La commande est construite ici, dans un dossier à elle : un autre test reconstruit « dist » pendant la suite.
const construction = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'humalis-commande-'));
const COMMANDE = join(construction, 'cli.js');

describe('verifier --cible', () => {
  it('la cible « mobile » (Expo) n’existe plus : ni dans l’aide, ni dans le compilateur', () => {
    expect(cli).not.toContain('--cible mobile --sortie');
    expect(cli).not.toContain('genererProjetMobile');
    expect(existsSync('src/cibles/mobile')).toBe(false);
  });

  it('l’aide la décrit, et rien ne s’écrit pendant la vérification', () => {
    expect(cli).toContain('  humalis verifier <fichier.humalis> [--exigeant] [--ri] [--cible <cible>]');
    expect(cli).toContain('if (aBlanc) return;');
    expect(cli.indexOf('if (aBlanc) return;')).toBeLessThan(cli.indexOf('ecrireSiChange(join(sortie, relatif), contenu)'));
  });

  beforeAll(() => {
    execFileSync('npx', ['tsc', '--outDir', construction], { stdio: 'pipe' });
    writeFileSync(join(construction, 'package.json'), '{"type":"module"}');
  }, 120_000);
  afterAll(() => rmSync(construction, { recursive: true, force: true }));

  it('dit ce que la cible refuse, rend 1, et n’écrit aucun fichier', () => {
    const dossier = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'humalis-verifier-cible-'));
    try {
      const fichier = join(dossier, 'essai.humalis');
      writeFileSync(fichier, 'page "a" :\n    titre "A"\n    bouton "Retour"\n    quand l\'utilisateur clique sur "Retour" :\n        revenir\n');
      const lancer = (...options: string[]) => {
        try {
          return { code: 0, texte: execFileSync('node', [COMMANDE, 'verifier', fichier, ...options], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
        } catch (erreur) {
          const e = erreur as { status?: number; stderr?: string; stdout?: string };
          return { code: e.status ?? -1, texte: String(e.stderr ?? '') + String(e.stdout ?? '') };
        }
      };
      const statique = lancer('--cible', 'statique');
      expect(statique.code).toBe(1);
      expect(statique.texte).toContain("« revenir » (page « a ») n'est pas encore disponible sur la cible statique");
      expect(statique.texte).toContain('Le programme ne peut pas être produit pour la cible statique.');
      expect(statique.texte).not.toContain('écrit dans');
      expect(lancer('--cible', 'web').code).toBe(0);
      expect(lancer('--cible', 'apple').code).toBe(0);
      expect(lancer('--cible', 'inconnue').code).toBe(2);
      // L'ancienne cible Expo : retirée, avec les deux cibles qui la remplacent.
      const ancienne = lancer('--cible', 'mobile');
      expect(ancienne.code).toBe(2);
      expect(ancienne.texte).toContain('La cible « mobile » (Expo) a été retirée : compilez avec --cible apple');
      expect(lancer('--cible').code).toBe(2);
      // Sans --cible, la vérification ordinaire, comme avant.
      expect(lancer().code).toBe(0);
      // Le dossier ne contient que le fichier d'essai.
      expect(readdirSync(dossier)).toEqual(['essai.humalis']);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });
});
