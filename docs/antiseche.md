<!--
La source de l'antisèche : site-public/pages/antiseche.humalis en est tiré par
`npm run site:antiseche`, et tests/antiseche.test.ts compile chaque formule.

## Section en français | Section in English | ancre
### Ce qu'on veut faire | What you want to do
```humalis page      une formule : racine, page, action, serveur, donnee, route, commande ou complet
```faux action       dans « Les pièges » : une tournure que le compilateur doit refuser
```terminal          une commande, qui n'est pas compilée
-->

## Écrire | Writing | ecrire

### Ouvrir un bloc : `:` en fin de ligne, puis 4 espaces de plus | Open a block: `:` at the end of the line, then 4 more spaces
```humalis page
section "Horaires" :
    texte "Du lundi au samedi"
```

### Afficher un texte fixe | Show fixed text
```humalis page
texte "Bonjour"
```

### Afficher ce que contient une variable | Show what a variable holds
```humalis page
texte prenom
```

### Mettre une variable dans un texte | Put a variable inside a text
```humalis page
texte "Bonjour {prenom}"
```

### Mettre un guillemet dans un texte | Put a quote inside a text
```humalis page
texte "Elle a dit \"bonjour\""
```

### Aller à la ligne dans un texte | Start a new line inside a text
```humalis page
texte "Bonjour,{a la ligne}À bientôt."
```

### Écrire un commentaire | Write a comment
```humalis page
# Une note pour les humains
```

### Donner plusieurs options à un élément : un seul `avec`, puis `et` | Give an element several options: one `avec`, then `et`
```humalis page
bouton "Valider" avec fond vert et texte blanc
```

## Les pages | Pages | pages

### Créer une page | Create a page
```humalis racine
page "bienvenue" :
    titre "Bienvenue"
```

### Choisir son adresse | Choose its address
```humalis racine
page "tarifs" a l'adresse "/tarifs" :
    titre "Tarifs"
```

### Lui passer une valeur dans l'adresse | Pass it a value in the address
```humalis racine
page "fiche" avec parametre numero :
    texte "Fiche {numero}"
```

### Lire un filtre de l'adresse (`?rayon=robes`) | Read a filter from the address (`?rayon=robes`)
```humalis racine
page "rayons" avec filtre rayon :
    si rayon est rien :
        texte "Tous les rayons"
```

### La réserver aux comptes connectés | Restrict it to signed-in accounts
```humalis racine
page "compte" reservee a connecte sinon vers "connexion" :
    titre "Mon compte"
```

### Faire un lien vers une page | Link to a page
```humalis page
lien "Nous écrire" vers "contact"
```

### Faire un lien avec une valeur | Link with a value
```humalis page
lien "Voir le livre" vers "produit" avec id "livre-1"
```

### Faire un lien vers un autre site | Link to another site
```humalis page
lien "Nous suivre" vers "https://exemple.fr" avec nouvel onglet
```

### Faire un lien vers l'adresse rangée dans une variable | Link to the address kept in a variable
```humalis page
variable site = "https://exemple.fr"
lien "Notre site" vers site
```

### Faire un lien vers un endroit de la page | Link to a place on the page
```humalis page
section "Desserts" avec ancre "desserts" :
    texte "Tarte aux pommes"
lien "Les desserts" vers "#desserts"
```

### Mettre une page dans une autre | Put a page inside another
```humalis racine
page "espace" :
    lien "Profil" vers "profil"
    sous page

page "profil" dans "espace" :
    texte "Ton profil"
```

### Ajouter un en-tête et un pied communs | Add a shared header and footer
```humalis racine
entete avec fixe :
    lien "Accueil" vers "essai"

pied :
    texte "Ouvert du lundi au samedi"
```

### Ranger les onglets de l'application en groupes | Group the app's tabs
```humalis racine
onglets de l'application :
    onglet "Contact" vers "contact"
    groupe "Compte" :
        onglet "Connexion" vers "connexion"
