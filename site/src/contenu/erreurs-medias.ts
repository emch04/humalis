/**
 * Les messages des graphiques, des médias et du mouvement, rangés à part et ajoutés à
 * la fin du catalogue (`erreurs.ts`). Comme partout : aucun message n'est
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

/** Une page de n textes animés au défilement. */
const textesAnimes = (n: number) =>
  ['page "accueil" :', ...Array.from({ length: n }, (_, i) => `    texte "Plat ${i + 1}" avec animation apparition au defilement`)].join('\n');

/** Une page avec un son : la ligne donnée est celle du son. */
const audioSeul = (ligne: string) => p(`
page "musique" :
    titre "Musique"
    ${ligne}
`);

/** Une page qui choisit un fichier : la ligne donnée est celle du choix. */
const fichierChoisi = (ligne: string) => p(`
page "profil" :
    titre "Mon profil"
    variable photo = rien
    ${ligne}
`);

/** Une page avec une carte : les lignes données (une carte, avec ses marqueurs) sont celles de la page. */
const carteSeule = (corps: string) => p(`
page "agences" :
    titre "Agences"
    ${corps}
`);

/** Une page qui choisit un fichier, avec une source qui décrit sa route d'envoi. */
const envoiFichier = (corps: string, autres = '') => p(`
source "boutique" :
    adresse "http://localhost:3000"
    session astratra
    route "photos" :
        creer photo
    donnee photo :
        fichier : texte

page "profil" :
    titre "Mon profil"
    variable photo = rien
    variable envoi = 0${autres ? `\n${autres}` : ''}
    fichier "Choisir une photo" dans photo accepte images
${corps}
`);

