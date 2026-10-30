import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { compilerProjet } from '../src/fichiers.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile, verifierPourLeMobile } from '../src/cibles/mobile/projet.js';
import { encreSur, contraste, normaliserCouleur, lireCouleur } from '../src/analyse/couleurs.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

const THEME = programme(
  'theme :',
  '>couleur marque clair "#0e5a6b" sombre "#5fc3d6"',
  '>couleur sable "#f3e9d2"',
  '>police titres "Playfair Display" depuis "./playfair.woff2"',
  '>police texte "Georgia"',
  '>mode automatique',
  '>largeur large',
  '',
);
const PAGE = programme(
  'page "accueil" :',
  '>titre "Le Fleuve" avec couleur marque',
  '>bouton "Réserver" avec fond marque et texte sable',
  '>bouton "Sombre"',
  '>quand l\'utilisateur clique sur "Sombre" :',
  '>>changer theme par sombre',
);
const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const polices = new Map([['./playfair.woff2', 'QUJD']]);
const web = (source: string) => genererProjetWeb(compile(source), { nom: 'essai', adresse: 'https://exemple.cd', source: 'essai.humalis', polices });

describe('les couleurs', () => {
  it('lit #rgb et #rrggbb', () => {
    expect(lireCouleur('#fff')).toEqual([255, 255, 255]);
    expect(normaliserCouleur('#0E5A6B')).toBe('#0e5a6b');
    expect(normaliserCouleur('#abc')).toBe('#aabbcc');
    expect(normaliserCouleur('bleu')).toBeUndefined();
  });
  it('choisit l’encre la plus lisible', () => {
    expect(encreSur('#0e5a6b')).toBe('#ffffff');
    expect(encreSur('#f3e9d2')).toBe('#1d1d1f');
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
});

describe('le thème — le parser', () => {
  const prog = () => analyserSyntaxe(analyser(THEME + PAGE));

  it('lit les couleurs, les polices, le mode et la largeur', () => {
    expect(prog().theme).toMatchObject({
      couleurs: [{ nom: 'marque', clair: '#0e5a6b', sombre: '#5fc3d6' }, { nom: 'sable', clair: '#f3e9d2' }],
      polices: [{ role: 'titres', nom: 'Playfair Display', fichier: './playfair.woff2' }, { role: 'texte', nom: 'Georgia' }],
      mode: { valeur: 'automatique' },
      largeur: { valeur: 'large' },
    });
  });

  it('explique ce qui ne va pas', () => {
    const message = (source: string) => compiler(source + '\npage "p" :\n    titre "a"').diagnostics[0].message;
    expect(message('theme :\n    couleur marque #0e5a6b')).toContain('entre guillemets');
    expect(message('theme :\n    couleur marque "bleu"')).toContain('n’est pas une couleur');
    expect(message('theme :\n    couleur marque clair "#000000"')).toContain('il manque « sombre »');
    expect(message('theme :\n    couleur marque "#000"\n    couleur marque "#fff"')).toContain('déjà déclarée');
    expect(message('theme :\n    couleur encre "#000"')).toContain('pris par le thème');
    expect(message('theme :\n    police gras "Arial"')).toContain('n’est pas un rôle de police');
    expect(message('theme :\n    police texte "A" depuis "a.exe"')).toContain('doit finir par');
    expect(message('theme :\n    mode rose')).toContain('Valeurs possibles : automatique, clair, sombre');
    expect(message('theme :\n    taille 3')).toContain('n’est pas une ligne du thème');
    expect(message('theme :\n    mode clair\ntheme :\n    mode sombre')).toContain('un seul bloc « theme »');
  });

  it('« theme » reste un nom de variable ailleurs', () => {
    expect(erreurs(programme('page "p" :', '>variable theme = 1', '>texte "{theme}"'))).toEqual([]);
  });

  it('un projet à plusieurs fichiers n’a qu’un thème', () => {
    const fichiers: Record<string, string> = {
      'a.humalis': 'utiliser fichier "./b.humalis"\ntheme :\n    mode clair\npage "a" :\n    titre "a"\n',
      'b.humalis': 'theme :\n    mode sombre\npage "b" :\n    titre "b"\n',
    };
    const { diagnostics } = compilerProjet('a.humalis', (c) => fichiers[c.replace(/^\.\//, '')], fichiers['a.humalis']);
    expect(diagnostics.some((d) => d.message.includes('un seul bloc « theme »') && d.fichier === 'b.humalis')).toBe(true);
  });
});

describe('le thème — l’analyse', () => {
  it('accepte les couleurs du thème comme les couleurs de base', () => {
    expect(erreurs(THEME + PAGE)).toEqual([]);
  });

  it('refuse une couleur inconnue en citant celles du thème', () => {
    const [e] = erreurs(THEME + programme('page "p" :', '>titre "a" avec couleur turquoise'));
    expect(e).toContain('les couleurs du thème : marque, sable');
  });

  it('sans thème, une couleur du thème n’existe pas', () => {
    expect(erreurs(programme('page "p" :', '>titre "a" avec couleur marque'))[0]).toContain('« marque » n\'est pas une valeur possible');
  });

  it('avertit d’un texte qui se verrait mal, pas d’un fond', () => {
    expect(avertissements(THEME + programme('page "p" :', '>titre "a" avec couleur sable'))[0]).toContain('« sable » (mode clair) se voit mal');
    expect(avertissements(THEME + programme('page "p" :', '>titre "a" avec fond sable'))).toEqual([]);
  });

  it('« changer theme » prend clair, sombre ou automatique', () => {
    const source = (v: string) => programme('page "p" :', '>bouton "T"', '>quand l\'utilisateur clique sur "T" :', `>>changer theme par ${v}`);
    expect(erreurs(source('clair'))).toEqual([]);
    expect(erreurs(source('"automatique"'))).toEqual([]);
    expect(erreurs(source('"bleu"'))[0]).toContain('prend clair, sombre ou automatique');
  });

  it('« changer theme par 3 » est le changement d’une variable nommée theme', () => {
    expect(erreurs(programme('page "p" :', '>variable theme = 1', '>bouton "T"', '>quand l\'utilisateur clique sur "T" :', '>>changer theme par 3'))).toEqual([]);
  });
});

describe('le thème — la représentation intermédiaire', () => {
  it('calcule l’encre de chaque couleur et garde les valeurs par défaut', () => {
    const { theme } = compile(THEME + PAGE);
    expect(theme).toMatchObject({
      mode: 'automatique',
      largeur: 'large',
      couleurs: [
        { nom: 'marque', clair: '#0e5a6b', sombre: '#5fc3d6', encreClair: '#ffffff', encreSombre: '#1d1d1f' },
        { nom: 'sable', clair: '#f3e9d2', sombre: '#f3e9d2', encreClair: '#1d1d1f' },
      ],
    });
    expect(compile(programme('page "p" :', '>titre "a"')).theme).toBeUndefined();
  });

  it('« changer theme » devient une action', () => {
    const gestionnaire = compile(THEME + PAGE).ecrans[0].gestionnaires[0];
    expect(gestionnaire.actions).toEqual([{ type: 'theme', valeur: 'sombre' }]);
  });
});

describe('le thème — le web', () => {
  const fichiers = web(THEME + PAGE);
  const css = fichiers.get('src/humalis/styles.css')!;

  it('écrit les couleurs, claires puis sombres, et leurs classes', () => {
    expect(css).toContain('--humalis-marque: #0e5a6b;');
    expect(css).toContain('--humalis-marque-encre: #ffffff;');
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\n  :root \{[\s\S]*--humalis-marque: #5fc3d6;/);
    expect(css).toContain('.humalis-fond-marque { background: var(--humalis-marque); color: var(--humalis-marque-encre); border-color: transparent; }');
    expect(css).toContain('.humalis-couleur-marque, .humalis-texte-marque { color: var(--humalis-marque); }');
  });

  it('met les couleurs du thème en classes dans la page', () => {
    const page = [...fichiers.entries()].find(([n]) => n.endsWith('Accueil.tsx'))![1];
    expect(page).toContain('humalis-couleur-marque');
    expect(page).toContain('humalis-fond-marque humalis-texte-sable');
  });

  it('intègre la police du fichier dans le CSS, sans appel réseau', () => {
    expect(css).toContain("font-family: 'Playfair Display';");
    expect(css).toContain('url(data:font/woff2;base64,QUJD)');
    expect(css).toContain("h1, h2, h3, h4, h5, h6 { font-family: 'Playfair Display', 'Georgia', system-ui");
    expect(css).toContain("body { font-family: 'Georgia', system-ui");
    expect(css).not.toContain('googleapis');
  });

  it('règle la largeur des pages', () => {
    expect(css).toContain('.humalis-page { max-width: 72rem; }');
  });

  it('écrit les règles data-theme et le script de <head> quand la page change le thème', () => {
    expect(css).toContain(':root[data-theme="sombre"] {\n  color-scheme: dark;');
    expect(css).toContain(':root[data-theme="clair"] {');
    expect(fichiers.get('index.html')).toContain("localStorage.getItem('humalis-theme')");
    expect(fichiers.get('src/humalis/theme.ts')).toContain('export function definirTheme');
    const page = [...fichiers.entries()].find(([n]) => n.endsWith('Accueil.tsx'))![1];
    expect(page).toContain("definirTheme('sombre');");
    expect(page).toContain("import { definirTheme } from '../humalis/theme';");
  });

  it('n’écrit rien de tout cela sans thème', () => {
    const sans = web(programme('page "p" :', '>titre "a"'));
    expect(sans.has('src/humalis/theme.ts')).toBe(false);
    expect(sans.get('index.html')).not.toContain('humalis-theme');
    expect(sans.get('src/humalis/styles.css')).not.toContain('data-theme');
  });

  it('le mode fixé par le projet est écrit sur <html>', () => {
    const sombre = web(programme('theme :', '>mode sombre', '', 'page "p" :', '>titre "a"'));
    expect(sombre.get('index.html')).toContain('<html lang="fr" data-theme="sombre">');
    expect(sombre.get('src/humalis/styles.css')).toContain(':root[data-theme="sombre"]');
  });

  it('redéfinit une couleur de base', () => {
    const css2 = web(programme('theme :', '>couleur bleu clair "#112233" sombre "#8899aa"', '', 'page "p" :', '>titre "a" avec couleur bleu')).get('src/humalis/styles.css')!;
    expect(css2).toContain('--humalis-bleu: #112233;');
    expect(css2.match(/\.humalis-couleur-bleu,/g)).toHaveLength(1);
  });

  it('exige que le fichier de police ait été lu', () => {
    expect(() => genererProjetWeb(compile(THEME + PAGE), { nom: 'e', adresse: 'https://x.cd', source: 'e.humalis' })).toThrow('n\'a pas été lu');
  });
});

describe('le thème — le site statique', () => {
  const fichiers = genererProjetStatique(compile(THEME + PAGE), { nom: 'essai', source: 'essai.humalis', polices });

  it('écrit le même CSS, le script de <head> et definirTheme', () => {
    expect(fichiers.get('humalis/styles.css')).toContain('--humalis-marque: #0e5a6b;');
    expect(fichiers.get('index.html')).toContain("localStorage.getItem('humalis-theme')");
    expect(fichiers.get('humalis/humalis.js')).toContain('function definirTheme(theme)');
    expect(fichiers.get('pages/accueil.js')).toContain("definirTheme('sombre');");
  });

  it('sans changement de thème, humalis.js n’a pas definirTheme', () => {
    const sans = genererProjetStatique(compile(THEME + programme('page "p" :', '>titre "a"')), { nom: 'e', source: 'e.humalis', polices });
    expect(sans.get('humalis/humalis.js')).not.toContain('definirTheme');
  });
});

describe('le thème — le mobile', () => {
  const application = compile(THEME + PAGE);
  const fichiers = genererProjetMobile(application, { nom: 'essai', source: 'essai.humalis' });

  it('range les couleurs du thème dans le StyleSheet, en clair et en sombre', () => {
    const styles = fichiers.get('humalis/styles.ts')!;
    expect(styles).toContain("couleurMarque: { color: '#0e5a6b' },");
    expect(styles).toContain("couleurMarque: { color: '#5fc3d6' },");
    expect(styles).toContain("fondMarque: { backgroundColor: '#0e5a6b', borderColor: 'transparent' },");
    expect(styles).toContain("encreMarque: { color: '#ffffff' },");
    expect(styles).toContain("marque: '#0e5a6b'");
    expect(fichiers.get('app/index.tsx')).toContain('s.couleurMarque');
  });

  it('change le thème avec Appearance', () => {
    expect(fichiers.get('humalis/theme.ts')).toContain('Appearance.setColorScheme');
    expect(fichiers.get('app/index.tsx')).toContain("definirTheme('sombre');");
  });

  it('avertit des polices, pas encore chargées', () => {
    expect(verifierPourLeMobile(application).map((d) => d.message)).toContain(
      'les polices du bloc « theme » ne sont pas encore chargées sur le téléphone : la police du système est utilisée.',
    );
  });

  it('fixe le mode du projet', () => {
    const f = genererProjetMobile(compile(programme('theme :', '>mode sombre', '', 'page "p" :', '>titre "a"')), { nom: 'e', source: 'e.humalis' });
    expect(f.get('humalis/styles.ts')).toContain("Appearance.setColorScheme('dark');");
  });
});

describe('le thème — changé depuis l’en-tête commun', () => {
  const source = 'entete :\n    bouton "Sombre"\n    quand l\'utilisateur clique sur "Sombre" :\n        changer theme par sombre\n\npage "p" :\n    titre "a"';

  it('le web, le statique et le mobile reçoivent l’outil', () => {
    const application = compile(source);
    expect(genererProjetWeb(application, { nom: 'e', adresse: 'https://x.cd', source: 'e.humalis' }).has('src/humalis/theme.ts')).toBe(true);
    expect(genererProjetStatique(application, { nom: 'e', source: 'e.humalis' }).get('humalis/humalis.js')).toContain('function definirTheme(theme)');
    expect(genererProjetMobile(application, { nom: 'e', source: 'e.humalis' }).has('humalis/theme.ts')).toBe(true);
  });
});

// Manque n° 1 du site public : « basculer theme » passe au thème inverse de celui qu'on voit.
describe('basculer theme', () => {
  const source = programme('theme :', '>mode sombre', '', 'page "p" :', '>titre "a"', '>bouton "Thème"', '>quand l\'utilisateur clique sur "Thème" :', '>>basculer theme');

  it('est accepté, et seulement dans un événement', () => {
    expect(erreurs(source)).toEqual([]);
    expect(erreurs(programme('page "p" :', '>titre "a"', '>basculer theme')).join('\n')).toMatch(/événement/);
  });

  it('web : appelle definirTheme(\'bascule\'), qui choisit l’inverse du thème affiché', () => {
    const fichiers = genererProjetWeb(compiler(source).application!, { nom: 'a', adresse: 'https://a.fr', source: 'a.humalis' });
    const page = [...fichiers.entries()].find(([n]) => n.endsWith('P.tsx'))![1];
    expect(page).toContain("definirTheme('bascule');");
    const theme = fichiers.get('src/humalis/theme.ts')!;
    expect(theme).toContain("'bascule'");
    expect(theme).toContain('prefers-color-scheme: dark');
  });

  it('statique et mobile : la même bascule', () => {
    const { application } = compiler(source);
    const statique = [...genererProjetStatique(application!, { nom: 'a', source: 'a.humalis' }).values()].join('\n');
    expect(statique).toContain("definirTheme('bascule')");
    expect(statique).toContain("theme === 'bascule'");
    const mobile = [...genererProjetMobile(application!, { nom: 'a', source: 'a.humalis' }).values()].join('\n');
    expect(mobile).toContain("definirTheme('bascule')");
    expect(mobile).toContain("demande === 'bascule'");
  });
});

// Manque n° 1 du site public : « si theme est sombre : » lit le thème affiché, suivi en direct.
describe('si theme est sombre', () => {
  const source = programme(
    'theme :', '>mode automatique', '',
    'page "p" :', '>titre "a"',
    '>si theme est sombre :', '>>texte "Nuit"',
    '>si theme est clair :', '>>texte "Jour"',
    '>si theme n\'est pas sombre :', '>>texte "Pas nuit"',
    '>bouton "B"', '>quand l\'utilisateur clique sur "B" :', '>>si theme est sombre :', '>>>changer theme par clair', '>>sinon :', '>>>changer theme par sombre',
  );

  it('est accepté dans la page et dans un événement', () => {
    expect(erreurs(source)).toEqual([]);
  });

  it('une variable nommée theme se compare toujours comme avant', () => {
    expect(erreurs(programme('page "p" :', '>titre "a"', '>variable theme = "x"', '>si theme est egal a "x" :', '>>texte "ok"'))).toEqual([]);
  });

  it('web et mobile : un crochet suivi en direct', () => {
    const fichiers = genererProjetWeb(compiler(source).application!, { nom: 'a', adresse: 'https://a.fr', source: 'a.humalis' });
    const page = [...fichiers.entries()].find(([n]) => n.endsWith('P.tsx'))![1];
    expect(page).toContain('const themeSombre = useThemeSombre();');
    expect(page).toContain('themeSombre');
    expect(page).toContain('!themeSombre');
    expect(fichiers.get('src/humalis/temps.ts')).toContain('export function useThemeSombre');
    const mobile = genererProjetMobile(compiler(source).application!, { nom: 'a', source: 'a.humalis' });
    expect([...mobile.values()].join('\n')).toContain('useColorScheme');
  });

  it('statique : themeSombre(), relu à chaque dessin', () => {
    const statique = [...genererProjetStatique(compiler(source).application!, { nom: 'a', source: 'a.humalis' }).values()].join('\n');
    expect(statique).toContain('themeSombre()');
    expect(statique).toContain('const themeSombre = ');
  });
});

describe('le contraste avec un seul mode', () => {
  const avertissements = (source: string) => compiler(source).diagnostics.filter((d) => d.gravite === 'avertissement').map((d) => d.message);
  const page = 'page "a" :\n    titre "A" avec couleur marque\n    bouton "B" avec fond marque et texte blanc\n';

  it('« mode clair » ne vérifie pas les couleurs en mode sombre', () => {
    expect(avertissements(`theme :\n    couleur marque "#9a3412"\n    mode clair\n\n${page}`).join('\n')).not.toMatch(/sombre/);
  });

  it('un bouton qui change le thème garde la vérification des deux modes', () => {
    const source = `theme :\n    couleur marque "#9a3412"\n    mode clair\n\n${page}    bouton "Thème"\n    quand l'utilisateur clique sur "Thème" :\n        basculer theme\n`;
    expect(avertissements(source).join('\n')).toMatch(/mode sombre/);
  });
});