```

### Ranger une page dans son propre fichier | Keep a page in its own file
```humalis racine
utiliser fichier "./pages/panier.humalis"
```

## Les éléments | Elements | elements

### Titres | Headings
```humalis page
titre "Le catalogue"
soustitre "Les robes"
soustitre "En promotion" avec niveau 3
```

### Mettre un mot en valeur | Highlight a word
```humalis page
texte "Prix : {accent "gratuit"}"
```

### Montrer du code dans une phrase | Show code in a sentence
```humalis page
texte "Écris `titre` pour donner un titre."
```

### Image | Image
```humalis page
image "vitrine.jpg" avec description "La vitrine de la boutique"
```

### Bouton | Button
```humalis page
bouton "Ajouter" avec icone "panier"
```

### Bouton à icône seule : son nom est lu par le lecteur d'écran | Icon-only button: its name is read by the screen reader
```humalis page
bouton icone "fermer" avec nom "Fermer la fenêtre"
```

### Bouton désactivé, toujours ou selon une condition | Disabled button, always or depending on a condition
```humalis page
bouton "Payer" avec desactive si panier est vide
bouton "Bientôt" avec desactive
```

### Vidéo : avec ses commandes et une description | Video: with its controls and a description
```humalis page
video "presentation.mp4" avec commandes et description "Présentation de la boutique"
```

### Liste à puces et liste numérotée | Bulleted and numbered list
```humalis page
liste :
    texte "Une robe"
liste numerotee :
    texte "Choisir"
```

### Onglets et texte dépliable | Tabs and collapsible text
```humalis page
onglets :
    onglet "Livraison" :
        texte "En trois jours."
deroulant "Comment commander ?" :
    texte "Ajoute un produit au panier."
```

### Note, quantité, progression | Rating, quantity, progress
```humalis page
etoiles note avec modifiable
compteur quantite avec minimum 1 et maximum 10 et description "Quantité"
progression stock avec pourcentage et maximum 100
```

### Choisir un fichier | Choose a file
```humalis page
fichier "Choisir une photo" dans photo accepte images avec maximum 5 Mo
```

## Les formulaires | Forms | formulaires

### Un formulaire complet | A complete form
```humalis page
formulaire "message" :
    champ "Prénom" avec obligatoire
    champ email "Adresse" avec indice "toi@exemple.fr"
    bouton "Envoyer"
quand le formulaire "message" est soumis :
    afficher reussite "Message envoyé"
```

### Les sortes de champs | Kinds of fields
```humalis page
champ telephone "Téléphone"
champ nombre "Âge" avec minimum 0 et maximum 130
champ date "Naissance"
champ heure "Heure d'appel"
champ mot de passe "Mot de passe"
champ texte long "Présentation"
champ adresse web "Site"
```

### Un choix parmi plusieurs | One choice among several
```humalis page
choix "Taille" parmi ["S", "M", "L"] avec obligatoire
liste deroulante "Pays" parmi ["France", "Belgique"] avec indice "Choisis un pays"
```

### Une case à cocher | A checkbox
```humalis page
case a cocher "J'accepte les conditions" avec obligatoire
```

### Champ désactivé, toujours ou selon une condition | Disabled field, always or depending on a condition
```humalis page
champ "Référence" avec desactive
champ "Adresse de livraison" avec desactive si actif
```

### Remplir un champ dès le départ | Fill a field from the start
```humalis page
champ "Nom" avec valeur nom
```

### Lire ce qui a été écrit dans un champ | Read what was typed in a field
```humalis action
changer nom par champ "Nom"
```

### Vider un champ | Clear a field
```humalis action
vider champ "Nom"
```

## La mise en page et les styles | Layout and styles | mise-en-page

### Ranger côte à côte, l'un sous l'autre | Side by side, one below the other
```humalis page
ligne :
    texte "À gauche"
    texte "À droite"
colonne :
    texte "En haut"
    texte "En bas"
```

### Une grille de blocs | A grid of blocks
```humalis page
grille avec colonnes 3 et espacement moyenne :
    bloc avec ombre legere et remplissage moyenne :
        texte "Risotto"
```

### Selon l'écran | Depending on the screen
```humalis page
sur telephone :
    bouton "Menu"
sur tablette ou ordinateur :
    lien "La carte" vers "contact"
```

### Un même bloc pour plusieurs plateformes | One block for several platforms
```humalis page
sur site et macos :
    texte "Glisse un fichier ici."
```

### Couleurs et tailles | Colors and sizes
```humalis page
titre "Bienvenue" avec couleur bleu et taille grande et position centree
bouton "Annuler" avec fond gris et bordure arrondie
```

### Utiliser ta classe CSS | Use your CSS class
```humalis page
titre "Bienvenue" avec style "grand"
```

### Écrire un style en Humalis, une propriété par ligne | Write a style in Humalis, one property per line
```humalis racine
style "carte" :
    fond blanc
    bord 1 gris clair
    arrondi 12
    espace interieur 16
    ombre douce

