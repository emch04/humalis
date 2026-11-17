import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';

/**
 * Une erreur 500 ne renvoie jamais au navigateur ni la pile ni le message interne (chemins du disque,
 * requêtes SQL), même quand NODE_ENV n'est pas « production » : le serveur produit répond lui-même,
 * à la place de la réponse d'erreur du pack. Essayé en vrai sur un serveur
 * produit, avec un stockage qui lève une erreur : « Erreur interne du serveur. », sans pile.
 */
describe('la réponse d’une erreur du serveur', () => {
  const source = 'serveur "boutique" :\n    donnee produit :\n        nom : texte\n    route "produits" :\n        tout le monde peut lire produit\n\npage "a" :\n    titre "A"\n';
  const { application } = compiler(source);
  const serveur = genererProjetServeur(application!.serveurs[0]!, { nom: 'b', source: 'b.humalis' }).get('src/serveur.ts')!;

  it('est écrite par le serveur produit, sans surveillance intégrée', () => {
    expect(serveur.indexOf("const message = statut >= 500 ? 'Erreur interne du serveur.'")).toBeGreaterThan(0);
    expect(serveur).not.toContain('surveillance');
  });

  it('ne dépend pas de NODE_ENV et ne contient jamais la pile', () => {
    const bloc = serveur.slice(serveur.indexOf("const message = statut >= 500 ? 'Erreur interne du serveur.'") - 600, serveur.indexOf("error: message });") + 20);
    expect(bloc).not.toContain('NODE_ENV');
    expect(bloc).not.toMatch(/stack/);
    expect(bloc).toContain('res.headersSent');
  });
});

describe('un refus du service de paiement', () => {
  const source = 'serveur "b" :\n    paiements\n    donnee resa :\n        total : nombre\n    donnee journal :\n        nom : texte\n    route "resas" :\n        connecte peut lire resa\n        connecte peut creer resa\n        quand resa est payee :\n            creer journal avec nom "x"\n    route "journaux" :\n        seul admin peut lire journal\n\npage "a" :\n    titre "A"\n';
  const fichiers = genererProjetServeur(compiler(source).application!.serveurs[0]!, { nom: 'b', source: 'b.humalis' });

  it('est rattrapé là où le relais est appelé : 502, jamais un 401 du relais', () => {
    const paiements = fichiers.get('src/humalis/paiements.ts')!;
    expect(paiements).not.toMatch(/stripe/i);
    expect(JSON.parse(fichiers.get('package.json')!).dependencies.stripe).toBeUndefined();
    for (const variable of ['HUMALIS_PAIEMENT_ADRESSE=', 'HUMALIS_PAIEMENT_SECRET=']) expect(fichiers.get('.env.exemple')).toContain(variable);
    expect(paiements).toContain("return { erreur: \"le paiement n'a pas pu commencer : le service de paiement a refusé la demande\", statut: 502 };");
  });

  it('la réponse d’erreur générale garde le statut des refus du pack (401 d’une session finie)', () => {
    const serveur = fichiers.get('src/serveur.ts')!;
    expect(serveur).toContain('const statut = Number.isInteger(brut) && brut >= 400 && brut < 600 ? brut : 500;');
    expect(serveur).not.toContain('expose');
  });
});
