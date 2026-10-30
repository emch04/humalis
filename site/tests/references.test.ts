import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXEMPLES } from '../src/contenu/exemples';
import { colorer } from '../src/coloration/colorer';
import { MOTS_CLES, formeCanonique } from '../../src/lexer/motsCles';
import { entreePrevue } from '../../src/vocabulaire/recherche';
import { SOMMAIRE } from '../src/contenu/sommaire';

const dossierPages = fileURLToPath(new URL('../src/pages', import.meta.url));
const fichiers = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fichiers(join(d, e.name)) : e.name.endsWith('.tsx') ? [join(d, e.name)] : [],
  );

const utilises = new Set<string>();
for (const f of fichiers(dossierPages)) {
  for (const m of readFileSync(f, 'utf8').matchAll(/<Exemple id="([^"]+)"/g)) utilises.add(m[1]);
}
const connus = new Set(EXEMPLES.map((e) => e.id));

describe('références aux exemples', () => {
  it('chaque <Exemple id> existe dans la liste', () => {
    expect([...utilises].filter((id) => !connus.has(id))).toEqual([]);
  });
  it('aucun exemple n’est orphelin', () => {
    expect([...connus].filter((id) => !utilises.has(id))).toEqual([]);
  });
});

describe('couverture du langage par les exemples', () => {
  const motsDesExemples = new Set(
    EXEMPLES.flatMap((e) => colorer(e.code))
      .filter((s) => s.classe === 'reserve' || s.classe === 'contextuel')
      .map((s) => formeCanonique(s.texte)),
  );

  it('chaque mot-clé disponible du langage apparaît dans au moins un exemple', () => {
    // Les mots réservés prévus (composant, serveur, non, rien) ne s'écrivent pas encore.
    expect([...MOTS_CLES].filter((m) => !entreePrevue(m) && !motsDesExemples.has(m))).toEqual([]);
  });

  it('chaque mot du langage a ses variantes montrées au moins une fois (accent et sans accent)', () => {
    const tout = EXEMPLES.map((e) => e.code).join('\n');
    for (const forme of ['égal', ' egal ', 'inférieure', 'inferieure']) expect(tout, forme).toContain(forme);
  });
});

describe('liens internes', () => {
  it('chaque lien /documentation/… écrit dans une page existe dans le sommaire', () => {
    const chemins = new Set(SOMMAIRE.map((e) => e.chemin));
    const morts: string[] = [];
    for (const f of fichiers(dossierPages)) {
      for (const m of readFileSync(f, 'utf8').matchAll(/to="(\/documentation[^"#]*)"/g)) {
        if (m[1] !== '/documentation' && !chemins.has(m[1])) morts.push(`${f} : ${m[1]}`);
      }
    }
    expect(morts).toEqual([]);
  });
});
