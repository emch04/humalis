import { repereLigne, repereNom } from '../lignes-humalis.js';
import { lieuNote } from '../commun/noter.js';
/**
 * « seul gerant peut faire … » et « tous les jours a 7 h : » : le code produit.
 * Une action tourne dans une transaction : un « refuser » ou une panne annule tout ce
 * qu'elle a écrit. Les e-mails et notifications partent seulement après la validation.
 */
import type { FiltreServeurRI, InstructionServeurRI, ServeurRI, TestServeurRI, TypeChamp, ValeurServeurRI } from '../../ri/types.js';
import { simplifier } from '../../analyse/elements.js';
import { camel, pascal } from '../web/noms.js';
import { aCompleter, codeCercles, codeCerclesDuGroupe } from './regles.js';
import { gardeAction } from './separation.js';

type Route = ServeurRI['routes'][number];
const chaine = (t: string) => JSON.stringify(t);
const fiche = (nom: string) => `f_${camel(nom)}`;

export const avecPaiements = (serveur: ServeurRI) => serveur.routes.some((r) => r.apresPaiement !== undefined);
/** Vrai si le serveur écrit tout ou rien quelque part (actions, paiements, tâches, documents, ou des calculs à tenir justes). */
// « connecte peut supprimer son compte » : les fiches de la personne changent toutes ensemble, dans une transaction.
export const avecLogique = (serveur: ServeurRI) => Boolean(serveur.projet) || Boolean(serveur.routeMonCompte?.supprimer) || serveur.routes.some((r) => r.apresPaiement !== undefined || r.resumes?.length) || Boolean(serveur.taches?.length) || Boolean(serveur.documents?.length) || serveur.routes.some((r) => r.actions?.length) || serveur.donnees.some((d) => d.champs.some((c) => c.regle?.genre === 'somme' || c.regle?.genre === 'nombreDe'));
const parcourir = (liste: InstructionServeurRI[], voir: (i: InstructionServeurRI) => void): void => {
  for (const i of liste) {
    voir(i);
    if (i.type === 'si') { parcourir(i.alors, voir); parcourir(i.sinon, voir); }
    if (i.type === 'pourChaque') parcourir(i.corps, voir);
  }
};
export function employe(serveur: ServeurRI, voir: (i: InstructionServeurRI) => boolean): boolean {
  let trouve = false;
  const blocs = [...(serveur.taches ?? []).map((t) => t.corps), ...serveur.routes.flatMap((r) => (r.actions ?? []).map((a) => a.corps))];
  for (const bloc of blocs) parcourir(bloc, (i) => { trouve ||= voir(i); });
  return trouve;
}

function valeur(v: ValeurServeurRI): string {
  switch (v.genre) {
    case 'erreur': return `erreur.${v.champ}`;
    case 'valeur': return JSON.stringify(v.valeur);
    case 'aujourdhui': return 'new Date().toISOString().slice(0, 10)';
    case 'champ': return `${fiche(v.fiche)}[${chaine(v.champ === 'id' ? 'id' : camel(v.champ))}]`;
    case 'local': return `l_${camel(v.nom)}`;
    case 'utilisateur': return `moi[${chaine(camel(v.champ))}]`;
    case 'texte': return v.parties.map((p) => ('texte' in p ? chaine(p.texte) : `enTexte(${valeur(p.valeur)})`)).join(' + ') || "''";
    case 'calcul': return `(Number(${valeur(v.gauche)}) ${v.operateur} Number(${valeur(v.droite)}))`;
  }
}

const COMPARAISONS = { superieur: '>', inferieur: '<' } as const;

/** La lecture filtrée : les égalités sont faites par la base, le reste ensuite. L'identifiant n'est pas dans le JSON de la base. */
function lecture(source: string, donnee: string, filtres: FiltreServeurRI[], egalEnPlus: string[]): string {
  const parBase = filtres.filter((f) => f.operateur === 'egal' && f.champ !== 'id');
  const apres = filtres.filter((f) => !parBase.includes(f));
  const egal = [...parBase.map((f) => `${chaine(camel(f.champ))}: ${valeur(f.valeur)}`), ...egalEnPlus];
  const base = `(await ${source}.${camel(donnee)}.lister({ egal: { ${egal.join(', ')} } as Record<string, string | number | boolean> }))`;
  if (apres.length === 0) return base;
  const conditions = apres.map((f) => {
    const a = `ligne[${chaine(f.champ === 'id' ? 'id' : camel(f.champ))}]`;
    const b = valeur(f.valeur);
    return f.operateur === 'egal' ? `${a} === ${b}` : f.operateur === 'different' ? `${a} !== ${b}` : `Number(${a}) ${COMPARAISONS[f.operateur]} Number(${b})`;
  });
  return `${base}.filter((ligne) => ${conditions.join(' && ')})`;
}

const schemaDe = (type: TypeChamp): string => (type.genre === 'texte' && type.image ? "'image'" : type.genre === 'liste' ? `{ liste: ${schemaDe(type.de)} }` : `'${type.genre}'`);

function test(t: TestServeurRI): string {
  if (t.genre === 'combinaison') return `(${test(t.gauche)} ${t.operateur === 'et' ? '&&' : '||'} ${test(t.droite)})`;
  const a = valeur(t.gauche);
  const b = t.droite ? valeur(t.droite) : 'undefined';
  const brut: Record<string, string> = {
    egal: `${a} === ${b}`,
    different: `${a} !== ${b}`,
    inferieur: `Number(${a}) < Number(${b})`,
    superieur: `Number(${a}) > Number(${b})`,
    inferieurOuEgal: `Number(${a}) <= Number(${b})`,
    superieurOuEgal: `Number(${a}) >= Number(${b})`,
    vide: `estVide(${a})`,
    vrai: `${a} === true`,
    faux: `${a} === false`,
    rien: `(${a} === undefined || ${a} === null)`,
    contient: `contient(${a}, ${b})`,
    commencePar: `enTexte(${a}).startsWith(enTexte(${b}))`,
    finitPar: `enTexte(${a}).endsWith(enTexte(${b}))`,
    dans: `contient(${b}, ${a})`,
  };
  return t.negation ? `!(${brut[t.operateur]})` : `(${brut[t.operateur]})`;
}

/** La ligne qui prépare l'envoi : les textes sont lus tout de suite, l'envoi part après la transaction. */
function destinataires(i: Pick<Extract<InstructionServeurRI, { type: 'notification' }>, 'a'>): string {
  if (i.a.genre === 'compte') return `const compte = enTexte(${valeur(i.a.valeur)}); const notifier = (n: typeof envoi) => notifications.aUnCompte(compte, n);`;
  const groupe = i.a.groupe ? `{ champ: ${chaine(camel(i.a.groupe.champ))}, valeur: ${fiche(i.a.groupe.fiche)}[${chaine(camel(i.a.groupe.champ))}] }` : 'undefined';
  return `const groupe = ${groupe}; const notifier = (n: typeof envoi) => notifications.aDesRoles(${JSON.stringify(i.a.roles)}, n, groupe);`;
}

/** Les textes d'une notification, et ses boutons (« et boutons "Accepter" et "Refuser" »). */
const contenuNotification = (n: Extract<InstructionServeurRI, { type: 'notification' }>): string =>
  `{ titre: ${valeur(n.titre)}, texte: ${valeur(n.texte)}${n.boutons?.length ? `, boutons: ${JSON.stringify(n.boutons)}` : ''} }`;

/** Après une création : la fiche créée, puis les notifications ; un échec n'annule pas la création. */
export function codeNotificationsCreation(route: Route): string {
  const nom = fiche(route.donnee);
  return (route.notifications ?? [])
    .map((n) => `          {
            const ${nom} = cree as Record<string, unknown>;
            const envoi = ${contenuNotification(n)};
            ${destinataires(n)}
            void notifier(envoi).catch((erreur: unknown) => console.error('Une notification n\\'est pas partie :', erreur instanceof Error ? erreur.message : erreur));
          }`)
    .join('\n');
}

