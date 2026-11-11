/**
 * Le serveur du temps réel : discussions, présence, appels et salles. Ces routes ne sont pas des routes
 * de données ordinaires : les droits dépendent de la conversation, et une lecture marque les messages lus.
 * Elles lisent et écrivent dans les tables ordinaires (mémoire ou PostgreSQL) et annoncent leurs changements
 * par le canal « en direct ». Une réunion passe par LiveKit : seuls les jetons et la modération passent ici.
 */
import type { ServeurRI } from '../../ri/types.js';
import { slugTempsReel } from '../../parser/temps-reel.js';

/** LiveKit : le SDK du serveur, publié avant le 1er novembre 2026. */
export const VERSION_LIVEKIT_SERVEUR = '2.19.2';

/** Le programme parle de temps réel. */
export function avecTempsReel(serveur: ServeurRI): boolean {
  return serveur.routes.some((r) => r.interne !== undefined);
}

/** Le serveur tel que le reste du générateur le voit : sans les routes et les réponses du temps réel. */
export function serveurOrdinaire(serveur: ServeurRI): ServeurRI & { tempsReel?: boolean } {
  if (!avecTempsReel(serveur)) return serveur;
  return { ...serveur, tempsReel: true, routes: serveur.routes.filter((r) => r.interne === undefined), donnees: serveur.donnees.filter((d) => !d.reponseSeule) };
}

export const avecLiveKit = (serveur: ServeurRI): boolean => serveur.routes.some((r) => r.interne === 'salles');

const camel = (nom: string): string => nom.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

/** « membre » : le rôle des comptes sans rôle particulier, « user » pour le pack. */
const roleDuPack = (role: string): string => (role === 'membre' ? 'user' : role);

/** Les réglages écrits dans le programme, en JSON. */
function reglages(serveur: ServeurRI): string {
  const appels = serveur.routes.some((r) => r.interne === 'appels');
  const presence = serveur.routes.some((r) => r.interne === 'presence');
  return JSON.stringify({
    discussions: (serveur.discussions ?? []).map((d) => ({ nom: d.nom, cle: slugTempsReel(d.nom), entre: d.entre.map(roleDuPack) })),
    salles: (serveur.salles ?? []).map((s) => ({ nom: s.nom, pour: s.pour.map(roleDuPack), animateurs: (s.animateurs ?? []).map(roleDuPack) })),
    appels,
    salle: avecLiveKit(serveur),
    presence,
  });
}

/** Ce qui se met dans creerServeur : le montage des routes. */
export function codeMontageTempsReel(serveur: ServeurRI): string {
  const tables = serveur.donnees
    .filter((d) => !d.reponseSeule && serveur.routes.some((r) => r.interne !== undefined && r.donnee === d.nom))
    .map((d) => d.nom);
  const pour = new Set([...tables, ...serveur.donnees.filter((d) => !d.reponseSeule && /^(lecture_|ecriture_|presence_vue$)/.test(d.nom)).map((d) => d.nom)]);
  const liste = [...pour].map((n) => `${JSON.stringify(n)}: stockages.${camel(n)}`).join(', ');
  return `      monterTempsReel(app, { acces, usersStore, secret: jwtSecret, tables: { ${liste} }, reglages: ${reglages(serveur)} });\n`;
}

export const IMPORT_TEMPS_REEL = "import { monterTempsReel } from './humalis/temps-reel.js';\n";

export const ENV_TEMPS_REEL = `# Les réunions et les appels (LiveKit, hébergé par vous ou chez LiveKit Cloud).
# Sans ces trois variables, rejoindre une réunion répond que le service n'est pas réglé.
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
# L'adresse publique de ce serveur, pour les liens des pièces jointes (sinon, celle de la requête).
HUMALIS_ADRESSE=`;

/** humalis/temps-reel.ts. */
export function tempsReelTs(serveur: ServeurRI): string {
  return (avecLiveKit(serveur) ? "import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';\n" : '') + CORPS.replace('/*LIVEKIT*/', avecLiveKit(serveur) ? LIVEKIT : LIVEKIT_ABSENT);
}

const LIVEKIT_ABSENT = `
function monterSalles(): void {}
`;

