// Vérifie en vrai, sur PostgreSQL et deux exemplaires du serveur produit : groupes, droits sur ses
// fiches, changement de rôle immédiat.
//
// Lancer : npm run build && node scripts/essai-serveur-metier.mjs [dossier-de-travail]
// Il faut PostgreSQL (initdb, pg_ctl).
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
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
const demarrer = (port) => new Promise((ok, echec) => {
  const p = spawn('node', ['dist/src/demarrer.js'], { cwd: serveur, env: { ...process.env, DATABASE_URL: URL_BASE, JWT_SECRET: SECRET, HUMALIS_ADMIN_EMAIL: EMAIL, HUMALIS_ADMIN_MOT_DE_PASSE: MOT, PORT: String(port), NODE_ENV: 'development' } });
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

  // EXTENSIONS
} finally {
  for (const p of processus) p.kill();
  execFileSync('pg_ctl', ['-D', donnees, '-m', 'fast', 'stop'], { stdio: 'ignore', env: envBase });
}
console.log(problemes.length ? `\n${problemes.length} problème(s)` : '\nTout est vérifié.');
process.exit(problemes.length ? 1 : 0);
