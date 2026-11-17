import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BASES } from './aide-bases.js';
import { jouer, type Reponse } from './aide-serveur-produit.js';
import { Machine } from '../src/machine/machine.js';

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

process.env.HUMALIS_PAIEMENT_ADRESSE ??= 'http://127.0.0.1:9/relais';
process.env.HUMALIS_PAIEMENT_SECRET ??= 'secret-du-relais-de-paiement-essai-0123456789';
process.env.HUMALIS_LIMITE_CONNEXION = '1000';
process.env.HUMALIS_REUNIONS_ADRESSE ??= 'wss://livekit.essai.test';
process.env.HUMALIS_REUNIONS_CLE ??= 'cle-essai';
process.env.HUMALIS_REUNIONS_SECRET ??= 'secret-essai-assez-long-pour-livekit-0123456789';
const secret = 'Essai-Solide-2026!';
const usersStore = createMemoryUsersStore();
const passwordHash = await hashPassword(secret);
const awa = await usersStore.create({ email: 'awa@essai.test', role: 'client', passwordHash, nom: 'Awa' });
const bob = await usersStore.create({ email: 'bob@essai.test', role: 'client', passwordHash, nom: 'Bob' });
await usersStore.create({ email: 'admin@essai.test', role: 'admin', passwordHash });
const google = await usersStore.create({ email: 'google@essai.test', role: 'client', passwordHash });
await usersStore.create({ email: 'vera@essai.test', role: 'vendeur', passwordHash, nom: 'Vera' });
const s = () => creerStockageMemoire();
const stockages = { ${stockages.map((n) => `${n}: s()`).join(', ')} };
const appareils = s();
const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages, appareils });
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
const [A, B, admin, vendeur] = [await jeton('awa@essai.test'), await jeton('bob@essai.test'), await jeton('admin@essai.test'), await jeton('vera@essai.test')];
const deposer = async (entetes, texte) => {
  const formulaire = new FormData();
  formulaire.append('fichier', new Blob([texte]), 'piece.txt');
  const { 'content-type': _json, ...sans } = entetes;
  return (await (await fetch(base + '/api/discussions_aide_pieces', { method: 'POST', headers: sans, body: formulaire })).json()).id;
};
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
// Une vraie discussion : chacun écrit au vendeur, Awa avec une pièce jointe.
const pieceA = await deposer(A, 'le fichier d’Awa');
const pieceB = await deposer(B, 'le fichier de Bob');
await appel('POST', '/api/discussions_aide_messages', A, { texte: 'bonjour', piece: pieceA });
await appel('POST', '/api/discussions_aide_messages', B, { texte: 'salut', piece: pieceB });
const annonceA = (await appel('POST', '/api/annonces', A, { texte: 'à vendre' })).corps.id;
const annonceB = (await appel('POST', '/api/annonces', B, { texte: 'à donner' })).corps.id;
// Le temps réel : des appels dans les deux sens, la présence, une exclusion d'une réunion, un appareil inscrit.
const appelParAwa = (await appel('POST', '/api/appels', A, { appele: 'vera@essai.test', video: true })).corps.id;
const appelVersAwa = (await appel('POST', '/api/appels', vendeur, { appele: 'awa@essai.test', video: false })).corps.id;
const appelDeBob = (await appel('POST', '/api/appels', B, { appele: 'vera@essai.test', video: false })).corps.id;
const dansUneHeure = new Date(Date.now() + 3600000).toISOString();
for (const compte of [idA, idB]) {
  await stockages.presenceVue.creer({ compte, vuLe: new Date().toISOString() });
  await stockages.exclusionSalle.creer({ piece: 'empreinte-de-la-salle', compte, jusqua: dansUneHeure });
  await appareils.creer({ genre: 'web', compte, cle: 'abonnement-' + compte });
}
// Les appareils de Bob ont tout reçu jusqu'ici : ils reprendront à ce curseur.
const curseurAvis = (await appel('GET', '/api/avis/synchro?depuis=0', B)).corps.curseur;
const curseurAnnonces = (await appel('GET', '/api/annonces/synchro?depuis=0', B)).corps.curseur;

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
  messages: (await stockages.messageAide.lister()).map((m) => ({ auteur: m.auteur, auteurNom: m.auteurNom, texte: m.texte, piece: m.piece, pieceNom: m.pieceNom })).sort((a, b) => a.texte.localeCompare(b.texte)),
  pieceA: await trouver(stockages.pieceAide, pieceA),
  pieceB: (await trouver(stockages.pieceAide, pieceB))?.contenu ?? null,
  lecturesAwa: (await stockages.lectureAide.lister({ egal: { compte: idA } })).length,
  annonceA: await trouver(stockages.annonce, annonceA),
  annonceB: await trouver(stockages.annonce, annonceB),
  parAdresse: await usersStore.findByEmail('awa@essai.test'),
  compte: await usersStore.findById(idA),
  bob: await usersStore.findById(idB),
} };
r.conversations = { statut: 0, corps: { liste: (await appel('GET', '/api/discussions_aide_conversations', vendeur)).corps.map((c) => ({ titre: c.titre, personne: c.personne })).sort((a, b) => a.titre.localeCompare(b.titre)) } };
r.appelParAwa = await appel('GET', '/api/appels/' + appelParAwa, vendeur);
r.appelVersAwa = await appel('GET', '/api/appels/' + appelVersAwa, vendeur);
r.appelDeBob = await appel('GET', '/api/appels/' + appelDeBob, B);
r.tempsReel = { statut: 0, corps: {
  presence: (await stockages.presenceVue.lister()).map((l) => l.compte),
  exclusions: (await stockages.exclusionSalle.lister()).map((l) => l.compte),
  appareils: (await appareils.lister()).map((l) => l.compte),
} };
r.synchroAvis = await appel('GET', '/api/avis/synchro?depuis=' + curseurAvis, B);
r.synchroAnnonces = await appel('GET', '/api/annonces/synchro?depuis=' + curseurAnnonces, B);
r.ids = { statut: 0, corps: { avisA, annonceA, idB } };
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

