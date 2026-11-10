/**
 * Les médias sur Android : le code QR (ZXing), le son et la vidéo (Media3,
 * le lecteur d'Android), les graphiques (dessinés par Compose, avec les
 * couleurs et les graduations du web), les cartes (OpenStreetMap, par
 * osmdroid) et les tableaux. Les gabarits Kotlin s'écrivent `#{…}`.
 */

export const QR_KT = String.raw`// Produit par Humalis : le code QR, dessiné d'après ZXing.
package PAQUET

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter

/** « qr "https://…" » : noir sur blanc, même en mode sombre, pour qu'un appareil photo le lise. */
@Composable
fun QrHumalis(texte: String, description: String?, modifier: Modifier = Modifier) {
    val matrice = remember(texte) { QRCodeWriter().encode(texte.ifEmpty { " " }, BarcodeFormat.QR_CODE, 0, 0, mapOf(EncodeHintType.MARGIN to 0)) }
    Canvas(modifier.widthIn(max = 240.dp).aspectRatio(1f).background(Color.White).padding(12.dp).semantics { contentDescription = description ?: "Code QR" }) {
        val case = size.width / matrice.width
        for (y in 0 until matrice.height) for (x in 0 until matrice.width) {
            if (matrice[x, y]) drawRect(Color.Black, Offset(x * case, y * case), Size(case + 0.5f, case + 0.5f))
        }
    }
}
`;

export const LECTEURS_KT = String.raw`// Produit par Humalis : le son et la vidéo, lus par Media3 ; ils ne démarrent jamais tout seuls.
package PAQUET

import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView

/** Un fichier de l'application (« locale »), ou une adresse. */
private fun adresseMedia(source: String, locale: Boolean): Uri = if (locale) Uri.parse("asset:///" + source) else Uri.parse(source)

@Composable
private fun joueur(source: String, locale: Boolean, boucle: Boolean): ExoPlayer {
    val lecteur = remember(source) {
        ExoPlayer.Builder(Appli.contexte).build().apply {
            setMediaItem(MediaItem.fromUri(adresseMedia(source, locale)))
            repeatMode = if (boucle) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
            prepare()
        }
    }
    DisposableEffect(lecteur) { onDispose { lecteur.release() } }
    return lecteur
}

@Composable
private fun Transcription(transcription: String?) {
    if (transcription == null) return
    var ouverte by remember { mutableStateOf(false) }
    TextButton(onClick = { ouverte = !ouverte }) { Text(if (ouverte) "Masquer la transcription" else "Lire la transcription") }
    if (ouverte) Text(transcription)
}

/** « audio "entretien.mp3" » : lecture et pause, et la transcription de ce qui est dit. */
@Composable
fun LecteurHumalis(source: String, locale: Boolean, description: String?, transcription: String?, boucle: Boolean = false, modifier: Modifier = Modifier) {
    val lecteur = joueur(source, locale, boucle)
    var joue by remember { mutableStateOf(false) }
    DisposableEffect(lecteur) {
        val ecoute = object : Player.Listener { override fun onIsPlayingChanged(enCours: Boolean) { joue = enCours } }
        lecteur.addListener(ecoute)
        onDispose { lecteur.removeListener(ecoute) }
    }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            FilledTonalButton(onClick = { if (joue) lecteur.pause() else lecteur.play() }, modifier = Modifier.semantics { contentDescription = (if (joue) "Pause" else "Lecture") + (description?.let { " : #{it}" } ?: "") }) {
                Text(if (joue) "Pause" else "Lecture")
            }
            if (description != null) Text(description)
        }
        Transcription(transcription)
    }
}

/** « video "visite.mp4" avec commandes » : les commandes de Media3 (lecture, avance, son, plein écran). */
@Composable
fun VideoHumalis(source: String, locale: Boolean, description: String?, transcription: String?, boucle: Boolean = false, modifier: Modifier = Modifier) {
    val lecteur = joueur(source, locale, boucle)
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        AndroidView(
            factory = { PlayerView(it).apply { player = lecteur; useController = true; contentDescription = description } },
            modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
        )
        Transcription(transcription)
    }
}
`;

