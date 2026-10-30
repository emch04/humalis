import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Plan du langage de base (tâche 1) : « constante tva = 16 », en haut du fichier ou dans une page.
const BOUTIQUE = programme(
  'constante tva = 16',
  '',
  'page "panier" :',
  '>titre "Panier"',
  '>constante livraison = 2000',
  '>variable prix = 10000',
  '>calcul total = prix + prix * tva / 100 + livraison',
  '>texte "Total : {total en FC}"',
  'page "aide" :',
  '>titre "Aide"',
  '>texte "TVA : {tva} %"',
);

describe('constantes', () => {
  it('une constante du haut du fichier vaut dans toutes les pages', () => {
    expect(erreurs(BOUTIQUE)).toEqual([]);
  });

  it('une constante ne se change pas', () => {
    expect(erreurs(programme('constante tva = 16', '', 'page "a" :', '>titre "A"', '>bouton "Changer"', '>quand l\'utilisateur clique sur "Changer" :', '>>changer tva par 18'))).toEqual([
      '7 : « tva » est une constante : sa valeur ne change pas (ligne 1). Écrivez « variable tva = … » si elle doit changer.',
    ]);
  });

  it('« constante » reste un nom de variable ailleurs', () => {
    expect(erreurs(programme('page "a" :', '>titre "A"', '>variable constante = 1', '>texte "{constante}"'))).toEqual([]);
  });

  it('web : une valeur calculée, pas un état ; statique : déjà écrite dans la page', () => {
    const page = genererProjetWeb(compiler(BOUTIQUE).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/pages/Aide.tsx')!;
    expect(page).toContain('const tva = 16;');
    expect(page).not.toContain('useState(16)');
    const html = genererProjetStatique(compiler(BOUTIQUE).application!, { nom: 'b', source: 'b.humalis' }).get('aide.html')!;
    expect(html).toContain('TVA : 16 %');
  });
});
