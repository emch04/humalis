import { describe, expect, it } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';

// « sans traduction » : un texte identique dans toutes les langues (un nom propre), écrit tel quel.
const source = (corps: string) => `langues :\n    francais\n    anglais\n\npage "a" :\n    titre "A" en anglais "A"\n${corps}`;
const avertissements = (corps: string) => compiler(source(corps)).diagnostics.filter((d) => d.gravite !== 'erreur').map((d) => d.message);

describe('sans traduction', () => {
  it('ne demande pas de version anglaise', () => {
    expect(avertissements('    lien "GitHub" sans traduction vers "https://github.com"\n    texte "npm" sans traduction\n')).toEqual([]);
  });

  it('un texte oublié reste signalé', () => {
    expect(avertissements('    texte "Bonjour"\n').join('\n')).toMatch(/« Bonjour » n'a pas de version anglaise/);
  });

  it('écrit le même texte dans les deux langues', () => {
    const { application, diagnostics } = compiler(source('    lien "GitHub" sans traduction vers "https://github.com"\n'));
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(genererProjetWeb(application!, { nom: 'a', adresse: 'https://a.test', source: 'a.humalis' }).get('src/pages/A.tsx')).toContain('GitHub');
  });

  it('refuse un texte à la fois traduit et sans traduction', () => {
    const erreurs = compiler(source('    texte "Bonjour" en anglais "Hello" sans traduction\n')).diagnostics.filter((d) => d.gravite === 'erreur');
    expect(erreurs.map((d) => d.message).join('\n')).toMatch(/sans traduction/);
  });
});
