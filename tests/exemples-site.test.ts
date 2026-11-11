import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compiler } from '../src/compilateur.js';
import { pourLaCible } from '../src/ri/plateforme.js';
import { verifierFormesPourLaCible } from '../src/cibles/formes.js';
import { verifierTempsReelPourLaCible } from '../src/cibles/temps-reel.js';
import { verifierAppareilPourLaCible } from '../src/cibles/appareil.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { genererProjetAndroid } from '../src/cibles/android/projet.js';
import { genererProjetWindows } from '../src/cibles/windows/projet.js';
// @ts-expect-error : un script en JavaScript, sans déclaration de types.
import { APPLICATIONS, lireApplication } from '../scripts/exemples-site.mjs';

/**
 * Les applications complètes de la page Exemples (exemples/applications/) : chacune compile sans
 * erreur, chaque cible annoncée sur la page l'accepte, et la page est celle que donnent les fichiers.
 */
const racine = fileURLToPath(new URL('..', import.meta.url));
type Application = { fichier: string; cibles: string[] };

describe('les applications complètes de la page Exemples', () => {
  for (const a of APPLICATIONS as Application[]) {
    it(`« ${a.fichier} » compile, et chaque cible annoncée l'accepte`, () => {
      const { application, diagnostics } = compiler(lireApplication(a.fichier));
      expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message)).toEqual([]);
      // Les mêmes contrôles que « humalis compile », puis le projet de chaque cible.
      for (const cible of a.cibles) {
        const app = pourLaCible(application!, cible);
        const refus = [...verifierFormesPourLaCible(app, cible), ...verifierTempsReelPourLaCible(app, cible, undefined), ...(cible === 'apple' ? [] : verifierAppareilPourLaCible(app, cible))];
        expect(refus.filter((d) => d.gravite === 'erreur').map((d) => d.message), cible).toEqual([]);
        const options = { nom: a.fichier, source: `${a.fichier}.humalis` } as never;
        const produit =
          cible === 'web' ? { diagnostics: [], fichiers: genererProjetMoteur(app, options) }
          : cible === 'desktop' ? { diagnostics: [], fichiers: genererProjetDesktop(app, options) }
          : cible === 'apple' ? genererProjetApple(app, options)
          : cible === 'android' ? genererProjetAndroid(app, options)
          : genererProjetWindows(app, options);
        expect(produit.diagnostics.filter((d: { gravite: string }) => d.gravite === 'erreur').map((d: { message: string }) => d.message), cible).toEqual([]);
        expect(produit.fichiers.size, cible).toBeGreaterThan(0);
      }
    });
  }

  it('la page est à jour', () => {
    expect(() => execFileSync('node', ['scripts/exemples-site.mjs', '--verifier'], { cwd: racine, stdio: 'pipe' })).not.toThrow();
  });
});
