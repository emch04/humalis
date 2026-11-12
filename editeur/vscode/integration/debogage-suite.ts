/**
 * L'essai du débogueur dans un vrai VS Code : un point d'arrêt posé dans un
 * fichier .humalis doit être atteint, la pile doit nommer ce fichier et sa
 * ligne, les variables doivent se lire, et « pas à pas » doit mener à la
 * ligne Humalis suivante.
 *
 * HUMALIS_ESSAI_DEBOGAGE : les cibles à essayer (web,serveur,apple ; web et serveur par défaut).
 * HUMALIS_CLI : le compilateur (dist/cli.js du dépôt par défaut).
 */
import * as vscode from 'vscode';
import * as assert from 'node:assert';
import * as path from 'node:path';

const dossier = path.resolve(__dirname, '../../integration/debogage');
const cli = process.env.HUMALIS_CLI ?? path.resolve(__dirname, '../../../../dist/cli.js');
const attendre = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

interface Arret { session: vscode.DebugSession; threadId: number }

/** Les arrêts annoncés par les adaptateurs (événement DAP « stopped »). */
const arrets: Arret[] = [];
vscode.debug.registerDebugAdapterTrackerFactory('*', {
  createDebugAdapterTracker: (session) => ({
    onDidSendMessage: (message: { type?: string; event?: string; body?: { threadId?: number; reason?: string; output?: string } }) => {
      if (message.type === 'event' && message.event === 'stopped') arrets.push({ session, threadId: message.body?.threadId ?? 1 });
      // La sortie des programmes débogués, recopiée dans le journal de l'essai.
      if (message.type === 'event' && message.event === 'output') console.log(`[sortie ${session.type}] ${String((message.body as { output?: string } | undefined)?.output ?? '').trimEnd()}`);
    },
  }),
});

async function prochainArret(ms: number): Promise<Arret> {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const arret = arrets.shift();
    if (arret) return arret;
    await attendre(100);
  }
  throw new Error('aucun arrêt sur le point d’arrêt');
}

async function cadreDuHaut(arret: Arret): Promise<{ id: number; chemin: string; ligne: number }> {
  const pile = await arret.session.customRequest('stackTrace', { threadId: arret.threadId, startFrame: 0, levels: 20 });
  const cadre = (pile.stackFrames as { id: number; line: number; source?: { path?: string } }[]).find((c) => c.source?.path?.endsWith('.humalis'));
  assert.ok(cadre, `aucun cadre dans un fichier .humalis : ${JSON.stringify(pile.stackFrames.slice(0, 4).map((c: { name: string; source?: { path?: string }; line: number }) => [c.name, c.source?.path, c.line]))}`);
  return { id: cadre.id, chemin: cadre.source!.path!, ligne: cadre.line };
}

async function variables(arret: Arret, cadre: number): Promise<{ name: string; value: string }[]> {
  const { scopes } = await arret.session.customRequest('scopes', { frameId: cadre });
  const toutes: { name: string; value: string }[] = [];
  for (const portee of (scopes as { variablesReference: number; expensive?: boolean }[]).filter((p) => !p.expensive).slice(0, 3)) {
    const { variables: liste } = await arret.session.customRequest('variables', { variablesReference: portee.variablesReference });
    toutes.push(...liste);
  }
  return toutes;
}