export const avecNotifications = (serveur: ServeurRI) => Boolean(serveur.activeNotifications) || serveur.routes.some((r) => r.notifications?.length) || employe(serveur, (i) => i.type === 'notification' || i.type === 'activite');

/** Les routes des appareils, dans extendRoutes. */
export const ROUTES_APPAREILS = `      const routeAppareils = express.Router();
      routeAppareils.get('/cle', (_req, res) => {
        res.json({ cle: process.env.HUMALIS_VAPID_PUBLIQUE ?? null });
      });
      routeAppareils.post('/', ...acces.connecte, csrfMiddleware, notifications.inscrire);
      app.use('/auth/appareils', routeAppareils);
      // Le jeton d'une activité en direct de l'iPhone : « mettre a jour activite » la fait changer, application fermée.
      const routeActivites = express.Router();
      routeActivites.post('/', ...acces.connecte, csrfMiddleware, notifications.inscrireActivite);
      app.use('/auth/activites', routeActivites);
`;

/** src/humalis/notifications.ts */
export const NOTIFICATIONS = String.raw`import { createPrivateKey, sign } from 'node:crypto';
import { connect } from 'node:http2';
import type { UsersStore } from '@astratra/saas-kit';
import type { RequestHandler } from 'express';
import webpush from 'web-push';
import type { Enregistrement, Stockage } from './stockage.js';

/**
 * Produit par Humalis : les notifications web (VAPID), Apple (APNs) et Android (Firebase). Les clés viennent de
 * l'environnement ; sans elles, rien ne part et le serveur le dit dans son journal.
 */
export interface Notification {
  titre: string;
  texte: string;
  /** « et boutons "Accepter" et "Refuser" » : la personne répond sans ouvrir l'application (trois au plus). */
  boutons?: string[];
}

/** La catégorie Apple d'une notification à boutons : l'application déclare la même, avec un bouton par texte. */
const categorie = (boutons: string[]) => 'humalis.boutons.' + boutons.join('|');

/** Une adresse d'abonnement ne peut viser que les services de notification connus : sinon, n'importe qui ferait appeler n'importe quelle adresse au serveur. */
const HOTES_CONNUS = ['fcm.googleapis.com', 'web.push.apple.com', 'push.services.mozilla.com', 'notify.windows.com'];
const permis = (adresse: string) => {
  try {
    const url = new URL(adresse);
    const hotes = [...HOTES_CONNUS, ...(process.env.HUMALIS_PUSH_HOTES ?? '').split(',').filter(Boolean)];
    return url.protocol === 'https:' && hotes.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
};

const JETON = /^[0-9a-fA-F]{32,200}$/;

let jetonApple: { valeur: string; depuis: number } | undefined;
function jetonAPNs(): string | null {
  const { HUMALIS_APNS_CLE: cle, HUMALIS_APNS_CLE_ID: id, HUMALIS_APNS_EQUIPE: equipe } = process.env;
  if (!cle || !id || !equipe) return null;
  const maintenant = Math.floor(Date.now() / 1000);
  // Apple refuse un jeton renouvelé trop souvent : il sert cinquante minutes.
  if (jetonApple && maintenant - jetonApple.depuis < 3000) return jetonApple.valeur;
  const base = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const corps = base({ alg: 'ES256', kid: id }) + '.' + base({ iss: equipe, iat: maintenant });
  const signature = sign('sha256', Buffer.from(corps), { key: createPrivateKey(cle.replace(/\\n/g, '\n')), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  jetonApple = { valeur: corps + '.' + signature, depuis: maintenant };
  return jetonApple.valeur;
}

function envoyerApple(jeton: string, n: Notification): Promise<number> {
  const boutons = n.boutons?.slice(0, 3);
  const aps = { alert: { title: n.titre, body: n.texte }, ...(boutons?.length ? { category: categorie(boutons) } : {}) };
  return envoyerAPNs(jeton, 'alert', { aps, ...(boutons?.length ? { boutons } : {}) });
}

/**
 * La mise à jour d'une activité en direct (Live Activity) : son jeton à elle, le type « liveactivity » et le sujet
 * « <identifiant>.push-type.liveactivity ». L'application relit l'activité à la réception (content-state.maj).
 */
function envoyerActiviteApple(jeton: string, nom: string): Promise<number> {
  const maintenant = Math.floor(Date.now() / 1000);
  return envoyerAPNs(jeton, 'liveactivity', { aps: { timestamp: maintenant, event: 'update', 'content-state': { maj: maintenant } }, activite: nom });
}

function envoyerAPNs(jeton: string, genre: 'alert' | 'liveactivity', corps: object): Promise<number> {
  return new Promise((ok, echec) => {
    const autorisation = jetonAPNs();
    const sujet = process.env.HUMALIS_APNS_SUJET;
    if (!autorisation || !sujet) {
      console.warn('Notification Apple non envoyée : HUMALIS_APNS_CLE, HUMALIS_APNS_CLE_ID, HUMALIS_APNS_EQUIPE et HUMALIS_APNS_SUJET ne sont pas réglées.');
      ok(0);
      return;
    }
    const client = connect('https://' + (process.env.HUMALIS_APNS_HOTE ?? 'api.push.apple.com'));
    client.on('error', echec);
    const requete = client.request({ ':method': 'POST', ':path': '/3/device/' + jeton, authorization: 'bearer ' + autorisation, 'apns-topic': genre === 'liveactivity' ? sujet + '.push-type.liveactivity' : sujet, 'apns-push-type': genre, 'apns-priority': '10', 'content-type': 'application/json' });
    let statut = 0;
    requete.on('response', (entetes) => { statut = Number(entetes[':status']); });
    requete.on('error', echec);
    requete.on('end', () => { client.close(); ok(statut); });
    requete.resume();
    requete.end(JSON.stringify(corps));
  });
}

/** Le jeton d'un téléphone Android donné par Firebase Cloud Messaging. */
const JETON_ANDROID = /^[A-Za-z0-9_:-]{20,4096}$/;

let jetonFirebase: { valeur: string; jusqua: number } | undefined;
/** Le compte de service de Firebase (HUMALIS_FCM_COMPTE : son fichier JSON, tel quel ou en base 64). */
function compteFirebase(): { client_email: string; private_key: string; project_id: string; token_uri?: string } | null {
  const brut = process.env.HUMALIS_FCM_COMPTE;
  if (!brut) return null;
  try {
    const texte = brut.trim().startsWith('{') ? brut : Buffer.from(brut, 'base64').toString('utf8');
    const lu = JSON.parse(texte) as { client_email?: unknown; private_key?: unknown; project_id?: unknown; token_uri?: unknown };
    if (typeof lu.client_email !== 'string' || typeof lu.private_key !== 'string' || typeof lu.project_id !== 'string') return null;
    return { client_email: lu.client_email, private_key: lu.private_key, project_id: lu.project_id, ...(typeof lu.token_uri === 'string' ? { token_uri: lu.token_uri } : {}) };
  } catch {
    return null;
  }
}

/** Un jeton d'accès de Google, signé avec la clé du compte de service ; il sert cinquante minutes. */
async function accesFirebase(compte: NonNullable<ReturnType<typeof compteFirebase>>): Promise<string> {
  const maintenant = Math.floor(Date.now() / 1000);
  if (jetonFirebase && jetonFirebase.jusqua > maintenant + 60) return jetonFirebase.valeur;
  const adresse = compte.token_uri ?? 'https://oauth2.googleapis.com/token';
  const base = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const corps = base({ alg: 'RS256', typ: 'JWT' }) + '.' + base({ iss: compte.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: adresse, iat: maintenant, exp: maintenant + 3600 });
  const signature = sign('sha256', Buffer.from(corps), createPrivateKey(compte.private_key.replace(/\\n/g, '\n'))).toString('base64url');
  const reponse = await fetch(adresse, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: corps + '.' + signature }) });
  const lu = (await reponse.json()) as { access_token?: string; expires_in?: number };
  if (!reponse.ok || !lu.access_token) throw new Error('Firebase a refusé le compte de service (' + reponse.status + ')');
  jetonFirebase = { valeur: lu.access_token, jusqua: maintenant + (lu.expires_in ?? 3600) };
  return lu.access_token;
}

/**
 * Un message à un téléphone Android. Une notification simple est montrée par le système ; une notification à
 * boutons, ou la mise à jour d'une activité, part en message de données : l'application la construit elle-même.
 */
async function envoyerAndroid(jeton: string, n: Notification): Promise<number> {
  const boutons = n.boutons?.slice(0, 3);
  const message = boutons?.length
    ? { data: { humalis: 'notification', titre: n.titre, texte: n.texte, boutons: JSON.stringify(boutons) } }
    : { notification: { title: n.titre, body: n.texte } };
  return envoyerFCM(jeton, message);
}

const envoyerActiviteAndroid = (jeton: string, nom: string) => envoyerFCM(jeton, { data: { humalis: 'activite', nom } });

async function envoyerFCM(jeton: string, contenu: object): Promise<number> {
  const compte = compteFirebase();
  if (!compte) {
    console.warn('Notification Android non envoyée : HUMALIS_FCM_COMPTE (le compte de service de Firebase) n\'est pas réglée.');
    return 0;
  }
  const hote = process.env.HUMALIS_FCM_ADRESSE ?? 'https://fcm.googleapis.com';
  const reponse = await fetch(hote + '/v1/projects/' + encodeURIComponent(compte.project_id) + '/messages:send', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + (await accesFirebase(compte)), 'content-type': 'application/json' },
    body: JSON.stringify({ message: { token: jeton, ...contenu, android: { priority: 'high' } } }),
  });
  return reponse.status;
}

export function creerNotifications({ usersStore, appareils }: { usersStore: UsersStore; appareils: Stockage }) {
  const envoyerA = async (appareil: Enregistrement, n: Notification): Promise<void> => {
    try {
      if (appareil.genre === 'apple') {
        const statut = await envoyerApple(String(appareil.cle), n);
        if (statut === 410 || statut === 400) await appareils.supprimer(appareil.id);
        return;
      }
      if (appareil.genre === 'android') {
        // Un jeton que Firebase ne connaît plus (application retirée) : on l'oublie.
        const statut = await envoyerAndroid(String(appareil.cle), n);
        if (statut === 404 || statut === 400) await appareils.supprimer(appareil.id);
        return;
      }
      const { HUMALIS_VAPID_PUBLIQUE: publique, HUMALIS_VAPID_PRIVEE: privee, HUMALIS_VAPID_SUJET: sujet } = process.env;
      if (!publique || !privee || !sujet) {
        console.warn('Notification web non envoyée : HUMALIS_VAPID_PUBLIQUE, HUMALIS_VAPID_PRIVEE et HUMALIS_VAPID_SUJET ne sont pas réglées.');
        return;
      }
      await webpush.sendNotification(appareil.abonnement as webpush.PushSubscription, JSON.stringify(n), { vapidDetails: { subject: sujet, publicKey: publique, privateKey: privee }, TTL: 86400 });
    } catch (erreur) {
      // L'appareil s'est désabonné : on l'oublie.
      const statut = (erreur as { statusCode?: number }).statusCode;
      if (statut === 404 || statut === 410) await appareils.supprimer(appareil.id);
      else console.error('Une notification n\'est pas partie :', erreur instanceof Error ? erreur.message : erreur);
    }
  };

  const aUnCompte = async (compte: string, n: Notification): Promise<void> => {
    await Promise.all((await appareils.lister({ egal: { compte } })).map((a) => envoyerA(a, n)));
  };

  /** Les comptes de ces rôles ; avec un groupe, seulement ceux de ce groupe. */
  const comptesDesRoles = async (roles: string[], groupe?: { champ: string; valeur: unknown }): Promise<string[]> => {
    const ids: string[] = [];
    for (const role of roles) {
      const comptes = await usersStore.list({ role, limit: 1000 });
      for (const c of groupe ? comptes.filter((c) => (c as Record<string, unknown>)[groupe.champ] === groupe.valeur) : comptes) ids.push(String(c.id));
    }
    return ids;
  };

  /** « mettre a jour activite » : le jeton de l'activité sur l'iPhone, un message de données sur Android. */
  const activiteAUnCompte = async (compte: string, nom: string): Promise<void> => {
    await Promise.all((await appareils.lister({ egal: { compte } })).map(async (a) => {
      try {
        if (a.genre === 'activite' && a.nom === nom) {
          const statut = await envoyerActiviteApple(String(a.cle), nom);
          // L'activité est terminée sur l'iPhone : son jeton ne sert plus.
          if (statut === 410 || statut === 400) await appareils.supprimer(a.id);
        } else if (a.genre === 'android') {
          const statut = await envoyerActiviteAndroid(String(a.cle), nom);
          if (statut === 404 || statut === 400) await appareils.supprimer(a.id);
        }
      } catch (erreur) {
        console.error('Une activité en direct n\'a pas été mise à jour :', erreur instanceof Error ? erreur.message : erreur);
      }
    }));
  };

  return {
    aUnCompte,
    activiteAUnCompte,
    async activiteADesRoles(roles: string[], nom: string, groupe?: { champ: string; valeur: unknown }): Promise<void> {
      await Promise.all((await comptesDesRoles(roles, groupe)).map((c) => activiteAUnCompte(c, nom)));
    },

    /** POST /auth/activites : { nom, apple: jeton } ; avec « fin: true », le jeton est oublié. */
    inscrireActivite: (async (req, res, next) => {
      try {
        const compte = String((req as unknown as { user: { id: unknown } }).user.id);
        const corps = (req.body ?? {}) as { nom?: unknown; apple?: unknown; fin?: unknown };
        if (typeof corps.nom !== 'string' || corps.nom.length > 200 || typeof corps.apple !== 'string' || !JETON.test(corps.apple)) {
          res.status(400).json({ erreur: "cette activité n'est pas valable" });
          return;
        }
        for (const ancien of await appareils.lister({ egal: { cle: corps.apple } })) await appareils.supprimer(ancien.id);
        if (corps.fin !== true) await appareils.creer({ genre: 'activite', cle: corps.apple, nom: corps.nom, compte });
        res.status(corps.fin === true ? 200 : 201).json({ inscrit: corps.fin !== true });
      } catch (erreur) {
        next(erreur);
      }
    }) as RequestHandler,
    /** Tous les comptes de ces rôles ; avec un groupe, seulement ceux de ce groupe. */
    async aDesRoles(roles: string[], n: Notification, groupe?: { champ: string; valeur: unknown }): Promise<void> {
      await Promise.all((await comptesDesRoles(roles, groupe)).map((c) => aUnCompte(c, n)));
    },

    /** POST /auth/appareils : { web: abonnement }, { apple: jeton } ou { android: jeton }. Un appareil n'appartient qu'à un compte. */
    inscrire: (async (req, res, next) => {
      try {
        const compte = String((req as unknown as { user: { id: unknown } }).user.id);
        const corps = (req.body ?? {}) as { web?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; apple?: unknown; android?: unknown };
        let fiche: Record<string, unknown>;
        if (typeof corps.apple === 'string' && JETON.test(corps.apple)) {
          fiche = { genre: 'apple', cle: corps.apple };
        } else if (typeof corps.android === 'string' && JETON_ANDROID.test(corps.android)) {
          fiche = { genre: 'android', cle: corps.android };
        } else if (corps.web && typeof corps.web.endpoint === 'string' && permis(corps.web.endpoint) && typeof corps.web.keys?.p256dh === 'string' && typeof corps.web.keys?.auth === 'string') {
          fiche = { genre: 'web', cle: corps.web.endpoint, abonnement: { endpoint: corps.web.endpoint, keys: { p256dh: corps.web.keys.p256dh, auth: corps.web.keys.auth } } };
        } else {
          res.status(400).json({ erreur: "cet appareil n'est pas valable" });
          return;
        }
        for (const ancien of await appareils.lister({ egal: { cle: fiche.cle as string } })) await appareils.supprimer(ancien.id);
        await appareils.creer({ ...fiche, compte });
        res.status(201).json({ inscrit: true });
      } catch (erreur) {
        next(erreur);
      }
    }) as RequestHandler,
  };
}
`;

