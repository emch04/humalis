import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';

/**
 * Les défauts signalés par la revue Codex du 12 novembre 2026 (seconde passe), rejoués sur un VRAI serveur produit :
 * 1) le traitement « quand commande est payee » parcourait les fiches de toutes les boutiques ;
 * 2) un calcul révélait le prix d'une fiche que seul son auteur peut lire ;
 * 3) la présence montrait les comptes en ligne de toutes les boutiques ;
 * 6) « creer suivi … dans envoi.suivi » laissait un suivi orphelin quand l'envoi ne s'enregistrait pas.
 */
const SOURCE = readFileSync(new URL('./serveur-attaques-codex.humalis', import.meta.url), 'utf8');

const SCENARIO = `
import { createMemoryUsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { createHmac } from 'node:crypto';
import { creerServeur } from './dist/src/serveur.js';
import { creerStockageMemoire } from './dist/src/humalis/stockage.js';

process.env.STRIPE_CLE_SECRETE ??= 'sk_test_essai';
process.env.STRIPE_SECRET_WEBHOOK ??= 'whsec_essai';
process.env.HUMALIS_ADRESSE_SITE ??= 'https://essai.test';
const secret = 'Essai-Solide-2026!';
const usersStore = createMemoryUsersStore();
const passwordHash = await hashPassword(secret);
const compte = (email, role, plus = {}) => usersStore.create({ email, role, passwordHash, ...plus });
await compte('vendeur.a@essai.test', 'vendeur', { boutique: 'A' });
const vendeurB = await compte('vendeur.b@essai.test', 'vendeur', { boutique: 'B' });
const clientA = await compte('client.a@essai.test', 'client', { boutique: 'A' });
await compte('client.b@essai.test', 'client', { boutique: 'B' });
const s = () => creerStockageMemoire();
// Le stockage des envois tombe en panne à l'écriture : le suivi déjà créé ne doit pas rester.
const envoi = s();
envoi.creer = async () => { throw new Error('panne du stockage'); };
const stockages = { produit: s(), commande: s(), note: s(), panier: s(), suivi: s(), envoi, journal: s(), conversationSupport: s(), messageSupport: s(), pieceSupport: s(), lectureSupport: s(), ecritureSupport: s(), presenceVue: s() };
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
const [vA, vB, cA, cB] = await Promise.all(['vendeur.a', 'vendeur.b', 'client.a', 'client.b'].map((n) => qui(n + '@essai.test')));
const r = {};

// 1) Après le paiement d'une commande de la boutique A, seuls les produits de A changent.
const produitA = (await appel('POST', '/api/produits', vA, { nom: 'a', prix: 5, vendus: 0 })).corps;
const produitB = (await appel('POST', '/api/produits', vB, { nom: 'b', prix: 5, vendus: 0 })).corps;
const commande = (await appel('POST', '/api/commandes', cA, { refs: [produitA.id] })).corps;
const corps = JSON.stringify({ id: 'evt_1', object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_1', object: 'checkout.session', payment_status: 'paid', amount_total: 500, metadata: { donnee: 'commande', id: commande.id, champ: 'total' } } } });
const t = Math.floor(Date.now() / 1000);
const webhook = await fetch(base + '/paiements/webhook', { method: 'POST', headers: { ...json, 'stripe-signature': 't=' + t + ',v1=' + createHmac('sha256', process.env.STRIPE_SECRET_WEBHOOK).update(t + '.' + corps).digest('hex') }, body: corps });
r.paiement = { statut: webhook.status, corps: { a: (await stockages.produit.trouver(produitA.id)).vendus, b: (await stockages.produit.trouver(produitB.id)).vendus } };

// 2) Une note que seul son auteur lit : un autre compte ne la cite pas dans un panier.
const note = (await appel('POST', '/api/notes', cA, { prix: 4242 })).corps;
r.lireNoteAutre = await appel('GET', '/api/notes/' + note.id, cB);
r.panierAutre = await appel('POST', '/api/paniers', cB, { refs: [note.id] });
r.panierAuteur = await appel('POST', '/api/paniers', cA, { refs: [note.id] });

// 3) La présence : le client de A ne voit en ligne que les comptes de A.
const ouvertes = [];
for (const entetes of [vA, vB]) {
  const arret = new AbortController();
  ouvertes.push(arret);
  void fetch(base + '/api/discussions_support_conversations/direct', { headers: entetes, signal: arret.signal }).catch(() => undefined);
}
await new Promise((p) => setTimeout(p, 400));
r.presence = await appel('GET', '/api/presence/moi', cA);
r.presence.corps = { ...r.presence.corps, voitB: r.presence.corps?.comptes?.includes(String(vendeurB.id)) ?? null, nombre: r.presence.corps?.comptes?.length ?? 0 };
for (const arret of ouvertes) arret.abort();

// 6) Une fiche liée ne reste pas seule quand l'écriture principale échoue.
const silence = console.error; console.error = () => {};
r.envoiEnPanne = await appel('POST', '/api/envois', cA, { nom: 'colis' });
console.error = silence;
r.suivisRestants = { statut: 0, corps: { nombre: (await stockages.suivi.lister({ egal: {} })).length } };
void clientA;
ecoute.close();
ecoute.closeAllConnections();
console.log(JSON.stringify(r));
`;

type Reponse = { statut: number; corps: Record<string, unknown> };
let r: Record<string, Reponse>;

describe('les défauts de la revue Codex, sur un vrai serveur produit', () => {
  beforeAll(() => {
    const { application, diagnostics } = compiler(SOURCE);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const dossier = join(tmpdir(), 'humalis-attaques-codex');
    rmSync(join(dossier, 'src'), { recursive: true, force: true });
    rmSync(join(dossier, 'dist'), { recursive: true, force: true });
    for (const [chemin, contenu] of genererProjetServeur(application!.serveurs[0]!, { nom: 'marche', source: 'marche.humalis' })) {
      mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
      writeFileSync(join(dossier, chemin), contenu);
    }
    writeFileSync(join(dossier, 'scenario.mjs'), SCENARIO);
    if (!existsSync(join(dossier, 'node_modules', 'typescript'))) execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: dossier, stdio: 'pipe' });
    execFileSync('npx', ['tsc'], { cwd: dossier, stdio: 'pipe' });
    r = JSON.parse(execFileSync('node', ['scenario.mjs'], { cwd: dossier, encoding: 'utf8' }).trim().split('\n').at(-1)!);
  }, 300_000);

  it('1) après un paiement, le traitement reste dans la boutique de la commande', () => {
    expect(r.paiement!.statut).toBe(200);
    expect(r.paiement!.corps).toEqual({ a: 1, b: 0 });
  });
  it('2) un calcul ne révèle pas une fiche que seul son auteur peut lire', () => {
    expect(r.lireNoteAutre!.statut).toBe(404);
    expect(r.panierAutre!.statut).toBe(400);
    expect([r.panierAuteur!.statut, r.panierAuteur!.corps.total]).toEqual([201, 4242]);
  });
  it('3) la présence ne montre que les comptes de sa boutique', () => {
    expect(r.presence!.statut).toBe(200);
    expect(r.presence!.corps.voitB).toBe(false);
    expect(r.presence!.corps.nombre).toBeGreaterThan(0);
  });
  it('6) une fiche liée s’efface quand l’écriture principale échoue', () => {
    expect(r.envoiEnPanne!.statut).toBe(500);
    expect(r.suivisRestants!.corps.nombre).toBe(0);
  });
});
