import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';

/**
 * tests/attaques.test.ts du serveur produit : le compilateur écrit, pour le programme de chaque auteur, les essais
 * d'un attaquant (revue du 12 novembre 2026). Ces tests-ci vérifient ce qui est écrit ; la preuve qu'ils passent et
 * qu'ils attrapent une faille est dans tests/serveur-attaques.test.ts, qui les lance sur un vrai serveur produit.
 */
const produit = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message)).toEqual([]);
  return genererProjetServeur(application!.serveurs[0]!, { nom: 'b', source: 'b.humalis' }).get('tests/attaques.test.ts');
};
const PAGE = '\npage "a" :\n    titre "A"\n';

describe('les tests d’attaque écrits dans chaque serveur produit', () => {
  it('chaque route reçoit ses essais : champ en trop, faux jetons, rôle voisin, objet à la place d’un texte', () => {
    const tests = produit('serveur "b" :\n    roles gerant et vendeur\n    donnee produit :\n        nom : texte\n        prix : nombre\n    route "produits" :\n        tout le monde peut lire produit\n        seul gerant peut modifier produit\n' + PAGE)!;
    expect(tests).toContain("describe('route « produits »'");
    expect(tests).toContain('champ_inconnu_humalis');
    expect(tests).toContain('"__proto__"');
    expect(tests).toContain("sans session ou avec un faux jeton : creer, modifier, supprimer refusés");
    expect(tests).toContain('alg: \'none\'');
    expect(tests).toContain("un compte sans le bon rôle : creer, modifier, supprimer refusés");
    // Le vendeur n'a pas le droit du gérant : il est essayé ; le gérant, non.
    expect(tests).toContain('ici["vendeur"].jeton');
    expect(tests).not.toMatch(/par ici\["gerant"\]/);
    expect(tests).toContain('{ $ne: null }');
  });

  it('une lecture publique n’est pas essayée sans session', () => {
    const tests = produit('serveur "b" :\n    donnee produit :\n        nom : texte\n    route "produits" :\n        tout le monde peut lire produit\n        seul admin peut modifier produit\n' + PAGE)!;
    expect(tests).not.toMatch(/faux jeton : lire/);
  });

  it('une donnée séparée reçoit l’essai de l’autre groupe et celui du déplacement', () => {
    const tests = produit('serveur "b" :\n    roles gerant et vendeur\n    donnee commande par boutique :\n        total : nombre\n    route "commandes" :\n        seuls gerant et vendeur peuvent lire commande\n        seul gerant peut modifier commande\n' + PAGE)!;
    expect(tests).toContain('séparée par boutique : un autre groupe ne lit, ne modifie ni ne supprime la fiche, et personne ne la déplace');
    expect(tests).toContain('ailleurs["gerant"]');
    expect(tests).toContain(`{ "boutique": 'groupe-b' }`);
    expect(tests).toContain('ce que seul le serveur écrit ne se modifie pas, même par un admin : boutique');
  });

  it('une donnée payée par Stripe reçoit l’essai de « paye » ; une règle avec « si » ne reçoit pas l’essai du rôle voisin', () => {
    const paye = produit('serveur "b" :\n    paiements par stripe\n    donnee resa :\n        total : nombre\n    donnee journal :\n        nom : texte\n    route "resas" :\n        connecte peut lire resa\n        connecte peut creer resa\n        seul admin peut modifier resa\n        quand resa est payee :\n            creer journal avec nom "x"\n    route "journaux" :\n        seul admin peut lire journal\n' + PAGE)!;
    expect(paye).toContain('même par un admin : paye');
    const si = produit('serveur "b" :\n    roles gerant et client\n    donnee facture :\n        montant : nombre\n        clients : liste de texte\n    route "factures" :\n        seul gerant peut lire facture\n        client peut lire facture si utilisateur.id est dans facture.clients\n        seul gerant peut modifier facture\n' + PAGE)!;
    const bloc = si.slice(si.indexOf("describe('route « factures »'"));
    expect(bloc).not.toContain('un compte sans le bon rôle');
    expect(bloc).toContain('sans session ou avec un faux jeton');
  });
});

describe('une donnée séparée a toujours un intrus', () => {
  it('« par compte » sans rôle déclaré : un autre compte ordinaire essaie de lire, modifier et supprimer la fiche', () => {
    const test = produit('serveur "carnet" :\n    donnee note par compte :\n        titre : texte\n    route "notes" :\n        connecte peut lire note\n        connecte peut creer note\n        connecte peut modifier note\n        connecte peut supprimer note\n' + PAGE)!;
    expect(test).toContain("voisin = await compte('voisin@exemple.cd', 'utilisateur'");
    expect(test).toContain('for (const intrus of [voisin]) {');
    // Une liste vide n'essaierait rien, et ne passerait pas la vérification des types (« npm run build » échouerait).
    expect(test).not.toContain('of []');
  });

  it('les connexions des comptes d’essai ne butent pas sur la limite par adresse', () => {
    const test = produit('serveur "b" :\n    roles a, b, c, d, e\n    donnee note par compte :\n        titre : texte\n    route "notes" :\n        connecte peut lire note\n        connecte peut creer note\n' + PAGE)!;
    expect(test.indexOf("process.env.HUMALIS_LIMITE_CONNEXION = '1000';")).toBeGreaterThan(0);
    expect(test.indexOf("process.env.HUMALIS_LIMITE_CONNEXION = '1000';")).toBeLessThan(test.indexOf('app = creerServeur('));
  });
});
