import { octetsAEcrire } from '../cibles/binaire.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Préserve la date et l'identité des fichiers produits dont le contenu n'a pas changé. */
export function ecrireSiChange(fichier: string, contenu: string): boolean {
  // Une image produite (logo, image de partage) arrive en base 64 : on écrit ses octets.
  const donnees = octetsAEcrire(contenu);
  try {
    const actuel = readFileSync(fichier);
    if (typeof donnees === 'string' ? actuel.toString('utf8') === donnees : Buffer.compare(actuel, donnees) === 0) return false;
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code !== 'ENOENT') throw erreur;
  }
  mkdirSync(dirname(fichier), { recursive: true });
  writeFileSync(fichier, donnees);
  return true;
}
