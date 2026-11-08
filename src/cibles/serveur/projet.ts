import { avecComptes, avecEmails, CLES_BREVO, codeCreationComptes, codeEnvois, codeRoutesComptes, COMPTES, EMAILS, ENV_EMAILS, ENV_LIENS, testsComptes } from './comptes.js';
import { codeFicheVisible, codePortee, compteRelu, conditionsDe, constantesSeparation, estSeparee, SEPARATION, testsSeparee } from './separation.js';
import { avecIa, ENV_IA, IA, routeIa } from './ia.js';
import { ENVOIS } from './envois.js';
import { codeResumes, avecPaiements, codePaiements, codeSurPaiement, PAIEMENTS, avecLogique, avecNotifications, codeActions, codeDocuments, codeNotificationsCreation, codeTaches, DOCUMENT, employe, LOGIQUE, NOTIFICATIONS, ROUTES_APPAREILS } from './logique.js';
import { champsDuServeur, codeCompleter, codeCreation, noms as nomsVerifier, reglesEnvoi } from './regles.js';
import { ligneLocale } from '../../fichiers.js';
import type { ServeurRI, TypeChamp, QuiPeut } from '../../ri/types.js';
import { simplifier } from '../../analyse/elements.js';
import { pascal, camel } from '../web/noms.js';

export interface OptionsServeur {
  /** Le nom du projet, tiré du fichier Humalis. */
  nom: string;
  /** Le fichier Humalis d'origine, cité dans le LISEZMOI. */
  source: string;
  /** Le chemin de chaque page : celui qu'ouvre un lien envoyé par e-mail. */
  chemins?: Map<string, string>;
}

/** Versions épinglées des dépendances du serveur produit. */
export const VERSIONS_SERVEUR = {
  notify: '1.1.0',
  saasKit: '2.0.1',
  security: '1.13.0',
  storePostgres: '1.1.0',
  centrale: '1.10.0',
  credentials: '1.1.0',
  tooling: '1.6.2',
  pdf: '1.0.0',
  pdfkit: '0.18.0',
  typesPdfkit: '0.17.7',
  loyalty: '1.0.1',
  express: '4.22.3',
  pg: '8.23.1',
  typescript: '7.0.2',
  typesNode: '26.2.0',
  typesExpress: '4.17.25',
  typesPg: '8.23.1',
  supertest: '7.3.1',
  typesSupertest: '7.2.1',
  vitest: '4.1.12',
};

export const MARQUE_SERVEUR = '.humalis-projet';

type Action = 'lire' | 'creer' | 'modifier' | 'supprimer';
const ACTIONS: Action[] = ['lire', 'creer', 'modifier', 'supprimer'];

/**
 * Les fichiers d'un serveur Node + TypeScript complet (étape 3). Toute la
 * sécurité (connexion, sessions, droits, CSRF, limites, en-têtes) vient
 * des packs Astratra ; le code produit ne fait que les assembler, décrire
 * les données et vérifier la forme des envois.
 */
export function genererProjetServeur(serveur: ServeurRI, options: OptionsServeur): Map<string, string> {
  const fichiers = new Map<string, string>();
  fichiers.set(MARQUE_SERVEUR, `Projet produit par Humalis depuis ${options.source}.\nLe compilateur réécrit ce dossier à chaque compilation.\n`);
  fichiers.set('package.json', packageJson(options.nom, serveur));
  fichiers.set('tsconfig.json', TSCONFIG);
  fichiers.set('.gitignore', 'node_modules\ndist\n.env\n');
  fichiers.set('.env.exemple', envExemple(serveur));
  fichiers.set('LISEZMOI.md', lisezmoi(serveur, options));
  fichiers.set('src/humalis/verifier.ts', VERIFIER);
  fichiers.set('src/humalis/stockage.ts', STOCKAGE);
  fichiers.set('src/humalis/envois.ts', ENVOIS);
  fichiers.set('src/humalis/compresser.ts', COMPRESSER);
  fichiers.set('src/humalis/renouvellements.ts', RENOUVELLEMENTS);
  fichiers.set('src/humalis/sessions.ts', SESSIONS);
  fichiers.set('src/humalis/centrale.ts', CENTRALE);
  fichiers.set('src/humalis/coffre.ts', coffreTs(serveur));
  fichiers.set('src/donnees.ts', donneesTs(serveur));
  if (avecEmails(serveur)) fichiers.set('src/humalis/emails.ts', EMAILS);
  if (avecComptes(serveur)) fichiers.set('src/humalis/comptes.ts', COMPTES);
  if (serveur.invitations || serveur.motDePasseOublie || serveur.routeComptes) {
    fichiers.set('tests/comptes.test.ts', testsComptes(serveur, serveur.donnees.map((d) => `    ${camel(d.nom)}: creerStockageMemoire(),`).join('\n')));
  }
  fichiers.set('src/serveur.ts', serveurTs(serveur, options.chemins));
  fichiers.set('src/demarrer.ts', demarrerTs(serveur));
  fichiers.set('tests/regles.test.ts', testsRegles(serveur));
  fichiers.set('tests/sessions.test.ts', testsSessions(serveur));
  if (serveur.routes.some((r) => r.direct)) fichiers.set('src/humalis/direct.ts', DIRECT);
  if (compteRelu(serveur) || serveur.routes.some((r) => r.actions?.length && serveur.donnees.find((d) => d.nom === r.donnee)?.par)) fichiers.set('src/humalis/separation.ts', SEPARATION);
  if (avecLogique(serveur)) fichiers.set('src/humalis/logique.ts', LOGIQUE);
  if (serveur.documents?.length) fichiers.set('src/humalis/document.ts', DOCUMENT);
  if (avecNotifications(serveur)) fichiers.set('src/humalis/notifications.ts', NOTIFICATIONS);
  if (avecIa(serveur)) fichiers.set('src/humalis/ia.ts', IA);
  if (avecPaiements(serveur)) fichiers.set('src/humalis/paiements.ts', PAIEMENTS);
  if (serveur.routes.some((r) => r.bon)) {
    fichiers.set('src/humalis/bon.ts', BON);
    fichiers.set('tests/bon.test.ts', testsBon(serveur));
  }
  if (serveur.fidelite) {
    fichiers.set('src/humalis/fidelite.ts', FIDELITE);
    fichiers.set('tests/fidelite.test.ts', testsFidelite(serveur));
  }
  return fichiers;
}

/** « produit » → « humalis_produit » : un nom de table sûr, fixé à la compilation. */
const nomTable = (donnee: string) => `humalis_${simplifier(donnee) || 'donnee'}`;
const adresseApi = (adresse: string) => `/api/${adresse.replace(/^\/+/, '')}`;

function typeTS(type: TypeChamp): string {
  switch (type.genre) {
    case 'texte':
    case 'date':
      return 'string';
    case 'nombre':
      return 'number';
    case 'booleen':
      return 'boolean';
    case 'liste':
      return `${typeTS(type.de)}[]`;
    case 'donnee':
      // Une donnée imbriquée n'existe que dans une source, jamais dans un serveur.
      return 'unknown';
  }
}

/** Le type d'un champ, tel que le lit src/humalis/verifier.ts. */
function schemaChamp(type: TypeChamp): string {
  if (type.genre === 'texte' && type.image) return "'image'";
  return type.genre === 'liste' ? `{ liste: ${schemaChamp(type.de)} }` : `'${type.genre}'`;
}

/** Une valeur valide pour un champ, utilisée par les tests produits. */
function exempleChamp(type: TypeChamp): string {
  switch (type.genre) {
    case 'texte':
      return type.image ? "''" : "'exemple'";
    case 'nombre':
      return '1';
    case 'booleen':
      return 'true';
    case 'date':
      return "'2026-01-01'";
    case 'liste':
      return '[]';
    case 'donnee':
      return 'null';
  }
}

function packageJson(nom: string, serveur: ServeurRI): string {
  const v = VERSIONS_SERVEUR;
  const bon = serveur.routes.some((r) => r.bon) || Boolean(serveur.documents?.length);
  return JSON.stringify(
    {
      name: `${simplifier(nom).replace(/_/g, '-') || 'serveur'}-serveur`,
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: {
        build: 'tsc',
        start: 'node --env-file-if-exists=.env dist/src/demarrer.js',
        test: 'vitest run --dir tests',
        // Les failles connues des dépendances, et les secrets écrits en dur dans un journal ou une réponse.
        'audit:deps': 'astratra audit:deps',
        'audit:secrets': 'astratra audit:secrets',
      },
      dependencies: {
        '@astratra/centrale': v.centrale,
        '@astratra/credentials': v.credentials,
        ...(serveur.fidelite ? { '@astratra/loyalty': v.loyalty } : {}),
        ...(avecEmails(serveur) ? { '@astratra/notify': v.notify } : {}),
        ...(bon ? { '@astratra/pdf': v.pdf } : {}),
        '@astratra/saas-kit': v.saasKit,
        '@astratra/security': v.security,
        '@astratra/store-postgres': v.storePostgres,
        express: v.express,
        ...(bon ? { pdfkit: v.pdfkit } : {}),
        ...(avecNotifications(serveur) ? { 'web-push': '3.6.7' } : {}),
        ...(avecIa(serveur) ? { '@anthropic-ai/sdk': '1.6.0' } : {}),
        ...(avecPaiements(serveur) ? { stripe: '23.1.0' } : {}),
        pg: v.pg,
      },
      devDependencies: {
        '@astratra/tooling': v.tooling,
        '@types/express': v.typesExpress,
        '@types/node': v.typesNode,
        ...(bon ? { '@types/pdfkit': v.typesPdfkit } : {}),
        ...(avecNotifications(serveur) ? { '@types/web-push': '3.6.4' } : {}),
        '@types/pg': v.typesPg,
        '@types/supertest': v.typesSupertest,
        supertest: v.supertest,
        typescript: v.typescript,
        vitest: v.vitest,
      },
    },
    null,
    2,
  ) + '\n';
}

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      skipLibCheck: true,
      outDir: 'dist',
      types: ['node'],
    },
    include: ['src', 'tests'],
  },
  null,
  2,
) + '\n';

/** « connexion google » : l'ID client OAuth de Google (pas un secret). */
const ENV_GOOGLE = `# La connexion avec Google (« connexion google ») : l'ID client OAuth d'une
# application Web, créé dans la Google Cloud Console (ce n'est pas un secret).
# Adresses de redirection autorisées : https://ton-site/auth-google.html
GOOGLE_CLIENT_ID=
`;

const ENV_EXEMPLE = `# Copie ce fichier en .env et remplis-le. Ne le publie jamais.

# Le secret des sessions : au moins 32 caractères au hasard.
JWT_SECRET=

# Le premier administrateur, créé au premier démarrage s'il n'existe pas.
# Le mot de passe doit être solide : 8 caractères minimum, avec majuscule,
# minuscule, chiffre et caractère spécial.
HUMALIS_ADMIN_EMAIL=
HUMALIS_ADMIN_MOT_DE_PASSE=

# La base PostgreSQL. Sans elle, les données restent en mémoire (développement).
DATABASE_URL=

# La session : elle se renouvelle tant que la personne revient.
# HUMALIS_SESSION : après ce temps sans venir, il faut se reconnecter (« 3d », « 12h » ; 3 jours par défaut).
# HUMALIS_SESSION_MAX : après ce temps depuis la connexion, il faut se reconnecter, même en revenant chaque jour (30 jours par défaut).
HUMALIS_SESSION=
HUMALIS_SESSION_MAX=

# Le nombre de relais devant le serveur (nginx : 1). Sans lui, les limites de requêtes comptent le relais, pas chaque visiteur.
HUMALIS_RELAIS=
# L'adresse d'écoute. Derrière un relais sur la même machine : 127.0.0.1, le serveur n'est alors joignable que par lui. Sans elle, toutes les adresses.
HUMALIS_ECOUTE=

# La surveillance (@astratra/centrale) : erreurs et requêtes, masquées avant l'envoi.
# Sans ces deux variables, rien n'est chargé et rien ne part. La clé est publique (clj_pub_…).
CENTRALE_ADRESSE=
CENTRALE_CLE=
# production, preproduction ou developpement ; sinon, déduit de NODE_ENV.
CENTRALE_ENVIRONNEMENT=

# Le coffre des clés de service, chiffrées en base et modifiables sans redémarrer (/auth/cles, réservé à l'admin).
# 32 octets au hasard : openssl rand -base64 32. Sans elle, le coffre reste fermé et le .env sert seul.
# La perdre rend illisibles les clés déjà rangées : garde-la hors de la base.
ENCRYPTION_KEY=

PORT=3000
`;

function envExemple(serveur: ServeurRI): string {
  const enPlus = [
    ...(serveur.connexionGoogle ? [ENV_GOOGLE] : []),
    ...(serveur.emails ? [ENV_EMAILS] : []),
    `# Requêtes par adresse et par 15 minutes (300 par défaut), tentatives de connexion (10 par défaut). À monter si beaucoup de personnes partagent une même adresse.\nHUMALIS_LIMITE_API=\nHUMALIS_LIMITE_CONNEXION=\n`,
    ...(avecIa(serveur) ? [ENV_IA] : []),
    ...(avecPaiements(serveur) ? [`# Les paiements (« paiements par stripe ») : une clé de test d'abord (sk_test_…), et le secret du webhook vers /paiements/webhook.\nSTRIPE_CLE_SECRETE=\nSTRIPE_SECRET_WEBHOOK=\nHUMALIS_PAIEMENT_DEVISE=eur\n`] : []),
    ...(serveur.invitations || serveur.motDePasseOublie || serveur.donnees.some((d) => d.champs.some((c) => c.regle?.genre === 'site')) ? [ENV_LIENS] : []),
  ];
  return ENV_EXEMPLE.replace('\nPORT=3000', enPlus.join('\n') + '\nPORT=3000');
}

/**
 * Le magasin des renouvellements de session : l'empreinte de chaque jeton, jamais le jeton, en
 * mémoire ou dans PostgreSQL. Le service de @astratra/security fait la rotation et révoque toute la
 * famille d'un jeton rejoué ; `plafonner` ajoute le plafond absolu depuis la connexion.
 */
