/**
 * Les e-mails et les comptes invités du serveur produit (« emails »,
 * « invitations vers … », « mot de passe oublie vers … », « … peut lire comptes »).
 * La sécurité reste aux packs : le lien du mot de passe oublié et sa consommation
 * viennent de @astratra/saas-kit, l'envoi et le nettoyage des en-têtes de
 * @astratra/notify. Une invitation est un compte sans secret et un jeton du même magasin.
 */
import type { MorceauEmail, ServeurRI } from '../../ri/types.js';
import { simplifier } from '../../analyse/elements.js';
import { camel } from '../web/noms.js';
import { champsDeGroupe } from './separation.js';
import { avecNotifications } from './logique.js';

const chaine = (texte: string) => JSON.stringify(texte);

/** Vrai si le serveur a besoin du module des comptes. */
export const avecComptes = (serveur: ServeurRI) => Boolean(serveur.invitations || serveur.inscriptionLibre || serveur.motDePasseOublie || serveur.routeComptes || serveur.routeMonCompte || serveur.changeDeRole || serveur.changeDeCompte);

/** Vrai si le serveur produit a son module d'e-mails : une liste de comptes seule en a besoin aussi, sans jamais rien envoyer. */
export const avecEmails = (serveur: ServeurRI) => Boolean(serveur.emails) || avecComptes(serveur);

/** Le chemin d'une page, tel que le site le sert ; le nom de la page si la commande n'a pas donné ses chemins. */
const cheminDe = (page: string | undefined, chemins?: Map<string, string>) =>
  page === undefined ? 'null' : chaine(chemins?.get(page) ?? `/${page.split('-').map(simplifier).filter(Boolean).join('-')}`);

/** Un texte d'e-mail en TypeScript : ses morceaux, ceux de la fiche étant relus au moment de l'envoi. */
function texteEmail(morceaux: MorceauEmail[]): string {
  return (
    morceaux.map((m) => ('champ' in m ? `enTexte(fiche[${chaine(camel(m.champ))}])` : chaine(m.texte))).join(' + ') || "''"
  );
}

/** Les e-mails qu'une création fait partir, après la réponse : un envoi raté ne fait jamais échouer la création. */
export function codeEnvois(serveur: ServeurRI, route: ServeurRI['routes'][number]): string {
  const lignes = (route.envois ?? []).map((envoi) => {
    const { destinataire } = envoi;
    const a = destinataire.genre === 'admins' ? 'await adressesDesAdmins()' : destinataire.genre === 'adresse' ? chaine(destinataire.adresse) : `enTexte(fiche[${chaine(camel(destinataire.champ))}])`;
    return `            await emails.envoyer({ a: ${a}, sujet: ${texteEmail(envoi.sujet)}, texte: ${texteEmail(envoi.texte)} });`;
  });
  return `          void (async () => {
            const fiche = cree as Record<string, unknown>;
${lignes.join('\n')}
          })().catch((erreur: unknown) => console.error('Un e-mail du serveur « ${serveur.nom.replace(/[\\'`$]/g, '')} » n\\'est pas parti :', erreur instanceof Error ? erreur.message : erreur));`;
}

/** Ce que serveur.ts met dans createSaasApp et autour, quand le serveur a des comptes. */
export function codeCreationComptes(serveur: ServeurRI, chemins?: Map<string, string>): string {
  return `  const comptes = creerComptes({
    usersStore,
    jetons,
    emails,
    renouvellement,
    revocations,
    nom: ${chaine(serveur.nom)},
    google: ${serveur.connexionGoogle ? 'true' : 'false'},
    pageInvitation: ${cheminDe(serveur.invitations, chemins)},
    inscription: ${serveur.inscriptionLibre ? `{ role: ${chaine(serveur.inscriptionLibre.role === 'membre' ? 'user' : serveur.inscriptionLibre.role)}, page: ${cheminDe(serveur.inscriptionLibre.page, chemins)} }` : 'null'},
    rolesPermis: ${JSON.stringify(serveur.roles ?? [])},
    champsDeGroupe: ${JSON.stringify(champsDeGroupe(serveur))},
    schemaCompte: { ${(serveur.champsCompte ?? []).map((c) => `${chaine(camel(c.nom))}: ${schemaCompte(c.type)}`).join(', ')} },
    pageOublie: ${cheminDe(serveur.motDePasseOublie, chemins)},${serveur.connexionCleAcces || serveur.doubleAuthentification ? '\n    surRetrait: (id) => oublierCompte(magasinSecurite, id),' : ''}${serveur.routeMonCompte?.supprimer ? (avecNotifications(serveur) ? "\n    // Ses fiches, puis ses appareils inscrits aux notifications : plus rien ne part vers ce compte.\n    effacerLesDonnees: async (id) => {\n      await effacerLesDonnees(id, transaction);\n      for (const appareil of await appareils.lister({ egal: { compte: id } })) await appareils.supprimer(appareil.id);\n    }," : '\n    effacerLesDonnees: (id) => effacerLesDonnees(id, transaction),') : ''}
  });
`;
}

const schemaCompte = (type: NonNullable<ServeurRI['champsCompte']>[number]['type']): string => (type.genre === 'liste' ? `{ liste: ${schemaCompte(type.de)} }` : `'${type.genre}'`);

const gardeInvitation = (qui: string) => (qui.startsWith('role:') ? `roles(${JSON.stringify(qui.slice(5).split(','))})` : 'seulAdmin');

/** Les routes des comptes, dans extendRoutes, avec les gardes du pack. */
export function codeRoutesComptes(serveur: ServeurRI, adresseApi: (adresse: string) => string, variable: (adresse: string) => string): string {
  const parties: string[] = [];
  if (serveur.invitations) {
    parties.push(`
      // « inviter … » : réservé à l'admin, et trente invitations par heure au plus.
      const routeInvitations = express.Router();
      routeInvitations.post('/', createApiLimiter({ windowMs: 60 * 60 * 1000, max: 30 }) as unknown as RequestHandler, ...acces.${serveur.routeComptes?.droits.creer ? gardeInvitation(serveur.routeComptes.droits.creer) : 'seulAdmin'}, csrfMiddleware, comptes.inviter);
      app.use('/auth/invitations', routeInvitations);
`);
  }
  if (serveur.inscriptionLibre) {
    parties.push(`
      // « inscription libre » : chacun crée son compte, dix fois par heure au plus depuis une même adresse IP.
      // La confirmation compte les essais comme une connexion : on y devine un jeton.
      const routeInscription = express.Router();
      routeInscription.post('/', createApiLimiter({ windowMs: 60 * 60 * 1000, max: 10 }) as unknown as RequestHandler, ...acces.toutLeMonde, csrfMiddleware, comptes.inscrire);
      app.use('/auth/inscription', routeInscription);
      const routeConfirmation = express.Router();
      routeConfirmation.post('/', createLoginLimiter() as unknown as RequestHandler, ...acces.toutLeMonde, csrfMiddleware, comptes.confirmer);
      app.use('/auth/confirmation', routeConfirmation);
`);
  }
  if (serveur.changeDeRole || serveur.changeDeCompte) {
    parties.push(`
      // « changer role » est réservé à l'admin ; « changer compte » à la règle « … peut modifier comptes ». Le compte est relu à chaque requête.
      const routeRoles = express.Router();
${serveur.changeDeRole ? "      routeRoles.post('/:id/role', ...acces.seulAdmin, csrfMiddleware, comptes.changerRole);\n" : ''}${serveur.changeDeCompte ? `      routeRoles.post('/:id/champs', ...acces.${gardeInvitation(serveur.routeComptes?.droits.modifier ?? 'admin')}, csrfMiddleware, comptes.changerChamps);\n` : ''}      app.use('/auth/comptes', routeRoles);
`);
  }
  if (serveur.routeMonCompte?.supprimer) {
    parties.push(`
      // « connecte peut supprimer son compte » : son propre compte seulement, avec son mot de passe s'il en a un.
      // Le limiteur compte les essais comme pour la connexion : on devine un secret.
      const routeSuppressionCompte = express.Router();
      routeSuppressionCompte.post('/', createLoginLimiter() as unknown as RequestHandler, ...acces.connecte, csrfMiddleware, comptes.supprimerMonCompte);
      app.use('/auth/suppression-compte', routeSuppressionCompte);
`);
  }
  if (serveur.routeMonCompte?.lire) {
    const nom = variable(serveur.routeMonCompte.adresse);
    parties.push(`
      // « ${serveur.routeMonCompte.adresse} » : la personne connectée lit son propre compte, sans aucun secret.
      const ${nom} = express.Router();
      ${nom}.get('/', lecturePrivee, ...acces.connecte, comptes.monCompte);
      app.use('${adresseApi(serveur.routeMonCompte.adresse)}', ${nom});
