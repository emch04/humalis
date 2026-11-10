/**
 * La cible Android : un programme Humalis devient un projet Android natif,
 * en Kotlin et Jetpack Compose, construit par Gradle. Comme la cible Apple
 * écrit du SwiftUI, celle-ci écrit du Kotlin lisible, sans navigateur embarqué
 * ni JavaScript.
 */
import type { Diagnostic } from '../../analyse/erreurs.js';
import { MESSAGES, versionDe } from '../../i18n/messages.js';
import { simplifier } from '../../analyse/elements.js';
import { nomDeLaCopie, type InfoMedia } from '../../ri/medias.js';
import type { Application, Ecran, SourceRI, ThemeRI } from '../../ri/types.js';
import { contenuBinaire } from '../binaire.js';
import { cheminsDesPages } from '../web/projet.js';
import { COULEURS_CSS } from '../web/styles.js';
import { EcrivainActions } from './actions.js';
import { APPLE_KT, GOOGLE_KT, notificationsKotlin, type Firebase } from './comptes.js';
import { DIRECT_KT, ENVOIS_KT, fondKotlin } from './temps-reel.js';
import { langueDuStyle } from '../commun/styles-natifs.js';
import { CARTES_KT, GRAPHIQUES_KT, LECTEURS_KT, MENUS_KT, MOUVEMENT_KT, NATIFS_KT, QR_KT } from './medias.js';
import { APPAREIL_KT, CHEMINS_FICHIERS, FICHIERS_KT, SCANNER_KT, SYSTEME_KT } from './appareil.js';
import { CssAndroid, type Portee as PorteeCss } from './css.js';
import { FORMATS_KT } from './formats.js';
import { LANGUES_KT, traduireMessagesKotlin, INTERFACE_KT, MEMOIRE_KT, SERVEUR_KT, VALEURS_KT, kotlin } from './bibliotheque.js';
import { EcrivainKotlin } from './ecrivain.js';
import { AVANT_PLAN_ICONE, CONSTRUCTION_RACINE, ENVELOPPE_GRADLE, IGNORES_GIT, PROPRIETES_GRADLE, SECURITE_RESEAU, THEME_XML, VERSIONS, constructionApp, couleurIcone, iconeAdaptative, manifeste, reglagesGradle } from './gradle.js';
import { iconesKotlin } from './icones.js';
import { chaineKotlin, identifiantAndroid, nomApplication, nomComposant, nomKotlin, nomRoute } from './noms.js';
import { GenerateurPage, type ContexteAndroid } from './page.js';
import { Valeurs, type Portee } from './valeurs.js';
import { dansLePaquet, lireVueNatifKt, stylesKotlinNommes, type VueNatifKt } from './natifs.js';
import { ecrireFormes, lisezmoiFormes, VERSIONS_FORMES } from './formes.js';
import { captureErreursKotlin } from './capture-erreurs.js';
import { requetesCapture } from '../capture-erreurs.js';

export const MARQUE_ANDROID = '.humalis-projet';

export interface OptionsAndroid {
  /** Le nom du projet, tiré du fichier Humalis (« boutique »). */
  nom: string;
  source: string;
  /** L'adresse du serveur que l'application appelle. */
  serveur?: string;
  /** L'identifiant de l'application (« dev.exemple.boutique »). */
  identifiant?: string;
  medias?: Map<string, InfoMedia>;
  images?: Map<string, string>;
  /** Les identifiants publics de Firebase (--firebase google-services.json), pour recevoir les notifications. */
  firebase?: Firebase;
  /** L'empreinte SHA-256 du certificat qui signe l'application, pour les liens https:// d'un domaine. */
  empreinte?: string;
  /** Les fichiers de police du thème, en base 64. */
  polices?: Map<string, string>;
  /** Le contenu des fichiers CSS du projet (« utiliser style "…" », avec ou sans « sur android »). */
  fichiersStyle?: Map<string, string>;
  /** Les vues Kotlin écrites à la main (« sur android "Carte.kt" »), par nom de composant : leur fichier. */
  natifs?: Map<string, { nom: string; contenu: string }>;
  /** Le module de la montre (Wear OS) ou de la télévision (Android TV) : seulement les pages « sur montre » ou « sur tele ». */
  appareil?: 'montre' | 'tele';
}

const PAS_ENCORE = "cela n'est pas encore disponible sur la cible Android";

/** Ce qui n'a pas encore d'équivalent ici : la compilation le dit au lieu de produire quelque chose de faux. */
function verifier(application: Application): Diagnostic[] {
  const d: Diagnostic[] = [];
  const avertir = (ligne: number, message: string) => d.push({ gravite: 'avertissement', ligne, message });
  const refuser = (ligne: number, message: string) => d.push({ gravite: 'erreur', ligne, message: `${message} : ${PAS_ENCORE}.` });
  const utilises = new Set<string>();
  const parcourir = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(parcourir);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (o.type === 'composant' && typeof o.nom === 'string') utilises.add(o.nom);
      Object.values(o).forEach(parcourir);
    }
  };
  parcourir([application.ecrans, application.disposition]);
  for (const c of application.composantsReact) {
    // Une vue Kotlin écrite à la main (« sur android "….kt" ») n'est pas encore branchée ; sans elle, rien à montrer.
    if (!utilises.has(c.nom)) continue;
    if (c.android === undefined) d.push({ gravite: 'erreur', ligne: c.ligne, message: `le composant « ${c.nom} » n'a pas de vue Kotlin pour Android, qui n'exécute pas de JavaScript : ajoutez « sur android "./natif/${c.nom}.kt" » à sa ligne « utiliser ${c.module ? 'module' : 'composant'} », ou écrivez-le en Humalis (« composant "${c.nom}" : »).` });
  }
  for (const e of application.ecrans) {
    const parent = e.parent !== undefined ? application.ecrans.find((x) => x.nom === e.parent) : undefined;
    if (parent?.parametresAdresse?.length) refuser(e.ligne, `« page "${e.nom}" dans "${e.parent}" » : une page parente qui attend un paramètre`);
    if (e.dessin) avertir(e.ligne, `« dessinee pour » est sans effet sur Android : la page « ${e.nom} » suit les styles nommés.`);
  }
  for (const p of application.theme?.polices ?? []) {
    if (p.fichier && !/\.(ttf|otf)$/i.test(p.fichier)) avertir(1, `la police « ${p.fichier} » n'est pas chargée sur Android, qui lit les fichiers .ttf et .otf : la police du système est utilisée à la place. Ajoutez une version .ttf de « ${p.nom} ».`);
  }
  if (application.barreLaterale) avertir(1, "« avec barre laterale » est sans effet sur Android.");
  const logo = application.site?.logo;
  if (logo && !/\.png$/i.test(logo)) avertir(application.site!.ligne, `le logo « ${logo} » ne peut pas servir d'icône sur Android, qui demande un PNG carré : l'application garde l'icône par défaut.`);
  return d;
}

// ─── Les fichiers partagés ─────────────────────────────────────────────────

const hex = (c: string) => `0xFF${c.slice(1, 7).toUpperCase()}`;

