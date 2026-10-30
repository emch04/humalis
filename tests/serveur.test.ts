import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from '../src/compilateur.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

const boutique = programme(
  'serveur "boutique" :',
  '>donnee produit :',
  '>>nom : texte',
  '>>prix : nombre',
  '>>disponible : booléen',
  '>>etiquettes : liste de texte',
  '>route "produits" :',
  '>>tout le monde peut lire produit',
  '>>seul admin peut modifier produit',
);

describe('serveur — parser', () => {
  it('lit les données et leurs champs typés', () => {
    const [serveur] = analyserSyntaxe(analyser(boutique)).serveurs;
    expect(serveur.nom).toBe('boutique');
    expect(serveur.donnees).toMatchObject([
      {
        nom: 'produit',
        champs: [
          { nom: 'nom', type: { genre: 'texte' } },
          { nom: 'prix', type: { genre: 'nombre' } },
          { nom: 'disponible', type: { genre: 'booleen' } },
          { nom: 'etiquettes', type: { genre: 'liste', de: { genre: 'texte' } } },
        ],
      },
    ]);
  });

  it('lit les routes et leurs règles', () => {
    const [serveur] = analyserSyntaxe(analyser(boutique)).serveurs;
    expect(serveur.routes).toMatchObject([
      {
        adresse: 'produits',
        regles: [
          { qui: 'tout_le_monde', actions: ['lire'], donnee: 'produit' },
          { qui: 'admin', actions: ['modifier'], donnee: 'produit' },
        ],
      },
    ]);
  });

  it('lit « connecté peut créer et supprimer »', () => {
    const [serveur] = analyserSyntaxe(
      analyser('serveur "s" :\n    donnee note :\n        texte : texte\n    route "notes" :\n        connecté peut créer et supprimer note'),
    ).serveurs;
    expect(serveur.routes[0].regles[0]).toMatchObject({ qui: 'connecte', actions: ['creer', 'supprimer'] });
  });

  it('explique un type de champ inconnu', () => {
    expect(() => analyserSyntaxe(analyser('serveur "s" :\n    donnee d :\n        prix : argent'))).toThrow(
      /« argent » n'est pas un type de champ. Types possibles : texte, nombre, booleen, date, liste de …/,
    );
  });

  it('explique qui peut agir', () => {
    expect(() =>
      analyserSyntaxe(analyser('serveur "s" :\n    donnee d :\n        x : texte\n    route "d" :\n        visiteurs peut lire d')),
    ).toThrow(/qui peut agir \? Écrivez « tout le monde », « connecte » ou « seul admin »/);
  });

  it('explique une action inconnue', () => {
    expect(() =>
      analyserSyntaxe(analyser('serveur "s" :\n    donnee d :\n        x : texte\n    route "d" :\n        connecte peut voir d')),
    ).toThrow(/« voir » n'est pas une action. Actions possibles : lire, creer, modifier, supprimer/);
  });
});

describe('serveur — analyse', () => {
  it('accepte un serveur correct', () => {
    expect(erreurs(boutique)).toEqual([]);
    expect(avertissements(boutique)).toEqual([]);
  });

  it('refuse une règle sur une donnée inconnue', () => {
    expect(erreurs(boutique.replace('seul admin peut modifier produit', 'seul admin peut modifier produits'))).toEqual([
      '9 : la donnée « produits » n\'existe pas dans le serveur « boutique ». Données : produit. Peut-être « produit » ?',
    ]);
  });

  it('refuse deux routes à la même adresse', () => {
    expect(erreurs(boutique + '\n    route "produits" :\n        tout le monde peut lire produit')).toEqual([
      '10 : la route « produits » est déjà déclarée (ligne 7).',
    ]);
  });

  it('refuse une route dont les règles portent sur deux données', () => {
    const source = programme(
      'serveur "s" :',
      '>donnee a1 :',
      '>>x : texte',
      '>donnee b1 :',
      '>>y : texte',
      '>route "r" :',
      '>>tout le monde peut lire a1',
      '>>tout le monde peut lire b1',
    );
    expect(erreurs(source)).toEqual([
      '8 : une route ne sert qu\'une donnée : la route « r » sert déjà « a1 ». Écrivez une autre route pour « b1 ».',
    ]);
  });

  it('avertit d’une donnée sans route', () => {
    expect(avertissements('serveur "s" :\n    donnee d :\n        x : texte')).toEqual([
      '2 : aucune route ne donne accès à la donnée « d ».',
    ]);
  });

  it('avertit d’une action que personne ne peut faire', () => {
    expect(avertissements(programme('serveur "s" :', '>donnee d :', '>>x : texte', '>route "d" :', '>>connecte peut creer d'))).toEqual([
      '4 : personne ne peut lire, modifier, supprimer « d » : ces actions seront refusées.',
    ]);
  });

  it('refuse deux champs du même nom', () => {
    expect(erreurs(programme('serveur "s" :', '>donnee d :', '>>x : texte', '>>x : nombre', '>route "d" :', '>>tout le monde peut lire d'))).toEqual([
      '4 : le champ « x » est déjà déclaré (ligne 3).',
    ]);
  });
});

describe('serveur — représentation intermédiaire', () => {
  it('donne les droits de chaque action, « modifier » couvrant créer et supprimer', () => {
    const [serveur] = compiler(boutique).application!.serveurs;
    expect(serveur.routes).toEqual([
      {
        adresse: 'produits',
        donnee: 'produit',
        droits: { lire: 'tout_le_monde', creer: 'admin', modifier: 'admin', supprimer: 'admin' },
        ligne: 7,
      },
    ]);
    expect(serveur.donnees[0].champs.map((c) => c.nom)).toEqual(['nom', 'prix', 'disponible', 'etiquettes']);
  });

  it('ferme la porte aux actions sans règle', () => {
    const [serveur] = compiler(programme('serveur "s" :', '>donnee d :', '>>x : texte', '>route "d" :', '>>connecte peut creer d')).application!.serveurs;
    expect(serveur.routes[0].droits).toEqual({ lire: null, creer: 'connecte', modifier: null, supprimer: null });
  });

  it('accepte un serveur à côté des pages', () => {
    expect(compiler(boutique + '\n\npage "accueil" :\n    titre "Bienvenue"').application!.ecrans).toHaveLength(1);
  });
});
