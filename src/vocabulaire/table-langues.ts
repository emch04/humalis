/**
 * Les mots des langues (plan 2026-10-30-qualite-publication, partie 1,
 * décisions Q1 à Q6) : le bloc « langues : », la version « en anglais "…" »,
 * le bloc « traductions », le sélecteur, la valeur intégrée « langue » et les
 * noms des langues. Aucun n'est réservé : chacun ne compte qu'à sa place.
 */
import type { Cible, EntreeVocabulaire, Traduction } from './types.js';

const t = (produit: string, note?: string): Traduction => (note ? { produit, note } : { produit });

/** Les traductions d'une idée d'écran : le bureau comme le web, pas de serveur. */
function ecran(web: string, mobile: string | null, statique: string | null): Readonly<Record<Cible, Traduction | null>> {
  return {
    web: t(web),
    mobile: mobile === null ? null : t(mobile),
    desktop: { produit: web, note: 'comme la cible web : Electron affiche la page web' },
    serveur: null,
    statique: statique === null ? null : t(statique),
  };
}

/** Le bloc des deux langues, en tête des exemples. */
const LANGUES = 'langues :\n    francais\n    anglais\n\n';

/** Le nom d'une langue : disponible (français, anglais) ou prévue (Q6). */
function langue(mot: string, accentue: string | undefined, code: string, nom: string, disponible: boolean): EntreeVocabulaire {
  return {
    mot,
    ...(accentue ? { accentue } : {}),
    variantes: [],
    categorie: 'valeur',
    concept: `langue.${code}`,
    contextes: ['tournure'],
    cibles: ecran(`'${code}' (t({ ${code}: '…' }), <html lang="${code}">)`, `'${code}' (expo-localization)`, `'${code}'`),
    couvre: [`bcp47:${code}`],
    description: disponible
      ? `Le ${nom}, une langue du site : une ligne du bloc « langues », une version « en ${mot} "…" », ou une valeur (« changer langue par ${mot} »).`
      : `Le ${nom} : une langue prévue. Pour l’instant, Humalis traduit ses propres messages en français et en anglais seulement.`,
    exemple: disponible
      ? `${LANGUES}page "accueil" :\n    titre "Bienvenue" en anglais "Welcome"`
      : `langues :\n    francais\n    ${mot}\n\npage "accueil" :\n    titre "Bienvenue"`,
    statut: disponible ? 'supporte' : 'prevu',
    etape: disponible ? 9 : 10,
    ...(disponible ? {} : { note: 'Le compilateur répond « pas encore disponible ».' }),
  };
}