page "vitrine" :
    titre "Vitrine"
    bloc avec style "carte" :
        texte "Un produit"
```

### Le thème du site | The site theme
```humalis racine
theme :
    couleur marque clair "#0e5a6b" sombre "#5fc3d6"
    police titres "Georgia"
    mode automatique
```

### Passer du clair au sombre | Switch between light and dark
```humalis action
basculer theme
```

### Faire apparaître un élément | Animate an element in
```humalis page
titre "Bienvenue" avec animation apparition
bloc avec animation montee au defilement :
    texte "Apparaît quand on arrive dessus."
```

### Un bloc qui remplit l'écran, une colonne qui défile seule | A block that fills the screen, a column that scrolls on its own
```humalis page
ligne avec hauteur ecran :
    colonne avec defilement interne :
        texte "Un long chapitre."
```

### Une page dessinée pour une taille d'écran | A page drawn for a screen size
```humalis racine
page "affiche" dessinee pour 1440 par 900 :
    titre "Affiche"
```

### Une page jusqu'aux bords de la fenêtre | A page that reaches the window edges
```humalis racine
page "galerie" en pleine fenetre :
    titre "Galerie"
```

### Un style écrit en SwiftUI, Kotlin ou XAML | A style written in SwiftUI, Kotlin or XAML
```humalis racine
utiliser style "./styles/apple.swift" sur apple
utiliser style "./styles/android.kt" sur android
utiliser style "./styles/windows.xaml" sur windows

page "vitrine" :
    bloc avec style "carte" :
        texte "Un produit"
```

### Ce que Humalis ne sait pas encore : une vue en Swift, Kotlin ou C# | What Humalis can't do yet: a view in Swift, Kotlin or C#
```humalis racine
paquet windows "Humanizer.Core" version "2.14.1"
utiliser composant "Carte" sur apple "./natif/Carte.swift" et sur android "./natif/Carte.kt" et sur windows "./natif/Carte.cs"

page "vitrine" :
    Carte avec titre "Café" et prix 3.5
```

### Les bibliothèques de ces vues : Swift, NuGet, Gradle | The libraries of these views: Swift, NuGet, Gradle
```humalis racine
paquet android "io.coil-kt:coil-compose" version "2.7.0"
paquet windows "Humanizer.Core" version "2.14.1"

page "accueil" :
    titre "Accueil"
```

### Un widget pour l'écran d'accueil | A home screen widget
```humalis racine
variable solde = 120 avec partagee

widget "solde" avec taille petite :
    texte "{solde} €"
    actualiser toutes les 30 minutes

page "accueil" :
    titre "Accueil"
```

### Une liste en direct | A live list
```humalis racine
serveur "notes" :
    donnee note :
        texte : texte
    route "notes" :
        tout le monde peut lire note
        tout le monde peut creer note

page "accueil" :
    variable notes = []
    titre "Notes"
    quand la page se charge :
        envoyer requete vers "notes" dans notes en direct
    pour chaque n dans notes :
        texte n.texte
```

### Une discussion entre clients et agents | A chat between clients and agents
```humalis racine
serveur "boutique" :
    roles client et agent
    discussion "support" entre client et agent

page "accueil" :
    titre "Support"
    discussion "support"
    quand un message arrive dans "support" :
        afficher message.texte
```

### Un appel vidéo | A video call
```humalis racine
serveur "agence" :
    donnee contact :
        compte : texte
        nom : texte
    route "contacts" :
        connecte peut lire contact

page "accueil" :
    variable contacts = []
    titre "Contacts"
    quand la page se charge :
        envoyer requete vers "contacts" dans contacts
    pour chaque contact dans contacts :
        texte contact.nom
        si contact.compte est en ligne :
            badge "En ligne"
        bouton "Appeler"
        quand l'utilisateur clique sur "Appeler" :
            appeler en video contact.compte
```

### Une réunion avec modération | A meeting with moderation
```humalis racine
serveur "ecole" :
    roles eleve et professeur
    salle "classe" pour eleve et professeur animee par professeur

page "accueil" :
    titre "Classe"
    reunion "classe"
    pour chaque p dans participants de reunion "classe" :
        texte p.nom
        bouton "Couper"
        quand l'utilisateur clique sur "Couper" :
            couper micro de p
