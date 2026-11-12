/**
 * Les clés d'accès de l'application de bureau (Electron). Le navigateur
 * intégré n'obtient pas l'authentificateur de l'ordinateur pour l'adresse
 * propre à l'application (humalis://) : le processus principal fait donc
 * lui-même ce que fait un navigateur. Il écrit clientDataJSON avec l'origine
 * https://<domaine des clés>, comme les applications Apple, Android et
 * Windows natives, et demande la preuve à l'ordinateur :
 *
 * - Mac : une clé P-256 née dans la Secure Enclave, débloquée par Touch ID
 *   (ou le mot de passe de la session) à chaque usage ; le programme
 *   electron/natif/humalis-cles (Swift) en est le seul gardien. La clé reste
 *   sur ce Mac : elle n'est pas synchronisée par iCloud.
 * - Windows : une vraie clé d'accès Windows Hello, par l'API WebAuthn de
 *   Windows (webauthn.dll), appelée par electron/natif/cles-windows.ps1.
 * - Linux : pas encore ; la page le dit.
 *
 * Le serveur vérifie la réponse comme celle d'un navigateur : rien ne change
 * de son côté, sinon WEBAUTHN_ALLOWED_ORIGINS=https://<domaine des clés>.
 */

/** electron/cles.ts : le processus principal. */
export const CLES_PRINCIPAL_TS = String.raw`// Produit par Humalis : les clés d'accès de l'application de bureau (voir LISEZMOI.md).
// Touch ID par la Secure Enclave sur Mac, Windows Hello par webauthn.dll sur Windows.
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
/** Les programmes de l'ordinateur : à côté de l'application installée, ou dans electron/natif pendant le développement. */
const NATIF = app.isPackaged ? join(process.resourcesPath, 'natif') : join(ICI, '..', 'natif');

type Options = Record<string, any>;
type Resultat = { ok: true; reponse: unknown } | { ok: false; raison: string };

const ANNULEE = "L'opération a été annulée.";
const sha256 = (donnees: Buffer | string) => createHash('sha256').update(donnees).digest();
const enTexte = (octets: Buffer) => octets.toString('base64url');
const enOctets = (texte: string) => Buffer.from(String(texte), 'base64url');

/** CBOR, juste ce qu'il faut pour une clé COSE et un objet d'attestation. */
function cbor(valeur: unknown): Buffer {
  const tete = (majeur: number, n: number): Buffer => {
    if (n < 24) return Buffer.from([(majeur << 5) | n]);
    if (n < 0x100) return Buffer.from([(majeur << 5) | 24, n]);
    if (n < 0x10000) return Buffer.from([(majeur << 5) | 25, n >> 8, n & 0xff]);
    const b = Buffer.alloc(5);
    b[0] = (majeur << 5) | 26;
    b.writeUInt32BE(n, 1);
    return b;
  };
  if (typeof valeur === 'number') return valeur >= 0 ? tete(0, valeur) : tete(1, -1 - valeur);
  if (Buffer.isBuffer(valeur)) return Buffer.concat([tete(2, valeur.length), valeur]);
  if (typeof valeur === 'string') {
    const octets = Buffer.from(valeur, 'utf8');
    return Buffer.concat([tete(3, octets.length), octets]);
  }
  if (valeur instanceof Map) return Buffer.concat([tete(5, valeur.size), ...[...valeur].flatMap(([c, v]) => [cbor(c), cbor(v)])]);
  throw new Error('CBOR : valeur inattendue');
}

const entier32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};

/** clientDataJSON : écrit ici, comme le ferait un navigateur sur https://<domaine des clés>. */
const donneesDuClient = (type: string, defi: string, rpId: string) =>
  Buffer.from(JSON.stringify({ type, challenge: defi, origin: 'https://' + rpId, crossOrigin: false }), 'utf8');

/** Lance un programme de l'ordinateur et lit sa réponse JSON (sur une ligne). */
function lancer(programme: string, args: string[], entree?: string): Promise<Record<string, any>> {
  return new Promise((resoudre) => {
    let sortie = '';
    let processus;
    try {
      processus = spawn(programme, args, { windowsHide: true });
    } catch {
      return resoudre({ erreur: 'indisponible' });
    }
    processus.stdout.setEncoding('utf8');
    processus.stdout.on('data', (morceau: string) => (sortie += morceau));
    processus.on('error', () => resoudre({ erreur: 'indisponible' }));
    processus.on('close', () => {
      try {
        resoudre(JSON.parse(sortie.trim().split('\n').pop() ?? ''));
      } catch {
        resoudre({ erreur: sortie.trim() || 'sans réponse' });
      }
    });
    processus.stdin.end(entree ?? '');
  });
}

const refus = (erreur: unknown): Resultat => {
  if (erreur === 'annule') return { ok: false, raison: ANNULEE };
  if (erreur === 'indisponible') return { ok: false, raison: "Cet ordinateur ne gère pas les clés d'accès." };
  if (erreur === 'existe') return { ok: false, raison: "Cet ordinateur a déjà une clé d'accès pour ce compte." };
  return { ok: false, raison: "La clé d'accès n'a pas pu être utilisée (" + String(erreur) + ').' };
};

// ─── Mac : la Secure Enclave ─────────────────────────────────────────────

interface CleGardee {
  id: string;
  rpId: string;
  userHandle: string;
  nom: string;
  cle: string;
}

const dossierDesCles = () => join(app.getPath('userData'), 'cles-acces');

async function clesGardees(rpId: string): Promise<CleGardee[]> {
  let noms: string[];
  try {
    noms = await readdir(dossierDesCles());
  } catch {
    return [];
  }
  const cles: CleGardee[] = [];
  for (const nom of noms.filter((n) => n.endsWith('.json'))) {
    try {
      const lue = JSON.parse(await readFile(join(dossierDesCles(), nom), 'utf8')) as CleGardee;
      if (lue.rpId === rpId) cles.push(lue);
    } catch {
      // Un fichier abîmé est ignoré.
    }
  }
  return cles;
}

async function creerSurMac(options: Options, nomApplication: string): Promise<Resultat> {
  const rpId = String(options.rp?.id ?? '');
  const exclues = new Set<string>((options.excludeCredentials ?? []).map((c: { id: string }) => c.id));
  if ((await clesGardees(rpId)).some((c) => exclues.has(c.id))) return refus('existe');
  const client = donneesDuClient('webauthn.create', String(options.challenge), rpId);
  const r = await lancer(join(NATIF, 'humalis-cles'), ['creer', nomApplication + " : créer une clé d'accès"]);
  if (r.erreur) return refus(r.erreur);
  const publique = Buffer.from(String(r.publique), 'base64');
  const id = randomBytes(16);
  const cose = cbor(new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, publique.subarray(0, 32)], [-3, publique.subarray(32, 64)]]));
  const longueur = Buffer.from([id.length >> 8, id.length & 0xff]);
  // Présence (0x01), vérification (0x04), données de la clé (0x40) ; compteur à zéro, AAGUID nul.
  const donneesAuth = Buffer.concat([sha256(rpId), Buffer.from([0x45]), entier32(0), Buffer.alloc(16), longueur, id, cose]);
  const attestation = cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', donneesAuth]]));
  await mkdir(dossierDesCles(), { recursive: true });
  const gardee: CleGardee = { id: enTexte(id), rpId, userHandle: String(options.user?.id ?? ''), nom: String(options.user?.name ?? ''), cle: String(r.cle) };
  await writeFile(join(dossierDesCles(), sha256(gardee.id).toString('hex') + '.json'), JSON.stringify(gardee), { mode: 0o600 });
  return {
    ok: true,
    reponse: {
      id: gardee.id, rawId: gardee.id, type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {},
      response: { clientDataJSON: enTexte(client), attestationObject: enTexte(attestation), transports: ['internal'] },
    },
  };
}

async function signerSurMac(options: Options, fenetre: BrowserWindow | null, nomApplication: string): Promise<Resultat> {
  const rpId = String(options.rpId ?? '');
  const permises = new Set<string>((options.allowCredentials ?? []).map((c: { id: string }) => c.id));
  const cles = (await clesGardees(rpId)).filter((c) => permises.size === 0 || permises.has(c.id));
  if (cles.length === 0) return { ok: false, raison: "Aucune clé d'accès de ce compte sur cet ordinateur." };
  let choisie = cles[0]!;
  if (cles.length > 1) {
    // Plusieurs comptes : la personne choisit, comme dans la fenêtre d'un navigateur.
    const boutons = [...cles.map((c) => c.nom || c.id.slice(0, 8)), 'Annuler'];
    const choix = await (fenetre ? dialog.showMessageBox(fenetre, { type: 'question', message: 'Se connecter avec quel compte ?', buttons: boutons, cancelId: cles.length }) : dialog.showMessageBox({ type: 'question', message: 'Se connecter avec quel compte ?', buttons: boutons, cancelId: cles.length }));
    if (choix.response >= cles.length) return { ok: false, raison: ANNULEE };
    choisie = cles[choix.response]!;
  }
  const client = donneesDuClient('webauthn.get', String(options.challenge), rpId);
  const donneesAuth = Buffer.concat([sha256(rpId), Buffer.from([0x05]), entier32(0)]);
  const aSigner = Buffer.concat([donneesAuth, sha256(client)]);
  const r = await lancer(join(NATIF, 'humalis-cles'), ['signer', nomApplication + ' : se connecter'], JSON.stringify({ cle: choisie.cle, donnees: aSigner.toString('base64') }));
  if (r.erreur) return refus(r.erreur);
  return {
    ok: true,
    reponse: {
      id: choisie.id, rawId: choisie.id, type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {},
      response: { clientDataJSON: enTexte(client), authenticatorData: enTexte(donneesAuth), signature: enTexte(Buffer.from(String(r.signature), 'base64')), ...(choisie.userHandle ? { userHandle: choisie.userHandle } : {}) },
    },
  };
}

// ─── Windows : Windows Hello ─────────────────────────────────────────────

/** Le numéro de la fenêtre, pour que Windows Hello s'ouvre devant elle. */
const numeroDeFenetre = (fenetre: BrowserWindow | null) => {
  if (!fenetre) return '0';
  const h = fenetre.getNativeWindowHandle();
  return h.length >= 8 ? h.readBigUInt64LE().toString() : String(h.readUInt32LE());
};

const powershell = (entree: Record<string, unknown>) =>
  lancer('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(NATIF, 'cles-windows.ps1')], JSON.stringify(entree));

async function creerSurWindows(options: Options, fenetre: BrowserWindow | null): Promise<Resultat> {
  const rpId = String(options.rp?.id ?? '');
  const client = donneesDuClient('webauthn.create', String(options.challenge), rpId);
  const r = await powershell({
    action: 'creer',
    fenetre: numeroDeFenetre(fenetre),
    rpId,
    rpNom: String(options.rp?.name ?? rpId),
    utilisateur: enOctets(options.user?.id ?? '').toString('base64'),
    nom: String(options.user?.name ?? ''),
    affiche: String(options.user?.displayName ?? options.user?.name ?? ''),
    client: client.toString('base64'),
    algorithmes: (options.pubKeyCredParams ?? []).map((p: { alg: number }) => p.alg),
    exclues: (options.excludeCredentials ?? []).map((c: { id: string }) => enOctets(c.id).toString('base64')),
    delai: Number(options.timeout) || 60000,
    verification: String(options.authenticatorSelection?.userVerification ?? 'preferred'),
  });
  if (r.erreur) return refus(r.erreur);
  const id = enTexte(Buffer.from(String(r.id), 'base64'));
  return {
    ok: true,
    reponse: {
      id, rawId: id, type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {},
      response: { clientDataJSON: enTexte(client), attestationObject: enTexte(Buffer.from(String(r.attestation), 'base64')), transports: r.transports ?? ['internal'] },
    },
  };
}

async function signerSurWindows(options: Options, fenetre: BrowserWindow | null): Promise<Resultat> {
  const rpId = String(options.rpId ?? '');
  const client = donneesDuClient('webauthn.get', String(options.challenge), rpId);
  const r = await powershell({
    action: 'signer',
    fenetre: numeroDeFenetre(fenetre),
    rpId,
    client: client.toString('base64'),
    delai: Number(options.timeout) || 60000,
    verification: String(options.userVerification ?? 'preferred'),
  });
  if (r.erreur) return refus(r.erreur);
  const id = enTexte(Buffer.from(String(r.id), 'base64'));
  const b = (cle: string) => enTexte(Buffer.from(String(r[cle]), 'base64'));
  return {
    ok: true,
    reponse: {
      id, rawId: id, type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {},
      response: { clientDataJSON: enTexte(client), authenticatorData: b('donnees'), signature: b('signature'), ...(r.utilisateur ? { userHandle: b('utilisateur') } : {}) },
    },
  };
}

// ─── Le pont ─────────────────────────────────────────────────────────────

/** Les clés d'accès, pour la page de l'application seulement. */
export function ouvrirLesCles(nomApplication: string, depuisLaPage: (evenement: IpcMainInvokeEvent) => boolean): void {
  const pret = (evenement: IpcMainInvokeEvent, options: unknown): Options | undefined =>
    depuisLaPage(evenement) && options !== null && typeof options === 'object' ? (options as Options) : undefined;
  const pasIci: Resultat = { ok: false, raison: "Les clés d'accès de l'application demandent un Mac (Touch ID) ou Windows (Windows Hello)." };
  ipcMain.handle('humalis:cles:creer', async (evenement, options: unknown): Promise<Resultat> => {
    const o = pret(evenement, options);
    if (!o) return { ok: false, raison: ANNULEE };
    const fenetre = BrowserWindow.fromWebContents(evenement.sender);
    if (process.platform === 'darwin') return creerSurMac(o, nomApplication);
    if (process.platform === 'win32') return creerSurWindows(o, fenetre);
    return pasIci;
  });
  ipcMain.handle('humalis:cles:signer', async (evenement, options: unknown): Promise<Resultat> => {
    const o = pret(evenement, options);
    if (!o) return { ok: false, raison: ANNULEE };
    const fenetre = BrowserWindow.fromWebContents(evenement.sender);
    if (process.platform === 'darwin') return signerSurMac(o, fenetre, nomApplication);
    if (process.platform === 'win32') return signerSurWindows(o, fenetre);
    return pasIci;
  });
}
`;

