import type { Instruction, Programme } from '../parser/ast.js';
import type { Diagnostic } from './erreurs.js';
import { MOTS_CONTEXTUELS, formeCanonique } from '../lexer/motsCles.js';

/**
 * Décision Q14 du plan du vocabulaire : une variable peut porter le nom
 * d'un mot du langage (`variable titre = …`), mais l'analyse le signale
 * par un avertissement doux, jamais par une erreur.
 *
 * Seuls les mots-clés contextuels comptent (éléments, actions,
 * comparaisons…) : les noms d'options comme `nom` ou `couleur` ne valent
 * qu'après « avec » et ne prêtent pas à confusion.
 */
export function avertirNomsDuLangage(programme: Programme): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const avertir = (nom: string, ligne: number) => {
    const canonique = formeCanonique(nom);
    if (canonique && MOTS_CONTEXTUELS.has(canonique)) {
      diagnostics.push({
        gravite: 'avertissement',
        message: `la variable « ${nom} » porte le nom d'un mot du langage ; c'est permis, mais cela peut prêter à confusion.`,
        ligne,
      });
    }
  };

  const parcourir = (instructions: Instruction[]) => {
    for (const instruction of instructions) {
      switch (instruction.type) {
        case 'Variable':
          avertir(instruction.nom, instruction.ligne);
          break;
        case 'Boucle':
          avertir(instruction.variable, instruction.ligne);
          parcourir(instruction.corps);
          break;
        case 'Condition':
          parcourir(instruction.alors);
          parcourir(instruction.sinon);
          break;
        case 'Evenement':
        case 'Formulaire':
        case 'Bloc':
          parcourir(instruction.corps);
          break;
      }
    }
  };

  for (const page of programme.pages) parcourir(page.corps);
  return diagnostics;
}
