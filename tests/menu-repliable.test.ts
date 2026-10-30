import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Manque n° 4 du site public : « menu repliable : » se replie derrière un bouton « Menu » sur un petit écran.
const source = programme('page "p" :', '>titre "a"', '>menu repliable :', '>>lien "Accueil" vers "p"', '>>lien "Aide" vers "p"');

describe('menu repliable', () => {
  it('est lu, et accepté', () => {
    const bloc = analyserSyntaxe(analyser(source)).pages[0].corps[1] as unknown as { genre: string; repliable?: boolean };
    expect(bloc.genre).toBe('menu');
    expect(bloc.repliable).toBe(true);
    expect(erreurs(source)).toEqual([]);
  });

  it('un menu ordinaire ne change pas', () => {
    const code = [...genererProjetWeb(compiler(programme('page "p" :', '>titre "a"', '>menu :', '>>lien "Accueil" vers "p"')).application!, { nom: 'a', adresse: 'https://a.fr', source: 'a.humalis' }).values()].join('\n');
    expect(code).not.toContain('humalis-menu-bouton');
  });

  it('web : un bouton « Menu » avec aria-expanded, et le CSS du petit écran', () => {
    const fichiers = genererProjetWeb(compiler(source).application!, { nom: 'a', adresse: 'https://a.fr', source: 'a.humalis' });
    const page = [...fichiers.entries()].find(([n]) => n.endsWith('P.tsx'))![1];
    expect(page).toContain('humalis-menu-repliable');
    expect(page).toContain('<button type="button" className="humalis-menu-bouton" aria-expanded="false">Menu</button>');
    expect(page).toContain('onClick={menuRepliable}');
    expect(fichiers.get('src/humalis/menu.ts')).toContain('export function menuRepliable');
    expect(fichiers.get('src/humalis/styles.css')).toContain('.humalis-menu-repliable:not([data-ouvert]) > :not(.humalis-menu-bouton)');
  });

  it('statique : le même bouton, et un écouteur dans humalis.js', () => {
    const fichiers = genererProjetStatique(compiler(source).application!, { nom: 'a', source: 'a.humalis' });
    const tout = [...fichiers.values()].join('\n');
    expect(fichiers.get('index.html')).toContain('<button type="button" class="humalis-menu-bouton" aria-expanded="false">Menu</button>');
    expect(tout).toContain('humalis-menu-bouton');
    expect(tout).toContain('.humalis-menu-repliable:not([data-ouvert]) > :not(.humalis-menu-bouton)');
  });
});
