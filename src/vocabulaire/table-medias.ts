/**
 * Les mots des graphiques, des médias et du mouvement. Ils sont rangés dans leur
 * propre fichier et ajoutés à la fin de `VOCABULAIRE` (`table.ts`) : la
 * table reste la seule liste qui fait foi.
 *
 * Aucun n'est réservé : les options ne sont des mots-clés qu'après « avec »
 * ou « et », leurs valeurs juste après l'option, les éléments qu'en tête de
 * ligne.
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

/** Une option de mouvement : une classe CSS rangée dans « prefers-reduced-motion: no-preference ». */
function mouvement(mot: string, accentue: string | undefined, description: string, exemple: string, mobile: string | null, note?: string): EntreeVocabulaire {
  return {
    mot,
    ...(accentue ? { accentue } : {}),
    variantes: [],
    categorie: 'style',
    concept: `style.${mot}`,
    contextes: ['option'],
    cibles: ecran(`className="humalis-${mot}-…" (CSS dans @media (prefers-reduced-motion: no-preference))`, mobile, `class="humalis-${mot}-…"`),
    couvre: [`css:${mot}`, 'css:prefers-reduced-motion'],
    description,
    exemple,
    statut: 'supporte',
    etape: 10,
    ...(note ? { note } : {}),
  };
}

/** Une valeur d'une option de mouvement. */
function valeur(mot: string, valeurDe: readonly string[], description: string, exemple: string, variantes: readonly string[] = [], accentue?: string): EntreeVocabulaire {
  return {
    mot,
    ...(accentue ? { accentue } : {}),
    variantes,
    categorie: 'valeurStyle',
    concept: `valeurStyle.${mot}`,
    contextes: ['valeurStyle'],
    valeurDe,
    cibles: ecran(`className="humalis-${valeurDe[0]}-${mot}"`, `Animated (${valeurDe[0]} ${mot})`, `class="humalis-${valeurDe[0]}-${mot}"`),
    couvre: ['css'],
    description,
    exemple,
    statut: 'supporte',
    etape: 10,
  };
}

const ANIME = (options: string) => PAGE(`    titre "Le Fleuve" avec ${options}`);
const IMAGE = (options: string) => PAGE(`    image "salle.jpg" avec ${options}`);

/** Une option dont la valeur est libre (un texte, deux nombres, ou aucune), vérifiée avec l'élément. */
function reglage(mot: string, accentue: string | undefined, description: string, exemple: string, surElements: readonly string[], web: string, mobile: string, statique: string): EntreeVocabulaire {
  return {
    mot,
    ...(accentue ? { accentue } : {}),
    variantes: [],
    categorie: 'style',
    concept: `style.${mot}`,
    contextes: ['option'],
    cibles: ecran(web, mobile, statique),
    couvre: [],
    description,
    exemple,
    statut: 'supporte',
    etape: 10,
    surElements,
    valeurLibre: true,
  };
}

