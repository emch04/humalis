<p align="center">
  <img src="https://cdn.jsdelivr.net/npm/humalis@1/docs/logo/humalis-logo-carte.svg" alt="Humalis" width="360">
</p>

<p align="center"><a href="README.md">Français</a> · <strong>English</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/humalis"><img src="https://img.shields.io/npm/v/humalis" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Humalis%201.0-c1e928" alt="Licence"></a>
  <a href="https://github.com/emch04/framework"><img src="https://img.shields.io/badge/server-Astratra-6f42c1" alt="Astratra"></a>
  <a href="https://hub.xerj.org/contributors/emch04"><img src="https://hub.xerj.org/contributors/emch04/badge.svg" alt="XERJ Corpus Hub contributor"></a>
</p>

# Humalis

**One language, in French, to build a complete application**: a website, a mobile app, a desktop app and its server, all from the same file.

```humalis
page "shop" :
    titre "Our products"
    variable products = ["Book", "Pen", "Notebook"]
    pour chaque name dans products :
        texte name
    bouton "Order"
    quand l'utilisateur clique sur "Order" :
        afficher "Thank you for your order!"
```

The file reads like a sentence. Humalis turns it into a real project, with readable TypeScript code you can take over by hand. Its keywords are French (`titre` = title, `bouton` = button, `quand` = when); the texts your site shows can be in any language.

## Learn the language

The **[complete guide](docs/guide.en.md)** explains the whole language, from the first title to the server, with a checked example for every construct, and a table of the French keywords with their English meaning. It is also available in [French](docs/guide.md).

## Install

You need [Node.js](https://nodejs.org) 24 or later.

```sh
npm install -g humalis
```

## First project

```sh
humalis nouveau my-project
cd my-project
humalis developper
```

`humalis nouveau` ("new") creates the project; `humalis developper` ("develop") runs the site locally and recompiles it on every save.

## One source, several targets

```sh
humalis compile my-project.humalis --cible web --sortie my-project-web
humalis compile my-project.humalis --cible statique --sortie my-project-static
humalis compile my-project.humalis --cible mobile --sortie my-project-mobile
humalis compile my-project.humalis --cible desktop --sortie my-project-desktop
humalis compile my-project.humalis --cible serveur --sortie my-project-server   # if the file has a « serveur "…" : » block
```

`--cible` is the target, `--sortie` the output folder.

| Target | What Humalis produces |
|---|---|
| `web` | a React + Vite project, prerendered (one HTML page per address) |
| `statique` | static HTML, CSS and JavaScript pages, no build step |
| `serveur` | a Node server with the [Astratra](https://github.com/emch04/framework) packs (login, permissions, sessions) |
| `mobile` | an Expo app (iPhone, Android) |
| `desktop` | an Electron app (Mac, Windows, Linux) |

When a construct does not exist yet on a target, the compiler says so clearly instead of producing something wrong.

### Running each generated project

Each generated folder contains a `LISEZMOI.md` (read me) with these commands.

**Web**: a prerendered site, to put on any static host.

```sh
cd my-project-web && npm install
npm run dev      # locally
npm run build    # the final site, in dist/
```

**Static**: nothing to install. Open `index.html` in a browser, or upload the folder as it is to a host.

**Mobile**: you need [Expo Go](https://expo.dev/go) on the phone, or the iPhone simulator (Xcode, on a Mac) or the Android emulator.

```sh
cd my-project-mobile && npm install
npx expo start   # then « i » for iPhone, « a » for Android, or scan the code with Expo Go
```

**Desktop**: an Electron app, with a French menu.

```sh
cd my-project-desktop && npm install
npm start        # opens the app
npm run paquet   # the installer, in paquets/: .dmg on Mac, .exe on Windows, AppImage on Linux
```

The installer is built on the target system (the `.dmg` on a Mac, the `.exe` on Windows). To distribute it to other people, sign it (Apple or Windows certificate): see the [electron-builder](https://www.electron.build/code-signing) documentation.

**Server**: a Node server, generated from the file's `serveur "…" :` block. Its `LISEZMOI.md` lists the routes and who may do what.

```sh
cd my-project-server && npm install
cp .env.exemple .env      # then fill in JWT_SECRET and the administrator
npm test                  # checks every access rule
npm run build && npm start
```

Without `DATABASE_URL`, data stays in memory; with it, data goes to PostgreSQL.

## What the language can do

- **Pages and elements**: titles, text, images, buttons, links, forms, icons, tabs, carousel, charts, maps, sound.
- **Layout**: sections, rows, columns, grids, shared header and footer, content per device (`sur telephone :`).
- **Look**: a theme (colours, fonts, dark mode), named styles (`avec couleur bleu`), and your own CSS.
- **Logic**: variables, conditions (`si … et …`, `n'est pas`), loops, functions, lists (`trier`, `dont`, `grouper`), dates (`aujourd'hui plus 3 jours`), money (`{price en euros}`).
- **Data**: a server in the same file, or an existing API (`source "…"`), with loading and error states.
- **Interactions**: messages, dialogs and confirmations, keyboard shortcuts, search as you type, copy and share.
- **Quality**: accessibility checked at compile time, several languages (`titre "Welcome" en francais "Bienvenue"`), share previews and the sitemap.

Error messages are in French, with the line number, and often suggest the fix:

```
Erreur, ligne 3 : le texte utilise {totl}, mais la variable « totl » n'est pas déclarée. Peut-être « total » ?
```

## Commands

| Command | Role |
|---|---|
| `humalis nouveau <name>` | creates a project |
| `humalis developper` | runs the site and recompiles it on every save |
| `humalis compile <file> --cible …` | generates a target's project |
| `humalis verifier <file>` | shows errors and warnings |
| `humalis formater <file>` | reformats the file |
| `humalis tester` | runs the tests written in Humalis (`*.test.humalis`) in a browser |

## For AI assistants

The [`llms.txt`](llms.txt) file, shipped with the package, sums up the grammar, the pitfalls and the error messages, so that an assistant writes correct Humalis.

## Licence

[Humalis License](LICENSE.en.md) (the French text in [`LICENSE`](LICENSE) is authoritative): you may use, modify and share Humalis free of charge, but not sell it. Copyright 2026 The Humalis authors ("Les auteurs de Humalis"); Humalis was created by emch04 (see [`NOTICE`](NOTICE)).

The code Humalis produces (sites, apps, servers) belongs to you, with no obligations. The "Humalis" name and logo are not covered by the licence.
