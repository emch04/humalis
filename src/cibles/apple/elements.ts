/**
 * Les éléments d'écran en SwiftUI. Chaque groupe n'est recopié dans le projet
 * que si une page s'en sert (voir `fichiersElements`).
 */

const CHAMPS = String.raw`// Produit par Humalis : les champs d'un formulaire.
import SwiftUI

func estVideHumalis(_ texte: String) -> Bool { texte.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

func correspondHumalis(_ texte: String, _ motif: String) -> Bool {
    texte.trimmingCharacters(in: .whitespacesAndNewlines).range(of: motif, options: .regularExpression) != nil
}

enum ClavierHumalis { case texte, email, telephone, nombre, adresseWeb }

private struct LibelleHumalis: View {
    let libelle: String
    let obligatoire: Bool
    var body: some View {
        (Text(verbatim: libelle) + Text(verbatim: obligatoire ? " *" : "")).font(.subheadline.weight(.medium))
    }
}

extension View {
    @ViewBuilder func clavierHumalis(_ clavier: ClavierHumalis) -> some View {
        #if os(iOS)
        switch clavier {
        case .texte: self
        case .email: self.keyboardType(.emailAddress).textContentType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
        case .telephone: self.keyboardType(.phonePad).textContentType(.telephoneNumber)
        case .nombre: self.keyboardType(.decimalPad)
        case .adresseWeb: self.keyboardType(.URL).textContentType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
        }
        #else
        self
        #endif
    }
}

struct ChampHumalis: View {
    let libelle: String
    @Binding var texte: String
    var clavier: ClavierHumalis = .texte
    var obligatoire = false
    var indice: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LibelleHumalis(libelle: libelle, obligatoire: obligatoire)
            TextField(libelle, text: $texte, prompt: indice.map { Text(verbatim: $0) })
                .labelsHidden()
                .textFieldStyle(.roundedBorder)
                .clavierHumalis(clavier)
        }
    }
}

/** Un mot de passe a son œil : pour vérifier ce qu'on a tapé. */
struct MotDePasseHumalis: View {
    let libelle: String
    @Binding var texte: String
    var nouveau = false
    var obligatoire = false
    var indice: String? = nil
    @State private var visible = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LibelleHumalis(libelle: libelle, obligatoire: obligatoire)
            HStack {
                Group {
                    if visible { TextField(libelle, text: $texte, prompt: indice.map { Text(verbatim: $0) }) }
                    else { SecureField(libelle, text: $texte, prompt: indice.map { Text(verbatim: $0) }) }
                }
                .labelsHidden()
                .textFieldStyle(.roundedBorder)
                #if os(iOS)
                .textContentType(nouveau ? .newPassword : .password)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                #endif
                Button { visible.toggle() } label: { Image(systemName: visible ? "eye.slash" : "eye") }
                    .buttonStyle(.plain)
                    .accessibilityLabel(visible ? "Masquer le mot de passe" : "Afficher le mot de passe")
            }
        }
    }
}

struct TexteLongHumalis: View {
    let libelle: String
    @Binding var texte: String
    var obligatoire = false
    var indice: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LibelleHumalis(libelle: libelle, obligatoire: obligatoire)
            TextEditor(text: $texte)
                .frame(minHeight: 96)
                .overlay(alignment: .topLeading) {
                    if texte.isEmpty, let indice {
                        Text(verbatim: indice).foregroundStyle(.secondary).padding(8).allowsHitTesting(false)
                    }
                }
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(.secondary.opacity(0.5)))
                .accessibilityLabel(libelle)
        }
    }
}

/** Un choix parmi quelques valeurs : des boutons ronds. */
struct ChoixHumalis: View {
    let libelle: String
    let valeurs: [String]
    @Binding var choisi: String
    var obligatoire = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            LibelleHumalis(libelle: libelle, obligatoire: obligatoire)
            ForEach(valeurs, id: \.self) { valeur in
                Button { choisi = valeur } label: {
                    Label { Text(verbatim: valeur) } icon: { Image(systemName: choisi == valeur ? "largecircle.fill.circle" : "circle") }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(choisi == valeur ? .isSelected : [])
            }
        }
    }
}

struct ListeHumalis: View {
    let libelle: String
    let valeurs: [String]
    @Binding var choisi: String
    var obligatoire = false
    var indice: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LibelleHumalis(libelle: libelle, obligatoire: obligatoire)
            Picker(libelle, selection: $choisi) {
                Text(verbatim: indice ?? "Choisissez…").tag("")
                ForEach(valeurs, id: \.self) { Text(verbatim: $0).tag($0) }
            }
            .labelsHidden()
            .pickerStyle(.menu)
        }
    }
}

enum GenreDate { case date, heure }

/** Une date ou une heure, gardée en texte : « 2026-11-08 », « 14:30 ». */
struct ChampDateHumalis: View {
    let libelle: String
    @Binding var texte: String
    let genre: GenreDate
    var obligatoire = false

    private var format: DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = genre == .date ? "yyyy-MM-dd" : "HH:mm"
        return f
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LibelleHumalis(libelle: libelle, obligatoire: obligatoire)
            if let date = format.date(from: texte) {
                HStack {
                    DatePicker(libelle, selection: Binding(get: { date }, set: { texte = format.string(from: $0) }), displayedComponents: genre == .date ? .date : .hourAndMinute)
                        .labelsHidden()
                    Button { texte = "" } label: { Image(systemName: "xmark.circle") }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Effacer")
                }
            } else {
                Button(genre == .date ? "Choisir une date" : "Choisir une heure") { texte = format.string(from: Date()) }
                    .buttonStyle(.bordered)
                    .accessibilityLabel(libelle)
            }
        }
    }
}
`;

