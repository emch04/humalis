import type { Application, Etat } from '../../ri/types.js';
import type { InfoMedia } from '../../ri/medias.js';
import { simplifier } from '../../analyse/elements.js';
import { chaine } from '../web/noms.js';
import { genererProjetWeb, adressesDeRequetes, MEMOIRE, MARQUE, VERSIONS } from '../web/projet.js';

export interface OptionsDesktop {
  /** Le nom du projet, tiré du fichier Humalis (« boutique »). */
  nom: string;
  /** Le fichier Humalis d'origine, cité dans le LISEZMOI. */
  source: string;
  /** Le contenu de chaque fichier de « utiliser style "…" », lu par la commande. */
  fichiersStyle?: Map<string, string>;
  /** Pour chaque « utiliser composant … depuis "chemin" » : le fichier React lu par la commande. */
  composantsReact?: Map<string, { nom: string; contenu: string }>;
  /** Les fichiers de police du thème, lus par la commande, en base 64. */
  polices?: Map<string, string>;
  /** Les fichiers locaux du programme (images), lus par la commande : leur taille et leurs dimensions. */
  medias?: Map<string, InfoMedia>;
  /** Le logo et l'image de partage du bloc « site », en base 64. */
  images?: Map<string, string>;
  /** L'adresse du serveur écrite dans l'application (« --serveur »), sinon http://localhost:3000. */
  serveur?: string;
}

/**
 * Versions épinglées : celles de la cible web pour les pages, Electron et
 * electron-builder publiés avant le 15 octobre 2026.
 */
export const VERSIONS_DESKTOP = {
  electron: '44.7.2',
  electronBuilder: '26.17.0',
};

/** Le fichier qui marque un dossier produit par Humalis (le même que le web). */
export const MARQUE_DESKTOP = MARQUE;

/** L'adresse du serveur quand ni --serveur ni HUMALIS_SERVEUR ne la donnent (la même que le web). */
export const SERVEUR_PAR_DEFAUT = 'http://localhost:3000';

/**
 * Les fichiers d'un projet Electron : les pages du web, telles quelles
 * (décision D1), et le processus principal qui les ouvre dans une fenêtre.
 */
export function genererProjetDesktop(application: Application, options: OptionsDesktop): Map<string, string> {
  const web = genererProjetWeb(application, { ...options, adresse: 'http://localhost' });
  const fichiers = new Map<string, string>();
  // Les pages et leurs outils, à l'octet près ; pas de prérendu (décision D3).
  for (const [chemin, contenu] of web) {
    if (chemin.startsWith('src/') || [MARQUE, 'index.html', 'vite.config.ts', 'tsconfig.json'].includes(chemin)) {
      fichiers.set(chemin, contenu);
    }
  }

  const etats: Etat[] = [...application.partages, ...application.ecrans.flatMap((e) => e.etat), ...application.composants.flatMap((c) => c.etat)];
  const secret = etats.some((e) => e.memorisee && e.secret);
  // « memorisee en secret », refusé sur le web, est gardé dans le coffre de l'ordinateur (décision D6).
  if (secret) {
    fichiers.set('src/humalis/memoire.ts', memoireAvecCoffre());
    fichiers.set('electron/pont.cts', PONT);
  }

  const slug = simplifier(options.nom).replace(/_/g, '-') || 'application-humalis';
  const { relais, origines } = adressesDuServeur(application);
  fichiers.set('package.json', packageJson(slug, options));
  // Les bibliothèques des éléments d'écran (icônes, code QR) : Vite les emballe, comme React.
  const extras = Object.fromEntries(
    Object.entries(JSON.parse(web.get('package.json')!).dependencies as Record<string, string>).filter(([nom]) => !['react', 'react-dom', 'react-router'].includes(nom)),
  );
  // Les types de ces bibliothèques (ceux de Leaflet), pour `tsc`.
  const types = Object.fromEntries(
    Object.entries(JSON.parse(web.get('package.json')!).devDependencies as Record<string, string>).filter(([nom]) => nom.startsWith('@types/') && !['@types/react', '@types/react-dom'].includes(nom)),
  );
  if (Object.keys(extras).length > 0) {
    const paquet = JSON.parse(fichiers.get('package.json')!);
    paquet.devDependencies = { ...paquet.devDependencies, ...extras, ...types };
    fichiers.set('package.json', JSON.stringify(paquet, null, 2) + '\n');
  }
  fichiers.set('tsconfig.electron.json', TSCONFIG_ELECTRON);
  fichiers.set('.gitignore', 'node_modules\ndist\nelectron/dist\npaquets\n');
  fichiers.set('LISEZMOI.md', lisezmoi(options, slug));
  fichiers.set(
    'electron/principal.ts',
    principal({
      nom: options.nom,
      source: options.source,
      serveur: (options.serveur ?? SERVEUR_PAR_DEFAUT).replace(/\/$/, ''),
      relais,
      origines,
      secret,
      ...mediasDuProgramme(application),
    }),
  );
  return fichiers;
}

