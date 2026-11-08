/**
 * Ce que l'application demande au système, en Swift : les messages, les
 * questions, les minuteries, ce qui reste sur l'appareil (préférences et
 * Keychain), le thème, les langues, le presse-papier et le partage.
 */

export const MESSAGES_SWIFT = String.raw`// Produit par Humalis : les messages (« afficher ») et les questions (« confirmer »).
import SwiftUI

enum GenreMessage { case info, reussite, avertissement, erreur }

struct ActionMessage {
    let libelle: String
    let faire: @MainActor () async -> Void
    init(libelle: String, faire: @escaping @MainActor () async -> Void) {
        self.libelle = libelle
        self.faire = faire
    }
}

struct MessageHumalis: Identifiable {
    let id: Int
    let texte: String
    let genre: GenreMessage
    let action: ActionMessage?
}

/** Une pile en haut de l'écran : au plus trois messages, pour ne pas noyer un lecteur d'écran. */
@MainActor @Observable final class Messages {
    static let commun = Messages()
    private(set) var liste: [MessageHumalis] = []
    private var suivant = 0

    func afficher(_ texte: String, _ genre: GenreMessage = .info, duree: Double? = nil, persistant: Bool = false, action: ActionMessage? = nil) {
        suivant += 1
        let id = suivant
        liste = Array((liste + [MessageHumalis(id: id, texte: texte, genre: genre, action: action)]).suffix(3))
        AccessibilityNotification.Announcement(texte).post()
        if persistant { return }
        let attente = duree ?? (action != nil ? 6000 : (genre == .erreur || genre == .avertissement ? 8000 : 4000))
        Task {
            try? await Task.sleep(for: .milliseconds(Int(attente)))
            self.fermer(id)
        }
    }

    func fermer(_ id: Int) { liste.removeAll { $0.id == id } }
}

struct PileMessagesHumalis: View {
    private func couleur(_ genre: GenreMessage) -> Color {
        switch genre {
        case .info: return Couleurs.bleu
        case .reussite: return Couleurs.vert
        case .avertissement: return Couleurs.orange
        case .erreur: return Couleurs.rouge
        }
    }

    var body: some View {
        VStack(spacing: 8) {
            ForEach(Messages.commun.liste) { message in
                HStack(spacing: 8) {
                    Text(verbatim: message.texte).frame(maxWidth: .infinity, alignment: .leading)
                    if let action = message.action {
                        Button(action.libelle) {
                            Messages.commun.fermer(message.id)
                            Task { await action.faire() }
                        }
                        .buttonStyle(.bordered)
                    }
                    Button { Messages.commun.fermer(message.id) } label: { Image(systemName: "xmark") }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Fermer")
                }
                .foregroundStyle(.white)
                .padding(12)
                .background(couleur(message.genre), in: RoundedRectangle(cornerRadius: 10))
                .shadow(color: .black.opacity(0.2), radius: 8, y: 3)
                .transition(.move(edge: .top).combined(with: .opacity))
                .accessibilityIdentifier("message")
            }
        }
        .frame(maxWidth: 560)
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .animation(.default, value: Messages.commun.liste.map(\.id))
    }
}

/** Une question, Oui ou Non : l'événement attend la réponse. */
@MainActor @Observable final class Confirmation {
    static let commun = Confirmation()
    struct Demande {
        let question: String
        let oui: String
        let non: String
        let reponse: CheckedContinuation<Bool, Never>
    }
    var demande: Demande?

    func repondre(_ oui: Bool) {
        demande?.reponse.resume(returning: oui)
        demande = nil
    }
}

@MainActor func confirmer(_ question: String, oui: String = "Oui", non: String = "Non") async -> Bool {
    await withCheckedContinuation { reponse in
        Confirmation.commun.demande = .init(question: question, oui: oui, non: non, reponse: reponse)
    }
}

struct QuestionHumalis: ViewModifier {
    func body(content: Content) -> some View {
        let confirmation = Confirmation.commun
        content.alert(
            confirmation.demande?.question ?? "",
            isPresented: Binding(get: { confirmation.demande != nil }, set: { ouverte in if !ouverte, confirmation.demande != nil { confirmation.repondre(false) } })
        ) {
            Button(confirmation.demande?.oui ?? "Oui") { confirmation.repondre(true) }
            Button(confirmation.demande?.non ?? "Non", role: .cancel) { confirmation.repondre(false) }
        }
    }
}
`;