const LIVEKIT = String.raw`
/** Une salle du programme ou celle d'un appel, et ce que cette personne peut y faire. */
function monterSalles(app: Application, o: Options, voir: (req: Request) => Moi, appels: Stockage | undefined): void {
  const { acces, reglages } = o;
  const adresse = () => process.env.LIVEKIT_URL ?? '';
  const service = () => new RoomServiceClient(adresse().replace(/^ws/, 'http'), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
  const regle = () => Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
  const FERME = "Les réunions ne sont pas réglées sur ce serveur : renseignez LIVEKIT_URL, LIVEKIT_API_KEY et LIVEKIT_API_SECRET.";
  const salleDe = (nom: string) => reglages.salles.find((s) => s.nom === nom);
  const nomLiveKit = (nom: string) => (nom.startsWith('appel-') ? nom : 'salle-' + createHash('sha256').update(nom).digest('hex').slice(0, 32));
  const annoncer = () => direct.annonce('tr:salles');

  /** Rend le droit de cette personne sur la salle ; undefined : elle n'y entre pas. */
  async function droit(moi: Moi, nom: string, pourEntrer = false): Promise<{ animateur: boolean; video: boolean } | undefined> {
    if (nom.startsWith('appel-')) {
      if (!appels) return undefined;
      const [appel] = await appels.lister({ egal: { salle: nom } });
      if (!appel || (appel.auteur !== moi.id && appel.appele !== moi.id) || (pourEntrer && appel.etat === 'fini')) return undefined;
      return { animateur: false, video: appel.video === true };
    }
    const salle = salleDe(nom);
    if (!salle) return undefined;
    const admin = moi.role === 'admin';
    const animateur = admin || salle.animateurs.includes(moi.role ?? '');
    if (!admin && !animateur && !salle.pour.includes(moi.role ?? '')) return undefined;
    return { animateur, video: true };
  }

  const texteDe = (valeur: unknown): string => (typeof valeur === 'string' ? valeur : valeur && typeof valeur === 'object' && 'id' in valeur ? String((valeur as { id: unknown }).id) : '');

  app.post('/api/salles_jeton', ...acces.connecte, async (req, res, next) => {
    try {
      const moi = voir(req);
      const nom = texteDe((req.body as { salle?: unknown }).salle);
      const permis = await droit(moi, nom, true);
      if (!permis) {
        res.status(403).json({ erreur: "Vous n'avez pas accès à cette réunion." });
        return;
      }
      if (!regle()) {
        res.status(503).json({ erreur: FERME });
        return;
      }
      const jeton = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
        identity: moi.id,
        name: nomDe(moi),
        metadata: JSON.stringify({ animateur: permis.animateur }),
        ttl: '4h',
      });
      jeton.addGrant({ roomJoin: true, room: nomLiveKit(nom), canPublish: true, canSubscribe: true, canPublishData: true, canUpdateOwnMetadata: true });
      res.status(201).json({ id: nom, adresse: adresse(), jeton: await jeton.toJwt(), video: permis.video });
    } catch (erreur) {
      next(erreur);
    }
  });

  // Deux routes pour la même réponse : une page peut lire la liste des participants et son propre état, chacune avec son écoute.
  for (const route of ['/api/salles_vue', '/api/salles_moi']) app.get(route + '/direct', ...acces.connecte, (req, res) => ecouter('tr:salles', req, res, voir(req)));

  app.get(['/api/salles_vue/:salle', '/api/salles_moi/:salle'], ...acces.connecte, async (req, res, next) => {
    try {
      const moi = voir(req);
      const nom = String(req.params.salle);
      if (!(await droit(moi, nom))) {
        res.status(403).json({ erreur: "Vous n'avez pas accès à cette réunion." });
        return;
      }
      res.set('Cache-Control', 'no-store');
      if (!regle()) {
        res.json({ id: nom, microCoupe: false, cameraCoupee: false, participants: [] });
        return;
      }
      const presents = await service().listParticipants(nomLiveKit(nom)).catch(() => []);
      const participants = presents.map((p) => {
        const piste = (source: number) => p.tracks.find((t) => t.source === source);
        const actif = (source: number) => {
          const t = piste(source);
          return t !== undefined && !t.muted;
        };
        let animateur = false;
        try {
          animateur = (JSON.parse(p.metadata || '{}') as { animateur?: boolean }).animateur === true;
        } catch { /* Des métadonnées illisibles : pas animateur. */ }
        return { id: p.identity, nom: p.name || p.identity, micro: actif(TrackSource.MICROPHONE), camera: actif(TrackSource.CAMERA), ecran: actif(TrackSource.SCREEN_SHARE), main: p.attributes?.main === '1', animateur };
      });
      // Un ordre stable : la liste ne saute pas d'une lecture à l'autre.
      participants.sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id));
      const moiDansLaSalle = participants.find((p) => p.id === moi.id);
      res.json({ id: nom, microCoupe: moiDansLaSalle ? !moiDansLaSalle.micro : false, cameraCoupee: moiDansLaSalle ? !moiDansLaSalle.camera : false, participants });
    } catch (erreur) {
      next(erreur);
    }
  });

  app.post('/api/salles_geste', ...acces.connecte, async (req, res, next) => {
    try {
      const moi = voir(req);
      const corps = req.body as { salle?: unknown; participant?: unknown; geste?: unknown };
      const nom = texteDe(corps.salle);
      const geste = texteDe(corps.geste);
      const permis = await droit(moi, nom);
      if (!permis) {
        res.status(403).json({ erreur: "Vous n'avez pas accès à cette réunion." });
        return;
      }
      if (geste !== 'etat') {
        if (!permis.animateur) {
          res.status(403).json({ erreur: 'Seule une personne qui anime la réunion peut faire cela.' });
          return;
        }
        if (!regle()) {
          res.status(503).json({ erreur: FERME });
          return;
        }
        const cible = texteDe(corps.participant);
        const piece = nomLiveKit(nom);
        if (geste === 'exclure') await service().removeParticipant(piece, cible);
        else if (geste === 'couper_micro') {
          const personne = await service().getParticipant(piece, cible);
          const micro = personne.tracks.find((t) => t.source === TrackSource.MICROPHONE);
          if (micro) await service().mutePublishedTrack(piece, cible, micro.sid, true);
        } else {
          res.status(400).json({ erreur: 'Geste inconnu.' });
          return;
        }
      }
      annoncer();
      // LiveKit peut prendre un instant pour refléter le geste : une seconde annonce rattrape l'état.
      if (geste !== 'etat') setTimeout(annoncer, 1500).unref();
      res.status(201).json({ id: nom, salle: nom, participant: '', geste });
    } catch (erreur) {
      next(erreur);
    }
  });
}
`;