const BLOCS = String.raw`// Produit par Humalis : onglets, dépliants, carrousel, fenêtres, listes à déplacer.
import SwiftUI

struct OngletsHumalis<Contenu: View>: View {
    @Binding var choisi: Int
    let titres: [String]
    @ViewBuilder let contenu: () -> Contenu

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("", selection: $choisi) {
                ForEach(Array(titres.enumerated()), id: \.offset) { i, titre in Text(verbatim: titre).tag(i) }
            }
            .labelsHidden()
            #if !os(watchOS)
            .pickerStyle(.segmented)
            #endif
            contenu()
        }
    }
}

struct DeroulantHumalis<Contenu: View>: View {
    let titre: String
    @Binding var ouvert: Bool
    @ViewBuilder let contenu: () -> Contenu

    var body: some View {
        #if os(watchOS) || os(tvOS)
        // La montre et la télévision n'ont pas de groupe dépliant : un bouton ouvre et ferme.
        VStack(alignment: .leading, spacing: 8) {
            Button { ouvert.toggle() } label: { Label(titre, systemImage: ouvert ? "chevron.down" : "chevron.right") }
            if ouvert { contenu() }
        }
        #else
        DisclosureGroup(isExpanded: $ouvert) {
            VStack(alignment: .leading, spacing: 12) { contenu() }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 8)
        } label: {
            Text(verbatim: titre).font(.headline)
        }
        #endif
    }
}

struct CarrouselHumalis<Contenu: View>: View {
    @ViewBuilder let contenu: () -> Contenu

    var body: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 12) {
                contenu().containerRelativeFrame(.horizontal)
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
    }
}

/** Une fenêtre au-dessus de la page ; « obligatoire » : il faut répondre pour la fermer. */
struct FenetreHumalis<Contenu: View>: View {
    @Binding var ouverte: Bool
    let titre: String
    var description: String? = nil
    var obligatoire = false
    @ViewBuilder let contenu: () -> Contenu

    var body: some View {
        Color.clear.frame(width: 0, height: 0)
            .sheet(isPresented: $ouverte) {
                NavigationStack {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            if let description { Text(verbatim: description).foregroundStyle(.secondary) }
                            contenu()
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .navigationTitle(titre)
                    #if os(iOS)
                    .toolbarTitleDisplayMode(.inline)
                    #endif
                    .toolbar {
                        if !obligatoire {
                            ToolbarItem(placement: .cancellationAction) {
                                Button { ouverte = false } label: { Image(systemName: "xmark") }.accessibilityLabel("Fermer")
                            }
                        }
                    }
                }
                .interactiveDismissDisabled(obligatoire)
                #if os(macOS)
                .frame(minWidth: 420, minHeight: 280)
                #endif
            }
    }
}

/** Un élément d'une liste « avec deplacement » : monter et descendre, au doigt, à la souris et au lecteur d'écran. */
struct LigneDeplacableHumalis<Contenu: View>: View {
    let index: Int
    let total: Int
    let deplacer: (Int, Int) -> Void
    @ViewBuilder let contenu: () -> Contenu

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 4) { contenu() }.frame(maxWidth: .infinity, alignment: .leading)
            Button { deplacer(index, index - 1) } label: { Image(systemName: "chevron.up") }
                .buttonStyle(.bordered).disabled(index == 0).accessibilityLabel("Monter")
            Button { deplacer(index, index + 1) } label: { Image(systemName: "chevron.down") }
                .buttonStyle(.bordered).disabled(index >= total - 1).accessibilityLabel("Descendre")
        }
    }
}

/** Le bouton « Voir plus », et la suite qui se charge quand le bas arrive à l'écran. */
struct VoirPlusHumalis: View {
    let libelle: String?
    let charger: @MainActor () async -> Void
    @State private var enCours = false

    private func lancer() {
        guard !enCours else { return }
        enCours = true
        Task {
            await charger()
            enCours = false
        }
    }

    var body: some View {
        Group {
            if let libelle {
                Button(libelle) { lancer() }.buttonStyle(.bordered).disabled(enCours)
            } else if enCours {
                ProgressView()
            } else {
                Color.clear.frame(height: 1)
            }
        }
        .onAppear { lancer() }
    }
}

enum AppareilHumalis { case telephone, tablette, ordinateur }

/** Un bloc « sur telephone : » n'est montré que sur ces appareils. */
struct SurAppareilHumalis<Contenu: View>: View {
    let appareils: [AppareilHumalis]
    @ViewBuilder let contenu: () -> Contenu
    init(_ appareils: [AppareilHumalis], @ViewBuilder contenu: @escaping () -> Contenu) {
        self.appareils = appareils
        self.contenu = contenu
    }

    private var actuel: AppareilHumalis {
        #if os(macOS)
        return .ordinateur
        #elseif os(watchOS)
        return .telephone
        #else
        return UIDevice.current.userInterfaceIdiom == .pad ? .tablette : .telephone
        #endif
    }

    var body: some View {
        if appareils.contains(actuel) { contenu() }
    }
}

/** Le code affiché dans la documentation. */
struct CodeHumalis: View {
    let code: String
    var body: some View {
        ScrollView(.horizontal) {
            Text(verbatim: code).font(.system(.callout, design: .monospaced))
                #if !os(watchOS) && !os(tvOS)
                .textSelection(.enabled)
                #endif
                .padding(12)
        }
        .background(.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
    }
}

struct TableauHumalis: View {
    let legende: String
    let colonnes: [String]
    let rangees: [[String]]
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(verbatim: legende).font(.headline)
            ScrollView(.horizontal) {
                Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                    GridRow { ForEach(Array(colonnes.enumerated()), id: \.offset) { _, c in Text(verbatim: c).bold() } }
                    Divider()
                    ForEach(Array(rangees.enumerated()), id: \.offset) { _, rangee in
                        GridRow { ForEach(Array(rangee.enumerated()), id: \.offset) { _, c in Text(verbatim: c) } }
                    }
                }
            }
        }
    }
}

/** Un texte avec des morceaux mis en avant ou en police de code. */
struct MorceauTexte {
    let texte: String
    var accent = false
    var code = false
    init(_ texte: String, accent: Bool = false, code: Bool = false) {
        self.texte = texte
        self.accent = accent
        self.code = code
    }
}

func texteRiche(_ morceaux: [MorceauTexte]) -> Text {
    var tout = AttributedString()
    for morceau in morceaux {
        var partie = AttributedString(morceau.texte)
        if morceau.accent { partie.foregroundColor = Couleurs.accent }
        if morceau.code { partie.font = .system(.body, design: .monospaced) }
        tout += partie
    }
    return Text(tout)
}
`;

