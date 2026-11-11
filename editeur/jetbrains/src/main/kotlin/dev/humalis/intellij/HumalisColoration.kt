package dev.humalis.intellij

import com.intellij.lang.ASTNode
import com.intellij.lang.Commenter
import com.intellij.lang.ParserDefinition
import com.intellij.lang.PsiBuilder
import com.intellij.lang.PsiParser
import com.intellij.lexer.Lexer
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors as Couleurs
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.fileTypes.SyntaxHighlighter
import com.intellij.openapi.fileTypes.SyntaxHighlighterBase
import com.intellij.openapi.fileTypes.SyntaxHighlighterFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.FileViewProvider
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.impl.source.tree.LeafPsiElement
import com.intellij.psi.tree.IElementType
import com.intellij.psi.tree.IFileElementType
import com.intellij.psi.tree.TokenSet
import com.intellij.extapi.psi.ASTWrapperPsiElement

/** Les couleurs de Humalis, reprises du thème de l'éditeur. */
object HumalisCouleurs {
    @JvmField val COMMENTAIRE = TextAttributesKey.createTextAttributesKey("HUMALIS_COMMENTAIRE", Couleurs.LINE_COMMENT)
    @JvmField val CHAINE = TextAttributesKey.createTextAttributesKey("HUMALIS_CHAINE", Couleurs.STRING)
    @JvmField val NOMBRE = TextAttributesKey.createTextAttributesKey("HUMALIS_NOMBRE", Couleurs.NUMBER)
    @JvmField val CONSTANTE = TextAttributesKey.createTextAttributesKey("HUMALIS_CONSTANTE", Couleurs.CONSTANT)
    @JvmField val MOT_RESERVE = TextAttributesKey.createTextAttributesKey("HUMALIS_MOT_RESERVE", Couleurs.KEYWORD)
    @JvmField val MOT_CONTEXTUEL = TextAttributesKey.createTextAttributesKey("HUMALIS_MOT_CONTEXTUEL", Couleurs.PREDEFINED_SYMBOL)
    @JvmField val PONCTUATION = TextAttributesKey.createTextAttributesKey("HUMALIS_PONCTUATION", Couleurs.COMMA)
    @JvmField val OPERATEUR = TextAttributesKey.createTextAttributesKey("HUMALIS_OPERATEUR", Couleurs.OPERATION_SIGN)
}

class HumalisSyntaxHighlighter : SyntaxHighlighterBase() {
    override fun getHighlightingLexer(): Lexer = HumalisLexer()

    override fun getTokenHighlights(jeton: IElementType): Array<TextAttributesKey> = pack(
        when (jeton) {
            HumalisJetons.COMMENTAIRE -> HumalisCouleurs.COMMENTAIRE
            HumalisJetons.CHAINE -> HumalisCouleurs.CHAINE
            HumalisJetons.NOMBRE -> HumalisCouleurs.NOMBRE
            HumalisJetons.CONSTANTE -> HumalisCouleurs.CONSTANTE
            HumalisJetons.MOT_RESERVE -> HumalisCouleurs.MOT_RESERVE
            HumalisJetons.MOT_CONTEXTUEL -> HumalisCouleurs.MOT_CONTEXTUEL
            HumalisJetons.PONCTUATION -> HumalisCouleurs.PONCTUATION
            HumalisJetons.OPERATEUR -> HumalisCouleurs.OPERATEUR
            else -> null
        },
    )
}

class HumalisSyntaxHighlighterFactory : SyntaxHighlighterFactory() {
    override fun getSyntaxHighlighter(project: Project?, fichier: VirtualFile?): SyntaxHighlighter = HumalisSyntaxHighlighter()
}

class HumalisCommenter : Commenter {
    override fun getLineCommentPrefix(): String = "# "
    override fun getBlockCommentPrefix(): String? = null
    override fun getBlockCommentSuffix(): String? = null
    override fun getCommentedBlockCommentPrefix(): String? = null
    override fun getCommentedBlockCommentSuffix(): String? = null
}

/**
 * Un arbre plat (un nœud par jeton) : la structure du programme, le plan
 * et les erreurs viennent du serveur de langage, pas d'un second analyseur.
 */
class HumalisParserDefinition : ParserDefinition {
    companion object {
        @JvmField val FICHIER = IFileElementType(HumalisLanguage)
    }

    override fun createLexer(project: Project?): Lexer = HumalisLexer()
    override fun createParser(project: Project?): PsiParser = PsiParser { racine: IElementType, constructeur: PsiBuilder ->
        val marque = constructeur.mark()
        while (!constructeur.eof()) constructeur.advanceLexer()
        marque.done(racine)
        constructeur.treeBuilt
    }
    override fun getFileNodeType(): IFileElementType = FICHIER
    override fun getCommentTokens(): TokenSet = HumalisJetons.COMMENTAIRES
    override fun getStringLiteralElements(): TokenSet = HumalisJetons.CHAINES
    override fun createElement(noeud: ASTNode): PsiElement = ASTWrapperPsiElement(noeud)
    override fun createFile(vue: FileViewProvider): PsiFile = HumalisFichier(vue)
}
