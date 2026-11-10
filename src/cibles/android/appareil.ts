/**
 * Les fonctions de l'appareil sur Android : la photo, le scanner, la position,
 * l'empreinte (ou le code de l'appareil), la vibration et la signature.
 * Chaque demande au système attend sa réponse sans bloquer l'écran. Les
 * gabarits Kotlin s'écrivent `#{…}` : `kotlin()` les remet en `${…}`.
 */

/** Ce qui sert à toutes les demandes au système : l'activité, et une réponse attendue. */
export const SYSTEME_KT = String.raw`// Produit par Humalis : les demandes au système (photo, fichiers, permissions), attendues sans bloquer l'écran.
package PAQUET

import android.annotation.SuppressLint
import androidx.activity.result.contract.ActivityResultContract
import androidx.fragment.app.FragmentActivity
import java.util.concurrent.atomic.AtomicInteger
import android.content.pm.PackageManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Une permission du système : déjà donnée, ou demandée à la personne. */
suspend fun permission(vararg noms: String): Boolean {
    if (noms.any { ContextCompat.checkSelfPermission(Appli.contexte, it) == PackageManager.PERMISSION_GRANTED }) return true
    val reponses = Activite.demander(ActivityResultContracts.RequestMultiplePermissions(), arrayOf(*noms)) ?: return false
    return reponses.values.any { it }
}

/** L'activité de l'application : le système lui répond (photo prise, fichier choisi, permission donnée). */
@SuppressLint("StaticFieldLeak")
object Activite {
    var courante: FragmentActivity? = null
    private val numero = AtomicInteger()

    /** Demande quelque chose au système et attend sa réponse ; rien si l'application n'est pas au premier plan. */
    suspend fun <E, S> demander(contrat: ActivityResultContract<E, S>, entree: E): S? = withContext(Dispatchers.Main) {
        val activite = courante ?: return@withContext null
        val reponse = CompletableDeferred<S>()
        val lanceur = activite.activityResultRegistry.register("humalis-" + numero.incrementAndGet(), contrat) { reponse.complete(it) }
        try {
            lanceur.launch(entree)
            reponse.await()
        } finally {
            lanceur.unregister()
        }
    }
}
`;