`);
  }
  const route = serveur.routeComptes;
  if (route) {
    const garde = (action: 'lire' | 'supprimer') => (route.droits[action] === null ? 'refuse' : `...acces.${gardeInvitation(route.droits[action]!)}`);
    const nom = variable(route.adresse);
    parties.push(`
      // « ${route.adresse} » : les comptes de la connexion, sans aucun secret.
      const ${nom} = express.Router();
      ${nom}.get('/', lecturePrivee, ${garde('lire')}, comptes.lister);
      ${nom}.post('/', refuse);
      ${nom}.patch('/:id', refuse);
      ${nom}.delete('/:id', ${garde('supprimer')}${route.droits.supprimer === null ? '' : ', csrfMiddleware'}, comptes.retirer);
      app.use('${adresseApi(route.adresse)}', ${nom});
`);
  }
  return parties.join('');
}

/** .env.exemple : les réglages des e-mails et des liens. */
export const ENV_EMAILS = `# Les e-mails (« emails ») : le serveur d'envoi SMTP de votre choix. Rien par défaut :
# sans hôte, port et adresse d'envoi, rien ne part et le serveur le dit.
# Port 465 : chiffré dès la connexion ; tout autre port : STARTTLS exigé (sauf sur cette machine, localhost).
HUMALIS_EMAILS_HOTE=
HUMALIS_EMAILS_PORT=
HUMALIS_EMAILS_EXPEDITEUR=
# L'identifiant et le mot de passe SMTP, si le serveur d'envoi en demande (les deux ensemble).
HUMALIS_EMAILS_UTILISATEUR=
HUMALIS_EMAILS_MOT_DE_PASSE=
# Combien d'e-mails ce serveur envoie par heure au plus (100 par défaut).
HUMALIS_EMAILS_PAR_HEURE=
`;

export const ENV_LIENS = `# L'adresse publique du site, pour les liens envoyés par e-mail (https://ma-boutique.com).
# Le serveur ne la devine jamais depuis une requête : quelqu'un pourrait y glisser son propre site.
HUMALIS_ADRESSE_SITE=
`;

/** Le coffre des clés : les réglages du serveur d'envoi. */
export const CLES_EMAILS = `      {
        key: 'HUMALIS_EMAILS_HOTE',
        label: "Serveur d'envoi des e-mails (SMTP)",
        help: "L'hôte SMTP de votre service d'envoi. Sans lui, rien ne part.",
        where: "Les réglages SMTP de votre service d'envoi",
      },
      {
        key: 'HUMALIS_EMAILS_PORT',
        label: 'Port SMTP',
        help: '465 (chiffré dès la connexion) ou 587 (STARTTLS), selon votre service.',
        where: "Les réglages SMTP de votre service d'envoi",
      },
      {
        key: 'HUMALIS_EMAILS_UTILISATEUR',
        label: 'Identifiant SMTP',
        help: "Si votre service d'envoi en demande un.",
        where: "Les réglages SMTP de votre service d'envoi",
      },
      {
        key: 'HUMALIS_EMAILS_MOT_DE_PASSE',
        label: 'Mot de passe SMTP',
        help: "Si votre service d'envoi en demande un.",
        where: "Les réglages SMTP de votre service d'envoi",
      },
      {
        key: 'HUMALIS_EMAILS_EXPEDITEUR',
        label: "Adresse d'envoi",
        help: "Une adresse que votre service d'envoi accepte comme expéditeur.",
        where: "Les réglages de votre service d'envoi",
      },
`;

/** Les réglages qui manquent, dans les messages du serveur produit. */
export const REGLAGES_EMAILS = 'HUMALIS_EMAILS_HOTE, HUMALIS_EMAILS_PORT, HUMALIS_EMAILS_EXPEDITEUR';

/** src/humalis/emails.ts */
export const EMAILS = String.raw`import { createMailer } from '@astratra/notify';
import nodemailer from 'nodemailer';

/**
 * Produit par Humalis : les e-mails du serveur, par @astratra/notify et SMTP, vers le serveur d'envoi choisi dans le .env.
 * Les réglages sont relus à chaque envoi, pour qu'un changement dans le coffre serve aussitôt.
 * Rien ici ne montre un mot de passe, ni dans un journal, ni dans une erreur.
 */
const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEURE = 60 * 60 * 1000;

export interface MessageEmail {
  a: string | string[];
  sujet: string;
  texte: string;
  html?: string;
}

export interface Emails {
  /** Vrai si le serveur d'envoi et l'adresse d'envoi sont réglés. */
  pret(): boolean;
  /** Ne lève jamais : vrai si le serveur d'envoi a pris l'e-mail. */
  envoyer(message: MessageEmail): Promise<boolean>;
}

export interface ReglagesSmtp {
  hote: string;
  port: number;
  utilisateur: string;
  motDePasse: string;
  expediteur: string;
}

/** Un e-mail prêt à partir, tel que le transport le reçoit. */
export interface EnvoiSmtp {
  de: { nom: string; adresse: string };
  a: string[];
  sujet: string;
  texte?: string;
  html?: string;
}

/** Envoie un e-mail ; lève si le serveur d'envoi le refuse. Les tests en donnent un faux. */
export type TransportEmails = (reglages: ReglagesSmtp, envoi: EnvoiSmtp) => Promise<void>;

const LOCAL = new Set(['localhost', '127.0.0.1', '::1']);

