# Humalis — Exemples de référence

Date : 2026-08-15 (mis à jour le 2026-10-29)

Ces exemples servent de base à la grammaire et de suite de tests
bout-en-bout. **Ils sont vérifiés par `tests/exemples-doc.test.ts`** :

- un bloc qui commence par `page` est un programme complet : il doit
  compiler sans erreur (les avertissements sont permis) ;
- un autre bloc est un fragment : il est placé dans une page, puis il doit
  être accepté par le parser. Un fragment peut viser un élément ou une
  variable qu'il ne déclare pas : seule sa syntaxe est vérifiée.

## Structure de page

```humalis
page "accueil" :
    titre "Bienvenue sur mon site"
```

```humalis
page "contact" :
    texte "Contactez-nous ici"
```

```humalis
page "accueil" :
    titre "Bienvenue"
    texte "Ceci est la page d'accueil"
```

```humalis
page "profil" :
    image "photo_profil.png" avec description "Photo de profil"
```

```humalis
page "accueil" :
    lien "En savoir plus" vers "apropos"
```

## Style visuel

```humalis
titre "Bienvenue" avec couleur bleu et taille grande

bouton "Valider" avec fond vert et texte blanc

texte "Attention" avec couleur rouge

titre "Titre" avec position centrée

bouton "Annuler" avec fond gris et bordure arrondie
```

## Le CSS fait son travail

Humalis s'occupe des composants ; l'apparence fine se règle en CSS
(décision W8). `avec style "…"` donne des classes CSS à un élément. Le
CSS s'écrit dans un bloc `style :` en haut du fichier, recopié tel quel
comme la balise `<style>` en HTML, ou dans un fichier séparé avec
`utiliser style "./theme.css"`. Il est chargé après les styles de
Humalis : il peut redéfinir les raccourcis (`avec fond vert`…).

```humalis
style :
    .grand-titre {
        font-size: 3rem;
        color: #1f5fbf;
    }
    .principal:hover { opacity: 0.9; }

page "accueil" :
    titre "Bienvenue" avec style "grand-titre"
    bouton "Commencer" avec fond vert et style "principal"
```

Le CSS ne vaut que pour le web (et le desktop) : le style du mobile sera
décidé à l'étape 5.

## La mise en page : section, bloc, ligne, colonne, grille

Humalis donne la structure, le CSS l'apparence (décision F3). Un bloc
regroupe des éléments : `section "Titre" :` (une partie de page et son
titre), `bloc :` (une boîte), `ligne :` (côte à côte), `colonne :` (les uns
sous les autres), `grille :` (des colonnes selon la largeur de l'écran).
Chacun accepte `avec style "…"` et les styles nommés. Ces mots ne sont des
blocs qu'en tête de ligne, suivis de `:`, de `avec` ou du titre d'une
section : `variable ligne = 1` reste permis.

```humalis
page "carte" :
    variable plats = ["Poisson braisé", "Liboke", "Pondu"]
    section "La carte" avec style "carte" :
        grille :
            pour chaque plat dans plats :
                bloc avec style "fiche" :
                    texte plat
                    bouton "Choisir"
                    quand l'utilisateur clique sur "Choisir" :
                        afficher "{plat} : bon choix"
        ligne :
            lien "Réserver" vers "reservation"
            lien "Accueil" vers "accueil"
```

## Régler la mise en page, selon l'appareil, avec un thème

Quelques réglages nommés.
Le reste est du CSS (`avec style "…"`).

```humalis
page "accueil" :
    section "Nos plats" avec largeur large et remplissage grande :
        grille avec colonnes 3 et espacement moyenne :
            bloc avec ombre legere et bordure douce et remplissage moyenne :
                texte "Poisson braisé"
    ligne avec repartition entre et alignement centre :
        lien "Accueil" vers "accueil"
        bouton "Réserver"
    bloc avec degrade bleu vers violet et colle :
        texte "Toujours visible, en dégradé"
```

- `colonnes 1` à `6` (grille, sur ordinateur ; 2 au plus sur tablette, 1 sur
  téléphone), `espacement` et `remplissage` (`aucune`, `petite`, `moyenne`,
  `grande`), `alignement` (`debut`, `centre`, `fin`, `etire`),
  `repartition` (`debut`, `centre`, `fin`, `entre`, `autour`), `largeur`
  (`etroite`, `normale`, `large`, `pleine`), `ombre` (`aucune`, `legere`,
  `moyenne`, `forte`), `bordure` (`arrondie`, `carree`, `douce`, `ronde`).
- `degrade bleu vers violet` (puis `vertical` ou `horizontal`), `colle`
  (en haut) et `colle en bas`.
- Chaque réglage dit où il se règle : `colonnes` seulement sur une grille.

**Selon l'appareil** : `sur telephone :`, `sur tablette ou ordinateur :`.
Téléphone : moins de 640 px ; tablette : de 640 à 1023 px ; ordinateur :
1024 px et plus. Sur le web, c'est du CSS seul (le HTML prérendu est le
même partout).

**Un thème** : le bloc `theme :` donne les couleurs (claires et sombres), les
polices, le mode et la largeur des pages. Une couleur du thème s'emploie
comme `bleu` ou `rouge`. `changer theme par sombre` laisse le visiteur
choisir (gardé dans le navigateur).

```humalis
theme :
    couleur marque clair "#0e5a6b" sombre "#5fc3d6"
    police titres "Playfair Display" depuis "./playfair.woff2"
    mode automatique

entete avec colle :
    ligne avec repartition entre :
        lien "Le Fleuve" vers "accueil"
        bouton "Mode sombre" avec nom "bascule"
        quand l'utilisateur clique sur "bascule" :
            changer theme par sombre

pied :
    texte "Ouvert de mardi à dimanche"

page "accueil" :
    titre "Bienvenue" avec couleur marque

page "connexion" sans entete et sans pied :
    titre "Connexion"
```

`entete :` et `pied :` sont communs à toutes les pages (sauf `sans entete`,
`sans pied`) ; il n'y en a qu'un de chaque.

## Les éléments d'écran : icônes, onglets, accordéon, carrousel…

Ces mots ne sont des éléments qu'en tête de ligne, suivis de ce qu'ils attendent :
`variable compteur = 0` reste permis.

