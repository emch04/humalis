import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { programme, erreurs } from './analyse/aide.js';

const corps = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;
const valeurDe = (expression: string) =>
  (corps(`page "a" :\n    variable x = ${expression}`)[0] as { valeur: unknown }).valeur;

describe('calculs — parser', () => {
  it('respecte les priorités : * avant +', () => {
    expect(valeurDe('1 + 2 * 3')).toMatchObject({
      type: 'Calcul',
      operateur: '+',
      gauche: { type: 'Nombre', valeur: 1 },
      droite: { type: 'Calcul', operateur: '*', gauche: { valeur: 2 }, droite: { valeur: 3 } },
    });
  });

  it('calcule de gauche à droite à priorité égale', () => {
    expect(valeurDe('10 - 4 - 1')).toMatchObject({
      operateur: '-',
      gauche: { type: 'Calcul', operateur: '-', gauche: { valeur: 10 }, droite: { valeur: 4 } },
      droite: { valeur: 1 },
    });
  });

  it('suit les parenthèses', () => {
    expect(valeurDe('(1 + 2) * 3')).toMatchObject({
      operateur: '*',
      gauche: { type: 'Calcul', operateur: '+' },
      droite: { valeur: 3 },
    });
  });

  it('lit un nombre négatif', () => {
    expect(valeurDe('-3')).toMatchObject({ type: 'Nombre', valeur: -3 });
  });

  it('lit « nombre de panier »', () => {
    expect(valeurDe('nombre de panier')).toMatchObject({
      type: 'Compte',
      liste: { type: 'Reference', nom: 'panier' },
    });
  });

  it('garde « nombre » comme nom de variable', () => {
    expect(corps('page "a" :\n    variable nombre = 3\n    texte nombre')[1]).toMatchObject({
      contenu: { type: 'Reference', nom: 'nombre' },
    });
  });

  it('explique un calcul incomplet', () => {
    expect(() => valeurDe('1 +')).toThrow(/une valeur est attendue/);
  });

  it('explique une parenthèse non fermée', () => {
    expect(() => valeurDe('(1 + 2')).toThrow(/il manque une parenthèse fermante \)/);
  });

  it('lit « ajouter … à … » et « retirer … de … »', () => {
    const [ajout, retrait, ajoutDans] = corps(
      'page "a" :\n    ajouter nom à panier\n    retirer "Livre" de panier\n    ajouter 3 dans notes',
    );
    expect(ajout).toMatchObject({
      type: 'ModificationListe',
      operation: 'ajouter',
      valeur: { type: 'Reference', nom: 'nom' },
      liste: 'panier',
    });
    expect(retrait).toMatchObject({ operation: 'retirer', liste: 'panier' });
    expect(ajoutDans).toMatchObject({ operation: 'ajouter', liste: 'notes' });
  });
});

describe('calculs — analyse', () => {
  it('accepte un calcul sur des nombres', () => {
    expect(
      erreurs(programme('page "a" :', '>variable prix = 3', '>variable total = prix * 2 + 1', '>texte "{total}"')),
    ).toEqual([]);
  });

  it('refuse d’additionner un texte, et propose l’interpolation', () => {
    expect(erreurs(programme('page "a" :', '>variable nom = "Awa"', '>variable x = nom + 1'))).toEqual([
      '3 : « nom » est un texte ; « + » calcule avec des nombres. Pour coller du texte, écrivez par exemple : "Total : {total}"',
    ]);
  });

  it('refuse une division par zéro écrite en clair', () => {
    expect(erreurs(programme('page "a" :', '>variable x = 4 / 0'))).toEqual([
      '2 : division par zéro : le nombre après « / » ne peut pas être 0.',
    ]);
  });

  it('donne le type nombre à un calcul', () => {
    expect(
      erreurs(programme('page "a" :', '>variable x = 1 + 1', '>pour chaque n dans x :', '>>texte n')),
    ).toEqual(['3 : « x » est un nombre ; pour chaque … dans attend une liste.']);
  });

  it('compte une liste, et refuse de compter un nombre', () => {
    expect(
      erreurs(programme('page "a" :', '>variable l = [1]', '>variable n = nombre de l', '>variable m = nombre de n')),
    ).toEqual(['4 : « n » est un nombre ; « nombre de » compte les éléments d’une liste.']);
  });

  it('refuse ajouter hors d’un événement', () => {
    expect(erreurs(programme('page "a" :', '>variable l = []', '>ajouter 1 à l'))).toEqual([
      "3 : « ajouter » ne s'utilise que dans un événement (quand …).",
    ]);
  });

  it('refuse d’ajouter dans autre chose qu’une liste', () => {
    expect(
      erreurs(
        programme('page "a" :', '>variable total = 0', '>bouton "Go"', '>quand utilisateur clique sur "Go" :', '>>ajouter 1 à total'),
      ),
    ).toEqual(['5 : « total » est un nombre ; on ne peut ajouter ou retirer que dans une liste.']);
  });

  it('refuse d’ajouter un nombre dans une liste de textes', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>variable panier = ["Livre"]',
          '>bouton "Go"',
          '>quand utilisateur clique sur "Go" :',
          '>>ajouter 3 à panier',
        ),
      ),
    ).toEqual(['5 : « panier » est une liste de textes ; on ne peut pas y ajouter un nombre.']);
  });

  it('donne son type à une liste vide au premier ajout', () => {
    const resultat = compiler(
      programme(
        'page "a" :',
        '>variable panier = []',
        '>bouton "Go"',
        '>quand utilisateur clique sur "Go" :',
        '>>ajouter "Livre" à panier',
      ),
    );
    expect(resultat.application?.ecrans[0].etat[0].type).toEqual({ genre: 'liste', de: { genre: 'texte' } });
  });
});

