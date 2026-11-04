/**
 * Les e-mails et les comptes invités du serveur produit (« emails par brevo »,
 * « invitations vers … », « mot de passe oublie vers … », « … peut lire comptes »).
 * La sécurité reste aux packs : le lien du mot de passe oublié et sa consommation
 * viennent de @astratra/saas-kit, l'envoi et le nettoyage des en-têtes de
 * @astratra/notify. Une invitation est un compte sans secret et un jeton du même magasin.
 */
import type { MorceauEmail, ServeurRI } from '../../ri/types.js';
import { simplifier } from '../../analyse/elements.js';
import { camel } from '../web/noms.js';

const chaine = (texte: string) => JSON.stringify(texte);

/** Vrai si le serveur a besoin du module des comptes. */
export const avecComptes = (serveur: ServeurRI) => Boolean(serveur.invitations || serveur.motDePasseOublie || serveur.routeComptes);

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
  return `  const revocations = createMemoryRevocationStore();
  const comptes = creerComptes({
    usersStore,
    jetons,
    emails,
    renouvellement,
    revocations,
    nom: ${chaine(serveur.nom)},
    google: ${serveur.connexionGoogle ? 'true' : 'false'},
    pageInvitation: ${cheminDe(serveur.invitations, chemins)},
    pageOublie: ${cheminDe(serveur.motDePasseOublie, chemins)},
  });
`;
}

