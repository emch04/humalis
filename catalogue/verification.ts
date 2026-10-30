/**
 * Les outils du catalogue des erreurs : les diagnostics du compilateur sur un programme,
 * et leur forme affichée (« Ligne N : … »).
 */
import { compiler } from '../src/compilateur';
import type { Diagnostic } from '../src/analyse/erreurs';

/** Tous les diagnostics du compilateur sur un programme. Ne lève jamais pour une faute du programme. */
export function diagnostiquer(source: string): Diagnostic[] {
  return compiler(source).diagnostics;
}

/** « Ligne 3 : la page « a » est déjà déclarée plus haut » */
export function formater(d: Diagnostic): string {
  return `Ligne ${d.ligne} : ${d.message}`;
}

/**
 * Le message réel du compilateur (la première erreur, sinon le premier
 * avertissement), ou null si le programme n'a ni erreur ni avertissement.
 */
export function produireMessage(source: string): string | null {
  const diagnostics = diagnostiquer(source);
  const premier = diagnostics.find((d) => d.gravite === 'erreur') ?? diagnostics[0];
  return premier ? formater(premier) : null;
}
