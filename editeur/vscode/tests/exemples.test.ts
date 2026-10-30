import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { racine, colorier, porteeDe } from './aide-grammaire.js';
import * as motsCles from '../../../src/lexer/motsCles.js';

const dossierExemples = join(racine, '..', '..', 'exemples');
const exemples = readdirSync(dossierExemples).filter((f) => f.endsWith('.humalis'));

describe('grammaire sur les exemples', () => {
  it('trouve les exemples du dépôt', () => {
    expect(exemples.length).toBeGreaterThanOrEqual(2);
  });

  for (const fichier of exemples) {
    it(`${fichier} : chaque mot du vocabulaire est colorié, et rien d'autre`, async () => {
      const source = readFileSync(join(dossierExemples, fichier), 'utf8');
      const lignes = await colorier(source);
      const problemes: string[] = [];

      lignes.forEach((jetons, i) => {
        for (const jeton of jetons) {
          // Les mots d'un texte ou d'un commentaire ne sont pas du vocabulaire.
          const dansTexte = jeton.portees.some((p) => p.startsWith('string.') || p.startsWith('comment.'));
          if (dansTexte) continue;
          for (const mot of jeton.texte.match(/[\p{L}_][\p{L}0-9_]*/gu) ?? []) {
            const canonique = motsCles.formeCanonique(mot);
            const attendu = canonique
              ? canonique === 'vrai' || canonique === 'faux'
                ? 'constant.language.humalis'
                : motsCles.MOTS_RESERVES.has(canonique)
                  ? 'keyword.control.humalis'
                  : 'support.function.humalis'
              : undefined;
            const reel = porteeDe(jeton);
            const estMotColorie =
              reel === 'keyword.control.humalis' ||
              reel === 'support.function.humalis' ||
              reel === 'constant.language.humalis';
            if (attendu && reel !== attendu) {
              problemes.push(`ligne ${i + 1} : « ${mot} » devrait être ${attendu}, trouvé ${reel}`);
            }
            if (!attendu && estMotColorie && !motsCles.estMotLiaison(mot)) {
              problemes.push(`ligne ${i + 1} : « ${mot} » est colorié sans être un mot-clé`);
            }
          }
        }
      });

      expect(problemes).toEqual([]);
    });
  }

  it('boutique.humalis : les portées attendues, ligne par ligne', async () => {
    const source = readFileSync(join(dossierExemples, 'boutique.humalis'), 'utf8');
    const lignes = await colorier(source);
    const portees = (n: number) =>
      lignes[n - 1].filter((j) => porteeDe(j)).map((j) => [j.texte, porteeDe(j)]);
    expect(portees(1)).toContainEqual(['variable', 'keyword.control.humalis']);
    expect(portees(3)).toContainEqual(['page', 'keyword.control.humalis']);
    expect(portees(3)).toContainEqual([':', 'punctuation.separator.humalis']);
    expect(portees(5)).toContainEqual(['0', 'constant.numeric.humalis']);
    expect(portees(6)).toContainEqual(['calcul', 'support.function.humalis']);
    expect(portees(7)).toContainEqual(['titre', 'support.function.humalis']);
    expect(portees(7)).toContainEqual(['avec', 'keyword.control.humalis']);
    expect(portees(9)).toContainEqual(['pour', 'keyword.control.humalis']);
    expect(portees(11)).toContainEqual(['bouton', 'support.function.humalis']);
    expect(portees(13)).toContainEqual(['ajouter', 'support.function.humalis']);
  });
});
