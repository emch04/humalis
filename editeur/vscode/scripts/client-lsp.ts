/**
 * Un petit client du protocole LSP, pour essayer le vrai serveur dans un
 * vrai processus : il écrit sur son entrée standard et lit sa sortie,
 * exactement comme un éditeur.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { LecteurMessages, ecrireMessage } from '../src/lsp/protocole.js';

export interface MessageRecu {
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string };
}

export class ClientLsp {
  private readonly processus: ChildProcessWithoutNullStreams;
  private readonly lecteur = new LecteurMessages();
  readonly recus: MessageRecu[] = [];
  private attentes: (() => void)[] = [];
  private prochainId = 0;
  erreurs = '';

  /** `commande` et `args` : de quoi lancer le serveur (node dist/serveur-lsp.js --stdio). */
  constructor(commande: string, args: string[], dossier?: string) {
    this.processus = spawn(commande, args, { cwd: dossier, stdio: 'pipe' });
    this.processus.stdout.on('data', (morceau: Buffer) => {
      for (const m of this.lecteur.ajouter(morceau)) this.recus.push(m as MessageRecu);
      const attentes = this.attentes;
      this.attentes = [];
      attentes.forEach((f) => f());
    });
    this.processus.stderr.on('data', (morceau: Buffer) => (this.erreurs += morceau.toString()));
  }

  private envoyer(message: unknown): void {
    this.processus.stdin.write(ecrireMessage(message));
  }

  /** Attend un message qui vérifie `condition`, au plus `delai` ms. */
  attendre(condition: (m: MessageRecu) => boolean, delai = 10_000): Promise<MessageRecu> {
    return new Promise((resoudre, rejeter) => {
      const debut = Date.now();
      const essayer = () => {
        const trouve = this.recus.find(condition);
        if (trouve) return resoudre(trouve);
        if (Date.now() - debut > delai) return rejeter(new Error(`pas de réponse du serveur (stderr : ${this.erreurs})`));
        this.attentes.push(essayer);
        setTimeout(essayer, 50);
      };
      essayer();
    });
  }

  async demander(method: string, params?: unknown): Promise<MessageRecu> {
    const id = ++this.prochainId;
    this.envoyer({ jsonrpc: '2.0', id, method, params });
    return this.attendre((m) => m.id === id && m.method === undefined);
  }

  notifier(method: string, params?: unknown): void {
    this.envoyer({ jsonrpc: '2.0', method, params });
  }

  /** Attend la fin du processus ; renvoie son code de sortie. */
  fin(delai = 10_000): Promise<number | null> {
    return new Promise((resoudre, rejeter) => {
      if (this.processus.exitCode !== null) return resoudre(this.processus.exitCode);
      const minuterie = setTimeout(() => rejeter(new Error('le serveur ne s’arrête pas')), delai);
      this.processus.on('exit', (code) => {
        clearTimeout(minuterie);
        resoudre(code);
      });
    });
  }

  tuer(): void {
    if (this.processus.exitCode === null) this.processus.kill();
  }
}

/**
 * Le parcours d'un éditeur : initialize, didOpen (et diagnostics), hover,
 * completion, definition, documentSymbol, semanticTokens, shutdown, exit.
 * Renvoie la liste des vérifications, chacune réussie ou non.
 */
export async function parcours(client: ClientLsp, uri: string, texte: string): Promise<[string, boolean, string][]> {
  const verifications: [string, boolean, string][] = [];
  const verifier = (nom: string, ok: boolean, detail: unknown) =>
    verifications.push([nom, ok, typeof detail === 'string' ? detail : JSON.stringify(detail)]);
  const lignes = texte.split('\n');
  const position = (motif: string, decalage = 0) => {
    const line = lignes.findIndex((l) => l.includes(motif));
    return { line, character: lignes[line].indexOf(motif) + decalage };
  };

  const init = await client.demander('initialize', { processId: process.pid, rootUri: null, capabilities: {} });
  verifier('initialize : capacités', init.result?.capabilities?.hoverProvider === true && init.result?.capabilities?.definitionProvider === true, init.result?.serverInfo);
  client.notifier('initialized', {});

  client.notifier('textDocument/didOpen', { textDocument: { uri, languageId: 'humalis', version: 1, text: texte } });
  const diagnostics = await client.attendre((m) => m.method === 'textDocument/publishDiagnostics' && m.params.uri === uri);
  verifier('didOpen : publishDiagnostics (aucune erreur)', diagnostics.params.diagnostics.length === 0, diagnostics.params.diagnostics);

  const faute = texte.replace('    titre "Votre panier"', '    titre "Votre panier');
  client.notifier('textDocument/didChange', { textDocument: { uri, version: 2 }, contentChanges: [{ text: faute }] });
  const avecFaute = await client.attendre(
    (m) => m.method === 'textDocument/publishDiagnostics' && m.params.uri === uri && m.params.diagnostics.length > 0,
  );
  const d = avecFaute.params.diagnostics[0];
  verifier('didChange : publishDiagnostics (guillemet manquant)', /guillemet manquant/.test(d.message) && d.severity === 1, `${d.range.start.line + 1}:${d.range.start.character + 1} ${d.message}`);
  client.notifier('textDocument/didChange', { textDocument: { uri, version: 3 }, contentChanges: [{ text: texte }] });

  const survol = await client.demander('textDocument/hover', { textDocument: { uri }, position: position('bouton "Ajouter"', 2) });
  verifier('hover sur « bouton »', /\*\*bouton\*\*/.test(survol.result?.contents?.value ?? ''), (survol.result?.contents?.value ?? '').split('\n').slice(0, 3).join(' / '));

  const enCours = texte.replace('    bouton "Commander"', '    bouton "Commander" ave');
  client.notifier('textDocument/didChange', { textDocument: { uri, version: 4 }, contentChanges: [{ text: enCours }] });
  const lignesEnCours = enCours.split('\n');
  const ligneAve = lignesEnCours.findIndex((l) => l.endsWith(' ave'));
  const completion = await client.demander('textDocument/completion', {
    textDocument: { uri },
    position: { line: ligneAve, character: lignesEnCours[ligneAve].length },
  });
  const libelles = (completion.result?.items ?? []).map((i: { label: string }) => i.label);
  verifier('completion après « ave »', libelles.includes('avec'), libelles);
  client.notifier('textDocument/didChange', { textDocument: { uri, version: 5 }, contentChanges: [{ text: texte }] });

  const definition = await client.demander('textDocument/definition', { textDocument: { uri }, position: position('à panier', 3) });
  verifier('definition de « panier »', definition.result?.range?.start?.line === 0 && definition.result?.range?.start?.character === 9, definition.result);

  const symboles = await client.demander('textDocument/documentSymbol', { textDocument: { uri } });
  verifier('documentSymbol', (symboles.result ?? []).some((s: { name: string }) => s.name === 'boutique'), (symboles.result ?? []).map((s: { name: string }) => s.name));

  const semantique = await client.demander('textDocument/semanticTokens/full', { textDocument: { uri } });
  verifier('semanticTokens/full', (semantique.result?.data?.length ?? 0) > 0 && semantique.result.data.length % 5 === 0, `${semantique.result?.data?.length} nombres`);

  const arret = await client.demander('shutdown');
  verifier('shutdown', arret.result === null && arret.error === undefined, arret);
  client.notifier('exit');
  const code = await client.fin();
  verifier('exit : code 0', code === 0, `code ${code}`);
  return verifications;
}
