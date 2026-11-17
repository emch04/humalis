import { describe, expect, it } from 'vitest';
import { stripTypeScriptTypes } from 'node:module';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { verifierFormesPourLaCible } from '../src/cibles/formes.js';
import { captureClient, codeCaptureNavigateur } from '../src/cibles/capture-erreurs.js';

const SOURCE = `quand une erreur arrive :
    envoyer requete vers "https://erreurs.exemple.fr/v1/envoi" avec message = erreur.message et pile = erreur.pile
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
        envoyer requete vers "https://erreurs.exemple.fr/v1/envoi" avec message = erreur.message et pile = erreur.pile
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
    expect([...android.values()].find((x) => x.includes('object CaptureErreurs'))).toContain('en_attente');
    // Les lignes Humalis : la pile et erreur.ligne passent par la table HumalisLignes.kt, écrite avec le projet.
    expect([...android.values()].find((x) => x.includes('object CaptureErreurs'))).toContain('put("ligne", HumalisLignes.ligne(exception))');
    expect([...android.keys()].some((c) => c.endsWith('/HumalisLignes.kt'))).toBe(true);
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
    const code = codeCaptureNavigateur(captureClient(application.formes));
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
    const source = `serveur "api" :\n    quand une erreur arrive :\n        envoyer requete vers "https://erreurs.exemple.fr/v1/envoi" avec message = erreur.message et pile = erreur.pile\npage "accueil" :\n    titre "Accueil"`;
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
    const envoi = 'envoyer requete vers "https://erreurs.exemple.fr/v1/envoi" avec page = erreur.page et version = erreur.version';
    const source = `serveur "s" :\n    quand une erreur arrive :\n        ${envoi}\n    donnee note :\n        titre : texte\n    route "notes" :\n        connecte peut lire note\n        connecte peut creer note\n        connecte peut modifier note\n        connecte peut supprimer note\n\nquand une erreur arrive :\n    ${envoi}\n\npage "accueil" :\n    titre "Essai"\n`;
    const { diagnostics } = compiler(source);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  });
});

/**
 * « jeton secret depuis l'environnement "…" » et « vers l'environnement "…" » (17 novembre 2026) : n'importe quel système
 * de suivi se branche, même s'il demande une clé. La clé et l'adresse restent dans le .env du serveur : les pages et les
 * applications envoient leur rapport au serveur, qui ajoute la clé et refait la requête.
 */
const AVEC_CLE = `quand une erreur arrive :
    jeton secret depuis l'environnement "ERREURS_CLE" dans l'entete "X-Cle"
    envoyer requete vers l'environnement "ERREURS_ADRESSE" avec message = erreur.message et pile = erreur.pile et source = "application"
serveur "api" :
    quand une erreur arrive :
        jeton secret depuis l'environnement "SUIVI_CLE"
        envoyer requete vers l'environnement "SUIVI_ADRESSE" avec message = erreur.message et ligne = erreur.ligne
    donnee note :
        titre : texte
    route "notes" :
        tout le monde peut lire note
page "accueil" :
    titre "Accueil"
