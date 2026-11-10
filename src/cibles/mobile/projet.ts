import { copiesDesMedias } from '../../ri/medias.js';
import { PHRASE_CLE_GOOGLE } from './carte.js';
import { cartesDe } from '../../analyse/carte.js';
import { contenuBinaire } from '../binaire.js';
import { sousActions } from '../../ri/actions.js';
import type { Application, Action, Gestionnaire, NoeudVue, ThemeRI } from '../../ri/types.js';
import { codeCaptureExpo, requetesCapture } from '../capture-erreurs.js';
import { APPAREIL_TSX, DEGRADE_TSX, MOUVEMENT_TSX, ZONE_TSX } from './composants-ecran.js';
import type { InfoMedia } from '../../ri/medias.js';
import { fichiersMobiles, dependancesMobiles, stylesDesElements } from './widgets.js';
import { PHRASE_PHOTOS, REDUIRE_IMAGE_MOBILE, VERSIONS_FICHIERS } from './fichiers.js';
import { fichiersGraphique } from '../web/graphique.js';
import { lecturesTs } from '../web/lectures.js';
import { changeLeTheme, modeParDefaut } from '../web/theme.js';
import type { Diagnostic } from '../../analyse/erreurs.js';
import { simplifier } from '../../analyse/elements.js';
import { adresseNormalisee } from '../../analyse/serveur.js';
import { OPTIONS } from '../../analyse/styles.js';
import { genererEcran, genererFonctions, type ContexteApplication } from '../web/ecran.js';
import { avecEchecs, cheminsDesPages, donneesDesPages, donneesTs, partageTsx, outils } from '../web/projet.js';
import { COULEURS_CSS } from '../web/styles.js';
import { pascal } from '../web/noms.js';
import { RENDU_MOBILE, nomStyle } from './rendu.js';
import { fichiersDesInteractions, gestionnairesDuProgramme } from '../web/interactions.js';
import { langueMobileTsx } from '../web/langue.js';
import { messagesDuProjet } from '../../i18n/messages.js';
import { avecDureeDesErreurs } from '../commun/messages.js';

export interface OptionsMobile {
  /** Le nom du projet, tiré du fichier Humalis (« boutique »). */
  nom: string;
  /** Le fichier Humalis d'origine, cité dans le LISEZMOI. */
  source: string;
  /** Pour chaque « utiliser composant … depuis "chemin" » : le fichier lu par la commande. */
  composantsReact?: Map<string, { nom: string; contenu: string }>;
  /** Les fichiers locaux du programme (images), lus par la commande : leur taille et leurs dimensions. */
  medias?: Map<string, InfoMedia>;
  /** Le logo du bloc « site », lu par la commande, en base 64 : l'icône de l'application. */
  images?: Map<string, string>;
}

/**
 * Versions épinglées : Expo 57 et ce que son `bundledNativeModules.json`
 * demande.
 */
export const VERSIONS_MOBILE = {
  client: '1.1.0',
  expo: '57.0.29',
  expoRouter: '57.0.27',
  expoConstants: '57.0.22',
  expoLinking: '57.0.13',
  expoStatusBar: '57.0.1',
  expoSecureStore: '57.0.4',
  expoLinearGradient: '57.0.2',
  react: '19.2.3',
  reactDom: '19.2.3',
  reactNative: '0.86.3',
  reactNativeWeb: '0.21.4',
  safeArea: '5.7.0',
  screens: '4.26.2',
  metroRuntime: '57.0.17',
  asyncStorage: '2.2.0',
  /** La langue du téléphone, seulement si le programme déclare des langues (version du SDK 57). */
  expoLocalization: '57.0.2',
  typescript: '5.9.3',
  typesReact: '19.2.18',
};

/** Le fichier qui marque un dossier produit par Humalis (voir la commande compile). */
export const MARQUE_MOBILE = '.humalis-projet';

