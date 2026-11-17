/**
 * Plusieurs services dans un projet (décidé avec le mainteneur le 17 novembre 2026) : le code produit qui les fait parler.
 *
 * - Un appel d'un service à un autre (« envoyer requete vers "produits" du serveur "catalogue" … », « faire "reserver"
 *   sur produit du serveur "catalogue" … ») est une requête HTTP signée : la méthode, l'adresse, le corps, l'heure et
 *   un numéro à usage unique, avec le service qui appelle et celui qui est appelé, sont signés ensemble avec la clé
 *   privée du service qui appelle (ES256, HUMALIS_SERVICE_CLE_PRIVEE) ; chaque service connaît la clé publique des
 *   autres (HUMALIS_SERVICE_<NOM>_CLE). Un service ne peut donc ni signer au nom d'un autre, ni faire rejouer chez un
 *   troisième un appel qui ne lui était pas destiné (revue de sécurité du 17 novembre 2026, qui a remplacé le secret
 *   partagé). Le service appelé vérifie la signature, refuse un rejeu, puis traite la requête comme les autres : au nom de la
 *   personne quand il y en a une (son jeton voyage dans la partie signée), sinon au nom du service, seulement pour ce
 *   que « le serveur "x" peut … » lui donne.
 * - Un message (« signaler "commande-validee" avec commande ») est écrit dans la boîte d'envoi, dans la même
 *   transaction que le reste de l'action : il part seulement si tout a réussi. Un travailleur le livre ensuite en
 *   HTTP signé, et réessaie tant que le service visé ne l'a pas reçu (au moins une fois). Le service visé garde
 *   l'identifiant de chaque message reçu : un message livré deux fois n'est traité qu'une fois.
 * - Aucun outil externe : ni file de messages, ni courtier. Les adresses des autres services sont dans le .env.
 */
import type { ServeurRI } from '../../ri/types.js';

/** HUMALIS_SERVICE_CATALOGUE : l'adresse du service « catalogue ». */
export const variableDuService = (nom: string): string =>
  'HUMALIS_SERVICE_' +
  nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** src/humalis/services.ts */
export const servicesTs = (serveur: ServeurRI): string => {
  const projet = serveur.projet!;
  const adresses = projet.joints.map((j) => `    ${JSON.stringify(j)}: process.env.${variableDuService(j)}?.trim() || undefined,`).join('\n');
  return String.raw`import { createPrivateKey, createPublicKey, randomUUID, sign, verify, type KeyObject } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { idImpose, type Stockage } from './stockage.js';

/** Produit par Humalis : ce service, « ${serveur.nom.replace(/[`\\$]/g, '')} », parle aux autres services du projet. */
export const NOM_DU_SERVICE = ${JSON.stringify(serveur.nom)};
/** Le service qui garde les comptes : lui seul annonce un jeton ou un compte fermé. */
export const SERVICE_DES_COMPTES = ${JSON.stringify(projet.comptes)};

/** Les adresses des services que celui-ci joint, lues dans le .env. */
export const adressesDesServices = (): Record<string, string | undefined> => ({
${adresses}
});

/** Ce qu'un appel emporte : le jeton de la personne, quand une personne a lancé l'action. */
export interface Appel {
  jeton?: string;
}

/** Une réponse refusée par l'autre service (400, 403, 404…) : son message, tel quel. */
export class RefusDuService extends Error {
  constructor(message: string, readonly statut: number) {
    super(message);
  }
}

type Receveur = (corps: Record<string, unknown>, id: string) => Promise<void>;

export interface Services {
  /** Une fiche d'un autre service, par son identifiant. */
  lire(service: string, chemin: string, id: string, appel: Appel): Promise<Record<string, unknown>>;
  /** Une action d'un autre service ; la fiche telle qu'elle est après l'action. */
  faire(service: string, chemin: string, valeurs: Record<string, unknown>, appel: Appel): Promise<Record<string, unknown>>;
  /** Le jeton de la personne de cette requête (le cookie de session, ou l'en-tête Authorization). */
  appelDe(req: Request): Appel;
  /** Un message est dans la boîte d'envoi : le travailleur passe tout de suite. */
  reveiller(): void;
  /** En tête du serveur : une requête signée par un autre service est vérifiée, puis traitée comme les autres. */
  verifier: RequestHandler;
  /** POST /humalis/messages : un message d'un autre service. */
  recevoir: RequestHandler;
  /** Un message propre à Humalis (un jeton ou un compte fermé) part vers tous les autres services. */
  prevenirTous(message: string, corps: Record<string, unknown>): Promise<void>;
  arreter(): void;
}

