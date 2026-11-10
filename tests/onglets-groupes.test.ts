import { describe, expect, it } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { programme } from './analyse/aide.js';
import { compiler } from '../src/compilateur.js';
import { cssEcran } from '../src/cibles/web/css-ecran.js';

const source = programme(
  'onglets de l\'application :',
  '>onglet "Accueil" vers "accueil"',
  '>groupe "Équipe" :',
  '>>onglet "Messagerie" vers "messagerie"',
  '>>onglet "Projets" vers "projets"',
  '',
  'page "accueil" :',
  '>titre "Accueil"',
  '',
  'page "messagerie" :',
  '>titre "Messagerie"',
  '',
  'page "projets" :',
  '>titre "Projets"',
);

describe('groupes dans les onglets de l’application', () => {
  it('garde tous les onglets, chacun avec son groupe', () => {
    const lu = analyserSyntaxe(analyser(source));
    expect(lu.ongletsApplication?.map((o) => [o.titre, o.groupe])).toEqual([['Accueil', undefined], ['Messagerie', 'Équipe'], ['Projets', 'Équipe']]);
  });

  it('écrit l’intertitre une seule fois dans le menu', () => {
    const menu = JSON.stringify(analyserSyntaxe(analyser(source)).entete);
    expect(menu.match(/humalis-menu-groupe/g)).toHaveLength(1);
  });

  it('n’avertit pas sur la classe interne de l’intertitre, et lui donne son style sur le web', () => {
    const r = compiler(source);
    expect(r.diagnostics.filter((d) => d.message.includes('humalis-menu-groupe'))).toEqual([]);
    expect(cssEcran(['<p className="humalis-menu-groupe">Équipe</p>'])).toContain('.humalis-menu-groupe {');
  });

  it('lit la barre latérale dessinée par un module', () => {
    const avecBarre = source.replace("onglets de l'application :", 'onglets de l\'application avec barre laterale "MaBarre" :');
    expect(analyserSyntaxe(analyser(avecBarre)).barreLaterale).toBe('MaBarre');
    expect(analyserSyntaxe(analyser(source)).barreLaterale).toBeUndefined();
  });
});
