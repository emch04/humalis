import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { camel } from '../src/cibles/web/noms.js';
import { BASES, surSqlite } from './aide-sqlite.js';

/**
 * « connecte peut supprimer son compte » sur un vrai serveur produit (Apple et le RGPD l'exigent) : le mot de passe est
 * redemandé, les fiches de la personne sont effacées ou rendues anonymes selon leur donnée, une fiche payée reste,
 * celles des autres ne bougent pas, le compte est vidé et ne se reconnecte plus, le dernier admin est refusé.
 */
const SOURCE = readFileSync(new URL('./serveur-suppression-compte.humalis', import.meta.url), 'utf8');

const scenario = (stockages: string[]) => `
import { createMemoryUsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from './dist/src/serveur.js';
import { creerStockageMemoire } from './dist/src/humalis/stockage.js';

process.env.STRIPE_CLE_SECRETE ??= 'sk_test_essai';
process.env.STRIPE_SECRET_WEBHOOK ??= 'whsec_essai';
process.env.HUMALIS_LIMITE_CONNEXION = '1000';
const secret = 'Essai-Solide-2026!';
const usersStore = createMemoryUsersStore();
const passwordHash = await hashPassword(secret);
const awa = await usersStore.create({ email: 'awa@essai.test', role: 'client', passwordHash, nom: 'Awa' });
const bob = await usersStore.create({ email: 'bob@essai.test', role: 'client', passwordHash, nom: 'Bob' });
await usersStore.create({ email: 'admin@essai.test', role: 'admin', passwordHash });
const google = await usersStore.create({ email: 'google@essai.test', role: 'client', passwordHash });
const s = () => creerStockageMemoire();
const stockages = { ${stockages.map((n) => `${n}: s()`).join(', ')} };
const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages });
const ecoute = app.listen(0);
await new Promise((pret) => ecoute.once('listening', pret));
const base = 'http://127.0.0.1:' + ecoute.address().port;
const json = { 'content-type': 'application/json' };
const connexion = (email) => fetch(base + '/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email, password: secret }) });
const jeton = async (email) => ({ ...json, authorization: 'Bearer ' + (await (await connexion(email)).json()).data.token });
const appel = async (methode, chemin, entetes, corps) => {
  const reponse = await fetch(base + chemin, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) });
  return { statut: reponse.status, corps: await reponse.json().catch(() => null) };
};
const supprimer = (entetes, corps = {}) => appel('POST', '/auth/suppression-compte', entetes, corps);
const [A, B, admin] = [await jeton('awa@essai.test'), await jeton('bob@essai.test'), await jeton('admin@essai.test')];
// Un navigateur : seulement les cookies de la session, sans l'en-tête x-csrf-token.
const parCookie = { ...json, cookie: (await connexion('awa@essai.test')).headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') };
const idA = String(awa.id);
const idB = String(bob.id);

for (let i = 0; i < 1200; i++) await stockages.note.creer({ texte: 'note ' + i, compte: idA });
await stockages.note.creer({ texte: 'de Bob', compte: idB });
const avisA = (await appel('POST', '/api/avis', A, { texte: 'super' })).corps.id;
const avisB = (await appel('POST', '/api/avis', B, { texte: 'bof' })).corps.id;
const brouillon = (await appel('POST', '/api/brouillons', A, { texte: 'secret' })).corps.id;
const payee = (await appel('POST', '/api/commandes', A, { total: 30 })).corps.id;
const nonPayee = (await appel('POST', '/api/commandes', A, { total: 10 })).corps.id;
const commandeB = (await appel('POST', '/api/commandes', B, { total: 5 })).corps.id;
await stockages.commande.modifier(payee, { paye: true });
const journal = (await appel('POST', '/api/journaux', A, { texte: 'trace' })).corps.id;
await stockages.messageAide.creer({ conversation: 'c1', auteur: idA, auteurNom: 'Awa', texte: 'bonjour' });
await stockages.messageAide.creer({ conversation: 'c1', auteur: idB, auteurNom: 'Bob', texte: 'salut' });

const r = {};
r.visiteur = await supprimer(json, { motDePasse: secret });
r.sansCsrf = await supprimer(parCookie, { motDePasse: secret });
r.mauvais = await supprimer(A, { motDePasse: 'Faux-Mot-2026!' });
r.sansMotDePasse = await supprimer(A, {});
r.connexionApresRefus = { statut: (await connexion('awa@essai.test')).status };
r.dernierAdmin = await supprimer(admin, { motDePasse: secret });
const ensemble = await Promise.all([supprimer(A, { motDePasse: secret }), supprimer(A, { motDePasse: secret })]);
r.ensemble = { statut: 0, corps: { statuts: ensemble.map((e) => e.statut).sort() } };
r.supprime = ensemble.find((e) => e.statut === 200) ?? ensemble[0];
const trouver = async (stockage, id) => await stockage.trouver(id);
r.apres = { statut: 0, corps: {
  notesAwa: (await stockages.note.lister({ egal: { compte: idA } })).length,
  notes: (await stockages.note.lister()).length,
  avisA: await trouver(stockages.avis, avisA),
  avisB: await trouver(stockages.avis, avisB),
  brouillon: await trouver(stockages.brouillon, brouillon),
  payee: await trouver(stockages.commande, payee),
  nonPayee: await trouver(stockages.commande, nonPayee),
  commandeB: await trouver(stockages.commande, commandeB),
  journal: await trouver(stockages.journal, journal),
  messages: (await stockages.messageAide.lister()).map((m) => ({ auteur: m.auteur, auteurNom: m.auteurNom, texte: m.texte })).sort((a, b) => a.texte.localeCompare(b.texte)),
  parAdresse: await usersStore.findByEmail('awa@essai.test'),
  compte: await usersStore.findById(idA),
  bob: await usersStore.findById(idB),
} };
r.connexionApres = { statut: (await connexion('awa@essai.test')).status };
r.sessionApres = await appel('GET', '/auth/me', A);
r.secondeFois = await supprimer(A, { motDePasse: secret });
// L'adresse est libre : un nouveau compte s'y crée, et n'hérite d'aucune fiche.
await usersStore.create({ email: 'awa@essai.test', role: 'client', passwordHash });
r.nouveauCompte = { statut: (await connexion('awa@essai.test')).status };
r.notesDuNouveau = await appel('GET', '/api/notes', await jeton('awa@essai.test'));
// Un compte sans mot de passe (Google, Apple) se supprime sans.
const G = await jeton('google@essai.test');
await usersStore.update(String(google.id), { passwordHash: null });
r.compteSansMotDePasse = await supprimer(G, {});
// Avec un second admin, le premier peut partir.
await usersStore.create({ email: 'admin2@essai.test', role: 'admin', passwordHash });
r.adminAvecUnAutre = await supprimer(admin, { motDePasse: secret });
ecoute.close();
ecoute.closeAllConnections();
console.log(JSON.stringify(r));
`;

