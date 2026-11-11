package dev.humalis.intellij

import com.intellij.psi.TokenType
import com.intellij.psi.tree.IElementType
import junit.framework.TestCase

class HumalisLexerTest : TestCase() {
    private fun jetons(texte: String): List<Pair<IElementType?, String>> {
        val lexer = HumalisLexer()
        lexer.start(texte, 0, texte.length, 0)
        val liste = mutableListOf<Pair<IElementType?, String>>()
        while (lexer.tokenType != null) {
            if (lexer.tokenType != TokenType.WHITE_SPACE) liste += lexer.tokenType to texte.substring(lexer.tokenStart, lexer.tokenEnd)
            lexer.advance()
        }
        return liste
    }

    fun testMotsReservesContextuelsEtNoms() {
        assertEquals(
            listOf(
                HumalisJetons.MOT_RESERVE to "si",
                HumalisJetons.NOM to "simple",
                HumalisJetons.MOT_RESERVE to "est",
                HumalisJetons.MOT_CONTEXTUEL to "Égal",
                HumalisJetons.NOM to "à",
                HumalisJetons.NOMBRE to "1.5",
                HumalisJetons.PONCTUATION to ":",
            ),
            jetons("si simple est Égal à 1.5 :"),
        )
    }

    fun testChainesEtCommentaires() {
        assertEquals(
            listOf(
                HumalisJetons.MOT_CONTEXTUEL to "titre",
                HumalisJetons.CHAINE to "\"Bonjour {nom}, \\\"vous\\\" # pas un commentaire\"",
                HumalisJetons.COMMENTAIRE to "# un commentaire",
            ),
            jetons("titre \"Bonjour {nom}, \\\"vous\\\" # pas un commentaire\" # un commentaire"),
        )
    }

    fun testUneChaineNonFermeeSArreteALaFinDeLaLigne() {
        assertEquals(
            listOf(
                HumalisJetons.MOT_CONTEXTUEL to "texte",
                HumalisJetons.CHAINE to "\"pas fermé",
                HumalisJetons.MOT_CONTEXTUEL to "bouton",
                HumalisJetons.CHAINE to "\"Envoyer\"",
            ),
            jetons("texte \"pas fermé\nbouton \"Envoyer\""),
        )
    }

    fun testLesConstantes() {
        assertEquals(listOf(HumalisJetons.CONSTANTE to "vrai", HumalisJetons.CONSTANTE to "FAUX"), jetons("vrai FAUX"))
    }
}
