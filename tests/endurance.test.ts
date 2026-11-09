import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compiler } from './aide-qualite.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { pourLaCible } from '../src/ri/plateforme.js';
// @ts-expect-error : un module JavaScript des essais.
import { preparer } from '../scripts/endurance/preparer.mjs';

let dossier: string;
const scene = (nom: string, lots = 12, parLot = 300) =>
  JSON.parse(execFileSync(process.execPath, ['--expose-gc', 'scripts/endurance/rapide.mjs', dossier, nom, String(lots), String(parLot)], { encoding: 'utf8', timeout: 60000 })) as { fuite: boolean; montee: number; absent?: boolean; releves: number[] };

describe('la mémoire reste stable', () => {
  beforeAll(() => {
    const { application } = compiler(readFileSync('essais/endurance/memoire.humalis', 'utf8'));
    const web = genererProjetMoteur(pourLaCible(application!, 'web'), { nom: 'endurance', source: 'memoire.humalis' });
    const serveur = genererProjetServeur(application!.serveurs[0], { nom: 'endurance', source: 'memoire.humalis' });
    dossier = mkdtempSync(join(tmpdir(), 'humalis-endurance-'));
    preparer(dossier, { serveurJs: web.get('src/humalis/serveur.js')!, directTs: serveur.get('src/humalis/direct.ts')!, outilsJs: [...web.values()].find((code) => code.includes('let positions')) ?? '' });
  });
  afterAll(() => rmSync(dossier, { recursive: true, force: true }));

  it('l’essai voit une fuite introduite exprès', () => {
    expect(scene('fuite').fuite).toBe(true);
  }, 70000);

  for (const nom of ['direct', 'sources', 'lectures', 'positions']) {
    it(`${nom} : plus de mémoire qui monte`, () => {
      const r = scene(nom);
      expect(r.absent).toBeUndefined();
      expect(r.fuite, `montée de ${r.montee} octets`).toBe(false);
    }, 70000);
  }
});
