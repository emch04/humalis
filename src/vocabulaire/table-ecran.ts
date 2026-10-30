/**
 * Les mots de la mise en page et des éléments d'écran. Ils sont rangés
 * dans leur propre fichier et ajoutés à la fin de `VOCABULAIRE`
 * (`table.ts`) : la table reste la seule liste qui fait foi.
 *
 * Les helpers sont locaux : `table.ts` importe ce fichier, il ne peut
 * donc pas l'importer en retour.
 */
import type { Cible, EntreeVocabulaire, Traduction } from './types.js';

const t = (produit: string): Traduction => ({ produit });

/** Un mot d'écran : web, mobile et statique ; le bureau reprend le web. */
function ecran(web: string, mobile: string | null, statique: string | null): Readonly<Record<Cible, Traduction | null>> {
  return {
    web: t(web),
    mobile: mobile === null ? null : t(mobile),
    desktop: { produit: web, note: 'comme la cible web : Electron affiche la page web' },
    serveur: null,
    statique: statique === null ? null : t(statique),
  };
}

const PAGE = (corps: string) => `page "accueil" :\n${corps}`;

/** Une option de style (« avec espacement grande ») : classe CSS sur le web, StyleSheet sur le mobile. */
function style(
  mot: string,
  description: string,
  exemple: string,
  css: string,
  mobile: string | null,
  surElements?: readonly string[],
  note?: string,
): EntreeVocabulaire {
  return {
    mot,
    variantes: [],
    categorie: 'style',
    concept: `style.${mot}`,
    contextes: ['option'],
    cibles: ecran(`className="humalis-${mot}-…" (${css})`, mobile, `class="humalis-${mot}-…"`),
    couvre: [`css:${css.split(':')[0]}`],
    description,
    exemple,
    statut: 'supporte',
    etape: 9,
    ...(surElements ? { surElements } : {}),
    ...(note ? { note } : {}),
  };
}

/** Une valeur d'une ou plusieurs options de style. */
function valeur(
  mot: string,
  valeurDe: readonly string[],
  description: string,
  exemple: string,
  variantes: readonly string[] = [],
  accentue?: string,
): EntreeVocabulaire {
  return {
    mot,
    ...(accentue ? { accentue } : {}),
    variantes,
    categorie: 'valeurStyle',
    concept: `valeurStyle.${/^\d/.test(mot) ? `n${mot}` : mot}`,
    contextes: ['valeurStyle'],
    valeurDe,
    cibles: ecran(`className="humalis-${valeurDe[0]}-${mot}"`, `StyleSheet (${valeurDe[0]} ${mot})`, `class="humalis-${valeurDe[0]}-${mot}"`),
    couvre: ['css'],
    description,
    exemple,
    statut: 'supporte',
    etape: 9,
  };
}


/** Un élément d'une ligne (icone, badge…) : reconnu en tête de ligne, jamais réservé. */
function elementEcran(e: {
  mot: string;
  accentue?: string;
  variantes?: readonly string[];
  description: string;
  exemple: string;
  web: string;
  mobile: string;
  statique: string;
  couvre: readonly string[];
  note?: string;
}): EntreeVocabulaire {
  return {
    mot: e.mot,
    ...(e.accentue ? { accentue: e.accentue } : {}),
    variantes: e.variantes ?? [],
    categorie: 'element',
    concept: `element.${e.mot}`,
    contextes: ['miseEnPage'],
    cibles: ecran(e.web, e.mobile, e.statique),
    couvre: e.couvre,
    description: e.description,
    exemple: e.exemple,
    statut: 'supporte',
    etape: 9,
    ...(e.note ? { note: e.note } : {}),
  };
}

/** Un bloc d'éléments d'écran (onglets, accordéon…) : reconnu en tête de ligne, suivi de « : », de « avec » ou de son titre. */
const blocEcran = elementEcran;

/** Une option des éléments d'écran : sa valeur est libre, vérifiée avec l'élément. */
function optionEcran(mot: string, description: string, exemple: string, surElements: readonly string[]): EntreeVocabulaire {
  return {
    mot,
    variantes: [],
    categorie: 'style',
    concept: `style.${mot}`,
    contextes: ['option'],
    cibles: ecran(`réglage « ${mot} » de l’élément`, `réglage « ${mot} » de l’élément`, `réglage « ${mot} » de l’élément`),
    couvre: [],
    description,
    exemple,
    statut: 'supporte',
    etape: 9,
    surElements,
    valeurLibre: true,
  };
}

