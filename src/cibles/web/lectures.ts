import type { Action, Application, Ecran, Valeur } from '../../ri/types.js';
import { estCombine } from '../../ri/types.js';
import { sousActions } from '../../ri/actions.js';
import { camel, chaine } from './noms.js';

/**
 * Ce qui est déjà connu s'affiche tout de suite, le reste se met à jour en
 * arrière-plan : la dernière réponse de chaque lecture (GET) du serveur est
 * gardée (src/humalis/lectures.ts). Une page déjà vue part de cette valeur,
 * puis relit le serveur ; un envoi vers une route oublie ses lectures.
 * Seules les réponses que le serveur permet de garder (« max-age », que le
 * serveur produit met sur ce que tout le monde peut lire) le sont : jamais
 * celles d'une route réservée (« no-store »). Le web les garde aussi pour l'onglet
 * (sessionStorage, avec une taille limitée) ; le mobile, en mémoire.
 */
export function lecturesTs(plateforme: 'web' | 'mobile'): string {
  const web = plateforme === 'web';
  return `/**
 * Produit par Humalis : la dernière réponse de chaque lecture (GET) du serveur.
 * Une page déjà vue s'affiche tout de suite avec elle, puis se met à jour quand
 * le serveur répond. Seules les réponses que le serveur permet de garder
 * (Cache-Control « max-age ») le sont : jamais celles d'une route réservée
 * (connecté, admin), qui répond « no-store ».
 */
${web ? "\n/** L'adresse du serveur : la même origine par défaut, ou VITE_HUMALIS_SERVEUR. */\nconst BASE: string = import.meta.env?.VITE_HUMALIS_SERVEUR ?? '';\n" : ''}
/** Le nombre d'adresses gardées en mémoire ; les plus anciennes partent d'abord. */
const MAXIMUM = 60;
/** Après un envoi, les lectures de sa route demandent au serveur (pas au cache du navigateur) pendant 5 min 30. */
const FRAICHEUR = 330_000;
/** Une lecture préparée (survol d'un lien) n'est pas refaite avant 30 secondes. */
const PREPAREE = 30_000;
${web ? `/** Ce que l'onglet garde (sessionStorage) : une réponse de plus de 200 000 caractères (des photos) reste en mémoire seulement. */
const CLE = 'humalis:lectures';
const TAILLE_UNE = 200_000;
const TAILLE_TOUTES = 1_000_000;
` : ''}
const gardees = new Map<string, unknown>();
${web ? 'const textes = new Map<string, string>();\n' : ''}const enCours = new Map<string, Promise<Response>>();
const envois = new Map<string, number>();
const preparees = new Map<string, number>();
${web ? `
// Au rechargement de l'onglet, les réponses gardées pour lui.
try {
  const stockees = JSON.parse(sessionStorage.getItem(CLE) ?? '{}') as Record<string, string>;
  for (const [adresse, texte] of Object.entries(stockees)) {
    gardees.set(adresse, JSON.parse(texte));
    textes.set(adresse, texte);
  }
} catch {
  // Pas de stockage (navigation privée, prérendu) : la mémoire suffit.
}

function enregistrer(): void {
  try {
    const choisies: Record<string, string> = {};
    let total = 0;
    // Les plus récentes d'abord, tant que la place le permet.
    for (const [adresse, texte] of [...textes].reverse()) {
      if (total + texte.length > TAILLE_TOUTES) continue;
      total += texte.length;
      choisies[adresse] = texte;
    }
    sessionStorage.setItem(CLE, JSON.stringify(choisies));
  } catch {
    // Stockage plein ou interdit : la mémoire suffit.
  }
}
` : ''}
/** « /api/photos?produit=a » et « /api/photos/12 » sont de la route « /api/photos ». */
const deLaRoute = (adresse: string, route: string) => adresse === route || adresse.startsWith(route + '/') || adresse.startsWith(route + '?');

/** La valeur gardée pour cette adresse, sinon la valeur de départ (une liste reste une liste). */
export function lectureGardee<T>(adresse: string, initiale: T): T {
  if (!gardees.has(adresse)) return initiale;
  const valeur = gardees.get(adresse) as T;
  return Array.isArray(initiale) && !Array.isArray(valeur) ? initiale : valeur;
}

/** Garde la réponse d'une lecture publique. */
export function garder(adresse: string, valeur: unknown, texte: string): void {
  gardees.delete(adresse);
  gardees.set(adresse, valeur);
  // Tout juste lue : un lien survolé n'a pas à la redemander.
  preparees.set(adresse, Date.now());
  for (const ancienne of gardees.keys()) {
    if (gardees.size <= MAXIMUM) break;
    gardees.delete(ancienne);
${web ? '    textes.delete(ancienne);\n' : ''}  }
${web ? `  textes.delete(adresse);
  if (texte.length <= TAILLE_UNE) textes.set(adresse, texte);
  enregistrer();
` : '  void texte;\n'}}

/** Un envoi réussi (POST, PATCH, DELETE) : les lectures de sa route sont oubliées, et relues au serveur. */
export function oublier(adresse: string, methode: string): void {
  const chemin = adresse.split('?')[0];
  // « /api/photos/12 » modifié ou supprimé : c'est la route « /api/photos » qui a changé.
  const route = methode === 'POST' ? chemin : chemin.replace(/\\/[^/]*$/, '');
  envois.set(route, Date.now());
  for (const cle of [...gardees.keys()]) if (deLaRoute(cle, route)) gardees.delete(cle);
${web ? '  for (const cle of [...textes.keys()]) if (deLaRoute(cle, route)) textes.delete(cle);\n' : ''}  for (const cle of [...enCours.keys()]) if (deLaRoute(cle, route)) enCours.delete(cle);
  for (const cle of [...preparees.keys()]) if (deLaRoute(cle, route)) preparees.delete(cle);
${web ? '  enregistrer();\n' : ''}}

/**
 * Vrai pour une réponse que le serveur permet de garder : une lecture que tout le monde peut faire
 * (« public, max-age=30 », ou « private, max-age=30 » quand elle pose un cookie). Une route réservée
 * répond « private, no-store » : elle n'est jamais gardée, ni une réponse sans durée.
 */
export const seGarde = (reponse: Response) => {
  const cache = reponse.headers.get('Cache-Control') ?? '';
  return /\\bmax-age=[1-9]/.test(cache) && !/\\bno-store\\b/.test(cache);
};

/**
 * Lit une adresse (GET). Deux lectures de la même adresse en même temps ne
 * font qu'un appel (le survol d'un lien, puis la page) : chacune reçoit sa
 * copie de la réponse.
 */
export async function lireEnCommun(adresse: string, url: string, options: RequestInit): Promise<Response> {
  let attente = enCours.get(adresse);
  if (!attente) {
    const recente = [...envois].some(([route, quand]) => Date.now() - quand < FRAICHEUR && deLaRoute(adresse, route));
    const lancee = fetch(url, { ...options, method: 'GET', ...(recente ? ({ cache: 'no-cache' } as RequestInit) : {}) });
    attente = lancee;
    enCours.set(adresse, lancee);
    const fin = () => {
      if (enCours.get(adresse) === lancee) enCours.delete(adresse);
    };
    lancee.then(fin, fin);
  }
  return (await attente).clone();
}
${web ? `
/**
 * Prépare la lecture d'une page sur le point d'être ouverte (survol ou toucher
 * d'un lien) : sa réponse est gardée, la page s'affiche aussitôt avec elle.
 */
export function prelire(adresse: string): void {
  const derniere = preparees.get(adresse);
  if (derniere !== undefined && Date.now() - derniere < PREPAREE) return;
  preparees.set(adresse, Date.now());
  void lireEnCommun(adresse, BASE + adresse, { credentials: 'same-origin' })
    .then(async (reponse) => {
      if (!reponse.ok || !seGarde(reponse)) return;
      const texte = await reponse.text();
      if (texte !== '') garder(adresse, JSON.parse(texte), texte);
    })
    .catch(() => preparees.delete(adresse));
}
` : '\nvoid PREPAREE;\n'}`;
}