export const MINUTERIES_SWIFT = String.raw`// Produit par Humalis : « apres 3 secondes », « toutes les 5 secondes ».
import SwiftUI

/** Attend, puis agit, une fois ou en boucle ; une tâche annulée (la page est quittée) s'arrête. */
@MainActor func minuterie(_ millisecondes: Double, repete: Bool, faire: @MainActor (@MainActor () -> Void) async -> Void) async {
    var arretee = false
    repeat {
        try? await Task.sleep(for: .milliseconds(Int(millisecondes)))
        if Task.isCancelled { return }
        await faire { arretee = true }
    } while repete && !arretee && !Task.isCancelled
}

/** Les minuteries lancées par un événement : annulées quand la page est quittée. */
@MainActor final class Planificateur {
    private var taches: [Task<Void, Never>] = []

    func apres(_ millisecondes: Double, tantQue: (@MainActor () -> Bool)? = nil, faire: @escaping @MainActor (@MainActor () -> Void) async -> Void) {
        lancer(millisecondes, repete: false, tantQue: tantQue, faire: faire)
    }

    func toutes(_ millisecondes: Double, tantQue: (@MainActor () -> Bool)? = nil, faire: @escaping @MainActor (@MainActor () -> Void) async -> Void) {
        lancer(millisecondes, repete: true, tantQue: tantQue, faire: faire)
    }

    private func lancer(_ millisecondes: Double, repete: Bool, tantQue: (@MainActor () -> Bool)?, faire: @escaping @MainActor (@MainActor () -> Void) async -> Void) {
        taches.append(Task { @MainActor in
            await minuterie(millisecondes, repete: repete) { arreter in
                if let tantQue, !tantQue() { arreter(); return }
                await faire(arreter)
            }
        })
    }

    func annuler() {
        taches.forEach { $0.cancel() }
        taches = []
    }
}

/** « la dernière requête gagne » : une réponse arrivée après une requête plus récente ne remplace rien. */
@MainActor final class JetonsRequetes {
    private var derniers: [String: Int] = [:]

    func nouveau(_ variable: String) -> Int {
        let jeton = (derniers[variable] ?? 0) + 1
        derniers[variable] = jeton
        return jeton
    }

    func estDernier(_ variable: String, _ jeton: Int) -> Bool { derniers[variable] == jeton }
}
`;

export const MEMOIRE_SWIFT = String.raw`// Produit par Humalis : ce qui reste sur l'appareil (« memorisee », « memorisee en secret »).
import Foundation
import Security
import SwiftUI

/** Les préférences de l'application, et le Keychain pour les secrets. */
enum Memoire {
    static func lire<T: Decodable>(_ cle: String, secret: Bool = false) -> T? {
        let donnees = secret ? Coffre.lire(cle) : UserDefaults.standard.data(forKey: cle)
        guard let donnees else { return nil }
        return try? JSONDecoder().decode(T.self, from: donnees)
    }

    static func ecrire<T: Encodable>(_ cle: String, _ valeur: T, secret: Bool = false) {
        guard let donnees = try? JSONEncoder().encode(valeur) else { return }
        if secret { Coffre.ecrire(cle, donnees) } else { UserDefaults.standard.set(donnees, forKey: cle) }
    }
}

/** Le Keychain : le coffre du système, chiffré et propre à l'application. */
enum Coffre {
    private static func requete(_ cle: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Bundle.main.bundleIdentifier ?? "humalis", kSecAttrAccount as String: cle]
    }

    static func lire(_ cle: String) -> Data? {
        var q = requete(cle)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var resultat: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &resultat) == errSecSuccess else { return nil }
        return resultat as? Data
    }

    static func ecrire(_ cle: String, _ donnees: Data) {
        let q = requete(cle)
        if SecItemUpdate(q as CFDictionary, [kSecValueData as String: donnees] as CFDictionary) == errSecItemNotFound {
            var ajout = q
            ajout[kSecValueData as String] = donnees
            ajout[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(ajout as CFDictionary, nil)
        }
    }

    static func effacer(_ cle: String) { SecItemDelete(requete(cle) as CFDictionary) }
}

/** Une variable gardée : sa valeur revient au prochain lancement. */
@MainActor @propertyWrapper struct Memorisee<Valeur: Codable>: DynamicProperty {
    @State private var valeur: Valeur
    private let cle: String
    private let secret: Bool

    init(wrappedValue: Valeur, _ cle: String, secret: Bool = false) {
        self.cle = cle
        self.secret = secret
        _valeur = State(initialValue: Memoire.lire(cle, secret: secret) ?? wrappedValue)
    }

    var wrappedValue: Valeur {
        get { valeur }
        nonmutating set {
            valeur = newValue
            Memoire.ecrire(cle, newValue, secret: secret)
        }
    }

    var projectedValue: Binding<Valeur> {
        Binding(get: { wrappedValue }, set: { wrappedValue = $0 })
    }
}
`;