const RENOUVELLEMENTS = `import type { RefreshTokenRecord, RefreshTokenStore } from '@astratra/security';
import type { PoolPostgres } from './stockage.js';

/**
 * Produit par Humalis. \`familyStartedAt\` : la connexion d'origine, recopiée à chaque rotation
 * (le ménage efface les vieilles lignes d'une famille, jamais la dernière).
 */
export type LigneRenouvellement = RefreshTokenRecord & { familyStartedAt?: number };

export interface MagasinRenouvellements extends RefreshTokenStore {
  debutDeFamille(familyId: string): Promise<number | null>;
}

/** Perdu à l'arrêt du serveur : développement et tests seulement. */
export function creerMagasinMemoire(): MagasinRenouvellements {
  const lignes = new Map<string, LigneRenouvellement>();
  const deLaFamille = (familyId: string) => [...lignes.values()].filter((l) => l.familyId === familyId);
  return {
    async save(ligne) {
      lignes.set(ligne.id, { ...ligne });
    },
    async findByHash(hash) {
      const ligne = [...lignes.values()].find((l) => l.hash === hash);
      return ligne ? { ...ligne } : null;
    },
    async markConsumed(id, at) {
      const ligne = lignes.get(id);
      if (ligne) ligne.consumedAt = at;
    },
    async revokeFamily(familyId, at) {
      for (const ligne of deLaFamille(familyId)) ligne.revokedAt ??= at;
    },
    async revokeAllForUser(userId, at) {
      for (const ligne of lignes.values()) if (ligne.userId === userId) ligne.revokedAt ??= at;
    },
    async deleteExpired(before) {
      let retirees = 0;
      for (const [id, ligne] of lignes) {
        if (ligne.expiresAt <= before) retirees += Number(lignes.delete(id));
      }
      return retirees;
    },
    async debutDeFamille(familyId) {
      const debuts = deLaFamille(familyId).map((l) => l.familyStartedAt ?? l.createdAt);
      return debuts.length > 0 ? Math.min(...debuts) : null;
    },
  };
}

/** Requêtes paramétrées ; un redémarrage du serveur ne déconnecte personne. */
export function creerMagasinPostgres(pool: PoolPostgres): MagasinRenouvellements {
  let prete: Promise<unknown> | undefined;
  const preparer = () =>
    (prete ??= pool
      .query(
        'CREATE TABLE IF NOT EXISTS sessions_renouvellement (id TEXT PRIMARY KEY, famille TEXT NOT NULL, utilisateur TEXT NOT NULL, empreinte TEXT NOT NULL UNIQUE, cree_le BIGINT NOT NULL, debut BIGINT NOT NULL, expire_le BIGINT NOT NULL, consomme_le BIGINT, revoque_le BIGINT);' +
          ' CREATE INDEX IF NOT EXISTS sessions_renouvellement_famille ON sessions_renouvellement (famille);' +
          ' CREATE INDEX IF NOT EXISTS sessions_renouvellement_utilisateur ON sessions_renouvellement (utilisateur);',
      )
      .catch((erreur: unknown) => {
        // La base revient : on réessaiera au prochain appel.
        prete = undefined;
        throw erreur;
      }));
  const nombre = (valeur: unknown) => (valeur === null || valeur === undefined ? null : Number(valeur));
  const lire = (l: Record<string, unknown>): LigneRenouvellement => ({
    id: String(l.id),
    familyId: String(l.famille),
    userId: String(l.utilisateur),
    hash: String(l.empreinte),
    createdAt: Number(l.cree_le),
    familyStartedAt: Number(l.debut),
    expiresAt: Number(l.expire_le),
    consumedAt: nombre(l.consomme_le),
    revokedAt: nombre(l.revoque_le),
  });
  return {
    async save(ligne) {
      await preparer();
      const l = ligne as LigneRenouvellement;
      await pool.query(
        'INSERT INTO sessions_renouvellement (id, famille, utilisateur, empreinte, cree_le, debut, expire_le, consomme_le, revoque_le) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [l.id, l.familyId, l.userId, l.hash, l.createdAt, l.familyStartedAt ?? l.createdAt, l.expiresAt, l.consumedAt, l.revokedAt],
      );
    },
    async findByHash(hash) {
      await preparer();
      const { rows } = await pool.query('SELECT * FROM sessions_renouvellement WHERE empreinte = $1', [hash]);
      return rows[0] ? lire(rows[0]) : null;
    },
    async markConsumed(id, at) {
      await preparer();
      await pool.query('UPDATE sessions_renouvellement SET consomme_le = $2 WHERE id = $1', [id, at]);
    },
    async revokeFamily(familyId, at) {
      await preparer();
      await pool.query('UPDATE sessions_renouvellement SET revoque_le = COALESCE(revoque_le, $2) WHERE famille = $1', [familyId, at]);
    },
    async revokeAllForUser(userId, at) {
      await preparer();
      await pool.query('UPDATE sessions_renouvellement SET revoque_le = COALESCE(revoque_le, $2) WHERE utilisateur = $1', [userId, at]);
    },
    async deleteExpired(before) {
      await preparer();
      const resultat = await pool.query('DELETE FROM sessions_renouvellement WHERE expire_le <= $1', [before]);
      return resultat.rowCount ?? 0;
    },
    async debutDeFamille(familyId) {
      await preparer();
      const { rows } = await pool.query('SELECT MIN(debut) AS debut FROM sessions_renouvellement WHERE famille = $1', [familyId]);
      return nombre(rows[0]?.debut);
    },
  };
}

/**
 * La borne que seul le serveur vérifie : un jeton renouvelé n'expire jamais après connexion + maximum,
 * même si la personne revient chaque jour.
 *
 * Deux onglets qui renouvellent au même instant présentent le même jeton : le service y verrait
 * un vol et fermerait la session. Pendant \`graceMs\`, un jeton déjà utilisé reste donc accepté ;
 * passé ce délai, le rejeu révoque toute la famille.
 */
export function plafonner(
  magasin: MagasinRenouvellements,
  { maximumMs, horloge = Date.now, graceMs = 10_000 }: { maximumMs: number; horloge?: () => number; graceMs?: number },
): RefreshTokenStore {
  const dejaConsommes = new Set<string>();
  return {
    ...magasin,
    async save(ligne) {
      const debut = (await magasin.debutDeFamille(ligne.familyId)) ?? ligne.createdAt;
      const bornee: LigneRenouvellement = { ...ligne, familyStartedAt: debut, expiresAt: Math.min(ligne.expiresAt, debut + maximumMs) };
      return magasin.save(bornee);
    },
    async findByHash(hash) {
      const ligne = await magasin.findByHash(hash);
      if (ligne?.consumedAt && !ligne.revokedAt && horloge() - ligne.consumedAt <= graceMs) {
        dejaConsommes.add(ligne.id);
        return { ...ligne, consumedAt: null };
      }
      return ligne;
    },
    async markConsumed(id, at) {
      // Le délai de grâce compte depuis le premier usage : il ne s'allonge pas à chaque rejeu.
      if (!dejaConsommes.delete(id)) await magasin.markConsumed(id, at);
    },
  };
}
`;

/**
 * La session glissante : un jeton d'accès court (cookie HttpOnly du pack) et un jeton de
 * renouvellement dans un autre cookie HttpOnly, limité à /auth. Le navigateur ne le voit jamais ;
 * le téléphone, qui n'a pas de cookie sûr, le garde dans son coffre.
 */
const SESSIONS = `import { clearSessionCookie, createRefreshTokenService, parseCookieHeader, setSessionCookie, type RefreshTokenService } from '@astratra/security';
import type { RequestHandler } from 'express';
import { creerMagasinMemoire, plafonner, type MagasinRenouvellements } from './renouvellements.js';

/** Produit par Humalis. Le jeton d'accès est court : c'est lui qui limite les dégâts d'un vol. */
const DUREE_JETON = '15m';
const COOKIE = { name: 'humalis_renouvellement', path: '/auth' };
const UNITES: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export interface ReglagesSession {
  /** La durée du jeton d'accès (« 15m »). */
  jeton: string;
  /** Sans venir pendant ce temps, il faut se reconnecter. */
  dureeMs: number;
  /** Depuis la connexion, jamais plus que ce temps. */
  maximumMs: number;
  magasin: MagasinRenouvellements;
  horloge?: () => number;
}

/** « 3d », « 12h », « 45m » : refuse le reste, avec une phrase qui dit quoi écrire. */
export function lireDuree(valeur: string | undefined, defaut: string, nom: string): number {
  const texte = valeur?.trim() || defaut;
  const morceaux = /^(\\d+)([smhd])$/.exec(texte);
  if (!morceaux || Number(morceaux[1]) === 0) throw new Error(nom + ' doit être une durée comme 3d, 12h ou 45m.');
  return Number(morceaux[1]) * UNITES[morceaux[2]];
}

export function reglagesDeSession(env: Record<string, string | undefined>, magasin: MagasinRenouvellements = creerMagasinMemoire()): ReglagesSession {
  return {
    jeton: DUREE_JETON,
    dureeMs: lireDuree(env.HUMALIS_SESSION, '3d', 'HUMALIS_SESSION'),
    maximumMs: lireDuree(env.HUMALIS_SESSION_MAX, '30d', 'HUMALIS_SESSION_MAX'),
    magasin,
  };
}

export function creerRenouvellement({ magasin, dureeMs, maximumMs, horloge }: ReglagesSession): RefreshTokenService {
  const service = createRefreshTokenService({
    store: plafonner(magasin, { maximumMs, horloge }),
    ttlMs: dureeMs,
    ...(horloge ? { now: horloge } : {}),
  });
  // Le ménage : les jetons expirés quittent la table. Cette minuterie ne retient jamais le serveur.
  setInterval(() => void service.prune().catch(() => {}), 6 * 3_600_000).unref();
  return service;
}

const CHEMINS = new Set(['/auth/login', '/auth/refresh', '/auth/logout', '/auth/google', '/auth/mot-de-passe']);

/**
 * Autour des routes de session du pack : le jeton de renouvellement part dans le cookie HttpOnly et
 * disparaît de la réponse. Seul un téléphone (x-humalis-mobile) le reçoit en JSON à la connexion ;
 * un jeton venu d'un cookie ne ressort jamais en JSON, quel que soit l'en-tête : une page piégée ne peut pas le lire.
 */
export function renouvellementEnCookie(dureeMs: number): RequestHandler {
  const reglages = { ...COOKIE, maxAgeMs: dureeMs };
  return (req, res, next) => {
    if (req.method !== 'POST' || !CHEMINS.has(req.path)) {
      next();
      return;
    }
    const recu = parseCookieHeader(req.headers.cookie)[COOKIE.name];
    // Lus tout de suite : plus loin, les routeurs du pack raccourcissent req.path.
    const renouveler = req.path === '/auth/refresh';
    const sortie = req.path === '/auth/logout';
    if (renouveler && recu) {
      req.body = { refreshToken: recu };
      (req as unknown as { _body: boolean })._body = true;
    }
    const parCookie = renouveler ? Boolean(recu) : req.headers['x-humalis-mobile'] !== '1';
    const repondre = res.json.bind(res);
    res.json = ((corps: unknown) => repondre(parCookie ? sansJeton(corps, (jeton) => setSessionCookie(res, jeton, reglages)) : corps)) as typeof res.json;
    // Déconnecté, ou renouvellement refusé : le cookie s'en va, juste avant que les en-têtes partent.
    const finir = res.end.bind(res) as (...valeurs: unknown[]) => typeof res;
    res.end = ((...valeurs: unknown[]) => {
      const fermee = sortie ? res.statusCode < 300 : renouveler && res.statusCode === 401;
      if (fermee && !res.headersSent) clearSessionCookie(res, reglages);
      return finir(...valeurs);
    }) as typeof res.end;
    next();
  };
}

/** La réponse sans son jeton de renouvellement (à la racine, ou dans « data » pour les routes du pack). */
function sansJeton(corps: unknown, poser: (jeton: string) => void): unknown {
  if (typeof corps !== 'object' || corps === null) return corps;
  const { refreshToken, ...reste } = corps as Record<string, unknown>;
  if (typeof refreshToken === 'string') {
    poser(refreshToken);
    return reste;
  }
  return 'data' in reste ? { ...reste, data: sansJeton(reste.data, poser) } : corps;
}
`;

/** La surveillance : rien n'est chargé sans ses deux variables. */
const CENTRALE = `import type { RequeteTransport, ReponseTransport } from '@astratra/centrale';
import type { ErrorRequestHandler, RequestHandler } from 'express';

/** Produit par Humalis : ce que le serveur monte quand la surveillance est allumée. */
export interface Surveillance {
  intergiciel(): RequestHandler;
  gestionnaireErreurs(): ErrorRequestHandler;
  /** Envoie ce qui reste en file ; ne rejette jamais. */
  vider(): Promise<void>;
}

const ENVIRONNEMENTS = ['production', 'preproduction', 'developpement'] as const;
const IDENTIFIANTS = /\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\b/gi;

/**
 * Ce qui part à la place d'une panne. Le paquet masque déjà e-mails, téléphones, cartes, clés et
 * jetons, mais PostgreSQL cite les valeurs refusées : son erreur ne garde que son code, et les
 * identifiants quittent les autres messages.
 */
export function assainir(erreur: unknown): unknown {
  if (typeof erreur !== 'object' || erreur === null) return erreur;
  const e = erreur as Error & { severity?: unknown; code?: unknown };
  const copie = (message: string) => {
    const nouvelle = new Error(message);
    nouvelle.name = e.name;
    nouvelle.stack = [e.name + ': ' + message, ...String(e.stack ?? '').split('\\n').filter((l) => /^\\s+at /.test(l))].join('\\n');
    return nouvelle;
  };
  if (typeof e.severity === 'string') return copie('Erreur PostgreSQL ' + String(e.code ?? ''));
  const message = String(e.message ?? '');
  const propre = message.replace(IDENTIFIANTS, ':id');
  return propre === message ? erreur : copie(propre);
}

/** Le statut que rendra la réponse, comme le fait le gestionnaire du paquet. */
function statutDe(erreur: unknown, code: number): number {
  const declare = Number((erreur as { status?: unknown; statusCode?: unknown } | null)?.status ?? (erreur as { statusCode?: unknown } | null)?.statusCode);
  return Number.isInteger(declare) && declare >= 400 && declare < 600 ? declare : code >= 400 ? code : 500;
}

/** Sans CENTRALE_ADRESSE et CENTRALE_CLE : le paquet n'est pas chargé, aucun écouteur, aucune minuterie, aucun réseau. */
export async function demarrerCentrale(env: Record<string, string | undefined> = process.env, transport?: (requete: RequeteTransport) => Promise<ReponseTransport>): Promise<Surveillance | null> {
  const adresse = env.CENTRALE_ADRESSE?.trim();
  const cle = env.CENTRALE_CLE?.trim();
  if (!adresse || !cle) return null;
  try {
    const { demarrer } = await import('@astratra/centrale/node');
    const demande = ENVIRONNEMENTS.find((e) => e === env.CENTRALE_ENVIRONNEMENT?.trim());
    // Strict : ni utilisateur, ni appareil précis. Jamais de corps, d'en-tête ni de cookie.
    const centrale = demarrer({ cle, adresse, environnement: demande ?? (env.NODE_ENV === 'production' ? 'production' : 'developpement'), strict: true }, transport);
    return {
      vider: () => centrale.vider(),
      intergiciel: () => centrale.intergiciel() as unknown as RequestHandler,
      gestionnaireErreurs: () => {
        const signaler = centrale.gestionnaireErreurs() as unknown as ErrorRequestHandler;
        return (erreur, req, res, next) => {
          // Un refus ordinaire (400, 401…) n'est pas une panne, et son message peut citer le corps reçu.
          if (statutDe(erreur, res.statusCode) < 500) next(erreur);
          else signaler(assainir(erreur), req, res, () => next(erreur));
        };
      },
    };
  } catch {
    console.warn('La surveillance n\\'a pas démarré : le serveur continue sans elle.');
    return null;
  }
}
`;

/** Les clés que l'admin peut gérer : celles que ce serveur lit vraiment. Une ligne de plus suffira pour l'e-mail. */
function coffreTs(serveur: ServeurRI): string {
  const clesGoogle = serveur.connexionGoogle
    ? `      {
        key: 'GOOGLE_CLIENT_ID',
        label: 'Connexion avec Google',
        help: "L'ID client OAuth de l'application Web. Sans lui, la connexion avec Google reste fermée.",
        where: 'Google Cloud Console, API et services, Identifiants',
      },
`
    : '';
  const cles = clesGoogle + (serveur.emails ? CLES_BREVO : '');
  return `import type { RequestHandler, Router } from 'express';
import type { PoolPostgres } from './stockage.js';

/**
 * Produit par Humalis : le coffre des clés de service (@astratra/credentials). Les valeurs sont
 * chiffrées avant d'arriver ici : ce magasin ne voit jamais un secret en clair, et process.env
 * reste à jour sans redémarrer. Sans valeur dans le coffre, le .env sert, comme avant.
 */
export interface LigneCle {
  key: string;
  value: string;
  secret: boolean;
  updatedAt?: Date | string | number | null;
  updatedBy?: string | null;
}

/** Une ligne par clé, avec des requêtes paramétrées, comme creerStockagePostgres. */
export function creerMagasinCles(pool: PoolPostgres) {
  let prete: Promise<unknown> | undefined;
  const preparer = () =>
    (prete ??= pool
      .query('CREATE TABLE IF NOT EXISTS coffre_cles (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL, secret BOOLEAN NOT NULL, modifie_le TIMESTAMPTZ NOT NULL DEFAULT now(), modifie_par TEXT)')
      .catch((erreur: unknown) => {
        prete = undefined;
        throw erreur;
      }));
  return {
    async findAll(): Promise<LigneCle[]> {
      await preparer();
      const { rows } = await pool.query('SELECT cle, valeur, secret, modifie_le, modifie_par FROM coffre_cles');
      return rows.map((l) => ({ key: String(l.cle), value: String(l.valeur), secret: l.secret === true, updatedAt: l.modifie_le as Date, updatedBy: l.modifie_par === null ? null : String(l.modifie_par) }));
    },
    async upsert(ligne: LigneCle): Promise<void> {
      await preparer();
      await pool.query(
        'INSERT INTO coffre_cles (cle, valeur, secret, modifie_par) VALUES ($1, $2, $3, $4) ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, secret = EXCLUDED.secret, modifie_le = now(), modifie_par = EXCLUDED.modifie_par',
        [ligne.key, ligne.value, ligne.secret, ligne.updatedBy ?? null],
      );
    },
  };
}

const ESPACES: { id: string; label: string; keys: { key: string; label: string; help: string; where: string }[] }[] = [
  {
    id: 'services',
    label: 'Services',
    keys: [
${cles}    ],
  },
];

export interface Coffre {
  routes(garde: RequestHandler): Router;
}

/** Sans ENCRYPTION_KEY : le coffre reste fermé, rien n'est chargé, et le .env sert seul. */
export async function ouvrirCoffre(pool: PoolPostgres | null, env: NodeJS.ProcessEnv = process.env): Promise<Coffre | null> {
  const noms = ESPACES.flatMap((espace) => espace.keys.map((cle) => cle.key));
  if (noms.length === 0) return null;
  const cle = env.ENCRYPTION_KEY?.trim();
  if (!cle) {
    console.log('Coffre des clés fermé : ENCRYPTION_KEY n\\'est pas réglée (voir .env.exemple). Le .env sert seul.');
    return null;
  }
  const { createFieldCipher } = await import('@astratra/security');
  const { createCredentialCatalog, createCredentialsRoutes, createCredentialVault, createEnvHydrator, createMemoryCredentialStore } = await import('@astratra/credentials');
  let cipher: ReturnType<typeof createFieldCipher>;
  try {
    cipher = createFieldCipher({ key: cle });
  } catch {
    console.error('Coffre des clés fermé : ENCRYPTION_KEY doit faire 32 octets, en base64 ou en hexadécimal (openssl rand -base64 32).');
    return null;
  }
  const catalog = createCredentialCatalog({
    spaces: ESPACES,
    // La serrure ne se range pas dans le coffre qu'elle ferme.
    reservedKeys: ['ENCRYPTION_KEY', 'JWT_SECRET', 'DATABASE_URL', 'HUMALIS_ADMIN_MOT_DE_PASSE'],
  });
  const store = pool ? creerMagasinCles(pool) : createMemoryCredentialStore();
  const vault = createCredentialVault({
    store: store as Parameters<typeof createCredentialVault>[0]['store'],
    catalog,
    cipher,
    env,
    // Une clé enregistrée sert tout de suite, pas à la minute suivante.
    onChange: async () => {
      await hydrator.hydrate(noms);
    },
  });
  const hydrator = createEnvHydrator({ vault, env });
  await hydrator.hydrate(noms);
  hydrator.startRefresh(noms, { intervalMs: 60_000 });
  console.log('Coffre des clés ouvert (/auth/cles, réservé à l\\'admin).');
  return { routes: (garde) => createCredentialsRoutes({ vault, authorize: garde as never }) as unknown as Router };
}
`;
}

