/**
 * Les données sur l'appareil, le code à six chiffres et les clés d'accès sur Android.
 * Le portage fidèle de `src/cibles/commun/donnees-comptes-web.ts` : une vraie base SQLite
 * (chiffrée par une clé non exportable de l'Android Keystore), la file hors ligne, la
 * synchronisation, l'écran du code, l'écran d'activation et Credential Manager.
 *
 * Les gabarits Kotlin s'écrivent `#{…}` ici : `kotlin()` les remet en `${…}`.
 */
import type { DonneeLocaleOptions } from '../../parser/ast.js';
import type { Application } from '../../ri/types.js';
import { kotlin } from './bibliotheque.js';
import { VERSIONS } from './gradle.js';
import { chaineKotlin, cleJson, nomKotlin } from './noms.js';

/** La variable qui porte la donnée locale, dans `Partage` : un « _ » ne peut pas venir d'un nom Humalis. */
export const nomLocale = (nom: string): string => `locale_${nomKotlin(nom)}`;

/** Les réglages d'une donnée locale, écrits en Kotlin. */
export function reglagesLocaleKotlin(application: Application, nom: string, locale: DonneeLocaleOptions): string {
  const synchro = locale.synchronisee?.replace(/^\/+/, '');
  const lue = application.serveurs.flatMap((s) => s.routes).find((r) => r.adresse.replace(/^\/+/, '') === synchro);
  return `ReglagesLocale(${chaineKotlin(nomKotlin(nom))}, ${locale.chiffree}, listOf(${locale.champs.map((c) => chaineKotlin(cleJson(c.nom))).join(', ')}), ${synchro !== undefined ? chaineKotlin(`/api/${synchro}`) : 'null'}, ${lue?.droits.lire === 'tout_le_monde'})`;
}

