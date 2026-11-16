import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { Machine } from '../src/machine/machine.js';
import { installerSiBesoin } from './aide-installation.js';

/**
 * Les défauts de la quatrième revue Codex (14 novembre 2026), rejoués sur un VRAI serveur produit :
 * - une action serveur créait un devis de la boutique A avec le tarif d'une boutique B (le calcul ne recevait pas
 *   les limites de lecture) ;
 * - deux modifications parties ensemble laissaient un panier de 100 € avec un total de 1 € (le total était calculé
 *   sur une lecture faite hors de l'écriture) ;
 * - en mémoire, une action refusée après « changer » répondait 400 mais gardait la modification.
 */
const SOURCE = readFileSync(new URL('./serveur-attaques-codex-4.humalis', import.meta.url), 'utf8');

const SCENARIO = `
import { createMemoryUsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from './dist/src/serveur.js';
import { creerStockageMemoire } from './dist/src/humalis/stockage.js';

const secret = 'Essai-Solide-2026!';
const usersStore = createMemoryUsersStore();
const passwordHash = await hashPassword(secret);
await usersStore.create({ email: 'client.a@essai.test', role: 'client', passwordHash, boutique: 'A' });
const s = () => creerStockageMemoire();
// La lecture des prix peut être ralentie : une deuxième modification part alors pendant la première.
const produit = s();
let lent = false;
const trouver = produit.trouver.bind(produit);
produit.trouver = async (id, ...reste) => { if (lent) { lent = false; await new Promise((p) => setTimeout(p, 300)); } return trouver(id, ...reste); };
const stockages = { tarif: s(), devis: s(), demande: s(), produit, commande: s(), essai: s() };
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

// 1) Une demande de la boutique A cite le tarif de la boutique B ; l'action « chiffrer » crée le devis.
const tarifB = await stockages.tarif.creer({ prix: 4242, boutique: 'B' });
const tarifA = await stockages.tarif.creer({ prix: 7, boutique: 'A' });
const demandeB = (await appel('POST', '/api/demandes', cA, { refs: [tarifB.id] })).corps;
r.chiffrerB = await appel('PATCH', '/api/demandes/faire/chiffrer/' + demandeB.id, cA);
const demandeA = (await appel('POST', '/api/demandes', cA, { refs: [tarifA.id] })).corps;
r.chiffrerA = await appel('PATCH', '/api/demandes/faire/chiffrer/' + demandeA.id, cA);
r.devis = { statut: 0, corps: { totaux: (await stockages.devis.lister({ egal: {} })).map((d) => d.total) } };

// 2) Deux modifications ensemble : la première change la livraison (lecture lente), la seconde met un article à 100 €.
const unEuro = await stockages.produit.creer({ prix: 1 });
const centEuros = await stockages.produit.creer({ prix: 100 });
const commande = (await appel('POST', '/api/commandes', cA, { refs: [unEuro.id], livraison: 0 })).corps;
lent = true;
const premiere = appel('PATCH', '/api/commandes/' + commande.id, cA, { livraison: 0 });
await new Promise((p) => setTimeout(p, 100));
const seconde = appel('PATCH', '/api/commandes/' + commande.id, cA, { refs: [centEuros.id] });
r.premiere = await premiere;
r.seconde = await seconde;
r.commandeFinale = { statut: 0, corps: { ...(await stockages.commande.trouver(commande.id)) } };

// 3) Une action qui change le total puis refuse : rien ne doit rester.
const essai = await stockages.essai.creer({ total: 100 });
r.annuler = await appel('PATCH', '/api/essais/faire/annuler/' + essai.id, cA);
r.essaiFinal = { statut: 0, corps: { ...(await stockages.essai.trouver(essai.id)) } };

ecoute.close();
ecoute.closeAllConnections();
console.log(JSON.stringify(r));
`;

type Reponse = { statut: number; corps: Record<string, unknown> };
let r: Record<string, Reponse>;

describe('les défauts de la quatrième revue Codex, sur un vrai serveur produit', () => {
  beforeAll(() => {
    const { application, diagnostics } = compiler(SOURCE);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const dossier = join(tmpdir(), 'humalis-attaques-codex-4');
    rmSync(join(dossier, 'src'), { recursive: true, force: true });
    rmSync(join(dossier, 'dist'), { recursive: true, force: true });
    for (const [chemin, contenu] of genererProjetServeur(application!.serveurs[0]!, { nom: 'boutiques', source: 'boutiques.humalis' })) {
      mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
      writeFileSync(join(dossier, chemin), contenu);
    }
    writeFileSync(join(dossier, 'scenario.mjs'), SCENARIO);
    installerSiBesoin(dossier);
    execFileSync('npx', ['tsc'], { cwd: dossier, stdio: 'pipe' });
    r = JSON.parse(execFileSync('node', ['scenario.mjs'], { cwd: dossier, encoding: 'utf8' }).trim().split('\n').at(-1)!);
  }, 300_000);

  it('1) une action ne calcule pas un devis avec le tarif d’une autre boutique', () => {
    expect(r.chiffrerB!.statut).toBe(400);
    expect(r.chiffrerA!.statut).toBe(200);
    expect(r.devis!.corps.totaux).toEqual([7]);
  });
  it('2) deux modifications parties ensemble laissent un total juste', () => {
    expect([r.premiere!.statut, r.seconde!.statut]).toEqual([200, 200]);
    expect(r.commandeFinale!.corps.refs).toHaveLength(1);
    expect(r.commandeFinale!.corps.total).toBe(100);
  });
  it('3) en mémoire, une action refusée après « changer » ne garde rien', () => {
    expect(r.annuler!.statut).toBe(400);
    expect(r.essaiFinal!.corps.total).toBe(100);
  });
});

describe('la quatrième revue Codex dans « humalis lancer »', () => {
  it('une action ne calcule pas un devis avec le tarif d’une autre boutique', async () => {
    const machine = new Machine({ adresse: () => 'http://localhost:5173' });
    const charge = await machine.charger(SOURCE);
    expect(charge.ok, machine.erreurs).toBe(true);
    const mdp = machine.serveur!.comptesDEssai[0]!.motDePasse;
    await machine.serveur!.creerCompteDEssai('ca@x.fr', 'client', mdp, { boutique: 'A' });
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
    await appeler('POST', '/auth/login', { email: 'ca@x.fr', password: mdp });
    const tarifs = (machine.serveur as unknown as { stock(nom: string): { creer(v: Record<string, unknown>): Record<string, unknown> } }).stock('tarif');
    const tarifB = tarifs.creer({ prix: 4242, boutique: 'B' });
    const tarifA = tarifs.creer({ prix: 7, boutique: 'A' });
    const demandeB = (await appeler('POST', '/api/demandes', { refs: [tarifB.id] })).json;
    expect((await appeler('PATCH', `/api/demandes/faire/chiffrer/${demandeB.id}`)).statut).toBe(400);
    const demandeA = (await appeler('POST', '/api/demandes', { refs: [tarifA.id] })).json;
    expect((await appeler('PATCH', `/api/demandes/faire/chiffrer/${demandeA.id}`)).statut).toBe(200);
  });
});
