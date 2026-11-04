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

When you like the site, compile it to the target you want:

```sh
humalis compile my-project.humalis --cible web --sortie my-project-web
```

The targets (`--cible`) are `web`, `statique` (static), `mobile`, `desktop`
and `serveur` (server); `--sortie` is the output folder. The
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

On the static target, the scrollbar stays the window's. On a phone the whole page
scrolls: `hauteur ecran` and `defilement interne` have no effect, and a warning
says so.

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

The currencies: `euros`, `dollars` and `FC` (Congolese franc). Amounts are
written the French way (`1 234,50 €`); the plural adds an "s".

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
`moins 1 semaine` (minus 1 week), `jours entre` (days between). Dates are
displayed in French ("2 novembre 2026"); `{ordered depuis}` writes "il y a 5
minutes" (5 minutes ago). You can shift by `jours` (days), `semaines` (weeks)
or `mois` (months).

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
`https://your-site/auth-google.html`. Web and desktop targets only, for now.

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
Humalis warns when a title or description is too long or too short for search
engines.

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

### A React component

An existing React component is used like a Humalis component (web and
desktop):

```humalis
utiliser composant "Carte" depuis "./composants/Carte"

page "home" :
    titre "Home"
    Carte avec titre "School supplies"
```

The other way round, `humalis compile … --composants <folder>` generates React
components to import into an existing React project.

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
| `humalis compile <file> --cible <target> --sortie <folder>` | generates a target's project |
| `humalis compile <file> --cible web --composants <folder>` | generates React components to import elsewhere |
| `humalis verifier <file>` | shows errors and warnings |
| `humalis verifier <file> --exigeant` | also treats warnings as errors |
| `humalis formater <file>` | reformats the file |
| `humalis tester` | runs the `*.test.humalis` tests |
| `humalis packs` | says whether the Astratra packs have updates |

For web and static, `--adresse https://…` gives the site's final address
(sitemap, share links). For desktop, `--serveur https://…` gives the address
of the server the application calls.

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

| | web | static | mobile | desktop |
|---|---|---|---|---|
| Pages, elements, styles, theme | yes | yes | yes | yes |
| Your own CSS | yes | yes | no (named styles only) | yes |
| Requests to a server | yes | yes | yes | yes |
| `memorisee` | yes | yes | yes | yes |
| `memorisee en secret` | no | no | yes | yes |
| `essayer` | yes | no | yes | yes |
| Keyboard shortcuts | yes | yes | no | yes |
| React components | yes | no | yes (in React Native) | yes |
| Sitemap, share preview | yes | yes | no | no |

The server (`--cible serveur`) is generated separately, from the `serveur`
block.

---

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
| `graphique`, `carte`, `marqueur`, `audio`, `fichier` | chart, map, marker, audio, file |
| `avec … et …` | with … and … |
| `couleur`, `fond`, `taille`, `nom`, `style` | colour, background, size, name, CSS class |
| `variable`, `calcul`, `constante`, `fiche` | variable, computed value, constant, record |
| `vrai`, `faux`, `rien` | true, false, nothing |
| `si`, `sinon`, `et`, `ou`, `n'est pas` | if, otherwise, and, or, is not |
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
| `se connecter`, `se deconnecter`, `utilisateur` | log in, log out, user |
| `langues`, `traductions`, `selecteur de langue` | languages, translations, language switcher |
| `composant`, `parametre`, `utiliser` | component, parameter, use |
