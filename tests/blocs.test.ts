import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from './aide-qualite.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

/** Les instructions de la première page. */
const corps = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;

describe('blocs — le parser (section, bloc, ligne, colonne, grille)', () => {
  it('lit une section et son titre, qui devient le premier titre du bloc', () => {
    const [section] = corps(programme('page "accueil" :', '>section "Nos plats" avec style "carte" :', '>>texte "Bonjour"'));
    expect(section).toMatchObject({
      type: 'Bloc',
      genre: 'section',
      classes: ['carte'],
      styles: [],
      corps: [
        { type: 'Element', element: 'titre', contenu: { type: 'Chaine' } },
        { type: 'Element', element: 'texte' },
      ],
      ligne: 2,
    });
  });

  it('lit les blocs sans titre, avec ou sans options', () => {
    const instructions = corps(
      programme(
        'page "accueil" :',
        '>section :',
        '>>texte "a"',
        '>bloc avec style "fiche" et fond vert :',
        '>>texte "b"',
        '>ligne :',
        '>>bouton "Oui"',
        '>>bouton "Non"',
        '>colonne :',
        '>>texte "c"',
        '>grille avec style "plats" :',
        '>>texte "d"',
      ),
    );
    expect(instructions.map((i) => (i.type === 'Bloc' ? i.genre : i.type))).toEqual(['section', 'bloc', 'ligne', 'colonne', 'grille']);
    expect(instructions[1]).toMatchObject({ classes: ['fiche'], styles: [{ propriete: 'fond', valeur: 'vert' }] });
    expect(instructions[2]).toMatchObject({ corps: [{ element: 'bouton' }, { element: 'bouton' }] });
  });

  it('ces mots restent des noms ailleurs : « variable ligne = 1 », « texte grille »', () => {
    expect(erreurs(programme('page "accueil" :', '>variable ligne = 1', '>variable grille = "x"', '>texte "{ligne}"', '>texte grille'))).toEqual([]);
  });

  it('un bloc vide ou sans deux-points est expliqué', () => {
    const { diagnostics } = compiler(programme('page "accueil" :', '>ligne avec style "x"', '>>texte "a"'));
    expect(diagnostics[0].message).toContain('il manque deux-points à la fin de la ligne « ligne », puis son contenu en dessous, décalé');
  });
});

describe('blocs — l’analyse', () => {
  it('un bloc contient tout ce qu’une page contient, et ses éléments se visent comme les autres', () => {
    const source = programme(
      'page "accueil" :',
      '>variable n = 0',
      '>section "Compteur" :',
      '>>ligne :',
      '>>>texte "{n}"',
      '>>>bouton "Plus"',
      '>>si n est superieur a 2 :',
      '>>>texte "Beaucoup"',
      '>>pour chaque x dans [1, 2] :',
      '>>>texte "{x}"',
      '>quand l\'utilisateur clique sur "Plus" :',
      '>>changer n par n + 1',
    );
    expect(erreurs(source)).toEqual([]);
    expect(avertissements(source)).toEqual([]);
  });

  it('une variable déclarée dans un bloc n’existe que dans ce bloc', () => {
    expect(erreurs(programme('page "accueil" :', '>bloc :', '>>variable prix = 1', '>texte "{prix}"'))).toEqual([
      '4 : le texte utilise {prix}, mais la variable « prix » n\'est pas déclarée.',
    ]);
  });

  it('un bloc ne s’écrit pas dans un événement', () => {
    expect(
      erreurs(programme('page "accueil" :', '>bouton "Ok"', '>quand l\'utilisateur clique sur "Ok" :', '>>bloc :', '>>>texte "a"'))[0],
    ).toContain('un bloc ne peut pas être créé dans un événement');
  });
});

