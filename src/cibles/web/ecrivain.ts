/** Écrit du code ligne par ligne, avec l'indentation (2 espaces). */
export class Ecrivain {
  private readonly lignes: string[] = [];
  private niveau = 0;

  ligne(texte = ''): this {
    this.lignes.push(texte === '' ? '' : '  '.repeat(this.niveau) + texte);
    return this;
  }

  indenter(contenu: () => void): this {
    this.niveau++;
    contenu();
    this.niveau--;
    return this;
  }

  /** Une ouverture, un contenu indenté, une fermeture : `if (…) {`, …, `}`. */
  bloc(ouverture: string, contenu: () => void, fermeture = '}'): this {
    this.ligne(ouverture);
    this.indenter(contenu);
    return this.ligne(fermeture);
  }

  texte(): string {
    return this.lignes.join('\n') + '\n';
  }
}