export interface ReglagesServices {
  /** La clé privée de ce service (PEM) : il signe ses appels et ses messages. */
  clePrivee: string;
  /** La clé publique (PEM) de chaque autre service du projet : ses appels et ses messages se vérifient avec elle. */
  clesPubliques: Record<string, string | undefined>;
  /** Pour refuser une requête signée rejouée, même sur un autre exemplaire du serveur. */
  envois: { reserver(cle: string, empreinte: string): Promise<unknown> };
  boite: Stockage;
  recus: Stockage;
  transaction: <T>(corps: (s: { humalisBoite: Stockage; humalisRecus: Stockage }) => Promise<T>) => Promise<T>;
  /** « de|message » → ce que fait ce service à la réception. */
  receveurs: Record<string, Receveur>;
  /** Les messages propres à Humalis (jetons et comptes fermés). */
  messagesHumalis?: Record<string, (corps: Record<string, unknown>) => Promise<void>>;
  /** Tous les autres services du projet. */
  autres: string[];
  adresses?: Record<string, string | undefined>;
  horloge?: () => number;
}

const ENTETE_CHARGE = 'x-humalis-charge';
const ENTETE_SIGNATURE = 'x-humalis-signature';
const NOM_COOKIE = 'astratra_session';
const CINQ_MINUTES = 5 * 60 * 1000;
const SEPT_JOURS = 7 * 24 * 60 * 60 * 1000;
const TRENTE_JOURS = 30 * 24 * 60 * 60 * 1000;

type Verdict = { valid: true; value: Record<string, unknown> } | { valid: false };

/**
 * La signature d'un service : sa charge (JSON, en base64url) et sa signature ES256 (P-256, IEEE P1363), sur la charge
 * elle-même. La charge dit qui appelle (« de »), qui est appelé (« vers ») et quand ; elle vaut cinq minutes.
 */
