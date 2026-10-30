/**
 * L'adaptateur VS Code (`src/extension.ts`), branché sur un faux module
 * « vscode » (tests/faux-vscode.ts, par l'alias de vitest.config.mts) :
 * les fournisseurs sont enregistrés, et convertissent bien les positions
 * (VS Code compte à partir de 0). L'essai dans un vrai VS Code reste
 * `npm run test:vscode`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { activate } from '../src/extension.js';
import { dossierExemples, exemple } from './aide-langage.js';

const faux = vscode as unknown as typeof import('./faux-vscode.js');
const chemin = join(dossierExemples, 'boutique.humalis');
const BOUTIQUE = exemple('boutique.humalis');
const ligneDe = (texte: string, motif: string) => texte.split('\n').findIndex((l) => l.includes(motif));

beforeAll(() => {
  faux.documentsOuverts.push(faux.fauxDocument(chemin, BOUTIQUE));
  activate({ subscriptions: [] } as never);
});

describe('l’extension dans VS Code (faux module)', () => {
  it('publie toujours les diagnostics à l’activation', () => {
    expect(faux.diagnosticsPublies.get(`file://${chemin}`)).toEqual([]);
  });

  it('enregistre survol, complétion (déclenchée par " et .), définition, symboles, coloration sémantique', () => {
    expect(Object.keys(faux.enregistres).sort()).toEqual(['completion', 'declencheurs', 'definition', 'formatage', 'legende', 'semantique', 'survol', 'symboles']);
    expect(faux.enregistres.declencheurs).toEqual(['"', '.']);
    expect(faux.enregistres.legende.tokenTypes).toContain('variable');
  });

  it('survole « bouton » à la bonne place', () => {
    const doc = faux.fauxDocument(chemin, BOUTIQUE);
    const ligne = ligneDe(BOUTIQUE, 'bouton "Ajouter"');
    const survol = faux.enregistres.survol.provideHover(doc, new faux.Position(ligne, 9));
    expect(survol.contents[0].value).toContain('**bouton**');
    expect(survol.range).toEqual(new faux.Range(ligne, 8, ligne, 14));
  });

  it('complète « ave » en « avec », et un extrait en SnippetString', () => {
    const texte = BOUTIQUE.replace('    bouton "Commander"', '    bouton "Commander" ave');
    const ligne = ligneDe(texte, '"Commander" ave');
    const longueur = texte.split('\n')[ligne].length;
    const items = faux.enregistres.completion.provideCompletionItems(faux.fauxDocument(chemin, texte), new faux.Position(ligne, longueur));
    const avec = items.find((i: { label: string }) => i.label === 'avec');
    expect(avec.range).toEqual(new faux.Range(ligne, longueur - 3, ligne, longueur));
    expect(avec.kind).toBe(faux.CompletionItemKind.Keyword);
    const quand = 'page "a" :\n    quand ';
    const [tournure] = faux.enregistres.completion.provideCompletionItems(faux.fauxDocument(chemin, quand), new faux.Position(1, 10));
    expect(tournure.insertText).toBeInstanceOf(faux.SnippetString);
  });

  it('mène de « panier » (F12) à sa déclaration, ligne 1', () => {
    const doc = faux.fauxDocument(chemin, BOUTIQUE);
    const ligne = ligneDe(BOUTIQUE, 'ajouter nom à panier');
    const lieu = faux.enregistres.definition.provideDefinition(doc, new faux.Position(ligne, BOUTIQUE.split('\n')[ligne].indexOf('panier') + 1));
    expect(lieu.uri.fsPath).toBe(chemin);
    expect(lieu.range).toEqual(new faux.Range(0, 9, 0, 15));
  });

  it('donne le plan du document et les jetons sémantiques', () => {
    const doc = faux.fauxDocument(chemin, BOUTIQUE);
    expect(faux.enregistres.symboles.provideDocumentSymbols(doc).map((s: { name: string }) => s.name)).toEqual(['panier', 'boutique', 'panier']);
    const jetons = faux.enregistres.semantique.provideDocumentSemanticTokens(doc);
    expect(jetons.data.length % 5).toBe(0);
    expect(jetons.data.length).toBeGreaterThan(0);
  });
});
