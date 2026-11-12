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
import com.sun.jdi.request.EventRequest
import java.util.concurrent.ConcurrentHashMap
import dev.humalis.intellij.HumalisFileType

/** Branche le gestionnaire de positions Humalis sur chaque session de débogage d'un projet qui a une table. */
class HumalisPositionManagerFactory : PositionManagerFactory() {
    override fun createPositionManager(process: DebugProcess): PositionManager? {
        val tables = TablesDuProjet.de(process.project).tables()
        if (tables.isEmpty()) return null
        SmapHumalis.connaitre(tables.flatMap { it.paquets })
        val gestionnaire = HumalisPositionManager(process)
        // Le dernier gestionnaire ajouté est consulté le premier : une fois tous les gestionnaires
        // branchés (Kotlin compris), celui de Humalis repasse en tête, pour qu'un endroit qui a une
        // ligne Humalis soit montré dans le fichier .humalis plutôt que dans le Kotlin produit.
        process.addDebugProcessListener(object : DebugProcessListener {
            override fun processAttached(processus: DebugProcess) {
                processus.appendPositionManager(gestionnaire)
                gestionnaire.suivreLesClasses()
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
        // Seules les lignes que la strate Humalis couvre vraiment (pas le code recopié d'une fonction inline).
        val (chemin, ligne) = SmapHumalis.situer(location) ?: throw NoDataException.INSTANCE
        val table = tables.pourClasse(type.name(), chemin) ?: throw NoDataException.INSTANCE
        val fichier = LocalFileSystem.getInstance().findFileByIoFile(table.fichierHumalis(chemin)) ?: throw NoDataException.INSTANCE
        return ReadAction.compute<SourcePosition?, RuntimeException> {
            PsiManager.getInstance(process.project).findFile(fichier)?.let { SourcePosition.createFromLine(it, ligne - 1) }
        } ?: throw NoDataException.INSTANCE
    }

    /**
     * Les classes du projet déjà préparées. Pas de `VirtualMachine.allClasses()` :
     * sur Android, la liste compte des dizaines de milliers de classes, et les
     * références qu'ART garde alors ralentissent chaque commande du débogueur au
     * point de bloquer le démarrage (avec un point d'arrêt Kotlin dans une
     * fonction inline, qui fait préparer beaucoup de classes). Les classes du
     * projet sont suivies dès le branchement ; les classes principales des
     * fichiers Kotlin sont aussi cherchées par leur nom (débogueur branché à une
     * application déjà lancée).
     */
    override fun getAllClasses(position: SourcePosition): List<ReferenceType> {
        val cibles = cibles(position)
        val vm = process.virtualMachineProxy
        val connues = LinkedHashSet<ReferenceType>(classesPreparees)
        for ((table, _) in cibles) for (nom in table.classesPrincipales()) connues += vm.classesByName(nom)
        return connues.filter { type -> type.isPrepared && cibles.any { (table, chemin) -> table.contientClasse(type.name()) && porte(type, chemin) } }
    }

    /** Les classes préparées des paquets du projet, suivies depuis le branchement. */
    private val classesPreparees: MutableSet<ReferenceType> = ConcurrentHashMap.newKeySet()

    /** Suit la préparation des classes des paquets du projet (sans arrêter l'application). */
    fun suivreLesClasses() {
        val gestionnaire = process.requestsManager
        val suivi = ClassPrepareRequestor { _, type -> classesPreparees += type }
        for (paquet in tables.tables().flatMap { it.paquets }.toSet()) {
            val demande = gestionnaire.createClassPrepareRequest(suivi, if (paquet.isEmpty()) "*" else "$paquet.*") ?: continue
            demande.setSuspendPolicy(EventRequest.SUSPEND_NONE)
            gestionnaire.enableRequest(demande)
        }
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
            // JDI peut rendre des endroits voisins : on garde ceux que la strate relie exactement à cette ligne.
            trouves += endroits.filter { SmapHumalis.situer(it) == chemin to ligne }
        }
        return EndroitsHumalis.garder(trouves, enLigne = { SmapHumalis.estRecopie(it) })
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
        if (SmapHumalis.situer(location) == null) return null
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

    companion object {
        /** Vrai si la strate Humalis de la classe porte ce fichier. */
        fun porte(type: ReferenceType, chemin: String): Boolean = SmapHumalis.de(type)?.chemins?.contains(chemin) == true
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

