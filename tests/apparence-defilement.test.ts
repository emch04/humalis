import { describe, expect, it } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { mouvementHorsBloc } from '../src/cibles/commun/mouvement.js';

// Trois options d'apparence sans CSS : « defilement interne », « hauteur ecran », « entete avec fixe ».
const options = { nom: 'a', adresse: 'https://a.test', source: 'a.humalis' };
const documentation = [
  'entete avec fixe :',
  '    lien "Accueil" vers "guide"',
  '',
  'page "guide" :',
  '    titre "Le guide"',
  '    ligne avec hauteur ecran :',
  '        menu vertical avec defilement interne :',
  '            lien "Installer" vers "guide"',
  '        colonne avec defilement interne :',
  '            texte "Un long chapitre."',
  '',
].join('\n');
const sans = (source: string) => {
  const r = compiler(source);
  expect(r.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return r.application!;
};
const erreurs = (source: string) => compiler(source).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message).join('\n');

describe('les options de défilement et de hauteur', () => {
  it('web : les classes, le CSS et le suivi de la hauteur de l’en-tête', () => {
    const projet = genererProjetWeb(sans(documentation), options);
    const tout = [...projet.values()].join('\n');
    expect(tout).toContain('humalis-defilement-interne');
    expect(tout).toContain('humalis-hauteur-ecran');
    expect(tout).toContain('humalis-fixe-oui');
    const css = projet.get('src/humalis/styles.css')!;
    expect(css).toMatch(/\.humalis-defilement-interne \{[^}]*overflow-y: auto;/);
    expect(css).toMatch(/\.humalis-hauteur-ecran \{[^}]*height: calc\(100dvh - var\(--humalis-hauteur-entete, 0px\)\);/);
    expect(css).toMatch(/header\.humalis-fixe-oui \{[^}]*position: fixed;/);
    expect(css).toContain('#racine:has(> .humalis-fixe-oui)');
    expect(mouvementHorsBloc(css)).toEqual([]);
    expect(projet.get('src/humalis/entete.ts')).toContain('--humalis-hauteur-entete');
    expect(projet.get('src/main.tsx')).toContain('suivreLaHauteurDeLEntete();');
  });

  it('statique : les mêmes classes, le même CSS et le suivi', () => {
    const projet = genererProjetStatique(sans(documentation), { nom: 'a', source: 'a.humalis' });
    const tout = [...projet.values()].join('\n');
    expect(tout).toContain('humalis-defilement-interne');
    expect(tout).toContain('humalis-hauteur-ecran');
    expect(tout).toContain('humalis-fixe-oui');
    expect(projet.get('humalis/humalis.js')).toContain('--humalis-hauteur-entete');
    // L'en-tête du statique est redessiné dans <main> : la page lui laisse sa place, où qu'il soit.
    expect(tout).toContain('body:has(header.humalis-fixe-oui) { padding-top: var(--humalis-hauteur-entete, 0px); }');
  });

  it('sans ces options, rien n’est ajouté', () => {
    const projet = genererProjetWeb(sans('entete :\n    lien "Accueil" vers "a"\n\npage "a" :\n    titre "A"\n'), options);
    expect(projet.has('src/humalis/entete.ts')).toBe(false);
    expect(projet.get('src/humalis/styles.css')).not.toContain('humalis-fixe-oui');
  });

  it('mobile : compile, et dit que ces options n’ont pas d’effet sur un téléphone', () => {
    const r = compiler(documentation);
    const mobile = genererProjetMobile(r.application!, { nom: 'a', source: 'a.humalis' });
    expect(mobile.size).toBeGreaterThan(0);
  });

  it('refuse ces options là où elles n’ont pas de sens', () => {
    expect(erreurs('page "a" :\n    titre "A" avec hauteur ecran\n')).toMatch(/hauteur/);
    expect(erreurs('page "a" :\n    texte "A" avec defilement interne\n')).toMatch(/defilement/);
    expect(erreurs('page "a" :\n    titre "A"\n    bloc avec fixe :\n        texte "b"\n')).toMatch(/fixe/);
  });
});
