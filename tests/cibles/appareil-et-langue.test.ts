import { describe, it, expect } from 'vitest';
import { compiler } from '../../src/compilateur.js';
import { genererProjetWeb } from '../../src/cibles/web/projet.js';
import { genererProjetMoteur } from '../../src/cibles/moteur/projet.js';
import { programme } from '../analyse/aide.js';

const pagesAvec = (fichiers: Map<string, string>) => [...fichiers.entries()].filter(([chemin]) => chemin.includes('pages/'));

describe('« appareil. » dans un texte', () => {
  // Défaut rencontré sur le site public : une phrase finissant par « … ton appareil. » faisait importer un fichier jamais produit.
  const application = () => compiler(programme('page "accueil" :', '>titre "Accueil"', '>texte "Le choix reste sur ton appareil."')).application!;

  it('React : une phrase ne fait pas importer les fonctions de l’appareil', () => {
    const fichiers = genererProjetWeb(application(), { nom: 'e', adresse: 'https://e.cd', source: 'e.humalis' });
    for (const [chemin, contenu] of pagesAvec(fichiers)) expect(contenu, chemin).not.toContain('humalis/appareil');
    expect(fichiers.has('src/humalis/appareil.js')).toBe(false);
  });

  it('moteur : une phrase ne fait pas importer les fonctions de l’appareil', () => {
    const fichiers = genererProjetMoteur(application(), { nom: 'e', source: 'e.humalis' });
    for (const [chemin, contenu] of pagesAvec(fichiers)) expect(contenu, chemin).not.toContain('humalis/appareil');
  });
});

describe('la langue de départ', () => {
  const html = (lignes: string[]) => genererProjetWeb(compiler(programme(...lignes)).application!, { nom: 'e', adresse: 'https://e.cd', source: 'e.humalis' }).get('index.html')!;
  const page = ['page "accueil" :', '>titre "Accueil" en anglais "Home"'];

  it('un site en deux langues cache le prérendu si une autre langue est attendue', () => {
    const contenu = html(['langues :', '>francais', '>anglais', '', ...page]);
    expect(contenu).toContain('humalis-langue-attente');
    expect(contenu).toContain('["fr","en"]');
  });

  it('un site en une seule langue n’ajoute rien', () => {
    expect(html(['page "accueil" :', '>titre "Accueil"'])).not.toContain('humalis-langue-attente');
  });
});