/**
 * Le chargement en avance (src/humalis/prechargement.ts) : le morceau de
 * JavaScript d'une page dès qu'un lien vers elle devient visible (au repos,
 * sauf en mode économie de données), et ses lectures publiques quand on
 * s'apprête à l'ouvrir (survol, toucher, focus).
 */
export const PRECHARGEMENT = `import { matchPath } from 'react-router';
import { prelire } from './lectures';

/** Une page de l'application : son adresse, son morceau de JavaScript et ses lectures publiques (« :id » est son paramètre). */
interface PageConnue {
  chemin: string;
  parent: boolean;
  charger: () => Promise<unknown>;
  lectures: string[];
}

const pages: PageConnue[] = [];
const chargees = new Set<string>();

export function connaitreLesPages(liste: PageConnue[]): void {
  pages.push(...liste);
}

/** Le morceau de la page qu'ouvre cette adresse ; avec \`avecDonnees\`, ses lectures aussi. */
export function precharger(adresse: string, avecDonnees: boolean): void {
  const chemin = adresse.split(/[?#]/)[0] || '/';
  for (const page of pages) {
    const trouvee = matchPath({ path: page.chemin, end: !page.parent }, chemin);
    if (!trouvee) continue;
    if (!chargees.has(page.chemin)) {
      chargees.add(page.chemin);
      page.charger().catch(() => chargees.delete(page.chemin));
    }
    if (!avecDonnees) continue;
    for (const modele of page.lectures) {
      const noms = [...modele.matchAll(/:(\\w+)/g)].map((m) => m[1]);
      if (noms.every((nom) => trouvee.params[nom])) prelire(modele.replace(/:(\\w+)/g, (_, nom: string) => encodeURIComponent(trouvee.params[nom]!)));
    }
  }
}

/** Le mode économie de données, ou une connexion très lente : rien n'est chargé sans qu'on le demande. */
function economie(): boolean {
  const connexion = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return connexion?.saveData === true || /(^|-)2g$/.test(connexion?.effectiveType ?? '');
}

const auRepos = (faire: () => void) =>
  typeof requestIdleCallback === 'function' ? requestIdleCallback(faire, { timeout: 2000 }) : setTimeout(faire, 300);

let observateur: IntersectionObserver | undefined;
const suivis = new WeakMap<Element, string>();

/** Un lien qui devient visible : le morceau de sa page se charge au repos. Rend de quoi arrêter de le suivre. */
export function observerLien(lien: Element, adresse: string): () => void {
  if (typeof IntersectionObserver === 'undefined' || economie()) return () => {};
  observateur ??= new IntersectionObserver(
    (entrees) => {
      for (const entree of entrees) {
        if (!entree.isIntersecting) continue;
        observateur!.unobserve(entree.target);
        const vers = suivis.get(entree.target);
        if (vers !== undefined) auRepos(() => precharger(vers, false));
      }
    },
    { rootMargin: '200px' },
  );
  suivis.set(lien, adresse);
  observateur.observe(lien);
  return () => {
    observateur?.unobserve(lien);
    suivis.delete(lien);
  };
}
`;

