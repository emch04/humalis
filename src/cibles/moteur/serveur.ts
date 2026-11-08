/** Le transport du moteur : le texte produit reste du JavaScript sans React. */
import type { Application } from '../../ri/types.js';
import { variableDAdresse } from '../web/sources.js';

export function serveurJs(o: { application: Application; session: boolean; sessionDuServeur: boolean }): string {
  const { application, session, sessionDuServeur } = o;
  const sources = application.sources.length > 0;
  const fichiers = JSON.stringify(application).includes('"type":"envoiFichier"');
  const sourceSession = application.sources.find((source) => source.session);
  const configuration = application.sources.map((source) => {
    const nom = variableDAdresse(source, 'VITE');
    return `  ${JSON.stringify(source.nom)}: { base: import.meta.env.${nom} ?? ${JSON.stringify(source.adresse.replace(/\/+$/, ''))}, session: ${source.session}, enveloppe: ${JSON.stringify(source.enveloppe)}, erreur: ${JSON.stringify(source.erreurDans)}, entetes: ${JSON.stringify(Object.fromEntries(source.entetes.map((e) => [e.nom, e.valeur])))}, jeton: ${JSON.stringify(source.jetonPublic)}, essais: ${source.essais ?? 2}, delai: ${source.delai ?? 10}, cache: ${source.cache ?? 0} }`;
  }).join(',\n');
  const baseSession = sourceSession
    ? `import.meta.env.${variableDAdresse(sourceSession, 'VITE')} ?? ${JSON.stringify(sourceSession.adresse.replace(/\/+$/, ''))}`
    : 'import.meta.env.VITE_HUMALIS_SERVEUR ?? \'\'';
  return `// Produit par Humalis : les requêtes et la session des pages.
import { signal, nettoyer } from './moteur.js';
import { afficherMessage } from './outils.js';
${sessionDuServeur ? "import { createSessionClient, SessionExpiredError } from '@astratra/client';\n" : ''}
${BASE}
${LECTURES}
${sources ? `const SOURCES = {\n${configuration}\n};\n${SOURCES}` : ''}
${sessionDuServeur ? RENOUVELLEMENT : ''}
${serveurTexte(sources, sessionDuServeur)}
${session ? sessionTexte(baseSession, sourceSession !== undefined, sessionDuServeur) : ''}
${fichiers && sources ? TELEVERSER : ''}`;
}

function sessionTexte(base: string, source: boolean, renouveler: boolean): string {
  return SESSION
    .replace('BASE_SESSION', base)
    .replaceAll('CREDENTIALS_SESSION', source ? 'include' : 'same-origin')
    .replace('LIRE_SESSION', renouveler ? 'avecSession(lancer)' : 'lancer()')
    .replace('MESSAGE_EXPIRATION', renouveler ? 'erreur instanceof SessionFinie && erreur.expiree && !erreur.dejaDite' : 'false')
    .replace('TRACER_SESSION', renouveler ? 'true' : 'false')
    .replace('CHANGER_SESSION', renouveler ? 'avecSession(lancer)' : 'lancer()')
    .replace('ERREUR_CHANGER', renouveler ? 'erreur instanceof SessionFinie ? erreur.message : REESSAYER()' : 'REESSAYER()')
    .replace('SORTIE_TRACE', renouveler ? 'tracer(false);' : '')
    .replace('SORTIE_SESSION', renouveler ? 'avecSession(lancer)' : 'lancer()')
    .replace('ERREUR_SORTIE', renouveler ? '!(erreur instanceof SessionFinie)' : 'true');
}

const BASE = String.raw`const BASE = import.meta.env.VITE_HUMALIS_SERVEUR ?? '';
const PAS_DE_REPONSE = "Le serveur n'a pas répondu.";
const REESSAYER = () => "Le serveur n'a pas répondu. Réessayez dans un instant.";
export const REPOS = { statut: 'repos', message: '' };
const raisonDe = (erreur) => erreur instanceof Error && !(erreur instanceof TypeError) && !(erreur instanceof SyntaxError) ? erreur.message : PAS_DE_REPONSE;
const csrf = () => document.cookie.match(/(?:^|; )astratra_csrf=([^;]*)/)?.[1];
const ajouterCsrf = (entetes) => { const jeton = csrf(); if (jeton) entetes.set('x-csrf-token', decodeURIComponent(jeton)); return entetes; };
const numeros = new Map();
export function derniereRequete(variable) {
  const numero = (numeros.get(variable) ?? 0) + 1;
  numeros.set(variable, numero);
  return () => numeros.get(variable) === numero;
}
`;