/** Le nom d'une ressource de police : des minuscules, des chiffres et des « _ », commençant par une lettre. */
const nomRessource = (nom: string): string => `police_${nom.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;

/** La famille d'une police du thème : son fichier, sinon la famille du système qui lui ressemble. */
function familleKotlin(p: ThemeRI['polices'][number], fichiers: Set<string>): string {
  if (p.fichier && fichiers.has(p.fichier)) return `FontFamily(Font(R.font.${nomRessource(p.fichier)}))`;
  if (p.role === 'code' || /mono|code|courier/i.test(p.nom)) return 'FontFamily.Monospace';
  if (/serif|georgia|times|garamond|playfair|merriweather|lora|baskerville/i.test(p.nom) && !/sans/i.test(p.nom)) return 'FontFamily.Serif';
  return 'FontFamily.Default';
}

function themeKotlin(paquet: string, theme: ThemeRI | undefined, polices: Set<string> = new Set()): string {
  const couleurs = new Map(Object.entries(COULEURS_CSS));
  for (const c of theme?.couleurs ?? []) couleurs.set(c.nom, { clair: c.clair, sombre: c.sombre, encreClair: c.encreClair, encreSombre: c.encreSombre });
  const marque = theme?.couleurs.find((c) => c.nom === 'marque') ?? { clair: '#1f5fbf', sombre: '#7fb0ff', encreClair: '#ffffff', encreSombre: '#141416' };
  const e = new EcrivainKotlin();
  e.ligne('// Produit par Humalis : les couleurs, en clair et en sombre, et le thème de l\'application.');
  e.ligne(`package ${paquet}`);
  e.ligne();
  for (const i of ['androidx.compose.foundation.isSystemInDarkTheme', 'androidx.compose.material3.MaterialTheme', 'androidx.compose.material3.Typography', 'androidx.compose.ui.text.font.Font', 'androidx.compose.ui.text.font.FontFamily', 'androidx.compose.material3.darkColorScheme', 'androidx.compose.material3.lightColorScheme', 'androidx.compose.runtime.Composable', 'androidx.compose.runtime.getValue', 'androidx.compose.runtime.setValue', 'androidx.compose.ui.graphics.Color']) e.ligne(`import ${i}`);
  e.ligne();
  e.bloc('object Couleurs {', () => {
    e.ligne(`val accent = CouleurHumalis(${hex(marque.clair)}, ${hex(marque.sombre)})`);
    e.ligne(`val encreAccent = CouleurHumalis(${hex(marque.encreClair)}, ${hex(marque.encreSombre)})`);
    for (const [nom, c] of couleurs) {
      const k = nomKotlin(nom);
      e.ligne(`val ${k} = CouleurHumalis(${hex(c.clair)}, ${hex(c.sombre)})`);
      e.ligne(`val encre${k.charAt(0).toUpperCase()}${k.slice(1)} = CouleurHumalis(${hex(c.encreClair)}, ${hex(c.encreSombre)})`);
    }
  });
  e.ligne();
  e.ligne('/** Le mode clair ou sombre : celui du système, sauf si la personne en a choisi un (« changer theme par … »). */');
  e.bloc('object Apparence {', () => {
    e.ligne(`private var mode by EtatMemorise("humalis.theme", ${chaineKotlin(theme?.mode ?? 'automatique')})`);
    e.ligne('private var dernierSombre = false');
    e.ligne();
    e.ligne('@Composable');
    e.bloc('fun sombre(): Boolean {', () => {
      e.ligne('val systeme = isSystemInDarkTheme()');
      e.ligne('dernierSombre = when (mode) { "clair" -> false; "sombre" -> true; else -> systeme }');
      e.ligne('return dernierSombre');
    });
    e.ligne();
    e.bloc('fun changer(valeur: String) {', () => {
      e.ligne('mode = if (valeur == "bascule") (if (dernierSombre) "clair" else "sombre") else valeur');
    });
  });
  e.ligne();
  const titres = theme?.polices.find((p) => p.role === 'titres');
  const texte = theme?.polices.find((p) => p.role === 'texte');
  if (titres || texte) {
    e.ligne();
    e.ligne('/** Les polices du thème : celle des titres, celle du texte. */');
    e.bloc('object Polices {', () => {
      e.ligne(`val titres: FontFamily = ${titres ? familleKotlin(titres, polices) : texte ? familleKotlin(texte, polices) : 'FontFamily.Default'}`);
      e.ligne(`val texte: FontFamily = ${texte ? familleKotlin(texte, polices) : 'FontFamily.Default'}`);
    });
    e.ligne();
    e.bloc('private val typographie: Typography = Typography().let { t ->', () => {
      e.ligne('t.copy(');
      e.indenter(() => {
        for (const s of ['displayLarge', 'displayMedium', 'displaySmall', 'headlineLarge', 'headlineMedium', 'headlineSmall', 'titleLarge', 'titleMedium', 'titleSmall']) e.ligne(`${s} = t.${s}.copy(fontFamily = Polices.titres),`);
        for (const s of ['bodyLarge', 'bodyMedium', 'bodySmall', 'labelLarge', 'labelMedium', 'labelSmall']) e.ligne(`${s} = t.${s}.copy(fontFamily = Polices.texte),`);
      });
      e.ligne(')');
    });
  }
  e.ligne();
  e.ligne('@Composable');
  e.bloc('fun ThemeHumalis(contenu: @Composable () -> Unit) {', () => {
    e.ligne('val sombre = Apparence.sombre()');
    e.ligne('val schema = if (sombre) darkColorScheme(primary = Couleurs.accent.lue(), onPrimary = Couleurs.encreAccent.lue()) else lightColorScheme(primary = Couleurs.accent.lue(), onPrimary = Couleurs.encreAccent.lue())');
    e.ligne(`MaterialTheme(colorScheme = schema${titres || texte ? ', typography = typographie' : ''}, content = contenu)`);
  });
  return e.texte();
}

function sourcesKotlin(paquet: string, sources: SourceRI[], serveur: string): string {
  const e = new EcrivainKotlin();
  e.ligne("// Produit par Humalis : les API que les pages appellent. Un jeton public part avec l'application ; un secret n'est jamais écrit ici.");
  e.ligne(`package ${paquet}`);
  e.ligne();
  e.bloc('object Sources {', () => {
    for (const s of sources) {
      const champs = [
        `nom = ${chaineKotlin(s.nom)}`,
        // Une source à jeton secret : l'application appelle la passerelle du serveur Humalis, avec sa session ; le secret n'est jamais ici.
        `adresse = ${chaineKotlin(s.passerelle ? `${serveur}/api/passerelle/${encodeURIComponent(s.nom)}` : adresseServeur(s.adresse))}`,
        ...(s.entetes.length ? [`entetes = listOf(${s.entetes.map((h) => `${chaineKotlin(h.nom)} to ${chaineKotlin(h.valeur)}`).join(', ')})`] : []),
        ...(s.jetonPublic && !s.passerelle
          ? [`jeton = ${chaineKotlin(s.jetonPublic.valeur)}`, `placeJeton = ${chaineKotlin(s.jetonPublic.place.genre)}`, ...(s.jetonPublic.place.genre !== 'autorisation' ? [`nomJeton = ${chaineKotlin(s.jetonPublic.place.nom)}`] : [])]
          : []),
        ...(s.enveloppe !== undefined ? [`enveloppe = ${chaineKotlin(s.enveloppe)}`] : []),
        ...(s.erreurDans !== undefined ? [`erreurDans = ${chaineKotlin(s.erreurDans)}`] : []),
        ...(s.session || s.passerelle ? ['session = true'] : []),
        `essais = ${s.essais ?? 2}`,
        `delai = ${(s.delai ?? 10) * 1000}`,
      ];
      e.ligne(`val ${nomKotlin(s.nom)} = SourceHumalis(${champs.join(', ')})`);
    }
  });
  return e.texte();
}

/** L'adresse publique du serveur, pour les messages ; « https://ton-serveur » quand elle n'est pas donnée. */
const serveurPublic = (adresse?: string): string => (adresse && /^https:\/\//.test(adresse) ? adresse.replace(/\/+$/, '') : 'https://ton-serveur');

/** L'adresse du serveur vue depuis l'émulateur : « localhost » y désigne le téléphone, l'ordinateur est 10.0.2.2. */
export function adresseServeur(adresse: string): string {
  return adresse.replace(/^http:\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/i, 'http://10.0.2.2').replace(/\/+$/, '');
}

const ROUTES_KT = String.raw`
/** Où revenir après la connexion : la page réservée qui a renvoyé vers « sinon ». */
object Routes {
    var apresConnexion: String? = null
    /** « carte#desserts » : l'ancre où la page qui s'ouvre doit descendre. */
    var ancre: String? = null
}

fun allerVers(nav: NavHostController, route: String) {
    nav.navigate(route) { launchSingleTop = true }
}

/** « aller a "…" puis continuer » : la page qui attendait la connexion, sinon celle donnée. */
fun continuerVers(nav: NavHostController, sinon: String) {
    val route = Routes.apresConnexion ?: sinon
    Routes.apresConnexion = null
    nav.navigate(route) { popUpTo(nav.graph.id) { inclusive = true } }
}

/** Une adresse lue dans une variable : externe (https, mailto, tel), ou une page de l'application (« /produit/3 »). */
fun ouvrirLien(nav: NavHostController, adresse: String) {
    if (Regex("^[a-z][a-z0-9+.-]*:", RegexOption.IGNORE_CASE).containsMatchIn(adresse.trim())) return ouvrirExterne(adresse)
    depuisChemin(adresse)?.let { allerVers(nav, it) }
}

/** « /produit/3 » → « produit/3 », d'après les adresses des pages du site. */
fun depuisChemin(chemin: String): String? {
    val morceaux = chemin.substringBefore('?').substringBefore('#').trim('/').split('/').filter { it.isNotEmpty() }
    for ((motif, route) in CHEMINS) {
        val attendus = motif.trim('/').split('/').filter { it.isNotEmpty() }
        if (attendus.size != morceaux.size) continue
        if (attendus.zip(morceaux).all { (a, m) -> a.startsWith(":") || a == m }) {
            var lue = route.substringBefore('?')
            attendus.zip(morceaux).filter { it.first.startsWith(":") }.forEach { (a, m) -> lue = lue.replace("{" + a.drop(1) + "}", Uri.encode(Uri.decode(m))) }
            return lue
        }
    }
    return null
}

