import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compilerProjet } from '../src/fichiers.js';

interface Bloc {
  fichier: string;
  ligne: number;
  code: string;
  prevu: boolean;
  /** Le nom donné par `<!-- fichier "panier.humalis" -->` : le bloc est un fichier d'un projet à plusieurs fichiers. */
  nom?: string;
}

/**
 * Les blocs ```humalis d'un document Markdown. Un bloc précédé de
 * `<!-- prévu -->` décrit une syntaxe pas encore construite : il est
 * ignoré.
 */
function blocs(fichier: string): Bloc[] {
  const lignes = readFileSync(fichier, 'utf8').split('\n');
  const trouves: Bloc[] = [];

  for (let i = 0; i < lignes.length; i++) {
    if (lignes[i].trim() !== '```humalis') continue;
    const debut = i;
    const code: string[] = [];
    for (i++; i < lignes.length && lignes[i].trim() !== '```'; i++) code.push(lignes[i]);
    const precedente = lignes.slice(0, debut).reverse().find((l) => l.trim() !== '') ?? '';
    trouves.push({
      fichier,
      ligne: debut + 1,
      code: code.join('\n'),
      prevu: /<!--\s*prévu/.test(precedente),
      nom: /<!--\s*fichier\s+"([^"]+)"/.exec(precedente)?.[1],
    });
  }

  return trouves;
}

/** Un fragment (instructions sans page) est placé dans une page de test. */
export function envelopper(code: string): string {
  return 'page "exemple" :\n' + code.split('\n').map((l) => (l.trim() ? `    ${l}` : l)).join('\n');
}

/** Un programme complet a au moins une ligne « page » ou « serveur » sans indentation. */
const estProgramme = (code: string) => /^(page|serveur)\b/m.test(code);

const tous = ['docs/exemples.md', 'README.md'].flatMap(blocs);

describe('exemples de la documentation', () => {
  it('trouve les exemples', () => {
    expect(tous.filter((b) => b.fichier === 'docs/exemples.md').length).toBeGreaterThan(15);
  });

  it.each(tous.filter((b) => !b.prevu).map((b) => [`${b.fichier}:${b.ligne}`, b] as const))(
    '%s est accepté',
    (_, bloc) => {
      if (estProgramme(bloc.code) || bloc.nom) {
        // Les blocs nommés du même document forment un projet : chacun peut utiliser les autres.
        const disque = new Map(tous.filter((b) => b.fichier === bloc.fichier && b.nom).map((b) => [b.nom!, b.code]));
        const erreurs = compilerProjet(bloc.nom, (chemin) => disque.get(chemin), bloc.code).diagnostics.filter((d) => d.gravite === 'erreur');
        expect(erreurs).toEqual([]);
      } else {
        expect(() => analyserSyntaxe(analyser(envelopper(bloc.code)))).not.toThrow();
      }
    },
  );
});
