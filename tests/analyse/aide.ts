import { analyser } from '../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../src/parser/parser.js';
import { analyserSens } from '../../src/analyse/analyse.js';

/** Les lignes d'un programme, indentées avec « > » pour rester lisibles. */
export const programme = (...lignes: string[]) =>
  lignes.map((l) => l.replace(/^>+/, (m) => '    '.repeat(m.length))).join('\n');

export const analyse = (source: string) => {
  const resultat = analyserSens(analyserSyntaxe(analyser(source)));
  return { ...resultat, diagnostics: resultat.diagnostics.filter((d) => d.categorie !== 'accessibilite') };
};

const filtrer = (source: string, gravite: 'erreur' | 'avertissement') =>
  analyse(source)
    .diagnostics.filter((d) => d.gravite === gravite)
    .map((d) => `${d.ligne} : ${d.message}`);

export const erreurs = (source: string) => filtrer(source, 'erreur');
export const avertissements = (source: string) => filtrer(source, 'avertissement');
