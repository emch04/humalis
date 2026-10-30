import { describe, it, expect } from 'vitest';
import { programme } from '../analyse/aide.js';
import { web, statique, mobile, fichier } from './aide.js';

// Avec un bloc « langues », les textes que Humalis écrit lui-même pour les interactions passent par t().
const DEUX_LANGUES = programme(
  'langues :',
  '>francais',
  '>anglais',
  'page "catalogue" :',
  '>variable produits = ["Robe"]',
  '>variable taches = ["Pain", "Lait"]',
  '>titre "Catalogue" en anglais "Catalogue"',
  '>bouton "Copier" en anglais "Copy"',
  '>quand l\'utilisateur clique sur "Copier" :',
  '>>copier "REY-2026"',
  '>>confirmer "Continuer ?" en anglais "Continue?" :',
  '>>>afficher "Fait" en anglais "Done"',
  '>section avec nom "liste" :',
  '>>pour chaque p dans produits :',
  '>>>texte p',
  '>quand l\'utilisateur arrive en bas de "liste" :',
  '>>ajouter "Pagne" a produits',
  '>pour chaque tache dans taches avec deplacement :',
  '>>texte tache',
);

describe('interactions — deux langues', () => {
  it('web : « Copié », « Fermer le message », les boutons de la question et « Voir plus » suivent la langue', () => {
    const fichiers = web(DEUX_LANGUES);
    expect(fichier(fichiers, 'humalis/presse-papier.ts')).toContain("t({ fr: 'Copié', en: 'Copied' })");
    expect(fichier(fichiers, 'humalis/messages.tsx')).toContain("t({ fr: 'Fermer le message', en: 'Close the message' })");
    expect(fichier(fichiers, 'humalis/confirmation.ts')).toContain("t({ fr: 'Non', en: 'No' })");
    expect(fichier(fichiers, 'humalis/deplacer.ts')).toContain("en: 'Cancelled.'");
    expect(fichier(fichiers, 'pages/Catalogue.tsx')).toContain(">{t({ fr: 'Voir plus', en: 'See more' })}</button>");
  });
  it('mobile : « Monter » et « Descendre » suivent la langue', () => {
    const page = fichier(mobile(DEUX_LANGUES.replace(/>section[\s\S]*?a produits\n/, '')), 'app/index.tsx');
    expect(page).toContain("accessibilityLabel={t({ fr: 'Monter', en: 'Move up' })}");
  });
  it('statique : humalis.js et le bouton « Voir plus »', () => {
    const fichiers = statique(DEUX_LANGUES.replace(/>pour chaque tache dans taches avec deplacement :\n>>texte tache/, '').replace(/ {4}pour chaque tache dans taches avec deplacement :\n {8}texte tache\n?/, ''));
    expect(fichier(fichiers, 'humalis/humalis.js')).toContain("t({ fr: 'Copié', en: 'Copied' })");
    expect(fichier(fichiers, 'pages/catalogue.js')).toContain("t({ fr: 'Voir plus', en: 'See more' })");
  });
  it('sans langues, rien ne change', () => {
    const fichiers = web(DEUX_LANGUES.replace(/langues :\n {4}francais\n {4}anglais\n/, '').replace(/ en anglais "[^"]*"/g, ''));
    expect(fichier(fichiers, 'humalis/presse-papier.ts')).not.toContain('t({');
    expect(fichier(fichiers, 'pages/Catalogue.tsx')).toContain('>Voir plus</button>');
  });
});