export const DONNEES_LOCALES_KT = String.raw`// Produit par Humalis : une donnée locale, une vraie base sur l'appareil, et sa synchronisation.
package PAQUET

import android.app.Activity
import android.app.Application
import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Log
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.snapshotFlow
import java.io.File
import java.io.IOException
import java.net.URLEncoder
import java.security.GeneralSecurityException
import java.security.InvalidKeyException
import java.security.KeyStore
import java.security.MessageDigest
import java.security.UnrecoverableKeyException
import java.util.UUID
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONException

private const val LOT = 100
private const val ATTENTE = 400L
private const val REPRISE_MINIMUM = 2000L
private const val REPRISE_MAXIMUM = 300000L
private const val VEILLE = 60000L
private const val JOURNAL = "Humalis"

/** Ce que le compilateur dit d'une donnée locale. */
class ReglagesLocale(val nom: String, val chiffree: Boolean, val champs: List<String>, val route: String?, val public: Boolean)

class FicheBase(val id: String, val ordre: Long, val valeurs: Map<String, Any?>)
class LigneFile(val id: String, val operation: String, val modifieLe: Long, val valeurs: Map<String, Any?>?, val supprime: Boolean, val creation: Boolean)
class LuDeBase(val fiches: List<FicheBase>, val file: List<LigneFile>, val curseur: Long)

/** Ce qu'un changement écrit, d'un seul coup, dans la base. */
class Ecritures {
    val fiches = mutableListOf<FicheBase>()
    val retirees = mutableListOf<String>()
    val file = mutableListOf<LigneFile>()
    val envoyees = mutableListOf<String>()
    var curseur: Long? = null
    val vide: Boolean get() = fiches.isEmpty() && retirees.isEmpty() && file.isEmpty() && envoyees.isEmpty() && curseur == null
}

/** Toujours appelée sur le fil de la base : elle peut prendre son temps. */
interface BaseLocale {
    fun lire(): LuDeBase
    fun appliquer(e: Ecritures)
    fun fermer()
    /** Vrai si ce que la base contenait n'a pas pu être relu et a été mis de côté. */
    val miseDeCote: Boolean get() = false
}

class ReponseSynchro(val statut: Int, val corps: Any?) {
    val ok: Boolean get() = statut in 200..299
}

interface TransportSynchro {
    suspend fun envoyer(chemin: String, corps: Map<String, Any?>): ReponseSynchro
    suspend fun lire(chemin: String): ReponseSynchro
}

/**
 * Le cœur : la liste affichée d'un côté, la base de l'autre. La liste reste la vérité de la page :
 * chaque changement y est comparé à ce que la base connaît, et devient une écriture, puis une ligne
 * de la file d'envoi. Tout son état vit sur le fil de l'écran ; seule la base travaille ailleurs.
 */
class CoeurLocal(
    private val champs: List<String>,
    private val route: String?,
    private val transport: TransportSynchro,
    private val lire: () -> Any?,
    private val ecrire: (List<Any?>) -> Unit,
    private val planifier: () -> Unit,
    private val signaler: (String) -> Unit,
    private val portee: CoroutineScope,
    private val maintenant: () -> Long = { System.currentTimeMillis() },
    private val nouvelId: () -> String = { UUID.randomUUID().toString() },
) {
    private val filBase = Executors.newSingleThreadExecutor().asCoroutineDispatcher()
    private var base: BaseLocale? = null
    private var pret = false
    private var connus = HashMap<String, String>()
    private var objets = HashMap<String, Map<*, *>>()
    private var ordres = HashMap<String, Long>()
    private var file = LinkedHashMap<String, LigneFile>()
    private var curseur = 0L
    private var prochain = 1L
    private val enVol = HashSet<String>()
    private var enCours: Deferred<Boolean>? = null
    private var encoreUneFois = false

    /** Dans l'ordre : deux écritures n'arrivent jamais à la base l'une avant l'autre. */
    private fun <T> enOrdre(travail: () -> T): Deferred<T> = portee.async(filBase) { travail() }

    private fun nouvelleOperation() = nouvelId().replace("-", "")

    private fun valeursDe(fiche: Map<*, *>): Map<String, Any?> {
        val valeurs = LinkedHashMap<String, Any?>()
        for (c in champs) valeurs[c] = fiche[c]
        return valeurs
    }

    private fun listeTriee(): List<Any?> = ordres.entries.sortedBy { it.value }.map { objets[it.key] }

    private fun publier() = ecrire(listeTriee())

    private fun adopter(id: String, valeurs: Map<*, *>, ecritures: Ecritures): Boolean {
        val propres = valeursDe(valeurs)
        val lu = versJson(propres)
        if (connus[id] == lu) return false
        connus[id] = lu
        objets[id] = propres + ("id" to id)
        val ordre = ordres.getOrPut(id) { prochain++ }
        ecritures.fiches.add(FicheBase(id, ordre, propres))
        return true
    }

    private fun oublier(id: String, ecritures: Ecritures): Boolean {
        if (!connus.containsKey(id)) return false
        connus.remove(id)
        objets.remove(id)
        ordres.remove(id)
        ecritures.retirees.add(id)
        return true
    }

    /** Compare la liste à la base : ce qui a changé part dans la base et dans la file. */
    fun observer(lue: Any?) {
        if (!pret || lue !is List<*>) return
        val vus = HashSet<String>()
        var completee = false
        val sortie: List<Any?> = lue.map { fiche ->
            if (fiche !is Map<*, *>) return@map fiche
            val id = fiche["id"] as? String
            if (id != null && vus.add(id)) return@map fiche
            completee = true
            val neuf = nouvelId()
            vus.add(neuf)
            val copie = LinkedHashMap<String, Any?>()
            fiche.forEach { (cle, x) -> copie[cle.toString()] = x }
            copie["id"] = neuf
            copie
        }
        val ecritures = Ecritures()
        val moment = maintenant()
        for (fiche in sortie) {
            if (fiche !is Map<*, *>) continue
            val id = fiche["id"] as String
            val propres = valeursDe(fiche)
            val lu = versJson(propres)
            val connu = connus[id]
            val nouvelle = connu == null
            if (connu != lu) {
                val ordre = if (nouvelle) prochain++ else ordres.getValue(id)
                connus[id] = lu
                objets[id] = fiche
                ordres[id] = ordre
                ecritures.fiches.add(FicheBase(id, ordre, propres))
                if (route != null) {
                    val entree = LigneFile(id, nouvelleOperation(), moment, propres, false, nouvelle || file[id]?.creation == true)
                    file[id] = entree
                    ecritures.file.add(entree)
                }
            } else objets[id] = fiche
        }
        for (id in connus.keys.toList()) {
            if (id in vus) continue
            oublier(id, ecritures)
            if (route == null) continue
            // Créée et supprimée sans avoir jamais quitté l'appareil : le serveur n'a pas à le savoir.
            if (file[id]?.creation == true && id !in enVol) {
                file.remove(id)
                ecritures.envoyees.add(id)
            } else {
                val entree = LigneFile(id, nouvelleOperation(), moment, null, true, false)
                file[id] = entree
                ecritures.file.add(entree)
            }
        }
        if (completee) ecrire(sortie)
        if (!ecritures.vide) {
            val cible = base ?: return
            portee.launch(filBase) {
                try {
                    cible.appliquer(ecritures)
                } catch (e: Exception) {
                    Log.e(JOURNAL, "La base n'a pas pu écrire", e)
                }
            }
            if (route != null) planifier()
        }
    }

    /** Ouvre la base d'un compte et publie ce qu'elle contient. */
    suspend fun ouvrir(nouvelle: BaseLocale) {
        val premiere = !pret
        pret = false
        enOrdre { }.await()
        base = nouvelle
        charger(enOrdre { nouvelle.lire() }.await())
        // Ce que la page a ajouté avant que la base ne soit prête n'est pas perdu.
        val enAttente = if (premiere) liste(lire()).filter { it is Map<*, *> && it["id"] !is String } else emptyList()
        pret = true
        if (enAttente.isEmpty()) return publier()
        val complete = listeTriee() + enAttente
        ecrire(complete)
        observer(complete)
    }

    private fun charger(lu: LuDeBase) {
        connus = HashMap()
        objets = HashMap()
        ordres = HashMap()
        file = LinkedHashMap()
        for (e in lu.file) file[e.id] = e
        curseur = lu.curseur
        prochain = 1
        for (fiche in lu.fiches) {
            val propres = valeursDe(fiche.valeurs)
            connus[fiche.id] = versJson(propres)
            objets[fiche.id] = propres + ("id" to fiche.id)
            ordres[fiche.id] = fiche.ordre
            prochain = maxOf(prochain, fiche.ordre + 1)
        }
    }

    /** La base quittée se ferme après ses dernières écritures. */
    fun fermerBase(ancienne: BaseLocale) {
        portee.launch(filBase) { ancienne.fermer() }
    }

    val enAttente: Int get() = file.size

    private suspend fun envoyer(cible: BaseLocale): Boolean {
        var taille = LOT
        while (file.isNotEmpty()) {
            if (base !== cible) return false
            val lot = file.values.take(taille)
            for (entree in lot) enVol.add(entree.id)
            val reponse = try {
                transport.envoyer(route + "/synchro", fiche(
                    "heure" to maintenant(),
                    "envois" to lot.map { e ->
                        linkedMapOf<String, Any?>("id" to e.id, "operation" to e.operation, "modifieLe" to e.modifieLe).also {
                            if (e.supprime) it["supprime"] = true else it["valeurs"] = e.valeurs
                        }
                    },
                ))
            } finally {
                for (entree in lot) enVol.remove(entree.id)
            }
            if (base !== cible) return false
            if (reponse.statut == 401 || reponse.statut == 403) return false
            if (reponse.statut == 413) {
                // Trop lourd : on coupe le lot en deux. Une fiche seule trop lourde ne bloque pas les suivantes.
                if (lot.size > 1) {
                    taille = (lot.size + 1) / 2
                    continue
                }
                val seule = lot.first()
                val ecritures = Ecritures()
                file.remove(seule.id)
                ecritures.envoyees.add(seule.id)
                val retiree = seule.creation && oublier(seule.id, ecritures)
                enOrdre { cible.appliquer(ecritures) }.await()
                if (retiree) publier()
                signaler("Cette fiche est trop lourde pour être envoyée au serveur.")
                continue
            }
            if (!reponse.ok) throw IOException("envoi refusé (#{reponse.statut})")
            val ecritures = Ecritures()
            var change = false
            val resultats = liste(champ(reponse.corps, "resultats"))
            for (resultat in resultats) {
                val id = texte(champ(resultat, "id"))
                val encoreLaMeme = file[id]?.operation == texte(champ(resultat, "operation"))
                if (!encoreLaMeme) continue
                file.remove(id)
                ecritures.envoyees.add(id)
                val etat = texte(champ(resultat, "etat"))
                // Le serveur a gardé autre chose : sa version remplace la nôtre, sauf si l'on a déjà rechangé cette fiche.
                if (etat != "applique") {
                    val actuelle = champ(resultat, "actuelle") as? Map<*, *>
                    change = (if (actuelle != null) adopter(id, actuelle, ecritures) else oublier(id, ecritures)) || change
                    if (etat == "refuse") signaler(texte(champ(resultat, "raison")).ifEmpty { "Le serveur a refusé une modification." })
                }
            }
            enOrdre { cible.appliquer(ecritures) }.await()
            if (change) publier()
            // Un serveur qui ne répond rien sur un lot : on ne boucle pas.
            if (resultats.isEmpty()) break
        }
        return true
    }

    private suspend fun recevoir(cible: BaseLocale) {
        while (true) {
            if (base !== cible) return
            val reponse = transport.lire(route + "/synchro?depuis=" + URLEncoder.encode(curseur.toString(), "UTF-8"))
            if (base !== cible) return
            if (reponse.statut == 401 || reponse.statut == 403) return
            if (!reponse.ok) throw IOException("lecture refusée (#{reponse.statut})")
            val ecritures = Ecritures()
            var change = false
            if (vrai(champ(reponse.corps, "reinitialiser"))) {
                // Absent trop longtemps : seul ce qui attend encore d'être envoyé reste.
                for (id in connus.keys.toList()) if (!file.containsKey(id)) change = oublier(id, ecritures) || change
            }
            for (changement in liste(champ(reponse.corps, "changements"))) {
                val id = texte(champ(changement, "id"))
                // Une modification locale attend son tour : elle partira, et le serveur tranchera.
                if (file.containsKey(id)) continue
                change = if (vrai(champ(changement, "supprime"))) oublier(id, ecritures) || change
                else adopter(id, champ(changement, "valeurs") as? Map<*, *> ?: emptyMap<String, Any?>(), ecritures) || change
            }
            curseur = nombre(champ(reponse.corps, "curseur")).toLong()
            ecritures.curseur = curseur
            enOrdre { cible.appliquer(ecritures) }.await()
            if (change) publier()
            if (!vrai(champ(reponse.corps, "encore"))) return
        }
    }

    /** Envoie ce qui attend, puis reçoit ce qui a changé. Une seule à la fois. */
    suspend fun synchroniser(): Boolean {
        if (route == null || !pret) return false
        enCours?.let {
            encoreUneFois = true
            return it.await()
        }
        val tache = portee.async {
            try {
                do {
                    encoreUneFois = false
                    observer(lire())
                    enOrdre { }.await()
                    val cible = base ?: break
                    if (envoyer(cible)) recevoir(cible)
                } while (encoreUneFois)
                true
            } finally {
                enCours = null
            }
        }
        enCours = tache
        return tache.await()
    }
}

// ─── La base ───────────────────────────────────────────────────────────────

private fun empreinte(texte: String): String =
    MessageDigest.getInstance("SHA-256").digest(texte.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }.take(32)

/** AES-256-GCM, par contenu, l'id de la fiche en données associées. La clé ne sort jamais de l'Android Keystore. */
private class Scelleur(private val alias: String) {
    private var lue: SecretKey? = null

    private fun cle(): SecretKey {
        lue?.let { return it }
        val magasin = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val cle = (magasin.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.secretKey ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setKeySize(256)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build(),
            )
            generateKey()
        }
        lue = cle
        return cle
    }

    fun sceller(id: String, clair: ByteArray): ByteArray {
        val chiffre = Cipher.getInstance("AES/GCM/NoPadding")
        chiffre.init(Cipher.ENCRYPT_MODE, cle())
        chiffre.updateAAD(id.toByteArray(Charsets.UTF_8))
        return chiffre.iv + chiffre.doFinal(clair)
    }

    fun ouvrir(id: String, contenu: ByteArray): ByteArray {
        val chiffre = Cipher.getInstance("AES/GCM/NoPadding")
        chiffre.init(Cipher.DECRYPT_MODE, cle(), GCMParameterSpec(128, contenu, 0, 12))
        chiffre.updateAAD(id.toByteArray(Charsets.UTF_8))
        return chiffre.doFinal(contenu, 12, contenu.size - 12)
    }

    /** La clé est perdue pour de bon : la prochaine écriture en créera une autre. */
    fun oublier() {
        lue = null
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(alias)
    }
}

private class OuvreurSqlite(contexte: Context, chemin: String) : SQLiteOpenHelper(contexte, chemin, null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE fiches (id TEXT PRIMARY KEY NOT NULL, ordre INTEGER NOT NULL, contenu BLOB NOT NULL)")
        db.execSQL("CREATE TABLE file (id TEXT PRIMARY KEY NOT NULL, operation TEXT NOT NULL, modifieLe INTEGER NOT NULL, supprime INTEGER NOT NULL, creation INTEGER NOT NULL, contenu BLOB)")
        db.execSQL("CREATE TABLE meta (cle TEXT PRIMARY KEY NOT NULL, valeur INTEGER NOT NULL)")
    }

    override fun onUpgrade(db: SQLiteDatabase, ancienne: Int, nouvelle: Int) {}
}

/**
 * Une base SQLite par compte. Une base chiffrée reste hors des sauvegardes d'Android :
 * sa clé ne quitte pas cet appareil, elle serait illisible ailleurs.
 */
private class BaseSqlite(private val contexte: Context, nom: String, chiffree: Boolean) : BaseLocale {
    private val code = empreinte(nom)
    private val fichier = File(if (chiffree) contexte.noBackupFilesDir else contexte.getDatabasePath("x").parentFile!!.apply { mkdirs() }, "humalis-locale-#{code}.db")
    private val scelleur = if (chiffree) Scelleur("humalis.locale.#{code}") else null
    private var ouvreur = OuvreurSqlite(contexte, fichier.path)
    override var miseDeCote = false
        private set

    private fun sceller(id: String, valeurs: Map<String, Any?>): ByteArray {
        val clair = versJson(valeurs).toByteArray(Charsets.UTF_8)
        return scelleur?.sceller(id, clair) ?: clair
    }

    @Suppress("UNCHECKED_CAST")
    private fun ouvrir(id: String, contenu: ByteArray): Map<String, Any?> {
        val clair = scelleur?.ouvrir(id, contenu) ?: contenu
        return lireJson(String(clair, Charsets.UTF_8)) as? Map<String, Any?> ?: throw JSONException("contenu illisible")
    }

    private fun lecture(): LuDeBase {
        val db = ouvreur.writableDatabase
        val fiches = ArrayList<FicheBase>()
        db.rawQuery("SELECT id, ordre, contenu FROM fiches ORDER BY ordre", null).use { c ->
            while (c.moveToNext()) fiches.add(FicheBase(c.getString(0), c.getLong(1), ouvrir(c.getString(0), c.getBlob(2))))
        }
        val file = ArrayList<LigneFile>()
        db.rawQuery("SELECT id, operation, modifieLe, supprime, creation, contenu FROM file ORDER BY modifieLe", null).use { c ->
            while (c.moveToNext()) {
                val id = c.getString(0)
                file.add(LigneFile(id, c.getString(1), c.getLong(2), if (c.isNull(5)) null else ouvrir(id, c.getBlob(5)), c.getInt(3) != 0, c.getInt(4) != 0))
            }
        }
        val curseur = db.rawQuery("SELECT valeur FROM meta WHERE cle = 'curseur'", null).use { c -> if (c.moveToFirst()) c.getLong(0) else 0L }
        return LuDeBase(fiches, file, curseur)
    }

    /** Un contenu qu'on ne peut pas relire n'est jamais détruit : le fichier est mis de côté, et la base repart. */
    override fun lire(): LuDeBase = try {
        lecture()
    } catch (e: Exception) {
        if (e !is GeneralSecurityException && e !is JSONException) throw e
        Log.e(JOURNAL, "Une base locale n'a pas pu être relue", e)
        ouvreur.close()
        fichier.renameTo(File(fichier.path + ".illisible"))
        for (suffixe in listOf("-journal", "-wal", "-shm")) File(fichier.path + suffixe).delete()
        if (e is InvalidKeyException || e is UnrecoverableKeyException) scelleur?.oublier()
        miseDeCote = true
        ouvreur = OuvreurSqlite(contexte, fichier.path)
        lecture()
    }

    override fun appliquer(e: Ecritures) {
        // Chiffrer avant d'ouvrir la transaction : le Keystore prend du temps.
        val fiches = e.fiches.map { f -> ContentValues().apply { put("id", f.id); put("ordre", f.ordre); put("contenu", sceller(f.id, f.valeurs)) } }
        val file = e.file.map { l ->
            ContentValues().apply {
                put("id", l.id)
                put("operation", l.operation)
                put("modifieLe", l.modifieLe)
                put("supprime", if (l.supprime) 1 else 0)
                put("creation", if (l.creation) 1 else 0)
                if (l.valeurs != null) put("contenu", sceller(l.id, l.valeurs)) else putNull("contenu")
            }
        }
        val db = ouvreur.writableDatabase
        db.beginTransaction()
        try {
            for (ligne in fiches) db.insertWithOnConflict("fiches", null, ligne, SQLiteDatabase.CONFLICT_REPLACE)
            for (id in e.retirees) db.delete("fiches", "id = ?", arrayOf(id))
            for (id in e.envoyees) db.delete("file", "id = ?", arrayOf(id))
            for (ligne in file) db.insertWithOnConflict("file", null, ligne, SQLiteDatabase.CONFLICT_REPLACE)
            e.curseur?.let { db.insertWithOnConflict("meta", null, ContentValues().apply { put("cle", "curseur"); put("valeur", it) }, SQLiteDatabase.CONFLICT_REPLACE) }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    override fun fermer() = ouvreur.close()
}

/** Une base en mémoire : l'appareil refuse la sienne, la page marche quand même le temps de la visite. */
private class BaseEnMemoire : BaseLocale {
    private val fiches = LinkedHashMap<String, FicheBase>()
    private val file = LinkedHashMap<String, LigneFile>()
    private var curseur = 0L

    override fun lire() = LuDeBase(fiches.values.toList(), file.values.toList(), curseur)

    override fun appliquer(e: Ecritures) {
        for (f in e.fiches) fiches[f.id] = f
        for (id in e.retirees) fiches.remove(id)
        for (id in e.envoyees) file.remove(id)
        for (l in e.file) file[l.id] = l
        e.curseur?.let { curseur = it }
    }

    override fun fermer() {}
}

// ─── La donnée locale ──────────────────────────────────────────────────────

/** Passe par la même porte que le reste : un seul renouvellement de session à la fois. */
private object TransportServeur : TransportSynchro {
    override suspend fun envoyer(chemin: String, corps: Map<String, Any?>): ReponseSynchro =
        Serveur.echange(chemin, "POST", corps).let { ReponseSynchro(it.first, it.second) }

    override suspend fun lire(chemin: String): ReponseSynchro =
        Serveur.echange(chemin, "GET").let { ReponseSynchro(it.first, it.second) }
}

/**
 * Une donnée locale : pour les pages, une liste partagée comme une autre.
 * Une base par compte : une session n'en voit jamais une autre, et ce qui attend
 * d'être envoyé reste au compte qui l'a écrit.
 */
class DonneeLocale(val reglages: ReglagesLocale, depart: Any?) : MutableState<Any?> {
    private val etat = mutableStateOf(depart)
    private val portee = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val principal by lazy { Handler(Looper.getMainLooper()) }
    private val verrou = Mutex()
    private var minuteur: Job? = null
    private var reprise = REPRISE_MINIMUM
    private var baseOuverte: BaseLocale? = null
    private var ouverte = false
    private var compteOuvert: String? = null
    private var misEnGarde = false

    private val coeur = CoeurLocal(
        reglages.champs,
        reglages.route,
        TransportServeur,
        lire = { etat.value },
        ecrire = { etat.value = it },
        planifier = { planifier() },
        signaler = { Messages.afficher(it, "erreur") },
        portee = portee,
    )

    override var value: Any?
        get() = etat.value
        set(v) {
            etat.value = v
            // « en arriere plan : » écrit depuis un autre fil ; le cœur vit sur celui de l'écran.
            if (Looper.myLooper() == Looper.getMainLooper()) coeur.observer(v) else principal.post { coeur.observer(etat.value) }
        }

    override fun component1(): Any? = value
    override fun component2(): (Any?) -> Unit = { value = it }

    val attend: Boolean get() = coeur.enAttente > 0

    fun planifier(delai: Long = ATTENTE) {
        minuteur?.cancel()
        // Seule l'attente s'annule : une synchronisation commencée va au bout.
        minuteur = portee.launch {
            delay(delai)
            portee.launch { lancer() }
        }
    }

    private suspend fun lancer() {
        if (reglages.route == null) return
        // Ce qui attend sera envoyé par le système si l'application se ferme entre-temps.
        if (attend) DonneesLocales.confierAuSysteme()
        if (!DonneesLocales.reseauPresent()) return
        // Sans session, une route réservée n'a rien à dire : on attend la connexion.
        if (compteOuvert == null && !reglages.public) return
        try {
            coeur.synchroniser()
            reprise = REPRISE_MINIMUM
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Pas de réseau, serveur en panne : on recommence de plus en plus lentement, sans rien dire.
            planifier(reprise)
            reprise = minOf(reprise * 2, REPRISE_MAXIMUM)
        }
    }

    /** Pour le travail du système : ne rend la main qu'à la fin ; une panne lève son erreur. */
    suspend fun synchroniserMaintenant() {
        if (reglages.route == null || (compteOuvert == null && !reglages.public)) return
        coeur.synchroniser()
    }

    private suspend fun ouvrirBase(nom: String): BaseLocale = withContext(Dispatchers.IO) {
        try {
            BaseSqlite(Appli.contexte, nom, reglages.chiffree)
        } catch (e: Exception) {
            Log.e(JOURNAL, "La base locale n'a pas pu s'ouvrir", e)
            BaseEnMemoire()
        }
    }

    /** Appelée quand on connaît le compte (null : personne) ; sans route, une seule base pour l'appareil. */
    suspend fun basculer(compte: String?) {
        val voulu = if (reglages.route != null) compte else "appareil"
        verrou.withLock {
            if (ouverte && voulu == compteOuvert) return
            ouverte = true
            compteOuvert = voulu
            var base = ouvrirBase(reglages.nom + ":" + (voulu ?: "visiteur"))
            val ancienne = baseOuverte
            try {
                coeur.ouvrir(base)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.e(JOURNAL, "La base locale n'a pas pu être lue", e)
                if (!misEnGarde) Messages.afficher("Cet appareil ne garde pas les données : elles seront perdues à la fermeture.", "avertissement")
                misEnGarde = true
                base = BaseEnMemoire()
                coeur.ouvrir(base)
            }
            if (base.miseDeCote) Messages.afficher("Les données gardées sur cet appareil n'ont pas pu être relues : elles ont été mises de côté.", "avertissement")
            baseOuverte = base
            ancienne?.let { coeur.fermerBase(it) }
        }
        planifier(0)
    }

    fun changerCompte(compte: String?) {
        portee.launch { basculer(compte) }
    }
}

/** Toutes les données locales de l'application, et ce qui déclenche leur synchronisation. */
object DonneesLocales {
    private val toutes: List<DonneeLocale> by lazy { LOCALES_DU_PROJET }
    private val portee = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var demarre = false
    private var auPremierPlan = 0

    fun reseauPresent(): Boolean {
        val reseau = Appli.contexte.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val actif = reseau.activeNetwork ?: return false
        return reseau.getNetworkCapabilities(actif)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }

    /** Un seul travail attend : le système le lance au retour du réseau, même application fermée. */
    fun confierAuSysteme() {
        CONFIER_AU_SYSTEME
    }

    private fun reveiller() {
        for (locale in toutes) locale.planifier(0)
    }

    /** À l'ouverture : les bases, puis ce qui déclenche une synchronisation. */
    fun demarrer() {
        if (demarre) return
        demarre = true
        for (locale in toutes) if (locale.reglages.route == null) locale.changerCompte(null)
        if (toutes.none { it.reglages.route != null }) return
        portee.launch { Session.attendre() }
        portee.launch {
            snapshotFlow { Session.pret to Session.compteDeLAppareil }.collect { (pret, compte) ->
                if (pret) for (locale in toutes) if (locale.reglages.route != null) locale.changerCompte(compte)
            }
        }
        val reseau = Appli.contexte.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        reseau.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                portee.launch {
                    // Lancée sans réseau, l'application reconnaît maintenant la personne.
                    Session.relireSiHorsLigne()
                    reveiller()
                }
            }
        })
        (Appli.contexte as? Application)?.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
            override fun onActivityStarted(activity: Activity) {
                if (auPremierPlan++ == 0) reveiller()
            }
            override fun onActivityStopped(activity: Activity) {
                auPremierPlan = maxOf(0, auPremierPlan - 1)
            }
            override fun onActivityCreated(activity: Activity, etat: Bundle?) {}
            override fun onActivityResumed(activity: Activity) {}
            override fun onActivityPaused(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, etat: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {}
        })
        portee.launch {
            while (true) {
                delay(VEILLE)
                if (auPremierPlan > 0) reveiller()
            }
        }
    }

    /** Le système réveille l'application : elle ouvre le compte connu et synchronise ; faux s'il faut réessayer. */
    suspend fun synchroniserDuFond(): Boolean {
        demarrer()
        Session.attendre()
        var reussi = true
        for (locale in toutes) {
            if (locale.reglages.route == null) continue
            try {
                locale.basculer(Session.compteDeLAppareil)
                locale.synchroniserMaintenant()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                reussi = false
            }
        }
        return reussi
    }
}
`;

