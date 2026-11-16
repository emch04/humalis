import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { BASES, surBase } from './aide-bases.js';
import { installerSiBesoin } from './aide-installation.js';

/**
 * « par boutique » sur un VRAI serveur produit (revue du 12 novembre 2026, S6) : un vendeur ne lit ni n'écrit dans la
 * conversation d'un client d'une autre boutique, un compte sans boutique n'entre dans aucune, et chaque classe a sa
 * propre salle (pièce LiveKit et exclusions). LiveKit est « réglé » vers une adresse injoignable : le jeton se signe sans lui.
 */
const SOURCE = readFileSync(new URL('./serveur-attaques-groupes.humalis', import.meta.url), 'utf8');

const SCENARIO = `
import { createMemoryUsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from './dist/src/serveur.js';
import { creerStockageMemoire } from './dist/src/humalis/stockage.js';

process.env.LIVEKIT_URL = 'ws://127.0.0.1:9';
process.env.LIVEKIT_API_KEY = 'cle-essai';
process.env.LIVEKIT_API_SECRET = 'secret-essai-assez-long-pour-livekit-0123456789';
const secret = 'Essai-Solide-2026!';
const usersStore = createMemoryUsersStore();
const passwordHash = await hashPassword(secret);
const compte = (email, role, plus = {}) => usersStore.create({ email, role, passwordHash, ...plus });
const clientA = await compte('client.a@essai.test', 'client', { boutique: 'A' });
await compte('client.b@essai.test', 'client', { boutique: 'B' });
await compte('client.sans@essai.test', 'client');
await compte('vendeur.a@essai.test', 'vendeur', { boutique: 'A' });
await compte('vendeur.b@essai.test', 'vendeur', { boutique: 'B' });
await compte('prof.a@essai.test', 'professeur', { classe: 'A' });
const eleveA = await compte('eleve.a@essai.test', 'eleve', { classe: 'A' });
await compte('eleve.b@essai.test', 'eleve', { classe: 'B' });
await compte('eleve.a2@essai.test', 'eleve', { classe: 'A' });
const s = () => creerStockageMemoire();
const stockages = { commande: s(), cours: s(), conversationSupport: s(), messageSupport: s(), pieceSupport: s(), lectureSupport: s(), ecritureSupport: s(), presenceVue: s() };
const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages });
const ecoute = app.listen(0);
await new Promise((pret) => ecoute.once('listening', pret));
const base = 'http://127.0.0.1:' + ecoute.address().port;
const json = { 'content-type': 'application/json' };
const qui = async (email) => ({ ...json, authorization: 'Bearer ' + (await (await fetch(base + '/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email, password: secret }) })).json()).data.token });
const appel = async (methode, chemin, entetes, corps) => {
  const reponse = await fetch(base + chemin, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) });
  return { statut: reponse.status, corps: await reponse.json().catch(() => null) };
};
const [cA, cB, cSans, vA, vB, pA, eA, eB, eA2] = await Promise.all(['client.a', 'client.b', 'client.sans', 'vendeur.a', 'vendeur.b', 'prof.a', 'eleve.a', 'eleve.b', 'eleve.a2'].map((n) => qui(n + '@essai.test')));
const r = {};
r.messageA = await appel('POST', '/api/discussions_support_messages', cA, { texte: 'Ma commande A' });
r.messageB = await appel('POST', '/api/discussions_support_messages', cB, { texte: 'Ma commande B' });
const conversationA = String(r.messageA.corps?.conversation ?? '');
r.listeVendeurA = await appel('GET', '/api/discussions_support_conversations', vA);
r.listeVendeurB = await appel('GET', '/api/discussions_support_conversations', vB);
r.vueParB = await appel('GET', '/api/discussions_support_vue/' + conversationA, vB);
r.ecritParB = await appel('POST', '/api/discussions_support_messages', vB, { conversation: conversationA, texte: 'intrus' });
r.ouvreParB = await appel('POST', '/api/discussions_support_conversations', vB, { personne: String(clientA.id) });
r.vueParA = await appel('GET', '/api/discussions_support_vue/' + conversationA, vA);
r.reponseParA = await appel('POST', '/api/discussions_support_messages', vA, { conversation: conversationA, texte: 'Bonjour' });
r.sansBoutique = await appel('POST', '/api/discussions_support_messages', cSans, { texte: 'bonjour' });
const piece = (reponse) => (reponse.corps?.jeton ? JSON.parse(Buffer.from(reponse.corps.jeton.split('.')[1], 'base64url').toString()).video?.room ?? '' : '');
r.jetonA = await appel('POST', '/api/salles_jeton', eA, { salle: 'classe' });
r.jetonB = await appel('POST', '/api/salles_jeton', eB, { salle: 'classe' });
r.jetonA2 = await appel('POST', '/api/salles_jeton', eA2, { salle: 'classe' });
r.pieces = { statut: 0, corps: { a: piece(r.jetonA), b: piece(r.jetonB), a2: piece(r.jetonA2) } };
r.exclusion = await appel('POST', '/api/salles_geste', pA, { salle: 'classe', participant: String(eleveA.id), geste: 'exclure' });
r.jetonExclu = await appel('POST', '/api/salles_jeton', eA, { salle: 'classe' });
r.cercleForce = await appel('POST', '/api/salles_jeton', eB, { salle: 'classe', cercle: 'A' });
r.pieces.corps.force = piece(r.cercleForce);
ecoute.close();
ecoute.closeAllConnections();
console.log(JSON.stringify(r));
`;