```humalis
page "plat" :
    variable note = 3
    variable quantite = 1
    calcul total = quantite * 28000
    fil d'Ariane :
        lien "Accueil" vers "plat"
        texte "Poisson braisé"
    icone "panier" avec taille grande et description "Panier"
    bouton "Ajouter" avec icone "plus"
    badge "Nouveau" avec fond vert
    avatar "Camille Martin" avec photo "camille.jpg"
    etoiles note avec modifiable
    compteur quantite avec minimum 1 et maximum 10
    texte "Total : {total} FC"
    progression 40 avec pourcentage
    chargement "Un instant…"
    onglets :
        onglet "Description" avec icone "document" :
            texte "Poisson braisé, riz et banane plantain."
        onglet "Avis" :
            texte "Un régal."
    accordeon :
        deroulant "Annulation" avec ouvert :
            texte "Jusqu'à 24 heures avant."
        deroulant "Paiement" :
            texte "Sur place."
    carrousel avec automatique 5 et visibles 1 :
        image "salle.jpg" avec description "La salle du restaurant"
        image "terrasse.jpg" avec description "La terrasse au bord du fleuve"
    code qr "https://lefleuve.cd/plat/poisson" avec taille petite
```

- `icone "nom"` : une icône vectorielle de Lucide (jamais un émoji), noms
  français d'une liste fermée (alias acceptés, suggestion si le nom est
  inconnu) ; `avec icone "…"` sur un bouton, un lien, un titre, un texte, un
  onglet.
- `badge`, `avatar` (photo ou initiales), `progression` (`maximum`,
  `pourcentage`, `rien` pour une barre sans fin), `chargement`, `etoiles`
  (demi-étoiles ; `modifiable` change la variable), `compteur` (lié à une
  variable nombre, borné par `minimum` et `maximum`), `code qr` (deux mots).
- `onglets :` / `onglet "Titre" :`, `deroulant "Titre" :`, `accordeon :`
  (un seul ouvert, ou `avec plusieurs`), `carrousel :` (`automatique`,
  `visibles`), `fil d'Ariane :` (liens, puis le texte de la page en cours).
- `avec description "…"` : le texte qu'un lecteur d'écran lit.

## Nommer un élément

Un élément se désigne par son libellé (`"Se connecter"`) ou par un nom
donné avec `avec nom "…"`. Le compilateur cherche d'abord le nom.

```humalis
page "connexion" :
    champ "email"
    bouton "Se connecter" avec fond vert et nom "connexion"
    quand l'utilisateur clique sur "connexion" :
        afficher "Connexion en cours"
```

## Événements et actions simples

```humalis
quand l'utilisateur clique sur "bouton_connexion" :
    afficher "Connexion en cours"

quand l'utilisateur survole "image_produit" :
    afficher "Aperçu du produit"

quand la page se charge :
    afficher "Chargement terminé"

quand l'utilisateur clique sur "bouton_menu" :
    montrer "menu_deroulant"

quand l'utilisateur clique sur "fermer" :
    cacher "popup_bienvenue"

quand le formulaire "connexion" est soumis :
    afficher "Formulaire envoyé"

quand l'utilisateur clique sur "voir_plus" :
    changer texte de "description" par "Description complète ici"

quand l'utilisateur clique sur "lien_accueil" :
    rediriger vers "accueil"
```

`afficher "…"` montre toujours un message. Pour faire apparaître ou
disparaître un élément, on écrit `montrer "…"` et `cacher "…"`.

Un événement s'écrit là où est son élément (décision F2) : dans la page,
une boucle, un `si`, un `sinon`, un bloc ou un formulaire. Jamais dans un
autre événement.

```humalis
page "compteur" :
    variable clics = 0
    texte "Clics : {clics}"
    si clics est inferieur a 3 :
        bouton "Encore"
        quand l'utilisateur clique sur "Encore" :
            changer clics par clics + 1
```

## Variables

```humalis
variable note = 12

variable nom_utilisateur = "Camille"

variable connecte = faux

variable panier_vide = vrai

variable age = 22
```

Pour changer la valeur d'une variable déjà déclarée :

```humalis
page "compteur" :
    variable clics = 0
    texte "Vous avez cliqué {clics} fois"
    bouton "Remettre à zéro"
    quand l'utilisateur clique sur "Remettre à zéro" :
        changer clics par 0
```

## Conditions

```humalis
si note est inférieure à 10 :
    afficher "Échec"
sinon :
    afficher "Réussite"

si connecte est vrai :
    montrer "menu_utilisateur"
sinon :
    montrer "bouton_connexion"

si age est supérieur ou égal à 18 :
    afficher "Accès autorisé"
sinon :
    afficher "Accès refusé"

si panier_vide est vrai :
    afficher "Votre panier est vide"
```

## Listes et boucles

```humalis
variable produits = ["Pomme", "Banane", "Orange"]

pour chaque nom dans produits :
    afficher nom

variable eleves = ["Marie", "Jean", "Awa"]

pour chaque nom dans eleves :
    texte nom avec couleur bleu
```

Une liste vide se teste avant la boucle :

```humalis
page "panier" :
    variable panier = []
    si panier est vide :
        afficher "Le panier est vide"
    sinon :
        pour chaque nom dans panier :
            afficher nom
```

```humalis
page "resultats" :
    variable notes = [8, 14, 11]
    pour chaque note dans notes :
        si note est inférieure à 10 :
            afficher "Échec pour {note}"
        sinon :
            afficher "Réussite pour {note}"
```

## Calculs et listes

Les calculs se font sur des nombres, avec `+`, `-`, `*`, `/` et des
parenthèses. Pour coller du texte, on utilise `{…}` dans les guillemets.

```humalis
page "compteur" :
    variable clics = 0
    texte "Vous avez cliqué {clics} fois"
    bouton "Cliquer"
    quand l'utilisateur clique sur "Cliquer" :
        changer clics par clics + 1
```

`calcul` déclare une valeur qui **se recalcule seule** quand ce dont elle
dépend change. On ne peut pas la changer avec `changer … par`.

```humalis
page "devis" :
    variable prix = 20
    variable quantite = 3
    calcul total = (prix * quantite) + 5
    texte "Total, livraison comprise : {total} €"
```

`ajouter … à …`, `retirer … de …` et `nombre de …` travaillent sur les
listes. Un événement écrit **dans une boucle** sait sur quel élément on a
cliqué : il voit la variable de la boucle.

```humalis
page "boutique" :
    variable produits = ["Livre", "Stylo", "Cahier"]
    variable panier = []
    calcul nombre_articles = nombre de panier
    texte "Articles dans le panier : {nombre_articles}"
    pour chaque nom dans produits :
        texte nom
        bouton "Ajouter"
        quand l'utilisateur clique sur "Ajouter" :
            ajouter nom à panier
        bouton "Retirer"
        quand l'utilisateur clique sur "Retirer" :
            retirer nom de panier
```

## Partager une variable entre les pages

Une variable écrite **en haut du fichier** avec `avec partagee` est vue et
modifiée par toutes les pages. Avec `avec memorisee`, elle est aussi
gardée après un rechargement (dans le navigateur). `memorisee` marche
aussi sur une variable de page.