const VERIFIER = `/**
 * Produit par Humalis : la vérification de la forme des données reçues.
 * Ce n'est pas de la sécurité (elle vient des packs Astratra) : c'est
 * la description des champs, que seul le programme connaît.
 */
import type { Filtres } from './stockage.js';

export type TypeChamp = 'texte' | 'nombre' | 'booleen' | 'date' | 'image' | { liste: TypeChamp };
export type Schema = Record<string, TypeChamp>;

const NOMS: Record<string, string> = {
  texte: 'un texte',
  nombre: 'un nombre',
  booleen: 'vrai ou faux (true ou false)',
  date: 'une date (par exemple 2026-01-31)',
  image: 'une image PNG, JPEG ou WebP de moins de 70 Ko (choisie dans la page), une adresse https://…, ou vide',
};

/** Une image reçue : réduite par la page, gardée telle quelle (data:…;base64), ou l'adresse d'une image en ligne. */
const IMAGE = /^data:image\\/(png|jpeg|webp);base64,[A-Za-z0-9+\\/]+=*$/;
const TAILLE_IMAGE = 95_000;

function conforme(type: TypeChamp, valeur: unknown): boolean {
  if (typeof type === 'object') return Array.isArray(valeur) && valeur.every((v) => conforme(type.liste, v));
  if (type === 'texte') return typeof valeur === 'string';
  if (type === 'image') {
    // Pas de photo choisie : la page envoie null, gardé comme un champ vide.
    if (valeur === null) return true;
    if (typeof valeur !== 'string') return false;
    return valeur === '' || /^https:\\/\\/[^\\s"<>]+$/.test(valeur) || (valeur.length <= TAILLE_IMAGE && IMAGE.test(valeur));
  }
  if (type === 'nombre') return typeof valeur === 'number' && Number.isFinite(valeur);
  if (type === 'booleen') return typeof valeur === 'boolean';
  return typeof valeur === 'string' && !Number.isNaN(Date.parse(valeur));
}

const decrire = (type: TypeChamp): string =>
  typeof type === 'object' ? \`une liste dont chaque élément est \${decrire(type.liste)}\` : NOMS[type];

/** « du site » : un chemin de ce site, son adresse (HUMALIS_ADRESSE_SITE), une image choisie dans la page, ou rien. */
export function estDuSite(valeur: unknown, adresseDuSite = process.env.HUMALIS_ADRESSE_SITE): boolean {
  if (Array.isArray(valeur)) return valeur.every((v) => estDuSite(v, adresseDuSite));
  if (valeur === null || valeur === '') return true;
  if (typeof valeur !== 'string' || /[\\s"<>\\\\]/.test(valeur)) return false;
  if (/^\\/(?!\\/)/.test(valeur)) return true;
  if (valeur.length <= TAILLE_IMAGE && IMAGE.test(valeur)) return true;
  const site = (adresseDuSite ?? '').trim().replace(/\\/+$/, '');
  return site !== '' && valeur.startsWith(site + '/');
}

/** « calcule somme prix de produit par refs » : le prix relu pour chaque identifiant ; un texte dit ce qui ne va pas. */
export async function sommeDesPrix(stockage: { trouver(id: string): Promise<Record<string, unknown> | null> }, liste: unknown, champ: string): Promise<number | string> {
  const ids = Array.isArray(liste) ? liste.map(String) : [];
  const differents = new Set(ids);
  if (differents.size > 200) return 'la liste est trop longue';
  const prix = new Map<string, number>();
  for (const id of differents) {
    const fiche = await stockage.trouver(id);
    if (!fiche) return \`« \${id} » n'existe pas\`;
    prix.set(id, Number(fiche[champ]) || 0);
  }
  return ids.reduce((total, id) => total + prix.get(id)!, 0);
}

/** « au plus prix de zone par commune » : le prix de la fiche dont le champ est égal ; 0 si aucune, ce qui laisse passer 0. */
export async function plafondDe(stockage: { lister(filtres: Filtres): Promise<Record<string, unknown>[]> }, par: string, valeur: unknown, champ: string): Promise<number> {
  if (typeof valeur !== 'string' && typeof valeur !== 'number') return 0;
  const [fiche] = await stockage.lister({ egal: { [par]: valeur } });
  return fiche ? Number(fiche[champ]) || 0 : 0;
}

/**
 * \`complet\` : à la création, chaque champ est obligatoire ; à la
 * modification, seuls les champs envoyés sont vérifiés.
 */
export function verifierEnvoi(
  schema: Schema,
  corps: unknown,
  complet: boolean,
  regles: { duServeur?: string[]; duSite?: string[]; nonVides?: string[] } = {},
): { valeur: Record<string, unknown> } | { erreur: string } {
  if (typeof corps !== 'object' || corps === null || Array.isArray(corps)) {
    return { erreur: 'les données envoyées doivent être un objet JSON' };
  }
  const champs = Object.keys(schema);
  for (const cle of Object.keys(corps)) {
    if (cle === 'id') return { erreur: "l'identifiant est donné par le serveur : ne l'envoie pas" };
    if (complet && regles.duServeur?.includes(cle)) return { erreur: \`le champ « \${cle} » est donné par le serveur : ne l'envoie pas\` };
    if (!(cle in schema)) return { erreur: \`le champ « \${cle} » n'existe pas. Champs : \${champs.join(', ')}\` };
  }
  const valeur: Record<string, unknown> = {};
  for (const champ of champs) {
    const recu = (corps as Record<string, unknown>)[champ];
    if (recu === undefined) {
      if (complet && !regles.duServeur?.includes(champ)) return { erreur: \`le champ « \${champ} » manque\` };
      continue;
    }
    // Une image « du site » peut aussi être un chemin de ce site (/images/photo.jpg), en plus de ce qu'accepte une image.
    const chemin = schema[champ] === 'image' && regles.duSite?.includes(champ) && estDuSite(recu);
    if (!chemin && !conforme(schema[champ], recu)) return { erreur: \`le champ « \${champ} » doit être \${decrire(schema[champ])}\` };
    if (regles.nonVides?.includes(champ) && (Array.isArray(recu) ? recu.length === 0 : typeof recu === 'string' && recu.trim() === '')) {
      return { erreur: \`le champ « \${champ} » ne doit pas être vide\` };
    }
    if (regles.duSite?.includes(champ) && !estDuSite(recu)) return { erreur: \`le champ « \${champ} » doit être une adresse de ce site (/images/photo.jpg)\` };
    valeur[champ] = recu;
  }
  return { valeur };
}

/** Le texte d'un paramètre d'adresse, s'il n'y en a qu'un. */
const seul = (valeur: unknown): string | undefined => (typeof valeur === 'string' ? valeur : undefined);

/** Un entier positif (ou nul) écrit dans l'adresse ; sinon rien. */
function entier(valeur: unknown): number | undefined {
  const texte = seul(valeur);
  return texte !== undefined && /^\\d{1,9}$/.test(texte) ? Number(texte) : undefined;
}

/**
 * Les filtres d'une lecture de liste : « GET /api/photos?produit=abc » ne
 * renvoie que les photos de ce produit. Seuls les champs de la donnée (texte,
 * nombre, vrai ou faux, date) comptent, comparés par égalité ; une autre clé
 * est ignorée. Une valeur qui ne peut pas être celle du champ (« ?prix=abc »)
 * ne trouve rien : la réponse est \`null\`. « limite » et « depuis » découpent
 * la liste (« ?limite=20&depuis=40 »), sauf si la donnée a un champ de ce nom.
 */
export function lireFiltres(schema: Schema, requete: Record<string, unknown>): Filtres | null {
  const filtres: Filtres = { egal: {} };
  for (const [cle, brut] of Object.entries(requete)) {
    const type = Object.hasOwn(schema, cle) ? schema[cle] : undefined;
    if (type === undefined) {
      if (cle === 'limite') filtres.limite = entier(brut);
      if (cle === 'depuis') filtres.depuis = entier(brut);
      continue;
    }
    // Une image ou une liste ne se compare pas dans une adresse.
    if (typeof type === 'object' || type === 'image') continue;
    const texte = seul(brut);
    if (texte === undefined) return null;
    if (type === 'nombre') {
      const nombre = texte.trim() === '' ? Number.NaN : Number(texte);
      if (!Number.isFinite(nombre)) return null;
      filtres.egal[cle] = nombre;
    } else if (type === 'booleen') {
      if (!['true', 'false', 'vrai', 'faux'].includes(texte)) return null;
      filtres.egal[cle] = texte === 'true' || texte === 'vrai';
    } else {
      filtres.egal[cle] = texte;
    }
  }
  return filtres;
}
`;

const COMPRESSER = `import type { RequestHandler } from 'express';
import { brotliCompress, constants, gzip } from 'node:zlib';

/**
 * Produit par Humalis : les réponses compressées (brotli, sinon gzip), avec
 * le zlib de Node, sans dépendance. Une réponse envoyée d'un coup (res.json)
 * de plus de 1 Ko, d'un type texte, l'est ; un flux (res.write, événements
 * du serveur) part tel quel, sans attendre. La compression se fait hors du
 * fil principal : le serveur continue de répondre aux autres pendant ce temps.
 */
const MINIMUM = 1024;
const COMPRESSIBLE = /^(text\\/|application\\/([\\w.+-]*\\+)?(json|javascript|xml)\\b|image\\/svg\\+xml)/i;

/** « br;q=0 » refuse brotli : seul un codage accepté avec un poids positif compte. */
function accepte(entete: string, codage: string): boolean {
  return entete.split(',').some((partie) => {
    const [nom, ...reglages] = partie.trim().toLowerCase().split(';');
    const poids = reglages.map((r) => r.trim()).find((r) => r.startsWith('q='));
    return (nom === codage || nom === '*') && (poids === undefined || Number(poids.slice(2)) > 0);
  });
}

type Fin = (corps?: unknown, codage?: unknown, rappel?: unknown) => unknown;

export const compresser: RequestHandler = (req, res, next) => {
  const entete = String(req.headers['accept-encoding'] ?? '');
  const codage = accepte(entete, 'br') ? 'br' : accepte(entete, 'gzip') ? 'gzip' : undefined;
  // La réponse dépend de ce que le navigateur accepte : un relais garde les deux versions.
  res.vary('Accept-Encoding');
  if (codage === undefined || req.method === 'HEAD') {
    next();
    return;
  }
  const ecrire = res.write.bind(res) as (...valeurs: unknown[]) => boolean;
  const finir = res.end.bind(res) as Fin;
  let enFlux = false;
  res.write = ((...valeurs: unknown[]) => {
    enFlux = true;
    return ecrire(...valeurs);
  }) as typeof res.write;
  res.end = ((corps?: unknown, codageDuCorps?: unknown, rappel?: unknown) => {
    const type = String(res.getHeader('Content-Type') ?? '');
    const garde =
      enFlux ||
      res.headersSent ||
      (typeof corps !== 'string' && !Buffer.isBuffer(corps)) ||
      res.statusCode === 204 ||
      res.statusCode === 304 ||
      res.getHeader('Content-Encoding') !== undefined ||
      /no-transform/.test(String(res.getHeader('Cache-Control') ?? '')) ||
      !COMPRESSIBLE.test(type);
    if (garde) return finir(corps, codageDuCorps, rappel);
    const brut = Buffer.isBuffer(corps) ? corps : Buffer.from(corps as string, typeof codageDuCorps === 'string' ? (codageDuCorps as BufferEncoding) : 'utf8');
    if (brut.length < MINIMUM) return finir(corps, codageDuCorps, rappel);
    const fin = typeof codageDuCorps === 'function' ? codageDuCorps : rappel;
    const envoyer = (erreur: Error | null, compresse: Buffer) => {
      // Une compression ratée : la réponse part telle quelle, jamais perdue.
      if (erreur) {
        finir(brut, fin);
        return;
      }
      res.setHeader('Content-Encoding', codage);
      res.setHeader('Content-Length', compresse.length);
      finir(compresse, fin);
    };
    if (codage === 'br') {
      // Qualité 5 : presque aussi petit que le maximum, beaucoup plus rapide (le maximum, 11, est fait pour les fichiers figés).
      brotliCompress(brut, { params: { [constants.BROTLI_PARAM_QUALITY]: 5, [constants.BROTLI_PARAM_SIZE_HINT]: brut.length } }, envoyer);
    } else {
      gzip(brut, { level: 6 }, envoyer);
    }
    return res;
  }) as typeof res.end;
  next();
};
`;

const STOCKAGE = `import { randomUUID } from 'node:crypto';

/**
 * Produit par Humalis : le stockage des données de l'application, en
 * mémoire (développement, tests) ou dans PostgreSQL. Il suit le modèle de
 * createPostgresUsersStore (@astratra/store-postgres) : une table par
 * donnée, l'objet complet dans une colonne JSONB, et uniquement des
 * requêtes paramétrées.
 */
export interface Enregistrement {
  id: string;
  [champ: string]: unknown;
}

/** « ?produit=abc&limite=20&depuis=40 » : les champs égaux à ces valeurs, puis une tranche de la liste. */
export interface Filtres {
  egal: Record<string, string | number | boolean>;
  limite?: number;
  depuis?: number;
  /** Ce champ, sans espaces, tirets ni « + », vaut cette valeur : « +243 848 » et « 243848 » désignent le même numéro. */
  numero?: { champ: string; valeur: string };
}

/** Un numéro sans ses séparateurs, pour comparer deux écritures du même numéro. */
export const sansSeparateurs = (valeur: unknown): string => (typeof valeur === 'string' ? valeur.replace(/[\\s+-]/g, '') : '');

/** La tranche demandée d'une liste déjà filtrée. */
function trancher<T>(liste: T[], filtres?: Filtres): T[] {
  const debut = filtres?.depuis ?? 0;
  return filtres?.limite === undefined ? liste.slice(debut) : liste.slice(debut, debut + filtres.limite);
}

export interface Stockage {
  lister(filtres?: Filtres): Promise<Enregistrement[]>;
  /** « pourEcrire » : dans une transaction, la fiche reste à celui qui la lit jusqu'à la fin. */
  trouver(id: string, pourEcrire?: boolean): Promise<Enregistrement | null>;
  /** En mémoire seulement : une photo des données, et de quoi y revenir. */
  instantane?(): () => void;
  creer(valeurs: Record<string, unknown>): Promise<Enregistrement>;
  modifier(id: string, valeurs: Record<string, unknown>): Promise<Enregistrement | null>;
  supprimer(id: string): Promise<boolean>;
}

/** Les données sont perdues à l'arrêt du serveur : développement et tests seulement. */
export function creerStockageMemoire(): Stockage {
  const lignes = new Map<string, Enregistrement>();
  return {
    async lister(filtres) {
      const egal = Object.entries(filtres?.egal ?? {});
      const numero = filtres?.numero;
      return trancher(
        [...lignes.values()].filter((ligne) => egal.every(([champ, valeur]) => ligne[champ] === valeur) && (!numero || sansSeparateurs(ligne[numero.champ]) === numero.valeur)),
        filtres,
      );
    },
    async trouver(id) {
      return lignes.get(id) ?? null;
    },
    instantane() {
      const photo = new Map([...lignes].map(([id, ligne]) => [id, { ...ligne }]));
      return () => {
        lignes.clear();
        for (const [id, ligne] of photo) lignes.set(id, ligne);
      };
    },
    async creer(valeurs) {
      const enregistrement = { ...valeurs, id: randomUUID() };
      lignes.set(enregistrement.id, enregistrement);
      return enregistrement;
    },
    async modifier(id, valeurs) {
      const actuel = lignes.get(id);
      if (!actuel) return null;
      const nouveau = { ...actuel, ...valeurs, id };
      lignes.set(id, nouveau);
      return nouveau;
    },
    async supprimer(id) {
      return lignes.delete(id);
    },
  };
}

/** Les séparateurs d'un numéro, pour PostgreSQL : les mêmes que sansSeparateurs. */
const SEPARATEURS = '[[:space:]\\\\u00a0\\\\u2000-\\\\u200a\\\\u202f\\\\u205f\\\\u3000+-]';

/** Ce que le stockage attend d'un Pool de \`pg\`. */
export interface PoolPostgres {
  query(texte: string, valeurs?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
}

export function creerStockagePostgres(pool: PoolPostgres, table: string): Stockage {
  // Le nom de la table est fixé par le compilateur ; on le vérifie quand même.
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(\`nom de table invalide : \${table}\`);
  let prete: Promise<unknown> | undefined;
  const preparer = () =>
    (prete ??= pool.query(
      \`CREATE TABLE IF NOT EXISTS \${table} (id TEXT PRIMARY KEY, data JSONB NOT NULL, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())\`,
    ));
  const lire = (ligne: Record<string, unknown>): Enregistrement => ({ ...(ligne.data as object), id: String(ligne.id) });

  return {
    async lister(filtres) {
      await preparer();
      // « data @> {...} » : l'objet contient ces champs avec ces valeurs exactes (texte, nombre, vrai ou faux).
      const valeurs: unknown[] = [];
      const conditions: string[] = [];
      if (filtres && Object.keys(filtres.egal).length > 0) {
        valeurs.push(JSON.stringify(filtres.egal));
        conditions.push(\`data @> $\${valeurs.length}::jsonb\`);
      }
      if (filtres?.numero) {
        // La même comparaison que sansSeparateurs, faite par la base : seules les bonnes lignes reviennent.
        valeurs.push(filtres.numero.champ, SEPARATEURS, filtres.numero.valeur);
        conditions.push(\`regexp_replace(data->>$\${valeurs.length - 2}, $\${valeurs.length - 1}, '', 'g') = $\${valeurs.length}\`);
      }
      let texte = \`SELECT id, data FROM \${table}\`;
      if (conditions.length > 0) texte += \` WHERE \${conditions.join(' AND ')}\`;
      texte += ' ORDER BY cree_le';
      if (filtres?.limite !== undefined) {
        valeurs.push(filtres.limite);
        texte += \` LIMIT $\${valeurs.length}\`;
      }
      if (filtres?.depuis !== undefined) {
        valeurs.push(filtres.depuis);
        texte += \` OFFSET $\${valeurs.length}\`;
      }
      return (await pool.query(texte, valeurs)).rows.map(lire);
    },
    async trouver(id, pourEcrire) {
      await preparer();
      const { rows } = await pool.query(\`SELECT id, data FROM \${table} WHERE id = $1\${pourEcrire ? ' FOR UPDATE' : ''}\`, [id]);
      return rows[0] ? lire(rows[0]) : null;
    },
    async creer(valeurs) {
      await preparer();
      const id = randomUUID();
      await pool.query(\`INSERT INTO \${table} (id, data) VALUES ($1, $2)\`, [id, JSON.stringify(valeurs)]);
      return { ...valeurs, id };
    },
    async modifier(id, valeurs) {
      await preparer();
      const { rows } = await pool.query(\`UPDATE \${table} SET data = data || $2::jsonb WHERE id = $1 RETURNING id, data\`, [
        id,
        JSON.stringify(valeurs),
      ]);
      return rows[0] ? lire(rows[0]) : null;
    },
    async supprimer(id) {
      await preparer();
      const resultat = await pool.query(\`DELETE FROM \${table} WHERE id = $1\`, [id]);
      return (resultat.rowCount ?? 0) > 0;
    },
  };
}
`;

