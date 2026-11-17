// La revue de sécurité de la 3.0.0 (17 novembre 2026), sur trois services produits et lancés pour de vrai :
//   node serveur-attaques-revue-300.mjs <dossier du projet produit> [port de départ]
// BASE=mongodb://…/{nom}?… : une base par service (sinon, tout reste en mémoire). La dernière ligne écrite est un
// relevé JSON : ce que chaque essai a obtenu.
import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { connect } from 'node:net';

const racine = process.argv[2];
const depart = Number(process.argv[3] ?? 4711);
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const b64 = (t) => Buffer.from(t).toString('base64');
const paire = () => generateKeyPairSync('ec', { namedCurve: 'P-256', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const clesDesServices = { comptes: paire(), catalogue: paire(), commandes: paire() };
const ports = { comptes: depart, catalogue: depart + 1, commandes: depart + 2, catalogueLimite: depart + 3, comptesLimite: depart + 4 };
const portEntree = depart + 5;
const MOT_DE_PASSE = 'Essai-Solide-2026!';
const commun = {
  // Chaque service a sa paire de clés : sa clé privée dans son .env, sa clé publique chez les autres.
  ...Object.fromEntries(Object.entries(clesDesServices).map(([nom, cle]) => ['HUMALIS_SERVICE_' + nom.toUpperCase() + '_CLE', b64(cle.publicKey)])),
  HUMALIS_SERVICE_COMPTES: 'http://127.0.0.1:' + ports.comptes,
  HUMALIS_SERVICE_CATALOGUE: 'http://127.0.0.1:' + ports.catalogue,
  HUMALIS_SERVICE_COMMANDES: 'http://127.0.0.1:' + ports.commandes,
  HUMALIS_COMPTES_CLE_PUBLIQUE: b64(publicKey),
};
const env = {
  // Le service des comptes est derrière un relais (HUMALIS_RELAIS=1), et ne joint pas « commandes » (une panne).
  comptes: {
    JWT_SECRET: 'j'.repeat(40),
    HUMALIS_COMPTES_CLE_PRIVEE: b64(privateKey),
    HUMALIS_ADMIN_EMAIL: 'admin@essai.test',
    HUMALIS_ADMIN_MOT_DE_PASSE: MOT_DE_PASSE,
    ERREURS_ADRESSE: 'https://127.0.0.1:9/envoi',
    ERREURS_CLE: 'cle-de-suivi',
    HUMALIS_RELAIS: '1',
    HUMALIS_LIMITE_CONNEXION: '100000',
    HUMALIS_SERVICE_COMMANDES: 'http://127.0.0.1:9',
  },
  catalogue: {},
  commandes: {},
  // Un second exemplaire du catalogue, lancé comme « npm start » le fait (sans NODE_ENV), avec une limite basse.
  catalogueLimite: { HUMALIS_LIMITE_API: '5' },
  // Un second exemplaire du service des comptes, en production, derrière le relais « entree » : trois connexions par adresse.
  comptesLimite: {
    NODE_ENV: 'production',
    JWT_SECRET: 'j'.repeat(40),
    HUMALIS_COMPTES_CLE_PRIVEE: b64(privateKey),
    HUMALIS_ADMIN_EMAIL: 'admin@essai.test',
    HUMALIS_ADMIN_MOT_DE_PASSE: MOT_DE_PASSE,
    HUMALIS_RELAIS: '1',
    HUMALIS_LIMITE_CONNEXION: '3',
  },
};
const dossierDe = (nom) => racine + '/' + nom.replace(/Limite$/, '');
const baseDe = (nom) => (process.env.BASE ? { DATABASE_URL: process.env.BASE.replace('{nom}', 'revue300_' + nom.toLowerCase() + (process.env.SUFFIXE ?? '')) } : {});
const enfants = [];
const journaux = {};
// Comme « npm start » : NODE_ENV n'est pas réglé (vitest le règle à « test »).
const { NODE_ENV: _sansNodeEnv, ...environnement } = process.env;
for (const nom of Object.keys(ports)) {
  const e = spawn('node', ['dist/src/demarrer.js'], { cwd: dossierDe(nom), env: { ...environnement, ...commun, ...env[nom], HUMALIS_SERVICE_CLE_PRIVEE: b64(clesDesServices[nom.replace(/Limite$/, '')].privateKey), ...baseDe(nom), PORT: String(ports[nom]) } });
  journaux[nom] = '';
  e.stdout.on('data', (d) => (journaux[nom] += d));
  e.stderr.on('data', (d) => (journaux[nom] += d));
  enfants.push(e);
}
// Le relais « entree », devant le second service des comptes.
{
  const e = spawn('node', ['entree.mjs'], { cwd: racine + '/entree', env: { ...environnement, ...commun, HUMALIS_SERVICE_COMPTES: 'http://127.0.0.1:' + ports.comptesLimite, PORT: String(portEntree) } });
  journaux.entree = '';
  e.stdout.on('data', (d) => (journaux.entree += d));
  e.stderr.on('data', (d) => (journaux.entree += d));
  enfants.push(e);
}
const url = (nom, chemin) => 'http://127.0.0.1:' + ports[nom] + chemin;
const pause = (ms) => new Promise((p) => setTimeout(p, ms));
const json = { 'content-type': 'application/json' };
const r = {};
try {
  for (const nom of Object.keys(ports)) {
    for (let i = 0; i < 120; i++) {
      if (await fetch(url(nom, '/sante')).then((x) => x.ok, () => false)) break;
      await pause(150);
      if (i === 119) throw new Error(nom + ' ne démarre pas :\n' + journaux[nom]);
    }
  }
  const connecter = async () => (await (await fetch(url('comptes', '/auth/login'), { method: 'POST', headers: json, body: JSON.stringify({ email: 'admin@essai.test', password: MOT_DE_PASSE }) })).json()).data.token;
  const avec = (jeton) => ({ ...json, authorization: 'Bearer ' + jeton });
  const A = avec(await connecter());
  const produit = async (stock) => (await (await fetch(url('catalogue', '/api/produits'), { method: 'POST', headers: A, body: JSON.stringify({ nom: 'Tasse', stock }) })).json()).id;
  const stockDe = async (id) => (await (await fetch(url('catalogue', '/api/produits/' + id))).json()).stock;

  // Une requête signée, comme un service du projet en envoie (src/humalis/services.ts) : la charge en base64url, signée
  // en ES256 avec la clé privée d'un service. « avecLaCleDe » : la clé que l'on a vraiment (celle de son propre .env).
  const { sign } = await import('node:crypto');
  const signe = (de, methode, chemin, corps, avecLaCleDe = de) => {
    const payload = Buffer.from(JSON.stringify({ de, vers: 'catalogue', methode, chemin, ...(corps ? { corps } : {}), numero: crypto.randomUUID(), quand: Date.now() })).toString('base64url');
    const signature = sign('sha256', Buffer.from(payload), { key: clesDesServices[avecLaCleDe].privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return { 'x-humalis-charge': payload, 'x-humalis-signature': signature, 'content-type': 'application/json' };
  };
  const appelSigne = async (de, methode, chemin, corps, avecLaCleDe) => (await fetch(url('catalogue', chemin), { method: methode, headers: signe(de, methode, chemin, corps, avecLaCleDe), body: '{}' })).status;

  // 1. « le serveur "commandes" peut modifier produit » ne donne pas l'action « solder » (réservée au gérant).
  {
    const id = await produit(5);
    r.solderParService = await appelSigne('commandes', 'PATCH', '/api/produits/faire/solder/' + id);
    r.solderParMajuscules = await appelSigne('commandes', 'PATCH', '/api/produits/FAIRE/solder/' + id);
    r.stockApresSolder = await stockDe(id);
  }

  // 2. Le service des comptes n'a aucun droit sur les produits ; avec ce que porte son .env (sa propre clé), il signe « de: commandes ».
  {
    const id = await produit(5);
    r.reserverParComptes = await appelSigne('comptes', 'PATCH', '/api/produits/faire/reserver/' + id, { quantite: 1 });
    r.reserverAuNomDeCommandes = await appelSigne('commandes', 'PATCH', '/api/produits/faire/reserver/' + id, { quantite: 1 }, 'comptes');
    r.stockApresReserver = await stockDe(id);
  }

  // 8. Des signatures de service falsifiées, une à une : toutes refusées (401), jamais une erreur 500, le stock intact.
  {
    const id = await produit(5);
    const chemin = '/api/produits/faire/reserver/' + id;
    const brute = (charge, cle = 'commandes', encodage = 'ieee-p1363') => {
      const payload = Buffer.from(typeof charge === 'string' ? charge : JSON.stringify(charge)).toString('base64url');
      return { payload, signature: sign('sha256', Buffer.from(payload), { key: clesDesServices[cle].privateKey, dsaEncoding: encodage }).toString('base64url') };
    };
    const envoyer = async ({ payload, signature }, cheminEnvoye = chemin, methode = 'PATCH') =>
      (await fetch(url('catalogue', cheminEnvoye), { method: methode, headers: { 'x-humalis-charge': payload, 'x-humalis-signature': signature, 'content-type': 'application/json' }, body: '{}' })).status;
    const charge = (plus = {}) => ({ de: 'commandes', vers: 'catalogue', methode: 'PATCH', chemin, corps: { quantite: 1 }, numero: crypto.randomUUID(), quand: Date.now(), ...plus });
    const autreProduit = await produit(5);
    const modifiee = brute(charge());
    const corpsChange = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(modifiee.payload, 'base64url').toString()), corps: { quantite: 5 } })).toString('base64url');
    r.signaturesFalsifiees = {
      autreDestinataire: await envoyer(brute(charge({ vers: 'commandes' }))),
      sansDestinataire: await envoyer(brute(charge({ vers: undefined }))),
      perimee: await envoyer(brute(charge({ quand: Date.now() - 6 * 60_000 }))),
      venueDuFutur: await envoyer(brute(charge({ quand: Date.now() + 6 * 60_000 }))),
      sansHeure: await envoyer(brute(charge({ quand: undefined }))),
      heureEnTexte: await envoyer(brute(charge({ quand: String(Date.now()) }))),
      autreMethode: await envoyer(brute(charge({ methode: 'GET' }))),
      autreChemin: await envoyer(brute(charge()), '/api/produits/faire/reserver/' + autreProduit),
      corpsChangeApresSignature: await envoyer({ payload: corpsChange, signature: modifiee.signature }),
      signatureDer: await envoyer(brute(charge(), 'commandes', 'der')),
      serviceInconnu: await envoyer(brute(charge({ de: 'inconnu' }), 'commandes')),
      chargeIllisible: await envoyer({ payload: 'pas-du-base64-%%%', signature: 'x' }),
      chargePasJson: await envoyer(brute('ceci n’est pas du JSON')),
      signatureVide: await envoyer({ payload: brute(charge()).payload, signature: '' }),
    };
    r.stockApresFalsifications = await stockDe(id);
    r.stockAutreApresFalsifications = await stockDe(autreProduit);
    // Un message « humalis:compte-ferme » n'est annoncé que par le service des comptes : signé par « commandes », 403.
    const message = (de, cle, plus = {}) => brute({ de, vers: 'catalogue', chemin: '/humalis/messages', id: crypto.randomUUID(), message: 'humalis:compte-ferme', corps: { utilisateur: 'x', avant: Date.now() }, quand: Date.now(), ...plus }, cle);
    const poster = async (enveloppe) => (await fetch(url('catalogue', '/humalis/messages'), { method: 'POST', headers: json, body: JSON.stringify(enveloppe) })).status;
    r.messagesFalsifies = {
      compteFermeParCommandes: await poster(message('commandes', 'commandes')),
      compteFermeAuNomDesComptes: await poster(message('comptes', 'commandes')),
      compteFermePerime: await poster(message('comptes', 'comptes', { quand: Date.now() - 6 * 60_000 })),
      compteFermePourUnAutre: await poster(message('comptes', 'comptes', { vers: 'commandes' })),
      enveloppeVide: await poster({}),
    };
  }

  // 3. Deux « valider » en même temps sur la même commande : le produit n'est réservé qu'une fois.
  {
    const id = await produit(10);
    const commande = await (await fetch(url('commandes', '/api/commandes'), { method: 'POST', headers: A, body: JSON.stringify({ produit: id, quantite: 3 }) })).json();
    const valider = () => fetch(url('commandes', '/api/commandes/faire/valider/' + commande.id), { method: 'PATCH', headers: A, body: '{}' }).then((x) => x.status);
    r.validations = (await Promise.all([valider(), valider(), valider(), valider()])).sort();
    r.stockApresValidations = await stockDe(id);
  }

  // 4. Le relais des rapports d'erreur, derrière un relais (HUMALIS_RELAIS=1) : trente rapports d'un visiteur ne ferment pas la porte à un autre.
  {
    const rapport = (adresse) => fetch(url('comptes', '/humalis/erreurs'), { method: 'POST', headers: { 'content-type': 'text/plain', 'x-forwarded-for': adresse }, body: JSON.stringify({ message: 'Panne de page', page: '/accueil' }) }).then((x) => x.status);
    const premier = [];
    for (let i = 0; i < 31; i++) premier.push(await rapport('203.0.113.5'));
    r.rapportsDuPremier = [premier.filter((s) => s === 204).length, premier.filter((s) => s === 429).length];
    r.rapportDunAutreVisiteur = await rapport('203.0.113.77');
  }

  // 5. La limite des requêtes d'un service lancé par « npm start » (sans NODE_ENV), joint depuis la même machine (un relais local).
  {
    const statuts = [];
    for (let i = 0; i < 12; i++) statuts.push((await fetch(url('catalogueLimite', '/api/produits'))).status);
    r.limiteLocale = statuts.filter((s) => s === 429).length;
  }

  // 7. Par le relais « entree » : la limite des connexions compte chaque visiteur, quoi qu'il écrive dans sa requête.
  {
    for (let i = 0; i < 40 && !(await fetch('http://127.0.0.1:' + portEntree + '/auth/me').then((x) => x.status === 401, () => false)); i++) await pause(150);
    const corps = JSON.stringify({ email: 'admin@essai.test', password: 'Mauvais-Mot-2026!' });
    const ordinaires = [];
    for (let i = 0; i < 6; i++) ordinaires.push((await fetch('http://127.0.0.1:' + portEntree + '/auth/login', { method: 'POST', headers: { ...json, 'x-forwarded-for': '198.51.100.' + i }, body: corps })).status);
    r.connexionsOrdinaires = ordinaires;
    // La même requête, avec une demande de changement de protocole et une adresse d'origine inventée à chaque essai.
    const detournee = (i) => new Promise((resoudre) => {
      let recu = '';
      const fin = (statut) => { resoudre(statut); s.destroy(); };
      const s = connect(portEntree, '127.0.0.1', () => s.write(['POST /auth/login HTTP/1.1', 'Host: 127.0.0.1', 'Connection: Upgrade', 'Upgrade: essai', 'X-Forwarded-For: 203.0.113.' + i, 'Content-Type: application/json', 'Content-Length: ' + Buffer.byteLength(corps), '', corps].join('\r\n')));
      s.on('data', (d) => { recu += d; if (recu.includes('\r\n')) fin(Number(recu.split(' ')[1])); });
      s.on('error', () => fin(0));
      s.on('close', () => fin(Number(recu.split(' ')[1]) || 0));
      setTimeout(() => fin(0), 5000);
    });
    r.connexionsDetournees = [];
    for (let i = 0; i < 8; i++) r.connexionsDetournees.push(await detournee(i));
  }

  // 6. La boîte d'envoi : cent messages en attente pour un service en panne ne retiennent pas ceux des autres.
  {
    const fermeAuCatalogue = async (jeton) => {
      let statut = 0;
      for (let i = 0; i < 40 && statut !== 401; i++) {
        await pause(250);
        statut = (await fetch(url('catalogue', '/api/produits/faire/reserver/x'), { method: 'PATCH', headers: avec(jeton), body: '{"quantite":1}' })).status;
      }
      return statut;
    };
    // Le témoin : avec un seul message en attente pour « commandes », une déconnexion ferme bien le jeton au catalogue.
    const premier = await connecter();
    await fetch(url('comptes', '/auth/logout'), { method: 'POST', headers: avec(premier) });
    r.deconnexionAvantLaPanne = await fermeAuCatalogue(premier);
    const temoin = await connecter();
    r.temoinAvant = (await fetch(url('catalogue', '/api/produits/faire/reserver/x'), { method: 'PATCH', headers: avec(temoin), body: '{"quantite":1}' })).status;
    // Chaque déconnexion écrit un message pour « catalogue » (livré) et un pour « commandes » (en panne : il attend).
    for (let i = 0; i < 101; i++) await fetch(url('comptes', '/auth/logout'), { method: 'POST', headers: avec(await connecter()) });
    await pause(3000);
    await fetch(url('comptes', '/auth/logout'), { method: 'POST', headers: avec(temoin) });
    r.temoinApresDeconnexion = await fermeAuCatalogue(temoin);
  }
} catch (erreur) {
  r.erreur = String(erreur?.stack ?? erreur);
  for (const [nom, j] of Object.entries(journaux)) console.error('--- ' + nom + '\n' + j.slice(-3000));
  process.exitCode = 1;
} finally {
  for (const e of enfants) e.kill('SIGTERM');
}
console.log(JSON.stringify(r));