export const ENTREES_MEDIAS: readonly EntreeVocabulaire[] = [
  // ─── Le mouvement (plan, 4.6) ─────────────────────────────────────────
  mouvement(
    'animation',
    undefined,
    'Une animation d’entrée, jouée une fois quand l’élément apparaît : apparition, montee ou agrandissement. « au defilement » attend que l’élément entre à l’écran. Elle ne se joue jamais si l’appareil demande de réduire les animations.',
    ANIME('animation montee'),
    'Animated.View (opacité, déplacement, échelle), sauf si « réduire les animations » est demandé',
    'Aucune animation sans fin : seules les entrées existent. Sur le téléphone, « au defilement » se joue au premier affichage.',
  ),
  mouvement('duree', 'durée', 'La durée d’une animation : courte (150 ms), moyenne (300 ms, par défaut) ou longue (600 ms).', ANIME('animation apparition et duree longue'), 'la durée d’Animated.timing'),
  mouvement('delai', 'délai', 'L’attente avant qu’une animation commence, pour les échelonner : court (100 ms), moyen (250 ms) ou long (500 ms).', ANIME('animation montee et delai court'), 'le délai d’Animated.timing'),
  mouvement(
    'transition',
    undefined,
    'Adoucit les changements de couleur, de fond, de bordure, d’ombre ou de position quand l’état change (survol, variable) : « transition douce ».',
    PAGE('    bouton "Réserver" avec transition douce'),
    null,
    'Sans effet sur le téléphone (un avertissement le dit).',
  ),
  mouvement(
    'effet',
    undefined,
    'Une réaction au survol, au focus et à l’appui : « effet leve » soulève l’élément, « effet agrandi » le grossit un peu.',
    PAGE('    bloc avec effet leve et ombre legere :\n        texte "Poisson braisé"'),
    'l’état d’appui d’un Pressable',
  ),
  valeur('apparition', ['animation'], 'L’élément apparaît en fondu.', ANIME('animation apparition')),
  valeur('montee', ['animation'], 'L’élément apparaît en montant un peu.', ANIME('animation montee'), [], 'montée'),
  valeur('agrandissement', ['animation'], 'L’élément apparaît en grandissant un peu.', ANIME('animation agrandissement')),
  valeur('defilement', ['animation'], 'Après le nom de l’animation : « animation montee au defilement » la joue quand l’élément entre à l’écran.', ANIME('animation montee au defilement'), [], 'défilement'),
  valeur('courte', ['duree', 'delai'], 'Courte : 150 ms pour une durée, 100 ms pour un délai.', ANIME('animation apparition et duree courte'), ['court']),
  valeur('longue', ['duree', 'delai'], 'Longue : 600 ms pour une durée, 500 ms pour un délai.', ANIME('animation apparition et delai long'), ['long']),
  valeur('leve', ['effet'], 'L’élément se soulève au survol : un léger déplacement vers le haut et une ombre.', PAGE('    bouton "Voir" avec effet leve'), ['levee'], 'levé'),
  valeur('agrandi', ['effet'], 'L’élément grossit un peu au survol (de 3 %).', PAGE('    bouton "Voir" avec effet agrandi'), ['agrandie']),

  // ─── Les images (plan, 4.2) ───────────────────────────────────────────
  reglage(
    'prioritaire',
    undefined,
    'Une image vue dès l’ouverture de la page (la grande image du haut) : chargée tout de suite, avant les autres. Deux au plus par page.',
    IMAGE('description "La salle" et prioritaire'),
    ['image'],
    'fetchPriority="high", sans loading="lazy"',
    'priority="high" (expo-image)',
    'fetchpriority="high", sans loading="lazy"',
  ),
  reglage(
    'proportions',
    undefined,
    'Le rapport de la largeur à la hauteur : « proportions 4 sur 3 ». La place est réservée avant que l’image arrive, et la page ne saute pas. Utile pour une image qui vient d’une donnée, dont Humalis ne peut pas lire le fichier.',
    IMAGE('description "La salle" et proportions 16 sur 9'),
    ['image', 'graphique'],
    'style={{ aspectRatio: "4 / 3" }}',
    'style={{ aspectRatio: 4 / 3 }}',
    'style="aspect-ratio: 4 / 3"',
  ),
  optionImage(
    'ajustement',
    'Comment l’image remplit sa place quand ses proportions ne sont pas celles de la place : « remplir » (elle est rognée) ou « contenir » (elle est entière, avec des bords).',
    IMAGE('description "La salle" et proportions 1 sur 1 et ajustement remplir'),
  ),
  valeur('remplir', ['ajustement'], 'L’image remplit toute sa place, quitte à être rognée (object-fit: cover).', IMAGE('description "La salle" et ajustement remplir')),
  valeur('contenir', ['ajustement'], 'L’image est entière dans sa place, avec des bords si besoin (object-fit: contain).', IMAGE('description "La salle" et ajustement contenir')),

  // ─── L'audio (plan, 4.4) ──────────────────────────────────────────────
  {
    mot: 'audio',
    variantes: [],
    categorie: 'element',
    concept: 'element.audio',
    contextes: ['miseEnPage'],
    cibles: ecran('<audio controls preload="none" src aria-label> (jamais autoplay)', 'un lecteur fait de Pressable, avec expo-audio', '<audio controls preload="none" src aria-label>'),
    couvre: ['html:audio'],
    description:
      'Un lecteur de son avec ses commandes : « audio "extrait.mp3" avec description "Extrait de la chanson" ». La description est obligatoire : elle nomme le lecteur. Le son ne démarre jamais tout seul ; rien n’est téléchargé avant que la personne le lance. « et transcription "…" » ajoute le texte de ce qui est dit, sous le lecteur ; « et boucle » le relance à la fin.',
    exemple: PAGE('    audio "extrait.mp3" avec description "Extrait de la chanson Le Fleuve" et boucle'),
    statut: 'supporte',
    etape: 10,
    note: 'Pas de pilotage depuis la page (jouer, pause) pour l’instant.',
  },
  reglage(
    'transcription',
    undefined,
    'Le texte de ce qui est dit dans un son, affiché sous le lecteur dans un bloc « Lire la transcription » : « audio "entretien.mp3" avec description "Entretien" et transcription "Bonjour et bienvenue…" ».',
    PAGE('    audio "entretien.mp3" avec description "Entretien avec la cheffe" et transcription "Bonjour et bienvenue au Fleuve."'),
    ['audio'],
    '<details><summary>Lire la transcription</summary>…</details>',
    'un Text sous le lecteur',
    '<details><summary>Lire la transcription</summary>…</details>',
  ),
  reglage(
    'boucle',
    undefined,
    'Relance le son à la fin : « audio "ambiance.mp3" avec description "Ambiance de la salle" et boucle ».',
    PAGE('    audio "ambiance.mp3" avec description "Ambiance de la salle" et boucle'),
    ['audio'],
    'loop',
    'loop (expo-audio)',
    'loop',
  ),

  // ─── Choisir un fichier, l'envoyer (plan, 4.3) ───────────────────────
  {
    mot: 'fichier',
    variantes: [],
    categorie: 'element',
    concept: 'element.fichier',
    contextes: ['miseEnPage'],
    cibles: {
      web: t('<input type="file" accept="…"> masqué et un <label> qui l’ouvre ; aperçu par URL.createObjectURL'),
      mobile: null,
      desktop: { produit: '<input type="file"> comme le web', note: 'comme la cible web : Electron ouvre le sélecteur du système' },
      serveur: null,
      statique: null,
    },
    couvre: ['html:input-file'],
    description:
      'Le choix d’un fichier par la personne : « fichier "Choisir une photo" dans photo accepte images avec maximum 5 Mo ». La variable reçoit le fichier choisi (nom, taille, type, apercu) ou rien. Le type et la taille sont vérifiés tout de suite par confort ; le serveur revérifie toujours. « accepte » prend : images, audio, videos, pdf, documents (le SVG n’est pas une image acceptée). « plusieurs » donne une liste.',
    exemple: PAGE('    variable photo = rien\n    fichier "Choisir une photo" dans photo accepte images avec maximum 5 Mo'),
    statut: 'supporte',
    etape: 10,
    note: 'Web et bureau seulement pour l’instant : le mobile et le site statique le refusent à la compilation.',
  },
  {
    mot: 'accepte',
    variantes: [],
    categorie: 'option',
    concept: 'fichier.accepte',
    contextes: ['miseEnPage'],
    cibles: ecran('l’attribut accept de l’entrée de fichier', null, null),
    couvre: ['html:accept'],
    description: 'Après un choix de fichier, les sortes de fichier permises : images, audio, videos, pdf, documents (« accepte images ou pdf »). Sans « accepte », tout fichier est permis et le serveur doit vérifier.',
    exemple: PAGE('    variable photo = rien\n    fichier "Choisir" dans photo accepte images ou pdf'),
    statut: 'supporte',
    etape: 10,
  },
  {
    mot: 'suivi',
    variantes: [],
    categorie: 'structure',
    concept: 'fichier.suivi',
    contextes: ['source'],
    cibles: ecran('la progression de xhr.upload.onprogress, de 0 à 100', null, null),
    couvre: [],
    description: 'Dans « envoyer fichier … », la variable nombre qui reçoit la progression de l’envoi, de 0 à 100 : « suivi dans envoi ». Elle s’affiche avec « progression envoi ».',
    exemple:
      'source "boutique" :\n    adresse "https://api.exemple.cd"\n\npage "accueil" :\n    variable photo = rien\n    variable envoi = 0\n    fichier "Choisir" dans photo accepte images\n    bouton "Envoyer"\n    progression envoi\n    quand l\'utilisateur clique sur "Envoyer" :\n        envoyer fichier photo vers "photos" de la source "boutique" suivi dans envoi',
    statut: 'supporte',
    etape: 10,
  },
  {
    mot: 'brut',
    variantes: [],
    categorie: 'structure',
    concept: 'fichier.brut',
    contextes: ['source'],
    cibles: ecran('le fichier seul comme corps de la requête (Blob)', null, null),
    couvre: [],
    description: 'Dans « envoyer fichier … », « en corps brut » envoie le fichier seul, comme le veulent certaines API ; sans cela, un formulaire (multipart) est envoyé sous le nom « fichier », ou sous « sous le nom "photo" ».',
    exemple:
      'source "boutique" :\n    adresse "https://api.exemple.cd"\n\npage "accueil" :\n    variable photo = rien\n    fichier "Choisir" dans photo accepte images\n    bouton "Envoyer"\n    quand l\'utilisateur clique sur "Envoyer" :\n        envoyer fichier photo vers "photos" de la source "boutique" en corps brut',
    statut: 'supporte',
    etape: 10,
  },

  // ─── La carte (plan, 4.5) ─────────────────────────────────────────────
  {
    mot: 'carte',
    variantes: [],
    categorie: 'element',
    concept: 'element.carte',
    contextes: ['miseEnPage'],
    cibles: ecran(
      'le composant CarteLieux : une carte Leaflet 1.9.4 (tuiles OpenStreetMap) et, dessous, la liste des lieux',
      'MapView de react-native-maps (Apple Plans sur iPhone, Google Maps sur Android) et la liste des lieux',
      'une carte Leaflet 1.9.4 recopiée dans humalis/ (sans CDN) et la liste des lieux, déjà dans le HTML de départ',
    ),
    couvre: ['html:map'],
    description:
      'Une carte : « carte "Le restaurant Le Fleuve, avenue de la Gombe" avec latitude -4,3250 et longitude 15,3222 et zoom 15 », ou « carte "Nos agences" : » suivie de marqueurs, que la carte montre tous. Le texte est le nom de la carte pour les lecteurs d’écran. La liste des lieux (nom, adresse, lien OpenStreetMap) est toujours écrite sous la carte, lue par les lecteurs d’écran et présente sans JavaScript. Les tuiles viennent d’OpenStreetMap, attribution toujours affichée ; « avec tuiles "…" et attribution "…" » change de fournisseur. Chaque tuile demandée envoie l’adresse IP du visiteur au fournisseur : le compilateur le dit.',
    exemple: PAGE('    carte "Le restaurant Le Fleuve, avenue de la Gombe" avec latitude -4,3250 et longitude 15,3222 et zoom 15'),
    statut: 'supporte',
    etape: 10,
    note: 'Sur Android, la carte native demande une clé Google Maps dans app.json ; l’iPhone n’en a pas besoin. Pas de regroupement de marqueurs, d’itinéraires ni de hors ligne.',
  },
  {
    mot: 'marqueur',
    variantes: [],
    categorie: 'element',
    concept: 'element.marqueur',
    contextes: ['miseEnPage'],
    cibles: ecran('un repère Leaflet focalisable au clavier, avec une bulle (nom, adresse)', '<Marker coordinate title description> de react-native-maps', 'un repère Leaflet focalisable au clavier, avec une bulle (nom, adresse)'),
    couvre: [],
    description:
      'Un lieu de la carte : « marqueur "Gombe" avec adresse "12 avenue du Port" et latitude -4,3047 et longitude 15,3070 ». Le nom s’affiche dans une bulle au clic ou à Entrée ; l’adresse est facultative. Se place dans une carte, dans un « pour chaque » ou un « si » au besoin. Latitude entre -90 et 90, longitude entre -180 et 180.',
    exemple: PAGE('    carte "Nos agences" :\n        marqueur "Gombe" avec adresse "12 avenue du Port" et latitude -4,3047 et longitude 15,3070'),
    statut: 'supporte',
    etape: 10,
  },
  ...[
    ['latitude', 'Le nord ou le sud d’un lieu, de -90 à 90, en décimal avec une virgule : « latitude -4,3250 ». Va toujours avec « longitude ». La latitude se donne avant la longitude (OpenStreetMap et Google ne les donnent pas dans le même ordre : les mots évitent de les inverser).', 'avec latitude -4,3250 et longitude 15,3222'],
    ['longitude', 'L’est ou l’ouest d’un lieu, de -180 à 180 : « longitude 15,3222 ». Va toujours avec « latitude ».', 'avec latitude -4,3250 et longitude 15,3222'],
    ['zoom', 'Sur une carte, le niveau de zoom, un entier de 1 (le monde) à 18 (une rue) : « zoom 15 ». Sans centre, la carte s’ajuste à ses marqueurs.', 'avec latitude -4,3250 et longitude 15,3222 et zoom 12'],
    ['tuiles', 'Sur une carte, l’adresse du fournisseur de tuiles à la place d’OpenStreetMap : « tuiles "https://…/{z}/{x}/{y}.png" ». {z}, {x} et {y} sont le zoom et la case demandés. Demande « attribution ».', 'avec latitude -4,3250 et longitude 15,3222 et tuiles "https://tuiles.exemple.cd/{z}/{x}/{y}.png" et attribution "© Exemple"'],
    ['attribution', 'Sur une carte, le texte de crédit du fournisseur de tuiles, toujours affiché sur la carte : « attribution "© MapTiler" ». Obligatoire avec « tuiles ».', 'avec latitude -4,3250 et longitude 15,3222 et tuiles "https://tuiles.exemple.cd/{z}/{x}/{y}.png" et attribution "© Exemple"'],
  ].map(([mot, description, options]): EntreeVocabulaire => ({
    mot,
    variantes: [],
    categorie: 'option',
    concept: `carte.${mot}`,
    contextes: ['miseEnPage'],
    cibles: ecran(`un réglage de CarteLieux (${mot})`, `un réglage de MapView (${mot})`, `un réglage de la carte Leaflet (${mot})`),
    couvre: [],
    description,
    exemple: PAGE(`    carte "Le restaurant Le Fleuve" ${options}`),
    statut: 'supporte',
    etape: 10,
  })),
  {
    mot: 'adresse',
    variantes: [],
    categorie: 'option',
    concept: 'marqueur.adresse',
    contextes: ['miseEnPage'],
    cibles: ecran('l’adresse dans la bulle et dans la liste des lieux', 'la description du Marker', 'l’adresse dans la bulle et dans la liste des lieux'),
    couvre: [],
    description: 'Sur un marqueur, l’adresse écrite sous son nom, dans la bulle et dans la liste des lieux : « marqueur "Gombe" avec adresse "12 avenue du Port" et latitude … et longitude … ». Facultative.',
    exemple: PAGE('    carte "Nos agences" :\n        marqueur "Gombe" avec adresse "12 avenue du Port" et latitude -4,3047 et longitude 15,3070'),
    statut: 'supporte',
    etape: 10,
  },
  // ─── Les graphiques (plan, 4.1) ───────────────────────────────────────
  {
    mot: 'graphique',
    variantes: ['graphiques'],
    categorie: 'element',
    concept: 'element.graphique',
    contextes: ['miseEnPage'],
    cibles: ecran(
      '<figure> : un <svg role="img"> écrit par Humalis (sans bibliothèque), sa légende et la table « Voir les données »',
      'react-native-svg (déjà fourni par Expo), et « Voir les données »',
      'le SVG écrit dans le HTML de départ, redessiné par humalis/graphique.js',
    ),
    couvre: ['html:figure', 'html:svg', 'html:table', 'html:details', 'rn:react-native-svg'],
    description:
      'Un graphique en courbe, en barres ou en camembert, tiré d’une liste : « graphique en courbe ventes avec etiquette mois et valeur montant en FC et description "…" ». La description est obligatoire : elle dit ce que montre le graphique. La table des données est toujours écrite à côté.',
    exemple: GRAPHIQUE('graphique en courbe ventes avec etiquette mois et valeur montant en FC et description "Les ventes montent de janvier à mars."'),
    statut: 'supporte',
    etape: 10,
    note: 'Seulement en tête de ligne, suivi de « en … » : « variable graphique = 1 » reste permis.',
  },
  genreGraphique('courbe', 'Les valeurs reliées par une ligne, avec un repère par point : une évolution dans le temps.', ['courbes']),
  genreGraphique('barres', 'Une barre par valeur, depuis zéro : pour comparer des quantités.', ['barre']),
  genreGraphique('camembert', 'Un disque partagé en parts, chacune avec son pourcentage : la répartition d’un tout. Une seule série, aucune valeur négative.', ['camemberts']),
  {
    mot: 'serie',
    accentue: 'série',
    variantes: ['series'],
    categorie: 'element',
    concept: 'element.serie',
    contextes: ['miseEnPage'],
    cibles: ecran('une courbe ou un groupe de barres de plus, et une ligne de la légende', 'idem (react-native-svg)', 'idem (humalis/graphique.js)'),
    couvre: [],
    description: 'Dans un graphique en bloc, une série de valeurs : « serie "Ventes" valeur ventes en FC avec couleur bleu ». Chaque série a sa couleur et la forme de ses repères.',
    exemple: PAGE(
      '    variable mois = [fiche avec nom "Janvier" et ventes 120000 et achats 90000, fiche avec nom "Février" et ventes 180000 et achats 110000]\n' +
        '    graphique en barres mois avec etiquette nom et description "Les ventes dépassent toujours les achats." :\n' +
        '        serie "Ventes" valeur ventes en FC avec couleur bleu\n' +
        '        serie "Achats" valeur achats en FC avec couleur orange',
    ),
    statut: 'supporte',
    etape: 10,
    note: 'Seulement en tête de ligne dans un graphique, suivi de son nom entre guillemets : « variable serie = 2 » reste permis.',
  },
  optionGraphique('etiquette', 'étiquette', 'Le champ des libellés : les mois sous une courbe, les postes d’un camembert.', 'graphique en barres ventes avec etiquette mois et valeur montant et description "Ventes par mois."'),
  optionGraphique(
    'etiquettes',
    'étiquettes',
    'Les libellés d’une liste de nombres, une étiquette par nombre : « etiquettes ["Lun", "Mar"] ».',
    'graphique en barres [120, 180] avec etiquettes ["Lun", "Mar"] et description "Visites de lundi et mardi."',
  ),
  optionGraphique(
    'valeur',
    undefined,
    'Le champ des valeurs dessinées, un nombre ; « en FC », « en euros » ou « en dollars » les écrit comme de l’argent.',
    'graphique en courbe ventes avec etiquette mois et valeur montant en FC et description "Les ventes montent."',
  ),
];

