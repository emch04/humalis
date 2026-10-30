import { describe, it, expect } from 'vitest';
import { completerSource, type Completion } from '../src/langage/completion.js';
import { VOCABULAIRE } from '../../../src/vocabulaire/table.js';
import { compilerProjet } from '../../../src/fichiers.js';
import { exemple } from './aide-langage.js';

/** Complète à l'endroit du signe ‸ dans la source. */
function completerA(texte: string, chemin?: string, fichiers: Record<string, string> = {}): Completion {
  const lignes = texte.split('\n');
  const ligne = lignes.findIndex((l) => l.includes('‸')) + 1;
  const colonne = lignes[ligne - 1].indexOf('‸') + 1;
  const source = texte.replace('‸', '');
  return completerSource(source, ligne, colonne, chemin, (c) => fichiers[c]);
}
const libelles = (c: Completion) => c.propositions.map((p) => p.libelle);

const SERVEUR =
  'serveur "boutique" :\n    donnee produit :\n        nom : texte\n        prix : nombre\n    route "produits" :\n        tout le monde peut lire produit\n';

describe('completer : en début de ligne', () => {
  it('hors de tout bloc : page, composant, serveur, variable, utiliser, style, langues, traductions', () => {
    expect(libelles(completerA('pa‸'))).toEqual(['page', 'composant', 'serveur', 'variable', 'utiliser', 'style', 'langues', 'traductions anglais']);
  });

  it('les langues : la version après un texte, les langues après « langue est » et « changer langue par », le sélecteur', () => {
    const langues = 'langues :\n    francais\n    anglais\n\n';
    expect(libelles(completerA(`${langues}page "a" :\n    titre "Bienvenue" ‸`))).toContain('en anglais "…"');
    expect(libelles(completerA('page "a" :\n    titre "Bienvenue" ‸'))).not.toContain('en anglais "…"');
    expect(libelles(completerA(`${langues}page "a" :\n    bouton "A"\n    quand l'utilisateur clique sur "A" :\n        si langue est ‸`))).toEqual(['français', 'anglais']);
    expect(libelles(completerA(`${langues}page "a" :\n    bouton "A"\n    quand l'utilisateur clique sur "A" :\n        changer langue par ‸`))).toEqual(['français', 'anglais']);
    const selecteur = completerA(`${langues}page "a" :\n    sel‸`).propositions.find((p) => p.libelle === 'sélecteur');
    expect(selecteur?.insertion).toBe('selecteur de langue');
  });

  it('dans une page : les éléments, actions et blocs, avec leur fiche', () => {
    const c = completerA('page "a" :\n    texte "x"\n    bo‸');
    expect(c.debut).toBe(5);
    const noms = libelles(c);
    for (const mot of ['bouton', 'titre', 'texte', 'champ', 'lien', 'image', 'variable', 'calcul', 'si', 'sinon', 'pour', 'quand', 'afficher']) {
      expect(noms).toContain(mot);
    }
    expect(noms).not.toContain('chaque');
    expect(noms).not.toContain('page');
    const bouton = c.propositions.find((p) => p.libelle === 'bouton')!;
    expect(bouton.documentation).toContain('Un bouton sur lequel on peut cliquer');
  });

  it('dans une page : les blocs de mise en page, prêts à recevoir leur contenu', () => {
    const c = completerA('page "a" :\n    se‸');
    const section = c.propositions.find((p) => p.libelle === 'section')!;
    expect(section.insertion).toBe('section "$1" :');
    expect(c.propositions.find((p) => p.libelle === 'ligne')!.insertion).toBe('ligne :');
    for (const mot of ['bloc', 'colonne', 'grille']) expect(libelles(c)).toContain(mot);
    expect(libelles(completerA('page "a" :\n    bouton "b"\n    quand l\'utilisateur clique sur "b" :\n        ‸'))).not.toContain('section');
  });

  it('dans une page : la carte et le marqueur proposent leur latitude et leur longitude', () => {
    const c = completerA('page "a" :\n    ca‸');
    expect(c.propositions.find((p) => p.libelle === 'carte')!.insertion).toBe('carte "$1" avec latitude ${2:-4,3250} et longitude ${3:15,3222} et zoom ${4:15}');
    expect(libelles(completerA('page "a" :\n    ma‸'))).toContain('marqueur');
    expect(c.propositions.find((p) => p.libelle === 'carte')!.documentation).toContain('nom de la carte');
  });

  it('dans un événement : les actions, pas les éléments', () => {
    const noms = libelles(completerA('page "a" :\n    bouton "b"\n    quand l\'utilisateur clique sur "b" :\n        ‸'));
    for (const mot of ['afficher', 'rediriger', 'changer', 'ajouter', 'envoyer', 'modifier', 'supprimer', 'se connecter', 'si']) {
      expect(noms).toContain(mot);
    }
    expect(noms).not.toContain('bouton');
  });

  it('propose les composants du projet, et « parametre » dans un composant', () => {
    const source = exemple('vitrine.humalis').replace('    Fiche avec nom "Stylo" et prix 2', '    Fi‸');
    const noms = libelles(completerA(source));
    expect(noms).toContain('Fiche');
    expect(noms).toContain('Carte');
    expect(noms).not.toContain('paramètre');
    expect(libelles(completerA('composant "F" :\n    para‸'))).toContain('paramètre');
  });

  it('dans le serveur, une donnée et une route', () => {
    expect(libelles(completerA('serveur "s" :\n    ‸'))).toEqual(['donnée', 'route']);
    expect(libelles(completerA('serveur "s" :\n    donnee produit :\n        stock : ‸'))).toEqual(
      expect.arrayContaining(['texte', 'nombre', 'booléen', 'date']),
    );
    expect(libelles(completerA(SERVEUR + '        ‸'))).toEqual(['tout le monde peut', 'connecté peut', 'seul admin peut']);
    expect(libelles(completerA(SERVEUR + '        connecte peut ‸'))).toEqual(['lire', 'créer', 'modifier', 'supprimer']);
    expect(libelles(completerA(SERVEUR + '        connecte peut lire ‸'))).toEqual(['produit']);
  });
});