```

### Une activité en direct sur l'écran de verrouillage | A live activity on the lock screen
```humalis racine
activite en direct "livraison" :
    titre "Commande en route"

page "accueil" :
    titre "Accueil"
    bouton "Suivre"
    quand l'utilisateur clique sur "Suivre" :
        commencer activite "livraison"
```

### Recevoir un partage, ouvrir un fichier | Receive a share, open a file
```humalis racine
variable recus = [] avec partagee

quand on partage vers l'application :
    ajouter partage.texte a recus

quand on ouvre un fichier ".csv" :
    afficher "Fichier {fichier.nom}"

page "accueil" :
    titre "Accueil"
```

### Une commande pour Siri ou l'assistant Google | A Siri or Google Assistant command
```humalis racine
variable solde = 120 avec partagee

commande vocale "Mon solde" :
    dire "Votre solde est de {solde} €"

page "accueil" :
    titre "Accueil"
```

### Une tuile, des raccourcis sur l'icône, un clavier | A tile, icon shortcuts, a keyboard
```humalis racine
raccourcis de l'icone :
    raccourci "Mon compte" vers "accueil" avec icone "user"

tuile "Pointer" avec icone "clock" :
    afficher "Pointé"

clavier "Réponses rapides" :
    touche "Merci" ecrit "Merci beaucoup !"

page "accueil" :
    titre "Accueil"
```

### Sur l'ordinateur : clic droit, barre du système, démarrage | On the computer: right-click, system bar, startup
```humalis racine
menu clic droit "Envoyer" pour les fichiers ".jpg" et ".png" :
    afficher "Reçu {fichier.nom}"

lancer au demarrage de l'ordinateur avec discret

page "rapide" dans la barre du systeme avec icone "clock" :
    titre "Rapide"
```

### Une page pour la montre ou la télévision | A page for the watch or the TV
```humalis racine
page "minuteur" sur montre :
    titre "Minuteur"
```

### Des données gardées sur l'appareil, chiffrées et synchronisées | Data kept on the device, encrypted and synced
```humalis complet
serveur "carnet" :
    donnee note :
        titre : texte
        lu : booleen
    route "notes" :
        connecte peut lire note
        connecte peut creer note
        connecte peut modifier note
        connecte peut supprimer note

donnee locale notes avec chiffree :
    titre : texte
    lu : booleen
    synchronisee avec "notes"

page "accueil" :
    titre "Notes"
    pour chaque n dans notes :
        texte n.titre
    bouton "Ajouter"
    quand l'utilisateur clique sur "Ajouter" :
        ajouter fiche avec titre "Nouvelle" et lu faux a notes
```

## Les variables et les calculs | Variables and calculations | variables

### Une variable qui change, un calcul qui suit | A variable that changes, a calculation that follows
```humalis page
variable compte = 0
calcul double = compte * 2
```

### Une valeur fixe pour tout le site | A fixed value for the whole site
```humalis racine
constante livraison = 5
```

### Partager entre les pages | Share between pages
```humalis racine
variable favoris = [] avec partagee
```

### Garder après avoir fermé le site | Keep after closing the site
```humalis racine
variable preferes = [] avec partagee et memorisee
```

### Changer une valeur | Change a value
```humalis action
changer note par note + 1
```

### Regrouper des valeurs dans une fiche | Group values in a record
```humalis page
variable client = fiche avec nom "Camille" et ville "Lyon"
texte "{client.nom}, {client.ville}"
```

### Calculer sur une liste de nombres | Calculate on a list of numbers
```humalis page
calcul total = somme de notes
calcul moyenne_notes = moyenne de notes
calcul meilleure = maximum de notes
calcul arrondie = arrondi de moyenne_notes a 1 chiffres
```

### Tirer au sort | Draw at random
```humalis action
changer note par hasard entre 1 et 6
```

### Travailler le texte | Work with text
```humalis page
calcul fort = majuscules de nom
calcul taille = longueur de nom
calcul poli = remplacer "Camille" par "Madame" dans nom
```

### Une date en toutes lettres, un nombre en lettres, des initiales | A date written out, a number in words, initials
```humalis page
calcul jour = aujourd'hui
calcul sigle = initiales de nom
texte "{jour en date longue avec majuscule}"
texte "{quantite en lettres avec majuscule} article"
```

### Le contraire d'un vrai ou faux, une comparaison gardée dans un calcul | The opposite of a true or false, a comparison kept in a calculation
```humalis page
calcul en_pause = non actif
calcul de_saison = categorie est dans ["robes", "jupes"]
```

### Afficher un prix, un pluriel | Show a price, a plural
```humalis page
texte "{quantite article} pour {prix en euros}"
```

### Calculer sur les dates | Calculate with dates
```humalis page
calcul livraison_prevue = aujourd'hui plus 3 jours
calcul attente = jours entre aujourd'hui et livraison_prevue
```

## Les conditions | Conditions | conditions

### Si, sinon | If, otherwise
```humalis page
si note est inferieure a 10 :
    texte "À retravailler"
