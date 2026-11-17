// Trois services produits, lancés pour de vrai, qui se parlent : node serveur-services.mjs <dossier du projet produit> [port de départ].
// ENTREE=1 : tout passe par le relais « entree », une seule adresse.
import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import assert from 'node:assert/strict';
const racine = process.argv[2];
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const b64 = (t) => Buffer.from(t).toString('base64');
const depart = Number(process.argv[3] ?? 4611);
const ports = { comptes: depart, catalogue: depart + 1, commandes: depart + 2 };
const portEntree = depart + 3;
const commun = {
  HUMALIS_SERVICES_SECRET: 's'.repeat(40),
  HUMALIS_SERVICE_COMPTES: 'http://127.0.0.1:' + ports.comptes,
  HUMALIS_SERVICE_CATALOGUE: 'http://127.0.0.1:' + ports.catalogue,
  HUMALIS_SERVICE_COMMANDES: 'http://127.0.0.1:' + ports.commandes,
  HUMALIS_COMPTES_CLE_PUBLIQUE: b64(publicKey),
};
const env = {
  comptes: { JWT_SECRET: 'j'.repeat(40), HUMALIS_COMPTES_CLE_PRIVEE: b64(privateKey), HUMALIS_ADMIN_EMAIL: 'admin@essai.test', HUMALIS_ADMIN_MOT_DE_PASSE: 'Essai-Solide-2026!' },
  catalogue: {},
  commandes: {},
};
const enfants = [];
const journaux = {};
for (const nom of Object.keys(ports)) {
  const e = spawn('node', ['dist/src/demarrer.js'], { cwd: racine + '/' + nom, env: { ...process.env, ...commun, ...env[nom], PORT: String(ports[nom]), ...(process.env.BASE?.startsWith('/') ? { HUMALIS_BASE: process.env.BASE + '/' + nom + '.sqlite' } : process.env.BASE ? { DATABASE_URL: process.env.BASE.replace('{nom}', 'services_' + nom) } : {}) } });
  journaux[nom] = '';
  e.stdout.on('data', (d) => (journaux[nom] += d));
  e.stderr.on('data', (d) => (journaux[nom] += d));
  enfants.push(e);
}
if (process.env.ENTREE) {
  const e = spawn('node', ['entree.mjs'], { cwd: racine + '/entree', env: { ...process.env, ...commun, PORT: String(portEntree) } });
  journaux.entree = '';
  e.stdout.on('data', (d) => (journaux.entree += d));
  e.stderr.on('data', (d) => (journaux.entree += d));
  enfants.push(e);
}
const url = (nom, chemin) => (process.env.ENTREE ? 'http://127.0.0.1:' + portEntree : 'http://127.0.0.1:' + ports[nom]) + chemin;
const attendre = async () => {
  for (const nom of Object.keys(ports)) {
    for (let i = 0; i < 80; i++) {
      if (await fetch(url(nom, '/sante')).then((r) => r.ok, () => false)) break;
      await new Promise((p) => setTimeout(p, 150));
      if (i === 79) throw new Error(nom + ' ne démarre pas :\n' + journaux[nom]);
    }
  }
};
const ok = (t) => console.log('✓ ' + t);
try {
  await attendre();
  if (process.env.ENTREE) {
    for (let i = 0; i < 40 && !(await fetch('http://127.0.0.1:' + portEntree + '/sante').then((r) => r.ok, () => false)); i++) await new Promise((p) => setTimeout(p, 150));
    console.log('✓ le relais « entree » répond, et chaque service est prêt');
  }
  const json = { 'content-type': 'application/json' };
  const connexion = await (await fetch(url('comptes', '/auth/login'), { method: 'POST', headers: json, body: JSON.stringify({ email: 'admin@essai.test', password: 'Essai-Solide-2026!' }) })).json();
  const jeton = connexion.data.token;
  assert.match(JSON.parse(Buffer.from(jeton.split('.')[0], 'base64url')).alg, /ES256/);
  const A = { ...json, authorization: 'Bearer ' + jeton };
  ok('connexion au service des comptes (jeton ES256)');
  // Le jeton est reconnu par les autres services, qui n'ont que la clé publique.
  const tasse = await (await fetch(url('catalogue', '/api/produits'), { method: 'POST', headers: A, body: JSON.stringify({ nom: 'Tasse', stock: 5 }) })).json();
  assert.ok(tasse.id, JSON.stringify(tasse));
  assert.equal((await fetch('http://127.0.0.1:' + ports.catalogue + '/auth/login', { method: 'POST', headers: json, body: '{}' })).status, 404);
  ok('le catalogue reconnaît le jeton, et ne tient pas de comptes');
  const commande = await (await fetch(url('commandes', '/api/commandes'), { method: 'POST', headers: A, body: JSON.stringify({ produit: tasse.id, quantite: 3 }) })).json();
  assert.equal(commande.statut, 'ouverte');
  const validee = await fetch(url('commandes', '/api/commandes/faire/valider/' + commande.id), { method: 'PATCH', headers: A, body: '{}' });
  const corps = await validee.json();
  assert.equal(validee.status, 200, JSON.stringify(corps) + journaux.commandes + journaux.catalogue);
  assert.equal(corps.statut, 'validee');
  assert.equal((await (await fetch(url('catalogue', '/api/produits/' + tasse.id))).json()).stock, 2);
  ok('une action des commandes lit le produit au catalogue et y fait « reserver », au nom de la personne');
  // Le message : le catalogue écrit un mouvement.
  let mouvements = [];
  for (let i = 0; i < 40 && mouvements.length === 0; i++) {
    await new Promise((p) => setTimeout(p, 150));
    mouvements = await (await fetch(url('catalogue', '/api/mouvements'), { headers: A })).json();
  }
  assert.deepEqual(mouvements.map((m) => [m.produit, m.quantite]), [[tasse.id, 3]], JSON.stringify(mouvements) + journaux.catalogue + journaux.commandes);
  ok('le message « commande-validee » arrive au catalogue, qui écrit un mouvement');
  // Un refus de l'autre service revient à la personne, avec son message, et rien n'est écrit ici.
  const grosse = await (await fetch(url('commandes', '/api/commandes'), { method: 'POST', headers: A, body: JSON.stringify({ produit: tasse.id, quantite: 9 }) })).json();
  const refus = await fetch(url('commandes', '/api/commandes/faire/valider/' + grosse.id), { method: 'PATCH', headers: A, body: '{}' });
  assert.equal(refus.status, 400);
  assert.equal((await refus.json()).erreur, 'Plus assez de stock');
  assert.equal((await (await fetch(url('commandes', '/api/commandes'), { headers: A })).json()).find((c) => c.id === grosse.id).statut, 'ouverte');
  ok('un refus du catalogue revient tel quel, et la commande reste ouverte');
  // Une requête signée mal, ou rejouée, est refusée.
  const faux = await fetch(url('catalogue', '/api/produits/' + tasse.id), { headers: { 'x-humalis-charge': b64(JSON.stringify({ v: { de: 'commandes' }, t: Date.now() })), 'x-humalis-signature': 'faux' } });
  assert.equal(faux.status, 401);
  ok('une signature de service fausse est refusée');
  // Sans personne, un service n'a que ses droits : « commandes » peut faire « reserver », pas créer un produit.
  const { createServiceSigner } = await import(racine + '/commandes/node_modules/@astratra/security/src/index.js');
  const signer = createServiceSigner({ secret: 's'.repeat(40), maxAgeMs: 300000 });
  const signe = (methode, chemin, corps) => ({ ...signer.headers({ de: 'commandes', methode, chemin, ...(corps ? { corps } : {}), numero: String(Math.random()) }, { payload: 'x-humalis-charge', signature: 'x-humalis-signature' }), 'content-type': 'application/json' });
  assert.equal((await fetch(url('catalogue', '/api/produits'), { method: 'POST', headers: signe('POST', '/api/produits', { nom: 'x', stock: 1 }), body: '{}' })).status, 403);
  const reserve = await fetch(url('catalogue', '/api/produits/faire/reserver/' + tasse.id), { method: 'PATCH', headers: signe('PATCH', '/api/produits/faire/reserver/' + tasse.id, { quantite: 1 }), body: '{}' });
  assert.equal(reserve.status, 200, await reserve.clone().text());
  assert.equal((await reserve.json()).stock, 1);
  const entetes = signe('PATCH', '/api/produits/faire/reserver/' + tasse.id, { quantite: 1 });
  assert.equal((await fetch(url('catalogue', '/api/produits/faire/reserver/' + tasse.id), { method: 'PATCH', headers: entetes, body: '{}' })).status, 200);
  assert.equal((await fetch(url('catalogue', '/api/produits/faire/reserver/' + tasse.id), { method: 'PATCH', headers: entetes, body: '{}' })).status, 409);
  ok('sans personne, un service n’a que ses droits ; une requête rejouée est refusée');
  // La déconnexion au service des comptes ferme le jeton dans les autres services.
  assert.equal((await fetch(url('catalogue', '/api/mouvements'), { headers: A })).status, 200);
  await fetch(url('comptes', '/auth/logout'), { method: 'POST', headers: A });
  let statut = 200;
  for (let i = 0; i < 40 && statut === 200; i++) {
    await new Promise((p) => setTimeout(p, 150));
    statut = (await fetch(url('catalogue', '/api/mouvements'), { headers: A })).status;
  }
  assert.equal(statut, 401);
  ok('une déconnexion ferme le jeton dans les autres services');
  console.log('Les services se parlent.');
} catch (erreur) {
  console.error(erreur);
  for (const [nom, j] of Object.entries(journaux)) console.error('--- ' + nom + '\n' + j.slice(-3000));
  process.exitCode = 1;
} finally {
  for (const e of enfants) e.kill('SIGTERM');
}
