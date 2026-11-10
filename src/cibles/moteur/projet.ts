/**
 * Le projet produit par le moteur : une page HTML par adresse, écrite par le
 * compilateur, un petit script par couche, et Vite pour assembler le tout.
 */
import { avecLangueDeRendu } from '../statique/valeurs.js';
import { TRAVAILLEUR_NOTIFICATIONS } from '../serveur/logique.js';
import type { Application, ComposantHumalis, DispositionRI, Ecran, NoeudVue } from '../../ri/types.js';
import { copiesDesMedias, type InfoMedia } from '../../ri/medias.js';
import { simplifier } from '../../analyse/elements.js';
import { MENU_REPLIABLE_JS, enTetePublication, planDuSite } from '../statique/projet.js';
import { usageElements } from '../statique/elements-js.js';
import { QRCODE_GENERATOR } from '../statique/qrcode-donnees.js';
import { LEAFLET_JS, LEAFLET_CSS } from '../statique/leaflet-donnees.js';
import { GRAPHIQUE_JS } from '../statique/graphique.js';
import { connaitreFonctions, nomJs, expressionJs, reserverNoms } from '../statique/valeurs.js';
import { choixFichierEnLangues, messageEnCode, messageEnLangues, messagesDuSiteStatique, traduireMessages } from '../../i18n/messages.js';
import { echapperAttribut, echapperTexte } from '../statique/html.js';
import { cheminsDesPages, styles, nomsDesStyles, VERSIONS, verifierPourLeWeb, CENTRALE_WEB, PAGE_RETOUR_GOOGLE } from '../web/projet.js';
import { cssEcran } from '../web/css-ecran.js';
import { cssElements, cssSautsDeLigne } from '../web/css-elements.js';
import { cssInteractions } from '../web/interactions.js';
import { cssGraphique } from '../web/graphique.js';
import { cssTheme, changeLeTheme, modeParDefaut, SCRIPT_THEME } from '../web/theme.js';
import { cssMouvement, animeAuDefilement, OBSERVATEUR_DEFILEMENT, SUIVI_ENTETE, suitLEntete } from '../commun/mouvement.js';
import { avecDureeDesErreurs } from '../commun/messages.js';
import { robotsTxt, manifeste, fichiersDuSite } from '../publication.js';
import { camel, chaine, pascal } from '../web/noms.js';
import type { Diagnostic } from '../../analyse/erreurs.js';
import { MOTEUR_JS } from './execution.js';
import { GenerateurMoteur, NOMS_RESERVES, type ContexteMoteur } from './page.js';
import { outilsJs, navigationJs } from './outils.js';
import { adaptateursJs, baliseDe, paquetsDesExternes, sorteDe } from './adaptateurs.js';
import { serveurJs } from './serveur.js';
import { APPAREIL_JS, utiliseAppareil } from '../commun/appareil-web.js';
import { donneesDansLaPage } from './lecture-construction.js';
import { DEPLACEMENT_JS, CHOIX_FICHIER_JS } from './interactions.js';

export const MARQUE_MOTEUR = '.humalis-projet';

export interface OptionsMoteur {
  nom: string;
  source: string;
  fichiersStyle?: Map<string, string>;
  polices?: Map<string, string>;
  medias?: Map<string, InfoMedia>;
  images?: Map<string, string>;
  adresse?: string;
  /** Les modules et composants externes : leur nom de fichier et leur contenu. */
  externes?: Map<string, { nom: string; contenu: string }>;
  /** Le mode développement : les fichiers du projet ; chaque élément porte alors son fichier et sa ligne. */
  sources?: readonly string[];
  /** Ce que le compilateur a lu sur le serveur (voir lecture-construction.ts). */
  donnees?: Map<string, unknown>;
}

const ecranVide = (nom: string): Ecran => ({ nom, etat: [], calculs: [], vue: [], gestionnaires: [], ligne: 0 });

/** « /produit/:id » → « produit/_ » ; « / » → « ». */
const dossierDe = (chemin: string) => chemin.replace(/^\/+|\/+$/g, '').replace(/:[A-Za-z0-9_]+/g, '_');
const htmlDe = (chemin: string) => (dossierDe(chemin) ? `${dossierDe(chemin)}/index.html` : 'index.html');

export function genererProjetMoteur(application: Application, options: OptionsMoteur): Map<string, string> {
  reserverNoms(NOMS_RESERVES());
  try {
    return produire(application, options);
  } finally {
    reserverNoms(new Set());
  }
}

