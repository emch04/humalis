package dev.humalis.intellij

import com.intellij.codeInsight.daemon.impl.DaemonCodeAnalyzerImpl
import com.intellij.codeInsight.navigation.actions.GotoDeclarationAction
import com.intellij.codeInsight.actions.ReformatCodeProcessor
import com.intellij.ide.structureView.TreeBasedStructureViewBuilder
import com.intellij.lang.LanguageStructureViewBuilder
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.util.Disposer
import com.intellij.platform.backend.documentation.DocumentationTargetProvider
import com.intellij.platform.backend.documentation.impl.computeDocumentationBlocking
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.testFramework.fixtures.impl.TempDirTestFixtureImpl
import java.io.File

/**
 * L'extension dans une vraie plateforme IntelliJ (sans fenêtre), avec LSP4IJ
 * et le vrai serveur « humalis editeur --stdio » : il faut « humalis » dans le
 * PATH de Gradle.
 */
class HumalisServeurTest : BasePlatformTestCase() {
    // Un vrai dossier sur le disque : le serveur lit les fichiers par leur chemin.
    override fun createTempDirTestFixture() = TempDirTestFixtureImpl()

    private val original: String by lazy {
        File(System.getProperty("humalis.exemples"), "boutique.humalis").readText()
    }

    private fun attendre(delaiMs: Long = 20_000, condition: () -> Boolean): Boolean {
        val fin = System.currentTimeMillis() + delaiMs
        while (System.currentTimeMillis() < fin) {
            PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
            if (condition()) return true
            Thread.sleep(100)
        }
        return condition()
    }

    private fun erreurs(): List<String> {
        myFixture.doHighlighting()
        return DaemonCodeAnalyzerImpl.getHighlights(myFixture.editor.document, HighlightSeverity.ERROR, project).mapNotNull { it.description }
    }

    private fun ouvrir(texte: String) {
        myFixture.configureByText("boutique.humalis", texte)
        assertEquals(HumalisFileType, myFixture.file.virtualFile.fileType)
        assertEquals("Humalis", myFixture.file.language.id)
    }

    private fun placer(motif: String, decalage: Int = 0) {
        val position = myFixture.editor.document.text.indexOf(motif)
        assertTrue("« $motif » introuvable", position >= 0)
        myFixture.editor.caretModel.moveToOffset(position + decalage)
    }

    fun testErreurEnDirect() {
        assertNotNull("la commande « humalis » doit être dans le PATH", HumalisConnexion.trouverHumalis())
        ouvrir(original.replace("    titre \"Votre panier\"", "    titre \"Votre panier"))
        assertTrue("pas d'erreur du serveur : ${erreurs()}", attendre { erreurs().any { "guillemet manquant" in it } })
    }

    fun testSurvol() {
        ouvrir(original)
        placer("bouton \"Ajouter\"", 2)
        var texte = ""
        assertTrue(attendre {
            val cibles = DocumentationTargetProvider.EP_NAME.extensionList.flatMap { it.documentationTargets(myFixture.file, myFixture.caretOffset) }
            texte = cibles.mapNotNull { computeDocumentationBlocking(it.createPointer())?.html }.joinToString()
            "bouton" in texte && "Exemple" in texte
        })
    }

    fun testCompletion() {
        ouvrir(original.replace("    bouton \"Commander\"", "    bouton \"Commander\"\n        bout<caret>"))
        var propositions: List<String> = emptyList()
        assertTrue(attendre {
            propositions = myFixture.completeBasic()?.map { it.lookupString } ?: emptyList()
            "bouton" in propositions || myFixture.editor.document.text.contains("        bouton \"")
        })
    }

    fun testDeclaration() {
        ouvrir(original)
        placer("à panier", 3)
        assertTrue(attendre {
            GotoDeclarationAction.findAllTargetElements(project, myFixture.editor, myFixture.caretOffset).any {
                myFixture.editor.document.getLineNumber(it.textOffset) == 0
            }
        })
    }

    fun testPlan() {
        ouvrir(original)
        val constructeur = LanguageStructureViewBuilder.getInstance().getStructureViewBuilder(myFixture.file) as TreeBasedStructureViewBuilder
        val modele = constructeur.createStructureViewModel(myFixture.editor)
        try {
            assertTrue(attendre { modele.root.children.any { it.presentation.presentableText == "boutique" } })
        } finally {
            Disposer.dispose(modele)
        }
    }

    fun testMiseEnForme() {
        ouvrir(original.replace("    titre \"Votre panier\"", "    titre   \"Votre panier\""))
        attendre(5_000) { false.also { erreurs() } }
        WriteCommandAction.runWriteCommandAction(project) { ReformatCodeProcessor(myFixture.file, false).run() }
        assertTrue(attendre { myFixture.editor.document.text == original })
    }
}
