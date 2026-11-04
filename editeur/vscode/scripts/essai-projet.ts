/**
 * Essai en vrai du serveur de langage construit sur un projet :
 * npm run essai:projet -- dossier principal.humalis,autre.humalis fichier.humalis …
 * Ouvre chaque fichier comme le ferait un éditeur, puis compare ses diagnostics à ceux de
 * `humalis verifier` sur les fichiers principaux. Ne modifie rien.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ClientLsp } from './client-lsp.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const serveur = join(racine, 'dist', 'serveur-lsp.js');

/** « dans pages/a.humalis, ligne 3 : … » (diagnostic du fichier principal sur un autre fichier), ramené à une forme commune. */
function cle(fichier: string, ligne: number, message: string): string {
  const ailleurs = /^dans (.+), ligne (\d+) : (.*)$/.exec(message);
  return ailleurs ? `${ailleurs[1]}:${ailleurs[2]}: ${ailleurs[3]}` : `${fichier}:${ligne}: ${message}`;
}

/** Ce que dit le compilateur en ligne de commande sur un fichier principal. */
function selonLaCommande(dossier: string, fichier: string): Set<string> {
  const cli = join(racine, '..', '..', 'dist', 'cli.js');
  const { stdout, stderr } = spawnSync(process.execPath, [cli, 'verifier', fichier], { cwd: dossier, encoding: 'utf8' });
  const cles = new Set<string>();
  for (const ligne of `${stdout}\n${stderr}`.split('\n')) {
    const lue = /^(?:Erreur|Avertissement), (?:(.+?), )?ligne (\d+) : (.*)$/.exec(ligne);
    if (lue) cles.add(`${lue[1] ?? fichier}:${lue[2]}: ${lue[3]}`);
  }
  return cles;
}

async function essayer(dossier: string, principaux: string[], fichiers: string[]): Promise<number> {
  if (!existsSync(serveur)) {
    console.error('dist/serveur-lsp.js est absent : lancez d’abord npm run build.');
    return 1;
  }
  const client = new ClientLsp(process.execPath, [serveur, '--stdio'], racine);
  await client.demander('initialize', { processId: process.pid, rootUri: pathToFileURL(dossier).href, capabilities: {} });
  client.notifier('initialized', {});
  let erreurs = 0;
  const vus = new Set<string>();
  for (const fichier of [...principaux, ...fichiers]) {
    const chemin = isAbsolute(fichier) ? fichier : resolve(dossier, fichier);
    const uri = pathToFileURL(chemin).href;
    client.notifier('textDocument/didOpen', { textDocument: { uri, languageId: 'humalis', version: 1, text: readFileSync(chemin, 'utf8') } });
    const message = await client.attendre((m) => m.method === 'textDocument/publishDiagnostics' && m.params.uri === uri, 30_000);
    const diagnostics: { severity: number; message: string; range: { start: { line: number } } }[] = message.params.diagnostics;
    const nbErreurs = diagnostics.filter((d) => d.severity === 1).length;
    erreurs += nbErreurs;
    console.log(`${fichier} : ${nbErreurs} erreur(s), ${diagnostics.length - nbErreurs} avertissement(s)`);
    for (const d of diagnostics) {
      if (d.severity === 1) console.log(`  Erreur, ligne ${d.range.start.line + 1} : ${d.message}`);
      vus.add(cle(fichier, d.range.start.line + 1, d.message));
    }
  }
  client.tuer();
  if (client.erreurs) console.log(`Sortie d'erreur du serveur : ${client.erreurs}`);

  const commande = new Set(principaux.flatMap((p) => [...selonLaCommande(dossier, p)]));
  const enTrop = [...vus].filter((c) => !commande.has(c));
  const manquants = [...commande].filter((c) => !vus.has(c));
  console.log(`\nDiagnostics différents : ${vus.size} pour le serveur de langage, ${commande.size} pour humalis verifier.`);
  console.log(`Seulement dans le serveur de langage : ${enTrop.length}`);
  for (const c of enTrop.slice(0, 20)) console.log(`  ${c}`);
  console.log(`Seulement dans humalis verifier : ${manquants.length}`);
  for (const c of manquants.slice(0, 20)) console.log(`  ${c}`);
  return erreurs === 0 && enTrop.length === 0 ? 0 : 1;
}

const [dossier, principaux, ...fichiers] = process.argv.slice(2);
essayer(resolve(dossier), principaux.split(','), fichiers).then((code) => process.exit(code));