/** Le pont (preload) : creer et signer, rien d'autre. */
export const PONT_CLES = `
contextBridge.exposeInMainWorld('humalisCles', {
  creer: (options: unknown): Promise<unknown> => ipcRenderer.invoke('humalis:cles:creer', options),
  signer: (options: unknown): Promise<unknown> => ipcRenderer.invoke('humalis:cles:signer', options),
});
`;

/** electron/natif/cles-mac.swift : le gardien de la clé, sur Mac. */
export const CLES_MAC_SWIFT = String.raw`// Produit par Humalis : les clés d'accès de l'application de bureau sur Mac.
// La clé privée naît et reste dans la Secure Enclave ; Touch ID (ou le mot de passe
// de la session) la débloque à chaque usage. Ce programme ne voit jamais la clé :
// il garde seulement sa forme chiffrée, que seule cette Secure Enclave sait relire.
//
//   humalis-cles creer "raison"                         → {"cle": "…", "publique": "…"}
//   humalis-cles signer "raison" ← {"cle","donnees"}     → {"signature": "…"} (DER)
//
// En cas de refus : {"erreur": "annule" | "indisponible" | "…"} et le code 1.
import CryptoKit
import Foundation
import LocalAuthentication

func repondre(_ objet: [String: String], code: Int32 = 0) -> Never {
    let donnees = try! JSONSerialization.data(withJSONObject: objet)
    FileHandle.standardOutput.write(donnees)
    exit(code)
}

func echouer(_ erreur: Error) -> Never {
    if let la = erreur as? LAError, [.userCancel, .systemCancel, .appCancel, .authenticationFailed, .userFallback].contains(la.code) {
        repondre(["erreur": "annule"], code: 1)
    }
    let ns = erreur as NSError
    if ns.code == -128 { repondre(["erreur": "annule"], code: 1) }
    if ns.domain == LAError.errorDomain, ns.code == LAError.Code.biometryNotAvailable.rawValue || ns.code == LAError.Code.passcodeNotSet.rawValue {
        repondre(["erreur": "indisponible"], code: 1)
    }
    repondre(["erreur": "\(ns.localizedDescription) (\(ns.domain) \(ns.code))"], code: 1)
}

let arguments = CommandLine.arguments
guard arguments.count >= 3, ["creer", "signer"].contains(arguments[1]) else {
    repondre(["erreur": "usage : humalis-cles creer|signer \"raison\""], code: 2)
}
guard SecureEnclave.isAvailable else { repondre(["erreur": "indisponible"], code: 1) }
let raison = arguments[2]

/// Touch ID quand il existe, sinon le mot de passe de la session.
func controle() throws -> SecAccessControl {
    var erreur: Unmanaged<CFError>?
    guard let c = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, [.privateKeyUsage, .userPresence], &erreur) else {
        throw erreur!.takeRetainedValue() as Error
    }
    return c
}

let attente = DispatchSemaphore(value: 0)
Task {
    do {
        let contexte = LAContext()
        contexte.localizedReason = raison
        if arguments[1] == "creer" {
            // La personne est vérifiée dès la création, comme l'exige une clé d'accès.
            _ = try await contexte.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: raison)
            let cle = try SecureEnclave.P256.Signing.PrivateKey(accessControl: try controle(), authenticationContext: contexte)
            repondre(["cle": cle.dataRepresentation.base64EncodedString(), "publique": cle.publicKey.rawRepresentation.base64EncodedString()])
        } else {
            let entree = FileHandle.standardInput.readDataToEndOfFile()
            guard let lu = try JSONSerialization.jsonObject(with: entree) as? [String: String],
                  let blob = lu["cle"].flatMap({ Data(base64Encoded: $0) }),
                  let donnees = lu["donnees"].flatMap({ Data(base64Encoded: $0) }) else {
                repondre(["erreur": "entrée illisible"], code: 2)
            }
            let cle = try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: blob, authenticationContext: contexte)
            let signature = try cle.signature(for: donnees)
            repondre(["signature": signature.derRepresentation.base64EncodedString()])
        }
    } catch {
        echouer(error)
    }
}
attente.wait()
`;