/** Le transport par défaut : SMTP, chiffré (465 d'emblée, sinon STARTTLS exigé), sauf vers cette machine. */
export const transportSmtp: TransportEmails = async (reglages, envoi) => {
  const chiffre = reglages.port === 465;
  const transporteur = nodemailer.createTransport({
    host: reglages.hote,
    port: reglages.port,
    secure: chiffre,
    requireTLS: !chiffre && !LOCAL.has(reglages.hote),
    ...(reglages.utilisateur ? { auth: { user: reglages.utilisateur, pass: reglages.motDePasse } } : {}),
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  try {
    await transporteur.sendMail({
      from: { name: envoi.de.nom, address: envoi.de.adresse },
      to: envoi.a,
      subject: envoi.sujet,
      ...(envoi.texte !== undefined ? { text: envoi.texte } : {}),
      ...(envoi.html ? { html: envoi.html } : {}),
    });
  } finally {
    transporteur.close();
  }
};

/** Une valeur d'une fiche dans un texte : une valeur absente ne s'écrit pas. */
export const enTexte = (valeur: unknown) => (valeur === null || valeur === undefined ? '' : String(valeur));

/** L'hôte, le port et le mot de passe tels que le .env les donnait au démarrage, avant tout changement dans le coffre. */
export type OrigineSmtp = { hote: string; port: string; motDePasse: string };
export const origineSmtp = (env: Record<string, string | undefined>): OrigineSmtp => ({
  hote: (env.HUMALIS_EMAILS_HOTE ?? '').trim(),
  port: (env.HUMALIS_EMAILS_PORT ?? '').trim(),
  motDePasse: (env.HUMALIS_EMAILS_MOT_DE_PASSE ?? '').trim(),
});
/** Pris au chargement de ce module : après le .env (lu par Node au lancement), avant que le coffre y écrive ses valeurs. */
const ORIGINE_DU_ENV = origineSmtp(process.env);

/**
 * Les réglages du .env (et du coffre), ou ce qui manque. Le mot de passe suit l'hôte : un hôte ou un port changé dans
 * le coffre ne reçoit jamais le mot de passe du .env, il faut le redonner avec lui (revue de sécurité du 17 novembre
 * 2026 : un admin de l'application obtenait ainsi le mot de passe SMTP).
 */
export function reglagesSmtp(env: Record<string, string | undefined> = process.env, origine?: OrigineSmtp): ReglagesSmtp | { manque: string } {
  const lire = (cle: string) => (env[cle] ?? '').trim();
  const hote = lire('HUMALIS_EMAILS_HOTE');
  const port = Number(lire('HUMALIS_EMAILS_PORT'));
  const expediteur = lire('HUMALIS_EMAILS_EXPEDITEUR');
  const utilisateur = lire('HUMALIS_EMAILS_UTILISATEUR');
  const motDePasse = lire('HUMALIS_EMAILS_MOT_DE_PASSE');
  const manque = [
    !hote && 'HUMALIS_EMAILS_HOTE',
    !(Number.isInteger(port) && port > 0 && port < 65536) && 'HUMALIS_EMAILS_PORT',
    !ADRESSE.test(expediteur) && 'HUMALIS_EMAILS_EXPEDITEUR',
  ].filter(Boolean);
  if (manque.length) return { manque: 'les e-mails ne sont pas réglés : renseignez ' + manque.join(', ') + ' dans le .env' };
  if (Boolean(utilisateur) !== Boolean(motDePasse)) return { manque: 'les e-mails ne sont pas réglés : HUMALIS_EMAILS_UTILISATEUR et HUMALIS_EMAILS_MOT_DE_PASSE vont ensemble' };
  if (origine && motDePasse && motDePasse === origine.motDePasse && (hote !== origine.hote || String(port) !== origine.port)) {
    return { manque: "l'hôte ou le port SMTP a changé dans le coffre : redonnez-y aussi le mot de passe SMTP, qui ne part jamais vers un autre hôte que celui du .env" };
  }
  return { hote, port, utilisateur, motDePasse, expediteur };
}

export function creerEmails({
  nom,
  env = process.env,
  transport = transportSmtp,
  horloge = Date.now,
}: {
  nom: string;
  env?: Record<string, string | undefined>;
  transport?: TransportEmails;
  horloge?: () => number;
}): Emails {
  const envois: number[] = [];
  const origine = env === process.env ? ORIGINE_DU_ENV : origineSmtp(env);
  return {
    pret: () => !('manque' in reglagesSmtp(env, origine)),
    async envoyer({ a, sujet, texte, html }) {
      const reglages = reglagesSmtp(env, origine);
      if ('manque' in reglages) {
        console.warn('E-mail non envoyé : ' + reglages.manque + '.');
        return false;
      }
      const limite = Number(env.HUMALIS_EMAILS_PAR_HEURE) || 100;
      while (envois.length > 0 && envois[0] <= horloge() - HEURE) envois.shift();
      if (envois.length >= limite) {
        console.warn('E-mail non envoyé : la limite de ' + limite + ' par heure est atteinte (HUMALIS_EMAILS_PAR_HEURE).');
        return false;
      }
      envois.push(horloge());
      const mailer = createMailer({
        channels: {
          transactional: {
            from: reglages.expediteur,
            fromName: nom,
            async send(message: { to: string[]; subject: string; text?: string; html?: string }) {
              try {
                await transport(reglages, { de: { nom, adresse: reglages.expediteur }, a: message.to, sujet: message.subject, texte: message.text, ...(message.html ? { html: message.html } : {}) });
              } catch (erreur) {
                // Le code de la réponse SMTP seulement : jamais l'identifiant ni le mot de passe.
                const code = (erreur as { responseCode?: unknown; code?: unknown }).responseCode ?? (erreur as { code?: unknown }).code;
                throw new Error("le serveur d'envoi a refusé l'e-mail" + (code ? ' (' + String(code) + ')' : ''));
              }
              return {};
            },
          },
        },
      });
      const { sent, reason } = await mailer.send({ to: a, subject: sujet, text: texte, ...(html ? { html } : {}) });
      if (!sent) console.error('E-mail non envoyé : ' + (reason ?? 'raison inconnue') + '.');
      return sent;
    },
  };
}
`;

/** src/humalis/comptes.ts */
export const COMPTES = `import { createHash, randomBytes } from 'node:crypto';
import { createMemoryPasswordResetStore, type PasswordResetStore, type SaasUser, type UsersStore } from '@astratra/saas-kit';
import { hashPassword, isStrongPassword, verifyPasswordHash, type RefreshTokenService, type RevocationStore } from '@astratra/security';
import type { RequestHandler } from 'express';
import type { Emails } from './emails.js';
import type { PoolPostgres } from './stockage.js';
import { verifierEnvoi, type Schema } from './verifier.js';

/**
 * Produit par Humalis : les invitations, le lien du mot de passe oublié et la liste des comptes.
 * Un lien porte un jeton de 32 octets au hasard dans son fragment (#jeton=…), que le navigateur
 * n'envoie jamais à un serveur ; seule son empreinte est gardée, et le pack la consomme une fois.
 */
const ROLE_RETIRE = 'retire';
/** « supprimer mon compte » : la personne a supprimé son compte, vidé sur place ; il ne se rouvre jamais. */
const ROLE_SUPPRIME = 'supprime';
/** Un compte retiré ou supprimé n'existe plus pour personne. */
const estFerme = (compte: { role?: unknown }) => compte.role === ROLE_RETIRE || compte.role === ROLE_SUPPRIME;
/** Les champs que le compte garde pour lui (en minuscules) : aucune route ne les rend ni ne les change. */
const CHAMPS_INTERNES = new Set(['id', 'email', 'role', 'statut', 'password', 'passwordhash', 'invitation', 'inscription', 'googlesubject', 'applesubject', 'tokenversion', 'createdat', 'updatedat']);
const ADRESSE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
const SEPT_JOURS = 7 * 24 * 60 * 60 * 1000;
const UN_JOUR = 24 * 60 * 60 * 1000;
const UNE_HEURE = 60 * 60 * 1000;
const DIX_MINUTES = 10 * 60 * 1000;
const FAIBLE = 'ce mot de passe est trop faible : au moins 8 caractères, avec une majuscule, une minuscule, un chiffre et un signe';

/** « inscription » : le moment d'une inscription libre pas encore confirmée ; sans lui, une invitation d'un membre. */
type Compte = SaasUser & { invitation?: boolean; inscription?: number | null; passwordHash?: unknown };

/** Une inscription libre en attente de sa confirmation. */
const enAttente = (compte: Compte | null): boolean => compte !== null && compte.invitation === true && typeof compte.inscription === 'number';

const empreinte = (jeton: string) => createHash('sha256').update(jeton).digest('hex');
const echapper = (texte: string) => texte.replace(/[&<>"']/g, (c) => \`&#\${c.charCodeAt(0)};\`);

/**
 * Les comptes vus par les packs : un compte retiré n'existe plus pour eux (connexion, Google, mot de passe
 * oublié, session). Le pack écrit « password » en réinitialisant, Humalis lit « passwordHash ». Choisir un
 * mot de passe ou lier un compte Google, c'est accepter l'invitation.
 */
export function sansLesRetires(store: UsersStore): UsersStore {
  const visible = (compte: SaasUser | null) => (compte && !estFerme(compte) ? compte : null);
  return {
    findByEmail: async (email) => visible(await store.findByEmail(email)),
    findById: async (id) => visible(await store.findById(id)),
    create: (compte) => store.create(compte),
    list: async (options) => (await store.list(options)).filter((compte) => !estFerme(compte)),
    ...(store.count ? { count: (options) => store.count!(options) } : {}),
    ...(store.countByRole ? { countByRole: () => store.countByRole!() } : {}),
    update: (id, modifs) => {
      const { password, ...reste } = modifs as Compte & { password?: unknown };
      const ecrit: Compte = { ...reste, ...(password !== undefined ? { passwordHash: password } : {}) };
      if ('passwordHash' in ecrit || 'googleSubject' in ecrit || 'appleSubject' in ecrit) ecrit.invitation = false;
      return store.update(id, ecrit);
    },
  };
}

/** Les empreintes des liens, dans PostgreSQL : un redémarrage ne les perd pas. Sans base, en mémoire. */
export function creerMagasinJetons(pool: PoolPostgres | null): PasswordResetStore {
  if (!pool) return createMemoryPasswordResetStore();
  let prete: Promise<unknown> | undefined;
  const preparer = () =>
    (prete ??= pool
      .query('CREATE TABLE IF NOT EXISTS liens_mot_de_passe (empreinte TEXT PRIMARY KEY, utilisateur TEXT NOT NULL, expire_le BIGINT NOT NULL)')
      .catch((erreur: unknown) => {
        prete = undefined;
        throw erreur;
      }));
  const lire = (l: Record<string, unknown> | undefined) => (l ? { hash: String(l.empreinte), userId: String(l.utilisateur), expiresAt: Number(l.expire_le) } : null);
  return {
    async save({ hash, userId, expiresAt }) {
      await preparer();
      await pool.query('DELETE FROM liens_mot_de_passe WHERE expire_le <= $1', [Date.now()]);
      await pool.query('INSERT INTO liens_mot_de_passe (empreinte, utilisateur, expire_le) VALUES ($1, $2, $3)', [hash, userId, expiresAt]);
    },
    async find(hash) {
      await preparer();
      return lire((await pool.query('SELECT * FROM liens_mot_de_passe WHERE empreinte = $1', [hash])).rows[0]);
    },
    // Consommer supprime : un second essai avec le même lien ne trouve rien, même à deux en même temps.
    async consume(hash) {
      await preparer();
      return lire((await pool.query('DELETE FROM liens_mot_de_passe WHERE empreinte = $1 RETURNING *', [hash])).rows[0]);
    },
    async deleteForUser(userId) {
      await preparer();
      await pool.query('DELETE FROM liens_mot_de_passe WHERE utilisateur = $1', [userId]);
    },
  };
}

/** Avant le pack : un mot de passe trop faible est refusé sans consommer le lien. */
export const refuserMotDePasseFaible: RequestHandler = (req, res, next) => {
  const motDePasse = (req.body as { password?: unknown } | undefined)?.password;
  if (typeof motDePasse === 'string' && !isStrongPassword(motDePasse)) {
    res.status(400).json({ erreur: FAIBLE });
    return;
  }
  next();
};

/** Tous les comptes, page par page : au-delà de 500, aucun n'est oublié. */
export async function tousLesComptes(store: UsersStore): Promise<Compte[]> {
  const PAGE = 500;
  const tous: Compte[] = [];
  const vus = new Set<string>();
  for (let depuis = 0; depuis < 200_000; depuis += PAGE) {
    const page = (await store.list({ limit: PAGE, offset: depuis })) as Compte[];
    const neufs = page.filter((c) => !vus.has(String(c.id)));
    for (const c of neufs) vus.add(String(c.id));
    tous.push(...neufs);
    // Une page incomplète, ou un magasin qui ignore « offset » et redonne les mêmes : c'est fini.
    if (page.length < PAGE || neufs.length === 0) break;
  }
  return tous;
}

export function creerComptes({
  usersStore,
  jetons,
  emails,
  renouvellement,
  revocations,
  nom,
  google,
  pageInvitation,
  inscription = null,
  rolesPermis,
  champsDeGroupe = [],
  schemaCompte: schemaDeclare = {},
  pageOublie,
  surRetrait,
  effacerLesDonnees,
  env = process.env,
}: {
  /** Tous les comptes, retirés compris : une nouvelle invitation peut en rouvrir un. */
  usersStore: UsersStore;
  jetons: PasswordResetStore;
  emails: Emails;
  renouvellement: RefreshTokenService;
  revocations: RevocationStore;
  nom: string;
  google: boolean;
  pageInvitation: string | null;
  /** « inscription libre comme client vers "confirmation" » : le rôle du compte créé et la page du lien. */
  inscription?: { role: string; page: string } | null;
  /** Les rôles déclarés : seuls ceux-là peuvent être donnés par une invitation. */
  rolesPermis: string[];
  /** Les groupes d'un compte (« donnee … par boutique ») : celui qui invite y fait entrer la personne. */
  champsDeGroupe?: string[];
  /** Les champs déclarés dans « compte : ». */
  schemaCompte?: Schema;
  pageOublie: string | null;
  /** Ce qui disparaît en plus avec un compte retiré : ses clés d'accès et son code à six chiffres. */
  surRetrait?: (id: string) => Promise<void>;
  /** « connecte peut supprimer son compte » : les fiches de la personne, effacées ou rendues anonymes, toutes ou aucune. */
  effacerLesDonnees?: (id: string) => Promise<void>;
  env?: Record<string, string | undefined>;
}) {
  // Jamais un champ interne du compte (l'empreinte du mot de passe…), même s'il avait été déclaré : ni lu, ni écrit.
  const schemaCompte = Object.fromEntries(Object.entries(schemaDeclare).filter(([champ]) => !CHAMPS_INTERNES.has(champ.toLowerCase()))) as Schema;
  // L'adresse du site vient de l'environnement, jamais d'une requête : un en-tête Host choisi ne détourne aucun lien.
  const adresseDuSite = () => {
    const adresse = (env.HUMALIS_ADRESSE_SITE ?? '').trim().replace(/\\/+$/, '');
    return /^https:\\/\\/[^/]|^http:\\/\\/localhost(:\\d+)?$/.test(adresse) ? adresse : null;
  };
  const lien = (page: string, jeton: string) => \`\${adresseDuSite()}\${page}#jeton=\${jeton}\`;
  const corpsHtml = (phrase: string, adresse: string, fin: string) =>
    \`<p>Bonjour,</p><p>\${echapper(phrase)}</p><p><a href="\${echapper(adresse)}">\${echapper(adresse)}</a></p><p>\${echapper(fin)}</p>\`;

  // Une même adresse ne reçoit qu'un lien de mot de passe toutes les dix minutes : on n'inonde pas la boîte de quelqu'un.
  const derniersLiens = new Map<string, number>();
  const tropTot = (adresse: string) => {
    const maintenant = Date.now();
    for (const [cle, moment] of derniersLiens) if (moment <= maintenant - DIX_MINUTES) derniersLiens.delete(cle);
    if (derniersLiens.has(adresse)) return true;
    derniersLiens.set(adresse, maintenant);
    return false;
  };

  // Un membre ne voit et ne touche que les comptes de son groupe, jamais un admin. Un membre sans groupe n'en a
  // aucun : « pas de boutique » n'est pas une boutique partagée avec les autres comptes sans boutique (revue).
  const portee = (moi: Record<string, unknown>, compte: Record<string, unknown>) =>
    moi.role === 'admin' || (compte.role !== 'admin' && champsDeGroupe.every((champ) => typeof moi[champ] === 'string' && moi[champ] !== '' && moi[champ] === compte[champ]));
  const moiDe = (req: unknown) => (req as { user?: Record<string, unknown> }).user ?? {};

  // Les suppressions de compte passent une à une : deux demandes du même compte, ou deux derniers admins en même
  // temps, ne se croisent jamais. La seconde trouve le compte déjà vidé.
  let fileSuppressions: Promise<unknown> = Promise.resolve();
  const uneAUne = <T>(travail: () => Promise<T>): Promise<T> => {
    const suite = fileSuppressions.then(travail);
    fileSuppressions = suite.catch(() => undefined);
    return suite;
  };
  /**
   * Vidé sur place : une adresse neutre, unique et invalide (« .invalid » ne reçoit jamais d'e-mail), plus aucun
   * champ ni secret, ni lien, ni session. La ligne reste, pour qu'un nouveau compte n'hérite jamais de celui-ci.
   */
  const viderLeCompte = async (id: string) => {
    const vides = Object.fromEntries([...Object.keys(schemaCompte), ...champsDeGroupe].map((champ) => [champ, null]));
    await usersStore.update(id, { ...vides, email: \`supprime-\${id}@supprime.invalid\`, role: ROLE_SUPPRIME, invitation: false, inscription: null, passwordHash: null, googleSubject: null, appleSubject: null } as unknown as Compte);
    await surRetrait?.(id);
    await jetons.deleteForUser(id);
    await renouvellement.revokeAllForUser(id);
    await revocations.revokeAllForUser?.(id, Date.now());
  };

  // Le lien de confirmation garde son empreinte dans le magasin des liens, sous un autre nom que celui du mot de
  // passe : il ne sert jamais à choisir un mot de passe, et un lien de mot de passe ne confirme rien.
  const empreinteConfirmation = (jeton: string) => empreinte(\`confirmation:\${jeton}\`);
  const perimee = (compte: Compte, maintenant: number) => enAttente(compte) && (compte.inscription as number) <= maintenant - SEPT_JOURS;

  // Une inscription jamais confirmée est vidée au bout de sept jours : à la première inscription qui suit, puis
  // à chaque passage du ménage (toutes les heures). Une invitation d'un admin n'est jamais touchée.
  let dernierMenage = -Infinity;
  const menageInscriptions = async (toujours = false) => {
    if (!inscription) return;
    const maintenant = Date.now();
    if (!toujours && maintenant - dernierMenage < UNE_HEURE) return;
    dernierMenage = maintenant;
    const PAGE = 500;
    const perimes: string[] = [];
    const vus = new Set<string>();
    for (let depuis = 0; depuis < 200_000; depuis += PAGE) {
      const page = (await usersStore.list({ role: inscription.role, limit: PAGE, offset: depuis })) as Compte[];
      const neufs = page.filter((compte) => !vus.has(String(compte.id)));
      for (const compte of neufs) {
        vus.add(String(compte.id));
        if (perimee(compte, maintenant)) perimes.push(String(compte.id));
      }
      // Une page incomplète, ou un magasin qui ignore « offset » et redonne les mêmes : c'est fini.
      if (page.length < PAGE || neufs.length === 0) break;
    }
    // Relu au moment de vider : une confirmation arrivée entre-temps garde le compte.
    for (const id of perimes) {
      await uneAUne(async () => {
        const compte = (await usersStore.findById(id)) as Compte | null;
        if (compte && perimee(compte, maintenant)) await viderLeCompte(id);
      });
    }
  };
  if (inscription) setInterval(() => void menageInscriptions(true).catch((erreur: unknown) => console.error('Le ménage des inscriptions a échoué :', erreur instanceof Error ? erreur.message : erreur)), UNE_HEURE).unref();

  /** Un autre admin, qui peut se connecter, que celui-ci : le serveur ne reste jamais sans admin. */
  const unAutreAdmin = async (id: string) => {
    const PAGE = 500;
    for (let depuis = 0; depuis < 200_000; depuis += PAGE) {
      const page = (await usersStore.list({ role: 'admin', limit: PAGE, offset: depuis })) as Compte[];
      if (page.some((compte) => String(compte.id) !== id && compte.role === 'admin' && compte.invitation !== true)) return true;
      if (page.length < PAGE) return false;
    }
    return false;
  };

  return {
    /** Le « send » du mot de passe oublié du pack : il a déjà créé le jeton et gardé son empreinte. */
    async envoyerLienOublie({ user, token }: { user: SaasUser; token: string }): Promise<void> {
      const adresse = String(user.email ?? '');
      if (pageOublie === null || !adresseDuSite() || !adresse || tropTot(adresse)) return;
      const phrase = \`Vous avez demandé à choisir un nouveau mot de passe pour \${nom}. Ouvrez ce lien :\`;
      const fin = "Ce lien est valable une heure et ne sert qu'une fois. Si cette demande ne vient pas de vous, ignorez ce message : rien ne change.";
      const url = lien(pageOublie, token);
      await emails.envoyer({ a: adresse, sujet: \`Votre mot de passe \${nom}\`, texte: \`Bonjour,\\n\\n\${phrase}\\n\${url}\\n\\n\${fin}\\n\`, html: corpsHtml(phrase, url, fin) });
    },

    /** POST /auth/invitations : la même réponse si l'adresse a déjà un compte, qui ne change pas. */
    inviter: (async (req, res, next) => {
      try {
        const corps = (req.body ?? {}) as { email?: unknown; role?: unknown; groupes?: Record<string, unknown>; champs?: unknown };
        const envoi = verifierEnvoi(schemaCompte, corps.champs ?? {}, false);
        if ('erreur' in envoi) {
          res.status(400).json({ erreur: envoi.erreur });
          return;
        }
        const moi = (req as unknown as { user?: Record<string, unknown> }).user ?? {};
        const estAdmin = moi.role === 'admin';
        const adresse = typeof corps.email === 'string' ? corps.email.trim().toLowerCase() : '';
        const role = corps.role === 'admin' ? 'admin' : typeof corps.role === 'string' && rolesPermis.includes(corps.role) ? corps.role : 'user';
        if (role === 'admin' && !estAdmin) {
          res.status(403).json({ erreur: 'seul un admin peut inviter un admin' });
          return;
        }
        // Un membre fait entrer la personne dans ses propres groupes ; seul un admin choisit le groupe.
        const groupes: Record<string, string> = {};
        for (const champ of champsDeGroupe) {
          const valeur = estAdmin ? corps.groupes?.[champ] : moi[champ];
          if (typeof valeur === 'string' && valeur !== '') groupes[champ] = valeur;
        }
        if (!ADRESSE.test(adresse)) {
          res.status(400).json({ erreur: "cette adresse e-mail n'est pas valable" });
          return;
        }
        if (pageInvitation === null || !emails.pret() || !adresseDuSite()) {
          res.status(503).json({ erreur: "les e-mails ne sont pas réglés sur ce serveur (HUMALIS_EMAILS_HOTE, HUMALIS_EMAILS_PORT, HUMALIS_EMAILS_EXPEDITEUR, HUMALIS_ADRESSE_SITE) : l'invitation n'est pas partie" });
          return;
        }
        const existant = (await usersStore.findByEmail(adresse)) as Compte | null;
        if (existant && existant.role !== ROLE_RETIRE && existant.invitation !== true) {
          res.json({ envoye: true });
          return;
        }
        // Une invitation en attente dans un autre groupe n'est pas reprise : sinon un membre ferait passer
        // l'invité d'un autre dans son propre groupe. Même réponse, pour ne rien dire des comptes des autres.
        if (existant && existant.invitation === true && !estAdmin && !portee(moi, existant as Record<string, unknown>)) {
          res.json({ envoye: true });
          return;
        }
        const compte = existant
          ? await usersStore.update(String(existant.id), { role, invitation: true, ...groupes, ...envoi.valeur } as Compte)
          : await usersStore.create({ email: adresse, role, invitation: true, ...groupes, ...envoi.valeur } as Compte);
        const id = String(compte?.id);
        // Une nouvelle invitation remplace la précédente : l'ancien lien ne sert plus.
        await jetons.deleteForUser(id);
        const jeton = randomBytes(32).toString('hex');
        await jetons.save({ hash: empreinte(jeton), userId: id, expiresAt: Date.now() + SEPT_JOURS });
        const phrase = \`Vous êtes invité à rejoindre \${nom}. Ouvrez ce lien pour choisir votre mot de passe\${google ? ' ou vous connecter avec Google' : ''} :\`;
        const fin = "Ce lien est valable sept jours et ne sert qu'une fois. Si vous n'attendiez pas cette invitation, ignorez ce message.";
        const url = lien(pageInvitation, jeton);
        const parti = await emails.envoyer({ a: adresse, sujet: \`Invitation : \${nom}\`, texte: \`Bonjour,\\n\\n\${phrase}\\n\${url}\\n\\n\${fin}\\n\`, html: corpsHtml(phrase, url, fin) });
        if (!parti) {
          res.status(502).json({ erreur: "l'invitation n'est pas partie : réessayez dans un instant" });
          return;
        }
        res.json({ envoye: true });
      } catch (erreur) {
        next(erreur);
      }
    }) as RequestHandler,

    /**
     * POST /auth/inscription : la même réponse que l'adresse soit nouvelle, déjà inscrite ou en attente, pour qu'on ne
     * devine pas qui a un compte. Le mot de passe est haché dans tous les cas : le temps de réponse ne le dit pas non
     * plus. Le rôle est celui de la phrase, jamais celui de la requête ; la personne n'entre dans aucun groupe.
     */
    inscrire: (async (req, res, next) => {
      try {
        const corps = (req.body ?? {}) as { email?: unknown; motDePasse?: unknown; champs?: unknown };
        const adresse = typeof corps.email === 'string' ? corps.email.trim().toLowerCase() : '';
        if (!inscription) {
          res.status(404).json({ erreur: "l'inscription n'est pas ouverte sur ce serveur" });
          return;
        }
        if (!ADRESSE.test(adresse) || adresse.length > 254) {
          res.status(400).json({ erreur: "cette adresse e-mail n'est pas valable" });
          return;
        }
        if (typeof corps.motDePasse !== 'string' || corps.motDePasse.length > 200 || !isStrongPassword(corps.motDePasse)) {
          res.status(400).json({ erreur: FAIBLE });
          return;
        }
        const envoi = verifierEnvoi(schemaCompte, corps.champs ?? {}, false);
        if ('erreur' in envoi) {
          res.status(400).json({ erreur: envoi.erreur });
          return;
        }
        if (!emails.pret() || !adresseDuSite()) {
          res.status(503).json({ erreur: "les e-mails ne sont pas réglés sur ce serveur (HUMALIS_EMAILS_HOTE, HUMALIS_EMAILS_PORT, HUMALIS_EMAILS_EXPEDITEUR, HUMALIS_ADRESSE_SITE) : l'inscription n'est pas partie" });
          return;
        }
        await menageInscriptions();
        const passwordHash = await hashPassword(corps.motDePasse);
        // Un seul e-mail toutes les dix minutes pour une même adresse : rien ne change entre-temps.
        if (tropTot(adresse)) {
          res.json({ envoye: true });
          return;
        }
        const suite = await uneAUne(async (): Promise<{ jeton: string } | 'existant' | 'rien'> => {
          const existant = (await usersStore.findByEmail(adresse)) as Compte | null;
          if (existant && !enAttente(existant)) return estFerme(existant) || existant.invitation === true ? 'rien' : 'existant';
          const valeurs = { role: inscription.role, invitation: true, inscription: Date.now(), passwordHash, ...envoi.valeur };
          const compte = existant ? await usersStore.update(String(existant.id), valeurs as unknown as Compte) : await usersStore.create({ email: adresse, ...valeurs } as unknown as Compte);
          const id = String(compte?.id);
          // Une nouvelle inscription remplace la précédente : l'ancien lien ne sert plus.
          await jetons.deleteForUser(id);
          const jeton = randomBytes(32).toString('hex');
          await jetons.save({ hash: empreinteConfirmation(jeton), userId: id, expiresAt: Date.now() + UN_JOUR });
          return { jeton };
        });
        let parti = true;
        if (suite === 'existant') {
          const phrase = \`Quelqu'un a voulu créer un compte chez \${nom} avec votre adresse, mais vous avez déjà un compte : rien n'a changé. Pour vous connecter, ouvrez le site\${pageOublie !== null ? ' ; si vous avez oublié votre mot de passe, choisissez « mot de passe oublié »' : ''} :\`;
          const fin = "Si ce n'est pas vous, ignorez ce message.";
          const site = adresseDuSite() ?? '';
          parti = await emails.envoyer({ a: adresse, sujet: \`Votre compte \${nom}\`, texte: \`Bonjour,\\n\\n\${phrase}\\n\${site}\\n\\n\${fin}\\n\`, html: corpsHtml(phrase, site, fin) });
        } else if (suite !== 'rien') {
          const phrase = \`Vous venez de créer un compte chez \${nom}. Ouvrez ce lien pour confirmer votre adresse :\`;
          const fin = "Ce lien est valable 24 heures et ne sert qu'une fois. Si vous n'avez pas créé ce compte, ignorez ce message : il sera effacé.";
          const url = lien(inscription.page, suite.jeton);
          parti = await emails.envoyer({ a: adresse, sujet: \`Confirmez votre adresse : \${nom}\`, texte: \`Bonjour,\\n\\n\${phrase}\\n\${url}\\n\\n\${fin}\\n\`, html: corpsHtml(phrase, url, fin) });
        }
        if (!parti) {
          derniersLiens.delete(adresse);
          res.status(502).json({ erreur: "l'e-mail n'est pas parti : réessayez dans un instant" });
          return;
        }
        res.json({ envoye: true });
      } catch (erreur) {
        next(erreur);
      }
    }) as RequestHandler,

    /** POST /auth/confirmation : le jeton du lien, une seule fois et pendant 24 heures ; le compte peut alors se connecter. */
    confirmer: (async (req, res, next) => {
      try {
        const jeton = (req.body as { jeton?: unknown } | undefined)?.jeton;
        const refus = () => res.status(400).json({ erreur: "ce lien de confirmation n'est plus valable : inscrivez-vous de nouveau" });
        if (!inscription || typeof jeton !== 'string' || !/^[0-9a-f]{64}$/.test(jeton)) {
          refus();
          return;
        }
        // Consommer supprime : un second essai avec le même lien ne trouve rien, même à deux en même temps.
        const lu = await jetons.consume(empreinteConfirmation(jeton));
        if (!lu || lu.expiresAt <= Date.now()) {
          refus();
          return;
        }
        const ouvert = await uneAUne(async () => {
          const compte = (await usersStore.findById(String(lu.userId))) as Compte | null;
          if (!compte || estFerme(compte)) return false;
          if (enAttente(compte)) await usersStore.update(String(compte.id), { invitation: false, inscription: null } as unknown as Compte);
          return true;
        });
        if (!ouvert) {
          refus();
          return;
        }
        res.json({ confirme: true });
      } catch (erreur) {
        next(erreur);
      }
    }) as RequestHandler,

    /**
     * « connexion google » ou « connexion apple » avec l'inscription libre : une adresse inconnue, que le fournisseur
     * confirme, crée un compte au rôle de la phrase, déjà confirmé. Un compte retiré ne se rouvre pas.
     */
    async compteParFournisseur(adresse: string, lien: 'googleSubject' | 'appleSubject', sujet: string): Promise<SaasUser | null> {
      if (!inscription) return null;
      const role = inscription.role;
      return uneAUne(async () => {
        if (await usersStore.findByEmail(adresse)) return null;
        return usersStore.create({ email: adresse, role, invitation: false, [lien]: sujet } as unknown as Compte);
      });
    },

    /**
     * Le fournisseur confirme l'adresse d'une inscription en attente : le compte s'ouvre, et le mot de passe choisi à
     * l'inscription ne sert plus (quelqu'un d'autre a pu inscrire cette adresse avec le sien).
     */
    async ouvrirParFournisseur(compte: SaasUser): Promise<SaasUser> {
      if (!enAttente(compte as Compte)) return compte;
      const id = String(compte.id);
      await jetons.deleteForUser(id);
      return (await usersStore.update(id, { invitation: false, inscription: null, passwordHash: null } as unknown as Compte)) ?? compte;
    },

    /** « changer role de c en … » : jamais son propre rôle, pour qu'un admin ne s'enferme pas dehors. */
    changerRole: (async (req, res, next) => {
      try {
        const id = String(req.params.id);
        const moi = (req as unknown as { user?: { id?: unknown } }).user?.id;
        const demande = (req.body as { role?: unknown } | undefined)?.role;
        const role = demande === 'admin' ? 'admin' : demande === 'membre' ? 'user' : typeof demande === 'string' && rolesPermis.includes(demande) ? demande : null;
        if (role === null) {
          res.status(400).json({ erreur: "ce rôle n'existe pas" });
          return;
        }
        if (String(moi) === id) {
          res.status(400).json({ erreur: 'vous ne pouvez pas changer votre propre rôle' });
          return;
        }
        const compte = await usersStore.findById(id);
        if (!compte || estFerme(compte)) {
          res.status(404).json({ erreur: "ce compte n'existe pas" });
          return;
        }
        await usersStore.update(id, { role } as Compte);
        res.json({ id, role: demande });
      } catch (erreur) {
        next(erreur);
      }
    }) as RequestHandler,

    /** « changer compte de c avec … » : seulement les champs déclarés, seulement dans son groupe. */
    changerChamps: (async (req, res, next) => {
      try {
        const id = String(req.params.id);
        const envoi = verifierEnvoi(schemaCompte, req.body, false);
        if ('erreur' in envoi) {
          res.status(400).json({ erreur: envoi.erreur });
          return;
        }
        const compte = await usersStore.findById(id);
        if (!compte || estFerme(compte) || !portee(moiDe(req), compte)) {
          res.status(404).json({ erreur: "ce compte n'existe pas" });
          return;
        }
        await usersStore.update(id, envoi.valeur as Compte);
        res.json({ id });
      } catch (erreur) {
        next(erreur);
      }
    }) as RequestHandler,

    /** Le compte de la personne connectée, dans une liste d'une seule fiche, sans aucun secret. */
    monCompte: (async (req, res, next) => {
      try {
        const moi = moiDe(req);
        // Lu par son identifiant : la liste des comptes n'a pas à être parcourue, quel que soit leur nombre.
        const lu = (await usersStore.findById(String(moi.id))) as Compte | null;
        const compte = lu && !estFerme(lu) ? lu : undefined;
        res.json(compte ? [{
          id: String(compte.id),
          email: String(compte.email ?? ''),
          role: compte.role === 'admin' ? 'admin' : rolesPermis.includes(String(compte.role)) ? String(compte.role) : 'membre',
          statut: compte.invitation === true ? 'invite' : 'actif',
          ...Object.fromEntries(Object.keys(schemaCompte).map((champ) => [champ, (compte as Record<string, unknown>)[champ] ?? null])),
        }] : []);
      } catch (erreur) {
        next(erreur);
      }
    }) as RequestHandler,

    /** La liste des comptes, sans aucun secret. */
    lister: (async (req, res, next) => {
      try {
        const tous = await tousLesComptes(usersStore);
        const moi = moiDe(req);
        const presents = tous.filter((compte) => !estFerme(compte) && portee(moi, compte));
        presents.sort((a, b) => String(a.email).localeCompare(String(b.email)));
        res.json(
          presents.map((compte) => ({
            id: String(compte.id),
            email: String(compte.email ?? ''),
            role: compte.role === 'admin' ? 'admin' : rolesPermis.includes(String(compte.role)) ? String(compte.role) : 'membre',
            statut: compte.invitation === true ? 'invite' : 'actif',
            ...Object.fromEntries(Object.keys(schemaCompte).map((champ) => [champ, (compte as Record<string, unknown>)[champ] ?? null])),
          })),
        );
      } catch (erreur) {
        next(erreur);
      }
    }) as RequestHandler,

    /**
     * POST /auth/suppression-compte : la personne connectée supprime son propre compte, et aucun autre.
     * Le mot de passe est redemandé si le compte en a un. Ses fiches changent d'abord, toutes ensemble ou aucune ;
     * le compte est vidé ensuite : refaire la même demande après une panne ne casse rien.
     */
    supprimerMonCompte: (async (req, res, next) => {
      try {
        const id = String(moiDe(req).id ?? '');
        const motDePasse = (req.body as { motDePasse?: unknown } | undefined)?.motDePasse;
        const reponse = await uneAUne(async (): Promise<[number, object]> => {
          const compte = id ? ((await usersStore.findById(id)) as Compte | null) : null;
          if (!compte || estFerme(compte)) return [401, { erreur: 'connecte-toi de nouveau' }];
          if (typeof compte.passwordHash === 'string' && !(typeof motDePasse === 'string' && (await verifyPasswordHash(motDePasse, compte.passwordHash)))) {
            return [403, { erreur: 'le mot de passe est incorrect' }];
          }
          if (compte.role === 'admin' && !(await unAutreAdmin(id))) return [409, { erreur: 'le dernier admin ne peut pas supprimer son compte' }];
          await effacerLesDonnees?.(id);
          await viderLeCompte(id);
          return [200, { supprime: true }];
        });
        res.status(reponse[0]).json(reponse[1]);
      } catch (erreur) {
        next(erreur);
      }
    }) as RequestHandler,

    /**
     * Retirer un membre ou annuler une invitation : plus de mot de passe, plus de lien, plus de session.
     * Le magasin des comptes ne supprime pas : le compte reste, au rôle « retire », invisible pour les packs.
     */
    retirer: (async (req, res, next) => {
      try {
        const id = String(req.params.id);
        const moi = (req as unknown as { user?: { id?: unknown } }).user?.id;
        if (String(moi) === id) {
          res.status(400).json({ erreur: 'vous ne pouvez pas retirer votre propre compte' });
          return;
        }
        const compte = await usersStore.findById(id);
        if (!compte || estFerme(compte) || !portee(moiDe(req), compte)) {
          res.status(404).json({ erreur: "ce compte n'existe pas" });
          return;
        }
        await usersStore.update(id, { role: ROLE_RETIRE, invitation: false, passwordHash: null, googleSubject: null, appleSubject: null } as unknown as Compte);
        await surRetrait?.(id);
        await jetons.deleteForUser(id);
        await renouvellement.revokeAllForUser(id);
        await revocations.revokeAllForUser?.(id, Date.now());
        res.status(204).end();
      } catch (erreur) {
        next(erreur);
      }
    }) as RequestHandler,
  };
}
`;

/** tests/comptes.test.ts : le parcours complet, avec un faux serveur d'envoi. */
export function testsComptes(serveur: ServeurRI, stockages: string): string {
  const route = serveur.routeComptes ? adresseDeRoute(serveur.routeComptes.adresse) : null;
  const blocs: string[] = [];
  if (serveur.invitations) {
    blocs.push(`  it('une invitation : réservée à l\\'admin, un lien à usage unique, un mot de passe solide', async () => {
    const { app, boite, jetons, entreeAdmin, entreeMembre } = await preparer();
    await request(app).post('/auth/invitations').send({ email: 'neuf@exemple.cd' }).expect(401);
    await request(app).post('/auth/invitations').set(entreeMembre).send({ email: 'neuf@exemple.cd' }).expect(403);
    await request(app).post('/auth/invitations').set(entreeAdmin).send({ email: 'pas une adresse' }).expect(400);
    const invitation = await request(app).post('/auth/invitations').set(entreeAdmin).send({ email: 'neuf@exemple.cd', role: 'admin' }).expect(200);
    expect(invitation.body).toEqual({ envoye: true });
    expect(boite).toHaveLength(1);
    const jeton = jetonDuLien(boite[0]);
    // Seule l'empreinte est gardée.
    expect(await jetons.find(jeton)).toBeNull();
    // Avant d'avoir choisi, aucune connexion possible.
    await request(app).post('/auth/login').send({ email: 'neuf@exemple.cd', password: MOT_DE_PASSE }).expect(401);
    // Un mot de passe faible ne consomme pas le lien.
    await request(app).post('/auth/reset-password').send({ token: jeton, password: 'faible' }).expect(400);
    await request(app).post('/auth/reset-password').send({ token: jeton, password: MOT_DE_PASSE }).expect(200);
    await request(app).post('/auth/reset-password').send({ token: jeton, password: MOT_DE_PASSE }).expect(400);
    const connexion = await request(app).post('/auth/login').send({ email: 'neuf@exemple.cd', password: MOT_DE_PASSE }).expect(200);
    expect(connexion.body.data.user.role).toBe('admin');
  });

  it('une adresse qui a déjà un compte : même réponse, aucun e-mail, aucun changement', async () => {
    const { app, boite, entreeAdmin } = await preparer();
    const reponse = await request(app).post('/auth/invitations').set(entreeAdmin).send({ email: 'awa@exemple.cd', role: 'admin' }).expect(200);
    expect(reponse.body).toEqual({ envoye: true });
    expect(boite).toHaveLength(0);
    const connexion = await request(app).post('/auth/login').send({ email: 'awa@exemple.cd', password: MOT_DE_PASSE }).expect(200);
    expect(connexion.body.data.user.role).toBe('user');
  });

  it('sans les réglages des e-mails, l\\'invitation le dit au lieu de faire semblant', async () => {
    const { app, entreeAdmin } = await preparer({ cles: false });
    const reponse = await request(app).post('/auth/invitations').set(entreeAdmin).send({ email: 'neuf@exemple.cd' }).expect(503);
    expect(reponse.body.erreur).toContain('HUMALIS_EMAILS_HOTE');
  });`);
  }
  if (serveur.inscriptionLibre) {
    const role = serveur.inscriptionLibre.role === 'membre' ? 'user' : serveur.inscriptionLibre.role;
    blocs.push(`  it('inscription libre : jamais le rôle admin, même envoyé ; aucune connexion avant la confirmation', async () => {
    const { app, boite } = await preparer();
    const entree = await visiteur(app);
    const reponse = await request(app).post('/auth/inscription').set(entree).send({ email: 'neuf@exemple.cd', motDePasse: MOT_DE_PASSE, role: 'admin' }).expect(200);
    expect(reponse.body).toEqual({ envoye: true });
    await request(app).post('/auth/login').send({ email: 'neuf@exemple.cd', password: MOT_DE_PASSE }).expect(401);
    await request(app).post('/auth/confirmation').set(entree).send({ jeton: jetonDuLien(boite[0]) }).expect(200);
    const connexion = await request(app).post('/auth/login').send({ email: 'neuf@exemple.cd', password: MOT_DE_PASSE }).expect(200);
    expect(connexion.body.data.user.role).toBe(${chaine(role)});
  });

  it('inscription libre : la même réponse pour une adresse qui a déjà un compte, qui ne change pas', async () => {
    const { app, boite } = await preparer();
    const entree = await visiteur(app);
    const neuve = await request(app).post('/auth/inscription').set(entree).send({ email: 'neuf@exemple.cd', motDePasse: MOT_DE_PASSE });
    const connue = await request(app).post('/auth/inscription').set(entree).send({ email: 'awa@exemple.cd', motDePasse: 'Autre-Solide-2026!' });
    expect([connue.status, connue.body]).toEqual([neuve.status, neuve.body]);
    expect(boite).toHaveLength(2);
    expect(/#jeton=/.test(boite[1].texte)).toBe(false);
    await request(app).post('/auth/login').send({ email: 'awa@exemple.cd', password: MOT_DE_PASSE }).expect(200);
    await request(app).post('/auth/login').send({ email: 'awa@exemple.cd', password: 'Autre-Solide-2026!' }).expect(401);
  });

  it('inscription libre : un lien de confirmation usé ou périmé est refusé', async () => {
    const { app, boite, jetons } = await preparer();
    const entree = await visiteur(app);
    await request(app).post('/auth/inscription').set(entree).send({ email: 'neuf@exemple.cd', motDePasse: MOT_DE_PASSE }).expect(200);
    const jeton = jetonDuLien(boite[0]);
    // Le lien de confirmation ne sert pas à choisir un mot de passe.
    await request(app).post('/auth/reset-password').send({ token: jeton, password: 'Autre-Solide-2026!' }).expect(400);
    await request(app).post('/auth/confirmation').set(entree).send({ jeton }).expect(200);
    await request(app).post('/auth/confirmation').set(entree).send({ jeton }).expect(400);
    await request(app).post('/auth/inscription').set(entree).send({ email: 'tard@exemple.cd', motDePasse: MOT_DE_PASSE }).expect(200);
    const tard = jetonDuLien(boite[1]);
    const empreinte = createHash('sha256').update('confirmation:' + tard).digest('hex');
    const lien = await jetons.consume(empreinte);
    await jetons.save({ ...lien!, expiresAt: Date.now() - 1000 });
    await request(app).post('/auth/confirmation').set(entree).send({ jeton: tard }).expect(400);
    await request(app).post('/auth/login').send({ email: 'tard@exemple.cd', password: MOT_DE_PASSE }).expect(401);
  });`);
  }
  const qui = serveur.routeComptes?.droits.creer;
  const [groupe] = champsDeGroupe(serveur);
  if (serveur.invitations && groupe && qui?.startsWith('role:')) {
    const role = qui.slice(5).split(',')[0];
    const texteCompte = serveur.champsCompte?.find((c) => c.type.genre === 'texte')?.nom;
    blocs.push(`  it('un membre invite dans son propre groupe, jamais un admin ; seul un admin choisit le groupe', async () => {
    const { app, usersStore, passwordHash, entree, entreeAdmin } = await preparer();
    await usersStore.create({ email: 'chef@exemple.cd', role: '${role}', passwordHash, ${chaine(groupe)}: 'groupe-a' } as never);
    const chef = await entree('chef@exemple.cd');
    await request(app).post('/auth/invitations').set(chef).send({ email: 'admin2@exemple.cd', role: 'admin' }).expect(403);
    await request(app).post('/auth/invitations').set(chef).send({ email: 'neuf@exemple.cd', role: '${role}', groupes: { ${chaine(groupe)}: 'groupe-b' } }).expect(200);
    expect((await usersStore.findByEmail('neuf@exemple.cd') as Record<string, unknown>)[${chaine(groupe)}]).toBe('groupe-a');
    await request(app).post('/auth/invitations').set(entreeAdmin).send({ email: 'autre@exemple.cd', role: '${role}', groupes: { ${chaine(groupe)}: 'groupe-b' }${texteCompte ? `, champs: { ${chaine(texteCompte)}: 'valeur' }` : ''} }).expect(200);${texteCompte ? `
    expect((await usersStore.findByEmail('autre@exemple.cd') as Record<string, unknown>)[${chaine(texteCompte)}]).toBe('valeur');
    await request(app).post('/auth/invitations').set(entreeAdmin).send({ email: 'mauvais@exemple.cd', champs: { inconnu: 'x' } }).expect(400);` : ''}
    expect((await usersStore.findByEmail('autre@exemple.cd') as Record<string, unknown>)[${chaine(groupe)}]).toBe('groupe-b');
  });`);
  }
  if (serveur.motDePasseOublie) {
    blocs.push(`  it('mot de passe oublié : la même réponse que l\\'adresse existe ou non, un seul e-mail toutes les dix minutes', async () => {
    const { app, boite } = await preparer();
    const connue = await request(app).post('/auth/forgot-password').send({ email: 'awa@exemple.cd' }).expect(200);
    const inconnue = await request(app).post('/auth/forgot-password').send({ email: 'personne@exemple.cd' }).expect(200);
    expect(inconnue.body.message).toBe(connue.body.message);
    expect(inconnue.status).toBe(connue.status);
    expect(boite).toHaveLength(1);
    await request(app).post('/auth/forgot-password').send({ email: 'awa@exemple.cd' }).expect(200);
    expect(boite).toHaveLength(1);
    await request(app).post('/auth/reset-password').send({ token: jetonDuLien(boite[0]), password: 'Autre-Solide-2026!' }).expect(200);
    await request(app).post('/auth/login').send({ email: 'awa@exemple.cd', password: 'Autre-Solide-2026!' }).expect(200);
  });`);
  }
  if (route) {
    const lire = serveur.routeComptes!.droits.lire !== null;
    const retirer = serveur.routeComptes!.droits.supprimer !== null;
    if (lire) {
      blocs.push(`  it('la liste des comptes : réservée à l\\'admin, sans aucun secret', async () => {
    const { app, entreeAdmin, entreeMembre } = await preparer();
    await request(app).get('${route}').expect(401);
    await request(app).get('${route}').set(entreeMembre).expect(403);
    const liste = await request(app).get('${route}').set(entreeAdmin).expect(200);
    expect(liste.body.map((c: { email: string }) => c.email)).toEqual(expect.arrayContaining(['admin@exemple.cd', 'awa@exemple.cd']));
    expect(Object.keys(liste.body[0]).sort()).toEqual(${JSON.stringify(['email', 'id', 'role', 'statut', ...(serveur.champsCompte ?? []).map((c) => camel(c.nom))].sort())});
  });`);
    }
    if (retirer) {
      blocs.push(`  it('retirer un membre ferme son accès ; on ne se retire pas soi-même', async () => {
    const { app, boite, entreeAdmin, entreeMembre, idDe } = await preparer();
    await request(app).delete(\`${route}/\${await idDe('admin@exemple.cd')}\`).set(entreeAdmin).expect(400);
    await request(app).delete(\`${route}/\${await idDe('awa@exemple.cd')}\`).set(entreeMembre).expect(403);
    await request(app).delete(\`${route}/\${await idDe('awa@exemple.cd')}\`).set(entreeAdmin).expect(204);
    await request(app).post('/auth/login').send({ email: 'awa@exemple.cd', password: MOT_DE_PASSE }).expect(401);
    await request(app).get('/auth/me').set(entreeMembre).expect(401);
    await request(app).post('/auth/forgot-password').send({ email: 'awa@exemple.cd' });
    expect(boite).toHaveLength(0);
  });`);
    }
  }
  return `// Produit par Humalis : les invitations, le mot de passe oublié et la liste des comptes, avec un faux serveur d'envoi.
${serveur.inscriptionLibre ? "import { createHash } from 'node:crypto';\n" : ''}import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createMemoryPasswordResetStore, createMemoryUsersStore, type UsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from '../src/serveur.js';
import { creerEmails } from '../src/humalis/emails.js';
import { creerStockageMemoire } from '../src/humalis/stockage.js';

const MOT_DE_PASSE = 'Essai-Solide-2026!';
process.env.HUMALIS_ADRESSE_SITE = 'https://site.exemple.cd';

const jetonDuLien = (corps: { texte: string }) => /#jeton=([0-9a-f]{64})/.exec(corps.texte)![1];
${serveur.inscriptionLibre ? `
/** Un visiteur, comme un navigateur : le cookie CSRF reçu à la première visite, renvoyé dans l'en-tête. */
async function visiteur(app: never) {
  const cookies = ([] as string[]).concat((await request(app).get('/auth/me')).headers['set-cookie'] ?? []);
  const csrf = /astratra_csrf=([^;]+)/.exec(cookies.join(';'))![1];
  return { cookie: \`astratra_csrf=\${csrf}\`, 'x-csrf-token': csrf };
}
` : ''}
async function preparer({ cles = true } = {}) {
  const usersStore = createMemoryUsersStore() as UsersStore;
  const passwordHash = await hashPassword(MOT_DE_PASSE);
  await usersStore.create({ email: 'admin@exemple.cd', role: 'admin', passwordHash });
  await usersStore.create({ email: 'awa@exemple.cd', role: 'user', passwordHash });
  const boite: { texte: string; a: string[]; sujet: string; html?: string }[] = [];
  const transport = async (_reglages: unknown, envoi: { a: string[]; sujet: string; texte?: string; html?: string }) => {
    boite.push({ a: envoi.a, sujet: envoi.sujet, texte: envoi.texte ?? '', ...(envoi.html ? { html: envoi.html } : {}) });
  };
  const emails = creerEmails({ nom: 'Essai', env: cles ? { HUMALIS_EMAILS_HOTE: 'localhost', HUMALIS_EMAILS_PORT: '2525', HUMALIS_EMAILS_EXPEDITEUR: 'envoi@exemple.cd' } : {}, transport });
  const jetons = createMemoryPasswordResetStore();
  const stockages = {
${stockages}
  };
  const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages, emails, jetons }) as never;
  const entree = async (email: string) => ({ Authorization: \`Bearer \${(await request(app).post('/auth/login').send({ email, password: MOT_DE_PASSE }).expect(200)).body.data.token}\` });
  const idDe = async (email: string) => String((await usersStore.findByEmail(email))?.id);
  return { app, boite, jetons, idDe, usersStore, passwordHash, entree, entreeAdmin: await entree('admin@exemple.cd'), entreeMembre: await entree('awa@exemple.cd') };
}

describe('les comptes', () => {
${blocs.join('\n\n')}
});
`;
}

const adresseDeRoute = (adresse: string) => `/api/${adresse.replace(/^\/+/, '').replace(/^api\//, '')}`;
