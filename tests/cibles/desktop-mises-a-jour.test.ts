import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { genererProjetDesktop, VERSIONS_DESKTOP } from '../../src/cibles/desktop/projet.js';

const desktop = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return genererProjetDesktop(application!, { nom: 'essai', source: 'essai.humalis' });
};

describe('cible desktop — les installateurs et les mises à jour automatiques', () => {
  it('construit un .dmg pour Mac et un .exe (NSIS) pour Windows', () => {
    const { build } = JSON.parse(desktop(readFileSync('exemples/boutique.humalis', 'utf8')).get('package.json')!);
    expect(build.mac.target).toContain('dmg');
    expect(build.win.target).toEqual([{ target: 'nsis', arch: ['x64'] }]);
  });

  it('sans adresse dans le bloc « site », pas de mise à jour automatique', () => {
    const fichiers = desktop('page "accueil" :\n    titre "Bonjour"\n');
    const paquet = JSON.parse(fichiers.get('package.json')!);
    expect(paquet.dependencies).toBeUndefined();
    expect(paquet.build.publish).toBeUndefined();
    expect(fichiers.get('electron/principal.ts')).not.toContain('electron-updater');
    expect(fichiers.get('electron/principal.ts')).not.toContain('verifierLesMisesAJour');
    expect(fichiers.get('LISEZMOI.md')).toContain("l'application ne cherche pas de mise à");
  });

  it('avec l’adresse du bloc « site », electron-updater cherche les versions dans mises-a-jour/', () => {
    const fichiers = desktop('site :\n    nom "Ma boutique"\n    adresse "https://exemple.org/"\n\npage "accueil" :\n    titre "Bonjour"\n');
    const paquet = JSON.parse(fichiers.get('package.json')!);
    expect(paquet.dependencies).toEqual({ 'electron-updater': VERSIONS_DESKTOP.electronUpdater });
    expect(paquet.build.publish).toEqual([{ provider: 'generic', url: 'https://exemple.org/mises-a-jour/' }]);
    const principal = fichiers.get('electron/principal.ts')!;
    expect(principal).toContain("import electronUpdater from 'electron-updater';");
    // Seulement l'application installée, et seulement si electron-builder a écrit app-update.yml.
    expect(principal).toContain("if (!app.isPackaged || !existsSync(join(process.resourcesPath, 'app-update.yml'))) return;");
    expect(principal).toContain('autoUpdater.checkForUpdatesAndNotify(');
    expect(principal).toContain("autoUpdater.on('error'");
    expect(principal).toMatch(/creerFenetre\(\);\n {4}verifierLesMisesAJour\(\);/);
    expect(fichiers.get('LISEZMOI.md')).toContain('https://exemple.org/mises-a-jour/');
  });

  it('n’active pas les mises à jour pour une adresse locale en http://', () => {
    const fichiers = desktop('site :\n    adresse "http://localhost:4000"\n\npage "accueil" :\n    titre "Bonjour"\n');
    expect(JSON.parse(fichiers.get('package.json')!).build.publish).toBeUndefined();
  });
});
