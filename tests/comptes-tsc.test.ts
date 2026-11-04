import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';

/** Le premier exemple de cette section du guide : celui qu'une personne recopie. */
function exempleDuGuide(guide: string, titre: string): string {
  const texte = readFileSync(new URL(`../docs/${guide}`, import.meta.url), 'utf8');
  const debut = texte.indexOf(titre);
  expect(debut).toBeGreaterThan(-1);
  const bloc = /```humalis\n([\s\S]*?)```/.exec(texte.slice(debut));
  return bloc![1];
}

const application = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};

describe('les comptes dans les pages : le code produit passe tsc', () => {
  const guides = [
    { guide: 'guide.md', titre: '### Inviter des personnes et retrouver un mot de passe', page: 'src/pages/Equipe.tsx' },
    { guide: 'guide.en.md', titre: '### Inviting people and recovering a password', page: 'src/pages/Team.tsx' },
  ];
  const dossier = join(tmpdir(), 'humalis-comptes-tsc');
  const sorties: Record<string, string> = {};

  beforeAll(() => {
    for (const { guide, titre } of guides) {
      const fichiers = genererProjetWeb(application(exempleDuGuide(guide, titre)), { nom: 'b', source: 'b.humalis', adresse: 'https://b.cd' });
      rmSync(join(dossier, 'src'), { recursive: true, force: true });
      for (const [chemin, contenu] of fichiers) {
        mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
        writeFileSync(join(dossier, chemin), contenu);
      }
      if (!existsSync(join(dossier, 'node_modules', 'typescript'))) execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, encoding: 'utf8', stdio: 'pipe' });
      // tsc écrit ses erreurs sur la sortie standard et sort en erreur : le test montre ces lignes.
      try {
        execFileSync('npx', ['tsc', '--noEmit'], { cwd: dossier, encoding: 'utf8', stdio: 'pipe' });
        sorties[guide] = '';
      } catch (erreur) {
        sorties[guide] = String((erreur as { stdout?: unknown }).stdout);
      }
    }
  }, 300_000);

  it.each(guides)('$guide : aucune erreur de type', ({ guide }) => {
    expect(sorties[guide]).toBe('');
  });

  it('le type « Comptes » est déclaré et importé, sans créer de table sur le serveur', () => {
    const app = application(exempleDuGuide('guide.md', guides[0].titre));
    const fichiers = genererProjetWeb(app, { nom: 'b', source: 'b.humalis', adresse: 'https://b.cd' });
    expect(fichiers.get('src/humalis/donnees.ts')).toMatch(/export interface Comptes \{\n {2}id: string;\n {2}email: string;\n {2}role: string;\n {2}statut: string;\n\}/);
    expect(fichiers.get(guides[0].page)).toContain("import type { Comptes } from '../humalis/donnees';");
    expect(app.serveurs[0].donnees).toEqual([]);
  });

  it('mobile : le même type', () => {
    const fichiers = genererProjetMobile(application(exempleDuGuide('guide.md', guides[0].titre)), { nom: 'b', source: 'b.humalis' });
    expect(fichiers.get('humalis/donnees.ts')).toContain('export interface Comptes {');
  });
});