sinon :
    texte "Réussi"
```

### Comparer | Compare
```humalis page
si stock est superieur a 0 :
    texte "En stock"
si stock est inferieur ou egal a 5 :
    texte "Bientôt épuisé"
si stock est egal a 0 :
    texte "Épuisé"
si nom est different de "Camille" :
    texte "Bonjour"
```

### Tester un vrai ou faux | Test a true or false
```humalis page
si actif :
    texte "Actif"
si actif est vrai :
    texte "Actif, écrit en entier"
```

### Le contraire : `non` | The opposite: `non`
```humalis page
si non actif :
    texte "En pause"
```

### Liste vide, valeur absente | Empty list, missing value
```humalis page
si panier est vide :
    texte "Rien pour l'instant"
si panier n'est pas vide :
    texte "Panier rempli"
si photo est rien :
    texte "Pas de photo"
si photo est different de rien :
    texte "Photo choisie"
```

### Contient, fait partie de | Contains, is one of
```humalis page
si nom contient "Martin" :
    texte "Famille Martin"
si categorie est dans ["robes", "jupes"] :
    texte "Mode"
```

### Combiner | Combine
```humalis page
si stock est superieur a 0 et prix est inferieur a 20 :
    texte "Bonne affaire"
si panier est vide ou stock est egal a 0 :
    texte "Rien à commander"
```

### Plusieurs cas | Several cases
```humalis page
selon categorie :
    cas "robes" ou "jupes" :
        texte "Mode"
    sinon :
        texte "Le reste"
```

### Selon la personne connectée | Depending on who is signed in
```humalis page
si utilisateur est connecte :
    texte "Bonjour"
```

## Les listes et les boucles | Lists and loops | listes

### Parcourir une liste | Go through a list
```humalis page
pour chaque p dans produits :
    texte "{p.nom} : {p.prix en euros}"
```

### Ajouter, retirer | Add, remove
```humalis action
ajouter "Pomme" à panier
retirer "Pomme" de panier
```

### Compter les éléments | Count the items
```humalis page
calcul dans_le_panier = nombre de panier
```

### Trier | Sort
```humalis page
calcul moins_chers = trier produits par prix
calcul plus_chers = trier produits par prix decroissant
```

### Filtrer | Filter
```humalis page
calcul petits_prix = produits dont prix est inferieur a 10
calcul trouve = premier de produits dont nom contient "Liv"
```

### Garder les premiers, grouper | Keep the first ones, group
```humalis page
calcul vitrine = les 2 premiers de produits
calcul groupes = grouper produits par nom
```

### Répéter | Repeat
```humalis action
repeter 3 fois :
    changer note par note + 1
tant que note est inferieure a 10 :
    changer note par note + 2
```

## Les événements | Events | evenements

### Au chargement de la page | When the page loads
```humalis page
quand la page se charge :
    afficher "Prêt"
```

### Au clic | On click
```humalis page
bouton "Commencer"
quand l'utilisateur clique sur "Commencer" :
    afficher "C'est parti"
```

### Quand la personne a fini d'écrire | When the person stops typing
```humalis page
champ "recherche" avec indice "Chercher"
quand l'utilisateur arrete d'ecrire dans "recherche" :
    afficher "Recherche…"
```

### Toutes les X secondes | Every X seconds
```humalis page
toutes les 1 seconde tant que actif est vrai :
    changer note par note + 1
```

### Plus tard | Later
```humalis action
apres 2 secondes :
    changer actif par faux
```

## Les actions et les messages | Actions and messages | actions

### Afficher un message | Show a message
```humalis action
afficher "Prêt"
afficher reussite "Enregistré"
afficher erreur "Écris ton message"
afficher avertissement "Pense à vérifier ton email" pendant 10 secondes
```

### Aller vers une autre page | Go to another page
```humalis action
rediriger vers "contact"
```

### Demander confirmation | Ask for confirmation
```humalis action
confirmer "Vider le panier ?" avec oui "Vider" et non "Garder" :
    changer panier par []