```humalis
variable panier = [] avec partagee et memorisee

page "boutique" :
    calcul nombre_articles = nombre de panier
    texte "Articles : {nombre_articles}"
    bouton "Ajouter un livre"
    quand l'utilisateur clique sur "Ajouter un livre" :
        ajouter "Livre" à panier
    lien "Voir le panier" vers "panier"

page "panier" :
    titre "Votre panier"
    pour chaque nom dans panier :
        texte nom
    lien "Retour" vers "boutique"
```

`avec memorisee en secret` est refusé sur le web : le navigateur n'a pas
de coffre sûr pour un secret. La connexion passera par les packs Astratra.

## Composants : React et Humalis

Un composant React existant s'utilise depuis Humalis (`utiliser
composant`) ; un composant s'écrit aussi en Humalis (`composant "…" :`,
avec ses paramètres). Dans une page, un nom qui commence par une
majuscule est un composant ; ses propriétés suivent `avec`.

```humalis
utiliser composant "Carte" depuis "./composants/Carte"

composant "Fiche" :
    parametre nom
    parametre prix
    texte nom
    texte "{prix} €"

page "accueil" :
    variable prix_minimum = 2
    Carte avec titre "Fournitures scolaires" et prix prix_minimum
    Fiche avec nom "Livre" et prix 12
```

Le fichier React est cherché à côté du fichier Humalis et recopié dans le
projet produit. Il exporte son composant par défaut.

## Requêtes

`envoyer requete vers "…"` lit des données, ou en envoie avec `avec`.
`dans` range la réponse dans une variable.

```humalis
page "catalogue" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "/produits" dans produits
    pour chaque nom dans produits :
        texte nom
```

```humalis
page "inscription" :
    champ "email"
    bouton "S'inscrire"
    quand l'utilisateur clique sur "S'inscrire" :
        si le champ "email" est vide :
            afficher erreur "Email requis"
        sinon :
            envoyer requete vers "/inscription" avec le champ "email"
            afficher "Merci !"
```

## Commentaires

Tout ce qui suit `#` jusqu'à la fin de la ligne est ignoré, sauf entre
guillemets.

```humalis
# La page d'accueil du site
page "accueil" :
    titre "Article #1"    # le # entre guillemets reste du texte
```

## Le serveur

Un bloc `serveur` décrit les **données** (des champs typés : `texte`,
`nombre`, `booleen`, `date`, `liste de …`), les **routes** (`route
"produits"` donne `/api/produits`) et **qui peut faire quoi** : `tout le
monde`, `connecte` ou `seul admin` peut `lire`, `creer`, `modifier` ou
`supprimer`. `modifier` couvre aussi créer et supprimer quand ils n'ont pas
leur propre règle. **Une action sans règle est refusée à tout le monde.**

```humalis
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
        disponible : booleen
    donnee avis :
        produit : texte
        note : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
    route "avis" :
        tout le monde peut lire avis
        connecte peut creer avis
        seul admin peut modifier avis
```

La connexion, les sessions, les rôles et les protections viennent des
packs Astratra : Humalis n'invente aucune sécurité.

## Le lien écran ↔ serveur

Quand le serveur et les pages sont dans le même fichier, une page lit les
données de son serveur avec `envoyer requete`, et le point lit un champ
(`p.nom`, `{p.prix}`). Le compilateur vérifie tout avant de lancer quoi
que ce soit : la route existe, le champ existe, son type est le bon.

```humalis
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit

page "boutique" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" dans produits
    pour chaque p dans produits :
        texte p.nom
        texte "{p.prix} €"
```

Avec `texte p.prixx`, le compilateur répond : « le champ « prixx » n'existe
pas dans la donnée « produit ». Champs : nom, prix ».

## La connexion depuis une page

Avec le serveur dans le même fichier, une page connecte la personne
(`se connecter avec champ "email" et champ "mot de passe"`), sait si elle
est connectée (`si utilisateur est connecte :`, ou `admin`), et la
déconnecte (`se deconnecter`). La session est gardée par le serveur (un
cookie que la page ne peut pas lire) : la page ne garde jamais le mot de
passe, qui est effacé de son champ dès l'envoi.

```humalis
serveur "avis" :
    donnee avis :
        commentaire : texte
    route "avis" :
        tout le monde peut lire avis
        connecte peut creer avis

page "avis" :
    si utilisateur est connecte :
        champ "commentaire"
        bouton "Publier"
        bouton "Se déconnecter"
    sinon :
        champ "email"
        champ "mot de passe"
        bouton "Se connecter"
    quand l'utilisateur clique sur "Se connecter" :
        se connecter avec champ "email" et champ "mot de passe"
        afficher "Bienvenue"
    quand l'utilisateur clique sur "Publier" :
        envoyer requete vers "avis" avec champ "commentaire"
    quand l'utilisateur clique sur "Se déconnecter" :
        se deconnecter
```

Si la connexion échoue, la page affiche « Email ou mot de passe
incorrect. » (sans dire lequel des deux) et la suite de l'événement ne
s'exécute pas : « Bienvenue » ne s'affiche qu'après une connexion réussie.
Cacher le bouton « Publier » ne protège rien : c'est la règle `connecte
peut creer avis` du serveur qui refuse un visiteur.


## Modifier et supprimer sur le serveur

Une page change ou supprime une donnée lue sur une route. `supprimer … de`
agit sur le serveur, à ne pas confondre avec `retirer … de`, qui ne change
que la liste de la page. Le compilateur vérifie la route, les champs, leurs
types, et prévient si la règle d'accès refusera un visiteur.

```humalis
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit

page "gestion" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" dans produits
    si utilisateur est admin :
        pour chaque p dans produits :
            texte "{p.nom} : {p.prix} €"
            bouton "Baisser le prix"
            quand l'utilisateur clique sur "Baisser le prix" :
                modifier p dans "produits" avec prix = p.prix - 1
                envoyer requete vers "produits" dans produits
            bouton "Supprimer"
            quand l'utilisateur clique sur "Supprimer" :
                supprimer p de "produits"
                envoyer requete vers "produits" dans produits
```

## Une page par produit

Une page peut recevoir une valeur dans son adresse (`/produit/42`). Un lien
la lui donne ; la page lit ce seul élément sur le serveur. Tant que le
serveur n'a pas répondu, la variable vaut `rien`.

```humalis
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit

page "catalogue" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" dans produits
    pour chaque p dans produits :
        lien p.nom vers "produit" avec id p.id

page "produit" avec parametre id :
    variable produit = rien
    quand la page se charge :
        envoyer requete vers "produits" avec id dans produit
    si produit est rien :
        texte "Chargement du produit…"
    sinon :
        titre produit.nom
        texte "{produit.prix} €"