/** public/humalis/notifications.js */
export const TRAVAILLEUR_NOTIFICATIONS = `self.addEventListener('push', (evenement) => {
  const message = evenement.data ? evenement.data.json() : {};
  evenement.waitUntil(self.registration.showNotification(message.titre || '', { body: message.texte || '' }));
});
self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close();
  evenement.waitUntil(self.clients.openWindow('/'));
});
`;

class Ecriture {
  /**
   * personne : vrai dans une action lancée par quelqu'un (« req » existe) ; ses calculs ne lisent alors que ce
   * qu'elle pourrait lire. Sans personne (paiement, tâche), ils restent dans le groupe de la fiche créée.
   */
  constructor(private readonly serveur: ServeurRI, private readonly groupeImpose?: { champ: string; variable: string }, private readonly personne = false) {}

  private groupeDe(donnee: string, variable: string): string {
    const par = this.serveur.donnees.find((d) => d.nom === donnee)?.par;
    return par ? `, ${variable}[${chaine(camel(par))}]` : '';
  }

  /** Une action sur une fiche séparée ne parcourt que son groupe. */
  private egalDuGroupe(donnee: string): string[] {
    const par = this.serveur.donnees.find((d) => d.nom === donnee)?.par;
    return par && this.groupeImpose?.champ === par ? [`${chaine(camel(par))}: ${this.groupeImpose.variable}[${chaine(camel(par))}]`] : [] as string[];
  }