const CORPS = String.raw`import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import express, { type Request, type RequestHandler, type Response } from 'express';
import { direct } from './direct.js';
import type { Stockage } from './stockage.js';

/**
 * Produit par Humalis : discussions, présence, appels et réunions. Les droits dépendent de la conversation :
 * chaque lecture et chaque envoi les vérifient ici. Le canal « en direct » annonce un changement à chaque
 * personne concernée, sans donnée ; la page relit ensuite sa route.
 */
interface Moi { id: string; email?: string; role?: string; nom?: string; [cle: string]: unknown }
interface Discussion { nom: string; cle: string; entre: string[] }
interface Salle { nom: string; pour: string[]; animateurs: string[] }
interface UsersLus { findById(id: string): unknown; findByEmail(email: string): unknown }
type Application = ReturnType<typeof express.Router>;
interface Options {
  acces: { connecte: RequestHandler[] };
  usersStore: UsersLus;
  secret: string;
  tables: Record<string, Stockage>;
  reglages: { discussions: Discussion[]; salles: Salle[]; appels: boolean; salle: boolean; presence: boolean };
}

const MESSAGES_AU_PLUS = 200;
const TEXTE_AU_PLUS = 8000;
const PIECE_AU_PLUS = 10 * 1024 * 1024;
const ECRITURE_MS = 6000;
const SONNERIE_MS = 45000;
const PRESENCE_MS = 60000;

const nomDe = (p: Moi): string => (typeof p.nom === 'string' && p.nom !== '' ? p.nom : (p.email ?? 'Quelqu’un'));
const maintenant = () => new Date().toISOString();

/** Qui écoute, pour la présence : un compte reste présent tant qu'une de ses connexions vit. */
const connexions = new Map<string, number>();
let tablePresence: Stockage | undefined;

async function marquerPresent(compte: string): Promise<void> {
  if (!tablePresence) return;
  const [ligne] = await tablePresence.lister({ egal: { compte } });
  if (ligne) await tablePresence.modifier(String(ligne.id), { vuLe: maintenant() });
  else {
    await tablePresence.creer({ compte, vuLe: maintenant() });
    direct.annonce('tr:presence');
  }
}

async function marquerAbsent(compte: string): Promise<void> {
  if (!tablePresence) return;
  for (const ligne of await tablePresence.lister({ egal: { compte } })) await tablePresence.supprimer(String(ligne.id));
  direct.annonce('tr:presence');
}

// Tant qu'une connexion vit, sa présence se renouvelle : un serveur tombé laisse s'éteindre les siennes.
setInterval(() => {
  for (const compte of connexions.keys()) void marquerPresent(compte).catch(() => undefined);
}, 20000).unref();

function ecouter(cle: string, req: Request, res: Response, moi: Moi): void {
  direct.ecouter(cle, req, res);
  connexions.set(moi.id, (connexions.get(moi.id) ?? 0) + 1);
  void marquerPresent(moi.id).catch(() => undefined);
  req.on('close', () => {
    const reste = (connexions.get(moi.id) ?? 1) - 1;
    if (reste > 0) connexions.set(moi.id, reste);
    else {
      connexions.delete(moi.id);
      void marquerAbsent(moi.id).catch(() => undefined);
    }
  });
}

/** Le premier fichier d'un corps « multipart/form-data ». */
function lireMultipart(corps: Buffer, typeContenu: string): { nom: string; type: string; contenu: Buffer } | undefined {
  const limite = /boundary=(?:"([^"]+)"|([^;]+))/.exec(typeContenu);
  if (!limite) return undefined;
  const separateur = Buffer.from('--' + (limite[1] ?? limite[2]));
  const debut = corps.indexOf(separateur);
  if (debut < 0) return undefined;
  const entetesDebut = debut + separateur.length + 2;
  const entetesFin = corps.indexOf('\r\n\r\n', entetesDebut);
  if (entetesFin < 0) return undefined;
  const entetes = corps.subarray(entetesDebut, entetesFin).toString('utf8');
  const fin = corps.indexOf(Buffer.concat([Buffer.from('\r\n'), separateur]), entetesFin + 4);
  if (fin < 0) return undefined;
  const nom = /filename\*?="?([^";\r\n]+)"?/i.exec(entetes)?.[1] ?? 'fichier';
  const type = /content-type:\s*([^\r\n;]+)/i.exec(entetes)?.[1] ?? 'application/octet-stream';
  return { nom: nom.replace(/[\\/\r\n]/g, '_').slice(0, 200), type: type.slice(0, 100), contenu: corps.subarray(entetesFin + 4, fin) };
}

export function monterTempsReel(cible: { use(routes: RequestHandler): unknown }, o: Options): void {
  const app = express.Router();
  cible.use(app);
  const { acces, usersStore, secret, tables, reglages } = o;
  const voir = (req: Request): Moi => (req as unknown as { user: Moi }).user;
  const texteDe = (valeur: unknown): string => (typeof valeur === 'string' ? valeur : valeur && typeof valeur === 'object' && 'id' in valeur ? String((valeur as { id: unknown }).id) : '');
  tablePresence = tables.presence_vue;
  // Une page publique lit ces routes pour tout le monde : un visiteur reçoit une réponse vide, sans erreur.
  const sansSession = (req: Request) => !req.headers.authorization && !/(?:^|;\s*)astratra_session=/.test(req.headers.cookie ?? '');
  const pourVisiteur = (vide: unknown): RequestHandler => (req, res, next) => {
    if (sansSession(req)) res.set('Cache-Control', 'no-store').json(vide);
    else next();
  };

  /** La fiche d'un compte, par son identifiant ou son adresse. */
  async function compteDe(valeur: string): Promise<Moi | undefined> {
    const parId = (await usersStore.findById(valeur)) as Moi | null;
    if (parId) return parId;
    return valeur.includes('@') ? (((await usersStore.findByEmail(valeur)) as Moi | null) ?? undefined) : undefined;
  }

  const signer = (id: string, expire: number) => createHmac('sha256', secret).update('piece:' + id + ':' + expire).digest('base64url');
  const adressePiece = (req: Request, route: string, id: string): string => {
    const expire = Date.now() + 3600000;
    const base = (process.env.HUMALIS_ADRESSE ?? req.protocol + '://' + req.get('host')).replace(/\/$/, '');
    return base + '/api/' + route + '/' + encodeURIComponent(id) + '/contenu?expire=' + expire + '&signature=' + signer(id, expire);
  };

  for (const d of reglages.discussions) {
    const conversations = tables['conversation_' + d.cle]!;
    const messages = tables['message_' + d.cle]!;
    const pieces = tables['piece_' + d.cle]!;
    const lectures = tables['lecture_' + d.cle]!;
    const ecritures = tables['ecriture_' + d.cle]!;
    const routePieces = 'discussions_' + d.cle + '_pieces';
    const cleDe = (compte: string) => 'tr:' + d.cle + ':' + compte;
    const groupe = d.entre.length === 1;
    const estAgent = (moi: Moi) => moi.role === 'admin' || (!groupe && moi.role === d.entre[1]);
    const estMembre = (moi: Moi) => moi.role === 'admin' || d.entre.includes(moi.role ?? '');
    const refus = (res: Response) => res.status(403).json({ erreur: "Vous n'avez pas accès à cette discussion." });

    /** Ceux qui voient une conversation : la personne et les agents, ou tout le groupe. Les comptes connus par leurs messages et lectures suffisent à annoncer. */
    async function concernes(conversation: Record<string, unknown>): Promise<string[]> {
      const id = String(conversation.id);
      const auteurs = (await messages.lister({ egal: { conversation: id } })).map((m) => String(m.auteur));
      const lecteurs = (await lectures.lister({ egal: { conversation: id } })).map((l) => String(l.compte));
      return [...new Set([...auteurs, ...lecteurs, ...(typeof conversation.personne === 'string' && conversation.personne ? [conversation.personne] : [])])];
    }
    async function annoncer(conversation: Record<string, unknown>): Promise<void> {
      for (const compte of await concernes(conversation)) direct.annonce(cleDe(compte));
      direct.annonce('tr:' + d.cle + ':equipe');
    }

    async function conversationDe(moi: Moi, id: string, creerSiBesoin = true): Promise<Record<string, unknown> | undefined> {
      if (id === 'moi' || id === '') {
        if (groupe) {
          const [commune] = await conversations.lister({ egal: { personne: '' } });
          if (commune) return commune;
          return creerSiBesoin ? conversations.creer({ titre: d.nom, personne: '', dernier: '', dernierLe: '', nonLus: 0, enLigne: false }) : undefined;
        }
        if (moi.role !== d.entre[0]) return undefined;
        const [mienne] = await conversations.lister({ egal: { personne: moi.id } });
        if (mienne) return mienne;
        return creerSiBesoin ? conversations.creer({ titre: nomDe(moi), personne: moi.id, dernier: '', dernierLe: '', nonLus: 0, enLigne: false }) : undefined;
      }
      const trouvee = await conversations.trouver(id);
      if (!trouvee) return undefined;
      if (groupe || estAgent(moi) || trouvee.personne === moi.id) return trouvee;
      return undefined;
    }

    async function luLe(conversation: string, compte: string): Promise<string> {
      const [ligne] = await lectures.lister({ egal: { conversation, compte } });
      return ligne ? String(ligne.luLe) : '';
    }
    async function nonLus(conversation: string, compte: string): Promise<number> {
      const vu = await luLe(conversation, compte);
      return (await messages.lister({ egal: { conversation } })).filter((m) => m.auteur !== compte && String(m.creeLe) > vu).length;
    }
    const presents = async (): Promise<Set<string>> => {
      const limite = new Date(Date.now() - PRESENCE_MS).toISOString();
      return new Set((await (tablePresence?.lister({ egal: {} }) ?? Promise.resolve([]))).filter((l) => String(l.vuLe) > limite).map((l) => String(l.compte)));
    };

    const base = '/api/discussions_' + d.cle;
    const ecouterDiscussion: RequestHandler = (req, res) => {
      const moi = voir(req);
      if (!estMembre(moi)) {
        refus(res);
        return;
      }
      // Un agent entend toutes les conversations ; les autres, seulement les leurs.
      ecouter(estAgent(moi) || groupe ? 'tr:' + d.cle + ':equipe' : cleDe(moi.id), req, res, moi);
    };
    for (const suite of ['conversations', 'vue', 'messages', 'non_lus']) app.get(base + '_' + suite + '/direct', ...acces.connecte, ecouterDiscussion);

    app.get(base + '_conversations', ...acces.connecte, async (req, res, next) => {
      try {
        const moi = voir(req);
        if (!estMembre(moi)) {
          refus(res);
          return;
        }
        // Seuls les agents choisissent une conversation : les autres n'en ont qu'une, ouverte d'office.
        const liste = estAgent(moi) && !groupe ? await conversations.lister({ egal: {}, limite: 2000 }) : [];
        const enLigne = await presents();
        const lues: Record<string, unknown>[] = await Promise.all(liste.map(async (c) => ({ ...c, nonLus: await nonLus(String(c.id), moi.id), enLigne: typeof c.personne === 'string' && enLigne.has(c.personne), titre: groupe || !estAgent(moi) ? d.nom : c.titre })));
        res.set('Cache-Control', 'no-store').json(lues.sort((a, b) => String(b.dernierLe).localeCompare(String(a.dernierLe))));
      } catch (erreur) {
        next(erreur);
      }
    });

    // « ouvrir discussion "support" avec commande.client ».
    app.post(base + '_conversations', ...acces.connecte, async (req, res, next) => {
      try {
        const moi = voir(req);
        if (!estMembre(moi)) {
          refus(res);
          return;
        }
        if (groupe || !estAgent(moi)) {
          res.status(201).json(await conversationDe(moi, 'moi'));
          return;
        }
        const personne = await compteDe(texteDe((req.body as { personne?: unknown }).personne));
        if (!personne || personne.role !== d.entre[0]) {
          res.status(404).json({ erreur: 'Cette personne ne peut pas participer à cette discussion.' });
          return;
        }
        const [deja] = await conversations.lister({ egal: { personne: personne.id } });
        res.status(201).json(deja ?? (await conversations.creer({ titre: nomDe(personne), personne: personne.id, dernier: '', dernierLe: '', nonLus: 0, enLigne: false })));
      } catch (erreur) {
        next(erreur);
      }
    });

    app.get(base + '_vue/:id', ...acces.connecte, async (req, res, next) => {
      try {
        const moi = voir(req);
        if (!estMembre(moi)) {
          refus(res);
          return;
        }
        const conversation = await conversationDe(moi, String(req.params.id));
        if (!conversation) {
          res.status(404).json({ erreur: 'Cette conversation est introuvable.' });
          return;
        }
        const id = String(conversation.id);
        const tous = (await messages.lister({ egal: { conversation: id } })).sort((a, b) => String(a.creeLe).localeCompare(String(b.creeLe)));
        const derniers = tous.slice(-MESSAGES_AU_PLUS);
        // Lire la conversation marque ses messages comme lus ; l'auteur l'apprend, seulement si quelque chose a changé.
        const dernierDesAutres = [...tous].reverse().find((m) => m.auteur !== moi.id);
        const avant = await luLe(id, moi.id);
        if (dernierDesAutres && String(dernierDesAutres.creeLe) > avant) {
          const [ligne] = await lectures.lister({ egal: { conversation: id, compte: moi.id } });
          const luMaintenant = maintenant();
          if (ligne) await lectures.modifier(String(ligne.id), { luLe: luMaintenant });
          else await lectures.creer({ conversation: id, compte: moi.id, luLe: luMaintenant });
          await annoncer(conversation);
        }
        const toutesLectures = (await lectures.lister({ egal: { conversation: id } })).filter((l) => l.compte !== moi.id);
        const limite = new Date(Date.now() - ECRITURE_MS).toISOString();
        const ecrivent = (await ecritures.lister({ egal: { conversation: id } })).filter((e) => e.compte !== moi.id && String(e.ecritLe) > limite).map((e) => String(e.nom));
        const enLigne = await presents();
        res.set('Cache-Control', 'no-store').json({
          id,
          titre: groupe || !estAgent(moi) ? d.nom : conversation.titre,
          enLigne: !groupe && (estAgent(moi) ? enLigne.has(String(conversation.personne)) : [...enLigne].some((c) => c !== moi.id)),
          ecrivent: ecrivent.join(', '),
          messages: derniers.map((m) => ({
            ...m,
            moi: m.auteur === moi.id,
            lu: toutesLectures.some((l) => String(l.luLe) >= String(m.creeLe)),
            pieceAdresse: m.piece ? adressePiece(req, routePieces, String(m.piece)) : '',
          })),
        });
      } catch (erreur) {
        next(erreur);
      }
    });

    // « quand un message arrive » : le dernier message reçu d'une autre personne.
    const messageVide = { id: '', conversation: '', auteur: '', auteurNom: '', moi: false, texte: '', piece: '', pieceNom: '', pieceType: '', pieceAdresse: '', lu: false, creeLe: '' };
    app.get(base + '_messages/:id', pourVisiteur(messageVide), ...acces.connecte, async (req, res, next) => {
      try {
        const moi = voir(req);
        if (!estMembre(moi) || req.params.id !== 'dernier') {
          refus(res);
          return;
        }
        const visibles = estAgent(moi) ? await conversations.lister({ egal: {}, limite: 2000 }) : [await conversationDe(moi, 'moi')].filter((c): c is Record<string, unknown> & { id: string } => Boolean(c));
        const lus = (await Promise.all(visibles.map((c) => messages.lister({ egal: { conversation: String(c.id) } })))).flat();
        const dernier = lus.filter((m) => m.auteur !== moi.id).sort((a, b) => String(b.creeLe).localeCompare(String(a.creeLe)))[0];
        res.set('Cache-Control', 'no-store').json(dernier ?? messageVide);
      } catch (erreur) {
        next(erreur);
      }
    });

    app.post(base + '_messages', ...acces.connecte, async (req, res, next) => {
      try {
        const moi = voir(req);
        const corps = req.body as { conversation?: unknown; texte?: unknown; piece?: unknown };
        const conversation = estMembre(moi) ? await conversationDe(moi, texteDe(corps.conversation)) : undefined;
        if (!conversation) {
          refus(res);
          return;
        }
        const contenu = texteDe(corps.texte).trim();
        const idPiece = texteDe(corps.piece);
        if (contenu.length > TEXTE_AU_PLUS) {
          res.status(400).json({ erreur: 'Ce message est trop long.' });
          return;
        }
        const piece = idPiece ? await pieces.trouver(idPiece) : null;
        if (idPiece && (!piece || piece.auteur !== moi.id)) {
          res.status(404).json({ erreur: 'Ce fichier est introuvable.' });
          return;
        }
        if (contenu === '' && !piece) {
          res.status(400).json({ erreur: 'Écrivez un message.' });
          return;
        }
        const id = String(conversation.id);
        if (piece) await pieces.modifier(String(piece.id), { conversation: id });
        const cree = await messages.creer({ conversation: id, auteur: moi.id, auteurNom: nomDe(moi), moi: false, texte: contenu, piece: piece ? String(piece.id) : '', pieceNom: piece ? String(piece.nom) : '', pieceType: piece ? String(piece.genre) : '', pieceAdresse: '', lu: false, creeLe: maintenant() });
        await conversations.modifier(id, { dernier: contenu || String(piece?.nom ?? ''), dernierLe: String(cree.creeLe) });
        for (const e of await ecritures.lister({ egal: { conversation: id, compte: moi.id } })) await ecritures.supprimer(String(e.id));
        // Celui qui écrit a tout lu jusque-là.
        const [lue] = await lectures.lister({ egal: { conversation: id, compte: moi.id } });
        if (lue) await lectures.modifier(String(lue.id), { luLe: String(cree.creeLe) });
        else await lectures.creer({ conversation: id, compte: moi.id, luLe: String(cree.creeLe) });
        await annoncer(conversation);
        res.status(201).json(cree);
      } catch (erreur) {
        next(erreur);
      }
    });

    app.post(base + '_ecriture', ...acces.connecte, async (req, res, next) => {
      try {
        const moi = voir(req);
        const conversation = estMembre(moi) ? await conversationDe(moi, texteDe((req.body as { conversation?: unknown }).conversation)) : undefined;
        if (!conversation) {
          refus(res);
          return;
        }
        const id = String(conversation.id);
        const [ligne] = await ecritures.lister({ egal: { conversation: id, compte: moi.id } });
        const recent = ligne && Date.now() - Date.parse(String(ligne.ecritLe)) < 2000;
        if (!recent) {
          if (ligne) await ecritures.modifier(String(ligne.id), { ecritLe: maintenant() });
          else await ecritures.creer({ conversation: id, compte: moi.id, nom: nomDe(moi), ecritLe: maintenant() });
          await annoncer(conversation);
          // Une fois le délai passé, « écrit… » disparaît sans autre envoi.
          setTimeout(() => void annoncer(conversation).catch(() => undefined), ECRITURE_MS + 300).unref();
        }
        res.status(201).json({ id: ligne?.id ?? id, conversation: id, compte: moi.id, nom: nomDe(moi), ecritLe: maintenant() });
      } catch (erreur) {
        next(erreur);
      }
    });

    app.get(base + '_non_lus/:id', pourVisiteur({ id: 'moi', nombre: 0 }), ...acces.connecte, async (req, res, next) => {
      try {
        const moi = voir(req);
        if (!estMembre(moi)) {
          res.set('Cache-Control', 'no-store').json({ id: 'moi', nombre: 0 });
          return;
        }
        const visibles = estAgent(moi) ? await conversations.lister({ egal: {}, limite: 2000 }) : [await conversationDe(moi, 'moi', false)].filter((c): c is Record<string, unknown> & { id: string } => Boolean(c));
        const totaux = await Promise.all(visibles.map((c) => nonLus(String(c.id), moi.id)));
        res.set('Cache-Control', 'no-store').json({ id: 'moi', nombre: totaux.reduce((a, b) => a + b, 0) });
      } catch (erreur) {
        next(erreur);
      }
    });

    app.post('/api/' + routePieces, ...acces.connecte, express.raw({ type: () => true, limit: PIECE_AU_PLUS + 65536 }), async (req, res, next) => {
      try {
        const moi = voir(req);
        if (!estMembre(moi)) {
          refus(res);
          return;
        }
        const fichier = Buffer.isBuffer(req.body) ? lireMultipart(req.body, String(req.get('content-type') ?? '')) : undefined;
        if (!fichier || fichier.contenu.length === 0) {
          res.status(400).json({ erreur: 'Choisissez un fichier.' });
          return;
        }
        if (fichier.contenu.length > PIECE_AU_PLUS) {
          res.status(413).json({ erreur: 'Ce fichier dépasse 10 Mo.' });
          return;
        }
        const cree = await pieces.creer({ conversation: '', auteur: moi.id, nom: fichier.nom, genre: fichier.type, contenu: fichier.contenu.toString('base64') });
        res.status(201).json({ id: cree.id, conversation: '', auteur: moi.id, nom: fichier.nom, genre: fichier.type, contenu: '' });
      } catch (erreur) {
        next(erreur);
      }
    });

    // Une adresse signée, valable une heure : un lien marche sur toutes les cibles, sans session.
    app.get('/api/' + routePieces + '/:id/contenu', async (req, res, next) => {
      try {
        const id = String(req.params.id);
        const expire = Number(req.query.expire);
        const recue = Buffer.from(String(req.query.signature ?? ''));
        const attendue = Buffer.from(signer(id, expire));
        if (!Number.isFinite(expire) || expire < Date.now() || recue.length !== attendue.length || !timingSafeEqual(recue, attendue)) {
          res.status(403).json({ erreur: 'Ce lien a expiré.' });
          return;
        }
        const piece = await pieces.trouver(id);
        if (!piece) {
          res.status(404).json({ erreur: 'Ce fichier est introuvable.' });
          return;
        }
        // Un fichier envoyé par quelqu'un ne s'exécute jamais dans le navigateur : il se télécharge.
        res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename*=UTF-8\'\'' + encodeURIComponent(String(piece.nom)), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
        res.send(Buffer.from(String(piece.contenu), 'base64'));
      } catch (erreur) {
        next(erreur);
      }
    });
  }

  if (reglages.presence || reglages.discussions.length > 0) {
    app.get('/api/presence/direct', ...acces.connecte, (req, res) => ecouter('tr:presence', req, res, voir(req)));
    app.get('/api/presence/:id', pourVisiteur({ id: 'moi', comptes: [] }), ...acces.connecte, async (req, res, next) => {
      try {
        const limite = new Date(Date.now() - PRESENCE_MS).toISOString();
        const comptes = (await (tablePresence?.lister({ egal: {} }) ?? Promise.resolve([]))).filter((l) => String(l.vuLe) > limite).map((l) => String(l.compte));
        res.set('Cache-Control', 'no-store').json({ id: 'moi', comptes });
      } catch (erreur) {
        next(erreur);
      }
    });
  }

  const appels = reglages.appels ? tables.appel_humalis : undefined;
  if (appels) {
    const cleAppel = (compte: string) => 'tr:appels:' + compte;
    const vide = { id: '', auteur: '', auteurNom: '', appele: '', salle: '', video: false, etat: '', appeleLe: '' };
    const annoncerAppel = (appel: Record<string, unknown>) => {
      direct.annonce(cleAppel(String(appel.auteur)));
      direct.annonce(cleAppel(String(appel.appele)));
    };

    app.get('/api/appels/direct', ...acces.connecte, (req, res) => {
      const moi = voir(req);
      ecouter(cleAppel(moi.id), req, res, moi);
    });

    app.post('/api/appels', ...acces.connecte, async (req, res, next) => {
      try {
        const moi = voir(req);
        const corps = req.body as { appele?: unknown; video?: unknown };
        const contact = await compteDe(texteDe(corps.appele));
        if (!contact?.id || contact.id === moi.id) {
          res.status(404).json({ erreur: 'Cette personne est introuvable.' });
          return;
        }
        const appel = await appels.creer({ auteur: moi.id, auteurNom: nomDe(moi), appele: contact.id, salle: 'appel-' + randomUUID(), video: corps.video === true, etat: 'sonne', appeleLe: maintenant() });
        annoncerAppel(appel);
        // Personne ne décroche : l'appel s'arrête, et les deux côtés l'apprennent.
        setTimeout(() => {
          void appels.trouver(String(appel.id)).then(async (lu) => {
            if (lu?.etat !== 'sonne') return;
            await appels.modifier(String(appel.id), { etat: 'fini' });
            annoncerAppel(lu);
          }).catch(() => undefined);
        }, SONNERIE_MS).unref();
        res.status(201).json(appel);
      } catch (erreur) {
        next(erreur);
      }
    });

    app.get('/api/appels/entrant', pourVisiteur(vide));
    app.get('/api/appels/:id', ...acces.connecte, async (req, res, next) => {
      try {
        const moi = voir(req);
        res.set('Cache-Control', 'no-store');
        if (req.params.id === 'entrant') {
          const limite = new Date(Date.now() - SONNERIE_MS).toISOString();
          const [dernier] = (await appels.lister({ egal: { appele: moi.id, etat: 'sonne' } })).filter((a) => String(a.appeleLe) > limite).sort((a, b) => String(b.appeleLe).localeCompare(String(a.appeleLe)));
          res.json(dernier ?? vide);
          return;
        }
        const appel = await appels.trouver(String(req.params.id));
        if (!appel || (appel.auteur !== moi.id && appel.appele !== moi.id)) {
          res.status(404).json({ erreur: 'Cet appel est introuvable.' });
          return;
        }
        res.json(appel);
      } catch (erreur) {
        next(erreur);
      }
    });

    app.post('/api/appels_reponse', ...acces.connecte, async (req, res, next) => {
      try {
        const moi = voir(req);
        const corps = req.body as { appel?: unknown; reponse?: unknown };
        const appel = await appels.trouver(texteDe(corps.appel));
        if (!appel || (appel.auteur !== moi.id && appel.appele !== moi.id)) {
          res.status(404).json({ erreur: 'Cet appel est introuvable.' });
          return;
        }
        const reponse = texteDe(corps.reponse);
        const etat = reponse === 'oui' ? 'en_cours' : 'fini';
        if (reponse === 'oui' && appel.appele !== moi.id) {
          res.status(403).json({ erreur: 'Seule la personne appelée peut décrocher.' });
          return;
        }
        await appels.modifier(String(appel.id), { etat });
        annoncerAppel(appel);
        res.status(201).json({ id: appel.id, appel: appel.id, reponse });
      } catch (erreur) {
        next(erreur);
      }
    });
  }

  if (reglages.salle) monterSalles(app, o, voir, appels);
}
/*LIVEKIT*/`;
