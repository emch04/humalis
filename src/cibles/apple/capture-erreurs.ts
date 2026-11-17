/** Capture native Apple : l'exception et les signaux fatals sont transmis au prochain lancement. */
import { CHEMIN_RELAIS_ERREURS, envoisCible, type CaptureClient } from '../capture-erreurs.js';

const q = (valeur: string) => JSON.stringify(valeur);
/** Un rapport qui porte un secret part vers le serveur Humalis (Serveur.base), qui ajoute la clé. */
export function captureErreursSwift(capture: CaptureClient): string {
  const envois = envoisCible(capture, q, `adresseServeur + ${q(CHEMIN_RELAIS_ERREURS)}`).map((r) => `        do {
            guard let adresse = URL(string: ${r.adresse}) else { return }
            var demande = URLRequest(url: adresse)
            demande.httpMethod = "POST"
            demande.timeoutInterval = 3
            demande.setValue("application/json", forHTTPHeaderField: "Content-Type")
${r.entetes.map(([n, v]) => `            demande.setValue(${q(v)}, forHTTPHeaderField: ${q(n)})
`).join('')}            demande.httpBody = try JSONSerialization.data(withJSONObject: [${r.champs.map((c) => `${q(c.nom)}: ${typeof c.valeur === 'string' ? `rapport[${q(c.valeur)}] ?? ""` : q(c.valeur.texte)}`).join(', ')}])
            let (_, reponse) = try await URLSession.shared.data(for: demande)
            if let http = reponse as? HTTPURLResponse, !(200...299).contains(http.statusCode) { return }
        } catch { return /* Le rapport reste en attente après un échec. */ }`).join('\n');
  return `// Produit par Humalis : rapport différé des erreurs fatales Apple.
import Foundation
import Darwin

private let fichierCapture = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("humalis-erreur.json")
nonisolated(unsafe) private var cheminSignal: UnsafeMutablePointer<CChar>?
/** Préparés à l'installation : un signal ne doit rien allouer. */
nonisolated(unsafe) private var debutSignal: UnsafeMutablePointer<CChar>?
nonisolated(unsafe) private var chiffresSignal = UnsafeMutablePointer<CChar>.allocate(capacity: 24)
private func signalFatal(_ numero: Int32) {
    if let cheminSignal, let debutSignal {
        let fd = open(cheminSignal, O_WRONLY | O_CREAT | O_TRUNC, 0o600)
        if fd >= 0 {
            _ = write(fd, debutSignal, strlen(debutSignal))
            // La dernière ligne Humalis commencée, écrite chiffre par chiffre.
            var reste = Swift.max(0, HumalisLignes.ici)
            var n = 0
            repeat { chiffresSignal[23 - n] = CChar(48 + reste % 10); reste /= 10; n += 1 } while reste > 0 && n < 23
            _ = write(fd, chiffresSignal + (24 - n), n)
            _ = write(fd, "\\\"}", 2)
            _ = close(fd)
        }
    }
    Darwin.signal(numero, SIG_DFL)
    Darwin.raise(numero)
}

private func nettoyer(_ texte: String) -> String {
    var resultat = String(texte.prefix(4000))
    for motif in ["([?&][^=\\\\s]+)=([^&\\\\s]+)", "(?i)(password|mot.?de.?passe|secret|token|jeton|authorization)(\\\\s*[:=]\\\\s*)[^\\\\s,;]+"] {
        resultat = resultat.replacingOccurrences(of: motif, with: "$1=[masqué]", options: .regularExpression)
    }
    return resultat
}

private func exceptionFatale(_ exception: NSException) {
    let ligne = HumalisLignes.situer(HumalisLignes.ici)
    let pile = (ligne.isEmpty ? "" : "\\(enClair(ligne))\\n") + exception.callStackSymbols.joined(separator: "\\n")
    let rapport = ["message": nettoyer(exception.reason ?? exception.name.rawValue), "pile": nettoyer(pile), "ligne": ligne, "page": CaptureErreurs.page, "version": versionApplication]
    if let donnees = try? JSONSerialization.data(withJSONObject: rapport) { try? donnees.write(to: fichierCapture, options: .atomic) }
}

/** La dernière ligne Humalis commencée (ligne fusionnée du projet), tenue à jour par le code des actions. */
enum HumalisLignes {
    nonisolated(unsafe) static var ici = 0
    static let fichiers: [String] = [/*@humalis-fichiers*/]

    /** « boutique.humalis:12 », ou "" si la ligne est inconnue. */
    static func situer(_ ligne: Int) -> String {
        let k = ligne / 1_000_000
        let locale = ligne % 1_000_000
        return ligne > 0 && k < fichiers.count ? "\\(fichiers[k]):\\(locale)" : ""
    }
}

/** « boutique.humalis:12 » → « ligne 12 de boutique.humalis ». */
private func enClair(_ ligne: String) -> String {
    guard let i = ligne.lastIndex(of: ":") else { return ligne }
    return "ligne \\(ligne[ligne.index(after: i)...]) de \\(ligne[..<i])"
}

private let versionApplication = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""

enum CaptureErreurs {
    /** La page affichée, tenue à jour par le routeur. */
    nonisolated(unsafe) static var page = ""

    /** Appelée au lancement, sur le fil principal (là où se lit l'adresse du serveur). */
    @MainActor static func installer() {
${capture.relais ? '        // Le rapport qui porte un secret part vers le serveur Humalis, qui ajoute la clé.\n        let adresseServeur = Serveur.base\n' : ''}        try? FileManager.default.createDirectory(at: fichierCapture.deletingLastPathComponent(), withIntermediateDirectories: true)
        cheminSignal = strdup(fichierCapture.path)
        debutSignal = strdup("{\\"message\\":\\"Signal fatal\\",\\"pile\\":\\"\\",\\"page\\":\\"\\",\\"version\\":\\"\\",\\"ligneBrute\\":\\"")
        NSSetUncaughtExceptionHandler(exceptionFatale)
        // SIGTRAP : un arrêt du langage Swift (conversion impossible, dépassement) sur une puce Apple.
        for numero in [SIGABRT, SIGILL, SIGSEGV, SIGBUS, SIGFPE, SIGTRAP] { Darwin.signal(numero, signalFatal) }
        Task.detached {
            guard let donnees = try? Data(contentsOf: fichierCapture), var rapport = (try? JSONSerialization.jsonObject(with: donnees)) as? [String: String] else { return }
            // Un signal fatal ne peut pas lire la version : elle est remise ici.
            if rapport["version", default: ""].isEmpty { rapport["version"] = versionApplication }
            // Après un signal : la ligne Humalis vient du nombre écrit par le signal.
            if let brute = rapport.removeValue(forKey: "ligneBrute"), let n = Int(brute) {
                let ligne = HumalisLignes.situer(n)
                rapport["ligne"] = ligne
                if !ligne.isEmpty { rapport["pile"] = "Signal fatal, \\(enClair(ligne))" }
            }
            let cle = (rapport["message"] ?? "") + "|" + (rapport["pile"] ?? "")
            let defauts = UserDefaults.standard
            let date = defauts.double(forKey: "humalis.erreur.minute")
            let compte = defauts.string(forKey: "humalis.erreur.cle") == cle && Date().timeIntervalSince1970 - date < 60 ? defauts.integer(forKey: "humalis.erreur.compte") : 0
            guard compte < 3 else { return }
${envois}
            try? FileManager.default.removeItem(at: fichierCapture)
            defauts.set(cle, forKey: "humalis.erreur.cle")
            defauts.set(compte + 1, forKey: "humalis.erreur.compte")
            defauts.set(Date().timeIntervalSince1970, forKey: "humalis.erreur.minute")
        }
    }
}
`;
}
