import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';

const source = [
  'style :',
  '    .grand-titre {',
  '        font-size: 3rem;',
  '        color: #1f5fbf;',
  '    }',
  '',
  '    #menu > a:hover { color: red; }',
  '',
  'utiliser style "./theme.css"',
  '',
  'page "accueil" :',
  '    titre "Bienvenue" avec style "grand-titre"',
  '    bouton "Go" avec fond vert et style "principal large"',
].join('\n');

describe('CSS — lexer et parser', () => {
  it('recopie le bloc style tel quel, sans le lire comme du Humalis', () => {
    const programme = analyserSyntaxe(analyser(source));
    expect(programme.styles).toEqual([
      {
        type: 'BlocStyle',
        css: '.grand-titre {\n    font-size: 3rem;\n    color: #1f5fbf;\n}\n\n#menu > a:hover { color: red; }',
        ligne: 1,
      },
    ]);
  });

  it('lit « utiliser style "…" »', () => {
    expect(analyserSyntaxe(analyser(source)).fichiersStyle).toEqual([
      { type: 'FichierStyle', chemin: './theme.css', ligne: 9 },
    ]);
  });

  it('range les classes à part des styles nommés', () => {
    const [, bouton] = analyserSyntaxe(analyser(source)).pages[0].corps;
    expect(bouton).toMatchObject({
      classes: ['principal', 'large'],
      styles: [{ propriete: 'fond', valeur: 'vert' }],
    });
  });

  it('garde « style » comme nom de variable possible', () => {
    expect(() => analyserSyntaxe(analyser('page "a" :\n    variable style = "x"\n    texte style'))).not.toThrow();
  });

  it('exige le nom de la classe entre guillemets', () => {
    expect(() => analyserSyntaxe(analyser('page "a" :\n    titre "A" avec style grand'))).toThrow(
      /il manque le nom de la classe CSS entre guillemets/,
    );
  });
});

describe('CSS — analyse', () => {
  it('avertit d’une classe utilisée mais définie nulle part', () => {
    const resultat = compiler('style :\n    .grand { color: red; }\npage "a" :\n    titre "A" avec style "grnad"');
    expect(resultat.diagnostics).toEqual([
      {
        gravite: 'avertissement',
        message: "la classe CSS « grnad » n'est définie dans aucun bloc style.",
        ligne: 4,
      },
    ]);
  });

  it('ne vérifie pas les classes quand un fichier CSS séparé est utilisé', () => {
    expect(compiler(source).diagnostics).toEqual([]);
  });
});

describe('CSS — cible web', () => {
  const application = compiler(source).application!;
  const fichiers = genererProjetWeb(application, { nom: 'a', adresse: 'http://localhost', source: 'a.humalis', fichiersStyle: new Map([['./theme.css', '.principal { color: blue; }']]) });

  it('met les classes sur les éléments, après les styles nommés', () => {
    expect(fichiers.get('src/pages/Accueil.tsx')).toContain('className="grand-titre"');
    expect(fichiers.get('src/pages/Accueil.tsx')).toContain('className="humalis-fond-vert principal large"');
  });

  it('recopie le CSS tel quel et le charge après les styles de Humalis', () => {
    expect(fichiers.get('src/styles/style.css')).toContain('#menu > a:hover { color: red; }');
    expect(fichiers.get('src/styles/theme.css')).toBe('.principal { color: blue; }');
    const main = fichiers.get('src/main.tsx')!;
    expect(main.indexOf("import './humalis/styles.css';")).toBeLessThan(main.indexOf("import './styles/style.css';"));
    expect(main).toContain("import './styles/theme.css';");
  });
});

describe('un bloc « style : » après un bloc « theme : »', () => {
  it('est lu comme du CSS (le bloc du thème se ferme avant)', () => {
    const { diagnostics, application } = compiler('theme :\n    mode clair\n\nstyle :\n    .a { color: red; }\n\npage "a" :\n    titre "A" avec style "a"\n');
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(application!.css.join('\n')).toContain('.a { color: red; }');
  });
});
