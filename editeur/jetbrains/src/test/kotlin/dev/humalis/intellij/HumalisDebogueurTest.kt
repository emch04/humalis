package dev.humalis.intellij

import com.sun.jdi.Location
import com.sun.jdi.Method
import dev.humalis.intellij.debogueur.EndroitsHumalis
import dev.humalis.intellij.debogueur.LignesHumalis
import dev.humalis.intellij.debogueur.TableDebogueur
import dev.humalis.intellij.debogueur.VariablesHumalis
import junit.framework.TestCase
import java.io.File
import java.lang.reflect.Proxy
import java.nio.file.Files

/** Le débogueur des applications Android : la table, les noms des variables, le choix des endroits d'un point d'arrêt. */
class HumalisDebogueurTest : TestCase() {
    private val texteTable = """
        # Produit par Humalis : les lignes Humalis du code Kotlin, pour le débogueur (strate « Humalis », JSR-45).
        # racine : …
        racine	..
        fichier	../compteur.humalis
        fichier	../pages/panier.humalis
        kotlin	local/humalis/compteur/PageAccueil.kt
        50 50 0 13
        51 52 0 14
        kotlin	local/humalis/compteur/pages/PagePanier.kt
        12 12 1 4
    """.trimIndent()

    fun testLaTableDonneLaRacineLesFichiersLesPaquetsEtLesLignesDeCode() {
        val dossier = Files.createTempDirectory("humalis-table").toFile()
        try {
            val app = File(dossier, "app-android/app").apply { mkdirs() }
            val fichier = File(app, "humalis-lignes.txt").apply { writeText(texteTable) }
            File(dossier, "compteur.humalis").writeText("page \"accueil\" :\n")
            val table = TableDebogueur.lire(fichier)!!
            assertEquals(File(dossier, "app-android").canonicalFile, table.racine)
            assertEquals(listOf("../compteur.humalis", "../pages/panier.humalis"), table.chemins)
            assertEquals(setOf("local.humalis.compteur", "local.humalis.compteur.pages"), table.paquets)
            assertEquals(File(dossier, "compteur.humalis").canonicalFile, table.fichierHumalis("../compteur.humalis"))
            assertEquals("../compteur.humalis", table.cheminDe(File(dossier, "compteur.humalis")))
            assertNull(table.cheminDe(File(dossier, "autre.humalis")))
            assertEquals(setOf(13, 14), table.lignesDeCode("../compteur.humalis"))
            assertEquals(setOf(4), table.lignesDeCode("../pages/panier.humalis"))
            assertNull(table.lignesDeCode("../inconnu.humalis"))
            assertTrue(table.contientClasse("local.humalis.compteur.PageAccueilKt\$PageAccueil\$1"))
            assertFalse(table.contientClasse("androidx.compose.runtime.ComposerKt"))
        } finally {
            dossier.deleteRecursively()
        }
    }

    fun testUnFichierQuiNEstPasUneTableEstRefuse() {
        assertNull(TableDebogueur.lire(File("/x/app/humalis-lignes.txt"), "autre chose\n"))
    }

    fun testLesVariablesGardentLeurNomHumalis() {
        assertEquals("compte", VariablesHumalis.nomHumalis("\$compte\$delegate"))
        assertEquals("compte", VariablesHumalis.nomHumalis("compte\$delegate"))
        assertEquals("panier", VariablesHumalis.nomHumalis("\$panier"))
        assertEquals("prix_total", VariablesHumalis.nomHumalis("prix_total"))
        assertEquals("élève", VariablesHumalis.nomHumalis("\$élève\$delegate"))
        for (interne in listOf("\$completion", "\$continuation", "\$result", "L\$0", "\$i\$f\$noter", "this", "label", "nav", "\$portee")) {
            assertNull(interne, VariablesHumalis.nomHumalis(interne))
        }
    }

    fun testUneLigneVideOuUnCommentaireNePorteRien() {
        assertTrue(LignesHumalis.peutPorterUnArret("    changer compte par compte + 1"))
        assertFalse(LignesHumalis.peutPorterUnArret("   "))
        assertFalse(LignesHumalis.peutPorterUnArret("    # un commentaire"))
    }

    fun testUnPointDArretPrendLePremierEndroitDeChaqueLigneSansLesFonctionsInline() {
        val methode = methode("quandCliqueAjouter")
        val endroits = listOf(
            endroit(methode, ligne = 55, index = 40),
            endroit(methode, ligne = 55, index = 12),
            endroit(methode, ligne = 116, index = 60, inline = true),
            endroit(methode, ligne = 117, index = 70, inline = true),
        )
        val gardes = EndroitsHumalis.garder(endroits) { it.inline() }
        assertEquals(listOf(12L), gardes.map { it.codeIndex() })
    }

    fun testUnEndroitInlineEstGardeSIlEstLeSeulDeSaMethode() {
        val methode = methode("autre")
        val gardes = EndroitsHumalis.garder(listOf(endroit(methode, ligne = 116, index = 8, inline = true))) { it.inline() }
        assertEquals(listOf(8L), gardes.map { it.codeIndex() })
    }

    private interface EndroitEssai : Location {
        fun inline(): Boolean
    }

    private fun methode(nom: String): Method = Proxy.newProxyInstance(javaClass.classLoader, arrayOf(Method::class.java)) { soi, m, args ->
        when (m.name) {
            "name" -> nom
            "hashCode" -> System.identityHashCode(soi)
            "equals" -> soi === args?.get(0)
            "toString" -> nom
            else -> throw UnsupportedOperationException(m.name)
        }
    } as Method

    private fun endroit(methode: Method, ligne: Int, index: Long, inline: Boolean = false): EndroitEssai =
        Proxy.newProxyInstance(javaClass.classLoader, arrayOf(EndroitEssai::class.java)) { soi, m, args ->
            when (m.name) {
                "method" -> methode
                "lineNumber" -> ligne
                "codeIndex" -> index
                "inline" -> inline
                "hashCode" -> System.identityHashCode(soi)
                "equals" -> soi === args?.get(0)
                "toString" -> "$ligne@$index"
                else -> throw UnsupportedOperationException(m.name)
            }
        } as EndroitEssai
}
