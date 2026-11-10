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
