/** Lecture sûre des requêtes écrites dans « quand une erreur arrive ». */
import type { Action, ChampErreurRI, FormesRI, JetonRI, RequeteCaptureRI, Valeur } from '../ri/types.js';

export type ChampErreur = ChampErreurRI;
export type RequeteCapture = RequeteCaptureRI;

/**
 * Une requête qui porte un secret, ou dont l'adresse est dans le .env, ne part jamais d'une application : l'application
 * envoie son rapport à son serveur Humalis (« POST /humalis/erreurs »), qui ajoute la clé et refait la requête.
 */
export const estRelayee = (r: RequeteCapture): boolean => r.adresseEnvironnement !== undefined || r.jeton?.genre === 'secret';

/** Le chemin du relais des rapports d'erreur, sur le serveur Humalis. */
export const CHEMIN_RELAIS_ERREURS = '/humalis/erreurs';

/** Une requête envoyée directement par l'application : son adresse complète et ses en-têtes (un jeton public). */
export interface EnvoiDirect {
  adresse: string;
  entetes: Record<string, string>;
  champs: RequeteCapture['champs'];
}

/** Ce que l'application envoie elle-même, et si elle envoie aussi son rapport au relais de son serveur. */
export interface CaptureClient {
  directs: EnvoiDirect[];
  relais: boolean;
}

/** Le jeton public d'une requête directe : dans l'adresse, dans un en-tête, ou en « Authorization: Bearer ». */
export function placerJeton(adresse: string, jeton: JetonRI | undefined): { adresse: string; entetes: Record<string, string> } {
  if (!jeton) return { adresse, entetes: {} };
  if (jeton.place.genre === 'parametre') {
    const url = new URL(adresse);
    url.searchParams.set(jeton.place.nom, jeton.valeur);
    return { adresse: url.toString(), entetes: {} };
  }
  if (jeton.place.genre === 'entete') return { adresse, entetes: { [jeton.place.nom]: jeton.valeur } };
  return { adresse, entetes: { Authorization: `Bearer ${jeton.valeur}` } };
}

export function captureClient(formes: FormesRI | undefined): CaptureClient {
  const requetes = requetesCapture(formes).requetes;
  return {
    directs: requetes.filter((r) => !estRelayee(r)).map((r) => ({ ...placerJeton(r.adresse, r.jeton), champs: r.champs })),
    relais: requetes.some(estRelayee),
  };
}

/** Les champs que le relais reçoit : l'erreur seulement, jamais une adresse ni un en-tête. */
export const CHAMPS_RELAIS: RequeteCapture['champs'] = (['message', 'pile', 'ligne', 'page', 'version'] as const).map((nom) => ({ nom, valeur: nom }));

/** Un envoi tel qu'une cible l'écrit : `adresse` est déjà une expression du langage de la cible. */
export interface EnvoiCible {
  adresse: string;
  entetes: [string, string][];
  champs: RequeteCapture['champs'];
}

/**
 * Les envois d'une application : les requêtes directes (adresse écrite avec `litteral`), puis, s'il le faut, le rapport
 * au relais de son serveur (`relais` : l'expression de l'adresse du serveur, dans le langage de la cible).
 */
export function envoisCible(capture: CaptureClient, litteral: (texte: string) => string, relais: string): EnvoiCible[] {
  return [
    ...capture.directs.map((d) => ({ adresse: litteral(d.adresse), entetes: Object.entries(d.entetes), champs: d.champs })),
    ...(capture.relais ? [{ adresse: relais, entetes: [], champs: CHAMPS_RELAIS }] : []),
  ];
}

const SENSIBLES = /mot.?de.?passe|password|secret|token|jeton|authorization|formulaire|contenu/i;

function champErreur(valeur: Valeur): ChampErreur | { texte: string } | undefined {
  if (valeur.type === 'champDonnee' && valeur.objet.type === 'variable' && valeur.objet.nom === 'erreur' && ['message', 'pile', 'page', 'version', 'ligne'].includes(valeur.champ)) return valeur.champ as ChampErreur;
  if (valeur.type === 'texte' && valeur.parties.every((p) => 'texte' in p)) return { texte: valeur.parties.map((p) => 'texte' in p ? p.texte : '').join('') };
  return undefined;
}

