/**
 * La cible Apple des données sur l'appareil, des clés d'accès et de la double authentification.
 * Le portage fidèle de src/cibles/commun/donnees-comptes-web.ts : une vraie base SQLite (la bibliothèque
 * du système), chiffrée avec CryptoKit et une clé gardée au Keychain, la même file et la même
 * synchronisation, l'écran du code à six chiffres et les clés d'accès du système.
 */
import type { Application, Etat } from '../../ri/types.js';
import { chaineSwift, cleJson, nomSwift } from './noms.js';
import type { Types } from './valeurs.js';

export const avecDonneesLocales = (application: Application): boolean => application.partages.some((p) => p.locale);
export const avecCompteSecurise = (application: Application): boolean => application.serveurs.some((s) => s.doubleAuthentification || s.connexionCleAcces);
export const avecClesAcces = (application: Application): boolean => application.serveurs.some((s) => s.connexionCleAcces);

/** Une fiche d'une donnée locale porte son identifiant, comme toute ligne de la base. */
export function identifierFichesLocales(application: Application, types: Types): void {
  for (const p of application.partages) if (p.locale && p.type.genre === 'liste') types.identifierFiche(p.type.de);
}

/** Le domaine des clés d'accès, tiré de l'adresse du serveur ; une adresse http:// n'en a pas. */
export function domaineDesCles(serveur: string | undefined): string | undefined {
  if (!serveur || !/^https:\/\//i.test(serveur)) return undefined;
  try {
    return new URL(serveur).hostname;
  } catch {
    return undefined;
  }
}

function reglagesLocale(application: Application, etat: Etat, cle: string): string {
  const locale = etat.locale!;
  const adresse = locale.synchronisee?.replace(/^\/+/, '');
  const lue = application.serveurs.flatMap((s) => s.routes).find((r) => r.adresse.replace(/^\/+/, '') === adresse);
  const champs = locale.champs.map((c) => chaineSwift(cleJson(c.nom)));
  return `.init(cle: ${chaineSwift(cle)}, nom: ${chaineSwift(nomSwift(etat.nom))}, chiffree: ${locale.chiffree}, champs: [${champs.join(', ')}], route: ${adresse !== undefined ? chaineSwift(`/api/${adresse}`) : 'nil'}, publique: ${lue?.droits.lire === 'tout_le_monde'})`;
}

/** Humalis/Locales.swift : les données locales de ce programme, reliées à leurs listes partagées. */
export function localesDuProgramme(application: Application, types: Types, cle: string): string {
  const locales = application.partages.filter((p) => p.locale && p.type.genre === 'liste');
  const lignes = locales.map((p) => {
    const nom = nomSwift(p.nom);
    const type = p.type.genre === 'liste' ? types.swift(p.type.de) : 'ValeurHumalis';
    return `    static let ${nom} = DonneeLocaleHumalis(
        reglages: ${reglagesLocale(application, p, cle)},
        lire: { ValeurHumalis(Partage.commun.${nom}).enListe },
        ecrire: { Partage.commun.${nom} = ValeurHumalis.liste($0).converti(sinon: Partage.commun.${nom}) },
        normaliser: { ValeurHumalis(ValeurHumalis.fiche($0).converti(sinon: ${type}())) }
    )`;
  });
  return `// Produit par Humalis : les données locales de ce programme, reliées à leurs listes partagées.
import Foundation

@MainActor enum LocalesHumalis {
${lignes.join('\n')}

    /** Au lancement de l'application : les bases s'ouvrent, et la synchronisation commence. */
    static func demarrerHumalis() {
        DonneeLocaleHumalis.demarrerToutes([${locales.map((p) => nomSwift(p.nom)).join(', ')}])
    }
}
`;
}

/** Ce que le LISEZMOI du projet dit de ces fonctions. */
export function lisezmoiDonneesComptes(application: Application, identifiant: string, equipe: string | undefined, domaine: string | undefined): string {
  const lignes: string[] = [];
  if (avecDonneesLocales(application)) lignes.push("- Les données locales sont dans une base SQLite du dossier de l'application (`Application Support/humalis/locales`), une par compte quand elles sont synchronisées. Avec `avec chiffree`, chaque contenu est chiffré en AES-256-GCM ; la clé reste au Keychain de cet appareil, et la base n'entre pas dans les sauvegardes.");
  if (avecClesAcces(application)) {
    lignes.push(domaine && equipe
      ? `- Les clés d'accès : le droit \`webcredentials:${domaine}\` est dans les droits de l'application. Réglez sur le serveur \`WEBAUTHN_ALLOWED_ORIGINS=https://${domaine}\` et \`WEBAUTHN_APPLE_APP=${equipe}.${identifiant}\` : il sert alors \`/.well-known/apple-app-site-association\`, qu'Apple doit pouvoir lire en https sur \`${domaine}\`.`
      : "- Les clés d'accès demandent une adresse de serveur en https (`--serveur https://…`) et une équipe (`--equipe`) : sans elles, le système refuse de les créer, et l'application le dit à la personne.");
  }
  return lignes.length ? `\n## Données et comptes\n\n${lignes.join('\n')}\n` : '';
}

/** Humalis/DonneesLocales.swift */
export const DONNEES_LOCALES_SWIFT = String.raw`// Produit par Humalis : une donnée locale, une vraie base sur l'appareil, et sa synchronisation.
import CryptoKit
import Foundation
import Network
import SQLite3
import Security
import SwiftUI

typealias ValeursFicheHumalis = [String: ValeurHumalis]

private let tailleDuLot = 100
private let attenteEcriture = 0.4
private let repriseMinimum = 2.0
private let repriseMaximum = 300.0
private let veilleSynchro = 60.0

struct FicheBaseHumalis: Sendable {
    let id: String
    let ordre: Int
    let valeurs: ValeursFicheHumalis
}

/** Une ligne de la file d'envoi : la dernière modification d'une fiche. */
struct LigneFileHumalis: Sendable {
    let id: String
    let operation: String
    let modifieLe: Double
    let supprime: Bool
    let creation: Bool
    let valeurs: ValeursFicheHumalis?
}

struct ContenuBaseHumalis: Sendable {
    let fiches: [FicheBaseHumalis]
    let file: [LigneFileHumalis]
    let curseur: Double
}

struct EcrituresBaseHumalis: Sendable {
    var fiches: [FicheBaseHumalis] = []
    var retirees: [String] = []
    var file: [LigneFileHumalis] = []
    var envoyees: [String] = []
    var curseur: Double?

    var estVide: Bool { fiches.isEmpty && retirees.isEmpty && file.isEmpty && envoyees.isEmpty && curseur == nil }
}

protocol BaseHumalis: Sendable {
    func lire() async throws -> ContenuBaseHumalis
    func appliquer(_ ecritures: EcrituresBaseHumalis) async throws
}

enum ErreurBaseHumalis: Error {
    case sqlite(String)
    case coffre(OSStatus)
    case illisible
}

/** La base : SQLite du système, chiffrée contenu par contenu si la donnée est « avec chiffree ». */
actor BaseSQLiteHumalis: BaseHumalis {
    private nonisolated(unsafe) let db: OpaquePointer
    private let cle: SymmetricKey?

    init(fichier: URL, cle: SymmetricKey?) throws {
        var ouverte: OpaquePointer?
        let code = sqlite3_open_v2(fichier.path, &ouverte, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil)
        guard code == SQLITE_OK, let ouverte else {
            if let ouverte { sqlite3_close(ouverte) }
            throw ErreurBaseHumalis.sqlite("ouverture : \(code)")
        }
        sqlite3_busy_timeout(ouverte, 5000)
        do {
            try BaseSQLiteHumalis.executer(ouverte, """
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = FULL;
            CREATE TABLE IF NOT EXISTS fiches (id TEXT PRIMARY KEY, ordre INTEGER NOT NULL, contenu BLOB NOT NULL) WITHOUT ROWID;
            CREATE TABLE IF NOT EXISTS file (id TEXT PRIMARY KEY, operation TEXT NOT NULL, modifieLe INTEGER NOT NULL, supprime INTEGER NOT NULL, creation INTEGER NOT NULL, contenu BLOB) WITHOUT ROWID;
            CREATE TABLE IF NOT EXISTS meta (seule INTEGER PRIMARY KEY CHECK (seule = 1), curseur INTEGER NOT NULL);
            """)
        } catch {
            sqlite3_close(ouverte)
            throw error
        }
        self.db = ouverte
        self.cle = cle
    }

    deinit { sqlite3_close(db) }

    private static func executer(_ db: OpaquePointer, _ sql: String) throws {
        guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else { throw ErreurBaseHumalis.sqlite(String(cString: sqlite3_errmsg(db))) }
    }

    private func preparer(_ sql: String) throws -> OpaquePointer {
        var requete: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &requete, nil) == SQLITE_OK, let requete else { throw ErreurBaseHumalis.sqlite(String(cString: sqlite3_errmsg(db))) }
        return requete
    }

    private func lier(_ requete: OpaquePointer, _ rang: Int32, _ texte: String) {
        sqlite3_bind_text(requete, rang, texte, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    }

    private func lier(_ requete: OpaquePointer, _ rang: Int32, _ octets: Data?) {
        guard let octets else { sqlite3_bind_null(requete, rang); return }
        octets.withUnsafeBytes { _ = sqlite3_bind_blob(requete, rang, $0.baseAddress, Int32($0.count), unsafeBitCast(-1, to: sqlite3_destructor_type.self)) }
    }

    private func finir(_ requete: OpaquePointer) throws {
        defer { sqlite3_finalize(requete) }
        guard sqlite3_step(requete) == SQLITE_DONE else { throw ErreurBaseHumalis.sqlite(String(cString: sqlite3_errmsg(db))) }
    }

    private func octets(_ requete: OpaquePointer, _ colonne: Int32) -> Data? {
        guard let debut = sqlite3_column_blob(requete, colonne) else { return nil }
        return Data(bytes: debut, count: Int(sqlite3_column_bytes(requete, colonne)))
    }

    private func texte(_ requete: OpaquePointer, _ colonne: Int32) -> String {
        sqlite3_column_text(requete, colonne).map { String(cString: $0) } ?? ""
    }

    /** AES-256-GCM, l'identifiant de la fiche en données associées : un contenu ne peut pas changer de fiche. */
    private func sceller(_ id: String, _ valeurs: ValeursFicheHumalis) throws -> Data {
        let encodeur = JSONEncoder()
        encodeur.outputFormatting = .sortedKeys
        let clair = try encodeur.encode(valeurs)
        guard let cle else { return clair }
        guard let tout = try AES.GCM.seal(clair, using: cle, authenticating: Data(id.utf8)).combined else { throw ErreurBaseHumalis.illisible }
        return tout
    }

    private func ouvrir(_ id: String, _ contenu: Data) throws -> ValeursFicheHumalis {
        var clair = contenu
        if let cle { clair = try AES.GCM.open(AES.GCM.SealedBox(combined: contenu), using: cle, authenticating: Data(id.utf8)) }
        return try JSONDecoder().decode(ValeursFicheHumalis.self, from: clair)
    }

    func lire() throws -> ContenuBaseHumalis {
        var fiches: [FicheBaseHumalis] = []
        var file: [LigneFileHumalis] = []
        var curseur = 0.0
        let lesFiches = try preparer("SELECT id, ordre, contenu FROM fiches ORDER BY ordre")
        defer { sqlite3_finalize(lesFiches) }
        while sqlite3_step(lesFiches) == SQLITE_ROW {
            let id = texte(lesFiches, 0)
            guard let contenu = octets(lesFiches, 2) else { throw ErreurBaseHumalis.illisible }
            fiches.append(FicheBaseHumalis(id: id, ordre: Int(sqlite3_column_int64(lesFiches, 1)), valeurs: try ouvrir(id, contenu)))
        }
        let laFile = try preparer("SELECT id, operation, modifieLe, supprime, creation, contenu FROM file")
        defer { sqlite3_finalize(laFile) }
        while sqlite3_step(laFile) == SQLITE_ROW {
            let id = texte(laFile, 0)
            let contenu = octets(laFile, 5)
            file.append(LigneFileHumalis(id: id, operation: texte(laFile, 1), modifieLe: Double(sqlite3_column_int64(laFile, 2)), supprime: sqlite3_column_int(laFile, 3) != 0, creation: sqlite3_column_int(laFile, 4) != 0, valeurs: try contenu.map { try ouvrir(id, $0) }))
        }
        let leCurseur = try preparer("SELECT curseur FROM meta WHERE seule = 1")
        defer { sqlite3_finalize(leCurseur) }
        if sqlite3_step(leCurseur) == SQLITE_ROW { curseur = Double(sqlite3_column_int64(leCurseur, 0)) }
        return ContenuBaseHumalis(fiches: fiches, file: file, curseur: curseur)
    }

    func appliquer(_ e: EcrituresBaseHumalis) throws {
        // Chiffrer d'abord : la transaction reste courte.
        let fiches = try e.fiches.map { ($0, try sceller($0.id, $0.valeurs)) }
        let lignes = try e.file.map { l in (l, try l.valeurs.map { try sceller(l.id, $0) }) }
        try BaseSQLiteHumalis.executer(db, "BEGIN IMMEDIATE")
        do {
            for (fiche, contenu) in fiches {
                let r = try preparer("INSERT OR REPLACE INTO fiches (id, ordre, contenu) VALUES (?, ?, ?)")
                lier(r, 1, fiche.id)
                sqlite3_bind_int64(r, 2, Int64(fiche.ordre))
                lier(r, 3, contenu)
                try finir(r)
            }
            for id in e.retirees {
                let r = try preparer("DELETE FROM fiches WHERE id = ?")
                lier(r, 1, id)
                try finir(r)
            }
            for id in e.envoyees {
                let r = try preparer("DELETE FROM file WHERE id = ?")
                lier(r, 1, id)
                try finir(r)
            }
            for (ligne, contenu) in lignes {
                let r = try preparer("INSERT OR REPLACE INTO file (id, operation, modifieLe, supprime, creation, contenu) VALUES (?, ?, ?, ?, ?, ?)")
                lier(r, 1, ligne.id)
                lier(r, 2, ligne.operation)
                sqlite3_bind_int64(r, 3, Int64(ligne.modifieLe))
                sqlite3_bind_int(r, 4, ligne.supprime ? 1 : 0)
                sqlite3_bind_int(r, 5, ligne.creation ? 1 : 0)
                lier(r, 6, contenu)
                try finir(r)
            }
            if let curseur = e.curseur {
                let r = try preparer("INSERT OR REPLACE INTO meta (seule, curseur) VALUES (1, ?)")
                sqlite3_bind_int64(r, 1, Int64(curseur))
                try finir(r)
            }
            try BaseSQLiteHumalis.executer(db, "COMMIT")
        } catch {
            try? BaseSQLiteHumalis.executer(db, "ROLLBACK")
            throw error
        }
    }
}

/** Une base en mémoire : la vraie n'a pas pu s'ouvrir, la page marche quand même le temps de la visite. */
actor BaseEnMemoireHumalis: BaseHumalis {
    private var fiches: [String: FicheBaseHumalis] = [:]
    private var file: [String: LigneFileHumalis] = [:]
    private var curseur = 0.0

    func lire() -> ContenuBaseHumalis { ContenuBaseHumalis(fiches: fiches.values.sorted { $0.ordre < $1.ordre }, file: Array(file.values), curseur: curseur) }

    func appliquer(_ e: EcrituresBaseHumalis) {
        for f in e.fiches { fiches[f.id] = f }
        for id in e.retirees { fiches[id] = nil }
        for id in e.envoyees { file[id] = nil }
        for l in e.file { file[l.id] = l }
        if let c = e.curseur { curseur = c }
    }
}

/** La clé d'une base : dans le coffre du système, propre à cet appareil. */
private enum CleBaseHumalis {
    private static func requete(_ nom: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: Bundle.main.bundleIdentifier ?? "humalis", kSecAttrAccount as String: nom]
    }

    /** nil seulement si elle n'existe pas : un coffre fermé (appareil verrouillé) n'est pas une clé perdue. */
    static func lire(_ nom: String) throws -> Data? {
        var q = requete(nom)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var resultat: CFTypeRef?
        let statut = SecItemCopyMatching(q as CFDictionary, &resultat)
        if statut == errSecItemNotFound { return nil }
        guard statut == errSecSuccess, let donnees = resultat as? Data else { throw ErreurBaseHumalis.coffre(statut) }
        return donnees
    }

    static func creer(_ nom: String, _ donnees: Data) throws {
        var ajout = requete(nom)
        ajout[kSecValueData as String] = donnees
        ajout[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let statut = SecItemAdd(ajout as CFDictionary, nil)
        guard statut == errSecSuccess else { throw ErreurBaseHumalis.coffre(statut) }
    }
}

private func ouvrirBaseHumalis(nom: String, chiffree: Bool) throws -> BaseSQLiteHumalis {
    guard let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { throw ErreurBaseHumalis.illisible }
    // Le nom du fichier ne dit rien du compte.
    let empreinte = SHA256.hash(data: Data(nom.utf8)).map { String(format: "%02x", $0) }.joined()
    var dossier = support.appendingPathComponent("humalis/locales/\(empreinte)", isDirectory: true)
    try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
    var cle: SymmetricKey?
    if chiffree {
        let nomCle = nom + ":cle"
        if let octets = try CleBaseHumalis.lire(nomCle) {
            cle = SymmetricKey(data: octets)
        } else {
            // Sans sa clé, ce que la base contient est perdu pour toujours : elle repart vide.
            try? FileManager.default.removeItem(at: dossier)
            try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
            let nouvelle = SymmetricKey(size: .bits256)
            try CleBaseHumalis.creer(nomCle, nouvelle.withUnsafeBytes { Data($0) })
            cle = nouvelle
        }
        // La clé ne quitte pas cet appareil : une sauvegarde de la base ne pourrait jamais être relue.
        var reglages = URLResourceValues()
        reglages.isExcludedFromBackup = true
        try? dossier.setResourceValues(reglages)
    }
    return try BaseSQLiteHumalis(fichier: dossier.appendingPathComponent("base.sqlite"), cle: cle)
}

/**
 * Le cœur : la liste affichée d'un côté, la base de l'autre. La liste reste la vérité de la page : chaque
 * changement y est comparé à ce que la base connaît, et devient une écriture, puis une ligne de la file d'envoi.
 */
@MainActor final class CoeurLocalHumalis {
    private let champs: [String]
    private let route: String?
    private let lire: @MainActor () -> [ValeurHumalis]
    private let ecrire: @MainActor ([ValeurHumalis]) -> Void
    private let normaliser: @MainActor (ValeursFicheHumalis) -> ValeurHumalis
    var planifier: (@MainActor () -> Void)?
    var signaler: (@MainActor (String) -> Void)?

    private var base: (any BaseHumalis)?
    private var pret = false
    /** Change à chaque base ouverte : une réponse du réseau pour un autre compte n'est pas appliquée. */
    private var generation = 0
    private var connus: [String: Data] = [:]
    private var objets: [String: ValeurHumalis] = [:]
    private var ordres: [String: Int] = [:]
    private var file: [String: LigneFileHumalis] = [:]
    private var curseur = 0.0
    private var prochain = 1
    private var enVol = Set<String>()
    private var suite: Task<Void, Never>?
    private var enCours: Task<Bool, Error>?
    private var encoreUneFois = false
    private var observationPrevue = false
    private var enEcriture = false
    private let encodeur: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = .sortedKeys
        return e
    }()

    init(champs: [String], route: String?, lire: @escaping @MainActor () -> [ValeurHumalis], ecrire: @escaping @MainActor ([ValeurHumalis]) -> Void, normaliser: @escaping @MainActor (ValeursFicheHumalis) -> ValeurHumalis) {
        self.champs = champs
        self.route = route
        self.lire = lire
        self.ecrire = ecrire
        self.normaliser = normaliser
    }

    @discardableResult private func enOrdre(_ travail: @escaping @MainActor () async throws -> Void) -> Task<Void, Error> {
        let avant = suite
        let tache = Task<Void, Error> { @MainActor in
            await avant?.value
            try await travail()
        }
        suite = Task { _ = try? await tache.value }
        return tache
    }

    private func identifiant(_ fiche: ValeurHumalis) -> String? {
        if case .texte(let id) = fiche["id"], !id.isEmpty { return id }
        return nil
    }

    private func estFiche(_ valeur: ValeurHumalis) -> Bool {
        if case .fiche = valeur { return true }
        return false
    }

    private func valeursDe(_ fiche: ValeurHumalis) -> ValeursFicheHumalis {
        var valeurs: ValeursFicheHumalis = [:]
        for champ in champs { valeurs[champ] = fiche[champ] }
        return valeurs
    }

    private func texteDe(_ valeurs: ValeursFicheHumalis) -> Data { (try? encodeur.encode(valeurs)) ?? Data() }

    /** La forme que la page garde : ce que le serveur renvoie peut être moins précis que les champs déclarés. */
    private func propres(_ brutes: ValeursFicheHumalis) -> ValeursFicheHumalis { valeursDe(normaliser(brutes)) }

    private func publier() {
        let liste = ordres.sorted { $0.value < $1.value }.compactMap { objets[$0.key] }
        ecrireListe(liste)
    }

    private func ecrireListe(_ liste: [ValeurHumalis]) {
        enEcriture = true
        ecrire(liste)
        enEcriture = false
    }

    private func adopter(_ id: String, _ brutes: ValeursFicheHumalis, _ ecritures: inout EcrituresBaseHumalis) -> Bool {
        let valeurs = propres(brutes)
        let texte = texteDe(valeurs)
        if connus[id] == texte { return false }
        connus[id] = texte
        var fiche = valeurs
        fiche["id"] = .texte(id)
        objets[id] = .fiche(fiche)
        if ordres[id] == nil {
            ordres[id] = prochain
            prochain += 1
        }
        ecritures.fiches.append(FicheBaseHumalis(id: id, ordre: ordres[id]!, valeurs: valeurs))
        return true
    }

    private func oublier(_ id: String, _ ecritures: inout EcrituresBaseHumalis) -> Bool {
        guard connus[id] != nil else { return false }
        connus[id] = nil
        objets[id] = nil
        ordres[id] = nil
        ecritures.retirees.append(id)
        return true
    }

    /** Appelée à chaque changement de la liste ; plusieurs changements d'affilée sont comparés une seule fois. */
    func marquer() {
        guard !enEcriture, !observationPrevue else { return }
        observationPrevue = true
        Task { @MainActor [self] in rattraper() }
    }

    /** Ce qui vient de changer dans la page passe avant ce qu'apporte le réseau. */
    private func rattraper() {
        guard observationPrevue else { return }
        observationPrevue = false
        observer(lire())
    }

    private func nouvelleOperation() -> String { UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased() }

    /** Compare la liste à la base : ce qui a changé part dans la base et dans la file. */
    private func observer(_ liste: [ValeurHumalis]) {
        guard pret, let cible = base else { return }
        var vus = Set<String>()
        var completee = false
        let sortie: [ValeurHumalis] = liste.map { fiche in
            guard estFiche(fiche) else { return fiche }
            if let id = identifiant(fiche), !vus.contains(id) {
                vus.insert(id)
                return fiche
            }
            completee = true
            let id = UUID().uuidString.lowercased()
            vus.insert(id)
            var complete = fiche
            complete["id"] = .texte(id)
            return complete
        }
        var ecritures = EcrituresBaseHumalis()
        let moment = (Date().timeIntervalSince1970 * 1000).rounded()
        for fiche in sortie {
            guard estFiche(fiche), let id = identifiant(fiche) else { continue }
            let valeurs = valeursDe(fiche)
            let texte = texteDe(valeurs)
            let connu = connus[id]
            let nouvelle = connu == nil
            if connu != texte {
                if nouvelle {
                    ordres[id] = prochain
                    prochain += 1
                }
                connus[id] = texte
                objets[id] = fiche
                ecritures.fiches.append(FicheBaseHumalis(id: id, ordre: ordres[id]!, valeurs: valeurs))
                if route != nil {
                    let entree = LigneFileHumalis(id: id, operation: nouvelleOperation(), modifieLe: moment, supprime: false, creation: nouvelle || file[id]?.creation == true, valeurs: valeurs)
                    file[id] = entree
                    ecritures.file.append(entree)
                }
            } else {
                objets[id] = fiche
            }
        }
        for id in Array(connus.keys) where !vus.contains(id) {
            _ = oublier(id, &ecritures)
            guard route != nil else { continue }
            // Créée et supprimée sans avoir jamais quitté l'appareil : le serveur n'a pas à le savoir.
            if file[id]?.creation == true && !enVol.contains(id) {
                file[id] = nil
                ecritures.envoyees.append(id)
            } else {
                let entree = LigneFileHumalis(id: id, operation: nouvelleOperation(), modifieLe: moment, supprime: true, creation: false, valeurs: nil)
                file[id] = entree
                ecritures.file.append(entree)
            }
        }
        if completee { ecrireListe(sortie) }
        if !ecritures.estVide {
            let aEcrire = ecritures
            enOrdre { try await cible.appliquer(aEcrire) }
            if route != nil { planifier?() }
        }
    }

    /** Ouvre la base d'un compte et publie ce qu'elle contient. */
    func ouvrir(_ nouvelle: any BaseHumalis) async throws {
        rattraper()
        try await enOrdre { [self] in
            let etaitPret = pret
            pret = false
            generation += 1
            base = nouvelle
            try await charger()
            // Ce qui a été écrit avant l'ouverture de la toute première base n'est pas perdu.
            let enAttente = etaitPret ? [] : lire().filter { estFiche($0) && identifiant($0) == nil }
            pret = true
            if enAttente.isEmpty {
                publier()
            } else {
                ecrireListe(ordres.sorted { $0.value < $1.value }.compactMap { objets[$0.key] } + enAttente)
                observer(lire())
            }
        }.value
    }

    private func charger() async throws {
        guard let base else { return }
        let lu = try await base.lire()
        connus = [:]
        objets = [:]
        ordres = [:]
        file = Dictionary(lu.file.map { ($0.id, $0) }, uniquingKeysWith: { $1 })
        curseur = lu.curseur
        prochain = 1
        for fiche in lu.fiches {
            let valeurs = propres(fiche.valeurs)
            connus[fiche.id] = texteDe(valeurs)
            var complete = valeurs
            complete["id"] = .texte(fiche.id)
            objets[fiche.id] = .fiche(complete)
            ordres[fiche.id] = fiche.ordre
            prochain = max(prochain, fiche.ordre + 1)
        }
    }

    /** Vrai si l'envoi est fini et que recevoir a un sens. */
    private func envoyer(_ route: String, _ depart: Int) async throws -> Bool {
        var taille = tailleDuLot
        while !file.isEmpty {
            let lot = file.values.sorted { ($0.modifieLe, $0.id) < ($1.modifieLe, $1.id) }.prefix(taille)
            let ids = lot.map(\.id)
            enVol.formUnion(ids)
            let envois: [ValeurHumalis] = lot.map { l in
                var envoi: [String: ValeurHumalis] = ["operation": .texte(l.operation), "id": .texte(l.id), "modifieLe": .nombre(l.modifieLe)]
                if l.supprime { envoi["supprime"] = .booleen(true) } else { envoi["valeurs"] = .fiche(l.valeurs ?? [:]) }
                return .fiche(envoi)
            }
            let reponse: (statut: Int, corps: ValeurHumalis)
            do {
                reponse = try await Serveur.commun.brut(route + "/synchro", methode: "POST", envoi: ["heure": .nombre((Date().timeIntervalSince1970 * 1000).rounded()), "envois": .liste(envois)])
            } catch {
                rattraper()
                enVol.subtract(ids)
                throw error
            }
            rattraper()
            enVol.subtract(ids)
            guard depart == generation else { return false }
            if reponse.statut == 401 || reponse.statut == 403 { return false }
            if reponse.statut == 413 {
                // Trop lourd : on coupe le lot en deux. Une fiche seule trop lourde ne bloque pas les suivantes.
                if lot.count > 1 {
                    taille = (lot.count + 1) / 2
                    continue
                }
                guard let seule = lot.first else { break }
                var ecritures = EcrituresBaseHumalis()
                file[seule.id] = nil
                ecritures.envoyees.append(seule.id)
                let retiree = seule.creation && oublier(seule.id, &ecritures)
                let cible = base
                let aEcrire = ecritures
                try await enOrdre { try await cible?.appliquer(aEcrire) }.value
                if retiree { publier() }
                signaler?("Cette fiche est trop lourde pour être envoyée au serveur.")
                continue
            }
            guard (200..<300).contains(reponse.statut) else { throw ErreurHumalis.refus("envoi refusé (\(reponse.statut))") }
            var ecritures = EcrituresBaseHumalis()
            var change = false
            var avance = false
            for resultat in reponse.corps["resultats"].enListe {
                let id = resultat["id"].enTexte
                let encoreLaMeme = file[id]?.operation == resultat["operation"].enTexte
                if encoreLaMeme {
                    file[id] = nil
                    ecritures.envoyees.append(id)
                    avance = true
                }
                // Le serveur a gardé autre chose : sa version remplace la nôtre, sauf si l'on a déjà rechangé cette fiche.
                if resultat["etat"].enTexte != "applique" && encoreLaMeme {
                    if case .fiche(let actuelle) = resultat["actuelle"] { change = adopter(id, actuelle, &ecritures) || change }
                    else { change = oublier(id, &ecritures) || change }
                    if resultat["etat"].enTexte == "refuse" {
                        let raison = resultat["raison"].enTexte
                        signaler?(raison.isEmpty ? "Le serveur a refusé une modification." : raison)
                    }
                }
            }
            let cible = base
            let aEcrire = ecritures
            try await enOrdre { try await cible?.appliquer(aEcrire) }.value
            guard depart == generation else { return false }
            if change { publier() }
            // Un serveur qui ne répond rien sur un lot : on ne boucle pas.
            if !avance { break }
        }
        return true
    }

    private func recevoir(_ route: String, _ depart: Int) async throws {
        while true {
            let reponse = try await Serveur.commun.brut(route + "/synchro", methode: "GET", filtres: [("depuis", String(Int64(curseur)))])
            rattraper()
            guard depart == generation else { return }
            if reponse.statut == 401 || reponse.statut == 403 { return }
            guard (200..<300).contains(reponse.statut) else { throw ErreurHumalis.refus("lecture refusée (\(reponse.statut))") }
            var ecritures = EcrituresBaseHumalis()
            var change = false
            if reponse.corps["reinitialiser"].enBooleen {
                // Absent trop longtemps : seul ce qui attend encore d'être envoyé reste.
                for id in Array(connus.keys) where file[id] == nil { change = oublier(id, &ecritures) || change }
            }
            for changement in reponse.corps["changements"].enListe {
                let id = changement["id"].enTexte
                // Une modification locale attend son tour : elle partira, et le serveur tranchera.
                if file[id] != nil { continue }
                if changement["supprime"].enBooleen { change = oublier(id, &ecritures) || change }
                else if case .fiche(let valeurs) = changement["valeurs"] { change = adopter(id, valeurs, &ecritures) || change }
            }
            curseur = reponse.corps["curseur"].enNombre
            ecritures.curseur = curseur
            let cible = base
            let aEcrire = ecritures
            try await enOrdre { try await cible?.appliquer(aEcrire) }.value
            guard depart == generation else { return }
            if change { publier() }
            if !reponse.corps["encore"].enBooleen { return }
        }
    }

    /** Envoie ce qui attend, puis reçoit ce qui a changé. Une seule à la fois. */
    @discardableResult func synchroniser() async throws -> Bool {
        guard let route, pret else { return false }
        if let enCours {
            encoreUneFois = true
            return try await enCours.value
        }
        let tache = Task<Bool, Error> { @MainActor [self] in
            defer { enCours = nil }
            repeat {
                encoreUneFois = false
                let depart = generation
                rattraper()
                await suite?.value
                if try await envoyer(route, depart) { try await recevoir(route, depart) }
            } while encoreUneFois
            return true
        }
        enCours = tache
        return try await tache.value
    }
}

/** Le réseau de l'appareil : son retour relance les synchronisations. */
@MainActor final class ReseauHumalis {
    static let commun = ReseauHumalis()
    private(set) var enLigne = true
    private var quandDeRetour: [@MainActor () -> Void] = []
    private let moniteur = NWPathMonitor()
    private var demarre = false

    func suivre(_ action: @escaping @MainActor () -> Void) {
        quandDeRetour.append(action)
        guard !demarre else { return }
        demarre = true
        moniteur.pathUpdateHandler = { [weak self] chemin in
            let enLigne = chemin.status == .satisfied
            Task { @MainActor in self?.changer(enLigne) }
        }
        moniteur.start(queue: DispatchQueue(label: "humalis.reseau"))
    }

    private func changer(_ nouveau: Bool) {
        enLigne = nouveau
        if nouveau { for action in quandDeRetour { action() } }
    }
}

/** Une donnée locale dans l'application. Une base par compte : ce qui attend d'être envoyé reste au compte qui l'a écrit. */
@MainActor final class DonneeLocaleHumalis {
    struct Reglages {
        let cle: String
        let nom: String
        let chiffree: Bool
        let champs: [String]
        let route: String?
        let publique: Bool
    }

    private enum Compte: Equatable {
        case inconnu
        case ouvert(String?)
    }

    private let reglages: Reglages
    private let coeur: CoeurLocalHumalis
    private var minuteur: Task<Void, Never>?
    private var veille: Task<Void, Never>?
    private var reprise = repriseMinimum
    private var compteOuvert = Compte.inconnu
    private var ouverture: Task<Void, Never>?
    private var misEnGarde = false
    private var auPremierPlan = true

    init(reglages: Reglages, lire: @escaping @MainActor () -> [ValeurHumalis], ecrire: @escaping @MainActor ([ValeurHumalis]) -> Void, normaliser: @escaping @MainActor (ValeursFicheHumalis) -> ValeurHumalis) {
        self.reglages = reglages
        coeur = CoeurLocalHumalis(champs: reglages.champs, route: reglages.route, lire: lire, ecrire: ecrire, normaliser: normaliser)
        coeur.planifier = { [weak self] in self?.planifier(attenteEcriture) }
        coeur.signaler = { Messages.commun.afficher($0, .erreur) }
    }

    /** Depuis la liste partagée : elle vient de changer. */
    func marquer() { coeur.marquer() }

    /** Le minuteur ne fait qu'attendre : la synchronisation qu'il lance n'est pas annulée avec lui. */
    private func planifier(_ delai: Double) {
        minuteur?.cancel()
        minuteur = Task { @MainActor [self] in
            try? await Task.sleep(for: .seconds(delai))
            if Task.isCancelled { return }
            Task { @MainActor in await lancer() }
        }
    }

    private func lancer() async {
        guard reglages.route != nil, ReseauHumalis.commun.enLigne else { return }
        // Sans session, une route réservée n'a rien à dire : on attend la connexion.
        if compteOuvert == .ouvert(nil) && !reglages.publique { return }
        await Session.commun.relireSiHorsLigne()
        do {
            try await coeur.synchroniser()
            reprise = repriseMinimum
        } catch {
            // Pas de réseau, serveur en panne : on recommence de plus en plus lentement, sans rien dire.
            planifier(reprise)
            reprise = min(reprise * 2, repriseMaximum)
        }
    }

    private func ouvrirCompte(_ compte: String?) async {
        let nom = reglages.cle + ":locale:" + reglages.nom + ":" + (compte ?? "visiteur") + (reglages.chiffree ? ":chiffree" : "")
        let chiffree = reglages.chiffree
        var base: any BaseHumalis
        do {
            base = try await Task.detached { try ouvrirBaseHumalis(nom: nom, chiffree: chiffree) }.value
            try await coeur.ouvrir(base)
        } catch {
            if !misEnGarde { Messages.commun.afficher("Cet appareil ne garde pas les données : elles seront perdues à la fermeture de l'application.", .avertissement) }
            misEnGarde = true
            base = BaseEnMemoireHumalis()
            try? await coeur.ouvrir(base)
        }
        planifier(0)
    }

    /** Appelée quand on connaît le compte (nil : personne) ; sans route, une seule base pour l'appareil. */
    func changerCompte(_ compte: String?) {
        let voulu = Compte.ouvert(reglages.route != nil ? compte : "appareil")
        guard voulu != compteOuvert else { return }
        compteOuvert = voulu
        guard case .ouvert(let nom) = voulu else { return }
        let avant = ouverture
        ouverture = Task { @MainActor [self] in
            await avant?.value
            // Un autre compte est arrivé entre-temps : seul le dernier s'ouvre.
            guard compteOuvert == voulu else { return }
            await ouvrirCompte(nom)
        }
    }

    private func demarrer() {
        guard reglages.route != nil, veille == nil else { return }
        ReseauHumalis.commun.suivre { [weak self] in self?.planifier(0) }
        #if !HUMALIS_SANS_FENETRE
        #if os(macOS)
        let actif = NSApplication.didBecomeActiveNotification, inactif = NSApplication.didResignActiveNotification
        #else
        let actif = UIApplication.didBecomeActiveNotification, inactif = UIApplication.didEnterBackgroundNotification
        #endif
        NotificationCenter.default.addObserver(forName: actif, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in
                self?.auPremierPlan = true
                self?.planifier(0)
            }
        }
        NotificationCenter.default.addObserver(forName: inactif, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.auPremierPlan = false }
        }
        #endif
        veille = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(veilleSynchro))
                guard let moi = self else { return }
                if moi.auPremierPlan { await moi.lancer() }
            }
        }
    }

    /** Le compte est suivi tant que l'application vit : connexion, déconnexion, session finie. */
    static func demarrerToutes(_ donnees: [DonneeLocaleHumalis]) {
        for donnee in donnees { donnee.demarrer() }
        suivreLeCompte(donnees)
        Task { @MainActor in await Session.commun.attendre() }
    }

    private static func suivreLeCompte(_ donnees: [DonneeLocaleHumalis]) {
        let compte = withObservationTracking({ Session.commun.compteGarde }, onChange: {
            Task { @MainActor in suivreLeCompte(donnees) }
        })
        for donnee in donnees { donnee.changerCompte(compte) }
    }
}
`;

/** Humalis/CompteSecurise.swift */
export const COMPTE_SECURISE_SWIFT = String.raw`// Produit par Humalis : l'écran du code à six chiffres et les clés d'accès du système.
import SwiftUI
#if !HUMALIS_SANS_FENETRE
import AuthenticationServices
import CoreImage.CIFilterBuiltins
#endif

private let sansReseauCompte = "Le serveur n'a pas répondu. Réessayez dans un instant."

private func enOctetsHumalis(_ texte: String) -> Data? {
    var base = texte.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    base += String(repeating: "=", count: (4 - base.count % 4) % 4)
    return Data(base64Encoded: base)
}

private func enTexteHumalis(_ octets: Data) -> String {
    octets.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
}

private func raisonDuServeur(_ reponse: (statut: Int, corps: ValeurHumalis), sinon: String) -> String {
    if reponse.statut == 429 { return "Trop de tentatives. Réessayez dans quelques minutes." }
    if case .texte(let raison) = reponse.corps["erreur"], !raison.isEmpty { return raison.prefix(1).uppercased() + raison.dropFirst() + "." }
    return sinon
}

@MainActor enum CompteSecuriseHumalis {
    /** Au lancement de l'application : le compte qui a le code passe par l'écran du code. */
    static func brancher() {
        Session.commun.quandCodeDemande = { await demanderCode($0) }
    }

    /** Une action des pages : refusée, le message s'affiche ; vrai si elle a réussi. */
    static func sinonDire(_ action: @MainActor () async throws -> Bool) async -> Bool {
        do {
            return try await action()
        } catch {
            Messages.commun.afficher(raisonDe(error) == pasDeReponse ? sansReseauCompte : raisonDe(error), .erreur)
            return false
        }
    }

    private static func appeler(_ chemin: String, _ corps: [String: ValeurHumalis] = [:], methode: String = "POST") async throws -> (statut: Int, corps: ValeurHumalis) {
        do {
            return try await Serveur.commun.brut(chemin, methode: methode, envoi: methode == "GET" ? nil : corps)
        } catch {
            throw ErreurHumalis.refus(sansReseauCompte)
        }
    }

    #if HUMALIS_SANS_FENETRE
    static func demanderCode(_ jeton: String) async -> Bool { false }
    static func activer() async throws -> Bool { throw ErreurHumalis.refus("Cet appareil ne gère pas la double authentification.") }
    static func ajouterCle() async throws -> Bool { throw ErreurHumalis.refus("Cet appareil ne gère pas les clés d'accès.") }
    static func seConnecterParCle() async throws -> Bool { throw ErreurHumalis.refus("Cet appareil ne gère pas les clés d'accès.") }
    #else

    /** Après un mot de passe juste, quand le compte a le code : vrai si la session est ouverte. */
    static func demanderCode(_ jeton: String) async -> Bool {
        await demanderDansFenetre(sinon: false) { fin in EcranCodeHumalis(jeton: jeton, fin: fin) }
    }

    fileprivate static func verifierCode(_ jeton: String, _ code: String) async -> String? {
        do {
            let reponse = try await appeler("/auth/double/verifier", ["jeton": .texte(jeton), "code": .texte(code)])
            guard (200..<300).contains(reponse.statut) else { return raisonDuServeur(reponse, sinon: "Ce code est incorrect.") }
            await Session.commun.ouvrirSession(reponse.corps)
            return nil
        } catch {
            return sansReseauCompte
        }
    }

    private static func motDePasse(_ titre: String) async -> String? {
        await demanderDansFenetre(sinon: nil) { fin in EcranMotDePasseHumalis(titre: titre, fin: fin) }
    }

    /** « activer double authentification » : le QR et la clé si elle est éteinte, ses réglages si elle est active. */
    static func activer() async throws -> Bool {
        let etat = try await appeler("/auth/double", methode: "GET")
        if etat.statut == 401 { throw ErreurHumalis.refus("Connectez-vous pour continuer.") }
        guard (200..<300).contains(etat.statut) else { throw ErreurHumalis.refus(raisonDuServeur(etat, sinon: sansReseauCompte)) }
        if etat.corps["actif"].enBooleen {
            let restants = Int(etat.corps["codesRestants"].enNombre)
            return await demanderDansFenetre(sinon: false) { fin in EcranGestionDoubleHumalis(codesRestants: restants, fin: fin) }
        }
        var preuve: [String: ValeurHumalis] = [:]
        if etat.corps["motDePasseRequis"].enBooleen {
            guard let saisi = await motDePasse("Confirmez votre mot de passe") else { return false }
            preuve["motDePasse"] = .texte(saisi)
        }
        let reponse = try await appeler("/auth/double/activer", preuve)
        guard (200..<300).contains(reponse.statut) else { throw ErreurHumalis.refus(raisonDuServeur(reponse, sinon: "La double authentification n'a pas pu commencer.")) }
        let secret = reponse.corps["secret"].enTexte
        let uri = reponse.corps["uri"].enTexte
        return await demanderDansFenetre(sinon: false) { fin in EcranActivationHumalis(secret: secret, uri: uri, fin: fin) }
    }

    fileprivate static func confirmerCode(_ code: String) async -> (codes: [String]?, raison: String?) {
        do {
            let fin = try await appeler("/auth/double/confirmer", ["code": .texte(code)])
            guard (200..<300).contains(fin.statut) else { return (nil, raisonDuServeur(fin, sinon: "Ce code est incorrect.")) }
            return (fin.corps["codesSecours"].enListe.map(\.enTexte), nil)
        } catch {
            return (nil, sansReseauCompte)
        }
    }

    /** Nouveaux codes, ou désactivation : codes nil et raison nil veut dire désactivée. */
    fileprivate static func agirSurDouble(_ chemin: String, _ code: String) async -> (codes: [String]?, raison: String?) {
        do {
            let reponse = try await appeler(chemin, ["code": .texte(code)])
            guard (200..<300).contains(reponse.statut) else { return (nil, raisonDuServeur(reponse, sinon: "Ce code est incorrect.")) }
            if case .liste(let codes) = reponse.corps["codesSecours"] { return (codes.map(\.enTexte), nil) }
            return (nil, nil)
        } catch {
            return (nil, sansReseauCompte)
        }
    }

    private static var nomAppareil: String {
        #if os(macOS)
        "Mac"
        #else
        UIDevice.current.model
        #endif
    }

    /** « ajouter cle d'acces » : les options du serveur, la fenêtre du système, puis la vérification. */
    static func ajouterCle() async throws -> Bool {
        var reponse = try await appeler("/auth/cle-acces/inscription/options")
        if reponse.statut == 403 && reponse.corps["motDePasseRequis"].enBooleen {
            guard let saisi = await motDePasse("Confirmez votre mot de passe") else { return false }
            reponse = try await appeler("/auth/cle-acces/inscription/options", ["motDePasse": .texte(saisi)])
        }
        if reponse.statut == 401 { throw ErreurHumalis.refus("Connectez-vous pour continuer.") }
        guard (200..<300).contains(reponse.statut) else { throw ErreurHumalis.refus(raisonDuServeur(reponse, sinon: "La clé d'accès n'a pas pu être préparée.")) }
        let options = reponse.corps
        guard let defi = enOctetsHumalis(options["challenge"].enTexte), let idPersonne = enOctetsHumalis(options["user"]["id"].enTexte) else { throw ErreurHumalis.refus("La clé d'accès n'a pas pu être préparée.") }
        let fournisseur = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options["rp"]["id"].enTexte)
        let demande = fournisseur.createCredentialRegistrationRequest(challenge: defi, name: options["user"]["name"].enTexte, userID: idPersonne)
        if case .texte(let nom) = options["user"]["displayName"] { demande.displayName = nom }
        if case .texte(let verification) = options["authenticatorSelection"]["userVerification"] { demande.userVerificationPreference = ASAuthorizationPublicKeyCredentialUserVerificationPreference(rawValue: verification) }
        if #available(iOS 17.4, macOS 14.4, *) {
            demande.excludedCredentials = options["excludeCredentials"].enListe.compactMap { enOctetsHumalis($0["id"].enTexte) }.map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
        }
        let creee: ASAuthorization
        do {
            creee = try await CeremonieCleHumalis().lancer(demande)
        } catch {
            NSLog("Humalis : le système a refusé la clé d'accès : %@", String(describing: error))
            throw ErreurHumalis.refus(raisonCeremonie(error, annulee: "La création de la clé d'accès a été annulée."))
        }
        guard let identite = creee.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration, let attestation = identite.rawAttestationObject else { throw ErreurHumalis.refus("Cette clé d'accès n'a pas été acceptée.") }
        let reponseCle: ValeurHumalis = .fiche([
            "id": .texte(enTexteHumalis(identite.credentialID)),
            "rawId": .texte(enTexteHumalis(identite.credentialID)),
            "type": .texte("public-key"),
            "clientExtensionResults": .fiche([:]),
            "authenticatorAttachment": .texte("platform"),
            "response": .fiche([
                "clientDataJSON": .texte(enTexteHumalis(identite.rawClientDataJSON)),
                "attestationObject": .texte(enTexteHumalis(attestation)),
                "transports": .liste([.texte("internal"), .texte("hybrid")]),
            ]),
        ])
        let fin = try await appeler("/auth/cle-acces/inscription/verifier", ["reponse": reponseCle, "nom": .texte(nomAppareil)])
        guard (200..<300).contains(fin.statut) else { throw ErreurHumalis.refus(raisonDuServeur(fin, sinon: "Cette clé d'accès n'a pas été acceptée.")) }
        Messages.commun.afficher("Clé d'accès ajoutée.", .reussite)
        return true
    }

    /** « se connecter par cle d'acces » : sans adresse, le système propose les clés de ce domaine. */
    static func seConnecterParCle() async throws -> Bool {
        let debut = try await appeler("/auth/cle-acces/connexion/options")
        guard (200..<300).contains(debut.statut) else { throw ErreurHumalis.refus(raisonDuServeur(debut, sinon: "La connexion n'a pas pu commencer.")) }
        let options = debut.corps["options"]
        guard let defi = enOctetsHumalis(options["challenge"].enTexte) else { throw ErreurHumalis.refus("La connexion n'a pas pu commencer.") }
        let fournisseur = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: options["rpId"].enTexte)
        let demande = fournisseur.createCredentialAssertionRequest(challenge: defi)
        if case .texte(let verification) = options["userVerification"] { demande.userVerificationPreference = ASAuthorizationPublicKeyCredentialUserVerificationPreference(rawValue: verification) }
        let signee: ASAuthorization
        do {
            signee = try await CeremonieCleHumalis().lancer(demande)
        } catch {
            NSLog("Humalis : le système a refusé la clé d'accès : %@", String(describing: error))
            throw ErreurHumalis.refus(raisonCeremonie(error, annulee: "La connexion par clé d'accès a été annulée."))
        }
        guard let identite = signee.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else { throw ErreurHumalis.refus("Cette clé d'accès n'est pas reconnue.") }
        var signature: [String: ValeurHumalis] = [
            "clientDataJSON": .texte(enTexteHumalis(identite.rawClientDataJSON)),
            "authenticatorData": .texte(enTexteHumalis(identite.rawAuthenticatorData)),
            "signature": .texte(enTexteHumalis(identite.signature)),
        ]
        if let personne = identite.userID { signature["userHandle"] = .texte(enTexteHumalis(personne)) }
        let reponseCle: ValeurHumalis = .fiche([
            "id": .texte(enTexteHumalis(identite.credentialID)),
            "rawId": .texte(enTexteHumalis(identite.credentialID)),
            "type": .texte("public-key"),
            "clientExtensionResults": .fiche([:]),
            "authenticatorAttachment": .texte("platform"),
            "response": .fiche(signature),
        ])
        let fin = try await appeler("/auth/cle-acces/connexion/verifier", ["ceremonie": debut.corps["ceremonie"], "reponse": reponseCle])
        guard (200..<300).contains(fin.statut) else { throw ErreurHumalis.refus(raisonDuServeur(fin, sinon: "Cette clé d'accès n'est pas reconnue.")) }
        await Session.commun.ouvrirSession(fin.corps)
        return true
    }

    private static func raisonCeremonie(_ erreur: Error, annulee: String) -> String {
        guard let refus = erreur as? ASAuthorizationError else { return annulee }
        switch refus.code {
        case .canceled: return annulee
        case .failed where (erreur as NSError).localizedDescription.contains("associated"): return "Ce domaine n'est pas associé à cette application : le système refuse la clé d'accès."
        default:
            if refus.code.rawValue == 1006 { return "Cet appareil a déjà une clé d'accès pour ce compte." }
            return "Le système n'a pas pu utiliser de clé d'accès sur cet appareil."
        }
    }
    #endif
}

#if !HUMALIS_SANS_FENETRE
#if os(macOS)
private typealias ControleurHumalis = NSViewController
#else
private typealias ControleurHumalis = UIViewController
#endif

/** La fenêtre du système de la clé d'accès, attendue jusqu'à sa réponse. */
@MainActor private final class CeremonieCleHumalis: NSObject, @preconcurrency ASAuthorizationControllerDelegate, @preconcurrency ASAuthorizationControllerPresentationContextProviding {
    private var suite: CheckedContinuation<ASAuthorization, Error>?
    private var moi: CeremonieCleHumalis?

    func lancer(_ demande: ASAuthorizationRequest) async throws -> ASAuthorization {
        let controleur = ASAuthorizationController(authorizationRequests: [demande])
        controleur.delegate = self
        controleur.presentationContextProvider = self
        moi = self
        return try await withCheckedThrowingContinuation { suite in
            self.suite = suite
            controleur.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        suite?.resume(returning: authorization)
        suite = nil
        moi = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        suite?.resume(throwing: error)
        suite = nil
        moi = nil
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        #if os(macOS)
        return NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first ?? NSWindow()
        #else
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.flatMap(\.windows).first { $0.isKeyWindow } ?? scenes.first.map { UIWindow(windowScene: $0) } ?? UIWindow()
        #endif
    }
}

#if os(iOS)
/** Le haut de la pile : une fenêtre de la page peut déjà être ouverte. */
@MainActor private func controleurDuHaut() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    guard var haut = (scene?.keyWindow ?? scene?.windows.first)?.rootViewController else { return nil }
    while let suivante = haut.presentedViewController, !suivante.isBeingDismissed { haut = suivante }
    return haut
}
#endif

@MainActor private final class ReponseFenetre<Resultat: Sendable> {
    var suite: CheckedContinuation<Resultat, Never>?
    var hote: ControleurHumalis?

    func finir(_ resultat: Resultat) {
        guard let suite else { return }
        self.suite = nil
        guard let hote else { suite.resume(returning: resultat); return }
        // On attend la fin de la fermeture : une autre fenêtre peut s'ouvrir juste après.
        #if os(macOS)
        hote.presentingViewController?.dismiss(hote)
        suite.resume(returning: resultat)
        #else
        hote.dismiss(animated: true) { suite.resume(returning: resultat) }
        #endif
    }
}

/** Une fenêtre au-dessus de tout, attendue jusqu'à sa réponse. */
@MainActor private func demanderDansFenetre<Resultat: Sendable, Vue: View>(sinon: Resultat, @ViewBuilder _ contenu: (@escaping @MainActor (Resultat) -> Void) -> Vue) async -> Resultat {
    let reponse = ReponseFenetre<Resultat>()
    let vue = contenu { reponse.finir($0) }.preferredColorScheme(Apparence.commun.schema).tint(Couleurs.accent)
    return await withCheckedContinuation { suite in
        reponse.suite = suite
        #if os(macOS)
        guard let parent = (NSApplication.shared.keyWindow ?? NSApplication.shared.mainWindow)?.contentViewController else { reponse.finir(sinon); return }
        let hote = NSHostingController(rootView: vue)
        reponse.hote = hote
        parent.presentAsSheet(hote)
        #else
        guard let parent = controleurDuHaut() else { reponse.finir(sinon); return }
        let hote = UIHostingController(rootView: vue)
        hote.modalPresentationStyle = .formSheet
        // Seule la croix ferme : un geste de trop ne perd pas un code en cours de saisie.
        hote.isModalInPresentation = true
        reponse.hote = hote
        parent.present(hote, animated: true)
        #endif
    }
}

private struct CadreCompteHumalis<Contenu: View>: View {
    let titre: String
    let alerte: String?
    let fermer: @MainActor () -> Void
    @ViewBuilder let contenu: () -> Contenu

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    contenu()
                    if let alerte {
                        Text(verbatim: alerte).font(.callout).foregroundStyle(.red).accessibilityIdentifier("alerte_compte")
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle(titre)
            #if os(iOS)
            .toolbarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { fermer() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Fermer")
                        .keyboardShortcut(.cancelAction)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 400, minHeight: 320)
        #endif
    }
}

private struct SaisieCodeHumalis: View {
    let etiquette: String
    let chiffres: Bool
    @Binding var texte: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(verbatim: etiquette).font(.subheadline.weight(.medium)).accessibilityHidden(true)
            TextField("", text: $texte)
                .textFieldStyle(.roundedBorder)
                .accessibilityLabel(etiquette)
                .accessibilityIdentifier("champ_code")
                .autocorrectionDisabled()
                #if os(iOS)
                .textContentType(.oneTimeCode)
                .keyboardType(chiffres ? .numberPad : .asciiCapable)
                .textInputAutocapitalization(.never)
                #endif
        }
    }
}

private struct BoutonCompteHumalis: View {
    let titre: String
    var principal = true
    var occupe = false
    let action: @MainActor () -> Void

    var body: some View {
        if principal {
            Button { action() } label: { etiquette }.buttonStyle(.borderedProminent).disabled(occupe)
        } else {
            Button { action() } label: { etiquette }.buttonStyle(.bordered).disabled(occupe)
        }
    }

    private var etiquette: some View { Text(verbatim: titre).frame(maxWidth: .infinity) }
}

private struct EcranCodeHumalis: View {
    let jeton: String
    let fin: @MainActor (Bool) -> Void
    @State private var code = ""
    @State private var secours = false
    @State private var alerte: String?
    @State private var occupe = false

    var body: some View {
        CadreCompteHumalis(titre: "Code de vérification", alerte: alerte, fermer: { fin(false) }) {
            Text(verbatim: secours ? "Saisissez un de vos codes de secours : il ne servira qu’une fois." : "Saisissez le code affiché par votre application d’authentification.")
            SaisieCodeHumalis(etiquette: secours ? "Code de secours" : "Code à six chiffres", chiffres: !secours, texte: $code)
            BoutonCompteHumalis(titre: "Vérifier", occupe: occupe) {
                occupe = true
                Task {
                    if let raison = await CompteSecuriseHumalis.verifierCode(jeton, code) {
                        alerte = raison
                        code = ""
                        occupe = false
                    } else {
                        fin(true)
                    }
                }
            }
            BoutonCompteHumalis(titre: secours ? "Utiliser le code à six chiffres" : "Utiliser un code de secours", principal: false) {
                secours.toggle()
                code = ""
                alerte = nil
            }
        }
    }
}

private struct EcranMotDePasseHumalis: View {
    let titre: String
    let fin: @MainActor (String?) -> Void
    @State private var motDePasse = ""

    var body: some View {
        CadreCompteHumalis(titre: titre, alerte: nil, fermer: { fin(nil) }) {
            VStack(alignment: .leading, spacing: 6) {
                Text(verbatim: "Votre mot de passe").font(.subheadline.weight(.medium)).accessibilityHidden(true)
                SecureField("", text: $motDePasse)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.password)
                    .accessibilityLabel("Votre mot de passe")
                    .accessibilityIdentifier("champ_mot_de_passe_compte")
                    .onSubmit { if !motDePasse.isEmpty { fin(motDePasse) } }
            }
            BoutonCompteHumalis(titre: "Continuer", occupe: motDePasse.isEmpty) { fin(motDePasse) }
        }
    }
}

private struct QrCompteHumalis: View {
    let texte: String

    private var image: CGImage? {
        let filtre = CIFilter.qrCodeGenerator()
        filtre.message = Data(texte.utf8)
        filtre.correctionLevel = "M"
        guard let sortie = filtre.outputImage else { return nil }
        return CIContext().createCGImage(sortie, from: sortie.extent)
    }

    var body: some View {
        Group {
            if let image {
                Image(decorative: image, scale: 1)
                    .interpolation(.none)
                    .resizable()
                    .frame(width: 210, height: 210)
                    .padding(12)
                    .background(.white, in: RoundedRectangle(cornerRadius: 8))
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement()
        .accessibilityLabel("Code QR à scanner dans une application d'authentification")
        .accessibilityIdentifier("qr_double_authentification")
    }
}

private struct CodesSecoursHumalis: View {
    let codes: [String]
    let fin: @MainActor () -> Void
    @State private var copie = false

    var body: some View {
        Text(verbatim: "Gardez ces codes en lieu sûr : chacun remplace une fois le code à six chiffres. Ils ne seront plus affichés.")
        VStack(alignment: .leading, spacing: 4) {
            ForEach(codes, id: \.self) { code in
                Text(verbatim: code).font(.body.monospaced()).textSelection(.enabled)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
        BoutonCompteHumalis(titre: copie ? "Copié" : "Copier", principal: false) {
            copier(codes.joined(separator: "\n"), message: nil)
            copie = true
        }
        BoutonCompteHumalis(titre: "J’ai gardé ces codes") { fin() }
    }
}

private struct EcranActivationHumalis: View {
    let secret: String
    let uri: String
    let fin: @MainActor (Bool) -> Void
    @State private var code = ""
    @State private var alerte: String?
    @State private var occupe = false
    @State private var codes: [String]?

    var body: some View {
        CadreCompteHumalis(titre: "Double authentification", alerte: alerte, fermer: { fin(codes != nil) }) {
            if let codes {
                CodesSecoursHumalis(codes: codes) { fin(true) }
            } else {
                Text(verbatim: "Scannez ce code dans votre application d’authentification, puis saisissez le code qu’elle affiche.")
                QrCompteHumalis(texte: uri)
                Text(verbatim: "Clé à saisir à la main : \(secret)").font(.footnote).textSelection(.enabled).accessibilityIdentifier("cle_double_authentification")
                SaisieCodeHumalis(etiquette: "Code à six chiffres", chiffres: true, texte: $code)
                BoutonCompteHumalis(titre: "Activer", occupe: occupe) {
                    occupe = true
                    Task {
                        let resultat = await CompteSecuriseHumalis.confirmerCode(code)
                        if let lus = resultat.codes {
                            alerte = nil
                            codes = lus
                        } else {
                            alerte = resultat.raison
                            code = ""
                        }
                        occupe = false
                    }
                }
            }
        }
    }
}

private struct EcranGestionDoubleHumalis: View {
    let codesRestants: Int
    let fin: @MainActor (Bool) -> Void
    @State private var code = ""
    @State private var alerte: String?
    @State private var occupe = false
    @State private var codes: [String]?

    private func agir(_ chemin: String) {
        occupe = true
        Task {
            let resultat = await CompteSecuriseHumalis.agirSurDouble(chemin, code)
            occupe = false
            if let lus = resultat.codes {
                alerte = nil
                codes = lus
            } else if let raison = resultat.raison {
                alerte = raison
            } else {
                Messages.commun.afficher("La double authentification est désactivée.", .reussite)
                fin(true)
            }
        }
    }

    var body: some View {
        CadreCompteHumalis(titre: "Double authentification", alerte: alerte, fermer: { fin(codes != nil) }) {
            if let codes {
                CodesSecoursHumalis(codes: codes) { fin(true) }
            } else {
                Text(verbatim: "La double authentification est active. Codes de secours restants : \(codesRestants).")
                SaisieCodeHumalis(etiquette: "Code à six chiffres", chiffres: true, texte: $code)
                BoutonCompteHumalis(titre: "Nouveaux codes de secours", occupe: occupe) { agir("/auth/double/codes") }
                BoutonCompteHumalis(titre: "Désactiver", principal: false, occupe: occupe) { agir("/auth/double/desactiver") }
            }
        }
    }
}
#endif
`;
