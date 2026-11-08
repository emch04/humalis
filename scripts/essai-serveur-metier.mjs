// Vérifie en vrai, sur PostgreSQL et deux exemplaires du serveur produit : groupes, droits sur ses
// fiches, changement de rôle immédiat.
//
// Lancer : npm run build && node scripts/essai-serveur-metier.mjs [dossier-de-travail]
// Il faut PostgreSQL (initdb, pg_ctl).
import { execFileSync, spawn } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer as creerHttps } from 'node:https';
import { createServer as createHttp } from 'node:http';
import { createSecureServer } from 'node:http2';
import { randomUUID, createECDH, createHmac, generateKeyPairSync, randomBytes as hasard } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-metier'));
rmSync(join(travail, 'pg'), { recursive: true, force: true });
mkdirSync(travail, { recursive: true });
const { chromium } = createRequire(import.meta.url)('playwright');
const problemes = [];
export const verifier = (ok, message) => {
  if (!ok) problemes.push(message);
  console.log(`${ok ? '✓' : '✗'} ${message}`);
};
const serveur = join(travail, 'serveur');
execFileSync('node', ['dist/cli.js', 'compile', 'essais/serveur/metier.humalis', '--cible', 'serveur', '--sortie', serveur], { stdio: ['ignore', 'ignore', 'inherit'] });
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund', '--silent'], { cwd: serveur, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: serveur, stdio: 'inherit' });
try {
  execFileSync('npx', ['vitest', 'run'], { cwd: serveur, stdio: 'pipe' });
  verifier(true, 'les tests produits avec le serveur passent');
} catch (erreur) {
  verifier(false, `les tests produits avec le serveur passent\n${String(erreur.stdout).slice(-1800)}`);
}

// Les pages aussi : le site React passe par tsc, le moteur par Vite.
for (const [nom, options] of [['site-react', []], ['site-moteur', ['--moteur', 'humalis']]]) {
  const dossier = join(travail, nom);
  execFileSync('node', ['dist/cli.js', 'compile', 'essais/serveur/metier.humalis', '--cible', 'web', ...options, '--sortie', dossier], { stdio: ['ignore', 'ignore', 'inherit'] });
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: dossier, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: dossier, stdio: 'inherit' });
  verifier(existsSync(join(dossier, 'public', 'humalis', 'notifications.js')) || existsSync(join(dossier, 'dist', 'humalis', 'notifications.js')), `le site (${nom}) se construit, avec son travailleur de notifications`);
}

const portBase = 5800 + Math.floor(Math.random() * 90);
const donnees = join(travail, 'pg');
const envBase = { ...process.env, LC_ALL: 'C', LANG: 'C' };
execFileSync('initdb', ['-D', donnees, '-A', 'trust', '-U', 'essai', '--no-sync', '--locale=C', '-E', 'UTF8'], { stdio: 'ignore', env: envBase });
execFileSync('pg_ctl', ['-D', donnees, '-o', `-p ${portBase} -k ${travail}`, '-w', '-l', join(travail, 'pg.log'), 'start'], { stdio: 'ignore', env: envBase });
const URL_BASE = `postgres://essai@127.0.0.1:${portBase}/postgres`;
const sql = (requete) => execFileSync('psql', [URL_BASE, '-Atc', requete], { encoding: 'utf8' }).trim();

