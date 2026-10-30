export interface Diagnostic {
  gravite: 'erreur' | 'avertissement';
  /** Famille facultative des vérifications de qualité et de publication. */
  categorie?: 'accessibilite' | 'publication' | 'traduction' | 'surveillance';
  /** Le message seul, sans le préfixe « Ligne n : ». */
  message: string;
  ligne: number;
  /** Donnée par le lexer seulement. */
  colonne?: number;
  /** Le fichier utilisé (« panier.humalis ») ; absent pour le fichier principal. */
  fichier?: string;
}

/** Toutes les erreurs d'analyse d'un programme, levées en une fois. */
export class ErreurAnalyse extends Error {
  diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.map((d) => `Ligne ${d.ligne} : ${d.message}`).join('\n'));
    this.name = 'ErreurAnalyse';
    this.diagnostics = diagnostics;
  }
}