function donneesTs(serveur: ServeurRI): string {
  const blocs = serveur.donnees.map((d) => {
    const champs = d.champs.map((c) => `  ${camel(c.nom)}: ${typeTS(c.type)};`).join('\n');
    const schema = d.champs.map((c) => `  ${camel(c.nom)}: ${schemaChamp(c.type)},`).join('\n');
    return `/** La donnée « ${d.nom} ». */
export interface ${pascal(d.nom)} {
  id: string;
${champs}
}

export const SCHEMA_${simplifier(d.nom).toUpperCase()}: Schema = {
${schema}
};`;
  });
  return `// Produit par Humalis : les données du serveur « ${serveur.nom} ».
import type { Schema } from './humalis/verifier.js';

${blocs.join('\n\n')}
`;
}

/** Le rôle et les groupes viennent du compte relu : un changement compte tout de suite, sur chaque serveur. */
const COMPTE_RELU = `      const compteRelu: RequestHandler = async (req, res, next) => {
        try {
          const session = req as unknown as { user?: Record<string, unknown> };
          const compte = await usersStore.findById(String(session.user?.id));
          if (!compte) {
            res.status(401).json({ erreur: "ce compte n'existe plus" });
            return;
          }
          session.user = { ...compte, ...session.user, role: compte.role, id: String(compte.id) };
          next();
        } catch (erreur) {
          next(erreur);
        }
      };
`;

const GARDES: Record<'tout_le_monde' | 'connecte' | 'admin', string> = {
  tout_le_monde: 'toutLeMonde',
  connecte: 'connecte',
  admin: 'seulAdmin',
};

/** Les intergiciels d'accès d'un droit : un rôle déclaré passe par acces.roles, un admin passe toujours. */
export function gardeDe(qui: QuiPeut): string {
  return qui.startsWith('role:') ? `roles(${JSON.stringify(qui.slice(5).split(','))})` : GARDES[qui as keyof typeof GARDES];
}

function decrireDroits(droits: Record<Action, QuiPeut | null>): string {
  const qui = (q: QuiPeut | null) => (q === null ? 'personne' : q === 'tout_le_monde' ? 'tout le monde' : q === 'connecte' ? 'un utilisateur connecté' : q === 'admin' ? 'seul un admin' : `les rôles ${q.slice(5).split(',').join(', ')}`);
  return ACTIONS.map((a) => `${a} : ${qui(droits[a])}`).join(' ; ');
}

function serveurTs(serveur: ServeurRI, chemins?: Map<string, string>): string {
  const stockages = serveur.donnees.map((d) => `    ${camel(d.nom)}: Stockage;`).join('\n');
  const routes = serveur.routes
    .map((route) => {
      const donnee = camel(route.donnee);
      const schema = `SCHEMA_${simplifier(route.donnee).toUpperCase()}`;
      const variable = `route${pascal(route.adresse)}`;
      const donneeRoute = serveur.donnees.find((d) => d.nom === route.donnee)!;
      const separee = estSeparee(donneeRoute, route);
      // Une règle avec « si » regarde qui est connecté : la porte s'ouvre aux comptes, la fiche décide ensuite.
      const garde = (a: Action) => (route.droits[a] === null ? (conditionsDe(route, a).length ? '...acces.connecte' : 'refuse') : `...acces.${conditionsDe(route, a).length && route.droits[a] !== 'tout_le_monde' ? 'connecte' : gardeDe(route.droits[a]!)}`);
      const csrf = (a: Action) => (route.droits[a] === null && !conditionsDe(route, a).length ? '' : ', csrfMiddleware');
      const voir = (a: Action) => (separee ? codeFicheVisible(variable, donnee, route.donnee, a, donneeRoute.par) : '');
      // Ce que tout le monde peut lire se garde un peu (navigateur, relais) ; une lecture réservée, jamais.
      const cache = route.droits.lire === 'tout_le_monde' ? 'lecturePublique' : 'lecturePrivee';
      return `      // « ${route.adresse} » (ligne ${ligneLocale(route.ligne)}) — ${decrireDroits(route.droits)}.
      const ${variable} = express.Router();
${clesAnnoncees(serveur, route).length ? `      ${variable}.use(direct.apres(${JSON.stringify(clesAnnoncees(serveur, route))}));
` : ''}${separee ? constantesSeparation(variable, donneeRoute, route) : ''}${codeResumes(route, variable, separee)}${route.direct ? routeDirect(variable, garde('lire'), route.donnee, separee ? { separation: `separation${variable}`, regles: `regles${variable}.lire` } : undefined) : ''}      ${variable}.get('/', ${cache}, ${garde('lire')}, async (req, res, next) => {
        try {
${separee ? codePortee(variable, 'lire') : ''}          // « ?produit=… » : seulement ce qui est demandé, pas toute la liste.
          const filtres = lireFiltres(${schema}, req.query as Record<string, unknown>);
          res.json(filtres ? await ${separee ? `listerDans(stockages.${donnee}, filtres, portee)` : `stockages.${donnee}.lister(filtres)`} : []);
        } catch (erreur) {
          sansCache(res);
          next(erreur);
        }
      });
      ${variable}.get('/:id', ${route.droits.lireUn ? `lecturePrivee, ...acces.${gardeDe(route.droits.lireUn)}` : `${cache}, ${garde('lire')}`}, async (req, res, next) => {
        try {
${voir('lire')}          const trouve = ${separee ? 'visible' : `await stockages.${donnee}.trouver(req.params.id)`};
          if (trouve) res.json(trouve);
          else sansCache(res).status(404).json({ erreur: introuvable('${route.donnee}') });
        } catch (erreur) {
          sansCache(res);
          next(erreur);
        }
      });
${route.bon ? routeBon(variable, route, garde('lire'), schema, donnee, separee) : ''}      ${variable}.post('/', ${garde('creer')}${csrf('creer')}, async (req, res, next) => {
        try {
${codeCreation(serveur, route, donneeRoute, schema, [route.envois?.length ? codeEnvois(serveur, route) : '', codeNotificationsCreation(route)].filter(Boolean).join('\n'), separee ? variable : undefined)}
        } catch (erreur) {
          next(erreur);
        }
      });
      ${variable}.patch('/:id', ${garde('modifier')}${csrf('modifier')}, async (req, res, next) => {
        try {
${voir('modifier')}          const envoi = verifierEnvoi(${schema}, req.body, false${reglesEnvoi(donneeRoute, route)});
          if ('erreur' in envoi) {
            res.status(400).json({ erreur: envoi.erreur });
            return;
          }
          const modifie = await stockages.${donnee}.modifier(req.params.id, envoi.valeur);
          if (modifie) res.json(modifie);
          else res.status(404).json({ erreur: introuvable('${route.donnee}') });
        } catch (erreur) {
          next(erreur);
        }
      });
      ${variable}.delete('/:id', ${garde('supprimer')}${csrf('supprimer')}, async (req, res, next) => {
        try {
${voir('supprimer')}          if (await stockages.${donnee}.supprimer(req.params.id)) res.status(204).end();
          else res.status(404).json({ erreur: introuvable('${route.donnee}') });
        } catch (erreur) {
          next(erreur);
        }
      });
${codePaiements(route, variable, garde('lire'), voir('lire'), separee, donnee)}${codeDocuments(serveur, route, variable, garde('lire'), separee, voir('lire'))}${codeActions(serveur, route, variable)}      app.use('${adresseApi(route.adresse)}', ${variable});`;
    })
    .join('\n\n');
  const schemas = [...new Set(serveur.routes.map((r) => `SCHEMA_${simplifier(r.donnee).toUpperCase()}`))].join(', ');
  const google = (serveur.connexionGoogle ? ROUTE_GOOGLE : '') + ROUTE_MOT_DE_PASSE;
  const boutique = JSON.stringify(serveur.nom);
  const fidelite = serveur.fidelite ? routeFidelite(serveur.fidelite) : '';
  const avecBon = serveur.routes.some((r) => r.bon);
  const comptes = avecComptes(serveur);
  const envoisDansRoutes = serveur.routes.some((r) => r.envois?.length);

  return `// Produit par Humalis : le serveur « ${serveur.nom} », assemblé avec les packs Astratra.
import { createSaasApp, ${comptes ? 'createMemoryPasswordResetStore, type PasswordResetStore, ' : ''}type UsersStore } from '@astratra/saas-kit';
import { ${[...(serveur.connexionGoogle ? ['createGoogleIdTokenVerifier', 'IdTokenError'] : []), ...(serveur.invitations ? ['createApiLimiter'] : []), ...(comptes ? ['createMemoryRevocationStore'] : [])].map((n) => n + ', ').join('')}createLoginLimiter, hashPassword, isStrongPassword, verifyPasswordHash, WAF_PATTERNS } from '@astratra/security';
import express, { type RequestHandler, type Response } from 'express';
${serveur.routes.some((r) => r.direct) ? "import { direct } from './humalis/direct.js';\n" : ''}import { ${schemas} } from './donnees.js';
import type { Surveillance } from './humalis/centrale.js';
import type { Coffre } from './humalis/coffre.js';
${comptes ? "import { creerComptes, refuserMotDePasseFaible, sansLesRetires } from './humalis/comptes.js';\n" : ''}${avecEmails(serveur) ? `import { creerEmails, ${envoisDansRoutes ? 'enTexte, ' : ''}type Emails } from './humalis/emails.js';\n` : ''}import { compresser } from './humalis/compresser.js';
import { creerEnvoisMemoire, creerUnSeulEnvoi, type MagasinEnvois } from './humalis/envois.js';${avecPaiements(serveur) ? "\nimport { creerPaiements, type SurPaiement } from './humalis/paiements.js';" : ''}${avecIa(serveur) ? "\nimport { compterMemoire, creerIa, type Compter } from './humalis/ia.js';" : ''}${avecNotifications(serveur) ? "\nimport { creerNotifications } from './humalis/notifications.js';" : ''}${serveur.documents?.length ? "\nimport { creerDocument } from './humalis/document.js';" : ''}${avecBon ? "\nimport { creerBon } from './humalis/bon.js';" : ''}${serveur.fidelite ? "\nimport { carteDeFidelite } from './humalis/fidelite.js';" : ''}
${avecLogique(serveur) ? `import { ${['Refus', 'agreger', 'resumer', 'enTexte', 'estVide', 'contient', 'noter', 'nouveauTravail', 'terminer', 'transactionMemoire', ...(serveur.taches?.length ? ['lancerTaches', 'type Reclamer'] : []), 'type Transaction'].join(', ')} } from './humalis/logique.js';\n` : ''}import { creerRenouvellement, reglagesDeSession, renouvellementEnCookie, type ReglagesSession } from './humalis/sessions.js';
import { ${avecNotifications(serveur) ? 'creerStockageMemoire, ' : ''}${serveur.fidelite ? 'sansSeparateurs, ' : ''}type Stockage } from './humalis/stockage.js';
${compteRelu(serveur) ? (serveur.routes.some((r) => estSeparee(serveur.donnees.find((d) => d.nom === r.donnee)!, r)) ? "import { dansPortee, groupeACreer, listerDans, moiDe, porteeDe, REFUS_FICHES, type RegleAcces, type Separation } from './humalis/separation.js';\n" : '') : ''}import { lireFiltres, ${nomsVerifier(serveur).map((n) => n + ', ').join('')}verifierEnvoi } from './humalis/verifier.js';

export interface OptionsDuServeur {
  /** Le secret des sessions (au moins 32 caractères). */
  jwtSecret: string;
  usersStore: UsersStore;
  stockages: {
${stockages}
  };${serveur.connexionGoogle ? '\n  /** L\'ID client OAuth de Google (« connexion google »), relu à chaque demande ; sans lui, la connexion avec Google est fermée. */\n  googleClientId?: string | (() => string | undefined);' : ''}
${avecLogique(serveur) ? `  /** Comment écrire tout ou rien ; par défaut, en mémoire. */
  transaction?: Transaction<OptionsDuServeur['stockages']>;
` : ''}${serveur.taches?.length ? `  /** Donné par demarrer.ts : sans lui, aucune tâche ne tourne. */
  reclamerTache?: Reclamer;
` : ''}${avecIa(serveur) ? `  /** Le compteur des questions à l'IA ; par défaut, en mémoire. */
  compterIa?: Compter;
` : ''}${avecNotifications(serveur) ? `  /** Les appareils inscrits ; par défaut, en mémoire. */
  appareils?: Stockage;
` : ''}  /** Les envois déjà faits (en-tête X-Humalis-Envoi) ; par défaut, en mémoire. */
  envois?: MagasinEnvois;
  /** La durée de la session et où garder ses renouvellements ; par défaut, HUMALIS_SESSION et HUMALIS_SESSION_MAX, en mémoire. */
  session?: ReglagesSession;${avecEmails(serveur) ? `
  /** Les e-mails ; par défaut, Brevo avec BREVO_API_KEY et BREVO_EXPEDITEUR. */
  emails?: Emails;` : ''}${comptes ? `
  /** Les empreintes des liens envoyés par e-mail ; par défaut, en mémoire. */
  jetons?: PasswordResetStore;` : ''}
  /** La surveillance, si CENTRALE_ADRESSE et CENTRALE_CLE sont réglées. */
  surveillance?: Surveillance | null;
  /** Le coffre des clés de service, si ENCRYPTION_KEY est réglée. */
  coffre?: Coffre | null;
}

const introuvable = (donnee: string) => \`aucun « \${donnee} » avec cet identifiant\`;${avecBon ? `

/** Le nom écrit en tête de chaque bon : celui du serveur, tel qu'il est écrit dans le programme. */
const BOUTIQUE = ${boutique};` : ''}

/** Une action sans règle est refusée à tout le monde : la porte est fermée par défaut. */
const refuse: RequestHandler = (_req, res) => {
  res.status(403).json({ erreur: "cette action n'est permise à personne" });
};

/**
 * Une lecture que tout le monde peut faire : le navigateur (ou un relais) la
 * garde 30 secondes, puis la ressert encore 5 minutes le temps de la relire
 * en arrière-plan. L'ETag d'Express rend la relecture légère (304). Une
 * réponse qui pose un cookie (le premier jeton CSRF du visiteur) n'est gardée
 * que par son navigateur : un relais ne doit jamais donner ce cookie à un autre.
 */
const lecturePublique: RequestHandler = (_req, res, next) => {
  const cookie = res.getHeader('Set-Cookie') !== undefined;
  res.set('Cache-Control', \`\${cookie ? 'private' : 'public'}, max-age=30, stale-while-revalidate=300\`);
  next();
};

/** Une lecture réservée (connecté, admin) ou refusée : jamais gardée, ni partagée. */
const lecturePrivee: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
};

/** Le pare-feu ne lit pas les mots de passe : hachés, jamais interprétés, ils peuvent contenir « -- » ou « /* ». */
class MotifDuPareFeu extends RegExp {
  override test(cibles: string): boolean {
    return super.test(cibles.replace(/"(password|actuel|nouveau)":"(?:[^"\\\\]|\\\\.)*"/g, '""'));
  }
}

/** Une erreur ou un « introuvable » ne se garde pas, même sur une route publique. */
const sansCache = (res: Response) => res.set('Cache-Control', 'no-store');

/**
 * La connexion (/auth/login), les sessions, les rôles, le CSRF, les
 * limites et les en-têtes de sécurité viennent de createSaasApp. Les
 * routes des données s'ajoutent par extendRoutes, avec les gardes du pack.
 */
export function creerServeur({ envois = creerEnvoisMemoire(), jwtSecret, usersStore${comptes ? ': tousLesComptes' : ''}, stockages${avecLogique(serveur) ? ', transaction = transactionMemoire(stockages)' : ''}${serveur.taches?.length ? ', reclamerTache' : ''}${avecNotifications(serveur) ? ', appareils = creerStockageMemoire()' : ''}${avecIa(serveur) ? ', compterIa = compterMemoire()' : ''}${serveur.connexionGoogle ? ', googleClientId' : ''}, session = reglagesDeSession(process.env), surveillance, coffre${avecEmails(serveur) ? `, emails = creerEmails({ nom: ${boutique} })` : ''}${comptes ? ', jetons = createMemoryPasswordResetStore()' : ''} }: OptionsDuServeur) {
  const renouvellement = creerRenouvellement(session);
${comptes ? codeCreationComptes(serveur, chemins).replace('usersStore,', 'usersStore: tousLesComptes,') + '  // Pour les packs, un compte retiré n\'existe plus.\n  const usersStore = sansLesRetires(tousLesComptes);\n' : ''}${envoisDansRoutes || employe(serveur, (i) => i.type === 'email' && i.a.genre === 'admins') ? `  const adressesDesAdmins = async () => (await usersStore.list({ role: 'admin', limit: 100 })).map((compte) => String(compte.email)).filter(Boolean);\n` : ''}${avecNotifications(serveur) ? '  const notifications = creerNotifications({ usersStore, appareils });\n' : ''}${avecPaiements(serveur) ? `  let surPaiement: SurPaiement<ReturnType<typeof nouveauTravail>, OptionsDuServeur['stockages']> = {};
  const paiements = creerPaiements({
    surConfirme: async (donnee, id, champ, montant) => {
      const travail = nouveauTravail();
      await transaction((s) => surPaiement[donnee]?.(travail, s, id, champ, montant) ?? Promise.resolve());
      terminer(travail${serveur.routes.some((r) => r.direct) ? ', direct.annonce' : ''});
    },
  });
` : ''}  const serveur = createSaasApp({
    jwtSecret,
    // Le pare-feu du pack, sans son motif des commentaires SQL : le stockage passe par des requêtes paramétrées,
    // et « avenue #12 » ou « appeler -- après 18h » sont de vrais textes. Les autres motifs restent.
    waf: { patterns: WAF_PATTERNS.filter((motif) => !motif.source.includes('--')).map((motif) => new MotifDuPareFeu(motif.source, motif.flags)) },
    // Les limites par adresse : un établissement entier peut sortir par une seule adresse.
    ...(process.env.HUMALIS_LIMITE_API ? { apiRateLimit: { max: Number(process.env.HUMALIS_LIMITE_API) } } : {}),
    ...(process.env.HUMALIS_LIMITE_CONNEXION ? { loginRateLimit: { max: Number(process.env.HUMALIS_LIMITE_CONNEXION) } } : {}),
    // Derrière un relais (nginx) : son nombre, pour que les limites comptent chaque visiteur et non le relais.
    ...(process.env.HUMALIS_RELAIS ? { trustProxy: Number(process.env.HUMALIS_RELAIS) } : {}),
    // Un jeton d'accès court, renouvelé tant que la personne revient : voir src/humalis/sessions.ts.
    jwtExpiresIn: session.jeton,
    refreshTokens: { enabled: true, service: renouvellement },
    usersStore,
    roles: { adminRoles: ['admin'], ownerRoles: ['admin'] },
    verifyPassword: async (utilisateur, motDePasse) =>
      typeof utilisateur.passwordHash === 'string' && verifyPasswordHash(motDePasse, utilisateur.passwordHash),
    notify: async () => {},${comptes ? `
    // Le mot de passe oublié et la consommation d'un lien (invitation comprise) : les routes du pack, jeton haché et usage unique.
    hashPassword,
    revocationStore: revocations,
    passwordReset: { send: comptes.envoyerLienOublie, store: jetons },` : ''}
    extendRoutes: (app, contexte) => {
      // Les gardes du pack, telles quelles.
      const authMiddleware = contexte.authMiddleware as unknown as RequestHandler;
      const authorizeAdmin = contexte.authorizeAdmin as unknown as RequestHandler;
      const authorizeRoles = contexte.authorizeRoles as unknown as (...roles: string[]) => RequestHandler;
      const csrfMiddleware = contexte.csrfMiddleware as unknown as RequestHandler;
      const issueSession = (contexte as unknown as { issueSession: (res: unknown, compte: unknown) => Promise<object> }).issueSession;
${compteRelu(serveur) ? COMPTE_RELU : ''}      const unSeulEnvoi = creerUnSeulEnvoi(envois);
      const acces = {
        toutLeMonde: [unSeulEnvoi] as RequestHandler[],
        connecte: [authMiddleware${compteRelu(serveur) ? ', compteRelu' : ''}, unSeulEnvoi],
        seulAdmin: [authMiddleware${compteRelu(serveur) ? ', compteRelu' : ''}, authorizeAdmin, unSeulEnvoi],
        // « seul directeur peut … » : le rôle vient de la session, vérifié par le pack de sécurité. Un admin passe toujours.
        roles: (permis: string[]): RequestHandler[] => [authMiddleware${compteRelu(serveur) ? ', compteRelu' : ''}, authorizeRoles('admin', ...permis), unSeulEnvoi],
      };
      // Les réponses des routes ci-dessous partent compressées (brotli ou gzip) quand le navigateur l'accepte.
      app.use(compresser);
${google}
      // Le coffre des clés de service : admin seulement, et le CSRF garde les écritures.
      const coffreFerme: RequestHandler = (_req, res) => {
        res.status(503).json({ erreur: "le coffre des clés n'est pas ouvert sur ce serveur (ENCRYPTION_KEY)" });
      };
      app.use('/auth/cles', authMiddleware, authorizeAdmin, csrfMiddleware, coffre ? coffre.routes(authorizeAdmin) : coffreFerme);

${avecIa(serveur) ? routeIa(serveur) : ''}${avecNotifications(serveur) ? ROUTES_APPAREILS : ''}${codeCompleter(serveur)}${comptes ? codeRoutesComptes(serveur, adresseApi, (a) => `route${pascal(a)}`) : ''}${routes}
${fidelite}${avecPaiements(serveur) ? codeSurPaiement(serveur) : ''}${codeTaches(serveur)}      // Le dernier avant la réponse d'erreur du pack, qui répond ensuite comme d'habitude.
      if (surveillance) app.use(surveillance.gestionnaireErreurs());
    },
  });
  // Express s'annonce par défaut : l'application du pack ne le fait plus.
  (serveur as unknown as express.Application).disable('x-powered-by');
  // En tête de tout : la surveillance voit chaque requête, et le jeton de renouvellement passe par son cookie.
  const avant = express().disable('x-powered-by');
${avecPaiements(serveur) ? "  avant.post('/paiements/webhook', ...paiements.webhook);\n" : ''}  if (surveillance) avant.use(surveillance.intergiciel());${comptes ? "\n  avant.post('/auth/reset-password', express.json({ limit: '16kb' }), refuserMotDePasseFaible);" : ''}
  return avant.use(renouvellementEnCookie(session.dureeMs)).use(serveur as unknown as express.Application);
}
`;
}