/** Les fichiers d'un projet Expo complet (expo-router), prêt à lancer. */
export function genererProjetMobile(applicationLue: Application, options: OptionsMobile): Map<string, string> {
  // « style "carte" : » : sur le téléphone, chaque style écrit en Humalis devient un style nommé de plus.
  const application = avecStylesHumalis(applicationLue);
  const fichiers = new Map<string, string>();
  const chemins = cheminsDesPages(application);
  const slug = simplifier(options.nom).replace(/_/g, '-') || 'application-humalis';

  const modulesComposants = new Map<string, string>();
  for (const c of application.composantsReact) {
    if (c.chemin === undefined) continue; // sans fichier pour le web : refusé avant (verifierAppareilPourLaCible)
    const fichier = options.composantsReact?.get(c.chemin);
    if (!fichier) throw new Error(`le composant « ${c.nom} » (${c.chemin}) n'a pas été lu`);
    fichiers.set(`composants/${fichier.nom}`, fichier.contenu);
    modulesComposants.set(c.nom, fichier.nom.replace(/\.(tsx|ts|jsx|js)$/, ''));
  }
  for (const c of application.composants) modulesComposants.set(c.nom, pascal(c.nom));

  const contexte: ContexteApplication = {
    partages: application.partages,
    cle: `humalis:${simplifier(options.nom) || 'application'}`,
    modulesComposants,
    donnees: application.serveurs.flatMap(donneesDesPages).map((d) => d.nom),
    fonctions: application.fonctions.map((f) => f.nom),
    rendu: RENDU_MOBILE,
    medias: options.medias,
    ...(application.langues ? { langues: application.langues } : {}),
  };
  let session = false;
  for (const c of application.composants) {
    const produit = genererEcran(c, chemins, contexte, c.parametres);
    session ||= produit.session;
    fichiers.set(`composants/${pascal(c.nom)}.tsx`, produit.code);
  }
  // L'en-tête et le pied communs : des composants sans paramètre, montés autour de la pile (app/_layout.tsx).
  const dispositions: { entete?: string; pied?: string } = {};
  for (const [genre, nom, d] of [['entete', 'EnteteSite', application.disposition?.entete], ['pied', 'PiedSite', application.disposition?.pied]] as const) {
    if (!d) continue;
    const produit = genererEcran({ ...d.ecran, nom }, chemins, contexte, []);
    session ||= produit.session;
    fichiers.set(`composants/${nom}.tsx`, produit.code);
    dispositions[genre] = nom;
  }
  const sans = (cle: 'sansEntete' | 'sansPied') => application.ecrans.filter((e) => e[cle]).map((e) => chemins.get(e.nom)!);
  // « hauteur ecran » : chaque page mesure sa hauteur visible (<ZonePage>), un composant compris.
  const pagesProduites = application.ecrans.map((ecran) => ({ ecran, produit: genererEcran(ecran, chemins, contexte) }));
  const mesure = [...fichiers.values(), ...pagesProduites.map((p) => p.produit.code)].some((c) => /<Zone\b[^>]*\becran\b/.test(c));
  // Une page à paramètre est un fichier « [id] » d'expo-router : app/produit/[id].tsx.
  // Une page par fichier, à la même adresse que sur le web : « / » est app/index.tsx.
  for (const { ecran, produit } of pagesProduites) {
    const chemin = chemins.get(ecran.nom)!;
    session ||= produit.session;
    if (mesure) produit.code = avecZonePage(produit.code);
    // Une page à paramètre est un fichier « [id] » d'expo-router : app/produit/[id].tsx.
    const fichier = chemin === '/' ? 'index' : chemin.slice(1).replace(/:(\w+)/g, '[$1]');
    const profondeur = fichier.split('/').length - 1;
    // Les imports et les images locales (require) remontent d'autant de dossiers que le fichier est profond.
    const code = profondeur === 0 ? produit.code : produit.code.replace(/(from |require\()'\.\.\//g, `$1'${'../'.repeat(profondeur + 1)}`);
    fichiers.set(`app/${fichier}.tsx`, code);
  }

  const etats = [...application.partages, ...application.ecrans.flatMap((e) => e.etat), ...application.composants.flatMap((c) => c.etat)];
  const memoire = etats.some((e) => e.memorisee && !e.secret);
  const secret = etats.some((e) => e.memorisee && e.secret);
  const serveur = session || [...fichiers.values()].some((code) => code.includes('useServeur()'));

  fichiers.set(MARQUE_MOBILE, `Projet produit par Humalis depuis ${options.source}.\nLe compilateur réécrit ce dossier à chaque compilation.\n`);
  const codesPages = [...fichiers.values()];
  const degrade = codesPages.some((c) => /<Degrade\b/.test(c));
  const elements = fichiersMobiles(codesPages);
  for (const [nom, contenu] of elements) fichiers.set(nom, contenu);
  // Les outils des interactions (minuteries, presse-papier…), seulement s'ils servent.
  for (const [nom, contenu] of fichiersDesInteractions(codesPages, 'mobile')) fichiers.set(`humalis/${nom}`, contenu);
  // Les graphiques : le composant (react-native-svg) et la géométrie du web, seulement si une page en dessine.
  for (const [nom, contenu] of fichiersGraphique(codesPages, true)) fichiers.set(`humalis/${nom}`, contenu);
  // Les petits fichiers peuvent eux-mêmes importer des icônes : on relit le tout.
  const dependances = dependancesMobiles([...fichiers.values()]);
  // Une page choisit un fichier et parle au serveur : une image choisie est réduite avant l'envoi (expo-image-manipulator).
  const choixFichier = fichiers.has('humalis/choix-fichier.tsx');
  const reduction = serveur && choixFichier;
  if (reduction) dependances['expo-image-manipulator'] = VERSIONS_FICHIERS.imageManipulator;
  // La session se renouvelle tant que la personne revient (jeton dans le coffre du téléphone).
  if (session) dependances['@astratra/client'] = VERSIONS_MOBILE.client;
  const galerie = fichiers.get('humalis/choix-fichier.tsx')?.includes("from 'expo-image-picker'") ?? false;
  // Plusieurs langues : la langue du téléphone (expo-localization) et le choix gardé (AsyncStorage).
  const langues = application.langues !== undefined;
  fichiers.set('package.json', packageJson(slug, { memoire: memoire || langues, coffre: secret || serveur, degrade, dependances, langues }));
  if (application.langues) fichiers.set('humalis/langue.tsx', langueMobileTsx(application.langues));
  // Le bloc « site » donne le nom de l'application et, avec un logo PNG, son icône.
  const logo = application.site?.logo;
  const icone = !!logo && /\.png$/i.test(logo) && options.images?.get(logo) !== undefined;
  if (icone) fichiers.set('assets/icone.png', contenuBinaire(options.images!.get(logo)!));
  const carte = codesPages.some((c) => /<CarteLieux\b/.test(c));
  fichiers.set('app.json', appJson(application.site?.nom ?? options.nom, slug, secret || serveur, icone, carte, galerie));
  fichiers.set('tsconfig.json', TSCONFIG);
  fichiers.set('expo-env.d.ts', '/// <reference types="expo/types" />\n');
  fichiers.set('.gitignore', 'node_modules\n.expo\ndist\n');
  fichiers.set('LISEZMOI.md', lisezmoi(options, carte));
  const confirmations = codesPages.some((c) => /\buseConfirmer\(/.test(c));
  fichiers.set('app/_layout.tsx', disposition(application.partages.length > 0, session, { ...dispositions, sansEntete: sans('sansEntete'), sansPied: sans('sansPied') }, confirmations));
  if (application.formes?.erreurArrive) {
    fichiers.set('humalis/capture-erreurs.ts', codeCaptureExpo(requetesCapture(application.formes).requetes));
    fichiers.set('app/_layout.tsx', `import '../humalis/capture-erreurs';\n${fichiers.get('app/_layout.tsx')}`);
  }
  fichiers.set('app/+not-found.tsx', INTROUVABLE);
  fichiers.set('humalis/messages.tsx', avecDureeDesErreurs(MESSAGES, application));
  fichiers.set('humalis/page.ts', PAGE);
  const codes = [...fichiers.values()];
  fichiers.set(
    'humalis/styles.ts',
    styles(
      codes.some((c) => /\bs\.(formulaire|case|option|saisieLongue)\b/.test(c)),
      codes.some((c) => /\bs\.(section|bloc|ligne|colonne|grille|menu)\b/.test(c)),
      application.theme,
      codes,
      application.stylesHumalis,
    ),
  );
  if (application.fonctions.length > 0) fichiers.set('humalis/fonctions.ts', genererFonctions(application.fonctions, contexte));
  fichiers.set('humalis/outils.ts', outils([...codes, ...(application.fonctions.length > 0 ? [fichiers.get('humalis/fonctions.ts')!] : [])], langues));
  if (changeLeTheme(application)) fichiers.set('humalis/theme.ts', THEME_MOBILE);
  if (codes.some((c) => /<SurAppareil\b/.test(c))) fichiers.set('humalis/appareil.tsx', APPAREIL_TSX);
  if (degrade) fichiers.set('humalis/degrade.tsx', DEGRADE_TSX);
  if (codes.some((c) => /<Anime\b/.test(c))) fichiers.set('humalis/mouvement.tsx', MOUVEMENT_TSX);
  if (codes.some((c) => /<Zone(Page)?\b/.test(c))) fichiers.set('humalis/zone.tsx', ZONE_TSX);
  if (serveur) {
    const modele = reduction ? serveurAvecReduction() : SERVEUR;
    fichiers.set('humalis/serveur.ts', avecEchecs(avecTelechargementRefuse(session ? serveurRenouvele(modele) : modele, codes), codes));
  }
  // La dernière réponse de chaque lecture publique : un écran déjà vu s'affiche tout de suite.
  if (serveur) fichiers.set('humalis/lectures.ts', lecturesTs('mobile'));
  if (session) fichiers.set('humalis/session.tsx', SESSION);
  if (session) fichiers.set('humalis/renouveler.ts', RENOUVELER);
  if (memoire || secret) fichiers.set('humalis/memoire.ts', memoireTs(memoire, secret));
  if (application.partages.length > 0) fichiers.set('humalis/partage.tsx', partageTsx(application.partages, contexte.cle));
  if (application.serveurs.length > 0) fichiers.set('humalis/donnees.ts', donneesTs(application));
  // Les images locales, chargées par require depuis assets/images : décision M5.
  for (const [chemin, contenu] of copiesDesMedias(options.medias, 'assets/images/')) fichiers.set(chemin, contenu);
  for (const [chemin, contenu] of copiesDesMedias(options.medias, 'assets/audio/', 'audio')) fichiers.set(chemin, contenu);
  for (const [chemin, contenu] of copiesDesMedias(options.medias, 'assets/video/', 'video')) fichiers.set(chemin, contenu);
  // Plusieurs langues : les messages de Humalis (« Réessayer », la page introuvable…) passent par t().
  if (application.langues) messagesDuProjet(fichiers, application.langues.map((l) => l.code), 'humalis/', 'app/+not-found.tsx');
  return fichiers;
}

/**
 * « hauteur ecran » : la page qui défile devient une <ZonePage>, qui mesure sa hauteur
 * visible pour les blocs « hauteur ecran ». Le reste de la page ne change pas.
 */
function avecZonePage(code: string): string {
  const ouverture = '<ScrollView contentContainerStyle={s.page}>';
  const debut = code.indexOf(ouverture);
  const fin = code.lastIndexOf('</ScrollView>');
  if (debut < 0 || fin < debut) return code;
  let texte = `${code.slice(0, debut)}<ZonePage style={s.page}>${code.slice(debut + ouverture.length, fin)}</ZonePage>${code.slice(fin + '</ScrollView>'.length)}`;
  // ScrollView n'est plus importé s'il ne sert plus.
  if (!/<ScrollView\b/.test(texte)) {
    texte = texte.replace(/import \{ ([^}]*) \} from 'react-native';\n/, (ligne, noms: string) => {
      const restants = noms.split(', ').filter((n) => n !== 'ScrollView');
      return restants.length > 0 ? `import { ${restants.join(', ')} } from 'react-native';\n` : '';
    });
  }
  const zone = /import \{ Zone \} from '(\.\.\/)+humalis\/zone';/.exec(texte);
  if (zone) return texte.replace(zone[0], zone[0].replace('{ Zone }', '{ Zone, ZonePage }'));
  return texte.replace(/(import \{ useStyles \} from '\.\.\/humalis\/styles';)/, `import { ZonePage } from '../humalis/zone';\n$1`);
}

// ─── Ce qui ne passe pas sur un téléphone ───────────────────────────────

/** Un « utiliser module » dessine dans un élément du navigateur, qu'un téléphone n'a pas : la compilation s'arrête. */
export function verifierModulesPourLeMobile(application: Application): Diagnostic[] {
  return application.composantsReact
    .filter((c) => c.module)
    .map((c) => ({
      gravite: 'erreur' as const,
      ligne: c.ligne,
      message: `le module « ${c.nom} » a besoin d'un navigateur : il ne fonctionne pas sur la cible mobile. Écris un composant React Native avec « utiliser composant ».`,
    }));
}

/**
 * Les vérifications propres à la cible mobile : rien n'y est refusé, mais
 * ce qui n'existe pas sur un téléphone est signalé (décisions M4, M6, M7).
 */
