// La position, les liens profonds, le réveil en arrière-plan et les envois hors ligne, sur le simulateur iPhone.
// Rejoué par scripts/essai-apple-fond.mjs.
import CoreLocation
import XCTest

@MainActor
final class Fond: XCTestCase {
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
        bouton.tap()
    }

    func testAEnvoisSansReseau() {
        // Rien n'écoute à cette adresse : le serveur est injoignable.
        app.launchEnvironment["HUMALIS_SERVEUR"] = "http://localhost:4998"
        app.launch()
        attendre("Etat attente")
        toucher("Envoyer")
        attendre("Etat fini", "le geste continue même sans réseau")
        attendre("ce sera envoyé", "la personne sait que ce n'est pas encore parti")
    }

    func testBEnvoisAuRetour() {
        // Nouveau lancement, serveur revenu : ce qui était gardé sur le disque part, dans l'ordre et une seule fois.
        app.launch()
        for _ in 0..<20 where !texte("Recu 2-deux").exists {
            toucher("Relire")
            _ = texte("Recu 2-deux").waitForExistence(timeout: 2)
        }
        attendre("Recu 1-un", "le premier envoi part en premier")
        attendre("Recu 2-deux", "le deuxième envoi part ensuite")
        XCTAssertFalse(texte("Recu 3-").exists, "aucun envoi ne part deux fois")
    }

    func testCPosition() {
        XCUIDevice.shared.location = XCUILocation(location: CLLocation(latitude: 48.85, longitude: 2.35))
        app.launch()
        toucher("Position")
        let systeme = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let autoriser = systeme.alerts.firstMatch.buttons.element(boundBy: 1)
        XCTAssertTrue(autoriser.waitForExistence(timeout: 15), "le système demande l'autorisation")
        autoriser.tap()
        attendre("Latitude 48", "la position du simulateur arrive dans la variable")
    }

    func testDLiensProfonds() {
        app.launch()
        attendre("Etat attente")
        app.open(URL(string: "essaifond://detail/42")!)
        attendre("Detail 42", "le lien ouvre la page avec son paramètre")
        app.open(URL(string: "essaifond://inconnue")!)
        attendre("n'existe pas", "une adresse inconnue est dite clairement")
        app.open(URL(string: "essaifond://")!)
        attendre("Etat attente", "le lien sans page revient à l'accueil")
    }

    func testFCoupureApresReception() {
        // Le serveur a reçu l'envoi, mais la réponse s'est perdue : il repart sous le même identifiant, sans doublon.
        app.launch()
        attendre("Etat attente")
        toucher("Couper")
        for _ in 0..<25 where !texte("Recu 3-coupe-rejoue").exists {
            toucher("Relire")
            _ = texte("Recu 3-coupe-rejoue").waitForExistence(timeout: 2)
        }
        attendre("Recu 3-coupe-rejoue", "le renvoi porte le même identifiant")
        XCTAssertFalse(texte("Recu 4-").exists, "le serveur n'a fait le travail qu'une fois")
    }

    func testEArrierePlan() {
        app.launchEnvironment["HUMALIS_ESSAI_ARRIERE_PLAN"] = "1"
        app.launch()
        attendre("Reveil oui", "la tâche change la variable partagée")
        attendre("Derniers 2", "la tâche lit le serveur")
    }
}
