/**
 * Les réunions sur Android, par le SDK LiveKit pour Android. La barre (micro, caméra, écran, main)
 * s'écrit en Humalis ; ici, l'image des participants et les gestes, comme Reunion.swift sur Apple.
 * Les gabarits Kotlin s'écrivent `#{…}` : `kotlin()` les remet en `${…}`.
 */
import type { Application } from '../../ri/types.js';

/** Version publiée le 26 octobre 2026, épinglée : aucune mise à jour sans qu'on la décide. */
export const VERSION_LIVEKIT_ANDROID = '2.29.2';

/** LiveKit passe par audioswitch, publié sur JitPack seulement : ce dépôt ne sert qu'à ce paquet. */
export const DEPOT_JITPACK = `        maven("https://jitpack.io") {
            content { includeGroup("com.github.davidliu") }
        }
`;

export const avecReunionAndroid = (application: Application): boolean => JSON.stringify([application.ecrans, application.composants]).includes('"type":"gesteReunion"');

export const REUNION_KT = String.raw`// Produit par Humalis : la réunion en cours, par LiveKit.
package PAQUET

import android.Manifest
import android.app.Activity
import android.content.Context
import android.media.projection.MediaProjectionManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import io.livekit.android.LiveKit
import io.livekit.android.RoomOptions
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.renderer.TextureViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.participant.LocalParticipant
import io.livekit.android.room.participant.Participant
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoTrack
import io.livekit.android.room.track.screencapture.ScreenCaptureParams
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import livekit.org.webrtc.RendererCommon

/** Une image de la grille : la caméra ou l'écran d'une personne. */
class TuileReunion(val id: String, val nom: String, val piste: VideoTrack?, val main: Boolean, val microCoupe: Boolean, val locale: Boolean)

object Reunion {
    /** Les tuiles que la page dessine ; elles changent à chaque nouvelle de LiveKit. */
    var tuiles by mutableStateOf<List<TuileReunion>>(emptyList())
        private set
    private var salle = ""
    private var piece: Room? = null
    private var ecoute: Job? = null
    private val portee = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private fun dessiner() {
        val p = piece
        if (p == null) {
            tuiles = emptyList()
            return
        }
        val tous: List<Participant> = listOf<Participant>(p.localParticipant) + p.remoteParticipants.values.sortedBy { it.name ?: "" }
        val lues = mutableListOf<TuileReunion>()
        for (personne in tous) {
            val identite = personne.identity?.value ?: ""
            val nom = personne.name?.takeIf { it.isNotEmpty() } ?: identite.ifEmpty { "?" }
            val locale = personne is LocalParticipant
            val main = personne.attributes["main"] == "1"
            val microCoupe = !personne.isMicrophoneEnabled
            val ecran = personne.getTrackPublication(Track.Source.SCREEN_SHARE)?.takeIf { !it.muted }?.track as? VideoTrack
            if (ecran != null) lues.add(TuileReunion("#{identite}:ecran", nom, ecran, main, microCoupe, false))
            val camera = if (personne.isCameraEnabled) personne.getTrackPublication(Track.Source.CAMERA)?.track as? VideoTrack else null
            lues.add(TuileReunion("#{identite}:camera", nom, camera, main, microCoupe, locale))
        }
        tuiles = lues
    }

    /** Un rendu vidéo partage le contexte graphique de la pièce. */
    fun preparer(rendu: TextureViewRenderer) {
        piece?.initVideoRenderer(rendu)
    }

    /** Dit au serveur que l'état a changé : les listes de participants se relisent. */
    private fun annoncer() {
        if (salle.isEmpty()) return
        val nom = salle
        portee.launch { Serveur.appelReussi("/api/salles_geste", "POST", fiche("salle" to nom, "participant" to "", "geste" to "etat")) }
    }

    private suspend fun essayer(action: suspend (LocalParticipant) -> Unit) {
        val p = piece ?: return
        try {
            action(p.localParticipant)
        } catch (e: Exception) {
            Messages.afficher("La caméra, le micro ou l'écran n'ont pas pu changer : vérifiez les autorisations dans les réglages.", "erreur")
        }
        dessiner()
        annoncer()
    }

    suspend fun rejoindre(nom: String) {
        if (piece != null && salle == nom) return
        quitter()
        val acces = try {
            Serveur.appel("/api/salles_jeton", "POST", fiche("salle" to nom))
        } catch (e: ErreurHumalis) {
            Messages.afficher(e.raison, "erreur")
            return
        }
        val adresse = texte(champ(acces, "adresse"))
        val jeton = texte(champ(acces, "jeton"))
        val video = champ(acces, "video") == true
        // Les autorisations avant la connexion : publier pendant que la question est posée échouerait.
        val micro = permission(Manifest.permission.RECORD_AUDIO)
        val camera = video && permission(Manifest.permission.CAMERA)
        if (!micro) Messages.afficher("Le micro est refusé : autorisez-le dans les réglages pour parler.", "avertissement")
        if (video && !camera) Messages.afficher("La caméra est refusée : autorisez-la dans les réglages pour être vu.", "avertissement")
        val nouvelle = LiveKit.create(Appli.contexte, RoomOptions(adaptiveStream = false, dynacast = true))
        piece = nouvelle
        salle = nom
        ecoute = portee.launch {
            nouvelle.events.collect { evenement ->
                when (evenement) {
                    // Une personne qui anime coupe ce micro : la page l'apprend par le serveur.
                    is RoomEvent.TrackMuted, is RoomEvent.TrackUnmuted -> {
                        dessiner()
                        val qui = if (evenement is RoomEvent.TrackMuted) evenement.participant else (evenement as RoomEvent.TrackUnmuted).participant
                        if (qui is LocalParticipant) annoncer()
                    }
                    is RoomEvent.Disconnected -> if (piece === nouvelle) {
                        piece = null
                        salle = ""
                        dessiner()
                        Messages.afficher("Vous n'êtes plus dans la réunion.", "avertissement")
                    }
                    else -> dessiner()
                }
            }
        }
        try {
            nouvelle.connect(adresse, jeton)
        } catch (e: Exception) {
            ecoute?.cancel()
            nouvelle.release()
            piece = null
            salle = ""
            Messages.afficher("La réunion n'a pas pu commencer : le serveur des réunions ne répond pas.", "erreur")
            return
        }
        // Le micro et la caméra séparément : une caméra absente ou occupée n'empêche pas de parler.
        if (micro) try { nouvelle.localParticipant.setMicrophoneEnabled(true) } catch (e: Exception) { Messages.afficher("Le micro n'a pas pu démarrer.", "erreur") }
        if (camera) try { nouvelle.localParticipant.setCameraEnabled(true) } catch (e: Exception) { Messages.afficher("La caméra n'a pas pu démarrer.", "erreur") }
        dessiner()
        annoncer()
    }

    suspend fun quitter() {
        val ancienne = piece ?: return
        val ancienneSalle = salle
        piece = null
        salle = ""
        ecoute?.cancel()
        ecoute = null
        tuiles = emptyList()
        ancienne.disconnect()
        ancienne.release()
        Serveur.appelReussi("/api/salles_geste", "POST", fiche("salle" to ancienneSalle, "participant" to "", "geste" to "etat"))
    }

    suspend fun couperMicro() = essayer { it.setMicrophoneEnabled(false) }
    suspend fun activerMicro() = essayer { if (permission(Manifest.permission.RECORD_AUDIO)) it.setMicrophoneEnabled(true) }
    suspend fun couperCamera() = essayer { it.setCameraEnabled(false) }
    suspend fun activerCamera() = essayer { if (permission(Manifest.permission.CAMERA)) it.setCameraEnabled(true) }
    suspend fun leverMain() = essayer { it.updateAttributes(mapOf("main" to "1")) }
    suspend fun baisserMain() = essayer { it.updateAttributes(mapOf("main" to "0")) }
    suspend fun arreterPartage() = essayer { it.setScreenShareEnabled(false) }

    /** Le système demande d'abord à la personne ce qu'elle partage ; LiveKit garde le partage dans un service au premier plan. */
    suspend fun partagerEcran() {
        if (piece == null) return
        val projection = Appli.contexte.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val reponse = Activite.demander(ActivityResultContracts.StartActivityForResult(), projection.createScreenCaptureIntent())
        val donnees = reponse?.data
        if (reponse?.resultCode != Activity.RESULT_OK || donnees == null) return
        essayer { it.setScreenShareEnabled(true, ScreenCaptureParams(donnees, onStop = { portee.launch { dessiner(); annoncer() } })) }
    }
}

/** Une image vidéo : le rendu de LiveKit, branché tant que la tuile est à l'écran. */
@Composable
private fun ImageReunion(piste: VideoTrack, miroir: Boolean, modifier: Modifier) {
    var rendu by androidx.compose.runtime.remember { mutableStateOf<TextureViewRenderer?>(null) }
    AndroidView(
        factory = { contexte ->
            TextureViewRenderer(contexte).also {
                Reunion.preparer(it)
                it.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                rendu = it
            }
        },
        update = { it.setMirror(miroir) },
        onRelease = { it.release() },
        modifier = modifier,
    )
    DisposableEffect(piste, rendu) {
        val r = rendu
        if (r != null) piste.addRenderer(r)
        onDispose { if (r != null) piste.removeRenderer(r) }
    }
}

/** « reunion "…" » : les images des participants, deux par ligne (plus sur un grand écran). */
@Composable
fun ReunionVue(modifier: Modifier = Modifier) {
    val parLigne = if (LocalConfiguration.current.screenWidthDp >= 600) 3 else 2
    Column(modifier.fillMaxWidth()) {
        for (ligne in Reunion.tuiles.chunked(parLigne)) {
            Row(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                for ((rang, tuile) in ligne.withIndex()) {
                    if (rang > 0) Spacer(Modifier.width(8.dp))
                    val legende = tuile.nom + (if (tuile.main) " ✋" else "") + (if (tuile.microCoupe) " (micro coupé)" else "")
                    Box(
                        Modifier.weight(1f).aspectRatio(16f / 9f).clip(RoundedCornerShape(8.dp)).background(Color(0xFF1C1C1C)).semantics { contentDescription = legende },
                    ) {
                        val piste = tuile.piste
                        if (piste != null) ImageReunion(piste, tuile.locale, Modifier.fillMaxSize())
                        else Text(tuile.nom.take(1).uppercase(), color = Color.White, fontSize = 40.sp, modifier = Modifier.align(Alignment.Center))
                        Text(legende, color = Color.White, fontSize = 13.sp, modifier = Modifier.align(Alignment.BottomStart).padding(8.dp))
                    }
                }
                for (vide in ligne.size until parLigne) {
                    Spacer(Modifier.width(8.dp))
                    Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}
`;
