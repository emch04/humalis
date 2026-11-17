/**
 * « ia », « connecte peut demander a ia » : la route produite. Le service se choisit dans le .env, au format de
 * discussion compatible OpenAI, sans rien par défaut. La clé reste sur le serveur ; la réponse part vers la page au
 * fil de l'eau ; chaque compte a un plafond.
 */
import type { ServeurRI } from '../../ri/types.js';
import { gardeAction } from './separation.js';

export const avecIa = (serveur: ServeurRI) => serveur.droitIa !== undefined;

export const routeIa = (serveur: ServeurRI) => `      const routeIa = express.Router();
      routeIa.post('/', ${gardeAction(serveur.droitIa!)}, csrfMiddleware, creerIa(compterIa));
      app.use('/auth/ia', routeIa);
`;

export const ENV_IA = `# L'IA (« ia ») : un service au format de discussion compatible OpenAI, choisi par vous. Rien par défaut :
# sans adresse ni modèle, les questions sont refusées.
# L'adresse du service jusqu'à /v1 (Humalis ajoute /chat/completions), le modèle, et la clé si le service en demande une.
HUMALIS_IA_ADRESSE=
HUMALIS_IA_MODELE=
HUMALIS_IA_CLE=
# Un second service, facultatif : il reprend la question si le premier refuse avant d'avoir écrit un mot.
HUMALIS_IA_ADRESSE_2=
HUMALIS_IA_MODELE_2=
HUMALIS_IA_CLE_2=
# La longueur maximale d'une réponse (celle du service si vide), et le nombre de questions par compte et par heure.
HUMALIS_IA_JETONS=
HUMALIS_IA_PAR_HEURE=
`;

