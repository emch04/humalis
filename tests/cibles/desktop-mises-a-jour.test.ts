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

  it('« mises a jour depuis "https://…" » donne l’adresse sans bloc « site » : une application sans site public se met à jour aussi', () => {
    const fichiers = desktop('mises a jour depuis "https://telechargements.exemple.fr/boutique"\n\npage "accueil" :\n    titre "Bonjour"\n');
    const paquet = JSON.parse(fichiers.get('package.json')!);
    expect(paquet.dependencies).toEqual({ 'electron-updater': VERSIONS_DESKTOP.electronUpdater });
    expect(paquet.build.publish).toEqual([{ provider: 'generic', url: 'https://telechargements.exemple.fr/boutique/' }]);
    expect(fichiers.get('electron/principal.ts')).toMatch(/creerFenetre\(\);\n {4}verifierLesMisesAJour\(\);/);
    const lisezmoi = fichiers.get('LISEZMOI.md')!;
    expect(lisezmoi).toContain('https://telechargements.exemple.fr/boutique/');
    expect(lisezmoi).toContain('mises a jour depuis');
  });

  it('la phrase passe avant l’adresse du bloc « site », et se lit avec ses accents et une barre à la fin', () => {
    const fichiers = desktop('mises à jour depuis "https://versions.exemple.fr/"\n\nsite :\n    nom "Ma boutique"\n    adresse "https://exemple.org/"\n\npage "accueil" :\n    titre "Bonjour"\n');
    expect(JSON.parse(fichiers.get('package.json')!).build.publish).toEqual([{ provider: 'generic', url: 'https://versions.exemple.fr/' }]);
  });

  it('refuse une adresse qui n’est pas en https, qui porte un mot de passe ou une question, et la phrase écrite deux fois', () => {
    const erreurs = (source: string) => compiler(source + '\npage "accueil" :\n    titre "Bonjour"\n').diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message);
    expect(erreurs('mises a jour depuis "http://exemple.fr/versions"')[0]).toMatch(/https:\/\//);
    expect(erreurs('mises a jour depuis "https://moi:secret@exemple.fr/versions"')[0]).toMatch(/https:\/\//);
    expect(erreurs('mises a jour depuis "https://exemple.fr/versions?cle=1"')[0]).toMatch(/https:\/\//);
    expect(erreurs('mises a jour depuis "versions"')[0]).toMatch(/https:\/\//);
    expect(erreurs('mises a jour "https://exemple.fr/versions"')[0]).toMatch(/depuis/);
    expect(erreurs('mises a jour depuis')[0]).toMatch(/adresse/);
    expect(erreurs('mises a jour depuis "https://a.exemple.fr"\nmises a jour depuis "https://b.exemple.fr"')[0]).toMatch(/une fois/);
  });

  it('sans adresse, le LISEZMOI dit la phrase à écrire', () => {
    const fichiers = desktop('page "accueil" :\n    titre "Bonjour"\n');
    expect(fichiers.get('LISEZMOI.md')).toContain('mises a jour depuis "https://');
  });

  it('les autres cibles ne s’en soucient pas : la phrase ne change ni le web ni le serveur', async () => {
    const { genererProjetMoteur } = await import('../../src/cibles/moteur/projet.js');
    const sans = compiler('page "accueil" :\n    titre "Bonjour"\n').application!;
    const avec = compiler('mises a jour depuis "https://telechargements.exemple.fr/boutique"\n\npage "accueil" :\n    titre "Bonjour"\n').application!;
    const options = { nom: 'essai', source: 'essai.humalis' };
    expect([...genererProjetMoteur(avec, options)].map(([nom, contenu]) => [nom, contenu.replace(/\n/g, '').length > 0])).toEqual([...genererProjetMoteur(sans, options)].map(([nom, contenu]) => [nom, contenu.replace(/\n/g, '').length > 0]));
  });

  it('n’active pas les mises à jour pour une adresse locale en http://', () => {
    const fichiers = desktop('site :\n    adresse "http://localhost:4000"\n\npage "accueil" :\n    titre "Bonjour"\n');
    expect(JSON.parse(fichiers.get('package.json')!).build.publish).toBeUndefined();
  });
});
