import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from './aide-qualite.js';

describe('compiler', () => {
  it('produit une application sans diagnostic pour un programme correct', () => {
    const resultat = compiler(readFileSync('exemples/connexion.humalis', 'utf8'));
    expect(resultat.diagnostics).toEqual([]);
    expect(resultat.application?.ecrans.map((e) => e.nom)).toEqual(['connexion']);
  });

  it('garde les avertissements et produit quand même l’application', () => {
    const resultat = compiler('page "a" :\n    lien "Plus" vers "apropos"');
    expect(resultat.diagnostics).toEqual([
      { gravite: 'avertissement', message: "la page « apropos » n'existe pas dans ce fichier.", ligne: 2 },
    ]);
    expect(resultat.application).toBeDefined();
  });

  it('compile la boutique et son panier sans diagnostic', () => {
    const resultat = compiler(readFileSync('exemples/boutique.humalis', 'utf8'));
    expect(resultat.diagnostics).toEqual([]);
    expect(resultat.application?.ecrans.map((e) => e.nom)).toEqual(['boutique', 'panier']);
  });

  it('transforme une erreur du lexer en diagnostic, avec sa colonne', () => {
    expect(compiler('page "a :')).toEqual({
      diagnostics: [
        { gravite: 'erreur', message: 'chaîne de caractères non fermée (guillemet manquant)', ligne: 1, colonne: 6 },
      ],
    });
  });

  it('transforme une erreur du parser en diagnostic', () => {
    const resultat = compiler('page "a" :\n    bonjour');
    expect(resultat.application).toBeUndefined();
    expect(resultat.diagnostics).toEqual([
      { gravite: 'erreur', message: 'instruction inconnue : « bonjour »', ligne: 2 },
    ]);
  });

  it('renvoie toutes les erreurs d’analyse, sans application', () => {
    const resultat = compiler('page "a" :\n    texte x\n    texte y');
    expect(resultat.application).toBeUndefined();
    expect(resultat.diagnostics.map((d) => d.ligne)).toEqual([2, 3]);
  });
});
