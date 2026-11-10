/**
 * La cible Android : un programme Humalis devient un projet Android natif,
 * en Kotlin et Jetpack Compose, construit par Gradle. Comme la cible Apple
 * écrit du SwiftUI, celle-ci écrit du Kotlin lisible, sans navigateur embarqué
 * ni JavaScript.
 */
import type { Diagnostic } from '../../analyse/erreurs.js';
import { simplifier } from '../../analyse/elements.js';
import { nomDeLaCopie, type InfoMedia } from '../../ri/medias.js';
import type { Application, Ecran, SourceRI, ThemeRI } from '../../ri/types.js';
import { contenuBinaire } from '../binaire.js';
import { cheminsDesPages } from '../web/projet.js';
import { COULEURS_CSS } from '../web/styles.js';
import { EcrivainActions } from './actions.js';
import { CssAndroid, type Portee as PorteeCss } from './css.js';
import { FORMATS_KT, INTERFACE_KT, MEMOIRE_KT, SERVEUR_KT, VALEURS_KT, kotlin } from './bibliotheque.js';
import { EcrivainKotlin } from './ecrivain.js';
import { AVANT_PLAN_ICONE, CONSTRUCTION_RACINE, ENVELOPPE_GRADLE, IGNORES_GIT, PROPRIETES_GRADLE, SECURITE_RESEAU, THEME_XML, VERSIONS, constructionApp, couleurIcone, iconeAdaptative, manifeste, reglagesGradle } from './gradle.js';
import { iconesKotlin } from './icones.js';
import { chaineKotlin, identifiantAndroid, nomApplication, nomComposant, nomKotlin, nomRoute } from './noms.js';
import { GenerateurPage, type ContexteAndroid } from './page.js';
import { Valeurs, type Portee } from './valeurs.js';

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
  /** Le contenu des fichiers CSS du projet (« utiliser style "…" », avec ou sans « sur android »). */
  fichiersStyle?: Map<string, string>;
}

const PAS_ENCORE = "cela n'est pas encore disponible sur la cible Android";

/** Ce qui n'a pas encore d'équivalent ici : la compilation le dit au lieu de produire quelque chose de faux. */
function verifier(application: Application): Diagnostic[] {
  const d: Diagnostic[] = [];
  const avertir = (ligne: number, message: string) => d.push({ gravite: 'avertissement', ligne, message });
  const refuser = (ligne: number, message: string) => d.push({ gravite: 'erreur', ligne, message: `${message} : ${PAS_ENCORE}.` });
  if (application.langues) refuser(1, '« langues : » (plusieurs langues)');
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
    if (utilises.has(c.nom)) refuser(c.ligne, `le composant React « ${c.nom} » (Android n'exécute pas de JavaScript)`);
  }
  for (const e of application.ecrans) {
    if (e.parent !== undefined) refuser(e.ligne, `« page "${e.nom}" dans "${e.parent}" » (les sous-pages)`);
    if (e.dessin) avertir(e.ligne, `« dessinee pour » est sans effet sur Android : la page « ${e.nom} » suit les styles nommés.`);
  }
  for (const s of application.sources) if (s.passerelle) refuser(1, `la source « ${s.nom} » à jeton secret (la passerelle du serveur)`);
  for (const p of application.theme?.polices ?? []) {
    if (p.fichier) avertir(1, `la police « ${p.nom} » n'est pas encore chargée sur Android : la police du système est utilisée à la place.`);
  }
  if (application.barreLaterale) avertir(1, "« avec barre laterale » est sans effet sur Android.");
  const logo = application.site?.logo;
  if (logo && !/\.png$/i.test(logo)) avertir(application.site!.ligne, `le logo « ${logo} » ne peut pas servir d'icône sur Android, qui demande un PNG carré : l'application garde l'icône par défaut.`);
  return d;
}

// ─── Les fichiers partagés ─────────────────────────────────────────────────

const hex = (c: string) => `0xFF${c.slice(1, 7).toUpperCase()}`;

function themeKotlin(paquet: string, theme: ThemeRI | undefined): string {
  const couleurs = new Map(Object.entries(COULEURS_CSS));
  for (const c of theme?.couleurs ?? []) couleurs.set(c.nom, { clair: c.clair, sombre: c.sombre, encreClair: c.encreClair, encreSombre: c.encreSombre });
  const marque = theme?.couleurs.find((c) => c.nom === 'marque') ?? { clair: '#1f5fbf', sombre: '#7fb0ff', encreClair: '#ffffff', encreSombre: '#141416' };
  const e = new EcrivainKotlin();
  e.ligne('// Produit par Humalis : les couleurs, en clair et en sombre, et le thème de l\'application.');
  e.ligne(`package ${paquet}`);
  e.ligne();
  for (const i of ['androidx.compose.foundation.isSystemInDarkTheme', 'androidx.compose.material3.MaterialTheme', 'androidx.compose.material3.darkColorScheme', 'androidx.compose.material3.lightColorScheme', 'androidx.compose.runtime.Composable', 'androidx.compose.runtime.getValue', 'androidx.compose.runtime.setValue', 'androidx.compose.ui.graphics.Color']) e.ligne(`import ${i}`);
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
  e.ligne('@Composable');
  e.bloc('fun ThemeHumalis(contenu: @Composable () -> Unit) {', () => {
    e.ligne('val sombre = Apparence.sombre()');
    e.ligne('val schema = if (sombre) darkColorScheme(primary = Couleurs.accent.lue(), onPrimary = Couleurs.encreAccent.lue()) else lightColorScheme(primary = Couleurs.accent.lue(), onPrimary = Couleurs.encreAccent.lue())');
    e.ligne('MaterialTheme(colorScheme = schema, content = contenu)');
  });
  return e.texte();
}

