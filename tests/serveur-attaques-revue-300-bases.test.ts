import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BASES } from './aide-bases.js';
import { jouer, type Reponse } from './aide-serveur-produit.js';

/**
 * La revue de sécurité de la 3.0.0, seconde partie (17 novembre 2026) : ce qui doit rester vrai sur CHAQUE base, rejoué sur
 * un vrai serveur produit. En mémoire et sur SQLite toujours ; sur PostgreSQL, MySQL, MariaDB et une base de documents
 * quand HUMALIS_ESSAI_POSTGRES, HUMALIS_ESSAI_MYSQL, HUMALIS_ESSAI_MARIADB ou HUMALIS_ESSAI_DOCUMENTS donnent un serveur.
 *
 * - la synchronisation d'une donnée « par boutique » : une boutique ne reçoit ni les fiches ni les suppressions d'une
 *   autre, et ne les change pas par un lot d'envois ;
 * - un identifiant suivi d'une espace n'est pas l'identifiant ;
 * - un texte mal formé ne provoque pas d'erreur 500, et le journal ne garde pas le contenu de la fiche ;
 * - une action faite six fois envoie six e-mails, même quand la base fait rejouer une transaction ;
 * - « pour chaque … changer », fait six fois en même temps, ne perd aucune mise à jour.
 */
const SOURCE = readFileSync(new URL('./serveur-attaques-revue-300-bases.humalis', import.meta.url), 'utf8');

const scenario = (stockages: string[]) => `
import { createMemoryUsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from './dist/src/serveur.js';
import { creerStockageMemoire } from './dist/src/humalis/stockage.js';
import { inspect } from 'node:util';

// Ce que le serveur écrit dans son journal d'erreurs est gardé ici, pour le relire.
const journal = [];
console.error = (...morceaux) => { journal.push(morceaux.map((m) => (typeof m === 'string' ? m : inspect(m, { depth: 4 }))).join(' ')); };
process.env.HUMALIS_LIMITE_CONNEXION = '1000';
process.env.HUMALIS_LIMITE_API = '100000';
const secret = 'Essai-Solide-2026!';
const usersStore = createMemoryUsersStore();
const passwordHash = await hashPassword(secret);
await usersStore.create({ email: 'vendeur.a@essai.test', role: 'vendeur', passwordHash, boutique: 'A' });
await usersStore.create({ email: 'vendeur.b@essai.test', role: 'vendeur', passwordHash, boutique: 'B' });
await usersStore.create({ email: 'admin@essai.test', role: 'admin', passwordHash });
const s = () => creerStockageMemoire();
const stockages = { ${stockages.map((n) => `${n}: s()`).join(', ')} };
// Les e-mails ne partent pas : ils sont comptés.
const boite = [];
const emails = { pret: () => true, envoyer: async (envoi) => { boite.push(envoi); return true; } };
const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages, emails });
const ecoute = app.listen(0);
await new Promise((pret) => ecoute.once('listening', pret));
const base = 'http://127.0.0.1:' + ecoute.address().port;
const json = { 'content-type': 'application/json' };
const jeton = async (email) => ({ ...json, authorization: 'Bearer ' + (await (await fetch(base + '/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ email, password: secret }) })).json()).data.token });
const appel = async (methode, chemin, entetes, corps) => {
  const reponse = await fetch(base + chemin, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) });
  return { statut: reponse.status, corps: await reponse.json().catch(() => null) };
};
const [A, B, admin] = [await jeton('vendeur.a@essai.test'), await jeton('vendeur.b@essai.test'), await jeton('admin@essai.test')];
const r = {};
const operation = () => crypto.randomUUID().replaceAll('-', '');
const envoyer = (entetes, envois) => appel('POST', '/api/notes/synchro', entetes, { heure: Date.now(), envois });

// 1. La synchronisation, entre deux boutiques.
const noteA = (await appel('POST', '/api/notes', A, { texte: 'de A' })).corps.id;
const noteB = (await appel('POST', '/api/notes', B, { texte: 'de B' })).corps.id;
const vueA = await appel('GET', '/api/notes/synchro?depuis=0', A);
r.synchroDeA = { statut: vueA.statut, corps: { ids: vueA.corps.changements.map((c) => c.id), aSaNote: vueA.corps.changements.some((c) => c.id === noteA), aCelleDeB: vueA.corps.changements.some((c) => c.id === noteB) } };
const forcee = await appel('GET', '/api/notes/synchro?depuis=0&boutique=B', A);
r.synchroForcee = { statut: forcee.statut, corps: { aCelleDeB: forcee.corps.changements.some((c) => c.id === noteB) } };
// A change, puis supprime, la note de B par un lot d'envois.
const changer = await envoyer(A, [{ operation: operation(), id: noteB, modifieLe: Date.now(), valeurs: { texte: 'changée par A' } }]);
const retirer = await envoyer(A, [{ operation: operation(), id: noteB, modifieLe: Date.now(), supprime: true }]);
r.lotDeA = { statut: changer.statut, corps: { changer: changer.corps.resultats?.[0]?.etat, actuelle: changer.corps.resultats?.[0]?.actuelle ?? null, retirer: retirer.corps.resultats?.[0]?.etat } };
r.noteDeBApres = await appel('GET', '/api/notes/' + noteB, B);
// A crée une note en la disant de la boutique B.
const neuve = crypto.randomUUID();
const creer = await envoyer(A, [{ operation: operation(), id: neuve, modifieLe: Date.now(), valeurs: { texte: 'glissée chez B', boutique: 'B' } }]);
const chezB = await appel('GET', '/api/notes', B);
r.creationChezB = { statut: creer.statut, corps: { etat: creer.corps.resultats?.[0]?.etat, vueParB: chezB.corps.some((n) => n.id === neuve) } };
// B supprime sa note : A n'en apprend rien.
const curseurA = vueA.corps.curseur;
await appel('DELETE', '/api/notes/' + noteB, B);
const apres = await appel('GET', '/api/notes/synchro?depuis=' + curseurA, A);
r.suppressionDeB = { statut: apres.statut, corps: { vueParA: apres.corps.changements.some((c) => c.id === noteB) } };

// 2. Un identifiant suivi d'une espace n'est pas l'identifiant.
r.idAvecEspace = await appel('GET', '/api/notes/' + noteA + '%20', A);
r.modifierAvecEspace = await appel('PATCH', '/api/notes/' + noteA + '%20', A, { texte: 'par un autre identifiant' });

// 4. Un texte mal formé (un demi-caractère, \\ud800) : pas d'erreur 500, et le contenu de la fiche ne va pas au journal.
{
  const reponse = await fetch(base + '/api/billets', { method: 'POST', headers: A, body: '{"nom":"\\\\ud800 contenu-prive-de-la-fiche"}' });
  await new Promise((p) => setTimeout(p, 300));
  r.demiCaractere = { statut: reponse.status, corps: { auJournal: journal.some((ligne) => ligne.includes('contenu-prive-de-la-fiche')) } };
}

// 3. Six billets confirmés en même temps : six e-mails aux admins, un par confirmation.
await stockages.compteur.creer({ n: 0 });
const billets = [];
for (let i = 0; i < 6; i++) billets.push((await appel('POST', '/api/billets', A, { nom: 'Billet ' + i })).corps.id);
const avant = boite.length;
const confirmations = await Promise.all(billets.map((id) => appel('PATCH', '/api/billets/faire/confirmer/' + id, A, {})));
await new Promise((p) => setTimeout(p, 500));
r.confirmations = { statut: 0, corps: { reussies: confirmations.filter((c) => c.statut === 200).length, emails: boite.length - avant, compteur: (await appel('GET', '/api/compteurs', A)).corps[0]?.n } };

ecoute.close();
ecoute.closeAllConnections();
console.log(JSON.stringify(r));
`;

