// Les fonctions de l'appareil, essayées sur le simulateur iPhone.
// Rejoué par scripts/essai-apple-appareil.mjs.
import XCTest

@MainActor
final class Appareil: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws { continueAfterFailure = false }

    private func texte(_ morceau: String) -> XCUIElement {
        app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@", morceau, morceau)).firstMatch
    }

    private func attendre(_ morceau: String, _ message: String = "") {
        XCTAssertTrue(texte(morceau).waitForExistence(timeout: 25), "le texte « \(morceau) » n'apparaît pas. \(message)")
    }

    private func toucher(_ nom: String) {
        let bouton = app.buttons[nom].firstMatch
        XCTAssertTrue(bouton.waitForExistence(timeout: 20), "le bouton « \(nom) » n'apparaît pas")
        if !bouton.isHittable { app.swipeUp() }
        bouton.tap()
    }

    func testAFonctions() {
        app.launch()
        attendre("Paquet 3", "la vue Swift se sert du paquet")
        attendre("Produit Exemple", "le serveur a répondu")

        let zone = app.descendants(matching: .any)["zone_signature"].firstMatch
        XCTAssertTrue(zone.waitForExistence(timeout: 10), "la zone de signature n'apparaît pas")
        let debut = zone.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5))
        let fin = zone.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.4))
        debut.press(forDuration: 0.1, thenDragTo: fin)
        attendre("Signature recue", "la signature doit remplir la variable")

        toucher("Vibrer")
        attendre("Secousse oui")

        // Le simulateur n'a pas d'appareil photo : le message clair doit le dire.
        toucher("Scanner")
        attendre("ne peut pas scanner")
        attendre("Code vide")

        toucher("Verifier")
        attendre("Identite confirmee", "Face ID, reconnu par le simulateur")
    }

    func testBHorsLigne() {
        // Le lancement précédent a gardé la réponse ; ici le serveur ne répond plus.
        app.launchEnvironment["HUMALIS_SERVEUR"] = "http://localhost:4998"
        app.launch()
        attendre("Produit Exemple", "la dernière réponse reste lisible sans réseau")
        XCTAssertFalse(texte("n'a pas répondu").waitForExistence(timeout: 6), "sans réseau, pas de message d'erreur")
    }
}
