// Recopie les tracés des icônes de Lucide (licence ISC) utilisées par Humalis
// dans src/cibles/icones-donnees.ts, pour le site statique (qui n'a pas de
// « npm install »). À relancer quand on ajoute une icône à
// src/vocabulaire/icones.ts, ou quand on change de version de Lucide.
//
// Lancer : npm run build && node scripts/generer-icones.mjs <dossier de lucide-static>
//   (par exemple le dossier « package » après « npm pack lucide-static » et son extraction)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ICONES } from '../dist/vocabulaire/icones.js';

const source = resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
  console.error('Donnez le dossier de lucide-static (celui qui contient « icons »).');
  process.exit(1);
}
const version = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')).version;

const formes = {};
for (const { lucide } of ICONES) {
  const svg = readFileSync(join(source, 'icons', `${lucide}.svg`), 'utf8');
  const interieur = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/\s*\/>$/, ' />'))
    .join('');
  formes[lucide] = interieur;
}

const lignes = Object.entries(formes).map(([nom, forme]) => `  ${JSON.stringify(nom)}: ${JSON.stringify(forme)},`);
writeFileSync(
  new URL('../src/cibles/icones-donnees.ts', import.meta.url),
  `/**
 * Les tracés des icônes de Humalis, recopiés de Lucide ${version}
 * (https://lucide.dev, licence ISC : voir docs/licences/lucide.md) par
 * \`scripts/generer-icones.mjs\`. Ne pas modifier à la main.
 *
 * C'est du contenu, pas une dépendance : le site statique n'a pas de
 * « npm install », il reçoit donc le dessin des icônes qu'il utilise.
 */
export const FORMES_LUCIDE: Record<string, string> = {
${lignes.join('\n')}
};
`,
);
console.log(`${lignes.length} icônes recopiées de Lucide ${version}.`);
