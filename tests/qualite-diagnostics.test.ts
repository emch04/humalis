import { expect, it } from 'vitest';
import { appliquerExigence, resumerQualite } from '../src/analyse/diagnosticsQualite.js';
import type { Diagnostic } from '../src/analyse/erreurs.js';

it('garde les anciens diagnostics identiques et ne durcit que la qualité', () => {
  const diagnostics: Diagnostic[] = [
    { gravite: 'avertissement', ligne: 1, message: 'ancien' },
    { gravite: 'avertissement', categorie: 'accessibilite', ligne: 2, message: 'image' },
  ];
  expect(appliquerExigence(diagnostics, false)).toBe(diagnostics);
  expect(appliquerExigence(diagnostics, true)).toEqual([
    diagnostics[0], { ...diagnostics[1], gravite: 'erreur' },
  ]);
  expect(diagnostics[1].gravite).toBe('avertissement');
});

it('résume les catégories présentes, sans modifier les anciens messages', () => {
  expect(resumerQualite([
    { gravite: 'avertissement', ligne: 1, message: 'ancien' },
    { gravite: 'avertissement', categorie: 'accessibilite', ligne: 2, message: 'image' },
    { gravite: 'avertissement', categorie: 'traduction', ligne: 3, message: 'texte' },
    { gravite: 'avertissement', categorie: 'traduction', ligne: 4, message: 'texte' },
  ])).toBe('1 avertissement d’accessibilité, 2 avertissements de traduction.');
  expect(resumerQualite([{ gravite: 'erreur', categorie: 'publication', ligne: 5, message: 'adresse' }])).toBeUndefined();
});
