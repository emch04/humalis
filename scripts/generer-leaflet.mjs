// Écrit src/cibles/statique/leaflet-donnees.ts à partir d'une copie de Leaflet 1.9.4.
//
//   npm install leaflet@1.9.4 --prefix /chemin/vers/un/dossier/vide
//   node scripts/generer-leaflet.mjs /chemin/vers/un/dossier/vide/node_modules/leaflet
//
// C'est du contenu, pas une dépendance du compilateur : le site statique n'a pas
// de « npm install », il reçoit ces deux fichiers tels quels (licence BSD-2-Clause :
// docs/licences/leaflet.md). Seul le commentaire final qui renvoie à la carte
// des sources (leaflet.js.map, non recopiée) est retiré.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dossier = process.argv[2];
if (!dossier) {
  console.error('Donnez le dossier de Leaflet : node scripts/generer-leaflet.mjs .../node_modules/leaflet');
  process.exit(1);
}
const paquet = JSON.parse(readFileSync(join(dossier, 'package.json'), 'utf8'));
if (paquet.version !== '1.9.4') {
  console.error(`Leaflet ${paquet.version} : ce script recopie la version 1.9.4 épinglée.`);
  process.exit(1);
}
const js = readFileSync(join(dossier, 'dist', 'leaflet.js'), 'utf8').replace(/\n?\/\/# sourceMappingURL=.*\s*$/, '\n');
const css = readFileSync(join(dossier, 'dist', 'leaflet.css'), 'utf8');

writeFileSync(
  new URL('../src/cibles/statique/leaflet-donnees.ts', import.meta.url),
  `/**
 * Leaflet ${paquet.version} (https://leafletjs.com), licence BSD-2-Clause (docs/licences/leaflet.md),
 * recopié par \`scripts/generer-leaflet.mjs\`. Ne pas modifier à la main.
 *
 * C'est du contenu, pas une dépendance : le site statique n'a pas de
 * « npm install », il reçoit donc ces deux fichiers tels quels
 * (humalis/leaflet.js et humalis/leaflet.css) quand une page contient une
 * carte. Aucun CDN : la page n'appelle que ses tuiles. Les images de
 * l'interface de Leaflet (marqueur par défaut, commande des calques) ne sont
 * pas recopiées : Humalis dessine ses repères et n'utilise pas ces commandes.
 */
export const LEAFLET_VERSION = ${JSON.stringify(paquet.version)};
export const LEAFLET_JS: string = ${JSON.stringify(js)};
export const LEAFLET_CSS: string = ${JSON.stringify(css)};
`,
);
console.log(`Leaflet ${paquet.version} recopié : ${js.length} caractères de JavaScript, ${css.length} de CSS.`);
