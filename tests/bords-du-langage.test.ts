import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { compiler } from '../src/compilateur.js';

/**
 * Les bords du langage, trouvés par la revue du 12 novembre 2026 : ce qu'un éditeur de Windows écrit
 * (fins de ligne CRLF, marque d'ordre des octets), les noms qui finissent dans le code produit, et ce
 * que « verifier » doit dire avant « compile ».
 */
const messages = (source: string, gravite: 'erreur' | 'avertissement') => compiler(source).diagnostics.filter((d) => d.gravite === gravite).map((d) => d.message);
const erreurs = (source: string) => messages(source, 'erreur');
const avertissements = (source: string) => messages(source, 'avertissement');

const PAGE = 'page "a" :\n    titre "x"\n    variable n = 2\n    texte "{n}"\n';

describe('les fins de ligne et la marque d’ordre des octets', () => {
  it('un fichier en CRLF se lit comme le même fichier en LF', () => {
    expect(analyser(PAGE.replace(/\n/g, '\r\n'))).toEqual(analyser(PAGE));
    expect(erreurs(PAGE.replace(/\n/g, '\r\n'))).toEqual([]);
  });

  it('un fichier aux anciennes fins de ligne (CR seul) se lit aussi', () => {
    expect(analyser(PAGE.replace(/\n/g, '\r'))).toEqual(analyser(PAGE));
  });

  it('la marque d’ordre des octets en tête de fichier est ignorée', () => {
    expect(analyser('﻿' + PAGE)).toEqual(analyser(PAGE));
    expect(erreurs('﻿' + PAGE.replace(/\n/g, '\r\n'))).toEqual([]);
  });

  it('un bloc de code et un bloc de style gardent leurs lignes, sans retour chariot', () => {
    const source = 'style :\r\n    .a { color: red; }\r\n    .b { color: blue; }\r\n\r\npage "a" :\r\n    titre "x"\r\n    code humalis :\r\n        page "b" :\r\n            titre "y"\r\n';
    const jetons = analyser(source);
    expect(jetons.find((j) => j.type === 'CSS')?.valeur).toBe('.a { color: red; }\n.b { color: blue; }');
    expect(jetons.find((j) => j.type === 'CODE_BRUT')?.valeur).toBe('page "b" :\n    titre "y"');
  });

  it('une erreur garde sa ligne dans un fichier en CRLF', () => {
    const { diagnostics } = compiler('page "a" :\r\n    titre "x"\r\n    texte "{inconnue}"\r\n');
    expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.ligne)).toEqual([3]);
  });
});

const serveur = (route: string, nom = 'boutique') => `serveur "${nom}" :\n    donnee produit :\n        nom : texte\n    route "${route}" :\n        tout le monde peut lire produit\n        seul admin peut modifier produit\n\npage "a" :\n    titre "x"\n`;

describe('les noms qui finissent dans le code produit', () => {
  it('une route ordinaire est acceptée', () => {
    for (const route of ['produits', 'bons-plans', 'produits_2', 'Produits']) expect(erreurs(serveur(route)), route).toEqual([]);
  });

  it('une route qui n’est pas une adresse simple est refusée', () => {
    for (const route of ["'", '../admin', 'auth/connexion', 'a b', 'a?c=1', '', 'équipe', '-a', 'a-']) {
      expect(erreurs(serveur(route))[0], route).toContain('ne peut pas servir d’adresse à une route');
    }
  });

  it('un nom de serveur ordinaire est accepté, avec accents, espaces et apostrophe', () => {
    for (const nom of ['boutique', 'Ma boutique', "L'école", 'café-2', 'Salon 1.2']) expect(erreurs(serveur('produits', nom)), nom).toEqual([]);
  });

  it('un nom de serveur qui casserait le code produit est refusé', () => {
    for (const nom of ['*/', '`', '${x}', 'a\\b', '<b>', '']) expect(erreurs(serveur('produits', nom))[0], nom).toContain('ne peut pas nommer un serveur');
  });
});

describe('ce que « verifier » dit avant « compile »', () => {
  it('deux blocs « serveur » : un avertissement nomme la ligne du premier', () => {
    const source = 'serveur "a1" :\n    donnee x :\n        nom : texte\n    route "xs" :\n        tout le monde peut lire x\n        seul admin peut modifier x\nserveur "b1" :\n    donnee y :\n        nom : texte\n    route "ys" :\n        tout le monde peut lire y\n        seul admin peut modifier y\n\npage "a" :\n    titre "x"\n';
    expect(avertissements(source)).toEqual(['le serveur « b1 » est le deuxième bloc « serveur » de l’application (le premier est ligne 1) : la cible serveur n’en produit qu’un pour l’instant.']);
  });
});

