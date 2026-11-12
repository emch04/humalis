package dev.humalis.intellij.debogueur

import com.intellij.debugger.MultiRequestPositionManager
import com.intellij.debugger.NoDataException
import com.intellij.debugger.PositionManager
import com.intellij.debugger.PositionManagerFactory
import com.intellij.debugger.SourcePosition
import com.intellij.debugger.engine.DebugProcess
import com.intellij.debugger.engine.DebugProcessListener
import com.intellij.debugger.engine.PositionManagerWithMultipleStackFrames
import com.intellij.debugger.engine.evaluation.EvaluationContext
import com.intellij.debugger.jdi.StackFrameProxyImpl
import com.intellij.debugger.jdi.VirtualMachineProxyImpl
import com.intellij.debugger.requests.ClassPrepareRequestor
import com.intellij.debugger.ui.impl.watch.StackFrameDescriptorImpl
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.psi.PsiManager
import com.intellij.util.ThreeState
import com.intellij.xdebugger.frame.XStackFrame
import com.sun.jdi.AbsentInformationException
import com.sun.jdi.Location
import com.sun.jdi.ReferenceType
import com.sun.jdi.request.ClassPrepareRequest
import dev.humalis.intellij.HumalisFileType

/** Branche le gestionnaire de positions Humalis sur chaque session de débogage d'un projet qui a une table. */
class HumalisPositionManagerFactory : PositionManagerFactory() {
    override fun createPositionManager(process: DebugProcess): PositionManager? {
        if (TablesDuProjet.de(process.project).tables().isEmpty()) return null
        val gestionnaire = HumalisPositionManager(process)
        // Le dernier gestionnaire ajouté est consulté le premier : une fois tous les gestionnaires
        // branchés (Kotlin compris), celui de Humalis repasse en tête, pour qu'un endroit qui a une
        // ligne Humalis soit montré dans le fichier .humalis plutôt que dans le Kotlin produit.
        process.addDebugProcessListener(object : DebugProcessListener {
            override fun processAttached(processus: DebugProcess) {
                processus.appendPositionManager(gestionnaire)
            }
        })
        return gestionnaire
    }
}

/**
 * Relie le code des applications Android produites par Humalis aux fichiers
 * .humalis, par la strate « Humalis » de leurs classes (JSR-45) :
 * - une ligne Humalis devient les endroits du code qui la portent (points d'arrêt) ;
 * - un endroit du code devient sa ligne Humalis (la pile, le pas à pas) ;
 * - les variables de la page sont montrées sous leur nom Humalis.
 * Une classe sans strate Humalis est laissée aux autres gestionnaires (Kotlin, Java).
 */
class HumalisPositionManager(private val process: DebugProcess) : MultiRequestPositionManager, PositionManagerWithMultipleStackFrames {
    private val tables = TablesDuProjet.de(process.project)

    /**
     * Tous les types de fichiers : la position d'un endroit du code n'est
     * demandée qu'aux gestionnaires qui acceptent le type de son fichier
     * produit (PageAccueil.kt, du Kotlin). Un endroit sans strate Humalis,
     * ou une position hors d'un fichier .humalis, est aussitôt laissé aux
     * autres (NoDataException).
     */
    override fun getAcceptedFileTypes(): Set<FileType>? = null

    override fun isAcceptedFileType(fileType: FileType): Boolean = true

    override fun getSourcePosition(location: Location?): SourcePosition {
        if (location == null) throw NoDataException.INSTANCE
        val type = location.declaringType()
        if (!aLaStrate(type)) throw NoDataException.INSTANCE
        val ligne = location.lineNumber(STRATE_HUMALIS)
        if (ligne <= 0) throw NoDataException.INSTANCE
        val chemin = try {
            location.sourcePath(STRATE_HUMALIS)
        } catch (_: AbsentInformationException) {
            throw NoDataException.INSTANCE
        }
        val table = tables.pourClasse(type.name(), chemin) ?: throw NoDataException.INSTANCE
        val fichier = LocalFileSystem.getInstance().findFileByIoFile(table.fichierHumalis(chemin)) ?: throw NoDataException.INSTANCE
        return ReadAction.compute<SourcePosition?, RuntimeException> {
            PsiManager.getInstance(process.project).findFile(fichier)?.let { SourcePosition.createFromLine(it, ligne - 1) }
        } ?: throw NoDataException.INSTANCE
    }

    override fun getAllClasses(position: SourcePosition): List<ReferenceType> {
        val cibles = cibles(position)
        val vm = process.virtualMachineProxy as VirtualMachineProxyImpl
        return vm.allClasses().filter { type -> cibles.any { (table, chemin) -> table.contientClasse(type.name()) && porte(type, chemin) } }
    }

