// Chaque magasin du serveur produit, joué sur une vraie base : MySQL, MariaDB ou une base de documents.
// Lancé dans le dossier d'un serveur produit et construit : node magasins.mjs (DATABASE_URL donne la base, neuve).
import assert from 'node:assert/strict';

const adresse = process.env.DATABASE_URL;
const documents = /^mongodb/.test(adresse);
const ok = (nom) => console.log('✓ ' + nom);

const { creerMagasinPostgres, creerRevocationsPostgres } = await import('./dist/src/humalis/renouvellements.js');
const { creerEnvoisPostgres } = await import('./dist/src/humalis/envois.js');
const { creerMagasinJetons } = await import('./dist/src/humalis/comptes.js');
const { reclamerPostgres } = await import('./dist/src/humalis/logique.js');
const { creerMagasinCles } = await import('./dist/src/humalis/coffre.js');
const { creerMagasinSecuritePostgres } = await import('./dist/src/humalis/securite.js');
const { compterPostgres } = await import('./dist/src/humalis/ia.js');
const { createPostgresUsersStore } = await import('@astratra/store-postgres');

let base;
let m;
if (documents) {
  const d = await import('./dist/src/humalis/documents.js');
  const s = await import('./dist/src/humalis/synchro-documents.js');
  base = await d.ouvrirDocuments(adresse);
  m = {
    sessions: d.creerSessionsDocuments(base),
    fermes: d.creerRevocationsDocuments(base),
    envois: d.creerEnvoisDocuments(base),
    liens: d.creerJetonsDocuments(base),
    reclamer: d.reclamerDocuments(base),
    cles: d.creerClesDocuments(base),
    sec: d.creerSecuriteDocuments(base),
    compter: d.compterDocuments(base),
    comptes: d.creerComptesDocuments(base),
    stockage: (table, champs) => d.creerStockageDocuments(base, table, champs),
    transaction: (stockages) => d.transactionDocuments(base, stockages),
    journal: (tables) => s.creerJournalDocuments(base, tables),
    canal: d.canalDocuments(base),
    fermer: () => base.fermer(),
  };
} else {
  const y = await import('./dist/src/humalis/mysql.js');
  const s = await import('./dist/src/humalis/synchro-mysql.js');
  base = await y.ouvrirMysql(adresse);
  m = {
    sessions: creerMagasinPostgres(base),
    fermes: creerRevocationsPostgres(base),
    envois: creerEnvoisPostgres(base),
    liens: creerMagasinJetons(base),
    reclamer: reclamerPostgres(base),
    cles: creerMagasinCles(base),
    sec: creerMagasinSecuritePostgres(base),
    compter: compterPostgres(base),
    comptes: createPostgresUsersStore({ pool: base }),
    stockage: (table, champs) => y.creerStockageMysql(base, table, champs),
    transaction: (stockages) => y.transactionMysql(base, stockages),
    journal: (tables) => s.creerJournalMysql(base, tables),
    canal: y.canalMysql(base),
    fermer: () => base.fermer(),
  };
}

const { sessions, fermes, envois, liens, reclamer, cles, sec } = m;
await sessions.save({ id: 's1', familyId: 'f1', userId: 'u1', hash: 'h1', createdAt: 1000, familyStartedAt: 900, expiresAt: Date.now() + 60000, consumedAt: null, revokedAt: null });
assert.deepEqual((await sessions.findByHash('h1')).consumedAt, null);
await sessions.markConsumed('s1', 5); await sessions.revokeFamily('f1', 7); await sessions.revokeFamily('f1', 9);
const s = await sessions.findByHash('h1');
assert.equal(s.consumedAt, 5); assert.equal(s.revokedAt, 7); assert.equal(await sessions.debutDeFamille('f1'), 900);
assert.equal(await sessions.findByHash('inconnu'), null);
await sessions.save({ id: 's2', familyId: 'f2', userId: 'u1', hash: 'h2', createdAt: 1, expiresAt: 2, consumedAt: null, revokedAt: null });
await sessions.revokeAllForUser?.('u9', 1);
assert.equal(await sessions.deleteExpired(Date.now()), 1);
await assert.rejects(sessions.save({ id: 's3', familyId: 'f3', userId: 'u1', hash: 'h1', createdAt: 1, expiresAt: 2, consumedAt: null, revokedAt: null }));
ok('sessions et renouvellements');

