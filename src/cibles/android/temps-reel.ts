/**
 * Le temps réel et le hors-ligne sur Android : « en direct » (le serveur
 * annonce un changement, la page relit sa route), les envois « … hors ligne »
 * (gardés sur l'appareil, envoyés dans l'ordre quand le réseau revient) et
 * « en arriere plan : » (WorkManager réveille l'application). Les gabarits
 * Kotlin s'écrivent `#{…}`.
 */
import { JOURS_ENVOIS_GARDES } from '../envois-gardes.js';

export const DIRECT_KT = String.raw`// Produit par Humalis : « en direct » : le serveur annonce un changement, la page relit sa route.
package PAQUET

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicReference
import kotlin.random.Random
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Écoute « adresse/direct » tant que la page est ouverte. La connexion reste ouverte : une annonce
 * arrivée pendant une relecture n'est pas perdue. Une coupure attend puis reprend, et la page relit ce qu'elle a pu manquer.
 */
suspend fun ecouterDirect(adresse: String, relire: suspend () -> Unit): Unit = coroutineScope {
    val annonces = Channel<Unit>(Channel.CONFLATED)
    val ouverte = AtomicReference<HttpURLConnection?>(null)
    val relecture = launch {
        for (annonce in annonces) {
            // Le hasard évite que tout le monde relise au même instant.
            delay(Random.nextLong(120, 920))
            relire()
        }
    }
    // Quitter la page ferme la connexion tout de suite, sans attendre le prochain battement.
    val veille = launch {
        try { awaitCancellation() } finally { withContext(NonCancellable + Dispatchers.IO) { ouverte.get()?.disconnect() } }
    }
    var attente = 1000L
    var dejaOuvert = false
    try {
        while (isActive) {
            val code = withContext(Dispatchers.IO) {
                try {
                    val connexion = URL(Configuration.SERVEUR.trimEnd('/') + (if (adresse.startsWith("/")) adresse else "/" + adresse) + "/direct").openConnection() as HttpURLConnection
                    ouverte.set(connexion)
                    connexion.setRequestProperty("Accept", "text/event-stream")
                    connexion.setRequestProperty("x-humalis-mobile", "1")
                    Session.jeton?.let { connexion.setRequestProperty("Authorization", "Bearer " + it) }
                    connexion.connectTimeout = 15000
                    // Le serveur bat toutes les 25 secondes : un silence plus long est une coupure muette.
                    connexion.readTimeout = 60000
                    val code = connexion.responseCode
                    if (code !in 200..299) return@withContext code
                    attente = 1000L
                    if (dejaOuvert) annonces.trySend(Unit)
                    dejaOuvert = true
                    connexion.inputStream.bufferedReader().use { lecteur ->
                        while (isActive) {
                            val ligne = lecteur.readLine() ?: break
                            if (ligne == "data: change") annonces.trySend(Unit)
                        }
                    }
                    0
                } catch (e: IOException) {
                    0
                } finally {
                    ouverte.getAndSet(null)?.disconnect()
                }
            }
            if (code == 401) Session.renouveler()
            delay(attente + Random.nextLong(0, 500))
            attente = minOf(attente * 2, 30000L)
        }
    } finally {
        relecture.cancel()
        veille.cancel()
    }
}
`;

