/**
 * Les mots des interactions :
 * messages, minuteries, copier et partager, recherche pendant la frappe,
 * raccourcis, fenêtres et confirmations, défilement infini, glisser-déposer.
 *
 * Aucun n'est un mot réservé ni un mot-clé du lexer : ils ont le contexte
 * « interaction » (ou « option » après « avec »), et le parser les reconnaît
 * à leur place (`estLeMot`). Ailleurs, ce sont des noms libres : « variable
 * copier = 1 » garde son sens.
 *
 * Les helpers sont locaux : `table.ts` importe ce fichier, il ne peut donc
 * pas l'importer en retour.
 */
import type { Cible, EntreeVocabulaire, Traduction } from './types.js';

const t = (produit: string): Traduction => ({ produit });

/** Un mot d'écran : web, mobile et statique ; le bureau reprend le web ; pas de serveur. */
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
/** Un bouton et son clic, avec `lignes` (déjà indentées de 8 espaces) dans l'événement. */
const AU_CLIC = (lignes: string, avant = '') => PAGE(`${avant}    bouton "Enregistrer"\n    quand l'utilisateur clique sur "Enregistrer" :\n${lignes}`);

/** Un mot des interactions, pris en charge. */
function mot(entree: Omit<EntreeVocabulaire, 'variantes' | 'contextes' | 'statut' | 'etape'> & { variantes?: readonly string[]; contextes?: EntreeVocabulaire['contextes'] }): EntreeVocabulaire {
  return { variantes: [], contextes: ['interaction'], statut: 'supporte', etape: 9, ...entree };
}