  lignes(liste: InstructionServeurRI[], retrait: string): string {
    return liste.map((i) => this.instruction(i, retrait)).join('\n');
  }

  /** Le repère de la ligne Humalis devant le code de l'instruction (voir lignes-humalis.ts). */
  private instruction(i: InstructionServeurRI, r: string): string {
    const code = this.instructionSansLigne(i, r);
    const repere = repereLigne(i.ligne);
    if (!repere) return code;
    // Chaque ligne de l'instruction écrite à son retrait (pas celles des instructions qu'elle contient, qui ont les leurs).
    return code.split('\n').map((ligne) => (ligne.startsWith(r) && ligne[r.length] !== ' ' && !ligne.slice(r.length).startsWith('/*@') ? r + repere + ligne.slice(r.length) : ligne)).join('\n');
  }

  private instructionSansLigne(i: InstructionServeurRI, r: string): string {
    switch (i.type) {
      case 'requete':
        return `${r}try {\n${r}  await fetch(${chaine(i.adresse)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ${i.champs.map((c) => `${chaine(c.nom)}: ${valeur(c.valeur)}`).join(', ')} }), signal: AbortSignal.timeout(3000) });\n${r}} catch { /* La capture ne doit jamais interrompre le serveur. */ }`;
      case 'si': {
        const sinon = i.sinon.length ? ` else {\n${this.lignes(i.sinon, r + '  ')}\n${r}}` : '';
        return `${r}if (${test(i.test)}) {\n${this.lignes(i.alors, r + '  ')}\n${r}}${sinon}`;
      }
      case 'pourChaque':
        return `${r}for (const ${repereNom(i.variable)}${fiche(i.variable)} of ${lecture('s', i.donnee, i.filtres, this.egalDuGroupe(i.donnee))}) {\n${this.lignes(i.corps, r + '  ')}\n${r}}`;
      case 'calcul':
        return `${r}const ${repereNom(i.nom)}l_${camel(i.nom)} = agreger(${chaine(i.operation)}, ${lecture('s', i.donnee, i.filtres, this.egalDuGroupe(i.donnee))}${i.champ !== undefined ? `, ${chaine(camel(i.champ))}` : ''});`;
      case 'changer':
        return `${r}Object.assign(${fiche(i.fiche)}, await s.${camel(i.donnee)}.modifier(${fiche(i.fiche)}.id, { ${chaine(camel(i.champ))}: ${valeur(i.valeur)} }));\n${r}noter(travail, ${chaine(i.donnee)}${this.groupeDe(i.donnee, fiche(i.fiche))});`;
      case 'supprimer':
        return `${r}await s.${camel(i.donnee)}.supprimer(${fiche(i.fiche)}.id);\n${r}noter(travail, ${chaine(i.donnee)}${this.groupeDe(i.donnee, fiche(i.fiche))});`;
      case 'refuser':
        return `${r}throw new Refus(enTexte(${valeur(i.message)}));`;
      // « noter … » : le terminal du serveur, sauf en production (lignes.ts).
      case 'noter':
        return `${r}noterHumalis(${chaine(lieuNote(i.ligne))}, [${i.valeurs.map((v) => `[${chaine(v.libelle)}, ${valeur(v.valeur)}${v.titre ? ', true' : ''}]`).join(', ')}]);`;
      case 'creer': {
        const liee = this.serveur.donnees.find((d) => d.nom === i.donnee)!;
        const groupe = liee.par && i.groupeDe ? [`${chaine(camel(liee.par))}: ${fiche(i.groupeDe)}[${chaine(camel(liee.par))}]`] : [];
        const valeurs = `{ ${[...i.valeurs.map((v) => `${chaine(camel(v.champ))}: ${valeur(v.valeur)}`), ...groupe].join(', ')} }`;
        const noterCree = `noter(travail, ${chaine(i.donnee)}${liee.par ? `, (${valeurs} as Record<string, unknown>)[${chaine(camel(liee.par))}]` : ''});`;
        if (!aCompleter(liee)) return `${r}await s.${camel(i.donnee)}.creer(${valeurs});\n${r}${noterCree}`;
        // Les calculs de la fiche créée (« somme prix de tarif par refs ») ne citent que des fiches permises : celles
        // que la personne pourrait lire, du groupe de la fiche créée (revue Codex : un devis de la boutique A
        // était calculé avec le tarif d'une boutique B).
        const groupeCree = liee.par !== undefined && liee.par !== 'compte' ? `valeurs[${chaine(camel(liee.par))}] as string | undefined` : undefined;
        const cercles = this.personne ? codeCercles(this.serveur, liee, groupeCree) : codeCerclesDuGroupe(this.serveur, liee, groupeCree);
        return `${r}{\n${r}  const valeurs: Record<string, unknown> = ${valeurs};\n${r}  const complete = await completer${pascal(i.donnee)}(valeurs, ${cercles});\n${r}  if ('erreur' in complete) throw new Refus(complete.erreur);\n${r}  await s.${camel(i.donnee)}.creer(complete.valeur);\n${r}  ${noterCree}\n${r}}`;
      }
      case 'email': {
        const a = i.a.genre === 'admins' ? 'await adressesDesAdmins()' : `enTexte(${valeur(i.a.valeur)})`;
        return `${r}{\n${r}  const envoi = { sujet: ${valeur(i.sujet)}, texte: ${valeur(i.texte)} };\n${r}  travail.apres.push(async () => { await emails.envoyer({ a: ${a}, ...envoi }); });\n${r}}`;
      }
      // « mettre a jour activite "livraison" pour commande.client » : après la transaction, comme une notification.
      case 'activite': {
        const groupe = i.a.genre === 'roles' && i.a.groupe ? `{ champ: ${chaine(camel(i.a.groupe.champ))}, valeur: ${fiche(i.a.groupe.fiche)}[${chaine(camel(i.a.groupe.champ))}] }` : 'undefined';
        const envoi = i.a.genre === 'compte'
          ? `const compte = enTexte(${valeur(i.a.valeur)});\n${r}  travail.apres.push(() => notifications.activiteAUnCompte(compte, ${chaine(i.nom)}));`
          : `const groupe = ${groupe};\n${r}  travail.apres.push(() => notifications.activiteADesRoles(${JSON.stringify(i.a.roles)}, ${chaine(i.nom)}, groupe));`;
        return `${r}{\n${r}  ${envoi}\n${r}}`;
      }
      case 'notification': {
        return `${r}{\n${r}  const envoi = ${contenuNotification(i)};\n${r}  ${destinataires(i)}\n${r}  travail.apres.push(() => notifier(envoi));\n${r}}`;
      }
      // Un autre service du projet : au nom de la personne quand il y en a une, sinon au nom de ce service.
      case 'appelService':
        return `${r}const ${repereNom(i.variable)}${fiche(i.variable)}: Record<string, unknown> = await services!.lire(${chaine(i.serveur)}, ${chaine('/api/' + i.route)}, enTexte(${valeur(i.id)}), ${this.appel()}).catch(refusDistant);`;
      case 'faireService':
        return `${r}Object.assign(${fiche(i.fiche)}, await services!.faire(${chaine(i.serveur)}, ${chaine('/api/' + i.route + '/faire/' + i.action + '/')} + encodeURIComponent(enTexte(${fiche(i.fiche)}.id)), { ${i.valeurs.map((v) => `${chaine(camel(v.nom))}: ${valeur(v.valeur)}`).join(', ')} }, ${this.appel()}).catch(refusDistant));`;
      // Le message s'écrit dans la boîte d'envoi, dans la transaction : il part seulement si tout a réussi.
      case 'signaler':
        return i.vers.length === 0
          ? `${r}// « ${i.message.replace(/\*\//g, '')} » : personne ne l'écoute dans le projet.`
          : `${r}for (const vers of ${JSON.stringify(i.vers)}) await s.humalisBoite!.creer({ vers, message: ${chaine(i.message)}, corps: JSON.parse(JSON.stringify(${fiche(i.fiche)})), essais: 0, prochain: 0, cree: Date.now() });\n${r}travail.apres.push(async () => services?.reveiller());`;
    }
  }