/** Les routes des comptes, dans extendRoutes, avec les gardes du pack. */
export function codeRoutesComptes(serveur: ServeurRI, adresseApi: (adresse: string) => string, variable: (adresse: string) => string): string {
  const parties: string[] = [];
  if (serveur.invitations) {
    parties.push(`
      // « inviter … » : réservé à l'admin, et trente invitations par heure au plus.
      const routeInvitations = express.Router();
      routeInvitations.post('/', createApiLimiter({ windowMs: 60 * 60 * 1000, max: 30 }) as unknown as RequestHandler, ...acces.seulAdmin, csrfMiddleware, comptes.inviter);
      app.use('/auth/invitations', routeInvitations);
`);
  }
  const route = serveur.routeComptes;
  if (route) {
    const garde = (action: 'lire' | 'supprimer') => (route.droits[action] === null ? 'refuse' : '...acces.seulAdmin');
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
export const ENV_EMAILS = `# Les e-mails (« emails par brevo ») : la clé API de Brevo et une adresse d'un domaine vérifié chez Brevo.
# Sans elles, rien ne part et le serveur le dit dans son journal.
BREVO_API_KEY=
BREVO_EXPEDITEUR=
# Combien d'e-mails ce serveur envoie par heure au plus (100 par défaut).
HUMALIS_EMAILS_PAR_HEURE=
`;

export const ENV_LIENS = `# L'adresse publique du site, pour les liens envoyés par e-mail (https://ma-boutique.com).
# Le serveur ne la devine jamais depuis une requête : quelqu'un pourrait y glisser son propre site.
HUMALIS_ADRESSE_SITE=
`;

/** Le coffre des clés : les deux clés de Brevo. */
export const CLES_BREVO = `      {
        key: 'BREVO_API_KEY',
        label: 'Clé API de Brevo',
        help: "Pour envoyer les e-mails du serveur. Sans elle, rien ne part.",
        where: 'Brevo, SMTP et API, Clés API',
      },
      {
        key: 'BREVO_EXPEDITEUR',
        label: "Adresse d'envoi",
        help: "Une adresse d'un domaine vérifié chez Brevo.",
        where: 'Brevo, Expéditeurs et domaines',
      },
`;

/** src/humalis/emails.ts */
export const EMAILS = `import { createMailer } from '@astratra/notify';

/**
 * Produit par Humalis : les e-mails du serveur, par @astratra/notify et l'API de Brevo.
 * Les clés sont relues à chaque envoi, pour qu'un changement dans le coffre serve aussitôt.
 * Rien ici ne montre une clé, ni dans un journal, ni dans une erreur.
 */
const URL_BREVO = 'https://api.brevo.com/v3/smtp/email';
const ADRESSE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
const HEURE = 60 * 60 * 1000;

export interface MessageEmail {
  a: string | string[];
  sujet: string;
  texte: string;
  html?: string;
}

export interface Emails {
  /** Vrai si la clé et l'adresse d'envoi sont réglées. */
  pret(): boolean;
  /** Ne lève jamais : vrai si le service a pris l'e-mail. */
  envoyer(message: MessageEmail): Promise<boolean>;
}

/** Une valeur d'une fiche dans un texte : une valeur absente ne s'écrit pas. */
export const enTexte = (valeur: unknown) => (valeur === null || valeur === undefined ? '' : String(valeur));

export function creerEmails({
  nom,
  env = process.env,
  transport = globalThis.fetch,
  horloge = Date.now,
}: {
  nom: string;
  env?: Record<string, string | undefined>;
  transport?: typeof globalThis.fetch;
  horloge?: () => number;
}): Emails {
  const cles = () => {
    const cle = (env.BREVO_API_KEY ?? '').trim();
    const expediteur = (env.BREVO_EXPEDITEUR ?? '').trim();
    return cle && ADRESSE.test(expediteur) ? { cle, expediteur } : null;
  };
  const envois: number[] = [];
  return {
    pret: () => cles() !== null,
    async envoyer({ a, sujet, texte, html }) {
      const reglees = cles();
      if (!reglees) {
        console.warn("E-mail non envoyé : BREVO_API_KEY et BREVO_EXPEDITEUR ne sont pas réglées.");
        return false;
      }
      const limite = Number(env.HUMALIS_EMAILS_PAR_HEURE) || 100;
      while (envois.length > 0 && envois[0] <= horloge() - HEURE) envois.shift();
      if (envois.length >= limite) {
        console.warn(\`E-mail non envoyé : la limite de \${limite} par heure est atteinte (HUMALIS_EMAILS_PAR_HEURE).\`);
        return false;
      }
      envois.push(horloge());
      const mailer = createMailer({
        channels: {
          transactional: {
            from: reglees.expediteur,
            fromName: nom,
            async send(message: { to: string[]; subject: string; text?: string; html?: string }) {
              const reponse = await transport(URL_BREVO, {
                method: 'POST',
                headers: { 'api-key': reglees.cle, 'content-type': 'application/json', accept: 'application/json' },
                body: JSON.stringify({
                  sender: { name: nom, email: reglees.expediteur },
                  to: message.to.map((email) => ({ email })),
                  subject: message.subject,
                  textContent: message.text,
                  ...(message.html ? { htmlContent: message.html } : {}),
                }),
                signal: AbortSignal.timeout(15_000),
              });
              if (!reponse.ok) throw new Error(\`Brevo a refusé l'envoi (HTTP \${reponse.status})\`);
              return reponse.json().catch(() => ({}));
            },
          },
        },
      });
      const { sent, reason } = await mailer.send({ to: a, subject: sujet, text: texte, ...(html ? { html } : {}) });
      if (!sent) console.error(\`E-mail non envoyé : \${reason ?? 'raison inconnue'}.\`);
      return sent;
    },
  };
}
`;

/** src/humalis/comptes.ts */
export const COMPTES = `import { createHash, randomBytes } from 'node:crypto';
import { createMemoryPasswordResetStore, type PasswordResetStore, type SaasUser, type UsersStore } from '@astratra/saas-kit';
import { isStrongPassword, type RefreshTokenService, type RevocationStore } from '@astratra/security';
import type { RequestHandler } from 'express';
import type { Emails } from './emails.js';
import type { PoolPostgres } from './stockage.js';

/**
 * Produit par Humalis : les invitations, le lien du mot de passe oublié et la liste des comptes.
 * Un lien porte un jeton de 32 octets au hasard dans son fragment (#jeton=…), que le navigateur
 * n'envoie jamais à un serveur ; seule son empreinte est gardée, et le pack la consomme une fois.
 */
const ROLE_RETIRE = 'retire';
const ADRESSE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
const SEPT_JOURS = 7 * 24 * 60 * 60 * 1000;
const DIX_MINUTES = 10 * 60 * 1000;

type Compte = SaasUser & { invitation?: boolean; passwordHash?: unknown };

const empreinte = (jeton: string) => createHash('sha256').update(jeton).digest('hex');
const echapper = (texte: string) => texte.replace(/[&<>"']/g, (c) => \`&#\${c.charCodeAt(0)};\`);

/**
 * Les comptes vus par les packs : un compte retiré n'existe plus pour eux (connexion, Google, mot de passe
 * oublié, session). Le pack écrit « password » en réinitialisant, Humalis lit « passwordHash ». Choisir un
 * mot de passe ou lier un compte Google, c'est accepter l'invitation.
 */
export function sansLesRetires(store: UsersStore): UsersStore {
  const visible = (compte: SaasUser | null) => (compte && compte.role !== ROLE_RETIRE ? compte : null);
  return {
    findByEmail: async (email) => visible(await store.findByEmail(email)),
    findById: async (id) => visible(await store.findById(id)),
    create: (compte) => store.create(compte),
    list: async (options) => (await store.list(options)).filter((compte) => compte.role !== ROLE_RETIRE),
    ...(store.count ? { count: (options) => store.count!(options) } : {}),
    ...(store.countByRole ? { countByRole: () => store.countByRole!() } : {}),
    update: (id, modifs) => {
      const { password, ...reste } = modifs as Compte & { password?: unknown };
      const ecrit: Compte = { ...reste, ...(password !== undefined ? { passwordHash: password } : {}) };
      if ('passwordHash' in ecrit || 'googleSubject' in ecrit) ecrit.invitation = false;
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
    res.status(400).json({ erreur: 'ce mot de passe est trop faible : au moins 8 caractères, avec une majuscule, une minuscule, un chiffre et un signe' });
    return;
  }
  next();
};

export function creerComptes({
  usersStore,
  jetons,
  emails,
  renouvellement,
  revocations,
  nom,
  google,
  pageInvitation,
  pageOublie,
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
  pageOublie: string | null;
  env?: Record<string, string | undefined>;
}) {
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
        const corps = (req.body ?? {}) as { email?: unknown; role?: unknown };
        const adresse = typeof corps.email === 'string' ? corps.email.trim().toLowerCase() : '';
        const role = corps.role === 'admin' ? 'admin' : 'user';
        if (!ADRESSE.test(adresse)) {
          res.status(400).json({ erreur: "cette adresse e-mail n'est pas valable" });
          return;
        }
        if (pageInvitation === null || !emails.pret() || !adresseDuSite()) {
          res.status(503).json({ erreur: "les e-mails ne sont pas réglés sur ce serveur (BREVO_API_KEY, BREVO_EXPEDITEUR, HUMALIS_ADRESSE_SITE) : l'invitation n'est pas partie" });
          return;
        }
        const existant = (await usersStore.findByEmail(adresse)) as Compte | null;
        if (existant && existant.role !== ROLE_RETIRE && existant.invitation !== true) {
          res.json({ envoye: true });
          return;
        }
        const compte = existant
          ? await usersStore.update(String(existant.id), { role, invitation: true } as Compte)
          : await usersStore.create({ email: adresse, role, invitation: true } as Compte);
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

    /** La liste des comptes, sans aucun secret. */
    lister: (async (_req, res, next) => {
      try {
        const tous = (await usersStore.list({ limit: 500 })) as Compte[];
        const presents = tous.filter((compte) => compte.role !== ROLE_RETIRE);
        presents.sort((a, b) => String(a.email).localeCompare(String(b.email)));
        res.json(
          presents.map((compte) => ({
            id: String(compte.id),
            email: String(compte.email ?? ''),
            role: compte.role === 'admin' ? 'admin' : 'membre',
            statut: compte.invitation === true ? 'invite' : 'actif',
          })),
        );
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
        if (!compte || compte.role === ROLE_RETIRE) {
          res.status(404).json({ erreur: "ce compte n'existe pas" });
          return;
        }
        await usersStore.update(id, { role: ROLE_RETIRE, invitation: false, passwordHash: null, googleSubject: null } as unknown as Compte);
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

/** tests/comptes.test.ts : le parcours complet, avec un faux Brevo. */
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
    expect(reponse.body.erreur).toContain('BREVO_API_KEY');
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
    expect(Object.keys(liste.body[0]).sort()).toEqual(['email', 'id', 'role', 'statut']);
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
  return `// Produit par Humalis : les invitations, le mot de passe oublié et la liste des comptes, avec un faux Brevo.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createMemoryPasswordResetStore, createMemoryUsersStore, type UsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from '../src/serveur.js';
import { creerEmails } from '../src/humalis/emails.js';
import { creerStockageMemoire } from '../src/humalis/stockage.js';

const MOT_DE_PASSE = 'Essai-Solide-2026!';
process.env.HUMALIS_ADRESSE_SITE = 'https://site.exemple.cd';

const jetonDuLien = (corps: { textContent: string }) => /#jeton=([0-9a-f]{64})/.exec(corps.textContent)![1];

async function preparer({ cles = true } = {}) {
  const usersStore = createMemoryUsersStore() as UsersStore;
  const passwordHash = await hashPassword(MOT_DE_PASSE);
  await usersStore.create({ email: 'admin@exemple.cd', role: 'admin', passwordHash });
  await usersStore.create({ email: 'awa@exemple.cd', role: 'user', passwordHash });
  const boite: { textContent: string; to: { email: string }[] }[] = [];
  const transport = (async (_url: unknown, options: { body: string }) => {
    boite.push(JSON.parse(options.body));
    return new Response('{}', { status: 201 });
  }) as unknown as typeof fetch;
  const emails = creerEmails({ nom: 'Essai', env: cles ? { BREVO_API_KEY: 'cle-de-test', BREVO_EXPEDITEUR: 'envoi@exemple.cd' } : {}, transport });
  const jetons = createMemoryPasswordResetStore();
  const stockages = {
${stockages}
  };
  const app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages, emails, jetons }) as never;
  const entree = async (email: string) => ({ Authorization: \`Bearer \${(await request(app).post('/auth/login').send({ email, password: MOT_DE_PASSE }).expect(200)).body.data.token}\` });
  const idDe = async (email: string) => String((await usersStore.findByEmail(email))?.id);
  return { app, boite, jetons, idDe, entreeAdmin: await entree('admin@exemple.cd'), entreeMembre: await entree('awa@exemple.cd') };
}

describe('les comptes', () => {
${blocs.join('\n\n')}
});
`;
}

const adresseDeRoute = (adresse: string) => `/api/${adresse.replace(/^\/+/, '').replace(/^api\//, '')}`;
