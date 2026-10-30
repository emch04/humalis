import { copiesDesMedias } from '../../ri/medias.js';
import { robotsTxt, manifeste, fichiersDuSite, balisesIcone, estExterne } from '../publication.js';
import { sousActions } from '../../ri/actions.js';
import { cssEcran } from './css-ecran.js';
import { cssElements } from './css-elements.js';
import { cssMouvement, animeAuDefilement, MOUVEMENT_WEB, NETTOYAGE_PRERENDU, ENTETE_WEB, suitLEntete } from '../commun/mouvement.js';
import type { InfoMedia } from '../../ri/medias.js';
import { fichiersDesElements, dependancesDesElements, dependancesDeDeveloppement } from './widgets.js';
import { fichiersGraphique, cssGraphique } from './graphique.js';
import { cssTheme, changeLeTheme, modeParDefaut, themeTs, SCRIPT_THEME } from './theme.js';
import { FORMAT_TS, FORMAT_TS_LANGUES, TAILLE_TS, DATES_TS } from '../format.js';
import { langueWebTsx } from './langue.js';
import { messagesDuProjet } from '../../i18n/messages.js';
import type { Application, Ecran, Etat, Action, NoeudVue, SiteRI } from '../../ri/types.js';
import { simplifier } from '../../analyse/elements.js';
import { genererEcran, genererFonctions, type ContexteApplication } from './ecran.js';
import { camel, setter, chaine, pascal } from './noms.js';
import { typeTS, expression } from './valeurs.js';
import { sourcesTs, serveurAvecSources, sessionDeLaSource } from './sources.js';
import { fichiersDesInteractions, cssInteractions } from './interactions.js';
import type { Diagnostic } from '../../analyse/erreurs.js';
import { COULEURS_CSS } from './styles.js';

export interface OptionsWeb {
  /** Le nom du projet, tiré du fichier Humalis (« boutique »). */
  nom: string;
  /** L'adresse publique du site, pour le prérendu et le plan du site. */
  adresse: string;
  /** Le fichier Humalis d'origine, cité dans le LISEZMOI. */
  source: string;
  /** Le contenu de chaque fichier de « utiliser style "…" », lu par la commande. */
  fichiersStyle?: Map<string, string>;
  /** Pour chaque « utiliser composant … depuis "chemin" » : le fichier React lu par la commande. */
  composantsReact?: Map<string, { nom: string; contenu: string }>;
  /** Pour chaque police du thème écrite avec depuis : le fichier lu par la commande, en base 64. */
  polices?: Map<string, string>;
  /** Les fichiers locaux du programme (images), lus par la commande : leur taille et leurs dimensions. */
  medias?: Map<string, InfoMedia>;
  /** Le logo et l'image de partage du bloc « site », lus par la commande, en base 64. */
  images?: Map<string, string>;
  /**
   * Le mode développement (« humalis developper ») : les fichiers du projet,
   * tels que compilerProjet les rend. Chaque élément porte alors son fichier
   * et sa ligne (data-humalis-source) ; absent, rien n'est ajouté.
   */
  sources?: readonly string[];
}

/** « ./themes/clair.css » → « clair.css ». */
/**
 * Le nom de chaque fichier de style recopié : son nom seul (« theme.css »),
 * sauf si un autre fichier (ou `reserves`) le prend déjà ; alors son dossier
 * le précède (« pages-theme.css »). Deux fichiers ne s'écrasent jamais.
 */
export function nomsDesStyles(chemins: string[], reserves: string[] = []): Map<string, string> {
  const pris = new Set(reserves);
  const noms = new Map<string, string>();
  for (const chemin of chemins) {
    const morceaux = chemin.split(/[\\/]/).filter((m) => m !== '' && m !== '.' && m !== '..');
    const seul = morceaux[morceaux.length - 1] || 'style.css';
    let nom = pris.has(seul) ? morceaux.join('-') || seul : seul;
    for (let n = 2; pris.has(nom); n++) nom = `${n}-${seul}`;
    pris.add(nom);
    noms.set(chemin, nom);
  }
  return noms;
}


/** Versions épinglées des dépendances du projet produit. */
export const VERSIONS = {
  react: '19.3.1',
  reactDom: '19.3.1',
  reactRouter: '8.4.0',
  vite: '8.3.4',
  pluginReact: '6.1.2',
  typescript: '7.0.2',
  typesReact: '19.3.0',
  typesReactDom: '19.3.0',
  prerender: '1.0.1',
  playwright: '1.63.0',
};

/** Le fichier qui marque un dossier produit par Humalis (voir la commande compile). */
export const MARQUE = '.humalis-projet';