export const ENTREES_LANGUES: readonly EntreeVocabulaire[] = [
  {
    mot: 'langues',
    variantes: [],
    categorie: 'structure',
    concept: 'structure.langues',
    contextes: ['declaration'],
    cibles: ecran(
      'src/humalis/langue.tsx : LANGUES, t(), useLangue(), <html lang>',
      'humalis/langue.tsx : la langue du téléphone par expo-localization, le choix gardé par AsyncStorage',
      'humalis.js : t(), langue(), changerLangue() ; le HTML de départ dans la première langue',
    ),
    couvre: ['html:lang', 'i18n', 'navigator.languages', 'expo-localization'],
    description:
      'Le bloc « langues : » en haut du fichier déclare les langues du site, une par ligne. La première est celle des textes écrits tels quels ; les autres s’ajoutent après un texte (« en anglais "…" ») ou dans un bloc « traductions ». La personne voit d’abord la langue de son navigateur (ou de son téléphone), si le site la parle.',
    exemple: `${LANGUES}page "accueil" :\n    selecteur de langue\n    titre "Bienvenue" en anglais "Welcome"`,
    statut: 'supporte',
    etape: 9,
    note: 'Sans bloc « langues », rien ne change. Le prérendu est fait dans la première langue ; une adresse par langue viendra plus tard.',
  },
  {
    mot: 'en',
    variantes: [],
    categorie: 'option',
    concept: 'langue.version',
    contextes: ['tournure'],
    cibles: ecran("t({ fr: 'Bienvenue', en: 'Welcome' })", "t({ fr: 'Bienvenue', en: 'Welcome' })", "t({ fr: 'Bienvenue', en: 'Welcome' }) dans le script"),
    couvre: ['i18n:message'],
    description:
      'Après un texte, « en anglais "…" » donne sa version dans une autre langue du bloc « langues » : « titre "Bienvenue" en anglais "Welcome" ». Cela marche partout où un texte s’écrit : titre, texte, bouton, lien, libellé de champ ou de fichier, « afficher », valeur d’une variable, aperçu, et les textes des options : « avec description "…" » (image, son, icône, graphique…), « et transcription "…" », « serie "Ventes" », les « etiquettes [...] » d’un graphique, « avec indice "…" » d’un champ, le « nom » et la « description » du bloc « site ». Le nom d’un fichier son ou image ne se traduit jamais.',
    exemple: `${LANGUES}page "accueil" :\n    titre "Bienvenue" en anglais "Welcome"\n    bouton "Ajouter" en anglais "Add" avec fond vert`,
    statut: 'supporte',
    etape: 9,
    note: 'Les valeurs d’un choix partent au serveur telles qu’elles sont écrites : elles ne se traduisent pas.',
  },
  {
    mot: 'traductions',
    variantes: [],
    categorie: 'structure',
    concept: 'structure.traductions',
    contextes: ['declaration'],
    cibles: ecran("les mêmes t({ fr: '…', en: '…' }) que les versions écrites à côté", "les mêmes t({ fr: '…', en: '…' })", "les mêmes t({ fr: '…', en: '…' })"),
    couvre: ['i18n:catalogue'],
    description:
      'Le bloc « traductions anglais : » range les versions en un seul endroit : une ligne « "texte" : "version" » par texte. Partout où ce texte exact s’écrit, sa version anglaise est montrée. Une version écrite à côté du texte passe avant celle du bloc.',
    exemple: `${LANGUES}traductions anglais :\n    "Voir le catalogue" : "See the catalogue"\n\npage "accueil" :\n    titre "Bienvenue" en anglais "Welcome"\n    bouton "Voir le catalogue"`,
    statut: 'supporte',
    etape: 9,
    note: 'Une ligne qui ne correspond à aucun texte du programme est signalée (faute de frappe ?).',
  },
  {
    mot: 'selecteur',
    accentue: 'sélecteur',
    variantes: [],
    categorie: 'element',
    concept: 'element.selecteurLangue',
    contextes: ['miseEnPage'],
    cibles: ecran(
      '<select> : chaque langue écrite dans sa langue, avec lang="…" (SelecteurLangue)',
      'des boutons radio, un par langue (SelecteurLangue)',
      '<select> redessiné par humalis.js',
    ),
    couvre: ['html:select', 'html:option[lang]'],
    description:
      '« selecteur de langue » montre les langues du site, chacune écrite dans sa propre langue (« Français », « English »), l’actuelle choisie. Le choix de la personne est gardé par son navigateur (ou son téléphone).',
    exemple: `${LANGUES}page "accueil" :\n    selecteur de langue\n    titre "Bienvenue" en anglais "Welcome"`,
    statut: 'supporte',
    etape: 9,
    note: 'Le mot n’est un élément qu’en tête de ligne, suivi de « de langue » ; ailleurs, « selecteur » reste un nom libre.',
  },
  {
    mot: 'langue',
    variantes: [],
    categorie: 'valeur',
    concept: 'langue.courante',
    contextes: ['tournure'],
    cibles: ecran('const { langue, changerLangue } = useLangue()', 'const { langue, changerLangue } = useLangue()', 'langue(), changerLangue() (humalis.js)'),
    couvre: ['html:lang', 'localStorage'],
    description:
      'Avec un bloc « langues », « langue » est la langue choisie par la personne : « si langue est anglais : » la lit, « changer langue par anglais » la change (et le choix est gardé). Une variable ne peut alors pas s’appeler « langue ».',
    exemple: `${LANGUES}page "accueil" :\n    titre "Bienvenue" en anglais "Welcome"\n    bouton "English" en anglais "Français"\n    quand l'utilisateur clique sur "English" :\n        si langue est anglais :\n            changer langue par francais\n        sinon :\n            changer langue par anglais`,
    statut: 'supporte',
    etape: 9,
    note: 'Sans bloc « langues », « langue » reste un nom libre.',
  },
  langue('francais', 'français', 'fr', 'français', true),
  langue('anglais', undefined, 'en', 'anglais', true),
  langue('espagnol', undefined, 'es', 'espagnol', false),
  langue('portugais', undefined, 'pt', 'portugais', false),
  langue('swahili', undefined, 'sw', 'swahili', false),
  langue('lingala', undefined, 'ln', 'lingala', false),
];
