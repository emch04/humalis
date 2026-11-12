package dev.humalis.intellij.debogueur

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Les tables du débogueur des projets Android produits par Humalis ouverts
 * dans ce projet. Elles sont cherchées à la racine de chaque dossier du
 * projet et un niveau en dessous (le module « app »), et relues quand elles
 * changent (une nouvelle compilation).
 */
@Service(Service.Level.PROJECT)
class TablesDuProjet(private val project: Project) {
    private val lues = ConcurrentHashMap<String, Pair<Long, TableDebogueur>>()

    /** Les tables du projet, à jour. */
    fun tables(): List<TableDebogueur> = candidats().mapNotNull { lire(it) }

    /** Les tables qui contiennent ce fichier Humalis, chacune avec le chemin du fichier tel qu'il est écrit dans les classes. */
    fun pour(fichier: VirtualFile): List<Pair<TableDebogueur, String>> {
        val surDisque = VfsUtilCore.virtualToIoFile(fichier)
        return tables().mapNotNull { table -> table.cheminDe(surDisque)?.let { table to it } }
    }

    /** La table qui couvre une classe (nom JVM) et contient ce chemin. */
    fun pourClasse(nomClasse: String, chemin: String): TableDebogueur? =
        tables().firstOrNull { it.contientClasse(nomClasse) && chemin in it.chemins }

    private fun candidats(): Set<File> {
        val dossiers = LinkedHashSet<File>()
        project.basePath?.let { dossiers += File(it) }
        for (racine in ProjectRootManager.getInstance(project).contentRoots) {
            if (racine.isInLocalFileSystem) dossiers += VfsUtilCore.virtualToIoFile(racine)
        }
        val tables = LinkedHashSet<File>()
        for (dossier in dossiers) {
            File(dossier, NOM_TABLE).takeIf { it.isFile }?.let { tables += it }
            dossier.listFiles()?.forEach { sous ->
                if (sous.isDirectory && !sous.name.startsWith(".") && sous.name != "build") {
                    File(sous, NOM_TABLE).takeIf { it.isFile }?.let { tables += it }
                }
            }
        }
        return tables
    }

    private fun lire(fichier: File): TableDebogueur? {
        val date = fichier.lastModified()
        lues[fichier.path]?.let { (avant, table) -> if (avant == date) return table }
        val table = TableDebogueur.lire(fichier) ?: return null
        lues[fichier.path] = date to table
        return table
    }

    companion object {
        fun de(project: Project): TablesDuProjet = project.getService(TablesDuProjet::class.java)
    }
}
