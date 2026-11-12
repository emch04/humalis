// Chaque magasin du serveur, écrit pour PostgreSQL, joué sur une vraie base SQLite.
import assert from 'node:assert/strict';
import { ouvrirSqlite } from './dist/src/humalis/sqlite.js';
const base = ouvrirSqlite(':memory:');
const ok = (nom) => console.log('✓ ' + nom);

const { creerMagasinPostgres, creerRevocationsPostgres } = await import('./dist/src/humalis/renouvellements.js');
const sessions = creerMagasinPostgres(base);
await sessions.save({ id: 's1', familyId: 'f1', userId: 'u1', hash: 'h1', createdAt: 1000, familyStartedAt: 900, expiresAt: Date.now() + 60000, consumedAt: null, revokedAt: null });
assert.deepEqual((await sessions.findByHash('h1')).consumedAt, null);
await sessions.markConsumed('s1', 5); await sessions.revokeFamily('f1', 7); await sessions.revokeFamily('f1', 9);
const s = await sessions.findByHash('h1');
assert.equal(s.consumedAt, 5); assert.equal(s.revokedAt, 7); assert.equal(await sessions.debutDeFamille('f1'), 900);
assert.equal(await sessions.findByHash('inconnu'), null);
await sessions.save({ id: 's2', familyId: 'f2', userId: 'u1', hash: 'h2', createdAt: 1, expiresAt: 2, consumedAt: null, revokedAt: null });
assert.equal(await sessions.deleteExpired(Date.now()), 1);
await assert.rejects(sessions.save({ id: 's3', familyId: 'f3', userId: 'u1', hash: 'h1', createdAt: 1, expiresAt: 2, consumedAt: null, revokedAt: null }));
ok('sessions et renouvellements');

const fermes = creerRevocationsPostgres(base);
await fermes.revoke('j1', Date.now() + 60000); await fermes.revoke('j1', Date.now() + 90000);
assert.equal(await fermes.isRevoked('j1'), true); assert.equal(await fermes.isRevoked('j2'), false);
await fermes.revokeAllForUser('u1', 5000); await fermes.revokeAllForUser('u1', 3000);
assert.equal(await fermes.isRevokedForUser('u1', 4), true); assert.equal(await fermes.isRevokedForUser('u1', 6), false);
ok('jetons fermés (le plus grand « avant » est gardé)');

const { creerEnvoisPostgres } = await import('./dist/src/humalis/envois.js');
const envois = creerEnvoisPostgres(base);
assert.equal(await envois.reserver('c1', 'e1'), 'libre');
assert.equal(await envois.reserver('c1', 'e1'), 'en_cours');
assert.equal(await envois.reserver('c1', 'autre'), 'autre');
await envois.finir('c1', { statut: 201, corps: { id: 'x', liste: [1, 2] } });
assert.deepEqual(await envois.reserver('c1', 'e1'), { statut: 201, corps: { id: 'x', liste: [1, 2] } });
await envois.liberer('c1'); assert.equal(await envois.reserver('c1', 'e2'), 'libre');
ok('envois rejoués (le corps revient en objet)');

const { creerMagasinJetons } = await import('./dist/src/humalis/comptes.js');
const liens = creerMagasinJetons(base);
await liens.save({ hash: 'l1', userId: 'u1', expiresAt: Date.now() + 60000 });
assert.equal((await liens.find('l1')).userId, 'u1');
assert.equal((await liens.consume('l1')).userId, 'u1'); assert.equal(await liens.consume('l1'), null);
await liens.save({ hash: 'l2', userId: 'u1', expiresAt: Date.now() + 60000 }); await liens.deleteForUser('u1'); assert.equal(await liens.find('l2'), null);
ok('liens de mot de passe (un lien ne sert qu\'une fois)');

const { reclamerPostgres } = await import('./dist/src/humalis/logique.js');
const reclamer = reclamerPostgres(base);
assert.equal(await reclamer('tache', '2026-11-12T19'), true); assert.equal(await reclamer('tache', '2026-11-12T19'), false); assert.equal(await reclamer('tache', '2026-11-12T20'), true);
ok('tâches (une seule exécution par période)');

const { creerMagasinCles } = await import('./dist/src/humalis/coffre.js');
const cles = creerMagasinCles(base);
await cles.upsert({ key: 'METEO_CLE', value: 'chiffré', secret: true, updatedBy: 'admin' }); await cles.upsert({ key: 'METEO_CLE', value: 'chiffré 2', secret: true, updatedBy: null });
const [cle] = await cles.findAll();
assert.equal(cle.value, 'chiffré 2'); assert.equal(cle.secret, true); assert.equal(cle.updatedBy, null); assert.ok(!Number.isNaN(Date.parse(cle.updatedAt)));
ok('coffre des clés (« secret » revient vrai ou faux)');

const { creerMagasinSecuritePostgres } = await import('./dist/src/humalis/securite.js');
const sec = creerMagasinSecuritePostgres(base);
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
base.fermer();
console.log('Tous les magasins tiennent sur SQLite.');
