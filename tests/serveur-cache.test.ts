import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { installerSiBesoin } from './aide-installation.js';

/**
 * « en cache pendant … », « vider le cache de "…" » et Redis (17 novembre 2026), sur un vrai serveur produit :
 * - en mémoire : une lecture gardée resservie, une écriture (route, action) qui la vide avant de répondre, une copie
 *   par compte quand la donnée est séparée, un résumé, et une API extérieure appelée une seule fois par la passerelle ;
 * - avec Redis (HUMALIS_ESSAI_REDIS et HUMALIS_ESSAI_POSTGRES) : deux exemplaires du serveur partagent le cache et les
 *   limites de requêtes, et une écriture sur l'un vide le cache de l'autre.
 */
const SOURCE = readFileSync(new URL('./serveur-cache.humalis', import.meta.url), 'utf8');

const SCENARIO = `
import { createServer } from 'node:http';
import { createMemoryUsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';

// Une API extérieure factice : elle compte ses appels et retient la clé reçue (ajoutée par la passerelle). Avec
// « ?echo=1 », elle renvoie sa clé dans sa réponse : la passerelle ne doit ni la transmettre ni la garder.
let appelsMeteo = 0;
let cleRecue = null;
const api = createServer((req, res) => {
  appelsMeteo++;
  const adresse = new URL(req.url, 'http://x');
  cleRecue = adresse.searchParams.get('key');
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jours: [{ jour: 'lundi', ...(adresse.searchParams.get('echo') ? { cle: cleRecue } : {}) }] }));
});
await new Promise((pret) => api.listen(0, '127.0.0.1', pret));
process.env.HUMALIS_SOURCE_METEO = 'http://127.0.0.1:' + api.address().port;
process.env.METEO_CLE = 'cle-essai-secrete';
// Une valeur qui n'est pas un entier (revue Codex : elle faisait tourner l'éviction sans fin) : la valeur par défaut la remplace.
process.env.HUMALIS_CACHE_MAX = '0.5';
const { creerServeur } = await import('./dist/src/serveur.js');
const { creerStockageMemoire } = await import('./dist/src/humalis/stockage.js');

const secret = 'Essai-Solide-2026!';
const usersStore = createMemoryUsersStore();
const passwordHash = await hashPassword(secret);
const ids = {};
for (const [email, role] of [['gerant@essai.test', 'gerant'], ['lecteur.a@essai.test', 'lecteur'], ['lecteur.b@essai.test', 'lecteur'], ['auteur@essai.test', 'lecteur']]) ids[email] = (await usersStore.create({ email, role, passwordHash })).id;
const { cacheHumalis, lieuDeLaBase } = await import('./dist/src/humalis/cache.js');
const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages: { livre: creerStockageMemoire(), note: creerStockageMemoire(), avis: creerStockageMemoire() } });
const ecoute = app.listen(0);
await new Promise((pret) => ecoute.once('listening', pret));
const base = 'http://127.0.0.1:' + ecoute.address().port;
const json = { 'content-type': 'application/json' };
const qui = async (email) => ({ ...json, authorization: 'Bearer ' + (await (await fetch(base + '/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email, password: secret }) })).json()).data.token });
const appel = async (methode, chemin, entetes = json, corps) => {
  const reponse = await fetch(base + chemin, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) });
  return { statut: reponse.status, garde: reponse.headers.get('x-humalis-cache') === 'garde', corps: await reponse.json().catch(() => null) };
};
const [gerant, a, b] = await Promise.all(['gerant', 'lecteur.a', 'lecteur.b'].map((n) => qui(n + '@essai.test')));
const r = {};
r.livres1 = await appel('GET', '/api/livres');
r.livres2 = await appel('GET', '/api/livres');
r.cree = await appel('POST', '/api/livres', gerant, { titre: 'Neuf', prix: 12 });
r.livres3 = await appel('GET', '/api/livres');
r.livres4 = await appel('GET', '/api/livres');
r.solde = await appel('PATCH', '/api/livres/faire/solder/' + r.cree.corps.id, gerant, {});
r.livres5 = await appel('GET', '/api/livres');
r.resume1 = await appel('GET', '/api/livres/resume', gerant);
r.resume2 = await appel('GET', '/api/livres/resume', gerant);
await appel('POST', '/api/livres', gerant, { titre: 'Autre', prix: 30 });
r.resume3 = await appel('GET', '/api/livres/resume', gerant);
r.resumeLecteur = await appel('GET', '/api/livres/resume', a);
await appel('POST', '/api/notes', a, { texte: 'de A' });
await appel('POST', '/api/notes', b, { texte: 'de B' });
r.notesA1 = await appel('GET', '/api/notes', a);
r.notesB1 = await appel('GET', '/api/notes', b);
r.notesA2 = await appel('GET', '/api/notes', a);
r.notesB2 = await appel('GET', '/api/notes', b);
r.meteo1 = await appel('GET', '/api/passerelle/meteo/previsions');
r.meteo2 = await appel('GET', '/api/passerelle/meteo/previsions', a);
r.appelsApresDeux = appelsMeteo;
r.cleRecue = cleRecue;
r.meteoAutre = await appel('GET', '/api/passerelle/meteo/previsions?ville=lyon');
r.appelsApresTrois = appelsMeteo;
// Une API qui renvoie sa clé : refusée, jamais gardée (le second appel repasse par l'API).
r.echo1 = await appel('GET', '/api/passerelle/meteo/previsions?echo=1');
r.echo2 = await appel('GET', '/api/passerelle/meteo/previsions?echo=1');
r.appelsApresEcho = appelsMeteo;
// Des paramètres que la liste ne comprend pas : la même copie, pas une nouvelle à chaque fois.
await appel('GET', '/api/livres?inutile=1');
r.inutile2 = await appel('GET', '/api/livres?inutile=2');
r.filtre = await appel('GET', '/api/livres?titre=Neuf');
// Un rôle qui change : la copie gardée pour l'ancien rôle ne sert plus.
await appel('GET', '/api/notes', a);
await usersStore.update(ids['lecteur.a@essai.test'], { role: 'gerant' });
const aGerant = await qui('lecteur.a@essai.test');
r.notesApresRole = await appel('GET', '/api/notes', aGerant);
// Un compte supprimé : ses avis rendus anonymes ne se relisent plus dans le cache.
const auteur = await qui('auteur@essai.test');
await appel('POST', '/api/avis', auteur, { texte: 'mon avis' });
await appel('GET', '/api/avis');
r.avisGarde = await appel('GET', '/api/avis');
r.suppression = await appel('POST', '/auth/suppression-compte', auteur, { motDePasse: secret });
r.avisApres = await appel('GET', '/api/avis');
r.idAuteur = ids['auteur@essai.test'];
// Une lecture rejouée à l'intérieur du serveur (la synchronisation) : sa réponse interne n'a pas « type ». Une copie
// est d'abord gardée pour cette même adresse : avant la correction, la lecture interne la trouvait et plantait.
await appel('GET', '/api/livres');
await appel('GET', '/api/livres');
r.interne = await Promise.race([
  new Promise((fin) => {
    const reponse = { statusCode: 200, set: () => reponse, json: () => fin('json appelé sans passer par next'), send: () => fin('copie envoyée') };
    Promise.resolve(cacheHumalis.lecture('livre', 300, undefined, [])({ method: 'GET', query: {}, baseUrl: '/api/livres', path: '/', originalUrl: '/api/livres' }, reponse, () => fin('next'))).catch((e) => fin('plantage : ' + e.message));
  }),
  new Promise((fin) => setTimeout(() => fin('bloquée'), 3000)),
]);
// Le préfixe des clés Redis : ni utilisateur, ni mot de passe, ni paramètre secret ; deux bases restent deux.
r.lieux = [
  lieuDeLaBase('postgres://lecteur:motdepasse-secret@/base?host=/var/run/postgresql'),
  lieuDeLaBase('postgres://lecteur:motdepasse-secret@relais/base?host=db-a'),
  lieuDeLaBase('postgres://lecteur:motdepasse-secret@relais/base?host=db-b'),
  lieuDeLaBase('mysql://lecteur:motdepasse-secret@hote:3306/base?password=motdepasse-secret&ssl-mode=REQUIRED&sslkey=/cle.pem'),
];
console.log(JSON.stringify(r));
ecoute.close();
api.close();
process.exit(0);
`;

