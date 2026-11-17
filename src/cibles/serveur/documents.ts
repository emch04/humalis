/**
 * Une base de documents pour le serveur produit (décidé avec le mainteneur le 17 novembre 2026), par le protocole MongoDB.
 * `DATABASE_URL=mongodb://…/ma_base` (ou `mongodb+srv://…`) la choisit ; le programme ne la nomme jamais.
 *
 * Une base de documents ne parle pas SQL : chaque magasin du serveur (comptes, sessions, envois, coffre, tâches,
 * double authentification, clés d'accès, compteur de l'IA, synchronisation) a ici sa propre écriture.
 *
 * Ce qui marche moins bien qu'en SQL, et ce que Humalis fait :
 * - les transactions : une action reste « tout ou rien » seulement si la base en a de vraies. Un serveur seul,
 *   sans jeu de répliques, n'en a pas ; certaines bases compatibles les acceptent sans les tenir. Au démarrage,
 *   Humalis essaie une écriture annulée : si elle reste, le serveur refuse de démarrer ;
 * - un conflit entre deux transactions annule la seconde, qui est rejouée par le pilote ;
 * - les « jointures » de la synchronisation deviennent deux lectures ;
 * - les verrous (une tâche, une installation) passent par une collection à expiration.
 *
 * Ce fichier produit `src/humalis/documents.ts` et `src/humalis/synchro-documents.ts`.
 */
import { JOURS_ENVOIS_GARDES } from '../envois-gardes.js';

export interface PartiesDocuments {
  securite: boolean;
  comptes: boolean;
  taches: boolean;
  ia: boolean;
}

