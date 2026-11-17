/**
 * MySQL et MariaDB, la troisième base du serveur produit (décidé avec le mainteneur le 17 novembre 2026). La base la plus
 * répandue chez les hébergeurs. `DATABASE_URL=mysql://…` (ou `mariadb://…`) la choisit ; le programme ne la nomme
 * jamais.
 *
 * Comme pour SQLite, les magasins du serveur (comptes, sessions, envois, coffre…) écrivent leurs requêtes une seule
 * fois, pour PostgreSQL, et ce fichier les traduit. MySQL a moins de tournures que SQLite : pas de « RETURNING »
 * (MariaDB seulement pour INSERT et DELETE), « ON CONFLICT » s'écrit « ON DUPLICATE KEY UPDATE », pas d'index
 * « IF NOT EXISTS » (MySQL), et le texte se compare sans tenir compte des majuscules par défaut. Ce qui ne se
 * traduit pas mot pour mot (RETURNING, la condition d'un ON CONFLICT) est refait ici en deux gestes dans une
 * transaction, et une requête qu'on ne sait pas traduire est refusée plutôt que mal jouée.
 *
 * Ce fichier produit `src/humalis/mysql.ts`.
 */

/** src/humalis/mysql.ts */
export const MYSQL = String.raw`import { AsyncLocalStorage } from 'node:async_hooks';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { nouvelId, sansSeparateurs, type Enregistrement, type Stockage } from './stockage.js';

type Ligne = Record<string, unknown>;
type Resultat = { rows: Ligne[]; rowCount: number };

/**
 * Produit par Humalis : MySQL ou MariaDB. Les requêtes passent par des paramètres liés ($1, $2…, comme avec
 * PostgreSQL) ; une transaction garde sa connexion du début à la fin.
 */
export interface BaseMysql {
  readonly mysql: true;
  /** MariaDB n'écrit pas tout comme MySQL (la comparaison de deux valeurs JSON). */
  readonly mariadb: boolean;
  /** Une requête écrite pour PostgreSQL, traduite. */
  query(texte: string, valeurs?: unknown[]): Promise<Resultat>;
  /** Une requête écrite pour MySQL, sans traduction : « ? » pour chaque valeur. */
  natif(texte: string, valeurs?: unknown[]): Promise<Resultat>;
  /** Tout ou rien : une erreur dans « faire » annule ce qui a été écrit. */
  transaction<T>(faire: () => Promise<T>): Promise<T>;
  /** Un seul serveur à la fois fait « travail » pour cette clé, même avec plusieurs exemplaires. */
  verrou<T>(cle: string, travail: () => Promise<T>): Promise<T>;
  /** « expression » (une valeur JSON lue dans la base) vaut exactement la valeur JSON du paramètre : « 5 » n'est pas 5. */
  egalJson(expression: string): string;
  fermer(): Promise<void>;
}

/** Le texte hors des chaînes entre apostrophes : seules ces parties sont réécrites. */
function horsChaines(texte: string, changer: (morceau: string) => string): string {
  let sortie = '';
  let i = 0;
  while (i < texte.length) {
    const debut = texte.indexOf("'", i);
    if (debut === -1) {
      sortie += changer(texte.slice(i));
      break;
    }
    sortie += changer(texte.slice(i, debut));
    let fin = debut + 1;
    for (;;) {
      fin = texte.indexOf("'", fin);
      if (fin === -1) throw new Error('chaîne non fermée dans la requête');
      if (texte[fin + 1] === "'") fin += 2;
      else break;
    }
    sortie += texte.slice(debut, fin + 1);
    i = fin + 1;
  }
  return sortie;
}

/** Découpe aux virgules (ou au séparateur) de premier niveau : ni dans des parenthèses, ni dans une chaîne. */
export function decouper(texte: string, separateur = ','): string[] {
  const morceaux: string[] = [];
  let profondeur = 0;
  let chaine = false;
  let debut = 0;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (chaine) {
      if (c === "'") {
        if (texte[i + 1] === "'") i++;
        else chaine = false;
      }
    } else if (c === "'") chaine = true;
    else if (c === '(') profondeur++;
    else if (c === ')') profondeur--;
    else if (c === separateur && profondeur === 0) {
      morceaux.push(texte.slice(debut, i));
      debut = i + 1;
    }
  }
  morceaux.push(texte.slice(debut));
  return morceaux.map((m) => m.trim()).filter((m) => m !== '');
}

/** Les mots avant le premier « ( » ouvert à ce niveau : cherche « mot » hors parenthèses et hors chaînes. */
function chercherHaut(texte: string, motif: RegExp): number {
  let profondeur = 0;
  let chaine = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (chaine) {
      if (c === "'") {
        if (texte[i + 1] === "'") i++;
        else chaine = false;
      }
      continue;
    }
    if (c === "'") chaine = true;
    else if (c === '(') profondeur++;
    else if (c === ')') profondeur--;
    else if (profondeur === 0 && /\s/.test(c) && motif.test(texte.slice(i))) return i;
  }
  return -1;
}

/** Ce qu'une valeur devient pour MySQL : un objet ou une liste voyage en JSON, jamais en liste de valeurs. */
const lier = (valeur: unknown): unknown => {
  if (valeur === undefined || valeur === null) return null;
  if (typeof valeur === 'bigint') return String(valeur);
  if (valeur instanceof Date || Buffer.isBuffer(valeur) || typeof valeur !== 'object') return valeur;
  return JSON.stringify(valeur);
};

/** Les $1, $2… deviennent « ? », dans l'ordre où ils sont écrits ; un même paramètre écrit deux fois est lié deux fois. */
export function lierParametres(texte: string, valeurs: readonly unknown[]): { texte: string; valeurs: unknown[] } {
  const lies: unknown[] = [];
  const traduit = horsChaines(texte, (morceau) =>
    morceau.replace(/\$(\d+)(?!\d)/g, (_tout, n: string) => {
      const rang = Number(n) - 1;
      if (rang < 0 || rang >= valeurs.length) throw new Error('paramètre $' + n + ' sans valeur');
      lies.push(lier(valeurs[rang]));
      return '?';
    }),
  );
  return { texte: traduit, valeurs: lies };
}

/** Les tournures de PostgreSQL qui ont un équivalent direct : maintenant, les durées, les conversions « :: ». */
export function versMysql(texte: string): string {
  const traduit = texte.replace(/now\(\)\s*-\s*interval\s*'(\d+)\s*(second|minute|hour|day)s?'/gi, (_tout, nombre: string, unite: string) => '(UTC_TIMESTAMP(3) - INTERVAL ' + nombre + ' ' + unite.toUpperCase() + ')');
  return horsChaines(traduit, (morceau) => morceau.replace(/\bnow\(\)/gi, 'UTC_TIMESTAMP(3)').replace(/::[a-z_]+(\[\])?/gi, ''));
}

/**
 * « INSERT … ON CONFLICT … » : MySQL écrit « ON DUPLICATE KEY UPDATE ». La condition d'un « DO UPDATE … WHERE »
 * devient un IF() sur chaque colonne. MySQL affecte les colonnes de gauche à droite : une colonne lue par la
 * condition est donc affectée en dernier, et deux colonnes lues par la condition sont refusées.
 */
export function traduireConflit(texte: string): string {
  const position = chercherHaut(texte, /^\s+ON\s+CONFLICT\b/i);
  if (position === -1) return texte;
  const tete = texte.slice(0, position);
  const insertion = /^\s*INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/i.exec(tete);
  if (!insertion) throw new Error('ON CONFLICT hors d\'un INSERT : requête non traduite pour MySQL');
  const table = insertion[1]!;
  const colonnes = decouper(insertion[2]!);
  const queue = /^\s+ON\s+CONFLICT\s*(?:\(([^)]*)\))?\s*DO\s+(NOTHING|UPDATE\s+SET\s+([\s\S]*))$/i.exec(texte.slice(position));
  if (!queue) throw new Error('ON CONFLICT inattendu : requête non traduite pour MySQL');
  const cibles = queue[1] ? decouper(queue[1]) : colonnes.slice(0, 1);
  if (/^NOTHING$/i.test(queue[2]!)) return tete + ' ON DUPLICATE KEY UPDATE ' + cibles[0] + ' = ' + cibles[0];
  const reste = queue[3]!;
  const ou = chercherHaut(' ' + reste, /^\s+WHERE\b/i);
  const affectations = decouper(ou === -1 ? reste : (' ' + reste).slice(0, ou));
  const condition = ou === -1 ? null : (' ' + reste).slice(ou).replace(/^\s+WHERE\s+/i, '');
  const nettoyer = (expression: string) => expression.replace(/\bEXCLUDED\.([a-z_][a-z0-9_]*)/gi, 'VALUES($1)').replace(new RegExp('\\b' + table + '\\.([a-z_][a-z0-9_]*)', 'gi'), '$1');
  const lues = condition ? new Set([...nettoyer(condition).matchAll(/\b([a-z_][a-z0-9_]*)\b/gi)].map((m) => m[1]!.toLowerCase())) : new Set<string>();
  const paires = affectations.map((a) => {
    const egal = a.indexOf('=');
    if (egal === -1) throw new Error('affectation inattendue dans ON CONFLICT : ' + a);
    return { colonne: a.slice(0, egal).trim(), valeur: nettoyer(a.slice(egal + 1).trim()) };
  });
  const luesEtAffectees = paires.filter((p) => lues.has(p.colonne.toLowerCase()));
  if (luesEtAffectees.length > 1) throw new Error('ON CONFLICT : la condition lit plusieurs colonnes qu\'elle change, requête non traduite pour MySQL');
  const ordonnees = [...paires.filter((p) => !lues.has(p.colonne.toLowerCase())), ...luesEtAffectees];
  const si = condition ? nettoyer(condition) : null;
  return tete + ' ON DUPLICATE KEY UPDATE ' + ordonnees.map((p) => p.colonne + ' = ' + (si ? 'IF(' + si + ', ' + p.valeur + ', ' + p.colonne + ')' : p.valeur)).join(', ');
}

/**
 * La forme d'une table écrite pour PostgreSQL, pour MySQL : un texte qui sert de clé devient VARCHAR(255), les
 * autres LONGTEXT ; JSONB devient JSON ; TIMESTAMPTZ, DATETIME(3) en temps universel. Le texte se compare au
 * caractère près (utf8mb4_bin) : « Abc » n'est pas « abc », comme dans PostgreSQL.
 */
export function tableMysql(texte: string): string {
  const forme = /^\s*CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*)\)\s*$/i.exec(texte);
  if (!forme) throw new Error('CREATE TABLE inattendu : requête non traduite pour MySQL');
  const morceaux = decouper(forme[3]!);
  const cles = new Set<string>();
  for (const m of morceaux) {
    const contrainte = /^(PRIMARY\s+KEY|UNIQUE)\s*\(([^)]*)\)$/i.exec(m);
    if (contrainte) for (const c of decouper(contrainte[2]!)) cles.add(c.toLowerCase());
    const colonne = /^([a-z_][a-z0-9_]*)\s+[\s\S]*\b(PRIMARY\s+KEY|UNIQUE)\b/i.exec(m);
    if (colonne && !/^(PRIMARY|UNIQUE)$/i.test(colonne[1]!)) cles.add(colonne[1]!.toLowerCase());
  }
  const colonnes = morceaux.map((m) => {
    if (/^(PRIMARY\s+KEY|UNIQUE)\s*\(/i.test(m)) return m;
    const c = /^([a-z_][a-z0-9_]*)\s+([a-z]+)(\s[\s\S]*)?$/i.exec(m);
    if (!c) throw new Error('colonne inattendue : ' + m);
    const nom = c[1]!;
    const type = c[2]!.toUpperCase();
    let suite = (c[3] ?? '').replace(/::[a-z_]+/gi, '');
    let traduit: string;
    if (type === 'TEXT' || type === 'UUID') traduit = cles.has(nom.toLowerCase()) ? 'VARCHAR(255)' : 'LONGTEXT';
    else if (type === 'JSONB' || type === 'JSON') traduit = 'JSON';
    else if (type === 'TIMESTAMPTZ') traduit = 'DATETIME(3)';
    else if (type === 'BIGINT' || type === 'INTEGER' || type === 'BOOLEAN') traduit = type;
    else throw new Error('type de colonne non traduit pour MySQL : ' + type);
    suite = suite.replace(/\bDEFAULT\s+now\(\)/gi, 'DEFAULT CURRENT_TIMESTAMP(3)');
    // Un texte long ou un JSON n'accepte une valeur par défaut qu'entre parenthèses.
    if (traduit === 'JSON' || traduit === 'LONGTEXT') suite = suite.replace(/\bDEFAULT\s+('(?:[^']|'')*')/i, 'DEFAULT ($1)');
    return nom + ' ' + traduit + suite;
  });
  return 'CREATE TABLE ' + (forme[1] ? 'IF NOT EXISTS ' : '') + forme[2] + ' (' + colonnes.join(', ') + ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin';
}

/** Ouvre la base. L'adresse : mysql://utilisateur:mot-de-passe@hote:3306/base (ou mariadb://…). */
export async function ouvrirMysql(adresse: string): Promise<BaseMysql> {
  const mysql = (await import('mysql2/promise')).default;
  const pool: Pool = mysql.createPool({
    uri: adresse.replace(/^mariadb:/, 'mysql:'),
    // Le texte au caractère près, les dates en temps universel, et le nombre de lignes vraiment changées.
    charset: 'UTF8MB4_BIN',
    timezone: 'Z',
    flags: ['-FOUND_ROWS'],
    connectionLimit: Number(process.env.HUMALIS_BASE_CONNEXIONS) > 0 ? Number(process.env.HUMALIS_BASE_CONNEXIONS) : 10,
    enableKeepAlive: true,
    // Une colonne BOOLEAN (TINYINT(1)) revient vrai ou faux, comme avec PostgreSQL.
    typeCast(champ, suivant) {
      if (champ.type === 'TINY' && champ.length === 1) {
        const texte = champ.string();
        return texte === null ? null : texte !== '0';
      }
      return suivant();
    },
  });
  // Chaque connexion parle en temps universel : « maintenant » est le même pour tous les exemplaires.
  pool.on('connection', (connexion) => {
    (connexion as unknown as { query(texte: string): void }).query("SET time_zone = '+00:00'");
  });
  const version = String(((await pool.query('SELECT VERSION() AS v')) as unknown as [Ligne[]])[0][0]!.v);
  const mariadb = /mariadb/i.test(version);
  const dans = new AsyncLocalStorage<PoolConnection>();
  const clesPrimaires = new Map<string, string[]>();

  const brut = async (texte: string, valeurs: unknown[] = []): Promise<Resultat> => {
    const connexion = dans.getStore();
    const [reponse] = (await (connexion ?? pool).query({ sql: texte, values: valeurs.map(lier) })) as unknown as [Ligne[] | { affectedRows: number }];
    if (Array.isArray(reponse)) return { rows: reponse.map((l) => ({ ...l })), rowCount: reponse.length };
    // Un INSERT … ON DUPLICATE KEY UPDATE compte 2 pour une ligne changée : PostgreSQL en compte une.
    const changees = Number(reponse.affectedRows ?? 0);
    return { rows: [], rowCount: /^\s*INSERT\b/i.test(texte) && changees === 2 ? 1 : changees };
  };

  /** Une forme de table ne se change jamais au milieu d'une transaction (MySQL la validerait d'office) : elle a sa connexion. */
  const forme = async (texte: string, valeurs: unknown[] = []): Promise<Resultat> => {
    const connexion = await pool.getConnection();
    try {
      // Une forme de table qui attend une transaction ouverte abandonne vite, au lieu d'attendre un an.
      await connexion.query('SET SESSION lock_wait_timeout = 30');
      const [reponse] = (await connexion.query({ sql: texte, values: valeurs })) as unknown as [{ affectedRows?: number }];
      return { rows: [], rowCount: Number(reponse?.affectedRows ?? 0) };
    } finally {
      connexion.release();
    }
  };

  const clePrimaire = async (table: string): Promise<string[]> => {
    const connue = clesPrimaires.get(table);
    if (connue) return connue;
    const { rows } = await brut("SELECT COLUMN_NAME AS c FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION", [table]);
    const cle = rows.map((l) => String(l.c));
    if (cle.length === 0) throw new Error('la table « ' + table + ' » n\'a pas de clé primaire');
    clesPrimaires.set(table, cle);
    return cle;
  };

  /** Un index sur une colonne de texte long : la colonne devient VARCHAR(255), que MySQL sait indexer. */
  const index = async (texte: string): Promise<Resultat> => {
    const i = /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\s+ON\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)\s*$/i.exec(texte);
    if (!i) throw new Error('CREATE INDEX inattendu : requête non traduite pour MySQL');
    const table = i[3]!;
    const colonnes = decouper(i[4]!);
    const { rows } = await brut('SELECT COLUMN_NAME AS c, DATA_TYPE AS t, IS_NULLABLE AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]);
    for (const colonne of colonnes) {
      const decrite = rows.find((l) => String(l.c).toLowerCase() === colonne.toLowerCase());
      if (decrite && /text$/i.test(String(decrite.t))) await forme('ALTER TABLE ' + table + ' MODIFY ' + colonne + ' VARCHAR(255)' + (decrite.n === 'NO' ? ' NOT NULL' : ''));
    }
    try {
      return await forme('CREATE ' + (i[1] ? 'UNIQUE ' : '') + 'INDEX ' + i[2] + ' ON ' + table + ' (' + colonnes.join(', ') + ')');
    } catch (erreur) {
      // L'index existe déjà : c'est ce qu'on voulait.
      if ((erreur as { errno?: number }).errno === 1061) return { rows: [], rowCount: 0 };
      throw erreur;
    }
  };

  /** Une requête sans RETURNING : traduite, puis jouée. */
  const jouer = (texte: string, valeurs: readonly unknown[]): Promise<Resultat> => {
    const { texte: final, valeurs: lies } = lierParametres(traduireConflit(versMysql(texte)), valeurs);
    return brut(final, lies);
  };

  /**
   * « … RETURNING colonnes » : MySQL n'en a pas. Dans une transaction, les lignes visées sont lues et retenues
   * (FOR UPDATE), changées, puis relues par leur clé primaire : ce qui revient est ce que PostgreSQL rendrait.
   */
  const avecRetour = (texte: string, valeurs: readonly unknown[]): Promise<Resultat> => {
    const position = chercherHaut(texte, /^\s+RETURNING\s/i);
    const corps = texte.slice(0, position);
    const rendues = texte.slice(position).replace(/^\s+RETURNING\s+/i, '').trim();
    return base.transaction(async () => {
      const insertion = /^\s*INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*?)\)(\s+ON\s+CONFLICT[\s\S]*)?$/i.exec(corps);
      if (insertion) {
        const table = insertion[1]!;
        const colonnes = decouper(insertion[2]!);
        const valeursEcrites = decouper(insertion[3]!);
        const conflit = insertion[4] ? /ON\s+CONFLICT\s*\(([^)]*)\)/i.exec(insertion[4]) : null;
        const cle = conflit ? decouper(conflit[1]!) : colonnes.slice(0, 1);
        const { rowCount } = await jouer(corps, valeurs);
        if (rowCount === 0) return { rows: [], rowCount: 0 };
        const conditions = cle.map((c) => {
          const rang = colonnes.findIndex((x) => x.toLowerCase() === c.toLowerCase());
          if (rang === -1) throw new Error('RETURNING : la clé « ' + c + ' » n\'est pas écrite par l\'INSERT');
          return c + ' = ' + valeursEcrites[rang];
        });
        const relu = await jouer('SELECT ' + rendues + ' FROM ' + table + ' WHERE ' + conditions.join(' AND '), valeurs);
        return { rows: relu.rows, rowCount: relu.rows.length };
      }
      const changement = /^\s*(UPDATE\s+([a-z_][a-z0-9_]*)\s+SET\s+[\s\S]*?|DELETE\s+FROM\s+([a-z_][a-z0-9_]*))\s+WHERE\s+([\s\S]*)$/i.exec(corps);
      if (!changement) throw new Error('RETURNING inattendu : requête non traduite pour MySQL');
      const suppression = changement[3] !== undefined;
      const table = (changement[2] ?? changement[3])!;
      const condition = changement[4]!;
      const cle = await clePrimaire(table);
      const lues = !suppression ? cle.join(', ') : rendues === '*' ? '*' : cle.join(', ') + ', ' + rendues;
      const visees = await jouer('SELECT ' + lues + ' FROM ' + table + ' WHERE ' + condition + ' FOR UPDATE', valeurs);
      if (visees.rows.length === 0) return { rows: [], rowCount: 0 };
      const parCle = '(' + cle.join(', ') + ') IN (' + visees.rows.map((l) => '(' + cle.map(() => '?').join(', ') + ')').join(', ') + ')';
      const valeursCles = visees.rows.flatMap((l) => cle.map((c) => l[c]));
      if (suppression) {
        await brut('DELETE FROM ' + table + ' WHERE ' + parCle, valeursCles);
        const rows = visees.rows.map((l) => {
          if (rendues === '*') return l;
          const garde: Ligne = {};
          for (const c of decouper(rendues)) garde[c] = l[c];
          return garde;
        });
        return { rows, rowCount: rows.length };
      }
      await jouer(corps, valeurs);
      const relu = await brut('SELECT ' + rendues + ' FROM ' + table + ' WHERE ' + parCle, valeursCles);
      return { rows: relu.rows, rowCount: relu.rows.length };
    });
  };

  const base: BaseMysql = {
    mysql: true,
    mariadb,
    async query(texte, valeurs = []) {
      const instructions = valeurs.length === 0 ? decouper(texte, ';') : [texte.replace(/;\s*$/, '')];
      let dernier: Resultat = { rows: [], rowCount: 0 };
      for (const instruction of instructions) {
        if (/^\s*CREATE\s+TABLE\b/i.test(instruction)) dernier = await forme(tableMysql(instruction));
        else if (/^\s*CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(instruction)) dernier = await index(instruction);
        else if (chercherHaut(instruction, /^\s+RETURNING\s/i) !== -1) dernier = await avecRetour(instruction, valeurs);
        else dernier = await jouer(instruction, valeurs);
      }
      return dernier;
    },
    natif: (texte, valeurs = []) => (/^\s*(CREATE|ALTER|DROP)\b/i.test(texte) ? forme(texte, valeurs) : brut(texte, valeurs)),
    async transaction(faire) {
      if (dans.getStore()) return faire();
      // Comme PostgreSQL : chaque lecture voit ce qui est validé. Un interblocage est rejoué, deux fois au plus.
      for (let essai = 1; ; essai++) {
        const connexion = await pool.getConnection();
        try {
          await connexion.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
          await connexion.beginTransaction();
          const resultat = await dans.run(connexion, faire);
          await connexion.commit();
          return resultat;
        } catch (erreur) {
          await connexion.rollback().catch(() => undefined);
          const numero = (erreur as { errno?: number }).errno;
          if (essai < 3 && (numero === 1213 || numero === 1205)) continue;
          throw erreur;
        } finally {
          connexion.release();
        }
      }
    },
    async verrou(cle, travail) {
      // Un nom de verrou a 64 caractères au plus.
      const nom = cle.slice(0, 64);
      const connexion = await pool.getConnection();
      try {
        const [lignes] = (await connexion.query('SELECT GET_LOCK(?, 60) AS pris', [nom])) as unknown as [Ligne[]];
        if (Number(lignes[0]?.pris) !== 1) throw new Error('verrou « ' + cle + ' » non obtenu en 60 secondes');
        try {
          return await travail();
        } finally {
          await connexion.query('SELECT RELEASE_LOCK(?)', [nom]).catch(() => undefined);
        }
      } finally {
        connexion.release();
      }
    },
    egalJson: (expression) => (mariadb ? 'JSON_EQUALS(' + expression + ', ?)' : expression + " = JSON_EXTRACT(?, '$')"),
    async fermer() {
      await pool.end();
    },
  };
  return base;
}

/**
 * Le canal « en direct » entre plusieurs exemplaires : MySQL n'a pas d'écoute (NOTIFY) ; chaque annonce est
 * écrite, et chaque exemplaire relit celles des dernières secondes. Les lignes passées sont effacées.
 */
export function canalMysql(base: BaseMysql): { publier(cle: string): Promise<void>; recentes(): Promise<{ numero: string; cle: string }[]> } {
  let prete: Promise<unknown> | undefined;
  let dernierMenage = 0;
  const preparer = () =>
    (prete ??= base.natif('CREATE TABLE IF NOT EXISTS humalis_direct (numero BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, cle VARCHAR(255) NOT NULL, quand DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX humalis_direct_quand (quand)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin').catch((erreur: unknown) => {
      prete = undefined;
      throw erreur;
    }));
  return {
    async publier(cle) {
      await preparer();
      await base.natif('INSERT INTO humalis_direct (cle) VALUES (?)', [cle.slice(0, 255)]);
    },
    async recentes() {
      await preparer();
      if (Date.now() - dernierMenage > 60_000) {
        dernierMenage = Date.now();
        await base.natif('DELETE FROM humalis_direct WHERE quand < UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE');
      }
      const { rows } = await base.natif('SELECT numero, cle FROM humalis_direct WHERE quand > UTC_TIMESTAMP(3) - INTERVAL 10 SECOND ORDER BY numero');
      return rows.map((l) => ({ numero: String(l.numero), cle: String(l.cle) }));
    },
  };
}

/** Un chemin JSON vers un champ, sans rien d'exécutable : '$."nom"'. */
export const cheminJson = (champ: string): string => '$."' + champ.replace(/[\\"]/g, (c) => '\\' + c) + '"';

/** La table d'une donnée. « ordre » : l'ordre de création, sans égalité possible ; « cree_le » : l'instant, pour la lecture humaine. */
export function preparerTableMysql(base: BaseMysql, table: string): Promise<unknown> {
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error('nom de table invalide : ' + table);
  return base.natif('CREATE TABLE IF NOT EXISTS ' + table + ' (ordre BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, id VARCHAR(255) NOT NULL UNIQUE, data JSON NOT NULL, cree_le DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin');
}

/** « tout ou rien » pour la logique du serveur : les mêmes stockages, dans une transaction de la base. */
export function transactionMysql<S>(base: BaseMysql, stockages: S): <T>(corps: (s: S) => Promise<T>) => Promise<T> {
  return (corps) => base.transaction(() => corps(stockages));
}

/** La fiche telle que la base la rend : un objet (MySQL), ou un texte JSON. */
const lireJson = (valeur: unknown): Record<string, unknown> => (typeof valeur === 'string' ? (JSON.parse(valeur) as Record<string, unknown>) : ((valeur ?? {}) as Record<string, unknown>));

/**
 * Les données dans MySQL ou MariaDB : une table par donnée, la fiche en JSON. « champs » : les champs de la
 * donnée d'aujourd'hui (un champ retiré reste dans la base, il n'en sort plus).
 */
export function creerStockageMysql(base: BaseMysql, table: string, champs?: readonly string[]): Stockage {
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error('nom de table invalide : ' + table);
  // La table se prépare dès la création du stockage, au démarrage, hors de toute transaction.
  const ouvrir = () => {
    const promesse = preparerTableMysql(base, table);
    promesse.catch(() => {
      if (prete === promesse) prete = undefined;
    });
    return promesse;
  };
  let prete: Promise<unknown> | undefined = ouvrir();
  const preparer = () => (prete ??= ouvrir());
  const lire = (ligne: Record<string, unknown>): Enregistrement => {
    const donnees = lireJson(ligne.data);
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
      for (const [champ, valeur] of Object.entries(filtres?.egal ?? {})) {
        valeurs.push(cheminJson(champ), JSON.stringify(valeur));
        conditions.push(base.egalJson('JSON_EXTRACT(data, ?)'));
      }
      let texte = 'SELECT id, data FROM ' + table;
      if (conditions.length > 0) texte += ' WHERE ' + conditions.join(' AND ');
      texte += ' ORDER BY ordre';
      const numero = filtres?.numero;
      if (!numero) {
        if (filtres?.limite !== undefined || filtres?.depuis !== undefined) {
          // MySQL n'a pas d'OFFSET sans LIMIT : « toutes » s'écrit avec le plus grand nombre possible.
          texte += ' LIMIT ' + (filtres?.limite !== undefined ? Math.max(0, Math.floor(filtres.limite)) : '18446744073709551615') + ' OFFSET ' + Math.max(0, Math.floor(filtres?.depuis ?? 0));
        }
        return (await base.natif(texte, valeurs)).rows.map(lire);
      }
      // Un numéro se compare sans ses séparateurs : la même règle que le stockage en mémoire, fiche par fiche.
      const debut = filtres?.depuis ?? 0;
      const fiches = (await base.natif(texte, valeurs)).rows.map(lire).filter((fiche) => sansSeparateurs(fiche[numero.champ]) === numero.valeur);
      return filtres?.limite === undefined ? fiches.slice(debut) : fiches.slice(debut, debut + filtres.limite);
    },
    async trouver(id, pourEcrire) {
      await preparer();
      const { rows } = await base.natif('SELECT id, data FROM ' + table + ' WHERE id = ?' + (pourEcrire ? ' FOR UPDATE' : ''), [id]);
      return rows[0] ? lire(rows[0]) : null;
    },
    async creer(valeurs) {
      await preparer();
      const id = nouvelId();
      await base.natif('INSERT INTO ' + table + ' (id, data) VALUES (?, ?)', [id, JSON.stringify(valeurs)]);
      return { ...valeurs, id };
    },
    async modifier(id, valeurs) {
      await preparer();
      // JSON_MERGE_PATCH retirerait un champ mis à « rien » : la fiche est relue (retenue), complétée, puis réécrite.
      return base.transaction(async () => {
        const { rows } = await base.natif('SELECT id, data FROM ' + table + ' WHERE id = ? FOR UPDATE', [id]);
        if (!rows[0]) return null;
        const nouvelle = { ...lireJson(rows[0].data), ...JSON.parse(JSON.stringify(valeurs)) };
        await base.natif('UPDATE ' + table + ' SET data = ? WHERE id = ?', [JSON.stringify(nouvelle), id]);
        return lire({ id, data: nouvelle });
      });
    },
    async supprimer(id) {
      await preparer();
      return (await base.natif('DELETE FROM ' + table + ' WHERE id = ?', [id])).rowCount > 0;
    },
  };
}
`;

