import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url)), 'utf8');

/** Les variables d'un bloc CSS : « --fond: #fff; » */
function variables(bloc: string): Record<string, string> {
  return Object.fromEntries([...bloc.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));
}

const debutSombre = css.indexOf('@media (prefers-color-scheme: dark)');
const clair = variables(css.slice(0, debutSombre));
const sombre = { ...clair, ...variables(css.slice(debutSombre)) };

function luminance(hex: string): number {
  const canaux = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canaux.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a: string, b: string): number {
  const [haut, bas] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (haut + 0.05) / (bas + 0.05);
}

/** [texte, fond] : chaque paire réellement utilisée par le site. */
const PAIRES: [string, string][] = [
  ['texte', 'fond'],
  ['texte', 'fond-doux'],
  ['texte', 'code-fond'],
  ['texte-discret', 'fond'],
  ['texte-discret', 'fond-doux'],
  ['accent', 'fond'],
  ['accent', 'fond-doux'],
  ['accent-fort', 'fond'],
  ['accent-fort', 'fond-doux'],
  ['sur-accent', 'accent'],
  ['sur-accent', 'accent-fort'],
  ['erreur', 'fond-erreur'],
  ['avertissement', 'fond-avertissement'],
  ['succes', 'fond-succes'],
  ['erreur', 'fond'],
  ['code-reserve', 'code-fond'],
  ['code-contextuel', 'code-fond'],
  ['code-chaine', 'code-fond'],
  ['code-variable', 'code-fond'],
  ['code-nombre', 'code-fond'],
  ['code-commentaire', 'code-fond'],
  ['code-liaison', 'code-fond'],
];

describe('contrastes (WCAG AA, 4,5:1)', () => {
  for (const [nom, theme] of [['clair', clair], ['sombre', sombre]] as const) {
    describe(`thème ${nom}`, () => {
      for (const [texte, fond] of PAIRES) {
        it(`${texte} sur ${fond}`, () => {
          expect(theme[texte], `--${texte} manque`).toBeDefined();
          expect(theme[fond], `--${fond} manque`).toBeDefined();
          expect(contraste(theme[texte], theme[fond])).toBeGreaterThanOrEqual(4.5);
        });
      }
    });
  }
});
