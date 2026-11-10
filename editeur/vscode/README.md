# Humalis pour VS Code

[Humalis](https://humalis.dev) est un langage en français pour créer une application complète : un site, une application mobile ou de bureau, et son serveur, à partir d'un seul programme.

Cette extension vous aide à l'écrire. Elle signale vos erreurs pendant que vous tapez, explique chaque mot du langage et complète ce que vous écrivez.

```humalis
page "accueil" :
    titre "Bienvenue"
    variable visites = 0
    bouton "Ajouter"
    quand l'utilisateur clique sur "Ajouter" :
        changer visites par visites + 1
    texte "{visites} visites"
```

## Ce qu'elle fait

- **Les erreurs en direct.** Le compilateur est inclus dans l'extension : rien d'autre à installer. Une erreur est soulignée en rouge et un avertissement en jaune, à la bonne ligne, avec une explication en français. Un fichier utilisé par un autre (`utiliser fichier "…"`) est vérifié avec tout son projet.
- **Une fiche sur chaque mot.** Survolez un mot pour lire ce qu'il fait, avec un exemple et ce qu'il produit sur chaque cible. Survolez une variable, une page ou une route pour voir où elle est déclarée.
- **Une complétion qui suit la place du curseur.** Dans une page, les éléments et les événements. Dans un serveur, ses données et ses routes. Après `avec`, les options et les styles. Dans `vers "…"`, vos pages. Après `p.`, les champs de la donnée.
- **Aller à la déclaration** (F12 ou Ctrl+clic) : d'une variable à sa déclaration, d'un lien à sa page, d'une requête à sa route, y compris d'un fichier à l'autre.
- **Le plan du document** (Ctrl+Maj+O) : pages, composants, serveur avec ses données et ses routes.
- **La coloration du code**, jusqu'aux textes et aux `{variable}`. Une variable qui porte le nom d'un mot du langage reste colorée comme une variable.
- **La mise en forme** avec la commande « Formater le document », la même que `humalis formater`. Un fichier qui contient une erreur n'est pas modifié.
- **Quelques aides à l'écriture** : l'indentation après une ligne qui finit par `:`, la fermeture de `""`, `[]` et `{}`, et des extraits pour `page`, `variable`, `si`, `sinon`, `pour` et `quand`.

## Tout le langage

L'extension connaît le langage de Humalis 1.9.0, y compris les constructions les plus récentes :

- **Les styles écrits en Humalis :** `style "carte" :` puis une propriété par ligne (`fond blanc`, `arrondi 12`, `ombre douce`).
- **Les conditions et les champs :** `si actif :`, `bouton "Payer" avec desactive si panier est vide`, `champ "Référence" avec desactive`, `champ "Nom" avec valeur nom`, `lien "Notre site" vers site`, `video "presentation.mp4" avec commandes`.
- **Les textes :** `{a la ligne}`, `{prix en lettres}`, `{jour en date longue avec majuscule}`, `initiales de nom`.
- **Le serveur :** `seul son auteur peut modifier et supprimer avis`, `donnees de depart pour produit :`, `telephone : texte (avant "tel")`.
- **Les langues :** `langues : francais, anglais avec adresse par langue`, et l'espagnol, le portugais, le swahili et le lingala.
- **Les messages d'un site :** `erreurs pendant 5 secondes`.
- **Les comptes :** `emails par brevo`, `invitations vers "bienvenue"`, `mot de passe oublie vers "bienvenue"`, `seul admin peut lire comptes`, et dans les pages `inviter champ "Adresse" comme admin`, `demander un lien de mot de passe pour champ "Email"`, `choisir le mot de passe avec champ "Nouveau"`.
- **Ce que le serveur décide :** `au depart "en_attente"`, `calcule somme prix de produit par refs`, `au plus prix de zone par commune`, `liste de texte du site`, `non vide`.
- **Les routes :** `tout le monde peut lire suivi par identifiant`, et `quand commande est cree :` suivi de `envoyer email …` ou `creer … avec … dans …`.

## Pour commencer

1. Installez l'extension.
2. Créez un fichier `accueil.humalis` et collez l'exemple ci-dessus.
3. Survolez `bouton` pour lire sa fiche, puis retirez une espace au début d'une ligne : l'erreur apparaît aussitôt.

Pour compiler et lancer votre programme, il vous faut la commande `humalis` :

```bash
npm install -g humalis
```

Les tests écrits en Humalis (`*.test.humalis`) se lancent depuis le terminal avec `humalis tester`.

Le guide complet est sur [humalis.dev](https://humalis.dev).

## Avec un autre éditeur

L'extension contient aussi un serveur de langage (LSP), qui ne demande que Node. Il offre les mêmes diagnostics, le survol, la complétion, la définition, le plan, la coloration et la mise en forme. Il se lance ainsi, depuis le dossier de l'extension installée :

```bash
node dist/serveur-lsp.js --stdio
```

Neovim (0.11 ou plus récent) :

```lua
vim.filetype.add({ extension = { humalis = 'humalis' } })
vim.lsp.config('humalis', {
  cmd = { 'node', '/chemin/vers/dist/serveur-lsp.js', '--stdio' },
  filetypes = { 'humalis' },
})
vim.lsp.enable('humalis')
```

Helix (`languages.toml`) :

```toml
[language-server.humalis]
command = "node"
args = ["/chemin/vers/dist/serveur-lsp.js", "--stdio"]

[[language]]
name = "humalis"
scope = "source.humalis"
file-types = ["humalis"]
indent = { tab-width = 4, unit = "    " }
language-servers = ["humalis"]
```

Ces deux réglages n'ont pas encore été essayés dans Neovim et Helix.

## Licence

Voir le fichier [LICENSE](LICENSE).
