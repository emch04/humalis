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
 * Le temps réel sur un VRAI serveur produit (revue du 12 novembre 2026, S4 et S5) : chaque écriture passe la garde
 * CSRF, une personne exclue d'une réunion n'obtient plus de jeton, et le nom affiché n'est jamais l'adresse e-mail.
 * LiveKit est « réglé » vers une adresse injoignable : le jeton se signe sans lui, l'exclusion aussi.
 */
const SOURCE = readFileSync(new URL('./serveur-attaques-temps-reel.humalis', import.meta.url), 'utf8');

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
await usersStore.create({ email: 'prof@essai.test', role: 'professeur', passwordHash });
const e1 = await usersStore.create({ email: 'eleve.un@essai.test', role: 'eleve', passwordHash });
await usersStore.create({ email: 'eleve.deux@essai.test', role: 'eleve', passwordHash });
const s = () => creerStockageMemoire();
const stockages = { conversationAide: s(), messageAide: s(), pieceAide: s(), lectureAide: s(), ecritureAide: s(), presenceVue: s() };
const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages });
const ecoute = app.listen(0);
await new Promise((pret) => ecoute.once('listening', pret));
const base = 'http://127.0.0.1:' + ecoute.address().port;
const json = { 'content-type': 'application/json' };
const connexion = async (email) => fetch(base + '/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email, password: secret }) });
const parJeton = async (email) => ({ ...json, authorization: 'Bearer ' + (await (await connexion(email)).json()).data.token });
// Un navigateur : seulement les cookies de la session, sans l'en-tête x-csrf-token.
const cookies = (await connexion('eleve.un@essai.test')).headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const parCookie = { ...json, cookie: cookies };
const envoyer = async (chemin, entetes, corps) => {
  const reponse = await fetch(base + chemin, { method: 'POST', headers: entetes, body: JSON.stringify(corps) });
  return { statut: reponse.status, corps: await reponse.json().catch(() => null) };
};
const [prof, un, deux] = [await parJeton('prof@essai.test'), await parJeton('eleve.un@essai.test'), await parJeton('eleve.deux@essai.test')];
const r = {
  messageSansCsrf: await envoyer('/api/discussions_aide_messages', parCookie, { texte: 'bonjour' }),
  jetonSansCsrf: await envoyer('/api/salles_jeton', parCookie, { salle: 'classe' }),
  jetonAvant: await envoyer('/api/salles_jeton', un, { salle: 'classe' }),
  exclusion: await envoyer('/api/salles_geste', prof, { salle: 'classe', participant: String(e1.id), geste: 'exclure' }),
  jetonExclu: await envoyer('/api/salles_jeton', un, { salle: 'classe' }),
  jetonAutre: await envoyer('/api/salles_jeton', deux, { salle: 'classe' }),
  message: await envoyer('/api/discussions_aide_messages', un, { texte: 'bonjour' }),
};
const charge = r.jetonAutre.corps?.jeton ? JSON.parse(Buffer.from(r.jetonAutre.corps.jeton.split('.')[1], 'base64url').toString()) : {};
r.nomDansLeJeton = { statut: 0, corps: { nom: charge.name ?? '', duree: (charge.exp ?? 0) - (charge.iat ?? charge.nbf ?? 0) } };
// Les pièces jointes (S9) : un volume par heure et par compte (ici 1 Mo), et peu de fichiers en attente d'un message.
process.env.HUMALIS_PIECES_MO_PAR_HEURE = '1';
const deposer = async (entetes, octets, nom = 'f.txt') => {
  const formulaire = new FormData();
  formulaire.append('fichier', new Blob([new Uint8Array(octets).fill(65)]), nom);
  const { 'content-type': _json, ...sans } = entetes;
  const reponse = await fetch(base + '/api/discussions_aide_pieces', { method: 'POST', headers: sans, body: formulaire });
  return { statut: reponse.status, corps: await reponse.json().catch(() => null) };
};
const enAttente = async (compte) => (await stockages.pieceAide.lister()).filter((p) => p.auteur === String(compte.id) && p.conversation === '').length;
const petits = [];
for (let i = 0; i < 6; i++) petits.push(await deposer(un, 10, 'petit' + i + '.txt'));
r.petitsFichiers = { statut: 0, corps: { statuts: petits.map((p) => p.statut), enAttente: await enAttente(e1) } };
// La dernière pièce déposée, jointe à un message, n'est plus « en attente » : le ménage ne la touche pas.
const jointe = petits.at(-1).corps.id;
r.messageAvecPiece = await envoyer('/api/discussions_aide_messages', un, { texte: 'voici', piece: jointe });
for (let i = 0; i < 4; i++) await deposer(un, 10, 'encore' + i + '.txt');
r.pieceJointeGardee = { statut: 0, corps: { gardee: (await stockages.pieceAide.trouver(jointe)) !== null, enAttente: await enAttente(e1) } };
r.grosPermis = await deposer(un, 600 * 1024, 'gros1.bin');
r.grosRefuse = await deposer(un, 600 * 1024, 'gros2.bin');
r.autreCompte = await deposer(deux, 600 * 1024, 'gros3.bin');
r.pieceSansCsrf = await deposer(parCookie, 10);
r.pieceSansSession = await deposer({}, 10);
ecoute.close();
ecoute.closeAllConnections();
console.log(JSON.stringify(r));
`;

type Reponse = { statut: number; corps: Record<string, unknown> };
let r: Record<string, Reponse>;

describe.each(BASES)('le temps réel sur un vrai serveur produit, %s', (_nom, base) => {
  beforeAll(() => {
    const { application, diagnostics } = compiler(SOURCE);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const dossier = join(tmpdir(), 'humalis-attaques-temps-reel');
    rmSync(join(dossier, 'src'), { recursive: true, force: true });
    rmSync(join(dossier, 'dist'), { recursive: true, force: true });
    for (const [chemin, contenu] of genererProjetServeur(application!.serveurs[0]!, { nom: 'ecole', source: 'ecole.humalis' })) {
      mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
      writeFileSync(join(dossier, chemin), contenu);
    }
    // Les mêmes attaques sur les deux bases : en mémoire, puis dans SQLite.
    writeFileSync(join(dossier, 'scenario.mjs'), surBase(SCENARIO, base));
    installerSiBesoin(dossier);
    execFileSync('npx', ['tsc'], { cwd: dossier, stdio: 'pipe' });
    r = JSON.parse(execFileSync('node', ['scenario.mjs'], { cwd: dossier, encoding: 'utf8' }).trim().split('\n').at(-1)!);
  }, 300_000);

  it('une écriture sans la garde CSRF est refusée (S4)', () => {
    expect([r.messageSansCsrf!.statut, r.jetonSansCsrf!.statut]).toEqual([403, 403]);
  });
  it('une personne exclue n’obtient plus de jeton ; les autres, si (S5)', () => {
    expect([r.jetonAvant!.statut, r.exclusion!.statut, r.jetonExclu!.statut, r.jetonAutre!.statut]).toEqual([201, 201, 403, 201]);
  });
  it('le jeton dure dix minutes, et le nom affiché n’est pas l’adresse e-mail', () => {
    expect(r.nomDansLeJeton!.corps.nom).toBe('eleve.deux');
    expect(r.nomDansLeJeton!.corps.duree).toBeLessThanOrEqual(600);
  });
  it('les fichiers envoyés puis jamais joints ne s’entassent pas : trois en attente au plus par compte (S9)', () => {
    expect(r.petitsFichiers!.corps.statuts).toEqual([201, 201, 201, 201, 201, 201]);
    expect(r.petitsFichiers!.corps.enAttente).toBe(3);
  });
  it('une pièce jointe à un message est gardée, quoi qu’on envoie ensuite', () => {
    expect(r.messageAvecPiece!.statut).toBe(201);
    expect(r.pieceJointeGardee!.corps).toEqual({ gardee: true, enAttente: 3 });
  });
  it('au-delà du volume par heure, le compte est refusé (429) ; un autre compte envoie encore', () => {
    expect([r.grosPermis!.statut, r.grosRefuse!.statut, r.autreCompte!.statut]).toEqual([201, 429, 201]);
  });
  it('déposer un fichier demande une session et la garde CSRF', () => {
    expect([r.pieceSansCsrf!.statut, r.pieceSansSession!.statut]).toEqual([403, 401]);
  });
  it('une écriture normale passe toujours', () => {
    expect(r.message!.statut).toBe(201);
  });
});
