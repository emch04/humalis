import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';

/**
 * Des attaques rejouées sur un VRAI serveur produit (revue du 12 novembre 2026) : chaque champ que seul le serveur
 * écrit reste hors d'atteinte d'une requête, à la création comme à la modification, sans casser les usages permis
 * (un admin corrige un total, un gérant encaisse une facture à la main, le webhook marque payé).
 */
const SOURCE = readFileSync(new URL('./serveur-attaques.humalis', import.meta.url), 'utf8');

const SCENARIO = `
import { createMemoryUsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from './dist/src/serveur.js';
import { creerStockageMemoire } from './dist/src/humalis/stockage.js';

process.env.STRIPE_CLE_SECRETE ??= 'sk_test_essai';
process.env.STRIPE_SECRET_WEBHOOK ??= 'whsec_essai';
process.env.HUMALIS_ADRESSE_SITE ??= 'https://essai.test';
const secret = 'Essai-Solide-2026!';
const usersStore = createMemoryUsersStore();
const passwordHash = await hashPassword(secret);
await usersStore.create({ email: 'admin@essai.test', role: 'admin', passwordHash });
const awa = await usersStore.create({ email: 'awa@essai.test', role: 'user', passwordHash });
const bob = await usersStore.create({ email: 'bob@essai.test', role: 'user', passwordHash });
await usersStore.create({ email: 'gerant@essai.test', role: 'gerant', passwordHash });
const stockages = { produit: creerStockageMemoire(), secret: creerStockageMemoire(), facture: creerStockageMemoire(), reservation: creerStockageMemoire(), journal: creerStockageMemoire() };
const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages });
const ecoute = app.listen(0);
await new Promise((pret) => ecoute.once('listening', pret));
const base = 'http://127.0.0.1:' + ecoute.address().port;
const json = { 'content-type': 'application/json' };
const jeton = async (email) => (await (await fetch(base + '/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email, password: secret }) })).json()).data.token;
const qui = async (email) => ({ ...json, authorization: 'Bearer ' + (await jeton(email)) });
const [admin, a, b, gerant] = [await qui('admin@essai.test'), await qui('awa@essai.test'), await qui('bob@essai.test'), await qui('gerant@essai.test')];
const envoyer = async (methode, chemin, entetes, corps) => {
  const reponse = await fetch(base + chemin, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) });
  return { statut: reponse.status, corps: await reponse.json().catch(() => null) };
};
await stockages.produit.creer({ nom: 'coupe', prix: 20 });
const secretAwa = await envoyer('POST', '/api/secrets', a, { texte: 'à Awa' });
const resa = await envoyer('POST', '/api/reservations', a, { nom: 'coupe', refs: [], frais: 5 });
const facture = await envoyer('POST', '/api/factures', gerant, { montant: 30 });
const r = {
  secretAwa, resa, facture,
  deplacerSecret: await envoyer('PATCH', '/api/secrets/' + secretAwa.corps.id, a, { compte: String(bob.id) }),
  secretsDeBob: await envoyer('GET', '/api/secrets', b),
  payerSansPayer: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, a, { paye: true }),
  adminPayerSansPayer: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, admin, { paye: true }),
  totalParAuteur: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, a, { total: 0 }),
  totalParAdmin: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, admin, { total: 7 }),
  auteurChange: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, a, { auteur: String(bob.id) }),
  fraisTropHauts: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, a, { frais: 5000 }),
  fraisNegatifs: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, a, { frais: -5000 }),
  fraisPermis: await envoyer('PATCH', '/api/reservations/' + resa.corps.id, a, { frais: 15 }),
  factureEncaissee: await envoyer('PATCH', '/api/factures/' + facture.corps.id, gerant, { paye: true }),
  champHerite: await envoyer('POST', '/api/secrets', a, { texte: 'x', toString: 'y' }),
  champConstructeur: await envoyer('PATCH', '/api/secrets/' + secretAwa.corps.id, a, { hasOwnProperty: 1 }),
  jsonCasse: await (async () => { const reponse = await fetch(base + '/api/secrets', { method: 'POST', headers: a, body: '{"texte":' }); return { statut: reponse.status, corps: await reponse.json().catch(() => null) }; })(),
};
ecoute.close();
ecoute.closeAllConnections();
console.log(JSON.stringify(r));
`;

type Reponse = { statut: number; corps: Record<string, unknown> };
let r: Record<string, Reponse>;

describe('des attaques sur un vrai serveur produit', () => {
  beforeAll(() => {
    const { application, diagnostics } = compiler(SOURCE);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const dossier = join(tmpdir(), 'humalis-attaques');
    rmSync(join(dossier, 'src'), { recursive: true, force: true });
    rmSync(join(dossier, 'dist'), { recursive: true, force: true });
    for (const [chemin, contenu] of genererProjetServeur(application!.serveurs[0]!, { nom: 'attaques', source: 'attaques.humalis' })) {
      mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
      writeFileSync(join(dossier, chemin), contenu);
    }
    writeFileSync(join(dossier, 'scenario.mjs'), SCENARIO);
    if (!existsSync(join(dossier, 'node_modules', 'typescript'))) execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'pipe' });
    execFileSync('npx', ['tsc'], { cwd: dossier, stdio: 'pipe' });
    r = JSON.parse(execFileSync('node', ['scenario.mjs'], { cwd: dossier, encoding: 'utf8' }).trim().split('\n').at(-1)!);
  }, 300_000);

  it('les fiches de départ sont créées', () => {
    expect([r.secretAwa!.statut, r.resa!.statut, r.facture!.statut]).toEqual([201, 201, 201]);
  });
  it('un compte ne déplace pas sa fiche chez un autre', () => {
    expect(r.deplacerSecret!.statut).toBe(400);
    expect(JSON.stringify(r.secretsDeBob!.corps)).not.toContain('à Awa');
  });
  it('personne ne marque une fiche payée par Stripe sans payer, pas même un admin', () => {
    expect([r.payerSansPayer!.statut, r.adminPayerSansPayer!.statut]).toEqual([400, 400]);
  });
  it('un total calculé ne change que par un admin', () => {
    expect([r.totalParAuteur!.statut, r.totalParAdmin!.statut]).toEqual([400, 200]);
  });
  it('l’auteur ne change pas', () => {
    expect(r.auteurChange!.statut).toBe(400);
  });
  it('« au plus » vaut aussi dans une modification', () => {
    expect([r.fraisTropHauts!.statut, r.fraisNegatifs!.statut, r.fraisPermis!.statut]).toEqual([400, 400, 200]);
  });
  it('un nom hérité des objets JavaScript (toString, hasOwnProperty) est un champ inconnu comme un autre', () => {
    expect([r.champHerite!.statut, r.champConstructeur!.statut]).toEqual([400, 400]);
    expect(String(r.champHerite!.corps.erreur)).toContain("n'existe pas");
  });
  it('un corps illisible reste une erreur 400', () => {
    expect(r.jsonCasse!.statut).toBe(400);
  });
  it('un « paye » ordinaire, sans Stripe, s’encaisse à la main', () => {
    expect(r.factureEncaissee!.statut).toBe(200);
    expect(r.factureEncaissee!.corps.paye).toBe(true);
  });
});
