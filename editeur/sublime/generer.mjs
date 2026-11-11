/**
 * Écrit Humalis/Humalis.tmLanguage, la grammaire de coloration de Sublime
 * Text, depuis celle de l'extension VS Code
 * (editeur/vscode/syntaxes/humalis.tmLanguage.json, elle-même tirée du
 * vocabulaire du compilateur). Sublime lit ce format (plist XML) tel quel.
 *
 *     node editeur/sublime/generer.mjs              # écrit
 *     node editeur/sublime/generer.mjs --verifier   # dit seulement si c'est à jour
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const source = join(ici, '..', 'vscode', 'syntaxes', 'humalis.tmLanguage.json');
const sortie = join(ici, 'Humalis', 'Humalis.tmLanguage');

const echapper = (texte) => texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function valeur(v, retrait) {
  const r = '\t'.repeat(retrait);
  if (Array.isArray(v)) return `${r}<array>\n${v.map((e) => valeur(e, retrait + 1)).join('')}${r}</array>\n`;
  if (v !== null && typeof v === 'object') {
    const cles = Object.keys(v).filter((c) => c !== '$schema');
    return `${r}<dict>\n${cles.map((c) => `${r}\t<key>${echapper(c)}</key>\n${valeur(v[c], retrait + 1)}`).join('')}${r}</dict>\n`;
  }
  return `${r}<string>${echapper(String(v))}</string>\n`;
}

/**
 * Le moteur d'expressions de Sublime refuse les regards en arrière de
 * longueur variable (« (?<=^[ ]*) »), que VS Code accepte : la grammaire
 * entière serait rejetée. On les remplace par la même suite, prise dans la
 * correspondance (« (?:^[ ]*) ») : seuls des espaces en début de ligne
 * prennent en plus la couleur de la tournure, ce qui ne se voit pas.
 */
function pourSublime(valeur) {
  if (typeof valeur === 'string') return valeur.replace(/\(\?<=\^\[ \]\*/g, '(?:^[ ]*');
  if (Array.isArray(valeur)) return valeur.map(pourSublime);
  if (valeur && typeof valeur === 'object') return Object.fromEntries(Object.entries(valeur).map(([c, v]) => [c, pourSublime(v)]));
  return valeur;
}

const grammaire = pourSublime(JSON.parse(readFileSync(source, 'utf8')));
grammaire.fileTypes = ['humalis'];
const texte = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Fichier produit par editeur/sublime/generer.mjs depuis la grammaire de l'extension VS Code : ne pas le modifier à la main. -->
<plist version="1.0">
${valeur(grammaire, 0)}</plist>
`;

if (process.argv.includes('--verifier')) {
  if (!existsSync(sortie) || readFileSync(sortie, 'utf8') !== texte) {
    console.error('Humalis.tmLanguage n’est plus à jour : lancez « node editeur/sublime/generer.mjs ».');
    process.exit(1);
  }
  console.error('Humalis.tmLanguage est à jour.');
} else {
  writeFileSync(sortie, texte);
  console.error('Humalis.tmLanguage écrit.');
}