type Reponse = { statut: number; corps: Record<string, unknown> };
let r: Record<string, Reponse>;

/** Produit le serveur du programme, le construit, et joue le scénario ; rend la dernière ligne qu'il écrit. */
export function jouer(source: string, nom: string, texte: (stockages: string[]) => string, sqlite: boolean): Record<string, Reponse> {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  const serveur = application!.serveurs[0]!;
  const dossier = join(tmpdir(), `humalis-${nom}`);
  rmSync(join(dossier, 'src'), { recursive: true, force: true });
  rmSync(join(dossier, 'dist'), { recursive: true, force: true });
  for (const [chemin, contenu] of genererProjetServeur(serveur, { nom: 'carnet', source: 'carnet.humalis' })) {
    mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
    writeFileSync(join(dossier, chemin), contenu);
  }
  const code = texte(serveur.donnees.map((d) => camel(d.nom)));
  writeFileSync(join(dossier, 'scenario.mjs'), sqlite ? surSqlite(code) : code);
  if (!existsSync(join(dossier, 'node_modules', 'typescript'))) execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'pipe' });
  execFileSync('npx', ['tsc'], { cwd: dossier, stdio: 'pipe' });
  return JSON.parse(execFileSync('node', ['scenario.mjs'], { cwd: dossier, encoding: 'utf8' }).trim().split('\n').at(-1)!);
}

