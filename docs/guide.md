**Français** · [English](guide.en.md)

# Le guide de Humalis

Ce guide explique tout le langage, du premier titre jusqu'au serveur. Chaque
exemple est vérifié par le compilateur à chaque changement de Humalis : s'il
est écrit ici, il marche.

Il se lit dans l'ordre, mais chaque partie tient seule : va directement à ce
qui t'intéresse.

## Sommaire

1. [Installer et créer un projet](#1-installer-et-créer-un-projet)
2. [Les règles d'écriture](#2-les-règles-décriture)
3. [Les pages](#3-les-pages)
4. [Les éléments](#4-les-éléments)
5. [Les styles](#5-les-styles)
6. [La mise en page](#6-la-mise-en-page)
7. [Les éléments d'écran](#7-les-éléments-décran)
8. [Images, sons et mouvement](#8-images-sons-et-mouvement)
9. [Les variables et les calculs](#9-les-variables-et-les-calculs)
10. [Les fiches, le texte, l'argent et les dates](#10-les-fiches-le-texte-largent-et-les-dates)
11. [Les conditions](#11-les-conditions)
12. [Les listes et les boucles](#12-les-listes-et-les-boucles)
13. [Les fonctions](#13-les-fonctions)
14. [Les événements](#14-les-événements)
15. [Les actions](#15-les-actions)
16. [Les messages, les fenêtres et les questions](#16-les-messages-les-fenêtres-et-les-questions)
17. [Les interactions](#17-les-interactions)
18. [Les formulaires](#18-les-formulaires)
19. [Partager et garder des valeurs](#19-partager-et-garder-des-valeurs)
20. [La navigation](#20-la-navigation)
21. [Le serveur](#21-le-serveur)
22. [Relier les pages au serveur](#22-relier-les-pages-au-serveur)
23. [Utiliser une API qui existe déjà](#23-utiliser-une-api-qui-existe-déjà)
24. [Les données d'un fichier](#24-les-données-dun-fichier)
25. [Choisir et envoyer un fichier](#25-choisir-et-envoyer-un-fichier)
26. [Les graphiques](#26-les-graphiques)
27. [Les cartes](#27-les-cartes)
28. [Plusieurs langues](#28-plusieurs-langues)
29. [Publier un site](#29-publier-un-site)
30. [Les composants et les projets en plusieurs fichiers](#30-les-composants-et-les-projets-en-plusieurs-fichiers)
31. [Tester en Humalis](#31-tester-en-humalis)
32. [Les commandes](#32-les-commandes)
33. [Ce que chaque cible sait faire](#33-ce-que-chaque-cible-sait-faire)

---

## 1. Installer et créer un projet

Il faut [Node.js](https://nodejs.org) 24 ou plus récent.

```sh
npm install -g humalis
humalis nouveau mon-projet
cd mon-projet
humalis developper
```

`humalis nouveau` crée un dossier avec un premier fichier, `mon-projet.humalis`.
`humalis developper` ouvre le site dans le navigateur et le recompile à chaque
enregistrement : écris, enregistre, regarde.

Quand le site te plaît, compile-le vers la cible voulue :

```sh
humalis compile mon-projet.humalis --cible web --sortie mon-projet-web
```

Les cibles sont `web`, `statique`, `mobile`, `desktop` et `serveur`. Le
[README](../README.md) explique comment lancer chaque projet produit.

---

## 2. Les règles d'écriture

### Un bloc, quatre espaces

Une ligne qui finit par `:` ouvre un bloc. Tout ce qui est dans le bloc est
décalé de **4 espaces** de plus. Jamais de tabulation.

```humalis
page "accueil" :
    titre "Bienvenue"
    section "Nos horaires" :
        texte "Du lundi au samedi"
```

### Les guillemets

Un texte qui s'affiche s'écrit entre guillemets : `titre "Bienvenue"`. Sans
guillemets, c'est un nom de variable : `texte prenom` affiche ce que contient
la variable `prenom`.

Pour mettre un guillemet dans un texte, écris `\"` :

```humalis
page "citation" :
    titre "Une citation"
    texte "Elle a dit \"bonjour\" en entrant."
```

### Les accents sont permis, jamais obligatoires

`si age est supérieur ou égal à 18` et `si age est superieur ou egal a 18` se
lisent pareil. Écris comme tu veux.

### Les petits mots

`le`, `la`, `les`, `un`, `une`, `des`, `de`, `du`, `à`, `au`, `aux`, `l'`,
`d'`… rendent la phrase naturelle. Humalis les ignore là où ils ne changent
rien : `quand l'utilisateur clique` et `quand utilisateur clique` sont
pareils. Ils ne peuvent donc pas nommer une variable.

### Les commentaires

Un `#` en dehors des guillemets commence un commentaire, jusqu'à la fin de la
ligne. Il est fait pour les humains ; Humalis l'ignore.

```humalis
# La page d'accueil du site
page "accueil" :
    titre "Article #1"    # le # entre guillemets reste du texte
```

### Les noms

Un nom de variable s'écrit en minuscules, avec `_` entre les mots :
`nombre_articles`. Les mots du langage (`si`, `page`, `quand`…) ne peuvent pas
servir de nom.

---

## 3. Les pages

Une page est un écran. Tout s'écrit à l'intérieur d'une page.

```humalis
page "accueil" :
    titre "Bienvenue sur mon site"
    lien "Nous contacter" vers "contact"

page "contact" :
    titre "Nous contacter"
    texte "Écris-nous, nous répondons en un jour."
```

La première page du fichier est la page d'accueil. Le nom d'une page sert aux
liens (`vers "contact"`) et à son adresse (`/contact`). Chaque page a un
titre principal : c'est lui qui donne son nom à l'onglet du navigateur.

La [navigation](#20-la-navigation) explique les adresses choisies, les pages
réservées, les sous-pages et la page « introuvable ».

---

## 4. Les éléments

Un élément est ce qu'on voit dans une page. On écrit son nom, puis son contenu
entre guillemets.

### Titre, sous-titre et texte

```humalis
page "carte" :
    titre "La carte"
    soustitre "Les entrées"
    texte "Soupe du jour, salade de saison."
    soustitre "Les desserts" avec niveau 3
    texte "Tarte aux pommes, glace vanille."
```

`soustitre` ouvre une partie de la page (niveau 2 par défaut, jusqu'à 6). Garde
l'ordre des niveaux, sans en sauter : les lecteurs d'écran s'en servent pour
parcourir la page.

### Image

```humalis
page "profil" :
    titre "Mon profil"
    image "photo.png" avec description "Photo de profil"
```

Chaque image a une `description` : c'est ce que lit un lecteur d'écran, et ce
qui s'affiche si l'image ne charge pas. Une image purement décorative s'écrit
`avec decoratif`.

### Bouton et lien

```humalis
page "accueil" :
    titre "Accueil"
    bouton "Commencer"
    lien "En savoir plus" vers "a_propos"

page "a_propos" :
    titre "À propos"
```

Un lien mène à une page (`vers "a_propos"`) ou à une adresse web
(`vers "https://exemple.fr"`). Un bouton déclenche une action (voir les
[événements](#14-les-événements)).

### Champ

Un champ est une zone où la personne écrit. Sa sorte s'écrit juste après
`champ` :

```humalis
page "inscription" :
    titre "Inscription"
    formulaire "inscription" :
        champ "Nom" avec obligatoire
        champ email "Email" avec indice "toi@exemple.fr"
        champ telephone "Téléphone"
        champ nombre "Âge" avec minimum 0 et maximum 130
        champ date "Naissance"
        champ heure "Heure d'appel"
        champ mot de passe "Mot de passe"
        champ texte long "Présentation"
        champ adresse web "Site"
        bouton "S'inscrire"
    quand le formulaire "inscription" est soumis :
        afficher "Bienvenue"
```

Chaque cible choisit la bonne saisie : le bon clavier sur un téléphone, le bon
type de champ dans le navigateur. Les options : `obligatoire`, `indice "…"` (le
texte gris d'un champ vide), et pour un nombre `minimum` et `maximum`.

### Les choix

```humalis
page "commande" :
    titre "Commande"
    variable pays = ["France", "Belgique", "Suisse"]
    formulaire "commande" :
        choix "Taille" parmi ["S", "M", "L"] avec obligatoire
        liste deroulante "Pays" parmi pays avec indice "Choisis un pays"
        case a cocher "J'accepte les conditions" avec obligatoire
        bouton "Commander"
    quand le formulaire "commande" est soumis :
        si champ "Taille" est egal a "L" :
            afficher "Grande taille"
        afficher "Commande envoyée"
```

---

## 5. Les styles

Les options d'un élément s'écrivent après `avec`, reliées par `et`.

```humalis
page "accueil" :
    titre "Bienvenue" avec couleur bleu et taille grande
    titre "Centré" avec position centree
    bouton "Valider" avec fond vert et texte blanc
    bouton "Annuler" avec fond gris et bordure arrondie
```

Les couleurs : `bleu`, `vert`, `rouge`, `orange`, `jaune`, `violet`, `rose`,
`gris`, `noir`, `blanc`. Les tailles : `petite`, `moyenne`, `grande`. Les
couleurs de ton thème marchent aussi (voir [le thème](#le-thème)).

### Donner un nom à un élément

`nom "…"` donne un nom à un élément, pour le viser dans une action :

```humalis
page "connexion" :
    titre "Connexion"
    texte "Connexion en cours…" avec nom "attente"
    bouton "Se connecter" avec fond vert et nom "connexion"
    quand la page se charge :
        cacher "attente"
    quand l'utilisateur clique sur "connexion" :
        montrer "attente"
```

### Ton propre CSS

Un bloc `style :` en haut du fichier contient du CSS ordinaire. On l'applique
avec `avec style "…"` :

```humalis
style :
    .grand { font-size: 3rem; }
    .principal { border: 2px solid navy; }

page "accueil" :
    titre "Bienvenue" avec style "grand"
    bouton "Valider" avec fond vert et style "principal"
```

Le CSS peut aussi venir d'un fichier : `utiliser style "./theme.css"` en haut du
fichier. Le CSS s'applique au web, au statique et au desktop ; le mobile ne
traduit que les styles nommés (couleur, fond, taille, position, bordure).

---

## 6. La mise en page

### Les blocs

- `section "…" :` une partie de la page, avec son titre ;
- `bloc :` une boîte ;
- `ligne :` des éléments côte à côte ;
- `colonne :` des éléments les uns sous les autres ;
- `grille :` des cases qui se rangent selon la largeur de l'écran.

```humalis
page "accueil" :
    titre "Le Comptoir"
    section "Notre maison" :
        texte "Une cuisine de saison, au cœur de la ville."
        ligne :
            lien "Voir la carte" vers "accueil"
            lien "Réserver" vers "accueil"
    section "Nos plats" :
        grille avec colonnes 3 et espacement moyenne :
            bloc avec ombre legere et bordure douce et remplissage moyenne :
                texte "Risotto aux champignons"
            bloc avec ombre legere et bordure douce et remplissage moyenne :
                texte "Tarte fine aux légumes"
            bloc avec ombre legere et bordure douce et remplissage moyenne :
                texte "Poisson du jour"
```

Les réglages des blocs : `largeur` (`etroite`, `large`), `remplissage` et
`espacement` (`petite`, `moyenne`, `grande`), `colonnes`, `ombre` (`legere`,
`moyenne`), `bordure douce`, `repartition entre`, `alignement centre`,
`degrade bleu vers violet`, `colle` (reste en haut pendant le défilement).

### Selon l'appareil

```humalis
page "accueil" :
    titre "Accueil"
    sur telephone :
        bouton "Menu"
    sur tablette ou ordinateur :
        ligne :
            lien "La carte" vers "accueil"
            lien "Réserver" vers "accueil"
```

### Le thème

Un bloc `theme :` en haut du fichier donne les couleurs, les polices et le
mode (clair, sombre ou automatique) de toute l'application :

```humalis
theme :
    couleur marque clair "#0e5a6b" sombre "#5fc3d6"
    couleur sable "#f3e9d2"
    police titres "Georgia"
    mode automatique
    largeur large

page "accueil" :
    titre "Le Comptoir" avec couleur marque
    bouton "Réserver" avec fond sable et couleur marque
    bouton "Mode sombre"
    quand l'utilisateur clique sur "Mode sombre" :
        changer theme par sombre
```

Humalis vérifie le contraste : une couleur de texte trop pâle sur le fond est
signalée à la compilation.

Une police peut être livrée avec le site, sans dépendre d'un service extérieur :
`police titres "Space Grotesk" depuis "./polices/space-grotesk.woff2"` (fichiers
`.woff2`, `.woff`, `.ttf` ou `.otf`).

Le visiteur peut aussi passer d'un thème à l'autre. `basculer theme` passe au
thème inverse de celui qu'on voit, et `si theme est sombre :` (ou `clair`)
réagit au thème affiché :

```humalis
theme :
    mode automatique

page "accueil" :
    titre "Accueil"
    bouton "Changer de thème"
    quand l'utilisateur clique sur "Changer de thème" :
        basculer theme
    si theme est sombre :
        texte "Bonne soirée"
    sinon :
        texte "Bonne journée"
```

### L'en-tête et le pied communs

`entete :` et `pied :` s'affichent sur toutes les pages. Une page peut s'en
passer avec `sans entete` ou `sans pied`. Avec un en-tête, Humalis ajoute seul
un lien « Aller au contenu », caché tant que le clavier ne l'atteint pas : il
permet de sauter l'en-tête.

```humalis
entete avec colle :
    ligne avec repartition entre :
        lien "Le Comptoir" vers "accueil"
        lien "La carte" vers "carte"

pied :
    texte "Ouvert du lundi au samedi"

page "accueil" :
    titre "Bienvenue"

page "carte" :
    titre "La carte"

page "connexion" sans entete et sans pied :
    titre "Connexion"
```

---

## 7. Les éléments d'écran

Tout ce qu'il faut pour un site complet, sans rien installer.

```humalis
page "produit" :
    variable note = 3
    variable quantite = 1
    variable envoi = 40
    calcul total = quantite * 24
    titre "Lampe de bureau"
    ligne :
        icone "panier" avec taille grande et description "Panier"
        badge "Nouveau" avec fond vert
        avatar "Camille Martin"
    etoiles note avec modifiable
    compteur quantite avec minimum 1 et maximum 10 et description "Quantité"
    texte "Total : {total en euros}"
    progression envoi avec pourcentage et maximum 100
    chargement "Chargement des avis…"
    code qr "https://exemple.fr/lampe" avec taille petite et description "Lien vers ce produit"
    bouton "Ajouter au panier" avec icone "plus"
```

### Onglets, menus dépliants et carrousel

```humalis
page "aide" :
    titre "Aide"
    onglets :
        onglet "Livraison" avec icone "document" :
            texte "Livraison en trois jours ouvrés."
        onglet "Retours" :
            texte "Trente jours pour changer d'avis."
    deroulant "Comment commander ?" :
        texte "Ajoute un produit au panier, puis valide."
    accordeon :
        deroulant "Annulation" avec ouvert :
            texte "Jusqu'à 24 heures avant l'envoi."
        deroulant "Paiement" :
            texte "Par carte ou par virement."
    carrousel avec automatique 5 et visibles 1 :
        image "salle.jpg" avec description "La salle du restaurant"
        image "terrasse.jpg" avec description "La terrasse"
```

### Le fil d'Ariane et le menu

```humalis
page "accueil" :
    menu :
        lien "Accueil" vers "accueil"
        lien "La carte" vers "carte"
    titre "Accueil"

page "carte" :
    fil d'Ariane :
        lien "Accueil" vers "accueil"
        texte "La carte"
    titre "La carte"
```

Dans un `menu`, le lien de la page où l'on est est marqué comme actif.

Un `menu repliable :` se range derrière un bouton « Menu » sur un petit écran
(téléphone) ; un lien choisi referme le menu. Sur grand écran, il reste ouvert :

```humalis
page "accueil" :
    menu repliable :
        lien "Accueil" vers "accueil"
        lien "La carte" vers "accueil"
        lien "Réserver" vers "accueil"
    titre "Accueil"
```

---

## 8. Images, sons et mouvement

### Les images

```humalis
page "galerie" :
    titre "Galerie"
    image "vitrine.jpg" avec description "La vitrine de la boutique" et proportions 16 sur 9 et prioritaire
    image "motif.svg" avec decoratif
```

`proportions` réserve la place de l'image avant son chargement (la page ne
saute pas). `prioritaire` la charge en premier : à réserver aux images du haut
de la page.

### Les sons

```humalis
page "ecouter" :
    titre "Écouter"
    audio "extrait.mp3" avec description "Extrait du concert, deux minutes"
    audio "entretien.mp3" avec description "Entretien avec la cheffe" et transcription "Bonjour et bienvenue."
```

Un son ne démarre jamais tout seul. Une parole a sa transcription, pour les
personnes qui n'entendent pas.

### Le mouvement

```humalis
page "accueil" :
    titre "Le Comptoir" avec animation apparition
    texte "Cuisine de saison." avec animation montee et delai court
    bouton "Réserver" avec transition douce et effet agrandi
    bloc avec animation montee au defilement et effet leve :
        texte "Apparaît quand on arrive dessus."
```

Les animations : `apparition`, `montee`, `agrandissement`. Les effets au
survol : `agrandi`, `leve`. Humalis respecte le réglage « réduire les
animations » de la personne.

Sur un bloc, `et en cascade` fait apparaître ses enfants l'un après l'autre :

```humalis
page "accueil" :
    titre "Nos plats"
    grille avec animation montee au defilement et en cascade :
        texte "Soupe du jour"
        texte "Risotto"
        texte "Tarte aux pommes"
```

---

## 9. Les variables et les calculs

### Les variables

```humalis
page "profil" :
    variable note = 12
    variable prenom = "Camille"
    variable connecte = faux
    variable prix = 12,50
    titre "Bonjour {prenom} !"
    texte "Ta note : {note}"
```

Une variable contient un nombre, un texte, `vrai` ou `faux`, une liste, une
fiche, ou `rien`. Les nombres à virgule s'écrivent à la française : `12,50`.
Dans un texte, `{prenom}` affiche la valeur de la variable.

### Changer une variable

```humalis
page "compteur" :
    variable clics = 0
    titre "Compteur"
    texte "Tu as cliqué {clics} fois"
    bouton "Cliquer"
    bouton "Remettre à zéro"
    quand l'utilisateur clique sur "Cliquer" :
        changer clics par clics + 1
    quand l'utilisateur clique sur "Remettre à zéro" :
        changer clics par 0
```

### Les calculs qui se mettent à jour tout seuls

`calcul` déclare une valeur calculée à partir d'autres : elle se met à jour
quand elles changent.

```humalis
page "panier" :
    variable prix = 12
    variable quantite = 3
    calcul total = prix * quantite
    titre "Panier"
    texte "Total : {total}"
    bouton "Un de plus"
    quand l'utilisateur clique sur "Un de plus" :
        changer quantite par quantite + 1
```

Les opérations : `+`, `-`, `*`, `/` et les parenthèses. Les nombres
s'affichent à la française : `14 000`, `4,5`.

### Les constantes

Une `constante` ne change jamais. Écrite en haut du fichier, elle sert à
toutes les pages.

```humalis
constante livraison = 5

page "panier" :
    variable prix = 40
    calcul total = prix + livraison
    titre "Panier"
    texte "Livraison : {livraison en euros}"
    texte "Total : {total en euros}"
```

### Les calculs sur les nombres

```humalis
page "notes" :
    variable notes = [12, 15, 9]
    variable tirage = 1
    calcul moyenne_notes = moyenne de notes
    calcul arrondie = arrondi de moyenne_notes a 1 chiffres
    calcul meilleure = maximum de notes
    calcul total = somme de notes
    titre "Mes notes"
    texte "Moyenne {arrondie}, meilleure {meilleure}, total {total}"
    texte "Dé : {tirage}"
    bouton "Lancer le dé"
    quand l'utilisateur clique sur "Lancer le dé" :
        changer tirage par hasard entre 1 et 6
```

---

## 10. Les fiches, le texte, l'argent et les dates

### Les fiches

Une fiche regroupe plusieurs valeurs sous un même nom. On lit chaque valeur
avec un point.

```humalis
page "client" :
    variable client = fiche avec nom "Camille" et ville "Lyon" et adresse (fiche avec rue "rue des Lilas" et numero 12)
    titre "Client"
    texte "{client.nom}, {client.adresse.numero} {client.adresse.rue}, {client.ville}"
    bouton "Déménager"
    quand l'utilisateur clique sur "Déménager" :
        changer client.ville par "Lille"
```

### Le texte

```humalis
page "texte" :
    variable nom = "Camille Martin"
    calcul fort = majuscules de nom
    calcul doux = minuscules de nom
    calcul taille = longueur de nom
    calcul poli = remplacer "Camille" par "Madame" dans nom
    titre "Le texte"
    texte "{fort}, {doux}, {taille} lettres, {poli}"
    si nom contient "Martin" :
        texte "Famille Martin"
```

### L'argent et le pluriel

Dans un texte, `{prix en euros}` écrit un montant à la française, et
`{nombre article}` accorde le mot : « 1 article », « 3 articles ».

```humalis
page "panier" :
    variable prix = 1234,5
    variable nombre = 3
    titre "Panier"
    texte "{nombre article} pour {prix en euros}"
```

Les devises : `euros`, `dollars` et `FC` (franc congolais).

### Les dates

```humalis
page "livraison" :
    variable commande = maintenant
    calcul jour = aujourd'hui
    calcul livraison = aujourd'hui plus 3 jours
    calcul rappel = livraison moins 1 semaine
    calcul attente = jours entre jour et livraison
    titre "Livraison"
    texte "Livrée le {livraison}, dans {attente} jours"
    texte "Commandée {commande depuis}"
```

Les dates s'affichent en français (« 2 novembre 2026 »). `{commande depuis}`
écrit « il y a 5 minutes ». On décale de `jours`, `semaines` ou `mois`.

---

## 11. Les conditions

```humalis
page "resultat" :
    variable note = 8
    titre "Résultat"
    si note est inferieure a 10 :
        texte "À retravailler"
    sinon :
        texte "Réussi"
```

### Les comparaisons

| On écrit | Ça veut dire |
|---|---|
| `est egal a` | = |
| `est different de` | ≠ |
| `est superieur a`, `est inferieur a` | > et < |
| `est superieur ou egal a`, `est inferieur ou egal a` | ≥ et ≤ |
| `est vide` | une liste ou un texte vide |
| `est rien` | aucune valeur |
| `est vrai`, `est faux` | pour `vrai` et `faux` |
| `est dans [ … ]` | fait partie de la liste |
| `contient` | le texte ou la liste contient |

`supérieure` et `inférieure` au féminin marchent aussi.

### Combiner et nier

```humalis
page "stock" :
    variable stock = 3
    variable prix = 15
    variable categorie = "robes"
    variable panier = ["Robe"]
    titre "Stock"
    si stock est superieur a 0 et prix est inferieur a 20 :
        texte "Bonne affaire"
    si stock est inferieur ou egal a 5 et stock est superieur a 0 :
        texte "Bientôt épuisé"
    si panier est vide ou stock est egal a 0 :
        texte "Rien à commander"
    si categorie est dans ["robes", "jupes"] :
        texte "Mode"
    si panier n'est pas vide :
        texte "Panier rempli"
```

`et` passe avant `ou`, comme en mathématiques.

---

## 12. Les listes et les boucles

### Afficher une liste

```humalis
page "produits" :
    variable produits = ["Pomme", "Banane", "Orange"]
    titre "Nos fruits"
    pour chaque nom dans produits :
        texte nom
```

### Ajouter, retirer, compter

```humalis
page "panier" :
    variable panier = []
    calcul total = nombre de panier
    titre "Panier"
    texte "{total article} dans le panier"
    bouton "Ajouter une pomme"
    bouton "Retirer une pomme"
    quand l'utilisateur clique sur "Ajouter une pomme" :
        ajouter "Pomme" à panier
    quand l'utilisateur clique sur "Retirer une pomme" :
        retirer "Pomme" de panier
    si panier est vide :
        texte "Le panier est vide"
```

### Trier, filtrer, choisir

```humalis
page "catalogue" :
    variable produits = [fiche avec nom "Livre" et prix 12, fiche avec nom "Stylo" et prix 2, fiche avec nom "Cahier" et prix 5]
    calcul par_prix = trier produits par prix
    calcul du_plus_cher = trier produits par prix decroissant
    calcul pas_chers = produits dont prix est inferieur a 10
    calcul vitrine = les 2 premiers de par_prix
    calcul livre = premier de produits dont nom contient "Liv"
    titre "Catalogue"
    texte "Trouvé : {livre.nom}"
    pour chaque p dans vitrine :
        texte "{p.nom} : {p.prix en euros}"
```

### Grouper

```humalis
page "rayons" :
    variable produits = [fiche avec nom "Robe" et categorie "Mode", fiche avec nom "Lampe" et categorie "Maison", fiche avec nom "Jupe" et categorie "Mode"]
    calcul rayons = grouper produits par categorie
    titre "Nos rayons"
    pour chaque rayon dans rayons :
        soustitre rayon.nom
        pour chaque p dans rayon.elements :
            texte p.nom
```

### Les boucles dans une action

Dans un événement ou une fonction, on peut aussi répéter, boucler tant qu'une
condition tient, et choisir selon une valeur :

```humalis
page "jeu" :
    variable points = 0
    variable jour = "samedi"
    titre "Jeu"
    texte "Points : {points}"
    bouton "Jouer"
    quand l'utilisateur clique sur "Jouer" :
        repeter 3 fois :
            changer points par points + 1
        tant que points est inferieur a 10 :
            changer points par points + 2
        selon jour :
            cas "samedi" ou "dimanche" :
                afficher "Bon week-end"
            cas "lundi" :
                afficher "Bonne semaine"
```

`arreter` sort d'une boucle ; `passer au suivant` passe au tour suivant.

---

## 13. Les fonctions

### Une fonction de calcul

Elle rend une valeur avec `rendre`. Elle s'écrit en haut du fichier et sert à
toutes les pages.

```humalis
fonction prix_ttc avec montant :
    rendre montant * 1,2

fonction remise avec prix et taux :
    rendre prix - prix * taux / 100

page "boutique" :
    variable prix = 50
    calcul ttc = prix_ttc(prix)
    calcul solde = remise(ttc, 10)
    titre "Boutique"
    texte "{ttc en euros}, soldé {solde en euros}"
```

### Une fonction d'actions

Sans `rendre`, une fonction est une suite d'actions, appelée seule sur une
ligne d'un événement :

```humalis
variable panier = ["Livre"] avec partagee

fonction vider_panier :
    changer panier par []
    afficher "Panier vidé"

page "panier" :
    calcul n = nombre de panier
    titre "Panier"
    texte "{n article}"
    bouton "Vider"
    quand l'utilisateur clique sur "Vider" :
        vider_panier()
```

---

## 14. Les événements

Un événement dit **quand** faire quelque chose. Il s'écrit sous les éléments
qu'il vise, et son bloc contient les actions.

```humalis
page "accueil" :
    titre "Bienvenue"
    image "produit.png" avec description "Le produit"
    bouton "Commencer"
    quand la page se charge :
        afficher "Prêt"
    quand l'utilisateur clique sur "Commencer" :
        afficher "C'est parti"
    quand l'utilisateur survole "produit.png" :
        afficher "Aperçu du produit"
```

| Événement | Quand |
|---|---|
| `quand la page se charge :` | à l'ouverture de la page |
| `quand l'utilisateur clique sur "…" :` | au clic (ou au toucher) |
| `quand l'utilisateur survole "…" :` | au passage de la souris |
| `quand le formulaire "…" est soumis :` | à l'envoi d'un formulaire valide |
| `quand l'utilisateur ecrit dans "…" :` | à chaque frappe |
| `quand l'utilisateur arrete d'ecrire dans "…" :` | après une pause dans la frappe |
| `quand l'utilisateur appuie sur "controle+k" :` | à un raccourci clavier |
| `quand l'utilisateur arrive en bas de "…" :` | au bas d'une liste (défilement infini) |

Dans une boucle, un événement vise l'élément de **son** tour :

```humalis
page "produits" :
    variable produits = ["Livre", "Stylo"]
    titre "Produits"
    pour chaque nom dans produits :
        texte nom
        bouton "Acheter"
        quand l'utilisateur clique sur "Acheter" :
            afficher "Tu as acheté {nom}"
```

---

## 15. Les actions

Les actions s'écrivent dans un événement.

| Action | Effet |
|---|---|
| `afficher "…"` | un message |
| `afficher erreur "…"` | un message d'erreur |
| `montrer "nom"`, `cacher "nom"` | fait apparaître ou disparaître un élément |
| `changer x par …` | change une variable |
| `changer texte de "nom" par "…"` | change le texte d'un élément |
| `ajouter … à liste`, `retirer … de liste` | modifie une liste |
| `rediriger vers "page"` | va à une page |
| `revenir vers "page"` | revient en arrière, ou va à cette page |
| `envoyer requete vers "…"` | appelle un serveur (voir [le serveur](#22-relier-les-pages-au-serveur)) |
| `copier …`, `partager …` | copie dans le presse-papiers, partage |

```humalis
page "produit" :
    titre "Produit"
    texte "Un livre." avec nom "description"
    bouton "Voir plus"
    bouton "Commander"
    quand l'utilisateur clique sur "Voir plus" :
        changer texte de "description" par "Un livre de 200 pages, illustré."
    quand l'utilisateur clique sur "Commander" :
        rediriger vers "merci"

page "merci" :
    titre "Merci !"
```

---

## 16. Les messages, les fenêtres et les questions

### Les messages

```humalis
page "compte" :
    variable panier = ["Livre"]
    titre "Compte"
    bouton "Enregistrer"
    bouton "Supprimer"
    quand l'utilisateur clique sur "Enregistrer" :
        afficher reussite "Enregistré"
        afficher avertissement "Pense à vérifier ton email" pendant 10 secondes
    quand l'utilisateur clique sur "Supprimer" :
        retirer "Livre" de panier
        afficher reussite "Livre retiré" avec action "Annuler" :
            ajouter "Livre" a panier
```

Les genres : `afficher`, `afficher reussite`, `afficher avertissement`,
`afficher erreur`. `pendant 10 secondes` règle la durée ; `sans disparaitre`
le garde affiché ; `avec action "…" :` ajoute un bouton.

### Les fenêtres

```humalis
page "aide" :
    titre "Aide"
    bouton "Ouvrir l'aide"
    quand l'utilisateur clique sur "Ouvrir l'aide" :
        montrer "Raccourcis"
    fenetre "Raccourcis" avec description "Les touches utiles" :
        texte "Ctrl+K ouvre cette aide."
        bouton "Compris"
        quand l'utilisateur clique sur "Compris" :
            cacher "Raccourcis"
```

### Poser une question

```humalis
page "panier" :
    variable panier = ["Livre", "Stylo"]
    titre "Panier"
    pour chaque p dans panier :
        texte p
        bouton "Retirer {p}" avec nom "retirer"
        quand l'utilisateur clique sur "retirer" :
            confirmer "Retirer {p} du panier ?" avec oui "Retirer" et non "Garder" :
                retirer p de panier
            sinon :
                afficher "Rien n'a été retiré"
```

---

## 17. Les interactions

### Copier et partager

```humalis
page "promo" :
    variable code = "BIENVENUE10"
    titre "Ton code promo"
    texte code
    bouton "Copier le code"
    bouton "Partager"
    quand l'utilisateur clique sur "Copier le code" :
        copier code avec message "Code copié"
    quand l'utilisateur clique sur "Partager" :
        partager "Viens voir la boutique" avec titre "La boutique" avec lien vers "promo"
```

### Les minuteries

```humalis
page "chrono" :
    variable secondes = 0
    variable actif = vrai
    variable copie = faux
    titre "Chrono"
    texte "Ouvert depuis {secondes} secondes"
    toutes les 1 seconde tant que actif est vrai :
        changer secondes par secondes + 1
    bouton "Arrêter"
    quand l'utilisateur clique sur "Arrêter" :
        changer actif par faux
        changer copie par vrai
        apres 2 secondes :
            changer copie par faux
    si copie est vrai :
        texte "Arrêté !"
```

Une minuterie s'arrête quand on quitte la page, et se met en pause quand
l'onglet est caché.

### Les raccourcis et la recherche pendant la frappe

```humalis
page "recherche" :
    variable resultats = []
    titre "Recherche"
    champ "recherche" avec indice "Chercher un livre" et raccourci "/"
    quand l'utilisateur arrete d'ecrire dans "recherche" :
        envoyer requete vers "/recherche" avec le champ "recherche" dans resultats
    calcul trouves = nombre de resultats
    texte "{trouves} résultats" avec annonce
    pour chaque r dans resultats :
        texte r
    bouton "Aide" avec raccourci "controle+k"
    quand l'utilisateur clique sur "Aide" :
        afficher "Tape / pour chercher"
```

`avec annonce` fait lire le texte par les lecteurs d'écran quand il change.

### Le défilement infini

```humalis
page "catalogue" :
    variable produits = []
    variable nouveaux = []
    variable numero = 1
    variable il_reste = vrai
    titre "Catalogue"
    section avec nom "liste" :
        pour chaque p dans produits :
            texte p
    quand l'utilisateur arrive en bas de "liste" tant que il_reste est vrai avec bouton "Voir plus" :
        envoyer requete vers "/produits" avec numero dans nouveaux
        pour chaque n dans nouveaux :
            ajouter n a produits
        changer numero par numero + 1
        si nouveaux est vide :
            changer il_reste par faux
```

Le bouton « Voir plus » reste disponible pour les personnes qui naviguent au
clavier.

---

## 18. Les formulaires

Un formulaire regroupe des champs et un bouton. Les champs `obligatoire`, les
`minimum` et `maximum` sont vérifiés **avant** l'envoi, avec un message clair
sous le champ fautif.

```humalis
page "contact" :
    titre "Nous écrire"
    formulaire "message" :
        champ "Nom" avec obligatoire
        champ email "Email" avec obligatoire
        champ texte long "Message"
        bouton "Envoyer"
    quand le formulaire "message" est soumis :
        si champ "Message" est vide :
            afficher erreur "Écris ton message"
        sinon :
            afficher reussite "Message envoyé"
```

On lit la valeur d'un champ avec `champ "Nom"` (ou `le champ "Nom"`).

---

## 19. Partager et garder des valeurs

### Une variable pour toutes les pages

Une variable écrite en haut du fichier avec `partagee` est la même sur toutes
les pages :

```humalis
variable panier = [] avec partagee

page "boutique" :
    calcul nombre_articles = nombre de panier
    titre "Boutique"
    texte "Articles : {nombre_articles}"
    bouton "Ajouter un livre"
    quand l'utilisateur clique sur "Ajouter un livre" :
        ajouter "Livre" à panier
    lien "Voir le panier" vers "panier"

page "panier" :
    titre "Ton panier"
    pour chaque nom dans panier :
        texte nom
    lien "Retour" vers "boutique"
```

### Garder une valeur au retour

`memorisee` garde la valeur sur l'appareil de la personne, même après avoir
fermé le site :

```humalis
variable panier = [] avec partagee et memorisee

page "boutique" :
    variable visites = 0 avec memorisee
    titre "Boutique"
    texte "Tu es venu {visites} fois."
    bouton "Compter ma visite"
    quand l'utilisateur clique sur "Compter ma visite" :
        changer visites par visites + 1
```

Sur le mobile et le desktop, `memorisee en secret` range la valeur dans le
coffre chiffré de l'appareil (le trousseau sur un Mac, par exemple).

---

## 20. La navigation

### Les liens et les paramètres

```humalis
page "catalogue" :
    titre "Catalogue"
    lien "Voir le livre" vers "produit" avec id "livre-1"
    lien "Nos desserts" vers "carte#desserts"
    lien "Nous suivre" vers "https://exemple.fr" avec nouvel onglet

page "produit" avec parametre id :
    titre "Produit"
    texte "Produit {id}"
    bouton "Retour"
    quand l'utilisateur clique sur "Retour" :
        revenir vers "catalogue"

page "carte" :
    titre "La carte"
    section "Desserts" avec ancre "desserts" :
        texte "Tarte aux pommes"
```

### Les filtres d'adresse

Un filtre est une valeur facultative de l'adresse (`/catalogue?categorie=robes`) :

```humalis
page "catalogue" avec filtre categorie :
    titre "Catalogue"
    menu :
        lien "Tout" vers "catalogue"
        lien "Robes" vers "catalogue" avec categorie "robes"
    si categorie est rien :
        texte "Toutes les catégories"
    sinon :
        texte "Catégorie : {categorie}"
```

### Les sous-pages

```humalis
page "espace" :
    titre "Mon espace"
    menu :
        lien "Profil" vers "profil"
        lien "Réglages" vers "reglages"
    sous page

page "profil" dans "espace" :
    texte "Ton profil"

page "reglages" dans "espace" :
    texte "Tes réglages"
```

`sous page` marque l'endroit où la sous-page s'affiche, sous le menu commun.

### Une adresse choisie, une page réservée, la page introuvable

```humalis
serveur "boutique" :
    donnee commande :
        numero : texte
    route "commandes" :
        connecte peut lire commande

page "accueil" :
    titre "Accueil"
    lien "Mes commandes" vers "commandes"

page "commandes" a l'adresse "/compte/commandes" reservee a connecte sinon vers "connexion" :
    titre "Mes commandes"

page "connexion" :
    titre "Connexion"
    formulaire "connexion" :
        champ email "email" avec obligatoire
        champ mot de passe "mot de passe" avec obligatoire
        bouton "Se connecter"
    quand le formulaire "connexion" est soumis :
        se connecter avec champ "email" et champ "mot de passe"
        continuer vers "accueil"

page "introuvable" :
    titre "Cette page n'existe pas"
    lien "Retour à l'accueil" vers "accueil"
```

- `a l'adresse "/…"` choisit l'adresse de la page.
- `reservee a connecte` (ou `reservee a admin`) la ferme aux visiteurs, renvoyés
  vers la page de connexion. Après la connexion, `continuer vers` les ramène à
  la page qu'ils voulaient.
- Une page nommée `introuvable` remplace la page « 404 ».

---

## 21. Le serveur

Un bloc `serveur` décrit les données de l'application et **qui a le droit de
faire quoi**. Humalis en produit un vrai serveur Node, avec la connexion, les
sessions et la sécurité des packs Astratra.

```humalis
serveur "bibliotheque" :
    donnee livre :
        titre : texte
        pages : nombre
        disponible : booleen
        parution : date
        auteurs : liste de texte
    donnee avis :
        note : nombre
        commentaire : texte
    route "livres" :
        tout le monde peut lire livre
        seul admin peut modifier livre
    route "avis" :
        tout le monde peut lire avis
        connecte peut creer avis
        seul admin peut supprimer avis
```

- `donnee` décrit une sorte de donnée et ses champs : `texte`, `nombre`,
  `booleen`, `date`, `liste de …`.
- `route` donne une adresse (`/api/livres`) et ses règles.
- Les droits : `tout le monde`, `connecte`, `seul admin` ; les actions : `lire`,
  `creer`, `modifier`, `supprimer` (`modifier` seul couvre créer, modifier et
  supprimer).
- Une action sans règle est **refusée à tout le monde**. Humalis prévient quand
  une donnée n'est accessible à personne.

Pour le produire et le lancer :

```sh
humalis compile mon-projet.humalis --cible serveur --sortie mon-projet-serveur
cd mon-projet-serveur && npm install
cp .env.exemple .env      # puis remplir JWT_SECRET et l'administrateur
npm test                  # vérifie chaque règle d'accès
npm run build && npm start
```

Sans `DATABASE_URL` dans le `.env`, les données restent en mémoire
(développement). Avec, elles vont dans PostgreSQL : une table par donnée,
créée au démarrage.

---

## 22. Relier les pages au serveur

Quand le serveur et les pages sont dans le même fichier, Humalis **vérifie
chaque requête à la compilation** : la route existe, les champs existent, les
types sont les bons, et la personne a le droit.

```humalis
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    donnee avis :
        note : nombre
        commentaire : texte
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
    route "avis" :
        tout le monde peut lire avis
        connecte peut creer avis
        seul admin peut supprimer avis

page "boutique" :
    variable produits = []
    variable note = 5
    titre "Boutique"
    quand la page se charge :
        envoyer requete vers "produits" dans produits
    pour chaque p dans produits :
        texte "{p.nom} : {p.prix en euros}"
    si utilisateur est connecte :
        champ "commentaire"
        bouton "Publier"
        quand l'utilisateur clique sur "Publier" :
            envoyer requete vers "avis" avec note et champ "commentaire"
            afficher reussite "Merci pour ton avis"
        bouton "Se déconnecter"
        quand l'utilisateur clique sur "Se déconnecter" :
            se deconnecter
    sinon :
        lien "Se connecter pour donner un avis" vers "connexion"

page "connexion" :
    titre "Connexion"
    formulaire "connexion" :
        champ email "email" avec obligatoire
        champ mot de passe "mot de passe" avec obligatoire
        bouton "Se connecter"
    quand le formulaire "connexion" est soumis :
        se connecter avec champ "email" et champ "mot de passe"
        rediriger vers "boutique"
```

- `envoyer requete vers "produits" dans produits` lit la liste.
- `envoyer requete vers "avis" avec note et champ "commentaire"` envoie.
- `si utilisateur est connecte :`, `si utilisateur est admin :`,
  `se connecter`, `se deconnecter` gèrent la session.

### Réagir à un échec

```humalis
serveur "boutique" :
    donnee commande :
        nom : texte
    route "commandes" :
        tout le monde peut creer commande

page "commande" :
    titre "Commander"
    formulaire "commande" :
        champ "Nom"
        bouton "Commander"
    quand le formulaire "commande" est soumis :
        essayer :
            envoyer requete vers "commandes" avec champ "Nom"
            afficher reussite "Commande envoyée"
        si erreur :
            afficher erreur "La commande n'est pas partie : {raison}"
```

Dans `si erreur :`, `raison` dit ce qui n'a pas marché. Dans un formulaire, les
champs restent remplis.

---

## 23. Utiliser une API qui existe déjà

Un bloc `source` décrit une API écrite ailleurs (en Node, PHP, Python…). Les
pages s'en servent comme d'un serveur Humalis, avec les mêmes vérifications.

```humalis
source "boutique" :
    adresse "https://api.exemple.fr"
    enveloppe "data"
    erreur dans "message"
    donnee produit :
        id : texte
        name : texte
        price : nombre
    route "api/products" :
        lire une liste de produit dans "products"
        lire un produit dans "product"

page "catalogue" :
    variable produits = []
    titre "Nouveautés"
    quand la page se charge :
        envoyer requete vers "api/products" de la source "boutique" dans produits
    si produits est en erreur :
        texte erreur de produits
        bouton "Réessayer"
        quand l'utilisateur clique sur "Réessayer" :
            recharger produits
    pour chaque p dans produits :
        lien p.name vers "produit" avec id p.id

page "produit" avec parametre id :
    variable produit = rien
    quand la page se charge :
        envoyer requete vers "api/products" de la source "boutique" avec id dans produit
    si produit est rien :
        texte "Chargement du produit…"
    sinon :
        titre produit.name
        texte "{produit.price en euros}"
```

- `est en chargement` et `est en erreur` suivent l'état d'une requête vers une
  source ; `recharger produits` la relance.
- `enveloppe "data"` : la réponse de l'API range ses données sous `data`.
- `erreur dans "message"` : où l'API écrit ses messages d'erreur.
- `session astratra` : l'API utilise la connexion des packs Astratra.
- Une route peut `lire`, `creer`, `modifier` (`par remplacement` pour un PUT) et
  `supprimer`. Un jeton secret ne s'écrit jamais dans le fichier : Humalis le
  refuse.

---

## 24. Les données d'un fichier

Un tableau CSV ou un fichier JSON peut servir de données, lues à la
compilation :

```humalis
utiliser donnees "produits" depuis "./produits.csv"

page "catalogue" :
    titre "Catalogue"
    pour chaque p dans produits :
        texte "{p.nom} : {p.prix en euros}"
```

avec, à côté, le fichier `produits.csv` :

```csv produits.csv
nom;prix
Livre;12
Stylo;2
```

Humalis connaît les colonnes : `p.prixx` serait refusé à la compilation. Ces
données se lisent seulement ; on ne peut pas les changer depuis une page.

---

## 25. Choisir et envoyer un fichier

```humalis
page "profil" :
    variable photo = rien
    titre "Ma photo de profil"
    fichier "Choisir une photo" dans photo accepte images avec maximum 5 Mo
    si photo est different de rien :
        image photo.apercu avec description "Aperçu de la photo choisie" et proportions 1 sur 1
        texte photo.nom
```

Le type et la taille sont vérifiés dans la page pour aider la personne ; le
serveur qui reçoit le fichier doit toujours revérifier. L'envoi passe par une
`source` : `envoyer fichier photo vers "…" de la source "…"`, avec une barre
de progression (`suivi dans envoi`).

---

## 26. Les graphiques

Chaque graphique a une description (pour les personnes qui ne le voient pas),
et un bouton « Voir les données » qui montre le tableau.

```humalis
page "chiffres" :
    variable ventes = [fiche avec mois "Janvier" et montant 1200 et achats 900, fiche avec mois "Février" et montant 1800 et achats 1100, fiche avec mois "Mars" et montant 1500 et achats 950]
    variable depenses = [fiche avec poste "Loyer" et total 500, fiche avec poste "Courses" et total 300, fiche avec poste "Transport" et total 50]
    variable visites = [120, 180, 150, 210, 260, 320, 90]
    titre "Nos chiffres"
    graphique en courbe ventes avec etiquette mois et valeur montant en euros et description "Les ventes montent de janvier à février, puis baissent un peu en mars."
    graphique en barres ventes avec etiquette mois et description "Les ventes dépassent les achats chaque mois." :
        serie "Ventes" valeur montant en euros avec couleur bleu
        serie "Achats" valeur achats en euros avec couleur orange
    graphique en camembert depenses avec etiquette poste et valeur total en euros et description "Le loyer pèse plus de la moitié des dépenses."
    graphique en barres visites avec etiquettes ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] et couleur vert et proportions 2 sur 1 et description "Les visites montent jusqu'au samedi."
```

Les genres : `en courbe`, `en barres`, `en camembert`.

---

## 27. Les cartes

```humalis
page "nous_trouver" :
    variable boutiques = [fiche avec nom "Lyon" et latitude 45,764 et longitude 4,8357, fiche avec nom "Lille" et latitude 50,6292 et longitude 3,0573]
    titre "Nous trouver"
    carte "Notre boutique de Paris" avec latitude 48,8566 et longitude 2,3522 et zoom 15
    carte "Nos autres boutiques" :
        pour chaque b dans boutiques :
            marqueur b.nom avec latitude b.latitude et longitude b.longitude
```

Les tuiles viennent d'OpenStreetMap par défaut. Pour un site très fréquenté,
choisis un fournisseur de tuiles avec `tuiles "…"` et son `attribution "…"`.

---

## 28. Plusieurs langues

On écrit le code en français ; le **site** peut parler plusieurs langues. La
première langue du bloc est celle des textes écrits.

```humalis
langues :
    francais
    anglais

traductions anglais :
    "Voir le catalogue" : "See the catalogue"

page "accueil" :
    selecteur de langue
    variable panier = 3
    titre "Bienvenue" en anglais "Welcome"
    texte "{panier article} dans le panier" en anglais "{panier item} in the cart"
    bouton "Voir le catalogue"
    quand l'utilisateur clique sur "Voir le catalogue" :
        rediriger vers "catalogue"

page "catalogue" :
    titre "Le catalogue" en anglais "The catalogue"
    lien "Retour à l'accueil" en anglais "Back to home" vers "accueil"
```

- `en anglais "…"` donne la version d'un texte.
- `traductions anglais :` traduit une seule fois un texte répété.
- `selecteur de langue` affiche le choix de la langue ; `changer langue par
  anglais` et `si langue est anglais :` s'utilisent dans les événements.
- Le message de `copier` se traduit comme les autres textes :
  `copier code avec message "Copié" en anglais "Copied"`.
- Humalis signale à la compilation tout texte qui n'a pas sa traduction. Les
  messages de Humalis (champ obligatoire, chargement…) suivent la langue.

---

## 29. Publier un site

Le bloc `site :` en haut du fichier décrit le site pour les moteurs de
recherche et les réseaux sociaux. Le bloc `apercu :` règle une page.

```humalis
site :
    nom "Le Comptoir"
    description "Une cuisine de saison au cœur de la ville, ouverte du lundi au samedi."
    logo "./logo.svg"
    image "./partage.png"
    adresse "https://lecomptoir.fr"

page "accueil" :
    titre "Le Comptoir"

page "panier" :
    apercu :
        indexation non
    titre "Ton panier"

page "a_propos" :
    apercu :
        titre "Qui sommes-nous"
        description "L'histoire du Comptoir, une cuisine de saison née en 2020 au cœur de la ville."
    titre "À propos"
```

Avec une `adresse`, la cible web écrit le plan du site (`sitemap.xml`) et
`robots.txt`. Une page en `indexation non` n'y apparaît pas. Humalis prévient
quand un titre ou une description est trop long ou trop court pour les moteurs
de recherche.

---

## 30. Les composants et les projets en plusieurs fichiers

### Un composant Humalis

Un composant est un morceau de page réutilisable. Son nom commence par une
majuscule.

```humalis
composant "Fiche" :
    parametre nom
    parametre prix
    texte nom
    texte "{prix} €"

page "boutique" :
    titre "Boutique"
    Fiche avec nom "Livre" et prix 12
    Fiche avec nom "Stylo" et prix 2
```

### Un composant React

Un composant React existant s'utilise comme un composant Humalis (web et
desktop) :

```humalis
utiliser composant "Carte" depuis "./composants/Carte"

page "accueil" :
    titre "Accueil"
    Carte avec titre "Fournitures scolaires"
```

Dans l'autre sens, `humalis compile … --composants <dossier>` produit des
composants React à importer dans un projet React existant.

### Plusieurs fichiers

Un grand projet se range en plusieurs fichiers. En haut du fichier principal :

```humalis
utiliser fichier "./panier.humalis"
utiliser fichier "./catalogue.humalis"

page "accueil" :
    titre "Accueil"
```

Tout ce que contiennent ces fichiers (pages, composants, variables partagées,
fonctions) rejoint le projet. `humalis nouveau` range déjà les fichiers ainsi.

---

## 31. Tester en Humalis

Un fichier `*.test.humalis` décrit ce que la personne fait et ce qu'elle doit
voir. `humalis tester` les lance dans un vrai navigateur.

```humalis
page "accueil" :
    titre "Bienvenue"
    bouton "Dire bonjour"
    quand l'utilisateur clique sur "Dire bonjour" :
        afficher "Bonjour !"

test "le bouton dit bonjour" de page "accueil" :
    verifier que texte "Bienvenue" est visible
    cliquer sur "Dire bonjour"
    verifier que texte "Bonjour !" est visible
```

Les autres étapes : `remplir champ "email" avec "…"`, `aller vers "panier"`,
`verifier que champ "email" vaut "…"`, `verifier que page est "panier"` et
`verifier que texte "…" est absent`.

---

## 32. Les commandes

| Commande | Rôle |
|---|---|
| `humalis nouveau <nom>` | crée un projet |
| `humalis developper` | lance le site et le recompile à chaque enregistrement |
| `humalis compile <fichier> --cible <cible> --sortie <dossier>` | produit le projet d'une cible |
| `humalis compile <fichier> --cible web --composants <dossier>` | produit des composants React à importer ailleurs |
| `humalis verifier <fichier>` | affiche les erreurs et les avertissements |
| `humalis verifier <fichier> --exigeant` | traite aussi les avertissements comme des erreurs |
| `humalis formater <fichier>` | remet le fichier en forme |
| `humalis tester` | lance les tests `*.test.humalis` |
| `humalis packs` | dit si les packs Astratra ont des mises à jour |

Pour le web et le statique, `--adresse https://…` donne l'adresse finale du
site (plan du site, liens de partage). Pour le desktop, `--serveur https://…`
donne l'adresse du serveur que l'application appelle.

### Les messages d'erreur

Les messages sont en français, avec la ligne, et proposent souvent la
correction :

```
Erreur, ligne 3 : le texte utilise {totl}, mais la variable « totl » n'est pas déclarée. Peut-être « total » ?
```

L'extension VS Code « Humalis » les affiche pendant que tu écris, avec la
coloration, la complétion et le survol des mots.

---

## 33. Ce que chaque cible sait faire

Le même fichier donne toutes les cibles. Quand une construction n'existe pas
sur une cible, le compilateur le dit clairement au lieu de produire quelque
chose de faux.

| | web | statique | mobile | desktop |
|---|---|---|---|---|
| Pages, éléments, styles, thème | oui | oui | oui | oui |
| Ton propre CSS | oui | oui | non (styles nommés seulement) | oui |
| Requêtes vers un serveur | oui | oui | oui | oui |
| `memorisee` | oui | oui | oui | oui |
| `memorisee en secret` | non | non | oui | oui |
| `essayer` | oui | non | oui | oui |
| Raccourcis clavier | oui | oui | non | oui |
| Composants React | oui | non | oui (en React Native) | oui |
| Plan du site, aperçu de partage | oui | oui | non | non |

Le serveur (`--cible serveur`) se produit à part, depuis le bloc `serveur`.
