package dev.humalis.intellij.debogueur

import com.intellij.debugger.engine.DebugProcessImpl
import com.intellij.debugger.engine.JavaBreakpointHandler
import com.intellij.debugger.engine.JavaBreakpointHandlerFactory
import com.intellij.debugger.ui.breakpoints.Breakpoint
import com.intellij.debugger.ui.breakpoints.JavaLineBreakpointTypeBase
import com.intellij.debugger.ui.breakpoints.LineBreakpoint
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.TextRange
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.xdebugger.breakpoints.XBreakpoint
import com.intellij.xdebugger.breakpoints.XLineBreakpoint
import dev.humalis.intellij.HumalisFileType
import org.jetbrains.java.debugger.breakpoints.properties.JavaLineBreakpointProperties

/**
 * Les points d'arrêt posés dans un fichier .humalis. Ce sont des points
 * d'arrêt de ligne du débogueur Java (celui d'Android Studio et d'IntelliJ) :
 * le gestionnaire de positions Humalis les traduit en endroits du code
 * produit, par la strate « Humalis » des classes.
 */
class PointArretHumalisType : JavaLineBreakpointTypeBase<JavaLineBreakpointProperties>("humalis-ligne", "Points d’arrêt Humalis") {

    override fun canPutAt(file: VirtualFile, line: Int, project: Project): Boolean {
        if (file.fileType != HumalisFileType) return false
        val document = FileDocumentManager.getInstance().getDocument(file) ?: return false
        if (line < 0 || line >= document.lineCount) return false
        val texte = document.getText(TextRange(document.getLineStartOffset(line), document.getLineEndOffset(line)))
        if (!LignesHumalis.peutPorterUnArret(texte)) return false
        // Le projet a déjà été compilé pour Android : seules les lignes qui produisent du code peuvent arrêter le programme.
        val lignes = TablesDuProjet.de(project).pour(file).mapNotNull { (table, chemin) -> table.lignesDeCode(chemin) }
        return lignes.isEmpty() || lignes.any { (line + 1) in it }
    }

    override fun createBreakpointProperties(file: VirtualFile, line: Int): JavaLineBreakpointProperties = JavaLineBreakpointProperties()

    /** Les réglages d'un point d'arrêt relu à l'ouverture du projet (sans eux, le débogueur Java le refuse). */
    override fun createProperties(): JavaLineBreakpointProperties = JavaLineBreakpointProperties()

    @Suppress("UNCHECKED_CAST")
    override fun createJavaBreakpoint(project: Project, breakpoint: XBreakpoint<JavaLineBreakpointProperties>): Breakpoint<JavaLineBreakpointProperties> =
        LineBreakpoint.create(project, breakpoint) as Breakpoint<JavaLineBreakpointProperties>

    override fun getDisplayText(breakpoint: XLineBreakpoint<JavaLineBreakpointProperties>): String {
        val position = breakpoint.sourcePosition ?: return super.getDisplayText(breakpoint)
        return "Ligne ${position.line + 1} de ${position.file.name}"
    }
}

/** Branche les points d'arrêt Humalis sur le débogueur Java. */
class PointArretHumalisHandlerFactory : JavaBreakpointHandlerFactory {
    override fun createHandler(process: DebugProcessImpl): JavaBreakpointHandler = JavaBreakpointHandler(PointArretHumalisType::class.java, process)
}

object LignesHumalis {
    /** Une ligne vide ou un commentaire ne peut pas porter de point d'arrêt. */
    fun peutPorterUnArret(texte: String): Boolean {
        val contenu = texte.trim()
        return contenu.isNotEmpty() && !contenu.startsWith("#")
    }
}
