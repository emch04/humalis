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

Les cibles sont `web`, `statique`, `mobile`, `desktop`, `apple` et `serveur`. Le
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

Dans un bloc placé sous un sous-titre, un `soustitre` descend d'un niveau tout
seul : la carte d'une section devient un niveau 3. Dans une `section`, le premier
sous-titre est le titre de la section, même rangé dans son propre bloc ; tous les
autres sous-titres de la section descendent d'un niveau. `avec niveau` reste
possible pour choisir soi-même.

```humalis
page "accueil" :
    titre "Accueil"
    section :
        soustitre "Nos pages"
        grille :
            bloc :
                soustitre "Exemples"
                texte "Six applications à essayer."
```

Dans un `titre`, un `soustitre` ou un `texte`, `{accent "…"}` met quelques mots
en valeur avec la couleur de marque. Le texte reste lisible normalement par les
lecteurs d'écran et dans le titre de l'onglet.

```humalis
page "offre" :
    titre "Une offre {accent "simple"}"
    texte "Prix : {accent "gratuit"} pour toujours"
```

`{a la ligne}` passe à la ligne dans un texte. `{saut de ligne}` fait la même
chose.

```humalis
page "horaires" :
    titre "Horaires"
    texte "Du lundi au vendredi : 9 h à 18 h{a la ligne}Le samedi : 10 h à 13 h"
```

### Listes

`liste :` crée des puces ; `liste numerotee :` numérote chaque élément. Chaque instruction du bloc devient une entrée.

```humalis
page "guide" :
    liste :
        texte "Installer Node.js"
        texte "Créer le projet"
    liste numerotee :
        texte "Écrire le fichier"
        texte "Compiler"
```

### Code dans une phrase

Dans un texte, un morceau de code s'écrit entre accents graves, comme dans
toutes les documentations : il s'affiche à chasse fixe, tel quel, guillemets et
accolades compris. `{code "…"}` fait la même chose.

```humalis
page "guide" :
    texte "Écris `titre` pour donner un titre."
    texte "Un texte : `texte "Bonjour {prenom}"`."
```

### Bloc de code

`code langage :` recopie les lignes indentées sans les interpréter ; le langage est facultatif.

```humalis
page "guide" :
    code humalis :
        page "accueil" :
            titre "Bienvenue"
```

