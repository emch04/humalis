/**
 * Les messages des langues (bloc `langues :`, version `en anglais "…"`, bloc
 * `traductions`, `selecteur de langue`, `changer langue par …`), rangés à part et ajoutés
 * à la fin du catalogue (`erreurs.ts`). Comme partout : aucun message n'est
 * écrit ici, le site affiche celui que produit le compilateur.
 */
import type { EntreeErreur, GroupeErreur } from './erreurs';

const e = (
  id: string,
  groupe: GroupeErreur,
  titre: string,
  explication: string,
  correction: string,
  fautif: string,
  corrige: string,
  motif: string,
  options: { gravite?: 'erreur' | 'avertissement'; sites?: number; atteignable?: boolean } = {},
): EntreeErreur => ({
  id, groupe, titre, explication, correction, fautif, corrige, motif,
  gravite: options.gravite ?? 'erreur',
  sites: options.sites ?? 1,
  atteignable: options.atteignable ?? true,
});

/** Retire le premier saut de ligne : on écrit les programmes à partir de la ligne suivante. */
const p = (texte: string): string => texte.replace(/^\n/, '').replace(/\n\s*$/, '');

/** Le bloc des deux langues, en haut du fichier. */
const LANGUES = 'langues :\n    francais\n    anglais\n';

