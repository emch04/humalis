import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { programme } from './analyse/aide.js';

// Manque n° 6 du site public : avec un en-tête, Humalis ajoute seul le lien « Aller au contenu ».
const web = (source: string) => genererProjetWeb(compiler(source).application!, { nom: 'a', adresse: 'https://a.fr', source: 'a.humalis' });

describe('le lien « Aller au contenu »', () => {
  const avecEntete = programme('entete :', '>lien "Accueil" vers "p"', '', 'page "p" :', '>titre "a"');

  it('est le premier élément de la disposition quand le site a un en-tête', () => {
    const fichiers = web(avecEntete);
    const disposition = fichiers.get('src/Disposition.tsx')!;
    expect(disposition).toContain("import AllerAuContenu from './humalis/aller-au-contenu';");
    expect(disposition.indexOf('<AllerAuContenu />')).toBeLessThan(disposition.indexOf('<header'));
    expect(fichiers.get('src/humalis/aller-au-contenu.tsx')).toContain('>Aller au contenu</a>');
    expect(fichiers.get('src/humalis/aller-au-contenu.tsx')).toContain("document.querySelector('main')");
    expect(fichiers.get('src/humalis/styles.css')).toContain('.humalis-aller-au-contenu:focus');
  });

  it('n’existe pas sans en-tête', () => {
    const fichiers = web(programme('page "p" :', '>titre "a"'));
    expect(fichiers.has('src/humalis/aller-au-contenu.tsx')).toBe(false);
  });

  it('suit la langue choisie', () => {
    const fichiers = web(programme('langues :', '>francais', '>anglais', '', 'entete :', '>lien "Accueil" en anglais "Home" vers "p"', '', 'page "p" :', '>titre "a" en anglais "a"'));
    expect(fichiers.get('src/humalis/aller-au-contenu.tsx')).toContain('Skip to content');
  });
});
