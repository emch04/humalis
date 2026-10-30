import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from './aide-qualite.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

const corps = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;
const ecran = (source: string) => compiler(source).application!.ecrans[0];

describe('mise en page — les réglages des blocs (plan, 4.1)', () => {
  it('lit les options à valeur de mot ou de nombre', () => {
    const [grille] = corps(programme('page "p" :', '>grille avec colonnes 3 et espacement grande :', '>>texte "a"'));
    expect(grille).toMatchObject({
      type: 'Bloc',
      genre: 'grille',
      styles: [
        { propriete: 'colonnes', valeur: '3' },
        { propriete: 'espacement', valeur: 'grande' },
      ],
    });
  });

  it('accepte les accords : « espacement grand », « largeur etroit »', () => {
    expect(erreurs(programme('page "p" :', '>ligne avec espacement grand :', '>>texte "a"'))).toEqual([]);
  });

  it('« centre » vaut pour la position du texte comme pour l’alignement d’un bloc', () => {
    const source = programme('page "p" :', '>ligne avec alignement centre et repartition entre :', '>>texte "a" avec position centre');
    expect(erreurs(source)).toEqual([]);
    const options = (ecran(source).vue[0] as { options: unknown }).options;
    expect(options).toEqual([
      { nom: 'alignement', valeur: 'centree' },
      { nom: 'repartition', valeur: 'entre' },
    ]);
  });

  it('refuse une valeur inconnue et dit lesquelles existent', () => {
    expect(erreurs(programme('page "p" :', '>grille avec colonnes 9 :', '>>texte "a"'))).toEqual([
      "2 : « 9 » n'est pas une valeur possible pour « colonnes ». Valeurs possibles : 1, 2, 3, 4, 5, 6.",
    ]);
  });

  it('dit sur quel bloc un réglage se règle', () => {
    expect(erreurs(programme('page "p" :', '>texte "a" avec colonnes 3'))).toEqual([
      '2 : « colonnes » se règle seulement sur : grille (ici, texte).',
    ]);
    expect(erreurs(programme('page "p" :', '>bloc avec espacement petite :', '>>texte "a"'))[0]).toContain('se règle seulement sur : ligne, colonne, grille');
  });

  it('ces mots restent des noms ailleurs', () => {
    const source = programme('page "p" :', '>variable colonnes = 2', '>variable largeur = 3', '>texte "{colonnes} {largeur}"');
    expect(erreurs(source)).toEqual([]);
  });

  it('la représentation intermédiaire garde les réglages dans les options du bloc', () => {
    const noeud = ecran(programme('page "p" :', '>section "A" avec largeur etroite et remplissage moyenne :', '>>texte "a"')).vue[0];
    expect(noeud).toMatchObject({ type: 'bloc', options: [{ nom: 'largeur', valeur: 'etroite' }, { nom: 'remplissage', valeur: 'moyenne' }] });
  });
});

describe('mise en page — ombre, coins, dégradé, collé (plan, 4.4 et 4.5)', () => {
  it('lit « degrade bleu vers violet vertical » et « colle en bas »', () => {
    const [bloc] = corps(programme('page "p" :', '>bloc avec degrade bleu vers violet vertical et colle en bas et ombre forte :', '>>texte "a"'));
    expect(bloc).toMatchObject({
      styles: [
        { propriete: 'degrade', valeur: 'bleu-violet-vertical' },
        { propriete: 'colle', valeur: 'bas' },
        { propriete: 'ombre', valeur: 'forte' },
      ],
    });
  });

  it('« colle » seul colle en haut ; le dégradé est en diagonale par défaut', () => {
    const noeud = ecran(programme('page "p" :', '>bloc avec colle et degrade bleue vers violette :', '>>texte "a"')).vue[0];
    expect(noeud).toMatchObject({ options: [{ nom: 'colle', valeur: 'haut' }, { nom: 'degrade', valeur: 'bleu-violet-diagonale' }] });
  });

  it('refuse un dégradé d’une seule couleur ou d’une couleur inconnue', () => {
    expect(erreurs(programme('page "p" :', '>bloc avec degrade bleu vers bleu :', '>>texte "a"'))[0]).toContain('une seule couleur');
    expect(erreurs(programme('page "p" :', '>bloc avec degrade bleu vers turquoise :', '>>texte "a"'))[0]).toContain('Couleurs possibles');
  });

  it('explique un dégradé mal écrit', () => {
    const { diagnostics } = compiler(programme('page "p" :', '>bloc avec degrade bleu violet :', '>>texte "a"'));
    expect(diagnostics[0].message).toContain('il manque « vers » après « bleu »');
  });

  it('étend « bordure » : douce et ronde', () => {
    expect(erreurs(programme('page "p" :', '>bloc avec bordure douce :', '>>texte "a"', '>image "a.png" avec bordure ronde et description "Un motif"'))).toEqual([]);
  });
});

describe('mise en page — sur telephone, sur tablette ou ordinateur (plan, 4.2)', () => {
  it('lit un bloc « sur » avec un ou plusieurs appareils', () => {
    const [un, deux] = corps(
      programme('page "p" :', '>sur telephone :', '>>texte "a"', '>sur tablette ou ordinateur :', '>>texte "b"'),
    );
    expect(un).toMatchObject({ type: 'Bloc', genre: 'appareil', styles: [{ propriete: 'sur', valeur: 'telephone' }] });
    expect(deux).toMatchObject({ genre: 'appareil', styles: [{ valeur: 'tablette' }, { valeur: 'ordinateur' }] });
  });

  it('contient tout ce qu’un bloc contient, événements compris', () => {
    const source = programme(
      'page "p" :',
      '>variable n = 0',
      '>sur telephone :',
      '>>bouton "Plus"',
      '>>quand l\'utilisateur clique sur "Plus" :',
      '>>>changer n par n + 1',
      '>texte "{n}"',
    );
    expect(erreurs(source)).toEqual([]);
  });

  it('refuse un appareil inconnu et un appareil écrit deux fois', () => {
    const inconnu = compiler(programme('page "p" :', '>sur montre :', '>>texte "a"'));
    expect(inconnu.diagnostics.length).toBeGreaterThan(0);
    const deux = compiler(programme('page "p" :', '>sur telephone ou telephone :', '>>texte "a"'));
    expect(deux.diagnostics[0].message).toContain('écrit deux fois');
  });

  it('« sur » n’est pas une option des éléments', () => {
    expect(erreurs(programme('page "p" :', '>texte "a" avec sur telephone'))[0]).toContain('se règle seulement sur : appareil');
  });

  it('la représentation intermédiaire est un bloc « appareil » avec ses options', () => {
    const noeud = ecran(programme('page "p" :', '>sur tablette ou ordinateur :', '>>texte "a"')).vue[0];
    expect(noeud).toMatchObject({ type: 'bloc', genre: 'appareil', options: [{ nom: 'sur', valeur: 'tablette' }, { nom: 'sur', valeur: 'ordinateur' }] });
  });

  it('« sur » reste utilisable dans « clique sur »', () => {
    expect(erreurs(programme('page "p" :', '>bouton "Ok"', '>quand l\'utilisateur clique sur "Ok" :', '>>afficher "a"'))).toEqual([]);
  });
});

describe('mise en page — avertissements', () => {
  it('ne signale rien pour un site qui n’utilise que ces réglages', () => {
    const source = programme('page "p" :', '>grille avec colonnes 2 et espacement moyenne :', '>>bloc avec ombre legere et bordure douce :', '>>>texte "a"');
    expect(avertissements(source)).toEqual([]);
  });
});
