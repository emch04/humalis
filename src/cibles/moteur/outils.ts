/**
 * `humalis/outils.js` et `humalis/navigation.js` : les outils des pages, en
 * modules : l'assembleur ne garde que ce qu'une page emploie. Les textes
 * (messages, formats, presse-papier…) sont ceux de la cible statique.
 */
import { MESSAGES_JS, LISTES_JS, STOCKAGE_JS, PRESSE_PAPIER_JS, QUESTIONS_JS } from '../statique/projet.js';
import { elementsJs, exportsElements, type UsageElements } from '../statique/elements-js.js';
import { FORMAT_JS, FORMAT_JS_LANGUES, TAILLE_JS, DATES_JS } from '../format.js';
import { CLE_LANGUE } from '../web/langue.js';
import { CLE_THEME } from '../web/theme.js';
import { chaine } from '../web/noms.js';
import type { LangueRI } from '../../ri/types.js';

export interface BesoinsOutils {
  usage: UsageElements;
  langues?: LangueRI[];
  theme?: string;
}

/** Les éléments de la cible statique, adaptés : un carrousel ou un œil s'active élément par élément. */
function elementsMoteur(usage: UsageElements): string {
  return elementsJs(usage)
    .replace(
      /function activerCarrousels\(\) \{\n\s*for \(const minuterie of minuteries\.values\(\)\) clearInterval\(minuterie\);\n\s*minuteries\.clear\(\);\n\s*for \(const section of document\.querySelectorAll\('\[data-humalis-carrousel\]'\)\) \{/,
      "function activerCarrousel(element) {\n    nettoyer(() => clearInterval(minuteries.get(element.getAttribute('data-humalis-carrousel'))));\n    for (const section of [element]) {",
    )
    .replace(
      /function activerMotsDePasse\(\) \{\n\s*for \(const champ of document\.querySelectorAll\('input\[type="password"\]:not\(\[data-humalis-oeil\]\)'\)\) \{/,
      'function activerMotDePasse(element) {\n    for (const champ of [element]) {',
    );
}

export function outilsJs(b: BesoinsOutils): string {
  const { usage, langues, theme } = b;
  const exportes = [
    'creer', 'afficherMessage', 'planifier', 'arreterMinuteries', 'minuteriesDeCouche', 'ecouterRaccourcis', 'mouvementReduit', 'themeSombre', 'cliquer', 'focaliser', 'fenetre', 'observerLeBas', 'titreDeLaPage',
    'retirerPremier', 'grouper', 'formaterNombre', 'formaterDate', 'formaterArgent', 'accorder', 'formaterTaille', 'dateDuJour', 'maintenant', 'decalerDate', 'joursEntre', 'formaterDepuis',
    'lireMemoire', 'garderMemoire', 'lirePartage', 'garderPartage', 'copier', 'partager', 'telechargerCsv', 'confirmer',
    ...exportsElements(usage),
    ...(usage.carrousel ? ['activerCarrousel'] : []),
    ...(usage.motDePasse ? ['activerMotDePasse'] : []),
    ...(langues ? ['t', 'langue', 'changerLangue', 'relireLangue'] : []),
    ...(theme !== undefined ? ['definirTheme'] : []),
  ];
  return `// Produit par Humalis : les outils des pages. L'assembleur ne garde que ce qui sert.
import { signal, effet, nettoyer, executer } from './moteur.js';

/** Crée un élément, pour les zones dessinées d'un bloc (cartes, étoiles…). */
function creer(balise, attributs, ...enfants) {
  const element = document.createElement(balise);
  for (const [nom, valeur] of Object.entries(attributs)) {
    if (valeur === undefined || valeur === null || valeur === false) continue;
    if (nom === 'value' && (balise === 'option' || attributs.type === 'radio')) element.setAttribute('value', String(valeur));
    else if (nom === 'value') element.value = String(valeur);
    else if (nom === 'oninput') element.addEventListener('input', valeur);
    else if (nom.startsWith('on')) element.addEventListener(nom.slice(2), () => executer(valeur));
    else element.setAttribute(nom, String(valeur));
  }
  for (const enfant of enfants) element.append(enfant instanceof Node ? enfant : String(enfant));
  return element;
}

const TOUCHES = {
  entree: 'enter', echap: 'escape', espace: ' ', tab: 'tab', suppr: 'delete', retour: 'backspace',
  haut: 'arrowup', bas: 'arrowdown', gauche: 'arrowleft', droite: 'arrowright', debut: 'home', fin: 'end', plus: '+', moins: '-',
};

function correspond(evenement, touches) {
  const morceaux = touches.split('+');
  const touche = morceaux.pop();
  const voulue = TOUCHES[touche] ?? touche;
  if (evenement.key.toLowerCase() !== voulue) return false;
  if (morceaux.includes('controle') !== (evenement.ctrlKey || evenement.metaKey)) return false;
  if (morceaux.includes('alt') !== evenement.altKey) return false;
  return ['/', '?', '+', '-'].includes(voulue) || morceaux.includes('maj') === evenement.shiftKey;
}

/** Les raccourcis d'une couche : une touche imprimable seule ne compte pas dans un champ. */
function ecouterRaccourcis(raccourcis) {
  const ecouteur = (evenement) => {
    if (evenement.repeat || evenement.isComposing) return;
    const actif = document.activeElement;
    for (const [touches, faire, dans] of raccourcis) {
      if (!correspond(evenement, touches)) continue;
      if (dans !== undefined && !actif?.closest('[data-humalis="' + CSS.escape(dans) + '"]')) continue;
      const saisie = actif?.matches?.('input, textarea, select, [contenteditable]');
      if (dans === undefined && !touches.includes('+') && evenement.key.length === 1 && saisie) continue;
      const fenetreOuverte = document.querySelector('dialog[open]');
      if (fenetreOuverte && touches !== 'echap' && !fenetreOuverte.contains(actif)) continue;
      evenement.preventDefault();
      executer(faire);
      return;
    }
  };
  document.addEventListener('keydown', ecouteur);
  nettoyer(() => document.removeEventListener('keydown', ecouteur));
}

function cliquer(id) {
  document.querySelector('[data-humalis="' + CSS.escape(id) + '"]')?.click();
}

function focaliser(id) {
  document.querySelector('[data-humalis="' + CSS.escape(id) + '"]')?.focus();
}

const minuteriesEnCours = new Set();

/** Une minuterie : annulée quand on change de page. */
function planifier(faire, millisecondes, options = {}) {
  let occupe = false;
  let id;
  const annuler = () => {
    clearInterval(id);
    clearTimeout(id);
    minuteriesEnCours.delete(annuler);
  };
  const tour = async () => {
    if (options.tantQue && !options.tantQue()) return annuler();
    if (occupe || (options.repete && document.hidden)) return;
    occupe = true;
    await executer(() => faire(annuler));
    occupe = false;
    if (!options.repete) annuler();
  };
  id = options.repete ? setInterval(tour, millisecondes) : setTimeout(tour, millisecondes);
  minuteriesEnCours.add(annuler);
  return annuler;
}

function arreterMinuteries() {
  for (const annuler of [...minuteriesEnCours]) annuler();
}

/** Les minuteries écrites dans une couche : elles existent tant que leur condition est vraie. */
function minuteriesDeCouche(liste) {
  for (const m of liste) {
    let annuler;
    effet(() => {
      const voulue = !m.arretee && (m.actif ? m.actif() : true);
      if (voulue && !annuler) {
        annuler = planifier((arreter) => {
          if (!m.repete) m.arretee = true;
          return m.faire(() => {
            m.arretee = true;
            arreter();
          });
        }, m.millisecondes(), { repete: m.repete });
      } else if (!voulue && annuler) {
        annuler();
        annuler = undefined;
      }
    });
    nettoyer(() => annuler?.());
  }
}

const media = (requete, repli) => {
  const liste = globalThis.matchMedia?.(requete);
  const boite = signal(liste?.matches ?? repli);
  liste?.addEventListener('change', () => {
    boite.v = liste.matches;
  });
  return boite;
};
const animationsReduites = media('(prefers-reduced-motion: reduce)', false);
const schemaSombre = media('(prefers-color-scheme: dark)', false);
const themeChoisi = signal(document.documentElement.dataset.theme ?? '');
const mouvementReduit = () => animationsReduites.v;
const themeSombre = () => (themeChoisi.v ? themeChoisi.v === 'sombre' : schemaSombre.v);

/** L'onglet suit le premier titre, quand il change. */
function titreDeLaPage(f) {
  let premier = true;
  effet(() => {
    const titre = String(f() ?? '').trim();
    if (!premier && titre) document.title = titre;
    premier = false;
  });
}

/** Une fenêtre : le navigateur garde le focus dedans ; à la fermeture, il revient là où il était. */
function fenetre(dialogue, ouverte, fermer, obligatoire) {
  let retour = null;
  const compter = () => document.documentElement.classList.toggle('humalis-fenetre-ouverte', document.querySelector('main dialog[open]') !== null);
  dialogue.addEventListener('cancel', (evenement) => {
    evenement.preventDefault();
    if (!obligatoire) executer(fermer);
  });
  dialogue.addEventListener('click', (evenement) => {
    if (evenement.target === dialogue && !obligatoire) executer(fermer);
  });
  effet(() => {
    const voulue = Boolean(ouverte());
    if (voulue && !dialogue.open) {
      retour = document.activeElement;
      if (typeof dialogue.showModal === 'function') dialogue.showModal();
      else dialogue.setAttribute('open', '');
    } else if (!voulue && dialogue.open) {
      dialogue.close();
      retour?.focus?.();
      retour = null;
    }
    compter();
  });
  nettoyer(() => {
    if (dialogue.open) dialogue.close();
    compter();
  });
}

/** « arrive en bas de » : la suite se charge quand le bas du bloc approche ; trois chargements sans effet arrêtent l'observation. */
function observerLeBas(sentinelle, faire) {
  if (typeof IntersectionObserver === 'undefined') return;
  let enCours = false;
  let sansEffet = 0;
  let hauteurAvant = 0;
  const observateur = new IntersectionObserver((entrees) => {
    for (const entree of entrees) {
      if (!entree.isIntersecting || enCours) continue;
      enCours = true;
      const hauteur = document.querySelector('main').scrollHeight;
      sansEffet = hauteur > hauteurAvant ? 0 : sansEffet + 1;
      hauteurAvant = hauteur;
      if (sansEffet >= 3) {
        observateur.disconnect();
        return;
      }
      executer(faire).finally(() => {
        enCours = false;
        observateur.unobserve(sentinelle);
        requestAnimationFrame(() => observateur.observe(sentinelle));
      });
    }
  }, { rootMargin: '400px' });
  observateur.observe(sentinelle);
  nettoyer(() => observateur.disconnect());
}
${MESSAGES_JS}${LISTES_JS}
${langues ? FORMAT_JS_LANGUES : FORMAT_JS}
${TAILLE_JS}
${DATES_JS}
${STOCKAGE_JS}${elementsMoteur(usage)}${PRESSE_PAPIER_JS}${QUESTIONS_JS}${langues ? langueMoteur(langues) : ''}${theme !== undefined ? themeMoteur(theme) : ''}
export { ${[...new Set(exportes)].join(', ')} };
`;
}

function langueMoteur(langues: LangueRI[]): string {
  return `
const LANGUES = [${langues.map((l) => chaine(l.code)).join(', ')}];
const langueCourante = signal(LANGUES[0]);

function langueDeDepart() {
  try {
    const gardee = localStorage.getItem(${chaine(CLE_LANGUE)});
    if (LANGUES.includes(gardee)) return gardee;
  } catch {
    // Stockage refusé : on suit le navigateur.
  }
  for (const demandee of navigator.languages ?? [navigator.language]) {
    const code = String(demandee).slice(0, 2).toLowerCase();
    if (LANGUES.includes(code)) return code;
  }
  return LANGUES[0];
}

/** Après la reprise : la page est écrite dans la langue de base, on passe à celle de la personne. */
function relireLangue() {
  langueCourante.v = langueDeDepart();
  document.documentElement.lang = langueCourante.x;
}

function t(versions) {
  const code = langueCourante.v;
  return versions[code] ?? versions[LANGUES[0]] ?? '';
}

function langue() {
  return langueCourante.v;
}

function changerLangue(code) {
  langueCourante.v = code;
  document.documentElement.lang = code;
  try {
    localStorage.setItem(${chaine(CLE_LANGUE)}, code);
  } catch {
    // Sans stockage, le choix vaut jusqu'au rechargement.
  }
}
`;
}

function themeMoteur(defaut: string): string {
  return `
const THEME_PAR_DEFAUT = ${chaine(defaut)};

function definirTheme(theme) {
  if (theme === 'bascule') {
    const affiche = document.documentElement.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair');
    theme = affiche === 'sombre' ? 'clair' : 'sombre';
  }
  try {
    if (theme === 'automatique') localStorage.removeItem(${chaine(CLE_THEME)});
    else localStorage.setItem(${chaine(CLE_THEME)}, theme);
  } catch {
    // Stockage refusé : le choix vaut pour cette visite seulement.
  }
  const choisi = theme === 'automatique' ? THEME_PAR_DEFAUT : theme;
  if (choisi) document.documentElement.dataset.theme = choisi;
  else delete document.documentElement.dataset.theme;
  themeChoisi.v = choisi;
}
`;
}

export interface RouteMoteur {
  chemin: string;
  fichier: string;
}

/** navigation.js : démarrer les couches, changer de page sans recharger. */
export function navigationJs(routes: RouteMoteur[], options: { partages: boolean; session: boolean; langues: boolean; pages: Map<string, string> }): string {
  const table = routes.map((r) => {
    const noms = [...r.chemin.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    const motif = r.chemin.replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:([A-Za-z0-9_]+)/g, '([^/]+)');
    return `  { m: /^${motif.replace(/\//g, '\\/')}\\/?$/, n: ${JSON.stringify(noms)}, f: ${chaine(r.fichier)} },`;
  });
  return `// Produit par Humalis : ouvrir une page, changer de page sans recharger.
import { racine, parcourir, nettoyer, appliquer, executer, signal } from './moteur.js';
import { minuteriesDeCouche, ecouterRaccourcis, arreterMinuteries${options.langues ? ', relireLangue' : ''} } from './outils.js';
${options.partages ? "import { relirePartages } from './partages.js';\n" : ''}${options.session ? "import { relireSession, utilisateur } from './serveur.js';\n" : ''}
const ROUTES = [
${table.join('\n')}
];
const PAGES = ${JSON.stringify(Object.fromEntries(options.pages))};

const registre = new Map();
let actives = [];
let demarre = false;
let numero = 0;
let positions = new Map();
let cleEntree = 0;
let cheminOuvert = location.pathname.replace(/\\/+$/, '') || '/';

function trouverRoute(chemin) {
  for (const route of ROUTES) {
    const m = route.m.exec(chemin === '' ? '/' : chemin);
    if (m) return { route, parametres: Object.fromEntries(route.n.map((nom, i) => [nom, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

function lancerCouche(i, id, fonction, parametres) {
  const emplacement = document.querySelector('[data-c="' + i + '"]');
  const couche = { id, api: null, arreter: null };
  couche.arreter = racine(() => {
    const api = fonction(parcourir(emplacement.firstChild, null, []), { parametres }) ?? {};
    couche.api = api;
    if (api.minuteries) minuteriesDeCouche(api.minuteries);
    if (api.raccourcis) ecouterRaccourcis(api.raccourcis);
    api.relire?.();
  });
  return couche;
}

function chargerLesDonnees(couches) {
  for (const c of couches) if (c.api?.auChargement) executer(c.api.auChargement);
}

/** Une page réservée : la session dit si on reste, sinon on part vers la page prévue. */
function refuse(options) {
  ${options.session ? `const r = options?.reservee;
  if (!r) return null;
  const permis = r.qui === 'admin' ? utilisateur.admin : utilisateur.connecte;
  return permis ? null : r.sinon;` : 'return null;'}
}

function devoiler() {
  document.querySelector('main')?.removeAttribute('hidden');
}

function marquerLiens() {
  for (const a of document.querySelectorAll('a[href^="/"], a[href^="?"]')) {
    const cible = new URL(a.href, location.href);
    const voulus = (a.getAttribute('data-filtres') ?? '').split(' ').filter(Boolean);
    const ici = new URLSearchParams(location.search);
    const actif = !cible.hash && cible.pathname.replace(/\\/+$/, '') === location.pathname.replace(/\\/+$/, '') && voulus.every((f) => (cible.searchParams.get(f) || null) === (ici.get(f) || null));
    a.classList.toggle('humalis-actif', actif);
    if (actif) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function aLAncre() {
  if (!location.hash) return;
  const id = decodeURIComponent(location.hash.slice(1));
  const aller = () => document.getElementById(id)?.scrollIntoView();
  requestAnimationFrame(aller);
  setTimeout(aller, 250);
}

/** Enregistre une route ; la première à arriver ouvre la page. */
export function enregistrer(adresse, couches, options) {
  registre.set(adresse, { couches, options });
  if (demarre) return;
  demarre = true;
  const trouve = trouverRoute(location.pathname.replace(/\\/+$/, '') || '/');
  const parametres = trouve?.parametres ?? {};
  actives = couches.map(([id, f], i) => lancerCouche(i, id, f, parametres));
  ${options.partages ? 'relirePartages();' : ''}
  ${options.langues ? 'relireLangue();' : ''}
  ${options.session ? `relireSession().then(() => {
    const vers = refuse(options);
    if (vers) return naviguer(vers, true);
    devoiler();
    chargerLesDonnees(actives);
  });` : 'devoiler();\n  chargerLesDonnees(actives);'}
  history.scrollRestoration = 'manual';
  history.replaceState({ cle: cleEntree }, '');
  appliquer();
  marquerLiens();
  aLAncre();
  new MutationObserver(marquerLiens).observe(document.querySelector('main'), { childList: true, subtree: true });
  installer();
}

const pagesChargees = new Map();

function chargerDocument(fichier) {
  if (!pagesChargees.has(fichier)) {
    pagesChargees.set(fichier, fetch(fichier).then((r) => {
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('html')) throw new Error(String(r.status));
      return r.text();
    }).catch((erreur) => {
      pagesChargees.delete(fichier);
      throw erreur;
    }));
  }
  return pagesChargees.get(fichier);
}

function remplacerEntete(doc) {
  document.title = doc.title;
  const selecteur = 'meta[name="description"], link[rel="canonical"], meta[property^="og:"], meta[name="twitter:card"], meta[name="robots"]';
  for (const ancien of document.head.querySelectorAll(selecteur)) ancien.remove();
  for (const nouveau of doc.head.querySelectorAll(selecteur)) document.head.append(document.importNode(nouveau, true));
}

/** Change de page : seule la couche qui diffère est remplacée. */
async function aller(url, { historique = true, remplacer = false } = {}) {
  const cible = new URL(url, location.href);
  const trouve = trouverRoute(cible.pathname.replace(/\\/+$/, '') || '/');
  if (!trouve || cible.origin !== location.origin) {
    location.assign(cible.href);
    return;
  }
  const jeton = ++numero;
  try {
    const texte = await chargerDocument(trouve.route.f);
    const doc = new DOMParser().parseFromString(texte, 'text/html');
    const scripts = doc.querySelectorAll('script[type="module"][src]');
    const adresse = new URL(scripts[scripts.length - 1].getAttribute('src'), location.origin).href;
    await import(/* @vite-ignore */ adresse);
    if (jeton !== numero) return;
    const { couches, options } = registre.get(adresse);
    if (refuse(options)) return aller(refuse(options), { remplacer: true });
    if (historique) {
      positions.set(cleEntree, scrollY);
      cleEntree = Date.now();
      history[remplacer ? 'replaceState' : 'pushState']({ cle: cleEntree }, '', cible.href);
    }
    cheminOuvert = cible.pathname.replace(/\\/+$/, '') || '/';
    let commun = 0;
    while (commun < actives.length && commun < couches.length - 1 && actives[commun].id === couches[commun][0]) commun++;
    for (let i = actives.length - 1; i >= commun; i--) actives[i].arreter();
    arreterMinuteries();
    const ici = document.querySelector('[data-c="' + commun + '"]');
    const la = doc.querySelector('[data-c="' + commun + '"]');
    ici.replaceChildren(...la.childNodes);
    remplacerEntete(doc);
    const gardees = actives.slice(0, commun);
    const nouvelles = couches.slice(commun).map(([id, f], i) => lancerCouche(commun + i, id, f, trouve.parametres));
    actives = [...gardees, ...nouvelles];
    appliquer();
    chargerLesDonnees(nouvelles);
    devoiler();
    marquerLiens();
    const position = historique ? 0 : (positions.get(history.state?.cle) ?? 0);
    scrollTo(0, position);
    if (cible.hash) aLAncre();
    const titre = document.querySelector('main h1');
    if (titre && historique) {
      titre.setAttribute('tabindex', '-1');
      titre.focus({ preventScroll: true });
    }
    avertirFiltres();
  } catch (erreur) {
    console.error(erreur);
    location.assign(cible.href);
  }
}

/** « rediriger vers » : une page du site, ou une adresse https, http, mailto ou tel. */
export function naviguer(url, remplacer = false) {
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(String(url).trim())?.[1]?.toLowerCase();
  if (schema !== undefined) {
    if (['http', 'https', 'mailto', 'tel'].includes(schema)) location.assign(url);
    else console.error('Adresse refusée : ' + schema);
    return;
  }
  return aller(url, { remplacer });
}

export function adresseDe(nom) {
  return PAGES[nom] ?? ('/' + String(nom).replace(/^\\/+/, ''));
}

/** « revenir » : le retour du navigateur ; sinon la page de secours. */
export function revenir(secours) {
  if (cleEntree !== 0 || secours === undefined) history.back();
  else naviguer(secours);
}

const filtres = new Map();

function avertirFiltres() {
  const ici = new URLSearchParams(location.search);
  for (const [nom, { boite, nombre }] of filtres) boite.v = lireFiltre(ici, nom, nombre);
  marquerLiens();
}

function lireFiltre(ici, nom, nombre) {
  const texte = ici.get(nom);
  if (texte === null || texte === '') return null;
  if (!nombre) return texte;
  const valeur = Number(texte);
  return Number.isNaN(valeur) ? null : valeur;
}

/** « avec filtre categorie » : une variable lue dans l'adresse. */
export function filtre(nom, nombre) {
  const boite = signal(lireFiltre(new URLSearchParams(location.search), nom, nombre));
  filtres.set(nom, { boite, nombre });
  nettoyer(() => filtres.delete(nom));
  return boite;
}

/** « changer categorie par … » : une entrée de plus dans l'historique ; rien enlève le filtre. */
export function changerFiltre(nom, valeur) {
  const suivants = new URLSearchParams(location.search);
  if (valeur === null || valeur === undefined || valeur === '') suivants.delete(nom);
  else suivants.set(nom, String(valeur));
  const texte = suivants.toString();
  history.pushState({ cle: cleEntree }, '', location.pathname + (texte ? '?' + texte : '') + location.hash);
  avertirFiltres();
}

function installer() {
  document.addEventListener('click', (evenement) => {
    if (evenement.defaultPrevented || evenement.button !== 0 || evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return;
    const lien = evenement.target instanceof Element ? evenement.target.closest('a[href]') : null;
    if (!lien || lien.target || lien.hasAttribute('download')) return;
    const cible = new URL(lien.href, location.href);
    if (cible.origin !== location.origin || !trouverRoute(cible.pathname.replace(/\\/+$/, '') || '/')) return;
    if (cible.pathname === location.pathname) {
      if (cible.search === location.search) {
        // Une ancre de la page : le navigateur défile lui-même.
        if (cible.hash) return;
        evenement.preventDefault();
        return;
      }
      evenement.preventDefault();
      history.pushState({ cle: cleEntree }, '', cible.href);
      avertirFiltres();
      return;
    }
    evenement.preventDefault();
    aller(cible.href);
  });
  addEventListener('popstate', () => {
    const adresseActuelle = location.pathname.replace(/\\/+$/, '') || '/';
    const route = trouverRoute(adresseActuelle);
    if (route && actives.length && cheminOuvert === adresseActuelle) {
      avertirFiltres();
      return;
    }
    cleEntree = history.state?.cle ?? 0;
    aller(location.href, { historique: false });
  });
  const preparer = (evenement) => {
    const lien = evenement.target instanceof Element ? evenement.target.closest('a[href]') : null;
    if (!lien) return;
    const cible = new URL(lien.href, location.href);
    if (cible.origin !== location.origin) return;
    const trouve = trouverRoute(cible.pathname.replace(/\\/+$/, '') || '/');
    if (trouve) chargerDocument(trouve.route.f).catch(() => {});
  };
  document.addEventListener('pointerover', preparer, { passive: true });
  document.addEventListener('focusin', preparer);
  ${options.partages ? "addEventListener('pageshow', (evenement) => {\n    if (evenement.persisted) relirePartages();\n  });" : ''}
}
`;
}