const LECTURES = String.raw`
const MAXIMUM = 60, FRAICHEUR = 330000;
const CLE = 'humalis:lectures', TAILLE_UNE = 200000, TAILLE_TOUTES = 1000000;
const gardees = new Map(), textes = new Map(), enCours = new Map(), envois = new Map(), preparees = new Map();
try {
  const stockees = JSON.parse(sessionStorage.getItem(CLE) ?? '{}');
  for (const [adresse, texte] of Object.entries(stockees)) { gardees.set(adresse, JSON.parse(texte)); textes.set(adresse, texte); }
} catch { /* Le stockage peut être interdit. */ }
function enregistrer() {
  try {
    const choisies = {}; let total = 0;
    for (const [adresse, texte] of [...textes].reverse()) {
      if (total + texte.length > TAILLE_TOUTES) continue;
      total += texte.length; choisies[adresse] = texte;
    }
    sessionStorage.setItem(CLE, JSON.stringify(choisies));
  } catch { /* La mémoire suffit. */ }
}
/** Le temps réel d'une couche : chaque route lue « en direct » est écoutée une fois, et fermée avec la couche. */
export function directDeCouche() {
  const ouverts = new Map();
  nettoyer(() => {
    for (const e of ouverts.values()) e.close();
  });
  return (adresse, relire) => {
    if (ouverts.has(adresse)) return;
    let attente;
    let dejaOuvert = false;
    const rafraichir = () => {
      clearTimeout(attente);
      attente = setTimeout(() => {
        oublier(adresse, 'POST');
        relire();
      }, 120);
    };
    const flux = new EventSource(BASE + adresse + '/direct', { withCredentials: BASE !== '' });
    flux.onmessage = rafraichir;
    // Une reconnexion : on rattrape ce qui a changé pendant la coupure.
    flux.onopen = () => {
      if (dejaOuvert) rafraichir();
      dejaOuvert = true;
    };
    ouverts.set(adresse, flux);
  };
}

export function lectureGardee(adresse, initiale) {
  if (!gardees.has(adresse)) return initiale;
  const valeur = gardees.get(adresse);
  return Array.isArray(initiale) && !Array.isArray(valeur) ? initiale : valeur;
}
const deLaRoute = (adresse, route) => adresse === route || adresse.startsWith(route + '/') || adresse.startsWith(route + '?');
function garder(adresse, valeur, texte) {
  gardees.delete(adresse); gardees.set(adresse, valeur); preparees.set(adresse, Date.now());
  for (const ancienne of gardees.keys()) {
    if (gardees.size <= MAXIMUM) break;
    gardees.delete(ancienne); textes.delete(ancienne);
  }
  textes.delete(adresse);
  if (texte.length <= TAILLE_UNE) textes.set(adresse, texte);
  enregistrer();
}
function oublier(adresse, methode) {
  const chemin = adresse.split('?')[0];
  const route = methode === 'POST' ? chemin : chemin.replace(/\/[^/]*$/, '');
  envois.set(route, Date.now());
  for (const cle of [...gardees.keys()]) if (deLaRoute(cle, route)) gardees.delete(cle);
  for (const cle of [...textes.keys()]) if (deLaRoute(cle, route)) textes.delete(cle);
  for (const cle of [...enCours.keys()]) if (deLaRoute(cle, route)) enCours.delete(cle);
  for (const cle of [...preparees.keys()]) if (deLaRoute(cle, route)) preparees.delete(cle);
  enregistrer();
}
const seGarde = (reponse) => { const cache = reponse.headers.get('Cache-Control') ?? ''; return /\bmax-age=[1-9]/.test(cache) && !/\bno-store\b/.test(cache); };
async function lireEnCommun(adresse, url, options) {
  let attente = enCours.get(adresse);
  if (!attente) {
    const recente = [...envois].some(([route, quand]) => Date.now() - quand < FRAICHEUR && deLaRoute(adresse, route));
    const lancee = fetch(url, { ...options, method: 'GET', ...(recente ? { cache: 'no-cache' } : {}) });
    attente = lancee; enCours.set(adresse, lancee);
    const fin = () => { if (enCours.get(adresse) === lancee) enCours.delete(adresse); };
    lancee.then(fin, fin);
  }
  return (await attente).clone();
}
`;

