import { it } from 'vitest';

/**
 * « changer role de … en … » (revue de sécurité de la 3.0.0, remarque J) : les jetons déjà émis portent l'ancien rôle ;
 * ils sont fermés, et l'annonce les ferme aussi dans les autres services d'un projet. Les essais produits du serveur
 * (tests/comptes.test.ts) le vérifient, lancés ici.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { installerSiBesoin } from './aide-installation.js';
it('changer un rôle ferme les jetons déjà émis (essais produits du serveur)', () => {
  const source = 'serveur "api" :\n    roles gerant et client\n    donnee note :\n        texte : texte\n    route "notes" :\n        connecte peut lire note\n    route "equipe" :\n        seul admin peut lire comptes\n\npage "p" :\n    titre "P"\n    bouton "Go"\n    quand l\'utilisateur clique sur "Go" :\n        changer role de "x" en "gerant"\n';
  const { application, diagnostics } = compiler(source);
  if (diagnostics.some((d) => d.gravite === 'erreur')) throw new Error(JSON.stringify(diagnostics));
  const dossier = join(tmpdir(), 'humalis-changer-role');
  rmSync(join(dossier, 'src'), { recursive: true, force: true });
  for (const [chemin, contenu] of genererProjetServeur(application!.serveurs[0]!, { nom: 'api', source: 'api.humalis' })) {
    mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
  installerSiBesoin(dossier);
  execFileSync('npx', ['vitest', 'run', 'tests/comptes.test.ts'], { cwd: dossier, encoding: 'utf8', stdio: 'pipe' });
}, 600_000);