function creerSignataire(reglages: ReglagesServices) {
  const privee = createPrivateKey(reglages.clePrivee);
  const publiques = new Map<string, KeyObject>();
  for (const [nom, pem] of Object.entries(reglages.clesPubliques)) if (pem) publiques.set(nom, createPublicKey(pem));
  const maintenant = reglages.horloge ?? Date.now;
  const signer = (charge: Record<string, unknown>) => {
    const payload = Buffer.from(JSON.stringify({ ...charge, quand: maintenant() })).toString('base64url');
    const signature = sign('sha256', Buffer.from(payload), { key: privee, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return { payload, signature };
  };
  const verifier = (payload: string, signature: string): Verdict => {
    let charge: Record<string, unknown>;
    try {
      charge = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    } catch {
      return { valid: false };
    }
    if (!charge || typeof charge !== 'object' || typeof charge.de !== 'string') return { valid: false };
    const cle = publiques.get(charge.de);
    if (!cle || charge.vers !== NOM_DU_SERVICE || typeof charge.quand !== 'number' || Math.abs(maintenant() - charge.quand) > CINQ_MINUTES) return { valid: false };
    let bonne = false;
    try {
      bonne = verify('sha256', Buffer.from(payload), { key: cle, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));
    } catch {
      bonne = false;
    }
    return bonne ? { valid: true, value: charge } : { valid: false };
  };
  return {
    sign: signer,
    headers: (charge: Record<string, unknown>, noms: { payload: string; signature: string }) => {
      const { payload, signature } = signer(charge);
      return { [noms.payload]: payload, [noms.signature]: signature };
    },
    verify: verifier,
    verifyHeaders: (entetes: Record<string, string>, noms: { payload: string; signature: string }) => verifier(String(entetes[noms.payload] ?? ''), String(entetes[noms.signature] ?? '')),
  };
}

/** L'attente avant de réessayer : 2 s, 4 s, 8 s… jusqu'à une heure. */
const attente = (essais: number) => Math.min(3_600_000, 2000 * 2 ** Math.min(essais, 20));

export function creerServices(reglages: ReglagesServices): Services {
  const signataire = creerSignataire(reglages);
  const maintenant = reglages.horloge ?? Date.now;
  const adresses = reglages.adresses ?? adressesDesServices();
  const adresseDe = (service: string): string => {
    const adresse = adresses[service];
    if (!adresse) throw new Error("l'adresse du serveur « " + service + " » n'est pas réglée dans le .env (voir .env.exemple).");
    return adresse.replace(/\/+$/, '');
  };

  /** Une requête signée vers un autre service. Un refus (4xx) devient un RefusDuService, avec le message de l'autre service. */
  async function appeler(service: string, methode: string, chemin: string, corps: Record<string, unknown> | undefined, appel: Appel): Promise<Record<string, unknown>> {
    const charge = { de: NOM_DU_SERVICE, vers: service, methode, chemin, ...(corps ? { corps } : {}), ...(appel.jeton ? { jeton: appel.jeton } : {}), numero: randomUUID() };
    const entetes = signataire.headers(charge, { payload: ENTETE_CHARGE, signature: ENTETE_SIGNATURE });
    const reponse = await fetch(adresseDe(service) + chemin, {
      method: methode,
      headers: { accept: 'application/json', ...entetes, ...(corps ? { 'content-type': 'application/json' } : {}) },
      ...(corps ? { body: JSON.stringify(corps) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    const texte = await reponse.text();
    let lu: unknown = null;
    try {
      lu = texte ? JSON.parse(texte) : null;
    } catch {
      lu = null;
    }
    if (reponse.status >= 400 && reponse.status < 500) {
      const message = lu && typeof lu === 'object' && typeof (lu as { erreur?: unknown }).erreur === 'string' ? (lu as { erreur: string }).erreur : 'le serveur « ' + service + ' » a refusé (' + reponse.status + ')';
      throw new RefusDuService(message, reponse.status);
    }
    if (!reponse.ok) throw new Error('le serveur « ' + service + ' » ne répond pas comme prévu (' + reponse.status + ')');
    return (lu ?? {}) as Record<string, unknown>;
  }

  let minuteur: ReturnType<typeof setTimeout> | undefined;
  let enCours = false;
  let arrete = false;
  let dernierMenage = 0;
  const signales = new Set<string>();

  /** Le travailleur : chaque message dû est pris (pour ne pas être livré deux fois en même temps), livré, puis retiré. */
  async function livrer(): Promise<void> {
    if (enCours || arrete) return;
    enCours = true;
    try {
      // Service par service, et page après page : des messages en attente pour un service en panne (ou toujours
      // refusés) ne retiennent jamais ceux des autres, ni les messages plus récents du même service.
      const lot: Awaited<ReturnType<Stockage['lister']>> = [];
      for (const vers of reglages.autres) {
        for (let depuis = 0; depuis < 5000; depuis += 200) {
          const page = await reglages.boite.lister({ egal: { vers }, limite: 200, depuis });
          lot.push(...page.filter((m) => Number(m.prochain) <= maintenant()));
          if (page.length < 200) break;
        }
      }
      for (const message of lot) {
        const heure = maintenant();
        if (Number(message.prochain) > heure) continue;
        const pris = await reglages.transaction(async (s) => {
          const fiche = await s.humalisBoite.trouver(message.id, true);
          if (!fiche || Number(fiche.prochain) > heure) return null;
          await s.humalisBoite.modifier(message.id, { prochain: heure + 60_000 });
          return fiche;
        });
        if (!pris) continue;
        try {
          const charge = { de: NOM_DU_SERVICE, vers: String(pris.vers), methode: 'POST', chemin: '/humalis/messages', id: pris.id, message: pris.message, corps: pris.corps };
          const { payload, signature } = signataire.sign(charge);
          const reponse = await fetch(adresseDe(String(pris.vers)) + '/humalis/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ payload, signature }),
            signal: AbortSignal.timeout(10_000),
          });
          if (!reponse.ok) throw new Error('réponse ' + reponse.status);
          await reglages.boite.supprimer(pris.id);
        } catch (erreur) {
          const essais = Number(pris.essais ?? 0) + 1;
          await reglages.boite.modifier(pris.id, { essais, prochain: maintenant() + attente(essais) });
          const age = maintenant() - Number(pris.cree ?? maintenant());
          // Un message n'est jamais perdu : il attend. Passé sept jours, chaque nouvel échec est une erreur du journal.
          const cle = String(pris.vers) + '|' + String(pris.message);
          if (age > SEPT_JOURS || !signales.has(cle)) {
            signales.add(cle);
            (age > SEPT_JOURS ? console.error : console.warn)('Le message « ' + String(pris.message) + ' » n\'a pas pu partir vers « ' + String(pris.vers) + ' » (essai ' + essais + ') : ' + (erreur instanceof Error ? erreur.message : String(erreur)) + '. Il repartira.');
          }
        }
      }
      // Les identifiants des messages reçus sont gardés trente jours.
      if (maintenant() - dernierMenage > 3_600_000) {
        dernierMenage = maintenant();
        for (const recu of await reglages.recus.lister({ egal: {}, limite: 1000 })) {
          if (maintenant() - Number(recu.recu ?? 0) < TRENTE_JOURS) break;
          await reglages.recus.supprimer(recu.id);
        }
      }
    } catch (erreur) {
      console.error('La boîte d\'envoi n\'a pas pu être lue :', erreur instanceof Error ? erreur.message : erreur);
    } finally {
      enCours = false;
    }
  }
  const battement = setInterval(() => void livrer(), 2000);
  battement.unref();

  return {
    lire: (service, chemin, id, appel) => appeler(service, 'GET', chemin + '/' + encodeURIComponent(id), undefined, appel),
    faire: (service, chemin, valeurs, appel) => appeler(service, 'PATCH', chemin, valeurs, appel),
    appelDe(req) {
      const autorisation = req.headers.authorization;
      if (autorisation?.startsWith('Bearer ') && autorisation !== 'Bearer humalis-service') return { jeton: autorisation.slice(7) };
      const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
      const jeton = cookies?.[NOM_COOKIE];
      return jeton ? { jeton } : {};
    },
    reveiller() {
      if (minuteur) return;
      minuteur = setTimeout(() => {
        minuteur = undefined;
        void livrer();
      }, 50);
      minuteur.unref?.();
    },
    verifier: (req, res, next) => {
      if (req.headers[ENTETE_SIGNATURE] === undefined) {
        next();
        return;
      }
      void (async () => {
        const verdict = signataire.verifyHeaders(req.headers as Record<string, string>, { payload: ENTETE_CHARGE, signature: ENTETE_SIGNATURE });
        const charge = (verdict.valid ? verdict.value : undefined) as { de?: unknown; methode?: unknown; chemin?: unknown; corps?: unknown; jeton?: unknown; numero?: unknown } | undefined;
        if (!verdict.valid || !charge || typeof charge.de !== 'string' || charge.methode !== req.method || charge.chemin !== req.originalUrl || typeof charge.numero !== 'string') {
          res.status(401).json({ erreur: 'signature de service refusée' });
          return;
        }
        // Un numéro ne sert qu'une fois, même sur un autre exemplaire du serveur : une requête rejouée est refusée.
        if ((await reglages.envois.reserver('humalis-service:' + charge.numero, 'appel')) !== 'libre') {
          res.status(409).json({ erreur: 'requête de service déjà reçue' });
          return;
        }
        const r = req as unknown as Request & { humalisService?: string; humalisSansPersonne?: boolean };
        r.humalisService = charge.de;
        // La personne : son jeton voyage dans la partie signée. Sans personne, le service agit en son propre nom.
        delete req.headers.cookie;
        if (typeof charge.jeton === 'string') req.headers.authorization = 'Bearer ' + charge.jeton;
        else {
          req.headers.authorization = 'Bearer humalis-service';
          r.humalisSansPersonne = true;
        }
        // Le corps signé est celui qui compte : le corps envoyé à côté n'est jamais lu, même par le lecteur JSON du pack.
        const signe = charge.corps && typeof charge.corps === 'object' ? charge.corps : {};
        Object.defineProperty(r, 'body', { get: () => signe, set: () => undefined, configurable: true, enumerable: true });
        next();
      })().catch(next);
    },
    recevoir: (req, res, next) => {
      void (async () => {
        const enveloppe = (req.body ?? {}) as { payload?: unknown; signature?: unknown };
        const verdict = signataire.verify(String(enveloppe.payload ?? ''), String(enveloppe.signature ?? ''));
        const charge = (verdict.valid ? verdict.value : undefined) as { de?: unknown; chemin?: unknown; id?: unknown; message?: unknown; corps?: unknown } | undefined;
        if (!verdict.valid || !charge || charge.chemin !== '/humalis/messages' || typeof charge.de !== 'string' || typeof charge.id !== 'string' || typeof charge.message !== 'string') {
          res.status(401).json({ erreur: 'signature de service refusée' });
          return;
        }
        const corps = (charge.corps && typeof charge.corps === 'object' ? charge.corps : {}) as Record<string, unknown>;
        const propre = reglages.messagesHumalis?.[charge.message];
        // Un jeton ou un compte fermé ne s'annonce que par le service des comptes.
        if (propre && charge.de !== SERVICE_DES_COMPTES) {
          res.status(403).json({ erreur: 'seul le service des comptes annonce « ' + charge.message + ' »' });
          return;
        }
        const receveur = reglages.receveurs[charge.de + '|' + charge.message];
        if (!propre && !receveur) {
          // Un service déployé avant l'autre : le message repartira plus tard.
          res.status(409).json({ erreur: 'message « ' + charge.message + ' » inconnu ici' });
          return;
        }
        const id = charge.de + ':' + charge.id;
        if (propre) {
          await propre(corps);
          res.json({ recu: true });
          return;
        }
        // Une seule fois : l'identifiant du message est écrit dans la même transaction que ce qu'il fait faire.
        if (await reglages.recus.trouver(id)) {
          res.json({ recu: true, deja: true });
          return;
        }
        await receveur!(corps, id);
        res.json({ recu: true });
      })().catch(next);
    },
    async prevenirTous(message, corps) {
      for (const vers of reglages.autres) {
        await reglages.boite.creer({ vers, message, corps, essais: 0, prochain: 0, cree: maintenant() });
      }
      this.reveiller();
    },
    arreter() {
      arrete = true;
      clearInterval(battement);
      if (minuteur) clearTimeout(minuteur);
    },
  };
}

/** Dans la transaction d'un message reçu : son identifiant, pour ne jamais le traiter deux fois. */
export async function noterRecu(recus: Stockage, id: string, de: string, message: string): Promise<void> {
  await idImpose.run({ id, pris: false }, () => recus.creer({ de, message, recu: Date.now() }));
}

/**
 * Le droit d'un service qui agit sans personne connectée : « le serveur "x" peut … » dans la route. La méthode et
 * l'adresse disent l'action : GET lire, POST créer, PATCH /:id modifier, DELETE supprimer, PATCH /faire/<action>/:id.
 */
export function droitDuService(droits: { serveur: string; actions: string[]; faire?: string }[] | undefined, service: string, methode: string, chemin: string): boolean {
  const permis = (droits ?? []).filter((d) => d.serveur === service);
  // Comme le routeur : sans tenir compte des majuscules, ni des doubles barres, et le chemin décodé (« /FAIRE/ »,
  // « /f%61ire/ » mènent à la même action).
  let lu = chemin;
  try {
    lu = decodeURIComponent(chemin);
  } catch {
    return false;
  }
  const faire = /^\/+faire\/+([^/]+)\/*/i.exec(lu)?.[1]?.toLowerCase();
  if (methode === 'PATCH' && faire !== undefined) return permis.some((d) => d.faire?.toLowerCase() === faire);
  const action = methode === 'GET' ? 'lire' : methode === 'POST' ? 'creer' : methode === 'PATCH' ? 'modifier' : methode === 'DELETE' ? 'supprimer' : '';
  return permis.some((d) => d.actions.includes(action));
}
`;
};
