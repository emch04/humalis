/**
 * Le serveur de langage Humalis (LSP), pour les éditeurs autres que VS Code
 * (plan `2026-10-29-outils-editeur.md`, D1). Il sert les mêmes réponses
 * que l'extension, au-dessus des mêmes fonctions pures (`../langage/`) et
 * des mêmes diagnostics (`../diagnostics.ts`).
 *
 * Positions du protocole : lignes et caractères à partir de 0, en unités
 * UTF-16 (le défaut du protocole, et celui des chaînes JavaScript).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import paquet from '../../package.json';
import { formaterSource } from '../../../../src/outils/formatage.js';
import { lireSurLeDisque, listerSurLeDisque, verifierAvec, versDiagnostics } from '../diagnostics.js';
import { lireProjet, type Lecteur } from '../langage/projet.js';
import { indexer, type Index } from '../langage/portees.js';
import { survoler } from '../langage/survol.js';
import { completerSource, type GenreProposition } from '../langage/completion.js';
import { definir, type Lieu } from '../langage/definition.js';
import { symbolesDuDocument, type GenreSymboleDocument, type SymboleDocument } from '../langage/symboles.js';
import { encoderJetons, jetonsSemantiques, MODIFICATEURS_JETONS, TYPES_JETONS } from '../langage/semantique.js';
import { markdownVersTexte } from './texte-brut.js';

interface Message {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: any;
}

interface PositionLsp {
  line: number;
  character: number;
}

const ERREUR_METHODE_INCONNUE = -32601;
const ERREUR_INTERNE = -32603;
const ERREUR_PARAMETRES = -32602;
const ERREUR_ARRET = -32600;

/** CompletionItemKind du protocole. */
const GENRES_COMPLETION: Record<GenreProposition, number> = {
  motCle: 14,
  variable: 6,
  page: 9,
  composant: 7,
  route: 18,
  element: 5,
  valeur: 12,
  donnee: 22,
  champ: 10,
  evenement: 23,
  parametre: 6,
};

/** SymbolKind du protocole. */
const GENRES_SYMBOLE: Record<GenreSymboleDocument, number> = {
  page: 2,
  composant: 5,
  composantReact: 5,
  serveur: 4,
  donnee: 23,
  champ: 8,
  route: 11,
  variable: 13,
  parametre: 26,
};

const cheminDe = (uri: string): string | undefined => {
  try {
    return uri.startsWith('file:') ? fileURLToPath(uri) : undefined;
  } catch {
    return undefined;
  }
};

const plage = (ligne: number, debut: number, fin: number) => ({
  start: { line: ligne - 1, character: debut - 1 },
  end: { line: ligne - 1, character: fin - 1 },
});

export class ServeurLangage {
  /** Les documents ouverts, en fins de ligne « \n » (les positions LSP ne comptent pas les fins de ligne). */
  private readonly documents = new Map<string, string>();
  /** Les documents écrits en fins de ligne Windows (« \r\n ») : la mise en forme les leur rend. */
  private readonly finsWindows = new Set<string>();
  /**
   * Ce que le client accepte, lu dans « initialize ». Seul un client qui le
   * dit (Visual Studio) reçoit du texte brut au survol et des symboles à plat ;
   * sans indication, Markdown et arbre de symboles.
   */
  private survolEnTexte = false;
  private symbolesAPlat = false;

  private garder(uri: string, texte: string): void {
    if (texte.includes('\r\n')) this.finsWindows.add(uri);
    else this.finsWindows.delete(uri);
    this.documents.set(uri, texte.replace(/\r\n?/g, '\n'));
  }
  private arretDemande = false;

  /**
   * `envoyer` : écrit un message vers l'éditeur ; `lireDisque` : lit un
   * fichier utilisé qui n'est pas ouvert ; `quitter` : termine le processus.
   */
  constructor(
    private readonly envoyer: (message: unknown) => void,
    private readonly lireDisque: Lecteur = lireSurLeDisque,
    private readonly quitter: (code: number) => void = (code) => process.exit(code),
  ) {}

  /** Un fichier du projet : celui de l'éditeur s'il est ouvert, sinon celui du disque. */
  private readonly lire: Lecteur = (chemin) => {
    for (const [uri, texte] of this.documents) if (cheminDe(uri) === chemin) return texte;
    return this.lireDisque(chemin);
  };

