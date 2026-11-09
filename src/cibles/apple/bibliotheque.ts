/**
 * La petite bibliothèque d'aide recopiée dans chaque projet Apple : ce que
 * SwiftUI ne donne pas tout fait (le format français, une valeur souple, la
 * ligne qui passe à la ligne, les messages). Ce n'est pas un framework : du
 * Swift lisible, que l'on peut lire et changer.
 */

export const VALEURS_SWIFT = String.raw`// Produit par Humalis : les valeurs dont le type n'est connu qu'à l'exécution.
import Foundation

/** Ce qui s'écrit dans un texte : « {x} ». */
protocol AffichableHumalis {
    var enTexteHumalis: String { get }
}

/** Une donnée du serveur ou une fiche. */
protocol FicheHumalis: Codable, Hashable, Sendable, AffichableHumalis {
    init()
}

extension FicheHumalis {
    var enTexteHumalis: String { "" }
}

extension String: AffichableHumalis { var enTexteHumalis: String { self } }
extension Double: AffichableHumalis { var enTexteHumalis: String { formaterNombre(self) } }
extension Bool: AffichableHumalis { var enTexteHumalis: String { self ? "true" : "false" } }
extension Array: AffichableHumalis where Element: AffichableHumalis {
    var enTexteHumalis: String { map(\.enTexteHumalis).joined(separator: ", ") }
}
extension Optional: AffichableHumalis where Wrapped: AffichableHumalis {
    var enTexteHumalis: String { self?.enTexteHumalis ?? "" }
}

func texteDe<T: AffichableHumalis>(_ valeur: T) -> String { valeur.enTexteHumalis }

/** Un nombre écrit à la française (« 4,5 ») ou à l'anglaise ; 0 pour ce qui n'en est pas un. */
func nombreDe(_ texte: String) -> Double {
    Double(texte.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")) ?? 0
}

/** Vrai si le texte se lit comme un nombre. */
func estUnNombre(_ texte: String) -> Bool {
    Double(texte.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")) != nil
}

/** Une valeur reçue dont la forme n'est pas déclarée dans le programme. */
enum ValeurHumalis: Codable, Hashable, Sendable, AffichableHumalis {
    case rien
    case booleen(Bool)
    case nombre(Double)
    case texte(String)
    case liste([ValeurHumalis])
    case fiche([String: ValeurHumalis])

    init(from decoder: Decoder) throws {
        let boite = try decoder.singleValueContainer()
        if boite.decodeNil() { self = .rien }
        else if let v = try? boite.decode(Bool.self) { self = .booleen(v) }
        else if let v = try? boite.decode(Double.self) { self = .nombre(v) }
        else if let v = try? boite.decode(String.self) { self = .texte(v) }
        else if let v = try? boite.decode([ValeurHumalis].self) { self = .liste(v) }
        else if let v = try? boite.decode([String: ValeurHumalis].self) { self = .fiche(v) }
        else { self = .rien }
    }

    func encode(to encoder: Encoder) throws {
        var boite = encoder.singleValueContainer()
        switch self {
        case .rien: try boite.encodeNil()
        case .booleen(let v): try boite.encode(v)
        case .nombre(let v): try boite.encode(v)
        case .texte(let v): try boite.encode(v)
        case .liste(let v): try boite.encode(v)
        case .fiche(let v): try boite.encode(v)
        }
    }

    /** Toute valeur du programme, passée par sa forme JSON. */
    init<T: Encodable>(_ valeur: T) {
        if let deja = valeur as? ValeurHumalis { self = deja; return }
        guard let donnees = try? JSONEncoder().encode(valeur), let lue = try? JSONDecoder().decode(ValeurHumalis.self, from: donnees) else {
            self = .rien
            return
        }
        self = lue
    }

    subscript(cle: String) -> ValeurHumalis {
        get {
            if case .fiche(let champs) = self { return champs[cle] ?? .rien }
            return .rien
        }
        set {
            if case .fiche(var champs) = self {
                champs[cle] = newValue
                self = .fiche(champs)
            }
        }
    }

    var enTexte: String {
        switch self {
        case .texte(let v): return v
        case .nombre(let v): return formaterNombre(v)
        case .booleen(let v): return v ? "true" : "false"
        case .liste(let v): return v.map(\.enTexte).joined(separator: ", ")
        default: return ""
        }
    }
    var enTexteHumalis: String { enTexte }

    var enNombre: Double {
        switch self {
        case .nombre(let v): return v
        case .texte(let v): return nombreDe(v)
        case .booleen(let v): return v ? 1 : 0
        default: return 0
        }
    }

    var enBooleen: Bool {
        switch self {
        case .booleen(let v): return v
        case .rien: return false
        case .nombre(let v): return v != 0
        case .texte(let v): return !v.isEmpty
        default: return true
        }
    }

    var enListe: [ValeurHumalis] {
        if case .liste(let v) = self { return v }
        return []
    }

    var longueur: Double {
        switch self {
        case .liste(let v): return Double(v.count)
        case .texte(let v): return Double(v.count)
        default: return 0
        }
    }

    var estRien: Bool { self == .rien }
    var estPresent: Bool { self != .rien }

    var estVide: Bool {
        switch self {
        case .rien: return true
        case .texte(let v): return v.isEmpty
        case .liste(let v): return v.isEmpty
        case .fiche(let v): return v.isEmpty
        default: return false
        }
    }

    /** La valeur lue comme un type du programme ; sinon la valeur donnée. */
    func converti<T: Decodable>(sinon: T) -> T {
        guard let donnees = try? JSONEncoder().encode(self), let lue = try? JSONDecoder().decode(T.self, from: donnees) else { return sinon }
        return lue
    }
}

/** Une fiche vers une autre de forme proche : les champs communs sont gardés. */
func convertirHumalis<A: Encodable, B: Decodable>(_ valeur: A, sinon: B) -> B {
    ValeurHumalis(valeur).converti(sinon: sinon)
}

extension KeyedDecodingContainer {
    /** Un champ absent ou d'une autre forme prend sa valeur vide : une réponse incomplète n'arrête pas l'application. */
    func lire<T: Decodable>(_ cle: Key, _ sinon: T) -> T {
        (try? decodeIfPresent(T.self, forKey: cle)) ?? sinon
    }

    /** Un identifiant : un texte, ou un nombre que l'on écrit en texte. */
    func lireIdentifiant(_ cle: Key) -> String {
        if let texte = try? decode(String.self, forKey: cle) { return texte }
        if let entier = try? decode(Int.self, forKey: cle) { return String(entier) }
        if let nombre = try? decode(Double.self, forKey: cle) { return String(nombre) }
        return ""
    }
}

// ─── Listes et nombres ─────────────────────────────────────────────────────

func somme(_ nombres: [Double]) -> Double { nombres.reduce(0, +) }
func moyenne(_ nombres: [Double]) -> Double { nombres.isEmpty ? 0 : somme(nombres) / Double(nombres.count) }
func minimum(_ nombres: [Double]) -> Double { nombres.min() ?? 0 }
func maximum(_ nombres: [Double]) -> Double { nombres.max() ?? 0 }

func arrondi(_ valeur: Double, chiffres: Int) -> Double {
    let facteur = pow(10, Double(chiffres))
    return (valeur * facteur).rounded() / facteur
}

func hasard(_ minimum: Double, _ maximum: Double) -> Double {
    let bas = Int(minimum.rounded())
    let haut = Int(maximum.rounded())
    return bas <= haut ? Double(Int.random(in: bas...haut)) : minimum
}

func trier<T>(_ liste: [T], decroissant: Bool, par cle: (T) -> String) -> [T] {
    liste.sorted {
        let ordre = cle($0).compare(cle($1), locale: Locale(identifier: "fr_FR"))
        return decroissant ? ordre == .orderedDescending : ordre == .orderedAscending
    }
}

func trier<T>(_ liste: [T], decroissant: Bool, par cle: (T) -> Double) -> [T] {
    liste.sorted { decroissant ? cle($0) > cle($1) : cle($0) < cle($1) }
}

/** Les groupes, dans l'ordre d'apparition. */
func grouper<T>(_ liste: [T], par cle: (T) -> String) -> [(nom: String, elements: [T])] {
    var groupes: [(nom: String, elements: [T])] = []
    for element in liste {
        let nom = cle(element)
        if let i = groupes.firstIndex(where: { $0.nom == nom }) { groupes[i].elements.append(element) }
        else { groupes.append((nom, [element])) }
    }
    return groupes
}

/** Retire la première valeur égale ; ne fait rien si la liste ne la contient pas. */
func retirerPremier<T: Equatable>(_ liste: inout [T], _ valeur: T) {
    if let i = liste.firstIndex(of: valeur) { liste.remove(at: i) }
}
`;

