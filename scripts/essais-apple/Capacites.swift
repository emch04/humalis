// Rôles et temps réel contre un vrai serveur Humalis ; IA et paiement contre un serveur d'essai.
// Rejoué par scripts/essai-apple-capacites.mjs.
import XCTest

@MainActor
final class Capacites: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws { continueAfterFailure = false }

    private func texte(_ morceau: String) -> XCUIElement {
        app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@", morceau, morceau)).firstMatch
    }

    private func attendre(_ morceau: String, _ message: String = "") {
        XCTAssertTrue(texte(morceau).waitForExistence(timeout: 20), "le texte « \(morceau) » n'apparaît pas. \(message)")
    }

    /** Le serveur reçoit un produit sans que l'application fasse quoi que ce soit. */
    private func creerProduit(_ nom: String) async throws {
        func envoi(_ chemin: String, _ corps: [String: Any], jeton: String? = nil) async throws -> Data {
            var r = URLRequest(url: URL(string: "http://localhost:4977\(chemin)")!)
            r.httpMethod = "POST"
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.setValue("1", forHTTPHeaderField: "x-humalis-mobile")
            if let jeton { r.setValue("Bearer \(jeton)", forHTTPHeaderField: "Authorization") }
            r.httpBody = try JSONSerialization.data(withJSONObject: corps)
            return try await URLSession.shared.data(for: r).0
        }
        let connexion = try await envoi("/auth/login", ["email": "admin@essai.test", "password": "Admin-Essai-2026!"])
        let lu = try JSONSerialization.jsonObject(with: connexion) as? [String: Any]
        let jeton = (lu?["data"] as? [String: Any])?["token"] as? String
        _ = try await envoi("/api/produits", ["nom": nom, "total": 12], jeton: jeton)
    }

    private func toucher(_ nom: String) {
        let bouton = app.buttons[nom].firstMatch
        XCTAssertTrue(bouton.waitForExistence(timeout: 20), "le bouton « \(nom) » n'apparaît pas")
        for _ in 0..<4 where !bouton.isHittable { app.swipeUp() }
        bouton.tap()
    }

    func testRolesEtDirect() async throws {
        app.launch()
        attendre("Espace visiteur", "un visiteur n'a pas le rôle")
        app.textFields.firstMatch.tap()
        app.textFields.firstMatch.typeText("admin@essai.test")
        app.secureTextFields.firstMatch.tap()
        app.secureTextFields.firstMatch.typeText("Admin-Essai-2026!")
        app.buttons["Se connecter"].firstMatch.tap()
        attendre("Espace gerant", "un admin passe toujours")
        try await creerProduit("Produit en direct")
        attendre("Produit en direct", "le serveur annonce le changement, la page se relit seule")
        attendre("Total 12")

        toucher("Bilan")
        attendre("Recette 12", "un résumé calculé par le serveur se lit comme une route")

        toucher("Reduire")
        attendre("Total 10", "l'action reçoit sa valeur, le serveur l'applique")

        toucher("Equipe")
        toucher("Changer")
        attendre("Tel 0102", "le champ du compte a changé sur le serveur")
    }

    func testAConnexionsEtComptes() {
        let env = ProcessInfo.processInfo.environment
        app.launchEnvironment["HUMALIS_ESSAI_JETON_APPLE"] = env["JETON_APPLE"]
        app.launchEnvironment["HUMALIS_ESSAI_NONCE_APPLE"] = "nonce-essai"
        app.launchEnvironment["HUMALIS_ESSAI_GOOGLE"] = "http://localhost:4982"
        app.launch()
        attendre("Espace visiteur")

        toucher("Apple")
        attendre("Espace gerant", "le jeton Apple vérifié par le serveur ouvre la session")

        let invitee = app.textFields.element(boundBy: 1)
        for _ in 0..<4 where !invitee.isHittable { app.swipeUp() }
        invitee.tap()
        invitee.typeText("nouvelle@essai.test")
        toucher("Inviter")
        attendre("Invitation", "le serveur a reçu l'invitation")
        XCTAssertFalse(texte("Connectez-vous").exists, "l'invitation part avec la session")

        toucher("Sortir")
        attendre("Espace visiteur")

        toucher("Google")
        let systeme = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let continuer = systeme.alerts.firstMatch.buttons.element(boundBy: 1)
        XCTAssertTrue(continuer.waitForExistence(timeout: 15), "le système demande d'ouvrir la page de Google")
        continuer.tap()
        attendre("Espace gerant", "le jeton Google vérifié par le serveur ouvre la session")
        toucher("Sortir")
        attendre("Espace visiteur")

        let oubliee = app.textFields.element(boundBy: 2)
        for _ in 0..<4 where !oubliee.isHittable { app.swipeUp() }
        oubliee.tap()
        oubliee.typeText("admin@essai.test")
        toucher("Recevoir")
        attendre("Lien demande")

        app.open(URL(string: "capacites://bienvenue#jeton=lien-inconnu")!)
        attendre("Choisir", "le lien ouvre la page")
        let secret = app.secureTextFields.firstMatch
        XCTAssertTrue(secret.waitForExistence(timeout: 10))
        secret.tap()
        secret.typeText("Nouveau-Essai-2026!")
        toucher("Enregistrer")
        attendre("Lien refuse", "le serveur refuse un jeton qu'il ne connaît pas")
    }

    func testIaAuFilDeLEauEtPaiement() {
        app.launchEnvironment["HUMALIS_SERVEUR"] = "http://localhost:4979"
        app.launch()
        attendre("Exemple")
        app.buttons["Demander"].firstMatch.tap()
        attendre("IA : Bonjour", "le premier morceau de la réponse")
        attendre("IA : Bonjour tout le monde", "la réponse arrive morceau par morceau")
        app.buttons["Payer"].firstMatch.tap()
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 20), "la page de paiement doit s'ouvrir")
    }
}