  /** Qui appelle : la personne de la requête, ou personne (une tâche, un message reçu, un paiement). */
  private appel(): string {
    return this.personne ? 'services!.appelDe(req)' : '{}';
  }
}

/** Les messages reçus d'autres services : chacun dans une transaction, avec son identifiant pour ne jamais le traiter deux fois. */
export function codeReceveurs(serveur: ServeurRI): string {
  return (serveur.projet?.receveurs ?? [])
    .map((r) => `    ${chaine(r.serveur + '|' + r.message)}: async (corps, id) => {
      const travail = nouveauTravail();
      await transaction(async (s) => {
        await noterRecu(s.humalisRecus!, id, ${chaine(r.serveur)}, ${chaine(r.message)});
        const ${repereNom(r.variable, r.ligne)}${fiche(r.variable)} = corps;
${new Ecriture(serveur).lignes(r.corps, '        ')}
      });
      terminer(travail${serveur.routes.some((x) => x.direct) ? ', direct.annonce' : ''});
    },
`)
    .join('');
}

const slug = (nom: string) => simplifier(nom).replace(/_/g, '-');

/** Les routes des actions d'une route : PATCH /faire/<action>/:id, le même chemin qu'une modification côté page. */
export function codeActions(serveur: ServeurRI, route: Route, variable: string): string {
  const donnee = serveur.donnees.find((d) => d.nom === route.donnee)!;
  const nomFiche = fiche(route.donnee);
  const groupe = donnee.par ? { champ: donnee.par, variable: nomFiche } : undefined;
  return (route.actions ?? [])
    .map((action) => `      // « ${action.nom} » : tout ou rien, dans une transaction.
      ${variable}.patch('/faire/${slug(action.nom)}/:id', ${gardeAction(action.qui)}, csrfMiddleware, async (req, res, next) => {
        try {
          const moi = (req as unknown as { user: Record<string, unknown> }).user;
          void moi;
${donnee.par ? `          const portee = porteeDe(moiDe(req), separation${variable}, undefined);
          if (!portee) {
            res.status(403).json({ erreur: REFUS_FICHES });
            return;
          }
` : ''}${action.parametres?.length ? `          const entrees = verifierEnvoi({ ${action.parametres.map((p) => `${chaine(camel(p.nom))}: ${schemaDe(p.type)}`).join(', ')} } as const, req.body, true);
          if ('erreur' in entrees) {
            res.status(400).json({ erreur: entrees.erreur });
            return;
          }
${action.parametres.map((p) => `          const ${repereNom(p.nom, action.ligne)}l_${camel(p.nom)} = entrees.valeur[${chaine(camel(p.nom))}];`).join('\n')}
` : ''}          const travail = nouveauTravail();
          const resultat = await transaction(async (s) => {
            const ${repereNom(route.donnee, action.ligne)}${nomFiche} = await s.${camel(route.donnee)}.trouver(String(req.params.id), true);
            if (!${nomFiche}${donnee.par ? ` || !dansPortee(${nomFiche}, portee)` : ''}) return null;
${new Ecriture(serveur, groupe, true).lignes(action.corps, '            ')}
            return ${nomFiche};
          });
          if (!resultat) {
            res.status(404).json({ erreur: introuvable('${route.donnee}') });
            return;
          }
          terminer(travail${serveur.routes.some((r) => r.direct) ? ', direct.annonce' : ''});
          res.json(resultat);
        } catch (erreur) {
          if (erreur instanceof Refus) res.status(400).json({ erreur: erreur.message });
          else next(erreur);
        }
      });
`)
    .join('');
}

/** Les résumés d'une route : GET /<nom>, avant « /:id ». */
export function codeResumes(route: Route, variable: string, separee: boolean): string {
  return (route.resumes ?? [])
    .map((resume) => `      ${variable}.get('/${slug(resume.nom)}', lecturePrivee, ${gardeAction(resume.qui)}, async (req, res, next) => {
        try {
${separee ? `          const portee = porteeDe(moiDe(req), separation${variable}, undefined);
          if (!portee) {
            res.status(403).json({ erreur: REFUS_FICHES });
            return;
          }
` : ''}          const lignes = ${lecture('stockages', route.donnee, resume.filtres, separee ? ['...portee.egal'] : [])};
          res.json(resumer(lignes, ${JSON.stringify(resume.calculs.map((c) => ({ nom: camel(c.nom), operation: c.operation, ...(c.champ !== undefined ? { champ: camel(c.champ) } : {}) })))}${resume.regroupePar !== undefined ? `, ${chaine(camel(resume.regroupePar))}` : ''}));
        } catch (erreur) {
          next(erreur);
        }
      });
`)
    .join('');
}

const libelleColonne = (nom: string) => (nom.charAt(0).toUpperCase() + nom.slice(1)).replace(/_/g, ' ');

/** Les documents d'une route : GET /documents/<nom>/:id/bon, avec les droits de la lecture. */
export function codeDocuments(serveur: ServeurRI, route: Route, variable: string, garde: string, separee: boolean, voir: string): string {
  const nomFiche = fiche(route.donnee);
  return (serveur.documents ?? [])
    .filter((d) => d.donnee === route.donnee)
    .map((document) => `      ${variable}.get('/documents/${slug(document.nom)}/:id/bon', lecturePrivee, ${garde}, async (req, res, next) => {
        try {
${voir}          const ${nomFiche} = ${separee ? 'visible' : `await stockages.${camel(route.donnee)}.trouver(String(req.params.id))`};
          if (!${nomFiche}) {
            res.status(404).json({ erreur: introuvable('${route.donnee}') });
            return;
          }
          const fichier = await creerDocument(${chaine(document.nom)}, [${document.lignes.map((l) => {
            if (l.genre !== 'tableau') return `{ genre: '${l.genre}' as const, texte: ${valeur(l.valeur)} }`;
            const par = serveur.donnees.find((d) => d.nom === l.donnee)?.par;
            const groupe = l.groupeDe !== undefined && par !== undefined ? [`${chaine(camel(par))}: ${fiche(l.groupeDe)}[${chaine(camel(par))}]`] : [];
            const cellules = l.colonnes.map((c) => `ligne[${chaine(c === 'id' ? 'id' : camel(c))}]`).join(', ');
            return `{ genre: 'tableau' as const, colonnes: ${JSON.stringify(l.colonnes.map(libelleColonne))}, rangees: ${lecture('stockages', l.donnee, l.filtres, groupe)}.map((ligne) => [${cellules}]) }`;
          }).join(', ')}]);
          res.set('Content-Type', 'application/pdf');
          res.set('Content-Disposition', 'attachment; filename="${slug(document.nom)}.pdf"');
          res.send(fichier);
        } catch (erreur) {
          next(erreur);
        }
      });
`)
    .join('');
}