/** Une page réservée : les autres sont renvoyés vers « sinon », puis reviennent ici après s'être connectés. */
@Composable
fun GardeHumalis(nav: NavHostController, qui: String, sinon: String, ici: String, contenu: @Composable () -> Unit) {
    LaunchedEffect(Unit) { Session.attendre() }
    if (!Session.pret) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    val autorise = when (qui) {
        "connecte" -> Session.connecte
        "admin" -> Session.admin
        else -> Session.aRole(*qui.removePrefix("role:").split(",").map { it.trim() }.toTypedArray())
    }
    if (autorise) contenu()
    else LaunchedEffect(Unit) {
        Routes.apresConnexion = ici
        nav.navigate(sinon) { popUpTo(nav.graph.id) { inclusive = true } }
    }
}
`;

interface RouteAndroid {
  ecran: Ecran;
  motif: string;
  parametres: string[];
  filtres: string[];
}

function routesDe(application: Application): Map<string, RouteAndroid> {
  const routes = new Map<string, RouteAndroid>();
  const pris = new Set<string>();
  for (const e of application.ecrans) {
    let base = nomRoute(e.nom);
    for (let i = 2; pris.has(base); i++) base = `${nomRoute(e.nom)}_${i}`;
    pris.add(base);
    const parametres = (e.parametresAdresse ?? []).map(nomKotlin);
    const filtres = (e.filtres ?? []).map((f) => nomKotlin(f.nom));
    const motif = base + parametres.map((p) => `/{${p}}`).join('') + (filtres.length ? `?${filtres.map((f) => `${f}={${f}}`).join('&')}` : '');
    routes.set(e.nom, { ecran: e, motif, parametres, filtres });
  }
  return routes;
}

/** La route d'une page, avec ses valeurs écrites en Kotlin : `"produit/${Uri.encode(id)}"`. */
function routeKotlin(r: RouteAndroid, parametres: string[], filtres: string[]): string {
  let texte = r.motif.split('/{')[0].split('?')[0];
  parametres.forEach((p) => (texte += `/\${Uri.encode(${p})}`));
  const avecValeur = r.filtres.map((f, i) => ({ f, v: filtres[i] })).filter((x) => x.v !== undefined && x.v !== '""');
  if (avecValeur.length) texte += `?${avecValeur.map((x) => `${x.f}=\${Uri.encode(${x.v})}`).join('&')}`;
  return `"${texte}"`;
}

function applicationKotlin(paquet: string, application: Application, routes: Map<string, RouteAndroid>, entree: Ecran, disposition: { entete?: string; sansEntete: string[]; pied?: string; sansPied: string[] }, onglets: { titre: string; route: string; icone?: string }[], avecApple = false, avecMenus = false): string {
  const e = new EcrivainKotlin();
  const parentDe = (x: Ecran) => (x.parent !== undefined ? application.ecrans.find((p) => p.nom === x.parent) : undefined);
  const liensProfonds = liensProfondsDe(application, routes, entree);
  e.ligne("// Produit par Humalis : l'application, ses pages et leur navigation.");
  e.ligne(`package ${paquet}`);
  e.ligne();
  for (const i of [
    'android.net.Uri',
    'android.os.Bundle',
    'androidx.fragment.app.FragmentActivity',
    'androidx.activity.compose.setContent',
    'androidx.activity.enableEdgeToEdge',
    'androidx.compose.foundation.layout.*',
    'androidx.compose.material3.*',
    'androidx.compose.runtime.*',
    'androidx.compose.ui.Alignment',
    'androidx.compose.ui.Modifier',
    'androidx.navigation.NavHostController',
    'androidx.navigation.NavType',
    'androidx.navigation.compose.NavHost',
    'androidx.navigation.compose.composable',
    'androidx.navigation.compose.currentBackStackEntryAsState',
    'androidx.navigation.compose.rememberNavController',
    'androidx.navigation.navArgument',
    'androidx.navigation.navDeepLink',
    'android.content.Intent',
    'kotlinx.coroutines.launch',
    ...(avecMenus ? ['androidx.compose.foundation.focusable', 'androidx.compose.ui.focus.focusRequester', 'androidx.compose.ui.input.key.onPreviewKeyEvent'] : []),
  ]) e.ligne(`import ${i}`);
  e.ligne();
  e.bloc('class MainActivity : FragmentActivity() {', () => {
    e.bloc('override fun onCreate(savedInstanceState: Bundle?) {', () => {
      e.ligne('super.onCreate(savedInstanceState)');
      e.ligne('Appli.contexte = applicationContext');
      e.ligne('Activite.courante = this');
      e.ligne('enableEdgeToEdge()');
      if (application.liensProfonds) e.ligne('lireLien(intent)');
      e.ligne('setContent { ApplicationHumalis() }');
    });
    e.ligne();
    e.bloc('override fun onDestroy() {', () => {
      e.ligne('if (Activite.courante === this) Activite.courante = null');
      e.ligne('super.onDestroy()');
    });
    if (application.liensProfonds) {
      e.ligne();
      e.ligne('/** Un lien profond reçu quand l\'application est déjà ouverte : la navigation le suit. */');
      e.bloc('override fun onNewIntent(intent: Intent) {', () => {
        e.ligne('super.onNewIntent(intent)');
        e.ligne('if (lireLien(intent)) Liens.recu = intent');
      });
      e.ligne();
      e.ligne('/** Un lien reçu : le retour d\'Apple, ou le jeton d\'un lien de mot de passe ; vrai s\'il mène à une page. */');
      e.bloc('private fun lireLien(intent: Intent?): Boolean {', () => {
        e.ligne('val adresse = intent?.data ?: return false');
        if (avecApple) {
          e.ligne('if (adresse.host == "connexion-apple") { ConnexionApple.recevoir(adresse); return false }');
        }
        e.ligne('adresse.encodedFragment?.takeIf { it.startsWith("jeton=") }?.let { Session.jetonDeLien = android.net.Uri.decode(it.removePrefix("jeton=")) }');
        e.ligne('return true');
      });
      if (avecApple) {
        e.ligne();
        e.bloc('override fun onResume() {', () => {
          e.ligne('super.onResume()');
          e.ligne('ConnexionApple.reprise()');
        });
      }
    }
  });
  if (application.liensProfonds) {
    e.ligne();
    e.bloc('object Liens {', () => e.ligne('var recu by mutableStateOf<Intent?>(null)'));
  }
  e.ligne();
  e.ligne('/** Les adresses des pages du site et leur route dans l\'application (pour « lien … vers variable »). */');
  const chemins = cheminsDesPages(application);
  e.ligne(`val CHEMINS = listOf(${[...routes.entries()].map(([nom, r]) => `${chaineKotlin(chemins.get(nom) ?? '/')} to ${chaineKotlin(r.motif)}`).join(', ')})`);
  e.ligne();
  e.ligne('@Composable');
  e.bloc('fun ApplicationHumalis() {', () => {
    e.bloc('ThemeHumalis {', () => {
      e.ligne('val nav = rememberNavController()');
      e.ligne('val portee = rememberCoroutineScope()');
      e.ligne('val actuelle = nav.currentBackStackEntryAsState().value?.destination?.route');
      if (application.liensProfonds) e.ligne('LaunchedEffect(Liens.recu) { Liens.recu?.let { nav.handleDeepLink(it); Liens.recu = null } }');
      if (onglets.length) {
        e.bloc('Scaffold(bottomBar = {', () => {
          e.bloc('NavigationBar {', () => {
            for (const o of onglets) {
              e.ligne(`NavigationBarItem(selected = actuelle == ${chaineKotlin(o.route)}, onClick = { nav.navigate(${chaineKotlin(o.route)}) { popUpTo(nav.graph.id) { saveState = true }; launchSingleTop = true; restoreState = true } }, icon = { ${o.icone ? `Icon(Icones.${nomKotlin(o.icone)}, null)` : ''} }, label = { Text(${chaineKotlin(o.titre)}) })`);
            }
          });
        }, '}) { marges ->');
      } else e.ligne('Scaffold { marges ->');
      e.indenter(() => {
        const clavier = avecMenus ? '.focusRequester(clavierMenus).focusable().onPreviewKeyEvent { raccourciDesMenus(menus, it) { c -> portee.launch { c() } } }' : '';
        if (avecMenus) {
          e.ligne('val menus = remember(nav) { menusDe(nav) }');
          e.ligne('val clavierMenus = remember { androidx.compose.ui.focus.FocusRequester() }');
          e.ligne('LaunchedEffect(Unit) { try { clavierMenus.requestFocus() } catch (e: IllegalStateException) { } }');
        }
        e.bloc(`Box(Modifier.fillMaxSize().padding(marges).consumeWindowInsets(marges).imePadding()${clavier}) {`, () => {
          e.bloc('Column(Modifier.fillMaxSize()) {', () => {
            if (avecMenus) e.ligne('BarreMenusHumalis(menus) { c -> portee.launch { c() } }');
            if (disposition.entete) e.ligne(`if (actuelle !in listOf<String?>(${disposition.sansEntete.map((r) => chaineKotlin(r)).join(', ')})) ${disposition.entete}(nav)`);
            e.bloc(`NavHost(nav, startDestination = ${chaineKotlin(routes.get(entree.nom)!.motif)}, modifier = Modifier.weight(1f)) {`, () => {
              for (const [, r] of routes) {
                const args = r.filtres.length ? `, arguments = listOf(${r.filtres.map((f) => `navArgument(${chaineKotlin(f)}) { type = NavType.StringType; defaultValue = "" }`).join(', ')})` : '';
                const liens = liensProfonds.get(r.ecran.nom) ?? [];
                const profonds = liens.length ? `, deepLinks = listOf(${liens.map((l) => `navDeepLink { uriPattern = ${chaineKotlin(l)} }`).join(', ')})` : '';
                const lus = [...r.parametres.map((p) => `${p} = e.arguments?.getString(${chaineKotlin(p)}) ?: ""`), ...r.filtres.map((f) => `${f}Lu = e.arguments?.getString(${chaineKotlin(f)}) ?: ""`)];
                let appel = `Page${nomApplication(simplifier(r.ecran.nom) || 'page')}(${['nav', ...lus, ...(r.ecran.parent !== undefined ? ['imbriquee = true'] : [])].join(', ')})`;
                // Une sous-page se montre dans sa page parente, à l'endroit de « sous page » (et ainsi de suite).
                for (let parent = parentDe(r.ecran), vus = 0; parent && vus < 8; parent = parentDe(parent), vus++) {
                  appel = `Page${nomApplication(simplifier(parent.nom) || 'page')}(nav, sousPage = { ${appel} })`;
                }
                const reservee = r.ecran.reservee;
                const sinon = reservee ? routes.get(reservee.sinon) : undefined;
                e.bloc(`composable(${chaineKotlin(r.motif)}${args}${profonds}) { e ->`, () => {
                  if (reservee && sinon) {
                    const ici = routeKotlin(r, r.parametres.map((p) => `e.arguments?.getString(${chaineKotlin(p)}) ?: ""`), []);
                    e.ligne(`GardeHumalis(nav, ${chaineKotlin(reservee.qui)}, ${chaineKotlin(sinon.motif.split('/{')[0].split('?')[0])}, ${ici}) { ${appel} }`);
                  } else e.ligne(appel);
                });
              }
            });
            if (disposition.pied) e.ligne(`if (actuelle !in listOf<String?>(${disposition.sansPied.map((r) => chaineKotlin(r)).join(', ')})) ${disposition.pied}(nav)`);
          });
          e.ligne('MessagesHumalis { actions -> portee.launch { actions() } }');
        });
      });
      e.ligne('}');
      e.ligne('ConfirmationHumalis()');
    });
  });
  e.ligne(ROUTES_KT.replace(/^\n/, ''));
  return e.texte().replace(/\n+$/, '\n');
}

/**
 * Les liens profonds de chaque page : « magasin://produit/42 » (le schéma), et
 * « https://exemple.fr/essai/produit/42 » avec un domaine. Les morceaux suivent
 * l'adresse de la page sur le site ; « :id » reçoit un paramètre.
 */
function liensProfondsDe(application: Application, routes: Map<string, RouteAndroid>, entree: Ecran): Map<string, string[]> {
  const liens = new Map<string, string[]>();
  const profonds = application.liensProfonds;
  if (!profonds) return liens;
  const chemins = cheminsDesPages(application);
  for (const [nom, r] of routes) {
    // La page d'entrée a l'adresse « / » : « magasin://accueil » l'ouvre aussi.
    if (r.ecran === entree) {
      liens.set(nom, [`${profonds.schema}://${r.motif}`]);
      continue;
    }
    let rang = 0;
    const morceaux = (chemins.get(nom) ?? `/${nom}`).split('/').filter(Boolean).map((m) => (m.startsWith(':') && rang < r.parametres.length ? `{${r.parametres[rang++]}}` : m));
    if (morceaux.length === 0) continue;
    const suite = r.filtres.length ? `?${r.filtres.map((f) => `${f}={${f}}`).join('&')}` : '';
    const chemin = morceaux.join('/');
    liens.set(nom, [`${profonds.schema}://${chemin}${suite}`, ...(profonds.domaine ? [`https://${profonds.domaine.replace(/\/+$/, '')}/${chemin}${suite}`] : [])]);
  }
  return liens;
}

