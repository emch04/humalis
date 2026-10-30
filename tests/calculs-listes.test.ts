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
    expect(page).toContain('notes.reduce((somme, n) => somme + n, 0) / notes.length');
    expect(page).toContain('Math.max(...notes)');
    expect(page).toContain('Math.min(...notes)');
    expect(page).toContain('panier.map((element) => element.prix).reduce((somme, n) => somme + n, 0)');
    expect(page).toContain('Math.round(moyenneNotes * 10) / 10');
    expect(page).toContain('Math.round(moyenneNotes)');
    expect(page).toContain('setTirage(1 + Math.floor(Math.random() * (6 - 1 + 1)));');
  });

  it('site statique : le HTML de départ est déjà calculé', () => {
    const html = genererProjetStatique(compiler(NOTES).application!, { nom: 'a', source: 'a.humalis' }).get('index.html')!;
    expect(html).toContain('Moyenne 12, de 9 à 15, arrondie 12');
    expect(html).toContain('Total 14 000 FC');
  });
});
