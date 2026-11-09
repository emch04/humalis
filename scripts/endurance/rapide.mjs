// Une scène d'endurance sur le vrai code produit, dans ce processus.
// node --expose-gc scripts/endurance/rapide.mjs <dossier> <scene> <lots> <par lot>
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { juger } from './mesure.mjs';

const [dossier, scene, lots = '18', parLot = '400'] = process.argv.slice(2);
const LOTS = Number(lots), PAR_LOT = Number(parLot);
const stockage = () => { const m = new Map(); return { getItem: (c) => m.get(c) ?? null, setItem: () => {}, removeItem: (c) => m.delete(c) }; };
Object.assign(globalThis, { sessionStorage: stockage(), localStorage: stockage(), location: { origin: 'http://essai.test', href: 'http://essai.test/', pathname: '/', search: '' } });
const CHARGE = 'x'.repeat(2048);
globalThis.fetch = async (url) => new Response(JSON.stringify({ charge: `${url}${CHARGE}` }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'max-age=60' } });
const importer = (nom) => import(pathToFileURL(join(dossier, nom)).href);
const LONG = 'z'.repeat(2048);
let numero = 0;
// Une vraie chaîne à part entière : une simple concaténation partagerait sa mémoire et cacherait la fuite.
const unique = () => Buffer.from(`${++numero}-${LONG}`).toString("latin1");

async function preparerScene() {
  switch (scene) {
    case 'direct': {
      const { direct } = await importer('direct.mjs');
      return async () => {
        const req = new EventEmitter();
        const res = { writeHead() {}, write() {}, writableLength: 0, end() {} };
        direct.ecouter(`groupe|${unique()}`, req, res);
        req.emit('close');
      };
    }
    case 'sources': {
      const { serveur } = await importer('serveur.mjs');
      return () => serveur.lire(`fiches/${unique()}`, null, { source: 'externe', silencieux: true });
    }
    case 'lectures': {
      const { serveur } = await importer('serveur.mjs');
      return () => serveur.lire(`/api/produits?n=${unique()}`, null);
    }
    case 'positions': {
      const code = readFileSync(join(dossier, 'outils-produit.txt'), 'utf8');
      const trouve = /const MAX_POSITIONS[^\n]*\n[\s\S]*?\nfunction retenirPosition[\s\S]*?\n}\n/.exec(code);
      if (!trouve) return undefined;
      const retenir = new Function(`const positions = new Map();\n${trouve[0]}\nreturn (cle, valeur) => { retenirPosition(cle, valeur); return positions; };`)();
      return () => { retenir(unique(), 0); };
    }
    case 'fuite': {
      // Une fuite introduite exprès : l'essai doit la voir, sinon il ne prouve rien.
      const perdus = [];
      return () => { perdus.push(unique()); };
    }
    default:
      throw new Error(`scène inconnue : ${scene}`);
  }
}

const ramasser = async () => { for (let i = 0; i < 3; i++) { await new Promise((r) => setImmediate(r)); globalThis.gc(); } return process.memoryUsage().heapUsed; };
const faire = await preparerScene();
if (!faire) {
  console.log(JSON.stringify({ scene, absent: true, fuite: true, releves: [] }));
  process.exit(0);
}
const releves = [];
for (let lot = 0; lot < LOTS; lot++) {
  for (let i = 0; i < PAR_LOT; i++) await faire();
  releves.push(await ramasser());
}
console.log(JSON.stringify({ scene, operations: LOTS * PAR_LOT, releves, ...juger(releves) }));
process.exit(0);
