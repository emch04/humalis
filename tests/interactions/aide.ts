/** Les aides des tests des interactions : compiler, puis produire chaque cible. */
import { expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../src/parser/parser.js';
import { compiler } from '../../src/compilateur.js';
import { genererProjetWeb } from '../../src/cibles/web/projet.js';
import { genererProjetStatique } from '../../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../../src/cibles/mobile/projet.js';
import { genererProjetDesktop } from '../../src/cibles/desktop/projet.js';
import { programme } from '../analyse/aide.js';

export { erreurs, avertissements } from '../analyse/aide.js';

/** Une page « p » dont les lignes commencent par « > » pour l'indentation. */
export const p = (...lignes: string[]) => programme('page "p" :', ...lignes);
/** Une page avec un bouton « Go » et son clic, qui contient `lignes` (indentées de deux « > » de plus). */
export const auClic = (lignes: string[], avant: string[] = []) =>
  p(...avant, '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', ...lignes.map((l) => `>>${l}`));

export const corps = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;
export const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
export const web = (source: string) => genererProjetWeb(compile(source), { nom: 'e', source: 'e.humalis' });
export const statique = (source: string) => genererProjetStatique(compile(source), { nom: 'e', source: 'e.humalis' });
export const mobile = (source: string) => genererProjetMobile(compile(source), { nom: 'e', source: 'e.humalis' });
export const desktop = (source: string) => genererProjetDesktop(compile(source), { nom: 'e', source: 'e.humalis' });
/** Le fichier dont le nom finit par `fin` (« pages/P.tsx », « p.js »). */
export const fichier = (fichiers: Map<string, string>, fin: string) => [...fichiers.entries()].find(([n]) => n.endsWith(fin))?.[1] ?? '';
