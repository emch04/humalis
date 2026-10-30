import { describe, it, expect } from 'vitest';
import { programme, erreurs } from './aide.js';
import { compiler } from '../../src/compilateur.js';

describe('analyse — styles nommés', () => {
  it('accepte les options et les valeurs connues, avec ou sans accent', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>titre "A" avec couleur bleue et taille très_grande et position centrée',
          '>bouton "B" avec fond vert et texte blanc et bordure arrondie',
        ),
      ),
    ).toEqual([]);
  });

  it('range les valeurs sous leur forme canonique dans la RI', () => {
    const ecran = compiler('page "a" :\n    titre "A" avec Couleur bleue et position centrée').application!.ecrans[0];
    expect(ecran.vue[0]).toMatchObject({
      options: [
        { nom: 'couleur', valeur: 'bleu' },
        { nom: 'position', valeur: 'centree' },
      ],
    });
  });

  it('refuse une option inconnue et dit lesquelles existent', () => {
    expect(erreurs(programme('page "a" :', '>titre "A" avec brillance douce'))).toEqual([
      "2 : « brillance » n'est pas une option connue. Options possibles : couleur, fond, texte, taille, position, bordure, colonnes, espacement, remplissage, alignement, repartition, largeur, ombre, degrade, colle, defilement, hauteur, fixe, icone, description, decoratif, niveau, photo, modifiable, ouvert, plusieurs, automatique, visibles, pourcentage, animation, duree, delai, transition, effet, prioritaire, proportions, ajustement, transcription, boucle, nom, obligatoire, indice, minimum, maximum.",
    ]);
  });

  it('refuse une valeur inconnue et dit lesquelles existent', () => {
    expect(erreurs(programme('page "a" :', '>titre "A" avec couleur turquoise'))).toEqual([
      "2 : « turquoise » n'est pas une valeur possible pour « couleur ». Valeurs possibles : bleu, rouge, vert, jaune, orange, violet, rose, gris, noir, blanc.",
    ]);
  });
});
