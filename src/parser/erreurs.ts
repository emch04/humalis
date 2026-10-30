export class ErreurSyntaxique extends Error {
  constructor(
    message: string,
    public ligne: number,
  ) {
    super(`Ligne ${ligne} : ${message}`);
    this.name = 'ErreurSyntaxique';
  }
}
