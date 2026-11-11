package dev.humalis.intellij

import com.intellij.extapi.psi.PsiFileBase
import com.intellij.lang.Language
import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.fileTypes.LanguageFileType
import com.intellij.openapi.util.IconLoader
import com.intellij.psi.FileViewProvider
import javax.swing.Icon

/** Le langage Humalis. */
object HumalisLanguage : Language("Humalis") {
    private fun readResolve(): Any = HumalisLanguage
}

object HumalisIcones {
    /** L'icône des fichiers .humalis (avec sa variante pour les thèmes sombres, humalis_dark.svg). */
    @JvmField
    val FICHIER: Icon = IconLoader.getIcon("/icones/humalis.svg", HumalisIcones::class.java)
}

/** Les fichiers .humalis. */
object HumalisFileType : LanguageFileType(HumalisLanguage) {
    override fun getName(): String = "Humalis"
    override fun getDescription(): String = "Fichier Humalis"
    override fun getDefaultExtension(): String = "humalis"
    override fun getIcon(): Icon = HumalisIcones.FICHIER
}

class HumalisFichier(vue: FileViewProvider) : PsiFileBase(vue, HumalisLanguage) {
    override fun getFileType(): FileType = HumalisFileType
    override fun toString(): String = "Fichier Humalis"
}
