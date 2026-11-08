// Le parcours de A à Z d'exemples/magasin-complet.humalis, contre un vrai serveur Humalis.
// Rejoué sur iPhone, iPad et Mac par scripts/essai-apple-parcours.mjs.
import XCTest

@MainActor
final class ParcoursMagasin: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
    }

    /** Un bouton, ou une ligne de la barre latérale (iPad et Mac). */
    private func bouton(_ nom: String) -> XCUIElement {
        if let id = ["Catalogue": "menu_0", "Panier": "menu_1", "Gestion": "menu_2"][nom] {
            let ligne = app.descendants(matching: .any)[id].firstMatch
            if ligne.exists { return ligne }
        }
        return app.buttons[nom].firstMatch
    }

    private func toucher(_ nom: String) {
        #if os(iOS)
        // Le clavier ouvert peut cacher le bouton : on le ferme d'abord.
        if app.keyboards.count > 0, app.buttons["OK"].firstMatch.exists { app.buttons["OK"].firstMatch.tap() }
        #endif
        #if os(macOS)
        // Un clic sur une fenêtre qui n'est pas devant ne fait que l'activer.
        app.activate()
        #endif
        let fin = Date().addingTimeInterval(20)
        while !bouton(nom).exists && Date() < fin { RunLoop.current.run(until: Date().addingTimeInterval(0.5)) }
        let visibles = app.debugDescription.split(separator: "\n").filter { $0.contains("Button") || $0.contains("StaticText") }.compactMap { ligne in ligne.range(of: "label: '").map { r in String(ligne[r.upperBound...].prefix(40)) } }
        XCTAssertTrue(bouton(nom).exists, "le bouton « \(nom) » n'apparaît pas. À l'écran : \(visibles.joined(separator: " | "))")
        bouton(nom).tap()
    }

    private func texte(_ morceau: String) -> XCUIElement {
        app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@", morceau, morceau)).firstMatch
    }

    /** Attend un texte ; s'il ne vient pas, l'erreur dit ce qui a été vu à l'écran entre-temps. */
    private func attendreTexte(_ morceau: String, _ message: String = "") {
        var vu = Set<String>()
        let fin = Date().addingTimeInterval(20)
        while Date() < fin {
            if texte(morceau).exists { return }
            // Une lecture d'un seul bloc : l'écran peut changer entre deux lectures.
            for ligne in app.debugDescription.split(separator: "\n") where ligne.contains("StaticText") || ligne.contains("TextField") {
                if let debut = ligne.range(of: "label: '") ?? ligne.range(of: "value: ") {
                    vu.insert(String(ligne[debut.upperBound...].prefix(70)))
                }
            }
            RunLoop.current.run(until: Date().addingTimeInterval(1))
        }
        let capture = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        capture.name = "echec"
        capture.lifetime = .keepAlways
        add(capture)
        let gestion = bouton("Gestion")
        XCTFail("le texte « \(morceau) » n'apparaît pas. \(message) Vu à l'écran : \(vu.sorted().joined(separator: " | ")). Fenêtre : \(app.windows.firstMatch.frame). Gestion : \(gestion.exists ? "\(gestion.frame), touchable \(gestion.isHittable)" : "absent"). État : \(app.state.rawValue)")
    }

    private func ecrire(_ champ: XCUIElement, _ valeur: String) {
        XCTAssertTrue(champ.waitForExistence(timeout: 20), "le champ n'apparaît pas")
        #if os(macOS)
        app.activate()
        #endif
        champ.tap()
        champ.typeText(valeur)
    }

    /** Lance l'application ; sur Mac, laisse Stage Manager poser la fenêtre avant le premier clic. */
    private func lancer() {
        app.launch()
        #if os(macOS)
        app.activate()
        RunLoop.current.run(until: Date().addingTimeInterval(4))
        #endif
    }

    func testDeAaZ() {
        lancer()

        // Une page réservée renvoie vers la connexion.
        toucher("Gestion")
        attendreTexte("Connexion", "la page réservée doit renvoyer vers la connexion")

        // Un mot de passe faux est refusé avec un message clair.
        ecrire(app.textFields.firstMatch, "admin@essai.test")
        ecrire(app.secureTextFields.firstMatch, "mauvais")
        toucher("Se connecter")
        attendreTexte("Email ou mot de passe incorrect")

        // La connexion ramène à la page voulue.
        ecrire(app.secureTextFields.firstMatch, "Admin-Essai-2026!")
        toucher("Se connecter")
        attendreTexte("Produits", "après la connexion, retour à la gestion")

        // Le formulaire vérifie ses champs, puis envoie.
        toucher("Ajouter le produit")
        attendreTexte("obligatoire")
        ecrire(app.textFields.element(boundBy: 0), "Chaise")
        ecrire(app.textFields.element(boundBy: 1), "49,5")
        toucher("Ajouter le produit")
        attendreTexte("Produit ajouté")
        attendreTexte("Chaise : 49,50", "la liste doit se relire sur le serveur")

        // Le catalogue lit le serveur.
        toucher("Catalogue")
        attendreTexte("Notre catalogue", "le menu doit ramener au catalogue")
        attendreTexte("Chaise")
        toucher("Ajouter")
        attendreTexte("ajouté au panier")

        // Le panier est partagé entre les pages.
        toucher("Panier")
        attendreTexte("Chaise")
        attendreTexte("1 article pour 49,50")

        // Il reste après la fermeture de l'application, et la session aussi (Keychain).
        app.terminate()
        lancer()
        toucher("Panier")
        attendreTexte("1 article pour 49,50", "le panier doit être gardé sur l'appareil")

        // Une commande envoyée par un formulaire.
        ecrire(app.textFields.element(boundBy: 0), "Camille")
        ecrire(app.textFields.element(boundBy: 1), "Lyon")
        toucher("Commander")
        attendreTexte("Merci pour votre commande")
        attendreTexte("Votre panier est vide")

        // L'administrateur, toujours connecté, voit la commande.
        toucher("Gestion")
        attendreTexte("Camille, Lyon", "la commande doit être sur le serveur")

        // La déconnexion referme l'espace réservé.
        toucher("Se déconnecter")
        attendreTexte("Notre catalogue")
        toucher("Gestion")
        attendreTexte("Connexion", "après la déconnexion, l'espace est de nouveau fermé")
    }
}
