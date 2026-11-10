/**
 * La synchronisation de bout en bout : le vrai moteur des appareils contre le vrai code du serveur produit.
 * Deux appareils, des horloges différentes, des coupures de réseau, des conflits et des suppressions.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { genererProjetServeur } from '../../src/cibles/serveur/projet.js';
import { DONNEES_LOCALES_JS } from '../../src/cibles/commun/donnees-comptes-web.js';
import type { ServeurRI } from '../../src/ri/types.js';

const serveurRI: ServeurRI = {
  nom: 'carnet',
  donnees: [{ nom: 'note', champs: [{ nom: 'titre', type: { genre: 'texte' } }, { nom: 'lu', type: { genre: 'booleen' } }] }],
  routes: [{ adresse: 'notes', donnee: 'note', droits: { lire: 'connecte', creer: 'connecte', modifier: 'connecte', supprimer: 'connecte' }, synchronisee: true, ligne: 1 }],
} as unknown as ServeurRI;

type Fiche = { id?: string; titre: string; lu: boolean };
let dossier: string;
let synchroMod: any;
let stockageMod: any;
let clientMod: any;

beforeAll(async () => {
  mkdirSync('node_modules/.essais', { recursive: true });
  dossier = mkdtempSync(join(process.cwd(), 'node_modules/.essais/synchro-'));
  const fichiers = genererProjetServeur(serveurRI, { nom: 'carnet', source: 'notes.humalis' });
  writeFileSync(join(dossier, 'synchro.ts'), fichiers.get('src/humalis/synchro.ts')!);
  writeFileSync(join(dossier, 'stockage.ts'), fichiers.get('src/humalis/stockage.ts')!);
  writeFileSync(join(dossier, 'client.mjs'), DONNEES_LOCALES_JS);
  synchroMod = await import(/* @vite-ignore */ join(dossier, 'synchro.ts'));
  stockageMod = await import(/* @vite-ignore */ join(dossier, 'stockage.ts'));
  clientMod = await import(/* @vite-ignore */ join(dossier, 'client.mjs'));
});
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

/** Le serveur : la vraie synchronisation, et une route qui fait ce que font les routes produites. */
function leServeur() {
  const horloge = { v: 1_000_000 };
  const journal = synchroMod.creerJournalMemoire(() => horloge.v);
  const stockage = stockageMod.creerStockageMemoire();
  journal.suivre('note', stockage, []);
  const synchro = synchroMod.creerSynchro(journal, { env: {}, horloge: () => horloge.v });
  const routeur = {
    async handle(req: any, res: any) {
      const id = decodeURIComponent(req.url.slice(1));
      if (req.method === 'GET') {
        const f = await stockage.trouver(id);
        if (f) res.json(f);
        else res.status(404).json({ erreur: 'introuvable' });
      } else if (req.body?.titre === 'interdit') res.status(400).json({ erreur: 'ce titre est interdit' });
      else if (req.method === 'POST') res.status(201).json(await stockage.creer(req.body));
      else if (req.method === 'PATCH') res.json(await stockage.modifier(id, req.body));
      else if (await stockage.supprimer(id)) res.status(204).end();
      else res.status(404).json({ erreur: 'introuvable' });
    },
  };
  return { horloge, journal, stockage, synchro, routeur, panne: { apresEnvoi: false } };
}

