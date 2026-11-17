# Humalis dans les éditeurs

Tous les éditeurs s'appuient sur le même serveur de langage (LSP), livré avec
Humalis :

```bash
npm install -g humalis      # Humalis 3.0.0 ou plus récent, Node 24 ou plus récent
humalis editeur --stdio     # lancé par l'éditeur, jamais à la main
```

Il donne les erreurs du compilateur pendant qu'on écrit, le survol des mots,
la complétion, le saut à la déclaration, le plan du fichier, la mise en forme
et la coloration des noms (jetons sémantiques). La coloration des mots du
langage vient d'une grammaire propre à chaque famille d'éditeurs, toujours
tirée du vocabulaire du compilateur (`src/lexer/motsCles.ts`).

| Dossier | Éditeurs | Coloration des mots |
|---|---|---|
| `vscode` | VS Code, Cursor, VSCodium, Windsurf | grammaire TextMate (`syntaxes/humalis.tmLanguage.json`) |
| `jetbrains` | IntelliJ IDEA, Android Studio, WebStorm, Rider, PyCharm… (2025.3 et plus récent) | analyseur Kotlin de l'extension |
| `zed` | Zed | grammaire tree-sitter |
| `visual-studio` | Visual Studio 2022 (17.14) et 2026 | jetons sémantiques du serveur (les noms seulement) |
| `neovim` | Neovim 0.11 et plus récent | grammaire tree-sitter (facultative) |
| `helix` | Helix 25.07 et plus récent | grammaire tree-sitter |
| `emacs` | Emacs 29 et plus récent (eglot) | mode `humalis-mode` |
| `sublime` | Sublime Text 4 (module LSP) | grammaire TextMate, tirée de celle de VS Code |
| `tree-sitter-humalis` | — | la grammaire tree-sitter partagée |
| `essais` | — | les essais en vrai de chaque éditeur |

Quand le vocabulaire change, on régénère les mots, à la racine du dépôt :

```bash
npm run build
(cd editeur/tree-sitter-humalis && npm install && npm run mots && npm run generer && npm test)
node editeur/sublime/generer.mjs
```

`tests/editeurs.test.ts` (dans `npx vitest run`) échoue tant que ce n'est pas fait.

## Installer

### VS Code, Cursor, VSCodium, Windsurf

Depuis la boutique d'extensions de l'éditeur, « Humalis » : la Marketplace de
VS Code pour VS Code, Open VSX pour Cursor, VSCodium et Windsurf.

### IntelliJ IDEA, Android Studio, WebStorm, Rider…

Depuis la marketplace JetBrains : *Settings › Plugins › Marketplace › Humalis*
(2025.3 et plus récent). LSP4IJ (le client LSP de Red Hat) s'installe avec
elle. Depuis ce dossier : `cd jetbrains && ./gradlew buildPlugin` écrit
`jetbrains/build/distributions/humalis-jetbrains-<version>.zip`, à installer
par *Settings › Plugins › ⚙ › Install Plugin from Disk…*.

### Zed

