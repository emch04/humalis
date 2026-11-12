import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';

import { Machine } from '../src/machine/machine.js';

/**
 * Les calculs du serveur (« total : nombre calcule somme prix de produit par refs »), trouvés par la revue Codex du
 * 12 novembre 2026 et reproduits sur un vrai serveur produit :
 * 1) un client de la boutique A citait l'identifiant d'un produit de la boutique B dans sa commande : il apprenait son
 *    prix (que la lecture lui refusait) et commandait chez une autre boutique ;
 * 2) une modification de la liste ne recalculait pas le total : commande créée avec un article à 1, puis deux articles
 *    à 1 000, total resté à 1 ; et une fiche payée pouvait encore changer ce qui fait son montant.
 */
const SOURCE = readFileSync(new URL('./serveur-attaques-calculs.humalis', import.meta.url), 'utf8');

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
const compte = (email, role, plus = {}) => usersStore.create({ email, role, passwordHash, ...plus });
await compte('vendeur.a@essai.test', 'vendeur', { boutique: 'A' });
await compte('vendeur.b@essai.test', 'vendeur', { boutique: 'B' });
await compte('client.a@essai.test', 'client', { boutique: 'A' });
await compte('admin@essai.test', 'admin');
const s = () => creerStockageMemoire();
const stockages = { produit: s(), commande: s(), journal: s() };
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
const [vA, vB, cA, admin] = await Promise.all(['vendeur.a', 'vendeur.b', 'client.a', 'admin'].map((n) => qui(n + '@essai.test')));
const pasCher = (await appel('POST', '/api/produits', vA, { nom: 'pas cher', prix: 1 })).corps.id;
const cher = (await appel('POST', '/api/produits', vA, { nom: 'cher', prix: 1000 })).corps.id;
const deB = (await appel('POST', '/api/produits', vB, { nom: 'de B', prix: 4242 })).corps.id;
const r = {};
r.lireProduitB = await appel('GET', '/api/produits/' + deB, cA);
r.commandeAvecB = await appel('POST', '/api/commandes', cA, { refs: [deB] });
r.commande = await appel('POST', '/api/commandes', cA, { refs: [pasCher] });
const id = r.commande.corps.id;
r.modifiee = await appel('PATCH', '/api/commandes/' + id, cA, { refs: [cher, cher] });
r.modifieeAvecB = await appel('PATCH', '/api/commandes/' + id, cA, { refs: [deB] });
await stockages.commande.modifier(id, { paye: true });
r.payeeModifiee = await appel('PATCH', '/api/commandes/' + id, cA, { refs: [pasCher] });
r.payeeParAdmin = await appel('PATCH', '/api/commandes/' + id, admin, { refs: [pasCher] });
ecoute.close();
ecoute.closeAllConnections();
console.log(JSON.stringify(r));
`;

type Reponse = { statut: number; corps: Record<string, unknown> };
let r: Record<string, Reponse>;

describe('les calculs sur un vrai serveur produit', () => {
  beforeAll(() => {
    const { application, diagnostics } = compiler(SOURCE);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const dossier = join(tmpdir(), 'humalis-attaques-calculs');
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

  it('un produit d’une autre boutique ne se cite pas dans une commande, ni à la création ni à la modification', () => {
    expect(r.lireProduitB!.statut).toBe(404);
    expect(r.commandeAvecB!.statut).toBe(400);
    expect(r.commandeAvecB!.corps.erreur).toContain("n'existe pas");
    expect(r.modifieeAvecB!.statut).toBe(400);
  });
  it('une modification de la liste recalcule le total', () => {
    expect([r.commande!.statut, r.commande!.corps.total]).toEqual([201, 1]);
    expect([r.modifiee!.statut, r.modifiee!.corps.total]).toEqual([200, 2000]);
  });
  it('une fiche payée garde ce qui fait son montant ; un admin peut la corriger', () => {
    expect(r.payeeModifiee!.statut).toBe(409);
    expect([r.payeeParAdmin!.statut, r.payeeParAdmin!.corps.total]).toEqual([200, 1]);
  });
});

describe('les calculs dans « humalis lancer »', () => {
  it('mêmes refus et même recalcul que le serveur produit', async () => {
    const machine = new Machine({ adresse: () => 'http://localhost:5173' });
    const charge = await machine.charger(SOURCE);
    expect(charge.ok, machine.erreurs).toBe(true);
    const mdp = machine.serveur!.comptesDEssai[0]!.motDePasse;
    await machine.serveur!.creerCompteDEssai('vb@x.fr', 'vendeur', mdp, { boutique: 'B' });
    await machine.serveur!.creerCompteDEssai('ca@x.fr', 'client', mdp, { boutique: 'A' });
    await machine.serveur!.creerCompteDEssai('va@x.fr', 'vendeur', mdp, { boutique: 'A' });
    const client = async (email: string) => {
      const cookies = new Map<string, string>();
      const appeler = async (methode: string, chemin: string, corps?: unknown) => {
        const csrf = cookies.get('astratra_csrf');
        const reponse = await machine.traiter({ methode, chemin, requete: new URLSearchParams(), entetes: { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), ...(csrf && methode !== 'GET' ? { 'x-csrf-token': csrf } : {}) }, corps });
        for (const ligne of ([] as string[]).concat(reponse.entetes['set-cookie'] ?? [])) {
          const paire = ligne.split('; ')[0]!;
          cookies.set(paire.slice(0, paire.indexOf('=')), paire.slice(paire.indexOf('=') + 1));
        }
        const texte = typeof reponse.corps === 'string' ? reponse.corps : '';
        return { statut: reponse.statut, json: (texte ? JSON.parse(texte) : undefined) as Record<string, unknown> };
      };
      await appeler('GET', '/auth/me');
      await appeler('POST', '/auth/login', { email, password: mdp });
      return appeler;
    };
    const [va, vb, ca] = [await client('va@x.fr'), await client('vb@x.fr'), await client('ca@x.fr')];
    const pasCher = (await va('POST', '/api/produits', { nom: 'pas cher', prix: 1 })).json.id;
    const cher = (await va('POST', '/api/produits', { nom: 'cher', prix: 1000 })).json.id;
    const deB = (await vb('POST', '/api/produits', { nom: 'de B', prix: 4242 })).json.id;
    expect((await ca('POST', '/api/commandes', { refs: [deB] })).statut).toBe(400);
    const commande = await ca('POST', '/api/commandes', { refs: [pasCher] });
    expect([commande.statut, commande.json.total]).toEqual([201, 1]);
    const modifiee = await ca('PATCH', `/api/commandes/${commande.json.id}`, { refs: [cher, cher] });
    expect([modifiee.statut, modifiee.json.total]).toEqual([200, 2000]);
    expect((await ca('PATCH', `/api/commandes/${commande.json.id}`, { refs: [deB] })).statut).toBe(400);
  });
});
