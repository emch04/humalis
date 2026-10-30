import { describe, expect, it } from 'vitest';
import { distanceEdition, nomProche, proposerNom } from '../../src/analyse/suggestions.js';
import { programme, erreurs, avertissements } from './aide.js';

describe('suggestions de noms', () => {
  it('ignore les accents et les majuscules', () => {
    expect(distanceEdition('École', 'ecole')).toBe(0);
    expect(nomProche('ÉCOLES', ['ecole'])).toBe('ecole');
  });

  it('applique le seuil A2 et ne propose rien de lointain', () => {
    expect(nomProche('acceuil', ['accueil'])).toBe('accueil');
    expect(nomProche('totl', ['total'])).toBe('total');
    expect(nomProche('abc', ['xyz'])).toBeUndefined();
    expect(proposerNom('inconnu', ['total'])).toBe('');
  });

  it('propose une variable proche', () => {
    expect(erreurs(programme('page "a" :', '>variable total = 1', '>texte totl')).join(' ')).toContain('Peut-être « total » ?');
  });

  it('propose une page proche', () => {
    expect(avertissements(programme('page "accueil" :', '>lien "Voir" vers "acceuil"')).join(' ')).toContain('Peut-être « accueil » ?');
  });

  it('propose un champ proche', () => {
    expect(erreurs(programme('page "a" :', '>champ "email"', '>si le champ "emaill" est vide :' , '>>texte "x"')).join(' ')).toContain('Peut-être « email » ?');
  });

  it('propose une fonction proche', () => {
    expect(erreurs(programme('fonction total avec prix :', '>rendre prix', 'page "a" :', '>texte totl(1)')).join(' ')).toContain('Peut-être « total » ?');
  });

  it('propose un élément visé proche', () => {
    expect(erreurs(programme('page "a" :', '>bouton "Envoyer"', '>quand l\'utilisateur clique sur "Envoyr" :', '>>afficher "ok"')).join(' ')).toContain('Peut-être « Envoyer » ?');
  });

  it('propose une couleur proche', () => {
    expect(erreurs(programme('page "a" :', '>titre "A" avec couleur blleu')).join(' ')).toContain('Peut-être « bleu » ?');
  });

  it('propose un champ proche dans une fiche', () => {
    const source = programme('page "a" :', '>variable livre = fiche avec nom "Livre" et prix 12', '>texte "{livre.priix}"');
    expect(erreurs(source).join(' ')).toContain('Peut-être « prix » ?');
  });

  it('propose une source proche', () => {
    const source = programme('source "boutique" :', '>adresse "https://example.org"', 'page "a" :', '>variable produits = []', '>quand la page se charge :', '>>envoyer requete vers "produits" de la source "boutiqe" dans produits');
    expect(erreurs(source).join(' ')).toContain('Peut-être « boutique » ?');
  });

  it('propose une devise proche', () => {
    expect(erreurs(programme('page "a" :', '>variable prix = 1', '>texte "{prix en euroo}"')).join(' ')).toContain('Peut-être « euro » ?');
  });

  it('ne suggère aucun nom quand aucun n’est proche', () => {
    const messages = erreurs(programme('page "a" :', '>variable total = 1', '>si inconnu est égal à 1 :', '>>texte "x"')).join(' ');
    expect(messages).not.toContain('Peut-être');
  });

  it('explique les guillemets manquants', () => {
    expect(erreurs(programme('page "a" :', '>bouton Envoyer')).join(' ')).toContain('Si c\'est un texte, mettez-le entre guillemets : bouton "Envoyer"');
  });
});
