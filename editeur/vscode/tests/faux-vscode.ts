/**
 * Un faux module « vscode », juste ce qu'utilise `src/extension.ts`, pour
 * vérifier l'adaptateur sans VS Code (qui ne peut pas être téléchargé
 * partout). Il ne remplace pas l'essai dans un vrai VS Code
 * (`npm run test:vscode`).
 */
export class Position {
  constructor(
    public line: number,
    public character: number,
  ) {}
}

export class Range {
  start: Position;
  end: Position;
  constructor(l1: number | Position, c1: number | Position, l2?: number, c2?: number) {
    this.start = l1 instanceof Position ? l1 : new Position(l1, c1 as number);
    this.end = c1 instanceof Position ? c1 : new Position(l2!, c2!);
  }
}

export const TextEdit = { replace: (range: Range, newText: string) => ({ range, newText }) };

export class MarkdownString {
  constructor(public value: string) {}
}

export class SnippetString {
  constructor(public value: string) {}
}

export class Hover {
  contents: MarkdownString[];
  constructor(
    contenu: MarkdownString,
    public range?: Range,
  ) {
    this.contents = [contenu];
  }
}

export class CompletionItem {
  range?: Range;
  detail?: string;
  documentation?: MarkdownString;
  filterText?: string;
  insertText?: string | SnippetString;
  constructor(
    public label: string,
    public kind?: number,
  ) {}
}

export class Location {
  constructor(
    public uri: Uri,
    public range: Range,
  ) {}
}

export class Uri {
  constructor(
    public scheme: string,
    public fsPath: string,
  ) {}
  static file(chemin: string): Uri {
    return new Uri('file', chemin);
  }
  toString(): string {
    return `${this.scheme}://${this.fsPath}`;
  }
}

export class DocumentSymbol {
  children: DocumentSymbol[] = [];
  constructor(
    public name: string,
    public detail: string,
    public kind: number,
    public range: Range,
    public selectionRange: Range,
  ) {}
}

export class SemanticTokens {
  constructor(public data: Uint32Array) {}
}

export class SemanticTokensLegend {
  constructor(
    public tokenTypes: string[],
    public tokenModifiers: string[],
  ) {}
}

export class Diagnostic {
  source?: string;
  constructor(
    public range: Range,
    public message: string,
    public severity: number,
  ) {}
}

export const DiagnosticSeverity = { Error: 0, Warning: 1 };
export const CompletionItemKind = {
  Keyword: 13, Variable: 5, Module: 8, Class: 6, Reference: 17, Field: 4, Value: 11, Struct: 21, Property: 9, Event: 22,
};
export const SymbolKind = {
  Module: 1, Class: 4, Package: 3, Struct: 22, Field: 7, Interface: 10, Variable: 12, TypeParameter: 25,
};

/** Ce que l'extension a enregistré, pour que le test l'appelle. */
export const enregistres: Record<string, any> = {};
export const diagnosticsPublies = new Map<string, Diagnostic[]>();
export const documentsOuverts: any[] = [];

const jetable = { dispose: () => {} };

export const languages = {
  createDiagnosticCollection: () => ({
    set: (uri: Uri, d: Diagnostic[]) => diagnosticsPublies.set(uri.toString(), d),
    delete: (uri: Uri) => diagnosticsPublies.delete(uri.toString()),
    dispose: () => {},
  }),
  registerHoverProvider: (_s: unknown, f: unknown) => ((enregistres.survol = f), jetable),
  registerDocumentFormattingEditProvider: (_s: unknown, f: unknown) => ((enregistres.formatage = f), jetable),
  registerCompletionItemProvider: (_s: unknown, f: unknown, ...declencheurs: string[]) => (
    (enregistres.completion = f), (enregistres.declencheurs = declencheurs), jetable
  ),
  registerDefinitionProvider: (_s: unknown, f: unknown) => ((enregistres.definition = f), jetable),
  registerDocumentSymbolProvider: (_s: unknown, f: unknown) => ((enregistres.symboles = f), jetable),
  registerDocumentSemanticTokensProvider: (_s: unknown, f: unknown, legende: unknown) => (
    (enregistres.semantique = f), (enregistres.legende = legende), jetable
  ),
};

export const workspace = {
  textDocuments: documentsOuverts,
  onDidOpenTextDocument: () => jetable,
  onDidChangeTextDocument: () => jetable,
  onDidCloseTextDocument: () => jetable,
};

/** Un document comme VS Code en donne. */
export function fauxDocument(chemin: string, texte: string) {
  const lignes = texte.split('\n');
  return {
    languageId: 'humalis',
    uri: Uri.file(chemin),
    getText: () => texte,
    lineCount: lignes.length,
    lineAt: (i: number) => ({
      text: lignes[i],
      lineNumber: i,
      firstNonWhitespaceCharacterIndex: lignes[i].length - lignes[i].trimStart().length,
      range: new Range(i, 0, i, lignes[i].length),
    }),
  };
}

// ─── Le débogage (src/debogage.ts) ──────────────────────────────────────

export const debogage: { fournisseurs: { type: string; fournisseur: any; declencheur?: number }[]; adaptateurs: Record<string, any>; commandes: Record<string, (...args: any[]) => unknown>; lances: any[] } = { fournisseurs: [], adaptateurs: {}, commandes: {}, lances: [] };

export const DebugConfigurationProviderTriggerKind = { Initial: 1, Dynamic: 2 };
export const ProgressLocation = { Notification: 15 };

export class DebugAdapterExecutable {
  constructor(
    public command: string,
    public args: string[] = [],
  ) {}
}

export const window = {
  activeTextEditor: undefined as any,
  messages: [] as string[],
  createOutputChannel: () => ({ append() {}, appendLine() {}, show() {}, dispose() {} }),
  showErrorMessage: (message: string) => { window.messages.push(message); return Promise.resolve(undefined); },
  showInformationMessage: (message: string) => { window.messages.push(message); return Promise.resolve(undefined); },
  showQuickPick: () => Promise.resolve(undefined),
  withProgress: (_options: unknown, travail: (progres: { report(): void }, jeton: { isCancellationRequested: boolean; onCancellationRequested(): void }) => unknown) => travail({ report() {} }, { isCancellationRequested: false, onCancellationRequested() {} }),
};

export const debug = {
  registerDebugConfigurationProvider: (type: string, fournisseur: unknown, declencheur?: number) => {
    debogage.fournisseurs.push({ type, fournisseur, ...(declencheur !== undefined ? { declencheur } : {}) });
    return { dispose() {} };
  },
  registerDebugAdapterDescriptorFactory: (type: string, fabrique: unknown) => {
    debogage.adaptateurs[type] = fabrique;
    return { dispose() {} };
  },
  onDidTerminateDebugSession: () => ({ dispose() {} }),
  startDebugging: (_dossier: unknown, config: unknown) => {
    debogage.lances.push(config);
    return Promise.resolve(true);
  },
};

export const commands = {
  registerCommand: (nom: string, action: (...args: any[]) => unknown) => {
    debogage.commandes[nom] = action;
    return { dispose() {} };
  },
};

export const extensions = { getExtension: () => undefined };
