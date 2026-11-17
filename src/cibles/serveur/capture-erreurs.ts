/** Capture des erreurs du serveur produit : aucune donnée de requête ou de formulaire ne sort. */
import type { InstructionServeurRI, JetonRI, RequeteCaptureRI, ServeurRI } from '../../ri/types.js';

const q = (valeur: string) => JSON.stringify(valeur);

/** Une requête de rapport : son adresse (écrite, ou lue dans le .env) et sa clé (publique, ou lue dans le .env). */
interface EnvoiRapport {
  adresse: string;
  adresseEnvironnement?: string;
  jeton?: JetonRI;
}

/** Les variables du .env qu'une capture lit : les adresses, puis les clés secrètes. */
export function variablesCapture(envois: EnvoiRapport[]): string[] {
  return [...new Set(envois.flatMap((e) => [...(e.adresseEnvironnement ? [e.adresseEnvironnement] : []), ...(e.jeton?.genre === 'secret' ? [e.jeton.valeur] : [])]))];
}

const configuration = (e: EnvoiRapport): string =>
  `{ adresse: ${q(e.adresse)}${e.adresseEnvironnement ? `, adresseEnvironnement: ${q(e.adresseEnvironnement)}` : ''}${e.jeton ? `, jeton: ${JSON.stringify(e.jeton)}` : ''} }`;

/** L'envoi d'un rapport, partagé par la capture du serveur et le relais des applications. */
function codeEnvoi(envois: EnvoiRapport[]): string {
  const variables = variablesCapture(envois);
  return `type Jeton = { genre: 'public' | 'secret'; valeur: string; place: { genre: 'autorisation' } | { genre: 'entete' | 'parametre'; nom: string } };
type Envoi = { adresse: string; adresseEnvironnement?: string; jeton?: Jeton };

function nettoyer(texte: unknown): string {
  return String(texte ?? '').slice(0, 4000)
    .replace(/([?&][^=\\s]+)=([^&\\s]+)/g, '$1=[masqué]')
    .replace(/(password|mot.?de.?passe|secret|token|jeton|authorization)(\\s*[:=]\\s*)[^\\s,;]+/gi, '$1$2[masqué]');
}

/** Une valeur du .env ; vide ou absente, rien n'est inventé à sa place. */
const reglage = (nom: string): string | undefined => process.env[nom]?.trim() || undefined;

${variables.length > 0 ? `// Au démarrage : sans son adresse ou sa clé, un rapport ne part pas. On le dit une fois, sans arrêter le serveur.
for (const nom of ${JSON.stringify(variables)}) {
  if (!reglage(nom)) console.warn('« quand une erreur arrive » : ' + nom + " n'est pas réglé dans le .env ; les rapports qui en ont besoin ne partent pas.");
}
` : ''}
/** Envoie un rapport ; un échec (adresse absente, réseau, délai) ne déclenche jamais une nouvelle capture. */
async function envoyer(envoi: Envoi, corps: Record<string, string>): Promise<void> {
  const adresse = envoi.adresseEnvironnement ? reglage(envoi.adresseEnvironnement) : envoi.adresse;
  if (!adresse || !/^https:\\/\\/[^\\s/?#]+/i.test(adresse)) return;
  const entetes: Record<string, string> = { 'content-type': 'application/json' };
  let url: URL;
  try { url = new URL(adresse); } catch { return; }
  if (envoi.jeton) {
    const cle = envoi.jeton.genre === 'secret' ? reglage(envoi.jeton.valeur) : envoi.jeton.valeur;
    if (!cle) return;
    if (envoi.jeton.place.genre === 'parametre') url.searchParams.set(envoi.jeton.place.nom, cle);
    else if (envoi.jeton.place.genre === 'entete') entetes[envoi.jeton.place.nom] = cle;
    else entetes.authorization = 'Bearer ' + cle;
  }
  try {
    await fetch(url, { method: 'POST', headers: entetes, body: JSON.stringify(corps), redirect: 'error', signal: AbortSignal.timeout(3000) });
  } catch { /* Un échec d'envoi ne déclenche jamais une nouvelle capture. */ }
}
`;
}