function produire(application: Application, options: OptionsMoteur): Map<string, string> {
  const fichiers = new Map<string, string>();
  const chemins = cheminsDesPages(application);
  const externes: ContexteMoteur['externes'] = new Map();
  for (const c of application.composantsReact) {
    const lu = options.externes?.get(c.chemin);
    if (!lu) throw new Error(`le composant « ${c.nom} » (${c.chemin}) n'a pas été lu`);
    fichiers.set(`src/externes/${lu.nom}`, lu.contenu);
    externes.set(c.nom, { chemin: `../externes/${lu.nom}`, sorte: sorteDe(c.module === true, lu.nom, lu.contenu), balise: baliseDe(lu.contenu) });
  }
  const contexte: ContexteMoteur = {
    partages: application.partages,
    cle: `humalis:${simplifier(options.nom) || 'application'}`,
    fichiers: chemins,
    chemins,
    ...(application.site?.descriptionLangues ? { descriptionSite: messageEnCode(application.site.descriptionLangues, chaine) } : {}),
    filtresDesPages: new Map(application.ecrans.filter((e) => e.filtres?.length).map((e) => [e.nom, e.filtres!.map((f) => f.nom)])),
    composants: new Map(application.composants.map((c) => [c.nom, c])),
    externes,
    medias: options.medias,
    fonctionsGlobales: application.fonctions.map((f) => nomJs(f.nom)),
    ...(application.langues ? { langues: application.langues } : {}),
    ...(options.sources ? { reperes: options.sources } : {}),
    ...(options.donnees ? { donnees: options.donnees } : {}),
  };
  connaitreFonctions(application.fonctions);
  const dispositions: ComposantHumalis[] = [
    ...(application.disposition?.entete ? [{ ...application.disposition.entete.ecran, nom: 'humalisEntete', parametres: [] }] : []),
    ...(application.disposition?.pied ? [{ ...application.disposition.pied.ecran, nom: 'humalisPied', parametres: [] }] : []),
  ];
  for (const d of dispositions) contexte.composants.set(d.nom, d);
  const composants = [...application.composants, ...dispositions];

  // Les fichiers partagés par les pages.
  if (application.fonctions.length > 0) {
    const g = new GenerateurMoteur(ecranVide('fonctions'), contexte, '', []);
    const code = application.fonctions.map((f) => g.fonctionGlobale(f)).join('\n');
    // Une fonction peut en appeler une autre : le fichier ne s'importe pas lui-même.
    fichiers.set('src/humalis/fonctions.js', `${g.importsDuFichier(code).split('\n').filter((l) => !l.endsWith("'./fonctions.js';")).join('\n')}\n\n${code}`);
  }
  if (composants.length > 0) {
    const parties = composants.map((c) => new GenerateurMoteur(c, contexte, '', c.parametres).composantMoteur().code);
    const code = parties.join('\n');
    const g = new GenerateurMoteur(ecranVide('composants'), contexte, '', []);
    // Un composant peut en placer un autre : le fichier ne s'importe pas lui-même.
    const imports = g.importsDuFichier(code).split('\n').filter((l) => !l.endsWith("'./composants.js';"));
    fichiers.set('src/humalis/composants.js', `${imports.join('\n')}\n\n${code}`);
  }
  if (application.partages.length > 0) fichiers.set('src/humalis/partages.js', partagesJs(application, contexte));

  // Les couches : la disposition, les pages parentes, la page.
  const generateurs = new Map<string, GenerateurMoteur>();
  const avecEntete = application.disposition !== undefined;
  const clefDisposition = (e: Ecran) => {
    const entete = application.disposition?.entete && !e.sansEntete;
    const pied = application.disposition?.pied && !e.sansPied;
    return entete || pied ? `disposition${entete ? '' : '-sans-entete'}${pied ? '' : '-sans-pied'}` : undefined;
  };
  const generateurDisposition = (e: Ecran, cle: string): GenerateurMoteur => {
    let g = generateurs.get(cle);
    if (!g) {
      // L'en-tête et le pied sont des composants à part, comme sur le web : chacun a ses variables.
      const bloc = (genre: 'entete' | 'pied', nom: string, d: DispositionRI): NoeudVue => ({ type: 'bloc', genre, options: d.options, classes: d.classes, corps: [{ type: 'composant', nom, proprietes: [], ligne: d.ecran.ligne }], ligne: d.ecran.ligne });
      const entete = application.disposition?.entete && !e.sansEntete ? application.disposition.entete : undefined;
      const pied = application.disposition?.pied && !e.sansPied ? application.disposition.pied : undefined;
      const ecran: Ecran = { ...ecranVide(cle), vue: [
        ...(entete ? [bloc('entete', 'humalisEntete', entete)] : []),
        { type: 'bloc', genre: 'contenu', options: [], classes: ['humalis-page'], corps: [], ligne: 0 },
        ...(pied ? [bloc('pied', 'humalisPied', pied)] : []),
      ] };
      g = new GenerateurMoteur(ecran, contexte, options.source);
      g.niveau = 0;
      g.coucheContenu = 1;
      generateurs.set(cle, g);
    }
    return g;
  };
  const chaineDe = (e: Ecran): Ecran[] => {
    const parent = e.parent !== undefined ? application.ecrans.find((p) => p.nom === e.parent) : undefined;
    return parent ? [...chaineDe(parent), e] : [e];
  };
  const generateurPage = (e: Ecran, niveau: number): GenerateurMoteur => {
    let g = generateurs.get(e.nom);
    if (!g) {
      g = new GenerateurMoteur(e, contexte, options.source);
      g.niveau = niveau;
      generateurs.set(e.nom, g);
    }
    return g;
  };

  // Une sous-page d'index a l'adresse de son parent : c'est elle qui l'ouvre.
  const parAdresse = new Map<string, Ecran>();
  for (const e of application.ecrans) {
    const chemin = chemins.get(e.nom)!;
    const deja = parAdresse.get(chemin);
    if (!deja || chaineDe(e).length > chaineDe(deja).length) parAdresse.set(chemin, e);
  }

  const bascule = changeLeTheme(application);
  const modeTheme = modeParDefaut(application.theme);
  const adresse = options.adresse ?? application.site?.adresse;
  const langue = application.langues?.[0].code;
  const feuilles = ['/src/humalis/styles.css'];
  if (application.css.length > 0) {
    fichiers.set('src/styles/style.css', application.css.join('\n\n') + '\n');
    feuilles.push('/src/styles/style.css');
  }
  const nomsStyles = nomsDesStyles(application.fichiersStyle.map((f) => f.chemin), application.css.length > 0 ? ['style.css'] : []);
  for (const { chemin } of application.fichiersStyle) {
    const contenu = options.fichiersStyle?.get(chemin);
    if (contenu === undefined) throw new Error(`le fichier de style « ${chemin} » n'a pas été lu`);
    fichiers.set(`src/styles/${nomsStyles.get(chemin)}`, contenu);
    feuilles.push(`/src/styles/${nomsStyles.get(chemin)}`);
  }

  const routes: { chemin: string; fichier: string }[] = [];
  const entrees: [string, string][] = [];
  let session = false;
  let serveur = false;
  const scriptsEcrits = new Set<string>();
  const ecrireCouche = (id: string, g: GenerateurMoteur): string => {
    const fichier = `src/couches/${simplifier(id) || 'page'}.js`;
    if (!scriptsEcrits.has(id)) {
      scriptsEcrits.add(id);
      const { script, session: s, serveur: v } = g.scriptCouche();
      session ||= s;
      serveur ||= v;
      fichiers.set(fichier, script);
    }
    return fichier;
  };

  for (const [chemin, ecran] of parAdresse) {
    const pages = chaineDe(ecran);
    // Une sous-page d'une page réservée l'est aussi : la garde la plus proche de la page compte.
    const garde = [...pages].reverse().find((p) => p.reservee)?.reservee;
    const dispo = clefDisposition(ecran);
    const couches: { id: string; g: GenerateurMoteur; fichier: string; parametres: string[] }[] = [];
    if (dispo) {
      const g = generateurDisposition(ecran, dispo);
      couches.push({ id: dispo, g, fichier: ecrireCouche(dispo, g), parametres: [] });
    }
    pages.forEach((p, i) => {
      const g = generateurPage(p, couches.length);
      couches.push({ id: p.nom, g, fichier: ecrireCouche(p.nom, g), parametres: (p.parametresAdresse ?? []).map(camel) });
      void i;
    });
    let contenu: string | undefined;
    for (let i = couches.length - 1; i >= 0; i--) {
      couches[i].g.niveau = i;
      couches[i].g.pageCachee = garde !== undefined;
      contenu = couches[i].g.htmlDepart(contenu);
    }
    const dernier = generateurPage(ecran, couches.length - 1);
    const { titre, description } = dernier.titres();
    const apercu = enTetePublication(application, ecran, { titre, description, html: [] }, chemin.replace(/^\//, ''), adresse);
    const cleEntree = simplifier(ecran.nom) || 'page';
    const entree = `src/routes/${cleEntree}.js`;
    const reservee = garde ? `{ reservee: { qui: ${chaine(garde.qui)}, sinon: ${chaine(chemins.get(garde.sinon) ?? `/${simplifier(garde.sinon)}`)} } }` : '{}';
    fichiers.set(entree, `// Produit par Humalis : la page « ${ecran.nom} » et ses couches.
import { enregistrer } from '../humalis/navigation.js';
${couches.map((c, i) => `import c${i} from '../couches/${c.fichier.split('/').pop()}';`).join('\n')}

enregistrer(import.meta.url, [${couches.map((c, i) => `[${chaine(c.id)}, c${i}${c.parametres.length ? `, ${JSON.stringify(c.parametres)}` : ''}]`).join(', ')}], ${reservee});
`);
    const html = pageHtml(apercu.titre, apercu.description, feuilles, `/${entree}`, contenu ?? '', { mode: modeTheme, bascule, site: avecEntete, langue, cache: garde !== undefined, donnees: donneesDeLaRoute(pages, options.donnees) }, apercu.balises);
    const fichierHtml = ecran.nom === 'introuvable' ? '404.html' : htmlDe(chemin);
    fichiers.set(fichierHtml, html);
    entrees.push([cleEntree, fichierHtml]);
    if (ecran.nom !== 'introuvable') routes.push({ chemin, fichier: chemin.includes(':') ? `/${dossierDe(chemin)}/` : chemin === '/' ? '/' : `${chemin.replace(/\/+$/, '')}/` });
  }
  // « avec adresse par langue » : chaque page écrite une fois de plus par langue, sous /en/…, dans sa langue.
  const languesAdresse = application.adresseParLangue && application.langues ? application.langues.slice(1).map((l) => l.code) : [];
  const routesDeBase = [...routes];
  for (const code of languesAdresse) {
    avecLangueDeRendu(code, () => {
      for (const [chemin, ecran] of parAdresse) {
        if (ecran.nom === 'introuvable') continue;
        const pages = chaineDe(ecran);
        const garde = [...pages].reverse().find((p) => p.reservee)?.reservee;
        const dispo = clefDisposition(ecran);
        const gens: GenerateurMoteur[] = [];
        if (dispo) gens.push(generateurDisposition(ecran, dispo));
        pages.forEach((p) => gens.push(generateurPage(p, gens.length)));
        let contenu: string | undefined;
        for (let i = gens.length - 1; i >= 0; i--) {
          gens[i].niveau = i;
          gens[i].pageCachee = garde !== undefined;
          contenu = gens[i].htmlDepart(contenu);
        }
        const { titre, description } = generateurPage(ecran, gens.length - 1).titres(code);
        const apercu = enTetePublication(application, ecran, { titre, description, html: [] }, `${code}${chemin}`.replace(/^\//, ''), adresse);
        const cleEntree = simplifier(ecran.nom) || 'page';
        const html = pageHtml(apercu.titre, apercu.description, feuilles, `/src/routes/${cleEntree}.js`, contenu ?? '', { mode: modeTheme, bascule, site: avecEntete, langue: code, cache: garde !== undefined, donnees: donneesDeLaRoute(pages, options.donnees) }, apercu.balises)
          // Les liens vers les pages du site gardent la langue : « /menu » devient « /en/menu ».
          .replace(/(<a\b[^>]*\bhref=")\/(?!\/|src\/|assets\/|humalis\/)([^"]*)"/g, (_t, debut: string, reste: string) => `${debut}/${code}/${reste}"`);
        const fichierHtml = `${code}/${htmlDe(chemin)}`;
        fichiers.set(fichierHtml, html);
        entrees.push([`${cleEntree}_${code}`, fichierHtml]);
      }
    });
    for (const r of routesDeBase) routes.push({ chemin: `/${code}${r.chemin === '/' ? '' : r.chemin}`, fichier: `/${code}${r.fichier}` });
  }
  // Chaque page annonce ses autres langues aux moteurs de recherche (hreflang).
  if (languesAdresse.length && application.langues) {
    const racine = (adresse ?? '').replace(/\/+$/, '');
    for (const [chemin, ecran] of parAdresse) {
      if (ecran.nom === 'introuvable' || chemin.includes(':')) continue;
      const versions = application.langues.map((l, i) => ({ code: l.code, chemin: i === 0 ? chemin : `/${l.code}${chemin === '/' ? '/' : chemin}` }));
      const liens = [...versions, { code: 'x-default', chemin }].map((v) => `<link rel="alternate" hreflang="${v.code}" href="${racine}${v.chemin}" />`).join('\n    ');
      for (const v of versions) {
        const fichier = v.code === application.langues[0]!.code ? htmlDe(chemin) : `${v.code}/${htmlDe(chemin)}`;
        const html = fichiers.get(fichier);
        if (html) fichiers.set(fichier, html.replace('</head>', `    ${liens}\n  </head>`));
      }
    }
  }

  if (!fichiers.has('404.html')) {
    // Plusieurs langues : la page introuvable passe dans la langue de la personne.
    const codes = application.langues?.map((l) => l.code);
    const traduit = (texte: string) => {
      const versions = codes ? messageEnLangues(texte, codes) : undefined;
      return versions ? messageEnCode(versions, chaine) : chaine(texte);
    };
    if (codes) {
      fichiers.set('src/routes/introuvable.js', `// Produit par Humalis : la page introuvable, dans la langue de la personne.
import { t, relireLangue } from '../humalis/outils.js';

relireLangue();
document.querySelector('h1').textContent = ${traduit('Page introuvable')};
document.querySelector('p').textContent = ${traduit("Cette page n'existe pas.")};
document.querySelector('main a').textContent = ${traduit("Revenir à l'accueil")};
document.title = ${traduit('Page introuvable')};
`);
    }
    fichiers.set('404.html', pageHtml('Page introuvable', "Cette page n'existe pas.", feuilles, codes ? '/src/routes/introuvable.js' : undefined, '<h1>Page introuvable</h1>\n<p>Cette page n\'existe pas.</p>\n<a href="/">Revenir à l\'accueil</a>', { bascule: false, langue }, []));
    entrees.push(['introuvable', '404.html']);
  }

  fichiers.set(MARQUE_MOTEUR, `Projet produit par Humalis depuis ${options.source}.\nLe compilateur réécrit ce dossier à chaque compilation.\n`);
  fichiers.set('.gitignore', 'node_modules\ndist\n');

  // Une page réservée demande la session, même si elle ne la lit pas elle-même.
  session ||= application.ecrans.some((e) => e.reservee);
  const parleAuServeur = [...fichiers.entries()].some(([n, c]) => n.endsWith('.js') && /from '[^']*serveur\.js'/.test(c));
  const sessionDuServeur = session && application.serveurs.length > 0 && !application.sources.some((x) => x.session);
  if (parleAuServeur || session) fichiers.set('src/humalis/serveur.js', serveurJs({ application, session, sessionDuServeur }));
  if ([...fichiers.values()].some((c) => /\blisteDeplacable\(/.test(c))) fichiers.set('src/humalis/deplacement.js', DEPLACEMENT_JS);
  if ([...fichiers.values()].some((c) => /\bchoixFichier\(/.test(c))) fichiers.set('src/humalis/fichier.js', CHOIX_FICHIER_JS);
  const surveillee = application.serveurs.length > 0;
  if (surveillee) fichiers.set('src/humalis/centrale.ts', CENTRALE_WEB);

  // Les outils, écrits quand on sait ce que les pages emploient.
  const textes = [...fichiers.entries()].filter(([n]) => /\.(js|html)$/.test(n)).map(([, c]) => c);
  const usage = usageElements(textes);
  const site: string[] = [];
  const pagesTable = new Map(application.ecrans.map((e) => [e.nom, chemins.get(e.nom)!]));
  if (textes.some((c) => c.includes('humalis-menu-bouton'))) site.push(MENU_REPLIABLE_JS);
  if (suitLEntete(textes)) site.push(`${SUIVI_ENTETE}\nsuivreLaHauteurDeLEntete();`);
  if (animeAuDefilement(textes)) site.push(`${OBSERVATEUR_DEFILEMENT}\nobserverLeDefilement();`);
  const codes = [...fichiers.entries()].filter(([n]) => n.endsWith('.js')).map(([, c]) => c);
  const emploie = (motif: RegExp) => codes.some((c) => motif.test(c));
  const besoinsNavigation = {
    minuteries: emploie(/return \{[^}]*\bminuteries\b/),
    raccourcis: emploie(/return \{[^}]*\braccourcis\b/),
    // Une minuterie des fonctions écrites en haut du fichier : sans couche, elle s'arrête au changement de page.
    planifie: /\bplanifier\(/.test(fichiers.get('src/humalis/fonctions.js') ?? ''),
    adressesRecues: emploie(/naviguer\(String\(/),
  };
  fichiers.set('public/humalis/reprise.js', `${REPRISE_DES_CLICS}\n`);
  if (application.serveurs.some((s) => s.activeNotifications)) fichiers.set('public/humalis/notifications.js', TRAVAILLEUR_NOTIFICATIONS);
  fichiers.set('src/humalis/moteur.js', MOTEUR_JS);
  if (utiliseAppareil(application)) {
    fichiers.set('src/humalis/appareil.js', APPAREIL_JS);
    site.push("import './appareil.js';\nimport { afficherMessage } from './outils.js';\nwindow.addEventListener('humalis:message', (e) => afficherMessage(e.detail.texte, e.detail.genre));");
  }
  fichiers.set('src/humalis/outils.js', avecDureeDesErreurs(outilsJs({ usage, langues: application.langues, ...(languesAdresse.length ? { parAdresse: true } : {}), ...(bascule ? { theme: modeTheme ?? '' } : {}) }), application));
  fichiers.set(
    'src/humalis/navigation.js',
    `${surveillee ? "import './centrale.ts';\n" : ''}${site.length ? "import './site.js';\n" : ''}${navigationJs(routesDeBase, { partages: application.partages.length > 0, session, langues: application.langues !== undefined, pages: pagesTable, ...besoinsNavigation, ...(languesAdresse.length ? { languesAdresse } : {}) })}`,
  );
  if (site.length) fichiers.set('src/humalis/site.js', `// Produit par Humalis : ce qui vaut pour tout le site.\n${site.join('\n')}\n`);
  if (application.composantsReact.length > 0) fichiers.set('src/humalis/adaptateurs.js', adaptateursJs(externes));
  if (usage.qr) fichiers.set('public/humalis/qrcode.js', QRCODE_GENERATOR);
  if (usage.carte) {
    fichiers.set('public/humalis/leaflet.js', LEAFLET_JS);
    fichiers.set('public/humalis/leaflet.css', LEAFLET_CSS);
  }
  if (textes.some((c) => /\bhumalisGraphique\./.test(c))) {
    fichiers.set('src/humalis/graphique.js', `import * as humalis from './outils.js';\n${GRAPHIQUE_JS.replace("'use strict';", '')}\nexport { humalisGraphique };\n`);
  }
  if (usage.qr || usage.carte) {
    for (const [n, c] of fichiers) {
      if (!n.endsWith('.html')) continue;
      const scripts = [...(usage.qr ? ['<script src="/humalis/qrcode.js" defer></script>'] : []), ...(usage.carte ? ['<link rel="stylesheet" href="/humalis/leaflet.css">', '<script src="/humalis/leaflet.js" defer></script>'] : [])];
      fichiers.set(n, c.replace('</head>', `  ${scripts.join('\n    ')}\n  </head>`));
    }
  }

  const tout = [...fichiers.values()];
  const formulaires = JSON.stringify([...application.ecrans, ...application.composants].map((e) => e.vue)).match(/"type":"formulaire"|"saisie":/) !== null;
  const blocs = JSON.stringify([...application.ecrans, ...application.composants].map((e: { vue: NoeudVue[] }) => e.vue)).includes('"type":"bloc"');
  fichiers.set('src/humalis/styles.css', styles(formulaires, blocs) + cssEcran(tout) + cssElements(tout) + cssSautsDeLigne(application) + cssMouvement(tout) + cssInteractions(tout) + cssGraphique(tout, application.theme?.couleurs.map((c) => c.nom)) + cssTheme(application.theme, bascule, options.polices) + '\n::view-transition-old(root), ::view-transition-new(root) { animation-duration: 0.15s; }\n');

  if (application.site) {
    fichiers.set('public/robots.txt', robotsTxt(application.site, application.site.indexation ? adresse : undefined));
    if (adresse && application.site.indexation) {
      const adresses = new Map(routes.map((r) => [r.chemin, r.chemin]));
      void adresses;
      fichiers.set('public/sitemap.xml', planDuSite(application, new Map([...chemins].map(([n, c]) => [n, c.replace(/^\//, '')])), adresse));
    }
    if (application.site.logo) fichiers.set('public/manifest.webmanifest', manifeste(application.site, options.images, '/'));
    for (const [c, contenu] of fichiersDuSite(application.site, options.images, 'public/')) fichiers.set(c, contenu);
  }
  for (const [c, contenu] of copiesDesMedias(options.medias, 'public/images/')) fichiers.set(c, contenu);
  for (const [c, contenu] of copiesDesMedias(options.medias, 'public/audio/', 'audio')) fichiers.set(c, contenu);
  for (const [c, contenu] of copiesDesMedias(options.medias, 'public/video/', 'video')) fichiers.set(c, contenu);

  if (application.serveurs.some((x) => x.connexionGoogle)) fichiers.set('public/auth-google.html', PAGE_RETOUR_GOOGLE);
  const dynamiques = routes.filter((r) => r.chemin.includes(':'));
  if (dynamiques.length > 0) fichiers.set('public/_redirects', dynamiques.map((r) => `${r.chemin.replace(/:[A-Za-z0-9_]+/g, '*')} ${r.fichier} 200`).join('\n') + '\n');

  // Plusieurs langues : les messages de Humalis passent par t().
  if (application.langues) {
    const noms: [string, string][] = [['src/humalis/outils.js', 'humalis/humalis.js'], ['src/humalis/graphique.js', 'humalis/graphique.js']];
    const seuls = ['src/humalis/fichier.js', 'src/humalis/deplacement.js', 'src/humalis/serveur.js'];
    for (const n of seuls) {
      const c = fichiers.get(n);
      if (c === undefined) continue;
      const traduit = traduireMessages(c, application.langues.map((l) => l.code), { partout: true, importer: './outils.js' });
      fichiers.set(n, n.endsWith('fichier.js') ? choixFichierEnLangues(traduit) : traduit);
    }
    const temporaire = new Map([...fichiers].filter(([n]) => n.endsWith('.js') && !seuls.includes(n) && n !== 'src/humalis/moteur.js' && n !== 'src/humalis/navigation.js' && !n.startsWith('public/')).map(([n, c]): [string, string] => [noms.find(([a]) => a === n)?.[1] ?? n, c]));
    messagesDuSiteStatique(temporaire, application.langues.map((l) => l.code));
    for (const [n, c] of temporaire) {
      const vrai = noms.find(([, b]) => b === n)?.[0] ?? n;
      const dossier = vrai.startsWith('src/humalis/') ? '.' : '../humalis';
      const aImporter = vrai !== 'src/humalis/outils.js' && /(?<![.\w$])t\(/.test(c) && !/import \{[^}]*\bt\b[^}]*\} from '[^']*outils\.js'/.test(c);
      fichiers.set(vrai, aImporter ? `import { t } from '${dossier}/outils.js';\n${c}` : c);
    }
  }

  const lus = [...(options.externes?.values() ?? [])].map((e) => e.contenu);
  const sortes = new Set([...externes.values()].map((e) => e.sorte));
  const paquets = paquetsDesExternes(lus, sortes);
  const dependances = {
    ...paquets.dependances,
    ...(surveillee ? { '@astratra/centrale': VERSIONS.centrale } : {}),
    ...(sessionDuServeur ? { '@astratra/client': VERSIONS.client } : {}),
  };
  fichiers.set('package.json', JSON.stringify({
    name: simplifier(options.nom) || 'site',
    private: true,
    version: '0.1.0',
    type: 'module',
    scripts: { dev: 'vite', build: 'vite build', 'build:sans-prerendu': 'vite build', preview: 'vite preview' },
    ...(Object.keys(dependances).length ? { dependencies: dependances } : {}),
    devDependencies: { vite: VERSIONS.vite, ...paquets.dependancesDev },
  }, null, 2) + '\n');
  fichiers.set('vite.config.js', viteConfig(entrees, routes.filter((r) => r.chemin !== '/'), application.serveurs.length > 0, sortes));
  fichiers.set('LISEZMOI.md', `# ${options.nom}\n\nSite produit par Humalis depuis \`${options.source}\`, avec son moteur de rendu, sans React.\n\n\`\`\`sh\nnpm install\nnpm run dev\nnpm run build\nnpm run preview\n\`\`\`\n\nChaque page est un fichier HTML déjà écrit ; un petit script la reprend.\n`);
  return fichiers;
}

function partagesJs(application: Application, contexte: ContexteMoteur): string {
  const g = new GenerateurMoteur(ecranVide('partages'), contexte, '', []);
  const gardees = application.partages.filter((p) => !p.lectureSeule);
  const lignes = application.partages.map((p) => `export const ${nomJs(p.nom)} = signal(${g.expression(p.initiale)});`);
  const cle = (nom: string) => chaine(`${contexte.cle}:partage:${nom}`);
  void expressionJs;
  return `// Produit par Humalis : les variables partagées entre les pages. Elles restent vivantes d'une page à l'autre.
import { signal, effet, sansSuivi } from './moteur.js';
import { lirePartage, garderPartage, lireMemoire, garderMemoire } from './outils.js';

${lignes.join('\n')}

let surveille = false;

/** Après la reprise de la page : relit ce qui est gardé, puis garde chaque changement. */
export function relirePartages() {
  sansSuivi(() => {
${gardees.map((p) => `    ${nomJs(p.nom)}.v = ${p.memorisee ? 'lireMemoire' : 'lirePartage'}(${cle(p.nom)}, ${nomJs(p.nom)}.x);`).join('\n')}
  });
  if (surveille) return;
  surveille = true;
${gardees.map((p) => `  effet(() => ${p.memorisee ? 'garderMemoire' : 'garderPartage'}(${cle(p.nom)}, ${nomJs(p.nom)}.v));`).join('\n')}
}
`;
}

/** Le bloc de données d'une page : seulement ce que ses couches ont lu. */
function donneesDeLaRoute(pages: Ecran[], donnees: Map<string, unknown> | undefined): string | undefined {
  if (!donnees) return undefined;
  const miennes = Object.fromEntries([...donnees].filter(([cle]) => pages.some((p) => cle.startsWith(`${p.nom}:`))));
  return Object.keys(miennes).length > 0 ? donneesDansLaPage(miennes) : undefined;
}

/** Avant la reprise : un clic sur un bouton ou l'envoi d'un formulaire est gardé, puis rejoué. Un fichier à part : une politique de contenu stricte interdit le script en ligne. */
const REPRISE_DES_CLICS = `(function(){var f=[];function c(e){var b=e.target.closest&&e.target.closest('button');if(b&&b.type!=='submit')f.push(['click',b])}function s(e){e.preventDefault();f.push(['submit',e.target])}addEventListener('click',c,true);addEventListener('submit',s,true);window.__humalis={file:f,fin:function(){removeEventListener('click',c,true);removeEventListener('submit',s,true)}}})()`;

function pageHtml(titre: string, description: string, feuilles: string[], script: string | undefined, contenu: string, theme: { mode?: string; bascule: boolean; site?: boolean; langue?: string; cache?: boolean; donnees?: string }, balises: string[]): string {
  return `<!doctype html>
<html lang="${theme.langue ?? 'fr'}"${theme.mode ? ` data-theme="${theme.mode}"` : ''}>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${echapperTexte(titre)}</title>${script ? '\n    <script src="/humalis/reprise.js" async></script>' : ''}${theme.bascule ? `\n    <script>${SCRIPT_THEME}</script>` : ''}
    <meta name="description" content="${echapperAttribut(description)}">
${balises.map((b) => `    ${b}\n`).join('')}${feuilles.map((f) => `    <link rel="stylesheet" href="${echapperAttribut(f)}">\n`).join('')}${script ? `    <script type="module" src="${echapperAttribut(script)}"></script>\n` : ''}  </head>
  <body>
    <ul class="humalis-messages" aria-live="polite"></ul>
    ${theme.site ? `<div id="racine" data-c="0">${contenu}</div>` : `<div id="racine"><main class="humalis-page" data-c="0"${theme.cache ? ' hidden' : ''}>${contenu}</main></div>`}${theme.donnees ? `\n    ${theme.donnees}` : ''}
  </body>
</html>
`;
}

function viteConfig(entrees: [string, string][], adresses: { chemin: string; fichier: string }[], serveur: boolean, sortes: Set<string>): string {
  const react = sortes.has('react');
  const reecritures = adresses.map((r) => `  [/^${r.chemin.replace(/\//g, '\\/').replace(/:[A-Za-z0-9_]+/g, '[^/]+')}\\/?$/, ${chaine(`${r.fichier}index.html`)}],`);
  return `import { defineConfig } from 'vite';
import { resolve } from 'node:path';
${react ? "import react from '@vitejs/plugin-react';\n" : ''}${sortes.has('vue') ? "import vue from '@vitejs/plugin-vue';\n" : ''}${sortes.has('svelte') ? "import { svelte } from '@sveltejs/vite-plugin-svelte';\n" : ''}
const entrees = {
${entrees.map(([cle, f]) => `  ${chaine(cle)}: resolve(import.meta.dirname, ${chaine(f)}),`).join('\n')}
};

/** Chaque adresse (/panier, /produit/12) est servie par sa page, avec ou sans barre finale. */
const adresses = [
${reecritures.join('\n')}
];
const reecrire = (requete, _reponse, suite) => {
  const chemin = requete.url.split('?')[0];
  for (const [motif, fichier] of adresses) {
    if (motif.test(chemin)) {
      requete.url = fichier + requete.url.slice(chemin.length);
      return suite();
    }
  }
  // Une adresse inconnue : la page « introuvable », comme chez l'hébergeur.
  if (!/\\.[a-z0-9]+$/i.test(chemin) && !/^\\/(@|src\\/|assets\\/|node_modules\\/|api(\\/|$)|auth(\\/|$))/.test(chemin) && chemin !== '/') requete.url = '/404.html';
  suite();
};
${serveur ? "\nconst cible = process.env.HUMALIS_SERVEUR ?? 'http://localhost:3000';\nconst proxy = { '/api': cible, '/auth': cible };\n" : ''}
export default defineConfig({
  appType: 'mpa',
  plugins: [${[react ? 'react()' : '', sortes.has('vue') ? 'vue()' : '', sortes.has('svelte') ? 'svelte()' : ''].filter(Boolean).concat("{ name: 'humalis-adresses', configureServer: (s) => void s.middlewares.use(reecrire), configurePreviewServer: (s) => void s.middlewares.use(reecrire) }").join(', ')}],
  build: { rollupOptions: { input: entrees } },${serveur ? '\n  server: { proxy },\n  preview: { proxy },' : ''}
});
`;
}

/** Ce que le moteur refuse : la même chose que la cible web (un secret dans le navigateur). */
export function verifierPourLeMoteur(application: Application): Diagnostic[] {
  return verifierPourLeWeb(application);
}

void pascal;
