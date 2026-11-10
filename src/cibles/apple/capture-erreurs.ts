/** Capture native Apple : l'exception et les signaux fatals sont transmis au prochain lancement. */
import type { RequeteCapture } from '../capture-erreurs.js';

const q = (valeur: string) => JSON.stringify(valeur);
export function captureErreursSwift(requetes: RequeteCapture[]): string {
  const envois = requetes.map((r) => `        do {
            var demande = URLRequest(url: URL(string: ${q(r.adresse)})!)
            demande.httpMethod = "POST"
            demande.timeoutInterval = 3
            demande.setValue("application/json", forHTTPHeaderField: "Content-Type")
            demande.httpBody = try JSONSerialization.data(withJSONObject: [${r.champs.map((c) => `${q(c.nom)}: ${typeof c.valeur === 'string' ? `rapport[${q(c.valeur)}] ?? ""` : q(c.valeur.texte)}`).join(', ')}])
            let (_, reponse) = try await URLSession.shared.data(for: demande)
            if let http = reponse as? HTTPURLResponse, !(200...299).contains(http.statusCode) { return }
        } catch { return /* Le rapport reste en attente après un échec. */ }`).join('\n');
  return `// Produit par Humalis : rapport différé des erreurs fatales Apple.
import Foundation
import Darwin

private let fichierCapture = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("humalis-erreur.json")
nonisolated(unsafe) private var cheminSignal: UnsafeMutablePointer<CChar>?
private func signalFatal(_ numero: Int32) {
    if let cheminSignal {
        let fd = open(cheminSignal, O_WRONLY | O_CREAT | O_TRUNC, 0o600)
        if fd >= 0 {
            let message = "{\\\"message\\\":\\\"Signal fatal\\\",\\\"pile\\\":\\\"\\\",\\\"page\\\":\\\"\\\",\\\"version\\\":\\\"\\\"}"
            message.withCString { ptr in _ = write(fd, ptr, strlen(ptr)) }
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
    let rapport = ["message": nettoyer(exception.reason ?? exception.name.rawValue), "pile": nettoyer(exception.callStackSymbols.joined(separator: "\\n")), "page": CaptureErreurs.page, "version": versionApplication]
    if let donnees = try? JSONSerialization.data(withJSONObject: rapport) { try? donnees.write(to: fichierCapture, options: .atomic) }
}

private let versionApplication = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""

enum CaptureErreurs {
    /** La page affichée, tenue à jour par le routeur. */
    nonisolated(unsafe) static var page = ""

    static func installer() {
        try? FileManager.default.createDirectory(at: fichierCapture.deletingLastPathComponent(), withIntermediateDirectories: true)
        cheminSignal = strdup(fichierCapture.path)
        NSSetUncaughtExceptionHandler(exceptionFatale)
        for numero in [SIGABRT, SIGILL, SIGSEGV, SIGBUS, SIGFPE] { Darwin.signal(numero, signalFatal) }
        Task.detached {
            guard let donnees = try? Data(contentsOf: fichierCapture), var rapport = (try? JSONSerialization.jsonObject(with: donnees)) as? [String: String] else { return }
            // Un signal fatal ne peut pas lire la version : elle est remise ici.
            if rapport["version", default: ""].isEmpty { rapport["version"] = versionApplication }
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