    override fun locationsOfLine(type: ReferenceType, position: SourcePosition): List<Location> {
        val cibles = cibles(position)
        val ligne = position.line + 1
        val nom = position.file.name
        val trouves = ArrayList<Location>()
        for ((table, chemin) in cibles) {
            if (!table.contientClasse(type.name()) || !porte(type, chemin)) continue
            val endroits = try {
                type.locationsOfLine(STRATE_HUMALIS, nom, ligne)
            } catch (_: AbsentInformationException) {
                continue
            }
            trouves += endroits.filter { cheminDe(it) == chemin }
        }
        return EndroitsHumalis.garder(trouves, enLigne = { aLaStrateDebug(it.declaringType()) && it.lineNumber(STRATE_KOTLIN_DEBUG) > 0 })
    }

    override fun createPrepareRequests(requestor: ClassPrepareRequestor, position: SourcePosition): List<ClassPrepareRequest> {
        val cibles = cibles(position)
        val gestionnaire = process.requestsManager
        val demandes = ArrayList<ClassPrepareRequest>()
        for ((table, chemin) in cibles) {
            // Chaque classe préparée d'un paquet du projet est retenue si sa strate Humalis porte ce fichier.
            val filtre = ClassPrepareRequestor { processus, type -> if (porte(type, chemin)) requestor.processClassPrepare(processus, type) }
            for (paquet in table.paquets) {
                gestionnaire.createClassPrepareRequest(filtre, if (paquet.isEmpty()) "*" else "$paquet.*")?.let { demandes += it }
            }
        }
        return demandes
    }

    override fun createPrepareRequest(requestor: ClassPrepareRequestor, position: SourcePosition): ClassPrepareRequest =
        createPrepareRequests(requestor, position).firstOrNull() ?: throw NoDataException.INSTANCE

    /** Les conditions des points d'arrêt sont évaluées comme d'habitude. */
    override fun evaluateCondition(context: EvaluationContext, frame: StackFrameProxyImpl, location: Location, expression: String): ThreeState = ThreeState.UNSURE

    override fun createStackFrames(descriptor: StackFrameDescriptorImpl): List<XStackFrame>? {
        // L'endroit d'un cadre qui n'est pas en haut de la pile n'est pas toujours déjà calculé par le descripteur.
        val location = descriptor.location ?: try {
            descriptor.frameProxy.location()
        } catch (_: Exception) {
            null
        } ?: return null
        if (!aLaStrate(location.declaringType()) || location.lineNumber(STRATE_HUMALIS) <= 0) return null
        return listOf(CadreHumalis(descriptor))
    }

    /** Les cadres sous le premier sont demandés ainsi (la version par défaut ne rend rien). */
    override suspend fun createStackFramesAsync(descriptor: StackFrameDescriptorImpl): List<XStackFrame>? = createStackFrames(descriptor)

    /** Les tables qui contiennent le fichier de la position (un fichier .humalis), sinon : pas pour nous. */
    private fun cibles(position: SourcePosition): List<Pair<TableDebogueur, String>> {
        val fichier = position.file.virtualFile ?: position.file.originalFile.virtualFile ?: throw NoDataException.INSTANCE
        if (fichier.fileType != HumalisFileType) throw NoDataException.INSTANCE
        return tables.pour(fichier).ifEmpty { throw NoDataException.INSTANCE }
    }

    private fun cheminDe(endroit: Location): String? = try {
        endroit.sourcePath(STRATE_HUMALIS)
    } catch (_: AbsentInformationException) {
        null
    }

    companion object {
        const val STRATE_KOTLIN_DEBUG = "KotlinDebug"

        fun aLaStrate(type: ReferenceType): Boolean = try {
            STRATE_HUMALIS in type.availableStrata()
        } catch (_: Exception) {
            false
        }

        fun aLaStrateDebug(type: ReferenceType): Boolean = try {
            STRATE_KOTLIN_DEBUG in type.availableStrata()
        } catch (_: Exception) {
            false
        }

        /** Vrai si la strate Humalis de la classe porte ce fichier. */
        fun porte(type: ReferenceType, chemin: String): Boolean = try {
            aLaStrate(type) && chemin in type.sourcePaths(STRATE_HUMALIS)
        } catch (_: Exception) {
            false
        }
    }
}

/** Le choix des endroits d'une ligne Humalis où poser un point d'arrêt. */
object EndroitsHumalis {
    /**
     * Une ligne Humalis couvre souvent plusieurs endroits du code. On garde,
     * dans chaque méthode, le premier endroit de chaque ligne Kotlin ; et les
     * endroits venus d'une fonction inline ne sont gardés que si la méthode
     * n'en a pas d'autre pour cette ligne (sinon le point d'arrêt serait atteint
     * deux fois pour une seule ligne Humalis).
     */
    fun <T : Location> garder(endroits: List<T>, enLigne: (T) -> Boolean): List<T> {
        val parMethode = endroits.groupBy { it.method() }
        val gardes = ArrayList<T>()
        for ((_, liste) in parMethode) {
            val (inline, directs) = liste.partition(enLigne)
            val choisis = directs.ifEmpty { inline }
            choisis.groupBy { it.lineNumber(DebugProcess.JAVA_STRATUM) }.values.mapTo(gardes) { memeLigne -> memeLigne.minBy { it.codeIndex() } }
        }
        return gardes.sortedWith(compareBy({ it.method().name() }, { it.codeIndex() }))
    }
}