describe('événements — écrits là où est leur élément (décision F2)', () => {
  it('dans un « si »', () => {
    const source = programme(
      'page "accueil" :',
      '>variable n = 0',
      '>si n est egal a 0 :',
      '>>bouton "Plus"',
      '>>quand l\'utilisateur clique sur "Plus" :',
      '>>>changer n par n + 1',
    );
    expect(erreurs(source)).toEqual([]);
  });

  it('dans un bloc, un « sinon » et un formulaire', () => {
    const source = programme(
      'page "accueil" :',
      '>variable n = 0',
      '>ligne :',
      '>>bouton "Plus"',
      '>>quand l\'utilisateur clique sur "Plus" :',
      '>>>changer n par n + 1',
      '>si n est egal a 0 :',
      '>>texte "zéro"',
      '>sinon :',
      '>>bouton "Remettre"',
      '>>quand l\'utilisateur clique sur "Remettre" :',
      '>>>changer n par 0',
      '>formulaire "f" :',
      '>>champ "nom"',
      '>>bouton "Envoyer"',
      '>>quand le formulaire "f" est soumis :',
      '>>>afficher "Merci"',
    );
    expect(erreurs(source)).toEqual([]);
  });

  it('dans un « si » d’une boucle : il voit la variable de la boucle et vise un élément de la boucle', () => {
    const source = programme(
      'page "accueil" :',
      '>variable panier = []',
      '>pour chaque nom dans ["Livre", "Stylo"] :',
      '>>si nom est egal a "Livre" :',
      '>>>bouton "Ajouter"',
      '>>>quand l\'utilisateur clique sur "Ajouter" :',
      '>>>>ajouter nom à panier',
    );
    expect(erreurs(source)).toEqual([]);
  });

  it('jamais dans un autre événement', () => {
    expect(
      erreurs(
        programme(
          'page "accueil" :',
          '>bouton "Ok"',
          '>quand l\'utilisateur clique sur "Ok" :',
          '>>quand l\'utilisateur clique sur "Ok" :',
          '>>>afficher "a"',
        ),
      ),
    ).toEqual(['4 : un événement ne se place pas dans un autre événement : écrivez-le dans la page, sous son élément.']);
  });

  it('dans un « si utilisateur est admin », il est gardé comme son élément (pas d’avertissement)', () => {
    const source = programme(
      'serveur "resto" :',
      '>donnee plat :',
      '>>nom : texte',
      '>route "plats" :',
      '>>seul admin peut lire plat',
      '>>seul admin peut modifier plat',
      '',
      'page "admin" :',
      '>variable plats = []',
      '>si utilisateur est admin :',
      '>>bouton "Actualiser"',
      '>>quand l\'utilisateur clique sur "Actualiser" :',
      '>>>envoyer requete vers "plats" dans plats',
    );
    const { diagnostics } = compiler(source);
    expect(diagnostics).toEqual([]);
  });
});

describe('blocs et événements — la représentation intermédiaire', () => {
  const source = programme(
    'page "accueil" :',
    '>variable n = 0',
    '>section "Compteur" avec style "carte" et fond vert :',
    '>>ligne :',
    '>>>bouton "Plus"',
    '>>>quand l\'utilisateur clique sur "Plus" :',
    '>>>>changer n par n + 1',
    '>pour chaque x dans [1, 2] :',
    '>>si x est egal a 1 :',
    '>>>bouton "Un"',
    '>>>quand l\'utilisateur clique sur "Un" :',
    '>>>>changer n par x',
  );
  const ecran = () => compiler(source).application!.ecrans[0];

  it('un bloc devient un nœud « bloc » avec son genre, ses options et ses classes', () => {
    expect(ecran().vue[0]).toMatchObject({
      type: 'bloc',
      genre: 'section',
      options: [{ nom: 'fond', valeur: 'vert' }],
      classes: ['carte'],
      corps: [
        { type: 'element', genre: 'titre' },
        { type: 'bloc', genre: 'ligne', corps: [{ type: 'element', genre: 'bouton', id: 'bouton_plus' }] },
      ],
    });
  });

  it('un événement écrit dans un bloc rejoint les gestionnaires de la page', () => {
    expect(ecran().gestionnaires).toMatchObject([{ declencheur: 'clic', cibles: ['bouton_plus'] }]);
  });

  it('un événement écrit dans un « si » d’une boucle rejoint les gestionnaires de la boucle', () => {
    expect(ecran().vue[1]).toMatchObject({ type: 'repetition', gestionnaires: [{ declencheur: 'clic', cibles: ['bouton_un'] }] });
  });
});