`avec animation frappe` écrit le code lettre par lettre, avec un curseur ;
`avec animation frappe au defilement` attend que le bloc arrive à l'écran. Le
vrai code reste en place pendant la frappe (lecteurs d'écran, bouton Copier), et
il s'affiche tout de suite si la personne a demandé de réduire les animations.
Sur le téléphone, le code s'affiche entier.

```humalis
page "accueil" :
    code humalis avec animation frappe :
        page "boutique" :
            titre "Nos produits"
            bouton "Commander"
```

### Tableau

Un tableau a une légende, des colonnes et des rangées de même largeur. Une traduction peut suivre chaque cellule.

```humalis
langues :
    francais
    anglais

page "guide" :
    tableau "Les commandes" en anglais "Commands" :
        colonnes "Commande", "Rôle" en anglais "Role"
        rangee "humalis compile", "produit le projet" en anglais "builds the project"
```

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

Sans guillemets, `vers` lit l'adresse dans une variable ou dans le champ d'une
fiche :

```humalis
page "accueil" :
    variable site = "https://exemple.fr"
    variable reglage = fiche avec aide "contact" et boutique "https://exemple.fr/boutique"
    titre "Accueil"
    lien "Notre site" vers site
    lien "Besoin d'aide ?" vers reglage.aide
    lien "La boutique" vers reglage.boutique avec nouvel onglet

page "contact" :
    titre "Contact"
```

L'adresse est lue au moment d'afficher : si la variable change, le lien suit.
Une adresse qui commence par `https://`, `http://`, `mailto:` ou `tel:` sort du
site ; une autre (`"contact"`) est une adresse du site. Une adresse d'un autre
genre, comme `javascript:`, est écartée : le texte reste, sans lien. La variable
doit contenir un texte.

Un bouton peut ne montrer qu'une icône : `bouton icone "fermer"`. Il lui faut
alors un `nom`. C'est ce que lit un lecteur d'écran, et c'est lui que vise
l'événement.

```humalis
page "agenda" :
    variable ouvert = vrai
    titre "Agenda"
    bouton icone "fermer" avec nom "Fermer l'agenda"
    quand l'utilisateur clique sur "Fermer l'agenda" :
        changer ouvert par faux
```

`avec desactive` montre un bouton sur lequel on ne peut pas cliquer. Avec `si`,
il suit une condition : le bouton redevient cliquable dès qu'elle est fausse.

```humalis
page "panier" :
    variable panier = []
    titre "Panier"
    bouton "Payer" avec desactive si panier est vide et fond vert
    bouton "Paiement en trois fois" avec desactive
```

La condition s'arrête au prochain `et`, qui ouvre l'option suivante. Pour
combiner deux conditions, on les range d'abord dans un `calcul`, puis on écrit
simplement `desactive si` suivi de son nom :

```humalis
page "commande" :
    variable panier = []
    variable envoi_en_cours = faux
    calcul bloque = panier est vide ou envoi_en_cours
    titre "Commande"
    bouton "Commander" avec desactive si bloque
```

Un bouton désactivé reste visible, plus pâle. `desactive` vaut pour un bouton et
pour un champ (voir [Champ](#champ)).

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

`avec desactive` montre un champ qu'on ne peut pas remplir. Avec `si`, il suit
une condition, comme un bouton. Toutes les sortes de champ l'acceptent, ainsi
que les choix, les listes déroulantes et les cases à cocher :

```humalis
page "profil" :
    variable verrou = vrai
    titre "Profil"
    formulaire "profil" :
        champ "Identifiant" avec desactive
        champ email "Email" avec desactive si verrou
        case a cocher "Lettre d'information" avec desactive si verrou
        bouton "Enregistrer"
    bouton "Modifier"
    quand l'utilisateur clique sur "Modifier" :
        changer verrou par faux
    quand le formulaire "profil" est soumis :
        afficher "Profil enregistré"
```

Un champ désactivé reste visible, plus pâle. Dans le navigateur, il garde le
comportement habituel d'un champ désactivé.

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

### Un design par plateforme

La logique reste la même ; seul le design change. `sur apple` vaut pour iPhone, iPad et Mac,
`sur ios` pour iPhone et iPad, `sur macos` pour Mac, `sur windows` pour l'application
Windows, `sur application` pour toutes les applications natives, `sur site` pour le web.
Une phrase qui vise une autre plateforme n'a aucun effet, et la plus précise gagne.

Chaque cible peut ainsi avoir sa propre feuille de style : un CSS commun (sans `sur`)
reste possible, mais il n'est pas obligatoire.

```humalis
utiliser style "./site.css" sur site
utiliser style "./iphone.css" sur ios
utiliser style "./mac.css" sur macos
utiliser style "./windows.css" sur windows

page "accueil" :
    bouton "Commander" avec style "principal" et sur apple style "plein-ecran" et sur windows style "large"
    sur application :
        texte "Merci d'utiliser l'application"
    sur site :
        lien "Installer l'application" vers "installer"
```

Sur la cible Apple, chaque règle `.classe { … }` est traduite en SwiftUI. Ce qui n'a pas
d'équivalent (`@media`, survols, sélecteurs composés, placement libre…) est compté à la
compilation et listé, avec sa raison, dans `CSS-SUR-APPLE.md`. Sur la cible Windows, de
même, dans `CSS-SUR-WINDOWS.md`.

Un même bloc peut viser plusieurs plateformes : on les relie par `et`.

```humalis
page "accueil" :
    titre "Mon agenda"
    sur site et macos :
        texte "Glisse un rendez-vous pour le déplacer."
    sur ios :
        texte "Touche un rendez-vous pour le déplacer."
```

### Une page dessinée

`dessinee pour 1440 par 900`, après le nom d'une page, donne la taille pour
laquelle elle a été dessinée. Dans l'application Apple, la page suit alors son CSS
au point près. Sur le site et les autres cibles, rien ne change.

- **Sur Mac**, la page garde la largeur du dessin et grandit avec la fenêtre.
- **Sur iPhone et iPad**, elle se rend comme dans Safari sur le même appareil : un
  pixel du CSS pour un point de l'écran. Les règles `@media (min-width: …)` et
  `@media (max-width: …)` suivent la vraie largeur de l'écran, et changent en
  direct quand on tourne l'appareil ou qu'on partage l'écran de l'iPad. Le contenu
  reste dans la zone sûre (encoche, barre du bas) et le fond de la page passe
  dessous. Une page plus haute que l'écran défile, et le clavier ne cache pas le
  champ où l'on écrit. Un bouton ou un lien plus petit que 44 points se touche
  quand même : sa zone de toucher grandit, pas son dessin.
- **Partout**, `@media (prefers-color-scheme: dark)` suit le mode sombre de
  l'appareil, en direct.

La page part du même point que le site : les marges par défaut du navigateur
(paragraphes, titres), la feuille de base de Humalis et le thème, puis le CSS du
projet. `box-sizing` est respecté, et `env(safe-area-inset-…)` vaut 0, comme dans
Safari. Chaque élément est à sa place dans la même structure que le site :
`main.humalis-page` autour de la page, `header.humalis-entete` pour la barre
latérale, `label.humalis-champ` autour d'un champ. Les champs, les listes
déroulantes, les cases à cocher et les formulaires suivent donc leur CSS. Sur le
site, une barre latérale fixée à gauche laisse sa place par une marge de la page ;
dans l'application, la barre est déjà à côté, et cette marge perd sa largeur.

Pour le vérifier, `node scripts/essai-apple-dessin.mjs page.humalis` mesure la
même page sur le site (dans Chrome) et dans l'application (`--appareil "…"` pour
un simulateur, `--mac`, `--sombre`, `--web`), puis compare la place de chaque
élément, au point près.

Chaque appareil a son propre CSS : `utiliser style "./ios.css" sur ios` ne vaut
que sur iPhone et iPad, `sur macos` que sur Mac, et un CSS commun reste
facultatif. Les blocs `sur ios :` et `sur macos :` d'une page dessinée, et les
styles `sur ios style "…"`, suivent la même règle. Les pages qui ne sont pas
dessinées gardent leur rendu natif.

```humalis
utiliser style "./site.css"
utiliser style "./ios.css" sur ios

page "accueil" dessinee pour 1440 par 900 :
    titre "Tableau de bord" avec style "titre"
    sur ios :
        texte "Bienvenue sur l'iPhone"
```

Avec des pages dessinées, `barre laterale :` en haut du fichier écrit la barre
latérale comme une page : sur Mac, et sur iPad tant que le CSS la montre à cette
largeur. Sur iPhone, ou quand le CSS la cache, l'application garde sa navigation
native. Sur les autres cibles, elle prend la place de l'en-tête quand le projet
n'en a pas ; s'il y a un `entete`, elle s'efface.

```humalis
utiliser style "./bureau.css"

barre laterale avec style "barre" :
    lien "Tableau de bord" vers "accueil"
    lien "Clients" vers "clients"

page "accueil" dessinee pour 1440 par 900 :
    titre "Tableau de bord"

page "clients" dessinee pour 1440 par 900 :
    titre "Clients"
```

`utiliser icones "./icones.svg"`, en haut du fichier, ajoute les dessins du
projet : chaque `<symbol id="cloche">` du fichier devient une icône, utilisée
comme les autres (`icone "cloche"`, `bouton "Alertes" avec icone "cloche"`).

### Un style écrit en Humalis

`style "carte" :` en haut du fichier décrit un style en français, une propriété
par ligne. On l'applique avec `avec style "carte"`, sur un élément ou un bloc.

```humalis
theme :
    couleur marque "#4b42d6"

style "carte" :
    fond blanc
    bord 1 gris clair
    arrondi 12
    espace interieur 16
    ombre douce

style "prix" :
    couleur marque
    gras
    taille 20

page "boutique" :
    titre "Boutique"
    bloc avec style "carte" :
        texte "Carnet de notes"
        texte "12 €" avec style "prix"
```

Les propriétés : `fond`, `couleur`, `bord` (une épaisseur puis une couleur),
`arrondi`, `espace interieur`, `marge`, `ombre` (`douce`, `forte` ou `aucune`),
`taille`, `gras`, `largeur maximale` et `alignement` (`centre`, `gauche` ou
`droite`).

Les mesures sont en points. `arrondi`, `espace interieur` et `marge` prennent de
un à quatre nombres, comme en CSS.

Une couleur est un nom (`bleu`, `gris`…), suivi au besoin de `clair` ou `fonce`,
une couleur du thème, ou un code entre guillemets (`"#1f5fbf"`). Une couleur du
thème suit aussi le mode sombre.

Le style devient une classe CSS ordinaire. Il vaut donc sur toutes les cibles,
téléphone compris.

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

Un formulaire et un fil d'Ariane prennent aussi leur style :
`formulaire "commande" avec style "carte" :`, `fil d'Ariane avec style "discret" :`.

`humalis verifier` avertit si une classe donnée par `avec style` est absente du CSS
du projet et propose un nom proche. Il avertit aussi si une règle `!important`
cible une classe `.humalis-…` : retirez `!important` ou utilisez votre propre classe.

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

### Une page qui tient dans l'écran

`entete avec fixe :` garde l'en-tête immobile : seule la zone en dessous défile,
avec sa barre. `hauteur ecran` fait remplir l'écran à un bloc, sous l'en-tête, et
`defilement interne` donne à un bloc son propre défilement, sans faire bouger le
reste. Ensemble, ils font une page de documentation : le sommaire et le texte
défilent chacun de leur côté, sans une ligne de CSS.

```humalis
entete avec fixe :
    lien "Accueil" vers "guide"

page "guide" :
    titre "Le guide"
    ligne avec hauteur ecran :
        menu vertical avec defilement interne :
            lien "Installer" vers "guide"
            lien "Les pages" vers "guide"
        colonne avec defilement interne :
            texte "Un long chapitre, qui défile seul."
```

Sur le statique, la barre de défilement reste celle de la fenêtre. Sur le
téléphone, `hauteur ecran` prend la hauteur visible de la page (sous la barre de
navigation ou l'en-tête), et un bloc `defilement interne` défile seul, au doigt.

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

### Des composants natifs

Ces phrases décrivent une intention. Chaque plateforme la rend avec son vrai composant, et le
web avec un équivalent simple.

| Phrase | iPhone et iPad | Mac | Web |
|---|---|---|---|
| `onglets de l'application :` puis `onglet "A" vers "accueil" avec icone "maison"` | barre d'onglets | barre latérale | menu |
| `groupe "Équipe" :` puis ses `onglet`, décalés, dans `onglets de l'application` | onglets à plat | liste à plat | intertitre dans le menu |
| `onglets de l'application avec barre laterale "MaBarre" :` | sans effet | barre latérale dessinée par la vue Swift `MaBarre`, qui reçoit la page en contenu | sans effet |
| `recherche dans q avec indice "…"` | recherche native | recherche native | champ |
| `action en glissant "Supprimer" :` dans un `pour chaque` | glisser la ligne | clic droit | bouton |
| `actualiser en tirant :` | tirer pour actualiser | bouton dans la barre d'outils | bouton |
| `menu d'options :` puis `option "Copier" :` sous un élément | toucher prolongé | clic droit | menu dépliant |
| `formulaire "x" en reglages :` puis `groupe "Profil" :` | formulaire façon Réglages | formulaire groupé | formulaire |
| `etat vide "Rien" avec icone "boite" et description "…"` | écran vide | écran vide | bloc |
| `avec fond translucide` | verre ou matériau | verre ou matériau | flou |
| `table l :` puis `colonne "Total" avec c.total` | lignes | tableau | lignes |
| `menu de l'application "Fichier" :` puis `commande "N" avec raccourci "cmd+n" :` | raccourcis (iPad) | barre de menus | refusé |
| `page "x" en reglages :` | page | fenêtre Réglages | page |
| `page "x" en pleine fenetre :` | page jusqu'aux bords | page jusqu'aux bords | page (sans effet) |
| `page "x" dessinee pour 1440 par 900 :` | son CSS au point près, à la largeur de l'écran | son CSS au point près, à l'échelle de la fenêtre | page (son CSS) |
| `barre d'outils :` | barre du haut | barre d'outils | rangée |

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
Les liens d'un menu passent à la ligne quand la place manque. Un `menu
vertical :` range ses liens en colonne, sans jamais ouvrir une deuxième colonne :
un sommaire de hauteur limitée défile. Il se combine avec `repliable`
(`menu vertical repliable :`).

```humalis
page "guide" :
    titre "Le guide"
    menu vertical :
        lien "Installer" vers "guide"
        lien "Les pages" vers "guide"
```

Un `menu repliable :` se range derrière un bouton burger (nommé « Menu » pour les
lecteurs d'écran) sur un petit écran (téléphone) ; l'icône devient une croix
quand le menu est ouvert. Un lien choisi, un toucher à côté ou la touche Échap
referment le menu. Sur grand écran, il reste ouvert :

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

### Les vidéos

```humalis
page "atelier" :
    titre "L'atelier"
    video "atelier.mp4" avec commandes et description "Visite de l'atelier, une minute"
    video "recette.mp4" avec commandes et description "La recette du pain" et transcription "Mélangez la farine et l'eau." et boucle
```

Une vidéo demande `avec commandes` : elle a ses boutons lecture et pause, et ne
démarre jamais toute seule. Sa `description` est obligatoire aussi : elle nomme
le lecteur pour les lecteurs d'écran.

`transcription` ajoute le texte de ce qui est dit ; `boucle` relance la vidéo à
la fin. Les formats acceptés : `.mp4`, `.webm`, `.mov` et `.m4v`.

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

Un nom ne peut pas être un des petits mots que Humalis ignore pour se lire
comme une phrase : `le`, `la`, `les`, `un`, `une`, `des`, `de`, `du`, `a`, `au`,
`aux`, `se`. Écris `variable total = 0`, pas `variable a = 0`.

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

Écrit en haut du fichier, avant les pages, un calcul vaut pour toutes les pages,
l'en-tête et le pied :

```humalis
variable panier = [] avec partagee
calcul articles = nombre de panier

page "accueil" :
    titre "Accueil"
    texte "{articles} articles"
```

Entre accolades, un texte accepte aussi un calcul : `{nombre de panier}`,
`{ligne.prix * ligne.quantite}`, `{prix * 2 en euros}`.

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

Sur une liste de fiches ou de données, ces calculs lisent un champ : `somme de panier.prix`, même si `panier` est vide au départ (`variable panier = []`).

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

`initiales de` garde la première lettre de chaque mot : « Direction générale »
donne « DG ».

```humalis
page "equipe" :
    variable service = "Direction générale"
    calcul sigle = initiales de service
    titre "L'équipe"
    texte "{sigle} : {service}"
```

### L'argent et le pluriel

Dans un texte, `{prix en euros}` écrit un montant à la façon de la langue de
la page (« 1 234,50 € » en français, « €1,234.50 » en anglais), et
`{nombre article}` accorde le mot : « 1 article », « 3 articles ».

```humalis
page "panier" :
    variable prix = 1234,5
    variable nombre = 3
    titre "Panier"
    texte "{nombre article} pour {prix en euros}"
```

Les devises : `euros`, `dollars` et `FC` (franc congolais).

`{total en lettres}` écrit un nombre en toutes lettres : 71 donne « soixante et
onze ». `avec majuscule` met une majuscule au début.

```humalis
page "cheque" :
    variable total = 80
    titre "Chèque"
    texte "{total en lettres avec majuscule} euros"
```

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

Les dates s'affichent dans la langue de la page (« 2 novembre 2026 » en
français, « 2 November 2026 » en anglais). `{commande depuis}` écrit « il y a
5 minutes ». On décale de `jours`, `semaines` ou `mois`.

`{jour en date longue}` écrit la date avec le jour de la semaine : « lundi 9
novembre ». `avec majuscule` met une majuscule au début, pour un début de
phrase.

```humalis
page "agenda" :
    calcul jour = aujourd'hui
    titre "Agenda"
    texte "{jour en date longue avec majuscule}"
```

`en date longue`, `en lettres`, `avec majuscule` et `initiales de` suivent la
langue de la page (voir [plusieurs langues](#28-plusieurs-langues)).

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
| le nom seul (`si actif :`) | comme `est vrai` |
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

Une valeur qui vaut `vrai` ou `faux` se teste seule : `si actif :` veut dire
`si actif est vrai :`, et `si non actif :` son contraire. Elle se combine comme
une comparaison, avec `et` et `ou`, et marche aussi pour le champ d'une fiche
(`si p.actif :`).

Un calcul peut garder le résultat d'une comparaison : il vaut `vrai` ou `faux`,
et se lit ensuite dans un `si`. `non` donne l'inverse d'un vrai ou faux.

```humalis
page "boutique" :
    variable ouvert = faux
    variable role = "gerant"
    variable vacances = faux
    calcul est_chef = role est dans ["gerant", "direction"]
    calcul ferme = non ouvert
    calcul en_pause = ferme ou vacances
    titre "Boutique"
    si est_chef :
        bouton "Ouvrir ou fermer"
    si ferme et non vacances :
        texte "Fermé pour aujourd'hui"
    si en_pause :
        texte "Revenez bientôt"
    quand l'utilisateur clique sur "Ouvrir ou fermer" :
        changer ouvert par non ouvert
```

Un tel calcul n'est pas un nombre : `est_chef * 2` est refusé à la compilation.
Seul, un nombre ou un texte ne fait pas une condition : `si prix :` est refusé,
on écrit une comparaison (`si prix est superieur a 0 :`).

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
    calcul soldes = produits dont prix est inferieur a 10 et nom contient "S"
    calcul petits = trier (produits dont prix est inferieur a 10) par prix
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

`selon` s'écrit aussi dans une page, pour afficher ce qui correspond à une valeur :

```humalis
page "commande" :
    variable statut = "livree"
    titre "Commande"
    selon statut :
        cas "livree" :
            texte "Votre commande est arrivée."
        cas "annulee" ou "refusee" :
            texte "Votre commande n'a pas abouti."
        sinon :
            texte "Votre commande est en route."
```

`non` retourne une condition : `si non actif :` ou `si non prix est egal a 0 :`.

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
| `changer x par champ "Libellé"` | prend la valeur actuelle d'un champ |
| `vider champ "Libellé"` | remet le champ à vide, après un envoi par exemple |
| `changer texte de "nom" par "…"` | change le texte d'un élément |
| `ajouter … à liste`, `retirer … de liste` | modifie une liste |
| `ajouter champ "Libellé" à liste` | ajoute la valeur actuelle d'un champ |
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

Dans une action, `champ "Libellé"` lit ce que la personne a saisi au moment du clic. Un champ nombre donne un nombre, une case à cocher donne vrai ou faux, et les autres champs donnent du texte. Le libellé est celui de la langue de base, même si le champ a une traduction.

```humalis
page "taches" :
    variable taches = ["Acheter du pain"]
    variable dernier = ""
    champ "Nouvelle tâche"
    bouton "Ajouter"
    quand l'utilisateur clique sur "Ajouter" :
        ajouter champ "Nouvelle tâche" à taches
        changer dernier par champ "Nouvelle tâche"
    texte "Dernière ajoutée : {dernier}"
    pour chaque t dans taches :
        texte t
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

Une erreur reste 8 secondes. Humalis en affiche aussi de lui-même, par exemple
quand une lecture échoue : « Le serveur n'a pas répondu. Réessayez dans un
instant. » Pour changer la durée de toutes les erreurs du site, écris
`erreurs pendant 5 secondes` dans le [bloc `site :`](#29-publier-un-site).

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

### La valeur de départ d'un champ

`avec valeur` remplit un champ dès l'ouverture de la page : avec une variable, un
texte, ou le champ d'une fiche.

```humalis
page "profil" :
    variable nom = "Camille"
    variable produit = fiche avec prix 12
    variable abonne = vrai
    titre "Mon profil"
    formulaire "profil" :
        champ "Nom" avec valeur nom
        champ "Ville" avec valeur "Lyon"
        champ "Prix" avec valeur produit.prix
        case a cocher "Lettre d'information" avec valeur abonne
        bouton "Enregistrer"
    quand le formulaire "profil" est soumis :
        changer nom par champ "Nom"
        afficher reussite "Profil enregistré"
```

Ce que la personne tape ensuite est la valeur du champ, lue comme d'habitude
avec `champ "Nom"`. Tant qu'elle n'a rien changé au champ, il suit sa valeur de
départ : si `nom` arrive plus tard, après une lecture du serveur par exemple, le
champ se remplit. Dès qu'elle y a écrit, ce qu'elle a écrit reste. Après l'envoi
du formulaire, le champ reprend sa valeur de départ au lieu d'être vidé.

La valeur suit la sorte du champ : un nombre s'écrit tel quel, une date au format
`AAAA-MM-JJ`, et une case à cocher attend `vrai` ou `faux`. Un champ placé dans
`pour chaque` ne prend pas de valeur de départ.

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

Une adresse externe peut contenir des `{…}` : après le `?`, chaque valeur est
encodée, pour qu'un « & », un « # » ou une espace ne coupent pas l'adresse.
`rediriger vers` fait de même.

```humalis
page "panier" :
    variable message = "Bonjour, je commande un maillot"
    titre "Panier"
    lien "Commander sur WhatsApp" vers "https://wa.me/243000000000?text={message}" avec nouvel onglet
```

Toute l'adresse peut venir d'une variable : `lien "Site" vers "{adresse}"`. Seules
les adresses en `https:`, `http:`, `mailto:`, `tel:` ou commençant par `/` sont
suivies. Le web et le bureau savent le faire ; le mobile et le site statique
refusent encore un lien externe.

`{saut de ligne}` écrit un retour à la ligne dans un texte, et `%0A` dans une
adresse : `texte "Bonjour{saut de ligne}Merci"`.

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

#### Des rôles à toi

`admin` et `connecte` ne suffisent pas à une école ou à une entreprise. Déclare tes
rôles dans le serveur, puis utilise-les partout :

```humalis
serveur "ecole" :
    roles directeur, enseignant et parent
    donnee note :
        nom : texte
    route "notes" :
        seuls directeur et enseignant peuvent lire note
        seul directeur peut modifier note

page "notes" reservee a directeur et enseignant sinon vers "accueil" :
    titre "Notes"
    si utilisateur est directeur :
        texte "Bonjour la direction"

page "accueil" :
    titre "Ecole"
```

- `roles …` nomme les rôles permis. Un rôle mal écrit ailleurs est une erreur de
  compilation, avec le nom à corriger.
- Le serveur vérifie le rôle à chaque requête : un visiteur reçoit 401, un compte
  sans le bon rôle reçoit 403. Masquer un bouton dans la page ne protège rien ;
  c'est la règle de la route qui protège.
- Un `admin` passe toujours.
- `inviter … comme directeur` crée un compte avec ce rôle.
- Le rôle est écrit dans la session : s'il change, il compte à la prochaine connexion, ou
  tout de suite avec `changer role` (plus bas).

#### Séparer les données par groupe ou par compte

`par` sépare les fiches : chaque groupe, ou chaque compte, ne voit que les siennes.
Le nom du groupe est celui de ton métier : `boutique`, `equipe`, `agence`…

```humalis
serveur "commerce" :
    roles gerant et vendeur
    donnee commande par boutique :
        total : nombre
    donnee note par compte :
        texte : texte
    route "commandes" :
        seuls gerant et vendeur peuvent lire commande
        seul gerant peut modifier commande
    route "notes" :
        connecte peut lire note
        connecte peut creer note
```

- Une fiche créée prend le groupe de la personne ; on ne peut pas le choisir en l'envoyant.
- La fiche d'un autre groupe répond « introuvable » (404), comme si elle n'existait pas.
- Un `admin` voit tous les groupes, et précise le groupe quand il crée une fiche.
- `inviter champ "Adresse" comme vendeur dans boutique b` place un nouveau compte dans
  un groupe. Un membre qui invite y fait entrer la personne dans son propre groupe.
  `seul gerant peut creer comptes` dit qui peut inviter.
- Une page `en direct` n'est prévenue que des changements de son groupe.

#### Un droit sur certaines fiches seulement

`si` limite une règle aux fiches concernées :

```humalis
serveur "commerce" :
    roles gerant et client
    donnee facture :
        montant : nombre
        clients : liste de texte
    route "factures" :
        seul gerant peut lire facture
        client peut lire facture si utilisateur.id est dans facture.clients
        seul gerant peut modifier facture
```

Chaque côté est un champ de la fiche, un champ de `utilisateur` (`id`, `email`, `role`,
un groupe) ou une valeur. On écrit `est` ou `est dans`.

#### Seul l'auteur d'une fiche

`seul son auteur peut …` laisse chacun agir sur ce qu'il a créé, et sur rien
d'autre :

```humalis
serveur "carnet" :
    donnee note :
        texte : texte
    route "notes" :
        connecte peut lire note
        connecte peut creer note
        seul son auteur peut modifier et supprimer note
```

Le serveur remplit lui-même le champ `auteur` de chaque fiche, avec le compte qui
la crée. Personne ne peut le choisir à l'envoi, ni le changer ensuite.

Cette règle dit déjà quelles fiches sont concernées : elle ne prend pas de `si`.

#### Des fiches au premier démarrage

`donnees de depart pour …` écrit des fiches au premier démarrage du serveur, une
par ligne. Chaque champ s'écrit avec sa valeur, séparé du suivant par une
virgule.

```humalis
serveur "ecole" :
    donnee matiere :
        nom : texte
        coefficient : nombre
        optionnelle : booleen au depart faux
    route "matieres" :
        tout le monde peut lire matiere
        seul admin peut modifier matiere
    donnees de depart pour matiere :
        nom "Mathématiques", coefficient 4
        nom "Histoire", coefficient 3
        nom "Musique", coefficient 1, optionnelle vrai
```

Les fiches ne sont écrites que si la table est vide : un redémarrage n'ajoute
rien. Chaque champ demandé à la création doit avoir une valeur du bon type ; un
champ avec `au depart` peut s'omettre.

#### Un champ qui change de nom

Une application vit : un champ peut changer de nom, un autre peut arriver.
`(avant "tel")`, après le type, donne l'ancien nom du champ.

```humalis
serveur "carnet" :
    donnee contact :
        nom : texte
        telephone : texte (avant "tel")
        favori : booleen au depart faux
    route "contacts" :
        connecte peut lire contact
        connecte peut creer contact
```

Au démarrage, les fiches déjà écrites gardent leur valeur sous le nouveau nom.
Un champ ajouté avec `au depart` donne aussi sa valeur aux anciennes fiches.

#### Des champs sur les comptes, et l'équipe

```humalis
serveur "commerce" :
    roles gerant et vendeur
    invitations vers "bienvenue"
    emails par brevo
    compte :
        telephone : texte
    donnee commande par boutique :
        total : nombre
    route "commandes" :
        seuls gerant et vendeur peuvent lire commande
        seul gerant peut modifier commande
    route "equipe" :
        seul gerant peut lire comptes
        seul gerant peut creer comptes
        seul gerant peut modifier comptes
        seul gerant peut supprimer comptes

page "bienvenue" :
    titre "Bienvenue"
```

`inviter champ "Adresse" comme vendeur avec telephone = champ "Tél"` remplit un champ à
l'invitation, et `changer compte de c avec telephone = champ "Tél"` le modifie ensuite. Seuls les
champs déclarés sont acceptés. Un gérant ne voit et ne touche que les comptes de son groupe,
jamais un admin. `utilisateur.telephone` se lit dans une règle avec `si`.

#### Lire son propre compte

`connecte peut lire son compte` donne à la personne connectée ses propres champs, jamais ceux des
autres. La réponse est une liste d'une seule fiche :

```humalis
serveur "equipe" :
    compte :
        nom : texte
        postes : liste de texte
    route "moi" :
        connecte peut lire son compte

page "accueil" reservee a connecte sinon vers "connexion" :
    variable profil = []
    calcul moi = premier de profil
    quand la page se charge :
        envoyer requete vers "moi" dans profil
    titre "Bonjour {moi.nom}"
    si moi.postes contient "direction" :
        lien "Équipe" vers "equipe"

page "equipe" :
    titre "Équipe"

page "connexion" :
    titre "Connexion"
```

Une condition dans la page ne protège rien : c'est la règle de la route qui protège.

#### Changer le rôle d'un compte

`changer role de c en "vendeur"`, après un geste dans une page, compte tout de suite :
dès que cette phrase existe dans le programme, le serveur relit le compte à chaque
requête. Seul un admin peut le faire, et jamais sur son propre compte.

#### Une action écrite sur le serveur

Une action fait tout ou rien : `refuser` arrête, annule ce qui a déjà été écrit et
montre son message à la personne.

```humalis
serveur "commerce" :
    roles gerant
    donnee commande :
        total : nombre
        statut : texte au depart "ouverte"
    route "commandes" :
        seul gerant peut lire commande
        seul gerant peut modifier commande
        seul gerant peut faire "rembourser" sur commande :
            si commande.statut est egal a "remboursee" :
                refuser "Déjà remboursée"
            changer commande.statut par "remboursee"

page "commandes" reservee a gerant sinon vers "accueil" :
    variable commandes = []
    titre "Commandes"
    quand la page se charge :
        envoyer requete vers "commandes" dans commandes
    pour chaque c dans commandes :
        bouton "Rembourser"
        quand l'utilisateur clique sur "Rembourser" :
            faire "rembourser" sur c

page "accueil" :
    titre "Accueil"
```

Dans une action, on écrit `si`, `pour chaque c dans commande ou statut est "ouverte" :`,
`calcul recette = somme de commande.total ou statut est "payee"`,
`changer c.statut par …`, `creer … avec …`, `supprimer c`, `refuser "…"`, `envoyer email …`
et `envoyer notification …`. Les e-mails et notifications partent seulement si tout a réussi.

Une action peut recevoir des valeurs, vérifiées par le serveur :

```humalis
serveur "commerce" :
    roles gerant
    donnee commande :
        total : nombre
    route "commandes" :
        seul gerant peut lire commande
        seul gerant peut modifier commande
        seul gerant peut faire "reduire" sur commande avec montant : nombre et raison : texte :
            si montant est superieur a commande.total :
                refuser "Montant trop élevé"
            changer commande.total par commande.total - montant

page "commandes" reservee a gerant sinon vers "accueil" :
    variable commandes = []
    titre "Commandes"
    quand la page se charge :
        envoyer requete vers "commandes" dans commandes
    pour chaque c dans commandes :
        bouton "Réduire"
        quand l'utilisateur clique sur "Réduire" :
            faire "reduire" sur c avec montant = 5 et raison = "geste"

page "accueil" :
    titre "Accueil"
```

Après `ou`, plusieurs conditions se suivent avec `et` : `statut est "ouverte" et total est
superieur a 100`. On écrit `est`, `est superieur a`, `est inferieur a` ou `est different de`.
Un calcul est une `somme`, une `moyenne`, un `minimum`, un `maximum` ou un `nombre`.

#### Un résumé pour une page

```humalis
serveur "commerce" :
    roles gerant
    donnee commande :
        total : nombre
        statut : texte
    route "commandes" :
        seul gerant peut lire commande
        seul gerant peut modifier commande
        seul gerant peut lire "resume" de commande ou statut est "payee" :
            calcul recette = somme de total
            calcul combien = nombre de commande
            regroupe par statut
```

La page le lit comme une route : `envoyer requete vers "commandes/resume" dans resume`.
Sans `regroupe par`, on obtient une seule fiche (`resume.recette`) ; avec, une ligne par valeur.
Si la donnée est séparée par groupe, un gérant ne compte que le sien. Le serveur lit les lignes
une à une pour calculer : sur de très grosses tables, ce sera à mesurer.

#### Une tâche planifiée

```humalis
serveur "commerce" :
    donnee commande :
        statut : texte
    route "commandes" :
        seul admin peut lire commande
        seul admin peut modifier commande
    tous les jours a 7 h :
        pour chaque c dans commande ou statut est "brouillon" :
            supprimer c
```

On écrit aussi `toutes les heures :` et `chaque lundi a 8 h 30 :`. Même avec plusieurs
serveurs, une seule exécution a lieu. L'heure est celle du serveur (variable `TZ`). Un serveur
arrêté au moment prévu rattrape la tâche dans l'heure qui suit, pas au-delà.

#### Un document PDF

```humalis
serveur "commerce" :
    document "recu" de commande :
        titre "Reçu"
        texte "Total : {commande.total} euros"
    donnee commande :
        total : nombre
    route "commandes" :
        seul admin peut lire commande
        seul admin peut modifier commande
```

`telecharger document "recu" de c` le télécharge depuis une page, avec les droits de la
lecture de cette donnée. Dans un document, `tableau de ligne ou commande est commande.id avec
colonnes produit, quantite et prix` montre les fiches d'une autre donnée.

#### Les notifications

`envoyer notification aux gerant avec titre "Nouveau" et texte "{commande.total}"` s'écrit
dans une action, une tâche ou `quand commande est cree :`. On peut aussi viser le compte
écrit dans une fiche : `envoyer notification a commande.compte avec …`. Si la fiche est
séparée par groupe, seuls les comptes de ce groupe la reçoivent.

Dans une page, après un geste : `activer notifications`. Il faut les variables
`HUMALIS_VAPID_PUBLIQUE`, `HUMALIS_VAPID_PRIVEE` et `HUMALIS_VAPID_SUJET` pour le web,
et `HUMALIS_APNS_CLE`, `HUMALIS_APNS_CLE_ID`, `HUMALIS_APNS_EQUIPE` et
`HUMALIS_APNS_SUJET` pour Apple (`HUMALIS_APNS_HOTE` pour le bac à sable).

#### Les fonctions de l'appareil

Sur la cible Apple, une page peut se servir de l'appareil. Ces phrases s'écrivent dans
un événement, sauf `signature`, qui est un élément de la page :

```humalis
page "accueil" :
    titre "Livraison"
    variable cliche = rien
    variable code = ""
    variable trace = ""
    signature dans trace
    bouton "Prendre une photo"
    quand l'utilisateur clique sur "Prendre une photo" :
        photo dans cliche
    bouton "Scanner"
    quand l'utilisateur clique sur "Scanner" :
        scanner code dans code
        vibrer
    bouton "Valider"
    quand l'utilisateur clique sur "Valider" :
        verifier identite :
            afficher "Confirmé"
        sinon :
            afficher "Non reconnu"
```

`photo` donne un fichier, comme `fichier … dans`. `scanner code` lit un code QR ou un
code-barres. `signature` donne une image en texte. `verifier identite` passe par Face ID,
Touch ID ou le code de l'appareil. Une variable `avec hors ligne` garde la dernière
réponse du serveur et la montre quand il n'y a pas de réseau :
`variable produits = [] avec hors ligne`.

`position dans lieu` demande la permission puis remplit `lieu` (déclarée `= rien`) avec
`lieu.latitude`, `lieu.longitude` et `lieu.precision`, en mètres.

`liens profonds "magasin"`, en haut du fichier, fait ouvrir l'application par les adresses
`magasin://produit/42` : le premier mot est la page, les suivants sont ses paramètres. Une
page réservée reste réservée. Avec `liens profonds "magasin" et domaine "exemple.fr/essai"`,
les adresses `https://exemple.fr/essai/produit/42` ouvrent aussi l'application. Il faut compiler
avec `--equipe` et publier sur le site le fichier écrit dans `a-publier-sur-le-site/`.

`en arriere plan :`, directement dans une page, dit ce que l'application fait quand le
système la réveille. Le système choisit le moment : jamais avant 15 minutes, souvent bien
plus tard. Ce bloc ne voit que les variables `avec partagee`, puisqu'aucune page n'est
ouverte. Sur Mac, l'application doit être ouverte.

`hors ligne`, à la fin d'un `envoyer requete … avec …`, d'un `modifier` ou d'un `supprimer`,
garde l'envoi sur l'appareil s'il n'y a pas de réseau, et l'envoie dans l'ordre quand la
connexion revient. Un refus du serveur est affiché. Chaque envoi appartient au compte qui
l'a fait : à la déconnexion il est mis de côté, et repart seulement si la même personne se
reconnecte. Au bout de 30 jours il est effacé, et la personne en est prévenue à sa prochaine
connexion.
Cette fin de phrase ne marche pas avec `dans` (la réponse arrivera plus tard) ni vers une
API externe. Pour que la page se mette à jour ensuite, lis la route `en direct`.

**Sur le web**, ces phrases marchent aussi, avec les API du navigateur, sur le moteur comme avec
React. `photo` ouvre l'appareil photo sur un téléphone et le choix d'un fichier sur un ordinateur.
`scanner code` demande un navigateur qui sait lire les codes (Chrome sur Android ou sur Mac, par
exemple) ; sinon la personne le lit. `verifier identite` passe par Touch ID, Face ID ou Windows
Hello : cela reste sur l'appareil et ne protège pas le serveur, seules les règles du serveur le
font. `vibrer` n'a d'effet que sur Android, et le compilateur le dit. Une page déjà ouverte
continue sans réseau, mais le web ne rouvre pas une page entière sans réseau. `liens profonds` n'y
change rien, chaque page ayant déjà son adresse. `en arriere plan :` et `memorisee en secret`
n'existent pas sur le web : le compilateur refuse, plutôt que de faire semblant.

Pour se servir d'une bibliothèque Swift dans une vue écrite à la main, écris en haut du
fichier `paquet swift "https://github.com/exemple/paquet" version "1.2"`. Si le produit
ne porte pas le nom du dépôt, ajoute `produit "Nom"`.

Ailleurs que sur Apple, le compilateur dit que ces phrases ne sont pas encore disponibles.

#### Interroger une IA

```humalis
serveur "commerce" :
    ia par anthropic
    connecte peut demander a ia

page "aide" :
    variable reponse = ""
    titre "Aide"
    texte reponse
    bouton "Demander"
    quand l'utilisateur clique sur "Demander" :
        demander a ia "Donne une idée de slogan" dans reponse
```

La réponse s'affiche au fil de l'eau. La clé `ANTHROPIC_API_KEY` reste sur le serveur.
Chaque compte a un plafond, commun à tous les serveurs : 30 questions par heure,
`HUMALIS_IA_PAR_HEURE` le change. `HUMALIS_IA_MODELE` choisit le modèle
(`claude-opus-5-5` par défaut).

#### Encaisser un paiement

```humalis
serveur "commerce" :
    paiements par stripe
    donnee reservation :
        nom : texte
        total : nombre
    donnee journal :
        nom : texte
    route "reservations" :
        connecte peut lire reservation
        connecte peut creer reservation
        seul admin peut modifier reservation
        quand reservation est payee :
            creer journal avec nom reservation.nom
    route "journaux" :
        seul admin peut lire journal
        seul admin peut modifier journal
```

`payer total pour r`, dans une page, ouvre la page de paiement de Stripe. Le montant est
relu par le serveur, jamais envoyé par la page. La fiche reçoit un champ `paye`, écrit
seulement quand Stripe le confirme par un webhook signé : envoie-le vers
`/paiements/webhook`. Il faut `STRIPE_CLE_SECRETE`, `STRIPE_SECRET_WEBHOOK` et
`HUMALIS_ADRESSE_SITE`.

#### Renvoyer sans créer de doublon

Si la connexion coupe en plein envoi, un programme peut recommencer sans risque : il envoie
l'en-tête `X-Humalis-Envoi` avec un identifiant au hasard, le même à chaque essai. Le serveur
fait le travail une fois, même avec plusieurs exemplaires, puis redonne la même réponse.
Il répond 409 tant que le premier essai tourne. L'identifiant est gardé 30 jours, aussi longtemps qu'un envoi peut attendre sur l'appareil.

#### Beaucoup de monde derrière une même adresse

Par défaut, une adresse a droit à 300 requêtes par 15 minutes et 10 tentatives de connexion.
Un établissement entier peut sortir par une seule adresse : monte alors
`HUMALIS_LIMITE_API` et `HUMALIS_LIMITE_CONNEXION`. Derrière un relais, règle aussi
`HUMALIS_RELAIS`.

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

### Ce que le serveur décide

Une règle `tout le monde peut creer commande` accepte chaque champ déclaré, tel que
la requête l'envoie : quelqu'un peut donc écrire un statut ou un total de son choix.
Ces règles, après le type d'un champ, donnent la décision au serveur.

```humalis
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    donnee zone :
        commune : texte
        prix : nombre
    donnee suivi :
        etape : texte
        total : nombre
    donnee commande :
        nom : texte
        refs : liste de texte
        photos : liste de texte du site
        quantite : nombre calcule nombre de refs
        commune : texte
        livraison : nombre au plus prix de zone par commune
        total : nombre calcule somme prix de produit par refs plus livraison
        suivi : texte
        statut : texte au depart "en_attente"
        jour : date au depart aujourd'hui
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
    route "zones" :
        tout le monde peut lire zone
        seul admin peut modifier zone
    route "suivis" :
        tout le monde peut lire suivi par identifiant
        seul admin peut lire suivi
        seul admin peut modifier suivi
    route "commandes" :
        tout le monde peut creer commande
        seul admin peut lire commande
        seul admin peut modifier commande
        quand commande est cree :
            creer suivi avec etape "en_attente" et total commande.total dans commande.suivi
```

- `au depart "…"` : le serveur met cette valeur à la création. Elle peut être un
  texte, un nombre, `vrai`, `faux` ou `aujourd'hui`.
- `calcule nombre de refs` compte la liste. `calcule somme prix de produit par refs
  plus livraison` relit le prix de chaque identifiant de la liste, l'additionne, puis
  ajoute un autre champ. Un identifiant inconnu est refusé.
- `au plus prix de zone par commune` refuse une valeur plus grande que le prix de la
  zone de cette commune, ou négative. Sans zone, seul 0 passe.
- `non vide` refuse une liste vide, ou un texte vide ou fait d'espaces :
  `refs : liste de texte non vide`. Il se combine avec une autre règle.
- `du site` n'accepte qu'un chemin de ce site (`/images/photo.jpg`), l'adresse de
  `HUMALIS_ADRESSE_SITE` ou une image choisie dans la page. Il vaut aussi à la
  modification.
- `creer suivi avec … dans commande.suivi` crée une fiche liée avec les valeurs déjà
  vérifiées, et garde son identifiant dans la fiche créée. La réponse le donne à la
  page : `envoyer requete vers "commandes" avec … dans commande`, puis `commande.suivi`.
- `par identifiant` ouvre une fiche à la fois, sans donner la liste, et cette lecture
  n'est jamais gardée en cache. La liste suit sa propre règle. La page écrit
  `envoyer requete vers "suivis" avec id m.id dans fiche`, ou `avec id` seul dans une
  page dont le paramètre s'appelle `id`.

Un champ décidé par le serveur est refusé à l'envoi (400), et Humalis le signale à la
compilation si une page l'envoie. Une personne qui a le droit de modifier peut le
changer ensuite avec `modifier c dans "commandes" avec statut = "confirmee"` ; un
total modifié ainsi garde la valeur écrite, sans nouveau calcul. Les calculs restent simples : une règle comme « livraison offerte
dès 50 $ » reste décidée par la page, donc un client qui trafique sa requête peut
payer moins que prévu sur ce champ, jamais plus que le plafond.

Derrière un relais sur la même machine, écris `HUMALIS_ECOUTE=127.0.0.1` dans
l'environnement : le serveur n'est plus joignable que par lui.

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
- `avec commentaire = texte_saisi` envoie une valeur sous le nom d'un champ de la
  donnée, quand la variable s'appelle autrement.
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


### Se connecter avec Apple

Avec la ligne `connexion apple` dans le serveur, un compte **déjà connu** du serveur peut se
connecter avec son compte Apple : `se connecter avec apple` ouvre la fenêtre d'Apple, sur
iPhone, iPad, Mac et sur le site. La première connexion lie le compte à ce compte Apple. Si la
personne choisit de masquer son adresse, elle n'est pas reconnue et un message le lui dit. Il
faut `APPLE_APP_ID` pour l'application, `APPLE_SERVICE_ID` pour le site, et compiler
l'application avec `--equipe`.

### Se connecter avec Google

Avec la ligne `connexion google` dans le serveur, un compte **déjà connu** du
serveur peut se connecter avec Google : la fenêtre de Google s'ouvre, et si
Google confirme une adresse qui correspond à un compte, la session s'ouvre,
sans mot de passe. Une adresse inconnue est refusée : personne ne se crée un
accès tout seul. La première connexion lie le compte à ce compte Google ; un
autre compte Google qui porterait la même adresse est ensuite refusé.

```humalis
serveur "boutique" :
    connexion google
    donnee commande :
        nom : texte
    route "commandes" :
        seul admin peut lire commande

page "connexion" :
    titre "Connexion"
    bouton "Continuer avec Google"
    quand l'utilisateur clique sur "Continuer avec Google" :
        essayer :
            se connecter avec google
            rediriger vers "connexion"
        si erreur :
            afficher erreur "Connexion refusée : {raison}"
```

Il faut un ID client OAuth de Google (type « application Web »), dans la
variable `GOOGLE_CLIENT_ID` du serveur, avec l'adresse de redirection
`https://ton-site/auth-google.html`. Cible web et bureau seulement, pour l'instant.

### Inviter des personnes et retrouver un mot de passe

Le premier compte vient de l'environnement. Les suivants arrivent sur invitation :
un admin donne une adresse, la personne reçoit un lien, puis choisit son mot de
passe. Avec `connexion google`, elle peut aussi entrer avec Google, puisque son
compte est maintenant connu.

```humalis
serveur "boutique" :
    connexion google
    emails par brevo
    invitations vers "bienvenue"
    mot de passe oublie vers "bienvenue"
    route "equipe" :
        seul admin peut lire comptes
        seul admin peut supprimer comptes

page "accueil" :
    titre "Connexion"

page "equipe" reservee a admin sinon vers "accueil" :
    titre "L'équipe"
    variable membres = []
    quand la page se charge :
        envoyer requete vers "equipe" dans membres
    formulaire "invitation" :
        champ email "Adresse" avec obligatoire
        bouton "Inviter"
    quand le formulaire "invitation" est soumis :
        essayer :
            inviter champ "Adresse" comme admin
            afficher reussite "Invitation envoyée"
            envoyer requete vers "equipe" dans membres
        si erreur :
            afficher erreur "{raison}"
    pour chaque m dans membres :
        ligne :
            texte "{m.email} ({m.role}, {m.statut})"
            bouton "Retirer"
            quand l'utilisateur clique sur "Retirer" :
                supprimer m de "equipe"
                envoyer requete vers "equipe" dans membres

page "oublie" :
    titre "Mot de passe oublié"
    formulaire "demande" :
        champ email "Email" avec obligatoire
        bouton "Recevoir un lien"
    quand le formulaire "demande" est soumis :
        demander un lien de mot de passe pour champ "Email"
        afficher reussite "Si ce compte existe, un lien vient de partir."

page "bienvenue" :
    titre "Choisis ton mot de passe"
    formulaire "choix" :
        champ mot de passe "Mot de passe" avec obligatoire
        bouton "Enregistrer"
    quand le formulaire "choix" est soumis :
        essayer :
            choisir le mot de passe avec champ "Mot de passe"
            rediriger vers "accueil"
        si erreur :
            afficher erreur "{raison}"
```

- `inviter … comme admin` crée un administrateur ; sans `comme`, c'est un simple
  compte connecté. Seul un admin peut inviter, et le serveur le vérifie.
- Le lien ne sert qu'une fois. Il vaut 7 jours pour une invitation, une heure pour
  un mot de passe oublié. Le serveur garde seulement son empreinte.
- `demander un lien…` répond pareil que l'adresse ait un compte ou non, et une même
  adresse ne reçoit qu'un lien toutes les dix minutes. Inviter une adresse qui a
  déjà un compte ne change rien à ce compte.
- `comptes` est une donnée déjà prête, avec `email`, `role` (`admin` ou `membre`) et
  `statut` (`invite` ou `actif`). Seul un admin peut la lire ou en supprimer une
  fiche. Supprimer annule une invitation ou retire un membre : il n'a plus de
  mot de passe, plus de lien, et sa session est coupée. On ne peut pas se retirer
  soi-même. Une nouvelle invitation peut le faire revenir.

Il faut, dans l'environnement du serveur ou son coffre de clés, `BREVO_API_KEY` et
`BREVO_EXPEDITEUR` (une adresse d'un domaine vérifié chez Brevo), et, dans
l'environnement, `HUMALIS_ADRESSE_SITE` (`https://ma-boutique.com`) pour écrire
les liens. Sans elles, `inviter` affiche une erreur qui le dit. Cible web et
bureau ; l'application mobile affiche un message qui renvoie vers le site, et le
site statique refuse ces phrases.

### Envoyer un e-mail depuis le serveur

Sous une route, `quand … est cree :` fait partir des e-mails quand une fiche vient
d'être enregistrée.

```humalis
serveur "boutique" :
    emails par brevo
    donnee message :
        nom : texte
        texte : texte
    route "messages" :
        tout le monde peut creer message
        seul admin peut lire message
        seul admin peut supprimer message
        quand message est cree :
            envoyer email aux admins avec sujet "Nouveau message de {message.nom}" et texte "{message.texte}"
```

Le destinataire s'écrit `aux admins`, avec une adresse (`a "contact@exemple.com"`) ou
avec un champ de la fiche (`a commande.email`). Le texte montre les champs de la
fiche créée. Un envoi raté ne fait pas échouer la création. Humalis prévient si
tout le monde peut créer la fiche et choisir ainsi l'adresse d'arrivée : ton
domaine servirait à envoyer du spam. Le serveur envoie au plus 100 e-mails par
heure ; `HUMALIS_EMAILS_PAR_HEURE` change cette limite.

### Une page de profil : mot de passe et photo

Une personne connectée change son mot de passe avec
`changer le mot de passe avec … et …` : d'abord le mot de passe actuel, puis le
nouveau. Le serveur vérifie l'actuel et refuse un nouveau trop faible (au moins
8 caractères, avec une majuscule, une minuscule, un chiffre et un signe). La
session reste ouverte.

Un champ `image` dans une donnée du serveur garde une photo choisie dans la
page (`fichier … accepte images`). La page la réduit (480 px de côté, en JPEG)
avant de l'envoyer ; le serveur vérifie que c'est bien une image. Elle
s'affiche ensuite comme une adresse : `image p.photo`.

```humalis
serveur "club" :
    donnee profil :
        nom : texte
        photo : image
    route "profils" :
        tout le monde peut lire profil
        seul admin peut creer profil
        seul admin peut modifier profil

page "profil" :
    titre "Mon profil"
    variable photo = rien
    variable nom = "Camille"
    fichier "Choisir une photo" dans photo accepte images avec maximum 5 Mo
    bouton "Enregistrer la photo"
    quand l'utilisateur clique sur "Enregistrer la photo" :
        envoyer requete vers "profils" avec nom et photo
    formulaire "secret" :
        champ mot de passe "Mot de passe actuel" avec obligatoire
        champ mot de passe "Nouveau mot de passe" avec obligatoire
        bouton "Changer le mot de passe"
    quand le formulaire "secret" est soumis :
        essayer :
            changer le mot de passe avec champ "Mot de passe actuel" et champ "Nouveau mot de passe"
            afficher reussite "Mot de passe changé"
        si erreur :
            afficher erreur "{raison}"
```

Les deux existent pour le web, le bureau et le mobile. Sur le téléphone, la
photo vient de la galerie, avec la même réduction ; une image transparente y
perd sa transparence (le JPEG n'en a pas).

### Télécharger une liste en CSV

Dans un événement, `telecharger commandes en csv` enregistre la liste dans un
fichier `commandes.csv`, lisible par Excel en français. Sur un téléphone, le
texte passe par la feuille de partage.

### Télécharger le bon d'une fiche

`telecharger bon de commande de c` télécharge le PDF d'une fiche du serveur,
sans ouvrir de page. Cela marche pour toute donnée lue sur une route :
`telecharger bon de reservation de r`, par exemple.

```humalis
serveur "Maison Awa" :
    donnee commande :
        nom : texte
        articles : liste de texte
        total : nombre
        jour : date
    route "commandes" :
        tout le monde peut creer commande
        seul admin peut lire commande
        seul admin peut modifier commande

page "connexion" a l'adresse "/connexion" :
    titre "Connexion"

page "commandes" a l'adresse "/" reservee a admin sinon vers "connexion" :
    titre "Commandes"
    variable commandes = []
    quand la page se charge :
        envoyer requete vers "commandes" dans commandes
    pour chaque c dans commandes :
        texte c.nom
        bouton "Bon de commande" avec icone "document" et nom "bon"
        quand l'utilisateur clique sur "bon" :
            essayer :
                telecharger bon de commande de c
            si erreur :
                afficher erreur "Bon non téléchargé : {raison}"
```

Le serveur ajoute alors `GET /api/commandes/:id/bon`, seulement si une page s'en
sert, avec les mêmes droits que la lecture de la route. Le document porte le nom
du serveur (écrit tel quel : donnez-lui le nom de la boutique), le titre « Bon de
commande » et tous les champs en clair, sauf ceux de type `image`. Une fiche qui
n'existe plus répond 404, et la raison arrive à `si erreur`.

Cible web et bureau. Sur le téléphone, un message dit que ce n'est pas encore
disponible ; le site statique refuse la phrase. Le serveur à compiler est celui
du fichier qui contient cette page : c'est elle qui demande la route.

### Une carte de fidélité

Dans le serveur, `fidelite par telephone de commande :` calcule une carte à
tampons à partir des fiches, sans rien stocker. Ses deux lignes sont obligatoires :

```humalis
serveur "Maison Awa" :
    donnee commande :
        nom : texte
        telephone : texte
        statut : texte
    route "commandes" :
        tout le monde peut creer commande
        seul admin peut lire commande
        seul admin peut modifier commande
    fidelite par telephone de commande :
        1 tampon par commande livree
        apres 5 tampons, recompense "Un maillot offert"

page "connexion" a l'adresse "/connexion" :
    titre "Connexion"

page "commandes" a l'adresse "/" reservee a admin sinon vers "connexion" :
    titre "Commandes"
    variable commandes = []
    variable carte = rien
    quand la page se charge :
        envoyer requete vers "commandes" dans commandes
    pour chaque c dans commandes :
        texte c.nom
        bouton "Fidélité" avec icone "recompense" et nom "fidelite"
        quand l'utilisateur clique sur "fidelite" :
            envoyer requete vers "fidelite" avec id c.telephone dans carte
    si carte n'est pas rien :
        texte "{carte.tampons} sur {carte.objectif} tampons"
        si carte.recompenses est superieur a 0 :
            texte "Récompense gagnée : {carte.recompense}"
```

`1 tampon par commande livree` compte les fiches dont le champ `statut` vaut
exactement `livree`. La réponse a les champs `tampons`, `objectif`, `restant`,
`recompenses` et `recompense`, connus de la compilation. Les espaces, les tirets
et le « + » du numéro sont ignorés : « +33 6 12 » et « 33612 » comptent ensemble.

**Seul un admin peut lire une carte** (`GET /api/fidelite/…`), car la valeur est un
numéro de téléphone, et personne ne peut y écrire. Aucune durée ne s'applique : un
tampon ne se perd pas. Les récompenses données ne sont pas enregistrées :
`recompenses` compte celles qui ont été gagnées depuis le début, et `tampons`
repart de zéro à chaque récompense gagnée.

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

### Une API qui demande une clé secrète

Une clé secrète ne doit jamais arriver dans le navigateur. On écrit seulement le
nom de la variable d'environnement qui la porte :

```humalis
serveur "agenda" :
    donnee rappel :
        texte : texte
    route "rappels" :
        connecte peut lire rappel

source "meteo" :
    adresse "https://api.meteo.example"
    jeton secret depuis l'environnement "METEO_CLE" dans le parametre "key"
    donnee prevision :
        jour : texte
        temperature : nombre
    route "previsions" :
        tout le monde peut lire une liste de prevision dans "jours"

page "accueil" :
    variable previsions = []
    titre "Météo de la semaine"
    quand la page se charge :
        envoyer requete vers "previsions" de la source "meteo" dans previsions
    pour chaque p dans previsions :
        texte "{p.jour} : {p.temperature} °C"
```

Les pages passent alors par la passerelle du serveur Humalis
(`/api/passerelle/meteo`). Le serveur vérifie qui appelle, ajoute la clé, puis
appelle l'API.

- Le projet a besoin d'un bloc `serveur` : c'est lui qui fait l'appel.
- Chaque route de la source dit qui peut l'appeler : `tout le monde peut …`,
  `connecte peut …` ou `seul admin peut …`. Une action sans règle est refusée.
- La clé voyage dans l'en-tête `Authorization` par défaut. `dans le parametre
  "key"` la met dans l'adresse ; `dans l'entete "X-Cle"` dans un autre en-tête.
- La valeur se met dans le fichier `.env` du serveur. Son nom est ajouté à
  `.env.exemple`.

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

`avec icone "photo"` montre une icône seule sur le bouton ; le libellé reste
lu par les lecteurs d'écran et s'affiche au survol.

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

On lit un graphique au doigt ou à la souris : toucher un point, une barre ou
une part montre son étiquette et sa valeur, et glisser le doigt fait suivre la
bulle. Au clavier, les flèches passent d'une valeur à l'autre. Avec beaucoup
de valeurs, le graphique défile au doigt et montre d'abord les dernières.

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

- Les langues tiennent aussi sur une ligne, séparées par des virgules :
  `langues : francais, anglais` revient au même que le bloc.
- `en anglais "…"` donne la version d'un texte.
- `sans traduction` garde le même texte dans toutes les langues, pour un nom
  propre : `lien "GitHub" sans traduction vers "https://github.com"`.
- `traductions anglais :` traduit une seule fois un texte répété.
- `selecteur de langue` affiche le choix de la langue ; `changer langue par
  anglais` et `si langue est anglais :` s'utilisent dans les événements.
- Le message de `copier` se traduit comme les autres textes :
  `copier code avec message "Copié" en anglais "Copied"`.
- Humalis signale à la compilation tout texte qui n'a pas sa traduction. Les
  messages de Humalis (champ obligatoire, chargement…) suivent la langue.

### Les langues disponibles

Six langues sont disponibles : `francais`, `anglais`, `espagnol`, `portugais`,
`swahili` et `lingala`. La version d'un texte s'écrit avec le nom de la langue :
`en espagnol "…"`, `en portugais "…"`.

```humalis
langues : francais, espagnol, portugais

page "accueil" :
    selecteur de langue
    titre "Bienvenue" en espagnol "Bienvenido" en portugais "Bem-vindo"
    bouton "Réserver" en espagnol "Reservar" en portugais "Reservar"
```

Dans chaque langue, les messages de Humalis sont traduits, et les nombres, les
dates, les montants et les pluriels suivent ses règles. `en date longue`, `en
lettres`, `avec majuscule` et `initiales de` aussi. En lingala, `en lettres`
garde les chiffres.

### Une adresse par langue

`avec adresse par langue`, à la fin de la ligne des langues, donne à chaque
langue sa propre adresse. La première langue garde les adresses simples
(`/menu`) ; les autres ont leur préfixe (`/en/menu`).

```humalis
langues : francais, anglais avec adresse par langue

page "accueil" :
    titre "Bienvenue" en anglais "Welcome"
    lien "La carte" en anglais "The menu" vers "carte"

page "carte" :
    titre "La carte" en anglais "The menu"
```

Chaque page est alors écrite d'avance dans chaque langue, avec les liens qui
relient ses versions pour les moteurs de recherche. La page arrive déjà dans sa
langue, sans attendre un script. Cela marche sur le site web, avec le moteur de
Humalis comme avec React.

Cette option s'écrit seulement sur la forme en une ligne : `langues : francais,
anglais avec adresse par langue`.

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
`robots.txt`. Une page en `indexation non` n'y apparaît pas. `robots.txt` dit aussi
aux IA que le site peut apparaître dans leurs recherches et servir de source à leurs
réponses (`Content-Signal: search=yes, ai-input=yes`). Humalis prévient
quand un titre ou une description est trop long ou trop court pour les moteurs
de recherche.

Sur le desktop, la même `adresse` sert aux mises à jour automatiques :
l'application installée cherche une nouvelle version dans le dossier
`mises-a-jour/` de cette adresse. `npm run paquet` y prépare tout (l'installateur
`.dmg` pour Mac, `.exe` pour Windows, et les fichiers `latest*.yml`) : tu déposes
ces fichiers dans ce dossier. Sans `adresse`, l'application ne cherche pas de mise
à jour. Sur Mac, la mise à jour automatique demande une application signée.

La ligne `erreurs pendant 5 secondes` du bloc `site :` règle combien de temps
restent les erreurs du site, celles que tu écris sans durée et celles que
Humalis affiche de lui-même. Elle va de 1 à 60 secondes ; sans elle, c'est 8
secondes. Sous 4 secondes, beaucoup de personnes n'ont pas le temps de lire : le choix
est le tien. Un `pendant` écrit sur un message garde la priorité,
et un message avec un bouton garde le temps de cliquer (6 secondes, 12 pour
« Réessayer »).

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

Le fichier peut être en `.tsx`, `.ts`, `.jsx` ou `.js`. Les paquets qu'il
importe (`three`, `gsap`…) sont ajoutés tout seuls au projet produit : il suffit
de lancer `npm install`.

Humalis ne dessine pas de 3D lui-même : écris la scène dans un composant React.

```humalis
utiliser composant "Scene3D" depuis "./composants/Scene3D"

page "accueil" :
    titre "Mon portfolio"
    Scene3D avec couleur "#c1e928"
```

Un composant qui importe `three` ou `@react-three/…` est chargé à part : le texte
de la page s'affiche sans attendre la 3D. Ces paquets ont des versions essayées
ensemble : `three`, `@react-three/fiber`, `@react-three/drei`,
`@react-three/postprocessing`, `postprocessing`, `gsap` et `lenis`. Un autre paquet
est installé dans sa dernière version.

### Un module JavaScript

Pour utiliser une bibliothèque JavaScript sans React (Three.js, GSAP…), écris un
module. Il reçoit l'élément où dessiner et ses propriétés, et rend une fonction
qui nettoie quand on quitte la page (web et desktop) :

```humalis
utiliser module "Scene3D" depuis "./modules/Scene3D"

page "accueil" :
    Scene3D avec couleur "#c1e928"
```

```js
export default function Scene3D(element, proprietes) {
  // dessine dans « element »
  return () => {
    // nettoie
  };
}
```

Le module est chargé à part, et ses paquets sont ajoutés au projet. Quand une
propriété change, il est relancé. S'il sait se mettre à jour lui-même, il rend
`{ mettreAJour(proprietes) { … }, detruire() { … } }`.

### Une vue native écrite à la main

Quand Humalis ne sait pas encore dessiner quelque chose, écris ce morceau dans la
langue de la plateforme : Swift pour iPhone, iPad et Mac, C# pour Windows. Pas de
React, pas de navigateur : chaque application reste native. Une seule ligne donne
la vue de chaque plateforme :

```humalis
utiliser composant "Carte" sur apple "./natif/Carte.swift" et sur windows "./natif/Carte.cs"

page "accueil" :
    Carte avec titre "Café" et prix 3.5
```

Sur Apple, une vue SwiftUI qui porte le nom du composant :

```swift
import SwiftUI

struct Carte: View {
    let titre: String
    let prix: Double
    var body: some View { Text("\(titre) : \(prix) €").font(.title) }
}
```

Sur Windows, une classe WPF du même nom (un `UserControl`, ou tout autre élément) :

```csharp
using System.Windows.Controls;

namespace MesVues;

public class Carte : UserControl
{
    public Carte(string titre, double prix, bool promo = false)
    {
        Content = new TextBlock { Text = $"{titre} : {prix:0.00} €", FontSize = 22 };
    }
}
```

Les propriétés de la page passent par leur nom : `titre` va dans le paramètre `titre`.
Un texte est un `String` (`string` en C#), un nombre un `Double` (`double`, ou `int`),
vrai ou faux un `Bool` (`bool`). Un paramètre C# avec une valeur par défaut peut être
omis dans la page. Sur Windows, la vue est recréée quand une valeur qu'elle reçoit
change. Une propriété inconnue, ou un paramètre oublié, est dit à la compilation.

Une plateforme sans sa vue s'arrête avec la ligne à ajouter : ici, l'application
Android et le site n'ont pas de « Carte ». Pour le site, écris le composant en Humalis
(`composant "Carte" :`), ou un module JavaScript : `utiliser module "Carte" depuis
"./modules/Carte.js"`, suivi des mêmes `sur …`.

Les bibliothèques de ces vues s'ajoutent en haut du fichier : `paquet swift "https://…"
version "1.2"` pour Apple (voir plus haut), `paquet windows "Humanizer.Core" version
"2.14.1"` pour Windows (NuGet), `paquet android "io.coil-kt:coil-compose" version "2.7.0"`
pour Android (Gradle).

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
| `humalis --version` | affiche la version installée (`humalis --aide` : le mode d'emploi) |
| `humalis developper` | lance le site et le recompile à chaque enregistrement |
| `humalis compile <fichier> --cible <cible> --sortie <dossier>` | produit le projet d'une cible |
| `humalis compile <fichier> --cible web --composants <dossier>` | produit des composants React à importer ailleurs |
| `humalis verifier <fichier>` | affiche les erreurs et les avertissements |
| `humalis verifier <fichier> --exigeant` | traite aussi les avertissements comme des erreurs |
| `humalis formater <fichier>` | remet le fichier en forme |
| `humalis tester` | lance les tests `*.test.humalis` |
| `humalis packs` | dit si les packs Astratra ont des mises à jour |

Pour le web et le statique, `--adresse https://…` donne l'adresse finale du
site (plan du site, liens de partage). Pour le desktop, Apple et Windows, `--serveur https://…`
donne l'adresse du serveur que l'application appelle.

`--cible apple` produit un projet Xcode en SwiftUI : une seule application native
pour iPhone, iPad et Mac, sans navigateur embarqué (Xcode 16 ou plus récent ; elle
tourne à partir d'iOS 17 et de macOS 14). Pour la signer, ajoute
`--identifiant com.exemple.application` et `--equipe ABCDE12345`.

`--cible windows` produit un projet .NET en C# et WPF : une application native pour
Windows 10 et 11, sans navigateur embarqué. Elle se construit avec le SDK .NET 10,
sur Windows mais aussi sur macOS ou Linux (`dotnet build`), et se publie en un seul
fichier `.exe` (voir « L'application Windows » au chapitre 33).

Avec `humalis developper`, chaque élément de la page porte son fichier
Humalis et sa ligne : dans l'inspecteur du navigateur, un titre montre par
exemple `data-humalis-source="pages/accueil.humalis:12"` (le chemin part du
fichier principal, la ligne est celle de ce fichier). Tiens la touche Alt
(Option sur Mac) et survole un élément : une petite étiquette affiche ce
même repère près du curseur. `humalis compile` n'ajoute rien de tout cela :
le site publié reste identique.

### Les messages d'erreur

Les messages sont en français, avec la ligne, et proposent souvent la
correction :

```
Erreur, ligne 3 : le texte utilise {totl}, mais la variable « totl » n'est pas déclarée. Peut-être « total » ?
```

Une erreur montre aussi la ligne de code en cause, avec un trait sous le mot fautif.

L'extension VS Code « Humalis » les affiche pendant que tu écris, avec la
coloration, la complétion et le survol des mots.

---

## 33. Ce que chaque cible sait faire

Le même fichier donne toutes les cibles. Quand une construction n'existe pas
sur une cible, le compilateur le dit clairement au lieu de produire quelque
chose de faux.

| | web | statique | mobile | desktop | apple | windows |
|---|---|---|---|---|---|---|
| Pages, éléments, styles, thème | oui | oui | oui | oui | oui | oui |
| Ton propre CSS | oui | oui | non (styles nommés seulement) | oui | en partie (règles d'une classe ; le reste est listé) ; au point près dans une page `dessinee pour`, `@media` et mode sombre compris | en partie (règles d'une classe ; le reste est listé) |
| Requêtes vers un serveur | oui | oui | oui | oui | oui | oui |
| `memorisee` | oui | oui | oui | oui | oui | oui |
| `memorisee en secret` | non | non | oui | oui | oui (Keychain) | oui (chiffré par Windows) |
| `essayer` | oui | non | oui | oui | oui | oui |
| Raccourcis clavier | oui | oui | non | oui | oui | oui |
| Vue native écrite à la main | non | non | non | non | oui (Swift, `sur apple`) | oui (C#, `sur windows`) |
| Composants React (anciens projets) | oui | non | oui (en React Native) | oui | non | non |
| Le moteur sans React (par défaut) | oui | non | non | oui (sauf composant React ou `memorisee en secret`) | non | non |
| Graphiques, cartes, audio, vidéo, fichiers | oui | oui | en partie | oui | oui | oui |
| Plusieurs langues | oui | oui | oui | oui | oui | oui |
| Photo, scanner, Face ID, vibration, signature, hors ligne | oui (vibration : Android) | non | non | non | oui | non |
| `en arriere plan` | non | non | non | non | oui | non |
| Plan du site, aperçu de partage | oui | oui | non | non | non | non |

Le serveur (`--cible serveur`) se produit à part, depuis le bloc `serveur`.

### L'application Windows

```sh
humalis compile boutique.humalis --cible windows --sortie boutique-windows --serveur https://api.monsite.fr
cd boutique-windows
dotnet build
dotnet publish -c Release -r win-x64
```

Le dossier produit est un projet .NET 10 en C# et WPF, lisible, à ne pas modifier à
la main. `dotnet publish` donne un seul fichier `.exe` qui contient .NET : rien à
installer sur le PC (`-r win-arm64` pour un PC à processeur ARM). La construction
marche aussi sur un Mac ou sous Linux ; seul le lancement demande Windows 10 ou 11.

- L'apparence suit Windows 11 (thème Fluent), en clair ou en sombre comme le système ;
  `changer theme par sombre` change ce choix, et il est gardé.
- Une page à la fois, avec un bouton Retour, `Alt+←` et le bouton arrière de la souris.
- Le serveur Humalis est appelé avec la même session que l'application Apple : le jeton
  est gardé chiffré par Windows, lisible seulement par la personne connectée à la
  session Windows. `memorisee` va dans `%LOCALAPPDATA%`.
- Plusieurs langues : le sélecteur, `changer langue`, et les nombres, prix et dates
  écrits à la façon de la langue choisie, qui est gardée sur le PC.
- Graphiques, cartes (tuiles d'OpenStreetMap, ou d'un autre fournisseur avec `tuiles`),
  audio et vidéo avec leur transcription, codes QR, images SVG, choix et envoi de
  fichiers, `sous page`, ancres et onglets de l'application.
- `partager …` copie le texte (et le lien) dans le presse-papiers.
- Les animations et les effets de survol ne se dessinent pas encore ; la compilation
  le dit.
- Ce que Humalis ne sait pas encore faire s'écrit en C# : `utiliser composant "Carte" sur
  windows "./natif/Carte.cs"`, avec ses bibliothèques NuGet (`paquet windows "…" version
  "…"`) ; voir « Une vue native écrite à la main ».
- Pas encore sur Windows : paiement, IA, connexion avec Google ou Apple, invitations,
  notifications. La compilation s'arrête et dit quelle ligne en a besoin.

Sans signature de code, Windows affiche un avertissement (SmartScreen) au premier
lancement : « Informations complémentaires », puis « Exécuter quand même ».

### Le moteur de rendu de Humalis

Le site web est produit sans React, par le moteur de Humalis : c'est le défaut.

```sh
humalis compile site.humalis --cible web --sortie site
```

Chaque page est un fichier HTML déjà écrit par le compilateur, qu'un petit
script reprend sans le reconstruire. Quand une variable change, seul ce qui la
lit change. Pour garder React, écris `--moteur react`, ou une fois pour un projet
dans `humalis.projet.json` : `"moteur": "react"` ; `humalis developper` et
`humalis tester` s'en servent aussi. Un dossier déjà produit avec React le reste, et
un programme qui emploie ce que le moteur ne sait pas encore faire est produit avec
React : la compilation dit pourquoi.

L'application de bureau prend aussi les pages du moteur, une par adresse, sans
React. Elle garde React pour un composant React ou une valeur `memorisee en secret`.

Les modules (`utiliser module`), les composants React, Vue et Svelte et les Web
Components marchent de la même façon : le fichier n'est chargé que par les pages qui s'en
servent. Tout ce qui s'affiche après le chargement (ce qui vient du serveur,
un composant React) n'est pas dans le HTML de départ.

Un clic fait avant que la page soit prête n'est pas perdu : il est rejoué dès
qu'elle l'est.

`pour chaque t dans taches avec animation :` fait glisser les lignes quand la
liste change, et apparaître en fondu celles qui arrivent (sauf si la personne a
demandé moins d'animations). Cela marche sur le web, avec ce moteur comme avec
React : ailleurs, le compilateur le dit et les lignes changent sans glisser.

#### Le temps réel

`en direct` garde une page à jour quand le serveur change :

```humalis
page "commandes" :
    variable commandes = []
    titre "Commandes"
    quand la page se charge :
        envoyer requete vers "commandes" dans commandes en direct
```

Une commande créée ailleurs apparaît seule, sans recharger. Le serveur annonce
seulement « ça a changé » : la page relit ensuite la route normale, avec ses droits,
donc rien de privé ne passe par ce canal. Cela marche sur le web, avec ce moteur
comme avec React.

Avec une base PostgreSQL, tu peux lancer plusieurs exemplaires du serveur : un
changement reçu par l'un est annoncé par tous. Sans PostgreSQL, garde un seul
exemplaire. Les changements rapprochés sont regroupés, et les pages ne relisent
pas toutes au même instant.

#### Lire le serveur à la construction

Pour que les pages publiques portent déjà leur contenu dans le HTML, indique
l'adresse de ton serveur dans `humalis.projet.json` :

```json
{ "principal": "site.humalis", "moteur": "humalis", "lireServeur": "https://api.monsite.fr" }
```

Rien n'est lu si tu ne le demandes pas. Quatre règles s'appliquent toujours :

- seules les routes `tout le monde peut lire` sont lues, jamais une page réservée ;
- la lecture se fait comme un visiteur anonyme : ni clé, ni cookie ;
- tout ce qui vient du serveur est écrit comme du texte, jamais comme du code ;
- l'adresse est en https, et une redirection n'est pas suivie.

Pour une `source`, nomme chaque route publique : `"lireSources": ["api/produits"]`.
Une source qui envoie une clé n'est jamais lue.

Une donnée retirée du serveur reste dans le HTML jusqu'à la prochaine construction :
reconstruis le site après une suppression importante.
