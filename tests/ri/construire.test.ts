import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { programme } from '../analyse/aide.js';

const ecran = (source: string) => {
  const resultat = compiler(source);
  expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return resultat.application!.ecrans[0];
};

describe('représentation intermédiaire — boutique', () => {
  const source = readFileSync('exemples/boutique.humalis', 'utf8');

  it('sépare l’état, les calculs, la vue et les gestionnaires', () => {
    const boutique = ecran(source);
    expect(boutique.nom).toBe('boutique');
    expect(boutique.etat.map((e) => [e.nom, e.type])).toEqual([
      ['produits', { genre: 'liste', de: { genre: 'texte' } }],
      ['stock', { genre: 'nombre' }],
    ]);
    expect(compiler(source).application!.partages.map((p) => [p.nom, p.type])).toEqual([
      ['panier', { genre: 'liste', de: { genre: 'texte' } }],
    ]);
    expect(boutique.etat[0].initiale).toEqual({
      type: 'liste',
      elements: [
        { type: 'texte', parties: [{ texte: 'Livre' }] },
        { type: 'texte', parties: [{ texte: 'Stylo' }] },
        { type: 'texte', parties: [{ texte: 'Cahier' }] },
      ],
    });
    expect(boutique.calculs.map((c) => c.nom)).toEqual(['nombre_articles']);
    expect(boutique.vue.map((n) => n.type)).toEqual([
      'element',
      'element',
      'repetition',
      'condition',
      'element',
    ]);
    expect(boutique.gestionnaires).toEqual([
      {
        declencheur: 'clic',
        cibles: ['bouton_voir_le_panier'],
        actions: [{ type: 'navigation', ecran: { type: 'texte', parties: [{ texte: 'panier' }] } }],
        ligne: 19,
      },
    ]);
  });

  it('donne au titre ses options et un identifiant', () => {
    expect(ecran(source).vue[0]).toEqual({
      type: 'element',
      id: 'titre_nos_produits',
      genre: 'titre',
      contenu: { type: 'texte', parties: [{ texte: 'Nos produits' }] },
      options: [
        { nom: 'couleur', valeur: 'bleu' },
        { nom: 'taille', valeur: 'grande' },
      ],
      classes: [],
      ligne: 7,
    });
  });

  it('place « afficher » de la page dans la vue, comme un texte', () => {
    const condition = ecran(source).vue[3];
    expect(condition).toMatchObject({
      type: 'condition',
      test: { gauche: { type: 'variable', nom: 'stock' }, operateur: 'egal', droite: { type: 'nombre', valeur: 0 } },
      alors: [{ type: 'element', genre: 'texte', contenu: { type: 'texte', parties: [{ texte: 'Rupture de stock' }] } }],
      sinon: [{ type: 'element', genre: 'bouton', id: 'bouton_commander' }],
    });
  });

  it('range l’ajout au panier dans la boucle', () => {
    expect(ecran(source).vue[2]).toMatchObject({
      type: 'repetition',
      variable: 'nom',
      gestionnaires: [
        { cibles: ['bouton_ajouter'], actions: [{ type: 'ajout', liste: 'panier' }] },
      ],
    });
  });

  it('ne contient aucun mot de plateforme', () => {
    const json = JSON.stringify(compiler(source).application);
    for (const mot of ['div', 'onClick', 'useState', 'View', 'button', 'href']) {
      expect(json).not.toContain(mot);
    }
  });

  it('se sérialise en JSON sans rien perdre', () => {
    const application = compiler(source).application;
    expect(JSON.parse(JSON.stringify(application))).toEqual(application);
  });
});

describe('représentation intermédiaire — événements', () => {
  it('traduit la connexion : champ, message d’erreur, message', () => {
    const connexion = ecran(readFileSync('exemples/connexion.humalis', 'utf8'));
    expect(connexion.gestionnaires[0]).toEqual({
      declencheur: 'clic',
      cibles: ['bouton_se_connecter'],
      actions: [
        {
          type: 'si',
          test: { gauche: { type: 'champ', id: 'champ_email' }, operateur: 'vide' },
          alors: [{ type: 'message', genre: 'erreur', texte: { type: 'texte', parties: [{ texte: 'Email requis' }] } }],
          sinon: [{ type: 'message', genre: 'info', texte: { type: 'texte', parties: [{ texte: 'Connexion réussie' }] } }],
        },
      ],
      ligne: 5,
    });
  });

  it('traduit variables locales, changements, visibilité et requêtes', () => {
    const page = ecran(
      programme(
        'page "a" :',
        '>variable clics = 0',
        '>variable produits = []',
        '>champ "email"',
        '>bouton "Go" avec nom "go"',
        '>texte "Menu" avec nom "menu"',
        '>quand la page se charge :',
        '>>envoyer requete vers "/produits" dans produits',
        '>quand utilisateur clique sur "go" :',
        '>>variable etape = 1',
        '>>changer clics par 2',
        '>>montrer "menu"',
        '>>changer texte de "menu" par "Bonjour {clics}"',
        '>>envoyer requete vers "/inscription" avec champ "email"',
      ),
    );
    expect(page.gestionnaires[0]).toEqual({
      declencheur: 'chargement',
      cibles: [],
      actions: [{ type: 'requete', adresse: '/produits', mode: 'lire', donnees: [], resultat: 'produits' }],
      ligne: 7,
    });
    expect(page.gestionnaires[1].actions).toEqual([
      { type: 'locale', nom: 'etape', typeValeur: { genre: 'nombre' }, valeur: { type: 'nombre', valeur: 1 } },
      { type: 'affectation', nom: 'clics', valeur: { type: 'nombre', valeur: 2 } },
      { type: 'visibilite', ids: ['menu'], visible: true },
      {
        type: 'changerTexte',
        ids: ['menu'],
        texte: { type: 'texte', parties: [{ texte: 'Bonjour ' }, { variable: 'clics', format: 'nombre' }] },
      },
      {
        type: 'requete',
        adresse: '/inscription',
        mode: 'envoyer',
        donnees: [{ type: 'champ', id: 'champ_email' }],
      },
    ]);
  });

  it('traduit une boucle avec sa variable et son type', () => {
    const page = ecran(
      programme('page "a" :', '>variable notes = [8, 14]', '>pour chaque note dans notes :', '>>texte "Note : {note}"'),
    );
    expect(page.vue[0]).toMatchObject({
      type: 'repetition',
      variable: 'note',
      typeVariable: { genre: 'nombre' },
      liste: { type: 'variable', nom: 'notes' },
      corps: [{ type: 'element', genre: 'texte' }],
    });
  });
});
