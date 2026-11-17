import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { fichiersEntree } from '../src/cibles/serveur/entree.js';
import { installerSiBesoin } from './aide-installation.js';

/**
 * Un projet en services, pour de vrai (17 novembre 2026) : trois services produits (comptes, catalogue, commandes),
 * construits, lancés, qui se parlent. La connexion au service des comptes vaut pour les autres (ES256) ; une action
 * des commandes lit un produit au catalogue et y fait « reserver » au nom de la personne ; un refus revient tel quel ;
 * le message « commande-validee » arrive et n'est traité qu'une fois ; sans personne, un service n'a que ses droits ;
 * une requête rejouée est refusée ; une déconnexion ferme le jeton partout. Puis le même scénario par le seul relais
 * « entree ». Le scénario est dans serveur-services.mjs.
 */
const SOURCE = readFileSync(new URL('./serveur-services.humalis', import.meta.url), 'utf8');
const SCENARIO = new URL('./serveur-services.mjs', import.meta.url).pathname;
const dossier = join(tmpdir(), 'humalis-services');
let direct = '';
let parEntree = '';

const lancer = (env: Record<string, string>, port: number) => {
  try {
    return execFileSync('node', [SCENARIO, dossier, String(port)], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...env } });
  } catch (erreur) {
    return String((erreur as { stdout?: unknown }).stdout ?? '') + String((erreur as { stderr?: unknown }).stderr ?? erreur);
  }
};

describe('trois services qui se parlent, pour de vrai', () => {
  beforeAll(() => {
    const { application, diagnostics } = compiler(SOURCE);
    expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message)).toEqual([]);
    const serveurs = application!.serveurs;
    expect(serveurs.map((s) => s.projet?.comptes)).toEqual(['comptes', 'comptes', 'comptes']);
    for (const s of serveurs) {
      const ici = join(dossier, s.nom);
      for (const sous of ['src', 'dist', 'tests', 'scripts']) rmSync(join(ici, sous), { recursive: true, force: true });
      for (const [chemin, contenu] of genererProjetServeur(s, { nom: s.nom, source: 'boutique.humalis' })) {
        mkdirSync(dirname(join(ici, chemin)), { recursive: true });
        writeFileSync(join(ici, chemin), contenu);
      }
    }
    for (const [chemin, contenu] of fichiersEntree(serveurs)) {
      mkdirSync(dirname(join(dossier, 'entree', chemin)), { recursive: true });
      writeFileSync(join(dossier, 'entree', chemin), contenu);
    }
    // Les trois services ont les mêmes paquets : une installation, partagée.
    installerSiBesoin(join(dossier, 'comptes'));
    for (const s of ['catalogue', 'commandes']) if (!existsSync(join(dossier, s, 'node_modules'))) symlinkSync(join(dossier, 'comptes', 'node_modules'), join(dossier, s, 'node_modules'));
    for (const s of serveurs) execFileSync('npx', ['tsc'], { cwd: join(dossier, s.nom), stdio: 'pipe' });
    const depart = 5200 + (process.pid % 300) * 2;
    direct = lancer({}, depart);
    parEntree = lancer({ ENTREE: '1' }, depart + 10);
  }, 600_000);

  it.each([
    'connexion au service des comptes (jeton ES256)',
    'le catalogue reconnaît le jeton, et ne tient pas de comptes',
    'une action des commandes lit le produit au catalogue et y fait « reserver », au nom de la personne',
    'le message « commande-validee » arrive au catalogue, qui écrit un mouvement',
    'un refus du catalogue revient tel quel, et la commande reste ouverte',
    'une signature de service fausse est refusée',
    'sans personne, un service n’a que ses droits ; une requête rejouée est refusée',
    'une déconnexion ferme le jeton dans les autres services',
    'un rapport d’erreur des pages part, avec la clé du .env, vers le système de suivi',
  ])('%s', (etape) => {
    expect(direct, direct).toContain('✓ ' + etape);
    expect(parEntree, parEntree).toContain('✓ ' + etape);
  });

  it('tout passe par la seule adresse du relais « entree »', () => {
    expect(parEntree, parEntree).toContain('✓ le relais « entree » répond, et chaque service est prêt');
    expect(parEntree, parEntree).toContain('Les services se parlent.');
  });

  it('les essais produits passent dans chaque service', () => {
    for (const s of ['comptes', 'catalogue', 'commandes']) {
      // Sans couleurs : lancé depuis un terminal, vitest colorerait son résumé (« Tests  23 passed »).
      const sortie = stripVTControlCharacters(execFileSync('npx', ['vitest', 'run', '--dir', 'tests'], {
        cwd: join(dossier, s), encoding: 'utf8', stdio: 'pipe', env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      }));
      expect(sortie, s).toMatch(/Tests\s+\d+ passed/);
    }
  }, 300_000);
});
