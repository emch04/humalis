/**
 * Le niveau automatique des sous-titres : un « soustitre » écrit sans « avec niveau » prend un niveau
 * de plus que le dernier titre ou sous-titre du bloc qui l'entoure. Une carte placée sous le
 * sous-titre d'une section reçoit ainsi un <h3>. Une condition, une boucle ou un formulaire ne
 * comptent pas comme un bloc : leurs sous-titres restent au niveau de ce qui les entoure.
 * Seul un niveau différent de 2 (celui par défaut) est écrit dans l'arbre.
 *
 * La règle de la section : dans un bloc « section : », le premier sous-titre (où qu'il soit,
 * même rangé dans un bloc d'en-tête) est le titre de la section ; tous les autres sous-titres
 * de la section descendent d'au moins un niveau sous lui.
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
      } else if (instruction.type === 'Bloc' && instruction.genre === 'section') niveauxDeLaSection(instruction.corps, dernier);
      else if (instruction.type === 'Bloc') niveauxDesSousTitres(instruction.corps, dernier);
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

/** Les sous-titres d'un arbre d'instructions, dans l'ordre de lecture. */
function sousTitres(instructions: Instruction[], vus: Extract<Instruction, { type: 'Element' }>[] = []): Extract<Instruction, { type: 'Element' }>[] {
  for (const instruction of instructions) {
    if (instruction.type === 'Element' && instruction.element === 'soustitre') vus.push(instruction);
    if (instruction.type === 'Evenement') continue;
    for (const cle of ['corps', 'alors', 'sinon'] as const) {
      const suite = (instruction as Partial<Record<typeof cle, Instruction[]>>)[cle];
      if (Array.isArray(suite)) sousTitres(suite, vus);
    }
    if (instruction.type === 'Selon') for (const cas of instruction.cas) sousTitres(cas.corps, vus);
  }
  return vus;
}

/** Une « section » : son premier sous-titre la titre, les autres descendent d'un niveau au moins. */
function niveauxDeLaSection(corps: Instruction[], parent: number): void {
  const tous = sousTitres(corps);
  const automatiques = new Set(tous.filter((t) => t.niveau === undefined));
  niveauxDesSousTitres(corps, parent);
  const [premier, ...autres] = tous;
  if (!premier) return;
  const sousLaSection = Math.min((premier.niveau ?? 2) + 1, 6);
  for (const titre of autres) {
    if (automatiques.has(titre) && (titre.niveau ?? 2) < sousLaSection) titre.niveau = sousLaSection;
  }
}