await fermes.revoke('j1', Date.now() + 60000); await fermes.revoke('j1', Date.now() + 90000);
assert.equal(await fermes.isRevoked('j1'), true); assert.equal(await fermes.isRevoked('j2'), false);
await fermes.revokeAllForUser('u1', 5000); await fermes.revokeAllForUser('u1', 3000);
assert.equal(await fermes.isRevokedForUser('u1', 4), true); assert.equal(await fermes.isRevokedForUser('u1', 6), false);
ok('jetons fermés (le plus grand « avant » est gardé)');

assert.equal(await envois.reserver('c1', 'e1'), 'libre');
assert.equal(await envois.reserver('c1', 'e1'), 'en_cours');
assert.equal(await envois.reserver('c1', 'autre'), 'autre');
await envois.finir('c1', { statut: 201, corps: { id: 'x', liste: [1, 2] } });
assert.deepEqual(await envois.reserver('c1', 'e1'), { statut: 201, corps: { id: 'x', liste: [1, 2] } });
await envois.liberer('c1'); assert.equal(await envois.reserver('c1', 'e2'), 'libre');
// Deux serveurs qui réservent en même temps : un seul obtient la ligne.
const courses = await Promise.all([1, 2, 3, 4].map(() => envois.reserver('c2', 'e')));
assert.equal(courses.filter((r) => r === 'libre').length, 1);
ok('envois rejoués (le corps revient en objet, un seul gagnant)');

await liens.save({ hash: 'l1', userId: 'u1', expiresAt: Date.now() + 60000 });
assert.equal((await liens.find('l1')).userId, 'u1');
assert.equal((await liens.consume('l1')).userId, 'u1'); assert.equal(await liens.consume('l1'), null);
await liens.save({ hash: 'l2', userId: 'u1', expiresAt: Date.now() + 60000 }); await liens.deleteForUser('u1'); assert.equal(await liens.find('l2'), null);
ok('liens de mot de passe (un lien ne sert qu\'une fois)');

assert.equal(await reclamer('tache', '2026-11-12T19'), true); assert.equal(await reclamer('tache', '2026-11-12T19'), false); assert.equal(await reclamer('tache', '2026-11-12T20'), true);
const reclames = await Promise.all([1, 2, 3].map(() => reclamer('course', '2026-11-12T21')));
assert.equal(reclames.filter(Boolean).length, 1);
ok('tâches (une seule exécution par période)');

await cles.upsert({ key: 'METEO_CLE', value: 'chiffré', secret: true, updatedBy: 'admin' }); await cles.upsert({ key: 'METEO_CLE', value: 'chiffré 2', secret: true, updatedBy: null });
const [cle] = await cles.findAll();
assert.equal(cle.value, 'chiffré 2'); assert.equal(cle.secret, true); assert.equal(cle.updatedBy, null); assert.ok(!Number.isNaN(Date.parse(cle.updatedAt)));
await cles.upsert({ key: 'LONGUE', value: 'x'.repeat(5000), secret: false, updatedBy: 'admin' });
assert.equal((await cles.findAll()).find((c) => c.key === 'LONGUE').value.length, 5000);
ok('coffre des clés (« secret » revient vrai ou faux, une longue valeur passe)');

assert.equal(await sec.double.lire('u1'), null);
assert.equal(await sec.double.preparer('u1', 'secret'), true);
assert.deepEqual(await sec.double.lire('u1'), { secret: 'secret', actif: false, dernierPas: -1, echecs: 0, bloqueJusqua: 0 });
await sec.double.activer('u1', 10, ['a', 'b', 'c']);
assert.equal((await sec.double.lire('u1')).actif, true); assert.equal(await sec.double.preparer('u1', 'autre'), false);
assert.equal(await sec.double.compterCodes('u1'), 3);
assert.equal(await sec.double.consommerCode('u1', 'a'), true); assert.equal(await sec.double.consommerCode('u1', 'a'), false);
assert.equal(await sec.double.consommerPas('u1', 11), true); assert.equal(await sec.double.consommerPas('u1', 11), false);
await sec.double.enregistrerCodes('u1', ['x', 'y']); assert.equal(await sec.double.compterCodes('u1'), 2);
for (let i = 0; i < 6; i++) await sec.double.echec('u1', 99999);
assert.ok((await sec.double.lire('u1')).bloqueJusqua === 99999);
await sec.double.remettre('u1'); assert.equal((await sec.double.lire('u1')).bloqueJusqua, 0);
await sec.double.retirer('u1'); assert.equal(await sec.double.lire('u1'), null); assert.equal(await sec.double.compterCodes('u1'), 0);
ok('double authentification');
await sec.cles.saveCredential('u1', { credentialID: 'k1', publicKey: 'pk', counter: 0 });
assert.equal((await sec.cles.getCredentialsForUser('u1'))[0].publicKey, 'pk');
await sec.cles.updateCredentialCounter('k1', 7);
const k = await sec.cles.getCredentialById('k1'); assert.equal(k.counter, 7); assert.equal(k.publicKey, 'pk'); assert.ok(k.utiliseeLe > 0);
await sec.cles.saveChallenge('u1', 'defi', 'connexion', { origine: 'x' }); await sec.cles.saveChallenge('u1', 'defi2', 'connexion', {});
assert.equal((await sec.cles.consumeChallenge('u1', 'connexion')).challenge, 'defi2'); assert.equal(await sec.cles.consumeChallenge('u1', 'connexion'), null);
assert.equal(await sec.cles.retirer('u1', 'k1'), true); assert.equal(await sec.cles.getCredentialById('k1'), null);
ok('clés d\'accès');