/** src/humalis/ia.ts */
export const IA = String.raw`import type { RequestHandler } from 'express';
import type pg from 'pg';

/**
 * Produit par Humalis : une question à l'IA, sa réponse envoyée à la page au fil de l'eau.
 * Le service parle le format de discussion compatible OpenAI ; il est choisi dans le .env, jamais dans le programme.
 */
const LONGUEUR_MAX = 20000;
// Le service doit commencer à répondre dans ce délai ; ensuite, la réponse prend le temps qu'il faut.
const DELAI_PREMIERE_REPONSE = 60_000;

export interface ServiceIa { adresse: string; modele: string; cle: string }

/** L'adresse désigne cette machine : localhost (et ses sous-noms), 127.x.x.x ou ::1. */
export function surLaMachine(adresse: string): boolean {
  let hote: string;
  try {
    hote = new URL(adresse).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hote === 'localhost' || hote.endsWith('.localhost') || /^127(\.\d{1,3}){3}$/.test(hote) || hote === '[::1]';
}

/** Le service du .env, puis son secours facultatif (_2). Sinon, ce qui manque, dit exactement. */
export function servicesIa(env: Record<string, string | undefined> = process.env): { services: ServiceIa[] } | { manque: string } {
  const lire = (suffixe: string): ServiceIa => ({
    adresse: (env['HUMALIS_IA_ADRESSE' + suffixe] ?? '').trim().replace(/\/+$/, ''),
    modele: (env['HUMALIS_IA_MODELE' + suffixe] ?? '').trim(),
    cle: (env['HUMALIS_IA_CLE' + suffixe] ?? '').trim(),
  });
  const services: ServiceIa[] = [];
  for (const suffixe of ['', '_2']) {
    const service = lire(suffixe);
    if (suffixe === '_2' && !service.adresse && !service.modele && !service.cle) break;
    const manque = [!service.adresse && 'HUMALIS_IA_ADRESSE' + suffixe, !service.modele && 'HUMALIS_IA_MODELE' + suffixe].filter(Boolean);
    if (manque.length) return { manque: "l'IA n'est pas réglée sur ce serveur : renseignez " + manque.join(' et ') + ' dans le .env' };
    if (!/^https?:\/\/[^/\s]+/.test(service.adresse)) return { manque: "l'IA n'est pas réglée sur ce serveur : HUMALIS_IA_ADRESSE" + suffixe + ' doit commencer par https:// ou http://' };
    // La clé ne part jamais en clair hors de la machine : http:// avec une clé, seulement vers un modèle local.
    if (service.cle && /^http:/i.test(service.adresse) && !surLaMachine(service.adresse)) return { manque: "l'IA n'est pas réglée sur ce serveur : HUMALIS_IA_ADRESSE" + suffixe + ' doit commencer par https:// pour recevoir la clé (http:// seulement vers cette machine : localhost, 127.0.0.1)' };
    services.push(service);
  }
  return { services };
}

/** Le texte montrable : jamais la réflexion qu'un modèle écrit entre balises think, même pas encore fermée. */
export function montrable(brut: string): string {
  let texte = brut.replace(/<think>[\s\S]*?<\/think>\s*/g, '');
  const ouverte = texte.indexOf('<think>');
  if (ouverte >= 0) texte = texte.slice(0, ouverte);
  // Le début d'une balise coupé en deux (« <thi ») attend la suite avant d'être montré.
  const fin = texte.lastIndexOf('<');
  if (fin >= 0 && '<think>'.startsWith(texte.slice(fin))) texte = texte.slice(0, fin);
  return texte;
}

type Issue = { fini: true } | { fini: false; statut?: number; raison: string };

/** Demande au service ; chaque morceau de texte part aussitôt par « ecrire ». */
async function demander(service: ServiceIa, question: string, ecrire: (texte: string) => void, arret: AbortSignal, env: Record<string, string | undefined>): Promise<Issue> {
  const adresse = /\/chat\/completions$/.test(service.adresse) ? service.adresse : service.adresse + '/chat/completions';
  const jetons = Number(env.HUMALIS_IA_JETONS);
  const delai = new AbortController();
  const minuterie = setTimeout(() => delai.abort(), DELAI_PREMIERE_REPONSE);
  let reponse: Response;
  try {
    reponse = await fetch(adresse, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...(service.cle ? { authorization: 'Bearer ' + service.cle } : {}) },
      body: JSON.stringify({ model: service.modele, messages: [{ role: 'user', content: question }], stream: true, ...(jetons > 0 ? { max_tokens: Math.floor(jetons) } : {}) }),
      signal: AbortSignal.any([arret, delai.signal]),
    });
  } catch (erreur) {
    return { fini: false, raison: delai.signal.aborted ? 'aucune réponse en ' + DELAI_PREMIERE_REPONSE / 1000 + ' s' : erreur instanceof Error ? erreur.message : String(erreur) };
  } finally {
    clearTimeout(minuterie);
  }
  if (!reponse.ok) {
    await reponse.body?.cancel().catch(() => undefined);
    return { fini: false, statut: reponse.status, raison: 'le service a répondu ' + reponse.status };
  }
  let brut = '';
  let envoye = '';
  let refus = false;
  const avancer = (morceau: unknown, raisonFin: unknown) => {
    if (typeof morceau === 'string' && morceau) {
      brut += morceau;
      const texte = montrable(brut);
      if (texte.length > envoye.length && texte.startsWith(envoye)) {
        ecrire(texte.slice(envoye.length));
        envoye = texte;
      }
    }
    if (raisonFin === 'content_filter') refus = true;
  };
  if ((reponse.headers.get('content-type') ?? '').includes('text/event-stream') && reponse.body) {
    const lecteur = reponse.body.getReader();
    const decodeur = new TextDecoder();
    let attente = '';
    const lireLigne = (brute: string) => {
      const ligne = brute.replace(/\r$/, '');
      if (!ligne.startsWith('data:')) return;
      const donnee = ligne.slice(5).trim();
      if (!donnee || donnee === '[DONE]') return;
      try {
        const evenement = JSON.parse(donnee) as { choices?: { delta?: { content?: unknown }; finish_reason?: unknown }[] };
        avancer(evenement.choices?.[0]?.delta?.content, evenement.choices?.[0]?.finish_reason);
      } catch { /* Une ligne illisible est ignorée : la suite peut encore arriver. */ }
    };
    for (;;) {
      const { value, done } = await lecteur.read();
      if (done) break;
      attente += decodeur.decode(value, { stream: true });
      let fin: number;
      while ((fin = attente.indexOf('\n')) >= 0) {
        lireLigne(attente.slice(0, fin));
        attente = attente.slice(fin + 1);
      }
    }
    attente += decodeur.decode();
    if (attente) lireLigne(attente);
  } else {
    // Un service qui ne sait pas répondre en flux : la réponse entière, d'un coup.
    const corps = (await reponse.json().catch(() => ({}))) as { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[] };
    avancer(corps.choices?.[0]?.message?.content, corps.choices?.[0]?.finish_reason);
  }
  if (refus && !envoye) return { fini: false, statut: 451, raison: 'refus' };
  if (!envoye) return { fini: false, raison: 'réponse vide' };
  return { fini: true };
}

export type Compter = (cle: string) => Promise<number>;

export function compterMemoire(): Compter {
  const comptes = new Map<string, number>();
  return async (cle) => {
    const heure = cle.slice(cle.lastIndexOf('|'));
    for (const ancienne of comptes.keys()) if (!ancienne.endsWith(heure)) comptes.delete(ancienne);
    const n = (comptes.get(cle) ?? 0) + 1;
    comptes.set(cle, n);
    return n;
  };
}

/** Plusieurs serveurs : la base compte pour tous. */
export function compterPostgres(pool: pg.Pool): Compter {
  let prete: Promise<unknown> | undefined;
  return async (cle) => {
    await (prete ??= pool.query('CREATE TABLE IF NOT EXISTS humalis_ia_usage (cle TEXT PRIMARY KEY, n INTEGER NOT NULL, cree_le TIMESTAMPTZ NOT NULL DEFAULT now())'));
    await pool.query("DELETE FROM humalis_ia_usage WHERE cree_le < now() - interval '2 hours'");
    const { rows } = await pool.query('INSERT INTO humalis_ia_usage (cle, n) VALUES ($1, 1) ON CONFLICT (cle) DO UPDATE SET n = humalis_ia_usage.n + 1 RETURNING n', [cle]);
    return Number(rows[0].n);
  };
}

export function creerIa(compter: Compter, env: Record<string, string | undefined> = process.env): RequestHandler {
  return async (req, res, next) => {
    try {
      const question = (req.body as { question?: unknown } | undefined)?.question;
      if (typeof question !== 'string' || question.trim() === '' || question.length > LONGUEUR_MAX) {
        res.status(400).json({ erreur: 'cette question est vide ou trop longue' });
        return;
      }
      const reglage = servicesIa(env);
      if ('manque' in reglage) {
        res.status(503).json({ erreur: reglage.manque });
        return;
      }
      const compte = String((req as unknown as { user: { id: unknown } }).user.id);
      const plafond = Number(env.HUMALIS_IA_PAR_HEURE) || 30;
      if ((await compter(compte + '|' + new Date().toISOString().slice(0, 13))) > plafond) {
        res.status(429).json({ erreur: "vous avez posé beaucoup de questions : réessayez dans l'heure" });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
      const envoyer = (corps: object) => res.write('data: ' + JSON.stringify(corps) + '\n\n');
      const arret = new AbortController();
      res.on('close', () => arret.abort());
      let ecrit = false;
      let issue: Issue = { fini: false, raison: 'aucun service' };
      // Le secours ne reprend que si le premier service n'a encore rien écrit : jamais deux réponses mêlées.
      for (const service of reglage.services) {
        issue = await demander(service, question, (t) => { ecrit = true; envoyer({ t }); }, arret.signal, env)
          .catch((erreur: unknown): Issue => ({ fini: false, raison: erreur instanceof Error ? erreur.message : String(erreur) }));
        if (issue.fini || ecrit || arret.signal.aborted) break;
      }
      if (!issue.fini && !arret.signal.aborted) {
        if (issue.statut === 451) envoyer({ erreur: "L'IA a refusé de répondre à cette demande." });
        else if (issue.statut === 429) envoyer({ erreur: "L'IA est très demandée : réessayez dans un instant." });
        else {
          // Jamais la clé ni la question dans le journal : seulement ce qui s'est passé.
          console.error("L'IA n'a pas répondu :", issue.raison);
          envoyer({ erreur: "L'IA n'a pas répondu : réessayez dans un instant." });
        }
      }
      res.end();
    } catch (erreur) {
      next(erreur);
    }
  };
}
`;
