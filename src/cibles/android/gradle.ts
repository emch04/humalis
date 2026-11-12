/**
 * Les fichiers de construction du projet Android : Gradle, le manifeste et
 * les ressources. Les versions sont épinglées : une construction donne
 * toujours la même application.
 */

/** Android 8.0 au minimum (java.time sans bibliothèque en plus), compilé pour Android 16. */
export const VERSIONS = {
  gradle: '9.3.1',
  pluginAndroid: '9.1.1',
  kotlin: '2.3.21',
  composeBom: '2026.06.01',
  activite: '1.12.4',
  navigation: '2.9.7',
  fragment: '1.8.9',
  biometrie: '1.1.0',
  zxing: '4.3.0',
  zxingCore: '3.5.3',
  media3: '1.8.0',
  osmdroid: '6.1.20',
  identifiants: '1.5.0',
  googleid: '1.1.1',
  navigateur: '1.9.0',
  travail: '2.10.5',
  firebase: '24.1.2',
  sdkMinimum: 26,
  sdkCible: 36,
} as const;

export function reglagesGradle(nom: string): string {
  return `// Produit par Humalis.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "${nom}"
include(":app")
`;
}

export const CONSTRUCTION_RACINE = `// Produit par Humalis.
plugins {
    id("com.android.application") version "${VERSIONS.pluginAndroid}" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "${VERSIONS.kotlin}" apply false
}
`;

export const PROPRIETES_GRADLE = `# Produit par Humalis.
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
`;

export const ENVELOPPE_GRADLE = `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-${VERSIONS.gradle}-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;

export function constructionApp(identifiant: string, nomAffiche: string, avec: { appareil?: boolean; scanner?: boolean; qr?: boolean; lecteurs?: boolean; cartes?: boolean; google?: boolean; apple?: boolean; travail?: boolean; notifications?: boolean; paquets?: { nom: string; version: string }[]; formes?: string[] } = {}): string {
  const travail = `implementation("androidx.work:work-runtime-ktx:${VERSIONS.travail}")`;
  const formes = (avec.formes ?? []).filter((d) => !(avec.travail && d.startsWith('implementation("androidx.work:')));
  return `// Produit par Humalis.
${IMPORTS_STRATE}
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "${identifiant}"
    compileSdk = ${VERSIONS.sdkCible}

    defaultConfig {
        applicationId = "${identifiant}"
        minSdk = ${VERSIONS.sdkMinimum}
        targetSdk = ${VERSIONS.sdkCible}
        versionCode = 1
        versionName = "1.0"
        resValue("string", "app_name", "${nomAffiche.replace(/["\\$]/g, '')}")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        compose = true
        resValues = true
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:${VERSIONS.composeBom}"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.activity:activity-compose:${VERSIONS.activite}")
    implementation("androidx.navigation:navigation-compose:${VERSIONS.navigation}")
    implementation("androidx.fragment:fragment-ktx:${VERSIONS.fragment}")