function sourcesKotlin(paquet: string, sources: SourceRI[]): string {
  const e = new EcrivainKotlin();
  e.ligne("// Produit par Humalis : les API que les pages appellent. Un jeton public part avec l'application ; un secret n'est jamais écrit ici.");
  e.ligne(`package ${paquet}`);
  e.ligne();
  e.bloc('object Sources {', () => {
    for (const s of sources) {
      const champs = [
        `nom = ${chaineKotlin(s.nom)}`,
        `adresse = ${chaineKotlin(s.adresse)}`,
        ...(s.entetes.length ? [`entetes = listOf(${s.entetes.map((h) => `${chaineKotlin(h.nom)} to ${chaineKotlin(h.valeur)}`).join(', ')})`] : []),
        ...(s.jetonPublic
          ? [`jeton = ${chaineKotlin(s.jetonPublic.valeur)}`, `placeJeton = ${chaineKotlin(s.jetonPublic.place.genre)}`, ...(s.jetonPublic.place.genre !== 'autorisation' ? [`nomJeton = ${chaineKotlin(s.jetonPublic.place.nom)}`] : [])]
          : []),
        ...(s.enveloppe !== undefined ? [`enveloppe = ${chaineKotlin(s.enveloppe)}`] : []),
        ...(s.erreurDans !== undefined ? [`erreurDans = ${chaineKotlin(s.erreurDans)}`] : []),
        ...(s.session ? ['session = true'] : []),
        `essais = ${s.essais ?? 2}`,
        `delai = ${(s.delai ?? 10) * 1000}`,
      ];
      e.ligne(`val ${nomKotlin(s.nom)} = SourceHumalis(${champs.join(', ')})`);
    }
  });
  return e.texte();
}

/** L'adresse du serveur vue depuis l'émulateur : « localhost » y désigne le téléphone, l'ordinateur est 10.0.2.2. */
export function adresseServeur(adresse: string): string {
  return adresse.replace(/^http:\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/i, 'http://10.0.2.2').replace(/\/+$/, '');
}

