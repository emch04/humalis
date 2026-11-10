/**
 * Les formes d'application spéciales sur le bureau (Electron, qui sert aussi pour Linux) :
 * la page dans la barre du système (Tray), l'ouverture des fichiers (« Ouvrir avec… »),
 * le lancement au démarrage de l'ordinateur et le menu clic droit du gestionnaire de fichiers.
 *
 * Ce qui agit (fichier ouvert, menu clic droit) devient une page cachée du moteur Humalis, à
 * l'adresse /formes-humalis/N : sa variable « fichier » est lue auprès du processus principal
 * (le pont humalisFormes), puis ses actions tournent dans la fenêtre de l'application, avant
 * de revenir à la page d'où l'on venait.
 */
import type { Diagnostic } from '../../analyse/erreurs.js';
import type { Action, Application, Ecran } from '../../ri/types.js';
import { FORMES_LUCIDE } from '../icones-donnees.js';
import { chercherIcone, interieurIconeProjet, iconesDessineesConnues } from '../../vocabulaire/icones.js';
import { cheminsDesPages } from '../web/projet.js';
import { chaine } from '../web/noms.js';

/** Une page de la barre du système : son adresse, et le dessin de son icône (SVG 24 × 24). */
export interface TrayBureau {
  nom: string;
  chemin: string;
  svg: string;
}

/** Une forme qui agit sur un fichier reçu du système. */
export interface ActionFichier {
  sorte: 'fichier' | 'menu';
  /** Le numéro de la forme (1, 2…), dans l'argument --humalis-forme=N. */
  numero: number;
  /** La page cachée qui porte les actions. */
  nom: string;
  chemin: string;
  /** La clé de la variable « fichier » dans les données de la page. */
  cle: string;
  /** Les extensions, sans le point et en minuscules (« csv »). */
  extensions: string[];
  /** Le titre du menu clic droit. */
  titre?: string;
}

export interface FormesBureau {
  trays: TrayBureau[];
  actions: ActionFichier[];
  demarrage?: { discret: boolean };
}

/** Le préfixe des adresses des pages cachées. */
export const ADRESSE_FORMES = '/formes-humalis';

/** Les types des fichiers courants, pour « fichier.type », les associations Linux et les menus de Dolphin. */
export const TYPES_MIME: Record<string, string> = {
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json', xml: 'application/xml',
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', ics: 'text/calendar', vcf: 'text/vcard',
  yaml: 'application/yaml', yml: 'application/yaml', log: 'text/plain', humalis: 'text/plain',
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  zip: 'application/zip', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
};

const typeDe = (extension: string) => TYPES_MIME[extension] ?? `application/x-${extension}`;
const sansPoint = (extensions: string[]) => [...new Set(extensions.map((e) => e.replace(/^\./, '').toLowerCase()))];

