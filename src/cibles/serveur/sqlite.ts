/**
 * SQLite, la seconde base du serveur produit (décidé avec le mainteneur le 12 novembre 2026) : un seul fichier, par le
 * module `node:sqlite` de Node, sans rien installer. PostgreSQL reste la base des serveurs à plusieurs
 * exemplaires ; SQLite sert un serveur seul (petit projet, essai, hébergement simple).
 *
 * `HUMALIS_BASE=donnees/boutique.sqlite` choisit SQLite ; `DATABASE_URL` choisit PostgreSQL ; sans l'un ni
 * l'autre, les données restent en mémoire.
 *
 * Ce fichier produit `src/humalis/sqlite.ts` : la base (une connexion, les transactions une à la fois) et le
 * stockage des données. Les autres magasins (comptes, sessions, envois…) s'y ajoutent un à un.
 */

/** src/humalis/sqlite.ts */
export const SQLITE = String.raw`import { AsyncLocalStorage } from 'node:async_hooks';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { nouvelId, sansSeparateurs, type Enregistrement, type Stockage } from './stockage.js';

/**
 * Produit par Humalis : SQLite, la base d'un serveur seul. Un fichier, une connexion : chaque requête passe
 * par des paramètres liés, et les transactions se suivent une à la fois.
 */
export interface BaseSqlite {
  /** Pour les rares requêtes qui ne s'écrivent pas de la même façon dans les deux bases. */
  readonly sqlite: true;
  /** Une requête à paramètres liés ($1, $2…), comme avec PostgreSQL. */
  query(texte: string, valeurs?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
  /** Tout ou rien : une erreur dans « faire » annule ce qui a été écrit. Les autres écritures attendent la fin. */
  transaction<T>(faire: () => Promise<T>): Promise<T>;
  fermer(): void;
}

/** Ce qu'une valeur devient dans la base : SQLite ne connaît ni vrai ni faux, ni objet. */
const lier = (valeur: unknown): null | number | bigint | string | Uint8Array => {
  if (valeur === undefined || valeur === null) return null;
  if (typeof valeur === 'boolean') return valeur ? 1 : 0;
  if (typeof valeur === 'number' || typeof valeur === 'bigint' || typeof valeur === 'string' || valeur instanceof Uint8Array) return valeur;
  return JSON.stringify(valeur);
};

const MAINTENANT = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/**
 * Les magasins du serveur (sessions, envois, coffre, comptes…) écrivent leurs requêtes une seule fois, pour
 * PostgreSQL. Les quelques tournures que SQLite n'a pas sont réécrites ici, et nulle part ailleurs :
 * « now() », « now() - interval '2 hours' », les conversions « ::jsonb », et GREATEST.
 */
export function versSqlite(texte: string): string {
  return texte
    .replace(/now\(\)\s*-\s*interval\s*'(\d+)\s*(second|minute|hour|day)s?'/gi, (_tout, nombre: string, unite: string) => "strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-" + nombre + ' ' + unite.toLowerCase() + "s')")
    .replace(/DEFAULT\s+now\(\)/gi, 'DEFAULT (' + MAINTENANT + ')')
    .replace(/\bnow\(\)/gi, MAINTENANT)
    .replace(/::[a-z_]+(\[\])?/gi, '')
    .replace(/\bGREATEST\s*\(/gi, 'MAX(');
}

/** Ouvre (ou crée) le fichier de la base. « :memory: » : une base qui disparaît à l'arrêt, pour les tests. */
export function ouvrirSqlite(chemin: string): BaseSqlite {
  // node:sqlite est stable à partir de Node 24 ; avant, le module manque ou avertit à chaque démarrage.
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('SQLite demande Node 24 ou plus récent (ici : ' + process.versions.node + '). Mettez Node à jour, ou utilisez PostgreSQL (DATABASE_URL).');
  const fichier = chemin === ':memory:' ? chemin : resolve(chemin);
  if (fichier !== ':memory:') mkdirSync(dirname(fichier), { recursive: true });
  const base = new DatabaseSync(fichier);
  // Le fichier porte les comptes et leurs mots de passe hachés : lisible par son seul propriétaire.
  if (fichier !== ':memory:') chmodSync(fichier, 0o600);
  // WAL : les lectures ne bloquent pas l'écriture ; « synchronous = NORMAL » reste sûr avec WAL.
  base.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const dansLaTransaction = new AsyncLocalStorage<true>();
  let ouverte = false;
  let liberee: Promise<void> = Promise.resolve();

  const executer = (ecrit: string, valeurs: unknown[] = []) => {
    const texte = versSqlite(ecrit);
    // Plusieurs instructions sans paramètre (la création des tables) : d'un seul coup.
    if (valeurs.length === 0 && /;\s*\S/.test(texte)) {
      base.exec(texte);
      return { rows: [], rowCount: 0 };
    }
    const requete = base.prepare(texte);
    // Seuls les paramètres écrits dans la requête sont liés.
    const lies: Record<string, null | number | bigint | string | Uint8Array> = {};
    valeurs.forEach((valeur, i) => {
      if (new RegExp('\\$' + (i + 1) + '(?!\\d)').test(texte)) lies['$' + (i + 1)] = lier(valeur);
    });
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(texte) || /\bRETURNING\b/i.test(texte)) {
      const rows = requete.all(lies) as Record<string, unknown>[];
      // Comme PostgreSQL : une colonne BOOLEAN rend vrai ou faux, une colonne JSONB rend sa valeur.
      const types = requete.columns().flatMap((c) => (c.type && /^(BOOLEAN|JSONB?)$/i.test(c.type) ? [[c.name, c.type.toUpperCase()] as const] : []));
      if (types.length > 0) {
        for (const ligne of rows) {
          for (const [nom, type] of types) {
            const valeur = ligne[nom];
            if (valeur === null || valeur === undefined) continue;
            ligne[nom] = type === 'BOOLEAN' ? valeur !== 0 && valeur !== '0' : typeof valeur === 'string' ? JSON.parse(valeur) : valeur;
          }
        }
      }
      return { rows: rows.map((ligne) => ({ ...ligne })), rowCount: rows.length };
    }
    return { rows: [], rowCount: Number(requete.run(lies).changes) };
  };

  return {
    async query(texte, valeurs) {
      // Une transaction est ouverte par quelqu'un d'autre : cette requête attend, pour ne pas s'y mêler.
      while (ouverte && !dansLaTransaction.getStore()) await liberee;
      return executer(texte, valeurs);
    },
    async transaction(faire) {
      if (dansLaTransaction.getStore()) return faire();
      while (ouverte) await liberee;
      ouverte = true;
      let liberer!: () => void;
      liberee = new Promise<void>((fin) => (liberer = fin));
      try {
        base.exec('BEGIN IMMEDIATE');
        const resultat = await dansLaTransaction.run(true, faire);
        base.exec('COMMIT');
        return resultat;
      } catch (erreur) {
        try {
          base.exec('ROLLBACK');
        } catch {
          // La transaction était déjà annulée par SQLite.
        }
        throw erreur;
      } finally {
        ouverte = false;
        liberer();
      }
    },
    fermer() {
      base.close();
    },
    sqlite: true,
  };
}

/** La table d'une donnée. « ordre » : l'ordre de création, sans égalité possible ; « cree_le » : l'instant, pour la lecture humaine. */
export function preparerTableSqlite(base: BaseSqlite, table: string): Promise<unknown> {
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error('nom de table invalide : ' + table);
  return base.query('CREATE TABLE IF NOT EXISTS ' + table + ' (ordre INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL, cree_le TEXT NOT NULL DEFAULT (' + MAINTENANT + '))');
}

/** « tout ou rien » pour la logique du serveur : les mêmes stockages, dans une transaction de la base. */
export function transactionSqlite<S>(base: BaseSqlite, stockages: S): <T>(corps: (s: S) => Promise<T>) => Promise<T> {
  return (corps) => base.transaction(() => corps(stockages));
}

/**
 * Les données dans SQLite : une table par donnée, la fiche en JSON, lue et filtrée par les fonctions JSON de
 * SQLite. « champs » : les champs de la donnée d'aujourd'hui (un champ retiré reste dans la base, il n'en sort plus).
 */
export function creerStockageSqlite(base: BaseSqlite, table: string, champs?: readonly string[]): Stockage {
  // Le nom de la table est fixé par le compilateur ; on le vérifie quand même.
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error('nom de table invalide : ' + table);
  let prete: Promise<unknown> | undefined;
  const preparer = () => (prete ??= preparerTableSqlite(base, table));
  const lire = (ligne: Record<string, unknown>): Enregistrement => {
    const donnees = JSON.parse(String(ligne.data)) as Record<string, unknown>;
    if (!champs) return { ...donnees, id: String(ligne.id) };
    const fiche: Enregistrement = { id: String(ligne.id) };
    for (const champ of champs) if (champ !== 'id' && Object.hasOwn(donnees, champ)) fiche[champ] = donnees[champ];
    return fiche;
  };
  return {
    async lister(filtres) {
      await preparer();
      const valeurs: unknown[] = [];
      const conditions: string[] = [];
      // Chaque champ demandé a exactement cette valeur, du même type : « 5 » n'est pas 5, vrai n'est pas 1.
      // Le nom du champ et sa valeur sont des paramètres liés : aucun chemin JSON n'est fabriqué.
      for (const [champ, valeur] of Object.entries(filtres?.egal ?? {})) {
        valeurs.push(champ, typeof valeur === 'boolean' ? (valeur ? 'true' : 'false') : valeur);
        const cle = '$' + (valeurs.length - 1);
        const attendu = '$' + valeurs.length;
        const test = typeof valeur === 'boolean' ? 'f.type = ' + attendu : typeof valeur === 'number' ? "f.type IN ('integer', 'real') AND f.value = " + attendu : "f.type = 'text' AND f.value = " + attendu;
        conditions.push('EXISTS (SELECT 1 FROM json_each(data) AS f WHERE f.key = ' + cle + ' AND ' + test + ')');
      }
      let texte = 'SELECT id, data FROM ' + table;
      if (conditions.length > 0) texte += ' WHERE ' + conditions.join(' AND ');
      texte += ' ORDER BY ordre';
      const numero = filtres?.numero;
      if (!numero) {
        if (filtres?.limite !== undefined || filtres?.depuis !== undefined) {
          valeurs.push(filtres?.limite ?? -1, filtres?.depuis ?? 0);
          texte += ' LIMIT $' + (valeurs.length - 1) + ' OFFSET $' + valeurs.length;
        }
        return (await base.query(texte, valeurs)).rows.map(lire);
      }
      // Un numéro se compare sans ses séparateurs : la même règle que le stockage en mémoire, fiche par fiche.
      const debut = filtres?.depuis ?? 0;
      const fiches = (await base.query(texte, valeurs)).rows.map(lire).filter((fiche) => sansSeparateurs(fiche[numero.champ]) === numero.valeur);
      return filtres?.limite === undefined ? fiches.slice(debut) : fiches.slice(debut, debut + filtres.limite);
    },
    async trouver(id) {
      await preparer();
      const { rows } = await base.query('SELECT id, data FROM ' + table + ' WHERE id = $1', [id]);
      return rows[0] ? lire(rows[0]) : null;
    },
    async creer(valeurs) {
      await preparer();
      const id = nouvelId();
      await base.query('INSERT INTO ' + table + ' (id, data) VALUES ($1, $2)', [id, JSON.stringify(valeurs)]);
      return { ...valeurs, id };
    },
    async modifier(id, valeurs) {
      await preparer();
      // json_patch retirerait un champ mis à « rien » : la fiche est relue, complétée, puis réécrite, d'un seul tenant.
      return base.transaction(async () => {
        const { rows } = await base.query('SELECT id, data FROM ' + table + ' WHERE id = $1', [id]);
        if (!rows[0]) return null;
        const nouvelle = { ...(JSON.parse(String(rows[0].data)) as Record<string, unknown>), ...valeurs };
        await base.query('UPDATE ' + table + ' SET data = $2 WHERE id = $1', [id, JSON.stringify(nouvelle)]);
        return lire({ id, data: JSON.stringify(nouvelle) });
      });
    },
    async supprimer(id) {
      await preparer();
      return (await base.query('DELETE FROM ' + table + ' WHERE id = $1', [id])).rowCount > 0;
    },
  };
}
`;

