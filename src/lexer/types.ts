export type TokenType =
  | 'MOT_CLE'
  | 'IDENTIFIANT'
  | 'CHAINE'
  | 'NOMBRE'
  | 'BOOLEEN'
  /** Un mot de liaison (« le », « à », « l' ») : marqué, puis sauté par le parser. */
  | 'LIAISON'
  /** Le contenu d'un bloc « style : », recopié tel quel. */
  | 'CSS'
  | 'CODE_BRUT'
  | 'PONCTUATION'
  | 'INDENT'
  | 'DEDENT'
  | 'FIN_LIGNE'
  | 'FIN_FICHIER';

export interface PartieChaine {
  type: 'texte' | 'variable' | 'accent' | 'code';
  valeur: string;
}

export interface Token {
  type: TokenType;
  valeur: string;
  ligne: number;
  colonne: number;
  parties?: PartieChaine[];
  /** Mots-clés seulement : vrai s'il est réservé partout (voir motsCles.ts). */
  reserve?: boolean;
  /** Mots-clés, mots de liaison et mots collés : le mot tel qu'il est écrit. */
  original?: string;
}

export class ErreurLexicale extends Error {
  constructor(
    message: string,
    public ligne: number,
    public colonne: number,
  ) {
    super(`Ligne ${ligne} : ${message}`);
    this.name = 'ErreurLexicale';
  }
}