export function verifierPourLeMobile(application: Application): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const avertir = (ligne: number, message: string) => diagnostics.push({ gravite: 'avertissement', ligne, message });

  // Le bloc « site » sur le mobile : seuls le nom et l'icône (un PNG) servent.
  const logo = application.site?.logo;
  if (logo && !/\.png$/i.test(logo)) {
    diagnostics.push({ gravite: 'erreur', ligne: application.site!.ligne, message: `le logo « ${logo} » ne peut pas servir d'icône sur le mobile : donnez un PNG carré (1024×1024 conseillé par Expo).` });
  }
  // Un téléphone n'a pas de clavier pour les raccourcis : ils ne sont pas produits.
  const raccourci =
    gestionnairesDuProgramme(application).find((g) => g.declencheur === 'touche')?.ligne ??
    [...application.ecrans, ...application.composants].flatMap((e) => elementsDe(e.vue)).find((e) => e.raccourci !== undefined)?.ligne;
  if (raccourci !== undefined) avertir(raccourci, "les raccourcis clavier sont ignorés sur le mobile : un téléphone n'a pas de clavier pour eux. Le bouton reste là, on le touche du doigt.");
  // Le défilement infini : le téléphone charge la suite avec le bouton « Voir plus », sans observer le défilement.
  const bas = gestionnairesDuProgramme(application).find((g) => g.declencheur === 'bas');
  if (bas) avertir(bas.ligne, "sur le mobile, la suite se charge avec le bouton « Voir plus » : le défilement jusqu'en bas ne la charge pas encore tout seul.");
  // « avec deplacement » : des boutons « Monter » et « Descendre », pas encore de glissement au doigt.
  const boucles = (noeuds: NoeudVue[]): Extract<NoeudVue, { type: 'repetition' }>[] =>
    noeuds.flatMap((n) => (n.type === 'repetition' ? [n, ...boucles(n.corps)] : n.type === 'condition' ? [...boucles(n.alors), ...boucles(n.sinon)] : 'corps' in n && Array.isArray(n.corps) ? boucles(n.corps as NoeudVue[]) : []));
  const deplacee = [...application.ecrans, ...application.composants].flatMap((e) => boucles(e.vue)).filter((b) => b.deplacement);
  if (deplacee.length > 0) avertir(deplacee[0].ligne, "sur le mobile, les éléments « avec deplacement » montent et descendent avec deux boutons (et les actions du lecteur d'écran) : pas encore de glissement au doigt.");
  const apercu = application.ecrans.find((e) => e.apercu);
  if (apercu) avertir(apercu.ligne, "« apercu » est sans effet sur le mobile : une application n'a ni onglet, ni moteur de recherche, ni aperçu de partage.");

  // M4 : le CSS ne s'applique pas sur le mobile ; les styles écrits en Humalis, si.
  const CSS = "le CSS ne s'applique pas sur le mobile : seuls les styles nommés (couleur, fond, texte, taille, position, bordure) et les styles écrits en Humalis (style \"nom\" :) y sont traduits.";
  const deHumalis = new Set((application.stylesHumalis ?? []).map((s) => s.nom));
  const elements = [...application.ecrans, ...application.composants].flatMap((e) => elementsDe(e.vue));
  const avecClasse = elements.find((e) => e.classes.some((c) => !deHumalis.has(c)));
  if (application.css.length > deHumalis.size || application.fichiersStyle.length > 0 || avecClasse) {
    avertir(application.fichiersStyle[0]?.ligne ?? avecClasse?.ligne ?? 1, CSS);
  }

  // La carte native : Google Maps sur Android demande une clé que Humalis n'invente pas (décision M15).
  const premiereCarte = [...application.ecrans, ...application.composants].flatMap((e) => cartesDe(e.vue))[0];
  if (premiereCarte) avertir(premiereCarte.ligne, `${PHRASE_CLE_GOOGLE.charAt(0).toUpperCase()}${PHRASE_CLE_GOOGLE.slice(1)}`);

  // Les polices du thème : la police du système sert sur le téléphone pour l'instant.
  if ((application.theme?.polices.length ?? 0) > 0) {
    avertir(1, "les polices du bloc « theme » ne sont pas encore chargées sur le téléphone : la police du système est utilisée.");
  }

  // Plan de la mise en page : « colle » n'a pas d'équivalent général sur un téléphone.
  for (const ligne of lignesAvecReglage([...application.ecrans, ...application.composants].flatMap((e) => e.vue), 'colle')) {
    avertir(ligne, "« colle » n'a pas d'effet sur le téléphone, sauf pour l'en-tête et le pied de page.");
  }

  // M7 : pas de souris ; les composants React sont recopiés tels quels.
  const gestionnaires = [...application.ecrans, ...application.composants].flatMap((e) => [
    ...e.gestionnaires,
    ...gestionnairesDe(e.vue),
  ]);
  for (const g of gestionnaires) {
    if (g.declencheur === 'survol') avertir(g.ligne, "sur un téléphone, il n'y a pas de souris : « survole » est ignoré sur le mobile.");
  }
  for (const c of application.composantsReact) {
    if (c.module) continue; // refusé par verifierModulesPourLeMobile
    avertir(
      c.ligne,
      `le composant React « ${c.nom} » est recopié tel quel : sur le mobile, il doit être écrit pour React Native (View, Text), pas pour le navigateur.`,
    );
  }

  // M6 : un envoi sans connexion est refusé sur le téléphone par la protection CSRF des packs.
  const routes = application.serveurs.flatMap((s) => s.routes);
  for (const g of gestionnaires) {
    for (const requete of requetesDe(g.actions)) {
      if (requete.mode !== 'envoyer') continue;
      const route = routes.find((r) => r.adresse === adresseNormalisee(requete.adresse));
      if (route?.droits.creer === 'tout_le_monde') {
        avertir(
          g.ligne,
          `sur le mobile, cet envoi vers « ${route.adresse} » demande d'être connecté : sans connexion, la protection CSRF des packs Astratra le refuse.`,
        );
      }
    }
  }
  return diagnostics;
}

type Element = Extract<NoeudVue, { type: 'element' }>;

