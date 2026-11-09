import { describe, expect, it } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { programme } from './analyse/aide.js';

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
});
