/**
 * Génère syntaxes/humalis.tmLanguage.json à partir des listes de
 * src/lexer/motsCles.ts. La grammaire n'est jamais écrite à la main :
 * un mot ajouté au vocabulaire est colorié sans autre travail.
 *
 * Lancer : npm run grammaire (fait aussi par `npm test` et `npm run build`).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as motsCles from '../../../src/lexer/motsCles.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const sortie = join(racine, 'syntaxes', 'humalis.tmLanguage.json');

const CONSTANTES = new Set(['vrai', 'faux']);

/**
 * Séparation réservés / contextuels. Si motsCles.ts n'a pas encore
 * MOTS_RESERVES, tous les mots-clés sont colorés comme réservés.
 */
const tous: Set<string> = motsCles.MOTS_CLES;
const reserves: Set<string> | null =
  (motsCles as Record<string, unknown>).MOTS_RESERVES instanceof Set
    ? ((motsCles as Record<string, unknown>).MOTS_RESERVES as Set<string>)
    : null;
if (!reserves) {
  console.warn(
    'MOTS_RESERVES absent de motsCles.ts : tous les mots-clés sont colorés en keyword.control.humalis.',
  );
}

const motsReserves = [...tous].filter(
  (m) => !CONSTANTES.has(m) && (reserves === null || reserves.has(m)),
);
const motsContextuels = [...tous].filter(
  (m) => !CONSTANTES.has(m) && reserves !== null && !reserves.has(m),
);
const constantes = [...tous].filter((m) => CONSTANTES.has(m));

/**
 * Accords que le lexer ramène à la forme canonique (« égale » → « egal ») :
 * lus dans VARIANTES de motsCles.ts, la seule liste qui fait foi.
 */
const ACCORDS: Record<string, string[]> = {};
for (const [accord, canonique] of motsCles.VARIANTES) {
  (ACCORDS[canonique] ??= []).push(accord);
}

/** Chaque voyelle accepte ses formes accentuées : le lexer ignore les accents. */
const CLASSES: Record<string, string> = {
  a: '[aàâä]',
  e: '[eéèêë]',
  i: '[iîï]',
  o: '[oôö]',
  u: '[uùûü]',
  c: '[cç]',
};

function motversRegex(mot: string): string {
  return [...mot].map((lettre) => CLASSES[lettre] ?? lettre).join('');
}

function alternatives(mots: string[]): string {
  const formes = new Set<string>();
  for (const mot of mots) {
    formes.add(mot);
    for (const accord of ACCORDS[mot] ?? []) formes.add(accord);
  }
  return [...formes]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .map(motversRegex)
    .join('|');
}

function motEntier(mots: string[]): string {
  return `(?<![\\p{L}0-9_])(?i:${alternatives(mots)})(?![\\p{L}0-9_])`;
}

const grammaire = {
  $schema:
    'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
  name: 'Humalis',
  scopeName: 'source.humalis',
  patterns: [
    { include: '#blocStyle' },
    { include: '#commentaire' },
    { include: '#chaine' },
    { include: '#constante' },
    { include: '#reserve' },
    { include: '#contextuel' },
    { include: '#nombre' },
    { include: '#ponctuation' },
  ],
  repository: {
    // « style : » en haut du fichier : les lignes indentées sont du CSS,
    // recopié tel quel par le compilateur (décision W8).
    blocStyle: {
      begin: '^(style)\\s*(:)\\s*$',
      beginCaptures: {
        '1': { name: 'support.function.humalis' },
        '2': { name: 'punctuation.separator.humalis' },
      },
      end: '^(?=\\S)',
      contentName: 'source.css.embedded.humalis',
      patterns: [{ include: 'source.css' }],
    },
    commentaire: {
      name: 'comment.line.number-sign.humalis',
      match: '#.*$',
    },
    chaine: {
      name: 'string.quoted.double.humalis',
      begin: '"',
      end: '"|$',
      beginCaptures: { '0': { name: 'punctuation.definition.string.begin.humalis' } },
      endCaptures: { '0': { name: 'punctuation.definition.string.end.humalis' } },
      patterns: [
        {
          match: '(\\{)([^}"]*)(\\})',
          captures: {
            '1': { name: 'punctuation.section.interpolation.begin.humalis' },
            '2': { name: 'variable.other.humalis' },
            '3': { name: 'punctuation.section.interpolation.end.humalis' },
          },
        },
      ],
    },
    constante: {
      name: 'constant.language.humalis',
      match: motEntier(constantes),
    },
    reserve: {
      name: 'keyword.control.humalis',
      match: motEntier(motsReserves),
    },
    contextuel: {
      name: 'support.function.humalis',
      match: motsContextuels.length > 0 ? motEntier(motsContextuels) : '(?!)',
    },
    nombre: {
      name: 'constant.numeric.humalis',
      match: '(?<![\\p{L}0-9_])[0-9]+(?![\\p{L}0-9_])',
    },
    ponctuation: {
      patterns: [
        { name: 'punctuation.separator.humalis', match: ':' },
        { name: 'punctuation.separator.comma.humalis', match: ',' },
        { name: 'keyword.operator.assignment.humalis', match: '=' },
        { name: 'punctuation.definition.array.humalis', match: '[\\[\\]]' },
      ],
    },
  },
};

mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(sortie, JSON.stringify(grammaire, null, 2) + '\n');
console.log(
  `Grammaire générée : ${motsReserves.length} réservés, ${motsContextuels.length} contextuels, ${constantes.length} constantes.`,
);