export const ENVOIS_KT = String.raw`// Produit par Humalis : les envois « hors ligne », gardés sur l'appareil puis envoyés dans l'ordre.
package PAQUET

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID

/** Chaque envoi appartient au compte qui l'a fait : il ne part jamais au nom d'une autre personne. */
object EnvoisGardes {
    private const val CLE = "humalis.envois-gardes"
    private const val CLE_PERDUS = "humalis.envois-perdus"
    /** Un compte qui ne revient jamais (retiré, par exemple) ne laisse pas ses envois sur l'appareil pour toujours. */
    private const val DUREE_MAXIMALE = ${JOURS_ENVOIS_GARDES}L * 24 * 3600 * 1000
    private val portee = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var enCours = false
    private var relance: Job? = null
    private var surveillance = false

    @Suppress("UNCHECKED_CAST")
    private var file: List<Map<String, Any?>>
        get() = liste(Memoire.lire(CLE, emptyList<Any?>())).filterIsInstance<Map<String, Any?>>()
        set(v) = Memoire.ecrire(CLE, v)

    private var perdus: Map<String, Any?>
        get() = (Memoire.lire(CLE_PERDUS, emptyMap<String, Any?>()) as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value } ?: emptyMap()
        set(v) = Memoire.ecrire(CLE_PERDUS, v)

    private val aEnvoyer: List<Map<String, Any?>> get() = file.filter { texte(it["compte"]) == (Session.compteGarde ?: "") }

    val attend: Boolean get() = aEnvoyer.isNotEmpty()

    /** Au lancement : écoute le retour du réseau et envoie ce qui attendait. */
    fun demarrer() {
        if (!surveillance) {
            surveillance = true
            Session.quandCompteConnu = { portee.launch { envoyer() } }
            val reseau = Appli.contexte.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            reseau.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) { portee.launch { envoyer() } }
            })
        }
        portee.launch { envoyer() }
    }

    fun garder(numero: String, adresse: String, methode: String?, envoi: Map<String, Any?>?, id: String?) {
        file = file + fiche("compte" to (Session.compteGarde ?: ""), "cree" to System.currentTimeMillis().toDouble(), "numero" to numero, "adresse" to adresse, "methode" to methode, "envoi" to envoi, "cible" to id)
        reessayerBientot()
    }

    /** Trop vieux pour partir : effacés, et la bonne personne en est prévenue quand elle est là. */
    private fun retirerPerimes(annoncer: Boolean) {
        val maintenant = System.currentTimeMillis()
        val (perimes, gardes) = file.partition { maintenant - nombre(it["cree"]).toLong() >= DUREE_MAXIMALE }
        if (perimes.isNotEmpty()) {
            file = gardes
            val comptes = perdus.toMutableMap()
            for (envoi in perimes) comptes[texte(envoi["compte"])] = nombre(comptes[texte(envoi["compte"])]) + 1
            perdus = comptes
        }
        if (!annoncer) return
        val moi = Session.compteGarde ?: ""
        val nombre = nombre(perdus[moi]).toInt()
        if (nombre == 0) return
        perdus = perdus - moi
        val phrase = if (nombre == 1) "Votre envoi n'est pas parti : il a attendu plus de ${JOURS_ENVOIS_GARDES} jours sans pouvoir partir. Refaites-le si besoin."
            else "#{nombre} envois ne sont pas partis : ils ont attendu plus de ${JOURS_ENVOIS_GARDES} jours sans pouvoir partir. Refaites-les si besoin."
        Messages.afficher(phrase, "avertissement", persistant = true)
    }

    /** Dans l'ordre, pour la personne connectée : si le réseau manque encore, tout attend ; un refus du serveur est dit, et on passe au suivant. */
    suspend fun envoyer(annoncer: Boolean = true) {
        retirerPerimes(annoncer)
        if (enCours || !attend) return
        enCours = true
        try {
            while (true) {
                val suivant = aEnvoyer.firstOrNull() ?: break
                try {
                    @Suppress("UNCHECKED_CAST")
                    Serveur.appel(texte(suivant["adresse"]), suivant["methode"] as? String, suivant["envoi"] as? Map<String, Any?>, suivant["cible"] as? String, cleEnvoi = texte(suivant["numero"]))
                } catch (e: ErreurHumalis) {
                    // Une session à refaire attend ; un visiteur qui n'a pas le droit n'aura jamais de session à refaire.
                    if (e.sansReseau || (e.raison == "Connectez-vous pour continuer." && texte(suivant["compte"]).isNotEmpty())) return
                    Messages.afficher("Un envoi gardé a été refusé : " + e.raison, "erreur")
                }
                file = file.filter { it["numero"] != suivant["numero"] }
            }
        } finally {
            enCours = false
            reessayerBientot()
        }
    }

    private fun reessayerBientot() {
        if (!attend || relance != null) return
        relance = portee.launch {
            delay(15000)
            relance = null
            envoyer()
        }
    }
}

/** Sans réseau, l'envoi attend et le geste continue. S'il y en a déjà en attente, celui-ci passe après eux. */
suspend fun Serveur.appelOuGarder(adresse: String, methode: String? = null, envoi: Map<String, Any?>? = null, id: String? = null) {
    val numero = UUID.randomUUID().toString()
    if (EnvoisGardes.attend) {
        EnvoisGardes.garder(numero, adresse, methode, envoi, id)
        EnvoisGardes.envoyer()
        return
    }
    try {
        appel(adresse, methode, envoi, id, cleEnvoi = numero)
    } catch (e: ErreurHumalis) {
        if (!e.sansReseau) throw e
        EnvoisGardes.garder(numero, adresse, methode, envoi, id)
        Messages.afficher("Pas de réseau : ce sera envoyé dès que la connexion revient.", "info")
    }
}

suspend fun Serveur.appelReussiOuGarder(adresse: String, methode: String? = null, envoi: Map<String, Any?>? = null, id: String? = null): Boolean = try {
    appelOuGarder(adresse, methode, envoi, id)
    true
} catch (e: ErreurHumalis) {
    Messages.afficher(if (e.raison == PAS_DE_REPONSE) "Le serveur n'a pas répondu. Réessayez dans un instant." else e.raison, "erreur")
    false
}
`;

export function fondKotlin(paquet: string, corps: string, envois: boolean): string {
  return `// Produit par Humalis : ce que l'application fait quand le système la réveille (« en arriere plan : »).
package ${paquet}

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/** Le système choisit le moment : jamais avant 15 minutes, souvent plus tard, quand le réseau est là. */
object ArrierePlan {
    fun planifier(contexte: Context) {
        val demande = PeriodicWorkRequestBuilder<TravailHumalis>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(contexte).enqueueUniquePeriodicWork("humalis-arriere-plan", ExistingPeriodicWorkPolicy.KEEP, demande)
    }
}

class TravailHumalis(contexte: Context, reglages: WorkerParameters) : CoroutineWorker(contexte, reglages) {
    override suspend fun doWork(): Result {
        Appli.contexte = applicationContext
        tacheArrierePlan()
        return Result.success()
    }
}

/** Ce bloc ne voit que les variables « avec partagee » : aucune page n'est ouverte. */
suspend fun tacheArrierePlan() {
${corps.trimEnd()}${envois ? '\n    EnvoisGardes.envoyer(annoncer = false)' : ''}
}
`;
}