  recevoir(message: Message): void {
    const { id, method, params } = message;
    if (method === undefined) return; // une réponse de l'éditeur : rien n'est demandé de ce côté
    const demande = id !== undefined && id !== null;
    try {
      if (this.arretDemande && demande && method !== 'shutdown') {
        this.repondreErreur(id, ERREUR_ARRET, 'le serveur est en train de s’arrêter');
        return;
      }
      if (demande && method.startsWith('textDocument/')) {
        const recus = params as { textDocument?: { uri?: unknown }; position?: { line?: unknown; character?: unknown } } | null | undefined;
        if (!recus || typeof recus.textDocument?.uri !== 'string') {
          this.repondreErreur(id, ERREUR_PARAMETRES, 'paramètres invalides : il manque textDocument.uri');
          return;
        }
        // Une position qui n'est pas dans le document (ligne négative, au-delà de la fin) n'a rien à montrer.
        if (recus.position !== undefined) {
          const { line, character } = recus.position;
          const lignes = (this.documents.get(recus.textDocument.uri) ?? '').split('\n').length;
          if (!Number.isInteger(line) || !Number.isInteger(character) || (line as number) < 0 || (character as number) < 0 || (line as number) >= lignes) {
            this.envoyer({ jsonrpc: '2.0', id, result: null });
            return;
          }
        }
      }
      const resultat = this.traiter(method, params);
      if (demande) {
        if (resultat === INCONNUE) this.repondreErreur(id, ERREUR_METHODE_INCONNUE, `méthode inconnue : ${method}`);
        else this.envoyer({ jsonrpc: '2.0', id, result: resultat ?? null });
      }
    } catch (erreur) {
      const detail = erreur instanceof Error ? erreur.message : String(erreur);
      if (demande) this.repondreErreur(id, ERREUR_INTERNE, `erreur interne du serveur Humalis, merci de la signaler : ${detail}`);
    }
  }

  private repondreErreur(id: Message['id'], code: number, message: string): void {
    this.envoyer({ jsonrpc: '2.0', id, error: { code, message } });
  }