/** src/humalis/document.ts */
export const DOCUMENT = String.raw`import PDFDocument from 'pdfkit';
import { enTexte } from './logique.js';

/** Produit par Humalis : un document PDF écrit dans le programme. Les valeurs ne sont jamais interprétées. */
const espaces = (texte: string) => texte.replace(/[  ]/g, ' ');

type LigneDocument = { genre: 'titre' | 'texte'; texte: string } | { genre: 'tableau'; colonnes: string[]; rangees: unknown[][] };

const enClair = (valeur: unknown) => (typeof valeur === 'number' ? espaces(valeur.toLocaleString('fr-FR')) : espaces(enTexte(valeur)));

/** Un tableau simple : colonnes égales, une nouvelle page si la rangée ne tient plus. */
function dessinerTableau(doc: PDFKit.PDFDocument, colonnes: string[], rangees: unknown[][]): void {
  const gauche = doc.page.margins.left;
  const largeur = (doc.page.width - gauche - doc.page.margins.right) / Math.max(colonnes.length, 1);
  const dessiner = (cellules: string[], gras: boolean) => {
    doc.font(gras ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
    const hauteur = Math.max(...cellules.map((c) => doc.heightOfString(c, { width: largeur - 8 }))) + 8;
    if (doc.y + hauteur > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const haut = doc.y;
    cellules.forEach((c, i) => doc.text(c, gauche + i * largeur + 4, haut + 4, { width: largeur - 8 }));
    doc.moveTo(gauche, haut + hauteur).lineTo(gauche + largeur * colonnes.length, haut + hauteur).strokeColor('#cccccc').stroke();
    doc.x = gauche;
    doc.y = haut + hauteur;
  };
  dessiner(colonnes, true);
  for (const rangee of rangees) dessiner(rangee.map(enClair), false);
  doc.moveDown(0.5);
}

export function creerDocument(nom: string, lignes: LigneDocument[]): Promise<Buffer> {
  return new Promise((resoudre, rejeter) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: espaces(enTexte(nom)) } });
    const morceaux: Buffer[] = [];
    doc.on('data', (morceau: Buffer) => morceaux.push(morceau));
    doc.on('end', () => resoudre(Buffer.concat(morceaux)));
    doc.on('error', rejeter);
    for (const ligne of lignes) {
      if (ligne.genre === 'tableau') {
        dessinerTableau(doc, ligne.colonnes, ligne.rangees);
        continue;
      }
      doc.font(ligne.genre === 'titre' ? 'Helvetica-Bold' : 'Helvetica').fontSize(ligne.genre === 'titre' ? 20 : 12).text(espaces(ligne.texte));
      doc.moveDown(ligne.genre === 'titre' ? 1 : 0.5);
    }
    doc.end();
  });
}
`;

const CENTS = (champ: string) => `Math.round(Number(fiche[${chaine(camel(champ))}]) * 100)`;

/** POST /payer/<champ>/:id : le montant vient de la fiche, jamais de la page. */
export function codePaiements(route: Route, variable: string, garde: string, voir: string, separee: boolean, donnee: string): string {
  return (route.payables ?? [])
    .map((champ) => `      ${variable}.post('/payer/${slug(champ)}/:id', ${garde}, csrfMiddleware, async (req, res, next) => {
        try {
${voir}          const fiche = ${separee ? 'visible' : `await stockages.${donnee}.trouver(String(req.params.id))`};
          if (!fiche) {
            res.status(404).json({ erreur: introuvable('${route.donnee}') });
            return;
          }
          if (fiche.paye === true) {
            res.status(409).json({ erreur: 'déjà payé' });
            return;
          }
          const resultat = await paiements.creer({ donnee: ${chaine(route.donnee)}, champ: ${chaine(champ)}, id: fiche.id, centimes: ${CENTS(champ)}, retour: (req.body as { retour?: unknown } | undefined)?.retour });
          if ('erreur' in resultat) res.status(resultat.statut).json({ erreur: resultat.erreur });
          else res.json(resultat);
        } catch (erreur) {
          next(erreur);
        }
      });
`)
    .join('');
}

/** Ce que fait un paiement confirmé, donnée par donnée. Le webhook rejoué ne refait rien : « paye » est lu sous verrou. */
export function codeSurPaiement(serveur: ServeurRI): string {
  const lignes = serveur.routes.filter((r) => r.apresPaiement).map((route) => {
    const nom = fiche(route.donnee);
    const donnee = serveur.donnees.find((d) => d.nom === route.donnee)!;
    return `        ${chaine(route.donnee)}: async (travail, s, id, champ, montant) => {
          const ${repereNom(route.donnee, route.ligneApresPaiement)}${nom} = await s.${camel(route.donnee)}.trouver(id, true);
          // De l'argent est arrivé mais la fiche ne peut pas être marquée payée : ce n'est jamais passé sous silence.
          // L'erreur annule tout, le webhook répond 500, et le relais de paiement doit rappeler (et le garder dans son
          // journal) : corriger la fiche suffit pour que le prochain essai l'enregistre.
          if (!${nom}) throw new Error('paiement de ' + montant / 100 + ' reçu pour « ${route.donnee} » ' + id + ', mais cette fiche a disparu : à rembourser ou à traiter à la main');
          if (${nom}.paye === true) return;
          const attendu = Math.round(Number(${nom}[champ]) * 100);
          if (attendu !== montant) throw new Error('paiement de ' + montant / 100 + ' reçu pour « ${route.donnee} » ' + id + ', mais la fiche demande ' + attendu / 100 + ' : corrige « ' + champ + ' » ou rembourse');
          Object.assign(${nom}, await s.${camel(route.donnee)}.modifier(id, { paye: true }));
          noter(travail, ${chaine(route.donnee)}${donnee.par ? `, ${nom}[${chaine(camel(donnee.par))}]` : ''});
${new Ecriture(serveur, donnee.par ? { champ: donnee.par, variable: nom } : undefined).lignes(route.apresPaiement!, '          ')}
        },`;
  });
  return `      surPaiement = {
${lignes.join('\n')}
      };
`;
}

/** .env.exemple : le relais de paiement. */
export const ENV_PAIEMENTS = `# Les paiements (« paiements ») : un relais de paiement, le vôtre, qui parle à votre service de paiement.
# Rien par défaut. Le serveur lui demande une page de paiement (POST, JSON signé) et attend sa confirmation,
# signée de la même façon, sur /paiements/webhook. Le contrat est décrit dans le guide (« Les paiements »).
HUMALIS_PAIEMENT_ADRESSE=
# Le secret partagé avec le relais, 32 caractères au moins : il signe les deux sens.
HUMALIS_PAIEMENT_SECRET=
# La devise des montants, en trois lettres (eur par défaut).
HUMALIS_PAIEMENT_DEVISE=
`;

