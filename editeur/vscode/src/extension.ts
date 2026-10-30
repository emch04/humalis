import * as vscode from 'vscode';
import { formaterSource } from '../../../src/outils/formatage.js';
import { lireSurLeDisque, verifierAvec, versDiagnostics } from './diagnostics.js';
import { lireProjet, type Lecteur } from './langage/projet.js';
import { indexer } from './langage/portees.js';
import { survoler } from './langage/survol.js';
import { completerSource, type GenreProposition } from './langage/completion.js';
import { definir } from './langage/definition.js';
import { symbolesDuDocument, type GenreSymboleDocument, type SymboleDocument } from './langage/symboles.js';
import { encoderJetons, jetonsSemantiques, MODIFICATEURS_JETONS, TYPES_JETONS } from './langage/semantique.js';

const LANGAGE = 'humalis';
/** Court délai après la frappe : assez bref pour sembler instantané (< 0,5 s). */
const DELAI_MS = 250;

/** Un fichier du projet : le document ouvert dans l'éditeur s'il l'est (même pas enregistré), sinon le disque. */
const lire: Lecteur = (chemin) =>
  vscode.workspace.textDocuments.find((d) => d.uri.scheme === 'file' && d.uri.fsPath === chemin)?.getText() ??
  lireSurLeDisque(chemin);

const cheminDe = (document: vscode.TextDocument) => (document.uri.scheme === 'file' ? document.uri.fsPath : undefined);
const indexDe = (document: vscode.TextDocument) => indexer(lireProjet(document.getText(), cheminDe(document), lire));

/** Lignes et colonnes de `langage/` (à partir de 1) → VS Code (à partir de 0). */
const plage = (ligne: number, debut: number, fin: number) => new vscode.Range(ligne - 1, debut - 1, ligne - 1, fin - 1);

/** Une faute dans un fournisseur ne doit jamais casser l'éditeur : elle est notée, pas montrée. */
function sansPlanter<T>(nom: string, calcul: () => T): T | undefined {
  try {
    return calcul();
  } catch (erreur) {
    console.error(`Humalis (${nom}) : erreur interne, merci de la signaler :`, erreur);
    return undefined;
  }
}

const GENRES_COMPLETION: Record<GenreProposition, vscode.CompletionItemKind> = {
  motCle: vscode.CompletionItemKind.Keyword,
  variable: vscode.CompletionItemKind.Variable,
  page: vscode.CompletionItemKind.Module,
  composant: vscode.CompletionItemKind.Class,
  route: vscode.CompletionItemKind.Reference,
  element: vscode.CompletionItemKind.Field,
  valeur: vscode.CompletionItemKind.Value,
  donnee: vscode.CompletionItemKind.Struct,
  champ: vscode.CompletionItemKind.Property,
  evenement: vscode.CompletionItemKind.Event,
  parametre: vscode.CompletionItemKind.Variable,
};

const GENRES_SYMBOLE: Record<GenreSymboleDocument, vscode.SymbolKind> = {
  page: vscode.SymbolKind.Module,
  composant: vscode.SymbolKind.Class,
  composantReact: vscode.SymbolKind.Class,
  serveur: vscode.SymbolKind.Package,
  donnee: vscode.SymbolKind.Struct,
  champ: vscode.SymbolKind.Field,
  route: vscode.SymbolKind.Interface,
  variable: vscode.SymbolKind.Variable,
  parametre: vscode.SymbolKind.TypeParameter,
};

const LEGENDE = new vscode.SemanticTokensLegend([...TYPES_JETONS], [...MODIFICATEURS_JETONS]);