const WIDGETS = String.raw`// Produit par Humalis : badge, avatar, progression, étoiles, compteur.
import SwiftUI

struct BadgeHumalis: View {
    let texte: String
    var body: some View {
        Text(verbatim: texte)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Couleurs.encreRouge)
            .padding(.horizontal, 10)
            .padding(.vertical, 2)
            .background(Couleurs.rouge, in: Capsule())
    }
}

struct AvatarHumalis: View {
    let nom: String
    var photo: String? = nil

    private var initiales: String {
        nom.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }

    var body: some View {
        Group {
            if let photo, !photo.isEmpty {
                ImageHumalis(source: .adresse(photo), description: nom, ajustement: .remplir)
            } else {
                ZStack {
                    Circle().fill(.secondary.opacity(0.25))
                    Text(verbatim: initiales).font(.headline)
                }
                .accessibilityLabel(nom)
            }
        }
        .frame(width: 48, height: 48)
        .clipShape(Circle())
    }
}

struct ProgressionHumalis: View {
    let valeur: Double
    var maximum: Double = 100
    var description: String? = nil
    var pourcentage = false

    var body: some View {
        HStack {
            ProgressView(value: Swift.min(Swift.max(valeur, 0), maximum), total: maximum)
                .accessibilityLabel(description ?? "Progression")
            if pourcentage { Text(verbatim: "\(formaterNombre((valeur / maximum * 100).rounded())) %").font(.footnote) }
        }
    }
}

struct ChargementHumalis: View {
    let texte: String
    var body: some View {
        HStack(spacing: 8) {
            ProgressView()
            if !texte.isEmpty { Text(verbatim: texte) }
        }
    }
}

struct EtoilesHumalis: View {
    @Binding var note: Double
    var maximum: Int = 5
    var modifiable = true

    private func dessin(_ i: Int) -> String {
        if note >= Double(i) { return "star.fill" }
        return note >= Double(i) - 0.5 ? "star.leadinghalf.filled" : "star"
    }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(1...Swift.max(1, maximum), id: \.self) { i in
                if modifiable {
                    Button { note = Double(i) } label: { Image(systemName: dessin(i)) }.buttonStyle(.plain)
                } else {
                    Image(systemName: dessin(i))
                }
            }
        }
        .foregroundStyle(Couleurs.jaune)
        .accessibilityElement(children: modifiable ? .contain : .ignore)
        .accessibilityLabel("\(formaterNombre(note)) sur \(maximum)")
    }
}

struct CompteurHumalis: View {
    @Binding var valeur: Double
    var minimum: Double = 0
    var maximum: Double = .greatestFiniteMagnitude
    var description: String? = nil

    var body: some View {
        HStack(spacing: 12) {
            Button { valeur = Swift.max(minimum, valeur - 1) } label: { Image(systemName: "minus") }
                .buttonStyle(.bordered).disabled(valeur <= minimum).accessibilityLabel("Moins")
            Text(verbatim: formaterNombre(valeur)).monospacedDigit().accessibilityLabel(description ?? "Quantité")
            Button { valeur = Swift.min(maximum, valeur + 1) } label: { Image(systemName: "plus") }
                .buttonStyle(.bordered).disabled(valeur >= maximum).accessibilityLabel("Plus")
        }
    }
}
`;

const MOUVEMENT = String.raw`// Produit par Humalis : les animations d'entrée et les effets au survol.
import SwiftUI

enum AnimationHumalis { case apparition, montee, agrandissement }

/** L'élément arrive en douceur ; rien ne bouge si l'appareil demande de réduire les animations. */
struct AnimeHumalis: ViewModifier {
    let animation: AnimationHumalis
    let duree: Double
    let delai: Double
    @Environment(\.accessibilityReduceMotion) private var reduit
    @State private var arrive = false

    func body(content: Content) -> some View {
        let montre = arrive || reduit
        content
            .opacity(montre ? 1 : 0)
            .offset(y: !montre && animation == .montee ? 16 : 0)
            .scaleEffect(!montre && animation == .agrandissement ? 0.95 : 1)
            .onAppear {
                withAnimation(.easeOut(duration: duree / 1000).delay(delai / 1000)) { arrive = true }
            }
    }
}

enum EffetHumalis { case leve, agrandi }

struct EffetSurvolHumalis: ViewModifier {
    let effet: EffetHumalis
    @Environment(\.accessibilityReduceMotion) private var reduit
    @State private var survole = false

    func body(content: Content) -> some View {
        let actif = survole && !reduit
        content
            .offset(y: actif && effet == .leve ? -2 : 0)
            .scaleEffect(actif && effet == .agrandi ? 1.03 : 1)
            .animation(.easeOut(duration: 0.15), value: survole)
            .onHover { survole = $0 }
    }
}
`;