describe.each(BASES)('supprimer son compte sur un vrai serveur produit, %s', (_base, sqlite) => {
  beforeAll(() => {
    r = jouer(SOURCE, 'suppression-compte', scenario, sqlite);
  }, 300_000);

  it('un visiteur n’a rien à supprimer ; une session par cookie sans le jeton CSRF est refusée', () => {
    expect(r.visiteur!.statut).toBe(401);
    expect(r.sansCsrf!.statut).toBe(403);
  });

  it('il faut le bon mot de passe ; un refus ne touche à rien', () => {
    expect(r.mauvais!.statut).toBe(403);
    expect(r.mauvais!.corps.erreur).toBe('le mot de passe est incorrect');
    expect(r.sansMotDePasse!.statut).toBe(403);
    expect(r.connexionApresRefus!.statut).toBe(200);
  });

  it('le dernier admin ne peut pas supprimer son compte ; avec un second admin, si', () => {
    expect(r.dernierAdmin!.statut).toBe(409);
    expect(r.dernierAdmin!.corps.erreur).toBe('le dernier admin ne peut pas supprimer son compte');
    expect(r.adminAvecUnAutre!.statut).toBe(200);
  });

  it('deux demandes en même temps : une seule supprime, l’autre trouve le compte déjà vidé', () => {
    expect(r.ensemble!.corps.statuts).toEqual([200, 401]);
    expect(r.supprime!.corps).toEqual({ supprime: true });
    expect(r.secondeFois!.statut).toBe(401);
  });

  it('ses fiches « par compte » sont effacées, même au-delà de 500 ; celles des autres restent', () => {
    expect(r.apres!.corps.notesAwa).toBe(0);
    expect(r.apres!.corps.notes).toBe(1);
  });

  it('une fiche qui garde son auteur devient anonyme ; celle d’un autre garde son auteur', () => {
    const { avisA, avisB } = r.apres!.corps as Record<string, Record<string, unknown>>;
    expect(avisA).toMatchObject({ texte: 'super', auteur: '' });
    expect(avisB!.auteur).not.toBe('');
  });

  it('« effacer » efface, sauf une fiche payée, qui devient anonyme', () => {
    const { brouillon, payee, nonPayee, commandeB } = r.apres!.corps as Record<string, Record<string, unknown> | null>;
    expect(brouillon).toBeNull();
    expect(nonPayee).toBeNull();
    expect(payee).toMatchObject({ total: 30, paye: true, auteur: '' });
    expect(commandeB).not.toBeNull();
  });

  it('« garder » ne touche à rien', () => {
    const { journal } = r.apres!.corps as Record<string, Record<string, unknown>>;
    expect(journal!.auteur).not.toBe('');
    expect(journal!.texte).toBe('trace');
  });

  it('ses messages des discussions deviennent anonymes', () => {
    expect(r.apres!.corps.messages).toEqual([
      { auteur: '', auteurNom: '', texte: 'bonjour' },
      { auteur: expect.not.stringMatching(/^$/), auteurNom: 'Bob', texte: 'salut' },
    ]);
  });

  it('le compte est vidé : plus d’adresse, de mot de passe ni de champ, et plus aucune session', () => {
    const compte = r.apres!.corps.compte as Record<string, unknown>;
    expect(r.apres!.corps.parAdresse).toBeNull();
    expect(compte.role).toBe('supprime');
    expect(compte.email).toMatch(/^supprime-.+@supprime\.invalid$/);
    expect(compte.passwordHash ?? null).toBeNull();
    expect(compte.nom ?? null).toBeNull();
    expect((r.apres!.corps.bob as Record<string, unknown>).nom).toBe('Bob');
    expect(r.connexionApres!.statut).toBe(401);
    expect(r.sessionApres!.statut).toBe(401);
  });

  it('l’adresse est libre : un nouveau compte s’y crée sans hériter de rien', () => {
    expect(r.nouveauCompte!.statut).toBe(200);
    expect(r.notesDuNouveau!.corps).toEqual([]);
  });

  it('un compte sans mot de passe (Google, Apple) se supprime sans', () => {
    expect(r.compteSansMotDePasse!.statut).toBe(200);
  });
});