/** Les fichiers d'un projet Vite + React complet, prêt à lancer. */
export function genererProjetWeb(application: Application, options: OptionsWeb): Map<string, string> {
  const fichiers = new Map<string, string>();
  const chemins = cheminsDesPages(application);
  // Les composants vont dans src/composants : un fichier React recopié tel
  // quel, ou un composant écrit en Humalis.
  const modulesComposants = new Map<string, string>();
  for (const c of application.composantsReact) {
    const fichier = options.composantsReact?.get(c.chemin);
    if (!fichier) throw new Error(`le composant « ${c.nom} » (${c.chemin}) n'a pas été lu`);
    fichiers.set(`src/composants/${fichier.nom}`, fichier.contenu);
    modulesComposants.set(c.nom, fichier.nom.replace(/\.(tsx|ts|jsx|js)$/, ''));
  }
  for (const c of application.composants) modulesComposants.set(c.nom, pascal(c.nom));

  const contexte: ContexteApplication = {
    partages: application.partages,
    cle: `humalis:${simplifier(options.nom) || 'application'}`,
    modulesComposants,
    donnees: [...application.serveurs, ...application.sources].flatMap((s) => s.donnees.map((d) => d.nom)),
    fonctions: application.fonctions.map((f) => f.nom),
    filtres: new Map(application.ecrans.filter((e) => e.filtres?.length).map((e) => [e.nom, e.filtres!])),
    medias: options.medias ?? new Map(),
    // Le bloc « site » ou un « apercu » : chaque page pose ses balises de partage.
    ...(application.site || application.ecrans.some((e) => e.apercu) ? { publication: { site: application.site, adresse: options.adresse } } : {}),
    ...(application.langues ? { langues: application.langues } : {}),
    ...(options.sources ? { reperes: options.sources } : {}),
  };
  let session = false;
  for (const c of application.composants) {
    const produit = genererEcran(c, chemins, contexte, c.parametres);
    session ||= produit.session;
    fichiers.set(`src/composants/${pascal(c.nom)}.tsx`, produit.code);
  }
  // L'en-tête et le pied communs sont des composants sans paramètre, montés une fois pour toutes les pages (Disposition.tsx).
  const dispositions: { entete?: string; pied?: string } = {};
  for (const [genre, nom, d] of [['entete', 'EnteteSite', application.disposition?.entete], ['pied', 'PiedSite', application.disposition?.pied]] as const) {
    if (!d) continue;
    const produit = genererEcran({ ...d.ecran, nom }, chemins, contexte, []);
    session ||= produit.session;
    fichiers.set(`src/composants/${nom}.tsx`, produit.code);
    dispositions[genre] = nom;
  }
  if (dispositions.entete || dispositions.pied) fichiers.set('src/Disposition.tsx', dispositionTsx(dispositions, application));
  // Avec un en-tête, le clavier peut sauter directement au contenu de la page.
  if (dispositions.entete) fichiers.set('src/humalis/aller-au-contenu.tsx', ALLER_AU_CONTENU);
  const pages = application.ecrans.map((ecran) => ({ ecran, page: genererEcran(ecran, chemins, contexte) }));
  session ||= pages.some(({ page }) => page.session);
  // Une page réservée demande la session, même si elle ne la lit pas elle-même.
  const reservees = application.ecrans.some((e) => e.reservee);
  session ||= reservees;
  const introuvable = pages.find(({ ecran }) => ecran.nom === 'introuvable');
  const adresses = [...new Set([...application.ecrans.flatMap((e) => adressesDeRequetes(e)), ...adressesDeSources(application)])];
  // Pendant le prérendu, il n'y a personne : /auth/me est neutralisé.
  if (session) adresses.push('/auth/me');

  fichiers.set(MARQUE, `Projet produit par Humalis depuis ${options.source}.\nLe compilateur réécrit ce dossier à chaque compilation.\n`);
  fichiers.set('package.json', packageJson(options.nom));
  const bascule = changeLeTheme(application);
  fichiers.set('index.html', indexHtml(pages[0]?.page.titre ?? options.nom, modeParDefaut(application.theme), bascule, application.site, application.langues?.[0].code));
  // Plusieurs langues : t(), la langue courante, le sélecteur (src/humalis/langue.tsx).
  if (application.langues) fichiers.set('src/humalis/langue.tsx', langueWebTsx(application.langues));
  if (application.site) {
    fichiers.set('public/robots.txt', robotsTxt(application.site, options.adresse));
    if (application.site.logo && !estExterne(application.site.logo)) fichiers.set('public/manifest.webmanifest', manifeste(application.site, options.images, '/'));
    for (const [chemin, contenu] of fichiersDuSite(application.site, options.images, 'public/')) fichiers.set(chemin, contenu);
  }
  if (bascule) fichiers.set('src/humalis/theme.ts', themeTs(modeParDefaut(application.theme)));
  fichiers.set('vite.config.ts', application.serveurs.length > 0 ? VITE_CONFIG_SERVEUR : VITE_CONFIG);
  fichiers.set('tsconfig.json', TSCONFIG);
  fichiers.set('.gitignore', 'node_modules\ndist\n');
  fichiers.set(
    'astratra.prerender.config.cjs',
    // Une page à paramètre n'est pas prérendue : son adresse dépend des données.
    configPrerendu(
      options.adresse,
      // Une sous-page d'index a l'adresse de son parent : une seule entrée par adresse.
      pages
        // Une page « indexation non » n'est ni prérendue ni dans le plan du site.
        .filter(({ ecran }) => !chemins.get(ecran.nom)!.includes(':') && ecran.nom !== 'introuvable' && !ecran.reservee && ecran.apercu?.indexation !== false)
        .map(({ ecran, page }) => ({ chemin: chemins.get(ecran.nom)!, libelle: page.titre }))
        .filter((r, i, toutes) => toutes.findIndex((x) => x.chemin === r.chemin) === i),
      adresses,
      application.site?.indexation !== false,
      animeAuDefilement(pages.map(({ page }) => page.code)),
    ),
  );
  fichiers.set('LISEZMOI.md', lisezmoi(options));
  fichiers.set('src/vite-env.d.ts', '/// <reference types="vite/client" />\n');
  // La page « introuvable » écrite par la personne remplace celle de Humalis.
  if (!introuvable) fichiers.set('src/Introuvable.tsx', INTROUVABLE);
  const continuer = application.ecrans.some((e) => JSON.stringify(e.gestionnaires).includes('"continuer":true'));
  if (reservees || continuer) fichiers.set('src/humalis/reservee.tsx', RESERVEE);
  // Les aides de navigation (liens actifs, filtres, ancres, retour) ne sont écrites que si une page s'en sert.
  const utiliseDefilement = application.ecrans.some((e) => e.parent !== undefined || e.filtres?.length || /"(ancre|versAncre)"/.test(JSON.stringify(e)));
  // Les composants (dont l'en-tête et le pied communs) sont déjà écrits : leurs liens comptent aussi.
  const sertLaNavigation = (code: string) => code.includes("humalis/navigation'");
  if (utiliseDefilement || pages.some(({ page }) => sertLaNavigation(page.code)) || [...fichiers.values()].some(sertLaNavigation)) fichiers.set('src/humalis/navigation.tsx', NAVIGATION);
  fichiers.set('src/humalis/messages.tsx', MESSAGES);
  fichiers.set('src/humalis/page.ts', contexte.publication ? PAGE_PUBLICATION : application.ecrans.some((e) => e.parent !== undefined) ? PAGE_SOUS_PAGES : PAGE);
  // Le compte des échecs et les styles des formulaires ne sont écrits que si une page s'en sert.
  // Les petits fichiers des éléments d'écran (étoiles, compteur…) et les bibliothèques qu'ils demandent.
  const elements = fichiersDesElements([...fichiers.values(), ...pages.map(({ page }) => page.code)]);
  for (const [nom, contenu] of elements) fichiers.set(`src/humalis/${nom}`, contenu);
  // Les outils des interactions (minuteries, presse-papier, raccourcis, fenêtres…), seulement s'ils servent.
  for (const [nom, contenu] of fichiersDesInteractions([...fichiers.values(), ...pages.map(({ page }) => page.code)])) fichiers.set(`src/humalis/${nom}`, contenu);
  // Les graphiques : le composant et la géométrie, seulement si une page en dessine.
  for (const [nom, contenu] of fichiersGraphique([...fichiers.values(), ...pages.map(({ page }) => page.code)], false)) fichiers.set(`src/humalis/${nom}`, contenu);
  const dependances = dependancesDesElements([...fichiers.values(), ...pages.map(({ page }) => page.code)]);
  const dependancesDev = dependancesDeDeveloppement([...fichiers.values(), ...pages.map(({ page }) => page.code)]);
  if (Object.keys(dependances).length > 0) {
    const paquet = JSON.parse(fichiers.get('package.json')!);
    paquet.dependencies = { ...paquet.dependencies, ...dependances };
    paquet.devDependencies = { ...paquet.devDependencies, ...dependancesDev };
    fichiers.set('package.json', JSON.stringify(paquet, null, 2) + '\n');
  }
  const codes = [...fichiers.values(), ...pages.map(({ page }) => page.code)];
  fichiers.set('src/humalis/serveur.ts', avecEchecs(application.sources.length > 0 ? serveurAvecSources(SERVEUR) : SERVEUR, codes));
  if (application.sources.length > 0) fichiers.set('src/humalis/sources.ts', sourcesTs(application));
  if (application.fonctions.length > 0) fichiers.set('src/humalis/fonctions.ts', genererFonctions(application.fonctions, contexte));
  fichiers.set('src/humalis/outils.ts', outils([...codes, ...(application.fonctions.length > 0 ? [fichiers.get('src/humalis/fonctions.ts')!] : [])], application.langues !== undefined));
  // Les composants écrits en Humalis aussi : leurs variables « memorisee » utilisent le même fichier.
  const memorisees =
    application.partages.some((p) => p.memorisee) ||
    [...application.ecrans, ...application.composants].some((e) => e.etat.some((v) => v.memorisee && !v.secret));
  if (memorisees) fichiers.set('src/humalis/memoire.ts', MEMOIRE);
  if (application.partages.length > 0) fichiers.set('src/humalis/partage.tsx', partageTsx(application.partages, contexte.cle));
  if (application.serveurs.length > 0 || application.sources.length > 0) fichiers.set('src/humalis/donnees.ts', donneesTs(application));
  if (session) {
    const source = application.sources.find((x) => x.session);
    fichiers.set('src/humalis/session.tsx', source ? sessionDeLaSource(SESSION, source) : SESSION);
  }
  fichiers.set(
    'src/humalis/styles.css',
    styles(
      codes.some((c) => /humalis-(formulaire|case|choix|obligatoire)|<textarea|<select/.test(c)),
      codes.some((c) => /humalis-(section|bloc|ligne|colonne|grille|menu)\b/.test(c)),
    ) + cssEcran(codes) + cssElements(codes) + cssMouvement(codes) + cssGraphique(codes, application.theme?.couleurs.map((c) => c.nom)) + cssInteractions(codes) + cssTheme(application.theme, bascule, options.polices),
  );
  // L'observateur des animations « au defilement », seulement si une page en a.
  const defilementAnime = animeAuDefilement(codes);
  if (defilementAnime) fichiers.set('src/humalis/mouvement.ts', MOUVEMENT_WEB);
  // « entete avec fixe », « hauteur ecran » : la hauteur de l'en-tête, suivie par un petit script.
  const enteteSuivie = suitLEntete(codes);
  if (enteteSuivie) fichiers.set('src/humalis/entete.ts', ENTETE_WEB);

  // Le CSS de l'utilisateur, recopié tel quel (décision W8), chargé après
  // celui de Humalis pour pouvoir le redéfinir.
  const feuilles: string[] = [];
  if (application.css.length > 0) {
    fichiers.set('src/styles/style.css', application.css.join('\n\n') + '\n');
    feuilles.push('style.css');
  }
  const nomsStyles = nomsDesStyles(application.fichiersStyle.map((f) => f.chemin), application.css.length > 0 ? ['style.css'] : []);
  for (const { chemin } of application.fichiersStyle) {
    const contenu = options.fichiersStyle?.get(chemin);
    if (contenu === undefined) throw new Error(`le fichier de style « ${chemin} » n'a pas été lu`);
    const nom = nomsStyles.get(chemin)!;
    fichiers.set(`src/styles/${nom}`, contenu);
    feuilles.push(nom);
  }
  fichiers.set(
    'src/main.tsx',
    mainTsx(
      pages
        .filter(({ ecran }) => ecran.nom !== 'introuvable')
        .map(({ ecran, page }) => ({
          nom: ecran.nom,
          composant: page.composant,
          chemin: chemins.get(ecran.nom)!,
          ...(ecran.parent !== undefined ? { parent: ecran.parent } : {}),
          ...(ecran.reservee ? { reservee: { qui: ecran.reservee.qui, sinon: chemins.get(ecran.reservee.sinon) ?? '/' } } : {}),
          sansEntete: ecran.sansEntete,
          sansPied: ecran.sansPied,
        })),
      feuilles,
      application.partages.length > 0,
      session,
      introuvable?.page.composant,
      dispositions,
      utiliseDefilement,
      defilementAnime,
      enteteSuivie,
    ),
  );

  for (const { page } of pages) fichiers.set(`src/pages/${page.composant}.tsx`, page.code);
  // Les images locales, recopiées là où le site les cherche (/images/…) : décision M5.
  for (const [chemin, contenu] of copiesDesMedias(options.medias, 'public/images/')) fichiers.set(chemin, contenu);
  for (const [chemin, contenu] of copiesDesMedias(options.medias, 'public/audio/', 'audio')) fichiers.set(chemin, contenu);
  // Plusieurs langues : les messages de Humalis (« Réessayer », la page introuvable…) passent par t().
  if (application.langues) messagesDuProjet(fichiers, application.langues.map((l) => l.code), 'src/humalis/', 'src/Introuvable.tsx');

  return fichiers;
}