```

`p.id` est l'identifiant que le serveur donne à chaque donnée. Un lien qui
oublie le paramètre est refusé, comme un paramètre que la page ne connaît
pas. `rediriger vers "produit" avec id p.id` marche aussi.
## Les formulaires

Un bloc `formulaire "…" :` regroupe des champs et un bouton. La touche
Entrée dans un champ, ou le bouton, l'envoie ; `quand le formulaire "…"
est soumis :` dit ce qui se passe. Avant l'envoi, les champs obligatoires
et la forme des valeurs sont vérifiés (un message en français dit quoi
corriger) ; après un envoi réussi, les champs sont vidés. Si le serveur
refuse l'envoi, l'événement s'arrête et les champs restent remplis.

```humalis
serveur "contact" :
    donnee message :
        email : texte
        contenu : texte
    route "messages" :
        tout le monde peut creer message
        seul admin peut lire message

page "contact" :
    formulaire "message" :
        champ email "email" avec obligatoire et indice "vous@exemple.cd"
        champ texte long "contenu" avec obligatoire
        bouton "Envoyer"
    quand le formulaire "message" est soumis :
        envoyer requete vers "messages" avec champ "email" et champ "contenu"
        afficher "Merci !"
```

La sorte d'un champ s'écrit juste après `champ`, avant son libellé ; sans
sorte, c'est un texte d'une ligne. Un champ `nombre` vaut un nombre, une
case à cocher vrai ou faux, les autres un texte.

```humalis
page "inscription" :
    variable pays = ["Congo", "Belgique", "France"]
    formulaire "inscription" :
        champ "Nom" avec obligatoire
        champ email "Email"
        champ telephone "Téléphone"
        champ nombre "Âge" avec minimum 12 et maximum 120
        champ date "Naissance"
        champ heure "Heure d'arrivée"
        champ mot de passe "Mot de passe"
        champ texte long "Présentation" avec indice "Quelques mots sur vous"
        champ adresse web "Site"
        case a cocher "J'accepte les conditions" avec obligatoire
        choix "Taille" parmi ["S", "M", "L"]
        liste deroulante "Pays" parmi pays avec indice "Choisissez un pays"
        bouton "S'inscrire"
    quand le formulaire "inscription" est soumis :
        si champ "Âge" est inferieur a 18 :
            afficher "Une personne majeure vous accompagnera."
        afficher "Bienvenue !"
```

`mot de passe` s'écrit aussi `mot_de_passe`, `texte long` aussi
`texte_long`, `case à cocher` avec ou sans accent. `minimum` et `maximum`
ne valent que pour un champ `nombre` ; `indice` n'a pas de sens sur une
case à cocher ni sur un choix : le compilateur le dit.

## Le même programme sur le téléphone

Rien ne change dans le langage : `--cible mobile` traduit les mêmes pages
pour iPhone et Android (Expo). `titre` et `texte` deviennent des `Text`,
`bouton` un `Pressable`, `champ` un `TextInput`. `avec fond vert` et les
autres styles nommés sont traduits. Le CSS (`style :`, `avec style "…"`)
ne s'applique pas sur le téléphone : Humalis le signale sans bloquer. Le
survol non plus, faute de souris.

```sh
humalis compile boutique.humalis --cible mobile --sortie boutique-mobile
cd boutique-mobile && npm install && npx expo start
```

Sur le téléphone, `memorisee en secret` est permis : la valeur va dans le
coffre du téléphone (Keychain, Keystore).

## Le même programme en site statique

Rien ne change non plus : `--cible statique` écrit un site en HTML, CSS et
JavaScript écrit en clair, sans framework et sans construction. Chaque
page devient un fichier (`index.html` pour l'entrée, `panier.html`…) qui
contient déjà son contenu, lisible sans JavaScript ; un petit script le
redessine après chaque événement. On le dépose tel quel chez un hébergeur,
ou on ouvre `index.html` d'un double clic.

```sh
humalis compile boutique.humalis --cible statique --sortie boutique-site
```

Une variable `partagee` passe d'une page à l'autre le temps de la visite ;
`memorisee` la garde au retour du visiteur. Un composant React (`utiliser
composant … depuis`) est refusé : un site statique n'a pas React. Écris-le
en Humalis (`composant "…" :`).

## Un projet en plusieurs fichiers

Quand une application grandit, chaque partie peut avoir son fichier.
`utiliser fichier "…"` ajoute au projet les pages, les composants, les
variables partagées et le serveur d'un autre fichier. Le chemin part du
fichier qui l'écrit. Chaque fichier n'est lu qu'une fois ; deux fichiers qui
s'utilisent en boucle sont refusés, et une erreur dans un fichier utilisé
donne son nom et sa ligne. Il y a un seul serveur par application.

<!-- fichier "boutique.humalis" -->
```humalis
utiliser fichier "./panier.humalis"

page "boutique" :
    titre "Nos produits"
    bouton "Ajouter un livre"
    quand l'utilisateur clique sur "Ajouter un livre" :
        ajouter "Livre" à panier
    lien "Voir le panier" vers "panier"
```

<!-- fichier "panier.humalis" -->
```humalis
variable panier = [] avec partagee

page "panier" :
    titre "Votre panier"
    pour chaque nom dans panier :
        texte nom
    lien "Retour à la boutique" vers "boutique"
```
## Le même programme sur l'ordinateur

Rien ne change non plus : `--cible desktop` ouvre les pages du web, telles
quelles, dans une fenêtre Electron (Mac, Windows, Linux), avec un menu en
français. Le CSS et le survol y marchent comme sur le web.

```sh
humalis compile boutique.humalis --cible desktop --sortie boutique-desktop
cd boutique-desktop && npm install && npm start
```

Les requêtes vers le serveur passent par l'application : son adresse se
donne avec `--serveur https://…` (ou `HUMALIS_SERVEUR` au lancement). Sur
l'ordinateur, `memorisee en secret` est permis : la valeur est chiffrée
dans le coffre du système (le trousseau sur Mac).

## Une API qui existe déjà : le bloc source

Un bloc `source "nom" :` décrit une API existante : son adresse, comment
s'y présenter et (facultatif) la forme de ses réponses. Une page l'appelle
avec `de la source "nom"` après l'adresse. Le compilateur vérifie la
source, la route, les champs et leurs types, comme pour un serveur du
fichier. Sans route déclarée, la requête reste permise, non vérifiée.

```humalis
source "boutique" :
    adresse "http://127.0.0.1:4420"
    enveloppe "data"
    erreur dans "message"
    donnee produit :
        id : texte
        name : texte
        price : nombre
        category : texte
    route "api/shop/products" :
        lire une liste de produit dans "products"
        lire un produit dans "product"

page "catalogue" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "api/shop/products" de la source "boutique" dans produits
    pour chaque p dans produits :
        lien p.name vers "produit" avec id p.id
    bouton "Maillots"
    quand l'utilisateur clique sur "Maillots" :
        envoyer requete vers "api/shop/products" de la source "boutique" filtrant par categorie = "maillots" dans produits
```

