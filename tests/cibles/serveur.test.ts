import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { genererProjetServeur } from '../../src/cibles/serveur/projet.js';

const application = compiler(readFileSync('exemples/boutique-serveur.humalis', 'utf8')).application!;
const fichiers = genererProjetServeur(application.serveurs[0], { nom: 'boutique', source: 'boutique-serveur.humalis' });
const serveur = fichiers.get('src/serveur.ts')!;

describe('cible serveur — projet produit', () => {
  it('écrit un projet Node complet', () => {
    expect([...fichiers.keys()].sort()).toEqual([
      '.env.exemple', '.gitignore', '.humalis-projet', 'LISEZMOI.md', 'package.json',
      'src/demarrer.ts', 'src/donnees.ts', 'src/humalis/stockage.ts', 'src/humalis/verifier.ts', 'src/serveur.ts',
      'tests/regles.test.ts', 'tsconfig.json',
    ]);
  });

  it('assemble le serveur avec createSaasApp et ses gardes', () => {
    expect(serveur).toContain("import { createSaasApp, type UsersStore } from '@astratra/saas-kit';");
    expect(serveur).toContain('extendRoutes: (app, contexte) => {');
    expect(serveur).toContain('seulAdmin: [authMiddleware, authorizeAdmin],');
    expect(serveur).toContain("app.use('/api/produits', routeProduits);");
  });

  it('traduit chaque règle en garde, et ferme la porte aux actions sans règle', () => {
    expect(serveur).toContain("routeProduits.get('/', ...acces.toutLeMonde,");
    expect(serveur).toContain("routeProduits.post('/', ...acces.seulAdmin, csrfMiddleware,");
    expect(serveur).toContain("routeAvis.post('/', ...acces.connecte, csrfMiddleware,");
    expect(serveur).toContain("routeAvis.patch('/:id', refuse,");
    expect(serveur).toContain("routeAvis.delete('/:id', ...acces.seulAdmin, csrfMiddleware,");
  });

  it('n’invente aucune sécurité : ni mot de passe, ni secret, ni hachage maison', () => {
    for (const [chemin, contenu] of fichiers) {
      if (!chemin.endsWith('.ts') || chemin.startsWith('tests/')) continue;
      expect(contenu, chemin).not.toMatch(/createHash|bcrypt|jsonwebtoken|md5|sha1|sha256/i);
    }
    const demarrer = fichiers.get('src/demarrer.ts')!;
    expect(demarrer).toContain("import { hashPassword, isStrongPassword } from '@astratra/security';");
    expect(demarrer).toContain('process.env.HUMALIS_ADMIN_MOT_DE_PASSE');
    expect(demarrer).toContain('jwtSecret.length < 32');
  });

  it('décrit les données et leur vérification', () => {
    const donnees = fichiers.get('src/donnees.ts')!;
    expect(donnees).toContain('export interface Produit {');
    expect(donnees).toContain('  prix: number;');
    expect(donnees).toContain("  disponible: 'booleen',");
  });

  it('n’écrit que des requêtes paramétrées', () => {
    const stockage = fichiers.get('src/humalis/stockage.ts')!;
    expect(stockage).toContain('WHERE id = $1');
    expect(stockage).not.toMatch(/\$\{(id|valeurs)\}/);
  });

  it('épingle des versions exactes', () => {
    const paquet = JSON.parse(fichiers.get('package.json')!);
    for (const version of [...Object.values(paquet.dependencies), ...Object.values(paquet.devDependencies)]) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('produit une vérification par action et par route', () => {
    const tests = fichiers.get('tests/regles.test.ts')!;
    expect(tests).toContain("it('creer : visiteur 401, utilisateur 403, admin 201'");
    expect(tests).toContain("it('modifier : visiteur 403, utilisateur 403, admin 403'");
    expect(tests).toContain("it('creer : visiteur 401, utilisateur 201, admin 201'");
    expect(tests).toContain("it('refuse un envoi mal formé (400)'");
  });

  it('le visiteur renvoie lui-même son cookie CSRF : sous Vitest, le pack le marque Secure et supertest parle en http', () => {
    const tests = fichiers.get('tests/regles.test.ts')!;
    expect(tests).toContain("const jeton = cookie?.split(';')[0].split('=')[1];");
    expect(tests).toContain("csrf = jeton ? { 'x-csrf-token': jeton, cookie: `astratra_csrf=${jeton}` } : {};");
  });

  it('les tests ne tournent qu’une fois, même après la construction (pas ceux de dist/)', () => {
    const paquet = JSON.parse(fichiers.get('package.json')!);
    expect(paquet.scripts.test).toBe('vitest run --dir tests');
  });
});
