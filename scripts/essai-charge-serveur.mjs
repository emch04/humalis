// Mesure en vrai ce que tient le serveur produit : des milliers de pages en direct sur deux serveurs,
// et le coût de la relecture du compte à chaque requête.
//
// Lancer : npm run build && node scripts/essai-charge-serveur.mjs [dossier] [nombre de connexions]
// Il faut PostgreSQL (initdb, pg_ctl).
import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-charge'));
const CONNEXIONS = Number(process.argv[3] ?? 4000);
rmSync(join(travail, 'pg'), { recursive: true, force: true });
mkdirSync(travail, { recursive: true });
const problemes = [];
const verifier = (ok, message) => { if (!ok) problemes.push(message); console.log(`${ok ? '✓' : '✗'} ${message}`); };

const compilerVariante = (nom, source) => {
  const fichier = join(travail, `${nom}.humalis`);
  writeFileSync(fichier, source);
  const dossier = join(travail, nom);
  execFileSync('node', ['dist/cli.js', 'compile', fichier, '--cible', 'serveur', '--sortie', dossier], { stdio: 'ignore' });
  execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund', '--silent'], { cwd: dossier, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: dossier, stdio: 'ignore' });
  return dossier;
};
const source = readFileSync('essais/serveur/charge.humalis', 'utf8');
const avecRelecture = compilerVariante('avec', source);
const sansRelecture = compilerVariante('sans', source.replace('donnee fiche par boutique :', 'donnee fiche :'));

const portBase = 5900 + Math.floor(Math.random() * 90);
const donnees = join(travail, 'pg');
const envBase = { ...process.env, LC_ALL: 'C', LANG: 'C' };
execFileSync('initdb', ['-D', donnees, '-A', 'trust', '-U', 'essai', '--no-sync', '--locale=C', '-E', 'UTF8'], { stdio: 'ignore', env: envBase });
execFileSync('pg_ctl', ['-D', donnees, '-o', `-p ${portBase} -k ${travail} -c max_connections=200`, '-w', '-l', join(travail, 'pg.log'), 'start'], { stdio: 'ignore', env: envBase });
const URL_BASE = `postgres://essai@127.0.0.1:${portBase}/postgres`;
const sql = (r) => execFileSync('psql', [URL_BASE, '-Atc', r], { encoding: 'utf8' }).trim();

const EMAIL = 'chef@charge.cd';
const MOT = 'Admin-Solide-1!';
const SECRET = randomBytes(32).toString('hex');
const processus = [];
const demarrer = (dossier, port) => new Promise((ok, echec) => {
  const p = spawn('node', ['dist/src/demarrer.js'], { cwd: dossier, env: { ...process.env, DATABASE_URL: URL_BASE, JWT_SECRET: SECRET, HUMALIS_ADMIN_EMAIL: EMAIL, HUMALIS_ADMIN_MOT_DE_PASSE: MOT, PORT: String(port), NODE_ENV: 'development', HUMALIS_LIMITE_API: '100000000', HUMALIS_LIMITE_CONNEXION: '1000', HUMALIS_DIRECT_MAX: String(CONNEXIONS * 2) } });
  processus.push(p);
  const fin = setTimeout(() => echec(new Error('délai dépassé')), 30000);
  p.stderr.on('data', (m) => { if (!String(m).includes('security_event')) console.error(String(m).slice(0, 200)); });
  p.stdout.on('data', () => { clearTimeout(fin); ok(p); });
});
const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });
const appel = (port, methode, chemin, jeton, corps) => new Promise((ok, echec) => {
  const texte = corps ? JSON.stringify(corps) : undefined;
  const r = http.request({ host: '127.0.0.1', port, path: chemin, method: methode, agent, headers: { ...(texte ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(texte) } : {}), ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) } }, (res) => {
    const m = [];
    res.on('data', (d) => m.push(d));
    res.on('end', () => ok({ statut: res.statusCode, corps: Buffer.concat(m).toString() }));
  });
  r.on('error', echec);
  if (texte) r.write(texte);
  r.end();
});
const entrer = async (port, email) => JSON.parse((await appel(port, 'POST', '/auth/login', null, { email, password: MOT })).corps).data.token;
const creerCompte = (role, champs = {}) => {
  const email = `c${randomUUID().slice(0, 8)}@charge.cd`;
  const id = randomUUID();
  sql(`insert into astratra_users (id, email, role, data) select '${id}', '${email}', '${role}', data || '${JSON.stringify({ id, email, role, ...champs })}'::jsonb from astratra_users where email='${EMAIL}'`);
  return email;
};
const rang = (liste, part) => [...liste].sort((a, b) => a - b)[Math.min(liste.length - 1, Math.floor(liste.length * part))];
const ms = (n) => `${n.toFixed(1)} ms`;
const pause = (d) => new Promise((ok) => setTimeout(ok, d));

async function mesurerLectures(port, jeton, n = 3000, parallele = 32) {
  const durees = [];
  let refus = 0;
  let restantes = n;
  const debut = performance.now();
  await Promise.all(Array.from({ length: parallele }, async () => {
    while (restantes-- > 0) {
      const t = performance.now();
      const r = await appel(port, 'GET', '/api/libres', jeton);
      if (r.statut !== 200) refus++;
      durees.push(performance.now() - t);
    }
  }));
  return { p50: rang(durees, 0.5), p95: rang(durees, 0.95), parSeconde: durees.length / ((performance.now() - debut) / 1000), refus };
}

