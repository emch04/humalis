/**
 * Les médias sur Apple : « enregistrer audio dans note », « enregistrer video dans clip »,
 * « scanner document dans facture » et « recadrer photo ». Le résultat est un `FichierChoisi`,
 * comme celui de « photo dans » : il s'affiche (`apercu`) et s'envoie au serveur (`url`).
 * L'annulation rend `nil` : la variable ne change pas.
 *
 * - le son : AVAudioRecorder, en AAC (.m4a) ;
 * - la vidéo : AVCaptureSession et AVCaptureMovieFileOutput, en H.264 ;
 * - le document : VNDocumentCameraViewController sur iPhone et iPad ; sur Mac, qui n'a pas ce
 *   scanner, le choix d'une image ou d'un PDF, comme « photo dans » ; toujours un PDF à la fin ;
 * - le recadrage : un écran SwiftUI, avec ImageIO pour lire et écrire l'image.
 */

/** Le code Swift appelle-t-il l'une de ces fonctions ? */
export const emploieCaptures = (code: string): boolean => /\b(enregistrerMedia|scannerDocument|recadrerPhoto)\(/.test(code);

/** Ce que l'application demandera au système, d'après son code. */
export const besoinsCaptures = (code: string): { micro: boolean; camera: boolean } => ({
  micro: /\bawait enregistrerMedia\(/.test(code),
  camera: /\bawait (enregistrerMedia\("video"\)|scannerDocument\()/.test(code),
});

export const CAPTURES = String.raw`// Produit par Humalis : enregistrer un son ou une vidéo, scanner un document, recadrer une photo.
import SwiftUI
#if (os(iOS) || os(macOS)) && !HUMALIS_SANS_FENETRE
@preconcurrency import AVFoundation
import Combine
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
#if os(iOS)
@preconcurrency import VisionKit
#endif

/** Fait passer un objet du système d'un fil à l'autre : c'est le code ci-dessous qui garantit l'ordre. */
private struct Transport<T>: @unchecked Sendable { let valeur: T }

private func fichierTemporaire(_ debut: String, _ extensionFichier: String) -> URL {
    FileManager.default.temporaryDirectory.appendingPathComponent("\(debut)-\(UUID().uuidString).\(extensionFichier)")
}

private func tailleDe(_ url: URL) -> Double {
    Double((try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value ?? 0)
}

private func ecrireDuree(_ secondes: Int) -> String {
    String(format: "%02d:%02d", secondes / 60, secondes % 60)
}

// ─── L'écran par-dessus l'application ───────────────────────────────────────

/** Une réponse attendue : elle n'arrive qu'une fois, même si deux boutons sont touchés ensemble. */
@MainActor private final class FinCapture {
    private var suite: CheckedContinuation<FichierChoisi?, Never>?
    var fermerEcran: (() -> Void)?
    init(_ suite: CheckedContinuation<FichierChoisi?, Never>) { self.suite = suite }

    func terminer(_ valeur: FichierChoisi?) {
        guard let attente = suite else { return }
        suite = nil
        fermerEcran?()
        fermerEcran = nil
        attente.resume(returning: valeur)
    }
}

/** La fenêtre du dessus : c'est elle qui montre les écrans du système. */
#if os(iOS)
@MainActor private func controleurDuHaut() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    guard var haut = (scenes.first { $0.activationState == .foregroundActive } ?? scenes.first)?.keyWindow?.rootViewController else { return nil }
    while let suivante = haut.presentedViewController { haut = suivante }
    return haut
}
#endif

/** Ouvre un écran, en plein écran sur iPhone et en feuille sur Mac, et attend sa réponse. */
@MainActor private func ouvrirCapture<Contenu: View>(_ fabriquer: @escaping (@escaping @MainActor (FichierChoisi?) -> Void) -> Contenu) async -> FichierChoisi? {
    await withCheckedContinuation { suite in
        let fin = FinCapture(suite)
        let contenu = fabriquer { fin.terminer($0) }
        #if os(iOS)
        guard let haut = controleurDuHaut() else {
            Messages.commun.afficher("L'écran n'a pas pu s'ouvrir. Réessayez dans un instant.", .erreur)
            fin.terminer(nil)
            return
        }
        let ecran = UIHostingController(rootView: contenu)
        ecran.modalPresentationStyle = .fullScreen
        fin.fermerEcran = { [weak ecran] in ecran?.dismiss(animated: true) }
        haut.present(ecran, animated: true)
        #else
        guard let fenetre = NSApp.keyWindow ?? NSApp.mainWindow ?? NSApp.windows.first(where: { $0.isVisible }) else {
            Messages.commun.afficher("L'écran n'a pas pu s'ouvrir. Réessayez dans un instant.", .erreur)
            fin.terminer(nil)
            return
        }
        let feuille = NSWindow(contentViewController: NSHostingController(rootView: contenu))
        fin.fermerEcran = { [weak fenetre, weak feuille] in
            if let fenetre, let feuille { fenetre.endSheet(feuille) }
        }
        fenetre.beginSheet(feuille)
        #endif
    }
}

// ─── Les autorisations ──────────────────────────────────────────────────────

private func accesMicro() async -> Bool {
    #if os(iOS)
    return await AVAudioApplication.requestRecordPermission()
    #else
    return await AVCaptureDevice.requestAccess(for: .audio)
    #endif
}

private func aUnMicro() -> Bool {
    #if os(iOS)
    return AVAudioSession.sharedInstance().isInputAvailable
    #else
    return AVCaptureDevice.default(for: .audio) != nil
    #endif
}

// ─── L'enregistrement ───────────────────────────────────────────────────────

@MainActor private final class Enregistreur: NSObject, ObservableObject, AVAudioRecorderDelegate, AVCaptureFileOutputRecordingDelegate {
    enum Etape { case preparation, pret, enCours, arret, termine }

    let video: Bool
    @Published var etape = Etape.preparation
    @Published var secondes = 0
    @Published var erreur = ""
    @Published var lecteur: AVPlayer?
    @Published var plusieursCameras = false
    let session = AVCaptureSession()
    weak var apercu: AVCaptureVideoPreviewLayer? {
        didSet { tourner() }
    }

    private let sortie = AVCaptureMovieFileOutput()
    private var entreeVideo: AVCaptureDeviceInput?
    private var boussole: AVCaptureDevice.RotationCoordinator?
    private var enregistreurSon: AVAudioRecorder?
    private var fichier: URL?
    private var horloge: Task<Void, Never>?
    private var debut = Date()
    private var fini = false
    private var abonnements = Set<AnyCancellable>()

    init(video: Bool) {
        self.video = video
        super.init()
    }

    /** Le micro et, pour une vidéo, la caméra : tout est prêt avant le premier appui. */
    func preparer() async {
        #if os(iOS)
        let audio = AVAudioSession.sharedInstance()
        do {
            try audio.setCategory(.playAndRecord, mode: video ? .videoRecording : .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
            try audio.setActive(true)
        } catch {
            erreur = "Le micro n'a pas pu être ouvert."
            return
        }
        NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)
            .receive(on: RunLoop.main)
            .sink { [weak self] avis in
                guard let brut = avis.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt, AVAudioSession.InterruptionType(rawValue: brut) == .began else { return }
                self?.arreter()
            }
            .store(in: &abonnements)
        NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.arreter() }
            .store(in: &abonnements)
        NotificationCenter.default.publisher(for: UIDevice.orientationDidChangeNotification)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.tourner() }
            .store(in: &abonnements)
        #endif
        if video {
            await preparerCamera()
        } else {
            etape = .pret
        }
    }

    private static func cameras() -> [AVCaptureDevice] {
        #if os(iOS)
        return AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInWideAngleCamera], mediaType: .video, position: .unspecified).devices
        #else
        return AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInWideAngleCamera, .external, .continuityCamera], mediaType: .video, position: .unspecified).devices
        #endif
    }

    private func preparerCamera() async {
        let cameras = Self.cameras()
        plusieursCameras = cameras.count > 1
        // L'arrière d'abord, comme le web ; sur Mac, la caméra choisie par le système.
        #if os(iOS)
        let choisie = cameras.first { $0.position == .back } ?? cameras.first
        #else
        let choisie = AVCaptureDevice.default(for: .video) ?? cameras.first
        #endif
        guard let camera = choisie, let micro = AVCaptureDevice.default(for: .audio) else {
            erreur = "La caméra n'a pas pu être ouverte."
            return
        }
        do {
            let entree = try AVCaptureDeviceInput(device: camera)
            let son = try AVCaptureDeviceInput(device: micro)
            session.beginConfiguration()
            session.sessionPreset = .high
            guard session.canAddInput(entree), session.canAddInput(son), session.canAddOutput(sortie) else {
                session.commitConfiguration()
                erreur = "La caméra n'a pas pu être ouverte."
                return
            }
            session.addInput(entree)
            session.addInput(son)
            session.addOutput(sortie)
            session.commitConfiguration()
            entreeVideo = entree
            boussole = AVCaptureDevice.RotationCoordinator(device: camera, previewLayer: apercu)
        } catch {
            erreur = "La caméra n'a pas pu être ouverte."
            return
        }
        await bougerSession(demarrer: true)
        tourner()
        etape = .pret
    }

    /** Démarrer ou arrêter une session bloque : jamais sur le fil de l'écran. */
    private func bougerSession(demarrer: Bool) async {
        let colis = Transport(valeur: session)
        await withCheckedContinuation { (suite: CheckedContinuation<Void, Never>) in
            DispatchQueue.global(qos: .userInitiated).async {
                if demarrer { colis.valeur.startRunning() } else { colis.valeur.stopRunning() }
                suite.resume()
            }
        }
    }

    /** Suit la façon dont l'appareil est tenu ; une vidéo commencée garde son sens. */
    private func tourner() {
        guard let camera = entreeVideo?.device else { return }
        if boussole == nil || boussole?.previewLayer !== apercu {
            boussole = AVCaptureDevice.RotationCoordinator(device: camera, previewLayer: apercu)
        }
        guard let boussole else { return }
        if let lien = apercu?.connection, lien.isVideoRotationAngleSupported(boussole.videoRotationAngleForHorizonLevelPreview) {
            lien.videoRotationAngle = boussole.videoRotationAngleForHorizonLevelPreview
        }
        if etape != .enCours, let lien = sortie.connection(with: .video), lien.isVideoRotationAngleSupported(boussole.videoRotationAngleForHorizonLevelCapture) {
            lien.videoRotationAngle = boussole.videoRotationAngleForHorizonLevelCapture
        }
    }

    func changerCamera() {
        guard etape == .pret, let actuelle = entreeVideo else { return }
        let toutes = Self.cameras()
        guard toutes.count > 1, let rang = toutes.firstIndex(of: actuelle.device) else { return }
        let suivante = toutes[(rang + 1) % toutes.count]
        guard let entree = try? AVCaptureDeviceInput(device: suivante) else { return }
        session.beginConfiguration()
        session.removeInput(actuelle)
        if session.canAddInput(entree) {
            session.addInput(entree)
            entreeVideo = entree
        } else {
            session.addInput(actuelle)
        }
        session.commitConfiguration()
        boussole = nil
        tourner()
    }

    func demarrer() {
        guard etape == .pret else { return }
        supprimerFichier()
        erreur = ""
        secondes = 0
        if video {
            tourner()
            // H.264 : le format que les navigateurs et Android savent lire. Le Mac l'emploie déjà.
            #if os(iOS)
            if let lien = sortie.connection(with: .video), sortie.availableVideoCodecTypes.contains(.h264) {
                sortie.setOutputSettings([AVVideoCodecKey: AVVideoCodecType.h264], for: lien)
            }
            #endif
            let url = fichierTemporaire("video", "mov")
            fichier = url
            sortie.startRecording(to: url, recordingDelegate: self)
        } else {
            let url = fichierTemporaire("audio", "m4a")
            fichier = url
            let reglages: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1, AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue]
            guard let enregistreur = try? AVAudioRecorder(url: url, settings: reglages) else {
                erreur = "Le micro n'a pas pu être ouvert."
                return
            }
            enregistreur.delegate = self
            guard enregistreur.record() else {
                erreur = "L'enregistrement n'a pas pu démarrer."
                return
            }
            enregistreurSon = enregistreur
        }
        debut = Date()
        etape = .enCours
        horloge = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(250))
                guard let self else { return }
                self.secondes = Int(Date().timeIntervalSince(self.debut))
            }
        }
    }

    func arreter() {
        guard etape == .enCours else { return }
        etape = .arret
        horloge?.cancel()
        if video { sortie.stopRecording() } else { enregistreurSon?.stop() }
    }

    /** Recommencer : le fichier d'avant s'efface, l'image de la caméra revient. */
    func recommencer() {
        guard etape == .termine else { return }
        lecteur?.pause()
        lecteur = nil
        supprimerFichier()
        secondes = 0
        etape = .pret
    }

    private func supprimerFichier() {
        if let fichier { try? FileManager.default.removeItem(at: fichier) }
        fichier = nil
    }

    private func recu(reussi: Bool) {
        guard !fini else { return }
        horloge?.cancel()
        enregistreurSon = nil
        guard reussi, let fichier, tailleDe(fichier) > 0 else {
            supprimerFichier()
            erreur = "L'enregistrement a échoué. Réessayez."
            etape = .pret
            return
        }
        lecteur = AVPlayer(url: fichier)
        etape = .termine
    }

    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        Task { @MainActor in self.recu(reussi: flag) }
    }

    nonisolated func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        Task { @MainActor in self.recu(reussi: false) }
    }

    nonisolated func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        // Une erreur peut accompagner un fichier complet : disque plein, appel reçu, durée atteinte.
        let reussi = error == nil || ((error as NSError?)?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool ?? false)
        Task { @MainActor in self.recu(reussi: reussi) }
    }

    /** Ce qui a été enregistré, gardé ; ou rien, et le fichier s'efface. */
    func conclure(garder: Bool) -> FichierChoisi? {
        guard !fini else { return nil }
        fini = true
        horloge?.cancel()
        lecteur?.pause()
        lecteur = nil
        abonnements.removeAll()
        if etape == .enCours {
            if video { sortie.stopRecording() } else { enregistreurSon?.stop() }
        }
        enregistreurSon = nil
        if video { Task { await bougerSession(demarrer: false) } }
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
        guard garder, let fichier else {
            supprimerFichier()
            return nil
        }
        return FichierChoisi(nom: fichier.lastPathComponent, taille: tailleDe(fichier), type: video ? "video" : "audio", apercu: fichier.absoluteString, mime: video ? "video/quicktime" : "audio/mp4", url: fichier)
    }
}

#if os(iOS)
private final class VueCamera: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var calque: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}

private struct ApercuCamera: UIViewRepresentable {
    let enregistreur: Enregistreur
    func makeUIView(context: Context) -> VueCamera {
        let vue = VueCamera()
        vue.calque.session = enregistreur.session
        vue.calque.videoGravity = .resizeAspect
        enregistreur.apercu = vue.calque
        return vue
    }
    func updateUIView(_ vue: VueCamera, context: Context) {}
}
#else
private final class VueCamera: NSView {
    let calque = AVCaptureVideoPreviewLayer()
    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer = calque
    }
    required init?(coder: NSCoder) { nil }
}

private struct ApercuCamera: NSViewRepresentable {
    let enregistreur: Enregistreur
    func makeNSView(context: Context) -> VueCamera {
        let vue = VueCamera()
        vue.calque.session = enregistreur.session
        vue.calque.videoGravity = .resizeAspect
        enregistreur.apercu = vue.calque
        return vue
    }
    func updateNSView(_ vue: VueCamera, context: Context) {}
}
#endif

/** Réécouter ou revoir avant de valider. */
private struct Relecture: View {
    let lecteur: AVPlayer
    let video: Bool

    private func total() -> Double {
        let d = lecteur.currentItem?.duration.seconds ?? 0
        return d.isFinite && d > 0 ? d : 0
    }

    var body: some View {
        VStack(spacing: 8) {
            if video { LecteurImageVideo(lecteur: lecteur) }
            TimelineView(.periodic(from: .now, by: 0.25)) { _ in
                let duree = total()
                let position = min(max(lecteur.currentTime().seconds, 0), max(duree, 0))
                let joue = lecteur.timeControlStatus != .paused
                HStack(spacing: 12) {
                    Button {
                        if joue { lecteur.pause(); return }
                        if duree > 0 && position >= duree - 0.05 { lecteur.seek(to: .zero) }
                        lecteur.play()
                    } label: {
                        Label(joue ? "Pause" : "Lecture", systemImage: joue ? "pause.fill" : "play.fill").labelStyle(.iconOnly).font(.title2)
                    }
                    .accessibilityIdentifier("media_lecture")
                    Slider(value: Binding(get: { position }, set: { lecteur.seek(to: CMTime(seconds: $0, preferredTimescale: 600)) }), in: 0...max(duree, 0.1))
                        .accessibilityLabel("Position")
                    Text(ecrireDuree(Int(position)) + " / " + ecrireDuree(Int(duree))).monospacedDigit().font(.footnote)
                }
            }
        }
    }
}

#if os(iOS)
private final class VueLecteur: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
}

private struct LecteurImageVideo: UIViewRepresentable {
    let lecteur: AVPlayer
    func makeUIView(context: Context) -> VueLecteur {
        let vue = VueLecteur()
        let calque = vue.layer as! AVPlayerLayer
        calque.player = lecteur
        calque.videoGravity = .resizeAspect
        return vue
    }
    func updateUIView(_ vue: VueLecteur, context: Context) {}
}
#else
private final class VueLecteur: NSView {
    let calque = AVPlayerLayer()
    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer = calque
    }
    required init?(coder: NSCoder) { nil }
}

private struct LecteurImageVideo: NSViewRepresentable {
    let lecteur: AVPlayer
    func makeNSView(context: Context) -> VueLecteur {
        let vue = VueLecteur()
        vue.calque.player = lecteur
        vue.calque.videoGravity = .resizeAspect
        return vue
    }
    func updateNSView(_ vue: VueLecteur, context: Context) {}
}
#endif

private struct BoutonCapture: View {
    let titre: String
    let icone: String
    let identifiant: String
    var couleur: Color = .accentColor
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(titre, systemImage: icone).labelStyle(.iconOnly).font(.system(size: 30)).foregroundStyle(couleur).frame(minWidth: 48, minHeight: 48).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifiant)
    }
}

private struct EcranEnregistrement: View {
    @StateObject private var enregistreur: Enregistreur
    let fermer: @MainActor (FichierChoisi?) -> Void

    init(video: Bool, fermer: @escaping @MainActor (FichierChoisi?) -> Void) {
        _enregistreur = StateObject(wrappedValue: Enregistreur(video: video))
        self.fermer = fermer
    }

    private var titre: String { enregistreur.video ? "Enregistrer une vidéo" : "Enregistrer un audio" }

    var body: some View {
        VStack(spacing: 16) {
            Text(titre).font(.headline).accessibilityAddTraits(.isHeader)
            Text(ecrireDuree(enregistreur.secondes))
                .font(.system(size: 34, weight: .medium, design: .rounded)).monospacedDigit()
                .foregroundStyle(enregistreur.etape == .enCours ? Color.red : Color.primary)
                .accessibilityLabel("Durée")
                .accessibilityValue(ecrireDuree(enregistreur.secondes))
                .accessibilityIdentifier("media_duree")
            Group {
                if enregistreur.etape == .termine, let lecteur = enregistreur.lecteur {
                    Relecture(lecteur: lecteur, video: enregistreur.video)
                } else if enregistreur.video {
                    ApercuCamera(enregistreur: enregistreur).background(Color.black).accessibilityLabel("Image de la caméra")
                } else {
                    Image(systemName: enregistreur.etape == .enCours ? "waveform" : "mic.fill").font(.system(size: 64)).foregroundStyle(.secondary).accessibilityHidden(true)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: enregistreur.video ? .infinity : nil)
            if !enregistreur.erreur.isEmpty {
                Text(enregistreur.erreur).foregroundStyle(.red).font(.footnote).accessibilityIdentifier("media_erreur")
            }
            if !enregistreur.video { Spacer(minLength: 0) }
            HStack(spacing: 28) {
                BoutonCapture(titre: "Annuler", icone: "xmark.circle", identifiant: "media_annuler", couleur: .secondary) {
                    fermer(enregistreur.conclure(garder: false))
                }
                .keyboardShortcut(.cancelAction)
                switch enregistreur.etape {
                case .preparation:
                    ProgressView().frame(minWidth: 48, minHeight: 48)
                case .pret:
                    BoutonCapture(titre: "Démarrer", icone: "record.circle", identifiant: "media_demarrer", couleur: .red) { enregistreur.demarrer() }
                    if enregistreur.video && enregistreur.plusieursCameras {
                        BoutonCapture(titre: "Changer de caméra", icone: "arrow.triangle.2.circlepath.camera", identifiant: "media_camera") { enregistreur.changerCamera() }
                    }
                case .enCours:
                    BoutonCapture(titre: "Arrêter", icone: "stop.circle.fill", identifiant: "media_arreter", couleur: .red) { enregistreur.arreter() }
                case .arret:
                    ProgressView().frame(minWidth: 48, minHeight: 48)
                case .termine:
                    BoutonCapture(titre: "Recommencer", icone: "arrow.counterclockwise.circle", identifiant: "media_recommencer") { enregistreur.recommencer() }
                    BoutonCapture(titre: "Valider", icone: "checkmark.circle.fill", identifiant: "media_valider", couleur: .green) {
                        fermer(enregistreur.conclure(garder: true))
                    }
                }
            }
        }
        .padding(20)
        #if os(macOS)
        .frame(minWidth: 520, minHeight: enregistreur.video ? 460 : 300)
        #endif
        .task { await enregistreur.preparer() }
    }
}

/** « enregistrer audio dans note », « enregistrer video dans clip ». */
@MainActor func enregistrerMedia(_ genre: String) async -> FichierChoisi? {
    let video = genre == "video"
    guard await accesMicro() else {
        Messages.commun.afficher("L'accès au micro est refusé : autorisez-le dans les réglages de l'appareil.", .erreur)
        return nil
    }
    guard aUnMicro() else {
        Messages.commun.afficher("Cet appareil n'a pas de micro.", .erreur)
        return nil
    }
    if video {
        guard await AVCaptureDevice.requestAccess(for: .video) else {
            Messages.commun.afficher("L'accès à la caméra est refusé : autorisez-le dans les réglages de l'appareil.", .erreur)
            return nil
        }
        guard AVCaptureDevice.default(for: .video) != nil else {
            Messages.commun.afficher("Cet appareil n'a pas de caméra.", .erreur)
            return nil
        }
    }
    return await ouvrirCapture { fermer in EcranEnregistrement(video: video, fermer: fermer) }
}

// ─── Le document ────────────────────────────────────────────────────────────

/** Un JPEG du système : relu ainsi, il entre tel quel dans le PDF, sans y prendre dix fois plus de place. */
private func imageCompressee(_ image: CGImage, qualite: Double) -> (donnees: Data, image: CGImage)? {
    let donnees = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(donnees, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
    CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: qualite] as CFDictionary)
    guard CGImageDestinationFinalize(destination), let source = CGImageSourceCreateWithData(donnees, nil), let relue = CGImageSourceCreateImageAtIndex(source, 0, nil) else { return nil }
    return (donnees as Data, relue)
}

/** Les pages, dans un PDF ; chaque page garde les proportions de son image, à la taille d'un A4. */
private func pdfDepuisImages(_ images: [CGImage]) -> URL? {
    let url = fichierTemporaire("document", "pdf")
    guard let contexte = CGContext(url as CFURL, mediaBox: nil, nil) else { return nil }
    for image in images {
        guard let page = imageCompressee(image, qualite: 0.8)?.image else { continue }
        let echelle = 842.0 / Double(max(page.width, page.height))
        var cadre = CGRect(x: 0, y: 0, width: Double(page.width) * echelle, height: Double(page.height) * echelle)
        contexte.beginPage(mediaBox: &cadre)
        contexte.draw(page, in: cadre)
        contexte.endPage()
    }
    contexte.closePDF()
    return tailleDe(url) > 0 ? url : nil
}

/** L'image de la première page : c'est ce que « apercu » montre. */
private func apercuDe(_ image: CGImage) -> URL? {
    guard let vignette = reduire(image, 1200), let jpeg = imageCompressee(vignette, qualite: 0.8) else { return nil }
    let url = fichierTemporaire("document-apercu", "jpg")
    return (try? jpeg.donnees.write(to: url)) != nil ? url : nil
}

private func reduire(_ image: CGImage, _ cote: Int) -> CGImage? {
    let plus = max(image.width, image.height)
    guard plus > cote else { return image }
    let largeur = image.width * cote / plus
    let hauteur = image.height * cote / plus
    guard let contexte = CGContext(data: nil, width: largeur, height: hauteur, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    contexte.interpolationQuality = .high
    contexte.draw(image, in: CGRect(x: 0, y: 0, width: largeur, height: hauteur))
    return contexte.makeImage()
}

@MainActor private func documentDepuisImages(_ images: [CGImage]) -> FichierChoisi? {
    guard let premiere = images.first, let pdf = pdfDepuisImages(images) else {
        Messages.commun.afficher("Le document n'a pas pu être écrit.", .erreur)
        return nil
    }
    return FichierChoisi(nom: pdf.lastPathComponent, taille: tailleDe(pdf), type: "pdf", apercu: apercuDe(premiere)?.absoluteString, mime: "application/pdf", url: pdf)
}

#if os(iOS)
@MainActor private final class DelegueDocument: NSObject, @preconcurrency VNDocumentCameraViewControllerDelegate {
    private var fin: (([CGImage]?) -> Void)?
    init(fin: @escaping ([CGImage]?) -> Void) { self.fin = fin }

    private func terminer(_ ecran: VNDocumentCameraViewController, _ pages: [CGImage]?) {
        ecran.dismiss(animated: true)
        fin?(pages)
        fin = nil
    }

    func documentCameraViewController(_ ecran: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        terminer(ecran, (0..<scan.pageCount).compactMap { imageDroite(scan.imageOfPage(at: $0)) })
    }

    func documentCameraViewControllerDidCancel(_ ecran: VNDocumentCameraViewController) {
        terminer(ecran, nil)
    }

    func documentCameraViewController(_ ecran: VNDocumentCameraViewController, didFailWithError error: Error) {
        Messages.commun.afficher("Le scan a échoué. Réessayez.", .erreur)
        terminer(ecran, nil)
    }
}

/** Une image du système, redressée : une CGImage ne connaît pas le sens de la photo. */
private func imageDroite(_ image: UIImage) -> CGImage? {
    if image.imageOrientation == .up, let directe = image.cgImage { return directe }
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    return UIGraphicsImageRenderer(size: image.size, format: format).image { _ in image.draw(at: .zero) }.cgImage
}

@MainActor private var delegueDocument: DelegueDocument?
#endif

/** « scanner document dans facture » : un PDF, et l'image de sa première page en aperçu. */
@MainActor func scannerDocument() async -> FichierChoisi? {
    #if os(iOS)
    guard VNDocumentCameraViewController.isSupported else {
        Messages.commun.afficher("Cet appareil ne peut pas scanner de document.", .erreur)
        return nil
    }
    guard await AVCaptureDevice.requestAccess(for: .video) else {
        Messages.commun.afficher("L'accès à la caméra est refusé : autorisez-le dans les réglages de l'appareil.", .erreur)
        return nil
    }
    guard let haut = controleurDuHaut() else {
        Messages.commun.afficher("L'écran n'a pas pu s'ouvrir. Réessayez dans un instant.", .erreur)
        return nil
    }
    let pages: [CGImage]? = await withCheckedContinuation { suite in
        let ecran = VNDocumentCameraViewController()
        let delegue = DelegueDocument { valeur in
            delegueDocument = nil
            suite.resume(returning: valeur)
        }
        delegueDocument = delegue
        ecran.delegate = delegue
        haut.present(ecran, animated: true)
    }
    guard let pages, !pages.isEmpty else { return nil }
    return documentDepuisImages(pages)
    #else
    // Le Mac n'a pas de scanner intégré : une image ou un PDF déjà là, rendu sous la même forme.
    let panneau = NSOpenPanel()
    panneau.allowedContentTypes = [.pdf, .image]
    panneau.allowsMultipleSelection = true
    panneau.message = "Choisissez les pages du document."
    guard panneau.runModal() == .OK, !panneau.urls.isEmpty else { return nil }
    if panneau.urls.count == 1, let url = panneau.urls.first, UTType(filenameExtension: url.pathExtension)?.conforms(to: .pdf) == true {
        return documentDepuisPdf(url)
    }
    let images = panneau.urls.compactMap(imageOrientee)
    guard images.count == panneau.urls.count else {
        Messages.commun.afficher("Une des pages ne peut pas être ouverte.", .erreur)
        return nil
    }
    return documentDepuisImages(images)
    #endif
}

#if os(macOS)
@MainActor private func documentDepuisPdf(_ origine: URL) -> FichierChoisi? {
    let copie = fichierTemporaire("document", "pdf")
    guard (try? FileManager.default.copyItem(at: origine, to: copie)) != nil, let pdf = CGPDFDocument(copie as CFURL), let page = pdf.page(at: 1) else {
        Messages.commun.afficher("Ce PDF ne peut pas être ouvert.", .erreur)
        return nil
    }
    let cadre = page.getBoxRect(.mediaBox)
    let echelle = 1200.0 / max(cadre.width, cadre.height)
    var apercu: URL?
    if let contexte = CGContext(data: nil, width: Int(cadre.width * echelle), height: Int(cadre.height * echelle), bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
        contexte.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        contexte.fill(CGRect(x: 0, y: 0, width: contexte.width, height: contexte.height))
        contexte.scaleBy(x: echelle, y: echelle)
        contexte.translateBy(x: -cadre.minX, y: -cadre.minY)
        contexte.drawPDFPage(page)
        if let image = contexte.makeImage() { apercu = apercuDe(image) }
    }
    return FichierChoisi(nom: origine.lastPathComponent, taille: tailleDe(copie), type: "pdf", apercu: apercu?.absoluteString, mime: "application/pdf", url: copie)
}
#endif

// ─── Le recadrage ───────────────────────────────────────────────────────────

/** L'image telle qu'on la voit : ImageIO applique le sens enregistré par l'appareil photo. */
private func imageOrientee(_ url: URL) -> CGImage? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let proprietes = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let largeur = proprietes[kCGImagePropertyPixelWidth] as? Int,
          let hauteur = proprietes[kCGImagePropertyPixelHeight] as? Int else { return nil }
    let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: max(largeur, hauteur),
    ]
    return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
}

private struct EcranRecadrage: View {
    let image: CGImage
    let origine: FichierChoisi
    let fermer: @MainActor (FichierChoisi?) -> Void

    private enum Prise { case nouvelle(CGPoint), deplacement(CGRect), coin(Int, CGRect) }

    /** La zone gardée, de 0 à 1 dans l'image. */
    @State private var zone = CGRect(x: 0, y: 0, width: 1, height: 1)
    @State private var prise: Prise?
    @State private var erreur = ""

    private func cadre(dans taille: CGSize) -> CGRect {
        let e = min(taille.width / CGFloat(image.width), taille.height / CGFloat(image.height))
        let l = CGFloat(image.width) * e
        let h = CGFloat(image.height) * e
        return CGRect(x: (taille.width - l) / 2, y: (taille.height - h) / 2, width: l, height: h)
    }

    private func enVue(_ cadre: CGRect) -> CGRect {
        CGRect(x: cadre.minX + zone.minX * cadre.width, y: cadre.minY + zone.minY * cadre.height, width: zone.width * cadre.width, height: zone.height * cadre.height)
    }

    private func coins(_ r: CGRect) -> [CGPoint] {
        [CGPoint(x: r.minX, y: r.minY), CGPoint(x: r.maxX, y: r.minY), CGPoint(x: r.minX, y: r.maxY), CGPoint(x: r.maxX, y: r.maxY)]
    }

    private func borne(_ v: CGFloat) -> CGFloat { min(max(v, 0), 1) }

    private func normal(_ p: CGPoint, _ cadre: CGRect) -> CGPoint {
        CGPoint(x: borne((p.x - cadre.minX) / cadre.width), y: borne((p.y - cadre.minY) / cadre.height))
    }

    private func prendre(_ p: CGPoint, _ cadre: CGRect) {
        let vue = enVue(cadre)
        if let rang = coins(vue).firstIndex(where: { hypot($0.x - p.x, $0.y - p.y) < 32 }) {
            prise = .coin(rang, zone)
        } else if vue.contains(p) && zone != CGRect(x: 0, y: 0, width: 1, height: 1) {
            prise = .deplacement(zone)
        } else {
            prise = .nouvelle(normal(p, cadre))
        }
    }

    private func suivre(_ depart: CGPoint, _ p: CGPoint, _ cadre: CGRect) {
        if prise == nil { prendre(depart, cadre) }
        let n = normal(p, cadre)
        let minimum: CGFloat = 0.03
        switch prise {
        case .nouvelle(let a):
            zone = CGRect(x: min(a.x, n.x), y: min(a.y, n.y), width: abs(a.x - n.x), height: abs(a.y - n.y))
        case .deplacement(let z):
            let dx = (p.x - depart.x) / cadre.width
            let dy = (p.y - depart.y) / cadre.height
            zone = CGRect(x: min(max(z.minX + dx, 0), 1 - z.width), y: min(max(z.minY + dy, 0), 1 - z.height), width: z.width, height: z.height)
        case .coin(let rang, let z):
            let gauche = rang % 2 == 0 ? min(n.x, z.maxX - minimum) : z.minX
            let droite = rang % 2 == 1 ? max(n.x, z.minX + minimum) : z.maxX
            let haut = rang < 2 ? min(n.y, z.maxY - minimum) : z.minY
            let bas = rang >= 2 ? max(n.y, z.minY + minimum) : z.maxY
            zone = CGRect(x: gauche, y: haut, width: droite - gauche, height: bas - haut)
        case nil:
            break
        }
    }

    /** VoiceOver : un balayage vers le haut ou le bas resserre ou élargit la zone autour de son centre. */
    private func ajuster(_ pas: CGFloat) {
        let l = min(max(zone.width + pas, 0.05), 1)
        let h = min(max(zone.height + pas, 0.05), 1)
        let x = min(max(zone.midX - l / 2, 0), 1 - l)
        let y = min(max(zone.midY - h / 2, 0), 1 - h)
        zone = CGRect(x: x, y: y, width: l, height: h)
    }

    private func valider() {
        let rect = CGRect(x: zone.minX * CGFloat(image.width), y: zone.minY * CGFloat(image.height), width: zone.width * CGFloat(image.width), height: zone.height * CGFloat(image.height)).integral.intersection(CGRect(x: 0, y: 0, width: image.width, height: image.height))
        guard rect.width >= 2, rect.height >= 2 else {
            erreur = "Tracez une zone à conserver."
            return
        }
        guard let coupee = image.cropping(to: rect) else {
            erreur = "Le recadrage a échoué."
            return
        }
        let png = origine.mime == "image/png"
        let base = (origine.nom as NSString).deletingPathExtension
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true).appendingPathComponent((base.isEmpty ? "photo" : base) + "-recadree." + (png ? "png" : "jpg"))
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, (png ? UTType.png : UTType.jpeg).identifier as CFString, 1, nil) else {
            erreur = "Le recadrage a échoué."
            return
        }
        CGImageDestinationAddImage(destination, coupee, png ? nil : [kCGImageDestinationLossyCompressionQuality: 0.92] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else {
            erreur = "Le recadrage a échoué."
            return
        }
        fermer(FichierChoisi(nom: url.lastPathComponent, taille: tailleDe(url), type: "image", apercu: url.absoluteString, mime: png ? "image/png" : "image/jpeg", url: url))
    }

    var body: some View {
        VStack(spacing: 12) {
            Text("Recadrer la photo").font(.headline).accessibilityAddTraits(.isHeader)
            Text("Tracez un rectangle, ou tirez ses coins.").font(.footnote).foregroundStyle(.secondary)
            GeometryReader { geo in
                let c = cadre(dans: geo.size)
                let vue = enVue(c)
                ZStack(alignment: .topLeading) {
                    Image(decorative: image, scale: 1).resizable().frame(width: c.width, height: c.height).position(x: c.midX, y: c.midY)
                    Path { p in
                        p.addRect(c)
                        p.addRect(vue)
                    }
                    .fill(Color.black.opacity(0.5), style: FillStyle(eoFill: true))
                    Path { $0.addRect(vue) }.stroke(Color.white, lineWidth: 2)
                    ForEach(Array(coins(vue).enumerated()), id: \.offset) { _, coin in
                        Circle().fill(Color.white).frame(width: 18, height: 18).shadow(radius: 1).position(coin)
                    }
                }
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 1)
                        .onChanged { suivre($0.startLocation, $0.location, c) }
                        .onEnded { _ in prise = nil }
                )
                .accessibilityElement()
                .accessibilityLabel("Zone de recadrage")
                .accessibilityValue("\(Int(zone.width * 100)) % de la largeur, \(Int(zone.height * 100)) % de la hauteur")
                .accessibilityAdjustableAction { sens in
                    if sens == .increment { ajuster(0.05) } else if sens == .decrement { ajuster(-0.05) }
                }
                .accessibilityIdentifier("media_zone")
            }
            if !erreur.isEmpty {
                Text(erreur).foregroundStyle(.red).font(.footnote).accessibilityIdentifier("media_erreur")
            }
            HStack(spacing: 28) {
                BoutonCapture(titre: "Annuler", icone: "xmark.circle", identifiant: "media_annuler", couleur: .secondary) { fermer(nil) }
                    .keyboardShortcut(.cancelAction)
                BoutonCapture(titre: "Valider", icone: "checkmark.circle.fill", identifiant: "media_valider", couleur: .green) { valider() }
            }
        }
        .padding(20)
        #if os(macOS)
        .frame(minWidth: 620, minHeight: 520)
        #endif
    }
}

/** « recadrer photo » : la variable reçoit l'image recadrée ; annuler la laisse telle quelle. */
@MainActor func recadrerPhoto(_ fichier: FichierChoisi?) async -> FichierChoisi? {
    guard let fichier, fichier.mime.hasPrefix("image/") else {
        Messages.commun.afficher("La variable ne contient pas une image à recadrer.", .erreur)
        return nil
    }
    guard let image = imageOrientee(fichier.url) else {
        Messages.commun.afficher("L'image ne peut pas être ouverte.", .erreur)
        return nil
    }
    return await ouvrirCapture { fermer in EcranRecadrage(image: image, origine: fichier, fermer: fermer) }
}
#else
// Une extension, la montre ou la télévision n'ont ni caméra ni fenêtre pour cela : l'action ne change rien.
@MainActor func enregistrerMedia(_ genre: String) async -> FichierChoisi? { nil }
@MainActor func scannerDocument() async -> FichierChoisi? { nil }
@MainActor func recadrerPhoto(_ fichier: FichierChoisi?) async -> FichierChoisi? { nil }
#endif
`;
