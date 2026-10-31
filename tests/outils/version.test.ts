import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { reponseSimple, versionHumalis } from '../../src/outils/version.js';

// « humalis --version » : la première commande tapée après une installation.
const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

it('lit la version du paquet', () => {
  expect(versionHumalis()).toBe(version);
});

it.each(['--version', '-v', 'version'])('« humalis %s » affiche la version', (argument) => {
  expect(reponseSimple([argument], 'AIDE')).toBe(`humalis ${version}`);
});

it.each(['--aide', '--help', '-h', 'aide'])('« humalis %s » affiche le mode d’emploi', (argument) => {
  expect(reponseSimple([argument], 'AIDE')).toBe('AIDE');
});

it('laisse passer les autres commandes', () => {
  expect(reponseSimple(['verifier', 'site.humalis'], 'AIDE')).toBeUndefined();
  expect(reponseSimple(['--version', 'site.humalis'], 'AIDE')).toBeUndefined();
  expect(reponseSimple([], 'AIDE')).toBeUndefined();
});

it('annonce --version dans le mode d’emploi', () => {
  expect(readFileSync('src/cli.ts', 'utf8')).toContain('  humalis --version\n');
});
