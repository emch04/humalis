/**
 * Écrit mots.json, les mots du langage que grammar.js colore, depuis le
 * compilateur construit (dist/lexer/motsCles.js, après « npm run build » à
 * la racine du dépôt). Les mots ne sont jamais écrits à la main : un mot
 * ajouté au vocabulaire est coloré dès la grammaire régénérée.
 *
 *     npm run mots && npm run generer
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ici = join(dirname(fileURLToPath(import.meta.url)), '..');
const motsCles = join(ici, '..', '..', 'dist', 'lexer', 'motsCles.js');
if (!existsSync(motsCles)) {
  console.error('dist/lexer/motsCles.js est absent : lancez d’abord « npm run build » à la racine du dépôt.');
  process.exit(1);
}
const { MOTS_RESERVES, MOTS_CONTEXTUELS, VARIANTES } = await import(pathToFileURL(motsCles).href);

const CONSTANTES = new Set(['vrai', 'faux']);
const avecVariantes = (mots) => {
  const formes = new Set(mots);
  for (const [variante, canonique] of VARIANTES) if (formes.has(canonique)) formes.add(variante);
  return [...formes].sort();
};

const mots = {
  reserves: avecVariantes([...MOTS_RESERVES].filter((m) => !CONSTANTES.has(m))),
  contextuels: avecVariantes([...MOTS_CONTEXTUELS]),
  constantes: [...CONSTANTES].sort(),
};
const chemin = join(ici, 'mots.json');
const texte = `${JSON.stringify(mots, null, 2)}\n`;
const avant = existsSync(chemin) ? readFileSync(chemin, 'utf8') : '';
if (process.argv.includes('--verifier')) {
  if (avant !== texte) {
    console.error('mots.json n’est plus à jour avec le vocabulaire : lancez « npm run mots && npm run generer ».');
    process.exit(1);
  }
  console.error('mots.json est à jour.');
} else {
  writeFileSync(chemin, texte);
  console.error(`mots.json : ${mots.reserves.length} mots réservés, ${mots.contextuels.length} contextuels.`);
}