export const ENTREES_ERREURS_LANGUES: readonly EntreeErreur[] = [
  // --- Le bloc « langues » ---
  e('langues-deux-blocs', 'grammaire', 'Deux blocs « langues »',
    'Les langues du site se déclarent une seule fois, en haut du fichier : la première est celle des textes écrits.',
    'Garde un seul bloc « langues » et mets-y toutes les langues, une par ligne.',
    p(`
${LANGUES}
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    'un seul bloc « langues »'),
  e('langues-apres-les-pages', 'grammaire', 'Le bloc « langues » après les pages',
    'Humalis doit connaître les langues avant de lire les textes des pages : le bloc s’écrit tout en haut.',
    'Déplace le bloc « langues » au début du fichier.',
    p(`
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"

${LANGUES}
`),
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    'le bloc « langues » s\'écrit en haut du fichier'),
  e('langues-ligne-invalide', 'grammaire', 'Une langue entre guillemets',
    'Chaque ligne du bloc « langues » est le nom d’une langue, écrit comme un mot du langage : francais, anglais.',
    'Retire les guillemets autour du nom de la langue.',
    p(`
langues :
    "francais"
    anglais

page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    'une ligne du bloc « langues » est le nom d\'une langue'),
  e('langue-inconnue', 'sens', 'Une langue que Humalis ne connaît pas',
    'Humalis connaît le nom de quelques langues ; un mot mal écrit n’en fait pas partie.',
    'Corrige le nom de la langue (le message propose le plus proche).',
    p(`
langues :
    francais
    anglai

page "accueil" :
    titre "Bienvenue"
`),
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    'n\'est pas une langue connue de Humalis', { sites: 2 }),
  e('langue-pas-disponible', 'sens', 'Une langue pas encore disponible',
    'Pour l’instant, Humalis traduit ses propres messages en français et en anglais. L’espagnol, le portugais, le swahili et le lingala sont prévus.',
    'Garde le français et l’anglais pour le moment.',
    p(`
langues :
    francais
    espagnol

page "accueil" :
    titre "Bienvenue"
`),
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    'n\'est pas encore disponible'),
  e('langue-en-double', 'sens', 'Une langue écrite deux fois',
    'Chaque langue n’apparaît qu’une fois dans le bloc « langues ».',
    'Retire la ligne en double.',
    p(`
langues :
    francais
    anglais
    anglais

page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    'est déjà dans le bloc « langues »'),
  e('langues-vide', 'sens', 'Un bloc « langues » vide',
    'Le bloc « langues » annonce les langues du site : sans aucune, il ne dit rien.',
    'Écris les langues en dessous, décalées, une par ligne : la première est celle des textes.',
    p(`
langues :

page "accueil" :
    titre "Bienvenue"
`),
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    'le bloc « langues » est vide'),

  // --- Les versions écrites à côté ---
  e('version-sans-langues', 'sens', 'Une version sans bloc « langues »',
    'Une version « en anglais "…" » ne sert que si le site déclare ses langues : Humalis doit savoir laquelle est celle des textes écrits.',
    'Ajoute le bloc « langues : » en haut du fichier, avec francais puis anglais.',
    p(`
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    'mais le fichier ne déclare pas ses langues'),
  e('version-langue-non-declaree', 'sens', 'Une version dans une langue non déclarée',
    'Une version n’est écrite que pour une langue du bloc « langues ».',
    'Ajoute la langue au bloc, ou retire cette version.',
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome" en espagnol "Bienvenido"
`),
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    'n\'est pas dans le bloc « langues »'),
  e('version-langue-de-base', 'sens', 'Une version dans la langue des textes',
    'La première langue du bloc « langues » est celle des textes écrits tels quels : une version dans cette langue ferait double emploi.',
    'Écris la version dans une autre langue du bloc, par exemple « en anglais ».',
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en francais "Salut" en anglais "Welcome"
`),
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    'la version à ajouter est celle d\'une autre langue'),
  e('version-en-double', 'sens', 'Deux versions de la même langue',
    'Un texte a au plus une version dans chaque langue : Humalis ne saurait pas laquelle montrer.',
    'Garde une seule version anglaise.',
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome" en anglais "Hello"
`),
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    'pour le même texte'),
  e('version-variable-oubliee', 'avertissement', 'Une version qui oublie une valeur',
    'Le texte de base montre une valeur entre accolades ; sa version ne la montre pas, donc la personne qui lit dans l’autre langue ne la voit pas.',
    'Ajoute la même valeur entre accolades dans la version.',
    p(`
${LANGUES}
page "panier" :
    titre "Le panier" en anglais "The cart"
    variable total = 3
    texte "Total : {total}" en anglais "Total"
`),
    p(`
${LANGUES}
page "panier" :
    titre "Le panier" en anglais "The cart"
    variable total = 3
    texte "Total : {total}" en anglais "Total: {total}"
`),
    'n\'utilise pas {total}', { gravite: 'avertissement' }),
  e('version-dans-un-choix', 'sens', 'Une version dans les valeurs d’un choix',
    'Les valeurs d’un choix ou d’une liste déroulante partent au serveur telles qu’elles sont écrites : si elles changeaient avec la langue, le serveur recevrait tantôt l’une, tantôt l’autre.',
    'Retire la version de la valeur ; traduis seulement le libellé du champ.',
    p(`
${LANGUES}
page "commande" :
    titre "Commander" en anglais "Order"
    choix "Taille" en anglais "Size" parmi ["Petit" en anglais "Small", "Grand"]
`),
    p(`
${LANGUES}
page "commande" :
    titre "Commander" en anglais "Order"
    choix "Taille" en anglais "Size" parmi ["S", "M", "L"]
`),
    'la valeur d\'un choix est envoyée au serveur'),
  e('texte-sans-version', 'avertissement', 'Un texte sans version',
    'Le site déclare plusieurs langues, mais ce texte n’existe que dans la première : la personne qui lit dans une autre langue le verra tel quel.',
    'Écris sa version à côté (« en anglais "…" ») ou dans un bloc « traductions anglais : ». Avant une mise en ligne, « humalis compile --exigeant » refuse les textes oubliés.',
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue"
`),
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    'n\'a pas de version anglaise', { gravite: 'avertissement' }),

  // --- Le bloc « traductions » ---
  e('traductions-sans-langues', 'sens', 'Un bloc « traductions » sans bloc « langues »',
    'Les traductions rangées dans un bloc demandent, comme les versions écrites à côté, de savoir quelles sont les langues du site.',
    'Ajoute le bloc « langues : » en haut du fichier.',
    p(`
traductions anglais :
    "Bienvenue" : "Welcome"

page "accueil" :
    titre "Bienvenue"
`),
    p(`
${LANGUES}
traductions anglais :
    "Bienvenue" : "Welcome"

page "accueil" :
    titre "Bienvenue"
`),
    'le bloc « traductions » demande d\'abord un bloc « langues : »'),
  e('traduction-en-double', 'sens', 'Une traduction donnée deux fois',
    'Chaque texte a au plus une version par langue dans le bloc « traductions ».',
    'Garde une seule ligne pour ce texte.',
    p(`
${LANGUES}
traductions anglais :
    "Bienvenue" : "Welcome"
    "Bienvenue" : "Hello"

page "accueil" :
    titre "Bienvenue"
`),
    p(`
${LANGUES}
traductions anglais :
    "Bienvenue" : "Welcome"

page "accueil" :
    titre "Bienvenue"
`),
    'a déjà une version anglaise dans ce bloc'),
  e('traduction-inutilisee', 'avertissement', 'Une traduction qui ne sert à rien',
    'Une ligne du bloc « traductions » vise un texte écrit exactement de la même façon dans le programme. Aucun texte ne correspond : c’est souvent une faute de frappe.',
    'Corrige le texte de la ligne (le message propose le plus proche), ou retire la ligne.',
    p(`
${LANGUES}
traductions anglais :
    "Bienvenu" : "Welcome"

page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
`),
    p(`
${LANGUES}
traductions anglais :
    "Bienvenue" : "Welcome"

page "accueil" :
    titre "Bienvenue"
`),
    'cette traduction ne sert à rien', { gravite: 'avertissement' }),

  // --- Choisir la langue ---
  e('selecteur-sans-langues', 'sens', '« selecteur de langue » sans bloc « langues »',
    'Le sélecteur montre les langues du site : il faut d’abord les déclarer.',
    'Ajoute le bloc « langues : » en haut du fichier.',
    p(`
page "accueil" :
    selecteur de langue
    titre "Bienvenue"
`),
    p(`
${LANGUES}
page "accueil" :
    selecteur de langue
    titre "Bienvenue" en anglais "Welcome"
`),
    '« selecteur de langue » demande un bloc « langues : »'),
  e('changer-langue-inconnue', 'sens', '« changer langue par » une langue non déclarée',
    '« langue » est la langue choisie par la personne : elle ne peut prendre que l’une des langues du bloc « langues ».',
    'Écris l’une des langues déclarées, sans guillemets.',
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
    bouton "Español" en anglais "Español"
    quand l'utilisateur clique sur "Español" :
        changer langue par espagnol
`),
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
    bouton "English" en anglais "English"
    quand l'utilisateur clique sur "English" :
        changer langue par anglais
`),
    'attend une langue du bloc « langues »'),
  e('variable-langue', 'sens', 'Une variable qui s’appelle « langue »',
    'Avec un bloc « langues », « langue » est la langue choisie par la personne (« si langue est anglais »). Une variable du même nom la cacherait.',
    'Donne un autre nom à la variable, par exemple « langue_du_livre ».',
    p(`
${LANGUES}
page "livre" :
    titre "Le livre" en anglais "The book"
    variable langue = "lingala"
`),
    p(`
${LANGUES}
page "livre" :
    titre "Le livre" en anglais "The book"
    variable langue_du_livre = "lingala"
`),
    '« langue » est la langue choisie par la personne (« si langue est anglais »'),
  e('langue-sans-bloc', 'sens', '« langue » sans bloc « langues »',
    '« langue » et les noms des langues (anglais, francais) ne sont des valeurs connues que si le fichier déclare ses langues.',
    'Ajoute le bloc « langues : » en haut du fichier.',
    p(`
page "accueil" :
    titre "Bienvenue"
    bouton "English"
    quand l'utilisateur clique sur "English" :
        changer langue par anglais
`),
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
    bouton "English" en anglais "English"
    quand l'utilisateur clique sur "English" :
        changer langue par anglais
`),
    'déclarez d\'abord les langues en haut du fichier'),
  e('texte-simple-avec-variable', 'sens', 'Une variable dans un texte qui n’en accepte pas',
    'L’indice d’un champ, le nom d’une série de graphique, le nom et la description du site sont des textes écrits tels quels : ils ne lisent pas les variables de la page. Leur version dans une autre langue non plus.',
    'Retire les accolades de la version : écris le texte entier, sans « {…} ».',
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
    champ texte "Nom" en anglais "Name" avec indice "Votre nom" en anglais "Your {nom}"
`),
    p(`
${LANGUES}
page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
    champ texte "Nom" en anglais "Name" avec indice "Votre nom" en anglais "Your name"
`),
    'n\'accepte pas de « {variable} »'),
];