/** Une lecture du chargement d'une page, dont la réponse peut servir de valeur de départ. */
export interface LectureDuChargement {
  variable: string;
  /** L'adresse en TypeScript, telle que la page la lit (« `/api/produits/${encodeURIComponent(id)}` »). */
  code: string;
  /** L'adresse avec « :id » pour un paramètre de page, pour la préparer depuis un lien. */
  modele: string;
  /** « ?produit=… » : le filtre déduit d'un « calcul … = photos dont produit est egal a id ». */
  filtre?: { champ: string; parametre: string };
  /** Vrai si tout le monde peut lire cette route du serveur (seules celles-là se préparent). */
  publique: boolean;
}

/** Les adresses (« /api/produits ») des routes du serveur que tout le monde peut lire. */
export function routesPubliques(application: Application): Set<string> {
  return new Set(
    application.serveurs.flatMap((s) => s.routes.filter((r) => r.droits.lire === 'tout_le_monde').map((r) => `/api/${r.adresse.replace(/^\/+/, '')}`)),
  );
}

/** Toutes les valeurs d'un objet de la RI, en profondeur (les nœuds « variable » compris). */
function* noeuds(objet: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(objet)) {
    for (const element of objet) yield* noeuds(element);
  } else if (objet !== null && typeof objet === 'object') {
    yield objet as Record<string, unknown>;
    for (const valeur of Object.values(objet)) yield* noeuds(valeur);
  }
}

const lectureSimple = (a: Action): a is Extract<Action, { type: 'requete' }> =>
  a.type === 'requete' && a.source === undefined && a.resultat !== undefined && (a.mode === 'lire' || a.mode === 'lireUn') && a.filtrant === undefined;

/**
 * « calcul ses_photos = photos dont produit est egal a id » juste après
 * « envoyer requete vers "photos" dans photos » : si la page ne se sert de
 * « photos » que par ce filtre, sur un paramètre de la page (qui ne change
 * pas pendant la lecture), la lecture ne demande que ces éléments au serveur
 * (« ?produit=… »). Le filtre de la page reste : il donne le même résultat,
 * même avec un serveur qui ignorerait la demande.
 */