- `enveloppe "data"` : la valeur utile est sous `data` dans la réponse ;
  `dans "products"` (sur une ligne de route) : puis sous `products`.
- `filtrant par k = v et …` ajoute `?k=v` à une lecture ; une valeur `rien`
  est omise. (`selon` sert au choix entre des cas.)
- Les lectures sont réessayées deux fois (coupure, 502, 503, 504, 429),
  jamais les envois ; délai de 10 secondes ; `essais`, `delai` et `cache 5
  minutes` se règlent dans la source. Un envoi réussi vide le cache.
- `session astratra` : cette API donne la session (cookie et jeton CSRF des
  packs).
- **Jetons.** `jeton public "pk_…"` part dans le code envoyé (refusé s'il
  ressemble à un secret : `sk_live_`, `ghp_`…). Un secret ne s'écrit jamais :
  `jeton secret "valeur"` est une erreur ; `jeton secret depuis
  l'environnement "NOM"` demande un bloc serveur, et sa passerelle n'est pas
  encore écrite : le programme est refusé, rien n'est produit.
- L'adresse se change sans recompiler : `VITE_HUMALIS_SOURCE_BOUTIQUE` à la
  construction du site web.
- `supprimer m de "api/admin/equipe" de la source "boutique"` (DELETE) et
  `modifier p dans "api/admin/products/:id" de la source "boutique" avec
  price = 10` (PATCH, ou PUT si la route dit `modifier produit par
  remplacement`). L'identifiant se met à la fin de la route, ou à la place
  de `:id`.
- **Chargement, erreur, réessayer.** Une variable qui reçoit une requête
  vers une source a un état que la page peut lire : `si produits est en
  chargement :`, `si produits est en erreur :`, `si produits est
  introuvable :` (un 404), `texte erreur de produits` (le message) et, dans
  un événement, `recharger produits` (relance sans le cache). Une page qui
  n'en parle pas reçoit d'office un message avec un bouton « Réessayer » ;
  une page qui en parle prend la main, Humalis se tait. Pas encore pour les
  requêtes vers le serveur du fichier.
- Web et desktop seulement pour l'instant ; le mobile et le statique
  refusent avec un message.

## Adresse choisie, page réservée, page introuvable

L'en-tête d'une page s'étend, dans cet ordre : `adresse "/…"`,
`reservee a connecte|admin [sinon vers "…"]`, puis `avec parametre …`.

```humalis
source "compte" :
    adresse "http://localhost:4430"
    session astratra

page "commandes" a l'adresse "/admin/commandes" reservee a connecte sinon vers "connexion" :
    titre "Commandes"

page "connexion" :
    formulaire "connexion" :
        champ email "email" avec obligatoire
        champ mot de passe "mot de passe" avec obligatoire
        bouton "Se connecter"
    quand le formulaire "connexion" est soumis :
        se connecter avec champ "email" et champ "mot de passe"
        continuer vers "accueil"

page "introuvable" :
    titre "Cette page n'existe pas"
```

- `adresse "/collections/:slug"` choisit l'adresse de la page (celle du nom
  sinon) ; un morceau `:slug` déclare le paramètre de la page.
- `reservee a connecte` : la page attend de savoir qui est là (la session
  vient du serveur, ou d'une source `session astratra`), puis laisse passer
  ou renvoie vers `sinon vers "…"` (par défaut la page « connexion »).
  **C'est un confort, pas une protection** : tout le code du site est envoyé
  au navigateur, ce sont les routes du serveur qui protègent les données.
- `continuer vers "accueil"` : revient à la page voulue avant la connexion
  (seulement une adresse du site, jamais `https://…` ni `//…`), sinon va à
  la page donnée.
- La page nommée « introuvable » est la page 404 (une convention de nom,
  comme « accueil »).
- Web et desktop seulement pour l'instant ; le mobile et le statique
  refusent avec un message.

## Sous-pages, filtres d'adresse, ancres, retour, liens externes, menu

L'en-tête d'une page, dans cet ordre (chaque morceau est facultatif) :

```
page "NOM" [dans "PARENT"] [a l'adresse "/…"] [reservee a QUI [sinon vers "…"]] [avec parametre … et filtre …] :
```

**Sous-pages.** Une page `dans` une autre s'affiche à l'endroit de la ligne
`sous page` du parent. Sans adresse choisie, son adresse est celle du parent
suivie de son nom (`/admin/commandes`) ; une sous-page qui a l'adresse de
son parent est sa sous-page d'index. La protection d'un parent vaut pour
ses enfants.

```humalis
page "accueil" :
    menu :
        lien "Accueil" vers "accueil"
        lien "Catalogue" vers "catalogue"
        lien "Espace" vers "espace"
    titre "Bienvenue"
    lien "Écrire" vers "mailto:contact@exemple.cd"
    lien "WhatsApp" vers "https://wa.me/243000000000" avec nouvel onglet
    lien "Nos desserts" vers "carte#desserts"

page "espace" :
    titre "Espace"
    menu :
        lien "Profil" vers "profil"
        lien "Réglages" vers "reglages"
    sous page

page "profil" dans "espace" :
    texte "Votre profil"

page "reglages" dans "espace" a l'adresse "/espace" :
    texte "Vos réglages"
```

**Filtres d'adresse.** Un filtre est une valeur **facultative** de la requête
de l'adresse (`/catalogue?categorie=maillots`). Il se lit comme une variable
de la page (un texte, ou un nombre avec `filtre tri nombre`), vaut `rien`
quand l'adresse ne l'a pas, et se change avec `changer`, ce qui change
l'adresse (le bouton « retour » du navigateur ramène à l'état d'avant).
`changer categorie par rien` l'enlève. Un lien sans filtre efface les filtres.

```humalis
page "catalogue" avec filtre categorie :
    lien "Tout" vers "catalogue"
    lien "Costumes" vers "catalogue" avec categorie "costumes"
    si categorie est rien :
        texte "Toutes les catégories"
    sinon :
        texte "Catégorie : {categorie}"
    bouton "Passer aux robes"
    quand l'utilisateur clique sur "Passer aux robes" :
        changer categorie par "robes"
    bouton "Retour"
    quand l'utilisateur clique sur "Retour" :
        revenir vers "accueil"

page "accueil" :
    lien "Catalogue" vers "catalogue"
```

**Ancres.** `avec ancre "desserts"` (sur un élément ou un bloc) marque un
endroit ; `vers "carte#desserts"` y mène depuis une autre page, `vers
"#desserts"` depuis la même. Le nom suit les règles d'un identifiant (lettres
sans accent, chiffres, tirets) ; ce n'est pas `avec nom`.