describe('blocs — ce que produit chaque cible', () => {
  const source = programme(
    'page "carte" :',
    '>variable plats = ["Liboke", "Pondu"]',
    '>section "Nos plats" avec style "carte" :',
    '>>grille :',
    '>>>pour chaque p dans plats :',
    '>>>>bloc avec style "fiche" et fond vert :',
    '>>>>>texte p',
    '>>ligne :',
    '>>>lien "Réserver" vers "carte"',
    '>colonne :',
    '>>texte "Fin"',
  );
  const application = () => compiler(source).application!;

  it('web : section et div, avec leurs classes ; la base de mise en page dans styles.css', async () => {
    const { genererProjetWeb } = await import('../src/cibles/web/projet.js');
    const fichiers = genererProjetWeb(application(), { nom: 'resto', adresse: 'https://resto.exemple.cd', source: 'resto.humalis' });
    const page = fichiers.get('src/pages/Carte.tsx')!;
    expect(page).toContain('<section className="humalis-section carte">');
    expect(page).toContain('<h1 data-humalis="titre_nos_plats">Nos plats</h1>');
    expect(page).toContain('<div className="humalis-grille">');
    expect(page).toContain('<div className="humalis-bloc humalis-fond-vert fiche">');
    expect(page).toContain('<div className="humalis-ligne">');
    expect(page).toContain('<div className="humalis-colonne">');
    expect(page).toContain('</section>');
    const styles = fichiers.get('src/humalis/styles.css')!;
    expect(styles).toContain('.humalis-ligne { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }');
    expect(styles).toContain('.humalis-grille { display: grid;');
  });

  it('web : sans bloc, styles.css ne change pas', async () => {
    const { genererProjetWeb } = await import('../src/cibles/web/projet.js');
    const fichiers = genererProjetWeb(compiler(programme('page "a" :', '>texte "x"')).application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' });
    expect(fichiers.get('src/humalis/styles.css')).not.toContain('humalis-ligne');
  });

  it('mobile : des View, avec les styles de mise en page', async () => {
    const { genererProjetMobile } = await import('../src/cibles/mobile/projet.js');
    const fichiers = genererProjetMobile(application(), { nom: 'resto', source: 'resto.humalis' });
    const page = [...fichiers.entries()].find(([chemin]) => chemin.startsWith('app/') && chemin.includes('index'))?.[1] ?? '';
    expect(page).toContain('<View style={s.section}>');
    expect(page).toContain('<View style={s.grille}>');
    expect(page).toContain('<View style={[s.bloc, s.fondVert]}>');
    expect(page).toContain('<View style={s.ligne}>');
    expect(fichiers.get('humalis/styles.ts')).toContain("ligne: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },");
  });

  it('site statique : le même HTML que le web, écrit d’avance', async () => {
    const { genererProjetStatique } = await import('../src/cibles/statique/projet.js');
    const fichiers = genererProjetStatique(application(), { nom: 'resto', source: 'resto.humalis' });
    const html = fichiers.get('index.html')!;
    expect(html).toContain('<section class="humalis-section carte">');
    expect(html).toContain('<div class="humalis-grille">');
    expect(html).toContain('<div class="humalis-bloc humalis-fond-vert fiche">');
    expect(fichiers.get('humalis/styles.css')).toContain('.humalis-colonne {');
  });
});
