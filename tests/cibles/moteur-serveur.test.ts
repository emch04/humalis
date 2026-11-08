import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { serveurJs } from '../../src/cibles/moteur/serveur.js';

const programme = `source "boutique" :
    adresse "https://boutique.exemple"
    enveloppe "data"
    erreur dans "message"
    session astratra
    donnee produit :
        id : texte
    route "api/produits" :
        lire une liste de produit dans "produits"

page "accueil" :
    titre "Bonjour"
`;

const compilation = compiler(programme);
const application = compilation.application!;
if (!application) throw new Error('le programme de test ne compile pas : ' + JSON.stringify(compilation.diagnostics));

const messages: [string, string, unknown?][] = [];
const signalUrl = 'data:text/javascript,' + encodeURIComponent('export const signal = (v) => ({ get v() { return v; }, set v(n) { v = n; } });');
const outilsUrl = 'data:text/javascript,' + encodeURIComponent("export const afficherMessage = (...args) => globalThis.__messages.push(args);");
const clientUrl = 'data:text/javascript,' + encodeURIComponent(`export class SessionExpiredError extends Error {}
export const createSessionClient = ({ request, refresh }) => ({ call: async (_chemin, lancer) => {
  try { return await request('', lancer); }
  catch (erreur) { if (erreur.status !== 401) throw erreur; await refresh(); return request('', lancer); }
} });`);

async function charger(code: string) {
  const prepare = code
    .replace("'./moteur.js'", JSON.stringify(signalUrl))
    .replace("'./outils.js'", JSON.stringify(outilsUrl))
    .replace("'@astratra/client'", JSON.stringify(clientUrl))
    .replaceAll('import.meta.env', '({})');
  return import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(prepare)}#${Math.random()}`) as Promise<any>;
}

function reponse(corps: unknown, statut = 200, entetes: Record<string, string> = {}) {
  return new Response(JSON.stringify(corps), { status: statut, headers: entetes });
}

afterEach(() => { vi.unstubAllGlobals(); messages.length = 0; });

