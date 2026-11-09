// La version longue de l'essai de mémoire : le vrai serveur produit et le vrai moteur web dans Chrome.
// Lancer : npm run build && npm run essai:endurance [dossier-de-travail] [changements de page] [requêtes]
// Il faut Google Chrome (HUMALIS_CHROME pour un autre chemin). La suite normale garde la version courte.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as attendre } from 'node:timers/promises';
import { enMo, juger } from './endurance/mesure.mjs';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-essai-endurance'));
const PAGES = Number(process.argv[3] ?? 3000);
const REQUETES = Number(process.argv[4] ?? 20000);
const LOTS = 15;
const CHROME = process.env.HUMALIS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT_SOURCE = 5987, PORT_SERVEUR = 5988, PORT_SONDE = 5989;
const source = 'essais/endurance/memoire.humalis';
const serveur = join(travail, 'serveur'), web = join(travail, 'web');
mkdirSync(travail, { recursive: true });
const processus = [];
const compiler = (cible, sortie, ...plus) => execFileSync('node', ['dist/cli.js', 'compile', source, '--cible', cible, '--sortie', sortie, ...plus], { stdio: ['ignore', 'ignore', 'pipe'] });

compiler('serveur', serveur);
compiler('web', web, '--moteur', 'humalis');
execFileSync('npx', ['-y', 'npm@11', 'install', '--no-audit', '--no-fund', '--silent'], { cwd: serveur, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: serveur, stdio: 'ignore' });
execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent'], { cwd: web, stdio: 'inherit' });
execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: web, stdio: 'inherit', env: { ...process.env, VITE_HUMALIS_SERVEUR: `http://127.0.0.1:${PORT_SERVEUR}` } });

// Une petite porte dans le serveur : un ramassage forcé, puis la mémoire utilisée.
const sonde = join(travail, 'sonde.mjs');
writeFileSync(sonde, `import http from 'node:http';
http.createServer((q, r) => { globalThis.gc(); globalThis.gc(); r.end(String(process.memoryUsage().heapUsed)); }).listen(${PORT_SONDE}, '127.0.0.1').unref();
`);
const lancer = (commande, args, options, pret) => new Promise((ok, echec) => {
  const p = spawn(commande, args, options);
  processus.push(p);
  const fin = setTimeout(() => echec(new Error(`${commande} ne démarre pas`)), 60000);
  const lire = (m) => { const t = pret(String(m)); if (t) { clearTimeout(fin); ok(t); } };
  p.stdout?.on('data', lire);
  p.stderr?.on('data', lire);
});
const arreter = () => { for (const p of processus) p.kill('SIGKILL'); };
process.on('exit', arreter);

