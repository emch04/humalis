// Les données sur l'appareil, la synchronisation et le code à six chiffres, contre le vrai serveur produit.
// Joué sur iPhone par scripts/essai-apple-donnees.mjs, qui répond aux demandes « /__essai/… ».
import XCTest

@MainActor
final class ParcoursDonnees: XCTestCase {
    private let app = XCUIApplication()
    private let base = ProcessInfo.processInfo.environment["HUMALIS_ESSAI_RELAIS"] ?? "http://localhost:4978"
    private let courriel = "awa@exemple.fr"
    private let motDePasse = "Essai-Solide-2026!"

    override func setUp() async throws {
        continueAfterFailure = false
    }

    /** Une demande au script qui fait tourner le serveur : il coupe le réseau, lit le disque, interroge le serveur. */
    private func essai(_ chemin: String) -> [String: Any] {
        guard let url = URL(string: base + "/__essai/" + chemin) else { return [:] }
        nonisolated(unsafe) var lu: [String: Any] = [:]
        let fini = DispatchSemaphore(value: 0)
        URLSession.shared.dataTask(with: url) { donnees, _, _ in
            if let donnees, let objet = try? JSONSerialization.jsonObject(with: donnees) as? [String: Any] { lu = objet }
            fini.signal()
        }.resume()
        fini.wait()
        return lu
    }

    private func dire(_ message: String) { print("ESSAI ✓ " + message) }