export const SYSTEME_SWIFT = String.raw`// Produit par Humalis : le thème choisi, le presse-papier, le partage, les liens externes.
import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

/** Le thème choisi par la personne, gardé par son appareil. */
@MainActor @Observable final class Apparence {
    static let commun = Apparence()
    enum Mode: String { case automatique, clair, sombre, bascule }
    private(set) var mode: Mode

    private init() { mode = Mode(rawValue: UserDefaults.standard.string(forKey: "humalis:theme") ?? "") ?? Configuration.themeDeDepart }

    func definir(_ nouveau: Mode) {
        if nouveau == .bascule { mode = mode == .sombre ? .clair : .sombre }
        else { mode = nouveau }
        UserDefaults.standard.set(mode.rawValue, forKey: "humalis:theme")
    }

    var schema: ColorScheme? { mode == .clair ? .light : mode == .sombre ? .dark : nil }
}

@MainActor func copier(_ texte: String, message: String?) {
    #if os(macOS)
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(texte, forType: .string)
    #else
    UIPasteboard.general.string = texte
    #endif
    if let message { Messages.commun.afficher(message, .reussite) }
}

@MainActor func ouvrirExterne(_ adresse: String) {
    guard let url = URL(string: adresse), ["http", "https", "mailto", "tel"].contains(url.scheme?.lowercased() ?? "") else {
        Messages.commun.afficher("Ce lien ne peut pas s'ouvrir.", .erreur)
        return
    }
    #if os(macOS)
    NSWorkspace.shared.open(url)
    #else
    UIApplication.shared.open(url)
    #endif
}

/** La feuille de partage du système. */
@MainActor func partager(texte: String, titre: String?, adresse: String?) {
    var elements: [Any] = [texte]
    if let adresse, let url = URL(string: adresse) { elements.append(url) }
    #if os(macOS)
    guard let vue = NSApp.keyWindow?.contentView else { return }
    NSSharingServicePicker(items: elements).show(relativeTo: .zero, of: vue, preferredEdge: .minY)
    #else
    let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    guard let racine = scene?.keyWindow?.rootViewController else { return }
    let feuille = UIActivityViewController(activityItems: elements, applicationActivities: nil)
    feuille.popoverPresentationController?.sourceView = racine.view
    feuille.popoverPresentationController?.sourceRect = CGRect(x: racine.view.bounds.midX, y: racine.view.bounds.midY, width: 0, height: 0)
    feuille.popoverPresentationController?.permittedArrowDirections = []
    var haut = racine
    while let suivante = haut.presentedViewController { haut = suivante }
    haut.present(feuille, animated: true)
    #endif
}

/** « telecharger commandes en csv » : le fichier se fait sur l'appareil, puis se partage. */
@MainActor func telechargerCsv<T: Encodable>(_ liste: [T], fichier: String) async {
    let lignes = liste.map { ValeurHumalis($0) }
    guard case .fiche(let premiere)? = lignes.first else {
        Messages.commun.afficher("Il n'y a rien à télécharger.", .info)
        return
    }
    let colonnes = premiere.keys.sorted()
    func cellule(_ v: ValeurHumalis) -> String { "\"\(v.enTexte.replacingOccurrences(of: "\"", with: "\"\""))\"" }
    let corps = lignes.map { ligne in colonnes.map { cellule(ligne[$0]) }.joined(separator: ";") }
    let texte = ([colonnes.joined(separator: ";")] + corps).joined(separator: "\r\n")
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(fichier)
    do {
        try texte.write(to: url, atomically: true, encoding: .utf8)
        partagerFichier(url)
    } catch {
        Messages.commun.afficher("Le fichier n'a pas pu être écrit.", .erreur)
    }
}

/** Montre un fichier : la feuille de partage sur iPhone et iPad, le Finder sur Mac. */
@MainActor func partagerFichier(_ url: URL) {
    #if os(macOS)
    NSWorkspace.shared.activateFileViewerSelecting([url])
    #else
    let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    guard var haut = scene?.keyWindow?.rootViewController else { return }
    while let suivante = haut.presentedViewController { haut = suivante }
    let feuille = UIActivityViewController(activityItems: [url], applicationActivities: nil)
    feuille.popoverPresentationController?.sourceView = haut.view
    feuille.popoverPresentationController?.sourceRect = CGRect(x: haut.view.bounds.midX, y: haut.view.bounds.midY, width: 0, height: 0)
    feuille.popoverPresentationController?.permittedArrowDirections = []
    haut.present(feuille, animated: true)
    #endif
}
`;