/**
 * Chaque page a son adresse (décision W1) : `/panier` pour la page
 * « panier » ; la page « accueil », ou à défaut la première, est à `/`.
 */
export function cheminsDesPages(application: Application): Map<string, string> {
  // La page d'entrée n'attend rien dans son adresse : une page à paramètre ne peut pas être « / ».
  const simple = (e: Ecran) => !e.parametresAdresse?.length && e.parent === undefined;
  const entree =
    application.ecrans.find((e) => e.nom === 'accueil' && simple(e)) ?? application.ecrans.find((e) => simple(e) && e.nom !== 'introuvable') ?? application.ecrans.find(simple) ?? application.ecrans[0];
  // Une page à paramètre ajoute un morceau par paramètre : « /produit/:id ».
  const parametres = (e: Ecran) => (e.parametresAdresse ?? []).map((p) => `/:${camel(p)}`).join('');
  const chemins = new Map<string, string>();
  // Une sous-page sans adresse choisie a celle de son parent, suivie de son nom (/admin/commandes).
  const cheminDe = (e: Ecran, vus: string[] = []): string => {
    const deja = chemins.get(e.nom);
    if (deja !== undefined) return deja;
    const parent = e.parent !== undefined && !vus.includes(e.nom) ? application.ecrans.find((p) => p.nom === e.parent) : undefined;
    const chemin =
      e.adresse !== undefined
        ? e.adresse
        : parent
          ? `${cheminDe(parent, [...vus, e.nom]).replace(/\/+$/, '')}/${simplifier(e.nom)}${parametres(e)}`
          : e === entree && !e.parametresAdresse?.length
            ? '/'
            : `/${simplifier(e.nom)}${parametres(e)}`;
    chemins.set(e.nom, chemin);
    return chemin;
  };
  for (const e of application.ecrans) cheminDe(e);
  return chemins;
}

/** Les chemins appelés sur les sources, neutralisés pendant le prérendu comme les autres requêtes. */
export function adressesDeSources(application: Application): string[] {
  const chemins: string[] = [];
  const actions = (liste: Action[]) => {
    for (const a of liste) {
      if (a.type === 'requete' && a.source !== undefined) chemins.push(a.adresse);
      if (a.type === 'si') {
        actions(a.alors);
        actions(a.sinon);
      }
      if (a.type === 'repetition') actions(a.corps);
    }
  };
  for (const e of [...application.ecrans, ...application.composants]) for (const g of e.gestionnaires) actions(g.actions);
  return chemins;
}

/** Les adresses de toutes les « envoyer requete » d'un écran, boucles comprises. */
export function adressesDeRequetes(ecran: Ecran): string[] {
  const adresses: string[] = [];
  const actions = (liste: Action[]) => {
    for (const a of liste) {
      // Une requête vers une source a son propre moteur et ses propres adresses (adressesDeSources).
      if (a.type === 'requete' && a.source === undefined) adresses.push(a.adresse);
      for (const sous of sousActions(a)) actions(sous);
    }
  };
  const vue = (noeuds: NoeudVue[]) => {
    for (const n of noeuds) {
      if (n.type === 'condition') {
        vue(n.alors);
        vue(n.sinon);
      }
      if (n.type === 'repetition') {
        vue(n.corps);
        n.gestionnaires.forEach((g) => actions(g.actions));
      }
      if (n.type === 'formulaire' || n.type === 'bloc') vue(n.corps);
    }
  };
  ecran.gestionnaires.forEach((g) => actions(g.actions));
  vue(ecran.vue);
  return adresses;
}

function packageJson(nom: string): string {
  return JSON.stringify(
    {
      name: simplifier(nom).replace(/_/g, '-') || 'application-humalis',
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'tsc --noEmit && vite build && astratra-prerender',
        'build:sans-prerendu': 'tsc --noEmit && vite build',
        preview: 'vite preview',
      },
      dependencies: {
        react: VERSIONS.react,
        'react-dom': VERSIONS.reactDom,
        'react-router': VERSIONS.reactRouter,
      },
      devDependencies: {
        '@astratra/prerender': VERSIONS.prerender,
        '@types/react': VERSIONS.typesReact,
        '@types/react-dom': VERSIONS.typesReactDom,
        '@vitejs/plugin-react': VERSIONS.pluginReact,
        playwright: VERSIONS.playwright,
        typescript: VERSIONS.typescript,
        vite: VERSIONS.vite,
      },
    },
    null,
    2,
  ) + '\n';
}

