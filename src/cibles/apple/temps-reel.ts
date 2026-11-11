/**
 * Les réunions sur Apple (iPhone, iPad, Mac), par le SDK LiveKit pour Swift. La barre (micro, caméra, écran, main)
 * s'écrit en Humalis ; ici, l'image des participants et les gestes, comme src/cibles/moteur/temps-reel.ts sur le web.
 */
import type { Application } from '../../ri/types.js';
import type { PaquetSwift } from './xcode.js';

/** Version publiée le 27 octobre 2026, épinglée : aucune mise à jour sans qu'on la décide. */
export const PAQUET_LIVEKIT: PaquetSwift = { adresse: 'https://github.com/livekit/client-sdk-swift', version: '2.19.0', produit: 'LiveKit', exacte: true };

export const avecReunion = (application: Application): boolean => JSON.stringify([application.ecrans, application.composants]).includes('"type":"gesteReunion"');

export const REUNION_SWIFT = String.raw`// Produit par Humalis : la réunion en cours, par LiveKit.
import AVFoundation
import LiveKit
import SwiftUI

/** Ce que le serveur rend pour entrer dans une salle : l'adresse de LiveKit et un jeton à durée limitée. */
private struct AccesSalle: Decodable {
    let adresse: String
    let jeton: String
    let video: Bool
}

/** Une image de la grille : la caméra ou l'écran d'une personne. */
struct TuileReunion: Identifiable {
    let id: String
    let nom: String
    let piste: VideoTrack?
    let main: Bool
    let microCoupe: Bool
    let locale: Bool
}

@MainActor @Observable final class Reunion {
    static let commun = Reunion()

    private(set) var tuiles: [TuileReunion] = []
    private var salle = ""
    @ObservationIgnored private var piece: Room?
    @ObservationIgnored private var relais: Relais?

    /** Les nouvelles de LiveKit arrivent sur un autre fil : elles redessinent la grille sur celui de l'interface. */
    private final class Relais: RoomDelegate, @unchecked Sendable {
        weak var reunion: Reunion?
        init(_ reunion: Reunion) { self.reunion = reunion }
        private func changer(annoncer: Bool = false) {
            Task { @MainActor [weak reunion] in
                reunion?.dessiner()
                if annoncer { reunion?.annoncer() }
            }
        }
        func room(_ room: Room, participantDidConnect participant: RemoteParticipant) { changer() }
        func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) { changer() }
        func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) { changer() }
        func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) { changer() }
        func room(_ room: Room, participant: LocalParticipant, didPublishTrack publication: LocalTrackPublication) { changer() }
        func room(_ room: Room, participant: LocalParticipant, didUnpublishTrack publication: LocalTrackPublication) { changer() }
        // Une personne qui anime coupe ce micro : la page l'apprend par le serveur.
        func room(_ room: Room, participant: Participant, trackPublication: TrackPublication, didUpdateIsMuted isMuted: Bool) { changer(annoncer: participant is LocalParticipant) }
        func room(_ room: Room, participant: Participant, didUpdateAttributes attributes: [String: String]) { changer() }
        func room(_ room: Room, didDisconnectWithError error: LiveKitError?) {
            Task { @MainActor [weak reunion] in
                guard let reunion, reunion.piece === room else { return }
                reunion.piece = nil
                reunion.dessiner()
                if error != nil { Messages.commun.afficher("Vous n'êtes plus dans la réunion.", .avertissement) }
            }
        }
    }

    fileprivate func dessiner() {
        guard let piece else {
            tuiles = []
            return
        }
        var lues: [TuileReunion] = []
        let tous: [Participant] = [piece.localParticipant] + piece.remoteParticipants.values.sorted { ($0.name ?? "") < ($1.name ?? "") }
        for p in tous {
            let nom = (p.name?.isEmpty == false ? p.name : p.identity?.stringValue) ?? "?"
            let locale = p is LocalParticipant
            let main = p.attributes["main"] == "1"
            let microCoupe = !p.isMicrophoneEnabled()
            if let ecran = p.firstScreenShareVideoTrack {
                lues.append(TuileReunion(id: (p.identity?.stringValue ?? nom) + ":ecran", nom: nom, piste: ecran, main: main, microCoupe: microCoupe, locale: false))
            }
            let camera = p.isCameraEnabled() ? p.firstCameraVideoTrack : nil
            lues.append(TuileReunion(id: (p.identity?.stringValue ?? nom) + ":camera", nom: nom, piste: camera, main: main, microCoupe: microCoupe, locale: locale))
        }
        tuiles = lues
    }

    fileprivate func annoncer() {
        guard !salle.isEmpty else { return }
        let nom = salle
        Task { _ = await Serveur.commun.appelReussi("/api/salles_geste", envoi: ["salle": .texte(nom), "participant": .texte(""), "geste": .texte("etat")]) }
    }

    private func essayer(_ action: @escaping (LocalParticipant) async throws -> Void) async {
        guard let piece else { return }
        do {
            try await action(piece.localParticipant)
        } catch {
            Messages.commun.afficher("La caméra, le micro ou l'écran n'ont pas pu changer : vérifiez les autorisations dans les réglages.", .erreur)
        }
        dessiner()
        annoncer()
    }

    func rejoindre(_ nom: String) async {
        if piece != nil && salle == nom { return }
        await quitter()
        let acces: AccesSalle
        do {
            guard let lu = try await Serveur.commun.appel("/api/salles_jeton", comme: AccesSalle.self, methode: "POST", envoi: ["salle": .texte(nom)]) else { return }
            acces = lu
        } catch {
            Messages.commun.afficher((error as? ErreurHumalis)?.errorDescription ?? "La réunion n'a pas pu commencer.", .erreur)
            return
        }
        // Les autorisations avant la connexion : une fois le son des autres lancé,
        // passer le moteur audio en enregistrement échoue.
        let micro = await AVCaptureDevice.requestAccess(for: .audio)
        let camera = acces.video ? await AVCaptureDevice.requestAccess(for: .video) : false
        if !micro { Messages.commun.afficher("Le micro est refusé : autorisez-le dans les réglages pour parler.", .avertissement) }
        if acces.video && !camera { Messages.commun.afficher("La caméra est refusée : autorisez-la dans les réglages pour être vu.", .avertissement) }
        // Le micro est préparé avant d'entrer : le moteur audio démarre d'emblée en lecture et enregistrement.
        if micro { try? await AudioManager.shared.setRecordingAlwaysPreparedMode(true) }
        let relais = Relais(self)
        let nouvelle = Room(delegate: relais, roomOptions: RoomOptions(adaptiveStream: false, dynacast: true))
        self.relais = relais
        piece = nouvelle
        salle = nom
        do {
            try await nouvelle.connect(url: acces.adresse, token: acces.jeton)
        } catch {
            piece = nil
            salle = ""
            Messages.commun.afficher("La réunion n'a pas pu commencer : le serveur des réunions ne répond pas.", .erreur)
            return
        }
        // Le micro et la caméra séparément : une caméra absente ou occupée n'empêche pas de parler.
        if micro {
            do { try await nouvelle.localParticipant.setMicrophone(enabled: true) } catch { print("Réunion, micro :", error); Messages.commun.afficher("Le micro n'a pas pu démarrer.", .erreur) }
        }
        if camera {
            do { try await nouvelle.localParticipant.setCamera(enabled: true) } catch { print("Réunion, caméra :", error); Messages.commun.afficher("La caméra n'a pas pu démarrer.", .erreur) }
        }
        dessiner()
        annoncer()
    }

    func quitter() async {
        let ancienne = piece
        let ancienneSalle = salle
        piece = nil
        salle = ""
        tuiles = []
        guard let ancienne else { return }
        await ancienne.disconnect()
        // Hors réunion, le micro n'est plus préparé : le témoin orange s'éteint.
        try? await AudioManager.shared.setRecordingAlwaysPreparedMode(false)
        _ = await Serveur.commun.appelReussi("/api/salles_geste", envoi: ["salle": .texte(ancienneSalle), "participant": .texte(""), "geste": .texte("etat")])
    }

    func couperMicro() async { await essayer { try await $0.setMicrophone(enabled: false) } }
    func activerMicro() async { await essayer { try await $0.setMicrophone(enabled: true) } }
    func couperCamera() async { await essayer { try await $0.setCamera(enabled: false) } }
    func activerCamera() async { await essayer { try await $0.setCamera(enabled: true) } }
    func partagerEcran() async { await essayer { try await $0.setScreenShare(enabled: true) } }
    func arreterPartage() async { await essayer { try await $0.setScreenShare(enabled: false) } }
    func leverMain() async { await essayer { try await $0.set(attributes: ["main": "1"]) } }
    func baisserMain() async { await essayer { try await $0.set(attributes: ["main": "0"]) } }
}

/** « reunion "…" » : les images des participants, en grille. */
struct ReunionVue: View {
    private var reunion = Reunion.commun
    private let colonnes = [GridItem(.adaptive(minimum: 160), spacing: 8)]

    var body: some View {
        LazyVGrid(columns: colonnes, spacing: 8) {
            ForEach(reunion.tuiles) { tuile in
                ZStack(alignment: .bottomLeading) {
                    Rectangle().fill(Color(white: 0.11))
                    if let piste = tuile.piste {
                        SwiftUIVideoView(piste, layoutMode: .fill, mirrorMode: tuile.locale ? .mirror : .off)
                    } else {
                        Text(String(tuile.nom.prefix(1)).uppercased())
                            .font(.system(size: 40))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                    Text(tuile.nom + (tuile.main ? " ✋" : "") + (tuile.microCoupe ? " (micro coupé)" : ""))
                        .font(.footnote)
                        .foregroundStyle(.white)
                        .shadow(radius: 2)
                        .padding(8)
                }
                .aspectRatio(16 / 9, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .accessibilityElement(children: .combine)
            }
        }
    }
}
`;