/**
 * Ce que le relais transmet au serveur (décision D5) : /api et /auth, plus
 * les adresses relatives des « envoyer requete » d'un programme sans
 * serveur. Une adresse absolue (https://…) n'est pas relayée : son origine
 * est permise dans la politique de contenu.
 */
export function adressesDuServeur(application: Application): { relais: string[]; origines: string[] } {
  const relais = ['/api', '/auth'];
  const origines: string[] = [];
  // Les pages et les composants écrits en Humalis : un composant peut lui aussi envoyer une requête.
  for (const adresse of [...application.ecrans, ...application.composants].flatMap((e) => adressesDeRequetes(e))) {
    if (/^https?:\/\//.test(adresse)) {
      const origine = new URL(adresse).origin;
      if (!origines.includes(origine)) origines.push(origine);
      continue;
    }
    const chemin = `/${adresse.replace(/^\/+/, '')}`.split(/[?#]/)[0];
    // « / » est la page d'accueil de l'application : il n'est jamais relayé.
    if (chemin === '/') continue;
    const dejaRelaye = relais.some((r) => chemin === r || chemin.startsWith(`${r}/`));
    if (!dejaRelaye) relais.push(chemin);
  }
  // Les sources : une adresse absolue est permise dans la politique de contenu ; une adresse relative est relayée.
  for (const source of application.sources) {
    if (/^https?:\/\//.test(source.adresse)) {
      const origine = new URL(source.adresse).origin;
      if (!origines.includes(origine)) origines.push(origine);
    } else {
      const chemin = `/${source.adresse.replace(/^\/+/, '')}`.replace(/\/+$/, '');
      if (chemin !== '' && !relais.some((r) => chemin === r || chemin.startsWith(`${r}/`))) relais.push(chemin);
    }
  }
  return { relais, origines };
}

function packageJson(slug: string, options: OptionsDesktop): string {
  return (
    JSON.stringify(
      {
        name: slug,
        version: '1.0.0',
        private: true,
        description: `Application de bureau produite par Humalis depuis ${options.source}`,
        type: 'module',
        main: 'electron/dist/principal.js',
        scripts: {
          dev: 'vite',
          build: 'tsc --noEmit && tsc -p tsconfig.electron.json && vite build',
          start: 'npm run build && electron .',
          paquet: 'npm run build && electron-builder',
        },
        // Tout sert à construire : Vite emballe les pages, et le processus
        // principal n'utilise qu'Electron et Node (décision D8).
        devDependencies: {
          '@types/react': VERSIONS.typesReact,
          '@types/react-dom': VERSIONS.typesReactDom,
          '@vitejs/plugin-react': VERSIONS.pluginReact,
          electron: VERSIONS_DESKTOP.electron,
          'electron-builder': VERSIONS_DESKTOP.electronBuilder,
          react: VERSIONS.react,
          'react-dom': VERSIONS.reactDom,
          'react-router': VERSIONS.reactRouter,
          typescript: VERSIONS.typescript,
          vite: VERSIONS.vite,
        },
        build: {
          appId: `com.humalis.${slug}`,
          productName: options.nom,
          files: ['dist/**/*', 'electron/dist/**/*'],
          directories: { output: 'paquets' },
          mac: { target: ['dmg', 'zip'], category: 'public.app-category.productivity' },
          win: { target: ['nsis'] },
          linux: { target: ['AppImage'], category: 'Utility' },
          // Les fusibles d'Electron (décision D4) : l'application installée ne
          // se laisse ni détourner en Node, ni charger un autre code.
          electronFuses: {
            runAsNode: false,
            enableCookieEncryption: true,
            enableNodeOptionsEnvironmentVariable: false,
            enableNodeCliInspectArguments: false,
            enableEmbeddedAsarIntegrityValidation: true,
            onlyLoadAppFromAsar: true,
            grantFileProtocolExtraPrivileges: false,
            resetAdHocDarwinSignature: true,
          },
        },
      },
      null,
      2,
    ) + '\n'
  );
}

const TSCONFIG_ELECTRON =
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2023',
        lib: ['ES2023', 'DOM'],
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        skipLibCheck: true,
        rootDir: 'electron',
        outDir: 'electron/dist',
        types: ['node'],
      },
      include: ['electron/*.ts', 'electron/*.cts'],
    },
    null,
    2,
  ) + '\n';