function indexHtml(titre: string, mode?: 'clair' | 'sombre', bascule = false, site?: SiteRI, langue = 'fr'): string {
  // Les balises du site, communes à toutes les pages ; chaque page pose les siennes en s'affichant.
  const publication = site ? [...balisesIcone(site, '/'), ...(site.nom ? [`<meta property="og:site_name" content="${echapperHtml(site.nom)}" />`] : [])] : [];
  return `<!doctype html>
<html lang="${langue}"${mode ? ` data-theme="${mode}"` : ''}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${echapperHtml(titre)}</title>${publication.map((b) => `\n    ${b}`).join('')}${bascule ? `\n    <script>${SCRIPT_THEME}</script>` : ''}
  </head>
  <body>
    <div id="racine"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

const echapperHtml = (texte: string) =>
  texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const VITE_CONFIG = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`;

/**
 * Avec un serveur dans le même fichier : en développement (et pour
 * « vite preview »), /api et /auth sont relayés vers lui.
 */
const VITE_CONFIG_SERVEUR = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// L'adresse du serveur Humalis (« --cible serveur ») : HUMALIS_SERVEUR, sinon le port 3000.
const cible = process.env.HUMALIS_SERVEUR ?? 'http://localhost:3000';
const proxy = { '/api': cible, '/auth': cible };

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
`;

/** Les interfaces des données du serveur, lues par les pages. */
export function donneesTs(application: Application): string {
  const typeChamp = (t: import('../../ri/types.js').TypeChamp): string =>
    t.genre === 'liste' ? `${typeChamp(t.de)}[]` : t.genre === 'donnee' ? pascal(t.nom) : t.genre === 'nombre' ? 'number' : t.genre === 'booleen' ? 'boolean' : 'string';
  const interfaces = [...application.serveurs, ...application.sources].flatMap((s) =>
    s.donnees.map(
      (d) => `/** La donnée « ${d.nom} » du serveur « ${s.nom} ». */
export interface ${pascal(d.nom)} {
${d.champs.some((c) => camel(c.nom) === 'id') ? '' : '  id: string;\n'}${d.champs.map((c) => `  ${camel(c.nom)}: ${typeChamp(c.type)};`).join('\n')}
}`,
    ),
  );
  return `// Produit par Humalis : les données du serveur, telles que les pages les reçoivent.

${interfaces.join('\n\n')}
`;
}

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2023', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: ['vite/client'],
    },
    include: ['src'],
  },
  null,
  2,
) + '\n';

function configPrerendu(adresse: string, routes: { chemin: string; libelle: string }[], api: string[], planDuSite = true, mouvement = false): string {
  const lignesRoutes = routes
    .map((r) => `    { path: ${JSON.stringify(r.chemin)}, label: ${JSON.stringify(r.libelle)} },`)
    .join('\n');
  const motifs = api.map((a) => JSON.stringify(`**${a.startsWith('/') ? a : `/${a}`}`)).join(', ');
  return `// Produit par Humalis : une route par page, et le plan du site tiré de la même liste.
module.exports = {
  distDir: 'dist',
  siteUrl: ${JSON.stringify(adresse)},
  routes: [
${lignesRoutes}
  ],
  sitemap: ${planDuSite},
  // Posée par chaque page en s'affichant (src/humalis/page.ts).
  waitFor: 'meta[name="description"]',
  // Les adresses des « envoyer requete » du programme, neutralisées pendant le prérendu.
  apiPatterns: [${motifs}],
${mouvement ? NETTOYAGE_PRERENDU : ''}};
`;
}

/** Disposition.tsx : l'en-tête et le pied communs autour des pages, qui restent montés quand on change de page. */
/** `src/humalis/aller-au-contenu.tsx` : le premier arrêt du clavier, qui saute l'en-tête. */
const ALLER_AU_CONTENU = `/** Le lien « Aller au contenu » : caché tant qu'il n'a pas le focus du clavier, il saute l'en-tête. */
export default function AllerAuContenu() {
  return (
    <a
      className="humalis-aller-au-contenu"
      href="#contenu"
      onClick={(evenement) => {
        const contenu = document.querySelector('main');
        if (!contenu) return;
        evenement.preventDefault();
        contenu.setAttribute('tabindex', '-1');
        contenu.focus();
      }}
    >Aller au contenu</a>
  );
}
`;

function dispositionTsx(d: { entete?: string; pied?: string }, application: Application): string {
  const balise = (genre: 'entete' | 'pied', composant: string) => {
    const dispo = application.disposition![genre]!;
    const classes = [`humalis-${genre}`, ...dispo.options.map((o) => `humalis-${o.nom}-${o.valeur}`), ...dispo.classes].join(' ');
    const [ouvre, ferme] = genre === 'entete' ? ['header', 'header'] : ['footer', 'footer'];
    return `{${genre} && (\n        <${ouvre} className="${classes}">\n          <${composant} />\n        </${ferme}>\n      )}`;
  };
  return `import { Outlet } from 'react-router';
${d.entete ? `import AllerAuContenu from './humalis/aller-au-contenu';\nimport ${d.entete} from './composants/${d.entete}';\n` : ''}${d.pied ? `import ${d.pied} from './composants/${d.pied}';\n` : ''}
/** L'en-tête et le pied communs à toutes les pages : montés une fois, ils restent là quand on change de page. */
export default function Disposition({ entete = true, pied = true }: { entete?: boolean; pied?: boolean }) {
  return (
    <>
      ${d.entete ? `{entete && <AllerAuContenu />}\n      ${balise('entete', d.entete)}` : '{entete && null}'}
      <Outlet />
      ${d.pied ? balise('pied', d.pied) : '{pied && null}'}
    </>
  );
}
`;
}

interface RouteProduite {
  nom: string;
  composant: string;
  chemin: string;
  reservee?: { qui: string; sinon: string };
  sansEntete?: boolean;
  sansPied?: boolean;
  /** Le nom de la page parente, pour une sous-page. */
  parent?: string;
}

/** Les lignes JSX d'une route, avec ses sous-pages (routes imbriquées) et sa garde. */
function lignesDeRoute(r: RouteProduite, toutes: RouteProduite[], niveau: number, cheminParent?: string): string[] {
  const espaces = (n: number) => ' '.repeat(10 + 2 * (niveau + n));
  const fils = toutes.filter((f) => f.parent === r.nom);
  const garde = r.reservee !== undefined;
  const decale = garde ? 1 : 0;
  // Une sous-page a une adresse relative à son parent ; la même que son parent : c'est l'index.
  let chemin: string;
  if (cheminParent !== undefined) {
    const relatif = r.chemin.slice(cheminParent.replace(/\/+$/, '').length).replace(/^\//, '');
    chemin = relatif === '' ? 'index' : `path=${JSON.stringify(relatif)}`;
  } else {
    chemin = `path=${JSON.stringify(r.chemin)}`;
  }
  const lignes: string[] = [];
  if (garde) lignes.push(`${espaces(0)}<Route element={<Reservee qui=${JSON.stringify(r.reservee!.qui)} sinon=${JSON.stringify(r.reservee!.sinon)} />}>`);
  if (fils.length === 0) {
    lignes.push(`${espaces(decale)}<Route ${chemin} element={<${r.composant} />} />`);
  } else {
    lignes.push(`${espaces(decale)}<Route ${chemin} element={<${r.composant} />}>`);
    for (const f of fils) lignes.push(...lignesDeRoute(f, toutes, niveau + decale + 1, r.chemin));
    lignes.push(`${espaces(decale)}</Route>`);
  }
  if (garde) lignes.push(`${espaces(0)}</Route>`);
  return lignes;
}

function mainTsx(
  routes: RouteProduite[],
  feuilles: string[],
  partage: boolean,
  session: boolean,
  introuvable?: string,
  dispositions: { entete?: string; pied?: string } = {},
  defilement = false,
  mouvement = false,
  entete = false,
): string {
  const imports = routes.map((r) => `import ${r.composant} from './pages/${r.composant}';`).join('\n');
  // Les pages qui ont le même en-tête et le même pied partagent une disposition ; une sous-page suit son parent.
  const groupes = new Map<string, RouteProduite[]>();
  for (const r of routes.filter((r) => r.parent === undefined)) {
    const cle = `${dispositions.entete && !r.sansEntete ? 'e' : '-'}${dispositions.pied && !r.sansPied ? 'p' : '-'}`;
    groupes.set(cle, [...(groupes.get(cle) ?? []), r]);
  }
  const lignes = [...groupes]
    .map(([cle, groupe]) =>
      cle === '--'
        ? groupe.flatMap((r) => lignesDeRoute(r, routes, 0)).join('\n')
        : `          <Route element={<Disposition${cle[0] === 'e' ? '' : ' entete={false}'}${cle[1] === 'p' ? '' : ' pied={false}'} />}>\n${groupe.flatMap((r) => lignesDeRoute(r, routes, 1)).join('\n')}\n          </Route>`,
    )
    .join('\n');
  // Les enveloppes autour des routes : la session (connexion), puis les variables partagées.
  const enveloppes = [...(session ? ['Session'] : []), ...(partage ? ['Partage'] : [])];
  let routesTsx = `<Routes>\n${lignes.replace(/^ {10}/gm, '  ')}\n  <Route path="*" element={<${introuvable ?? 'Introuvable'} />} />\n</Routes>`;
  for (const nom of [...enveloppes].reverse()) routesTsx = `<${nom}>\n${routesTsx.replace(/^/gm, '  ')}\n</${nom}>`;
  routesTsx = routesTsx.replace(/^/gm, '        ');
  return `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Messages } from './humalis/messages';${defilement ? "\nimport { Defilement } from './humalis/navigation';" : ''}
${session ? "import { Session } from './humalis/session';\n" : ''}${partage ? "import { Partage } from './humalis/partage';\n" : ''}${routes.some((r) => r.reservee) ? "import { Reservee } from './humalis/reservee';\n" : ''}${introuvable ? `import ${introuvable} from './pages/${introuvable}';` : "import Introuvable from './Introuvable';"}
${dispositions.entete || dispositions.pied ? "import Disposition from './Disposition';\n" : ''}${imports}
import './humalis/styles.css';
${mouvement ? "import { observerLeDefilement } from './humalis/mouvement';\n" : ''}${entete ? "import { suivreLaHauteurDeLEntete } from './humalis/entete';\n" : ''}${feuilles.map((f) => `import './styles/${f}';\n`).join('')}
// Un hébergeur statique sert /documentation/index.html pour /documentation/ :
// le routeur lit l'adresse sans « index.html », comme le dossier.
if (/\\/index\\.html$/.test(location.pathname)) {
  history.replaceState(history.state, '', location.pathname.replace(/index\\.html$/, '') + location.search + location.hash);
}

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <BrowserRouter>
${defilement ? '      <Defilement />\n' : ''}      <Messages>
${routesTsx}
      </Messages>
    </BrowserRouter>
  </StrictMode>,
);
${mouvement ? '\n// Les animations « au defilement » attendent que l\'élément entre à l\'écran.\nobserverLeDefilement();\n' : ''}${entete ? '\n// « entete avec fixe », « hauteur ecran » : la hauteur de l\'en-tête.\nsuivreLaHauteurDeLEntete();\n' : ''}`;
}

/**
 * Les aides de navigation du code produit : le lien « actif », le défilement
 * vers une ancre, les filtres de l'adresse, le retour et les adresses
 * externes (jamais javascript: ni data:).
 */
const NAVIGATION = `import { useEffect } from 'react';
import { Link, useLocation, useResolvedPath, type LinkProps, type NavigateFunction, type SetURLSearchParams } from 'react-router';

/** Les seuls schémas qu'une adresse externe peut avoir. */
const SCHEMAS = ['http', 'https', 'mailto', 'tel'];

function schemaDe(adresse: string): string | undefined {
  return /^([a-z][a-z0-9+.-]*):/i.exec(adresse.trim())?.[1]?.toLowerCase();
}

/** Un lien vers une page : la page courante est marquée (aria-current et la classe humalis-actif), pour le CSS. */
export function Lien({ filtres = [], className, ...reste }: LinkProps & { filtres?: string[] }) {
  const ici = useLocation();
  const cible = useResolvedPath(reste.to);
  const voulus = new URLSearchParams(cible.search);
  const actuels = new URLSearchParams(ici.search);
  const actif =
    !cible.hash &&
    cible.pathname.replace(/\\/+$/, '') === ici.pathname.replace(/\\/+$/, '') &&
    filtres.every((f) => (voulus.get(f) || null) === (actuels.get(f) || null));
  const classes = [className, actif ? 'humalis-actif' : undefined].filter(Boolean).join(' ');
  return <Link {...reste} className={classes || undefined} aria-current={actif ? 'page' : undefined} />;
}

/** En haut de la page à chaque changement de page (pas de filtre) ; vers l'ancre quand l'adresse en a une. */
export function Defilement() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      // La fenêtre, et la racine si le CSS du site en fait la zone qui défile (en-tête fixe au-dessus).
      window.scrollTo(0, 0);
      document.getElementById('racine')?.scrollTo(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    const aller = () => document.getElementById(id)?.scrollIntoView();
    // La page peut afficher l'ancre un instant après (données reçues) : un deuxième essai.
    requestAnimationFrame(aller);
    const minuteur = setTimeout(aller, 250);
    return () => clearTimeout(minuteur);
  }, [pathname, hash]);
  return null;
}

/** Ouvre une adresse externe ; tout autre schéma est refusé. */
export function ouvrirExterne(adresse: string, nouvelOnglet = false): boolean {
  const schema = schemaDe(adresse);
  if (schema === undefined || !SCHEMAS.includes(schema)) return false;
  if (nouvelOnglet) window.open(adresse, '_blank', 'noopener,noreferrer');
  else window.location.assign(adresse);
  return true;
}

