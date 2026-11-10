// Le banc de mesure du moteur de rendu : le poids du JavaScript vraiment chargé et le temps
// des mises à jour, pour le même programme avec React, la cible statique et le moteur.
//
// Lancer : npm run build && node scripts/mesure-moteur.mjs [dossier-de-travail]
// Il faut Playwright (npm i --no-save playwright). Le processeur est ralenti 4 fois, pour imiter un téléphone moyen.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const travail = resolve(process.argv[2] ?? join(tmpdir(), 'humalis-mesure-moteur'));
mkdirSync(travail, { recursive: true });
const racine = process.cwd();
const { chromium } = createRequire(import.meta.url)('playwright');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

if (!existsSync(join(travail, 'node_modules/react-router'))) {
  writeFileSync(join(travail, 'package.json'), '{"private":true}');
  execFileSync('npm', ['i', 'vite@8.3.4', '@vitejs/plugin-react@6.1.2', 'react@19.3.1', 'react-dom@19.3.1', 'react-router@8.4.0', 'typescript@7.0.2', '--no-audit', '--no-fund', '--silent'], { cwd: travail, stdio: 'inherit' });
}

function produire(fichier, nom, sorte) {
  const dossier = join(travail, `${nom}-${sorte}`);
  const cible = sorte === 'statique' ? ['--cible', 'statique'] : sorte === 'react' ? ['--cible', 'web', '--moteur', 'react', '--adresse', 'https://exemple.test'] : ['--cible', 'web', '--moteur', 'humalis'];
  execFileSync('node', [join(racine, 'dist/cli.js'), 'compile', join(racine, fichier), ...cible, '--sortie', dossier], { stdio: 'ignore' });
  if (sorte === 'statique') return dossier;
  execFileSync('npx', ['vite', 'build', '--logLevel', 'silent'], { cwd: dossier, stdio: 'inherit' });
  return join(dossier, 'dist');
}

function servir(d) {
  const s = createServer((q, w) => {
    let p = join(d, decodeURIComponent(new URL(q.url, 'http://x').pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!existsSync(p)) p = join(d, 'index.html');
    w.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' });
    w.end(readFileSync(p));
  });
  return new Promise((ok) => s.listen(0, () => ok({ url: `http://localhost:${s.address().port}/`, fermer: () => s.close() })));
}

const navigateur = await chromium.launch({ channel: process.env.CANAL || undefined });
async function poids(dist) {
  const s = await servir(dist);
  const p = await navigateur.newPage();
  const fichiers = new Set();
  p.on('response', (r) => { if (r.url().endsWith('.js')) fichiers.add(new URL(r.url()).pathname); });
  await p.goto(s.url, { waitUntil: 'load' });
  await p.waitForTimeout(400);
  await p.close();
  s.fermer();
  let brut = 0;
  let gz = 0;
  for (const f of fichiers) {
    const c = readFileSync(join(dist, f));
    brut += c.length;
    gz += gzipSync(c, { level: 9 }).length;
  }
  return { fichiers: fichiers.size, brut, gz };
}

const median = (l) => [...l].sort((a, b) => a - b)[Math.floor(l.length / 2)];
async function temps(dist) {
  const s = await servir(dist);
  const p = await navigateur.newPage();
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.goto(s.url, { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelectorAll('p').length > 5000, undefined, { timeout: 120000 });
  await p.waitForTimeout(500);
  const r = await p.evaluate(async () => {
    const attendre = async () => { for (let i = 0; i < 20; i++) await null; };
    const bouton = (nom) => [...document.querySelectorAll('button')].find((b) => b.textContent === nom);
    const mesurer = async (nom, fois) => {
      const t = [];
      for (let i = 0; i < fois; i++) {
        const a = performance.now();
        bouton(nom).click();
        await attendre();
        document.body.offsetHeight;
        t.push(performance.now() - a);
        await new Promise((z) => setTimeout(z, 20));
      }
      return t;
    };
    return { plus: await mesurer('Plus', 21), ajouter: await mesurer('Ajouter', 11), inverser: await mesurer('Inverser', 11) };
  });
  await p.close();
  s.fermer();
  return { clic: median(r.plus), ajouter: median(r.ajouter), inverser: median(r.inverser) };
}

const ko = (n) => `${(n / 1000).toFixed(1)} Ko`;
const ms = (n) => `${n.toFixed(1)} ms`;
const lignes = [];
for (const [fichier, nom] of [['exemples/boutique.humalis', 'boutique'], ['exemples/interactions.humalis', 'interactions'], ['exemples/boutique-complete.humalis', 'boutique-complete']]) {
  for (const sorte of ['react', 'statique', 'moteur']) {
    if (sorte === 'statique' && nom === 'boutique-complete') continue;
    const d = await poids(produire(fichier, nom, sorte)).catch((e) => ({ erreur: String(e).slice(0, 80) }));
    lignes.push(`${nom.padEnd(18)} ${sorte.padEnd(9)} ${d.erreur ?? `${ko(d.gz).padStart(10)} compressé, ${ko(d.brut)} brut, ${d.fichiers} fichiers`}`);
  }
}
for (const sorte of ['react', 'statique', 'moteur']) {
  const t = await temps(produire('essais/moteur/mesure.humalis', 'mesure', sorte));
  lignes.push(`5 000 lignes, processeur ÷4, ${sorte.padEnd(9)} clic ${ms(t.clic)}, ajouter ${ms(t.ajouter)}, inverser ${ms(t.inverser)}`);
}
await navigateur.close();
console.log(lignes.join('\n'));