sinon :
    afficher "Rien n'a été retiré"
```

### Ouvrir une fenêtre | Open a dialog
```humalis page
bouton "Ouvrir l'aide"
quand l'utilisateur clique sur "Ouvrir l'aide" :
    montrer "Raccourcis"
fenetre "Raccourcis" avec description "Les touches utiles" :
    texte "Ctrl+K ouvre cette aide."
```

### Montrer, cacher un élément nommé | Show, hide a named element
```humalis page
texte "Connexion en cours…" avec nom "attente"
quand la page se charge :
    cacher "attente"
```

### Copier, partager | Copy, share
```humalis action
copier nom avec message "Copié"
partager "Viens voir la boutique" avec titre "La boutique" avec lien vers "contact"
```

## Le serveur | The server | serveur

### Déclarer des données | Declare data
```humalis complet
serveur "bibliotheque" :
    donnee livre :
        titre : texte
        pages : nombre
        disponible : booleen
        parution : date
        auteurs : liste de texte
    route "livres" :
        tout le monde peut lire livre
```

### Dire qui a le droit | Say who is allowed
```humalis route
tout le monde peut lire avis
connecte peut creer avis
seul admin peut modifier avis
seul admin peut supprimer avis
```

### Chacun agit seulement sur ce qu'il a créé | Each person acts only on what they created
```humalis route
connecte peut creer avis
seul son auteur peut modifier et supprimer avis
```

### Lire une fiche seulement avec son identifiant | Read a record only with its identifier
```humalis route
tout le monde peut lire avis par identifiant
```

### Un champ que le serveur calcule | A field the server calculates
```humalis donnee
quantite : nombre calcule nombre de refs
montant : nombre calcule somme prix de produit par refs
```

### Une valeur de départ imposée | An enforced starting value
```humalis donnee
statut : texte au depart "en_attente"
jour : date au depart aujourd'hui
```

### Renommer un champ sans perdre les fiches écrites | Rename a field without losing written records
```humalis donnee
telephone : texte (avant "tel")
```

### Écrire des fiches au premier démarrage | Write records on first start
```humalis complet
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
    donnees de depart pour produit :
        nom "Café", prix 3
        nom "Thé", prix 2
```

### Limiter ce que le client peut envoyer | Limit what the client can send
```humalis donnee
frais : nombre au plus prix de zone par commune
contenu : liste de texte non vide
photos : liste de texte du site
```

### Réagir à une création | React to a creation
```humalis commande
quand commande est cree :
    creer suivi avec etape "en_attente" et total commande.total dans commande.suivi
```

### Envoyer des e-mails, inviter, gérer l'oubli | Send email, invite, handle forgotten passwords
```humalis complet
serveur "boutique" :
    connexion google
    emails par brevo
    invitations vers "bienvenue"
    mot de passe oublie vers "bienvenue"

page "bienvenue" :
    titre "Bienvenue"
```

### Garder la clé d'un service sur le serveur | Keep a service's key on the server
```humalis complet
serveur "site" :
    donnee note :
        texte : texte
    route "notes" :
        tout le monde peut lire note

source "meteo" :
    adresse "https://api.meteo.example"
    jeton secret depuis l'environnement "METEO_CLE" dans le parametre "key"
    route "previsions" :
        tout le monde peut lire une liste de prevision dans "jours"
    donnee prevision :
        jour : texte

page "meteo" :
    variable previsions = []
    titre "Météo"
    quand la page se charge :
        envoyer requete vers "previsions" de la source "meteo" dans previsions
```

## Relier les pages au serveur | Connecting pages to the server | relier

### Charger des données | Load data
```humalis page
quand la page se charge :
    envoyer requete vers "produits" dans produits
```

### Envoyer des données | Send data
```humalis action
envoyer requete vers "commandes" avec nom et champ "Nom"
```

### Modifier, supprimer une fiche | Change, delete a record
```humalis page
pour chaque piece dans articles :
    bouton "Solder" avec nom "solder"
    quand l'utilisateur clique sur "solder" :
        modifier piece dans "produits" avec prix = 5
    bouton "Retirer" avec nom "retirer"
    quand l'utilisateur clique sur "retirer" :
        supprimer piece de "produits"
