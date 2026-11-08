// Vérifie en vrai, sur PostgreSQL et deux exemplaires du serveur produit : groupes, droits sur ses
// fiches, changement de rôle immédiat.
//
// Lancer : npm run build && node scripts/essai-serveur-metier.mjs [dossier-de-travail]
// Il faut PostgreSQL (initdb, pg_ctl).
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer as creerHttps } from 'node:https';
import { createSecureServer } from 'node:http2';
import { createECDH, generateKeyPairSync, randomBytes as hasard } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-metier'));
rmSync(join(travail, 'pg'), { recursive: true, force: true });
mkdirSync(travail, { recursive: true });
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
const envNotifications = { HUMALIS_VAPID_PUBLIQUE: vapid.publicKey, HUMALIS_VAPID_PRIVEE: vapid.privateKey, HUMALIS_VAPID_SUJET: 'mailto:essai@exemple.cd', HUMALIS_PUSH_HOTES: '127.0.0.1', NODE_TLS_REJECT_UNAUTHORIZED: '0', HUMALIS_APNS_CLE: cleApple, HUMALIS_APNS_CLE_ID: 'ABC123', HUMALIS_APNS_EQUIPE: 'EQUIPE1', HUMALIS_APNS_SUJET: 'dev.humalis.essai', HUMALIS_APNS_HOTE: `127.0.0.1:${fauxApns.address().port}` };
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

  // EXTENSIONS
} finally {
  for (const p of processus) p.kill();
  faussePoussee.close();
  fauxApns.close();
  execFileSync('pg_ctl', ['-D', donnees, '-m', 'fast', 'stop'], { stdio: 'ignore', env: envBase });
}
console.log(problemes.length ? `\n${problemes.length} problème(s)` : '\nTout est vérifié.');
process.exit(problemes.length ? 1 : 0);
