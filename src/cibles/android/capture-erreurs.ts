/** Rapport différé après un arrêt fatal Android. */
import type { RequeteCapture } from '../capture-erreurs.js';

const q = (texte: string) => JSON.stringify(texte);

export function captureErreursKotlin(requetes: RequeteCapture[]): string {
  const envois = requetes.map((r) => `        try {
            val corps = JSONObject().apply { ${r.champs.map((c) => `put(${q(c.nom)}, ${typeof c.valeur === 'string' ? `rapport.optString(${q(c.valeur)})` : q(c.valeur.texte)})`).join('; ')} }.toString()
            val connexion = URL(${q(r.adresse)}).openConnection() as HttpURLConnection
            connexion.requestMethod = "POST"
            connexion.connectTimeout = 3000
            connexion.readTimeout = 3000
            connexion.doOutput = true
            connexion.setRequestProperty("Content-Type", "application/json")
            connexion.outputStream.use { it.write(corps.toByteArray(Charsets.UTF_8)) }
            val reponse = connexion.responseCode
            connexion.disconnect()
            if (reponse !in 200..299) return@thread
        } catch (_: Exception) { return@thread }`).join('\n');
  return `// Produit par Humalis : les erreurs fatales sont envoyées au lancement suivant.
import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

object CaptureErreurs {
    private const val fichier = "humalis_capture_erreurs"
    /** La page affichée, tenue à jour par la navigation. */
    @Volatile var page: String = ""
    private fun nettoyer(texte: String?): String = (texte ?: "").take(4000)
        .replace(Regex("([?&][^=\\\\s]+)=([^&\\\\s]+)"), "$1=[masqué]")
        .replace(Regex("(password|mot.?de.?passe|secret|token|jeton|authorization)(\\\\s*[:=]\\\\s*)[^\\\\s,;]+", RegexOption.IGNORE_CASE), "$1$2[masqué]")

    fun installer(contexte: Context) {
        val preferences = contexte.getSharedPreferences(fichier, Context.MODE_PRIVATE)
        val ancien = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { fil, exception ->
            try {
                val rapport = JSONObject().apply {
                    put("message", nettoyer(exception.message))
                    put("pile", nettoyer(exception.stackTraceToString()))
                    put("page", page)
                    put("version", try { contexte.packageManager.getPackageInfo(contexte.packageName, 0).versionName ?: "" } catch (_: Exception) { "" })
                }
                preferences.edit().putString("en_attente", rapport.toString()).commit()
            } catch (_: Exception) { }
            ancien?.uncaughtException(fil, exception)
        }
        thread(name = "humalis-capture-erreurs") {
            val brut = preferences.getString("en_attente", null) ?: return@thread
            try {
                val rapport = JSONObject(brut)
                val cle = rapport.optString("message") + "|" + rapport.optString("pile").lineSequence().firstOrNull()
                val maintenant = System.currentTimeMillis()
                val precedent = preferences.getString("cle", null)
                val debut = preferences.getLong("minute", 0)
                val compte = if (precedent == cle && maintenant - debut < 60_000) preferences.getInt("compte", 0) else 0
                if (compte >= 3) return@thread
${envois}
                preferences.edit().remove("en_attente").putString("cle", cle).putLong("minute", if (compte == 0) maintenant else debut).putInt("compte", compte + 1).apply()
            } catch (_: Exception) { /* La capture ne doit pas faire tomber l'application. */ }
        }
    }
}
`;
}
