import type { DeclarationVariable, Boucle } from '../parser/ast.js';
import type { TypeValeur } from './types.js';

export interface Symbole {
  nom: string;
  ligne: number;
  type: TypeValeur;
  /** La déclaration d'origine, pour préciser son type plus tard (liste vide). */
  origine?: DeclarationVariable | Boucle;
}

/**
 * Les variables visibles à un endroit du programme : une portée pour la
 * page, puis une par bloc ouvert (si, pour chaque, quand).
 */
export class Portees {
  private readonly pile: Map<string, Symbole>[] = [];

  ouvrir(): void {
    this.pile.push(new Map());
  }

  fermer(): void {
    this.pile.pop();
  }

  chercher(nom: string): Symbole | undefined {
    for (let i = this.pile.length - 1; i >= 0; i--) {
      const symbole = this.pile[i].get(nom);
      if (symbole) return symbole;
    }
    return undefined;
  }

  nomsVisibles(): string[] {
    return [...new Set(this.pile.flatMap((portee) => [...portee.keys()]))];
  }

  /** Ajoute un symbole déjà construit (une variable partagée) à la portée courante. */
  declarerSymbole(symbole: Symbole): void {
    this.pile[this.pile.length - 1].set(symbole.nom, symbole);
  }

  /** Déclare dans la portée courante ; renvoie le symbole déjà visible, s'il existe. */
  declarer(symbole: Symbole): Symbole | undefined {
    const existant = this.chercher(symbole.nom);
    if (!existant) this.pile[this.pile.length - 1].set(symbole.nom, symbole);
    return existant;
  }
}
