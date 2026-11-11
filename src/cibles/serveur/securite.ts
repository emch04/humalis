/**
 * Les clés d'accès (« connexion par cle d'acces ») et le code à six chiffres (« double authentification »).
 *
 * Le contrat, le même pour toutes les cibles :
 *   POST /auth/login → si le compte a le code : { data: { etape: 'code', jeton } }, pas de session
 *   POST /auth/double/verifier { jeton, code } → la session (comme /auth/login)
 *   GET  /auth/double → { actif, codesRestants, motDePasseRequis }
 *   POST /auth/double/activer { motDePasse? } → { secret, uri }
 *   POST /auth/double/confirmer { code } → { codesSecours }
 *   POST /auth/double/codes { code } → { codesSecours }
 *   POST /auth/double/desactiver { code } → 204
 *   POST /auth/cle-acces/inscription/options { motDePasse? } → les options WebAuthn
 *   POST /auth/cle-acces/inscription/verifier { reponse, nom? } → { verifie: true }
 *   POST /auth/cle-acces/connexion/options → { ceremonie, options }
 *   POST /auth/cle-acces/connexion/verifier { ceremonie, reponse } → la session (comme /auth/login)
 *   GET  /auth/cle-acces, DELETE /auth/cle-acces/:id
 *
 * Tout ce qui touche WebAuthn passe par createWebauthnService de @astratra/security.
 */
import type { ServeurRI } from '../../ri/types.js';

export const avecSecurite = (serveur: ServeurRI) => Boolean(serveur.connexionCleAcces || serveur.doubleAuthentification);

/** Dans creerServeur, une fois usersStore connu. */
export function codeCreationSecurite(serveur: ServeurRI): string {
  return `  const securite = creerSecurite({
    usersStore,
    magasin: magasinSecurite,
    jwtSecret,
    nom: ${JSON.stringify(serveur.nom)},
    verifierMotDePasse: async (compte, motDePasse) => typeof compte.passwordHash === 'string' && verifyPasswordHash(motDePasse, compte.passwordHash),
  });
`;
}

/** Les routes, dans extendRoutes. */
export function codeRoutesSecurite(serveur: ServeurRI): string {
  const lignes: string[] = [`
      // Les portes où l'on devine un secret : limitées par adresse, en plus du compteur de chaque compte.
      const limiteSecurite = createLoginLimiter({ max: 30 }) as unknown as RequestHandler;
      const routeSecurite = express.Router();`];
  if (serveur.doubleAuthentification) {
    lignes.push(`      // « double authentification » : le code à six chiffres, après le mot de passe.
      routeSecurite.post('/auth/double/verifier', limiteSecurite, securite.verifierCode(issueSession));
      routeSecurite.get('/auth/double', lecturePrivee, ...acces.connecte, securite.etatDouble);
      routeSecurite.post('/auth/double/activer', limiteSecurite, ...acces.connecte, csrfMiddleware, securite.activerDouble);
      routeSecurite.post('/auth/double/confirmer', limiteSecurite, ...acces.connecte, csrfMiddleware, securite.confirmerDouble);
      routeSecurite.post('/auth/double/codes', limiteSecurite, ...acces.connecte, csrfMiddleware, securite.nouveauxCodes);
      routeSecurite.post('/auth/double/desactiver', limiteSecurite, ...acces.connecte, csrfMiddleware, securite.desactiverDouble);`);
  }
  if (serveur.connexionCleAcces) {
    lignes.push(`      // « connexion par cle d'acces » : Face ID, Touch ID, Windows Hello. Une clé vaut déjà deux facteurs : elle ne demande pas de code.
      routeSecurite.post('/auth/cle-acces/connexion/options', limiteSecurite, securite.optionsConnexionCle);
      routeSecurite.post('/auth/cle-acces/connexion/verifier', limiteSecurite, securite.verifierConnexionCle(issueSession));
      routeSecurite.post('/auth/cle-acces/inscription/options', limiteSecurite, ...acces.connecte, csrfMiddleware, securite.optionsInscriptionCle);
      routeSecurite.post('/auth/cle-acces/inscription/verifier', limiteSecurite, ...acces.connecte, csrfMiddleware, securite.verifierInscriptionCle);
      routeSecurite.get('/auth/cle-acces', lecturePrivee, ...acces.connecte, securite.listerCles);
      routeSecurite.delete('/auth/cle-acces/:id', ...acces.connecte, csrfMiddleware, securite.retirerCle);
      // Ce que l'iPhone et Android lisent pour accepter ce domaine (WEBAUTHN_APPLE_APP, WEBAUTHN_ANDROID_APP).
      routeSecurite.get('/.well-known/apple-app-site-association', securite.associationApple);
      routeSecurite.get('/.well-known/assetlinks.json', securite.liensAndroid);`);
  }
  lignes.push('      app.use(routeSecurite);');
  return lignes.join('\n') + '\n';
}

/** Dans « avant », devant le pack : le mot de passe juste ne suffit plus quand le compte a le code. */
export function codeAvantSecurite(serveur: ServeurRI): string {
  return serveur.doubleAuthentification ? "\n  avant.post('/auth/login', createLoginLimiter({ max: 30 }) as unknown as RequestHandler, express.json({ limit: '16kb' }), securite.apresMotDePasse);" : '';
}

