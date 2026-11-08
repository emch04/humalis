/**
 * Ce que l'application demande au système, en Swift : les messages, les
 * questions, les minuteries, ce qui reste sur l'appareil (préférences et
 * Keychain), le thème, les langues, le presse-papier et le partage.
 */

import { JOURS_ENVOIS_GARDES } from '../envois-gardes.js';

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
    /** Avec un en-tête, les messages s'affichent dessous : ils ne cachent pas le menu. */
    var decalage: CGFloat = 0

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
                .identifiantHumalis("message")
            }
        }
        .frame(maxWidth: 560)
        .padding(.horizontal, 16)
        .padding(.top, 8 + decalage)
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
    /** Un fichier de l'application : les réponses du serveur gardées « hors ligne » peuvent être longues. */
    private static func chemin(_ cle: String) -> URL? {
        guard let dossier = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let humalis = dossier.appendingPathComponent("humalis", isDirectory: true)
        try? FileManager.default.createDirectory(at: humalis, withIntermediateDirectories: true)
        return humalis.appendingPathComponent(cle.replacingOccurrences(of: "[^A-Za-z0-9_-]", with: "_", options: .regularExpression) + ".json")
    }

    static func lire<T: Decodable>(_ cle: String, secret: Bool = false, fichier: Bool = false) -> T? {
        let donnees = fichier ? chemin(cle).flatMap { try? Data(contentsOf: $0) } : secret ? Coffre.lire(cle) : UserDefaults.standard.data(forKey: cle)
        guard let donnees else { return nil }
        return try? JSONDecoder().decode(T.self, from: donnees)
    }

    static func ecrire<T: Encodable>(_ cle: String, _ valeur: T, secret: Bool = false, fichier: Bool = false) {
        guard let donnees = try? JSONEncoder().encode(valeur) else { return }
        if fichier {
            if let url = chemin(cle) { try? donnees.write(to: url, options: .atomic) }
        } else if secret { Coffre.ecrire(cle, donnees) } else { UserDefaults.standard.set(donnees, forKey: cle) }
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
    private let fichier: Bool

    init(wrappedValue: Valeur, _ cle: String, secret: Bool = false, fichier: Bool = false) {
        self.cle = cle
        self.secret = secret
        self.fichier = fichier
        _valeur = State(initialValue: Memoire.lire(cle, secret: secret, fichier: fichier) ?? wrappedValue)
    }

    var wrappedValue: Valeur {
        get { valeur }
        nonmutating set {
            valeur = newValue
            Memoire.ecrire(cle, newValue, secret: secret, fichier: fichier)
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
    /** Pas de réponse à cause du réseau : l'envoi n'est peut-être pas arrivé, on peut le recommencer sous le même identifiant. */
    case sansReseau
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
    /** Les jetons de session de l'application voyagent avec les appels (« session astratra »). */
    var session: Bool = false
    var essais: Int = 2
    var delai: Double = 10_000
}

@MainActor final class Serveur {
    static let commun = Serveur()

    private let session: URLSession = {
        let reglages = URLSessionConfiguration.default
        reglages.httpCookieStorage = nil
        reglages.httpShouldSetCookies = false
        // Pas de cache caché : après un envoi, une lecture doit voir la nouvelle réponse.
        reglages.urlCache = nil
        reglages.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: reglages)
    }()

    /** L'adresse du serveur : celle de la compilation, ou HUMALIS_SERVEUR pour essayer. */
    static var base: String {
        (ProcessInfo.processInfo.environment["HUMALIS_SERVEUR"] ?? Configuration.serveur).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    /** Le jeton CSRF posé par le serveur : un visiteur sans connexion le renvoie avec ses envois. */
    private var jetonCsrf: String?

    private func retenirCsrf(_ reponse: HTTPURLResponse) {
        guard let cookies = reponse.value(forHTTPHeaderField: "Set-Cookie"), let debut = cookies.range(of: "astratra_csrf=") else { return }
        let valeur = cookies[debut.upperBound...].prefix { $0 != ";" && $0 != "," }
        if !valeur.isEmpty { jetonCsrf = String(valeur) }
    }

    private func url(_ adresse: String, id: String?, source: SourceHumalis?, filtres: [(String, String)]) throws -> URL {
        let base = source?.adresse ?? Serveur.base
        var chemin = adresse.hasPrefix("/") ? adresse : "/" + adresse
        if let id {
            let propre = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? id
            if chemin.contains(":id") { chemin = chemin.replacingOccurrences(of: ":id", with: propre) } else { chemin += "/" + propre }
        }
        let texte = base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + chemin
        guard var composantes = URLComponents(string: texte) else { throw ErreurHumalis.refus(pasDeReponse) }
        var parametres = composantes.queryItems ?? []
        // Une valeur absente n'est pas envoyée : un filtre vide ne fait pas « ?categorie= ».
        for (cle, valeur) in filtres where !valeur.isEmpty { parametres.append(URLQueryItem(name: cle, value: valeur)) }
        if case .parametre(let nom)? = source?.jeton?.place, let jeton = source?.jeton?.valeur { parametres.append(URLQueryItem(name: nom, value: jeton)) }
        if !parametres.isEmpty { composantes.queryItems = parametres }
        guard let url = composantes.url else { throw ErreurHumalis.refus(pasDeReponse) }
        return url
    }

    /** Un appel brut, avec le jeton de session ; sur un 401, la session se renouvelle et l'appel repart une fois. */
    private func envoyerRequete(_ requete: URLRequest, source: SourceHumalis?) async throws -> (Data, HTTPURLResponse) {
        var essai = requete
        let avecSession = source == nil || source?.session == true
        if avecSession, let jeton = Session.commun.jeton {
            essai.setValue("Bearer \(jeton)", forHTTPHeaderField: "Authorization")
        } else if avecSession, requete.httpMethod != "GET" {
            // Un visiteur : le serveur demande le jeton CSRF qu'il a posé à la première lecture.
            if jetonCsrf == nil, var amorce = Optional(requete) {
                amorce.httpMethod = "GET"
                amorce.httpBody = nil
                if let (_, premiere) = try? await lancer(amorce, source: source) { retenirCsrf(premiere) }
            }
            if let jetonCsrf {
                essai.setValue("astratra_csrf=\(jetonCsrf)", forHTTPHeaderField: "Cookie")
                essai.setValue(jetonCsrf, forHTTPHeaderField: "x-csrf-token")
            }
        }
        var (donnees, reponse) = try await lancer(essai, source: source)
        if reponse.statusCode == 401, avecSession, await Session.commun.renouveler(), let jeton = Session.commun.jeton {
            essai.setValue("Bearer \(jeton)", forHTTPHeaderField: "Authorization")
            (donnees, reponse) = try await lancer(essai, source: source)
        }
        retenirCsrf(reponse)
        return (donnees, reponse)
    }

    private func lancer(_ requete: URLRequest, source: SourceHumalis?) async throws -> (Data, HTTPURLResponse) {
        // Seules les lectures sont rejouées : un envoi rejoué pourrait commander deux fois.
        let essais = requete.httpMethod == "GET" ? (source?.essais ?? 0) : 0
        var tentative = 0
        func pause() async { try? await Task.sleep(for: .milliseconds(tentative == 0 ? 500 : 1500)) }
        while true {
            do {
                let (donnees, reponse) = try await session.data(for: requete)
                guard let http = reponse as? HTTPURLResponse else { throw ErreurHumalis.refus(pasDeReponse) }
                if tentative < essais && [429, 502, 503, 504].contains(http.statusCode) {
                    await pause()
                    tentative += 1
                    continue
                }
                return (donnees, http)
            } catch let erreur as ErreurHumalis {
                throw erreur
            } catch {
                if tentative < essais {
                    await pause()
                    tentative += 1
                    continue
                }
                let coupures: [URLError.Code] = [.notConnectedToInternet, .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed, .dataNotAllowed, .internationalRoamingOff, .timedOut, .networkConnectionLost]
                if let coupure = error as? URLError, coupures.contains(coupure.code) { throw ErreurHumalis.sansReseau }
                throw ErreurHumalis.refus(pasDeReponse)
            }
        }
    }

    private func requete(_ adresse: String, methode: String, id: String?, envoi: [String: ValeurHumalis]?, source: SourceHumalis?, filtres: [(String, String)]) throws -> URLRequest {
        var r = URLRequest(url: try url(adresse, id: id, source: source, filtres: filtres))
        r.httpMethod = methode
        if let delai = source?.delai { r.timeoutInterval = delai / 1000 }
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if source == nil || source?.session == true { r.setValue("1", forHTTPHeaderField: "x-humalis-mobile") }
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

    private func suivre(_ depart: ValeurHumalis, _ chemin: String?) -> ValeurHumalis {
        (chemin ?? "").split(separator: ".").reduce(depart) { $0[String($1)] }
    }

    private func refus(_ donnees: Data, code: Int, source: SourceHumalis?) -> ErreurHumalis {
        if source != nil && code == 429 { return .refus("Trop de demandes en peu de temps. Patientez un moment, puis réessayez.") }
        if source != nil && code == 401 { return .refus("Connectez-vous pour continuer.") }
        let corps = try? JSONDecoder().decode(ValeurHumalis.self, from: donnees)
        var texte = suivre(corps ?? .rien, source?.erreurDans ?? "erreur").enTexte
        if source != nil && code == 404 && texte.isEmpty { return .refus("Ce que vous cherchez n'existe pas.") }
        if texte.isEmpty || (source != nil && code >= 500) { return .refus(pasDeReponse) }
        texte = texte.prefix(1).uppercased() + texte.dropFirst()
        return .refus(texte.hasSuffix(".") ? texte : texte + ".")
    }

    /** Un appel qui lève son erreur ; nil pour une réponse vide ou un élément qui n'existe plus. */
    func appel<T: Decodable>(_ adresse: String, comme type: T.Type, methode: String? = nil, envoi: [String: ValeurHumalis]? = nil, id: String? = nil, source: SourceHumalis? = nil, filtres: [(String, String)] = [], dans: String? = nil, cleEnvoi: String? = nil, suivi: (@MainActor (EtatRequete) -> Void)? = nil) async throws -> T? {
        suivi?(EtatRequete(statut: .chargement))
        do {
            let verbe = methode ?? (envoi != nil ? "POST" : "GET")
            var r = try requete(adresse, methode: verbe, id: id, envoi: envoi, source: source, filtres: filtres)
            if let cleEnvoi { r.setValue(cleEnvoi, forHTTPHeaderField: "X-Humalis-Envoi") }
            let (donnees, reponse) = try await envoyerRequete(r, source: source)
            // Le premier essai de cet envoi tourne encore sur le serveur : on réessaiera.
            if reponse.statusCode == 409 && cleEnvoi != nil { throw ErreurHumalis.sansReseau }
            if reponse.statusCode == 404 && verbe == "GET" && source == nil {
                suivi?(EtatRequete(statut: .introuvable))
                return nil
            }
            if reponse.statusCode == 401 && (source == nil || source?.session == true) { throw ErreurHumalis.refus("Connectez-vous pour continuer.") }
            guard (200..<300).contains(reponse.statusCode) else {
                let erreur = refus(donnees, code: reponse.statusCode, source: source)
                if reponse.statusCode == 404 {
                    suivi?(EtatRequete(statut: .introuvable, message: raisonDe(erreur)))
                    if suivi != nil { return nil }
                }
                throw erreur
            }
            suivi?(EtatRequete(statut: .repos))
            if donnees.isEmpty { return nil }
            guard let lue = try? JSONDecoder().decode(ValeurHumalis.self, from: donnees) else { return nil }
            let valeur = suivre(suivre(lue, source?.enveloppe), dans)
            if valeur == .rien { return nil }
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
    func lire<T: Decodable>(_ adresse: String, comme type: T.Type, envoi: [String: ValeurHumalis]? = nil, id: String? = nil, source: SourceHumalis? = nil, filtres: [(String, String)] = [], dans: String? = nil, suivi: (@MainActor (EtatRequete) -> Void)? = nil, horsLigne: Bool = false) async -> T? {
        do {
            return try await appel(adresse, comme: type, envoi: envoi, id: id, source: source, filtres: filtres, dans: dans, suivi: suivi)
        } catch {
            // Sans réseau, une variable « hors ligne » montre simplement ce qu'elle a gardé.
            if horsLigne && raisonDe(error) == pasDeReponse { return nil }
            // La page parle de l'état de la variable : elle montre l'erreur elle-même.
            if suivi == nil { dire(error) }
            return nil
        }
    }

    func appelSansReponse(_ adresse: String, methode: String? = nil, envoi: [String: ValeurHumalis]? = nil, id: String? = nil, source: SourceHumalis? = nil, filtres: [(String, String)] = [], dans: String? = nil, cleEnvoi: String? = nil) async throws {
        _ = try await appel(adresse, comme: ValeurHumalis.self, methode: methode, envoi: envoi, id: id, source: source, filtres: filtres, dans: dans, cleEnvoi: cleEnvoi)
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

    /** La session ou le jeton CSRF d'un visiteur, posés sur une requête qui ne passe pas par « appel ». */
    private func identifiee(_ requete: URLRequest) async -> URLRequest {
        var r = requete
        r.setValue("1", forHTTPHeaderField: "x-humalis-mobile")
        if let jeton = Session.commun.jeton {
            r.setValue("Bearer \(jeton)", forHTTPHeaderField: "Authorization")
        } else if r.httpMethod != "GET" {
            if jetonCsrf == nil, let url = URL(string: Serveur.base + "/auth/me"), let (_, reponse) = try? await session.data(from: url), let http = reponse as? HTTPURLResponse { retenirCsrf(http) }
            if let jetonCsrf {
                r.setValue("astratra_csrf=\(jetonCsrf)", forHTTPHeaderField: "Cookie")
                r.setValue(jetonCsrf, forHTTPHeaderField: "x-csrf-token")
            }
        }
        return r
    }

    /** « payer … pour c » : le serveur prépare le paiement, et sa page s'ouvre dans le navigateur. */
    func payerOuEchouer(_ adresse: String, id: String) async throws {
        guard let reponse = try await appel(adresse, comme: ValeurHumalis.self, methode: "POST", envoi: ["retour": .texte("/")], id: id) else { throw ErreurHumalis.refus(pasDeReponse) }
        let url = reponse["url"].enTexte
        guard url.hasPrefix("https://") || url.hasPrefix("http://localhost") else { throw ErreurHumalis.refus("Le paiement n'a pas pu s'ouvrir.") }
        ouvrirExterne(url)
    }

    func payer(_ adresse: String, id: String) async {
        do { try await payerOuEchouer(adresse, id: id) } catch { dire(error) }
    }

    /** « demander a ia » : la réponse arrive morceau par morceau. */
    func demanderIaOuEchouer(_ question: String, recevoir: @MainActor (String) -> Void) async throws {
        var demande = try requete("/auth/ia", methode: "POST", id: nil, envoi: ["question": .texte(question)], source: nil, filtres: [])
        demande.timeoutInterval = 300
        demande.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        var (flux, reponse) = try await session.bytes(for: await identifiee(demande))
        if (reponse as? HTTPURLResponse)?.statusCode == 401, await Session.commun.renouveler() {
            (flux, reponse) = try await session.bytes(for: await identifiee(demande))
        }
        guard let http = reponse as? HTTPURLResponse else { throw ErreurHumalis.refus(pasDeReponse) }
        guard (200..<300).contains(http.statusCode) else {
            var corps = Data()
            for try await octet in flux { corps.append(octet) }
            throw refus(corps, code: http.statusCode, source: nil)
        }
        do {
            for try await ligne in flux.lines where ligne.hasPrefix("data: ") {
                guard let donnees = String(ligne.dropFirst(6)).data(using: .utf8), let lue = try? JSONDecoder().decode(ValeurHumalis.self, from: donnees) else { continue }
                let erreur = lue["erreur"].enTexte
                if !erreur.isEmpty { throw ErreurHumalis.refus(erreur) }
                recevoir(lue["t"].enTexte)
            }
        } catch let erreur as ErreurHumalis {
            throw erreur
        } catch {
            throw ErreurHumalis.refus(pasDeReponse)
        }
    }

    func demanderIa(_ question: String, recevoir: @MainActor (String) -> Void) async {
        do { try await demanderIaOuEchouer(question, recevoir: recevoir) } catch { dire(error) }
    }

    /** « en direct » : attend les annonces du serveur et appelle « changement » à chacune. */
    func fluxDirect(_ adresse: String, changement: @MainActor () async -> Void) async throws {
        guard let url = URL(string: Serveur.base + adresse + "/direct") else { return }
        var demande = URLRequest(url: url)
        demande.httpMethod = "GET"
        demande.timeoutInterval = 3600
        demande.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        let (flux, reponse) = try await session.bytes(for: await identifiee(demande))
        guard let http = reponse as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw ErreurHumalis.refus(pasDeReponse) }
        for try await ligne in flux.lines where ligne == "data: change" { await changement() }
    }

    /** Un appareil qui reçoit les notifications du compte. */
    func enregistrerAppareil(_ jeton: String) async {
        _ = await appelReussi("/auth/appareils", methode: "POST", envoi: ["apple": .texte(jeton)])
    }

    /** « telecharger bon de … » : le PDF arrive avec la session, puis se montre. */
    func telechargerBonOuEchouer(_ adresse: String, id: String) async throws {
        let r = try requete(adresse + "/" + id + "/bon", methode: "GET", id: nil, envoi: nil, source: nil, filtres: [])
        let (donnees, reponse) = try await envoyerRequete(r, source: nil)
        guard (200..<300).contains(reponse.statusCode) else { throw refus(donnees, code: reponse.statusCode, source: nil) }
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
        guard let http = reponse as? HTTPURLResponse else { throw ErreurHumalis.refus(pasDeReponse) }
        guard (200..<300).contains(http.statusCode) else { throw refus(donnees, code: http.statusCode, source: source) }
        progression?(100)
        guard let lue = try? JSONDecoder().decode(ValeurHumalis.self, from: donnees) else { return nil }
        return Serveur.decoder(suivre(lue, source?.enveloppe), T.self)
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

/** Les routes écoutées « en direct » par une page : fermées quand on la quitte, relancées après une coupure. */
@MainActor final class ConnexionsDirect {
    private var taches: [String: Task<Void, Never>] = [:]

    func ecouter(_ adresse: String, relire: @escaping @MainActor () async -> Void) {
        guard taches[adresse] == nil else { return }
        taches[adresse] = Task { @MainActor in
            var attente = 1.0
            while !Task.isCancelled {
                try? await Serveur.commun.fluxDirect(adresse) {
                    attente = 1
                    await relire()
                }
                if Task.isCancelled { return }
                try? await Task.sleep(for: .seconds(attente))
                attente = Swift.min(attente * 2, 30)
            }
        }
    }

    func annuler() {
        taches.values.forEach { $0.cancel() }
        taches = [:]
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

    private static let cleCompte = "humalis.compte"

    private var personne: Personne? {
        didSet {
            let id = personne?.id?.enTexte ?? ""
            guard !id.isEmpty, id != compteGarde else { return }
            compteGarde = id
            Coffre.ecrire(Session.cleCompte, Data(id.utf8))
            quandCompteConnu?()
        }
    }

    /** Le compte connecté, connu aussi sans réseau ; nil pour un visiteur. */
    private(set) var compteGarde: String? = Coffre.lire(Session.cleCompte).flatMap { String(data: $0, encoding: .utf8) }
    /** Appelée quand une personne est reconnue : ce qui attendait pour elle peut partir. */
    var quandCompteConnu: (@MainActor () -> Void)?
    /** Vrai dès que /auth/me a répondu : avant, la page ne sait pas encore qui est là. */
    private var reponseRecue = false
    var pret: Bool { demander(); return reponseRecue }
    private var demande: Task<Void, Never>?
    private var renouvellement: Task<Bool, Never>?

    var connecte: Bool { demander(); return personne != nil }
    var admin: Bool { demander(); return personne?.role == "admin" }

    /** « si utilisateur est gerant » : un admin passe toujours. */
    func aRole(_ roles: [String]) -> Bool {
        demander()
        guard let role = personne?.role else { return false }
        return role == "admin" || roles.contains(role)
    }

    var jeton: String? { Coffre.lire(Session.cleJeton).flatMap { String(data: $0, encoding: .utf8) } }
    private var jetonRenouvellement: String? { Coffre.lire(Session.cleRenouvellement).flatMap { String(data: $0, encoding: .utf8) } }

    private func garder(_ corps: ValeurHumalis) {
        if case .texte(let v) = corps["token"] { Coffre.ecrire(Session.cleJeton, Data(v.utf8)) }
        if case .texte(let v) = corps["refreshToken"] { Coffre.ecrire(Session.cleRenouvellement, Data(v.utf8)) }
    }

    private func oublier() {
        compteGarde = nil
        Coffre.effacer(Session.cleCompte)
        Coffre.effacer(Session.cleJeton)
        Coffre.effacer(Session.cleRenouvellement)
    }

    private func requete(_ chemin: String, methode: String, corps: [String: String]? = nil) -> URLRequest? {
        guard let url = URL(string: Serveur.base + chemin) else { return nil }
        var r = URLRequest(url: url)
        r.httpMethod = methode
        r.cachePolicy = .reloadIgnoringLocalCacheData
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
        defer { reponseRecue = true }
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
        // Tant que la personne n'est pas reconnue, rien de ce qui attendait ne part avec sa session.
        compteGarde = nil
        Coffre.effacer(Session.cleCompte)
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
    enum Qui { case connecte, admin, roles([String]) }
    let qui: Qui
    let sinon: Route
    let ici: Route
    @ViewBuilder let contenu: () -> Contenu

    private var autorise: Bool {
        switch qui {
        case .connecte: return Session.commun.connecte
        case .admin: return Session.commun.admin
        case .roles(let roles): return Session.commun.aRole(roles)
        }
    }

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

/** Les notifications : ajoutées au projet seulement si une page écrit « activer notifications ». */
export const ENVOIS_SWIFT = String.raw`// Produit par Humalis : les envois « hors ligne », gardés sur l'appareil puis envoyés dans l'ordre.
import Foundation
import Network

/** Chaque envoi appartient au compte qui l'a fait : il ne part jamais au nom d'une autre personne. */
struct EnvoiGarde: Codable {
    let compte: String?
    let cree: Date
    /** Le même à chaque essai : le serveur ne fait le travail qu'une fois. */
    let numero: UUID
    let adresse: String
    let methode: String?
    let envoi: [String: ValeurHumalis]?
    let cible: String?
}

@MainActor final class EnvoisGardes {
    static let commun = EnvoisGardes()
    private static let cle = "humalis.envois-gardes"
    private var file: [EnvoiGarde]
    private var enCours = false
    private var surveillance: NWPathMonitor?
    private var relance: Task<Void, Never>?

    private static let clePerdus = "humalis.envois-perdus"
    /** Un compte qui ne revient jamais (retiré, par exemple) ne laisse pas ses envois sur l'appareil pour toujours. */
    private static let dureeMaximale: TimeInterval = ProcessInfo.processInfo.environment["HUMALIS_ESSAI_DUREE_ENVOIS"].flatMap(TimeInterval.init) ?? ${JOURS_ENVOIS_GARDES} * 24 * 3600
    /** Combien d'envois trop vieux chaque compte doit apprendre ; rien de leur contenu n'est gardé. */
    private var perdus: [String: Int]

    private init() {
        file = Memoire.lire(EnvoisGardes.cle, fichier: true) ?? []
        perdus = Memoire.lire(EnvoisGardes.clePerdus, fichier: true) ?? [:]
    }

    /** Trop vieux pour partir : effacés, et la bonne personne en est prévenue quand elle est là. */
    private func retirerPerimes(annoncer: Bool) {
        let perimes = file.filter { -$0.cree.timeIntervalSinceNow >= EnvoisGardes.dureeMaximale }
        if !perimes.isEmpty {
            let numeros = Set(perimes.map(\.numero))
            file.removeAll { numeros.contains($0.numero) }
            for envoi in perimes { perdus[envoi.compte ?? "", default: 0] += 1 }
            enregistrer()
        }
        guard annoncer, let nombre = perdus.removeValue(forKey: Session.commun.compteGarde ?? "") else { return }
        enregistrer()
        let phrase = nombre == 1
            ? "Votre envoi n'est pas parti : il a attendu plus de ${JOURS_ENVOIS_GARDES} jours sans pouvoir partir. Refaites-le si besoin."
            : "\(nombre) envois ne sont pas partis : ils ont attendu plus de ${JOURS_ENVOIS_GARDES} jours sans pouvoir partir. Refaites-les si besoin."
        Messages.commun.afficher(phrase, .avertissement, persistant: true)
    }

    /** Seulement ceux de la personne connectée ; les autres restent de côté. */
    private var aEnvoyer: [EnvoiGarde] { file.filter { $0.compte == Session.commun.compteGarde } }

    var attend: Bool { !aEnvoyer.isEmpty }

    /** Au lancement : écoute le retour du réseau et envoie ce qui attendait. */
    func demarrer() {
        if surveillance == nil {
            Session.commun.quandCompteConnu = { Task { await EnvoisGardes.commun.envoyer() } }
            let suivi = NWPathMonitor()
            suivi.pathUpdateHandler = { chemin in
                guard chemin.status == .satisfied else { return }
                Task { @MainActor in await EnvoisGardes.commun.envoyer() }
            }
            suivi.start(queue: DispatchQueue(label: "humalis.reseau"))
            surveillance = suivi
        }
        Task { await envoyer() }
    }

    func garder(_ numero: UUID, _ adresse: String, methode: String?, envoi: [String: ValeurHumalis]?, id: String?) {
        file.append(EnvoiGarde(compte: Session.commun.compteGarde, cree: Date(), numero: numero, adresse: adresse, methode: methode, envoi: envoi, cible: id))
        enregistrer()
        reessayerBientot()
    }

    /** Dans l'ordre, pour la personne connectée : si le réseau manque encore, tout attend ; un refus du serveur est dit, et on passe au suivant. */
    func envoyer(annoncer: Bool = true) async {
        retirerPerimes(annoncer: annoncer)
        guard !enCours, attend else { return }
        enCours = true
        defer {
            enCours = false
            reessayerBientot()
        }
        while let suivant = aEnvoyer.first {
            do {
                try await Serveur.commun.appelSansReponse(suivant.adresse, methode: suivant.methode, envoi: suivant.envoi, id: suivant.cible, cleEnvoi: suivant.numero.uuidString)
            } catch {
                let raison = raisonDe(error)
                // Une session à refaire attend ; un visiteur qui n'a pas le droit n'aura jamais de session à refaire.
                if raison == pasDeReponse || (raison == "Connectez-vous pour continuer." && suivant.compte != nil) { return }
                Messages.commun.afficher("Un envoi gardé a été refusé : \(raison)", .erreur)
            }
            file.removeAll { $0.numero == suivant.numero }
            enregistrer()
        }
    }

    private func enregistrer() {
        Memoire.ecrire(EnvoisGardes.cle, file, fichier: true)
        Memoire.ecrire(EnvoisGardes.clePerdus, perdus, fichier: true)
    }

    private func reessayerBientot() {
        guard attend, relance == nil else { return }
        relance = Task { [weak self] in
            try? await Task.sleep(for: .seconds(15))
            self?.relance = nil
            await self?.envoyer()
        }
    }
}

extension Serveur {
    /** Sans réseau, l'envoi attend et le geste continue. S'il y en a déjà en attente, celui-ci passe après eux. */
    func appelOuGarder(_ adresse: String, methode: String? = nil, envoi: [String: ValeurHumalis]? = nil, id: String? = nil) async throws {
        let attente = EnvoisGardes.commun
        let numero = UUID()
        if attente.attend {
            attente.garder(numero, adresse, methode: methode, envoi: envoi, id: id)
            await attente.envoyer()
            return
        }
        do {
            try await appelSansReponse(adresse, methode: methode, envoi: envoi, id: id, cleEnvoi: numero.uuidString)
        } catch ErreurHumalis.sansReseau {
            attente.garder(numero, adresse, methode: methode, envoi: envoi, id: id)
            Messages.commun.afficher("Pas de réseau : ce sera envoyé dès que la connexion revient.", .info)
        }
    }

    func appelReussiOuGarder(_ adresse: String, methode: String? = nil, envoi: [String: ValeurHumalis]? = nil, id: String? = nil) async -> Bool {
        do {
            try await appelOuGarder(adresse, methode: methode, envoi: envoi, id: id)
            return true
        } catch {
            let raison = raisonDe(error)
            Messages.commun.afficher(raison == pasDeReponse ? "Le serveur n'a pas répondu. Réessayez dans un instant." : raison, .erreur)
            return false
        }
    }
}
`;

export const NOTIFICATIONS_SWIFT = String.raw`// Produit par Humalis : les notifications de l'appareil.
import SwiftUI
import UserNotifications

/** « activer notifications » : la permission du système, puis le jeton de cet appareil envoyé au serveur. */
@MainActor func activerNotifications() async {
    let accord = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])) ?? false
    guard accord else {
        Messages.commun.afficher("Les notifications sont désactivées. Vous pouvez les activer dans les réglages de l'appareil.", .avertissement)
        return
    }
    #if os(macOS)
    NSApplication.shared.registerForRemoteNotifications()
    #else
    UIApplication.shared.registerForRemoteNotifications()
    #endif
}

#if os(macOS)
typealias DelegueSysteme = NSApplicationDelegate
typealias ApplicationSysteme = NSApplication
#else
typealias DelegueSysteme = UIApplicationDelegate
typealias ApplicationSysteme = UIApplication
#endif

/** Ce que le système répond : le jeton de l'appareil, ou le refus. */
final class DelegueNotifications: NSObject, DelegueSysteme, UNUserNotificationCenterDelegate {
    func application(_ application: ApplicationSysteme, didRegisterForRemoteNotificationsWithDeviceToken jeton: Data) {
        let texte = jeton.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in await Serveur.commun.enregistrerAppareil(texte) }
    }

    func application(_ application: ApplicationSysteme, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in Messages.commun.afficher("Cet appareil ne peut pas recevoir de notifications pour l'instant.", .avertissement) }
    }

    /** Une notification reçue pendant qu'on utilise l'application s'affiche quand même. */
    func userNotificationCenter(_ centre: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }
}
`;