Les extensions de Zed n'acceptent que des licences libres reconnues : on
installe celle de ce dossier avec *zed: install dev extension* sur le dossier
`zed` (Rust doit être installé : Zed construit l'extension). L'extension
utilise la commande `humalis` du PATH, sinon installe elle-même le paquet npm.
Pour un autre chemin, dans les réglages de Zed :

```json
{ "lsp": { "humalis": { "binary": { "path": "/chemin/vers/humalis", "arguments": ["editeur", "--stdio"] } } } }
```

### Visual Studio

Depuis *Extensions › Gérer les extensions*, « Humalis », ou en ouvrant le
fichier `Humalis.VisualStudio.vsix` (double-clic ; Windows demande l'accord
de l'administrateur). Essayée dans Visual Studio 2022 17.14 : erreurs en
direct, survol (la fiche entière, en texte), complétion, déclaration (F12),
mise en forme (Ctrl+K, Ctrl+D) et plan (barre de navigation, replis).
Visual Studio n'accepte que du texte au survol et une liste de symboles à
plat : le serveur les lui donne d'après ce qu'il déclare à l'ouverture.
Un fichier `.humalis` ouvert au lancement même de Visual Studio (double-clic
dans l'Explorateur) n'est pas toujours relié au serveur : le fermer et le
rouvrir suffit.

Pour voir ce qu'un éditeur demande au serveur : `HUMALIS_JOURNAL_LSP=<fichier>`
avant de lancer l'éditeur ; chaque message reçu (←) et envoyé (→) y est ajouté.

Signature : le `.vsix` n'est pas signé (Visual Studio l'indique à
l'installation, la Marketplace de Visual Studio l'accepte tel quel). Le signer demanderait un
certificat de signature de code Authenticode acheté à une autorité (OV ou
EV), puis `dotnet sign` ou VsixSignTool sur le `.vsix`.

### Neovim

Copier `neovim/humalis.lua` dans `~/.config/nvim/plugin/`. Pour colorer aussi
les mots du langage, suivre les trois commandes au bas de ce fichier
(compilation de la grammaire, sans greffon).

### Helix

Ajouter `helix/languages.toml` à `~/.config/helix/languages.toml`, copier
`tree-sitter-humalis/queries/helix/highlights.scm` dans
`~/.config/helix/runtime/queries/humalis/`, puis :

```bash
hx --grammar fetch && hx --grammar build && hx --health humalis
```

### Emacs

Copier `emacs/humalis-mode.el` dans un dossier du `load-path`, puis dans
`init.el` :

```elisp
(require 'humalis-mode)
(add-hook 'humalis-mode-hook #'eglot-ensure)
```

### Sublime Text

Installer le module LSP (*Package Control: Install Package › LSP*), puis
copier le dossier `sublime/Humalis` dans le dossier des paquets
(*Preferences › Browse Packages…*). Pour un autre chemin vers `humalis` :
*Preferences › Package Settings › LSP › Servers › LSP-humalis*.

## Construire et essayer

| Éditeur | Construire | Essayer en vrai |
|---|---|---|
| serveur | `npm run build` | `npm run essai:editeur` |
| JetBrains | `cd jetbrains && ./gradlew buildPlugin` | `./gradlew test` (plateforme IntelliJ sans fenêtre, vrai serveur ; `humalis` dans le PATH) |
| Zed | `cd zed && cargo build --release --target wasm32-wasip2` | *zed: install dev extension* sur le dossier `zed` |
| Visual Studio | sous Windows : `dotnet build -c Release` dans `visual-studio/Humalis.VisualStudio` (sur Mac ou Linux, compile sans assembler le .vsix) | F5 dans Visual Studio (instance expérimentale) |
| Neovim | — | `nvim --headless --clean -l editeur/essais/neovim.lua <fichier.humalis>` |
| Helix | — | `python editeur/essais/helix.py <dossier>` (Python avec pyte) |
| Emacs | — | `emacs --batch -Q -l editeur/essais/emacs.el <fichier.humalis>` |
| Sublime Text | `node editeur/sublime/generer.mjs` | `sh editeur/essais/sublime.sh <dossier>` |

Le JDK de JetBrains suffit pour Gradle :
`JAVA_HOME="/Applications/IntelliJ IDEA.app/Contents/jbr/Contents/Home"`, et
`-PideLocal="/Applications/IntelliJ IDEA.app"` construit avec l'IDE installé
au lieu d'en télécharger un.

## Publier

Rien n'est publié automatiquement. Le paquet npm `humalis`, qui contient
`humalis editeur --stdio`, passe d'abord : toutes les extensions en dépendent.

1. **VS Code** : `cd vscode && npm run paquet`, puis le `.vsix` sur
   <https://marketplace.visualstudio.com/manage> (éditeur `emch04`).
2. **Open VSX** (Cursor, VSCodium, Windsurf) : le même `.vsix`, avec
   `npx ovsx publish humalis-<version>.vsix -p <jeton>` (espace de noms `emch04`).
3. **JetBrains** : *Upload Update* sur <https://plugins.jetbrains.com> avec
   `humalis-jetbrains-<version>.zip` (ou `./gradlew publishPlugin` avec un jeton
   `PUBLISH_TOKEN`). Avant, `./gradlew verifyPlugin` vérifie la compatibilité
   avec les IDE récents ; JetBrains relit chaque version avant de la montrer.
4. **Zed** : pousser le dépôt, remplacer `REMPLACER_PAR_LE_COMMIT` dans
   `zed/extension.toml` par le commit poussé (`git rev-parse HEAD`), puis
   proposer une demande de fusion à <https://github.com/zed-industries/extensions>
   (sous-module `extensions/humalis` + entrée dans `extensions.toml`). Zed
   n'accepte que des extensions sous une licence libre reconnue (MIT,
   Apache-2.0…) : la licence Humalis devra être acceptée ou l'extension
   publiée sous une autre licence.
5. **Visual Studio** : construire le `.vsix` sous Windows, puis le déposer sur
   <https://marketplace.visualstudio.com/manage> (même éditeur `emch04` que
   l'extension VS Code).
6. **Neovim, Helix, Emacs, Sublime Text** : rien à publier, les réglages sont
   lus dans ce dossier. Helix lit la grammaire sur la branche `main` de GitHub.
