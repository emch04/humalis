import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { racine } from './aide-grammaire.js';
import { analyser } from '../../../src/lexer/lexer.js';
import { analyserSyntaxe } from '../../../src/parser/parser.js';
import { compiler } from '../../../src/compilateur.js';

interface Extrait {
  prefix: string | string[];
  body: string | string[];
  description?: string;
}

const extraits = JSON.parse(
  readFileSync(join(racine, 'snippets', 'humalis.json'), 'utf8'),
) as Record<string, Extrait>;

/** Remplace les points d'arrêt par leur texte par défaut, comme le ferait VS Code. */
function developper(corps: string): string {
  return corps
    .replace(/\$\{\d+\|([^,|}]*)[^}]*\|\}/g, '$1')
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{?\d+\}?/g, '');
}

function texteDe(extrait: Extrait): string {
  return Array.isArray(extrait.body) ? extrait.body.join('\n') : extrait.body;
}

/** Un extrait qui n'est pas une page entière est posé dans une page, indenté. */
function enveloppe(extrait: Extrait): string {
  const code = developper(texteDe(extrait));
  if (code.startsWith('page ')) return code + '\n';
  // « utiliser … », un « serveur », un « style », une forme d'application ou une valeur partagée
  // se placent en haut du fichier, hors des pages.
  if (/^(utiliser|serveur|style|widget|donnee locale|quand une erreur arrive)\b|^variable [^\n]* avec partagee/.test(code)) return `${code}\n\npage "essai" :\n    titre "Essai"\n`;
  const indente = code
    .split('\n')
    .map((l) => (l === '' ? l : '    ' + l))
    .join('\n');
  return `page "essai" :\n${indente}\n`;
}

/** Des morceaux à poser dans une page qui a déjà ses variables et ses boutons : ils ne compilent pas seuls. */
const FRAGMENTS = new Set(['Si', 'Si sinon', 'Pour chaque', "Quand l'utilisateur clique sur", 'Bouton désactivé']);

const attendus = ['page', 'si', 'sinon', 'pour chaque', 'quand', 'variable'];

describe('extraits de code', () => {
  it('le fichier contient les extraits prévus', () => {
    const prefixes = Object.values(extraits).flatMap((e) =>
      Array.isArray(e.prefix) ? e.prefix : [e.prefix],
    );
    for (const attendu of attendus) {
      expect(prefixes.some((p) => p.includes(attendu.split(' ')[0]))).toBe(true);
    }
    expect(Object.keys(extraits).length).toBeGreaterThanOrEqual(5);
  });

  for (const [nom, extrait] of Object.entries(extraits)) {
    it(`« ${nom} » passe le lexer et le parser`, () => {
      const source = enveloppe(extrait);
      expect(() => analyserSyntaxe(analyser(source)), source).not.toThrow();
    });

    it.skipIf(FRAGMENTS.has(nom))(`« ${nom} » compile sans erreur`, () => {
      const source = enveloppe(extrait);
      const erreurs = compiler(source).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message);
      expect(erreurs, source).toEqual([]);
    });

    it(`« ${nom} » a une description en français`, () => {
      expect(extrait.description?.length ?? 0).toBeGreaterThan(5);
    });
  }
});