const SOURCES = String.raw`
class ErreurSource extends Error { constructor(code, message) { super(message); this.code = code; } }
const cacheDesSources = {
  valeurs: new Map(), enCours: new Map(),
  vider(base) { for (const cle of [...this.valeurs.keys()]) if (cle.split(' ')[1].startsWith(base)) this.valeurs.delete(cle); },
};
const avecId = (adresse, id) => adresse.includes(':id') ? adresse.replace(':id', encodeURIComponent(id)) : adresse + '/' + encodeURIComponent(id);
const attendre = (ms) => new Promise((resoudre) => setTimeout(resoudre, ms));
function suivre(valeur, chemin) {
  if (!chemin) return valeur;
  return chemin.split('.').reduce((courant, cle) => courant !== null && typeof courant === 'object' ? courant[cle] : undefined, valeur);
}
async function executerSource(url, options, entetes, source, lecture) {
  const essais = lecture ? source.essais : 0;
  for (let tentative = 0; ; tentative++) {
    const controle = new AbortController();
    const minuteur = setTimeout(() => controle.abort(), source.delai * 1000);
    try {
      const reponse = await fetch(url, { ...options, headers: entetes, credentials: source.session ? 'include' : 'omit', redirect: 'follow', signal: controle.signal });
      const texte = await reponse.text();
      const corps = texte === '' ? undefined : (() => { try { return JSON.parse(texte); } catch { return undefined; } })();
      if (reponse.ok) return corps;
      if (tentative < essais && [429, 502, 503, 504].includes(reponse.status)) {
        const pause = Number(reponse.headers.get('Retry-After'));
        await attendre(pause > 0 ? Math.min(pause, 10) * 1000 : tentative === 0 ? 500 : 1500);
        continue;
      }
      const message = suivre(corps, source.erreur);
      throw new ErreurSource(reponse.status, typeof message === 'string' ? message : '');
    } catch (erreur) {
      if (erreur instanceof ErreurSource) throw erreur;
      if (tentative < essais) { await attendre(tentative === 0 ? 500 : 1500); continue; }
      throw erreur;
    } finally { clearTimeout(minuteur); }
  }
}
function extraire(brut, source, appel, actuelle) {
  if (brut === undefined) return actuelle;
  const valeur = suivre(suivre(brut, source.enveloppe), appel.dans);
  if (valeur === undefined || valeur === null) return actuelle;
  return Array.isArray(actuelle) && !Array.isArray(valeur) ? actuelle : valeur;
}
function messageDeLErreur(erreur) {
  if (erreur instanceof ErreurSource) {
    if (erreur.code === 429) return 'Trop de demandes en peu de temps. Patientez un moment, puis réessayez.';
    if (erreur.code === 401) return 'Connectez-vous pour continuer.';
    if (erreur.message !== '' && erreur.code >= 400 && erreur.code < 500) return erreur.message;
    if (erreur.code === 404) return "Ce que vous cherchez n'existe pas.";
  }
  return REESSAYER();
}
async function appelerSource(adresse, options, actuelle, appel) {
  const source = SOURCES[appel.source], lecture = options.method === 'GET';
  appel.suivi?.({ statut: 'chargement', message: '' });
  try {
    const parametres = new URLSearchParams();
    for (const [cle, valeur] of Object.entries(appel.filtres ?? {})) if (valeur !== null && valeur !== undefined && valeur !== '') parametres.set(cle, String(valeur));
    if (source.jeton?.place.genre === 'parametre') parametres.set(source.jeton.place.nom, source.jeton.valeur);
    const chemin = adresse.replace(/^\/+/, '');
    const url = source.base + '/' + chemin + (parametres.size > 0 ? '?' + parametres : '');
    const entetes = new Headers(options.headers);
    for (const [nom, valeur] of Object.entries(source.entetes)) entetes.set(nom, valeur);
    if (source.jeton?.place.genre === 'autorisation') entetes.set('Authorization', 'Bearer ' + source.jeton.valeur);
    if (source.jeton?.place.genre === 'entete') entetes.set(source.jeton.place.nom, source.jeton.valeur);
    if (source.session && !lecture) ajouterCsrf(entetes);
    const cle = (source.session ? 'session' : 'public') + ' ' + url;
    if (lecture && source.cache > 0 && !appel.contourner) {
      const garde = cacheDesSources.valeurs.get(cle);
      if (garde && garde.fin > Date.now()) return extraire(garde.valeur, source, appel, actuelle);
    }
    let attente = lecture && !appel.contourner ? cacheDesSources.enCours.get(cle) : undefined;
    if (!attente) {
      attente = executerSource(url, options, entetes, source, lecture);
      if (lecture) {
        cacheDesSources.enCours.set(cle, attente);
        void attente.then(
          (valeur) => { cacheDesSources.enCours.delete(cle); if (source.cache > 0) cacheDesSources.valeurs.set(cle, { valeur, fin: Date.now() + source.cache * 1000 }); },
          () => cacheDesSources.enCours.delete(cle),
        );
      }
    }
    const brut = await attente;
    if (!lecture) cacheDesSources.vider(source.base);
    appel.suivi?.(REPOS);
    return extraire(brut, source, appel, actuelle);
  } catch (erreur) {
    const message = messageDeLErreur(erreur);
    derniereRaison = message; echecs++;
    appel.suivi?.({ statut: erreur instanceof ErreurSource && erreur.code === 404 ? 'introuvable' : 'erreur', message });
    if (!appel.silencieux) dire(message, 'erreur', appel.relancer);
    return actuelle;
  }
}
`;

