import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { ServeurLangage } from '../src/lsp/serveur.js';
import { dossierExemples, exemple } from './aide-langage.js';

interface Message {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string };
}

function demarrer(fichiers: Record<string, string> = {}) {
  const recus: Message[] = [];
  let code: number | undefined;
  const serveur = new ServeurLangage(
    (m) => recus.push(m as Message),
    (c) => fichiers[c],
    (c) => (code = c),
  );
  let id = 0;
  const demander = (method: string, params?: unknown) => {
    const n = ++id;
    serveur.recevoir({ jsonrpc: '2.0', id: n, method, params });
    return recus.find((m) => m.id === n && m.method === undefined)!;
  };
  const notifier = (method: string, params?: unknown) => serveur.recevoir({ jsonrpc: '2.0', method, params });
  return { recus, demander, notifier, code: () => code };
}

const URI = pathToFileURL(join(dossierExemples, 'boutique.humalis')).href;
const BOUTIQUE = exemple('boutique.humalis');
const ouvrir = (notifier: (m: string, p: unknown) => void, uri = URI, text = BOUTIQUE) =>
  notifier('textDocument/didOpen', { textDocument: { uri, languageId: 'humalis', version: 1, text } });

describe('ServeurLangage', () => {
  it('annonce le formatage et refuse un tampon invalide sans écriture', () => {
    const { demander, notifier } = demarrer();
    expect(demander('initialize', {}).result.capabilities.documentFormattingProvider).toBe(true);
    ouvrir(notifier, URI, 'page :\n');
    expect(demander('textDocument/formatting', { textDocument: { uri: URI }, options: {} }).result).toEqual([]);
  });
  it('répond à initialize avec ses capacités', () => {
    const { demander } = demarrer();
    const { result } = demander('initialize', { processId: null, rootUri: null, capabilities: {} });
    expect(result.capabilities).toMatchObject({
      textDocumentSync: 1,
      hoverProvider: true,
      definitionProvider: true,
      documentSymbolProvider: true,
      completionProvider: { triggerCharacters: ['"', '.'] },
      semanticTokensProvider: { full: true, legend: { tokenTypes: expect.arrayContaining(['variable']) } },
    });
    expect(result.serverInfo).toEqual({ name: 'humalis', version: '1.0.0' });
  });

  it('publie les diagnostics du compilateur à l’ouverture et à chaque modification', () => {
    const { recus, notifier } = demarrer();
    ouvrir(notifier);
    const premier = recus.find((m) => m.method === 'textDocument/publishDiagnostics')!;
    expect(premier.params).toEqual({ uri: URI, diagnostics: [] });
    notifier('textDocument/didChange', {
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ text: 'page "a" :\n    texte "Bonjour\n' }],
    });
    const second = recus.filter((m) => m.method === 'textDocument/publishDiagnostics')[1];
    expect(second.params.diagnostics).toEqual([
      {
        range: { start: { line: 1, character: 10 }, end: { line: 1, character: 18 } },
        severity: 1,
        source: 'Humalis',
        message: expect.stringContaining('guillemet manquant'),
      },
    ]);
    notifier('textDocument/didClose', { textDocument: { uri: URI } });
    expect(recus.filter((m) => m.method === 'textDocument/publishDiagnostics')[2].params.diagnostics).toEqual([]);
  });

  it('donne le survol, à partir de 0 comme le protocole', () => {
    const { demander, notifier } = demarrer();
    ouvrir(notifier);
    const { result } = demander('textDocument/hover', { textDocument: { uri: URI }, position: { line: 10, character: 9 } });
    expect(result.contents.kind).toBe('markdown');
    expect(result.contents.value).toContain('**bouton**');
    expect(result.range).toEqual({ start: { line: 10, character: 8 }, end: { line: 10, character: 14 } });
  });

  it('donne null pour un survol sans mot', () => {
    const { demander, notifier } = demarrer();
    ouvrir(notifier);
    expect(demander('textDocument/hover', { textDocument: { uri: URI }, position: { line: 1, character: 0 } }).result).toBeNull();
  });

  it('complète « ave » en « avec » sur une ligne d’élément', () => {
    const { demander, notifier } = demarrer();
    const texte = BOUTIQUE.replace('    bouton "Commander"', '    bouton "Commander" ave');
    ouvrir(notifier, URI, texte);
    const ligne = texte.split('\n').findIndex((l) => l.endsWith('ave'));
    const { result } = demander('textDocument/completion', {
      textDocument: { uri: URI },
      position: { line: ligne, character: texte.split('\n')[ligne].length },
    });
    const avec = result.items.find((i: any) => i.label === 'avec');
    expect(avec).toMatchObject({ kind: 14, textEdit: { newText: 'avec', range: { start: { line: ligne, character: texte.split('\n')[ligne].lastIndexOf('ave') } } } });
    expect(avec.documentation.value).toContain('**avec**');
  });

  it('donne les extraits au format du protocole', () => {
    const { demander, notifier } = demarrer();
    const texte = 'page "a" :\n    quand ';
    ouvrir(notifier, URI, texte);
    const { result } = demander('textDocument/completion', { textDocument: { uri: URI }, position: { line: 1, character: 10 } });
    expect(result.items[0]).toMatchObject({ insertTextFormat: 2, kind: 23, textEdit: { newText: 'l\'utilisateur clique sur "$1" :' } });
  });

  it('mène à la déclaration, même dans un autre fichier', () => {
    const { demander, notifier } = demarrer({ '/p/commun.humalis': 'variable panier = [] avec partagee\n' });
    const uri = pathToFileURL('/p/app.humalis').href;
    ouvrir(notifier, uri, 'utiliser fichier "./commun.humalis"\npage "a" :\n    texte panier\n');
    const { result } = demander('textDocument/definition', { textDocument: { uri }, position: { line: 2, character: 12 } });
    expect(result).toEqual({
      uri: pathToFileURL('/p/commun.humalis').href,
      range: { start: { line: 0, character: 9 }, end: { line: 0, character: 15 } },
    });
  });

  it('lit d’abord un fichier ouvert dans l’éditeur, avant le disque', () => {
    const { demander, notifier } = demarrer({ '/p/commun.humalis': 'variable panier = [] avec partagee\n' });
    ouvrir(notifier, pathToFileURL('/p/commun.humalis').href, '\n\nvariable panier = [] avec partagee\n');
    const uri = pathToFileURL('/p/app.humalis').href;
    ouvrir(notifier, uri, 'utiliser fichier "./commun.humalis"\npage "a" :\n    texte panier\n');
    const { result } = demander('textDocument/definition', { textDocument: { uri }, position: { line: 2, character: 12 } });
    expect(result.range.start.line).toBe(2);
  });

  it('donne les symboles du document et la coloration sémantique', () => {
    const { demander, notifier } = demarrer();
    ouvrir(notifier);
    const symboles = demander('textDocument/documentSymbol', { textDocument: { uri: URI } }).result;
    expect(symboles.map((s: any) => [s.name, s.kind])).toEqual([
      ['panier', 13],
      ['boutique', 2],
      ['panier', 2],
    ]);
    expect(symboles[1].range).toEqual({ start: { line: 2, character: 0 }, end: { line: 19, character: 31 } });
    const { result } = demander('textDocument/semanticTokens/full', { textDocument: { uri: URI } });
    expect(result.data.length % 5).toBe(0);
    expect(result.data.length).toBeGreaterThan(20);
  });

  it('refuse une méthode inconnue, et une demande sur un document fermé ne plante pas', () => {
    const { demander } = demarrer();
    expect(demander('textDocument/inconnue', {}).error?.code).toBe(-32601);
    expect(demander('textDocument/hover', { textDocument: { uri: URI }, position: { line: 0, character: 0 } }).result).toBeNull();
  });

  it('s’arrête proprement : shutdown puis exit', () => {
    const { demander, notifier, code } = demarrer();
    expect(demander('shutdown').result).toBeNull();
    notifier('exit');
    expect(code()).toBe(0);
  });

  it('exit sans shutdown sort avec le code 1, comme le veut le protocole', () => {
    const { notifier, code } = demarrer();
    notifier('exit');
    expect(code()).toBe(1);
  });
});