```

### Gérer une erreur | Handle an error
```humalis action
essayer :
    envoyer requete vers "commandes" avec nom
    afficher reussite "Commande envoyée"
si erreur :
    afficher erreur "La commande n'est pas partie : {raison}"
```

### Se connecter, se déconnecter | Sign in, sign out
```humalis action
se connecter avec champ "Email" et champ "Nom"
se deconnecter
```

### Se connecter avec Google | Sign in with Google
```humalis action
se connecter avec google
```

### Inviter, gérer le mot de passe | Invite, manage the password
```humalis action
inviter champ "Email" comme admin
demander un lien de mot de passe pour champ "Email"
choisir le mot de passe avec champ "Nom"
changer le mot de passe avec champ "Nom" et champ "Email"
```

### Se connecter par clé d'accès, activer le code à six chiffres | Sign in with a passkey, turn on the six-digit code
```humalis complet
serveur "boutique" :
    connexion par cle d'acces
    double authentification
    donnee note :
        titre : texte
    route "notes" :
        connecte peut lire note

page "compte" :
    titre "Compte"
    bouton "Face ID"
    quand l'utilisateur clique sur "Face ID" :
        se connecter par cle d'acces
    bouton "Ajouter une clé"
    quand l'utilisateur clique sur "Ajouter une clé" :
        ajouter cle d'acces
    bouton "Code à six chiffres"
    quand l'utilisateur clique sur "Code à six chiffres" :
        activer double authentification
```

## Le site, les langues et le reste | The site, languages and the rest | site

### Présenter le site | Describe the site
```humalis racine
site :
    nom "Le Comptoir"
    description "Une cuisine de saison au cœur de la ville, ouverte du lundi au samedi."
    logo "./logo.svg"
    adresse "https://lecomptoir.fr"
```

### Présenter une page aux moteurs de recherche | Describe a page to search engines
```humalis page
apercu :
    titre "Qui sommes-nous"
    description "L'histoire du Comptoir, une cuisine de saison née en 2020 au cœur de la ville."
```

### Cacher une page aux moteurs de recherche | Hide a page from search engines
```humalis page
apercu :
    indexation non
```

### Traduire | Translate
```humalis racine
langues :
    francais
    anglais

page "bonjour" :
    selecteur de langue
    titre "Bienvenue" en anglais "Welcome"
```

### Donner à chaque langue sa propre adresse (`/en/…`) | Give each language its own address (`/en/…`)
```humalis racine
langues : francais, anglais avec adresse par langue

page "bonjour" :
    titre "Bienvenue" en anglais "Welcome"
```

### Traduire en espagnol, portugais, swahili ou lingala | Translate into Spanish, Portuguese, Swahili or Lingala
```humalis racine
langues : francais, espagnol, swahili

page "bonjour" :
    titre "Bienvenue" en espagnol "Bienvenido" en swahili "Karibu"
```

### Lire les données d'un fichier | Read data from a file
```humalis racine
utiliser donnees "clients" depuis "./clients.csv"
```

### Écrire une fonction | Write a function
```humalis racine
fonction prix_ttc avec montant :
    rendre montant * 1,2

page "tarif" :
    calcul ttc = prix_ttc(50)
    texte "{ttc en euros}"
```

### Écrire un composant | Write a component
```humalis racine
composant "Fiche" :
    parametre nom
    texte nom

page "vitrine" :
    Fiche avec nom "Livre"
```

### Ajouter une scène 3D | Add a 3D scene
```humalis racine
utiliser module "Scene3D" depuis "./modules/Scene3D"

page "accueil" :
    Scene3D avec couleur "#c1e928"
```

### Écrire un test | Write a test
```humalis racine
page "salut" :
    bouton "Dire bonjour"
    quand l'utilisateur clique sur "Dire bonjour" :
        afficher "Bonjour !"

test "le bouton dit bonjour" de page "salut" :
    cliquer sur "Dire bonjour"
    verifier que texte "Bonjour !" est visible
