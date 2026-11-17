package dev.humalis.intellij.debogueur

import com.intellij.debugger.engine.DebugProcessListener
import com.intellij.debugger.engine.ExtraSteppingFilter
import com.intellij.debugger.engine.SuspendContext
import com.intellij.debugger.engine.SuspendContextImpl
import com.intellij.debugger.impl.DebuggerManagerListener
import com.intellij.debugger.impl.DebuggerSession
import com.intellij.debugger.jdi.StackFrameProxyImpl
import com.intellij.openapi.util.Key
import com.sun.jdi.Location
import com.sun.jdi.request.StepRequest

/** Vrai quand le programme s'est arrêté, la dernière fois, sur une ligne Humalis : le pas en cours part de là. */
private val PAS_DEPUIS_HUMALIS = Key.create<Boolean>("humalis.pasDepuisHumalis")

/**
 * Retient, à chaque arrêt du programme, s'il est arrêté sur une ligne Humalis : le pas suivant part toujours de
 * l'endroit de ce dernier arrêt. (Seulement des interfaces publiques du débogueur : la Marketplace refuse les autres.)
 */
class DebutPasHumalis : DebuggerManagerListener {
    override fun sessionAttached(session: DebuggerSession) {
        val processus = session.process
        processus.addDebugProcessListener(object : DebugProcessListener {
            override fun paused(suspendContext: SuspendContext) {
                val contexte = suspendContext as? SuspendContextImpl ?: return
                val surHumalis = try {
                    contexte.frameProxy?.let { PasAPasHumalis.aUneLigneHumalis(it.location()) } ?: false
                } catch (_: Exception) {
                    false
                }
                processus.putUserData(PAS_DEPUIS_HUMALIS, surHumalis)
            }
        })
    }
}

/**
 * Le pas à pas reste dans les fichiers .humalis. Un pas parti d'une ligne
 * Humalis qui arrive dans du code produit sans ligne Humalis en ressort
 * aussitôt, au lieu de montrer ce code :
 * - « Step Into » sur un calcul de la bibliothèque, Compose ou Kotlin
 *   revient à la ligne Humalis qui l'appelle (une fonction Humalis appelée
 *   garde ses lignes : on y entre comme d'habitude) ;
 * - un pas après la dernière ligne d'un événement laisse l'application
 *   continuer, jusqu'au prochain point d'arrêt ;
 * - le code recopié d'une fonction inline (« noter », les calculs de
 *   Kotlin) est traversé jusqu'à la ligne Humalis suivante.
 * Un pas parti du code Kotlin (un point d'arrêt posé dans un fichier .kt)
 * n'est pas touché.
 */
class PasAPasHumalis : ExtraSteppingFilter {
    override fun isApplicable(context: SuspendContext?): Boolean {
        val contexte = context as? SuspendContextImpl ?: return false
        if (contexte.debugProcess.getUserData(PAS_DEPUIS_HUMALIS) != true) return false
        return try {
            val fil = contexte.thread ?: return false
            val cadres: List<StackFrameProxyImpl> = fil.frames()
            // Ici sur une ligne Humalis : le pas s'arrête normalement. Sinon, on ressort.
            cadres.isNotEmpty() && !aUneLigneHumalis(cadres[0].location())
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Le code recopié d'une fonction inline (dans la même méthode qu'une
     * ligne Humalis) est traversé par un pas de plus ; ailleurs, on ressort.
     */
    override fun getStepRequestDepth(context: SuspendContext?): Int {
        val endroit = try {
            (context as? SuspendContextImpl)?.frameProxy?.location()
        } catch (_: Exception) {
            null
        } ?: return StepRequest.STEP_OUT
        return if (estRecopieInline(endroit)) StepRequest.STEP_OVER else StepRequest.STEP_OUT
    }

    companion object {
        /** Vrai pour le code d'une fonction inline recopié dans une classe produite par Humalis (strate KotlinDebug). */
        fun estRecopieInline(endroit: Location): Boolean = try {
            SmapHumalis.estRecopie(endroit)
        } catch (_: Exception) {
            false
        }

        fun aUneLigneHumalis(endroit: Location): Boolean = try {
            SmapHumalis.situer(endroit) != null
        } catch (_: Exception) {
            false
        }
    }
}
