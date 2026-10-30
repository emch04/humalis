import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Plan du langage de base (tâche 1) : une fonction sans « rendre » est une suite d'actions,
// appelée seule sur une ligne d'un événement : « vider_panier() ».
const BOUTIQUE = programme(
  'fonction saluer avec nom :',
  '>afficher "Bonjour {nom}"',
  '',
  'page "boutique" :',
  '>titre "Boutique"',
  '>variable panier = ["Pagne", "Wax"]',
  '>fonction vider_panier :',
  '>>changer panier par []',
  '>>afficher "Panier vidé"',
  '>bouton "Vider"',
  '>quand l\'utilisateur clique sur "Vider" :',
  '>>vider_panier()',
  '>>saluer("Awa")',
  '>calcul n = nombre de panier',
  '>texte "{n} articles"',
);

describe('fonctions d’actions', () => {
  it('en haut du fichier ou dans une page, appelées dans un événement', () => {
    expect(erreurs(BOUTIQUE)).toEqual([]);
  });

  it('web : le corps est écrit à la place de l’appel, dans l’événement', () => {
    const page = genererProjetWeb(compiler(BOUTIQUE).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/pages/Boutique.tsx')!;
    expect(page).toContain('setPanier([]);');
    expect(page).toContain("afficherMessage('Panier vidé', 'info');");
    expect(page).toMatch(/const nom\w* = 'Awa';/);
  });

  it('site statique : le script fait de même', () => {
    const script = genererProjetStatique(compiler(BOUTIQUE).application!, { nom: 'b', source: 'b.humalis' }).get('pages/boutique.js')!;
    expect(script).toContain('panier = [];');
  });

  it('une fonction qui s’appelle elle-même est refusée', () => {
    const resultat = compiler(programme('fonction boucle :', '>boucle()', '', 'page "a" :', '>titre "A"', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>boucle()'));
    expect(resultat.diagnostics.map((d) => d.message).join('\n')).toMatch(/« boucle » s'appelle elle-même/);
  });

  it('une fonction d’actions ne s’emploie pas comme une valeur', () => {
    expect(erreurs(programme('fonction saluer :', '>afficher "Bonjour"', '', 'page "a" :', '>titre "A"', '>calcul x = saluer()', '>texte "{x}"')).join('\n')).toMatch(/« saluer » fait des actions sans rendre de valeur/);
  });

  it('une fonction qui rend une valeur, appelée seule sur une ligne, est signalée', () => {
    expect(erreurs(programme('fonction double avec n :', '>rendre n * 2', '', 'page "a" :', '>titre "A"', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>double(3)')).join('\n')).toMatch(/« double » rend une valeur/);
  });
});
