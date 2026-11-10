/**
 * La synchronisation d'une donnée locale (« synchronisee avec "notes" ») : ce que le serveur sert.
 *
 * Le contrat, le même pour toutes les cibles :
 *   GET  /api/<route>/synchro?depuis=<curseur>&limite=<n>
 *        → { changements: [{ id, supprime, valeurs?, version }], curseur, encore, reinitialiser, heure }
 *   POST /api/<route>/synchro  { heure, envois: [{ operation, id, modifieLe, supprime?, valeurs? }] }
 *        → { resultats: [{ operation, id, etat: 'applique'|'ignore'|'refuse', raison?, actuelle? }], heure }
 *
 * Chaque envoi repasse par la route elle-même (droits, conditions, vérification des champs, e-mails) :
 * une seule porte, jamais deux règles. Les écritures faites par ailleurs (une page, une tâche, une
 * transaction) entrent au journal par un déclencheur PostgreSQL : le curseur ne manque rien.
 */
import type { ServeurRI } from '../../ri/types.js';
import { camel } from '../web/noms.js';
import { conditionsDe, estSeparee } from './separation.js';

type Route = ServeurRI['routes'][number];
type Donnee = ServeurRI['donnees'][number];

export const avecSynchro = (serveur: ServeurRI) => serveur.routes.some((r) => r.synchronisee);

/** Les champs qui décident qui voit une fiche : les seuls qu'une pierre tombale garde. */
export function champsDePortee(donnee: Donnee, route: Route): string[] {
  const champs = new Set<string>();
  if (donnee.par !== undefined) champs.add(camel(donnee.par));
  for (const action of ['lire', 'creer', 'modifier', 'supprimer'] as const) {
    for (const c of conditionsDe(route, action)) {
      for (const o of [c.gauche, c.droite]) if (o.genre === 'fiche' && o.champ !== 'id') champs.add(camel(o.champ));
    }
  }
  return [...champs];
}

/** Dans le routeur d'une route synchronisée, avant « /:id ». */
export function codeSynchroRoute(route: Route, donnee: Donnee, variable: string, garde: (a: 'lire' | 'creer' | 'modifier' | 'supprimer') => string, porteeLire: string): string {
  const nom = camel(route.donnee);
  const separee = estSeparee(donnee, route);
  const ecritures = (['creer', 'modifier', 'supprimer'] as const).map((a) => route.droits[a]);
  const conditions = (['creer', 'modifier', 'supprimer'] as const).some((a) => conditionsDe(route, a).length > 0);
  // Chaque envoi est ensuite vérifié par sa propre route : cette porte n'en dit que le minimum.
  const porteEnvoi = ecritures.every((d) => d === null) && !conditions ? 'refuse' : ecritures.includes('tout_le_monde') ? '...acces.toutLeMonde' : '...acces.connecte';
  const csrf = porteEnvoi === 'refuse' ? '' : ', csrfMiddleware';
  return `      // « synchronisee avec "${route.adresse}" » : les changements depuis un curseur, les envois par lot.
      ${variable}.get('/synchro', lecturePrivee, ${garde('lire')}, async (req, res, next) => {
        try {
${separee ? porteeLire : '          const portee = null;\n'}          res.json(await synchro.lire(${JSON.stringify(nom)}, req.query as Record<string, unknown>, portee));
        } catch (erreur) {
          next(erreur);
        }
      });
      ${variable}.post('/synchro', ${porteEnvoi}${csrf}, async (req, res, next) => {
        try {
          const reponse = await synchro.envoyer(${JSON.stringify(nom)}, stockages.${nom}, ${variable}, req);
          if ('erreur' in reponse) res.status(400).json({ erreur: reponse.erreur });
          else res.json(reponse);
        } catch (erreur) {
          next(erreur);
        }
      });
`;
}

/** Dans creerServeur, avant extendRoutes. */
export function codeCreationSynchro(serveur: ServeurRI): string {
  const lignes = serveur.routes.filter((r) => r.synchronisee).map((r) => {
    const donnee = serveur.donnees.find((d) => d.nom === r.donnee)!;
    return `  journalSynchro.suivre(${JSON.stringify(camel(r.donnee))}, stockages.${camel(r.donnee)}, ${JSON.stringify(champsDePortee(donnee, r))});`;
  });
  return `  const synchro = creerSynchro(journalSynchro);\n${lignes.join('\n')}\n`;
}