```

## Les commandes | Commands | commandes

### Installer et créer un projet | Install and create a project
```terminal
npm install -g humalis
humalis nouveau mon-projet
```

### Lancer un fichier tout de suite, sans rien installer | Run a file right away, without installing anything
```terminal
humalis lancer mon-fichier.humalis
```

### Voir le site pendant que tu écris | See the site as you write
```terminal
humalis developper
```

### Chercher les erreurs | Look for errors
```terminal
humalis verifier mon-projet.humalis
```

### Remettre en forme | Tidy the formatting
```terminal
humalis formater mon-projet.humalis
```

### Lancer les tests | Run the tests
```terminal
humalis tester
```

### Produire le projet : web, statique, mobile, desktop ou serveur | Build the project: web, statique, mobile, desktop or serveur
```terminal
humalis compile mon-projet.humalis --cible web --sortie mon-site
```

### Produire le site en React | Build the site with React
```terminal
humalis compile mon-projet.humalis --cible web --moteur react --sortie mon-site
```

## Les pièges | Common traps | pieges

### Une comparaison a besoin de `est` | A comparison needs `est`
```faux page
si note > 10 :
    texte "Bien"
```
```humalis page
si note est superieure a 10 :
    texte "Bien"
```

### `est` a besoin d'une comparaison | `est` needs a comparison
```faux page
si note est 10 :
    texte "Dix"
```
```humalis page
si note est egale a 10 :
    texte "Dix"
```

### Pas d'égal pour changer une valeur | No equals sign to change a value
```faux action
note = 3
```
```humalis action
changer note par 3
```

### `changer` va toujours avec `par` | `changer` always goes with `par`
```faux action
changer note en 3
```
```humalis action
changer note par 3
```

### Une variable se déclare avec `=` | A variable is declared with `=`
```faux page
variable compte vaut 3
```
```humalis page
variable compte = 3
```

### Un seul `avec` par élément | Only one `avec` per element
```faux page
texte "Bonjour" avec couleur bleu avec taille grande
```
```humalis page
texte "Bonjour" avec couleur bleu et taille grande
```

### Pas de virgule entre les options | No comma between options
```faux page
texte "Bonjour" avec couleur bleu, taille grande
```
```humalis page
texte "Bonjour" avec couleur bleu et taille grande
```

### Le texte d'un bouton va entre guillemets | A button's text goes in quotes
```faux page
bouton Valider
```
```humalis page
bouton "Valider"
```

### Le nom d'une page va entre guillemets | A page name goes in quotes
```faux page
lien "Contact" vers contact
```
```humalis page
lien "Contact" vers "contact"
```

### Pour changer de page : `rediriger vers` | To change page: `rediriger vers`
```faux action
aller vers "contact"
```
```humalis action
rediriger vers "contact"
```

### Un clic s'écrit toujours pareil | A click is always written the same way
```faux page
quand on clique sur "Commander" :
    afficher "Bien"
```
```humalis page
quand l'utilisateur clique sur "Commander" :
    afficher "Bien"
```

### Pour parcourir : `pour chaque … dans` | To go through a list: `pour chaque … dans`
```faux page
pour chaque p de panier :
    texte p
```
```humalis page
pour chaque p dans panier :
    texte p
```

### Pas de « alors » : le bloc s'ouvre par `:` | No « alors »: the block opens with `:`
```faux page
si note est superieure a 10 alors :
    texte "Bien"
```
```humalis page
si note est superieure a 10 :
    texte "Bien"
```

### Une requête s'écrit `envoyer requete vers` | A request is written `envoyer requete vers`
```faux action
envoyer "produits" dans produits
```
```humalis action
envoyer requete vers "produits" dans produits
```

### Une durée s'écrit en toutes lettres | A duration is written in full
```faux action
afficher "Prêt" pendant 3 s
```
```humalis action
afficher "Prêt" pendant 3 secondes
```

### Capturer une erreur | Capture an error

```humalis
quand une erreur arrive :
    envoyer requete vers "https://centrale.exemple.fr/v1/envoi" avec message = erreur.message et pile = erreur.pile
```

## Médias | Media | medias

### Enregistrer ou recadrer | Record or crop

```humalis
page "memo" :
    titre "Mémo"
    variable note = rien
    variable clip = rien
    variable facture = rien
    variable photo = rien
    bouton "Audio"
    quand l'utilisateur clique sur "Audio" :
        enregistrer audio dans note
    bouton "Vidéo"
    quand l'utilisateur clique sur "Vidéo" :
        enregistrer video dans clip
    bouton "Document"
    quand l'utilisateur clique sur "Document" :
        scanner document dans facture
    bouton "Recadrer"
    quand l'utilisateur clique sur "Recadrer" :
        recadrer photo
```
