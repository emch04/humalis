// Prend le code produit par Humalis et le rend chargeable par Node, sans rien réécrire de sa logique.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

export function preparer(dossier, { serveurJs, directTs, outilsJs }) {
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, 'moteur.js'), 'export const signal = (v) => ({ v });\nexport const nettoyer = () => {};\n');
  writeFileSync(join(dossier, 'outils.js'), 'export const afficherMessage = () => {};\n');
  writeFileSync(join(dossier, 'serveur.mjs'), serveurJs.replace(/import\.meta\.env\.\w+/g, 'undefined').replace(/'\.\/moteur\.js'/g, "'./moteur.js'"));
  writeFileSync(join(dossier, 'direct.mjs'), stripTypeScriptTypes(directTs));
  writeFileSync(join(dossier, 'outils-produit.txt'), outilsJs);
}