assert.equal(await m.compter('u1|h1'), 1); assert.equal(await m.compter('u1|h1'), 2); assert.equal(await m.compter('u2|h1'), 1);
ok('compteur des questions à l\'IA');

// Les comptes : l'adresse est unique, un compte se relit par son adresse et par son identifiant.
const comptes = m.comptes;
const a = await comptes.create({ email: 'Ana@Exemple.fr', role: 'admin', passwordHash: 'h' });
assert.equal((await comptes.findByEmail('ana@exemple.fr')).id, a.id);
assert.equal((await comptes.findById(a.id)).email, 'ana@exemple.fr');
await assert.rejects(comptes.create({ email: 'ana@exemple.fr', role: 'user', passwordHash: 'h' }));
const b = await comptes.create({ email: 'bob@exemple.fr', role: 'user', passwordHash: 'h' });
await comptes.update(b.id, { role: 'admin', nom: 'Bob' });
assert.equal((await comptes.findById(b.id)).role, 'admin');
assert.equal((await comptes.findById(b.id)).nom, 'Bob');
assert.equal((await comptes.list({ limit: 10, offset: 0 })).length, 2);
assert.equal(await comptes.count(), 2);
assert.deepEqual(await comptes.countByRole(), { admin: 2 });
ok('comptes (adresse unique, relue sans tenir compte des majuscules)');

// Les données : la valeur exacte, du même type ; le texte au caractère près.
const notes = m.stockage('notes', ['texte', 'n', 'lu', 'tel', 'tags']);
const n1 = await notes.creer({ texte: 'Abc', n: 5, lu: true, tel: '+243 81 23', tags: ['x'] });
await notes.creer({ texte: 'abc', n: '5', lu: 1, tel: '24381-23' });
await notes.creer({ texte: 'trois', n: 3, lu: false });
assert.equal((await notes.trouver(n1.id)).texte, 'Abc');
assert.equal((await notes.lister({ egal: { texte: 'Abc' } })).length, 1);
assert.equal((await notes.lister({ egal: { n: 5 } })).length, 1);
assert.equal((await notes.lister({ egal: { n: '5' } })).length, 1);
assert.equal((await notes.lister({ egal: { lu: true } })).length, 1);
assert.equal((await notes.lister({ egal: { lu: false } })).length, 1);
assert.equal((await notes.lister({ egal: { texte: "x' OR '1'='1" } })).length, 0);
assert.deepEqual((await notes.lister({ egal: {}, limite: 2, depuis: 1 })).map((f) => f.texte), ['abc', 'trois']);
assert.deepEqual((await notes.lister({ egal: {}, depuis: 2 })).map((f) => f.texte), ['trois']);
assert.equal((await notes.lister({ egal: {}, numero: { champ: 'tel', valeur: '2438123' } })).length, 2);
const modifiee = await notes.modifier(n1.id, { lu: null, texte: 'Abd' });
assert.equal(modifiee.lu, null); assert.equal(modifiee.texte, 'Abd'); assert.deepEqual(modifiee.tags, ['x']);
assert.equal(await notes.modifier('inconnu', { texte: 'x' }), null);
// Deux modifications de la même fiche, parties ensemble, gardent les deux changements.
await Promise.all([notes.modifier(n1.id, { n: 6 }), notes.modifier(n1.id, { tel: '1' })]);
const relue = await notes.trouver(n1.id);
assert.equal(relue.n, 6); assert.equal(relue.tel, '1');
// Tout ou rien.
const enTransaction = m.transaction({ notes });
await assert.rejects(enTransaction(async (st) => {
  await st.notes.creer({ texte: 'annulée', n: 0, lu: false });
  await st.notes.modifier(n1.id, { texte: 'annulé aussi' });
  throw new Error('refusé');
}));
assert.equal((await notes.lister({ egal: { texte: 'annulée' } })).length, 0);
assert.equal((await notes.trouver(n1.id)).texte, 'Abd');
await enTransaction(async (st) => {
  const f = await st.notes.trouver(n1.id, true);
  await st.notes.modifier(f.id, { n: f.n + 1 });
});
assert.equal((await notes.trouver(n1.id)).n, 7);
// Des retraits faits en même temps, chacun relisant la fiche pour écrire : aucun n'est perdu.
await Promise.all([1, 2, 3, 4, 5].map(() => enTransaction(async (st) => {
  const f = await st.notes.trouver(n1.id, true);
  await st.notes.modifier(f.id, { n: f.n + 1 });
})));
assert.equal((await notes.trouver(n1.id)).n, 12);
assert.equal(await notes.supprimer(n1.id), true); assert.equal(await notes.supprimer(n1.id), false);
assert.equal(await notes.trouver(n1.id), null);
ok('données (valeurs exactes, tranches, numéros, transactions, écritures simultanées)');