const IMAGES = String.raw`// Produit par Humalis : les images, d'un fichier de l'application, d'une adresse ou d'une donnée.
import SwiftUI
#if os(macOS)
import AppKit
typealias ImageSysteme = NSImage
#else
import UIKit
typealias ImageSysteme = UIImage
#endif

enum SourceMedia {
    case locale(String)
    case adresse(String)
}

enum AjustementHumalis { case remplir, contenir }

private extension Image {
    init(systeme: ImageSysteme) {
        #if os(macOS)
        self.init(nsImage: systeme)
        #else
        self.init(uiImage: systeme)
        #endif
    }
}

struct ImageHumalis: View {
    let source: SourceMedia
    var description: String = ""
    var proportions: CGFloat? = nil
    var ajustement: AjustementHumalis = .contenir
    @State private var chargee: ImageSysteme?
    @State private var echec = false

    private func dessin(_ image: Image) -> some View {
        image
            .resizable()
            .aspectRatio(contentMode: ajustement == .remplir ? .fill : .fit)
    }

    private func charger() async {
        switch source {
        case .locale(let nom):
            if let url = Bundle.main.url(forResource: nom, withExtension: nil), let donnees = try? Data(contentsOf: url) { chargee = ImageSysteme(data: donnees) }
            // Un SVG vit dans le catalogue d'images, sous son nom sans extension.
            if chargee == nil { chargee = ImageSysteme(named: (nom as NSString).deletingPathExtension) }
            if chargee == nil { echec = true }
        case .adresse(let adresse):
            var lues: Data?
            if adresse.hasPrefix("data:"), let virgule = adresse.firstIndex(of: ",") { lues = Data(base64Encoded: String(adresse[adresse.index(after: virgule)...])) }
            else if let url = URL(string: adresse.hasPrefix("/") ? (Configuration.adresseDuSite.isEmpty ? Configuration.serveur : Configuration.adresseDuSite) + adresse : adresse) { lues = try? await URLSession.shared.data(from: url).0 }
            if let lues, let image = ImageSysteme(data: lues) { chargee = image } else { echec = true }
        }
    }

    private var identite: String {
        switch source {
        case .locale(let v): return v
        case .adresse(let v): return v
        }
    }

    var body: some View {
        Group {
            if let chargee { dessin(Image(systeme: chargee)) }
            else if echec { Image(systemName: "photo").foregroundStyle(.secondary).frame(minWidth: 44, minHeight: 44) }
            else { ProgressView().frame(minWidth: 44, minHeight: 44) }
        }
        .aspectRatio(proportions, contentMode: ajustement == .remplir ? .fill : .fit)
        .frame(maxWidth: .infinity)
        .clipped()
        .accessibilityElement()
        .accessibilityLabel(description)
        .accessibilityHidden(description.isEmpty)
        .accessibilityAddTraits(.isImage)
        .task(id: identite) { chargee = nil; echec = false; await charger() }
    }
}
`;

const FICHIERS = String.raw`// Produit par Humalis : le choix d'un fichier.
import SwiftUI
import UniformTypeIdentifiers

struct FamilleFichier {
    let nom: String
    let mime: [String]
}

/** Un fichier choisi : ce que la page peut lire (nom, taille, type, apercu). */
struct FichierChoisi: Codable, Hashable, Sendable, AffichableHumalis {
    var nom: String = ""
    var taille: Double = 0
    var type: String = ""
    var apercu: String? = nil
    var mime: String = "application/octet-stream"
    var url: URL = URL(fileURLWithPath: "/")
    var enTexteHumalis: String { nom }
}

private let motsDesFamilles = ["images": "image", "audio": "audio", "videos": "video", "pdf": "pdf", "documents": "document"]
private let refusDesFamilles = ["images": "une image", "audio": "un son", "videos": "une vidéo", "pdf": "un PDF", "documents": "un document"]

struct ChoixFichierHumalis: View {
    let libelle: String
    var fichier: Binding<FichierChoisi?>? = nil
    var liste: Binding<[FichierChoisi]>? = nil
    let familles: [FamilleFichier]
    var maximum: Double? = nil
    var apercu = true
    @State private var ouvert = false
    @State private var erreur = ""

    private var types: [UTType] {
        let lus = familles.flatMap(\.mime).compactMap { UTType(mimeType: $0) }
        return lus.isEmpty ? [.data] : lus
    }

    private func ecrireTaille(_ octets: Double) -> String { formaterTaille(octets, octets >= 1_048_576 ? "Mo" : "Ko") }

    private func recevoir(_ resultat: Result<[URL], Error>) {
        guard case .success(let urls) = resultat else { erreur = "Vos fichiers n'ont pas pu s'ouvrir. Réessayez."; return }
        var gardes: [FichierChoisi] = []
        var refus: [String] = []
        for source in urls {
            let acces = source.startAccessingSecurityScopedResource()
            defer { if acces { source.stopAccessingSecurityScopedResource() } }
            let sujet = urls.count == 1 ? "Ce fichier" : source.lastPathComponent
            let copie = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + source.lastPathComponent)
            guard (try? FileManager.default.copyItem(at: source, to: copie)) != nil else { refus.append("\(sujet) n'a pas pu être lu."); continue }
            let taille = Double((try? copie.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0)
            if let maximum, taille > maximum {
                refus.append("\(sujet) est trop gros : \(ecrireTaille(taille)), le maximum est \(ecrireTaille(maximum)).")
                continue
            }
            let mime = UTType(filenameExtension: source.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            let famille = familles.first { $0.mime.contains(mime) || $0.mime.contains { m in m.hasSuffix("/*") && mime.hasPrefix(m.dropLast(1)) } }
            if !familles.isEmpty && famille == nil {
                refus.append("\(sujet) n'est pas \(familles.compactMap { refusDesFamilles[$0.nom] }.joined(separator: " ni ")).")
                continue
            }
            let visible = apercu && (mime.hasPrefix("image/") || mime.hasPrefix("audio/") || mime.hasPrefix("video/"))
            gardes.append(FichierChoisi(nom: source.lastPathComponent, taille: taille, type: famille.flatMap { motsDesFamilles[$0.nom] } ?? (mime.hasPrefix("image/") ? "image" : "fichier"), apercu: visible ? copie.absoluteString : nil, mime: mime, url: copie))
        }
        erreur = refus.joined(separator: " ")
        fichier?.wrappedValue = gardes.first
        liste?.wrappedValue = gardes
    }

    private var noms: [String] {
        if let liste { return liste.wrappedValue.map(\.nom) }
        return fichier?.wrappedValue.map { [$0.nom] } ?? []
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(libelle) { ouvert = true }.buttonStyle(.bordered)
            ForEach(noms, id: \.self) { Text(verbatim: $0).font(.footnote) }
            if !erreur.isEmpty { Text(verbatim: erreur).foregroundStyle(Couleurs.rouge).font(.footnote) }
        }
        .fileImporter(isPresented: $ouvert, allowedContentTypes: types, allowsMultipleSelection: liste != nil, onCompletion: recevoir)
    }
}
`;