export const GRAPHIQUES_KT = String.raw`// Produit par Humalis : les graphiques, dessinés par Compose avec les couleurs et les graduations du web.
package PAQUET

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/** Une série : son nom, ses valeurs, sa couleur (sinon celle de la palette du web). */
data class SerieHumalis(val nom: String, val valeurs: List<Double>, val couleur: CouleurHumalis? = null)

private val PALETTE = listOf(Couleurs.bleu, Couleurs.orange, Couleurs.vert, Couleurs.violet, Couleurs.rose, Couleurs.gris)

/** Des graduations « jolies » (1, 2 ou 5 fois une puissance de 10, environ cinq) de min à max, avec min ≤ 0 ≤ max. */
fun graduations(minimum: Double, maximum: Double): List<Double> {
    val max = if (maximum == minimum) minimum + 1 else maximum
    val brut = (max - minimum) / 5
    val puissance = Math.pow(10.0, Math.floor(Math.log10(brut)))
    val rapport = brut / puissance
    val pas = (if (rapport <= 1) 1.0 else if (rapport <= 2) 2.0 else if (rapport <= 5) 5.0 else 10.0) * puissance
    return (Math.floor(minimum / pas + 1e-9).toInt()..Math.ceil(max / pas - 1e-9).toInt()).map { it * pas }
}

/** « graphique en courbe … », « en barres … », « en camembert … » : le dessin, sa description, et la table de ses données. */
@Composable
fun GraphiqueHumalis(genre: String, titre: String, description: String, etiquettes: List<String>, series: List<SerieHumalis>, devise: String? = null, proportions: Float = 16f / 9f, modifier: Modifier = Modifier) {
    val palette = PALETTE.map { it.lue() }
    val couleurs = series.mapIndexed { i, s -> s.couleur?.lue() ?: palette[i % palette.size] }
    val encre = MaterialTheme.colorScheme.onSurfaceVariant
    val trait = MaterialTheme.colorScheme.outlineVariant
    val ecrire = { v: Double -> if (devise != null) formaterArgent(v, devise) else formaterNombre(v) }
    var donnees by remember { mutableStateOf(false) }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Canvas(Modifier.fillMaxWidth().aspectRatio(if (genre == "camembert") 1.6f else proportions).semantics { contentDescription = "#{titre}. #{description}" }) {
            val texte = android.graphics.Paint().apply { color = encre.toArgb(); textSize = 11.dp.toPx(); isAntiAlias = true }
            if (genre == "camembert") {
                val valeurs = series.firstOrNull()?.valeurs ?: emptyList()
                val total = valeurs.sum().takeIf { it > 0 } ?: 1.0
                val rayon = Math.min(size.height, size.width * 0.55f) / 2 * 0.92f
                val centre = Offset(rayon + 4.dp.toPx(), size.height / 2)
                var depart = -90f
                valeurs.forEachIndexed { i, v ->
                    val angle = (v / total * 360).toFloat()
                    drawArc(palette[i % palette.size], depart, angle, true, Offset(centre.x - rayon, centre.y - rayon), Size(rayon * 2, rayon * 2))
                    depart += angle
                }
                // La légende : chaque part, son libellé et sa part du total.
                val x = centre.x + rayon + 16.dp.toPx()
                valeurs.forEachIndexed { i, v ->
                    val y = 16.dp.toPx() + i * 20.dp.toPx()
                    drawCircle(palette[i % palette.size], 5.dp.toPx(), Offset(x, y - 4.dp.toPx()))
                    drawContext.canvas.nativeCanvas.drawText((etiquettes.getOrNull(i) ?: "") + " " + Math.round(v / total * 100) + " %", x + 10.dp.toPx(), y, texte)
                }
                return@Canvas
            }
            val toutes = series.flatMap { it.valeurs }
            val echelle = graduations(Math.min(0.0, toutes.minOrNull() ?: 0.0), Math.max(0.0, toutes.maxOrNull() ?: 1.0))
            val bas = echelle.first()
            val haut = echelle.last()
            // La marge de gauche suit la plus longue graduation écrite.
            val gauche = (echelle.maxOfOrNull { texte.measureText(ecrire(it)) } ?: 0f) + 10.dp.toPx()
            val pied = 24.dp.toPx()
            val largeur = size.width - gauche
            val hauteur = size.height - pied
            val yDe = { v: Double -> (hauteur - (v - bas) / (haut - bas) * hauteur).toFloat() }
            for (g in echelle) {
                val y = yDe(g)
                drawLine(trait, Offset(gauche, y), Offset(size.width, y), 1.dp.toPx())
                drawContext.canvas.nativeCanvas.drawText(ecrire(g), 0f, y + 4.dp.toPx(), texte)
            }
            val n = etiquettes.size.coerceAtLeast(1)
            val colonne = largeur / n
            etiquettes.forEachIndexed { i, nom ->
                drawContext.canvas.nativeCanvas.drawText(nom, gauche + colonne * i + colonne / 2 - texte.measureText(nom) / 2, size.height - 4.dp.toPx(), texte)
            }
            if (genre == "barres") {
                val groupe = colonne * 0.7f
                val barre = groupe / series.size.coerceAtLeast(1)
                series.forEachIndexed { s, serie ->
                    serie.valeurs.forEachIndexed { i, v ->
                        val x = gauche + colonne * i + (colonne - groupe) / 2 + barre * s
                        val y = yDe(Math.max(v, 0.0))
                        drawRoundRect(couleurs[s], Offset(x + 1.dp.toPx(), y), Size(barre - 2.dp.toPx(), yDe(Math.min(v, 0.0)) - y), CornerRadius(3.dp.toPx()))
                    }
                }
            } else {
                series.forEachIndexed { s, serie ->
                    val chemin = Path()
                    serie.valeurs.forEachIndexed { i, v ->
                        val point = Offset(gauche + colonne * i + colonne / 2, yDe(v))
                        if (i == 0) chemin.moveTo(point.x, point.y) else chemin.lineTo(point.x, point.y)
                        drawCircle(couleurs[s], 4.dp.toPx(), point)
                    }
                    drawPath(chemin, couleurs[s], style = Stroke(width = 2.5f.dp.toPx()))
                }
            }
        }
        if (series.size > 1) {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                series.forEachIndexed { i, s ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(10.dp).background(couleurs[i], CircleShape))
                        Text(s.nom, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        TextButton(onClick = { donnees = !donnees }) { Text(if (donnees) "Masquer les données" else "Voir les données") }
        if (donnees) TableauHumalis("Les données du graphique", listOf("") + series.map { it.nom }, etiquettes.mapIndexed { i, nom -> listOf(nom) + series.map { s -> s.valeurs.getOrNull(i)?.let(ecrire) ?: "" } })
    }
}

/** Un tableau : sa légende, ses colonnes et ses rangées de même largeur. */
@Composable
fun TableauHumalis(legende: String, colonnes: List<String>, rangees: List<List<String>>, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(legende, style = MaterialTheme.typography.titleSmall)
        Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant).padding(vertical = 6.dp)) {
            for (c in colonnes) Text(c, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f).padding(horizontal = 6.dp))
        }
        for (r in rangees) Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            for (c in r) Text(c, modifier = Modifier.weight(1f).padding(horizontal = 6.dp))
        }
    }
}
`;