/** src/humalis/synchro-sqlite.ts : seulement quand le programme synchronise une donnée. */
export const SYNCHRO_SQLITE = String.raw`import type { BaseSqlite } from './sqlite.js';
import { preparerTableSqlite } from './sqlite.js';
import type { Stockage } from './stockage.js';
import { ficheRendue, type JournalSynchro, type LigneJournal, type Resultat } from './synchro.js';

/**
 * Produit par Humalis : le journal de la synchronisation dans SQLite. Un seul serveur écrit dans le fichier :
 * chaque écriture d'une fiche suivie note sa ligne au journal dans la même transaction (avec PostgreSQL, ce
 * sont des déclencheurs de la base, pour plusieurs serveurs).
 */
export function creerJournalSqlite(base: BaseSqlite, tables: Record<string, { table: string; portee: string[]; champs?: string[] }>): JournalSynchro {
  for (const { table } of Object.values(tables)) if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error('nom de table invalide : ' + table);
  const porteeDe = (donnee: string, fiche: Record<string, unknown> | null) => Object.fromEntries((tables[donnee]?.portee ?? []).filter((c) => fiche !== null && c in fiche).map((c) => [c, fiche![c]]));
  let prete: Promise<void> | undefined;
  const installer = () =>
    base.transaction(async () => {
      await base.query('CREATE TABLE IF NOT EXISTS humalis_synchro_tetes (donnee TEXT PRIMARY KEY, version BIGINT NOT NULL DEFAULT 0, plancher BIGINT NOT NULL DEFAULT 0)');
      await base.query("CREATE TABLE IF NOT EXISTS humalis_synchro_journal (donnee TEXT NOT NULL, id TEXT NOT NULL, version BIGINT NOT NULL, supprime BOOLEAN NOT NULL, modifie_le BIGINT NOT NULL, operation TEXT, portee JSONB NOT NULL DEFAULT '{}', PRIMARY KEY (donnee, id))");
      await base.query('CREATE INDEX IF NOT EXISTS humalis_synchro_journal_version ON humalis_synchro_journal (donnee, version)');
      await base.query('CREATE TABLE IF NOT EXISTS humalis_synchro_operations (donnee TEXT NOT NULL, compte TEXT NOT NULL, operation TEXT NOT NULL, resultat JSONB NOT NULL, quand BIGINT NOT NULL, PRIMARY KEY (donnee, compte, operation))');
      for (const [donnee, { table }] of Object.entries(tables)) {
        await preparerTableSqlite(base, table);
        await base.query('INSERT INTO humalis_synchro_tetes (donnee) VALUES ($1) ON CONFLICT (donnee) DO NOTHING', [donnee]);
        // Les fiches écrites avant la synchronisation entrent au journal, dans leur ordre de création.
        const { rows } = await base.query('SELECT t.id, t.data, t.cree_le FROM ' + table + ' t LEFT JOIN humalis_synchro_journal j ON j.donnee = $1 AND j.id = t.id WHERE j.id IS NULL ORDER BY t.ordre', [donnee]);
        for (const ligne of rows) await noter(donnee, String(ligne.id), false, JSON.parse(String(ligne.data)) as Record<string, unknown>, Date.parse(String(ligne.cree_le)) || Date.now());
      }
    });
  const preparer = () =>
    (prete ??= installer().catch((erreur: unknown) => {
      prete = undefined;
      throw erreur;
    }));
  /** Une écriture : la tête avance d'un cran, et la ligne de la fiche prend ce numéro. */
  async function noter(donnee: string, id: string, supprime: boolean, fiche: Record<string, unknown> | null, quand = Date.now()): Promise<void> {
    const version = Number((await base.query('INSERT INTO humalis_synchro_tetes (donnee, version) VALUES ($1, 1) ON CONFLICT (donnee) DO UPDATE SET version = humalis_synchro_tetes.version + 1 RETURNING version', [donnee])).rows[0]!.version);
    // Une fiche supprimée garde la portée qu'elle avait : ceux qui la voyaient apprennent sa suppression.
    const avant = fiche === null ? (await base.query('SELECT portee FROM humalis_synchro_journal WHERE donnee = $1 AND id = $2', [donnee, id])).rows[0]?.portee : undefined;
    const portee = fiche === null ? (avant ?? {}) : porteeDe(donnee, fiche);
    await base.query(
      'INSERT INTO humalis_synchro_journal (donnee, id, version, supprime, modifie_le, operation, portee) VALUES ($1, $2, $3, $4, $5, NULL, $6) ' +
        'ON CONFLICT (donnee, id) DO UPDATE SET version = EXCLUDED.version, supprime = EXCLUDED.supprime, modifie_le = EXCLUDED.modifie_le, operation = NULL, portee = EXCLUDED.portee',
      [donnee, id, version, supprime, quand, JSON.stringify(portee)],
    );
  }
  const tableDe = (donnee: string) => {
    const t = tables[donnee];
    if (!t) throw new Error('donnée non suivie : ' + donnee);
    return t.table;
  };
  const lire = (l: Record<string, unknown>): LigneJournal => ({ id: String(l.id), version: Number(l.version), supprime: l.supprime === true, modifieLe: Number(l.modifie_le), operation: l.operation === null ? null : String(l.operation), portee: l.portee as Record<string, unknown> });
  const files = new Map<string, Promise<unknown>>();
  return {
    suivre(donnee, stockage: Stockage) {
      const { creer, modifier, supprimer } = stockage;
      // La fiche et sa ligne au journal s'écrivent ensemble, ou pas du tout.
      stockage.creer = (valeurs) =>
        base.transaction(async () => {
          await preparer();
          const fiche = await creer.call(stockage, valeurs);
          await noter(donnee, fiche.id, false, fiche);
          return fiche;
        });
      stockage.modifier = (id, valeurs) =>
        base.transaction(async () => {
          await preparer();
          const fiche = await modifier.call(stockage, id, valeurs);
          if (fiche) await noter(donnee, id, false, fiche);
          return fiche;
        });
      stockage.supprimer = (id) =>
        base.transaction(async () => {
          await preparer();
          const fait = await supprimer.call(stockage, id);
          if (fait) await noter(donnee, id, true, null);
          return fait;
        });
      void preparer().catch((erreur: unknown) => console.error("La synchronisation ne s'est pas installée :", erreur instanceof Error ? erreur.message : erreur));
    },
    async page(donnee, depuis, limite, egal) {
      await preparer();
      const tete = (await base.query('SELECT version, plancher FROM humalis_synchro_tetes WHERE donnee = $1', [donnee])).rows[0];
      const valeurs: unknown[] = [donnee, depuis];
      // La portée demandée, champ par champ, par des paramètres liés.
      const conditions = Object.entries(egal).map(([champ, valeur]) => {
        valeurs.push(champ, typeof valeur === 'boolean' ? (valeur ? 'true' : 'false') : valeur);
        const test = typeof valeur === 'boolean' ? 'p.type = $' + valeurs.length : 'p.value = $' + valeurs.length + (typeof valeur === 'number' ? " AND p.type IN ('integer', 'real')" : " AND p.type = 'text'");
        return ' AND EXISTS (SELECT 1 FROM json_each(j.portee) AS p WHERE p.key = $' + (valeurs.length - 1) + ' AND ' + test + ')';
      });
      valeurs.push(limite);
      const { rows } = await base.query(
        'SELECT j.id, j.version, j.supprime, j.modifie_le, j.operation, j.portee, t.data FROM humalis_synchro_journal j LEFT JOIN ' + tableDe(donnee) + ' t ON t.id = j.id WHERE j.donnee = $1 AND j.version > $2' + conditions.join('') + ' ORDER BY j.version LIMIT $' + valeurs.length,
        valeurs,
      );
      return {
        lignes: rows.map((l) => ({ ...lire(l), fiche: l.data ? ficheRendue(JSON.parse(String(l.data)) as Record<string, unknown>, String(l.id), tables[donnee]?.champs) : null })),
        tete: Number(tete?.version ?? 0),
        plancher: Number(tete?.plancher ?? 0),
      };
    },
    async entree(donnee, id) {
      await preparer();
      const { rows } = await base.query('SELECT id, version, supprime, modifie_le, operation, portee FROM humalis_synchro_journal WHERE donnee = $1 AND id = $2', [donnee, id]);
      return rows[0] ? lire(rows[0]) : null;
    },
    async horodater(donnee, id, modifieLe, operation) {
      await base.query('UPDATE humalis_synchro_journal SET modifie_le = $3, operation = $4 WHERE donnee = $1 AND id = $2', [donnee, id, modifieLe, operation]);
    },
    async operation(donnee, compte, operation) {
      await preparer();
      const { rows } = await base.query('SELECT resultat FROM humalis_synchro_operations WHERE donnee = $1 AND compte = $2 AND operation = $3', [donnee, compte, operation]);
      return rows[0] ? (rows[0].resultat as Resultat) : null;
    },
    async retenir(donnee, compte, resultat) {
      await base.query('INSERT INTO humalis_synchro_operations (donnee, compte, operation, resultat, quand) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [donnee, compte, resultat.operation, JSON.stringify(resultat), Date.now()]);
    },
    exclusif(donnee, travail) {
      // Un seul serveur écrit dans le fichier : une file par donnée suffit.
      const suite = (files.get(donnee) ?? Promise.resolve()).then(travail, travail);
      files.set(donnee, suite.catch(() => undefined));
      return suite;
    },
    async menage(donnee, avant) {
      await preparer();
      const { rows } = await base.query('DELETE FROM humalis_synchro_journal WHERE donnee = $1 AND supprime AND modifie_le < $2 RETURNING version', [donnee, avant]);
      if (rows.length > 0) await base.query('UPDATE humalis_synchro_tetes SET plancher = GREATEST(plancher, $2) WHERE donnee = $1', [donnee, Math.max(...rows.map((l) => Number(l.version)))]);
      await base.query('DELETE FROM humalis_synchro_operations WHERE donnee = $1 AND quand < $2', [donnee, avant]);
    },
  };
}
`;
