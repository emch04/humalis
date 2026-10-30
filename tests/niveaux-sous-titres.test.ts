import { describe, expect, it } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';

// Le niveau automatique : un « soustitre » sans « avec niveau » descend d'un niveau dans un bloc
// placé sous un sous-titre (une carte sous une section : <h3>).
const web = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return genererProjetWeb(application!, { nom: 'a', adresse: 'https://a.test', source: 'a.humalis' }).get('src/pages/Accueil.tsx')!;
};
const carte = 'page "accueil" :\n    titre "Accueil"\n    section :\n        soustitre "Nos pages"\n        grille :\n            bloc :\n                soustitre "Exemples"\n                texte "Six applications."\n';

describe('le niveau automatique des sous-titres', () => {
  it('une carte sous un sous-titre de section devient un <h3>', () => {
    const code = web(carte);
    expect(code).toMatch(/<h2[^>]*>Nos pages<\/h2>/);
    expect(code).toMatch(/<h3[^>]*>Exemples<\/h3>/);
  });

  it('des sous-titres frères gardent le même niveau, et une section suivante repart au niveau 2', () => {
    const code = web('page "accueil" :\n    titre "Accueil"\n    soustitre "Un"\n    soustitre "Deux"\n    section :\n        soustitre "Trois"\n    section :\n        soustitre "Quatre"\n');
    for (const mot of ['Un', 'Deux']) expect(code).toMatch(new RegExp(`<h2[^>]*>${mot}</h2>`));
    // Les sections suivent « Deux » (niveau 2) : leurs sous-titres sont au niveau 3.
    for (const mot of ['Trois', 'Quatre']) expect(code).toMatch(new RegExp(`<h3[^>]*>${mot}</h3>`));
  });

  it('une section directement sous le titre garde le niveau 2', () => {
    expect(web('page "accueil" :\n    titre "Accueil"\n    section :\n        soustitre "Nos plats"\n')).toMatch(/<h2[^>]*>Nos plats<\/h2>/);
  });

  it('« avec niveau » reste le choix de l’auteur', () => {
    expect(web(carte.replace('soustitre "Exemples"', 'soustitre "Exemples" avec niveau 4'))).toMatch(/<h4[^>]*>Exemples<\/h4>/);
  });

  it('une condition ou une boucle ne change pas le niveau', () => {
    const code = web('page "accueil" :\n    titre "Accueil"\n    variable ok = vrai\n    si ok est vrai :\n        soustitre "Dans le si"\n');
    expect(code).toMatch(/<h2[^>]*>Dans le si<\/h2>/);
  });

  it('le statique suit le même niveau', () => {
    const { application } = compiler(carte);
    expect(genererProjetStatique(application!, { nom: 'a', source: 'a.humalis' }).get('index.html')).toMatch(/<h3[^>]*>Exemples<\/h3>/);
  });
});
