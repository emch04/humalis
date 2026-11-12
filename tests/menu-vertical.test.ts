import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// « menu vertical : » : les liens en colonne, sans jamais passer sur une deuxième colonne.
const source = (entete: string) => programme('page "p" :', '>titre "a"', `>${entete}`, '>>lien "Accueil" vers "p"', '>>lien "Aide" vers "p"');

describe('menu vertical', () => {
  it('est lu seul, ou avec repliable dans les deux ordres', () => {
    for (const entete of ['menu vertical :', 'menu vertical repliable :', 'menu repliable vertical :']) {
      const bloc = analyserSyntaxe(analyser(source(entete))).pages[0].corps[1] as unknown as { genre: string; vertical?: boolean; repliable?: boolean };
      expect(bloc.genre).toBe('menu');
      expect(bloc.vertical).toBe(true);
      expect(bloc.repliable).toBe(entete.includes('repliable') ? true : undefined);
      expect(erreurs(source(entete))).toEqual([]);
    }
  });

  it('web et statique : une colonne qui ne passe pas à la ligne', () => {
    const web = genererProjetWeb(compiler(source('menu vertical avec style "sommaire" :')).application!, { nom: 'a', adresse: 'https://a.fr', source: 'a.humalis' });
    expect([...web.values()].join('\n')).toContain('humalis-menu-vertical');
    expect(web.get('src/humalis/styles.css')).toMatch(/\.humalis-menu-vertical \{[^}]*flex-direction: column;[^}]*flex-wrap: nowrap;/);
    const statique = [...genererProjetStatique(compiler(source('menu vertical :')).application!, { nom: 'a', source: 'a.humalis' }).values()].join('\n');
    expect(statique).toContain('humalis-menu-vertical');
  });

});
