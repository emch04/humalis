/**
 * Essai en vrai de « humalis editeur --stdio » (npm run essai:editeur),
 * après npm run build : lance la commande comme le ferait un éditeur, lui
 * parle en JSON-RPC sur son entrée standard, et vérifie chaque réponse :
 * initialize, diagnostics, survol, complétion, déclaration, plan, jetons
 * sémantiques, mise en forme, arrêt.
 *
 *     node scripts/essai-editeur.mjs                 # node dist/cli.js editeur --stdio
 *     node scripts/essai-editeur.mjs humalis         # la commande installée (npm i -g humalis)
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const fichier = join(racine, 'exemples', 'boutique.humalis');

function ecrire(message) {
  const corps = Buffer.from(JSON.stringify(message), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${corps.length}\r\n\r\n`, 'ascii'), corps]);
}

class Client {
  recus = [];
  erreurs = '';
  tampon = Buffer.alloc(0);
  prochainId = 0;

  constructor(commande, args) {
    this.processus = spawn(commande, args, { cwd: racine, stdio: 'pipe' });
    this.processus.stdout.on('data', (morceau) => {
      this.tampon = Buffer.concat([this.tampon, morceau]);
      for (;;) {
        const fin = this.tampon.indexOf('\r\n\r\n');
        if (fin === -1) break;
        const longueur = Number(/Content-Length:\s*(\d+)/i.exec(this.tampon.subarray(0, fin).toString('ascii'))?.[1]);
        if (this.tampon.length < fin + 4 + longueur) break;
        this.recus.push(JSON.parse(this.tampon.subarray(fin + 4, fin + 4 + longueur).toString('utf8')));
        this.tampon = this.tampon.subarray(fin + 4 + longueur);
      }
    });
    this.processus.stderr.on('data', (morceau) => (this.erreurs += morceau.toString()));
  }

  attendre(condition, delai = 15_000) {
    return new Promise((resoudre, rejeter) => {
      const debut = Date.now();
      const essayer = () => {
        const trouve = this.recus.find(condition);
        if (trouve) return resoudre(trouve);
        if (Date.now() - debut > delai) return rejeter(new Error(`pas de réponse du serveur (sortie d'erreur : ${this.erreurs || 'vide'})`));
        setTimeout(essayer, 20);
      };
      essayer();
    });
  }

  demander(method, params) {
    const id = ++this.prochainId;
    this.processus.stdin.write(ecrire({ jsonrpc: '2.0', id, method, params }));
    return this.attendre((m) => m.id === id && m.method === undefined);
  }

  notifier(method, params) {
    this.processus.stdin.write(ecrire({ jsonrpc: '2.0', method, params }));
  }

  fin(delai = 10_000) {
    return new Promise((resoudre, rejeter) => {
      if (this.processus.exitCode !== null) return resoudre(this.processus.exitCode);
      const minuterie = setTimeout(() => rejeter(new Error('le serveur ne s’arrête pas')), delai);
      this.processus.on('exit', (code) => { clearTimeout(minuterie); resoudre(code); });
    });
  }
}

async function essayer() {
  const commande = process.argv[2];
  if (!commande && !existsSync(join(racine, 'dist', 'editeur', 'serveur.js'))) {
    console.error('dist/editeur/serveur.js est absent : lancez d’abord npm run build.');
    return 1;
  }
  const client = commande
    ? new Client(commande, ['editeur', '--stdio'])
    : new Client(process.execPath, [join(racine, 'dist', 'cli.js'), 'editeur', '--stdio']);
  const verifications = [];
  const verifier = (nom, ok, detail) => verifications.push([nom, ok, typeof detail === 'string' ? detail : JSON.stringify(detail)]);
  const texte = readFileSync(fichier, 'utf8');
  const uri = pathToFileURL(fichier).href;
  const lignes = texte.split('\n');
  const position = (motif, decalage = 0) => {
    const line = lignes.findIndex((l) => l.includes(motif));
    return { line, character: lignes[line].indexOf(motif) + decalage };
  };

  try {
    const init = await client.demander('initialize', { processId: process.pid, rootUri: pathToFileURL(racine).href, capabilities: {} });
    const c = init.result?.capabilities ?? {};
    const version = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8')).version;
    verifier('initialize : capacités et version', c.hoverProvider && c.definitionProvider && c.documentSymbolProvider && c.documentFormattingProvider && c.completionProvider && c.semanticTokensProvider && init.result?.serverInfo?.version === version, init.result?.serverInfo);
    client.notifier('initialized', {});

    client.notifier('textDocument/didOpen', { textDocument: { uri, languageId: 'humalis', version: 1, text: texte } });
    const diagnostics = await client.attendre((m) => m.method === 'textDocument/publishDiagnostics' && m.params.uri === uri);
    verifier('diagnostics : aucune erreur à l’ouverture', diagnostics.params.diagnostics.length === 0, diagnostics.params.diagnostics);

    const faute = texte.replace('    titre "Votre panier"', '    titre "Votre panier');
    client.notifier('textDocument/didChange', { textDocument: { uri, version: 2 }, contentChanges: [{ text: faute }] });
    const avecFaute = await client.attendre((m) => m.method === 'textDocument/publishDiagnostics' && m.params.uri === uri && m.params.diagnostics.length > 0);
    const d = avecFaute.params.diagnostics[0];
    verifier('diagnostics : guillemet manquant', /guillemet manquant/.test(d.message) && d.severity === 1, `${d.range.start.line + 1}:${d.range.start.character + 1} ${d.message}`);
    client.notifier('textDocument/didChange', { textDocument: { uri, version: 3 }, contentChanges: [{ text: texte }] });

    const survol = await client.demander('textDocument/hover', { textDocument: { uri }, position: position('bouton "Ajouter"', 2) });
    verifier('survol de « bouton »', /\*\*bouton\*\*/.test(survol.result?.contents?.value ?? ''), (survol.result?.contents?.value ?? '').split('\n')[0]);

    const enCours = texte.replace('    bouton "Commander"', '    bouton "Commander" ave');
    client.notifier('textDocument/didChange', { textDocument: { uri, version: 4 }, contentChanges: [{ text: enCours }] });
    const lignesEnCours = enCours.split('\n');
    const ligneAve = lignesEnCours.findIndex((l) => l.endsWith(' ave'));
    const completion = await client.demander('textDocument/completion', { textDocument: { uri }, position: { line: ligneAve, character: lignesEnCours[ligneAve].length } });
    const libelles = (completion.result?.items ?? []).map((i) => i.label);
    verifier('complétion après « ave »', libelles.includes('avec'), libelles.slice(0, 8));
    client.notifier('textDocument/didChange', { textDocument: { uri, version: 5 }, contentChanges: [{ text: texte }] });

    const definition = await client.demander('textDocument/definition', { textDocument: { uri }, position: position('à panier', 3) });
    verifier('déclaration de « panier »', definition.result?.range?.start?.line === 0, definition.result?.range);

    const symboles = await client.demander('textDocument/documentSymbol', { textDocument: { uri } });
    verifier('plan du fichier', (symboles.result ?? []).some((s) => s.name === 'boutique'), (symboles.result ?? []).map((s) => s.name));

    const semantique = await client.demander('textDocument/semanticTokens/full', { textDocument: { uri } });
    verifier('jetons sémantiques', (semantique.result?.data?.length ?? 0) > 0 && semantique.result.data.length % 5 === 0, `${semantique.result?.data?.length} nombres`);

    const desordre = texte.replace('    titre "Votre panier"', '    titre   "Votre panier"');
    client.notifier('textDocument/didChange', { textDocument: { uri, version: 6 }, contentChanges: [{ text: desordre }] });
    const forme = await client.demander('textDocument/formatting', { textDocument: { uri }, options: { tabSize: 4, insertSpaces: true } });
    verifier('mise en forme', forme.result?.length === 1 && forme.result[0].newText === texte, `${forme.result?.length ?? 0} modification(s)`);

    const arret = await client.demander('shutdown');
    verifier('arrêt (shutdown)', arret.result === null && arret.error === undefined, arret);
    client.notifier('exit');
    const code = await client.fin();
    verifier('sortie (exit) : code 0', code === 0, `code ${code}`);
  } catch (erreur) {
    console.error(erreur instanceof Error ? erreur.message : erreur);
    client.processus.kill();
    return 1;
  }

  for (const [nom, ok, detail] of verifications) console.log(`${ok ? 'ok   ' : 'RATÉ '} ${nom} — ${detail}`);
  const ratees = verifications.filter(([, ok]) => !ok).length;
  console.log(`\n${verifications.length - ratees} vérifications réussies sur ${verifications.length}, avec « ${commande ?? 'node dist/cli.js'} editeur --stdio ».`);
  return ratees === 0 ? 0 : 1;
}

process.exit(await essayer());
