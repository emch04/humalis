/**
 * Le débogueur de Humalis dans VS Code, par le protocole de débogage (DAP).
 *
 * Le compilateur relie le code produit aux lignes Humalis (cartes de
 * sources pour JavaScript, `#sourceLocation` pour Swift). Le débogueur pose
 * donc ses points d'arrêt directement dans les fichiers `.humalis`, avance pas
 * à pas d'une ligne Humalis à l'autre et montre les variables :
 *
 * - `cible: "web"` : le site du moteur, servi par `humalis developper`, ouvert
 *   dans Chrome (ou Edge) par le débogueur JavaScript de VS Code ;
 * - `cible: "serveur"` : le serveur produit, lancé dans Node par le même
 *   débogueur ;
 * - `cible: "apple"` : l'application Mac, construite par Xcode et lancée par
 *   lldb-dap (fourni avec Xcode), que l'extension démarre elle-même.
 *
 * Android (Kotlin) n'a pas de directive de ligne : Android Studio ne peut pas
 * poser de point d'arrêt dans un fichier `.humalis`. Windows (C#) a ses
 * directives `#line`, lues par Visual Studio sous Windows.
 */
import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

export const TYPE_HUMALIS = 'humalis';
/** Le type interne de l'application Apple : lldb-dap, lancé par l'extension. */
export const TYPE_APPLE = 'humalis-lldb';

export type Cible = 'web' | 'serveur' | 'apple';

export interface ConfigurationHumalis extends vscode.DebugConfiguration {
  cible?: Cible;
  /** Le fichier Humalis principal. */
  programme?: string;
  /** Le dossier du projet produit (par défaut .humalis/<cible> à côté du programme). */
  sortie?: string;
  /** Le port du site en développement (web). */
  port?: number;
  /** La commande du compilateur : un chemin vers humalis (ou vers cli.js), sinon celle du projet, sinon npx humalis. */
  humalis?: string;
  /** Les variables d'environnement du serveur. */
  env?: Record<string, string>;
  /** Le navigateur du site (web). */
  navigateur?: 'chrome' | 'edge';
  /** Apple : l'équipe de signature (DEVELOPMENT_TEAM). */
  equipe?: string;
  /** Apple : un script de construction à la place de xcodebuild (reçoit le projet, le schéma, le dossier dérivé, Debug). */
  constructionApple?: string;
}

/**
 * Une boîte du moteur (`signal`) montre sa valeur dans le panneau des
 * variables, au lieu de son fonctionnement interne. Exécuté dans la page par
 * le débogueur JavaScript (customDescriptionGenerator).
 */
export const DESCRIPTION_BOITE = `function (parDefaut) {
  try {
    if (this && typeof this === 'object' && 'x' in this && this.o instanceof Set && 'ver' in this) {
      const v = this.x;
      if (v === null || v === undefined) return 'rien';
      if (typeof v === 'boolean') return v ? 'vrai' : 'faux';
      if (typeof v === 'string') return JSON.stringify(v);
      if (typeof v === 'object') return JSON.stringify(v).slice(0, 300);
      return String(v);
    }
  } catch (e) {}
  return parDefaut;
}`;

/** Les fichiers produits qui ne viennent pas d'une ligne Humalis : le pas à pas les traverse sans s'y arrêter. */
export const FICHIERS_SAUTES_WEB = ['**/node_modules/**', '**/@vite/**', '**/src/humalis/**', '**/public/humalis/**', '<node_internals>/**'];
export const FICHIERS_SAUTES_SERVEUR = ['<node_internals>/**', '**/node_modules/**', '**/src/humalis/**', '**/dist/src/humalis/**'];