```humalis
page "carte" :
    lien "Aller aux desserts" vers "#desserts"
    section "Desserts" avec ancre "desserts" :
        texte "Beignets"
```

**Retour et liens externes.** `revenir` est le retour du navigateur ;
`revenir vers "catalogue"` va à cette page quand la personne est arrivée
directement (lien partagé). Un lien peut mener à une adresse `https://`,
`http://`, `mailto:` ou `tel:`, avec `avec nouvel onglet` (le desktop les
ouvre dans le navigateur du système). `javascript:`, `data:` et les autres
schémas sont refusés, à la compilation pour une adresse écrite, au moment d'y
aller (avec un message) pour une adresse reçue :

```humalis
page "commande" :
    variable lienPaiement = "https://wa.me/243000000000"
    bouton "Payer"
    quand l'utilisateur clique sur "Payer" :
        rediriger vers lienPaiement
```

**Lien actif et menu.** `menu :` est un bloc de navigation (`<nav>` sur le
web) ; un `lien` vers la page affichée prend `aria-current="page"` et la
classe `humalis-actif` (un lien vers une page à filtres n'est actif que si
l'adresse a les mêmes filtres), pour que le CSS mette l'entrée en valeur.

- Web et desktop seulement pour l'instant ; le mobile et le statique
  refusent avec un message.
- Pas encore : le défilement vers l'ancre sur le mobile, les sous-pages sur
  un site statique.

## Les interactions

Les messages ont un genre, une durée, et parfois un bouton ; une minuterie
s'écrit comme on la dit ; `copier` et `partager` disent à la personne ce qui
s'est passé.

```humalis
page "billet" :
    variable code = "REY-2026-0042"
    variable copie = faux
    variable panier = ["Robe"]
    titre "Ton billet"
    texte "Ton code : {code}"
    bouton "Copier le code" avec raccourci "controle+maj+c"
    quand l'utilisateur clique sur "Copier le code" :
        copier code avec message "Code copié"
        changer copie par vrai
        apres 2 secondes :
            changer copie par faux
    si copie est vrai :
        texte "Copié !"
    bouton "Partager"
    quand l'utilisateur clique sur "Partager" :
        partager "Mon billet Rey Store" avec lien vers "billet"
    bouton "Vider le panier"
    quand l'utilisateur clique sur "Vider le panier" :
        confirmer "Vider le panier ?" avec oui "Vider" et non "Garder" :
            changer panier par []
            afficher reussite "Panier vidé" avec action "Annuler" :
                changer panier par ["Robe"]
        sinon :
            afficher "Panier gardé" pendant 3 secondes
```

Une minuterie de la page démarre à son ouverture ; `tant que` la met en
pause, `arreter` l'arrête pour de bon. `mouvement est reduit` est vrai quand
la personne a demandé à son système de réduire les animations.

```humalis
page "accueil" :
    variable compte = 10
    variable actif = vrai
    titre "Compte à rebours"
    toutes les 1 seconde tant que actif est vrai :
        changer compte par compte - 1
        si compte est egal a 0 :
            arreter
    texte "Il reste {compte} secondes" avec annonce
    bouton "Pause"
    quand l'utilisateur clique sur "Pause" :
        changer actif par faux
    si mouvement est reduit :
        texte "Les animations sont réduites."
```

La recherche pendant la frappe attend une pause (300 millisecondes par
défaut, Entrée n'attend pas) ; une fenêtre s'ouvre avec `montrer` ; le bas
d'un bloc nommé charge la suite, avec un vrai bouton « Voir plus » pour le
clavier ; une liste `avec deplacement` se réordonne à la souris, au doigt et
au clavier.

```humalis
page "catalogue" :
    variable resultats = []
    variable produits = ["Robe wax"]
    variable il_reste = vrai
    variable taches = ["Acheter du pain", "Appeler Rey"]
    titre "Catalogue"
    champ "recherche" avec indice "Chercher une robe" et raccourci "/"
    quand l'utilisateur arrete d'ecrire dans "recherche" :
        envoyer requete vers "/recherche" avec le champ "recherche" dans resultats
    bouton "Aide"
    quand l'utilisateur clique sur "Aide" :
        montrer "Raccourcis"
    quand l'utilisateur appuie sur "controle+k" :
        montrer "Raccourcis"
    fenetre "Raccourcis" :
        texte "Tape / pour chercher."
    section avec nom "liste" :
        pour chaque p dans produits :
            texte p
    quand l'utilisateur arrive en bas de "liste" tant que il_reste est vrai :
        ajouter "Pagne" a produits
        changer il_reste par faux
    pour chaque t dans taches avec deplacement :
        texte t
    quand l'ordre de taches change :
        afficher reussite "Ordre enregistré"
```

- Le téléphone n'a pas de raccourcis (avertissement) ; il charge la suite
  avec le bouton « Voir plus » et réordonne avec « Monter » et
  « Descendre ». Le site statique refuse `avec deplacement`.
- Une question aide la personne : elle ne protège rien, le serveur vérifie
  toujours ce qu'on lui demande.

## Un son

```humalis
page "musique" :
    titre "Musique"
    audio "extrait.mp3" avec description "Extrait de la chanson Le Fleuve, 30 secondes"
    audio "entretien.mp3" avec description "Entretien avec la cheffe" et transcription "Bonjour et bienvenue au Fleuve." et boucle
```

- `audio "extrait.mp3" avec description "…"` : un lecteur avec ses commandes
  (lecture, pause, position, volume). **La description est obligatoire** :
  elle donne son nom au lecteur pour les lecteurs d'écran.
- **Le son ne démarre jamais seul** : `automatique` est refusé, avec son
  explication. Sur le web, le fichier n'est même pas téléchargé avant que la
  personne le lance (`preload="none"`).
- `et transcription "…"` : le texte de ce qui est dit, dans un bloc « Lire la
  transcription » sous le lecteur. Conseillée pour la parole : un
  avertissement le rappelle quand le nom du fichier annonce un entretien, un
  discours ou un podcast (une aide, pas une certitude). `et boucle` relance le
  son à la fin.
- Un fichier écrit à côté du programme est recopié dans le projet produit
  (`public/audio/`, `audio/`, `assets/audio/`) ; une adresse reste telle quelle.
  Formats : mp3, ogg, wav, m4a, aac, flac, opus.
- Web, desktop et site statique : le lecteur natif du navigateur, au clavier
  (Tab, puis Espace). Mobile : un lecteur fait de boutons, avec `expo-audio`.
  Pas de pilotage depuis la page (jouer, pause par un bouton à soi) pour
  l'instant.

## Une carte

```humalis
page "contact" :
    titre "Nous trouver"
    carte "Le restaurant Le Fleuve, avenue de la Gombe" avec latitude -4,3250 et longitude 15,3222 et zoom 15

page "agences" :
    titre "Nos agences"
    variable agences = [fiche avec nom "Gombe" et adresse "12 avenue du Port" et latitude -4,3047 et longitude 15,3070, fiche avec nom "Limete" et adresse "5 avenue des Poids Lourds" et latitude -4,3353 et longitude 15,3446]
    carte "Nos deux agences à Kinshasa" :
        pour chaque agence dans agences :
            marqueur agence.nom avec adresse agence.adresse et latitude agence.latitude et longitude agence.longitude
        marqueur "Entrepôt" avec latitude -4,3902 et longitude 15,2611
```

- `carte "texte"` : **le texte est le nom de la carte** pour les lecteurs
  d'écran, comme le libellé d'un bouton : obligatoire, non vide. Une carte
  n'est jamais décorative.
- `avec latitude … et longitude …` donne le centre (les nombres négatifs et
  décimaux s'écrivent `-4,3250`), `et zoom 15` le niveau (de 1, le monde, à 18,
  une rue). Les mots `latitude` et `longitude` disent quoi est quoi : on ne
  peut pas les inverser sans le voir. Latitude entre -90 et 90, longitude entre
  -180 et 180, vérifiées quand elles sont écrites en clair.
- Sans centre, la carte **s'ajuste à ses marqueurs** ; avec un seul, zoom 15.
  Une carte sans centre ni marqueur est refusée : elle n'afficherait rien.
- `marqueur "Gombe" avec latitude … et longitude …` : le nom s'affiche dans une
  bulle (au clic, ou à Entrée au clavier) ; `adresse "…"` est facultative. Un
  marqueur se place dans une carte, dans un `pour chaque` ou un `si` au besoin.
  (Une variable de boucle ne s'appelle pas `a` : c'est un petit mot que Humalis
  saute. D'où `agence`.)
- **La liste des lieux est toujours écrite** sous la carte : nom, adresse, lien
  « Ouvrir dans OpenStreetMap ». Elle est lue par les lecteurs d'écran, présente
  sans JavaScript (c'est le contenu du site prérendu et le HTML de départ du site
  statique), et masquée à l'œil : le CSS de l'auteur peut la montrer
  (`.humalis-carte-lieux`).
- **Les tuiles** (les petites images de la carte) viennent d'OpenStreetMap, avec
  son attribution toujours affichée. `avec tuiles "https://…/{z}/{x}/{y}.png" et
  attribution "© MapTiler"` change de fournisseur : l'attribution devient
  obligatoire, l'adresse doit être en `https` et contenir `{z}`, `{x}` et `{y}`.
  Pour un site très visité, un fournisseur à contrat est nécessaire (la politique
  d'usage d'OpenStreetMap interdit l'usage massif).
- **Confidentialité** : chaque tuile envoie l'adresse IP du visiteur au
  fournisseur. La commande le dit, une fois par programme, en avertissement.
- Web et desktop : Leaflet 1.9.4, dépendance épinglée du projet produit,
  chargée à l'ouverture de la carte. Site statique : Leaflet recopié dans
  `humalis/` (aucun CDN, licence BSD-2-Clause dans `docs/licences/leaflet.md`).
  Mobile : la carte native (`react-native-maps` 1.27.2), avec l'emplacement de la
  clé Google Maps dans `app.json` (`expo.android.config.googleMaps.apiKey`) :
  Android en demande une, l'iPhone (Apple Plans) n'en a pas besoin ; Humalis
  n'invente pas la clé, il laisse l'emplacement vide et le dit.
- « Réduire les animations » : la carte ne zoome pas en animation, ne fond pas et
  n'a pas d'inertie. Les repères se focalisent au clavier (Tab, Entrée) et les
  commandes s'appellent « Agrandir » et « Réduire ». Pas de regroupement de
  marqueurs, d'itinéraires ni de hors ligne.

## Choisir un fichier et l'envoyer

Un fichier se choisit, s'affiche, puis s'envoie à une API déclarée (un bloc
`source`), avec une barre de progression. Le programme complet est
`exemples/fichier.humalis` (web et desktop).

```humalis
source "boutique" :
    adresse "http://localhost:3000"
    enveloppe "data"
    session astratra
    route "api/shop/photos" :
        creer photo
    donnee photo :
        fichier : texte

page "profil" :
    titre "Ma photo de profil"
    variable photo = rien
    variable envoi = 0
    variable adresse_photo = rien

    fichier "Choisir une photo" dans photo accepte images avec maximum 5 Mo

    si photo est different de rien :
        image photo.apercu avec description "Aperçu de la photo choisie" et proportions 1 sur 1
        texte photo.nom
        bouton "Envoyer la photo"
        progression envoi avec maximum 100 et description "Envoi de la photo"

    si adresse_photo est different de rien :
        image adresse_photo avec description "Votre photo de profil"

    quand l'utilisateur clique sur "Envoyer la photo" :
        envoyer fichier photo vers "api/shop/photos" de la source "boutique" en corps brut suivi dans envoi et fichier dans adresse_photo
```

- `fichier "Choisir une photo" dans photo` : le libellé est le texte du
  bouton ; `photo` reçoit le fichier choisi, ou `rien`. Un fichier choisi a
  quatre champs, en lecture seule : `nom`, `taille` (en octets), `type` (un
  mot : `image`, `audio`, `video`, `pdf`, `document`) et `apercu` (une
  adresse locale, seulement pour des images, des sons et des vidéos).
- `accepte` prend des mots d'une liste fermée : `images`, `audio`, `videos`,
  `pdf`, `documents` (`accepte images ou pdf`). Le SVG n'est pas une image
  acceptée : il peut contenir du script. `maximum 5 Mo` (ou `500 Ko`) fixe la
  taille (1 Ko vaut 1 024 octets) ; `plusieurs` donne une liste de fichiers.
- Le type et la taille sont vérifiés tout de suite, par la page, pour que la
  personne ne perde pas de temps : le type est lu dans les premiers octets du
  fichier, pas dans son nom. **Ce n'est qu'un confort.** Le serveur de l'API
  revérifie toujours ; Humalis ne prétend jamais protéger un serveur.
- `envoyer fichier photo vers "…" de la source "…"` : sans `en corps brut`,
  un formulaire (multipart) est envoyé, sous le nom `fichier` ou sous celui
  de `sous le nom "image"`. `suivi dans envoi` donne la progression de 0 à
  100 ; `fichier dans adresse_photo` reçoit le champ `fichier` de la
  réponse (ou toute la réponse s'il n'a pas ce champ). L'état de la requête
  s'applique à cette variable (`est en chargement`, `est en erreur`,
  `erreur de …`). Un envoi n'est jamais rejoué tout seul. L'envoi ne se
  retient pas (pas d'annulation pour l'instant).
- Envoyer au **serveur Humalis du même fichier** est refusé, avec un message
  qui dit pourquoi : les packs Astratra n'ont pas encore de route d'envoi de
  fichier, et écrire un récepteur à la main serait de la sécurité inventée.
  L'envoi vers une source à jeton secret est refusé aussi.
- Web et desktop seulement : le mobile et le site statique refusent le
  programme à la compilation.
## Les graphiques

Une ligne pour une série : la liste, le champ des libellés, celui des
valeurs (avec sa devise, au besoin) et la description, obligatoire.

```humalis
page "ventes" :
    titre "Ventes du trimestre"
    variable ventes = [fiche avec mois "Janvier" et montant 120000, fiche avec mois "Février" et montant 180000, fiche avec mois "Mars" et montant 150000]
    graphique en courbe ventes avec etiquette mois et valeur montant en FC et description "Les ventes passent de 120 000 FC en janvier à 150 000 FC en mars, avec un sommet en février."
```

Plusieurs séries : un bloc, une ligne `serie` par série. Une liste de
nombres prend ses libellés dans `etiquettes`. Le camembert a une seule
série, et chaque part sa couleur.

```humalis
page "bilan" :
    titre "Bilan"
    variable mois = [fiche avec nom "Janvier" et ventes 120000 et achats 90000, fiche avec nom "Février" et ventes 180000 et achats 110000]
    variable depenses = [fiche avec poste "Loyer" et total 500, fiche avec poste "Courses" et total 300]
    variable visites = [120, 180, 150, 210]
    graphique en barres mois avec etiquette nom et description "Ventes et achats par mois, les ventes dépassent toujours les achats." :
        serie "Ventes" valeur ventes en FC avec couleur bleu
        serie "Achats" valeur achats en FC avec couleur orange
    graphique en camembert depenses avec etiquette poste et valeur total en euros et description "Le loyer pèse plus de la moitié des dépenses."
    graphique en barres visites avec etiquettes ["Lun", "Mar", "Mer", "Jeu"] et proportions 2 sur 1 et description "Visites de la semaine, en hausse jusqu'à jeudi."
```

- Du SVG écrit par Humalis, sans bibliothèque : une seule géométrie pour le
  web, le desktop, le mobile (`react-native-svg`) et le site statique (le
  dessin est déjà dans le HTML de départ). Un dessin étroit remplace le
  large sous 34rem.
- Chaque graphique est une figure : son dessin est une image nommée
  (« Graphique en courbe », puis la description), et la table « Voir les
  données » est toujours écrite. Les séries se distinguent aussi par la
  forme de leurs repères, et les parts d'un camembert par leur étiquette.
- Vérifié à la compilation : une liste, des champs qui existent, des
  valeurs qui sont des nombres, une couleur qui se voit sur le fond, pas de
  part négative ; avertissement au-delà de 8 parts ou de 40 barres.

## Deux langues : français et anglais

Le bloc `langues :` déclare les langues du site ; la première est celle
des textes écrits tels quels. Chaque texte reçoit sa version à côté, avec
`en anglais "…"`, partout où un texte s'écrit (titre, texte, bouton, lien,
libellé de champ, `afficher`, valeur d'une variable, aperçu).

```humalis
langues :
    francais
    anglais

page "accueil" :
    selecteur de langue
    titre "Bienvenue chez Rey Store" en anglais "Welcome to Rey Store"
    texte "Mode et maillots, livrés à Kinshasa." en anglais "Fashion and jerseys, delivered in Kinshasa."
    variable panier = 3
    texte "{panier article} dans le panier" en anglais "{panier item} in the cart"
    bouton "Ajouter" en anglais "Add" avec fond vert
```

Beaucoup de textes ? Le bloc `traductions anglais :` les range en un seul
endroit : partout où ce texte exact s'écrit, sa version anglaise est
montrée. Une version écrite à côté passe avant celle du bloc.

```humalis
langues :
    francais
    anglais

traductions anglais :
    "Voir le catalogue" : "See the catalogue"

page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
    bouton "Voir le catalogue"
```

`langue` est la langue choisie par la personne : `si langue est anglais :`
la lit, `changer langue par francais` la change.

```humalis
langues :
    francais
    anglais

page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
    bouton "English" en anglais "Français"
    quand l'utilisateur clique sur "English" :
        si langue est anglais :
            changer langue par francais
        sinon :
            changer langue par anglais
```

- La personne voit d'abord la langue de son navigateur (ou de son
  téléphone), si le site la parle ; sinon la première du bloc. Son choix
  (sélecteur ou `changer langue par …`) est gardé par son appareil ; une
  langue seulement détectée ne l'est pas.
- Les montants et les pluriels suivent la langue : `{total en euros}` donne
  « 1 234,50 € » en français et « €1,234.50 » en anglais ; `{panier item}`
  donne « 1 item », « 2 items ».
- Les messages de Humalis aussi : les erreurs de champ (avec le libellé
  dans la langue), « Réessayer », la page introuvable, les boutons du
  carrousel, les noms lus par les lecteurs d'écran.
- Le compilateur avertit d'un texte visible sans version anglaise, et
  `humalis compile … --exigeant` le refuse avant une mise en ligne.
- Ne se traduisent pas : les valeurs d'un `choix` ou d'une liste déroulante
  (elles partent au serveur), les noms de pages, les textes venus d'une
  API. Un élément se vise toujours par son texte de base
  (`quand l'utilisateur clique sur "Voir le catalogue"`).
- Pas encore : une adresse par langue (`/en/…`), l'espagnol, le portugais,
  le swahili et le lingala (prévus).

## Combinaisons complètes

```humalis
page "connexion" :
    variable email_valide = faux
    champ "email"
    bouton "Se connecter"
    quand l'utilisateur clique sur "Se connecter" :
        si le champ "email" est vide :
            afficher erreur "Email requis"
        sinon :
            afficher "Connexion réussie"

page "produit" :
    variable stock = 0
    titre "Détail du produit"
    si stock est égal à 0 :
        afficher "Rupture de stock"
    sinon :
        bouton "Ajouter au panier"

page "accueil" :
    titre "Bienvenue" avec couleur bleu
    bouton "Commencer" avec fond vert
    quand l'utilisateur clique sur "Commencer" :
        variable etape = 1
        rediriger vers "onboarding"

page "liste_produits" :
    variable produits = ["Livre", "Stylo", "Cahier"]
    titre "Nos produits"
    pour chaque nom dans produits :
        texte nom
        bouton "Ajouter" avec fond vert
```
