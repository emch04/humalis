#!/usr/bin/env node
/**
 * L'essai au point près des pages « dessinee pour » (sur un Mac, avec Xcode et Chrome) : la même page est
 * mesurée sur le site, dans Chrome à la largeur de l'appareil, et dans l'application Apple, qui écrit la
 * place de chaque élément. Les deux mesures sont comparées élément par élément.
 *
 *   node scripts/essai-apple-dessin.mjs [fichier.humalis] [--appareil "iPhone 17 Pro" | --mac] [--sombre] [--web] [--page index.html]
 *
 * --web : le site de référence est le site web (le moteur Humalis), servi le temps de la mesure, au lieu
 *   du site statique ; « --page » est alors une adresse (« / » par défaut).
 *
 * HUMALIS_ESSAI_APPLE : le dossier de travail.
 * HUMALIS_CONSTRUIRE : un script qui construit et signe (« script projet schéma dossier Debug », DESTINATION
 *   dans l'environnement) ; sans lui, xcodebuild construit avec les réglages du projet.
 * HUMALIS_EQUIPE : l'équipe Apple Developer, passée à « humalis compile --equipe ».
 * HUMALIS_TOLERANCE : l'écart permis, en points (1,5 par défaut).
 * CHROME : le chemin de Chrome.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { setTimeout as attendre } from 'node:timers/promises';

if (process.platform !== 'darwin') {
  console.log('Cet essai demande un Mac avec Xcode : rien à faire ici.');
  process.exit(0);
}

const racine = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const option = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
const fichier = resolve(args.find((a, i) => !a.startsWith('--') && !['--appareil', '--page'].includes(args[i - 1])) ?? join(racine, 'scripts/essais-apple/dessin/tableau.humalis'));
const surMac = args.includes('--mac');
const sombre = args.includes('--sombre');
const nomAppareil = option('--appareil') ?? 'iPhone 17 Pro';
const surLeWeb = args.includes('--web');
const pageHtml = option('--page') ?? (surLeWeb ? '/' : 'index.html');
const tolerance = Number(process.env.HUMALIS_TOLERANCE ?? 1.5);
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const travail = process.env.HUMALIS_ESSAI_APPLE ?? join(tmpdir(), 'humalis-essai-dessin');
const nom = basename(fichier, '.humalis');

mkdirSync(travail, { recursive: true });
execFileSync('npm', ['run', 'build'], { cwd: racine, stdio: 'ignore' });
const cli = join(racine, 'dist/cli.js');

// 1. Le site statique et le projet Xcode, avec les relevés de place.
const site = join(travail, 'site');
const apple = join(travail, 'apple');
for (const d of [site, apple]) rmSync(d, { recursive: true, force: true });
execFileSync('node', [cli, 'compile', fichier, '--cible', surLeWeb ? 'web' : 'statique', '--sortie', site], { stdio: 'ignore' });
// Un identifiant propre à l'essai : l'application ne partage jamais les données (ni le bac à sable) d'une vraie.
const identifiantEssai = `local.humalis.essai-dessin.${nom.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
execFileSync('node', [cli, 'compile', fichier, '--cible', 'apple', '--sortie', apple, '--identifiant', identifiantEssai, ...(process.env.HUMALIS_EQUIPE ? ['--equipe', process.env.HUMALIS_EQUIPE] : [])], { stdio: 'ignore', env: { ...process.env, HUMALIS_ESSAI_CADRES: '1' } });
const projet = readdirSync(apple).find((f) => f.endsWith('.xcodeproj'));
const schema = basename(projet, '.xcodeproj');
const derive = join(travail, 'derive');

function construire(destination) {
  const r = process.env.HUMALIS_CONSTRUIRE
    ? spawnSync(process.env.HUMALIS_CONSTRUIRE, [join(apple, projet), schema, derive, 'Debug'], { encoding: 'utf8', env: { ...process.env, DESTINATION: destination }, maxBuffer: 1 << 28 })
    : spawnSync('xcodebuild', ['-project', join(apple, projet), '-scheme', schema, '-destination', destination, '-derivedDataPath', derive, 'build'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (`${r.stdout}`.includes('BUILD SUCCEEDED')) return;
  console.error([...new Set(`${r.stdout}\n${r.stderr}`.split('\n').filter((l) => l.includes('error:')))].slice(0, 12).join('\n') || 'la construction a échoué');
  process.exit(1);
}

/** Lit « VUE l h z » et « CADRE id x y l h » ; la dernière valeur de chaque élément compte. */
function lireReleves(texte) {
  let vue;
  const cadres = new Map();
  for (const ligne of texte.split('\n')) {
    const v = /^VUE ([\d.]+) ([\d.]+) ([\d.]+)/.exec(ligne.trim());
    if (v) vue = { largeur: +v[1], hauteur: +v[2], z: +v[3] };
    const c = /^CADRE (\S+) (-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)/.exec(ligne.trim());
    if (c) cadres.set(c[1], { x: +c[2], y: +c[3], l: +c[4], h: +c[5] });
  }
  return { vue, cadres };
}

