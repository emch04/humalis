import { describe, it, expect } from 'vitest';
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
  it('les langues, les sous-pages et les composants React sont refusés clairement', () => {
    expect(erreurs('langues :\n    francais\n    anglais\npage "a" :\n    titre "Accueil" en anglais "Home"\n').join('\n')).toMatch(/langues.*pas encore disponible sur la cible Android/);
  });

  it('la photo et le scanner restent propres à Apple', () => {
    const app = compile('page "a" :\n    variable image = rien\n    titre "A"\n    bouton "Photo"\n    quand l\'utilisateur clique sur "Photo" :\n        photo dans image\n');
    expect(verifierAppareilPourLaCible(app, 'android').map((d) => d.message).join('\n')).toMatch(/que sur la cible Apple.*--cible android/);
  });

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

  it('un refus cite la phrase Humalis, pas un nom interne', () => {
    const messages = erreurs(`serveur "s" :
    donnee commande :
        total : nombre
    route "commandes" :
        connecte peut lire commande
    ia par anthropic
    connecte peut demander a ia
page "a" :
    variable reponse = ""
    titre "A"
    bouton "Demander"
    quand l'utilisateur clique sur "Demander" :
        demander a ia "Bonjour" dans reponse
`).join('\n');
    expect(messages).toContain('« demander a ia … » : cela n\'est pas encore disponible sur la cible Android.');
    expect(messages).not.toMatch(/demandeIa/);
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