const QR = String.raw`// Produit par Humalis : le code QR, dessiné par le système.
import SwiftUI
import CoreImage.CIFilterBuiltins

struct QrHumalis: View {
    let texte: String
    var description: String? = nil

    private var image: CGImage? {
        let filtre = CIFilter.qrCodeGenerator()
        filtre.message = Data(texte.utf8)
        guard let sortie = filtre.outputImage else { return nil }
        return CIContext().createCGImage(sortie, from: sortie.extent)
    }

    var body: some View {
        Group {
            if let image {
                Image(decorative: image, scale: 1)
                    .interpolation(.none)
                    .resizable()
                    .frame(width: 180, height: 180)
                    .padding(12)
                    .background(.white, in: RoundedRectangle(cornerRadius: 8))
            }
        }
        .accessibilityElement()
        .accessibilityLabel(description ?? "Code QR")
    }
}
`;

const VIDEO = String.raw`// Produit par Humalis : une vidéo, avec les commandes du système ; elle ne démarre jamais toute seule.
import SwiftUI
import AVKit

struct VideoHumalis: View {
    let source: SourceMedia
    var description: String? = nil
    var transcription: String? = nil
    var boucle = false
    @State private var joueur: AVPlayer?
    @State private var fin: NSObjectProtocol?

    private var url: URL? {
        switch source {
        case .locale(let nom): return Bundle.main.url(forResource: nom, withExtension: nil)
        case .adresse(let texte): return URL(string: texte)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VideoPlayer(player: joueur)
                .aspectRatio(16 / 9, contentMode: .fit)
                .accessibilityLabel(description ?? "")
            if let transcription {
                DisclosureGroup("Lire la transcription") { Text(transcription) }
            }
        }
        .onAppear {
            guard joueur == nil, let url else { return }
            let j = AVPlayer(url: url)
            joueur = j
            if boucle {
                fin = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: j.currentItem, queue: .main) { _ in
                    j.seek(to: .zero)
                    j.play()
                }
            }
        }
        .onDisappear {
            joueur?.pause()
            if let fin { NotificationCenter.default.removeObserver(fin) }
        }
    }
}
`;

const AUDIO = String.raw`// Produit par Humalis : le lecteur de son.
import SwiftUI
import AVFoundation

@MainActor @Observable private final class LecteurSon {
    private var joueur: AVPlayer?
    private var fin: NSObjectProtocol?
    var joue = false

    func preparer(_ url: URL, boucle: Bool) {
        let element = AVPlayerItem(url: url)
        let joueur = AVPlayer(playerItem: element)
        self.joueur = joueur
        fin = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: element, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.joueur?.seek(to: .zero)
                if boucle { self.joueur?.play() } else { self.joue = false }
            }
        }
    }

    func basculer() {
        if joue { joueur?.pause() } else { joueur?.play() }
        joue.toggle()
    }

    func arreter() {
        joueur?.pause()
        joue = false
    }
}

struct LecteurHumalis: View {
    let source: SourceMedia
    var description: String? = nil
    var transcription: String? = nil
    var boucle = false
    @State private var lecteur = LecteurSon()
    @State private var transcriptionOuverte = false

    private var url: URL? {
        switch source {
        case .locale(let nom): return Bundle.main.url(forResource: nom, withExtension: nil)
        case .adresse(let adresse): return URL(string: adresse)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Button { lecteur.basculer() } label: { Image(systemName: lecteur.joue ? "pause.fill" : "play.fill") }
                    .buttonStyle(.bordered)
                    .accessibilityLabel(lecteur.joue ? "Pause" : "Lecture")
                if let description { Text(verbatim: description) }
            }
            if let transcription {
                DisclosureGroup("Transcription", isExpanded: $transcriptionOuverte) { Text(verbatim: transcription).font(.footnote) }
            }
        }
        .onAppear { if let url { lecteur.preparer(url, boucle: boucle) } }
        .onDisappear { lecteur.arreter() }
    }
}
`;

