import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { pourLaCible } from '../../src/ri/plateforme.js';
import { verifierAppareilPourLaCible } from '../../src/cibles/appareil.js';
import { adresseServeur, genererProjetAndroid, MARQUE_ANDROID } from '../../src/cibles/android/projet.js';
import { chaineKotlin, identifiantAndroid, nomKotlin, nomRoute } from '../../src/cibles/android/noms.js';
import { iconesKotlin, lucideDe } from '../../src/cibles/android/icones.js';
import { VERSIONS } from '../../src/cibles/android/gradle.js';

const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return pourLaCible(application!, 'android');
};
const produire = (source: string, options = {}) => genererProjetAndroid(compile(source), { nom: 'essai', source: 'essai.humalis', ...options });
const projet = (source: string, options = {}) => {
  const { fichiers, diagnostics } = produire(source, options);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return fichiers;
};
const CODE = 'app/src/main/java/local/humalis/essai';
const page = (fichiers: Map<string, string>, nom: string) => fichiers.get(`${CODE}/${nom}.kt`)!;
const erreurs = (source: string) => produire(source).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message);

const COMPTEUR = `page "compteur" :
    variable clics = 0
    calcul double = clics * 2
    titre "Compteur"
    texte "Tu as cliqué {clics} fois, le double fait {double}"
    bouton "Cliquer"
    quand l'utilisateur clique sur "Cliquer" :
        changer clics par clics + 1
`;

describe('cible Android — le projet Gradle', () => {
  const fichiers = projet(COMPTEUR);

  it('produit un projet complet, en Kotlin et Compose, sans navigateur ni JavaScript', () => {
    for (const f of [MARQUE_ANDROID, 'LISEZMOI.md', 'settings.gradle.kts', 'build.gradle.kts', 'gradle.properties', 'gradle/wrapper/gradle-wrapper.properties', 'app/build.gradle.kts', 'app/src/main/AndroidManifest.xml', `${CODE}/MainActivity.kt`, `${CODE}/PageCompteur.kt`, `${CODE}/Valeurs.kt`, `${CODE}/Theme.kt`]) {
      expect(fichiers.has(f), f).toBe(true);
    }
    const tout = [...fichiers.values()].join('\n');
    expect(tout).not.toMatch(/WebView|react-native|\bexpo\b|electron/i);
  });

  it('épingle les versions : Android 8.0 au minimum, compilé pour Android 16', () => {
    const app = fichiers.get('app/build.gradle.kts')!;
    expect(app).toContain(`minSdk = ${VERSIONS.sdkMinimum}`);
    expect(app).toContain(`compileSdk = ${VERSIONS.sdkCible}`);
    expect(app).toContain(`compose-bom:${VERSIONS.composeBom}`);
    expect(app).toContain('applicationId = "local.humalis.essai"');
    expect(fichiers.get('build.gradle.kts')).toContain(`id("com.android.application") version "${VERSIONS.pluginAndroid}"`);
    expect(fichiers.get('gradle/wrapper/gradle-wrapper.properties')).toContain(`gradle-${VERSIONS.gradle}-bin.zip`);
  });

  it('le paquet du code suit l\'identifiant choisi', () => {
    const f = projet(COMPTEUR, { identifiant: 'dev.exemple.compteur' });
    expect(f.get('app/build.gradle.kts')).toContain('applicationId = "dev.exemple.compteur"');
    expect(f.get('app/src/main/java/dev/exemple/compteur/PageCompteur.kt')).toMatch(/^package dev\.exemple\.compteur$/m);
  });

  it('http:// ne sort pas de l\'ordinateur de développement', () => {
    const securite = fichiers.get('app/src/main/res/xml/network_security_config.xml')!;
    expect(securite).toContain('<base-config cleartextTrafficPermitted="false" />');
    expect(securite).toContain('<domain includeSubdomains="false">10.0.2.2</domain>');
    expect(fichiers.get('app/src/main/AndroidManifest.xml')).toContain('android:networkSecurityConfig="@xml/network_security_config"');
  });
});

describe('cible Android — une page', () => {
  const code = page(projet(COMPTEUR), 'PageCompteur');

  it('une page est une fonction @Composable qui défile', () => {
    expect(code).toContain('@Composable\nfun PageCompteur(nav: NavHostController) {');
    expect(code).toContain('ColonneHumalis(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), espacement = 16.dp) {');
  });

  it('une variable est un état Compose, un calcul est relu à chaque fois', () => {
    expect(code).toContain('var clics by remember { mutableStateOf<Any?>(0.0) }');
    expect(code).toContain('fun double(): Any? = (nombre(clics) * 2.0)');
  });

  it('un événement est une fonction suspend, lancée par le clic', () => {
    expect(code).toContain('suspend fun quandCliqueCliquer() {\n        clics = plus(clics, 1.0)\n    }');
    expect(code).toContain('Button(onClick = { portee.launch { quandCliqueCliquer() } }) {');
  });

  it('le texte lit ses valeurs, et le titre est annoncé comme un titre', () => {
    expect(code).toContain('Text("Tu as cliqué ${formaterNombre(nombre(clics))} fois, le double fait ${formaterNombre(nombre(double()))}"');
    expect(code).toContain('Text("Compteur", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.semantics { heading() })');
  });

  it('un « $ » écrit dans un texte reste un caractère', () => {
    const c = page(projet('page "prix" :\n    titre "Prix"\n    texte "12 $ ou plus"\n'), 'PagePrix');
    expect(c).toContain('Text("12 \\$ ou plus")');
  });
});

describe('cible Android — styles et thème', () => {
  it('les styles nommés deviennent des modificateurs, dans l\'ordre de Compose', () => {
    const c = page(projet(`page "accueil" :
    titre "Bienvenue" avec couleur bleu et taille grande
    bloc avec fond vert et remplissage moyenne et bordure douce et ombre legere :
        texte "Dedans"
    texte "Centré" avec position centree
`), 'PageAccueil');
    expect(c).toContain('color = Couleurs.bleu.lue()');
    expect(c).toContain('.shadow(2.dp, RoundedCornerShape(8.dp)).background(Couleurs.vert.lue(), RoundedCornerShape(8.dp)).padding(16.dp)');
    expect(c).toContain('textAlign = TextAlign.Center');
  });

  it('un bouton sur un fond prend l\'encre de ce fond', () => {
    const c = page(projet('page "accueil" :\n    titre "A"\n    bouton "Payer" avec fond vert\n'), 'PageAccueil');
    expect(c).toContain('colors = ButtonDefaults.buttonColors(containerColor = Couleurs.vert.lue(), contentColor = Couleurs.encreVert.lue())');
  });

  it('le thème donne la couleur de la marque, en clair et en sombre', () => {
    const f = projet(`theme :
    couleur marque "#0f766e"
page "accueil" :
    titre "A"
`);
    const theme = f.get(`${CODE}/Theme.kt`)!;
    expect(theme).toContain('val accent = CouleurHumalis(0xFF0F766E');
    expect(theme).toContain('darkColorScheme(primary = Couleurs.accent.lue()');
    expect(f.get('app/src/main/res/values/ic_launcher_background.xml')).toContain('#0f766e');
  });

  it('« changer theme par sombre » change le mode, gardé sur l\'appareil', () => {
    const f = projet('page "accueil" :\n    titre "A"\n    bouton "Sombre"\n    quand l\'utilisateur clique sur "Sombre" :\n        changer theme par sombre\n');
    expect(page(f, 'PageAccueil')).toContain('Apparence.changer("sombre")');
    expect(f.get(`${CODE}/Theme.kt`)).toContain('private var mode by EtatMemorise("humalis.theme", "automatique")');
  });
});