export const CARTES_KT = String.raw`// Produit par Humalis : les cartes, avec les tuiles d'OpenStreetMap (osmdroid).
package PAQUET

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import org.osmdroid.config.Configuration as ConfigurationCarte
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.tileprovider.tilesource.XYTileSource
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker

/** L'épingle d'un marqueur, à la couleur de la marque : un rond sur une pointe, avec un point blanc. */
private fun epingle(contexte: android.content.Context, couleur: Int): android.graphics.drawable.Drawable {
    val d = contexte.resources.displayMetrics.density
    val image = android.graphics.Bitmap.createBitmap((28 * d).toInt(), (40 * d).toInt(), android.graphics.Bitmap.Config.ARGB_8888)
    val toile = android.graphics.Canvas(image)
    val pinceau = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = couleur }
    val r = 14 * d
    val pointe = android.graphics.Path().apply { moveTo(r * 0.25f, r * 1.4f); lineTo(r, 40 * d); lineTo(r * 1.75f, r * 1.4f); close() }
    toile.drawPath(pointe, pinceau)
    toile.drawCircle(r, r, r, pinceau)
    pinceau.color = android.graphics.Color.WHITE
    toile.drawCircle(r, r, r * 0.4f, pinceau)
    return android.graphics.drawable.BitmapDrawable(contexte.resources, image)
}

/** Un lieu de la carte : son nom (la bulle), et sa position. */
data class LieuHumalis(val nom: String, val latitude: Double, val longitude: Double)

/** « carte "Nos boutiques" : marqueur … » : la carte s'ajuste à ses marqueurs, ou à son centre et son zoom. */
@Composable
fun CarteHumalis(nom: String, lieux: List<LieuHumalis>, latitude: Double? = null, longitude: Double? = null, zoom: Double? = null, tuiles: Pair<String, String>? = null, modifier: Modifier = Modifier) {
    val couleurEpingle = MaterialTheme.colorScheme.primary.toArgb()
    Column(modifier.fillMaxWidth()) {
        AndroidView(
            factory = { contexte ->
                ConfigurationCarte.getInstance().userAgentValue = contexte.packageName
                MapView(contexte).apply {
                    setMultiTouchControls(true)
                    setTileSource(tuiles?.let { (adresse, _) -> XYTileSource("Humalis", 0, 19, 256, "", arrayOf(adresse.substringBefore("{z}"))) } ?: TileSourceFactory.MAPNIK)
                }
            },
            update = { carte ->
                carte.overlays.removeAll { it is Marker }
                val epingle = epingle(carte.context, couleurEpingle)
                for (lieu in lieux) {
                    carte.overlays.add(Marker(carte).apply { position = GeoPoint(lieu.latitude, lieu.longitude); title = lieu.nom; icon = epingle; setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM) })
                }
                if (latitude != null && longitude != null) {
                    carte.controller.setZoom(zoom ?: 13.0)
                    carte.controller.setCenter(GeoPoint(latitude, longitude))
                } else if (lieux.size == 1) {
                    carte.controller.setZoom(15.0)
                    carte.controller.setCenter(GeoPoint(lieux[0].latitude, lieux[0].longitude))
                } else if (lieux.size > 1) {
                    // La carte s'ajuste à ses marqueurs une fois qu'elle connaît sa taille.
                    val boite = BoundingBox.fromGeoPoints(lieux.map { GeoPoint(it.latitude, it.longitude) })
                    val ajuster = { carte.zoomToBoundingBox(boite, false, (64 * carte.resources.displayMetrics.density).toInt()) }
                    if (carte.width > 0) ajuster() else carte.addOnFirstLayoutListener { _, _, _, _, _ -> ajuster() }
                }
                carte.invalidate()
            },
            modifier = Modifier.fillMaxWidth().height(320.dp).clip(RoundedCornerShape(8.dp)).semantics { contentDescription = nom },
        )
        // L'attribution des tuiles reste toujours affichée.
        Text(tuiles?.second ?: "© les contributeurs d'OpenStreetMap", style = MaterialTheme.typography.labelSmall)
    }
}
`;

