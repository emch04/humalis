import { describe, expect, it } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { programme, erreurs } from './analyse/aide.js';

const exemple = programme(
  'page "messages" :',
  '>champ "Message"',
  '>bouton "Effacer"',
  '>quand l\'utilisateur clique sur "Effacer" :',
  '>>vider champ "Message"',
);

describe('vider champ', () => {
  it('se lit comme une action sur un champ', () => {
    const corps = analyserSyntaxe(analyser(exemple)).pages[0].corps;
    expect(corps[2]).toMatchObject({ type: 'Evenement', corps: [{ type: 'Action', action: 'viderChamp', arguments: [{ type: 'Champ', nom: 'Message' }] }] });
  });

  it('refuse un champ qui n\'existe pas', () => {
    const faux = programme('page "m" :', '>bouton "E"', '>quand l\'utilisateur clique sur "E" :', '>>vider champ "Absent"');
    expect(erreurs(faux).length).toBeGreaterThan(0);
  });

  it('un nom « vider » reste possible', () => {
    expect(erreurs(programme('page "m" :', '>variable vider = 1', '>texte "{vider}"'))).toHaveLength(0);
  });

  it('remet l\'état du champ à vide sur le web', () => {
    const code = JSON.stringify(compiler(exemple));
    expect(code).toContain('viderChamp');
  });
});