${avec.appareil ? `    implementation("androidx.biometric:biometric:${VERSIONS.biometrie}")
` : ''}${avec.scanner ? `    implementation("com.journeyapps:zxing-android-embedded:${VERSIONS.zxing}")
` : ''}${avec.qr && !avec.scanner ? `    implementation("com.google.zxing:core:${VERSIONS.zxingCore}")
` : ''}${avec.lecteurs ? `    implementation("androidx.media3:media3-exoplayer:${VERSIONS.media3}")
    implementation("androidx.media3:media3-ui:${VERSIONS.media3}")
` : ''}${avec.cartes ? `    implementation("org.osmdroid:osmdroid-android:${VERSIONS.osmdroid}")
` : ''}${avec.google ? `    implementation("androidx.credentials:credentials:${VERSIONS.identifiants}")
    implementation("androidx.credentials:credentials-play-services-auth:${VERSIONS.identifiants}")
    implementation("com.google.android.libraries.identity.googleid:googleid:${VERSIONS.googleid}")
` : ''}${avec.apple ? `    implementation("androidx.browser:browser:${VERSIONS.navigateur}")
` : ''}${avec.travail ? `    ${travail}
` : ''}${avec.notifications ? `    implementation("com.google.firebase:firebase-messaging:${VERSIONS.firebase}")
` : ''}${formes.length ? `    // Les formes de l'application (widget, recherche, voiture…).\n${formes.map((d) => `    ${d}\n`).join('')}` : ''}${(avec.paquets ?? []).map((p) => `    // « paquet android » : pour les vues et les styles écrits à la main.\n    implementation(${JSON.stringify(`${p.nom}:${p.version}`)})\n`).join('')}    debugImplementation("androidx.compose.ui:ui-tooling")
}
${STRATE_HUMALIS}`;
}

export function manifeste(reseau: boolean, liens?: { schema: string; domaine?: string }, besoins: { photo?: boolean; position?: boolean; vibration?: boolean; fichiers?: boolean; notifications?: boolean; micro?: boolean; camera?: boolean; ecranCapture?: boolean; audio?: boolean } = {}, formes?: { activite: string; application: string; permissions: string[] }): string {
  const permissions = [...new Set([
    ...(reseau ? ['android.permission.INTERNET'] : []),
    ...(besoins.vibration ? ['android.permission.VIBRATE'] : []),
    ...(besoins.position ? ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'] : []),
    ...(besoins.notifications ? ['android.permission.POST_NOTIFICATIONS'] : []),
    ...(besoins.micro ? ['android.permission.RECORD_AUDIO'] : []),
    ...(besoins.camera ? ['android.permission.CAMERA'] : []),
    // Les réunions : la sortie du son (haut-parleur, écouteurs) se règle pendant l'appel.
    ...(besoins.audio ? ['android.permission.MODIFY_AUDIO_SETTINGS'] : []),
    ...(formes?.permissions ?? []),
  ])];
  const service = besoins.notifications
    ? `
        <service android:name=".ServiceNotificationsHumalis" android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>`
    : '';
  const fournisseur = besoins.fichiers
    ? `
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.fichiers"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/chemins_fichiers" />
        </provider>`
    : '';
  const hote = liens?.domaine?.split('/')[0];
  const debut = liens?.domaine?.split('/').slice(1).filter(Boolean).join('/');
  const profonds = liens
    ? `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${liens.schema}" />
            </intent-filter>${
              hote
                ? `
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="${hote}"${debut ? ` android:pathPrefix="/${debut}"` : ''} />
            </intent-filter>`
                : ''
            }`
    : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis. -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
${permissions.map((p) => `    <uses-permission android:name="${p}" />\n`).join('')}${besoins.photo || besoins.camera ? '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n' : ''}${besoins.micro ? '    <uses-feature android:name="android.hardware.microphone" android:required="false" />\n' : ''}
    <application
        android:allowBackup="true"
        android:fullBackupContent="@xml/sauvegarde"
        android:dataExtractionRules="@xml/extraction_donnees"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:networkSecurityConfig="@xml/network_security_config"
        android:theme="@style/Theme.Humalis">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>${profonds}${formes?.activite ?? ''}
        </activity>${besoins.ecranCapture ? `
        <activity
            android:name=".EcranCaptureHumalis"
            android:exported="false"
            android:screenOrientation="locked" />` : ''}${fournisseur}${service}${formes?.application ?? ''}
    </application>
</manifest>
`;
}

/** Le thème de la fenêtre avant que Compose ne dessine : sans barre de titre, clair ou sombre comme le système. */
export const THEME_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis. -->
<resources>
    <style name="Theme.Humalis" parent="android:Theme.Material.Light.NoActionBar" />
</resources>
`;

/** http:// n'est permis que vers l'ordinateur de développement (10.0.2.2 depuis l'émulateur) : tout le reste passe en https. */
/**
 * Ce que la sauvegarde du téléphone n'emporte pas : le coffre. Ses valeurs sont chiffrées par une clé de
 * l'Android Keystore, qui ne quitte jamais l'appareil : restaurées sur un autre téléphone, elles seraient
 * illisibles, et la session d'un téléphone ne doit pas se retrouver sur un autre. Android 11 et avant.
 */
export const SAUVEGARDE = `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis. -->
<full-backup-content>
    <exclude domain="sharedpref" path="humalis.coffre.xml" />