function elementsDe(noeuds: NoeudVue[]): Element[] {
  return noeuds.flatMap((n) =>
    n.type === 'element'
      ? [n]
      : n.type === 'condition'
        ? [...elementsDe(n.alors), ...elementsDe(n.sinon)]
        : n.type === 'repetition' || n.type === 'formulaire' || n.type === 'bloc'
          ? elementsDe(n.corps)
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

function requetesDe(actions: Action[]): Extract<Action, { type: 'requete' }>[] {
  return actions.flatMap((a) =>
    a.type === 'requete' ? [a] : sousActions(a).flatMap(requetesDe),
  );
}

/** Les lignes des blocs et éléments qui portent ce réglage (« colle »…). */
function lignesAvecReglage(noeuds: NoeudVue[], reglage: string): number[] {
  return noeuds.flatMap((n) => {
    const enfants =
      n.type === 'condition' ? [...n.alors, ...n.sinon] : n.type === 'repetition' || n.type === 'formulaire' || n.type === 'bloc' ? n.corps : [];
    const propres = (n.type === 'bloc' || n.type === 'element') && n.options.some((o) => o.nom === reglage) ? [n.ligne] : [];
    return [...propres, ...lignesAvecReglage(enfants, reglage)];
  });
}

// ─── Les fichiers du projet ─────────────────────────────────────────────

function packageJson(slug: string, besoins: { memoire: boolean; coffre: boolean; degrade?: boolean; dependances?: Record<string, string>; langues?: boolean }): string {
  const v = VERSIONS_MOBILE;
  const dependances: Record<string, string> = {
    '@expo/metro-runtime': v.metroRuntime,
    ...(besoins.memoire ? { '@react-native-async-storage/async-storage': v.asyncStorage } : {}),
    expo: v.expo,
    'expo-constants': v.expoConstants,
    'expo-linking': v.expoLinking,
    'expo-router': v.expoRouter,
    ...(besoins.degrade ? { 'expo-linear-gradient': v.expoLinearGradient } : {}),
    ...(besoins.langues ? { 'expo-localization': v.expoLocalization } : {}),
    ...(besoins.dependances ?? {}),
    ...(besoins.coffre ? { 'expo-secure-store': v.expoSecureStore } : {}),
    'expo-status-bar': v.expoStatusBar,
    react: v.react,
    'react-dom': v.reactDom,
    'react-native': v.reactNative,
    'react-native-safe-area-context': v.safeArea,
    'react-native-screens': v.screens,
    'react-native-web': v.reactNativeWeb,
  };
  return (
    JSON.stringify(
      {
        name: slug,
        version: '1.0.0',
        private: true,
        main: 'expo-router/entry',
        scripts: {
          start: 'expo start',
          ios: 'expo start --ios',
          android: 'expo start --android',
          web: 'expo start --web',
          verifier: 'tsc --noEmit',
        },
        dependencies: dependances,
        devDependencies: { '@types/react': v.typesReact, typescript: v.typescript },
      },
      null,
      2,
    ) + '\n'
  );
}

function appJson(nom: string, slug: string, coffre: boolean, icone = false, carte = false, galerie = false): string {
  // La galerie : la phrase que l'iPhone montre, et ni l'appareil photo ni le micro (Humalis ne s'en sert pas).
  const photos = galerie ? [['expo-image-picker', { photosPermission: PHRASE_PHOTOS, cameraPermission: false, microphonePermission: false }]] : [];
  return (
    JSON.stringify(
      {
        expo: {
          name: nom,
          slug,
          version: '1.0.0',
          scheme: slug,
          orientation: 'portrait',
          ...(icone ? { icon: './assets/icone.png' } : {}),
          userInterfaceStyle: 'automatic',
          // La clé de Google Maps, que seul Android demande : à remplir (voir le LISEZMOI).
          ...(carte ? { android: { config: { googleMaps: { apiKey: '' } } } } : {}),
          plugins: ['expo-router', ...(coffre ? ['expo-secure-store'] : []), ...photos],
          web: { bundler: 'metro', output: 'static' },
        },
      },
      null,
      2,
    ) + '\n'
  );
}

const TSCONFIG =
  JSON.stringify(
    {
      extends: 'expo/tsconfig.base',
      compilerOptions: { strict: true },
      include: ['**/*.ts', '**/*.tsx', 'expo-env.d.ts'],
    },
    null,
    2,
  ) + '\n';

function disposition(
  partage: boolean,
  session: boolean,
  communs: { entete?: string; pied?: string; sansEntete: string[]; sansPied: string[] } = { sansEntete: [], sansPied: [] },
  confirmations = false,
): string {
  // Les enveloppes autour de la pile : la session (connexion), les variables partagées, la fenêtre des questions.
  const enveloppes = [...(session ? ['Session'] : []), ...(partage ? ['Partage'] : []), ...(confirmations ? ['Confirmations'] : [])];
  const barres = communs.entete !== undefined || communs.pied !== undefined;
  const optionsPile = `headerStyle: { backgroundColor: couleurs.page }, headerTintColor: couleurs.encre, contentStyle: { backgroundColor: couleurs.page }`;
  let pile = `<Stack screenOptions={{ ${barres && communs.entete ? 'headerShown: false, ' : ''}${optionsPile} }} />`;
  if (barres) {
    // L'en-tête au-dessus de la pile (qui n'a plus son en-tête natif), le pied en dessous, hors des pages qui s'en passent.
    pile = [
      `<View style={{ flex: 1, backgroundColor: couleurs.page }}>`,
      ...(communs.entete
        ? [`  {!SANS_ENTETE.includes(chemin) && (`, `    <View style={{ paddingTop: marges.top, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#8a8a9066' }}>`, `      <${communs.entete} />`, `    </View>`, `  )}`]
        : []),
      `  <View style={{ flex: 1 }}>`,
      `    ${pile}`,
      `  </View>`,
      ...(communs.pied
        ? [`  {!SANS_PIED.includes(chemin) && (`, `    <View style={{ paddingBottom: marges.bottom, paddingHorizontal: 16, borderTopWidth: 1, borderColor: '#8a8a9066' }}>`, `      <${communs.pied} />`, `    </View>`, `  )}`]
        : []),
      `</View>`,
    ].join('\n');
  }
  for (const nom of [...enveloppes].reverse()) pile = `<${nom}>\n${pile.replace(/^/gm, '  ')}\n</${nom}>`;
  const autour = [...(session ? ['la session'] : []), ...(partage ? ['les variables partagées'] : [])];
  const liste = (chemins: string[]) => `[${chemins.map((c) => JSON.stringify(c)).join(', ')}]`;
  return `import { Stack${barres ? ', usePathname' : ''} } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
${barres ? "import { View } from 'react-native';\nimport { useSafeAreaInsets } from 'react-native-safe-area-context';\n" : ''}${communs.entete ? `import ${communs.entete} from '../composants/${communs.entete}';\n` : ''}${communs.pied ? `import ${communs.pied} from '../composants/${communs.pied}';\n` : ''}import { Messages } from '../humalis/messages';
${session ? "import { Session } from '../humalis/session';\n" : ''}${confirmations ? "import { Confirmations } from '../humalis/confirmation';\n" : ''}${partage ? "import { Partage } from '../humalis/partage';\n" : ''}import { useCouleurs } from '../humalis/styles';

${communs.entete ? `/** Les pages qui se passent de l'en-tête commun. */\nconst SANS_ENTETE: string[] = ${liste(communs.sansEntete)};\n` : ''}${communs.pied ? `/** Les pages qui se passent du pied de page commun. */\nconst SANS_PIED: string[] = ${liste(communs.sansPied)};\n` : ''}${barres ? '\n' : ''}/** Autour de toutes les pages : la pile de navigation, les messages${autour.map((a) => `, ${a}`).join('')}${barres ? ", l'en-tête et le pied communs" : ''}. */
export default function Disposition() {
  const couleurs = useCouleurs();
${barres ? '  const chemin = usePathname();\n  const marges = useSafeAreaInsets();\n' : ''}
  return (
    <Messages>
${pile.replace(/^/gm, '      ')}
      <StatusBar style="auto" />
    </Messages>
  );
}
`;
}

const INTROUVABLE = `import { ScrollView, Text } from 'react-native';
import { Link } from 'expo-router';
import { usePage } from '../humalis/page';
import { useStyles } from '../humalis/styles';

export default function Introuvable() {
  const s = useStyles();
  usePage('Page introuvable', "Cette page n'existe pas.");

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text accessibilityRole="header" style={s.titre}>Page introuvable</Text>
      <Text style={s.texte}>Cette page n'existe pas.</Text>
      <Link href="/" style={s.lien}>Revenir à l'accueil</Link>
    </ScrollView>
  );
}
`;

const MESSAGES = `import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCouleurs } from './styles';

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

/** Les messages (« afficher » dans un événement) : une pile en haut de l'écran, au plus trois. */
export function Messages({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const suivant = useRef(0);
  const marges = useSafeAreaInsets();
  const fermer = useCallback((id: number) => setMessages((liste) => liste.filter((m) => m.id !== id)), []);

  const afficher = useCallback<Afficher>((texte, genre = 'info', options = {}) => {
    const reglages: OptionsMessage = typeof options === 'function' ? { action: { libelle: 'Réessayer', faire: options }, duree: 12000 } : options;
    // Pas de souris sur un téléphone : un message avec un bouton reste au moins 8 secondes.
    const duree = reglages.persistant ? null : reglages.duree ?? (reglages.action ? 6000 : DUREES[genre]);
    setMessages((liste) => [...liste, { id: ++suivant.current, texte, genre, duree, ...(reglages.action ? { action: reglages.action } : {}) }].slice(-PILE));
    // iOS ne lit pas seul une zone qui change : le message est dit au lecteur d'écran.
    AccessibilityInfo.announceForAccessibility(texte);
  }, []);

  return (
    <Contexte.Provider value={afficher}>
      <View style={styles.racine}>
        {children}
        <View pointerEvents="box-none" style={[styles.pile, { top: marges.top + 72 }]}>
          {messages.map((message) => (
            <UnMessage key={message.id} message={message} fermer={fermer} />
          ))}
        </View>
      </View>
    </Contexte.Provider>
  );
}

/** Un message : il disparaît après sa durée ; « Fermer » le retire tout de suite. */
function UnMessage({ message, fermer }: { message: Message; fermer: (id: number) => void }) {
  const couleurs = useCouleurs();
  useEffect(() => {
    if (message.duree === null) return;
    const minuterie = setTimeout(() => fermer(message.id), message.duree);
    return () => clearTimeout(minuterie);
  }, [message, fermer]);
  const [fond, encre] =
    message.genre === 'erreur'
      ? [couleurs.rouge, couleurs.rougeEncre]
      : message.genre === 'reussite'
        ? [couleurs.vert, couleurs.vertEncre]
        : message.genre === 'avertissement'
          ? [couleurs.orange, couleurs.orangeEncre]
          : [couleurs.encre, couleurs.page];
  return (
    <View style={[styles.message, { backgroundColor: fond }]}>
      <Text
        testID="humalis-message"
        accessibilityRole={message.genre === 'erreur' ? 'alert' : 'text'}
        accessibilityLiveRegion={message.genre === 'erreur' ? 'assertive' : 'polite'}
        style={[styles.texte, { color: encre }]}
      >
        {message.texte}
      </Text>
      {message.action && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const faire = message.action?.faire;
            fermer(message.id);
            void faire?.();
          }}
          style={[styles.bouton, { borderColor: encre }]}
        >
          <Text style={{ color: encre }}>{message.action.libelle}</Text>
        </Pressable>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Fermer le message" hitSlop={8} onPress={() => fermer(message.id)} style={styles.bouton}>
        <Text style={{ color: encre }}>×</Text>
      </Pressable>
    </View>
  );
}

export function useMessages() {
  return { afficherMessage: useContext(Contexte) };
}

const styles = StyleSheet.create({
  racine: { flex: 1 },
  pile: { position: 'absolute', left: 16, right: 16, gap: 8 },
  message: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingLeft: 16, paddingRight: 8, borderRadius: 8 },
  texte: { flex: 1, fontSize: 16 },
  bouton: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: 'transparent' },
});
`;

const PAGE = `import { useLayoutEffect } from 'react';
import { useNavigation } from 'expo-router';

/**
 * Le titre de la page, affiché dans la barre de navigation. La description
 * ne sert que sur le web (moteurs de recherche) : elle est gardée pour que
 * les pages soient les mêmes partout.
 */
export function usePage(titre: string, _description: string) {
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({ title: titre });
  }, [navigation, titre]);
}
`;

const SERVEUR = `import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useMessages } from './messages';
import { seGarde, garder, lireEnCommun, oublier } from './lectures';

/** L'adresse du serveur Humalis : un téléphone n'a pas de « même origine ». */
export const BASE = process.env.EXPO_PUBLIC_HUMALIS_SERVEUR ?? '';

/** Le serveur n'a pas répondu (réseau coupé, serveur arrêté) : pas de raison plus précise. */
const PAS_DE_REPONSE = "Le serveur n'a pas répondu.";

/** La raison d'un échec : une phrase écrite pour la personne, jamais le texte anglais du système (« Network request failed ») ni celui d'une réponse illisible. */
const raisonDe = (erreur: unknown) => (erreur instanceof Error && !(erreur instanceof TypeError) && !(erreur instanceof SyntaxError) ? erreur.message : PAS_DE_REPONSE);
if (BASE === '' && Platform.OS !== 'web') {
  console.warn("EXPO_PUBLIC_HUMALIS_SERVEUR n'est pas réglée : les requêtes ne savent pas où trouver le serveur.");
}

/** Où la connexion range le jeton de session, dans le coffre du téléphone. */
export const CLE_JETON = 'humalis.jeton';

/**
 * La sécurité vient des packs Astratra. Dans le navigateur, les envois
 * portent le jeton CSRF du cookie astratra_csrf. Sur le téléphone, le jeton
 * de session va dans l'en-tête Authorization : les packs reconnaissent ce
 * client « Bearer », pour qui la protection CSRF ne s'applique pas.
 */
export async function securiser(entetes: Headers, methode: string): Promise<void> {
  if (Platform.OS === 'web') {
    const jeton = document.cookie.match(/(?:^|; )astratra_csrf=([^;]*)/)?.[1];
    if (methode !== 'GET' && jeton) entetes.set('x-csrf-token', decodeURIComponent(jeton));
    return;
  }
  const jeton = await SecureStore.getItemAsync(CLE_JETON);
  if (jeton) entetes.set('Authorization', \`Bearer \${jeton}\`);
}

/**
 * Les requêtes (« envoyer requete »). En cas d'échec, un message en
 * français s'affiche et la valeur actuelle est gardée.
 */
export function useServeur() {
  const { afficherMessage } = useMessages();
  // La raison du dernier échec : la phrase du serveur quand il refuse, sinon « pas répondu ».
  let derniereRaison = PAS_DE_REPONSE;

  async function appeler<T>(adresse: string, options: RequestInit, actuelle: T): Promise<T> {
    try {
      const entetes = new Headers(options.headers);
      await securiser(entetes, options.method ?? 'GET');
      const lecture = options.method === 'GET';
      const envoi = { ...options, headers: entetes, credentials: 'same-origin' } as const;
      // Deux lectures de la même adresse en même temps ne font qu'un appel.
      const reponse = lecture ? await lireEnCommun(adresse, BASE + adresse, envoi) : await fetch(BASE + adresse, envoi);
      // Une lecture d'un élément qui n'existe plus (404) : la valeur actuelle est gardée, sans faux « pas répondu ».
      if (reponse.status === 404 && options.method === 'GET') return actuelle;
      // Personne n'est connecté : ce n'est pas une panne du serveur.
      if (reponse.status === 401) throw new Error('Connectez-vous pour continuer.');
      if (!reponse.ok) {
        // Un refus du serveur : sa raison, pour « si erreur » et le message.
        const corps = (await reponse.json().catch(() => null)) as { erreur?: unknown } | null;
        throw new Error(typeof corps?.erreur === 'string' && corps.erreur !== '' ? corps.erreur.charAt(0).toUpperCase() + corps.erreur.slice(1) + '.' : PAS_DE_REPONSE);
      }
      // Un envoi réussi : les lectures gardées de cette route ont peut-être changé.
      if (!lecture) oublier(adresse, options.method ?? 'POST');
      const texte = await reponse.text();
      if (texte === '') return actuelle;
      const valeur = JSON.parse(texte) as T;
      // On attendait une liste et on reçoit autre chose : la valeur actuelle est gardée.
      if (Array.isArray(actuelle) && !Array.isArray(valeur)) return actuelle;
      // Ce que tout le monde peut lire est gardé : l'écran s'affichera tout de suite la prochaine fois.
      if (lecture && seGarde(reponse)) garder(adresse, valeur, texte);
      return valeur;
    } catch (erreur) {
      derniereRaison = raisonDe(erreur);
      afficherMessage(derniereRaison === PAS_DE_REPONSE ? "Le serveur n'a pas répondu. Réessayez dans un instant." : derniereRaison, 'erreur');
      return actuelle;
    }
  }

  // Avec une valeur actuelle, la réponse a son type ; sans, elle est inconnue.
  return {
    // La raison du dernier échec, que reçoit « si erreur » (« raison »).
    raison: () => derniereRaison,
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
  raison(): string;
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
 * « telecharger bon de … » : le téléphone n'a pas encore de partage de fichier simple. Un message
 * clair, et dans « essayer », « si erreur » reçoit la même phrase.
 */
function avecTelechargementRefuse(modele: string, codes: string[]): string {
  if (!codes.some((c) => c.includes('serveur.telecharger('))) return modele;
  const remplacer = (texte: string, avant: string, apres: string) => {
    if (!texte.includes(avant)) throw new Error(`modèle du serveur mobile inattendu : ${avant}`);
    return texte.replace(avant, apres);
  };
  const refus = `  async function telecharger(_adresse: string, _id: string): Promise<void> {
    try {
      throw new Error("Le téléchargement d'un bon n'est pas encore disponible dans l'application mobile.");
    } catch (erreur) {
      derniereRaison = (erreur as Error).message;
      afficherMessage(derniereRaison, 'erreur');
    }
  }

`;
  let texte = remplacer(modele, '  // Avec une valeur actuelle, la réponse a son type', `${refus}  // Avec une valeur actuelle, la réponse a son type`);
  texte = remplacer(texte, '    lireUn: (adresse: string', '    telecharger,\n    lireUn: (adresse: string');
  return remplacer(texte, 'interface Serveur {\n', 'interface Serveur {\n  telecharger(adresse: string, id: string): Promise<void>;\n');
}

/**
 * Le serveur d'un programme qui choisit des fichiers : les envois passent par
 * `preparer`, qui réduit une image choisie comme le fait le web (480 px de
 * côté, JPEG en data URL, au plus 90 000 caractères).
 */
function serveurAvecReduction(): string {
  const remplacer = (texte: string, avant: string, apres: string) => {
    if (!texte.includes(avant)) throw new Error(`modèle du serveur mobile inattendu : ${avant}`);
    return texte.split(avant).join(apres);
  };
  let texte = remplacer(SERVEUR, "import { useMessages } from './messages';\n", "import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';\nimport { useMessages } from './messages';\n");
  texte = remplacer(texte, "\n/**\n * Les requêtes (« envoyer requete »).", `${REDUIRE_IMAGE_MOBILE}\n/**\n * Les requêtes (« envoyer requete »).`);
  texte = remplacer(texte, '    envoyer: (adresse: string', '    envoyer: async (adresse: string');
  texte = remplacer(texte, '    modifier: (adresse: string', '    modifier: async (adresse: string');
  return remplacer(texte, 'body: JSON.stringify(donnees)', 'body: JSON.stringify(await preparer(donnees))');
}

/**
 * Le renouvellement sur le téléphone : le jeton d'accès dure 15 minutes ; le jeton de renouvellement,
 * gardé dans le coffre, en donne un autre. Dans un navigateur (Expo web), c'est le cookie HttpOnly.
 * Le serveur vérifie seul les durées (3 jours sans venir, 30 jours au plus).
 */
const RENOUVELER = `import { createSessionClient, SessionExpiredError } from '@astratra/client';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const BASE = process.env.EXPO_PUBLIC_HUMALIS_SERVEUR ?? '';
const surTelephone = Platform.OS !== 'web';
const EXPIREE = 'Votre session a expiré. Connectez-vous de nouveau.';
const DEMANDEE = 'Connectez-vous pour continuer.';

/** Où la connexion range ses jetons, dans le coffre du téléphone. */
export const CLE_JETON = 'humalis.jeton';
export const CLE_RENOUVELLEMENT = 'humalis.renouvellement';

/** Ce que disent les routes de session : les deux jetons à garder (à la racine, ou dans « data »). */
export async function garderLesJetons(corps: { token?: unknown; refreshToken?: unknown } | null | undefined): Promise<void> {
  if (!surTelephone) return;
  if (typeof corps?.token === 'string') await SecureStore.setItemAsync(CLE_JETON, corps.token);
  if (typeof corps?.refreshToken === 'string') await SecureStore.setItemAsync(CLE_RENOUVELLEMENT, corps.refreshToken);
}

export async function oublierLesJetons(): Promise<void> {
  if (!surTelephone) return;
  await SecureStore.deleteItemAsync(CLE_JETON);
  await SecureStore.deleteItemAsync(CLE_RENOUVELLEMENT);
}

/** La session est finie : le serveur a refusé de la renouveler. */
export class SessionFinie extends Error {
  constructor(
    message: string,
    /** Quelqu'un était connecté ici. */
    readonly expiree: boolean,
    /** Une autre requête du même instant l'a déjà dit. */
    readonly dejaDite: boolean,
  ) {
    super(message);
  }
}

type Lancer = () => Promise<Response>;
let refusee = false;

const client = createSessionClient({
  request: async (_chemin: string, lancer?: unknown) => {
    const reponse = await (lancer as Lancer)();
    if (reponse.status === 401) throw Object.assign(new Error('401'), { status: 401 });
    return reponse;
  },
  // Vol unique, assuré par le pack : plusieurs requêtes refusées, un seul renouvellement.
  refresh: async () => {
    const jeton = surTelephone ? await SecureStore.getItemAsync(CLE_RENOUVELLEMENT) : null;
    if (surTelephone && !jeton) throw Object.assign(new Error('401'), { status: 401 });
    const reponse = await fetch(
      BASE + '/auth/refresh',
      surTelephone
        ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-humalis-mobile': '1' }, body: JSON.stringify({ refreshToken: jeton }) }
        : { method: 'POST', credentials: 'same-origin' },
    );
    if (!reponse.ok) {
      // Une coupure ou une limite ne ferme pas la session ; un refus, si.
      if (surTelephone && [400, 401, 403].includes(reponse.status)) {
        refusee = true;
        await oublierLesJetons();
      }
      throw Object.assign(new Error("Le serveur n'a pas répondu."), { status: reponse.status });
    }
    await garderLesJetons(((await reponse.json()) as { data?: { token?: unknown; refreshToken?: unknown } }).data);
  },
});

const ecoutes = new Set<() => void>();
let derniereFin = 0;

/** La session de l'application écoute ici : plus personne n'est connecté. */
export function surFinDeSession(rappel: () => void): () => void {
  ecoutes.add(rappel);
  return () => {
    ecoutes.delete(rappel);
  };
}

function finDeSession(): SessionFinie {
  const dejaDite = Date.now() - derniereFin < 3000;
  const expiree = refusee;
  refusee = false;
  if (expiree) derniereFin = Date.now();
  for (const rappel of ecoutes) rappel();
  return new SessionFinie(expiree || dejaDite ? EXPIREE : DEMANDEE, expiree, dejaDite);
}

/** Lance un appel ; sur un 401, renouvelle la session et le relance une fois. \`lancer\` relit le jeton à chaque essai. */
export async function avecSession(lancer: Lancer): Promise<Response> {
  try {
    return (await client.call('', lancer)) as Response;
  } catch (erreur) {
    if (erreur instanceof SessionExpiredError || (erreur as { status?: unknown }).status === 401) throw finDeSession();
    throw erreur;
  }
}
`;

/** `serveur.ts` avec le renouvellement : le 401 ne remonte que si le serveur refuse de renouveler. */
function serveurRenouvele(modele: string): string {
  const remplacer = (texte: string, avant: string, apres: string) => {
    if (!texte.includes(avant)) throw new Error(`modèle du serveur mobile inattendu : ${avant}`);
    return texte.replace(avant, apres);
  };
  let texte = remplacer(modele, "import { useMessages } from './messages';\n", "import { useMessages } from './messages';\nimport { avecSession, CLE_JETON, SessionFinie } from './renouveler';\n");
  texte = remplacer(texte, "\n/** Où la connexion range le jeton de session, dans le coffre du téléphone. */\nexport const CLE_JETON = 'humalis.jeton';\n", "\nexport { CLE_JETON };\n");
  texte = remplacer(
    texte,
    'const reponse = lecture ? await lireEnCommun(adresse, BASE + adresse, envoi) : await fetch(BASE + adresse, envoi);',
    "const reponse = await avecSession(async () => {\n        // Relu à chaque essai : après un renouvellement, le jeton a changé.\n        await securiser(entetes, options.method ?? 'GET');\n        return lecture ? lireEnCommun(adresse, BASE + adresse, envoi) : fetch(BASE + adresse, envoi);\n      });",
  );
  texte = remplacer(texte, "      // Personne n'est connecté : ce n'est pas une panne du serveur.\n      if (reponse.status === 401) throw new Error('Connectez-vous pour continuer.');\n", '');
  return remplacer(
    texte,
    '      afficherMessage(derniereRaison === PAS_DE_REPONSE ?',
    '      if (erreur instanceof SessionFinie && erreur.dejaDite) return actuelle;\n      afficherMessage(derniereRaison === PAS_DE_REPONSE ?',
  );
}

/**
 * La session sur le mobile (décision L5) : les packs Astratra donnent un
 * jeton à la connexion ; le téléphone le range dans son coffre et le
 * présente dans l'en-tête Authorization (client « Bearer »). Dans le
 * navigateur, c'est le cookie HttpOnly du pack, comme sur le web.
 */
const SESSION = `import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { useMessages } from './messages';
import { BASE, securiser } from './serveur';
import { avecSession, garderLesJetons, oublierLesJetons, SessionFinie, surFinDeSession } from './renouveler';

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
  /** Vrai si la connexion a réussi ; sinon un message d'erreur s'affiche (dans « essayer », l'erreur est levée : « si erreur » la reçoit). */
  seConnecter(email: string, motDePasse: string, dansUnEssai?: boolean): Promise<boolean>;
  /** « se connecter avec google » : pas encore sur le téléphone. */
  seConnecterAvecGoogle(dansUnEssai?: boolean): Promise<boolean>;
  /** « changer le mot de passe avec … et … » : celui du compte connecté ; vrai si le serveur l'a accepté. */
  changerMotDePasse(actuel: string, nouveau: string, dansUnEssai?: boolean): Promise<boolean>;
  inviter(email: string, role: string, dansUnEssai?: boolean, groupes?: Record<string, string>, champs?: Record<string, unknown>): Promise<boolean>;
  changerCompte(id: string, champs: Record<string, unknown>, dansUnEssai?: boolean): Promise<boolean>;
  changerRole(id: string, role: string, dansUnEssai?: boolean): Promise<boolean>;
  activerNotifications(dansUnEssai?: boolean): Promise<boolean>;
  demanderIa(question: string, surTexte: (texte: string) => void, dansUnEssai?: boolean): Promise<boolean>;
  payer(adresse: string, id: string, dansUnEssai?: boolean): Promise<boolean>;
  demanderLienMotDePasse(email: string, dansUnEssai?: boolean): Promise<boolean>;
  choisirMotDePasse(nouveau: string, dansUnEssai?: boolean): Promise<boolean>;
  seDeconnecter(): Promise<void>;
  /** Demande /auth/me une seule fois, à la première page qui lit la session. */
  demander(): void;
}

const Contexte = createContext<Utilisateur | null>(null);
const surTelephone = Platform.OS !== 'web';

/** Qui est connecté : toujours lu sur /auth/me du serveur, jamais deviné par l'application. */
export function Session({ children }: { children: ReactNode }) {
  const { afficherMessage } = useMessages();
  const [personne, setPersonne] = useState<Personne | null>(null);
  const [pret, setPret] = useState(false);
  // La dernière réponse de /auth/me : un événement en cours (juste après
  // « se connecter ») la lit, sans attendre le prochain affichage.
  const derniere = useRef<Personne | null>(null);
  const demandee = useRef(false);

  const relire = useCallback(async () => {
    try {
      const entetes = new Headers();
      const reponse = await avecSession(async () => {
        await securiser(entetes, 'GET');
        return fetch(BASE + '/auth/me', { headers: entetes, credentials: 'same-origin' });
      });
      const corps = reponse.ok ? ((await reponse.json()) as { data?: Personne | null }) : null;
      derniere.current = corps?.data?.id !== undefined ? corps.data : null;
    } catch (erreur) {
      derniere.current = null;
      if (erreur instanceof SessionFinie && erreur.expiree && !erreur.dejaDite) afficherMessage(erreur.message, 'avertissement');
    }
    setPersonne(derniere.current);
    setPret(true);
  }, [afficherMessage]);

  // Une requête refusée en plein travail : l'application voit aussitôt que plus personne n'est connecté.
  useEffect(
    () =>
      surFinDeSession(() => {
        derniere.current = null;
        setPersonne(null);
        setPret(true);
      }),
    [],
  );

  const demander = useCallback(() => {
    if (demandee.current) return;
    demandee.current = true;
    void relire();
  }, [relire]);

  async function seConnecter(email: string, motDePasse: string, dansUnEssai = false): Promise<boolean> {
    const refuser = (texte: string): boolean => {
      if (dansUnEssai) throw new Error(texte);
      afficherMessage(texte, 'erreur');
      return false;
    };
    let reponse: Response;
    try {
      const entetes = new Headers({ 'Content-Type': 'application/json' });
      await securiser(entetes, 'POST');
      // Le téléphone n'a pas de cookie sûr : il reçoit son jeton de renouvellement pour son coffre.
      if (surTelephone) entetes.set('x-humalis-mobile', '1');
      reponse = await fetch(BASE + '/auth/login', {
        method: 'POST',
        headers: entetes,
        credentials: 'same-origin',
        body: JSON.stringify({ email, password: motDePasse }),
      });
    } catch {
      return refuser("Le serveur n'a pas répondu. Réessayez dans un instant.");
    }
    if (reponse.status === 429) {
      return refuser('Trop de tentatives de connexion. Réessayez dans quelques minutes.');
    }
    if (!reponse.ok) {
      // Jamais lequel des deux est faux : on ne dit pas si un compte existe.
      return refuser('Email ou mot de passe incorrect.');
    }
    if (surTelephone) {
      // Le jeton donné par le pack va dans le coffre du téléphone, nulle part ailleurs.
      await garderLesJetons(((await reponse.json()) as { data?: { token?: unknown; refreshToken?: unknown } }).data);
    }
    await relire();
    return true;
  }

  async function seConnecterAvecGoogle(dansUnEssai = false): Promise<boolean> {
    const texte = "La connexion avec Google n'est pas encore disponible dans l'application mobile.";
    if (dansUnEssai) throw new Error(texte);
    afficherMessage(texte, 'erreur');
    return false;
  }

  /** Les invitations et les liens de mot de passe s'ouvrent sur le site : pas encore dans l'application. */
  function comptesSurLeSite(dansUnEssai: boolean): boolean {
    const texte = "Les invitations et les liens de mot de passe ne sont pas encore disponibles dans l'application mobile : passez par le site.";
    if (dansUnEssai) throw new Error(texte);
    afficherMessage(texte, 'erreur');
    return false;
  }
  const inviter = async (_email: string, _role: string, dansUnEssai = false, _groupes?: Record<string, string>, _champs?: Record<string, unknown>): Promise<boolean> => comptesSurLeSite(dansUnEssai);
  const changerCompte = async (_id: string, _champs: Record<string, unknown>, dansUnEssai = false): Promise<boolean> => comptesSurLeSite(dansUnEssai);
  const payer = async (_adresse: string, _id: string, dansUnEssai = false): Promise<boolean> => comptesSurLeSite(dansUnEssai);
  const demanderIa = async (_question: string, _surTexte: (texte: string) => void, dansUnEssai = false): Promise<boolean> => comptesSurLeSite(dansUnEssai);
  const activerNotifications = async (dansUnEssai = false): Promise<boolean> => comptesSurLeSite(dansUnEssai);
  const changerRole = async (_id: string, _role: string, dansUnEssai = false): Promise<boolean> => comptesSurLeSite(dansUnEssai);
  const demanderLienMotDePasse = async (_email: string, dansUnEssai = false): Promise<boolean> => comptesSurLeSite(dansUnEssai);
  const choisirMotDePasse = async (_nouveau: string, dansUnEssai = false): Promise<boolean> => comptesSurLeSite(dansUnEssai);

  async function changerMotDePasse(actuel: string, nouveau: string, dansUnEssai = false): Promise<boolean> {
    const refuser = (texte: string): boolean => {
      if (dansUnEssai) throw new Error(texte);
      afficherMessage(texte, 'erreur');
      return false;
    };
    let reponse: Response;
    try {
      const entetes = new Headers({ 'Content-Type': 'application/json' });
      if (surTelephone) entetes.set('x-humalis-mobile', '1');
      reponse = await avecSession(async () => {
        await securiser(entetes, 'POST');
        return fetch(BASE + '/auth/mot-de-passe', {
          method: 'POST',
          headers: entetes,
          credentials: 'same-origin',
          body: JSON.stringify({ actuel, nouveau }),
        });
      });
    } catch (erreur) {
      return refuser(erreur instanceof SessionFinie ? erreur.message : "Le serveur n'a pas répondu. Réessayez dans un instant.");
    }
    if (reponse.status === 429) return refuser('Trop de tentatives. Réessayez dans quelques minutes.');
    if (!reponse.ok) {
      const corps = (await reponse.json().catch(() => null)) as { erreur?: string } | null;
      const raison = corps?.erreur ?? "le mot de passe n'a pas été changé";
      return refuser(raison.charAt(0).toUpperCase() + raison.slice(1) + '.');
    }
    // Le changement a fermé les autres sessions ; celle-ci repart avec des jetons neufs.
    await garderLesJetons((await reponse.json().catch(() => null)) as { token?: unknown; refreshToken?: unknown } | null);
    return true;
  }

  async function seDeconnecter(): Promise<void> {
    try {
      const entetes = new Headers();
      await avecSession(async () => {
        await securiser(entetes, 'POST');
        return fetch(BASE + '/auth/logout', { method: 'POST', headers: entetes, credentials: 'same-origin' });
      });
    } catch (erreur) {
      if (!(erreur instanceof SessionFinie)) afficherMessage("Le serveur n'a pas répondu. Réessayez dans un instant.", 'erreur');
    }
    await oublierLesJetons();
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
    seConnecterAvecGoogle,
    changerMotDePasse,
    inviter,
    changerRole,
    changerCompte,
    activerNotifications,
    demanderIa,
    payer,
    demanderLienMotDePasse,
    choisirMotDePasse,
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

function memoireTs(memoire: boolean, secret: boolean): string {
  const imports = [
    "import { useCallback, useEffect, useRef, useState } from 'react';",
    ...(memoire ? ["import AsyncStorage from '@react-native-async-storage/async-storage';"] : []),
    ...(secret ? ["import * as SecureStore from 'expo-secure-store';"] : []),
  ];
  const parties = [imports.join('\n')];
  parties.push(`/** Un stockage qui lit et écrit du texte, plus tard (le téléphone répond sans bloquer). */
interface Stockage {
  lire(cle: string): Promise<string | null>;
  ecrire(cle: string, valeur: string): Promise<void>;
}

/**
 * La valeur commence à sa valeur de départ, puis prend celle qui était
 * gardée dès que le téléphone l'a lue ; chaque changement est gardé ensuite.
 */
function useGardee<T>(stockage: Stockage, cle: string, initiale: T): [T, (valeur: T) => void] {
  const [valeur, setValeurLue] = useState<T>(initiale);
  const lue = useRef(false);
  // Une valeur changée avant que le téléphone ait répondu l'emporte sur celle qui était gardée.
  const changee = useRef(false);
  const derniere = useRef(valeur);
  derniere.current = valeur;
  const setValeur = useCallback(
    (nouvelle: T) => {
      changee.current = true;
      derniere.current = nouvelle;
      // L'écriture part tout de suite ; avant que le téléphone ait répondu, sa réponse l'enverra.
      if (lue.current) {
        stockage.ecrire(cle, JSON.stringify(nouvelle)).catch(() => {
          // Stockage plein ou interdit : la valeur reste en mémoire.
        });
      }
      setValeurLue(nouvelle);
    },
    [stockage, cle],
  );

  useEffect(() => {
    let active = true;
    stockage
      .lire(cle)
      .then((gardee) => {
        if (active && gardee !== null && !changee.current) setValeurLue(JSON.parse(gardee) as T);
      })
      .catch(() => {
        // Rien de gardé, ou illisible : la valeur de départ reste.
      })
      .finally(() => {
        lue.current = true;
        if (active && changee.current) {
          stockage.ecrire(cle, JSON.stringify(derniere.current)).catch(() => {
            // Stockage plein ou interdit : la valeur reste en mémoire.
          });
        }
      });
    return () => {
      active = false;
    };
  }, [stockage, cle]);

  return [valeur, setValeur];
}`);
  if (memoire) {
    parties.push(`const telephone: Stockage = {
  lire: (cle) => AsyncStorage.getItem(cle),
  ecrire: (cle, valeur) => AsyncStorage.setItem(cle, valeur),
};

/** Une variable « memorisee » : gardée sur le téléphone, même après l'avoir fermé. */
export function useMemorise<T>(cle: string, initiale: T): [T, (valeur: T) => void] {
  return useGardee(telephone, cle, initiale);
}`);
  }
  if (secret) {
    parties.push(`// Le coffre n'accepte que lettres, chiffres, « . », « - » et « _ » dans ses clés.
const cleDuCoffre = (cle: string) => cle.replace(/[^\\w.-]/g, '_');

const coffre: Stockage = {
  lire: (cle) => SecureStore.getItemAsync(cleDuCoffre(cle)),
  ecrire: (cle, valeur) => SecureStore.setItemAsync(cleDuCoffre(cle), valeur),
};

/**
 * Une variable « memorisee en secret » : gardée dans le coffre du téléphone
 * (Keychain sur iPhone, Keystore sur Android), par expo-secure-store.
 */
export function useMemoriseSecret<T>(cle: string, initiale: T): [T, (valeur: T) => void] {
  return useGardee(coffre, cle, initiale);
}`);
  }
  return parties.join('\n\n') + '\n';
}

/** Les styles nommés en StyleSheet, en clair et en sombre (décision M3). */
/** Les déclarations d'un style écrit en Humalis, en style React Native. */
export function styleNatifDe(declarations: [string, string][]): string {
  const couleur = (v: string) => JSON.stringify(/var\(--[^,]+,\s*([^)]+)\)/.exec(v)?.[1]?.trim() ?? v);
  const points = (v: string) => v.split(/\s+/).map((x) => parseFloat(x));
  const cotes = (prefixe: string, v: string) => {
    const n = points(v);
    const [h, d, b, g] = n.length === 1 ? [n[0], n[0], n[0], n[0]] : n.length === 2 ? [n[0], n[1], n[0], n[1]] : n.length === 3 ? [n[0], n[1], n[2], n[1]] : n;
    return `${prefixe}Top: ${h}, ${prefixe}Right: ${d}, ${prefixe}Bottom: ${b}, ${prefixe}Left: ${g}`;
  };
  const morceaux = declarations.flatMap(([p, v]): string[] => {
    switch (p) {
      case 'background': return [`backgroundColor: ${couleur(v)}`];
      case 'color': return [`color: ${couleur(v)}`];
      case 'border': { const [e, , ...c] = v.split(' '); return [`borderWidth: ${parseFloat(e!)}`, `borderColor: ${couleur(c.join(' ') || '#000000')}`]; }
      case 'border-radius': return [`borderRadius: ${points(v)[0]}`];
      case 'padding': return [cotes('padding', v)];
      case 'margin': return [cotes('margin', v)];
      case 'font-size': return [`fontSize: ${points(v)[0]}`];
      case 'max-width': return [`maxWidth: ${points(v)[0]}`, "width: '100%'"];
      case 'font-weight': return ["fontWeight: '700'"];
      case 'text-align': return [`textAlign: ${JSON.stringify(v)}`];
      case 'box-shadow':
        return v === 'none' ? ['shadowOpacity: 0', 'elevation: 0'] : v.includes('32px') ? ["shadowColor: '#000000'", 'shadowOpacity: 0.14', 'shadowRadius: 16', 'shadowOffset: { width: 0, height: 8 }', 'elevation: 8'] : ["shadowColor: '#000000'", 'shadowOpacity: 0.08', 'shadowRadius: 6', 'shadowOffset: { width: 0, height: 2 }', 'elevation: 2'];
      default: return [];
    }
  });
  return `{ ${morceaux.join(', ')} }`;
}

/** Chaque élément qui porte un style écrit en Humalis reçoit une option « humalis » : elle devient un style nommé. */
function avecStylesHumalis(application: Application): Application {
  const noms = new Set((application.stylesHumalis ?? []).map((s) => s.nom));
  if (noms.size === 0) return application;
  const marquer = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(marquer);
    if (!v || typeof v !== 'object') return v;
    const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, marquer(x)])) as Record<string, unknown>;
    if (Array.isArray(o.classes) && Array.isArray(o.options)) {
      const siens = (o.classes as string[]).filter((c) => noms.has(c));
      if (siens.length) o.options = [...(o.options as unknown[]), ...siens.map((c) => ({ nom: 'humalis', valeur: c }))];
    }
    return o;
  };
  return { ...application, ecrans: marquer(application.ecrans) as Application['ecrans'], composants: marquer(application.composants) as Application['composants'], ...(application.disposition ? { disposition: marquer(application.disposition) as Application['disposition'] } : {}) };
}

function styles(formulaires = false, blocs = false, theme?: ThemeRI, codes: string[] = [], stylesHumalis: { nom: string; declarations: [string, string][] }[] = []): string {
  const TAILLES: Record<string, number> = { petite: 14, normale: 16, grande: 32, tres_grande: 48 };
  const POSITIONS: Record<string, [string, string]> = {
    gauche: ['left', 'flex-start'],
    centree: ['center', 'center'],
    droite: ['right', 'flex-end'],
  };
  const BORDURES: Record<string, number> = { arrondie: 999, carree: 0, douce: 8, ronde: 9999 };
  const ESPACES: Record<string, number> = { aucune: 0, petite: 8, moyenne: 16, grande: 32 };
  const ALIGNEMENTS: Record<string, string> = { debut: 'flex-start', centree: 'center', fin: 'flex-end', etire: 'stretch' };
  const REPARTITIONS: Record<string, string> = { debut: 'flex-start', centree: 'center', fin: 'flex-end', entre: 'space-between', autour: 'space-around' };
  const LARGEURS: Record<string, string> = {
    etroite: "width: '100%', maxWidth: 576, alignSelf: 'center'",
    normale: "width: '100%', maxWidth: 768, alignSelf: 'center'",
    large: "width: '100%', maxWidth: 1152, alignSelf: 'center'",
    pleine: "width: '100%'",
  };
  const OMBRES: Record<string, string> = {
    aucune: "shadowOpacity: 0, elevation: 0",
    legere: "shadowColor: '#000000', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2",
    moyenne: "shadowColor: '#000000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6",
    forte: "shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 32, shadowOffset: { width: 0, height: 12 }, elevation: 12",
  };

  const feuille = (mode: 'clair' | 'sombre') => {
    const page = mode === 'clair' ? '#ffffff' : '#141416';
    const encre = mode === 'clair' ? '#1d1d1f' : '#f2f2f4';
    const bleu = COULEURS_CSS.bleu[mode];
    const lignes = [
      `page: { flexGrow: 1, padding: 16, paddingBottom: 64, backgroundColor: '${page}' },`,
      `titre: { fontSize: 28, fontWeight: '700', color: '${encre}', marginVertical: 12 },`,
      `sousTitre: { fontSize: 22, fontWeight: '700', color: '${encre}', marginVertical: 10 },`,
      `texte: { fontSize: 16, lineHeight: 24, color: '${encre}', marginVertical: 6 },`,
      ...(codes.some((c) => c.includes('s.accent')) ? [theme?.couleurs.some((c) => c.nom === 'marque')
        ? `accent: { color: '${theme.couleurs.find((c) => c.nom === 'marque')![mode === 'clair' ? 'clair' : 'sombre']}' },`
        : `accent: { fontWeight: '700' },`] : []),
      `bouton: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 16, marginVertical: 4, borderWidth: 1, borderColor: '${encre}', borderRadius: 6 },`,
      `texteBouton: { fontSize: 16, color: '${encre}' },`,
      `lien: { alignSelf: 'flex-start', fontSize: 16, color: '${bleu}', marginVertical: 12, textDecorationLine: 'underline' },`,
      `image: { width: '100%', aspectRatio: 1, marginVertical: 8, objectFit: 'contain' },`,
      `champ: { marginVertical: 12, gap: 4 },`,
      `saisie: { fontSize: 16, padding: 8, borderWidth: 1, borderColor: '#8a8a90', borderRadius: 6, color: '${encre}' },`,
      // Les formulaires et leurs champs, seulement si une page en a.
      ...(formulaires
        ? [
            `formulaire: { marginVertical: 8 },`,
            `saisieLongue: { minHeight: 96 },`,
            `case: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 },`,
            `option: { paddingVertical: 6 },`,
          ]
        : []),
      // Les blocs de mise en page, seulement si une page en a. Une grille
      // tient sur une colonne : un téléphone est étroit.
      ...(blocs
        ? [
            `section: { marginVertical: 16 },`,
            `bloc: {},`,
            `ligne: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },`,
            `colonne: { gap: 12 },`,
            `grille: { gap: 16 },`,
            `menu: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },`,
            // « menu vertical » : une colonne ; « menu repliable » n'a pas de style propre sur le téléphone.
            `menuVertical: { flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'stretch' },`,
            `menuRepliable: {},`,
          ]
        : []),
    ];
    // Les styles écrits en Humalis (« style "carte" : »), pareils en clair et en sombre.
    for (const s of stylesHumalis) lignes.push(`${nomStyle({ nom: 'humalis', valeur: s.nom })}: ${styleNatifDe(s.declarations)},`);
    for (const [option, { valeurs }] of Object.entries(OPTIONS)) {
      for (const valeur of valeurs) {
        const nom = (o: string) => pascal(`${o}_${valeur}`).replace(/^./, (c) => c.toLowerCase());
        const couleur = COULEURS_CSS[valeur];
        if ((option === 'couleur' || option === 'texte') && couleur) lignes.push(`${nom(option)}: { color: '${couleur[mode]}' },`);
        if (option === 'fond' && couleur) {
          lignes.push(`${nom('fond')}: { backgroundColor: '${couleur[mode]}', borderColor: 'transparent' },`);
          lignes.push(`${nom('encre')}: { color: '${mode === 'clair' ? couleur.encreClair : couleur.encreSombre}' },`);
        }
        if (option === 'taille' && TAILLES[valeur]) lignes.push(`${nom('taille')}: { fontSize: ${TAILLES[valeur]} },`);
        if (option === 'position' && POSITIONS[valeur]) {
          const [texte, bloc] = POSITIONS[valeur];
          lignes.push(`${nom('position')}: { textAlign: '${texte}', alignSelf: '${bloc}' },`);
        }
        if (option === 'bordure' && BORDURES[valeur] !== undefined) lignes.push(`${nom('bordure')}: { borderRadius: ${BORDURES[valeur]} },`);
        if (option === 'espacement' && ESPACES[valeur] !== undefined) lignes.push(`${nom('espacement')}: { gap: ${ESPACES[valeur]} },`);
        if (option === 'remplissage' && ESPACES[valeur] !== undefined) lignes.push(`${nom('remplissage')}: { padding: ${ESPACES[valeur]} },`);
        if (option === 'alignement' && ALIGNEMENTS[valeur]) lignes.push(`${nom('alignement')}: { alignItems: '${ALIGNEMENTS[valeur]}' },`);
        if (option === 'repartition' && REPARTITIONS[valeur]) lignes.push(`${nom('repartition')}: { justifyContent: '${REPARTITIONS[valeur]}' },`);
        if (option === 'largeur' && LARGEURS[valeur]) lignes.push(`${nom('largeur')}: { ${LARGEURS[valeur]} },`);
        if (option === 'ombre' && OMBRES[valeur]) lignes.push(`${nom('ombre')}: { ${OMBRES[valeur]} },`);
        // Sur le téléphone, une grille tient sur une colonne : « colonnes » n'y change rien.
        if (option === 'colonnes') lignes.push(`${nom('colonnes')}: {},`);
      }
    }
    lignes.push(...stylesDesElements(codes, encre, bleu, COULEURS_CSS.rouge[mode], mode === 'clair' ? COULEURS_CSS.rouge.encreClair : COULEURS_CSS.rouge.encreSombre));
    // Les couleurs du thème du projet (bloc theme), qui redéfinissent au besoin les couleurs de base.
    for (const c of theme?.couleurs ?? []) {
      const nom = (o: string) => pascal(`${o}_${c.nom}`).replace(/^./, (x) => x.toLowerCase());
      const couleur = mode === 'clair' ? c.clair : c.sombre;
      lignes.push(`${nom('couleur')}: { color: '${couleur}' },`);
      lignes.push(`${nom('texte')}: { color: '${couleur}' },`);
      lignes.push(`${nom('fond')}: { backgroundColor: '${couleur}', borderColor: 'transparent' },`);
      lignes.push(`${nom('encre')}: { color: '${mode === 'clair' ? c.encreClair : c.encreSombre}' },`);
    }
    return lignes.map((l) => `  ${l}`).join('\n');
  };
  const couleurs = (mode: 'clair' | 'sombre') =>
    [
      `page: '${mode === 'clair' ? '#ffffff' : '#141416'}'`,
      `encre: '${mode === 'clair' ? '#1d1d1f' : '#f2f2f4'}'`,
      ...Object.entries(COULEURS_CSS).filter(([nom]) => !theme?.couleurs.some((c) => c.nom === nom)).map(([nom, v]) => `${nom}: '${v[mode]}'`),
      // L'encre posée sur les couleurs des messages (réussite, avertissement, erreur).
      ...['vert', 'orange', 'rouge'].map((nom) => `${nom}Encre: '${mode === 'clair' ? COULEURS_CSS[nom].encreClair : COULEURS_CSS[nom].encreSombre}'`),
      ...(theme?.couleurs ?? []).map((c) => `${c.nom}: '${mode === 'clair' ? c.clair : c.sombre}'`),
    ].join(', ');

  const modeFixe = modeParDefaut(theme);
  return `// Produit par Humalis : le jeu de styles nommés (couleur, fond, texte, taille, position, bordure).
import { useEffect, useState } from 'react';
import { ${modeFixe ? 'Appearance, ' : ''}Platform, StyleSheet, useColorScheme } from 'react-native';
${modeFixe ? `
// Le mode fixé par le bloc theme du projet : clair ou sombre, quel que soit le réglage du téléphone.
Appearance.setColorScheme('${modeFixe === 'clair' ? 'light' : 'dark'}');
` : ''}
const clair = StyleSheet.create({
${feuille('clair')}
});

const sombre = StyleSheet.create({
${feuille('sombre')}
});

const COULEURS = {
  clair: { ${couleurs('clair')} },
  sombre: { ${couleurs('sombre')} },
};

/**
 * Le thème du téléphone. Sur le web, la page arrive déjà écrite en clair
 * (export statique) : le thème du visiteur s'applique juste après.
 */
function useSombre(): boolean {
  const theme = useColorScheme();
  const [affichee, setAffichee] = useState(Platform.OS !== 'web');
  useEffect(() => setAffichee(true), []);
  return affichee && theme === 'dark';
}

/** Les styles des pages, selon le thème du téléphone (clair ou sombre). */
export function useStyles() {
  return useSombre() ? sombre : clair;
}

/** Les couleurs de base, pour la barre de navigation et les messages. */
export function useCouleurs() {
  return useSombre() ? COULEURS.sombre : COULEURS.clair;
}
`;
}

