import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { genererProjetWeb } from '../../src/cibles/web/projet.js';
import { genererProjetDesktop, VERSIONS_DESKTOP, MARQUE_DESKTOP } from '../../src/cibles/desktop/projet.js';
import { programme } from '../analyse/aide.js';

const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};

/** Les mêmes options que la commande : les composants React sont lus à côté du fichier. */
const composantsReact = (source: string) => {
  const lus = new Map<string, { nom: string; contenu: string }>();
  for (const [, chemin] of source.matchAll(/utiliser composant "[^"]+" depuis "([^"]+)"/g)) {
    lus.set(chemin, { nom: `${chemin.split('/').pop()}.tsx`, contenu: readFileSync(`exemples/${chemin}.tsx`, 'utf8') });
  }
  return lus;
};
const desktop = (source: string, serveur?: string) =>
  genererProjetDesktop(compile(source), { nom: 'boutique', source: 'boutique.humalis', composantsReact: composantsReact(source), serveur });
const exemple = (nom: string, serveur?: string) => desktop(readFileSync(`exemples/${nom}.humalis`, 'utf8'), serveur);

describe('cible desktop — le projet Electron', () => {
  const fichiers = exemple('boutique');

  it('produit un projet Electron complet, avec les pages du web', () => {
    for (const f of [
      MARQUE_DESKTOP,
      'package.json',
      'index.html',
      'vite.config.ts',
      'tsconfig.json',
      'tsconfig.electron.json',
      'LISEZMOI.md',
      '.gitignore',
      'electron/principal.ts',
      'src/main.tsx',
      'src/pages/Boutique.tsx',
      'src/pages/Panier.tsx',
      'src/humalis/partage.tsx',
    ]) {
      expect(fichiers.has(f), f).toBe(true);
    }
  });

  it('ne prérend pas (décision D3)', () => {
    expect(fichiers.has('astratra.prerender.config.cjs')).toBe(false);
    const paquet = JSON.parse(fichiers.get('package.json')!);
    expect(JSON.stringify(paquet)).not.toContain('@astratra/prerender');
    expect(JSON.stringify(paquet)).not.toContain('playwright');
  });

  it('épingle les versions vérifiées, toutes en devDependencies', () => {
    const paquet = JSON.parse(fichiers.get('package.json')!);
    expect(paquet.devDependencies.electron).toBe('44.7.2');
    expect(paquet.devDependencies['electron-builder']).toBe('26.17.0');
    expect(paquet.devDependencies.electron).toBe(VERSIONS_DESKTOP.electron);
    expect(paquet.devDependencies.react).toBe('19.3.1');
    expect(paquet.devDependencies.vite).toBe('8.3.4');
    expect(paquet.dependencies).toBeUndefined();
    for (const version of Object.values(paquet.devDependencies)) expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('lance le processus principal compilé', () => {
    const paquet = JSON.parse(fichiers.get('package.json')!);
    expect(paquet.version).toBe('1.0.0');
    expect(paquet.type).toBe('module');
    expect(paquet.main).toBe('electron/dist/principal.js');
    expect(paquet.scripts.build).toBe('tsc --noEmit && tsc -p tsconfig.electron.json && vite build');
    expect(paquet.scripts.start).toBe('npm run build && electron .');
    expect(paquet.scripts.paquet).toBe('npm run build && electron-builder');
    const tsconfig = JSON.parse(fichiers.get('tsconfig.electron.json')!);
    expect(tsconfig.compilerOptions.outDir).toBe('electron/dist');
    expect(fichiers.get('.gitignore')).toContain('paquets');
  });

  it('configure le paquet installable avec les fusibles de sécurité (décisions D4, D8)', () => {
    const { build } = JSON.parse(fichiers.get('package.json')!);
    expect(build.productName).toBe('boutique');
    expect(build.appId).toBe('com.humalis.boutique');
    expect(build.files).toEqual(['dist/**/*', 'electron/dist/**/*']);
    expect(build.directories.output).toBe('paquets');
    expect(build.mac.target).toEqual(['dmg', 'zip']);
    expect(build.electronFuses).toEqual({
      runAsNode: false,
      enableCookieEncryption: true,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
      grantFileProtocolExtraPrivileges: false,
      resetAdHocDarwinSignature: true,
    });
  });

  it('dit comment lancer l’application, sur Mac compris', () => {
    const lisezmoi = fichiers.get('LISEZMOI.md')!;
    expect(lisezmoi).toContain('npm start');
    expect(lisezmoi).toContain('npm run paquet');
    expect(lisezmoi).toContain('HUMALIS_SERVEUR');
    expect(lisezmoi).toContain(MARQUE_DESKTOP);
  });
});

describe('cible desktop — les pages sont celles du web, à l’octet près (décision D1)', () => {
  for (const nom of ['boutique', 'connexion', 'vitrine', 'boutique-complete', 'avis']) {
    it(nom, () => {
      const source = readFileSync(`exemples/${nom}.humalis`, 'utf8');
      const application = compile(source);
      const options = { nom: 'boutique', source: 'boutique.humalis', composantsReact: composantsReact(source) };
      const web = genererProjetWeb(application, { ...options, adresse: 'http://localhost' });
      const bureau = genererProjetDesktop(application, options);
      for (const [chemin, contenu] of web) {
        if (chemin.startsWith('src/') || ['index.html', 'vite.config.ts', 'tsconfig.json'].includes(chemin)) {
          expect(bureau.get(chemin), chemin).toBe(contenu);
        }
      }
      expect([...bureau.keys()].filter((c) => c.startsWith('src/'))).toEqual([...web.keys()].filter((c) => c.startsWith('src/')));
    });
  }
});

describe('cible desktop — la fenêtre et sa sécurité (décisions D2, D4, D7)', () => {
  const principal = exemple('boutique').get('electron/principal.ts')!;

  it('coupe Node dans la page et garde le bac à sable', () => {
    expect(principal).toContain('contextIsolation: true,');
    expect(principal).toContain('nodeIntegration: false,');
    expect(principal).toContain('sandbox: true,');
    expect(principal).toContain('webSecurity: true,');
    expect(principal).toContain('app.enableSandbox();');
    expect(principal).not.toContain('allowRunningInsecureContent');
  });

  it('sert les pages par un protocole propre, jamais par file://', () => {
    expect(principal).toContain("const SCHEMA = 'humalis';");
    expect(principal).toContain('const ORIGINE = `${SCHEMA}://application`;');
    expect(principal).toContain('protocol.registerSchemesAsPrivileged([');
    expect(principal).toContain('protocol.handle(SCHEMA, servir);');
    expect(principal).toContain("void fenetre.loadURL(`${ORIGINE}/`);");
    expect(principal).not.toMatch(/loadFile|loadURL\('file:/);
    // Une adresse sans extension reçoit index.html : le routeur des pages marche.
    expect(principal).toContain("join(SITE, 'index.html')");
    // Rien ne sort du dossier construit.
    expect(principal).toContain('demande.startsWith(SITE + sep)');
  });

  it('pose une politique de contenu stricte sur chaque page', () => {
    expect(principal).toContain("\"default-src 'self'\"");
    expect(principal).toContain("\"script-src 'self'\"");
    expect(principal).toContain("\"object-src 'none'\"");
    expect(principal).toContain("\"frame-ancestors 'none'\"");
    expect(principal).toContain("\"connect-src 'self'\"");
    expect(principal).toContain("entetes.set('Content-Security-Policy', CSP);");
  });

  it('reconnaît ses adresses par le protocole et l’hôte (URL.origin vaut « null » pour humalis://)', () => {
    expect(principal).toContain("return url.protocol === `${SCHEMA}:` && url.host === 'application';");
    expect(principal).not.toContain('.origin === ORIGINE');
  });

  it('refuse la navigation, les fenêtres, les webview et les permissions', () => {
    expect(principal).toContain("contenu.on('will-navigate'");
    expect(principal).toContain('contenu.setWindowOpenHandler(');
    expect(principal).toContain("return { action: 'deny' };");
    expect(principal).toContain("contenu.on('will-attach-webview'");
    expect(principal).toContain('setPermissionRequestHandler((_contenu, _permission, repondre) => repondre(false));');
    expect(principal).toContain('setPermissionCheckHandler(() => false);');
  });

  it('a un menu en français', () => {
    for (const libelle of ['Édition', 'Annuler', 'Rétablir', 'Couper', 'Copier', 'Coller', 'Tout sélectionner', 'Présentation', 'Page précédente', 'Recharger', 'Plein écran', 'Fenêtre', 'Réduire', 'Quitter', 'À propos de']) {
      expect(principal, libelle).toContain(libelle);
    }
    expect(principal).toContain('Menu.setApplicationMenu(');
  });

  it('suit les usages du Mac et n’ouvre qu’une instance', () => {
    expect(principal).toContain("if (process.platform !== 'darwin') app.quit();");
    expect(principal).toContain("app.on('activate'");
    expect(principal).toContain('app.requestSingleInstanceLock()');
    expect(principal).toContain('nativeTheme.shouldUseDarkColors');
  });

  it('ne produit pas de pont sans secret', () => {
    expect(exemple('boutique').has('electron/pont.cts')).toBe(false);
    expect(principal).not.toContain('preload');
    expect(principal).not.toContain('safeStorage');
  });
});

describe('cible desktop — le relais vers le serveur (décision D5)', () => {
  const avis = exemple('avis').get('electron/principal.ts')!;

  it('relaie /api et /auth vers HUMALIS_SERVEUR, par défaut le port 3000', () => {
    expect(avis).toContain("const SERVEUR = (process.env.HUMALIS_SERVEUR ?? 'http://localhost:3000').replace(/\\/$/, '');");
    expect(avis).toContain("const RELAIS = ['/api', '/auth'];");
    expect(avis).toContain('net.fetch(SERVEUR + url.pathname + url.search');
    expect(avis).toContain("credentials: 'include',");
  });

  it('garde la session du pack hors de la page et recopie son jeton CSRF', () => {
    expect(avis).toContain("name: 'astratra_csrf'");
    expect(avis).toContain("entetes.set('x-csrf-token', decodeURIComponent(csrf.value));");
    expect(avis).toContain("retour.delete('set-cookie');");
  });

  it('écrit l’adresse donnée par --serveur', () => {
    const principal = exemple('avis', 'https://avis.exemple.cd/').get('electron/principal.ts')!;
    expect(principal).toContain("process.env.HUMALIS_SERVEUR ?? 'https://avis.exemple.cd'");
  });

  it('relaie aussi les adresses des requêtes d’un programme sans serveur', () => {
    const principal = desktop(
      programme('page "accueil" :', '>variable produits = []', '>quand la page se charge :', '>>envoyer requete vers "/produits" dans produits', '>texte "ok"'),
    ).get('electron/principal.ts')!;
    expect(principal).toContain("const RELAIS = ['/api', '/auth', '/produits'];");
  });

  it('relaie aussi les requêtes d’un composant écrit en Humalis', () => {
    const principal = desktop(
      programme(
        'composant "Avis" :',
        '>variable avis = []',
        '>quand la page se charge :',
        '>>envoyer requete vers "/avis" dans avis',
        '>texte "Les avis"',
        '',
        'page "accueil" :',
        '>Avis',
      ),
    ).get('electron/principal.ts')!;
    expect(principal).toContain("const RELAIS = ['/api', '/auth', '/avis'];");
  });

  it('ouvre la politique de contenu à une adresse absolue, sans la relayer', () => {
    const principal = desktop(
      programme('page "accueil" :', '>variable produits = []', '>quand la page se charge :', '>>envoyer requete vers "https://api.exemple.cd/produits" dans produits', '>texte "ok"'),
    ).get('electron/principal.ts')!;
    expect(principal).toContain("\"connect-src 'self' https://api.exemple.cd\"");
    expect(principal).toContain("const RELAIS = ['/api', '/auth'];");
  });
});

describe('cible desktop — ce qui est mémorisé (décision D6)', () => {
  it('garde « memorisee » dans le stockage de la page, comme le web', () => {
    const fichiers = desktop(programme('page "accueil" :', '>variable nombre = 0 avec memorisee', '>texte "{nombre}"'));
    expect(fichiers.get('src/humalis/memoire.ts')).toContain('localStorage.getItem(cle)');
    expect(fichiers.get('src/humalis/memoire.ts')).not.toContain('useMemoriseSecret');
    expect(fichiers.has('electron/pont.cts')).toBe(false);
  });

  it('garde un secret chiffré par safeStorage, à travers un pont étroit', () => {
    const fichiers = desktop(programme('page "accueil" :', '>variable jeton = "" avec memorisee en secret', '>texte "ok"'));
    expect(fichiers.get('src/pages/Accueil.tsx')).toContain('useMemoriseSecret(');
    const memoire = fichiers.get('src/humalis/memoire.ts')!;
    expect(memoire).toContain('export function useMemoriseSecret<T>(');
    expect(memoire).toContain('window.humalisCoffre');

    const pont = fichiers.get('electron/pont.cts')!;
    expect(pont).toContain("const { contextBridge, ipcRenderer } = require('electron');");
    expect(pont).toContain("contextBridge.exposeInMainWorld('humalisCoffre'");
    expect(pont).not.toContain('ipcRenderer.send(');

    const principal = fichiers.get('electron/principal.ts')!;
    expect(principal).toContain("preload: join(ICI, 'pont.cjs'),");
    expect(principal).toContain('safeStorage.encryptString(');
    expect(principal).toContain("ipcMain.handle('humalis:coffre:lire'");
    // Le pont n'écoute que la page de l'application.
    expect(principal).toContain("return dansLApplication(evenement.senderFrame?.url ?? '');");
    // Pas de faux coffre : sans trousseau, rien n'est écrit sur le disque.
    expect(principal).toContain("safeStorage.getSelectedStorageBackend() !== 'basic_text'");
  });

  it('garde les deux quand le programme a les deux', () => {
    const fichiers = desktop(
      programme('variable panier = [] avec partagee et memorisee', '', 'page "accueil" :', '>variable jeton = "" avec memorisee en secret', '>texte "ok"'),
    );
    const memoire = fichiers.get('src/humalis/memoire.ts')!;
    expect(memoire).toContain('export function useMemorise<T>(');
    expect(memoire).toContain('export function useMemoriseSecret<T>(');
  });
});
