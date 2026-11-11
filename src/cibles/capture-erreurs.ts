/** Lecture sûre des requêtes écrites dans « quand une erreur arrive ». */
import type { Action, FormesRI, Valeur } from '../ri/types.js';

export type ChampErreur = 'message' | 'pile' | 'page' | 'version';
export interface RequeteCapture {
  adresse: string;
  champs: { nom: string; valeur: ChampErreur | { texte: string } }[];
}

const SENSIBLES = /mot.?de.?passe|password|secret|token|jeton|authorization|formulaire|contenu/i;

function champErreur(valeur: Valeur): ChampErreur | { texte: string } | undefined {
  if (valeur.type === 'champDonnee' && valeur.objet.type === 'variable' && valeur.objet.nom === 'erreur' && ['message', 'pile', 'page', 'version'].includes(valeur.champ)) return valeur.champ as ChampErreur;
  if (valeur.type === 'texte' && valeur.parties.every((p) => 'texte' in p)) return { texte: valeur.parties.map((p) => 'texte' in p ? p.texte : '').join('') };
  return undefined;
}

export function requetesCapture(formes: FormesRI | undefined): { requetes: RequeteCapture[]; erreurs: string[] } {
  const requetes: RequeteCapture[] = [];
  const erreurs: string[] = [];
  const actions = formes?.erreurArrive?.ecran.gestionnaires.flatMap((g) => g.actions) ?? [];
  for (const action of actions) {
    if (action.type !== 'requete' || action.mode !== 'envoyer' || action.resultat || action.source || action.direct || action.enAttente) {
      erreurs.push('dans « quand une erreur arrive », seules les requêtes HTTP directes sans réponse ni attente sont disponibles');
      continue;
    }
    if (!/^https:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/i.test(action.adresse)) {
      erreurs.push('la capture des erreurs exige une adresse HTTPS complète');
      continue;
    }
    const champs: RequeteCapture['champs'] = [];
    for (let index = 0; index < action.donnees.length; index++) {
      const nom = action.cles?.[index];
      const valeur = champErreur(action.donnees[index]!);
      if (!nom || SENSIBLES.test(nom) || !valeur) erreurs.push('la capture n’envoie que des champs nommés et des valeurs erreur.message, erreur.pile, erreur.page, erreur.version ou un texte fixe, sans donnée sensible');
      else champs.push({ nom, valeur });
    }
    if (champs.length === action.donnees.length && champs.length > 0) requetes.push({ adresse: action.adresse, champs });
  }
  if (formes?.erreurArrive && actions.length === 0) erreurs.push('la capture des erreurs demande au moins une requête HTTP');
  return { requetes, erreurs: [...new Set(erreurs)] };
}

/** Petit module autonome, chargé avant les pages web, React ou statiques. */
export function codeCaptureNavigateur(requetes: RequeteCapture[], version = '1.0.0'): string {
  const corps = requetes.map((r) => `    try {
      await fetch(${JSON.stringify(r.adresse)}, { method: 'POST', credentials: 'omit', signal: AbortSignal.timeout(3000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ${r.champs.map((c) => `${JSON.stringify(c.nom)}: ${typeof c.valeur === 'string' ? `erreur.${c.valeur}` : JSON.stringify(c.valeur.texte)}`).join(', ')} }), signal: AbortSignal.timeout(3000) });
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
  const erreur = { message: nettoyer(inconnue?.message ?? 'Erreur inconnue'), pile: nettoyer(inconnue?.stack), page: location.pathname, version: ${JSON.stringify(version)} };
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

/** Expo installe ErrorUtils dès le chargement de la disposition racine. */
export function codeCaptureExpo(requetes: RequeteCapture[], version = '1.0.0'): string {
  const corps = requetes.map((r) => `    try {
      const delai = new AbortController();
      const minuteur = setTimeout(() => delai.abort(), 3000);
      try { await fetch(${JSON.stringify(r.adresse)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ${r.champs.map((c) => `${JSON.stringify(c.nom)}: ${typeof c.valeur === 'string' ? `erreur.${c.valeur}` : JSON.stringify(c.valeur.texte)}`).join(', ')} }), signal: delai.signal }); }
      finally { clearTimeout(minuteur); }
    } catch { /* Un échec d'envoi n'interrompt pas l'application. */ }`).join('\n');
  return `// @ts-nocheck
// Produit par Humalis : capture des erreurs d'Expo, sans lire les formulaires.
const dates = new Map();
let enCours = false;
function nettoyer(texte) {
  return String(texte ?? '').slice(0, 4000)
    .replace(/([?&][^=\\s]+)=([^&\\s]+)/g, '$1=[masqué]')
    .replace(/(password|mot.?de.?passe|secret|token|jeton|authorization)(\\s*[:=]\\s*)[^\\s,;]+/gi, '$1$2[masqué]');
}

async function rapporter(inconnue) {
  if (enCours) return;
  const erreur = { message: nettoyer(inconnue?.message ?? 'Erreur inconnue'), pile: nettoyer(inconnue?.stack), page: '', version: ${JSON.stringify(version)} };
  const cle = erreur.message + '|' + erreur.pile.split('\\n')[1];
  const maintenant = Date.now();
  const recentes = (dates.get(cle) ?? []).filter((date) => maintenant - date < 60000);
  if (recentes.length >= 3) return;
  recentes.push(maintenant); dates.set(cle, recentes);
  enCours = true;
  try {
${corps}
  } finally { enCours = false; }
}
const utilitaire = globalThis.ErrorUtils;
if (utilitaire?.setGlobalHandler) {
  const ancien = utilitaire.getGlobalHandler?.();
  utilitaire.setGlobalHandler((erreur, fatale) => {
    void rapporter(erreur);
    if (typeof ancien === 'function') ancien(erreur, fatale);
  });
}
`;
}

/** Le processus principal Electron garde sa propre capture, distincte des fenêtres. */
export function codeCaptureNode(requetes: RequeteCapture[], version = '1.0.0'): string {
  const corps = requetes.map((r) => `    try {
      await fetch(${JSON.stringify(r.adresse)}, { method: 'POST', signal: AbortSignal.timeout(3000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ${r.champs.map((c) => `${JSON.stringify(c.nom)}: ${typeof c.valeur === 'string' ? `erreur.${c.valeur}` : JSON.stringify(c.valeur.texte)}`).join(', ')} }), signal: AbortSignal.timeout(3000) });
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
  const erreur = { message: nettoyer(inconnue?.message ?? 'Erreur inconnue'), pile: nettoyer(inconnue?.stack), page: nettoyer(page), version: ${JSON.stringify(version)} };
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