/** Ce qu'il faut lancer pour compiler : [commande, arguments de départ]. */
export function commandeHumalis(config: ConfigurationHumalis, dossierProjet: string): [string, string[]] {
  const demandee = config.humalis;
  if (demandee) return demandee.endsWith('.js') ? ['node', [demandee]] : [demandee, []];
  const locale = join(dossierProjet, 'node_modules', '.bin', process.platform === 'win32' ? 'humalis.cmd' : 'humalis');
  if (existsSync(locale)) return [locale, []];
  return [process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', 'humalis']];
}

/** Le dossier du projet produit pour une cible. */
export function sortieDe(config: ConfigurationHumalis, programme: string): string {
  const cible = config.cible ?? 'web';
  if (config.sortie) return isAbsolute(config.sortie) ? config.sortie : resolve(dirname(programme), config.sortie);
  return join(dirname(programme), '.humalis', cible);
}

/** La configuration du débogueur JavaScript pour le site (Chrome ou Edge). */
export function configurationWeb(config: ConfigurationHumalis, sortie: string, port: number): vscode.DebugConfiguration {
  return {
    type: config.navigateur === 'edge' ? 'msedge' : 'chrome',
    request: 'launch',
    name: config.name,
    url: `http://localhost:${port}/`,
    webRoot: sortie,
    sourceMaps: true,
    resolveSourceMapLocations: [`${sortie}/**`, '!**/node_modules/**'],
    skipFiles: FICHIERS_SAUTES_WEB,
    customDescriptionGenerator: DESCRIPTION_BOITE,
    ...(config.runtimeArgs ? { runtimeArgs: config.runtimeArgs } : {}),
  };
}

/** La configuration du débogueur JavaScript pour le serveur (Node). */
export function configurationServeur(config: ConfigurationHumalis, sortie: string): vscode.DebugConfiguration {
  // Des secrets d'un jour pour la séance : un serveur produit refuse de démarrer sans eux. Jamais écrits sur le disque.
  const env: Record<string, string> = {
    NODE_ENV: 'development',
    JWT_SECRET: randomBytes(32).toString('hex'),
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    ...(config.env ?? {}),
  };
  return {
    type: 'node',
    request: 'launch',
    name: config.name,
    program: join(sortie, 'dist', 'src', 'demarrer.js'),
    cwd: sortie,
    env,
    ...(existsSync(join(sortie, '.env')) ? { envFile: join(sortie, '.env') } : {}),
    sourceMaps: true,
    outFiles: [`${sortie}/dist/**/*.js`],
    resolveSourceMapLocations: [`${sortie}/**`, '!**/node_modules/**'],
    skipFiles: FICHIERS_SAUTES_SERVEUR,
    console: 'internalConsole',
    outputCapture: 'std',
  };
}

/** Le projet Xcode et l'application construite. */
export function applicationApple(sortie: string): { projet: string; schema: string } | undefined {
  const projet = existsSync(sortie) ? readdirSync(sortie).find((f) => f.endsWith('.xcodeproj')) : undefined;
  return projet ? { projet: join(sortie, projet), schema: basename(projet, '.xcodeproj') } : undefined;
}

export function configurationApple(config: ConfigurationHumalis, programme: string): vscode.DebugConfiguration {
  return {
    type: TYPE_APPLE,
    request: 'launch',
    name: config.name,
    program: programme,
    cwd: dirname(programme),
    stopOnEntry: false,
  };
}

// ─── L'exécution des étapes ───────────────────────────────────────────────

/** HUMALIS_JOURNAL_DEBOGAGE : la préparation recopiée dans la console de l'hôte des extensions (essais). */
const journal = process.env.HUMALIS_JOURNAL_DEBOGAGE ? (texte: string) => console.log(`[humalis débogage] ${texte.trimEnd()}`) : () => {};

class Etapes {
  constructor(private readonly canal: vscode.OutputChannel) {}

  private readonly sortie = {
    append: (texte: string) => { this.canal.append(texte); journal(texte); },
    appendLine: (texte: string) => { this.canal.appendLine(texte); journal(texte); },
  };

  executer(commande: string, args: string[], cwd: string, jeton?: vscode.CancellationToken): Promise<void> {
    this.sortie.appendLine(`$ ${[commande, ...args].join(' ')}`);
    return new Promise((ok, echec) => {
      const processus = spawn(commande, args, { cwd, shell: process.platform === 'win32', env: process.env });
      processus.stdout.on('data', (d: Buffer) => this.sortie.append(d.toString()));
      processus.stderr.on('data', (d: Buffer) => this.sortie.append(d.toString()));
      jeton?.onCancellationRequested(() => processus.kill());
      processus.on('error', (erreur) => echec(erreur));
      processus.on('close', (code) => (code === 0 ? ok() : echec(new Error(`« ${basename(commande)} ${args.slice(0, 2).join(' ')} » s'est arrêté (code ${code}). Le détail est dans la sortie « Humalis : débogage ».`))));
    });
  }

  lancer(commande: string, args: string[], cwd: string): ChildProcess {
    this.sortie.appendLine(`$ ${[commande, ...args].join(' ')}`);
    const processus = spawn(commande, args, { cwd, shell: process.platform === 'win32', env: process.env });
    processus.stdout?.on('data', (d: Buffer) => this.sortie.append(d.toString()));
    processus.stderr?.on('data', (d: Buffer) => this.sortie.append(d.toString()));
    return processus;
  }
}

async function attendreAdresse(adresse: string, ms: number, jeton?: vscode.CancellationToken): Promise<void> {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (jeton?.isCancellationRequested) throw new Error('annulé');
    try {
      const reponse = await fetch(adresse);
      if (reponse.status < 500) return;
    } catch {
      /* Pas encore prêt. */
    }
    await new Promise((ok) => setTimeout(ok, 300));
  }
  throw new Error(`le site de développement ne répond pas sur ${adresse}.`);
}

