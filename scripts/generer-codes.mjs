// Les codes stables des messages (décidé avec le mainteneur le 17 novembre 2026).
//   npx tsx scripts/generer-codes.mjs            → src/analyse/codes-erreurs.ts, depuis catalogue/ et catalogue/codes.ts
//   npx tsx scripts/generer-codes.mjs --numeroter → catalogue/codes.ts : un code pour chaque entrée qui n'en a pas
// tests/erreurs.test.ts vérifie que les deux fichiers sont à jour.
import { readFileSync, writeFileSync } from 'node:fs';
import { ENTREES_ERREURS } from '../catalogue/erreurs.ts';
import { diagnostiquer } from '../catalogue/verification.ts';
import { gabaritDuMessage } from '../src/analyse/codes.ts';

/** Le message réel de chaque entrée atteignable : celui que son programme fautif produit. */
export function messagesDuCatalogue() {
  const messages = new Map();
  for (const e of ENTREES_ERREURS) {
    if (!e.atteignable) continue;
    const d = diagnostiquer(e.fautif).filter((x) => (e.id.startsWith('accessibilite-') ? x.categorie === 'accessibilite' : x.categorie !== 'accessibilite'));
    const m = d.find((x) => x.message.includes(e.motif));
    if (m) messages.set(e.id, m.message);
  }
  return messages;
}

/** Le gabarit d'une entrée : celui de son message réel, sinon de son motif. */
export const gabaritDe = (entree, messages) => gabaritDuMessage(messages.get(entree.id) ?? entree.motif);

export async function genererCodes(codes) {
  const messages = messagesDuCatalogue();
  const gabarits = new Map();
  for (const e of ENTREES_ERREURS) if (codes[e.id] && messages.has(e.id)) gabarits.set(gabaritDe(e, messages), codes[e.id]);
  const motifs = ENTREES_ERREURS.filter((e) => codes[e.id]).map((e) => [e.motif, codes[e.id]]).sort((a, b) => b[0].length - a[0].length || a[1].localeCompare(b[1]));
  const lignes = [...gabarits].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  return `/**
 * Produit par scripts/generer-codes.mjs depuis catalogue/ : ne pas modifier à la main.
 * Le gabarit de chaque message et son code ; puis les motifs, le plus long d'abord, pour ce que le gabarit ne retrouve pas.
 */
export const CODES_DES_GABARITS: readonly (readonly [string, string])[] = [
${lignes.map(([g, c]) => `  [${JSON.stringify(g)}, ${JSON.stringify(c)}],`).join('\n')}
];

export const CODES_DES_MOTIFS: readonly (readonly [string, string])[] = [
${motifs.map(([m, c]) => `  [${JSON.stringify(m)}, ${JSON.stringify(c)}],`).join('\n')}
];
`;
}

/** Une entrée sans code prend celui de son gabarit s'il en a un, sinon le numéro suivant le plus grand. */
export function numeroter(codes, retires) {
  const messages = messagesDuCatalogue();
  const parGabarit = new Map();
  for (const e of ENTREES_ERREURS) if (codes[e.id]) parGabarit.set(gabaritDe(e, messages), codes[e.id]);
  let plusGrand = Math.max(0, ...[...Object.values(codes), ...Object.values(retires)].map((c) => Number(c.slice(4))));
  const nouveaux = { ...codes };
  for (const e of ENTREES_ERREURS) {
    if (nouveaux[e.id]) continue;
    const g = gabaritDe(e, messages);
    const code = parGabarit.get(g) ?? 'HUM-' + String(++plusGrand).padStart(4, '0');
    parGabarit.set(g, code);
    nouveaux[e.id] = code;
  }
  return nouveaux;
}

if (process.argv[1]?.endsWith('generer-codes.mjs')) {
  const { CODES, CODES_RETIRES } = await import('../catalogue/codes.ts');
  if (process.argv.includes('--numeroter')) {
    const codes = numeroter(CODES, CODES_RETIRES);
    const texte = readFileSync(new URL('../catalogue/codes.ts', import.meta.url), 'utf8');
    const debut = texte.indexOf('export const CODES');
    const fin = texte.indexOf('};', debut) + 2;
    const table = 'export const CODES: Record<string, string> = {\n' + ENTREES_ERREURS.map((e) => '  ' + JSON.stringify(e.id) + ': ' + JSON.stringify(codes[e.id]) + ',').join('\n') + '\n};';
    writeFileSync(new URL('../catalogue/codes.ts', import.meta.url), texte.slice(0, debut) + table + texte.slice(fin));
    console.log('catalogue/codes.ts : ' + ENTREES_ERREURS.length + ' entrées.');
  }
  writeFileSync(new URL('../src/analyse/codes-erreurs.ts', import.meta.url), await genererCodes((await import('../catalogue/codes.ts?' + Date.now())).CODES));
  console.log('src/analyse/codes-erreurs.ts écrit.');
}
