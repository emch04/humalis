// Les composants natifs sur le simulateur iPhone. Rejoué par scripts/essai-apple-natifs.mjs.
import XCTest

@MainActor
final class Natifs: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws { continueAfterFailure = false }

    private func texte(_ morceau: String) -> XCUIElement {
        app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@", morceau, morceau)).firstMatch
    }

    private func attendre(_ morceau: String, _ message: String = "") {
        XCTAssertTrue(texte(morceau).waitForExistence(timeout: 20), "le texte « \(morceau) » n'apparaît pas. \(message)")
    }

    func testComposants() {
        app.launch()
        attendre("Aucune tache", "l'écran vide natif")
        let onglets = app.tabBars.firstMatch
        XCTAssertTrue(onglets.waitForExistence(timeout: 10), "la vraie barre d'onglets")

        let ajouter = app.navigationBars.buttons["Ajouter"].firstMatch
        XCTAssertTrue(ajouter.waitForExistence(timeout: 10), "le bouton est dans la barre du haut")
        ajouter.tap()
        attendre("Nouvelle", "le bouton de la barre d'outils a créé la ligne")

        // Tirer pour actualiser : la liste descend depuis son haut.
        let debut = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.28))
        debut.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85)))
        attendre("Note actualise", "tirer vers le bas lance l'actualisation")

        // La recherche native apparaît en tirant, ou reste visible.
        let recherche = app.searchFields.firstMatch
        XCTAssertTrue(recherche.waitForExistence(timeout: 10), "le champ de recherche natif")
        recherche.tap()
        recherche.typeText("abc\n")
        attendre("Recherche abc", "la recherche remplit la variable")
        app.buttons["Fermer"].firstMatch.tap()
        attendre("Recherche", "la recherche se referme")

        // Le menu au toucher prolongé.
        texte("Options ici").press(forDuration: 1.2)
        let marquer = app.buttons["Marquer"].firstMatch
        XCTAssertTrue(marquer.waitForExistence(timeout: 10), "le menu au toucher prolongé")
        marquer.tap()
        attendre("Note marque")

        // Glisser une ligne.
        let ligne = app.cells.containing(.staticText, identifier: "Nouvelle").firstMatch
        XCTAssertTrue(ligne.waitForExistence(timeout: 10), "la ligne est une vraie ligne de liste. \(app.debugDescription.prefix(1500))")
        ligne.swipeLeft(velocity: .slow)
        let supprimer = app.buttons["Supprimer"].firstMatch
        if !supprimer.waitForExistence(timeout: 6) {
            let capture = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            capture.name = "glisser"
            capture.lifetime = .keepAlways
            add(capture)
        }
        XCTAssertTrue(supprimer.exists, "l'action apparaît en glissant. \(app.debugDescription.split(separator: "\n").filter { $0.contains("Button") }.prefix(14).joined(separator: " | ").prefix(1200))")
        supprimer.tap()
        attendre("Aucune tache", "l'action en glissant a supprimé la ligne")

        // L'autre onglet : un formulaire façon Réglages.
        onglets.buttons["Compte"].tap()
        attendre("Profil", "le groupe du formulaire")
        XCTAssertTrue(app.buttons["Enregistrer"].firstMatch.waitForExistence(timeout: 10))
    }
}