/** Un appareil : sa base (en mémoire ici), son horloge, son réseau. */
async function unAppareil(s: ReturnType<typeof leServeur>, decalage = 0) {
  const memoire = { fiches: new Map<string, any>(), file: new Map<string, any>(), curseur: 0 };
  const base = {
    lire: async () => structuredClone({ fiches: [...memoire.fiches.values()], file: [...memoire.file.values()], curseur: memoire.curseur }),
    appliquer: async (e: any) => {
      for (const f of e.fiches) memoire.fiches.set(f.id, structuredClone(f));
      for (const id of e.retirees) memoire.fiches.delete(id);
      for (const id of e.envoyees) memoire.file.delete(id);
      for (const l of e.file) memoire.file.set(l.id, structuredClone(l));
      if (e.curseur !== undefined) memoire.curseur = e.curseur;
    },
  };
  const appareil = { liste: [] as Fiche[], enLigne: true, messages: [] as string[], memoire, coeur: null as any };
  const reseau = {
    lire: async (chemin: string) => {
      if (!appareil.enLigne) throw new TypeError('hors ligne');
      const requete = Object.fromEntries(new URLSearchParams(chemin.split('?')[1]));
      return { ok: true, statut: 200, corps: structuredClone(await s.synchro.lire('note', requete, null)) };
    },
    envoyer: async (_chemin: string, corps: unknown) => {
      if (!appareil.enLigne) throw new TypeError('hors ligne');
      const req = { body: structuredClone(corps), headers: {}, baseUrl: '/api/notes', user: { id: 'awa' } };
      const reponse = await s.synchro.envoyer('note', s.stockage, s.routeur, req);
      if (s.panne.apresEnvoi) {
        s.panne.apresEnvoi = false;
        throw new TypeError('coupure pendant la réponse');
      }
      return { ok: true, statut: 200, corps: structuredClone(reponse) };
    },
  };
  appareil.coeur = clientMod.creerCoeur({
    champs: ['titre', 'lu'],
    route: '/api/notes',
    transport: reseau,
    lire: () => appareil.liste,
    ecrire: (l: Fiche[]) => { appareil.liste = l; },
    signaler: (m: unknown) => appareil.messages.push(String(m)),
    maintenant: () => s.horloge.v + decalage,
  });
  await appareil.coeur.ouvrir(base);
  const changer = async (liste: Fiche[]) => { appareil.liste = liste; appareil.coeur.observer(liste); await appareil.coeur.fini(); };
  return { ...appareil, get liste() { return appareil.liste; }, changer, set enLigne(v: boolean) { appareil.enLigne = v; }, synchroniser: () => appareil.coeur.synchroniser(), titres: () => appareil.liste.map((f) => f.titre) };
}

