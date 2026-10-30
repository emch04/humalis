import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { programme } from './analyse/aide.js';

// Décision O3 d'Emch : « test "…" de page "…" : » et ses gestes et vérifications (fichiers *.test.humalis).
const TEST = programme(
  'test "la page d\'accueil salue" de page "accueil" :',
  '>verifier que texte "Bienvenue" est visible',
  '>remplir champ "email" avec "awa@exemple.cd"',
  '>cliquer sur "Dire bonjour"',
  '>verifier que texte "Bonjour !" est visible',
  '>verifier que texte "Erreur" est absent',
  '>verifier que champ "email" vaut "awa@exemple.cd"',
  '>aller vers "panier"',
  '>verifier que page est "panier"',
);

describe('tests écrits en Humalis — le parser (contrat de la commande humalis tester)', () => {
  it('lit un test, sa page et chaque étape, avec sa ligne', () => {
    const { tests } = analyserSyntaxe(analyser(TEST));
    expect(tests).toEqual([
      {
        type: 'Test',
        nom: "la page d'accueil salue",
        page: 'accueil',
        ligne: 1,
        etapes: [
          { type: 'VerifierTexteVisible', cible: 'Bienvenue', ligne: 2 },
          { type: 'RemplirChamp', cible: 'email', valeur: 'awa@exemple.cd', ligne: 3 },
          { type: 'Cliquer', cible: 'Dire bonjour', ligne: 4 },
          { type: 'VerifierTexteVisible', cible: 'Bonjour !', ligne: 5 },
          { type: 'VerifierTexteAbsent', cible: 'Erreur', ligne: 6 },
          { type: 'VerifierChamp', cible: 'email', valeur: 'awa@exemple.cd', ligne: 7 },
          { type: 'AllerVers', cible: 'panier', ligne: 8 },
          { type: 'VerifierPage', cible: 'panier', ligne: 9 },
        ],
      },
    ]);
  });

  it('un programme sans test a une liste de tests vide', () => {
    expect(analyserSyntaxe(analyser(programme('page "a" :', '>texte "x"'))).tests).toEqual([]);
  });

  it('une étape inconnue est expliquée, avec les étapes possibles', () => {
    expect(() => analyserSyntaxe(analyser(programme('test "x" de page "a" :', '>appuyer sur "Ok"')))).toThrow(
      /étape de test inconnue : « appuyer ». Étapes possibles : cliquer sur, remplir champ … avec, aller vers, verifier que …/,
    );
  });

  it('« test » seul reste un nom possible', () => {
    expect(compiler(programme('page "a" :', '>variable test = 1', '>texte "{test}"')).diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  });
});

describe('tests écrits en Humalis — l’analyse', () => {
  it('un test vise une page qui existe', () => {
    const source = programme('page "accueil" :', '>titre "Bienvenue"', 'test "x" de page "acceuil" :', '>verifier que texte "Bienvenue" est visible');
    expect(compiler(source).diagnostics).toEqual([
      { gravite: 'erreur', message: 'le test « x » vise la page « acceuil », qui n\'existe pas. Pages : accueil. Peut-être « accueil » ?', ligne: 3 },
    ]);
  });
});