</full-backup-content>
`;

/** La même règle pour Android 12 et après : la sauvegarde dans le nuage et le transfert d'un téléphone à l'autre. */
export const EXTRACTION_DONNEES = `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis. -->
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="sharedpref" path="humalis.coffre.xml" />
    </cloud-backup>
    <device-transfer>
        <exclude domain="sharedpref" path="humalis.coffre.xml" />
    </device-transfer>
</data-extraction-rules>
`;

export const SECURITE_RESEAU = `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">10.0.2.2</domain>
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
    </domain-config>
</network-security-config>
`;

/** L'icône par défaut : un fond de la couleur de la marque et un « H ». */
export function iconeAdaptative(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`;
}

export function couleurIcone(marque: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis. -->
<resources>
    <color name="ic_launcher_background">${marque}</color>
</resources>
`;
}

export const AVANT_PLAN_ICONE = `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis : un « H » blanc au centre de l'icône. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M40,34h7v17h14v-17h7v40h-7v-17h-14v17h-7z" />
</vector>
`;

export const IGNORES_GIT = `# Produit par Humalis.
.gradle/
build/
app/build/
local.properties
.idea/
*.iml
`;

/** Le nom de la table que lit l'étape de la strate Humalis (dans le dossier du module « app »). */
export const TABLE_DEBOGUEUR = 'humalis-lignes.txt';

const IMPORTS_STRATE = `import com.android.build.api.instrumentation.AsmClassVisitorFactory
import com.android.build.api.instrumentation.ClassContext
import com.android.build.api.instrumentation.ClassData
import com.android.build.api.instrumentation.InstrumentationParameters
import com.android.build.api.instrumentation.InstrumentationScope
import org.objectweb.asm.ClassVisitor
import org.objectweb.asm.Opcodes
import java.io.File
import java.util.TreeMap
import java.util.concurrent.ConcurrentHashMap
`;

/**
 * Le débogage dans les fichiers .humalis. Kotlin n'a pas de directive de
 * ligne : une étape de la construction (l'instrumentation des classes du
 * plugin Android, avant D8) inscrit dans l'attribut SourceDebugExtension de
 * chaque classe une strate « Humalis » (JSR-45) qui relie ses lignes aux
 * lignes des fichiers .humalis, d'après la table humalis-lignes.txt. Le SMAP
 * de Kotlin (fonctions inline) est gardé tel quel : la strate Humalis vient
 * avant la sienne, et le code recopié d'une fonction inline garde sa source
 * Kotlin. D8 garde l'attribut (dalvik.annotation.SourceDebugExtension),
 * l'appareil le transmet au débogueur (JDWP), et l'extension Humalis
 * d'Android Studio s'en sert pour les points d'arrêt et le pas à pas.
 * Seulement pour la construction « debug ».
 */
const STRATE_HUMALIS = String.raw`
// Le débogage dans les fichiers .humalis (Android Studio avec l'extension Humalis) : chaque classe
// reçoit, dans son attribut SourceDebugExtension (JSR-45), une strate « Humalis » qui relie ses
// lignes aux lignes des fichiers .humalis (table : humalis-lignes.txt). La strate de Kotlin est gardée.
androidComponents {
    onVariants(selector().withBuildType("debug")) { variante ->
        variante.instrumentation.transformClassesWith(StrateHumalis::class.java, InstrumentationScope.PROJECT) { parametres ->
            parametres.table.set(layout.projectDirectory.file("humalis-lignes.txt"))
        }
    }
}

abstract class StrateHumalis : AsmClassVisitorFactory<StrateHumalis.Parametres> {
    interface Parametres : InstrumentationParameters {
        @get:InputFile
        @get:PathSensitive(PathSensitivity.RELATIVE)
        val table: RegularFileProperty
    }

    // La fabrique ne garde rien d'autre que ses paramètres (Gradle la copie vers la tâche) : la table lue est gardée à part.
    private val lue: TableHumalis
        get() = TableHumalis.lue(parameters.get().table.get().asFile)

    override fun isInstrumentable(classData: ClassData): Boolean = classData.className.substringBeforeLast('.', "") in lue.paquets

    override fun createClassVisitor(classContext: ClassContext, nextClassVisitor: ClassVisitor): ClassVisitor =
        object : ClassVisitor(Opcodes.ASM9, nextClassVisitor) {
            private var paquet = ""

            override fun visit(version: Int, access: Int, name: String, signature: String?, superName: String?, interfaces: Array<String>?) {
                paquet = name.substringBeforeLast('/', "")
                super.visit(version, access, name, signature, superName, interfaces)
            }

            override fun visitSource(source: String?, debug: String?) {
                val plages = source?.let { lue.kotlin[if (paquet.isEmpty()) it else "$paquet/$it"] }
                super.visitSource(source, if (source == null || plages == null) debug else lue.strate(source, debug, plages))
            }
        }
}

/** La table : les fichiers Humalis (chemins depuis la racine du projet), puis, pour chaque fichier Kotlin, ses plages [début, fin, fichier, ligne Humalis]. */
class TableHumalis(private val fichiers: List<String>, val kotlin: Map<String, List<IntArray>>) {
    val paquets: Set<String> = kotlin.keys.mapTo(HashSet()) { it.substringBeforeLast('/', "").replace('/', '.') }

    companion object {
        private val lues = ConcurrentHashMap<String, Pair<Long, TableHumalis>>()

        /** La table d'un fichier, lue une fois tant qu'il ne change pas. */
        fun lue(fichier: File): TableHumalis {
            val date = fichier.lastModified()
            lues[fichier.path]?.let { (avant, table) -> if (avant == date) return table }
            return lire(fichier.readText()).also { lues[fichier.path] = date to it }
        }

        fun lire(texte: String): TableHumalis {
            val fichiers = ArrayList<String>()
            val kotlin = HashMap<String, MutableList<IntArray>>()
            var courant: MutableList<IntArray>? = null
            for (ligne in texte.lineSequence()) {
                when {
                    ligne.isBlank() || ligne.startsWith("#") || ligne.startsWith("racine\t") -> {}
                    ligne.startsWith("fichier\t") -> fichiers += ligne.substringAfter('\t')
                    ligne.startsWith("kotlin\t") -> courant = kotlin.getOrPut(ligne.substringAfter('\t')) { ArrayList() }
                    else -> courant?.add(ligne.trim().split(' ').map(String::toInt).toIntArray())
                }
            }
            return TableHumalis(fichiers, kotlin)
        }
    }

    private fun situer(plages: List<IntArray>, ligne: Int): IntArray? {
        var bas = 0
        var haut = plages.size - 1
        while (bas <= haut) {
            val milieu = (bas + haut) ushr 1
            val p = plages[milieu]
            when {
                ligne < p[0] -> haut = milieu - 1
                ligne > p[1] -> bas = milieu + 1
                else -> return p
            }
        }
        return null
    }

    /** Le SMAP de la classe, avec la strate Humalis ; celui de Kotlin, s'il existe, est gardé. */
    fun strate(source: String, debug: String?, plages: List<IntArray>): String? {
        if (debug != null && debug.contains("\n*S Humalis\n")) return debug
        val existant = debug?.takeIf { it.startsWith("SMAP") }?.let { Smap.lire(it) }
        // Chaque ligne de la classe qui vient du fichier lui-même, et sa ligne Kotlin. Le code recopié d'une
        // fonction inline n'en fait pas partie : il garde sa source Kotlin (un point d'arrêt posé dans la
        // fonction inline s'y arrête), et le pas à pas Humalis le traverse.
        val origines = TreeMap<Int, Int>()
        val strateKotlin = existant?.get("Kotlin")
        if (strateKotlin == null) {
            for (p in plages) for (l in p[0]..p[1]) origines[l] = l
        } else {
            val propres = strateKotlin.fichiers.filterValues { it == source }.keys
            val recopiees = HashSet<Int>()
            existant?.get("KotlinDebug")?.parcourir { _, _, sortie -> recopiees += sortie }
            strateKotlin.parcourir { entree, fichier, sortie ->
                if (fichier in propres && sortie !in recopiees) origines[sortie] = entree
            }
        }
        val lignes = StringBuilder()
        var cle: IntArray? = null
        var debut = 0
        var fin = 0
        fun fermer() {
            val c = cle ?: return
            lignes.append(c[3]).append('#').append(c[2] + 1).append(':').append(debut)
            if (fin > debut) lignes.append(',').append(fin - debut + 1)
            lignes.append('\n')
        }
        for ((sortie, origine) in origines) {
            val p = situer(plages, origine)
            val c = cle
            if (p != null && c != null && p[2] == c[2] && p[3] == c[3] && sortie == fin + 1) {
                fin = sortie
                continue
            }
            fermer()
            cle = p
            debut = sortie
            fin = sortie
        }
        fermer()
        if (lignes.isEmpty()) return debug
        val section = StringBuilder("*S Humalis\n*F\n")
        fichiers.forEachIndexed { i, chemin -> section.append("+ ").append(i + 1).append(' ').append(chemin.substringAfterLast('/')).append('\n').append(chemin).append('\n') }
        section.append("*L\n").append(lignes)
        if (existant == null || debug == null) return "SMAP\n" + source + "\nJava\n" + section + "*E\n"
        // La strate Humalis passe devant celle de Kotlin ; l'en-tête (et la strate par défaut, Kotlin) ne change pas.
        val entete = debug.split('\n').take(3).joinToString("\n")
        return entete + "\n" + section + debug.substring(entete.length + 1)
    }
}

/** Un SMAP (JSR-45) lu : ses strates, chacune avec ses fichiers et ses lignes [entrée, fichier, répétitions, sortie, pas]. */
class Smap(val fichiers: Map<Int, String>, private val lignes: List<IntArray>) {
    fun parcourir(action: (entree: Int, fichier: Int, sortie: Int) -> Unit) {
        for (l in lignes) for (i in 0 until l[2]) {
            if (l[4] == 0) action(l[0] + i, l[1], l[3]) else for (j in 0 until l[4]) action(l[0] + i, l[1], l[3] + i * l[4] + j)
        }
    }

    companion object {
        private val LIGNE = Regex("""^(\d+)(?:#(\d+))?(?:,(\d+))?:(\d+)(?:,(\d+))?$""")

        fun lire(texte: String): Map<String, Smap> {
            val strates = HashMap<String, Smap>()
            val lignes = texte.split('\n')
            var nom: String? = null
            var section = ""
            var fichiers = HashMap<Int, String>()
            var entrees = ArrayList<IntArray>()
            var fichier = 1
            fun fermer() { nom?.let { strates[it] = Smap(fichiers, entrees) } }
            var i = 3
            while (i < lignes.size) {
                val l = lignes[i].trimEnd('\r')
                when {
                    l.startsWith("*S ") -> {
                        fermer()
                        nom = l.substring(3).trim()
                        fichiers = HashMap()
                        entrees = ArrayList()
                        fichier = 1
                        section = ""
                    }
                    l == "*E" -> break
                    l.startsWith("*") -> section = l
                    section == "*F" && l.isNotBlank() -> {
                        val avecChemin = l.startsWith("+ ")
                        val parties = l.removePrefix("+ ").trim().split(' ', limit = 2)
                        fichiers[parties[0].toInt()] = parties.getOrElse(1) { "" }
                        if (avecChemin) i++
                    }
                    section == "*L" -> LIGNE.find(l.trim())?.let { m ->
                        val g = m.groupValues
                        if (g[2].isNotEmpty()) fichier = g[2].toInt()
                        entrees += intArrayOf(g[1].toInt(), fichier, g[3].ifEmpty { "1" }.toInt(), g[4].toInt(), g[5].ifEmpty { "1" }.toInt())
                    }
                }
                i++
            }
            fermer()
            return strates
        }
    }
}
`;
