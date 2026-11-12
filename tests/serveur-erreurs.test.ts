import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';

/**
 * Une erreur 500 ne renvoie jamais au navigateur ni la pile ni le message interne (chemins du disque,
 * requêtes SQL), même quand NODE_ENV n'est pas « production » : le serveur produit répond lui-même,
 * après la surveillance, à la place de la réponse d'erreur du pack. Essayé en vrai sur un serveur
 * produit, avec un stockage qui lève une erreur : « Erreur interne du serveur. », sans pile.
 */
describe('la réponse d’une erreur du serveur', () => {
  const source = 'serveur "boutique" :\n    donnee produit :\n        nom : texte\n    route "produits" :\n        tout le monde peut lire produit\n\npage "a" :\n    titre "A"\n';
  const { application } = compiler(source);
  const serveur = genererProjetServeur(application!.serveurs[0]!, { nom: 'b', source: 'b.humalis' }).get('src/serveur.ts')!;

  it('est écrite par le serveur produit, après la surveillance', () => {
    const surveillance = serveur.indexOf('if (surveillance) app.use(surveillance.gestionnaireErreurs());');
    const reponse = serveur.indexOf("const message = statut >= 500 ? 'Erreur interne du serveur.'");
    expect(surveillance).toBeGreaterThan(0);
    expect(reponse).toBeGreaterThan(surveillance);
  });

  it('ne dépend pas de NODE_ENV et ne contient jamais la pile', () => {
    const bloc = serveur.slice(serveur.indexOf("const message = statut >= 500 ? 'Erreur interne du serveur.'") - 900, serveur.indexOf("error: message });") + 20);
    expect(bloc).not.toContain('NODE_ENV');
    expect(bloc).not.toMatch(/stack/);
    expect(bloc).toContain('res.headersSent');
  });
});

describe('une erreur 4xx venue d’un service extérieur', () => {
  const source = 'serveur "boutique" :\n    donnee produit :\n        nom : texte\n    route "produits" :\n        tout le monde peut lire produit\n\npage "a" :\n    titre "A"\n';
  const serveur = genererProjetServeur(compiler(source).application!.serveurs[0]!, { nom: 'b', source: 'b.humalis' }).get('src/serveur.ts')!;

  it('ne part pas telle quelle : sans « expose », elle devient 502 et son message reste dans le journal', () => {
    expect(serveur).toContain('const statut = lu < 500 && e.expose !== true ? 502 : lu;');
  });
});
