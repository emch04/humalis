import { describe, it, expect } from 'vitest';
import { VOCABULAIRE } from '../../src/vocabulaire/table.js';
import { estMotCleDuLexer, formesDe, chercher, entreePrevue } from '../../src/vocabulaire/recherche.js';
import {
  MOTS_CLES,
  MOTS_RESERVES,
  MOTS_CONTEXTUELS,
  MOTS_LIAISON,
  ELISIONS,
  VARIANTES,
  normaliser,
} from '../../src/lexer/motsCles.js';
import { OPTIONS } from '../../src/analyse/styles.js';
import { compiler } from '../../src/compilateur.js';
import { compilerProjet } from '../../src/fichiers.js';
/** Pour l'exemple de « utiliser fichier "./panier.humalis" » : une page « panier » toute simple. */
const fichierUtilise = (chemin: string) =>
  chemin.endsWith('.csv') ? 'nom;prix\nLivre;12\n' : `page "${chemin.replace(/^.*\//, '').replace(/\.humalis$/, '')}" :\n    texte "Votre panier"\n`;


/** Les mots-clés du lexer avant la table (2026-10-29), recopiés ici pour la non-régression. */
const ANCIENS_MOTS_CLES = [
  'page', 'titre', 'texte', 'image', 'bouton', 'lien', 'champ', 'formulaire', 'avec', 'et',
  'vers', 'quand', 'utilisateur', 'clique', 'survole', 'sur', 'charge', 'soumis', 'afficher',
  'cacher', 'montrer', 'ajouter', 'retirer', 'nombre', 'calcul', 'style', 'utiliser', 'changer',
  'rediriger', 'erreur', 'envoyer', 'requete', 'variable', 'si', 'sinon', 'est', 'vide', 'egal',
  'inferieur', 'superieur', 'ou', 'pour', 'chaque', 'dans', 'vrai', 'faux',
];

const ANCIENNES_VARIANTES: [string, string][] = [
  ['inferieure', 'inferieur'], ['inferieurs', 'inferieur'], ['inferieures', 'inferieur'],
  ['superieure', 'superieur'], ['superieurs', 'superieur'], ['superieures', 'superieur'],
  ['egale', 'egal'], ['egaux', 'egal'], ['egales', 'egal'],
  ['cliques', 'clique'], ['survolent', 'survole'],
];

/** Le mot « serveur » et les mots qui ne s'écrivent que dans un bloc « serveur », « donnee » ou « route ». */
const duServeur = (e: (typeof VOCABULAIRE)[number]) =>
  e.mot === 'serveur' || e.contextes.length > 0 && e.contextes.every((c) => c === 'serveur' || c === 'donnee' || c === 'route');

const MOTS_DES_COMPOSANTS_ET_DU_SERVEUR = [
  'depuis', 'parametre', 'partagee', 'memorisee', 'secret',
  'donnee', 'route', 'peut', 'lire', 'creer', 'modifier', 'supprimer', 'connecte', 'admin', 'seul', 'tout', 'monde',
  'booleen', 'date',
];

const RESERVES = [
  'page', 'composant', 'serveur', 'variable', 'si', 'sinon', 'quand', 'pour', 'et', 'ou',
  'non', 'est', 'vrai', 'faux', 'rien', 'avec', 'vers', 'dans', 'par',
];

