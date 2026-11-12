package dev.humalis.intellij.debogueur

import com.intellij.debugger.DebuggerContext
import com.intellij.icons.AllIcons
import com.intellij.ui.ColoredTextContainer
import com.intellij.ui.SimpleTextAttributes
import com.intellij.debugger.engine.JavaStackFrame
import com.intellij.debugger.engine.JavaValue
import com.intellij.debugger.engine.evaluation.EvaluateException
import com.intellij.debugger.engine.evaluation.EvaluationContextImpl
import com.intellij.debugger.ui.impl.watch.StackFrameDescriptorImpl
import com.intellij.debugger.ui.impl.watch.ValueDescriptorImpl
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiExpression
import com.intellij.xdebugger.frame.XNamedValue
import com.intellij.xdebugger.frame.XStackFrameUiPresentationContainer
import com.intellij.xdebugger.frame.XValueChildrenList
import com.sun.jdi.ClassType
import com.sun.jdi.ObjectReference
import com.sun.jdi.Value
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf

/**
 * Un cadre de la pile qui vient d'un fichier .humalis. Les variables y sont
 * montrées sous leur nom Humalis : `compte` plutôt que `$compte$delegate`
 * (une variable de page est un état de Compose, dont on montre la valeur),
 * sans les variables internes du code produit (suite des fonctions
 * suspendues, objet de la fonction).
 */
class CadreHumalis(descriptor: StackFrameDescriptorImpl) : JavaStackFrame(descriptor, true) {

    /** Dans la pile : « quandCliqueAjouter — ligne 13 de compteur.humalis ». */
    override fun customizePresentation(component: ColoredTextContainer) {
        val position = sourcePosition
        val endroit = descriptor.location ?: try {
            stackFrameProxy.location()
        } catch (_: Exception) {
            null
        }
        if (position == null || endroit == null) return super.customizePresentation(component)
        component.append(endroit.method().name().substringAfterLast('$'), SimpleTextAttributes.REGULAR_ATTRIBUTES)
        component.append(" — ligne ${position.line + 1} de ${position.file.name}", SimpleTextAttributes.GRAYED_ATTRIBUTES)
        component.setIcon(AllIcons.Debugger.Frame)
    }

    /** La même présentation pour la liste des cadres (qui la demande sous forme de flux). */
    override fun customizePresentation(): Flow<XStackFrameUiPresentationContainer> {
        val conteneur = XStackFrameUiPresentationContainer()
        customizePresentation(conteneur)
        return flowOf(conteneur)
    }

    override fun createThisNode(evaluationContext: EvaluationContextImpl): XNamedValue? = null

    override fun superBuildVariables(evaluationContext: EvaluationContextImpl, children: XValueChildrenList) {
        val processus = evaluationContext.debugProcess
        val noeuds = processus.xdebugProcess?.nodeManager ?: return super.superBuildVariables(evaluationContext, children)
        val projet = processus.project
        val cadre = stackFrameProxy
        val vues = LinkedHashMap<String, Value?>()
        // Les variables reprises par une fonction (événement, minuterie) sont des champs de son objet.
        val objet = try {
            cadre.thisObject()
        } catch (_: EvaluateException) {
            null
        }
        if (objet != null) {
            for (champ in objet.referenceType().allFields()) {
                if (champ.isStatic) continue
                val nom = VariablesHumalis.nomHumalis(champ.name()) ?: continue
                vues.putIfAbsent(nom, objet.getValue(champ))
            }
        }
        for (variable in visibleVariables) {
            val nom = VariablesHumalis.nomHumalis(variable.name()) ?: continue
            vues[nom] = try {
                cadre.getValue(variable)
            } catch (_: EvaluateException) {
                null
            }
        }
        for ((nom, valeur) in vues) {
            val descripteur = VariableHumalis(projet, nom, valeur)
            children.add(JavaValue.create(null, descripteur, evaluationContext, noeuds, false))
        }
    }
}

/** Les noms du code produit, rendus à leur nom Humalis. */
object VariablesHumalis {
    private val DELEGUEE = Regex("""^\$?([\p{L}_][\p{L}\p{N}_]*)\${'$'}delegate$""")
    private val REPRISE = Regex("""^\$([\p{L}_][\p{L}\p{N}_]*)$""")
    private val INTERNES = setOf("this", "completion", "continuation", "result", "nav", "portee", "relances", "label")

    /**
     * Le nom Humalis d'une variable ou d'un champ du code produit, ou null
     * pour un nom interne à cacher : `$compte$delegate` → `compte`,
     * `$panier` (une variable reprise par une fonction) → `panier`,
     * `$completion`, `L$0`, `$i$f$noter` → null.
     */
    fun nomHumalis(nom: String): String? {
        DELEGUEE.matchEntire(nom)?.let { return it.groupValues[1].takeUnless { n -> n in INTERNES } }
        REPRISE.matchEntire(nom)?.let { return it.groupValues[1].takeUnless { n -> n in INTERNES } }
        if (nom.contains('$') || nom in INTERNES) return null
        return nom
    }
}

/** Une variable montrée sous son nom Humalis ; un état de Compose montre sa valeur. */
private class VariableHumalis(projet: Project, private val nom: String, private val brute: Value?) : ValueDescriptorImpl(projet) {
    override fun getName(): String = nom

    override fun calcValue(evaluationContext: EvaluationContextImpl): Value? {
        val objet = brute as? ObjectReference ?: return brute
        val type = objet.referenceType() as? ClassType ?: return brute
        val estEtat = type.allInterfaces().any { it.name() == "androidx.compose.runtime.State" }
        if (!estEtat) return brute
        val lire = type.concreteMethodByName("getValue", "()Ljava/lang/Object;") ?: return brute
        return evaluationContext.debugProcess.invokeMethod(evaluationContext, objet, lire, emptyList())
    }

    override fun getDescriptorEvaluation(context: DebuggerContext): PsiExpression =
        throw EvaluateException("La variable Humalis « $nom » se lit dans la vue des variables.")
}