const BASE = String.raw`import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { ClientSession, Collection, Db, Document, MongoClient } from 'mongodb';
import type { SaasUser, UsersStore } from '@astratra/saas-kit';
import { nouvelId, sansSeparateurs, type Enregistrement, type Stockage } from './stockage.js';
import type { LigneRenouvellement, MagasinRenouvellements } from './renouvellements.js';
import type { EtatEnvoi, MagasinEnvois } from './envois.js';
import type { LigneCle } from './coffre.js';

/**
 * Produit par Humalis : une base de documents. Une transaction garde sa session du début à la fin ; chaque
 * opération faite pendant ce temps la reçoit par « o() ».
 */
export interface BaseDocuments {
  readonly documents: true;
  readonly db: Db;
  readonly client: MongoClient;
  collection<T extends Document = Document>(nom: string): Collection<T>;
  /** Les options d'une opération, avec la session de la transaction en cours s'il y en a une. */
  o<T extends object>(options?: T): T & { session?: ClientSession };
  /** Tout ou rien. Un conflit avec une autre transaction la fait rejouer : « faire » peut donc tourner deux fois. */
  transaction<T>(faire: () => Promise<T>): Promise<T>;
  /** Un seul serveur à la fois fait « travail » pour cette clé, même avec plusieurs exemplaires. */
  verrou<T>(cle: string, travail: () => Promise<T>): Promise<T>;
  fermer(): Promise<void>;
}

/** Une clé en double (index unique) : une autre écriture est passée avant. */
export const enDouble = (erreur: unknown): boolean => (erreur as { code?: number }).code === 11000;

/** Ce qui part dans la base : la forme JSON de la valeur, comme dans les bases SQL (une date devient un texte). */
const enJson = <T>(valeur: T): T => (valeur === undefined ? valeur : (JSON.parse(JSON.stringify(valeur)) as T));

/** Ouvre la base. L'adresse nomme la base : mongodb://hote:27017/ma_base?replicaSet=… */
export async function ouvrirDocuments(adresse: string): Promise<BaseDocuments> {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(adresse, { maxPoolSize: Number(process.env.HUMALIS_BASE_CONNEXIONS) > 0 ? Number(process.env.HUMALIS_BASE_CONNEXIONS) : 10 });
  await client.connect();
  const nom = new URL(adresse.replace(/^mongodb(\+srv)?:/, 'http:')).pathname.replace(/^\//, '');
  if (!nom) {
    await client.close();
    throw new Error("l'adresse doit nommer la base : mongodb://hote:27017/ma_base");
  }
  const db = client.db(nom);
  const dans = new AsyncLocalStorage<ClientSession>();
  const o = <T extends object>(options?: T) => {
    const session = dans.getStore();
    return (session ? { ...(options ?? {}), session } : { ...(options ?? {}) }) as T & { session?: ClientSession };
  };
  const transaction = async <T>(faire: () => Promise<T>): Promise<T> => {
    if (dans.getStore()) return faire();
    const session = client.startSession();
    try {
      return (await session.withTransaction(() => dans.run(session, faire), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } })) as T;
    } finally {
      await session.endSession();
    }
  };

  // Sans transactions, « tout ou rien » ne tiendrait pas : une écriture annulée doit vraiment disparaître.
  const essai = db.collection<{ _id: string }>('humalis_essai_transactions');
  const marque = randomUUID();
  try {
    await transaction(async () => {
      await essai.insertOne({ _id: marque }, o());
      throw new Error('annulée exprès');
    });
  } catch (erreur) {
    if (!(erreur instanceof Error) || erreur.message !== 'annulée exprès') {
      await client.close();
      throw new Error("cette base de documents refuse les transactions (un serveur seul, sans jeu de répliques ?) : une action ne pourrait pas être « tout ou rien ». " + (erreur instanceof Error ? erreur.message : String(erreur)));
    }
  }
  if ((await essai.countDocuments({ _id: marque })) > 0) {
    await essai.deleteOne({ _id: marque });
    await client.close();
    throw new Error('cette base de documents accepte les transactions sans les tenir (une écriture annulée est restée) : une action ne pourrait pas être « tout ou rien ».');
  }

  const verrous = db.collection<{ _id: string; expire: Date; par: string }>('humalis_verrous');
  await verrous.createIndex({ expire: 1 }, { expireAfterSeconds: 0 });
  const base: BaseDocuments = {
    documents: true,
    db,
    client,
    collection: (nomCollection) => db.collection(nomCollection),
    o,
    transaction,
    async verrou(cle, travail) {
      const par = randomUUID();
      const limite = Date.now() + 60_000;
      for (;;) {
        try {
          await verrous.insertOne({ _id: cle, expire: new Date(Date.now() + 60_000), par });
          break;
        } catch (erreur) {
          if (!enDouble(erreur)) throw erreur;
          // Un verrou abandonné (son serveur s'est arrêté) se reprend une fois passé.
          await verrous.deleteOne({ _id: cle, expire: { $lt: new Date() } });
          if (Date.now() > limite) throw new Error('verrou « ' + cle + ' » non obtenu en 60 secondes');
          await new Promise((fin) => setTimeout(fin, 50));
        }
      }
      // Un long travail garde son verrou.
      const garder = setInterval(() => void verrous.updateOne({ _id: cle, par }, { $set: { expire: new Date(Date.now() + 60_000) } }).catch(() => undefined), 20_000);
      try {
        return await travail();
      } finally {
        clearInterval(garder);
        await verrous.deleteOne({ _id: cle, par }).catch(() => undefined);
      }
    },
    async fermer() {
      await client.close();
    },
  };
  return base;
}

/** « tout ou rien » pour la logique du serveur : les mêmes stockages, dans une transaction de la base. */
export function transactionDocuments<S>(base: BaseDocuments, stockages: S): <T>(corps: (s: S) => Promise<T>) => Promise<T> {
  return (corps) => base.transaction(() => corps(stockages));
}

/** Un nom de champ sans « . » ni « $ » : il ne désigne jamais autre chose qu'un champ. */
const champSur = (champ: string): boolean => /^[^.$\u0000]+$/.test(champ);

/** Une collection prête, et ses index, créés une fois hors de toute transaction. */
function preparation(base: BaseDocuments, nom: string, index: [Document, Record<string, unknown>?][]): () => Promise<unknown> {
  let prete: Promise<unknown> | undefined;
  const ouvrir = async () => {
    const existe = (await base.db.listCollections({ name: nom }, { nameOnly: true }).toArray()).length > 0;
    if (!existe) await base.db.createCollection(nom).catch((erreur: unknown) => {
      // Un autre exemplaire l'a créée en même temps.
      if ((erreur as { code?: number }).code !== 48) throw erreur;
    });
    for (const [cles, options] of index) await base.collection(nom).createIndex(cles, options ?? {});
  };
  return () =>
    (prete ??= ouvrir().catch((erreur: unknown) => {
      prete = undefined;
      throw erreur;
    }));
}

interface DocumentFiche {
  _id: string;
  ordre: unknown;
  data: Record<string, unknown>;
  cree_le: Date;
  /** La marque écrite par une transaction qui retient la fiche. */
  verrou?: unknown;
}

/** La collection d'une donnée : chaque fiche y garde ses champs dans « data », l'ordre de création dans « ordre ». */
export function preparerCollection(base: BaseDocuments, nom: string): () => Promise<unknown> {
  if (!/^[a-z_][a-z0-9_]*$/.test(nom)) throw new Error('nom de collection invalide : ' + nom);
  return preparation(base, nom, [[{ ordre: 1 }]]);
}

/**
 * Les données dans une base de documents. « champs » : les champs de la donnée d'aujourd'hui (un champ retiré
 * reste dans la base, il n'en sort plus).
 */
export function creerStockageDocuments(base: BaseDocuments, nom: string, champs?: readonly string[]): Stockage {
  const preparer = preparerCollection(base, nom);
  void preparer().catch(() => undefined);
  const collection = base.collection<DocumentFiche>(nom);
  const lire = (d: DocumentFiche): Enregistrement => {
    const donnees = d.data ?? {};
    if (!champs) return { ...donnees, id: String(d._id) };
    const fiche: Enregistrement = { id: String(d._id) };
    for (const champ of champs) if (champ !== 'id' && Object.hasOwn(donnees, champ)) fiche[champ] = donnees[champ];
    return fiche;
  };
  const enTransaction = () => base.o().session !== undefined;
  /**
   * « pourEcrire », dans une transaction : la fiche est écrite (une marque) avant d'être rendue. Une seconde
   * transaction qui la veut reçoit le conflit tout de suite, avant d'avoir rien fait, et la base la rejoue après la
   * première : deux actions sur la même fiche passent l'une après l'autre, comme avec FOR UPDATE.
   */
  const trouver = async (id: string, pourEcrire?: boolean): Promise<Enregistrement | null> => {
    await preparer();
    if (pourEcrire && enTransaction()) {
      const { ObjectId } = await import('mongodb');
      const d = await collection.findOneAndUpdate({ _id: String(id) }, { $set: { verrou: new ObjectId() } }, base.o({ returnDocument: 'after' as const }));
      return d ? lire(d as DocumentFiche) : null;
    }
    const d = await collection.findOne({ _id: String(id) }, base.o());
    return d ? lire(d) : null;
  };
  return {
    async lister(filtres) {
      await preparer();
      const conditions: Document[] = [];
      // Chaque champ demandé a exactement cette valeur, du même type : « 5 » n'est pas 5, vrai n'est pas 1.
      // Une liste ne « contient » pas la valeur : seul un champ qui la vaut exactement répond.
      for (const [champ, valeur] of Object.entries(filtres?.egal ?? {})) {
        if (!champSur(champ)) return [];
        conditions.push({ ['data.' + champ]: { $eq: valeur } }, { ['data.' + champ]: { $not: { $type: 'array' } } });
      }
      const filtre = conditions.length > 0 ? { $and: conditions } : {};
      // Les fiches lues pour être changées (« pour chaque … changer ») : marquées d'abord, retenues comme une seule.
      if (filtres?.retenir && enTransaction()) {
        const { ObjectId } = await import('mongodb');
        await collection.updateMany(filtre, { $set: { verrou: new ObjectId() } }, base.o());
      }
      const numero = filtres?.numero;
      if (!numero) {
        let curseur = collection.find(filtre, base.o()).sort({ ordre: 1 });
        if (filtres?.depuis) curseur = curseur.skip(Math.max(0, Math.floor(filtres.depuis)));
        if (filtres?.limite !== undefined) {
          if (filtres.limite <= 0) return [];
          curseur = curseur.limit(Math.floor(filtres.limite));
        }
        return (await curseur.toArray()).map(lire);
      }
      // Un numéro se compare sans ses séparateurs : la même règle que le stockage en mémoire, fiche par fiche.
      const debut = filtres?.depuis ?? 0;
      const fiches = (await collection.find(filtre, base.o()).sort({ ordre: 1 }).toArray()).map(lire).filter((fiche) => sansSeparateurs(fiche[numero.champ]) === numero.valeur);
      return filtres?.limite === undefined ? fiches.slice(debut) : fiches.slice(debut, debut + filtres.limite);
    },
    trouver: (id, pourEcrire) => trouver(id, pourEcrire),
    async creer(valeurs) {
      await preparer();
      const { ObjectId } = await import('mongodb');
      const id = nouvelId();
      await collection.insertOne({ _id: id, ordre: new ObjectId(), data: enJson(valeurs), cree_le: new Date() }, base.o());
      return { ...valeurs, id };
    },
    async modifier(id, valeurs) {
      await preparer();
      const propres = enJson(valeurs);
      const changes: Record<string, unknown> = {};
      for (const [champ, valeur] of Object.entries(propres)) {
        if (!champSur(champ)) throw new Error('nom de champ invalide : ' + champ);
        changes['data.' + champ] = valeur;
      }
      if (Object.keys(changes).length === 0) return trouver(id);
      const d = await collection.findOneAndUpdate({ _id: String(id) }, { $set: changes }, base.o({ returnDocument: 'after' as const }));
      return d ? lire(d as DocumentFiche) : null;
    },
    async supprimer(id) {
      await preparer();
      return (await collection.deleteOne({ _id: String(id) }, base.o())).deletedCount > 0;
    },
  };
}

/** Les comptes : l'adresse est unique (quand il y en a une), relue sans tenir compte des majuscules. */
export function creerComptesDocuments(base: BaseDocuments): UsersStore {
  const preparer = preparation(base, 'astratra_users', [[{ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } }], [{ role: 1 }]]);
  const collection = base.collection<{ _id: string; email: string | null; role: string | null; data: Record<string, unknown> }>('astratra_users');
  const adresse = (email: unknown) => String(email ?? '').trim().toLowerCase();
  const lire = (d: { _id: string; data: Record<string, unknown> } | null) => (d ? ({ ...d.data, id: d._id } as SaasUser) : null);
  return {
    async findByEmail(email) {
      await preparer();
      return lire(await collection.findOne({ email: adresse(email) }, base.o()));
    },
    async findById(id) {
      await preparer();
      return lire(await collection.findOne({ _id: String(id) }, base.o()));
    },
    async create(donnees) {
      await preparer();
      const data: Record<string, unknown> = { ...(donnees ?? {}) };
      delete data.id;
      if (data.email !== undefined) data.email = adresse(data.email);
      const id = randomUUID();
      const propre = enJson(data);
      await collection.insertOne({ _id: id, email: (propre.email as string | undefined) ?? null, role: (propre.role as string | undefined) ?? null, data: propre }, base.o());
      return { ...propre, id } as SaasUser;
    },
    async list({ role, limit = 50, offset = 0 } = {}) {
      await preparer();
      const lus = await collection
        .find(role ? { role } : {}, base.o())
        .sort({ _id: 1 })
        .skip(Math.max(Number(offset) || 0, 0))
        .limit(Math.max(Number(limit) || 50, 0))
        .toArray();
      return lus.map((d) => lire(d)!);
    },
    async count({ role } = {}) {
      await preparer();
      return collection.countDocuments(role ? { role } : {}, base.o());
    },
    async countByRole() {
      await preparer();
      const groupes = await collection.aggregate<{ _id: string; n: number }>([{ $group: { _id: { $ifNull: ['$role', 'unknown'] }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }], base.o()).toArray();
      return Object.fromEntries(groupes.map((g) => [g._id, g.n]));
    },
    async update(id, patch) {
      await preparer();
      const avant = await collection.findOne({ _id: String(id) }, base.o());
      if (!avant) return null;
      const propre: Record<string, unknown> = { ...(patch ?? {}) };
      delete propre.id;
      if (propre.email !== undefined) propre.email = adresse(propre.email);
      const data = enJson({ ...avant.data, ...propre });
      await collection.updateOne({ _id: String(id) }, { $set: { email: (data.email as string | undefined) ?? null, role: (data.role as string | undefined) ?? null, data } }, base.o());
      return { ...data, id: String(id) } as SaasUser;
    },
  };
}

/** Les sessions glissantes : un redémarrage du serveur ne déconnecte personne. */
export function creerSessionsDocuments(base: BaseDocuments): MagasinRenouvellements {
  const preparer = preparation(base, 'sessions_renouvellement', [[{ empreinte: 1 }, { unique: true }], [{ famille: 1 }], [{ utilisateur: 1 }]]);
  type Ligne = { _id: string; famille: string; utilisateur: string; empreinte: string; cree_le: number; debut: number; expire_le: number; consomme_le: number | null; revoque_le: number | null };
  const collection = base.collection<Ligne>('sessions_renouvellement');
  const lire = (l: Ligne): LigneRenouvellement => ({ id: l._id, familyId: l.famille, userId: l.utilisateur, hash: l.empreinte, createdAt: l.cree_le, familyStartedAt: l.debut, expiresAt: l.expire_le, consumedAt: l.consomme_le ?? null, revokedAt: l.revoque_le ?? null });
  return {
    async save(ligne) {
      await preparer();
      const l = ligne as LigneRenouvellement;
      await collection.insertOne({ _id: l.id, famille: l.familyId, utilisateur: l.userId, empreinte: l.hash, cree_le: l.createdAt, debut: l.familyStartedAt ?? l.createdAt, expire_le: l.expiresAt, consomme_le: l.consumedAt ?? null, revoque_le: l.revokedAt ?? null }, base.o());
    },
    async findByHash(hash) {
      await preparer();
      const l = await collection.findOne({ empreinte: hash }, base.o());
      return l ? lire(l) : null;
    },
    async markConsumed(id, at) {
      await preparer();
      await collection.updateOne({ _id: id }, { $set: { consomme_le: at } }, base.o());
    },
    async revokeFamily(familyId, at) {
      await preparer();
      await collection.updateMany({ famille: familyId, revoque_le: null }, { $set: { revoque_le: at } }, base.o());
    },
    async revokeAllForUser(userId, at) {
      await preparer();
      await collection.updateMany({ utilisateur: userId, revoque_le: null }, { $set: { revoque_le: at } }, base.o());
    },
    async deleteExpired(before) {
      await preparer();
      return (await collection.deleteMany({ expire_le: { $lte: before } }, base.o())).deletedCount;
    },
    async debutDeFamille(familyId) {
      await preparer();
      const [l] = await collection.find({ famille: familyId }, base.o()).sort({ debut: 1 }).limit(1).toArray();
      return l ? l.debut : null;
    },
  };
}

/** Les jetons fermés avant leur fin, pour tous les exemplaires du serveur. */
export function creerRevocationsDocuments(base: BaseDocuments): { revoke(jti: string, expiresAt: number): Promise<void>; isRevoked(jti?: string): Promise<boolean>; revokeAllForUser(userId: string, revokedBeforeMs: number): Promise<void>; isRevokedForUser(userId: string, issuedAtSeconds: number): Promise<boolean> } {
  const preparer = preparation(base, 'jetons_fermes', [[{ expire_le: 1 }]]);
  const jetons = base.collection<{ _id: string; expire_le: number }>('jetons_fermes');
  const comptes = base.collection<{ _id: string; avant: number }>('comptes_fermes');
  return {
    async revoke(jti, expiresAt) {
      if (!jti) return;
      await preparer();
      const fin = Number(expiresAt);
      await jetons.deleteMany({ expire_le: { $lt: Date.now() } }, base.o());
      await jetons.updateOne({ _id: jti }, { $set: { expire_le: Number.isFinite(fin) ? fin : Date.now() } }, base.o({ upsert: true }));
    },
    async isRevoked(jti) {
      if (!jti) return false;
      await preparer();
      return (await jetons.countDocuments({ _id: jti, expire_le: { $gte: Date.now() } }, base.o())) > 0;
    },
    async revokeAllForUser(userId, revokedBeforeMs) {
      if (!userId) return;
      const avant = Number(revokedBeforeMs);
      // Le plus grand « avant » est gardé.
      await comptes.updateOne({ _id: userId }, { $max: { avant: Number.isFinite(avant) ? avant : Date.now() } }, base.o({ upsert: true }));
    },
    async isRevokedForUser(userId, issuedAtSeconds) {
      if (!userId) return false;
      const emis = Number(issuedAtSeconds) * 1000;
      if (!Number.isFinite(emis)) return false;
      const l = await comptes.findOne({ _id: userId }, base.o());
      return l !== null && emis <= l.avant;
    },
  };
}

const ABANDON = 10 * 60 * 1000;
const DUREE_ENVOIS = ${JOURS_ENVOIS_GARDES} * 24 * 60 * 60 * 1000;

/** Les envois rejoués (X-Humalis-Envoi) : l'identifiant tranche entre deux serveurs, un seul obtient la ligne. */
export function creerEnvoisDocuments(base: BaseDocuments): MagasinEnvois {
  const preparer = preparation(base, 'humalis_envois', [[{ cree_le: 1 }]]);
  const collection = base.collection<{ _id: string; empreinte: string; statut: number | null; corps: string | null; cree_le: Date }>('humalis_envois');
  let dernierMenage = 0;
  return {
    async reserver(cle, empreinte): Promise<EtatEnvoi> {
      await preparer();
      if (Date.now() - dernierMenage > 60_000) {
        dernierMenage = Date.now();
        await collection.deleteMany({ cree_le: { $lt: new Date(Date.now() - DUREE_ENVOIS) } });
      }
      try {
        await collection.insertOne({ _id: cle, empreinte, statut: null, corps: null, cree_le: new Date() }, base.o());
        return 'libre';
      } catch (erreur) {
        if (!enDouble(erreur)) throw erreur;
      }
      // Un premier essai abandonné depuis longtemps (son serveur s'est arrêté) se reprend.
      const repris = await collection.findOneAndUpdate({ _id: cle, statut: null, cree_le: { $lt: new Date(Date.now() - ABANDON) } }, { $set: { empreinte, cree_le: new Date() } }, base.o());
      if (repris) return 'libre';
      const ligne = await collection.findOne({ _id: cle }, base.o());
      if (!ligne) return 'en_cours';
      if (ligne.empreinte !== empreinte) return 'autre';
      return ligne.statut === null ? 'en_cours' : { statut: Number(ligne.statut), corps: ligne.corps === null ? null : JSON.parse(ligne.corps) };
    },
    async finir(cle, { statut, corps }) {
      await collection.updateOne({ _id: cle }, { $set: { statut, corps: JSON.stringify(corps ?? null) } }, base.o());
    },
    async liberer(cle) {
      await collection.deleteOne({ _id: cle }, base.o());
    },
  };
}

/** Le coffre des clés de service : les valeurs arrivent déjà chiffrées. */
export function creerClesDocuments(base: BaseDocuments): { findAll(): Promise<LigneCle[]>; upsert(ligne: LigneCle): Promise<void> } {
  const collection = base.collection<{ _id: string; valeur: string; secret: boolean; modifie_le: Date; modifie_par: string | null }>('coffre_cles');
  return {
    async findAll() {
      return (await collection.find({}, base.o()).toArray()).map((l) => ({ key: l._id, value: l.valeur, secret: l.secret === true, updatedAt: l.modifie_le, updatedBy: l.modifie_par ?? null }));
    },
    async upsert(ligne) {
      await collection.updateOne({ _id: ligne.key }, { $set: { valeur: ligne.value, secret: ligne.secret, modifie_le: new Date(), modifie_par: ligne.updatedBy ?? null } }, base.o({ upsert: true }));
    },
  };
}

/**
 * Le canal « en direct » entre plusieurs exemplaires : chaque annonce est écrite à l'heure de la base, et chaque
 * exemplaire relit celles des dernières secondes. La base efface les annonces passées d'elle-même.
 */
export function canalDocuments(base: BaseDocuments): { publier(cle: string): Promise<void>; recentes(): Promise<{ numero: string; cle: string }[]> } {
  const preparer = preparation(base, 'humalis_direct', [[{ quand: 1 }, { expireAfterSeconds: 60 }]]);
  const collection = base.collection('humalis_direct');
  return {
    async publier(cle) {
      await preparer();
      const { ObjectId } = await import('mongodb');
      await collection.updateOne({ _id: new ObjectId() }, [{ $set: { cle: { $literal: cle }, quand: '$$NOW' } }], { upsert: true });
    },
    async recentes() {
      await preparer();
      const lues = await collection.find({ $expr: { $gt: ['$quand', { $subtract: ['$$NOW', 10_000] }] } }).sort({ _id: 1 }).toArray();
      return lues.map((l) => ({ numero: String(l._id), cle: String(l.cle) }));
    },
  };
}
`;

