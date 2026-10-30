import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { programme } from './analyse/aide.js';

const ADMIN = programme(
  'page "accueil" :',
  '>titre "Accueil"',
  'page "admin" :',
  '>ligne :',
  '>>lien "Commandes" vers "commandes"',
  '>>sous page',
  'page "commandes" dans "admin" :',
  '>titre "Commandes"',
  'page "tableau" dans "admin" adresse "/admin" :',
  '>titre "Tableau"',
);
const web = (source: string) => genererProjetWeb(compiler(source).application!, { nom: 'site', adresse: 'http://localhost', source: 's.humalis' });

describe('titre des sous-pages, prérendu et desktop', () => {
  it('la page parente cède le titre à sa sous-page, qui est dans un <div> (un seul <main>)', () => {
    const fichiers = web(ADMIN);
    const admin = fichiers.get('src/pages/Admin.tsx')!;
    expect(admin).toContain('const sousPageActive = useOutlet() !== null;');
    expect(admin).toContain('{ cede: sousPageActive }');
    const commandes = fichiers.get('src/pages/Commandes.tsx')!;
    expect(commandes).toContain('{ sousPage: true }');
    expect(commandes).toContain('<div className="humalis-page humalis-sous-page">');
    expect(fichiers.get('src/humalis/page.ts')).toContain('options.cede');
  });

  it("une seule entrée de prérendu par adresse (la sous-page d'index a celle de son parent)", () => {
    const config = web(ADMIN).get('astratra.prerender.config.cjs')!;
    expect(config.match(/\/admin"/g) ?? []).toHaveLength(1);
  });

  it('sans sous-page, la page et son <main> restent ceux de toujours', () => {
    const fichiers = web(programme('page "accueil" :', '>titre "A"'));
    expect(fichiers.get('src/humalis/page.ts')).not.toContain('options.cede');
    expect(fichiers.get('src/pages/Accueil.tsx')).toContain('<main className="humalis-page">');
    expect(fichiers.has('src/humalis/navigation.tsx')).toBe(false);
  });

  it('le desktop ouvre https, http, mailto et tel dans le système, jamais javascript:', () => {
    const application = compiler(programme('page "accueil" :', '>titre "A"')).application!;
    const fichiers = genererProjetDesktop(application, { nom: 'site', source: 's.humalis' });
    const principal = [...fichiers.values()].find((contenu) => contenu.includes('setWindowOpenHandler'))!;
    expect(principal).toContain("['https:', 'http:', 'mailto:', 'tel:'].includes(new URL(adresse).protocol)");
    expect(principal).toContain('if (adresseExterne(adresse)) void shell.openExternal(adresse);');
    expect(principal).toContain('if (adresseExterne(url)) void shell.openExternal(url);');
  });
});
