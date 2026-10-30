import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from './aide-qualite.js';
import { compilerProjet } from './aide-qualite.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { erreurs, avertissements } from './analyse/aide.js';

const SOURCE = `entete avec colle :
    ligne avec repartition entre :
        lien "Le Fleuve" vers "accueil"
        lien "Carte" vers "carte"

pied :
    texte "Ouvert de mardi à dimanche"

page "accueil" :
    titre "Bienvenue"

page "carte" :
    titre "La carte"

page "connexion" sans entete et sans pied :
    titre "Connexion"

page "mentions" sans pied :
    titre "Mentions"
`;

const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};

describe('en-tête et pied communs — le parser', () => {
  const programme = analyserSyntaxe(analyser(SOURCE));

  it('lit « entete » et « pied » avec leurs options', () => {
    expect(programme.entete).toMatchObject({ genre: 'entete', styles: [{ propriete: 'colle', valeur: 'haut' }], corps: [{ type: 'Bloc', genre: 'ligne' }] });
    expect(programme.pied).toMatchObject({ genre: 'pied', corps: [{ type: 'Element', element: 'texte' }] });
  });

  it('lit « sans entete » et « sans pied » après le nom de la page', () => {
    expect(programme.pages.map((p) => [p.sansEntete, p.sansPied])).toEqual([
      [undefined, undefined],
      [undefined, undefined],
      [true, true],
      [undefined, true],
    ]);
  });

  it('refuse un deuxième en-tête et un « sans » inconnu', () => {
    expect(() => analyserSyntaxe(analyser('entete :\n    texte "a"\nentete :\n    texte "b"\npage "p" :\n    texte "c"'))).toThrow('un seul « entete »');
    expect(() => analyserSyntaxe(analyser('page "p" sans menu :\n    texte "c"'))).toThrow('après « sans », il faut « entete » ou « pied »');
  });

  it('« entete » et « pied » restent des noms ailleurs', () => {
    expect(erreurs('page "p" :\n    variable entete = 1\n    variable pied = 2\n    texte "{entete} {pied}"')).toEqual([]);
  });
});

