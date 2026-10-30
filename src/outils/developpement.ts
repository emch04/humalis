import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function dependances(fichier: string, source: string): string[] {
  return [...source.matchAll(/^\s*utiliser\s+(?:fichier|style)\s+"([^"]+)"/gmu)]
    .map((capture) => resolve(dirname(fichier), capture[1]));
}

function dateFichier(chemin: string): string {
  try { const etat = statSync(chemin); return `${etat.mtimeMs}:${etat.size}`; }
  catch { return 'absent'; }
}

export function trouverPrincipal(dossier: string): string {
  const manifeste = JSON.parse(readFileSync(join(dossier, 'humalis.projet.json'), 'utf8')) as { principal?: unknown };
  if (typeof manifeste.principal !== 'string' || !/^[\w-]+\.humalis$/u.test(manifeste.principal)) throw new Error('Le manifeste doit contenir un fichier principal Humalis local.');
  return join(dossier, manifeste.principal);
}

/** Surveille les fichiers et lance Vite seulement si la sortie web possède ses dépendances. */
export async function developper(fichier: string, port: number): Promise<number> {
  const sortie = join(dirname(fichier), '.humalis', 'web');
  mkdirSync(dirname(sortie), { recursive: true });
  const cli = fileURLToPath(new URL('../cli.js', import.meta.url));
  let erreur = '';
  let serveur: Server | undefined;
  let vite: ChildProcess | undefined;
  let minuteur: ReturnType<typeof setInterval> | undefined;
  let actifs = new Map<string, string>();
  const parcourir = (chemin: string, visites: Set<string>): void => {
    if (visites.has(chemin)) return;
    visites.add(chemin);
    if (!chemin.endsWith('.humalis')) return;
    try { for (const suivant of dependances(chemin, readFileSync(chemin, 'utf8'))) parcourir(suivant, visites); } catch { /* Le compilateur signale le fichier manquant. */ }
  };
  const compiler = (): boolean => {
    const resultat = spawnSync(process.execPath, [cli, 'compile', fichier, '--cible', 'web', '--sortie', sortie, '--diagnostics-port', String(port + 1)], { encoding: 'utf8' });
    if (resultat.status !== 0) {
      erreur = resultat.stderr || resultat.error?.message || 'Compilation impossible.';
      console.error(erreur.trim());
      return false;
    }
    erreur = '';
    console.error('Recompilé.');
    return true;
  };
  const actualiser = (): void => {
    const visites = new Set<string>();
    parcourir(fichier, visites);
    const suivant = new Map([...visites].map((chemin) => [chemin, dateFichier(chemin)]));
    if ([...suivant].some(([chemin, date]) => actifs.get(chemin) !== date) || [...actifs.keys()].some((chemin) => !suivant.has(chemin))) compiler();
    actifs = suivant;
  };
  actualiser();
  if (!existsSync(join(sortie, 'node_modules', 'vite'))) {
    console.error(`Dépendances absentes. Exécutez : cd ${sortie} && npm install, puis relancez humalis developper.`);
    return 1;
  }
  serveur = createServer((requete, reponse) => {
    reponse.setHeader('Access-Control-Allow-Origin', '*');
    if (requete.url === '/diagnostics.js') {
      reponse.setHeader('Content-Type', 'text/javascript');
      reponse.end(`let panneau=document.createElement('pre');panneau.style='position:fixed;inset:0 0 auto;z-index:999999;background:#420;color:white;padding:1rem;white-space:pre-wrap;display:none';document.body.append(panneau);setInterval(async()=>{let e=await(await fetch('http://localhost:${port + 1}/diagnostics')).text();panneau.textContent=e;panneau.style.display=e?'block':'none'},500);`);
    } else { reponse.setHeader('Content-Type', 'text/plain; charset=utf-8'); reponse.end(erreur); }
  });
  try { await new Promise<void>((ok, echec) => serveur!.once('error', echec).listen(port + 1, '127.0.0.1', ok)); }
  catch (e) { console.error(`Panneau indisponible : ${(e as Error).message}`); return 1; }
  vite = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], { cwd: sortie, stdio: 'inherit' });
  minuteur = setInterval(actualiser, 350);
  return await new Promise<number>((fin) => {
    const arreter = () => { if (minuteur) clearInterval(minuteur); serveur?.close(); vite?.kill('SIGTERM'); };
    process.once('SIGINT', arreter);
    process.once('SIGTERM', arreter);
    vite!.once('exit', (code) => { arreter(); fin(code ?? 0); });
  });
}
