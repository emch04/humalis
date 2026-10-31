import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compilerProjet } from '../src/fichiers.js';

/**
 * Chaque exemple du guide (docs/guide.md et sa version anglaise) et des
 * README est un programme complet, compilé sans aucune erreur. Un bloc
 * « ```csv nom.csv » fournit un fichier de données aux exemples qui le lisent.
 * Pour chaque fichier : le nombre d'exemples qu'il doit au moins contenir.
 */
const GUIDES: [string, number][] = [
  ['docs/guide.md', 50],
  ['docs/guide.en.md', 50],
  ['README.md', 1],
  ['README.en.md', 1],
];

function blocs(texte: string) {
  const programmes: { code: string; ligne: number }[] = [];
  const fichiers = new Map<string, string>();
  const lignes = texte.split('\n');
  for (let i = 0; i < lignes.length; i++) {
    const ouverture = /^```(\S+)(?:\s+(\S+))?\s*$/.exec(lignes[i]);
    if (!ouverture) continue;
    const debut = i + 1;
    let fin = debut;
    while (fin < lignes.length && lignes[fin] !== '```') fin++;
    const code = lignes.slice(debut, fin).join('\n');
    if (ouverture[1] === 'humalis') programmes.push({ code, ligne: debut });
    if (ouverture[1] === 'csv' && ouverture[2]) fichiers.set(ouverture[2], code);
    i = fin;
  }
  return { programmes, fichiers };
}

for (const [nom, minimum] of GUIDES) {
  const texte = readFileSync(fileURLToPath(new URL(`../${nom}`, import.meta.url)), 'utf8');
  const { programmes, fichiers } = blocs(texte);

  describe(nom, () => {
    it('contient ses exemples', () => {
      expect(programmes.length).toBeGreaterThanOrEqual(minimum);
    });

    for (const { code, ligne } of programmes) {
      it(`l'exemple de la ligne ${ligne} compile sans erreur`, () => {
        const lire = (fichier: string) => {
          const base = fichier.split('/').pop()!;
          if (fichiers.has(base)) return fichiers.get(base);
          // Les fichiers que les exemples utilisent sans les montrer (CSS, pages rangées à part).
          if (base.endsWith('.css')) return '.grand { font-size: 3rem; }';
          if (base.endsWith('.humalis')) return `page "${base.replace('.humalis', '')}" :\n    titre "${base}"\n`;
          return undefined;
        };
        const { diagnostics } = compilerProjet('/projet/guide.humalis', lire, code);
        const erreurs = diagnostics.filter((d) => d.gravite === 'erreur').map((d) => `ligne ${d.ligne} : ${d.message}`);
        expect(erreurs).toEqual([]);
      });
    }
  });
}

describe('les petits mots ignorés, dans le guide', () => {
  it.each(['docs/guide.md', 'docs/guide.en.md'])('%s les cite tous, comme le compilateur', async (chemin) => {
    const { MOTS_LIAISON } = await import('../src/lexer/motsCles.js');
    const texte = readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8').replace(/\n/g, ' ');
    const liste = /`le`, `la`[^:.]*?`se`/.exec(texte)?.[0];
    expect(liste?.match(/`([^`]+)`/g)?.map((m) => m.slice(1, -1)).sort()).toEqual([...MOTS_LIAISON].sort());
  });
});
