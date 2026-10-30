import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TELEVERSER_TS } from '../src/cibles/web/fichiers.js';

/** Le code produit, compilé tel quel puis exécuté face à un faux XMLHttpRequest. */
let televerser: (choisi: unknown, adresse: string, options: Record<string, unknown>, actuelle: unknown) => Promise<unknown>;

interface Requete {
  methode: string;
  url: string;
  entetes: Record<string, string>;
  credentials: boolean;
  corps: unknown;
}
const requetes: Requete[] = [];
/** Ce que le faux serveur répond à la prochaine requête. */
let reponse: { statut: number; corps: string } | 'coupure' = { statut: 201, corps: '{}' };

class FauxXHR {
  upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  status = 0;
  responseText = '';
  withCredentials = false;
  timeout = 0;
  private requete: Requete = { methode: '', url: '', entetes: {}, credentials: false, corps: undefined };
  open(methode: string, url: string) {
    this.requete.methode = methode;
    this.requete.url = url;
  }
  setRequestHeader(nom: string, valeur: string) {
    this.requete.entetes[nom.toLowerCase()] = valeur;
  }
  send(corps: unknown) {
    this.requete.corps = corps;
    this.requete.credentials = this.withCredentials;
    requetes.push(this.requete);
    setTimeout(() => {
      if (reponse === 'coupure') return this.onerror?.();
      for (const fraction of [0.25, 0.5, 1]) this.upload.onprogress?.({ lengthComputable: true, loaded: fraction * 100, total: 100 });
      this.status = reponse.statut;
      this.responseText = reponse.corps;
      this.onload?.();
    }, 0);
  }
}

beforeAll(async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'humalis-televerser-'));
  const sources = `export const REPOS = { statut: 'repos', message: '' };
export const SOURCES = { boutique: { base: 'http://api.test', session: true, enveloppe: 'data', erreur: 'message', entetes: { 'X-App': 'oui' }, jeton: undefined, essais: 2, delai: 10, cache: 0 } };`;
  writeFileSync(join(dossier, 'sources.ts'), sources);
  // Node retire les types tout seul : le code produit est exécuté tel qu'il est écrit.
  writeFileSync(join(dossier, 'televerser.ts'), TELEVERSER_TS.replace("'./sources'", "'./sources.ts'"));
  (globalThis as any).XMLHttpRequest = FauxXHR;
  (globalThis as any).document = { cookie: 'a=1; astratra_csrf=jeton%20csrf' };
  (globalThis as any).FormData = class {
    champs: [string, unknown, string?][] = [];
    append(nom: string, valeur: unknown, fichier?: string) {
      this.champs.push([nom, valeur, fichier]);
    }
  };
  televerser = (await import(pathToFileURL(join(dossier, 'televerser.ts')).href)).televerser;
});

afterEach(() => {
  requetes.length = 0;
  reponse = { statut: 201, corps: '{}' };
});

const fichier = (nom = 'moi.png') => ({ nom, taille: 100, type: 'image', apercu: null, brut: { type: 'image/png', name: nom } });
const OK = JSON.stringify({ success: true, data: { fichier: '/televersements/abc.png' } });

