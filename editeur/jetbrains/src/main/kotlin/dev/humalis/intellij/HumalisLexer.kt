package dev.humalis.intellij

import com.intellij.lexer.LexerBase
import com.intellij.psi.TokenType
import com.intellij.psi.tree.IElementType
import com.intellij.psi.tree.TokenSet
import java.text.Normalizer

class HumalisJeton(nom: String) : IElementType(nom, HumalisLanguage)

/** Les jetons que la coloration distingue ; le sens du code vient du serveur de langage. */
object HumalisJetons {
    @JvmField val COMMENTAIRE = HumalisJeton("COMMENTAIRE")
    @JvmField val CHAINE = HumalisJeton("CHAINE")
    @JvmField val NOMBRE = HumalisJeton("NOMBRE")
    @JvmField val CONSTANTE = HumalisJeton("CONSTANTE")
    @JvmField val MOT_RESERVE = HumalisJeton("MOT_RESERVE")
    @JvmField val MOT_CONTEXTUEL = HumalisJeton("MOT_CONTEXTUEL")
    @JvmField val NOM = HumalisJeton("NOM")
    @JvmField val PONCTUATION = HumalisJeton("PONCTUATION")
    @JvmField val OPERATEUR = HumalisJeton("OPERATEUR")

    @JvmField val COMMENTAIRES = TokenSet.create(COMMENTAIRE)
    @JvmField val CHAINES = TokenSet.create(CHAINE)
}

/**
 * Les mots du langage, lus dans mots.json (tiré du vocabulaire du
 * compilateur, comme pour Zed, Helix, Neovim et Emacs).
 */
object HumalisMots {
    private val listes: Map<String, Set<String>> by lazy {
        val texte = HumalisMots::class.java.getResourceAsStream("/dev/humalis/intellij/mots.json")!!
            .bufferedReader(Charsets.UTF_8).use { it.readText() }
        Regex("\"(\\w+)\"\\s*:\\s*\\[([^\\]]*)]").findAll(texte).associate { m ->
            m.groupValues[1] to Regex("\"([^\"]+)\"").findAll(m.groupValues[2]).map { it.groupValues[1] }.toSet()
        }
    }

    /** Comme le compilateur : sans accents et sans tenir compte de la casse (« Égal » est « egal »). */
    fun normaliser(mot: CharSequence): String =
        Normalizer.normalize(mot, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase()

    fun genre(mot: CharSequence): IElementType {
        val forme = normaliser(mot)
        return when {
            forme in listes.getValue("constantes") -> HumalisJetons.CONSTANTE
            forme in listes.getValue("reserves") -> HumalisJetons.MOT_RESERVE
            forme in listes.getValue("contextuels") -> HumalisJetons.MOT_CONTEXTUEL
            else -> HumalisJetons.NOM
        }
    }
}

/**
 * Découpe le texte ligne à ligne, comme la grammaire tree-sitter : une
 * chaîne s'arrête à son guillemet ou à la fin de la ligne, pour ne jamais
 * colorer la suite du fichier pendant qu'on l'écrit.
 */
class HumalisLexer : LexerBase() {
    private var texte: CharSequence = ""
    private var fin = 0
    private var debutJeton = 0
    private var finJeton = 0
    private var jeton: IElementType? = null

    override fun start(buffer: CharSequence, startOffset: Int, endOffset: Int, initialState: Int) {
        texte = buffer
        fin = endOffset
        finJeton = startOffset
        avancer()
    }

    override fun getState(): Int = 0
    override fun getTokenType(): IElementType? = jeton
    override fun getTokenStart(): Int = debutJeton
    override fun getTokenEnd(): Int = finJeton
    override fun getBufferSequence(): CharSequence = texte
    override fun getBufferEnd(): Int = fin

    override fun advance() = avancer()

    private fun avancer() {
        debutJeton = finJeton
        if (debutJeton >= fin) {
            jeton = null
            return
        }
        var i = debutJeton
        val c = texte[i]
        jeton = when {
            c.isWhitespace() -> {
                while (i < fin && texte[i].isWhitespace()) i++
                TokenType.WHITE_SPACE
            }
            c == '#' -> {
                while (i < fin && texte[i] != '\n') i++
                HumalisJetons.COMMENTAIRE
            }
            c == '"' -> {
                i++
                while (i < fin && texte[i] != '"' && texte[i] != '\n') {
                    if (texte[i] == '\\' && i + 1 < fin && texte[i + 1] != '\n') i++
                    i++
                }
                if (i < fin && texte[i] == '"') i++
                HumalisJetons.CHAINE
            }
            c.isDigit() -> {
                while (i < fin && texte[i].isDigit()) i++
                if (i + 1 < fin && texte[i] == '.' && texte[i + 1].isDigit()) {
                    i++
                    while (i < fin && texte[i].isDigit()) i++
                }
                HumalisJetons.NOMBRE
            }
            c.isLetter() || c == '_' -> {
                while (i < fin && (texte[i].isLetterOrDigit() || texte[i] == '_')) i++
                HumalisMots.genre(texte.subSequence(debutJeton, i))
            }
            c in ":,.()[]{}'’" -> { i++; HumalisJetons.PONCTUATION }
            else -> { i++; HumalisJetons.OPERATEUR }
        }
        finJeton = i
    }
}