/** Le dessin d'une icône : une icône du projet, un nom français (« horloge ») ou un nom de Lucide (« clock »). */
export function svgDeLIcone(nom: string | undefined): string {
  const projet = nom ? iconesDessineesConnues().find((i) => i.icone.nom === nom) : undefined;
  const interieur = projet
    ? interieurIconeProjet(projet.dessin)
    : (FORMES_LUCIDE[(nom && chercherIcone(nom)?.lucide) ?? ''] ?? FORMES_LUCIDE[nom ?? ''] ?? FORMES_LUCIDE['app-window'] ?? FORMES_LUCIDE['circle-help']!);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${interieur}</svg>`;
}

/** Ce que les formes demandent au bureau, avec les adresses des pages cachées. */
export function formesDuBureau(application: Application): FormesBureau {
  const f = application.formes;
  const actions: ActionFichier[] = [];
  const ajouter = (sorte: 'fichier' | 'menu', extensions: string[], titre?: string) => {
    const numero = actions.length + 1;
    const nom = `formes-humalis-${numero}`;
    actions.push({ sorte, numero, nom, chemin: `${ADRESSE_FORMES}/${numero}`, cle: `${nom}:fichier`, extensions: sansPoint(extensions), ...(titre !== undefined ? { titre } : {}) });
  };
  for (const o of f?.fichiersOuverts ?? []) ajouter('fichier', o.extensions);
  for (const m of f?.menusClicDroit ?? []) ajouter('menu', m.extensions, m.titre);
  const chemins = cheminsDesPages(application);
  return {
    trays: application.ecrans.filter((e) => e.barreSysteme).map((e) => ({ nom: e.nom, chemin: chemins.get(e.nom) ?? '/', svg: svgDeLIcone(e.barreSysteme!.icone) })),
    actions,
    ...(f?.demarrage ? { demarrage: { discret: f.demarrage.discret } } : {}),
  };
}

/** Une action ou l'une de ses branches change-t-elle de page ? */
const changeDePage = (actions: Action[]): boolean => /"type":"(navigation|retour)"/.test(JSON.stringify(actions));

/**
 * L'application telle que le moteur la reçoit : les pages de la barre du système sans en-tête ni pied,
 * et une page cachée par forme qui agit. Une forme qui ne change pas de page revient ensuite d'où l'on venait.
 */
export function applicationAvecFormes(application: Application, formes: FormesBureau): { application: Application; donnees: Map<string, unknown> } {
  const donnees = new Map<string, unknown>();
  if (formes.trays.length === 0 && formes.actions.length === 0) return { application, donnees };
  const accueil = [...cheminsDesPages(application)].find(([, c]) => c === '/')?.[0];
  const sources: { ecran: Ecran }[] = [...(application.formes?.fichiersOuverts ?? []), ...(application.formes?.menusClicDroit ?? [])];
  const cachees: Ecran[] = formes.actions.map((a, i) => {
    const ecran = sources[i]!.ecran;
    donnees.set(a.cle, { nom: '', type: '', contenu: '' });
    return {
      ...ecran,
      nom: a.nom,
      adresse: a.chemin,
      sansEntete: true,
      sansPied: true,
      gestionnaires: ecran.gestionnaires.map((g) =>
        g.declencheur === 'chargement' && !changeDePage(g.actions) ? { ...g, actions: [...g.actions, { type: 'retour', ...(accueil !== undefined ? { vers: accueil } : {}) } as Action] } : g,
      ),
    };
  });
  return {
    application: {
      ...application,
      ecrans: [...application.ecrans.map((e) => (e.barreSysteme ? { ...e, sansEntete: true, sansPied: true } : e)), ...cachees],
    },
    donnees,
  };
}

/**
 * Les couches des pages cachées lisent la variable « fichier » auprès du processus principal
 * (window.humalisFormes, posé par le pont), à chaque ouverture : le document de la page, gardé en cache
 * par la navigation, ne la porte donc pas.
 */
export function brancherLesCouches(fichiers: Map<string, string>, formes: FormesBureau): void {
  for (const [chemin, code] of fichiers) {
    if (!chemin.startsWith('src/couches/')) continue;
    let nouveau = code;
    for (const a of formes.actions) {
      const lu = `adresse.donnees[${chaine(a.cle)}]`;
      nouveau = nouveau.split(lu).join(`(globalThis.humalisFormes?.recu(${chaine(a.cle)}) ?? ${lu})`);
    }
    if (nouveau !== code) fichiers.set(chemin, nouveau);
  }
}

/** Ce que la cible bureau dit des formes : la limite du Finder, et les pages produites avec React. */
export function verifierFormesBureau(application: Application, surLeMoteur: boolean): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const f = application.formes;
  const menus = f?.menusClicDroit ?? [];
  if (menus.length > 0) {
    diagnostics.push({
      gravite: 'avertissement',
      ligne: menus[0]!.ligne,
      message: 'sur Mac, le menu clic droit de l’application de bureau ne paraît pas dans le Finder : il y faut une extension Finder, que seule la cible Apple produit. Il est posé sur Windows (Explorateur) et sur Linux (Dolphin, Nemo, et les scripts de Nautilus).',
    });
  }
  const agissantes = [...(f?.fichiersOuverts ?? []), ...menus];
  if (!surLeMoteur && agissantes.length > 0) {
    diagnostics.push({
      gravite: 'erreur',
      ligne: agissantes[0]!.ligne,
      message: 'l’ouverture d’un fichier et le menu clic droit ne sont écrits qu’avec le moteur Humalis : ce programme est produit avec React (un composant React, « memorisee en secret » ou --moteur react).',
    });
  }
  return diagnostics;
}

/** Les associations de fichiers d'electron-builder : un groupe par forme « quand on ouvre un fichier ». */
export function associationsDeFichiers(formes: FormesBureau): { ext: string[]; name: string; role: string; mimeType: string }[] {
  return formes.actions
    .filter((a) => a.sorte === 'fichier')
    .map((a) => ({ ext: a.extensions, name: a.extensions.map((e) => e.toUpperCase()).join(', '), role: 'Editor', mimeType: a.extensions.map(typeDe).join(';') }));
}

/** Une chaîne NSIS entre guillemets : $ et " y sont échappés. */
const nsis = (texte: string) => `"${texte.replace(/\$/g, '$$$$').replace(/"/g, '$\\"').replace(/[\r\n]+/g, ' ')}"`;

