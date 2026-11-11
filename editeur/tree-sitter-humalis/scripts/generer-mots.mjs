/**
 * Écrit mots.json, les mots du langage que grammar.js colore, depuis le
 * compilateur construit (dist/lexer/motsCles.js, après « npm run build » à
 * la racine du dépôt), et les mêmes listes dans le mode Emacs
 * (editeur/emacs/humalis-mode.el, entre « <mots> » et « </mots> »). Les
 * mots ne sont jamais écrits à la main : un mot ajouté au vocabulaire est
 * coloré dès la grammaire régénérée. Avec --verifier : ne fait que dire si
 * tout est à jour.
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

const cheminEmacs = join(ici, '..', 'emacs', 'humalis-mode.el');
const listeEmacs = (liste) => liste.map((m) => JSON.stringify(m)).join(' ');
const blocEmacs = [
  ';; <mots>',
  '(defconst humalis--mots-reserves',
  `  '(${listeEmacs(mots.reserves)}))`,
  '(defconst humalis--mots-contextuels',
  `  '(${listeEmacs(mots.contextuels)}))`,
  `(defconst humalis--constantes '(${listeEmacs(mots.constantes)}))`,
  ';; </mots>',
].join('\n');
const emacs = readFileSync(cheminEmacs, 'utf8');
const emacsAJour = emacs.replace(/;; <mots>[\s\S]*?;; <\/mots>/, blocEmacs);

const fichiers = [[chemin, texte], [cheminEmacs, emacsAJour]];
if (process.argv.includes('--verifier')) {
  const enRetard = fichiers.filter(([c, t]) => !existsSync(c) || readFileSync(c, 'utf8') !== t);
  if (enRetard.length > 0) {
    console.error(`Pas à jour avec le vocabulaire : ${enRetard.map(([c]) => c).join(', ')}. Lancez « npm run mots && npm run generer ».`);
    process.exit(1);
  }
  console.error('Les mots de la grammaire et du mode Emacs sont à jour.');
} else {
  for (const [c, t] of fichiers) writeFileSync(c, t);
  console.error(`mots.json et humalis-mode.el : ${mots.reserves.length} mots réservés, ${mots.contextuels.length} contextuels.`);
}