export const MOUVEMENT_KT = String.raw`// Produit par Humalis : les animations d'entrée, l'effet au survol et les listes qui glissent.
package PAQUET

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.zIndex

/** « mouvement est reduit » : la personne a demandé de réduire les animations (Réglages, Accessibilité). */
fun mouvementReduit(): Boolean =
    Settings.Global.getFloat(Appli.contexte.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f

/** L'élément arrive en douceur ; rien ne bouge si l'appareil demande de réduire les animations. */
fun Modifier.animeHumalis(animation: String, duree: Int = 300, delai: Int = 0): Modifier = composed {
    val reduit = remember { mouvementReduit() }
    val progression = remember { Animatable(if (reduit) 1f else 0f) }
    LaunchedEffect(Unit) { if (!reduit) progression.animateTo(1f, tween(durationMillis = duree, delayMillis = delai)) }
    val decalage = with(LocalDensity.current) { 16.dp.toPx() }
    graphicsLayer {
        val p = progression.value
        alpha = p
        if (animation == "montee") translationY = (1 - p) * decalage
        if (animation == "agrandissement") { val e = 0.95f + 0.05f * p; scaleX = e; scaleY = e }
    }
}

/** « effet leve », « effet agrandi » : au survol d'une souris ou d'un pavé tactile. */
fun Modifier.effetHumalis(effet: String): Modifier = composed {
    val source = remember { MutableInteractionSource() }
    val survole by source.collectIsHoveredAsState()
    val actif = survole && !remember { mouvementReduit() }
    val decalage = with(LocalDensity.current) { 2.dp.toPx() }
    hoverable(source).graphicsLayer {
        if (actif && effet == "leve") translationY = -decalage
        if (actif && effet == "agrandi") { scaleX = 1.03f; scaleY = 1.03f }
    }
}

/**
 * « avec deplacement » : un appui long prend l'élément, le doigt le déplace, le lâcher le dépose.
 * Le lecteur d'écran (TalkBack) propose « Monter » et « Descendre ». « apres » suit chaque déplacement terminé.
 */
@Composable
fun ListeDeplacableHumalis(elements: List<Any?>, changer: (List<Any?>) -> Unit, apres: () -> Unit, contenu: @Composable ColumnScope.(Any?) -> Unit) {
    val actuels by rememberUpdatedState(elements)
    var pris by remember { mutableStateOf<String?>(null) }
    var decalage by remember { mutableFloatStateOf(0f) }
    val hauteurs = remember { mutableStateMapOf<String, Int>() }
    val vibreur = LocalHapticFeedback.current
    val espace = with(LocalDensity.current) { 8.dp.toPx() }
    fun cleDe(element: Any?): String = identifiant(element).ifEmpty { element.hashCode().toString() }
    fun deplacer(depart: Int, arrivee: Int): Boolean {
        val l = actuels
        if (depart !in l.indices || arrivee !in l.indices) return false
        val m = l.toMutableList()
        m.add(arrivee, m.removeAt(depart))
        changer(m)
        return true
    }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (element in elements) {
            val cle = cleDe(element)
            key(cle) {
                val estPris = pris == cle
                Column(
                    Modifier.fillMaxWidth()
                        .onSizeChanged { hauteurs[cle] = it.height }
                        .zIndex(if (estPris) 1f else 0f)
                        .graphicsLayer {
                            if (estPris) {
                                translationY = decalage
                                shadowElevation = 12f
                                scaleX = 1.02f
                                scaleY = 1.02f
                            }
                        }
                        .pointerInput(cle) {
                            val fin = {
                                if (pris != null) {
                                    pris = null
                                    decalage = 0f
                                    apres()
                                }
                            }
                            detectDragGesturesAfterLongPress(
                                onDragStart = {
                                    pris = cle
                                    decalage = 0f
                                    vibreur.performHapticFeedback(HapticFeedbackType.LongPress)
                                },
                                onDragEnd = fin,
                                onDragCancel = fin,
                            ) { changement, quantite ->
                                changement.consume()
                                decalage += quantite.y
                                val i = actuels.indexOfFirst { cleDe(it) == cle }
                                // Passé la moitié de l'élément voisin, les deux échangent leur place.
                                if (decalage > 0 && i in 0 until actuels.size - 1) {
                                    val h = (hauteurs[cleDe(actuels[i + 1])] ?: 0) + espace
                                    if (decalage > h / 2 && deplacer(i, i + 1)) decalage -= h
                                } else if (decalage < 0 && i > 0) {
                                    val h = (hauteurs[cleDe(actuels[i - 1])] ?: 0) + espace
                                    if (-decalage > h / 2 && deplacer(i, i - 1)) decalage += h
                                }
                            }
                        }
                        .semantics {
                            customActions = listOf(
                                CustomAccessibilityAction("Monter") {
                                    val i = actuels.indexOfFirst { cleDe(it) == cle }
                                    deplacer(i, i - 1).also { if (it) apres() }
                                },
                                CustomAccessibilityAction("Descendre") {
                                    val i = actuels.indexOfFirst { cleDe(it) == cle }
                                    deplacer(i, i + 1).also { if (it) apres() }
                                },
                            )
                        },
                ) { contenu(element) }
            }
        }
    }
}
`;