    private func attendre(_ secondes: Double, _ condition: () -> Bool) -> Bool {
        let fin = Date().addingTimeInterval(secondes)
        while Date() < fin {
            if condition() { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        }
        return condition()
    }

    private func visible(_ morceau: String) -> Bool {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", morceau)).firstMatch.exists
    }

    private func vu() -> String {
        app.debugDescription.split(separator: "\n").filter { $0.contains("StaticText") || $0.contains("Button") || $0.contains("Alert") }.compactMap { ligne in ligne.range(of: "label: '").map { String(ligne[$0.upperBound...].prefix(60)) } }.joined(separator: " | ")
    }

    private func attendreTexte(_ morceau: String, _ delai: Double = 20) {
        if attendre(delai, { visible(morceau) }) { return }
        capture("absent-" + morceau)
        XCTFail("le texte « \(morceau) » n'apparaît pas. À l'écran : \(vu())")
    }

    private func capture(_ nom: String) {
        let piece = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        piece.name = nom
        piece.lifetime = .keepAlways
        add(piece)
    }

    private func toucher(_ nom: String) {
        if app.keyboards.count > 0, app.buttons["OK"].firstMatch.exists { app.buttons["OK"].firstMatch.tap() }
        let bouton = app.buttons[nom].firstMatch
        XCTAssertTrue(bouton.waitForExistence(timeout: 20), "le bouton « \(nom) » n'apparaît pas. À l'écran : \(vu())")
        var essais = 0
        while !bouton.isHittable && essais < 6 {
            app.swipeUp()
            essais += 1
        }
        bouton.tap()
    }

    private func ecrire(_ champ: XCUIElement, _ valeur: String) {
        XCTAssertTrue(champ.waitForExistence(timeout: 20), "le champ n'apparaît pas. À l'écran : \(vu())")
        champ.tap()
        champ.typeText(valeur)
    }

    private func connecter() {
        ecrire(app.otherElements["champ_email"].textFields.firstMatch, courriel)
        ecrire(app.secureTextFields.firstMatch, motDePasse)
        toucher("Entrer")
    }

    private func ajouter(_ titre: String) {
        ecrire(app.otherElements["champ_titre"].textFields.firstMatch, titre)
        toucher("Ajouter")
        if app.keyboards.count > 0, app.buttons["OK"].firstMatch.exists { app.buttons["OK"].firstMatch.tap() }
    }

    private func relancer() {
        app.terminate()
        app.launch()
    }

    private func nombre(_ o: [String: Any], _ cle: String) -> Int { (o[cle] as? NSNumber)?.intValue ?? -1 }

    func testDeAaZ() {
        app.launch()

        // La connexion, puis une note.
        attendreTexte("Carnet")
        connecter()
        attendreTexte("Connecté")
        dire("connexion par mot de passe")
        ajouter("Note de iPhone")
        attendreTexte("Note de iPhone")
        XCTAssertTrue(attendre(15) { essai("serveur?titre=Note%20de%20iPhone")["present"] as? Bool == true }, "la note n'arrive pas sur le serveur")
        dire("la note ajoutée arrive sur le serveur (PostgreSQL)")

        // Le disque : une vraie base, et rien de lisible dedans.
        let disque = essai("disque?texte=Note%20de%20iPhone")
        print("ESSAI disque : \(disque)")
        XCTAssertGreaterThanOrEqual(nombre(disque, "fiches"), 1, "aucune fiche dans SQLite : \(disque)")
        XCTAssertEqual(disque["clair"] as? Bool, false, "le titre se lit en clair sur le disque : \(disque)")
        XCTAssertEqual(nombre(disque, "file"), 0, "la file devrait être vide : \(disque)")
        XCTAssertEqual(disque["contenuChiffre"] as? Bool, true, "le contenu de la base devrait être chiffré : \(disque)")
        dire("base SQLite sur le disque, contenu chiffré, file vide")

        // Relancée sans réseau : la note revient de la base.
        _ = essai("couper")
        relancer()
        attendreTexte("Note de iPhone")
        dire("présente après relance, sans réseau")

        // Écrite hors ligne : elle attend dans la file.
        ajouter("Écrite hors ligne")
        attendreTexte("Écrite hors ligne")
        RunLoop.current.run(until: Date().addingTimeInterval(2))
        XCTAssertEqual(essai("serveur?titre=%C3%89crite%20hors%20ligne")["present"] as? Bool, false, "hors ligne, rien ne doit partir")
        let enAttente = essai("disque?texte=%C3%89crite%20hors%20ligne")
        print("ESSAI hors ligne : \(enAttente)")
        XCTAssertEqual(nombre(enAttente, "file"), 1, "la note devrait attendre dans la file : \(enAttente)")
        XCTAssertEqual(enAttente["clair"] as? Bool, false, "la file se lit en clair : \(enAttente)")
        dire("hors ligne : dans la file, chiffrée, rien sur le serveur")

        // Le réseau revient : elle part toute seule.
        _ = essai("retablir")
        XCTAssertTrue(attendre(45) { essai("serveur?titre=%C3%89crite%20hors%20ligne")["present"] as? Bool == true }, "la note n'est pas partie au retour du réseau")
        XCTAssertTrue(attendre(10) { nombre(essai("disque?texte=rien"), "file") == 0 }, "la file devrait s'être vidée")
        dire("au retour du réseau, la note part et la file se vide")
        attendreTexte("Connecté", 30)
        dire("la session se relit au retour du réseau")

        // Coupé, écrit, éteint, rallumé avec le réseau : la file survit à la relance.
        _ = essai("couper")
        ajouter("Avant extinction")
        attendreTexte("Avant extinction")
        RunLoop.current.run(until: Date().addingTimeInterval(1))
        app.terminate()
        _ = essai("retablir")
        app.launch()
        XCTAssertTrue(attendre(30) { essai("serveur?titre=Avant%20extinction")["present"] as? Bool == true }, "la file n'a pas survécu à la relance")
        dire("la file survit à une relance")

        // Une note écrite ailleurs arrive au retour au premier plan.
        _ = essai("ajouter?titre=Venue%20d%27ailleurs")
        XCUIDevice.shared.press(.home)
        RunLoop.current.run(until: Date().addingTimeInterval(2))
        app.activate()
        attendreTexte("Venue d'ailleurs", 30)
        dire("une note écrite ailleurs arrive au retour au premier plan")

        // Le code à six chiffres.
        attendreTexte("Connecté")
        toucher("Code à six chiffres")
        ecrire(app.secureTextFields["champ_mot_de_passe_compte"].firstMatch, motDePasse)
        toucher("Continuer")
        attendreTexte("Clé à saisir à la main")
        XCTAssertTrue(app.descendants(matching: .any)["qr_double_authentification"].firstMatch.exists, "le code QR n'est pas dessiné. À l'écran : \(vu())")
        capture("qr")
        let ligne = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Clé à saisir'")).firstMatch.label
        let secret = ligne.components(separatedBy: " : ").last!.trimmingCharacters(in: .whitespaces)
        dire("le QR et la clé sont montrés")
        let code = essai("totp?secret=\(secret)&decalage=0")["code"] as! String
        ecrire(app.textFields["champ_code"].firstMatch, code)
        toucher("Activer")
        attendreTexte("Gardez ces codes")
        capture("codes")
        toucher("J’ai gardé ces codes")
        dire("double authentification activée, codes de secours montrés")

        toucher("Sortir")
        XCTAssertTrue(attendre(15) { !visible("Connecté") }, "la déconnexion n'a pas eu lieu")
        XCTAssertTrue(attendre(15) { !visible("Note de iPhone") }, "les notes du compte restent à l'écran après la déconnexion")
        dire("déconnecté : les notes du compte disparaissent")

        connecter()
        attendreTexte("Saisissez le code affiché")
        XCTAssertFalse(visible("Connecté"), "après le mot de passe, pas encore de session")
        capture("ecran-code")
        ecrire(app.textFields["champ_code"].firstMatch, "000000")
        toucher("Vérifier")
        attendreTexte("Ce code est incorrect")
        dire("un code faux est refusé")
        let bon = essai("totp?secret=\(secret)&decalage=1")["code"] as! String
        ecrire(app.textFields["champ_code"].firstMatch, bon)
        toucher("Vérifier")
        attendreTexte("Connecté")
        attendreTexte("Note de iPhone")
        dire("le bon code ouvre la session, et les notes du compte reviennent")

        // Les clés d'accès : les options viennent du serveur, puis le système décide.
        toucher("Ajouter une clé")
        ecrire(app.secureTextFields["champ_mot_de_passe_compte"].firstMatch, motDePasse)
        toucher("Continuer")
        RunLoop.current.run(until: Date().addingTimeInterval(6))
        capture("cle-acces")
        print("ESSAI clé d'accès, à l'écran : \(vu())")
    }
}