const SECURITE = String.raw`
/** La double authentification et les clés d'accès. */
export function creerSecuriteDocuments(base: BaseDocuments): import('./securite.js').MagasinSecurite {
  const ESSAIS = 5;
  const preparer = preparation(base, 'humalis_double_auth_codes', [[{ compte: 1, empreinte: 1 }, { unique: true }]]);
  const prepCles = preparation(base, 'humalis_cles_acces', [[{ compte: 1 }]]);
  const prepDefis = preparation(base, 'humalis_cles_defis', [[{ cree_le: 1 }]]);
  type Ligne = { _id: string; secret: string; actif: boolean; dernier_pas: number; echecs: number; bloque_jusqua: number };
  const doubles = base.collection<Ligne>('humalis_double_auth');
  const codes = base.collection<{ compte: string; empreinte: string }>('humalis_double_auth_codes');
  const cles = base.collection<{ _id: string; compte: string; donnees: Record<string, unknown>; cree_le: Date }>('humalis_cles_acces');
  const defis = base.collection<{ _id: string; donnees: Record<string, unknown>; cree_le: Date }>('humalis_cles_defis');
  const remplacerCodes = async (compte: string, empreintes: string[]) => {
    await preparer();
    await base.transaction(async () => {
      await codes.deleteMany({ compte }, base.o());
      const uniques = [...new Set(empreintes)];
      if (uniques.length > 0) await codes.insertMany(uniques.map((empreinte) => ({ compte, empreinte })), base.o());
    });
  };
  return {
    double: {
      async lire(compte) {
        const l = await doubles.findOne({ _id: compte }, base.o());
        return l ? { secret: l.secret, actif: l.actif === true, dernierPas: Number(l.dernier_pas), echecs: Number(l.echecs), bloqueJusqua: Number(l.bloque_jusqua) } : null;
      },
      async preparer(compte, secret) {
        // Un secret déjà actif n'est jamais remplacé : la fiche active ne répond pas au filtre, et l'ajout bute sur son identifiant.
        try {
          await doubles.updateOne({ _id: compte, actif: false }, { $set: { secret, dernier_pas: -1, echecs: 0, bloque_jusqua: 0 }, $setOnInsert: { actif: false } }, base.o({ upsert: true }));
          return true;
        } catch (erreur) {
          if (enDouble(erreur)) return false;
          throw erreur;
        }
      },
      async activer(compte, pas, empreintes) {
        await doubles.updateOne({ _id: compte }, { $set: { actif: true, dernier_pas: pas, echecs: 0, bloque_jusqua: 0 } }, base.o());
        await remplacerCodes(compte, empreintes);
      },
      async retirer(compte) {
        await preparer();
        await base.transaction(async () => {
          await codes.deleteMany({ compte }, base.o());
          await doubles.deleteOne({ _id: compte }, base.o());
        });
      },
      async consommerPas(compte, pas) {
        return (await doubles.updateOne({ _id: compte, dernier_pas: { $lt: pas } }, { $set: { dernier_pas: pas, echecs: 0, bloque_jusqua: 0 } }, base.o())).modifiedCount === 1;
      },
      async echec(compte, bloqueJusqua) {
        const atteint = { $gte: [{ $add: ['$echecs', 1] }, ESSAIS] };
        await doubles.updateOne({ _id: compte }, [{ $set: { bloque_jusqua: { $cond: [atteint, { $literal: bloqueJusqua }, '$bloque_jusqua'] }, echecs: { $cond: [atteint, 0, { $add: ['$echecs', 1] }] } } }], base.o());
      },
      async remettre(compte) {
        await doubles.updateOne({ _id: compte }, { $set: { echecs: 0, bloque_jusqua: 0 } }, base.o());
      },
      enregistrerCodes: remplacerCodes,
      async consommerCode(compte, empreinte) {
        return (await codes.deleteOne({ compte, empreinte }, base.o())).deletedCount === 1;
      },
      async compterCodes(compte) {
        return codes.countDocuments({ compte }, base.o());
      },
    },
    cles: {
      async getCredentialsForUser(compte) {
        if (compte.startsWith('ceremonie:')) return [{ id: 'AA', credentialID: 'AA', userId: compte, publicKey: '', counter: 0 }] as never;
        await prepCles();
        return (await cles.find({ compte }, base.o()).sort({ cree_le: 1 }).toArray()).map((l) => l.donnees) as never;
      },
      async saveCredential(compte, cle) {
        await prepCles();
        const donnees = enJson({ ...cle, id: cle.credentialID, userId: compte, creeLe: Date.now() });
        await cles.insertOne({ _id: cle.credentialID, compte, donnees, cree_le: new Date() }, base.o());
      },
      async getCredentialById(id) {
        return ((await cles.findOne({ _id: id }, base.o()))?.donnees ?? null) as never;
      },
      async updateCredentialCounter(id, compteur) {
        await cles.updateOne({ _id: id }, { $set: { 'donnees.counter': compteur, 'donnees.utiliseeLe': Date.now() } }, base.o());
      },
      async saveChallenge(compte, defi, type, metadata) {
        await prepDefis();
        // Le ménage des défis abandonnés, à chaque nouveau défi.
        await defis.deleteMany({ cree_le: { $lt: new Date(Date.now() - 3_600_000) } }, base.o());
        await defis.updateOne({ _id: compte + '\u0000' + type }, { $set: { donnees: enJson({ challenge: defi, ...metadata }), cree_le: new Date() } }, base.o({ upsert: true }));
      },
      async consumeChallenge(compte, type) {
        return ((await defis.findOneAndDelete({ _id: compte + '\u0000' + type }, base.o({ includeResultMetadata: false as const })))?.donnees ?? null) as never;
      },
      async retirer(compte, id) {
        return (await cles.deleteOne({ _id: id, compte }, base.o())).deletedCount === 1;
      },
    },
  };
}
`;