/** Ce que demarrer.ts donne au journal : chaque table suivie, et ce que ses pierres tombales gardent. */
export function tablesSynchro(serveur: ServeurRI, nomTable: (donnee: string) => string): string {
  return `{ ${serveur.routes
    .filter((r) => r.synchronisee)
    .map((r) => `${JSON.stringify(camel(r.donnee))}: { table: ${JSON.stringify(nomTable(r.donnee))}, portee: ${JSON.stringify(champsDePortee(serveur.donnees.find((d) => d.nom === r.donnee)!, r))} }`)
    .join(', ')} }`;
}

export const ENV_SYNCHRO = `# Combien de jours une suppression reste connue des appareils (180 par défaut). Un appareil absent plus longtemps
# repart des données du serveur, sans perdre ce qu'il n'a pas encore envoyé.
HUMALIS_SYNCHRO_JOURS=
`;

/** src/humalis/synchro.ts */
export const SYNCHRO = String.raw`import { EventEmitter } from 'node:events';
import type { Request, Response, Router } from 'express';
import { idImpose, type Enregistrement, type PoolPostgres, type Stockage } from './stockage.js';

/**
 * Produit par Humalis : la synchronisation des données locales.
 * Un curseur par appareil, des pierres tombales pour les suppressions, des envois idempotents,
 * et « la modification la plus récente l'emporte » selon l'horloge du serveur : le moment d'une
 * modification hors ligne est ramené à cette horloge par l'écart mesuré à l'envoi.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATION = /^[A-Za-z0-9_-]{16,128}$/;
export const LOT_MAXIMUM = 200;
const PAGE = 500;
const PAGE_MAXIMUM = 1000;
const JOUR = 24 * 60 * 60 * 1000;

export interface LigneJournal {
  id: string;
  version: number;
  supprime: boolean;
  modifieLe: number;
  operation: string | null;
  portee: Record<string, unknown>;
}
export interface Page {
  lignes: (LigneJournal & { fiche: Enregistrement | null })[];
  tete: number;
  plancher: number;
}
export interface Resultat {
  operation: string;
  id: string;
  etat: 'applique' | 'ignore' | 'refuse';
  raison?: string;
  /** La fiche telle qu'elle est sur le serveur après un refus ou une défaite ; null : elle n'y est pas. */
  actuelle?: Record<string, unknown> | null;
}
export interface JournalSynchro {
  /** En mémoire : branche le journal sur le stockage. Dans PostgreSQL, ce sont des déclencheurs : rien à faire. */
  suivre(donnee: string, stockage: Stockage, portee: string[]): void;
  page(donnee: string, depuis: number, limite: number, egal: Record<string, unknown>): Promise<Page>;
  entree(donnee: string, id: string): Promise<LigneJournal | null>;
  horodater(donnee: string, id: string, modifieLe: number, operation: string): Promise<void>;
  operation(donnee: string, compte: string, operation: string): Promise<Resultat | null>;
  retenir(donnee: string, compte: string, resultat: Resultat): Promise<void>;
  /** Une seule écriture de lot à la fois pour une donnée, même sur plusieurs serveurs. */
  exclusif<T>(donnee: string, travail: () => Promise<T>): Promise<T>;
  menage(donnee: string, avant: number): Promise<void>;
}

export function creerJournalMemoire(horloge: () => number = Date.now): JournalSynchro {
  const donnees = new Map<string, { lignes: Map<string, LigneJournal>; tete: number; plancher: number; stockage?: Stockage; portee: string[]; operations: Map<string, Resultat & { quand: number }> }>();
  const de = (donnee: string) => {
    let d = donnees.get(donnee);
    if (!d) donnees.set(donnee, (d = { lignes: new Map(), tete: 0, plancher: 0, portee: [], operations: new Map() }));
    return d;
  };
  const noter = (donnee: string, id: string, supprime: boolean, fiche: Record<string, unknown> | null) => {
    const d = de(donnee);
    const avant = d.lignes.get(id);
    const portee = fiche ? Object.fromEntries(d.portee.filter((c) => c in fiche).map((c) => [c, fiche[c]])) : (avant?.portee ?? {});
    d.lignes.delete(id);
    d.lignes.set(id, { id, version: ++d.tete, supprime, modifieLe: horloge(), operation: null, portee });
  };
  const files = new Map<string, Promise<unknown>>();
  return {
    suivre(donnee, stockage, portee) {
      const d = de(donnee);
      d.stockage = stockage;
      d.portee = portee;
      const { creer, modifier, supprimer, trouver } = stockage;
      stockage.creer = async (valeurs) => {
        const fiche = await creer.call(stockage, valeurs);
        noter(donnee, fiche.id, false, fiche);
        return fiche;
      };
      stockage.modifier = async (id, valeurs) => {
        const fiche = await modifier.call(stockage, id, valeurs);
        if (fiche) noter(donnee, id, false, fiche);
        return fiche;
      };
      stockage.supprimer = async (id) => {
        const avant = await trouver.call(stockage, id);
        const fait = await supprimer.call(stockage, id);
        if (fait) noter(donnee, id, true, avant);
        return fait;
      };
    },
    async page(donnee, depuis, limite, egal) {
      const d = de(donnee);
      const lues = [...d.lignes.values()].filter((l) => l.version > depuis && Object.entries(egal).every(([c, v]) => l.portee[c] === v)).sort((a, b) => a.version - b.version).slice(0, limite);
      const lignes = [];
      for (const l of lues) lignes.push({ ...l, fiche: l.supprime ? null : ((await d.stockage?.trouver(l.id)) ?? null) });
      return { lignes, tete: d.tete, plancher: d.plancher };
    },
    async entree(donnee, id) {
      return de(donnee).lignes.get(id) ?? null;
    },
    async horodater(donnee, id, modifieLe, operation) {
      const ligne = de(donnee).lignes.get(id);
      if (ligne) Object.assign(ligne, { modifieLe, operation });
    },
    async operation(donnee, compte, operation) {
      const { quand: _quand, ...resultat } = de(donnee).operations.get(compte + ' ' + operation) ?? { quand: 0 };
      return 'etat' in resultat ? (resultat as Resultat) : null;
    },
    async retenir(donnee, compte, resultat) {
      de(donnee).operations.set(compte + ' ' + resultat.operation, { ...resultat, quand: horloge() });
    },
    exclusif(donnee, travail) {
      const suite = (files.get(donnee) ?? Promise.resolve()).then(travail, travail);
      files.set(donnee, suite.catch(() => undefined));
      return suite;
    },
    async menage(donnee, avant) {
      const d = de(donnee);
      for (const [id, l] of d.lignes) {
        if (l.supprime && l.modifieLe < avant) {
          d.plancher = Math.max(d.plancher, l.version);
          d.lignes.delete(id);
        }
      }
      for (const [cle, o] of d.operations) if (o.quand < avant) d.operations.delete(cle);
    },
  };
}

/** Ce que le journal attend d'un Pool de pg : ses requêtes, et une connexion à garder le temps d'un verrou. */
export interface PoolAvecClients extends PoolPostgres {
  connect(): Promise<PoolPostgres & { release(): void }>;
}

export function creerJournalPostgres(pool: PoolAvecClients, tables: Record<string, { table: string; portee: string[] }>): JournalSynchro {
  for (const { table, portee } of Object.values(tables)) {
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error('nom de table invalide : ' + table);
    for (const champ of portee) if (/[,'\\]/.test(champ)) throw new Error('nom de champ invalide : ' + champ);
  }
  let prete: Promise<void> | undefined;
  const installer = async () => {
    const client = await pool.connect();
    try {
      // Deux serveurs qui démarrent ensemble : un seul installe à la fois.
      await client.query("SELECT pg_advisory_lock(hashtextextended('humalis_synchro_installation', 0))");
      await client.query('CREATE TABLE IF NOT EXISTS humalis_synchro_tetes (donnee TEXT PRIMARY KEY, version BIGINT NOT NULL DEFAULT 0, plancher BIGINT NOT NULL DEFAULT 0)');
      await client.query("CREATE TABLE IF NOT EXISTS humalis_synchro_journal (donnee TEXT NOT NULL, id TEXT NOT NULL, version BIGINT NOT NULL, supprime BOOLEAN NOT NULL, modifie_le BIGINT NOT NULL, operation TEXT, portee JSONB NOT NULL DEFAULT '{}', PRIMARY KEY (donnee, id))");
      await client.query('CREATE INDEX IF NOT EXISTS humalis_synchro_journal_version ON humalis_synchro_journal (donnee, version)');
      await client.query('CREATE TABLE IF NOT EXISTS humalis_synchro_operations (donnee TEXT NOT NULL, compte TEXT NOT NULL, operation TEXT NOT NULL, resultat JSONB NOT NULL, quand BIGINT NOT NULL, PRIMARY KEY (donnee, compte, operation))');
      // La ligne de tête reste verrouillée jusqu'à la fin de la transaction : l'ordre des versions est celui des validations.
      await client.query(` + '`' + String.raw`CREATE OR REPLACE FUNCTION humalis_synchro_ecrire() RETURNS trigger AS $corps$
DECLARE
  numero BIGINT;
  source JSONB;
BEGIN
  INSERT INTO humalis_synchro_tetes (donnee, version) VALUES (TG_ARGV[0], 1)
    ON CONFLICT (donnee) DO UPDATE SET version = humalis_synchro_tetes.version + 1 RETURNING version INTO numero;
  IF TG_OP = 'DELETE' THEN source := OLD.data; ELSE source := NEW.data; END IF;
  INSERT INTO humalis_synchro_journal (donnee, id, version, supprime, modifie_le, operation, portee)
    VALUES (
      TG_ARGV[0],
      CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
      numero,
      TG_OP = 'DELETE',
      (extract(epoch FROM clock_timestamp()) * 1000)::bigint,
      NULL,
      COALESCE((SELECT jsonb_object_agg(c, source -> c) FROM unnest(string_to_array(TG_ARGV[1], ',')) AS c WHERE source ? c), '{}'::jsonb)
    )
    ON CONFLICT (donnee, id) DO UPDATE SET version = EXCLUDED.version, supprime = EXCLUDED.supprime, modifie_le = EXCLUDED.modifie_le, operation = NULL, portee = EXCLUDED.portee;
  RETURN NULL;
END
$corps$ LANGUAGE plpgsql` + '`' + String.raw`);
      for (const [donnee, { table, portee }] of Object.entries(tables)) {
        await client.query('CREATE TABLE IF NOT EXISTS ' + table + ' (id TEXT PRIMARY KEY, data JSONB NOT NULL, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())');
        await client.query('BEGIN');
        try {
          await client.query('INSERT INTO humalis_synchro_tetes (donnee) VALUES ($1) ON CONFLICT (donnee) DO NOTHING', [donnee]);
          const tete = Number((await client.query('SELECT version FROM humalis_synchro_tetes WHERE donnee = $1 FOR UPDATE', [donnee])).rows[0]!.version);
          // Les fiches écrites avant la synchronisation entrent au journal, dans leur ordre de création.
          const champs = portee.join(',');
          const ajout = await client.query(
            'INSERT INTO humalis_synchro_journal (donnee, id, version, supprime, modifie_le, portee) ' +
              'SELECT $1, t.id, $2::bigint + row_number() OVER (ORDER BY t.cree_le, t.id), false, (extract(epoch FROM t.cree_le) * 1000)::bigint, ' +
              "COALESCE((SELECT jsonb_object_agg(c, t.data -> c) FROM unnest(string_to_array($3, ',')) AS c WHERE t.data ? c), '{}'::jsonb) " +
              'FROM ' + table + ' t LEFT JOIN humalis_synchro_journal j ON j.donnee = $1 AND j.id = t.id WHERE j.id IS NULL',
            [donnee, tete, champs],
          );
          await client.query('UPDATE humalis_synchro_tetes SET version = version + $2 WHERE donnee = $1', [donnee, ajout.rowCount ?? 0]);
          await client.query("CREATE OR REPLACE TRIGGER humalis_synchro AFTER INSERT OR UPDATE OR DELETE ON " + table + " FOR EACH ROW EXECUTE FUNCTION humalis_synchro_ecrire('" + donnee + "', '" + champs + "')");
          await client.query('COMMIT');
        } catch (erreur) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw erreur;
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtextextended('humalis_synchro_installation', 0))").catch(() => undefined);
      client.release();
    }
  };
  const preparer = () =>
    (prete ??= installer().catch((erreur: unknown) => {
      prete = undefined;
      throw erreur;
    }));
  const tableDe = (donnee: string) => {
    const t = tables[donnee];
    if (!t) throw new Error('donnée non suivie : ' + donnee);
    return t.table;
  };
  const lire = (l: Record<string, unknown>): LigneJournal => ({ id: String(l.id), version: Number(l.version), supprime: l.supprime === true, modifieLe: Number(l.modifie_le), operation: l.operation === null ? null : String(l.operation), portee: l.portee as Record<string, unknown> });
  const files = new Map<string, Promise<unknown>>();
  return {
    suivre() {
      void preparer().catch((erreur: unknown) => console.error('La synchronisation ne s\'est pas installée :', erreur instanceof Error ? erreur.message : erreur));
    },
    async page(donnee, depuis, limite, egal) {
      await preparer();
      // La tête d'abord : tout ce qu'elle couvre est déjà validé.
      const tete = (await pool.query('SELECT version, plancher FROM humalis_synchro_tetes WHERE donnee = $1', [donnee])).rows[0];
      const { rows } = await pool.query(
        'SELECT j.id, j.version, j.supprime, j.modifie_le, j.operation, j.portee, t.data FROM humalis_synchro_journal j LEFT JOIN ' + tableDe(donnee) + ' t ON t.id = j.id WHERE j.donnee = $1 AND j.version > $2 AND j.portee @> $3::jsonb ORDER BY j.version LIMIT $4',
        [donnee, depuis, JSON.stringify(egal), limite],
      );
      return {
        lignes: rows.map((l) => ({ ...lire(l), fiche: l.data ? ({ ...(l.data as object), id: String(l.id) } as Enregistrement) : null })),
        tete: Number(tete?.version ?? 0),
        plancher: Number(tete?.plancher ?? 0),
      };
    },
    async entree(donnee, id) {
      await preparer();
      const { rows } = await pool.query('SELECT id, version, supprime, modifie_le, operation, portee FROM humalis_synchro_journal WHERE donnee = $1 AND id = $2', [donnee, id]);
      return rows[0] ? lire(rows[0]) : null;
    },
    async horodater(donnee, id, modifieLe, operation) {
      await pool.query('UPDATE humalis_synchro_journal SET modifie_le = $3, operation = $4 WHERE donnee = $1 AND id = $2', [donnee, id, modifieLe, operation]);
    },
    async operation(donnee, compte, operation) {
      await preparer();
      const { rows } = await pool.query('SELECT resultat FROM humalis_synchro_operations WHERE donnee = $1 AND compte = $2 AND operation = $3', [donnee, compte, operation]);
      return rows[0] ? (rows[0].resultat as Resultat) : null;
    },
    async retenir(donnee, compte, resultat) {
      await pool.query('INSERT INTO humalis_synchro_operations (donnee, compte, operation, resultat, quand) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [donnee, compte, resultat.operation, JSON.stringify(resultat), Date.now()]);
    },
    exclusif(donnee, travail) {
      // Une seule attente par processus : les lots en attente n'épuisent pas le réservoir de connexions.
      const proteger = async () => {
        await preparer();
        const client = await pool.connect();
        const cle = 'humalis_synchro_lot:' + donnee;
        try {
          await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [cle]);
          return await travail();
        } finally {
          await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [cle]).catch(() => undefined);
          client.release();
        }
      };
      const suite = (files.get(donnee) ?? Promise.resolve()).then(proteger, proteger);
      files.set(donnee, suite.catch(() => undefined));
      return suite;
    },
    async menage(donnee, avant) {
      await preparer();
      const { rows } = await pool.query('DELETE FROM humalis_synchro_journal WHERE donnee = $1 AND supprime AND modifie_le < $2 RETURNING version', [donnee, avant]);
      if (rows.length > 0) await pool.query('UPDATE humalis_synchro_tetes SET plancher = GREATEST(plancher, $2) WHERE donnee = $1', [donnee, Math.max(...rows.map((l) => Number(l.version)))]);
      await pool.query('DELETE FROM humalis_synchro_operations WHERE donnee = $1 AND quand < $2', [donnee, avant]);
    },
  };
}

interface Portee {
  egal: Record<string, unknown>;
  test?: (fiche: Record<string, unknown>) => boolean;
}

/** Une requête rejouée dans un routeur, sans réseau : la réponse est gardée au lieu de partir. */
function reponseInterne(): { res: Response; finie: Promise<{ statut: number; corps: unknown }> } {
  const res = new EventEmitter() as unknown as Response & { corps?: unknown };
  let finir: (r: { statut: number; corps: unknown }) => void;
  const finie = new Promise<{ statut: number; corps: unknown }>((ok) => (finir = ok));
  const entetes = new Map<string, unknown>();
  Object.assign(res, {
    statusCode: 200,
    locals: {},
    headersSent: false,
    getHeader: (nom: string) => entetes.get(nom.toLowerCase()),
    setHeader: (nom: string, valeur: unknown) => (entetes.set(nom.toLowerCase(), valeur), res),
    removeHeader: (nom: string) => void entetes.delete(nom.toLowerCase()),
    set: (nom: string, valeur: unknown) => (entetes.set(nom.toLowerCase(), valeur), res),
    header: (nom: string, valeur: unknown) => (entetes.set(nom.toLowerCase(), valeur), res),
    cookie: () => res,
    clearCookie: () => res,
    status: (code: number) => ((res.statusCode = code), res),
    json: (corps: unknown) => ((res.corps = corps), res.end()),
    send: (corps: unknown) => ((res.corps = corps), res.end()),
    end: () => {
      (res as unknown as { headersSent: boolean }).headersSent = true;
      res.emit('finish');
      finir({ statut: res.statusCode, corps: res.corps });
      return res;
    },
  });
  return { res, finie };
}

function rejouer(req: Request, routeur: Router, methode: string, url: string, corps: unknown): Promise<{ statut: number; corps: unknown }> {
  const sous = Object.create(req) as Request & { _body: boolean; _parsedUrl?: unknown };
  const { 'x-humalis-envoi': _envoi, 'content-length': _taille, ...entetes } = req.headers;
  Object.assign(sous, { method: methode, url, originalUrl: req.baseUrl + url, body: corps, _body: true, query: {}, params: {}, headers: entetes, _parsedUrl: undefined });
  const { res, finie } = reponseInterne();
  return new Promise((ok, echec) => {
    finie.then(ok);
    (routeur as unknown as { handle(q: unknown, r: unknown, suite: (e?: unknown) => void): void }).handle(sous, res, (erreur?: unknown) => {
      // Une garde qui passe la main à la gestion d'erreurs (401, 403, CSRF) : son statut est la réponse.
      if (!erreur) return ok({ statut: 404, corps: { erreur: 'introuvable' } });
      const statut = (erreur as { statusCode?: unknown; status?: unknown }).statusCode ?? (erreur as { status?: unknown }).status;
      if (typeof statut === 'number' && statut >= 400 && statut < 500) ok({ statut, corps: { erreur: (erreur as Error).message } });
      else echec(erreur);
    });
  });
}

export function creerSynchro(journal: JournalSynchro, { env = process.env, horloge = Date.now }: { env?: Record<string, string | undefined>; horloge?: () => number } = {}) {
  const menages = new Map<string, number>();
  const nettoyer = (donnee: string) => {
    const maintenant = horloge();
    if (maintenant - (menages.get(donnee) ?? 0) < 60 * 60 * 1000) return;
    menages.set(donnee, maintenant);
    const jours = Number(env.HUMALIS_SYNCHRO_JOURS) || 180;
    void journal.menage(donnee, maintenant - jours * JOUR).catch((erreur: unknown) => console.error('Le ménage de la synchronisation a échoué :', erreur instanceof Error ? erreur.message : erreur));
  };
  const valeursDe = (fiche: Enregistrement) => {
    const { id: _id, ...valeurs } = fiche;
    return valeurs;
  };
  return {
    /** Les changements depuis le curseur, limités à ce que cette personne peut lire. */
    async lire(donnee: string, requete: Record<string, unknown>, portee: Portee | null) {
      nettoyer(donnee);
      const brut = Number(requete.depuis ?? 0);
      let depuis = Number.isSafeInteger(brut) && brut >= 0 ? brut : 0;
      const demande = Number(requete.limite ?? PAGE);
      const limite = Number.isSafeInteger(demande) && demande > 0 ? Math.min(demande, PAGE_MAXIMUM) : PAGE;
      const egal = portee?.egal ?? {};
      let page = await journal.page(donnee, depuis, limite, egal);
      // Cet appareil est resté absent trop longtemps : des suppressions ont été oubliées, il repart de zéro.
      const reinitialiser = depuis > 0 && depuis < page.plancher;
      if (reinitialiser) {
        depuis = 0;
        page = await journal.page(donnee, 0, limite, egal);
      }
      const encore = page.lignes.length === limite;
      const derniere = page.lignes.at(-1)?.version ?? depuis;
      const changements = page.lignes.flatMap((ligne) => {
        const fiche = ligne.fiche;
        if (ligne.supprime) return [{ id: ligne.id, supprime: true, version: ligne.version }];
        // Une ligne dont la fiche vient de partir : la prochaine page en parlera.
        if (!fiche) return [];
        // Une condition ne laisse plus voir cette fiche : elle quitte l'appareil, sans rien en dire.
        if (portee?.test && !portee.test(fiche)) return [{ id: ligne.id, supprime: true, version: ligne.version }];
        return [{ id: ligne.id, supprime: false, valeurs: valeursDe(fiche), version: ligne.version }];
      });
      return { changements, curseur: encore ? derniere : Math.max(derniere, page.tete), encore, reinitialiser, heure: horloge() };
    },

    /** Un lot d'envois : chacun repasse par la route, le plus récent l'emporte, et rejouer ne change rien. */
    async envoyer(donnee: string, stockage: Stockage, routeur: Router, req: Request): Promise<{ resultats: Resultat[]; heure: number } | { erreur: string }> {
      const corps = (req.body ?? {}) as { heure?: unknown; envois?: unknown };
      if (!Array.isArray(corps.envois)) return { erreur: 'envois manquants' };
      if (corps.envois.length > LOT_MAXIMUM) return { erreur: 'trop d\'envois dans ce lot : ' + LOT_MAXIMUM + ' au plus' };
      if (typeof corps.heure !== 'number' || !Number.isFinite(corps.heure)) return { erreur: 'heure manquante' };
      for (const brut of corps.envois as Record<string, unknown>[]) {
        if (typeof brut !== 'object' || brut === null || typeof brut.operation !== 'string' || !OPERATION.test(brut.operation)) return { erreur: 'identifiant d\'opération invalide' };
        if (typeof brut.id !== 'string' || !UUID.test(brut.id)) return { erreur: 'identifiant de fiche invalide' };
        if (typeof brut.modifieLe !== 'number' || !Number.isFinite(brut.modifieLe)) return { erreur: 'moment de modification invalide' };
        if (brut.supprime !== true && (typeof brut.valeurs !== 'object' || brut.valeurs === null || Array.isArray(brut.valeurs))) return { erreur: 'valeurs manquantes' };
      }
      const envois = corps.envois as { operation: string; id: string; modifieLe: number; supprime?: boolean; valeurs?: Record<string, unknown> }[];
      const compte = String((req as unknown as { user?: { id?: unknown } }).user?.id ?? 'visiteur');
      const ecart = horloge() - corps.heure;
      const actuelle = async (id: string) => {
        const lu = await rejouer(req, routeur, 'GET', '/' + encodeURIComponent(id), undefined);
        return lu.statut === 200 ? valeursDe(lu.corps as Enregistrement) : null;
      };
      const resultats = await journal.exclusif(donnee, async () => {
        const liste: Resultat[] = [];
        for (const envoi of envois) {
          const deja = await journal.operation(donnee, compte, envoi.operation);
          if (deja) {
            liste.push(deja);
            continue;
          }
          const resultat = await appliquer(envoi);
          await journal.retenir(donnee, compte, resultat);
          liste.push(resultat);
        }
        return liste;
      });
      return { resultats, heure: horloge() };

      async function appliquer(envoi: (typeof envois)[number]): Promise<Resultat> {
        const { operation, id } = envoi;
        // Ramené à l'horloge du serveur ; jamais dans le futur, même si l'appareil se trompe.
        const quand = Math.min(horloge(), envoi.modifieLe + ecart);
        const entree = await journal.entree(donnee, id);
        if (entree?.operation === operation) return { operation, id, etat: 'applique' };
        if (entree && (entree.modifieLe > quand || (entree.modifieLe === quand && String(entree.operation ?? '') > operation))) {
          return { operation, id, etat: 'ignore', actuelle: await actuelle(id) };
        }
        const existe = await stockage.trouver(id);
        let reponse: { statut: number; corps: unknown };
        if (envoi.supprime) {
          // Déjà partie, ou jamais arrivée : il n'y a rien à refuser.
          if (!existe) return { operation, id, etat: 'applique' };
          reponse = await rejouer(req, routeur, 'DELETE', '/' + encodeURIComponent(id), undefined);
        } else if (existe) {
          reponse = await rejouer(req, routeur, 'PATCH', '/' + encodeURIComponent(id), { ...envoi.valeurs });
        } else {
          reponse = await idImpose.run({ id, pris: false }, () => rejouer(req, routeur, 'POST', '/', { ...envoi.valeurs }));
        }
        if (reponse.statut >= 500) throw new Error('la route a échoué pendant la synchronisation');
        if (reponse.statut >= 400) {
          const raison = (reponse.corps as { erreur?: unknown } | undefined)?.erreur;
          return { operation, id, etat: 'refuse', ...(typeof raison === 'string' ? { raison } : {}), actuelle: await actuelle(id) };
        }
        await journal.horodater(donnee, id, quand, operation);
        return { operation, id, etat: 'applique' };
      }
    },
  };
}
`;