// ─── Le fournisseur des configurations ────────────────────────────────────

export class FournisseurHumalis implements vscode.DebugConfigurationProvider {
  /** Les serveurs de développement lancés pour une séance, arrêtés avec elle. */
  private readonly processus = new Map<string, ChildProcess>();

  constructor(private readonly sortie: vscode.OutputChannel) {}

  provideDebugConfigurations(): vscode.DebugConfiguration[] {
    return [
      { type: TYPE_HUMALIS, request: 'launch', name: 'Humalis : le site', cible: 'web', programme: '${file}' },
      { type: TYPE_HUMALIS, request: 'launch', name: 'Humalis : le serveur', cible: 'serveur', programme: '${file}' },
    ];
  }

  /** F5 sans launch.json, sur un fichier .humalis : le site. */
  resolveDebugConfiguration(_dossier: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration): vscode.DebugConfiguration | undefined {
    if (!config.type && !config.request && !config.name) {
      const editeur = vscode.window.activeTextEditor;
      if (editeur?.document.languageId !== 'humalis') {
        void vscode.window.showInformationMessage('Ouvrez un fichier .humalis pour le déboguer.');
        return undefined;
      }
      return { type: TYPE_HUMALIS, request: 'launch', name: 'Humalis : le site', cible: 'web', programme: editeur.document.uri.fsPath };
    }
    return config;
  }

  async resolveDebugConfigurationWithSubstitutedVariables(dossier: vscode.WorkspaceFolder | undefined, brute: vscode.DebugConfiguration, jeton?: vscode.CancellationToken): Promise<vscode.DebugConfiguration | undefined> {
    const config = brute as ConfigurationHumalis;
    const programme = config.programme ? (isAbsolute(config.programme) ? config.programme : resolve(dossier?.uri.fsPath ?? process.cwd(), config.programme)) : vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!programme || !programme.endsWith('.humalis') || !existsSync(programme)) {
      void vscode.window.showErrorMessage(`Humalis : le programme à déboguer est introuvable (${programme ?? 'aucun fichier'}). Indiquez « programme » dans la configuration.`);
      return undefined;
    }
    const cible: Cible = config.cible ?? 'web';
    const sortie = sortieDe(config, programme);
    const projet = dossier?.uri.fsPath ?? dirname(programme);
    const [commande, debut] = commandeHumalis(config, projet);
    const etapes = new Etapes(this.sortie);
    this.sortie.show(true);
    try {
      return await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Humalis : préparation (${cible})`, cancellable: true }, async (progres, annulation) => {
        const arret = jeton ?? annulation;
        if (cible === 'serveur') {
          progres.report({ message: 'compilation' });
          await etapes.executer(commande, [...debut, 'compile', programme, '--cible', 'serveur', '--sortie', sortie], dirname(programme), arret);
          if (!existsSync(join(sortie, 'node_modules'))) {
            progres.report({ message: 'installation des dépendances' });
            await etapes.executer(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], sortie, arret);
          }
          progres.report({ message: 'construction' });
          await etapes.executer(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], sortie, arret);
          return this.parLeDebogueurJavaScript(dossier, configurationServeur(config, sortie));
        }
        if (cible === 'apple') {
          progres.report({ message: 'compilation' });
          await etapes.executer(commande, [...debut, 'compile', programme, '--cible', 'apple', '--sortie', sortie, ...(config.equipe ? ['--equipe', config.equipe] : [])], dirname(programme), arret);
          const xcode = applicationApple(sortie);
          if (!xcode) throw new Error(`aucun projet Xcode dans ${sortie}.`);
          const derive = join(sortie, 'construction');
          progres.report({ message: 'construction avec Xcode' });
          if (config.constructionApple) await etapes.executer(config.constructionApple, [xcode.projet, xcode.schema, derive, 'Debug'], sortie, arret);
          else await etapes.executer('xcodebuild', ['build', '-project', xcode.projet, '-scheme', xcode.schema, '-configuration', 'Debug', '-destination', 'generic/platform=macOS', '-derivedDataPath', derive, ...(config.equipe ? [`DEVELOPMENT_TEAM=${config.equipe}`, 'CODE_SIGN_STYLE=Automatic'] : [])], sortie, arret);
          const produits = join(derive, 'Build', 'Products', 'Debug');
          const app = existsSync(produits) ? readdirSync(produits).find((f) => f.endsWith('.app')) : undefined;
          if (!app) throw new Error(`l'application n'a pas été construite (${produits}).`);
          return configurationApple(config, join(produits, app, 'Contents', 'MacOS', basename(app, '.app')));
        }
        // Le site : humalis developper (Vite), puis le navigateur.
        const port = config.port ?? 5180;
        progres.report({ message: 'compilation' });
        await etapes.executer(commande, [...debut, 'compile', programme, '--cible', 'web', '--sortie', sortie, '--diagnostics-port', String(port + 1)], dirname(programme), arret);
        if (!existsSync(join(sortie, 'node_modules', 'vite'))) {
          progres.report({ message: 'installation des dépendances' });
          await etapes.executer(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], sortie, arret);
        }
        progres.report({ message: 'démarrage du site de développement' });
        const cle = `${programme}:${port}`;
        this.processus.get(cle)?.kill();
        const developpeur = etapes.lancer(commande, [...debut, 'developper', programme, '--port', String(port)], dirname(programme));
        this.processus.set(cle, developpeur);
        await attendreAdresse(`http://localhost:${port}/`, 60_000, arret);
        return this.parLeDebogueurJavaScript(dossier, { ...configurationWeb(config, sortie, port), __humalisDeveloppement: cle });
      });
    } catch (erreur) {
      journal(`échec : ${(erreur as Error).message}`);
      void vscode.window.showErrorMessage(`Humalis : ${(erreur as Error).message}`);
      return undefined;
    }
  }

  /**
   * Le site et le serveur : une séance du débogueur JavaScript intégré, avec
   * sa propre préparation (VS Code ne la fait pas quand une configuration
   * change de type). La séance « humalis » s'arrête là : rendre undefined.
   */
  private async parLeDebogueurJavaScript(dossier: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration): Promise<undefined> {
    const lancee = await vscode.debug.startDebugging(dossier, config);
    if (!lancee) throw new Error(`le débogueur JavaScript n'a pas démarré (${config.type}).`);
    return undefined;
  }

  /** La séance finie : son site de développement s'arrête. */
  terminer(session: vscode.DebugSession): void {
    const cle = session.configuration.__humalisDeveloppement as string | undefined;
    if (!cle) return;
    this.processus.get(cle)?.kill();
    this.processus.delete(cle);
  }

  arreterTout(): void {
    for (const processus of this.processus.values()) processus.kill();
    this.processus.clear();
  }
}