const COMPTES = String.raw`
/** Les liens de mot de passe : consommer supprime, un second essai avec le même lien ne trouve rien. */
export function creerJetonsDocuments(base: BaseDocuments): import('@astratra/saas-kit').PasswordResetStore {
  const preparer = preparation(base, 'liens_mot_de_passe', [[{ utilisateur: 1 }]]);
  const collection = base.collection<{ _id: string; utilisateur: string; expire_le: number }>('liens_mot_de_passe');
  const lire = (l: { _id: string; utilisateur: string; expire_le: number } | null) => (l ? { hash: l._id, userId: l.utilisateur, expiresAt: Number(l.expire_le) } : null);
  return {
    async save({ hash, userId, expiresAt }) {
      await preparer();
      await collection.deleteMany({ expire_le: { $lte: Date.now() } }, base.o());
      await collection.insertOne({ _id: hash, utilisateur: userId, expire_le: expiresAt }, base.o());
    },
    async find(hash) {
      return lire(await collection.findOne({ _id: hash }, base.o()));
    },
    async consume(hash) {
      return lire(await collection.findOneAndDelete({ _id: hash }, base.o({ includeResultMetadata: false as const })));
    },
    async deleteForUser(userId) {
      await collection.deleteMany({ utilisateur: userId }, base.o());
    },
  } as import('@astratra/saas-kit').PasswordResetStore;
}
`;

