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
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { nouvelId, sansSeparateurs, type Enregistrement, type Stockage } from './stockage.js';

/**
 * Produit par Humalis : SQLite, la base d'un serveur seul. Un fichier, une connexion : chaque requête passe
 * par des paramètres liés, et les transactions se suivent une à la fois.
 */
export interface BaseSqlite {
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

/** Ouvre (ou crée) le fichier de la base. « :memory: » : une base qui disparaît à l'arrêt, pour les tests. */
export function ouvrirSqlite(chemin: string): BaseSqlite {
  const fichier = chemin === ':memory:' ? chemin : resolve(chemin);
  if (fichier !== ':memory:') mkdirSync(dirname(fichier), { recursive: true });
  const base = new DatabaseSync(fichier);
  // WAL : les lectures ne bloquent pas l'écriture ; « synchronous = NORMAL » reste sûr avec WAL.
  base.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const dansLaTransaction = new AsyncLocalStorage<true>();
  let ouverte = false;
  let liberee: Promise<void> = Promise.resolve();

  const executer = (texte: string, valeurs: unknown[] = []) => {
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
      return { rows, rowCount: rows.length };
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
  };
}

/**
 * Les données dans SQLite : une table par donnée, la fiche en JSON, lue et filtrée par les fonctions JSON de
 * SQLite. « champs » : les champs de la donnée d'aujourd'hui (un champ retiré reste dans la base, il n'en sort plus).
 */
export function creerStockageSqlite(base: BaseSqlite, table: string, champs?: readonly string[]): Stockage {
  // Le nom de la table est fixé par le compilateur ; on le vérifie quand même.
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error('nom de table invalide : ' + table);
  let prete: Promise<unknown> | undefined;
  // « ordre » : l'ordre de création, sans égalité possible ; « cree_le » : l'instant, pour la lecture humaine.
  const preparer = () =>
    (prete ??= base.query(
      'CREATE TABLE IF NOT EXISTS ' + table + " (ordre INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL, cree_le TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))",
    ));
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