function demarrerTs(serveur: ServeurRI): string {
  const comptes = avecComptes(serveur);
  const stockages = serveur.donnees
    .map((d) => `  ${camel(d.nom)}: pool ? creerStockagePostgres(pool, '${nomTable(d.nom)}') : creerStockageMemoire(),`)
    .join('\n');
  const premiere = serveur.routes[0] ? adresseApi(serveur.routes[0].adresse) : '/auth/me';
  return `// Produit par Humalis : lit l'environnement, crée le premier admin, démarre le serveur « ${serveur.nom} ».
import { createServer, type RequestListener } from 'node:http';
import { createMemoryUsersStore, type UsersStore } from '@astratra/saas-kit';
import { hashPassword, isStrongPassword } from '@astratra/security';
import { createPostgresUsersStore } from '@astratra/store-postgres';
import pg from 'pg';
import { creerServeur } from './serveur.js';
${serveur.routes.some((r) => r.direct) ? "import { direct } from './humalis/direct.js';\n" : ''}import { demarrerCentrale } from './humalis/centrale.js';
${avecIa(serveur) ? "import { compterPostgres } from './humalis/ia.js';\n" : ''}${avecLogique(serveur) ? `import { transactionPostgres${serveur.taches?.length ? ', reclamerMemoire, reclamerPostgres' : ''} } from './humalis/logique.js';\n` : ''}import { creerEnvoisPostgres } from './humalis/envois.js';
import { ouvrirCoffre } from './humalis/coffre.js';${comptes ? "\nimport { creerMagasinJetons } from './humalis/comptes.js';" : ''}
import { creerMagasinMemoire, creerMagasinPostgres } from './humalis/renouvellements.js';
import { reglagesDeSession, type ReglagesSession } from './humalis/sessions.js';
import { creerStockageMemoire, creerStockagePostgres } from './humalis/stockage.js';

function arreter(message: string): never {
  console.error(message);
  process.exit(1);
}

// La surveillance d'abord, pour voir aussi une panne du démarrage.
const surveillance = await demarrerCentrale();

const jwtSecret = process.env.JWT_SECRET ?? '';
if (jwtSecret.length < 32) {
  arreter('JWT_SECRET doit contenir au moins 32 caractères au hasard (voir .env.exemple).');
}

const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
if (!pool) {
  console.warn('Sans DATABASE_URL, les données restent en mémoire et sont perdues à l\\'arrêt : développement seulement.');
}

${serveur.routes.some((r) => r.direct) ? "if (pool) await direct.brancher(pool);\n" : ''}const usersStore = (pool ? createPostgresUsersStore({ pool }) : createMemoryUsersStore()) as UsersStore;
const stockages = {
${stockages}
};

// Le premier administrateur vient de l'environnement : aucun mot de passe
// n'est écrit dans le code.
const email = process.env.HUMALIS_ADMIN_EMAIL;
const motDePasse = process.env.HUMALIS_ADMIN_MOT_DE_PASSE;
if (email && motDePasse && !(await usersStore.findByEmail(email))) {
  if (!isStrongPassword(motDePasse)) {
    arreter('HUMALIS_ADMIN_MOT_DE_PASSE est trop faible : 8 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.');
  }
  await usersStore.create({ email, role: 'admin', passwordHash: await hashPassword(motDePasse) });
  console.log(\`Administrateur créé : \${email}\`);
}

let session: ReglagesSession;
try {
  // Dans PostgreSQL, un redémarrage ne déconnecte personne.
  session = reglagesDeSession(process.env, pool ? creerMagasinPostgres(pool) : creerMagasinMemoire());
} catch (erreur) {
  arreter(erreur instanceof Error ? erreur.message : String(erreur));
}

// Le coffre garde process.env à jour : les clés qu'il gère y sont relues à chaud.
const coffre = await ouvrirCoffre(pool);

const port = Number(process.env.PORT ?? 3000);
const app = creerServeur({ ...(pool ? { envois: creerEnvoisPostgres(pool) } : {}), jwtSecret, usersStore, stockages${avecLogique(serveur) ? `, ...(pool ? { transaction: transactionPostgres(pool, (client) => ({ ${serveur.donnees.map((d) => `${camel(d.nom)}: creerStockagePostgres(client, '${nomTable(d.nom)}')`).join(', ')} })) } : {})` : ''}${serveur.taches?.length ? ', reclamerTache: pool ? reclamerPostgres(pool) : reclamerMemoire()' : ''}${avecNotifications(serveur) ? ", ...(pool ? { appareils: creerStockagePostgres(pool, 'humalis_appareils') } : {})" : ''}${avecIa(serveur) ? ', ...(pool ? { compterIa: compterPostgres(pool) } : {})' : ''}${serveur.connexionGoogle ? ', googleClientId: () => process.env.GOOGLE_CLIENT_ID || undefined' : ''}${comptes ? ', jetons: creerMagasinJetons(pool)' : ''}, session, surveillance, coffre }) as unknown as { listen(port: number, pret: () => void): unknown };
// HUMALIS_ECOUTE : l'adresse d'écoute (127.0.0.1 derrière un relais) ; sans elle, toutes les adresses.
const pret = () => console.log(\`Serveur « ${serveur.nom} » prêt : http://localhost:\${port}${premiere}\`);
const ecoute = process.env.HUMALIS_ECOUTE?.trim();
const auditeur = createServer(app as unknown as RequestListener);
if (ecoute) auditeur.listen(port, ecoute, pret);
else auditeur.listen(port, pret);
`;
}

