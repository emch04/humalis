import { readFileSync, statSync } from 'node:fs';
import { compilerProjet } from '../../../src/fichiers.js';

export interface DiagnosticHumalis {
  /** Numéro de ligne, à partir de 1, comme dans le compilateur. */
  ligne: number;
  /** Numéro de colonne, à partir de 1, quand le compilateur le donne. */
  colonne?: number;
  message: string;
  gravite: 'erreur' | 'avertissement';
}

/** Ce que l'extension demande au compilateur : la liste des diagnostics. */
export type Verification = (source: string, chemin?: string) => DiagnosticHumalis[];

/** Lit un fichier utilisé (« utiliser fichier "…" ») sur le disque ; undefined s'il n'existe pas. */
export const lireSurLeDisque = (chemin: string) => {
  try {
    return statSync(chemin).isFile() ? readFileSync(chemin, 'utf8') : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Le compilateur renvoie toutes les erreurs (lexer, parser, analyse) et les
 * avertissements, déjà sans le préfixe « Ligne n : ». Avec le chemin du
 * document, il lit aussi les fichiers que celui-ci utilise (par `lire`) ;
 * une faute dans l'un d'eux est montrée en haut du document, avec son
 * fichier et sa ligne.
 */
export const verifierAvec = (lire: (chemin: string) => string | undefined): Verification => (source, chemin) =>
  compilerProjet(chemin, chemin === undefined ? () => undefined : lire, source).diagnostics.map(
    ({ ligne, colonne, message, gravite, fichier }) =>
      fichier !== undefined
        ? { ligne: 1, message: `dans ${fichier}, ligne ${ligne} : ${message}`, gravite }
        : colonne === undefined
          ? { ligne, message, gravite }
          : { ligne, colonne, message, gravite },
  );

/** La vérification de l'extension : les fichiers utilisés sont lus sur le disque. */
export const verifierSource: Verification = verifierAvec(lireSurLeDisque);

/**
 * Transforme une source Humalis en liste de diagnostics. Fonction pure,
 * sans VS Code : c'est elle que testent les tests unitaires.
 *
 * `compiler()` ne lève jamais d'exception pour une faute du programme.
 * Une exception est donc un bug du compilateur : elle est montrée, jamais
 * avalée.
 */
export function versDiagnostics(
  source: string,
  verifier: Verification = verifierSource,
  chemin?: string,
): DiagnosticHumalis[] {
  try {
    return verifier(source, chemin);
  } catch (erreur) {
    const detail = erreur instanceof Error ? erreur.message : String(erreur);
    return [
      {
        ligne: 1,
        message: `erreur interne du compilateur, merci de la signaler : ${detail}`,
        gravite: 'erreur',
      },
    ];
  }
}