const BLOCS = ['section', 'bloc', 'ligne', 'colonne', 'grille'] as const;
const FLEX = ['ligne', 'colonne', 'grille'] as const;

const GRILLE = (options: string) => PAGE(`    grille avec ${options} :\n        texte "a"\n        texte "b"`);
const LIGNE = (options: string) => PAGE(`    ligne avec ${options} :\n        bouton "Oui"\n        bouton "Non"`);

export const ENTREES_ECRAN: readonly EntreeVocabulaire[] = [
  // ─── Les réglages des blocs (plan, 4.1) ──────────────────────────────
  style('colonnes', 'Le nombre de colonnes d’une grille sur un ordinateur (1 à 6) : une seule sur un téléphone, deux au plus sur une tablette.', GRILLE('colonnes 3'), 'grid-template-columns', "grille à largeur calculée (flexWrap)", ['grille']),
  style('espacement', 'L’espace entre les éléments d’une ligne, d’une colonne ou d’une grille : aucune, petite, moyenne ou grande.', LIGNE('espacement grande'), 'gap', 'StyleSheet gap', FLEX),
  style('remplissage', 'L’espace à l’intérieur d’un bloc, entre son bord et son contenu : aucune, petite, moyenne ou grande.', PAGE('    bloc avec remplissage moyenne :\n        texte "Poisson braisé"'), 'padding', 'StyleSheet padding', BLOCS),
  style('alignement', 'L’alignement des éléments d’une ligne ou d’une colonne en travers de son sens : debut, centre, fin ou etire.', LIGNE('alignement centre'), 'align-items', 'StyleSheet alignItems', FLEX),
  style('repartition', 'La répartition des éléments dans le sens de la ligne ou de la colonne : debut, centre, fin, entre (écartés) ou autour.', LIGNE('repartition entre'), 'justify-content', 'StyleSheet justifyContent', FLEX),
  style('largeur', 'La largeur maximale d’un bloc, centré dans la page : etroite, normale, large ou pleine.', PAGE('    section "Notre histoire" avec largeur etroite :\n        texte "Depuis 1998"'), 'max-width', 'StyleSheet maxWidth', BLOCS),
  // ─── Ombres, dégradés, élément collé (plan, 4.4 et 4.5) ──────────────
  style('ombre', 'Une ombre sous l’élément : aucune, legere, moyenne ou forte.', PAGE('    bloc avec ombre legere :\n        texte "Poisson braisé"'), 'box-shadow', 'StyleSheet shadow* et elevation'),
  style('degrade', 'Un fond en dégradé entre deux couleurs : « degrade bleu vers violet », puis au besoin vertical ou horizontal (diagonal sinon).', PAGE('    bloc avec degrade bleu vers violet :\n        titre "Réservez" avec texte blanc'), 'linear-gradient', 'LinearGradient (expo-linear-gradient)', undefined, 'Deux couleurs seulement (de base ou du thème) ; un dégradé plus fin s’écrit en CSS.'),
  style('colle', 'L’élément reste collé en haut de l’écran quand on défile ; « colle en bas » le colle en bas.', PAGE('    bloc avec colle :\n        texte "Toujours visible"'), 'position: sticky', null, undefined, 'Sur le téléphone, seuls l’en-tête et le pied de page restent collés ; ailleurs, un avertissement le dit.'),
  // ─── Défilement et hauteur (plan, apparence sans CSS) ────────────────
  style('defilement', 'Le bloc défile seul, avec sa propre barre, sans faire bouger le reste de la page : « defilement interne ».', PAGE('    ligne avec hauteur ecran :\n        colonne avec defilement interne :\n            texte "Un long chapitre."'), 'overflow-y: auto', null, [...BLOCS, 'menu'], 'Sur le téléphone, toute la page défile : un avertissement le dit.'),
  style('hauteur', 'Le bloc prend toute la hauteur de l’écran, sous l’en-tête : « hauteur ecran ».', PAGE('    ligne avec hauteur ecran :\n        colonne avec defilement interne :\n            texte "Un long chapitre."'), 'height: 100dvh', null, BLOCS, 'Sur le téléphone, toute la page défile : un avertissement le dit.'),
  { ...style('fixe', 'L’en-tête ne bouge jamais : seule la zone en dessous défile, avec sa barre (« entete avec fixe : »).', 'entete avec fixe :\n    lien "Accueil" vers "accueil"\n\npage "accueil" :\n    titre "Accueil"', 'position: fixed', null, ['entete'], 'Seulement sur l’en-tête. Sur le téléphone, l’en-tête reste en haut comme avec « colle ».'), valeurLibre: true },
  style('sur', 'Dans un bloc « sur telephone : », les appareils où le contenu s’affiche.', PAGE('    sur telephone :\n        texte "Petit écran"'), 'display', 'SurAppareil (largeur de la fenêtre)', ['appareil']),

  // ─── La publication (plan 2026-10-30-qualite-publication, parties 3 à 5) ──
  {
    mot: 'site',
    variantes: [],
    categorie: 'structure',
    concept: 'structure.site',
    contextes: ['declaration'],
    cibles: ecran(
      'index.html : icône, og:site_name, manifeste ; public/robots.txt ; plan du site par le prérendu',
      'app.json : le nom de l’application, et son icône (un PNG)',
      'le <head> de chaque page, robots.txt et sitemap.xml',
    ),
    couvre: ['html:link-icon', 'html:meta-og', 'robots.txt', 'sitemap.xml', 'webmanifest'],
    description:
      'Le bloc « site : » en haut du fichier, c’est « je publie » : le nom du site (ajouté au titre de chaque page), sa description, son image de partage, son logo (l’icône) et son adresse publique. Il produit les balises d’aperçu, robots.txt et le plan du site. « indexation non » ferme le site aux moteurs de recherche.',
    exemple: 'site :\n    nom "Le Fleuve"\n    logo "./logo.svg"\n    adresse "https://lefleuve.cd"\n\npage "accueil" :\n    titre "Bienvenue"\n    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."',
    statut: 'supporte',
    etape: 9,
    note: 'Sans bloc « site », rien ne change. L’option --adresse de la commande remplace l’adresse écrite.',
  },
  {
    mot: 'apercu',
    accentue: 'aperçu',
    variantes: [],
    categorie: 'structure',
    concept: 'structure.apercu',
    contextes: ['declaration'],
    cibles: ecran(
      'usePage(titre, description, { adresse, image, noindex }) : les balises, enregistrées par le prérendu',
      null,
      'les balises dans le <head> de la page',
    ),
    couvre: ['html:title', 'html:meta-description', 'html:meta-og', 'html:link-canonical', 'html:meta-robots'],
    description:
      'Le bloc « apercu : » dans une page donne ce que montrent l’onglet, les moteurs de recherche et les réseaux sociaux : « titre », « description », « image », et « indexation non » pour cacher la page. Sans lui, le premier titre et le premier texte de la page servent.',
    exemple: 'page "accueil" :\n    apercu :\n        titre "Le Fleuve, restaurant à Kinshasa"\n        description "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."\n    titre "Bienvenue"',
    statut: 'supporte',
    etape: 9,
    note: 'Un aperçu calculé (« {plat.nom} ») s’affiche dans l’onglet, mais les réseaux sociaux, qui ne lisent pas le JavaScript, montrent celui du site.',
  },
  // ─── Le thème du projet (plan, 4.3) ───────────────────────────────────
  {
    mot: 'theme',
    accentue: 'thème',
    variantes: [],
    categorie: 'structure',
    concept: 'structure.theme',
    contextes: ['declaration'],
    cibles: ecran(
      'variables CSS --humalis-… dans :root, claires et sombres, et data-theme',
      'theme.ts : les couleurs claires et sombres (StyleSheet)',
      'les mêmes variables CSS que le web',
    ),
    couvre: ['css:custom-properties', 'css:prefers-color-scheme'],
    description:
      'Le bloc « theme : » en haut du fichier donne au projet ses couleurs (« couleur marque clair "#0e5a6b" sombre "#5fc3d6" »), ses polices, son mode (clair, sombre ou automatique) et la largeur de ses pages. Une couleur du thème s’emploie comme une couleur de base : « avec fond marque ». « changer theme par sombre » laisse le visiteur choisir.',
    exemple: 'theme :\n    couleur marque clair "#0e5a6b" sombre "#5fc3d6"\n    mode automatique\n\npage "accueil" :\n    titre "Bienvenue" avec couleur marque\n    bouton "Mode sombre"\n    quand l\'utilisateur clique sur "Mode sombre" :\n        changer theme par sombre',
    statut: 'supporte',
    etape: 9,
    note: 'Les couleurs s’écrivent entre guillemets ("#0e5a6b"). Sur le téléphone, le choix du thème vaut pour la session seulement.',
  },
  {
    mot: 'police',
    variantes: ['polices'],
    categorie: 'structure',
    concept: 'structure.police',
    contextes: ['declaration'],
    cibles: ecran('@font-face (fichier recopié dans le CSS) et font-family', 'pas encore chargée : la police du système est utilisée', '@font-face et font-family'),
    couvre: ['css:font-family', 'css:@font-face'],
    description:
      'Dans le bloc « theme : », une police pour les titres, le texte ou le code : « police titres "Playfair Display" depuis "./playfair.woff2" ». Sans « depuis », le nom est utilisé tel quel avec la police du système en secours ; Humalis n’appelle aucun service de polices en ligne.',
    exemple: 'theme :\n    police texte "Georgia"\n\npage "accueil" :\n    titre "Bienvenue"',
    statut: 'supporte',
    etape: 9,
  },
  {
    mot: 'mode',
    variantes: [],
    categorie: 'structure',
    concept: 'structure.mode',
    contextes: ['declaration'],
    cibles: ecran('data-theme sur <html> (clair ou sombre)', 'Appearance.setColorScheme', 'data-theme sur <html>'),
    couvre: ['css:color-scheme'],
    description: 'Dans le bloc « theme : », le mode du projet : « mode clair », « mode sombre », ou « mode automatique » (le choix de l’appareil, par défaut).',
    exemple: 'theme :\n    mode sombre\n\npage "accueil" :\n    titre "Bienvenue"',
    statut: 'supporte',
    etape: 9,
  },

  // ─── L'en-tête et le pied communs (plan, 4.6) ─────────────────────────
  {
    mot: 'entete',
    accentue: 'en-tête',
    variantes: [],
    categorie: 'structure',
    concept: 'structure.entete',
    contextes: ['declaration'],
    cibles: ecran(
      '<header className="humalis-entete"> monté une fois dans Disposition.tsx, autour des routes',
      'au-dessus de la pile d’expo-router (app/_layout.tsx)',
      '<header> recopié dans chaque page',
    ),
    couvre: ['html:header'],
    description:
      'Le bloc « entete : » en haut du fichier : une barre commune à toutes les pages (le nom du site, le menu). Il accepte « avec colle » pour rester en haut quand on défile. Une page peut s’en passer : « page "connexion" sans entete : ».',
    exemple: 'entete avec colle :\n    ligne :\n        lien "Accueil" vers "accueil"\n\npage "accueil" :\n    titre "Bienvenue"',
    statut: 'supporte',
    etape: 9,
    note: 'Un seul en-tête par application. Sur le site statique, chaque page le recopie : son état repart de zéro d’une page à l’autre.',
  },
  {
    mot: 'pied',
    variantes: [],
    categorie: 'structure',
    concept: 'structure.pied',
    contextes: ['declaration'],
    cibles: ecran('<footer className="humalis-pied"> monté une fois dans Disposition.tsx', 'sous la pile d’expo-router (app/_layout.tsx)', '<footer> recopié dans chaque page'),
    couvre: ['html:footer'],
    description: 'Le bloc « pied : » en haut du fichier : le bas de page commun à toutes les pages (adresse, mentions). Une page peut s’en passer : « page "connexion" sans pied : ».',
    exemple: 'pied :\n    texte "Ouvert de mardi à dimanche"\n\npage "accueil" :\n    titre "Bienvenue"',
    statut: 'supporte',
    etape: 9,
  },
  {
    mot: 'sans',
    variantes: [],
    categorie: 'structure',
    concept: 'structure.sans',
    contextes: ['declaration'],
    cibles: ecran('la page est hors de la disposition commune', 'la page n’est pas dans SANS_ENTETE / SANS_PIED du layout', 'la page ne reçoit ni l’en-tête ni le pied'),
    couvre: [],
    description: 'Après le nom d’une page, « sans entete » ou « sans pied » (ou les deux, avec « et ») : la page se passe de l’en-tête et du pied communs.',
    exemple: 'entete :\n    lien "Accueil" vers "accueil"\n\npage "accueil" :\n    titre "Bienvenue"\n\npage "connexion" sans entete :\n    titre "Connexion"',
    statut: 'supporte',
    etape: 9,
  },

  // ─── Les éléments d'écran (plan, chapitre 5) ──────────────────────────
  elementEcran({
    mot: 'icone',
    accentue: 'icône',
    description: 'Une icône, un dessin vectoriel qui suit la couleur du texte (jamais un émoji) : « icone "panier" ». Sur un bouton ou un lien : « avec icone "panier" ».',
    exemple: PAGE('    icone "panier" avec taille grande et description "Panier"\n    bouton "Ajouter" avec icone "plus"'),
    web: '<ShoppingCart aria-hidden="true" /> (lucide-react)',
    mobile: '<ShoppingCart /> (lucide-react-native)',
    statique: '<svg class="humalis-icone" …> en ligne',
    couvre: ['html:svg', 'lucide'],
    note: 'Les noms sont français, d’une liste fermée (« panier », « maison », « recherche »…) ; un nom inconnu propose le plus proche.',
  }),
  elementEcran({
    mot: 'badge',
    description: 'Une petite étiquette : un mot court ou un nombre, qui se met en valeur (« Nouveau », le nombre d’articles du panier).',
    exemple: PAGE('    variable panier = ["Livre"]\n    badge nombre de panier avec fond rouge\n    badge "Nouveau" avec fond vert'),
    web: '<span className="humalis-badge">',
    mobile: '<View><Text>',
    statique: '<span class="humalis-badge">',
    couvre: ['css:badge'],
  }),
  elementEcran({
    mot: 'avatar',
    description: 'Le visage d’une personne : sa photo (« avec photo "camille.jpg" ») ou, sans photo, ses initiales sur un fond de couleur.',
    exemple: PAGE('    avatar "Camille Martin"\n    avatar "Le Fleuve" avec photo "logo.png" et taille grande'),
    web: '<span role="img" aria-label="…"> avec <img> ou les initiales',
    mobile: '<View> avec <Image> ou <Text>',
    statique: '<span class="humalis-avatar" role="img">',
    couvre: ['css:avatar'],
  }),
  elementEcran({
    mot: 'progression',
    description: 'Une barre de progression : « progression 40 » (sur 100), « progression 3 avec maximum 5 ». « progression rien » est une barre qui avance sans fin.',
    exemple: PAGE('    variable envoi = 40\n    progression envoi avec maximum 100 et pourcentage'),
    web: '<progress value max>',
    mobile: '<View> (fond et remplissage) avec accessibilityRole="progressbar"',
    statique: '<progress value max>',
    couvre: ['html:progress', 'html:meter'],
  }),
  elementEcran({
    mot: 'chargement',
    description: 'Un indicateur de chargement qui tourne, avec un texte si on en écrit un : « chargement "Chargement des plats…" ».',
    exemple: PAGE('    variable en_cours = vrai\n    si en_cours est vrai :\n        chargement "Chargement des plats…"'),
    web: '<span role="status" className="humalis-chargement">',
    mobile: '<ActivityIndicator>',
    statique: '<span role="status" class="humalis-chargement">',
    couvre: ['css:spinner', 'rn:ActivityIndicator'],
    note: 'Il ne s’allume pas seul pendant une requête : on l’affiche avec un « si ».',
  }),
  elementEcran({
    mot: 'etoiles',
    accentue: 'étoiles',
    description: 'Une note en étoiles, avec les demi-étoiles : « etoiles plat.note ». Avec « modifiable », on clique sur une étoile pour changer la variable.',
    exemple: PAGE('    variable note = 3\n    etoiles note avec modifiable\n    etoiles 4 avec description "Note : 4 sur 5"'),
    web: '<span role="img"> ou role="radiogroup" de boutons, avec les icônes Star',
    mobile: '<View> de <Pressable> avec les icônes Star',
    statique: '<span role="img"> ou boutons',
    couvre: ['css:rating'],
  }),
  elementEcran({
    mot: 'compteur',
    description: 'Un compteur « – 1 + » lié à une variable nombre : les boutons la changent, avec « minimum » et « maximum » pour borner : « compteur quantite avec minimum 1 ».',
    exemple: PAGE('    variable quantite = 1\n    calcul total = quantite * 28000\n    compteur quantite avec minimum 1 et maximum 10 et description "Quantité"\n    texte "Total : {total} FC"'),
    web: '<div role="group"> de deux <button> et d’un <output>',
    mobile: '<View> de deux <Pressable> et d’un <Text>',
    statique: '<div role="group"> de deux <button> et d’un <output>',
    couvre: ['html:input-number', 'css:stepper'],
  }),
  {
    mot: 'code qr',
    accentue: 'code QR',
    variantes: ['codeqr'],
    categorie: 'element',
    concept: 'element.codeQr',
    contextes: ['miseEnPage'],
    cibles: ecran('<QRCodeSVG value="…" /> (qrcode.react)', '<QRCode value="…" /> (react-native-qrcode-svg)', 'un SVG dessiné par le script (qrcode-generator)'),
    couvre: ['qr'],
    description: 'Un code QR qui contient un texte ou une adresse : « code qr "https://lefleuve.cd" ». Toujours noir sur blanc, même en mode sombre, pour rester lisible.',
    exemple: PAGE('    code qr "https://lefleuve.cd/reservation/42" avec taille grande et description "Votre billet"'),
    statut: 'supporte',
    etape: 9,
    note: 'S’écrit en deux mots : « code » seul reste un nom de variable possible.',
  },
  blocEcran({
    mot: 'onglets',
    description: 'Des onglets : un seul contenu est visible à la fois. « onglets : » contient des « onglet "Titre" : » ; le premier est ouvert au départ.',
    exemple: PAGE('    onglets :\n        onglet "Description" :\n            texte "Poisson braisé"\n        onglet "Avis" avec ouvert :\n            texte "Excellent"'),
    web: '<div role="tablist"> de <button role="tab"> et des <div role="tabpanel">',
    mobile: 'une barre de <Pressable> et le panneau ouvert',
    statique: 'le même HTML que le web',
    couvre: ['aria:tablist'],
  }),
  blocEcran({
    mot: 'onglet',
    description: 'Un onglet d’un bloc « onglets » : « onglet "Avis" : », avec son contenu en dessous. « avec icone "etoile" » met une icône dans son titre.',
    exemple: PAGE('    onglets :\n        onglet "Description" avec icone "document" :\n            texte "Poisson braisé"\n        onglet "Avis" :\n            texte "Excellent"'),
    web: '<button role="tab"> et <div role="tabpanel">',
    mobile: '<Pressable> et sa vue',
    statique: '<button role="tab"> et <div role="tabpanel">',
    couvre: ['aria:tab', 'aria:tabpanel'],
  }),
  blocEcran({
    mot: 'deroulant',
    accentue: 'déroulant',
    variantes: ['deroulants'],
    description: 'Un bloc qu’on déplie en cliquant sur son titre : « deroulant "Voir les détails" : ». « avec ouvert » le montre déplié au départ.',
    exemple: PAGE('    deroulant "Voir les détails" :\n        texte "Poisson braisé, riz, banane plantain"'),
    web: '<button aria-expanded> et la zone dépliée (hidden)',
    mobile: '<Pressable accessibilityState={{ expanded }}> et la zone',
    statique: '<button aria-expanded> et la zone dépliée (hidden)',
    couvre: ['html:details', 'html:summary'],
  }),
  blocEcran({
    mot: 'accordeon',
    accentue: 'accordéon',
    description: 'Un groupe de « deroulant » dont un seul est ouvert à la fois. « accordeon avec plusieurs : » les laisse tous s’ouvrir.',
    exemple: PAGE('    accordeon :\n        deroulant "Annulation" :\n            texte "Jusqu’à 24 heures avant."\n        deroulant "Paiement" :\n            texte "Sur place."'),
    web: '<div className="humalis-accordeon"> de zones dépliables',
    mobile: '<View> de zones dépliables',
    statique: '<div class="humalis-accordeon">',
    couvre: ['aria:accordion'],
  }),
  blocEcran({
    mot: 'carrousel',
    description: 'Des diapositives qu’on fait défiler (flèches, points, doigt) : chaque élément de « carrousel : » est une diapositive, aussi ceux d’un « pour chaque ». « avec automatique 5 » les fait défiler seules, « avec visibles 2 » en montre deux à la fois.',
    exemple: PAGE('    carrousel avec visibles 1 :\n        image "salle.jpg" avec description "La salle du restaurant"\n        image "terrasse.jpg" avec description "La terrasse au bord du fleuve"'),
    web: '<section aria-roledescription="carrousel"> à défilement accroché (scroll-snap)',
    mobile: '<ScrollView horizontal pagingEnabled>',
    statique: '<section aria-roledescription="carrousel"> à défilement accroché',
    couvre: ['css:scroll-snap', 'aria:carousel'],
  }),
  {
    mot: 'fil ariane',
    accentue: 'fil d’Ariane',
    variantes: ['filariane'],
    categorie: 'element',
    concept: 'element.filAriane',
    contextes: ['miseEnPage'],
    cibles: ecran('<nav aria-label="Fil d’Ariane"><ol>', '<View> de liens séparés', '<nav aria-label="Fil d’Ariane"><ol>'),
    couvre: ['aria:breadcrumb'],
    description: 'Le chemin qui mène à la page : des liens, puis le texte de la page en cours. S’écrit « fil d’Ariane : ».',
    exemple: 'page "carte" :\n    texte "La carte"\n\npage "plat" :\n    fil d\'Ariane :\n        lien "Accueil" vers "carte"\n        lien "La carte" vers "carte"\n        texte "Poisson braisé"',
    statut: 'supporte',
    etape: 9,
    note: 'S’écrit en deux mots : « fil » seul reste un nom de variable possible.',
  },

  // ─── Les options des éléments d'écran ───────────────────────────────
  optionEcran('icone', 'Une icône avant le texte d’un bouton, d’un lien, d’un titre ou d’un onglet : « avec icone "panier" ».', PAGE('    bouton "Ajouter" avec icone "panier"'), ['bouton', 'lien', 'titre', 'texte', 'onglet']),
  optionEcran('description', 'Le texte lu par un lecteur d’écran quand l’élément n’a pas de texte visible : « avec description "Panier" ».', PAGE('    icone "panier" avec description "Panier"'), ['icone', 'avatar', 'progression', 'etoiles', 'compteur', 'qr', 'chargement', 'badge', 'image', 'audio']),
  optionEcran('decoratif', 'Une image purement décorative, ignorée par le lecteur d’écran : « avec decoratif ».', PAGE('    titre "Accueil"\n    image "filet.png" avec decoratif'), ['image', 'icone']),
  optionEcran('niveau', 'Le niveau d’un sous-titre, de 2 à 6 : « avec niveau 3 ».', PAGE('    titre "Accueil"\n    soustitre "Détails" avec niveau 3'), ['soustitre']),
  optionEcran('photo', 'L’image d’un avatar : « avec photo "camille.jpg" », ou « avec photo "{p.photo}" » pour une image qui vient d’une donnée.', PAGE('    avatar "Camille Martin" avec photo "camille.jpg"'), ['avatar']),
  optionEcran('modifiable', 'Des étoiles sur lesquelles on clique pour changer la variable : « etoiles note avec modifiable ».', PAGE('    variable note = 3\n    etoiles note avec modifiable'), ['etoiles']),
  optionEcran('ouvert', 'Un onglet ou un deroulant ouvert au départ : « deroulant "Détails" avec ouvert : ».', PAGE('    deroulant "Détails" avec ouvert :\n        texte "a"'), ['onglet', 'deroulant']),
  optionEcran('plusieurs', 'Un accordéon dont plusieurs deroulant peuvent être ouverts en même temps.', PAGE('    accordeon avec plusieurs :\n        deroulant "A" :\n            texte "a"\n        deroulant "B" :\n            texte "b"'), ['accordeon']),
  optionEcran('automatique', 'Un carrousel qui défile seul toutes les n secondes (5 par défaut) : « avec automatique 5 ». Il s’arrête sous la souris et si l’appareil demande moins de mouvement.', PAGE('    carrousel avec automatique 8 :\n        image "a.jpg" avec description "Première photo"\n        image "b.jpg" avec description "Deuxième photo"'), ['carrousel']),
  optionEcran('visibles', 'Le nombre de diapositives montrées à la fois par un carrousel, de 1 à 4 (une seule sur un téléphone).', PAGE('    carrousel avec visibles 2 :\n        image "a.jpg" avec description "Première photo"\n        image "b.jpg" avec description "Deuxième photo"'), ['carrousel']),
  optionEcran('pourcentage', 'Une progression qui écrit son pourcentage à côté de la barre : « 40 % ».', PAGE('    progression 40 avec pourcentage'), ['progression']),

  // ─── Les valeurs ─────────────────────────────────────────────────────
  ...[1, 2, 3, 4, 5, 6].map((n) => valeur(String(n), ['colonnes'], `${n} colonne${n > 1 ? 's' : ''} sur un ordinateur.`, GRILLE(`colonnes ${n}`))),
  valeur('aucune', ['espacement', 'remplissage', 'ombre'], 'Aucun espace (ou aucune ombre).', LIGNE('espacement aucune'), ['aucun']),
  valeur('moyenne', ['espacement', 'remplissage', 'ombre', 'duree', 'delai'], 'Un espace moyen (ou une ombre moyenne, une durée de 300 ms, un délai de 250 ms).', LIGNE('espacement moyenne'), ['moyen']),
  valeur('debut', ['alignement', 'repartition'], 'Au début de la ligne ou de la colonne.', LIGNE('alignement debut'), [], 'début'),
  valeur('fin', ['alignement', 'repartition'], 'À la fin de la ligne ou de la colonne.', LIGNE('alignement fin')),
  valeur('etire', ['alignement'], 'Les éléments prennent toute la place en travers.', LIGNE('alignement etire'), ['etiree'], 'étiré'),
  valeur('entre', ['repartition'], 'Les éléments sont écartés : le premier au début, le dernier à la fin.', LIGNE('repartition entre')),
  valeur('autour', ['repartition'], 'Les éléments sont répartis avec le même espace autour de chacun.', LIGNE('repartition autour')),
  valeur('etroite', ['largeur'], 'Une largeur étroite, pour un texte à lire (36 rem au plus).', PAGE('    bloc avec largeur etroite :\n        texte "a"'), ['etroit'], 'étroite'),
  valeur('large', ['largeur'], 'Une largeur large (72 rem au plus).', PAGE('    bloc avec largeur large :\n        texte "a"')),
  valeur('pleine', ['largeur'], 'Toute la largeur de la page.', PAGE('    bloc avec largeur pleine :\n        texte "a"'), ['plein']),
  valeur('legere', ['ombre'], 'Une ombre légère.', PAGE('    bloc avec ombre legere :\n        texte "a"'), ['leger'], 'légère'),
  valeur('forte', ['ombre'], 'Une ombre marquée.', PAGE('    bloc avec ombre forte :\n        texte "a"'), ['fort']),
  valeur('douce', ['bordure', 'transition'], 'Des coins légèrement arrondis ; pour une transition, des changements adoucis (200 ms).', PAGE('    bloc avec bordure douce :\n        texte "a"'), ['doux']),
  valeur('ronde', ['bordure'], 'Une forme ronde : un cercle pour un élément carré.', PAGE('    bloc avec bordure ronde :\n        texte "a"'), ['rond']),
  valeur('interne', ['defilement'], 'Le bloc a son propre défilement : « defilement interne ».', PAGE('    colonne avec defilement interne :\n        texte "a"')),
  valeur('ecran', ['hauteur'], 'La hauteur de l’écran, moins celle de l’en-tête : « hauteur ecran ».', PAGE('    ligne avec hauteur ecran :\n        texte "a"'), [], 'écran'),
  valeur('haut', ['colle'], 'Collé en haut de l’écran (par défaut).', PAGE('    bloc avec colle :\n        texte "a"')),
  valeur('bas', ['colle'], 'Collé en bas de l’écran : « colle en bas ».', PAGE('    bloc avec colle en bas :\n        texte "a"')),
  valeur('telephone', ['sur'], 'Un écran de moins de 640 pixels de large.', PAGE('    sur telephone :\n        texte "a"'), ['telephones'], 'téléphone'),
  valeur('tablette', ['sur'], 'Un écran de 640 à 1023 pixels de large.', PAGE('    sur tablette :\n        texte "a"'), ['tablettes']),
  valeur('ordinateur', ['sur'], 'Un écran de 1024 pixels de large ou plus.', PAGE('    sur ordinateur :\n        texte "a"'), ['ordinateurs']),
];
