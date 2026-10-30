import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';

/** Les tokens que lit le parser : les mots de liaison sont marqués, puis sautés. */
const lisible = (source: string) =>
  analyser(source)
    .filter((t) => !['FIN_LIGNE', 'FIN_FICHIER', 'INDENT', 'DEDENT', 'LIAISON'].includes(t.type))
    .map((t) => `${t.type}(${t.valeur})`);

/** Tous les tokens, mots de liaison compris. */
const complet = (source: string) =>
  analyser(source)
    .filter((t) => !['FIN_LIGNE', 'FIN_FICHIER', 'INDENT', 'DEDENT'].includes(t.type))
    .map((t) => `${t.type}(${t.valeur})`);

describe('analyser — mots de liaison', () => {
  it("ignore l'élision l' devant un mot-clé", () => {
    expect(lisible("quand l'utilisateur clique")).toEqual([
      'MOT_CLE(quand)',
      'MOT_CLE(utilisateur)',
      'MOT_CLE(clique)',
    ]);
  });

  it('ignore les articles simples', () => {
    expect(lisible('si le champ est vide')).toEqual([
      'MOT_CLE(si)',
      'MOT_CLE(champ)',
      'MOT_CLE(est)',
      'MOT_CLE(vide)',
    ]);
  });

  it('ignore les autres élisions courantes', () => {
    expect(lisible("d'accord l'image la page les notes")).toEqual([
      'IDENTIFIANT(accord)',
      'MOT_CLE(image)',
      'MOT_CLE(page)',
      'IDENTIFIANT(notes)',
    ]);
  });

  it('ne confond pas un identifiant commençant par un article', () => {
    expect(lisible('lecture legume')).toEqual([
      'IDENTIFIANT(lecture)',
      'IDENTIFIANT(legume)',
    ]);
  });

  it('ne touche pas au contenu des chaînes', () => {
    const tokens = analyser('afficher "le prix de la page"');
    expect(tokens[1]).toMatchObject({ type: 'CHAINE', valeur: 'le prix de la page' });
  });
});

describe('analyser — mots de liaison marqués plutôt que jetés (décision Q3)', () => {
  it('marque chaque mot de liaison au lieu de le jeter', () => {
    expect(complet('si le champ est vide')).toEqual([
      'MOT_CLE(si)',
      'LIAISON(le)',
      'MOT_CLE(champ)',
      'MOT_CLE(est)',
      'MOT_CLE(vide)',
    ]);
  });

  it('marque les élisions avec leur apostrophe', () => {
    expect(complet("quand l'utilisateur")).toEqual(["MOT_CLE(quand)", "LIAISON(l')", 'MOT_CLE(utilisateur)']);
  });

  it('garde « à » distinct de « a », avec la ligne, la colonne et l’orthographe d’origine', () => {
    const tokens = analyser('ajouter 1 à liste\najouter 1 A liste').filter((t) => t.type === 'LIAISON');
    expect(tokens[0]).toMatchObject({ type: 'LIAISON', valeur: 'à', original: 'à', ligne: 1, colonne: 11 });
    expect(tokens[1]).toMatchObject({ type: 'LIAISON', valeur: 'a', original: 'A', ligne: 2 });
  });

  it('marque aussi « au » et « aux »', () => {
    expect(complet('au chargement aux amis')).toEqual([
      'LIAISON(au)',
      'IDENTIFIANT(chargement)',
      'LIAISON(aux)',
      'IDENTIFIANT(amis)',
    ]);
  });
});