`;
const erreursDe = (source: string) => compiler(source).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message);

describe('capture avec une clé secrète', () => {
  it('lit le jeton et l’adresse du .env, dans l’application comme dans le serveur', () => {
    const resultat = compiler(AVEC_CLE);
    expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const application = resultat.application!;
    expect(application.formes?.erreurArrive?.jeton).toEqual({ genre: 'secret', valeur: 'ERREURS_CLE', place: { genre: 'entete', nom: 'X-Cle' } });
    expect(application.formes?.erreurArrive?.ecran.gestionnaires[0]?.actions[0]).toMatchObject({ type: 'requete', adresse: '', adresseEnvironnement: 'ERREURS_ADRESSE' });
    const serveur = application.serveurs[0]!;
    expect(serveur.jetonErreurs).toEqual({ genre: 'secret', valeur: 'SUIVI_CLE', place: { genre: 'autorisation' } });
    expect(serveur.captureErreurs).toMatchObject([{ type: 'requete', adresse: '', adresseEnvironnement: 'SUIVI_ADRESSE' }]);
    // Le serveur refait la requête des pages : seulement les champs de l'erreur et le texte fixe écrit.
    expect(serveur.relaisErreurs).toEqual([{ adresse: '', adresseEnvironnement: 'ERREURS_ADRESSE', champs: [{ nom: 'message', valeur: 'message' }, { nom: 'pile', valeur: 'pile' }, { nom: 'source', valeur: { texte: 'application' } }], jeton: { genre: 'secret', valeur: 'ERREURS_CLE', place: { genre: 'entete', nom: 'X-Cle' } } }]);
  });

  it('refuse une clé ou une adresse du .env sans serveur, et un nom de variable mal formé', () => {
    const sansServeur = `quand une erreur arrive :\n    jeton secret depuis l'environnement "ERREURS_CLE"\n    envoyer requete vers l'environnement "ERREURS_ADRESSE" avec message = erreur.message\npage "accueil" :\n    titre "Accueil"\n`;
    expect(erreursDe(sansServeur)).toEqual([
      'une clé secrète ne peut pas être dans l\'application : ajoutez un serveur (serveur "api" :), qui l\'ajoutera à chaque rapport.',
      'une adresse lue dans le .env l\'est par le serveur : ajoutez un serveur (serveur "api" :), qui fera suivre chaque rapport.',
    ]);
    expect(erreursDe(AVEC_CLE.replace('"ERREURS_CLE"', '"erreurs-cle"'))).toEqual(['« erreurs-cle » n\'est pas un nom de variable d\'environnement : des majuscules, des chiffres et « _ », comme "ERREURS_CLE".']);
    expect(erreursDe(AVEC_CLE.replace('"SUIVI_ADRESSE"', '"suivi adresse"'))).toEqual(['« suivi adresse » n\'est pas un nom de variable d\'environnement : des majuscules, des chiffres et « _ », comme "ERREURS_CLE".']);
  });

  it('refuse un jeton écrit deux fois, un secret écrit en clair, et une adresse du .env hors capture', () => {
    expect(erreursDe(AVEC_CLE.replace('dans l\'entete "X-Cle"\n', 'dans l\'entete "X-Cle"\n    jeton public "pk_1"\n'))[0]).toContain('le jeton de « quand une erreur arrive » est déjà écrit ligne 2');
    expect(erreursDe(AVEC_CLE.replace('jeton secret depuis l\'environnement "SUIVI_CLE"', 'jeton secret "abc"'))[0]).toContain('un jeton secret ne s\'écrit jamais dans le fichier');
    const horsCapture = `serveur "api" :\n    donnee note :\n        titre : texte\n    route "notes" :\n        tout le monde peut creer note\npage "accueil" :\n    quand la page se charge :\n        envoyer requete vers l'environnement "NOTES" avec titre = "a"\n`;
    expect(erreursDe(horsCapture)).toEqual(['« vers l\'environnement "…" » s\'écrit seulement dans « quand une erreur arrive » : ailleurs, l\'adresse s\'écrit entre guillemets.']);
  });

  it('aucune application ne contient la clé ni l’adresse du .env : chacune envoie son rapport au serveur', async () => {
    const { genererProjetAndroid } = await import('../src/cibles/android/projet.js');
    const { genererProjetApple } = await import('../src/cibles/apple/projet.js');
    const { genererProjetWindows } = await import('../src/cibles/windows/projet.js');
    const { genererProjetDesktop } = await import('../src/cibles/desktop/projet.js');
    const application = compiler(AVEC_CLE).application!;
    const options = { nom: 'Essai', source: 'essai.humalis' };
    const projets = {
      web: genererProjetWeb(application, options),
      moteur: genererProjetMoteur(application, options),
      statique: genererProjetStatique(application, options),
      android: genererProjetAndroid(application, options).fichiers,
      apple: genererProjetApple(application, options).fichiers,
      windows: genererProjetWindows(application, options).fichiers,
      bureau: genererProjetDesktop(application, options),
    };
    for (const [cible, fichiers] of Object.entries(projets)) {
      const tout = [...fichiers.values()].join('\n');
      expect(tout, cible).not.toMatch(/ERREURS_CLE|ERREURS_ADRESSE|X-Cle/);
      expect(tout, cible).toContain('/humalis/erreurs');
    }
    expect(projets.web.get('src/humalis/capture-erreurs.ts')).toContain(`fetch((import.meta.env.VITE_HUMALIS_SERVEUR ?? '') + "/humalis/erreurs", { method: 'POST', credentials: 'omit', headers: { 'content-type': 'text/plain' }`);
    expect(projets.moteur.get('src/humalis/moteur.js')).toContain("window.humalisServeur ??= import.meta.env.VITE_HUMALIS_SERVEUR ?? '';");
    expect([...projets.apple.values()].find((x) => x.includes('enum CaptureErreurs'))).toContain('let adresseServeur = Serveur.base');
    expect([...projets.apple.values()].find((x) => x.includes('enum CaptureErreurs'))).toContain('URL(string: adresseServeur + "/humalis/erreurs")');
    expect([...projets.apple.keys()].some((k) => k.endsWith('Humalis/Serveur.swift'))).toBe(true);
    expect([...projets.android.values()].find((x) => x.includes('object CaptureErreurs'))).toContain('URL(Configuration.SERVEUR + "/humalis/erreurs")');
    expect(projets.windows.get('Humalis/CaptureErreurs.cs')).toContain('Configuration.Serveur.TrimEnd(\'/\') + "/humalis/erreurs"');
    expect(projets.bureau.get('electron/principal.ts')).toContain("'/humalis/erreurs'");
    expect(projets.bureau.get('electron/capture-erreurs.ts')).toContain("import { app } from 'electron';");
  });

  it('un jeton public part de l’application elle-même, dans l’en-tête ou l’adresse demandés', () => {
    const source = (place: string) => `quand une erreur arrive :\n    jeton public "pk_essai"${place}\n    envoyer requete vers "https://erreurs.exemple.fr/v1/envoi?projet=1" avec message = erreur.message\npage "accueil" :\n    titre "Accueil"\n`;
    expect(captureClient(compiler(source('')).application!.formes)).toEqual({ directs: [{ adresse: 'https://erreurs.exemple.fr/v1/envoi?projet=1', entetes: { Authorization: 'Bearer pk_essai' }, champs: [{ nom: 'message', valeur: 'message' }] }], relais: false });
    expect(captureClient(compiler(source(' dans l\'entete "X-Projet"')).application!.formes).directs[0]!.entetes).toEqual({ 'X-Projet': 'pk_essai' });
    expect(captureClient(compiler(source(' dans le parametre "cle"')).application!.formes).directs[0]!.adresse).toBe('https://erreurs.exemple.fr/v1/envoi?projet=1&cle=pk_essai');
    expect(codeCaptureNavigateur(captureClient(compiler(source('')).application!.formes))).toContain('"Authorization": "Bearer pk_essai"');
  });

  it('le serveur relaie sur « POST /humalis/erreurs » et lit sa propre clé dans le .env', async () => {
    const { genererProjetServeur } = await import('../src/cibles/serveur/projet.js');
    const fichiers = genererProjetServeur(compiler(AVEC_CLE).application!.serveurs[0]!, { nom: 'Essai', source: 'essai.humalis' });
    const principal = fichiers.get('src/serveur.ts')!;
    expect(principal).toContain("import { relaisErreurs } from './humalis/relais-erreurs.js';");
    expect(principal).toContain("avant.post('/humalis/erreurs', ...relaisErreurs);");
    expect(fichiers.get('.env.exemple')).toContain('SUIVI_ADRESSE=\nSUIVI_CLE=\nERREURS_ADRESSE=\nERREURS_CLE=\n');
    const capture = fichiers.get('src/humalis/capture-erreurs.ts')!;
    expect(capture).toContain('await envoyer({ adresse: "", adresseEnvironnement: "SUIVI_ADRESSE", jeton: {"genre":"secret","valeur":"SUIVI_CLE","place":{"genre":"autorisation"}} }, { "message": erreur.message, "ligne": erreur.ligne });');
    // Sans relais ni clé, rien de nouveau n'est écrit.
    const simple = genererProjetServeur(compiler(`serveur "api" :\n    donnee note :\n        titre : texte\n    route "notes" :\n        tout le monde peut lire note\npage "accueil" :\n    titre "Accueil"\n`).application!.serveurs[0]!, { nom: 'Essai', source: 'essai.humalis' });
    expect(simple.has('src/humalis/relais-erreurs.ts')).toBe(false);
    expect([...simple.values()].join('\n')).not.toContain('/humalis/erreurs');
  });

  it('dans un projet en services, le service des comptes relaie, et l’entrée lui envoie /humalis/erreurs', async () => {
    const { tableDesChemins } = await import('../src/cibles/serveur/entree.js');
    const source = `quand une erreur arrive :\n    jeton secret depuis l'environnement "ERREURS_CLE"\n    envoyer requete vers "https://erreurs.exemple.fr/v1" avec message = erreur.message\nserveur "catalogue" :\n    comptes du serveur "comptes"\n    donnee produit :\n        nom : texte\n    route "produits" :\n        tout le monde peut lire produit\nserveur "comptes" :\n    donnee client :\n        nom : texte\n    route "clients" :\n        connecte peut lire client\npage "accueil" :\n    titre "Accueil"\n`;
    const resultat = compiler(source);
    expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const serveurs = resultat.application!.serveurs;
    expect(serveurs.find((s) => s.nom === 'comptes')!.relaisErreurs).toHaveLength(1);
    expect(serveurs.find((s) => s.nom === 'catalogue')!.relaisErreurs).toBeUndefined();
    expect(tableDesChemins(serveurs)).toContainEqual({ chemin: '/humalis/erreurs', service: 'comptes' });
  });
});