export function envSecurite(serveur: ServeurRI): string {
  return `${serveur.doubleAuthentification ? `# La double authentification chiffre ses secrets avec ENCRYPTION_KEY (openssl rand -base64 32) : sans elle, elle reste fermée.
` : ''}${serveur.connexionCleAcces ? `# Les clés d'accès : les adresses exactes du site, séparées par des virgules. La première donne le domaine des clés.
WEBAUTHN_ALLOWED_ORIGINS=
# Le nom montré par le système au moment de créer une clé.
WEBAUTHN_RP_NAME=
# Pour l'application iPhone et Mac : équipe et identifiant, par exemple ABCDE12345.dev.exemple.app.
WEBAUTHN_APPLE_APP=
# Pour l'application Android : le nom du paquet, puis les empreintes SHA-256 de sa signature, séparés par des virgules.
WEBAUTHN_ANDROID_APP=
` : ''}`;
}

/** src/humalis/securite.ts */
export const SECURITE = String.raw`import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { createFieldCipher, createWebauthnService, hashRecoveryCode, type WebauthnStore } from '@astratra/security';
import type { SaasUser, UsersStore } from '@astratra/saas-kit';
import type { Request, RequestHandler, Response } from 'express';
import type { PoolPostgres } from './stockage.js';

/**
 * Produit par Humalis : les clés d'accès et le code à six chiffres (RFC 6238, SHA-1, 30 secondes).
 * Le secret est chiffré en base ; un même code ne sert qu'une fois ; cinq erreurs ferment le compte
 * un quart d'heure, et les codes de secours ne sont gardés qu'en empreinte.
 */
const PAS = 30;
const CHIFFRES = 6;
const ESSAIS = 5;
const BLOCAGE = 15 * 60 * 1000;
const DUREE_ETAPE = 5 * 60 * 1000;
const NOMBRE_CODES = 10;
const CODE_TOTP = /^\d{6}$/;
const CODE_SECOURS = /^[0-9a-f]{4}-[0-9a-f]{4}$/i;

type Compte = SaasUser & { passwordHash?: unknown };

export interface LigneDouble {
  secret: string;
  actif: boolean;
  dernierPas: number;
  echecs: number;
  bloqueJusqua: number;
}
export interface MagasinDouble {
  lire(compte: string): Promise<LigneDouble | null>;
  /** Un secret en attente de confirmation ; un secret déjà actif n'est jamais remplacé. */
  preparer(compte: string, secret: string): Promise<boolean>;
  activer(compte: string, pas: number, empreintes: string[]): Promise<void>;
  retirer(compte: string): Promise<void>;
  /** Vrai si ce pas n'a jamais servi : deux envois du même code, un seul passe. */
  consommerPas(compte: string, pas: number): Promise<boolean>;
  echec(compte: string, bloqueJusqua: number): Promise<void>;
  remettre(compte: string): Promise<void>;
  enregistrerCodes(compte: string, empreintes: string[]): Promise<void>;
  consommerCode(compte: string, empreinte: string): Promise<boolean>;
  compterCodes(compte: string): Promise<number>;
}
export type MagasinCles = WebauthnStore & {
  retirer(compte: string, id: string): Promise<boolean>;
};
export interface MagasinSecurite {
  double: MagasinDouble;
  cles: MagasinCles;
}

export function creerMagasinSecuriteMemoire(): MagasinSecurite {
  const lignes = new Map<string, LigneDouble>();
  const codes = new Map<string, Set<string>>();
  const cles = new Map<string, Record<string, unknown> & { credentialID: string; userId: string }>();
  const defis = new Map<string, Record<string, unknown> & { challenge: string }>();
  return {
    double: {
      async lire(compte) {
        const l = lignes.get(compte);
        return l ? { ...l } : null;
      },
      async preparer(compte, secret) {
        if (lignes.get(compte)?.actif) return false;
        lignes.set(compte, { secret, actif: false, dernierPas: -1, echecs: 0, bloqueJusqua: 0 });
        return true;
      },
      async activer(compte, pas, empreintes) {
        const l = lignes.get(compte);
        if (l) Object.assign(l, { actif: true, dernierPas: pas, echecs: 0, bloqueJusqua: 0 });
        codes.set(compte, new Set(empreintes));
      },
      async retirer(compte) {
        lignes.delete(compte);
        codes.delete(compte);
      },
      async consommerPas(compte, pas) {
        const l = lignes.get(compte);
        if (!l || l.dernierPas >= pas) return false;
        Object.assign(l, { dernierPas: pas, echecs: 0, bloqueJusqua: 0 });
        return true;
      },
      async echec(compte, bloqueJusqua) {
        const l = lignes.get(compte);
        if (!l) return;
        l.echecs += 1;
        if (l.echecs >= ESSAIS) Object.assign(l, { echecs: 0, bloqueJusqua });
      },
      async remettre(compte) {
        const l = lignes.get(compte);
        if (l) Object.assign(l, { echecs: 0, bloqueJusqua: 0 });
      },
      async enregistrerCodes(compte, empreintes) {
        codes.set(compte, new Set(empreintes));
      },
      async consommerCode(compte, empreinte) {
        return codes.get(compte)?.delete(empreinte) ?? false;
      },
      async compterCodes(compte) {
        return codes.get(compte)?.size ?? 0;
      },
    },
    cles: {
      async getCredentialsForUser(compte) {
        if (compte.startsWith('ceremonie:')) return [{ id: 'AA', credentialID: 'AA', userId: compte, publicKey: '', counter: 0 }];
        return [...cles.values()].filter((c) => c.userId === compte) as never;
      },
      async saveCredential(compte, cle) {
        cles.set(cle.credentialID, { ...cle, id: cle.credentialID, userId: compte, creeLe: Date.now() });
      },
      async getCredentialById(id) {
        return (cles.get(id) ?? null) as never;
      },
      async updateCredentialCounter(id, compteur) {
        const cle = cles.get(id);
        if (cle) Object.assign(cle, { counter: compteur, utiliseeLe: Date.now() });
      },
      async saveChallenge(compte, defi, type, metadata) {
        defis.set(compte + ' ' + type, { challenge: defi, ...metadata });
      },
      async consumeChallenge(compte, type) {
        const defi = defis.get(compte + ' ' + type) ?? null;
        defis.delete(compte + ' ' + type);
        return defi as never;
      },
      async retirer(compte, id) {
        if (cles.get(id)?.userId !== compte) return false;
        return cles.delete(id);
      },
    },
  };
}

export function creerMagasinSecuritePostgres(pool: PoolPostgres): MagasinSecurite {
  let prete: Promise<unknown> | undefined;
  const preparerTables = () =>
    (prete ??= pool
      .query(
        'CREATE TABLE IF NOT EXISTS humalis_double_auth (compte TEXT PRIMARY KEY, secret TEXT NOT NULL, actif BOOLEAN NOT NULL DEFAULT false, dernier_pas BIGINT NOT NULL DEFAULT -1, echecs INTEGER NOT NULL DEFAULT 0, bloque_jusqua BIGINT NOT NULL DEFAULT 0);' +
          'CREATE TABLE IF NOT EXISTS humalis_double_auth_codes (compte TEXT NOT NULL, empreinte TEXT NOT NULL, PRIMARY KEY (compte, empreinte));' +
          'CREATE TABLE IF NOT EXISTS humalis_cles_acces (id TEXT PRIMARY KEY, compte TEXT NOT NULL, donnees JSONB NOT NULL, cree_le TIMESTAMPTZ NOT NULL DEFAULT now());' +
          'CREATE INDEX IF NOT EXISTS humalis_cles_acces_compte ON humalis_cles_acces (compte);' +
          'CREATE TABLE IF NOT EXISTS humalis_cles_defis (compte TEXT NOT NULL, type TEXT NOT NULL, donnees JSONB NOT NULL, cree_le TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (compte, type));',
      )
      .catch((erreur: unknown) => {
        prete = undefined;
        throw erreur;
      }));
  const q = async (texte: string, valeurs?: unknown[]) => {
    await preparerTables();
    return pool.query(texte, valeurs);
  };
  const remplacerCodes = async (compte: string, empreintes: string[]) => {
    // Une seule requête : tout ou rien, sans transaction à porter.
    await q('WITH retires AS (DELETE FROM humalis_double_auth_codes WHERE compte = $1) INSERT INTO humalis_double_auth_codes (compte, empreinte) SELECT $1, unnest($2::text[])', [compte, empreintes]);
  };
  return {
    double: {
      async lire(compte) {
        const l = (await q('SELECT * FROM humalis_double_auth WHERE compte = $1', [compte])).rows[0];
        return l ? { secret: String(l.secret), actif: l.actif === true, dernierPas: Number(l.dernier_pas), echecs: Number(l.echecs), bloqueJusqua: Number(l.bloque_jusqua) } : null;
      },
      async preparer(compte, secret) {
        const { rows } = await q('INSERT INTO humalis_double_auth (compte, secret) VALUES ($1, $2) ON CONFLICT (compte) DO UPDATE SET secret = EXCLUDED.secret, dernier_pas = -1, echecs = 0, bloque_jusqua = 0 WHERE NOT humalis_double_auth.actif RETURNING compte', [compte, secret]);
        return rows.length === 1;
      },
      async activer(compte, pas, empreintes) {
        await q('UPDATE humalis_double_auth SET actif = true, dernier_pas = $2, echecs = 0, bloque_jusqua = 0 WHERE compte = $1', [compte, pas]);
        await remplacerCodes(compte, empreintes);
      },
      async retirer(compte) {
        await q('WITH codes AS (DELETE FROM humalis_double_auth_codes WHERE compte = $1) DELETE FROM humalis_double_auth WHERE compte = $1', [compte]);
      },
      async consommerPas(compte, pas) {
        return (await q('UPDATE humalis_double_auth SET dernier_pas = $2, echecs = 0, bloque_jusqua = 0 WHERE compte = $1 AND dernier_pas < $2 RETURNING compte', [compte, pas])).rows.length === 1;
      },
      async echec(compte, bloqueJusqua) {
        await q('UPDATE humalis_double_auth SET bloque_jusqua = CASE WHEN echecs + 1 >= $3 THEN $2 ELSE bloque_jusqua END, echecs = CASE WHEN echecs + 1 >= $3 THEN 0 ELSE echecs + 1 END WHERE compte = $1', [compte, bloqueJusqua, ESSAIS]);
      },
      async remettre(compte) {
        await q('UPDATE humalis_double_auth SET echecs = 0, bloque_jusqua = 0 WHERE compte = $1', [compte]);
      },
      enregistrerCodes: remplacerCodes,
      async consommerCode(compte, empreinte) {
        return (await q('DELETE FROM humalis_double_auth_codes WHERE compte = $1 AND empreinte = $2 RETURNING compte', [compte, empreinte])).rows.length === 1;
      },
      async compterCodes(compte) {
        return Number((await q('SELECT count(*)::int AS n FROM humalis_double_auth_codes WHERE compte = $1', [compte])).rows[0]!.n);
      },
    },
    cles: {
      async getCredentialsForUser(compte) {
        if (compte.startsWith('ceremonie:')) return [{ id: 'AA', credentialID: 'AA', userId: compte, publicKey: '', counter: 0 }];
        return (await q('SELECT donnees FROM humalis_cles_acces WHERE compte = $1 ORDER BY cree_le', [compte])).rows.map((l) => l.donnees) as never;
      },
      async saveCredential(compte, cle) {
        const donnees = { ...cle, id: cle.credentialID, userId: compte, creeLe: Date.now() };
        await q('INSERT INTO humalis_cles_acces (id, compte, donnees) VALUES ($1, $2, $3)', [cle.credentialID, compte, JSON.stringify(donnees)]);
      },
      async getCredentialById(id) {
        return ((await q('SELECT donnees FROM humalis_cles_acces WHERE id = $1', [id])).rows[0]?.donnees ?? null) as never;
      },
      async updateCredentialCounter(id, compteur) {
        await q("UPDATE humalis_cles_acces SET donnees = donnees || jsonb_build_object('counter', $2::bigint, 'utiliseeLe', $3::bigint) WHERE id = $1", [id, compteur, Date.now()]);
      },
      async saveChallenge(compte, defi, type, metadata) {
        // Le ménage des défis abandonnés, à chaque nouveau défi.
        await q("DELETE FROM humalis_cles_defis WHERE cree_le < now() - interval '1 hour'");
        await q('INSERT INTO humalis_cles_defis (compte, type, donnees) VALUES ($1, $2, $3) ON CONFLICT (compte, type) DO UPDATE SET donnees = EXCLUDED.donnees, cree_le = now()', [compte, type, JSON.stringify({ challenge: defi, ...metadata })]);
      },
      async consumeChallenge(compte, type) {
        return ((await q('DELETE FROM humalis_cles_defis WHERE compte = $1 AND type = $2 RETURNING donnees', [compte, type])).rows[0]?.donnees ?? null) as never;
      },
      async retirer(compte, id) {
        return (await q('DELETE FROM humalis_cles_acces WHERE compte = $1 AND id = $2 RETURNING id', [compte, id])).rows.length === 1;
      },
    },
  };
}

/** Un compte retiré : s'il est invité de nouveau, il repart sans ses anciennes clés ni son ancien secret. */
export async function oublierCompte(magasin: MagasinSecurite, compte: string): Promise<void> {
  await magasin.double.retirer(compte);
  for (const cle of await magasin.cles.getCredentialsForUser(compte)) await magasin.cles.retirer(compte, String(cle.credentialID ?? cle.id));
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function enBase32(octets: Buffer): string {
  let bits = 0, valeur = 0, texte = '';
  for (const octet of octets) {
    valeur = (valeur << 8) | octet;
    bits += 8;
    while (bits >= 5) {
      texte += ALPHABET[(valeur >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) texte += ALPHABET[(valeur << (5 - bits)) & 31];
  return texte;
}

/** Le code d'un pas de temps (RFC 4226, tronqué à six chiffres). */
export function codeDuPas(secret: Buffer, pas: number): string {
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(pas));
  const empreinte = createHmac('sha1', secret).update(compteur).digest();
  const debut = empreinte[empreinte.length - 1]! & 0x0f;
  return String(empreinte.readUInt32BE(debut) & 0x7fffffff).slice(-CHIFFRES).padStart(CHIFFRES, '0');
}

/** Le pas auquel ce code correspond, à trente secondes près ; null s'il ne correspond à aucun. */
export function pasDuCode(secret: Buffer, code: string, maintenant: number): number | null {
  const courant = Math.floor(maintenant / 1000 / PAS);
  const attendu = Buffer.from(code);
  let trouve: number | null = null;
  // Toujours les trois comparaisons : la durée ne dit rien du pas qui a correspondu.
  for (const pas of [courant - 1, courant, courant + 1]) {
    if (pas >= 0 && timingSafeEqual(Buffer.from(codeDuPas(secret, pas)), attendu)) trouve = pas;
  }
  return trouve;
}

const codeDeSecours = () => {
  const brut = randomBytes(4).toString('hex');
  return brut.slice(0, 4) + '-' + brut.slice(4);
};

class Refus extends Error {
  constructor(readonly statut: number, message: string, readonly plus: Record<string, unknown> = {}) {
    super(message);
  }
}

type IssueSession = (res: unknown, compte: unknown) => Promise<object>;

export function creerSecurite({
  usersStore,
  magasin,
  jwtSecret,
  nom,
  verifierMotDePasse,
  env = process.env,
  horloge = Date.now,
}: {
  usersStore: UsersStore;
  magasin: MagasinSecurite;
  jwtSecret: string;
  nom: string;
  verifierMotDePasse: (compte: Compte, motDePasse: string) => Promise<boolean>;
  env?: Record<string, string | undefined>;
  horloge?: () => number;
}) {
  const deriver = (info: string, source: Buffer) => Buffer.from(hkdfSync('sha256', source, 'humalis', info, 32));
  const cleEtape = deriver('etape-double-authentification', Buffer.from(jwtSecret));

  /** La clé de chiffrement, dérivée pour cet usage ; null si ENCRYPTION_KEY manque : tout reste fermé. */
  const coffre = () => {
    const brut = (env.ENCRYPTION_KEY ?? '').trim();
    const base64 = Buffer.from(brut, 'base64');
    const hex = Buffer.from(brut, 'hex');
    const octets = base64.length === 32 ? base64 : hex.length === 32 ? hex : null;
    if (!octets) return null;
    return { chiffre: createFieldCipher({ key: deriver('double-authentification', octets) }), secours: deriver('codes-de-secours', octets).toString('hex') };
  };
  const coffreOuvert = () => {
    const ouvert = coffre();
    if (!ouvert) throw new Refus(503, "la double authentification n'est pas réglée sur ce serveur (ENCRYPTION_KEY)");
    return ouvert;
  };

  const signer = (texte: string) => createHmac('sha256', cleEtape).update(texte).digest('base64url');
  const creerJeton = (compte: string) => {
    const corps = Buffer.from(JSON.stringify({ compte, fin: horloge() + DUREE_ETAPE, n: randomBytes(8).toString('hex') })).toString('base64url');
    return corps + '.' + signer(corps);
  };
  const lireJeton = (jeton: unknown): string | null => {
    if (typeof jeton !== 'string') return null;
    const [corps, signature] = jeton.split('.');
    if (!corps || !signature) return null;
    const attendue = Buffer.from(signer(corps));
    const recue = Buffer.from(signature);
    if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return null;
    const { compte, fin } = JSON.parse(Buffer.from(corps, 'base64url').toString()) as { compte: string; fin: number };
    return fin > horloge() ? compte : null;
  };

  const moiDe = (req: Request) => String((req as unknown as { user?: { id?: unknown } }).user?.id ?? '');
  const compteDe = async (id: string) => {
    const compte = (await usersStore.findById(id)) as Compte | null;
    if (!compte) throw new Refus(401, 'connectez-vous pour continuer');
    return compte;
  };

  /** Les actions qui protègent le compte redemandent le mot de passe : une session volée ne les fait pas. */
  async function preuveDuMotDePasse(req: Request) {
    const compte = await compteDe(moiDe(req));
    if (typeof compte.passwordHash !== 'string') return compte;
    const motDePasse = (req.body as { motDePasse?: unknown } | undefined)?.motDePasse;
    if (typeof motDePasse !== 'string' || !(await verifierMotDePasse(compte, motDePasse))) throw new Refus(403, 'ce mot de passe est incorrect', { motDePasseRequis: true });
    return compte;
  }

  /** Vérifie un code d'un compte actif, avec la limite des essais. */
  async function verifierPourCompte(id: string, code: unknown): Promise<void> {
    const ouvert = coffreOuvert();
    const ligne = await magasin.double.lire(id);
    if (!ligne?.actif) throw new Refus(400, "la double authentification n'est pas active sur ce compte");
    if (ligne.bloqueJusqua > horloge()) throw new Refus(429, 'trop de codes incorrects : réessayez dans quelques minutes');
    const texte = typeof code === 'string' ? code.replace(/\s/g, '') : '';
    if (CODE_SECOURS.test(texte)) {
      if (await magasin.double.consommerCode(id, hashRecoveryCode(texte, ouvert.secours))) {
        await magasin.double.remettre(id);
        return;
      }
    } else if (CODE_TOTP.test(texte)) {
      const pas = pasDuCode(Buffer.from(ouvert.chiffre.decrypt(ligne.secret), 'hex'), texte, horloge());
      if (pas !== null && (await magasin.double.consommerPas(id, pas))) return;
    }
    await magasin.double.echec(id, horloge() + BLOCAGE);
    throw new Refus(401, 'ce code est incorrect');
  }

  const genererCodes = (secours: string) => {
    const codes = Array.from({ length: NOMBRE_CODES }, codeDeSecours);
    return { codes, empreintes: codes.map((c) => hashRecoveryCode(c, secours)) };
  };

  /** Un gestionnaire : un refus devient sa réponse, le reste part à la gestion des erreurs. */
  const route = (corps: (req: Request, res: Response) => Promise<void>): RequestHandler => (req, res, next) => {
    corps(req, res).catch((erreur: unknown) => {
      if (erreur instanceof Refus) res.status(erreur.statut).json({ erreur: erreur.message, ...erreur.plus });
      else if (typeof (erreur as { statusCode?: unknown }).statusCode === 'number' && (erreur as { statusCode: number }).statusCode < 500) res.status((erreur as { statusCode: number }).statusCode).json({ erreur: "cette clé d'accès n'a pas pu être vérifiée" });
      else next(erreur);
    });
  };

  // Android signe avec l'empreinte de l'application : son origine n'est pas une adresse web.
  const origineAndroid = (req: Request): string | undefined => {
    const demandee = req.headers['x-humalis-origine'];
    if (typeof demandee !== 'string' || !demandee.startsWith('android:apk-key-hash:')) return undefined;
    const [, ...empreintes] = (env.WEBAUTHN_ANDROID_APP ?? '').split(',').map((v) => v.trim()).filter(Boolean);
    const permises = empreintes.map((e) => 'android:apk-key-hash:' + Buffer.from(e.replace(/:/g, ''), 'hex').toString('base64url'));
    if (!permises.includes(demandee)) throw new Refus(403, "cette application n'est pas autorisée sur ce serveur");
    return demandee;
  };
  const reglagesCles = () => {
    const origines = (env.WEBAUTHN_ALLOWED_ORIGINS ?? '').split(',').map((v) => v.trim()).filter(Boolean);
    return { allowedOrigins: origines, ...(env.HUMALIS_ADRESSE_SITE ? { clientUrl: env.HUMALIS_ADRESSE_SITE } : {}), rpName: env.WEBAUTHN_RP_NAME || nom, recoveryCodeSecret: createHash('sha256').update(jwtSecret + ':cles').digest('hex') };
  };
  /** Le service du pack, pour cette requête : le défi d'une application Android porte son origine à elle. */
  const serviceCles = (origine: string | undefined) => {
    const store: WebauthnStore = {
      ...magasin.cles,
      saveChallenge: (compte, defi, type, metadata) => magasin.cles.saveChallenge(compte, defi, type, origine ? { ...metadata, origin: origine } : metadata),
      // Les codes de secours sont ceux de la double authentification : une clé n'en crée pas d'autres.
      saveRecoveryCodes: async () => undefined,
      consumeRecoveryCode: async () => false,
    };
    return createWebauthnService(store, reglagesCles());
  };
  // Une application native n'envoie pas d'Origin : le domaine des clés est la première adresse réglée.
  const requeteCles = (req: Request) => (req.headers.origin ? req : ({ headers: {} } as Request));

  return {
    /** Devant /auth/login : le mot de passe est juste et le compte a le code → l'étape suivante, pas de session. */
    apresMotDePasse: ((req, res, next) => {
      void (async () => {
        const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
        if (typeof email !== 'string' || typeof password !== 'string') return next();
        const compte = (await usersStore.findByEmail(email)) as Compte | null;
        if (!compte) return next();
        const id = String(compte.id);
        const ligne = await magasin.double.lire(id);
        if (!ligne?.actif) return next();
        // Un mot de passe faux continue vers le pack, qui répond et compte l'essai.
        if (!(await verifierMotDePasse(compte, password))) return next();
        res.json({ message: 'Second factor required', data: { etape: 'code', jeton: creerJeton(id) } });
      })().catch(next);
    }) as RequestHandler,

    verifierCode: (issueSession: IssueSession) =>
      route(async (req, res) => {
        const { jeton, code } = (req.body ?? {}) as { jeton?: unknown; code?: unknown };
        const id = lireJeton(jeton);
        if (!id) throw new Refus(401, 'cette connexion a expiré : recommencez');
        await verifierPourCompte(id, code);
        const compte = await compteDe(id);
        res.json({ message: 'Login successful', data: await issueSession(res, compte) });
      }),

    etatDouble: route(async (req, res) => {
      const id = moiDe(req);
      const ligne = await magasin.double.lire(id);
      const compte = await compteDe(id);
      res.json({ actif: ligne?.actif === true, codesRestants: ligne?.actif ? await magasin.double.compterCodes(id) : 0, motDePasseRequis: typeof compte.passwordHash === 'string' });
    }),

    activerDouble: route(async (req, res) => {
      const ouvert = coffreOuvert();
      const compte = await preuveDuMotDePasse(req);
      const id = String(compte.id);
      const secret = randomBytes(20);
      if (!(await magasin.double.preparer(id, ouvert.chiffre.encrypt(secret.toString('hex'))))) throw new Refus(409, 'la double authentification est déjà active sur ce compte');
      const base32 = enBase32(secret);
      const libelle = encodeURIComponent(nom) + ':' + encodeURIComponent(String(compte.email ?? id));
      res.json({ secret: base32, uri: 'otpauth://totp/' + libelle + '?secret=' + base32 + '&issuer=' + encodeURIComponent(nom) + '&algorithm=SHA1&digits=' + CHIFFRES + '&period=' + PAS });
    }),

    confirmerDouble: route(async (req, res) => {
      const ouvert = coffreOuvert();
      const id = moiDe(req);
      const ligne = await magasin.double.lire(id);
      if (!ligne) throw new Refus(400, "commencez par demander le code QR");
      if (ligne.actif) throw new Refus(409, 'la double authentification est déjà active sur ce compte');
      if (ligne.bloqueJusqua > horloge()) throw new Refus(429, 'trop de codes incorrects : réessayez dans quelques minutes');
      const code = (req.body as { code?: unknown } | undefined)?.code;
      const pas = typeof code === 'string' && CODE_TOTP.test(code.trim()) ? pasDuCode(Buffer.from(ouvert.chiffre.decrypt(ligne.secret), 'hex'), code.trim(), horloge()) : null;
      if (pas === null) {
        await magasin.double.echec(id, horloge() + BLOCAGE);
        throw new Refus(401, 'ce code est incorrect');
      }
      const { codes, empreintes } = genererCodes(ouvert.secours);
      await magasin.double.activer(id, pas, empreintes);
      res.json({ codesSecours: codes });
    }),

    nouveauxCodes: route(async (req, res) => {
      const ouvert = coffreOuvert();
      const id = moiDe(req);
      await verifierPourCompte(id, (req.body as { code?: unknown } | undefined)?.code);
      const { codes, empreintes } = genererCodes(ouvert.secours);
      await magasin.double.enregistrerCodes(id, empreintes);
      res.json({ codesSecours: codes });
    }),

    desactiverDouble: route(async (req, res) => {
      const id = moiDe(req);
      await verifierPourCompte(id, (req.body as { code?: unknown } | undefined)?.code);
      await magasin.double.retirer(id);
      res.status(204).end();
    }),

    optionsInscriptionCle: route(async (req, res) => {
      const compte = await preuveDuMotDePasse(req);
      res.json(await serviceCles(origineAndroid(req)).getRegistrationOptions(requeteCles(req) as never, String(compte.id), String(compte.email ?? compte.id)));
    }),

    verifierInscriptionCle: route(async (req, res) => {
      const { reponse, nom: appareil } = (req.body ?? {}) as { reponse?: unknown; nom?: unknown };
      if (typeof reponse !== 'object' || reponse === null) throw new Refus(400, 'réponse manquante');
      await serviceCles(undefined).verifyRegistration(moiDe(req), reponse as never, typeof appareil === 'string' ? appareil.slice(0, 80) : 'Appareil');
      res.json({ verifie: true });
    }),

    /** Sans adresse : c'est l'appareil qui propose ses clés (clé découvrable). */
    optionsConnexionCle: route(async (req, res) => {
      const ceremonie = 'ceremonie:' + randomBytes(24).toString('hex');
      const options = await serviceCles(origineAndroid(req)).getAuthenticationOptions(requeteCles(req) as never, ceremonie);
      res.json({ ceremonie, options: { ...(options as object), allowCredentials: [] } });
    }),

    verifierConnexionCle: (issueSession: IssueSession) =>
      route(async (req, res) => {
        const { ceremonie, reponse } = (req.body ?? {}) as { ceremonie?: unknown; reponse?: { id?: unknown; response?: { userHandle?: unknown } } };
        if (typeof ceremonie !== 'string' || !ceremonie.startsWith('ceremonie:') || typeof reponse?.id !== 'string') throw new Refus(400, 'réponse manquante');
        const defi = await magasin.cles.consumeChallenge(ceremonie, 'authentication');
        const cle = await magasin.cles.getCredentialById(reponse.id);
        if (!defi || !cle) throw new Refus(401, "cette clé d'accès n'est pas reconnue");
        const proprietaire = String(cle.userId);
        // L'identifiant porté par la clé, quand l'appareil le donne, doit être celui de son propriétaire.
        if (typeof reponse.response?.userHandle === 'string' && reponse.response.userHandle !== '' && Buffer.from(reponse.response.userHandle, 'base64url').toString() !== proprietaire) throw new Refus(401, "cette clé d'accès n'est pas reconnue");
        const { challenge, ...metadata } = defi as { challenge: string } & Record<string, unknown>;
        await magasin.cles.saveChallenge(proprietaire, challenge, 'authentication', metadata as never);
        await serviceCles(undefined).verifyAuthentication(proprietaire, reponse as never);
        const compte = await compteDe(proprietaire);
        res.json({ message: 'Login successful', data: await issueSession(res, compte) });
      }),

    listerCles: route(async (req, res) => {
      const cles = await magasin.cles.getCredentialsForUser(moiDe(req));
      res.json(cles.map((c) => ({ id: c.credentialID ?? c.id, nom: (c as { deviceName?: unknown }).deviceName ?? 'Appareil', creeLe: (c as { creeLe?: unknown }).creeLe ?? null })));
    }),

    retirerCle: route(async (req, res) => {
      if (await magasin.cles.retirer(moiDe(req), String(req.params.id))) res.status(204).end();
      else res.status(404).json({ erreur: "cette clé d'accès n'existe pas" });
    }),

    associationApple: ((_req, res) => {
      const app = (env.WEBAUTHN_APPLE_APP ?? '').trim();
      if (!app) return void res.status(404).end();
      res.type('application/json').send(JSON.stringify({ webcredentials: { apps: [app] } }));
    }) as RequestHandler,

    liensAndroid: ((_req, res) => {
      const [paquet, ...empreintes] = (env.WEBAUTHN_ANDROID_APP ?? '').split(',').map((v) => v.trim()).filter(Boolean);
      if (!paquet || empreintes.length === 0) return void res.status(404).end();
      res.json([{ relation: ['delegate_permission/common.get_login_creds', 'delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: paquet, sha256_cert_fingerprints: empreintes } }]);
    }) as RequestHandler,
  };
}
`;