export const ENTREES_INTERACTIONS: EntreeVocabulaire[] = [
  // ─── Les messages ────────────────────────────────────────────────────
  mot({
    mot: 'reussite',
    accentue: 'réussite',
    categorie: 'action',
    concept: 'action.afficherReussite',
    cibles: ecran('afficherMessage(…, \'reussite\') (role="status", 4 secondes)', 'afficherMessage(…, \'reussite\')', "afficherMessage(…, 'reussite')"),
    couvre: ['aria:status'],
    description: 'Dans « afficher reussite "…" », un message qui dit que tout s’est bien passé (classe humalis-message-reussite).',
    exemple: AU_CLIC('        afficher reussite "Enregistré"'),
  }),
  mot({
    mot: 'avertissement',
    categorie: 'action',
    concept: 'action.afficherAvertissement',
    cibles: ecran('afficherMessage(…, \'avertissement\') (role="status", 8 secondes)', 'afficherMessage(…, \'avertissement\')', "afficherMessage(…, 'avertissement')"),
    couvre: ['aria:status'],
    description: 'Dans « afficher avertissement "…" », un message qui prévient d’un souci sans gravité. Il reste 8 secondes.',
    exemple: AU_CLIC('        afficher avertissement "Connexion lente"'),
  }),
  mot({
    mot: 'pendant',
    categorie: 'action',
    concept: 'action.dureeMessage',
    cibles: ecran('afficherMessage(…, { duree })', 'afficherMessage(…, { duree })', 'afficherMessage(…, { duree })'),
    couvre: [],
    description: 'Après le texte d’un message : combien de temps il reste affiché, de 1 à 60 secondes (« afficher "Brouillon sauvegardé" pendant 10 secondes »).',
    exemple: AU_CLIC('        afficher "Brouillon sauvegardé" pendant 10 secondes'),
  }),
  mot({
    mot: 'disparaitre',
    accentue: 'disparaître',
    categorie: 'action',
    concept: 'action.messagePersistant',
    cibles: ecran('afficherMessage(…, { persistant: true })', 'afficherMessage(…, { persistant: true })', 'afficherMessage(…, { persistant: true })'),
    couvre: [],
    description: 'Dans « sans disparaitre », après le texte d’un message : il reste jusqu’à ce que la personne le ferme.',
    exemple: AU_CLIC('        afficher erreur "Impossible d’enregistrer" sans disparaitre'),
  }),
  mot({
    mot: 'action',
    categorie: 'action',
    concept: 'action.actionMessage',
    cibles: ecran('un bouton dans le message', 'un bouton (Pressable) dans le message', 'un bouton dans le message'),
    couvre: [],
    description:
      'Dans « afficher … avec action "Annuler" : », un bouton dans le message ; le bloc en dessous s’exécute si la personne clique dessus. Le message reste alors au moins 8 secondes.',
    exemple: AU_CLIC('        afficher reussite "Produit retiré" avec action "Annuler" :\n            ajouter "Robe" a panier', '    variable panier = []\n'),
  }),

  // ─── Les durées ──────────────────────────────────────────────────────
  ...([
    ['milliseconde', 'un millième de seconde', '300 millisecondes'],
    ['seconde', 'une seconde', '2 secondes'],
    ['minute', 'une minute', '1 minute'],
    ['heure', 'une heure', '1 heure'],
  ] as const).map(([unite, sens, exemple]) =>
    mot({
      mot: unite,
      variantes: [`${unite}s`],
      categorie: 'valeur',
      concept: `duree.${unite}`,
      cibles: ecran('un nombre de millisecondes', 'un nombre de millisecondes', 'un nombre de millisecondes'),
      couvre: [],
      description: `L’unité d’une durée (${sens}), juste après un nombre : « ${exemple} ».`,
      exemple: AU_CLIC(`        apres ${exemple} :\n            afficher "C’est l’heure"`),
    }),
  ),

  // ─── Les minuteries ──────────────────────────────────────────────────
  mot({
    mot: 'apres',
    accentue: 'après',
    categorie: 'action',
    concept: 'action.apres',
    cibles: ecran(
      'useMinuterie(…, 3000) dans la page, planifier(…, 3000) dans un événement (src/humalis/temps.ts)',
      'useMinuterie(…, 3000), suspendue quand l’application passe en arrière-plan (humalis/temps.ts)',
      'humalis.planifier(…, 3000), la page redessinée ensuite',
    ),
    couvre: ['js:setTimeout'],
    description:
      'En tête de ligne, suivi d’une durée : « apres 3 secondes : » exécute son bloc une fois, après la durée. Dans la page, la minuterie démarre à l’ouverture ; dans un événement, au moment de l’événement. Elle est annulée quand on quitte la page.',
    exemple: AU_CLIC('        changer copie par vrai\n        apres 2 secondes :\n            changer copie par faux', '    variable copie = faux\n'),
  }),
  mot({
    mot: 'toutes',
    variantes: ['tous'],
    categorie: 'action',
    concept: 'action.toutesLes',
    cibles: ecran(
      'useMinuterie(…, 5000, { repete: true }) (src/humalis/temps.ts), suspendue quand l’onglet est caché',
      'useMinuterie(…, 5000, { repete: true }), suspendue quand l’application passe en arrière-plan',
      'humalis.planifier(…, 5000, { repete: true })',
    ),
    couvre: ['js:setInterval'],
    description:
      'En tête de ligne : « toutes les 5 secondes : » exécute son bloc à intervalles réguliers (au moins 250 millisecondes). « tant que actif est vrai » après la durée la met en pause quand la condition est fausse ; « arreter » dans son bloc l’arrête pour de bon.',
    exemple: PAGE(
      '    variable compte = 10\n    variable actif = vrai\n    toutes les 1 seconde tant que actif est vrai :\n        changer compte par compte - 1\n        si compte est egal a 0 :\n            arreter\n    texte "Il reste {compte} secondes"\n    bouton "Pause"\n    quand l\'utilisateur clique sur "Pause" :\n        changer actif par faux',
    ),
  }),
  // ─── Copier et partager ──────────────────────────────────────────────
  mot({
    mot: 'copier',
    categorie: 'action',
    concept: 'action.copier',
    cibles: ecran(
      'await copier(texte, afficherMessage) : navigator.clipboard.writeText, repli execCommand (src/humalis/presse-papier.ts)',
      'await copier(texte, afficherMessage) : Clipboard.setStringAsync d’expo-clipboard',
      "await copier(texte) : navigator.clipboard.writeText, repli execCommand (humalis.js)",
    ),
    couvre: ['web:navigator.clipboard.writeText', 'expo:expo-clipboard'],
    description:
      'Dans un événement : « copier code » met le texte dans le presse-papier, puis affiche « Copié » (ou « Copie impossible »). « avec message "Code copié" » change le texte, « sans message » le tait.',
    exemple: AU_CLIC('        copier code', '    variable code = "REY-2026"\n'),
  }),
  mot({
    mot: 'message',
    categorie: 'option',
    concept: 'option.messageCopie',
    contextes: ['option'],
    cibles: ecran('le texte du message de copier', 'le texte du message de copier', 'le texte du message de copier'),
    couvre: [],
    description: 'Après « copier … » : « avec message "Code copié" » donne le texte du message, « sans message » n’en affiche aucun.',
    exemple: AU_CLIC('        copier code avec message "Code copié"', '    variable code = "REY-2026"\n'),
  }),
  mot({
    mot: 'partager',
    categorie: 'action',
    concept: 'action.partager',
    cibles: {
      ...ecran(
        'await partager({ texte, titre, adresse }, afficherMessage) : navigator.share, sinon le lien copié (src/humalis/presse-papier.ts)',
        'await partager(…) : Share.share de React Native',
        'await partager({ texte, titre, adresse }) : navigator.share, sinon le lien copié (humalis.js)',
      ),
      desktop: { produit: 'le lien (ou le texte) copié', note: 'Electron n’a pas de feuille de partage : le lien est copié et la personne le sait' },
    },
    couvre: ['web:navigator.share', 'react-native:Share'],
    description:
      'Dans un événement : « partager "Regarde cette robe" avec titre "…" avec lien vers "produit" avec id p.id » ouvre la feuille de partage du système. Sans elle, le lien (ou le texte) est copié et la personne en est prévenue.',
    exemple: AU_CLIC('        partager "Viens voir Rey Store" avec lien "https://reystore.cd"'),
  }),

  // ─── La recherche pendant la frappe ──────────────────────────────────
  mot({
    mot: 'ecrit',
    variantes: ['ecrire', 'ecris', 'ecrivent'],
    categorie: 'evenement',
    concept: 'evenement.saisie',
    cibles: ecran(
      'useQuandChange(valeur, …) : un effet sur la valeur du champ (src/humalis/temps.ts)',
      'useQuandChange(valeur, …) sur la valeur du TextInput',
      "element.addEventListener('input', …)",
    ),
    couvre: ['react:onChange', 'html:input'],
    description: '« quand l’utilisateur ecrit dans "recherche" : » : à chaque changement de ce qui est tapé dans le champ (frappe, collage, effacement).',
    exemple: PAGE('    variable lettres = 0\n    champ "recherche"\n    quand l\'utilisateur ecrit dans "recherche" :\n        changer lettres par lettres + 1\n    texte "{lettres} frappes"'),
  }),
  mot({
    mot: 'arrete ecrire',
    accentue: 'arrête d’écrire',
    variantes: ['arretent ecrire'],
    categorie: 'evenement',
    concept: 'evenement.pauseSaisie',
    cibles: ecran(
      'useQuandPause(valeur, 300, …) : un délai annulé à chaque frappe ; Entrée n’attend pas',
      'useQuandPause(valeur, 300, …) ; la touche « Rechercher » du clavier n’attend pas',
      "écouteurs 'input' et 'keydown' (humalis.js) : un délai annulé à chaque frappe",
    ),
    couvre: ['js:debounce'],
    description:
      '« quand l’utilisateur arrete d’ecrire dans "recherche" : » : quand rien n’a été tapé pendant 300 millisecondes (ou la durée écrite après « apres », de 100 millisecondes à 5 secondes). La touche Entrée n’attend pas. Une réponse lente ne remplace jamais une réponse plus récente.',
    exemple: PAGE('    variable resultats = []\n    champ "recherche"\n    quand l\'utilisateur arrete d\'ecrire dans "recherche" apres 500 millisecondes :\n        envoyer requete vers "/produits" avec le champ "recherche" dans resultats'),
  }),
  mot({
    mot: 'annonce',
    variantes: ['annonces'],
    categorie: 'option',
    concept: 'option.annonce',
    contextes: ['option'],
    cibles: ecran('aria-live="polite" aria-atomic="true"', 'accessibilityLiveRegion="polite"', 'aria-live="polite" aria-atomic="true"'),
    couvre: ['aria:aria-live'],
    description: '« avec annonce » : un lecteur d’écran lit l’élément quand il change, sans déplacer le focus (le nombre de résultats d’une recherche, le total d’un panier).',
    exemple: PAGE('    variable n = 0\n    texte "{n} résultats" avec annonce'),
  }),

  // ─── Les raccourcis clavier ──────────────────────────────────────────
  mot({
    mot: 'appuie',
    variantes: ['appuies', 'appuient'],
    categorie: 'evenement',
    concept: 'evenement.touche',
    cibles: ecran(
      "useRaccourcis([['controle+k', …]]) : un seul écouteur keydown (src/humalis/clavier.ts) ; « controle » vaut Ctrl, ou ⌘ sur Mac",
      null,
      "un écouteur keydown de humalis.js",
    ),
    couvre: ['dom:keydown', 'aria:aria-keyshortcuts'],
    description:
      '« quand l’utilisateur appuie sur "controle+k" : » : un raccourci clavier de la page ; avec « dans "recherche" », seulement quand le focus est dans ce champ. Les touches : controle, maj, alt, une lettre, un chiffre, entree, echap, espace, tab, suppr, retour, haut, bas, gauche, droite, debut, fin, f1 à f12, / et ?. Un téléphone n’a pas de clavier : rien n’y est produit.',
    exemple: PAGE('    variable aide = faux\n    quand l\'utilisateur appuie sur "controle+k" :\n        changer aide par vrai\n    si aide est vrai :\n        texte "Tape / pour chercher."'),
  }),
  mot({
    mot: 'raccourci',
    variantes: ['raccourcis'],
    categorie: 'option',
    concept: 'option.raccourci',
    contextes: ['option'],
    cibles: ecran('aria-keyshortcuts et title ; la touche clique le bouton (ou met le focus dans le champ)', null, 'aria-keyshortcuts et title ; la touche clique le bouton'),
    couvre: ['aria:aria-keyshortcuts'],
    description: '« avec raccourci "controle+maj+a" » sur un bouton, un lien ou un champ : la touche clique le bouton ou le lien, ou met le focus dans le champ. Le raccourci est annoncé au lecteur d’écran et montré au survol.',
    exemple: PAGE('    bouton "Ajouter" avec raccourci "controle+maj+a"\n    quand l\'utilisateur clique sur "Ajouter" :\n        afficher "Ajouté"'),
  }),

  // ─── Les confirmations ───────────────────────────────────────────────
  mot({
    mot: 'confirmer',
    categorie: 'action',
    concept: 'action.confirmer',
    cibles: ecran(
      'if (await confirmer(…)) { … } else { … } : une <dialog role="alertdialog"> (src/humalis/confirmation.ts), le focus sur le bouton qui annule',
      'useConfirmer() : une seule fenêtre de question (<Confirmations>, humalis/confirmation.tsx)',
      'if (await confirmer(…)) : la même <dialog> écrite par humalis.js',
    ),
    couvre: ['aria:alertdialog'],
    description:
      'Dans un événement : « confirmer "Supprimer ce produit ?" : » pose la question ; le bloc en dessous s’exécute si la personne répond oui, le bloc « sinon : » facultatif si elle répond non (ou Échap). « avec oui "Supprimer" et non "Garder" » nomme les boutons. Une question aide la personne : elle ne protège rien, le serveur vérifie toujours.',
    exemple: AU_CLIC('        confirmer "Vider le panier ?" avec oui "Vider" et non "Garder" :\n            changer panier par []\n        sinon :\n            afficher "Panier gardé"', '    variable panier = ["Robe"]\n'),
  }),
  mot({
    mot: 'oui',
    categorie: 'option',
    concept: 'option.boutonOui',
    contextes: ['option'],
    cibles: ecran('le texte du bouton qui accepte', 'le texte du bouton qui accepte', 'le texte du bouton qui accepte'),
    couvre: [],
    description: 'Après « confirmer … avec » : « oui "Supprimer" » nomme le bouton qui accepte (« Oui » par défaut) ; « non "Garder" » celui qui annule.',
    exemple: AU_CLIC('        confirmer "Se déconnecter ?" avec oui "Se déconnecter" et non "Rester" :\n            afficher "À bientôt"'),
  }),

  // ─── Le défilement infini ────────────────────────────────────────────
  mot({
    mot: 'arrive bas',
    accentue: 'arrive en bas de',
    variantes: ['arrivent bas'],
    categorie: 'evenement',
    concept: 'evenement.bas',
    cibles: {
      ...ecran(
        'useVoirPlus(…) : une sentinelle et un IntersectionObserver (400 pixels avant), plus un vrai bouton « Voir plus » (src/humalis/voir-plus.ts)',
        'le bouton « Voir plus » (le défilement ne charge pas encore la suite tout seul)',
        'la sentinelle observée par humalis.js et le bouton « Voir plus »',
      ),
    },
    couvre: ['dom:IntersectionObserver'],
    description:
      '« quand l’utilisateur arrive en bas de "catalogue" tant que il_reste est vrai : » : quand le bas du bloc nommé approche, la suite se charge. Un vrai bouton « Voir plus » fait la même chose au clavier (« avec bouton "…" » change son texte, « sans bouton » le retire, avec un avertissement).',
    exemple: PAGE('    variable produits = ["Robe"]\n    section "Nos produits" avec nom "catalogue" :\n        pour chaque p dans produits :\n            texte p\n    quand l\'utilisateur arrive en bas de "catalogue" :\n        ajouter "Pagne" a produits'),
  }),

  // ─── Le glisser-déposer ──────────────────────────────────────────────
  mot({
    mot: 'deplacement',
    accentue: 'déplacement',
    categorie: 'option',
    concept: 'option.deplacement',
    contextes: ['option'],
    cibles: {
      ...ecran(
        'useDeplacement(…) (src/humalis/deplacer.ts) : pointeur (souris, doigt, stylet) et clavier (Espace, flèches, Échap), annonces',
        'useDeplacement(…) : boutons « Monter » et « Descendre » et actions du lecteur d’écran',
        null,
      ),
    },
    couvre: ['dom:pointerevents', 'aria:aria-roledescription'],
    description:
      '« pour chaque t dans taches avec deplacement : » : chaque élément se prend et se déplace, et la variable de liste est réordonnée. Au clavier : Espace prend l’élément, les flèches le déplacent, Espace le dépose, Échap annule.',
    exemple: PAGE('    variable taches = ["Acheter du pain", "Appeler Rey"]\n    pour chaque t dans taches avec deplacement :\n        texte t'),
  }),
  mot({
    mot: 'ordre change',
    accentue: 'l’ordre de … change',
    categorie: 'evenement',
    concept: 'evenement.ordre',
    cibles: { ...ecran('appelé une fois par déplacement terminé (useDeplacement)', 'appelé une fois par déplacement (useDeplacement)', null) },
    couvre: [],
    description: '« quand l’ordre de taches change : » : une fois par déplacement terminé dans une liste « avec deplacement » (pour enregistrer l’ordre, par exemple).',
    exemple: PAGE('    variable taches = ["Acheter du pain", "Appeler Rey"]\n    pour chaque t dans taches avec deplacement :\n        texte t\n    quand l\'ordre de taches change :\n        afficher reussite "Ordre enregistré"'),
  }),

  {
    mot: 'mouvement reduit',
    accentue: 'mouvement réduit',
    variantes: [],
    categorie: 'comparaison',
    concept: 'condition.mouvementReduit',
    // Comme « utilisateur est connecte » : une tournure lue dans une condition, jamais un mot-clé du lexer.
    contextes: ['session'],
    cibles: ecran(
      "useMouvementReduit() : matchMedia('(prefers-reduced-motion: reduce)'), suivi en direct",
      'useMouvementReduit() : AccessibilityInfo.isReduceMotionEnabled() et reduceMotionChanged',
      "humalis.mouvementReduit() : matchMedia('(prefers-reduced-motion: reduce)'), la page redessinée au changement",
    ),
    couvre: ['css:prefers-reduced-motion'],
    description:
      'La condition « mouvement est reduit » est vraie quand la personne a demandé à son système de réduire les animations ; « mouvement n’est pas reduit » est son contraire. Le HTML écrit d’avance la considère fausse.',
    exemple: PAGE(
      '    variable image = 1\n    toutes les 4 secondes tant que mouvement n\'est pas reduit :\n        changer image par image + 1\n    si mouvement est reduit :\n        texte "Diaporama arrêté : les animations sont réduites."\n    texte "Image {image}"',
    ),
    statut: 'supporte',
    etape: 9,
  },
];
