import { octetsAEcrire } from '../cibles/binaire.js';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

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

/** La liste des fichiers produits, gardée dans le dossier : la compilation suivante retire ceux qui ne servent plus, et rien d'autre. */
const LISTE_PRODUITS = '.humalis-fichiers.json';

export function retirerAnciensProduits(sortie: string, fichiers: Map<string, string>): void {
  const liste = join(sortie, LISTE_PRODUITS);
  let anciens: unknown = [];
  try {
    anciens = JSON.parse(readFileSync(liste, 'utf8'));
  } catch {
    // Pas encore de liste : rien à retirer.
  }
  const racine = resolve(sortie);
  let retires = 0;
  for (const relatif of Array.isArray(anciens) ? anciens : []) {
    if (typeof relatif !== 'string' || fichiers.has(relatif)) continue;
    const fichier = resolve(racine, relatif);
    // Une liste modifiée à la main ne fait jamais sortir du dossier.
    if (!fichier.startsWith(racine + sep) || !existsSync(fichier)) continue;
    rmSync(fichier);
    retires++;
    for (let dossier = dirname(fichier); dossier !== racine && readdirSync(dossier).length === 0; dossier = dirname(dossier)) rmdirSync(dossier);
  }
  writeFileSync(liste, `${JSON.stringify([...fichiers.keys()].sort(), null, 2)}\n`);
  if (retires > 0) console.error(`${retires} fichier${retires > 1 ? 's' : ''} qui ne servai${retires > 1 ? 'en' : ''}t plus retiré${retires > 1 ? 's' : ''} du dossier « ${sortie} ».`);
}