export const SYNCHRO_FOND_KT = String.raw`// Produit par Humalis : la synchronisation au retour du réseau, même application fermée (WorkManager).
package PAQUET

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object SynchroFond {
    fun planifier(contexte: Context) {
        val demande = OneTimeWorkRequestBuilder<TravailSynchro>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(contexte).enqueueUniqueWork("humalis-synchro", ExistingWorkPolicy.KEEP, demande)
    }
}

class TravailSynchro(contexte: Context, reglages: WorkerParameters) : CoroutineWorker(contexte, reglages) {
    /** Sur le fil de l'écran : la session ne se renouvelle jamais deux fois en même temps. */
    override suspend fun doWork(): Result = withContext(Dispatchers.Main) {
        Appli.contexte = applicationContext
        if (DonneesLocales.synchroniserDuFond()) Result.success() else Result.retry()
    }
}
`;

export const FENETRES_SECURITE_KT = String.raw`// Produit par Humalis : les fenêtres du compte (code, mot de passe) : un titre, du contenu, la croix pour fermer.
package PAQUET

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.material3.Button
import kotlinx.coroutines.CompletableDeferred

const val SANS_REPONSE = "Le serveur n'a pas répondu. Réessayez dans un instant."

class FenetreSecurite(val titre: String, val surFermeture: () -> Unit, val contenu: @Composable (FenetreSecurite) -> Unit) {
    var alerte by mutableStateOf("")

    fun fermer() {
        if (FenetresSecurite.enCours === this) FenetresSecurite.enCours = null
    }
}

object FenetresSecurite {
    var enCours by mutableStateOf<FenetreSecurite?>(null)
}

/** Ouvre une fenêtre et attend sa réponse ; la croix ou le retour rendent « annule ». */
suspend fun <T> demanderDansFenetre(titre: String, annule: T, contenu: @Composable (FenetreSecurite, (T) -> Unit) -> Unit): T {
    val reponse = CompletableDeferred<T>()
    val fenetre = FenetreSecurite(titre, { reponse.complete(annule) }) { f ->
        contenu(f) { valeur ->
            f.fermer()
            reponse.complete(valeur)
        }
    }
    FenetresSecurite.enCours = fenetre
    return try { reponse.await() } finally { fenetre.fermer() }
}

@Composable
fun FenetreSecuriteHumalis() {
    val fenetre = FenetresSecurite.enCours ?: return
    key(fenetre) {
        val fermer = {
            fenetre.fermer()
            fenetre.surFermeture()
        }
        Dialog(onDismissRequest = fermer, properties = DialogProperties(dismissOnClickOutside = false)) {
            Surface(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text(fenetre.titre, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                        Text("×", fontSize = 26.sp, modifier = Modifier.semantics { contentDescription = "Fermer"; role = Role.Button }.clickable(onClick = fermer).padding(horizontal = 8.dp))
                    }
                    fenetre.contenu(fenetre)
                    if (fenetre.alerte.isNotEmpty()) Text(fenetre.alerte, color = Color(0xFFC0392B), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })
                }
            }
        }
    }
}

/** Un champ de la fenêtre : il prend le focus, et la touche « OK » du clavier vaut le bouton. */
@Composable
fun ChampFenetre(etiquette: String, valeur: String, surChange: (String) -> Unit, surEntree: () -> Unit, clavier: KeyboardType = KeyboardType.Text, secret: Boolean = false) {
    val focus = remember { FocusRequester() }
    OutlinedTextField(
        value = valeur,
        onValueChange = surChange,
        label = { Text(etiquette) },
        singleLine = true,
        visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = clavier, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { surEntree() }),
        modifier = Modifier.fillMaxWidth().focusRequester(focus),
    )
    LaunchedEffect(Unit) { try { focus.requestFocus() } catch (e: IllegalStateException) { } }
}

/** Le mot de passe, confirmé avant un geste sensible ; rien si la personne ferme la fenêtre. */
suspend fun demanderMotDePasse(titre: String): String? = demanderDansFenetre<String?>(titre, null) { _, fin ->
    var saisi by remember { mutableStateOf("") }
    val continuer = { if (saisi.isNotEmpty()) fin(saisi) }
    ChampFenetre("Votre mot de passe", saisi, { saisi = it }, continuer, KeyboardType.Password, secret = true)
    Button(onClick = continuer, modifier = Modifier.fillMaxWidth()) { Text("Continuer") }
}

/** La raison d'un refus, écrite pour la personne. */
fun raisonRefus(reponse: Pair<Int, Any?>, sinon: String): String {
    if (reponse.first == 429) return "Trop de tentatives. Réessayez dans quelques minutes."
    val dite = champ(reponse.second, "erreur") as? String ?: return sinon
    return dite.replaceFirstChar { it.uppercase() }.removeSuffix(".") + "."
}

/** « se connecter par cle d'acces », « activer double authentification » : un refus est dit, et la suite s'arrête. */
suspend fun Session.gere(action: suspend () -> Boolean): Boolean = try {
    action()
} catch (e: ErreurHumalis) {
    Messages.afficher(if (e.raison == PAS_DE_REPONSE) SANS_REPONSE else e.raison, "erreur")
    false
}
`;