interface OptionsPrincipal {
  nom: string;
  source: string;
  serveur: string;
  relais: string[];
  origines: string[];
  secret: boolean;
  /** Un aperçu de fichier choisi (blob:) s'affiche dans la page. */
  apercu: boolean;
  /** Un son ou une vidéo (media-src) est joué. */
  media: boolean;
}

/** Ce que la politique de contenu doit laisser passer en plus, d'après ce que les pages emploient (plan des médias). */
function mediasDuProgramme(application: Application): { apercu: boolean; media: boolean } {
  const code = JSON.stringify([...application.ecrans, ...application.composants].map((e) => e.vue));
  return { apercu: /"familles":\[[^]*?"apercu":true\}/.test(code), media: /"genre":"audio"/.test(code) };
}

/** Le processus principal : la fenêtre, le menu, le protocole, le relais et, s'il le faut, le coffre. */
function principal(o: OptionsPrincipal): string {
  const electron = ['app', 'BrowserWindow', ...(o.secret ? ['ipcMain'] : []), 'Menu', 'nativeTheme', 'net', 'protocol', ...(o.secret ? ['safeStorage'] : []), 'session', 'shell'];
  const types = ['type MenuItemConstructorOptions', ...(o.secret ? ['type IpcMainInvokeEvent'] : [])];
  const connexions = ["'self'", ...o.origines].join(' ');
  return `// Produit par Humalis depuis ${o.source} : le processus principal de l'application de bureau.
// Il ouvre la fenêtre, pose le menu, sert les pages construites par Vite
// et relaie leurs requêtes vers le serveur (voir LISEZMOI.md).
import { ${electron.join(', ')}, ${types.join(', ')} } from 'electron';
${o.secret ? "import { createHash } from 'node:crypto';\n" : ''}import { existsSync, statSync } from 'node:fs';
${o.secret ? "import { mkdir, readFile, writeFile } from 'node:fs/promises';\n" : ''}import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NOM = ${chaine(o.nom)};
/** Les pages sont servies à cette adresse, propre à l'application : jamais par file://. */
const SCHEMA = 'humalis';
const ORIGINE = \`\${SCHEMA}://application\`;
const ICI = dirname(fileURLToPath(import.meta.url));
/** Les pages construites par Vite (npm run build). */
const SITE = join(ICI, '..', '..', 'dist');

/** L'adresse du serveur : HUMALIS_SERVEUR au lancement, sinon celle écrite à la compilation. */
const SERVEUR = (process.env.HUMALIS_SERVEUR ?? ${chaine(o.serveur)}).replace(/\\/$/, '');
/** Les adresses que les pages appellent sur le serveur : ce processus les lui transmet. */
const RELAIS = [${o.relais.map(chaine).join(', ')}];

/** La politique de contenu : la page ne charge et n'appelle que ce qui vient d'elle. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: https:${o.apercu ? ' blob:' : ''}",${o.media ? `\n  "media-src 'self' blob: https:",` : ''}
  "font-src 'self' data:",
  "connect-src ${connexions}",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

// Le protocole se déclare avant que l'application soit prête.
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEMA, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
// Le bac à sable de Chromium, pour toutes les pages.
app.enableSandbox();

const relayee = (chemin: string) => RELAIS.some((r) => chemin === r || chemin.startsWith(\`\${r}/\`));

/**
 * Le relais vers le serveur. Le cookie de session du pack reste ici, dans
 * le magasin de cookies d'Electron : la page ne le voit jamais. Pour un
 * envoi, le jeton CSRF du pack (cookie astratra_csrf) est recopié dans
 * l'en-tête x-csrf-token, comme le fait la page web : le serveur le vérifie.
 */
async function relayer(requete: Request, url: URL): Promise<Response> {
  const entetes = new Headers();
  for (const nom of ['accept', 'content-type']) {
    const valeur = requete.headers.get(nom);
    if (valeur) entetes.set(nom, valeur);
  }
  const envoi = requete.method !== 'GET' && requete.method !== 'HEAD';
  if (envoi) {
    const [csrf] = await session.defaultSession.cookies.get({ url: SERVEUR, name: 'astratra_csrf' });
    if (csrf) entetes.set('x-csrf-token', decodeURIComponent(csrf.value));
  }
  try {
    const reponse = await net.fetch(SERVEUR + url.pathname + url.search, {
      method: requete.method,
      headers: entetes,
      body: envoi ? await requete.arrayBuffer() : undefined,
      credentials: 'include',
    });
    const retour = new Headers(reponse.headers);
    // Les cookies du serveur restent dans ce processus.
    retour.delete('set-cookie');
    // net.fetch a déjà décompressé le corps : son ancien encodage et sa longueur ne valent plus.
    retour.delete('content-encoding');
    retour.delete('content-length');
    const sansCorps = [101, 204, 205, 304].includes(reponse.status);
    return new Response(sansCorps ? null : reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: retour });
  } catch {
    console.error(\`Le serveur \${SERVEUR} n'a pas répondu. Son adresse se règle avec HUMALIS_SERVEUR.\`);
    return new Response('', { status: 502 });
  }
}

/** Une page : un fichier de dist/, ou index.html pour l'adresse d'une page (/panier). */
async function servir(requete: Request): Promise<Response> {
  const url = new URL(requete.url);
  if (url.host !== 'application') return new Response('', { status: 404 });
  if (relayee(url.pathname)) return relayer(requete, url);
  let demande: string;
  try {
    demande = normalize(join(SITE, decodeURIComponent(url.pathname)));
  } catch {
    return new Response('', { status: 400 });
  }
  // Rien ne sort du dossier construit.
  const dedans = demande.startsWith(SITE + sep);
  let fichier: string | undefined;
  if (dedans && existsSync(demande) && statSync(demande).isFile()) fichier = demande;
  else if (extname(url.pathname) === '') fichier = join(SITE, 'index.html');
  if (!fichier) return new Response('', { status: 404 });
  const reponse = await net.fetch(pathToFileURL(fichier).toString());
  const entetes = new Headers(reponse.headers);
  if (fichier.endsWith('.html')) entetes.set('Content-Security-Policy', CSP);
  return new Response(reponse.body, { status: reponse.status, headers: entetes });
}
${o.secret ? COFFRE : ''}
function creerFenetre(): BrowserWindow {
  const fenetre = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 480,
    minHeight: 360,
    title: NOM,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141416' : '#ffffff',
    webPreferences: {
      // La page n'a ni Node ni require, et tourne dans le bac à sable.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
${o.secret ? "      // Le pont vers le coffre : deux fonctions, lire et ecrire (electron/pont.cts).\n      preload: join(ICI, 'pont.cjs'),\n" : ''}    },
  });
  fenetre.once('ready-to-show', () => fenetre.show());
  void fenetre.loadURL(\`\${ORIGINE}/\`);
  return fenetre;
}

/**
 * L'adresse appartient-elle à l'application ? Pour une adresse humalis://,
 * URL.origin vaut « null » : on compare donc le protocole et l'hôte.
 */
function dansLApplication(adresse: string): boolean {
  try {
    const url = new URL(adresse);
    return url.protocol === \`\${SCHEMA}:\` && url.host === 'application';
  } catch {
    return false;
  }
}

/** Les seules adresses qu'un lien peut ouvrir hors de l'application : jamais javascript:, data: ni file:. */
function adresseExterne(adresse: string): boolean {
  try {
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(new URL(adresse).protocol);
  } catch {
    return false;
  }
}

app.on('web-contents-created', (_evenement, contenu) => {
  // La fenêtre reste sur les pages de l'application : un lien externe s'ouvre dans le navigateur (ou le logiciel) de l'ordinateur.
  contenu.on('will-navigate', (evenement, adresse) => {
    if (dansLApplication(adresse)) return;
    evenement.preventDefault();
    if (adresseExterne(adresse)) void shell.openExternal(adresse);
  });
  // Pas de nouvelle fenêtre : un lien https, mailto ou tel s'ouvre dans le système.
  contenu.setWindowOpenHandler(({ url }) => {
    if (adresseExterne(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contenu.on('will-attach-webview', (evenement) => evenement.preventDefault());
});

/** Le menu, en français. */
function menu(): Menu {
  const mac = process.platform === 'darwin';
  const application: MenuItemConstructorOptions[] = mac
    ? [
        {
          label: NOM,
          submenu: [
            { role: 'about', label: \`À propos de \${NOM}\` },
            { type: 'separator' },
            { role: 'services', label: 'Services' },
            { type: 'separator' },
            { role: 'hide', label: \`Masquer \${NOM}\` },
            { role: 'hideOthers', label: 'Masquer les autres' },
            { role: 'unhide', label: 'Tout afficher' },
            { type: 'separator' },
            { role: 'quit', label: \`Quitter \${NOM}\` },
          ],
        },
      ]
    : [{ label: 'Fichier', submenu: [{ role: 'quit', label: 'Quitter' }] }];
  const historique = () => (BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0])?.webContents.navigationHistory;
  const fenetre: MenuItemConstructorOptions[] = mac
    ? [{ role: 'minimize', label: 'Réduire' }, { role: 'zoom', label: 'Agrandir' }, { role: 'close', label: 'Fermer la fenêtre' }, { type: 'separator' }, { role: 'front', label: 'Tout ramener au premier plan' }]
    : [{ role: 'minimize', label: 'Réduire' }, { role: 'close', label: 'Fermer la fenêtre' }];
  return Menu.buildFromTemplate([
    ...application,
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      ],
    },
    {
      label: 'Présentation',
      submenu: [
        { label: 'Page précédente', accelerator: 'CmdOrCtrl+[', click: () => historique()?.canGoBack() && historique()?.goBack() },
        { label: 'Page suivante', accelerator: 'CmdOrCtrl+]', click: () => historique()?.canGoForward() && historique()?.goForward() },
        { type: 'separator' },
        { role: 'reload', label: 'Recharger' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Taille réelle' },
        { role: 'zoomIn', label: 'Zoom avant' },
        { role: 'zoomOut', label: 'Zoom arrière' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
      ],
    },
    { label: 'Fenêtre', submenu: fenetre },
  ]);
}

// Une seule instance : la relancer ramène la fenêtre déjà ouverte.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const fenetre = BrowserWindow.getAllWindows()[0];
    if (!fenetre) return;
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.focus();
  });

  void app.whenReady().then(() => {
    // Ni caméra, ni micro, ni notifications, ni position.
    session.defaultSession.setPermissionRequestHandler((_contenu, _permission, repondre) => repondre(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    protocol.handle(SCHEMA, servir);
${o.secret ? '    ouvrirCoffre();\n' : ''}    Menu.setApplicationMenu(menu());
    creerFenetre();
    // Sur Mac, un clic sur l'icône du Dock rouvre la fenêtre.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) creerFenetre();
    });
  });

  // Sur Mac, l'application reste dans le Dock quand on ferme sa fenêtre.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
`;
}