export const ENTREES_ERREURS_MEDIAS: readonly EntreeErreur[] = [
  // --- Le mouvement ---
  e('animation-sans-nom', 'grammaire', 'Une animation sans nom',
    'Après « animation », Humalis attend le nom d’une animation d’entrée : apparition (un fondu), montee (l’élément monte un peu) ou agrandissement.',
    'Écris le nom de l’animation juste après le mot « animation ».',
    p(`
page "accueil" :
    titre "Le Fleuve" avec animation
`),
    p(`
page "accueil" :
    titre "Le Fleuve" avec animation apparition
`),
    'il manque le nom de l’animation'),
  e('duree-sans-animation', 'sens', '« duree » ou « delai » sans animation',
    'La durée et le délai règlent une animation : seuls, ils n’ont rien à régler.',
    'Ajoute l’animation à l’élément, ou retire la durée et le délai.',
    p(`
page "accueil" :
    titre "Le Fleuve" avec delai court
`),
    p(`
page "accueil" :
    titre "Le Fleuve" avec animation montee et delai court
`),
    'donne l’attente d’une animation'),
  e('defilement-sans-animation', 'sens', '« au defilement » sans animation',
    '« au defilement » dit QUAND l’animation se joue (quand l’élément entre à l’écran) : il faut aussi dire LAQUELLE.',
    'Écris le nom de l’animation avant : « animation montee au defilement ».',
    p(`
page "accueil" :
    titre "Le Fleuve" avec animation defilement
`),
    p(`
page "accueil" :
    titre "Le Fleuve" avec animation montee au defilement
`),
    '« au defilement » suit le nom d’une animation'),
  e('cascade-hors-bloc', 'sens', '« en cascade » sur un simple élément',
    '« en cascade » fait apparaître les enfants d’un bloc l’un après l’autre : un titre ou un texte seul n’a pas d’enfants à faire apparaître.',
    'Mets « en cascade » sur le bloc qui contient les éléments : une grille, une ligne, une colonne, une section ou un bloc.',
    p(`
page "accueil" :
    titre "Nos plats" avec animation montee au defilement et en cascade
`),
    p(`
page "accueil" :
    titre "Nos plats"
    grille avec animation montee au defilement et en cascade :
        texte "Soupe"
        texte "Salade"
`),
    'il s’écrit sur un bloc'),
  e('animation-champ', 'sens', 'Une animation sur un champ',
    'Un champ qui bouge pendant qu’on écrit dedans gêne la saisie, surtout avec une loupe d’écran ou un lecteur d’écran. Humalis refuse l’animation sur un champ et dans un formulaire.',
    'Retire l’animation du champ ; anime plutôt le titre ou le bloc qui entoure le formulaire.',
    p(`
page "accueil" :
    variable nom = ""
    champ "Votre nom" avec animation apparition
`),
    p(`
page "accueil" :
    variable nom = ""
    champ "Votre nom"
`),
    'pas d’animation sur un champ'),
  e('trop-de-mouvement', 'avertissement', 'Trop d’éléments animés au défilement',
    'Au-delà de 30 éléments qui s’animent en entrant à l’écran, une page bouge sans cesse : c’est fatigant à lire, et chaque élément est surveillé par le navigateur. Ce n’est qu’un avertissement.',
    'Garde l’animation pour quelques éléments importants (les titres, la première image), ou anime le bloc qui les contient plutôt que chacun.',
    textesAnimes(31),
    textesAnimes(30),
    'trop de mouvement',
    { gravite: 'avertissement' }),
  // --- Les images (décisions M4 à M6) ---
  e('image-sans-description', 'sens', 'Une image sans description',
    'Une personne qui ne voit pas l’image (un lecteur d’écran la lit à voix haute) ne sait pas ce qu’elle montre. Le nom du fichier ne le dit pas.',
    'Décris ce que montre l’image avec « avec description "…" », ou écris « avec decoratif » si elle n’apporte aucune information.',
    p(`
page "accueil" :
    titre "Le Fleuve"
    image "salle.jpg"
`),
    p(`
page "accueil" :
    titre "Le Fleuve"
    image "salle.jpg" avec description "La salle du restaurant, face au fleuve"
`),
    'décrivez l’image pour les personnes'),
  e('image-description-et-decoratif', 'sens', 'Une image à la fois décrite et décorative',
    'Une image décorative est sautée par les lecteurs d’écran : sa description ne serait jamais lue.',
    'Garde la description si l’image dit quelque chose, sinon garde « decoratif ».',
    p(`
page "accueil" :
    titre "Le Fleuve"
    image "motif.png" avec description "Un motif" et decoratif
`),
    p(`
page "accueil" :
    titre "Le Fleuve"
    image "motif.png" avec decoratif
`),
    'soit une description, soit « decoratif »'),
  e('image-description-vide', 'sens', 'Une description d’image vide',
    'Une description vide équivaut à ne rien dire de l’image.',
    'Écris ce que l’image montre, ou « avec decoratif ».',
    p(`
page "accueil" :
    titre "Le Fleuve"
    image "salle.jpg" avec description "  "
`),
    p(`
page "accueil" :
    titre "Le Fleuve"
    image "salle.jpg" avec description "La salle du restaurant"
`),
    'la description de l’image est vide'),
  e('proportions-syntaxe', 'grammaire', 'Des proportions mal écrites',
    'Les proportions réservent la place de l’image avant qu’elle n’arrive : la largeur, « sur », puis la hauteur.',
    'Écris « proportions 4 sur 3 » ou « proportions 16 sur 9 ».',
    p(`
page "accueil" :
    titre "Le Fleuve"
    image "salle.jpg" avec description "La salle" et proportions 4
`),
    p(`
page "accueil" :
    titre "Le Fleuve"
    image "salle.jpg" avec description "La salle" et proportions 4 sur 3
`),
    'les proportions s’écrivent « largeur sur hauteur »'),
  e('proportions-nulles', 'sens', 'Des proportions nulles',
    'Une largeur ou une hauteur de zéro ne réserve aucune place.',
    'Donne deux nombres entiers positifs.',
    p(`
page "accueil" :
    titre "Le Fleuve"
    image "salle.jpg" avec description "La salle" et proportions 4 sur 0
`),
    p(`
page "accueil" :
    titre "Le Fleuve"
    image "salle.jpg" avec description "La salle" et proportions 4 sur 3
`),
    'sont deux nombres entiers positifs'),
  e('image-format', 'sens', 'Un format d’image que les navigateurs n’affichent pas',
    'Les navigateurs et les téléphones affichent les images .png, .jpg, .webp, .gif, .svg et .avif. Un fichier .bmp ou .tiff resterait vide.',
    'Enregistre l’image dans un format courant (.png, .jpg ou .webp).',
    p(`
page "accueil" :
    titre "Le Fleuve"
    image "plan.bmp" avec description "Le plan de la salle"
`),
    p(`
page "accueil" :
    titre "Le Fleuve"
    image "plan.png" avec description "Le plan de la salle"
`),
    'n’est pas une image que les navigateurs savent afficher'),
  e('trop-d-images-prioritaires', 'avertissement', 'Trop d’images prioritaires',
    '« prioritaire » fait charger une image avant les autres. Si plusieurs le sont, elles se partagent le réseau et aucune n’arrive plus vite.',
    'Garde « prioritaire » pour la grande image du haut de la page.',
    p(`
page "accueil" :
    titre "Le Fleuve"
    image "a.jpg" avec description "La salle" et prioritaire
    image "b.jpg" avec description "La terrasse" et prioritaire
    image "c.jpg" avec description "Le bar" et prioritaire
`),
    p(`
page "accueil" :
    titre "Le Fleuve"
    image "a.jpg" avec description "La salle" et prioritaire
    image "b.jpg" avec description "La terrasse"
    image "c.jpg" avec description "Le bar"
`),
    'au-delà de 2', { gravite: 'avertissement' }),

  // --- L'audio ---
  e('audio-sans-description', 'sens', 'Un son sans description',
    'Le lecteur d’un son a besoin d’un nom que les lecteurs d’écran peuvent lire. Sans description, une personne aveugle ne sait pas ce que ce lecteur joue.',
    'Écris avec description "…" après le fichier : ce que la personne va entendre.',
    audioSeul('audio "extrait.mp3"'),
    audioSeul('audio "extrait.mp3" avec description "Extrait de la chanson Le Fleuve"'),
    'décrivez le son pour les personnes qui ne le voient pas'),
  e('audio-description-vide', 'sens', 'Une description de son vide',
    'Une description vide ne nomme rien : le lecteur reste muet pour les lecteurs d’écran.',
    'Écris ce que la personne va entendre.',
    audioSeul('audio "extrait.mp3" avec description ""'),
    audioSeul('audio "extrait.mp3" avec description "Extrait de la chanson Le Fleuve"'),
    'la description du son est vide'),
  e('audio-automatique', 'sens', 'Un son qui démarre tout seul',
    'Humalis ne lance jamais un son tout seul : les navigateurs le bloquent presque toujours, et un son qui démarre gêne beaucoup les personnes qui écoutent la page avec un lecteur d’écran.',
    'Retire « automatique » : la personne lance le son avec les commandes du lecteur.',
    audioSeul('audio "extrait.mp3" avec description "Extrait de la chanson" et automatique'),
    audioSeul('audio "extrait.mp3" avec description "Extrait de la chanson"'),
    'Humalis ne lance jamais un son tout seul'),
  e('audio-format-inconnu', 'sens', 'Un fichier son d’un format inconnu',
    'Les navigateurs et les téléphones ne savent jouer que quelques formats de son : mp3, ogg, wav, m4a, aac, flac, opus.',
    'Convertis le fichier dans l’un de ces formats.',
    audioSeul('audio "extrait.mid" avec description "Extrait de la chanson"'),
    audioSeul('audio "extrait.mp3" avec description "Extrait de la chanson"'),
    'n’est pas un son que les navigateurs savent jouer'),
  e('audio-parole-sans-transcription', 'avertissement', 'De la parole sans transcription',
    'Un son qui contient de la parole (un entretien, un discours) n’est pas accessible aux personnes qui ne peuvent pas l’écouter, sauf si on leur donne le texte. Humalis le devine au nom du fichier : c’est une aide, pas une certitude.',
    'Ajoute et transcription "…" avec le texte de ce qui est dit.',
    audioSeul('audio "entretien.mp3" avec description "Entretien avec la cheffe"'),
    audioSeul('audio "entretien.mp3" avec description "Entretien avec la cheffe" et transcription "Bonjour et bienvenue au Fleuve."'),
    'ce son ressemble à de la parole', { gravite: 'avertissement' }),

  // --- Choisir un fichier et l'envoyer ---
  e('fichier-sans-type', 'grammaire', 'Un choix de fichier sans type après « accepte »',
    'Après « accepte », Humalis attend ce que le fichier peut être : images, audio, videos, pdf ou documents.',
    'Écris au moins un type après « accepte », ou retire « accepte ».',
    fichierChoisi('fichier "Choisir une photo" dans photo accepte'),
    fichierChoisi('fichier "Choisir une photo" dans photo accepte images'),
    'il manque ce que le fichier peut être'),
  e('fichier-taille-sans-unite', 'grammaire', 'Une taille maximale sans unité',
    'Une taille s’écrit avec son unité : Ko pour les petits fichiers, Mo pour les grands. Un chiffre seul ne dit pas combien de place.',
    'Ajoute Ko ou Mo après le nombre.',
    fichierChoisi('fichier "Choisir une photo" dans photo accepte images avec maximum 5'),
    fichierChoisi('fichier "Choisir une photo" dans photo accepte images avec maximum 5 Mo'),
    'la taille maximale a une unité'),
  e('fichier-reglage-inconnu', 'grammaire', 'Un réglage qui n’existe pas pour un choix de fichier',
    'Un choix de fichier se règle avec maximum (la taille), plusieurs (une liste de fichiers), nom et style. Les autres réglages d’éléments ne s’y appliquent pas.',
    'Utilise l’un des réglages permis.',
    fichierChoisi('fichier "Choisir une photo" dans photo accepte images avec couleur bleu'),
    fichierChoisi('fichier "Choisir une photo" dans photo accepte images avec plusieurs'),
    'ne se règle pas sur un choix de fichier'),
  e('fichier-libelle-vide', 'sens', 'Un choix de fichier sans libellé',
    'Le libellé est le texte du bouton que la personne lit. Sans lui, le bouton est muet, surtout pour un lecteur d’écran.',
    'Écris ce que la personne doit faire : « Choisir une photo ».',
    fichierChoisi('fichier "" dans photo accepte images'),
    fichierChoisi('fichier "Choisir une photo" dans photo accepte images'),
    'le libellé du choix de fichier est vide'),
  e('fichier-svg', 'sens', 'Accepter un fichier SVG',
    'Un fichier SVG est un dessin, mais il peut aussi contenir du script. Humalis ne le compte pas parmi les images qu’on accepte d’un visiteur.',
    'Accepte images (PNG, JPEG, WebP, GIF, AVIF).',
    fichierChoisi('fichier "Choisir un logo" dans photo accepte svg'),
    fichierChoisi('fichier "Choisir un logo" dans photo accepte images'),
    'le SVG n\'est pas accepté'),
  e('fichier-type-inconnu', 'sens', 'Un type de fichier inconnu',
    'Après « accepte », seuls cinq mots existent : images, audio, videos, pdf, documents. Pas besoin de connaître les types techniques.',
    'Choisis l’un de ces cinq mots.',
    fichierChoisi('fichier "Choisir une photo" dans photo accepte imagess'),
    fichierChoisi('fichier "Choisir une photo" dans photo accepte images'),
    'n\'est pas un type de fichier connu'),
  e('fichier-taille-nulle', 'sens', 'Une taille maximale nulle',
    'Un maximum de zéro refuserait tous les fichiers.',
    'Donne une taille positive : « maximum 5 Mo ».',
    fichierChoisi('fichier "Choisir une photo" dans photo accepte images avec maximum 0 Mo'),
    fichierChoisi('fichier "Choisir une photo" dans photo accepte images avec maximum 5 Mo'),
    'la taille maximale est positive'),
  e('fichier-sans-accepte', 'avertissement', 'Un choix de fichier sans type',
    'Sans « accepte », la personne peut choisir n’importe quel fichier. Le serveur devra alors vérifier le type lui-même ; la page ne le fait pas.',
    'Écris « accepte images » (ou pdf, audio…) pour guider la personne. Le serveur vérifiera quand même.',
    fichierChoisi('fichier "Choisir un fichier" dans photo'),
    fichierChoisi('fichier "Choisir un fichier" dans photo accepte documents'),
    'sans « accepte », tout fichier peut être choisi', { gravite: 'avertissement' }),
  e('fichier-non-garde', 'sens', 'Un fichier choisi qu’on voudrait garder',
    'Un fichier choisi n’existe que pendant la visite : on ne le garde pas dans le navigateur et on ne le partage pas entre les pages.',
    'Déclare une variable ordinaire : variable photo = rien.',
    p(`
page "profil" :
    titre "Mon profil"
    variable photo = rien avec memorisee
    fichier "Choisir une photo" dans photo accepte images
`),
    fichierChoisi('fichier "Choisir une photo" dans photo accepte images'),
    'un fichier choisi ne se garde pas'),
  e('fichier-variable-incompatible', 'sens', 'Une variable qui ne peut pas recevoir un fichier',
    'La variable d’un choix de fichier reçoit le fichier choisi, ou rien. Si elle commence avec un nombre ou un texte, les deux ne vont pas ensemble.',
    'Déclare la variable avec rien : variable photo = rien.',
    p(`
page "profil" :
    titre "Mon profil"
    variable photo = 0
    fichier "Choisir une photo" dans photo accepte images
`),
    fichierChoisi('fichier "Choisir une photo" dans photo accepte images'),
    'elle reçoit un fichier choisi'),
  e('fichier-apercu-pdf', 'sens', 'L’aperçu d’un PDF',
    'Un aperçu (« apercu ») existe pour une image, un son ou une vidéo. Un PDF n’a pas d’aperçu à montrer dans la page.',
    'Affiche plutôt le nom du fichier : photo.nom.',
    p(`
page "profil" :
    titre "Mon profil"
    variable photo = rien
    fichier "Choisir un document" dans photo accepte pdf
    texte photo.apercu
`),
    p(`
page "profil" :
    titre "Mon profil"
    variable photo = rien
    fichier "Choisir un document" dans photo accepte pdf
    texte photo.nom
`),
    'n\'a pas d\'aperçu'),
  e('envoi-fichier-hors-evenement', 'sens', 'Envoyer un fichier sans action de la personne',
    'Un fichier se choisit et s’envoie quand la personne le décide. L’envoi se place donc dans un événement, par exemple le clic sur un bouton.',
    'Place « envoyer fichier » sous « quand l\'utilisateur clique sur … ».',
    envoiFichier('    envoyer fichier photo vers "photos" de la source "boutique" en corps brut'),
    envoiFichier(`    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "photos" de la source "boutique" en corps brut`),
    'ne s\'utilise que dans un événement'),
  e('envoi-fichier-pas-un-fichier', 'sens', 'Envoyer ce qui n’est pas un fichier choisi',
    'On n’envoie que la variable d’un choix de fichier : celle qui est écrite après « dans » dans la ligne « fichier "…" dans … ».',
    'Écris le nom de la variable du choix de fichier.',
    envoiFichier(`    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier envoi vers "photos" de la source "boutique" en corps brut`),
    envoiFichier(`    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "photos" de la source "boutique" en corps brut`),
    'n\'est pas un fichier choisi'),
  e('envoi-fichier-corps-et-nom', 'grammaire', 'Un corps brut avec un nom de champ',
    '« en corps brut » envoie le fichier tout seul. « sous le nom » donne un nom à un champ de formulaire : les deux ne vont pas ensemble.',
    'Garde l’un des deux.',
    envoiFichier(`    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "photos" de la source "boutique" en corps brut sous le nom "photo"`),
    envoiFichier(`    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "photos" de la source "boutique" sous le nom "photo"`),
    'envoie le fichier seul, sans formulaire'),
  e('envoi-fichier-sans-source', 'sens', 'Envoyer un fichier au serveur du même fichier',
    'Les serveurs que Humalis produit ne reçoivent pas encore de fichier : il n’existe pas de module sûr pour cela, et Humalis n’en invente pas (taille, type, nom, droits). Le fichier part vers une API qui sait le recevoir.',
    'Déclare cette API dans un bloc « source » et écris « de la source "…" ».',
    envoiFichier(`    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "photos"`),
    envoiFichier(`    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "photos" de la source "boutique"`),
    'ne reçoit pas de fichier'),
  e('envoi-fichier-source-inconnue', 'sens', 'Envoyer un fichier vers une source qui n’existe pas',
    'La source nommée n’est déclarée nulle part dans le fichier.',
    'Écris le nom exact d’une source déclarée en haut du fichier.',
    envoiFichier(`    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "photos" de la source "boutik"`),
    envoiFichier(`    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "photos" de la source "boutique"`),
    'aucune source « boutik »'),
  e('envoi-fichier-jeton-secret', 'sens', 'Envoyer un fichier vers une source à jeton secret',
    'Un jeton secret ne doit jamais partir dans le navigateur. Il passerait par le serveur, qui ne sait pas encore transmettre un fichier.',
    'Envoie le fichier à une source qui donne la session ou qui a un jeton public.',
    envoiFichier('    envoyer fichier photo vers "photos" de la source "boutique"'),
    envoiFichier('    envoyer fichier photo vers "photos" de la source "boutique"'),
    'a un jeton secret', { atteignable: false }),
  e('envoi-fichier-route-non-decrite', 'avertissement', 'Une route d’envoi qui n’est pas vérifiée',
    'La source ne dit pas quelles routes elle a : Humalis ne peut pas savoir si celle-ci existe.',
    'Décris la route dans la source : route "photos" : …',
    p(`
source "boutique" :
    adresse "http://localhost:3000"
    session astratra

page "profil" :
    titre "Mon profil"
    variable photo = rien
    fichier "Choisir une photo" dans photo accepte images
    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "photos" de la source "boutique"
`),
    envoiFichier(`    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "photos" de la source "boutique"`),
    'ne décrit pas ses routes', { gravite: 'avertissement' }),
  e('envoi-fichier-route-inconnue', 'sens', 'Envoyer un fichier vers une route qui n’existe pas',
    'La source décrit ses routes, et celle-ci n’en fait pas partie.',
    'Écris le chemin d’une route de la source.',
    envoiFichier(`    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "images" de la source "boutique"`),
    envoiFichier(`    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "photos" de la source "boutique"`),
    'aucune route « images »'),
  e('envoi-fichier-route-sans-creer', 'sens', 'Envoyer un fichier vers une route qui ne l’accepte pas',
    'Envoyer un fichier, c’est créer quelque chose. La route de la source doit dire « creer ».',
    'Ajoute une ligne « creer … » à la route, ou choisis une autre route.',
    p(`
source "boutique" :
    adresse "http://localhost:3000"
    session astratra
    route "photos" :
        lire une liste de photo
    donnee photo :
        fichier : texte

page "profil" :
    titre "Mon profil"
    variable photo = rien
    fichier "Choisir une photo" dans photo accepte images
    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "photos" de la source "boutique"
`),
    envoiFichier(`    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "photos" de la source "boutique"`),
    'ne dit pas « creer … »'),
  e('envoi-fichier-suivi-pas-nombre', 'sens', 'Une progression qui n’est pas un nombre',
    'La progression de l’envoi va de 0 à 100 : la variable qui la reçoit est un nombre.',
    'Déclare la variable avec 0 : variable envoi = 0.',
    envoiFichier(`    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "photos" de la source "boutique" suivi dans nom`, '    variable nom = "x"'),
    envoiFichier(`    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "photos" de la source "boutique" suivi dans envoi`),
    'la progression est un nombre'),

  // --- La carte ---
  e('carte-option-inconnue', 'grammaire', 'Un réglage inconnu sur une carte',
    'Une carte se règle avec latitude, longitude, zoom, tuiles, attribution et style. Un autre mot ne dit rien à la carte.',
    'Garde un des réglages de la liste, ou retire le mot.',
    carteSeule('carte "Le restaurant" avec rayon 3 et latitude -4,3250 et longitude 15,3222'),
    carteSeule('carte "Le restaurant" avec latitude -4,3250 et longitude 15,3222'),
    'ne se règle pas sur une carte'),
  e('carte-valeur-manquante', 'grammaire', 'Un réglage de carte sans valeur',
    'Après latitude, longitude ou zoom, la carte attend un nombre.',
    'Écris la valeur : latitude -4,3250, longitude 15,3222, zoom 15.',
    carteSeule('carte "Le restaurant" avec latitude'),
    carteSeule('carte "Le restaurant" avec latitude -4,3250 et longitude 15,3222'),
    'il manque la valeur après « latitude »'),
  e('marqueur-option-inconnue', 'grammaire', 'Un réglage inconnu sur un marqueur',
    'Un marqueur se règle avec latitude, longitude, adresse et style.',
    'Garde un des réglages de la liste, ou retire le mot.',
    carteSeule('carte "Nos agences" :\n        marqueur "Gombe" avec rayon 3 et latitude -4,3047 et longitude 15,3070'),
    carteSeule('carte "Nos agences" :\n        marqueur "Gombe" avec latitude -4,3047 et longitude 15,3070'),
    'ne se règle pas sur un marqueur'),
  e('marqueur-valeur-manquante', 'grammaire', 'Un réglage de marqueur sans valeur',
    'Après latitude, longitude ou adresse, le marqueur attend sa valeur.',
    'Écris la valeur : marqueur "Gombe" avec latitude -4,3047 et longitude 15,3070.',
    carteSeule('carte "Nos agences" :\n        marqueur "Gombe" avec latitude'),
    carteSeule('carte "Nos agences" :\n        marqueur "Gombe" avec latitude -4,3047 et longitude 15,3070'),
    'il manque la valeur après « latitude »'),
  e('carte-nom-vide', 'sens', 'Une carte sans nom',
    'Le nom d’une carte la décrit pour les personnes qui ne la voient pas, comme le libellé d’un bouton. Il n’y a pas de carte décorative.',
    'Écris ce que la carte montre : le lieu, ce qu’on y trouve.',
    carteSeule('carte "" avec latitude -4,3250 et longitude 15,3222'),
    carteSeule('carte "Le restaurant Le Fleuve, avenue de la Gombe" avec latitude -4,3250 et longitude 15,3222'),
    'le nom de la carte est vide'),
  e('marqueur-nom-vide', 'sens', 'Un marqueur sans nom',
    'Le nom d’un marqueur s’affiche dans sa bulle et nomme le repère pour les lecteurs d’écran.',
    'Écris le nom du lieu.',
    carteSeule('carte "Nos agences" :\n        marqueur "" avec latitude -4,3047 et longitude 15,3070'),
    carteSeule('carte "Nos agences" :\n        marqueur "Gombe" avec latitude -4,3047 et longitude 15,3070'),
    'le nom du marqueur est vide',
    { sites: 0 }),
  e('carte-position-incomplete', 'sens', 'Une position avec la latitude ou la longitude seule',
    'Un point sur la terre se donne par deux nombres. Un seul ne place rien. Les mots latitude et longitude évitent de les inverser.',
    'Donne les deux, la latitude d’abord : avec latitude -4,3250 et longitude 15,3222.',
    carteSeule('carte "Le restaurant" avec latitude -4,3250'),
    carteSeule('carte "Le restaurant" avec latitude -4,3250 et longitude 15,3222'),
    'une position s’écrit avec latitude et longitude ensemble'),
  e('carte-latitude-hors-bornes', 'sens', 'Une latitude hors des bornes',
    'La latitude va de -90 (le pôle sud) à 90 (le pôle nord). Un nombre plus grand est souvent une longitude écrite à la place.',
    'Vérifie l’ordre : la latitude d’abord, la longitude ensuite.',
    carteSeule('carte "Le restaurant" avec latitude 95 et longitude 15,3222'),
    carteSeule('carte "Le restaurant" avec latitude -4,3250 et longitude 15,3222'),
    'la latitude 95 est hors des bornes'),
  e('carte-longitude-hors-bornes', 'sens', 'Une longitude hors des bornes',
    'La longitude va de -180 (l’ouest) à 180 (l’est).',
    'Vérifie la valeur et l’ordre : la latitude d’abord, la longitude ensuite.',
    carteSeule('carte "Le restaurant" avec latitude -4,3250 et longitude 190'),
    carteSeule('carte "Le restaurant" avec latitude -4,3250 et longitude 15,3222'),
    'la longitude 190 est hors des bornes',
    { sites: 0 }),
  e('carte-zoom-hors-bornes', 'sens', 'Un zoom hors des bornes',
    'Le zoom va de 1 (le monde entier) à 18 (une rue).',
    'Choisis un entier de 1 à 18 : 15 montre un quartier.',
    carteSeule('carte "Le restaurant" avec latitude -4,3250 et longitude 15,3222 et zoom 25'),
    carteSeule('carte "Le restaurant" avec latitude -4,3250 et longitude 15,3222 et zoom 15'),
    'le zoom 25 est hors des bornes',
    { sites: 0 }),
  e('carte-zoom-pas-entier', 'sens', 'Un zoom qui n’est pas un entier',
    'Les niveaux de zoom sont des paliers : 14, 15, 16. Un zoom à virgule n’existe pas.',
    'Écris un entier de 1 à 18.',
    carteSeule('carte "Le restaurant" avec latitude -4,3250 et longitude 15,3222 et zoom 14,5'),
    carteSeule('carte "Le restaurant" avec latitude -4,3250 et longitude 15,3222 et zoom 15'),
    'le zoom est un nombre entier'),
  e('carte-coordonnee-pas-un-nombre', 'sens', 'Une coordonnée qui n’est pas un nombre',
    'La latitude, la longitude et le zoom sont des nombres : un texte ne place aucun point.',
    'Écris le nombre, ou donne une variable ou un champ de donnée qui est un nombre.',
    carteSeule('carte "Le restaurant" avec latitude "nord" et longitude 15,3222'),
    carteSeule('carte "Le restaurant" avec latitude -4,3250 et longitude 15,3222'),
    'la latitude est un nombre'),
  e('carte-tuiles-adresse', 'sens', 'Une adresse de tuiles mal écrite',
    'Une carte est faite de petites images, les tuiles. L’adresse du fournisseur est en https et dit quelle tuile demander : {z} est le zoom, {x} et {y} la case.',
    'Écris l’adresse donnée par le fournisseur, avec {z}, {x} et {y}.',
    carteSeule('carte "Le plan" avec latitude -4,3250 et longitude 15,3222 et tuiles "http://tuiles.exemple.cd/plan.png" et attribution "© Exemple"'),
    carteSeule('carte "Le plan" avec latitude -4,3250 et longitude 15,3222 et tuiles "https://tuiles.exemple.cd/{z}/{x}/{y}.png" et attribution "© Exemple"'),
    'l’adresse des tuiles commence par https:// et contient {z}, {x} et {y}'),
  e('carte-tuiles-sans-attribution', 'sens', 'Des tuiles sans attribution',
    'Les fournisseurs de cartes (comme OpenStreetMap) exigent qu’on cite la source, toujours visible sur la carte. Humalis ne cache jamais ce crédit.',
    'Ajoute le texte demandé par le fournisseur : et attribution "© MapTiler".',
    carteSeule('carte "Le plan" avec latitude -4,3250 et longitude 15,3222 et tuiles "https://tuiles.exemple.cd/{z}/{x}/{y}.png"'),
    carteSeule('carte "Le plan" avec latitude -4,3250 et longitude 15,3222 et tuiles "https://tuiles.exemple.cd/{z}/{x}/{y}.png" et attribution "© Exemple"'),
    'demandent son attribution'),
  e('carte-attribution-sans-tuiles', 'sens', 'Une attribution sans tuiles',
    'Les tuiles par défaut (OpenStreetMap) portent déjà leur attribution. Une attribution écrite à la main n’a de sens qu’avec les tuiles d’un autre fournisseur.',
    'Écris aussi les tuiles du fournisseur, ou retire l’attribution.',
    carteSeule('carte "Le plan" avec latitude -4,3250 et longitude 15,3222 et attribution "© Exemple"'),
    carteSeule('carte "Le plan" avec latitude -4,3250 et longitude 15,3222'),
    'l’attribution accompagne des tuiles'),
  e('carte-contenu-intrus', 'sens', 'Autre chose qu’un marqueur dans une carte',
    'Une carte ne contient que des marqueurs, dans un « pour chaque » ou un « si » au besoin. Un texte ou un bouton n’aurait pas de place sur la carte.',
    'Place le texte avant ou après la carte.',
    carteSeule('carte "Nos agences" avec latitude -4,3250 et longitude 15,3222 :\n        texte "Bienvenue"'),
    carteSeule('carte "Nos agences" avec latitude -4,3250 et longitude 15,3222 :\n        marqueur "Gombe" avec latitude -4,3047 et longitude 15,3070'),
    'une carte ne contient que des marqueurs'),
  e('carte-vide', 'sens', 'Une carte sans position ni marqueur',
    'Sans centre et sans marqueur, la carte ne sait pas où regarder : elle n’afficherait rien.',
    'Donne un centre (latitude et longitude) ou ajoute des marqueurs.',
    carteSeule('carte "Nos agences"'),
    carteSeule('carte "Nos agences" avec latitude -4,3250 et longitude 15,3222'),
    'une carte sans position ni marqueur n’affiche rien'),
  e('carte-trop-de-marqueurs', 'avertissement', 'Trop de marqueurs écrits à la main',
    'Au-delà de 200 marqueurs, la carte devient lente et illisible, et Humalis ne regroupe pas encore les marqueurs.',
    'Montre moins de lieux, tire-les d’une liste avec « pour chaque », ou découpe en plusieurs cartes.',
    carteSeule(`carte "Beaucoup" :\n${Array.from({ length: 201 }, (_, i) => `        marqueur "Lieu ${i}" avec latitude 1 et longitude 2`).join('\n')}`),
    carteSeule('carte "Un peu" :\n        marqueur "Lieu" avec latitude 1 et longitude 2'),
    'marqueurs écrits dans cette carte',
    { gravite: 'avertissement' }),
  e('marqueur-hors-carte', 'sens', 'Un marqueur hors d’une carte',
    'Un marqueur est un lieu sur une carte : seul, il ne montre rien.',
    'Place-le sous une ligne carte "…" :, décalé.',
    p(`
page "agences" :
    titre "Agences"
    marqueur "Gombe" avec latitude -4,3047 et longitude 15,3070
`),
    carteSeule('carte "Nos agences" :\n        marqueur "Gombe" avec latitude -4,3047 et longitude 15,3070'),
    'un marqueur se place dans une carte'),
  e('marqueur-sans-position', 'sens', 'Un marqueur sans position',
    'Un marqueur a besoin de sa latitude et de sa longitude pour être placé.',
    'Donne les deux : marqueur "Gombe" avec latitude -4,3047 et longitude 15,3070.',
    carteSeule('carte "Nos agences" :\n        marqueur "Gombe" avec latitude -4,3047'),
    carteSeule('carte "Nos agences" :\n        marqueur "Gombe" avec latitude -4,3047 et longitude 15,3070'),
    'le marqueur a besoin de sa position'),
  e('carte-fournisseur-de-tuiles', 'avertissement', 'Les tuiles d’une carte viennent d’un fournisseur',
    'Chaque tuile demandée envoie l’adresse IP du visiteur (et la page d’où il vient) au fournisseur de la carte, OpenStreetMap par défaut. La commande le dit une fois, à la compilation. Ce n’est pas une faute : c’est une information à connaître, et à écrire dans la politique de confidentialité du site.',
    'Pour un site très visité, prends les tuiles d’un fournisseur à contrat : avec tuiles "…" et attribution "…". Dis-le aux visiteurs dans la politique de confidentialité.',
    carteSeule('carte "Le restaurant" avec latitude -4,3250 et longitude 15,3222'),
    carteSeule('carte "Le restaurant" avec latitude -4,3250 et longitude 15,3222'),
    'cette carte appelle un fournisseur de tuiles',
    { gravite: 'avertissement', atteignable: false }),
  // --- Les graphiques ---
  e('graphique-sans-genre', 'grammaire', 'Un graphique sans genre',
    'Juste après « graphique », Humalis attend son genre : en courbe (une évolution), en barres (des quantités à comparer) ou en camembert (les parts d’un tout).',
    'Écris le genre après « graphique ».',
    graphique('graphique ventes avec etiquette mois et valeur montant et description "Les ventes montent."'),
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant et description "Les ventes montent."'),
    'il manque le genre du graphique'),
  e('serie-hors-graphique', 'grammaire', 'Une série hors d’un graphique',
    'Une ligne « serie » ajoute une courbe ou un groupe de barres à un graphique : elle se place dans son bloc, décalée sous la ligne du graphique qui finit par deux-points.',
    'Décale la série sous un graphique écrit en bloc.',
    graphique('serie "Ventes" valeur montant'),
    graphique('graphique en barres ventes avec etiquette mois et description "Les ventes montent." :\n        serie "Ventes" valeur montant'),
    '« serie » se place dans un graphique en bloc'),
  e('option-de-graphique-inconnue', 'grammaire', 'Une option de graphique inconnue',
    'Un graphique se règle avec quelques mots : etiquette, etiquettes, valeur, couleur, description, proportions et style. Un autre mot n’est pas compris.',
    'Corrige le mot : souvent une faute de frappe, que le message propose de corriger.',
    graphique('graphique en courbe ventes avec etiquete mois et valeur montant et description "Les ventes montent."'),
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant et description "Les ventes montent."'),
    'n’est pas une option de graphique'),
  e('ligne-de-graphique', 'grammaire', 'Autre chose qu’une série dans un graphique',
    'Le bloc d’un graphique ne contient que ses séries, une par ligne. Un texte ou un bouton se place à côté du graphique, pas dedans.',
    'Sors la ligne du bloc du graphique, ou écris une série.',
    graphique('graphique en barres ventes avec etiquette mois et description "Les ventes montent." :\n        texte "Ventes"'),
    graphique('graphique en barres ventes avec etiquette mois et description "Les ventes montent." :\n        serie "Ventes" valeur montant'),
    'chaque ligne est une série'),
  e('option-de-serie', 'grammaire', 'Un réglage de série inconnu',
    'Une série a un nom, une valeur et, au besoin, une couleur : rien d’autre ne se règle sur elle.',
    'Garde seulement « avec couleur … » après la valeur de la série.',
    graphique('graphique en barres ventes avec etiquette mois et description "Les ventes montent." :\n        serie "Ventes" valeur montant avec epaisseur 2'),
    graphique('graphique en barres ventes avec etiquette mois et description "Les ventes montent." :\n        serie "Ventes" valeur montant avec couleur bleu'),
    'ne se règle pas sur une série'),
  e('graphique-dans-evenement', 'sens', 'Un graphique dans un événement',
    'Un événement fait des actions (changer une variable, envoyer une requête) ; il ne place pas d’élément dans la page. Le graphique est écrit dans la page, et un « si » le montre quand il le faut.',
    'Place le graphique dans la page, dans un « si » qui lit une variable changée par l’événement.',
    graphique('variable visible = faux\n    bouton "Voir"\n    quand l\'utilisateur clique sur "Voir" :\n        graphique en courbe ventes avec etiquette mois et valeur montant et description "Les ventes montent."'),
    graphique('variable visible = faux\n    bouton "Voir"\n    quand l\'utilisateur clique sur "Voir" :\n        changer visible par vrai\n    si visible est vrai :\n        graphique en courbe ventes avec etiquette mois et valeur montant et description "Les ventes montent."'),
    'un graphique se place dans la page, pas dans un événement'),
  e('graphique-sans-liste', 'sens', 'Un graphique sans liste',
    'Un graphique dessine une liste : des nombres, ou des fiches (les ventes par mois), ou des données du serveur. Un seul nombre, ou une liste de textes, ne se dessine pas.',
    'Donne au graphique une liste de nombres, de fiches ou de données.',
    p(`
page "ventes" :
    titre "Ventes"
    variable total = 300000
    graphique en barres total avec description "Les ventes du trimestre."
`),
    p(`
page "ventes" :
    titre "Ventes"
    variable totaux = [120000, 180000]
    graphique en barres totaux avec etiquettes ["Janvier", "Février"] et description "Les ventes du trimestre."
`),
    'un graphique se fait à partir d’une liste'),
  e('graphique-sans-description', 'sens', 'Un graphique sans description',
    'Une personne qui ne voit pas le dessin entend sa description : elle dit ce que le graphique montre (« les ventes montent de janvier à mars »). Humalis l’exige, en plus de la table des données qu’il écrit seul.',
    'Ajoute « description "…" » : une phrase qui dit ce que le graphique démontre.',
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant'),
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant et description "Les ventes montent de janvier à février."'),
    'décrivez ce que montre le graphique'),
  e('graphique-description-vide', 'sens', 'Une description de graphique vide',
    'Une description vide ne dit rien à la personne qui ne voit pas le dessin.',
    'Écris ce que montre le graphique.',
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant et description " "'),
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant et description "Les ventes montent."'),
    'la description du graphique est vide'),
  e('graphique-ligne-et-bloc', 'sens', 'Une valeur sur la ligne et des séries',
    'La forme en ligne (« valeur montant ») dessine une seule série ; la forme en bloc en dessine une par ligne « serie ». Les deux à la fois se contredisent.',
    'Garde la valeur sur la ligne pour une seule série, ou des lignes « serie » pour plusieurs.',
    graphique('graphique en barres ventes avec etiquette mois et valeur montant et description "Les ventes montent." :\n        serie "Ventes" valeur montant'),
    graphique('graphique en barres ventes avec etiquette mois et description "Les ventes montent." :\n        serie "Ventes" valeur montant'),
    'pas les deux'),
  e('camembert-plusieurs-series', 'sens', 'Un camembert de plusieurs séries',
    'Les parts d’un camembert forment un tout : il ne montre qu’une série. Pour comparer plusieurs séries, des barres conviennent mieux.',
    'Garde une seule série, ou choisis un graphique en barres.',
    graphique('graphique en camembert ventes avec etiquette mois et description "Février pèse plus." :\n        serie "Ventes" valeur montant\n        serie "Achats" valeur montant'),
    graphique('graphique en barres ventes avec etiquette mois et description "Février pèse plus." :\n        serie "Ventes" valeur montant\n        serie "Achats" valeur montant'),
    'un camembert montre une seule série'),
  e('camembert-couleur', 'sens', 'Une couleur sur un camembert',
    'Chaque part d’un camembert prend sa propre couleur, dans l’ordre de la palette : une seule couleur pour tout le disque rendrait les parts impossibles à distinguer.',
    'Retire « couleur ».',
    graphique('graphique en camembert ventes avec etiquette mois et valeur montant et couleur vert et description "Février pèse plus."'),
    graphique('graphique en camembert ventes avec etiquette mois et valeur montant et description "Février pèse plus."'),
    'les parts d’un camembert prennent chacune leur couleur'),
  e('graphique-couleur-pale', 'avertissement', 'Une couleur de série qui se voit mal',
    'Une courbe ou des barres trop pâles sur le fond de la page se distinguent mal : il faut un contraste d’au moins 3 pour 1, en clair comme en sombre.',
    'Choisis une couleur plus contrastée (bleu, vert, violet…).',
    graphique('graphique en barres ventes avec etiquette mois et valeur montant et couleur jaune et description "Les ventes montent."'),
    graphique('graphique en barres ventes avec etiquette mois et valeur montant et couleur vert et description "Les ventes montent."'),
    'se voit mal sur le fond de la page', { gravite: 'avertissement' }),
  e('graphique-devise-inconnue', 'sens', 'Une devise inconnue',
    'Après « valeur … en », Humalis connaît trois devises : FC, euros et dollars. Les valeurs, les graduations et la table s’écrivent alors comme de l’argent.',
    'Écris FC, euros ou dollars, ou retire « en … ».',
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant en livres et description "Les ventes montent."'),
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant en euros et description "Les ventes montent."'),
    'n’est pas une devise connue'),
  e('graphique-unites-melangees', 'sens', 'Des séries dans des unités différentes',
    'Toutes les séries d’un graphique partagent le même axe des valeurs : une série en FC et une autre en euros ne peuvent pas se lire sur la même échelle.',
    'Écris toutes les séries dans la même devise, ou fais deux graphiques.',
    graphique('graphique en barres ventes avec etiquette mois et description "Les ventes montent." :\n        serie "Ventes" valeur montant en FC\n        serie "Achats" valeur montant en euros'),
    graphique('graphique en barres ventes avec etiquette mois et description "Les ventes montent." :\n        serie "Ventes" valeur montant en FC\n        serie "Achats" valeur montant en FC'),
    'dans la même unité'),
  e('graphique-proportions', 'sens', 'Des proportions de graphique impossibles',
    'Les proportions disent la largeur et la hauteur du dessin, deux nombres entiers plus grands que zéro : « proportions 2 sur 1 » fait un graphique deux fois plus large que haut.',
    'Écris deux nombres entiers positifs.',
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant et proportions 0 sur 1 et description "Les ventes montent."'),
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant et proportions 2 sur 1 et description "Les ventes montent."'),
    'deux nombres entiers positifs : « proportions 2 sur 1 »'),
  e('graphique-nombres-et-champs', 'sens', 'Des champs dans une liste de nombres',
    '« etiquette » et « valeur » nomment des champs de fiches. Une liste de nombres n’a pas de champs : ses libellés s’écrivent avec « etiquettes [...] ».',
    'Retire « etiquette » et « valeur », et écris les libellés avec « etiquettes ».',
    p(`
page "visites" :
    titre "Visites"
    variable visites = [120, 180]
    graphique en barres visites avec etiquette jour et description "Plus de visites mardi."
`),
    p(`
page "visites" :
    titre "Visites"
    variable visites = [120, 180]
    graphique en barres visites avec etiquettes ["Lundi", "Mardi"] et description "Plus de visites mardi."
`),
    'la liste ne contient que des nombres'),
  e('graphique-etiquettes-pas-textes', 'sens', 'Des étiquettes qui ne sont pas des textes',
    'Les étiquettes d’une liste de nombres sont ses libellés : une liste de textes entre guillemets.',
    'Écris les étiquettes entre guillemets.',
    p(`
page "visites" :
    titre "Visites"
    graphique en barres [120, 180] avec etiquettes [1, 2] et description "Plus de visites mardi."
`),
    p(`
page "visites" :
    titre "Visites"
    graphique en barres [120, 180] avec etiquettes ["Lundi", "Mardi"] et description "Plus de visites mardi."
`),
    '« etiquettes » attend une liste de textes'),
  e('graphique-etiquettes-longueur', 'sens', 'Pas autant d’étiquettes que de nombres',
    'Chaque nombre a son étiquette : sans elle, il serait dessiné avec un simple numéro.',
    'Écris une étiquette par nombre.',
    p(`
page "visites" :
    titre "Visites"
    graphique en barres [120, 180, 150] avec etiquettes ["Lundi", "Mardi"] et description "Plus de visites mardi."
`),
    p(`
page "visites" :
    titre "Visites"
    graphique en barres [120, 180, 150] avec etiquettes ["Lundi", "Mardi", "Mercredi"] et description "Plus de visites mardi."
`),
    'il en faut autant'),
  e('graphique-champ-inconnu', 'sens', 'Un champ inconnu dans un graphique',
    '« etiquette » et « valeur » nomment des champs des éléments de la liste. Humalis connaît ces champs : un nom mal écrit est signalé, avec le nom le plus proche.',
    'Corrige le nom du champ.',
    graphique('graphique en courbe ventes avec etiquette mois et valeur montnt et description "Les ventes montent."'),
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant et description "Les ventes montent."'),
    'n’est pas un champ des éléments de la liste'),
  e('graphique-etiquettes-sur-fiches', 'sens', '« etiquettes » sur une liste de fiches',
    '« etiquettes [...] » donne les libellés d’une liste de nombres. Une liste de fiches a déjà ses libellés dans un de ses champs : « etiquette » le nomme.',
    'Remplace « etiquettes [...] » par « etiquette » suivi du champ.',
    graphique('graphique en courbe ventes avec etiquettes ["Janvier", "Février"] et valeur montant et description "Les ventes montent."'),
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant et description "Les ventes montent."'),
    '« etiquettes » sert à une liste de nombres'),
  e('graphique-sans-etiquette', 'sens', 'Un graphique sans libellés',
    'Sous une courbe ou des barres, chaque point a son libellé (le mois, le jour) : il vient d’un champ des fiches, nommé par « etiquette ».',
    'Ajoute « etiquette » suivi du champ des libellés.',
    graphique('graphique en courbe ventes avec valeur montant et description "Les ventes montent."'),
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant et description "Les ventes montent."'),
    'il manque le champ des libellés'),
  e('graphique-sans-valeur', 'sens', 'Un graphique sans valeurs',
    'Un graphique dessine un nombre par élément de la liste : « valeur » nomme le champ de ce nombre.',
    'Ajoute « valeur » suivi du champ des nombres.',
    graphique('graphique en courbe ventes avec etiquette mois et description "Les ventes montent."'),
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant et description "Les ventes montent."'),
    'il manque le champ des valeurs'),
  e('serie-sans-valeur', 'sens', 'Une série sans valeur',
    'Chaque série dessine un champ des fiches : « valeur » le nomme, juste après le nom de la série.',
    'Ajoute « valeur » suivi du champ à la série.',
    graphique('graphique en barres ventes avec etiquette mois et description "Les ventes montent." :\n        serie "Ventes"'),
    graphique('graphique en barres ventes avec etiquette mois et description "Les ventes montent." :\n        serie "Ventes" valeur montant'),
    'n’a pas de valeur'),
  e('graphique-valeur-pas-nombre', 'sens', 'Une valeur qui n’est pas un nombre',
    'Un graphique dessine des nombres : la hauteur d’une barre, la place d’un point. Un champ de texte ne se mesure pas.',
    'Choisis un champ nombre pour « valeur » (le message les liste).',
    graphique('graphique en courbe ventes avec etiquette mois et valeur mois et description "Les ventes montent."'),
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant et description "Les ventes montent."'),
    'un graphique dessine des nombres'),
  e('camembert-negatif', 'sens', 'Une part négative dans un camembert',
    'Une part de camembert est un morceau d’un tout : elle ne peut pas être plus petite que rien. Des valeurs négatives se montrent avec des barres, qui descendent sous zéro.',
    'Choisis un graphique en barres, ou retire la valeur négative.',
    p(`
page "budget" :
    titre "Budget"
    graphique en camembert [300, -50] avec etiquettes ["Ventes", "Pertes"] et description "Les ventes dominent."
`),
    p(`
page "budget" :
    titre "Budget"
    graphique en barres [300, -50] avec etiquettes ["Ventes", "Pertes"] et description "Les ventes dominent."
`),
    'un camembert ne montre pas de valeur négative'),
  e('camembert-trop-de-parts', 'avertissement', 'Un camembert de trop de parts',
    'Au-delà de huit parts, les parts deviennent fines et leurs étiquettes se chevauchent : l’œil ne compare plus.',
    'Regroupe les petites parts (« Autres »), ou choisis un graphique en barres.',
    nombres('camembert', 9),
    nombres('camembert', 8),
    'au-delà de 8', { gravite: 'avertissement' }),
  e('trop-de-barres', 'avertissement', 'Trop de barres',
    'Au-delà de quarante barres, chacune devient trop fine pour être lue, surtout sur un téléphone.',
    'Regroupe les valeurs (par semaine plutôt que par jour), ou choisis un graphique en courbe.',
    nombres('barres', 41),
    nombres('courbe', 41),
    'au-delà de 40', { gravite: 'avertissement' }),
  e('courbe-un-point', 'avertissement', 'Une courbe d’un seul point',
    'Une courbe montre une évolution : avec un seul point, il n’y a rien à relier.',
    'Ajoute des valeurs, ou montre ce nombre dans un texte.',
    nombres('courbe', 1),
    nombres('courbe', 2),
    'une courbe d’un seul point', { gravite: 'avertissement' }),
  e('graphique-champs-non-verifies', 'avertissement', 'Des champs de graphique non vérifiés',
    'Quand la liste arrive pendant l’exécution (d’une API, par exemple), Humalis ne connaît pas encore ses champs : il ne peut pas vérifier « etiquette » et « valeur ». Il le dit pour qu’on les relise.',
    'Vérifie que les champs existent dans les données reçues. Une liste écrite dans le programme, ou une donnée du serveur, est vérifiée.',
    p(`
page "ventes" :
    titre "Ventes"
    variable ventes = []
    graphique en courbe ventes avec etiquette mois et valeur montant et description "Les ventes montent."
`),
    graphique('graphique en courbe ventes avec etiquette mois et valeur montant et description "Les ventes montent."'),
    'ne sont connus qu’à l’exécution', { gravite: 'avertissement' }),
];

/** Une page des ventes, avec sa liste, et des lignes écrites après. */
function graphique(lignes: string): string {
  return [
    'page "ventes" :',
    '    titre "Ventes"',
    '    variable ventes = [fiche avec mois "Janvier" et montant 120000, fiche avec mois "Février" et montant 180000]',
    `    ${lignes}`,
  ].join('\n');
}

/** Un graphique d'une liste de n nombres. */
function nombres(genre: string, n: number): string {
  const liste = Array.from({ length: n }, (_, i) => (i + 1) * 10).join(', ');
  return `page "mesures" :\n    titre "Mesures"\n    graphique en ${genre} [${liste}] avec description "Les mesures montent."`;
}