describe('cible Android — conditions, listes et variables partagées', () => {
  const f = projet(`variable panier = [] avec partagee

page "boutique" :
    variable produits = ["Livre", "Stylo"]
    titre "Boutique"
    pour chaque nom dans produits :
        texte nom
        bouton "Ajouter"
        quand l'utilisateur clique sur "Ajouter" :
            ajouter nom à panier
    si panier est vide :
        texte "Panier vide"
    sinon :
        texte "{nombre de panier} articles"
`);
  const c = page(f, 'PageBoutique');

  it('une variable partagée vit dans Partage, lue par toutes les pages', () => {
    expect(f.get(`${CODE}/Partage.kt`)).toContain('var panier by mutableStateOf<Any?>(listOf<Any?>())');
    expect(c).toContain('Partage.panier = liste(Partage.panier) + listOf(nom)');
  });

  it('« pour chaque » parcourt la liste ; l\'événement de la boucle reçoit sa variable', () => {
    expect(c).toContain('for (nom in liste(produits)) {');
    expect(c).toContain('suspend fun quandCliqueAjouter(nom: Any?) {');
    expect(c).toContain('Button(onClick = { portee.launch { quandCliqueAjouter(nom) } }) {');
  });

  it('« si … sinon » devient un if de Compose', () => {
    expect(c).toContain('if (estVide(Partage.panier)) {');
    expect(c).toMatch(/} else {\n\s+Text\("\$\{formaterNombre\(nombre\(longueur\(Partage\.panier\)\)\)\} articles"\)/);
  });

  it('« avec memorisee » garde la valeur sur l\'appareil', () => {
    const m = page(projet('page "accueil" :\n    variable nom = "" avec memorisee\n    titre "A"\n'), 'PageAccueil');
    expect(m).toContain('var nom by remember { EtatMemorise("humalis.essai.accueil.nom", "") }');
  });

  it('« memorisee en secret » passe par le coffre du Keystore', () => {
    const f2 = projet('page "accueil" :\n    variable jeton = "" avec memorisee en secret\n    titre "A"\n');
    expect(page(f2, 'PageAccueil')).toContain('EtatMemorise("humalis.essai.accueil.jeton", "", secret = true)');
    expect(f2.get(`${CODE}/Memoire.kt`)).toContain('KeyStore.getInstance("AndroidKeyStore")');
  });
});

describe('cible Android — navigation', () => {
  const f = projet(`page "accueil" :
    titre "Accueil"
    lien "Voir le produit" vers "produit" avec id "42"
    bouton "Aide"
    quand l'utilisateur clique sur "Aide" :
        rediriger vers "aide"

page "produit" avec parametre id :
    titre "Produit {id}"
    bouton "Retour"
    quand l'utilisateur clique sur "Retour" :
        revenir

page "aide" :
    titre "Aide"
    lien "Site" vers "https://exemple.fr"
`);
  const app = f.get(`${CODE}/MainActivity.kt`)!;

  it('chaque page a sa route ; un paramètre passe dans la route', () => {
    expect(app).toContain('NavHost(nav, startDestination = "accueil"');
    expect(app).toContain('composable("produit/{id}") { e ->');
    expect(app).toContain('PageProduit(nav, id = e.arguments?.getString("id") ?: "")');
    expect(page(f, 'PageProduit')).toContain('fun PageProduit(nav: NavHostController, id: String) {');
  });

  it('un lien et « rediriger vers » vont à la page ; « revenir » remonte l\'historique', () => {
    expect(page(f, 'PageAccueil')).toContain('allerVers(nav, "produit/${Uri.encode("42")}")');
    expect(page(f, 'PageAccueil')).toContain('allerVers(nav, "aide")');
    expect(page(f, 'PageProduit')).toContain('nav.popBackStack()');
  });

  it('une adresse externe s\'ouvre dans l\'application du système', () => {
    expect(page(f, 'PageAide')).toContain('ouvrirExterne("https://exemple.fr")');
    expect(f.get(`${CODE}/Interface.kt`)).toContain('Regex("^(https?:|mailto:|tel:)", RegexOption.IGNORE_CASE)');
  });

  it('les onglets de l\'application sont une barre de navigation en bas', () => {
    const a = projet(`onglets de l'application :
    onglet "Accueil" vers "accueil" avec icone "maison"
    onglet "Aide" vers "aide" avec icone "aide"
page "accueil" :
    titre "Accueil"
page "aide" :
    titre "Aide"
`);
    const main = a.get(`${CODE}/MainActivity.kt`)!;
    expect(main).toContain('NavigationBar {');
    expect(main).toContain('NavigationBarItem(selected = actuelle == "aide"');
    expect(a.get(`${CODE}/Icones.kt`)).toContain('val maison by lazy');
  });
});

describe('cible Android — le serveur', () => {
  const f = projet(`serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit

page "catalogue" :
    variable produits = []
    titre "Catalogue"
    pour chaque p dans produits :
        texte "{p.nom} : {p.prix}"
    quand la page se charge :
        envoyer requete vers "produits" dans produits
`);
  const c = page(f, 'PageCatalogue');

  it('« envoyer requete » lit le serveur sans bloquer l\'écran, et sait se relire', () => {
    expect(c).toContain('suspend fun auChargement() {');
    expect(c).toContain('Serveur.lire("/api/produits")?.let { produits = it }');
    expect(c).toContain('relances["produits"] = charger');
    expect(c).toContain('LaunchedEffect(Unit) { auChargement() }');
  });

  it('une source : son adresse, son enveloppe, et l\'état de la requête lu par la page', () => {
    const g = projet(`source "boutique" :
    adresse "https://api.exemple.fr"
    enveloppe "data"
    erreur dans "message"
    donnee produit :
        id : texte
        name : texte
    route "api/products" :
        lire une liste de produit dans "products"

page "catalogue" :
    variable produits = []
    titre "Catalogue"
    si produits est en chargement :
        texte "Chargement…"
    pour chaque p dans produits :
        texte p.name
    quand la page se charge :
        envoyer requete vers "api/products" de la source "boutique" dans produits
`);
    const p = page(g, 'PageCatalogue');
    expect(g.get(`${CODE}/Sources.kt`)).toContain('val boutique = SourceHumalis(nom = "boutique", adresse = "https://api.exemple.fr", enveloppe = "data", erreurDans = "message"');
    expect(p).toContain('var etatProduits by remember { mutableStateOf(EtatRequete()) }');
    expect(p).toContain('if ((etatProduits.statut == "chargement")) {');
    expect(p).toContain('Serveur.lire("/api/products", source = Sources.boutique, dans = "products", suivi = { etatProduits = it })');
  });

  it('les champs d\'une donnée se lisent par leur clé JSON', () => {
    // Le compilateur met une espace insécable devant « : », comme en français.
    expect(c).toMatch(/Text\("\$\{texte\(champ\(p, "nom"\)\)\}\s:\s\$\{formaterNombre\(nombre\(champ\(p, "prix"\)\)\)\}"\)/);
  });

  it('l\'adresse du serveur : localhost devient l\'ordinateur vu depuis l\'émulateur', () => {
    expect(f.get(`${CODE}/Configuration.kt`)).toContain('const val SERVEUR = "http://10.0.2.2:3000"');
    expect(adresseServeur('http://127.0.0.1:4000/')).toBe('http://10.0.2.2:4000');
    expect(adresseServeur('https://api.exemple.fr')).toBe('https://api.exemple.fr');
    const g = projet('page "a" :\n    titre "A"\n', { serveur: 'https://api.exemple.fr' });
    expect(g.get(`${CODE}/Configuration.kt`)).toContain('"https://api.exemple.fr"');
  });

  it('la session garde ses jetons au coffre et se renouvelle une seule fois', () => {
    const serveur = f.get(`${CODE}/Serveur.kt`)!;
    expect(serveur).toContain('Coffre.ecrire(CLE_JETON, it)');
    expect(serveur).toContain('brut("/auth/refresh", "POST"');
    expect(serveur).toContain('entetes["x-csrf-token"] = it');
  });
});

