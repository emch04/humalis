import { expect, it } from 'vitest';
import { libelleEtape, messageEchec, resumeVerifications, ligneVerification } from '../../src/outils/rapport-tests.js';
import type { EtapeTest } from '../../src/parser/ast.js';

const etapes: EtapeTest[] = [
  { type: 'Cliquer', cible: 'Dire bonjour', ligne: 1 },
  { type: 'RemplirChamp', cible: 'Nom', valeur: 'Alice', ligne: 2 },
  { type: 'AllerVers', cible: 'profil', ligne: 3 },
  { type: 'VerifierTexteVisible', cible: 'Bienvenue', ligne: 4 },
  { type: 'VerifierTexteAbsent', cible: 'Erreur', ligne: 5 },
  { type: 'VerifierPage', cible: 'profil', ligne: 6 },
  { type: 'VerifierChamp', cible: 'Nom', valeur: 'Alice', ligne: 7 },
];

it('affiche chaque étape dans la syntaxe Humalis', () => {
  expect(etapes.map(libelleEtape)).toEqual([
    'cliquer sur "Dire bonjour"', 'remplir champ "Nom" avec "Alice"', 'aller vers "profil"',
    'verifier que texte "Bienvenue" est visible', 'verifier que texte "Erreur" est absent',
    'verifier que page est "profil"', 'verifier que champ "Nom" vaut "Alice"',
  ]);
});

it('traduit chaque famille d’échec et réserve la trace au mode détail', () => {
  const erreur = new Error('locator.waitFor: Timeout 5000ms exceeded. Call log: anglais brut');
  const attendu = [
    'le bouton ou lien « Dire bonjour » est introuvable (attendu 5 secondes)',
    'le champ « Nom » est introuvable (attendu 5 secondes)',
    'la page « profil » ne s’est pas chargée (attendu 5 secondes)',
    'le texte « Bienvenue » n’est pas apparu (attendu 5 secondes)',
    'le texte « Erreur » est encore visible (attendu 5 secondes)',
    'la page attendue est « profil », la page affichée est « accueil »',
    'le champ « Nom » devrait valoir « Alice », il vaut « Bob »',
  ];
  expect(etapes.map((etape, index) => messageEchec(etape, erreur, index === 5 ? 'accueil' : index === 6 ? 'Bob' : undefined))).toEqual(attendu);
  expect(messageEchec(etapes[3], erreur)).not.toContain('locator');
  expect(messageEchec(etapes[3], erreur, undefined, true)).toContain('locator.waitFor');
});

it('accorde les comptes et affiche un chemin relatif au projet', () => {
  expect(resumeVerifications(1, 1)).toBe('1 réussie, 1 échouée.');
  expect(resumeVerifications(5, 2)).toBe('5 réussies, 2 échouées.');
  expect(ligneVerification('/tmp/projet', { fichier: '/tmp/projet/tests/accueil.test.humalis', test: 'bonjour', page: 'accueil', ligne: 4, succes: true, message: libelleEtape(etapes[3]) })).toContain('tests/accueil.test.humalis, ligne 4');
});
