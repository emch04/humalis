import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { genererProjetWindows, MARQUE_WINDOWS } from '../../src/cibles/windows/projet.js';
import { chaineCs, nomApplication, nomCs, nombreCs } from '../../src/cibles/windows/noms.js';
import { couleurCss, reglesDeClasses, styleDesDeclarations } from '../../src/cibles/windows/styles.js';
import { pourLaCible } from '../../src/ri/plateforme.js';

const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const produire = (source: string, options = {}) => genererProjetWindows(compile(source), { nom: 'essai', source: 'essai.humalis', ...options });
const projet = (source: string, options = {}) => {
  const { fichiers, diagnostics } = produire(source, options);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return fichiers;
};

const COMPTEUR = `page "compteur" :
    variable clics = 0
    calcul double = clics * 2
    titre "Compteur"
    texte "Tu as cliqué {clics} fois"
    bouton "Cliquer"
    si clics est superieur a 3 :
        texte "Bravo"
    quand l'utilisateur clique sur "Cliquer" :
        changer clics par clics + 1
`;

describe('cible Windows — le projet .NET', () => {
  const fichiers = projet(COMPTEUR);

  it('produit un projet complet en C#, sans navigateur embarqué', () => {
    for (const f of [MARQUE_WINDOWS, 'LISEZMOI.md', 'Essai.csproj', 'app.manifest', 'App.cs', 'Pages.cs', 'Pages/PageCompteur.cs', 'Humalis/Valeurs.cs', 'Humalis/Reactif.cs', 'Humalis/Interface.cs', 'Humalis/Systeme.cs', 'Humalis/Serveur.cs', 'Humalis/Couleurs.cs', 'Humalis/Styles.cs']) {
      expect(fichiers.has(f), f).toBe(true);
    }
    const tout = [...fichiers.values()].join('\n');
    expect(tout).not.toMatch(/WebView|electron|react/i);
  });

  it('une application WPF sur .NET 10, qui se compile aussi depuis macOS', () => {
    const csproj = fichiers.get('Essai.csproj')!;
    expect(csproj).toContain('<TargetFramework>net10.0-windows</TargetFramework>');
    expect(csproj).toContain('<UseWPF>true</UseWPF>');
    expect(csproj).toContain('<EnableWindowsTargeting>true</EnableWindowsTargeting>');
    expect(csproj).toContain('<Nullable>enable</Nullable>');
  });

  it('se publie en un seul fichier .exe avec .NET dedans, seulement quand on vise un processeur', () => {
    const csproj = fichiers.get('Essai.csproj')!;
    expect(csproj).toContain(`<PropertyGroup Condition="'$(RuntimeIdentifier)' != ''">`);
    expect(csproj).toContain('<PublishSingleFile>true</PublishSingleFile>');
    expect(csproj).toContain('<SelfContained>true</SelfContained>');
  });

  it('Windows 10 et 11, net sur chaque écran', () => {
    const manifeste = fichiers.get('app.manifest')!;
    expect(manifeste).toContain('{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}');
    expect(manifeste).toContain('PerMonitorV2');
  });

  it('le démarrage règle le serveur, le dossier des données et le thème, puis ouvre la première page', () => {
    const app = projet(COMPTEUR, { serveur: 'https://api.exemple.fr', identifiant: 'dev.exemple.compteur' }).get('App.cs')!;
    expect(app).toContain('Configuration.Serveur = "https://api.exemple.fr";');
    expect(app).toContain('Configuration.Identifiant = "dev.exemple.compteur";');
    expect(app).toContain('Apparence.Appliquer();');
    expect(app).toContain('Routeur.Aller(Pages.Entree);');
    expect(fichiers.get('Pages.cs')).toContain('public const string Entree = "compteur";');
  });

  it('le thème suit Windows (Fluent, clair ou sombre)', () => {
    expect(fichiers.get('Humalis/Systeme.cs')).toContain('ThemeMode.System');
  });
});

