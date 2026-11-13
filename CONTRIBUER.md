# Contribuer à Humalis

Ce document s'adresse à ceux qui travaillent sur le compilateur lui-même. Pour utiliser Humalis, voir le [README](README.md).

## Comment ça marche

```
fichier .humalis → lexer → parser → analyse → représentation intermédiaire
                 → cibles : web (moteur Humalis) · statique · apple (SwiftUI) · android (Kotlin, Compose) · windows (C#, WPF)
                            desktop (Electron) · serveur (Node + Astratra)
```

| Étape | État |
|---|---|
| Lexer | fait, testé |
| Parser | fait, testé |
| Analyse, représentation intermédiaire | fait, testé |
| Commande `humalis verifier` (et `--cible`, pour ce qu'une cible refuserait) | faite |
| Extension VS Code (erreurs, coloration, survol, complétion, saut à la déclaration, serveur LSP) | faite ; serveur LSP essayé en vrai, l'extension reste à essayer dans VS Code |
| Cible web (moteur de rendu Humalis, une page HTML par adresse) | faite, vérifiée dans un navigateur |
| Commande `humalis compile` | faite (cibles web, statique, apple, android, windows, desktop, serveur) |
| Interop React (pages dans un projet React, composants React dans Humalis) | faite, vérifiée dans un navigateur |
| Cible serveur (Node + packs Astratra) | faite, démarrée et testée |
| Lien écran ↔ serveur (vérifié à la compilation) | fait, vérifié dans un navigateur |
| Connexion depuis une page (packs Astratra) | faite, vérifiée dans un navigateur |
| Mises à jour des packs Astratra (`humalis packs`) | faite |
| Cible desktop (Electron) | faite, lancée et pilotée dans Electron sur Mac et sous Linux, application `.app` construite et ouverte |
| Cible statique (HTML, CSS, JavaScript) | faite, vérifiée dans un navigateur |
| Cible Apple (SwiftUI, iPhone, iPad et Mac) | faite ; `npm run essai:apple` construit et lance chaque exemple sur le simulateur iPhone et sur Mac |
| Cible Android (Kotlin et Jetpack Compose) | faite, essayée dans l'émulateur |
| Cible Windows (C# et WPF, .NET 10) | faite, essayée dans une machine virtuelle Windows |
| Serveur produit : PostgreSQL ou SQLite, sauvegarde, restauration, vérification des données | fait, essayé sur de vraies bases |

Humalis produit des sites web (une page HTML par adresse, rendue par son propre moteur), des applications natives pour Apple, Android et Windows, une application de bureau, et leur serveur.

```sh
npm run build
node dist/cli.js compile exemples/boutique.humalis --cible web --sortie ../boutique-web --adresse https://mon-site.cd
cd ../boutique-web && npm install && npm run dev
```

Pour utiliser des pages Humalis dans un projet React existant :
`node dist/cli.js compile exemples/boutique.humalis --cible web --composants <dossier>` écrit seulement les pages et leurs outils, avec un `LISEZMOI.md` qui explique comment les brancher (`HumalisRacine`). `npm run essai:react-hote` le vérifie avec un vrai projet React écrit à la main (`essais/react-hote/`).

Pour le serveur : `node dist/cli.js compile exemples/boutique-serveur.humalis --cible serveur --sortie ../boutique-serveur`, puis `npm install`, `npm test` (les règles d'accès) et `npm start` dans ce dossier (voir son LISEZMOI). `npm run essai:serveur` vérifie tout, en vrai.

`exemples/boutique-complete.humalis` réunit les pages et le serveur : `npm run essai:lien` démarre les deux et vérifie dans Chromium que la page affiche les produits du serveur.

Pour un site statique, sans React ni construction : `node dist/cli.js compile exemples/boutique.humalis --cible statique --sortie ../boutique-site`, puis ouvrez `index.html` ou déposez le dossier chez un hébergeur. `npm run essai:statique` le vérifie dans Chromium (avec `-- --avec-serveur`, la connexion contre le vrai serveur).
`exemples/inscription.humalis` montre un formulaire complet (`formulaire "…" :`, chaque sorte de champ, case à cocher, choix, liste déroulante, champs obligatoires) : `npm run essai:formulaire` le pilote dans Chromium, sur le web avec son serveur et sur le mobile.

`npm run essai:moteur`, `npm run essai:moteur-comptes` et `npm run essai:moteur-direct` vérifient le moteur de rendu dans Chromium (`npm run mesure:moteur` mesure son poids et sa vitesse). Les autres essais tournent aussi sur le moteur avec `HUMALIS_MOTEUR=humalis` devant la commande.
`npm run essai:apple` (sur un Mac, avec Xcode) construit chaque exemple pour iPhone et pour Mac, puis le lance. `npm run essai:apple:fonctions` clique dans les fonctions de six exemples sur le simulateur iPhone. `npm run essai:apple:parcours` joue `exemples/magasin-complet.humalis` de A à Z contre un vrai serveur, avec XCUITest (`iphone`, `ipad` ou `mac` en argument). Sur un Mac où Stage Manager est actif, les clics automatiques tombent à côté de la fenêtre : `mac` y échoue sans que l'application soit en cause. `npm run essai:apple:capacites` essaie les rôles et le temps réel contre un vrai serveur, puis l'IA et le paiement contre un serveur d'essai. `npm run essai:apple:appareil` essaie la signature, la vibration, Face ID, le hors-ligne et un paquet Swift. `npm run essai:apple:natifs` essaie les composants natifs sur le simulateur iPhone. `npm run essai:apple:fond` essaie la position, les liens profonds, la tâche en arrière-plan (lancée à la main : un simulateur ne réveille jamais une application) et les envois gardés sans réseau. `HUMALIS_ESSAI_APPLE` choisit le dossier de travail.

`npm run essai:web` compile les deux exemples (la boutique a un panier partagé entre ses deux pages), les construit et les pilote dans Chromium pour vérifier qu'ils marchent vraiment.

## Commandes des outils

`humalis nouveau <nom>` crée une page, un style, un manifeste `humalis.projet.json` et un exemple de test. `humalis formater <fichier.humalis>` vérifie l'équivalence avec le vrai parser avant toute écriture ; `--verifier` contrôle sans écrire. Le formatage actuel conserve les chaînes et le CSS brut et normalise l'indentation sans réécrire les expressions.

`humalis developper [<fichier.humalis>] [--port 5173]` compile vers `.humalis/web`, puis demande explicitement `npm install` dans cette sortie avant de lancer Vite. Il surveille les fichiers Humalis importés et les styles. L'exécution des fichiers `*.test.humalis` attend la syntaxe du parser ; le gabarit les prépare déjà.

Il faut Node.js 24 ou plus récent.

```sh
npm install
npm test           # tous les tests (Vitest)
npm run typecheck  # vérification des types
npm run build      # compile vers dist/
node dist/cli.js verifier exemples/boutique.humalis --ri   # avec la représentation intermédiaire
```

`verifier` affiche les erreurs et les avertissements avec leur ligne, puis la représentation intermédiaire en JSON. La commande sort avec le code 1 s'il y a une erreur.

### Ce qui est vérifié à chaque envoi

`.github/workflows/verification.yml` rejoue, à chaque envoi sur `main` et à chaque demande de fusion :

- le compilateur, sous Linux et sous macOS : `npm ci`, `npm run typecheck`, `npm run build`, `npm test` ;
- l'extension des éditeurs (`editeur/vscode`) : types, tests, construction ;
- les serveurs produits : `npm run verifier:serveurs` produit le serveur de chaque programme du dépôt (exemples, guide, antisèche, programmes des tests), vérifie ses types et lance les tests que le compilateur a écrits pour lui.

`npm run verifier:serveurs` se lance aussi ici, après `npm run build`. Il est lent (une installation de paquets, puis chaque serveur) : à refaire après tout changement du serveur produit. `-- --seul boutique` ne joue que les programmes dont le nom contient « boutique » ; `-- --garder` laisse les serveurs sur le disque, pour regarder un échec.

## Organisation

| Dossier | Contenu |
|---|---|
| `src/lexer/` | le lexer : mots-clés, normalisation des accents, indentation |
| `src/parser/` | le parser : arbre (`ast.ts`), erreurs, lecture des mots |
| `src/analyse/` | l'analyse : portées, éléments visés, types simples |
| `src/ri/` | la représentation intermédiaire, neutre, que liront les cibles |
| `src/cibles/web/` | la cible web : chaque écran devient un composant React |
| `src/cibles/statique/` | la cible statique : chaque écran devient une page HTML et son script |
| `src/cibles/moteur/` | le moteur de rendu sans React, le défaut de `--cible web` (`--moteur react` garde React) : HTML écrit, reprise, mises à jour fines |
| `src/cibles/apple/` | la cible Apple : chaque écran devient une vue SwiftUI, le tout dans un projet Xcode |
| `src/cibles/android/` | la cible Android : Kotlin et Jetpack Compose, dans un projet Gradle |
| `src/cibles/windows/` | la cible Windows : C# et WPF, dans un projet .NET |
| `src/cibles/desktop/` | l'application de bureau : les pages du web dans Electron |
| `src/cibles/serveur/` | le serveur produit : routes, droits, comptes, stockage (PostgreSQL, SQLite), exploitation |
| `src/machine/` | `humalis lancer` : le programme tourne tout de suite, serveur en mémoire compris |
| `catalogue/` | le catalogue des erreurs : chaque message du compilateur, avec un exemple fautif et sa correction |
| `scripts/essai-web.mjs` | l'essai en vrai de la cible web, dans Chromium |
| `src/compilateur.ts` | `compiler(source)` : tout enchaîner, renvoyer la RI ou les diagnostics |
| `editeur/vscode/` | l'extension VS Code (voir son README) |
| `tests/` | les tests, rangés par étape |
| `exemples/` | des programmes Humalis réels (`boutique`, `connexion`) |
| `docs/guide.md`, `docs/guide.en.md` | le guide complet du langage, en français et en anglais |
| `docs/exemples.md` | la syntaxe de référence, construction par construction |

## Prochaines étapes

Le cœur, la cible web et le partage de données entre pages sont faits ; l'interop React (étape 2) et le serveur Node + Astratra (étape 3) et le lien écran ↔ serveur (étape 4) aussi, avec la connexion. La cible desktop Electron (étape 6) aussi tourne en application Mac : `npm run essai:desktop` la lance et la pilote, sur un Mac comme sous Linux.

### Tests Humalis

Dans un projet avec `humalis.projet.json`, `humalis tester` découvre les fichiers `tests/**/*.test.humalis`, compile le fichier principal pour le web, construit le site avec Vite et exécute chaque cas dans un contexte Chromium isolé. `humalis tester tests/accueil.test.humalis` cible un fichier. Chaque étape affiche son fichier, sa ligne et le nom du test ; la commande retourne 1 dès qu'un test ou une préparation échoue. Le premier lancement installe les dépendances du projet produit dans `.humalis/tests/web` et nécessite Chromium pour Playwright (`npx playwright install chromium` dans ce dossier).

## L'extension VS Code

Depuis `editeur/vscode` :

```sh
npm install
npm test               # génère la grammaire, lance les tests
npm run paquet         # construit humalis-<version>.vsix
npm run essai:lsp      # lance le serveur de langage construit et lui parle en JSON-RPC
npm run essai:projet -- <dossier> <principal.humalis,autre.humalis> <fichier.humalis> …   # compare ses diagnostics à ceux de humalis verifier
npm run test:vscode    # télécharge VS Code et essaie l'extension dedans
```

Le survol, la complétion et le reste sont des fonctions pures (`src/langage/`), que l'extension et le serveur de langage appellent de la même façon. La grammaire de coloration est générée depuis le vocabulaire ; une tournure de plusieurs mots s'ajoute dans `scripts/generer-grammaire.ts`, sa fiche dans `PHRASES` de `src/langage/survol.ts`.
