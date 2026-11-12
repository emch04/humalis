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

describe('petits pièges du langage (revue L8, L9, L10, L12)', () => {
  const diagnostics = (source: string) => compiler(source).diagnostics;
  const messages = (source: string, gravite: 'erreur' | 'avertissement') => diagnostics(source).filter((d) => d.gravite === gravite).map((d) => d.message);
  const clic = (...lignes: string[]) => ['page "a" :', '    variable n = 0', '    titre "A"', '    bouton "Go"', '    quand l\'utilisateur clique sur "Go" :', ...lignes.map((l) => `        ${l}`), ''].join('\n');

  it('« tant que vrai » et « si faux » : le message dit que ce n’est pas une condition, sans accuser « est »', () => {
    expect(messages(clic('tant que vrai :', '    changer n par n + 1'), 'erreur')[0]).toMatch(/« vrai » seul n’est pas une condition/);
    expect(messages(clic('si faux :', '    changer n par 1'), 'erreur')[0]).toMatch(/« faux » seul n’est pas une condition/);
    // Une variable seule reste une condition.
    expect(messages(['page "a" :', '    variable actif = vrai', '    titre "A"', '    si actif :', '        texte "oui"', ''].join('\n'), 'erreur')).toEqual([]);
  });

  it('une boucle dont la condition compare deux valeurs écrites est signalée', () => {
    expect(messages(clic('tant que 1 est egal a 1 :', '    changer n par n + 1'), 'avertissement').join(' ')).toMatch(/compare deux valeurs écrites/);
    expect(messages(clic('tant que n est inferieur a 10 :', '    changer n par n + 1'), 'avertissement')).toEqual([]);
  });

  it('« repeter » un nombre démesuré de fois est signalé ; un nombre raisonnable ne l’est pas', () => {
    expect(messages(clic('repeter 999999999999 fois :', '    changer n par n + 1'), 'avertissement').join(' ')).toMatch(/fige la page/);
    expect(messages(clic('repeter 1000 fois :', '    changer n par n + 1'), 'avertissement')).toEqual([]);
  });

  it('un nombre entier trop grand pour être gardé au chiffre près est signalé', () => {
    const source = ['page "a" :', '    variable g = 99999999999999999999999999', '    titre "A {g}"', ''].join('\n');
    expect(messages(source, 'avertissement').join(' ')).toMatch(/trop grand pour être gardé au chiffre près/);
    expect(messages(['page "a" :', '    variable g = 9007199254740991', '    variable p = 0,1', '    titre "A {g} {p}"', ''].join('\n'), 'avertissement')).toEqual([]);
  });

  it('un nom écrit avec une autre majuscule ou sans son accent : le bon nom est proposé', () => {
    expect(messages(['page "a" :', '    variable Prix = 3', '    titre "A"', '    texte "{prix}"', ''].join('\n'), 'erreur')[0]).toMatch(/Peut-être « Prix » \? Un nom garde ses majuscules et ses accents/);
    expect(messages(['page "a" :', '    variable élève = "Awa"', '    titre "A"', '    texte eleve', ''].join('\n'), 'erreur')[0]).toMatch(/Peut-être « élève » \?/);
  });

  it('un fichier vide, ou sans page ni serveur, avertit ; un serveur seul ou une page, non', () => {
    expect(messages('', 'avertissement')[0]).toMatch(/aucune page/);
    expect(messages('variable x = 1 avec partagee\n', 'avertissement')[0]).toMatch(/aucune page/);
    expect(messages('page "a" :\n    titre "A"\n', 'avertissement')).toEqual([]);
    expect(messages('serveur "s" :\n    donnee n :\n        t : texte\n    route "n" :\n        tout le monde peut lire n\n', 'avertissement').join(' ')).not.toMatch(/aucune page/);
  });
});

describe('le lecteur continue après une faute (revue L6)', () => {
  const fautes = (source: string) => compiler(source).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => [d.ligne, d.message.slice(0, 40)] as const);

  it('deux fautes dans deux pages : les deux sont montrées, chacune à sa ligne', () => {
    const lues = fautes('page "a" :\n    titre\n    texte "ok"\n\npage "b" :\n    bouton\n    texte "ok"\n');
    expect(lues.map(([ligne]) => ligne)).toEqual([2, 6]);
  });

  it('une faute dans un bloc n’emporte pas la suite : le bloc décalé sous la ligne fautive est sauté avec elle', () => {
    const source = ['page "a" :', '    variable n = 0', '    titre "A"', '    si n est :', '        texte "jamais lu"', '        texte "lui non plus"', '    texte', '    bouton "Go"', '    quand l\'utilisateur clique sur "Go" :', '        changer n', '        changer n par 2', ''].join('\n');
    expect(fautes(source).map(([ligne]) => ligne)).toEqual([4, 7, 10]);
  });

  it('une faute seule reste une faute seule, avec le même message qu’avant', () => {
    const lues = compiler('page "a" :\n    titre\n').diagnostics;
    expect(lues).toHaveLength(1);
    expect(lues[0]!.message).toMatch(/une valeur est attendue/);
  });

  it('un programme sans faute se lit comme avant, et une faute n’en laisse pas trace dans la lecture suivante', () => {
    expect(fautes('page "a" :\n    titre\n')).toHaveLength(1);
    expect(fautes('page "a" :\n    titre "A"\n')).toEqual([]);
  });

  it('au plus vingt fautes sont gardées : un fichier illisible ne noie pas l’écran', () => {
    const source = 'page "a" :\n' + Array.from({ length: 40 }, () => '    titre\n').join('');
    expect(fautes(source).length).toBeLessThanOrEqual(21);
    expect(fautes(source).length).toBeGreaterThan(1);
  });

  it('une phrase dépliée (lecture par morceaux) garde son message quand elle est fausse', () => {
    const source = 'page "a" :\n    variable p = []\n    titre "A"\n    bouton "Go"\n    quand l\'utilisateur clique sur "Go" :\n        charger la suite de p\n';
    expect(fautes(source)).toHaveLength(1);
  });
});