describe('cible Android — formulaires et connexion', () => {
  const f = projet(`page "contact" :
    titre "Contact"
    formulaire "message" :
        champ email "Email" avec obligatoire
        champ nombre "Âge" avec minimum 18
        case a cocher "J'accepte"
        bouton "Envoyer"
    quand le formulaire "message" est soumis :
        afficher reussite "Merci"
`);
  const c = page(f, 'PageContact');

  it('un champ est une saisie Material avec son clavier', () => {
    expect(c).toContain('var champEmail by remember { mutableStateOf("") }');
    expect(c).toContain('OutlinedTextField(champEmail, { champEmail = it }, label = { Text("Email") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)');
    expect(c).toContain('Checkbox(checked = champJAccepte, onCheckedChange = null)');
  });

  it('le formulaire vérifie ses champs avant l\'envoi, avec les messages du web', () => {
    expect(c).toContain('if (champEmail.isBlank()) { Messages.afficher(');
    expect(c).toMatch(/nombre\(champAge\) < 18\.0\) \{ Messages\.afficher\(".*18/);
    expect(c).toContain('Messages.afficher("Merci", "reussite")');
  });

  it('après un envoi réussi, les champs sont vidés', () => {
    expect(c).toMatch(/Messages\.afficher\("Merci", "reussite"\)\n\s+champEmail = ""\n\s+champAge = ""\n\s+champJAccepte = false/);
  });

  it('le bouton d\'un formulaire l\'envoie', () => {
    expect(c).toMatch(/Button\(onClick = \{ portee\.launch \{ quandSoumis\w+\(\) \} \}\)/);
  });

  it('se connecter passe par la session ; un refus arrête la suite', () => {
    const g = projet(`serveur "app" :
    donnee note :
        texte : texte
    route "notes" :
        connecte peut lire note
page "connexion" :
    titre "Connexion"
    champ email "Email"
    champ mot de passe "Mot de passe"
    bouton "Entrer"
    quand l'utilisateur clique sur "Entrer" :
        se connecter avec champ "Email" et champ "Mot de passe"
        rediriger vers "accueil"
page "accueil" :
    titre "Accueil"
`);
    const p = page(g, 'PageConnexion');
    expect(p).toContain('if (!Session.afficherSiRefus { Session.seConnecter(champEmail, champMotDePasse) }) return');
    expect(p).toContain('visualTransformation = PasswordVisualTransformation()');
  });

  it('une page réservée renvoie vers la connexion, puis revient', () => {
    const g = projet(`serveur "app" :
    donnee note :
        texte : texte
    route "notes" :
        connecte peut lire note
page "connexion" :
    titre "Connexion"
page "compte" reservee a connecte sinon vers "connexion" :
    titre "Mon compte"
`);
    expect(g.get(`${CODE}/MainActivity.kt`)).toContain('GardeHumalis(nav, "connecte", "connexion", "compte") { PageCompte(nav) }');
  });
});

describe('cible Android — ce qui n\'existe pas encore est dit', () => {

  it('« sur application : » est gardé, « sur site : » retiré', () => {
    const c = page(projet('page "a" :\n    titre "A"\n    sur application :\n        texte "Dans l\'app"\n    sur site :\n        texte "Sur le site"\n'), 'PageA');
    expect(c).toContain('Dans l\'app');
    expect(c).not.toContain('Sur le site');
  });
});

describe('cible Android — filtres et refus lisibles', () => {
  it('« changer categorie par … » change le filtre de la page, lu au départ dans la route', () => {
    const f = projet(`page "liste" avec filtre categorie :
    titre "Liste"
    texte "Catégorie : {categorie}"
    bouton "Robes"
    quand l'utilisateur clique sur "Robes" :
        changer categorie par "robes"
`);
    expect(f.get(`${CODE}/MainActivity.kt`)).toContain('composable("liste?categorie={categorie}", arguments = listOf(navArgument("categorie") { type = NavType.StringType; defaultValue = "" })) { e ->');
    const c = page(f, 'PageListe');
    expect(c).toContain('var categorie by remember(categorieLu) { mutableStateOf<Any?>(categorieLu.ifEmpty { null }) }');
    expect(c).toContain('categorie = "robes"');
  });

});

describe('cible Android — un CSS propre à Android', () => {
  const SOURCE = `utiliser style "./commun.css"
utiliser style "./android.css" sur android

page "accueil" :
    titre "Boutique" avec style "titre"
    bloc avec style "carte" :
        texte "12 €" avec style "prix"
        bouton "Commander" avec style "principal" et sur android style "commander"
    sur android :
        texte "Dans l'application Android"
    sur site :
        texte "Sur le site"
`;
  const COMMUN = '.titre { color: #111111; font-size: 24px; } .carte { padding: 8px; }';
  const ANDROID = '.titre { color: #0f766e; } .carte { background: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.1); gap: 4px; } .prix { font-weight: 700; } .commander { background: #f59e0b; border-radius: 8px; } .carte:hover { background: #eeeeee; } @media (min-width: 900px) { .carte { padding: 40px; } }';
  const lire = (fichiersStyle: Map<string, string>) => {
    const { application, diagnostics } = compiler(SOURCE);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    return { application: application!, ...genererProjetAndroid(pourLaCible(application!, 'android'), { nom: 'essai', source: 'essai.humalis', fichiersStyle }) };
  };

  it('« sur android » est une plateforme : la feuille et le bloc ne vont qu\'à Android', () => {
    const { application } = lire(new Map());
    const android = pourLaCible(application, 'android');
    expect(android.fichiersStyle.map((f) => f.chemin)).toEqual(['./commun.css', './android.css']);
    expect(pourLaCible(application, 'web').fichiersStyle.map((f) => f.chemin)).toEqual(['./commun.css']);
    expect(pourLaCible(application, 'apple').fichiersStyle.map((f) => f.chemin)).toEqual(['./commun.css']);
    // « et sur android style "commander" » : la classe ne reste que sur Android.
    expect(JSON.stringify(pourLaCible(application, 'web').ecrans)).toContain('"classes":["principal"]');
    expect(JSON.stringify(android.ecrans)).toContain('"classes":["principal","commander"]');
  });

  it('la feuille Android passe après le CSS commun', () => {
    const c = lire(new Map([['./commun.css', COMMUN], ['./android.css', ANDROID]])).fichiers.get(`${CODE}/PageAccueil.kt`)!;
    expect(c).toContain('fontSize = 24.sp');
    expect(c).toContain('color = Color(0xFF0F766E)');
    expect(c).not.toContain('Color(0xFF111111)');
    expect(c).toContain('Modifier.fillMaxWidth().shadow(4.dp, RoundedCornerShape(12.dp)).background(Color(0xFFFFFFFF), RoundedCornerShape(12.dp)).padding(start = 8.dp, top = 8.dp, end = 8.dp, bottom = 8.dp), espacement = 4.dp');
    expect(c).toContain('Text("12 €", fontWeight = FontWeight.Bold)');
  });

  it('le CSS commun est facultatif : une feuille Android seule suffit', () => {
    const { fichiers, diagnostics } = lire(new Map([['./android.css', ANDROID]]));
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const c = fichiers.get(`${CODE}/PageAccueil.kt`)!;
    expect(c).toContain('color = Color(0xFF0F766E)');
    expect(c).toContain("Text(\"Dans l'application Android\")");
    expect(c).not.toContain('Sur le site');
  });

  it('« et sur android style » donne au bouton sa couleur et sa forme', () => {
    const c = lire(new Map([['./android.css', ANDROID]])).fichiers.get(`${CODE}/PageAccueil.kt`)!;
    expect(c).toContain('colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF59E0B)), shape = RoundedCornerShape(8.dp)');
  });

  it('ce qui ne passe pas est compté et listé dans CSS-SUR-ANDROID.md', () => {
    const { fichiers, diagnostics } = lire(new Map([['./android.css', ANDROID]]));
    expect(diagnostics.map((d) => d.message).join('\n')).toMatch(/CSS : \d+ déclarations sur \d+ traduites en Compose/);
    const rapport = fichiers.get('CSS-SUR-ANDROID.md')!;
    expect(rapport).toContain('.carte:hover { background: #eeeeee }');
    expect(rapport).toContain('@media : règle réservée à un navigateur');
  });

  it('un style écrit en Humalis passe aussi sur Android', () => {
    const c = page(projet('style "prix" :\n    couleur rouge\n    gras\n\npage "a" :\n    titre "A"\n    texte "12 €" avec style "prix"\n'), 'PageA');
    expect(c).toMatch(/Text\("12 €", .*fontWeight = FontWeight\.Bold/);
  });
});

describe('cible Android — langues et polices', () => {
  const LANGUES = `langues :
    francais
    anglais

page "accueil" :
    selecteur de langue
    titre "Bienvenue" en anglais "Welcome"
    variable total = 1234,5
    texte "Total : {total en euros}" en anglais "Total: {total en euros}"
    formulaire "contact" :
        champ email "Email" en anglais "Email address" avec obligatoire
        bouton "Envoyer" en anglais "Send"
    quand le formulaire "contact" est soumis :
        afficher "Merci" en anglais "Thanks"
    bouton "English"
    quand l'utilisateur clique sur "English" :
        si langue est anglais :
            changer langue par francais
        sinon :
            changer langue par anglais
`;
  const f = projet(LANGUES);
  const c = page(f, 'PageAccueil');

  it('chaque texte a ses versions, choisies par t() selon la langue de la personne', () => {
    expect(c).toContain('Text(t(mapOf("fr" to "Bienvenue", "en" to "Welcome"))');
    expect(c).toContain('formaterArgent(nombre(total), "EUR", "en")');
    expect(c).toContain('SelecteurLangueHumalis()');
  });

  it('la langue se lit et se change ; elle est gardée sur l\'appareil', () => {
    expect(c).toContain('if (egal(Langues.code, "en")) {');
    expect(c).toContain('Langues.changer("fr")');
    const langues = f.get(`${CODE}/Langues.kt`)!;
    expect(langues).toContain('val disponibles: List<Pair<String, String>> = listOf("fr" to "Français", "en" to "English")');
    expect(langues).toContain('private var gardee by EtatMemorise("humalis.langue", null)');
  });

  it('l\'erreur d\'un champ est dans la langue de la personne, avec son libellé', () => {
    expect(c).toContain('Messages.afficher(t(mapOf("fr" to "Le champ « Email » est obligatoire.", "en" to "The field “Email address” is required.")), "erreur")');
  });

  it('les messages de Humalis passent par t()', () => {
    expect(f.get(`${CODE}/Serveur.kt`)).toContain('t(mapOf("fr" to "Connectez-vous pour continuer.", "en" to "Sign in to continue."))');
    expect(projet('page "a" :\n    titre "A"\n').get(`${CODE}/Serveur.kt`)).not.toContain('t(mapOf');
  });

  it('une police .ttf du thème devient une ressource de l\'application', () => {
    const g = projet('theme :\n    police titres "Georgia" depuis "./georgia.ttf"\npage "a" :\n    titre "A"\n', { polices: new Map([['./georgia.ttf', 'AAAA']]) });
    expect(g.has('app/src/main/res/font/police_georgia.ttf')).toBe(true);
    const theme = g.get(`${CODE}/Theme.kt`)!;
    expect(theme).toContain('val titres: FontFamily = FontFamily(Font(R.font.police_georgia))');
    expect(theme).toContain('MaterialTheme(colorScheme = schema, typography = typographie, content = contenu)');
  });

  it('une police .woff2 est dite : Android lit les .ttf et .otf', () => {
    const { diagnostics } = produire('theme :\n    police titres "Inter" depuis "./inter.woff2"\npage "a" :\n    titre "A"\n', { polices: new Map([['./inter.woff2', 'AAAA']]) });
    expect(diagnostics.map((d) => d.message).join('\n')).toContain('qui lit les fichiers .ttf et .otf');
  });
});

describe('cible Android — sous-pages, ancres et liens profonds', () => {
  const SOURCE = `liens profonds "magasin" et domaine "exemple.fr/essai"

page "accueil" :
    titre "Accueil"
    lien "Nos desserts" vers "carte#desserts"

page "carte" :
    titre "Carte"
    lien "Aller aux desserts" vers "#desserts"
    section "Desserts" avec ancre "desserts" :
        texte "Beignets"

page "produit" avec parametre id :
    titre "Produit {id}"

page "espace" :
    titre "Espace"
    sous page

page "profil" dans "espace" :
    texte "Votre profil"
`;
  const f = projet(SOURCE, { empreinte: 'aa:bb:cc' });
  const app = f.get(`${CODE}/MainActivity.kt`)!;

  it('une sous-page se montre dans sa page parente, sans défiler deux fois', () => {
    expect(app).toContain('PageEspace(nav, sousPage = { PageProfil(nav, imbriquee = true) })');
    expect(page(f, 'PageEspace')).toContain('sousPage?.invoke()');
    expect(page(f, 'PageProfil')).toContain('ColonneHumalis(if (imbriquee) Modifier.fillMaxWidth() else Modifier.fillMaxSize().verticalScroll(rememberScrollState())');
  });

  it('un lien vers une ancre descend jusqu\'à elle, sur la page ou sur une autre', () => {
    const carte = page(f, 'PageCarte');
    expect(carte).toContain('val ancreDesserts = remember { BringIntoViewRequester() }');
    expect(carte).toContain('Box(Modifier.bringIntoViewRequester(ancreDesserts)) {');
    expect(carte).toContain('portee.launch { allerAncre("desserts") }');
    expect(page(f, 'PageAccueil')).toContain('Routes.ancre = "desserts"; allerVers(nav, "carte")');
  });

  it('« magasin://produit/42 » et « https://exemple.fr/essai/produit/42 » ouvrent la page', () => {
    expect(app).toContain('navDeepLink { uriPattern = "magasin://produit/{id}" }, navDeepLink { uriPattern = "https://exemple.fr/essai/produit/{id}" }');
    expect(app).toContain('LaunchedEffect(Liens.recu) { Liens.recu?.let { nav.handleDeepLink(it); Liens.recu = null } }');
    const manifeste = f.get('app/src/main/AndroidManifest.xml')!;
    expect(manifeste).toContain('<data android:scheme="magasin" />');
    expect(manifeste).toContain('<intent-filter android:autoVerify="true">');
    expect(manifeste).toContain('<data android:scheme="https" android:host="exemple.fr" android:pathPrefix="/essai" />');
    expect(f.get('a-publier-sur-le-site/.well-known/assetlinks.json')).toContain('"sha256_cert_fingerprints": [\n        "AA:BB:CC"');
  });

  it('sans --empreinte, la compilation dit comment faire vérifier les liens https://', () => {
    const { diagnostics, fichiers } = produire(SOURCE);
    expect(diagnostics.map((d) => d.message).join('\n')).toContain('Compilez avec --empreinte');
    expect(fichiers.has('a-publier-sur-le-site/.well-known/assetlinks.json')).toBe(false);
  });
});

describe('cible Android — les fonctions de l\'appareil', () => {
  const SOURCE = `page "accueil" :
    variable trace = ""
    variable valeur = "vide"
    variable cliche = rien
    variable lieu = rien
    variable identite = "?"
    titre "Appareil"
    signature dans trace
    bouton "Tout"
    quand l'utilisateur clique sur "Tout" :
        vibrer
        scanner code dans valeur
        photo dans cliche
        position dans lieu
        verifier identite :
            changer identite par "oui"
        sinon :
            changer identite par "non"
`;
  const f = projet(SOURCE);
  const c = page(f, 'PageAccueil');

  it('elles passent sur Android, et restent refusées ailleurs avec un message qui cite Android', () => {
    const app = compile(SOURCE);
    expect(verifierAppareilPourLaCible(app, 'android')).toEqual([]);
    expect(verifierAppareilPourLaCible(app, 'mobile').map((d) => d.message).join('\n')).toContain('que sur les cibles Apple et Android');
  });

  it('chaque demande au système attend sa réponse sans bloquer l\'écran', () => {
    expect(c).toContain('vibrer()');
    expect(c).toContain('scannerCode()?.let { valeur = it }');
    expect(c).toContain('prendrePhoto()?.let { cliche = it }');
    expect(c).toContain('lirePosition()?.let { lieu = it }');
    expect(c).toMatch(/if \(verifierIdentite\(\)\) \{\n\s+identite = "oui"\n\s+\} else \{\n\s+identite = "non"/);
    expect(c).toContain('SignatureHumalis(trace, { trace = it })');
    expect(f.get(`${CODE}/Systeme.kt`)).toContain('activite.activityResultRegistry.register(');
    expect(f.get(`${CODE}/MainActivity.kt`)).toContain('class MainActivity : FragmentActivity() {');
  });

  it('le manifeste demande seulement ce qui sert, et Gradle ajoute ce qu\'il faut', () => {
    const m = f.get('app/src/main/AndroidManifest.xml')!;
    expect(m).toContain('android.permission.VIBRATE');
    expect(m).toContain('android.permission.ACCESS_FINE_LOCATION');
    expect(m).toContain('android:authorities="${applicationId}.fichiers"');
    expect(f.get('app/build.gradle.kts')).toContain('androidx.biometric:biometric:');
    expect(f.get('app/build.gradle.kts')).toContain('com.journeyapps:zxing-android-embedded:');
    const simple = projet('page "a" :\n    titre "A"\n');
    expect(simple.get('app/src/main/AndroidManifest.xml')).not.toContain('VIBRATE');
    expect(simple.get('app/build.gradle.kts')).not.toContain('zxing');
    expect(simple.has(`${CODE}/Appareil.kt`)).toBe(false);
  });

  it('une image se lit aussi d\'un fichier de l\'appareil ou d\'un texte data:', () => {
    const i = f.get(`${CODE}/Interface.kt`)!;
    expect(i).toContain('source.startsWith("file://")');
    expect(i).toContain('source.startsWith("data:")');
    expect(i).toContain('inSampleSize = reduction');
  });
});

describe('cible Android — les fichiers', () => {
  const SOURCE = `source "boutique" :
    adresse "http://localhost:3000"
    enveloppe "data"
    route "api/photos" :
        creer photo
    donnee photo :
        fichier : texte

page "profil" :
    variable photo = rien
    variable envoi = 0
    variable adresse = rien
    variable commandes = [fiche avec client "Ana" et total 12]
    titre "Profil"
    fichier "Choisir une photo" dans photo accepte images avec maximum 5 Mo
    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer fichier photo vers "api/photos" de la source "boutique" en corps brut suivi dans envoi et fichier dans adresse
    bouton "Exporter"
    quand l'utilisateur clique sur "Exporter" :
        telecharger commandes en csv
`;
  const f = projet(SOURCE);
  const c = page(f, 'PageProfil');

  it('« fichier … dans » ouvre le sélecteur du système, avec ses familles et sa taille maximale', () => {
    expect(c).toContain('ChoixFichierHumalis("Choisir une photo", photo, { photo = it }, listOf("images" to listOf(');
    expect(c).toContain('maximum = 5242880.0');
    expect(f.get(`${CODE}/Fichiers.kt`)).toContain('ActivityResultContracts.OpenDocument()');
  });

  it('l\'envoi suit sa progression et reçoit la réponse', () => {
    expect(c).toContain('Serveur.televerser(photo, "api/photos", source = Sources.boutique, corpsBrut = true, progression = { envoi = it })?.let { adresse = it }');
    expect(f.get(`${CODE}/Serveur.kt`)).toContain('connexion.setFixedLengthStreamingMode(total)');
    // Depuis l'émulateur, « localhost » d'une source est l'ordinateur.
    expect(f.get(`${CODE}/Sources.kt`)).toContain('adresse = "http://10.0.2.2:3000"');
  });

  it('le CSV s\'écrit sur l\'appareil puis se partage', () => {
    expect(c).toContain('telechargerCsv(commandes, "commandes.csv")');
    expect(f.get('app/src/main/AndroidManifest.xml')).toContain('androidx.core.content.FileProvider');
    expect(f.get('app/src/main/res/xml/chemins_fichiers.xml')).toContain('<cache-path name="humalis" path="humalis/" />');
  });
});

describe('cible Android — les médias', () => {
  const SOURCE = `page "accueil" :
    variable ventes = [fiche avec mois "Janvier" et montant 120 et achats 90, fiche avec mois "Février" et montant 180 et achats 110]
    variable agences = [fiche avec nom "Gombe" et latitude -4,3 et longitude 15,3]
    titre "Médias"
    graphique en barres ventes avec etiquette mois et description "Les ventes montent." :
        serie "Ventes" valeur montant en FC avec couleur bleu
        serie "Achats" valeur achats en FC avec couleur orange
    graphique en camembert ventes avec etiquette mois et valeur montant et description "Février pèse plus."
    carte "Nos agences" :
        pour chaque agence dans agences :
            marqueur agence.nom avec latitude agence.latitude et longitude agence.longitude
        marqueur "Entrepôt" avec latitude -4,39 et longitude 15,26
    audio "extrait.wav" avec description "Un extrait" et transcription "Bonjour."
    video "https://exemple.fr/visite.mp4" avec commandes et description "La visite"
    code qr "https://exemple.fr/lampe" avec description "Lien vers ce produit"
`;
  const f = projet(SOURCE);
  const c = page(f, 'PageAccueil');

  it('un graphique est dessiné par Compose, avec ses séries, sa devise et sa description', () => {
    expect(c).toContain('GraphiqueHumalis("barres", "Graphique en barres", "Les ventes montent.", liste(ventes).map { texte(champ(it, "mois")) }, listOf(SerieHumalis("Ventes", liste(ventes).map { nombre(champ(it, "montant")) }, Couleurs.bleu), SerieHumalis("Achats", liste(ventes).map { nombre(champ(it, "achats")) }, Couleurs.orange)), devise = "FC")');
    expect(c).toContain('GraphiqueHumalis("camembert"');
    const g = f.get(`${CODE}/Graphiques.kt`)!;
    expect(g).toContain('fun graduations(minimum: Double, maximum: Double): List<Double>');
    expect(g).toContain('"Voir les données"');
  });

  it('une carte montre ses marqueurs, dans ses boucles, avec l\'attribution des tuiles', () => {
    expect(c).toMatch(/CarteHumalis\("Nos agences", buildList \{\n\s+for \(agence in liste\(agences\)\) \{\n\s+add\(LieuHumalis\(texte\(champ\(agence, "nom"\)\), nombre\(champ\(agence, "latitude"\)\), nombre\(champ\(agence, "longitude"\)\)\)\)/);
    expect(c).toContain('add(LieuHumalis("Entrepôt", -4.39, 15.26))');
    expect(f.get(`${CODE}/Cartes.kt`)).toContain("© les contributeurs d'OpenStreetMap");
    expect(f.get('app/build.gradle.kts')).toContain('org.osmdroid:osmdroid-android:');
  });

  it('le son et la vidéo passent par Media3 ; un fichier du projet est lu dans l\'application', () => {
    expect(c).toContain('LecteurHumalis("extrait.wav", true, "Un extrait", "Bonjour.")');
    expect(c).toContain('VideoHumalis("https://exemple.fr/visite.mp4", false, "La visite", null)');
    expect(f.get('app/build.gradle.kts')).toContain('androidx.media3:media3-exoplayer:');
  });

  it('le code QR est dessiné d\'après ZXing, noir sur blanc', () => {
    expect(c).toContain('QrHumalis("https://exemple.fr/lampe", "Lien vers ce produit")');
    expect(f.get('app/build.gradle.kts')).toContain('com.google.zxing:core:');
  });
});

describe('cible Android — le compte', () => {
  const source = readFileSync('scripts/essais-android/comptes.humalis', 'utf8');
  const f = projet(source);
  const connexion = page(f, 'PageConnexion');
  const equipe = page(f, 'PageEquipe');

  it('inviter, changer un rôle ou un champ du compte passent par la session et le serveur', () => {
    expect(equipe).toContain('Session.inviter(champAdresse, "vendeur", champs = fiche("telephone" to champTel))');
    expect(equipe).toContain('Serveur.appelReussi("/auth/comptes/:id/role", "POST", fiche("role" to "gerant"), identifiant(m))');
    expect(equipe).toContain('Serveur.appelReussi("/auth/comptes/:id/champs", "POST", fiche("telephone" to "0600000000"), identifiant(m))');
  });

  it('un formulaire en erreur garde ses champs remplis', () => {
    expect(equipe).toMatch(/Messages\.afficher\("Invitation\s:\s\$\{texte\(raisonErreur\d+\)\}", "erreur"\)\n\s+return\n/);
  });

  it('le paiement s\'ouvre dans le navigateur ; l\'IA s\'écrit au fil de l\'eau', () => {
    expect(equipe).toMatch(/Serveur\.payer\("\/api\/reservations\/payer\/total", identifiant\(r\)\)/);
    expect(equipe).toContain('Serveur.demanderIa("Donne une idée de slogan") { reponse = texte(reponse) + it }');
    expect(f.get(`${CODE}/Serveur.kt`)).toContain('entetes["Accept"] = "text/event-stream"');
  });

  it('Google passe par le gestionnaire d\'identifiants ; Apple par sa page, puis le lien profond', () => {
    expect(connexion).toContain('seConnecterAvecGoogle()');
    expect(f.get(`${CODE}/ConnexionGoogle.kt`)).toContain('GetGoogleIdOption.Builder().setServerClientId(identifiant)');
    const apple = f.get(`${CODE}/ConnexionApple.kt`)!;
    expect(apple).toContain('.appendQueryParameter("response_mode", "form_post")');
    expect(apple).toContain('if (recu.getQueryParameter("etat") != etat) throw');
    const main = f.get(`${CODE}/MainActivity.kt`)!;
    expect(main).toContain('if (adresse.host == "connexion-apple") { ConnexionApple.recevoir(adresse); return false }');
    expect(main).toContain('ConnexionApple.reprise()');
    expect(f.get('app/build.gradle.kts')).toContain('androidx.credentials:credentials:');
    expect(f.get('app/build.gradle.kts')).toContain('androidx.browser:browser:');
  });

  it('sans liens profonds, « se connecter avec apple » est refusé sur Android, et dit pourquoi', () => {
    const sans = source.replace('liens profonds "comptes"\n', '');
    expect(erreurs(sans).join('\n')).toContain('demande « liens profonds "…" »');
  });

  it('le lien d\'un e-mail donne son jeton au choix du mot de passe', () => {
    expect(f.get(`${CODE}/MainActivity.kt`)).toContain('takeIf { it.startsWith("jeton=") }?.let { Session.jetonDeLien = ');
    expect(page(f, 'PageBienvenue')).toContain('Session.choisirMotDePasse(champNouveau)');
  });

  it('le serveur renvoie le retour d\'Apple vers l\'application, seulement si APPLE_RETOUR_ANDROID est réglé', async () => {
    const { genererProjetServeur } = await import('../../src/cibles/serveur/projet.js');
    const serveur = [...genererProjetServeur(compile(source).serveurs[0], { nom: 'commerce', source: 'comptes.humalis' } as never).values()].join('\n');
    expect(serveur).toContain("routeApple.post('/retour'");
    expect(serveur).toContain("retour !== schema + '://connexion-apple'");
    expect(serveur).toContain('APPLE_RETOUR_ANDROID=');
  });
});

describe('cible Android — temps réel, hors-ligne et arrière-plan', () => {
  const f = projet(readFileSync('scripts/essais-android/hors-ligne.humalis', 'utf8'));
  const c = page(f, 'PageAccueil');

  it('ces phrases passent sur Android', () => {
    expect(verifierAppareilPourLaCible(compile(readFileSync('scripts/essais-android/hors-ligne.humalis', 'utf8')), 'android')).toEqual([]);
  });

  it('« en direct » relit la route à chaque annonce, et après une coupure', () => {
    expect(c).toContain('portee.launch { ecouterDirect("/api/notes") { charger1() } }');
    expect(f.get(`${CODE}/Direct.kt`)).toContain('if (coupee) { connexion.disconnect(); return@withContext 2 }');
  });

  it('« avec hors ligne » garde la dernière réponse, et ne dit rien sans réseau', () => {
    expect(c).toContain('var notes by remember { EtatMemorise("humalis.essai.accueil.notes", listOf<Any?>()) }');
    expect(c).toContain('Serveur.lire("/api/notes", horsLigne = true)');
  });

  it('« … hors ligne » garde l\'envoi et le fait partir au retour du réseau', () => {
    expect(c).toContain('if (!Serveur.appelReussiOuGarder("/api/notes", envoi = fiche("texte" to champNote))) return');
    const envois = f.get(`${CODE}/Envois.kt`)!;
    expect(envois).toContain('reseau.registerDefaultNetworkCallback(');
    expect(envois).toContain('cleEnvoi = texte(suivant["numero"])');
    expect(f.get(`${CODE}/MainActivity.kt`)).toContain('EnvoisGardes.demarrer()');
  });

  it('« en arriere plan : » est une tâche de WorkManager, qui ne voit que les variables partagées', () => {
    const fond = f.get(`${CODE}/ArrierePlan.kt`)!;
    expect(fond).toContain('PeriodicWorkRequestBuilder<TravailHumalis>(15, TimeUnit.MINUTES)');
    expect(fond).toContain('Partage.reveils = plus(Partage.reveils, 1.0)');
    expect(f.get(`${CODE}/MainActivity.kt`)).toContain('ArrierePlan.planifier(applicationContext)');
    expect(f.get('app/build.gradle.kts')).toContain('androidx.work:work-runtime-ktx:');
    expect(erreurs('page "a" :\n    variable x = 0\n    titre "A"\n    en arriere plan :\n        changer x par 1\n').join('\n')).toContain('ne voit que les variables partagées');
  });
});

describe('cible Android — les notifications', () => {
  const source = readFileSync('scripts/essais-android/notifications.humalis', 'utf8');
  const firebase = { cleApi: 'AIza-essai', application: '1:123:android:abc', projet: 'projet-essai', expediteur: '123' };

  it('« activer notifications » demande la permission, puis inscrit l\'appareil auprès du serveur', () => {
    const f = projet(source, { firebase });
    expect(page(f, 'PageAccueil')).toContain('activerNotifications()');
    const n = f.get(`${CODE}/Notifications.kt`)!;
    expect(n).toContain('permission(Manifest.permission.POST_NOTIFICATIONS)');
    expect(n).toContain('Serveur.appelReussi("/auth/appareils", "POST", fiche("android" to jeton))');
    expect(n).toContain('setProjectId("projet-essai")');
    expect(f.get(`${CODE}/MainActivity.kt`)).toContain('NotificationsHumalis.configurer(applicationContext)');
    const m = f.get('app/src/main/AndroidManifest.xml')!;
    expect(m).toContain('android.permission.POST_NOTIFICATIONS');
    expect(m).toContain('<action android:name="com.google.firebase.MESSAGING_EVENT" />');
    expect(f.get('app/build.gradle.kts')).toContain('com.google.firebase:firebase-messaging:');
  });

  it('sans --firebase, la compilation dit ce qu\'il manque', () => {
    const { diagnostics, fichiers } = produire(source);
    expect(diagnostics.map((d) => d.message).join('\n')).toContain('Compilez avec --firebase google-services.json');
    expect(fichiers.get(`${CODE}/Notifications.kt`)).toContain('const val REGLEE = false');
  });

  it('google-services.json donne les identifiants de cette application seulement', async () => {
    const { lireFirebase } = await import('../../src/cibles/android/comptes.js');
    const json = JSON.stringify({ project_info: { project_number: '123', project_id: 'p' }, client: [{ client_info: { mobilesdk_app_id: '1:123:android:x', android_client_info: { package_name: 'local.humalis.essai' } }, api_key: [{ current_key: 'AIza' }] }] });
    expect(lireFirebase(json, 'local.humalis.essai')).toEqual({ cleApi: 'AIza', application: '1:123:android:x', projet: 'p', expediteur: '123' });
    expect(lireFirebase(json, 'autre.application')).toBeUndefined();
  });

  it('le serveur envoie aussi vers Firebase, avec un compte de service', async () => {
    const { NOTIFICATIONS } = await import('../../src/cibles/serveur/logique.js');
    expect(NOTIFICATIONS).toContain("fiche = { genre: 'android', cle: corps.android }");
    expect(NOTIFICATIONS).toContain("scope: 'https://www.googleapis.com/auth/firebase.messaging'");
    expect(NOTIFICATIONS).toContain("'/v1/projects/' + encodeURIComponent(compte.project_id) + '/messages:send'");
  });

  it('plus aucune action du langage n\'est refusée sur Android', () => {
    expect(readFileSync('src/cibles/android/actions.ts', 'utf8')).toContain('const oubliee: never = a;');
  });
});

describe('cible Android — noms et icônes', () => {
  it('les noms Humalis deviennent des identifiants Kotlin sûrs', () => {
    expect(nomKotlin('nombre_articles')).toBe('nombreArticles');
    expect(nomKotlin('val')).toBe('val_');
    expect(nomKotlin('texte')).toBe('texte_');
    expect(nomRoute('mentions-legales')).toBe('mentions_legales');
    expect(chaineKotlin('a "b" $c')).toBe('"a \\"b\\" \\$c"');
    expect(identifiantAndroid('Mon-Site.App')).toBe('local.humalis.mon_site_app'.replace('local.humalis.mon_site_app', 'mon_site.app'));
    expect(identifiantAndroid('boutique')).toBe('local.humalis.boutique');
  });

  it('les icônes sont celles du web (Lucide), tracées au trait', () => {
    expect(lucideDe('panier')).toBe('shopping-cart');
    expect(lucideDe('caddie')).toBe('shopping-cart');
    const k = iconesKotlin('local.humalis.essai', new Set(['panier', 'etoile']));
    expect(k).toContain('val panier by lazy { icone("panier", "m2.05 2.05');
    expect(k).toContain('strokeLineCap = StrokeCap.Round');
    // Un cercle de Lucide devient deux arcs.
    expect(k).toMatch(/"M16 20a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/);
  });
});

describe('cible Android — le mouvement, les raccourcis et les menus', () => {
  it('une liste « avec deplacement » se réordonne du doigt, et « quand l\'ordre change » suit', () => {
    const f = projet(`page "accueil" :\n    variable taches = ["a", "b"]\n    pour chaque t dans taches avec deplacement :\n        texte t\n    quand l'ordre de taches change :\n        afficher "ok"\n`);
    const p = page(f, 'PageAccueil');
    expect(p).toContain('ListeDeplacableHumalis(liste(taches), { taches = it }, { portee.launch { quandOrdreChangeTaches() } }) { t ->');
    expect(p).toContain('suspend fun quandOrdreChangeTaches()');
    const m = page(f, 'Mouvement');
    expect(m).toContain('detectDragGesturesAfterLongPress');
    expect(m).toContain('CustomAccessibilityAction("Monter")');
    expect(m).toContain('CustomAccessibilityAction("Descendre")');
  });

  it('un menu de l\'application devient le menu « ⋮ », avec ses raccourcis et ses changements de page', () => {
    const f = projet(`variable n = 0 avec partagee\n\nmenu de l'application "Fichier" :\n    commande "Nouveau" avec raccourci "ctrl+n" :\n        changer n par n + 1\n    commande "Réglages" :\n        rediriger vers "reglages"\n\npage "accueil" :\n    titre "t"\n\npage "reglages" :\n    titre "r"\n`);
    const c = page(f, 'Commandes');
    expect(c).toContain('suspend fun commandeMenu1(nav: NavHostController)');
    expect(c).toContain('Partage.n = plus(Partage.n, 1.0)');
    expect(c).toContain('CommandeHumalis("Nouveau", "ctrl+n") { commandeMenu1(nav) }');
    expect(c).toMatch(/commandeMenu2[\s\S]*nav\.|allerVers\(nav/);
    const app = page(f, 'MainActivity');
    expect(app).toContain('BarreMenusHumalis(menus)');
    expect(app).toContain('raccourciDesMenus(menus, it)');
    expect(page(f, 'Menus')).toContain('contentDescription = "Menu de l\'application"');
    expect(verifierAppareilPourLaCible(compile(`menu de l'application "F" :\n    commande "N" :\n        afficher "x"\n\npage "accueil" :\n    titre "t"\n`), 'android')).toEqual([]);
  });

  it('les raccourcis d\'une page écoutent un clavier branché', () => {
    const p = page(projet(`page "accueil" :\n    texte "x"\n    quand l'utilisateur appuie sur "controle+k" :\n        afficher "ok"\n`), 'PageAccueil');
    expect(p).toContain('onPreviewKeyEvent');
    expect(p).toContain('correspond(evenement, "controle+k")');
  });

  it('une animation d\'entrée respecte « réduire les animations »', () => {
    const f = projet(`page "accueil" :\n    titre "x" avec animation montee\n`);
    expect(page(f, 'PageAccueil')).toContain('.animeHumalis("montee"');
    expect(page(f, 'Mouvement')).toContain('ANIMATOR_DURATION_SCALE');
  });

  it('une source à clé secrète passe par la passerelle du serveur, jamais avec la clé', () => {
    const f = projet(`serveur "agenda" :\n    donnee rappel :\n        texte : texte\n    route "rappels" :\n        connecte peut lire rappel\n\nsource "meteo" :\n    adresse "https://api.meteo.example"\n    jeton secret depuis l'environnement "METEO_CLE" dans le parametre "key"\n    donnee prevision :\n        jour : texte\n    route "previsions" :\n        tout le monde peut lire une liste de prevision dans "jours"\n\npage "accueil" :\n    variable p = []\n    quand la page se charge :\n        envoyer requete vers "previsions" de la source "meteo" dans p\n`);
    const s = page(f, 'Sources');
    expect(s).toContain('/api/passerelle/meteo');
    expect(s).not.toContain('METEO_CLE');
  });
});

describe('cible Android — les composants natifs', () => {
  const f = projet(`page "accueil" :\n    variable courses = ["Pain"]\n    variable fois = 0\n    actualiser en tirant :\n        changer fois par fois + 1\n    texte "x"\n    menu d'options :\n        option "Copier" :\n            afficher "Copié"\n    pour chaque c dans courses :\n        ligne :\n            texte c\n        action en glissant "Supprimer" :\n            retirer c de courses\n    etat vide "Rien" avec icone "panier" et description "Vide."\n`);
  const p = page(f, 'PageAccueil');

  it('tirer la page vers le bas relance « actualiser en tirant »', () => {
    expect(p).toMatch(/ActualiserHumalis\(\{ quandClique\w+\(\) \}\) \{/);
    expect(page(f, 'Natifs')).toContain('PullToRefreshBox(');
  });

  it('« menu d\'options » se pose sur l\'élément au-dessus, au toucher prolongé', () => {
    expect(p).toMatch(/OptionsHumalis\(listOf\(ActionHumalis\("Copier"\) \{ portee\.launch \{ quandClique\w+\(\) \} \}\)\) \{\n\s+Text\("x"/);
    expect(page(f, 'Natifs')).toContain('detectTapGestures(onLongPress');
  });

  it('« action en glissant » fait glisser la ligne, et TalkBack propose l\'action', () => {
    expect(p).toMatch(/GlisserHumalis\(listOf\(ActionHumalis\("Supprimer"\) \{ portee\.launch \{ quandClique\w+\(c\) \} \}\)\) \{/);
    // L'action n'est plus un bouton dans la ligne.
    expect(p).not.toMatch(/Button\([^)]*\) \{ Text\("Supprimer"/);
    expect(page(f, 'Natifs')).toContain('CustomAccessibilityAction(a.titre)');
  });

  it('« etat vide » montre son icône, son titre et son explication', () => {
    expect(p).toContain('EtatVideHumalis("Rien", "Vide.", Icones.panier)');
    expect(page(f, 'Icones')).toContain('val panier by lazy');
  });

  it('sans composant natif, Natifs.kt n\'est pas écrit', () => {
    expect(projet(COMPTEUR).has(`${CODE}/Natifs.kt`)).toBe(false);
  });
});

