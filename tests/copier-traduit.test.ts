import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Manque n° 2 du site public : le message de « copier » a ses versions, comme les autres textes.
const source = programme(
  'langues :', '>francais', '>anglais', '',
  'page "p" :', '>titre "a" en anglais "a"',
  '>bouton "Copier" en anglais "Copy"',
  '>quand l\'utilisateur clique sur "Copier" :',
  '>>copier "npm install -g humalis" avec message "Commande copiée" en anglais "Command copied"',
);

describe('copier … avec message "…" en anglais "…"', () => {
  it('est accepté', () => {
    expect(erreurs(source)).toEqual([]);
  });

  it('web : le message passe par la langue choisie', () => {
    const fichiers = genererProjetWeb(compiler(source).application!, { nom: 'a', adresse: 'https://a.fr', source: 'a.humalis' });
    const code = [...fichiers.values()].join('\n');
    expect(code).toContain('Command copied');
    expect(code).toContain('Commande copiée');
  });

  it('statique : les deux versions sont écrites', () => {
    const code = [...genererProjetStatique(compiler(source).application!, { nom: 'a', source: 'a.humalis' }).values()].join('\n');
    expect(code).toContain('Command copied');
  });

  it('sans version, le message reste un simple texte', () => {
    const simple = programme('page "p" :', '>titre "a"', '>bouton "C"', '>quand l\'utilisateur clique sur "C" :', '>>copier "x" avec message "Copié !"');
    const code = [...genererProjetWeb(compiler(simple).application!, { nom: 'a', adresse: 'https://a.fr', source: 'a.humalis' }).values()].join('\n');
    expect(code).toContain("copier('x', afficherMessage, 'Copié !')");
  });
});