function lisezmoi(options: OptionsMobile, carte = false): string {
  return `# ${options.nom}

Application mobile (iPhone, Android) produite par Humalis depuis
\`${options.source}\`, avec Expo ${VERSIONS_MOBILE.expo.split('.')[0]} et expo-router.

\`\`\`sh
npm install
npx expo start    # puis « i » : simulateur iPhone (Mac + Xcode), « a » : Android, ou le code QR dans Expo Go
npm run web       # la même application dans le navigateur
npm run verifier  # vérification des types
\`\`\`

Chaque page Humalis est un fichier de \`app/\` (la page d'entrée est
\`app/index.tsx\`). Les styles nommés (\`avec fond vert\`…) sont dans
\`humalis/styles.ts\`, en clair et en sombre. Le CSS ne s'applique pas sur
le mobile.

L'adresse du serveur des requêtes se règle avec
\`EXPO_PUBLIC_HUMALIS_SERVEUR\` (par exemple \`http://192.168.1.20:3000\` :
un téléphone ne connaît pas \`localhost\` de ton ordinateur).
${carte ? `
## La carte

${PHRASE_CLE_GOOGLE.charAt(0).toUpperCase() + PHRASE_CLE_GOOGLE.slice(1)}
Humalis n'invente pas cette clé : \`app.json\` contient son emplacement, vide.
` : ''}
Ce dossier est réécrit à chaque compilation Humalis. Pour le reprendre à
la main, supprimez le fichier \`${MARQUE_MOBILE}\` : Humalis refusera alors de
l'écraser.
`;
}

/** « changer theme par sombre » sur le téléphone : le réglage de l'application, pour cette session. */
const THEME_MOBILE = `import { Appearance } from 'react-native';

export type Theme = 'clair' | 'sombre' | 'automatique' | 'bascule';

/** Change le thème de l'application (le choix n'est pas gardé après la fermeture). */
export function definirTheme(demande: Theme): void {
  // « basculer theme » : l'inverse du thème affiché.
  const theme = demande === 'bascule' ? (Appearance.getColorScheme() === 'dark' ? 'clair' : 'sombre') : demande;
  Appearance.setColorScheme(theme === 'clair' ? 'light' : theme === 'sombre' ? 'dark' : 'unspecified');
}
`;