/** tests/synchro.test.ts */
export function testsSynchro(serveur: ServeurRI, stockages: string, route: Route, exemple: string): string {
  const adresse = `/api/${route.adresse.replace(/^\/+/, '')}/synchro`;
  return `// Produit par Humalis : la synchronisation, de bout en bout, sur le vrai serveur.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createMemoryUsersStore, type UsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from '../src/serveur.js';
import { creerStockageMemoire } from '../src/humalis/stockage.js';

const MOT_DE_PASSE = 'Essai-Solide-2026!';
const op = () => randomUUID().replaceAll('-', '');

async function preparer() {
  const usersStore = createMemoryUsersStore() as UsersStore;
  const passwordHash = await hashPassword(MOT_DE_PASSE);
  await usersStore.create({ email: 'admin@exemple.cd', role: 'admin', passwordHash });
  const stockages = {
${stockages}
  };
  const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages }) as never;
  const connexion = await request(app).post('/auth/login').send({ email: 'admin@exemple.cd', password: MOT_DE_PASSE }).expect(200);
  return { app, stockages, entree: { Authorization: \`Bearer \${connexion.body.data.token}\` } };
}

describe('la synchronisation de « ${route.adresse} »', () => {
  it('un envoi crée la fiche avec son identifiant, une fois seulement', async () => {
    const { app, entree } = await preparer();
    const id = randomUUID();
    const lot = { heure: Date.now(), envois: [{ operation: op(), id, modifieLe: Date.now(), valeurs: ${exemple} }] };
    const premier = await request(app).post('${adresse}').set(entree).send(lot).expect(200);
    expect(premier.body.resultats[0]).toMatchObject({ id, etat: 'applique' });
    const rejoue = await request(app).post('${adresse}').set(entree).send(lot).expect(200);
    expect(rejoue.body.resultats[0]).toEqual(premier.body.resultats[0]);
    const lus = await request(app).get('${adresse}?depuis=0').set(entree).expect(200);
    expect(lus.body.changements.filter((c: { id: string }) => c.id === id)).toHaveLength(1);
  });

  it('la modification la plus récente l\\'emporte, selon l\\'horloge du serveur', async () => {
    const { app, entree } = await preparer();
    const id = randomUUID();
    const maintenant = Date.now();
    await request(app).post('${adresse}').set(entree).send({ heure: maintenant, envois: [{ operation: op(), id, modifieLe: maintenant, valeurs: ${exemple} }] }).expect(200);
    // Un appareil dont l'horloge retarde d'une heure : sa modification d'il y a une minute est plus ancienne que celle-ci.
    const ancien = await request(app).post('${adresse}').set(entree).send({ heure: maintenant - 3_600_000, envois: [{ operation: op(), id, modifieLe: maintenant - 3_660_000, valeurs: ${exemple} }] }).expect(200);
    expect(ancien.body.resultats[0].etat).toBe('ignore');
    expect(ancien.body.resultats[0].actuelle).toBeTruthy();
  });

  it('une suppression reste connue, et le curseur ne redonne rien', async () => {
    const { app, entree } = await preparer();
    const id = randomUUID();
    const maintenant = Date.now();
    await request(app).post('${adresse}').set(entree).send({ heure: maintenant, envois: [{ operation: op(), id, modifieLe: maintenant, valeurs: ${exemple} }] }).expect(200);
    const avant = await request(app).get('${adresse}?depuis=0').set(entree).expect(200);
    await request(app).post('${adresse}').set(entree).send({ heure: Date.now(), envois: [{ operation: op(), id, modifieLe: Date.now() + 1, supprime: true }] }).expect(200);
    const apres = await request(app).get(\`${adresse}?depuis=\${avant.body.curseur}\`).set(entree).expect(200);
    expect(apres.body.changements).toEqual([expect.objectContaining({ id, supprime: true })]);
    const vide = await request(app).get(\`${adresse}?depuis=\${apres.body.curseur}\`).set(entree).expect(200);
    expect(vide.body.changements).toEqual([]);
  });

  it('un envoi mal formé est refusé, un visiteur n\\'entre pas', async () => {
    const { app, entree } = await preparer();
    await request(app).post('${adresse}').set(entree).send({ heure: Date.now(), envois: [{ operation: 'x', id: 'y', modifieLe: 1 }] }).expect(400);
    ${route.droits.lire === 'tout_le_monde' ? '' : `await request(app).get('${adresse}').expect(401);`}
  });
});
`;
}
