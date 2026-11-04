import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { programme } from './analyse/aide.js';

// Une requête d'abord : le changement arrive après un « await », là où React ne l'écrit pas tout de suite.
const SOURCE = programme(
  'serveur "s" :',
  '>donnee message :',
  '>>nom : texte',
  '>route "messages" :',
  '>>tout le monde peut creer message',
  '>>seul admin peut lire message',
  '>>seul admin peut modifier message',
  '',
  'page "accueil" :',
  '>titre "Accueil"',
  '>variable panier = ["Maillot"] avec memorisee',
  '>texte "Articles : {nombre de panier}"',
  '>bouton "Commander"',
  '>quand l\'utilisateur clique sur "Commander" :',
  '>>envoyer requete vers "messages" avec nom = "Awa"',
  '>>changer panier par []',
  '>>rediriger vers "https://wa.me/243000"',
);

const application = () => {
  const { application, diagnostics } = compiler(SOURCE);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};

function ecrire(dossier: string, fichiers: Map<string, string>): void {
  rmSync(join(dossier, 'src'), { recursive: true, force: true });
  rmSync(join(dossier, 'dist'), { recursive: true, force: true });
  for (const [chemin, contenu] of fichiers) {
    mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
}

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/** Un petit serveur de fichiers : une adresse inconnue rend la page d'entrée, comme un site publié. */
function servir(racine: string): Promise<Server> {
  const serveur = createServer((req, res) => {
    const chemin = join(racine, (req.url ?? '/').split('?')[0]);
    const fichier = existsSync(chemin) && statSync(chemin).isFile() ? chemin : join(racine, 'index.html');
    res.setHeader('content-type', TYPES[extname(fichier)] ?? 'application/octet-stream');
    createReadStream(fichier).pipe(res);
  });
  return new Promise((pret) => serveur.listen(0, '127.0.0.1', () => pret(serveur)));
}

describe('une variable memorisee, changée juste avant de quitter le site (Chromium)', () => {
  const dossier = join(tmpdir(), 'humalis-memoire-redirection');
  const statique = join(dossier, 'statique');
  let navigateur: { newPage(): Promise<any>; close(): Promise<void> } | undefined;
  const serveurs: Server[] = [];
  const adresses: Record<string, string> = {};

  beforeAll(async () => {
    const app = application();
    ecrire(dossier, genererProjetWeb(app, { nom: 'e', source: 'e.humalis', adresse: 'https://e.cd' }));
    if (!existsSync(join(dossier, 'node_modules', 'vite'))) execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'pipe' });
    execFileSync('npx', ['vite', 'build'], { cwd: dossier, stdio: 'pipe' });
    rmSync(statique, { recursive: true, force: true });
    for (const [chemin, contenu] of genererProjetStatique(app, { nom: 'e', source: 'e.humalis' })) {
      mkdirSync(dirname(join(statique, chemin)), { recursive: true });
      writeFileSync(join(statique, chemin), contenu);
    }
    const { chromium } = createRequire(join(dossier, 'package.json'))('playwright');
    navigateur = await chromium.launch();
    for (const [nom, racine] of [['web', join(dossier, 'dist')], ['statique', statique]]) {
      const serveur = await servir(racine);
      serveurs.push(serveur);
      adresses[nom] = `http://127.0.0.1:${(serveur.address() as { port: number }).port}/`;
    }
  }, 300_000);

  afterAll(async () => {
    await navigateur?.close();
    for (const serveur of serveurs) serveur.close();
  });

  it.each(['web', 'statique'])('%s : la valeur est gardée, et se relit au retour', async (cible) => {
    const page = await navigateur!.newPage();
    await page.route('**/api/messages', (route: { fulfill(o: object): unknown }) => route.fulfill({ status: 201, contentType: 'application/json', body: '{"id":"1","nom":"Awa"}' }));
    await page.route('**/auth/me', (route: { fulfill(o: object): unknown }) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
    await page.route('https://wa.me/**', (route: { fulfill(o: object): unknown }) => route.fulfill({ status: 200, contentType: 'text/html', body: 'WhatsApp' }));
    // Un téléphone lent : React travaille plus tard que la redirection, comme en vrai sur Rey Store.
    await page.addInitScript(() => {
      const envoyer = MessagePort.prototype.postMessage;
      MessagePort.prototype.postMessage = function (this: MessagePort, ...valeurs: unknown[]) {
        const lent = (window as unknown as { lent?: boolean }).lent;
        if (lent) setTimeout(() => envoyer.apply(this, valeurs as never), 5000);
        else envoyer.apply(this, valeurs as never);
      } as never;
    });
    await page.goto(adresses[cible]);
    await page.getByText('Articles : 1').waitFor();
    await page.evaluate(() => {
      (window as unknown as { lent?: boolean }).lent = true;
    });
    await page.getByRole('button', { name: 'Commander' }).click();
    await page.waitForURL('https://wa.me/**');
    await page.goto(adresses[cible]);
    await page.getByText('Articles : 0').waitFor({ timeout: 5000 });
    await page.close();
  }, 20_000);
});