/**
 * src/humalis/synchro-mysql.ts : seulement quand le programme synchronise une donnée. Le même journal que pour
 * SQLite, écrit par le serveur dans la transaction de chaque écriture ; plusieurs exemplaires du serveur le
 * partagent : la tête avance sous verrou de ligne, et « exclusif » prend un verrou de la base.
 */
export const SYNCHRO_MYSQL = String.raw`import type { BaseMysql } from './mysql.js';
import { cheminJson, preparerTableMysql } from './mysql.js';
import type { Stockage } from './stockage.js';
import { ficheRendue, type JournalSynchro, type LigneJournal, type Resultat } from './synchro.js';

const lireJson = (valeur: unknown): Record<string, unknown> => (typeof valeur === 'string' ? (JSON.parse(valeur) as Record<string, unknown>) : ((valeur ?? {}) as Record<string, unknown>));
const instant = (valeur: unknown): number => (valeur instanceof Date ? valeur.getTime() : Date.parse(String(valeur))) || Date.now();

/** Produit par Humalis : le journal de la synchronisation dans MySQL ou MariaDB. */
export function creerJournalMysql(base: BaseMysql, tables: Record<string, { table: string; portee: string[]; champs?: string[] }>): JournalSynchro {
  for (const { table } of Object.values(tables)) if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error('nom de table invalide : ' + table);
  const porteeDe = (donnee: string, fiche: Record<string, unknown> | null) => Object.fromEntries((tables[donnee]?.portee ?? []).filter((c) => fiche !== null && c in fiche).map((c) => [c, fiche![c]]));
  let prete: Promise<void> | undefined;
  const installer = async () => {
    // Les tables d'abord, hors de toute transaction (MySQL validerait d'office celle qui serait ouverte).
    await base.query('CREATE TABLE IF NOT EXISTS humalis_synchro_tetes (donnee TEXT PRIMARY KEY, version BIGINT NOT NULL DEFAULT 0, plancher BIGINT NOT NULL DEFAULT 0)');
    await base.query("CREATE TABLE IF NOT EXISTS humalis_synchro_journal (donnee TEXT NOT NULL, id TEXT NOT NULL, version BIGINT NOT NULL, supprime BOOLEAN NOT NULL, modifie_le BIGINT NOT NULL, operation TEXT, portee JSONB NOT NULL DEFAULT '{}', PRIMARY KEY (donnee, id))");
    await base.query('CREATE INDEX IF NOT EXISTS humalis_synchro_journal_version ON humalis_synchro_journal (donnee, version)');
    await base.query('CREATE TABLE IF NOT EXISTS humalis_synchro_operations (donnee TEXT NOT NULL, compte TEXT NOT NULL, operation TEXT NOT NULL, resultat JSONB NOT NULL, quand BIGINT NOT NULL, PRIMARY KEY (donnee, compte, operation))');
    for (const { table } of Object.values(tables)) await preparerTableMysql(base, table);
    // Un seul exemplaire installe : les fiches écrites avant la synchronisation entrent au journal, dans leur ordre de création.
    await base.verrou('humalis_synchro_installation', () =>
      base.transaction(async () => {
        for (const [donnee, { table }] of Object.entries(tables)) {
          await base.query('INSERT INTO humalis_synchro_tetes (donnee) VALUES ($1) ON CONFLICT (donnee) DO NOTHING', [donnee]);
          const { rows } = await base.natif('SELECT t.id, t.data, t.cree_le FROM ' + table + ' t LEFT JOIN humalis_synchro_journal j ON j.donnee = ? AND j.id = t.id WHERE j.id IS NULL ORDER BY t.ordre', [donnee]);
          for (const ligne of rows) await noter(donnee, String(ligne.id), false, lireJson(ligne.data), instant(ligne.cree_le));
        }
      }),
    );
  };
  const preparer = () =>
    (prete ??= installer().catch((erreur: unknown) => {
      prete = undefined;
      throw erreur;
    }));
  /** Une écriture : la tête avance d'un cran (sa ligne reste retenue jusqu'à la fin de la transaction), et la ligne de la fiche prend ce numéro. */
  async function noter(donnee: string, id: string, supprime: boolean, fiche: Record<string, unknown> | null, quand = Date.now()): Promise<void> {
    const version = Number((await base.query('INSERT INTO humalis_synchro_tetes (donnee, version) VALUES ($1, 1) ON CONFLICT (donnee) DO UPDATE SET version = humalis_synchro_tetes.version + 1 RETURNING version', [donnee])).rows[0]!.version);
    // Une fiche supprimée garde la portée qu'elle avait : ceux qui la voyaient apprennent sa suppression.
    const avant = fiche === null ? (await base.query('SELECT portee FROM humalis_synchro_journal WHERE donnee = $1 AND id = $2', [donnee, id])).rows[0]?.portee : undefined;
    const portee = fiche === null ? (avant === undefined ? {} : lireJson(avant)) : porteeDe(donnee, fiche);
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
  const lire = (l: Record<string, unknown>): LigneJournal => ({ id: String(l.id), version: Number(l.version), supprime: l.supprime === true, modifieLe: Number(l.modifie_le), operation: l.operation === null ? null : String(l.operation), portee: lireJson(l.portee) });
  return {
    suivre(donnee, stockage: Stockage) {
      const { creer, modifier, supprimer } = stockage;
      // La fiche et sa ligne au journal s'écrivent ensemble, ou pas du tout.
      stockage.creer = async (valeurs) => {
        await preparer();
        return base.transaction(async () => {
          const fiche = await creer.call(stockage, valeurs);
          await noter(donnee, fiche.id, false, fiche);
          return fiche;
        });
      };
      stockage.modifier = async (id, valeurs) => {
        await preparer();
        return base.transaction(async () => {
          const fiche = await modifier.call(stockage, id, valeurs);
          if (fiche) await noter(donnee, id, false, fiche);
          return fiche;
        });
      };
      stockage.supprimer = async (id) => {
        await preparer();
        return base.transaction(async () => {
          const fait = await supprimer.call(stockage, id);
          if (fait) await noter(donnee, id, true, null);
          return fait;
        });
      };
      void preparer().catch((erreur: unknown) => console.error("La synchronisation ne s'est pas installée :", erreur instanceof Error ? erreur.message : erreur));
    },
    async page(donnee, depuis, limite, egal) {
      await preparer();
      const tete = (await base.query('SELECT version, plancher FROM humalis_synchro_tetes WHERE donnee = $1', [donnee])).rows[0];
      const valeurs: unknown[] = [donnee, depuis];
      // La portée demandée, champ par champ, par des paramètres liés.
      const conditions = Object.entries(egal).map(([champ, valeur]) => {
        valeurs.push(cheminJson(champ), JSON.stringify(valeur));
        return ' AND ' + base.egalJson('JSON_EXTRACT(j.portee, ?)');
      });
      valeurs.push(Math.max(0, Math.floor(limite)));
      const { rows } = await base.natif(
        'SELECT j.id, j.version, j.supprime, j.modifie_le, j.operation, j.portee, t.data FROM humalis_synchro_journal j LEFT JOIN ' + tableDe(donnee) + ' t ON t.id = j.id WHERE j.donnee = ? AND j.version > ?' + conditions.join('') + ' ORDER BY j.version LIMIT ?',
        valeurs,
      );
      return {
        lignes: rows.map((l) => ({ ...lire(l), fiche: l.data ? ficheRendue(lireJson(l.data), String(l.id), tables[donnee]?.champs) : null })),
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
      return rows[0] ? (lireJson(rows[0].resultat) as unknown as Resultat) : null;
    },
    async retenir(donnee, compte, resultat) {
      await base.query('INSERT INTO humalis_synchro_operations (donnee, compte, operation, resultat, quand) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [donnee, compte, resultat.operation, JSON.stringify(resultat), Date.now()]);
    },
    exclusif(donnee, travail) {
      // Plusieurs exemplaires du serveur : un verrou de la base, par donnée.
      return base.verrou('humalis_synchro_' + donnee, travail);
    },
    async menage(donnee, avant) {
      await preparer();
      await base.transaction(async () => {
        const { rows } = await base.query('DELETE FROM humalis_synchro_journal WHERE donnee = $1 AND supprime AND modifie_le < $2 RETURNING version', [donnee, avant]);
        if (rows.length > 0) await base.query('UPDATE humalis_synchro_tetes SET plancher = GREATEST(plancher, $2) WHERE donnee = $1', [donnee, Math.max(...rows.map((l) => Number(l.version)))]);
        await base.query('DELETE FROM humalis_synchro_operations WHERE donnee = $1 AND quand < $2', [donnee, avant]);
      });
    },
  };
}
`;
