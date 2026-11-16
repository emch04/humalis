/**
 * Rejouer sur une vraie base un scénario écrit pour un serveur en mémoire : les mêmes attaques, les mêmes réponses
 * attendues. SQLite (décidé avec le mainteneur le 12 novembre 2026) tourne partout ; PostgreSQL tourne quand
 * HUMALIS_ESSAI_POSTGRES donne l'adresse d'un serveur PostgreSQL où l'on peut créer une base
 * (ex. postgres://localhost/postgres). Chaque scénario y crée sa propre base, neuve, et l'efface à la fin.
 * Les comptes, les données, les sessions, les jetons fermés, les envois et les transactions passent par la base.
 */
export type Base = 'memoire' | 'sqlite' | 'postgres';

export const BASES: (readonly [string, Base])[] = [
  ['en mémoire', 'memoire'],
  ['dans SQLite', 'sqlite'],
  ...(process.env.HUMALIS_ESSAI_POSTGRES ? [['dans PostgreSQL', 'postgres'] as const] : []),
];

const remplacer = (texte: string, de: string, par: string): string => {
  if (!texte.includes(de)) throw new Error(`le scénario n'a pas « ${de} » : il ne peut pas être rejoué sur une base`);
  return texte.split(de).join(par);
};

/** Le scénario, branché sur la base demandée ; BASE_ESSAI y désigne la base ouverte. */
export function surBase(scenario: string, base: Base): string {
  if (base === 'memoire') return scenario;
  let texte = remplacer(scenario, 'createMemoryUsersStore()', 'createPostgresUsersStore({ pool: BASE_ESSAI })');
  texte = remplacer(texte, 'creerStockageMemoire()', 'nouveauStockage()');
  texte = remplacer(
    texte,
    'usersStore, stockages',
    'usersStore, stockages, envois: creerEnvoisPostgres(BASE_ESSAI), revocations: creerRevocationsPostgres(BASE_ESSAI), session: reglagesDeSession(process.env, creerMagasinPostgres(BASE_ESSAI)), ...transactionDe(stockages)',
  );
  const communs = `import { createPostgresUsersStore } from '@astratra/store-postgres';
import { creerEnvoisPostgres } from './dist/src/humalis/envois.js';
import { creerMagasinPostgres, creerRevocationsPostgres } from './dist/src/humalis/renouvellements.js';
import { reglagesDeSession } from './dist/src/humalis/sessions.js';
let tablesEssai = 0;`;
  if (base === 'sqlite') {
    return `${communs}
import { creerStockageSqlite, ouvrirSqlite, transactionSqlite } from './dist/src/humalis/sqlite.js';
const BASE_ESSAI = ouvrirSqlite(':memory:');
const nouveauStockage = () => creerStockageSqlite(BASE_ESSAI, 'humalis_essai_' + ++tablesEssai);
const transactionDe = (stockages) => ({ transaction: transactionSqlite(BASE_ESSAI, stockages) });
${texte}`;
  }
  return `${communs}
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { creerStockagePostgres } from './dist/src/humalis/stockage.js';
// Une base neuve par scénario, effacée à la fin : deux fichiers de tests qui tournent ensemble ne se gênent pas.
const ADMIN_ESSAI = new pg.Pool({ connectionString: process.env.HUMALIS_ESSAI_POSTGRES, max: 1 });
const NOM_BASE_ESSAI = 'humalis_essai_' + process.pid + '_' + Date.now();
await ADMIN_ESSAI.query('CREATE DATABASE ' + NOM_BASE_ESSAI);
const adresseEssai = new URL(process.env.HUMALIS_ESSAI_POSTGRES);
adresseEssai.pathname = '/' + NOM_BASE_ESSAI;
const BASE_ESSAI = new pg.Pool({ connectionString: adresseEssai.href });
// Le branchement de src/demarrer.ts, relu dans le serveur construit : les mêmes tables, les mêmes champs, le même
// journal de synchronisation (des déclencheurs dans la base) et la même transaction qu'en production.
const DEMARRER = readFileSync(new URL('./dist/src/demarrer.js', import.meta.url), 'utf8');
const TABLES = {};
for (const [, nom, table, champs] of DEMARRER.matchAll(/(\\w+): (?:pool \\? )?creerStockagePostgres\\((?:pool|client), '([a-z0-9_]+)'(?:, (\\[[^\\]]*\\]))?\\)/g)) {
  TABLES[nom] ??= { table, champs: champs ? JSON.parse(champs) : undefined };
}
const JOURNAL = DEMARRER.match(/creerJournalPostgres\\(pool, (\\{.*?\\})\\) \\}/)?.[1];
const liens = new WeakMap();
// Le nom de la donnée n'est connu qu'avec l'objet « stockages » : la table est choisie à la première lecture.
const nouveauStockage = () => {
  const lien = { nom: null, vrai: null };
  const vrai = () => (lien.vrai ??= TABLES[lien.nom] ? creerStockagePostgres(BASE_ESSAI, TABLES[lien.nom].table, TABLES[lien.nom].champs) : creerStockagePostgres(BASE_ESSAI, 'humalis_essai_' + ++tablesEssai));
  const stockage = new Proxy({}, {
    get: (_, cle) => { const v = vrai()[cle]; return typeof v === 'function' ? v.bind(vrai()) : v; },
    set: (_, cle, valeur) => { vrai()[cle] = valeur; return true; },
  });
  liens.set(stockage, lien);
  return stockage;
};
const { transactionPostgres } = await import('./dist/src/humalis/logique.js').catch(() => ({}));
const { creerJournalPostgres } = await import('./dist/src/humalis/synchro.js').catch(() => ({}));
const transactionDe = (stockages) => {
  for (const [nom, s] of Object.entries(stockages)) if (liens.has(s)) liens.get(s).nom = nom;
  return {
    ...(JOURNAL && creerJournalPostgres ? { journalSynchro: creerJournalPostgres(BASE_ESSAI, new Function('return ' + JOURNAL)()) } : {}),
    ...(transactionPostgres
      ? { transaction: transactionPostgres(BASE_ESSAI, (client) => Object.fromEntries(Object.keys(stockages).map((nom) => [nom, TABLES[nom] ? creerStockagePostgres(client, TABLES[nom].table, TABLES[nom].champs) : stockages[nom]]))) }
      : {}),
  };
};
${texte}
// Le scénario a écrit sa dernière ligne : la base d'essai est effacée (une base restée après une erreur porte le
// préfixe humalis_essai_).
await BASE_ESSAI.end();
await ADMIN_ESSAI.query('DROP DATABASE IF EXISTS ' + NOM_BASE_ESSAI + ' WITH (FORCE)');
await ADMIN_ESSAI.end();`;
}