describe('les droits dangereux ou contradictoires', () => {
  const avec = (regles: string[]) => `serveur "b" :\n    roles gerant\n    donnee produit :\n        nom : texte\n    route "produits" :\n${regles.map((r) => `        ${r}\n`).join('')}\npage "a" :\n    titre "x"\n`;

  it('tout le monde peut supprimer ou modifier : un avertissement', () => {
    expect(avertissements(avec(['tout le monde peut lire produit', 'seul admin peut creer produit', 'seul admin peut modifier produit', 'tout le monde peut supprimer produit']))).toEqual([
      'tout le monde peut supprimer « produit » : un visiteur sans compte peut effacer chaque fiche. Réserve cette action, par exemple « seul admin peut supprimer produit ».',
    ]);
    expect(avertissements(avec(['tout le monde peut lire produit', 'tout le monde peut modifier produit']))).toEqual([
      'tout le monde peut modifier « produit » : un visiteur sans compte peut changer, créer et effacer chaque fiche. Réserve cette action, par exemple « seul admin peut modifier produit ».',
    ]);
  });

  it('tout le monde peut creer ou lire : rien à dire', () => {
    expect(avertissements(avec(['tout le monde peut lire produit', 'tout le monde peut creer produit', 'seul admin peut modifier produit', 'seul admin peut supprimer produit']))).toEqual([]);
  });

  it('deux règles qui se contredisent sur la même action : la seconde remplace la première, et le compilateur le dit', () => {
    expect(avertissements(avec(['tout le monde peut lire produit', 'seul admin peut lire produit', 'seul admin peut modifier produit']))).toEqual([
      'la route « produits » a deux règles pour lire « produit » (lignes 6 et 7) : seule la dernière compte. Retire celle que tu ne veux pas.',
    ]);
  });

  it('une règle avec « si », « par identifiant » ou « son auteur » s’ajoute sans contredire', () => {
    expect(avertissements(avec(['seul gerant peut lire produit', 'connecte peut lire produit si utilisateur.id est produit.nom', 'seul admin peut modifier produit']))).toEqual([]);
    expect(avertissements(avec(['tout le monde peut lire produit par identifiant', 'seul admin peut lire produit', 'seul admin peut modifier produit']))).toEqual([]);
    expect(avertissements(avec(['connecte peut lire produit', 'connecte peut creer produit', 'seul son auteur peut modifier et supprimer produit']))).toEqual([]);
  });

  it('la même règle écrite deux fois ne contredit rien', () => {
    expect(avertissements(avec(['seul admin peut lire produit', 'seul admin peut lire produit', 'seul admin peut modifier produit']))).toEqual([]);
  });
});

describe('les fautes de frappe et les messages', () => {
  const erreur = (source: string) => erreurs(source)[0];

  it('un mot du langage mal écrit : le compilateur propose le bon', () => {
    expect(erreur('page "a" :\n    tittre "x"\n')).toBe('instruction inconnue : « tittre » Peut-être « titre » ?');
    expect(erreur('page "a" :\n    titre "x"\n    boutton "B"\n')).toBe('instruction inconnue : « boutton » Peut-être « bouton » ?');
  });

  it('un mot sans rapport ne reçoit pas de proposition', () => {
    expect(erreur('page "a" :\n    titre "x"\n    xyzzyplugh "B"\n')).toBe('instruction inconnue : « xyzzyplugh »');
  });

  it('deux lettres échangées dans un nom de variable : le compilateur propose la variable', () => {
    expect(erreur('page "a" :\n    titre "x"\n    variable total = 3\n    texte "{totla}"\n')).toContain('Peut-être « total » ?');
  });

  it('« calcul de = 1 » dit que « de » ne peut pas nommer, comme pour une variable', () => {
    expect(erreur('page "a" :\n    titre "x"\n    calcul de = 1\n')).toContain('« de » est un petit mot ignoré par Humalis');
  });

  it('un émoji hors d’un texte est montré tel quel', () => {
    expect(erreur('page "a" :\n    titre "x" 😀\n')).toContain('😀');
  });
});