describe('serveur du moteur', () => {
  it('omet les sources et la session absentes du programme', () => {
    const simple = compiler('page "accueil" :\n    titre "Bonjour"\n').application!;
    const code = serveurJs({ application: simple, session: false, sessionDuServeur: false });
    expect(code).not.toContain('const SOURCES =');
    expect(code).not.toContain('export const utilisateur');
    expect(code).not.toContain('export async function televerser');
  });

  it('charge un module simple et partage deux lectures simultanées', async () => {
    vi.stubGlobal('__messages', messages);
    vi.stubGlobal('document', { cookie: 'astratra_csrf=jeton%20test' });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
    const fetch = vi.fn().mockResolvedValue(reponse([{ id: 1 }], 200, { 'Cache-Control': 'public, max-age=30' }));
    vi.stubGlobal('fetch', fetch);
    const code = serveurJs({ application, session: false, sessionDuServeur: false });
    expect(code).not.toContain("from 'react'");
    expect(code).not.toContain('export const utilisateur');
    expect(code).not.toContain('export async function televerser');
    const module = await charger(code);
    const [a, b] = await Promise.all([module.serveur.lire('/api/produits', []), module.serveur.lire('/api/produits', [])]);
    expect([a, b]).toEqual([[{ id: 1 }], [{ id: 1 }]]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(module.derniereRequete('liste')()).toBe(true);
    const premiere = module.derniereRequete('liste');
    module.derniereRequete('liste');
    expect(premiere()).toBe(false);
  });

  it('envoie le CSRF, garde la valeur en échec et compte les refus', async () => {
    vi.stubGlobal('__messages', messages);
    vi.stubGlobal('document', { cookie: 'astratra_csrf=jeton%20test' });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
    const fetch = vi.fn().mockResolvedValueOnce(reponse({ erreur: 'prix invalide' }, 400));
    vi.stubGlobal('fetch', fetch);
    const { serveur } = await charger(serveurJs({ application, session: false, sessionDuServeur: false }));
    expect(await serveur.envoyer('/api/produits', { prix: 4 }, { ancien: true })).toEqual({ ancien: true });
    expect(fetch.mock.calls[0][1].headers.get('x-csrf-token')).toBe('jeton test');
    expect(fetch.mock.calls[0][1].body).toBe('{"prix":4}');
    expect(serveur.raison()).toBe('Prix invalide.');
    expect(serveur.echecs()).toBe(1);
    expect(messages).toEqual([['Prix invalide.', 'erreur', undefined]]);
  });

  it('lit une source avec enveloppe, filtre, état et cookies', async () => {
    vi.stubGlobal('__messages', messages);
    vi.stubGlobal('document', { cookie: 'astratra_csrf=abc' });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
    const fetch = vi.fn().mockResolvedValue(reponse({ data: { produits: [{ id: 2 }] } }));
    vi.stubGlobal('fetch', fetch);
    const { serveur, REPOS } = await charger(serveurJs({ application, session: false, sessionDuServeur: false }));
    const etats: unknown[] = [];
    const valeur = await serveur.lire('api/produits', [], { source: 'boutique', filtres: { categorie: 'livres', vide: null }, dans: 'produits', suivi: (etat: unknown) => etats.push(etat) });
    expect(valeur).toEqual([{ id: 2 }]);
    expect(fetch.mock.calls[0][0]).toBe('https://boutique.exemple/api/produits?categorie=livres');
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
    expect(etats).toEqual([{ statut: 'chargement', message: '' }, REPOS]);
  });

  it('met à jour les accesseurs réactifs de la session', async () => {
    vi.stubGlobal('__messages', messages);
    vi.stubGlobal('document', { cookie: '' });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse({ data: { id: 'u1', email: 'a@b.fr', role: 'admin' } })));
    const code = serveurJs({ application, session: true, sessionDuServeur: false });
    const { utilisateur, relireSession } = await charger(code);
    expect(utilisateur.pret).toBe(false);
    await relireSession();
    expect(utilisateur.personne.id).toBe('u1');
    expect(utilisateur.pret).toBe(true);
    expect(utilisateur.connecte).toBe(true);
    expect(utilisateur.admin).toBe(true);
  });

  it('garde la valeur sur un 404 local et donne la phrase du 401', async () => {
    vi.stubGlobal('__messages', messages);
    vi.stubGlobal('document', { cookie: '' });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reponse({}, 404)).mockResolvedValueOnce(reponse({}, 401)));
    const { serveur } = await charger(serveurJs({ application, session: false, sessionDuServeur: false }));
    expect(await serveur.lire('/api/absent', ['ancien'])).toEqual(['ancien']);
    expect(serveur.echecs()).toBe(0);
    expect(await serveur.lire('/api/prive', null)).toBeNull();
    expect(serveur.raison()).toBe('Connectez-vous pour continuer.');
    expect(messages).toEqual([['Connectez-vous pour continuer.', 'erreur', undefined]]);
  });

  it('partage puis garde la lecture d’une source et signale son 404', async () => {
    vi.stubGlobal('__messages', messages);
    vi.stubGlobal('document', { cookie: '' });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
    const avecCache = structuredClone(application);
    avecCache.sources[0].cache = 30;
    avecCache.sources[0].essais = 0;
    const fetch = vi.fn().mockResolvedValueOnce(reponse({ data: { produits: [1] } })).mockResolvedValueOnce(reponse({}, 404));
    vi.stubGlobal('fetch', fetch);
    const { serveur } = await charger(serveurJs({ application: avecCache, session: false, sessionDuServeur: false }));
    const options = { source: 'boutique', dans: 'produits' };
    expect(await serveur.lire('api/produits', [], options)).toEqual([1]);
    expect(await serveur.lire('api/produits', [], options)).toEqual([1]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const etats: unknown[] = [];
    expect(await serveur.lire('api/absent', ['ancien'], { source: 'boutique', suivi: (etat: unknown) => etats.push(etat) })).toEqual(['ancien']);
    expect(etats.at(-1)).toEqual({ statut: 'introuvable', message: "Ce que vous cherchez n'existe pas." });
    expect(serveur.echecs()).toBe(1);
  });

  it('renouvelle une session locale sur 401 avant de relire', async () => {
    vi.stubGlobal('__messages', messages);
    vi.stubGlobal('document', { cookie: '' });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    const sansSource = compiler('page "accueil" :\n    titre "Bonjour"\n').application!;
    const fetch = vi.fn()
      .mockResolvedValueOnce(reponse({}, 401))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(reponse([{ id: 3 }]));
    vi.stubGlobal('fetch', fetch);
    const { serveur } = await charger(serveurJs({ application: sansSource, session: true, sessionDuServeur: true }));
    expect(await serveur.lire('/api/produits', [])).toEqual([{ id: 3 }]);
    expect(fetch.mock.calls.map((appel) => appel[0])).toEqual(['/api/produits', '/auth/refresh', '/api/produits']);
    expect(messages).toEqual([]);
  });

  it('réessaie une lecture de source, jamais un envoi refusé', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('__messages', messages);
      vi.stubGlobal('document', { cookie: '' });
      vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
      const avecEssai = structuredClone(application);
      avecEssai.sources[0].essais = 1;
      const fetch = vi.fn()
        .mockResolvedValueOnce(reponse({}, 503))
        .mockResolvedValueOnce(reponse({ data: { produits: [2] } }))
        .mockResolvedValueOnce(reponse({ message: 'refusé' }, 503));
      vi.stubGlobal('fetch', fetch);
      const { serveur } = await charger(serveurJs({ application: avecEssai, session: false, sessionDuServeur: false }));
      const lecture = serveur.lire('api/produits', [], { source: 'boutique', dans: 'produits' });
      await vi.runAllTimersAsync();
      expect(await lecture).toEqual([2]);
      expect(await serveur.envoyer('api/produits', { nom: 'x' }, null, { source: 'boutique', silencieux: true })).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(messages).toEqual([]);
    } finally { vi.useRealTimers(); }
  });

  it('téléverse un fichier avec progression et le CSRF de la source', async () => {
    vi.stubGlobal('__messages', messages);
    vi.stubGlobal('document', { cookie: 'astratra_csrf=photo%20jeton' });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
    const fichier = compiler(readFileSync('exemples/fichier.humalis', 'utf8')).application!;
    expect(fichier).toBeDefined();
    class Xhr {
      static dernier: Xhr;
      upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
      onload?: () => void;
      responseText = '{"data":{"fichier":"/photos/1.jpg"}}';
      status = 201;
      withCredentials = false;
      timeout = 0;
      entetes = new Map<string, string>();
      constructor() { Xhr.dernier = this; }
      open(_methode: string, _adresse: string) {}
      setRequestHeader(nom: string, valeur: string) { this.entetes.set(nom, valeur); }
      send(_corps: unknown) { this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 }); this.onload?.(); }
    }
    vi.stubGlobal('XMLHttpRequest', Xhr);
    const { televerser } = await charger(serveurJs({ application: fichier, session: false, sessionDuServeur: false }));
    expect(televerser).toBeTypeOf('function');
    const progression: number[] = [];
    const suivi: unknown[] = [];
    const choisi = { nom: 'photo.jpg', brut: new Blob(['a'], { type: 'image/jpeg' }) };
    expect(await televerser(choisi, 'api/shop/photos', { source: 'boutique', corpsBrut: true, progression: (n: number) => progression.push(n), suivi: (e: unknown) => suivi.push(e) }, null)).toBe('/photos/1.jpg');
    expect(Xhr.dernier.entetes.get('x-csrf-token')).toBe('photo jeton');
    expect(Xhr.dernier.withCredentials).toBe(true);
    expect(progression).toEqual([0, 50, 100]);
    expect(suivi.at(-1)).toEqual({ statut: 'repos', message: '' });
  });

  it('respecte le silence et le message 429 de la source', async () => {
    vi.stubGlobal('__messages', messages);
    vi.stubGlobal('document', { cookie: '' });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
    const sansEssai = structuredClone(application);
    sansEssai.sources[0].essais = 0;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reponse({}, 429)).mockResolvedValueOnce(reponse({}, 429)));
    const { serveur } = await charger(serveurJs({ application: sansEssai, session: false, sessionDuServeur: false }));
    serveur.taire(true);
    expect(await serveur.lire('api/produits', [], { source: 'boutique' })).toEqual([]);
    expect(serveur.raison()).toBe('Trop de demandes en peu de temps. Patientez un moment, puis réessayez.');
    expect(messages).toEqual([]);
    serveur.taire(false);
    await serveur.lire('api/produits', [], { source: 'boutique' });
    expect(messages).toEqual([['Trop de demandes en peu de temps. Patientez un moment, puis réessayez.', 'erreur', undefined]]);
  });

  it('réduit une image choisie avant de l’envoyer en JSON', async () => {
    vi.stubGlobal('__messages', messages);
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
    const toile = { width: 0, height: 0, getContext: () => ({ fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }), toDataURL: () => 'data:image/jpeg;base64,photo' };
    vi.stubGlobal('document', { cookie: '', createElement: () => toile });
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 960, height: 480 }));
    const fetch = vi.fn().mockResolvedValue(reponse({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    const { serveur } = await charger(serveurJs({ application, session: false, sessionDuServeur: false }));
    const brut = new File(['photo'], 'photo.png', { type: 'image/png' });
    await serveur.envoyer('/api/produits', { photo: { brut } }, null);
    expect([toile.width, toile.height]).toEqual([480, 240]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ photo: 'data:image/jpeg;base64,photo' });
  });

  it('force une lecture fraîche après un envoi sur la même route', async () => {
    vi.stubGlobal('__messages', messages);
    vi.stubGlobal('document', { cookie: '' });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
    const fetch = vi.fn()
      .mockResolvedValueOnce(reponse([1], 200, { 'Cache-Control': 'public, max-age=30' }))
      .mockResolvedValueOnce(reponse({ id: 2 }))
      .mockResolvedValueOnce(reponse([1, 2]));
    vi.stubGlobal('fetch', fetch);
    const { serveur } = await charger(serveurJs({ application, session: false, sessionDuServeur: false }));
    await serveur.lire('/api/produits', []);
    await serveur.envoyer('/api/produits', { id: 2 }, null);
    expect(await serveur.lire('/api/produits', [])).toEqual([1, 2]);
    expect(fetch.mock.calls[2][1].cache).toBe('no-cache');
  });

  it('applique le jeton public et le remplacement PUT d’une source', async () => {
    vi.stubGlobal('__messages', messages);
    vi.stubGlobal('document', { cookie: 'astratra_csrf=csrf' });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
    const avecJeton = structuredClone(application);
    avecJeton.sources[0].jetonPublic = { valeur: 'public', place: { genre: 'parametre', nom: 'cle' } };
    const fetch = vi.fn().mockResolvedValueOnce(reponse({ data: { id: 'a b' } })).mockResolvedValueOnce(reponse({ data: { id: 'a b' } }));
    vi.stubGlobal('fetch', fetch);
    const { serveur } = await charger(serveurJs({ application: avecJeton, session: false, sessionDuServeur: false }));
    expect(await serveur.lireUn('api/produits/:id', 'a b', null, { source: 'boutique' })).toEqual({ id: 'a b' });
    await serveur.modifier('api/produits/:id', 'a b', { nom: 'Livre' }, { source: 'boutique', remplacement: true });
    expect(fetch.mock.calls.map((appel) => appel[0])).toEqual([
      'https://boutique.exemple/api/produits/a%20b?cle=public',
      'https://boutique.exemple/api/produits/a%20b?cle=public',
    ]);
    expect(fetch.mock.calls[1][1].method).toBe('PUT');
    expect(fetch.mock.calls[1][1].headers.get('x-csrf-token')).toBe('csrf');
  });

  it('effectue la connexion, les actions du compte et la déconnexion', async () => {
    vi.stubGlobal('__messages', messages);
    vi.stubGlobal('document', { cookie: 'astratra_csrf=abc' });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
    const replaceState = vi.fn();
    vi.stubGlobal('window', { location: { hash: '#jeton=lien', pathname: '/', search: '' }, history: { replaceState } });
    const fetch = vi.fn((adresse: string) => {
      if (adresse.endsWith('/auth/me')) return Promise.resolve(reponse({ data: { id: 'u1', role: 'membre' } }));
      return Promise.resolve(reponse({ ok: true }));
    });
    vi.stubGlobal('fetch', fetch);
    const { utilisateur } = await charger(serveurJs({ application, session: true, sessionDuServeur: false }));
    expect(await utilisateur.seConnecter('a@b.fr', 'secret')).toBe(true);
    expect(utilisateur.connecte).toBe(true);
    expect(await utilisateur.inviter('b@c.fr', 'membre')).toBe(true);
    expect(await utilisateur.demanderLienMotDePasse('a@b.fr')).toBe(true);
    expect(await utilisateur.choisirMotDePasse('nouveau')).toBe(true);
    expect(await utilisateur.changerMotDePasse('ancien', 'nouveau')).toBe(true);
    await utilisateur.seDeconnecter();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
    expect(fetch.mock.calls.some((appel) => appel[0] === 'https://boutique.exemple/auth/logout')).toBe(true);
    expect(fetch.mock.calls.find((appel) => appel[0] === 'https://boutique.exemple/auth/login')?.[1].headers.get('x-csrf-token')).toBe('abc');
  });
});
