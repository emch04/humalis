/**
 * Les outils ne plantent jamais : à chaque position de chaque exemple, et
 * sur chaque exemple coupé au milieu d'une ligne (comme pendant la frappe).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lireProjet } from '../src/langage/projet.js';
import { indexer } from '../src/langage/portees.js';
import { survoler } from '../src/langage/survol.js';
import { definir } from '../src/langage/definition.js';
import { completer } from '../src/langage/completion.js';
import { symbolesDuDocument } from '../src/langage/symboles.js';
import { jetonsSemantiques } from '../src/langage/semantique.js';
import { dossierExemples, exemple } from './aide-langage.js';

const exemples = readdirSync(dossierExemples).filter((f) => f.endsWith('.humalis'));

describe('robustesse des outils d’éditeur', () => {
  for (const nom of exemples) {
    it(`${nom} : survol, définition et complétion à chaque position`, () => {
      const source = exemple(nom);
      const chemin = join(dossierExemples, nom);
      const lire = (c: string) => {
        try {
          return readFileSync(c, 'utf8');
        } catch {
          return undefined;
        }
      };
      const index = indexer(lireProjet(source, chemin, lire));
      expect(symbolesDuDocument(index).length).toBeGreaterThan(0);
      jetonsSemantiques(index);
      const lignes = source.split('\n');
      lignes.forEach((texte, i) => {
        const pourCompleter = indexer(lireProjet(source, chemin, lire, [i + 1]));
        for (let c = 1; c <= texte.length + 1; c++) {
          survoler(index, i + 1, c);
          definir(index, i + 1, c);
          completer(pourCompleter, i + 1, c);
        }
      });
    });

    it(`${nom} : coupé au milieu de chaque ligne, rien ne plante`, () => {
      const lignes = exemple(nom).split('\n');
      lignes.forEach((texte, i) => {
        const coupe = [...lignes.slice(0, i), texte.slice(0, Math.ceil(texte.length / 2)), ...lignes.slice(i + 1)].join('\n');
        const index = indexer(lireProjet(coupe));
        symbolesDuDocument(index);
        jetonsSemantiques(index);
        survoler(index, i + 1, Math.ceil(texte.length / 2));
        definir(index, i + 1, Math.ceil(texte.length / 2));
      });
    });
  }
});
