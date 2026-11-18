import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** La page des nouveautés du site suit la version du paquet : la frise et l'encadré « Version actuelle » (18 novembre). */
const page = readFileSync(new URL('../site-public/pages/nouveautes.humalis', import.meta.url), 'utf8');
const version = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

describe('la page des nouveautés', () => {
  it('la première version de la frise, marquée « Dernière version », est celle du paquet', () => {
    expect(/texte "([^"]+)" sans traduction avec style "version-numero"/.exec(page)?.[1]).toBe(version);
    // La pastille, une seule fois, entre la première version et la deuxième.
    const premiere = page.indexOf('style "version-numero"');
    const deuxieme = page.indexOf('style "version-numero"', premiere + 1);
    const pastille = page.indexOf('"Dernière version"');
    expect(page.match(/"Dernière version"/g)).toHaveLength(1);
    expect(pastille > premiere && pastille < deuxieme).toBe(true);
  });

  it('l’encadré « Version actuelle » dit la version du paquet', () => {
    expect(/texte "([^"]+)" sans traduction avec style "aside-version"/.exec(page)?.[1]).toBe(version);
  });
});