function filtreDeduit(ecran: Ecran, variable: string): { champ: string; parametre: string } | undefined {
  const parametres = ecran.parametresAdresse ?? [];
  if (parametres.length === 0) return undefined;
  let trouve: { champ: string; parametre: string } | undefined;
  let filtres = 0;
  for (const calcul of ecran.calculs) {
    const v = calcul.valeur;
    if (v.type !== 'filtre' || v.liste.type !== 'variable' || v.liste.nom !== variable) continue;
    const test = v.test;
    if (estCombine(test) || test.negation || test.operateur !== 'egal' || !test.droite) return undefined;
    if (test.gauche.type !== 'variable' || !v.champs.includes(test.gauche.nom)) return undefined;
    if (test.droite.type !== 'variable' || !parametres.includes(test.droite.nom)) return undefined;
    const ici = { champ: test.gauche.nom, parametre: test.droite.nom };
    if (trouve && (trouve.champ !== ici.champ || trouve.parametre !== ici.parametre)) return undefined;
    trouve = ici;
    filtres++;
  }
  if (!trouve) return undefined;
  // La liste ne sert nulle part ailleurs : chaque lecture de « photos » est l'un de ces filtres.
  const tout = [ecran.vue, ecran.calculs.map((c) => c.valeur), ecran.gestionnaires];
  let lectures = 0;
  for (const noeud of noeuds(tout)) {
    if (noeud.type === 'variable' && noeud.nom === variable) lectures++;
    // Un autre usage nommé (changée, ajoutée, état de requête…) : pas de filtre.
    else if (noeud.type !== 'requete' && ['nom', 'liste', 'variable', 'resultat'].some((cle) => noeud[cle] === variable)) return undefined;
  }
  return lectures === filtres ? trouve : undefined;
}

/**
 * Les lectures du serveur faites au chargement de la page (au premier niveau,
 * hors condition) dans une variable de la page : leur dernière réponse est
 * la valeur de départ de la variable. Une adresse qui dépend d'autre chose
 * qu'un paramètre de la page n'en fait pas partie.
 */
export function lecturesDuChargement(ecran: Ecran, publiques: Set<string> = new Set()): LectureDuChargement[] {
  const parametres = ecran.parametresAdresse ?? [];
  const variables = new Set(ecran.etat.filter((e) => !e.memorisee).map((e) => e.nom));
  // Une variable remplie par plusieurs lectures n'a pas une seule adresse : elle est laissée de côté.
  const aplatir = (actions: Action[]): Action[] => actions.flatMap((a) => [a, ...aplatir(sousActions(a).flat())]);
  const toutes = ecran.gestionnaires.flatMap((g) => aplatir(g.actions));
  const remplie = (nom: string) => toutes.filter((a) => a.type === 'requete' && a.resultat === nom).length;
  const resultat: LectureDuChargement[] = [];
  for (const gestionnaire of ecran.gestionnaires.filter((g) => g.declencheur === 'chargement')) {
    for (const action of gestionnaire.actions) {
      if (!lectureSimple(action) || !variables.has(action.resultat!) || remplie(action.resultat!) !== 1) continue;
      const variable = action.resultat!;
      const publique = publiques.has(action.adresse);
      if (action.mode === 'lireUn') {
        const id: Valeur | undefined = action.donnees[0];
        if (id?.type !== 'variable' || !parametres.includes(id.nom)) continue;
        resultat.push({ variable, code: `\`${action.adresse}/\${encodeURIComponent(${camel(id.nom)})}\``, modele: `${action.adresse}/:${camel(id.nom)}`, publique });
        continue;
      }
      const filtre = filtreDeduit(ecran, variable);
      resultat.push(
        filtre
          ? { variable, code: adresseFiltree(action.adresse, filtre), modele: `${action.adresse}?${encodeURIComponent(filtre.champ)}=:${camel(filtre.parametre)}`, filtre, publique }
          : { variable, code: chaine(action.adresse), modele: action.adresse, publique },
      );
    }
  }
  return resultat;
}

/** « `/api/photos?produit=${encodeURIComponent(id)}` ». */
export function adresseFiltree(adresse: string, filtre: { champ: string; parametre: string }): string {
  return `\`${adresse}?${encodeURIComponent(filtre.champ)}=\${encodeURIComponent(${camel(filtre.parametre)})}\``;
}
