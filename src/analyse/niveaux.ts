/**
 * Le niveau automatique des sous-titres : un « soustitre » écrit sans « avec niveau » prend un niveau
 * de plus que le dernier titre ou sous-titre du bloc qui l'entoure. Une carte placée sous le
 * sous-titre d'une section reçoit ainsi un <h3>. Une condition, une boucle ou un formulaire ne
 * comptent pas comme un bloc : leurs sous-titres restent au niveau de ce qui les entoure.
 * Seul un niveau différent de 2 (celui par défaut) est écrit dans l'arbre.
 */
import type { Instruction } from '../parser/ast.js';

export function niveauxDesSousTitres(instructions: Instruction[], parent = 1): void {
  let dernier = parent;
  const parcourir = (enfants: Instruction[]) => {
    for (const instruction of enfants) {
      if (instruction.type === 'Element' && instruction.element === 'titre') dernier = 1;
      else if (instruction.type === 'Element' && instruction.element === 'soustitre') {
        if (instruction.niveau === undefined) {
          const niveau = Math.min(parent + 1, 6);
          if (niveau !== 2) instruction.niveau = niveau;
          dernier = niveau;
        } else dernier = instruction.niveau;
      } else if (instruction.type === 'Bloc') niveauxDesSousTitres(instruction.corps, dernier);
      else {
        // Les branches d'une condition, le corps d'une boucle ou d'un formulaire : le même niveau.
        for (const cle of ['corps', 'alors', 'sinon'] as const) {
          const suite = (instruction as Partial<Record<typeof cle, Instruction[]>>)[cle];
          if (Array.isArray(suite) && instruction.type !== 'Evenement') parcourir(suite);
        }
        if (instruction.type === 'Selon') for (const cas of instruction.cas) parcourir(cas.corps);
      }
    }
  };
  parcourir(instructions);
}