export const DOUBLE_KT = String.raw`// Produit par Humalis : le code à six chiffres : l'écran de la connexion, et celui de l'activation.
package PAQUET

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

private const val CODE_FAUX = "Ce code est incorrect."
private const val LONGUEUR_CODE = 9

/** Après un mot de passe juste, quand le compte a le code : vrai si la session est ouverte. */
suspend fun demanderCodeDeConnexion(jeton: String): Boolean = demanderDansFenetre("Code de vérification", false) { fenetre, fin ->
    var secours by remember { mutableStateOf(false) }
    var code by remember { mutableStateOf("") }
    var occupe by remember { mutableStateOf(false) }
    val portee = rememberCoroutineScope()
    val verifier: () -> Unit = {
        if (!occupe && code.isNotBlank()) {
            occupe = true
            portee.launch {
                val reponse = Session.brut("/auth/double/verifier", "POST", fiche("jeton" to jeton, "code" to code.trim()))
                when {
                    reponse == null -> fenetre.alerte = SANS_REPONSE
                    reponse.first in 200..299 -> {
                        Session.ouvrir(champ(reponse.second, "data"))
                        fin(true)
                    }
                    else -> {
                        fenetre.alerte = raisonRefus(reponse, CODE_FAUX)
                        code = ""
                    }
                }
                occupe = false
            }
        }
    }
    Text(if (secours) "Saisissez un de vos codes de secours : il ne servira qu'une fois." else "Saisissez le code affiché par votre application d'authentification.")
    ChampFenetre(if (secours) "Code de secours" else "Code à six chiffres", code, { code = it.take(LONGUEUR_CODE) }, verifier, if (secours) KeyboardType.Ascii else KeyboardType.Number)
    Button(onClick = verifier, enabled = !occupe, modifier = Modifier.fillMaxWidth()) { Text("Vérifier") }
    OutlinedButton(onClick = { secours = !secours; code = ""; fenetre.alerte = "" }, modifier = Modifier.fillMaxWidth()) {
        Text(if (secours) "Utiliser le code à six chiffres" else "Utiliser un code de secours")
    }
}

/** Les codes de secours, montrés une seule fois. */
@androidx.compose.runtime.Composable
private fun CodesDeSecours(codes: List<String>, fin: () -> Unit) {
    var copie by remember { mutableStateOf(false) }
    Text("Gardez ces codes en lieu sûr : chacun remplace une fois le code à six chiffres. Ils ne seront plus affichés.")
    SelectionContainer {
        Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)).padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            for (c in codes) Text(c, fontFamily = FontFamily.Monospace)
        }
    }
    OutlinedButton(onClick = { copier(codes.joinToString("\n"), null); copie = true }, modifier = Modifier.fillMaxWidth()) { Text(if (copie) "Copié" else "Copier") }
    Button(onClick = fin, modifier = Modifier.fillMaxWidth()) { Text("J'ai gardé ces codes") }
}

/** « activer double authentification » : l'activation, ou la gestion quand elle est déjà active. */
suspend fun activerDoubleAuthentification(): Boolean {
    val etat = Serveur.echange("/auth/double", "GET")
    if (etat.first == 401) throw ErreurHumalis("Connectez-vous pour continuer.")
    if (etat.first !in 200..299) throw ErreurHumalis(raisonRefus(etat, SANS_REPONSE))
    if (vrai(champ(etat.second, "actif"))) return gererDoubleAuthentification(nombre(champ(etat.second, "codesRestants")).toInt())
    var preuve = fiche()
    if (vrai(champ(etat.second, "motDePasseRequis"))) {
        val saisi = demanderMotDePasse("Confirmez votre mot de passe") ?: return false
        preuve = fiche("motDePasse" to saisi)
    }
    val debut = Serveur.echange("/auth/double/activer", "POST", preuve)
    if (debut.first !in 200..299) throw ErreurHumalis(raisonRefus(debut, "La double authentification n'a pas pu commencer."))
    val uri = texte(champ(debut.second, "uri"))
    val secret = texte(champ(debut.second, "secret"))
    return demanderDansFenetre("Double authentification", false) { fenetre, fin ->
        var code by remember { mutableStateOf("") }
        var occupe by remember { mutableStateOf(false) }
        var codes by remember { mutableStateOf<List<String>?>(null) }
        val portee = rememberCoroutineScope()
        val lus = codes
        if (lus != null) CodesDeSecours(lus) { fin(true) }
        else {
            val activer: () -> Unit = {
                if (!occupe && code.isNotBlank()) {
                    occupe = true
                    portee.launch {
                        try {
                            val reponse = Serveur.echange("/auth/double/confirmer", "POST", fiche("code" to code.trim()))
                            if (reponse.first in 200..299) {
                                fenetre.alerte = ""
                                codes = liste(champ(reponse.second, "codesSecours")).map { texte(it) }
                            } else {
                                fenetre.alerte = raisonRefus(reponse, CODE_FAUX)
                                code = ""
                            }
                        } catch (e: ErreurHumalis) {
                            fenetre.alerte = SANS_REPONSE
                        }
                        occupe = false
                    }
                }
            }
            Text("Scannez ce code dans votre application d'authentification, puis saisissez le code qu'elle affiche.")
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { QrHumalis(uri, "Code QR à scanner dans une application d'authentification") }
            SelectionContainer { Text("Clé à saisir à la main : #{secret}", style = MaterialTheme.typography.bodySmall) }
            // Sur le téléphone même, on ne scanne pas son propre écran : l'application d'authentification s'ouvre directement.
            OutlinedButton(onClick = { ouvrirAuthentificateur(uri) }, modifier = Modifier.fillMaxWidth()) { Text("Ouvrir dans l'application d'authentification") }
            ChampFenetre("Code à six chiffres", code, { code = it.take(LONGUEUR_CODE) }, activer, KeyboardType.Number)
            Button(onClick = activer, enabled = !occupe, modifier = Modifier.fillMaxWidth()) { Text("Activer") }
        }
    }
}

private fun ouvrirAuthentificateur(uri: String) {
    try {
        Appli.contexte.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: android.content.ActivityNotFoundException) {
        Messages.afficher("Aucune application d'authentification n'est installée sur cet appareil.", "avertissement")
    }
}

private suspend fun gererDoubleAuthentification(codesRestants: Int): Boolean = demanderDansFenetre("Double authentification", false) { fenetre, fin ->
    var code by remember { mutableStateOf("") }
    var codes by remember { mutableStateOf<List<String>?>(null) }
    val portee = rememberCoroutineScope()
    val agir: (String) -> Unit = { chemin ->
        portee.launch {
            try {
                val reponse = Serveur.echange(chemin, "POST", fiche("code" to code.trim()))
                when {
                    reponse.first !in 200..299 -> fenetre.alerte = raisonRefus(reponse, CODE_FAUX)
                    champ(reponse.second, "codesSecours") != null -> {
                        fenetre.alerte = ""
                        codes = liste(champ(reponse.second, "codesSecours")).map { texte(it) }
                    }
                    else -> {
                        Messages.afficher("La double authentification est désactivée.", "reussite")
                        fin(true)
                    }
                }
            } catch (e: ErreurHumalis) {
                fenetre.alerte = SANS_REPONSE
            }
        }
    }
    val lus = codes
    if (lus != null) CodesDeSecours(lus) { fin(true) }
    else {
        Text("La double authentification est active. Codes de secours restants : #{codesRestants}.")
        ChampFenetre("Code à six chiffres", code, { code = it.take(LONGUEUR_CODE) }, {}, KeyboardType.Number)
        Button(onClick = { agir("/auth/double/codes") }, modifier = Modifier.fillMaxWidth()) { Text("Nouveaux codes de secours") }
        OutlinedButton(onClick = { agir("/auth/double/desactiver") }, modifier = Modifier.fillMaxWidth()) { Text("Désactiver") }
    }
}
`;

