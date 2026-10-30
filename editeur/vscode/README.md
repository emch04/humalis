# Humalis pour VS Code

Extension VS Code du langage Humalis (phases 1 à 3), et un serveur de
langage (LSP) pour les autres éditeurs.

## Ce qu'elle fait

- Reconnaît les fichiers `.humalis`.
- **Souligne les erreurs du compilateur** à la bonne ligne, avec son message
  en français (survol et onglet « Problèmes ») : erreurs du lexer et du parser,
  puis toutes les erreurs de l'analyse à la fois (variable non déclarée,
  élément introuvable, types…) en rouge, et les avertissements (page cible
  absente…) en jaune. Mis à jour 250 ms après la frappe.
- **Survol** d'un mot : sa fiche, prise dans la table de vocabulaire
  (`src/vocabulaire/table.ts`) et choisie selon la place (`texte` en tête de
  ligne est l'élément, après `avec` c'est le style) : description, exemple,
  code produit pour chaque cible (web, mobile, desktop, serveur, statique),
  statut (« prévu » pour un mot pas encore disponible). Survoler un nom
  (variable, page, route…) dit où il est déclaré.
- **Complétion selon la place** (Ctrl+Espace) : en début de ligne, les mots
  permis dans ce bloc (une page, un événement, le serveur, une route) ; après
  `avec`, les options et les styles ; après `couleur`, les couleurs ; après
  `quand`, les tournures d'événement ; après `est`, les comparaisons ; dans
  `vers "…"`, les pages ; dans une requête, les routes ; dans `clique sur "…"`,
  les éléments de la page ; à la place d'une valeur, les variables visibles à
  cet endroit ; après `p.`, les champs des données.
- **Saut à la déclaration** (F12, ou Ctrl+clic) : d'une variable à sa
  déclaration (y compris `{nom}` dans un texte), d'un `vers "panier"` à la page,
  d'un composant placé à sa définition, d'une route ou d'une donnée au serveur,
  de `p.prix` au champ, d'un `clique sur "Ajouter"` au bouton, et à travers
  `utiliser fichier` (un fichier ouvert et pas encore enregistré est lu dans
  l'éditeur).
- **Plan du document** (Ctrl+Maj+O, fil d'Ariane) : pages, composants, serveur
  avec ses données et ses routes, variables partagées.
- Colore le code : mots réservés, mots contextuels, `vrai` / `faux`, chaînes,
  `{variable}` dans les chaînes, nombres, commentaires `#`. La grammaire est
  **générée** depuis la table de vocabulaire (`npm run grammaire`). Une
  **coloration sémantique** s'y ajoute : une variable nommée comme un mot du
  vocabulaire (`nom`) est coloriée comme une variable.
- Indente de 4 espaces après une ligne qui finit par `:`, ferme `""`, `[]`, `{}`.
- Extraits de code : `page`, `variable`, `si`, `sinon`, `pour`, `quand`.

Le compilateur est inclus dans le paquet (`dist/extension.js` et
`dist/serveur-lsp.js`, fabriqués avec esbuild à partir de `../../src`). Le
survol, la complétion et le reste sont des fonctions pures, sans VS Code
(`src/langage/`), que l'extension et le serveur LSP appellent de la même façon.
Elles comprennent aussi un fichier en cours de frappe : une ligne fautive est
mise de côté le temps de lire le reste. Rien n'est publié.

## Construire

```
cd editeur/vscode
npm install
npm test          # génère la grammaire, lance les tests
npm run build     # dist/extension.js et dist/serveur-lsp.js
npm run paquet    # humalis-1.0.0.vsix
npm run essai:lsp # lance le serveur LSP construit et lui parle en JSON-RPC
```

## Installer

```
code --install-extension humalis-1.0.0.vsix
```

Ouvrir ensuite `exemples/boutique.humalis`, puis :

- survoler `bouton` : sa fiche s'affiche ;
- au bout de la ligne `bouton "Commander"`, taper ` ave` puis Ctrl+Espace :
  `avec` est proposé, avec sa fiche ;
- F12 sur `panier` dans `ajouter nom à panier` : le curseur va à la ligne 1 ;
- Ctrl+Maj+O : les pages `boutique` et `panier`, la variable `panier` ;
- passer l'indentation d'une ligne à 3 espaces : l'erreur est soulignée.

## Le serveur de langage, pour les autres éditeurs

`dist/serveur-lsp.js` parle le protocole LSP sur l'entrée et la sortie
standard (il ne demande que Node) :

```
node chemin/vers/editeur/vscode/dist/serveur-lsp.js --stdio
```

Il sert les diagnostics, le survol, la complétion, la définition, le plan du
document et la coloration sémantique. Il est écrit à la main (le transport
`Content-Length` et JSON-RPC tiennent dans `src/lsp/`), sans bibliothèque.

Neovim (0.11 et plus récent) :

```lua
vim.filetype.add({ extension = { humalis = 'humalis' } })
vim.lsp.config('humalis', {
  cmd = { 'node', '/chemin/vers/editeur/vscode/dist/serveur-lsp.js', '--stdio' },
  filetypes = { 'humalis' },
})
vim.lsp.enable('humalis')
```

Helix (`languages.toml`) :

```toml
[language-server.humalis]
command = "node"
args = ["/chemin/vers/editeur/vscode/dist/serveur-lsp.js", "--stdio"]

[[language]]
name = "humalis"
scope = "source.humalis"
file-types = ["humalis"]
indent = { tab-width = 4, unit = "    " }
language-servers = ["humalis"]
```

Ces deux configurations n'ont pas encore été essayées dans Neovim ou Helix ;
le serveur, lui, est essayé en vrai par `npm run essai:lsp`.

## Test dans un vrai VS Code

`npm run test:vscode` télécharge VS Code (`@vscode/test-electron`) et vérifie
que les diagnostics apparaissent et disparaissent, puis le survol de `bouton`,
la complétion de `ave`, F12 sur `panier` et le plan de `boutique.humalis`.
Sous Linux sans écran : `xvfb-run -a npm run test:vscode`.
# Formatage

La commande « Formater le document » utilise le formateur Humalis partagé avec la CLI. Le serveur de langage annonce aussi `textDocument/formatting`. Un document invalide reste intact ; le formatage travaille sur le texte ouvert dans l'éditeur.

Les fichiers `*.test.humalis` sont exécutés depuis le terminal avec `humalis tester` à la racine du projet. La commande compile l'application indiquée par `humalis.projet.json`, puis affiche pour chaque étape le fichier, la ligne et le nom du test.
