/**
 * La cible statique (étape 7) :
 * un site en HTML, CSS et JavaScript écrit en clair, sans framework ni
 * construction, qu'on dépose tel quel chez un hébergeur.
 */
import { copiesDesMedias } from '../../ri/medias.js';
import { titreComplet, adresseImage, sansBarreFinale, robotsTxt, manifeste, fichiersDuSite, balisesIcone, estExterne, echapper } from '../publication.js';
import { avecDisposition } from './disposition.js';
import { usageElements, exportsElements, elementsJs, type UsageElements } from './elements-js.js';
import { QRCODE_GENERATOR } from './qrcode-donnees.js';
import { LEAFLET_JS, LEAFLET_CSS } from './leaflet-donnees.js';
import { GRAPHIQUE_JS } from './graphique.js';
import { cssGraphique } from '../web/graphique.js';
import { cssEcran } from '../web/css-ecran.js';
import { cssElements } from '../web/css-elements.js';
import { cssInteractions } from '../web/interactions.js';
import { cssMouvement, animeAuDefilement, OBSERVATEUR_DEFILEMENT } from '../commun/mouvement.js';
import type { InfoMedia } from '../../ri/medias.js';
import { cssTheme, changeLeTheme, modeParDefaut, SCRIPT_THEME, CLE_THEME } from '../web/theme.js';
import { FORMAT_JS, FORMAT_JS_LANGUES, TAILLE_JS, DATES_JS } from '../format.js';
import { CLE_LANGUE } from '../web/langue.js';
import { messagesDuSiteStatique } from '../../i18n/messages.js';
import type { Application, Gestionnaire, NoeudVue, LangueRI } from '../../ri/types.js';
import type { Diagnostic } from '../../analyse/erreurs.js';
import { nomsDesStyles } from '../web/projet.js';
import { simplifier } from '../../analyse/elements.js';
import { cheminsDesPages, styles, verifierPourLeWeb } from '../web/projet.js';
import { chaine } from '../web/noms.js';
import { echapperAttribut, echapperTexte } from './html.js';
import { genererPageStatique, genererComposantStatique, genererFonctionsStatique, type ContexteSite } from './page.js';
import { connaitreFonctions } from './valeurs.js';

export interface OptionsStatique {
  /** Le nom du site, tiré du fichier Humalis (« boutique »). */
  nom: string;
  /** Le fichier Humalis d'origine, cité dans les fichiers produits. */
  source: string;
  /** Le contenu de chaque fichier de « utiliser style "…" », lu par la commande. */
  fichiersStyle?: Map<string, string>;
  /** Les fichiers de police du thème, lus par la commande, en base 64. */
  polices?: Map<string, string>;
  /** Les fichiers locaux du programme (images), lus par la commande : leur taille et leurs dimensions. */
  medias?: Map<string, InfoMedia>;
  /** Le logo et l'image de partage du bloc « site », lus par la commande, en base 64. */
  images?: Map<string, string>;
  /** L'adresse publique du site (--adresse), à la place de celle du bloc « site ». */
  adresse?: string;
}

/** Le fichier qui marque un dossier produit par Humalis (voir la commande compile). */
export const MARQUE_STATIQUE = '.humalis-projet';

/** « ./themes/clair.css » → « clair.css ». */

/**
 * Chaque page a son fichier (décision T1) : la page « accueil », ou à
 * défaut la première, est index.html ; les autres prennent leur nom.
 */
export function fichiersDesPages(application: Application): Map<string, string> {
  const chemins = cheminsDesPages(application);
  return new Map(application.ecrans.map((e) => [e.nom, chemins.get(e.nom) === '/' ? 'index.html' : `${simplifier(e.nom) || 'page'}.html`]));
}

