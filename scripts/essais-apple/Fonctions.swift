// Les fonctions des exemples, essayées pour de vrai : chaque classe joue un exemple.
// Rejoué par scripts/essai-apple-fonctions.mjs.
import XCTest

@MainActor
class EssaiExemple: XCTestCase {
    let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
        app.launch()
    }

    func bouton(_ nom: String) -> XCUIElement { app.buttons[nom].firstMatch }

    func toucher(_ nom: String) {
        XCTAssertTrue(bouton(nom).waitForExistence(timeout: 20), "le bouton « \(nom) » n'apparaît pas")
        if !bouton(nom).isHittable { app.swipeUp() }
        bouton(nom).tap()
    }

    func texte(_ morceau: String) -> XCUIElement {
        app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@", morceau, morceau)).firstMatch
    }

    func attendre(_ morceau: String) {
        XCTAssertTrue(texte(morceau).waitForExistence(timeout: 15), "le texte « \(morceau) » n'apparaît pas")
    }
}

final class DeuxLangues: EssaiExemple {
    func testLaLangueChange() {
        toucher("Switch to French")
        attendre("Bienvenue chez Rey Store")
        attendre("3 articles dans le panier")
        toucher("Passer en anglais")
        attendre("Welcome to Rey Store")
        attendre("3 items in the cart")
        toucher("Français")
        attendre("Bienvenue chez Rey Store")
        toucher("Voir le catalogue")
        attendre("Le catalogue")
    }
}

final class Medias: EssaiExemple {
    func testSonEtCarte() {
        toucher("Lecture")
        XCTAssertTrue(bouton("Pause").waitForExistence(timeout: 10), "le son doit passer en lecture")
        bouton("Pause").tap()
        XCTAssertTrue(app.maps.firstMatch.waitForExistence(timeout: 20) || app.otherElements["Le restaurant Le Fleuve, avenue de la Gombe"].exists, "la carte n'apparaît pas")
    }
}

final class Interactions: EssaiExemple {
    func testFenetreCopieMinuterie() {
        toucher("Copier le code")
        attendre("Code copié")
        toucher("Aide")
        XCTAssertTrue(bouton("Compris").waitForExistence(timeout: 10), "la fenêtre doit s'ouvrir")
        attendre("Tape / pour chercher")
        bouton("Compris").tap()
        XCTAssertTrue(bouton("Compris").waitForNonExistence(timeout: 10), "la fenêtre doit se fermer")
        attendre("Ouvert depuis")
        toucher("Arrêter le compteur")
        attendre("Compteur arrêté")
    }
}

final class Inscription: EssaiExemple {
    func testVerificationsEtDate() {
        // Pour les lecteurs d'écran, le bouton porte le nom du champ.
        XCTAssertTrue(bouton("Naissance").waitForExistence(timeout: 20))
        bouton("Naissance").tap()
        XCTAssertTrue(bouton("Effacer").waitForExistence(timeout: 10), "la date doit s'afficher")
        bouton("Effacer").firstMatch.tap()
        XCTAssertTrue(bouton("Naissance").waitForExistence(timeout: 10), "la date doit s'effacer")
        app.swipeUp()
        toucher("S'inscrire")
        attendre("est obligatoire")
    }
}

final class Navigation: EssaiExemple {
    func testPagesFiltresAncresSousPages() {
        toucher("Catalogue")
        attendre("Toutes les catégories")
        toucher("Passer aux robes")
        attendre("Catégorie : robes")
        toucher("Retour")
        attendre("Rey Store")
        toucher("Espace")
        toucher("Profil")
        attendre("Votre profil")
        app.navigationBars.buttons.firstMatch.tap()
        attendre("Espace")
        app.navigationBars.buttons.firstMatch.tap()
        // Une adresse dangereuse n'est jamais ouverte.
        toucher("Un lien piégé")
        toucher("Aller")
        attendre("ne peut pas s'ouvrir")
    }
}

final class Vitrine: EssaiExemple {
    func testThemeEtDisposition() {
        attendre("Bienvenue au Fleuve")
        attendre("Le Fleuve, avenue du Port")
        toucher("Mode sombre")
        attendre("Poisson braisé")
    }
}
