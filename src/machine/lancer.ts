/**
 * `humalis lancer fichier.humalis` : fait tourner un programme directement, sans projet produit, sans
 * `npm install` et sans construction. Le programme est compilé en mémoire, servi par un petit serveur
 * local (127.0.0.1 seulement) et recompilé à chaque enregistrement. Rien n'est écrit sur le disque.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { Machine } from './machine.js';
import type { Ressources } from './noyau.js';

export interface OptionsLancer {
  port: number;
  ouvrir: boolean;
  /** Où la machine dit ce qu'elle fait (la sortie d'erreur de la commande). */
  dire: (message: string) => void;
}

const LIMITE_CORPS = 2_000_000;

function lireFichier(chemin: string): Buffer | undefined {
  try {
    return statSync(chemin).isFile() ? readFileSync(chemin) : undefined;
  } catch {
    return undefined;
  }
}
const signature = (chemin: string): string => {
  try { const e = statSync(chemin); return `${e.mtimeMs}:${e.size}`; } catch { return 'absent'; }
};

function lireCorps(requete: IncomingMessage): Promise<Buffer | 'trop-gros'> {
  return new Promise((ok, echec) => {
    const morceaux: Buffer[] = [];
    let taille = 0;
    requete.on('data', (m: Buffer) => {
      taille += m.length;
      if (taille > LIMITE_CORPS) { requete.destroy(); ok('trop-gros'); } else morceaux.push(m);
    });
    requete.on('end', () => ok(Buffer.concat(morceaux)));
    requete.on('error', echec);
  });
}

/** Seulement la machine locale : un autre nom d'hôte (une attaque par « rebinding » DNS) est refusé. */
const hoteLocal = (hote: string | undefined): boolean => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(hote ?? '');

function ecrireReponse(res: ServerResponse, statut: number, entetes: Record<string, string | string[]>, corps?: string | Uint8Array): void {
  res.writeHead(statut, entetes);
  res.end(corps);
}