/** Le coffre (décision D6), dans le processus principal. */
const COFFRE = `
/**
 * Le coffre (« memorisee en secret ») : chaque valeur est chiffrée par
 * safeStorage (le trousseau sur Mac, DPAPI sur Windows, libsecret ou
 * KWallet sur Linux) et rangée dans le dossier de l'application. Sans vrai
 * coffre, rien n'est écrit sur le disque : le secret reste en mémoire tant
 * que l'application est ouverte.
 */
// Les lettres accentuées sont permises : une variable « jeton_accès » donne sa clé telle quelle.
const CLE_PERMISE = /^[\\p{L}\\p{N}_:.-]{1,200}$/u;
const TAILLE_MAXIMALE = 1_000_000;
const enMemoire = new Map<string, string>();
const fichierDuSecret = (cle: string) =>
  join(app.getPath('userData'), 'coffre', \`\${createHash('sha256').update(cle).digest('hex')}.secret\`);

function coffreSur(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  // Sur Linux sans trousseau, « basic_text » chiffre avec une clé connue de tous : ce n'est pas un coffre.
  return process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text';
}

/** Seule la page de l'application parle au coffre. */
function depuisLaPage(evenement: IpcMainInvokeEvent): boolean {
  return dansLApplication(evenement.senderFrame?.url ?? '');
}

function ouvrirCoffre(): void {
  const sur = coffreSur();
  if (!sur) {
    console.warn(
      "Avertissement : cet ordinateur n'a pas de coffre sûr (safeStorage). Les valeurs « memorisee en secret » restent en mémoire et sont oubliées à la fermeture.",
    );
  }
  ipcMain.handle('humalis:coffre:lire', async (evenement, cle: unknown) => {
    if (!depuisLaPage(evenement) || typeof cle !== 'string' || !CLE_PERMISE.test(cle)) return null;
    if (!sur) return enMemoire.get(cle) ?? null;
    try {
      return safeStorage.decryptString(await readFile(fichierDuSecret(cle)));
    } catch {
      return null;
    }
  });
  ipcMain.handle('humalis:coffre:ecrire', async (evenement, cle: unknown, valeur: unknown) => {
    if (!depuisLaPage(evenement) || typeof cle !== 'string' || !CLE_PERMISE.test(cle)) return false;
    if (typeof valeur !== 'string' || valeur.length > TAILLE_MAXIMALE) return false;
    if (!sur) {
      enMemoire.set(cle, valeur);
      return true;
    }
    await mkdir(dirname(fichierDuSecret(cle)), { recursive: true });
    await writeFile(fichierDuSecret(cle), safeStorage.encryptString(valeur), { mode: 0o600 });
    return true;
  });
}
`;