/** Le fichier qui dit à Android que le site confie ses liens https:// à l'application. */
function liensDuSite(identifiant: string, empreinte: string): string {
  return `${JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: identifiant, sha256_cert_fingerprints: [empreinte.toUpperCase()] } }], null, 2)}\n`;
}

function lisezmoi(nom: string, identifiant: string, serveur: string | undefined): string {
  return `# ${nom} — application Android

Projet produit par Humalis : Kotlin et Jetpack Compose, sans navigateur embarqué.
Le compilateur réécrit ce dossier à chaque compilation : changez le fichier Humalis, pas ce code.

- Identifiant : \`${identifiant}\`
- Android ${VERSIONS.sdkMinimum === 26 ? '8.0' : VERSIONS.sdkMinimum} au minimum, compilé pour Android 16 (API ${VERSIONS.sdkCible})
- Gradle ${VERSIONS.gradle}, plugin Android ${VERSIONS.pluginAndroid}, Kotlin ${VERSIONS.kotlin}, Compose BOM ${VERSIONS.composeBom}
${serveur ? `- Serveur appelé : \`${serveur}\`\n` : ''}
## Lancer l'application

Avec Android Studio : « Open », choisissez ce dossier, puis ▶ sur un émulateur ou un téléphone.

En ligne de commande (Gradle ${VERSIONS.gradle} et le SDK Android installés) :

\`\`\`sh
echo "sdk.dir=$ANDROID_HOME" > local.properties
gradle assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
\`\`\`

Depuis l'émulateur, l'ordinateur s'appelle \`10.0.2.2\` : un serveur Humalis lancé sur
\`http://localhost:3000\` est appelé à \`http://10.0.2.2:3000\`. Sur un vrai téléphone,
compilez avec \`--serveur https://…\`.
`;
}

/**
 * Les pages d'un appareil : le téléphone (sans « sur montre » ni « sur tele »), la montre ou la télévision.
 * Un bloc « sur montre : » n'est gardé que dans l'application de la montre, « sur tele : » dans celle de la télévision.
 */
function pourAppareil(application: Application, appareil?: 'montre' | 'tele'): Application {
  const filtrer = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      return v.flatMap((n) => {
        const p = n && typeof n === 'object' ? (n as { plateforme?: string }).plateforme : undefined;
        if (p === 'montre' || p === 'tele') return p === appareil ? (filtrer((n as { corps: unknown[] }).corps) as unknown[]) : [];
        return [filtrer(n)];
      });
    }
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, filtrer(x)]));
    return v;
  };
  const ecrans = application.ecrans.filter((e) => e.appareil === appareil).map((e) => filtrer({ ...e, appareil: undefined }) as Ecran);
  const resultat: Application = { ...application, ecrans, composants: filtrer(application.composants) as Application['composants'] };
  if (application.disposition) resultat.disposition = filtrer(application.disposition) as Application['disposition'];
  if (appareil) {
    // L'application de la montre ou de la télévision n'a que ses pages : pas de formes, de liens profonds ni d'onglets.
    delete resultat.formes;
    delete resultat.liensProfonds;
    delete resultat.ongletsApplication;
    if (appareil === 'montre') delete resultat.disposition;
  }
  return resultat;
}

/** Les fichiers propres à la montre (Wear OS) et à la télévision (Android TV). */
const CADRE_MONTRE_KT = String.raw`// Produit par Humalis : le cadre de l'application de la montre (Compose for Wear OS).
package PAQUET

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.TimeText

/** L'heure en haut de l'écran rond, et des marges qui suivent sa courbe ; on revient en arrière en glissant vers la droite. */
@Composable
fun CadreMontre(contenu: @Composable () -> Unit) {
    val rond = LocalConfiguration.current.isScreenRound
    val largeur = LocalConfiguration.current.screenWidthDp
    MaterialTheme {
        AppScaffold(timeText = { TimeText() }) {
            ScreenScaffold { marges ->
                Box(Modifier.fillMaxSize().padding(marges).padding(horizontal = if (rond) (largeur * 0.08f).dp else 4.dp, vertical = if (rond) 18.dp else 4.dp)) {
                    contenu()
                }
            }
        }
    }
}
`;

const CADRE_TELE_KT = String.raw`// Produit par Humalis : le cadre de l'application de la télévision (Compose for TV).
package PAQUET

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface

/**
 * Les marges de sécurité d'un téléviseur (48 sur 27 points) ; la télécommande passe d'un élément à l'autre
 * avec les flèches, et « OK » le touche, comme un doigt.
 */
@Composable
fun CadreTele(contenu: @Composable () -> Unit) {
    MaterialTheme {
        Surface(Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxSize().padding(horizontal = 48.dp, vertical = 27.dp)) {
                contenu()
            }
        }
    }
}
`;

const BANNIERE_TELE = `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis : la bannière de l'application dans l'accueil d'Android TV (320 × 180). -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="320dp"
    android:height="180dp"
    android:viewportWidth="320"
    android:viewportHeight="180">
    <path android:fillColor="@color/ic_launcher_background" android:pathData="M0,0h320v180h-320z" />
    <path android:fillColor="#FFFFFF" android:pathData="M136,60h12v24h24v-24h12v60h-12v-24h-24v24h-12z" />
</vector>
`;

/**
 * Le module de la montre ou de la télévision : un projet produit pour ses seules pages, rangé dans « montre/ »
 * ou « tele/ », avec le même identifiant d'application que le téléphone (Google Play les relie ainsi).
 */