async function essayer(cible: 'web' | 'serveur' | 'apple', fichier: string, ligne: number, config: Record<string, unknown>, declencher?: () => Promise<void>, nomsAttendus: string[] = []): Promise<void> {
  const uri = vscode.Uri.file(path.join(dossier, fichier));
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
  vscode.debug.removeBreakpoints(vscode.debug.breakpoints);
  vscode.debug.addBreakpoints([new vscode.SourceBreakpoint(new vscode.Location(uri, new vscode.Position(ligne - 1, 0)))]);
  arrets.length = 0;
  // Le site et le serveur passent la main à une séance du débogueur JavaScript : la séance « humalis » elle-même s'arrête tout de suite.
  void vscode.debug.startDebugging(vscode.workspace.workspaceFolders?.[0], { type: 'humalis', request: 'launch', name: `Essai ${cible}`, cible, programme: uri.fsPath, humalis: cli, ...config });
  if (declencher) await declencher();
  const arret = await prochainArret(cible === 'apple' ? 300_000 : 180_000);
  const haut = await cadreDuHaut(arret);
  console.log(`[${cible}] arrêt : ${path.basename(haut.chemin)}:${haut.ligne}`);
  assert.strictEqual(path.basename(haut.chemin), fichier);
  assert.strictEqual(haut.ligne, ligne);
  const vues = await variables(arret, haut.id);
  console.log(`[${cible}] variables : ${vues.slice(0, 12).map((v) => `${v.name} = ${v.value}`).join(' ; ')}`);
  // Les variables du code produit se montrent sous leur nom Humalis (carte de sources : names).
  for (const nom of nomsAttendus) assert.ok(vues.some((v) => v.name === nom), `la variable « ${nom} » devait se montrer sous ce nom (vu : ${vues.map((v) => v.name).join(', ')})`);
  // Pas à pas : la ligne Humalis suivante.
  await arret.session.customRequest('next', { threadId: arret.threadId });
  const suivant = await prochainArret(60_000);
  const apres = await cadreDuHaut(suivant);
  console.log(`[${cible}] après « pas à pas » : ${path.basename(apres.chemin)}:${apres.ligne}`);
  assert.ok(apres.ligne > ligne, `le pas à pas devait avancer (ligne ${apres.ligne})`);
  await vscode.debug.stopDebugging(arret.session);
  await attendre(1500);
  console.log(`[${cible}] point d’arrêt atteint ✓`);
}

export async function run(): Promise<void> {
  const cibles = (process.env.HUMALIS_ESSAI_DEBOGAGE ?? 'web,serveur').split(',');
  if (cibles.includes('web')) {
    // Le chargement de la page : « changer total par total + 30 », ligne 7.
    await essayer('web', 'site.humalis', 7, { port: 5190, runtimeArgs: ['--headless=new'] });
  }
  if (cibles.includes('serveur')) {
    const email = 'admin@essai.test';
    const motDePasse = 'Admin-Essai-2026!';
    await essayer('serveur', 'serveur.humalis', 8, { env: { PORT: '4891', HUMALIS_ADMIN_EMAIL: email, HUMALIS_ADMIN_MOT_DE_PASSE: motDePasse } }, async () => {
      // Le serveur démarre ; puis une vraie requête déclenche l'action « doubler ».
      const base = 'http://127.0.0.1:4891';
      let jeton = '';
      for (let i = 0; i < 600 && !jeton; i++) {
        try {
          const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: motDePasse }) });
          if (r.ok) jeton = ((await r.json()) as { data: { token: string } }).data.token;
        } catch { /* Pas encore prêt. */ }
        if (!jeton) await attendre(500);
      }
      assert.ok(jeton, 'connexion impossible au serveur débogué');
      const entetes = { 'content-type': 'application/json', authorization: `Bearer ${jeton}` };
      const cree = (await (await fetch(`${base}/api/commandes`, { method: 'POST', headers: entetes, body: JSON.stringify({ total: 21 }) })).json()) as { id?: string; data?: { id: string } };
      void fetch(`${base}/api/commandes/faire/doubler/${cree.id ?? cree.data?.id}`, { method: 'PATCH', headers: entetes, body: '{}' }).catch(() => {});
    }, ['commande']);
  }
  if (cibles.includes('apple')) {
    await essayer('apple', 'application.humalis', 6, process.env.HUMALIS_CONSTRUCTION_APPLE ? { constructionApple: process.env.HUMALIS_CONSTRUCTION_APPLE } : {});
  }
}