describe('en-tête et pied communs — l’analyse', () => {
  it('vérifie l’en-tête comme une page : liens, variables, session', () => {
    const faux = 'entete :\n    lien "Là" vers "nulle_part"\n\npage "p" :\n    texte "a"';
    expect(avertissements(faux)[0]).toContain('nulle_part');
    expect(erreurs('entete :\n    texte "{inconnue}"\n\npage "p" :\n    texte "a"')[0]).toContain('inconnue');
  });

  it('un événement se place sous son élément dans l’en-tête', () => {
    const source = 'variable ouvert = faux avec partagee\n\nentete :\n    bouton "Menu"\n    quand l\'utilisateur clique sur "Menu" :\n        changer ouvert par vrai\n\npage "p" :\n    texte "a"';
    expect(erreurs(source)).toEqual([]);
  });

  it('avertit d’une page « sans entete » quand il n’y en a pas', () => {
    expect(avertissements('page "p" sans entete :\n    texte "a"')[0]).toContain("se passe d'un en-tête, mais l'application n'en a pas");
    expect(avertissements(SOURCE)).toEqual([]);
  });

  it('refuse un réglage inconnu', () => {
    expect(erreurs('entete avec ombre geante :\n    texte "a"\n\npage "p" :\n    texte "a"')[0]).toContain('ombre');
  });

  it('un projet à plusieurs fichiers n’a qu’un en-tête', () => {
    const fichiers: Record<string, string> = {
      'a.humalis': 'utiliser fichier "./b.humalis"\nentete :\n    texte "a"\npage "a" :\n    titre "a"\n',
      'b.humalis': 'entete :\n    texte "b"\npage "b" :\n    titre "b"\n',
    };
    const { diagnostics } = compilerProjet('a.humalis', (c) => fichiers[c.replace(/^\.\//, '')], fichiers['a.humalis']);
    expect(diagnostics.some((d) => d.message.includes('un seul « entete »') && d.fichier === 'b.humalis')).toBe(true);
  });
});

describe('en-tête et pied communs — la représentation intermédiaire', () => {
  const application = compile(SOURCE);

  it('garde l’en-tête et le pied à part, avec leurs réglages', () => {
    expect(application.disposition?.entete).toMatchObject({ options: [{ nom: 'colle', valeur: 'haut' }], ecran: { parametres: [], vue: [{ type: 'bloc', genre: 'ligne' }] } });
    expect(application.disposition?.pied?.ecran.vue).toHaveLength(1);
    expect(application.ecrans.map((e) => e.nom)).toEqual(['accueil', 'carte', 'connexion', 'mentions']);
  });

  it('marque les pages qui s’en passent', () => {
    expect(application.ecrans[2]).toMatchObject({ sansEntete: true, sansPied: true });
    expect(application.ecrans[3]).toMatchObject({ sansPied: true });
    expect(application.ecrans[0].sansEntete).toBeUndefined();
  });
});

describe('en-tête et pied communs — le web', () => {
  const fichiers = genererProjetWeb(compile(SOURCE), { nom: 'e', adresse: 'https://x.cd', source: 'e.humalis' });

  it('monte l’en-tête et le pied une fois, dans des routes de disposition', () => {
    const main = fichiers.get('src/main.tsx')!;
    expect(main).toContain("import Disposition from './Disposition';");
    expect(main).toContain('<Route element={<Disposition />}>');
    // Une page sans en-tête ni pied n'est dans aucune disposition.
    expect(main).toMatch(/<\/Route>\s*<Route path="\/connexion"/);
    expect(main).toContain('<Route element={<Disposition pied={false} />}>');
    expect(main).toMatch(/<Disposition \/>[\s\S]*path="\/carte"/);
  });

  it('écrit Disposition.tsx avec les classes du bloc', () => {
    const d = fichiers.get('src/Disposition.tsx')!;
    expect(d).toContain('<header className="humalis-entete humalis-colle-haut">');
    expect(d).toContain('<footer className="humalis-pied">');
    expect(d).toContain('<Outlet />');
    // Un lien de l'en-tête est un <Lien> : il se marque actif sur sa page.
    expect(fichiers.get('src/composants/EnteteSite.tsx')).toContain('<Lien to="/carte"');
    expect(fichiers.get('src/humalis/navigation.tsx')).toContain('export function Lien');
    expect(fichiers.get('src/composants/PiedSite.tsx')).toContain('Ouvert de mardi à dimanche');
  });

  it('écrit le CSS de l’en-tête et du pied', () => {
    const css = fichiers.get('src/humalis/styles.css')!;
    expect(css).toContain('.humalis-entete {');
    expect(css).toContain('.humalis-pied {');
    expect(css).toContain('.humalis-colle-haut { position: sticky; top: 0;');
  });

  it('ne change rien sans en-tête ni pied', () => {
    const sans = genererProjetWeb(compile('page "p" :\n    titre "a"'), { nom: 'e', adresse: 'https://x.cd', source: 'e.humalis' });
    expect(sans.has('src/Disposition.tsx')).toBe(false);
    expect(sans.get('src/main.tsx')).not.toContain('Disposition');
  });
});

describe('en-tête et pied communs — le site statique', () => {
  const fichiers = genererProjetStatique(compile(SOURCE), { nom: 'e', source: 'e.humalis' });

  it('recopie l’en-tête et le pied dans chaque page, hors de la largeur du contenu', () => {
    const accueil = fichiers.get('index.html')!;
    expect(accueil).toContain('<main class="humalis-site">');
    expect(accueil).toContain('<header class="humalis-entete humalis-colle-haut">');
    expect(accueil).toContain('<div class="humalis-contenu humalis-page">');
    expect(accueil).toContain('<footer class="humalis-pied">');
    expect(fichiers.get('carte.html')).toContain('<header class="humalis-entete');
  });

  it('une page qui s’en passe ne les reçoit pas', () => {
    expect(fichiers.get('connexion.html')).not.toContain('<header');
    expect(fichiers.get('connexion.html')).not.toContain('<footer');
    expect(fichiers.get('mentions.html')).toContain('<header');
    expect(fichiers.get('mentions.html')).not.toContain('<footer');
  });

  it('refuse un nom d’élément ou de variable commun à la page et à l’en-tête', () => {
    const source = 'entete :\n    bouton "Menu"\n    quand l\'utilisateur clique sur "Menu" :\n        afficher "a"\n\npage "p" :\n    bouton "Menu"';
    expect(() => genererProjetStatique(compile(source), { nom: 'e', source: 'e.humalis' })).toThrow('existe dans la page');
  });

  it('recopie aussi les événements de l’en-tête dans le script de la page', () => {
    const source = 'entete :\n    variable ouvert = faux\n    bouton "Menu"\n    quand l\'utilisateur clique sur "Menu" :\n        changer ouvert par vrai\n    si ouvert est vrai :\n        texte "Ouvert"\n\npage "p" :\n    titre "a"';
    const f = genererProjetStatique(compile(source), { nom: 'e', source: 'e.humalis' });
    expect(f.get('pages/p.js') ?? [...f.entries()].find(([n]) => n.startsWith('pages/'))![1]).toContain('ouvert');
  });
});

describe('en-tête et pied communs — le mobile', () => {
  const fichiers = genererProjetMobile(compile(SOURCE), { nom: 'e', source: 'e.humalis' });

  it('met l’en-tête au-dessus de la pile et le pied en dessous', () => {
    const layout = fichiers.get('app/_layout.tsx')!;
    expect(layout).toContain("import EnteteSite from '../composants/EnteteSite';");
    expect(layout).toContain('headerShown: false');
    expect(layout).toContain('const SANS_ENTETE: string[] = ["/connexion"];');
    expect(layout).toContain('const SANS_PIED: string[] = ["/connexion", "/mentions"];');
    expect(layout.indexOf('<EnteteSite />')).toBeLessThan(layout.indexOf('<Stack'));
    expect(layout.indexOf('<Stack')).toBeLessThan(layout.indexOf('<PiedSite />'));
    expect(fichiers.get('composants/PiedSite.tsx')).toContain('Ouvert de mardi');
  });

  it('ne change rien sans en-tête ni pied', () => {
    const sans = genererProjetMobile(compile('page "p" :\n    titre "a"'), { nom: 'e', source: 'e.humalis' });
    expect(sans.get('app/_layout.tsx')).not.toContain('usePathname');
  });
});