/** « rediriger vers valeur » avec une valeur reçue : une page de l'application, ou une adresse permise. */
export function allerVers(naviguer: NavigateFunction, valeur: string, refuser: (texte: string, genre: 'erreur') => void): void {
  const schema = schemaDe(valeur);
  if (schema === undefined) {
    naviguer(valeur.startsWith('/') && !valeur.startsWith('//') ? valeur : \`/\${valeur.replace(/^\\/+/, '')}\`);
  } else if (!ouvrirExterne(valeur)) {
    refuser(\`Adresse refusée : « \${schema}: » n'est pas permis (https, http, mailto et tel seulement).\`, 'erreur');
  }
}

/** « revenir » : le retour du navigateur ; avec une page de secours quand on est arrivé directement sur celle-ci. */
export function revenirEnArriere(naviguer: NavigateFunction, cle: string, secours?: string): void {
  if (cle !== 'default' || secours === undefined) naviguer(-1);
  else naviguer(secours);
}

/** \`?categorie=costumes\` : les filtres donnés à un lien ; un filtre vide (rien) est omis. */
export function adresseAvecFiltres(valeurs: Record<string, string | number | null | undefined>): string {
  const requete = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(valeurs)) {
    if (valeur !== null && valeur !== undefined && valeur !== '') requete.set(cle, String(valeur));
  }
  const texte = requete.toString();
  return texte ? \`?\${texte}\` : '';
}

export function lireFiltre(filtres: URLSearchParams, cle: string): string | null {
  return filtres.get(cle) || null;
}

export function lireFiltreNombre(filtres: URLSearchParams, cle: string): number | null {
  const texte = filtres.get(cle);
  if (texte === null || texte === '') return null;
  const nombre = Number(texte);
  return Number.isNaN(nombre) ? null : nombre;
}

/** « changer categorie par … » : change le filtre dans l'adresse (une entrée de plus dans l'historique) ; rien l'enlève. */
export function changerFiltre(changer: SetURLSearchParams, cle: string, valeur: string | number | null | undefined): void {
  changer((courants) => {
    const suivants = new URLSearchParams(courants);
    if (valeur === null || valeur === undefined || valeur === '') suivants.delete(cle);
    else suivants.set(cle, String(valeur));
    return suivants;
  });
}
`;

/**
 * La garde d'une page réservée : elle attend de savoir qui est là (la session
 * vient du serveur, jamais d'un stockage de la page), puis laisse passer ou
 * renvoie. Ce n'est pas une protection des données : tout le code du site est
 * envoyé au navigateur ; ce sont les routes du serveur qui protègent.
 */
const RESERVEE = `import { Navigate, Outlet, useLocation } from 'react-router';
import { useUtilisateur } from './session';

export function Reservee({ qui, sinon }: { qui: 'connecte' | 'admin'; sinon: string }) {
  const utilisateur = useUtilisateur();
  const location = useLocation();
  if (!utilisateur.pret) return <p className="humalis-attente" role="status">Vérification…</p>;
  // On note la page voulue : « continuer vers … » y revient après la connexion.
  if (!utilisateur[qui]) return <Navigate to={sinon} replace state={{ apres: location.pathname + location.search }} />;
  return <Outlet />;
}

/** La page voulue avant la connexion, si c'est bien une adresse de ce site (jamais « https://… » ni « //… »). */
export function apresLaGarde(etat: unknown): string | undefined {
  const apres = (etat as { apres?: unknown } | null)?.apres;
  return typeof apres === 'string' && apres.startsWith('/') && !apres.startsWith('//') ? apres : undefined;
}
`;

const INTROUVABLE = `import { Link } from 'react-router';
import { usePage } from './humalis/page';

export default function Introuvable() {
  usePage('Page introuvable', "Cette page n'existe pas.");

  return (
    <main className="humalis-page">
      <h1>Page introuvable</h1>
      <p>Cette page n'existe pas.</p>
      <Link to="/">Revenir à l'accueil</Link>
    </main>
  );
}
`;

const MESSAGES = `import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Genre = 'info' | 'reussite' | 'avertissement' | 'erreur';

/** Ce qu'on peut ajouter à un message : sa durée, ou un bouton. */
export interface OptionsMessage {
  /** En millisecondes ; par défaut 4 secondes, 8 pour un avertissement ou une erreur. */
  duree?: number;
  /** « sans disparaitre » : le message reste jusqu'à ce qu'on le ferme. */
  persistant?: boolean;
  /** Un bouton dans le message (« Annuler », « Réessayer ») et ce qu'il fait. */
  action?: { libelle: string; faire: () => void | Promise<void> };
}

interface Message {
  id: number;
  texte: string;
  genre: Genre;
  /** null : le message reste. */
  duree: number | null;
  action?: OptionsMessage['action'];
}

/** Combien de temps reste un message, selon son genre. */
const DUREES: Record<Genre, number> = { info: 4000, reussite: 4000, avertissement: 8000, erreur: 8000 };
/** Au plus trois messages à la fois : un lecteur d'écran n'est pas noyé. */
const PILE = 3;

/** Afficher un message ; une fonction seule en troisième place est le bouton « Réessayer » d'une requête. */
type Afficher = (texte: string, genre?: Genre, options?: OptionsMessage | (() => void)) => void;

const Contexte = createContext<Afficher>(() => {});

/**
 * Les messages (« afficher » dans un événement) : une pile en haut de la page,
 * toujours présente, pour qu'un lecteur d'écran annonce ce qui y arrive.
 */
export function Messages({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const suivant = useRef(0);
  const fermer = useCallback((id: number) => setMessages((liste) => liste.filter((m) => m.id !== id)), []);

  const afficher = useCallback<Afficher>((texte, genre = 'info', options = {}) => {
    const reglages: OptionsMessage = typeof options === 'function' ? { action: { libelle: 'Réessayer', faire: options }, duree: 12000 } : options;
    // Un message qui propose un bouton reste le temps de le lire et de cliquer.
    const duree = reglages.persistant ? null : Math.max(reglages.duree ?? DUREES[genre], reglages.action ? 8000 : 0);
    const message: Message = { id: ++suivant.current, texte, genre, duree, ...(reglages.action ? { action: reglages.action } : {}) };
    setMessages((liste) => [...liste, message].slice(-PILE));
  }, []);

  return (
    <Contexte.Provider value={afficher}>
      <ul className="humalis-messages" aria-live="polite">
        {messages.map((message) => (
          <UnMessage key={message.id} message={message} fermer={fermer} />
        ))}
      </ul>
      {children}
    </Contexte.Provider>
  );
}

/** Un message : il disparaît après sa durée, mais pas tant que la souris ou le focus sont dessus. */
function UnMessage({ message, fermer }: { message: Message; fermer: (id: number) => void }) {
  const [enPause, setEnPause] = useState(false);
  useEffect(() => {
    if (message.duree === null || enPause) return;
    const minuterie = setTimeout(() => fermer(message.id), message.duree);
    return () => clearTimeout(minuterie);
  }, [message, enPause, fermer]);

  return (
    <li
      className={\`humalis-message humalis-message-\${message.genre}\`}
      onMouseEnter={() => setEnPause(true)}
      onMouseLeave={() => setEnPause(false)}
      onFocus={() => setEnPause(true)}
      onBlur={() => setEnPause(false)}
      onKeyDown={(evenement) => evenement.key === 'Escape' && fermer(message.id)}
    >
      {/* Le texte seul est lu : « status » est poli, « alert » (une erreur) passe devant. */}
      <span className="humalis-message-texte" role={message.genre === 'erreur' ? 'alert' : 'status'}>
        {message.texte}
      </span>
      {message.action && (
        <button
          type="button"
          className="humalis-message-action"
          onClick={() => {
            const faire = message.action?.faire;
            fermer(message.id);
            void faire?.();
          }}
        >
          {message.action.libelle}
        </button>
      )}
      <button type="button" className="humalis-message-fermer" aria-label="Fermer le message" onClick={() => fermer(message.id)}>
        ×
      </button>
    </li>
  );
}

export function useMessages() {
  return { afficherMessage: useContext(Contexte) };
}
`;

const PAGE = `import { useEffect } from 'react';

/**
 * Le titre et la description de la page, lus par les moteurs de recherche.
 * La balise de description est aussi le signal attendu par le prérendu.
 */
export function usePage(titre: string, description: string) {
  // L'onglet suit le premier titre affiché, même calculé (« titre plat.nom ») :
  // relu après chaque affichage, quand les données sont arrivées.
  useEffect(() => {
    document.title = document.querySelector('main h1')?.textContent?.trim() || titre;
  });
  useEffect(() => {
    let balise = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!balise) {
      balise = document.createElement('meta');
      balise.name = 'description';
      document.head.appendChild(balise);
    }
    balise.content = description;
  }, [description]);
}
`;

/**
 * Le titre, la description et l'aperçu de partage (bloc « site : » ou « apercu : »).
 * Le titre est donné complet (« Bienvenue | Rey Store ») ; le prérendu enregistre
 * ces balises dans le HTML de chaque page, que lisent les moteurs et les réseaux sociaux.
 */
const PAGE_PUBLICATION = `import { useEffect } from 'react';

interface Apercu {
  /** L'adresse complète de la page (lien canonique, og:url). */
  adresse?: string;
  /** L'adresse complète de l'image de partage. */
  image?: string;
  /** La page est cachée aux moteurs de recherche. */
  noindex?: boolean;
  sousPage?: boolean;
  cede?: boolean;
}

/** Crée la balise si elle manque, puis lui donne sa valeur. */
function meta(attribut: 'name' | 'property', nom: string, valeur: string | undefined) {
  let balise = document.head.querySelector<HTMLMetaElement>(\`meta[\${attribut}="\${nom}"]\`);
  if (valeur === undefined) {
    balise?.remove();
    return;
  }
  if (!balise) {
    balise = document.createElement('meta');
    balise.setAttribute(attribut, nom);
    document.head.appendChild(balise);
  }
  balise.content = valeur;
}

export function usePage(titre: string, description: string, apercu: Apercu = {}) {
  useEffect(() => {
    if (apercu.cede) return;
    document.title = titre;
    meta('name', 'description', description);
    meta('property', 'og:title', titre);
    meta('property', 'og:description', description);
    meta('property', 'og:type', 'website');
    meta('property', 'og:url', apercu.adresse);
    meta('property', 'og:image', apercu.image);
    meta('name', 'twitter:card', apercu.image ? 'summary_large_image' : 'summary');
    meta('name', 'robots', apercu.noindex ? 'noindex' : undefined);
    let canonique = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (apercu.adresse) {
      if (!canonique) {
        canonique = document.createElement('link');
        canonique.rel = 'canonical';
        document.head.appendChild(canonique);
      }
      canonique.href = apercu.adresse;
    } else canonique?.remove();
  }, [titre, description, apercu.adresse, apercu.image, apercu.noindex, apercu.cede]);
}
`;

/** Le titre avec des sous-pages : la page parente cède le titre à sa sous-page, qui lit son propre premier titre. */
const PAGE_SOUS_PAGES = PAGE.replace(
  'export function usePage(titre: string, description: string) {',
  'export function usePage(titre: string, description: string, options: { sousPage?: boolean; cede?: boolean } = {}) {',
)
  .replace(
    "    document.title = document.querySelector('main h1')?.textContent?.trim() || titre;",
    "    if (options.cede) return;\n    document.title = document.querySelector(options.sousPage ? '.humalis-sous-page h1' : 'main h1')?.textContent?.trim() || titre;",
  )
  .replace(
    "  useEffect(() => {\n    let balise",
    "  useEffect(() => {\n    if (options.cede) return;\n    let balise",
  )
  .replace('}, [description]);', '}, [description, options.cede]);');

const SERVEUR = `import { useMessages } from './messages';

/** L'adresse du serveur : la même origine par défaut, ou VITE_HUMALIS_SERVEUR. */
const BASE = import.meta.env.VITE_HUMALIS_SERVEUR ?? '';

/**
 * Les requêtes (« envoyer requete »). En cas d'échec, un message en
 * français s'affiche et la valeur actuelle est gardée.
 */
export function useServeur() {
  const { afficherMessage } = useMessages();

  async function appeler<T>(adresse: string, options: RequestInit, actuelle: T): Promise<T> {
    try {
      // Les envois portent le jeton CSRF que pose @astratra/security (cookie astratra_csrf).
      const jeton = document.cookie.match(/(?:^|; )astratra_csrf=([^;]*)/)?.[1];
      const entetes = new Headers(options.headers);
      if (options.method !== 'GET' && jeton) entetes.set('x-csrf-token', decodeURIComponent(jeton));
      const reponse = await fetch(BASE + adresse, { ...options, headers: entetes, credentials: 'same-origin' });
      if (!reponse.ok) throw new Error(String(reponse.status));
      const texte = await reponse.text();
      if (texte === '') return actuelle;
      const valeur = JSON.parse(texte) as T;
      // On attendait une liste et on reçoit autre chose (le prérendu répond {}) :
      // la valeur actuelle est gardée, pour que la page ne casse pas.
      return Array.isArray(actuelle) && !Array.isArray(valeur) ? actuelle : valeur;
    } catch {
      afficherMessage("Le serveur n'a pas répondu. Réessayez dans un instant.", 'erreur');
      return actuelle;
    }
  }

  // Avec une valeur actuelle, la réponse a son type ; sans, elle est inconnue.
  return {
    lire: (adresse: string, actuelle?: unknown) => appeler(adresse, { method: 'GET' }, actuelle),
    // « avec id dans produit » : un seul élément, par son identifiant.
    lireUn: (adresse: string, id: string, actuelle?: unknown) =>
      appeler(\`\${adresse}/\${encodeURIComponent(id)}\`, { method: 'GET' }, actuelle),
    envoyer: (adresse: string, donnees: Record<string, unknown>, actuelle?: unknown) =>
      appeler(
        adresse,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(donnees) },
        actuelle,
      ),
    // « supprimer p de … » et « modifier p dans … » : la donnée est désignée par son identifiant.
    supprimer: (adresse: string, id: string) =>
      appeler(\`\${adresse}/\${encodeURIComponent(id)}\`, { method: 'DELETE' }, undefined),
    modifier: (adresse: string, id: string, donnees: Record<string, unknown>) =>
      appeler(
        \`\${adresse}/\${encodeURIComponent(id)}\`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(donnees) },
        undefined,
      ),
  } as Serveur;
}

interface Serveur {
  lire<T>(adresse: string, actuelle: T): Promise<T>;
  lire(adresse: string): Promise<unknown>;
  lireUn<T>(adresse: string, id: string, actuelle: T): Promise<T>;
  envoyer<T>(adresse: string, donnees: Record<string, unknown>, actuelle: T): Promise<T>;
  envoyer(adresse: string, donnees: Record<string, unknown>): Promise<unknown>;
  supprimer(adresse: string, id: string): Promise<unknown>;
  modifier(adresse: string, id: string, donnees: Record<string, unknown>): Promise<unknown>;
}
`;

/**
 * `useServeur()` compte ses échecs quand une page en a besoin : la
 * soumission d'un formulaire s'arrête après une requête refusée, et ne vide
 * ses champs qu'après un envoi réussi. Sans formulaire, le fichier reste
 * celui d'avant. Le même pour le web et le mobile.
 */
export function avecEchecs(modele: string, codes: string[]): string {
  if (!codes.some((c) => c.includes('serveur.echecs()'))) return modele;
  const remplacer = (texte: string, avant: string, apres: string) => {
    if (!texte.includes(avant)) throw new Error(`modèle du serveur inattendu : ${avant}`);
    return texte.replace(avant, apres);
  };
  let texte = `import { useRef } from 'react';\n${modele}`;
  texte = remplacer(
    texte,
    '  const { afficherMessage } = useMessages();\n',
    '  const messages = useMessages();\n  // Le nombre de requêtes qui ont échoué depuis l\'ouverture de la page.\n  const echecs = useRef(0);\n' +
      '  // Pendant « essayer », le message automatique se tait : c\'est « si erreur » qui parle.\n  const silence = useRef(0);\n' +
      '  const afficherMessage = (...valeurs: Parameters<typeof messages.afficherMessage>) => {\n    if (silence.current === 0) messages.afficherMessage(...valeurs);\n  };\n',
  );
  // Chaque appel compte ses échecs : celui du serveur du fichier, et celui d'une source.
  const dansLeHook = texte.indexOf('export function useServeur()');
  texte =
    texte.slice(0, dansLeHook) +
    texte.slice(dansLeHook).replace(/^ {4}\} catch(?: \(\w+\))? \{\n/gm, (catche) => `${catche}      echecs.current += 1;\n`);
  if (!texte.includes('echecs.current += 1')) throw new Error('modèle du serveur inattendu : catch');
  texte = remplacer(texte, '    lire: (adresse: string', '    echecs: () => echecs.current,\n    taire: (oui: boolean) => {\n      silence.current += oui ? 1 : -1;\n    },\n    lire: (adresse: string');
  texte = remplacer(texte, 'interface Serveur {\n', 'interface Serveur {\n  echecs(): number;\n  taire(oui: boolean): void;\n');
  return texte;
}

/**
 * Les vérifications propres à la cible web : ce que le web ne sait pas
 * faire sans inventer de sécurité (« memorisee en secret »).
 */
export function verifierPourLeWeb(application: Application): Diagnostic[] {
  const etats: Etat[] = [...application.partages, ...application.ecrans.flatMap((e) => e.etat)];
  return etats
    .filter((e) => e.secret)
    .map((e) => ({
      gravite: 'erreur' as const,
      message:
        "« memorisee en secret » n'existe pas sur le web : le navigateur n'a pas de coffre sûr pour garder un secret. La connexion passera par les packs Astratra (étape 3).",
      ligne: e.ligne,
    }));
}

export function partageTsx(partages: Etat[], cle: string): string {
  const contexte = { types: new Map(partages.map((p) => [p.nom, p.type])), champs: new Map<string, string>() };
  const champsType = partages
    .map((p) => `  ${camel(p.nom)}: ${typeTS(p.type)};\n  ${setter(p.nom)}: (valeur: ${typeTS(p.type)}) => void;`)
    .join('\n');
  const etats = partages
    .map((p) => {
      const annotation = `<${typeTS(p.type)}>`;
      const initiale = expression(p.initiale, contexte);
      // Un secret n'existe que sur le mobile, gardé dans le coffre du téléphone.
      const crochet = p.secret ? 'useMemoriseSecret' : 'useMemorise';
      return p.memorisee
        ? `  const [${camel(p.nom)}, ${setter(p.nom)}] = ${crochet}${annotation}(${chaine(`${cle}:partage:${p.nom}`)}, ${initiale});`
        : `  const [${camel(p.nom)}, ${setter(p.nom)}] = useState${annotation}(${initiale});`;
    })
    .join('\n');
  const valeurs = partages.flatMap((p) => [camel(p.nom), setter(p.nom)]).join(', ');
  const crochets = [
    ...(partages.some((p) => p.memorisee && !p.secret) ? ['useMemorise'] : []),
    ...(partages.some((p) => p.memorisee && p.secret) ? ['useMemoriseSecret'] : []),
  ];
  const etat = partages.some((p) => !p.memorisee);
  return `import { createContext, useContext${etat ? ', useState' : ''}, type ReactNode } from 'react';
${crochets.length ? `import { ${crochets.join(', ')} } from './memoire';\n` : ''}
/** Les variables partagées entre les pages (« variable … avec partagee »). */
interface Partages {
${champsType}
}

const Contexte = createContext<Partages | null>(null);

export function Partage({ children }: { children: ReactNode }) {
${etats}

  return <Contexte.Provider value={{ ${valeurs} }}>{children}</Contexte.Provider>;
}

export function usePartage(): Partages {
  const partages = useContext(Contexte);
  if (!partages) throw new Error("usePartage doit être utilisé à l'intérieur de <Partage>.");
  return partages;
}
`;
}

export const MEMOIRE = `import { useEffect, useState } from 'react';

/**
 * Comme useState, mais la valeur est gardée dans le navigateur
 * (« avec memorisee ») et retrouvée au retour du visiteur. Si le stockage
 * est absent (navigation privée, prérendu), la valeur de départ sert.
 */
export function useMemorise<T>(cle: string, initiale: T): [T, (valeur: T) => void] {
  const [valeur, setValeur] = useState<T>(() => {
    try {
      const gardee = localStorage.getItem(cle);
      return gardee === null ? initiale : (JSON.parse(gardee) as T);
    } catch {
      return initiale;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(cle, JSON.stringify(valeur));
    } catch {
      // Stockage plein ou interdit : la valeur reste en mémoire.
    }
  }, [cle, valeur]);

  return [valeur, setValeur];
}
`;

/** La session (décision L5) : src/humalis/session.tsx, placé autour des pages. */
const SESSION = `import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMessages } from './messages';

/** L'adresse du serveur : la même origine par défaut, ou VITE_HUMALIS_SERVEUR. */
const BASE = import.meta.env.VITE_HUMALIS_SERVEUR ?? '';

/** Ce que /auth/me dit de la personne connectée. */
interface Personne {
  id: string;
  email: string;
  role?: string;
}

interface Utilisateur {
  personne: Personne | null;
  /** Vrai dès que /auth/me a répondu : avant, la page ne sait pas encore qui est là. */
  pret: boolean;
  /** « si utilisateur est connecte ». */
  connecte: boolean;
  /** « si utilisateur est admin » : le rôle que vérifie le serveur (authorizeAdmin). */
  admin: boolean;
  /** Vrai si la connexion a réussi ; sinon un message d'erreur s'affiche. */
  seConnecter(email: string, motDePasse: string): Promise<boolean>;
  seDeconnecter(): Promise<void>;
  /** Demande /auth/me une seule fois, à la première page qui lit la session. */
  demander(): void;
}

const Contexte = createContext<Utilisateur | null>(null);

/** Le jeton CSRF que pose @astratra/security (cookie astratra_csrf), pour les envois. */
function entetes(): Headers {
  const entetes = new Headers({ 'Content-Type': 'application/json' });
  const jeton = document.cookie.match(/(?:^|; )astratra_csrf=([^;]*)/)?.[1];
  if (jeton) entetes.set('x-csrf-token', decodeURIComponent(jeton));
  return entetes;
}

/**
 * La session : qui est connecté, lu sur /auth/me du serveur. La session
 * elle-même est le cookie HttpOnly posé par le pack, que le JavaScript ne
 * peut pas lire : la page ne garde ni jeton ni mot de passe.
 */
export function Session({ children }: { children: ReactNode }) {
  const { afficherMessage } = useMessages();
  const [personne, setPersonne] = useState<Personne | null>(null);
  const [pret, setPret] = useState(false);
  // La dernière réponse de /auth/me : un événement en cours (juste après
  // « se connecter ») la lit, sans attendre le prochain affichage.
  const derniere = useRef<Personne | null>(null);
  const demandee = useRef(false);

  // L'état « connecté » vient toujours du serveur, jamais d'un stockage de la page.
  const relire = useCallback(async () => {
    try {
      const reponse = await fetch(BASE + '/auth/me', { credentials: 'same-origin' });
      const corps = reponse.ok ? ((await reponse.json()) as { data?: Personne | null }) : null;
      derniere.current = corps?.data?.id !== undefined ? corps.data : null;
    } catch {
      derniere.current = null;
    }
    setPersonne(derniere.current);
    setPret(true);
  }, []);

  const demander = useCallback(() => {
    if (demandee.current) return;
    demandee.current = true;
    void relire();
  }, [relire]);

  async function seConnecter(email: string, motDePasse: string): Promise<boolean> {
    let reponse: Response;
    try {
      reponse = await fetch(BASE + '/auth/login', {
        method: 'POST',
        headers: entetes(),
        credentials: 'same-origin',
        body: JSON.stringify({ email, password: motDePasse }),
      });
    } catch {
      afficherMessage("Le serveur n'a pas répondu. Réessayez dans un instant.", 'erreur');
      return false;
    }
    if (reponse.status === 429) {
      afficherMessage('Trop de tentatives de connexion. Réessayez dans quelques minutes.', 'erreur');
      return false;
    }
    if (!reponse.ok) {
      // Jamais lequel des deux est faux : on ne dit pas si un compte existe.
      afficherMessage('Email ou mot de passe incorrect.', 'erreur');
      return false;
    }
    // La réponse contient aussi un jeton : il n'est pas gardé, le cookie du pack suffit.
    await relire();
    return true;
  }

  async function seDeconnecter(): Promise<void> {
    try {
      await fetch(BASE + '/auth/logout', { method: 'POST', headers: entetes(), credentials: 'same-origin' });
    } catch {
      afficherMessage("Le serveur n'a pas répondu. Réessayez dans un instant.", 'erreur');
    }
    await relire();
  }

  const valeur: Utilisateur = {
    personne,
    pret,
    get connecte() {
      return derniere.current !== null;
    },
    get admin() {
      return derniere.current?.role === 'admin';
    },
    seConnecter,
    seDeconnecter,
    demander,
  };
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useUtilisateur(): Utilisateur {
  const utilisateur = useContext(Contexte);
  if (!utilisateur) throw new Error("useUtilisateur doit être utilisé à l'intérieur de <Session>.");
  useEffect(() => {
    utilisateur.demander();
  }, [utilisateur.demander]);
  return utilisateur;
}
`;

/** humalis/outils.ts : le format français (décision F1) n'est écrit que si une page s'en sert. */
export function outils(codes: string[], langues = false): string {
  // Plusieurs langues : les mêmes fonctions, avec la langue en dernier paramètre.
  const format = codes.some((c) => /\b(formater(Nombre|Date|Argent)|accorder)\(/.test(c)) ? `\n${langues ? FORMAT_TS_LANGUES : FORMAT_TS}` : '';
  const groupes = codes.some((c) => /\bgrouper\(/.test(c)) ? `\n${GROUPER_TS}` : '';
  const taille = codes.some((c) => /\bformaterTaille\(/.test(c)) ? `\n${TAILLE_TS}` : '';
  const dates = codes.some((c) => /\b(dateDuJour|maintenant|decalerDate|joursEntre|formaterDepuis)\(/.test(c)) ? `\n${DATES_TS}` : '';
  return `${OUTILS}${format}${groupes}${taille}${dates}`;
}

/** « grouper produits par categorie », écrit seulement si une page s'en sert. */
const GROUPER_TS = `/** Un groupe par valeur de la clé, dans l'ordre d'apparition : { nom, elements }. */
export function grouper<T, C>(liste: T[], cle: (element: T) => C): { nom: C; elements: T[] }[] {
  const groupes: { nom: C; elements: T[] }[] = [];
  for (const element of liste) {
    const nom = cle(element);
    const groupe = groupes.find((g) => g.nom === nom);
    if (groupe) groupe.elements.push(element);
    else groupes.push({ nom, elements: [element] });
  }
  return groupes;
}
`;

export const OUTILS = `/** Retire la première valeur égale (« retirer … de … ») ; la liste reste telle quelle si elle ne la contient pas. */
export function retirerPremier<T>(liste: T[], valeur: T): T[] {
  const position = liste.indexOf(valeur);
  return position === -1 ? liste : [...liste.slice(0, position), ...liste.slice(position + 1)];
}
`;

/** Les styles des formulaires et de leurs champs (cases, choix, listes, textes longs). */
const STYLES_FORMULAIRES = `
.humalis-formulaire { margin: 1rem 0; }
.humalis-champ textarea, .humalis-champ select { font: inherit; padding: 0.5rem; border: 1px solid #8a8a90; border-radius: 0.375rem; }
.humalis-case { display: flex; align-items: center; gap: 0.5rem; margin: 0.75rem 0; }
.humalis-choix { border: none; padding: 0; margin: 0.75rem 0; }
.humalis-choix legend { padding: 0; margin-bottom: 0.25rem; }
.humalis-choix label { display: flex; align-items: center; gap: 0.5rem; }
.humalis-obligatoire { color: var(--humalis-rouge); }
`;

/** La base de mise en page des blocs : le CSS de l'utilisateur, chargé après, la redéfinit. */
const STYLES_BLOCS = `
.humalis-section { margin: 2rem 0; }
.humalis-ligne { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
.humalis-colonne { display: flex; flex-direction: column; gap: 0.75rem; }
.humalis-grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr)); gap: 1rem; }
.humalis-menu { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
.humalis-menu > *, .humalis-ligne > *, .humalis-colonne > *, .humalis-grille > * { margin-top: 0; margin-bottom: 0; }
`;

export function styles(formulaires = false, blocs = false): string {
  const couleurs = Object.entries(COULEURS_CSS);
  const variables = (mode: 'clair' | 'sombre') =>
    couleurs
      .map(([nom, v]) => {
        const encre = mode === 'clair' ? v.encreClair : v.encreSombre;
        return `  --humalis-${nom}: ${v[mode]};\n  --humalis-${nom}-encre: ${encre};`;
      })
      .join('\n');
  const classes = couleurs
    .map(
      ([nom]) =>
        `.humalis-couleur-${nom}, .humalis-texte-${nom} { color: var(--humalis-${nom}); }\n` +
        `.humalis-fond-${nom} { background: var(--humalis-${nom}); color: var(--humalis-${nom}-encre); border-color: transparent; }`,
    )
    .join('\n');
  return `/* Produit par Humalis : le jeu de styles nommés (couleur, fond, texte, taille, position, bordure). */
:root {
  color-scheme: light dark;
  --humalis-page: #ffffff;
  --humalis-encre: #1d1d1f;
${variables('clair')}
}

@media (prefers-color-scheme: dark) {
  :root {
    --humalis-page: #141416;
    --humalis-encre: #f2f2f4;
${variables('sombre').replace(/^/gm, '  ')}
  }
}

body {
  margin: 0;
  background: var(--humalis-page);
  color: var(--humalis-encre);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.5;
}

.humalis-page {
  max-width: 48rem;
  margin: 0 auto;
  padding: 1.5rem 1rem 4rem;
}

button {
  font: inherit;
  padding: 0.5rem 1rem;
  margin: 0.25rem 0.5rem 0.25rem 0;
  border: 1px solid currentColor;
  border-radius: 0.375rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.humalis-champ { display: flex; flex-direction: column; gap: 0.25rem; margin: 0.75rem 0; }
.humalis-champ input { font: inherit; padding: 0.5rem; border: 1px solid #8a8a90; border-radius: 0.375rem; }
img { max-width: 100%; height: auto; }
/* Un lien Humalis est un élément à part entière : il va à la ligne. */
.humalis-page a { display: block; width: fit-content; margin: 0.75rem 0; color: var(--humalis-bleu); }

${classes}

.humalis-taille-petite { font-size: 0.875rem; }
.humalis-taille-normale { font-size: 1rem; }
.humalis-taille-grande { font-size: 2rem; }
.humalis-taille-tres_grande { font-size: 3rem; }
.humalis-position-gauche { text-align: left; }
.humalis-position-centree { text-align: center; }
.humalis-position-droite { text-align: right; }
.humalis-bordure-arrondie { border-radius: 999px; }
.humalis-bordure-carree { border-radius: 0; }

.humalis-messages { position: fixed; top: 1rem; left: 50%; transform: translateX(-50%); z-index: 10; width: min(32rem, calc(100% - 2rem)); margin: 0; padding: 0; list-style: none; display: grid; gap: 0.5rem; }
.humalis-message { display: flex; align-items: center; gap: 0.5rem; margin: 0; padding: 0.5rem 0.5rem 0.5rem 1rem; border-radius: 0.5rem; background: var(--humalis-encre); color: var(--humalis-page); box-shadow: 0 4px 16px rgb(0 0 0 / 0.2); }
.humalis-message-texte { flex: 1; }
.humalis-message button { margin: 0; border-color: currentColor; color: inherit; }
.humalis-message-fermer { padding: 0.25rem 0.6rem; line-height: 1; }
.humalis-message-reussite { background: var(--humalis-vert); color: var(--humalis-vert-encre); }
.humalis-message-avertissement { background: var(--humalis-orange); color: var(--humalis-orange-encre); }
.humalis-message-erreur { background: var(--humalis-rouge); color: var(--humalis-rouge-encre); }
${formulaires ? STYLES_FORMULAIRES : ''}${blocs ? STYLES_BLOCS : ''}`;
}

function lisezmoi(options: OptionsWeb): string {
  return `# ${options.nom}

Application web produite par Humalis depuis \`${options.source}\`.

\`\`\`sh
npm install
npm run dev       # développement, http://localhost:5173
npm run build     # vérification des types, construction, puis prérendu (une page HTML par adresse)
npm run preview   # sert le résultat construit
\`\`\`

Le prérendu (\`@astratra/prerender\`) ouvre le site dans un navigateur sans
écran (Playwright) : la première fois, installez-le avec
\`npx playwright install chromium\`. Pour construire sans prérendu :
\`npm run build:sans-prerendu\`.

L'adresse du serveur des requêtes se règle avec \`VITE_HUMALIS_SERVEUR\`.

Ce dossier est réécrit à chaque compilation Humalis. Pour le reprendre à
la main, supprimez le fichier \`${MARQUE}\` : Humalis refusera alors de
l'écraser.
`;
}

/**
 * Le mode « composants » (étape 2, décision I3) : seulement les pages et
 * leurs outils, à déposer dans un projet React existant. Les pages sont
 * les mêmes que dans le projet complet ; `HumalisRacine` regroupe ce
 * qu'elles attendent autour d'elles (messages, variables partagées, CSS).
 */
export function genererComposantsWeb(application: Application, options: OptionsWeb): Map<string, string> {
  const complet = genererProjetWeb(application, options);
  const fichiers = new Map<string, string>();
  const gardes = (chemin: string) =>
    chemin.startsWith('src/pages/') ||
    chemin.startsWith('src/humalis/') ||
    chemin.startsWith('src/styles/') ||
    chemin.startsWith('src/composants/');

  fichiers.set(MARQUE, complet.get(MARQUE)!);
  for (const [chemin, contenu] of complet) {
    if (gardes(chemin)) fichiers.set(chemin.slice('src/'.length), contenu);
  }

  const partage = application.partages.length > 0;
  const session = complet.has('src/humalis/session.tsx');
  let enfants = partage ? '<Partage>{children}</Partage>' : '{children}';
  if (session) enfants = `<Session>${enfants}</Session>`;
  const feuilles = [...fichiers.keys()].filter((c) => c.startsWith('styles/'));
  fichiers.set(
    'humalis/racine.tsx',
    `import type { ReactNode } from 'react';
import { Messages } from './messages';
${session ? "import { Session } from './session';\n" : ''}${partage ? "import { Partage } from './partage';\n" : ''}import './styles.css';
${feuilles.map((f) => `import '../${f}';\n`).join('')}
/**
 * À placer une fois autour des pages Humalis, à l'intérieur du routeur
 * de ton projet (BrowserRouter de react-router).
 */
export function HumalisRacine({ children }: { children: ReactNode }) {
  return (
    <Messages>
      ${enfants}
    </Messages>
  );
}
`,
  );

  const chemins = cheminsDesPages(application);
  const pages = application.ecrans
    .map((e) => `| \`pages/${genererNomComposant(e.nom)}.tsx\` | \`${chemins.get(e.nom)}\` |`)
    .join('\n');
  fichiers.set(
    'LISEZMOI.md',
    `# ${options.nom} : les pages Humalis, pour un projet React

Produit par Humalis depuis \`${options.source}\`, en mode \`--composants\`.
Chaque page est un composant React exporté par défaut.

## Dans ton projet

Ton projet doit avoir \`react\` et \`react-dom\` (${VERSIONS.react} ou plus
récent) et \`react-router\` (${VERSIONS.reactRouter} ou plus récent).

\`\`\`tsx
import { BrowserRouter, Route, Routes } from 'react-router';
import { HumalisRacine } from './${'<ce dossier>'}/humalis/racine';
import Boutique from './${'<ce dossier>'}/pages/Boutique';

<BrowserRouter>
  <HumalisRacine>
    <Routes>
      <Route path="/" element={<Boutique />} />
    </Routes>
  </HumalisRacine>
</BrowserRouter>
\`\`\`

## Les adresses attendues

Les pages naviguent entre elles avec ces adresses : déclare les mêmes
routes dans ton projet.

| Page | Adresse |
|---|---|
${pages}

Ce dossier est réécrit à chaque compilation Humalis (fichier \`${MARQUE}\`).
`,
  );
  return fichiers;
}

/** Le nom du composant d'une page, comme dans src/pages/. */
const genererNomComposant = (nom: string) => pascal(nom);