function testsRegles(serveur: ServeurRI): string {
  const stockages = serveur.donnees.map((d) => `      ${camel(d.nom)}: creerStockageMemoire(),`).join('\n');
  const ok: Record<Action, number> = { lire: 200, creer: 201, modifier: 200, supprimer: 204 };

  const blocs = serveur.routes.map((route) => {
    const donnee = serveur.donnees.find((d) => d.nom === route.donnee)!;
    // Les champs à règle ont des exemples qui les respectent ; un envoi laisse de côté ce que le serveur décide.
    // Une liste non vide lue par une somme contient une vraie référence, créée à la volée.
    const lueParSomme = (c: (typeof donnee.champs)[number]) => donnee.champs.flatMap((x) => (x.regle?.genre === 'somme' && x.regle.liste === c.nom ? [x.regle.donnee] : []))[0];
    const exempleDe = (c: (typeof donnee.champs)[number]) => {
      if (c.regle?.genre === 'site') return c.type.genre === 'liste' ? "['/a.png']" : "'/a.png'";
      if (c.regle?.genre === 'auPlus') return '0';
      if (c.nonVide && c.type.genre === 'liste') {
        const lue = lueParSomme(c);
        return lue ? `[(await stockages.${camel(lue)}.creer(${ficheExemple(serveur, lue)})).id]` : "['exemple']";
      }
      return exempleChamp(c.type);
    };
    const duServeur = champsDuServeur(donnee, route);
    const exemple = `{ ${donnee.champs.map((c) => `${camel(c.nom)}: ${exempleDe(c)}`).join(', ')} }`;
    const envoiExemple = `{ ${donnee.champs.filter((c) => !duServeur.includes(camel(c.nom))).map((c) => `${camel(c.nom)}: ${exempleDe(c)}`).join(', ')} }`;
    const adresse = adresseApi(route.adresse);
    if (estSeparee(donnee, route)) return testsSeparee(serveur, route, donnee, adresse, exemple, envoiExemple);
    const tests: string[] = [];

    for (const action of ACTIONS) {
      const qui = route.droits[action];
      const appel = (jeton: string) => {
        const avec = jeton === 'visiteur' ? '' : `.set('authorization', \`Bearer \${${jeton}}\`)`;
        switch (action) {
          case 'lire':
            return `request(app).get('${adresse}')${avec}`;
          case 'creer':
            return `${jeton === 'visiteur' ? 'visiteurAvecCsrf' : 'request(app)'}.post('${adresse}')${avec}${jeton === 'visiteur' ? '.set(csrf)' : ''}.send(${envoiExemple})`;
          case 'modifier':
            return `${jeton === 'visiteur' ? 'visiteurAvecCsrf' : 'request(app)'}.patch(\`${adresse}/\${existant.id}\`)${avec}${jeton === 'visiteur' ? '.set(csrf)' : ''}.send({})`;
          case 'supprimer':
            // Un enregistrement neuf à chaque fois : une suppression réussie efface le précédent.
            return `${jeton === 'visiteur' ? 'visiteurAvecCsrf' : 'request(app)'}.delete(\`${adresse}/\${(await stockages.${camel(route.donnee)}.creer(${exemple})).id}\`)${avec}${jeton === 'visiteur' ? '.set(csrf)' : ''}`;
        }
      };
      const attendu = (permis: boolean, refus: number) => (permis ? ok[action] : refus);
      // Visiteur, utilisateur connecté, admin : ce que chacun doit obtenir.
      const visiteur = qui === 'tout_le_monde' ? ok[action] : qui === null ? 403 : 401;
      const utilisateur = attendu(qui === 'tout_le_monde' || qui === 'connecte', 403);
      const admin = attendu(qui !== null, 403);
      tests.push(`    it('${action} : visiteur ${visiteur}, utilisateur ${utilisateur}, admin ${admin}', async () => {
      await ${appel('visiteur')}.expect(${visiteur});
      await ${appel('jetonUtilisateur')}.expect(${utilisateur});
      await ${appel('jetonAdmin')}.expect(${admin});
    });`);
    }

    const createur = route.droits.creer === null ? null : route.droits.creer === 'tout_le_monde' ? 'visiteur' : route.droits.creer === 'connecte' ? 'jetonUtilisateur' : 'jetonAdmin';
    if (createur && donnee.champs.length > duServeur.length) {
      const avec = createur === 'visiteur' ? `visiteurAvecCsrf.post('${adresse}').set(csrf)` : `request(app).post('${adresse}').set('authorization', \`Bearer \${${createur}}\`)`;
      tests.push(`    it('refuse un envoi mal formé (400)', async () => {
      const reponse = await ${avec}.send({});
      expect(reponse.status).toBe(400);
      expect(reponse.body.erreur).toContain('manque');
    });`);
    }

    if (createur && duServeur.length > 0) {
      const avec = createur === 'visiteur' ? `visiteurAvecCsrf.post('${adresse}').set(csrf)` : `request(app).post('${adresse}').set('authorization', \`Bearer \${${createur}}\`)`;
      tests.push(`    it('ce que le serveur décide est refusé à l\\'envoi : ${duServeur.join(', ')}', async () => {
${duServeur.map((c) => `      expect((await ${avec}.send({ ...${envoiExemple}, ${c}: ${exempleChamp(donnee.champs.find((x) => camel(x.nom) === c)!.type)} })).body.erreur).toContain('donné par le serveur');`).join('\n')}
    });`);
    }
    const somme = donnee.champs.find((c) => c.regle?.genre === 'somme');
    if (createur && somme?.regle?.genre === 'somme') {
      const { donnee: lue, prix, liste } = somme.regle;
      const avec = createur === 'visiteur' ? `visiteurAvecCsrf.post('${adresse}').set(csrf)` : `request(app).post('${adresse}').set('authorization', \`Bearer \${${createur}}\`)`;
      const liees = (route.creations ?? []).filter((c) => c.dans !== undefined);
      tests.push(`    it('« ${somme.nom} » est recalculé depuis « ${lue} », et une référence inconnue est refusée', async () => {
      const fiche = await stockages.${camel(lue)}.creer({ ...${ficheExemple(serveur, lue)}, ${camel(prix)}: 7 });
      const reponse = await ${avec}.send({ ...${envoiExemple}, ${camel(liste)}: [fiche.id, fiche.id] }).expect(201);
      expect(reponse.body.${camel(somme.nom)}).toBe(14);
${liees.map((c) => `      expect(await stockages.${camel(c.donnee)}.trouver(reponse.body.${camel(c.dans!)})).not.toBeNull();`).join('\n')}
      expect((await ${avec}.send({ ...${envoiExemple}, ${camel(liste)}: ['inconnue'] })).status).toBe(400);
    });`);
    }
    const champNonVide = donnee.champs.find((c) => c.nonVide);
    if (createur && champNonVide) {
      const avec = createur === 'visiteur' ? `visiteurAvecCsrf.post('${adresse}').set(csrf)` : `request(app).post('${adresse}').set('authorization', \`Bearer \${${createur}}\`)`;
      tests.push(`    it('« ${champNonVide.nom} » refuse une valeur vide', async () => {
      const reponse = await ${avec}.send({ ...${envoiExemple}, ${camel(champNonVide.nom)}: ${champNonVide.type.genre === 'liste' ? '[]' : "'  '"} });
      expect(reponse.status).toBe(400);
      expect(reponse.body.erreur).toContain('ne doit pas être vide');
    });`);
    }
    const champSite = donnee.champs.find((c) => c.regle?.genre === 'site');
    if (createur && champSite) {
      const avec = createur === 'visiteur' ? `visiteurAvecCsrf.post('${adresse}').set(csrf)` : `request(app).post('${adresse}').set('authorization', \`Bearer \${${createur}}\`)`;
      const mauvais = champSite.type.genre === 'liste' ? "['https://ailleurs.example/a.png']" : "'https://ailleurs.example/a.png'";
      tests.push(`    it('« ${champSite.nom} » refuse une adresse d\\'un autre site', async () => {
      const reponse = await ${avec}.send({ ...${envoiExemple}, ${camel(champSite.nom)}: ${mauvais} });
      expect(reponse.status).toBe(400);
      expect(reponse.body.erreur).toContain('adresse de ce site');
    });`);
    }
    if (route.droits.lireUn) {
      const qui = route.droits.lireUn;
      const visiteur = qui === 'tout_le_monde' ? 200 : 401;
      tests.push(`    it('une fiche par son identifiant : visiteur ${visiteur}, jamais gardée', async () => {
      const fiche = await stockages.${camel(route.donnee)}.creer(${exemple});
      const reponse = await request(app).get(\`${adresse}/\${fiche.id}\`).expect(${visiteur});
      expect(reponse.headers['cache-control']).toBe('private, no-store');
    });`);
    }

    // Le cache : public pour ce que tout le monde lit, jamais pour une lecture réservée.
    const publique = route.droits.lire === 'tout_le_monde';
    const enTete = publique ? 'public, max-age=30, stale-while-revalidate=300' : 'private, no-store';
    tests.push(`    it('lecture : Cache-Control « ${enTete} »', async () => {
      const reponse = await request(app).get('${adresse}').set(csrf).set('authorization', \`Bearer \${jetonAdmin}\`);
      expect(reponse.headers['cache-control']).toBe('${enTete}');${
        publique
          ? `
      // La première lecture d'un visiteur pose son jeton CSRF : seul son navigateur la garde, jamais un relais.
      const premiere = await request(app).get('${adresse}');
      expect(premiere.headers['cache-control']).toBe('private, max-age=30, stale-while-revalidate=300');`
          : ''
      }
    });`);
    const texte = donnee.champs.find((c) => c.type.genre === 'texte' && !c.type.image);
    if (route.droits.lire !== null && texte) {
      const champ = camel(texte.nom);
      tests.push(`    it('lecture filtrée : ?${champ}=… ne renvoie que les éléments de ce ${champ}', async () => {
      await stockages.${camel(route.donnee)}.creer({ ...${exemple}, ${champ}: 'filtre-a' });
      await stockages.${camel(route.donnee)}.creer({ ...${exemple}, ${champ}: 'filtre-b' });
      const reponse = await request(app).get('${adresse}?${champ}=filtre-a&inconnu=1').set('authorization', \`Bearer \${jetonAdmin}\`).expect(200);
      expect(reponse.body.length).toBeGreaterThan(0);
      expect(reponse.body.every((e: Record<string, unknown>) => e.${champ} === 'filtre-a')).toBe(true);
    });`);
    }

    return `  describe('route « ${route.adresse} » (${decrireDroits(route.droits)})', () => {
    let existant: { id: string };
    beforeEach(async () => {
      existant = await stockages.${camel(route.donnee)}.creer(${exemple});
    });

${tests.join('\n\n')}
  });`;
  });

  return `// Produit par Humalis : une vérification par règle d'accès du serveur « ${serveur.nom} ».
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createMemoryUsersStore, type UsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from '../src/serveur.js';
import { creerStockageMemoire } from '../src/humalis/stockage.js';

const MOT_DE_PASSE = 'Essai-Solide-2026!';
const stockages = {
${stockages}
};
let app: Parameters<typeof request>[0];
let jetonAdmin = '';
let jetonUtilisateur = '';
// Un visiteur garde son cookie CSRF, amorcé par une première lecture.
let visiteurAvecCsrf: ReturnType<typeof request.agent>;
let csrf: Record<string, string> = {};
let comptesCrees = 0;
let nouveauCompte: (role: string, groupes?: Record<string, string>) => Promise<{ id: string; jeton: string }>;

async function connecter(email: string): Promise<string> {
  const reponse = await request(app).post('/auth/login').send({ email, password: MOT_DE_PASSE }).expect(200);
  return reponse.body.data.token;
}

beforeAll(async () => {
  const usersStore = createMemoryUsersStore() as UsersStore;
  const passwordHash = await hashPassword(MOT_DE_PASSE);
  await usersStore.create({ email: 'admin@exemple.cd', role: 'admin', passwordHash });
  await usersStore.create({ email: 'awa@exemple.cd', role: 'utilisateur', passwordHash });
  app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages }) as never;
  jetonAdmin = await connecter('admin@exemple.cd');
  jetonUtilisateur = await connecter('awa@exemple.cd');
  nouveauCompte = async (role, groupes = {}) => {
    const email = \`compte\${++comptesCrees}@exemple.cd\`;
    const compte = await usersStore.create({ email, role, passwordHash, ...groupes });
    return { id: String(compte.id), jeton: await connecter(email) };
  };
  visiteurAvecCsrf = request.agent(app);
  const amorce = await visiteurAvecCsrf.get('/auth/me');
  const cookie = ([] as string[]).concat(amorce.headers['set-cookie'] ?? []).find((c) => c.startsWith('astratra_csrf='));
  // Hors développement, le pack marque ce cookie « Secure » : en http, l'agent
  // ne le renverrait pas. Le visiteur le renvoie donc lui-même, avec l'en-tête.
  const jeton = cookie?.split(';')[0].split('=')[1];
  csrf = jeton ? { 'x-csrf-token': jeton, cookie: \`astratra_csrf=\${jeton}\` } : {};
});

describe('règles d\\'accès', () => {
  it('le serveur ne dit pas qu\\'il tourne sous Express', async () => {
    const reponse = await request(app).get('/auth/me');
    expect(reponse.headers['x-powered-by']).toBeUndefined();
  });

${blocs.join('\n\n')}
});
`;
}