describe('événements dans une boucle', () => {
  const boutique = programme(
    'page "boutique" :',
    '>variable produits = ["Livre", "Stylo"]',
    '>variable panier = []',
    '>pour chaque nom dans produits :',
    '>>texte nom',
    '>>bouton "Ajouter"',
    '>>quand utilisateur clique sur "Ajouter" :',
    '>>>ajouter nom à panier',
  );

  it('voit la variable de la boucle', () => {
    expect(erreurs(boutique)).toEqual([]);
  });

  it('refuse une cible hors de la boucle', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>variable l = ["x"]',
          '>bouton "Vider"',
          '>pour chaque nom dans l :',
          '>>quand utilisateur clique sur "Vider" :',
          '>>>afficher nom',
        ),
      ),
    ).toEqual([
      '5 : « Vider » n’est pas dans cette boucle : un événement placé dans une boucle vise un élément de la même boucle.',
    ]);
  });

  it('accepte un événement dans un « si », sous son élément (décision F2, remplace A15)', () => {
    expect(
      erreurs(
        programme('page "a" :', '>variable v = vrai', '>si v est vrai :', '>>bouton "Go"', '>>quand utilisateur clique sur "Go" :', '>>>afficher "x"'),
      ),
    ).toEqual([]);
  });

  it('range le gestionnaire dans la répétition de la RI', () => {
    const ecran = compiler(boutique).application!.ecrans[0];
    expect(ecran.gestionnaires).toEqual([]);
    expect(ecran.vue[0]).toMatchObject({
      type: 'repetition',
      variable: 'nom',
      gestionnaires: [
        {
          declencheur: 'clic',
          cibles: ['bouton_ajouter'],
          actions: [{ type: 'ajout', liste: 'panier', valeur: { type: 'variable', nom: 'nom' } }],
        },
      ],
    });
  });
});

describe('calculs — représentation intermédiaire', () => {
  it('traduit calculs, comptes et retraits', () => {
    const ecran = compiler(
      programme(
        'page "a" :',
        '>variable panier = ["Livre"]',
        '>variable total = nombre de panier * 2',
        '>bouton "Vider"',
        '>quand utilisateur clique sur "Vider" :',
        '>>retirer "Livre" de panier',
      ),
    ).application!.ecrans[0];
    expect(ecran.etat[1].initiale).toEqual({
      type: 'calcul',
      operateur: '*',
      gauche: { type: 'compte', liste: { type: 'variable', nom: 'panier' } },
      droite: { type: 'nombre', valeur: 2 },
    });
    expect(ecran.gestionnaires[0].actions).toEqual([
      { type: 'retrait', liste: 'panier', valeur: { type: 'texte', parties: [{ texte: 'Livre' }] } },
    ]);
  });
});

describe('calcul : une valeur qui se recalcule seule', () => {
  const source = programme(
    'page "boutique" :',
    '>variable panier = []',
    '>calcul nombre_articles = nombre de panier',
    '>texte "Articles : {nombre_articles}"',
    '>bouton "Ajouter"',
    '>quand utilisateur clique sur "Ajouter" :',
    '>>ajouter "Livre" à panier',
  );

  it('lit « calcul x = … »', () => {
    expect(corps(source)[1]).toMatchObject({
      type: 'Variable',
      nom: 'nombre_articles',
      calcul: true,
      valeur: { type: 'Compte' },
    });
  });

  it('range le calcul à part de l’état dans la RI', () => {
    const ecran = compiler(source).application!.ecrans[0];
    expect(ecran.etat.map((e) => e.nom)).toEqual(['panier']);
    expect(ecran.calculs).toEqual([
      {
        nom: 'nombre_articles',
        type: { genre: 'nombre' },
        valeur: { type: 'compte', liste: { type: 'variable', nom: 'panier' } },
      },
    ]);
  });

  it('refuse de changer un calcul', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>variable prix = 2',
          '>calcul total = prix * 3',
          '>bouton "Go"',
          '>quand utilisateur clique sur "Go" :',
          '>>changer total par 0',
        ),
      ),
    ).toEqual([
      '6 : « total » est un calcul : sa valeur se recalcule seule (ligne 3). Changez plutôt les variables dont il dépend.',
    ]);
  });

  it('garde « calcul » comme nom de variable possible', () => {
    expect(erreurs(programme('page "a" :', '>variable calcul = 3', '>texte calcul'))).toEqual([]);
  });
});