function produire(dossier: string): void {
  const { application, diagnostics } = compiler(SOURCE);
  expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message)).toEqual([]);
  for (const sousDossier of ['src', 'dist', 'tests', 'scripts']) rmSync(join(dossier, sousDossier), { recursive: true, force: true });
  for (const [chemin, contenu] of genererProjetServeur(application!.serveurs[0]!, { nom: 'librairie', source: 'librairie.humalis' })) {
    mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
  installerSiBesoin(dossier);
  execFileSync('npx', ['tsc'], { cwd: dossier, stdio: 'pipe' });
}

const dossier = join(tmpdir(), 'humalis-cache');
type Reponse = { statut: number; garde: boolean; corps: unknown };
let r: Record<string, Reponse> & { appelsApresDeux: number; appelsApresTrois: number; appelsApresEcho: number; cleRecue: string; idAuteur: string; interne: string };

describe('« en cache pendant » sur un vrai serveur produit, en mémoire', () => {
  beforeAll(() => {
    mkdirSync(dossier, { recursive: true });
    produire(dossier);
    writeFileSync(join(dossier, 'scenario.mjs'), SCENARIO);
    r = JSON.parse(execFileSync('node', ['scenario.mjs'], { cwd: dossier, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').pop()!);
  }, 300_000);

  it('une lecture gardée est resservie sans repasser par la base', () => {
    expect(r.livres1).toMatchObject({ statut: 200, garde: false, corps: [] });
    expect(r.livres2).toMatchObject({ statut: 200, garde: true, corps: [] });
  });

  it('une écriture vide le cache avant de répondre : la lecture suivante voit la fiche', () => {
    expect(r.cree.statut).toBe(201);
    expect(r.livres3.garde).toBe(false);
    expect((r.livres3.corps as { titre: string }[]).map((l) => l.titre)).toEqual(['Neuf']);
    expect(r.livres4.garde).toBe(true);
  });

  it('une action (« faire "solder" ») vide aussi le cache', () => {
    expect(r.solde.statut).toBe(200);
    expect(r.livres5.garde).toBe(false);
    expect((r.livres5.corps as { prix: number }[])[0]!.prix).toBe(1);
  });

  it('un résumé se garde, et se recalcule après une écriture ; la garde des droits passe avant le cache', () => {
    expect(r.resume1).toMatchObject({ statut: 200, garde: false });
    expect(r.resume2).toMatchObject({ statut: 200, garde: true, corps: r.resume1.corps });
    expect(r.resume3.garde).toBe(false);
    expect(r.resume3.corps).toMatchObject({ total: 31 });
    expect(r.resumeLecteur.statut).toBe(403);
  });

  it('une donnée séparée par compte : chacun reçoit sa copie, jamais celle d’un autre', () => {
    expect(r.notesA1.corps).toMatchObject([{ texte: 'de A' }]);
    expect(r.notesB1.corps).toMatchObject([{ texte: 'de B' }]);
    expect(r.notesA2).toMatchObject({ garde: true, corps: [{ texte: 'de A' }] });
    expect(r.notesB2).toMatchObject({ garde: true, corps: [{ texte: 'de B' }] });
    expect((r.notesA2.corps as unknown[]).length).toBe(1);
  });

  it('la passerelle d’une source en cache n’appelle l’API extérieure qu’une fois pour tout le monde', () => {
    expect(r.meteo1).toMatchObject({ statut: 200, garde: false, corps: { jours: [{ jour: 'lundi' }] } });
    expect(JSON.stringify(r.meteo1.corps)).not.toContain('cle-essai-secrete');
    expect(r.meteo2).toMatchObject({ statut: 200, garde: true, corps: r.meteo1.corps });
    expect(r.appelsApresDeux).toBe(1);
    // La clé est bien partie vers l'API, et seulement là.
    expect(r.cleRecue).toBe('cle-essai-secrete');
    // D'autres paramètres : une autre réponse, donc un autre appel.
    expect(r.meteoAutre.garde).toBe(false);
    expect(r.appelsApresTrois).toBe(2);
  });

  it('une API qui renvoie sa clé : la réponse est refusée (502) et jamais gardée', () => {
    expect(r.echo1.statut).toBe(502);
    expect(JSON.stringify(r.echo1.corps)).not.toContain('cle-essai-secrete');
    expect(r.echo2).toMatchObject({ statut: 502, garde: false });
    expect(r.appelsApresEcho).toBe(r.appelsApresTrois + 2);
  });

  it('des paramètres que la liste ne comprend pas ne font pas une nouvelle copie ; un vrai filtre, si', () => {
    expect(r.inutile2.garde).toBe(true);
    expect(r.filtre).toMatchObject({ statut: 200, garde: false });
  });

  it('un rôle qui change : la copie gardée pour l’ancien rôle ne sert plus', () => {
    expect(r.notesApresRole).toMatchObject({ statut: 200, garde: false });
  });

  it('un compte supprimé : ses fiches rendues anonymes ne se relisent pas dans le cache', () => {
    expect(r.avisGarde.garde).toBe(true);
    expect(r.suppression.statut).toBeLessThan(300);
    expect(r.avisApres.garde).toBe(false);
    expect(JSON.stringify(r.avisApres.corps)).not.toContain(r.idAuteur as unknown as string);
  });

  it('une lecture rejouée dans le serveur (synchronisation) ne passe pas par le cache, même quand une copie existe', () => {
    expect(r.interne).toBe('next');
  });

  it('le préfixe des clés Redis ne contient aucun secret, et sépare deux bases', () => {
    const lieux = r.lieux as unknown as string[];
    for (const lieu of lieux) {
      expect(lieu).not.toContain('motdepasse');
      expect(lieu).not.toContain('lecteur');
      expect(lieu).not.toContain('/cle.pem');
    }
    expect(lieux[1]).not.toBe(lieux[2]);
    expect(lieux[3]).toContain('ssl-mode=REQUIRED');
  });

  it('un serveur dont seule une source est en cache compile (revue Codex : « direct » manquait)', () => {
    const seule = SOURCE.replace(/        en cache pendant [^\n]*\n/g, '').replace(/        vider le cache de "livres"\n/, '').replace(' dans livres en direct', ' dans livres').replace(/    route "moi" :\n        connecte peut lire et supprimer son compte\n/, '');
    expect(seule).toContain('    en cache pendant 30 minutes');
    const { application, diagnostics } = compiler(seule);
    expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message)).toEqual([]);
    const autre = join(tmpdir(), 'humalis-cache-source-seule');
    rmSync(autre, { recursive: true, force: true });
    for (const [chemin, contenu] of genererProjetServeur(application!.serveurs[0]!, { nom: 'librairie', source: 'librairie.humalis' })) {
      mkdirSync(dirname(join(autre, chemin)), { recursive: true });
      writeFileSync(join(autre, chemin), contenu);
    }
    symlinkSync(join(dossier, 'node_modules'), join(autre, 'node_modules'));
    expect(() => execFileSync('npx', ['tsc', '--noEmit'], { cwd: autre, stdio: 'pipe' })).not.toThrow();
  }, 120_000);
});

/**
 * Deux exemplaires du serveur, lancés comme en production (npm start), sur la même base PostgreSQL et le même Redis.
 *   HUMALIS_ESSAI_POSTGRES=postgres://…   HUMALIS_ESSAI_REDIS=redis://127.0.0.1:6379 (ou rediss://…)
 */
const POSTGRES = process.env.HUMALIS_ESSAI_POSTGRES;
const REDIS = process.env.HUMALIS_ESSAI_REDIS;

describe.runIf(POSTGRES && REDIS)('avec Redis : deux exemplaires partagent le cache et les limites', () => {
  const lances: ChildProcess[] = [];
  const port = (i: number) => 4600 + (process.pid % 200) * 2 + i;

  async function lancer(i: number, url: string): Promise<string> {
    const enfant = spawn('node', ['dist/src/demarrer.js'], {
      cwd: dossier,
      env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: url, HUMALIS_CACHE_ADRESSE: REDIS, HUMALIS_LIMITE_API: '40', PORT: String(port(i)), JWT_SECRET: 'x'.repeat(40), HUMALIS_ADMIN_EMAIL: 'admin@essai.test', HUMALIS_ADMIN_MOT_DE_PASSE: 'Essai-Solide-2026!', HUMALIS_ADRESSE_SITE: 'http://127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    lances.push(enfant);
    let sortie = '';
    enfant.stdout!.on('data', (d) => (sortie += d));
    enfant.stderr!.on('data', (d) => (sortie += d));
    const base = 'http://127.0.0.1:' + port(i);
    for (let essai = 0; essai < 100; essai++) {
      if (await fetch(base + '/sante').then((x) => x.ok, () => false)) return base;
      await new Promise((suite) => setTimeout(suite, 200));
    }
    throw new Error('le serveur ' + i + ' ne démarre pas :\n' + sortie);
  }

  it('une lecture gardée par l’un sert à l’autre ; une écriture sur l’un vide le cache de l’autre ; les limites se partagent', async () => {
    mkdirSync(dossier, { recursive: true });
    produire(dossier);
    const nom = 'humalis_cache_' + process.pid;
    const pg = await import(join(dossier, 'node_modules', 'pg', 'lib', 'index.js'));
    const admin = new pg.default.Pool({ connectionString: POSTGRES, max: 1 });
    admin.on('error', () => undefined);
    await admin.query('DROP DATABASE IF EXISTS ' + nom);
    await admin.query('CREATE DATABASE ' + nom);
    const url = new URL(POSTGRES!);
    url.pathname = '/' + nom;
    try {
      const [a, b] = [await lancer(0, url.href), await lancer(1, url.href)];
      // Chaque démarrage abandonne les copies d'avant (une nouvelle époque dans Redis) : on laisse le second finir le sien.
      await new Promise((suite) => setTimeout(suite, 1000));
      const json = { 'content-type': 'application/json' };
      const jeton = (await (await fetch(a + '/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email: 'admin@essai.test', password: 'Essai-Solide-2026!' }) })).json()).data.token;
      const lire = async (base: string) => {
        const reponse = await fetch(base + '/api/livres');
        return { statut: reponse.status, garde: reponse.headers.get('x-humalis-cache') === 'garde', corps: await reponse.json().catch(() => null) };
      };
      expect((await lire(a)).garde).toBe(false);
      expect((await lire(b)).garde).toBe(true);
      const cree = await fetch(a + '/api/livres', { method: 'POST', headers: { ...json, authorization: 'Bearer ' + jeton }, body: JSON.stringify({ titre: 'Partagé', prix: 5 }) });
      expect(cree.status).toBe(201);
      const apres = await lire(b);
      // Une page « en direct » ouverte sur l'autre exemplaire est prévenue par Redis d'une écriture faite ici.
      const flux = await fetch(b + '/api/livres/direct');
      const lecteur = flux.body!.getReader();
      const recu = (async () => {
        let texte = '';
        while (!texte.includes('data: change')) {
          const { value, done } = await lecteur.read();
          if (done) break;
          texte += new TextDecoder().decode(value);
        }
        return texte.includes('data: change');
      })();
      await new Promise((suite) => setTimeout(suite, 300));
      await fetch(a + '/api/livres', { method: 'POST', headers: { ...json, authorization: 'Bearer ' + jeton }, body: JSON.stringify({ titre: 'Annoncé', prix: 7 }) });
      expect(await Promise.race([recu, new Promise((fin) => setTimeout(() => fin(false), 5000))])).toBe(true);
      await lecteur.cancel();
      expect(apres.garde).toBe(false);
      expect(apres.corps).toMatchObject([{ titre: 'Partagé' }]);
      // 40 requêtes par adresse pour les deux exemplaires ensemble : la limite est comptée dans Redis.
      const statuts: number[] = [];
      for (let i = 0; i < 46; i++) statuts.push((await lire(i % 2 ? a : b)).statut);
      expect(statuts.filter((s) => s === 429).length).toBeGreaterThan(0);
    } finally {
      for (const enfant of lances) enfant.kill();
      await new Promise((suite) => setTimeout(suite, 500));
      await admin.query('DROP DATABASE IF EXISTS ' + nom + ' WITH (FORCE)').catch(() => undefined);
      await admin.end();
    }
  }, 300_000);
});
