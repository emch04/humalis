# Publier sur l'App Store et sur Google Play

Ce guide explique comment mettre une application faite avec Humalis sur
l'App Store (Apple) et sur le Google Play Store (Android). Il suit un chemin
simple, étape par étape.

Les règles des stores, leurs prix et leurs délais changent. Ce guide ne donne
donc aucun chiffre à ce sujet : à chaque fois, il te dit où aller vérifier.

## Sommaire

1. [À quoi sert ce guide](#1-à-quoi-sert-ce-guide)
2. [Avant de commencer](#2-avant-de-commencer)
3. [Partie Apple native (SwiftUI)](#3-partie-apple-native-swiftui)
4. [Partie Android native (Kotlin)](#4-partie-android-native-kotlin)
5. [Les mises à jour](#5-les-mises-à-jour)
6. [Liste de vérification finale](#6-liste-de-vérification-finale)
7. [Où vérifier les règles et les prix](#7-où-vérifier-les-règles-et-les-prix)

---

## 1. À quoi sert ce guide

Humalis produit une application native pour chaque magasin. Elles n'ont pas
le même chemin de publication.

| Tu veux | Commande Humalis | Ce que tu obtiens |
|---|---|---|
| Une application native Apple (iPhone, iPad et Mac) | `--cible apple` | Un projet Xcode en SwiftUI |
| Une application native Android | `--cible android` | Un projet Gradle en Kotlin et Jetpack Compose |

Humalis fabrique le projet. **Humalis ne publie pas à ta place** : il n'envoie
rien aux stores. Tu fais cette dernière partie avec les outils d'Apple et de
Google. Ce guide t'y accompagne.

Pour l'App Store, prends la partie 3. Pour Google Play, prends la partie 4.

---

## 2. Avant de commencer

### Les comptes

- **Pour l'App Store** : un compte du programme Apple Developer. C'est un
  abonnement payant. Le montant et les conditions sont sur
  developer.apple.com/programs.
- **Pour Google Play** : un compte développeur dans la Google Play Console
  (play.google.com/console). Il y a des frais d'inscription ; leur montant est
  indiqué sur la Play Console.

Prépare ces comptes tôt. Certaines vérifications d'identité prennent du temps ;
la durée est indiquée par chaque store.

### Le matériel

- **Pour Apple** : un Mac avec Xcode (l'outil gratuit d'Apple pour fabriquer
  des applications). Sans Mac, la partie 3 n'est pas faisable.
- **Pour Android** : n'importe quel ordinateur, avec Android Studio (gratuit).

### L'icône, le nom et l'identifiant

Trois choses doivent être prêtes avant de compiler.

**1. Le nom et l'icône, dans le bloc `site`.** Humalis les lit dans le bloc
`site :` en haut de ton fichier (voir la partie 29 du [guide](guide.md)).

```humalis
site :
    nom "Ma Boutique"
    logo "./logo.png"
```

- `nom` devient le nom affiché sous l'icône de l'application.
- `logo` devient l'icône, **à condition que ce soit un fichier PNG carré**.
  La cible Apple demande du 1024×1024.
- Si le logo n'est pas un PNG, la cible Apple avertit et garde l'icône par défaut.

**2. Un identifiant unique** (en anglais : *bundle ID*). C'est le nom
technique de ton application, qui ne doit exister nulle part ailleurs. Il
s'écrit à l'envers, comme un nom de domaine : `com.exemple.app`. Choisis-le
une fois ; on ne peut pas le changer après la publication.

**3. Des textes et des images pour la fiche du store** : une description
courte, une description longue, des captures d'écran. Voir plus bas.

---

## 3. Partie Apple native (SwiftUI)

### 3.1 Compiler le projet

```sh
humalis compile app.humalis --cible apple --sortie ./MonApp \
  --identifiant com.exemple.app --equipe ABCDE12345
```

Les deux options servent à la publication :

- `--identifiant` est l'identifiant unique de la partie 2. Sans cette option,
  Humalis en invente un qui commence par `local.humalis.` : il ne convient pas
  pour publier.
- `--equipe` est l'identifiant de ton équipe Apple Developer : dix
  caractères, que tu trouves dans ton compte sur developer.apple.com. Sans
  elle, le projet n'est pas signé et certaines fonctions (notifications,
  « se connecter avec Apple », liens qui ouvrent l'application) ne marchent
  pas. Humalis te le dit alors par un avertissement.

Humalis écrit dans le dossier de sortie :

- un projet Xcode (`MonApp.xcodeproj`) pour iPhone, iPad et Mac ;
- l'icône, si ton logo est un PNG ;
- un fichier `LISEZMOI.md` qui reprend les commandes utiles.

Le projet est réglé en version `1.0` et en numéro de build `1`.

> Le dossier est réécrit à chaque compilation. Ne modifie pas à la main les
> fichiers que Humalis a écrits : tes changements seraient perdus. Pour du
> Swift fait à la main, Humalis a le mot `sur apple` (voir son guide).

### 3.2 Ouvrir dans Xcode et choisir l'équipe

1. Ouvre `MonApp.xcodeproj` dans Xcode.
2. Dans la colonne de gauche, clique sur le projet, puis sur ta cible, puis
   sur l'onglet « Signing & Capabilities ».
3. Vérifie que ton équipe est choisie. Si tu as compilé avec `--equipe`,
   c'est déjà fait.

La **signature** est la preuve que l'application vient bien de toi. Xcode la
gère seul : il crée les certificats (les pièces d'identité numériques) et les
profils (les autorisations qui lient l'application à ton compte). Tu n'as pas
à les fabriquer à la main.

Lance l'application une fois sur un simulateur, puis sur ton propre iPhone si
tu en as un. Il vaut mieux voir les problèmes maintenant.

### 3.3 Archiver

Une **archive** est la version finale de l'application, empaquetée pour être
envoyée.

Dans Xcode, choisis « Any iOS Device » comme destination, puis le menu
Product, puis Archive. En ligne de commande, le `LISEZMOI.md` du projet donne
la commande `xcodebuild … archive`.

### 3.4 Envoyer vers App Store Connect

**App Store Connect** (appstoreconnect.apple.com) est le site où tu gères tes
applications chez Apple.

1. Sur App Store Connect, crée une fiche d'application. Utilise exactement
   l'identifiant que tu as donné à `--identifiant`.
2. Dans Xcode, ouvre la fenêtre Organizer (menu Window), choisis ton archive,
   puis « Distribute App » et l'envoi vers App Store Connect.
3. Attends que le build apparaisse sur App Store Connect. Il y est d'abord
   traité par Apple.

Le fichier `Info.plist` du projet déclare que l'application n'utilise que le
chiffrement fourni par le système (HTTPS et trousseau). Si tu ajoutes ton
propre chiffrement en Swift, change cette déclaration.

Si ton application appelle un serveur, compile avec `--serveur https://…`
(une adresse sécurisée). Avec une adresse `http://localhost`, le projet
autorise le réseau local, ce qui ne convient pas à une application publiée.

### 3.5 TestFlight : essayer avant de publier

**TestFlight** est l'application d'Apple pour faire essayer ta future
application à quelques personnes, avant tout le monde. C'est le bon moment
pour la tester sur de vrais appareils.

Une fois ton build traité, il apparaît dans l'onglet TestFlight d'App Store
Connect. Tu peux t'inviter toi-même, puis inviter d'autres testeurs. Les
limites (nombre de testeurs, durée) sont dans l'aide d'App Store Connect.

### 3.6 La fiche de l'application

Sur App Store Connect, remplis :

- le nom, la description, les mots-clés, la catégorie ;
- les **captures d'écran** : App Store Connect t'indique les tailles
  acceptées pour chaque type d'appareil ;
- l'adresse d'une page d'aide (support) ;
- la **politique de confidentialité** : une page web qui explique quelles
  données l'application garde et pourquoi. Elle doit exister même si tu ne
  collectes presque rien ;
- les réponses sur la confidentialité (« App Privacy ») : quelles données
  l'application recueille. Réponds d'après ce que ton application fait vraiment
  (compte, photos, position, serveur…) ;
- la classification d'âge, via le questionnaire d'App Store Connect.

### 3.7 Soumettre à la validation

Choisis le build, relis la fiche, puis envoie à la validation (« Submit for
Review »). Apple relit l'application avant de la publier. La durée et les
critères sont décrits sur developer.apple.com/app-store/review/guidelines.

Si Apple refuse, il explique pourquoi. Corrige, recompile, augmente le numéro
de build (partie 5) et renvoie.

---

## 4. Partie Android native (Kotlin)

### 4.1 Compiler le projet

```sh
humalis compile app.humalis --cible android --sortie ./MonApp --identifiant com.exemple.app
```

Humalis écrit un projet Gradle, en Kotlin et Jetpack Compose. Il contient :

- le nom de l'application (celui du bloc `site`, sinon le nom du projet) ;
- l'identifiant donné par `--identifiant` : c'est lui qui désigne l'application
  sur Google Play, pour toujours. Choisis-le avant le premier envoi ;
- la version `1.0` et le numéro de build `1`.

Ouvre le dossier dans Android Studio et essaie d'abord l'application dans
l'émulateur ou sur un téléphone. Ensuite seulement, prépare la publication.

**Attention :** Humalis réécrit ce dossier à chaque compilation. Ce que tu
changes à la main dans le projet (version, signature) est à refaire après une
recompilation ; garde une copie de tes réglages.

### 4.2 Le fichier pour Google Play : l'AAB

Google Play demande un fichier **AAB** (*Android App Bundle*). C'est un
paquet complet de l'application, à partir duquel le store fabrique lui-même
la bonne version pour chaque téléphone.

Un fichier APK, lui, sert à installer l'application directement sur un
téléphone pour l'essayer. Ce n'est pas le format de publication de Google Play.

### 4.3 Construire l'AAB signé

Dans Android Studio, le menu « Build » propose « Generate Signed App Bundle or
APK ». Choisis « Android App Bundle », puis suis l'assistant : il te fait
créer ou choisir la clé de signature (voir ci-dessous), puis fabrique le
fichier `.aab` de la version « release ».

L'aide d'Android Studio (developer.android.com/studio/publish) décrit chaque
écran de cet assistant.

### 4.4 Avant le premier envoi

- Vérifie l'identifiant de l'application : il ne se change plus après la
  publication.
- Si l'application se connecte avec Google ou reçoit des notifications, donne
  à la compilation l'empreinte de ta clé de publication (`--empreinte`) et le
  fichier de ton projet Firebase (`--firebase google-services.json`) : le
  `LISEZMOI.md` du projet produit dit lesquels sont attendus.

### 4.5 La clé de signature Android

Android signe l'application avec une clé. C'est toi qui la crées, dans
l'assistant d'Android Studio.

**Garde cette clé en lieu sûr.** Si tu la perds, la documentation de la Play
Console explique ce qu'il est possible de faire : lis la section sur la
signature des applications dans l'aide de la Play Console
(support.google.com/googleplay/android-developer).

### 4.6 Créer l'application dans la Play Console

1. Dans la Google Play Console, crée une application (nom, langue, gratuite ou
   payante).
2. Remplis les déclarations demandées : la Console te guide, avec une liste de
   tâches à terminer.
3. Envoie ton fichier AAB dans la Console.

### 4.7 Les pistes de test

Une **piste de test** est un groupe de personnes qui reçoivent ton application
avant le public. La Play Console en propose plusieurs :

- la **piste de test interne** : une petite équipe, disponible rapidement ;
- les pistes de test fermé et ouvert : plus de monde.

Commence par la piste interne. Les règles qui s'appliquent aux nouveaux
comptes, aux nombres de testeurs et aux durées d'essai se trouvent dans l'aide
de la Play Console ; elles changent, vérifie-les avant de planifier ta date.

### 4.8 La fiche et les déclarations

Dans la Play Console, remplis :

- le nom, la description courte et la description longue ;
- l'icône et les captures d'écran, aux tailles que la Console indique ;
- la catégorie et les coordonnées de contact ;
- la **politique de confidentialité**, une page web accessible à tous ;
- le formulaire **Data safety** (« sécurité des données ») : tu y déclares
  quelles données l'application recueille et si elles sont partagées. Réponds
  d'après ce que fait vraiment ton application ;
- le questionnaire de classification du contenu ;
- les autres déclarations que la Console te demande (publicité, public visé…).

### 4.9 Soumettre

Crée une version dans la piste voulue, ajoute l'AAB, relis le récapitulatif,
puis envoie à la validation. Google relit l'application. Les règles sont dans
la Play Console et son aide.

---

## 5. Les mises à jour

Une mise à jour suit le même chemin qu'une première publication. La règle
d'or : **les stores refusent un build dont le numéro n'a pas augmenté.**

Il y a deux numéros :

- la **version**, que voient les gens (par exemple « 1.1 ») ;
- le **numéro de build**, un compteur interne qui monte à chaque envoi, même
  quand la version ne change pas.

**Apple native.** Humalis écrit la version `1.0` et le build `1` dans le
projet Xcode. Change-les dans Xcode (onglet « General » de la cible) avant
d'archiver. Attention : si tu recompiles avec Humalis, il les remet aux valeurs
de départ ; règle-les à nouveau après chaque compilation.

**Android native.** Humalis écrit la version `1.0` (`versionName`) et le
build `1` (`versionCode`) dans `app/build.gradle.kts`. Change-les avant de
construire l'AAB. Là encore, une recompilation Humalis les remet aux valeurs
de départ.

Après chaque changement : compiler, tester, construire, envoyer, mettre à
jour la fiche si besoin, puis soumettre.

---

## 6. Liste de vérification finale

Avant d'envoyer à la validation, coche chaque ligne.

**Partout**

- [ ] L'application marche sur un vrai appareil, pas seulement sur simulateur.
- [ ] Le bloc `site` donne le bon nom et un logo PNG carré.
- [ ] L'identifiant est unique et noté quelque part.
- [ ] La politique de confidentialité est en ligne et son adresse marche.
- [ ] Les réponses sur les données (App Privacy, Data safety) correspondent
      à ce que fait l'application.
- [ ] Les captures d'écran montrent l'application telle qu'elle est.
- [ ] Si l'application parle à un serveur, il tourne en HTTPS et il est
      en ligne.
- [ ] Si l'application a des comptes, un compte d'essai est donné au
      relecteur du store (dans les notes de validation).

**Apple**

- [ ] Compilé avec `--identifiant` et `--equipe`.
- [ ] L'équipe est choisie dans Xcode.
- [ ] Le build est apparu sur App Store Connect et a été essayé avec
      TestFlight.
- [ ] La fiche d'App Store Connect est complète.

**Android**

- [ ] L'identifiant donné par `--identifiant` est le bon : il ne se change plus.
- [ ] L'envoi est un fichier AAB.
- [ ] La clé de signature est sauvegardée.
- [ ] La piste de test a été utilisée avant la publication.
- [ ] Toutes les tâches de la Play Console sont terminées.

**Mises à jour**

- [ ] Le numéro de build a augmenté depuis le dernier envoi.

---

## 7. Où vérifier les règles et les prix

Les stores changent leurs règles. Ne te fie pas à ce guide pour un prix, un
délai ou une règle : va voir la source.

| Sujet | Où regarder |
|---|---|
| Adhésion Apple Developer Program (prix, conditions) | developer.apple.com/programs |
| Règles de validation de l'App Store | developer.apple.com/app-store/review/guidelines |
| Fiches, TestFlight, envois chez Apple | appstoreconnect.apple.com |
| Compte, fiches et déclarations Google Play | play.google.com/console |
| Aide de la Play Console (pistes, signature, règles) | support.google.com/googleplay/android-developer |
| Construire et signer l'application Android | developer.android.com/studio/publish |
| Ce que Humalis produit pour Apple et pour Android | le fichier `LISEZMOI.md` écrit dans chaque projet compilé |

Si une page change et que ce guide ne correspond plus, fais confiance à la
page du store.