/** Le pont (preload) : la page ne reçoit que ces deux fonctions, jamais ipcRenderer. */
const PONT = `// Produit par Humalis : le pont entre la page et le coffre (« memorisee en secret »).
// Il tourne dans le bac à sable : seul require('electron') y est permis.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('humalisCoffre', {
  lire: (cle: string): Promise<string | null> => ipcRenderer.invoke('humalis:coffre:lire', cle),
  ecrire: (cle: string, valeur: string): Promise<boolean> => ipcRenderer.invoke('humalis:coffre:ecrire', cle, valeur),
});
`;

/** src/humalis/memoire.ts : celui du web, plus le coffre de l'ordinateur. */
function memoireAvecCoffre(): string {
  const web = MEMOIRE.replace("import { useEffect, useState } from 'react';", "import { useCallback, useEffect, useRef, useState } from 'react';");
  return `${web}
/** Le pont vers le coffre de l'ordinateur, posé par electron/pont.cts. */
declare global {
  interface Window {
    humalisCoffre?: {
      lire(cle: string): Promise<string | null>;
      ecrire(cle: string, valeur: string): Promise<boolean>;
    };
  }
}

/**
 * Une variable « memorisee en secret » : gardée chiffrée dans le coffre de
 * l'ordinateur (le trousseau sur Mac), par le processus principal. Elle
 * commence à sa valeur de départ, prend celle du coffre dès qu'elle est
 * lue, et chaque changement y est gardé ensuite.
 */
export function useMemoriseSecret<T>(cle: string, initiale: T): [T, (valeur: T) => void] {
  const [valeur, setValeurLue] = useState<T>(initiale);
  const lue = useRef(false);
  // Une valeur changée avant que le coffre ait répondu l'emporte sur celle qui était gardée.
  const changee = useRef(false);
  const derniere = useRef(valeur);
  derniere.current = valeur;
  const setValeur = useCallback((nouvelle: T) => {
    changee.current = true;
    setValeurLue(nouvelle);
  }, []);

  useEffect(() => {
    let active = true;
    window.humalisCoffre
      ?.lire(cle)
      .then((gardee) => {
        if (active && gardee !== null && !changee.current) setValeurLue(JSON.parse(gardee) as T);
      })
      .catch(() => {
        // Rien de gardé, ou illisible : la valeur de départ reste.
      })
      .finally(() => {
        if (!active) return;
        lue.current = true;
        if (changee.current) {
          window.humalisCoffre?.ecrire(cle, JSON.stringify(derniere.current)).catch(() => {
            // Le coffre refuse : la valeur reste en mémoire.
          });
        }
      });
    return () => {
      active = false;
    };
  }, [cle]);

  useEffect(() => {
    if (!lue.current) return;
    window.humalisCoffre?.ecrire(cle, JSON.stringify(valeur)).catch(() => {
      // Le coffre refuse : la valeur reste en mémoire.
    });
  }, [cle, valeur]);

  return [valeur, setValeur];
}
`;
}

