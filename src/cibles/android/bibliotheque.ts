/**
 * La petite bibliothèque recopiée dans chaque projet Android : ce que Kotlin
 * et Compose ne donnent pas tout fait (une valeur souple, le format français,
 * les messages, la session). Ce n'est pas un framework : du Kotlin lisible,
 * que l'on peut lire et changer.
 *
 * Les gabarits Kotlin s'écrivent `#{…}` ici (un `${…}` serait lu par
 * TypeScript) : `kotlin()` les remet en `${…}`.
 */

/** Le paquet en tête du fichier, et les gabarits remis en Kotlin. */
export const kotlin = (paquet: string, code: string): string => code.replace(/#\{/g, '${').replace('package PAQUET', `package ${paquet}`);

export const VALEURS_KT = String.raw`// Produit par Humalis : les valeurs dont le type n'est connu qu'à l'exécution.
package PAQUET

import java.text.Collator
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

/**
 * Une valeur Humalis est un texte (String), un nombre (Double), vrai ou faux
 * (Boolean), une liste (List), une fiche ou une donnée du serveur (Map), ou
 * rien (null). Les listes et les fiches ne changent jamais sur place : on en
 * fait une nouvelle, et Compose voit le changement.
 */

/** Une erreur dite à la personne : le serveur a refusé, ou n'a pas répondu. */
class ErreurHumalis(val raison: String, val sansReseau: Boolean = false) : Exception(raison)

/** Un nombre écrit à la française (« 4,5 ») ou à l'anglaise ; 0 pour ce qui n'en est pas un. */
fun nombre(v: Any?): Double = when (v) {
    is Double -> v
    is Number -> v.toDouble()
    is String -> v.trim().replace(',', '.').toDoubleOrNull() ?: 0.0
    is Boolean -> if (v) 1.0 else 0.0
    else -> 0.0
}

/** Ce qui s'écrit dans un texte : « {x} ». */
fun texte(v: Any?): String = when (v) {
    null -> ""
    is String -> v
    is Number -> formaterNombre(v.toDouble())
    is Boolean -> if (v) "true" else "false"
    is List<*> -> v.joinToString(", ") { texte(it) }
    else -> ""
}

fun vrai(v: Any?): Boolean = when (v) {
    null -> false
    is Boolean -> v
    is Number -> v.toDouble() != 0.0
    is String -> v.isNotEmpty()
    else -> true
}

@Suppress("UNCHECKED_CAST")
fun liste(v: Any?): List<Any?> = (v as? List<Any?>) ?: emptyList()

/** « p.prix » : le champ d'une fiche ou d'une donnée ; rien si la valeur n'en a pas. */
fun champ(v: Any?, nom: String): Any? = (v as? Map<*, *>)?.get(nom)

fun fiche(vararg paires: Pair<String, Any?>): Map<String, Any?> = linkedMapOf(*paires)

/** « changer client.adresse.rue par … » : une nouvelle fiche, le reste gardé. */
fun avecChamp(v: Any?, chemin: List<String>, valeur: Any?): Any? {
    if (chemin.isEmpty()) return valeur
    val copie = LinkedHashMap<String, Any?>()
    (v as? Map<*, *>)?.forEach { (cle, x) -> copie[cle.toString()] = x }
    copie[chemin[0]] = avecChamp(copie[chemin[0]], chemin.drop(1), valeur)
    return copie
}

/** L'identifiant d'une donnée, dans une adresse : 12 et non « 12,0 ». */
fun identifiant(v: Any?): String = when (v) {
    is Number -> v.toDouble().let { if (it == Math.floor(it) && !it.isInfinite()) it.toLong().toString() else it.toString() }
    is Map<*, *> -> identifiant(v["id"])
    else -> texte(v)
}

/** « + » : deux nombres s'additionnent, un texte se met bout à bout. */
fun plus(a: Any?, b: Any?): Any? = if (a is String || b is String) texte(a) + texte(b) else nombre(a) + nombre(b)

fun egal(a: Any?, b: Any?): Boolean = when {
    a is Number && b is Number -> a.toDouble() == b.toDouble()
    (a is Number && b is String) || (a is String && b is Number) -> identifiant(a) == identifiant(b)
    else -> a == b
}

private val ordreFrancais: Collator = Collator.getInstance(Locale.FRENCH)

/** Deux textes dans l'ordre du dictionnaire ; sinon, deux nombres. */
fun comparer(a: Any?, b: Any?): Int =
    if (a is String && b is String) ordreFrancais.compare(a, b) else nombre(a).compareTo(nombre(b))

fun estVide(v: Any?): Boolean = when (v) {
    null -> true
    is String -> v.isEmpty()
    is List<*> -> v.isEmpty()
    is Map<*, *> -> v.isEmpty()
    else -> false
}

fun longueur(v: Any?): Double = when (v) {
    is List<*> -> v.size.toDouble()
    is String -> v.length.toDouble()
    else -> 0.0
}

/** Une liste qui contient la valeur, ou un texte qui contient l'autre ; une recherche vide trouve tout. */
fun contient(dans: Any?, cherche: Any?): Boolean =
    if (dans is List<*>) dans.any { egal(it, cherche) } else texte(cherche).isEmpty() || texte(dans).contains(texte(cherche))

fun somme(l: Any?): Double = liste(l).sumOf { nombre(it) }
fun moyenne(l: Any?): Double = liste(l).let { if (it.isEmpty()) 0.0 else somme(it) / it.size }
fun minimum(l: Any?): Double = liste(l).minOfOrNull { nombre(it) } ?: 0.0
fun maximum(l: Any?): Double = liste(l).maxOfOrNull { nombre(it) } ?: 0.0

fun arrondi(v: Any?, chiffres: Int = 0): Double {
    val facteur = Math.pow(10.0, chiffres.toDouble())
    return Math.round(nombre(v) * facteur) / facteur
}

/** « hasard entre 1 et 6 » : un entier, bornes comprises. */
fun hasard(min: Any?, max: Any?): Double {
    val bas = Math.round(nombre(min)).toInt()
    val haut = Math.round(nombre(max)).toInt()
    return if (bas <= haut) (bas..haut).random().toDouble() else nombre(min)
}

fun trier(l: Any?, champ: String?, decroissant: Boolean, parNombre: Boolean): List<Any?> {
    val cle: (Any?) -> Any? = { if (champ == null) it else champ(it, champ) }
    val ordre = Comparator<Any?> { a, b -> if (parNombre) nombre(cle(a)).compareTo(nombre(cle(b))) else ordreFrancais.compare(texte(cle(a)), texte(cle(b))) }
    return liste(l).sortedWith(if (decroissant) ordre.reversed() else ordre)
}

/** Les groupes { nom, elements }, dans l'ordre d'apparition. */
fun grouper(l: Any?, champ: String): List<Any?> {
    val groupes = LinkedHashMap<String, MutableList<Any?>>()
    for (element in liste(l)) groupes.getOrPut(texte(champ(element, champ))) { mutableListOf() }.add(element)
    return groupes.map { (nom, elements) -> fiche("nom" to nom, "elements" to elements.toList()) }
}

fun premier(l: Any?): Any? = liste(l).firstOrNull()
fun premiers(n: Any?, l: Any?): List<Any?> = liste(l).take(nombre(n).toInt().coerceAtLeast(0))
fun champs(l: Any?, nom: String): List<Any?> = liste(l).map { champ(it, nom) }

/** Retire la première valeur égale ; la liste reste la même si elle ne la contient pas. */
fun sansPremier(l: Any?, valeur: Any?): List<Any?> {
    val copie = liste(l).toMutableList()
    val i = copie.indexOfFirst { egal(it, valeur) }
    if (i >= 0) copie.removeAt(i)
    return copie
}

fun majuscules(v: Any?): String = texte(v).uppercase(Locale.FRENCH)
fun minuscules(v: Any?): String = texte(v).lowercase(Locale.FRENCH)
fun remplacer(cherche: Any?, remplace: Any?, dans: Any?): String =
    texte(cherche).let { if (it.isEmpty()) texte(dans) else texte(dans).replace(it, texte(remplace)) }

// ─── JSON ──────────────────────────────────────────────────────────────────

/** Un texte JSON en valeur Humalis ; rien s'il n'en est pas un. */
fun lireJson(texte: String): Any? = try {
    depuisJson(JSONTokener(texte).nextValue())
} catch (e: Exception) {
    null
}

fun depuisJson(v: Any?): Any? = when (v) {
    null, JSONObject.NULL -> null
    is JSONObject -> v.keys().asSequence().associateWith { depuisJson(v.opt(it)) }
    is JSONArray -> (0 until v.length()).map { depuisJson(v.opt(it)) }
    is Number -> v.toDouble()
    else -> v
}

fun versJson(v: Any?): String = enJson(v).let { if (it is String) JSONObject.quote(it) else it.toString() }

private fun enJson(v: Any?): Any = when (v) {
    null -> JSONObject.NULL
    is Map<*, *> -> JSONObject().also { o -> v.forEach { (cle, x) -> o.put(cle.toString(), enJson(x)) } }
    is List<*> -> JSONArray().also { a -> v.forEach { a.put(enJson(it)) } }
    is Double -> if (v == Math.floor(v) && !v.isInfinite() && Math.abs(v) < 1e15) v.toLong() else v
    else -> v
}
`;

export const INTERFACE_KT = String.raw`// Produit par Humalis : les messages, la confirmation, la ligne, la grille et les images.
package PAQUET

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.input.key.isAltPressed
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/** Le contexte de l'application, posé au démarrage : pour le presse-papiers, le partage et la mémoire. */
@SuppressLint("StaticFieldLeak")
object Appli {
    lateinit var contexte: Context
}

// ─── Les messages ──────────────────────────────────────────────────────────

class MessageHumalis(val texte: String, val genre: String, val duree: Long, val persistant: Boolean, val action: Pair<String, suspend () -> Unit>?)

object Messages {
    val enCours = mutableStateListOf<MessageHumalis>()

    fun afficher(texte: String, genre: String = "info", duree: Long = 4000, persistant: Boolean = false, action: Pair<String, suspend () -> Unit>? = null) {
        enCours.add(MessageHumalis(texte, genre, duree, persistant, action))
    }
}

/** Le dernier message, en bas de l'écran, lu par TalkBack ; il disparaît seul, sauf « sans disparaitre ». */
@Composable
fun MessagesHumalis(lancer: (suspend () -> Unit) -> Unit) {
    val message = Messages.enCours.lastOrNull() ?: return
    LaunchedEffect(message) {
        if (!message.persistant) {
            delay(message.duree)
            Messages.enCours.remove(message)
        }
    }
    val (fond, encre) = when (message.genre) {
        "erreur" -> Color(0xFFB3261E) to Color.White
        "reussite" -> Color(0xFF1B6E3A) to Color.White
        "avertissement" -> Color(0xFF8A5A00) to Color.White
        else -> Color(0xFF313033) to Color.White
    }
    Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.BottomCenter) {
        androidx.compose.foundation.layout.Row(
            Modifier.fillMaxWidth().background(fond, RoundedCornerShape(12.dp)).padding(horizontal = 16.dp, vertical = 12.dp).semantics { liveRegion = LiveRegionMode.Polite },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(message.texte, color = encre, modifier = Modifier.weight(1f))
            message.action?.let { (libelle, actions) ->
                TextButton(onClick = { Messages.enCours.remove(message); lancer(actions) }) { Text(libelle, color = encre) }
            }
            if (message.persistant) TextButton(onClick = { Messages.enCours.remove(message) }) { Text("Fermer", color = encre) }
        }
    }
}

// ─── La confirmation ───────────────────────────────────────────────────────

class QuestionHumalis(val question: String, val oui: String, val non: String, val reponse: CompletableDeferred<Boolean>)

object Confirmations {
    var enCours by mutableStateOf<QuestionHumalis?>(null)
}

/** « confirmer "…" : » : la question attend la réponse de la personne. */
suspend fun confirmer(question: String, oui: String, non: String): Boolean {
    val q = QuestionHumalis(question, oui, non, CompletableDeferred())
    Confirmations.enCours = q
    return try { q.reponse.await() } finally { if (Confirmations.enCours === q) Confirmations.enCours = null }
}

@Composable
fun ConfirmationHumalis() {
    val q = Confirmations.enCours ?: return
    AlertDialog(
        onDismissRequest = { q.reponse.complete(false) },
        text = { Text(q.question) },
        confirmButton = { TextButton(onClick = { q.reponse.complete(true) }) { Text(q.oui) } },
        dismissButton = { TextButton(onClick = { q.reponse.complete(false) }) { Text(q.non) } },
    )
}

// ─── Le système ────────────────────────────────────────────────────────────

fun copier(texte: String, message: String?) {
    val presse = Appli.contexte.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    presse.setPrimaryClip(ClipData.newPlainText("texte", texte))
    if (message != null) Messages.afficher(message, "reussite")
}

fun partager(texte: String, titre: String?) {
    val envoi = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, texte)
        if (titre != null) putExtra(Intent.EXTRA_SUBJECT, titre)
    }
    Appli.contexte.startActivity(Intent.createChooser(envoi, titre).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

/** Une adresse externe (https, mailto, tel) s'ouvre dans l'application du système ; les autres sont écartées. */
fun ouvrirExterne(adresse: String) {
    val propre = adresse.trim()
    if (!Regex("^(https?:|mailto:|tel:)", RegexOption.IGNORE_CASE).containsMatchIn(propre)) return
    try {
        Appli.contexte.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(propre)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: Exception) {
        Messages.afficher("Aucune application ne sait ouvrir cette adresse.", "erreur")
    }
}

// ─── La mise en page ───────────────────────────────────────────────────────

/** « ligne : » : les éléments côte à côte, qui passent à la ligne quand la place manque. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LigneHumalis(modifier: Modifier = Modifier, espacement: Dp = 12.dp, repartition: String = "debut", alignement: Alignment.Vertical = Alignment.CenterVertically, contenu: @Composable () -> Unit) {
    val horizontal = when (repartition) {
        "centree" -> Arrangement.spacedBy(espacement, Alignment.CenterHorizontally)
        "fin" -> Arrangement.spacedBy(espacement, Alignment.End)
        "entre", "espacee" -> Arrangement.SpaceBetween
        else -> Arrangement.spacedBy(espacement)
    }
    FlowRow(modifier, horizontalArrangement = horizontal, verticalArrangement = Arrangement.spacedBy(espacement), itemVerticalAlignment = alignement) { contenu() }
}

/** « grille : » : des colonnes de même largeur. */
@Composable
fun GrilleHumalis(colonnes: Int, modifier: Modifier = Modifier, espacement: Dp = 16.dp, contenu: @Composable () -> Unit) {
    Layout(contenu, modifier.fillMaxWidth()) { enfants, contraintes ->
        val n = colonnes.coerceAtLeast(1)
        val ecart = espacement.roundToPx()
        val largeur = ((contraintes.maxWidth - ecart * (n - 1)) / n).coerceAtLeast(0)
        val places = enfants.map { it.measure(Constraints(minWidth = largeur, maxWidth = largeur)) }
        val rangees = places.chunked(n)
        val hauteurs = rangees.map { r -> r.maxOf { it.height } }
        val total = hauteurs.sum() + ecart * (rangees.size - 1).coerceAtLeast(0)
        layout(contraintes.maxWidth, total) {
            var y = 0
            rangees.forEachIndexed { i, r ->
                r.forEachIndexed { j, p -> p.placeRelative(j * (largeur + ecart), y) }
                y += hauteurs[i] + ecart
            }
        }
    }
}

// ─── Les images ────────────────────────────────────────────────────────────

private val imagesLues = HashMap<String, Bitmap>()

private suspend fun chargerImage(source: String): Bitmap? = withContext(Dispatchers.IO) {
    imagesLues[source]?.let { return@withContext it }
    try {
        val octets: ByteArray = when {
            source.startsWith("http://") || source.startsWith("https://") -> {
                val connexion = URL(source).openConnection() as HttpURLConnection
                connexion.connectTimeout = 10000
                connexion.readTimeout = 15000
                connexion.inputStream.use { it.readBytes() }
            }
            // Une photo prise ou un fichier choisi, gardé par l'application.
            source.startsWith("file://") -> java.io.File(source.removePrefix("file://")).readBytes()
            source.startsWith("content://") -> Appli.contexte.contentResolver.openInputStream(Uri.parse(source))!!.use { it.readBytes() }
            // Une image écrite en texte : la signature, ou une image envoyée par le serveur.
            source.startsWith("data:") -> android.util.Base64.decode(source.substringAfter(","), android.util.Base64.DEFAULT)
            else -> Appli.contexte.assets.open(source).use { it.readBytes() }
        }
        // Une grande photo est réduite à la taille de l'écran : elle ne remplit pas la mémoire.
        val bornes = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(octets, 0, octets.size, bornes)
        var reduction = 1
        while (bornes.outWidth / (reduction * 2) >= 1600 || bornes.outHeight / (reduction * 2) >= 1600) reduction *= 2
        val image = BitmapFactory.decodeByteArray(octets, 0, octets.size, BitmapFactory.Options().apply { inSampleSize = reduction })
        image?.also { imagesLues[source] = it }
    } catch (e: Exception) {
        null
    }
}

/** Une image d'un fichier de l'application ou d'une adresse ; sans description, TalkBack l'ignore. */
@Composable
fun ImageHumalis(source: String, description: String?, modifier: Modifier = Modifier, remplir: Boolean = false) {
    val image by produceState<Bitmap?>(imagesLues[source], source) { value = chargerImage(source) }
    val lue = image
    if (lue == null) {
        Box(modifier.background(MaterialTheme.colorScheme.surfaceVariant))
        return
    }
    Image(lue.asImageBitmap(), description, modifier, contentScale = if (remplir) ContentScale.Crop else ContentScale.Fit)
}

// ─── Le clavier ────────────────────────────────────────────────────────────

/** « controle+maj+k » : vrai si la touche pressée est celle-là, avec ces modificateurs. Sur Android, « controle » est Ctrl (ou Meta). */
fun correspond(evenement: androidx.compose.ui.input.key.KeyEvent, touches: String): Boolean {
    if (evenement.type != androidx.compose.ui.input.key.KeyEventType.KeyDown) return false
    val morceaux = touches.lowercase().split("+")
    val touche = morceaux.last()
    val mods = morceaux.dropLast(1)
    val controle = mods.any { it in listOf("controle", "ctrl", "commande", "cmd") }
    val maj = mods.any { it in listOf("maj", "majuscule", "shift") }
    val alt = mods.any { it in listOf("alt", "option") }
    if ((evenement.isCtrlPressed || evenement.isMetaPressed) != controle || evenement.isShiftPressed != maj || evenement.isAltPressed != alt) return false
    val natif = evenement.nativeKeyEvent
    val code = when (touche) {
        "entree" -> android.view.KeyEvent.KEYCODE_ENTER
        "echap" -> android.view.KeyEvent.KEYCODE_ESCAPE
        "espace" -> android.view.KeyEvent.KEYCODE_SPACE
        "tab", "tabulation" -> android.view.KeyEvent.KEYCODE_TAB
        "haut" -> android.view.KeyEvent.KEYCODE_DPAD_UP
        "bas" -> android.view.KeyEvent.KEYCODE_DPAD_DOWN
        "gauche" -> android.view.KeyEvent.KEYCODE_DPAD_LEFT
        "droite" -> android.view.KeyEvent.KEYCODE_DPAD_RIGHT
        "retour" -> android.view.KeyEvent.KEYCODE_DEL
        "suppr" -> android.view.KeyEvent.KEYCODE_FORWARD_DEL
        else -> null
    }
    if (code != null) return natif.keyCode == code
    // Une lettre, un chiffre ou un signe (« / ») : le caractère que la touche écrit, sans les modificateurs.
    val ecrit = natif.getUnicodeChar(0)
    return ecrit != 0 && ecrit.toChar().lowercaseChar() == touche.firstOrNull()
}

// ─── L'état d'une requête ──────────────────────────────────────────────────

/** « produits est en chargement », « erreur de produits ». */
data class EtatRequete(val statut: String = "repos", val message: String = "")

/** Une variable « avec memorisee » : gardée sur l'appareil, relue au prochain lancement. */
class EtatMemorise(private val cle: String, depart: Any?, private val secret: Boolean = false) : MutableState<Any?> {
    private val etat = mutableStateOf(Memoire.lire(cle, depart, secret))
    override var value: Any?
        get() = etat.value
        set(v) {
            etat.value = v
            Memoire.ecrire(cle, v, secret)
        }
    override fun component1(): Any? = value
    override fun component2(): (Any?) -> Unit = { value = it }
}

/** Le clair et le sombre d'une couleur du thème. */
data class CouleurHumalis(val clair: Long, val sombre: Long) {
    @Composable
    fun lue(): Color = Color(if (Apparence.sombre()) sombre else clair)
}

/** Une liste de colonnes simple, pour le corps d'une page qui défile. */
@Composable
fun ColonneHumalis(modifier: Modifier = Modifier, espacement: Dp = 12.dp, alignement: Alignment.Horizontal = Alignment.Start, contenu: @Composable ColumnScope.() -> Unit) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(espacement), horizontalAlignment = alignement, content = contenu)
}
`;

export const MEMOIRE_KT = String.raw`// Produit par Humalis : ce que l'application garde sur l'appareil.
package PAQUET

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Les valeurs « avec memorisee », en JSON ; celles « en secret » passent par le coffre. */
object Memoire {
    private val preferences by lazy { Appli.contexte.getSharedPreferences("humalis.memoire", Context.MODE_PRIVATE) }

    fun lire(cle: String, depart: Any?, secret: Boolean = false): Any? {
        val texte = (if (secret) Coffre.lire(cle) else preferences.getString(cle, null)) ?: return depart
        return lireJson(texte) ?: depart
    }

    fun ecrire(cle: String, valeur: Any?, secret: Boolean = false) {
        if (secret) Coffre.ecrire(cle, versJson(valeur)) else preferences.edit().putString(cle, versJson(valeur)).apply()
    }
}

/** Un coffre : chaque valeur est chiffrée par une clé que le Keystore d'Android garde hors de l'application. */
object Coffre {
    private const val ALIAS = "humalis.coffre"
    private val preferences by lazy { Appli.contexte.getSharedPreferences("humalis.coffre", Context.MODE_PRIVATE) }

    private fun cle(): SecretKey {
        val magasin = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (magasin.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generateur = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generateur.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return generateur.generateKey()
    }

    fun ecrire(nom: String, valeur: String) {
        val chiffre = Cipher.getInstance("AES/GCM/NoPadding")
        chiffre.init(Cipher.ENCRYPT_MODE, cle())
        val donnees = chiffre.iv + chiffre.doFinal(valeur.toByteArray(Charsets.UTF_8))
        preferences.edit().putString(nom, Base64.encodeToString(donnees, Base64.NO_WRAP)).apply()
    }

    fun lire(nom: String): String? = try {
        val donnees = Base64.decode(preferences.getString(nom, null) ?: return null, Base64.NO_WRAP)
        val chiffre = Cipher.getInstance("AES/GCM/NoPadding")
        chiffre.init(Cipher.DECRYPT_MODE, cle(), GCMParameterSpec(128, donnees, 0, 12))
        String(chiffre.doFinal(donnees, 12, donnees.size - 12), Charsets.UTF_8)
    } catch (e: Exception) {
        null
    }

    fun effacer(nom: String) {
        preferences.edit().remove(nom).apply()
    }
}
`;

export const SERVEUR_KT = String.raw`// Produit par Humalis : les requêtes vers le serveur et les API, et la session.
package PAQUET

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

const val PAS_DE_REPONSE = "Le serveur n'a pas répondu."

/** La raison d'un échec : une phrase écrite pour la personne, jamais le texte anglais du système. */
fun raisonDe(erreur: Throwable): String = (erreur as? ErreurHumalis)?.raison ?: PAS_DE_REPONSE

/** Une API existante (« source "…" : »). Un jeton secret n'est jamais dans l'application. */
data class SourceHumalis(
    val nom: String,
    val adresse: String,
    val entetes: List<Pair<String, String>> = emptyList(),
    /** Un jeton public : « autorisation », ou le nom d'un en-tête ou d'un paramètre. */
    val jeton: String? = null,
    val placeJeton: String = "autorisation",
    val nomJeton: String = "",
    val enveloppe: String? = null,
    val erreurDans: String? = null,
    val session: Boolean = false,
    val essais: Int = 2,
    val delai: Int = 10000,
)

private class Reponse(val code: Int, val corps: String, val cookies: List<String>)

object Serveur {
    /** Le jeton CSRF posé par le serveur : un visiteur sans connexion le renvoie avec ses envois. */
    private var jetonCsrf: String? = null

    private fun retenirCsrf(r: Reponse) {
        for (c in r.cookies) {
            val debut = c.indexOf("astratra_csrf=")
            if (debut >= 0) c.substring(debut + 14).takeWhile { it != ';' && it != ',' }.takeIf { it.isNotEmpty() }?.let { jetonCsrf = it }
        }
    }

    private fun encoder(t: String) = URLEncoder.encode(t, "UTF-8").replace("+", "%20")

    private fun adresseComplete(adresse: String, id: String?, source: SourceHumalis?, filtres: List<Pair<String, String>>): String {
        val base = (source?.adresse ?: Configuration.SERVEUR).trimEnd('/')
        var chemin = if (adresse.startsWith("/")) adresse else "/" + adresse
        if (id != null) chemin = if (chemin.contains(":id")) chemin.replace(":id", encoder(id)) else chemin + "/" + encoder(id)
        val parametres = filtres.filter { it.second.isNotEmpty() }.toMutableList()
        if (source?.jeton != null && source.placeJeton == "parametre") parametres.add(source.nomJeton to source.jeton)
        val requete = parametres.joinToString("&") { encoder(it.first) + "=" + encoder(it.second) }
        return base + chemin + if (requete.isEmpty()) "" else (if (chemin.contains("?")) "&" else "?") + requete
    }

    /** Un appel brut, sans cache, hors du fil de l'écran. */
    private suspend fun lancer(adresse: String, methode: String, corps: String?, entetes: Map<String, String>, delai: Int): Reponse = withContext(Dispatchers.IO) {
        val connexion = URL(adresse).openConnection() as HttpURLConnection
        try {
            connexion.requestMethod = methode
            connexion.useCaches = false
            connexion.connectTimeout = delai
            connexion.readTimeout = delai
            connexion.instanceFollowRedirects = false
            entetes.forEach { (nom, valeur) -> connexion.setRequestProperty(nom, valeur) }
            if (corps != null) {
                connexion.doOutput = true
                connexion.setRequestProperty("Content-Type", "application/json")
                connexion.outputStream.use { it.write(corps.toByteArray(Charsets.UTF_8)) }
            }
            val code = connexion.responseCode
            val flux = if (code >= 400) connexion.errorStream else connexion.inputStream
            val texte = flux?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            Reponse(code, texte, connexion.headerFields["Set-Cookie"] ?: emptyList())
        } finally {
            connexion.disconnect()
        }
    }

    /** Les lectures sont rejouées après une coupure ; un envoi rejoué pourrait commander deux fois. */
    private suspend fun essayer(adresse: String, methode: String, corps: String?, entetes: Map<String, String>, source: SourceHumalis?): Reponse {
        val essais = if (methode == "GET") source?.essais ?: 0 else 0
        var tentative = 0
        while (true) {
            try {
                val r = lancer(adresse, methode, corps, entetes, source?.delai ?: 15000)
                if (tentative < essais && r.code in listOf(429, 502, 503, 504)) {
                    delay(if (tentative == 0) 500 else 1500)
                    tentative++
                    continue
                }
                return r
            } catch (e: IOException) {
                if (tentative < essais) {
                    delay(if (tentative == 0) 500 else 1500)
                    tentative++
                    continue
                }
                throw ErreurHumalis(PAS_DE_REPONSE, sansReseau = true)
            }
        }
    }

    private suspend fun envoyerRequete(adresse: String, methode: String, corps: String?, source: SourceHumalis?, cleEnvoi: String? = null): Reponse {
        val entetes = entetesDe(adresse, methode, source)
        // Le même numéro à chaque essai : le serveur ne fait le travail qu'une fois.
        if (cleEnvoi != null) entetes["X-Humalis-Envoi"] = cleEnvoi
        var r = essayer(adresse, methode, corps, entetes, source)
        if (r.code == 401 && (source == null || source.session) && Session.renouveler()) {
            Session.jeton?.let { entetes["Authorization"] = "Bearer " + it }
            r = essayer(adresse, methode, corps, entetes, source)
        }
        retenirCsrf(r)
        return r
    }

    /** Les en-têtes d'un appel : la session (ou le jeton CSRF d'un visiteur), et ceux de la source. */
    private suspend fun entetesDe(adresse: String, methode: String, source: SourceHumalis?): LinkedHashMap<String, String> {
        val entetes = linkedMapOf("Accept" to "application/json")
        val avecSession = source == null || source.session
        if (avecSession) entetes["x-humalis-mobile"] = "1"
        source?.entetes?.forEach { (nom, valeur) -> entetes[nom] = valeur }
        if (source?.jeton != null && source.placeJeton == "autorisation") entetes["Authorization"] = "Bearer " + source.jeton
        if (source?.jeton != null && source.placeJeton == "entete") entetes[source.nomJeton] = source.jeton
        val jeton = if (avecSession) Session.jeton else null
        if (jeton != null) entetes["Authorization"] = "Bearer " + jeton
        else if (avecSession && methode != "GET") {
            // Un visiteur : le serveur demande le jeton CSRF qu'il a posé à la première lecture.
            if (jetonCsrf == null) try { retenirCsrf(lancer(adresse, "GET", null, entetes, 10000)) } catch (e: IOException) { }
            jetonCsrf?.let {
                entetes["Cookie"] = "astratra_csrf=" + it
                entetes["x-csrf-token"] = it
            }
        }
        return entetes
    }

    /** « envoyer fichier … » : le fichier seul, ou un formulaire ; la progression va de 0 à 100. */
    suspend fun televerserOuEchouer(fichier: Any?, adresse: String, source: SourceHumalis? = null, corpsBrut: Boolean = false, champ: String = "fichier", progression: ((Double) -> Unit)? = null): Any? {
        val chemin = texte(champ(fichier, "chemin"))
        if (chemin.isEmpty()) throw ErreurHumalis("Choisissez d'abord un fichier.")
        val contenu = java.io.File(chemin)
        if (!contenu.exists()) throw ErreurHumalis("Le fichier n'a pas pu être lu.")
        val mime = texte(champ(fichier, "mime")).ifEmpty { "application/octet-stream" }
        val url = adresseComplete(adresse, null, source, emptyList())
        val entetes = entetesDe(url, "POST", source)
        val limite = "humalis-" + java.util.UUID.randomUUID()
        val debut = ("--#{limite}\r\nContent-Disposition: form-data; name=\"#{champ}\"; filename=\"" + texte(champ(fichier, "nom")) + "\"\r\nContent-Type: #{mime}\r\n\r\n").toByteArray()
        val fin = "\r\n--#{limite}--\r\n".toByteArray()
        progression?.invoke(0.0)
        val r = withContext(Dispatchers.IO) { envoyerOctets(url, entetes, contenu, mime, corpsBrut, limite, debut, fin, progression) }
        if (r.code !in 200..299) throw refus(r, source)
        progression?.invoke(100.0)
        return suivre(lireJson(r.corps), source?.enveloppe)
    }

    /** L'envoi lui-même, hors du fil de l'écran ; la progression est donnée à l'écran au fil de l'envoi. */
    private fun envoyerOctets(url: String, entetes: Map<String, String>, contenu: java.io.File, mime: String, corpsBrut: Boolean, limite: String, debut: ByteArray, fin: ByteArray, progression: ((Double) -> Unit)?): Reponse {
        val ecran = android.os.Handler(android.os.Looper.getMainLooper())
        val connexion: HttpURLConnection
        try {
            connexion = URL(url).openConnection() as HttpURLConnection
            connexion.requestMethod = "POST"
            connexion.doOutput = true
            connexion.connectTimeout = 15000
            connexion.readTimeout = 60000
            for ((nom, valeur) in entetes) connexion.setRequestProperty(nom, valeur)
            connexion.setRequestProperty("Content-Type", if (corpsBrut) mime else "multipart/form-data; boundary=#{limite}")
            val total = contenu.length() + if (corpsBrut) 0 else debut.size + fin.size
            connexion.setFixedLengthStreamingMode(total)
            val sortie = connexion.outputStream
            var envoye = 0L
            if (!corpsBrut) { sortie.write(debut); envoye += debut.size }
            val entree = contenu.inputStream()
            val tampon = ByteArray(64 * 1024)
            var lus = entree.read(tampon)
            while (lus >= 0) {
                sortie.write(tampon, 0, lus)
                envoye += lus
                val part = Math.floor(Math.min(99.0, envoye * 100.0 / total))
                if (progression != null) ecran.post { progression(part) }
                lus = entree.read(tampon)
            }
            entree.close()
            if (!corpsBrut) sortie.write(fin)
            sortie.close()
            val code = connexion.responseCode
            val flux = if (code >= 400) connexion.errorStream else connexion.inputStream
            val texteRecu = flux?.bufferedReader()?.readText() ?: ""
            connexion.disconnect()
            return Reponse(code, texteRecu, emptyList())
        } catch (e: IOException) {
            throw ErreurHumalis(PAS_DE_REPONSE)
        }
    }

    suspend fun televerser(fichier: Any?, adresse: String, source: SourceHumalis? = null, corpsBrut: Boolean = false, champ: String = "fichier", progression: ((Double) -> Unit)? = null): Any? = try {
        televerserOuEchouer(fichier, adresse, source, corpsBrut, champ, progression)
    } catch (e: ErreurHumalis) {
        Messages.afficher(e.raison, "erreur")
        null
    }

    /** « payer total pour commande » : le serveur prépare le paiement, qui s'ouvre dans le navigateur. */
    suspend fun payerOuEchouer(adresse: String, id: String) {
        val reponse = appel(adresse, "POST", fiche("retour" to "/"), id)
        val url = texte(champ(reponse, "url"))
        if (!url.startsWith("https://") && !url.startsWith("http://10.0.2.2")) throw ErreurHumalis("Le paiement n'a pas pu s'ouvrir.")
        ouvrirExterne(url)
    }

    suspend fun payer(adresse: String, id: String) {
        try { payerOuEchouer(adresse, id) } catch (e: ErreurHumalis) { Messages.afficher(e.raison, "erreur") }
    }

    /** « demander a ia » : la réponse arrive morceau par morceau, et s'écrit au fur et à mesure. */
    suspend fun demanderIaOuEchouer(question: String, recevoir: (String) -> Unit) {
        val url = adresseComplete("/auth/ia", null, null, emptyList())
        val entetes = entetesDe(url, "POST", null)
        entetes["Accept"] = "text/event-stream"
        val ecran = android.os.Handler(android.os.Looper.getMainLooper())
        val erreur = withContext(Dispatchers.IO) { lireFlux(url, entetes, versJson(fiche("question" to question))) { morceau -> ecran.post { recevoir(morceau) } } }
        if (erreur != null) throw erreur
    }

    /** Lit un flux d'événements (« data: {…} ») ; rend l'erreur à dire, ou rien. */
    private fun lireFlux(url: String, entetes: Map<String, String>, corps: String, morceau: (String) -> Unit): ErreurHumalis? {
        try {
            val connexion = URL(url).openConnection() as HttpURLConnection
            connexion.requestMethod = "POST"
            connexion.doOutput = true
            connexion.connectTimeout = 15000
            connexion.readTimeout = 300000
            for ((nom, valeur) in entetes) connexion.setRequestProperty(nom, valeur)
            connexion.setRequestProperty("Content-Type", "application/json")
            connexion.outputStream.use { it.write(corps.toByteArray(Charsets.UTF_8)) }
            val code = connexion.responseCode
            if (code !in 200..299) {
                val texteRecu = connexion.errorStream?.bufferedReader()?.readText() ?: ""
                connexion.disconnect()
                return refus(Reponse(code, texteRecu, emptyList()), null)
            }
            val lecteur = connexion.inputStream.bufferedReader(Charsets.UTF_8)
            var ligne = lecteur.readLine()
            while (ligne != null) {
                if (ligne.startsWith("data: ")) {
                    val lue = lireJson(ligne.substring(6))
                    val raison = texte(champ(lue, "erreur"))
                    if (raison.isNotEmpty()) return ErreurHumalis(raison)
                    morceau(texte(champ(lue, "t")))
                }
                ligne = lecteur.readLine()
            }
            connexion.disconnect()
            return null
        } catch (e: IOException) {
            return ErreurHumalis(PAS_DE_REPONSE)
        }
    }

    suspend fun demanderIa(question: String, recevoir: (String) -> Unit) {
        try { demanderIaOuEchouer(question, recevoir) } catch (e: ErreurHumalis) { Messages.afficher(e.raison, "erreur") }
    }

    /** « telecharger bon de commande de c » : le PDF arrive avec la session, puis s'ouvre. */
    suspend fun telechargerBonOuEchouer(adresse: String, id: String) {
        val url = adresseComplete(adresse.trimEnd('/') + "/" + id + "/bon", null, null, emptyList())
        val entetes = entetesDe(url, "GET", null)
        val fichier = withContext(Dispatchers.IO) {
            try {
                val connexion = URL(url).openConnection() as HttpURLConnection
                entetes.forEach { (nom, valeur) -> connexion.setRequestProperty(nom, valeur) }
                val code = connexion.responseCode
                if (code !in 200..299) {
                    val corps = connexion.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                    connexion.disconnect()
                    throw refus(Reponse(code, corps, emptyList()), null)
                }
                val sortie = java.io.File(java.io.File(Appli.contexte.cacheDir, "humalis").apply { mkdirs() }, "bon-#{id}.pdf")
                connexion.inputStream.use { entree -> sortie.outputStream().use { entree.copyTo(it) } }
                connexion.disconnect()
                sortie
            } catch (e: IOException) {
                throw ErreurHumalis(PAS_DE_REPONSE)
            }
        }
        montrerFichier(fichier, "application/pdf")
    }

    suspend fun telechargerBon(adresse: String, id: String) {
        try { telechargerBonOuEchouer(adresse, id) } catch (e: ErreurHumalis) { Messages.afficher(e.raison, "erreur") }
    }

    private fun suivre(depart: Any?, chemin: String?): Any? =
        (chemin ?: "").split('.').filter { it.isNotEmpty() }.fold(depart) { v, cle -> champ(v, cle) }

    private fun refus(r: Reponse, source: SourceHumalis?): ErreurHumalis {
        if (source != null && r.code == 429) return ErreurHumalis("Trop de demandes en peu de temps. Patientez un moment, puis réessayez.")
        if (source != null && r.code == 401) return ErreurHumalis("Connectez-vous pour continuer.")
        var t = texte(suivre(lireJson(r.corps), source?.erreurDans ?: "erreur"))
        if (source != null && r.code == 404 && t.isEmpty()) return ErreurHumalis("Ce que vous cherchez n'existe pas.")
        if (t.isEmpty() || (source != null && r.code >= 500)) return ErreurHumalis(PAS_DE_REPONSE)
        t = t.substring(0, 1).uppercase() + t.substring(1)
        return ErreurHumalis(if (t.endsWith(".")) t else "#{t}.")
    }

    /** Un appel qui lève son erreur ; rien pour une réponse vide ou un élément qui n'existe plus. */
    suspend fun appel(
        adresse: String,
        methode: String? = null,
        envoi: Map<String, Any?>? = null,
        id: String? = null,
        source: SourceHumalis? = null,
        filtres: List<Pair<String, String>> = emptyList(),
        dans: String? = null,
        suivi: ((EtatRequete) -> Unit)? = null,
        cleEnvoi: String? = null,
    ): Any? {
        suivi?.invoke(EtatRequete("chargement"))
        try {
            val verbe = methode ?: if (envoi != null) "POST" else "GET"
            val r = envoyerRequete(adresseComplete(adresse, id, source, filtres), verbe, envoi?.let { versJson(it) }, source, cleEnvoi)
            // Le premier essai de cet envoi tourne encore sur le serveur : on réessaiera.
            if (r.code == 409 && cleEnvoi != null) throw ErreurHumalis(PAS_DE_REPONSE, sansReseau = true)
            if (r.code == 404 && verbe == "GET" && source == null) {
                suivi?.invoke(EtatRequete("introuvable"))
                return null
            }
            if (r.code == 401 && (source == null || source.session)) throw ErreurHumalis("Connectez-vous pour continuer.")
            if (r.code !in 200..299) {
                val erreur = refus(r, source)
                if (r.code == 404 && suivi != null) {
                    suivi(EtatRequete("introuvable", erreur.raison))
                    return null
                }
                throw erreur
            }
            suivi?.invoke(EtatRequete())
            if (r.corps.isBlank()) return null
            return suivre(suivre(lireJson(r.corps), source?.enveloppe), dans)
        } catch (e: ErreurHumalis) {
            suivi?.invoke(EtatRequete("erreur", e.raison))
            throw e
        }
    }

    /** Une lecture ou un envoi : en cas d'échec, un message s'affiche et rien ne change. */
    suspend fun lire(
        adresse: String,
        methode: String? = null,
        envoi: Map<String, Any?>? = null,
        id: String? = null,
        source: SourceHumalis? = null,
        filtres: List<Pair<String, String>> = emptyList(),
        dans: String? = null,
        suivi: ((EtatRequete) -> Unit)? = null,
        horsLigne: Boolean = false,
    ): Any? = try {
        appel(adresse, methode, envoi, id, source, filtres, dans, suivi)
    } catch (e: ErreurHumalis) {
        // Sans réseau, une variable « hors ligne » montre simplement ce qu'elle a gardé.
        // La page parle de l'état de la variable : elle montre l'erreur elle-même.
        if (suivi == null && !(horsLigne && e.sansReseau)) Messages.afficher(e.raison, "erreur")
        null
    }

    /** Le code de la réponse d'un envoi, sans lire son corps ; une coupure lève l'erreur habituelle. */
    suspend fun statut(adresse: String, methode: String, envoi: Map<String, Any?>): Int =
        envoyerRequete(adresseComplete(adresse, null, null, emptyList()), methode, versJson(envoi), null).code

    /** Vrai si l'appel a réussi ; sinon, le message est affiché. */
    suspend fun appelReussi(
        adresse: String,
        methode: String? = null,
        envoi: Map<String, Any?>? = null,
        id: String? = null,
        source: SourceHumalis? = null,
        filtres: List<Pair<String, String>> = emptyList(),
        dans: String? = null,
        suivi: ((EtatRequete) -> Unit)? = null,
    ): Boolean = try {
        appel(adresse, methode, envoi, id, source, filtres, dans, suivi)
        true
    } catch (e: ErreurHumalis) {
        Messages.afficher(e.raison, "erreur")
        false
    }
}

/** La personne connectée, lue sur /auth/me ; le jeton d'accès et son renouvellement sont gardés au coffre. */
object Session {
    private const val CLE_JETON = "humalis.jeton"
    private const val CLE_RENOUVELLEMENT = "humalis.renouvellement"
    private const val CLE_COMPTE = "humalis.compte"
    private val portee = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    var personne by mutableStateOf<Map<*, *>?>(null)
        private set
    /** Vrai dès que /auth/me a répondu : avant, la page ne sait pas encore qui est là. */
    var pret by mutableStateOf(false)
        private set
    private var demande: Deferred<Unit>? = null
    private var renouvellement: Deferred<Boolean>? = null

    val connecte: Boolean get() { demander(); return personne != null }
    val admin: Boolean get() { demander(); return texte(personne?.get("role")) == "admin" }

    /** « si utilisateur est gerant » : un admin passe toujours. */
    fun aRole(vararg roles: String): Boolean {
        demander()
        val role = texte(personne?.get("role"))
        return personne != null && (role == "admin" || role in roles)
    }

    val jeton: String? get() = Coffre.lire(CLE_JETON)

    private fun garder(corps: Any?) {
        (champ(corps, "token") as? String)?.let { Coffre.ecrire(CLE_JETON, it) }
        (champ(corps, "refreshToken") as? String)?.let { Coffre.ecrire(CLE_RENOUVELLEMENT, it) }
    }

    private fun oublier() {
        Coffre.effacer(CLE_JETON)
        Coffre.effacer(CLE_RENOUVELLEMENT)
    }

    private fun demander() {
        if (demande == null) demande = portee.async { relire() }
    }

    suspend fun attendre() {
        demander()
        demande?.await()
    }

    private suspend fun brut(chemin: String, methode: String, corps: Map<String, Any?>? = null): Pair<Int, Any?>? = withContext(Dispatchers.IO) {
        try {
            val connexion = URL(Configuration.SERVEUR.trimEnd('/') + chemin).openConnection() as HttpURLConnection
            connexion.requestMethod = methode
            connexion.useCaches = false
            connexion.connectTimeout = 10000
            connexion.readTimeout = 15000
            connexion.setRequestProperty("Accept", "application/json")
            connexion.setRequestProperty("x-humalis-mobile", "1")
            jeton?.let { connexion.setRequestProperty("Authorization", "Bearer " + it) }
            if (corps != null) {
                connexion.doOutput = true
                connexion.setRequestProperty("Content-Type", "application/json")
                connexion.outputStream.use { it.write(versJson(corps).toByteArray(Charsets.UTF_8)) }
            }
            val code = connexion.responseCode
            val flux = if (code >= 400) connexion.errorStream else connexion.inputStream
            val texte = flux?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            connexion.disconnect()
            code to lireJson(texte)
        } catch (e: IOException) {
            null
        }
    }

    private suspend fun relire() {
        val r = brut("/auth/me", "GET")
        if (r?.first == 401 && renouveler()) return relire()
        val lue = champ(r?.second, "data") as? Map<*, *>
        personne = if (lue?.get("id") != null) lue else null
        // Le compte reconnu reste connu de l'appareil, même sans réseau : ses envois gardés lui appartiennent.
        if (r != null) {
            if (personne != null) Coffre.ecrire(CLE_COMPTE, identifiant(personne?.get("id"))) else if (r.first == 401 || r.first in 200..299) Coffre.effacer(CLE_COMPTE)
        }
        pret = true
        if (personne != null) quandCompteConnu?.invoke()
    }

    /** L'identifiant du compte de la personne, gardé sur l'appareil ; rien pour un visiteur. */
    val compteGarde: String? get() = Coffre.lire(CLE_COMPTE)

    /** Appelée quand une personne est reconnue : ce qui attendait pour elle peut partir. */
    var quandCompteConnu: (() -> Unit)? = null

    /** Le jeton d'accès dure peu ; celui de renouvellement en donne un autre. Plusieurs refus, un seul renouvellement. */
    suspend fun renouveler(): Boolean {
        renouvellement?.let { return it.await() }
        val tache = portee.async {
            try {
                val jetonRenouvellement = Coffre.lire(CLE_RENOUVELLEMENT) ?: return@async false
                val r = brut("/auth/refresh", "POST", fiche("refreshToken" to jetonRenouvellement)) ?: return@async false
                if (r.first !in 200..299) {
                    // Une coupure ou une limite ne ferme pas la session ; un refus, si.
                    if (r.first in listOf(400, 401, 403)) {
                        val etaitConnecte = personne != null
                        oublier()
                        personne = null
                        if (etaitConnecte) Messages.afficher("Votre session a expiré. Connectez-vous de nouveau.", "avertissement")
                    }
                    return@async false
                }
                garder(champ(r.second, "data"))
                true
            } finally {
                renouvellement = null
            }
        }
        renouvellement = tache
        return tache.await()
    }

    suspend fun seConnecter(email: String, motDePasse: String) {
        val r = brut("/auth/login", "POST", fiche("email" to email, "password" to motDePasse)) ?: throw ErreurHumalis(PAS_DE_REPONSE)
        if (r.first == 429) throw ErreurHumalis("Trop de tentatives de connexion. Réessayez dans quelques minutes.")
        // Jamais lequel des deux est faux : on ne dit pas si un compte existe.
        if (r.first !in 200..299) throw ErreurHumalis("Email ou mot de passe incorrect.")
        garder(champ(r.second, "data"))
        relire()
    }

    suspend fun changerMotDePasse(actuel: String, nouveau: String) {
        val r = brut("/auth/mot-de-passe", "POST", fiche("actuel" to actuel, "nouveau" to nouveau)) ?: throw ErreurHumalis(PAS_DE_REPONSE)
        if (r.first == 429) throw ErreurHumalis("Trop de tentatives. Réessayez dans quelques minutes.")
        if (r.first !in 200..299) {
            val raison = texte(champ(r.second, "erreur")).ifEmpty { "le mot de passe n'a pas été changé" }
            throw ErreurHumalis(raison.substring(0, 1).uppercase() + raison.substring(1).removeSuffix(".") + ".")
        }
    }

    suspend fun demanderLienMotDePasse(email: String) {
        Serveur.appel("/auth/forgot-password", "POST", fiche("email" to email))
    }

    /** Le jeton d'un lien reçu par e-mail (« #jeton=… »), pour choisir son mot de passe. */
    var jetonDeLien: String? = null

    suspend fun choisirMotDePasse(nouveau: String) {
        val lien = jetonDeLien ?: throw ErreurHumalis("Ouvrez le lien reçu par e-mail pour choisir votre mot de passe.")
        val code = Serveur.statut("/auth/reset-password", "POST", fiche("token" to lien, "password" to nouveau))
        if (code == 429) throw ErreurHumalis("Trop de tentatives. Réessayez dans quelques minutes.")
        if (code !in 200..299) throw ErreurHumalis("Ce lien n'est plus valable. Demandez-en un nouveau.")
        jetonDeLien = null
    }

    /** « inviter … comme … » : un lien part par e-mail ; le compte attend que la personne choisisse son mot de passe. */
    suspend fun inviter(email: String, role: String, groupes: Map<String, Any?> = emptyMap(), champs: Map<String, Any?> = emptyMap()) {
        val envoi = linkedMapOf<String, Any?>("email" to email, "role" to role)
        if (groupes.isNotEmpty()) envoi["groupes"] = groupes
        if (champs.isNotEmpty()) envoi["champs"] = champs
        Serveur.appel("/auth/invitations", "POST", envoi)
    }

    /** Un jeton d'identité (Google, Apple) : le serveur le vérifie et ouvre la session d'un compte déjà connu. */
    suspend fun ouvrirAvecJeton(chemin: String, jeton: String, nonce: String) {
        val corps = Serveur.appel(chemin, "POST", fiche("idToken" to jeton, "nonce" to nonce))
        garder(if (texte(champ(corps, "token")).isEmpty()) champ(corps, "data") else corps)
        relire()
    }

    suspend fun seDeconnecter() {
        brut("/auth/logout", "POST", fiche())
        oublier()
        relire()
    }

    /** Une action sur le compte : refusée, le message s'affiche ; vrai si elle a réussi. */
    suspend fun afficherSiRefus(action: suspend () -> Unit): Boolean = try {
        action()
        true
    } catch (e: ErreurHumalis) {
        Messages.afficher(if (e.raison == PAS_DE_REPONSE) "Le serveur n'a pas répondu. Réessayez dans un instant." else e.raison, "erreur")
        false
    }

    fun lancer(action: suspend () -> Unit) {
        portee.launch { action() }
    }
}
`;

export const LANGUES_KT = String.raw`// Produit par Humalis : la langue choisie par la personne, gardée par son appareil.
package PAQUET

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import java.util.Locale

object Langues {
    /** Les langues du site, la langue de base en premier : son code et son nom écrit dans cette langue. */
    val disponibles: List<Pair<String, String>> = LANGUES_DU_SITE

    private var gardee by EtatMemorise("humalis.langue", null)

    /** Celle choisie, sinon celle de l'appareil si le site l'a, sinon la langue de base. */
    val code: String
        get() {
            val choisie = gardee as? String
            if (choisie != null && disponibles.any { it.first == choisie }) return choisie
            val appareil = Locale.getDefault().language
            return if (disponibles.any { it.first == appareil }) appareil else disponibles[0].first
        }

    fun changer(nouvelle: String) {
        gardee = nouvelle
    }
}

/** Le texte dans la langue choisie, sinon dans la langue de base du site. */
fun t(versions: Map<String, String>): String =
    versions[Langues.code] ?: versions[Langues.disponibles[0].first] ?: versions.values.firstOrNull() ?: ""

/** « selecteur de langue » : un bouton par langue, celle choisie est cochée. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SelecteurLangueHumalis(modifier: Modifier = Modifier) {
    SingleChoiceSegmentedButtonRow(modifier) {
        Langues.disponibles.forEachIndexed { i, (code, nom) ->
            SegmentedButton(
                selected = Langues.code == code,
                onClick = { Langues.changer(code) },
                shape = SegmentedButtonDefaults.itemShape(i, Langues.disponibles.size),
                label = { Text(nom) },
            )
        }
    }
}
`;

/**
 * Avec des langues : les messages de Humalis écrits dans la bibliothèque
 * (« Le serveur n'a pas répondu. ») passent par t(), dans chaque langue du site.
 */
export function traduireMessagesKotlin(code: string, codes: string[], messages: { fr: string; versions: Record<string, string> }[]): string {
  let resultat = code;
  for (const m of messages) {
    if (m.fr.includes('${')) continue;
    const litteral = `"${m.fr.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
    if (!resultat.includes(litteral)) continue;
    const traduit = `t(mapOf(${codes.map((c) => `"${c}" to "${(m.versions[c] ?? m.fr).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`).join(', ')}))`;
    // Une constante (« const val ») ne peut pas appeler t() : elle devient une propriété relue à chaque fois.
    resultat = resultat.split(`const val PAS_DE_REPONSE = ${litteral}`).join(`val PAS_DE_REPONSE: String get() = ${traduit}`);
    resultat = resultat.split(litteral).join(traduit);
  }
  return resultat;
}