/** Les tests produits de la session, du coffre et de la surveillance, avec les vrais packs et une horloge injectée. */
function testsSessions(serveur: ServeurRI): string {
  const stockages = serveur.donnees.map((d) => `      ${camel(d.nom)}: creerStockageMemoire(),`).join('\n');
  return `// Produit par Humalis : la session glissante, sa borne de 30 jours, le coffre des clés et la surveillance.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createMemoryUsersStore, type UsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from '../src/serveur.js';
import { assainir, demarrerCentrale } from '../src/humalis/centrale.js';
import { creerMagasinMemoire } from '../src/humalis/renouvellements.js';
import { lireDuree, type ReglagesSession } from '../src/humalis/sessions.js';
import { creerStockageMemoire } from '../src/humalis/stockage.js';
import { ouvrirCoffre } from '../src/humalis/coffre.js';

const JOUR = 86_400_000;
const MOT_DE_PASSE = 'Essai-Solide-2026!';
const stockages = () => ({
${stockages}
});
let usersStore: UsersStore;
let maintenant = 0;

const reglages = (): ReglagesSession => ({ jeton: '15m', dureeMs: 3 * JOUR, maximumMs: 30 * JOUR, magasin: creerMagasinMemoire(), horloge: () => maintenant });
const leServeur = (plus: object = {}) => creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages: stockages(), session: reglages(), ...plus }) as never;

/** Le cookie de renouvellement posé par une réponse (hors développement il est « Secure » : le test le renvoie lui-même). */
function cookieDe(reponse: request.Response): string | undefined {
  const lignes = ([] as string[]).concat(reponse.headers['set-cookie'] ?? []);
  return lignes.find((l) => l.startsWith('humalis_renouvellement='))?.split(';')[0];
}
const connecter = (app: never, email = 'admin@exemple.cd', entetes: Record<string, string> = {}) =>
  request(app).post('/auth/login').set(entetes).send({ email, password: MOT_DE_PASSE }).expect(200);
const renouveler = (app: never, cookie: string) => request(app).post('/auth/refresh').set('cookie', cookie);

beforeAll(async () => {
  usersStore = createMemoryUsersStore() as UsersStore;
  const passwordHash = await hashPassword(MOT_DE_PASSE);
  await usersStore.create({ email: 'admin@exemple.cd', role: 'admin', passwordHash });
  await usersStore.create({ email: 'awa@exemple.cd', role: 'utilisateur', passwordHash });
});

beforeEach(() => {
  maintenant = Date.UTC(2026, 0, 1);
});

describe('la session', () => {
  it('le jeton de renouvellement reste dans un cookie HttpOnly, jamais dans la réponse du navigateur', async () => {
    const reponse = await connecter(leServeur());
    expect(reponse.body.data.refreshToken).toBeUndefined();
    const ligne = ([] as string[]).concat(reponse.headers['set-cookie']).find((l) => l.startsWith('humalis_renouvellement='))!;
    expect(ligne).toContain('HttpOnly');
    expect(ligne).toContain('Path=/auth');
    expect(ligne).toContain('Max-Age=' + 3 * 86_400);
    // Une page piégée qui se fait passer pour un téléphone n'y gagne rien : un jeton venu d'un cookie ne ressort jamais.
    const piege = await renouveler(leServeur(), cookieDe(reponse)!).set('x-humalis-mobile', '1');
    expect(piege.body.data?.refreshToken).toBeUndefined();
  });

  it('se renouvelle avant 3 jours, et le renouvellement rouvre 3 jours', async () => {
    const app = leServeur();
    let cookie = cookieDe(await connecter(app))!;
    for (let i = 0; i < 4; i++) {
      maintenant += 2 * JOUR;
      const reponse = await renouveler(app, cookie).expect(200);
      expect(reponse.body.data.token).toBeTruthy();
      expect(reponse.body.data.refreshToken).toBeUndefined();
      cookie = cookieDe(reponse)!;
    }
    // Le jeton d'accès neuf ouvre bien /auth/me.
    const jeton = (await renouveler(app, cookie).expect(200)).body.data.token;
    await request(app).get('/auth/me').set('authorization', 'Bearer ' + jeton).expect(200);
  });

  it('refuse après 3 jours sans venir, et efface le cookie', async () => {
    const app = leServeur();
    const cookie = cookieDe(await connecter(app))!;
    maintenant += 3 * JOUR + 1000;
    const reponse = await renouveler(app, cookie).expect(401);
    expect(cookieDe(reponse)).toBe('humalis_renouvellement=');
  });

  it('refuse après 30 jours malgré des retours réguliers', async () => {
    const app = leServeur();
    let cookie = cookieDe(await connecter(app))!;
    const debut = maintenant;
    // Chaque jour : toujours bon jusqu'au 29e.
    for (let jour = 1; jour <= 29; jour++) {
      maintenant = debut + jour * JOUR;
      cookie = cookieDe(await renouveler(app, cookie).expect(200))!;
    }
    maintenant = debut + 30 * JOUR;
    await renouveler(app, cookie).expect(401);
  });

  it('un jeton rejoué après le délai de grâce ferme toute la famille ; deux onglets au même instant passent', async () => {
    const app = leServeur();
    const premier = cookieDe(await connecter(app))!;
    const suivant = cookieDe(await renouveler(app, premier).expect(200))!;
    // Le second onglet, le même instant : accepté.
    await renouveler(app, premier).expect(200);
    maintenant += 11_000;
    await renouveler(app, premier).expect(401);
    await renouveler(app, suivant).expect(401);
  });

  it('la déconnexion ferme la famille et efface le cookie', async () => {
    const app = leServeur();
    const connexion = await connecter(app);
    const cookie = cookieDe(connexion)!;
    const sortie = await request(app).post('/auth/logout').set('authorization', 'Bearer ' + connexion.body.data.token).expect(200);
    expect(cookieDe(sortie)).toBe('humalis_renouvellement=');
    await renouveler(app, cookie).expect(401);
  });

  it('changer le mot de passe ferme les autres sessions, celle-ci repart', async () => {
    const app = leServeur();
    const ailleurs = cookieDe(await connecter(app, 'awa@exemple.cd'))!;
    const ici = await connecter(app, 'awa@exemple.cd');
    const change = await request(app)
      .post('/auth/mot-de-passe')
      .set('authorization', 'Bearer ' + ici.body.data.token)
      .send({ actuel: MOT_DE_PASSE, nouveau: MOT_DE_PASSE })
      .expect(200);
    expect(change.body.change).toBe(true);
    expect(change.body.refreshToken).toBeUndefined();
    await renouveler(app, ailleurs).expect(401);
    await renouveler(app, cookieDe(ici)!).expect(401);
    await renouveler(app, cookieDe(change)!).expect(200);
  });

  it('un téléphone reçoit son jeton en JSON et le présente dans le corps', async () => {
    const app = leServeur();
    const connexion = await connecter(app, 'awa@exemple.cd', { 'x-humalis-mobile': '1' });
    expect(connexion.body.data.refreshToken).toBeTruthy();
    expect(cookieDe(connexion)).toBeUndefined();
    const suite = await request(app).post('/auth/refresh').set('x-humalis-mobile', '1').send({ refreshToken: connexion.body.data.refreshToken }).expect(200);
    expect(suite.body.data.refreshToken).toBeTruthy();
    expect(suite.body.data.refreshToken).not.toBe(connexion.body.data.refreshToken);
  });

  it('refuse une durée illisible avec une phrase claire', () => {
    expect(lireDuree(undefined, '3d', 'HUMALIS_SESSION')).toBe(3 * JOUR);
    expect(lireDuree('12h', '3d', 'HUMALIS_SESSION')).toBe(JOUR / 2);
    expect(() => lireDuree('trois jours', '3d', 'HUMALIS_SESSION')).toThrow('HUMALIS_SESSION doit être une durée');
  });
});

describe('le coffre des clés', () => {
  it('sans ENCRYPTION_KEY, fermé : le serveur marche, /auth/cles répond 503 à un admin et 401 à un visiteur', async () => {
    const coffre = await ouvrirCoffre(null, { ENCRYPTION_KEY: '' });
    expect(coffre).toBeNull();
    const app = leServeur({ coffre });
    await request(app).get('/auth/cles').expect(401);
    const jeton = (await connecter(app)).body.data.token;
    await request(app).get('/auth/cles').set('authorization', 'Bearer ' + jeton).expect(503);
  });

  it('une ENCRYPTION_KEY de mauvaise taille laisse le coffre fermé, sans arrêter le serveur', async () => {
    expect(await ouvrirCoffre(null, { ENCRYPTION_KEY: 'trop-courte' })).toBeNull();
  });${serveur.connexionGoogle ? `

  it('une clé enregistrée sert tout de suite, sans redémarrer ; rien ne ressort en clair ; débranchée, elle se tait', async () => {
    const env: NodeJS.ProcessEnv = { ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };
    const coffre = await ouvrirCoffre(null, env);
    const app = leServeur({ coffre, googleClientId: () => env.GOOGLE_CLIENT_ID });
    const admin = (await connecter(app)).body.data.token;
    const utilisateur = (await connecter(app, 'awa@exemple.cd')).body.data.token;
    const avecJeton = (jeton: string) => ({ authorization: 'Bearer ' + jeton });
    expect((await request(app).get('/auth/google').expect(200)).body.clientId).toBeNull();
    await request(app).put('/auth/cles/GOOGLE_CLIENT_ID').set(avecJeton(utilisateur)).send({ value: 'id-de-test' }).expect(403);
    await request(app).put('/auth/cles/GOOGLE_CLIENT_ID').send({ value: 'id-de-test' }).expect(401);
    await request(app).put('/auth/cles/JWT_SECRET').set(avecJeton(admin)).send({ value: 'non' }).expect(400);
    await request(app).put('/auth/cles/GOOGLE_CLIENT_ID').set(avecJeton(admin)).send({ value: 'id-de-test-abcd' }).expect(200);
    expect((await request(app).get('/auth/google').expect(200)).body.clientId).toBe('id-de-test-abcd');
    const etat = await request(app).get('/auth/cles').set(avecJeton(admin)).expect(200);
    expect(JSON.stringify(etat.body)).not.toContain('id-de-test-abcd');
    await request(app).delete('/auth/cles/GOOGLE_CLIENT_ID').set(avecJeton(admin)).expect(200);
    expect((await request(app).get('/auth/google').expect(200)).body.clientId).toBeNull();
  });

  it('un envoi depuis une page sans jeton CSRF est refusé', async () => {
    const coffre = await ouvrirCoffre(null, { ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') });
    const app = leServeur({ coffre });
    const cookies = ([] as string[]).concat((await connecter(app)).headers['set-cookie']);
    const session = cookies.find((c) => c.startsWith('astratra_session='))!.split(';')[0];
    await request(app).put('/auth/cles/GOOGLE_CLIENT_ID').set('cookie', session).send({ value: 'id' }).expect(403);
  });` : ''}
});

describe('la surveillance', () => {
  it('sans ses variables, elle ne démarre pas', async () => {
    expect(await demarrerCentrale({})).toBeNull();
    expect(await demarrerCentrale({ CENTRALE_ADRESSE: 'https://centrale.exemple.fr' })).toBeNull();
  });

  it('une erreur de PostgreSQL ne garde que son code ; les identifiants quittent les autres messages', () => {
    const base = Object.assign(new Error('la valeur « secret@exemple.cd » est refusée'), { severity: 'ERROR', code: '23505' });
    expect((assainir(base) as Error).message).toBe('Erreur PostgreSQL 23505');
    expect((assainir(new Error('commande 7f0c6a52-58cb-4dc4-9a0a-1b1e0a4f1d11 introuvable')) as Error).message).toBe('commande :id introuvable');
  });

  it('une panne part, un refus ordinaire non ; la réponse reste celle du pack', async () => {
    let envoye = '';
    const transport = async (requete: { corps: string }) => {
      envoye += requete.corps;
      return { statut: 202 };
    };
    const surveillance = await demarrerCentrale({ CENTRALE_ADRESSE: 'https://centrale.exemple.fr', CENTRALE_CLE: 'clj_pub_essai' }, transport);
    expect(surveillance).not.toBeNull();
    const panne = vi.fn(async () => {
      throw Object.assign(new Error('colonne « mot-de-passe-secret » absente'), { severity: 'ERROR', code: '42703' });
    });
    const enPanne = stockages();
    for (const stockage of Object.values(enPanne)) (stockage as { lister: unknown }).lister = panne;
    const app = leServeur({ surveillance, stockages: enPanne });
    await request(app).post('/auth/login').set('content-type', 'application/json').send('{"email":"mot-de-passe-brut').expect(400);
    await request(app).get('/auth/me').expect(401);
    const jeton = (await connecter(app)).body.data.token;${serveur.routes[0] ? `
    const reponse = await request(app).get('${adresseApi(serveur.routes[0].adresse)}').set('authorization', 'Bearer ' + jeton);
    expect(reponse.status).toBe(500);
    expect(panne).toHaveBeenCalled();
    await surveillance!.vider();
    expect(envoye).toContain('Erreur PostgreSQL 42703');` : `
    void jeton;
    await surveillance!.vider();`}
    expect(envoye).not.toContain('mot-de-passe-secret');
    expect(envoye).not.toContain('mot-de-passe-brut');
    expect(envoye).not.toContain(MOT_DE_PASSE);
  });
});
`;
}

/** Ce que le LISEZMOI ajoute pour « telecharger bon de … » et « fidelite … ». */
function lisezmoiEnPlus(serveur: ServeurRI): string {
  const bons = serveur.routes.filter((r) => r.bon).map((r) => `\`GET ${adresseApi(r.adresse)}/:id/bon\``);
  const lignes: string[] = [
    ...(bons.length > 0 ? [`\nLe bon d'une fiche, en PDF, avec les mêmes droits que sa lecture et jamais gardé en cache : ${bons.join(', ')}.`] : []),
    ...(serveur.fidelite
      ? [`\nLa carte de fidélité d'un client, calculée sur les fiches, réservée à l'admin et sans écriture : \`GET /api/fidelite/<${serveur.fidelite.champ}>\` rend \`{ tampons, objectif, restant, recompenses, recompense }\`. Les récompenses données ne sont pas enregistrées : \`recompenses\` compte celles qui ont été gagnées.`]
      : []),
  ];
  if (serveur.invitations || serveur.motDePasseOublie) {
    lignes.push(`\nLes liens envoyés par e-mail ont besoin de \`BREVO_API_KEY\`, \`BREVO_EXPEDITEUR\` et \`HUMALIS_ADRESSE_SITE\`. Le jeton est dans le fragment de l'adresse, le serveur n'en garde que l'empreinte, et il ne sert qu'une fois (\`src/humalis/comptes.ts\`).`);
  } else if (serveur.emails) {
    lignes.push(`\nLes e-mails partent par Brevo, avec \`BREVO_API_KEY\` et \`BREVO_EXPEDITEUR\` (\`src/humalis/emails.ts\`).`);
  }
  return lignes.length > 0 ? lignes.join('\n') + '\n' : '';
}

function lisezmoi(serveur: ServeurRI, options: OptionsServeur): string {
  const routes = serveur.routes
    .map((r) => `| \`${adresseApi(r.adresse)}\` | ${r.donnee} | ${decrireDroits(r.droits)} |`)
    .join('\n');
  return `# Serveur « ${serveur.nom} »

Produit par Humalis depuis \`${options.source}\`. La sécurité (connexion,
sessions, rôles, protection CSRF, limites, en-têtes) vient des packs
Astratra (\`@astratra/saas-kit\`, \`@astratra/security\`) ; le code produit les
assemble, décrit les données et vérifie la forme des envois.

Il faut Node.js 24 (et son npm 11 : avec npm 10, \`npm install\` peut
échouer sur l'erreur « edgesOut », un bug de npm).

\`\`\`sh
npm install
cp .env.exemple .env      # puis remplis JWT_SECRET et l'administrateur
npm test                  # vérifie chaque règle d'accès
npm run build && npm start
\`\`\`

Sans \`DATABASE_URL\`, les données restent en mémoire (développement). Avec,
chaque donnée a sa table PostgreSQL (\`${serveur.donnees.map((d) => nomTable(d.nom)).join('`, `')}\`).

## Les routes

| Adresse | Donnée | Qui peut quoi |
|---|---|---|
${routes}

Chaque adresse accepte \`GET\` (liste), \`GET /:id\`, \`POST\`, \`PATCH /:id\` et
\`DELETE /:id\`. Une action sans règle est refusée à tout le monde (403).

La liste se filtre par les champs de la donnée, comparés par égalité :
\`GET /api/…?champ=valeur\` (une autre clé est ignorée), et se découpe avec
\`?limite=20&depuis=40\`. Une lecture que tout le monde peut faire est gardée
30 secondes par le navigateur (\`Cache-Control: public\`, avec ETag) ; une
lecture réservée ne l'est jamais (\`private, no-store\`). Les réponses de plus
de 1 Ko partent compressées (brotli ou gzip).
Se connecter : \`POST /auth/login\` avec \`{ "email", "password" }\`.
${lisezmoiEnPlus(serveur)}
## La sécurité et ses mises à jour

Toute la sécurité vient des packs Astratra (\`@astratra/saas-kit\`,
\`@astratra/security\`, \`@astratra/store-postgres\`), à des versions
exactes. Pour savoir si ce projet est en retard sur ton Humalis :
\`humalis packs --verifier .\` ; pour passer aux nouvelles versions,
recompile ton programme. Pour les failles connues des autres
dépendances : \`npm audit\`.

\`npm run audit:deps\` (failles connues, il faut le package-lock.json) et
\`npm run audit:secrets\` (secrets écrits en dur dans un journal ou une réponse)
le disent aussi, avec un code de sortie pour une chaîne d'intégration.

## La session

Elle se renouvelle tant que la personne revient : sans venir pendant
\`HUMALIS_SESSION\` (3 jours), ou \`HUMALIS_SESSION_MAX\` (30 jours) après la
connexion même en revenant chaque jour, il faut se reconnecter. Le serveur vérifie
ces deux bornes (un jeton d'accès déjà délivré vit encore 15 minutes au plus).
Les jetons de renouvellement tournent à chaque usage : un jeton rejoué, la
déconnexion ou un changement de mot de passe ferment la session. Le navigateur les
reçoit dans un cookie HttpOnly limité à \`/auth\` ; la table
\`sessions_renouvellement\` n'en garde que l'empreinte.

## Facultatif : surveillance et coffre des clés

Sans ces variables, rien n'est chargé et le serveur marche pareil (\`.env.exemple\`).

- \`CENTRALE_ADRESSE\` et \`CENTRALE_CLE\` : les pannes (statut 500 et plus), les
  exceptions et les requêtes (gabarit de route, statut, durée) partent à Centrale,
  masquées. Jamais de corps, d'en-tête ni de cookie. Mode strict : ni utilisateur,
  ni appareil précis.
- \`ENCRYPTION_KEY\` : les clés de service se rangent chiffrées dans la table
  \`coffre_cles\` (en mémoire sans \`DATABASE_URL\`) et se modifient sans redémarrer.
  Routes réservées à l'admin, avec le jeton CSRF : \`GET /auth/cles\` (jamais une valeur
  secrète, seulement ses 4 derniers caractères), \`PUT /auth/cles/:cle\` avec
  \`{ "value": "…" }\`, \`DELETE /auth/cles/:cle\`. La valeur du coffre passe avant le \`.env\`.

Ce dossier est réécrit à chaque compilation Humalis (fichier \`${MARQUE_SERVEUR}\`).
`;
}

/**
 * « connexion google » : la fenêtre de Google rend un jeton d'identité ; le pack de sécurité le
 * vérifie (signature, émetteur, destinataire, nonce). Seul un compte déjà connu du serveur, dont
 * Google confirme l'adresse, ouvre sa session — la même que /auth/login (issueSession).
 */
/** « changer le mot de passe » : celui du compte connecté, après vérification de l'actuel. */
const ROUTE_MOT_DE_PASSE = `
      // « changer le mot de passe » : le compte connecté donne l'actuel ; un nouveau trop faible est refusé.
      // Le limiteur compte les essais comme pour la connexion : on devine un secret.
      const routeMotDePasse = express.Router();
      routeMotDePasse.post('/', createLoginLimiter() as unknown as RequestHandler, authMiddleware, csrfMiddleware, async (req, res, next) => {
        try {
          const corps = (req.body ?? {}) as { actuel?: unknown; nouveau?: unknown };
          const actuel = typeof corps.actuel === 'string' ? corps.actuel : '';
          const nouveau = typeof corps.nouveau === 'string' ? corps.nouveau : '';
          const id = (req as unknown as { user?: { id?: unknown } }).user?.id;
          const compte = typeof id === 'string' ? await usersStore.findById(id) : null;
          if (!compte) {
            res.status(401).json({ erreur: 'connecte-toi de nouveau' });
            return;
          }
          if (typeof compte.passwordHash !== 'string' || !(await verifyPasswordHash(actuel, compte.passwordHash))) {
            res.status(403).json({ erreur: 'le mot de passe actuel est incorrect' });
            return;
          }
          if (!isStrongPassword(nouveau)) {
            res.status(400).json({ erreur: 'le nouveau mot de passe est trop faible : au moins 8 caractères, avec une majuscule, une minuscule, un chiffre et un signe' });
            return;
          }
          await usersStore.update(String(compte.id), { passwordHash: await hashPassword(nouveau) });
          // Celui qui change son mot de passe ferme peut-être la porte à un voleur : toutes les sessions de ce compte s'arrêtent, celle-ci repart.
          await renouvellement.revokeAllForUser(String(compte.id));
          res.json({ change: true, ...(await issueSession(res, compte)) });
        } catch (erreur) {
          next(erreur);
        }
      });
      app.use('/auth/mot-de-passe', routeMotDePasse);
`;

/**
 * « telecharger bon de … » : les mêmes gardes que la lecture de la route, et jamais gardé en cache,
 * même sur une route publique : c'est un fichier nominatif.
 */
/**
 * Le temps réel : une page qui lit une route « en direct » apprend qu'elle a changé.
 * Aucune donnée ne passe par ce canal : la page relit par la route normale, avec ses droits.
 */
function routeDirect(variable: string, garde: string, cle: string, separee?: { separation: string; regles: string }): string {
  // Une donnée séparée : chacun n'écoute que son groupe ; un admin écoute tout.
  if (separee) {
    return `      ${variable}.get('/direct', ${garde}, (req, res) => {
        const portee = porteeDe(moiDe(req), ${separee.separation}, ${separee.regles});
        if (!portee) {
          res.status(403).json({ erreur: REFUS_FICHES });
          return;
        }
        const groupe = ${separee.separation} ? portee.egal[${separee.separation}.champ] : undefined;
        direct.ecouter(groupe === undefined ? ${JSON.stringify(cle)} : ${JSON.stringify(cle + '|')} + groupe, req, res);
      });
`;
  }
  return `      ${variable}.get('/direct', ${garde}, (req, res) => direct.ecouter(${JSON.stringify(cle)}, req, res));
`;
}

/** Ce qu'un envoi réussi sur cette route doit annoncer : sa donnée, et celles qu'elle crée au passage. */
function clesAnnoncees(serveur: ServeurRI, route: ServeurRI['routes'][number]): string[] {
  const ecoutees = new Set(serveur.routes.filter((r) => r.direct).map((r) => r.donnee));
  return [...new Set([route.donnee, ...(route.creations ?? []).map((c) => c.donnee)])].filter((d) => ecoutees.has(d));
}

/** humalis/direct.ts : un seul serveur en mémoire, plusieurs serveurs par PostgreSQL. */
const DIRECT = String.raw`import type { Request, RequestHandler, Response } from 'express';
import type pg from 'pg';

/**
 * Produit par Humalis : le temps réel des pages qui lisent « en direct ».
 * Ce canal annonce seulement qu'une donnée a changé ; la page relit ensuite la route
 * normale, avec ses droits. Avec DATABASE_URL, l'annonce passe par PostgreSQL
 * (NOTIFY) : tous les exemplaires du serveur la reçoivent.
 */
const CANAL = 'humalis_direct';
const MAXIMUM = Number(process.env.HUMALIS_DIRECT_MAX ?? 10000);
const TAMPON = 64 * 1024;

const ecoutes = new Map<string, Set<Response>>();
let total = 0;
let pool: pg.Pool | null = null;
const enAttente = new Set<string>();
let minuteur: ReturnType<typeof setTimeout> | undefined;

/** Un client trop lent est fermé plutôt que de gonfler la mémoire : il se reconnectera et relira. */
function ecrire(res: Response, texte: string): void {
  if (res.writableLength > TAMPON) res.end();
  else res.write(texte);
}

function diffuser(cle: string): void {
  for (const res of ecoutes.get(cle) ?? []) ecrire(res, 'data: change\n\n');
}

function publier(): void {
  minuteur = undefined;
  const cles = [...enAttente];
  enAttente.clear();
  for (const cle of cles) {
    if (pool) pool.query('SELECT pg_notify($1, $2)', [CANAL, cle]).catch(() => diffuser(cle));
    else diffuser(cle);
  }
}

/** Plusieurs envois rapprochés ne font qu'une annonce. */
function annoncer(cle: string): void {
  enAttente.add(cle);
  minuteur ??= setTimeout(publier, 100);
}

// Un seul battement pour tout le monde : le navigateur sait ainsi que la liaison vit encore.
setInterval(() => {
  for (const liste of ecoutes.values()) for (const res of liste) ecrire(res, 'event: present\ndata: 1\n\n');
}, 25000).unref();

export const direct = {
  /** Une écriture faite ailleurs qu'une route (action, tâche). */
  annonce: annoncer,

  ecouter(cle: string, req: Request, res: Response): void {
    if (total >= MAXIMUM) {
      res.status(503).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    res.write(': ouvert\n\n');
    const liste = ecoutes.get(cle) ?? new Set<Response>();
    ecoutes.set(cle, liste);
    liste.add(res);
    total++;
    req.on('close', () => {
      if (liste.delete(res)) total--;
    });
  },

  /** Après un envoi réussi, annonce ces données. */
  apres(cles: string[]): RequestHandler {
    return (req, res, next) => {
      if (req.method !== 'GET') {
        res.on('finish', () => {
          if (res.statusCode >= 400) return;
          // Une donnée séparée : l'annonce va à son groupe et aux admins, jamais aux autres groupes.
          const groupe = res.locals.groupeDirect;
          for (const cle of cles) annoncer(typeof groupe === 'string' ? cle + '|' + groupe : cle);
          if (typeof groupe === 'string') for (const cle of cles) annoncer(cle);
        });
      }
      next();
    };
  },

  /** Plusieurs exemplaires du serveur : chacun écoute PostgreSQL. Une coupure fait relire tout le monde. */
  async brancher(base: pg.Pool): Promise<void> {
    pool = base;
    let dejaBranche = false;
    const ecouterBase = async (): Promise<void> => {
      try {
        const client = await base.connect();
        client.on('notification', (message) => {
          if (message.payload) diffuser(message.payload);
        });
        client.once('error', () => {
          client.release(true);
          setTimeout(() => void ecouterBase(), 2000);
        });
        await client.query('LISTEN ' + CANAL);
        if (dejaBranche) for (const cle of ecoutes.keys()) diffuser(cle);
        dejaBranche = true;
      } catch {
        setTimeout(() => void ecouterBase(), 2000);
      }
    };
    await ecouterBase();
  },
};
`;

function routeBon(variable: string, route: ServeurRI['routes'][number], garde: string, schema: string, donnee: string, separee = false): string {
  const fichier = simplifier(route.donnee).replace(/_/g, '-');
  return `      ${variable}.get('/:id/bon', lecturePrivee, ${garde}, async (req, res, next) => {
        try {
${separee ? codeFicheVisible(variable, donnee, route.donnee, 'lire') : ''}          const trouve = ${separee ? 'visible' : `await stockages.${donnee}.trouver(req.params.id)`};
          if (!trouve) {
            res.status(404).json({ erreur: introuvable('${route.donnee}') });
            return;
          }
          const fichier = await creerBon({ boutique: BOUTIQUE, donnee: '${route.donnee}', schema: ${schema}, fiche: trouve });
          // L'identifiant vient de la base : ses seuls lettres et chiffres vont dans le nom du fichier.
          const court = String(trouve.id).replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
          res.set('Content-Type', 'application/pdf');
          res.set('Content-Disposition', \`attachment; filename="bon-de-${fichier}-\${court}.pdf"\`);
          res.send(fichier);
        } catch (erreur) {
          next(erreur);
        }
      });
`;
}

/**
 * « fidelite par telephone de commande » : une lecture réservée à l'admin, car la valeur est un numéro
 * de téléphone. Aucune écriture : seul GET existe, et sans valeur il n'y a pas de liste.
 */
function routeFidelite(fidelite: NonNullable<ServeurRI['fidelite']>): string {
  const egal = `{ ${camel('statut')}: ${JSON.stringify(fidelite.statut)} }`;
  return `      // « fidelite par ${fidelite.champ} de ${fidelite.donnee} » : seul l'admin lit une carte ; personne n'y écrit.
      const routeFidelite = express.Router();
      routeFidelite.get('/:valeur', lecturePrivee, ...acces.seulAdmin, async (req, res, next) => {
        try {
          const numero = sansSeparateurs(req.params.valeur);
          if (numero === '') {
            res.status(400).json({ erreur: 'la valeur « ${fidelite.champ} » est vide' });
            return;
          }
          // Le stockage filtre lui-même : seules les fiches de ce client avec ce statut reviennent.
          const fiches = await stockages.${camel(fidelite.donnee)}.lister({ egal: ${egal}, numero: { champ: ${JSON.stringify(camel(fidelite.champ))}, valeur: numero } });
          res.json(carteDeFidelite(fiches.length, { parFiche: ${fidelite.tampons}, objectif: ${fidelite.objectif}, recompense: ${JSON.stringify(fidelite.recompense)} }));
        } catch (erreur) {
          next(erreur);
        }
      });
      app.use('/api/fidelite', routeFidelite);

`;
}

/**
 * Le PDF d'une fiche : le nom de la boutique, le titre, puis chaque champ en clair (sauf les images),
 * dans un tableau du pack @astratra/pdf qui ne coupe jamais une rangée entre deux pages.
 */
const BON = `import { drawTable, line, type PdfDocumentLike } from '@astratra/pdf';
import PDFDocument from 'pdfkit';
import type { Enregistrement } from './stockage.js';
import type { Schema, TypeChamp } from './verifier.js';

const MOIS_LONG = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' });
const INSTANT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
/** Les polices de base du PDF n'ont pas les espaces fines de la mise en forme française. */
const espaces = (texte: string) => texte.replace(/[\\u00a0\\u202f]/g, ' ');

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);
/** « prix_avant » → « Prix avant » ; « prixAvant » (le nom gardé par le serveur) → pareil. */
const libelle = (nom: string) => majuscule(nom.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, (_, a: string, b: string) => \`\${a} \${b.toLowerCase()}\`));

function dateEnClair(valeur: string): string {
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return valeur;
  // Un jour sans heure reste ce jour-là, quel que soit le fuseau du serveur.
  return espaces(/^\\d{4}-\\d{2}-\\d{2}$/.test(valeur) ? MOIS_LONG.format(date) : INSTANT.format(date));
}

/** Une valeur lisible sur le papier ; une liste, une ligne par élément. */
export function enClair(type: TypeChamp, valeur: unknown): string {
  if (valeur === null || valeur === undefined || valeur === '') return '-';
  if (typeof type === 'object') return Array.isArray(valeur) && valeur.length > 0 ? valeur.map((v) => enClair(type.liste, v)).join('\\n') : '-';
  if (type === 'booleen') return valeur === true ? 'Oui' : 'Non';
  if (type === 'nombre' && typeof valeur === 'number') return espaces(valeur.toLocaleString('fr-FR'));
  if (type === 'date' && typeof valeur === 'string') return dateEnClair(valeur);
  return String(valeur);
}

const estImage = (type: TypeChamp): boolean => (typeof type === 'object' ? estImage(type.liste) : type === 'image');

/** Le document complet, en mémoire : une fiche tient en quelques pages. */
export function creerBon({ boutique, donnee, schema, fiche }: { boutique: string; donnee: string; schema: Schema; fiche: Enregistrement }): Promise<Buffer> {
  return new Promise((resoudre, rejeter) => {
    const titre = \`Bon de \${libelle(donnee).toLowerCase()}\`;
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: titre, Author: boutique } });
    const morceaux: Buffer[] = [];
    doc.on('data', (morceau: Buffer) => morceaux.push(morceau));
    doc.on('end', () => resoudre(Buffer.concat(morceaux)));
    doc.on('error', rejeter);

    const papier = doc as unknown as PdfDocumentLike;
    const largeur = doc.page.width - 100;
    doc.font('Helvetica').fontSize(11).fillColor('#555555');
    line(papier, boutique, 50, 50, largeur);
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111111');
    line(papier, titre, 50, 68, largeur);
    doc.font('Helvetica').fontSize(10).fillColor('#555555');
    line(papier, \`N° \${String(fiche.id).slice(0, 8)}\`, 50, 96, largeur);

    const rangees = Object.entries(schema)
      .filter(([, type]) => !estImage(type))
      .map(([champ, type]) => ({ champ: libelle(champ), valeur: enClair(type, fiche[champ]) }));
    drawTable(papier, {
      x: 50,
      y: 122,
      width: largeur,
      columns: [
        { key: 'champ', label: 'Champ', width: 150 },
        { key: 'valeur', label: 'Valeur', wrap: true },
      ],
      rows: rangees,
      fontSize: 10,
      headerFontSize: 9,
      zebra: '#F7F7F7',
    });
    doc.end();
  });
}
`;

/**
 * La carte à tampons : le pack @astratra/loyalty compte le cycle en cours. La phrase ne fixe aucune durée :
 * aucun tampon ne se perd, tous les tampons du cycle portent donc le même jour.
 */
const FIDELITE = `import { createStampCard } from '@astratra/loyalty';

/** Produit par Humalis : la carte d'un client, recalculée à chaque lecture depuis ses fiches ; rien n'est stocké. */
const SANS_DUREE = '2000-01-01';

export interface RegleFidelite {
  parFiche: number;
  objectif: number;
  recompense: string;
}

export function carteDeFidelite(fiches: number, { parFiche, objectif, recompense }: RegleFidelite) {
  const total = fiches * parFiche;
  // Chaque récompense gagnée ferme un cycle : seul le reste compte sur la carte en cours.
  const reste = total % objectif;
  const etat = createStampCard({ threshold: objectif }).evaluate({ visits: Array.from({ length: reste }, () => ({ date: SANS_DUREE })) });
  return { tampons: etat.count, objectif, restant: etat.remaining, recompenses: Math.floor(total / objectif), recompense };
}
`;

/** Une fiche d'exemple, avec les valeurs valides de chaque champ. */
function ficheExemple(serveur: ServeurRI, nom: string): string {
  const donnee = serveur.donnees.find((d) => d.nom === nom)!;
  return `{ ${donnee.champs.map((c) => `${camel(c.nom)}: ${exempleChamp(c.type)}`).join(', ')} }`;
}

const ENTETE_TESTS = (stockages: string) => `import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createMemoryUsersStore, type UsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from '../src/serveur.js';
import { creerStockageMemoire } from '../src/humalis/stockage.js';

const MOT_DE_PASSE = 'Essai-Solide-2026!';
const stockages = {
${stockages}
};
let app: Parameters<typeof request>[0];
let jetonAdmin = '';
let jetonUtilisateur = '';
const avec = (jeton: string) => ({ authorization: \`Bearer \${jeton}\` });

async function connecter(email: string): Promise<string> {
  const reponse = await request(app).post('/auth/login').send({ email, password: MOT_DE_PASSE }).expect(200);
  return reponse.body.data.token;
}

beforeAll(async () => {
  const usersStore = createMemoryUsersStore() as UsersStore;
  const passwordHash = await hashPassword(MOT_DE_PASSE);
  await usersStore.create({ email: 'admin@exemple.cd', role: 'admin', passwordHash });
  await usersStore.create({ email: 'awa@exemple.cd', role: 'utilisateur', passwordHash });
  app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages }) as never;
  jetonAdmin = await connecter('admin@exemple.cd');
  jetonUtilisateur = await connecter('awa@exemple.cd');
});
`;

/** Les tests produits du bon : les mêmes refus que la lecture de sa route, un vrai PDF, et un 404. */
function testsBon(serveur: ServeurRI): string {
  const stockages = serveur.donnees.map((d) => `  ${camel(d.nom)}: creerStockageMemoire(),`).join('\n');
  const blocs = serveur.routes.filter((r) => r.bon).map((route) => {
    const adresse = adresseApi(route.adresse);
    const refus = route.droits.lire === 'admin' || route.droits.lire?.startsWith('role:') ? [401, 403] : route.droits.lire === 'connecte' ? [401, 200] : [200, 200];
    return `describe('le bon de « ${route.donnee} »', () => {
  it('suit les droits de la lecture : visiteur ${refus[0]}, utilisateur ${refus[1]}', async () => {
    const fiche = await stockages.${camel(route.donnee)}.creer(${ficheExemple(serveur, route.donnee)});
    await request(app).get(\`${adresse}/\${fiche.id}/bon\`).expect(${refus[0]});
    await request(app).get(\`${adresse}/\${fiche.id}/bon\`).set(avec(jetonUtilisateur)).expect(${refus[1]});
  });

  it('rend un PDF à télécharger, jamais gardé en cache', async () => {
    const fiche = await stockages.${camel(route.donnee)}.creer(${ficheExemple(serveur, route.donnee)});
    const reponse = await request(app).get(\`${adresse}/\${fiche.id}/bon\`).set(avec(jetonAdmin)).buffer(true).parse((res, fin) => {
      const morceaux: Buffer[] = [];
      res.on('data', (m: Buffer) => morceaux.push(m));
      res.on('end', () => fin(null, Buffer.concat(morceaux)));
    }).expect(200);
    expect((reponse.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect(reponse.headers['content-type']).toContain('application/pdf');
    expect(reponse.headers['content-disposition']).toMatch(/^attachment; filename="bon-de-[a-z0-9-]+-[A-Za-z0-9]{1,8}\\.pdf"$/);
    expect(reponse.headers['cache-control']).toBe('private, no-store');
  });

  it('404 pour une fiche qui n\\'existe pas', async () => {
    await request(app).get('${adresse}/inconnue/bon').set(avec(jetonAdmin)).expect(404);
  });
});`;
  });
  return `// Produit par Humalis : « telecharger bon de … » du serveur « ${serveur.nom} ».
${ENTETE_TESTS(stockages)}
${blocs.join('\n\n')}
`;
}

/** Les tests produits de la carte : lecture réservée à l'admin, écritures impossibles, calcul sur de vraies fiches. */
function testsFidelite(serveur: ServeurRI): string {
  const fidelite = serveur.fidelite!;
  const stockages = serveur.donnees.map((d) => `  ${camel(d.nom)}: creerStockageMemoire(),`).join('\n');
  const stockage = `stockages.${camel(fidelite.donnee)}`;
  const fiche = (numero: string, statut: string) => `{ ...${ficheExemple(serveur, fidelite.donnee)}, ${camel(fidelite.champ)}: ${JSON.stringify(numero)}, statut: ${JSON.stringify(statut)} }`;
  const compte = fidelite.tampons * 2;
  const reste = compte % fidelite.objectif;
  return `// Produit par Humalis : « fidelite par ${fidelite.champ} de ${fidelite.donnee} » du serveur « ${serveur.nom} ».
${ENTETE_TESTS(stockages)}
describe('la carte de fidélité', () => {
  it('seul l\\'admin la lit : visiteur 401, utilisateur 403', async () => {
    await request(app).get('/api/fidelite/111').expect(401);
    await request(app).get('/api/fidelite/111').set(avec(jetonUtilisateur)).expect(403);
    await request(app).get('/api/fidelite/111').set(avec(jetonAdmin)).expect(200);
  });

  it('jamais gardée en cache, et personne n\\'y écrit', async () => {
    const reponse = await request(app).get('/api/fidelite/111').set(avec(jetonAdmin));
    expect(reponse.headers['cache-control']).toBe('private, no-store');
    for (const methode of ['post', 'patch', 'put', 'delete'] as const) {
      const ecriture = await request(app)[methode]('/api/fidelite/111').set(avec(jetonAdmin)).send({});
      expect(ecriture.status).toBeGreaterThanOrEqual(400);
    }
  });

  it('compte les fiches de ce statut, quelle que soit l\\'écriture du numéro', async () => {
    await ${stockage}.creer(${fiche('+243 848-000', fidelite.statut)});
    await ${stockage}.creer(${fiche('243848000', fidelite.statut)});
    await ${stockage}.creer(${fiche('243848000', `pas-${fidelite.statut}`)});
    await ${stockage}.creer(${fiche('999', fidelite.statut)});
    const reponse = await request(app).get('/api/fidelite/' + encodeURIComponent('+243 848 000')).set(avec(jetonAdmin)).expect(200);
    expect(reponse.body).toEqual({
      tampons: ${reste},
      objectif: ${fidelite.objectif},
      restant: ${fidelite.objectif - reste},
      recompenses: ${Math.floor(compte / fidelite.objectif)},
      recompense: ${JSON.stringify(fidelite.recompense)},
    });
  });
});
`;
}

const ROUTE_GOOGLE = `
      // « connexion google » : un compte déjà connu du serveur, dont Google confirme l'adresse, ouvre sa session.
      // Comme dans Tertius et Solvia : la première connexion lie le compte à cet identifiant Google (le « sub »),
      // et un autre compte Google portant la même adresse est ensuite refusé.
      // L'ID client se relit à chaque demande : le changer dans le coffre sert aussitôt, sans redémarrer.
      const idGoogle = () => (typeof googleClientId === 'function' ? googleClientId() : googleClientId) || null;
      let verificateur: { id: string; verifier: ReturnType<typeof createGoogleIdTokenVerifier> } | null = null;
      const verificateurGoogle = () => {
        const id = idGoogle();
        if (!id) return null;
        if (verificateur?.id !== id) verificateur = { id, verifier: createGoogleIdTokenVerifier({ audiences: [id] }) };
        return verificateur.verifier;
      };
      const routeGoogle = express.Router();
      routeGoogle.get('/', (_req, res) => {
        res.json({ clientId: idGoogle() });
      });
      routeGoogle.post('/', createLoginLimiter() as unknown as RequestHandler, csrfMiddleware, async (req, res, next) => {
        const google = verificateurGoogle();
        if (!google) {
          res.status(503).json({ erreur: "la connexion avec Google n'est pas réglée sur ce serveur (GOOGLE_CLIENT_ID)" });
          return;
        }
        try {
          const corps = (req.body ?? {}) as { idToken?: unknown; nonce?: unknown };
          const profil = await google(String(corps.idToken ?? ''), typeof corps.nonce === 'string' ? { nonce: corps.nonce } : undefined);
          if (!profil.email || !profil.emailVerified) {
            res.status(403).json({ erreur: "Google n'a pas confirmé l'adresse de ce compte" });
            return;
          }
          const compte = await usersStore.findByEmail(profil.email);
          if (!compte) {
            res.status(403).json({ erreur: "ce compte Google n'a pas accès à l'application" });
            return;
          }
          if (typeof compte.googleSubject === 'string' && compte.googleSubject !== profil.subject) {
            res.status(403).json({ erreur: 'cette adresse est déjà liée à un autre compte Google' });
            return;
          }
          const lie = compte.googleSubject === profil.subject ? compte : ((await usersStore.update(String(compte.id), { googleSubject: profil.subject })) ?? compte);
          res.json(await issueSession(res, lie));
        } catch (erreur) {
          if (erreur instanceof IdTokenError) {
            res.status(401).json({ erreur: "la connexion avec Google n'a pas pu être vérifiée" });
            return;
          }
          next(erreur);
        }
      });
      app.use('/auth/google', routeGoogle);
`;
