// Écrit src/cibles/commun/graphique/moteur.ts : le moteur des graphiques (le texte de textes.ts) en module, pour que
// le compilateur l'exécute sans évaluer de texte. « npm run moteur-graphique » après un changement de textes.ts.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GEOMETRIE_JS, HTML_GRAPHIQUE_JS } from '../src/cibles/commun/graphique/textes.ts';

export function produireMoteurGraphique() {
  return `// @ts-nocheck\n// Produit par scripts/generer-moteur-graphique.mjs depuis textes.ts (npm run moteur-graphique) : ne pas modifier à la main.\n${GEOMETRIE_JS}\n${HTML_GRAPHIQUE_JS}\nexport { calculerGraphique, graduations, htmlDuGraphique, PALETTE_GRAPHIQUE };\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(process.argv[1], 'file://'))) {
  writeFileSync(new URL('../src/cibles/commun/graphique/moteur.ts', import.meta.url), produireMoteurGraphique());
}
