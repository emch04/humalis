/**
 * Les lignes Humalis dans le serveur produit. Node est lancé avec
 * --enable-source-maps et les cartes sont composées après tsc
 * (humalis-cartes.mjs) : les piles d'erreurs nomment déjà les fichiers
 * `.humalis`. Ce module les met en forme (« ligne 12 de boutique.humalis »),
 * pour le journal du serveur et pour `erreur.ligne` dans « quand une erreur
 * arrive ».
 */
import { REPERE_SOURCES } from '../commun/lignes-web.js';
import { NOTER_SERVEUR_TS } from '../commun/noter.js';

export const LIGNES_SERVEUR_TS = `// Produit par Humalis : les erreurs du serveur rendues à leurs lignes Humalis.
import { basename, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Le dossier des fichiers Humalis : ce fichier est dans dist/src/humalis, la racine du projet trois dossiers plus haut. */
const SOURCES = resolve(import.meta.dirname, '..', '..', '..', ${JSON.stringify(REPERE_SOURCES)});
const MOTIF = /(?:file:\\/\\/)?((?:[A-Za-z]:)?[^\\s()]*\\.humalis):(\\d+)(?::\\d+)?/g;

function nomDe(chemin: string): string {
  const absolu = chemin.startsWith('file:') ? fileURLToPath(chemin) : resolve(chemin);
  const relatif = relative(SOURCES, absolu).split(sep).join('/');
  return relatif.startsWith('..') ? basename(absolu) : relatif;
}

/** La pile, chaque position dans un fichier Humalis écrite « ligne 12 de boutique.humalis ». */
export function pileHumalis(pile: string): string {
  return pile.replace(MOTIF, (_tout, chemin: string, ligne: string) => \`ligne \${ligne} de \${nomDe(chemin)}\`);
}

/** « boutique.humalis:12 » : la première ligne Humalis de la pile, ou "" si aucune. */
export function ligneHumalis(erreur: unknown): string {
  const pile = erreur instanceof Error ? String(erreur.stack ?? '') : '';
  MOTIF.lastIndex = 0;
  const trouve = MOTIF.exec(pile);
  MOTIF.lastIndex = 0;
  return trouve ? \`\${nomDe(trouve[1]!)}:\${trouve[2]}\` : '';
}

/**
 * L'erreur telle qu'elle va au journal : une erreur de MySQL ou de MariaDB porte la requête entière, valeurs comprises
 * (le contenu d'une fiche, l'empreinte d'un mot de passe), et une base de documents cite la clé en double. Seuls leur
 * code et leur pile restent.
 */
export function erreurDuJournal(erreur: unknown): unknown {
  if (!(erreur instanceof Error)) return erreur;
  const e = erreur as Error & { sqlState?: unknown; errno?: unknown; code?: unknown };
  let message: string | undefined;
  if (typeof e.sqlState === 'string') message = 'Erreur MySQL ' + String(e.errno ?? '') + ' ' + String(e.code ?? '');
  else if (/^Mongo/.test(e.name)) message = 'Erreur de la base de documents ' + String(e.code ?? '');
  if (message === undefined) return erreur;
  const reduite = new Error(message.trim());
  reduite.stack = reduite.message + '\\n' + String(e.stack ?? '').split('\\n').filter((l) => /^\\s+at /.test(l)).join('\\n');
  return reduite;
}

/** Écrit l'erreur dans le journal avec sa ligne Humalis, quand elle en vient. */
export function journaliserErreur(brute: unknown, ou = ''): void {
  const erreur = erreurDuJournal(brute);
  const ligne = ligneHumalis(erreur);
  if (!ligne || !(erreur instanceof Error)) return;
  const i = ligne.lastIndexOf(':');
  const lignes = pileHumalis(String(erreur.stack ?? '')).split('\\n').filter((l) => l.includes('.humalis'));
  console.error(\`Erreur, ligne \${ligne.slice(i + 1)} de \${ligne.slice(0, i)}\${ou ? \` (\${ou})\` : ''} : \${erreur.message}\\n\${lignes.join('\\n')}\`);
}
${NOTER_SERVEUR_TS}`;