const RENOUVELLEMENT = String.raw`
const EXPIREE = 'Votre session a expiré. Connectez-vous de nouveau.';
const DEMANDEE = 'Connectez-vous pour continuer.';
const TRACE = 'humalis.session';
function tracer(ouverte) { try { if (ouverte) localStorage.setItem(TRACE, '1'); else localStorage.removeItem(TRACE); } catch {} }
function tracee() { try { return localStorage.getItem(TRACE) === '1'; } catch { return false; } }
class SessionFinie extends Error { constructor(message, expiree, dejaDite) { super(message); this.expiree = expiree; this.dejaDite = dejaDite; } }
const client = createSessionClient({
  request: async (_chemin, lancer) => { const reponse = await lancer(); if (reponse.status === 401) throw Object.assign(new Error('401'), { status: 401 }); return reponse; },
  refresh: async () => { const reponse = await fetch(BASE + '/auth/refresh', { method: 'POST', credentials: 'same-origin' }); if (!reponse.ok) throw Object.assign(new Error(PAS_DE_REPONSE), { status: reponse.status }); },
});
let derniereFin = 0;
function finDeSession() {
  const dejaDite = Date.now() - derniereFin < 3000, expiree = tracee();
  if (expiree) { tracer(false); derniereFin = Date.now(); }
  personne.v = null; pret.v = true;
  return new SessionFinie(expiree || dejaDite ? EXPIREE : DEMANDEE, expiree, dejaDite);
}
async function avecSession(lancer) {
  try { return await client.call('', lancer); }
  catch (erreur) { if (erreur instanceof SessionExpiredError || erreur?.status === 401) throw finDeSession(); throw erreur; }
}
`;