export function activate(contexte: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection(LANGAGE);
  const minuteries = new Map<string, ReturnType<typeof setTimeout>>();
  const verification = verifierAvec(lire);

  function verifier(document: vscode.TextDocument): void {
    if (document.languageId !== LANGAGE) return;
    const diagnostics = versDiagnostics(document.getText(), verification, cheminDe(document)).map((d) => {
      const indexLigne = Math.min(d.ligne - 1, document.lineCount - 1);
      const ligne = document.lineAt(Math.max(indexLigne, 0));
      const debut =
        d.colonne !== undefined
          ? Math.min(d.colonne - 1, ligne.text.length)
          : ligne.firstNonWhitespaceCharacterIndex;
      const plageErreur = new vscode.Range(ligne.lineNumber, debut, ligne.lineNumber, ligne.text.length);
      const diagnostic = new vscode.Diagnostic(
        plageErreur,
        d.message,
        d.gravite === 'erreur'
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.source = 'Humalis';
      return diagnostic;
    });
    collection.set(document.uri, diagnostics);
  }

  function planifier(document: vscode.TextDocument): void {
    if (document.languageId !== LANGAGE) return;
    const cle = document.uri.toString();
    const precedente = minuteries.get(cle);
    if (precedente) clearTimeout(precedente);
    minuteries.set(
      cle,
      setTimeout(() => {
        minuteries.delete(cle);
        verifier(document);
      }, DELAI_MS),
    );
  }

  const selecteur: vscode.DocumentSelector = { language: LANGAGE };

  contexte.subscriptions.push(
    collection,
    vscode.languages.registerDocumentFormattingEditProvider(selecteur, {
      provideDocumentFormattingEdits: (document) => sansPlanter('formatage', () => {
        const source = document.getText();
        const resultat = formaterSource(source);
        if (resultat === source) return [];
        return [vscode.TextEdit.replace(new vscode.Range(document.positionAt(0), document.positionAt(source.length)), resultat)];
      }) ?? [],
    }),
    vscode.workspace.onDidOpenTextDocument(verifier),
    vscode.workspace.onDidChangeTextDocument((e) => planifier(e.document)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      collection.delete(document.uri);
      const minuterie = minuteries.get(document.uri.toString());
      if (minuterie) clearTimeout(minuterie);
      minuteries.delete(document.uri.toString());
    }),
    { dispose: () => minuteries.forEach((m) => clearTimeout(m)) },

    vscode.languages.registerHoverProvider(selecteur, {
      provideHover: (document, position) =>
        sansPlanter('survol', () => {
          const s = survoler(indexDe(document), position.line + 1, position.character + 1);
          return s && new vscode.Hover(new vscode.MarkdownString(s.markdown), plage(s.plage.ligne, s.plage.colonne, s.plage.fin));
        }),
    }),

    vscode.languages.registerCompletionItemProvider(
      selecteur,
      {
        provideCompletionItems: (document, position) =>
          sansPlanter('complétion', () => {
            const { debut, propositions } = completerSource(
              document.getText(),
              position.line + 1,
              position.character + 1,
              cheminDe(document),
              lire,
            );
            const remplace = new vscode.Range(position.line, debut - 1, position.line, position.character);
            return propositions.map((p) => {
              const item = new vscode.CompletionItem(p.libelle, GENRES_COMPLETION[p.genre]);
              item.range = remplace;
              if (p.detail) item.detail = p.detail;
              if (p.documentation) item.documentation = new vscode.MarkdownString(p.documentation);
              if (p.filtre) item.filterText = p.filtre;
              const texte = p.insertion ?? p.libelle;
              item.insertText = p.extrait ? new vscode.SnippetString(texte) : texte;
              return item;
            });
          }),
      },
      '"',
      '.',
    ),

    vscode.languages.registerDefinitionProvider(selecteur, {
      provideDefinition: (document, position) =>
        sansPlanter('définition', () => {
          const lieu = definir(indexDe(document), position.line + 1, position.character + 1);
          if (!lieu) return undefined;
          const uri = lieu.fichier !== undefined ? vscode.Uri.file(lieu.fichier) : document.uri;
          return new vscode.Location(uri, plage(lieu.ligne, lieu.colonne, lieu.fin));
        }),
    }),

    vscode.languages.registerDocumentSymbolProvider(selecteur, {
      provideDocumentSymbols: (document) =>
        sansPlanter('symboles', () => {
          const vers = (s: SymboleDocument): vscode.DocumentSymbol => {
            const symbole = new vscode.DocumentSymbol(
              s.nom,
              '',
              GENRES_SYMBOLE[s.genre],
              new vscode.Range(s.debut - 1, 0, s.fin - 1, s.finColonne - 1),
              plage(s.selection.ligne, s.selection.colonne, s.selection.fin),
            );
            symbole.children = s.enfants.map(vers);
            return symbole;
          };
          return symbolesDuDocument(indexDe(document)).map(vers);
        }),
    }),

    vscode.languages.registerDocumentSemanticTokensProvider(
      selecteur,
      {
        provideDocumentSemanticTokens: (document) =>
          sansPlanter('coloration sémantique', () => new vscode.SemanticTokens(new Uint32Array(encoderJetons(jetonsSemantiques(indexDe(document)))))),
      },
      LEGENDE,
    ),
  );

  vscode.workspace.textDocuments.forEach(verifier);
}

export function deactivate(): void {}
