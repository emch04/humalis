/**
 * Les médias sur Android : « enregistrer audio dans note », « enregistrer video dans clip »,
 * « scanner document dans facture » et « recadrer photo ». Le résultat a la forme de
 * « photo dans » : { nom, taille, type, apercu, mime, chemin } ; il s'affiche et s'envoie.
 * Annuler rend `null` : la variable ne change pas.
 *
 * - le son : MediaRecorder, en AAC (.m4a) ;
 * - la vidéo : CameraX (.mp4) ;
 * - le document : ML Kit Document Scanner, un PDF et l'image de sa première page en aperçu ;
 * - le recadrage : un écran Compose, qui découpe l'image à sa pleine taille.
 *
 * Son, vidéo et recadrage s'ouvrent dans leur propre activité, verrouillée dans le sens où on
 * l'a ouverte : tourner le téléphone ne recrée pas la page qui attend le résultat.
 */

export const VERSIONS_CAPTURES = { camera: '1.5.3', scanner: '16.0.0' } as const;

/** Ce que le code Kotlin des pages emploie. */
export const besoinsCaptures = (code: string): { son: boolean; video: boolean; scan: boolean; recadrage: boolean } => ({
  son: /\benregistrerMedia\("audio"\)/.test(code),
  video: /\benregistrerMedia\("video"\)/.test(code),
  scan: /\bscannerDocument\(\)/.test(code),
  recadrage: /\brecadrerPhoto\(/.test(code),
});

export function dependancesCaptures(b: ReturnType<typeof besoinsCaptures>): string[] {
  return [
    ...(b.video
      ? ['camera-core', 'camera-camera2', 'camera-lifecycle', 'camera-video', 'camera-view'].map((m) => `implementation("androidx.camera:${m}:${VERSIONS_CAPTURES.camera}")`)
      : []),
    ...(b.scan ? [`implementation("com.google.android.gms:play-services-mlkit-document-scanner:${VERSIONS_CAPTURES.scanner}")`] : []),
  ];
}

/** Le code de la vidéo n'est écrit que si l'application filme : sans cela, CameraX ne serait pas dans le projet. */
export function capturesKotlin(b: ReturnType<typeof besoinsCaptures>): string {
  return [CAPTURES_DEBUT, b.video ? IMPORTS_VIDEO : '', b.scan ? IMPORTS_SCAN : '', CAPTURES_CORPS, b.video ? VIDEO_KT : VIDEO_ABSENTE_KT, b.scan ? SCAN_KT : SCAN_ABSENT_KT].join('');
}

const CAPTURES_DEBUT = String.raw`// Produit par Humalis : enregistrer un son ou une vidéo, scanner un document, recadrer une photo.
package PAQUET

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.RectF
import android.media.ExifInterface
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect as RectCompose
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import java.io.File
import java.util.UUID
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
`;

const IMPORTS_VIDEO = String.raw`import android.annotation.SuppressLint
import android.view.OrientationEventListener
import android.view.Surface
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.lifecycle.awaitInstance
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
`;

const IMPORTS_SCAN = String.raw`import android.net.Uri
import androidx.activity.result.IntentSenderRequest
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
`;

const CAPTURES_CORPS = String.raw`
private fun dossierCaptures(): File = File(Appli.contexte.cacheDir, "humalis").apply { mkdirs() }

private fun ficheDe(fichier: File, type: String, mime: String, apercu: File = fichier): Map<String, Any?> =
    fiche("nom" to fichier.name, "taille" to fichier.length().toDouble(), "type" to type, "apercu" to "file://" + apercu.absolutePath, "mime" to mime, "chemin" to fichier.absolutePath)

private fun ecrireDuree(secondes: Int): String = "%02d:%02d".format(secondes / 60, secondes % 60)

/** Ouvre l'écran de capture et attend le fichier qu'il rend ; rien s'il a été annulé. */
private suspend fun ouvrirCapture(intention: Intent): Map<String, Any?>? {
    val reponse = Activite.demander(ActivityResultContracts.StartActivityForResult(), intention) ?: return null
    if (reponse.resultCode != Activity.RESULT_OK) return null
    val donnees = reponse.data ?: return null
    val fichier = File(donnees.getStringExtra("chemin") ?: return null)
    if (!fichier.exists() || fichier.length() == 0L) return null
    return ficheDe(fichier, donnees.getStringExtra("type") ?: "fichier", donnees.getStringExtra("mime") ?: "application/octet-stream")
}

/** « enregistrer audio dans note », « enregistrer video dans clip ». */
suspend fun enregistrerMedia(genre: String): Map<String, Any?>? {
    val video = genre == "video"
    val systeme = Appli.contexte.packageManager
    if (!systeme.hasSystemFeature(PackageManager.FEATURE_MICROPHONE)) {
        Messages.afficher("Cet appareil n'a pas de micro.", "erreur")
        return null
    }
    if (!permission(Manifest.permission.RECORD_AUDIO)) {
        Messages.afficher("L'accès au micro est refusé : autorisez-le dans les réglages de l'appareil.", "erreur")
        return null
    }
    if (video) {
        if (!systeme.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
            Messages.afficher("Cet appareil n'a pas de caméra.", "erreur")
            return null
        }
        if (!permission(Manifest.permission.CAMERA)) {
            Messages.afficher("L'accès à la caméra est refusé : autorisez-le dans les réglages de l'appareil.", "erreur")
            return null
        }
    }
    return ouvrirCapture(Intent(Appli.contexte, EcranCaptureHumalis::class.java).putExtra("genre", genre))
}

/** « recadrer photo » : la variable reçoit l'image recadrée ; annuler la laisse telle quelle. */
suspend fun recadrerPhoto(valeur: Any?): Map<String, Any?>? {
    val chemin = champ(valeur, "chemin") as? String
    val mime = texte(champ(valeur, "mime"))
    if (chemin == null || !mime.startsWith("image/")) {
        Messages.afficher("La variable ne contient pas une image à recadrer.", "erreur")
        return null
    }
    if (!File(chemin).exists()) {
        Messages.afficher("L'image ne peut pas être ouverte.", "erreur")
        return null
    }
    return ouvrirCapture(Intent(Appli.contexte, EcranCaptureHumalis::class.java).putExtra("genre", "recadrage").putExtra("chemin", chemin).putExtra("mime", mime).putExtra("nom", texte(champ(valeur, "nom"))))
}

/** L'écran qui enregistre ou recadre ; il rend le chemin du fichier. */
class EcranCaptureHumalis : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Appli.contexte = applicationContext
        enableEdgeToEdge()
        val genre = intent.getStringExtra("genre") ?: "audio"
        val rendre: (File?, String, String) -> Unit = { fichier, type, mime ->
            if (fichier != null) setResult(Activity.RESULT_OK, Intent().putExtra("chemin", fichier.absolutePath).putExtra("type", type).putExtra("mime", mime))
            else setResult(Activity.RESULT_CANCELED)
            finish()
        }
        setContent {
            ThemeHumalis {
                Surface(Modifier.fillMaxSize()) {
                    Box(Modifier.safeDrawingPadding()) {
                        when (genre) {
                            "video" -> EnregistrementVideo { f -> rendre(f, "video", "video/mp4") }
                            "recadrage" -> Recadrage(intent.getStringExtra("chemin") ?: "", intent.getStringExtra("mime") ?: "image/jpeg", intent.getStringExtra("nom") ?: "photo", rendre)
                            else -> EnregistrementSon { f -> rendre(f, "audio", "audio/mp4") }
                        }
                    }
                }
            }
        }
    }
}

internal enum class EtapeCapture { PREPARATION, PRET, EN_COURS, ARRET, TERMINE }

private val ROUGE = Color(0xFFD92D20)
private val VERT = Color(0xFF1E9E4A)

/** Un bouton rond : une icône dessinée, et son nom pour le lecteur d'écran. */
@Composable
internal fun BoutonCapture(nom: String, couleur: Color, surClic: () -> Unit, dessin: DrawScope.(Color) -> Unit) {
    Box(
        Modifier.size(56.dp).background(couleur.copy(alpha = 0.12f), CircleShape)
            .clickable(onClick = surClic)
            .semantics { contentDescription = nom; role = Role.Button },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(28.dp)) { dessin(couleur) }
    }
}

private val dessinCroix: DrawScope.(Color) -> Unit = { c ->
    val t = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
    drawLine(c, Offset(size.width * 0.15f, size.height * 0.15f), Offset(size.width * 0.85f, size.height * 0.85f), t.width, StrokeCap.Round)
    drawLine(c, Offset(size.width * 0.85f, size.height * 0.15f), Offset(size.width * 0.15f, size.height * 0.85f), t.width, StrokeCap.Round)
}
private val dessinRond: DrawScope.(Color) -> Unit = { c -> drawCircle(c, size.minDimension * 0.45f) }
private val dessinCarre: DrawScope.(Color) -> Unit = { c -> drawRect(c, Offset(size.width * 0.15f, size.height * 0.15f), Size(size.width * 0.7f, size.height * 0.7f)) }
private val dessinCoche: DrawScope.(Color) -> Unit = { c ->
    val trait = Path().apply { moveTo(size.width * 0.12f, size.height * 0.55f); lineTo(size.width * 0.4f, size.height * 0.82f); lineTo(size.width * 0.9f, size.height * 0.2f) }
    drawPath(trait, c, style = Stroke(width = 3.5f.dp.toPx(), cap = StrokeCap.Round))
}
private val dessinReprise: DrawScope.(Color) -> Unit = { c ->
    drawArc(c, -60f, 300f, false, Offset(size.width * 0.12f, size.height * 0.12f), Size(size.width * 0.76f, size.height * 0.76f), style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round))
    val fleche = Path().apply { moveTo(size.width * 0.62f, size.height * 0.02f); lineTo(size.width * 0.74f, size.height * 0.2f); lineTo(size.width * 0.52f, size.height * 0.26f); close() }
    drawPath(fleche, c)
}
internal val dessinCamera: DrawScope.(Color) -> Unit = { c ->
    drawArc(c, 20f, 140f, false, Offset(size.width * 0.1f, size.height * 0.1f), Size(size.width * 0.8f, size.height * 0.8f), style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round))
    drawArc(c, 200f, 140f, false, Offset(size.width * 0.1f, size.height * 0.1f), Size(size.width * 0.8f, size.height * 0.8f), style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round))
    drawCircle(c, size.minDimension * 0.12f)
}

/** Ce qui est commun au son et à la vidéo : le titre, la durée, le milieu et les boutons. */
@Composable
internal fun CadreEnregistrement(titre: String, secondes: Int, etape: EtapeCapture, erreur: String, demarrer: () -> Unit, arreter: () -> Unit, recommencer: () -> Unit, valider: () -> Unit, annuler: () -> Unit, autre: (@Composable () -> Unit)? = null, milieu: @Composable ColumnScope.() -> Unit) {
    val encre = MaterialTheme.colorScheme.onSurfaceVariant
    Column(Modifier.fillMaxSize().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(titre, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        Text(ecrireDuree(secondes), fontSize = 34.sp, color = if (etape == EtapeCapture.EN_COURS) ROUGE else MaterialTheme.colorScheme.onSurface, modifier = Modifier.semantics { contentDescription = "Durée " + ecrireDuree(secondes) })
        Column(Modifier.weight(1f).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center, content = milieu)
        if (erreur.isNotEmpty()) Text(erreur, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        Row(horizontalArrangement = Arrangement.spacedBy(28.dp), verticalAlignment = Alignment.CenterVertically) {
            BoutonCapture("Annuler", encre, annuler, dessinCroix)
            when (etape) {
                EtapeCapture.PREPARATION, EtapeCapture.ARRET -> CircularProgressIndicator(Modifier.size(40.dp))
                EtapeCapture.PRET -> {
                    BoutonCapture("Démarrer", ROUGE, demarrer, dessinRond)
                    autre?.invoke()
                }
                EtapeCapture.EN_COURS -> BoutonCapture("Arrêter", ROUGE, arreter, dessinCarre)
                EtapeCapture.TERMINE -> {
                    BoutonCapture("Recommencer", MaterialTheme.colorScheme.primary, recommencer, dessinReprise)
                    BoutonCapture("Valider", VERT, valider, dessinCoche)
                }
            }
        }
    }
}

/** La durée : elle avance tant que l'enregistrement dure. */
@Composable
internal fun SuiviDuree(etape: EtapeCapture, changer: (Int) -> Unit) {
    LaunchedEffect(etape) {
        if (etape != EtapeCapture.EN_COURS) return@LaunchedEffect
        val debut = System.currentTimeMillis()
        changer(0)
        while (true) {
            delay(250)
            changer(((System.currentTimeMillis() - debut) / 1000).toInt())
        }
    }
}

// ─── Le son ─────────────────────────────────────────────────────────────────

@Composable
private fun EnregistrementSon(terminer: (File?) -> Unit) {
    var etape by remember { mutableStateOf(EtapeCapture.PRET) }
    var secondes by remember { mutableIntStateOf(0) }
    var erreur by remember { mutableStateOf("") }
    var fichier by remember { mutableStateOf<File?>(null) }
    val enregistreur = remember { arrayOfNulls<MediaRecorder>(1) }
    val garde = remember { booleanArrayOf(false) }

    fun liberer() {
        enregistreur[0]?.release()
        enregistreur[0] = null
    }

    fun arreter() {
        if (etape != EtapeCapture.EN_COURS) return
        val fini = try {
            enregistreur[0]?.stop()
            true
        } catch (e: RuntimeException) {
            // Arrêté tout de suite après le départ : le système n'a rien écrit.
            false
        }
        liberer()
        if (fini && (fichier?.length() ?: 0L) > 0L) {
            etape = EtapeCapture.TERMINE
        } else {
            fichier?.delete()
            fichier = null
            erreur = "L'enregistrement est trop court. Réessayez."
            etape = EtapeCapture.PRET
        }
    }

    fun demarrer() {
        erreur = ""
        fichier?.delete()
        val sortie = File(dossierCaptures(), "audio-" + UUID.randomUUID() + ".m4a")
        @Suppress("DEPRECATION")
        val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(Appli.contexte) else MediaRecorder()
        try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioEncodingBitRate(96_000)
            r.setAudioSamplingRate(44_100)
            r.setOutputFile(sortie.absolutePath)
            r.prepare()
            r.start()
        } catch (e: Exception) {
            r.release()
            sortie.delete()
            erreur = "Le micro n'a pas pu être ouvert."
            return
        }
        enregistreur[0] = r
        fichier = sortie
        secondes = 0
        etape = EtapeCapture.EN_COURS
    }

    val annuler = {
        if (etape == EtapeCapture.EN_COURS) { try { enregistreur[0]?.stop() } catch (_: RuntimeException) {} }
        liberer()
        fichier?.delete()
        fichier = null
        terminer(null)
    }
    BackHandler(onBack = annuler)
    SuiviDuree(etape) { secondes = it }
    // L'application passe derrière : Android coupe le micro, ce qui a été dit est gardé.
    val cycle = LocalLifecycleOwner.current.lifecycle
    val arretActuel by rememberUpdatedState({ arreter() })
    DisposableEffect(cycle) {
        val observateur = LifecycleEventObserver { _, evenement -> if (evenement == Lifecycle.Event.ON_STOP) arretActuel() }
        cycle.addObserver(observateur)
        onDispose {
            cycle.removeObserver(observateur)
            liberer()
            if (!garde[0]) fichier?.delete()
        }
    }

    CadreEnregistrement(
        "Enregistrer un audio", secondes, etape, erreur,
        demarrer = { demarrer() },
        arreter = { arreter() },
        recommencer = { fichier?.delete(); fichier = null; secondes = 0; etape = EtapeCapture.PRET },
        valider = { garde[0] = true; terminer(fichier) },
        annuler = annuler,
    ) {
        val lu = fichier
        if (etape == EtapeCapture.TERMINE && lu != null) {
            key(lu.absolutePath) { LecteurHumalis("file://" + lu.absolutePath, false, "Réécouter", null) }
        } else {
            val couleur = if (etape == EtapeCapture.EN_COURS) ROUGE else MaterialTheme.colorScheme.onSurfaceVariant
            Canvas(Modifier.size(72.dp)) {
                val c = Offset(size.width / 2, size.height * 0.36f)
                drawRoundRect(couleur, Offset(c.x - size.width * 0.14f, size.height * 0.06f), Size(size.width * 0.28f, size.height * 0.56f), androidx.compose.ui.geometry.CornerRadius(size.width * 0.14f))
                drawArc(couleur, 0f, 180f, false, Offset(size.width * 0.22f, size.height * 0.2f), Size(size.width * 0.56f, size.height * 0.56f), style = Stroke(width = 3.dp.toPx()))
                drawLine(couleur, Offset(c.x, size.height * 0.76f), Offset(c.x, size.height * 0.94f), 3.dp.toPx())
            }
        }
    }
}

// ─── Le recadrage ───────────────────────────────────────────────────────────

/** L'orientation enregistrée par l'appareil photo, pour montrer l'image à l'endroit. */
private fun orientationDe(chemin: String): Int = try {
    ExifInterface(chemin).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
} catch (e: Exception) {
    ExifInterface.ORIENTATION_NORMAL
}

private fun matriceDe(orientation: Int): Matrix = Matrix().apply {
    when (orientation) {
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> setScale(-1f, 1f)
        ExifInterface.ORIENTATION_ROTATE_180 -> setRotate(180f)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> setScale(1f, -1f)
        ExifInterface.ORIENTATION_TRANSPOSE -> { setRotate(90f); postScale(-1f, 1f) }
        ExifInterface.ORIENTATION_ROTATE_90 -> setRotate(90f)
        ExifInterface.ORIENTATION_TRANSVERSE -> { setRotate(-90f); postScale(-1f, 1f) }
        ExifInterface.ORIENTATION_ROTATE_270 -> setRotate(-90f)
    }
}

/** Une image à la bonne taille pour l'écran, à l'endroit. */
private fun imageAffichee(chemin: String): Bitmap? {
    val bornes = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(chemin, bornes)
    if (bornes.outWidth <= 0 || bornes.outHeight <= 0) return null
    var reduction = 1
    while (max(bornes.outWidth, bornes.outHeight) / (reduction * 2) >= 1600) reduction *= 2
    val brute = BitmapFactory.decodeFile(chemin, BitmapFactory.Options().apply { inSampleSize = reduction }) ?: return null
    val matrice = matriceDe(orientationDe(chemin))
    return if (matrice.isIdentity) brute else Bitmap.createBitmap(brute, 0, 0, brute.width, brute.height, matrice, true)
}

/** Découpe l'image à sa pleine taille : seule la zone gardée est décodée. Les bornes vont de 0 à 1, sur l'image à l'endroit. */
private fun decouper(chemin: String, zone: RectF, sortie: File, png: Boolean): Boolean {
    val bornes = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(chemin, bornes)
    val largeur = bornes.outWidth.toFloat()
    val hauteur = bornes.outHeight.toFloat()
    val matrice = matriceDe(orientationDe(chemin))
    // De l'image à l'endroit vers le fichier : la rotation autour de l'origine, puis le retour dans le cadre.
    val vue = RectF(0f, 0f, largeur, hauteur)
    matrice.mapRect(vue)
    val placee = Matrix(matrice).apply { postTranslate(-vue.left, -vue.top) }
    val inverse = Matrix()
    if (!placee.invert(inverse)) return false
    val voulue = RectF(zone.left * vue.width(), zone.top * vue.height(), zone.right * vue.width(), zone.bottom * vue.height())
    inverse.mapRect(voulue)
    val dansFichier = Rect(voulue.left.toInt().coerceAtLeast(0), voulue.top.toInt().coerceAtLeast(0), voulue.right.toInt().coerceAtMost(bornes.outWidth), voulue.bottom.toInt().coerceAtMost(bornes.outHeight))
    if (dansFichier.width() < 2 || dansFichier.height() < 2) return false
    @Suppress("DEPRECATION")
    val decodeur = BitmapRegionDecoder.newInstance(chemin, false) ?: return false
    val coupee = try { decodeur.decodeRegion(dansFichier, BitmapFactory.Options()) } finally { decodeur.recycle() } ?: return false
    val droite = if (matrice.isIdentity) coupee else Bitmap.createBitmap(coupee, 0, 0, coupee.width, coupee.height, matrice, true)
    sortie.outputStream().use { droite.compress(if (png) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG, 92, it) }
    return sortie.length() > 0L
}

private sealed interface PriseZone
private data class NouvelleZone(val depart: Offset) : PriseZone
private data class DeplacementZone(val zone: RectCompose, val depart: Offset) : PriseZone
private data class CoinZone(val rang: Int, val zone: RectCompose) : PriseZone

private val ZONE_ENTIERE = RectCompose(0f, 0f, 1f, 1f)

@Composable
private fun Recadrage(chemin: String, mime: String, nom: String, rendre: (File?, String, String) -> Unit) {
    var image by remember { mutableStateOf<Bitmap?>(null) }
    var erreur by remember { mutableStateOf("") }
    var zone by remember { mutableStateOf(ZONE_ENTIERE) }
    var enCours by remember { mutableStateOf(false) }
    LaunchedEffect(chemin) {
        val lue = withContext(Dispatchers.IO) { try { imageAffichee(chemin) } catch (e: Exception) { null } }
        if (lue == null) erreur = "L'image ne peut pas être ouverte." else image = lue
    }
    BackHandler { rendre(null, "", "") }
    val encre = MaterialTheme.colorScheme.onSurfaceVariant
    Column(Modifier.fillMaxSize().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Recadrer la photo", style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        Text("Tracez un rectangle, ou tirez ses coins.", style = MaterialTheme.typography.bodySmall, color = encre)
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            image?.let { bitmap -> ZoneRecadrage(bitmap, zone) { zone = it } }
        }
        if (erreur.isNotEmpty()) Text(erreur, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        val portee = androidx.compose.runtime.rememberCoroutineScope()
        Row(horizontalArrangement = Arrangement.spacedBy(28.dp), verticalAlignment = Alignment.CenterVertically) {
            BoutonCapture("Annuler", encre, { rendre(null, "", "") }, dessinCroix)
            if (enCours) CircularProgressIndicator(Modifier.size(40.dp))
            else BoutonCapture("Valider", VERT, {
                if (image != null) {
                    enCours = true
                    val gardee = RectF(zone.left, zone.top, zone.right, zone.bottom)
                    val png = mime == "image/png"
                    portee.launch {
                        val base = nom.substringBeforeLast('.').replace(Regex("[^A-Za-z0-9._-]"), "_").ifEmpty { "photo" }
                        val sortie = File(File(dossierCaptures(), UUID.randomUUID().toString()).apply { mkdirs() }, base + "-recadree." + (if (png) "png" else "jpg"))
                        val reussi = withContext(Dispatchers.IO) { try { decouper(chemin, gardee, sortie, png) } catch (e: Exception) { false } catch (e: OutOfMemoryError) { false } }
                        if (reussi) rendre(sortie, "image", if (png) "image/png" else "image/jpeg")
                        else { erreur = "Le recadrage a échoué. Tracez une zone plus grande."; enCours = false }
                    }
                }
            }, dessinCoche)
        }
    }
}

@Composable
private fun ZoneRecadrage(image: Bitmap, zone: RectCompose, changer: (RectCompose) -> Unit) {
    val proportion = image.width.toFloat() / image.height
    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val densite = LocalDensity.current
        val largeurMax = with(densite) { maxWidth.toPx() }
        val hauteurMax = with(densite) { maxHeight.toPx() }
        val largeur = min(largeurMax, hauteurMax * proportion)
        val hauteur = largeur / proportion
        val actuelle by rememberUpdatedState(zone)
        val rayonPrise = with(densite) { 32.dp.toPx() }
        val minimum = 0.03f
        Box(
            Modifier.size(with(densite) { largeur.toDp() }, with(densite) { hauteur.toDp() }).clipToBounds()
                .semantics {
                    contentDescription = "Zone de recadrage"
                    stateDescription = "#{(zone.width * 100).toInt()} % de la largeur, #{(zone.height * 100).toInt()} % de la hauteur"
                    customActions = listOf(
                        CustomAccessibilityAction("Resserrer") { changer(ajuster(actuelle, -0.05f)); true },
                        CustomAccessibilityAction("Élargir") { changer(ajuster(actuelle, 0.05f)); true },
                    )
                }
                .pointerInput(largeur, hauteur) {
                    var prise: PriseZone? = null
                    fun normal(p: Offset) = Offset((p.x / largeur).coerceIn(0f, 1f), (p.y / hauteur).coerceIn(0f, 1f))
                    detectDragGestures(
                        onDragStart = { p ->
                            val z = actuelle
                            val coins = listOf(Offset(z.left * largeur, z.top * hauteur), Offset(z.right * largeur, z.top * hauteur), Offset(z.left * largeur, z.bottom * hauteur), Offset(z.right * largeur, z.bottom * hauteur))
                            val rang = coins.indexOfFirst { hypot(it.x - p.x, it.y - p.y) < rayonPrise }
                            val n = normal(p)
                            prise = when {
                                rang >= 0 -> CoinZone(rang, z)
                                z != ZONE_ENTIERE && z.contains(n) -> DeplacementZone(z, n)
                                else -> NouvelleZone(n)
                            }
                        },
                        onDragEnd = { prise = null },
                        onDragCancel = { prise = null },
                    ) { changement, _ ->
                        changement.consume()
                        val n = normal(changement.position)
                        when (val p = prise) {
                            is NouvelleZone -> changer(RectCompose(min(p.depart.x, n.x), min(p.depart.y, n.y), max(p.depart.x, n.x), max(p.depart.y, n.y)))
                            is DeplacementZone -> {
                                val dx = (n.x - p.depart.x).coerceIn(-p.zone.left, 1f - p.zone.right)
                                val dy = (n.y - p.depart.y).coerceIn(-p.zone.top, 1f - p.zone.bottom)
                                changer(p.zone.translate(dx, dy))
                            }
                            is CoinZone -> {
                                val z = p.zone
                                val gauche = if (p.rang % 2 == 0) min(n.x, z.right - minimum) else z.left
                                val droite = if (p.rang % 2 == 1) max(n.x, z.left + minimum) else z.right
                                val haut = if (p.rang < 2) min(n.y, z.bottom - minimum) else z.top
                                val bas = if (p.rang >= 2) max(n.y, z.top + minimum) else z.bottom
                                changer(RectCompose(gauche, haut, droite, bas))
                            }
                            null -> Unit
                        }
                    }
                },
        ) {
            Image(image.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.FillBounds)
            Canvas(Modifier.fillMaxSize()) {
                val r = RectCompose(zone.left * size.width, zone.top * size.height, zone.right * size.width, zone.bottom * size.height)
                val voile = Path().apply { fillType = PathFillType.EvenOdd; addRect(RectCompose(Offset.Zero, size)); addRect(r) }
                drawPath(voile, Color.Black.copy(alpha = 0.5f))
                drawRect(Color.White, r.topLeft, r.size, style = Stroke(width = 2.dp.toPx()))
                for (coin in listOf(r.topLeft, r.topRight, r.bottomLeft, r.bottomRight)) drawCircle(Color.White, 9.dp.toPx(), coin)
            }
        }
    }
}

/** TalkBack : resserrer ou élargir la zone autour de son centre. */
private fun ajuster(z: RectCompose, pas: Float): RectCompose {
    val l = (z.width + pas).coerceIn(0.05f, 1f)
    val h = (z.height + pas).coerceIn(0.05f, 1f)
    val x = (z.center.x - l / 2).coerceIn(0f, 1f - l)
    val y = (z.center.y - h / 2).coerceIn(0f, 1f - h)
    return RectCompose(x, y, x + l, y + h)
}
`;

const VIDEO_KT = String.raw`
// ─── La vidéo ───────────────────────────────────────────────────────────────

@SuppressLint("MissingPermission")
@Composable
private fun EnregistrementVideo(terminer: (File?) -> Unit) {
    val contexte = LocalContext.current
    val proprietaire = LocalLifecycleOwner.current
    var etape by remember { mutableStateOf(EtapeCapture.PREPARATION) }
    var secondes by remember { mutableIntStateOf(0) }
    var erreur by remember { mutableStateOf("") }
    var fichier by remember { mutableStateOf<File?>(null) }
    var arriere by remember { mutableStateOf(true) }
    var deuxCameras by remember { mutableStateOf(false) }
    val vue = remember { PreviewView(contexte).apply { implementationMode = PreviewView.ImplementationMode.COMPATIBLE; scaleType = PreviewView.ScaleType.FIT_CENTER } }
    val capture = remember { VideoCapture.withOutput(Recorder.Builder().setQualitySelector(QualitySelector.fromOrderedList(listOf(Quality.FHD, Quality.HD, Quality.SD), FallbackStrategy.lowerQualityOrHigherThan(Quality.SD))).build()) }
    val enCours = remember { arrayOfNulls<Recording>(1) }
    val annulee = remember { booleanArrayOf(false) }
    val garde = remember { booleanArrayOf(false) }

    // L'écran ne tourne pas, mais la vidéo suit la façon dont le téléphone est tenu.
    DisposableEffect(Unit) {
        val boussole = object : OrientationEventListener(contexte) {
            override fun onOrientationChanged(angle: Int) {
                if (angle == ORIENTATION_UNKNOWN || enCours[0] != null) return
                capture.targetRotation = when (angle) {
                    in 45 until 135 -> Surface.ROTATION_270
                    in 135 until 225 -> Surface.ROTATION_180
                    in 225 until 315 -> Surface.ROTATION_90
                    else -> Surface.ROTATION_0
                }
            }
        }
        boussole.enable()
        onDispose { boussole.disable() }
    }

    // La caméra : ouverte à l'arrivée, et de nouveau quand on change de côté ou qu'on recommence.
    LaunchedEffect(arriere, etape == EtapeCapture.TERMINE) {
        if (etape == EtapeCapture.TERMINE) return@LaunchedEffect
        try {
            val fournisseur = ProcessCameraProvider.awaitInstance(contexte)
            val derriere = fournisseur.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)
            val devant = fournisseur.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)
            deuxCameras = derriere && devant
            val choix = if ((arriere && derriere) || !devant) CameraSelector.DEFAULT_BACK_CAMERA else CameraSelector.DEFAULT_FRONT_CAMERA
            val apercu = Preview.Builder().build().also { it.surfaceProvider = vue.surfaceProvider }
            fournisseur.unbindAll()
            fournisseur.bindToLifecycle(proprietaire, choix, apercu, capture)
            etape = EtapeCapture.PRET
        } catch (e: Exception) {
            erreur = "La caméra n'a pas pu être ouverte."
        }
    }

    fun arreter() {
        if (etape != EtapeCapture.EN_COURS) return
        etape = EtapeCapture.ARRET
        enCours[0]?.stop()
    }

    fun demarrer() {
        erreur = ""
        fichier?.delete()
        val sortie = File(dossierCaptures(), "video-" + UUID.randomUUID() + ".mp4")
        fichier = sortie
        secondes = 0
        etape = EtapeCapture.EN_COURS
        enCours[0] = capture.output.prepareRecording(contexte, FileOutputOptions.Builder(sortie).build()).withAudioEnabled().start(ContextCompat.getMainExecutor(contexte)) { evenement ->
            if (evenement !is VideoRecordEvent.Finalize) return@start
            enCours[0] = null
            if (annulee[0]) { sortie.delete(); return@start }
            // Certaines fins laissent un fichier complet : caméra coupée, disque plein, durée atteinte.
            val complet = sortie.length() > 0L && evenement.error in listOf(VideoRecordEvent.Finalize.ERROR_NONE, VideoRecordEvent.Finalize.ERROR_SOURCE_INACTIVE, VideoRecordEvent.Finalize.ERROR_INSUFFICIENT_STORAGE, VideoRecordEvent.Finalize.ERROR_FILE_SIZE_LIMIT_REACHED, VideoRecordEvent.Finalize.ERROR_DURATION_LIMIT_REACHED)
            if (complet) {
                etape = EtapeCapture.TERMINE
            } else {
                sortie.delete()
                fichier = null
                erreur = "L'enregistrement a échoué. Réessayez."
                etape = EtapeCapture.PRET
            }
        }
    }

    val annuler = {
        annulee[0] = true
        enCours[0]?.stop()
        if (enCours[0] == null) fichier?.delete()
        terminer(null)
    }
    BackHandler(onBack = annuler)
    SuiviDuree(etape) { secondes = it }
    val cycle = proprietaire.lifecycle
    val arretActuel by rememberUpdatedState({ arreter() })
    DisposableEffect(cycle) {
        val observateur = LifecycleEventObserver { _, evenement -> if (evenement == Lifecycle.Event.ON_STOP) arretActuel() }
        cycle.addObserver(observateur)
        onDispose {
            cycle.removeObserver(observateur)
            if (!garde[0]) {
                annulee[0] = true
                enCours[0]?.stop()
                if (enCours[0] == null) fichier?.delete()
            }
        }
    }

    CadreEnregistrement(
        "Enregistrer une vidéo", secondes, etape, erreur,
        demarrer = { demarrer() },
        arreter = { arreter() },
        recommencer = { fichier?.delete(); fichier = null; secondes = 0; etape = EtapeCapture.PREPARATION },
        valider = { garde[0] = true; terminer(fichier) },
        annuler = annuler,
        autre = if (deuxCameras) ({ BoutonCapture("Changer de caméra", MaterialTheme.colorScheme.primary, { arriere = !arriere; etape = EtapeCapture.PREPARATION }, dessinCamera) }) else null,
    ) {
        val lu = fichier
        if (etape == EtapeCapture.TERMINE && lu != null) {
            // Le lecteur a la forme 16/9 : il tient dans la place qui reste, sans recouvrir le titre ni les boutons.
            BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                val largeur = if (maxWidth < maxHeight * (16f / 9f)) maxWidth else maxHeight * (16f / 9f)
                Box(Modifier.width(largeur)) { key(lu.absolutePath) { VideoHumalis("file://" + lu.absolutePath, false, "Revoir la vidéo", null) } }
            }
        } else {
            AndroidView(factory = { vue }, modifier = Modifier.fillMaxSize().background(Color.Black).semantics { contentDescription = "Image de la caméra" })
        }
    }
}
`;

const VIDEO_ABSENTE_KT = String.raw`
// Cette application ne filme pas : CameraX n'est pas dans le projet.
@Composable
private fun EnregistrementVideo(terminer: (File?) -> Unit) { LaunchedEffect(Unit) { terminer(null) } }
`;

const SCAN_KT = String.raw`
// ─── Le document ────────────────────────────────────────────────────────────

/** Copie un fichier rendu par le scanner : il ne vit que le temps de la réponse. */
private fun copier(adresse: Uri, sortie: File): Boolean = try {
    Appli.contexte.contentResolver.openInputStream(adresse)!!.use { entree -> sortie.outputStream().use { entree.copyTo(it) } }
    sortie.length() > 0L
} catch (e: Exception) {
    false
}

/** « scanner document dans facture » : un PDF, et l'image de sa première page en aperçu. */
suspend fun scannerDocument(): Map<String, Any?>? {
    val activite = Activite.courante ?: return null
    val options = GmsDocumentScannerOptions.Builder()
        .setGalleryImportAllowed(true)
        .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG, GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
        .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
        .build()
    val envoi = suspendCancellableCoroutine { suite ->
        GmsDocumentScanning.getClient(options).getStartScanIntent(activite)
            .addOnSuccessListener { if (suite.isActive) suite.resume(it) }
            .addOnFailureListener { if (suite.isActive) suite.resume(null) }
    }
    if (envoi == null) {
        Messages.afficher("Le scanner de documents n'est pas disponible : il demande les services Google à jour.", "erreur")
        return null
    }
    val reponse = Activite.demander(ActivityResultContracts.StartIntentSenderForResult(), IntentSenderRequest.Builder(envoi).build()) ?: return null
    if (reponse.resultCode != Activity.RESULT_OK) return null
    val resultat = GmsDocumentScanningResult.fromActivityResultIntent(reponse.data) ?: return null
    val pdf = resultat.pdf
    val premiere = resultat.pages?.firstOrNull()
    if (pdf == null || premiere == null) {
        Messages.afficher("Le document n'a pas pu être écrit.", "erreur")
        return null
    }
    return withContext(Dispatchers.IO) {
        val nom = UUID.randomUUID().toString()
        val fichier = File(dossierCaptures(), "document-#{nom}.pdf")
        val apercu = File(dossierCaptures(), "document-apercu-#{nom}.jpg")
        if (copier(pdf.uri, fichier) && copier(premiere.imageUri, apercu)) ficheDe(fichier, "pdf", "application/pdf", apercu) else null
    } ?: run {
        Messages.afficher("Le document n'a pas pu être écrit.", "erreur")
        null
    }
}
`;

const SCAN_ABSENT_KT = '';