describe('televerser — le code produit, exécuté', () => {
  it('rend le champ « fichier » de la réponse, sous l’enveloppe de la source', async () => {
    reponse = { statut: 201, corps: OK };
    const valeur = await televerser(fichier(), 'api/shop/photos', { source: 'boutique', corpsBrut: true }, null);
    expect(valeur).toBe('/televersements/abc.png');
  });
  it('rend toute la réponse quand elle n’a pas de champ « fichier »', async () => {
    reponse = { statut: 200, corps: JSON.stringify({ data: 'https://cdn.test/a.png' }) };
    expect(await televerser(fichier(), 'photos', { source: 'boutique', corpsBrut: true }, null)).toBe('https://cdn.test/a.png');
  });
  it('la progression passe par des valeurs croissantes, de 0 à 100', async () => {
    reponse = { statut: 201, corps: OK };
    const vues: number[] = [];
    await televerser(fichier(), 'photos', { source: 'boutique', corpsBrut: true, progression: (n: number) => vues.push(n) }, null);
    expect(vues).toEqual([0, 25, 50, 100, 100]);
    expect([...vues].sort((a, b) => a - b)).toEqual(vues);
  });
  it('envoie le corps brut avec son type, la session et le jeton CSRF', async () => {
    reponse = { statut: 201, corps: OK };
    const choisi = fichier();
    await televerser(choisi, 'api/shop/photos', { source: 'boutique', corpsBrut: true }, null);
    const [requete] = requetes;
    expect(requete.methode).toBe('POST');
    expect(requete.url).toBe('http://api.test/api/shop/photos');
    expect(requete.corps).toBe(choisi.brut);
    expect(requete.entetes['content-type']).toBe('image/png');
    expect(requete.entetes['x-csrf-token']).toBe('jeton csrf');
    expect(requete.entetes['x-app']).toBe('oui');
    expect(requete.credentials).toBe(true);
  });
  it('envoie un formulaire sous le nom de champ demandé', async () => {
    reponse = { statut: 201, corps: OK };
    await televerser(fichier('a.png'), 'photos', { source: 'boutique', champ: 'image' }, null);
    expect((requetes[0].corps as { champs: unknown[] }).champs).toEqual([['image', { type: 'image/png', name: 'a.png' }, 'a.png']]);
    expect(requetes[0].entetes['content-type']).toBeUndefined();
  });
  it('un refus de l’API (415) montre le message de l’API et garde la valeur actuelle', async () => {
    reponse = { statut: 415, corps: JSON.stringify({ success: false, message: 'Photo refusée : JPEG, PNG ou WebP seulement.' }) };
    const messages: string[] = [];
    const etats: unknown[] = [];
    const valeur = await televerser(fichier(), 'photos', { source: 'boutique', corpsBrut: true, message: (t: string) => messages.push(t), suivi: (e: unknown) => etats.push(e) }, 'avant');
    expect(valeur).toBe('avant');
    expect(messages).toEqual(['Photo refusée : JPEG, PNG ou WebP seulement.']);
    expect(etats).toEqual([{ statut: 'chargement', message: '' }, { statut: 'erreur', message: 'Photo refusée : JPEG, PNG ou WebP seulement.' }]);
  });
  it('une page qui parle elle-même de l’erreur n’affiche pas de message', async () => {
    reponse = { statut: 415, corps: JSON.stringify({ message: 'Non.' }) };
    const messages: string[] = [];
    await televerser(fichier(), 'photos', { source: 'boutique', silencieux: true, message: (t: string) => messages.push(t) }, null);
    expect(messages).toEqual([]);
  });
  it('une coupure du réseau donne un message clair, et rien n’est rejoué', async () => {
    reponse = 'coupure';
    const messages: string[] = [];
    const valeur = await televerser(fichier(), 'photos', { source: 'boutique', message: (t: string) => messages.push(t) }, 'avant');
    expect(valeur).toBe('avant');
    expect(messages).toEqual(["Le serveur n'a pas répondu. Réessayez dans un instant."]);
    expect(requetes).toHaveLength(1);
  });
  it('une session coupée (401) invite à se connecter', async () => {
    reponse = { statut: 401, corps: '{}' };
    const messages: string[] = [];
    await televerser(fichier(), 'photos', { source: 'boutique', message: (t: string) => messages.push(t) }, null);
    expect(messages).toEqual(['Connectez-vous pour continuer.']);
  });
  it('sans fichier choisi, rien n’est envoyé', async () => {
    const messages: string[] = [];
    const valeur = await televerser(null, 'photos', { source: 'boutique', message: (t: string) => messages.push(t) }, 'avant');
    expect(valeur).toBe('avant');
    expect(requetes).toHaveLength(0);
    expect(messages).toEqual(["Choisissez d'abord un fichier."]);
  });
  it('plusieurs fichiers : un envoi après l’autre, une adresse par fichier', async () => {
    reponse = { statut: 201, corps: OK };
    const vues: number[] = [];
    const valeur = await televerser([fichier('a.png'), fichier('b.png')], 'photos', { source: 'boutique', corpsBrut: true, progression: (n: number) => vues.push(n) }, []);
    expect(requetes).toHaveLength(2);
    expect(valeur).toEqual(['/televersements/abc.png', '/televersements/abc.png']);
    expect(vues.at(-1)).toBe(100);
    expect(vues).toContain(75);
  });
});
