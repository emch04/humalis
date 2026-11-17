import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ENTREES_ERREURS } from '../catalogue/erreurs';
import { CODES, CODES_RETIRES } from '../catalogue/codes';
import { codeDuMessage } from '../src/analyse/codes';
import { gabaritDe, genererCodes, messagesDuCatalogue } from '../scripts/generer-codes.mjs';

/**
 * Les codes stables des messages (17 novembre 2026). Chaque message du compilateur a un code « HUM-0000 » ; deux
 * messages différents n'ont jamais le même ; un code retiré n'est jamais redonné.
 */
const messages = messagesDuCatalogue();

describe('les codes des messages', () => {
  it('chaque entrée du catalogue a un code, de la forme HUM-0000', () => {
    const sans = ENTREES_ERREURS.filter((e) => !/^HUM-\d{4}$/.test(CODES[e.id] ?? '')).map((e) => e.id);
    expect(sans, 'npx tsx scripts/generer-codes.mjs --numeroter').toEqual([]);
  });

  it('aucun code pour une entrée qui n’existe plus (elle va dans CODES_RETIRES)', () => {
    const ids = new Set(ENTREES_ERREURS.map((e) => e.id));
    expect(Object.keys(CODES).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('deux messages différents n’ont jamais le même code ; le même message garde le même', () => {
    const gabaritsDuCode = new Map<string, Set<string>>();
    const codesDuGabarit = new Map<string, Set<string>>();
    for (const e of ENTREES_ERREURS) {
      const g = gabaritDe(e, messages);
      const c = CODES[e.id]!;
      gabaritsDuCode.set(c, (gabaritsDuCode.get(c) ?? new Set()).add(g));
      codesDuGabarit.set(g, (codesDuGabarit.get(g) ?? new Set()).add(c));
    }
    expect([...gabaritsDuCode].filter(([, g]) => g.size > 1).map(([c, g]) => `${c} : ${[...g].join(' | ')}`)).toEqual([]);
    expect([...codesDuGabarit].filter(([, c]) => c.size > 1).map(([g, c]) => `${g} : ${[...c].join(', ')}`)).toEqual([]);
  });

  it('un code retiré n’est jamais redonné', () => {
    const retires = new Set(Object.values(CODES_RETIRES));
    expect(Object.values(CODES).filter((c) => retires.has(c))).toEqual([]);
  });

  it('le message que produit chaque programme fautif retrouve le code de son entrée', () => {
    const faux: string[] = [];
    for (const e of ENTREES_ERREURS) {
      const message = messages.get(e.id);
      if (message !== undefined && codeDuMessage(message) !== CODES[e.id]) faux.push(`${e.id} : ${codeDuMessage(message)} au lieu de ${CODES[e.id]}`);
    }
    expect(faux).toEqual([]);
  });

  it('un message inconnu n’a pas de code (rien n’est inventé)', () => {
    expect(codeDuMessage('un message que le compilateur ne produit pas')).toBeUndefined();
  });

  it('src/analyse/codes-erreurs.ts est à jour (npx tsx scripts/generer-codes.mjs)', async () => {
    expect(readFileSync(new URL('../src/analyse/codes-erreurs.ts', import.meta.url), 'utf8')).toBe(await genererCodes(CODES));
  });
});
