import { describe, it, expect } from 'vitest';
import { programme, erreurs, avertissements } from './analyse/aide.js';

const BOUTIQUE = [
  'source "boutique" :',
  '>adresse "https://api.rey-store.cd"',
  '>enveloppe "data"',
  '>donnee produit :',
  '>>name : texte',
  '>>price : nombre',
  '>route "api/shop/products" :',
  '>>lire une liste de produit dans "products"',
  '>>lire un produit dans "product"',
  '>route "api/shop/orders" :',
  '>>creer produit dans "order"',
  '',
];

const page = (...lignes: string[]) =>
  programme(...BOUTIQUE, 'page "catalogue" :', '>variable produits = []', '>quand la page se charge :', ...lignes);

describe('source : vérifications du bloc', () => {
  it('accepte une source complète', () => {
    expect(erreurs(programme(...BOUTIQUE, 'page "a" :', '>texte "x"'))).toEqual([]);
  });

  it('exige une adresse', () => {
    expect(erreurs(programme('source "m" :', '>cache 5 minutes', 'page "a" :', '>texte "x"'))).toEqual([
      expect.stringContaining('n\'a pas d\'adresse'),
    ]);
  });

  it('refuse deux sources du même nom et deux sources à session', () => {
    const doublon = programme('source "m" :', '>adresse "/a"', 'source "m" :', '>adresse "/b"', 'page "a" :', '>texte "x"');
    expect(erreurs(doublon).join('\n')).toMatch(/déjà déclarée/);
    const sessions = programme('source "a" :', '>adresse "/a"', '>session astratra', 'source "b" :', '>adresse "/b"', '>session astratra', 'page "a" :', '>texte "x"');
    expect(erreurs(sessions).join('\n')).toMatch(/une seule source peut donner la session/);
  });

  it('refuse une donnée inconnue dans une route', () => {
    const src = programme('source "m" :', '>adresse "/a"', '>route "x" :', '>>lire une liste de plat dans "plats"', 'page "a" :', '>texte "x"');
    expect(erreurs(src).join('\n')).toMatch(/la donnée « plat » n'existe pas dans la source « m »/);
  });

  it('refuse une valeur écrite dans un en-tête d\'identification', () => {
    const src = programme('source "m" :', '>adresse "/a"', '>entete "Authorization" vaut "Bearer abc"', 'page "a" :', '>texte "x"');
    expect(erreurs(src).join('\n')).toMatch(/voyagerait jusqu'au navigateur.*jeton/);
  });
});

describe('source : les jetons', () => {
  it('refuse un jeton public qui ressemble à un secret', () => {
    const src = programme('source "m" :', '>adresse "/a"', '>jeton public "sk_live_abcdefghijklmnop"', 'page "a" :', '>texte "x"');
    expect(erreurs(src).join('\n')).toMatch(/ressemble à un secret/);
  });

  it('accepte un jeton public ordinaire', () => {
    const src = programme('source "m" :', '>adresse "https://x.example"', '>jeton public "pk_live_abc"', 'page "a" :', '>texte "x"');
    expect(erreurs(src)).toEqual([]);
  });

  it('refuse un jeton secret sans serveur : il ne peut pas partir dans le navigateur', () => {
    const src = programme('source "m" :', '>adresse "https://x.example"', '>jeton secret depuis l\'environnement "METEO_CLE"', 'page "a" :', '>texte "x"');
    expect(erreurs(src).join('\n')).toMatch(/jeton secret, qui ne peut pas partir dans le navigateur.*bloc serveur/);
  });

  it('refuse un nom de variable d\'environnement qui contient une valeur', () => {
    const src = programme('source "m" :', '>adresse "https://x.example"', '>jeton secret depuis l\'environnement "abc 123!"', 'page "a" :', '>texte "x"');
    expect(erreurs(src).join('\n')).toMatch(/n'est pas un nom de variable d'environnement/);
  });

  it('avertit d\'un jeton public envoyé en http', () => {
    const src = programme('source "m" :', '>adresse "http://x.example"', '>jeton public "pk_abc"', 'page "a" :', '>texte "x"');
    expect(avertissements(src).join('\n')).toMatch(/en clair/);
  });
});

describe('source : les requêtes', () => {
  it('donne le type de la source à la variable : un champ inconnu est refusé', () => {
    const ok = page('>>envoyer requete vers "api/shop/products" de la source "boutique" dans produits', '>pour chaque p dans produits :', '>>texte p.name');
    expect(erreurs(ok)).toEqual([]);
    const faux = page('>>envoyer requete vers "api/shop/products" de la source "boutique" dans produits', '>pour chaque p dans produits :', '>>texte p.nom');
    expect(erreurs(faux).join('\n')).toMatch(/le champ « nom » n'existe pas dans la donnée « produit ». Champs : name, price/);
  });

  it('refuse une source inconnue en listant les sources', () => {
    const src = page('>>envoyer requete vers "api/shop/products" de la source "boutik" dans produits');
    expect(erreurs(src).join('\n')).toMatch(/aucune source « boutik ». Sources : boutique/);
  });

  it('refuse une route inconnue', () => {
    const src = page('>>envoyer requete vers "api/shop/produits" de la source "boutique" dans produits');
    expect(erreurs(src).join('\n')).toMatch(/aucune route « api\/shop\/produits » dans la source « boutique »/);
  });

  it('refuse une action que la route ne permet pas', () => {
    const src = page('>>envoyer requete vers "api/shop/orders" de la source "boutique" dans produits');
    expect(erreurs(src).join('\n')).toMatch(/ne dit pas « lire une liste de/);
  });

  it('« filtrant par » ne se mélange pas avec « avec »', () => {
    const src = page('>>envoyer requete vers "api/shop/products" de la source "boutique" filtrant par categorie = "robes" avec categorie dans produits');
    expect(erreurs(src).join('\n')).toMatch(/ne lit et n'envoie pas à la fois/);
  });

  it('« filtrant par » sans source est refusé', () => {
    const src = programme('page "a" :', '>variable p = []', '>quand la page se charge :', '>>envoyer requete vers "x" filtrant par k = "v" dans p');
    expect(erreurs(src).join('\n')).toMatch(/demande la source visée/);
  });

  it('lit un seul élément par l\'identifiant d\'une page à paramètre', () => {
    const src = programme(
      ...BOUTIQUE,
      'page "produit" avec parametre id :',
      '>variable produit = rien',
      '>quand la page se charge :',
      '>>envoyer requete vers "api/shop/products" de la source "boutique" avec id dans produit',
      '>si produit est rien :',
      '>>texte "…"',
      '>sinon :',
      '>>titre produit.name',
    );
    expect(erreurs(src)).toEqual([]);
  });
});

describe('source : données imbriquées', () => {
  const IMBRIQUEE = [
    'source "boutique" :',
    '>adresse "https://api.exemple.cd"',
    '>donnee variante :',
    '>>label : texte',
    '>>images : liste de texte',
    '>donnee produit :',
    '>>name : texte',
    '>>variants : liste de variante',
    '>route "produits" :',
    '>>lire une liste de produit',
    '',
  ];
  const page = (...lignes: string[]) =>
    programme(...IMBRIQUEE, 'page "a" :', '>variable produits = []', '>quand la page se charge :', '>>envoyer requete vers "produits" de la source "boutique" dans produits', ...lignes);

  it('suit un champ qui est une liste de données de la source', () => {
    const ok = page('>pour chaque p dans produits :', '>>pour chaque v dans p.variants :', '>>>texte v.label');
    expect(erreurs(ok)).toEqual([]);
  });

  it('refuse un champ qui n\'existe pas dans la donnée imbriquée', () => {
    const faux = page('>pour chaque p dans produits :', '>>pour chaque v dans p.variants :', '>>>texte v.libelle');
    expect(erreurs(faux).join('\n')).toMatch(/le champ « libelle » n'existe pas dans la donnée « variante ». Champs : label, images/);
  });

  it('refuse une donnée imbriquée absente', () => {
    const src = programme('source "m" :', '>adresse "/a"', '>donnee produit :', '>>v : liste de variante', 'page "a" :', '>texte "x"');
    expect(erreurs(src).join('\n')).toMatch(/n'est ni un type .* ni une donnée de la source « m »/);
  });

  it('deux données de même nom (serveur et source) restent distinctes', () => {
    const src = programme(
      'serveur "s" :', '>donnee produit :', '>>titre : texte', '>route "produits" :', '>>tout le monde peut lire produit',
      'source "boutique" :', '>adresse "/a"', '>donnee produit :', '>>name : texte', '>route "p" :', '>>lire une liste de produit',
      'page "a" :', '>variable ps = []', '>quand la page se charge :', '>>envoyer requete vers "p" de la source "boutique" dans ps', '>pour chaque x dans ps :', '>>texte x.name',
    );
    expect(erreurs(src)).toEqual([]);
  });
});
