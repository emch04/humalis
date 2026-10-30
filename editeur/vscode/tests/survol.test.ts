import { describe, it, expect } from 'vitest';
import { survoler, ficheDuMot } from '../src/langage/survol.js';
import { chercher } from '../../../src/vocabulaire/recherche.js';
import { col, exemple, indexDe } from './aide-langage.js';

const BOUTIQUE = exemple('boutique.humalis');

describe('survoler : un mot du vocabulaire', () => {
  const index = indexDe(BOUTIQUE);

  it('montre la fiche de « bouton » : description, traductions par cible, exemple', () => {
    const survol = survoler(index, 11, col(BOUTIQUE, 11, 'bouton', 2));
    expect(survol?.plage).toEqual({ ligne: 11, colonne: 9, fin: 15 });
    const texte = survol!.markdown;
    expect(texte).toContain('**bouton**');
    expect(texte).toContain('élément');
    expect(texte).toContain('Un bouton sur lequel on peut cliquer ou appuyer.');
    expect(texte).toContain('| web | `<button type="button">` |');
    expect(texte).toContain('| mobile | `<Pressable><Text>…</Text></Pressable>` |');
    expect(texte).toContain('| serveur | — |');
    expect(texte).toContain('```humalis\npage "accueil" :\n    bouton "Valider" avec fond vert\n```');
  });

  it('choisit la fiche selon la place : « texte » élément, ou style après « avec »', () => {
    const source = 'page "a" :\n    texte "b" avec texte blanc\n';
    const i = indexDe(source);
    const element = survoler(i, 2, 6)!.markdown;
    const style = survoler(i, 2, col(source, 2, 'texte blanc', 1))!.markdown;
    expect(element).toContain(chercher('texte', 'instruction')!.description);
    expect(style).toContain(chercher('texte', 'option')!.description);
    expect(element).not.toEqual(style);
  });

  it('montre la fiche d’une valeur de style et d’un mot accentué', () => {
    expect(survoler(index, 7, col(BOUTIQUE, 7, 'bleu'))!.markdown).toContain('**bleu**');
    const source = 'page "a" :\n    variable x = 0\n    si x est égal à 0 :\n        texte "z"\n';
    expect(survoler(indexDe(source), 3, col(source, 3, 'égal'))!.markdown).toContain('**égal**');
  });

  it('dit qu’un mot est prévu', () => {
    const source = 'page "a" :\n    tableau "x"\n';
    const texte = survoler(indexDe(source), 2, 7)!.markdown;
    expect(texte).toContain('**tableau**');
    expect(texte).toContain('Prévu : pas encore disponible.');
    expect(texte).not.toContain('étape');
  });

  it('marche sur une ligne en cours de frappe', () => {
    const source = 'page "a" :\n    bouton "Valid\n';
    expect(survoler(indexDe(source), 2, 6)!.markdown).toContain('**bouton**');
  });
});

describe('survoler : un nom', () => {
  const index = indexDe(BOUTIQUE);

  it('dit où une variable partagée est déclarée', () => {
    const survol = survoler(index, 13, col(BOUTIQUE, 13, 'panier'));
    expect(survol?.plage).toEqual({ ligne: 13, colonne: col(BOUTIQUE, 13, 'panier'), fin: col(BOUTIQUE, 13, 'panier', 6) });
    expect(survol!.markdown).toContain('variable partagée entre les pages');
    expect(survol!.markdown).toContain('ligne 1');
    expect(survol!.markdown).toContain('variable panier = [] avec partagee');
  });

  it('dit ce qu’est une page visée par un lien', () => {
    const texte = survoler(index, 20, col(BOUTIQUE, 20, '"panier"', 2))!.markdown;
    expect(texte).toContain('page « panier »');
    expect(texte).toContain('ligne 22');
  });

  it('nomme le fichier d’une déclaration venue d’un fichier utilisé', () => {
    const source = 'utiliser fichier "./commun.humalis"\npage "a" :\n    texte panier\n';
    const i = indexDe(source, '/p/app.humalis', { '/p/commun.humalis': 'variable panier = [] avec partagee\n' });
    expect(survoler(i, 3, col(source, 3, 'panier'))!.markdown).toContain('commun.humalis, ligne 1');
  });

  it('ne montre rien hors d’un mot, ni pour un nom inconnu', () => {
    expect(survoler(index, 2, 1)).toBeUndefined();
    const source = 'page "a" :\n    texte zzz\n';
    expect(survoler(indexDe(source), 2, col(source, 2, 'zzz'))).toBeUndefined();
  });
});

describe('ficheDuMot', () => {
  it('donne une fiche pour chaque mot de la table, sans planter', () => {
    expect(ficheDuMot('avec', 'option')).toContain('**avec**');
    expect(ficheDuMot('pasunmot', 'instruction')).toBeUndefined();
  });
});
