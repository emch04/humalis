import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { BASES, surSqlite } from './aide-sqlite.js';

/**
 * Les défauts moyens de la troisième revue Codex (12 novembre 2026), rejoués sur un VRAI serveur produit :
 * - un paiement différé (« async_payment_succeeded ») était acquitté sans être enregistré ;
 * - une exclusion de réunion, gardée en mémoire, ne valait pas sur un autre exemplaire du serveur ;
 * - l'échec de la deuxième création liée laissait la première orpheline ;
 * - en mémoire, une transaction annulée effaçait une écriture faite à côté pendant ce temps ;
 * - avec SQLite, une table créée dans une transaction annulée restait inutilisable.
 */
const SOURCE = readFileSync(new URL('./serveur-attaques-codex-moyens.humalis', import.meta.url), 'utf8');

const SCENARIO = `
import { createMemoryUsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { createHmac } from 'node:crypto';
import { creerServeur } from './dist/src/serveur.js';
import { creerStockageMemoire } from './dist/src/humalis/stockage.js';
import { transactionMemoire } from './dist/src/humalis/logique.js';
import { ouvrirSqlite, creerStockageSqlite, transactionSqlite } from './dist/src/humalis/sqlite.js';

process.env.STRIPE_CLE_SECRETE ??= 'sk_test_essai';
process.env.STRIPE_SECRET_WEBHOOK ??= 'whsec_essai';
process.env.HUMALIS_ADRESSE_SITE ??= 'https://essai.test';
process.env.LIVEKIT_URL = 'ws://127.0.0.1:9';
process.env.LIVEKIT_API_KEY = 'cle-essai';
process.env.LIVEKIT_API_SECRET = 'secret-essai-assez-long-pour-livekit-0123456789';
const secret = 'Essai-Solide-2026!';
const usersStore = createMemoryUsersStore();
const passwordHash = await hashPassword(secret);
await usersStore.create({ email: 'prof@essai.test', role: 'professeur', passwordHash });
const eleve = await usersStore.create({ email: 'eleve@essai.test', role: 'eleve', passwordHash });
const s = () => creerStockageMemoire();
// La deuxième création d'un suivi échoue : la première ne doit pas rester.
const suivi = s();
const creerSuivi = suivi.creer.bind(suivi);
let suivis = 0;
suivi.creer = async (valeurs) => { suivis += 1; if (suivis === 2) throw new Error('panne du stockage'); return creerSuivi(valeurs); };
// Deux exemplaires du serveur partagent la même base : l'exclusion doit valoir sur les deux.
const exclusionSalle = s();
const commun = { inscription: s(), journal: s(), suivi, envoi: s(), exclusionSalle };
const options = { jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore };
const ecouter = async (app) => { const e = app.listen(0); await new Promise((p) => e.once('listening', p)); return e; };
const ecouteA = await ecouter(creerServeur({ ...options, stockages: commun }));
const ecouteB = await ecouter(creerServeur({ ...options, stockages: commun }));
const baseA = 'http://127.0.0.1:' + ecouteA.address().port;
const baseB = 'http://127.0.0.1:' + ecouteB.address().port;
const json = { 'content-type': 'application/json' };
const qui = async (base, email) => ({ ...json, authorization: 'Bearer ' + (await (await fetch(base + '/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email, password: secret }) })).json()).data.token });
const appel = async (base, methode, chemin, entetes, corps) => {
  const reponse = await fetch(base + chemin, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) });
  return { statut: reponse.status, corps: await reponse.json().catch(() => null) };
};
const r = {};
const [profA, eleveA, eleveB] = [await qui(baseA, 'prof@essai.test'), await qui(baseA, 'eleve@essai.test'), await qui(baseB, 'eleve@essai.test')];

// Paiement différé : la session se termine impayée, puis Stripe annonce le succès.
const inscription = await commun.inscription.creer({ nom: 'Awa', total: 30, paye: false });
const webhook = async (type, statut) => {
  const corps = JSON.stringify({ id: 'evt_' + type, object: 'event', type, data: { object: { id: 'cs_1', object: 'checkout.session', payment_status: statut, amount_total: 3000, metadata: { donnee: 'inscription', id: inscription.id, champ: 'total' } } } });
  const t = Math.floor(Date.now() / 1000);
  return (await fetch(baseA + '/paiements/webhook', { method: 'POST', headers: { ...json, 'stripe-signature': 't=' + t + ',v1=' + createHmac('sha256', process.env.STRIPE_SECRET_WEBHOOK).update(t + '.' + corps).digest('hex') }, body: corps })).status;
};
r.termineeImpayee = { statut: await webhook('checkout.session.completed', 'unpaid'), corps: { paye: (await commun.inscription.trouver(inscription.id)).paye } };
r.differeReussi = { statut: await webhook('checkout.session.async_payment_succeeded', 'paid'), corps: { paye: (await commun.inscription.trouver(inscription.id)).paye, journal: (await commun.journal.lister({ egal: {} })).length } };

// Exclusion : sur A, puis jeton demandé à B.
r.exclusion = await appel(baseA, 'POST', '/api/salles_geste', profA, { salle: 'classe', participant: String(eleve.id), geste: 'exclure' });
r.jetonSurA = await appel(baseA, 'POST', '/api/salles_jeton', eleveA, { salle: 'classe' });
r.jetonSurB = await appel(baseB, 'POST', '/api/salles_jeton', eleveB, { salle: 'classe' });

// Deux créations liées, la deuxième échoue.
const silence = console.error; console.error = () => {};
r.envoi = await appel(baseA, 'POST', '/api/envois', eleveA, { nom: 'colis' });
console.error = silence;
r.suivisRestants = { statut: 0, corps: { nombre: (await suivi.lister({ egal: {} })).length } };

// En mémoire : une transaction annulée n'efface pas ce qu'une autre requête a écrit pendant ce temps.
const note = s();
const transaction = transactionMemoire({ note });
const annulee = transaction(async (t) => { await t.note.creer({ texte: 'dans la transaction' }); await new Promise((p) => setTimeout(p, 50)); throw new Error('annulée'); }).catch(() => 'annulée');
await new Promise((p) => setTimeout(p, 10));
await note.creer({ texte: 'à côté' });
await annulee;
r.memoire = { statut: 0, corps: { textes: (await note.lister({ egal: {} })).map((n) => n.texte) } };

// SQLite : la première écriture d'une table, dans une transaction annulée.
const base = ouvrirSqlite(':memory:');
const trace = creerStockageSqlite(base, 'trace');
const enSqlite = transactionSqlite(base, { trace });
await enSqlite(async (t) => { await t.trace.creer({ message: 'tentative' }); throw new Error('annulée'); }).catch(() => undefined);
let apres;
try { apres = (await trace.creer({ message: 'ensuite' })).message; } catch (erreur) { apres = 'erreur : ' + erreur.message; }
r.sqlite = { statut: 0, corps: { apres } };

for (const e of [ecouteA, ecouteB]) { e.close(); e.closeAllConnections(); }
console.log(JSON.stringify(r));
`;

