import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { BASES, surSqlite } from './aide-sqlite.js';

import { compiler as compilerSource } from '../src/compilateur.js';

/**
 * Les trois défauts graves de la troisième revue Codex (12 novembre 2026), rejoués sur un VRAI serveur produit :
 * 1) une modification lancée juste avant la confirmation du paiement écrivait un panier plus cher dans une
 *    commande déjà marquée payée (100 € de produits pour 1 € encaissé) ;
 * 2) un champ de compte nommé « password_hash » devenait passwordHash, l'empreinte du mot de passe ;
 * 3) un calcul lisait le prix d'un tarif d'une autre boutique quand la donnée « tarif » n'avait pas de route.
 */
const SOURCE = readFileSync(new URL('./serveur-attaques-codex-graves.humalis', import.meta.url), 'utf8');

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
await usersStore.create({ email: 'client.a@essai.test', role: 'client', passwordHash, boutique: 'A' });
const s = () => creerStockageMemoire();
// La lecture des prix peut être ralentie : le paiement arrive alors pendant la modification.
const produit = s();
let lent = false;
const trouver = produit.trouver.bind(produit);
produit.trouver = async (id, ...reste) => { if (lent) await new Promise((p) => setTimeout(p, 400)); return trouver(id, ...reste); };
const stockages = { produit, commande: s(), journal: s(), tarif: s(), panier: s() };
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
const cA = await qui('client.a@essai.test');
const r = {};

// 1) La course : la modification lit les prix (lentement), le paiement de 1 € est confirmé pendant ce temps.
const unEuro = await stockages.produit.creer({ nom: 'petit', prix: 1 });
const centEuros = await stockages.produit.creer({ nom: 'grand', prix: 100 });
const commande = (await appel('POST', '/api/commandes', cA, { refs: [unEuro.id] })).corps;
lent = true;
const modification = appel('PATCH', '/api/commandes/' + commande.id, cA, { refs: [centEuros.id] });
await new Promise((p) => setTimeout(p, 100));
const corps = JSON.stringify({ id: 'evt_1', object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_1', object: 'checkout.session', payment_status: 'paid', amount_total: 100, metadata: { donnee: 'commande', id: commande.id, champ: 'total' } } } });
const t = Math.floor(Date.now() / 1000);
const webhook = await fetch(base + '/paiements/webhook', { method: 'POST', headers: { ...json, 'stripe-signature': 't=' + t + ',v1=' + createHmac('sha256', process.env.STRIPE_SECRET_WEBHOOK).update(t + '.' + corps).digest('hex') }, body: corps });
r.webhook = { statut: webhook.status, corps: null };
r.modification = await modification;
lent = false;
r.commandeFinale = { statut: 0, corps: { ...(await stockages.commande.trouver(commande.id)) } };

// 3) Un tarif de la boutique B, sans route : un panier de la boutique A ne lit pas son prix.
const tarifB = await stockages.tarif.creer({ prix: 4242, boutique: 'B' });
const tarifA = await stockages.tarif.creer({ prix: 7, boutique: 'A' });
r.panierAvecB = await appel('POST', '/api/paniers', cA, { refs: [tarifB.id] });
r.panierAvecA = await appel('POST', '/api/paniers', cA, { refs: [tarifA.id] });
ecoute.close();
ecoute.closeAllConnections();
console.log(JSON.stringify(r));
`;

type Reponse = { statut: number; corps: Record<string, unknown> };
let r: Record<string, Reponse>;

describe('les défauts graves de la revue Codex, sur un vrai serveur produit', () => {
  beforeAll(() => {
    const { application, diagnostics } = compiler(SOURCE);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const dossier = join(tmpdir(), 'humalis-attaques-codex-graves');
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

  it('1) une modification pendant le paiement ne gonfle pas une commande payée', () => {
    // La modification et le paiement se suivent, jamais mêlés. Depuis la quatrième revue, la modification prend le
    // verrou la première (elle relit la fiche dans sa transaction) : le panier passe à 100 €, puis le paiement de
    // 1 € est refusé (500, Stripe le renverra, le journal dit de rembourser) sans marquer la commande payée.
    // Dans l'autre ordre, le paiement passerait et la modification recevrait 409. Jamais une commande payée à 1 €
    // avec 100 € de produits.
    const finale = r.commandeFinale!.corps;
    if (finale.paye === true) {
      expect([r.webhook!.statut, r.modification!.statut]).toEqual([200, 409]);
      expect(finale.total).toBe(1);
    } else {
      expect([r.webhook!.statut, r.modification!.statut]).toEqual([500, 200]);
      expect(finale.total).toBe(100);
    }
  });
  it('2) un champ de compte nommé comme un champ interne est refusé', () => {
    const source = 'serveur "s" :\n    roles gerant\n    compte :\n        password_hash : texte\n    route "equipe" :\n        seul gerant peut lire comptes\n\npage "a" :\n    titre "A"\n';
    const erreurs = compilerSource(source).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message);
    expect(erreurs).toContain('« password_hash » existe déjà sur un compte : donnez un autre nom à ce champ.');
  });
  it('3) un calcul ne lit pas une donnée d’une autre boutique, même sans route', () => {
    expect(r.panierAvecB!.statut).toBe(400);
    expect([r.panierAvecA!.statut, r.panierAvecA!.corps.total]).toEqual([201, 7]);
  });
});
