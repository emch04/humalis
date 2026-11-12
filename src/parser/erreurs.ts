export class ErreurSyntaxique extends Error {
  /** Les autres fautes du même fichier : la lecture reprend à l'instruction suivante pour les trouver toutes. */
  autres?: ErreurSyntaxique[];

  constructor(
    message: string,
    public ligne: number,
  ) {
    super(`Ligne ${ligne} : ${message}`);
    this.name = 'ErreurSyntaxique';
  }
}
