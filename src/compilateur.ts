import { compilerProjet, type ResultatCompilation } from './fichiers.js';

export type { ResultatCompilation };

/**
 * Enchaîne lexer, parser, analyse et représentation intermédiaire pour un
 * programme d'un seul fichier. Une faute dans le programme ne lève jamais
 * d'exception : elle devient un diagnostic. Seul un bug du compilateur
 * lui-même est levé. Pour un projet en plusieurs fichiers (« utiliser
 * fichier "…" »), voir compilerProjet dans src/fichiers.ts.
 */
export function compiler(source: string): ResultatCompilation {
  const { application, diagnostics } = compilerProjet(undefined, () => undefined, source);
  return application ? { application, diagnostics } : { diagnostics };
}
