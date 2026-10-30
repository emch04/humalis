/**
 * La règle « réduire les animations » (décision M18), vérifiée sur tout le
 * code produit : pour chaque exemple du dépôt et chaque cible qui a du CSS
 * (web, desktop, statique), aucun mouvement hors de
 * `@media (prefers-reduced-motion: no-preference)`. Exception justifiée :
 * la feuille de Leaflet recopiée telle quelle pour le site statique
 * (`humalis/leaflet.css`) : ses trois « transition » ne s'appliquent que sous les
 * classes `leaflet-fade-anim` et `leaflet-zoom-anim`, que la carte ne lui laisse pas
 * poser quand l'appareil demande de réduire les animations (voir
 * `tests/carte-cibles.test.ts` et l'essai dans Chromium).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { compilerProjet } from '../src/fichiers.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { mouvementHorsBloc } from '../src/cibles/commun/mouvement.js';

const lire = (chemin: string) => {
  try {
    return readFileSync(`exemples/${chemin}`, 'utf8');
  } catch {
    return undefined;
  }
};

/** Les composants React d'un exemple (vitrine), lus à côté de lui. */
const composants = (chemins: string[]) =>
  new Map(chemins.map((c) => [c, { nom: `${c.split('/').pop()}.tsx`, contenu: readFileSync(`exemples/${c}.tsx`, 'utf8') }]));

const EXEMPLES = readdirSync('exemples').filter((f) => f.endsWith('.humalis'));

describe('réduire les animations : tout le CSS produit', () => {
  for (const exemple of EXEMPLES) {
    it(`${exemple} : aucun mouvement hors du bloc « no-preference » (web, desktop, statique)`, () => {
      const { application } = compilerProjet(exemple, lire);
      expect(application, exemple).toBeDefined();
      const composantsReact = composants(application!.composantsReact.map((c) => c.chemin));
      const projets: [string, Map<string, string>][] = [
        ['web', genererProjetWeb(application!, { nom: 'e', adresse: 'https://x.cd', source: exemple, composantsReact })],
        ['desktop', genererProjetDesktop(application!, { nom: 'e', source: exemple, composantsReact })],
      ];
      // Le choix d'un fichier n'existe pas (encore) en site statique : la commande le refuse.
      const sansFichier = !JSON.stringify(application!.ecrans).includes('"genre":"fichier"');
      if (application!.composantsReact.length === 0 && sansFichier) projets.push(['statique', genererProjetStatique(application!, { nom: 'e', source: exemple })]);
      for (const [cible, fichiers] of projets) {
        for (const [nom, contenu] of fichiers) {
          if (nom.endsWith('.css') && nom !== 'humalis/leaflet.css') expect(mouvementHorsBloc(contenu), `${cible} ${nom}`).toEqual([]);
          if (nom.endsWith('.html')) for (const style of contenu.matchAll(/<style>([\s\S]*?)<\/style>/g)) expect(mouvementHorsBloc(style[1]), `${cible} ${nom}`).toEqual([]);
          // Aucune animation lancée par le script (Web Animations), aucun défilement doux écrit en dur.
          if (/\.(tsx?|js)$/.test(nom)) {
            expect(contenu, `${cible} ${nom}`).not.toMatch(/\.animate\(/);
            expect(contenu, `${cible} ${nom}`).not.toMatch(/behavior:\s*['"]smooth/);
          }
        }
      }
    });
  }
});

describe('le détecteur lui-même', () => {
  it('trouve une animation, une transition, des @keyframes ou un défilement doux hors du bloc', () => {
    expect(mouvementHorsBloc('.a { color: red; animation: x 1s; }')).toEqual(['animation: x 1s']);
    expect(mouvementHorsBloc('.a { transition-duration: 1s }')).toEqual(['transition-duration: 1s']);
    expect(mouvementHorsBloc('@keyframes x { to { opacity: 0; } }')).toEqual(['@keyframes x']);
    expect(mouvementHorsBloc('html { scroll-behavior: smooth; }')).toEqual(['scroll-behavior: smooth']);
    expect(mouvementHorsBloc('@media (prefers-reduced-motion: reduce) { .a { animation: y 1s; } }')).toEqual(['animation: y 1s']);
  });
  it('accepte tout ce qui est dans le bloc, et ignore les commentaires et les variables', () => {
    expect(mouvementHorsBloc('/* animation: x */ .a { --humalis-transition: 1s; }')).toEqual([]);
    expect(mouvementHorsBloc('@media (prefers-reduced-motion: no-preference) { .a { animation: x 1s; } @keyframes x { from { opacity: 0; } } }')).toEqual([]);
  });
});