describe('la table de vocabulaire : sa forme', () => {
  it('écrit chaque mot et chaque variante sous forme canonique (minuscules, sans accent)', () => {
    for (const e of VOCABULAIRE) {
      expect(normaliser(e.mot), e.mot).toBe(e.mot);
      expect(e.mot, e.mot).not.toMatch(/-/);
      for (const v of e.variantes) expect(normaliser(v), `${e.mot} : ${v}`).toBe(v);
    }
  });

  it('a une description, un concept, un exemple et les cinq cibles pour chaque entrée', () => {
    for (const e of VOCABULAIRE) {
      expect(e.description, e.mot).not.toBe('');
      expect(e.concept, e.mot).toMatch(/^[a-zA-Z]+\.[a-zA-Z0-9_.]+$/);
      expect(e.exemple, e.mot).not.toBe('');
      expect(Object.keys(e.cibles).sort(), e.mot).toEqual(['desktop', 'mobile', 'serveur', 'statique', 'web']);
      expect(['supporte', 'prevu'], e.mot).toContain(e.statut);
    }
  });

  it('donne une traduction web à chaque mot pris en charge, sauf les mots de liaison et ceux du serveur', () => {
    for (const e of VOCABULAIRE.filter((x) => x.statut === 'supporte' && x.categorie !== 'liaison' && !duServeur(x))) {
      expect(e.cibles.web, e.mot).not.toBeNull();
    }
  });

  it('donne une traduction serveur à chaque mot qui ne vit que dans un bloc serveur', () => {
    for (const e of VOCABULAIRE.filter((x) => x.statut === 'supporte' && duServeur(x))) {
      expect(e.cibles.serveur, e.mot).not.toBeNull();
    }
  });

  it('ne range jamais deux fois la même forme dans le même contexte', () => {
    const vues = new Map<string, string>();
    for (const e of VOCABULAIRE) {
      for (const forme of formesDe(e)) {
        for (const contexte of e.contextes) {
          const cle = `${forme} @ ${contexte}`;
          expect(vues.get(cle), cle).toBeUndefined();
          vues.set(cle, e.concept);
        }
      }
    }
  });

  it('ne donne pas une même variante à deux mots-clés différents du lexer', () => {
    const vues = new Map<string, string>();
    for (const e of VOCABULAIRE.filter(estMotCleDuLexer)) {
      for (const v of e.variantes) {
        expect([undefined, e.mot], v).toContain(vues.get(v));
        vues.set(v, e.mot);
      }
    }
  });

  it('les mots prévus disent à quelle étape ils arrivent', () => {
    for (const e of VOCABULAIRE.filter((x) => x.statut === 'prevu')) expect(e.etape, e.mot).toBeGreaterThan(0);
  });
});

describe('la table de vocabulaire : les mots réservés (décision Q2)', () => {
  it('réserve partout exactement les 19 mots décidés', () => {
    expect([...MOTS_RESERVES].sort()).toEqual([...RESERVES].sort());
  });

  it('chaque mot réservé a le contexte « partout »', () => {
    for (const mot of RESERVES) {
      expect(VOCABULAIRE.some((e) => e.mot === mot && e.contextes.includes('partout')), mot).toBe(true);
    }
  });

  it('« chaque » devient contextuel, « par » devient réservé', () => {
    expect(MOTS_RESERVES.has('chaque')).toBe(false);
    expect(MOTS_CONTEXTUELS.has('chaque')).toBe(true);
    expect(MOTS_RESERVES.has('par')).toBe(true);
  });
});