export function requetesCapture(formes: FormesRI | undefined): { requetes: RequeteCapture[]; erreurs: string[] } {
  const requetes: RequeteCapture[] = [];
  const erreurs: string[] = [];
  const actions = formes?.erreurArrive?.ecran.gestionnaires.flatMap((g) => g.actions) ?? [];
  const jeton = formes?.erreurArrive?.jeton;
  for (const action of actions) {
    if (action.type !== 'requete' || action.mode !== 'envoyer' || action.resultat || action.source || action.direct || action.enAttente) {
      erreurs.push('dans « quand une erreur arrive », seules les requêtes HTTP directes sans réponse ni attente sont disponibles');
      continue;
    }
    if (action.adresseEnvironnement === undefined && !/^https:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/i.test(action.adresse)) {
      erreurs.push('la capture des erreurs exige une adresse HTTPS complète');
      continue;
    }
    const champs: RequeteCapture['champs'] = [];
    for (let index = 0; index < action.donnees.length; index++) {
      const nom = action.cles?.[index];
      const valeur = champErreur(action.donnees[index]!);
      if (!nom || SENSIBLES.test(nom) || !valeur) erreurs.push('la capture n’envoie que des champs nommés et des valeurs erreur.message, erreur.pile, erreur.ligne, erreur.page, erreur.version ou un texte fixe, sans donnée sensible');
      else champs.push({ nom, valeur });
    }
    if (champs.length === action.donnees.length && champs.length > 0) requetes.push({ adresse: action.adresse, ...(action.adresseEnvironnement !== undefined ? { adresseEnvironnement: action.adresseEnvironnement } : {}), champs, ...(jeton ? { jeton } : {}) });
  }
  if (formes?.erreurArrive && actions.length === 0) erreurs.push('la capture des erreurs demande au moins une requête HTTP');
  return { requetes, erreurs: [...new Set(erreurs)] };
}

/** Petit module autonome, chargé avant les pages web, React ou statiques. */
/**
 * `serveur` : l'expression JavaScript de l'adresse du serveur Humalis (le relais des rapports qui portent un secret).
 * Le rapport au relais part en texte brut : le navigateur l'envoie sans requête préalable, même vers une autre origine.
 */
