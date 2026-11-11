import { repereLigne } from '../lignes-humalis.js';

/** Écrit du Kotlin ligne par ligne, avec l'indentation habituelle de Kotlin (4 espaces). */
export class EcrivainKotlin {
  private readonly lignes: string[] = [];
  private niveau = 0;
  private repereEnAttente = '';

  /** La ligne Humalis du code qui suit (voir lignes-humalis.ts : la table HumalisLignes.kt). */
  repere(ligne: number | undefined): this {
    this.repereEnAttente = repereLigne(ligne);
    return this;
  }

  ligne(texte = ''): this {
    if (texte === '') {
      this.lignes.push('');
      return this;
    }
    this.lignes.push('    '.repeat(this.niveau) + this.repereEnAttente + texte);
    this.repereEnAttente = '';
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
