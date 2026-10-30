import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Plan du langage de base (tâche 1) : tant que, repeter n fois, arreter, passer au suivant, selon … cas.
const JEU = programme(
  'fonction ecart avec depart et fin :',
  '>variable n = depart',
  '>variable pas = 0',
  '>tant que n est inferieur a fin :',
  '>>changer n par n + 1',
  '>>changer pas par pas + 1',
  '>rendre pas',
  '',
  'page "jeu" :',
  '>variable etoiles = []',
  '>variable jour = "samedi"',
  '>variable message = ""',
  '>calcul distance = ecart(2, 9)',
  '>texte "{message} {distance}"',
  '>bouton "Jouer"',
  '>quand l\'utilisateur clique sur "Jouer" :',
  '>>repeter 3 fois :',
  '>>>ajouter "★" à etoiles',
  '>>pour chaque e dans etoiles :',
  '>>>si e est egal a "" :',
  '>>>>passer au suivant',
  '>>>si e est egal a "stop" :',
  '>>>>arreter',
  '>>selon jour :',
  '>>>cas "samedi" ou "dimanche" :',
  '>>>>changer message par "Fermé"',
  '>>>cas "lundi" :',
  '>>>>changer message par "Ouvert l\'après-midi"',
  '>>>sinon :',
  '>>>>changer message par "Ouvert"',
);

describe('boucles et choix — l’analyse', () => {
  it('accepte tant que, repeter, arreter, passer au suivant et selon dans un événement ou une fonction', () => {
    expect(erreurs(JEU)).toEqual([]);
  });

  it('refuse arreter et passer au suivant hors d’une boucle', () => {
    expect(
      erreurs(programme('page "a" :', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>arreter', '>>passer au suivant')),
    ).toEqual([
      '4 : « arreter » s\'écrit dans une boucle (pour chaque, tant que, repeter).',
      '5 : « passer au suivant » s\'écrit dans une boucle (pour chaque, tant que, repeter).',
    ]);
  });

  it('refuse tant que et repeter dans la page : la page affiche, l’événement calcule', () => {
    expect(erreurs(programme('page "a" :', '>repeter 3 fois :', '>>texte "x"'))[0]).toBe(
      '2 : « repeter » s\'écrit dans un événement ou une fonction : dans la page, « pour chaque » affiche une liste.',
    );
  });

  it('repeter attend un nombre', () => {
    expect(erreurs(programme('page "a" :', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>repeter "trois" fois :', '>>>afficher "x"'))).toEqual([
      '4 : « repeter » attend un nombre de fois ; cette valeur est un texte.',
    ]);
  });

  it('avertit d’une boucle tant que dont la condition ne change jamais', () => {
    const source = programme('page "a" :', '>variable n = 0', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>tant que n est inferieur a 3 :', '>>>afficher "x"');
    expect(compiler(source).diagnostics).toContainEqual({
      gravite: 'avertissement',
      message: 'cette boucle ne change jamais « n » : elle risque de ne jamais s\'arrêter.',
      ligne: 5,
    });
  });
});

describe('boucles et choix — ce que produit chaque cible', () => {
  it('web : while, for, break, continue, et une suite de if pour selon', () => {
    const fichiers = genererProjetWeb(compiler(JEU).application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' });
    const fonctions = fichiers.get('src/humalis/fonctions.ts')!;
    expect(fonctions).toContain('  while (n < fin) {\n    n = n + 1;');
    const page = fichiers.get('src/pages/Jeu.tsx')!;
    expect(page).toContain('for (let fois = 0; fois < 3; fois++) {');
    expect(page).toContain('      continue;');
    expect(page).toContain('      break;');
    expect(page).toContain("if (jour === 'samedi' || jour === 'dimanche') {");
    expect(page).toContain("} else if (jour === 'lundi') {");
    expect(page).toContain('} else {');
  });

  it('web : une variable changée dans une boucle est lue dans sa copie à jour (React ne change l’état qu’au prochain affichage)', () => {
    const source = programme(
      'page "a" :',
      '>variable etoiles = []',
      '>variable vues = 0',
      '>bouton "Go"',
      '>quand l\'utilisateur clique sur "Go" :',
      '>>repeter 3 fois :',
      '>>>ajouter "★" à etoiles',
      '>>pour chaque e dans etoiles :',
      '>>>changer vues par vues + 1',
    );
    const page = genererProjetWeb(compiler(source).application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' }).get('src/pages/A.tsx')!;
    expect(page).toContain('    let etoilesMaj = etoiles;\n    let vuesMaj = vues;');
    expect(page).toContain("      etoilesMaj = [...etoilesMaj, '★'];\n      setEtoiles(etoilesMaj);");
    expect(page).toContain('    for (const e of etoilesMaj) {\n      vuesMaj = vuesMaj + 1;\n      setVues(vuesMaj);');
  });

  it('site statique : le même JavaScript, et le HTML de départ calcule la fonction', () => {
    const fichiers = genererProjetStatique(compiler(JEU).application!, { nom: 'a', source: 'a.humalis' });
    expect(fichiers.get('fonctions.js')).toContain('  while (n < fin) {');
    expect(fichiers.get('index.html')).toContain('> 7</p>');
  });
});