/**
 * electron/natif/cles-windows.ps1 : Windows Hello par webauthn.dll. Le C# est
 * compilé par PowerShell (Add-Type, C# 5 de .NET Framework) : rien à
 * installer. L'entrée et la sortie sont du JSON, en base64 classique.
 */
export const CLES_WINDOWS_PS1 = String.raw`# Produit par Humalis : les clés d'accès de l'application de bureau sur Windows (Windows Hello).
# Entrée (JSON) : action « creer » ou « signer » et ses données. Sortie (JSON) : la réponse, ou {"erreur": "…"}.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$source = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class HumalisCles
{
    const string Dll = "webauthn.dll";

    [StructLayout(LayoutKind.Sequential)] struct Rp { public uint Version; public IntPtr Id; public IntPtr Nom; public IntPtr Icone; }
    [StructLayout(LayoutKind.Sequential)] struct Utilisateur { public uint Version; public uint TailleId; public IntPtr Id; public IntPtr Nom; public IntPtr Icone; public IntPtr NomAffiche; }
    [StructLayout(LayoutKind.Sequential)] struct DonneesClient { public uint Version; public uint Taille; public IntPtr Json; public IntPtr Empreinte; }
    [StructLayout(LayoutKind.Sequential)] struct Parametre { public uint Version; public IntPtr Type; public int Algorithme; }
    [StructLayout(LayoutKind.Sequential)] struct Parametres { public uint Nombre; public IntPtr Liste; }
    [StructLayout(LayoutKind.Sequential)] struct Identite { public uint Version; public uint Taille; public IntPtr Id; public IntPtr Type; }
    [StructLayout(LayoutKind.Sequential)] struct Identites { public uint Nombre; public IntPtr Liste; }
    [StructLayout(LayoutKind.Sequential)] struct Extensions { public uint Nombre; public IntPtr Liste; }
    [StructLayout(LayoutKind.Sequential)] struct OptionsCreation { public uint Version; public uint Delai; public Identites Exclues; public Extensions Extensions; public uint Attachement; public int Residente; public uint Verification; public uint Attestation; public uint Drapeaux; public IntPtr Annulation; public IntPtr ExclusionEtendue; }
    [StructLayout(LayoutKind.Sequential)] struct OptionsSignature { public uint Version; public uint Delai; public Identites Permises; public Extensions Extensions; public uint Attachement; public uint Verification; public uint Drapeaux; public IntPtr U2fId; public IntPtr U2fUtilise; public IntPtr Annulation; public IntPtr PermissionEtendue; }
    [StructLayout(LayoutKind.Sequential)] struct Attestation { public uint Version; public IntPtr Format; public uint TailleDonnees; public IntPtr Donnees; public uint TailleAttestation; public IntPtr Brute; public uint TypeDecodage; public IntPtr Decodee; public uint TailleObjet; public IntPtr Objet; public uint TailleId; public IntPtr Id; public Extensions Extensions; public uint Transport; }
    [StructLayout(LayoutKind.Sequential)] struct Signature { public uint Version; public uint TailleDonnees; public IntPtr Donnees; public uint TailleSignature; public IntPtr Octets; public Identite Identite; public uint TailleUtilisateur; public IntPtr IdUtilisateur; }

    [DllImport(Dll)] static extern uint WebAuthNGetApiVersionNumber();
    [DllImport(Dll)] static extern int WebAuthNAuthenticatorMakeCredential(IntPtr fenetre, IntPtr rp, IntPtr utilisateur, IntPtr parametres, IntPtr client, IntPtr options, out IntPtr attestation);
    [DllImport(Dll, CharSet = CharSet.Unicode)] static extern int WebAuthNAuthenticatorGetAssertion(IntPtr fenetre, string rpId, IntPtr client, IntPtr options, out IntPtr signature);
    [DllImport(Dll)] static extern void WebAuthNFreeCredentialAttestation(IntPtr attestation);
    [DllImport(Dll)] static extern void WebAuthNFreeAssertion(IntPtr signature);
    [DllImport(Dll)] static extern IntPtr WebAuthNGetErrorName(int code);

    sealed class Arene : IDisposable
    {
        readonly List<IntPtr> blocs = new List<IntPtr>();
        public IntPtr Texte(string texte) { IntPtr p = Marshal.StringToHGlobalUni(texte); blocs.Add(p); return p; }
        public IntPtr Octets(byte[] octets) { IntPtr p = Marshal.AllocHGlobal(Math.Max(1, octets.Length)); blocs.Add(p); Marshal.Copy(octets, 0, p, octets.Length); return p; }
        public IntPtr Structure(object valeur) { IntPtr p = Marshal.AllocHGlobal(Marshal.SizeOf(valeur)); blocs.Add(p); Marshal.StructureToPtr(valeur, p, false); return p; }
        public IntPtr Tableau<T>(T[] valeurs) where T : struct
        {
            int taille = Marshal.SizeOf(typeof(T));
            IntPtr p = Marshal.AllocHGlobal(Math.Max(1, taille * valeurs.Length));
            blocs.Add(p);
            for (int i = 0; i < valeurs.Length; i++) Marshal.StructureToPtr(valeurs[i], new IntPtr(p.ToInt64() + i * taille), false);
            return p;
        }
        public void Dispose() { foreach (IntPtr p in blocs) Marshal.FreeHGlobal(p); }
    }

    static byte[] Lire(IntPtr p, uint taille) { byte[] o = new byte[taille]; if (taille > 0) Marshal.Copy(p, o, 0, (int)taille); return o; }

    static string Erreur(int code)
    {
        IntPtr p = WebAuthNGetErrorName(code);
        string nom = p == IntPtr.Zero ? null : Marshal.PtrToStringUni(p);
        // Annulée, ou la fenêtre de Windows Hello fermée.
        if (nom == "NotAllowedError" || nom == "AbortError") return "annule";
        if (nom == "InvalidStateError") return "existe";
        return (nom ?? "UnknownError") + " (0x" + code.ToString("X8") + ")";
    }

    static uint Verification(string v) { return v == "required" ? 1u : v == "preferred" ? 2u : v == "discouraged" ? 3u : 0u; }

    static IntPtr Client(Arene a, byte[] json)
    {
        DonneesClient d = new DonneesClient(); d.Version = 1; d.Taille = (uint)json.Length; d.Json = a.Octets(json); d.Empreinte = a.Texte("SHA-256");
        return a.Structure(d);
    }

    public static bool Disponible()
    {
        try { return WebAuthNGetApiVersionNumber() >= 1; } catch (DllNotFoundException) { return false; } catch (EntryPointNotFoundException) { return false; }
    }

    /// Rend : id, attestation, transport (masque) ; ou lève l'erreur.
    public static string[] Creer(long fenetre, string rpId, string rpNom, byte[] idUtilisateur, string nom, string affiche, byte[] client, int[] algorithmes, byte[][] exclues, uint delai, string verification)
    {
        using (Arene a = new Arene())
        {
            Parametre[] parametres = new Parametre[algorithmes.Length];
            for (int i = 0; i < algorithmes.Length; i++) { parametres[i].Version = 1; parametres[i].Type = a.Texte("public-key"); parametres[i].Algorithme = algorithmes[i]; }
            Identite[] ex = new Identite[exclues.Length];
            for (int i = 0; i < exclues.Length; i++) { ex[i].Version = 1; ex[i].Taille = (uint)exclues[i].Length; ex[i].Id = a.Octets(exclues[i]); ex[i].Type = a.Texte("public-key"); }
            Rp rp = new Rp(); rp.Version = 1; rp.Id = a.Texte(rpId); rp.Nom = a.Texte(rpNom);
            Utilisateur u = new Utilisateur(); u.Version = 1; u.TailleId = (uint)idUtilisateur.Length; u.Id = a.Octets(idUtilisateur); u.Nom = a.Texte(nom); u.NomAffiche = a.Texte(affiche);
            Parametres ps = new Parametres(); ps.Nombre = (uint)parametres.Length; ps.Liste = a.Tableau(parametres);
            OptionsCreation o = new OptionsCreation();
            o.Version = 3; o.Delai = delai;
            o.Exclues.Nombre = (uint)ex.Length; o.Exclues.Liste = a.Tableau(ex);
            // L'authentificateur de l'ordinateur (Windows Hello), une clé découvrable, sans attestation.
            o.Attachement = 1; o.Residente = 1; o.Verification = Verification(verification); o.Attestation = 1;
            IntPtr resultat;
            int code = WebAuthNAuthenticatorMakeCredential(new IntPtr(fenetre), a.Structure(rp), a.Structure(u), a.Structure(ps), Client(a, client), a.Structure(o), out resultat);
            if (code != 0 || resultat == IntPtr.Zero) throw new Exception(Erreur(code));
            try
            {
                Attestation r = (Attestation)Marshal.PtrToStructure(resultat, typeof(Attestation));
                return new string[] { Convert.ToBase64String(Lire(r.Id, r.TailleId)), Convert.ToBase64String(Lire(r.Objet, r.TailleObjet)), r.Transport.ToString() };
            }
            finally { WebAuthNFreeCredentialAttestation(resultat); }
        }
    }

    /// Rend : id, données de l'authentificateur, signature, identifiant de la personne.
    public static string[] Signer(long fenetre, string rpId, byte[] client, uint delai, string verification)
    {
        using (Arene a = new Arene())
        {
            OptionsSignature o = new OptionsSignature(); o.Version = 4; o.Delai = delai; o.Verification = Verification(verification);
            IntPtr resultat;
            int code = WebAuthNAuthenticatorGetAssertion(new IntPtr(fenetre), rpId, Client(a, client), a.Structure(o), out resultat);
            if (code != 0 || resultat == IntPtr.Zero) throw new Exception(Erreur(code));
            try
            {
                Signature s = (Signature)Marshal.PtrToStructure(resultat, typeof(Signature));
                return new string[] { Convert.ToBase64String(Lire(s.Identite.Id, s.Identite.Taille)), Convert.ToBase64String(Lire(s.Donnees, s.TailleDonnees)), Convert.ToBase64String(Lire(s.Octets, s.TailleSignature)), Convert.ToBase64String(Lire(s.IdUtilisateur, s.TailleUtilisateur)) };
            }
            finally { WebAuthNFreeAssertion(resultat); }
        }
    }
}
'@
function Repondre($objet) { [Console]::Out.WriteLine(($objet | ConvertTo-Json -Compress)); exit 0 }
try {
    $e = [Console]::In.ReadToEnd() | ConvertFrom-Json
    Add-Type -TypeDefinition $source -Language CSharp
    if (-not [HumalisCles]::Disponible()) { Repondre @{ erreur = 'indisponible' } }
    $client = [Convert]::FromBase64String($e.client)
    # Windows Hello s'ouvre devant une fenêtre de ce programme : webauthn.dll refuse celle d'un autre (Electron).
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $proprietaire = New-Object Windows.Forms.Form
    $proprietaire.Text = 'Clé d''accès'
    $proprietaire.ShowInTaskbar = $false
    $proprietaire.FormBorderStyle = 'FixedToolWindow'
    $proprietaire.StartPosition = 'CenterScreen'
    $proprietaire.Size = New-Object Drawing.Size(320, 120)
    $proprietaire.TopMost = $true
    $proprietaire.Show()
    $proprietaire.Activate()
    $fenetre = $proprietaire.Handle.ToInt64()
    if ($e.action -eq 'creer') {
        $exclues = [byte[][]]@($e.exclues | ForEach-Object { , [Convert]::FromBase64String($_) })
        $r = [HumalisCles]::Creer($fenetre, $e.rpId, $e.rpNom, [Convert]::FromBase64String($e.utilisateur), $e.nom, $e.affiche, $client, [int[]]@($e.algorithmes), $exclues, [uint32]$e.delai, $e.verification)
        $masque = [uint32]$r[2]
        $transports = @()
        if ($masque -band 0x01) { $transports += 'usb' }
        if ($masque -band 0x02) { $transports += 'nfc' }
        if ($masque -band 0x04) { $transports += 'ble' }
        if ($masque -band 0x10) { $transports += 'internal' }
        if ($masque -band 0x20) { $transports += 'hybrid' }
        Repondre @{ id = $r[0]; attestation = $r[1]; transports = $transports }
    }
    $r = [HumalisCles]::Signer($fenetre, $e.rpId, $client, [uint32]$e.delai, $e.verification)
    Repondre @{ id = $r[0]; donnees = $r[1]; signature = $r[2]; utilisateur = $r[3] }
} catch {
    $raison = $_.Exception.Message
    if ($_.Exception.InnerException) { $raison = $_.Exception.InnerException.Message }
    Repondre @{ erreur = $raison }
}
`;