export const APPAREIL_KT = String.raw`// Produit par Humalis : la photo, le scanner, la position, l'empreinte, la vibration et la signature.
package PAQUET

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Base64
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.location.LocationManagerCompat
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/** « vibrer » : une courte vibration. */
@SuppressLint("MissingPermission")
fun vibrer() {
    val vibreur = if (Build.VERSION.SDK_INT >= 31) (Appli.contexte.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    else @Suppress("DEPRECATION") (Appli.contexte.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator)
    vibreur.vibrate(VibrationEffect.createOneShot(80, VibrationEffect.DEFAULT_AMPLITUDE))
}

/** « photo dans cliche » : l'appareil photo du système ; un fichier, comme « fichier … dans ». */
suspend fun prendrePhoto(): Map<String, Any?>? {
    val dossier = File(Appli.contexte.cacheDir, "humalis").apply { mkdirs() }
    val fichier = File(dossier, "photo-" + UUID.randomUUID() + ".jpg")
    val adresse = FileProvider.getUriForFile(Appli.contexte, Appli.contexte.packageName + ".fichiers", fichier)
    // Certains appareils photo répondent « annulé » alors qu'ils ont écrit la photo : c'est le fichier qui fait foi.
    Activite.demander(ActivityResultContracts.TakePicture(), adresse)
    if (!fichier.exists() || fichier.length() == 0L) return null
    return fiche("nom" to fichier.name, "taille" to fichier.length().toDouble(), "type" to "image", "apercu" to "file://" + fichier.absolutePath, "mime" to "image/jpeg", "chemin" to fichier.absolutePath)
}

/** « position dans lieu » : demandée une fois ; latitude, longitude et précision en mètres. */
@SuppressLint("MissingPermission")
suspend fun lirePosition(): Map<String, Any?>? {
    if (!permission(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) {
        Messages.afficher("La position n'est pas permise : autorisez-la dans les réglages de l'appareil.", "erreur")
        return null
    }
    val gestionnaire = Appli.contexte.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val fournisseur = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).firstOrNull { gestionnaire.isProviderEnabled(it) }
    if (fournisseur == null) {
        Messages.afficher("La position de l'appareil est désactivée.", "erreur")
        return null
    }
    val lue: Location? = suspendCancellableCoroutine { suite ->
        LocationManagerCompat.getCurrentLocation(gestionnaire, fournisseur, android.os.CancellationSignal(), Executors.newSingleThreadExecutor()) { lue: Location? -> if (suite.isActive) suite.resume(lue) }
    } ?: gestionnaire.getLastKnownLocation(fournisseur)
    if (lue == null) {
        Messages.afficher("La position n'a pas pu être lue. Réessayez dehors ou près d'une fenêtre.", "erreur")
        return null
    }
    return fiche("latitude" to lue.latitude, "longitude" to lue.longitude, "precision" to lue.accuracy.toDouble())
}

/** « verifier identite » : l'empreinte, le visage ou le code de l'appareil ; vrai si c'est bien la personne. */
suspend fun verifierIdentite(raison: String = "Confirmez que c'est bien vous"): Boolean {
    val activite = Activite.courante ?: return false
    val permis = BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
    if (BiometricManager.from(activite).canAuthenticate(permis) != BiometricManager.BIOMETRIC_SUCCESS) {
        Messages.afficher("Cet appareil n'a ni empreinte, ni visage, ni code : la vérification est impossible.", "erreur")
        return false
    }
    return suspendCancellableCoroutine { suite ->
        val invite = BiometricPrompt(activite, ContextCompat.getMainExecutor(activite), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(resultat: BiometricPrompt.AuthenticationResult) { if (suite.isActive) suite.resume(true) }
            override fun onAuthenticationError(code: Int, message: CharSequence) { if (suite.isActive) suite.resume(false) }
        })
        invite.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle(raison).setAllowedAuthenticators(permis).build())
    }
}

/** « signature dans trace » : la personne signe du doigt ; la variable reçoit l'image, en PNG écrit en texte. */
@Composable
fun SignatureHumalis(trace: Any?, changer: (Any?) -> Unit, modifier: Modifier = Modifier) {
    val traits = remember { mutableStateListOf<List<Offset>>() }
    val enCours = remember { mutableStateListOf<Offset>() }
    val taille = remember { arrayOf(IntSize.Zero) }
    val encre = MaterialTheme.colorScheme.onSurface
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Canvas(
            Modifier.fillMaxWidth().height(180.dp)
                .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))
                .onSizeChanged { taille[0] = it }
                .semantics { contentDescription = if (texte(trace).isEmpty()) "Zone de signature, vide" else "Zone de signature, signée" }
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { enCours.clear(); enCours.add(it) },
                        onDrag = { change, _ -> enCours.add(change.position) },
                        onDragEnd = {
                            traits.add(enCours.toList())
                            enCours.clear()
                            changer(imageDeSignature(traits, taille[0]))
                        },
                    )
                },
        ) {
            for (trait in traits + listOf(enCours.toList())) {
                if (trait.size < 2) continue
                val chemin = Path().apply { moveTo(trait[0].x, trait[0].y); trait.drop(1).forEach { lineTo(it.x, it.y) } }
                drawPath(chemin, encre, style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
        }
        if (traits.isNotEmpty()) TextButton(onClick = { traits.clear(); changer("") }) { Text("Effacer") }
    }
}

/** Les traits, dessinés en noir sur blanc dans un PNG : « data:image/png;base64,… ». */
private fun imageDeSignature(traits: List<List<Offset>>, taille: IntSize): String {
    if (taille.width <= 0 || taille.height <= 0) return ""
    val image = Bitmap.createBitmap(taille.width, taille.height, Bitmap.Config.ARGB_8888)
    val toile = android.graphics.Canvas(image)
    toile.drawColor(android.graphics.Color.WHITE)
    val pinceau = android.graphics.Paint().apply { color = android.graphics.Color.BLACK; strokeWidth = 6f; style = android.graphics.Paint.Style.STROKE; strokeCap = android.graphics.Paint.Cap.ROUND; isAntiAlias = true }
    for (trait in traits) for (i in 1 until trait.size) toile.drawLine(trait[i - 1].x, trait[i - 1].y, trait[i].x, trait[i].y, pinceau)
    val sortie = ByteArrayOutputStream()
    image.compress(Bitmap.CompressFormat.PNG, 100, sortie)
    return "data:image/png;base64," + Base64.encodeToString(sortie.toByteArray(), Base64.NO_WRAP)
}

`;

