/**
 * Les nombres, les montants et les dates en Kotlin, dans chaque langue de
 * Humalis, comme sur les autres cibles (src/cibles/format.ts, Formats.swift).
 * Les gabarits Kotlin s'écrivent `#{…}` : `kotlin()` les remet en `${…}`.
 */
export const FORMATS_KT = String.raw`// Produit par Humalis : les nombres, les dates et les montants, comme sur les autres cibles.
package PAQUET

import java.text.NumberFormat
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Currency
import java.util.Locale

/** Les nombres de chaque langue, comme sur le web (le lingala suit l'usage français de Kinshasa). */
private fun region(langue: String): Locale = when (langue) {
    "en" -> Locale.US
    "es" -> Locale.forLanguageTag("es-ES")
    "pt" -> Locale.forLanguageTag("pt-PT")
    "sw" -> Locale.forLanguageTag("sw")
    else -> Locale.FRANCE
}

/** Les dates de chaque langue. */
private fun regionDesDates(langue: String): Locale = when (langue) {
    "en" -> Locale.UK
    "es" -> Locale.forLanguageTag("es-ES")
    "pt" -> Locale.forLanguageTag("pt-PT")
    "sw" -> Locale.forLanguageTag("sw")
    "ln" -> Locale.forLanguageTag("ln-CD")
    else -> Locale.FRANCE
}

private fun nombres(langue: String, min: Int, max: Int): NumberFormat = NumberFormat.getNumberInstance(region(langue)).also {
    it.minimumFractionDigits = min
    it.maximumFractionDigits = max
}

/** 28000 → « 28 000 », 3.5 → « 3,5 » ; rien pour une valeur absente. */
fun formaterNombre(valeur: Double?, langue: String = "fr"): String {
    if (valeur == null || valeur.isNaN() || valeur.isInfinite()) return ""
    return nombres(langue, 0, 3).format(valeur)
}

/** 15000, « FC » → « 15 000 FC » ; 12.5, « EUR » → « 12,50 € » ; 12.5, « USD » → « 12,50 $ ». */
fun formaterArgent(valeur: Double?, devise: String, langue: String = "fr"): String {
    if (valeur == null || valeur.isNaN() || valeur.isInfinite()) return ""
    return when (devise) {
        "EUR" -> NumberFormat.getCurrencyInstance(region(langue)).also { it.currency = Currency.getInstance("EUR") }.format(valeur)
        "USD" -> if (langue != "fr") NumberFormat.getCurrencyInstance(region(langue)).also { it.currency = Currency.getInstance("USD") }.format(valeur)
            else (if (valeur == Math.rint(valeur)) nombres(langue, 0, 0) else nombres(langue, 2, 2)).format(valeur) + " $"
        else -> formaterNombre(valeur, langue) + " " + devise
    }
}

/** 1, « article » → « 1 article » ; 3 → « 3 articles » ; 2, « journal » → « 2 journaux ». */
fun accorder(nombre: Double?, mot: String, langue: String = "fr"): String {
    if (nombre == null) return ""
    val ecrit = formaterNombre(nombre, langue)
    val fin = { motif: String -> Regex(motif).containsMatchIn(mot) }
    return when (langue) {
        "en" -> when {
            nombre == 1.0 -> "#{ecrit} #{mot}"
            fin("(s|x|z|ch|sh)$") -> "#{ecrit} #{mot}es"
            fin("[^aeiou]y$") -> "#{ecrit} #{mot.dropLast(1)}ies"
            else -> "#{ecrit} #{mot}s"
        }
        "es" -> when {
            nombre == 1.0 -> "#{ecrit} #{mot}"
            mot.endsWith("ión") -> "#{ecrit} #{mot.dropLast(3)}iones"
            mot.endsWith("z") -> "#{ecrit} #{mot.dropLast(1)}ces"
            fin("[aeiouáéó]$") -> "#{ecrit} #{mot}s"
            else -> "#{ecrit} #{mot}es"
        }
        "pt" -> when {
            nombre == 1.0 -> "#{ecrit} #{mot}"
            mot.endsWith("ão") -> "#{ecrit} #{mot.dropLast(2)}ões"
            mot.endsWith("m") -> "#{ecrit} #{mot.dropLast(1)}ns"
            fin("[rz]$") -> "#{ecrit} #{mot}es"
            mot.endsWith("al") -> "#{ecrit} #{mot.dropLast(1)}is"
            mot.endsWith("s") -> "#{ecrit} #{mot}"
            else -> "#{ecrit} #{mot}s"
        }
        // En swahili et en lingala, le pluriel change le début du mot : il reste tel qu'écrit.
        "sw", "ln" -> "#{ecrit} #{mot}"
        else -> when {
            Math.abs(nombre) < 2 -> "#{ecrit} #{mot}"
            fin("[sxz]$") -> "#{ecrit} #{mot}"
            mot.endsWith("al") -> "#{ecrit} #{mot.dropLast(2)}aux"
            fin("(eau|au|eu)$") -> "#{ecrit} #{mot}x"
            else -> "#{ecrit} #{mot}s"
        }
    }
}

/** 1572864 octets, « Mo » → « 1,5 Mo ». */
fun formaterTaille(octets: Double?, unite: String, langue: String = "fr"): String {
    if (octets == null) return ""
    val valeur = if (unite == "Mo") octets / 1048576 else octets / 1024
    val nom = if (langue == "fr" || langue == "ln") unite else if (unite == "Mo") "MB" else "KB"
    return nombres(langue, 0, 1).format(valeur) + " " + nom
}

/** « 2026-11-07 », lu comme un jour ; rien si ce n'en est pas un. */
private fun jourDe(texte: String?): LocalDate? = try {
    if (texte == null || texte.length < 10) null else LocalDate.parse(texte.take(10))
} catch (e: Exception) {
    null
}

/** Les noms écrits ici, comme sur le web : tous les systèmes n'ont pas ces langues. */
private val MOIS = mapOf(
    "sw" to listOf("Januari", "Februari", "Machi", "Aprili", "Mei", "Juni", "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba"),
    "ln" to listOf("sánzá ya yambo", "sánzá ya míbalé", "sánzá ya mísáto", "sánzá ya mínei", "sánzá ya mítáno", "sánzá ya motóbá", "sánzá ya nsambo", "sánzá ya mwambe", "sánzá ya libwa", "sánzá ya zómi", "sánzá ya zómi na mɔ̌kɔ́", "sánzá ya zómi na míbalé"),
)
private val JOURS = mapOf(
    "sw" to listOf("Jumapili", "Jumatatu", "Jumanne", "Jumatano", "Alhamisi", "Ijumaa", "Jumamosi"),
    "ln" to listOf("eyenga", "mokɔlɔ mwa yambo", "mokɔlɔ mwa míbalé", "mokɔlɔ mwa mísáto", "mokɔlɔ ya mínéi", "mokɔlɔ ya mítáno", "mpɔ́sɔ"),
)

/** « 2026-11-07 » → « 7 novembre 2026 » ; un texte qui n'est pas une date reste tel quel. */
fun formaterDate(valeur: String?, langue: String = "fr"): String {
    if (valeur.isNullOrEmpty()) return ""
    val jour = jourDe(valeur) ?: return valeur
    MOIS[langue]?.let { return "#{jour.dayOfMonth} #{it[jour.monthValue - 1]} #{jour.year}" }
    val motif = when (langue) { "en" -> "d MMMM yyyy"; "es", "pt" -> "d 'de' MMMM 'de' yyyy"; else -> "d MMMM yyyy" }
    return jour.format(DateTimeFormatter.ofPattern(motif, regionDesDates(langue)))
}

/** « 2026-11-09 » → « lundi 9 novembre » (« Monday 9 November », « lunes, 9 de noviembre »). */
fun formaterDateLongue(valeur: String?, langue: String = "fr"): String {
    if (valeur.isNullOrEmpty()) return ""
    val jour = jourDe(valeur) ?: return valeur
    val jours = JOURS[langue]
    val mois = MOIS[langue]
    if (jours != null && mois != null) return jours[jour.dayOfWeek.value % 7] + (if (langue == "sw") "," else "") + " #{jour.dayOfMonth} #{mois[jour.monthValue - 1]}"
    val motif = when (langue) { "en" -> "EEEE d MMMM"; "es", "pt" -> "EEEE, d 'de' MMMM"; else -> "EEEE d MMMM" }
    return jour.format(DateTimeFormatter.ofPattern(motif, regionDesDates(langue)))
}

fun dateDuJour(): String = LocalDate.now().toString()

fun maintenant(): String = OffsetDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSZ"))

/** « 2026-10-30 » plus 3 jours → « 2026-11-02 » ; un mois trop court garde son dernier jour. */
fun decalerDate(valeur: String?, nombre: Double, unite: String): String {
    val jour = jourDe(valeur) ?: return ""
    val n = nombre.toLong()
    return when (unite) {
        "semaines" -> jour.plusWeeks(n)
        "mois" -> jour.plusMonths(n)
        else -> jour.plusDays(n)
    }.toString()
}

/** Le nombre de jours de la première date à la seconde (négatif si elle est avant). */
fun joursEntre(debut: String?, fin: String?): Double {
    val a = jourDe(debut) ?: return 0.0
    val b = jourDe(fin) ?: return 0.0
    return ChronoUnit.DAYS.between(a, b).toDouble()
}

/** « lundi 9 novembre » → « Lundi 9 novembre ». */
fun avecMajuscule(texte: String?, langue: String = "fr"): String =
    if (texte.isNullOrEmpty()) "" else texte.substring(0, 1).uppercase(Locale.forLanguageTag(langue)) + texte.substring(1)

/** « Direction générale » → « DG » : la première lettre des deux premiers mots. */
fun initialesDe(texte: String?, langue: String = "fr"): String =
    (texte ?: "").trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2).joinToString("") { it.take(1) }.uppercase(Locale.forLanguageTag(langue))

/** « il y a 3 jours », « il y a 2 heures », « à l’instant ». */
fun formaterDepuis(valeur: String?): String {
    if (valeur.isNullOrEmpty()) return ""
    val lue = try {
        if (valeur.length == 10) LocalDate.parse(valeur).atStartOfDay(ZoneId.systemDefault()) else ZonedDateTime.parse(valeur.replace(Regex("([+-]\\d\\d)(\\d\\d)$"), "$1:$2"))
    } catch (e: Exception) {
        null
    } ?: return ""
    val minutes = ChronoUnit.MINUTES.between(lue, ZonedDateTime.now())
    fun dire(n: Long, mot: String) = "il y a #{n} #{mot}" + if (n > 1 && !mot.endsWith("s")) "s" else ""
    return when {
        minutes < 1 -> "à l’instant"
        minutes < 60 -> dire(minutes, "minute")
        minutes < 1440 -> dire(minutes / 60, "heure")
        minutes < 43200 -> dire(minutes / 1440, "jour")
        minutes < 525600 -> dire(minutes / 43200, "mois")
        else -> dire(minutes / 525600, "an")
    }
}

private fun joindre(mots: List<String>, separateur: String) = mots.filter { it.isNotEmpty() }.joinToString(separateur)

/** Un nombre entier en lettres, dans la langue (comme src/cibles/format.ts) ; un nombre à virgule, trop grand ou en lingala reste en chiffres. */
fun formaterEnLettres(valeur: Double?, langue: String = "fr"): String {
    if (valeur == null || valeur.isNaN() || valeur.isInfinite()) return ""
    val limite = if (langue == "pt") 1e9 else 1e12
    if (valeur != Math.rint(valeur) || Math.abs(valeur) >= limite || langue !in listOf("fr", "en", "es", "pt", "sw")) return formaterNombre(valeur, langue)
    val n = Math.abs(valeur).toLong()
    val signe = if (valeur < 0) mapOf("en" to "minus ", "es" to "menos ", "pt" to "menos ", "sw" to "hasi ")[langue] ?: "moins " else ""
    val groupes = listOf((n / 1_000_000_000).toInt(), ((n / 1_000_000) % 1000).toInt(), ((n / 1000) % 1000).toInt(), (n % 1000).toInt())
    when (langue) {
        "en" -> {
            val u = listOf("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen")
            val d = listOf("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")
            fun deux(x: Int) = if (x < 20) u[x] else d[x / 10] + (if (x % 10 > 0) "-" + u[x % 10] else "")
            fun trois(x: Int) = joindre(listOf(if (x / 100 > 0) u[x / 100] + " hundred" else "", if (x % 100 > 0) deux(x % 100) else ""), " ")
            if (n == 0L) return u[0]
            val echelles = listOf(" billion", " million", " thousand", "")
            return signe + joindre(groupes.mapIndexed { i, g -> if (g > 0) trois(g) + echelles[i] else "" }, " ")
        }
        "es" -> {
            val u = listOf("cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve")
            val d = listOf("", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa")
            val c = listOf("", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos")
            fun deux(x: Int) = if (x < 30) u[x] else d[x / 10] + (if (x % 10 > 0) " y " + u[x % 10] else "")
            fun trois(x: Int) = if (x == 100) "cien" else joindre(listOf(c[x / 100], if (x % 100 > 0) deux(x % 100) else ""), " ")
            // Devant « mil » et « millones », « uno » s'écrit « un » (« veintiún mil »).
            fun court(mots: String) = when {
                mots.endsWith("veintiuno") -> mots.dropLast(9) + "veintiún"
                mots.endsWith("uno") -> mots.dropLast(3) + "un"
                else -> mots
            }
            fun sousLeMillion(x: Int, devant: Boolean): String {
                val m = x / 1000
                val r = x % 1000
                return joindre(listOf(if (m > 0) (if (m == 1) "mil" else court(trois(m)) + " mil") else "", if (r > 0) (if (devant) court(trois(r)) else trois(r)) else ""), " ")
            }
            if (n == 0L) return u[0]
            val millones = (n / 1_000_000).toInt()
            val reste = (n % 1_000_000).toInt()
            return signe + joindre(listOf(if (millones > 0) (if (millones == 1) "un millón" else sousLeMillion(millones, true) + " millones") else "", if (reste > 0) sousLeMillion(reste, false) else ""), " ")
        }
        "pt" -> {
            val u = listOf("zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezasseis", "dezassete", "dezoito", "dezanove")
            val d = listOf("", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa")
            val c = listOf("", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos")
            fun deux(x: Int) = if (x < 20) u[x] else d[x / 10] + (if (x % 10 > 0) " e " + u[x % 10] else "")
            fun trois(x: Int) = if (x == 100) "cem" else joindre(listOf(c[x / 100], if (x % 100 > 0) deux(x % 100) else ""), " e ")
            if (n == 0L) return u[0]
            val mots = listOf(
                groupes[1] to (if (groupes[1] == 1) "um milhão" else trois(groupes[1]) + " milhões"),
                groupes[2] to (if (groupes[2] == 1) "mil" else trois(groupes[2]) + " mil"),
                groupes[3] to trois(groupes[3]),
            ).filter { it.first > 0 }
            // « e » devant le dernier groupe s'il est plus petit que cent, ou un nombre rond de centaines : « mil e cem ».
            val texte = StringBuilder()
            mots.forEachIndexed { i, (g, mot) ->
                if (i > 0) texte.append(if (i == mots.size - 1 && (g < 100 || g % 100 == 0)) " e " else " ")
                texte.append(mot)
            }
            return signe + texte
        }
        "sw" -> {
            val u = listOf("sifuri", "moja", "mbili", "tatu", "nne", "tano", "sita", "saba", "nane", "tisa")
            val d = listOf("", "kumi", "ishirini", "thelathini", "arobaini", "hamsini", "sitini", "sabini", "themanini", "tisini")
            fun deux(x: Int) = if (x < 10) u[x] else d[x / 10] + (if (x % 10 > 0) " na " + u[x % 10] else "")
            fun trois(x: Int) = joindre(listOf(if (x / 100 > 0) "mia " + u[x / 100] else "", if (x % 100 > 0) deux(x % 100) else ""), " na ")
            if (n == 0L) return u[0]
            // Le nom de l'échelle vient d'abord : « elfu mbili » (deux mille), « milioni tatu ».
            val echelles = listOf("bilioni ", "milioni ", "elfu ", "")
            return signe + joindre(groupes.mapIndexed { i, g -> if (g > 0) echelles[i] + trois(g) else "" }, " na ")
        }
    }
    val u = listOf("zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf")
    val d = listOf("", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt")
    fun dizaines(x: Int): String {
        if (x < 20) return u[x]
        val dz = x / 10
        val un = x % 10
        if (dz == 7 || dz == 9) return d[dz] + (if (x == 71) " et " else "-") + u[x - (dz - 1) * 10]
        if (un == 0) return if (dz == 8) "quatre-vingts" else d[dz]
        if (un == 1 && dz != 8) return d[dz] + " et un"
        return d[dz] + "-" + u[un]
    }
    // « final » : devant « mille », ni « cents » ni « quatre-vingts » ne prennent de s.
    fun centaines(x: Int, final: Boolean): String {
        val c = x / 100
        val r = x % 100
        var fin = if (r == 0) "" else dizaines(r)
        if (!final && fin.endsWith("quatre-vingts")) fin = fin.dropLast(1)
        if (c == 0) return fin
        val tete = if (c == 1) "cent" else u[c] + " cent" + (if (r == 0 && final) "s" else "")
        return if (fin.isEmpty()) tete else "#{tete} #{fin}"
    }
    if (n == 0L) return u[0]
    val mots = mutableListOf<String>()
    if (groupes[0] > 0) mots.add(centaines(groupes[0], true) + " milliard" + (if (groupes[0] > 1) "s" else ""))
    if (groupes[1] > 0) mots.add(centaines(groupes[1], true) + " million" + (if (groupes[1] > 1) "s" else ""))
    if (groupes[2] > 0) mots.add(if (groupes[2] == 1) "mille" else centaines(groupes[2], false) + " mille")
    if (groupes[3] > 0) mots.add(centaines(groupes[3], true))
    return signe + mots.joinToString(" ")
}
`;
