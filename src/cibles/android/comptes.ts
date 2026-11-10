/**
 * La connexion avec Google et avec Apple sur Android. Google passe par le
 * gestionnaire d'identifiants du système (Credential Manager) ; Apple n'a
 * pas de fenêtre sur Android : sa page s'ouvre dans un onglet du navigateur,
 * Apple renvoie la personne sur le serveur, qui la renvoie dans
 * l'application par son lien profond. Dans les deux cas, le serveur vérifie
 * le jeton et n'ouvre la session que d'un compte qu'il connaît déjà.
 */

export const GOOGLE_KT = String.raw`// Produit par Humalis : « se connecter avec google », par le gestionnaire d'identifiants d'Android.
package PAQUET

import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import java.util.UUID

/** Le compte Google choisi par la personne ; le serveur vérifie le jeton (son audience est l'ID client Web). */
suspend fun seConnecterAvecGoogle() {
    val reglage = Serveur.appel("/auth/google")
    val identifiant = texte(champ(reglage, "clientId"))
    if (identifiant.isEmpty()) throw ErreurHumalis("La connexion avec Google n'est pas encore réglée sur le serveur (GOOGLE_CLIENT_ID).")
    val activite = Activite.courante ?: throw ErreurHumalis("La fenêtre de Google n'a pas pu s'ouvrir. Réessayez dans un instant.")
    val nonce = UUID.randomUUID().toString()
    val option = GetGoogleIdOption.Builder().setServerClientId(identifiant).setFilterByAuthorizedAccounts(false).setNonce(nonce).build()
    val demande = GetCredentialRequest.Builder().addCredentialOption(option).build()
    val reponse = try {
        CredentialManager.create(activite).getCredential(activite, demande)
    } catch (e: GetCredentialCancellationException) {
        throw ErreurHumalis("La connexion avec Google a été annulée.")
    } catch (e: NoCredentialException) {
        throw ErreurHumalis("Aucun compte Google n'est ajouté à cet appareil.")
    } catch (e: GetCredentialException) {
        throw ErreurHumalis("La connexion avec Google n'a pas pu s'ouvrir sur cet appareil.")
    }
    val lu = reponse.credential
    if (lu !is CustomCredential || lu.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) throw ErreurHumalis("Google n'a pas confirmé votre compte.")
    Session.ouvrirAvecJeton("/auth/google", GoogleIdTokenCredential.createFrom(lu.data).idToken, nonce)
}
`;

export const APPLE_KT = String.raw`// Produit par Humalis : « se connecter avec apple » sur Android : la page d'Apple, puis le retour dans l'application.
package PAQUET

import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.browser.customtabs.CustomTabsIntent
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull

/** Le retour d'Apple, attendu par la connexion en cours (« magasin://connexion-apple?etat=…#jeton=… »). */
object ConnexionApple {
    var attente: CompletableDeferred<Uri?>? = null
    private var ouverte = 0L

    fun recevoir(adresse: Uri) {
        attente?.complete(adresse)
    }

    /** L'application revient au premier plan : si Apple n'a rien renvoyé, la personne a fermé la page. */
    fun reprise() {
        val enCours = attente ?: return
        if (System.currentTimeMillis() - ouverte < 1500) return
        Handler(Looper.getMainLooper()).postDelayed({ enCours.complete(null) }, 1200)
    }

    fun ouvrir(adresse: Uri) {
        val activite = Activite.courante ?: throw ErreurHumalis("La page d'Apple n'a pas pu s'ouvrir. Réessayez dans un instant.")
        ouverte = System.currentTimeMillis()
        CustomTabsIntent.Builder().build().launchUrl(activite, adresse)
    }
}

suspend fun seConnecterAvecApple() {
    val reglage = Serveur.appel("/auth/apple")
    val service = texte(champ(reglage, "clientId"))
    if (service.isEmpty()) throw ErreurHumalis("La connexion avec Apple n'est pas encore réglée sur le serveur (APPLE_SERVICE_ID).")
    val nonce = UUID.randomUUID().toString()
    val etat = UUID.randomUUID().toString()
    val adresse = Uri.parse("https://appleid.apple.com/auth/authorize").buildUpon()
        .appendQueryParameter("client_id", service)
        .appendQueryParameter("redirect_uri", Configuration.SERVEUR.trimEnd('/') + "/auth/apple/retour")
        .appendQueryParameter("response_type", "code id_token")
        .appendQueryParameter("response_mode", "form_post")
        .appendQueryParameter("scope", "email")
        .appendQueryParameter("state", etat)
        .appendQueryParameter("nonce", nonce)
        .build()
    val attente = CompletableDeferred<Uri?>()
    ConnexionApple.attente = attente
    try {
        ConnexionApple.ouvrir(adresse)
        val recu = withTimeoutOrNull(10 * 60 * 1000L) { attente.await() } ?: throw ErreurHumalis("La connexion avec Apple a été annulée.")
        // Le « state » prouve que ce retour répond à cette demande, et pas à une autre.
        if (recu.getQueryParameter("etat") != etat) throw ErreurHumalis("La connexion avec Apple n'a pas pu être vérifiée.")
        val jeton = Uri.decode((recu.encodedFragment ?: "").removePrefix("jeton="))
        if (jeton.isEmpty()) throw ErreurHumalis("Apple n'a pas confirmé votre compte.")
        Session.ouvrirAvecJeton("/auth/apple", jeton, nonce)
    } finally {
        if (ConnexionApple.attente === attente) ConnexionApple.attente = null
    }
}
`;