function serveurTexte(sources: boolean, renouveler: boolean): string {
  return String.raw`
let derniereRaison = PAS_DE_REPONSE, echecs = 0, silence = 0;
function dire(message, genre, relancer) { if (silence === 0) afficherMessage(message, genre, relancer); }
async function reduireImage(fichier) {
  const image = await createImageBitmap(fichier);
  const echelle = Math.min(1, 480 / Math.max(image.width, image.height));
  const toile = document.createElement('canvas');
  toile.width = Math.max(1, Math.round(image.width * echelle));
  toile.height = Math.max(1, Math.round(image.height * echelle));
  const dessin = toile.getContext('2d');
  dessin.fillStyle = '#fff'; dessin.fillRect(0, 0, toile.width, toile.height);
  dessin.drawImage(image, 0, 0, toile.width, toile.height);
  let qualite = 0.85, texte = toile.toDataURL('image/jpeg', qualite);
  while (texte.length > 90000 && qualite > 0.4) { qualite -= 0.15; texte = toile.toDataURL('image/jpeg', qualite); }
  return texte;
}
async function preparer(donnees) {
  const pret = {};
  for (const [cle, valeur] of Object.entries(donnees)) {
    const brut = valeur?.brut;
    pret[cle] = brut instanceof File && brut.type.startsWith('image/') ? await reduireImage(brut).catch(() => valeur) : valeur;
  }
  return pret;
}
async function appeler(adresse, options, actuelle) {
  try {
    const entetes = new Headers(options.headers);
    if (options.method !== 'GET') ajouterCsrf(entetes);
    const lecture = options.method === 'GET';
    const envoi = { ...options, headers: entetes, credentials: 'same-origin' };
    const lancer = () => lecture ? lireEnCommun(adresse, BASE + adresse, envoi) : fetch(BASE + adresse, envoi);
    const reponse = await ${renouveler ? 'avecSession(lancer)' : 'lancer()'};
    if (reponse.status === 404 && lecture) return actuelle;
    ${renouveler ? '' : "if (reponse.status === 401) throw new Error('Connectez-vous pour continuer.');"}
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null);
      throw new Error(typeof corps?.erreur === 'string' && corps.erreur !== '' ? corps.erreur.charAt(0).toUpperCase() + corps.erreur.slice(1) + '.' : PAS_DE_REPONSE);
    }
    if (!lecture) oublier(adresse, options.method ?? 'POST');
    const texte = await reponse.text();
    if (texte === '') return actuelle;
    const valeur = JSON.parse(texte);
    if (Array.isArray(actuelle) && !Array.isArray(valeur)) return actuelle;
    if (lecture && seGarde(reponse)) garder(adresse, valeur, texte);
    return valeur;
  } catch (erreur) {
    echecs++; derniereRaison = raisonDe(erreur);
    if (${renouveler ? 'erreur instanceof SessionFinie && erreur.dejaDite' : 'false'}) return actuelle;
    dire(derniereRaison === PAS_DE_REPONSE ? REESSAYER() : derniereRaison, 'erreur');
    return actuelle;
  }
}
async function telecharger(adresse, id) {
  try {
    const lancer = () => fetch(BASE + adresse + '/' + encodeURIComponent(id) + '/bon', { method: 'GET', credentials: 'same-origin' });
    const reponse = await ${renouveler ? 'avecSession(lancer)' : 'lancer()'};
    ${renouveler ? '' : "if (reponse.status === 401) throw new Error('Connectez-vous pour continuer.');"}
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null);
      throw new Error(typeof corps?.erreur === 'string' && corps.erreur !== '' ? corps.erreur.charAt(0).toUpperCase() + corps.erreur.slice(1) + '.' : PAS_DE_REPONSE);
    }
    const nom = /filename="([^"]+)"/.exec(reponse.headers.get('Content-Disposition') ?? '')?.[1] ?? 'document.pdf';
    const adresseFichier = URL.createObjectURL(await reponse.blob());
    const lien = document.createElement('a'); lien.href = adresseFichier; lien.download = nom;
    document.body.append(lien); lien.click(); lien.remove();
    setTimeout(() => URL.revokeObjectURL(adresseFichier), 10000);
  } catch (erreur) {
    echecs++; derniereRaison = raisonDe(erreur);
    if (${renouveler ? 'erreur instanceof SessionFinie && erreur.dejaDite' : 'false'}) return;
    dire(derniereRaison === PAS_DE_REPONSE ? REESSAYER() : derniereRaison, 'erreur');
  }
}
export const serveur = {
  raison: () => derniereRaison,
  echecs: () => echecs,
  taire: (oui) => { silence += oui ? 1 : -1; },
  lire: (adresse, actuelle, options) => ${sources ? "options?.source ? appelerSource(adresse, { method: 'GET' }, actuelle, options) : " : ''}appeler(adresse, { method: 'GET' }, actuelle),
  lireUn: (adresse, id, actuelle, options) => ${sources ? "options?.source ? appelerSource(avecId(adresse, id), { method: 'GET' }, actuelle, options) : " : ''}appeler(adresse + '/' + encodeURIComponent(id), { method: 'GET' }, actuelle),
  envoyer: async (adresse, donnees, actuelle, options) => {
    const requete = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(await preparer(donnees)) };
    return ${sources ? 'options?.source ? appelerSource(adresse, requete, actuelle, options) : ' : ''}appeler(adresse, requete, actuelle);
  },
  supprimer: (adresse, id, options) => ${sources ? "options?.source ? appelerSource(avecId(adresse, id), { method: 'DELETE' }, undefined, options) : " : ''}appeler(adresse + '/' + encodeURIComponent(id), { method: 'DELETE' }, undefined),
  modifier: async (adresse, id, donnees, options) => {
    const requete = { method: ${sources ? "options?.source && options.remplacement ? 'PUT' : 'PATCH'" : "'PATCH'"}, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(await preparer(donnees)) };
    return ${sources ? 'options?.source ? appelerSource(avecId(adresse, id), requete, undefined, options) : ' : ''}appeler(adresse + '/' + encodeURIComponent(id), requete, undefined);
  },
  telecharger,
};
`;
}