type Reponse = { statut: number; corps: Record<string, unknown> };
let r: Record<string, Reponse>;

describe.each(BASES)('« par boutique » sur un vrai serveur produit, %s', (_nom, base) => {
  beforeAll(() => {
    const { application, diagnostics } = compiler(SOURCE);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const dossier = join(tmpdir(), 'humalis-attaques-groupes');
    rmSync(join(dossier, 'src'), { recursive: true, force: true });
    rmSync(join(dossier, 'dist'), { recursive: true, force: true });
    for (const [chemin, contenu] of genererProjetServeur(application!.serveurs[0]!, { nom: 'marche', source: 'marche.humalis' })) {
      mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
      writeFileSync(join(dossier, chemin), contenu);
    }
    // Les mêmes attaques sur les deux bases : en mémoire, puis dans SQLite.
    writeFileSync(join(dossier, 'scenario.mjs'), surBase(SCENARIO, base));
    installerSiBesoin(dossier);
    execFileSync('npx', ['tsc'], { cwd: dossier, stdio: 'pipe' });
    r = JSON.parse(execFileSync('node', ['scenario.mjs'], { cwd: dossier, encoding: 'utf8' }).trim().split('\n').at(-1)!);
  }, 300_000);

  it('chaque client écrit dans la conversation de sa boutique', () => {
    expect([r.messageA!.statut, r.messageB!.statut]).toEqual([201, 201]);
  });
  it('un vendeur ne voit que les conversations de sa boutique', () => {
    const ids = (x: Reponse) => (x.corps as unknown as { id: string }[]).map((c) => c.id);
    expect(ids(r.listeVendeurA!)).toEqual([r.messageA!.corps.conversation]);
    expect(ids(r.listeVendeurB!)).toEqual([r.messageB!.corps.conversation]);
  });
  it('un vendeur d’une autre boutique ne lit, n’écrit ni n’ouvre la conversation', () => {
    // « introuvable » à la lecture : on ne révèle pas qu'elle existe ailleurs.
    expect([r.vueParB!.statut, r.ecritParB!.statut, r.ouvreParB!.statut]).toEqual([404, 403, 404]);
  });
  it('le vendeur de la boutique, lui, lit et répond', () => {
    expect([r.vueParA!.statut, r.reponseParA!.statut]).toEqual([200, 201]);
  });
  it('un compte sans boutique n’entre dans aucune conversation', () => {
    expect(r.sansBoutique!.statut).toBe(403);
  });
  it('chaque classe a sa pièce ; un élève ne choisit pas celle d’une autre classe', () => {
    const p = r.pieces!.corps as Record<string, string>;
    expect([r.jetonA!.statut, r.jetonB!.statut, r.jetonA2!.statut, r.cercleForce!.statut]).toEqual([201, 201, 201, 201]);
    expect(p.a).toBe(p.a2);
    expect(p.a).not.toBe(p.b);
    expect(p.force).toBe(p.b);
  });
  it('le professeur de la classe A exclut de sa salle', () => {
    expect([r.exclusion!.statut, r.jetonExclu!.statut]).toEqual([201, 403]);
  });
});