/** Un programme où une liste de ventes est dessinée. */
function GRAPHIQUE(ligne: string): string {
  return PAGE(`    variable ventes = [fiche avec mois "Janvier" et montant 120000, fiche avec mois "Mars" et montant 150000]\n    ${ligne}`);
}

/** Un genre de graphique, écrit après « graphique en ». */
function genreGraphique(mot: string, description: string, variantes: readonly string[]): EntreeVocabulaire {
  return {
    mot,
    variantes,
    categorie: 'valeurStyle',
    concept: `graphique.${mot}`,
    contextes: ['miseEnPage'],
    valeurDe: ['graphique'],
    cibles: ecran(`<Graphique genre="${mot}">`, `<Graphique genre="${mot}"> (react-native-svg)`, `humalisGraphique.dessiner({ genre: '${mot}', … })`),
    couvre: [],
    description,
    exemple: GRAPHIQUE(`graphique en ${mot} ventes avec etiquette mois et valeur montant et description "Les ventes montent de janvier à mars."`),
    statut: 'supporte',
    etape: 10,
    note: 'Seulement après « graphique en ».',
  };
}

/** Une option d'un graphique (après « avec » ou « et » sur la ligne du graphique). */
function optionGraphique(mot: string, accentue: string | undefined, description: string, ligne: string): EntreeVocabulaire {
  return {
    mot,
    ...(accentue ? { accentue } : {}),
    variantes: [],
    categorie: 'option',
    concept: `option.${mot}`,
    contextes: ['option'],
    surElements: ['graphique'],
    cibles: ecran(`<Graphique ${mot}=…>`, `<Graphique ${mot}=…>`, `humalisGraphique.dessiner({ ${mot}: … })`),
    couvre: [],
    description,
    exemple: GRAPHIQUE(ligne),
    statut: 'supporte',
    etape: 10,
  };
}

/** « ajustement » : une option à valeurs (remplir, contenir), réservée aux images. */
function optionImage(mot: string, description: string, exemple: string): EntreeVocabulaire {
  return {
    mot,
    variantes: [],
    categorie: 'style',
    concept: `style.${mot}`,
    contextes: ['option'],
    cibles: ecran(`className="humalis-${mot}-…" (object-fit)`, 'contentFit (expo-image)', `class="humalis-${mot}-…"`),
    couvre: ['css:object-fit'],
    description,
    exemple,
    statut: 'supporte',
    etape: 10,
    surElements: ['image'],
  };
}
