import { describe, it, expect } from 'vitest';
import { analyser } from '../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../src/parser/parser.js';

const corps = (source: string) => analyserSyntaxe(analyser(source)).pages[0].corps;

describe('parser — montrer et cacher un élément', () => {
  it('lit « montrer "menu" »', () => {
    expect(corps('page "a" :\n    montrer "menu"')[0]).toMatchObject({
      type: 'Action',
      action: 'montrer',
      arguments: [{ type: 'Chaine', parties: [{ type: 'texte', valeur: 'menu' }] }],
    });
  });
});

describe('parser — nom d’un élément', () => {
  it('range l’option « nom » à part des styles', () => {
    expect(corps('page "a" :\n    bouton "OK" avec fond vert et nom "valider"')[0]).toMatchObject({
      type: 'Element',
      element: 'bouton',
      nom: 'valider',
      styles: [{ propriete: 'fond', valeur: 'vert' }],
    });
  });

  it('refuse un nom qui n’est pas entre guillemets', () => {
    expect(() => corps('page "a" :\n    bouton "OK" avec nom valider')).toThrow(
      /le nom de l'élément entre guillemets/,
    );
  });
});

describe('parser — changer la valeur d’une variable', () => {
  it('lit « changer clics par 1 »', () => {
    expect(corps('page "a" :\n    changer clics par 1')[0]).toMatchObject({
      type: 'Affectation',
      nom: 'clics',
      valeur: { type: 'Nombre', valeur: 1 },
    });
  });

  it('accepte une variable nommée « texte »', () => {
    expect(corps('page "a" :\n    changer texte par "Bonjour"')[0]).toMatchObject({
      type: 'Affectation',
      nom: 'texte',
    });
  });

  it('lit toujours « changer texte de "x" par "y" »', () => {
    expect(corps('page "a" :\n    changer texte de "x" par "y"')[0]).toMatchObject({
      type: 'Action',
      action: 'changerTexte',
    });
  });

  it('explique un « par » oublié', () => {
    expect(() => corps('page "a" :\n    changer clics 1')).toThrow(/« par » suivi de la nouvelle valeur/);
  });
});

describe('parser — envoyer requete', () => {
  it('lit une requête qui range la réponse', () => {
    expect(corps('page "a" :\n    envoyer requete vers "/produits" dans produits')[0]).toMatchObject({
      type: 'Requete',
      adresse: '/produits',
      donnees: [],
      resultat: 'produits',
    });
  });

  it('lit une requête qui envoie des champs et une variable', () => {
    expect(
      corps('page "a" :\n    envoyer requête vers "/connexion" avec champ "email" et le champ "mdp" et age')[0],
    ).toMatchObject({
      type: 'Requete',
      adresse: '/connexion',
      donnees: [
        { type: 'Champ', nom: 'email' },
        { type: 'Champ', nom: 'mdp' },
        { type: 'Reference', nom: 'age' },
      ],
      resultat: undefined,
    });
  });

  it('explique une requête sans adresse', () => {
    expect(() => corps('page "a" :\n    envoyer requete')).toThrow(/« vers » suivi de l'adresse/);
  });

  it('explique une adresse sans guillemets', () => {
    expect(() => corps('page "a" :\n    envoyer requete vers produits')).toThrow(
      /l'adresse entre guillemets/,
    );
  });
});