describe('non vide et variable = rien', () => {
  const serveur = (champ: string) =>
    programme('serveur "s" :', '>donnee d :', `>>${champ}`, '>route "d" :', '>>tout le monde peut creer d', '>>seul admin peut lire d', '>>seul admin peut modifier d');
  const ri = (champ: string) => compiler(serveur(champ)).application!.serveurs[0];

  it('lit « non vide », seul ou avec une règle', () => {
    expect(ri('refs : liste de texte non vide').donnees[0].champs[0]).toMatchObject({ nom: 'refs', nonVide: true });
    expect(ri('photos : liste de texte du site non vide').donnees[0].champs[0]).toMatchObject({ regle: { genre: 'site' }, nonVide: true });
    expect(ri('photos : liste de texte non vide du site').donnees[0].champs[0]).toMatchObject({ regle: { genre: 'site' }, nonVide: true });
    expect(ri('nom : texte').donnees[0].champs[0].nonVide).toBeUndefined();
  });

  it('prévient pour « ajouter lu » hors d\'un « si », pas dedans', () => {
    const page = (...lignes: string[]) =>
      compiler(programme('page "p" :', '>titre "P"', '>variable lu = rien', '>variable tous = ["a"]', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>changer lu par "b"', ...lignes)).diagnostics.map((d) => d.message).join();
    expect(page('>>ajouter lu à tous')).toContain('peut encore être rien');
    expect(page('>>si lu est different de rien :', '>>>ajouter lu à tous')).not.toContain('peut encore être rien');
  });
});

describe('l\'écriture part du changement, sur chaque cible', () => {
  const avecSecret = programme('page "accueil" :', '>titre "A"', '>variable compte = 1 avec memorisee', '>variable jeton = "x" avec memorisee en secret', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', '>>changer compte par 2', '>>changer jeton par "y"');

  it('mobile : mémoire et coffre écrivent dans le setter, plus dans un effet', () => {
    const memoire = genererProjetMobile(compiler(avecSecret).application!, { nom: 'e', source: 'e.humalis' }).get('humalis/memoire.ts')!;
    expect(memoire).toContain('stockage.ecrire(cle, JSON.stringify(nouvelle))');
    expect(memoire).not.toContain('stockage.ecrire(cle, JSON.stringify(valeur))');
  });

  it('web : le setter écrit avant de changer la valeur, sans effet', () => {
    const memoire = genererProjetWeb(compiler(SOURCE).application!, { nom: 'e', source: 'e.humalis', adresse: 'https://e.cd' }).get('src/humalis/memoire.ts')!;
    expect(memoire.indexOf('localStorage.setItem')).toBeLessThan(memoire.indexOf('setValeur(nouvelle)'));
    expect(memoire).not.toContain('useEffect');
  });
});
