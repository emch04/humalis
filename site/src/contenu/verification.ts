import { compiler } from '../../../src/compilateur';
import { compilerProjet } from '../../../src/fichiers';
import type { ProjetExemple } from './projets';
import type { Diagnostic } from '../../../src/analyse/erreurs';
import { verifierPourLeWeb } from '../../../src/cibles/web/projet';

/**
 * Un fragment (instructions sans page) est placé dans une page, pour la
 * vérification seulement. C'est la même règle que `envelopper` dans
 * `tests/exemples-doc.test.ts` du compilateur.
 */
export function envelopper(code: string): string {
  return 'page "exemple" :\n' + code.split('\n').map((l) => (l.trim() ? `    ${l}` : l)).join('\n');
}

/** Tous les diagnostics du compilateur sur un programme. Ne lève jamais pour une faute du programme. */
export function diagnostiquer(source: string): Diagnostic[] {
  return compiler(source).diagnostics;
}

/**
 * Tous les diagnostics d'un projet en plusieurs fichiers : le premier fichier
 * est le principal, les autres sont lus sur un disque en mémoire.
 */
export function diagnostiquerProjet(projet: ProjetExemple): Diagnostic[] {
  const disque = new Map(projet.fichiers.map((f) => [f.nom, f.code]));
  const principal = projet.fichiers[0];
  return compilerProjet(principal.nom, (chemin) => disque.get(chemin), principal.code).diagnostics;
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

/**
 * Ce que la cible web refuse alors que le langage l'accepte (par exemple
 * « memorisee en secret »). Les messages sont ceux de `verifierPourLeWeb`,
 * le vrai contrôle de `humalis compile`. Vide si le programme a des erreurs.
 */
export function refusesPourLeWeb(source: string): Diagnostic[] {
  const { application } = compiler(source);
  return application ? verifierPourLeWeb(application) : [];
}
