import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../src/parser/parser.js';
import { p, web, statique, mobile, fichier } from './aide.js';

const lire = (source: string) => () => analyserSyntaxe(analyser(source));

describe('socle des interactions', () => {
  it('un événement inconnu garde son message', () => {
    expect(lire(p('>bouton "Go"', '>quand l\'utilisateur danse sur "Go" :', '>>afficher "a"'))).toThrow('action utilisateur inconnue : « danse »');
    expect(lire(p('>quand il pleut :', '>>afficher "a"'))).toThrow('événement inconnu après « quand »');
  });

  // Une minuterie dans un clic s'exécute plus tard : elle lit les dernières valeurs de la page.
  const PLUS_TARD = p('>variable n = 0', '>texte "{n}"', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>apres 10 millisecondes :', '>>>changer n par n + 1');

  it('web et mobile : ce qui s’exécute plus tard lit les dernières valeurs (useActuel)', () => {
    for (const [fichiers, nom] of [[web(PLUS_TARD), 'pages/P.tsx'], [mobile(PLUS_TARD), 'app/index.tsx']] as const) {
      const page = fichier(fichiers, nom);
      expect(page).toContain('const actuel = useActuel({ n });');
      expect(page).toContain('actuel.current.n = actuel.current.n + 1;');
      expect(page).toContain('setN(actuel.current.n);');
      // Le clic lui-même n'attend rien.
      expect(page).toContain('function quandCliqueGo() {');
    }
  });

  it('statique : chaque tour d’une minuterie passe par executer, qui redessine la page', () => {
    const fichiers = statique(PLUS_TARD);
    expect(fichier(fichiers, 'pages/p.js')).toContain('planifier(() => {\n    n = n + 1;\n  }, 10);');
    expect(fichier(fichiers, 'humalis/humalis.js')).toContain('await executer(() => faire(annuler));');
  });

  it('« mouvement est reduit » : suivi en direct sur chaque cible, faux dans le HTML de départ', () => {
    const source = p('>si mouvement est reduit :', '>>texte "Animations réduites"', '>si mouvement n\'est pas reduit :', '>>texte "Animations permises"');
    const page = fichier(web(source), 'pages/P.tsx');
    expect(page).toContain('const mouvementReduit = useMouvementReduit();');
    expect(page).toContain('{mouvementReduit && (');
    expect(page).toContain('{!mouvementReduit && (');
    expect(fichier(mobile(source), 'humalis/temps.ts')).toContain("AccessibilityInfo.addEventListener('reduceMotionChanged', setReduit)");
    const site = statique(source);
    expect(fichier(site, 'pages/p.js')).toContain('...(mouvementReduit()');
    expect(fichier(site, 'index.html')).toContain('Animations permises');
    expect(fichier(site, 'index.html')).not.toContain('Animations réduites');
  });
});