const TACHES = String.raw`
/** Plusieurs serveurs : la base donne chaque période d'une tâche à un seul d'entre eux. */
export function reclamerDocuments(base: BaseDocuments): import('./logique.js').Reclamer {
  const collection = base.collection<{ _id: string; periode: string }>('humalis_taches');
  const prendre = async (nom: string, periode: string) => {
    try {
      const r = await collection.updateOne({ _id: nom, periode: { $ne: periode } }, { $set: { periode } }, { upsert: true });
      return r.modifiedCount + r.upsertedCount > 0;
    } catch (erreur) {
      // La période est déjà prise : la fiche ne répond pas au filtre, et l'ajout bute sur son identifiant.
      if (enDouble(erreur)) return false;
      throw erreur;
    }
  };
  return Object.assign(prendre, {
    rendre: async (nom: string, periode: string) => {
      await collection.updateOne({ _id: nom, periode }, { $set: { periode: '' } });
    },
  });
}
`;

const IA = String.raw`
/** Plusieurs serveurs : la base compte les questions pour tous. */
export function compterDocuments(base: BaseDocuments): import('./ia.js').Compter {
  const preparer = preparation(base, 'humalis_ia_usage', [[{ cree_le: 1 }, { expireAfterSeconds: 7200 }]]);
  const collection = base.collection<{ _id: string; n: number; cree_le: Date }>('humalis_ia_usage');
  return async (cle) => {
    await preparer();
    for (let essai = 0; ; essai++) {
      try {
        const l = await collection.findOneAndUpdate({ _id: cle }, { $inc: { n: 1 }, $setOnInsert: { cree_le: new Date() } }, { upsert: true, returnDocument: 'after' });
        return Number(l?.n ?? 1);
      } catch (erreur) {
        // Deux premières questions au même instant : la seconde retrouve la fiche créée par la première.
        if (essai === 0 && enDouble(erreur)) continue;
        throw erreur;
      }
    }
  };
}
`;