export const FORMATS_SWIFT = String.raw`// Produit par Humalis : les nombres, les dates et les montants, comme sur les autres cibles.
import Foundation

private func region(_ langue: String) -> Locale { Locale(identifier: langue == "en" ? "en_US" : "fr_FR") }

/** 28000 → « 28 000 », 3.5 → « 3,5 » ; rien pour une valeur absente. */
func formaterNombre(_ valeur: Double?, langue: String = "fr") -> String {
    guard let valeur, valeur.isFinite else { return "" }
    return valeur.formatted(.number.locale(region(langue)).precision(.fractionLength(0...3)))
}

enum DeviseHumalis { case FC, EUR, USD }

/** 15000, FC → « 15 000 FC » ; 12.5, EUR → « 12,50 € » ; 12.5, USD → « 12,50 $ ». */
func formaterArgent(_ valeur: Double?, _ devise: DeviseHumalis, langue: String = "fr") -> String {
    guard let valeur, valeur.isFinite else { return "" }
    switch devise {
    case .FC:
        return "\(formaterNombre(valeur, langue: langue)) FC"
    case .EUR:
        return valeur.formatted(.currency(code: "EUR").locale(region(langue)))
    case .USD:
        if langue == "en" { return valeur.formatted(.currency(code: "USD").locale(region(langue))) }
        return "\(valeur.formatted(.number.locale(region(langue)).precision(.fractionLength(2)))) $"
    }
}

/** 1, « article » → « 1 article » ; 3 → « 3 articles » ; 2, « journal » → « 2 journaux ». */
func accorder(_ nombre: Double?, _ mot: String, langue: String = "fr") -> String {
    guard let nombre else { return "" }
    let ecrit = formaterNombre(nombre, langue: langue)
    if langue == "en" {
        if nombre == 1 { return "\(ecrit) \(mot)" }
        if mot.range(of: "(s|x|z|ch|sh)$", options: .regularExpression) != nil { return "\(ecrit) \(mot)es" }
        if mot.range(of: "[^aeiou]y$", options: .regularExpression) != nil { return "\(ecrit) \(mot.dropLast())ies" }
        return "\(ecrit) \(mot)s"
    }
    if abs(nombre) < 2 { return "\(ecrit) \(mot)" }
    if mot.range(of: "[sxz]$", options: .regularExpression) != nil { return "\(ecrit) \(mot)" }
    if mot.hasSuffix("al") { return "\(ecrit) \(mot.dropLast(2))aux" }
    if mot.range(of: "(eau|au|eu)$", options: .regularExpression) != nil { return "\(ecrit) \(mot)x" }
    return "\(ecrit) \(mot)s"
}

/** 1572864 octets, « Mo » → « 1,5 Mo ». */
func formaterTaille(_ octets: Double?, _ unite: String, langue: String = "fr") -> String {
    guard let octets else { return "" }
    let valeur = unite == "Mo" ? octets / 1_048_576 : octets / 1024
    let ecrit = valeur.formatted(.number.locale(region(langue)).precision(.fractionLength(0...1)))
    return "\(ecrit) \(langue == "en" ? (unite == "Mo" ? "MB" : "KB") : unite)"
}

/** « 2026-11-07 », lu comme un jour de l'appareil. */
private func jourDe(_ texte: String) -> Date? {
    let morceaux = texte.prefix(10).split(separator: "-").compactMap { Int($0) }
    guard morceaux.count == 3 else { return nil }
    return Calendar(identifier: .gregorian).date(from: DateComponents(year: morceaux[0], month: morceaux[1], day: morceaux[2]))
}

private func ecrireJour(_ date: Date) -> String {
    let c = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

/** « 2026-11-07 » → « 7 novembre 2026 » ; un texte qui n'est pas une date reste tel quel. */
func formaterDate(_ valeur: String?, langue: String = "fr") -> String {
    guard let valeur, !valeur.isEmpty else { return "" }
    guard let date = jourDe(valeur) else { return valeur }
    return date.formatted(.dateTime.day().month(.wide).year().locale(Locale(identifier: langue == "en" ? "en_GB" : "fr_FR")))
}

func dateDuJour() -> String { ecrireJour(Date()) }

func maintenant() -> String {
    Date().formatted(.iso8601.year().month().day().dateSeparator(.dash).time(includingFractionalSeconds: true).timeSeparator(.colon).timeZone(separator: .omitted))
}

enum UniteDate { case jours, semaines, mois }

/** « 2026-10-30 » plus 3 jours → « 2026-11-02 » ; un mois trop court garde son dernier jour. */
func decalerDate(_ valeur: String?, _ nombre: Double, _ unite: UniteDate) -> String {
    guard let valeur, let date = jourDe(valeur) else { return "" }
    let calendrier = Calendar(identifier: .gregorian)
    let n = Int(nombre)
    let decale: Date?
    switch unite {
    case .jours: decale = calendrier.date(byAdding: .day, value: n, to: date)
    case .semaines: decale = calendrier.date(byAdding: .day, value: n * 7, to: date)
    case .mois: decale = calendrier.date(byAdding: .month, value: n, to: date)
    }
    return decale.map(ecrireJour) ?? ""
}

/** Le nombre de jours de la première date à la seconde (négatif si elle est avant). */
func joursEntre(_ debut: String?, _ fin: String?) -> Double {
    guard let debut, let fin, let a = jourDe(debut), let b = jourDe(fin) else { return 0 }
    return Double(Calendar(identifier: .gregorian).dateComponents([.day], from: a, to: b).day ?? 0)
}

/** « il y a 3 jours », « il y a 2 heures », « à l’instant » ; rien pour une valeur absente. */
func formaterDepuis(_ valeur: String?) -> String {
    guard let valeur, !valeur.isEmpty else { return "" }
    let lue: Date?
    if valeur.count == 10 { lue = jourDe(valeur) }
    else { lue = (try? Date(valeur, strategy: .iso8601.year().month().day().dateSeparator(.dash).time(includingFractionalSeconds: true).timeSeparator(.colon).timeZone(separator: .omitted))) ?? (try? Date(valeur, strategy: .iso8601)) }
    guard let lue else { return "" }
    let minutes = Int(Date().timeIntervalSince(lue) / 60)
    func dire(_ n: Int, _ mot: String) -> String { "il y a \(n) \(mot)\(n > 1 && !mot.hasSuffix("s") ? "s" : "")" }
    if minutes < 1 { return "à l’instant" }
    if minutes < 60 { return dire(minutes, "minute") }
    if minutes < 1440 { return dire(minutes / 60, "heure") }
    if minutes < 43200 { return dire(minutes / 1440, "jour") }
    if minutes < 525600 { return dire(minutes / 43200, "mois") }
    return dire(minutes / 525600, "an")
}
`;

