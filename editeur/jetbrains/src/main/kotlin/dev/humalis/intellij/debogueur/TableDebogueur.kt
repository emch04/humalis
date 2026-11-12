package dev.humalis.intellij.debogueur

import java.io.File

/** Le nom de la strate des classes produites par Humalis (attribut SourceDebugExtension, JSR-45). */
const val STRATE_HUMALIS = "Humalis"

/** Le nom de la table écrite par `humalis compile --cible android`, dans le dossier du module (« app »). */
const val NOM_TABLE = "humalis-lignes.txt"

/**
 * La table du débogueur d'un projet Android produit par Humalis
 * (`app/humalis-lignes.txt`). Elle dit :
 * - où est la racine du projet produit (`racine`, depuis le dossier de la table) ;
 * - les fichiers Humalis, chacun avec son chemin depuis cette racine — le même
 *   texte que le chemin écrit dans la strate « Humalis » des classes ;
 * - pour chaque fichier Kotlin produit, ses plages (début, fin, fichier, ligne
 *   Humalis), d'où viennent les paquets à surveiller et les lignes Humalis qui
 *   produisent du code.
 */
class TableDebogueur(
    /** Le fichier de la table. */
    val fichier: File,
    /** La racine du projet produit (là où est settings.gradle.kts). */
    val racine: File,
    /** Les chemins des fichiers Humalis, depuis la racine, tels qu'ils sont écrits dans les classes. */
    val chemins: List<String>,
    /** Les paquets Kotlin des classes produites. */
    val paquets: Set<String>,
    /** Les fichiers Kotlin produits qui portent des lignes Humalis (« a/b/PageAccueil.kt »). */
    val fichiersKotlin: List<String>,
    /** Pour chaque fichier Humalis (index dans [chemins]), les lignes qui produisent du code. */
    private val lignesDeCode: Map<Int, Set<Int>>,
) {
    /** Le fichier Humalis d'un chemin de la table, sur le disque. */
    fun fichierHumalis(chemin: String): File = File(racine, chemin).canonicalFileOuNormal()

    /** Le chemin (tel qu'écrit dans les classes) d'un fichier Humalis du disque, ou null s'il n'est pas de ce projet. */
    fun cheminDe(fichier: File): String? {
        val cherche = fichier.canonicalFileOuNormal()
        return chemins.firstOrNull { fichierHumalis(it) == cherche }
    }

    /** Les lignes (à partir de 1) qui produisent du code dans ce fichier Humalis, ou null s'il n'est pas de ce projet. */
    fun lignesDeCode(chemin: String): Set<Int>? = chemins.indexOf(chemin).takeIf { it >= 0 }?.let { lignesDeCode[it] ?: emptySet() }

    /**
     * Les classes principales des fichiers Kotlin (« a.b.PageAccueilKt »,
     * « a.b.ComposableSingletons$PageAccueilKt ») : les fonctions d'une page,
     * ses événements et leurs fonctions locales y sont compilés.
     */
    fun classesPrincipales(): List<String> = fichiersKotlin.flatMap { chemin ->
        val paquet = chemin.substringBeforeLast('/', "").replace('/', '.')
        val nom = chemin.substringAfterLast('/').removeSuffix(".kt").replaceFirstChar { it.uppercaseChar() } + "Kt"
        val prefixe = if (paquet.isEmpty()) "" else "$paquet."
        listOf(prefixe + nom, "${prefixe}ComposableSingletons\$$nom")
    }

    /** Vrai si la classe (nom JVM, « a.b.C$D ») est dans un paquet de la table. */
    fun contientClasse(nom: String): Boolean = nom.substringBeforeLast('.', "") in paquets

    companion object {
        /** Lit une table ; null si le fichier n'en est pas une. */
        fun lire(fichier: File): TableDebogueur? {
            val texte = try {
                fichier.readText()
            } catch (_: Exception) {
                return null
            }
            return lire(fichier, texte)
        }

        fun lire(fichier: File, texte: String): TableDebogueur? {
            if (!texte.startsWith("# Produit par Humalis")) return null
            var racine = fichier.absoluteFile.parentFile?.parentFile ?: fichier.absoluteFile.parentFile
            val chemins = ArrayList<String>()
            val paquets = HashSet<String>()
            val fichiersKotlin = ArrayList<String>()
            val lignes = HashMap<Int, MutableSet<Int>>()
            var dansKotlin = false
            for (ligne in texte.lineSequence()) {
                when {
                    ligne.isBlank() || ligne.startsWith("#") -> {}
                    ligne.startsWith("racine\t") -> racine = File(fichier.absoluteFile.parentFile, ligne.substringAfter('\t'))
                    ligne.startsWith("fichier\t") -> chemins += ligne.substringAfter('\t')
                    ligne.startsWith("kotlin\t") -> {
                        dansKotlin = true
                        val chemin = ligne.substringAfter('\t')
                        fichiersKotlin += chemin
                        paquets += chemin.substringBeforeLast('/', "").replace('/', '.')
                    }
                    dansKotlin -> {
                        val parties = ligne.trim().split(' ')
                        if (parties.size == 4) {
                            val index = parties[2].toIntOrNull() ?: continue
                            val numero = parties[3].toIntOrNull() ?: continue
                            lignes.getOrPut(index) { HashSet() } += numero
                        }
                    }
                }
            }
            return TableDebogueur(fichier, racine.canonicalFileOuNormal(), chemins, paquets, fichiersKotlin, lignes)
        }
    }
}

private fun File.canonicalFileOuNormal(): File = try {
    canonicalFile
} catch (_: Exception) {
    absoluteFile.normalize()
}