/** Lance un programme et garde ce qu'il écrit, jusqu'à ce que la page soit posée (trois secondes sans relevé). */
async function ecouter(commande, args, env = {}) {
  const p = spawn(commande, args, { env: { ...process.env, ...env } });
  let texte = '';
  let dernier = Date.now();
  const lire = (d) => { texte += d; dernier = Date.now(); };
  p.stdout.on('data', lire);
  p.stderr.on('data', lire);
  const debut = Date.now();
  while (Date.now() - debut < 60000 && !(texte.includes('VUE ') && Date.now() - dernier > 3000)) await attendre(250);
  p.kill();
  writeFileSync(join(travail, 'console.txt'), texte);
  return texte;
}

// 2. L'application : ses relevés.
let releves;
let appareil;
if (surMac) {
  construire('platform=macOS');
  const executable = join(derive, 'Build/Products/Debug', `${schema}.app`, 'Contents/MacOS', schema);
  releves = lireReleves(await ecouter(executable, [], { HUMALIS_ESSAI_CADRES: '1' }));
} else {
  const appareils = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], { encoding: 'utf8', maxBuffer: 1 << 24 })).devices;
  appareil = Object.values(appareils).flat().find((d) => d.name === nomAppareil);
  if (!appareil) { console.error(`Le simulateur « ${nomAppareil} » n'existe pas.`); process.exit(1); }
  construire('generic/platform=iOS Simulator');
  spawnSync('xcrun', ['simctl', 'boot', appareil.udid]);
  execFileSync('xcrun', ['simctl', 'bootstatus', appareil.udid, '-b'], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'ui', appareil.udid, 'appearance', sombre ? 'dark' : 'light']);
  const app = join(derive, 'Build/Products/Debug-iphonesimulator', `${schema}.app`);
  execFileSync('xcrun', ['simctl', 'install', appareil.udid, app]);
  const identifiant = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print CFBundleIdentifier', join(app, 'Info.plist')], { encoding: 'utf8' }).trim();
  const lancer = async () => lireReleves(await ecouter('xcrun', ['simctl', 'launch', '--console-pty', '--terminate-running-process', appareil.udid, identifiant], { SIMCTL_CHILD_HUMALIS_ESSAI_CADRES: '1' }));
  releves = await lancer();
  // Juste après le démarrage du simulateur, le premier lancement peut ne rien écrire : une seconde chance.
  if (!releves.vue) releves = await lancer();
  spawnSync('xcrun', ['simctl', 'terminate', appareil.udid, identifiant]);
  // Un seul simulateur à la fois, éteint après usage.
  spawnSync('xcrun', ['simctl', 'shutdown', appareil.udid]);
}
if (!releves.vue) { console.error("L'application n'a écrit aucun relevé : la page est-elle dessinée ?"); process.exit(1); }
const { z } = releves.vue;