let resultat = 0;
try {
  await lancer('node', ['--expose-gc', '--import', sonde, 'dist/src/demarrer.js'], { cwd: serveur, env: { ...process.env, PORT: String(PORT_SERVEUR), JWT_SECRET: randomBytes(32).toString('hex'), HUMALIS_ADMIN_EMAIL: 'admin@essai.test', HUMALIS_ADMIN_PASSWORD: 'Admin-Solide-1!' } }, () => true);
  await attendre(1500);

  // ─── Le serveur : des requêtes, et des liaisons directes ouvertes puis fermées ───
  const agent = new http.Agent({ keepAlive: true, maxSockets: 32 });
  const lire = (chemin) => new Promise((ok, echec) => {
    http.get({ host: '127.0.0.1', port: PORT_SERVEUR, path: chemin, agent }, (r) => { r.resume(); r.on('end', () => ok(r.statusCode)); }).on('error', echec);
  });
  const direct = () => new Promise((ok, echec) => {
    const q = http.get({ host: '127.0.0.1', port: PORT_SERVEUR, path: '/api/produits/direct' }, (r) => { r.once('data', () => { q.destroy(); ok(r.statusCode); }); });
    q.on('error', (e) => (e.code === 'ECONNRESET' ? ok(0) : echec(e)));
  });
  const memoireServeur = () => new Promise((ok, echec) => http.get({ host: '127.0.0.1', port: PORT_SONDE }, (r) => { let t = ''; r.on('data', (d) => (t += d)); r.on('end', () => ok(Number(t))); }).on('error', echec));
  const relevesServeur = [];
  const parLot = Math.ceil(REQUETES / LOTS);
  for (let l = 0; l < LOTS; l++) {
    for (let i = 0; i < parLot; i += 16) await Promise.all(Array.from({ length: 16 }, () => lire('/api/produits')));
    for (let i = 0; i < parLot / 10; i += 8) await Promise.all(Array.from({ length: 8 }, () => direct()));
    await attendre(200);
    relevesServeur.push(await memoireServeur());
  }
  const avisServeur = juger(relevesServeur, { seuil: 2 * 1024 * 1024 });
  console.log(`${avisServeur.fuite ? '✗' : '✓'} serveur : ${REQUETES} requêtes et ${Math.round(REQUETES / 10)} liaisons directes, ${enMo(relevesServeur[0])} au début, montée après l'échauffement : ${enMo(avisServeur.montee)}`);
  if (avisServeur.fuite) resultat = 1;

  // ─── Le moteur web : des changements de page et des réponses toutes différentes ───
  const CHARGE = 'x'.repeat(4096);
  let servies = 0;
  http.createServer((q, r) => {
    servies++;
    r.setHeader('access-control-allow-origin', '*');
    r.setHeader('content-type', 'application/json');
    r.end(JSON.stringify({ nom: q.url, charge: CHARGE }));
  }).listen(PORT_SOURCE, '127.0.0.1').unref();
  const adresse = await lancer(join(web, 'node_modules', '.bin', 'vite'), ['preview', '--port', '0', '--strictPort', 'false'], { cwd: web, env: { ...process.env, HUMALIS_SERVEUR: `http://127.0.0.1:${PORT_SERVEUR}` } }, (m) => m.match(/http:\/\/localhost:\d+/)?.[0]);
  const profil = join(travail, 'chrome');
  rmSync(profil, { recursive: true, force: true });
  const ws = await lancer(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profil}`, '--remote-debugging-port=0', 'about:blank'], {}, (m) => m.match(/ws:\/\/\S+/)?.[0]);
  const canal = new WebSocket(ws);
  await new Promise((ok) => canal.addEventListener('open', ok, { once: true }));
  let id = 0;
  const attentes = new Map();
  canal.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && attentes.has(m.id)) { attentes.get(m.id)(m); attentes.delete(m.id); } });
  const envoyer = (method, params = {}, sessionId) => new Promise((ok, echec) => {
    const n = ++id;
    attentes.set(n, (m) => (m.error ? echec(new Error(`${method} : ${m.error.message}`)) : ok(m.result)));
    canal.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await envoyer('Target.createTarget', { url: `${adresse}/fiche/0` });
  const { sessionId } = await envoyer('Target.attachToTarget', { targetId, flatten: true });
  await envoyer('Runtime.enable', {}, sessionId);
  await attendre(3000);
  const evaluer = async (expression) => {
    const r = await envoyer('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const allerDeA = (de, a) => evaluer(`(async () => {
    const arrive = (i) => document.querySelector('h1')?.textContent === 'Fiche ' + i && document.body.textContent.includes('/fiches?id=' + i);
    for (let i = ${de}; i < ${a}; i++) {
      const lien = document.createElement('a');
      lien.href = '/fiche/' + i;
      document.body.append(lien);
      lien.click();
      lien.remove();
      const debut = performance.now();
      while (!arrive(i)) {
        if (performance.now() - debut > 8000) throw new Error('page ' + i + ' pas ouverte : ' + document.body.textContent.slice(0, 200));
        await new Promise((r) => setTimeout(r, 1));
      }
    }
    return true;
  })()`);
  const memoirePage = async () => { await envoyer('HeapProfiler.collectGarbage', {}, sessionId); await envoyer('HeapProfiler.collectGarbage', {}, sessionId); return (await envoyer('Runtime.getHeapUsage', {}, sessionId)).usedSize; };
  await envoyer('HeapProfiler.enable', {}, sessionId);
  const relevesPage = [];
  const pagesParLot = Math.ceil(PAGES / LOTS);
  const debut = Date.now();
  for (let l = 0; l < LOTS; l++) {
    await allerDeA(1 + l * pagesParLot, 1 + (l + 1) * pagesParLot);
    relevesPage.push(await memoirePage());
  }
  const avisPage = juger(relevesPage, { seuil: 1024 * 1024 });
  console.log(`${avisPage.fuite ? '✗' : '✓'} moteur web : ${PAGES} changements de page dans Chrome (${Math.round((Date.now() - debut) / 1000)} s, ${servies} réponses de la source), ${enMo(relevesPage[0])} au début, montée après l'échauffement : ${enMo(avisPage.montee)}`);
  console.log(JSON.stringify({ serveur: relevesServeur, page: relevesPage }));
  if (avisPage.fuite) resultat = 1;
} catch (erreur) {
  console.error(erreur);
  resultat = 2;
}
arreter();
process.exit(resultat);