export const LANGUES_SWIFT = String.raw`// Produit par Humalis : la langue choisie par la personne, gardée par son appareil.
import SwiftUI

@MainActor @Observable final class Langues {
    static let commun = Langues()
    private(set) var code: String

    private init() {
        let gardee = UserDefaults.standard.string(forKey: "humalis:langue")
        let appareil = Locale.preferredLanguages.first.map { String($0.prefix(2)) }
        code = [gardee, appareil].compactMap { $0 }.first { Configuration.langues.map(\.code).contains($0) } ?? Configuration.langues[0].code
    }

    func changer(_ nouvelle: String) {
        code = nouvelle
        UserDefaults.standard.set(nouvelle, forKey: "humalis:langue")
    }
}

/** Le texte dans la langue choisie, sinon dans la langue de base du site. */
@MainActor func t(_ versions: [String: String]) -> String {
    versions[Langues.commun.code] ?? versions[Configuration.langues[0].code] ?? versions.values.first ?? ""
}

struct SelecteurLangueHumalis: View {
    var body: some View {
        Picker("Langue", selection: Binding(get: { Langues.commun.code }, set: { Langues.commun.changer($0) })) {
            ForEach(Configuration.langues, id: \.code) { langue in Text(verbatim: langue.nom).tag(langue.code) }
        }
        .pickerStyle(.segmented)
        .fixedSize()
    }
}
`;