/**
 * electron/natif/construire.mjs : sur Mac, compile le gardien Swift avant
 * l'application (npm run build). Ailleurs, il n'y a rien à compiler.
 */
export const CONSTRUIRE_NATIF_MJS = `// Produit par Humalis : sur Mac, compile electron/natif/humalis-cles (Swift, la Secure Enclave).
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform === 'darwin') {
  const ici = dirname(fileURLToPath(import.meta.url));
  execFileSync('xcrun', ['swiftc', '-O', join(ici, 'cles-mac.swift'), '-o', join(ici, 'humalis-cles')], { stdio: 'inherit' });
}
`;

/** La section du LISEZMOI. */
export const LISEZMOI_CLES = `
## Les clés d'accès

\`se connecter par cle d'acces\` et \`ajouter cle d'acces\` passent par l'ordinateur,
pas par le navigateur intégré :

- **Mac** : Touch ID (ou le mot de passe de la session) débloque une clé née
  dans la Secure Enclave. \`npm run build\` compile son gardien,
  \`electron/natif/humalis-cles\` (Swift, Xcode demandé). La clé reste sur ce
  Mac : elle n'est pas synchronisée par iCloud.
- **Windows** : Windows Hello, par l'API WebAuthn de Windows (webauthn.dll),
  sans paquet MSIX ni rien à installer.
- **Linux** : pas encore ; la page le dit.

Sur le serveur, \`WEBAUTHN_ALLOWED_ORIGINS\` commence par
\`https://<domaine des clés>\` : l'application signe pour ce domaine, comme
le font les applications Apple, Android et Windows.
`;