describe('la table remplace la liste du lexer, sans rien casser', () => {
  it('les mots-clés pris en charge sont exactement les anciens, plus « par », « composant », « serveur » et « rien »', () => {
    const supportes = VOCABULAIRE.filter((e) => e.statut === 'supporte' && estMotCleDuLexer(e)).map((e) => e.mot);
    expect([...new Set(supportes)].sort()).toEqual([...ANCIENS_MOTS_CLES, 'par', 'composant', 'serveur', 'rien', 'soustitre'].sort());
  });

  it('les mots des composants, du partage et du serveur sont pris en charge mais ne sont pas des mots-clés du lexer', () => {
    for (const mot of MOTS_DES_COMPOSANTS_ET_DU_SERVEUR) {
      const entree = VOCABULAIRE.find((e) => e.mot === mot && e.categorie !== 'style');
      expect(entree, mot).toBeDefined();
      expect(entree!.statut, mot).toBe('supporte');
      expect(estMotCleDuLexer(entree!), mot).toBe(false);
      expect(MOTS_CLES.has(mot) && !['composant', 'serveur'].includes(mot), mot).toBe(false);
    }
  });

  it('« composant » et « serveur » sont pris en charge, et restent réservés', () => {
    for (const mot of ['composant', 'serveur']) {
      const entree = VOCABULAIRE.find((e) => e.mot === mot)!;
      expect(entree.statut, mot).toBe('supporte');
      expect(MOTS_RESERVES.has(mot), mot).toBe(true);
    }
  });

  it('ces mots restent de simples noms : variables, champs et données les prennent sans changer de sens', () => {
    const noms = ['nom', 'prix', 'note', 'produit', 'admin', 'date', 'route', 'donnee', 'secret', 'lire', 'tout', 'seul', 'depuis'];
    const source = [
      ...noms.map((n) => `variable ${n} = 1 avec partagee`),
      'page "p" :',
      ...noms.map((n) => `    texte "{${n}}"`),
      'serveur "s" :',
      '    donnee date :',
      '        admin : texte',
      '        route : nombre',
      '        secret : booleen',
      '        lire : date',
      '    route "dates" :',
      '        tout le monde peut lire date',
    ].join('\n');
    expect(compiler(source).diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  });

  it('MOTS_CLES contient les anciens mots, « par » et les mots réservés prévus', () => {
    expect([...MOTS_CLES].sort()).toEqual(
      [...ANCIENS_MOTS_CLES, 'par', 'composant', 'serveur', 'non', 'rien', 'soustitre'].sort(),
    );
  });

  it('les variantes du lexer sont exactement les anciennes', () => {
    expect([...VARIANTES.entries()].sort()).toEqual([...ANCIENNES_VARIANTES, ['soustitres', 'soustitre'] as [string, string]].sort());
  });

  it('les mots de liaison sont les anciens, plus « au » et « aux » (décision Q3)', () => {
    expect([...MOTS_LIAISON].sort()).toEqual(
      ['le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'a', 'se', 'au', 'aux'].sort(),
    );
    expect([...ELISIONS].sort()).toEqual(['l', 'd', 's', 'n', 'c', 'j', 'm', 't'].sort());
  });

  it('contient toutes les options et valeurs de style de l’analyse', () => {
    for (const [option, { valeurs, accords }] of Object.entries(OPTIONS)) {
      expect(chercher(option, 'option'), option).toBeDefined();
      for (const valeur of valeurs) expect(chercher(valeur, 'valeurStyle'), `${option} ${valeur}`).toBeDefined();
      for (const accord of Object.keys(accords)) expect(chercher(accord, 'valeurStyle'), accord).toBeDefined();
    }
    expect(chercher('nom', 'option')).toBeDefined();
  });

  it('chercher tient compte des accents et des accords', () => {
    expect(chercher('Inférieure', 'comparaison')?.mot).toBe('inferieur');
    expect(chercher('bleue', 'valeurStyle')?.mot).toBe('bleu');
    expect(chercher('titre', 'option')).toBeUndefined();
  });

  it('retrouve un mot prévu, mais pas un mot pris en charge', () => {
    expect(entreePrevue('video')?.statut).toBe('prevu');
    expect(entreePrevue('Vidéo')?.mot).toBe('video');
    expect(entreePrevue('titre')).toBeUndefined();
  });
});

describe('les styles de l’analyse viennent de la table, sans rien changer', () => {
  it('donne exactement les anciens styles, valeurs et accords', () => {
    const couleurs = ['bleu', 'rouge', 'vert', 'jaune', 'orange', 'violet', 'rose', 'gris', 'noir', 'blanc'];
    const accordsCouleurs = { bleue: 'bleu', verte: 'vert', grise: 'gris', noire: 'noir', blanche: 'blanc', violette: 'violet' };
    expect(OPTIONS).toMatchObject({
      couleur: { valeurs: couleurs, accords: accordsCouleurs },
      fond: { valeurs: couleurs, accords: accordsCouleurs },
      texte: { valeurs: couleurs, accords: accordsCouleurs },
      taille: {
        valeurs: ['petite', 'normale', 'grande', 'tres_grande'],
        accords: { petit: 'petite', normal: 'normale', grand: 'grande', tres_grand: 'tres_grande' },
      },
      position: { valeurs: ['gauche', 'centree', 'droite'], accords: { centre: 'centree' } },
    });
    expect(OPTIONS.bordure.valeurs.slice(0, 2)).toEqual(['arrondie', 'carree']);
  });
});

describe('les exemples de la table', () => {
  for (const e of VOCABULAIRE.filter((x) => x.statut === 'supporte')) {
    it(`l’exemple de « ${e.mot} » (${e.categorie}) est accepté par le compilateur`, () => {
      const erreurs = compilerProjet(undefined, fichierUtilise, e.exemple).diagnostics.filter((d) => d.gravite === 'erreur');
      expect(erreurs).toEqual([]);
    });
  }
});
