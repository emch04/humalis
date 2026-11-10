// Outils communs aux essais de bout en bout (scripts/essai-*.mjs).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join } from 'node:path';

/** Les node_modules où chercher Playwright (et parfois tout un projet) : NODE_PATH, puis ~/astratra. */
export const dossiersModules = () => [...(process.env.NODE_PATH ?? '').split(':').filter(Boolean), join(process.env.HOME ?? '', 'astratra/node_modules')];

/** Playwright, cherché dans NODE_PATH puis dans quelques dossiers connus. */
export function chargerPlaywright(autres = []) {
  for (const dossier of [...dossiersModules(), ...autres]) {
    if (existsSync(join(dossier, 'playwright'))) return createRequire(join(dossier, 'x.js'))('playwright');
  }
  throw new Error('Playwright est introuvable : mettez NODE_PATH vers un node_modules qui le contient.');
}

// Un node_modules déjà installé (NODE_PATH…) ne peut servir à un projet produit que
// s'il contient chacune de ses bibliothèques, à la version exacte écrite dans son
// package.json. Sinon (un node_modules fait pour Playwright seul, un React Router
// d'une autre version, pas de @types/react…), tsc ou Vite échouent loin de la vraie
// cause : mieux vaut alors lancer npm install.

/** Les bibliothèques que `build:sans-prerendu` n'utilise pas. */
const INUTILES_SANS_PRERENDU = new Set(['@astratra/prerender', 'playwright']);

/** Le premier dossier de `candidats` qui a chaque bibliothèque du projet à la bonne version, ou undefined. */
export function modulesQuiConviennent(projet, candidats) {
  const paquet = JSON.parse(readFileSync(join(projet, 'package.json'), 'utf8'));
  const attendus = Object.entries({ ...paquet.dependencies, ...paquet.devDependencies }).filter(([nom]) => !INUTILES_SANS_PRERENDU.has(nom));
  return candidats.find((dossier) =>
    attendus.every(([nom, version]) => {
      const fichier = join(dossier, nom, 'package.json');
      return existsSync(fichier) && JSON.parse(readFileSync(fichier, 'utf8')).version === version;
    }),
  );
}

/** Un port TCP libre sur cette machine (le serveur produit écoute sur le port donné, il ne peut pas en choisir un seul). */
export function portLibre() {
  return new Promise((ok, echec) => {
    const essai = createServer();
    essai.on('error', echec);
    essai.listen(0, '127.0.0.1', () => {
      const { port } = essai.address();
      essai.close(() => ok(port));
    });
  });
}

/**
 * Lance un processus et attend la ligne qui dit qu'il est prêt (`pret` renvoie une valeur vraie).
 * S'il s'arrête avant, ou ne dit rien au bout de `delai` ms, l'erreur montre ce qu'il a écrit.
 * Le processus est ajouté à `processus`, pour être arrêté à la fin de l'essai.
 */
export function lancerProcessus(processus, commande, args, options, pret, delai = 30_000) {
  return new Promise((ok, echec) => {
    const p = spawn(commande, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    processus.push(p);
    let sortie = '';
    const minuterie = setTimeout(() => echec(new Error(`${commande} n'a pas dit qu'il était prêt en ${delai / 1000} s :\n${sortie}`)), delai);
    const lire = (morceau) => {
      sortie += String(morceau);
      const trouve = pret(sortie);
      if (trouve) {
        clearTimeout(minuterie);
        ok(trouve);
      }
    };
    p.stdout.on('data', lire);
    p.stderr.on('data', (m) => (sortie += String(m)));
    p.on('exit', (code) => {
      clearTimeout(minuterie);
      echec(new Error(`${commande} s'est arrêté (code ${code}) :\n${sortie}`));
    });
  });
}