let r: Record<string, Reponse>;

describe.each(BASES)('la revue de sécurité de la 3.0.0, sur chaque base, %s', (_nom, base) => {
  beforeAll(() => {
    r = jouer(SOURCE, 'revue-300-bases', scenario, base);
  }, 300_000);

  it('la synchronisation ne donne à une boutique que ses fiches, même en demandant celles d’une autre', () => {
    expect(r.synchroDeA!.statut).toBe(200);
    expect(r.synchroDeA!.corps).toMatchObject({ aSaNote: true, aCelleDeB: false });
    expect(r.synchroForcee!.corps).toEqual({ aCelleDeB: false });
  });

  it('un lot d’envois ne change ni ne supprime la fiche d’une autre boutique, et n’en montre rien', () => {
    // Refusé, ou ignoré (une modification plus récente l'emporte) : jamais appliqué, et rien de la fiche ne revient.
    expect(['refuse', 'ignore']).toContain(r.lotDeA!.corps.changer);
    expect(['refuse', 'ignore']).toContain(r.lotDeA!.corps.retirer);
    expect(r.lotDeA!.corps.actuelle).toBeNull();
    expect(r.noteDeBApres!.statut).toBe(200);
    expect(r.noteDeBApres!.corps.texte).toBe('de B');
  });

  it('une fiche créée par un lot d’envois reste dans la boutique de son auteur', () => {
    expect(r.creationChezB!.corps.vueParB).toBe(false);
  });

  it('la suppression d’une fiche n’est pas annoncée à une autre boutique', () => {
    expect(r.suppressionDeB!.corps).toEqual({ vueParA: false });
  });

  it('un identifiant suivi d’une espace n’est pas l’identifiant', () => {
    expect(r.idAvecEspace!.statut).toBe(404);
    expect(r.modifierAvecEspace!.statut).toBe(404);
  });

  it('un texte mal formé ne provoque pas d’erreur 500, et le contenu de la fiche ne va pas au journal', () => {
    expect(r.demiCaractere!.corps).toEqual({ auJournal: false });
    expect(r.demiCaractere!.statut).toBeLessThan(500);
  });

  it('six confirmations en même temps envoient six e-mails, pas un de plus', () => {
    expect(r.confirmations!.corps.reussies).toBe(6);
    expect(r.confirmations!.corps.emails).toBe(6);
  });

  it('six confirmations en même temps ajoutent six au compteur : aucune mise à jour n’est perdue', () => {
    expect(r.confirmations!.corps.reussies).toBe(6);
    expect(r.confirmations!.corps.compteur).toBe(6);
  });
});
