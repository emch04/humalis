// Fichier local, jamais commité : les empreintes des projets produits pour chaque exemple.
import { it } from 'vitest';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compilerProjet } from '../src/fichiers.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';

it.runIf(process.env.SORTIE_EMPREINTES)('empreintes', () => {
  const racine = 'exemples/';
  const out: Record<string, string> = {};
  for (const f of readdirSync(racine).filter((x) => x.endsWith('.humalis'))) {
    const lire = (c: string) => {
      try {
        return readFileSync(racine + c, 'utf8');
      } catch {
        return undefined;
      }
    };
    const r = compilerProjet(f, lire);
    if (!r.application) {
      out[f] = 'ERREUR ' + JSON.stringify(r.diagnostics.filter((d) => d.gravite === 'erreur'));
      continue;
    }
    const a = r.application;
    const gens: [string, () => Map<string, string>][] = [
      ['web', () => genererProjetWeb(a, { nom: 'e', adresse: 'https://x.cd', source: f })],
      ['statique', () => genererProjetStatique(a, { nom: 'e', source: f })],
      ['mobile', () => genererProjetMobile(a, { nom: 'e', source: f })],
      ['desktop', () => genererProjetDesktop(a, { nom: 'e', source: f })],
    ];
    for (const [c, g] of gens) {
      try {
        for (const [n, v] of g()) out[`${f} ${c} ${n}`] = createHash('sha1').update(v).digest('hex');
      } catch (e) {
        out[`${f} ${c}`] = 'EXC ' + String(e);
      }
    }
  }
  writeFileSync(process.env.SORTIE_EMPREINTES!, JSON.stringify(out, null, 1));
});