/** src/humalis/paiements.ts */
export const PAIEMENTS = String.raw`import { createHmac, timingSafeEqual } from 'node:crypto';
import express, { type RequestHandler } from 'express';

/**
 * Produit par Humalis : les paiements, par un relais choisi dans le .env. La page ne donne jamais de montant, et
 * rien n'est marqué payé sans une confirmation dont la signature est vérifiée.
 *
 * Le contrat, dans les deux sens : un corps JSON et l'en-tête « X-Humalis-Signature: t=<secondes>,v1=<signature> »,
 * où la signature est le HMAC-SHA256, en hexadécimal, de « <secondes>.<corps> » avec HUMALIS_PAIEMENT_SECRET.
 *   - le serveur demande : POST HUMALIS_PAIEMENT_ADRESSE { reference, montant, devise, libelle, retour } ;
 *     le relais répond { url } : la page de paiement, en https ;
 *   - le relais confirme : POST /paiements/webhook { evenement: "paye" | "echoue", reference, montant, devise }.
 * Le montant est en centimes ; la référence est à rendre telle quelle.
 */
export type SurPaiement<T, S> = Record<string, (travail: T, s: S, id: string, champ: string, montant: number) => Promise<void>>;

const TOLERANCE_SECONDES = 5 * 60;

const reglages = (env: Record<string, string | undefined>) => {
  const adresse = (env.HUMALIS_PAIEMENT_ADRESSE ?? '').trim();
  const secret = (env.HUMALIS_PAIEMENT_SECRET ?? '').trim();
  const manque = [!/^https:\/\/[^/\s]|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(adresse) && 'HUMALIS_PAIEMENT_ADRESSE', secret.length < 32 && 'HUMALIS_PAIEMENT_SECRET (32 caractères au moins)'].filter(Boolean);
  return { adresse, secret, devise: (env.HUMALIS_PAIEMENT_DEVISE ?? 'eur').trim().toLowerCase(), manque };
};

export const signer = (secret: string, corps: string, secondes = Math.floor(Date.now() / 1000)) =>
  't=' + secondes + ',v1=' + createHmac('sha256', secret).update(secondes + '.' + corps).digest('hex');

/** Vrai si l'en-tête signe ce corps, avec ce secret, il y a moins de cinq minutes. */
export function signatureValable(secret: string, corps: string, entete: unknown, maintenant = Math.floor(Date.now() / 1000)): boolean {
  if (typeof entete !== 'string') return false;
  const parties = new Map(entete.split(',').map((p) => [p.slice(0, p.indexOf('=')).trim(), p.slice(p.indexOf('=') + 1).trim()] as const));
  const secondes = Number(parties.get('t'));
  const recue = parties.get('v1') ?? '';
  if (!Number.isInteger(secondes) || Math.abs(maintenant - secondes) > TOLERANCE_SECONDES || !/^[0-9a-f]{64}$/.test(recue)) return false;
  const attendue = createHmac('sha256', secret).update(secondes + '.' + corps).digest();
  return timingSafeEqual(attendue, Buffer.from(recue, 'hex'));
}

const adresseDuSite = () => {
  const adresse = (process.env.HUMALIS_ADRESSE_SITE ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^/]|^http:\/\/localhost(:\d+)?$/.test(adresse) ? adresse : null;
};

/** La référence rendue par le relais : opaque pour lui, relue seulement après une signature vérifiée. */
const enReference = (donnee: string, id: string, champ: string) => Buffer.from(JSON.stringify([donnee, id, champ])).toString('base64url');
const deReference = (reference: unknown): { donnee: string; id: string; champ: string } | null => {
  if (typeof reference !== 'string') return null;
  try {
    const [donnee, id, champ] = JSON.parse(Buffer.from(reference, 'base64url').toString()) as unknown[];
    return typeof donnee === 'string' && typeof id === 'string' && typeof champ === 'string' ? { donnee, id, champ } : null;
  } catch {
    return null;
  }
};

export function creerPaiements<T, S>({ surConfirme, surErreur, env = process.env, transport = globalThis.fetch }: { surConfirme: (donnee: string, id: string, champ: string, montant: number) => Promise<void>; surErreur?: (erreur: unknown) => void; env?: Record<string, string | undefined>; transport?: typeof globalThis.fetch }) {
  return {
    async creer({ donnee, champ, id, centimes, retour }: { donnee: string; champ: string; id: string; centimes: number; retour: unknown }): Promise<{ url: string } | { erreur: string; statut: number }> {
      const r = reglages(env);
      const site = adresseDuSite();
      if (r.manque.length || !site) return { erreur: 'les paiements ne sont pas réglés sur ce serveur : renseignez ' + [...r.manque, ...(site ? [] : ['HUMALIS_ADRESSE_SITE'])].join(', ') + ' dans le .env', statut: 503 };
      if (!Number.isInteger(centimes) || centimes <= 0) return { erreur: 'ce montant ne peut pas être payé', statut: 400 };
      // Seulement un chemin de ce site : un lien de retour ne doit jamais mener ailleurs.
      const chemin = typeof retour === 'string' && /^\/(?!\/)/.test(retour) ? retour : '/';
      const corps = JSON.stringify({ reference: enReference(donnee, String(id), champ), montant: centimes, devise: r.devise, libelle: donnee, retour: site + chemin });
      // Un refus du relais (secret faux, service fermé) n'est pas un refus de la personne : il reste dans le journal,
      // et la page reçoit 502, jamais un 401 qui lui ferait croire sa session finie.
      try {
        const reponse = await transport(r.adresse, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json', 'x-humalis-signature': signer(r.secret, corps) },
          body: corps,
          signal: AbortSignal.timeout(15_000),
        });
        if (!reponse.ok) throw new Error('le relais a répondu ' + reponse.status);
        const { url } = (await reponse.json()) as { url?: unknown };
        if (typeof url !== 'string' || !/^https:\/\/[^/\s]|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) throw new Error("le relais n'a pas rendu d'adresse https");
        return { url };
      } catch (erreur) {
        console.error('Le relais de paiement a refusé de commencer un paiement :', erreur instanceof Error ? erreur.message : erreur);
        return { erreur: "le paiement n'a pas pu commencer : le service de paiement a refusé la demande", statut: 502 };
      }
    },

    /** Le relais confirme ici. Le corps brut est nécessaire pour vérifier la signature. */
    webhook: [
      express.raw({ type: '*/*', limit: '1mb' }),
      (async (req, res) => {
        const r = reglages(env);
        if (r.manque.length) {
          res.status(503).json({ erreur: 'les paiements ne sont pas réglés sur ce serveur' });
          return;
        }
        const brut = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
        if (!signatureValable(r.secret, brut, req.headers['x-humalis-signature'])) {
          res.status(400).json({ erreur: 'signature invalide' });
          return;
        }
        let evenement: { evenement?: unknown; reference?: unknown; montant?: unknown; devise?: unknown };
        try {
          evenement = JSON.parse(brut) as typeof evenement;
        } catch {
          res.status(400).json({ erreur: 'corps illisible' });
          return;
        }
        const cible = deReference(evenement.reference);
        if (!cible) {
          res.status(400).json({ erreur: 'référence inconnue' });
          return;
        }
        // Un moyen de paiement différé (virement, prélèvement) peut échouer après coup : la fiche reste impayée.
        if (evenement.evenement === 'echoue') {
          console.error('Un paiement a échoué pour « ' + cible.donnee + ' » ' + cible.id + ' : la fiche reste impayée.');
        } else if (evenement.evenement === 'paye') {
          if (typeof evenement.montant !== 'number' || !Number.isInteger(evenement.montant) || String(evenement.devise ?? '').toLowerCase() !== r.devise) {
            res.status(400).json({ erreur: 'montant ou devise illisible' });
            return;
          }
          try {
            await surConfirme(cible.donnee, cible.id, cible.champ, evenement.montant);
          } catch (erreur) {
            // Une erreur ici : rien n'a été écrit, et le relais doit rappeler.
            console.error('Un paiement n\'a pas été enregistré :', erreur instanceof Error ? erreur.message : erreur);
            // « quand une erreur arrive », s'il est écrit dans le serveur : le journal seul ne prévient personne.
            try {
              surErreur?.(erreur);
            } catch { /* Ce rapport ne doit jamais empêcher de répondre au relais. */ }
            res.status(500).end();
            return;
          }
        } else {
          res.status(400).json({ erreur: 'événement inconnu' });
          return;
        }
        res.json({ recu: true });
      }) as RequestHandler,
    ] as RequestHandler[],
  };
}
`;

/** Les tâches : lancées seulement par demarrer.ts, jamais dans les tests. */
export function codeTaches(serveur: ServeurRI): string {
  if (!serveur.taches?.length) return '';
  const taches = serveur.taches.map((t) => `        {
          nom: ${chaine(t.nom)},
          frequence: ${JSON.stringify(t.frequence)},
          travail: async (travail, s) => {
${new Ecriture(serveur).lignes(t.corps, '            ')}
          },
        },`);
  return `      if (reclamerTache) {
        lancerTaches<typeof stockages>([
${taches.join('\n')}
        ], reclamerTache, transaction${serveur.routes.some((r) => r.direct) ? ', direct.annonce' : ''});
      }
`;
}