export const INTERFACE_SWIFT = String.raw`// Produit par Humalis : la page, la ligne et la grille, partagées par l'iPhone, l'iPad et le Mac.
import SwiftUI

/** Le nom réel de chaque police du thème, lu dans son fichier au lancement. */
enum PolicesHumalis {
    nonisolated(unsafe) static var noms: [String: String] = [:]
    static func vrai(_ nom: String) -> String { noms[nom] ?? nom }
}

/** « avec fond translucide » : le verre des systèmes récents, sinon le matériau translucide. */
struct FondTranslucideHumalis: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26, macOS 26, *) {
            content.glassEffect(in: RoundedRectangle(cornerRadius: 12))
        } else {
            content.background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
        }
    }
}

/** Une ligne d'une « table » : un tableau Mac demande un identifiant par ligne. */
struct LigneTableHumalis<Valeur>: Identifiable {
    let id: Int
    let valeur: Valeur
    let cles: [CleTriHumalis]
}

/** Un nombre se compare comme un nombre, un texte selon la langue. */
enum CleTriHumalis: Comparable {
    case nombre(Double)
    case texte(String)

    static func < (a: CleTriHumalis, b: CleTriHumalis) -> Bool {
        switch (a, b) {
        case let (.nombre(x), .nombre(y)): return x < y
        case let (.texte(x), .texte(y)): return x.localizedStandardCompare(y) == .orderedAscending
        case (.nombre, .texte): return true
        case (.texte, .nombre): return false
        }
    }
}

enum RacinePageHumalis { case defilement, liste, reglages }

/** L'écart entre les enfants d'un bloc, quand iOS et macOS en ont un différent. */
func ecartHumalis(ios: CGFloat, mac: CGFloat) -> CGFloat {
    #if os(iOS)
    return ios
    #else
    return mac
    #endif
}

/** Une couleur en clair et en sombre. */
func couleurHumalis(_ clair: UInt32, _ sombre: UInt32) -> Color {
    func composante(_ valeur: UInt32, _ decalage: UInt32) -> CGFloat { CGFloat((valeur >> decalage) & 255) / 255 }
    #if os(macOS)
    return Color(nsColor: NSColor(name: nil) { apparence in
        let v = apparence.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? sombre : clair
        return NSColor(srgbRed: composante(v, 16), green: composante(v, 8), blue: composante(v, 0), alpha: 1)
    })
    #else
    return Color(uiColor: UIColor { traits in
        let v = traits.userInterfaceStyle == .dark ? sombre : clair
        return UIColor(red: composante(v, 16), green: composante(v, 8), blue: composante(v, 0), alpha: 1)
    })
    #endif
}

/** Une page : elle défile, garde une largeur lisible et donne son titre à la fenêtre. */
extension EnvironmentValues {
    /** Le pied commun qui n'est pas « colle » : il défile à la fin de chaque page, comme sur un site. */
    @Entry var piedHumalis: AnyView? = nil
    /** Sur iPhone, un en-tête de site trop haut défile avec la page au lieu de cacher l'écran. */
    @Entry var enteteHumalis: AnyView? = nil
}

struct PageHumalis<Contenu: View>: View {
    @Environment(\.piedHumalis) private var pied
    @Environment(\.enteteHumalis) private var enteteDefilante
    let titre: String
    var largeur: CGFloat = 768
    /** Une page avec une liste : seules les lignes visibles sont construites. */
    var paresseuse = false
    /** Une liste système (pour glisser une ligne) ou un formulaire façon Réglages remplacent le défilement. */
    var racine: RacinePageHumalis = .defilement
    @ViewBuilder let contenu: () -> Contenu

    private var natif: Bool {
        #if os(iOS)
        return racine != .defilement
        #else
        return racine == .reglages
        #endif
    }

    @ViewBuilder private var pageNative: some View {
        if racine == .reglages {
            Form {
                if let enteteDefilante { enteteDefilante }
                contenu()
                if let pied { pied }
            }
            .formStyle(.grouped)
        } else {
            List {
                if let enteteDefilante { enteteDefilante }
                contenu().listRowSeparator(.hidden)
                if let pied { pied }
            }
            .listStyle(.plain)
        }
    }

    var body: some View {
        if natif {
            pageNative.navigationTitle(titre)
                #if os(iOS)
                // Le titre est déjà dans la page : la barre du haut ne le répète pas.
                .toolbarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .principal) { Color.clear.frame(width: 1, height: 1).accessibilityHidden(true) } }
                #endif
        } else { pageDefilante }
    }

    private var pageDefilante: some View {
        ScrollViewReader { lecteur in
            ScrollView {
                VStack(spacing: 0) {
                    if let enteteDefilante { enteteDefilante }
                    Group {
                        if paresseuse {
                            LazyVStack(alignment: .leading, spacing: 12) { contenu() }
                        } else {
                            VStack(alignment: .leading, spacing: 12) { contenu() }
                        }
                    }
                    .padding(16)
                    .padding(.bottom, 32)
                    .frame(maxWidth: largeur, alignment: .leading)
                    .frame(maxWidth: .infinity)
                    if let pied { pied }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: Routeur.commun.ancre) { _, ancre in
                guard let ancre else { return }
                withAnimation { lecteur.scrollTo(ancre, anchor: .top) }
                Routeur.commun.ancre = nil
            }
        }
        .navigationTitle(titre)
        #if os(iOS)
        .toolbarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) { Color.clear.frame(width: 1, height: 1).accessibilityHidden(true) }
            // Le pavé numérique de l'iPhone n'a pas de touche pour se fermer.
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("OK") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }
            }
        }
        #endif
    }
}

extension EnvironmentValues {
    /** Sur iPad et Mac, le menu de l'en-tête passe dans la barre latérale. */
    @Entry var menuLateral = false
}

extension View {
    /** Nomme un groupe sans donner ce nom à chacun de ses éléments. */
    func identifiantHumalis(_ id: String) -> some View {
        accessibilityElement(children: .contain).accessibilityIdentifier(id)
    }
}

enum RepartitionHumalis { case debut, centree, fin, entre, autour }

/** Une ligne d'éléments qui passe à la ligne quand la place manque. */
struct LigneHumalis: Layout {
    var espacement: CGFloat = 12
    var alignement: VerticalAlignment = .center
    var repartition: RepartitionHumalis = .debut

    private struct Rangee {
        var indices: [Int] = []
        var largeur: CGFloat = 0
        var hauteur: CGFloat = 0
    }

    private func rangees(_ largeurMax: CGFloat, _ tailles: [CGSize]) -> [Rangee] {
        var liste: [Rangee] = []
        var courante = Rangee()
        for (i, taille) in tailles.enumerated() {
            let ajout = (courante.indices.isEmpty ? 0 : espacement) + taille.width
            if !courante.indices.isEmpty && courante.largeur + ajout > largeurMax {
                liste.append(courante)
                courante = Rangee(indices: [i], largeur: taille.width, hauteur: taille.height)
            } else {
                courante.indices.append(i)
                courante.largeur += ajout
                courante.hauteur = Swift.max(courante.hauteur, taille.height)
            }
        }
        if !courante.indices.isEmpty { liste.append(courante) }
        return liste
    }

    private func tailles(_ proposition: ProposedViewSize, _ vues: Subviews) -> [CGSize] {
        let largeur = proposition.width ?? .infinity
        return vues.map { vue in
            let ideale = vue.sizeThatFits(.unspecified)
            return ideale.width > largeur ? vue.sizeThatFits(ProposedViewSize(width: largeur, height: nil)) : ideale
        }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let mesures = tailles(proposal, subviews)
        let lignes = rangees(proposal.width ?? .infinity, mesures)
        let hauteur = lignes.map(\.hauteur).reduce(0, +) + espacement * CGFloat(Swift.max(0, lignes.count - 1))
        let largeurContenu = lignes.map(\.largeur).max() ?? 0
        return CGSize(width: repartition == .debut ? largeurContenu : (proposal.width ?? largeurContenu), height: hauteur)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let mesures = tailles(ProposedViewSize(width: bounds.width, height: nil), subviews)
        var y = bounds.minY
        for rangee in rangees(bounds.width, mesures) {
            let libre = Swift.max(0, bounds.width - rangee.largeur)
            let nombre = CGFloat(rangee.indices.count)
            var x = bounds.minX
            var ecart = espacement
            switch repartition {
            case .debut: break
            case .centree: x += libre / 2
            case .fin: x += libre
            case .entre: if nombre > 1 { ecart += libre / (nombre - 1) }
            case .autour:
                x += libre / (nombre * 2)
                ecart += libre / nombre
            }
            for i in rangee.indices {
                let taille = mesures[i]
                let decalage: CGFloat
                switch alignement {
                case .top: decalage = 0
                case .bottom: decalage = rangee.hauteur - taille.height
                default: decalage = (rangee.hauteur - taille.height) / 2
                }
                subviews[i].place(at: CGPoint(x: x, y: y + decalage), proposal: ProposedViewSize(taille))
                x += taille.width + ecart
            }
            y += rangee.hauteur + espacement
        }
    }
}

/** Une grille : une seule colonne sur un écran étroit. */
struct GrilleHumalis<Contenu: View>: View {
    var colonnes: Int = 3
    var espacement: CGFloat = 16
    @ViewBuilder let contenu: () -> Contenu
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var classe
    private var nombre: Int { classe == .compact ? 1 : colonnes }
    #else
    private var nombre: Int { colonnes }
    #endif

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: espacement, alignment: .topLeading), count: Swift.max(1, nombre)), alignment: .leading, spacing: espacement) {
            contenu()
        }
    }
}
`;