describe('completer : selon le mot d’avant', () => {
  it('après « avec » sur un élément : les options et les styles', () => {
    const c = completerA('page "a" :\n    bouton "b" avec ave‸');
    const noms = libelles(c);
    for (const mot of ['nom', 'couleur', 'fond', 'taille', 'style']) expect(noms).toContain(mot);
    expect(noms).not.toContain('partagée');
    expect(c.debut).toBe(21);
  });

  it('après « et » : encore les options', () => {
    expect(libelles(completerA('page "a" :\n    titre "b" avec couleur bleu et ‸'))).toContain('taille');
  });

  it('après « avec » sur une variable : partagee, memorisee ; après « en » : secret', () => {
    expect(libelles(completerA('variable x = 0 avec ‸'))).toEqual(['partagée', 'mémorisée']);
    expect(libelles(completerA('variable x = 0 avec memorisee en ‸'))).toEqual(['secret']);
  });

  it('après un style : ses valeurs', () => {
    const couleurs = libelles(completerA('page "a" :\n    titre "b" avec couleur ‸'));
    expect(couleurs).toContain('bleu');
    expect(couleurs).not.toContain('grande');
    expect(libelles(completerA('page "a" :\n    titre "b" avec taille ‸'))).toContain('grande');
  });

  it('après un composant et « avec » : ses paramètres', () => {
    const source = exemple('vitrine.humalis') + '    Fiche avec ‸\n';
    expect(libelles(completerA(source))).toEqual(['nom', 'prix']);
  });

  it('après « quand » : les tournures d’événement', () => {
    const c = completerA('page "a" :\n    quand l‸');
    expect(c.debut).toBe(11);
    expect(libelles(c)).toEqual([
      'l\'utilisateur clique sur "…" :',
      'l\'utilisateur survole "…" :',
      'la page se charge :',
      'le formulaire "…" est soumis :',
      'l\'utilisateur appuie sur "…" :',
      'l\'utilisateur ecrit dans "…" :',
      'l\'utilisateur arrete d\'ecrire dans "…" :',
      'l\'utilisateur arrive en bas de "…" :',
      'l\'ordre de … change :',
    ]);
    expect(c.propositions[0]).toMatchObject({ insertion: 'l\'utilisateur clique sur "$1" :', extrait: true });
  });

  it('après « est » : les comparaisons ; après « utilisateur est » : connecte, admin', () => {
    const noms = libelles(completerA('page "a" :\n    variable x = 0\n    si x est ‸'));
    for (const mot of ['vide', 'égal à', 'inférieur à', 'supérieur à', 'vrai', 'faux', 'rien']) expect(noms).toContain(mot);
    expect(libelles(completerA('page "a" :\n    si utilisateur est ‸'))).toEqual(['connecté', 'admin']);
  });

  it('après « utiliser » : fichier, composant, style, donnees', () => {
    expect(libelles(completerA('utiliser ‸'))).toEqual(['fichier', 'composant', 'style', 'donnees']);
  });

  it('un graphique : ses genres après « graphique en », ses options, et « serie » dans son bloc seulement', () => {
    expect(libelles(completerA('page "a" :\n    graphique en ‸'))).toEqual(['courbe', 'barres', 'camembert']);
    expect(libelles(completerA('page "a" :\n    graphique en barres ventes avec ‸'))).toEqual(['étiquette', 'étiquettes', 'valeur', 'couleur', 'description', 'proportions']);
    const serie = completerA('page "a" :\n    graphique en barres mois avec etiquette nom et description "x" :\n        ‸').propositions;
    expect(serie.map((p) => [p.libelle, p.insertion])).toEqual([['série', 'serie "$1" valeur ${2:champ}']]);
    expect(libelles(completerA('page "a" :\n    se‸'))).not.toContain('série');
    expect(completerA('page "a" :\n    gra‸').propositions.find((p) => p.libelle === 'graphique')?.insertion).toContain('graphique en ${1|courbe,barres,camembert|}');
  });

  it('après « variable », « calcul », « pour chaque » : rien, on écrit un nom nouveau', () => {
    expect(completerA('page "a" :\n    variable ‸').propositions).toEqual([]);
    expect(completerA('page "a" :\n    pour chaque ‸').propositions).toEqual([]);
  });
});

