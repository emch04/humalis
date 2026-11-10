import { describe, it, expect } from 'vitest';
import { compiler } from '../../src/compilateur.js';
import { pourLaCible } from '../../src/ri/plateforme.js';
import { verifierFormesPourLaCible } from '../../src/cibles/formes.js';
import { genererProjetDesktop } from '../../src/cibles/desktop/projet.js';
import { verifierFormesBureau, formesDuBureau, svgDeLIcone } from '../../src/cibles/desktop/formes.js';

const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return pourLaCible(application!, 'desktop');
};
const bureau = (source: string) => genererProjetDesktop(compile(source), { nom: 'formes', source: 'formes.humalis', moteur: 'humalis' });

const ACCUEIL = `
page "accueil" :
    titre "Formes"
`;

describe('cible bureau — les formes spéciales', () => {
  it('ne refuse plus la barre du système, les fichiers ouverts, le démarrage ni le menu clic droit', () => {
    const app = compile(`quand on ouvre un fichier ".csv" :
    afficher "Fichier {fichier.nom}"

menu clic droit "Envoyer" pour les fichiers ".jpg" :
    afficher "Reçu {fichier.nom}"

lancer au demarrage de l'ordinateur
${ACCUEIL}
page "rapide" dans la barre du systeme avec icone "horloge" :
    titre "Rapide"
`);
    expect(verifierFormesPourLaCible(app, 'desktop').filter((d) => d.gravite === 'erreur')).toEqual([]);
  });

  describe('la page dans la barre du système', () => {
    const fichiers = bureau(`${ACCUEIL}
page "rapide" dans la barre du systeme avec icone "horloge" :
    titre "Rapide"
`);
    const principal = fichiers.get('electron/principal.ts')!;

    it('pose un Tray par page, avec le dessin de son icône et sa petite fenêtre sans cadre', () => {
      expect(principal).toMatch(/import \{[^}]*\bTray\b[^}]*\} from 'electron'/);
      expect(principal).toContain("{ titre: 'rapide', chemin: '/rapide', svg: '<svg");
      expect(principal).toContain('frame: false');
      expect(principal).toContain('skipTaskbar: true');
      expect(principal).toContain("fenetre.on('blur', () => fenetre?.hide());");
      expect(principal).toContain('image.setTemplateImage(true)');
      expect(principal).toContain('void poserLesIcones();');
    });

    it('a le menu Ouvrir / Quitter, et sur Linux le clic ouvre ce menu', () => {
      expect(principal).toContain('label: `Ouvrir ${NOM}`');
      expect(principal).toContain('label: `Quitter ${NOM}`, click: () => app.quit()');
      expect(principal).toContain("if (process.platform === 'linux') {\n      // Sur Linux, la plupart des bureaux n'envoient pas le clic à l'icône : le menu s'ouvre à la place.\n      icone.setContextMenu(");
    });

    it('fermer la fenêtre laisse l’application dans la barre (Windows, Linux)', () => {
      expect(principal).toContain("if (process.platform !== 'darwin' && icones.length === 0) app.quit();");
    });

    it('la page de la barre n’a ni en-tête ni pied, et existe dans le site construit', () => {
      expect(fichiers.has('rapide/index.html')).toBe(true);
    });

    it('le dessin vient d’un nom français, d’un nom de Lucide, ou d’une icône par défaut', () => {
      expect(svgDeLIcone('horloge')).toBe(svgDeLIcone('clock'));
      expect(svgDeLIcone('horloge')).toContain('<circle');
      expect(svgDeLIcone(undefined)).toMatch(/^<svg /);
    });

    it('le TypeScript produit importe ce qu’il emploie et rien de plus', () => {
      expect(principal).toMatch(/import \{ app, BrowserWindow, Menu, nativeImage, nativeTheme, net, protocol, screen, session, shell, Tray, type MenuItemConstructorOptions, type NativeImage \} from 'electron';/);
      expect(principal).not.toContain('ipcMain');
      expect(principal).toContain('const elementsDuDemarrage = (): MenuItemConstructorOptions[] => [];');
    });
  });

  describe('quand on ouvre un fichier', () => {
    const fichiers = bureau(`variable notes = [] avec partagee

quand on ouvre un fichier ".csv" ou ".TXT" :
    ajouter fichier.nom a notes
    afficher "Fichier {fichier.nom} ({fichier.type})"
${ACCUEIL}`);
    const principal = fichiers.get('electron/principal.ts')!;
    const paquet = JSON.parse(fichiers.get('package.json')!);

    it('inscrit les extensions auprès du système (electron-builder fileAssociations)', () => {
      expect(paquet.build.fileAssociations).toEqual([{ ext: ['csv', 'txt'], name: 'CSV, TXT', role: 'Editor', mimeType: 'text/csv;text/plain' }]);
      // Sans adresse de site, pas de page d'accueil : l'AppImage seule (le .deb la demande).
      expect(paquet.build.linux.target).toEqual(['AppImage']);
      expect(paquet.homepage).toBeUndefined();
      expect(paquet.scripts['paquet:linux']).toBe('npm run build && electron-builder --linux --publish never');
    });

    it('avec l’adresse du site, le paquet .deb aussi, dont elle est la page d’accueil', () => {
      const p = JSON.parse(bureau(`site :
    nom "Formes"
    adresse "https://formes.example.org"

quand on ouvre un fichier ".csv" :
    afficher "x"
${ACCUEIL}`).get('package.json')!);
      expect(p.homepage).toBe('https://formes.example.org');
      expect(p.build.linux).toMatchObject({ target: ['AppImage', 'deb'], maintainer: 'formes' });
    });

    it('reçoit le fichier : open-file sur Mac, les arguments et la deuxième instance ailleurs', () => {
      expect(principal).toContain("app.on('open-file', (evenement, chemin) => {");
      expect(principal).toContain('fichiersDesArguments(process.argv.slice(app.isPackaged ? 0 : 1), process.cwd());');
      expect(principal).toContain("app.on('second-instance', (_evenement, argv, dossier) => {");
      expect(principal).toContain('if (avecFichier) return fichiersDesArguments(argv, dossier);');
      expect(principal).toContain('app.requestSingleInstanceLock()');
    });

    it('donne le fichier à la page par le pont, une fois, et seulement à l’application', () => {
      expect(fichiers.get('electron/pont.cts')).toContain("contextBridge.exposeInMainWorld('humalisFormes', {\n  recu: (cle: string): unknown => ipcRenderer.sendSync('humalis:forme:recu', cle),");
      expect(principal).toContain("ipcMain.on('humalis:forme:recu', (evenement, cle: unknown) => {");
      expect(principal).toContain("const permis = dansLApplication(evenement.senderFrame?.url ?? '') && typeof cle === 'string';");
      expect(principal).toContain("preload: join(ICI, 'pont.cjs')");
    });

    it('les actions vivent dans une page cachée qui lit fichier.nom, type et contenu, puis revient', () => {
      expect(fichiers.has('formes-humalis/1/index.html')).toBe(true);
      const couche = fichiers.get('src/couches/formes_humalis_1.js')!;
      expect(couche).toContain("const fichier = signal((globalThis.humalisFormes?.recu('formes-humalis-1:fichier') ?? adresse.donnees['formes-humalis-1:fichier']) ?? { nom: '', type: '', contenu: '' });");
      expect(couche).toMatch(/revenir\('\/'\)/);
    });

    it('une forme qui change déjà de page ne revient pas en arrière', () => {
      const autre = bureau(`quand on ouvre un fichier ".csv" :
    rediriger vers "accueil"
${ACCUEIL}`);
      expect(autre.get('src/couches/formes_humalis_1.js')).not.toContain('revenir(');
    });

    it('le contenu est du texte pour un texte, une adresse data: sinon', () => {
      expect(principal).toContain("const TYPES: Record<string, string> = {\"csv\":\"text/csv\",\"txt\":\"text/plain\"};");
      expect(principal).toContain('`data:${type};base64,${octets.toString(\'base64\')}`');
    });

    it('est refusé clairement quand les pages sont produites avec React', () => {
      const app = compile(`quand on ouvre un fichier ".csv" :
    afficher "x"
${ACCUEIL}`);
      expect(verifierFormesBureau(app, false).map((d) => d.gravite)).toEqual(['erreur']);
      expect(verifierFormesBureau(app, true)).toEqual([]);
    });
  });

  describe('lancer au démarrage de l’ordinateur', () => {
    const fichiers = bureau(`lancer au demarrage de l'ordinateur avec discret
${ACCUEIL}`);
    const principal = fichiers.get('electron/principal.ts')!;

    it('Mac et Windows : les éléments d’ouverture ; Linux : un fichier .desktop d’autostart', () => {
      expect(principal).toContain("app.setLoginItemSettings({ openAtLogin: actif, ...(process.platform === 'win32' ? { args: [ARGUMENT_DEMARRAGE] } : {}) });");
      expect(principal).toContain("join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'autostart', 'formes.desktop')");
      expect(principal).toContain("'X-GNOME-Autostart-enabled=true'");
      expect(principal).toContain('process.env.APPIMAGE ?? process.execPath');
    });

    it('posé à la première ouverture de l’application installée, puis par la case du menu', () => {
      expect(principal).toContain('if (!app.isPackaged && !process.env.HUMALIS_ESSAI_DEMARRAGE) return;');
      expect(principal).toContain("label: \"Lancer au démarrage de l'ordinateur\", type: 'checkbox', checked: demarrageActif()");
      expect(principal).toContain('...elementsDuDemarrage(),');
    });

    it('« avec discret » : sans fenêtre, une icône dans la barre même sans page', () => {
      expect(principal).toContain('if (lanceeAuDemarrage() && !false) {');
      expect(principal).toContain("{ titre: '', chemin: '', svg: '<svg");
      expect(principal).toContain('void poserLesIcones();');
    });

    it('sans « discret », la fenêtre s’ouvre comme d’habitude', () => {
      const p = bureau(`lancer au demarrage de l'ordinateur
${ACCUEIL}`).get('electron/principal.ts')!;
      expect(p).not.toContain('lanceeAuDemarrage() &&');
      expect(p).toContain('preparerDemarrage();\n    void poserLesIcones();\n    creerFenetre();');
    });
  });

  describe('le menu clic droit', () => {
    const source = `menu clic droit "Envoyer à 100 $" pour les fichiers ".jpg" et ".png" :
    afficher "Reçu {fichier.nom}"
${ACCUEIL}`;
    const fichiers = bureau(source);
    const principal = fichiers.get('electron/principal.ts')!;

    it('Windows : les clés de l’utilisateur, posées et retirées par l’installateur NSIS', () => {
      const nsh = fichiers.get('build/menus.nsh')!;
      expect(JSON.parse(fichiers.get('package.json')!).build.nsis).toEqual({ include: 'build/menus.nsh' });
      expect(nsh).toContain('!macro customInstall');
      expect(nsh).toContain('WriteRegStr HKCU "Software\\Classes\\SystemFileAssociations\\.jpg\\shell\\formes-1" "MUIVerb" "Envoyer à 100 $$"');
      expect(nsh).toContain(`WriteRegStr HKCU "Software\\Classes\\SystemFileAssociations\\.png\\shell\\formes-1\\command" "" '"$INSTDIR\\\${APP_EXECUTABLE_FILENAME}" --humalis-forme=1 "%1"'`);
      expect(nsh).toContain('!macro customUnInstall\n  DeleteRegKey HKCU "Software\\Classes\\SystemFileAssociations\\.jpg\\shell\\formes-1"');
    });

    it('Linux : Dolphin, Nemo et les scripts de Nautilus', () => {
      expect(principal).toContain("join(donnees, 'kio', 'servicemenus'");
      expect(principal).toContain("join(donnees, 'nemo', 'actions'");
      expect(principal).toContain("join(donnees, 'nautilus', 'scripts'");
      expect(principal).toContain('poserLesMenusLinux();');
    });

    it('l’argument --humalis-forme=N choisit le menu', () => {
      expect(principal).toContain("{ numero: 1, sorte: 'menu', chemin: '/formes-humalis/1', cle: 'formes-humalis-1:fichier', extensions: ['jpg', 'png'], titre: 'Envoyer à 100 $' },");
      expect(principal).toContain('const menu = /^--humalis-forme=(\\d+)$/.exec(argument);');
    });

    it('Mac : la limite du Finder est dite', () => {
      const app = compile(source);
      const [d] = verifierFormesBureau(app, true);
      expect(d!.gravite).toBe('avertissement');
      expect(d!.message).toContain('Finder');
    });
  });

  it('les formes qui agissent sont numérotées dans l’ordre : fichiers ouverts, puis menus', () => {
    const app = compile(`quand on ouvre un fichier ".csv" :
    afficher "a"

menu clic droit "B" pour les fichiers ".png" :
    afficher "b"
${ACCUEIL}`);
    expect(formesDuBureau(app).actions.map((a) => [a.numero, a.sorte, a.chemin])).toEqual([
      [1, 'fichier', '/formes-humalis/1'],
      [2, 'menu', '/formes-humalis/2'],
    ]);
  });

  it('sans forme, le processus principal ne change pas', () => {
    const p = bureau(ACCUEIL).get('electron/principal.ts')!;
    expect(p).not.toMatch(/Tray|open-file|setLoginItemSettings|humalisFormes/);
    expect(bureau(ACCUEIL).has('electron/pont.cts')).toBe(false);
  });
});
