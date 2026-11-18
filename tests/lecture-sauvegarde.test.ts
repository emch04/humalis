import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LECTURE_SAUVEGARDE } from '../src/cibles/serveur/lecture-sauvegarde.js';

// Le plafond d'une ligne de sauvegarde (revue Codex de la 3.1.0) : la décompression rend des morceaux de 16 Ko ; une
// ligne commencée dans un morceau et finie dans le suivant doit être comptée en entier, quel que soit l'endroit où
// elle est coupée.
const PLAFOND = 20_000;
let dossier: string;
let sauvegardeLue: (fichier: string) => NodeJS.ReadableStream;

beforeAll(async () => {
  dossier = mkdtempSync(join(tmpdir(), 'humalis-lecture-'));
  const module = join(dossier, 'lecture.mjs');
  writeFileSync(module, `import { createReadStream } from 'node:fs';\nimport { createGunzip } from 'node:zlib';\n${LECTURE_SAUVEGARDE}\nexport { sauvegardeLue };\n`);
  process.env.HUMALIS_SAUVEGARDE_LIGNE_MAX = String(PLAFOND);
  try {
    ({ sauvegardeLue } = await import(pathToFileURL(module).href));
  } finally {
    delete process.env.HUMALIS_SAUVEGARDE_LIGNE_MAX;
  }
});

afterAll(() => rmSync(dossier, { recursive: true, force: true }));

/** Des lignes courtes (au plus 999 octets) qui décalent la suivante de « octets » dans le fichier décompressé. */
const decaler = (octets: number): string[] => {
  const lignes: string[] = [];
  for (let reste = octets; reste > 0; reste -= 1000) lignes.push('x'.repeat(Math.min(999, reste - 1)));
  return lignes;
};

async function lire(lignes: string[]): Promise<{ lues: number; erreur?: string }> {
  const fichier = join(dossier, `s-${Math.random().toString(36).slice(2)}.jsonl.gz`);
  writeFileSync(fichier, gzipSync(lignes.join('\n') + '\n'));
  let lues = 0;
  try {
    for await (const _ligne of createInterface({ input: sauvegardeLue(fichier), crlfDelay: Infinity })) lues += 1;
    return { lues };
  } catch (erreur) {
    return { lues, erreur: (erreur as Error).message };
  }
}

describe('plafond des lignes de sauvegarde', () => {
  it('refuse une ligne trop longue finie dans le morceau suivant (16 Ko puis le reste)', async () => {
    const resultat = await lire(['{"entete":1}', 'a'.repeat(PLAFOND + 10_000), '{"fin":1}']);
    expect(resultat.erreur).toContain(`une ligne de la sauvegarde dépasse ${PLAFOND} octets`);
  });

  it('refuse une ligne d’un octet de trop, à toutes les positions de coupure', async () => {
    for (const decalage of [0, 1, 4_000, 16_383, 16_384, 16_385, 30_000]) {
      const resultat = await lire([...decaler(decalage), 'b'.repeat(PLAFOND + 1)]);
      expect(resultat.erreur, `décalage ${decalage}`).toContain('dépasse');
    }
  });

  it('accepte une ligne exactement au plafond et des lignes courtes nombreuses', async () => {
    for (const decalage of [0, 1, 4_000, 16_383, 16_384, 16_385, 30_000]) {
      const resultat = await lire([...decaler(decalage), 'c'.repeat(PLAFOND), 'd']);
      expect(resultat, `décalage ${decalage}`).toEqual({ lues: decaler(decalage).length + 2 });
    }
    const courtes = Array.from({ length: 5_000 }, (_, i) => `{"n":${i}}`);
    expect(await lire(courtes)).toEqual({ lues: 5_000 });
  });
});
