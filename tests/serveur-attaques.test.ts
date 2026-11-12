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
const stockages = { produit: creerStockageMemoire(), secret: creerStockageMemoire(), facture: creerStockageMemoire(), reservation: creerStockageMemoire(), journal: creerStockageMemoire(), article: creerStockageMemoire() };
// Une surveillance d'essai : elle ne fait que retenir ce qu'on lui signale.
const signalees = [];
const surveillance = { intergiciel: () => (_req, _res, next) => next(), gestionnaireErreurs: () => (erreur, _req, _res, next) => next(erreur), vider: async () => {}, signaler: (erreur) => signalees.push(String(erreur?.message ?? erreur)) };
const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages, surveillance });
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
// Les limites sur les valeurs (S7) : à la création, à la modification, et celles par défaut.
const bon = { nom: 'Stylo', prix: 3, stock: 10, contact: 'a@essai.test', statut: 'brouillon', photos: ['/a.png'], note: 'ok' };
const article = await envoyer('POST', '/api/articles', a, bon);
const refuse = async (changement) => (await envoyer('POST', '/api/articles', a, { ...bon, ...changement }));
r.article = article;
r.limitesALaCreation = { statut: 0, corps: {
  prixNegatif: await refuse({ prix: -1 }), prixTropHaut: await refuse({ prix: 1001 }), stockAVirgule: await refuse({ stock: 1.5 }), stockNegatif: await refuse({ stock: -1 }),
  nomCourt: await refuse({ nom: 'S' }), nomLong: await refuse({ nom: 'S'.repeat(21) }), contactFaux: await refuse({ contact: 'pas une adresse' }), statutInconnu: await refuse({ statut: 'vole' }),
  tropDePhotos: await refuse({ photos: ['/a.png', '/b.png', '/c.png'] }), noteImmense: await refuse({ note: 'n'.repeat(10001) }),
} };
r.limitesExactes = { statut: 0, corps: { bas: (await refuse({ prix: 0, nom: 'St', stock: 0 })).statut, haut: (await refuse({ prix: 1000, nom: 'S'.repeat(20), note: 'n'.repeat(10000) })).statut } };
r.limitesALaModification = { statut: 0, corps: {
  prixNegatif: await envoyer('PATCH', '/api/articles/' + article.corps.id, a, { prix: -1 }),
  statutInconnu: await envoyer('PATCH', '/api/articles/' + article.corps.id, a, { statut: 'vole' }),
  noteImmense: await envoyer('PATCH', '/api/articles/' + article.corps.id, a, { note: 'n'.repeat(10001) }),
  permis: await envoyer('PATCH', '/api/articles/' + article.corps.id, a, { prix: 4, statut: 'en_vente' }),
} };
// Un paiement confirmé par Stripe dont le montant n'est pas celui de la fiche : jamais passé sous silence.
const { createHmac } = await import('node:crypto');
const webhook = async (montant) => {
  const corps = JSON.stringify({ id: 'evt_1', object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_1', object: 'checkout.session', payment_status: 'paid', amount_total: montant, metadata: { donnee: 'reservation', id: resa.corps.id, champ: 'total' } } } });
  const t = Math.floor(Date.now() / 1000);
  const reponse = await fetch(base + '/paiements/webhook', { method: 'POST', headers: { ...json, 'stripe-signature': 't=' + t + ',v1=' + createHmac('sha256', process.env.STRIPE_SECRET_WEBHOOK).update(t + '.' + corps).digest('hex') }, body: corps });
  return { statut: reponse.status, corps: { ...(await stockages.reservation.trouver(resa.corps.id)) } };
};
const silence = console.error; console.error = () => {};
r.paiementMauvaisMontant = await webhook(500);
r.paiementBonMontant = await webhook(700);
r.paiementRejoue = await webhook(700);
console.error = silence;
r.journalApresPaiement = { statut: 0, corps: { lignes: (await stockages.journal.lister()).length } };
r.paiementSignale = { statut: 0, corps: { signalees } };
ecoute.close();
ecoute.closeAllConnections();
console.log(JSON.stringify(r));
`;

type Reponse = { statut: number; corps: Record<string, unknown> };
let r: Record<string, Reponse>;
let produits = '';

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
    // Les tests que le compilateur écrit dans le serveur (règles, sessions, attaques) : lancés pour de vrai.
    try {
      produits = execFileSync('npx', ['vitest', 'run', '--dir', 'tests'], { cwd: dossier, encoding: 'utf8', stdio: 'pipe' });
    } catch (erreur) {
      produits = String((erreur as { stdout?: unknown }).stdout ?? erreur);
    }
  }, 300_000);

  it('les tests écrits dans le serveur produit passent tous : règles, sessions et attaques', () => {
    expect(produits).not.toMatch(/\bfailed\b/);
    expect(produits).toMatch(/Test Files\s+3 passed/);
    expect(Number(/Tests\s+(\d+) passed/.exec(produits)?.[1])).toBeGreaterThan(50);
  });
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
  it('un paiement confirmé au mauvais montant : 500, fiche impayée ; Stripe le représente, et le bon montant l’enregistre une seule fois', () => {
    expect(r.paiementMauvaisMontant!.statut).toBe(500);
    expect(r.paiementMauvaisMontant!.corps.paye).toBe(false);
    expect(r.paiementBonMontant!.statut).toBe(200);
    expect(r.paiementBonMontant!.corps.paye).toBe(true);
    expect(r.paiementRejoue!.statut).toBe(200);
    expect(r.journalApresPaiement!.corps.lignes).toBe(1);
  });
  it('ce paiement non enregistré est signalé à la surveillance, une fois, avec le montant reçu et le montant attendu', () => {
    const signalees = r.paiementSignale!.corps.signalees as string[];
    expect(signalees).toHaveLength(1);
    expect(signalees[0]).toContain('paiement de 5 reçu pour « reservation »');
    expect(signalees[0]).toContain('mais la fiche demande 7');
  });
  it('une valeur hors de ses limites est refusée à la création, avec une phrase qui dit pourquoi (S7)', () => {
    const essais = r.limitesALaCreation!.corps as Record<string, Reponse>;
    expect(r.article!.statut).toBe(201);
    expect(Object.values(essais).map((e) => e.statut)).toEqual(Array(10).fill(400));
    expect(essais.prixNegatif!.corps.erreur).toBe('le champ « prix » doit être entre 0 et 1000');
    expect(essais.stockAVirgule!.corps.erreur).toBe('le champ « stock » doit être un nombre entier');
    expect(essais.stockNegatif!.corps.erreur).toBe('le champ « stock » doit être au moins 0');
    expect(essais.nomCourt!.corps.erreur).toBe('le champ « nom » doit avoir entre 2 et 20 caractères');
    expect(essais.contactFaux!.corps.erreur).toBe('le champ « contact » doit être une adresse e-mail');
    expect(essais.statutInconnu!.corps.erreur).toBe('le champ « statut » doit être l’une de ces valeurs : brouillon, en_vente');
    expect(essais.tropDePhotos!.corps.erreur).toBe('le champ « photos » doit avoir au plus 2 éléments');
    expect(essais.noteImmense!.corps.erreur).toBe('le champ « note » doit avoir au plus 10000 caractères');
  });
  it('les valeurs posées exactement sur les limites passent', () => {
    expect(r.limitesExactes!.corps).toEqual({ bas: 201, haut: 201 });
  });
  it('les limites valent aussi dans une modification, et une modification permise passe', () => {
    const essais = r.limitesALaModification!.corps as Record<string, Reponse>;
    expect([essais.prixNegatif!.statut, essais.statutInconnu!.statut, essais.noteImmense!.statut, essais.permis!.statut]).toEqual([400, 400, 400, 200]);
    expect(essais.permis!.corps).toMatchObject({ prix: 4, statut: 'en_vente', nom: 'Stylo' });
  });
  it('un « paye » ordinaire, sans Stripe, s’encaisse à la main', () => {
    expect(r.factureEncaissee!.statut).toBe(200);
    expect(r.factureEncaissee!.corps.paye).toBe(true);
  });
});