/** Seules les requêtes HTTP sont autorisées dans une capture : elles ne dépendent d'aucune transaction. */
export function codeCaptureErreurs(serveur: ServeurRI): string {
  const requetes = (serveur.captureErreurs ?? []) as Extract<InstructionServeurRI, { type: 'requete' }>[];
  const envois: EnvoiRapport[] = requetes.map((r) => ({ adresse: r.adresse, ...(r.adresseEnvironnement ? { adresseEnvironnement: r.adresseEnvironnement } : {}), ...(serveur.jetonErreurs ? { jeton: serveur.jetonErreurs } : {}) }));
  const valeur = (v: Extract<InstructionServeurRI, { type: 'requete' }>['champs'][number]['valeur']): string => {
    if (v.genre === 'erreur') return `erreur.${v.champ}`;
    if (v.genre === 'valeur') return q(String(v.valeur));
    if (v.genre === 'texte') return v.parties.map((p) => 'texte' in p ? q(p.texte) : valeur(p.valeur)).join(' + ') || "''";
    return "''";
  };
  return `// Produit par Humalis : capture sûre des erreurs du processus et d'Express.
import { erreurDuJournal, ligneHumalis, pileHumalis } from './lignes.js';

type Rapport = { message: string; pile: string; ligne: string; page: string; version: string };
const enCours = new Set<string>();
const limites = new Map<string, number[]>();
let dansLaCapture = false;

${codeEnvoi(envois)}
export async function rapporterErreur(inconnue: unknown, page = ''): Promise<void> {
  if (dansLaCapture) return;
  const reduite = erreurDuJournal(inconnue);
  const brute = reduite instanceof Error ? reduite : new Error('Erreur inconnue');
  const erreur: Rapport = { message: nettoyer(brute.message), pile: nettoyer(pileHumalis(String(brute.stack ?? ''))), ligne: nettoyer(ligneHumalis(brute)), page: nettoyer(page), version: ${q('1.0.0')} };
  const cle = erreur.message + '|' + erreur.pile.split('\\n')[1];
  const maintenant = Date.now();
  const passages = (limites.get(cle) ?? []).filter((instant) => maintenant - instant < 60_000);
  if (passages.length >= 3 || enCours.has(cle)) return;
  passages.push(maintenant);
  limites.set(cle, passages);
  if (limites.size > 500) for (const [nom, dates] of limites) if (dates.every((instant) => maintenant - instant >= 60_000)) limites.delete(nom);
  enCours.add(cle);
  dansLaCapture = true;
  try {
${requetes.map((r, i) => `    await envoyer(${configuration(envois[i]!)}, { ${r.champs.map((c) => `${q(c.nom)}: ${valeur(c.valeur)}`).join(', ')} });`).join('\n')}
  } finally { dansLaCapture = false; enCours.delete(cle); }
}

let branche = false;
export function brancherErreursProcessus(): void {
  if (branche) return;
  branche = true;
  process.on('uncaughtException', (erreur) => { void rapporterErreur(erreur).finally(() => { process.exitCode = 1; }); });
  process.on('unhandledRejection', (erreur) => { void rapporterErreur(erreur); });
}
`;
}

/**
 * Le relais des pages et des applications (« POST /humalis/erreurs ») : il reçoit les seuls champs d'une erreur et refait
 * lui-même les requêtes écrites dans « quand une erreur arrive », avec la clé et l'adresse du .env. Il ne reçoit jamais une
 * adresse ni un en-tête : il ne relaie rien d'autre. Corps limité à 16 ko, 30 rapports par minute et par adresse.
 */
export function codeRelaisErreurs(relais: RequeteCaptureRI[]): string {
  const corps = (r: RequeteCaptureRI) => `{ ${r.champs.map((c) => `${q(c.nom)}: ${typeof c.valeur === 'string' ? `erreur.${c.valeur}` : q(c.valeur.texte)}`).join(', ')} }`;
  return `// Produit par Humalis : le relais des rapports d'erreur des pages et des applications.
import express, { type RequestHandler } from 'express';

${codeEnvoi(relais)}
const parAdresse = new Map<string, number[]>();
const CHAMPS = ['message', 'pile', 'ligne', 'page', 'version'] as const;

/** Texte brut ou JSON : une page l'envoie en texte, sans requête préalable du navigateur. */
export const relaisErreurs: RequestHandler[] = [
  express.text({ type: () => true, limit: '16kb' }),
  (req, res) => {
    const adresseIp = req.ip ?? '';
    const maintenant = Date.now();
    const dates = (parAdresse.get(adresseIp) ?? []).filter((instant) => maintenant - instant < 60_000);
    if (dates.length >= 30) {
      res.status(429).end();
      return;
    }
    dates.push(maintenant);
    parAdresse.set(adresseIp, dates);
    if (parAdresse.size > 5000) for (const [nom, anciennes] of parAdresse) if (anciennes.every((instant) => maintenant - instant >= 60_000)) parAdresse.delete(nom);
    let recu: unknown;
    try { recu = typeof req.body === 'string' ? JSON.parse(req.body) : undefined; } catch { recu = undefined; }
    if (!recu || typeof recu !== 'object' || Array.isArray(recu)) {
      res.status(400).end();
      return;
    }
    const lu = recu as Record<string, unknown>;
    const erreur = Object.fromEntries(CHAMPS.map((nom) => [nom, typeof lu[nom] === 'string' ? nettoyer(lu[nom]) : ''])) as Record<(typeof CHAMPS)[number], string>;
    if (!erreur.message) {
      res.status(400).end();
      return;
    }
    res.status(204).end();
${relais.map((r) => `    void envoyer(${configuration(r)}, ${corps(r)});`).join('\n')}
  },
];
`;
}
