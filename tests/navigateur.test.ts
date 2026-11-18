import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { rolldown } from 'rolldown';
import { produireMoteurGraphique } from '../scripts/generer-moteur-graphique.mjs';

/**
 * Le compilateur pour navigateur (dist/navigateur.js, le bac à sable du site) : regroupé depuis src/navigateur.ts
 * comme le fait « npm run build », il ne doit charger aucun module de Node. Un « import { createHash } from
 * 'node:crypto' » glissé dans un module partagé (les en-têtes du site, 17 novembre) faisait échouer tout le bac à sable.
 */
describe('le compilateur pour navigateur', () => {
  it('regroupé depuis src/navigateur.ts, il ne charge aucun module extérieur (ni node:crypto, ni node:fs…)', async () => {
    const paquet = await rolldown({ input: resolve(import.meta.dirname, '..', 'src', 'navigateur.ts'), platform: 'browser', logLevel: 'silent' });
    try {
      const { output } = await paquet.generate({ format: 'esm' });
      const exterieurs = output.flatMap((morceau) => ('imports' in morceau ? [...morceau.imports, ...(morceau.dynamicImports ?? [])] : [])).filter((m) => !output.some((o) => o.fileName === m));
      expect(exterieurs).toEqual([]);
    } finally {
      await paquet.close();
    }
  }, 120_000);

  it('n’évalue aucun texte : avec l’évaluation interdite (comme sous la politique de contenu du site), il compile un programme avec un graphique et produit son site', async () => {
    const paquet = await rolldown({ input: resolve(import.meta.dirname, '..', 'src', 'navigateur.ts'), platform: 'browser', logLevel: 'silent' });
    const dossier = mkdtempSync(join(tmpdir(), 'humalis-navigateur-'));
    try {
      await paquet.write({ format: 'esm', file: join(dossier, 'navigateur.mjs') });
    } finally {
      await paquet.close();
    }
    const programme = 'page "accueil" :\n    titre "Visites"\n    variable visites = [120, 180, 150]\n    graphique en barres visites avec etiquettes ["Lun", "Mar", "Mer"] et description "Visites de la semaine."\n';
    writeFileSync(join(dossier, 'essai.mjs'), `const h = await import('./navigateur.mjs');\nconst r = h.compiler(${JSON.stringify(programme)});\nif (r.diagnostics.some((d) => d.gravite === 'erreur')) throw new Error(JSON.stringify(r.diagnostics));\nconst f = h.genererProjetStatique(r.application, { nom: 'essai', source: 'essai.humalis' });\nconsole.log(JSON.stringify({ fichiers: f.size, graphique: (f.get('index.html') ?? '').includes('humalis-graphique'), entetes: f.has('_headers') }));\n`);
    const sortie = JSON.parse(execFileSync('node', ['--disallow-code-generation-from-strings', join(dossier, 'essai.mjs')], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } }).trim().split('\n').at(-1)!);
    expect(sortie.graphique).toBe(true);
    expect(sortie.fichiers).toBeGreaterThan(3);
  }, 120_000);

  it('moteur.ts est le moteur des graphiques de textes.ts, à jour (npm run moteur-graphique)', () => {
    expect(readFileSync(resolve(import.meta.dirname, '..', 'src', 'cibles', 'commun', 'graphique', 'moteur.ts'), 'utf8')).toBe(produireMoteurGraphique());
  });
});