const ROUTES_KT = String.raw`
/** Où revenir après la connexion : la page réservée qui a renvoyé vers « sinon ». */
object Routes {
    var apresConnexion: String? = null
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

function applicationKotlin(paquet: string, application: Application, routes: Map<string, RouteAndroid>, entree: Ecran, disposition: { entete?: string; sansEntete: string[]; pied?: string; sansPied: string[] }, onglets: { titre: string; route: string; icone?: string }[]): string {
  const e = new EcrivainKotlin();
  e.ligne("// Produit par Humalis : l'application, ses pages et leur navigation.");
  e.ligne(`package ${paquet}`);
  e.ligne();
  for (const i of [
    'android.net.Uri',
    'android.os.Bundle',
    'androidx.activity.ComponentActivity',
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
    'kotlinx.coroutines.launch',
  ]) e.ligne(`import ${i}`);
  e.ligne();
  e.bloc('class MainActivity : ComponentActivity() {', () => {
    e.bloc('override fun onCreate(savedInstanceState: Bundle?) {', () => {
      e.ligne('super.onCreate(savedInstanceState)');
      e.ligne('Appli.contexte = applicationContext');
      e.ligne('enableEdgeToEdge()');
      e.ligne('setContent { ApplicationHumalis() }');
    });
  });
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
        e.bloc('Box(Modifier.fillMaxSize().padding(marges).consumeWindowInsets(marges).imePadding()) {', () => {
          e.bloc('Column(Modifier.fillMaxSize()) {', () => {
            if (disposition.entete) e.ligne(`if (actuelle !in listOf<String?>(${disposition.sansEntete.map((r) => chaineKotlin(r)).join(', ')})) ${disposition.entete}(nav)`);
            e.bloc(`NavHost(nav, startDestination = ${chaineKotlin(routes.get(entree.nom)!.motif)}, modifier = Modifier.weight(1f)) {`, () => {
              for (const [, r] of routes) {
                const args = r.filtres.length ? `, arguments = listOf(${r.filtres.map((f) => `navArgument(${chaineKotlin(f)}) { type = NavType.StringType; defaultValue = "" }`).join(', ')})` : '';
                const lus = [...r.parametres.map((p) => `${p} = e.arguments?.getString(${chaineKotlin(p)}) ?: ""`), ...r.filtres.map((f) => `${f}Lu = e.arguments?.getString(${chaineKotlin(f)}) ?: ""`)];
                const appel = `Page${nomApplication(simplifier(r.ecran.nom) || 'page')}(${['nav', ...lus].join(', ')})`;
                const reservee = r.ecran.reservee;
                const sinon = reservee ? routes.get(reservee.sinon) : undefined;
                e.bloc(`composable(${chaineKotlin(r.motif)}${args}) { e ->`, () => {
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

export function genererProjetAndroid(application: Application, options: OptionsAndroid): { fichiers: Map<string, string>; diagnostics: Diagnostic[] } {
  const diagnostics = verifier(application);
  const refuser = (ligne: number, message: string) => {
    const texte = `${message.replace(/\.$/, '')} : ${PAS_ENCORE}.`;
    if (!diagnostics.some((d) => d.message === texte)) diagnostics.push({ gravite: 'erreur', ligne, message: texte });
  };
  const avertir = (ligne: number, message: string) => {
    if (!diagnostics.some((d) => d.message === message)) diagnostics.push({ gravite: 'avertissement', ligne, message });
  };

  const nom = nomApplication(options.nom);
  const identifiant = identifiantAndroid(options.identifiant ?? `local.humalis.${simplifier(options.nom) || 'application'}`);
  const paquet = identifiant;
  const dossierCode = `app/src/main/java/${paquet.replace(/\./g, '/')}`;
  const fichiers = new Map<string, string>();
  const ecrireCode = (fichier: string, contenu: string) => fichiers.set(`${dossierCode}/${fichier}`, contenu);

  const routes = routesDe(application);
  const ressources = new Map<string, string>();
  const icones = new Set<string>();
  const partages = new Map(application.partages.map((p) => [p.nom, `Partage.${nomKotlin(p.nom)}`]));
  const fonctions = new Set(application.fonctions.map((f) => f.nom));
  // Le CSS commun (facultatif), puis les feuilles « sur application », puis celles « sur android ».
  const feuilles = application.fichiersStyle.flatMap((f) => {
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
    fonctions,
    composants: new Map(application.composants.map((c) => [c.nom, c.parametres])),
    composantsReact: new Set(application.composantsReact.map((c) => c.nom)),
    cle: `humalis.${simplifier(options.nom) || 'application'}`,
    ressource(chemin) {
      const fichier = chemin.replace(/[^A-Za-z0-9._-]/g, '_');
      ressources.set(chemin, fichier);
      return fichier;
    },
    icones,
    refuser,
    avertir,
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
        if (p.memorisee || p.secret) e.ligne(`var ${nomKotlin(p.nom)} by EtatMemorise(${chaineKotlin(`${app.cle}.${p.nom}`)}, ${depart}${p.secret ? ', secret = true' : ''})`);
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
  if (application.sources.length > 0) ecrireCode('Sources.kt', sourcesKotlin(paquet, application.sources));
  if (/^http:\/\//.test(serveur) && !/^http:\/\/(10\.0\.2\.2|localhost|127\.0\.0\.1)([:/]|$)/.test(serveur)) {
    avertir(1, `l'application Android ne peut pas appeler « ${serveur} » : le système bloque http://. Utilisez https://.`);
  }

  ecrireCode('MainActivity.kt', applicationKotlin(paquet, application, routes, entree, disposition, onglets));
  ecrireCode('Theme.kt', themeKotlin(paquet, application.theme));
  ecrireCode('Valeurs.kt', kotlin(paquet, VALEURS_KT));
  ecrireCode('Formats.kt', kotlin(paquet, FORMATS_KT));
  ecrireCode('Interface.kt', kotlin(paquet, INTERFACE_KT));
  ecrireCode('Memoire.kt', kotlin(paquet, MEMOIRE_KT));
  ecrireCode('Serveur.kt', kotlin(paquet, SERVEUR_KT));
  ecrireCode('Icones.kt', iconesKotlin(paquet, icones));

  // Les images : recopiées dans assets/, sous un nom plat.
  for (const [chemin, info] of options.medias ?? []) {
    const copie = nomDeLaCopie(chemin);
    const fichier = ressources.get(copie) ?? ressources.get(chemin);
    if (fichier && info.contenu !== undefined) fichiers.set(`app/src/main/assets/${fichier}`, contenuBinaire(info.contenu));
  }

  // Gradle, le manifeste et les ressources.
  const nomAffiche = application.site?.nom ?? options.nom;
  fichiers.set('settings.gradle.kts', reglagesGradle(nom));
  fichiers.set('build.gradle.kts', CONSTRUCTION_RACINE);
  fichiers.set('gradle.properties', PROPRIETES_GRADLE);
  fichiers.set('gradle/wrapper/gradle-wrapper.properties', ENVELOPPE_GRADLE);
  fichiers.set('app/build.gradle.kts', constructionApp(identifiant, nomAffiche));
  fichiers.set('app/src/main/AndroidManifest.xml', manifeste(true));
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
  fichiers.set('LISEZMOI.md', lisezmoi(nom, identifiant, serveur));
  return { fichiers, diagnostics };
}
