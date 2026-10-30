import { describe, it, expect } from 'vitest';
import {
  CHEMINS_SERVEUR,
  DONNEES_SERVEUR,
  ENV_EXEMPLE_SERVEUR,
  MARQUE_PROJET_SERVEUR,
  ROUTE_AVIS_SERVEUR,
  TESTS_REGLES_SERVEUR,
  VERSIONS_PACKS,
} from '../src/contenu/projetServeur';

describe('projet serveur de la boutique, calculé par le générateur', () => {
  it('contient la marque, le serveur, les données, les tests et l’environnement', () => {
    for (const f of [MARQUE_PROJET_SERVEUR, 'package.json', 'src/serveur.ts', 'src/donnees.ts', 'src/demarrer.ts', '.env.exemple', 'tests/regles.test.ts']) {
      expect(CHEMINS_SERVEUR, f).toContain(f);
    }
  });

  it('les données sont des types TypeScript et des schémas de champs', () => {
    expect(DONNEES_SERVEUR).toContain('export interface Produit');
    expect(DONNEES_SERVEUR).toContain("disponible: 'booleen'");
  });

  it('la route « avis » montre une garde du pack, la porte fermée et le CSRF', () => {
    expect(ROUTE_AVIS_SERVEUR).toContain('acces.connecte');
    expect(ROUTE_AVIS_SERVEUR).toContain('routeAvis.patch(\'/:id\', refuse');
    expect(ROUTE_AVIS_SERVEUR).toContain('csrfMiddleware');
    expect(ROUTE_AVIS_SERVEUR).toContain("app.use('/api/avis', routeAvis);");
  });

  it('les tests produits vérifient les codes 200, 401 et 403', () => {
    expect(TESTS_REGLES_SERVEUR).toContain('visiteur 401, utilisateur 403, admin 201');
  });

  it('le .env.exemple demande un secret de session et un administrateur', () => {
    expect(ENV_EXEMPLE_SERVEUR).toContain('JWT_SECRET=');
    expect(ENV_EXEMPLE_SERVEUR).toContain('HUMALIS_ADMIN_EMAIL=');
  });

  it('les versions des packs viennent du générateur', () => {
    expect(Object.keys(VERSIONS_PACKS)).toEqual(['@astratra/saas-kit', '@astratra/security', '@astratra/store-postgres']);
  });
});