// 3. Le site, dans Chrome, à la même largeur (en pixels CSS : la taille de la vue divisée par l'échelle du dessin).
const largeur = Math.round(releves.vue.largeur / z);
const hauteur = Math.round(releves.vue.hauteur / z);
const port = 9300 + Math.floor(Math.random() * 500);
const profil = join(travail, 'chrome');
const navigateur = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profil}`, 'about:blank'], { stdio: 'ignore' });
let cible;
for (let i = 0; i < 50 && !cible; i++) {
  await attendre(200);
  cible = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).then((l) => l.find((t) => t.type === 'page')).catch(() => undefined);
}
const ws = new WebSocket(cible.webSocketDebuggerUrl);
await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));
let suivant = 0;
const attentes = new Map();
ws.addEventListener('message', (m) => { const r = JSON.parse(m.data); attentes.get(r.id)?.(r); });
const envoyer = (method, params = {}) => new Promise((ok) => { const id = ++suivant; attentes.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
await envoyer('Emulation.setDeviceMetricsOverride', { width: largeur, height: hauteur, deviceScaleFactor: 2, mobile: !surMac });
await envoyer('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: sombre ? 'dark' : 'light' }] });
await envoyer('Page.enable');
// Le site web appelle ses fichiers depuis la racine : il est servi, le temps de la mesure.
const TYPES = { html: 'text/html', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', png: 'image/png', woff2: 'font/woff2', json: 'application/json' };
const serveur = surLeWeb
  ? createServer((q, r) => {
      const chemin = decodeURIComponent(new URL(q.url, 'http://x').pathname);
      const candidats = [join(site, chemin), join(site, 'public', chemin), join(site, chemin, 'index.html'), join(site, 'index.html')];
      const trouve = candidats.find((c) => c.startsWith(site) && existsSync(c) && !c.endsWith('/'));
      try { r.writeHead(200, { 'content-type': TYPES[trouve.split('.').pop()] ?? 'application/octet-stream' }); r.end(readFileSync(trouve)); } catch { r.writeHead(404); r.end(); }
    }).listen(0, '127.0.0.1')
  : undefined;
if (serveur) await new Promise((ok) => serveur.once('listening', ok));
await envoyer('Page.navigate', { url: serveur ? `http://127.0.0.1:${serveur.address().port}${pageHtml}` : `file://${join(site, pageHtml)}` });
await attendre(1500);
const mesure = await envoyer('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, l: b.width, h: b.height }; };
    const sortie = {};
    for (const e of document.querySelectorAll('[data-humalis]')) sortie[e.dataset.humalis] = r(e);
    const page = document.querySelector('.humalis-page'); if (page) sortie['@page'] = r(page);
    const barre = document.querySelector('.humalis-barre-laterale'); if (barre && getComputedStyle(barre).display !== 'none') sortie['@barre'] = r(barre);
    return sortie;
  })()`,
});
ws.close();
serveur?.close();
navigateur.kill();
await new Promise((ok) => navigateur.once('exit', ok));
const surLeSite = mesure.result.result.value;

// 4. La comparaison.
const lignes = [];
let ecarts = 0;
for (const [id, a] of releves.cadres) {
  const s = surLeSite[id];
  if (!s) continue;
  const app = { x: a.x / z, y: a.y / z, l: a.l / z, h: a.h / z };
  const d = Math.max(...['x', 'y', 'l', 'h'].map((k) => Math.abs(app[k] - s[k])));
  if (d > tolerance) ecarts++;
  const f = (v) => v.toFixed(1).padStart(7);
  lignes.push(`${d > tolerance ? '✗' : '✓'} ${id.padEnd(36)} site ${f(s.x)}${f(s.y)}${f(s.l)}${f(s.h)}   app ${f(app.x)}${f(app.y)}${f(app.l)}${f(app.h)}   écart ${d.toFixed(1)}`);
}
const rapport = `${nom} — ${surMac ? 'Mac' : nomAppareil}${sombre ? ', sombre' : ''} — ${largeur} × ${hauteur} pixels CSS (échelle ${z.toFixed(3)})\n${lignes.join('\n')}\n\n${lignes.length - ecarts} éléments à moins de ${tolerance} point, ${ecarts} plus loin.`;
console.log(rapport);
writeFileSync(join(travail, `rapport-${surMac ? 'mac' : nomAppareil.replace(/\s+/g, '-')}${sombre ? '-sombre' : ''}.txt`), rapport);
if (lignes.length === 0) { console.error('Aucun élément commun aux deux mesures.'); process.exitCode = 1; }
else if (ecarts > 0) process.exitCode = 1;
if (existsSync(profil)) rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
