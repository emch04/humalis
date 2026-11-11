import { describe, expect, it } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { verifierFormesPourLaCible } from '../src/cibles/formes.js';
import { codeCaptureNavigateur, requetesCapture } from '../src/cibles/capture-erreurs.js';

const SOURCE = `quand une erreur arrive :
    envoyer requete vers "https://centrale.exemple.fr/v1/envoi" avec message = erreur.message et pile = erreur.pile
page "accueil" :
    titre "Accueil"
`;

describe('capture des erreurs', () => {
  it('analyse la forme et conserve ses actions dans la RI', () => {
    const resultat = compiler(SOURCE);
    expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(resultat.application?.formes?.erreurArrive?.ecran.gestionnaires[0]?.actions).toHaveLength(1);
    expect(resultat.application?.formes?.erreurArrive?.ecran.gestionnaires[0]?.actions[0]).toMatchObject({ type: 'requete', mode: 'envoyer', cles: ['message', 'pile'] });
  });
  it('lit la capture du serveur et sa requête HTTP', () => {
    const resultat = compiler(`serveur "api" :
    quand une erreur arrive :
        envoyer requete vers "https://centrale.exemple.fr/v1/envoi" avec message = erreur.message et pile = erreur.pile
page "accueil" :
    titre "Accueil"
`);
    expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(resultat.application?.serveurs[0]?.captureErreurs).toMatchObject([{ type: 'requete' }]);
  });
  it('branche la capture sur les trois sorties navigateur', () => {
    const app = compiler(SOURCE).application!;
    expect(verifierFormesPourLaCible(app, 'web').filter((d) => d.gravite === 'erreur')).toEqual([]);
    const options = { nom: 'Essai', source: 'essai.humalis' };
    const web = genererProjetWeb(app, options);
    expect(web.get('src/main.tsx')).toContain("import './humalis/capture-erreurs'");
    expect(web.get('src/humalis/capture-erreurs.ts')).toContain('window.onerror');
    const statique = genererProjetStatique(app, options);
    expect(statique.get('index.html')).toContain('capture-erreurs.js');
    const moteur = genererProjetMoteur(app, options);
    expect(moteur.get('index.html')).toContain('capture-erreurs.js');
  });
});

describe('captures natives produites', () => {
  it('branche Android, Apple, Windows et Electron', async () => {
    const { genererProjetAndroid } = await import('../src/cibles/android/projet.js');
    const { genererProjetApple } = await import('../src/cibles/apple/projet.js');
    const { genererProjetWindows } = await import('../src/cibles/windows/projet.js');
    const { genererProjetDesktop } = await import('../src/cibles/desktop/projet.js');
    const application = compiler(SOURCE).application!;
    const options = { nom: 'Essai', source: 'essai.humalis' };
    const android = genererProjetAndroid(application, options).fichiers;
    expect([...android.values()].find((x) => x.includes('Thread.setDefaultUncaughtExceptionHandler'))).toContain('en_attente');
    const apple = genererProjetApple(application, options).fichiers;
    expect([...apple.values()].find((x) => x.includes('NSSetUncaughtExceptionHandler'))).toContain('SIGSEGV');
    const windows = genererProjetWindows(application, options).fichiers;
    expect(windows.get('Humalis/CaptureErreurs.cs')).toContain('TaskScheduler.UnobservedTaskException');
    const bureau = genererProjetDesktop(application, options);
    expect(bureau.get('electron/capture-erreurs.ts')).toContain("process.on('uncaughtException'");
    expect(bureau.get('electron/principal.ts')).toContain('render-process-gone');
  });
  it('refuse une requête qui lit une donnée sensible', () => {
    const source = SOURCE.replace('message = erreur.message', 'password = erreur.message');
    const application = compiler(source).application!;
    expect(verifierFormesPourLaCible(application, 'web').some((d) => d.gravite === 'erreur')).toBe(true);
  });
});


describe('capture navigateur en exécution', () => {
  it('écoute les deux événements, borne le délai et limite une même erreur', async () => {
    const application = compiler(SOURCE).application!;
    const code = codeCaptureNavigateur(requetesCapture(application.formes).requetes);
    const appels: unknown[] = [];
    const evenements = new Map<string, (valeur: unknown) => void>();
    const fenetre = { onerror: null as null | ((message: string, source: string, ligne: number, colonne: number, erreur: Error) => boolean), addEventListener: (nom: string, fn: (valeur: unknown) => void) => evenements.set(nom, fn) };
    const envoyer = async (_adresse: string, options: unknown) => { appels.push(options); return { ok: true }; };
    new Function('window', 'location', 'fetch', 'AbortSignal', code)(fenetre, { pathname: '/accueil' }, envoyer, AbortSignal);
    expect(fenetre.onerror).toBeTypeOf('function');
    expect(evenements.has('unhandledrejection')).toBe(true);
    for (let i = 0; i < 4; i++) { fenetre.onerror!('Panne', '', 1, 1, new Error('Panne')); await new Promise((r) => setTimeout(r, 0)); }
    expect(appels).toHaveLength(3);
    expect((appels[0] as { signal: AbortSignal }).signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse((appels[0] as { body: string }).body)).toMatchObject({ message: 'Panne' });
  });
});

describe('serveur produit', () => {
  it('branche le processus, Express et une requête HTTPS bornée', async () => {
    const { genererProjetServeur } = await import('../src/cibles/serveur/projet.js');
    const source = `serveur "api" :\n    quand une erreur arrive :\n        envoyer requete vers "https://centrale.exemple.fr/v1/envoi" avec message = erreur.message et pile = erreur.pile\npage "accueil" :\n    titre "Accueil"`;
    const serveur = compiler(source).application!.serveurs[0]!;
    const fichiers = genererProjetServeur(serveur, { nom: 'Essai', source: 'essai.humalis' });
    const capture = fichiers.get('src/humalis/capture-erreurs.ts')!;
    expect(capture).toContain("process.on('uncaughtException'");
    expect(capture).toContain("process.on('unhandledRejection'");
    expect(capture).toContain('AbortSignal.timeout(3000)');
    expect(capture).toContain('dansLaCapture');
    expect(fichiers.get('src/serveur.ts') ?? [...fichiers.values()].find((x) => x.includes('brancherErreursProcessus()'))).toContain('brancherErreursProcessus()');
  });
});

describe('les champs de la variable erreur', () => {
  it('« erreur.page » se lit, et « page » peut nommer un champ envoyé, dans une page comme sur le serveur', () => {
    const envoi = 'envoyer requete vers "https://centrale.exemple.fr/v1/envoi" avec page = erreur.page et version = erreur.version';
    const source = `serveur "s" :\n    quand une erreur arrive :\n        ${envoi}\n    donnee note :\n        titre : texte\n    route "notes" :\n        connecte peut lire note\n        connecte peut creer note\n        connecte peut modifier note\n        connecte peut supprimer note\n\nquand une erreur arrive :\n    ${envoi}\n\npage "accueil" :\n    titre "Essai"\n`;
    const { diagnostics } = compiler(source);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  });
});
