import { describe, it, expect } from 'vitest';
import { compiler } from './aide-qualite.js';
import { compilerProjet } from './aide-qualite.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Décision L2 d'Emch : « fonction remise avec prix et taux : … rendre … », appelée par « remise(prix, 10) ».
const PANIER = programme(
  'fonction prix_ttc avec montant :',
  '>rendre montant * 1,16',
  '',
  'fonction remise avec prix et taux :',
  '>si taux est superieur a 50 :',
  '>>rendre prix',
  '>rendre prix - prix * taux / 100',
  '',
  'page "panier" :',
  '>variable prix = 20000',
  '>calcul a_payer = remise(prix_ttc(prix), 10)',
  '>texte "À payer : {a_payer} FC"',
);

describe('fonctions — l’analyse', () => {
  it('accepte des fonctions en haut du fichier, appelées dans un calcul, même l’une dans l’autre', () => {
    expect(erreurs(PANIER)).toEqual([]);
  });

  it('refuse une fonction inconnue, en donnant les fonctions qui existent', () => {
    expect(erreurs(programme('fonction double avec n :', '>rendre n * 2', 'page "a" :', '>calcul x = triple(3)'))).toEqual([
      '4 : la fonction « triple » n\'existe pas. Fonctions : double.',
    ]);
  });

  it('refuse un appel avec trop ou trop peu de valeurs', () => {
    expect(erreurs(programme('fonction remise avec prix et taux :', '>rendre prix - taux', 'page "a" :', '>calcul x = remise(10)'))).toEqual([
      '4 : la fonction « remise » attend 2 valeurs (prix, taux), mais en reçoit 1.',
    ]);
  });

  it('refuse « rendre » hors d’une fonction', () => {
    expect(erreurs(programme('page "a" :', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>rendre 1'))).toEqual([
      '4 : « rendre » ne s\'écrit que dans une fonction (fonction … avec … :).',
    ]);
  });

  it('une fonction écrite en haut du fichier calcule : elle n’affiche rien et n’envoie rien', () => {
    expect(erreurs(programme('fonction saluer avec nom :', '>afficher "Bonjour {nom}"', '>rendre nom', 'page "a" :', '>calcul x = saluer("Awa")'))).toEqual([
      '2 : une fonction calcule une valeur : « afficher » s\'écrit dans un événement, pas dans une fonction.',
    ]);
  });

  it('une fonction s’utilise depuis un autre fichier du projet', () => {
    const fichiers: Record<string, string> = {
      'outils.humalis': programme('fonction double avec n :', '>rendre n * 2'),
    };
    const principal = programme('utiliser fichier "./outils.humalis"', 'page "a" :', '>calcul x = double(21)', '>texte "{x}"');
    const { diagnostics } = compilerProjet('principal.humalis', (c) => fichiers[c], principal);
    expect(diagnostics).toEqual([]);
  });
});

describe('fonctions — ce que produit chaque cible', () => {
  const application = () => compiler(PANIER).application!;

  it('la RI garde chaque fonction, ses paramètres typés par les appels et ce qu’elle rend', () => {
    expect(application().fonctions).toMatchObject([
      { nom: 'prix_ttc', parametres: [{ nom: 'montant', type: { genre: 'nombre' } }], retour: { genre: 'nombre' } },
      { nom: 'remise', parametres: [{ nom: 'prix', type: { genre: 'nombre' } }, { nom: 'taux', type: { genre: 'nombre' } }], retour: { genre: 'nombre' } },
    ]);
  });

  it('web : des fonctions TypeScript dans humalis/fonctions.ts, importées par la page', () => {
    const fichiers = genererProjetWeb(application(), { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' });
    const fonctions = fichiers.get('src/humalis/fonctions.ts')!;
    expect(fonctions).toContain('export function prixTtc(montant: number): number {\n  return montant * 1.16;\n}');
    expect(fonctions).toContain('export function remise(prix: number, taux: number): number {\n  if (taux > 50) {\n    return prix;\n  }\n  return prix - ((prix * taux) / 100);\n}');
    const page = fichiers.get('src/pages/Panier.tsx')!;
    expect(page).toContain("import { prixTtc, remise } from '../humalis/fonctions';");
    expect(page).toContain('remise(prixTtc(prix), 10)');
  });

  it('mobile : le même fichier de fonctions', () => {
    const fichiers = genererProjetMobile(application(), { nom: 'a', source: 'a.humalis' });
    expect(fichiers.get('humalis/fonctions.ts')).toContain('export function prixTtc(');
  });

  it('site statique : fonctions.js chargé avant la page, et le HTML de départ déjà calculé', () => {
    const fichiers = genererProjetStatique(application(), { nom: 'a', source: 'a.humalis' });
    expect(fichiers.get('fonctions.js')).toContain('function prixTtc(montant) {\n  return montant * 1.16;\n}');
    const html = fichiers.get('index.html')!;
    expect(html).toContain('<script src="fonctions.js" defer></script>');
    // 20000 × 1,16 = 23 200 ; moins 10 % : 20 880.
    expect(html).toContain('À payer : 20 880 FC');
  });

  it('sans fonction, aucun fichier de plus', () => {
    const fichiers = genererProjetWeb(compiler(programme('page "a" :', '>texte "x"')).application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' });
    expect(fichiers.has('src/humalis/fonctions.ts')).toBe(false);
  });
});