const SESSION = String.raw`
const BASE_AUTH = BASE_SESSION;
const CREDENTIALS_AUTH = 'CREDENTIALS_SESSION';
const personne = signal(null), pret = signal(false);
export const utilisateur = {
  get personne() { return personne.v; },
  get pret() { return pret.v; },
  get connecte() { return personne.v !== null; },
  get admin() { return personne.v?.role === 'admin'; },
  seConnecter, seConnecterAvecGoogle, changerMotDePasse, inviter,
  demanderLienMotDePasse, choisirMotDePasse, seDeconnecter,
};
function entetesSession() { return ajouterCsrf(new Headers({ 'Content-Type': 'application/json' })); }
function refuser(texte, dansUnEssai) {
  if (dansUnEssai) throw new Error(texte);
  dire(texte, 'erreur'); return false;
}
export async function relireSession() {
  try {
    const lancer = () => fetch(BASE_AUTH + '/auth/me', { credentials: CREDENTIALS_AUTH });
    const reponse = await LIRE_SESSION;
    const corps = reponse.ok ? await reponse.json() : null;
    personne.v = corps?.data?.id !== undefined ? corps.data : null;
  } catch (erreur) {
    personne.v = null;
    if (MESSAGE_EXPIRATION) dire(erreur.message, 'avertissement');
  }
  if (TRACER_SESSION && personne.v) tracer(true);
  pret.v = true;
}
async function seConnecter(email, motDePasse, dansUnEssai = false) {
  let reponse;
  try {
    reponse = await fetch(BASE_AUTH + '/auth/login', { method: 'POST', headers: entetesSession(), credentials: CREDENTIALS_AUTH, body: JSON.stringify({ email, password: motDePasse }) });
  } catch { return refuser(REESSAYER(), dansUnEssai); }
  if (reponse.status === 429) return refuser('Trop de tentatives de connexion. Réessayez dans quelques minutes.', dansUnEssai);
  if (!reponse.ok) return refuser('Email ou mot de passe incorrect.', dansUnEssai);
  await relireSession(); return true;
}
async function seConnecterAvecGoogle(dansUnEssai = false) {
  let clientId = null;
  try {
    const reponse = await fetch(BASE_AUTH + '/auth/google', { credentials: CREDENTIALS_AUTH });
    clientId = reponse.ok ? (await reponse.json()).clientId ?? null : null;
  } catch { return refuser(REESSAYER(), dansUnEssai); }
  if (!clientId) return refuser("La connexion avec Google n'est pas encore réglée sur le serveur.", dansUnEssai);
  const nonce = crypto.randomUUID(), etat = crypto.randomUUID();
  const parametres = new URLSearchParams({ client_id: clientId, redirect_uri: window.location.origin + '/auth-google.html', response_type: 'id_token', scope: 'openid email', nonce, state: etat, prompt: 'select_account' });
  const canal = new BroadcastChannel('humalis-google');
  const fenetre = window.open('https://accounts.google.com/o/oauth2/v2/auth?' + parametres, 'humalis-google', 'width=480,height=640');
  if (!fenetre) { canal.close(); return refuser('La fenêtre de Google a été bloquée : autorisez les fenêtres pour ce site, puis réessayez.', dansUnEssai); }
  const jeton = await new Promise((resoudre) => {
    const fin = setTimeout(() => resoudre(null), 180000);
    canal.onmessage = (evenement) => {
      if (evenement.data?.etat !== etat) return;
      clearTimeout(fin); resoudre(evenement.data.idToken ?? null);
    };
  });
  canal.close();
  if (!jeton) return refuser('La connexion avec Google a été annulée.', dansUnEssai);
  let reponse;
  try {
    reponse = await fetch(BASE_AUTH + '/auth/google', { method: 'POST', headers: entetesSession(), credentials: CREDENTIALS_AUTH, body: JSON.stringify({ idToken: jeton, nonce }) });
  } catch { return refuser(REESSAYER(), dansUnEssai); }
  if (!reponse.ok) {
    const corps = await reponse.json().catch(() => null);
    const raison = corps?.erreur ?? 'la connexion avec Google a été refusée';
    return refuser(raison.charAt(0).toUpperCase() + raison.slice(1) + '.', dansUnEssai);
  }
  await relireSession(); return true;
}
async function envoyerAuCompte(chemin, donnees, dansUnEssai, sansRaison) {
  let reponse;
  try { reponse = await fetch(BASE_AUTH + chemin, { method: 'POST', headers: entetesSession(), credentials: CREDENTIALS_AUTH, body: JSON.stringify(donnees) }); }
  catch { return refuser(REESSAYER(), dansUnEssai); }
  if (reponse.status === 429) return refuser('Trop de tentatives. Réessayez dans quelques minutes.', dansUnEssai);
  if (reponse.status === 401) return refuser('Connectez-vous pour continuer.', dansUnEssai);
  if (!reponse.ok) {
    const corps = await reponse.json().catch(() => null), raison = corps?.erreur;
    return refuser(raison ? raison.charAt(0).toUpperCase() + raison.slice(1) + '.' : sansRaison, dansUnEssai);
  }
  return true;
}
function inviter(email, role, dansUnEssai = false) { return envoyerAuCompte('/auth/invitations', { email, role }, dansUnEssai, "L'invitation n'est pas partie."); }
function demanderLienMotDePasse(email, dansUnEssai = false) { return envoyerAuCompte('/auth/forgot-password', { email }, dansUnEssai, "Cette adresse e-mail n'est pas valable."); }
async function choisirMotDePasse(nouveau, dansUnEssai = false) {
  const jeton = new URLSearchParams(window.location.hash.slice(1)).get('jeton') ?? '';
  const fait = await envoyerAuCompte('/auth/reset-password', { token: jeton, password: nouveau }, dansUnEssai, "Ce lien n'est plus valable. Demandez-en un nouveau.");
  if (fait) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return fait;
}
async function changerMotDePasse(actuel, nouveau, dansUnEssai = false) {
  let reponse;
  try { const lancer = () => fetch(BASE_AUTH + '/auth/mot-de-passe', { method: 'POST', headers: entetesSession(), credentials: CREDENTIALS_AUTH, body: JSON.stringify({ actuel, nouveau }) }); reponse = await CHANGER_SESSION; }
  catch (erreur) { return refuser(ERREUR_CHANGER, dansUnEssai); }
  if (reponse.status === 429) return refuser('Trop de tentatives. Réessayez dans quelques minutes.', dansUnEssai);
  if (!reponse.ok) {
    const corps = await reponse.json().catch(() => null), raison = corps?.erreur ?? "le mot de passe n'a pas été changé";
    return refuser(raison.charAt(0).toUpperCase() + raison.slice(1) + '.', dansUnEssai);
  }
  return true;
}
async function seDeconnecter() {
  SORTIE_TRACE
  try { const lancer = () => fetch(BASE_AUTH + '/auth/logout', { method: 'POST', headers: entetesSession(), credentials: CREDENTIALS_AUTH }); await SORTIE_SESSION; }
  catch (erreur) { if (ERREUR_SORTIE) dire(REESSAYER(), 'erreur'); }
  await relireSession();
}
`;