/** Les fichiers du site statique, prêts à déposer chez un hébergeur. */
export function genererProjetStatique(application: Application, options: OptionsStatique): Map<string, string> {
  const fichiers = new Map<string, string>();
  const pagesFichiers = fichiersDesPages(application);
  const site: ContexteSite = {
    partages: application.partages,
    cle: `humalis:${simplifier(options.nom) || 'application'}`,
    fichiers: pagesFichiers,
    composants: new Map(application.composants.map((c) => [c.nom, c])),
    medias: options.medias,
    ...(application.langues ? { langues: application.langues } : {}),
  };
  const langue = application.langues?.[0].code;

  // Le CSS de l'utilisateur, recopié tel quel (décision W8), chargé après
  // celui de Humalis pour pouvoir le redéfinir.
  const feuilles = ['humalis/styles.css'];
  if (application.css.length > 0) {
    fichiers.set('styles/style.css', application.css.join('\n\n') + '\n');
    feuilles.push('styles/style.css');
  }
  // Le fichier des blocs « style : » s'appelle style.css : un fichier de l'utilisateur du même nom ne l'écrase pas.
  const nomsStyles = nomsDesStyles(application.fichiersStyle.map((f) => f.chemin), application.css.length > 0 ? ['style.css'] : []);
  for (const { chemin } of application.fichiersStyle) {
    const contenu = options.fichiersStyle?.get(chemin);
    if (contenu === undefined) throw new Error(`le fichier de style « ${chemin} » n'a pas été lu`);
    fichiers.set(`styles/${nomsStyles.get(chemin)}`, contenu);
    feuilles.push(`styles/${nomsStyles.get(chemin)}`);
  }

  // Les fonctions d'abord : le HTML de départ calcule leurs appels.
  connaitreFonctions(application.fonctions);
  const bascule = changeLeTheme(application);
  const modeTheme = modeParDefaut(application.theme);
  const avecEntete = application.disposition !== undefined;
  const adresse = options.adresse ?? application.site?.adresse;
  const pages = application.ecrans.map((ecran) => ({ ecran, page: genererPageStatique(avecDisposition(ecran, application.disposition), site, options.source) }));
  const serveur = pages.some(({ page }) => page.serveur);
  const session = pages.some(({ page }) => page.session);

  fichiers.set(MARQUE_STATIQUE, `Site produit par Humalis depuis ${options.source}.\nLe compilateur réécrit ce dossier à chaque compilation.\n`);
  // Les styles des formulaires, seulement si une page en a (comme sur le web).
  const formulaires = JSON.stringify([...application.ecrans, ...application.composants].map((e) => e.vue)).match(/"type":"formulaire"|"saisie":/) !== null;
  const blocs = JSON.stringify([...application.ecrans, ...application.composants].map((e) => e.vue)).includes('"type":"bloc"');
  fichiers.set('humalis/styles.css', styles(formulaires, blocs));
  if (application.fonctions.length > 0) fichiers.set('fonctions.js', genererFonctionsStatique(application.fonctions, site, options.source));
  if (application.composants.length > 0) {
    const fonctions = application.composants.map((c) => genererComposantStatique(c, site));
    fichiers.set(
      'composants.js',
      `// Produit par Humalis depuis ${options.source} : les composants écrits en Humalis.
// Chacun reçoit ses paramètres et rend ses éléments, placés dans la page.
'use strict';

${fonctions.join('\n')}`,
    );
  }
  for (const { ecran, page } of pages) {
    const script = `pages/${simplifier(ecran.nom) || 'page'}.js`;
    const qr = /\bcodeQr\(/.test(page.script) || (page.composants && /\bcodeQr\(/.test(fichiers.get('composants.js') ?? ''));
    // Une carte : Leaflet (copié dans humalis/, sans CDN) et sa feuille de style.
    const carte = /\bcarteLieux\(/.test(page.script) || (page.composants && /\bcarteLieux\(/.test(fichiers.get('composants.js') ?? ''));
    const graphique = /\bhumalisGraphique\./.test(page.script) || (page.composants && /\bhumalisGraphique\./.test(fichiers.get('composants.js') ?? ''));
    const scripts = ['humalis/humalis.js', ...(qr ? ['humalis/qrcode.js'] : []), ...(graphique ? ['humalis/graphique.js'] : []), ...(carte ? ['humalis/leaflet.js'] : []), ...(application.fonctions.length > 0 ? ['fonctions.js'] : []), ...(page.composants ? ['composants.js'] : []), script];
    const fichier = pagesFichiers.get(ecran.nom)!;
    const apercu = enTetePublication(application, ecran, page, fichier, adresse);
    fichiers.set(fichier, pageHtml(apercu.titre, apercu.description, carte ? ['humalis/leaflet.css', ...feuilles] : feuilles, scripts, page.html, { mode: modeTheme, bascule, site: avecEntete, langue }, apercu.balises));
    fichiers.set(script, page.script);
  }
  fichiers.set('404.html', pageHtml('Page introuvable', "Cette page n'existe pas.", feuilles, application.langues ? ['humalis/humalis.js', 'pages/introuvable-humalis.js'] : [], [
    '<h1>Page introuvable</h1>',
    "<p>Cette page n'existe pas.</p>",
    `<a href="index.html">Revenir à l'accueil</a>`,
  ], { bascule: false, langue }));
  // Plusieurs langues : la page introuvable est redessinée dans la langue de la personne.
  if (application.langues) fichiers.set('pages/introuvable-humalis.js', INTROUVABLE_JS);
  fichiers.set('LISEZMOI.md', lisezmoi(options, session || serveur));
  if (application.site) {
    fichiers.set('robots.txt', robotsTxt(application.site, application.site.indexation ? adresse : undefined));
    // Sans adresse complète, pas de plan du site : un plan avec des adresses relatives serait faux.
    if (adresse && application.site.indexation) fichiers.set('sitemap.xml', planDuSite(application, pagesFichiers, adresse));
    if (application.site.logo && !estExterne(application.site.logo)) fichiers.set('manifest.webmanifest', manifeste(application.site, options.images, ''));
    for (const [chemin, contenu] of fichiersDuSite(application.site, options.images, '')) fichiers.set(chemin, contenu);
  }
  // Les outils communs, écrits en dernier : ils dépendent de ce que les pages et les composants emploient.
  const usage = usageElements([...fichiers.entries()].filter(([nom]) => nom.endsWith('.js') || nom.endsWith('.html')).map(([, contenu]) => contenu));
  if (usage.qr) fichiers.set('humalis/qrcode.js', QRCODE_GENERATOR);
  // Les graphiques : la géométrie et l'écriture du HTML, seulement si une page en dessine.
  if ([...fichiers.entries()].some(([nom, contenu]) => nom.endsWith('.js') && /\bhumalisGraphique\./.test(contenu))) fichiers.set('humalis/graphique.js', GRAPHIQUE_JS);
  // Copier et partager, les fenêtres et les questions, seulement si une page s'en sert.
  const scriptsDesPages = [...fichiers.entries()].filter(([nom]) => nom.endsWith('.js')).map(([, contenu]) => contenu);
  const emploie = (motif: RegExp) => scriptsDesPages.some((contenu) => motif.test(contenu));
  const interactions = { pressePapier: emploie(/\b(copier|partager)\(/), fenetres: emploie(/\bfenetre\(/), questions: emploie(/\bconfirmer\(/), bas: emploie(/\bonbas:/) };
  fichiers.set('humalis/humalis.js', humalisJs(options.source, pagesFichiers, serveur, session, bascule ? modeTheme ?? '' : undefined, usage, application.langues, interactions));
  // L'observateur des animations « au defilement », seulement si une page en a : il pose humalis-js au chargement.
  if (animeAuDefilement([...fichiers.values()])) {
    fichiers.set('humalis/humalis.js', `${fichiers.get('humalis/humalis.js')!}\n// Les animations « au defilement » attendent que l'élément entre à l'écran.\n${OBSERVATEUR_DEFILEMENT}\nobserverLeDefilement();\n`);
  }
  // Les réglages de mise en page utilisés (colonnes, ombre, sur telephone…), d'après le code produit.
  fichiers.set('humalis/styles.css', fichiers.get('humalis/styles.css')! + cssEcran([...fichiers.values()]) + cssElements([...fichiers.values()]) + cssMouvement([...fichiers.values()]) + cssInteractions([...fichiers.values()]) + cssGraphique([...fichiers.values()], application.theme?.couleurs.map((c) => c.nom)) + cssTheme(application.theme, bascule, options.polices));
  // Les images locales, à côté des pages (images/…) : décision M5.
  for (const [chemin, contenu] of copiesDesMedias(options.medias, 'images/')) fichiers.set(chemin, contenu);
  for (const [chemin, contenu] of copiesDesMedias(options.medias, 'audio/', 'audio')) fichiers.set(chemin, contenu);
  // Leaflet, recopié en dernier : le CSS et les outils ci-dessus ne le lisent pas.
  if (usage.carte) {
    fichiers.set('humalis/leaflet.js', LEAFLET_JS);
    fichiers.set('humalis/leaflet.css', LEAFLET_CSS);
  }
  // Plusieurs langues : les messages de Humalis (carrousel, compteur, erreurs du serveur…) passent par t().
  if (application.langues) messagesDuSiteStatique(fichiers, application.langues.map((l) => l.code));
  return fichiers;
}

/** L'adresse publique d'une page : « index.html » est la racine du site. */
function adresseDePage(adresse: string, fichier: string): string {
  return `${sansBarreFinale(adresse)}/${fichier === 'index.html' ? '' : fichier}`;
}

/**
 * Le titre, la description et les balises de partage d'une page (plan qualité et
 * publication, partie 3) : l'aperçu écrit en clair gagne, sinon le premier titre et
 * le premier texte, sinon le site. Sans bloc « site » ni « apercu », rien ne change.
 */
function enTetePublication(
  application: Application,
  ecran: Application['ecrans'][number],
  page: { titre: string; description: string; html: string[] },
  fichier: string,
  adresse: string | undefined,
): { titre: string; description: string; balises: string[] } {
  const site = application.site;
  const apercu = ecran.apercu;
  if (!site && !apercu) return { titre: page.titre, description: page.description, balises: [] };
  const titre = titreComplet((apercu?.titre && texteDe(apercu.titre)) ?? page.titre, site);
  const aUnTexte = page.description !== page.titre;
  const description = (apercu?.description && texteDe(apercu.description)) ?? (aUnTexte ? page.description : site?.description ?? page.description);
  const imageLue = (apercu?.image && texteDe(apercu.image)) ?? site?.image;
  const image = imageLue ? adresseImage(imageLue, adresse) : undefined;
  const url = adresse && site ? adresseDePage(adresse, fichier) : undefined;
  const noindex = apercu?.indexation === false || site?.indexation === false;
  const balises = [
    ...(url ? [`<link rel="canonical" href="${echapper(url)}" />`] : []),
    `<meta property="og:title" content="${echapper(titre)}" />`,
    `<meta property="og:description" content="${echapper(description)}" />`,
    '<meta property="og:type" content="website" />',
    ...(url ? [`<meta property="og:url" content="${echapper(url)}" />`] : []),
    ...(site?.nom ? [`<meta property="og:site_name" content="${echapper(site.nom)}" />`] : []),
    ...(image ? [`<meta property="og:image" content="${echapper(image)}" />`] : []),
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    ...(noindex ? ['<meta name="robots" content="noindex" />'] : []),
    ...(site ? balisesIcone(site, '') : []),
  ];
  return { titre, description, balises };
}

/** Le texte d'une valeur écrite en clair (« apercu : titre "…" ») ; une valeur calculée garde la règle de la page. */
function texteDe(valeur: NonNullable<NonNullable<Application['ecrans'][number]['apercu']>['titre']>): string | undefined {
  if (valeur.type !== 'texte' || !valeur.parties.every((p) => 'texte' in p)) return undefined;
  return valeur.parties.map((p) => ('texte' in p ? p.texte : '')).join('');
}

/** sitemap.xml : une adresse complète par page indexable. */
function planDuSite(application: Application, pagesFichiers: Map<string, string>, adresse: string): string {
  const adresses = application.ecrans
    .filter((e) => e.apercu?.indexation !== false && e.nom !== 'introuvable')
    .map((e) => `  <url><loc>${echapper(adresseDePage(adresse, pagesFichiers.get(e.nom)!))}</loc></url>\n`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${adresses.join('')}</urlset>\n`;
}

function pageHtml(titre: string, description: string, feuilles: string[], scripts: string[], contenu: string[], theme: { mode?: string; bascule: boolean; site?: boolean; langue?: string } = { bascule: false }, balises: string[] = []): string {
  return `<!doctype html>
<html lang="${theme.langue ?? 'fr'}"${theme.mode ? ` data-theme="${theme.mode}"` : ''}>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${echapperTexte(titre)}</title>${theme.bascule ? `\n    <script>${SCRIPT_THEME}</script>` : ''}
    <meta name="description" content="${echapperAttribut(description)}">
${balises.map((b) => `    ${b}\n`).join('')}${feuilles.map((f) => `    <link rel="stylesheet" href="${echapperAttribut(f)}">\n`).join('')}${scripts.map((s) => `    <script src="${echapperAttribut(s)}" defer></script>\n`).join('')}  </head>
  <body>
    <ul class="humalis-messages" aria-live="polite"></ul>
    <main class="${theme.site ? 'humalis-site' : 'humalis-page'}">
${contenu.map((l) => `      ${l}\n`).join('')}    </main>
  </body>
</html>
`;
}

/**
 * Ce que la cible statique ne sait pas faire (décision T9) : un secret
 * (comme sur le web), un composant React (un site statique n'a pas React),
 * un composant qui garde son propre état.
 */
export function verifierPourLeStatique(application: Application): Diagnostic[] {
  const diagnostics: Diagnostic[] = [...verifierPourLeWeb(application)];
  // « essayer » demande un moteur de requêtes qui se tait pendant le bloc : il n'existe pas encore dans humalis.js.
  for (const ecran of application.ecrans) {
    if (JSON.stringify(ecran.gestionnaires).includes('"type":"essayer"')) {
      diagnostics.push({
        gravite: 'erreur',
        message: `la page « ${ecran.nom} » utilise « essayer », qui n'est pas encore produit pour le site statique. Compile-la pour le web, ou retire « essayer ».`,
        ligne: ecran.ligne,
      });
    }
  }
  for (const c of application.composantsReact) {
    diagnostics.push({
      gravite: 'erreur',
      ligne: c.ligne,
      message: `le composant React « ${c.nom} » ne peut pas être utilisé sur la cible statique : un site statique n'a pas React. Écris-le en Humalis (composant "${c.nom}" :), ou compile pour le web.`,
    });
  }
  // « avec deplacement » : pas encore écrit en JavaScript clair pour le site statique.
  const deplacee = [...application.ecrans, ...application.composants].flatMap((e) => boucles(e.vue)).find((b) => b.deplacement);
  if (deplacee) {
    diagnostics.push({
      gravite: 'erreur',
      ligne: deplacee.ligne,
      message: '« avec deplacement » ne peut pas encore être produit pour le site statique : compile pour le web, le desktop ou le mobile, ou retire « avec deplacement ».',
    });
  }
  for (const c of application.composants) {
    if (c.etat.length > 0 || c.gestionnaires.length > 0 || gestionnairesDe(c.vue).length > 0) {
      diagnostics.push({
        gravite: 'erreur',
        ligne: c.ligne,
        message: `sur la cible statique, le composant « ${c.nom} » ne peut pas encore avoir ses propres variables ou événements : garde-les dans la page qui l'utilise, ou compile pour le web.`,
      });
    }
  }
  return diagnostics.sort((a, b) => a.ligne - b.ligne);
}

/** Les boucles de la vue, imbriquées comprises. */
function boucles(noeuds: NoeudVue[]): Extract<NoeudVue, { type: 'repetition' }>[] {
  return noeuds.flatMap((n) =>
    n.type === 'repetition'
      ? [n, ...boucles(n.corps)]
      : n.type === 'condition'
        ? [...boucles(n.alors), ...boucles(n.sinon)]
        : 'corps' in n && Array.isArray(n.corps)
          ? boucles(n.corps as NoeudVue[])
          : [],
  );
}

function gestionnairesDe(noeuds: NoeudVue[]): Gestionnaire[] {
  return noeuds.flatMap((n) =>
    n.type === 'condition'
      ? [...gestionnairesDe(n.alors), ...gestionnairesDe(n.sinon)]
      : n.type === 'repetition'
        ? [...n.gestionnaires, ...gestionnairesDe(n.corps)]
        : n.type === 'formulaire' || n.type === 'bloc'
          ? gestionnairesDe(n.corps)
          : [],
  );
}

/** humalis/humalis.js : les outils communs des pages, en JavaScript écrit en clair. */
function humalisJs(
  source: string,
  pages: Map<string, string>,
  serveur: boolean,
  session: boolean,
  theme?: string,
  elements?: UsageElements,
  langues?: LangueRI[],
  interactions = { pressePapier: false, fenetres: false, questions: false, bas: false },
): string {
  const tablePages = [...pages].map(([nom, fichier]) => `    ${chaine(nom)}: ${chaine(fichier)},`).join('\n');
  const exportes = [
    'creer',
    'demarrer',
    'afficherMessage',
    'planifier',
    'mouvementReduit',
    'cliquer',
    'focaliser',
    'retirerPremier',
    'grouper',
    'formaterNombre',
    'formaterDate',
    'formaterArgent',
    'accorder',
    'formaterTaille',
    'dateDuJour',
    'maintenant',
    'decalerDate',
    'joursEntre',
    'formaterDepuis',
    'adresseDe',
    'lirePartage',
    'garderPartage',
    'lireMemoire',
    'garderMemoire',
    ...(theme !== undefined ? ['definirTheme'] : []),
    ...(langues ? ['t', 'langue', 'changerLangue'] : []),
    ...(elements ? exportsElements(elements) : []),
    ...(interactions.pressePapier ? ['copier', 'partager'] : []),
    ...(interactions.fenetres ? ['fenetre'] : []),
    ...(interactions.questions ? ['confirmer'] : []),
    ...(serveur ? ['serveur', 'derniereRequete'] : []),
    ...(session ? ['utilisateur'] : []),
  ];
  return `// Produit par Humalis depuis ${source} : les outils communs des pages.
// Du JavaScript écrit en clair, sans bibliothèque : on peut le reprendre à
// la main. Un seul nom global, « humalis » ; chaque page prend ce qu'il lui
// faut (const { creer } = humalis;).
'use strict';

const humalis = (() => {
${serveur || session ? `  /**
   * L'adresse du serveur Humalis (« --cible serveur ») : la même origine par
   * défaut. Si le serveur est ailleurs, écrivez-la ici ('https://api.exemple.cd').
   */
  const ADRESSE_SERVEUR = '';

` : ''}  /** Le fichier de chaque page (« rediriger vers » une page connue par son nom). */
  const PAGES = {
${tablePages}
  };

  // ─── Les éléments ───────────────────────────────────────────────────────

  /**
   * Crée un élément : creer('p', { class: 'note' }, 'Bonjour').
   * Le texte passe par des nœuds texte et les attributs par setAttribute,
   * jamais comme du HTML : une valeur ne peut pas devenir une balise.
   * onclick, onmouseenter : la page est redessinée après le gestionnaire.
   * oninput : seulement le gestionnaire (on garde ce qui est tapé).
   */
  function creer(balise, attributs, ...enfants) {
    const element = document.createElement(balise);
    for (const [nom, valeur] of Object.entries(attributs)) {
      // « ecrit dans », « arrete d'ecrire dans » : posés après la saisie de la valeur, plus bas.
      if (nom === 'onfrappe' || nom === 'onpause') continue;
      // « arrive en bas de » : la sentinelle garde sa fonction, observée après chaque dessin.
      if (nom === 'onbas') {
        element.humalisBas = valeur;
        continue;
      }
      if (valeur === undefined || valeur === null || valeur === false) continue;
      // La valeur d'une option ou d'un bouton radio est un attribut ; celle d'une saisie, ce qui y est écrit.
      if (nom === 'value' && (balise === 'option' || attributs.type === 'radio')) element.setAttribute('value', String(valeur));
      else if (nom === 'value') element.value = String(valeur);
      else if (nom === 'oninput') element.addEventListener('input', valeur);
      // Un formulaire s'envoie sans recharger la page.
      else if (nom === 'onsubmit') {
        element.addEventListener('submit', (evenement) => {
          evenement.preventDefault();
          executer(valeur);
        });
      }
      else if (nom.startsWith('on')) element.addEventListener(nom.slice(2), () => executer(valeur));
      else element.setAttribute(nom, String(valeur));
    }
    for (const enfant of enfants) element.append(enfant instanceof Node ? enfant : String(enfant));
    if (attributs.onfrappe) element.addEventListener('input', () => executer(attributs.onfrappe));
    if (attributs.onpause) ecouterLaPause(element, attributs.onpause);
    return element;
  }

  /**
   * « quand l'utilisateur arrete d'ecrire dans … » : quand rien n'a été tapé
   * pendant la pause ; la touche Entrée n'attend pas.
   */
  function ecouterLaPause(element, { faire, millisecondes }) {
    let attente;
    element.addEventListener('input', () => {
      clearTimeout(attente);
      attente = setTimeout(() => executer(faire), millisecondes);
    });
    element.addEventListener('keydown', (evenement) => {
      if (evenement.key !== 'Enter') return;
      clearTimeout(attente);
      executer(faire);
    });
  }

  // ─── La page ────────────────────────────────────────────────────────────

  /** Ce que la page a donné à demarrer() : dessiner, relire, garder. */
  let page = null;

  /** Démarre la page : relit ce qui est gardé, la dessine, puis lance « quand la page se charge ». */
  function demarrer(options) {
    page = options;
    page.relire?.();
    actualiser();
    // Un retour arrière peut remettre la page depuis le cache du navigateur :
    // on relit ce qui a pu changer sur une autre page (le panier).
    addEventListener('pageshow', (evenement) => {
      if (!evenement.persisted) return;
      page.relire?.();
      actualiser();
    });
    if (page.raccourcis) document.addEventListener('keydown', ecouterLesRaccourcis);
    addEventListener('pagehide', () => {
      page.garder?.();
      // Plus rien ne tourne quand on quitte la page.
      for (const annuler of [...minuteries]) annuler();
      for (const m of page.minuteries ?? []) m.annuler = undefined;
    });
${
  session
    ? '    // Le chargement attend de savoir qui est connecté (/auth/me).\n' +
      '    const sessionLue = page.session ? relireSession().then(actualiser) : Promise.resolve();\n' +
      '    if (page.auChargement) sessionLue.then(() => executer(page.auChargement));'
    : '    if (page.auChargement) executer(page.auChargement);'
}
  }

  /** Un événement : le gestionnaire, puis la page redessinée (même s'il a échoué). */
  async function executer(gestionnaire) {
    try {
      await gestionnaire();
    } catch (erreur) {
      console.error(erreur);
    } finally {
      actualiser();
    }
  }

  /** Garde l'état, puis redessine la page ; l'élément qui avait le focus le retrouve. */
  function actualiser() {
    if (!page) return;
    page.garder?.();
    const actif = document.activeElement;
    const repere = actif?.getAttribute('data-humalis');
    const selecteur = repere ? \`[data-humalis="\${CSS.escape(repere)}"]\` : '';
    const rang = repere ? [...document.querySelectorAll(selecteur)].indexOf(actif) : -1;
    document.querySelector('main').replaceChildren(...page.dessiner());
    reglerMinuteries();
${interactions.bas ? '    observerLeBas();\n' : ''}
${interactions.fenetres ? '    const retour = ouvrirLesFenetres(repere);\n' : ''}
${elements?.carrousel ? '    activerCarrousels();\n' : ''}    if (repere) document.querySelectorAll(selecteur)[rang]?.focus();
${interactions.fenetres ? '    // Une fenêtre fermée rend le focus à ce qui l’avait ouverte.\n    if (retour && (!document.activeElement || document.activeElement === document.body)) retour.focus();\n' : ''}
    // L'onglet suit le premier titre affiché, même calculé (« titre plat.nom »).
    const titre = document.querySelector('main h1')?.textContent?.trim();
    if (titre) document.title = titre;
  }

  // ─── Les raccourcis clavier (« appuie sur », « avec raccourci ») ──────────

  /** Le nom de la touche dans Humalis (« entree ») → event.key du navigateur, en minuscules. */
  const TOUCHES = {
    entree: 'enter', echap: 'escape', espace: ' ', tab: 'tab', suppr: 'delete', retour: 'backspace',
    haut: 'arrowup', bas: 'arrowdown', gauche: 'arrowleft', droite: 'arrowright', debut: 'home', fin: 'end', plus: '+', moins: '-',
  };

  /** Vrai si la touche pressée correspond (« controle+k ») ; « controle » vaut Ctrl, ou ⌘ sur Mac. */
  function correspond(evenement, touches) {
    const morceaux = touches.split('+');
    const touche = morceaux.pop();
    const voulue = TOUCHES[touche] ?? touche;
    if (evenement.key.toLowerCase() !== voulue) return false;
    if (morceaux.includes('controle') !== (evenement.ctrlKey || evenement.metaKey)) return false;
    if (morceaux.includes('alt') !== evenement.altKey) return false;
    return ['/', '?', '+', '-'].includes(voulue) || morceaux.includes('maj') === evenement.shiftKey;
  }

  /**
   * Un seul écouteur pour les raccourcis de la page. Une touche imprimable
   * seule ne compte pas dans un champ ; une fenêtre ouverte ne laisse passer
   * qu'Échap et ses propres raccourcis ; jamais une touche répétée.
   */
  function ecouterLesRaccourcis(evenement) {
    if (evenement.repeat || evenement.isComposing) return;
    const actif = document.activeElement;
    for (const [touches, faire, dans] of page.raccourcis) {
      if (!correspond(evenement, touches)) continue;
      if (dans !== undefined && !actif?.closest(\`[data-humalis="\${CSS.escape(dans)}"]\`)) continue;
      const saisie = actif?.matches?.('input, textarea, select, [contenteditable]');
      if (dans === undefined && !touches.includes('+') && evenement.key.length === 1 && saisie) continue;
      const fenetre = document.querySelector('dialog[open]');
      if (fenetre && touches !== 'echap' && !fenetre.contains(actif)) continue;
      evenement.preventDefault();
      executer(faire);
      return;
    }
  }

  /** « avec raccourci » sur un bouton ou un lien : la touche le clique. */
  function cliquer(id) {
    document.querySelector(\`[data-humalis="\${CSS.escape(id)}"]\`)?.click();
  }

  /** « avec raccourci » sur un champ : la touche met le focus dedans. */
  function focaliser(id) {
    document.querySelector(\`[data-humalis="\${CSS.escape(id)}"]\`)?.focus();
  }

  // ─── Les minuteries (« apres », « toutes les ») ─────────────────────────

  /** Les minuteries en cours : toutes annulées quand on quitte la page. */
  const minuteriesEnCours = new Set();

  /**
   * Lance une minuterie : une fois après le délai, ou à chaque délai avec
   * « repete ». Chaque tour redessine la page. Un tour qui attend encore (une
   * requête) n'est pas relancé ; un onglet caché ne compte pas ses tours, et
   * les tours manqués ne sont pas rattrapés. « tantQue » est relu à chaque
   * tour. Rend la fonction qui l'annule.
   */
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

  /** « mouvement est reduit » : la personne a demandé à son système de réduire les animations. */
  const animationsReduites = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const mouvementReduit = () => animationsReduites?.matches ?? false;
  // Le réglage change pendant la visite : la page est redessinée.
  animationsReduites?.addEventListener('change', () => actualiser());

  /** Les minuteries de la page existent tant que leur condition est vraie ; « arreter » les arrête pour de bon. */
  function reglerMinuteries() {
    for (const m of page.minuteries ?? []) {
      const voulue = !m.arretee && (m.actif ? m.actif() : true);
      if (voulue && !m.annuler) {
        m.annuler = planifier((arreter) => {
          // « apres … » ne passe qu'une fois, même après un retour sur la page.
          if (!m.repete) m.arretee = true;
          return m.faire(() => {
            m.arretee = true;
            arreter();
          });
        }, m.millisecondes(), { repete: m.repete });
      } else if (!voulue && m.annuler) {
        m.annuler();
        m.annuler = undefined;
      }
    }
  }

  /** L'adresse d'une page, à partir de son nom. */
  function adresseDe(nom) {
    return PAGES[nom] ?? \`\${nom}.html\`;
  }

  // ─── Les messages (« afficher ») ────────────────────────────────────────

  /** Combien de temps reste un message, selon son genre. */
  const DUREES = { info: 4000, reussite: 4000, avertissement: 8000, erreur: 8000 };

  /**
   * Un message en haut de la page, lu par les lecteurs d'écran (« status »,
   * « alert » pour une erreur). Au plus trois à la fois ; chacun a un bouton
   * « Fermer » et ne disparaît pas tant que la souris ou le focus sont dessus.
   * options : { duree, persistant, action: { libelle, faire } } ; une fonction
   * seule est le bouton « Réessayer » d'une requête.
   */
  function afficherMessage(texte, genre = 'info', options = {}) {
    const reglages = typeof options === 'function' ? { action: { libelle: 'Réessayer', faire: options }, duree: 12000 } : options;
    // Un message qui propose un bouton reste le temps de le lire et de cliquer.
    const duree = reglages.persistant ? null : Math.max(reglages.duree ?? DUREES[genre], reglages.action ? 8000 : 0);
    const zone = document.querySelector('.humalis-messages');
    const message = document.createElement('li');
    message.className = \`humalis-message humalis-message-\${genre}\`;
    const lu = document.createElement('span');
    lu.className = 'humalis-message-texte';
    lu.setAttribute('role', genre === 'erreur' ? 'alert' : 'status');
    lu.textContent = texte;
    message.append(lu);
    let minuterie;
    const fermer = () => {
      clearTimeout(minuterie);
      message.remove();
    };
    const attendre = () => {
      clearTimeout(minuterie);
      if (duree !== null) minuterie = setTimeout(fermer, duree);
    };
    const bouton = (libelle, classe, faire) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = classe;
      element.textContent = libelle;
      element.addEventListener('click', faire);
      message.append(element);
      return element;
    };
    if (reglages.action) {
      bouton(reglages.action.libelle, 'humalis-message-action', () => {
        fermer();
        executer(reglages.action.faire);
      });
    }
    bouton('×', 'humalis-message-fermer', fermer).setAttribute('aria-label', 'Fermer le message');
    // La souris ou le focus sur le message le gardent ; Échap le ferme.
    message.addEventListener('mouseenter', () => clearTimeout(minuterie));
    message.addEventListener('mouseleave', attendre);
    message.addEventListener('focusin', () => clearTimeout(minuterie));
    message.addEventListener('focusout', attendre);
    message.addEventListener('keydown', (evenement) => evenement.key === 'Escape' && fermer());
    zone.append(message);
    while (zone.children.length > 3) zone.firstElementChild.remove();
    attendre();
  }

  // ─── Les listes ─────────────────────────────────────────────────────────

  /** Retire la première valeur égale (« retirer … de … ») ; la liste reste telle quelle sinon. */
  function retirerPremier(liste, valeur) {
    const position = liste.indexOf(valeur);
    return position === -1 ? liste : [...liste.slice(0, position), ...liste.slice(position + 1)];
  }

  /** « grouper produits par categorie » : un groupe par valeur de la clé, dans l'ordre d'apparition. */
  function grouper(liste, cle) {
    const groupes = [];
    for (const element of liste) {
      const nom = cle(element);
      const groupe = groupes.find((g) => g.nom === nom);
      if (groupe) groupe.elements.push(element);
      else groupes.push({ nom, elements: [element] });
    }
    return groupes;
  }

  // ─── Le format français (décision F1) ───────────────────────────────────

${langues ? FORMAT_JS_LANGUES : FORMAT_JS}
${TAILLE_JS}
${DATES_JS}
  // ─── Ce qui est gardé dans le navigateur ────────────────────────────────
  // Partagé entre les pages : sessionStorage, le temps de la visite.
  // Mémorisé : localStorage, gardé au retour du visiteur.
  // Si le stockage est absent ou interdit, la valeur actuelle sert.

  function lireDans(stockage, cle, actuelle) {
    try {
      const gardee = stockage().getItem(cle);
      return gardee === null ? actuelle : JSON.parse(gardee);
    } catch {
      return actuelle;
    }
  }

  function garderDans(stockage, cle, valeur) {
    try {
      stockage().setItem(cle, JSON.stringify(valeur));
    } catch {
      // Stockage plein ou interdit : la valeur reste dans la page.
    }
  }

  const lirePartage = (cle, actuelle) => lireDans(() => sessionStorage, cle, actuelle);
  const garderPartage = (cle, valeur) => garderDans(() => sessionStorage, cle, valeur);
  const lireMemoire = (cle, actuelle) => lireDans(() => localStorage, cle, actuelle);
  const garderMemoire = (cle, valeur) => garderDans(() => localStorage, cle, valeur);
${theme !== undefined ? themeJs(theme) : ''}${langues ? langueJs(langues) : ''}${elements ? elementsJs(elements) : ''}${interactions.pressePapier ? PRESSE_PAPIER_JS : ''}${interactions.bas ? BAS_JS : ''}${interactions.fenetres ? FENETRES_JS : ''}${interactions.questions ? QUESTIONS_JS : ''}${serveur || session ? SERVEUR_JS : ''}${session ? SESSION_JS : ''}
  return { ${exportes.join(', ')} };
})();
`;
}

const PRESSE_PAPIER_JS = `
  // ─── Copier et partager ─────────────────────────────────────────────────

  /**
   * Met un texte dans le presse-papier. Vrai si c'est fait. Sans l'API du
   * navigateur (page ouverte depuis le disque, vieux Safari), une zone de
   * texte cachée et la commande « copier » prennent le relais.
   */
  async function copierTexte(texte) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texte);
        return true;
      }
    } catch {
      // Refusé : on essaie l'autre moyen.
    }
    const zone = document.createElement('textarea');
    zone.value = texte;
    zone.setAttribute('readonly', '');
    zone.style.position = 'fixed';
    zone.style.opacity = '0';
    document.body.append(zone);
    zone.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      zone.remove();
    }
  }

  /** « copier » : le texte, puis un message qui dit si c'est fait (message null : « sans message »). */
  async function copier(texte, message = 'Copié') {
    const fait = await copierTexte(texte);
    if (message !== null) afficherMessage(fait ? message : 'Copie impossible.', fait ? 'info' : 'erreur');
    return fait;
  }

  /**
   * « partager » : la feuille de partage du système. Sans elle (Firefox sur
   * ordinateur), le lien (ou le texte) est copié, et la personne le sait.
   * Fermer la feuille n'est pas une erreur.
   */
  async function partager({ texte, titre, adresse }) {
    const partage = { text: texte, ...(titre ? { title: titre } : {}), ...(adresse ? { url: adresse } : {}) };
    if (navigator.share && (navigator.canShare?.(partage) ?? true)) {
      try {
        await navigator.share(partage);
        return;
      } catch (erreur) {
        if (erreur?.name === 'AbortError') return;
      }
    }
    await copier(adresse ?? texte, adresse ? 'Lien copié : il ne reste qu’à le coller.' : 'Texte copié : il ne reste qu’à le coller.');
  }
`;

const BAS_JS = `
  // ─── Le défilement infini (« arrive en bas de ») ─────────────────────────

  let observateurDuBas;
  /** Un chargement à la fois ; trois chargements de suite qui n'ont rien ajouté arrêtent l'observation (le bouton reste). */
  let chargementDuBas = false;
  let sansEffet = 0;
  let hauteurAvant = 0;

  /** Après chaque dessin : la suite se charge quand le bas du bloc approche (400 pixels avant). */
  function observerLeBas() {
    observateurDuBas?.disconnect();
    const sentinelles = [...document.querySelectorAll('main .humalis-sentinelle')].filter((s) => s.humalisBas);
    if (sentinelles.length === 0 || typeof IntersectionObserver === 'undefined' || sansEffet >= 3) return;
    observateurDuBas = new IntersectionObserver((entrees) => {
      for (const entree of entrees) {
        if (!entree.isIntersecting || chargementDuBas) continue;
        chargementDuBas = true;
        const hauteur = document.querySelector('main').scrollHeight;
        sansEffet = hauteur > hauteurAvant ? 0 : sansEffet + 1;
        hauteurAvant = hauteur;
        executer(entree.target.humalisBas).finally(() => {
          chargementDuBas = false;
        });
      }
    }, { rootMargin: '400px' });
    for (const sentinelle of sentinelles) observateurDuBas.observe(sentinelle);
  }

`;

const FENETRES_JS = `
  // ─── Les fenêtres (« fenetre "…" : ») ───────────────────────────────────

  /**
   * Une fenêtre par-dessus la page : la balise <dialog> du navigateur garde
   * le focus dedans et rend le reste de la page inerte. Échap, la croix ou un
   * clic à côté la ferment, sauf si elle est obligatoire (la croix reste).
   */
  function fenetre(id, { titre, description, obligatoire, classes, ouverte, fermer }, ...enfants) {
    const croix = creer('button', { type: 'button', class: 'humalis-fenetre-fermer', 'aria-label': 'Fermer', onclick: fermer }, '×');
    const entete = [creer('h2', { id: \`\${id}-titre\` }, titre), ...(description ? [creer('p', { id: \`\${id}-description\` }, description)] : [])];
    const dialogue = creer(
      'dialog',
      { 'data-humalis': id, class: classes ? \`humalis-fenetre \${classes}\` : 'humalis-fenetre', 'aria-labelledby': \`\${id}-titre\`, 'aria-describedby': description ? \`\${id}-description\` : undefined },
      creer('div', { class: 'humalis-fenetre-contenu' }, ...entete, ...enfants, croix),
    );
    dialogue.humalisOuverte = ouverte;
    dialogue.addEventListener('cancel', (evenement) => {
      evenement.preventDefault();
      if (!obligatoire) executer(fermer);
    });
    dialogue.addEventListener('click', (evenement) => {
      if (evenement.target === dialogue && !obligatoire) executer(fermer);
    });
    return dialogue;
  }

  /** Pour chaque fenêtre ouverte : l'élément qui avait le focus quand elle s'est ouverte. */
  const retours = new Map();

  /**
   * Après chaque dessin : les fenêtres ouvertes le sont pour de bon
   * (showModal). Rend l'élément qui doit retrouver le focus si une fenêtre
   * vient de se fermer.
   */
  function ouvrirLesFenetres(repere) {
    const ouvertes = new Set();
    for (const dialogue of document.querySelectorAll('main dialog')) {
      if (!dialogue.humalisOuverte) continue;
      const id = dialogue.getAttribute('data-humalis');
      ouvertes.add(id);
      if (!retours.has(id)) retours.set(id, repere);
      // Un très vieux navigateur sans showModal : la fenêtre s'ouvre, sans garder le focus.
      if (typeof dialogue.showModal === 'function') dialogue.showModal();
      else dialogue.setAttribute('open', '');
    }
    document.documentElement.classList.toggle('humalis-fenetre-ouverte', ouvertes.size > 0);
    for (const [id, ouvreur] of retours) {
      if (ouvertes.has(id)) continue;
      retours.delete(id);
      if (ouvreur) return document.querySelector(\`[data-humalis="\${CSS.escape(ouvreur)}"]\`);
    }
    return null;
  }
`;

const QUESTIONS_JS = `
  // ─── Les questions (« confirmer ») ──────────────────────────────────────

  /**
   * « confirmer » : une question, deux boutons. Rend vrai si la personne
   * répond oui ; non, Échap ou un clic à côté rendent faux. Le focus part sur
   * le bouton qui annule (le choix sûr) et revient ensuite là où il était.
   * La question aide la personne : elle ne protège rien, le serveur vérifie
   * toujours ce qu'on lui demande.
   */
  function confirmer(question, boutons = {}) {
    return new Promise((repondre) => {
      const avant = document.activeElement;
      const dialogue = document.createElement('dialog');
      dialogue.className = 'humalis-fenetre humalis-confirmation';
      dialogue.setAttribute('role', 'alertdialog');
      const texte = document.createElement('p');
      texte.id = 'humalis-question';
      texte.className = 'humalis-confirmation-question';
      texte.textContent = question;
      dialogue.setAttribute('aria-labelledby', texte.id);
      const choix = document.createElement('div');
      choix.className = 'humalis-confirmation-boutons';
      let fini = false;
      const fermer = (reponse) => {
        if (fini) return;
        fini = true;
        dialogue.close();
        dialogue.remove();
        avant?.focus?.();
        repondre(reponse);
      };
      const bouton = (libelle, classe, reponse) => {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = classe;
        element.textContent = libelle;
        element.addEventListener('click', () => fermer(reponse));
        choix.append(element);
        return element;
      };
      const non = bouton(boutons.non ?? 'Non', 'humalis-confirmation-non', false);
      bouton(boutons.oui ?? 'Oui', 'humalis-confirmation-oui', true);
      dialogue.append(texte, choix);
      dialogue.addEventListener('cancel', (evenement) => {
        evenement.preventDefault();
        fermer(false);
      });
      dialogue.addEventListener('click', (evenement) => {
        if (evenement.target === dialogue) fermer(false);
      });
      document.body.append(dialogue);
      if (typeof dialogue.showModal === 'function') dialogue.showModal();
      else dialogue.setAttribute('open', '');
      non.focus();
    });
  }
`;

const SERVEUR_JS = `
  // ─── Le serveur (« envoyer requete ») ───────────────────────────────────

  /** Les en-têtes d'un envoi : le jeton CSRF que pose @astratra/security (cookie astratra_csrf). */
  function entetes() {
    const entetes = new Headers({ 'Content-Type': 'application/json' });
    const jeton = document.cookie.match(/(?:^|; )astratra_csrf=([^;]*)/)?.[1];
    if (jeton) entetes.set('x-csrf-token', decodeURIComponent(jeton));
    return entetes;
  }

  /** Une requête ; en cas d'échec, un message en français, et la valeur actuelle est gardée. */
  /** Le nombre de requêtes qui ont échoué depuis l'ouverture de la page : un formulaire s'arrête après un envoi refusé. */
  let echecs = 0;

  async function appeler(adresse, options, actuelle) {
    try {
      const reponse = await fetch(ADRESSE_SERVEUR + adresse, { ...options, credentials: 'same-origin' });
      if (!reponse.ok) throw new Error(String(reponse.status));
      const texte = await reponse.text();
      if (texte === '') return actuelle;
      const valeur = JSON.parse(texte);
      // On attendait une liste et on reçoit autre chose : la valeur actuelle est gardée.
      return Array.isArray(actuelle) && !Array.isArray(valeur) ? actuelle : valeur;
    } catch {
      echecs += 1;
      afficherMessage("Le serveur n'a pas répondu. Réessayez dans un instant.", 'erreur');
      return actuelle;
    }
  }

  /** Le numéro du dernier appel de chaque variable : une réponse lente ne remplace pas une plus récente. */
  const numeros = new Map();

  /** « La dernière requête gagne » : rend de quoi savoir, à la réponse, si cet appel est toujours le dernier. */
  function derniereRequete(variable) {
    const numero = (numeros.get(variable) ?? 0) + 1;
    numeros.set(variable, numero);
    return () => numeros.get(variable) === numero;
  }

  const serveur = {
    echecs: () => echecs,
    lire: (adresse, actuelle) => appeler(adresse, { method: 'GET' }, actuelle),
    // « avec id dans produit » : un seul élément, par son identifiant.
    lireUn: (adresse, id, actuelle) => appeler(\`\${adresse}/\${encodeURIComponent(id)}\`, { method: 'GET' }, actuelle),
    envoyer: (adresse, donnees, actuelle) =>
      appeler(adresse, { method: 'POST', headers: entetes(), body: JSON.stringify(donnees) }, actuelle),
    // « supprimer p de … » et « modifier p dans … » : la donnée est désignée par son identifiant.
    supprimer: (adresse, id) => appeler(\`\${adresse}/\${encodeURIComponent(id)}\`, { method: 'DELETE', headers: entetes() }, undefined),
    modifier: (adresse, id, donnees) =>
      appeler(\`\${adresse}/\${encodeURIComponent(id)}\`, { method: 'PATCH', headers: entetes(), body: JSON.stringify(donnees) }, undefined),
  };
`;

const SESSION_JS = `
  // ─── La session (« se connecter », « si utilisateur est connecte ») ─────
  // La session est le cookie HttpOnly posé par le pack, que le JavaScript ne
  // peut pas lire : la page ne garde ni jeton ni mot de passe. L'état
  // « connecté » vient toujours du serveur (/auth/me).

  const utilisateur = {
    /** Ce que /auth/me dit de la personne connectée, ou null. */
    personne: null,
    get connecte() {
      return this.personne !== null;
    },
    /** Le rôle que vérifie le serveur (authorizeAdmin). */
    get admin() {
      return this.personne?.role === 'admin';
    },
    seConnecter,
    seDeconnecter,
  };

  async function relireSession() {
    try {
      const reponse = await fetch(ADRESSE_SERVEUR + '/auth/me', { credentials: 'same-origin' });
      const corps = reponse.ok ? await reponse.json() : null;
      utilisateur.personne = corps?.data?.id !== undefined ? corps.data : null;
    } catch {
      utilisateur.personne = null;
    }
  }

  /** Vrai si la connexion a réussi ; sinon un message d'erreur s'affiche. */
  async function seConnecter(email, motDePasse) {
    let reponse;
    try {
      reponse = await fetch(ADRESSE_SERVEUR + '/auth/login', {
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
    await relireSession();
    return true;
  }

  async function seDeconnecter() {
    try {
      await fetch(ADRESSE_SERVEUR + '/auth/logout', { method: 'POST', headers: entetes(), credentials: 'same-origin' });
    } catch {
      afficherMessage("Le serveur n'a pas répondu. Réessayez dans un instant.", 'erreur');
    }
    await relireSession();
  }
`;

function lisezmoi(options: OptionsStatique, serveur: boolean): string {
  return `# ${options.nom}

Site statique produit par Humalis depuis \`${options.source}\` : du HTML,
du CSS et du JavaScript écrit en clair, sans framework et sans
construction. Il n'y a rien à installer.

- Pour le voir : ouvrez \`index.html\` dans un navigateur, ou servez le
  dossier (\`npx serve .\`, \`python3 -m http.server\`).
- Pour le publier : déposez tout le dossier chez un hébergeur de sites
  statiques. \`404.html\` est la page « introuvable ».

Chaque page est un fichier HTML qui contient déjà son contenu de départ
(lisible sans JavaScript). Son script, dans \`pages/\`, la redessine
d'après l'état ; les outils communs sont dans \`humalis/humalis.js\`.
Les variables partagées entre les pages sont gardées le temps de la
visite (\`sessionStorage\`), les variables mémorisées au retour du
visiteur (\`localStorage\`).
${serveur ? `
Les requêtes et la connexion vont vers le serveur Humalis (\`--cible
serveur\`), à la même origine : servez ce dossier et le serveur derrière la
même adresse (les chemins \`/api\` et \`/auth\` vers le serveur), ou réglez
\`ADRESSE_SERVEUR\` en tête de \`humalis/humalis.js\`. La session est le
cookie du pack \`@astratra/security\` ; ouvert depuis le disque, le site
ne peut pas parler au serveur.
` : ''}
Ce dossier est réécrit à chaque compilation Humalis. Pour le reprendre à
la main, supprimez le fichier \`${MARQUE_STATIQUE}\` : Humalis refusera alors
de l'écraser.
`;
}

/** La page introuvable d'un site de plusieurs langues : ses trois textes, redessinés par humalis.js (traduits par t). */
const INTROUVABLE_JS = `// Produit par Humalis : la page « introuvable », dans la langue de la personne.
'use strict';

const { creer } = humalis;

humalis.demarrer({
  dessiner: () => [
    creer('h1', {}, 'Page introuvable'),
    creer('p', {}, "Cette page n'existe pas."),
    creer('a', { href: 'index.html' }, "Revenir à l'accueil"),
  ],
});
`;

/**
 * Les langues du site (plan 2026-10-30-qualite-publication, partie 1) : le
 * HTML de départ est dans la première ; le script redessine la page dans la
 * langue choisie, gardée seulement après un choix de la personne.
 */
const langueJs = (langues: LangueRI[]) => `
  // ─── Les langues (bloc « langues ») ─────────────────────────────────────

  /** Les langues du site : la première est celle des textes écrits et du HTML de départ. */
  const LANGUES = [${langues.map((l) => `'${l.code}'`).join(', ')}];

  /** Le choix gardé, sinon la première langue du site que demande le navigateur, sinon la première. */
  function langueDeDepart() {
    try {
      const gardee = localStorage.getItem('${CLE_LANGUE}');
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

  let langueCourante = langueDeDepart();
  // Les lecteurs d'écran prononcent la page dans la bonne langue.
  document.documentElement.lang = langueCourante;

  /** Le texte dans la langue de la personne ; à défaut, celui de la langue de base. */
  function t(versions) {
    return versions[langueCourante] ?? versions[LANGUES[0]] ?? '';
  }

  /** La langue courante (« si langue est anglais »). */
  function langue() {
    return langueCourante;
  }

  /** Change la langue, la garde dans ce navigateur (c'est un choix de la personne), puis redessine la page. */
  function changerLangue(code) {
    langueCourante = code;
    document.documentElement.lang = code;
    try {
      localStorage.setItem('${CLE_LANGUE}', code);
    } catch {
      // Sans stockage, le choix vaut jusqu'au rechargement.
    }
    actualiser();
  }
`;

/** Le choix du visiteur (changer theme par sombre), gardé dans le navigateur comme sur le web. */
const themeJs = (defaut: string) => `
  // ─── Le thème (changer theme par sombre) ────────────────────────────────

  /** Le mode du projet quand le visiteur n'a rien choisi (bloc theme). */
  const THEME_PAR_DEFAUT = ${defaut ? `'${defaut}'` : "''"};

  function definirTheme(theme) {
    try {
      if (theme === 'automatique') localStorage.removeItem('${CLE_THEME}');
      else localStorage.setItem('${CLE_THEME}', theme);
    } catch {
      // Stockage refusé : le choix vaut pour cette visite seulement.
    }
    const choisi = theme === 'automatique' ? THEME_PAR_DEFAUT : theme;
    if (choisi) document.documentElement.dataset.theme = choisi;
    else delete document.documentElement.dataset.theme;
  }
`;