export function codeCaptureNavigateur(capture: CaptureClient, version = '1.0.0', serveur = "''"): string {
  const corps = envoisCible(capture, (t) => JSON.stringify(t), `${serveur} + ${JSON.stringify(CHEMIN_RELAIS_ERREURS)}`).map((r, i) => `    try {
      await fetch(${r.adresse}, { method: 'POST', credentials: 'omit', headers: { 'content-type': ${capture.relais && i === capture.directs.length ? "'text/plain'" : "'application/json'"}${r.entetes.map(([n, v]) => `, ${JSON.stringify(n)}: ${JSON.stringify(v)}`).join('')} }, body: JSON.stringify({ ${r.champs.map((c) => `${JSON.stringify(c.nom)}: ${typeof c.valeur === 'string' ? `erreur.${c.valeur}` : JSON.stringify(c.valeur.texte)}`).join(', ')} }), signal: AbortSignal.timeout(3000) });
    } catch { /* L'échec d'envoi ne devient pas une nouvelle erreur. */ }`).join('\n');
  return `// Produit par Humalis : capture des erreurs du navigateur.
const passages = new Map();
let captureEnCours = false;
function nettoyer(valeur) {
  return String(valeur ?? '').slice(0, 4000)
    .replace(/([?&][^=\\s]+)=([^&\\s]+)/g, '$1=[masqué]')
    .replace(/(password|mot.?de.?passe|secret|token|jeton|authorization)(\\s*[:=]\\s*)[^\\s,;]+/gi, '$1$2[masqué]');
}

async function rapporter(inconnue) {
  if (captureEnCours) return;
  // La pile rendue à ses lignes Humalis (« ligne 9 de boutique.humalis ») quand le site en a la table.
  let pile = inconnue?.stack;
  let ligne = '';
  if (window.humalisLignes) {
    try { ({ pile, ligne } = await window.humalisLignes.traduire(pile)); } catch { /* La pile reste celle du navigateur. */ }
  }
  const erreur = { message: nettoyer(inconnue?.message ?? 'Erreur inconnue'), pile: nettoyer(pile), ligne: nettoyer(ligne), page: location.pathname, version: ${JSON.stringify(version)} };
  const cle = erreur.message + '|' + erreur.pile.split('\\n')[1];
  const maintenant = Date.now();
  const dates = (passages.get(cle) ?? []).filter((date) => maintenant - date < 60000);
  if (dates.length >= 3) return;
  dates.push(maintenant);
  passages.set(cle, dates);
  if (passages.size > 500) for (const [nom, anciennes] of passages) if (anciennes.every((date) => maintenant - date >= 60000)) passages.delete(nom);
  captureEnCours = true;
  try {
${corps}
  } finally { captureEnCours = false; }
}
const ancienOnError = window.onerror;
window.onerror = function (message, source, ligne, colonne, erreur) {
  void rapporter(erreur instanceof Error ? erreur : new Error(String(message)));
  return typeof ancienOnError === 'function' ? ancienOnError.call(this, message, source, ligne, colonne, erreur) : false;
};
window.addEventListener('unhandledrejection', (evenement) => { void rapporter(evenement.reason); });
`;
}

/** Le processus principal Electron garde sa propre capture, distincte des fenêtres. */
export function codeCaptureNode(capture: CaptureClient, version = '1.0.0', serveur = "''"): string {
  const corps = envoisCible(capture, (t) => JSON.stringify(t), `${serveur} + ${JSON.stringify(CHEMIN_RELAIS_ERREURS)}`).map((r) => `    try {
      await fetch(${r.adresse}, { method: 'POST', headers: { 'content-type': 'application/json'${r.entetes.map(([n, v]) => `, ${JSON.stringify(n)}: ${JSON.stringify(v)}`).join('')} }, body: JSON.stringify({ ${r.champs.map((c) => `${JSON.stringify(c.nom)}: ${typeof c.valeur === 'string' ? `erreur.${c.valeur}` : JSON.stringify(c.valeur.texte)}`).join(', ')} }), signal: AbortSignal.timeout(3000) });
    } catch { /* Un échec d'envoi ne plante pas le processus principal. */ }`).join('\n');
  return `// @ts-nocheck
// Produit par Humalis : capture du processus principal Electron.
const passages = new Map();
let enCours = false;
function nettoyer(valeur) {
  return String(valeur ?? '').slice(0, 4000)
    .replace(/([?&][^=\\s]+)=([^&\\s]+)/g, '$1=[masqué]')
    .replace(/(password|mot.?de.?passe|secret|token|jeton|authorization)(\\s*[:=]\\s*)[^\\s,;]+/gi, '$1$2[masqué]');
}
export async function rapporterErreur(inconnue, page = '') {
  if (enCours) return;
  const erreur = { message: nettoyer(inconnue?.message ?? 'Erreur inconnue'), pile: nettoyer(inconnue?.stack), ligne: '', page: nettoyer(page), version: ${JSON.stringify(version)} };
  const cle = erreur.message + '|' + erreur.pile.split('\\n')[1];
  const maintenant = Date.now();
  const dates = (passages.get(cle) ?? []).filter((date) => maintenant - date < 60000);
  if (dates.length >= 3) return;
  dates.push(maintenant); passages.set(cle, dates);
  enCours = true;
  try {
${corps}
  } finally { enCours = false; }
}
process.on('uncaughtException', (erreur) => { void rapporterErreur(erreur).finally(() => { process.exitCode = 1; }); });
process.on('unhandledRejection', (erreur) => { void rapporterErreur(erreur); });
`;
}
