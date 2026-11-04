import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, sep } from 'node:path';
import { compilerProjet } from '../../../src/fichiers.js';
import { principalQuiUtilise, type Lister } from './langage/projet.js';

export { principalQuiUtilise, type Lister };

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

/** Les fichiers d'un dossier ; aucun s'il est illisible. */
export const listerSurLeDisque: Lister = (dossier) => {
  try {
    return readdirSync(dossier);
  } catch {
    return [];
  }
};

/**
 * Le compilateur renvoie toutes les erreurs (lexer, parser, analyse) et les
 * avertissements, déjà sans le préfixe « Ligne n : ». Avec le chemin du
 * document, il lit aussi les fichiers que celui-ci utilise (par `lire`) ;
 * une faute dans l'un d'eux est montrée en haut du document, avec son
 * fichier et sa ligne.
 */
export const verifierAvec = (lire: (chemin: string) => string | undefined, lister: Lister = listerSurLeDisque): Verification => (source, chemin) => {
  // Un fichier utilisé par un autre se vérifie dans ce projet : ses langues, son CSS, ses variables partagées sont connus.
  const racine = chemin === undefined ? undefined : principalQuiUtilise(chemin, lire, lister);
  if (racine !== undefined && chemin !== undefined) {
    const lireAvecLeDocument = (c: string) => (c === chemin ? source : lire(c));
    const ici = relative(dirname(racine), chemin).split(sep).join('/');
    return compilerProjet(racine, lireAvecLeDocument).diagnostics
      .filter((d) => d.fichier === ici)
      .map(({ ligne, colonne, message, gravite }) => (colonne === undefined ? { ligne, message, gravite } : { ligne, colonne, message, gravite }));
  }
  return compilerProjet(chemin, chemin === undefined ? () => undefined : lire, source).diagnostics.map(
    ({ ligne, colonne, message, gravite, fichier }) =>
      fichier !== undefined
        ? { ligne: 1, message: `dans ${fichier}, ligne ${ligne} : ${message}`, gravite }
        : colonne === undefined
          ? { ligne, message, gravite }
          : { ligne, colonne, message, gravite },
  );
};

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