function lisezmoi(options: OptionsDesktop, slug: string): string {
  return `# ${options.nom}

Application de bureau (Electron) produite par Humalis depuis
\`${options.source}\`. Les pages sont celles de la cible web, ouvertes dans
une fenêtre.

\`\`\`sh
npm install
npm start         # vérifie les types, construit, puis ouvre l'application
npm run paquet    # construit l'application installable dans paquets/
npm run dev       # les pages seules, dans le navigateur (http://localhost:5173)
\`\`\`

Sur Mac, \`npm run paquet\` donne \`paquets/mac-arm64/${options.nom}.app\` (ou
\`paquets/mac/\` sur un Mac Intel) et un \`.dmg\`. Le paquet n'est pas signé :
la signature Apple demande un compte développeur. Avec \`npm start\`, le
premier menu de la barre du Mac s'appelle « Electron » ; l'application
construite porte son vrai nom.

## Le serveur

Les pages appellent \`/api/…\` et \`/auth/…\` ; le processus principal
(\`electron/principal.ts\`) transmet ces requêtes au serveur Humalis.
Son adresse : la variable \`HUMALIS_SERVEUR\` au lancement, sinon celle
écrite à la compilation (\`--serveur\`), sinon \`http://localhost:3000\`.

\`\`\`sh
HUMALIS_SERVEUR=https://mon-serveur.cd npm start
\`\`\`

Le cookie de session du serveur reste dans le processus principal : la
page ne le voit jamais.

## La sécurité

La page n'a ni Node ni \`require\` (\`contextIsolation\`, \`sandbox\`), elle
est servie par le protocole \`humalis://\` (jamais \`file://\`), avec une
politique de contenu stricte. La navigation vers un autre site, les
nouvelles fenêtres et les permissions (caméra, micro…) sont refusées.
Le paquet active les fusibles d'Electron (clé \`build.electronFuses\` de
\`package.json\`). L'identifiant \`com.humalis.${slug}\` est à remplacer par
le tien avant de distribuer l'application.

Ce dossier est réécrit à chaque compilation Humalis. Pour le reprendre à
la main, supprimez le fichier \`${MARQUE}\` : Humalis refusera alors de
l'écraser.
`;
}
