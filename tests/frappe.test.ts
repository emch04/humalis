import { describe, expect, it } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { mouvementHorsBloc } from '../src/cibles/commun/mouvement.js';

// « code … avec animation frappe » : le code s'écrit lettre par lettre, au chargement ou au défilement.
const page = (contenu: string) => `page "accueil" :\n    titre "Accueil"\n${contenu}`;
const application = (source: string) => {
  const resultat = compiler(source);
  expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return resultat.application!;
};
const options = { nom: 'frappe', source: 'frappe.humalis', adresse: 'https://exemple.test' };
const bloc = (source: string) => application(source).ecrans[0].vue.find((n) => n.type === 'codeDocumentation');

describe('l\'animation de frappe d\'un bloc de code', () => {
  it('se lit après le langage, ou sans langage, au chargement ou au défilement', () => {
    expect(bloc(page('    code humalis avec animation frappe :\n        titre "Bonjour"'))).toMatchObject({ langage: 'humalis', frappe: 'chargement', code: 'titre "Bonjour"' });
    expect(bloc(page('    code avec animation frappe au defilement :\n        npm install'))).toMatchObject({ frappe: 'defilement', code: 'npm install' });
    expect(bloc(page('    code avec animation frappe au defilement :\n        npm install'))).not.toHaveProperty('langage');
    expect(bloc(page('    code terminal :\n        npm install'))).not.toHaveProperty('frappe');
  });

  it('marque le bloc sur le web, avec le script et le CSS sous « réduire les animations »', () => {
    const projet = genererProjetWeb(application(page('    code humalis avec animation frappe :\n        titre "Bonjour"')), options);
    const ecran = projet.get('src/pages/Accueil.tsx')!;
    expect(ecran).toContain('humalis-animation-frappe');
    expect(ecran).toContain('data-humalis-frappe="chargement"');
    expect(projet.get('src/humalis/mouvement.ts')).toContain('humalis-frappe-copie');
    expect(projet.get('src/main.tsx')).toContain('observerLeDefilement();');
    const css = projet.get('src/humalis/styles.css')!;
    expect(css).toContain('.humalis-frappe-copie');
    expect(mouvementHorsBloc(css)).toEqual([]);
  });

  it('marque le bloc sur le statique, au départ comme au redessin', () => {
    const projet = genererProjetStatique(application(page('    code avec animation frappe au defilement :\n        npm install')), options);
    expect(projet.get('index.html')).toContain('data-humalis-frappe="defilement"');
    expect([...projet.values()].join('\n')).toMatch(/'data-humalis-frappe': 'defilement'/);
    expect(projet.get('humalis/humalis.js')).toContain('humalis-frappe-copie');
  });

  it('montre le code entier sur le mobile', () => {
    const projet = genererProjetMobile(application(page('    code humalis avec animation frappe :\n        titre "Bonjour"')), options);
    expect(projet.get('app/index.tsx')).toContain(`{'titre "Bonjour"'}`);
  });

  it('un bloc sans animation ne charge pas le script', () => {
    const projet = genererProjetWeb(application(page('    code humalis :\n        titre "Bonjour"')), options);
    expect(projet.has('src/humalis/mouvement.ts')).toBe(false);
  });
});

describe('le script de la frappe', () => {
  it('est du JavaScript valide sur le statique', () => {
    const projet = genererProjetStatique(application(page('    code humalis avec animation frappe :\n        titre "Bonjour"')), options);
    expect(() => new Function(projet.get('humalis/humalis.js')!)).not.toThrow();
  });
});
