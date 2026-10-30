import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as path from 'node:path';

function attendre(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function diagnosticsApres(uri: vscode.Uri, attenteMax = 3000) {
  const debut = Date.now();
  while (Date.now() - debut < attenteMax) {
    const d = vscode.languages.getDiagnostics(uri);
    if (d.length > 0) return d;
    await attendre(50);
  }
  return vscode.languages.getDiagnostics(uri);
}

export async function run(): Promise<void> {
  const dossier = path.resolve(__dirname, '../../integration/essai');
  const uri = vscode.Uri.file(path.join(dossier, 'faute.humalis'));
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);
  assert.strictEqual(document.languageId, 'humalis');

  // Fichier de départ : un guillemet manquant à la ligne 2.
  const diagnostics = await diagnosticsApres(uri);
  assert.strictEqual(diagnostics.length, 1, 'une erreur attendue');
  assert.strictEqual(diagnostics[0].range.start.line, 1);
  assert.ok(diagnostics[0].message.includes('guillemet manquant'));
  assert.ok(!/^Ligne \d+/.test(diagnostics[0].message));

  // On corrige : le soulignement doit disparaître en moins d'une demi-seconde.
  const edition = new vscode.WorkspaceEdit();
  edition.replace(uri, document.lineAt(1).range, '    texte "Bonjour"');
  await vscode.workspace.applyEdit(edition);
  const debut = Date.now();
  while (vscode.languages.getDiagnostics(uri).length > 0 && Date.now() - debut < 3000) {
    await attendre(25);
  }
  assert.strictEqual(vscode.languages.getDiagnostics(uri).length, 0);
  assert.ok(Date.now() - debut < 500, `trop lent : ${Date.now() - debut} ms`);

  await outilsEditeur(path.resolve(__dirname, '../../../../exemples'));
}

/** Phase 3 : survol, complétion, définition, symboles, sur la boutique. */
async function outilsEditeur(dossierExemples: string): Promise<void> {
  const uri = vscode.Uri.file(path.join(dossierExemples, 'boutique.humalis'));
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);
  const position = (motif: string, decalage = 0) => {
    const ligne = document.getText().split('\n').findIndex((l) => l.includes(motif));
    return new vscode.Position(ligne, document.lineAt(ligne).text.indexOf(motif) + decalage);
  };

  // Survol de « bouton » : sa fiche de la table de vocabulaire.
  const survols = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', uri, position('bouton "Ajouter"', 2));
  const texte = survols.flatMap((h) => h.contents.map((c) => (typeof c === 'string' ? c : 'value' in c ? c.value : ''))).join('\n');
  assert.ok(texte.includes('**bouton**'), `survol inattendu : ${texte}`);

  // F12 sur « panier » : la déclaration, ligne 1.
  const lieux = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
    'vscode.executeDefinitionProvider',
    uri,
    position('à panier', 3),
  );
  const lieu = lieux[0];
  const plage = 'range' in lieu ? lieu.range : lieu.targetRange;
  assert.strictEqual(plage.start.line, 0);

  // « ave » puis Ctrl+Espace : « avec ».
  const edition = new vscode.WorkspaceEdit();
  const ligne = position('bouton "Commander"').line;
  edition.insert(uri, document.lineAt(ligne).range.end, ' ave');
  await vscode.workspace.applyEdit(edition);
  const liste = await vscode.commands.executeCommand<vscode.CompletionList>(
    'vscode.executeCompletionItemProvider',
    uri,
    document.lineAt(ligne).range.end,
  );
  const libelles = liste.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
  assert.ok(libelles.includes('avec'), `complétion inattendue : ${libelles.join(', ')}`);

  // Le plan du document.
  const symboles = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri);
  assert.deepStrictEqual(
    symboles.map((s) => s.name),
    ['panier', 'boutique', 'panier'],
  );
}
