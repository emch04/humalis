[Français](guide.md) · **English**

# The Humalis guide

This guide explains the whole language, from the first title to the server.
Every example is checked by the compiler each time Humalis changes: if it is
written here, it works.

Humalis is written in French: its keywords (`page`, `titre`, `bouton`,
`quand`…) are French words. The texts your site displays can be in any
language, and a site can offer several languages (see
[several languages](#28-several-languages)). The
[keyword table](#french-keywords-at-a-glance) gives the English meaning of
every word you will meet.

Read it in order, or jump straight to what interests you: each part stands on
its own.

## Contents

1. [Install and create a project](#1-install-and-create-a-project)
2. [Writing rules](#2-writing-rules)
3. [Pages](#3-pages)
4. [Elements](#4-elements)
5. [Styles](#5-styles)
6. [Layout](#6-layout)
7. [Interface elements](#7-interface-elements)
8. [Images, sound and motion](#8-images-sound-and-motion)
9. [Variables and calculations](#9-variables-and-calculations)
10. [Records, text, money and dates](#10-records-text-money-and-dates)
11. [Conditions](#11-conditions)
12. [Lists and loops](#12-lists-and-loops)
13. [Functions](#13-functions)
14. [Events](#14-events)
15. [Actions](#15-actions)
16. [Messages, dialogs and questions](#16-messages-dialogs-and-questions)
17. [Interactions](#17-interactions)
18. [Forms](#18-forms)
19. [Sharing and keeping values](#19-sharing-and-keeping-values)
20. [Navigation](#20-navigation)
21. [The server](#21-the-server)
22. [Connecting pages to the server](#22-connecting-pages-to-the-server)
23. [Using an existing API](#23-using-an-existing-api)
24. [Data from a file](#24-data-from-a-file)
25. [Choosing and uploading a file](#25-choosing-and-uploading-a-file)
26. [Charts](#26-charts)
27. [Maps](#27-maps)
28. [Several languages](#28-several-languages)
29. [Publishing a site](#29-publishing-a-site)
30. [Components and multi-file projects](#30-components-and-multi-file-projects)
31. [Testing in Humalis](#31-testing-in-humalis)
32. [Commands](#32-commands)
33. [What each target can do](#33-what-each-target-can-do)
34. [Capture application errors](#34-capture-application-errors)
35. [Recording and cropping media](#35-recording-and-cropping-media)

[French keywords at a glance](#french-keywords-at-a-glance)

---

## 1. Install and create a project

You need [Node.js](https://nodejs.org) 24 or later.

```sh
npm install -g humalis
humalis nouveau my-project
cd my-project
humalis developper
```

`humalis nouveau` ("new") creates a folder with a first file,
`my-project.humalis`. `humalis developper` ("develop") opens the site in your
browser and recompiles it every time you save: write, save, look.

### Running a file right away: the machine

To try a file without creating a project, without `npm install` and without a build:

```sh
humalis lancer my-file.humalis
```

The Humalis machine ("lancer" means "launch") compiles the file in memory, serves it at
`http://localhost:5173` (`--port` picks another port, `--ouvrir` opens the browser) and **writes
nothing to disk**. Every time you save, the page changes in under a second and keeps the value of its
variables as long as their declaration has not changed. A mistake shows over the page, with its file,
its line and the code at fault; the last version that worked stays alive until you fix it.

The `serveur` block runs too, in memory: data, routes, rights, roles, field rules, actions, summaries,
starting data, real time, scheduled tasks, accounts and session. At start the machine creates a test
account `admin@machine.humalis` and one per role (`gerant@machine.humalis`…); their password, drawn at
random on every launch, is printed in the terminal. When you change the program, the data and the
accounts stay. Everything is lost when you stop it.

The panel at `http://localhost:5173/__machine` shows the test accounts (and creates more), the outbox,
the data in memory, and what you start by hand.

**What the machine does not do for real.** It never fakes it silently: the command says so at start,
for what *your* file uses.

| In your file | What the machine does |
|---|---|
| e-mails (`envoyer email`, `inviter`, forgotten password) | no e-mail leaves: it is kept in the panel's outbox, with its link |
| notifications and live activities | none is pushed: kept in the outbox |
| payment (`payer`, `quand … est payee`) | the route answers 501; the panel marks a record "paid" by hand and runs what the program does next |
| PDF vouchers and documents, loyalty card, AI | the route answers 501 |
| Google or Apple sign-in | "not set up", like a server without credentials |
| secret-token sources (gateways) | 501: the secrets stay on the real server |
| external components (`utiliser composant …`) | refused with their line: the machine only runs Humalis, without npm. Use `humalis developper` |

The machine only listens on `localhost`. For a real project (npm, database, publishing), the next
steps are still `humalis developper` and `humalis compile`.

The same machine runs in a browser: `dist/navigateur.js` exports `Machine` and `brancherApercu`, which
show the app in an iframe through a Service Worker (`SERVICE_WORKER_JS`, to serve at the site root).
This is what the site's playground uses.

When you like the site, compile it to the target you want:

```sh
humalis compile my-project.humalis --cible web --sortie my-project-web
```

The targets (`--cible`) are `web`, `statique` (static), `mobile`, `desktop`,
`apple` and `serveur` (server); `--sortie` is the output folder. The
[README](../README.en.md) explains how to run each generated project.

---

## 2. Writing rules

### One block, four spaces

A line ending with `:` opens a block. Everything inside the block is indented
by **4 more spaces**. Never use tabs.

```humalis
page "home" :
    titre "Welcome"
    section "Opening hours" :
        texte "Monday to Saturday"
```

### Quotes

Text that is displayed goes between quotes: `titre "Welcome"`. Without quotes,
it is a variable name: `texte firstname` shows what the variable `firstname`
contains.

To put a quote inside a text, write `\"`:

```humalis
page "quote" :
    titre "A quote"
    texte "She said \"hello\" as she came in."
```

### Accents are allowed, never required

`si age est supérieur ou égal à 18` and `si age est superieur ou egal a 18`
read the same. Write whichever you like.

### Small words

`le`, `la`, `les`, `un`, `une`, `des`, `de`, `du`, `à`, `au`, `aux`, `l'`,
`d'`… (French for "the", "a", "of", "to"…) make sentences read naturally.
Humalis ignores them where they change nothing: `quand l'utilisateur clique`
and `quand utilisateur clique` are the same. For that reason they cannot be
used as variable names.

### Comments

A `#` outside quotes starts a comment, up to the end of the line. It is for
humans; Humalis ignores it.

```humalis
# The home page of the site
page "home" :
    titre "Article #1"    # the # between quotes stays text
```

### Names

Variable names are written in lowercase, with `_` between words:
`item_count`. Language keywords (`si`, `page`, `quand`…) cannot be used as
names.

---

## 3. Pages

A page (`page`) is a screen. Everything is written inside a page.

```humalis
page "home" :
    titre "Welcome to my site"
    lien "Contact us" vers "contact"

page "contact" :
    titre "Contact us"
    texte "Write to us, we answer within a day."
```

The first page of the file is the home page. A page's name is used by links
(`vers "contact"`, "to contact") and for its address (`/contact`). Each page
has a main title (`titre`): it names the browser tab.

[Navigation](#20-navigation) explains chosen addresses, restricted pages,
sub-pages and the "not found" page.

---

## 4. Elements

An element is something visible on a page. Write its name, then its content
between quotes.

### Title, subtitle and text

```humalis
page "menu" :
    titre "Our menu"
    soustitre "Starters"
    texte "Soup of the day, seasonal salad."
    soustitre "Desserts" avec niveau 3
    texte "Apple pie, vanilla ice cream."
```

`soustitre` (subtitle) opens a part of the page (level 2 by default, up to 6).
Keep the levels in order, without skipping: screen readers use them to move
through the page.

Inside a block placed under a subtitle, a `soustitre` goes down one level on its
own: a card in a section becomes level 3. In a `section`, the first subtitle is
the section's title, even when it sits in its own block; every other subtitle of
the section goes down one level. `avec niveau` (with level) still lets you
choose.

```humalis
page "home" :
    titre "Home"
    section :
        soustitre "Our pages"
        grille :
            bloc :
                soustitre "Examples"
                texte "Six apps to try."
```

In a `titre`, `soustitre`, or `texte`, `{accent "…"}` highlights a few words
with the brand color. Screen readers and the browser tab still get plain text.

```humalis
page "offer" :
    titre "A {accent "simple"} offer"
    texte "Price: {accent "free"} forever"
```

`{a la ligne}` starts a new line inside a text. `{saut de ligne}` does the
same.

```humalis
page "hours" :
    titre "Opening hours"
    texte "Monday to Friday: 9 am to 6 pm{a la ligne}Saturday: 10 am to 1 pm"
```

### Lists

`liste :` makes bullets; `liste numerotee :` numbers each item. Each instruction in the block becomes one item.

```humalis
page "guide" :
    liste :
        texte "Install Node.js"
        texte "Create the project"
    liste numerotee :
        texte "Write the file"
        texte "Compile"
```

### Code within a sentence

In text, a piece of code goes between backticks, as in every documentation:
it shows in a monospace font, as written, quotes and braces included.
`{code "…"}` does the same.

```humalis
page "guide" :
    texte "Write `titre` to add a heading."
    texte "A text: `texte "Hello {firstname}"`."
```

### Code block

`code language :` copies the indented lines without interpreting them; the language is optional.

```humalis
page "guide" :
    code humalis :
        page "home" :
            titre "Welcome"
```

`avec animation frappe` ("with typing animation") writes the code letter by
letter, with a cursor; `avec animation frappe au defilement` waits until the
block scrolls into view. The real code stays in place while it types (screen
readers, Copy button), and it shows at once if the person asked to reduce
motion. On a phone, the code shows in full.

```humalis
page "home" :
    code humalis avec animation frappe :
        page "shop" :
            titre "Our products"
            bouton "Order"
```

### Table

A table has a caption, columns, and rows of equal width. A translation may follow each cell.

```humalis
langues :
    francais
    anglais

page "guide" :
    tableau "Commands" en anglais "Commands" :
        colonnes "Command", "Role" en anglais "Role"
        rangee "humalis compile", "builds the project" en anglais "builds the project"
```

### Image

```humalis
page "profile" :
    titre "My profile"
    image "photo.png" avec description "Profile photo"
```

Every image has a `description`: it is what a screen reader reads, and what
shows if the image does not load. A purely decorative image is written
`avec decoratif`.

### Button and link

```humalis
page "home" :
    titre "Home"
    bouton "Get started"
    lien "Learn more" vers "about"

page "about" :
    titre "About"
```

A link (`lien`) goes to a page (`vers "about"`) or to a web address
(`vers "https://example.com"`). A button (`bouton`) triggers an action (see
[events](#14-events)).

Without quotes, `vers` reads the address from a variable or from a field of a
record (`fiche`):

```humalis
page "home" :
    variable site = "https://example.com"
    variable settings = fiche avec help "contact" et shop "https://example.com/shop"
    titre "Home"
    lien "Our website" vers site
    lien "Need help?" vers settings.help
    lien "The shop" vers settings.shop avec nouvel onglet

page "contact" :
    titre "Contact"
```

The address is read when the page is shown: if the variable changes, the link
follows. An address starting with `https://`, `http://`, `mailto:` or `tel:`
leaves the site; any other one (`"contact"`) is an address of the site. Any
other kind of address, such as `javascript:`, is dropped: the text stays,
without a link. The variable must hold a text.

A button can show only an icon: `bouton icone "fermer"`. It then needs a `nom`
(name). That is what a screen reader reads, and what the event targets.

```humalis
page "calendar" :
    variable open = vrai
    titre "Calendar"
    bouton icone "fermer" avec nom "Close the calendar"
    quand l'utilisateur clique sur "Close the calendar" :
        changer open par faux
```

`avec desactive` shows a button that cannot be clicked. With `si`, it follows a
condition: the button becomes clickable again as soon as the condition is false.

```humalis
page "cart" :
    variable cart = []
    titre "Cart"
    bouton "Pay" avec desactive si cart est vide et fond vert
    bouton "Pay in three instalments" avec desactive
```

The condition stops at the next `et`, which starts the next option. To combine
two conditions, put them in a `calcul` first, then simply write `desactive si`
followed by its name:

```humalis
page "order" :
    variable cart = []
    variable sending = faux
    calcul blocked = cart est vide ou sending
    titre "Order"
    bouton "Order" avec desactive si blocked
```

A disabled button stays visible, paler. `desactive` applies to a button and to
a field (see [Field](#field)).

### Field

A field (`champ`) is an area where people type. Its kind is written right
after `champ`:

```humalis
page "signup" :
    titre "Sign up"
    formulaire "signup" :
        champ "Name" avec obligatoire
        champ email "Email" avec indice "you@example.com"
        champ telephone "Phone"
        champ nombre "Age" avec minimum 0 et maximum 130
        champ date "Birth date"
        champ heure "Best time to call"
        champ mot de passe "Password"
        champ texte long "About you"
        champ adresse web "Website"
        bouton "Sign up"
    quand le formulaire "signup" est soumis :
        afficher "Welcome"
```

Each target picks the right input: the right keyboard on a phone, the right
field type in the browser. The kinds: `email`, `telephone`, `nombre` (number),
`date`, `heure` (time), `mot de passe` (password), `texte long` (long text),
`adresse web` (URL). The options: `obligatoire` (required), `indice "…"` (the
grey hint of an empty field), and for a number `minimum` and `maximum`.

`avec desactive` shows a field that cannot be filled in. With `si`, it follows
a condition, like a button. Every kind of field accepts it, as do choices,
drop-downs and checkboxes:

```humalis
page "profile" :
    variable locked = vrai
    titre "Profile"
    formulaire "profile" :
        champ "Username" avec desactive
        champ email "Email" avec desactive si locked
        case a cocher "Newsletter" avec desactive si locked
        bouton "Save"
    bouton "Edit"
    quand l'utilisateur clique sur "Edit" :
        changer locked par faux
    quand le formulaire "profile" est soumis :
        afficher "Profile saved"
```

A disabled field stays visible, paler. In the browser, it keeps the usual
behaviour of a disabled field.

### Choices

```humalis
page "order" :
    titre "Order"
    variable countries = ["France", "Belgium", "Switzerland"]
    formulaire "order" :
        choix "Size" parmi ["S", "M", "L"] avec obligatoire
        liste deroulante "Country" parmi countries avec indice "Pick a country"
        case a cocher "I accept the terms" avec obligatoire
        bouton "Order"
    quand le formulaire "order" est soumis :
        si champ "Size" est egal a "L" :
            afficher "Large size"
        afficher "Order sent"
```

`choix` is a set of options, `liste deroulante` a drop-down list, `case a
cocher` a checkbox; `parmi` means "among".

---

## 5. Styles

An element's options are written after `avec` ("with"), joined by `et`
("and").

```humalis
page "home" :
    titre "Welcome" avec couleur bleu et taille grande
    titre "Centred" avec position centree
    bouton "Confirm" avec fond vert et texte blanc
    bouton "Cancel" avec fond gris et bordure arrondie
```

`couleur` is the text colour, `fond` the background, `taille` the size,
`bordure arrondie` rounded corners. The colours: `bleu` (blue), `vert`
(green), `rouge` (red), `orange`, `jaune` (yellow), `violet`, `rose` (pink),
`gris` (grey), `noir` (black), `blanc` (white). The sizes: `petite` (small),
`moyenne` (medium), `grande` (large). Your theme's colours work too (see
[the theme](#the-theme)).

### Naming an element

`nom "…"` gives an element a name, so an action can target it:

```humalis
page "login" :
    titre "Log in"
    texte "Logging in…" avec nom "waiting"
    bouton "Log in" avec fond vert et nom "login"
    quand la page se charge :
        cacher "waiting"
    quand l'utilisateur clique sur "login" :
        montrer "waiting"
```

### One design per platform

The logic stays the same; only the design changes. `sur apple` means iPhone, iPad and Mac,
`sur ios` iPhone and iPad, `sur macos` Mac, `sur android` Android phones and tablets,
`sur windows` the Windows application,
`sur application` every native app, `sur site` the web. A phrase aimed at another platform
has no effect, and the most precise one wins.

So each target can have its own style sheet: a shared CSS (without `sur`) is still
possible, but it is not required.

```humalis
utiliser style "./site.css" sur site
utiliser style "./iphone.css" sur ios
utiliser style "./mac.css" sur macos
utiliser style "./android.css" sur android
utiliser style "./windows.css" sur windows

page "accueil" :
    bouton "Commander" avec style "principal" et sur apple style "plein-ecran" et sur windows style "large"
    sur application :
        texte "Thanks for using the app"
    sur site :
        lien "Install the app" vers "installer"
```

On the Apple target, each `.class { … }` rule becomes SwiftUI. What has no equivalent
(`@media`, hover, compound selectors, free positioning…) is counted at compile time and listed,
with its reason, in `CSS-SUR-APPLE.md`. The Android and Windows targets do the
same, in `CSS-SUR-ANDROID.md` and `CSS-SUR-WINDOWS.md`. A `sur android` stylesheet can be
the only one the Android application reads; if there is also a shared CSS, the Android
stylesheet comes after it.

### A style written in the platform's own language

When the translated style is not enough, write it in the platform's language: SwiftUI for
Apple, XAML for Windows. The file extension gives its language, and `sur` says which
platform it is for. The file is copied as is: a new SwiftUI or WPF feature can be used the
same day, without waiting for Humalis.

```humalis
style "carte" :
    fond blanc
    arrondi 8

utiliser style "./styles/apple.swift" sur apple
utiliser style "./styles/windows.xaml" sur windows

page "vitrine" :
    bloc avec style "carte" :
        bouton "Acheter" avec style "bouton-principal"
```

On Apple, a style is a `ViewModifier` named `Style` followed by the style's name in
PascalCase (`carte` → `StyleCarte`, `bouton-principal` → `StyleBoutonPrincipal`):

```swift
import SwiftUI

struct StyleCarte: ViewModifier {
    func body(content: Content) -> some View {
        content.padding(16).background(.background.secondary, in: RoundedRectangle(cornerRadius: 12))
    }
}
```

On Windows, a WPF resource dictionary, one `<Style>` per style, keyed by the style's name.
`TargetType` says what it dresses: `Button` for a button, `TextBlock` for a text or a title,
`Border` for a frame (Humalis then wraps the element, a block for instance). To keep the
Windows 11 look, start from the system style with `BasedOn`. A style that sets a background
without a text color gets readable text (dark on a light background, light on a dark one), in
light and dark themes alike. For a button, Humalis also derives the hover and pressed colors
from its background; to choose them yourself, set the Fluent theme brushes
`ButtonBackgroundPointerOver`, `ButtonBackgroundPressed`, `ButtonForegroundPointerOver` and
`ButtonForegroundPressed` in `<Style.Resources>`.

```xml
<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
                    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
    <Style x:Key="carte" TargetType="Border">
        <Setter Property="Background" Value="White"/>
        <Setter Property="CornerRadius" Value="12"/>
        <Setter Property="Padding" Value="16"/>
    </Style>
    <Style x:Key="bouton-principal" TargetType="Button" BasedOn="{StaticResource {x:Type Button}}">
        <Setter Property="Background" Value="SeaGreen"/>
    </Style>
</ResourceDictionary>
```

On its platform, the native style wins over the Humalis style or the CSS of the same name;
elsewhere nothing changes. A file for `sur ios` or `sur macos` only is added on top of the
translated style on that device, without replacing it. In a `dessinee pour` page, the
native style is added on top of the CSS drawing. An error in the file stops the project
build (Xcode, Gradle or `dotnet build`), with its line.

On Android, a style is a `Modifier` extension named like the style (`carte` → `carte`,
`bouton-principal` → `boutonPrincipal`), in a `.kt` file given with
`utiliser style "./styles/android.kt" sur android`. Humalis places the file in the app's
package: do not write a `package` line in it.

```kotlin
fun Modifier.carte(): Modifier = this
    .shadow(4.dp, RoundedCornerShape(12.dp))
    .background(Color.White, RoundedCornerShape(12.dp))
    .padding(16.dp)
```

A block dressed by a Kotlin style keeps the width of its content: add `.fillMaxWidth()`
to the style to make it full width. Under Compose, a button's color goes through its
parameters, not through a `Modifier`.

One block can target several platforms: join them with `et`.

```humalis
page "home" :
    titre "My calendar"
    sur site et macos :
        texte "Drag an appointment to move it."
    sur ios :
        texte "Tap an appointment to move it."
```

### A drawn page

`dessinee pour 1440 par 900`, after a page name, gives the size the page was
drawn for. In the Apple app, the page then follows its CSS to the point. On the
website and the other targets, nothing changes.

- **On Mac**, the page keeps the width of the drawing and grows with the window.
- **On iPhone and iPad**, it renders as Safari would on the same device: one CSS
  pixel per screen point. `@media (min-width: …)` and `@media (max-width: …)`
  rules follow the real screen width, and change live when the device turns or
  the iPad screen is split. Content stays inside the safe area (notch, bottom
  bar) and the page background runs underneath. A page taller than the screen
  scrolls, and the keyboard never hides the field being typed in. A button or a
  link smaller than 44 points can still be tapped: its touch area grows, not its
  drawing.
- **Everywhere**, `@media (prefers-color-scheme: dark)` follows the device's dark
  mode, live.

The page starts from the same point as the website: the browser's default
margins (paragraphs, headings), Humalis's base stylesheet and the theme, then the
project's CSS. `box-sizing` is honoured, and `env(safe-area-inset-…)` is 0, as in
Safari. Each element sits in the same structure as on the website:
`main.humalis-page` around the page, `header.humalis-entete` for the sidebar,
`label.humalis-champ` around a field. Fields, drop-down lists, checkboxes and
forms therefore follow their CSS. On the website, a sidebar fixed to the left
leaves room through a margin on the page; in the app, the sidebar already sits
beside it, and that margin loses its width.

To check it, `node scripts/essai-apple-dessin.mjs page.humalis` measures the same
page on the website (in Chrome) and in the app (`--appareil "…"` for a simulator,
`--mac`, `--sombre`, `--web`), then compares where each element sits, to the
point.

Each device has its own CSS: `utiliser style "./ios.css" sur ios` only applies on
iPhone and iPad, `sur macos` only on Mac, and a shared CSS stays optional. The
`sur ios :` and `sur macos :` blocks of a drawn page, and `sur ios style "…"`
styles, follow the same rule. Pages that are not drawn keep their native look.

```humalis
utiliser style "./site.css"
utiliser style "./ios.css" sur ios

page "home" dessinee pour 1440 par 900 :
    titre "Dashboard" avec style "title"
    sur ios :
        texte "Welcome on iPhone"
```

With drawn pages, `barre laterale :` at the top of the file writes the sidebar
like a page: on Mac, and on iPad as long as the CSS shows it at that width. On
iPhone, or when the CSS hides it, the app keeps its native navigation. On the
other targets, it takes the header's place when the project has none; if there
is an `entete`, it steps aside.

```humalis
utiliser style "./desktop.css"

barre laterale avec style "sidebar" :
    lien "Dashboard" vers "home"
    lien "Customers" vers "customers"

page "home" dessinee pour 1440 par 900 :
    titre "Dashboard"

page "customers" dessinee pour 1440 par 900 :
    titre "Customers"
```

`utiliser icones "./icons.svg"`, at the top of the file, adds the project's own
drawings: each `<symbol id="bell">` in the file becomes an icon, used like the
others (`icone "bell"`, `bouton "Alerts" avec icone "bell"`).

### A style written in Humalis

`style "card" :` at the top of the file describes a style in French words, one
property per line. Apply it with `avec style "card"`, on an element or a block.

```humalis
theme :
    couleur marque "#4b42d6"

style "card" :
    fond blanc
    bord 1 gris clair
    arrondi 12
    espace interieur 16
    ombre douce

style "price" :
    couleur marque
    gras
    taille 20

page "shop" :
    titre "Shop"
    bloc avec style "card" :
        texte "Notebook"
        texte "€12" avec style "price"
```

The properties: `fond` (background), `couleur` (text colour), `bord` (border: a
width, then a colour), `arrondi` (corner radius), `espace interieur` (padding),
`marge` (margin), `ombre` (shadow: `douce`, `forte` or `aucune` for soft, strong
or none), `taille` (font size), `gras` (bold), `largeur maximale` (maximum
width) and `alignement` (`centre`, `gauche` or `droite`).

Sizes are in points. `arrondi`, `espace interieur` and `marge` take one to four
numbers, as in CSS.

A colour is a name (`bleu`, `gris`…), optionally followed by `clair` (light) or
`fonce` (dark), a theme colour, or a code in quotes (`"#1f5fbf"`). A theme colour
also follows dark mode.

The style becomes an ordinary CSS class. So it works on every target, phones
included.

### Your own CSS

A `style :` block at the top of the file holds ordinary CSS. Apply it with
`avec style "…"`:

```humalis
style :
    .big { font-size: 3rem; }
    .main { border: 2px solid navy; }

page "home" :
    titre "Welcome" avec style "big"
    bouton "Confirm" avec fond vert et style "main"
```

CSS can also come from a file: `utiliser style "./theme.css"` at the top of
the file. CSS applies to the web, static and desktop targets; mobile only
translates named styles (colour, background, size, position, border).

A form and a breadcrumb take a style too:
`formulaire "order" avec style "card" :`, `fil d'Ariane avec style "quiet" :`.

`humalis verifier` warns when a class used with `avec style` is missing from
the project's CSS and suggests a close name. It also warns when an
`!important` rule targets a `.humalis-…` class: remove `!important` or use
your own class.

---

## 6. Layout

### Blocks

- `section "…" :` a part of the page, with its heading;
- `bloc :` a box;
- `ligne :` elements side by side (a row);
- `colonne :` elements one below the other (a column);
- `grille :` cells that arrange themselves according to the screen width (a
  grid).

```humalis
page "home" :
    titre "The Corner Café"
    section "Our house" :
        texte "Seasonal cooking in the heart of the city."
        ligne :
            lien "See the menu" vers "home"
            lien "Book a table" vers "home"
    section "Our dishes" :
        grille avec colonnes 3 et espacement moyenne :
            bloc avec ombre legere et bordure douce et remplissage moyenne :
                texte "Mushroom risotto"
            bloc avec ombre legere et bordure douce et remplissage moyenne :
                texte "Vegetable tart"
            bloc avec ombre legere et bordure douce et remplissage moyenne :
                texte "Fish of the day"
```

Block settings: `largeur` (width: `etroite` narrow, `large` wide),
`remplissage` (padding) and `espacement` (spacing): `petite`, `moyenne`,
`grande`; `colonnes` (columns), `ombre` (shadow: `legere` light, `moyenne`),
`bordure douce` (soft border), `repartition entre` (space between),
`alignement centre` (centred), `degrade bleu vers violet` (gradient), `colle`
(sticks to the top while scrolling).

### A page that fits the screen

`entete avec fixe :` (fixed header) keeps the header still: only the area below
scrolls, with its own scrollbar. `hauteur ecran` (screen height) makes a block
fill the screen under the header, and `defilement interne` (inner scrolling)
gives a block its own scrolling without moving the rest. Together they make a
documentation page: the table of contents and the text each scroll on their own,
without a line of CSS.

```humalis
entete avec fixe :
    lien "Home" vers "guide"

page "guide" :
    titre "The guide"
    ligne avec hauteur ecran :
        menu vertical avec defilement interne :
            lien "Install" vers "guide"
            lien "Pages" vers "guide"
        colonne avec defilement interne :
            texte "A long chapter that scrolls on its own."
```

On the static target, the scrollbar stays the window's. On a phone,
`hauteur ecran` takes the visible height of the page (under the navigation bar or
the header), and a `defilement interne` block scrolls on its own, under the finger.

### Depending on the device

```humalis
page "home" :
    titre "Home"
    sur telephone :
        bouton "Menu"
    sur tablette ou ordinateur :
        ligne :
            lien "The menu" vers "home"
            lien "Book" vers "home"
```

`sur telephone` (on phone), `sur tablette` (tablet), `sur ordinateur`
(computer).

### The theme

A `theme :` block at the top of the file sets the colours, fonts and mode
(light, dark or automatic) of the whole application:

```humalis
theme :
    couleur marque clair "#0e5a6b" sombre "#5fc3d6"
    couleur sable "#f3e9d2"
    police titres "Georgia"
    mode automatique
    largeur large

page "home" :
    titre "The Corner Café" avec couleur marque
    bouton "Book" avec fond sable et couleur marque
    bouton "Dark mode"
    quand l'utilisateur clique sur "Dark mode" :
        changer theme par sombre
```

`couleur marque clair "…" sombre "…"` names a colour (`marque`, "brand") with
a light (`clair`) and dark (`sombre`) value; `police titres` is the headings
font. Humalis checks contrast: a text colour too pale for its background is
reported at compile time.

A font can be shipped with the site, without relying on an outside service:
`police titres "Space Grotesk" depuis "./polices/space-grotesk.woff2"` (`.woff2`,
`.woff`, `.ttf` or `.otf` files).

Visitors can also switch themes. `basculer theme` ("toggle theme") switches to
the opposite of the theme being shown, and `si theme est sombre :` (or `clair`)
reacts to the theme on screen:

```humalis
theme :
    mode automatique

page "home" :
    titre "Home"
    bouton "Change theme"
    quand l'utilisateur clique sur "Change theme" :
        basculer theme
    si theme est sombre :
        texte "Good evening"
    sinon :
        texte "Good day"
```

### Shared header and footer

`entete :` (header) and `pied :` (footer) appear on every page. A page can
leave them out with `sans entete` or `sans pied`. With a header, Humalis adds a
"Skip to content" link on its own, hidden until the keyboard reaches it: it lets
keyboard users jump past the header.

```humalis
entete avec colle :
    ligne avec repartition entre :
        lien "The Corner Café" vers "home"
        lien "The menu" vers "menu"

pied :
    texte "Open Monday to Saturday"

page "home" :
    titre "Welcome"

page "menu" :
    titre "The menu"

page "login" sans entete et sans pied :
    titre "Log in"
```

---

## 7. Interface elements

Everything a complete site needs, without installing anything.

```humalis
page "product" :
    variable rating = 3
    variable quantity = 1
    variable upload = 40
    calcul total = quantity * 24
    titre "Desk lamp"
    ligne :
        icone "panier" avec taille grande et description "Cart"
        badge "New" avec fond vert
        avatar "Sam Taylor"
    etoiles rating avec modifiable
    compteur quantity avec minimum 1 et maximum 10 et description "Quantity"
    texte "Total: {total en euros}"
    progression upload avec pourcentage et maximum 100
    chargement "Loading reviews…"
    code qr "https://example.com/lamp" avec taille petite et description "Link to this product"
    bouton "Add to cart" avec icone "plus"
```

`icone` (icon), `badge`, `avatar`, `etoiles` (star rating, `modifiable` lets
people rate), `compteur` (quantity stepper), `progression` (progress bar),
`chargement` (loading indicator), `code qr` (QR code).

### Tabs, collapsible sections and carousel

```humalis
page "help" :
    titre "Help"
    onglets :
        onglet "Delivery" avec icone "document" :
            texte "Delivered in three working days."
        onglet "Returns" :
            texte "Thirty days to change your mind."
    deroulant "How do I order?" :
        texte "Add a product to your cart, then confirm."
    accordeon :
        deroulant "Cancellation" avec ouvert :
            texte "Up to 24 hours before shipping."
        deroulant "Payment" :
            texte "By card or bank transfer."
    carrousel avec automatique 5 et visibles 1 :
        image "room.jpg" avec description "The dining room"
        image "terrace.jpg" avec description "The terrace"
```

`onglets`/`onglet` (tabs), `deroulant` (collapsible section, `ouvert` = open),
`accordeon` (accordion), `carrousel` (carousel: `automatique 5` turns every 5
seconds, `visibles 1` shows one item at a time).

### Native components

These phrases describe an intent. Each platform uses its real component, and the web a simple
equivalent.

| Phrase | iPhone and iPad | Mac | Android | Web |
|---|---|---|---|---|
| `onglets de l'application :` then `onglet "A" vers "accueil" avec icone "maison"` | tab bar | sidebar | bottom tab bar | menu |
| `groupe "Team" :` then its `onglet` lines, indented, inside `onglets de l'application` | flat tabs | flat list | flat tabs | heading in the menu |
| `onglets de l'application avec barre laterale "MySidebar" :` | no effect | sidebar drawn by the Swift view `MySidebar`, which gets the page as its content | no effect | no effect |
| `recherche dans q avec indice "…"` | native search | native search | field | field |
| `action en glissant "Delete" :` inside a `pour chaque` | swipe the row | right-click | swipe the row | button |
| `actualiser en tirant :` | pull to refresh | button in the toolbar | pull to refresh | button |
| `menu d'options :` then `option "Copy" :` under an element | long press | right-click | long press | drop-down menu |
| `formulaire "x" en reglages :` then `groupe "Profile" :` | Settings-style form | grouped form | form | form |
| `etat vide "Nothing" avec icone "boite" et description "…"` | empty screen | empty screen | empty screen | block |
| `avec fond translucide` | glass or material | glass or material | veiled background | blur |
| `table l :` then `colonne "Total" avec c.total` | rows | table | rows | rows |
| `menu de l'application "File" :` then `commande "N" avec raccourci "cmd+n" :` | shortcuts (iPad) | menu bar | “⋮” menu and shortcuts | refused |
| `page "x" en reglages :` | page | Settings window | page | page |
| `page "x" en pleine fenetre :` | page up to the edges | page up to the edges | page | page (no effect) |
| `page "x" dessinee pour 1440 par 900 :` | its CSS to the point, at the screen width | its CSS to the point, scaled to the window | page (no effect) | page (its CSS) |
| `barre d'outils :` | top bar | toolbar | row | row |

The application menu has no web equivalent: the compiler refuses it.

### Breadcrumb and menu

```humalis
page "home" :
    menu :
        lien "Home" vers "home"
        lien "The menu" vers "menu"
    titre "Home"

page "menu" :
    fil d'Ariane :
        lien "Home" vers "home"
        texte "The menu"
    titre "The menu"
```

`fil d'Ariane` is a breadcrumb. In a `menu`, the link to the current page is
marked as active. The links of a menu wrap when space runs out. A `menu
vertical :` stacks its links in a column and never starts a second column: a
table of contents with a limited height scrolls. It combines with `repliable`
(`menu vertical repliable :`).

```humalis
page "guide" :
    titre "The guide"
    menu vertical :
        lien "Install" vers "guide"
        lien "Pages" vers "guide"
```

A `menu repliable :` (collapsible menu) folds behind a burger button (named
"Menu" for screen readers) on a small screen (phone); the icon turns into a cross
while the menu is open. Choosing a link, tapping outside or pressing Escape
closes it. On a large screen it stays open:

```humalis
page "home" :
    menu repliable :
        lien "Home" vers "home"
        lien "The menu" vers "home"
        lien "Book" vers "home"
    titre "Home"
```

---

## 8. Images, sound and motion

### Images

```humalis
page "gallery" :
    titre "Gallery"
    image "shopfront.jpg" avec description "The shop front" et proportions 16 sur 9 et prioritaire
    image "pattern.svg" avec decoratif
```

`proportions 16 sur 9` (16 by 9) reserves the image's space before it loads
(the page does not jump). `prioritaire` (priority) loads it first: keep it for
images at the top of the page.

### Sound

```humalis
page "listen" :
    titre "Listen"
    audio "excerpt.mp3" avec description "Concert excerpt, two minutes"
    audio "interview.mp3" avec description "Interview with the chef" et transcription "Hello and welcome."
```

A sound never starts on its own. Speech has its `transcription`, for people
who cannot hear it.

### Video

```humalis
page "workshop" :
    titre "The workshop"
    video "workshop.mp4" avec commandes et description "A tour of the workshop, one minute"
    video "recipe.mp4" avec commandes et description "The bread recipe" et transcription "Mix the flour and the water." et boucle
```

A video needs `avec commandes`: it has its play and pause buttons, and never
starts on its own. Its `description` is required too: it names the player for
screen readers.

`transcription` adds the text of what is said; `boucle` (loop) restarts the
video at the end. Accepted formats: `.mp4`, `.webm`, `.mov` and `.m4v`.

### Motion

```humalis
page "home" :
    titre "The Corner Café" avec animation apparition
    texte "Seasonal cooking." avec animation montee et delai court
    bouton "Book" avec transition douce et effet agrandi
    bloc avec animation montee au defilement et effet leve :
        texte "Appears when you scroll to it."
```

Animations: `apparition` (fade in), `montee` (slide up), `agrandissement`
(grow); `au defilement` plays it when scrolled into view. Hover effects:
`agrandi` (grow), `leve` (lift). Humalis respects the person's "reduce motion"
setting.

On a block, `et en cascade` ("and in a cascade") makes its children appear one
after another:

```humalis
page "home" :
    titre "Our dishes"
    grille avec animation montee au defilement et en cascade :
        texte "Soup of the day"
        texte "Risotto"
        texte "Apple pie"
```

---

## 9. Variables and calculations

### Variables

```humalis
page "profile" :
    variable score = 12
    variable firstname = "Sam"
    variable logged_in = faux
    variable price = 12,50
    titre "Hello {firstname}!"
    texte "Your score: {score}"
```

A variable (`variable`) holds a number, a text, `vrai` (true) or `faux`
(false), a list, a record, or `rien` (nothing). Decimal numbers use a comma,
the French way: `12,50`. Inside a text, `{firstname}` shows the variable's
value.

A name cannot be one of the small French words Humalis skips so the code reads
like a sentence: `le`, `la`, `les`, `un`, `une`, `des`, `de`, `du`, `a`, `au`,
`aux`, `se`. Write `variable total = 0`, not `variable a = 0`.

### Changing a variable

```humalis
page "counter" :
    variable clicks = 0
    titre "Counter"
    texte "You clicked {clicks} times"
    bouton "Click"
    bouton "Reset"
    quand l'utilisateur clique sur "Click" :
        changer clicks par clicks + 1
    quand l'utilisateur clique sur "Reset" :
        changer clicks par 0
```

`changer clicks par …` means "change clicks to …".

### Calculations that update themselves

`calcul` declares a value computed from others: it updates when they change.

```humalis
page "cart" :
    variable price = 12
    variable quantity = 3
    calcul total = price * quantity
    titre "Cart"
    texte "Total: {total}"
    bouton "One more"
    quand l'utilisateur clique sur "One more" :
        changer quantity par quantity + 1
```

Operations: `+`, `-`, `*`, `/` and parentheses. Numbers are displayed the
French way: `14 000`, `4,5`.

### Constants

A `constante` never changes. Written at the top of the file, it serves every
page.

```humalis
constante shipping = 5

page "cart" :
    variable price = 40
    calcul total = price + shipping
    titre "Cart"
    texte "Shipping: {shipping en euros}"
    texte "Total: {total en euros}"
```

Written at the top of the file, before the pages, a calculation applies to every
page, the header and the footer:

```humalis
variable cart = [] avec partagee
calcul items = nombre de cart

page "home" :
    titre "Home"
    texte "{items} items"
```

Between braces, a text also accepts a calculation: `{nombre de cart}`,
`{row.price * row.quantity}`, `{price * 2 en euros}`.

### Number calculations

```humalis
page "grades" :
    variable grades = [12, 15, 9]
    variable roll = 1
    calcul average = moyenne de grades
    calcul rounded = arrondi de average a 1 chiffres
    calcul best = maximum de grades
    calcul total = somme de grades
    titre "My grades"
    texte "Average {rounded}, best {best}, total {total}"
    texte "Dice: {roll}"
    bouton "Roll the dice"
    quand l'utilisateur clique sur "Roll the dice" :
        changer roll par hasard entre 1 et 6
```

On a list of records or data, these calculations read a field: `somme de panier.prix`, even when `panier` starts empty (`variable panier = []`).

`moyenne de` (average of), `arrondi de … a 1 chiffres` (rounded to 1 digit),
`maximum de`, `minimum de`, `somme de` (sum of), `hasard entre 1 et 6`
(random between 1 and 6).

---

## 10. Records, text, money and dates

### Records

A record (`fiche`) groups several values under one name. Read each value with
a dot.

```humalis
page "customer" :
    variable customer = fiche avec name "Sam" et city "Leeds" et address (fiche avec street "Lime Street" et number 12)
    titre "Customer"
    texte "{customer.name}, {customer.address.number} {customer.address.street}, {customer.city}"
    bouton "Move"
    quand l'utilisateur clique sur "Move" :
        changer customer.city par "York"
```

### Text

```humalis
page "text" :
    variable name = "Sam Taylor"
    calcul loud = majuscules de name
    calcul quiet = minuscules de name
    calcul size = longueur de name
    calcul polite = remplacer "Sam" par "Mr" dans name
    titre "Text"
    texte "{loud}, {quiet}, {size} letters, {polite}"
    si name contient "Taylor" :
        texte "The Taylor family"
```

`majuscules de` (uppercase), `minuscules de` (lowercase), `longueur de`
(length), `remplacer "a" par "b" dans …` (replace), `contient` (contains).

`initiales de` keeps the first letter of each word: "Head Office" gives "HO".

```humalis
page "team" :
    variable department = "Head Office"
    calcul short = initiales de department
    titre "The team"
    texte "{short}: {department}"
```

### Money and plurals

Inside a text, `{price en euros}` writes an amount, and `{count item}` agrees
the word with the number: "1 item", "3 items".

```humalis
page "cart" :
    variable price = 1234,5
    variable count = 3
    titre "Cart"
    texte "{count item} for {price en euros}"
```

The currencies: `euros`, `dollars` and `FC` (Congolese franc). Amounts follow
the page's language (`1 234,50 €` on a French page, `€1,234.50` on an English
one); the plural follows it too.

`{total en lettres}` writes a number in words: 71 gives "soixante et onze" on a
French page, "seventy-one" on an English one. `avec majuscule` capitalises the
first letter.

```humalis
page "cheque" :
    variable total = 80
    titre "Cheque"
    texte "{total en lettres avec majuscule} euros"
```

### Dates

```humalis
page "delivery" :
    variable ordered = maintenant
    calcul day = aujourd'hui
    calcul delivery = aujourd'hui plus 3 jours
    calcul reminder = delivery moins 1 semaine
    calcul wait = jours entre day et delivery
    titre "Delivery"
    texte "Delivered on {delivery}, in {wait} days"
    texte "Ordered {ordered depuis}"
```

`maintenant` (now), `aujourd'hui` (today), `plus 3 jours` (plus 3 days),
`moins 1 semaine` (minus 1 week), `jours entre` (days between). Dates follow
the page's language ("2 novembre 2026" in French, "2 November 2026" in
English); `{ordered depuis}` writes "il y a 5 minutes" on a French page,
"5 minutes ago" on an English one. You can shift by `jours` (days), `semaines` (weeks)
or `mois` (months).

`{day en date longue}` writes the date with the day of the week: "lundi 9
novembre" in French, "Monday 9 November" in English. `avec majuscule`
capitalises the first letter, for the start of a sentence.

```humalis
page "calendar" :
    calcul day = aujourd'hui
    titre "Calendar"
    texte "{day en date longue avec majuscule}"
```

`en date longue`, `en lettres`, `avec majuscule` and `initiales de` follow the
page's language (see [several languages](#28-several-languages)).

---

## 11. Conditions

```humalis
page "result" :
    variable grade = 8
    titre "Result"
    si grade est inferieure a 10 :
        texte "Needs work"
    sinon :
        texte "Passed"
```

`si` means "if", `sinon` "otherwise".

### Comparisons

| Write | Meaning |
|---|---|
| `est egal a` | = |
| `est different de` | ≠ |
| `est superieur a`, `est inferieur a` | > and < |
| `est superieur ou egal a`, `est inferieur ou egal a` | ≥ and ≤ |
| `est vide` | an empty list or text |
| `est rien` | no value |
| `est vrai`, `est faux` | for `vrai` and `faux` |
| the name alone (`si actif :`) | same as `est vrai` |
| `est dans [ … ]` | is one of the list |
| `contient` | the text or list contains |

The feminine forms `supérieure` and `inférieure` work too.

### Combining and negating

```humalis
page "stock" :
    variable stock = 3
    variable price = 15
    variable category = "dresses"
    variable cart = ["Dress"]
    titre "Stock"
    si stock est superieur a 0 et price est inferieur a 20 :
        texte "Good deal"
    si stock est inferieur ou egal a 5 et stock est superieur a 0 :
        texte "Almost sold out"
    si cart est vide ou stock est egal a 0 :
        texte "Nothing to order"
    si category est dans ["dresses", "skirts"] :
        texte "Fashion"
    si cart n'est pas vide :
        texte "Cart filled"
```

`et` (and) comes before `ou` (or), as in mathematics. `n'est pas` means "is
not".

A value that is `vrai` (true) or `faux` (false) can be tested on its own:
`si actif :` means `si actif est vrai :`, and `si non actif :` its opposite. It
combines like a comparison, with `et` and `ou`, and also works for a record's
field (`si p.actif :`).

A calculation can hold the result of a comparison: it is `vrai` or `faux`, and
can then be read in a `si`. `non` (not) gives the opposite of a true or false
value.

```humalis
page "shop" :
    variable open = faux
    variable role = "manager"
    variable holidays = faux
    calcul is_boss = role est dans ["manager", "director"]
    calcul closed = non open
    calcul paused = closed ou holidays
    titre "Shop"
    si is_boss :
        bouton "Open or close"
    si closed et non holidays :
        texte "Closed for today"
    si paused :
        texte "Back soon"
    quand l'utilisateur clique sur "Open or close" :
        changer open par non open
```

Such a calculation is not a number: `is_boss * 2` is refused at compile time.
On its own, a number or a text is not a condition: `si price :` is refused;
write a comparison instead (`si price est superieur a 0 :`).

---

## 12. Lists and loops

### Showing a list

```humalis
page "products" :
    variable products = ["Apple", "Banana", "Orange"]
    titre "Our fruit"
    pour chaque name dans products :
        texte name
```

`pour chaque … dans …` means "for each … in …".

### Adding, removing, counting

```humalis
page "cart" :
    variable cart = []
    calcul total = nombre de cart
    titre "Cart"
    texte "{total item} in the cart"
    bouton "Add an apple"
    bouton "Remove an apple"
    quand l'utilisateur clique sur "Add an apple" :
        ajouter "Apple" à cart
    quand l'utilisateur clique sur "Remove an apple" :
        retirer "Apple" de cart
    si cart est vide :
        texte "The cart is empty"
```

`ajouter … à` (add to), `retirer … de` (remove from), `nombre de` (count of).

### Sorting, filtering, picking

```humalis
page "catalogue" :
    variable products = [fiche avec name "Book" et price 12, fiche avec name "Pen" et price 2, fiche avec name "Notebook" et price 5]
    calcul by_price = trier products par price
    calcul priciest_first = trier products par price decroissant
    calcul cheap = products dont price est inferieur a 10
    calcul showcase = les 2 premiers de by_price
    calcul book = premier de products dont name contient "Bo"
    calcul sale = products dont price est inferieur a 10 et name contient "P"
    calcul small = trier (products dont price est inferieur a 10) par price
    titre "Catalogue"
    texte "Found: {book.name}"
    pour chaque p dans showcase :
        texte "{p.name}: {p.price en euros}"
```

`trier … par` (sort by, `decroissant` descending), `dont` (whose: filters a
list), `les 2 premiers de` (the first 2 of), `premier de` (first of).

### Grouping

```humalis
page "departments" :
    variable products = [fiche avec name "Dress" et category "Fashion", fiche avec name "Lamp" et category "Home", fiche avec name "Skirt" et category "Fashion"]
    calcul departments = grouper products par category
    titre "Our departments"
    pour chaque department dans departments :
        soustitre department.nom
        pour chaque p dans department.elements :
            texte p.name
```

`grouper … par` (group by) gives a list of groups; each group has a `nom`
(its name) and its `elements`.

### Loops inside an action

Inside an event or a function you can also repeat, loop while a condition
holds, and choose according to a value:

```humalis
page "game" :
    variable points = 0
    variable day = "saturday"
    titre "Game"
    texte "Points: {points}"
    bouton "Play"
    quand l'utilisateur clique sur "Play" :
        repeter 3 fois :
            changer points par points + 1
        tant que points est inferieur a 10 :
            changer points par points + 2
        selon day :
            cas "saturday" ou "sunday" :
                afficher "Have a nice weekend"
            cas "monday" :
                afficher "Have a nice week"
```

`repeter 3 fois` (repeat 3 times), `tant que` (while), `selon … cas …`
(switch … case …). `arreter` leaves a loop; `passer au suivant` skips to the
next turn.

`selon` also works in a page, to show what matches a value:

```humalis
page "order" :
    variable status = "delivered"
    titre "Order"
    selon status :
        cas "delivered" :
            texte "Your order has arrived."
        cas "cancelled" ou "refused" :
            texte "Your order did not go through."
        sinon :
            texte "Your order is on its way."
```

`non` reverses a condition: `si non active :` or `si non price est egal a 0 :`.

---

## 13. Functions

### A calculation function

It returns a value with `rendre`. It is written at the top of the file and
serves every page.

```humalis
fonction price_with_tax avec amount :
    rendre amount * 1,2

fonction discount avec price et rate :
    rendre price - price * rate / 100

page "shop" :
    variable price = 50
    calcul with_tax = price_with_tax(price)
    calcul sale = discount(with_tax, 10)
    titre "Shop"
    texte "{with_tax en euros}, on sale {sale en euros}"
```

### An action function

Without `rendre`, a function is a sequence of actions, called alone on a line
of an event:

```humalis
variable cart = ["Book"] avec partagee

fonction empty_cart :
    changer cart par []
    afficher "Cart emptied"

page "cart" :
    calcul n = nombre de cart
    titre "Cart"
    texte "{n item}"
    bouton "Empty"
    quand l'utilisateur clique sur "Empty" :
        empty_cart()
```

---

## 14. Events

An event (`quand`, "when") says **when** to do something. It is written below
the elements it targets, and its block holds the actions.

```humalis
page "home" :
    titre "Welcome"
    image "product.png" avec description "The product"
    bouton "Start"
    quand la page se charge :
        afficher "Ready"
    quand l'utilisateur clique sur "Start" :
        afficher "Here we go"
    quand l'utilisateur survole "product.png" :
        afficher "Product preview"
```

| Event | When |
|---|---|
| `quand la page se charge :` | when the page opens |
| `quand l'utilisateur clique sur "…" :` | on click (or tap) |
| `quand l'utilisateur survole "…" :` | on mouse hover |
| `quand le formulaire "…" est soumis :` | when a valid form is sent |
| `quand l'utilisateur ecrit dans "…" :` | on every keystroke |
| `quand l'utilisateur arrete d'ecrire dans "…" :` | after a pause in typing |
| `quand l'utilisateur appuie sur "controle+k" :` | on a keyboard shortcut |
| `quand l'utilisateur arrive en bas de "…" :` | at the bottom of a list (infinite scroll) |

Inside a loop, an event targets the element of **its own** turn:

```humalis
page "products" :
    variable products = ["Book", "Pen"]
    titre "Products"
    pour chaque name dans products :
        texte name
        bouton "Buy"
        quand l'utilisateur clique sur "Buy" :
            afficher "You bought {name}"
```

---

## 15. Actions

Actions are written inside an event.

| Action | Effect |
|---|---|
| `afficher "…"` | shows a message |
| `afficher erreur "…"` | shows an error message |
| `montrer "name"`, `cacher "name"` | shows or hides an element |
| `changer x par …` | changes a variable |
| `changer x par champ "Label"` | reads a field's current value into a variable |
| `vider champ "Label"` | empties the field, after sending it for example |
| `changer texte de "name" par "…"` | changes an element's text |
| `ajouter … à list`, `retirer … de list` | changes a list |
| `ajouter champ "Label" à list` | adds a field's current value to a list |
| `rediriger vers "page"` | goes to a page |
| `revenir vers "page"` | goes back, or to that page |
| `envoyer requete vers "…"` | calls a server (see [the server](#22-connecting-pages-to-the-server)) |
| `copier …`, `partager …` | copies to the clipboard, shares |

```humalis
page "product" :
    titre "Product"
    texte "A book." avec nom "description"
    bouton "See more"
    bouton "Order"
    quand l'utilisateur clique sur "See more" :
        changer texte de "description" par "A 200-page illustrated book."
    quand l'utilisateur clique sur "Order" :
        rediriger vers "thanks"

page "thanks" :
    titre "Thank you!"
```

Inside an action, `champ "Label"` reads what the person entered when they click. A number field yields a number, a checkbox yields true or false, and other fields yield text. Use the base language label even when the field has a translation.

```humalis
page "tasks" :
    variable tasks = ["Buy bread"]
    variable latest = ""
    champ "New task"
    bouton "Add"
    quand l'utilisateur clique sur "Add" :
        ajouter champ "New task" à tasks
        changer latest par champ "New task"
    texte "Latest added: {latest}"
    pour chaque task dans tasks :
        texte task
```

---

## 16. Messages, dialogs and questions

### Messages

```humalis
page "account" :
    variable cart = ["Book"]
    titre "Account"
    bouton "Save"
    bouton "Remove"
    quand l'utilisateur clique sur "Save" :
        afficher reussite "Saved"
        afficher avertissement "Remember to check your email" pendant 10 secondes
    quand l'utilisateur clique sur "Remove" :
        retirer "Book" de cart
        afficher reussite "Book removed" avec action "Undo" :
            ajouter "Book" a cart
```

The kinds: `afficher`, `afficher reussite` (success), `afficher avertissement`
(warning), `afficher erreur` (error). `pendant 10 secondes` sets how long it
stays; `sans disparaitre` keeps it on screen; `avec action "…" :` adds a
button.

An error stays 8 seconds. Humalis also shows some by itself, for example when a
read fails: « Le serveur n'a pas répondu. Réessayez dans un instant. » To change
how long all the site's errors stay, write `erreurs pendant 5 secondes` in the
[`site :` block](#29-publishing-a-site).

### Dialogs

```humalis
page "help" :
    titre "Help"
    bouton "Open help"
    quand l'utilisateur clique sur "Open help" :
        montrer "Shortcuts"
    fenetre "Shortcuts" avec description "Useful keys" :
        texte "Ctrl+K opens this help."
        bouton "Got it"
        quand l'utilisateur clique sur "Got it" :
            cacher "Shortcuts"
```

`fenetre` is a dialog window.

### Asking a question

```humalis
page "cart" :
    variable cart = ["Book", "Pen"]
    titre "Cart"
    pour chaque p dans cart :
        texte p
        bouton "Remove {p}" avec nom "remove"
        quand l'utilisateur clique sur "remove" :
            confirmer "Remove {p} from the cart?" avec oui "Remove" et non "Keep" :
                retirer p de cart
            sinon :
                afficher "Nothing was removed"
```

`confirmer` asks a yes (`oui`) / no (`non`) question.

---

## 17. Interactions

### Copying and sharing

```humalis
page "promo" :
    variable code = "WELCOME10"
    titre "Your promo code"
    texte code
    bouton "Copy the code"
    bouton "Share"
    quand l'utilisateur clique sur "Copy the code" :
        copier code avec message "Code copied"
    quand l'utilisateur clique sur "Share" :
        partager "Come and see the shop" avec titre "The shop" avec lien vers "promo"
```

### Timers

```humalis
page "timer" :
    variable seconds = 0
    variable running = vrai
    variable stopped = faux
    titre "Timer"
    texte "Open for {seconds} seconds"
    toutes les 1 seconde tant que running est vrai :
        changer seconds par seconds + 1
    bouton "Stop"
    quand l'utilisateur clique sur "Stop" :
        changer running par faux
        changer stopped par vrai
        apres 2 secondes :
            changer stopped par faux
    si stopped est vrai :
        texte "Stopped!"
```

`toutes les 1 seconde tant que …` (every second while …), `apres 2 secondes`
(after 2 seconds). A timer stops when you leave the page, and pauses while the
tab is hidden.

### Shortcuts and search as you type

```humalis
page "search" :
    variable results = []
    titre "Search"
    champ "search" avec indice "Find a book" et raccourci "/"
    quand l'utilisateur arrete d'ecrire dans "search" :
        envoyer requete vers "/search" avec le champ "search" dans results
    calcul found = nombre de results
    texte "{found} results" avec annonce
    pour chaque r dans results :
        texte r
    bouton "Help" avec raccourci "controle+k"
    quand l'utilisateur clique sur "Help" :
        afficher "Type / to search"
```

`raccourci` is a keyboard shortcut (`controle` = Ctrl, `maj` = Shift).
`avec annonce` makes screen readers read the text when it changes.

### Infinite scroll

```humalis
page "catalogue" :
    variable products = []
    variable more = []
    variable page_number = 1
    variable some_left = vrai
    titre "Catalogue"
    section avec nom "list" :
        pour chaque p dans products :
            texte p
    quand l'utilisateur arrive en bas de "list" tant que some_left est vrai avec bouton "See more" :
        envoyer requete vers "/products" avec page_number dans more
        pour chaque n dans more :
            ajouter n a products
        changer page_number par page_number + 1
        si more est vide :
            changer some_left par faux
```

The "See more" button stays available for people who use the keyboard.

---

## 18. Forms

A form (`formulaire`) groups fields and a button. `obligatoire` fields,
`minimum` and `maximum` are checked **before** sending, with a clear message
under the faulty field.

```humalis
page "contact" :
    titre "Write to us"
    formulaire "message" :
        champ "Name" avec obligatoire
        champ email "Email" avec obligatoire
        champ texte long "Message"
        bouton "Send"
    quand le formulaire "message" est soumis :
        si champ "Message" est vide :
            afficher erreur "Please write your message"
        sinon :
            afficher reussite "Message sent"
```

Read a field's value with `champ "Name"` (or `le champ "Name"`).

### A field's starting value

`avec valeur` fills a field as soon as the page opens: with a variable, a text,
or a field of a record.

```humalis
page "profile" :
    variable name = "Camille"
    variable product = fiche avec price 12
    variable subscribed = vrai
    titre "My profile"
    formulaire "profile" :
        champ "Name" avec valeur name
        champ "City" avec valeur "Lyon"
        champ "Price" avec valeur product.price
        case a cocher "Newsletter" avec valeur subscribed
        bouton "Save"
    quand le formulaire "profile" est soumis :
        changer name par champ "Name"
        afficher reussite "Profile saved"
```

What the person types next is the field's value, read as usual with
`champ "Name"`. As long as they have not changed the field, it follows its
starting value: if `name` arrives later, after reading the server for example,
the field fills in. Once they have typed in it, what they typed stays. After the
form is sent, the field goes back to its starting value instead of being
emptied.

The value follows the kind of field: a number is written as is, a date as
`YYYY-MM-DD`, and a checkbox expects `vrai` or `faux`. A field inside
`pour chaque` takes no starting value.

---

## 19. Sharing and keeping values

### One variable for every page

A variable written at the top of the file with `partagee` (shared) is the same
on every page:

```humalis
variable cart = [] avec partagee

page "shop" :
    calcul item_count = nombre de cart
    titre "Shop"
    texte "Items: {item_count}"
    bouton "Add a book"
    quand l'utilisateur clique sur "Add a book" :
        ajouter "Book" à cart
    lien "See the cart" vers "cart_page"

page "cart_page" :
    titre "Your cart"
    pour chaque name dans cart :
        texte name
    lien "Back" vers "shop"
```

### Keeping a value for next time

`memorisee` (remembered) keeps the value on the person's device, even after
they close the site:

```humalis
variable cart = [] avec partagee et memorisee

page "shop" :
    variable visits = 0 avec memorisee
    titre "Shop"
    texte "You came {visits} times."
    bouton "Count my visit"
    quand l'utilisateur clique sur "Count my visit" :
        changer visits par visits + 1
```

On mobile and desktop, `memorisee en secret` stores the value in the device's
encrypted vault (the Keychain on a Mac, for example).

---

## 20. Navigation

### Links and parameters

```humalis
page "catalogue" :
    titre "Catalogue"
    lien "See the book" vers "product" avec id "book-1"
    lien "Our desserts" vers "menu#desserts"
    lien "Follow us" vers "https://example.com" avec nouvel onglet

page "product" avec parametre id :
    titre "Product"
    texte "Product {id}"
    bouton "Back"
    quand l'utilisateur clique sur "Back" :
        revenir vers "catalogue"

page "menu" :
    titre "The menu"
    section "Desserts" avec ancre "desserts" :
        texte "Apple pie"
```

`avec parametre id` gives a page a parameter in its address; `ancre` (anchor)
names a place in a page; `nouvel onglet` opens a new tab.

An external address can contain `{…}`: after the `?`, each value is encoded,
so that an "&", a "#" or a space does not break the address. `rediriger vers`
does the same.

```humalis
page "cart" :
    variable message = "Hello, I am ordering a shirt"
    titre "Cart"
    lien "Order on WhatsApp" vers "https://wa.me/243000000000?text={message}" avec nouvel onglet
```

The whole address can come from a variable: `lien "Site" vers "{address}"`. Only
addresses in `https:`, `http:`, `mailto:`, `tel:` or starting with `/` are
followed. Web and desktop can do it; mobile and static sites still refuse an
external link.

`{saut de ligne}` writes a line break in a text, and `%0A` in an address:
`texte "Hello{saut de ligne}Thanks"`.

### Address filters

A filter (`filtre`) is an optional value in the address
(`/catalogue?category=dresses`):

```humalis
page "catalogue" avec filtre category :
    titre "Catalogue"
    menu :
        lien "All" vers "catalogue"
        lien "Dresses" vers "catalogue" avec category "dresses"
    si category est rien :
        texte "All categories"
    sinon :
        texte "Category: {category}"
```

### Sub-pages

```humalis
page "space" :
    titre "My space"
    menu :
        lien "Profile" vers "profile"
        lien "Settings" vers "settings"
    sous page

page "profile" dans "space" :
    texte "Your profile"

page "settings" dans "space" :
    texte "Your settings"
```

`page "profile" dans "space"` puts a page inside another; `sous page` marks
where the sub-page appears, below the shared menu.

### A chosen address, a restricted page, the not-found page

```humalis
serveur "shop" :
    donnee order :
        number : texte
    route "orders" :
        connecte peut lire order

page "home" :
    titre "Home"
    lien "My orders" vers "orders"

page "orders" a l'adresse "/account/orders" reservee a connecte sinon vers "login" :
    titre "My orders"

page "login" :
    titre "Log in"
    formulaire "login" :
        champ email "email" avec obligatoire
        champ mot de passe "password" avec obligatoire
        bouton "Log in"
    quand le formulaire "login" est soumis :
        se connecter avec champ "email" et champ "password"
        continuer vers "home"

page "introuvable" :
    titre "This page does not exist"
    lien "Back to home" vers "home"
```

- `a l'adresse "/…"` chooses the page's address.
- `reservee a connecte` (or `reservee a admin`) closes it to visitors, who are
  sent to the login page (`sinon vers`). After logging in, `continuer vers`
  takes them back to the page they wanted.
- A page named `introuvable` ("not found") replaces the 404 page.

---

## 21. The server

A `serveur` block describes the application's data and **who is allowed to do
what**. Humalis generates a real Node server from it, with login, sessions and
the security of the Astratra packs.

```humalis
serveur "library" :
    donnee book :
        title : texte
        pages : nombre
        available : booleen
        published : date
        authors : liste de texte
    donnee review :
        rating : nombre
        comment : texte
    route "books" :
        tout le monde peut lire book
        seul admin peut modifier book
    route "reviews" :
        tout le monde peut lire review
        connecte peut creer review
        seul admin peut supprimer review
```

- `donnee` describes a kind of data and its fields: `texte` (text), `nombre`
  (number), `booleen` (boolean), `date`, `liste de …` (list of …).
- `route` gives an address (`/api/books`) and its rules.
- Who: `tout le monde` (everyone), `connecte` (logged-in users), `seul admin`
  (admins only); actions: `lire` (read), `creer` (create), `modifier`
  (update), `supprimer` (delete). `modifier` alone covers create, update and
  delete.
- An action without a rule is **refused to everyone**. Humalis warns when no
  one can reach a piece of data.

#### Your own roles

`admin` and `connecte` are not enough for a school or a company. Declare your roles
in the server, then use them everywhere:

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

- `roles …` names the allowed roles. A misspelled role elsewhere is a compile error
  that names what to fix.
- The server checks the role on every request: a visitor gets 401, an account without
  the right role gets 403. Hiding a button in the page protects nothing; the route's
  rule does.
- An `admin` always passes.
- `inviter … comme directeur` creates an account with that role.
- The role is stored in the session: if it changes, it counts at the next login, or at once
  with `changer role` (below).

#### Separating data by group or by account

`par` separates records: each group, or each account, only sees its own. The group name
comes from your own business: `boutique`, `equipe`, `agence`…

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

- A new record takes the person's group; nobody can pick it by sending it.
- A record from another group answers "not found" (404), as if it did not exist.
- An `admin` sees every group, and names the group when creating a record.
- `inviter champ "Adresse" comme vendeur dans boutique b` puts a new account in a group.
  A member who invites brings the person into their own group.
  `seul gerant peut creer comptes` says who may invite.
- An `en direct` page is only told about changes in its own group.

#### A right on some records only

`si` limits a rule to the records concerned:

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

Each side is a field of the record, a field of `utilisateur` (`id`, `email`, `role`, a group)
or a value. Write `est` or `est dans`.

#### Only the author of a record

`seul son auteur peut …` (only its author can) lets each person act on what they
created, and nothing else:

```humalis
serveur "notebook" :
    donnee note :
        texte : texte
    route "notes" :
        connecte peut lire note
        connecte peut creer note
        seul son auteur peut modifier et supprimer note
```

The server fills in each record's `auteur` (author) field itself, with the
account that creates it. Nobody can choose it when sending, or change it later.

This rule already says which records it covers: it takes no `si`.

#### Records on first start

`donnees de depart pour …` (starting data for) writes records the first time the
server starts, one per line. Each field is written with its value, separated
from the next by a comma.

```humalis
serveur "school" :
    donnee subject :
        name : texte
        weight : nombre
        optional : booleen au depart faux
    route "subjects" :
        tout le monde peut lire subject
        seul admin peut modifier subject
    donnees de depart pour subject :
        name "Mathematics", weight 4
        name "History", weight 3
        name "Music", weight 1, optional vrai
```

The records are only written if the table is empty: a restart adds nothing.
Every field required on creation needs a value of the right type; a field with
`au depart` can be left out.

#### A field that changes its name

An application evolves: a field can be renamed, another can be added.
`(avant "tel")` (formerly), after the type, gives the field's old name.

```humalis
serveur "notebook" :
    donnee contact :
        name : texte
        phone : texte (avant "tel")
        favourite : booleen au depart faux
    route "contacts" :
        connecte peut lire contact
        connecte peut creer contact
```

On start, records already written keep their value under the new name. A field
added with `au depart` also gives its value to the older records.

#### Fields on accounts, and the team

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

`inviter champ "Adresse" comme vendeur avec telephone = champ "Tél"` fills a field when inviting,
and `changer compte de c avec telephone = champ "Tél"` changes it later. Only declared fields are
accepted. A manager only sees and touches accounts in their own group, never an admin.
`utilisateur.telephone` can be read in a rule with `si`.

#### Reading your own account

`connecte peut lire son compte` gives the logged-in person their own fields, never
anyone else's. The answer is a list with a single record:

```humalis
serveur "team" :
    compte :
        name : texte
        posts : liste de texte
    route "me" :
        connecte peut lire son compte

page "home" reservee a connecte sinon vers "login" :
    variable profile = []
    calcul me = premier de profile
    quand la page se charge :
        envoyer requete vers "me" dans profile
    titre "Hello {me.name}"
    si me.posts contient "management" :
        lien "Team" vers "team"

page "team" :
    titre "Team"

page "login" :
    titre "Log in"
```

A condition in the page protects nothing: the route's rule is what protects.

#### Changing an account's role

`changer role de c en "vendeur"`, after a gesture in a page, takes effect at once: as soon as
the program uses this sentence, the server re-reads the account on every request. Only an
admin can do it, and never on their own account.

#### An action written on the server

An action is all or nothing: `refuser` stops, cancels what was already written and shows its
message to the person.

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

Inside an action you can write `si`, `pour chaque c dans commande ou statut est "ouverte" :`,
`calcul recette = somme de commande.total ou statut est "payee"`,
`changer c.statut par …`, `creer … avec …`, `supprimer c`, `refuser "…"`, `envoyer email …` and
`envoyer notification …`. Emails and notifications leave only if everything succeeded.

An action can receive values, checked by the server:

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

After `ou`, several conditions follow with `et`: `statut est "ouverte" et total est superieur a
100`. Write `est`, `est superieur a`, `est inferieur a` or `est different de`. A calculation is a
`somme`, `moyenne`, `minimum`, `maximum` or `nombre`.

#### A summary for a page

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

The page reads it like a route: `envoyer requete vers "commandes/resume" dans resume`. Without
`regroupe par`, you get a single record (`resume.recette`); with it, one line per value. If the
data is separated by group, a manager only counts their own. The server reads the lines one by
one to calculate: very large tables will need measuring.

#### A scheduled task

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

`toutes les heures :` and `chaque lundi a 8 h 30 :` work too. Even with several servers, it
runs once. The time is the server's (`TZ` variable). A server that was down at the scheduled
time catches up within the following hour, not later.

#### A PDF document

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

`telecharger document "recu" de c` downloads it from a page, with the read rights of that data.
In a document, `tableau de ligne ou commande est commande.id avec colonnes produit, quantite et
prix` shows the records of another data type.

#### Notifications

`envoyer notification aux gerant avec titre "Nouveau" et texte "{commande.total}"` goes in an
action, a task or `quand commande est cree :`. You can also target the account stored in a
record: `envoyer notification a commande.compte avec …`. If the record is separated by group,
only accounts in that group receive it.

In a page, after a gesture: `activer notifications`. The web needs `HUMALIS_VAPID_PUBLIQUE`,
`HUMALIS_VAPID_PRIVEE` and `HUMALIS_VAPID_SUJET`; Apple needs `HUMALIS_APNS_CLE`,
`HUMALIS_APNS_CLE_ID`, `HUMALIS_APNS_EQUIPE` and `HUMALIS_APNS_SUJET` (`HUMALIS_APNS_HOTE`
for the sandbox). Android goes through Firebase Cloud Messaging: compile the app with
`--firebase google-services.json` (downloaded from the Firebase console), and give the server
`HUMALIS_FCM_COMPTE`, the service account's JSON file (as is or in base 64).

With `et boutons "Accepter" et "Refuser"` (three at most), the notification carries its
buttons: on iPhone, a `humalis.boutons.Accepter|Refuser` category; on Android, a data
message that the app builds itself. `mettre a jour activite "livraison" pour
commande.client` makes these accounts' live activity refresh while the app is closed: on
iPhone through the activity's token (which the app sends to `/auth/activites`), on Android
through a Firebase data message.

#### Device features

On the Apple target, a page can use the device. These phrases are written in an event,
except `signature`, which is an element of the page:

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

`photo` gives a file, like `fichier … dans`. `scanner code` reads a QR code or a barcode.
`signature` gives an image as text. `verifier identite` uses Face ID, Touch ID or the
device passcode. A variable `avec hors ligne` keeps the server's last response and shows
it when there is no network: `variable produits = [] avec hors ligne`.

`position dans lieu` asks for permission, then fills `lieu` (declared `= rien`) with
`lieu.latitude`, `lieu.longitude` and `lieu.precision`, in metres.

`liens profonds "magasin"`, at the top of the file, lets addresses such as
`magasin://produit/42` open the app: the first word is the page, the next ones its
parameters. A restricted page stays restricted. With
`liens profonds "magasin" et domaine "example.com/test"`, addresses such as
`https://example.com/test/produit/42` open the app too. Compile with `--equipe` and publish on
the site the file written to `a-publier-sur-le-site/`.

`en arriere plan :`, directly in a page, says what the app does when the system wakes it.
The system picks the moment: never before 15 minutes, often much later. This block only
sees `avec partagee` variables, since no page is open. On Mac, the app must be open. On
Windows, it is a scheduled task of the signed-in person, every 15 minutes, that starts the app
without a window (or hands the work to the app already open).

`hors ligne`, at the end of an `envoyer requete … avec …`, a `modifier` or a `supprimer`,
keeps the request on the device when there is no network and sends it, in order, when the
connection returns. A server refusal is shown. Each request belongs to the account that
made it: on logout it is set aside and only leaves if the same person logs back in; it is
deleted after 30 days, and the person is told at their next login. It
does not work with `dans` (the answer would come later) or with an external API. To refresh
the page afterwards, read the route `en direct`.

**On the web**, these sentences work too, through browser APIs.
`photo` opens the camera on a phone and a file picker on a computer. `scanner code` needs
a browser that can read codes (Chrome on Android or Mac, for example); otherwise the person is
told. `verifier identite` uses Touch ID, Face ID or Windows Hello: it stays on the device and does
not protect the server, only the server's rules do. `vibrer` only has an effect on Android, and
the compiler says so. A page that is already open keeps working without a network, but the web
does not reopen a whole page offline. `liens profonds` changes nothing, as each page already has
its address. `en arriere plan :` and `memorisee en secret` do not exist on the web: the compiler
refuses rather than pretends.

To use a Swift library in a hand-written view, write at the top of the file
`paquet swift "https://github.com/example/package" version "1.2"`. If the product is not
named after the repository, add `produit "Name"`.

On other targets, the compiler says these phrases are not available yet.

#### Asking an AI

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

The answer appears as it is written. The `ANTHROPIC_API_KEY` key stays on the server. Each
account has a cap shared by all servers: 30 questions an hour, changed by
`HUMALIS_IA_PAR_HEURE`. `HUMALIS_IA_MODELE` picks the model (`claude-opus-5-5` by default).

#### Taking a payment

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

`payer total pour r`, in a page, opens Stripe's payment page. The amount is re-read by the
server, never sent by the page. The record gets a `paye` field, written only when Stripe
confirms it through a signed webhook: send it to `/paiements/webhook`. It needs
`STRIPE_CLE_SECRETE`, `STRIPE_SECRET_WEBHOOK` and `HUMALIS_ADRESSE_SITE`.

#### Resending without duplicates

If the connection drops during a send, a program can safely try again: it sends the
`X-Humalis-Envoi` header with a random id, the same one on every attempt. The server does the
work once, even across several copies, then returns the same answer. It answers 409 while the
first attempt is still running. The id is kept for 30 days, as long as a request can wait on the device.

#### Many people behind one address

By default, one address gets 300 requests per 15 minutes and 10 login attempts. A whole
organisation can share one address: raise `HUMALIS_LIMITE_API` and `HUMALIS_LIMITE_CONNEXION`.
Behind a proxy, also set `HUMALIS_RELAIS`.

To generate and run it:

```sh
humalis compile my-project.humalis --cible serveur --sortie my-project-server
cd my-project-server && npm install
cp .env.exemple .env      # then fill in JWT_SECRET and the administrator
npm test                  # checks every access rule
npm run build && npm start
```

Without `DATABASE_URL` in `.env`, data stays in memory (development). With it,
data goes to PostgreSQL: one table per kind of data, created at start-up.

### What the server decides

A rule such as `tout le monde peut creer commande` accepts every declared field as
the request sends it: anyone could write the status or total of their choice. These
rules, after a field's type, give the decision to the server.

```humalis
serveur "shop" :
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
        statut : texte au depart "pending"
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
            creer suivi avec etape "pending" et total commande.total dans commande.suivi
```

- `au depart "…"`: the server sets this value on creation. It can be a text, a
  number, `vrai`, `faux` or `aujourd'hui`.
- `calcule nombre de refs` counts the list. `calcule somme prix de produit par refs
  plus livraison` reads the price of each id in the list again, adds them up, then
  adds another field. An unknown id is refused.
- `au plus prix de zone par commune` refuses a value above the price of that
  commune's zone, or a negative one. Without a zone, only 0 passes.
- `non vide` refuses an empty list, or an empty or blank text:
  `refs : liste de texte non vide`. It combines with another rule.
- `du site` accepts only a path on this site (`/images/photo.jpg`), the
  `HUMALIS_ADRESSE_SITE` address, or an image chosen in the page. It also applies when
  modifying.
- `creer suivi avec … dans commande.suivi` creates a linked record from the values
  already checked, and keeps its id in the new record. The response gives it to the
  page: `envoyer requete vers "commandes" avec … dans commande`, then `commande.suivi`.
- `par identifiant` opens one record at a time, without the list, and this read is
  never cached. The list follows its own rule. The page writes
  `envoyer requete vers "suivis" avec id m.id dans fiche`, or `avec id` alone in a page
  whose parameter is named `id`.

A field the server decides is refused when sent (400), and Humalis reports it at
compile time if a page sends it. Someone allowed to modify can still change it later
with `modifier c dans "commandes" avec statut = "confirmee"`; a total changed this way
keeps the written value, with no new calculation. Calculations stay simple: a rule like "free delivery from $50" stays decided by the
page, so a client tampering with the request can pay less on that field, never more
than the cap.

Behind a relay on the same machine, set `HUMALIS_ECOUTE=127.0.0.1` in the environment:
the server is then reachable only through it.

---

## 22. Connecting pages to the server

When the server and the pages are in the same file, Humalis **checks every
request at compile time**: the route exists, the fields exist, the types are
right, and the person is allowed.

```humalis
serveur "shop" :
    donnee product :
        name : texte
        price : nombre
    donnee review :
        rating : nombre
        comment : texte
    route "products" :
        tout le monde peut lire product
        seul admin peut modifier product
    route "reviews" :
        tout le monde peut lire review
        connecte peut creer review
        seul admin peut supprimer review

page "shop_page" :
    variable products = []
    variable rating = 5
    titre "Shop"
    quand la page se charge :
        envoyer requete vers "products" dans products
    pour chaque p dans products :
        texte "{p.name}: {p.price en euros}"
    si utilisateur est connecte :
        champ "comment"
        bouton "Post"
        quand l'utilisateur clique sur "Post" :
            envoyer requete vers "reviews" avec rating et champ "comment"
            afficher reussite "Thank you for your review"
        bouton "Log out"
        quand l'utilisateur clique sur "Log out" :
            se deconnecter
    sinon :
        lien "Log in to leave a review" vers "login"

page "login" :
    titre "Log in"
    formulaire "login" :
        champ email "email" avec obligatoire
        champ mot de passe "password" avec obligatoire
        bouton "Log in"
    quand le formulaire "login" est soumis :
        se connecter avec champ "email" et champ "password"
        rediriger vers "shop_page"
```

- `envoyer requete vers "products" dans products` reads the list into
  `products`.
- `envoyer requete vers "reviews" avec rating et champ "comment"` sends data.
- `avec comment = typed_text` sends a value under the name of a field of the
  data, when the variable has another name.
- `si utilisateur est connecte :` (if the user is logged in), `si utilisateur
  est admin :`, `se connecter` (log in) and `se deconnecter` (log out) handle
  the session.

### Handling a failure

```humalis
serveur "shop" :
    donnee order :
        name : texte
    route "orders" :
        tout le monde peut creer order

page "order_page" :
    titre "Order"
    formulaire "order" :
        champ "Name"
        bouton "Order"
    quand le formulaire "order" est soumis :
        essayer :
            envoyer requete vers "orders" avec champ "Name"
            afficher reussite "Order sent"
        si erreur :
            afficher erreur "The order was not sent: {raison}"
```

`essayer` means "try"; inside `si erreur :` ("if error"), `raison` says what
went wrong. In a form, the fields stay filled in.


### Logging in with Apple

With the line `connexion apple` in the server, an account the server **already knows** can log
in with its Apple account: `se connecter avec apple` opens Apple's window on iPhone, iPad, Mac
and on the site. The first login links the account to that Apple account. If the person hides
their address, they are not recognized and a message says so. Set `APPLE_APP_ID` for the app
and `APPLE_SERVICE_ID` for the site, and compile the app with `--equipe`.

On Android, Apple's page opens in a browser tab, then Apple sends the person back to the
server, which sends them back into the application. You need `liens profonds "…"` in the
program, `APPLE_RETOUR_ANDROID=magasin://connexion-apple` on the server (with the deep-link
scheme), and the address `https://your-server/auth/apple/retour` among the return addresses
of the services identifier, at Apple.

### Logging in with Google

With the line `connexion google` in the server, an account the server
**already knows** can log in with Google: Google's window opens, and if Google
confirms an address that matches an account, the session opens, with no
password. An unknown address is refused: nobody gives themselves access. The
first sign-in links the account to that Google account; another Google account
carrying the same address is refused afterwards.

```humalis
serveur "shop" :
    connexion google
    donnee order :
        name : texte
    route "orders" :
        seul admin peut lire order

page "login" :
    titre "Log in"
    bouton "Continue with Google"
    quand l'utilisateur clique sur "Continue with Google" :
        essayer :
            se connecter avec google
            rediriger vers "login"
        si erreur :
            afficher erreur "Login refused: {raison}"
```

You need a Google OAuth client ID ("Web application"), in the server's
`GOOGLE_CLIENT_ID` variable, with the redirect address
`https://your-site/auth-google.html`. On Android, the Google account is chosen in the
system window: also create an "Android" client ID (the application's name and the SHA-1
fingerprint of its certificate); the server keeps the Web client ID.

### Inviting people and recovering a password

The first account comes from the environment. The next ones arrive by invitation:
an admin gives an address, the person receives a link, then chooses a password.
With `connexion google`, they can also come in with Google, since their account
is now known.

```humalis
serveur "shop" :
    connexion google
    emails par brevo
    invitations vers "welcome"
    mot de passe oublie vers "welcome"
    route "team" :
        seul admin peut lire comptes
        seul admin peut supprimer comptes

page "home" :
    titre "Sign in"

page "team" reservee a admin sinon vers "home" :
    titre "The team"
    variable members = []
    quand la page se charge :
        envoyer requete vers "team" dans members
    formulaire "invitation" :
        champ email "Address" avec obligatoire
        bouton "Invite"
    quand le formulaire "invitation" est soumis :
        essayer :
            inviter champ "Address" comme admin
            afficher reussite "Invitation sent"
            envoyer requete vers "team" dans members
        si erreur :
            afficher erreur "{raison}"
    pour chaque m dans members :
        ligne :
            texte "{m.email} ({m.role}, {m.statut})"
            bouton "Remove"
            quand l'utilisateur clique sur "Remove" :
                supprimer m de "team"
                envoyer requete vers "team" dans members

page "forgotten" :
    titre "Forgotten password"
    formulaire "request" :
        champ email "Email" avec obligatoire
        bouton "Get a link"
    quand le formulaire "request" est soumis :
        demander un lien de mot de passe pour champ "Email"
        afficher reussite "If this account exists, a link is on its way."

page "welcome" :
    titre "Choose your password"
    formulaire "choice" :
        champ mot de passe "Password" avec obligatoire
        bouton "Save"
    quand le formulaire "choice" est soumis :
        essayer :
            choisir le mot de passe avec champ "Password"
            rediriger vers "home"
        si erreur :
            afficher erreur "{raison}"
```

- `inviter … comme admin` creates an administrator; without `comme`, it is a plain
  signed-in account. Only an admin can invite, and the server checks it.
- A link works once. It lasts 7 days for an invitation, one hour for a forgotten
  password. The server keeps only its fingerprint.
- `demander un lien…` answers the same whether the address has an account or not,
  and one address gets at most one link every ten minutes. Inviting an address
  that already has an account leaves that account unchanged.
- `comptes` is a ready-made data type, with `email`, `role` (`admin` or `membre`)
  and `statut` (`invite` or `actif`). Only an admin can read it or delete from it.
  Deleting cancels an invitation or removes a member: no more password, no more
  link, and their session is cut. You cannot remove yourself. A new invitation can
  bring them back.

The server needs `BREVO_API_KEY` and `BREVO_EXPEDITEUR` (an address on a domain
verified with Brevo), in its environment or key vault, and `HUMALIS_ADRESSE_SITE`
(`https://my-shop.com`) in its environment to write the links. Without them,
`inviter` shows an error that says so. Web and desktop targets; the mobile app
shows a message pointing to the site, and the static target refuses these phrases.

### Sending an email from the server

Under a route, `quand … est cree :` sends emails once a record has been saved.

```humalis
serveur "shop" :
    emails par brevo
    donnee message :
        nom : texte
        texte : texte
    route "messages" :
        tout le monde peut creer message
        seul admin peut lire message
        seul admin peut supprimer message
        quand message est cree :
            envoyer email aux admins avec sujet "New message from {message.nom}" et texte "{message.texte}"
```

The recipient is `aux admins`, an address (`a "contact@example.com"`), or a field
of the record (`a commande.email`). The text shows fields of the new record. A
failed send never fails the creation. Humalis warns when anyone can create the
record and so choose where the email goes: your domain would be sending spam. The
server sends at most 100 emails per hour; `HUMALIS_EMAILS_PAR_HEURE` changes that.

### A profile page: password and photo

A signed-in person changes their password with
`changer le mot de passe avec … et …`: first the current password, then the new
one. The server checks the current one and refuses a weak new one (at least
8 characters, with an uppercase letter, a lowercase letter, a digit and a
symbol). The session stays open.

An `image` field in a server data type keeps a photo chosen in the page
(`fichier … accepte images`). The page shrinks it (480 px per side, JPEG)
before sending it; the server checks it really is an image. It is then shown
like an address: `image p.photo`.

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

Both work on web, desktop and mobile. On the phone, the photo comes from the
gallery, with the same shrinking; a transparent image loses its transparency
there (JPEG has none).

### Downloading a list as CSV

In an event, `telecharger orders en csv` saves the list to an `orders.csv` file
that French-language Excel opens correctly. On a phone, the text goes through
the share sheet.

### Downloading a record's slip

`telecharger bon de commande de c` downloads the PDF of a server record, without
opening a page. It works for any data read through a route:
`telecharger bon de reservation de r`, for instance.

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

The server then adds `GET /api/commandes/:id/bon`, only if a page uses it, with the
same rights as reading the route. The document carries the server's name (written
as is: give it the shop's name), the title "Bon de commande" and every field in
plain text, except those of type `image`. A record that no longer exists answers
404, and the reason reaches `si erreur`.

Web and desktop targets. On the phone, a message says it is not available yet; the
static site refuses the sentence. Compile the server from the file that contains
this page: the page is what asks for the route.

### A loyalty card

In the server, `fidelite par telephone de commande :` computes a stamp card from
the records, storing nothing. Its two lines are required:

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

`1 tampon par commande livree` counts the records whose `statut` field is exactly
`livree`. The answer has the fields `tampons`, `objectif`, `restant`, `recompenses`
and `recompense`, known at compile time. Spaces, dashes and the "+" in the number
are ignored: "+33 6 12" and "33612" count together.

**Only an admin can read a card** (`GET /api/fidelite/…`), because the value is a
phone number, and nobody can write to it. No time limit applies: a stamp is never
lost. Rewards handed over are not recorded: `recompenses` counts those earned since
the beginning, and `tampons` restarts from zero at each reward earned.


### Chatting, calling, meeting

Three lines in the server, and the app has chats, video calls and meetings.
Every message, call and room goes through the server, which checks rights on
every read and every send.

```humalis
serveur "agence" :
    roles client, agent et collegue
    donnee contact :
        compte : texte
        nom : texte
    route "contacts" :
        connecte peut lire contact
        seul admin peut modifier contact
    discussion "support" entre client et agent
    discussion "equipe" entre collegue
    salle "conseil" pour collegue, client et agent animee par agent

page "accueil" :
    variable contacts = []
    titre "Agence"
    si utilisateur est connecte :
        badge non lus de "support"
    quand la page se charge :
        envoyer requete vers "contacts" dans contacts
    pour chaque contact dans contacts :
        texte contact.nom
        si contact.compte est en ligne :
            badge "En ligne"
        bouton "Appeler"
        quand l'utilisateur clique sur "Appeler" :
            appeler en video contact.compte
    quand un message arrive dans "support" :
        afficher message.texte

page "support" :
    titre "Support"
    discussion "support"

page "conseil" :
    titre "Conseil"
    reunion "conseil"
    si main est levee :
        texte "Main levée"
    pour chaque p dans participants de reunion "conseil" :
        texte "Présent : {p.nom}"
        bouton "Couper"
        quand l'utilisateur clique sur "Couper" :
            couper micro de p
        bouton "Exclure"
        quand l'utilisateur clique sur "Exclure" :
            exclure p
```

**Chats.** `discussion "support" entre client et agent` creates one conversation
between each client and the agents; `entre collegue` puts all colleagues in the
same conversation. In a page, `discussion "support"` shows it: messages arrive
without reloading, "Lu" (read) shows when the other side has read, "écrit…"
while they type, and an attachment (10 MB at most) goes with the message. Its link
is signed and downloads; it never opens inside the page. `sans pieces jointes`
removes the file picker. `ouvrir discussion "support" avec commande.client` opens
one person's conversation (for an agent).

**Calls.** `appeler en video contact.compte` (or `en audio`) rings the other person
on every open page: "Appel de …", with `decrocher` and `refuser appel`. With no
answer, the call stops after 45 seconds. `raccrocher` ends it on both sides.
`quand un appel arrive :` replaces the ring with your own.

**Meetings.** `reunion "conseil"` shows the participants' video and the bar:
microphone, camera, screen sharing, raised hand, leave. Hosts (`animee par agent`)
can `couper micro de p` and `exclure p`. The list `participants de reunion
"conseil"` updates by itself, even for someone who has not joined; a person whose
connection drops disappears from it.

| Phrase | What it does |
|---|---|
| `discussion "…" entre client et agent` | (server) one conversation per client, with the team |
| `salle "…" pour membre animee par direction` | (server) a meeting room and its hosts |
| `discussion "…"`, `… sans pieces jointes` | the conversation in the page |
| `ouvrir discussion "…" avec personne` | one person's conversation |
| `quand un message arrive dans "…" :` | `message.texte`, `message.auteur_nom` |
| `non lus de "…"` | the number of unread messages |
| `si contact est en ligne :` | presence, with an id or a record |
| `appeler en video …`, `appeler en audio …` | a call to a person |
| `quand un appel arrive :`, `decrocher`, `refuser appel`, `raccrocher` | answer and end |
| `reunion "…"`, `rejoindre reunion "…"`, `quitter reunion` | join, leave |
| `couper micro`, `activer micro`, `couper camera`, `activer camera` | microphone and camera |
| `partager ecran`, `arreter partage`, `lever la main`, `baisser la main` | screen and hand |
| `si micro est coupe`, `si camera est coupee`, `si main est levee` | the bar's state |
| `pour chaque p dans participants de reunion "…"` | `p.nom`, `p.micro`, `p.camera`, `p.main` |
| `couper micro de p`, `exclure p` | (hosts) moderation |

**Sound and video go through LiveKit**, an open-source meeting server you host
yourself or rent from LiveKit Cloud. The Humalis server reads its address and keys
from the environment, never from the code:

```
LIVEKIT_URL=wss://meetings.example.com
LIVEKIT_API_KEY=…
LIVEKIT_API_SECRET=…
```

Without these three variables, chats still work and joining a meeting answers that
the service is not set up. To try it at home: `livekit-server --dev` gives
`ws://localhost:7880`, `devkey` and `secret`.

**On each target.** The web (Humalis engine), desktop, Apple (iPhone, iPad, Mac),
Android and Windows (x64 and ARM64) have everything: chats, calls, meetings and
screen sharing. On Windows, sharing shows the whole main screen; on iPhone, it
shows the app. The `mobile` target (Expo), static pages and `--moteur react` refuse
these phrases at compile time and name the target to use.

---

## 23. Using an existing API

A `source` block describes an API written elsewhere (in Node, PHP, Python…).
Pages use it like a Humalis server, with the same checks.

```humalis
source "shop" :
    adresse "https://api.example.com"
    enveloppe "data"
    erreur dans "message"
    donnee product :
        id : texte
        name : texte
        price : nombre
    route "api/products" :
        lire une liste de product dans "products"
        lire un product dans "product"

page "catalogue" :
    variable products = []
    titre "New in"
    quand la page se charge :
        envoyer requete vers "api/products" de la source "shop" dans products
    si products est en erreur :
        texte erreur de products
        bouton "Try again"
        quand l'utilisateur clique sur "Try again" :
            recharger products
    pour chaque p dans products :
        lien p.name vers "product_page" avec id p.id

page "product_page" avec parametre id :
    variable product = rien
    quand la page se charge :
        envoyer requete vers "api/products" de la source "shop" avec id dans product
    si product est rien :
        texte "Loading the product…"
    sinon :
        titre product.name
        texte "{product.price en euros}"
```

- `est en chargement` (is loading) and `est en erreur` (has failed) follow a
  request to a source; `recharger products` runs it again.
- `enveloppe "data"`: the API wraps its data under `data`.
- `erreur dans "message"`: where the API writes its error messages.
- `session astratra`: the API uses the Astratra packs' login.
- A route can `lire` (read), `creer` (create), `modifier` (update, `par
  remplacement` for a PUT) and `supprimer` (delete). A secret token is never
  written in the file: Humalis refuses it.

### An API that needs a secret key

A secret key must never reach the browser. You only write the name of the
environment variable that holds it:

```humalis
serveur "calendar" :
    donnee reminder :
        texte : texte
    route "reminders" :
        connecte peut lire reminder

source "weather" :
    adresse "https://api.weather.example"
    jeton secret depuis l'environnement "WEATHER_KEY" dans le parametre "key"
    donnee forecast :
        day : texte
        temperature : nombre
    route "forecasts" :
        tout le monde peut lire une liste de forecast dans "days"

page "home" :
    variable forecasts = []
    titre "This week's weather"
    quand la page se charge :
        envoyer requete vers "forecasts" de la source "weather" dans forecasts
    pour chaque f dans forecasts :
        texte "{f.day}: {f.temperature} °C"
```

The pages then go through the Humalis server's gateway
(`/api/passerelle/weather`). The server checks who is calling, adds the key, then
calls the API.

- The project needs a `serveur` block: it makes the call.
- Each route of the source says who can call it: `tout le monde peut …`,
  `connecte peut …` or `seul admin peut …`. An action without a rule is refused.
- The key travels in the `Authorization` header by default. `dans le parametre
  "key"` puts it in the address; `dans l'entete "X-Key"` in another header.
- The value goes in the server's `.env` file. Its name is added to
  `.env.exemple`.

---

## 24. Data from a file

A CSV table or a JSON file can serve as data, read at compile time:

```humalis
utiliser donnees "products" depuis "./products.csv"

page "catalogue" :
    titre "Catalogue"
    pour chaque p dans products :
        texte "{p.name}: {p.price en euros}"
```

with the file `products.csv` next to it:

```csv products.csv
name;price
Book;12
Pen;2
```

Humalis knows the columns: `p.pricce` would be refused at compile time. This
data is read-only; a page cannot change it.

---

## 25. Choosing and uploading a file

```humalis
page "profile" :
    variable photo = rien
    titre "My profile photo"
    fichier "Choose a photo" dans photo accepte images avec maximum 5 Mo
    si photo est different de rien :
        image photo.apercu avec description "Preview of the chosen photo" et proportions 1 sur 1
        texte photo.nom
```

`fichier "…" dans photo` lets people pick a file; `accepte images` limits it to
images, `maximum 5 Mo` to 5 MB. The page checks type and size to help the
person; the server receiving the file must always check again. Uploading goes
through a `source`: `envoyer fichier photo vers "…" de la source "…"`, with a
progress bar (`suivi dans upload`).

`avec icone "photo"` shows the icon alone on the button; the label is still
read by screen readers and shown on hover.

---

## 26. Charts

Every chart (`graphique`) has a description (for people who cannot see it)
and a "See the data" button that shows the table.

```humalis
page "figures" :
    variable sales = [fiche avec month "January" et amount 1200 et purchases 900, fiche avec month "February" et amount 1800 et purchases 1100, fiche avec month "March" et amount 1500 et purchases 950]
    variable expenses = [fiche avec item "Rent" et total 500, fiche avec item "Groceries" et total 300, fiche avec item "Transport" et total 50]
    variable visits = [120, 180, 150, 210, 260, 320, 90]
    titre "Our figures"
    graphique en courbe sales avec etiquette month et valeur amount en euros et description "Sales rise from January to February, then dip slightly in March."
    graphique en barres sales avec etiquette month et description "Sales exceed purchases every month." :
        serie "Sales" valeur amount en euros avec couleur bleu
        serie "Purchases" valeur purchases en euros avec couleur orange
    graphique en camembert expenses avec etiquette item et valeur total en euros et description "Rent is more than half of the expenses."
    graphique en barres visits avec etiquettes ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] et couleur vert et proportions 2 sur 1 et description "Visits rise until Saturday."
```

The kinds: `en courbe` (line), `en barres` (bars), `en camembert` (pie).

Charts can be read by touch or with the mouse: touching a point, a bar or a
slice shows its label and value, and sliding a finger moves the bubble along.
With the keyboard, the arrow keys go from one value to the next. With many
values, the chart scrolls sideways and shows the latest ones first.
`etiquette` names the field used for labels, `valeur` the field used for
values, `serie` adds a series.

---

## 27. Maps

```humalis
page "find_us" :
    variable shops = [fiche avec name "Lyon" et latitude 45,764 et longitude 4,8357, fiche avec name "Lille" et latitude 50,6292 et longitude 3,0573]
    titre "Find us"
    carte "Our shop in Paris" avec latitude 48,8566 et longitude 2,3522 et zoom 15
    carte "Our other shops" :
        pour chaque s dans shops :
            marqueur s.name avec latitude s.latitude et longitude s.longitude
```

`carte` is a map, `marqueur` a marker. Tiles come from OpenStreetMap by
default. For a busy site, choose a tile provider with `tuiles "…"` and its
`attribution "…"`.

---

## 28. Several languages

You write the code in French; the **site** can speak several languages. The
first language of the block is the language of the written texts.

```humalis
langues :
    anglais
    francais

traductions francais :
    "See the catalogue" : "Voir le catalogue"

page "home" :
    selecteur de langue
    variable cart = 3
    titre "Welcome" en francais "Bienvenue"
    texte "{cart item} in the cart" en francais "{cart article} dans le panier"
    bouton "See the catalogue"
    quand l'utilisateur clique sur "See the catalogue" :
        rediriger vers "catalogue"

page "catalogue" :
    titre "The catalogue" en francais "Le catalogue"
    lien "Back to home" en francais "Retour à l'accueil" vers "home"
```

- `langues :` lists the languages (`francais`, `anglais`…), one per line or
  on the same line separated by commas: `langues : anglais, francais`.
- `en francais "…"` gives another language's version of a text.
- `sans traduction` ("without translation") keeps the same text in every
  language, for a proper noun: `lien "GitHub" sans traduction vers "https://github.com"`.
- `traductions francais :` translates a repeated text once.
- `selecteur de langue` shows the language switcher; `changer langue par
  anglais` and `si langue est anglais :` are used in events.
- The message of `copier` is translated like any other text:
  `copier code avec message "Copied" en francais "Copié"`.
- Humalis reports at compile time every text that lacks its translation.
  Humalis's own messages (required field, loading…) follow the language.

### Available languages

Six languages are available: `francais` (French), `anglais` (English),
`espagnol` (Spanish), `portugais` (Portuguese), `swahili` and `lingala`. A
text's version is written with the language's name: `en espagnol "…"`,
`en portugais "…"`.

```humalis
langues : anglais, espagnol, portugais

page "home" :
    selecteur de langue
    titre "Welcome" en espagnol "Bienvenido" en portugais "Bem-vindo"
    bouton "Book" en espagnol "Reservar" en portugais "Reservar"
```

In each language, Humalis's own messages are translated, and numbers, dates,
amounts and plurals follow its rules. So do `en date longue`, `en lettres`,
`avec majuscule` and `initiales de`. In Lingala, `en lettres` keeps the digits.

### One address per language

`avec adresse par langue` (with an address per language), at the end of the
languages line, gives each language its own address. The first language keeps
the plain addresses (`/menu`); the others get their prefix (`/fr/menu`).

```humalis
langues : anglais, francais avec adresse par langue

page "home" :
    titre "Welcome" en francais "Bienvenue"
    lien "The menu" en francais "La carte" vers "menu"

page "menu" :
    titre "The menu" en francais "La carte"
```

Each page is then written ahead of time in each language, with the links that
connect its versions for search engines. The page arrives already in its
language, without waiting for a script. This works on the website.

This option is only written on the one-line form: `langues : anglais, francais
avec adresse par langue`.

---

## 29. Publishing a site

The `site :` block at the top of the file describes the site for search
engines and social networks. The `apercu :` (preview) block sets one page.

```humalis
site :
    nom "The Corner Café"
    description "Seasonal cooking in the heart of the city, open Monday to Saturday."
    logo "./logo.svg"
    image "./share.png"
    adresse "https://cornercafe.example"

page "home" :
    titre "The Corner Café"

page "cart" :
    apercu :
        indexation non
    titre "Your cart"

page "about" :
    apercu :
        titre "Who we are"
        description "The story of The Corner Café, seasonal cooking since 2020, in the heart of the city."
    titre "About"
```

With an `adresse`, the web target writes the sitemap (`sitemap.xml`) and
`robots.txt`. A page with `indexation non` is left out of search engines.
`robots.txt` also tells AI tools the site may appear in their searches and serve as a
source for their answers (`Content-Signal: search=yes, ai-input=yes`). Humalis warns when a title or description is too long or too short for search
engines.

On the desktop, the same `adresse` is used for automatic updates: the installed
application looks for a new version in the `mises-a-jour/` folder of that
address. `npm run paquet` prepares everything (the `.dmg` installer for Mac, the
`.exe` for Windows, and the `latest*.yml` files): you put these files in that
folder. Without an `adresse`, the application does not look for updates. On a
Mac, automatic updates need a signed application.

The line `erreurs pendant 5 secondes` in the `site :` block sets how long the
site's errors stay on screen: the ones you write without a duration and the ones
Humalis shows by itself, such as a failed read. It ranges from 1 to 60 seconds;
without it, errors stay 8 seconds. Below 4 seconds, many people won't have time to read: the choice is yours. A
`pendant` written on a message takes priority,
and a message with a button keeps enough time to click (6 seconds, 12 for
« Réessayer »).

---

## 30. Components and multi-file projects

### A Humalis component

A component (`composant`) is a reusable piece of page. Its name starts with a
capital letter.

```humalis
composant "Card" :
    parametre name
    parametre price
    texte name
    texte "{price} €"

page "shop" :
    titre "Shop"
    Card avec name "Book" et price 12
    Card avec name "Pen" et price 2
```

`parametre` declares a value the component receives.

### Reusing a React component

A component from an older React project is used like a Humalis component (web and
desktop):

```humalis
utiliser composant "Carte" depuis "./composants/Carte"

page "home" :
    titre "Home"
    Carte avec titre "School supplies"
```

The file can be `.tsx`, `.ts`, `.jsx` or `.js`. The packages it imports are added to
the generated project automatically: you only need to run `npm install`.

### A JavaScript module

To use a JavaScript library (Three.js for 3D, GSAP…), write a module. It
receives the element to draw in and its properties, and returns a function that
cleans up when the page is left (web and desktop):

```humalis
utiliser module "Scene3D" depuis "./modules/Scene3D"

page "home" :
    Scene3D avec couleur "#c1e928"
```

```js
export default function Scene3D(element, properties) {
  // draw in "element"
  return () => {
    // clean up
  };
}
```

The module is loaded separately and its packages are added to the project. When
a property changes, it is restarted. If it can update itself, it returns
`{ mettreAJour(properties) { … }, detruire() { … } }`.

For an older React project, `humalis compile … --composants <folder>` generates
components to import into it.

### A hand-written native view

When Humalis cannot draw something yet, write that piece in the platform's own
language: Swift for iPhone, iPad and Mac, Kotlin for Android, C# for Windows. No embedded
browser: each app stays native. One line gives the view for each platform:

```humalis
utiliser composant "Carte" sur apple "./natif/Carte.swift" et sur android "./natif/Carte.kt" et sur windows "./natif/Carte.cs"

page "accueil" :
    Carte avec titre "Coffee" et prix 3.5
```

On Apple, a SwiftUI view with the component's name:

```swift
import SwiftUI

struct Carte: View {
    let titre: String
    let prix: Double
    var body: some View { Text("\(titre): \(prix) €").font(.title) }
}
```

On Windows, a WPF class with the same name (a `UserControl`, or any other element):

```csharp
using System.Windows.Controls;

namespace MyViews;

public class Carte : UserControl
{
    public Carte(string titre, double prix, bool promo = false)
    {
        Content = new TextBlock { Text = $"{titre}: {prix:0.00} €", FontSize = 22 };
    }
}
```

The page's properties are passed by name: `titre` goes to the `titre` parameter.
Text is a `String` (`string` in C#), a number a `Double` (`double`, or `int`), true or
false a `Bool` (`bool`). A C# parameter with a default value may be left out of the
page. On Windows, the view is created again when a value it receives changes. An
unknown property, or a missing parameter, is reported at compile time.

On Android, a `@Composable` function with the same name, in a `.kt` file that Humalis
places in the app's package (no `package` line to write):

```kotlin
@Composable
fun Carte(titre: String, prix: Double, promo: Boolean = false) {
    Column { Text(titre, style = MaterialTheme.typography.titleLarge); Text("%.2f €".format(prix)) }
}
```

A platform without its view stops with the line to add: here, the website has no
"Carte". For the website, write the component in Humalis
(`composant "Carte" :`), or a JavaScript module: `utiliser module "Carte" depuis
"./modules/Carte.js"`, followed by the same `sur …`.

The libraries for these views are added at the top of the file: `paquet swift
"https://…" version "1.2"` for Apple (see above), `paquet windows "Humanizer.Core"
version "2.14.1"` for Windows (NuGet), `paquet android "io.coil-kt:coil-compose"
version "2.7.0"` for Android (Gradle).

### App-only forms

Beyond its pages, an app lives elsewhere on the device: a widget on the home screen, an
activity on the lock screen, a tile in quick settings, a keyboard, a Siri command… Each is
written at the top of the file, in one sentence. What shows is written like a page; what
acts, like an event.

```humalis
variable solde = 120 avec partagee

widget "solde" avec taille petite vers "compte" :
    titre "Balance"
    texte "{solde} €"
    actualiser toutes les 30 minutes

activite en direct "livraison" :
    titre "Order on its way"
    texte "Arriving in 10 minutes"

raccourcis de l'icone :
    raccourci "My account" vers "compte" avec icone "user"

commande vocale "My balance" :
    dire "Your balance is {solde} €"

tuile "Clock in" avec icone "clock" :
    afficher "Clocked in"

clavier "Quick replies" :
    touche "Thanks" ecrit "Thank you very much!"

page "compte" :
    titre "Account"
    bouton "Track my order"
    quand l'utilisateur clique sur "Track my order" :
        commencer activite "livraison"
```

| Sentence | What it is | Platforms |
|---|---|---|
| `widget "…" :` | a widget (`avec taille petite`, `moyenne`, `grande`; `vers "page"`; `actualiser toutes les 30 minutes`, 15 at least) | iPhone, iPad, Mac, Android |
| `page "…" dans la barre du systeme avec icone "…" :` | the Mac menu bar, the notification area | Mac, Windows, Linux |
| `quand on partage vers l'application :` | other apps' Share button (`partage.texte`, `partage.lien`, `partage.fichier`) | iPhone, Mac, Android, Windows |
| `page "…" sur montre :`, `page "…" sur tele :` | the watch app, the TV app | Apple Watch, Wear OS, Apple TV, Android TV |
| `clavier "…" :` with `touche "…" ecrit "…"` | a custom keyboard | iPhone, iPad, Android |
| `activite en direct "…" :`; `commencer activite`, `terminer activite` | the lock screen and Dynamic Island; the server updates it with `mettre a jour activite "…" pour commande.client` | iPhone, Android |
| `raccourcis de l'icone :` with `raccourci "…" vers "page"` | long press on the icon (four at most) | iPhone, Android, Windows |
| `commande vocale "…" :` (with `dire "…"`), or `… vers "page"` | Siri, Shortcuts, Google Assistant; `{produit}` in the sentence becomes a variable | iPhone, Mac, Android |
| `quand on ouvre un fichier ".csv" ou ".pdf" :` | "Open with…" (`fichier.nom`, `fichier.type`, `fichier.contenu`) | all apps |
| `lancer au demarrage de l'ordinateur` (`avec discret`) | the app starts with the computer | Mac, Windows, Linux |
| `… et boutons "Accepter" et "Refuser"` (server); `quand l'utilisateur touche "Accepter" dans une notification :` | answer without opening the app (three buttons at most) | iPhone, Android, Windows |
| `recherche du systeme :` with `produits avec titre nom et texte description vers "produit"` | Spotlight, the phone's search | iPhone, Mac, Android |
| `tuile "…" :` | Android quick settings, Control Center | Android, iPhone |
| `mini application "…" :` with `page "…"` | an App Clip, no install | iPhone |
| `voiture "…" :` with `liste … avec titre …` | CarPlay, Android Auto, with Apple's and Google's approval | iPhone, Android |
| `menu clic droit "…" pour les fichiers ".jpg" :` | right click in Explorer and Finder | Windows, Mac, Linux |

On a target where a form makes no sense (a widget on the website), it is ignored, and the
compiler says so once. These forms are written target by target: where a form is planned
but not produced yet, compilation stops and says where it is available.

#### On Apple

The Xcode project stays single: the forms add their targets to it (widgets, share, keyboard,
Apple Watch, Apple TV, App Clip), which reuse the app's pages and shared variables. Compile
with `--equipe`: values go from the app to its widgets and extensions through an app group,
which only a team can open.

| Form | On Apple | Limit |
|---|---|---|
| widget | WidgetKit, small, medium and large; redrawn as soon as a shared variable changes | at least 15 minutes between refreshes |
| system bar | `MenuBarExtra` on Mac | Mac only |
| share received | share extension, iPhone and Mac | on iPhone, read when returning to the app |
| watch, TV | watchOS app bundled in the iPhone app; tvOS app (`-scheme …Tele`) | no clipboard, share sheet or external link |
| keyboard | keyboard extension, with the globe to switch keyboards | iPhone and iPad |
| live activity | ActivityKit: lock screen and Dynamic Island; with the server, updated through APNs | iPhone |
| icon shortcuts | `UIApplicationShortcutItems` | iPhone and iPad |
| voice command | App Intents and `AppShortcuts`; `dire` is Siri's answer, elsewhere the device's voice | Siri asks for a `{…}` right after the phrase |
| file opened | document types, read in place | |
| startup | `SMAppService`; `discret` closes the window at startup | Mac only |
| notification buttons | categories `humalis.boutons.Accepter\|Refuser` | |
| system search | Core Spotlight, on the title | |
| tile | Control Center `ControlWidget` | iOS 18 or later |
| mini application | App Clip | one per app |
| car | CarPlay, one list per screen | entitlement to request from Apple (see `LISEZMOI.md`); the simulator already has it |
| right-click menu | Finder service (Quick Actions) | Mac, after a first launch from Applications |

#### On the desktop (Electron, Linux included)

With `--cible desktop`, which is also the Linux target:

| Form | Mac | Windows | Linux |
|---|---|---|---|
| `page "…" dans la barre du systeme` | an icon in the menu bar; a click opens the page in a small window, a right-click shows the Open / Quit menu | the notification area, the same way | a status icon (on GNOME, with the AppIndicator extension); a click opens the menu |
| `quand on ouvre un fichier` | "Open With", or the file dropped on the icon | "Open With" (registered by the installer) | "Open With" with the .deb package, built when the `site` block has an `adresse` |
| `lancer au demarrage de l'ordinateur` | login items | the user's Run key | `~/.config/autostart` |
| `menu clic droit` | missing: the Finder needs a Finder extension, which only the Apple target produces (the compiler says so) | File Explorer (user keys, removed on uninstall) | Dolphin, Nemo, and Nautilus under "Scripts" |

Launch at startup is set the first time the installed app opens; the "Lancer au démarrage de
l'ordinateur" checkbox, in the app menu and the icon menu, removes it or sets it back. With
`avec discret`, the app starts with no window, in the system tray. A file opened while the app is
running goes to the window already open; its actions run, then the app goes back to the page you
were on (unless they change page). Opening files and the right-click menu need the Humalis engine
(the default).

### Data on the device

Local data lives in a real database on the device (SQLite in apps, IndexedDB in the browser):
it stays there without a network and after a restart. In pages, it reads and changes like a list.

```humalis
serveur "boutique" :
    donnee note :
        titre : texte
        lu : booleen
    route "notes" :
        connecte peut lire note
        connecte peut creer note
        connecte peut modifier note
        connecte peut supprimer note

donnee locale notes avec chiffree :
    titre : texte
    lu : booleen
    synchronisee avec "notes"

page "accueil" :
    titre "Notes"
    pour chaque n dans notes :
        texte n.titre
    bouton "Ajouter"
    quand l'utilisateur clique sur "Ajouter" :
        ajouter fiche avec titre "New" et lu faux a notes
```

`avec chiffree` encrypts the database, with a key kept in the device's vault.
`synchronisee avec "notes"` links it to a server route: changes made offline leave when the
network returns, deletions follow, and on a conflict the most recent change wins. Each record's
identifier is managed by the database.

Each account has its own database on the device: once signed out, its records leave the page, and
what is waiting to be sent stays with that account. The fields of the local data must be those of
the server's data, with the same types. Each change goes back through the route: its rights and
checks apply, and a refused change is undone on the device, with a message. The most recent change
is decided record by record, by the server's clock, even if the device's time is wrong.

| Target | Database | Encryption key | When the network returns |
| --- | --- | --- | --- |
| web, desktop | IndexedDB | WebCrypto, non-extractable | on reopening and when the network returns, page open |
| Apple | SQLite | Keychain | app open |
| Android | SQLite | Android Keystore | even with the app closed (WorkManager) |
| Windows | SQLite | DPAPI | app open |

On the server, a deletion stays known for 180 days (`HUMALIS_SYNCHRO_JOURS`). A device away for longer
starts again from the server's data, without losing what it has not yet sent.

### Passwordless sign-in and the six-digit code

In the server, two lines open these doors on top of email and password:

```humalis
serveur "boutique" :
    connexion par cle d'acces
    double authentification
    donnee note :
        titre : texte
    route "notes" :
        connecte peut lire note
        connecte peut creer note
        connecte peut modifier note
        connecte peut supprimer note

page "compte" :
    titre "Compte"
    bouton "Ajouter une clé"
    quand l'utilisateur clique sur "Ajouter une clé" :
        ajouter cle d'acces
```

In pages, `se connecter par cle d'acces` opens sign-in with Face ID, Touch ID or Windows
Hello; `ajouter cle d'acces` adds a key to the signed-in account; `activer double authentification`
shows the QR code to scan in an authenticator app. The six-digit code is then asked for
automatically after the password.

Turning on the code or adding a passkey asks for the password again. The activation screen gives ten
single-use recovery codes. Five wrong codes close the account for fifteen minutes. A passkey does not
ask for a code: it already counts as two proofs. Signing in with Google or Apple does not either: the
provider verifies the person.

On the server, `ENCRYPTION_KEY` is required for the six-digit code, and `WEBAUTHN_ALLOWED_ORIGINS` gives
the site's addresses: the first one sets the passkeys' domain.

What passkeys need, target by target:

- **Web**: a site on https (or `localhost` during development).
- **Desktop (Electron)**: they are refused at compile time. The built-in browser does not accept the
  app's own address. The six-digit code works there.
- **Apple**: `--serveur https://…`, `--equipe`, and `WEBAUTHN_APPLE_APP` on the server, which publishes
  the domain association file.
- **Android**: a domain on https, `WEBAUTHN_ANDROID_APP` on the server (the package name, then the
  signing fingerprints), and a Google account on the device.
- **Windows**: Windows Hello set up on the machine, with no MSIX package.

### Several files

A large project is split into several files. At the top of the main file:

```humalis
utiliser fichier "./cart.humalis"
utiliser fichier "./catalogue.humalis"

page "home" :
    titre "Home"
```

Everything those files contain (pages, components, shared variables,
functions) joins the project. `humalis nouveau` already organises files this
way.

---

## 31. Testing in Humalis

A `*.test.humalis` file describes what a person does and what they should
see. `humalis tester` runs them in a real browser.

```humalis
page "home" :
    titre "Welcome"
    bouton "Say hello"
    quand l'utilisateur clique sur "Say hello" :
        afficher "Hello!"

test "the button says hello" de page "home" :
    verifier que texte "Welcome" est visible
    cliquer sur "Say hello"
    verifier que texte "Hello!" est visible
```

The other steps: `remplir champ "email" avec "…"` (fill a field), `aller vers
"cart"` (go to a page), `verifier que champ "email" vaut "…"` (a field's
value), `verifier que page est "cart"` (the current page) and `verifier que
texte "…" est absent` (a text is not shown).

---

## 32. Commands

| Command | Role |
|---|---|
| `humalis nouveau <name>` | creates a project |
| `humalis --version` | shows the installed version (`humalis --help`: the usage) |
| `humalis developper` | runs the site and recompiles it on every save |
| `humalis lancer <file>` | runs a file right away, in memory, with its server, installing nothing |
| `humalis compile <file> --cible <target> --sortie <folder>` | generates a target's project |
| `humalis compile <file> --cible web --composants <folder>` | generates React components to import elsewhere |
| `humalis verifier <file>` | shows errors and warnings |
| `humalis verifier <file> --exigeant` | also treats warnings as errors |
| `humalis formater <file>` | reformats the file |
| `humalis tester` | runs the `*.test.humalis` tests |
| `humalis packs` | says whether the Astratra packs have updates |

For web and static, `--adresse https://…` gives the site's final address
(sitemap, share links). For desktop, Apple, Android and Windows, `--serveur https://…` gives the address
of the server the application calls.

`--cible apple` generates an Xcode project in SwiftUI: a single native application
for iPhone, iPad and Mac, with no embedded browser (Xcode 16 or later; it runs on
iOS 17 and macOS 14 and later). To sign it, add
`--identifiant com.example.application` and `--equipe ABCDE12345`.

`--cible android` generates a native Android project, in Kotlin and Jetpack Compose,
built by Gradle: no embedded browser and no JavaScript. The application runs on
Android 8.0 and later. Open the folder in Android Studio, or build it with
`gradle assembleDebug`. `--identifiant com.example.application` sets its identifier.

`--cible windows` generates a .NET project in C# and WPF: a native application for
Windows 10 and 11, with no embedded browser. It builds with the .NET 10 SDK, on
Windows but also on macOS or Linux (`dotnet build`), and publishes as a single `.exe`
file (see "The Windows application" in chapter 33).

With `humalis developper`, every element of the page carries its Humalis
file and line: in the browser's inspector, a heading shows for example
`data-humalis-source="pages/accueil.humalis:12"` (the path starts from the
main file, the line is the one in that file). Hold the Alt key (Option on
Mac) and hover over an element: a small label shows the same reference next
to the cursor. `humalis compile` adds none of this: the published site stays
identical.

### Error messages

Messages are in French, with the line number, and often suggest the fix:

```
Erreur, ligne 3 : le texte utilise {totl}, mais la variable « totl » n'est pas déclarée. Peut-être « total » ?
```

(Error, line 3: the text uses {totl}, but the variable "totl" is not
declared. Perhaps "total"?)

The "Humalis" VS Code extension shows them as you type, with highlighting,
completion and hover help.

---

## 33. What each target can do

The same file produces every target. When a construct does not exist on a
target, the compiler says so clearly instead of producing something wrong.

| | web | static | mobile | desktop | apple | android | windows |
|---|---|---|---|---|---|---|---|
| Pages, elements, styles, theme | yes | yes | yes | yes | yes | yes | yes |
| Your own CSS | yes | yes | no (named styles only) | yes | partly (single-class rules; the rest is listed); to the point in a `dessinee pour` page, `@media` and dark mode included | partly (single-class rules; the rest is listed) | partly (single-class rules; the rest is listed) |
| Requests to a server | yes | yes | yes | yes | yes | yes | yes |
| `memorisee` | yes | yes | yes | yes | yes | yes | yes |
| `memorisee en secret` | no | no | yes | yes | yes (Keychain) | yes (Keystore) | yes (encrypted by Windows) |
| `essayer` | yes | no | yes | yes | yes | yes | yes |
| Keyboard shortcuts | yes | yes | no | yes | yes | yes (keyboard attached) | yes |
| Hand-written native view | no | no | no | no | yes (Swift, `sur apple`) | yes (Kotlin, `sur android`) | yes (C#, `sur windows`) |
| React components (older projects) | yes | no | yes (in React Native) | yes | no | no | no |
| The Humalis engine (the default) | yes | no | no | yes (except a React component or `memorisee en secret`) | no | no | no |
| Charts, maps, audio, video, files | yes | yes | partly | yes | yes | yes | yes |
| Several languages | yes | yes | yes | yes | yes | yes | yes |
| Photo, scanner, Face ID, vibration, signature, offline | yes (vibration: Android) | no | no | no | yes | yes | no |
| `en arriere plan` | no | no | no | no | yes | yes | yes (scheduled task) |
| Sitemap, share preview | yes | yes | no | no | no | no | no |

The server (`--cible serveur`) is generated separately, from the `serveur`
block.

### The Android application

`--cible android` writes readable Kotlin: each page is a Compose function, its
variables are state, and its events are functions that wait for the server without
blocking the screen. Navigation goes through Navigation Compose, and Android's back
button returns to the previous page. The icons are the same as on the web.

```sh
humalis compile taches.humalis --cible android --sortie taches-android --serveur https://api.mysite.com
```

- `memorisee` values stay on the device; `memorisee en secret` and the session go
  through a vault encrypted by the Android Keystore.
- From the emulator, the computer is called `10.0.2.2`: a server started on
  `http://localhost:3000` is reached automatically. Otherwise only `https://` is allowed.
- The application tabs are a bar at the bottom of the screen.

The whole language works on Android, as on Apple:

- **Languages and fonts**: the application starts in the device's language when the site
  has it; `selecteur de langue` and `changer langue par …` change it. Theme fonts shipped
  as `.ttf` or `.otf` are loaded.
- **Navigation**: sub-pages show inside their parent page, and a link to an anchor
  (`carte#desserts`) scrolls down to it. `liens profonds "magasin"` opens the application
  from `magasin://produit/42`; with `et domaine "…"`, `https://` links open it too: compile
  with `--empreinte` (the certificate's SHA-256 fingerprint, given by `keytool -list -v`)
  and publish the file written in `a-publier-sur-le-site/`.
- **Device**: `photo dans …`, `scanner code dans …`, `position dans …`, `verifier identite`
  (fingerprint, face or the device code), `vibrer` and `signature dans …`. Each permission
  is requested the first time it is needed.
- **Files**: `fichier "…" dans …` opens the system picker, `envoyer fichier …` follows its
  progress, `telecharger bon de …` and `telecharger … en csv` open or share the file.
- **Media**: charts keep the web's colors, scales and “Voir les données” table; maps show
  OpenStreetMap tiles and their attribution; audio and video go through Android's player and
  never start on their own.
- **Account**: invitations, account roles and fields, choosing a password from the link
  received, Google or Apple login, payment (Stripe's page opens in the browser),
  `demander a ia`, whose answer appears as it comes, and `activer notifications`, through
  Firebase Cloud Messaging (see “Notifications”).
- **Real time and offline**: `en direct`, `avec hors ligne`, `… hors ligne` sends (kept on
  the device, sent in order when the network returns) and `en arriere plan :` (run by the
  system about every quarter of an hour, when the network is there).
- **Motion and keyboard**: entrance animations and `effet leve` follow the device's
  “remove animations” setting. A list `avec deplacement` is reordered with a long press,
  then a drag; TalkBack offers “Move up” and “Move down” (named « Monter » and
  « Descendre »). With a keyboard attached, the page's shortcuts work.
  `menu de l'application` becomes the “⋮” menu at the top of the app, with its shortcuts.
- **Native components**: `actualiser en tirant` becomes pulling the page down,
  `action en glissant` slides the row to the left, `menu d'options` opens on a long press
  (TalkBack offers these actions too) and `etat vide` shows its icon in the middle.
- **App forms** (see “App-only forms”): the widget (Glance, refreshed by
  WorkManager and when leaving the app), received shares, opened files, the icon's
  shortcuts, the Quick Settings tile, the keyboard, the live activity (an ongoing
  notification with its progress, promoted on Android 16) and notification buttons.
  `sur montre` pages form a Wear OS module (`montre/`) and `sur tele` pages an Android TV
  module (`tele/`), driven by touch or by the remote. Voice commands go through Google
  Assistant's App Actions, which take no reply to speak: the app opens, shows the
  sentence and reads it aloud. System search stores the records in AppSearch, which the
  launcher may or may not show. Android Auto shows the list; Google must approve the app
  before it is published.
- **Sources**: a source with a secret key goes through the server's gateway, with the
  session; the key never ships with the app.

CSS becomes Compose, rule by rule, when a rule targets a class (`.card { … }`): background,
color, text size and weight, margins and padding, border, corner radius, shadow, width, and
the gap between children. A `utiliser style "./android.css" sur android` stylesheet applies
to Android only.

### The Windows application

```sh
humalis compile boutique.humalis --cible windows --sortie boutique-windows --serveur https://api.mysite.com
cd boutique-windows
dotnet build
dotnet publish -c Release -r win-x64
```

The generated folder is a readable .NET 10 project in C# and WPF, not meant to be
edited by hand. `dotnet publish` gives a single `.exe` file that contains .NET:
nothing to install on the PC (`-r win-arm64` for an ARM PC). Building also works on a
Mac or on Linux; only running it needs Windows 10 or 11.

- The look follows Windows 11 (Fluent theme), light or dark like the system;
  `changer theme par sombre` changes that choice, and it is kept.
- One page at a time, with a Back button, `Alt+←` and the mouse's back button.
- The Humalis server is called with the same session as the Apple application: the
  token is kept encrypted by Windows, readable only by the person signed in to the
  Windows session. `memorisee` goes to `%LOCALAPPDATA%`.
- Several languages: the selector, `changer langue`, and numbers, prices and dates
  written the way the chosen language writes them; the choice is kept on the PC.
- Charts, maps (OpenStreetMap tiles, or another provider with `tuiles`), audio and
  video with their transcript, QR codes, SVG images, choosing and uploading files,
  `sous page`, anchors and the application's tabs.
- `partager …` copies the text (and the link) to the clipboard.
- `en direct`: the list is read again when the server announces a change, as long as the
  page is open.
- Animations and hover effects are not drawn yet; the compiler says so.
- What Humalis cannot do yet is written in C#: `utiliser composant "Carte" sur windows
  "./natif/Carte.cs"`, with its NuGet libraries (`paquet windows "…" version "…"`); see
  "A hand-written native view".
- Not on Windows yet: payment, AI, signing in with Google or Apple, invitations,
  notifications sent by the server. Compilation stops and says which line needs them.

The app-specific forms work without an MSIX package: the app registers itself with Windows
at each launch, for the signed-in person, without administrator rights. It only runs once:
an opened file, a right-click or a notification button is passed to the window already open.

- `page "…" dans la barre du systeme`: an icon in the notification area. A click opens the
  page in a small window next to the icon; right-click offers Open and Quit. Closing the
  app's window hides it without stopping it.
- `raccourcis de l'icone`: the jump list of the taskbar button.
- `quand on ouvre un fichier`: the app appears in "Open with" for these extensions.
  Windows 10 and 11 let the person choose the default app.
- `lancer au demarrage de l'ordinateur`: shown in Task Manager ("Startup apps");
  `avec discret`, only in the notification area.
- `quand l'utilisateur touche "…" dans une notification`: Windows notifications with their
  buttons; a button answers without opening the window.
- `menu clic droit`: the File Explorer right-click. On Windows 11 the command is under
  "Show more options" (or Shift+F10), as for any unpackaged app.
- `quand on partage vers l'application`: the Windows "Share" panel only accepts packaged
  (MSIX) apps. Without a package, the app is in the right-click "Send to" menu:
  `partage.fichier` is the file path, `partage.texte` the text of a `.txt`, `partage.lien`
  the address of an Internet shortcut. The compiler reminds you.

`Application.exe --desinstaller` removes everything the app registered: run it before
deleting the `.exe` file.

Without code signing, Windows shows a warning (SmartScreen) on first launch: "More
info", then "Run anyway".

---

### The Humalis rendering engine

The website is produced by the Humalis engine: it is the default.

```sh
humalis compile site.humalis --cible web --sortie site
```

Each page is an HTML file already written by the compiler, which a small script
picks up without rebuilding it. When a variable changes, only what reads it
changes. The site can also be produced with React: write `--moteur react`, or once for a project in
`humalis.projet.json`: `"moteur": "react"`; `humalis developper` and
`humalis tester` use it too. A program that uses what the engine cannot do yet is
produced with React: the compiler says why.

The desktop app also takes the engine's pages, one per address. It switches to
React for a React component or a value `memorisee en secret`.

Modules (`utiliser module`), components (React, Vue, Svelte) and Web Components
work the same way: the file is loaded only by the pages that use it. Anything shown after
loading (data from the server, a component) is not in the initial HTML.

A click made before the page is ready is not lost: it is replayed as soon as the
page is ready.

`pour chaque t dans taches avec animation :` makes rows slide when the list
changes, and new rows fade in (unless the person asked for less motion). It works
on the web: elsewhere the compiler says so and rows change without
sliding.

#### Real time

`en direct` keeps a page up to date when the server changes:

```humalis
page "commandes" :
    variable commandes = []
    titre "Commandes"
    quand la page se charge :
        envoyer requete vers "commandes" dans commandes en direct
```

An order created elsewhere appears by itself, without a reload. The server only
announces that something changed: the page then re-reads the normal route, with its
access rules, so nothing private travels through this channel. It works on the web,
on the desktop, on Apple, on Android and on
Windows. After a connection loss, the page reconnects by itself and catches up with what
changed. The `mobile` target (Expo) and static pages read the list once, and the compiler
says so.

With a PostgreSQL database you can run several copies of the server: a change received
by one is announced by all. Without PostgreSQL, keep a single copy. Changes close
together are grouped, and pages do not all re-read at the same moment.

#### Reading the server at build time

To have public pages carry their content in the HTML, give your server's address
in `humalis.projet.json`:

```json
{ "principal": "site.humalis", "moteur": "humalis", "lireServeur": "https://api.example.com" }
```

Nothing is read unless you ask. Four rules always apply:

- only `tout le monde peut lire` routes are read, never a restricted page;
- the read is anonymous: no key, no cookie;
- whatever comes from the server is written as text, never as code;
- the address uses https, and a redirect is not followed.

For a `source`, name each public route: `"lireSources": ["api/products"]`.
A source that sends a key is never read.

Data removed from the server stays in the HTML until the next build: rebuild the
site after an important deletion.

## 34. Capture application errors

Place this form at the top of the file. Its body receives `erreur.message`, `erreur.pile`, `erreur.page`, and `erreur.version`.

```humalis
quand une erreur arrive :
    envoyer requete vers "https://centrale.exemple.fr/v1/envoi" avec message = erreur.message et pile = erreur.pile
```

The capture uses each target's native error hooks. Fatal Apple and Android errors are saved and sent on the next launch. The same form can appear inside `serveur "api" :`. HTTPS requests time out after three seconds; sending failures are swallowed, and the same error is limited to three reports per minute. Passwords, secrets, URL parameters, and form contents are not sent.

## 35. Recording and cropping media

Inside an event, declare a file variable with `rien`, then use `enregistrer audio dans note`, `enregistrer video dans clip`, `scanner document dans facture`, or `recadrer photo`. These are French language keywords. The result is a file, like `photo dans photo`, which can be displayed or sent to a server. Canceling keeps the previous value. Recording and cropping are available on the web, desktop, Apple, Android, and Windows targets. Document scanning exists on Apple and Android; other targets reject it at compile time.

Each recording opens a screen with the duration, Start, Stop, playback, Start over, Confirm, and Cancel. By target:

- **Apple**: sound is an `.m4a` file and video a `.mov` in H.264. The microphone and camera are declared in the project only when used. `scanner document` uses the iPhone and iPad scanner; a Mac has none, so the person picks images or a PDF.
- **Android**: sound is an `.m4a` and video an `.mp4` (CameraX). `scanner document` uses Google's scanner, which needs up-to-date Google Play services; without them, the person reads a clear message.
- **Windows**: sound is an `.m4a` and video an `.mp4`, with no MSIX package. If the microphone or camera is denied to desktop apps in Settings, Privacy, the person reads a clear message.

A scanned document is always a PDF; `facture.apercu` shows an image of its first page.

## French keywords at a glance

| Humalis | English |
|---|---|
| `page`, `titre`, `soustitre`, `texte` | page, title, subtitle, text |
| `image`, `bouton`, `lien … vers` | image, button, link … to |
| `champ`, `formulaire`, `choix`, `liste deroulante`, `case a cocher` | field, form, choice, drop-down, checkbox |
| `section`, `bloc`, `ligne`, `colonne`, `grille` | section, box, row, column, grid |
| `entete`, `pied`, `menu`, `fil d'Ariane` | header, footer, menu, breadcrumb |
| `onglets`, `deroulant`, `accordeon`, `carrousel`, `fenetre` | tabs, collapsible, accordion, carousel, dialog |
| `icone`, `etoiles`, `compteur`, `progression`, `chargement` | icon, stars, stepper, progress bar, loading |
| `graphique`, `carte`, `marqueur`, `audio`, `video`, `fichier` | chart, map, marker, audio, video, file |
| `avec … et …` | with … and … |
| `couleur`, `fond`, `taille`, `nom`, `style` | colour, background, size, name, CSS class |
| `desactive`, `desactive si` | disabled, disabled if |
| `variable`, `calcul`, `constante`, `fiche` | variable, computed value, constant, record |
| `vrai`, `faux`, `rien` | true, false, nothing |
| `si`, `sinon`, `et`, `ou`, `n'est pas`, `non` | if, otherwise, and, or, is not, not |
| `est egal a`, `est superieur a`, `est inferieur a`, `est vide`, `contient` | equals, greater than, less than, is empty, contains |
| `pour chaque … dans` | for each … in |
| `ajouter … à`, `retirer … de`, `nombre de` | add … to, remove … from, count of |
| `trier … par`, `dont`, `grouper … par` | sort … by, whose (filter), group … by |
| `repeter … fois`, `tant que`, `selon … cas` | repeat … times, while, switch … case |
| `fonction … avec`, `rendre` | function … with, return |
| `quand`, `l'utilisateur clique sur`, `la page se charge` | when, the user clicks on, the page loads |
| `le formulaire … est soumis` | the form … is submitted |
| `afficher`, `montrer`, `cacher`, `changer … par` | show a message, show, hide, change … to |
| `rediriger vers`, `revenir vers` | go to, go back to |
| `envoyer requete vers … dans … avec` | send a request to … into … with |
| `essayer`, `si erreur` | try, if error |
| `confirmer`, `copier`, `partager` | confirm, copy, share |
| `apres … secondes`, `toutes les … secondes` | after … seconds, every … seconds |
| `partagee`, `memorisee` | shared, remembered |
| `serveur`, `donnee`, `route`, `source` | server, data type, route, external API |
| `tout le monde`, `connecte`, `seul admin` | everyone, logged-in users, admins only |
| `lire`, `creer`, `modifier`, `supprimer` | read, create, update, delete |
| `seul son auteur`, `donnees de depart pour`, `avant` | only its author, starting data for, formerly |
| `se connecter`, `se deconnecter`, `utilisateur` | log in, log out, user |
| `langues`, `traductions`, `selecteur de langue` | languages, translations, language switcher |
| `composant`, `parametre`, `utiliser` | component, parameter, use |