export const CLES_ACCES_KT = String.raw`// Produit par Humalis : les clés d'accès, par le gestionnaire d'identifiants d'Android (Credential Manager).
package PAQUET

import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import android.util.Log
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.exceptions.CreateCredentialProviderConfigurationException
import androidx.credentials.exceptions.CreateCredentialUnsupportedException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import androidx.credentials.exceptions.domerrors.InvalidStateError
import androidx.credentials.exceptions.publickeycredential.CreatePublicKeyCredentialDomException
import java.security.MessageDigest

private const val NON_GEREE = "Cet appareil ne gère pas les clés d'accès."

/** Android signe avec l'empreinte de l'application : son origine n'est pas une adresse web. */
private fun origineDeLApplication(): String {
    val contexte = Appli.contexte
    val infos = contexte.packageManager.getPackageInfo(contexte.packageName, PackageManager.GET_SIGNING_CERTIFICATES).signingInfo ?: throw ErreurHumalis(NON_GEREE)
    val signatures = if (infos.hasMultipleSigners()) infos.apkContentsSigners else infos.signingCertificateHistory
    val empreinte = MessageDigest.getInstance("SHA-256").digest(signatures[0].toByteArray())
    return "android:apk-key-hash:" + Base64.encodeToString(empreinte, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
}

private fun activiteOuRefus() = Activite.courante ?: throw ErreurHumalis("La fenêtre des clés d'accès n'a pas pu s'ouvrir. Réessayez dans un instant.")

/** « ajouter cle d'acces » : créée sur l'appareil, vérifiée par le serveur. */
suspend fun ajouterCleAcces(): Boolean {
    if (Build.VERSION.SDK_INT < 28) throw ErreurHumalis(NON_GEREE)
    val origine = listOf("x-humalis-origine" to origineDeLApplication())
    var options = Serveur.echange("/auth/cle-acces/inscription/options", "POST", fiche(), origine)
    if (options.first == 403 && vrai(champ(options.second, "motDePasseRequis"))) {
        val saisi = demanderMotDePasse("Confirmez votre mot de passe") ?: return false
        options = Serveur.echange("/auth/cle-acces/inscription/options", "POST", fiche("motDePasse" to saisi), origine)
    }
    if (options.first == 401) throw ErreurHumalis("Connectez-vous pour continuer.")
    if (options.first !in 200..299) throw ErreurHumalis(raisonRefus(options, "La clé d'accès n'a pas pu être préparée."))
    val activite = activiteOuRefus()
    val creee = try {
        CredentialManager.create(activite).createCredential(activite, CreatePublicKeyCredentialRequest(versJson(options.second))) as CreatePublicKeyCredentialResponse
    } catch (e: CreateCredentialCancellationException) {
        throw ErreurHumalis("La création de la clé d'accès a été annulée.")
    } catch (e: CreatePublicKeyCredentialDomException) {
        Log.w("Humalis", "Clé d'accès refusée : " + e.type + " " + e.errorMessage)
        throw ErreurHumalis(if (e.domError is InvalidStateError) "Cet appareil a déjà une clé d'accès pour ce compte." else "La clé d'accès n'a pas pu être créée sur cet appareil.")
    } catch (e: CreateCredentialNoCreateOptionException) {
        throw ErreurHumalis(NON_GEREE)
    } catch (e: CreateCredentialProviderConfigurationException) {
        throw ErreurHumalis(NON_GEREE)
    } catch (e: CreateCredentialUnsupportedException) {
        throw ErreurHumalis(NON_GEREE)
    } catch (e: CreateCredentialException) {
        Log.w("Humalis", "Clé d'accès refusée : " + e.type + " " + e.errorMessage)
        throw ErreurHumalis("La clé d'accès n'a pas pu être créée sur cet appareil.")
    }
    val fin = Serveur.echange("/auth/cle-acces/inscription/verifier", "POST", fiche("reponse" to lireJson(creee.registrationResponseJson), "nom" to Build.MODEL))
    if (fin.first !in 200..299) throw ErreurHumalis(raisonRefus(fin, "Cette clé d'accès n'a pas été acceptée."))
    Messages.afficher("Clé d'accès ajoutée.", "reussite")
    return true
}

/** « se connecter par cle d'acces » : sans adresse, l'appareil propose ses clés. */
suspend fun seConnecterParCle(): Boolean {
    if (Build.VERSION.SDK_INT < 28) throw ErreurHumalis(NON_GEREE)
    val debut = Session.brut("/auth/cle-acces/connexion/options", "POST", fiche(), mapOf("x-humalis-origine" to origineDeLApplication())) ?: throw ErreurHumalis(PAS_DE_REPONSE, sansReseau = true)
    if (debut.first !in 200..299) throw ErreurHumalis(raisonRefus(debut, "La connexion n'a pas pu commencer."))
    val activite = activiteOuRefus()
    val demande = GetCredentialRequest(listOf(GetPublicKeyCredentialOption(versJson(champ(debut.second, "options")))))
    val lue = try {
        CredentialManager.create(activite).getCredential(activite, demande).credential
    } catch (e: GetCredentialCancellationException) {
        throw ErreurHumalis("La connexion par clé d'accès a été annulée.")
    } catch (e: NoCredentialException) {
        throw ErreurHumalis("Aucune clé d'accès n'est enregistrée sur cet appareil pour cette application.")
    } catch (e: GetCredentialProviderConfigurationException) {
        throw ErreurHumalis(NON_GEREE)
    } catch (e: GetCredentialUnsupportedException) {
        throw ErreurHumalis(NON_GEREE)
    } catch (e: GetCredentialException) {
        Log.w("Humalis", "Clé d'accès refusée : " + e.type + " " + e.errorMessage)
        throw ErreurHumalis("La connexion par clé d'accès n'a pas pu s'ouvrir sur cet appareil.")
    }
    if (lue !is PublicKeyCredential) throw ErreurHumalis("Cette clé d'accès n'est pas reconnue.")
    val fin = Session.brut("/auth/cle-acces/connexion/verifier", "POST", fiche("ceremonie" to champ(debut.second, "ceremonie"), "reponse" to lireJson(lue.authenticationResponseJson))) ?: throw ErreurHumalis(PAS_DE_REPONSE, sansReseau = true)
    if (fin.first !in 200..299) throw ErreurHumalis(raisonRefus(fin, "Cette clé d'accès n'est pas reconnue."))
    Session.ouvrir(champ(fin.second, "data"))
    return true
}
`;