describe('completer : dans un texte entre guillemets', () => {
  const BOUTIQUE = exemple('boutique.humalis');

  it('dans « vers "…" » : les pages du projet, et de ses fichiers utilisés', () => {
    const c = completerA(BOUTIQUE.replace('rediriger vers "panier"', 'rediriger vers "pa‸"'));
    expect(libelles(c)).toEqual(['boutique', 'panier']);
    expect(c.debut).toBe(25);
    const fichiers = { '/p/autre.humalis': 'page "contact" :\n    texte "x"\n' };
    const projet = 'utiliser fichier "./autre.humalis"\npage "a" :\n    lien "x" vers "‸"\n';
    expect(libelles(completerA(projet, '/p/app.humalis', fichiers))).toEqual(['a', 'contact']);
  });

  it('dans une requête, après modifier ou supprimer : les routes', () => {
    const page = 'page "a" :\n    variable p = rien\n    quand la page se charge :\n';
    expect(libelles(completerA(SERVEUR + page + '        envoyer requete vers "‸" dans p'))).toEqual(['produits']);
    expect(libelles(completerA(SERVEUR + page + '        supprimer p de "‸"'))).toEqual(['produits']);
  });

  it('dans « champ "…" » d’une valeur : les champs de la page', () => {
    const source = 'page "a" :\n    champ "email"\n    champ "mot de passe"\n    bouton "Ok"\n    quand l\'utilisateur clique sur "Ok" :\n        afficher champ "‸"';
    expect(libelles(completerA(source))).toEqual(['email', 'mot de passe']);
  });

  it('dans « clique sur "…" » : les éléments de la page', () => {
    const source = exemple('boutique.humalis').replace('clique sur "Voir le panier"', 'clique sur "‸"');
    expect(libelles(completerA(source))).toEqual(['Nos produits', 'Ajouter', 'Commander', 'Voir le panier']);
  });
});

describe('completer : les valeurs', () => {
  const BOUTIQUE = exemple('boutique.humalis');

  it('à la place d’une valeur : les variables visibles et les mots d’expression', () => {
    const source = BOUTIQUE.replace('            ajouter nom à panier', '            ajouter ‸');
    const noms = libelles(completerA(source));
    for (const nom of ['nom', 'produits', 'stock', 'nombre_articles', 'panier', 'champ', 'nombre de', 'vrai', 'faux', 'rien']) {
      expect(noms).toContain(nom);
    }
    const panier = completerA(source).propositions.find((p) => p.libelle === 'panier')!;
    expect(panier).toMatchObject({ genre: 'variable', detail: 'variable partagée entre les pages' });
  });

  it('ne propose pas une variable d’une autre page ou d’un bloc fermé', () => {
    const source = BOUTIQUE.replace('    lien "Retour à la boutique" vers "boutique"', '    texte ‸');
    const noms = libelles(completerA(source));
    expect(noms).toContain('panier');
    expect(noms).not.toContain('nom');
    expect(noms).not.toContain('produits');
  });

  it('après « x. » : les champs des données du serveur', () => {
    const source = SERVEUR + 'page "a" :\n    variable p = rien\n    texte p.‸';
    const c = completerA(source);
    expect(libelles(c)).toEqual(['nom', 'prix', 'id']);
  });
});

describe('completer : la table', () => {
  it('ne propose que des mots de la table, et aucun mot prévu', () => {
    const prevus = new Set(VOCABULAIRE.filter((e) => e.statut === 'prevu').map((e) => e.mot));
    const sources = ['pa‸', 'page "a" :\n    ‸', 'page "a" :\n    quand la page se charge :\n        ‸', 'page "a" :\n    bouton "b" avec ‸'];
    for (const source of sources) {
      for (const p of completerA(source).propositions.filter((p) => p.genre === 'motCle')) {
        expect(prevus.has(p.filtre ?? p.libelle), p.libelle).toBe(false);
        expect(p.documentation, p.libelle).toBeTruthy();
      }
    }
  });
});

describe('completer : ce qui est inséré se compile', () => {
  it('les formes accentuées proposées (donnée, booléen, connecté, créer, partagée, égal à) sont acceptées', () => {
    const source =
      'variable x = 0 avec partagée\n\nserveur "s" :\n    donnée produit :\n        nom : booléen\n    route "produits" :\n        connecté peut créer produit\n\npage "a" :\n    si x est égal à 0 :\n        texte "z"\n';
    const erreurs = compilerProjet(undefined, () => undefined, source).diagnostics.filter((d) => d.gravite === 'erreur');
    expect(erreurs).toEqual([]);
  });
});