/** tests/securite.test.ts */
export function testsSecurite(serveur: ServeurRI, stockages: string): string {
  const blocs: string[] = [];
  if (serveur.doubleAuthentification) {
    blocs.push(`  it('les vecteurs de la RFC 6238 (huit chiffres ramenés à six)', () => {
    const secret = Buffer.from('12345678901234567890');
    expect(codeDuPas(secret, 1)).toBe('287082');
    expect(codeDuPas(secret, 37037036)).toBe('081804');
    expect(codeDuPas(secret, 37037037)).toBe('050471');
    expect(enBase32(secret)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });

  it('activer, puis se connecter en deux étapes ; un code ne sert qu\\'une fois', async () => {
    const { app, entree, maintenant } = await preparer();
    await request(app).post('/auth/double/activer').set(entree).send({ motDePasse: 'mauvais' }).expect(403);
    const activation = await request(app).post('/auth/double/activer').set(entree).send({ motDePasse: MOT_DE_PASSE }).expect(200);
    expect(activation.body.uri).toContain('otpauth://totp/');
    const secret = decoder(activation.body.secret);
    const pas = Math.floor(maintenant.v / 30000);
    await request(app).post('/auth/double/confirmer').set(entree).send({ code: '000000' }).expect(401);
    const confirme = await request(app).post('/auth/double/confirmer').set(entree).send({ code: codeDuPas(secret, pas) }).expect(200);
    expect(confirme.body.codesSecours).toHaveLength(10);

    const etape = await request(app).post('/auth/login').send({ email: 'awa@exemple.cd', password: MOT_DE_PASSE }).expect(200);
    expect(etape.body.data).toMatchObject({ etape: 'code' });
    expect(etape.body.data.token).toBeUndefined();
    await request(app).post('/auth/login').send({ email: 'awa@exemple.cd', password: 'Mauvais-2026!' }).expect(401);
    // Le code qui a servi à confirmer ne rouvre rien.
    await request(app).post('/auth/double/verifier').send({ jeton: etape.body.data.jeton, code: codeDuPas(secret, pas) }).expect(401);
    maintenant.v += 30000;
    const fini = await request(app).post('/auth/double/verifier').send({ jeton: etape.body.data.jeton, code: codeDuPas(secret, pas + 1) }).expect(200);
    expect(fini.body.data.token).toBeTruthy();
    await request(app).post('/auth/double/verifier').send({ jeton: etape.body.data.jeton, code: codeDuPas(secret, pas + 1) }).expect(401);
    // Un code de secours : une seule fois.
    const secours = confirme.body.codesSecours[0];
    await request(app).post('/auth/double/verifier').send({ jeton: etape.body.data.jeton, code: secours }).expect(200);
    await request(app).post('/auth/double/verifier').send({ jeton: etape.body.data.jeton, code: secours }).expect(401);
  });

  it('cinq codes faux ferment le compte un quart d\\'heure ; un jeton trafiqué ne passe pas', async () => {
    const { app, entree, maintenant } = await preparer();
    const activation = await request(app).post('/auth/double/activer').set(entree).send({ motDePasse: MOT_DE_PASSE }).expect(200);
    const secret = decoder(activation.body.secret);
    await request(app).post('/auth/double/confirmer').set(entree).send({ code: codeDuPas(secret, Math.floor(maintenant.v / 30000)) }).expect(200);
    const { jeton } = (await request(app).post('/auth/login').send({ email: 'awa@exemple.cd', password: MOT_DE_PASSE }).expect(200)).body.data;
    await request(app).post('/auth/double/verifier').send({ jeton: jeton + 'x', code: '123456' }).expect(401);
    for (let i = 0; i < 5; i++) await request(app).post('/auth/double/verifier').send({ jeton, code: '12345' + (i % 10) }).expect(401);
    maintenant.v += 60000;
    await request(app).post('/auth/double/verifier').send({ jeton, code: codeDuPas(secret, Math.floor(maintenant.v / 30000)) }).expect(429);
  });

  it('le secret est chiffré en base', async () => {
    const { app, entree, magasin } = await preparer();
    const activation = await request(app).post('/auth/double/activer').set(entree).send({ motDePasse: MOT_DE_PASSE }).expect(200);
    const ligne = await magasin.double.lire(String(entree.id));
    expect(JSON.stringify(ligne)).not.toContain(activation.body.secret);
    expect(JSON.stringify(ligne)).not.toContain(decoder(activation.body.secret).toString('hex'));
  });`);
  }
  if (serveur.connexionCleAcces) {
    blocs.push(`  it('une clé d\\'accès : le défi est demandé sans adresse, l\\'ajout exige le mot de passe', async () => {
    const { app, entree } = await preparer();
    const debut = await request(app).post('/auth/cle-acces/connexion/options').set('origin', 'http://localhost:5173').send({}).expect(200);
    expect(debut.body.ceremonie).toMatch(/^ceremonie:/);
    expect(debut.body.options.challenge).toBeTruthy();
    expect(debut.body.options.allowCredentials).toEqual([]);
    await request(app).post('/auth/cle-acces/connexion/verifier').send({ ceremonie: debut.body.ceremonie, reponse: { id: 'inconnue', response: {} } }).expect(401);
    await request(app).post('/auth/cle-acces/inscription/options').set('origin', 'http://localhost:5173').send({}).expect(401);
    await request(app).post('/auth/cle-acces/inscription/options').set('origin', 'http://localhost:5173').set(entree).send({ motDePasse: 'mauvais' }).expect(403);
    const options = await request(app).post('/auth/cle-acces/inscription/options').set('origin', 'http://localhost:5173').set(entree).send({ motDePasse: MOT_DE_PASSE }).expect(200);
    expect(options.body.rp.id).toBe('localhost');
    expect(options.body.authenticatorSelection.userVerification).toBe('required');
  });`);
  }
  return `// Produit par Humalis : les clés d'accès et le code à six chiffres, sur le vrai serveur.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createMemoryUsersStore, type UsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from '../src/serveur.js';
import { creerMagasinSecuriteMemoire, codeDuPas, enBase32 } from '../src/humalis/securite.js';
import { creerStockageMemoire } from '../src/humalis/stockage.js';

void codeDuPas; void enBase32;
const MOT_DE_PASSE = 'Essai-Solide-2026!';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');

function decoder(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((o) => parseInt(o, 2)));
}
void decoder;

async function preparer() {
  const usersStore = createMemoryUsersStore() as UsersStore;
  const passwordHash = await hashPassword(MOT_DE_PASSE);
  const compte = await usersStore.create({ email: 'awa@exemple.cd', role: 'user', passwordHash });
  const stockages = {
${stockages}
  };
  const magasin = creerMagasinSecuriteMemoire();
  const maintenant = { v: Date.now() };
  const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages, magasinSecurite: magasin, horlogeSecurite: () => maintenant.v }) as never;
  const connexion = await request(app).post('/auth/login').send({ email: 'awa@exemple.cd', password: MOT_DE_PASSE }).expect(200);
  return { app, magasin, maintenant, entree: { Authorization: \`Bearer \${connexion.body.data.token}\`, id: String(compte?.id) } as Record<string, string> };
}

describe('la sécurité des comptes', () => {
${blocs.join('\n\n')}
});
`;
}