const rss = (p) => Math.round(Number(execFileSync('ps', ['-o', 'rss=', '-p', String(p.pid)], { encoding: 'utf8' }).trim()) / 1024);

try {
  // ─── Le coût de la relecture du compte ────────────────────────────
  const sansP = await demarrer(sansRelecture, portBase + 1);
  await pause(300);
  const jetonSans = await entrer(portBase + 1, EMAIL);
  await mesurerLectures(portBase + 1, jetonSans, 300);
  const sans = await mesurerLectures(portBase + 1, jetonSans);
  sansP.kill();
  await demarrer(avecRelecture, portBase + 2).then(() => pause(300));
  const jetonAvec = await entrer(portBase + 2, EMAIL);
  await mesurerLectures(portBase + 2, jetonAvec, 300);
  const avec = await mesurerLectures(portBase + 2, jetonAvec);
  console.log(`Lecture, compte relu   : médiane ${ms(avec.p50)}, 95 % ${ms(avec.p95)}, ${Math.round(avec.parSeconde)} par seconde, refus ${avec.refus}`);
  console.log(`Lecture, sans relecture : médiane ${ms(sans.p50)}, 95 % ${ms(sans.p95)}, ${Math.round(sans.parSeconde)} par seconde, refus ${sans.refus}`);
  console.log(`Écart : ${ms(avec.p50 - sans.p50)} à la médiane (${Math.round((avec.p50 / sans.p50 - 1) * 100)} %)`);
  verifier(avec.refus === 0 && sans.refus === 0, 'aucune lecture refusée pendant la mesure');

  // ─── Des milliers de pages en direct ──────────────────────────────
  const A = portBase + 2;
  const pB = await demarrer(avecRelecture, portBase + 3);
  await pause(300);
  const B = portBase + 3;
  const jetonA = await entrer(A, creerCompte('gerant', { boutique: 'A' }));
  const jetonB = await entrer(A, creerCompte('gerant', { boutique: 'B' }));
  const ouvertes = [];
  let coupees = 0;
  let totalA = 0;
  let totalB = 0;
  let surChange = () => {};
  const ouvrir = (port, jeton, groupe) => new Promise((ok, echec) => {
    const r = http.request({ host: '127.0.0.1', port, path: '/api/fiches/direct', agent: false, headers: { authorization: `Bearer ${jeton}` } }, (res) => {
      if (res.statusCode !== 200) { echec(new Error(`statut ${res.statusCode}`)); return; }
      res.on('data', (d) => {
        if (!String(d).includes('data: change')) return;
        if (groupe === 'A') { totalA++; surChange(); } else totalB++;
      });
      res.on('close', () => { coupees++; });
      ok(r);
    });
    r.on('error', echec);
    r.setTimeout(0);
    r.end();
    ouvertes.push(r);
  });
  const debutOuverture = performance.now();
  const rssAvant = rss(pB);
  let ouvertesOk = 0;
  const parLot = 100;
  for (let i = 0; i < CONNEXIONS; i += parLot) {
    await Promise.all(Array.from({ length: Math.min(parLot, CONNEXIONS - i) }, (_, k) => ouvrir((i + k) % 2 === 0 ? A : B, (i + k) % 4 < 2 ? jetonA : jetonB, (i + k) % 4 < 2 ? 'A' : 'B').then(() => { ouvertesOk++; })));
  }
  const dureeOuverture = (performance.now() - debutOuverture) / 1000;
  await pause(1000);
  console.log(`Connexions ouvertes : ${ouvertesOk} en ${dureeOuverture.toFixed(1)} s ; mémoire d'un serveur : ${rssAvant} Mo avant, ${rss(pB)} Mo avec ${Math.round(CONNEXIONS / 2)} connexions`);
  verifier(ouvertesOk === CONNEXIONS, `${CONNEXIONS} connexions tiennent, réparties sur deux serveurs`);

  const attendues = CONNEXIONS / 2;
  const latences = [];
  let manquantes = 0;
  for (let n = 0; n < 15; n++) {
    await pause(500);
    let recues = 0;
    let derniere = 0;
    const t = performance.now();
    await new Promise((fini) => {
      const delai = setTimeout(fini, 4000);
      surChange = () => { recues++; derniere = performance.now() - t; if (recues >= attendues) { clearTimeout(delai); fini(); } };
      appel(A, 'POST', '/api/fiches', jetonA, { nom: `n${n}` });
    });
    if (recues < attendues) manquantes += attendues - recues;
    latences.push(derniere);
  }
  surChange = () => {};
  console.log(`Annonce à ${attendues} pages sur deux serveurs : médiane ${ms(rang(latences, 0.5))}, pire ${ms(Math.max(...latences))} (regroupement de 100 ms compris)`);
  verifier(manquantes === 0, 'chaque annonce arrive à toutes les pages du groupe');
  verifier(totalB === 0, `l'autre groupe n'a rien reçu (${totalB})`);
  verifier(coupees === 0, `aucune connexion coupée (${coupees})`);
  verifier(rang(latences, 0.5) < 2000, 'la moitié des annonces arrive en moins de 2 secondes');
  for (const r of ouvertes) r.destroy();
} finally {
  for (const p of processus) p.kill();
  execFileSync('pg_ctl', ['-D', donnees, '-m', 'fast', 'stop'], { stdio: 'ignore', env: envBase });
}
console.log(problemes.length ? `\n${problemes.length} problème(s)` : '\nTout est vérifié.');
process.exit(problemes.length ? 1 : 0);
