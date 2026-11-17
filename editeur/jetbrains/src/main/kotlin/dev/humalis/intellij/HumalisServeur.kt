package dev.humalis.intellij

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import com.intellij.util.EnvironmentUtil
import com.redhat.devtools.lsp4ij.LanguageServerFactory
import com.redhat.devtools.lsp4ij.server.OSProcessStreamConnectionProvider
import com.redhat.devtools.lsp4ij.server.StreamConnectionProvider
import java.io.File
import java.io.IOException

/** Le serveur de langage Humalis pour LSP4IJ : « humalis editeur --stdio ». */
class HumalisServeurFactory : LanguageServerFactory {
    override fun createConnectionProvider(project: Project): StreamConnectionProvider = HumalisConnexion(project)
}

class HumalisConnexion(project: Project) : OSProcessStreamConnectionProvider() {
    init {
        val commande = trouverHumalis()
        val ligne = GeneralCommandLine(commande?.path ?: "humalis", "editeur", "--stdio")
            .withEnvironment(EnvironmentUtil.getEnvironmentMap())
            .withCharset(Charsets.UTF_8)
        // Un projet sans dossier sur le disque (projet par défaut, essai) : le serveur part du dossier courant.
        project.basePath?.takeIf { File(it).isDirectory }?.let { ligne.withWorkDirectory(it) }
        commandLine = ligne
    }

    override fun start() {
        if (trouverHumalis() == null) {
            throw IOException(
                "La commande « humalis » est introuvable. Installez-la avec « npm install -g humalis » " +
                    "(Node 24 ou plus récent), puis rouvrez le projet.",
            )
        }
        super.start()
    }

    companion object {
        private val NOMS = if (SystemInfo.isWindows) listOf("humalis.cmd", "humalis.exe", "humalis") else listOf("humalis")

        /**
         * Cherche « humalis » dans le PATH du shell de l'utilisateur (un IDE lancé
         * depuis le Dock ne l'a pas toujours), puis dans les dossiers habituels de npm.
         */
        fun trouverHumalis(): File? {
            val path = EnvironmentUtil.getValue("PATH") ?: System.getenv("PATH") ?: ""
            path.split(File.pathSeparator).filter { it.isNotBlank() }.forEach { dossier ->
                NOMS.map { File(dossier, it) }.firstOrNull { it.isFile && it.canExecute() }?.let { return it }
            }
            val maison = System.getProperty("user.home")
            val dossiers = buildList {
                if (SystemInfo.isWindows) {
                    System.getenv("APPDATA")?.let { add("$it\\npm") }
                } else {
                    addAll(listOf("/opt/homebrew/bin", "/usr/local/bin", "$maison/.npm-global/bin", "$maison/.local/bin", "$maison/.volta/bin"))
                }
            }
            return dossiers.flatMap { d -> NOMS.map { File(d, it) } }.firstOrNull { it.canExecute() }
        }
    }
}
