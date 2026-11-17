/**
 * Rejouer sur une vraie base un scénario écrit pour un serveur en mémoire : les mêmes attaques, les mêmes réponses
 * attendues. SQLite (décidé avec le mainteneur le 12 novembre 2026) tourne partout ; PostgreSQL tourne quand
 * HUMALIS_ESSAI_POSTGRES donne l'adresse d'un serveur PostgreSQL où l'on peut créer une base
 * (ex. postgres://localhost/postgres). Chaque scénario y crée sa propre base, neuve, et l'efface à la fin.
 * Les comptes, les données, les sessions, les jetons fermés, les envois et les transactions passent par la base.
 */
export type Base = 'memoire' | 'sqlite' | 'postgres' | 'mysql' | 'mariadb' | 'documents';

export const BASES: (readonly [string, Base])[] = [
  ['en mémoire', 'memoire'],
  ['dans SQLite', 'sqlite'],
  ...(process.env.HUMALIS_ESSAI_POSTGRES ? [['dans PostgreSQL', 'postgres'] as const] : []),
  // Les bases ajoutées le 17 novembre 2026 (revue de sécurité de la 3.0.0) : les mêmes attaques, les mêmes réponses.
  // HUMALIS_ESSAI_MYSQL=mysql://root:…@127.0.0.1:3306, HUMALIS_ESSAI_MARIADB=mariadb://root:…@127.0.0.1:3307,
  // HUMALIS_ESSAI_DOCUMENTS=mongodb://127.0.0.1:27017/?directConnection=true (un jeu de répliques).
  ...(process.env.HUMALIS_ESSAI_MYSQL ? [['dans MySQL', 'mysql'] as const] : []),
  ...(process.env.HUMALIS_ESSAI_MARIADB ? [['dans MariaDB', 'mariadb'] as const] : []),
  ...(process.env.HUMALIS_ESSAI_DOCUMENTS ? [['dans une base de documents', 'documents'] as const] : []),
];

/** Le branchement d'une base ajoutée le 17 novembre 2026 : MySQL, MariaDB (les magasins de PostgreSQL, traduits) ou documents. */
function surNouvelleBase(texte: string, communs: string, base: 'mysql' | 'mariadb' | 'documents'): string {
  const variable = base === 'mysql' ? 'HUMALIS_ESSAI_MYSQL' : base === 'mariadb' ? 'HUMALIS_ESSAI_MARIADB' : 'HUMALIS_ESSAI_DOCUMENTS';
  const documents = base === 'documents';
  let corps = texte;
  if (documents) {
    // Chaque magasin a sa propre écriture pour les documents.
    corps = remplacer(corps, 'createPostgresUsersStore({ pool: BASE_ESSAI })', 'creerComptesDocuments(BASE_ESSAI)');
    corps = remplacer(corps, 'envois: creerEnvoisPostgres(BASE_ESSAI), revocations: creerRevocationsPostgres(BASE_ESSAI), session: reglagesDeSession(process.env, creerMagasinPostgres(BASE_ESSAI))', 'envois: creerEnvoisDocuments(BASE_ESSAI), revocations: creerRevocationsDocuments(BASE_ESSAI), session: reglagesDeSession(process.env, creerSessionsDocuments(BASE_ESSAI))');
  }
  const ouverture = documents
    ? `import { MongoClient } from 'mongodb';
import { creerComptesDocuments, creerEnvoisDocuments, creerRevocationsDocuments, creerSessionsDocuments, creerStockageDocuments as creerStockageBase, ouvrirDocuments, transactionDocuments as transactionBase } from './dist/src/humalis/documents.js';
const NOM_BASE_ESSAI = 'humalis_essai_' + process.pid + '_' + Date.now();
const adresseEssai = new URL(process.env.${variable});
adresseEssai.pathname = '/' + NOM_BASE_ESSAI;
const BASE_ESSAI = await ouvrirDocuments(adresseEssai.href);
const { creerJournalDocuments: creerJournalBase } = await import('./dist/src/humalis/synchro-documents.js').catch(() => ({}));
const effacerBaseEssai = async () => { const c = new MongoClient(adresseEssai.href); await c.db().dropDatabase(); await c.close(); };`
    : `import mysqlEssai from 'mysql2/promise';
import { creerStockageMysql as creerStockageBase, ouvrirMysql, transactionMysql as transactionBase } from './dist/src/humalis/mysql.js';
const ADRESSE_ADMIN_ESSAI = process.env.${variable}.replace(/^mariadb:/, 'mysql:');
const NOM_BASE_ESSAI = 'humalis_essai_' + process.pid + '_' + Date.now();
{
  const admin = await mysqlEssai.createConnection(ADRESSE_ADMIN_ESSAI);
  await admin.query('CREATE DATABASE ' + NOM_BASE_ESSAI);
  await admin.end();
}
const adresseEssai = new URL(process.env.${variable});
adresseEssai.pathname = '/' + NOM_BASE_ESSAI;
const BASE_ESSAI = await ouvrirMysql(adresseEssai.href);
const { creerJournalMysql: creerJournalBase } = await import('./dist/src/humalis/synchro-mysql.js').catch(() => ({}));
const effacerBaseEssai = async () => { const admin = await mysqlEssai.createConnection(ADRESSE_ADMIN_ESSAI); await admin.query('DROP DATABASE IF EXISTS ' + NOM_BASE_ESSAI); await admin.end(); };`;
  return `${communs}
import { readFileSync } from 'node:fs';
${ouverture}
// Le branchement de src/demarrer.ts, relu dans le serveur construit : les mêmes tables et les mêmes champs qu'en production.
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
  const vrai = () => (lien.vrai ??= TABLES[lien.nom] ? creerStockageBase(BASE_ESSAI, TABLES[lien.nom].table, TABLES[lien.nom].champs) : creerStockageBase(BASE_ESSAI, 'humalis_essai_' + ++tablesEssai));
  const stockage = new Proxy({}, {
    get: (_, cle) => { const v = vrai()[cle]; return typeof v === 'function' ? v.bind(vrai()) : v; },
    set: (_, cle, valeur) => { vrai()[cle] = valeur; return true; },
  });
  liens.set(stockage, lien);
  return stockage;
};
const transactionDe = (stockages) => {
  for (const [nom, s] of Object.entries(stockages)) if (liens.has(s)) liens.get(s).nom = nom;
  return {
    ...(JOURNAL && creerJournalBase ? { journalSynchro: creerJournalBase(BASE_ESSAI, new Function('return ' + JOURNAL)()) } : {}),
    transaction: transactionBase(BASE_ESSAI, stockages),
  };
};
${corps}
// Le scénario a écrit sa dernière ligne : la base d'essai est effacée (une base restée après une erreur porte le
// préfixe humalis_essai_).
await BASE_ESSAI.fermer();
await effacerBaseEssai();`;
}

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
  if (base === 'mysql' || base === 'mariadb' || base === 'documents') return surNouvelleBase(texte, communs, base);
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
// La base d'essai est supprimée à la fin : une connexion au repos coupée à ce moment ne fait pas tomber l'essai.
ADMIN_ESSAI.on('error', () => {});
BASE_ESSAI.on('error', () => {});
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