// La synchronisation : chaque écriture note sa ligne au journal, avec un numéro qui avance.
const suivies = m.stockage('suivies', ['texte', 'groupe']);
const journal = m.journal({ suivie: { table: 'suivies', portee: ['groupe'], champs: ['texte', 'groupe'] } });
journal.suivre('suivie', suivies, ['groupe']);
const f1 = await suivies.creer({ texte: 'un', groupe: 'g1' });
const f2 = await suivies.creer({ texte: 'deux', groupe: 'g2' });
await suivies.modifier(f1.id, { texte: 'un bis' });
await suivies.supprimer(f2.id);
const page = await journal.page('suivie', 0, 10, {});
assert.deepEqual(page.lignes.map((l) => [l.id, l.version, l.supprime]), [[f1.id, 3, false], [f2.id, 4, true]]);
assert.equal(page.lignes[0].fiche.texte, 'un bis'); assert.equal(page.lignes[1].fiche, null); assert.equal(page.tete, 4);
assert.deepEqual((await journal.page('suivie', 0, 10, { groupe: 'g2' })).lignes.map((l) => l.id), [f2.id]);
assert.equal((await journal.page('suivie', 3, 10, {})).lignes.length, 1);
await journal.horodater('suivie', f1.id, 1234, 'op1');
assert.equal((await journal.entree('suivie', f1.id)).operation, 'op1');
await journal.retenir('suivie', 'u1', { operation: 'op1', statut: 200, fiche: null });
await journal.retenir('suivie', 'u1', { operation: 'op1', statut: 500, fiche: null });
assert.equal((await journal.operation('suivie', 'u1', 'op1')).statut, 200);
const ordre = [];
await Promise.all([journal.exclusif('suivie', async () => { ordre.push('a1'); await new Promise((r) => setTimeout(r, 50)); ordre.push('a2'); }), journal.exclusif('suivie', async () => { ordre.push('b1'); ordre.push('b2'); })]);
assert.ok(ordre.join() === 'a1,a2,b1,b2' || ordre.join() === 'b1,b2,a1,a2', ordre.join());
await journal.menage('suivie', Date.now() + 1000);
const apres = await journal.page('suivie', 0, 10, {});
assert.equal(apres.plancher, 4); assert.deepEqual(apres.lignes.map((l) => l.id), [f1.id]);
// Des créations simultanées : chaque version est unique, aucune n'est perdue.
await Promise.all([1, 2, 3, 4, 5, 6].map((i) => suivies.creer({ texte: 't' + i, groupe: 'g1' })));
const versions = (await journal.page('suivie', 0, 100, {})).lignes.map((l) => l.version);
assert.equal(new Set(versions).size, versions.length); assert.equal(versions.length, 7);
ok('synchronisation (journal, portée, opérations, exclusivité, ménage)');

await m.canal.publier('notes|g1');
assert.ok((await m.canal.recentes()).some((a) => a.cle === 'notes|g1'));
ok('annonces « en direct » entre plusieurs exemplaires');

await m.fermer();
console.log('Tous les magasins tiennent sur cette base.');