/**
 * Le menu clic droit de l'Explorateur : des clés de l'utilisateur (HKCU), posées par l'installateur NSIS
 * et retirées par la désinstallation. SystemFileAssociations vaut pour l'extension, quelle que soit
 * l'application qui l'ouvre.
 */
export function scriptNsis(formes: FormesBureau, slug: string): string | undefined {
  const menus = formes.actions.filter((a) => a.sorte === 'menu');
  if (menus.length === 0) return undefined;
  const cles = menus.flatMap((m) => m.extensions.map((ext) => ({ m, cle: `Software\\Classes\\SystemFileAssociations\\.${ext}\\shell\\${slug}-${m.numero}` })));
  return `; Produit par Humalis : le menu clic droit de l'Explorateur (« menu clic droit »).
; Les clés sont celles de l'utilisateur : l'installateur ne demande pas les droits d'administrateur.
!macro customInstall
${cles.map(({ m, cle }) => `  WriteRegStr HKCU ${nsis(cle)} "MUIVerb" ${nsis(m.titre ?? '')}
  WriteRegStr HKCU ${nsis(cle)} "Icon" '"$INSTDIR\\\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU ${nsis(`${cle}\\command`)} "" '"$INSTDIR\\\${APP_EXECUTABLE_FILENAME}" --humalis-forme=${m.numero} "%1"'`).join('\n')}
!macroend

!macro customUnInstall
${cles.map(({ cle }) => `  DeleteRegKey HKCU ${nsis(cle)}`).join('\n')}
!macroend
`;
}

/** Les constantes et fonctions des formes dans le processus principal. */
export function codeFormesPrincipal(formes: FormesBureau, slug: string): string {
  const parties: string[] = [];
  const actions = formes.actions;
  if (formes.trays.length > 0 || formes.demarrage) parties.push(TRAY(formes, slug));
  if (formes.demarrage) parties.push(DEMARRAGE(slug));
  else if (formes.trays.length > 0) parties.push('\nconst elementsDuDemarrage = (): MenuItemConstructorOptions[] => [];\n');
  if (actions.length > 0) parties.push(FICHIERS(formes, slug));
  return parties.join('');
}

/** La barre du système : une icône par page, sa petite fenêtre sans cadre, et le menu Ouvrir / Quitter. */
function TRAY(formes: FormesBureau, slug: string): string {
  // Lancée « discret » sans page dans la barre du système : une icône quand même, sinon rien ne la rouvrirait.
  const trays = formes.trays.length > 0 ? formes.trays : [{ nom: '', chemin: '', svg: svgDeLIcone(undefined) }];
  void slug;
  return `
/** Les pages dans la barre du système (« page "…" dans la barre du systeme ») : une icône chacune. */
const PAGES_BARRE: { titre: string; chemin: string; svg: string }[] = [
${trays.map((t) => `  { titre: ${chaine(t.nom)}, chemin: ${chaine(t.chemin)}, svg: ${chaine(t.svg)} },`).join('\n')}
];
/** Gardés ici : une icône sans référence serait ramassée par le ramasse-miettes, et disparaîtrait. */
const icones: Tray[] = [];
const fenetresBarre = new Map<string, BrowserWindow>();

/**
 * Le dessin de l'icône, en PNG : le SVG est rendu dans une fenêtre hors écran, au double de la taille.
 * Sur Mac, une image « modèle » que le système colore ; ailleurs, la couleur du thème.
 */
async function dessinerIcone(svg: string): Promise<NativeImage> {
  const mac = process.platform === 'darwin';
  const taille = (mac ? 18 : 16) * 2;
  const couleur = mac || !nativeTheme.shouldUseDarkColors ? '#000000' : '#ffffff';
  const page = \`<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden;color:\${couleur}">\${svg.replace('<svg ', \`<svg width="\${taille}" height="\${taille}" \`)}</body></html>\`;
  const hors = new BrowserWindow({ show: false, width: taille, height: taille, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, javascript: false } });
  try {
    await hors.loadURL(\`data:text/html;charset=utf-8,\${encodeURIComponent(page)}\`);
    await new Promise((fin) => setTimeout(fin, 100));
    const capture = await hors.webContents.capturePage();
    const image = nativeImage.createFromBuffer(capture.resize({ width: taille, height: taille }).toPNG(), { scaleFactor: 2 });
    if (mac) image.setTemplateImage(true);
    return image;
  } finally {
    hors.destroy();
  }
}

/** La petite fenêtre d'une page de la barre : sans cadre, près de l'icône, cachée dès qu'on clique ailleurs. */
function fenetreDeLaBarre(page: (typeof PAGES_BARRE)[number]): BrowserWindow {
  let fenetre = fenetresBarre.get(page.chemin);
  if (fenetre && !fenetre.isDestroyed()) return fenetre;
  fenetre = new BrowserWindow({
    width: 360,
    height: 480,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: page.titre || NOM,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141416' : '#ffffff',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  fenetre.on('blur', () => fenetre?.hide());
  if (process.platform === 'darwin') fenetre.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  void fenetre.loadURL(\`\${ORIGINE}\${page.chemin}\`);
  fenetresBarre.set(page.chemin, fenetre);
  return fenetre;
}

/** Près de l'icône : dessous si la barre est en haut de l'écran, dessus si elle est en bas ; jamais hors de l'écran. */
function placerPresDe(fenetre: BrowserWindow, icone: Tray): void {
  const zone = icone.getBounds();
  // Sur Linux, l'icône ne dit pas toujours où elle est : la fenêtre s'ouvre près de la souris.
  const point = zone.width > 0 ? { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 } : screen.getCursorScreenPoint();
  const ecran = screen.getDisplayNearestPoint(point).workArea;
  const [largeur, hauteur] = fenetre.getSize() as [number, number];
  const enHaut = point.y < ecran.y + ecran.height / 2;
  const x = Math.round(point.x - largeur / 2);
  const y = enHaut ? Math.round((zone.height > 0 ? zone.y + zone.height : point.y) + 4) : Math.round((zone.height > 0 ? zone.y : point.y) - hauteur - 4);
  const borne = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));
  fenetre.setPosition(borne(x, ecran.x + 4, ecran.x + ecran.width - largeur - 4), borne(y, ecran.y + 4, ecran.y + ecran.height - hauteur - 4));
}

function basculerFenetreDeLaBarre(page: (typeof PAGES_BARRE)[number], icone: Tray): void {
  const fenetre = fenetreDeLaBarre(page);
  if (fenetre.isVisible()) {
    fenetre.hide();
    return;
  }
  placerPresDe(fenetre, icone);
  fenetre.show();
  fenetre.focus();
}

/** Le menu de l'icône : la page, Ouvrir, le lancement au démarrage s'il est demandé, Quitter. */
function menuDeLIcone(page: (typeof PAGES_BARRE)[number], icone: Tray): Menu {
  return Menu.buildFromTemplate([
    ...(page.chemin ? [{ label: \`Afficher « \${page.titre} »\`, click: () => basculerFenetreDeLaBarre(page, icone) }, { type: 'separator' as const }] : []),
    { label: \`Ouvrir \${NOM}\`, click: () => montrerFenetrePrincipale() },
    ...elementsDuDemarrage(),
    { type: 'separator' },
    { label: \`Quitter \${NOM}\`, click: () => app.quit() },
  ]);
}

async function poserLesIcones(): Promise<void> {
  for (const page of PAGES_BARRE) {
    let image: NativeImage;
    try {
      image = await dessinerIcone(page.svg);
    } catch {
      image = nativeImage.createEmpty();
    }
    const icone = new Tray(image);
    icone.setToolTip(page.titre ? \`\${NOM} — \${page.titre}\` : NOM);
    if (image.isEmpty() && process.platform === 'darwin') icone.setTitle(NOM);
    icones.push(icone);
    if (process.platform === 'linux') {
      // Sur Linux, la plupart des bureaux n'envoient pas le clic à l'icône : le menu s'ouvre à la place.
      icone.setContextMenu(menuDeLIcone(page, icone));
      continue;
    }
    icone.on('click', () => (page.chemin ? basculerFenetreDeLaBarre(page, icone) : montrerFenetrePrincipale()));
    icone.on('right-click', () => icone.popUpContextMenu(menuDeLIcone(page, icone)));
  }
}
`;
}

/** Le lancement au démarrage : choisi une fois à la première ouverture, puis par la case du menu. */
function DEMARRAGE(slug: string): string {
  return `
/** L'argument posé sur la commande du démarrage (Windows et Linux) : l'application sait qu'elle démarre avec l'ordinateur. */
const ARGUMENT_DEMARRAGE = '--humalis-demarrage';
const fichierDuChoix = () => join(app.getPath('userData'), 'demarrage.json');
/** Linux : un fichier .desktop dans ~/.config/autostart, que lisent GNOME, KDE, XFCE… */
const fichierAutostart = () => join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'autostart', ${chaine(`${slug}.desktop`)});

/** Lancée par le démarrage de l'ordinateur (et non par la personne) ? */
function lanceeAuDemarrage(): boolean {
  if (process.argv.includes(ARGUMENT_DEMARRAGE)) return true;
  return process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin === true;
}

function demarrageActif(): boolean {
  if (process.platform === 'linux') return existsSync(fichierAutostart());
  return app.getLoginItemSettings(process.platform === 'win32' ? { args: [ARGUMENT_DEMARRAGE] } : undefined).openAtLogin;
}

/** Une valeur de la ligne Exec= d'un fichier .desktop, entre guillemets. */
const valeurExec = (texte: string) => \`"\${texte.replace(/(["\`$\\\\])/g, '\\\\$1')}"\`;

function reglerDemarrage(actif: boolean): void {
  if (process.platform === 'linux') {
    // Une AppImage se lance par son propre fichier (APPIMAGE), pas par le dossier monté le temps qu'elle tourne.
    const programme = process.env.APPIMAGE ?? process.execPath;
    if (actif) {
      mkdirSync(dirname(fichierAutostart()), { recursive: true });
      writeFileSync(fichierAutostart(), ['[Desktop Entry]', 'Type=Application', \`Name=\${NOM}\`, \`Exec=\${valeurExec(programme)} \${ARGUMENT_DEMARRAGE}\`, 'X-GNOME-Autostart-enabled=true', 'Terminal=false', ''].join('\\n'));
    } else rmSync(fichierAutostart(), { force: true });
  } else {
    app.setLoginItemSettings({ openAtLogin: actif, ...(process.platform === 'win32' ? { args: [ARGUMENT_DEMARRAGE] } : {}) });
  }
  try {
    mkdirSync(dirname(fichierDuChoix()), { recursive: true });
    writeFileSync(fichierDuChoix(), JSON.stringify({ actif }));
  } catch {
    // Le choix n'est pas gardé : il sera reposé à la prochaine ouverture.
  }
}

/**
 * « lancer au demarrage de l'ordinateur » : posé à la première ouverture de l'application installée
 * (jamais pendant npm start, qui lancerait Electron seul). Ensuite, la case du menu décide.
 */
function preparerDemarrage(): void {
  if (!app.isPackaged && !process.env.HUMALIS_ESSAI_DEMARRAGE) return;
  if (!existsSync(fichierDuChoix())) reglerDemarrage(true);
}

function elementsDuDemarrage(): MenuItemConstructorOptions[] {
  return [
    { type: 'separator' },
    { label: "Lancer au démarrage de l'ordinateur", type: 'checkbox', checked: demarrageActif(), click: (element) => reglerDemarrage(element.checked) },
  ];
}
`;
}

/** L'ouverture des fichiers et le menu clic droit : le fichier reçu va à la page cachée de sa forme. */
function FICHIERS(formes: FormesBureau, slug: string): string {
  const menus = formes.actions.filter((a) => a.sorte === 'menu');
  return `
/** Les formes qui reçoivent un fichier : « quand on ouvre un fichier » et « menu clic droit ». */
const FORMES_FICHIERS: { numero: number; sorte: 'fichier' | 'menu'; chemin: string; cle: string; extensions: string[]; titre?: string }[] = [
${formes.actions.map((a) => `  { numero: ${a.numero}, sorte: ${chaine(a.sorte)}, chemin: ${chaine(a.chemin)}, cle: ${chaine(a.cle)}, extensions: [${a.extensions.map(chaine).join(', ')}]${a.titre !== undefined ? `, titre: ${chaine(a.titre)}` : ''} },`).join('\n')}
];
const TYPES: Record<string, string> = ${JSON.stringify(Object.fromEntries(formes.actions.flatMap((a) => a.extensions).map((e) => [e, typeDe(e)])))};
/** Au-delà, le contenu n'est pas lu : la page reçoit le nom et le type seulement. */
const TAILLE_MAXIMALE_FICHIER = 20_000_000;
/** Ce que la page cachée lira (window.humalisFormes.recu), une fois. */
const recus = new Map<string, { nom: string; type: string; contenu: string }>();
/** Les fichiers reçus avant que la fenêtre soit prête, puis l'un après l'autre. */
let fileDesFichiers: Promise<void> = Promise.resolve();
let pret = false;
const enAttente: { numero?: number; chemin: string }[] = [];

const extensionDe = (chemin: string) => extname(chemin).slice(1).toLowerCase();

/** Le fichier lu : son nom, son type et son contenu (du texte, ou une adresse data: pour une image, un PDF…). */
async function lireLeFichier(chemin: string): Promise<{ nom: string; type: string; contenu: string }> {
  const extension = extensionDe(chemin);
  const type = TYPES[extension] ?? 'application/octet-stream';
  const taille = statSync(chemin).size;
  if (taille > TAILLE_MAXIMALE_FICHIER) return { nom: basename(chemin), type, contenu: '' };
  const octets = await readFile(chemin);
  const texte = /^(text\\/|application\\/(json|xml|yaml)|image\\/svg)/.test(type) || (!octets.includes(0) && !TYPES[extension]);
  return { nom: basename(chemin), type, contenu: texte ? octets.toString('utf8') : \`data:\${type};base64,\${octets.toString('base64')}\` };
}

/** La forme d'un fichier : celle de son numéro (menu clic droit), sinon la première « quand on ouvre un fichier » de son extension. */
function formeDuFichier(chemin: string, numero?: number) {
  const extension = extensionDe(chemin);
  const forme = numero !== undefined ? FORMES_FICHIERS.find((f) => f.numero === numero) : FORMES_FICHIERS.find((f) => f.sorte === 'fichier' && f.extensions.includes(extension));
  return forme && forme.extensions.includes(extension) ? forme : undefined;
}

/** Ouvre la page cachée de la forme dans la fenêtre : un lien suivi par la navigation du moteur, sans recharger la page. */
async function lancerLaForme(forme: (typeof FORMES_FICHIERS)[number], chemin: string): Promise<void> {
  recus.set(forme.cle, await lireLeFichier(chemin));
  const fenetre = montrerFenetrePrincipale();
  const contenu = fenetre.webContents;
  if (contenu.isLoading()) await new Promise((fin) => contenu.once('did-finish-load', () => fin(undefined)));
  await contenu.executeJavaScript(\`(() => { const a = document.createElement('a'); a.href = \${JSON.stringify(forme.chemin)}; a.hidden = true; document.body.append(a); a.click(); a.remove(); })()\`);
  // Le fichier suivant attend que la page cachée ait fini (elle revient d'où l'on venait, ou change de page).
  for (let i = 0; i < 50; i++) {
    await new Promise((fin) => setTimeout(fin, 100));
    const ici = await contenu.executeJavaScript('location.pathname').catch(() => '');
    if (i > 2 && !String(ici).startsWith(${chaine(ADRESSE_FORMES)})) break;
  }
}

function recevoirFichier(chemin: string, numero?: number): void {
  if (!pret) {
    enAttente.push({ chemin, ...(numero !== undefined ? { numero } : {}) });
    return;
  }
  const forme = formeDuFichier(chemin, numero);
  if (!forme) return;
  fileDesFichiers = fileDesFichiers.then(() => lancerLaForme(forme, chemin)).catch((erreur) => console.error(\`Le fichier \${chemin} n'a pas pu être ouvert : \${erreur}\`));
}

/**
 * Les fichiers de la ligne de commande (Windows et Linux : « Ouvrir avec », le menu clic droit) :
 * « --humalis-forme=N » désigne un menu clic droit ; les autres arguments sont des fichiers.
 */
function fichiersDesArguments(argv: string[], dossier: string): void {
  let numero: number | undefined;
  for (const argument of argv.slice(1)) {
    const menu = /^--humalis-forme=(\\d+)$/.exec(argument);
    if (menu) {
      numero = Number(menu[1]);
      continue;
    }
    if (argument.startsWith('-')) continue;
    const chemin = isAbsolute(argument) ? argument : join(dossier, argument);
    if (formeDuFichier(chemin, numero) && existsSync(chemin) && statSync(chemin).isFile()) recevoirFichier(chemin, numero);
  }
}

/** La fenêtre est prête : les fichiers reçus avant partent. */
function fichiersPrets(): void {
  pret = true;
  for (const { chemin, numero } of enAttente.splice(0)) recevoirFichier(chemin, numero);
}

/** Le pont : la page cachée lit le fichier reçu, une fois, et seulement depuis l'application. */
function ecouterLesFormes(): void {
  ipcMain.on('humalis:forme:recu', (evenement, cle: unknown) => {
    const permis = dansLApplication(evenement.senderFrame?.url ?? '') && typeof cle === 'string';
    evenement.returnValue = permis ? (recus.get(cle) ?? null) : null;
    if (permis) recus.delete(cle);
  });
}

// Mac : « Ouvrir avec », le glisser sur l'icône du Dock ; l'événement peut arriver avant que l'application soit prête.
app.on('open-file', (evenement, chemin) => {
  evenement.preventDefault();
  recevoirFichier(chemin);
});
${menus.length > 0 ? MENUS_LINUX(slug) : ''}`;
}

/**
 * Linux : le clic droit des gestionnaires de fichiers qui le permettent sans extension compilée.
 * Dolphin (KDE) et Nemo (Cinnamon) lisent un fichier par menu, filtré par type ; Nautilus (GNOME)
 * range les scripts dans son sous-menu « Scripts », pour tous les fichiers (l'application ignore
 * les autres extensions). Posés à chaque ouverture de l'application installée, pour suivre son emplacement.
 */
function MENUS_LINUX(slug: string): string {
  return `
function poserLesMenusLinux(): void {
  if (process.platform !== 'linux' || (!app.isPackaged && !process.env.HUMALIS_ESSAI_MENUS)) return;
  const programme = process.env.APPIMAGE ?? process.execPath;
  const exec = \`"\${programme.replace(/(["\`$\\\\])/g, '\\\\$1')}"\`;
  const donnees = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  const ecrire = (fichier: string, contenu: string, mode = 0o644) => {
    try {
      mkdirSync(dirname(fichier), { recursive: true });
      writeFileSync(fichier, contenu, { mode });
      chmodSync(fichier, mode);
    } catch (erreur) {
      console.warn(\`Le menu clic droit n'a pas pu être posé (\${fichier}) : \${erreur}\`);
    }
  };
  for (const forme of FORMES_FICHIERS.filter((f) => f.sorte === 'menu')) {
    const titre = (forme.titre ?? NOM).replace(/[\\r\\n]+/g, ' ');
    const types = [...new Set(forme.extensions.map((e) => TYPES[e] ?? 'application/octet-stream'))];
    // Dolphin (KDE 6, et KDE 5 par son ancien dossier) : le fichier doit être exécutable.
    const dolphin = ['[Desktop Entry]', 'Type=Service', 'X-KDE-ServiceTypes=KonqPopupMenu/Plugin', \`MimeType=\${types.join(';')};\`, 'Actions=humalis', '', '[Desktop Action humalis]', \`Name=\${titre}\`, \`Exec=\${exec} --humalis-forme=\${forme.numero} %F\`, ''].join('\\n');
    ecrire(join(donnees, 'kio', 'servicemenus', \`${slug}-\${forme.numero}.desktop\`), dolphin, 0o755);
    ecrire(join(donnees, 'kservices5', 'ServiceMenus', \`${slug}-\${forme.numero}.desktop\`), dolphin, 0o755);
    // Nemo (Cinnamon) : filtré par extension.
    ecrire(join(donnees, 'nemo', 'actions', \`${slug}-\${forme.numero}.nemo_action\`), ['[Nemo Action]', \`Name=\${titre}\`, \`Exec=\${exec} --humalis-forme=\${forme.numero} %F\`, 'Selection=notnone', \`Extensions=\${forme.extensions.join(';')};\`, ''].join('\\n'));
    // Nautilus (GNOME) : un script dans « Scripts ».
    ecrire(join(donnees, 'nautilus', 'scripts', titre.replace(/[/\\\\]/g, '-')), \`#!/bin/sh\\nexec \${exec} --humalis-forme=\${forme.numero} "$@"\\n\`, 0o755);
  }
}
`;
}

/** Le pont des formes, dans le preload : une seule fonction, recu. */
export const PONT_FORMES = `
contextBridge.exposeInMainWorld('humalisFormes', {
  recu: (cle: string): unknown => ipcRenderer.sendSync('humalis:forme:recu', cle),
});
`;

/** Le LISEZMOI : ce que font les formes sur chaque système. */
export function lisezmoiFormes(formes: FormesBureau): string {
  const lignes: string[] = [];
  if (formes.trays.length > 0) {
    lignes.push(`### La barre du système

${formes.trays.map((t) => `La page « ${t.nom} »`).join(', ')} a son icône dans la barre des menus du Mac, la zone de
notification de Windows et la barre de Linux (une icône d'état : sous GNOME, il faut l'extension
« AppIndicator »). Un clic l'ouvre dans une petite fenêtre, près de l'icône ; un clic droit montre le
menu Ouvrir / Quitter. Sur Linux, le clic ouvre ce menu. Fermer la fenêtre principale laisse
l'application dans la barre.`);
  }
  if (formes.actions.some((a) => a.sorte === 'fichier')) {
    lignes.push(`### Ouvrir un fichier

L'application installée s'inscrit pour ${formes.actions.filter((a) => a.sorte === 'fichier').flatMap((a) => a.extensions.map((e) => `.${e}`)).join(', ')} (clé \`build.fileAssociations\` de
\`package.json\`) : « Ouvrir avec » sur Mac, Windows et Linux. Sur Linux, le paquet .deb l'inscrit auprès du
bureau ; il est construit quand le bloc « site » donne une adresse (sa page d'accueil). Une AppImage
s'inscrit avec AppImageLauncher. Un fichier ouvert pendant que l'application tourne va à la fenêtre déjà
ouverte.`);
  }
  if (formes.actions.some((a) => a.sorte === 'menu')) {
    lignes.push(`### Le menu clic droit

Sur Windows, l'installateur pose le menu dans l'Explorateur (clés de l'utilisateur, retirées à la
désinstallation : \`build/menus.nsh\`). Sur Linux, l'application installée le pose à chaque ouverture pour
Dolphin, Nemo et Nautilus (dans « Scripts »). Sur Mac, le Finder demande une extension Finder, que seule la
cible Apple produit : le menu n'y paraît pas.`);
  }
  if (formes.demarrage) {
    lignes.push(`### Le lancement au démarrage

À sa première ouverture, l'application installée s'inscrit pour démarrer avec l'ordinateur (les éléments
d'ouverture du Mac, la clé Run de Windows, \`~/.config/autostart\` sur Linux). La case « Lancer au démarrage de
l'ordinateur » du menu de l'icône la retire ou la remet.${formes.demarrage.discret ? ' Au démarrage, elle ne montre pas de fenêtre : elle attend dans la barre du système.' : ''}`);
  }
  return lignes.length > 0 ? `\n## Les formes de l'application\n\n${lignes.join('\n\n')}\n` : '';
}