describe('cible Windows — la réactivité', () => {
  const page = projet(COMPTEUR).get('Pages/PageCompteur.cs')!;

  it('une variable est un Signal, un calcul une propriété recalculée', () => {
    expect(page).toContain('private readonly Signal clics;');
    expect(page).toContain('clics = new Signal(0d);');
    expect(page).toContain('private object? double_ => V.Fois(clics.Lire(), 2d);');
  });

  it('un texte lit sa variable, écrite à la française', () => {
    expect(page).toContain('UI.Texte(() => ("Tu as cliqué " + V.Nombre(clics.Lire()) + " fois"), "texte_ligne_5")');
  });

  it('un bouton appelle la méthode de son événement', () => {
    expect(page).toContain('UI.Bouton(() => "Cliquer", () => QuandCliqueBoutonCliquer(), "bouton_cliquer")');
    expect(page).toMatch(/private async Task QuandCliqueBoutonCliquer\(\)\s+\{\s+clics\.Ecrire\(V\.Plus\(clics\.Lire\(\), 1d\)\);/);
  });

  it('une condition ne construit que sa branche', () => {
    expect(page).toContain('UI.Si(() => (V.Comparer(clics.Lire(), 3d) > 0), () => UI.Texte(() => "Bravo", "texte_bravo"))');
  });

  it('le C# s\'indente de quatre espaces', () => {
    expect(page).toContain('\n    private readonly Signal clics;');
  });
});

describe('cible Windows — listes, formulaires et événements', () => {
  const page = projet(`page "taches" :
    variable taches = ["Lire"]
    formulaire "Nouvelle" :
        champ "Tâche" avec obligatoire
        champ email "Courriel"
        bouton "Ajouter"
    quand le formulaire "Nouvelle" est soumis :
        ajouter champ "Tâche" a taches
        vider champ "Tâche"
    pour chaque t dans taches :
        ligne :
            texte t
            bouton "Retirer" avec nom "retirer"
            quand l'utilisateur clique sur "retirer" :
                confirmer "Retirer {t} ?" :
                    retirer t de taches
`).get('Pages/PageTaches.cs')!;

  it('un champ a son Signal, et Entrée envoie le formulaire', () => {
    expect(page).toContain('private readonly Signal champTache = new("");');
    expect(page).toContain('UI.Champ("champ_tache", "Tâche", champTache, "texte", entree: () => UI.Lancer(() => QuandEnvoieFormulaireNouvelle()))');
    expect(page).toContain('UI.Champ("champ_courriel", "Courriel", champCourriel, "email"');
  });

  it('le bouton d\'un formulaire l\'envoie, en bouton principal', () => {
    expect(page).toContain('UI.Bouton(() => "Ajouter", () => QuandEnvoieFormulaireNouvelle(), "bouton_ajouter", null, null, principal: true)');
  });

  it('les vérifications passent avant l\'envoi', () => {
    expect(page).toContain('if (V.Vide(champTache.Valeur)) { Messages.Afficher("Le champ « Tâche » est obligatoire.", "erreur"); return; }');
    expect(page).toContain('V.Correspond(champCourriel.Valeur, "^[^\\\\s@]+@[^\\\\s@]+\\\\.[^\\\\s@]+$")');
    expect(page).toContain('taches.Ecrire(V.Ajouter(taches.Valeur, champTache.Lire()));');
    expect(page).toContain('champTache.Ecrire("");');
  });

  it('une boucle donne sa variable aux événements écrits dedans', () => {
    expect(page).toContain('UI.Pour(() => taches.Lire(), (t, hRang');
    expect(page).toContain('UI.Bouton(() => "Retirer", () => QuandCliqueRetirer(t), "retirer")');
    expect(page).toContain('private async Task QuandCliqueRetirer(object? t)');
    expect(page).toContain('if (await Messages.Confirmer(("Retirer " + V.T(t) + " ?")))');
  });

  it('une ligne ou une grille dont le contenu est une boucle y place chaque élément', () => {
    const grille = projet(`page "p" :
    variable l = [1, 2]
    grille avec colonnes 3 :
        pour chaque x dans l :
            texte "{x}"
`).get('Pages/PageP.cs')!;
    expect(grille).toContain('new GrilleHumalis { Colonnes = 3 })');
  });
});

describe('cible Windows — fenêtres, minuteries, raccourcis', () => {
  const page = projet(`page "accueil" :
    variable secondes = 0
    variable compteur = vrai
    titre "Accueil"
    texte "Compteur" avec nom "affichage"
    bouton "Aide" avec raccourci "controle+k"
    quand l'utilisateur clique sur "Aide" :
        montrer "Aide"
        changer texte de "affichage" par "Aide ouverte"
    fenetre "Aide" :
        texte "Bonjour"
    toutes les 1 seconde tant que compteur est vrai :
        changer secondes par secondes + 1
`).get('Pages/PageAccueil.cs')!;

  it('une fenêtre est fermée au départ, « montrer » l\'ouvre', () => {
    expect(page).toContain('Fenetre("fenetre_aide", "Aide", () => UI.Texte(() => "Bonjour", "texte_bonjour"))');
    expect(page).toContain('Visibilite("fenetre_aide", false).Ecrire(true);');
  });

  it('« changer texte de » remplace le texte affiché', () => {
    expect(page).toContain('UI.Texte(() => TexteDe("affichage", () => "Compteur"), "affichage")');
    expect(page).toContain('ChangerTexte("affichage", "Aide ouverte");');
  });

  it('une minuterie démarre au chargement et s\'arrête quand on quitte la page', () => {
    expect(page).toContain('Minuterie.Toutes(1000d, async () =>');
    expect(page).toContain('}, () => V.B(compteur.Lire()));');
    expect(page).toMatch(/Arreter\(hMinuterie\d+\);/);
    expect(page).toContain('public override async Task Charger()');
  });

  it('un raccourci clavier clique sur son bouton', () => {
    expect(page).toContain('case "controle+k": UI.Lancer(QuandCliqueBoutonAide); return true;');
  });
});

describe('cible Windows — la navigation', () => {
  const fichiers = projet(`page "accueil" :
    titre "Accueil"
    lien "Produit 3" vers "produit" avec id 3
    bouton "Retour"
    quand l'utilisateur clique sur "Retour" :
        revenir

page "produit" avec parametre id :
    titre "Produit {id}"

page "commandes" a l'adresse "/compte/commandes" :
    titre "Commandes"
`);

  it('un lien ouvre la page avec ses paramètres', () => {
    expect(fichiers.get('Pages/PageAccueil.cs')).toContain('UI.Lien(() => "Produit 3", () => Routeur.AllerVers("produit", new Arguments { ["id"] = 3d }), "lien_produit_3")');
    expect(fichiers.get('Pages/PageAccueil.cs')).toContain('Routeur.Revenir();');
  });

  it('la page lit son paramètre', () => {
    const produit = fichiers.get('Pages/PageProduit.cs')!;
    expect(produit).toContain('id = new Signal(arguments.Lire("id"));');
    expect(produit).toContain('V.T(id.Lire())');
  });

  it('chaque page se crée par son nom, et se retrouve par son adresse', () => {
    const pages = fichiers.get('Pages.cs')!;
    expect(pages).toContain('"produit" => new PageProduit(arguments),');
    expect(pages).toContain('if (morceaux.Length == 2 && morceaux[0] == "produit") return ("produit", new Arguments { ["id"] = System.Uri.UnescapeDataString(morceaux[1]) });');
    expect(pages).toContain('if (morceaux.Length == 2 && morceaux[0] == "compte" && morceaux[1] == "commandes") return ("commandes", new Arguments {  });');
  });

  it('la fenêtre a un bouton Retour, Alt+← et le bouton arrière de la souris', () => {
    const systeme = fichiers.get('Humalis/Systeme.cs')!;
    expect(systeme).toContain('AutomationProperties.SetAutomationId(retour, "humalis_revenir");');
    expect(systeme).toContain('touche == Key.Left && Keyboard.Modifiers == ModifierKeys.Alt');
    expect(systeme).toContain('MouseButton.XButton1');
  });
});

describe('cible Windows — le serveur et la connexion', () => {
  const SOURCE = `serveur "magasin" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        tout le monde peut creer produit

variable panier = [] avec partagee et memorisee

page "catalogue" :
    variable produits = []
    variable code = "" avec memorisee en secret
    titre "Catalogue"
    quand la page se charge :
        envoyer requete vers "produits" dans produits
    pour chaque p dans produits :
        texte "{p.nom} : {p.prix en euros}"
    formulaire "Ajout" :
        champ "Nom" avec obligatoire
        bouton "Créer"
    quand le formulaire "Ajout" est soumis :
        envoyer requete vers "produits" avec le champ "Nom"

page "connexion" :
    titre "Connexion"
    formulaire "connexion" :
        champ email "email" avec obligatoire
        champ mot de passe "mot de passe" avec obligatoire
        bouton "Se connecter"
    quand le formulaire "connexion" est soumis :
        se connecter avec champ "email" et champ "mot de passe"
        continuer vers "espace"

page "espace" reservee a connecte sinon vers "connexion" :
    titre "Espace"
    si utilisateur est admin :
        texte "Admin"
    bouton "Sortir"
    quand l'utilisateur clique sur "Sortir" :
        se deconnecter
`;
  const fichiers = projet(SOURCE);
  const catalogue = fichiers.get('Pages/PageCatalogue.cs')!;

  it('une lecture remplit sa variable, sans qu\'une réponse en retard remplace une plus récente', () => {
    expect(catalogue).toContain('var hJeton1 = Jeton("produits");');
    expect(catalogue).toContain('var (hOk1, hValeur1) = await Serveur.Lire("/api/produits");');
    expect(catalogue).toContain('if (hOk1 && hValeur1 is not null && EstDernier("produits", hJeton1)) produits.Ecrire(hValeur1);');
  });

  it('le champ d\'une donnée se lit sous son nom JSON, un prix s\'écrit en euros', () => {
    expect(catalogue).toContain('V.Argent(V.Champ(p, "prix"), "EUR")');
  });

  it('un envoi refusé arrête la soumission du formulaire', () => {
    expect(catalogue).toContain('if (!await Serveur.Reussi("/api/produits", envoi: V.FicheDe(("nom", champNom.Lire())))) return;');
  });

  it('memorisee garde la variable sur le PC, en secret dans le coffre de Windows', () => {
    expect(catalogue).toContain('code = Memoire.Garder("catalogue.code", "", secret: true);');
    expect(fichiers.get('Humalis/Partage.cs')).toContain('public static readonly Signal panier = Memoire.Garder("partage.panier", V.ListeDe());');
    expect(fichiers.get('Humalis/Systeme.cs')).toContain('CryptProtectData');
  });

  it('la connexion passe par la session ; un refus s\'affiche et arrête la suite', () => {
    const connexion = fichiers.get('Pages/PageConnexion.cs')!;
    expect(connexion).toContain('if (!await Session.AfficherSiRefus(() => Session.SeConnecter(V.T(champEmail.Lire()), V.T(champMotDePasse.Lire())))) return;');
    expect(connexion).toContain('Routeur.Continuer("espace");');
    expect(connexion).toContain('champ_mot_de_passe", "mot de passe", champMotDePasse, "motDePasse"');
  });

  it('une page réservée renvoie les visiteurs, et lit qui est connecté', () => {
    const espace = fichiers.get('Pages/PageEspace.cs')!;
    expect(espace).toContain('public override string? Reservee => "connecte";');
    expect(espace).toContain('public override string? Sinon => "connexion";');
    expect(espace).toContain('UI.Si(() => V.B(Session.Admin),');
    expect(espace).toContain('await Session.SeDeconnecter();');
  });

  it('la session voyage par un jeton gardé chiffré, renouvelé sur un refus 401 ; un visiteur renvoie le jeton CSRF', () => {
    const serveur = fichiers.get('Humalis/Serveur.cs')!;
    expect(serveur).toContain('"/auth/login"');
    expect(serveur).toContain('"/auth/refresh"');
    expect(serveur).toContain('"/auth/me"');
    expect(serveur).toContain('"Bearer " + jeton');
    expect(serveur).toContain('astratra_csrf=');
    expect(serveur).toContain('x-csrf-token');
    expect(serveur).toContain('HUMALIS_SERVEUR');
  });
});

describe('cible Windows — styles et thème', () => {
  const SOURCE = `theme :
    couleur marque "#1f7a5c"

style "carte" :
    fond blanc
    arrondi 12
    espace interieur 16

style :
    .encadre { padding: 12px; border: 1px solid #ccc; color: rgba(0, 0, 0, 0.5); display: flex; }
    .a .b { color: red; }

page "accueil" :
    titre "Accueil"
    bloc avec style "carte" :
        texte "Dans la carte"
    texte "Encadré" avec style "encadre"
    texte "Sur la marque" avec fond marque et taille grande
`;
  const { fichiers, diagnostics } = produire(SOURCE);

  it('un style écrit en Humalis devient un StyleHumalis nommé', () => {
    expect(fichiers.get('Humalis/Styles.cs')).toMatch(/public static StyleHumalis Carte => new\(\) \{ Fond = Apparence\.Pinceau\("#[0-9A-F]{6}"\), Arrondi = 12, Remplissage = new Thickness\(16\) \};/);
  });

  it('une règle CSS qui vise une classe se traduit ; le reste est dit, jamais perdu en silence', () => {
    expect(fichiers.get('Humalis/Styles.cs')).toContain('public static StyleHumalis Encadre => new() { Remplissage = new Thickness(12), Bordure = new Thickness(1), CouleurBordure = Apparence.Pinceau("#CCCCCC"), Couleur = Apparence.Pinceau("#80000000") };');
    const avertissement = diagnostics.find((d) => d.message.includes('CSS'));
    expect(avertissement?.gravite).toBe('avertissement');
    expect(avertissement?.message).toContain('display: flex');
    expect(fichiers.get('CSS-SUR-WINDOWS.md')).toContain('display: flex');
  });

  it('les options d\'un élément lisent les couleurs du thème, en clair et en sombre', () => {
    const page = fichiers.get('Pages/PageAccueil.cs')!;
    expect(page).toContain('new StyleHumalis { Taille = 28, Fond = Couleurs.Marque, Couleur = Couleurs.EncreMarque, Remplissage = new Thickness(8, 4, 8, 4) }');
    expect(page).toContain('Styles.Carte');
    expect(fichiers.get('Humalis/Couleurs.cs')).toContain('public static Brush Marque => Apparence.Choisir("#1f7a5c",');
  });

  it('les couleurs CSS : hexadécimales, nommées, rgba et variables du thème', () => {
    const couleurs = new Set(['marque']);
    expect(couleurCss('#abc', couleurs)).toBe('Apparence.Pinceau("#AABBCC")');
    expect(couleurCss('#11223344', couleurs)).toBe('Apparence.Pinceau("#44112233")');
    expect(couleurCss('white', couleurs)).toBe('Apparence.Pinceau("#FFFFFF")');
    expect(couleurCss('var(--marque)', couleurs)).toBe('Couleurs.Marque');
    expect(couleurCss('hsl(0, 0%, 0%)', couleurs)).toBeUndefined();
  });

  it('les déclarations et les règles CSS', () => {
    expect(styleDesDeclarations([['font-size', '1.5rem'], ['font-weight', '600'], ['max-width', '40rem']], new Set()).proprietes).toEqual(['Taille = 24', 'Graisse = FontWeights.SemiBold', 'LargeurMax = 640']);
    expect(reglesDeClasses('.a { color: red } .b, .c { margin: 0 } @media (x) { .d { color: blue } } .e .f { x: y }')).toEqual({
      regles: [{ classe: 'a', declarations: [['color', 'red']] }, { classe: 'b', declarations: [['margin', '0']] }, { classe: 'c', declarations: [['margin', '0']] }],
      autres: 2,
    });
  });
});

describe('cible Windows — un design propre à Windows (« sur windows »)', () => {
  const SOURCE = `utiliser style "./site.css" sur site
utiliser style "./windows.css" sur windows

page "accueil" :
    titre "Bonjour" avec style "titre"
    bouton "Commander" avec style "principal" et sur windows style "large"
    sur windows :
        texte "Seulement sous Windows"
    sur site et windows :
        texte "Web et Windows"
    sur site :
        texte "Seulement le web"
`;
  const fichiersStyle = new Map([['./site.css', '.titre { color: blue; }'], ['./windows.css', '.titre { color: green; }\n.large { padding: 20px; }']]);
  const pour = (cible: string) => pourLaCible(compile(SOURCE), cible);

  it('la feuille « sur windows » sert à Windows, la feuille « sur site » non : pas besoin de CSS commun', () => {
    const { fichiers } = genererProjetWindows(pour('windows'), { nom: 'essai', source: 'essai.humalis', fichiersStyle });
    const styles = fichiers.get('Humalis/Styles.cs')!;
    expect(styles).toContain('public static StyleHumalis Titre => new() { Couleur = Apparence.Pinceau("#008000") };');
    expect(styles).toContain('public static StyleHumalis Large => new() { Remplissage = new Thickness(20) };');
    expect(styles).not.toContain('#0000FF');
  });

  it('« et sur windows style » et « sur windows : » ne valent que sous Windows', () => {
    const page = genererProjetWindows(pour('windows'), { nom: 'essai', source: 'essai.humalis', fichiersStyle }).fichiers.get('Pages/PageAccueil.cs')!;
    expect(page).toContain('Styles.Large');
    expect(page).toContain('"Seulement sous Windows"');
    expect(page).toContain('"Web et Windows"');
    expect(page).not.toContain('Seulement le web');
  });

  it('les autres cibles ignorent ce qui vise Windows', () => {
    for (const cible of ['web', 'apple', 'mobile', 'desktop', 'statique']) {
      const app = pour(cible);
      const texte = JSON.stringify(app.ecrans);
      expect(texte, cible).not.toContain('Seulement sous Windows');
      expect(texte, cible).not.toContain('"large"');
      expect(app.fichiersStyle.some((f) => f.plateforme === 'windows'), cible).toBe(false);
    }
    expect(JSON.stringify(pour('web').ecrans)).toContain('Web et Windows');
  });

  it('« windows » est une plateforme connue du langage', () => {
    const { diagnostics } = compiler(`page "a" :\n    sur windos :\n        texte "x"\n`);
    expect(diagnostics.some((d) => d.gravite === 'erreur')).toBe(true);
    const { diagnostics: bien } = compiler(`page "a" :\n    titre "a"\n    sur windows :\n        texte "x"\n`);
    expect(bien.filter((d) => d.gravite === 'erreur')).toEqual([]);
  });
});

describe('cible Windows — plusieurs langues', () => {
  const SOURCE = `langues :
    francais
    anglais

page "accueil" :
    variable panier = 3
    selecteur de langue
    titre "Bonjour" en anglais "Hello"
    texte "{panier article}" en anglais "{panier item}"
    formulaire "contact" :
        champ email "Courriel" en anglais "Email" avec obligatoire
        bouton "Envoyer" en anglais "Send"
    quand le formulaire "contact" est soumis :
        si langue est anglais :
            changer langue par francais
`;
  const fichiers = projet(SOURCE);
  const page = fichiers.get('Pages/PageAccueil.cs')!;

  it('un texte traduit choisit sa version selon la langue', () => {
    expect(page).toContain('UI.Titre(1, () => Langues.T(("fr", "Bonjour"), ("en", "Hello")), "titre_bonjour")');
    expect(page).toContain('Langues.T(("fr", V.Accorder(panier.Lire(), "article")), ("en", V.Accorder(panier.Lire(), "item")))');
  });

  it('le sélecteur, la variable « langue » et « changer langue »', () => {
    expect(page).toContain('UI.SelecteurLangue()');
    expect(page).toContain('if (V.Egal(Langues.Actuelle, "en"))');
    expect(page).toContain('Langues.Changer("fr");');
  });

  it('les messages de vérification sont dans chaque langue', () => {
    expect(page).toContain('Langues.T(("fr", "Le champ « Courriel » est obligatoire."), ("en",');
  });

  it('le démarrage connaît les langues et reprend celle gardée', () => {
    const app = fichiers.get('App.cs')!;
    expect(app).toContain('Langues.Toutes = new[] { ("fr", "Français"), ("en", "English") };');
    expect(app).toContain('Langues.Initialiser();');
    expect(fichiers.get('Humalis/Valeurs.cs')).toContain('Langues.Culture');
  });
});

describe('cible Windows — les images SVG', () => {
  it('un SVG du projet est copié et dessiné par la bibliothèque', () => {
    const { fichiers, diagnostics } = genererProjetWindows(compile(`page "a" :\n    titre "a"\n    image "logo.svg" avec description "Logo"\n`), { nom: 'essai', source: 'essai.humalis', medias: new Map([['logo.svg', { octets: 10, contenu: Buffer.from('<svg/>').toString('base64') }]]) });
    expect(diagnostics.some((d) => d.message.includes('SVG'))).toBe(false);
    expect(fichiers.has('Ressources/logo.svg')).toBe(true);
    expect(fichiers.get('Humalis/Svg.cs')).toContain('public static DrawingImage? Lire(Stream flux)');
    expect(fichiers.get('Humalis/Interface.cs')).toContain('Svg.Lire(ressource.Stream)');
  });
});

describe('cible Windows — graphiques, fichiers, code QR', () => {
  it('un graphique lit sa liste, ses séries et sa description', () => {
    const page = projet(`page "a" :
    variable ventes = [fiche avec mois "Janvier" et montant 120, fiche avec mois "Février" et montant 150]
    titre "Ventes"
    graphique en barres ventes avec etiquette mois et valeur montant et description "Les ventes montent."
`).get('Pages/PageA.cs')!;
    expect(page).toContain('GraphiqueFabrique.Creer("barres", () => ventes.Lire(), "mois", null, new[] { new SerieGraphique(');
    expect(page).toContain('() => "Les ventes montent."');
  });

  it('les graduations suivent les pas du web (1, 2 ou 5 fois une puissance de 10)', () => {
    const graphique = projet(COMPTEUR).get('Humalis/Graphique.cs')!;
    expect(graphique).toContain('var pas = (rapport <= 1 ? 1 : rapport <= 2 ? 2 : rapport <= 5 ? 5 : 10) * puissance;');
    expect(graphique).toContain('private static readonly string[] Reperes = { "rond", "carre", "triangle", "losange" };');
  });

  it('« fichier … dans photo » ouvre la fenêtre de Windows ; « envoyer fichier » suit sa progression', () => {
    const { application, diagnostics } = compiler(readFileSync('exemples/fichier.humalis', 'utf8'));
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const { fichiers, diagnostics: d2 } = genererProjetWindows(application!, { nom: 'fichier', source: 'fichier.humalis' });
    expect(d2.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const page = fichiers.get('Pages/PageProfil.cs')!;
    expect(page).toContain('Fichiers.Choix(() => "Choisir une photo", photo, new (string, string[])[] { ("images", new[] { "image/png", "image/jpeg"');
    expect(page).toContain('octets: 5242880');
    expect(page).toContain('await Fichiers.Envoyer(photo.Lire(), "api/shop/photos", source: Sources.Boutique, corpsBrut: true, suivi: envoi');
    expect(fichiers.get('Humalis/Fichiers.cs')).toContain('new Microsoft.Win32.OpenFileDialog');
  });

  it('un code QR est dessiné par la bibliothèque, sans dépendance', () => {
    const { fichiers, diagnostics } = produire(`page "a" :\n    variable code = "REY-1"\n    titre "a"\n    code qr code avec description "Votre code"\n`);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(fichiers.get('Pages/PageA.cs')).toContain('Qr.Element(() => V.T(code.Lire()), "Votre code")');
    expect(fichiers.get('Humalis/Qr.cs')).toContain('public static bool[,]? Matrice(string texte)');
    expect(fichiers.get('Essai.csproj')).not.toContain('PackageReference');
  });
});

describe('cible Windows — sous-pages, ancres et onglets de l\'application', () => {
  const fichiers = projet(`onglets de l'application :
    onglet "Accueil" vers "accueil" avec icone "maison"
    onglet "Espace" vers "espace"

page "accueil" :
    titre "Accueil"
    lien "Aller aux desserts" vers "#desserts"
    section "Desserts" avec ancre "desserts" :
        texte "Beignets"

page "espace" :
    titre "Espace"
    sous page

page "profil" dans "espace" :
    texte "Votre profil"

page "reglages" dans "espace" adresse "/espace" :
    texte "Vos réglages"
`);

  it('une page « dans » une autre se dessine dans sa parente, à l\'endroit de « sous page »', () => {
    const pages = fichiers.get('Pages.cs')!;
    expect(pages).toContain('"profil" => PageHumalis.Imbriquer(new PageEspace(arguments), new PageProfil(arguments)),');
    expect(pages).toContain('"espace" => PageHumalis.Imbriquer(new PageEspace(arguments), new PageReglages(arguments)),');
    expect(fichiers.get('Pages/PageEspace.cs')).toContain('SousPage()');
  });

  it('un lien vers une ancre fait défiler jusqu\'à elle', () => {
    const accueil = fichiers.get('Pages/PageAccueil.cs')!;
    expect(accueil).toContain('Routeur.VersAncre(null, "desserts")');
    expect(accueil).toContain('Routeur.Ancre("desserts", ');
  });

  it('les onglets de l\'application sont une barre en haut de la fenêtre', () => {
    expect(fichiers.get('App.cs')).toContain('FenetrePrincipale.Onglets = new (string, string, string?)[] { ("Accueil", "accueil", "maison"), ("Espace", "espace", null) };');
    expect(fichiers.get('Humalis/Systeme.cs')).toContain('Routeur.Racine(cible)');
  });
});

describe('cible Windows — audio, vidéo et cartes', () => {
  const { application, diagnostics } = compiler(readFileSync('exemples/medias.humalis', 'utf8'));
  const resultat = genererProjetWindows(application!, { nom: 'medias', source: 'medias.humalis', medias: new Map([['extrait.wav', { octets: 4, contenu: 'AAAA', genre: 'audio' as const }]]) });
  const page = resultat.fichiers.get('Pages/PageAccueil.cs')!;

  it('le programme des médias se produit sans erreur', () => {
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  });

  it('un son a son lecteur, sa transcription et sa boucle ; le fichier est rangé dans l\'application', () => {
    expect(page).toContain('Medias.Lecteur(() => "extrait.wav", "Extrait de la chanson Le Fleuve, deux secondes", false)');
    expect(page).toContain('boucle: true, transcription: "Bonjour et bienvenue au Fleuve."');
    expect(resultat.fichiers.has('Ressources/extrait.wav')).toBe(true);
  });

  it('une carte a son centre écrit, ou s\'ajuste à ses marqueurs (dans une boucle)', () => {
    expect(page).toContain('CarteHumalis.Creer("Le restaurant Le Fleuve, avenue de la Gombe", () => ((double?)-4.325d, (double?)15.3222d, (double?)15d), () => Array.Empty<Marqueur>().ToArray())');
    expect(page).toContain('V.L(agences.Lire()).SelectMany((object? agence) => new[] { new Marqueur(V.N(V.Champ(agence, "latitude"))');
    expect(resultat.fichiers.get('Humalis/Medias.cs')).toContain('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(resultat.fichiers.get('Humalis/Medias.cs')).toContain('© les contributeurs d’OpenStreetMap');
  });
});

describe('cible Windows — les fonctions et les composants', () => {
  const fichiers = projet(`fonction remise avec prix et taux :
    rendre prix - prix * taux / 100

composant "Fiche" :
    parametre nom
    parametre prix
    texte nom
    texte "{remise(prix, 10)} €"

page "accueil" :
    variable p = 12
    titre "Accueil"
    Fiche avec nom "Livre" et prix p
`);

  it('une fonction est une méthode statique', () => {
    expect(fichiers.get('Humalis/Fonctions.cs')).toContain('public static object? Remise(object? prix, object? taux)');
    expect(fichiers.get('Humalis/Fonctions.cs')).toContain('return V.Moins(prix, V.Divise(V.Fois(prix, taux), 100d));');
  });

  it('un composant reçoit des valeurs qui suivent celles de la page', () => {
    expect(fichiers.get('Pages/PageAccueil.cs')).toContain('UI.Composant(() => new ComposantFiche(() => "Livre", () => p.Lire()))');
    const fiche = fichiers.get('Composants/ComposantFiche.cs')!;
    expect(fiche).toContain('public sealed class ComposantFiche : ComposantHumalis');
    expect(fiche).toContain('private readonly Func<object?> nom;');
    expect(fiche).toContain('V.Nombre(Fonctions.Remise(prix(), 10d))');
  });
});

describe('cible Windows — les noms', () => {
  it('un mot réservé de C# change de nom', () => {
    expect(nomCs('class')).toBe('class_');
    expect(nomCs('double')).toBe('double_');
    expect(nomCs('nombre_articles')).toBe('nombreArticles');
  });

  it('une chaîne C# est échappée', () => {
    expect(chaineCs('a"b\\c\nd')).toBe('"a\\"b\\\\c\\nd"');
  });

  it('les fins de ligne que C# reconnaît dans un texte copié (U+0085, U+2028, U+2029) sont échappées', () => {
    expect(chaineCs('Avant\u2028après\u2029fin\u0085suite\u0007')).toBe('"Avant\\u2028après\\u2029fin\\u0085suite\\u0007"');
    const page = projet('page "a" :\n    titre "Avant\u2028apres"\n    texte "Ligne\u0085suite"\n').get('Pages/PageA.cs')!;
    expect(page).toContain('"Avant\\u2028apres"');
    expect(page).toContain('"Ligne\\u0085suite"');
    expect(/[\u0085\u2028\u2029]/.test(page)).toBe(false);
  });

  it('un nombre est un double', () => {
    expect(nombreCs(12)).toBe('12d');
    expect(nombreCs(0.5)).toBe('0.5d');
    expect(nombreCs(-3)).toBe('-3d');
  });

  it('l\'application ne prend pas le nom d\'une classe de la bibliothèque', () => {
    expect(nomApplication('boutique')).toBe('Boutique');
    expect(nomApplication('sources')).toBe('SourcesApp');
    expect(nomApplication('ma-boutique')).toBe('MaBoutique');
  });
});

describe('cible Windows — ce qui n\'existe pas ici est dit clairement', () => {
  it('un composant React est refusé, avec la marche à suivre', () => {
    const { diagnostics } = produire(`utiliser composant "Carte" depuis "./Carte.tsx"\npage "accueil" :\n    Carte\n`);
    expect(diagnostics.some((d) => d.gravite === 'erreur' && d.message.includes('--cible desktop'))).toBe(true);
  });


  it('une animation est dite, sans bloquer', () => {
    const { diagnostics } = produire(`page "a" :\n    titre "Bonjour" avec animation apparition\n`);
    expect(diagnostics.some((d) => d.gravite === 'avertissement' && d.message.includes('animation'))).toBe(true);
    expect(diagnostics.some((d) => d.gravite === 'erreur')).toBe(false);
  });
});

describe('cible Windows — les exemples', () => {
  for (const nom of readdirSync('exemples').filter((f) => f.endsWith('.humalis'))) {
    it(`« ${nom} » se produit ou dit pourquoi il ne peut pas`, () => {
      const { application, diagnostics } = compiler(readFileSync(`exemples/${nom}`, 'utf8'));
      if (!application || application.ecrans.length === 0 || diagnostics.some((d) => d.gravite === 'erreur')) return;
      const resultat = genererProjetWindows(application, { nom: nom.replace(/\.humalis$/, ''), source: nom });
      const erreurs = resultat.diagnostics.filter((d) => d.gravite === 'erreur');
      if (erreurs.length > 0) {
        for (const e of erreurs) expect(e.message).toMatch(/Windows|C#/);
        return;
      }
      for (const [chemin, contenu] of resultat.fichiers) {
        if (!chemin.endsWith('.cs')) continue;
        // Des accolades équilibrées : le code produit est au moins bien formé.
        const ouvertes = (contenu.replace(/"(?:[^"\\]|\\.)*"/g, '""').match(/\{/g) ?? []).length;
        const fermees = (contenu.replace(/"(?:[^"\\]|\\.)*"/g, '""').match(/\}/g) ?? []).length;
        expect(ouvertes, chemin).toBe(fermees);
      }
    });
  }
});