  private traiter(method: string, params: any): unknown {
    switch (method) {
      case 'initialize': {
        const capacites = params?.capabilities?.textDocument;
        const formats: unknown = capacites?.hover?.contentFormat;
        this.survolEnTexte = Array.isArray(formats) && formats.length > 0 && !formats.includes('markdown');
        this.symbolesAPlat = capacites?.documentSymbol !== undefined && capacites.documentSymbol.hierarchicalDocumentSymbolSupport !== true;
        return {
          capabilities: {
            textDocumentSync: 1,
            hoverProvider: true,
            definitionProvider: true,
            documentSymbolProvider: true,
            documentFormattingProvider: true,
            completionProvider: { triggerCharacters: ['"', '.'] },
            semanticTokensProvider: {
              legend: { tokenTypes: [...TYPES_JETONS], tokenModifiers: [...MODIFICATEURS_JETONS] },
              full: true,
            },
          },
          serverInfo: { name: 'humalis', version: paquet.version },
        };
      }
      case 'initialized':
      case '$/cancelRequest':
      case '$/setTrace':
      case 'workspace/didChangeConfiguration':
        return undefined;
      case 'shutdown':
        this.arretDemande = true;
        return null;
      case 'exit':
        this.quitter(this.arretDemande ? 0 : 1);
        return undefined;
      case 'textDocument/didOpen':
        this.garder(params.textDocument.uri, params.textDocument.text);
        this.publier(params.textDocument.uri);
        return undefined;
      case 'textDocument/didChange': {
        const changements = params.contentChanges as { text: string }[];
        if (changements.length > 0) this.garder(params.textDocument.uri, changements[changements.length - 1].text);
        this.publier(params.textDocument.uri);
        return undefined;
      }
      case 'textDocument/didSave':
        return undefined;
      case 'textDocument/didClose':
        this.documents.delete(params.textDocument.uri);
        this.finsWindows.delete(params.textDocument.uri);
        this.envoyer({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: params.textDocument.uri, diagnostics: [] } });
        return undefined;
      case 'textDocument/hover':
        return this.survol(params.textDocument.uri, params.position);
      case 'textDocument/formatting': {
        const source = this.documents.get(params.textDocument.uri);
        if (source === undefined) return [];
        try {
          const resultat = formaterSource(source);
          if (resultat === source) return [];
          const lignes = source.split('\n');
          const texte = this.finsWindows.has(params.textDocument.uri) ? resultat.replace(/\n/g, '\r\n') : resultat;
          return [{ range: { start: { line: 0, character: 0 }, end: { line: lignes.length - 1, character: lignes.at(-1)!.length } }, newText: texte }];
        } catch { return []; }
      }
      case 'textDocument/completion':
        return this.completion(params.textDocument.uri, params.position);
      case 'textDocument/definition':
        return this.definition(params.textDocument.uri, params.position);
      case 'textDocument/documentSymbol':
        return this.symboles(params.textDocument.uri);
      case 'textDocument/semanticTokens/full':
        return this.semantique(params.textDocument.uri);
      default:
        return INCONNUE;
    }
  }

  private index(uri: string): Index | undefined {
    const texte = this.documents.get(uri);
    return texte === undefined ? undefined : indexer(lireProjet(texte, cheminDe(uri), this.lire, [], listerSurLeDisque));
  }

  private publier(uri: string): void {
    const texte = this.documents.get(uri) ?? '';
    const lignes = texte.split('\n');
    const diagnostics = versDiagnostics(texte, verifierAvec(this.lire), cheminDe(uri)).map((d) => {
      const index = Math.max(0, Math.min(d.ligne - 1, lignes.length - 1));
      const ligne = lignes[index] ?? '';
      const debut = d.colonne !== undefined ? Math.min(d.colonne - 1, ligne.length) : ligne.length - ligne.trimStart().length;
      return {
        range: { start: { line: index, character: debut }, end: { line: index, character: ligne.length } },
        severity: d.gravite === 'erreur' ? 1 : 2,
        source: 'Humalis',
        message: d.message,
      };
    });
    this.envoyer({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri, diagnostics } });
  }

  private survol(uri: string, position: PositionLsp) {
    const index = this.index(uri);
    const s = index && survoler(index, position.line + 1, position.character + 1);
    if (!s) return null;
    const contents = this.survolEnTexte ? { kind: 'plaintext', value: markdownVersTexte(s.markdown) } : { kind: 'markdown', value: s.markdown };
    return { contents, range: plage(s.plage.ligne, s.plage.colonne, s.plage.fin) };
  }

  private completion(uri: string, position: PositionLsp) {
    const texte = this.documents.get(uri);
    if (texte === undefined) return null;
    const { debut, propositions } = completerSource(texte, position.line + 1, position.character + 1, cheminDe(uri), this.lire, listerSurLeDisque);
    const range = plage(position.line + 1, debut, position.character + 1);
    return {
      isIncomplete: false,
      items: propositions.map((p) => ({
        label: p.libelle,
        kind: GENRES_COMPLETION[p.genre],
        ...(p.detail ? { detail: p.detail } : {}),
        ...(p.documentation ? { documentation: { kind: 'markdown', value: p.documentation } } : {}),
        ...(p.filtre ? { filterText: p.filtre } : {}),
        insertTextFormat: p.extrait ? 2 : 1,
        textEdit: { range, newText: p.insertion ?? p.libelle },
      })),
    };
  }

  private lieu(uri: string, lieu: Lieu) {
    return {
      uri: lieu.fichier !== undefined ? pathToFileURL(lieu.fichier).href : uri,
      range: plage(lieu.ligne, lieu.colonne, lieu.fin),
    };
  }

  private definition(uri: string, position: PositionLsp) {
    const index = this.index(uri);
    const lieu = index && definir(index, position.line + 1, position.character + 1);
    return lieu ? this.lieu(uri, lieu) : null;
  }

  private symboles(uri: string) {
    const index = this.index(uri);
    if (!index) return null;
    const vers = (s: SymboleDocument): unknown => ({
      name: s.nom,
      kind: GENRES_SYMBOLE[s.genre],
      range: { start: { line: s.debut - 1, character: 0 }, end: { line: s.fin - 1, character: s.finColonne - 1 } },
      selectionRange: plage(s.selection.ligne, s.selection.colonne, s.selection.fin),
      children: s.enfants.map(vers),
    });
    if (!this.symbolesAPlat) return symbolesDuDocument(index).map(vers);
    // Liste à plat (SymbolInformation), chaque symbole avec le nom de son parent.
    const plats: unknown[] = [];
    const aplatir = (s: SymboleDocument, parent?: string): void => {
      plats.push({
        name: s.nom,
        kind: GENRES_SYMBOLE[s.genre],
        location: { uri, range: { start: { line: s.debut - 1, character: 0 }, end: { line: s.fin - 1, character: s.finColonne - 1 } } },
        ...(parent !== undefined ? { containerName: parent } : {}),
      });
      for (const e of s.enfants) aplatir(e, s.nom);
    };
    for (const s of symbolesDuDocument(index)) aplatir(s);
    return plats;
  }

  private semantique(uri: string) {
    const index = this.index(uri);
    return index ? { data: encoderJetons(jetonsSemantiques(index)) } : null;
  }
}

/** Marque une méthode que le serveur ne connaît pas. */
const INCONNUE = Symbol('méthode inconnue');
