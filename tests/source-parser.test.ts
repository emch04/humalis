import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { programme } from './analyse/aide.js';

const lire = (...lignes: string[]) => analyserSyntaxe(analyser(programme(...lignes)));

describe('source : le bloc', () => {
  it('lit toutes les lignes', () => {
    const [s] = lire(
      'source "boutique" :',
      '>adresse "https://api.rey-store.cd"',
      '>session astratra',
      '>enveloppe "data"',
      '>erreur dans "message"',
      '>entete "Accept-Language" vaut "fr"',
      '>cache 5 minutes',
      '>essais 2',
      '>delai 10 secondes',
      '>donnee produit :',
      '>>name : texte',
      '>>price : nombre',
      '>route "api/shop/products" :',
      '>>lire une liste de produit dans "products"',
      '>>lire un produit dans "product"',
      '>route "api/shop/orders" :',
      '>>creer produit dans "order"',
    ).sources;
    expect(s).toMatchObject({
      nom: 'boutique',
      adresse: 'https://api.rey-store.cd',
      session: true,
      enveloppe: 'data',
      erreurDans: 'message',
      entetes: [{ nom: 'Accept-Language', valeur: 'fr' }],
      cache: 300,
      essais: 2,
      delai: 10,
    });
    expect(s.donnees[0].champs.map((c) => c.nom)).toEqual(['name', 'price']);
    expect(s.routes[0].regles).toMatchObject([
      { action: 'lire', liste: true, donnee: 'produit', dans: 'products' },
      { action: 'lire', liste: false, donnee: 'produit', dans: 'product' },
    ]);
    expect(s.routes[1].regles[0]).toMatchObject({ action: 'creer', liste: false, dans: 'order' });
  });

  it('lit un jeton public et un jeton secret avec leur place', () => {
    const [a, b] = lire(
      'source "carte" :',
      '>jeton public "pk_live_abc" dans l\'entete "X-Cle"',
      'source "meteo" :',
      '>jeton secret depuis l\'environnement "METEO_CLE" dans le parametre "key"',
    ).sources;
    expect(a.jeton).toMatchObject({ genre: 'public', valeur: 'pk_live_abc', place: { genre: 'entete', nom: 'X-Cle' } });
    expect(b.jeton).toMatchObject({ genre: 'secret', valeur: 'METEO_CLE', place: { genre: 'parametre', nom: 'key' } });
  });

  it('lit « qui peut » devant un verbe de route', () => {
    const [s] = lire('source "m" :', '>route "p" :', '>>tout le monde peut lire une liste de prevision dans "jours"', '>>seul admin peut supprimer prevision').sources;
    expect(s.routes[0].regles).toMatchObject([{ qui: 'tout_le_monde' }, { qui: 'admin', action: 'supprimer' }]);
  });

  it('refuse un jeton secret écrit en clair, avec un message qui dit quoi faire', () => {
    expect(() => lire('source "m" :', '>jeton secret "sk_abc"')).toThrow(/jamais dans le fichier.*depuis l'environnement/);
  });

  it('refuse une ligne inconnue en listant les lignes permises', () => {
    expect(() => lire('source "m" :', '>adresses "x"')).toThrow(/n'est pas une ligne d'une source.*adresse, session/);
  });

  it('refuse une durée sans unité', () => {
    expect(() => lire('source "m" :', '>cache 5')).toThrow(/durée/);
  });

  it('« source » reste un nom de variable ailleurs', () => {
    const p = lire('page "a" :', '>variable source = 1', '>texte source');
    expect(p.sources).toEqual([]);
    expect(p.pages[0].corps[0]).toMatchObject({ type: 'Variable', nom: 'source' });
  });
});

describe('source : la clause des requêtes', () => {
  it('lit « de la source » et « filtrant par »', () => {
    const [page] = lire(
      'page "a" :',
      '>variable produits = []',
      '>quand la page se charge :',
      '>>envoyer requete vers "api/shop/products" de la source "boutique" filtrant par categorie = "robes" et limite = 20 dans produits',
    ).pages;
    const evenement = page.corps[1] as { corps: unknown[] };
    expect(evenement.corps[0]).toMatchObject({
      type: 'Requete',
      adresse: 'api/shop/products',
      source: 'boutique',
      resultat: 'produits',
    });
    const r = evenement.corps[0] as { filtrant: { cle: string }[] };
    expect(r.filtrant.map((f) => f.cle)).toEqual(['categorie', 'limite']);
  });

  it('une requête sans clause garde son sens', () => {
    const [page] = lire('page "a" :', '>variable p = []', '>quand la page se charge :', '>>envoyer requete vers "produits" dans p').pages;
    const r = (page.corps[1] as { corps: { source?: string; filtrant?: unknown }[] }).corps[0];
    expect(r.source).toBeUndefined();
    expect(r.filtrant).toBeUndefined();
  });
});

describe('requête : les noms écrits des données envoyées', () => {
  it('lit « avec customer = client et lines = lignes »', () => {
    const [page] = lire(
      'page "a" :',
      '>variable client = 1',
      '>variable lignes = 2',
      '>variable r = rien',
      '>quand la page se charge :',
      '>>envoyer requete vers "orders" de la source "boutique" avec customer = client et lines = lignes dans r',
    ).pages;
    const requete = (page.corps[3] as { corps: { cles?: (string | undefined)[]; donnees: unknown[] }[] }).corps[0];
    expect(requete.cles).toEqual(['customer', 'lines']);
    expect(requete.donnees).toHaveLength(2);
  });

  it("sans nom écrit, rien ne change : pas de « cles »", () => {
    const [page] = lire('page "a" :', '>variable client = 1', '>quand la page se charge :', '>>envoyer requete vers "orders" avec client').pages;
    expect((page.corps[1] as { corps: { cles?: unknown }[] }).corps[0].cles).toBeUndefined();
  });
});
