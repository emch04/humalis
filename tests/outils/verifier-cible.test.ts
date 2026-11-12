import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * « humalis verifier fichier.humalis --cible statique » (revue du 12 novembre 2026, T3) : ce que la cible
 * refuserait ou ignorerait, sans compiler dans un dossier. Avant, on ne l'apprenait qu'en compilant.
 */
const cli = readFileSync('src/cli.ts', 'utf8');
// La commande construite, si elle est à jour : après « npm run build ». Sinon, seuls les essais sur le texte tournent.
const construite = existsSync('dist/cli.js') && statSync('dist/cli.js').mtimeMs >= statSync('src/cli.ts').mtimeMs;

describe('verifier --cible', () => {
  it('l’aide la décrit, et rien ne s’écrit pendant la vérification', () => {
    expect(cli).toContain('  humalis verifier <fichier.humalis> [--exigeant] [--ri] [--cible <cible>]');
    expect(cli).toContain('if (aBlanc) return;');
    expect(cli.indexOf('if (aBlanc) return;')).toBeLessThan(cli.indexOf('ecrireSiChange(join(sortie, relatif), contenu)'));
  });

  it.skipIf(!construite)('dit ce que la cible refuse, rend 1, et n’écrit aucun fichier', () => {
    const dossier = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'humalis-verifier-cible-'));
    try {
      const fichier = join(dossier, 'essai.humalis');
      writeFileSync(fichier, 'page "a" :\n    titre "A"\n    bouton "Retour"\n    quand l\'utilisateur clique sur "Retour" :\n        revenir\n');
      const lancer = (...options: string[]) => {
        try {
          return { code: 0, texte: execFileSync('node', ['dist/cli.js', 'verifier', fichier, ...options], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
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