let r: Record<string, Reponse>;

describe.each(BASES)('supprimer son compte sur un vrai serveur produit, %s', (_nom, base) => {
  beforeAll(() => {
    r = jouer(SOURCE, 'suppression-compte', scenario, base);
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

  it('ses messages des discussions deviennent anonymes, et perdent leur pièce jointe', () => {
    expect(r.apres!.corps.messages).toEqual([
      { auteur: '', auteurNom: '', texte: 'bonjour', piece: '', pieceNom: '' },
      { auteur: expect.not.stringMatching(/^$/), auteurNom: 'Bob', texte: 'salut', piece: expect.not.stringMatching(/^$/), pieceNom: 'piece.txt' },
    ]);
  });

  it('ses conversations ne la nomment plus ; celles des autres ne changent pas', () => {
    expect(r.conversations!.corps.liste).toEqual([
      { titre: 'Bob', personne: (r.ids!.corps as Record<string, unknown>).idB },
      { titre: 'Compte supprimé', personne: '' },
    ]);
  });

  it('ses pièces jointes sont effacées du stockage ; celles des autres restent', () => {
    expect(r.apres!.corps.pieceA).toBeNull();
    expect(r.apres!.corps.pieceB).not.toBeNull();
    expect(r.apres!.corps.lecturesAwa).toBe(0);
  });

  it('un appel ne la nomme plus ; l’autre personne garde sa trace, avec « Compte supprimé » ; un appel en cours s’arrête', () => {
    const { idB } = r.ids!.corps as Record<string, string>;
    expect(r.appelParAwa!.statut).toBe(200);
    expect(r.appelParAwa!.corps).toMatchObject({ auteur: '', auteurNom: 'Compte supprimé', etat: 'fini' });
    expect(r.appelVersAwa!.statut).toBe(200);
    expect(r.appelVersAwa!.corps).toMatchObject({ appele: '', auteurNom: 'Vera', etat: 'fini' });
    expect(r.appelDeBob!.corps).toMatchObject({ auteur: idB, auteurNom: 'Bob', etat: 'sonne' });
  });

  it('sa présence, ses exclusions de réunion et ses appareils inscrits aux notifications disparaissent ; ceux des autres restent', () => {
    const { idB } = r.ids!.corps as Record<string, string>;
    expect(r.tempsReel!.corps).toEqual({ presence: [idB], exclusions: [idB], appareils: [idB] });
  });

  it('les autres appareils reçoivent chaque effacement et chaque anonymisation au prochain échange', () => {
    const { avisA, annonceA } = r.ids!.corps as Record<string, string>;
    const avis = (r.synchroAvis!.corps.changements as { id: string; supprime: boolean; valeurs?: Record<string, unknown> }[]).find((c) => c.id === avisA);
    expect(avis).toMatchObject({ supprime: false, valeurs: { texte: 'super', auteur: '' } });
    const annonce = (r.synchroAnnonces!.corps.changements as { id: string; supprime: boolean }[]).find((c) => c.id === annonceA);
    expect(annonce).toMatchObject({ supprime: true });
    expect(r.apres!.corps.annonceA).toBeNull();
    expect(r.apres!.corps.annonceB).not.toBeNull();
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

describe('supprimer son compte dans « humalis lancer »', () => {
  it('mêmes règles que le serveur produit', async () => {
    const machine = new Machine({ adresse: () => 'http://localhost:5173' });
    const charge = await machine.charger(SOURCE);
    expect(charge.ok, machine.erreurs).toBe(true);
    const serveur = machine.serveur!;
    const mdp = serveur.comptesDEssai[0]!.motDePasse;
    const awa = await serveur.creerCompteDEssai('awa@x.fr', 'client', mdp, { nom: 'Awa' });
    const bob = await serveur.creerCompteDEssai('bob@x.fr', 'client', mdp, { nom: 'Bob' });
    const google = await serveur.creerCompteDEssai('google@x.fr', 'client', mdp);
    const client = async (email: string, csrf = true) => {
      const cookies = new Map<string, string>();
      const appeler = async (methode: string, chemin: string, corps?: unknown) => {
        const jeton = cookies.get('astratra_csrf');
        const reponse = await machine.traiter({ methode, chemin, requete: new URLSearchParams(), entetes: { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), ...(csrf && jeton && methode !== 'GET' ? { 'x-csrf-token': jeton } : {}) }, corps });
        for (const ligne of ([] as string[]).concat(reponse.entetes['set-cookie'] ?? [])) {
          const paire = ligne.split('; ')[0]!;
          cookies.set(paire.slice(0, paire.indexOf('=')), paire.slice(paire.indexOf('=') + 1));
        }
        const texte = typeof reponse.corps === 'string' ? reponse.corps : '';
        return { statut: reponse.statut, json: (texte ? JSON.parse(texte) : undefined) as Record<string, unknown> };
      };
      await appeler('GET', '/auth/me');
      if (email) await appeler('POST', '/auth/login', { email, password: mdp });
      return appeler;
    };
    const supprimer = '/auth/suppression-compte';
    const [A, B, admin, visiteur, sansCsrf] = [await client('awa@x.fr'), await client('bob@x.fr'), await client('admin@machine.humalis'), await client(''), await client('awa@x.fr', false)];
    const avisA = (await A('POST', '/api/avis', { texte: 'super' })).json.id as string;
    const avisB = (await B('POST', '/api/avis', { texte: 'bof' })).json.id as string;
    const brouillon = (await A('POST', '/api/brouillons', { texte: 'secret' })).json.id as string;
    const payee = (await A('POST', '/api/commandes', { total: 30 })).json.id as string;
    const nonPayee = (await A('POST', '/api/commandes', { total: 10 })).json.id as string;
    const journal = (await A('POST', '/api/journaux', { texte: 'trace' })).json.id as string;
    const stock = (nom: string) => serveur.stockages.get(nom)!;
    for (let i = 0; i < 3; i++) stock('note').creer({ texte: `note ${i}`, compte: awa.id });
    stock('note').creer({ texte: 'de Bob', compte: bob.id });
    stock('commande').modifier(payee, { paye: true });
    stock('message_aide').creer({ conversation: 'c1', auteur: awa.id, auteurNom: 'Awa', texte: 'bonjour', piece: 'p1', pieceNom: 'a.txt', pieceType: 'text/plain', pieceAdresse: '' });
    stock('message_aide').creer({ conversation: 'c2', auteur: bob.id, auteurNom: 'Bob', texte: 'salut', piece: 'p2', pieceNom: 'b.txt', pieceType: 'text/plain', pieceAdresse: '' });
    const pieceA = stock('piece_aide').creer({ conversation: 'c1', auteur: awa.id, nom: 'a.txt', genre: 'text/plain', contenu: 'QQ==' }).id;
    const pieceB = stock('piece_aide').creer({ conversation: 'c2', auteur: bob.id, nom: 'b.txt', genre: 'text/plain', contenu: 'Qg==' }).id;
    const convA = stock('conversation_aide').creer({ titre: 'Awa', personne: awa.id, dernier: 'bonjour', dernierLe: '', nonLus: 0, enLigne: false }).id;
    const convB = stock('conversation_aide').creer({ titre: 'Bob', personne: bob.id, dernier: 'salut', dernierLe: '', nonLus: 0, enLigne: false }).id;
    stock('lecture_aide').creer({ conversation: 'c1', compte: awa.id, luLe: '' });
    const vera = await serveur.creerCompteDEssai('vera@x.fr', 'vendeur', mdp, { nom: 'Vera' });
    const appelParAwa = stock('appel_humalis').creer({ auteur: awa.id, auteurNom: 'Awa', appele: vera.id, salle: 'appel-1', video: true, etat: 'en_cours', appeleLe: '' }).id;
    const appelVersAwa = stock('appel_humalis').creer({ auteur: vera.id, auteurNom: 'Vera', appele: awa.id, salle: 'appel-2', video: false, etat: 'fini', appeleLe: '' }).id;
    const appelDeBob = stock('appel_humalis').creer({ auteur: bob.id, auteurNom: 'Bob', appele: vera.id, salle: 'appel-3', video: false, etat: 'sonne', appeleLe: '' }).id;
    for (const compte of [awa.id, bob.id]) {
      stock('presence_vue').creer({ compte, vuLe: '' });
      stock('exclusion_salle').creer({ piece: 'x', compte, jusqua: '' });
    }

    expect((await visiteur('POST', supprimer, { motDePasse: mdp })).statut).toBe(401);
    expect((await sansCsrf('POST', supprimer, { motDePasse: mdp })).statut).toBe(403);
    const mauvais = await A('POST', supprimer, { motDePasse: 'Faux-Mot-2026!' });
    expect([mauvais.statut, mauvais.json.erreur]).toEqual([403, 'le mot de passe est incorrect']);
    expect((await A('POST', supprimer, {})).statut).toBe(403);
    const dernier = await admin('POST', supprimer, { motDePasse: mdp });
    expect([dernier.statut, dernier.json.erreur]).toEqual([409, 'le dernier admin ne peut pas supprimer son compte']);

    const ensemble = await Promise.all([A('POST', supprimer, { motDePasse: mdp }), A('POST', supprimer, { motDePasse: mdp })]);
    expect(ensemble.map((e) => e.statut).sort()).toEqual([200, 401]);
    expect(ensemble.find((e) => e.statut === 200)!.json).toEqual({ supprime: true });
    expect((await A('GET', '/auth/me')).statut).toBe(401);

    expect(stock('note').lister({ egal: { compte: awa.id } })).toHaveLength(0);
    expect(stock('note').lister()).toHaveLength(1);
    expect(stock('avis').trouver(avisA)).toMatchObject({ texte: 'super', auteur: '' });
    expect(stock('avis').trouver(avisB)!.auteur).toBe(bob.id);
    expect(stock('brouillon').trouver(brouillon)).toBeNull();
    expect(stock('commande').trouver(nonPayee)).toBeNull();
    expect(stock('commande').trouver(payee)).toMatchObject({ total: 30, paye: true, auteur: '' });
    expect(stock('journal').trouver(journal)!.auteur).toBe(awa.id);
    expect(stock('message_aide').lister().map((m) => [m.auteur, m.auteurNom, m.texte, m.piece]).sort()).toEqual([['', '', 'bonjour', ''], [bob.id, 'Bob', 'salut', 'p2']]);
    expect(stock('piece_aide').trouver(pieceA)).toBeNull();
    expect(stock('piece_aide').trouver(pieceB)).not.toBeNull();
    expect(stock('conversation_aide').trouver(convA)).toMatchObject({ titre: 'Compte supprimé', personne: '' });
    expect(stock('conversation_aide').trouver(convB)).toMatchObject({ titre: 'Bob', personne: bob.id });
    expect(stock('lecture_aide').lister({ egal: { compte: awa.id } })).toHaveLength(0);
    expect(stock('appel_humalis').trouver(appelParAwa)).toMatchObject({ auteur: '', auteurNom: 'Compte supprimé', appele: vera.id, etat: 'fini' });
    expect(stock('appel_humalis').trouver(appelVersAwa)).toMatchObject({ auteur: vera.id, auteurNom: 'Vera', appele: '', etat: 'fini' });
    expect(stock('appel_humalis').trouver(appelDeBob)).toMatchObject({ auteur: bob.id, etat: 'sonne' });
    expect(stock('presence_vue').lister().map((l) => l.compte)).toEqual([bob.id]);
    expect(stock('exclusion_salle').lister().map((l) => l.compte)).toEqual([bob.id]);

    const vide = serveur.comptes.comptes.get(awa.id)!;
    expect(vide).toMatchObject({ role: 'supprime', passwordHash: null, nom: null });
    expect(vide.email).toMatch(/^supprime-.+@supprime\.invalid$/);
    expect(serveur.comptes.parEmail('awa@x.fr')).toBeUndefined();
    expect((await (await client(''))('POST', '/auth/login', { email: 'awa@x.fr', password: mdp })).statut).toBe(401);
    // L'adresse est libre : un nouveau compte s'y crée, et n'hérite d'aucune fiche.
    await serveur.creerCompteDEssai('awa@x.fr', 'client', mdp);
    expect((await (await client('awa@x.fr'))('GET', '/api/notes')).json).toEqual([]);

    // Un compte sans mot de passe se supprime sans ; avec un second admin, le premier peut partir.
    const G = await client('google@x.fr');
    serveur.comptes.modifier(google.id, { passwordHash: null });
    expect((await G('POST', supprimer, {})).statut).toBe(200);
    await serveur.creerCompteDEssai('admin2@x.fr', 'admin', mdp);
    expect((await admin('POST', supprimer, { motDePasse: mdp })).statut).toBe(200);
  });
});