/** src/humalis/logique.ts */
export const LOGIQUE = String.raw`import type pg from 'pg';
import { journalMemoire, type Stockage } from './stockage.js';

/** Produit par Humalis : ce qui s'exécute sur le serveur, en transaction, et les tâches planifiées. */
export class Refus extends Error {}

export interface Travail {
  ecrites: Map<string, Set<string>>;
  apres: (() => Promise<unknown>)[];
}
export const nouveauTravail = (): Travail => ({ ecrites: new Map(), apres: [] });

export function noter(travail: Travail, donnee: string, groupe?: unknown): void {
  const groupes = travail.ecrites.get(donnee) ?? new Set<string>();
  if (typeof groupe === 'string') groupes.add(groupe);
  travail.ecrites.set(donnee, groupes);
}

/** Une fois tout validé : on annonce, et ce qui part vers l'extérieur ne fait plus rien échouer. */
export function terminer(travail: Travail, annoncer?: (cle: string) => void): void {
  if (annoncer) {
    for (const [donnee, groupes] of travail.ecrites) {
      annoncer(donnee);
      for (const groupe of groupes) annoncer(donnee + '|' + groupe);
    }
  }
  for (const envoi of travail.apres) envoi().catch((erreur: unknown) => console.error('Un envoi du serveur a échoué :', erreur instanceof Error ? erreur.message : erreur));
}

export const enTexte = (valeur: unknown) => (valeur === null || valeur === undefined ? '' : String(valeur));
export const estVide = (valeur: unknown) => valeur === null || valeur === undefined || valeur === '' || (Array.isArray(valeur) && valeur.length === 0);
/** « somme de … », « nombre de … » : une liste vide donne 0. */
export function agreger(operation: string, lignes: Record<string, unknown>[], champ?: string): number {
  if (operation === 'nombre') return lignes.length;
  const valeurs = lignes.map((l) => Number(l[champ as string])).filter(Number.isFinite);
  if (valeurs.length === 0) return 0;
  if (operation === 'minimum') return Math.min(...valeurs);
  if (operation === 'maximum') return Math.max(...valeurs);
  const somme = valeurs.reduce((a, b) => a + b, 0);
  return operation === 'moyenne' ? somme / valeurs.length : somme;
}

/** Un résumé : une fiche de calculs, ou une par valeur du champ « regroupe par ». */
export function resumer(lignes: Record<string, unknown>[], calculs: { nom: string; operation: string; champ?: string }[], regroupePar?: string): unknown {
  const calculer = (groupe: Record<string, unknown>[]) => Object.fromEntries(calculs.map((c) => [c.nom, agreger(c.operation, groupe, c.champ)]));
  if (regroupePar === undefined) return calculer(lignes);
  const groupes = new Map<unknown, Record<string, unknown>[]>();
  for (const ligne of lignes) groupes.set(ligne[regroupePar], [...(groupes.get(ligne[regroupePar]) ?? []), ligne]);
  return [...groupes].map(([valeur, groupe]) => ({ [regroupePar]: valeur, ...calculer(groupe) }));
}

export const contient = (liste: unknown, valeur: unknown) => (Array.isArray(liste) ? liste.includes(valeur) : typeof liste === 'string' && liste.includes(enTexte(valeur)));

export type Transaction<S> = <T>(corps: (s: S) => Promise<T>) => Promise<T>;

/**
 * Sans base : une transaction à la fois. Annulée, elle défait seulement ses propres écritures (journalMemoire),
 * jamais celles qu'une autre requête a faites pendant ce temps.
 */
export function transactionMemoire<S extends Record<string, Stockage>>(stockages: S): Transaction<S> {
  let file: Promise<unknown> = Promise.resolve();
  return <T>(corps: (s: S) => Promise<T>) => {
    const suite = file.then(async () => {
      const annulations: (() => void)[] = [];
      try {
        return await journalMemoire.run(annulations, () => corps(stockages));
      } catch (erreur) {
        for (const annuler of annulations.reverse()) annuler();
        throw erreur;
      }
    });
    file = suite.catch(() => undefined);
    return suite;
  };
}

export function transactionPostgres<S>(pool: pg.Pool, fabriquer: (client: pg.PoolClient) => S): Transaction<S> {
  return async <T>(corps: (s: S) => Promise<T>) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const resultat = await corps(fabriquer(client));
      await client.query('COMMIT');
      return resultat;
    } catch (erreur) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw erreur;
    } finally {
      client.release();
    }
  };
}

export type Frequence = { genre: 'heure' } | { genre: 'jour'; heure: number; minute: number } | { genre: 'semaine'; jour: number; heure: number; minute: number };
/** rendre : une tâche qui a échoué rend sa période, et le tour suivant (une minute plus tard) la retente. */
export type Reclamer = ((nom: string, periode: string) => Promise<boolean>) & { rendre?: (nom: string, periode: string) => Promise<void> };

const deux = (n: number) => String(n).padStart(2, '0');

/** La période en cours, ou null hors de l'heure qui suit le moment prévu : un serveur qui redémarre rattrape, sans excès. */
export function periodeDe(frequence: Frequence, maintenant: Date): string | null {
  const jour = maintenant.getFullYear() + '-' + deux(maintenant.getMonth() + 1) + '-' + deux(maintenant.getDate());
  if (frequence.genre === 'heure') return jour + 'T' + deux(maintenant.getHours());
  if (frequence.genre === 'semaine' && maintenant.getDay() !== frequence.jour) return null;
  const minutes = maintenant.getHours() * 60 + maintenant.getMinutes();
  const prevu = frequence.heure * 60 + frequence.minute;
  return minutes >= prevu && minutes < prevu + 60 ? jour : null;
}

export function reclamerMemoire(): Reclamer {
  const faites = new Map<string, string>();
  const prendre = async (nom: string, periode: string) => {
    if (faites.get(nom) === periode) return false;
    faites.set(nom, periode);
    return true;
  };
  return Object.assign(prendre, {
    rendre: async (nom: string, periode: string) => {
      if (faites.get(nom) === periode) faites.delete(nom);
    },
  });
}

/** Plusieurs serveurs : la base donne chaque période à un seul d'entre eux. */
export function reclamerPostgres(pool: pg.Pool): Reclamer {
  let prete: Promise<unknown> | undefined;
  const prendre = async (nom: string, periode: string) => {
    await (prete ??= pool.query('CREATE TABLE IF NOT EXISTS humalis_taches (nom TEXT PRIMARY KEY, periode TEXT NOT NULL)'));
    const { rowCount } = await pool.query('INSERT INTO humalis_taches (nom, periode) VALUES ($1, $2) ON CONFLICT (nom) DO UPDATE SET periode = EXCLUDED.periode WHERE humalis_taches.periode <> EXCLUDED.periode', [nom, periode]);
    return (rowCount ?? 0) > 0;
  };
  return Object.assign(prendre, {
    rendre: async (nom: string, periode: string) => {
      await pool.query("UPDATE humalis_taches SET periode = '' WHERE nom = $1 AND periode = $2", [nom, periode]);
    },
  });
}

export interface Tache<S> {
  nom: string;
  frequence: Frequence;
  travail: (travail: Travail, s: S) => Promise<void>;
}

export function lancerTaches<S>(taches: Tache<S>[], reclamer: Reclamer, transaction: Transaction<S>, annoncer?: (cle: string) => void): void {
  const tourner = async () => {
    for (const tache of taches) {
      let prise: string | null = null;
      try {
        const periode = periodeDe(tache.frequence, new Date());
        if (periode === null || !(await reclamer(tache.nom, periode))) continue;
        prise = periode;
        const travail = nouveauTravail();
        await transaction((s) => tache.travail(travail, s));
        terminer(travail, annoncer);
      } catch (erreur) {
        console.error('La tâche « ' + tache.nom + ' » a échoué' + (prise !== null ? ' : elle sera retentée dans une minute' : '') + ' :', erreur instanceof Error ? erreur.message : erreur);
        // Rien n'a été fait (la transaction est annulée) : la période revient, pour un nouvel essai tant qu'elle dure.
        if (prise !== null) await reclamer.rendre?.(tache.nom, prise).catch(() => undefined);
      }
    }
  };
  void tourner();
  setInterval(() => void tourner(), 60_000).unref();
}
`;