type Reponse = { statut: number; corps: Record<string, unknown> };
let r: Record<string, Reponse>;

describe('les défauts moyens de la revue Codex, sur un vrai serveur produit', () => {
  beforeAll(() => {
    const { application, diagnostics } = compiler(SOURCE);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const dossier = join(tmpdir(), 'humalis-attaques-codex-moyens');
    rmSync(join(dossier, 'src'), { recursive: true, force: true });
    rmSync(join(dossier, 'dist'), { recursive: true, force: true });
    for (const [chemin, contenu] of genererProjetServeur(application!.serveurs[0]!, { nom: 'ecole', source: 'ecole.humalis' })) {
      mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
      writeFileSync(join(dossier, chemin), contenu);
    }
    writeFileSync(join(dossier, 'scenario.mjs'), SCENARIO);
    if (!existsSync(join(dossier, 'node_modules', 'typescript'))) execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'pipe' });
    execFileSync('npx', ['tsc'], { cwd: dossier, stdio: 'pipe' });
    r = JSON.parse(execFileSync('node', ['scenario.mjs'], { cwd: dossier, encoding: 'utf8' }).trim().split('\n').at(-1)!);
  }, 300_000);

  it('un paiement différé est enregistré quand Stripe annonce son succès', () => {
    expect(r.termineeImpayee!.corps.paye).toBe(false);
    expect(r.differeReussi!.statut).toBe(200);
    expect(r.differeReussi!.corps).toEqual({ paye: true, journal: 1 });
  });
  it('une exclusion de réunion vaut sur chaque exemplaire du serveur', () => {
    expect([r.exclusion!.statut, r.jetonSurA!.statut, r.jetonSurB!.statut]).toEqual([201, 403, 403]);
  });
  it('l’échec de la deuxième création liée n’en laisse aucune', () => {
    expect(r.envoi!.statut).toBe(500);
    expect(r.suivisRestants!.corps.nombre).toBe(0);
  });
  it('en mémoire, une transaction annulée garde ce qui a été écrit à côté', () => {
    expect(r.memoire!.corps.textes).toEqual(['à côté']);
  });
  it('avec SQLite, une table reste utilisable après une transaction annulée', () => {
    expect(r.sqlite!.corps.apres).toBe('ensuite');
  });
});
