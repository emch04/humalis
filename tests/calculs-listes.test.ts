import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Plan du langage de base (tâches 1 et 2) : les calculs sur les nombres et les listes.
const NOTES = programme(
  'page "notes" :',
  '>variable notes = [12, 15, 9]',
  '>variable panier = [fiche avec nom "Livre" et prix 12500, fiche avec nom "Stylo" et prix 1500]',
  '>calcul moyenne_notes = moyenne de notes',
  '>calcul meilleure = maximum de notes',
  '>calcul pire = minimum de notes',
  '>calcul total = somme de panier.prix',
  '>calcul arrondie = arrondi de moyenne_notes a 1 chiffres',
  '>calcul entiere = arrondi de moyenne_notes',
  '>texte "Moyenne {arrondie}, de {pire} à {meilleure}, arrondie {entiere}"',
  '>texte "Total {total} FC"',
  '>bouton "Lancer"',
  '>variable tirage = 0',
  '>quand l\'utilisateur clique sur "Lancer" :',
  '>>changer tirage par hasard entre 1 et 6',
);

describe('calculs — l’analyse', () => {
  it('accepte moyenne, minimum, maximum, somme, arrondi et hasard', () => {
    expect(erreurs(NOTES)).toEqual([]);
  });

  it('refuse une moyenne sur autre chose qu’une liste', () => {
    expect(erreurs(programme('page "a" :', '>variable n = 3', '>calcul m = moyenne de n'))).toEqual([
      '3 : « moyenne de » calcule sur une liste de nombres ; « n » est un nombre.',
    ]);
  });

  it('lit un champ sur une liste de fiches : la liste de ses valeurs', () => {
    expect(erreurs(programme('page "a" :', '>variable panier = [fiche avec nom "A" et prix 1]', '>calcul t = somme de panier.poids'))).toEqual([
      '3 : le champ « poids » n\'existe pas dans cette fiche. Champs : nom, prix.',
    ]);
  });
});

describe('calculs — ce que produit chaque cible', () => {
  it('web : des fonctions de Math et des tableaux, lisibles', () => {
    const page = genererProjetWeb(compiler(NOTES).application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' }).get('src/pages/Notes.tsx')!;
    // Une liste vide vaut 0, comme sur les autres cibles (revue 5).
    expect(page).toContain('((l) => (l.length ? l.reduce((somme, n) => somme + n, 0) / l.length : 0))(notes)');
    expect(page).toContain('((l) => (l.length ? Math.max(...l) : 0))(notes)');
    expect(page).toContain('((l) => (l.length ? Math.min(...l) : 0))(notes)');
    expect(page).toContain('panier.map((element) => element.prix).reduce((somme, n) => somme + n, 0)');
    // La moitié s'éloigne de zéro sur toutes les cibles (-2,5 → -3), comme Swift, Kotlin et C#.
    expect(page).toContain('((n) => Math.sign(n) * Math.round(Math.abs(n) * 10) / 10)(moyenneNotes)');
    expect(page).toContain('((n) => Math.sign(n) * Math.round(Math.abs(n) * 1) / 1)(moyenneNotes)');
    expect(page).toContain('setTirage(1 + Math.floor(Math.random() * (6 - 1 + 1)));');
  });

  it('site statique : le HTML de départ est déjà calculé', () => {
    const html = genererProjetStatique(compiler(NOTES).application!, { nom: 'a', source: 'a.humalis' }).get('index.html')!;
    expect(html).toContain('Moyenne 12, de 9 à 15, arrondie 12');
    expect(html).toContain('Total 14 000 FC');
  });
});
