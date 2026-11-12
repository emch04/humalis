/**
 * Rejouer sur SQLite un scénario écrit pour un serveur en mémoire : les mêmes attaques, les mêmes réponses
 * attendues, sur la seconde base du serveur produit (décidé avec le mainteneur le 12 novembre 2026).
 * Les comptes, les données, les sessions, les jetons fermés, les envois et les transactions passent par SQLite.
 */
export const BASES = [['en mémoire', false], ['dans SQLite', true]] as const;

const remplacer = (texte: string, de: string, par: string): string => {
  if (!texte.includes(de)) throw new Error(`le scénario n'a pas « ${de} » : il ne peut pas être rejoué sur SQLite`);
  return texte.split(de).join(par);
};

export function surSqlite(scenario: string): string {
  let texte = remplacer(scenario, 'createMemoryUsersStore()', 'createPostgresUsersStore({ pool: BASE_SQLITE })');
  texte = remplacer(texte, 'creerStockageMemoire()', "creerStockageSqlite(BASE_SQLITE, 'humalis_essai_' + ++tablesSqlite)");
  texte = remplacer(
    texte,
    'usersStore, stockages',
    'usersStore, stockages, envois: creerEnvoisPostgres(BASE_SQLITE), revocations: creerRevocationsPostgres(BASE_SQLITE), session: reglagesDeSession(process.env, creerMagasinPostgres(BASE_SQLITE)), transaction: transactionSqlite(BASE_SQLITE, stockages)',
  );
  return `import { createPostgresUsersStore } from '@astratra/store-postgres';
import { creerStockageSqlite, ouvrirSqlite, transactionSqlite } from './dist/src/humalis/sqlite.js';
import { creerEnvoisPostgres } from './dist/src/humalis/envois.js';
import { creerMagasinPostgres, creerRevocationsPostgres } from './dist/src/humalis/renouvellements.js';
import { reglagesDeSession } from './dist/src/humalis/sessions.js';
const BASE_SQLITE = ouvrirSqlite(':memory:');
let tablesSqlite = 0;
${texte}`;
}