const processus = [];
const EMAIL = 'chef@commerce.cd';
const MOT = 'Admin-Solide-1!';
const SECRET = randomBytes(32).toString('hex');
// Un faux service de notifications web et un faux APNs, en TLS comme les vrais.
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(travail, 'cle.pem'), '-out', join(travail, 'cert.pem'), '-days', '1', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
const tls = { key: readFileSync(join(travail, 'cle.pem')), cert: readFileSync(join(travail, 'cert.pem')) };
const recusWeb = [];
const recusApple = [];
const faussePoussee = creerHttps(tls, (req, res) => { const m = []; req.on('data', (d) => m.push(d)); req.on('end', () => { recusWeb.push({ chemin: req.url, encodage: req.headers['content-encoding'], autorisation: req.headers.authorization, taille: Buffer.concat(m).length }); res.statusCode = req.url.includes('perime') ? 410 : 201; res.end(); }); });
const fauxApns = createSecureServer({ ...tls, allowHTTP1: false }, (req, res) => { const m = []; req.on('data', (d) => m.push(d)); req.on('end', () => { recusApple.push({ chemin: req.url, autorisation: req.headers.authorization, sujet: req.headers['apns-topic'], corps: JSON.parse(Buffer.concat(m).toString()) }); res.statusCode = 200; res.end(); }); });
await new Promise((ok) => faussePoussee.listen(0, ok));
await new Promise((ok) => fauxApns.listen(0, ok));
const portPoussee = faussePoussee.address().port;
const vapid = JSON.parse(execFileSync('node', ['-e', "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"], { cwd: serveur, encoding: 'utf8' }));
const cleApple = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const envNotifications = { HUMALIS_LIMITE_API: '100000', HUMALIS_LIMITE_CONNEXION: '1000', HUMALIS_VAPID_PUBLIQUE: vapid.publicKey, HUMALIS_VAPID_PRIVEE: vapid.privateKey, HUMALIS_VAPID_SUJET: 'mailto:essai@exemple.cd', HUMALIS_PUSH_HOTES: '127.0.0.1', NODE_TLS_REJECT_UNAUTHORIZED: '0', HUMALIS_APNS_CLE: cleApple, HUMALIS_APNS_CLE_ID: 'ABC123', HUMALIS_APNS_EQUIPE: 'EQUIPE1', HUMALIS_APNS_SUJET: 'dev.humalis.essai', HUMALIS_APNS_HOTE: `127.0.0.1:${fauxApns.address().port}` };
// Un faux service Anthropic : le même format d'événements, sans dépense.
const appelsIa = [];
const fauxAnthropic = createHttp((req, res) => {
  const m = [];
  req.on('data', (d) => m.push(d));
  req.on('end', async () => {
    appelsIa.push({ cle: req.headers['x-api-key'] ?? req.headers.authorization?.replace('Bearer ', ''), beta: req.headers['anthropic-beta'], corps: JSON.parse(Buffer.concat(m).toString()) });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const envoi = (type, corps) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...corps })}\n\n`);
    envoi('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } });
    envoi('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    for (const t of ['Bon', 'jour ', 'à ', 'vous']) {
      envoi('content_block_delta', { index: 0, delta: { type: 'text_delta', text: t } });
      await new Promise((ok) => setTimeout(ok, 120));
    }
    envoi('content_block_stop', { index: 0 });
    envoi('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } });
    envoi('message_stop', {});
    res.end();
  });
});
await new Promise((ok) => fauxAnthropic.listen(0, ok));
envNotifications.ANTHROPIC_API_KEY = 'cle-d-essai';
envNotifications.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fauxAnthropic.address().port}`;
envNotifications.HUMALIS_IA_PAR_HEURE = '3';

// Un faux Stripe : il répond à la création d'une page de paiement ; le webhook est signé comme le vrai.
const appelsStripe = [];
const fauxStripe = createHttp((req, res) => {
  const m = [];
  req.on('data', (d) => m.push(d));
  req.on('end', () => {
    appelsStripe.push({ chemin: req.url, autorisation: req.headers.authorization, corps: new URLSearchParams(Buffer.concat(m).toString()) });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'cs_test_1', object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }));
  });
});
await new Promise((ok) => fauxStripe.listen(0, ok));
Object.assign(envNotifications, { STRIPE_CLE_SECRETE: 'sk_test_essai', STRIPE_SECRET_WEBHOOK: 'whsec_essai', HUMALIS_STRIPE_HOTE: `127.0.0.1:${fauxStripe.address().port}`, HUMALIS_ADRESSE_SITE: 'https://site.exemple.cd' });

const demarrer = (port) => new Promise((ok, echec) => {
  const p = spawn('node', ['dist/src/demarrer.js'], { cwd: serveur, env: { ...process.env, ...envNotifications, DATABASE_URL: URL_BASE, JWT_SECRET: SECRET, HUMALIS_ADMIN_EMAIL: EMAIL, HUMALIS_ADMIN_MOT_DE_PASSE: MOT, PORT: String(port), NODE_ENV: 'development' } });
  processus.push(p);
  const fin = setTimeout(() => echec(new Error('délai de lancement dépassé')), 30000);
  p.stderr.on('data', (m) => console.error(String(m).slice(0, 300)));
  p.stdout.on('data', () => { clearTimeout(fin); ok(); });
});

