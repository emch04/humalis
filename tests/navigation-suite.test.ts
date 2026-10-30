import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { verifierNavigationPourLaCible } from '../src/cibles/sources.js';
import { programme, erreurs } from './analyse/aide.js';

// Sous-pages, filtres d'adresse, ancres, retour, liens externes, lien actif et menu
// (plan 2026-10-30-donnees-et-navigation, partie B, tâche 7).

const lire = (...lignes: string[]) => analyserSyntaxe(analyser(programme(...lignes)));
const web = (source: string) => genererProjetWeb(compiler(source).application!, { nom: 'site', adresse: 'http://localhost', source: 's.humalis' });
const ADMIN = [
  'page "accueil" :',
  '>titre "Accueil"',
  'page "admin" :',
  '>ligne :',
  '>>lien "Commandes" vers "commandes"',
  '>>sous page',
  'page "commandes" dans "admin" :',
  '>titre "Commandes"',
  'page "tableau" dans "admin" adresse "/admin" :',
  '>titre "Tableau"',
];

describe('sous-pages — parseur', () => {
  it('lit « dans "parent" » avant l\'adresse, et la ligne « sous page »', () => {
    const pages = lire(...ADMIN).pages;
    expect(pages[2]).toMatchObject({ nom: 'commandes', parent: 'admin' });
    expect(pages[3]).toMatchObject({ parent: 'admin', adresse: '/admin' });
    const ligne = pages[1].corps[0] as { corps: { type: string }[] };
    expect(ligne.corps[1]).toMatchObject({ type: 'SousPage' });
  });

  it("montre l'ordre quand l'en-tête est dans le désordre", () => {
    expect(() => lire('page "a" adresse "/a" dans "b" :', '>titre "x"')).toThrow(/l'ordre est : dans/);
    expect(() => lire('page "a" reservee a connecte adresse "/a" :', '>titre "x"')).toThrow(/l'ordre est/);
  });
});

describe('sous-pages — analyse', () => {
  it('accepte un parent, ses enfants et une sous-page d\'index', () => {
    expect(erreurs(programme(...ADMIN))).toEqual([]);
  });

  it('refuse un parent inconnu, en listant les pages', () => {
    const e = erreurs(programme('page "admin" :', '>sous page', 'page "commandes" dans "admine" :', '>titre "x"')).join('\n');
    expect(e).toMatch(/veut être dans « admine », qui n'existe pas. Pages : admin, commandes/);
  });

  it('refuse une page dans elle-même et les cycles', () => {
    expect(erreurs(programme('page "a" dans "a" :', '>titre "x"')).join('\n')).toMatch(/dans elle-même/);
    const cycle = erreurs(programme('page "a" dans "b" :', '>sous page', 'page "b" dans "a" :', '>sous page')).join('\n');
    expect(cycle).toMatch(/tournent pas en rond/);
  });

  it('demande « sous page » au parent, et le refuse ailleurs', () => {
    expect(erreurs(programme('page "admin" :', '>titre "A"', 'page "c" dans "admin" :', '>titre "C"')).join('\n')).toMatch(/pas d'endroit pour les montrer : écrivez « sous page »/);
    expect(erreurs(programme('page "a" :', '>sous page')).join('\n')).toMatch(/« sous page » est écrit dans la page « a », qui n'a aucune sous-page/);
  });

  it("vérifie que l'adresse d'un enfant commence par celle de son parent", () => {
    const e = erreurs(programme('page "admin" :', '>sous page', 'page "c" dans "admin" adresse "/boutique/x" :', '>titre "C"')).join('\n');
    expect(e).toMatch(/l'adresse « \/boutique\/x » de « c » ne commence pas par celle de son parent « \/admin »/);
  });

  it('refuse un parent à paramètre', () => {
    const e = erreurs(programme('page "admin" avec parametre id :', '>sous page', 'page "c" dans "admin" :', '>titre "C"')).join('\n');
    expect(e).toMatch(/le parent d'une sous-page n'a pas de paramètre/);
  });

  it('refuse deux sous-pages d\'index', () => {
    const e = erreurs(programme('page "admin" :', '>sous page', 'page "a" dans "admin" adresse "/admin" :', '>titre "A"', 'page "b" dans "admin" adresse "/admin" :', '>titre "B"')).join('\n');
    expect(e).toMatch(/toutes deux la sous-page d'index/);
  });

  it('un enfant n\'est pas moins protégé que son parent', () => {
    const session = ['source "api" :', '>adresse "https://api.exemple.cd"', '>session astratra', ''];
    const e = erreurs(
      programme(...session, 'page "connexion" :', '>titre "K"', 'page "admin" reservee a admin :', '>sous page', 'page "c" dans "admin" reservee a connecte :', '>titre "C"'),
    ).join('\n');
    expect(e).toMatch(/une sous-page peut être plus protégée que son parent, jamais moins/);
  });
});

describe('sous-pages — web', () => {
  const fichiers = web(programme(...ADMIN));
  it('écrit des routes imbriquées, avec l\'index et l\'Outlet', () => {
    const main = fichiers.get('src/main.tsx')!;
    expect(main).toMatch(/<Route path="\/admin" element=\{<Admin \/>\}>/);
    expect(main).toMatch(/<Route path="commandes" element=\{<Commandes \/>\} \/>/);
    expect(main).toMatch(/<Route index element=\{<Tableau \/>\} \/>/);
    const admin = fichiers.get('src/pages/Admin.tsx')!;
    expect(admin).toContain('<Outlet />');
    expect(admin).toContain("import { Outlet, useOutlet } from 'react-router';");
  });

  it('donne à une sous-page sans adresse celle de son parent suivie de son nom', () => {
    expect(fichiers.get('src/pages/Admin.tsx')).toContain('to="/admin/commandes"');
  });

  it('une garde sur le parent enveloppe les enfants', () => {
    const session = ['source "api" :', '>adresse "https://api.exemple.cd"', '>session astratra', ''];
    const main = web(programme(...session, 'page "accueil" :', '>titre "A"', 'page "connexion" :', '>titre "K"', 'page "admin" reservee a connecte :', '>sous page', 'page "c" dans "admin" :', '>titre "C"')).get('src/main.tsx')!;
    expect(main).toMatch(/<Route element=\{<Reservee qui="connecte" sinon="\/connexion" \/>\}>\s+<Route path="\/admin" element=\{<Admin \/>\}>\s+<Route path="c" element=\{<C \/>\} \/>/);
  });
});

const CATALOGUE = [
  'page "catalogue" avec filtre categorie et filtre tri nombre :',
  '>variable n = 0',
  '>si categorie est rien :',
  '>>texte "Tout"',
  '>sinon :',
  '>>texte "Catégorie {categorie}"',
  '>lien "Tout" vers "catalogue"',
  '>lien "Costumes" vers "catalogue" avec categorie "costumes"',
  '>bouton "Maillots"',
  '>quand l\'utilisateur clique sur "Maillots" :',
  '>>changer categorie par "maillots"',
  '>>changer tri par 2',
  'page "accueil" :',
  '>lien "Les costumes" vers "catalogue" avec categorie "costumes" et tri 3',
  '>bouton "Reset"',
  '>quand l\'utilisateur clique sur "Reset" :',
  '>>rediriger vers "catalogue" avec categorie "robes"',
];

describe('filtres d\'adresse — parseur et analyse', () => {
  it('lit les filtres, texte par défaut et nombre quand c\'est écrit', () => {
    const [page] = lire('page "c" avec parametre id et filtre categorie et filtre tri nombre :', '>titre "x"').pages;
    expect(page.parametres).toEqual(['id']);
    expect(page.filtres).toMatchObject([{ nom: 'categorie' }, { nom: 'tri', nombre: true }]);
  });

  it('accepte le programme complet', () => {
    expect(erreurs(programme(...CATALOGUE))).toEqual([]);
  });

  it('refuse un filtre inconnu dans un lien, en listant les filtres', () => {
    const e = erreurs(programme('page "c" avec filtre categorie et filtre tri :', '>titre "x"', 'page "a" :', '>lien "x" vers "c" avec marque "bleu"')).join('\n');
    expect(e).toMatch(/« marque » n'est ni un paramètre ni un filtre de la page « c ». .*Filtres : categorie, tri/);
  });

  it('refuse un filtre et un paramètre du même nom', () => {
    expect(erreurs(programme('page "c" avec parametre id et filtre id :', '>titre "x"')).join('\n')).toMatch(/à la fois un paramètre et un filtre/);
  });

  it('refuse « changer » sur un paramètre', () => {
    const e = erreurs(programme('page "c" avec parametre id :', '>bouton "x"', '>quand l\'utilisateur clique sur "x" :', '>>changer id par "2"')).join('\n');
    expect(e).toMatch(/un paramètre vient du chemin de l'adresse/);
  });

  it('refuse un filtre nombre auquel on donne un texte', () => {
    expect(erreurs(programme('page "c" avec filtre tri nombre :', '>titre "x"', 'page "a" :', '>lien "x" vers "c" avec tri "haut"')).join('\n')).toMatch(/le filtre « tri » de la page « c » est un nombre/);
    expect(erreurs(programme('page "c" avec filtre tri nombre :', '>bouton "x"', '>quand l\'utilisateur clique sur "x" :', '>>changer tri par "haut"')).join('\n')).toMatch(/le filtre « tri » est un nombre/);
  });

  it('un filtre ne peut pas porter le nom d\'une option', () => {
    expect(erreurs(programme('page "c" avec filtre couleur :', '>titre "x"')).join('\n')).toMatch(/ne peut pas nommer un filtre/);
  });
});

describe('filtres d\'adresse — web', () => {
  const fichiers = web(programme(...CATALOGUE));
  const page = fichiers.get('src/pages/Catalogue.tsx')!;
  it('lit les filtres dans la requête de l\'adresse', () => {
    expect(page).toContain('const [filtresAdresse, setFiltresAdresse] = useSearchParams();');
    expect(page).toContain("const categorie = lireFiltre(filtresAdresse, 'categorie');");
    expect(page).toContain("const tri = lireFiltreNombre(filtresAdresse, 'tri');");
    expect(page).toContain('categorie === null');
  });

  it('« changer » change l\'adresse', () => {
    expect(page).toContain("changerFiltre(setFiltresAdresse, 'categorie', 'maillots');");
    expect(page).toContain("changerFiltre(setFiltresAdresse, 'tri', 2);");
  });

  it('les liens et redirections donnent les filtres dans la requête', () => {
    expect(page).toContain('<Lien to={`/catalogue${adresseAvecFiltres({ categorie: \'costumes\' })}`} filtres={["categorie", "tri"]}');
    const accueil = fichiers.get('src/pages/Accueil.tsx')!;
    expect(accueil).toContain("adresseAvecFiltres({ categorie: 'costumes', tri: 3 })");
    expect(accueil).toContain("naviguer(`/catalogue${adresseAvecFiltres({ categorie: 'robes' })}`);");
  });

  it('écrit les aides de navigation et le défilement', () => {
    expect(fichiers.get('src/humalis/navigation.tsx')).toContain('export function changerFiltre');
    expect(fichiers.get('src/main.tsx')).toContain('<Defilement />');
  });

  it('remet en haut la fenêtre et la racine, si le CSS du site en fait la zone qui défile', () => {
    const navigation = fichiers.get('src/humalis/navigation.tsx')!;
    expect(navigation).toContain('window.scrollTo(0, 0);');
    expect(navigation).toContain("document.getElementById('racine')?.scrollTo(0, 0);");
  });
});

describe('ancres', () => {
  const CARTE = [
    'page "carte" :',
    '>lien "Aller aux desserts" vers "#desserts"',
    '>section "Plats" avec ancre "plats" :',
    '>>texte "Liboke"',
    '>section "Desserts" avec ancre "desserts" :',
    '>>texte "Beignets"',
    'page "accueil" :',
    '>lien "Nos desserts" vers "carte#desserts"',
  ];

  it('lit l\'ancre d\'un bloc et d\'un élément', () => {
    const [page] = lire('page "p" :', '>section "S" avec ancre "haut" :', '>>texte "x" avec ancre "bas"').pages;
    const bloc = page.corps[0] as { ancre?: string; corps: { ancre?: string }[] };
    expect(bloc.ancre).toBe('haut');
    expect(bloc.corps[1].ancre).toBe('bas');
  });

  it('accepte les liens vers une ancre de la page ou d\'une autre page', () => {
    expect(erreurs(programme(...CARTE))).toEqual([]);
  });

  it('refuse une ancre qui n\'existe pas, en listant celles qui existent', () => {
    const e = erreurs(programme(...CARTE.slice(0, -1), '>lien "x" vers "carte#dessert"')).join('\n');
    expect(e).toMatch(/l'ancre « dessert » n'existe pas dans la page « carte ». Ancres : plats, desserts\./);
    const ici = erreurs(programme('page "a" :', '>lien "x" vers "#nulle part"', '>texte "y" avec ancre "ici"')).join('\n');
    expect(ici).toMatch(/n'existe pas dans cette page/);
  });

  it('refuse deux ancres de même nom dans une page, et un nom invalide', () => {
    expect(erreurs(programme('page "a" :', '>texte "x" avec ancre "z"', '>texte "y" avec ancre "z"')).join('\n')).toMatch(/l'ancre « z » est déjà utilisée dans la page « a »/);
    expect(erreurs(programme('page "a" :', '>texte "x" avec ancre "à voir"')).join('\n')).toMatch(/n'est pas valable/);
  });

  it('produit des id, des liens avec #, et le composant de défilement', () => {
    const fichiers = web(programme(...CARTE));
    const carte = fichiers.get('src/pages/Carte.tsx')!;
    expect(carte).toContain('<Lien to="#desserts"');
    expect(carte).toContain('<section className="humalis-section" id="desserts">');
    expect(fichiers.get('src/pages/Accueil.tsx')).toContain('<Lien to="/carte#desserts"');
    expect(fichiers.get('src/main.tsx')).toContain('<Defilement />');
  });
});

describe('revenir et liens externes', () => {
  const EXTERNES = [
    'page "accueil" :',
    '>lien "WhatsApp" vers "https://wa.me/243000" avec nouvel onglet',
    '>lien "Écrire" vers "mailto:rey@exemple.cd"',
    '>lien "Appeler" vers "tel:+243000"',
    '>bouton "Retour"',
    '>quand l\'utilisateur clique sur "Retour" :',
    '>>revenir',
    '>bouton "Catalogue"',
    '>quand l\'utilisateur clique sur "Catalogue" :',
    '>>revenir vers "accueil"',
  ];

  it('lit « revenir » seul ou avec « vers »', () => {
    const [page] = lire(...EXTERNES).pages;
    const evenements = page.corps.filter((c) => c.type === 'Evenement') as { corps: { action: string; arguments: unknown[] }[] }[];
    expect(evenements[0].corps[0]).toMatchObject({ action: 'revenir', arguments: [] });
    expect(evenements[1].corps[0].arguments).toHaveLength(1);
  });

  it('accepte https, mailto et tel', () => {
    expect(erreurs(programme(...EXTERNES))).toEqual([]);
  });

  it('refuse javascript: et data:', () => {
    expect(erreurs(programme('page "a" :', '>lien "x" vers "javascript:alert(1)"')).join('\n')).toMatch(/refusée/);
    expect(erreurs(programme('page "a" :', '>bouton "x"', '>quand l\'utilisateur clique sur "x" :', '>>rediriger vers "data:text/html,x"')).join('\n')).toMatch(/refusée/);
  });

  it('refuse « revenir vers » une page qui n\'existe pas', () => {
    expect(erreurs(programme('page "a" :', '>bouton "x"', '>quand l\'utilisateur clique sur "x" :', '>>revenir vers "catalogu"')).join('\n')).toMatch(/la page n'existe pas/);
  });

  it('refuse « nouvel onglet » sur autre chose qu\'un lien', () => {
    expect(erreurs(programme('page "a" :', '>bouton "x" avec nouvel onglet')).join('\n')).toMatch(/s'applique à un lien/);
  });

  it('produit des liens externes sûrs sur le web', () => {
    const accueil = web(programme(...EXTERNES)).get('src/pages/Accueil.tsx')!;
    expect(accueil).toContain('<a href="https://wa.me/243000" target="_blank" rel="noopener noreferrer"');
    expect(accueil).toContain('<a href="mailto:rey@exemple.cd" ');
    expect(accueil).toContain('<a href="tel:+243000" ');
    expect(accueil).toContain('revenirEnArriere(naviguer, location.key);');
    expect(accueil).toContain("revenirEnArriere(naviguer, location.key, '/');");
  });

  it('vérifie le schéma d\'une adresse reçue au moment d\'y aller', () => {
    const f = web(programme('page "a" :', '>variable url = "https://wa.me/1"', '>bouton "x"', '>quand l\'utilisateur clique sur "x" :', '>>rediriger vers url'));
    expect(f.get('src/pages/A.tsx')).toContain('allerVers(naviguer, String(url), afficherMessage);');
    const nav = f.get('src/humalis/navigation.tsx')!;
    expect(nav).toContain("const SCHEMAS = ['http', 'https', 'mailto', 'tel'];");
    expect(nav).toContain('Adresse refusée');
  });
});

describe('lien actif et menu', () => {
  const MENU = ['page "accueil" :', '>menu :', '>>lien "Accueil" vers "accueil"', '>>lien "Carte" vers "carte"', 'page "carte" :', '>titre "Carte"'];

  it('« menu » est un bloc qui devient un <nav> sur le web', () => {
    const accueil = web(programme(...MENU)).get('src/pages/Accueil.tsx')!;
    expect(accueil).toContain('<nav className="humalis-menu">');
    expect(accueil).toContain('</nav>');
  });

  it('un lien vers une page est un <Lien> qui marque la page courante', () => {
    const fichiers = web(programme(...MENU));
    expect(fichiers.get('src/pages/Accueil.tsx')).toContain("import { Lien } from '../humalis/navigation';");
    const nav = fichiers.get('src/humalis/navigation.tsx')!;
    expect(nav).toContain("'humalis-actif'");
    expect(nav).toContain("aria-current={actif ? 'page' : undefined}");
  });

  it('« menu » reste un nom de variable possible', () => {
    expect(erreurs(programme('page "a" :', '>variable menu = 1', '>texte "{menu}"'))).toEqual([]);
  });
});

describe('cibles qui ne les produisent pas encore', () => {
  it('le mobile et le statique le disent clairement', () => {
    const application = compiler(programme(...ADMIN, ...CATALOGUE.map((l) => l))).application;
    // Les noms de pages se répètent : on ne garde que les sous-pages.
    const sous = compiler(programme(...ADMIN)).application!;
    for (const cible of ['mobile', 'statique'] as const) {
      const messages = verifierNavigationPourLaCible(sous, cible).map((d) => d.message).join('\n');
      expect(messages).toMatch(/sous-page/);
    }
    expect(application).toBeUndefined();
  });
});