/** Le fournisseur de fichiers : la photo prise par l'appareil s'écrit dans le cache de l'application. */
export const CHEMINS_FICHIERS = `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis. -->
<paths>
    <cache-path name="humalis" path="humalis/" />
</paths>
`;

export const SCANNER_KT = String.raw`// Produit par Humalis : le scanner de codes QR et de codes-barres (ZXing).
package PAQUET

/** « scanner code dans valeur » : l'appareil photo lit un code QR ou un code-barres. */
suspend fun scannerCode(): String? {
    val options = com.journeyapps.barcodescanner.ScanOptions()
        .setPrompt("Placez le code dans le cadre")
        .setBeepEnabled(false)
        .setOrientationLocked(false)
    val lu = Activite.demander(com.journeyapps.barcodescanner.ScanContract(), options) ?: return null
    return lu.contents
}
`;

export const FICHIERS_KT = String.raw`// Produit par Humalis : choisir un fichier, l'envoyer avec sa progression, télécharger un bon ou un CSV.
package PAQUET

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val MOTS_DES_FAMILLES = mapOf("images" to "image", "audio" to "audio", "videos" to "video", "pdf" to "pdf", "documents" to "document")
private val REFUS_DES_FAMILLES = mapOf("images" to "une image", "audio" to "un son", "videos" to "une vidéo", "pdf" to "un PDF", "documents" to "un document")

private fun ecrireTaille(octets: Double) = formaterTaille(octets, if (octets >= 1048576) "Mo" else "Ko")

/** Un fichier choisi, copié dans l'application : ce que la page peut lire (nom, taille, type, apercu). */
private fun recevoir(adresse: Uri, familles: List<Pair<String, List<String>>>, maximum: Double?, apercu: Boolean, seul: Boolean, refus: MutableList<String>): Map<String, Any?>? {
    val resolveur = Appli.contexte.contentResolver
    var nom = "fichier"
    resolveur.query(adresse, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) nom = it.getString(0) ?: nom }
    val sujet = if (seul) "Ce fichier" else nom
    val mime = resolveur.getType(adresse) ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(nom.substringAfterLast('.', "").lowercase()) ?: "application/octet-stream"
    val famille = familles.firstOrNull { (_, types) -> types.any { it == mime || (it.endsWith("/*") && mime.startsWith(it.dropLast(1))) } }
    if (familles.isNotEmpty() && famille == null) {
        refus.add("#{sujet} n'est pas " + familles.mapNotNull { REFUS_DES_FAMILLES[it.first] }.joinToString(" ni ") + ".")
        return null
    }
    val dossier = File(Appli.contexte.cacheDir, "humalis").apply { mkdirs() }
    val copie = File(dossier, UUID.randomUUID().toString() + "-" + nom.replace(Regex("[^A-Za-z0-9._-]"), "_"))
    try {
        resolveur.openInputStream(adresse)!!.use { entree -> copie.outputStream().use { entree.copyTo(it) } }
    } catch (e: Exception) {
        refus.add("#{sujet} n'a pas pu être lu.")
        return null
    }
    val taille = copie.length().toDouble()
    if (maximum != null && taille > maximum) {
        copie.delete()
        refus.add("#{sujet} est trop gros : #{ecrireTaille(taille)}, le maximum est #{ecrireTaille(maximum)}.")
        return null
    }
    val visible = apercu && (mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/"))
    val type = famille?.let { MOTS_DES_FAMILLES[it.first] } ?: if (mime.startsWith("image/")) "image" else "fichier"
    return fiche("nom" to nom, "taille" to taille, "type" to type, "apercu" to (if (visible) "file://" + copie.absolutePath else null), "mime" to mime, "chemin" to copie.absolutePath)
}

/** « fichier "Choisir" dans photo accepte images avec maximum 5 Mo » : le sélecteur de fichiers du système. */
@Composable
fun ChoixFichierHumalis(libelle: String, valeur: Any?, changer: (Any?) -> Unit, familles: List<Pair<String, List<String>>>, maximum: Double? = null, plusieurs: Boolean = false, apercu: Boolean = true, modifier: Modifier = Modifier) {
    var erreur by remember { mutableStateOf("") }
    val types = familles.flatMap { it.second }.ifEmpty { listOf("*/*") }.toTypedArray()
    val lire = { adresses: List<Uri> ->
        val refus = mutableListOf<String>()
        val gardes = adresses.mapNotNull { recevoir(it, familles, maximum, apercu, adresses.size == 1, refus) }
        erreur = refus.joinToString(" ")
        if (adresses.isNotEmpty()) changer(if (plusieurs) gardes else gardes.firstOrNull())
    }
    val un = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { it?.let { a -> lire(listOf(a)) } }
    val tous = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { lire(it) }
    val noms = if (plusieurs) liste(valeur).map { texte(champ(it, "nom")) } else listOfNotNull(champ(valeur, "nom")?.let { texte(it) })
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        OutlinedButton(onClick = { if (plusieurs) tous.launch(types) else un.launch(types) }) { Text(libelle) }
        for (nom in noms) Text(nom, style = MaterialTheme.typography.bodySmall)
        if (erreur.isNotEmpty()) Text(erreur, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    }
}

/** L'adresse d'un fichier de l'application que les autres applications peuvent ouvrir. */
private fun adressePartagee(fichier: File): Uri = FileProvider.getUriForFile(Appli.contexte, Appli.contexte.packageName + ".fichiers", fichier)

/** Ouvre ou partage un fichier écrit par l'application : le système propose ses applications. */
fun montrerFichier(fichier: File, mime: String) {
    val intention = Intent(Intent.ACTION_VIEW).setDataAndType(adressePartagee(fichier), mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    try {
        Appli.contexte.startActivity(Intent.createChooser(intention, fichier.name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: Exception) {
        Messages.afficher("Aucune application ne sait ouvrir ce fichier.", "erreur")
    }
}

/** « telecharger commandes en csv » : le fichier se fait sur l'appareil, puis se partage. */
suspend fun telechargerCsv(liste: Any?, fichier: String) {
    val lignes = liste(liste).filterIsInstance<Map<*, *>>()
    if (lignes.isEmpty()) {
        Messages.afficher("Il n'y a rien à télécharger.", "info")
        return
    }
    val colonnes = lignes.first().keys.map { it.toString() }.sorted()
    fun cellule(v: Any?) = "\"" + texte(v).replace("\"", "\"\"") + "\""
    val texte = (listOf(colonnes.joinToString(";")) + lignes.map { l -> colonnes.joinToString(";") { cellule(l[it]) } }).joinToString("\r\n")
    val sortie = withContext(Dispatchers.IO) {
        File(File(Appli.contexte.cacheDir, "humalis").apply { mkdirs() }, fichier).also { it.writeText(texte, Charsets.UTF_8) }
    }
    val envoi = Intent(Intent.ACTION_SEND).setType("text/csv").putExtra(Intent.EXTRA_STREAM, adressePartagee(sortie)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    Appli.contexte.startActivity(Intent.createChooser(envoi, fichier).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}
`;