/** lldb-dap, fourni avec Xcode : l'extension le lance elle-même, sans autre extension. */
export class AdaptateurApple implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    if (process.platform !== 'darwin') {
      void vscode.window.showErrorMessage('Humalis : déboguer une application Apple demande un Mac avec Xcode.');
      return undefined;
    }
    return new vscode.DebugAdapterExecutable('xcrun', ['lldb-dap']);
  }
}

export function activerDebogage(contexte: vscode.ExtensionContext): FournisseurHumalis {
  const sortie = vscode.window.createOutputChannel('Humalis : débogage');
  const fournisseur = new FournisseurHumalis(sortie);
  contexte.subscriptions.push(
    sortie,
    vscode.debug.registerDebugConfigurationProvider(TYPE_HUMALIS, fournisseur),
    // Dans la liste « Exécuter et déboguer », sans launch.json : seulement les propositions (la préparation reste au fournisseur ci-dessus).
    vscode.debug.registerDebugConfigurationProvider(TYPE_HUMALIS, { provideDebugConfigurations: () => fournisseur.provideDebugConfigurations() }, vscode.DebugConfigurationProviderTriggerKind.Dynamic),
    vscode.debug.registerDebugAdapterDescriptorFactory(TYPE_APPLE, new AdaptateurApple()),
    vscode.debug.onDidTerminateDebugSession((session) => fournisseur.terminer(session)),
    { dispose: () => fournisseur.arreterTout() },
    vscode.commands.registerCommand('humalis.deboguer', async () => {
      const document = vscode.window.activeTextEditor?.document;
      if (document?.languageId !== 'humalis') {
        void vscode.window.showInformationMessage('Ouvrez un fichier .humalis pour le déboguer.');
        return;
      }
      const choix = await vscode.window.showQuickPick(
        [
          { label: 'Le site', description: 'humalis developper, dans Chrome', cible: 'web' as const },
          { label: 'Le serveur', description: 'Node', cible: 'serveur' as const },
          ...(process.platform === 'darwin' ? [{ label: "L'application Mac", description: 'Xcode et lldb', cible: 'apple' as const }] : []),
        ],
        { placeHolder: 'Que déboguer ?' },
      );
      if (!choix) return;
      await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(document.uri), { type: TYPE_HUMALIS, request: 'launch', name: `Humalis : ${choix.label.toLowerCase()}`, cible: choix.cible, programme: document.uri.fsPath });
    }),
  );
  return fournisseur;
}
