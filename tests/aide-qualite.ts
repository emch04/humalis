import { compiler as compilerActuel } from '../src/compilateur.js';
import { compilerProjet as compilerProjetActuel } from '../src/fichiers.js';

/** Les essais antérieurs vérifient leurs propres diagnostics ; la nouvelle catégorie a sa suite dédiée. */
export function compiler(...args: Parameters<typeof compilerActuel>): ReturnType<typeof compilerActuel> {
  const resultat = compilerActuel(...args);
  return { ...resultat, diagnostics: resultat.diagnostics.filter((d) => d.categorie !== 'accessibilite') };
}

export function compilerProjet(...args: Parameters<typeof compilerProjetActuel>): ReturnType<typeof compilerProjetActuel> {
  const resultat = compilerProjetActuel(...args);
  return { ...resultat, diagnostics: resultat.diagnostics.filter((d) => d.categorie !== 'accessibilite') };
}