/** Ce que les données et le compte ajoutent au projet. */
export interface DonneesComptes {
  dependances: string[];
  permissions: string[];
  /** Les lignes à ajouter dans `onCreate`, juste avant l'affichage. */
  demarrage: string[];
  /** Vrai s'il faut dessiner les fenêtres du compte. */
  fenetres: boolean;
  /** Les fichiers à traduire comme le reste de la bibliothèque. */
  aTraduire: string[];
}

/** Les fichiers Kotlin, d'après ce que le programme emploie. `code` : les pages déjà écrites. */
export function ecrireDonneesComptes(contexte: { application: Application; paquet: string; ecrireCode: (fichier: string, contenu: string) => void; code: string }): DonneesComptes {
  const { application, paquet, ecrireCode, code } = contexte;
  const sortie: DonneesComptes = { dependances: [], permissions: [], demarrage: [], fenetres: false, aTraduire: [] };

  const locales = application.partages.filter((p) => p.locale);
  if (locales.length) {
    const synchro = locales.some((p) => p.locale!.synchronisee !== undefined);
    ecrireCode(
      'DonneesLocales.kt',
      kotlin(paquet, DONNEES_LOCALES_KT)
        .replace('LOCALES_DU_PROJET', `listOf(${locales.map((p) => `Partage.${nomLocale(p.nom)}`).join(', ')})`)
        .replace('CONFIER_AU_SYSTEME', synchro ? 'SynchroFond.planifier(Appli.contexte)' : ''),
    );
    sortie.aTraduire.push('DonneesLocales.kt');
    sortie.demarrage.push('DonneesLocales.demarrer()');
    if (synchro) {
      ecrireCode('SynchroFond.kt', kotlin(paquet, SYNCHRO_FOND_KT));
      sortie.dependances.push(`implementation("androidx.work:work-runtime-ktx:${VERSIONS.travail}")`);
      sortie.permissions.push('android.permission.ACCESS_NETWORK_STATE');
    }
  }

  const avecCle = /\b(seConnecterParCle|ajouterCleAcces)\(/.test(code);
  // Le code à six chiffres : demandé à la connexion dès que le serveur l'a, ou activé depuis une page.
  const avecDouble = /\bactiverDoubleAuthentification\(/.test(code) || (application.serveurs.some((s) => s.doubleAuthentification) && /\bseConnecter\(/.test(code));
  if (avecCle || avecDouble) {
    ecrireCode('FenetresSecurite.kt', kotlin(paquet, FENETRES_SECURITE_KT));
    sortie.aTraduire.push('FenetresSecurite.kt');
    sortie.fenetres = true;
  }
  if (avecDouble) {
    ecrireCode('DoubleAuthentification.kt', kotlin(paquet, DOUBLE_KT));
    sortie.aTraduire.push('DoubleAuthentification.kt');
    sortie.demarrage.push('Session.demanderCode = { demanderCodeDeConnexion(it) }');
  }
  if (avecCle) {
    ecrireCode('ClesAcces.kt', kotlin(paquet, CLES_ACCES_KT));
    sortie.aTraduire.push('ClesAcces.kt');
    sortie.dependances.push(`implementation("androidx.credentials:credentials:${VERSIONS.identifiants}")`, `implementation("androidx.credentials:credentials-play-services-auth:${VERSIONS.identifiants}")`);
  }
  return sortie;
}