/** Le serveur, les sources et la connexion. */
export const SERVEUR_SWIFT = String.raw`// Produit par Humalis : les requêtes vers le serveur et les API, et la session.
import SwiftUI

enum ErreurHumalis: LocalizedError {
    case refus(String)
    var errorDescription: String? {
        if case .refus(let raison) = self { return raison }
        return nil
    }
}

let pasDeReponse = "Le serveur n'a pas répondu."

/** La raison d'un échec : une phrase écrite pour la personne, jamais le texte anglais du système. */
func raisonDe(_ erreur: Error) -> String {
    if case ErreurHumalis.refus(let raison) = erreur { return raison }
    return pasDeReponse
}

/** L'état de la requête d'une variable : « produits est en chargement », « erreur de produits ». */
struct EtatRequete {
    enum Statut { case repos, chargement, erreur, introuvable }
    var statut: Statut = .repos
    var message: String = ""
}

/** Une API existante (« source "…" : »). Un jeton secret n'est jamais dans l'application. */
struct SourceHumalis: Sendable {
    enum Place: Sendable { case autorisation, entete(String), parametre(String) }
    let nom: String
    let adresse: String
    var entetes: [(String, String)] = []
    var jeton: (valeur: String, place: Place)? = nil
    var enveloppe: String? = nil
    var erreurDans: String? = nil
    var essais: Int = 0
    var delai: Double? = nil
}

@MainActor final class Serveur {
    static let commun = Serveur()

    private let session: URLSession = {
        let reglages = URLSessionConfiguration.default
        reglages.httpCookieStorage = nil
        reglages.httpShouldSetCookies = false
        return URLSession(configuration: reglages)
    }()

    /** L'adresse du serveur : celle de la compilation, ou HUMALIS_SERVEUR pour essayer. */
    static var base: String {
        (ProcessInfo.processInfo.environment["HUMALIS_SERVEUR"] ?? Configuration.serveur).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    private func url(_ adresse: String, id: String?, source: SourceHumalis?, filtres: [(String, String)]) throws -> URL {
        let base = source?.adresse ?? Serveur.base
        var texte = base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + (adresse.hasPrefix("/") ? adresse : "/" + adresse)
        if let id { texte += "/" + (id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? id) }
        guard var composantes = URLComponents(string: texte) else { throw ErreurHumalis.refus(pasDeReponse) }
        var parametres = composantes.queryItems ?? []
        for (cle, valeur) in filtres { parametres.append(URLQueryItem(name: cle, value: valeur)) }
        if case .parametre(let nom)? = source?.jeton?.place, let jeton = source?.jeton?.valeur { parametres.append(URLQueryItem(name: nom, value: jeton)) }
        if !parametres.isEmpty { composantes.queryItems = parametres }
        guard let url = composantes.url else { throw ErreurHumalis.refus(pasDeReponse) }
        return url
    }

    /** Un appel brut, avec le jeton de session ; sur un 401, la session se renouvelle et l'appel repart une fois. */
    private func envoyerRequete(_ requete: URLRequest, source: SourceHumalis?) async throws -> (Data, HTTPURLResponse) {
        var essai = requete
        if source == nil, let jeton = Session.commun.jeton { essai.setValue("Bearer \(jeton)", forHTTPHeaderField: "Authorization") }
        var (donnees, reponse) = try await lancer(essai, source: source)
        if reponse.statusCode == 401, source == nil, await Session.commun.renouveler(), let jeton = Session.commun.jeton {
            essai.setValue("Bearer \(jeton)", forHTTPHeaderField: "Authorization")
            (donnees, reponse) = try await lancer(essai, source: source)
        }
        return (donnees, reponse)
    }

    private func lancer(_ requete: URLRequest, source: SourceHumalis?) async throws -> (Data, HTTPURLResponse) {
        var restants = requete.httpMethod == "GET" ? (source?.essais ?? 0) : 0
        while true {
            do {
                let (donnees, reponse) = try await session.data(for: requete)
                guard let http = reponse as? HTTPURLResponse else { throw ErreurHumalis.refus(pasDeReponse) }
                if http.statusCode >= 500 && restants > 0 { restants -= 1; continue }
                return (donnees, http)
            } catch let erreur as ErreurHumalis {
                throw erreur
            } catch {
                if restants > 0 { restants -= 1; continue }
                throw ErreurHumalis.refus(pasDeReponse)
            }
        }
    }

    private func requete(_ adresse: String, methode: String, id: String?, envoi: [String: ValeurHumalis]?, source: SourceHumalis?, filtres: [(String, String)]) throws -> URLRequest {
        var r = URLRequest(url: try url(adresse, id: id, source: source, filtres: filtres))
        r.httpMethod = methode
        if let delai = source?.delai { r.timeoutInterval = delai / 1000 }
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if source == nil { r.setValue("1", forHTTPHeaderField: "x-humalis-mobile") }
        for (nom, valeur) in source?.entetes ?? [] { r.setValue(valeur, forHTTPHeaderField: nom) }
        switch source?.jeton?.place {
        case .autorisation?: r.setValue("Bearer \(source!.jeton!.valeur)", forHTTPHeaderField: "Authorization")
        case .entete(let nom)?: r.setValue(source!.jeton!.valeur, forHTTPHeaderField: nom)
        default: break
        }
        if let envoi {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try? JSONEncoder().encode(envoi)
        }
        return r
    }

    private func refus(_ donnees: Data, source: SourceHumalis?) -> ErreurHumalis {
        let corps = try? JSONDecoder().decode(ValeurHumalis.self, from: donnees)
        let chemin = source?.erreurDans ?? "erreur"
        var valeur = corps ?? .rien
        for morceau in chemin.split(separator: ".") { valeur = valeur[String(morceau)] }
        var texte = valeur.enTexte
        if texte.isEmpty { return .refus(pasDeReponse) }
        texte = texte.prefix(1).uppercased() + texte.dropFirst()
        return .refus(texte.hasSuffix(".") ? texte : texte + ".")
    }

    /** Un appel qui lève son erreur ; nil pour une réponse vide ou un élément qui n'existe plus. */
    func appel<T: Decodable>(_ adresse: String, comme type: T.Type, methode: String? = nil, envoi: [String: ValeurHumalis]? = nil, id: String? = nil, source: SourceHumalis? = nil, filtres: [(String, String)] = [], dans: String? = nil, suivi: (@MainActor (EtatRequete) -> Void)? = nil) async throws -> T? {
        suivi?(EtatRequete(statut: .chargement))
        do {
            let verbe = methode ?? (envoi != nil ? "POST" : "GET")
            let r = try requete(adresse, methode: verbe, id: id, envoi: envoi, source: source, filtres: filtres)
            let (donnees, reponse) = try await envoyerRequete(r, source: source)
            if reponse.statusCode == 404 && verbe == "GET" {
                suivi?(EtatRequete(statut: .introuvable))
                return nil
            }
            if reponse.statusCode == 401 && source == nil { throw ErreurHumalis.refus("Connectez-vous pour continuer.") }
            guard (200..<300).contains(reponse.statusCode) else { throw refus(donnees, source: source) }
            suivi?(EtatRequete(statut: .repos))
            if donnees.isEmpty { return nil }
            var valeur = try JSONDecoder().decode(ValeurHumalis.self, from: donnees)
            if let enveloppe = source?.enveloppe { valeur = valeur[enveloppe] }
            for morceau in (dans ?? "").split(separator: ".") { valeur = valeur[String(morceau)] }
            // On attendait une liste et on reçoit autre chose : la valeur actuelle est gardée.
            guard let lue = Serveur.decoder(valeur, T.self) else { return nil }
            return lue
        } catch {
            suivi?(EtatRequete(statut: .erreur, message: raisonDe(error)))
            throw error
        }
    }

    private static func decoder<T: Decodable>(_ valeur: ValeurHumalis, _ type: T.Type) -> T? {
        guard let donnees = try? JSONEncoder().encode(valeur) else { return nil }
        return try? JSONDecoder().decode(T.self, from: donnees)
    }

    /** Une lecture ou un envoi : en cas d'échec, un message s'affiche et la valeur actuelle est gardée. */
    func lire<T: Decodable>(_ adresse: String, comme type: T.Type, envoi: [String: ValeurHumalis]? = nil, id: String? = nil, source: SourceHumalis? = nil, filtres: [(String, String)] = [], dans: String? = nil, suivi: (@MainActor (EtatRequete) -> Void)? = nil) async -> T? {
        do {
            return try await appel(adresse, comme: type, envoi: envoi, id: id, source: source, filtres: filtres, dans: dans, suivi: suivi)
        } catch {
            // La page parle de l'état de la variable : elle montre l'erreur elle-même.
            if suivi == nil { dire(error) }
            return nil
        }
    }

    func appelSansReponse(_ adresse: String, methode: String? = nil, envoi: [String: ValeurHumalis]? = nil, id: String? = nil, source: SourceHumalis? = nil, filtres: [(String, String)] = [], dans: String? = nil) async throws {
        _ = try await appel(adresse, comme: ValeurHumalis.self, methode: methode, envoi: envoi, id: id, source: source, filtres: filtres, dans: dans)
    }

    /** Vrai si l'appel a réussi ; sinon un message s'affiche. */
    func appelReussi(_ adresse: String, methode: String? = nil, envoi: [String: ValeurHumalis]? = nil, id: String? = nil, source: SourceHumalis? = nil, filtres: [(String, String)] = [], dans: String? = nil) async -> Bool {
        do {
            try await appelSansReponse(adresse, methode: methode, envoi: envoi, id: id, source: source, filtres: filtres, dans: dans)
            return true
        } catch {
            dire(error)
            return false
        }
    }

    private func dire(_ erreur: Error) {
        let raison = raisonDe(erreur)
        Messages.commun.afficher(raison == pasDeReponse ? "Le serveur n'a pas répondu. Réessayez dans un instant." : raison, .erreur)
    }

    /** « telecharger bon de … » : le PDF arrive avec la session, puis se montre. */
    func telechargerBonOuEchouer(_ adresse: String, id: String) async throws {
        let r = try requete(adresse + "/" + id + "/bon", methode: "GET", id: nil, envoi: nil, source: nil, filtres: [])
        let (donnees, reponse) = try await envoyerRequete(r, source: nil)
        guard (200..<300).contains(reponse.statusCode) else { throw refus(donnees, source: nil) }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("bon-\(id).pdf")
        do { try donnees.write(to: url) } catch { throw ErreurHumalis.refus("Le fichier n'a pas pu être écrit.") }
        partagerFichier(url)
    }

    func telechargerBon(_ adresse: String, id: String) async {
        do { try await telechargerBonOuEchouer(adresse, id: id) } catch { dire(error) }
    }

    /** « envoyer fichier … » : le fichier seul, ou un formulaire ; la progression va de 0 à 100. */
    func televerserOuEchouer<T: Decodable>(_ fichier: FichierChoisi?, vers adresse: String, comme type: T.Type, source: SourceHumalis?, corpsBrut: Bool = false, champ: String = "fichier", progression: (@MainActor (Double) -> Void)? = nil) async throws -> T? {
        guard let fichier else { throw ErreurHumalis.refus("Choisissez d'abord un fichier.") }
        var r = try requete(adresse, methode: "POST", id: nil, envoi: nil, source: source, filtres: [])
        guard let contenu = try? Data(contentsOf: fichier.url) else { throw ErreurHumalis.refus("Le fichier n'a pas pu être lu.") }
        let corps: Data
        if corpsBrut {
            r.setValue(fichier.mime, forHTTPHeaderField: "Content-Type")
            corps = contenu
        } else {
            let limite = "humalis-\(UUID().uuidString)"
            r.setValue("multipart/form-data; boundary=\(limite)", forHTTPHeaderField: "Content-Type")
            var morceau = Data()
            morceau.append(Data("--\(limite)\r\nContent-Disposition: form-data; name=\"\(champ)\"; filename=\"\(fichier.nom)\"\r\nContent-Type: \(fichier.mime)\r\n\r\n".utf8))
            morceau.append(contenu)
            morceau.append(Data("\r\n--\(limite)--\r\n".utf8))
            corps = morceau
        }
        progression?(0)
        let suivi = SuiviEnvoi { valeur in Task { @MainActor in progression?(valeur) } }
        let reponse: URLResponse
        let donnees: Data
        do { (donnees, reponse) = try await session.upload(for: r, from: corps, delegate: suivi) }
        catch { throw ErreurHumalis.refus(pasDeReponse) }
        guard let http = reponse as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw refus(donnees, source: source) }
        progression?(100)
        return try? JSONDecoder().decode(T.self, from: donnees)
    }

    func televerser<T: Decodable>(_ fichier: FichierChoisi?, vers adresse: String, comme type: T.Type, source: SourceHumalis?, corpsBrut: Bool = false, champ: String = "fichier", progression: (@MainActor (Double) -> Void)? = nil) async -> T? {
        do { return try await televerserOuEchouer(fichier, vers: adresse, comme: type, source: source, corpsBrut: corpsBrut, champ: champ, progression: progression) }
        catch { dire(error); return nil }
    }
}

/** La progression d'un envoi. */
private final class SuiviEnvoi: NSObject, URLSessionTaskDelegate, Sendable {
    let rappel: @Sendable (Double) -> Void
    init(rappel: @escaping @Sendable (Double) -> Void) { self.rappel = rappel }
    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend > 0 else { return }
        rappel(Double(totalBytesSent) / Double(totalBytesExpectedToSend) * 100)
    }
}

/** Qui est connecté : toujours lu sur /auth/me du serveur, jamais deviné par l'application. */
@MainActor @Observable final class Session {
    static let commun = Session()

    private struct Personne: Decodable {
        let id: ValeurHumalis?
        let email: String?
        let role: String?
    }

    private static let cleJeton = "humalis.jeton"
    private static let cleRenouvellement = "humalis.renouvellement"

    private var personne: Personne?
    /** Vrai dès que /auth/me a répondu : avant, la page ne sait pas encore qui est là. */
    private(set) var pret = false
    private var demande: Task<Void, Never>?
    private var renouvellement: Task<Bool, Never>?

    var connecte: Bool { demander(); return personne != nil }
    var admin: Bool { demander(); return personne?.role == "admin" }

    var jeton: String? { Coffre.lire(Session.cleJeton).flatMap { String(data: $0, encoding: .utf8) } }
    private var jetonRenouvellement: String? { Coffre.lire(Session.cleRenouvellement).flatMap { String(data: $0, encoding: .utf8) } }

    private func garder(_ corps: ValeurHumalis) {
        if case .texte(let v) = corps["token"] { Coffre.ecrire(Session.cleJeton, Data(v.utf8)) }
        if case .texte(let v) = corps["refreshToken"] { Coffre.ecrire(Session.cleRenouvellement, Data(v.utf8)) }
    }

    private func oublier() {
        Coffre.effacer(Session.cleJeton)
        Coffre.effacer(Session.cleRenouvellement)
    }

    private func requete(_ chemin: String, methode: String, corps: [String: String]? = nil) -> URLRequest? {
        guard let url = URL(string: Serveur.base + chemin) else { return nil }
        var r = URLRequest(url: url)
        r.httpMethod = methode
        r.setValue("1", forHTTPHeaderField: "x-humalis-mobile")
        if let jeton { r.setValue("Bearer \(jeton)", forHTTPHeaderField: "Authorization") }
        if let corps {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try? JSONEncoder().encode(corps)
        }
        return r
    }

    /** Demande /auth/me une seule fois, à la première lecture de la session. */
    private func demander() {
        guard demande == nil else { return }
        demande = Task { await relire() }
    }

    /** Attend de savoir qui est connecté. */
    func attendre() async {
        demander()
        await demande?.value
    }

    private func relire() async {
        defer { pret = true }
        guard let r = requete("/auth/me", methode: "GET"), let (donnees, reponse) = try? await URLSession.shared.data(for: r), let http = reponse as? HTTPURLResponse else {
            personne = nil
            return
        }
        if http.statusCode == 401, await renouveler() {
            await relire()
            return
        }
        struct Reponse: Decodable { let data: Personne? }
        let lue = (try? JSONDecoder().decode(Reponse.self, from: donnees))?.data
        personne = lue?.id != nil ? lue : nil
    }

    /** Le jeton d'accès dure 15 minutes ; le jeton de renouvellement, gardé au Keychain, en donne un autre. Plusieurs requêtes refusées, un seul renouvellement. */
    func renouveler() async -> Bool {
        if let renouvellement { return await renouvellement.value }
        let tache = Task<Bool, Never> { [self] in
            defer { renouvellement = nil }
            guard let jeton = jetonRenouvellement, let r = requete("/auth/refresh", methode: "POST", corps: ["refreshToken": jeton]) else { return false }
            guard let (donnees, reponse) = try? await URLSession.shared.data(for: r), let http = reponse as? HTTPURLResponse else { return false }
            guard (200..<300).contains(http.statusCode) else {
                // Une coupure ou une limite ne ferme pas la session ; un refus, si.
                if [400, 401, 403].contains(http.statusCode) {
                    let etaitConnecte = personne != nil
                    oublier()
                    personne = nil
                    if etaitConnecte { Messages.commun.afficher("Votre session a expiré. Connectez-vous de nouveau.", .avertissement) }
                }
                return false
            }
            if let corps = try? JSONDecoder().decode(ValeurHumalis.self, from: donnees) { garder(corps["data"]) }
            return true
        }
        renouvellement = tache
        return await tache.value
    }

    /** Une action sur le compte : refusée, le message s'affiche ; vrai si elle a réussi. */
    func afficherSiRefus(_ action: @MainActor () async throws -> Void) async -> Bool {
        do {
            try await action()
            return true
        } catch {
            Messages.commun.afficher(raisonDe(error) == pasDeReponse ? "Le serveur n'a pas répondu. Réessayez dans un instant." : raisonDe(error), .erreur)
            return false
        }
    }

    private func envoyer(_ chemin: String, _ corps: [String: String]) async throws -> (Data, HTTPURLResponse) {
        guard let r = requete(chemin, methode: "POST", corps: corps), let (donnees, reponse) = try? await URLSession.shared.data(for: r), let http = reponse as? HTTPURLResponse else {
            throw ErreurHumalis.refus(pasDeReponse)
        }
        return (donnees, http)
    }

    func seConnecter(email: String, motDePasse: String) async throws {
        let (donnees, http) = try await envoyer("/auth/login", ["email": email, "password": motDePasse])
        if http.statusCode == 429 { throw ErreurHumalis.refus("Trop de tentatives de connexion. Réessayez dans quelques minutes.") }
        // Jamais lequel des deux est faux : on ne dit pas si un compte existe.
        guard (200..<300).contains(http.statusCode) else { throw ErreurHumalis.refus("Email ou mot de passe incorrect.") }
        if let corps = try? JSONDecoder().decode(ValeurHumalis.self, from: donnees) { garder(corps["data"]) }
        await relire()
    }

    func seConnecterAvecGoogle() async throws {
        throw ErreurHumalis.refus("La connexion avec Google n'est pas encore disponible dans l'application Apple.")
    }

    func changerMotDePasse(actuel: String, nouveau: String) async throws {
        let (donnees, http) = try await envoyer("/auth/mot-de-passe", ["actuel": actuel, "nouveau": nouveau])
        if http.statusCode == 429 { throw ErreurHumalis.refus("Trop de tentatives. Réessayez dans quelques minutes.") }
        let corps = try? JSONDecoder().decode(ValeurHumalis.self, from: donnees)
        guard (200..<300).contains(http.statusCode) else {
            var raison = corps?["erreur"].enTexte ?? ""
            if raison.isEmpty { raison = "le mot de passe n'a pas été changé" }
            throw ErreurHumalis.refus(raison.prefix(1).uppercased() + raison.dropFirst() + ".")
        }
        if let corps { garder(corps) }
    }

    private func surLeSite() -> ErreurHumalis {
        .refus("Les invitations et les liens de mot de passe ne sont pas encore disponibles dans l'application Apple : passez par le site.")
    }

    func inviter(email: String, role: String) async throws { throw surLeSite() }
    func demanderLienMotDePasse(email: String) async throws { throw surLeSite() }
    func choisirMotDePasse(nouveau: String) async throws { throw surLeSite() }

    func seDeconnecter() async {
        _ = try? await envoyer("/auth/logout", [:])
        oublier()
        await relire()
    }
}

/** Une page réservée : les autres sont renvoyés vers « sinon », puis reviennent ici après s'être connectés. */
struct GardeHumalis<Contenu: View>: View {
    enum Qui { case connecte, admin }
    let qui: Qui
    let sinon: Route
    let ici: Route
    @ViewBuilder let contenu: () -> Contenu

    private var autorise: Bool { qui == .admin ? Session.commun.admin : Session.commun.connecte }

    var body: some View {
        Group {
            if !Session.commun.pret { ProgressView() }
            else if autorise { contenu() }
            else { Color.clear.task { Routeur.commun.remplacerPourConnexion(sinon, puis: ici) } }
        }
        .task { await Session.commun.attendre() }
    }
}
`;