/** src/humalis/documents.ts, avec les seuls magasins dont le programme se sert. */
export function documentsTs(parties: PartiesDocuments): string {
  return BASE + (parties.securite ? SECURITE : '') + (parties.comptes ? COMPTES : '') + (parties.taches ? TACHES : '') + (parties.ia ? IA : '');
}

/**
 * src/humalis/synchro-documents.ts : seulement quand le programme synchronise une donnée. Le journal est écrit par
 * le serveur dans la transaction de chaque écriture. La tête de chaque donnée avance d'un cran par écriture :
 * deux écritures simultanées de la même donnée se suivent (la seconde est rejouée), comme dans PostgreSQL.
 */
export const SYNCHRO_DOCUMENTS = String.raw`import type { Document } from 'mongodb';
import { preparerCollection, type BaseDocuments } from './documents.js';
import type { Stockage } from './stockage.js';
import { ficheRendue, type JournalSynchro, type LigneJournal, type Resultat } from './synchro.js';

type Ligne = { _id: string; donnee: string; id: string; version: number; supprime: boolean; modifie_le: number; operation: string | null; portee: Record<string, unknown> };
const cle = (...morceaux: string[]) => morceaux.join('\u0000');

/** Produit par Humalis : le journal de la synchronisation dans une base de documents. */
export function creerJournalDocuments(base: BaseDocuments, tables: Record<string, { table: string; portee: string[]; champs?: string[] }>): JournalSynchro {
  for (const { table } of Object.values(tables)) if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error('nom de collection invalide : ' + table);
  const porteeDe = (donnee: string, fiche: Record<string, unknown> | null) => Object.fromEntries((tables[donnee]?.portee ?? []).filter((c) => fiche !== null && c in fiche).map((c) => [c, fiche![c]]));
  const tetes = base.collection<{ _id: string; version: number; plancher: number }>('humalis_synchro_tetes');
  const journal = base.collection<Ligne>('humalis_synchro_journal');
  const operations = base.collection<{ _id: string; donnee: string; resultat: string; quand: number }>('humalis_synchro_operations');
  let prete: Promise<void> | undefined;
  const installer = async () => {
    // Les collections et leurs index d'abord, hors de toute transaction.
    for (const nom of ['humalis_synchro_tetes', 'humalis_synchro_journal', 'humalis_synchro_operations']) {
      if ((await base.db.listCollections({ name: nom }, { nameOnly: true }).toArray()).length === 0) await base.db.createCollection(nom).catch(() => undefined);
    }
    await journal.createIndex({ donnee: 1, version: 1 });
    await operations.createIndex({ donnee: 1, quand: 1 });
    for (const { table } of Object.values(tables)) await preparerCollection(base, table)();
    // Un seul exemplaire installe : les fiches écrites avant la synchronisation entrent au journal, dans leur ordre de création.
    await base.verrou('humalis_synchro_installation', async () => {
      for (const [donnee, { table }] of Object.entries(tables)) {
        await tetes.updateOne({ _id: donnee }, { $setOnInsert: { version: 0, plancher: 0 } }, { upsert: true }).catch((erreur: unknown) => {
          if ((erreur as { code?: number }).code !== 11000) throw erreur;
        });
        for await (const d of base.collection<{ _id: string; data: Record<string, unknown>; cree_le: Date }>(table).find({}).sort({ ordre: 1 })) {
          if (await journal.findOne({ _id: cle(donnee, String(d._id)) })) continue;
          await base.transaction(() => noter(donnee, String(d._id), false, d.data ?? {}, d.cree_le instanceof Date ? d.cree_le.getTime() : Date.now()));
        }
      }
    });
  };
  const preparer = () =>
    (prete ??= installer().catch((erreur: unknown) => {
      prete = undefined;
      throw erreur;
    }));
  /** Une écriture : la tête avance d'un cran, et la ligne de la fiche prend ce numéro. */
  async function noter(donnee: string, id: string, supprime: boolean, fiche: Record<string, unknown> | null, quand = Date.now()): Promise<void> {
    const tete = await tetes.findOneAndUpdate({ _id: donnee }, { $inc: { version: 1 }, $setOnInsert: { plancher: 0 } }, base.o({ upsert: true, returnDocument: 'after' as const }));
    const version = Number(tete?.version ?? 1);
    // Une fiche supprimée garde la portée qu'elle avait : ceux qui la voyaient apprennent sa suppression.
    const avant = fiche === null ? (await journal.findOne({ _id: cle(donnee, id) }, base.o()))?.portee : undefined;
    const portee = fiche === null ? (avant ?? {}) : porteeDe(donnee, fiche);
    await journal.updateOne({ _id: cle(donnee, id) }, { $set: { donnee, id, version, supprime, modifie_le: quand, operation: null, portee: JSON.parse(JSON.stringify(portee)) } }, base.o({ upsert: true }));
  }
  const tableDe = (donnee: string) => {
    const t = tables[donnee];
    if (!t) throw new Error('donnée non suivie : ' + donnee);
    return t.table;
  };
  const lire = (l: Ligne): LigneJournal => ({ id: l.id, version: Number(l.version), supprime: l.supprime === true, modifieLe: Number(l.modifie_le), operation: l.operation ?? null, portee: l.portee ?? {} });
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
      const tete = await tetes.findOne({ _id: donnee }, base.o());
      const filtre: Document = { donnee, version: { $gt: depuis } };
      const conditions: Document[] = [];
      for (const [champ, valeur] of Object.entries(egal)) {
        if (!/^[^.$\u0000]+$/.test(champ)) return { lignes: [], tete: Number(tete?.version ?? 0), plancher: Number(tete?.plancher ?? 0) };
        conditions.push({ ['portee.' + champ]: { $eq: valeur } }, { ['portee.' + champ]: { $not: { $type: 'array' } } });
      }
      if (conditions.length > 0) filtre.$and = conditions;
      const lignes = await journal.find(filtre, base.o()).sort({ version: 1 }).limit(Math.max(0, Math.floor(limite))).toArray();
      // La « jointure » : les fiches encore là, lues d'un seul coup par leurs identifiants.
      const vivantes = lignes.filter((l) => !l.supprime).map((l) => l.id);
      const fiches = new Map<string, Record<string, unknown>>();
      if (vivantes.length > 0) {
        for (const d of await base.collection<{ _id: string; data: Record<string, unknown> }>(tableDe(donnee)).find({ _id: { $in: vivantes } }, base.o()).toArray()) fiches.set(String(d._id), d.data ?? {});
      }
      return {
        lignes: lignes.map((l) => ({ ...lire(l), fiche: fiches.has(l.id) ? ficheRendue(fiches.get(l.id)!, l.id, tables[donnee]?.champs) : null })),
        tete: Number(tete?.version ?? 0),
        plancher: Number(tete?.plancher ?? 0),
      };
    },
    async entree(donnee, id) {
      await preparer();
      const l = await journal.findOne({ _id: cle(donnee, id) }, base.o());
      return l ? lire(l) : null;
    },
    async horodater(donnee, id, modifieLe, operation) {
      await journal.updateOne({ _id: cle(donnee, id) }, { $set: { modifie_le: modifieLe, operation } }, base.o());
    },
    async operation(donnee, compte, operation) {
      await preparer();
      const l = await operations.findOne({ _id: cle(donnee, compte, operation) }, base.o());
      return l ? (JSON.parse(l.resultat) as Resultat) : null;
    },
    async retenir(donnee, compte, resultat) {
      // La première réponse est gardée : une seconde ne la remplace pas.
      await operations.updateOne({ _id: cle(donnee, compte, resultat.operation) }, { $setOnInsert: { donnee, resultat: JSON.stringify(resultat), quand: Date.now() } }, base.o({ upsert: true }));
    },
    exclusif(donnee, travail) {
      return base.verrou('humalis_synchro_' + donnee, travail);
    },
    async menage(donnee, avant) {
      await preparer();
      await base.transaction(async () => {
        const supprimees = await journal.find({ donnee, supprime: true, modifie_le: { $lt: avant } }, base.o()).toArray();
        if (supprimees.length > 0) {
          await journal.deleteMany({ _id: { $in: supprimees.map((l) => l._id) } }, base.o());
          await tetes.updateOne({ _id: donnee }, { $max: { plancher: Math.max(...supprimees.map((l) => Number(l.version))) } }, base.o());
        }
        await operations.deleteMany({ donnee, quand: { $lt: avant } }, base.o());
      });
    },
  };
}
`;
