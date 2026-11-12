import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';

/**
 * Chaque magasin du serveur produit (sessions, jetons fermés, envois, liens de mot de passe, tâches, coffre,
 * double authentification, clés d'accès) écrit ses requêtes une seule fois, pour PostgreSQL. Ce test les joue
 * tous sur une VRAIE base SQLite, dans un vrai serveur construit : la seconde base tient les mêmes promesses.
 * Le scénario est dans serveur-sqlite-magasins.mjs ; il s'arrête à la première promesse non tenue.
 */
const SOURCE = readFileSync(new URL('./serveur-sqlite-magasins.humalis', import.meta.url), 'utf8');
const SCENARIO = readFileSync(new URL('./serveur-sqlite-magasins.mjs', import.meta.url), 'utf8');
let sortie = '';

describe('les magasins du serveur sur une vraie base SQLite', () => {
  beforeAll(() => {
    const { application, diagnostics } = compiler(SOURCE);
    expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message)).toEqual([]);
    const dossier = join(tmpdir(), 'humalis-sqlite-magasins');
    rmSync(join(dossier, 'src'), { recursive: true, force: true });
    rmSync(join(dossier, 'dist'), { recursive: true, force: true });
    for (const [chemin, contenu] of genererProjetServeur(application!.serveurs[0]!, { nom: 'tout', source: 'tout.humalis' })) {
      mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
      writeFileSync(join(dossier, chemin), contenu);
    }
    writeFileSync(join(dossier, 'magasins.mjs'), SCENARIO);
    // Les modules d'un autre essai de vrai serveur, s'ils sont déjà là ; sinon, ceux du projet produit.
    const voisins = join(tmpdir(), 'humalis-attaques-groupes', 'node_modules');
    if (!existsSync(join(dossier, 'node_modules'))) {
      if (existsSync(join(voisins, 'typescript'))) symlinkSync(voisins, join(dossier, 'node_modules'));
      else execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'pipe' });
    }
    try {
      execFileSync('npx', ['tsc'], { cwd: dossier, stdio: 'pipe', encoding: 'utf8' });
    } catch (erreur) {
      // Seul le pack des e-mails peut manquer aux modules empruntés : toute autre faute de types arrête l'essai.
      const fautes = String((erreur as { stdout?: unknown }).stdout ?? erreur).split('\n').filter((l) => l.includes('error TS'));
      expect(fautes.filter((l) => !l.includes("'@astratra/notify'"))).toEqual([]);
    }
    try {
      sortie = execFileSync('node', ['magasins.mjs'], { cwd: dossier, encoding: 'utf8', stdio: 'pipe' });
    } catch (erreur) {
      sortie = String((erreur as { stdout?: unknown }).stdout ?? '') + String((erreur as { stderr?: unknown }).stderr ?? erreur);
    }
  }, 300_000);

  it.each(['sessions et renouvellements', 'jetons fermés', 'envois rejoués', 'liens de mot de passe', 'tâches', 'coffre des clés', 'double authentification', "clés d'accès"])('%s', (magasin) => {
    expect(sortie, sortie).toContain('✓ ' + magasin);
  });

  it('aucune promesse non tenue', () => {
    expect(sortie, sortie).toContain('Tous les magasins tiennent sur SQLite.');
  });
});