const portA = portBase + 1;
const portB = portBase + 2;
try {
  await demarrer(portA);
  await demarrer(portB);
  const A = `http://127.0.0.1:${portA}`;
  const B = `http://127.0.0.1:${portB}`;
  const json = { 'content-type': 'application/json' };
  const appeler = async (base, methode, chemin, jeton, corps) => {
    const reponse = await fetch(`${base}${chemin}`, { method: methode, headers: { ...json, ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) }, ...(corps ? { body: JSON.stringify(corps) } : {}) });
    const texte = await reponse.text();
    let valeur = null;
    try { valeur = JSON.parse(texte); } catch { /* vide */ }
    return { statut: reponse.status, valeur };
  };
  const entrer = async (email) => (await appeler(A, 'POST', '/auth/login', null, { email, password: MOT })).valeur.data.token;
  const jetonAdmin = await entrer(EMAIL);
  let numero = 0;
  const compte = async (role, champs = {}) => {
    const email = `c${++numero}@commerce.cd`;
    const id = crypto.randomUUID();
    sql(`insert into astratra_users (id, email, role, data) select '${id}', '${email}', '${role}', data || '${JSON.stringify({ id, email, role, ...champs })}'::jsonb from astratra_users where email='${EMAIL}'`);
    return { id, email, jeton: await entrer(email) };
  };

  // ─── Les groupes ──────────────────────────────────────────────────
  const gerantA = await compte('gerant', { boutique: 'A' });
  const gerantB = await compte('gerant', { boutique: 'B' });
  const sansBoutique = await compte('gerant');
  const creee = await appeler(A, 'POST', '/api/commandes', gerantA.jeton, { total: 10 });
  verifier(creee.statut === 201 && creee.valeur.boutique === 'A', 'une fiche créée prend le groupe de la personne');
  const refusee = await appeler(A, 'POST', '/api/commandes', gerantA.jeton, { total: 1, boutique: 'B' });
  verifier(refusee.statut === 400, 'on ne choisit pas son groupe en l’envoyant (400)');
  const deB = await appeler(B, 'POST', '/api/commandes', gerantB.jeton, { total: 20 });
  const listeA = await appeler(B, 'GET', '/api/commandes', gerantA.jeton);
  verifier(listeA.valeur.length === 1 && listeA.valeur[0].id === creee.valeur.id, 'chaque groupe ne voit que ses fiches, sur l’autre serveur aussi');
  const forcee = await appeler(A, 'GET', '/api/commandes?boutique=B', gerantA.jeton);
  verifier(forcee.valeur.every((f) => f.boutique === 'A'), 'demander un autre groupe dans l’adresse ne sert à rien');
  verifier((await appeler(A, 'GET', `/api/commandes/${deB.valeur.id}`, gerantA.jeton)).statut === 404, 'la fiche d’un autre groupe est introuvable (404)');
  verifier((await appeler(A, 'PATCH', `/api/commandes/${deB.valeur.id}`, gerantA.jeton, { total: 0 })).statut === 404, 'on ne la modifie pas (404)');
  verifier((await appeler(A, 'DELETE', `/api/commandes/${deB.valeur.id}`, gerantA.jeton)).statut === 404, 'on ne la supprime pas (404)');
  verifier((await appeler(A, 'GET', `/api/commandes/${deB.valeur.id}`, gerantB.jeton)).valeur.total === 20, 'elle n’a pas bougé');
  verifier((await appeler(A, 'GET', '/api/commandes', sansBoutique.jeton)).statut === 403, 'un compte sans groupe est refusé (403)');
  const toutes = await appeler(A, 'GET', '/api/commandes', jetonAdmin);
  verifier(toutes.valeur.length === 2, 'un admin voit tous les groupes');
  verifier((await appeler(A, 'POST', '/api/commandes', jetonAdmin, { total: 3 })).statut === 400, 'un admin doit préciser le groupe');
  verifier((await appeler(A, 'POST', '/api/commandes', jetonAdmin, { total: 3, boutique: 'B' })).valeur.boutique === 'B', 'un admin peut le préciser');
  verifier((await appeler(A, 'GET', '/api/commandes')).statut === 401, 'un visiteur est refusé (401)');

  // ─── Ses propres fiches ───────────────────────────────────────────
  const u1 = await compte('client');
  const u2 = await compte('client');
  const mot = await appeler(A, 'POST', '/api/messages', u1.jeton, { texte: 'bonjour' });
  verifier(mot.valeur.compte === u1.id, 'une fiche « par compte » appartient à son auteur');
  verifier((await appeler(A, 'GET', '/api/messages', u2.jeton)).valeur.length === 0, 'les autres comptes ne la voient pas');
  verifier((await appeler(A, 'DELETE', `/api/messages/${mot.valeur.id}`, u2.jeton)).statut === 404, 'les autres comptes ne la suppriment pas');
  verifier((await appeler(A, 'GET', '/api/messages', u1.jeton)).valeur.length === 1, 'son auteur la voit');

  // ─── Les règles avec « si » ───────────────────────────────────────
  const facture = await appeler(A, 'POST', '/api/factures', jetonAdmin, { montant: 5, clients: [u1.id] });
  const autreFacture = await appeler(A, 'POST', '/api/factures', jetonAdmin, { montant: 6, clients: [u2.id] });
  const vues = await appeler(A, 'GET', '/api/factures', u1.jeton);
  verifier(vues.valeur.length === 1 && vues.valeur[0].id === facture.valeur.id, 'une règle avec « si » ne montre que les fiches concernées');
  verifier((await appeler(A, 'GET', `/api/factures/${autreFacture.valeur.id}`, u1.jeton)).statut === 404, 'une fiche hors condition est introuvable');
  verifier((await appeler(A, 'GET', '/api/factures', gerantA.jeton)).valeur.length === 2, 'une règle sans condition garde tout');
  const vendeur = await compte('vendeur', { boutique: 'A' });
  verifier((await appeler(A, 'GET', '/api/factures', vendeur.jeton)).statut === 403, 'un rôle sans règle est refusé (403)');

  // ─── Le rôle qui change ───────────────────────────────────────────
  const avant = await appeler(B, 'GET', '/api/factures', vendeur.jeton);
  verifier(avant.statut === 403, 'avant : refusé');
  const change = await appeler(A, 'POST', `/auth/comptes/${vendeur.id}/role`, jetonAdmin, { role: 'gerant' });
  verifier(change.statut === 200, 'un admin change un rôle');
  verifier((await appeler(B, 'GET', '/api/factures', vendeur.jeton)).statut === 200, 'avec la même session, cela compte tout de suite, sur l’autre serveur aussi');
  await appeler(A, 'POST', `/auth/comptes/${vendeur.id}/role`, jetonAdmin, { role: 'client' });
  verifier((await appeler(B, 'GET', '/api/commandes', vendeur.jeton)).statut === 403, 'un droit retiré cesse tout de suite');
  verifier((await appeler(A, 'POST', `/auth/comptes/${vendeur.id}/role`, gerantA.jeton, { role: 'gerant' })).statut === 403, 'seul un admin change un rôle');
  verifier((await appeler(A, 'POST', `/auth/comptes/${vendeur.id}/role`, jetonAdmin, { role: 'inconnu' })).statut === 400, 'un rôle inconnu est refusé');
  const moiAdmin = sql(`select id from astratra_users where email='${EMAIL}'`);
  verifier((await appeler(A, 'POST', `/auth/comptes/${moiAdmin}/role`, jetonAdmin, { role: 'client' })).statut === 400, 'on ne change pas son propre rôle');

  // ─── Le temps réel ciblé ───────────────────────────────────────────
  const ecouter = async (base, jeton) => {
    const arret = new AbortController();
    const reponse = await fetch(`${base}/api/commandes/direct`, { headers: { authorization: `Bearer ${jeton}` }, signal: arret.signal });
    const etat = { statut: reponse.status, recu: 0, arret };
    (async () => {
      const lecteur = reponse.body.getReader();
      const decodeur = new TextDecoder();
      try {
        for (;;) {
          const { value, done } = await lecteur.read();
          if (done) return;
          etat.recu += (decodeur.decode(value).match(/data: change/g) ?? []).length;
        }
      } catch { /* arrêté */ }
    })();
    return etat;
  };
  const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const oreilleA = await ecouter(B, gerantA.jeton);
  const oreilleB = await ecouter(B, gerantB.jeton);
  const oreilleAdmin = await ecouter(B, jetonAdmin);
  verifier((await ecouter(B, sansBoutique.jeton)).statut === 403, 'un compte sans groupe n’écoute rien (403)');
  await pause(200);
  await appeler(A, 'POST', '/api/commandes', gerantA.jeton, { total: 42 });
  await pause(700);
  verifier(oreilleA.recu === 1, 'son groupe est prévenu, à travers l’autre serveur');
  verifier(oreilleB.recu === 0, 'un autre groupe n’est pas prévenu');
  verifier(oreilleAdmin.recu === 1, 'un admin est prévenu');
  for (const o of [oreilleA, oreilleB, oreilleAdmin]) o.arret.abort();

  // ─── Les actions ──────────────────────────────────────────────────
  const aRembourser = await appeler(A, 'POST', '/api/commandes', gerantA.jeton, { total: 15 });
  const faire = (jeton, id, base = A) => appeler(base, 'PATCH', `/api/commandes/faire/rembourser/${id}`, jeton, {});
  verifier((await faire(vendeur.jeton, aRembourser.valeur.id)).statut === 403, 'un rôle sans droit ne lance pas l’action (403)');
  verifier((await faire(gerantB.jeton, aRembourser.valeur.id)).statut === 404, 'une action ne touche pas la fiche d’un autre groupe (404)');
  const fait = await faire(gerantA.jeton, aRembourser.valeur.id);
  verifier(fait.statut === 200 && fait.valeur.statut === 'remboursee', 'l’action change la fiche');
  const suivis = await appeler(A, 'GET', '/api/suivis', gerantA.jeton);
  verifier(suivis.valeur.length === 1 && suivis.valeur[0].boutique === 'A', 'la fiche créée par l’action prend le groupe');
  const deuxieme = await faire(gerantA.jeton, aRembourser.valeur.id);
  verifier(deuxieme.statut === 400 && deuxieme.valeur.erreur === 'Déjà remboursée', '« refuser » renvoie son message');
  const chere = await appeler(A, 'POST', '/api/commandes', gerantA.jeton, { total: 5000 });
  const refuseeTard = await faire(gerantA.jeton, chere.valeur.id);
  const relue = await appeler(A, 'GET', `/api/commandes/${chere.valeur.id}`, gerantA.jeton);
  verifier(refuseeTard.statut === 400 && relue.valeur.statut === 'ouverte', '« refuser » annule ce qui a déjà été écrit');
  verifier((await appeler(A, 'GET', '/api/suivis', gerantA.jeton)).valeur.length === 1, '… y compris la fiche créée juste avant');
  const unique = await appeler(A, 'POST', '/api/commandes', gerantA.jeton, { total: 7 });
  const ensemble = await Promise.all([faire(gerantA.jeton, unique.valeur.id, A), faire(gerantA.jeton, unique.valeur.id, B), faire(gerantA.jeton, unique.valeur.id, A), faire(gerantA.jeton, unique.valeur.id, B)]);
  verifier(ensemble.filter((r) => r.statut === 200).length === 1, 'quatre lancements en même temps sur deux serveurs : un seul réussit');

  // ─── Les tâches ───────────────────────────────────────────────────
  const journaux = await appeler(A, 'GET', '/api/journaux', jetonAdmin);
  verifier(journaux.valeur.length === 1, 'une tâche ne tourne qu’une fois, malgré deux serveurs');

  // ─── Les documents ────────────────────────────────────────────────
  const pdf = (jeton, id) => fetch(`${A}/api/commandes/documents/recu/${id}/bon`, { headers: { authorization: `Bearer ${jeton}` } });
  const lu = await pdf(gerantA.jeton, chere.valeur.id);
  const octets = Buffer.from(await lu.arrayBuffer());
  verifier(lu.status === 200 && lu.headers.get('content-type') === 'application/pdf' && octets.subarray(0, 5).toString() === '%PDF-', 'le document est un vrai PDF');
  verifier((await pdf(gerantB.jeton, chere.valeur.id)).status === 404, 'le document d’une fiche d’un autre groupe est introuvable (404)');
  verifier((await pdf(vendeur.jeton, chere.valeur.id)).status === 403, 'un rôle qui ne lit pas la donnée n’a pas le document (403)');

  // ─── Les notifications ────────────────────────────────────────────
  const abonnement = (chemin) => ({ endpoint: `https://127.0.0.1:${portPoussee}/${chemin}`, keys: { p256dh: createECDH('prime256v1').generateKeys('base64url'), auth: hasard(16).toString('base64url') } });
  const inscrire = (jeton, corps) => appeler(A, 'POST', '/auth/appareils', jeton, corps);
  verifier((await appeler(A, 'GET', '/auth/appareils/cle')).valeur.cle === vapid.publicKey, 'la clé publique est servie aux pages');
  verifier((await inscrire(null, { web: abonnement('x') })).statut === 401, 'un visiteur n’inscrit pas d’appareil (401)');
  verifier((await inscrire(gerantA.jeton, { web: { ...abonnement('x'), endpoint: 'https://169.254.169.254/latest' } })).statut === 400, 'une adresse hors des services connus est refusée (400)');
  verifier((await inscrire(gerantA.jeton, { web: abonnement('gerant-a') })).statut === 201, 'un appareil web s’inscrit');
  verifier((await inscrire(gerantB.jeton, { web: abonnement('gerant-b') })).statut === 201, 'un autre groupe aussi');
  const jetonIphone = hasard(32).toString('hex');
  verifier((await inscrire(gerantA.jeton, { apple: jetonIphone })).statut === 201, 'un appareil Apple s’inscrit');
  const notifiee = await appeler(A, 'POST', '/api/commandes', gerantA.jeton, { total: 9 });
  await faire(gerantA.jeton, notifiee.valeur.id);
  await pause(1200);
  const web = recusWeb.filter((r) => r.chemin === '/gerant-a');
  verifier(web.length === 1 && web[0].encodage === 'aes128gcm' && web[0].autorisation?.startsWith('vapid ') && web[0].taille > 100, 'la notification web part chiffrée, signée, vers son groupe');
  verifier(!recusWeb.some((r) => r.chemin === '/gerant-b'), 'un autre groupe ne la reçoit pas');
  verifier(recusApple.length === 1 && recusApple[0].chemin === `/3/device/${jetonIphone}` && recusApple[0].sujet === 'dev.humalis.essai' && recusApple[0].autorisation?.startsWith('bearer ') && recusApple[0].corps.aps.alert.title === 'Remboursement', 'la notification Apple part signée');
  const avantPerime = sql("select count(*) from humalis_appareils");
  await inscrire(gerantA.jeton, { web: abonnement('perime') });
  const deuxiemeNotif = await appeler(A, 'POST', '/api/commandes', gerantA.jeton, { total: 8 });
  await faire(gerantA.jeton, deuxiemeNotif.valeur.id);
  await pause(1200);
  verifier(sql("select count(*) from humalis_appareils") === avantPerime, 'un appareil désabonné est oublié');

  // ─── L'IA ─────────────────────────────────────────────────────────
  const questionner = async (base, jeton) => {
    const reponse = await fetch(`${base}/auth/ia`, { method: 'POST', headers: { ...json, ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) }, body: JSON.stringify({ question: 'Bonjour' }) });
    if (!reponse.ok) return { statut: reponse.status, morceaux: [] };
    const morceaux = [];
    const lecteur = reponse.body.getReader();
    const decodeur = new TextDecoder();
    for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      morceaux.push(decodeur.decode(value));
    }
    return { statut: reponse.status, morceaux };
  };
  verifier((await questionner(A)).statut === 401, 'un visiteur ne pose pas de question (401)');
  const vendeurPur = await compte('vendeur', { boutique: 'A' });
  verifier((await questionner(A, vendeurPur.jeton)).statut === 403, 'un rôle sans droit ne pose pas de question (403)');
  const q = await questionner(A, u1.jeton);
  const texte = q.morceaux.join('').split('\n\n').filter(Boolean).map((b) => JSON.parse(b.replace('data: ', '')).t).join('');
  verifier(q.statut === 200 && q.morceaux.length >= 3 && texte === 'Bonjour à vous', 'la réponse arrive au fil de l’eau, en plusieurs morceaux');
  verifier(appelsIa.at(-1)?.corps.model === 'claude-opus-5-5' && appelsIa.at(-1)?.corps.fallbacks === 'default' && appelsIa.at(-1)?.cle === 'cle-d-essai' && appelsIa.at(-1)?.beta?.includes('server-side-fallback-2026-07-01'), 'le bon modèle, le secours et la clé sont envoyés');
  await questionner(B, u1.jeton);
  await questionner(A, u1.jeton);
  verifier((await questionner(B, u1.jeton)).statut === 429, 'le plafond vaut pour tous les serveurs (429)');

  // ─── Les paiements ────────────────────────────────────────────────
  const reservation = await appeler(A, 'POST', '/api/reservations', u1.jeton, { nom: 'Salle', total: 12.5 });
  verifier((await appeler(A, 'POST', '/api/reservations', u1.jeton, { nom: 'Salle', total: 1, paye: true })).statut === 400, 'on ne se déclare pas payé en l’envoyant (400)');
  const payer = await appeler(A, 'POST', `/api/reservations/payer/total/${reservation.valeur.id}`, u1.jeton, { retour: '//ailleurs.example', montant: 1 });
  const creation = appelsStripe.at(-1);
  verifier(payer.statut === 200 && payer.valeur.url.startsWith('https://checkout.stripe.com/'), 'la page de paiement est créée');
  verifier(creation?.corps.get('line_items[0][price_data][unit_amount]') === '1250', 'le montant vient de la fiche, pas de la page');
  verifier(creation?.corps.get('success_url') === 'https://site.exemple.cd/', 'un lien de retour vers un autre site est ignoré');
  const signer = (corps, secret = 'whsec_essai') => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${corps}`).digest('hex')}`; };
  const evenement = (montant, id = reservation.valeur.id) => JSON.stringify({ id: 'evt_1', object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', object: 'checkout.session', payment_status: 'paid', amount_total: montant, metadata: { donnee: 'reservation', id, champ: 'total' } } } });
  const webhook = (base, corps, signature) => fetch(`${base}/paiements/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: corps });
  const combienJournal = async () => (await appeler(A, 'GET', '/api/journaux', jetonAdmin)).valeur.filter((j) => j.nom === 'Salle').length;
  const lueR = async () => (await appeler(A, 'GET', `/api/reservations/${reservation.valeur.id}`, u1.jeton)).valeur;
  verifier((await webhook(A, evenement(1250), signer(evenement(1250), 'whsec_autre'))).status === 400, 'un webhook mal signé est refusé (400)');
  verifier((await lueR()).paye === false, 'la fiche n’est pas payée pour autant');
  verifier((await webhook(A, evenement(99), signer(evenement(99)))).status === 200 && (await lueR()).paye === false, 'un montant qui ne correspond pas est ignoré');
  verifier((await webhook(A, evenement(1250), signer(evenement(1250)))).status === 200 && (await lueR()).paye === true, 'un webhook signé marque la fiche payée');
  verifier(await combienJournal() === 1, '« quand … est payee » s’exécute');
  await Promise.all([webhook(A, evenement(1250), signer(evenement(1250))), webhook(B, evenement(1250), signer(evenement(1250)))]);
  verifier(await combienJournal() === 1, 'un webhook rejoué sur deux serveurs ne refait rien');
  verifier((await appeler(A, 'POST', `/api/reservations/payer/total/${reservation.valeur.id}`, u1.jeton, {})).statut === 409, 'on ne paie pas deux fois (409)');

  // ─── Actions avec valeurs, filtres, résumés ───────────────────────
  const aReduire = await appeler(A, 'POST', '/api/commandes', gerantA.jeton, { total: 40 });
  const reduire = (corps) => appeler(A, 'PATCH', `/api/commandes/faire/reduire/${aReduire.valeur.id}`, gerantA.jeton, corps);
  verifier((await reduire({ raison: 'x' })).statut === 400, 'une valeur manquante est refusée (400)');
  verifier((await reduire({ montant: 'beaucoup', raison: 'x' })).statut === 400, 'une valeur du mauvais type est refusée (400)');
  verifier((await reduire({ montant: 1, raison: 'x', autre: 1 })).statut === 400, 'une valeur inconnue est refusée (400)');
  const tropGros = await reduire({ montant: 41, raison: 'x' });
  verifier(tropGros.statut === 400 && tropGros.valeur.erreur === 'Montant trop élevé', 'une action se sert des valeurs reçues');
  const ouvertesA = (await appeler(A, 'GET', '/api/commandes', gerantA.jeton)).valeur.filter((c) => c.statut === 'ouverte' && c.total > 1).length;
  const reduite = await reduire({ montant: 15, raison: 'geste' });
  verifier(reduite.statut === 200 && reduite.valeur.total === 25, 'une action écrit un calcul avec une valeur reçue');
  verifier(reduite.valeur.note === `geste / ${ouvertesA}`, 'un calcul à deux conditions ne compte que son groupe');
  const dansA = (await appeler(A, 'GET', '/api/commandes', gerantA.jeton)).valeur.filter((c) => c.statut === 'ouverte' && c.total > 2);
  const bilan = (await appeler(B, 'GET', '/api/commandes/bilan', gerantA.jeton)).valeur;
  verifier(bilan.combien === dansA.length && bilan.recette === dansA.reduce((n, c) => n + c.total, 0) && bilan.plus_gros === undefined && bilan.plusGros === Math.max(...dansA.map((c) => c.total)), 'un résumé filtre et calcule, sur son seul groupe');
  verifier(Array.isArray((await appeler(A, 'GET', '/api/commandes/par-statut', gerantA.jeton)).valeur) && (await appeler(A, 'GET', '/api/commandes/par-statut', gerantA.jeton)).valeur.every((l) => typeof l.statut === 'string' && l.combien > 0), '« regroupe par » donne une ligne par valeur');
  verifier((await appeler(A, 'GET', '/api/commandes/bilan', vendeurPur.jeton)).statut === 403, 'un résumé garde ses droits (403)');

  // ─── Le tableau du PDF ────────────────────────────────────────────
  const texteDuPdf = (octets) => {
    const brut = octets.toString('latin1');
    const morceaux = [];
    for (const m of brut.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
      try { morceaux.push(inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')); } catch { /* pas un texte */ }
    }
    return morceaux.join('\n').split('\n').filter((l) => l.endsWith('TJ')).map((l) => [...l.matchAll(/<([0-9a-f]+)>/g)].map((x) => Buffer.from(x[1], 'hex').toString('latin1')).join('')).join('|');
  };
  await appeler(A, 'POST', '/api/articles', jetonAdmin, { commande: aReduire.valeur.id, produit: 'Stylo', quantite: 3, prix: 2.5, boutique: 'A' });
  await appeler(A, 'POST', '/api/articles', jetonAdmin, { commande: 'autre', produit: 'Gomme', quantite: 1, prix: 1, boutique: 'A' });
  const texteRecu = texteDuPdf(Buffer.from(await (await fetch(`${A}/api/commandes/documents/recu/${aReduire.valeur.id}/bon`, { headers: { authorization: `Bearer ${gerantA.jeton}` } })).arrayBuffer()));
  verifier(texteRecu.includes('Produit') && texteRecu.includes('Stylo') && texteRecu.includes('2,5'), `le PDF contient le tableau et ses valeurs`);
  verifier(!texteRecu.includes('Gomme'), 'le tableau ne montre que les lignes de cette fiche');

  // ─── Les comptes et l'équipe ──────────────────────────────────────
  const vendeurA = await compte('vendeur', { boutique: 'A' });
  const vendeurB = await compte('vendeur', { boutique: 'B' });
  const equipe = (await appeler(A, 'GET', '/api/equipe', gerantA.jeton)).valeur;
  verifier(equipe.some((c) => c.email === vendeurA.email) && !equipe.some((c) => c.email === vendeurB.email) && !equipe.some((c) => c.role === 'admin'), 'un gérant voit son équipe, ni un autre groupe, ni un admin');
  verifier((await appeler(A, 'GET', '/api/equipe', jetonAdmin)).valeur.some((c) => c.email === vendeurB.email), 'un admin voit tout le monde');
  const champs = (id, corps, jeton = gerantA.jeton) => appeler(A, 'POST', `/auth/comptes/${id}/champs`, jeton, corps);
  verifier((await champs(vendeurA.id, { telephone: '0102' })).statut === 200 && sql(`select data->>'telephone' from astratra_users where id='${vendeurA.id}'`) === '0102', 'un gérant modifie un champ déclaré de son équipe');
  verifier((await appeler(A, 'GET', '/api/equipe', gerantA.jeton)).valeur.find((c) => c.email === vendeurA.email).telephone === '0102', 'le champ se relit dans la liste');
  verifier((await champs(vendeurA.id, { role: 'admin' })).statut === 400, 'on ne se donne pas un rôle par ce chemin (400)');
  verifier((await champs(vendeurB.id, { telephone: 'x' })).statut === 404, 'pas de changement hors de son groupe (404)');
  verifier((await champs(moiAdmin, { telephone: 'x' })).statut === 404, 'pas de changement sur un admin (404)');
  verifier((await champs(vendeurA.id, { telephone: 'x' }, vendeurA.jeton)).statut === 403, 'un rôle sans droit ne change rien (403)');
  verifier((await appeler(A, 'DELETE', `/api/equipe/${vendeurB.id}`, gerantA.jeton)).statut === 404, 'on ne retire pas un compte d’un autre groupe (404)');
  verifier((await appeler(A, 'DELETE', `/api/equipe/${vendeurA.id}`, gerantA.jeton)).statut === 204, 'un gérant retire un membre de son équipe');

  // ─── Un envoi rejoué ne crée pas de doublon ───────────────────────
  const envoyerUneFois = (base, jeton, id, corps, signal) => fetch(`${base}/api/messages`, { method: 'POST', headers: { ...json, authorization: `Bearer ${jeton}`, 'x-humalis-envoi': id }, body: JSON.stringify(corps), signal });
  const textesDe = async (jeton) => (await appeler(A, 'GET', '/api/messages', jeton)).valeur.map((m) => m.texte);
  const envoiUn = randomUUID();
  const premier = await envoyerUneFois(A, u2.jeton, envoiUn, { texte: 'unique-1' });
  const corpsPremier = await premier.json();
  const rejoue = await envoyerUneFois(B, u2.jeton, envoiUn, { texte: 'unique-1' });
  const corpsRejoue = await rejoue.json();
  verifier(premier.status === 201 && rejoue.status === 201 && corpsRejoue.id === corpsPremier.id && rejoue.headers.get('x-humalis-rejoue') === '1', 'un renvoi, même sur l’autre serveur, redonne la même réponse');
  verifier((await textesDe(u2.jeton)).filter((t) => t === 'unique-1').length === 1, 'la fiche n’existe qu’une fois');
  verifier((await envoyerUneFois(A, u2.jeton, envoiUn, { texte: 'autre chose' })).status === 422, 'le même identifiant pour un autre envoi est refusé (422)');
  const envoiPartage = randomUUID();
  await envoyerUneFois(A, u1.jeton, envoiPartage, { texte: 'de-u1' });
  verifier((await envoyerUneFois(A, u2.jeton, envoiPartage, { texte: 'de-u2' })).status === 201 && (await textesDe(u2.jeton)).includes('de-u2'), 'un identifiant ne vaut que pour son compte');
  const envoiSimultane = randomUUID();
  const rafale = await Promise.all(Array.from({ length: 12 }, (_, i) => envoyerUneFois(i % 2 ? A : B, u2.jeton, envoiSimultane, { texte: 'rafale' })));
  verifier(rafale.every((r) => r.status === 201 || r.status === 409) && rafale.some((r) => r.status === 201) && (await textesDe(u2.jeton)).filter((t) => t === 'rafale').length === 1, 'douze envois simultanés sur deux serveurs : une seule fiche');
  let coupe = 0;
  for (let i = 0; i < 30; i++) {
    const id = randomUUID();
    const arret = new AbortController();
    const envoi = envoyerUneFois(i % 2 ? A : B, u2.jeton, id, { texte: `coupe-${i}` }, arret.signal).catch(() => null);
    setTimeout(() => arret.abort(), i % 6);
    if ((await envoi) === null) coupe++;
    let reponse;
    for (let essai = 0; essai < 20; essai++) {
      reponse = await envoyerUneFois(i % 2 ? B : A, u2.jeton, id, { texte: `coupe-${i}` });
      if (reponse.status !== 409) break;
      await pause(50);
    }
    if (reponse.status !== 201) verifier(false, `renvoi après coupure : statut ${reponse.status}`);
  }
  const apresCoupures = await textesDe(u2.jeton);
  verifier(Array.from({ length: 30 }, (_, i) => apresCoupures.filter((t) => t === `coupe-${i}`).length).every((n) => n === 1), `30 envois renvoyés, dont ${coupe} coupés en route : aucun doublon, aucune perte`);
  const refusUnique = randomUUID();
  verifier((await envoyerUneFois(A, u2.jeton, refusUnique, {})).status === 400 && (await envoyerUneFois(A, u2.jeton, refusUnique, { texte: 'corrige' })).status === 201, 'un envoi refusé ne bloque pas son identifiant');

  // ─── Dans un vrai navigateur, sur les deux sortes de site ──────────
  const navigateur = await chromium.launch();
  try {
    for (const nom of ['site-moteur', 'site-react']) {
      const dossier = join(travail, nom);
      const adresse = await new Promise((ok, echec) => {
        const p = spawn(join(dossier, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0', '--strictPort', 'false'], { cwd: dossier, env: { ...process.env, HUMALIS_SERVEUR: A } });
        processus.push(p);
        const fin = setTimeout(() => echec(new Error('vite preview ne répond pas')), 30000);
        p.stdout.on('data', (m) => { const url = String(m).replace(/\x1b\[[0-9;]*m/g, '').match(/http:\/\/localhost:\d+/)?.[0]; if (url) { clearTimeout(fin); ok(url); } });
      });
      await appeler(A, 'POST', '/api/commandes', gerantA.jeton, { total: 31 });
      const aPayer = await appeler(A, 'POST', '/api/reservations', gerantA.jeton, { nom: 'Page', total: 4 });
      const contexte = await navigateur.newContext({ locale: 'fr-FR' });
      const page = await contexte.newPage();
      const erreursPage = [];
      page.on('pageerror', (e) => erreursPage.push(e.message));
      await page.route('https://checkout.stripe.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Stripe</title>' }));
      await page.goto(`${adresse}/bienvenue`);
      await page.getByLabel('Email').fill(gerantA.email);
      await page.getByLabel('Mot de passe').first().fill(MOT);
      await page.getByRole('button', { name: 'Entrer' }).click();
      await page.getByRole('button', { name: 'Question' }).waitFor({ timeout: 15000 });
      verifier(true, `${nom} : la page réservée s'ouvre après la connexion`);
      const avantDirect = await page.getByRole('button', { name: 'Rembourser' }).count();
      await pause(400);
      const glisse = page.waitForFunction(() => document.getAnimations().length > 0, null, { polling: 'raf', timeout: 8000 }).then(() => true, () => false);
      await appeler(B, 'POST', '/api/commandes', gerantA.jeton, { total: 77 });
      await page.waitForFunction((n) => [...document.querySelectorAll('button')].filter((b) => b.textContent.includes('Rembourser')).length > n, avantDirect, { timeout: 8000 }).then(() => verifier(true, `${nom} : « en direct » montre un ajout venu de l'autre serveur, sans recharger`), () => verifier(false, `${nom} : « en direct » montre un ajout venu de l'autre serveur, sans recharger`));
      verifier(await glisse, `${nom} : « avec animation » anime la nouvelle ligne`);
      await page.getByRole('button', { name: 'Question' }).click();
      await page.getByText('Bonjour à vous').waitFor({ timeout: 8000 }).then(() => verifier(true, `${nom} : la réponse de l'IA s'affiche`), () => verifier(false, `${nom} : la réponse de l'IA s'affiche`));
      const reponseFaire = page.waitForResponse((r) => r.url().includes('/faire/rembourser/'));
      await page.getByRole('button', { name: 'Rembourser' }).last().click();
      verifier((await reponseFaire).status() === 200, `${nom} : « faire » lance l'action`);
      await page.getByText(/Combien : \d+/).waitFor({ timeout: 5000 }).then(() => verifier(true, `${nom} : la page affiche un résumé du serveur`), () => verifier(false, `${nom} : la page affiche un résumé du serveur`));
      const reponseReduire = page.waitForResponse((r) => r.url().includes('/faire/reduire/'));
      await page.getByRole('button', { name: 'Reduire' }).last().click();
      verifier((await reponseReduire).status() === 200, `${nom} : « faire … avec » envoie ses valeurs`);
      const reponseActiver = page.getByText(/notifications/i).first().waitFor({ timeout: 5000 });
      await page.getByRole('button', { name: 'Activer' }).click();
      await reponseActiver.then(() => verifier(true, `${nom} : « activer notifications » répond à la personne`), () => verifier(false, `${nom} : « activer notifications » répond à la personne`));
      await page.getByRole('button', { name: 'Payer' }).last().click();
      await page.waitForURL('https://checkout.stripe.com/**', { timeout: 8000 }).then(() => verifier(true, `${nom} : « payer » ouvre la page de paiement`), () => verifier(false, `${nom} : « payer » ouvre la page de paiement`));
      verifier(erreursPage.length === 0, `${nom} : aucune erreur dans la page ${erreursPage.join(' ; ')}`);
      void aPayer;
      await contexte.close();
    }
  } finally {
    await navigateur.close();
  }

  // EXTENSIONS
} finally {
  for (const p of processus) p.kill();
  faussePoussee.close();
  fauxAnthropic.close();
  fauxStripe.close();
  fauxApns.close();
  execFileSync('pg_ctl', ['-D', donnees, '-m', 'fast', 'stop'], { stdio: 'ignore', env: envBase });
}
console.log(problemes.length ? `\n${problemes.length} problème(s)` : '\nTout est vérifié.');
process.exit(problemes.length ? 1 : 0);
