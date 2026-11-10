import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demarrer, type MachineLancee } from '../src/machine/lancer.js';
import { CLIENT_MACHINE_JS, CLIENT_SESSION_JS } from '../src/machine/client.js';
import { SERVICE_WORKER_JS } from '../src/machine/apercu.js';
import { PANNEAU_HTML } from '../src/machine/panneau.js';
import { programme } from './analyse/aide.js';

const SOURCE = programme(
  'serveur "boutique" :',
  '>donnee produit :',
  '>>nom : texte',
  '>route "produits" :',
  '>>tout le monde peut lire produit',
  '>donnees de depart pour produit :',
  '>>nom "Café"',
  '',
  'page "accueil" :',
  '>titre "Première version"',
);

let lancee: MachineLancee | undefined;
let dossier: string | undefined;
afterEach(async () => {
  await lancee?.arreter();
  lancee = undefined;
  if (dossier) rmSync(dossier, { recursive: true, force: true });
  dossier = undefined;
});

const attendre = async (condition: () => Promise<boolean> | boolean, delai = 3000) => {
  const fin = Date.now() + delai;
  while (Date.now() < fin) {
    if (await condition()) return true;
    await new Promise((ok) => setTimeout(ok, 40));
  }
  return false;
};

describe('humalis lancer : de bout en bout', () => {
  it('sert l\'application sur un vrai port, recharge à l\'enregistrement et n\'écrit rien', async () => {
    dossier = mkdtempSync(join(tmpdir(), 'humalis-lancer-'));
    const fichier = join(dossier, 'app.humalis');
    writeFileSync(fichier, SOURCE);
    const dits: string[] = [];
    lancee = await demarrer(fichier, { port: 0, ouvrir: false, dire: (m) => dits.push(m) });
    expect(lancee).toBeDefined();
    const base = lancee!.adresse;

    const page = await (await fetch(`${base}/`)).text();
    expect(page).toContain('Première version');
    const produits = await (await fetch(`${base}/api/produits`)).json();
    expect(produits).toMatchObject([{ nom: 'Café' }]);
    expect(dits.join('\n')).toMatch(/Comptes d'essai/);
    expect(dits.join('\n')).toMatch(/admin@machine\.humalis/);

    // Le flux des événements prévient la page ; l'enregistrement la recharge en moins d'une seconde.
    const reponse = await fetch(`${base}/__machine/evenements`);
    const lecteur = reponse.body!.getReader();
    const recu: string[] = [];
    void (async () => { const dec = new TextDecoder(); for (;;) { const { value, done } = await lecteur.read(); if (done) return; recu.push(dec.decode(value)); } })();
    const debut = Date.now();
    writeFileSync(fichier, SOURCE.replace('Première version', 'Deuxième version'));
    expect(await attendre(async () => (await (await fetch(`${base}/`)).text()).includes('Deuxième version'), 1500)).toBe(true);
    expect(Date.now() - debut).toBeLessThan(1000);
    expect(await attendre(() => recu.join('').includes('"type":"recharger"'))).toBe(true);
    await lecteur.cancel();

    // Une faute : la page garde l'ancienne version et reçoit l'erreur avec sa ligne.
    writeFileSync(fichier, SOURCE.replace('titre "Première version"', 'titre'));
    expect(await attendre(() => dits.join('\n').includes('Le programme a des erreurs'))).toBe(true);
    expect((await (await fetch(`${base}/`)).text())).toContain('Deuxième version');

    // Rien n'a été écrit à côté du fichier : ni projet, ni dossier caché.
    expect(readdirSync(dossier)).toEqual(['app.humalis']);
  });

  it('ne répond qu\'à localhost (une attaque par DNS « rebinding » est refusée)', async () => {
    dossier = mkdtempSync(join(tmpdir(), 'humalis-lancer-'));
    const fichier = join(dossier, 'app.humalis');
    writeFileSync(fichier, SOURCE);
    lancee = await demarrer(fichier, { port: 0, ouvrir: false, dire: () => undefined });
    const { request } = await import('node:http');
    const statut = await new Promise<number>((ok, echec) => {
      const r = request({ host: '127.0.0.1', port: lancee!.port, path: '/api/produits', headers: { host: 'pirate.example' } }, (res) => { res.resume(); ok(res.statusCode ?? 0); });
      r.on('error', echec);
      r.end();
    });
    expect(statut).toBe(403);
  });

  it('refuse un fichier absent en le disant', async () => {
    const dits: string[] = [];
    expect(await demarrer(join(tmpdir(), 'nexiste-pas.humalis'), { port: 0, ouvrir: false, dire: (m) => dits.push(m) })).toBeUndefined();
    expect(dits.join('')).toMatch(/Impossible de lire/);
  });
});

describe('les scripts de la machine', () => {
  it('sont du JavaScript valide', () => {
    for (const [nom, code] of [['client', CLIENT_MACHINE_JS], ['service worker', SERVICE_WORKER_JS]]) {
      expect(() => new Function(code), nom).not.toThrow();
    }
    // Le client de session est un module : on vérifie qu'il s'évalue une fois les exports retirés.
    expect(() => new Function(CLIENT_SESSION_JS.replace(/^export /gm, ''))).not.toThrow();
    const script = /<script>([\s\S]*)<\/script>/.exec(PANNEAU_HTML)![1];
    expect(() => new Function(script)).not.toThrow();
  });

  it('le client de session renouvelle une fois sur 401, puis rend SessionExpiredError', async () => {
    const { createSessionClient, SessionExpiredError } = await import(`data:text/javascript;base64,${Buffer.from(CLIENT_SESSION_JS).toString('base64')}`);
    let renouvelle = 0;
    let essais = 0;
    const client = createSessionClient({
      request: async (_c: string, lancer: () => Promise<string>) => { essais++; if (essais === 1) throw Object.assign(new Error('401'), { status: 401 }); return lancer(); },
      refresh: async () => { renouvelle++; },
    });
    expect(await client.call('', async () => 'ok')).toBe('ok');
    expect(renouvelle).toBe(1);
    const mort = createSessionClient({ request: async () => { throw Object.assign(new Error('401'), { status: 401 }); }, refresh: async () => { throw new Error('non'); } });
    await expect(mort.call('', async () => 'x')).rejects.toBeInstanceOf(SessionExpiredError);
  });
});