describe('relais des rapports en exécution', () => {
  /** Le module produit, traduit en JavaScript ; express.text est remplacé (le corps arrive déjà en texte). */
  async function relais(env: Record<string, string>) {
    const { codeRelaisErreurs } = await import('../src/cibles/serveur/capture-erreurs.js');
    const serveur = compiler(AVEC_CLE).application!.serveurs[0]!;
    // Node retire lui-même les types (TypeScript 7 n'a plus d'API JavaScript).
    const code = stripTypeScriptTypes(codeRelaisErreurs(serveur.relaisErreurs!).replace("import express, { type RequestHandler } from 'express';", 'const express = { text: () => (_req: unknown, _res: unknown, suite: () => void) => suite() };')).replace('export const relaisErreurs', 'module.exports.relaisErreurs');
    const appels: { url: string; options: { headers: Record<string, string>; body: string } }[] = [];
    const avertissements: string[] = [];
    const module = { exports: {} as { relaisErreurs: ((req: unknown, res: unknown, suite?: () => void) => void)[] } };
    new Function('module', 'exports', 'process', 'fetch', 'console', 'AbortSignal', 'URL', code)(module, module.exports, { env }, async (url: URL, options: never) => { appels.push({ url: String(url), options }); return { ok: true }; }, { warn: (m: string) => avertissements.push(m) }, AbortSignal, URL);
    const recevoir = async (corps: string, ip = '1.2.3.4') => {
      let statut = 0;
      const res = { status: (s: number) => { statut = s; return res; }, end: () => res };
      module.exports.relaisErreurs[1]!({ ip, body: corps }, res);
      await new Promise((r) => setTimeout(r, 0));
      return statut;
    };
    return { recevoir, appels, avertissements };
  }

  it('ajoute la clé et l’adresse du .env, n’envoie que les champs écrits, refuse le reste', async () => {
    const { recevoir, appels, avertissements } = await relais({ ERREURS_ADRESSE: 'https://suivi.exemple.fr/api/1/envoi', ERREURS_CLE: 'cle-tres-secrete' });
    expect(avertissements).toEqual([]);
    expect(await recevoir(JSON.stringify({ message: 'Panne', pile: 'a\nb', adresse: 'https://ailleurs.exemple.fr', page: '/x' }))).toBe(204);
    expect(appels).toHaveLength(1);
    expect(appels[0]!.url).toBe('https://suivi.exemple.fr/api/1/envoi');
    expect(appels[0]!.options.headers).toEqual({ 'content-type': 'application/json', 'X-Cle': 'cle-tres-secrete' });
    expect(JSON.parse(appels[0]!.options.body)).toEqual({ message: 'Panne', pile: 'a\nb', source: 'application' });
    expect(await recevoir('pas du JSON')).toBe(400);
    expect(await recevoir(JSON.stringify({ pile: 'sans message' }))).toBe(400);
    expect(await recevoir(JSON.stringify([1]))).toBe(400);
    expect(appels).toHaveLength(1);
  });

  it('limite à 30 rapports par minute et par adresse', async () => {
    const { recevoir } = await relais({ ERREURS_ADRESSE: 'https://suivi.exemple.fr/e', ERREURS_CLE: 'c' });
    const statuts: number[] = [];
    for (let i = 0; i < 31; i++) statuts.push(await recevoir(JSON.stringify({ message: 'm' + i })));
    expect(statuts.slice(0, 30).every((s) => s === 204)).toBe(true);
    expect(statuts[30]).toBe(429);
    expect(await recevoir(JSON.stringify({ message: 'autre' }), '5.6.7.8')).toBe(204);
  });

  it('sans adresse, sans clé ou avec une adresse non HTTPS, rien ne part, et le démarrage le dit', async () => {
    const sans = await relais({});
    expect(sans.avertissements).toHaveLength(2);
    expect(sans.avertissements[0]).toContain('ERREURS_ADRESSE');
    expect(await sans.recevoir(JSON.stringify({ message: 'Panne' }))).toBe(204);
    const http = await relais({ ERREURS_ADRESSE: 'http://suivi.exemple.fr', ERREURS_CLE: 'c' });
    await http.recevoir(JSON.stringify({ message: 'Panne' }));
    const sansCle = await relais({ ERREURS_ADRESSE: 'https://suivi.exemple.fr' });
    await sansCle.recevoir(JSON.stringify({ message: 'Panne' }));
    expect([...sans.appels, ...http.appels, ...sansCle.appels]).toEqual([]);
  });
});
