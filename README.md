<p align="center">
  <img src="https://cdn.jsdelivr.net/npm/humalis@1/docs/logo/humalis-logo-carte.svg" alt="Humalis" width="360">
</p>

<p align="center"><strong>Français</strong> · <a href="README.en.md">English</a></p>

<p align="center">
  <a href="https://www.npmjs.com/package/humalis"><img src="https://img.shields.io/npm/v/humalis" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-Humalis%201.0-c1e928" alt="Licence"></a>
  <a href="https://github.com/emch04/framework"><img src="https://img.shields.io/badge/serveur-Astratra-6f42c1" alt="Astratra"></a>
  <a href="https://hub.xerj.org/contributors/emch04"><img src="https://hub.xerj.org/contributors/emch04/badge.svg" alt="XERJ Corpus Hub contributor"></a>
</p>

# Humalis

**Un seul langage, en français, pour créer une application complète** : un site web, une application mobile, une application de bureau et son serveur, à partir du même fichier.

```humalis
page "boutique" :
    titre "Nos produits"
    variable produits = ["Livre", "Stylo", "Cahier"]
    pour chaque nom dans produits :
        texte nom
    bouton "Commander"
    quand l'utilisateur clique sur "Commander" :
        afficher "Merci pour ta commande !"
```

Ce fichier se lit comme une phrase. Humalis le transforme en un vrai projet, avec du code TypeScript lisible que l'on peut reprendre à la main.

## Apprendre le langage

Le **[guide complet](docs/guide.md)** explique tout le langage, du premier titre jusqu'au serveur, avec un exemple vérifié pour chaque construction. Il est aussi en [anglais](docs/guide.en.md).

## Installer

Il faut [Node.js](https://nodejs.org) 24 ou plus récent.

```sh
npm install -g humalis
```

## Premier projet

```sh
humalis nouveau mon-projet
cd mon-projet
humalis developper
```

`humalis developper` lance le site en local et le recompile à chaque enregistrement.

## Une source, plusieurs cibles

```sh
humalis compile mon-projet.humalis --cible web --sortie mon-projet-web
humalis compile mon-projet.humalis --cible statique --sortie mon-projet-statique
humalis compile mon-projet.humalis --cible mobile --sortie mon-projet-mobile
humalis compile mon-projet.humalis --cible desktop --sortie mon-projet-desktop
humalis compile mon-projet.humalis --cible serveur --sortie mon-projet-serveur   # si le fichier a un bloc « serveur "…" : »
```

| Cible | Ce que Humalis produit |
|---|---|
| `web` | un projet React + Vite, prérendu (une page HTML par adresse) |
| `statique` | des pages HTML, CSS et JavaScript, sans construction |
| `serveur` | un serveur Node avec les packs [Astratra](https://github.com/emch04/framework) (connexion, droits, sessions) |
| `mobile` | une application Expo (iPhone, Android) |
| `desktop` | une application Electron (Mac, Windows, Linux) |

Quand une construction n'existe pas encore sur une cible, le compilateur le dit clairement au lieu de produire quelque chose de faux.

### Lancer chaque projet produit

Chaque dossier produit contient un `LISEZMOI.md` qui reprend ces commandes.

**Web** : un site prérendu, à déposer chez n'importe quel hébergeur de fichiers.

```sh
cd mon-projet-web && npm install
npm run dev      # en local
npm run build    # le site final, dans dist/
```

**Statique** : rien à installer. Ouvre `index.html` dans un navigateur, ou déposez le dossier tel quel chez un hébergeur.

**Mobile** : il faut [Expo Go](https://expo.dev/go) sur le téléphone, ou le simulateur iPhone (Xcode, sur Mac) ou l'émulateur Android.

```sh
cd mon-projet-mobile && npm install
npx expo start   # puis « i » pour l'iPhone, « a » pour Android, ou scanne le code avec Expo Go
```

**Desktop** : une application Electron, avec un menu en français.

```sh
cd mon-projet-desktop && npm install
npm start        # ouvre l'application
npm run paquet   # l'installateur, dans paquets/ : .dmg sur Mac, .exe sur Windows, AppImage sous Linux
```

L'installateur se construit sur le système visé (le `.dmg` sur un Mac, le `.exe` sur Windows). Pour le distribuer à d'autres personnes, il faut le signer (certificat Apple ou Windows) : voir la documentation d'[electron-builder](https://www.electron.build/code-signing).

**Serveur** : un serveur Node, produit depuis le bloc `serveur "…" :` du fichier. Son `LISEZMOI.md` liste les routes et qui a le droit de faire quoi.

```sh
cd mon-projet-serveur && npm install
cp .env.exemple .env      # puis remplir JWT_SECRET et l'administrateur
npm test                  # vérifie chaque règle d'accès
npm run build && npm start
```

Sans `DATABASE_URL`, les données restent en mémoire ; avec, elles vont dans PostgreSQL.

## Ce que le langage sait faire

- **Les pages et les éléments** : titres, textes, images, boutons, liens, formulaires, icônes, onglets, carrousel, graphiques, carte, son.
- **La mise en page** : sections, lignes, colonnes, grilles, en-tête et pied communs, affichage selon l'appareil (`sur telephone :`).
- **L'apparence** : un thème (couleurs, polices, mode sombre), des styles nommés (`avec couleur bleu`), et ton propre CSS.
- **La logique** : variables, conditions (`si … et …`, `n'est pas`), boucles, fonctions, listes (`trier`, `dont`, `grouper`), dates (`aujourd'hui plus 3 jours`), argent (`{prix en euros}`).
- **Les données** : un serveur dans le même fichier, ou une API existante (`source "…"`), avec les états de chargement et d'erreur.
- **Les interactions** : messages, fenêtres et confirmations, raccourcis clavier, recherche pendant la frappe, copier et partager.
- **La qualité** : l'accessibilité vérifiée à la compilation, plusieurs langues (`titre "Bienvenue" en anglais "Welcome"`), l'aperçu de partage et le plan du site.

Les messages d'erreur sont en français, avec la ligne, et proposent souvent la correction :

```
Erreur, ligne 3 : le texte utilise {totl}, mais la variable « totl » n'est pas déclarée. Peut-être « total » ?
```

## Les commandes

| Commande | Rôle |
|---|---|
| `humalis nouveau <nom>` | crée un projet |
| `humalis developper` | lance le site et le recompile à chaque enregistrement |
| `humalis compile <fichier> --cible …` | produit le projet d'une cible |
| `humalis verifier <fichier>` | affiche les erreurs et les avertissements |
| `humalis formater <fichier>` | remet le fichier en forme |
| `humalis tester` | lance les tests écrits en Humalis (`*.test.humalis`) dans un navigateur |

## Pour les assistants (IA)

Le fichier [`llms.txt`](llms.txt), livré avec le paquet, résume la grammaire, les pièges et les messages d'erreur, pour qu'un assistant écrive du Humalis juste.

## Licence

[Licence Humalis](LICENSE) : tu peux utiliser, modifier et partager Humalis gratuitement, mais pas le vendre. Copyright 2026 Les auteurs de Humalis ; Humalis a été créé par emch04 (voir [`NOTICE`](NOTICE)).

Le code que Humalis produit (sites, applications, serveurs) t'appartient, sans aucune obligation. Le nom « Humalis » et son logo ne sont pas couverts par la licence.