export const MENUS_KT = String.raw`// Produit par Humalis : « menu de l'application » : le menu « ⋮ » en haut de l'application et ses raccourcis.
package PAQUET

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

class CommandeHumalis(val titre: String, val raccourci: String?, val action: suspend () -> Unit)
class MenuHumalis(val titre: String, val commandes: List<CommandeHumalis>)

/** Le raccourci d'une commande, avec un clavier branché (tablette, Chromebook). */
fun raccourciDesMenus(menus: List<MenuHumalis>, evenement: KeyEvent, lancer: (suspend () -> Unit) -> Unit): Boolean {
    val commande = menus.flatMap { it.commandes }.firstOrNull { it.raccourci != null && correspond(evenement, it.raccourci) } ?: return false
    lancer(commande.action)
    return true
}

/** « Ctrl+N » pour « ctrl+n », comme Android l'écrit dans ses menus. */
private fun lisible(touches: String): String = touches.split("+").joinToString("+") { morceau ->
    when (morceau.lowercase()) {
        "cmd", "commande", "ctrl", "controle" -> "Ctrl"
        "maj", "majuscule", "shift" -> "Maj"
        "alt", "option" -> "Alt"
        else -> morceau.uppercase()
    }
}

/** Une barre fine en haut de l'application : le bouton « ⋮ » ouvre les menus, chacun sous son titre. */
@Composable
fun BarreMenusHumalis(menus: List<MenuHumalis>, lancer: (suspend () -> Unit) -> Unit) {
    var ouvert by remember { mutableStateOf(false) }
    val couleur = MaterialTheme.colorScheme.onSurface
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), horizontalArrangement = Arrangement.End) {
        Box {
            IconButton(onClick = { ouvert = true }, modifier = Modifier.semantics { contentDescription = "Menu de l'application" }) {
                Canvas(Modifier.size(24.dp)) {
                    val r = 2.dp.toPx()
                    for (i in -1..1) drawCircle(couleur, r, Offset(size.width / 2, size.height / 2 + i * 6.dp.toPx()))
                }
            }
            DropdownMenu(expanded = ouvert, onDismissRequest = { ouvert = false }) {
                menus.forEachIndexed { rang, menu ->
                    if (rang > 0) HorizontalDivider()
                    if (menus.size > 1 || menu.titre.isNotEmpty()) {
                        Text(menu.titre, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp).semantics { heading() })
                    }
                    for (commande in menu.commandes) {
                        DropdownMenuItem(
                            text = { Text(commande.titre) },
                            trailingIcon = commande.raccourci?.let { r -> { Text(lisible(r), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
                            onClick = {
                                ouvert = false
                                lancer(commande.action)
                            },
                        )
                    }
                }
            }
        }
    }
}
`;