function moduleAppareil(application: Application, options: OptionsAndroid, appareil: 'montre' | 'tele', identifiant: string): { fichiers: Map<string, string>; diagnostics: Diagnostic[] } {
  const paquet = `${identifiant}.${appareil}`;
  const produit = genererProjetAndroid(application, { ...options, identifiant: paquet, appareil });
  const fichiers = new Map<string, string>();
  const code = `${appareil}/src/main/java/${paquet.replace(/\./g, '/')}`;
  for (const [chemin, contenu] of produit.fichiers) {
    if (!chemin.startsWith('app/')) continue;
    fichiers.set(`${appareil}/${chemin.slice(4)}`, contenu);
  }
  const ecrire = (chemin: string, f: (t: string) => string) => fichiers.set(chemin, f(fichiers.get(chemin)!));
  ecrire(`${appareil}/build.gradle.kts`, (t) => {
    let r = t.replace(`applicationId = "${paquet}"`, `applicationId = "${identifiant}"`);
    if (appareil === 'montre') {
      r = r.replace(/minSdk = \d+/, 'minSdk = 30');
      r = r.replace('    debugImplementation(', `    // Compose for Wear OS : le cadre rond, l'heure, et le retour en glissant.\n    implementation("androidx.wear.compose:compose-material3:${VERSIONS_FORMES.montre}")\n    implementation("androidx.wear.compose:compose-navigation:${VERSIONS_FORMES.montre}")\n    debugImplementation(`);
    } else {
      r = r.replace('    debugImplementation(', `    // Compose for TV : la télécommande et les marges du téléviseur.\n    implementation("androidx.tv:tv-material:${VERSIONS_FORMES.tele}")\n    debugImplementation(`);
    }
    return r;
  });
  ecrire(`${appareil}/src/main/AndroidManifest.xml`, (t) => {
    if (appareil === 'montre') {
      return t
        .replace('<application', '<uses-feature android:name="android.hardware.type.watch" />\n\n    <application')
        .replace('        <activity', '        <meta-data android:name="com.google.android.wearable.standalone" android:value="true" />\n        <activity');
    }
    return t
      .replace('<application', '<uses-feature android:name="android.software.leanback" android:required="true" />\n    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />\n\n    <application\n        android:banner="@drawable/banniere_tele"')
      .replace('<category android:name="android.intent.category.LAUNCHER" />', '<category android:name="android.intent.category.LAUNCHER" />\n                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />');
  });
  if (appareil === 'montre') {
    ecrire(`${appareil}/src/main/res/values/themes.xml`, (t) => t.replace('android:Theme.Material.Light.NoActionBar', 'android:Theme.DeviceDefault.NoActionBar'));
    ecrire(`${code}/MainActivity.kt`, (t) =>
      t
        .replace('import androidx.navigation.compose.NavHost\n', 'import androidx.wear.compose.navigation.SwipeDismissableNavHost\n')
        .replace('import androidx.navigation.compose.composable\n', 'import androidx.wear.compose.navigation.composable\n')
        .replace('import androidx.navigation.compose.rememberNavController\n', 'import androidx.wear.compose.navigation.rememberSwipeDismissableNavController\n')
        .replace('rememberNavController()', 'rememberSwipeDismissableNavController()')
        .replace(/\bNavHost\(nav, /, 'SwipeDismissableNavHost(nav, ')
        .replace('setContent { ApplicationHumalis() }', 'setContent { CadreMontre { ApplicationHumalis() } }'),
    );
    fichiers.set(`${code}/CadreMontre.kt`, kotlin(paquet, CADRE_MONTRE_KT));
  } else {
    ecrire(`${code}/MainActivity.kt`, (t) => t.replace('setContent { ApplicationHumalis() }', 'setContent { CadreTele { ApplicationHumalis() } }'));
    fichiers.set(`${code}/CadreTele.kt`, kotlin(paquet, CADRE_TELE_KT));
    fichiers.set(`${appareil}/src/main/res/drawable/banniere_tele.xml`, BANNIERE_TELE);
    if (!fichiers.has(`${appareil}/src/main/res/values/ic_launcher_background.xml`)) fichiers.set(`${appareil}/src/main/res/values/ic_launcher_background.xml`, couleurIcone(application.theme?.couleurs.find((c) => c.nom === 'marque')?.clair ?? '#1f5fbf'));
  }
  return { fichiers, diagnostics: produit.diagnostics };
}

/** L'identifiant de l'application : celui donné par --identifiant, sinon « local.humalis.<nom> ». */
export const identifiantDe = (nom: string, donne?: string): string => identifiantAndroid(donne ?? `local.humalis.${simplifier(nom) || 'application'}`);

export function genererProjetAndroid(complete: Application, options: OptionsAndroid): { fichiers: Map<string, string>; diagnostics: Diagnostic[] } {
  // Le téléphone n'a que ses pages ; celles de la montre et de la télévision vont dans leur module.
  const application = pourAppareil(complete, options.appareil);
  const diagnostics = verifier(application);
  const refuser = (ligne: number, message: string) => {
    const texte = `${message.replace(/\.$/, '')} : ${PAS_ENCORE}.`;
    if (!diagnostics.some((d) => d.message === texte)) diagnostics.push({ gravite: 'erreur', ligne, message: texte });
  };
  const avertir = (ligne: number, message: string) => {
    if (!diagnostics.some((d) => d.message === message)) diagnostics.push({ gravite: 'avertissement', ligne, message });
  };

  const nom = nomApplication(options.nom);
  const identifiant = identifiantDe(options.nom, options.identifiant);
  const paquet = identifiant;
  const dossierCode = `app/src/main/java/${paquet.replace(/\./g, '/')}`;
  const fichiers = new Map<string, string>();
  const ecrireCode = (fichier: string, contenu: string) => fichiers.set(`${dossierCode}/${fichier}`, contenu);

  // Les vues et les styles écrits à la main en Kotlin : lus ici, recopiés dans le paquet de l'application.
  const natifs = new Map<string, VueNatifKt>();
  for (const c of application.composantsReact) {
    const fichier = c.android !== undefined ? options.natifs?.get(c.nom) : undefined;
    if (!fichier) continue;
    const vue = lireVueNatifKt(c.nom, fichier.contenu);
    if (typeof vue === 'string') diagnostics.push({ gravite: 'erreur', ligne: c.ligne, message: `${c.android} : ${vue}` });
    else {
      natifs.set(c.nom, vue);
      ecrireCode(`natif/${fichier.nom}`, dansLePaquet(fichier.contenu, paquet));
    }
  }
  const stylesNatifs = new Map<string, string>();
  for (const f of application.fichiersStyle) {
    const contenu = options.fichiersStyle?.get(f.chemin);
    if (langueDuStyle(f.chemin) !== 'kotlin' || contenu === undefined) continue;
    const lus = stylesKotlinNommes(contenu);
    if (lus.size === 0) avertir(f.ligne, `« ${f.chemin} » ne déclare aucun style : écrivez « fun Modifier.carte(): Modifier = … » pour le style « carte ».`);
    for (const [cle, fonction] of lus) stylesNatifs.set(cle, fonction);
    ecrireCode(`natif/styles/${f.chemin.split('/').pop()!}`, dansLePaquet(contenu, paquet));
  }

  const routes = routesDe(application);
  const ressources = new Map<string, string>();
  const icones = new Set<string>();
  const partages = new Map(application.partages.map((p) => [p.nom, `Partage.${nomKotlin(p.nom)}`]));
  const fonctions = new Set(application.fonctions.map((f) => f.nom));
  // Le CSS commun (facultatif), puis les feuilles « sur application », puis celles « sur android ».
  // Un style natif (.kt, .swift, .xaml) n'est pas du CSS : il n'est pas traduit.
  const feuilles = application.fichiersStyle.filter((f) => langueDuStyle(f.chemin) === 'css').flatMap((f) => {
    const css = options.fichiersStyle?.get(f.chemin);
    const portee: PorteeCss = f.plateforme === 'android' ? 'android' : f.plateforme === 'application' ? 'application' : 'commun';
    return css === undefined ? [] : [{ css, portee }];
  });
  const css = new CssAndroid([...application.css.map((c) => ({ css: c, portee: 'commun' as PorteeCss })), ...feuilles]);
  if (css.total > 0) {
    avertir(application.fichiersStyle[0]?.ligne ?? 1, `CSS : ${css.traduites} déclarations sur ${css.total} traduites en Compose (${Math.round((css.traduites * 100) / css.total)} %). Le reste est listé, avec sa raison, dans CSS-SUR-ANDROID.md.`);
    fichiers.set('CSS-SUR-ANDROID.md', css.rapport());
  }
  const app: ContexteAndroid = {
    css,
    paquet,
    pages: new Map(application.ecrans.map((e) => [e.nom, { parametres: e.parametresAdresse ?? [], filtres: e.filtres ?? [] }])),
    route: (page, parametres, filtres) => routeKotlin(routes.get(page)!, parametres, filtres),
    partages,
    partagesHorsLigne: new Set(application.partages.filter((p) => p.horsLigne).map((p) => p.nom)),
    fonctions,
    composants: new Map(application.composants.map((c) => [c.nom, c.parametres])),
    composantsReact: new Set(application.composantsReact.map((c) => c.nom)),
    ...(natifs.size ? { natifs } : {}),
    ...(stylesNatifs.size ? { stylesNatifs } : {}),
    erreur: (ligne, message) => {
      if (!diagnostics.some((d) => d.message === message)) diagnostics.push({ gravite: 'erreur', ligne, message });
    },
    cle: `humalis.${simplifier(options.nom) || 'application'}`,
    ressource(chemin) {
      const fichier = chemin.replace(/[^A-Za-z0-9._-]/g, '_');
      ressources.set(chemin, fichier);
      return fichier;
    },
    icones,
    refuser,
    avertir,
    ...(application.langues && application.langues.length > 1 ? { langues: application.langues.map((l) => l.code) } : {}),
    ...(application.theme && application.theme.largeur !== 'pleine' ? { largeur: { etroite: 576, normale: 768, large: 1152 }[application.theme.largeur] } : {}),
  };

  const simple = (e: Ecran) => !e.parametresAdresse?.length && e.parent === undefined;
  const entree = application.ecrans.find((e) => e.nom === 'accueil' && simple(e)) ?? application.ecrans.find((e) => simple(e) && e.nom !== 'introuvable') ?? application.ecrans.find(simple) ?? application.ecrans[0];
  if (!simple(entree)) refuser(entree.ligne, `la page d'entrée « ${entree.nom} » attend un paramètre`);

  // Les pages, les composants, l'en-tête et le pied.
  for (const ecran of application.ecrans) ecrireCode(`Page${nomApplication(simplifier(ecran.nom) || 'page')}.kt`, new GenerateurPage(ecran, app, undefined, `Page${nomApplication(simplifier(ecran.nom) || 'page')}`).generer());
  for (const c of application.composants) ecrireCode(`${nomComposant(c.nom)}.kt`, new GenerateurPage(c, app, c.parametres, nomComposant(c.nom)).generer());
  const disposition: { entete?: string; sansEntete: string[]; pied?: string; sansPied: string[] } = { sansEntete: [], sansPied: [] };
  for (const [genre, composant, d] of [['entete', 'EnteteSite', application.disposition?.entete], ['pied', 'PiedSite', application.disposition?.pied]] as const) {
    if (!d) continue;
    const racine = { type: 'bloc' as const, genre: 'bloc' as const, options: d.options, classes: d.classes, corps: d.ecran.vue, ligne: d.ecran.ligne };
    ecrireCode(`${composant}.kt`, new GenerateurPage({ ...d.ecran, nom: composant, vue: [racine] }, app, [], composant).generer());
    const sans = application.ecrans.filter((e) => (genre === 'entete' ? e.sansEntete : e.sansPied)).map((e) => routes.get(e.nom)!.motif);
    if (genre === 'entete') Object.assign(disposition, { entete: composant, sansEntete: sans });
    else Object.assign(disposition, { pied: composant, sansPied: sans });
  }

  // Les onglets en bas de l'écran.
  const onglets = (application.ongletsApplication ?? []).flatMap((o) => {
    const r = routes.get(o.page);
    if (!r || r.parametres.length > 0) {
      refuser(o.ligne, `l'onglet « ${o.titre} » vise la page « ${o.page} », qui n'existe pas ou attend un paramètre`);
      return [];
    }
    if (o.icone) icones.add(o.icone);
    return [{ titre: o.titre, route: r.motif, ...(o.icone ? { icone: o.icone } : {}) }];
  });

  // Les fonctions écrites en haut du fichier.
  if (application.fonctions.length > 0) {
    const e = new EcrivainKotlin();
    e.ligne('// Produit par Humalis : les fonctions écrites en haut du fichier.');
    e.ligne(`package ${paquet}`);
    e.ligne();
    for (const f of application.fonctions) {
      const portee: Portee = { variables: new Map([...partages, ...f.parametres.map((p) => [p.nom, nomKotlin(p.nom)] as [string, string])]), champs: new Map(), fonctions, etatsRequetes: new Set() };
      const valeurs = new Valeurs(portee, (quoi) => refuser(f.ligne, `${quoi} ne se traduit pas en Kotlin`));
      const actions = new EcrivainActions({
        valeurs,
        visibilite: () => '',
        texteChange: () => '',
        route: () => undefined,
        allerAncre: () => undefined,
        clesChamps: new Map(),
        refuser: (m) => refuser(f.ligne, `${m} dans une fonction`),
      });
      const corps = new EcrivainKotlin();
      corps.indenter(() => actions.ecrire(corps, f.corps, { fonction: true }));
      const texte = corps.texte();
      if (/\b(Serveur|Session|portee|nav|confirmer)\b/.test(texte)) refuser(f.ligne, `la fonction « ${f.nom} » appelle le serveur ou change de page ; une fonction calcule seulement une valeur`);
      e.ligne(`fun ${nomKotlin(f.nom)}(${f.parametres.map((p) => `${nomKotlin(p.nom)}: Any?`).join(', ')}): Any? {`);
      e.ligne(texte.trimEnd());
      if (f.corps.at(-1)?.type !== 'rendre') e.ligne('    return null');
      e.ligne('}');
      e.ligne();
    }
    ecrireCode('Fonctions.kt', e.texte().replace(/\n+$/, '\n'));
  }

  // Les variables partagées entre les pages.
  if (application.partages.length > 0) {
    const portee: Portee = { variables: new Map(), champs: new Map(), fonctions, etatsRequetes: new Set() };
    const valeurs = new Valeurs(portee, (quoi) => refuser(1, `${quoi} ne se traduit pas en Kotlin`));
    const e = new EcrivainKotlin();
    e.ligne('// Produit par Humalis : les variables partagées entre les pages.');
    e.ligne(`package ${paquet}`);
    e.ligne();
    e.ligne('import androidx.compose.runtime.getValue');
    e.ligne('import androidx.compose.runtime.mutableStateOf');
    e.ligne('import androidx.compose.runtime.setValue');
    e.ligne();
    e.bloc('object Partage {', () => {
      for (const p of application.partages) {
        const depart = valeurs.x(p.initiale);
        if (p.memorisee || p.secret || p.horsLigne) e.ligne(`var ${nomKotlin(p.nom)} by EtatMemorise(${chaineKotlin(`${app.cle}.${p.nom}`)}, ${depart}${p.secret ? ', secret = true' : ''})`);
        else e.ligne(`var ${nomKotlin(p.nom)} by mutableStateOf<Any?>(${depart})`);
      }
    });
    ecrireCode('Partage.kt', e.texte());
  }

  const serveur = adresseServeur(options.serveur ?? application.sources.find((s) => s.session)?.adresse ?? 'http://localhost:3000');
  const e = new EcrivainKotlin();
  e.ligne("// Produit par Humalis : l'adresse du serveur, choisie à la compilation (--serveur).");
  e.ligne(`package ${paquet}`);
  e.ligne();
  e.bloc('object Configuration {', () => e.ligne(`const val SERVEUR = ${chaineKotlin(serveur)}`));
  ecrireCode('Configuration.kt', e.texte());
  if (application.sources.length > 0) ecrireCode('Sources.kt', sourcesKotlin(paquet, application.sources, serveur));
  if (/^http:\/\//.test(serveur) && !/^http:\/\/(10\.0\.2\.2|localhost|127\.0\.0\.1)([:/]|$)/.test(serveur)) {
    avertir(1, `l'application Android ne peut pas appeler « ${serveur} » : le système bloque http://. Utilisez https://.`);
  }

  // « menu de l'application » : le menu « ⋮ » en haut de l'application, et les raccourcis d'un clavier branché.
  const commandes = application.ecrans.flatMap((x) => x.gestionnaires.filter((g) => g.declencheur === 'commandeMenu'));
  const menus: { menu: string; commandes: { titre: string; fonction: string; raccourci?: string }[] }[] = [];
  if (commandes.length > 0) {
    const portee: Portee = { variables: new Map(partages), champs: new Map(), fonctions, etatsRequetes: new Set(), horsLigne: new Set(application.partages.filter((p) => p.horsLigne).map((p) => p.nom)) };
    let ligne = commandes[0].ligne;
    const precision = ' : une commande de menu ne voit que les variables partagées';
    const valeurs = new Valeurs(portee, (quoi) => refuser(ligne, `${quoi}${precision}`));
    // Une commande peut ouvrir une page (sans paramètre : aucune page n'est ouverte pour les donner).
    const route = (page: string) => {
      const r = routes.get(page);
      return r ? routeKotlin(r, r.parametres.map(() => '""'), []) : undefined;
    };
    const actions = new EcrivainActions({ valeurs, visibilite: () => '', texteChange: () => '', route, allerAncre: () => undefined, clesChamps: new Map(), refuser: (m) => refuser(ligne, `${m}${precision}`) });
    const e = new EcrivainKotlin();
    e.ligne("// Produit par Humalis : les commandes des menus de l'application.");
    e.ligne(`package ${paquet}`);
    e.ligne();
    e.ligne('import android.net.Uri');
    e.ligne('import androidx.navigation.NavHostController');
    e.ligne();
    let n = 0;
    for (const g of commandes) {
      ligne = g.ligne;
      const corps = new EcrivainKotlin();
      corps.indenter(() => actions.ecrire(corps, g.actions));
      const texte = corps.texte();
      if (/\b(portee|relances|confirmer)\b/.test(texte)) refuser(g.ligne, 'une commande de menu ne peut pas lancer de minuterie ni de lecture « en direct », ni poser une question');
      const fonction = `commandeMenu${++n}`;
      e.ligne('@Suppress("UNUSED_PARAMETER")');
      e.ligne(`suspend fun ${fonction}(nav: NavHostController) {`);
      for (const l of texte.trimEnd().split('\n')) if (l.trim()) e.ligne(l.replace(/^ {4}/, '    '));
      e.ligne('}');
      e.ligne();
      let menu = menus.find((m) => m.menu === g.menu);
      if (!menu) menus.push((menu = { menu: g.menu ?? '', commandes: [] }));
      menu.commandes.push({ titre: g.titreCommande ?? '', fonction, ...(g.touches ? { raccourci: g.touches } : {}) });
    }
    e.bloc('fun menusDe(nav: NavHostController): List<MenuHumalis> = listOf(', () => {
      for (const m of menus) {
        e.ligne(`MenuHumalis(${chaineKotlin(m.menu)}, listOf(${m.commandes.map((c) => `CommandeHumalis(${chaineKotlin(c.titre)}, ${c.raccourci ? chaineKotlin(c.raccourci) : 'null'}) { ${c.fonction}(nav) }`).join(', ')})),`);
      }
    }, ')');
    ecrireCode('Commandes.kt', e.texte().replace(/\n+$/, '\n'));
    ecrireCode('Menus.kt', kotlin(paquet, MENUS_KT));
  }

  const avecApple = application.liensProfonds !== undefined && /\bseConnecterAvecApple\(/.test([...fichiers.values()].join('\n'));
  ecrireCode('MainActivity.kt', applicationKotlin(paquet, application, routes, entree, disposition, onglets, avecApple, menus.length > 0));
  if (application.formes?.erreurArrive) {
    ecrireCode('CaptureErreurs.kt', kotlin(paquet, captureErreursKotlin(requetesCapture(application.formes).requetes)));
    const cheminActivite = `${dossierCode}/MainActivity.kt`;
    fichiers.set(cheminActivite, fichiers.get(cheminActivite)!.replace('        setContent { ApplicationHumalis() }', '        CaptureErreurs.installer(applicationContext)\n        setContent { ApplicationHumalis() }'));
  }
  // Les polices livrées avec le projet (.ttf, .otf) : des ressources de l'application.
  const policesCopiees = new Set<string>();
  for (const p of application.theme?.polices ?? []) {
    if (!p.fichier || !/\.(ttf|otf)$/i.test(p.fichier) || !options.polices?.has(p.fichier)) continue;
    fichiers.set(`app/src/main/res/font/${nomRessource(p.fichier)}.${p.fichier.split('.').pop()!.toLowerCase()}`, contenuBinaire(options.polices.get(p.fichier)!));
    policesCopiees.add(p.fichier);
  }
  ecrireCode('Theme.kt', themeKotlin(paquet, application.theme, policesCopiees));
  ecrireCode('Valeurs.kt', kotlin(paquet, VALEURS_KT));
  ecrireCode('Formats.kt', kotlin(paquet, FORMATS_KT));
  ecrireCode('Interface.kt', kotlin(paquet, INTERFACE_KT));
  ecrireCode('Memoire.kt', kotlin(paquet, MEMOIRE_KT));
  ecrireCode('Serveur.kt', kotlin(paquet, SERVEUR_KT));
  ecrireCode('Icones.kt', iconesKotlin(paquet, icones));
  // Ce que les pages emploient, lu avant d'ajouter la bibliothèque qui le définit.
  const codePages = [...fichiers.values()].join('\n');
  ecrireCode('Systeme.kt', kotlin(paquet, SYSTEME_KT));
  ecrireCode('Fichiers.kt', kotlin(paquet, FICHIERS_KT));
  const besoins = {
    photo: /\bprendrePhoto\(/.test(codePages),
    position: /\blirePosition\(/.test(codePages),
    identite: /\bverifierIdentite\(/.test(codePages),
    scanner: /\bscannerCode\(/.test(codePages),
    vibration: /\bvibrer\(/.test(codePages),
    // Un fichier écrit par l'application (photo, bon, CSV) s'ouvre ailleurs par le fournisseur de fichiers.
    fichiers: /\b(prendrePhoto|telechargerBon|telechargerBonOuEchouer|telechargerCsv)\(/.test(codePages),
  };
  const avecAppareil = besoins.photo || besoins.position || besoins.identite || besoins.vibration || /\bSignatureHumalis\(/.test(codePages);
  if (avecAppareil) ecrireCode('Appareil.kt', kotlin(paquet, APPAREIL_KT));
  if (besoins.scanner) ecrireCode('Scanner.kt', kotlin(paquet, SCANNER_KT));
  const medias = {
    qr: /\bQrHumalis\(/.test(codePages),
    lecteurs: /\b(LecteurHumalis|VideoHumalis)\(/.test(codePages),
    cartes: /\bCarteHumalis\(/.test(codePages),
  };
  if (medias.qr) ecrireCode('Qr.kt', kotlin(paquet, QR_KT));
  if (medias.lecteurs) ecrireCode('Lecteurs.kt', kotlin(paquet, LECTEURS_KT));
  if (medias.cartes) ecrireCode('Cartes.kt', kotlin(paquet, CARTES_KT));
  ecrireCode('Graphiques.kt', kotlin(paquet, GRAPHIQUES_KT));
  ecrireCode('Mouvement.kt', kotlin(paquet, MOUVEMENT_KT));
  if (/\b(ActualiserHumalis|GlisserHumalis|OptionsHumalis|EtatVideHumalis)\(/.test(codePages)) ecrireCode('Natifs.kt', kotlin(paquet, NATIFS_KT));
  // « en arriere plan : » : une tâche que WorkManager lance, avec les seules variables partagées.
  const fonds = application.ecrans.flatMap((x) => x.gestionnaires.filter((g) => g.declencheur === 'arrierePlan'));
  const avecEnvois = /\bappel(Reussi)?OuGarder\(/.test(codePages);
  if (fonds.length > 0) {
    const portee: Portee = { variables: new Map(partages), champs: new Map(), fonctions, etatsRequetes: new Set(), horsLigne: new Set(application.partages.filter((p) => p.horsLigne).map((p) => p.nom)) };
    let ligne = fonds[0].ligne;
    const precision = ' : « en arriere plan » ne voit que les variables partagées';
    const valeurs = new Valeurs(portee, (quoi) => refuser(ligne, `${quoi}${precision}`));
    const actions = new EcrivainActions({ valeurs, visibilite: () => '', texteChange: () => '', route: () => undefined, allerAncre: () => undefined, clesChamps: new Map(), refuser: (m) => refuser(ligne, `${m}${precision}`) });
    const corps = new EcrivainKotlin();
    for (const g of fonds) {
      ligne = g.ligne;
      corps.indenter(() => actions.ecrire(corps, g.actions));
    }
    const texte = corps.texte();
    if (/\b(portee|relances|nav|confirmer)\b/.test(texte)) refuser(ligne, '« en arriere plan » : une minuterie, une lecture « en direct », une question ou un changement de page demandent une page ouverte');
    ecrireCode('ArrierePlan.kt', fondKotlin(paquet, texte, avecEnvois || /\bappel(Reussi)?OuGarder\(/.test(texte)));
  }
  const avecGardes = avecEnvois || [...fichiers.values()].some((f) => /\bappel(Reussi)?OuGarder\(/.test(f));
  if (avecGardes) ecrireCode('Envois.kt', kotlin(paquet, ENVOIS_KT));
  if (/\becouterDirect\(/.test(codePages)) ecrireCode('Direct.kt', kotlin(paquet, DIRECT_KT));
  // L'activité démarre les envois gardés et planifie la tâche d'arrière-plan.
  const activite = `${dossierCode}/MainActivity.kt`;
  fichiers.set(activite, fichiers.get(activite)!.replace('        setContent { ApplicationHumalis() }', `${avecGardes ? '        EnvoisGardes.demarrer()\n' : ''}${fonds.length ? '        ArrierePlan.planifier(applicationContext)\n' : ''}        setContent { ApplicationHumalis() }`));
  // Les formes d'application spéciales : widgets, tuiles, partage, clavier, activités, voiture…
  const formes = ecrireFormes({
    application,
    paquet,
    partages,
    fonctions,
    route: (page, parametres = []) => {
      const r = routes.get(page);
      return r ? routeKotlin(r, r.parametres.map((_, i) => parametres[i] ?? '""'), []) : undefined;
    },
    parametresDe: (page) => routes.get(page)?.parametres ?? [],
    refuser,
    avertir,
    ecrireCode,
    ecrireFichier: (chemin, contenu) => fichiers.set(chemin, contenu),
    code: [...fichiers.values()].join('\n'),
  });
  if (formes.actif) {
    // L'activité transmet ce qu'elle reçoit (raccourci, partage, fichier, commande vocale) ; la première page prête le fait.
    let code = fichiers.get(activite)!;
    code = code.replace('        setContent { ApplicationHumalis() }', '        if (savedInstanceState == null) FormesHumalis.recevoir(applicationContext, intent)\n        setContent { ApplicationHumalis() }');
    if (code.includes('        super.onNewIntent(intent)\n')) code = code.replace('        super.onNewIntent(intent)\n', '        super.onNewIntent(intent)\n        FormesHumalis.recevoir(applicationContext, intent)\n');
    else code = code.replace('    override fun onDestroy() {', '    override fun onNewIntent(intent: Intent) {\n        super.onNewIntent(intent)\n        FormesHumalis.recevoir(applicationContext, intent)\n    }\n\n    override fun onDestroy() {');
    code = code.replace('    override fun onDestroy() {', '    /** En passant à l\'arrière-plan : les widgets et la recherche du téléphone reprennent les dernières valeurs. */\n    override fun onStop() {\n        super.onStop()\n        FormesHumalis.quitter(applicationContext)\n    }\n\n    override fun onDestroy() {');
    code = code.replace('        val actuelle = nav.currentBackStackEntryAsState().value?.destination?.route\n', '        val actuelle = nav.currentBackStackEntryAsState().value?.destination?.route\n        LaunchedEffect(FormesHumalis.enAttente) { FormesHumalis.enAttente?.let { FormesHumalis.enAttente = null; it(nav) } }\n');
    fichiers.set(activite, code);
  }
  // « activer notifications » : Firebase Cloud Messaging, avec les identifiants donnés par --firebase.
  const avecNotifications = /\bactiverNotifications\(/.test(codePages) || formes.notifications;
  if (formes.notifications && !/\bactiverNotifications\(/.test(codePages)) avertir(1, "les boutons des notifications et l'activité mise à jour par le serveur arrivent par Firebase : écrivez « activer notifications » dans une page, sinon cet appareil ne les reçoit pas.");
  if (avecNotifications) {
    ecrireCode('Notifications.kt', notificationsKotlin(paquet, options.firebase, formes.donnees));
    fichiers.set(activite, fichiers.get(activite)!.replace('        setContent { ApplicationHumalis() }', '        NotificationsHumalis.configurer(applicationContext)\n        setContent { ApplicationHumalis() }'));
    if (!options.firebase) avertir(1, "« activer notifications » : sans --firebase, l'application demande la permission mais ne peut pas recevoir de notification. Compilez avec --firebase google-services.json (téléchargé depuis la console Firebase), et réglez HUMALIS_FCM_COMPTE sur le serveur.");
  }
  const connexions = { google: /\bseConnecterAvecGoogle\(/.test(codePages), apple: /\bseConnecterAvecApple\(/.test(codePages) };
  if (connexions.google) {
    ecrireCode('ConnexionGoogle.kt', kotlin(paquet, GOOGLE_KT));
    avertir(1, `« se connecter avec google » sur Android : créez aussi, dans la Google Cloud Console, un ID client de type « Android » pour ${identifiant} (avec l'empreinte SHA-1 du certificat). Le serveur garde l'ID client Web dans GOOGLE_CLIENT_ID.`);
  }
  if (connexions.apple) {
    if (!application.liensProfonds) refuser(1, '« se connecter avec apple » sur Android demande « liens profonds "…" » en haut du fichier : Apple renvoie la personne dans l\'application par ce lien');
    else {
      ecrireCode('ConnexionApple.kt', kotlin(paquet, APPLE_KT));
      avertir(application.liensProfonds.ligne, `« se connecter avec apple » sur Android : réglez APPLE_RETOUR_ANDROID=${application.liensProfonds.schema}://connexion-apple sur le serveur, et ajoutez ${serveurPublic(options.serveur)}/auth/apple/retour aux adresses de retour de l'identifiant de services (APPLE_SERVICE_ID) chez Apple.`);
    }
  }
  if (app.langues) {
    const codes = app.langues;
    ecrireCode('Langues.kt', kotlin(paquet, LANGUES_KT).replace('LANGUES_DU_SITE', `listOf(${application.langues!.map((l) => `${chaineKotlin(l.code)} to ${chaineKotlin(l.nom)}`).join(', ')})`));
    // Les messages de Humalis écrits dans la bibliothèque passent par t(), dans chaque langue du site.
    const messages = MESSAGES.map((m) => ({ fr: m.fr, versions: Object.fromEntries(codes.map((c) => [c, versionDe(m, c)])) }));
    for (const fichier of ['Interface.kt', 'Serveur.kt', 'MainActivity.kt']) {
      const chemin = `${dossierCode}/${fichier}`;
      fichiers.set(chemin, traduireMessagesKotlin(fichiers.get(chemin)!, codes, messages));
    }
  }

  // Les images : recopiées dans assets/, sous un nom plat.
  for (const [chemin, info] of options.medias ?? []) {
    const copie = nomDeLaCopie(chemin);
    const fichier = ressources.get(copie) ?? ressources.get(chemin);
    if (fichier && info.contenu !== undefined) fichiers.set(`app/src/main/assets/${fichier}`, contenuBinaire(info.contenu));
  }

  // Gradle, le manifeste et les ressources.
  const nomAffiche = application.site?.nom ?? options.nom;
  // La montre et la télévision : un module chacune, à côté de l'application du téléphone.
  const modules: string[] = [];
  if (!options.appareil) {
    for (const appareil of ['montre', 'tele'] as const) {
      if (!complete.ecrans.some((x) => x.appareil === appareil)) continue;
      const m = moduleAppareil(complete, options, appareil, identifiant);
      for (const [chemin, contenu] of m.fichiers) fichiers.set(chemin, contenu);
      for (const d of m.diagnostics) if (!diagnostics.some((x) => x.message === d.message)) diagnostics.push(d);
      modules.push(appareil);
    }
  }
  fichiers.set('settings.gradle.kts', reglagesGradle(nom).replace('include(":app")', ['app', ...modules].map((m) => `include(":${m}")`).join('\n')));
  fichiers.set('build.gradle.kts', CONSTRUCTION_RACINE);
  fichiers.set('gradle.properties', PROPRIETES_GRADLE);
  fichiers.set('gradle/wrapper/gradle-wrapper.properties', ENVELOPPE_GRADLE);
  fichiers.set('app/build.gradle.kts', constructionApp(identifiant, nomAffiche, { appareil: avecAppareil, scanner: besoins.scanner, ...medias, ...connexions, travail: fonds.length > 0, notifications: avecNotifications, ...(application.paquetsAndroid?.length ? { paquets: application.paquetsAndroid } : {}), formes: formes.dependances }));
  fichiers.set('app/src/main/AndroidManifest.xml', manifeste(true, application.liensProfonds, { ...besoins, notifications: avecNotifications }, formes));
  if (besoins.fichiers) fichiers.set('app/src/main/res/xml/chemins_fichiers.xml', CHEMINS_FICHIERS);
  const domaine = application.liensProfonds?.domaine;
  if (domaine && options.empreinte) {
    fichiers.set('a-publier-sur-le-site/.well-known/assetlinks.json', liensDuSite(identifiant, options.empreinte));
    avertir(application.liensProfonds!.ligne, `« domaine "${domaine}" » : publiez a-publier-sur-le-site/.well-known/assetlinks.json sur ${domaine.split('/')[0]} pour que les liens https:// ouvrent l'application.`);
  } else if (domaine) {
    avertir(application.liensProfonds!.ligne, `« domaine "${domaine}" » : sans --empreinte, Android ne peut pas vérifier que le site confie ses liens https:// à l'application ; il les propose dans une liste. Compilez avec --empreinte (l'empreinte SHA-256 du certificat, donnée par « keytool -list -v »).`);
  }
  fichiers.set('app/src/main/res/values/themes.xml', THEME_XML);
  fichiers.set('app/src/main/res/xml/network_security_config.xml', SECURITE_RESEAU);
  const logo = application.site?.logo;
  const octetsLogo = logo && /\.png$/i.test(logo) ? options.images?.get(logo) : undefined;
  if (octetsLogo !== undefined) fichiers.set('app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', contenuBinaire(octetsLogo));
  else {
    const marque = application.theme?.couleurs.find((c) => c.nom === 'marque')?.clair ?? '#1f5fbf';
    fichiers.set('app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', iconeAdaptative());
    fichiers.set('app/src/main/res/values/ic_launcher_background.xml', couleurIcone(marque));
    fichiers.set('app/src/main/res/drawable/ic_launcher_foreground.xml', AVANT_PLAN_ICONE);
  }
  fichiers.set('.gitignore', IGNORES_GIT);
  fichiers.set(MARQUE_ANDROID, `Projet produit par Humalis depuis ${options.source}.\nLe compilateur réécrit ce dossier à chaque compilation.\n`);
  fichiers.set('LISEZMOI.md', lisezmoi(nom, identifiant, serveur) + lisezmoiFormes(application) + (modules.length ? `\n## La montre et la télévision\n\n${modules.map((m) => (m === 'montre' ? '- `montre/` : l\'application Wear OS (Compose for Wear OS), pour Wear OS 3 et plus.' : '- `tele/` : l\'application Android TV (Compose for TV), menée à la télécommande.')).join('\n')}\n\n\`gradle assembleDebug\` construit les ${modules.length + 1} applications ; chacune s'installe sur son appareil.\n` : ''));
  return { fichiers, diagnostics };
}