const TELEVERSER = String.raw`
function envoyerUnFichier(fichier, adresse, options, avancer) {
  const source = SOURCES[options.source];
  return new Promise((resoudre, rejeter) => {
    const parametres = new URLSearchParams();
    if (source.jeton?.place.genre === 'parametre') parametres.set(source.jeton.place.nom, source.jeton.valeur);
    const url = source.base + '/' + adresse.replace(/^\/+/, '') + (parametres.size > 0 ? '?' + parametres : '');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url); xhr.withCredentials = source.session; xhr.timeout = source.delai * 1000 * 6;
    xhr.setRequestHeader('Accept', 'application/json');
    for (const [nom, valeur] of Object.entries(source.entetes)) xhr.setRequestHeader(nom, valeur);
    if (source.jeton?.place.genre === 'autorisation') xhr.setRequestHeader('Authorization', 'Bearer ' + source.jeton.valeur);
    if (source.jeton?.place.genre === 'entete') xhr.setRequestHeader(source.jeton.place.nom, source.jeton.valeur);
    if (source.session) { const jeton = csrf(); if (jeton) xhr.setRequestHeader('x-csrf-token', decodeURIComponent(jeton)); }
    let corps;
    if (options.corpsBrut) { xhr.setRequestHeader('Content-Type', fichier.brut.type || 'application/octet-stream'); corps = fichier.brut; }
    else { corps = new FormData(); corps.append(options.champ ?? 'fichier', fichier.brut, fichier.nom); }
    xhr.upload.onprogress = (evenement) => { if (evenement.lengthComputable) avancer(evenement.loaded / evenement.total); };
    xhr.onload = () => {
      let json;
      try { json = xhr.responseText === '' ? undefined : JSON.parse(xhr.responseText); } catch { json = undefined; }
      if (xhr.status >= 200 && xhr.status < 300) return resoudre(json);
      const message = suivre(json, source.erreur);
      rejeter({ code: xhr.status, message: typeof message === 'string' ? message : '' });
    };
    xhr.onerror = () => rejeter({ code: 0, message: '' });
    xhr.ontimeout = () => rejeter({ code: 0, message: '' });
    xhr.send(corps);
  });
}
function messageDuFichier(erreur) {
  if (erreur.code === 429) return 'Trop de demandes en peu de temps. Patientez un moment, puis réessayez.';
  if (erreur.code === 401) return 'Connectez-vous pour continuer.';
  if (erreur.code === 413) return erreur.message || 'Ce fichier est trop gros pour le serveur.';
  if (erreur.message !== '' && erreur.code >= 400 && erreur.code < 500) return erreur.message;
  return REESSAYER();
}
export async function televerser(choisi, adresse, options, actuelle) {
  const fichiers = Array.isArray(choisi) ? choisi : choisi ? [choisi] : [];
  const source = SOURCES[options.source];
  if (fichiers.length === 0) {
    const message = "Choisissez d'abord un fichier.";
    if (!options.silencieux) (options.message ?? dire)(message, 'erreur');
    options.suivi?.({ statut: 'erreur', message });
    return actuelle;
  }
  options.suivi?.({ statut: 'chargement', message: '' }); options.progression?.(0);
  const reponses = [];
  try {
    for (const [i, fichier] of fichiers.entries()) {
      const brut = await envoyerUnFichier(fichier, adresse, options, (fraction) => options.progression?.(Math.round(((i + fraction) / fichiers.length) * 100)));
      const valeur = suivre(brut, source.enveloppe);
      reponses.push(valeur !== null && typeof valeur === 'object' && 'fichier' in valeur ? valeur.fichier : valeur);
    }
    options.progression?.(100); options.suivi?.(REPOS);
    return Array.isArray(choisi) ? reponses : reponses[0];
  } catch (erreur) {
    const message = messageDuFichier(erreur);
    options.suivi?.({ statut: erreur.code === 404 ? 'introuvable' : 'erreur', message });
    if (!options.silencieux) (options.message ?? dire)(message, 'erreur');
    return actuelle;
  }
}
`;