export const NATIFS_KT = String.raw`// Produit par Humalis : les composants natifs d'Android — tirer pour actualiser, glisser une ligne, options au toucher prolongé, écran vide.
package PAQUET

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/** Une action proposée par le système : son titre et ce qu'elle fait. */
class ActionHumalis(val titre: String, val faire: () -> Unit)

/** « actualiser en tirant : » : tirer la page vers le bas relance l'action ; le rond tourne tant qu'elle dure. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActualiserHumalis(faire: suspend () -> Unit, contenu: @Composable () -> Unit) {
    var enCours by remember { mutableStateOf(false) }
    val portee = rememberCoroutineScope()
    PullToRefreshBox(
        isRefreshing = enCours,
        onRefresh = {
            portee.launch {
                enCours = true
                try { faire() } finally { enCours = false }
            }
        },
        modifier = Modifier.fillMaxSize(),
    ) { contenu() }
}

/** « action en glissant » : la ligne glisse vers la gauche et montre ses actions ; TalkBack les propose aussi. */
@Composable
fun GlisserHumalis(actions: List<ActionHumalis>, contenu: @Composable ColumnScope.() -> Unit) {
    var largeurActions by remember { mutableFloatStateOf(0f) }
    var decalage by remember { mutableFloatStateOf(0f) }
    val montre by animateFloatAsState(decalage, label = "glisser")
    var glisse by remember { mutableStateOf(false) }
    Box(
        Modifier.fillMaxWidth().semantics {
            customActions = actions.map { a -> CustomAccessibilityAction(a.titre) { a.faire(); true } }
        },
    ) {
        Row(Modifier.matchParentSize(), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
            // Fermées, les actions ne sont pas lues deux fois par TalkBack : la ligne les propose déjà.
            Row(
                Modifier.fillMaxHeight().onSizeChanged { largeurActions = it.width.toFloat() }.background(MaterialTheme.colorScheme.errorContainer)
                    .then(if (decalage == 0f) Modifier.clearAndSetSemantics { } else Modifier),
            ) {
                for (a in actions) {
                    Box(Modifier.fillMaxHeight().clickable { decalage = 0f; a.faire() }.padding(horizontal = 20.dp), contentAlignment = Alignment.Center) {
                        Text(a.titre, color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
        Column(
            Modifier.fillMaxWidth()
                .graphicsLayer { translationX = if (glisse) decalage else montre }
                .background(MaterialTheme.colorScheme.surface)
                .pointerInput(Unit) {
                    detectHorizontalDragGestures(
                        onDragStart = { glisse = true },
                        onDragEnd = {
                            glisse = false
                            // Passé la moitié, les actions restent ouvertes ; sinon la ligne revient.
                            decalage = if (-decalage > largeurActions / 2) -largeurActions else 0f
                        },
                        onDragCancel = { glisse = false; decalage = 0f },
                    ) { changement, quantite ->
                        changement.consume()
                        decalage = (decalage + quantite).coerceIn(-largeurActions, 0f)
                    }
                },
        ) { contenu() }
    }
}

/** « menu d'options » : un toucher prolongé sur l'élément ouvre ses options ; TalkBack les propose aussi. */
@Composable
fun OptionsHumalis(actions: List<ActionHumalis>, contenu: @Composable () -> Unit) {
    var ouvert by remember { mutableStateOf(false) }
    val vibreur = LocalHapticFeedback.current
    Box(
        Modifier
            .pointerInput(Unit) {
                detectTapGestures(onLongPress = {
                    vibreur.performHapticFeedback(HapticFeedbackType.LongPress)
                    ouvert = true
                })
            }
            .semantics { customActions = actions.map { a -> CustomAccessibilityAction(a.titre) { a.faire(); true } } },
    ) {
        contenu()
        DropdownMenu(expanded = ouvert, onDismissRequest = { ouvert = false }) {
            for (a in actions) DropdownMenuItem(text = { Text(a.titre) }, onClick = { ouvert = false; a.faire() })
        }
    }
}

/** « etat vide » : une icône, un titre et une explication, au milieu. */
@Composable
fun EtatVideHumalis(titre: String, description: String?, icone: ImageVector) {
    Column(Modifier.fillMaxWidth().padding(vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icone, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(titre, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (description != null) Text(description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    }
}
`;