async function servir(machine: Machine, requete: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!hoteLocal(requete.headers.host)) return ecrireReponse(res, 403, { 'content-type': 'text/plain; charset=utf-8' }, 'La machine ne répond qu\'à localhost.');
  const url = new URL(requete.url ?? '/', 'http://localhost');
  const entetes: Record<string, string> = {};
  for (const [nom, valeur] of Object.entries(requete.headers)) if (valeur !== undefined) entetes[nom] = Array.isArray(valeur) ? valeur.join(', ') : valeur;
  let corps: unknown;
  if (requete.method !== 'GET' && requete.method !== 'HEAD') {
    const brut = await lireCorps(requete);
    if (brut === 'trop-gros') return ecrireReponse(res, 413, { 'content-type': 'application/json' }, JSON.stringify({ erreur: 'les données envoyées sont trop grosses' }));
    if (brut.length > 0) {
      try { corps = JSON.parse(brut.toString('utf8')); }
      catch { return ecrireReponse(res, 400, { 'content-type': 'application/json' }, JSON.stringify({ erreur: 'les données envoyées doivent être un objet JSON' })); }
    }
  }
  const reponse = await machine.traiter({ methode: requete.method ?? 'GET', chemin: url.pathname, requete: url.searchParams, entetes, corps });
  if (reponse.direct) {
    res.writeHead(reponse.statut, { ...reponse.entetes, connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const fin = reponse.direct((texte) => { if (!res.writableEnded) res.write(texte); });
    requete.on('close', fin);
    return;
  }
  if (requete.method === 'HEAD') return ecrireReponse(res, reponse.statut, reponse.entetes);
  ecrireReponse(res, reponse.statut, reponse.entetes, reponse.corps);
}

function ouvrirLeNavigateur(adresse: string): void {
  const [commande, args] = process.platform === 'darwin' ? ['open', [adresse]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', adresse]] : ['xdg-open', [adresse]];
  spawn(commande, args, { stdio: 'ignore', detached: true }).on('error', () => undefined).unref();
}

async function ecouter(serveur: Server, port: number): Promise<number> {
  for (let essai = 0; essai < 20; essai++) {
    const choisi = port === 0 ? 0 : port + essai;
    try {
      await new Promise<void>((ok, echec) => { serveur.once('error', echec); serveur.listen(choisi, '127.0.0.1', () => { serveur.off('error', echec); ok(); }); });
      const adresse = serveur.address();
      return typeof adresse === 'object' && adresse ? adresse.port : choisi;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE' || port === 0) throw e;
    }
  }
  throw new Error(`Aucun port libre entre ${port} et ${port + 19}.`);
}

/** Lance la machine sur ce fichier ; rend le code de sortie quand on l'arrête (Ctrl+C). */
export async function lancer(fichier: string, options: OptionsLancer): Promise<number> {
  const chemin = resolve(fichier);
  const dossier = dirname(chemin);
  const dire = options.dire;
  if (lireFichier(chemin) === undefined) {
    dire(`Impossible de lire le fichier « ${fichier} ».`);
    return 2;
  }
  let adresse = `http://localhost:${options.port}`;
  const ressources: Ressources = {
    texte: (c) => lireFichier(join(dossier, c))?.toString('utf8'),
    octets: (c) => { const b = lireFichier(join(dossier, c)); return b ? new Uint8Array(b.buffer, b.byteOffset, b.length) : undefined; },
  };
  const machine = new Machine({
    adresse: () => adresse,
    principal: chemin,
    lire: (autre) => lireFichier(autre)?.toString('utf8'),
    ressources,
    sourceDe: (relatif) => lireFichier(join(dossier, relatif))?.toString('utf8'),
    journal: (m) => dire(`  ${m}`),
  });

  const charger = async (): Promise<boolean> => {
    const source = lireFichier(chemin)?.toString('utf8');
    if (source === undefined) { dire(`Le fichier « ${fichier} » a disparu.`); return false; }
    const resultat = await machine.charger(source);
    if (!resultat.ok) {
      dire(machine.erreurs);
      dire('\nLe programme a des erreurs : la page les montre, et se recharge dès que vous les corrigez.');
      return false;
    }
    for (const d of resultat.diagnostics) dire(`Avertissement${d.fichier ? `, ${d.fichier}` : ''}, ligne ${d.ligne} : ${d.message}`);
    for (const note of resultat.notes) dire(note.startsWith('compilé') ? `Prêt : ${note}.` : `Attention : ${note}`);
    return true;
  };

  const premier = await charger();
  const serveur = createServer((requete, reponse) => {
    servir(machine, requete, reponse).catch((erreur: unknown) => {
      dire(`Erreur de la machine : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      if (!reponse.headersSent) ecrireReponse(reponse, 500, { 'content-type': 'text/plain; charset=utf-8' }, 'Erreur de la machine.');
      else reponse.end();
    });
  });
  let port: number;
  try { port = await ecouter(serveur, options.port); }
  catch (e) { dire((e as Error).message); return 1; }
  adresse = `http://localhost:${port}`;
  if (port !== options.port) dire(`Le port ${options.port} est pris : la machine écoute sur ${port}.`);

  if (premier) {
    const etat = machine.serveur;
    dire(`\nHumalis tourne sur ${adresse}   (panneau : ${adresse}/__machine)`);
    if (etat) {
      dire('Le serveur du programme tourne en mémoire (données, droits, comptes) : tout est perdu à l\'arrêt.');
      if (etat.comptesDEssai.length > 0) {
        dire(`Comptes d'essai (mot de passe : ${etat.comptesDEssai[0].motDePasse}) :`);
        for (const c of etat.comptesDEssai) dire(`  ${c.email}  (${c.role})`);
      }
      if (etat.limites.length > 0) {
        dire('Ce que la machine ne fait pas pour de vrai :');
        for (const l of etat.limites) dire(`  - ${l.fonction} : ${l.explication}`);
      }
    }
    dire('Enregistrez le fichier : la page change toute seule. Ctrl+C pour arrêter.');
  } else dire(`\nHumalis écoute sur ${adresse}.`);
  if (options.ouvrir) ouvrirLeNavigateur(adresse);

  // Le rechargement : on regarde le fichier, ceux qu'il utilise et ce qu'il lit à côté (styles, images).
  let signatures = new Map<string, string>();
  const surveilles = (): string[] => {
    const { projet, ressources: lues } = machine.fichiersLus();
    return [chemin, ...projet.map((p) => join(dossier, p)), ...lues.map((r) => join(dossier, r))];
  };
  const photographier = () => new Map(surveilles().map((c) => [c, signature(c)]));
  signatures = photographier();
  let occupe = false;
  const minuteur = setInterval(() => {
    if (occupe) return;
    const suivantes = photographier();
    const change = [...suivantes].some(([c, s]) => signatures.get(c) !== s) || [...signatures.keys()].some((c) => !suivantes.has(c));
    if (!change) return;
    occupe = true;
    void charger().finally(() => { signatures = photographier(); occupe = false; });
  }, 200);

  return await new Promise<number>((fin) => {
    const arreter = () => {
      clearInterval(minuteur);
      machine.serveur?.arreter();
      serveur.closeAllConnections();
      serveur.close(() => fin(0));
    };
    process.once('SIGINT', arreter);
    process.once('SIGTERM', arreter);
  });
}