/** Les identifiants publics de Firebase, lus dans google-services.json (--firebase) ; ce ne sont pas des secrets. */
export interface Firebase {
  cleApi: string;
  application: string;
  projet: string;
  expediteur: string;
}

/** google-services.json : le client de cette application, ou rien s'il n'y est pas. */
export function lireFirebase(texte: string, identifiant: string): Firebase | undefined {
  try {
    const lu = JSON.parse(texte) as { project_info?: { project_id?: string; project_number?: string }; client?: { client_info?: { mobilesdk_app_id?: string; android_client_info?: { package_name?: string } }; api_key?: { current_key?: string }[] }[] };
    const client = lu.client?.find((c) => c.client_info?.android_client_info?.package_name === identifiant);
    const cleApi = client?.api_key?.[0]?.current_key;
    const application = client?.client_info?.mobilesdk_app_id;
    const projet = lu.project_info?.project_id;
    const expediteur = lu.project_info?.project_number;
    return cleApi && application && projet && expediteur ? { cleApi, application, projet, expediteur } : undefined;
  } catch {
    return undefined;
  }
}

export function notificationsKotlin(paquet: string, firebase?: Firebase): string {
  const chaine = (t: string) => JSON.stringify(t).replace(/\$/g, '\\$');
  return `// Produit par Humalis : les notifications, reçues par Firebase Cloud Messaging.
package ${paquet}

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlin.coroutines.resume
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine

object NotificationsHumalis {
    const val CANAL = "humalis"
    /** Vrai si l'application a été compilée avec --firebase : sans lui, elle ne peut pas recevoir de notification. */
    const val REGLEE = ${firebase ? 'true' : 'false'}

    /** Au lancement : le canal des notifications, et Firebase avec les identifiants du projet. */
    fun configurer(contexte: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val canal = NotificationChannel(CANAL, "Notifications", NotificationManager.IMPORTANCE_DEFAULT)
            (contexte.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(canal)
        }
${firebase
    ? `        if (FirebaseApp.getApps(contexte).isEmpty()) FirebaseApp.initializeApp(
            contexte,
            FirebaseOptions.Builder().setApiKey(${chaine(firebase.cleApi)}).setApplicationId(${chaine(firebase.application)}).setProjectId(${chaine(firebase.projet)}).setGcmSenderId(${chaine(firebase.expediteur)}).build(),
        )`
    : ''}
    }

    /** Montre une notification reçue pendant que l'application est ouverte. */
    fun montrer(contexte: Context, titre: String, texte: String) {
        if (Build.VERSION.SDK_INT >= 33 && androidx.core.content.ContextCompat.checkSelfPermission(contexte, Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return
        val notification = NotificationCompat.Builder(contexte, CANAL).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(titre).setContentText(texte).setAutoCancel(true).build()
        NotificationManagerCompat.from(contexte).notify(System.currentTimeMillis().toInt(), notification)
    }

    suspend fun inscrire(jeton: String) {
        Serveur.appelReussi("/auth/appareils", "POST", fiche("android" to jeton))
    }
}

/** « activer notifications » : la permission, puis cet appareil reçoit les notifications du compte. */
suspend fun activerNotifications() {
    if (Build.VERSION.SDK_INT >= 33 && !permission(Manifest.permission.POST_NOTIFICATIONS)) {
        Messages.afficher("Les notifications ne sont pas permises : autorisez-les dans les réglages de l'appareil.", "erreur")
        return
    }
    if (!NotificationsHumalis.REGLEE) {
        Messages.afficher("Les notifications ne sont pas encore réglées pour cette application.", "avertissement")
        return
    }
    val jeton: String? = suspendCancellableCoroutine { suite ->
        FirebaseMessaging.getInstance().token.addOnCompleteListener { tache -> suite.resume(if (tache.isSuccessful) tache.result else null) }
    }
    if (jeton == null) {
        Messages.afficher("Les notifications n'ont pas pu être activées. Réessayez dans un instant.", "erreur")
        return
    }
    NotificationsHumalis.inscrire(jeton)
}

/** Firebase donne un nouveau jeton, ou une notification arrive pendant que l'application est ouverte. */
class ServiceNotificationsHumalis : FirebaseMessagingService() {
    private val portee = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun onNewToken(jeton: String) {
        Appli.contexte = applicationContext
        if (Session.jeton != null) portee.launch { NotificationsHumalis.inscrire(jeton) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val n = message.notification ?: return
        NotificationsHumalis.montrer(applicationContext, n.title ?: "", n.body ?: "")
    }
}
`;
}
