/**
 * Le débogueur (src/debogage.ts), branché sur le faux module « vscode » :
 * les configurations produites pour le site, le serveur et l'application Mac,
 * et ce que l'extension déclare à VS Code. Le vrai point d'arrêt atteint dans
 * VS Code est vérifié par `npm run test:debogage`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import {
  activerDebogage,
  AdaptateurApple,
  commandeHumalis,
  configurationApple,
  configurationServeur,
  configurationWeb,
  DESCRIPTION_BOITE,
  FICHIERS_SAUTES_SERVEUR,
  FICHIERS_SAUTES_WEB,
  FournisseurHumalis,
  sortieDe,
  TYPE_APPLE,
  TYPE_HUMALIS,
} from '../src/debogage.js';

const faux = vscode as unknown as typeof import('./faux-vscode.js');
const paquet = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

beforeAll(() => {
  activerDebogage({ subscriptions: [] } as never);
});

describe('le débogueur Humalis', () => {
  it('se déclare à VS Code : points d’arrêt dans les fichiers .humalis, le type « humalis », lldb pour Apple', () => {
    expect(paquet.version).toBe('1.4.0');
    expect(paquet.contributes.breakpoints).toEqual([{ language: 'humalis' }]);
    expect(paquet.contributes.debuggers.map((d: { type: string }) => d.type)).toEqual([TYPE_HUMALIS, TYPE_APPLE]);
    const humalis = paquet.contributes.debuggers[0];
    expect(humalis.configurationAttributes.launch.properties.cible.enum).toEqual(['web', 'serveur', 'apple']);
    expect(paquet.contributes.commands.map((c: { command: string }) => c.command)).toContain('humalis.deboguer');
  });

  it('enregistre le fournisseur (au départ et dans la liste), l’adaptateur lldb et la commande', () => {
    expect(faux.debogage.fournisseurs.map((f) => [f.type, f.declencheur ?? 1])).toEqual([[TYPE_HUMALIS, 1], [TYPE_HUMALIS, 2]]);
    expect(Object.keys(faux.debogage.adaptateurs)).toEqual([TYPE_APPLE]);
    expect(Object.keys(faux.debogage.commandes)).toEqual(['humalis.deboguer']);
  });

  it('propose le site et le serveur dans launch.json', () => {
    const fournisseur = new FournisseurHumalis(faux.window.createOutputChannel() as never);
    expect(fournisseur.provideDebugConfigurations().map((c) => c.cible)).toEqual(['web', 'serveur']);
  });

  it('F5 sans launch.json : le site du fichier .humalis ouvert ; ailleurs, rien', () => {
    const fournisseur = new FournisseurHumalis(faux.window.createOutputChannel() as never);
    faux.window.activeTextEditor = { document: { languageId: 'humalis', uri: { fsPath: '/projet/boutique.humalis' } } };
    expect(fournisseur.resolveDebugConfiguration(undefined, {} as never)).toMatchObject({ type: 'humalis', cible: 'web', programme: '/projet/boutique.humalis' });
    faux.window.activeTextEditor = { document: { languageId: 'javascript', uri: { fsPath: '/projet/a.js' } } };
    expect(fournisseur.resolveDebugConfiguration(undefined, {} as never)).toBeUndefined();
    faux.window.activeTextEditor = undefined;
  });

  it('refuse un programme introuvable, avec un message clair', async () => {
    const fournisseur = new FournisseurHumalis(faux.window.createOutputChannel() as never);
    const resultat = await fournisseur.resolveDebugConfigurationWithSubstitutedVariables(undefined, { type: 'humalis', request: 'launch', name: 'x', programme: '/nulle/part/absent.humalis' });
    expect(resultat).toBeUndefined();
    expect(faux.window.messages.at(-1)).toContain('introuvable');
  });

  it('range le projet produit dans .humalis/<cible>, ou dans « sortie »', () => {
    expect(sortieDe({ type: 'humalis', request: 'launch', name: 'x', cible: 'serveur' }, '/p/boutique.humalis')).toBe(join('/p', '.humalis', 'serveur'));
    expect(sortieDe({ type: 'humalis', request: 'launch', name: 'x', sortie: 'produit' }, '/p/boutique.humalis')).toBe(join('/p', 'produit'));
  });

  it('trouve le compilateur : celui donné, puis celui du projet, puis npx humalis', () => {
    expect(commandeHumalis({ type: 'humalis', request: 'launch', name: 'x', humalis: '/d/cli.js' }, '/p')).toEqual(['node', ['/d/cli.js']]);
    expect(commandeHumalis({ type: 'humalis', request: 'launch', name: 'x', humalis: '/usr/local/bin/humalis' }, '/p')).toEqual(['/usr/local/bin/humalis', []]);
    expect(commandeHumalis({ type: 'humalis', request: 'launch', name: 'x' }, '/nulle/part')[1]).toEqual(['--yes', 'humalis']);
  });

  it('le site : Chrome (ou Edge) sur humalis developper, cartes de sources, sans s’arrêter dans le moteur', () => {
    const c = configurationWeb({ type: 'humalis', request: 'launch', name: 'Site' }, '/p/.humalis/web', 5180);
    expect(c).toMatchObject({ type: 'chrome', request: 'launch', url: 'http://localhost:5180/', webRoot: '/p/.humalis/web', sourceMaps: true });
    expect(c.skipFiles).toEqual(FICHIERS_SAUTES_WEB);
    expect(FICHIERS_SAUTES_WEB).toContain('**/src/humalis/**');
    expect(configurationWeb({ type: 'humalis', request: 'launch', name: 'Site', navigateur: 'edge' }, '/w', 1).type).toBe('msedge');
  });

  it('le serveur : Node sur dist/src/demarrer.js, des secrets d’un jour, les variables données en plus', () => {
    const c = configurationServeur({ type: 'humalis', request: 'launch', name: 'Serveur', env: { PORT: '4000' } }, '/p/.humalis/serveur');
    expect(c).toMatchObject({ type: 'node', program: join('/p/.humalis/serveur', 'dist', 'src', 'demarrer.js'), cwd: '/p/.humalis/serveur', sourceMaps: true });
    expect(c.env.PORT).toBe('4000');
    expect(c.env.NODE_ENV).toBe('development');
    expect(c.env.JWT_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(configurationServeur({ type: 'humalis', request: 'launch', name: 'S' }, '/s').env.JWT_SECRET).not.toBe(c.env.JWT_SECRET);
    expect(c.skipFiles).toEqual(FICHIERS_SAUTES_SERVEUR);
  });

  it('l’application Mac : lldb-dap de Xcode, lancé par l’extension', () => {
    expect(configurationApple({ type: 'humalis', request: 'launch', name: 'Mac' }, '/b/App.app/Contents/MacOS/App')).toMatchObject({ type: TYPE_APPLE, program: '/b/App.app/Contents/MacOS/App' });
    const adaptateur = new AdaptateurApple().createDebugAdapterDescriptor() as { command: string; args: string[] } | undefined;
    if (process.platform === 'darwin') expect(adaptateur).toMatchObject({ command: 'xcrun', args: ['lldb-dap'] });
    else expect(adaptateur).toBeUndefined();
  });

  it('une boîte du moteur se montre par sa valeur dans le panneau des variables', () => {
    // eslint-disable-next-line no-new-func
    const decrire = new Function(`return (${DESCRIPTION_BOITE})`)() as (this: unknown, parDefaut: string) => string;
    const boite = { x: [1, 2], o: new Set(), ver: 3 };
    expect(decrire.call(boite, 'Boite')).toBe('[1,2]');
    expect(decrire.call({ x: null, o: new Set(), ver: 0 }, 'Boite')).toBe('rien');
    expect(decrire.call({ x: true, o: new Set(), ver: 0 }, 'Boite')).toBe('vrai');
    expect(decrire.call({ autre: 1 }, 'Objet')).toBe('Objet');
  });
});
