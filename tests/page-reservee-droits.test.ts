import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { programme } from './analyse/aide.js';

const SERVEUR = [
  'serveur "s" :',
  '>donnee produit :',
  '>>nom : texte',
  '>route "produits" :',
  '>>connecte peut lire produit',
  '>>seul admin peut modifier produit',
  '',
  'page "accueil" :',
  '>titre "Accueil"',
  '',
];

const messages = (entete: string) =>
  compiler(
    programme(
      ...SERVEUR,
      entete,
      '>titre "Fiches"',
      '>variable produits = []',
      '>quand la page se charge :',
      '>>envoyer requete vers "produits" dans produits',
      '>pour chaque p dans produits :',
      '>>bouton "Retirer"',
      '>>quand l\'utilisateur clique sur "Retirer" :',
      '>>>supprimer p de "produits"',
    ),
  ).diagnostics.map((d) => d.message);

describe('les droits d\'une page réservée', () => {
  it('« reservee a admin » : aucune requête ne sera refusée', () => {
    expect(messages('page "fiches" reservee a admin sinon vers "accueil" :').filter((m) => m.includes('refusée à un visiteur'))).toEqual([]);
  });
  it('« reservee a connecte » : la lecture passe, la suppression reste réservée à un admin', () => {
    const avertis = messages('page "fiches" reservee a connecte sinon vers "accueil" :').filter((m) => m.includes('refusée à un visiteur'));
    expect(avertis).toEqual([expect.stringContaining('seul un admin peut supprimer')]);
  });
  it('une page ouverte à tous prévient toujours', () => {
    const avertis = messages('page "fiches" :').filter((m) => m.includes('refusée à un visiteur'));
    expect(avertis).toEqual([expect.stringContaining('il faut être connecté pour lire'), expect.stringContaining('seul un admin peut supprimer')]);
  });

  describe('un composant', () => {
    const avecComposant = (...pages: string[]) =>
      compiler(programme(...SERVEUR, 'composant "Menu" :', '>variable produits = []', '>quand la page se charge :', '>>envoyer requete vers "produits" dans produits', '', ...pages))
        .diagnostics.map((d) => d.message)
        .filter((m) => m.includes('refusée à un visiteur'));
    const page = (nom: string, reservee: string) => [`page "${nom}"${reservee} :`, '>titre "T"', '>Menu', ''];

    it('placé seulement dans des pages réservées : pas d\'alerte', () => {
      expect(avecComposant(...page('un', ' reservee a admin sinon vers "accueil"'), ...page('deux', ' reservee a connecte sinon vers "accueil"'))).toEqual([]);
    });
    it('placé aussi dans une page ouverte : l\'alerte reste', () => {
      expect(avecComposant(...page('un', ' reservee a admin sinon vers "accueil"'), ...page('deux', ''))).toEqual([expect.stringContaining('il faut être connecté')]);
    });
    it('placé nulle part : l\'alerte reste', () => {
      expect(avecComposant()).toEqual([expect.stringContaining('il faut être connecté')]);
    });
  });
});
