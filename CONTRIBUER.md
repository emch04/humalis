# Contribuer à Humalis

Ce document s'adresse à ceux qui travaillent sur le compilateur lui-même. Pour utiliser Humalis, voir le [README](README.md).

## Comment ça marche

```
fichier .humalis → lexer → parser → analyse → représentation intermédiaire
                 → cibles : web (React) · mobile (Expo) · desktop (Electron) · serveur (Node + Astratra) · statique
```

| Étape | État |
|---|---|
| Lexer | fait, testé |
| Parser | fait, testé |
| Analyse, représentation intermédiaire | fait, testé |
| Commande `humalis verifier` | faite |
| Extension VS Code (erreurs, coloration, survol, complétion, saut à la déclaration, serveur LSP) | phases 1 à 3 faites ; serveur LSP essayé en vrai, l'extension reste à essayer dans VS Code |
| Cible web (React, prérendue) | faite, vérifiée dans un navigateur |
| Commande `humalis compile` | faite (cibles web, mobile, desktop, serveur, statique) |
| Interop React (pages dans un projet React, composants React dans Humalis) | faite, vérifiée dans un navigateur |
| Cible serveur (Node + packs Astratra) | faite, démarrée et testée |
| Lien écran ↔ serveur (vérifié à la compilation) | fait, vérifié dans un navigateur |
| Connexion depuis une page (packs Astratra) | faite, vérifiée dans un navigateur |
| Mises à jour des packs Astratra (`humalis packs`) | faite |
| Cible mobile (Expo) | faite, essayée dans le simulateur iPhone (Expo Go) : ajout au panier, panier partagé, navigation |
| Cible desktop (Electron) | faite, lancée et pilotée dans Electron sur Mac et sous Linux, application `.app` construite et ouverte |
| Cible statique (HTML, CSS, JavaScript) | faite, vérifiée dans un navigateur |

Humalis produit donc déjà des sites web : un projet Vite + React lisible, prérendu (une page HTML par adresse, grâce à `@astratra/prerender`), qu'on peut reprendre à la main.

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

## Organisation

| Dossier | Contenu |
|---|---|
| `src/lexer/` | le lexer : mots-clés, normalisation des accents, indentation |
| `src/parser/` | le parser : arbre (`ast.ts`), erreurs, lecture des mots |
| `src/analyse/` | l'analyse : portées, éléments visés, types simples |
| `src/ri/` | la représentation intermédiaire, neutre, que liront les cibles |
| `src/cibles/web/` | la cible web : chaque écran devient un composant React |
| `src/cibles/statique/` | la cible statique : chaque écran devient une page HTML et son script |
| `scripts/essai-web.mjs` | l'essai en vrai de la cible web, dans Chromium |
| `src/compilateur.ts` | `compiler(source)` : tout enchaîner, renvoyer la RI ou les diagnostics |
| `editeur/vscode/` | l'extension VS Code (voir son README) |
| `tests/` | les tests, rangés par étape |
| `exemples/` | des programmes Humalis réels (`boutique`, `connexion`) |
| `docs/guide.md`, `docs/guide.en.md` | le guide complet du langage, en français et en anglais |
| `docs/exemples.md` | la syntaxe de référence, construction par construction |

## Prochaines étapes

Le cœur, la cible web et le partage de données entre pages sont faits ; l'interop React (étape 2) et le serveur Node + Astratra (étape 3) et le lien écran ↔ serveur (étape 4) aussi, avec la connexion. La cible mobile Expo (étape 5) tourne dans le simulateur iPhone. La cible desktop Electron (étape 6) aussi tourne en application Mac : `npm run essai:desktop` la lance et la pilote, sur un Mac comme sous Linux.

### Tests Humalis

Dans un projet avec `humalis.projet.json`, `humalis tester` découvre les fichiers `tests/**/*.test.humalis`, compile le fichier principal pour le web, construit le site avec Vite et exécute chaque cas dans un contexte Chromium isolé. `humalis tester tests/accueil.test.humalis` cible un fichier. Chaque étape affiche son fichier, sa ligne et le nom du test ; la commande retourne 1 dès qu'un test ou une préparation échoue. Le premier lancement installe les dépendances du projet produit dans `.humalis/tests/web` et nécessite Chromium pour Playwright (`npx playwright install chromium` dans ce dossier).