const GRAPHIQUES = String.raw`// Produit par Humalis : les graphiques, avec Swift Charts.
import SwiftUI
import Charts

struct SerieHumalis {
    let nom: String
    let valeurs: [Double]
    var couleur: Color? = nil
}

enum GenreGraphique { case courbe, barres, camembert }

struct GraphiqueHumalis: View {
    let genre: GenreGraphique
    let titre: String
    let description: String
    let etiquettes: [String]
    let series: [SerieHumalis]
    var devise: DeviseHumalis? = nil
    var proportions: CGFloat? = nil

    private struct Point: Identifiable {
        let id: String
        let etiquette: String
        let serie: String
        let valeur: Double
    }

    private var points: [Point] {
        series.flatMap { serie in
            zip(etiquettes, serie.valeurs).enumerated().map { i, couple in
                Point(id: "\(serie.nom)-\(i)", etiquette: couple.0, serie: serie.nom, valeur: couple.1)
            }
        }
    }

    private var couleurs: [Color] { series.enumerated().map { i, s in s.couleur ?? [Couleurs.bleu, Couleurs.vert, Couleurs.orange, Couleurs.violet, Couleurs.rose][i % 5] } }

    private func ecrire(_ valeur: Double) -> String { devise.map { formaterArgent(valeur, $0) } ?? formaterNombre(valeur) }

    @ChartContentBuilder private func marques(_ point: Point) -> some ChartContent {
        switch genre {
        case .barres:
            BarMark(x: .value("Libellé", point.etiquette), y: .value(point.serie, point.valeur))
                .foregroundStyle(by: .value("Série", point.serie))
                .position(by: .value("Série", point.serie))
        case .courbe:
            LineMark(x: .value("Libellé", point.etiquette), y: .value(point.serie, point.valeur))
                .foregroundStyle(by: .value("Série", point.serie))
            PointMark(x: .value("Libellé", point.etiquette), y: .value(point.serie, point.valeur))
                .foregroundStyle(by: .value("Série", point.serie))
        case .camembert:
            SectorMark(angle: .value(point.serie, point.valeur), innerRadius: .ratio(0.5), angularInset: 1)
                .foregroundStyle(by: .value("Libellé", point.etiquette))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Chart(points) { marques($0) }
                .chartForegroundStyleScale(range: genre == .camembert ? [Couleurs.bleu, Couleurs.vert, Couleurs.orange, Couleurs.violet, Couleurs.rose, Couleurs.jaune, Couleurs.rouge, Couleurs.gris] : couleurs)
                .chartYAxis { AxisMarks { valeur in
                    AxisGridLine()
                    AxisValueLabel { if let v = valeur.as(Double.self) { Text(verbatim: ecrire(v)) } }
                } }
                .aspectRatio(proportions ?? 16 / 9, contentMode: .fit)
                .accessibilityLabel("\(titre). \(description)")
            // Les mêmes chiffres en tableau, pour qui ne voit pas le dessin.
            DisclosureGroup("Voir les données") {
                Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 4) {
                    GridRow {
                        Text(verbatim: "")
                        ForEach(series, id: \.nom) { Text(verbatim: $0.nom).bold() }
                    }
                    ForEach(Array(etiquettes.enumerated()), id: \.offset) { i, etiquette in
                        GridRow {
                            Text(verbatim: etiquette)
                            ForEach(series, id: \.nom) { serie in Text(verbatim: i < serie.valeurs.count ? ecrire(serie.valeurs[i]) : "") }
                        }
                    }
                }
                .font(.footnote)
                .padding(.top, 4)
            }
        }
    }
}
`;

const CARTES = String.raw`// Produit par Humalis : les cartes, avec Plans d'Apple.
import SwiftUI
import MapKit

struct CarteHumalis<Lieux: MapContent>: View {
    let nom: String
    var latitude: Double? = nil
    var longitude: Double? = nil
    var zoom: Double? = nil
    @MapContentBuilder let lieux: () -> Lieux

    private var position: MapCameraPosition {
        guard let latitude, let longitude else { return .automatic }
        // Le zoom des cartes du web : chaque niveau divise par deux la distance couverte.
        let etendue = 360 / pow(2, zoom ?? 13)
        return .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude), span: MKCoordinateSpan(latitudeDelta: etendue, longitudeDelta: etendue)))
    }

    var body: some View {
        Map(initialPosition: position) { lieux() }
            .frame(height: 320)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .accessibilityLabel(nom)
    }
}
`;

