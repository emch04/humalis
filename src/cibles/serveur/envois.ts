/**
 * Un envoi rejoué ne crée pas de doublon. Le client donne à chaque envoi un identifiant
 * (en-tête X-Humalis-Envoi) et garde le même s'il recommence : le serveur fait le travail
 * une seule fois, puis redonne la même réponse. Sans cet en-tête, rien ne change.
 */

/** src/humalis/envois.ts */
export const ENVOIS = String.raw`import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { PoolPostgres } from './stockage.js';

/** Produit par Humalis : chaque envoi identifié n'est fait qu'une fois, même sur plusieurs serveurs. */
const ENTETE = 'x-humalis-envoi';
const FORME = /^[A-Za-z0-9_-]{16,128}$/;
const JOUR = 24 * 60 * 60 * 1000;
// Un envoi resté « en cours » si longtemps vient d'un serveur tombé pendant le travail.
const ABANDON = 10 * 60 * 1000;

export interface ReponseGardee {
  statut: number;
  corps: unknown;
}
export type EtatEnvoi = 'libre' | 'en_cours' | 'autre' | ReponseGardee;

export interface MagasinEnvois {
  reserver(cle: string, empreinte: string): Promise<EtatEnvoi>;
  finir(cle: string, reponse: ReponseGardee): Promise<void>;
  liberer(cle: string): Promise<void>;
}

export function creerEnvoisMemoire(horloge: () => number = Date.now): MagasinEnvois {
  const lignes = new Map<string, { empreinte: string; depuis: number; reponse?: ReponseGardee }>();
  return {
    async reserver(cle, empreinte) {
      const maintenant = horloge();
      for (const [c, l] of lignes) if (l.depuis <= maintenant - JOUR) lignes.delete(c);
      const ligne = lignes.get(cle);
      if (!ligne || (!ligne.reponse && ligne.depuis <= maintenant - ABANDON)) {
        lignes.set(cle, { empreinte, depuis: maintenant });
        return 'libre';
      }
      if (ligne.empreinte !== empreinte) return 'autre';
      return ligne.reponse ?? 'en_cours';
    },
    async finir(cle, reponse) {
      const ligne = lignes.get(cle);
      if (ligne) ligne.reponse = reponse;
    },
    async liberer(cle) {
      lignes.delete(cle);
    },
  };
}

export function creerEnvoisPostgres(pool: PoolPostgres): MagasinEnvois {
  let prete: Promise<unknown> | undefined;
  let dernierMenage = 0;
  const preparer = () =>
    (prete ??= pool
      .query('CREATE TABLE IF NOT EXISTS humalis_envois (cle TEXT PRIMARY KEY, empreinte TEXT NOT NULL, statut INTEGER, corps JSONB, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())')
      .catch((erreur: unknown) => {
        prete = undefined;
        throw erreur;
      }));
  return {
    async reserver(cle, empreinte) {
      await preparer();
      if (Date.now() - dernierMenage > 60_000) {
        dernierMenage = Date.now();
        await pool.query("DELETE FROM humalis_envois WHERE cree_le < now() - interval '1 day'");
      }
      // La clé primaire tranche entre deux serveurs : un seul obtient la ligne.
      const { rows } = await pool.query(
        "INSERT INTO humalis_envois (cle, empreinte) VALUES ($1, $2) ON CONFLICT (cle) DO UPDATE SET empreinte = EXCLUDED.empreinte, cree_le = now() WHERE humalis_envois.statut IS NULL AND humalis_envois.cree_le < now() - interval '" + ABANDON / 60000 + " minutes' RETURNING cle",
        [cle, empreinte],
      );
      if (rows.length > 0) return 'libre';
      const ligne = (await pool.query('SELECT empreinte, statut, corps FROM humalis_envois WHERE cle = $1', [cle])).rows[0];
      if (!ligne) return 'en_cours';
      if (ligne.empreinte !== empreinte) return 'autre';
      return ligne.statut === null ? 'en_cours' : { statut: Number(ligne.statut), corps: ligne.corps };
    },
    async finir(cle, { statut, corps }) {
      await pool.query('UPDATE humalis_envois SET statut = $2, corps = $3::jsonb WHERE cle = $1', [cle, statut, JSON.stringify(corps ?? null)]);
    },
    async liberer(cle) {
      await pool.query('DELETE FROM humalis_envois WHERE cle = $1', [cle]);
    },
  };
}

const empreinteDe = (valeur: unknown) => createHash('sha256').update(JSON.stringify(valeur ?? null)).digest('hex');

/** Placé après le contrôle des droits : l'identifiant vaut pour un compte, jamais pour un autre. */
export function creerUnSeulEnvoi(magasin: MagasinEnvois): RequestHandler {
  return async (req, res, next) => {
    const brut = req.get(ENTETE);
    if (brut === undefined || req.method === 'GET' || req.method === 'HEAD') {
      next();
      return;
    }
    if (!FORME.test(brut)) {
      res.status(400).json({ erreur: "cet identifiant d'envoi n'est pas valable" });
      return;
    }
    const qui = (req as unknown as { user?: { id?: unknown } }).user?.id ?? 'adresse:' + req.ip;
    const cle = createHash('sha256').update(String(qui) + '|' + req.method + '|' + req.baseUrl + req.path + '|' + brut).digest('hex');
    try {
      const etat = await magasin.reserver(cle, empreinteDe(req.body));
      if (etat === 'en_cours') {
        res.status(409).json({ erreur: 'cet envoi est déjà en cours' });
        return;
      }
      if (etat === 'autre') {
        res.status(422).json({ erreur: 'cet identifiant a déjà servi pour un autre envoi' });
        return;
      }
      if (etat !== 'libre') {
        res.set('X-Humalis-Rejoue', '1');
        if (etat.corps === null) res.status(etat.statut).end();
        else res.status(etat.statut).json(etat.corps);
        return;
      }
    } catch (erreur) {
      next(erreur);
      return;
    }
    let corps: unknown;
    let lu = false;
    const json = res.json.bind(res);
    res.json = (valeur: unknown) => {
      corps = valeur;
      lu = true;
      return json(valeur);
    };
    // On garde la réponse avant de l'envoyer : si la connexion coupe, le renvoi la retrouvera.
    const fin = res.end.bind(res) as (...args: unknown[]) => typeof res;
    res.end = ((...args: unknown[]) => {
      const reussi = res.statusCode < 400 && (lu || res.statusCode === 204);
      const garde = reussi ? magasin.finir(cle, { statut: res.statusCode, corps: lu ? corps : null }) : magasin.liberer(cle);
      garde.catch((erreur: unknown) => console.error("Un envoi n'a pas été retenu :", erreur instanceof Error ? erreur.message : erreur)).finally(() => fin(...args));
      return res;
    }) as typeof res.end;
    next();
  };
}
`;
