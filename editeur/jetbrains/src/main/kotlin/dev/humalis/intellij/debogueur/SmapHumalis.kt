package dev.humalis.intellij.debogueur

import com.sun.jdi.AbsentInformationException
import com.sun.jdi.Location
import com.sun.jdi.ReferenceType
import java.util.Collections
import java.util.WeakHashMap

/**
 * Le SMAP (JSR-45) d'une classe produite par Humalis, lu par l'extension.
 *
 * JDI ne suffit pas : pour une ligne que la strate Humalis ne couvre pas,
 * `Location.lineNumber("Humalis")` ne rend pas -1 mais une ligne voisine de
 * la même méthode. Le code recopié d'une fonction inline (« noter »,
 * `listOf`…) passerait alors pour une ligne Humalis, et un point d'arrêt
 * Kotlin posé dans la fonction inline serait montré dans le fichier
 * .humalis, donc jamais atteint. La strate est donc lue ici, ligne par
 * ligne, d'après le SMAP de la classe.
 */
class SmapHumalis private constructor(
    /** Ligne de la classe → (chemin du fichier Humalis, ligne Humalis). */
    private val lignes: Map<Int, Pair<String, Int>>,
    /** Les lignes de la classe qui viennent d'une fonction inline (strate KotlinDebug). */
    private val recopiees: Set<Int>,
) {
    /** Les chemins des fichiers Humalis de la strate. */
    val chemins: Set<String> = lignes.values.mapTo(HashSet()) { it.first }

    /** Le fichier Humalis et la ligne d'une ligne de la classe (strate Java), ou null si la strate Humalis ne la couvre pas. */
    fun situer(ligneClasse: Int): Pair<String, Int>? = lignes[ligneClasse]

    /** Vrai pour une ligne de la classe recopiée d'une fonction inline. */
    fun estRecopiee(ligneClasse: Int): Boolean = ligneClasse in recopiees

    companion object {
        const val STRATE_KOTLIN_DEBUG = "KotlinDebug"
        private val ENTREE = Regex("""^(\d+)(?:#(\d+))?(?:,(\d+))?:(\d+)(?:,(\d+))?$""")

        /** Les SMAP lus, par classe (les classes déchargées sont oubliées). */
        private val lus: MutableMap<ReferenceType, Any> = Collections.synchronizedMap(WeakHashMap())
        private val AUCUN = Any()

        /**
         * Les paquets des classes produites par Humalis (ceux des tables des projets
         * ouverts). Seules leurs classes sont lues : le débogueur demande la position
         * de très nombreux endroits (Android, Compose, Kotlin) et chaque lecture du
         * SMAP est un aller-retour JDWP avec l'appareil.
         */
        private val paquets: MutableSet<String> = java.util.concurrent.ConcurrentHashMap.newKeySet()

        fun connaitre(nouveaux: Collection<String>) {
            paquets += nouveaux
        }

        /** Le SMAP Humalis d'une classe, ou null si elle n'a pas de strate Humalis. */
        fun de(type: ReferenceType): SmapHumalis? {
            if (type.name().substringBeforeLast('.', "") !in paquets) return null
            val deja = lus[type]
            if (deja != null) return deja as? SmapHumalis
            val lu = try {
                lire(type.sourceDebugExtension())
            } catch (_: AbsentInformationException) {
                null
            } catch (_: UnsupportedOperationException) {
                null
            } catch (_: Exception) {
                return null
            }
            lus[type] = lu ?: AUCUN
            return lu
        }

        /** Le fichier Humalis et la ligne d'un endroit du code, ou null s'il ne vient pas d'une ligne Humalis. */
        fun situer(endroit: Location): Pair<String, Int>? {
            val smap = de(endroit.declaringType()) ?: return null
            return smap.situer(endroit.lineNumber(STRATE_JAVA))
        }

        /** Vrai pour un endroit recopié d'une fonction inline dans une classe produite par Humalis. */
        fun estRecopie(endroit: Location): Boolean {
            val smap = de(endroit.declaringType()) ?: return false
            return smap.estRecopiee(endroit.lineNumber(STRATE_JAVA))
        }

        private const val STRATE_JAVA = "Java"

        /** Lit un SMAP ; null s'il n'a pas de strate Humalis. */
        fun lire(texte: String?): SmapHumalis? {
            if (texte == null || !texte.startsWith("SMAP")) return null
            val lignes = HashMap<Int, Pair<String, Int>>()
            val recopiees = HashSet<Int>()
            var strate = ""
            var section = ""
            var fichiers = HashMap<Int, String>()
            var fichier = 1
            var aHumalis = false
            val texteLignes = texte.split('\n').map { it.trimEnd('\r') }
            var i = 3
            while (i < texteLignes.size) {
                val l = texteLignes[i]
                when {
                    l.startsWith("*S ") -> {
                        strate = l.substring(3).trim()
                        if (strate == STRATE_HUMALIS) aHumalis = true
                        section = ""
                        fichiers = HashMap()
                        fichier = 1
                    }
                    l == "*E" -> break
                    l.startsWith("*") -> section = l
                    section == "*F" && l.isNotBlank() -> {
                        val avecChemin = l.startsWith("+ ")
                        val parties = l.removePrefix("+ ").trim().split(' ', limit = 2)
                        val id = parties[0].toIntOrNull()
                        val nom = parties.getOrElse(1) { "" }
                        val chemin = if (avecChemin && i + 1 < texteLignes.size) texteLignes[i + 1] else nom
                        if (id != null) fichiers[id] = chemin
                        if (avecChemin) i++
                    }
                    section == "*L" -> ENTREE.find(l.trim())?.let { m ->
                        val g = m.groupValues
                        if (g[2].isNotEmpty()) fichier = g[2].toInt()
                        val entree = g[1].toInt()
                        val repetitions = g[3].ifEmpty { "1" }.toInt()
                        val sortie = g[4].toInt()
                        val pas = g[5].ifEmpty { "1" }.toInt()
                        for (r in 0 until repetitions) {
                            val premiere = sortie + r * pas
                            val derniere = if (pas == 0) premiere else premiere + pas - 1
                            for (s in premiere..derniere) {
                                when (strate) {
                                    STRATE_HUMALIS -> fichiers[fichier]?.let { chemin -> lignes[s] = chemin to (entree + r) }
                                    STRATE_KOTLIN_DEBUG -> recopiees += s
                                }
                            }
                        }
                    }
                }
                i++
            }
            return if (aHumalis) SmapHumalis(lignes, recopiees) else null
        }
    }
}