const POSITION = String.raw`// Produit par Humalis : la position de l'appareil, demandée une fois, quand la page en a besoin.
import CoreLocation

struct PositionHumalis {
    let latitude: Double
    let longitude: Double
    let precision: Double
}

@MainActor final class LecteurPosition: NSObject, CLLocationManagerDelegate {
    static let commun = LecteurPosition()
    private let gestionnaire = CLLocationManager()
    private var attente: CheckedContinuation<PositionHumalis?, Never>?
    private var delai: Task<Void, Never>?

    override init() {
        super.init()
        gestionnaire.delegate = self
    }

    func lire() async -> PositionHumalis? {
        // Une lecture à la fois : une deuxième demande attend la fin de la première.
        guard attente == nil else { return nil }
        return await withCheckedContinuation { suite in
            attente = suite
            delai = Task { [weak self] in
                try? await Task.sleep(for: .seconds(20))
                if !Task.isCancelled { self?.terminer(nil, "La position n'a pas pu être lue. Réessayez dehors ou près d'une fenêtre.") }
            }
            avancer()
        }
    }

    private func avancer() {
        switch gestionnaire.authorizationStatus {
        case .notDetermined: gestionnaire.requestWhenInUseAuthorization()
        case .denied, .restricted: terminer(nil, "L'accès à la position est refusé. Vous pouvez l'autoriser dans les réglages de l'appareil.")
        default: gestionnaire.requestLocation()
        }
    }

    private func terminer(_ position: PositionHumalis?, _ message: String? = nil) {
        guard let suite = attente else { return }
        attente = nil
        delai?.cancel()
        delai = nil
        if let message { Messages.commun.afficher(message, .erreur) }
        suite.resume(returning: position)
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            if self.attente != nil && self.gestionnaire.authorizationStatus != .notDetermined { self.avancer() }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let lieu = locations.last else { return }
        let lue = PositionHumalis(latitude: lieu.coordinate.latitude, longitude: lieu.coordinate.longitude, precision: lieu.horizontalAccuracy)
        Task { @MainActor in self.terminer(lue) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.terminer(nil, "La position n'a pas pu être lue. Réessayez dans un instant.") }
    }
}

/** « position dans lieu ». */
@MainActor func lirePosition() async -> PositionHumalis? {
    await LecteurPosition.commun.lire()
}
`;

const APPAREIL = String.raw`// Produit par Humalis : l'appareil photo, le scanner, Face ID, la vibration et la signature.
import SwiftUI
import LocalAuthentication
import UniformTypeIdentifiers
#if os(iOS)
import VisionKit
#endif

/** « vibrer » : un petit retour au toucher ; rien sur un appareil qui ne sait pas le faire. */
@MainActor func vibrer() {
    #if os(iOS)
    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    #else
    NSHapticFeedbackManager.defaultPerformer.perform(.generic, performanceTime: .now)
    #endif
}

/** « verifier identite » : Face ID, Touch ID ou, à défaut, le code de l'appareil. */
@MainActor func verifierIdentite() async -> Bool {
    let contexte = LAContext()
    var probleme: NSError?
    guard contexte.canEvaluatePolicy(.deviceOwnerAuthentication, error: &probleme) else {
        Messages.commun.afficher("Cet appareil ne peut pas vérifier votre identité.", .avertissement)
        return false
    }
    return (try? await contexte.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Confirmez que c'est bien vous.")) ?? false
}

/** Une photo prise ou choisie, rangée comme un fichier choisi. */
private func fichierPhoto(_ donnees: Data) -> FichierChoisi? {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("photo-\(UUID().uuidString).jpg")
    guard (try? donnees.write(to: url)) != nil else { return nil }
    return FichierChoisi(nom: url.lastPathComponent, taille: Double(donnees.count), type: "image", apercu: url.absoluteString, mime: "image/jpeg", url: url)
}

#if os(iOS)
/** Présente un écran du système au-dessus de tout ce qui est ouvert. */
@MainActor private func presenter(_ ecran: UIViewController) {
    #if !HUMALIS_SANS_FENETRE
    let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    guard var haut = scene?.keyWindow?.rootViewController else { return }
    while let suivante = haut.presentedViewController { haut = suivante }
    haut.present(ecran, animated: true)
    #endif
}

/** Garde le délégué en vie pendant que l'écran du système est ouvert. */
@MainActor private var delegueOuvert: AnyObject?

private final class DeleguePhoto: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    let fin: (Data?) -> Void
    init(fin: @escaping (Data?) -> Void) { self.fin = fin }

    func imagePickerController(_ ecran: UIImagePickerController, didFinishPickingMediaWithInfo infos: [UIImagePickerController.InfoKey: Any]) {
        ecran.dismiss(animated: true)
        fin((infos[.originalImage] as? UIImage)?.jpegData(compressionQuality: 0.85))
    }

    func imagePickerControllerDidCancel(_ ecran: UIImagePickerController) {
        ecran.dismiss(animated: true)
        fin(nil)
    }
}

@MainActor private final class DelegueScanner: NSObject, DataScannerViewControllerDelegate {
    let fin: (String?) -> Void
    private var fini = false
    init(fin: @escaping (String?) -> Void) { self.fin = fin }

    private func terminer(_ valeur: String?, _ ecran: UIViewController) {
        guard !fini else { return }
        fini = true
        ecran.dismiss(animated: true)
        fin(valeur)
    }

    func dataScanner(_ ecran: DataScannerViewController, didAdd elements: [RecognizedItem], allItems: [RecognizedItem]) {
        for element in elements {
            if case .barcode(let code) = element, let valeur = code.payloadStringValue { terminer(valeur, ecran); return }
        }
    }

    @objc func annuler(_ bouton: UIBarButtonItem) {
        if let ecran = bouton.target as? UIViewController { terminer(nil, ecran) }
    }
}
#endif

/** « photo dans image » : l'appareil photo ; sans appareil photo, le choix d'une image. */
@MainActor func prendrePhoto() async -> FichierChoisi? {
    #if os(iOS)
    let donnees: Data? = await withCheckedContinuation { suite in
        let ecran = UIImagePickerController()
        ecran.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        let delegue = DeleguePhoto { valeur in
            delegueOuvert = nil
            suite.resume(returning: valeur)
        }
        delegueOuvert = delegue
        ecran.delegate = delegue
        presenter(ecran)
    }
    return donnees.flatMap(fichierPhoto)
    #else
    let panneau = NSOpenPanel()
    panneau.allowedContentTypes = [.image]
    panneau.allowsMultipleSelection = false
    guard panneau.runModal() == .OK, let url = panneau.url, let donnees = try? Data(contentsOf: url) else { return nil }
    return fichierPhoto(donnees)
    #endif
}

/** « scanner code dans valeur » : un code QR ou un code-barres, avec l'appareil photo. */
@MainActor func scannerCode() async -> String? {
    #if os(iOS)
    guard DataScannerViewController.isSupported, DataScannerViewController.isAvailable else {
        Messages.commun.afficher("Cet appareil ne peut pas scanner de code.", .avertissement)
        return nil
    }
    return await withCheckedContinuation { suite in
        let scanner = DataScannerViewController(recognizedDataTypes: [.barcode()], isHighlightingEnabled: true)
        let delegue = DelegueScanner { valeur in
            delegueOuvert = nil
            suite.resume(returning: valeur)
        }
        delegueOuvert = delegue
        scanner.delegate = delegue
        scanner.navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Annuler", primaryAction: UIAction { [weak scanner, weak delegue] _ in
            guard let scanner, let delegue else { return }
            scanner.dismiss(animated: true)
            delegue.fin(nil)
        })
        let cadre = UINavigationController(rootViewController: scanner)
        cadre.modalPresentationStyle = .fullScreen
        presenter(cadre)
        try? scanner.startScanning()
    }
    #else
    Messages.commun.afficher("Le scan d'un code n'est pas disponible sur Mac.", .avertissement)
    return nil
    #endif
}

/** « signature dans trace » : la personne signe, la variable reçoit l'image en texte (PNG). */
struct SignatureHumalis: View {
    @Binding var trace: String
    @State private var traits: [[CGPoint]] = []
    @State private var courant: [CGPoint] = []

    private func dessin(_ tous: [[CGPoint]], largeur: CGFloat) -> some View {
        Canvas { contexte, _ in
            var chemin = Path()
            for trait in tous {
                guard let premier = trait.first else { continue }
                chemin.move(to: premier)
                trait.dropFirst().forEach { chemin.addLine(to: $0) }
            }
            contexte.stroke(chemin, with: .color(.black), style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
        }
        .frame(width: largeur, height: 180)
        .background(Color.white)
    }

    @MainActor private func exporter(largeur: CGFloat) {
        let rendu = ImageRenderer(content: dessin(traits, largeur: largeur))
        rendu.scale = 2
        guard let image = rendu.cgImage else { return }
        #if os(macOS)
        let donnees = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
        #else
        let donnees = UIImage(cgImage: image).pngData()
        #endif
        if let donnees { trace = "data:image/png;base64," + donnees.base64EncodedString() }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            GeometryReader { cadre in
                dessin(traits + [courant], largeur: cadre.size.width)
                    .gesture(DragGesture(minimumDistance: 0).onChanged { courant.append($0.location) }.onEnded { _ in
                        traits.append(courant)
                        courant = []
                        exporter(largeur: cadre.size.width)
                    })
            }
            .frame(height: 180)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(.secondary.opacity(0.5)))
            .accessibilityElement()
            .accessibilityLabel("Zone de signature")
            .accessibilityIdentifier("zone_signature")
            Button("Effacer la signature") {
                traits = []
                trace = ""
            }
            .buttonStyle(.bordered)
        }
    }
}
`;

