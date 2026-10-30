import { describe, it, expect } from 'vitest';
import { programme, erreurs } from './aide.js';

describe('analyse — éléments visés', () => {
  it('trouve une cible par son libellé', () => {
    expect(
      erreurs(programme('page "a" :', '>bouton "Valider"', '>quand utilisateur clique sur "Valider" :', '>>afficher "ok"')),
    ).toEqual([]);
  });

  it('trouve une cible par son nom', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>bouton "Se connecter" avec nom "connexion"',
          '>quand utilisateur clique sur "connexion" :',
          '>>afficher "ok"',
        ),
      ),
    ).toEqual([]);
  });

  it('accepte une cible déclarée après l’événement', () => {
    expect(
      erreurs(programme('page "a" :', '>quand utilisateur survole "photo" :', '>>afficher "ok"', '>image "photo.png" avec nom "photo" et description "Une photo"')),
    ).toEqual([]);
  });

  it('signale une cible inconnue (A6)', () => {
    expect(
      erreurs(programme('page "a" :', '>bouton "OK"', '>quand utilisateur clique sur "Valider" :', '>>afficher "ok"')),
    ).toEqual(['3 : aucun élément « Valider » dans la page « a ».']);
  });

  it('signale un élément inconnu pour montrer, cacher et changer texte (A6)', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>bouton "Go"',
          '>quand utilisateur clique sur "Go" :',
          '>>montrer "menu"',
          '>>cacher "popup"',
          '>>changer texte de "description" par "x"',
        ),
      ),
    ).toEqual([
      '4 : aucun élément « menu » dans la page « a ».',
      '5 : aucun élément « popup » dans la page « a ».',
      '6 : aucun élément « description » dans la page « a ».',
    ]);
  });

  it('signale un libellé ambigu (A7)', () => {
    expect(
      erreurs(
        programme('page "a" :', '>bouton "OK"', '>bouton "OK"', '>quand utilisateur clique sur "OK" :', '>>afficher "x"'),
      ),
    ).toEqual(['4 : deux éléments s\'appellent « OK » (lignes 2 et 3). Donnez un nom à l\'un d\'eux : avec nom "…"']);
  });

  it('accepte un libellé répété par une boucle', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>variable produits = ["Livre", "Stylo"]',
          '>pour chaque nom dans produits :',
          '>>bouton "Ajouter"',
          '>quand utilisateur clique sur "Ajouter" :',
          '>>afficher "Ajouté"',
        ),
      ),
    ).toEqual([]);
  });

  it('signale un nom donné deux fois (A8)', () => {
    expect(
      erreurs(programme('page "a" :', '>bouton "A" avec nom "x"', '>bouton "B" avec nom "x"')),
    ).toEqual(['3 : le nom « x » est déjà donné à un élément (ligne 2).']);
  });

  it('signale un champ inconnu (A12)', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>champ "email"',
          '>bouton "Go"',
          '>quand utilisateur clique sur "Go" :',
          '>>si champ "mail" est vide :',
          '>>>afficher "vide"',
        ),
      ),
    ).toEqual(['5 : aucun champ « mail » dans la page « a ». Peut-être « email » ?']);
  });

  it('exige le nom de l’élément entre guillemets (A17)', () => {
    expect(
      erreurs(
        programme('page "a" :', '>variable m = "menu"', '>bouton "Go"', '>quand utilisateur clique sur "Go" :', '>>montrer m'),
      ),
    ).toEqual(['5 : écrivez le nom de l\'élément entre guillemets, par exemple : montrer "menu"']);
  });
});

describe('analyse — place des instructions', () => {
  it('refuse une action hors d’un événement (A13)', () => {
    expect(erreurs(programme('page "a" :', '>rediriger vers "b"', 'page "b" :', '>titre "B"'))).toEqual([
      "2 : « rediriger » ne s'utilise que dans un événement (quand …).",
    ]);
  });

  it('propose « quand la page se charge » pour une requête hors événement (A13)', () => {
    expect(erreurs(programme('page "a" :', '>envoyer requete vers "/p"'))).toEqual([
      "2 : « envoyer requete » ne s'utilise que dans un événement (quand …). Pour charger des données à l'ouverture de la page, placez-la dans : quand la page se charge :",
    ]);
  });

  it('accepte « afficher » dans la page', () => {
    expect(erreurs(programme('page "a" :', '>afficher "Bonjour"'))).toEqual([]);
  });

  it('refuse un élément créé dans un événement (A14)', () => {
    expect(
      erreurs(programme('page "a" :', '>bouton "Go"', '>quand utilisateur clique sur "Go" :', '>>texte "x"')),
    ).toEqual([
      '4 : un élément ne peut pas être créé dans un événement. Placez-le dans la page, puis utilisez montrer "…" pour le faire apparaître.',
    ]);
  });

  it('refuse un événement dans un autre événement (F2 remplace A15 : un « si » est permis)', () => {
    expect(
      erreurs(
        programme(
          'page "a" :',
          '>bouton "Go"',
          '>quand utilisateur clique sur "Go" :',
          '>>quand utilisateur clique sur "Go" :',
          '>>>afficher "x"',
        ),
      ),
    ).toEqual(['4 : un événement ne se place pas dans un autre événement : écrivez-le dans la page, sous son élément.']);
  });
});