describe('la synchronisation de bout en bout', () => {
  it('une fiche créée sur un appareil arrive sur l’autre, avec le même identifiant', async () => {
    const s = leServeur();
    const a = await unAppareil(s), b = await unAppareil(s);
    await a.changer([{ titre: 'Un', lu: false }]);
    await a.synchroniser();
    await b.synchroniser();
    expect(b.titres()).toEqual(['Un']);
    expect(b.liste[0]!.id).toBe(a.liste[0]!.id);
  });

  it('hors ligne : les écritures restent, partent au retour, et rien n’est perdu', async () => {
    const s = leServeur();
    const a = await unAppareil(s), b = await unAppareil(s);
    a.enLigne = false;
    await a.changer([{ titre: 'Hors ligne 1', lu: false }]);
    await a.changer([...a.liste, { titre: 'Hors ligne 2', lu: true }]);
    await expect(a.synchroniser()).rejects.toThrow('hors ligne');
    expect(a.memoire.file.size).toBe(2);
    expect((await s.stockage.lister()).length).toBe(0);
    a.enLigne = true;
    await a.synchroniser();
    expect(a.memoire.file.size).toBe(0);
    await b.synchroniser();
    expect(b.titres().sort()).toEqual(['Hors ligne 1', 'Hors ligne 2']);
  });

  it('conflit : la modification la plus récente l’emporte, selon l’horloge du serveur, même d’un appareil en retard', async () => {
    const s = leServeur();
    // B retarde d'une heure : sans correction, sa modification récente passerait pour ancienne.
    const a = await unAppareil(s), b = await unAppareil(s, -3_600_000);
    await a.changer([{ titre: 'Départ', lu: false }]);
    await a.synchroniser();
    await b.synchroniser();
    a.enLigne = false;
    b.enLigne = false;
    s.horloge.v += 1000;
    await a.changer([{ ...a.liste[0]!, titre: 'Ancienne (A)' }]);
    s.horloge.v += 1000;
    await b.changer([{ ...b.liste[0]!, titre: 'Récente (B)' }]);
    s.horloge.v += 1000;
    b.enLigne = true;
    await b.synchroniser();
    // A revient après B, avec une modification plus ancienne : elle perd, et A prend la version de B.
    a.enLigne = true;
    await a.synchroniser();
    expect(a.titres()).toEqual(['Récente (B)']);
    expect(b.titres()).toEqual(['Récente (B)']);
    expect((await s.stockage.lister())[0].titre).toBe('Récente (B)');
  });

  it('suppression : elle se propage ; une modification plus ancienne ne fait pas revenir la fiche', async () => {
    const s = leServeur();
    const a = await unAppareil(s), b = await unAppareil(s);
    await a.changer([{ titre: 'À supprimer', lu: false }]);
    await a.synchroniser();
    await b.synchroniser();
    b.enLigne = false;
    s.horloge.v += 1000;
    await b.changer([{ ...b.liste[0]!, titre: 'Modifiée hors ligne' }]);
    s.horloge.v += 1000;
    await a.changer([]);
    await a.synchroniser();
    expect(await s.stockage.lister()).toEqual([]);
    s.horloge.v += 1000;
    b.enLigne = true;
    await b.synchroniser();
    expect(b.liste).toEqual([]);
    expect(await s.stockage.lister()).toEqual([]);
  });

  it('une modification plus récente qu’une suppression fait revenir la fiche', async () => {
    const s = leServeur();
    const a = await unAppareil(s), b = await unAppareil(s);
    await a.changer([{ titre: 'Vit', lu: false }]);
    await a.synchroniser();
    await b.synchroniser();
    b.enLigne = false;
    s.horloge.v += 1000;
    await a.changer([]);
    await a.synchroniser();
    s.horloge.v += 1000;
    await b.changer([{ ...b.liste[0]!, titre: 'Encore vivante' }]);
    s.horloge.v += 1000;
    b.enLigne = true;
    await b.synchroniser();
    await a.synchroniser();
    expect(a.titres()).toEqual(['Encore vivante']);
  });

  it('idempotence : une coupure après le travail du serveur, l’envoi rejoué ne double rien', async () => {
    const s = leServeur();
    const a = await unAppareil(s);
    await a.changer([{ titre: 'Une fois', lu: false }]);
    s.panne.apresEnvoi = true;
    await expect(a.synchroniser()).rejects.toThrow('coupure');
    expect(a.memoire.file.size).toBe(1);
    await a.synchroniser();
    expect(await s.stockage.lister()).toHaveLength(1);
    expect(a.memoire.file.size).toBe(0);
  });

  it('une fiche créée et supprimée hors ligne ne quitte jamais l’appareil', async () => {
    const s = leServeur();
    const a = await unAppareil(s);
    a.enLigne = false;
    await a.changer([{ titre: 'Éphémère', lu: false }]);
    await a.changer([]);
    expect(a.memoire.file.size).toBe(0);
    a.enLigne = true;
    await a.synchroniser();
    expect(await s.stockage.lister()).toEqual([]);
  });

  it('un refus du serveur annule la modification locale et le dit', async () => {
    const s = leServeur();
    const a = await unAppareil(s);
    await a.changer([{ titre: 'Acceptée', lu: false }]);
    await a.synchroniser();
    await a.changer([{ ...a.liste[0]!, titre: 'interdit' }, { titre: 'interdit', lu: false }]);
    await a.synchroniser();
    expect(a.titres()).toEqual(['Acceptée']);
    expect(a.messages).toContain('ce titre est interdit');
  });

  it('un appareil absent plus longtemps que la mémoire des suppressions repart proprement, sans perdre son attente', async () => {
    const s = leServeur();
    const a = await unAppareil(s), b = await unAppareil(s);
    await a.changer([{ titre: 'Ancienne', lu: false }, { titre: 'Reste', lu: false }]);
    await a.synchroniser();
    await b.synchroniser();
    await a.changer(a.liste.filter((f) => f.titre === 'Reste'));
    await a.synchroniser();
    // Encore quelques changements pour que le curseur de B soit sous le plancher.
    await a.changer([...a.liste, { titre: 'Autre', lu: false }]);
    await a.synchroniser();
    await a.changer(a.liste.filter((f) => f.titre !== 'Autre'));
    await a.synchroniser();
    s.horloge.v += 200 * 86_400_000;
    await s.journal.menage('note', s.horloge.v - 180 * 86_400_000);
    b.enLigne = false;
    await b.changer([...b.liste, { titre: 'En attente', lu: false }]);
    b.enLigne = true;
    await b.synchroniser();
    expect(b.titres().sort()).toEqual(['En attente', 'Reste']);
  });

  it('les pages et les curseurs : rien n’est manqué sur plusieurs pages', async () => {
    const s = leServeur();
    const a = await unAppareil(s), b = await unAppareil(s);
    await a.changer(Array.from({ length: 1200 }, (_, i) => ({ titre: `Note ${i}`, lu: false })));
    await a.synchroniser();
    await b.synchroniser();
    expect(b.liste).toHaveLength(1200);
  });

  it('un lot mal formé est refusé', async () => {
    const s = leServeur();
    const req = (body: unknown) => ({ body, headers: {}, baseUrl: '', user: { id: 'a' } });
    expect(await s.synchro.envoyer('note', s.stockage, s.routeur, req({ heure: 1, envois: [{ operation: 'x', id: 'y', modifieLe: 1 }] }))).toHaveProperty('erreur');
    expect(await s.synchro.envoyer('note', s.stockage, s.routeur, req({ envois: [] }))).toHaveProperty('erreur');
    expect(await s.synchro.envoyer('note', s.stockage, s.routeur, req({ heure: 1, envois: Array(201).fill({}) }))).toHaveProperty('erreur');
  });
});