/** Les fichiers d'aide dont les pages ont besoin, d'après leur code. */
export function fichiersElements(code: string): Map<string, string> {
  const emploie = (motif: RegExp) => motif.test(code);
  const fichiers = new Map<string, string>();
  fichiers.set('Humalis/Blocs.swift', BLOCS);
  if (emploie(/\b(ChampHumalis|MotDePasseHumalis|TexteLongHumalis|ChoixHumalis|ListeHumalis|ChampDateHumalis|estVideHumalis|SaisieDessineeHumalis|CaseDessineeHumalis|ListeDessineeHumalis)\b/)) fichiers.set('Humalis/Champs.swift', CHAMPS);
  if (emploie(/\b(BadgeHumalis|AvatarHumalis|ProgressionHumalis|ChargementHumalis|EtoilesHumalis|CompteurHumalis)\b/)) fichiers.set('Humalis/Widgets.swift', WIDGETS);
  if (emploie(/\b(AnimeHumalis|EffetSurvolHumalis)\b/)) fichiers.set('Humalis/Mouvement.swift', MOUVEMENT);
  if (emploie(/\b(ImageHumalis|BadgeHumalis|AvatarHumalis|ProgressionHumalis|ChargementHumalis|EtoilesHumalis|CompteurHumalis|LecteurHumalis|VideoHumalis)\b/)) fichiers.set('Humalis/Images.swift', IMAGES);
  if (emploie(/\b(ChoixFichierHumalis|FichierChoisi|televerser)\b/)) fichiers.set('Humalis/Fichiers.swift', FICHIERS);
  if (emploie(/\b(prendrePhoto|scannerCode|verifierIdentite|vibrer|SignatureHumalis)\(/)) {
    fichiers.set('Humalis/Appareil.swift', APPAREIL);
    fichiers.set('Humalis/Fichiers.swift', FICHIERS);
  }
  if (emploie(/\blirePosition\(/)) fichiers.set('Humalis/Position.swift', POSITION);
  if (emploie(/\bQrHumalis\b/)) fichiers.set('Humalis/Qr.swift', QR);
  if (emploie(/\bLecteurHumalis\b/)) fichiers.set('Humalis/Audio.swift', AUDIO);
  if (emploie(/\bVideoHumalis\b/)) fichiers.set('Humalis/Video.swift', VIDEO);
  if (emploie(/\bGraphiqueHumalis\b/)) fichiers.set('Humalis/Graphiques.swift', GRAPHIQUES);
  if (emploie(/\bCarteHumalis\b/)) fichiers.set('Humalis/Cartes.swift', CARTES);
  return fichiers;
}
