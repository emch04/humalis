/**
 * Les formes d'application spéciales sur Apple, chacune dans sa technologie (validées par Emch le 10 novembre 2026) :
 * WidgetKit (widgets, tuiles du Centre de contrôle), ActivityKit (activité en direct et îlot dynamique),
 * App Intents (commandes vocales), Core Spotlight, CarPlay, UIApplicationShortcutItem, les types de documents,
 * les services du Mac (clic droit dans le Finder), SMAppService, MenuBarExtra, les catégories de notification,
 * et des cibles de plus dans le même projet : l'extension de partage, le clavier, la montre, la télévision, l'App Clip.
 *
 * Les cibles qui montrent des pages (widgets, montre, télévision, App Clip) reprennent le dossier de l'application :
 * les pages et la bibliothèque Humalis n'y sont écrites qu'une fois. `HUMALIS_AUTRE_CIBLE` y écarte ce qui n'est
 * qu'à l'application. Les valeurs partagées passent par un groupe d'applications (App Group).
 */
import type { Application, Ecran, Etat } from '../../ri/types.js';
import { Ecrivain } from '../web/ecrivain.js';
import { EcrivainActions, type HotePage } from './actions.js';
import { SYMBOLES } from './icones.js';
import { chaineSwift, nomPage, nomRoute, nomSwift } from './noms.js';
import { GenerateurPage, type ContexteApple } from './page.js';
import { Valeurs, type Portee } from './valeurs.js';
import type { CibleXcode } from './xcode.js';

export interface ContexteFormes {
  application: Application;
  app: ContexteApple;
  portee: Portee;
  /** L'identifiant Swift de l'application (« Boutique »). */
  nom: string;
  nomAffiche: string;
  identifiant: string;
  equipe?: string;
  /** L'application a ses liens profonds (« liens "magasin" ») : une adresse qui n'est pas aux formes leur revient. */
  liens: boolean;
  notifications: boolean;
  /** Le serveur met à jour les activités (« mettre a jour activite ») : chacune envoie son jeton au serveur. */
  jetonActivite?: boolean;
}

/** Ce que les formes ajoutent au projet. */
export interface FormesProduites {
  /** Les fichiers, depuis la racine du projet. */
  fichiers: Map<string, string>;
  cibles: CibleXcode[];
  /** Le groupe d'applications, s'il en faut un. */
  groupe?: string;
  /** Les variables partagées dont un changement intéresse Spotlight ou CarPlay. */
  suivies: Set<string>;
  /** Des clés de plus dans Info.plist. */
  infos: string;
  /** Des droits de plus pour le simulateur iPhone seulement (CarPlay). */
  droitsSimulateur?: string;
  /** Le schéma d'adresse propre aux formes (un widget touché, un partage reçu sur Mac). */
  schemaInterne?: string;
  /** Ce que l'application écrit en plus : scènes, modificateurs de la racine, délégué du système. */
  app: { scenes: string; racine: string; delegue: boolean; autresCibles: boolean; url: boolean };
  /** Les pages qui ne sont pas des pages d'entrée de l'iPhone et du Mac. */
  horsEntree: Set<string>;
}

/** Les types de fichier du système, par extension ; les autres sont déclarés par l'application. */
const TYPES_FICHIER: Record<string, string> = {
  '.csv': 'public.comma-separated-values-text', '.tsv': 'public.tab-separated-values-text', '.pdf': 'com.adobe.pdf',
  '.jpg': 'public.jpeg', '.jpeg': 'public.jpeg', '.png': 'public.png', '.gif': 'com.compuserve.gif', '.heic': 'public.heic',
  '.webp': 'org.webmproject.webp', '.svg': 'public.svg-image', '.txt': 'public.plain-text', '.json': 'public.json',
  '.xml': 'public.xml', '.html': 'public.html', '.md': 'net.daringfireball.markdown', '.rtf': 'public.rtf', '.zip': 'public.zip-archive',
  '.mp3': 'public.mp3', '.mp4': 'public.mpeg-4', '.mov': 'com.apple.quicktime-movie', '.wav': 'com.microsoft.waveform-audio',
  '.doc': 'com.microsoft.word.doc', '.docx': 'org.openxmlformats.wordprocessingml.document', '.xls': 'com.microsoft.excel.xls',
  '.xlsx': 'org.openxmlformats.spreadsheetml.sheet', '.pptx': 'org.openxmlformats.presentationml.presentation',
  '.ics': 'com.apple.ical.ics', '.vcf': 'public.vcard',
};

/** Les noms d'icônes Lucide les plus courants (ceux des exemples des formes), en SF Symbols. */
const LUCIDE: Record<string, string> = {
  user: 'person', users: 'person.2', clock: 'clock', list: 'list.bullet', home: 'house', search: 'magnifyingglass', settings: 'gearshape',
  bell: 'bell', heart: 'heart', star: 'star', calendar: 'calendar', mail: 'envelope', phone: 'phone', map: 'map', 'map-pin': 'mappin',
  camera: 'camera', image: 'photo', 'shopping-cart': 'cart', 'shopping-bag': 'bag', package: 'shippingbox', truck: 'truck.box', plus: 'plus',
  check: 'checkmark', x: 'xmark', file: 'doc', 'file-text': 'doc.text', folder: 'folder', send: 'paperplane', share: 'square.and.arrow.up',
  play: 'play', pause: 'pause', mic: 'mic', timer: 'timer', 'credit-card': 'creditcard', wallet: 'wallet.bifold', zap: 'bolt', car: 'car',
  'message-circle': 'message', 'log-in': 'arrow.right.square', 'log-out': 'rectangle.portrait.and.arrow.right', lock: 'lock', tag: 'tag', gift: 'gift',
};

/** Une icône d'une forme : un nom Humalis, un nom Lucide, sinon un cercle (le système refuse un nom inconnu). */
export const iconeForme = (nom: string): string => SYMBOLES[nom] ?? LUCIDE[nom] ?? 'circle';

const echapperXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const chaineXml = (t: string) => `<string>${echapperXml(t)}</string>`;

/** Les formes du programme qui demandent quelque chose à la cible Apple. */
export function aDesFormes(application: Application): boolean {
  const f = application.formes;
  const actions = JSON.stringify([application.ecrans, application.composants]);
  return Boolean(
    (f && (f.widgets.length || f.activites.length || f.raccourcisIcone.length || f.commandesVocales.length || f.demarrage || f.recherches.length || f.tuiles.length || f.minis.length || f.voitures.length || f.menusClicDroit.length || f.claviers.length || f.partageRecu || f.fichiersOuverts.length || f.boutonsNotification.length)) ||
      application.ecrans.some((e) => e.barreSysteme || e.appareil) ||
      /"type":"(activite","mode"|dire")/.test(actions),
  );
}

export function genererFormesApple(c: ContexteFormes): FormesProduites {
  const { application, app } = c;
  const f = application.formes;
  const fichiers = new Map<string, string>();
  const cibles: CibleXcode[] = [];
  const horsEntree = new Set(application.ecrans.filter((e) => e.barreSysteme || e.appareil).map((e) => e.nom));
  const schema = c.identifiant.toLowerCase().replace(/[^a-z0-9.+-]/g, '-');
  const widgets = f?.widgets ?? [];
  const activites = f?.activites ?? [];
  const tuiles = f?.tuiles ?? [];
  const voitures = f?.voitures ?? [];
  const recherches = f?.recherches ?? [];
  const vocales = f?.commandesVocales ?? [];
  const minis = f?.minis ?? [];
  const montre = application.ecrans.filter((e) => e.appareil === 'montre');
  const tele = application.ecrans.filter((e) => e.appareil === 'tele');
  const barres = application.ecrans.filter((e) => e.barreSysteme);
  const avecWidgets = widgets.length + activites.length + tuiles.length > 0;
  const groupe = avecWidgets || f?.partageRecu || vocales.length ? `group.${c.identifiant}` : undefined;
  if (groupe && !c.equipe) app.avertir(1, "les widgets, les activités, les tuiles et le partage reçu lisent les valeurs de l'application par un groupe d'applications : sans --equipe, le Mac ne peut pas l'ouvrir. Compilez avec --equipe.");
  const suivies = new Set([...recherches.map((r) => r.liste), ...voitures.map((v) => v.liste)]);

  // ─── Les pages visées : une route sans paramètre ─────────────────────────
  const visees = new Set<string>();
  const viser = (page: string | undefined, ligne: number, quoi: string) => {
    if (page === undefined) return;
    const info = app.pages.get(page);
    if (info && info.parametres.length > 0) app.refuser(ligne, `${quoi} vise la page « ${page} », qui attend un paramètre : sur Apple, elle doit pouvoir s'ouvrir seule`);
    else visees.add(page);
  };
  const route = (page: string) => `.${nomRoute(page)}${app.pages.get(page)?.filtres.length ? '()' : ''}`;
  for (const w of widgets) viser(w.vers, w.ligne, `le widget « ${w.nom} »`);
  for (const r of f?.raccourcisIcone ?? []) viser(r.page, r.ligne, `le raccourci « ${r.titre} »`);
  for (const v of vocales) viser(v.vers, v.ligne, `la commande vocale « ${v.phrase} »`);
  for (const r of recherches) viser(r.vers, r.ligne, 'la recherche du système');
  for (const v of voitures) viser(v.vers, v.ligne, `l'écran de voiture « ${v.nom} »`);
  for (const m of minis) viser(m.page, m.ligne, `la mini-application « ${m.nom} »`);
  if (minis.length > 1) app.refuser(minis[1]!.ligne, `une application Apple n'a qu'une App Clip : « ${minis[1]!.nom} » est en trop`);
  if (vocales.length > 10) app.refuser(vocales[10]!.ligne, 'Siri accepte au plus dix commandes vocales par application');

  // ─── Les fonctions d'actions, écrites sans page ouverte ──────────────────
  const fonctions: string[] = [];
  const fonctionActions = (nom: string, ecran: Ecran, quoi: string, parametres: string, prelude: (etat: Etat) => string[] | undefined) => {
    const { portee } = c;
    portee.variables.clear();
    for (const p of application.partages) portee.variables.set(p.nom, { code: `Partage.commun.${nomSwift(p.nom)}`, type: p.type, opt: p.facultatif ?? false });
    let ligne = ecran.ligne;
    const valeurs = new Valeurs(app.types, portee, (q) => app.refuser(ligne, `${q} ne se traduit pas en Swift (${quoi})`));
    const debut: string[] = [];
    for (const etat of ecran.etat) {
      portee.variables.set(etat.nom, { code: nomSwift(etat.nom), type: etat.type, opt: etat.facultatif ?? false });
      const propre = prelude(etat);
      if (propre) {
        debut.push(...propre);
        continue;
      }
      const initiale = valeurs.expr(etat.initiale, etat.type);
      debut.push(`var ${nomSwift(etat.nom)}: ${app.types.swift(etat.type, etat.facultatif)} = ${etat.facultatif ? valeurs.versOpt(initiale, etat.type) : valeurs.vers(initiale, etat.type)}`);
    }
    const hote: HotePage = {
      valeurs,
      refuser: (l, q) => app.refuser(l, `${q} (${quoi})`),
      ligne,
      pages: app.pages,
      etatsRequetes: new Set(),
      estEtat: (n) => portee.variables.has(n),
      nomEtatRequete: (n) => n,
      estHorsLigne: (n) => application.partages.some((p) => p.nom === n && p.horsLigne),
    };
    const corps = new Ecrivain();
    const ecrivain = new EcrivainActions(hote, new Map());
    for (const g of ecran.gestionnaires) {
      ligne = g.ligne;
      hote.ligne = g.ligne;
      corps.indenter(() => ecrivain.ecrire(corps, g.actions));
    }
    const texte = corps.texte();
    if (/\b(planificateur\.|directs\.|relances\[)/.test(texte)) app.refuser(ligne, `${quoi} : une minuterie ou une lecture « en direct » demande une page ouverte`);
    fonctions.push(`/** ${quoi[0]!.toUpperCase()}${quoi.slice(1)}. */\n@MainActor func ${nom}(${parametres}) async {\n${/\bjetons\./.test(texte) ? '  let jetons = JetonsRequetes()\n' : ''}${debut.map((l) => `  ${l}\n`).join('')}${texte}}\n`);
  };
  // Une fiche reçue du système (partage, fichier) : déclarée par l'analyse, remplie champ par champ.
  const ficheRecue = (nomEtat: string, champs: string[]) => (etat: Etat) => {
    if (etat.nom !== nomEtat) return undefined;
    return [`var ${nomSwift(nomEtat)} = ${app.types.swift(etat.type)}()`, ...champs.map((ch) => `${nomSwift(nomEtat)}.${nomSwift(ch)} = ${ch}`)];
  };

  // Les pages des widgets et des activités : écrites comme des composants, sans page autour.
  const vues: { nom: string; code: string }[] = [];
  const vue = (nomVue: string, ecran: Ecran) => {
    vues.push({ nom: nomVue, code: new GenerateurPage({ ...ecran, nom: nomVue }, app, [], nomVue).generer() });
  };

  // ─── Les formes ───────────────────────────────────────────────────────────
  const swift = new Ecrivain();
  const ligne = (t = '') => swift.ligne(t);
  const infos: string[] = [];

  // Le partage reçu.
  if (f?.partageRecu) {
    fonctionActions('partageRecuHumalis', f.partageRecu.ecran, 'le partage reçu', 'texte: String, lien: String, fichier: String', ficheRecue('partage', ['texte', 'lien', 'fichier']));
    const nomCible = `${c.nom}Partage`;
    cibles.push({ nom: nomCible, genre: 'extension', plateformes: 'apple', identifiant: `${c.identifiant}.partage`, nomAffiche: c.nomAffiche, partageDossier: false, info: `Info-${nomCible}.plist`, droits: `${nomCible}.entitlements`, conditions: ['HUMALIS_AUTRE_CIBLE'] });
    fichiers.set(`Info-${nomCible}.plist`, plistExtension('com.apple.share-services', 'ControleurPartage', `
			<key>NSExtensionActivationRule</key>
			<dict>
				<key>NSExtensionActivationSupportsText</key>
				<true/>
				<key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
				<integer>1</integer>
				<key>NSExtensionActivationSupportsFileWithMaxCount</key>
				<integer>1</integer>
				<key>NSExtensionActivationSupportsImageWithMaxCount</key>
				<integer>1</integer>
			</dict>`));
    fichiers.set(`${nomCible}/${nomCible}.entitlements`, droitsExtension(groupe!));
    fichiers.set(`${nomCible}/ControleurPartage.swift`, partageSwift(groupe!, schema));
  }

  // Le fichier ouvert et le menu clic droit : une fiche « fichier » remplie depuis l'adresse du fichier, lu là où il est
  // (le Mac n'accepte pas qu'il soit recopié : l'accès au fichier est ouvert le temps de le lire).
  const fichiersOuverts = f?.fichiersOuverts ?? [];
  fichiersOuverts.forEach((o, i) => fonctionActions(`fichierOuvert${i + 1}Humalis`, o.ecran, `l'ouverture des fichiers ${o.extensions.join(', ')}`, 'nom: String, type: String, contenu: String', ficheRecue('fichier', ['nom', 'type', 'contenu'])));
  const menus = f?.menusClicDroit ?? [];
  menus.forEach((m, i) => fonctionActions(`menuClicDroit${i + 1}Humalis`, m.ecran, `le menu clic droit « ${m.titre} »`, 'nom: String, type: String, contenu: String', ficheRecue('fichier', ['nom', 'type', 'contenu'])));
  const importes = new Set<string>();
  const uti = (ext: string) => {
    const connu = TYPES_FICHIER[ext];
    if (connu) return connu;
    importes.add(ext);
    return `${c.identifiant}.${ext.slice(1)}`;
  };
  if (fichiersOuverts.length) {
    infos.push(`
	<key>CFBundleDocumentTypes</key>
	<array>${fichiersOuverts.map((o) => `
		<dict>
			<key>CFBundleTypeName</key>
			${chaineXml(`Fichiers ${o.extensions.join(', ')}`)}
			<key>CFBundleTypeRole</key>
			<string>Viewer</string>
			<key>LSHandlerRank</key>
			<string>Alternate</string>
			<key>LSItemContentTypes</key>
			<array>${[...new Set(o.extensions.map(uti))].map((t) => `
				${chaineXml(t)}`).join('')}
			</array>
		</dict>`).join('')}
	</array>
	<key>LSSupportsOpeningDocumentsInPlace</key>
	<true/>`);
  }
  if (menus.length) {
    infos.push(`
	<key>NSServices</key>
	<array>${menus.map((m, i) => `
		<dict>
			<key>NSMenuItem</key>
			<dict>
				<key>default</key>
				${chaineXml(m.titre)}
			</dict>
			<key>NSMessage</key>
			<string>menuClicDroit${i + 1}</string>
			<key>NSPortName</key>
			${chaineXml(c.nom)}
			<key>NSRequiredContext</key>
			<dict/>
			<key>NSSendFileTypes</key>
			<array>${[...new Set(m.extensions.map(uti))].map((t) => `
				${chaineXml(t)}`).join('')}
			</array>
		</dict>`).join('')}
	</array>`);
  }
  if (importes.size) {
    infos.push(`
	<key>UTImportedTypeDeclarations</key>
	<array>${[...importes].map((ext) => `
		<dict>
			<key>UTTypeIdentifier</key>
			${chaineXml(`${c.identifiant}.${ext.slice(1)}`)}
			<key>UTTypeDescription</key>
			${chaineXml(`Fichier ${ext}`)}
			<key>UTTypeConformsTo</key>
			<array>
				<string>public.data</string>
			</array>
			<key>UTTypeTagSpecification</key>
			<dict>
				<key>public.filename-extension</key>
				<array>
					${chaineXml(ext.slice(1))}
				</array>
			</dict>
		</dict>`).join('')}
	</array>`);
  }

  // Les commandes vocales : « {produit} » devient un paramètre que Siri demande.
  vocales.forEach((v, i) => fonctionActions(`commandeVocale${i + 1}Humalis`, v.ecran, `la commande vocale « ${v.phrase} »`, v.parametres.map((p) => `${nomSwift(p)}: String`).join(', '), (etat) => (v.parametres.includes(etat.nom) ? [`var ${nomSwift(etat.nom)} = ${nomSwift(etat.nom)}`] : undefined)));
  // Les tuiles et les boutons des notifications.
  tuiles.forEach((t, i) => fonctionActions(`tuile${i + 1}Humalis`, t.ecran, `la tuile « ${t.nom} »`, '', () => undefined));
  const boutons = f?.boutonsNotification ?? [];
  boutons.forEach((b, i) => fonctionActions(`boutonNotification${i + 1}Humalis`, b.ecran, `le bouton « ${b.bouton} » d'une notification`, '', () => undefined));

  // Les raccourcis de l'icône : écrits dans Info.plist, ils existent avant le premier lancement.
  const raccourcis = f?.raccourcisIcone ?? [];
  if (raccourcis.length) {
    infos.push(`
	<key>UIApplicationShortcutItems</key>
	<array>${raccourcis.map((r, i) => `
		<dict>
			<key>UIApplicationShortcutItemType</key>
			<string>raccourci${i + 1}</string>
			<key>UIApplicationShortcutItemTitle</key>
			${chaineXml(r.titre)}${r.icone ? `
			<key>UIApplicationShortcutItemIconSymbolName</key>
			${chaineXml(iconeForme(r.icone))}` : ''}
		</dict>`).join('')}
	</array>`);
  }
  if (activites.length) {
    infos.push(`
	<key>NSSupportsLiveActivities</key>
	<true/>`);
  }
  if (voitures.length) {
    infos.push(`
	<key>UIApplicationSceneManifest</key>
	<dict>
		<key>UIApplicationSupportsMultipleScenes</key>
		<true/>
		<key>UISceneConfigurations</key>
		<dict>
			<key>CPTemplateApplicationSceneSessionRoleApplication</key>
			<array>
				<dict>
					<key>UISceneConfigurationName</key>
					<string>Voiture</string>
					<key>UISceneDelegateClassName</key>
					<string>$(PRODUCT_MODULE_NAME).VoitureHumalis</string>
				</dict>
			</array>
		</dict>
	</dict>`);
  }

  // ─── Formes.swift : dans le dossier de l'application, lu aussi par les autres cibles ──
  const titres = new Map(activites.map((a) => [a.nom, titreDe(a.ecran, c)]));
  ligne("// Produit par Humalis : les formes de l'application hors de ses pages (widgets, Siri, Spotlight, CarPlay…).");
  ligne('import SwiftUI');
  ligne('import AppIntents');
  ligne('#if canImport(WidgetKit)');
  ligne('import WidgetKit');
  ligne('#endif');
  if (activites.length) ligne('#if os(iOS) && canImport(ActivityKit)\nimport ActivityKit\n#endif');
  if (recherches.length) ligne('#if canImport(CoreSpotlight) && !os(tvOS) && !os(watchOS)\nimport CoreSpotlight\nimport UniformTypeIdentifiers\n#endif');
  if (voitures.length) ligne('#if os(iOS) && canImport(CarPlay)\nimport CarPlay\n#endif');
  if (f?.demarrage) ligne('#if os(macOS)\nimport ServiceManagement\n#endif');
  if (fichiersOuverts.length || menus.length) ligne('import UniformTypeIdentifiers');
  if (boutons.length) ligne('import UserNotifications');
  ligne('import AVFoundation');
  ligne();
  // Le groupe d'applications.
  if (groupe) {
    ligne(`/** Le groupe d'applications : l'application, ses widgets et ses extensions y lisent les mêmes valeurs. */
enum GroupeHumalis {
    static let identifiant = ${chaineSwift(groupe)}
    nonisolated(unsafe) static let defauts = UserDefaults(suiteName: identifiant) ?? .standard

    static func lire(_ cle: String) -> Data? { defauts.data(forKey: cle) }

    /** Une valeur changée dans l'application : les widgets et les activités se redessinent. */
    @MainActor static func ecrire<T: Encodable>(_ cle: String, _ valeur: T) {
        guard let donnees = try? JSONEncoder().encode(valeur), donnees != defauts.data(forKey: cle) else { return }
        defauts.set(donnees, forKey: cle)
        #if !HUMALIS_AUTRE_CIBLE
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif${activites.length ? '\n        ActivitesHumalis.actualiser()' : ''}
        #endif
    }
}
`);
  }
  ligne(`/** « dire » : la réponse d'une commande vocale, sinon la voix de l'appareil. */
@MainActor enum Voix {
    /** Pendant une commande vocale : ce que Siri répondra. */
    static var reponse: String?
    private static let synthese = AVSpeechSynthesizer()

    static func dire(_ texte: String) {
        if let deja = reponse {
            reponse = deja.isEmpty ? texte : deja + " " + texte
            return
        }
        #if !os(watchOS)
        synthese.speak(AVSpeechUtterance(string: texte))
        #endif
    }
}
`);
  // Les activités en direct.
  ligne(`/** « commencer activite », « terminer activite » : ActivityKit, sur l'écran verrouillé et dans l'îlot dynamique. */
@MainActor enum ActivitesHumalis {${c.jetonActivite ? `
    /** Le dernier jeton de chaque activité, pour que le serveur l'oublie à la fin. */
    private static var jetons: [String: String] = [:]
` : ''}
    static func commencer(_ nom: String) async {
        #if os(iOS) && canImport(ActivityKit) && !HUMALIS_AUTRE_CIBLE
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            Messages.commun.afficher("Les activités en direct sont désactivées dans les réglages de l'appareil.", .avertissement)
            return
        }
        if Activity<ActiviteHumalis>.activities.contains(where: { $0.attributes.nom == nom && $0.activityState == .active }) { return }
        do {
            ${c.jetonActivite ? `let activite = try Activity.request(attributes: ActiviteHumalis(nom: nom, titre: titre(nom)), content: .init(state: .init(), staleDate: nil), pushType: .token)
            // Le serveur met l'activité à jour par APNs : il reçoit chaque jeton qu'Apple lui donne.
            Task {
                for await jeton in activite.pushTokenUpdates {
                    let texte = jeton.map { String(format: "%02x", $0) }.joined()
                    jetons[nom] = texte
                    _ = await Serveur.commun.appelReussi("/auth/activites", methode: "POST", envoi: ["nom": .texte(nom), "apple": .texte(texte)])
                }
            }` : `_ = try Activity.request(attributes: ActiviteHumalis(nom: nom, titre: titre(nom)), content: .init(state: .init(), staleDate: nil))`}
        } catch {
            Messages.commun.afficher("L'activité en direct n'a pas pu commencer.", .erreur)
        }
        #endif
    }

    static func terminer(_ nom: String) async {
        #if os(iOS) && canImport(ActivityKit) && !HUMALIS_AUTRE_CIBLE
        for activite in Activity<ActiviteHumalis>.activities where activite.attributes.nom == nom {
            await activite.end(nil, dismissalPolicy: .immediate)
        }${c.jetonActivite ? `
        if let jeton = jetons.removeValue(forKey: nom) {
            _ = await Serveur.commun.appelReussi("/auth/activites", methode: "POST", envoi: ["nom": .texte(nom), "apple": .texte(jeton), "fin": .booleen(true)])
        }` : ''}
        #endif
    }

    /** Les valeurs ont changé : chaque activité se redessine avec elles. */
    static func actualiser() {
        #if os(iOS) && canImport(ActivityKit) && !HUMALIS_AUTRE_CIBLE
        let maj = Date().timeIntervalSince1970
        Task {
            for activite in Activity<ActiviteHumalis>.activities {
                await activite.update(.init(state: .init(maj: maj), staleDate: nil))
            }
        }
        #endif
    }

    static func titre(_ nom: String) -> String {
        switch nom {${[...titres].map(([n, t]) => `
        case ${chaineSwift(n)}: return ${t}`).join('')}
        default: return nom
        }
    }
}
`);
  if (activites.length) {
    ligne(`#if os(iOS) && canImport(ActivityKit)
/** Une activité en direct : son nom dans le programme, et le titre de l'îlot dynamique. */
struct ActiviteHumalis: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var maj: Double = 0
    }
    var nom: String
    var titre: String
}
#endif
`);
  }

  // Les tuiles : l'intention est lue par l'application et par l'extension des widgets.
  tuiles.forEach((t, i) => {
    ligne(`/** La tuile « ${t.nom} » : ses actions se font dans l'application. */
struct IntentionTuile${i + 1}: AppIntent {
    static let title: LocalizedStringResource = ${chaineSwift(t.nom)}
    static let openAppWhenRun: Bool = true

    @MainActor func perform() async throws -> some IntentResult {
        await tuile${i + 1}Humalis()
        return .result()
    }
}
`);
  });

  ligne(`#if HUMALIS_AUTRE_CIBLE
/** Hors de l'application, les variables partagées n'ont personne à prévenir. */
@MainActor enum FormesHumalis {
    static func partageChange(_ nom: String) {}
}
#else`);
  // Les commandes vocales : App Intents et AppShortcuts.
  vocales.forEach((v, i) => {
    const ouvre = v.vers !== undefined || v.ecran.gestionnaires.some((g) => g.actions.some((a) => a.type !== 'dire' && a.type !== 'locale'));
    ligne(`/** La commande vocale « ${v.phrase} ». */
struct CommandeVocale${i + 1}: AppIntent {
    static let title: LocalizedStringResource = ${chaineSwift(v.phrase.replace(/\{[^}]*\}/g, '…'))}
    static let openAppWhenRun: Bool = ${ouvre}${v.parametres.map((p) => `

    @Parameter(title: ${chaineSwift(p)})
    var ${nomSwift(p)}: String`).join('')}

    @MainActor func perform() async throws -> some IntentResult & ProvidesDialog {
        Voix.reponse = ""
        defer { Voix.reponse = nil }
        await commandeVocale${i + 1}Humalis(${v.parametres.map((p) => `${nomSwift(p)}: ${nomSwift(p)}`).join(', ')})${v.vers ? `\n        Routeur.commun.aller(${route(v.vers)})` : ''}
        let reponse = Voix.reponse ?? ""
        return .result(dialog: IntentDialog(stringLiteral: reponse.isEmpty ? "C'est fait." : reponse))
    }
}
`);
  });
  if (vocales.length) {
    ligne(`/** Les phrases que Siri reconnaît, sans rien installer : le nom de l'application les accompagne. */
struct CommandesVocalesHumalis: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {${vocales.map((v, i) => {
      const phrase = v.phrase.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
      const echappee = phrase.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `
        AppShortcut(intent: CommandeVocale${i + 1}(), phrases: ["${echappee} dans \\(.applicationName)", "\\(.applicationName) ${echappee}"], shortTitle: ${chaineSwift(phrase)}, systemImageName: "waveform")`;
    }).join('')}
    }
}
`);
  }

  // Ce que l'application reçoit du système : une adresse, un raccourci, une recherche, un bouton.
  ligne(`/** Ce que le système demande à l'application, hors de ses pages. */
@MainActor enum FormesHumalis {
    static let schema = ${chaineSwift(schema)}

    /** Une adresse reçue : un fichier ouvert, un widget touché, un partage reçu sur Mac. */
    static func ouvrir(_ url: URL) {${fichiersOuverts.length ? `
        if url.isFileURL {
            Task { await fichierOuvert(url) }
            return
        }` : ''}
        guard url.scheme?.lowercased() == schema else {${c.liens ? '\n            Routeur.commun.ouvrirLien(url)' : ''}
            return
        }
        let morceaux = [url.host(percentEncoded: false)].compactMap { $0 } + url.pathComponents.filter { $0 != "/" }
        if morceaux.first == "partage" {${f?.partageRecu ? '\n            Task { await partageEnAttente() }' : ''}
            return
        }
        if morceaux.first == "page", morceaux.count == 2 { aller(morceaux[1]) }
    }

    /** Une page visée par un widget, un raccourci, une recherche ou la voiture. */
    static func aller(_ page: String) {
        switch page {${[...visees].map((p) => `
        case ${chaineSwift(p)}: Routeur.commun.aller(${route(p)})`).join('')}
        default: break
        }
    }

    /** Au lancement de l'application. */
    static func auLancement() async {${recherches.length ? '\n        indexer()' : ''}${f?.partageRecu ? '\n        await partageEnAttente()' : ''}
    }

    /** Une variable partagée a changé : Spotlight et la voiture suivent. */
    static func partageChange(_ nom: String) {${recherches.length ? `
        if [${[...new Set(recherches.map((r) => r.liste))].map(chaineSwift).join(', ')}].contains(nom) { indexer() }` : ''}${voitures.length ? `
        #if os(iOS) && canImport(CarPlay)
        VoitureHumalis.actuelle?.actualiser()
        #endif` : ''}
    }

    static func raccourci(_ type: String) {
        switch type {${raccourcis.map((r, i) => `
        case "raccourci${i + 1}": aller(${chaineSwift(r.page)})`).join('')}
        default: break
        }
    }

    static func boutonNotification(_ bouton: String) async {
        switch bouton {${boutons.map((b, i) => `
        case ${chaineSwift(b.bouton)}: await boutonNotification${i + 1}Humalis()`).join('')}
        default: break
        }
    }${f?.partageRecu ? `

    /** Le partage reçu : l'extension l'a laissé dans le groupe d'applications. */
    static func partageEnAttente() async {
        guard let recu = GroupeHumalis.defauts.dictionary(forKey: "humalis.partage") as? [String: String] else { return }
        GroupeHumalis.defauts.removeObject(forKey: "humalis.partage")
        await partageRecuHumalis(texte: recu["texte"] ?? "", lien: recu["lien"] ?? "", fichier: recu["fichier"] ?? "")
    }` : ''}${fichiersOuverts.length || menus.length ? `

    /** Le nom, le type (MIME) et le contenu texte d'un fichier reçu. */
    static func lireFichier(_ url: URL) -> (nom: String, type: String, contenu: String) {
        let acces = url.startAccessingSecurityScopedResource()
        defer { if acces { url.stopAccessingSecurityScopedResource() } }
        let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let contenu = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        return (url.lastPathComponent, type, contenu)
    }` : ''}${fichiersOuverts.length ? `

    /** « quand on ouvre un fichier » : choisi selon son extension. */
    static func fichierOuvert(_ url: URL) async {
        let lu = lireFichier(url)
        switch "." + url.pathExtension.lowercased() {${fichiersOuverts.map((o, i) => `
        case ${o.extensions.map(chaineSwift).join(', ')}: await fichierOuvert${i + 1}Humalis(nom: lu.nom, type: lu.type, contenu: lu.contenu)`).join('')}
        default: break
        }
    }` : ''}${recherches.length ? `

    /** La recherche du système : chaque élément des listes devient un résultat de Spotlight. */
    static func indexer() {
        var elements: [CSSearchableItem] = []${recherches.map((r, i) => {
          const element = listeElement(c, r.liste);
          return `
        for (rang, element) in Partage.commun.${nomSwift(r.liste)}.enumerated() {
            let attributs = CSSearchableItemAttributeSet(contentType: .content)
            attributs.title = ${element(r.titre)}${r.texte ? `
            attributs.contentDescription = ${element(r.texte)}` : ''}
            elements.append(CSSearchableItem(uniqueIdentifier: "recherche${i + 1}:\\(rang)", domainIdentifier: "recherche${i + 1}", attributeSet: attributs))
        }`;
        }).join('')}
        // Les indexations se suivent : un élément gardé est remplacé, seuls ceux retirés de la liste sont effacés.
        let identifiants = elements.map { $0.uniqueIdentifier }
        let precedente = indexation
        indexation = Task {
            await precedente?.value
            let index = CSSearchableIndex.default()
            try? await index.indexSearchableItems(elements)
            let enTrop = (UserDefaults.standard.stringArray(forKey: "humalis.recherche") ?? []).filter { !identifiants.contains($0) }
            if !enTrop.isEmpty { try? await index.deleteSearchableItems(withIdentifiers: enTrop) }
            UserDefaults.standard.set(identifiants, forKey: "humalis.recherche")
        }
    }

    private static var indexation: Task<Void, Never>?

    static let actionRecherche = CSSearchableItemActionType

    /** Un résultat de Spotlight touché : la page qu'il vise. */
    static func ouvrirRecherche(_ activite: NSUserActivity) {
        let identifiant = activite.userInfo?[CSSearchableItemActivityIdentifier] as? String ?? ""
        switch identifiant.split(separator: ":").first.map(String.init) ?? "" {${recherches.map((r, i) => `
        case "recherche${i + 1}": aller(${chaineSwift(r.vers)})`).join('')}
        default: break
        }
    }` : ''}${f?.demarrage || menus.length ? `

    #if os(macOS)
    /** Sur Mac, au lancement : le démarrage avec l'ordinateur, les services du clic droit. */
    static func auDemarrageDuMac() {${f?.demarrage ? `
        // Inscrit une fois : si la personne le retire des réglages, il n'est pas remis.
        if !UserDefaults.standard.bool(forKey: "humalis.demarrage") {
            try? SMAppService.mainApp.register()
            UserDefaults.standard.set(true, forKey: "humalis.demarrage")
        }${f.demarrage.discret ? `
        // « avec discret » : lancée avec l'ordinateur, l'application n'ouvre pas de fenêtre.
        let evenement = NSAppleEventManager.shared().currentAppleEvent
        if evenement?.eventID == kAEOpenApplication && evenement?.paramDescriptor(forKeyword: keyAEPropData)?.enumCodeValue == keyAELaunchedAsLogInItem {
            Task {
                try? await Task.sleep(for: .milliseconds(150))
                for fenetre in NSApp.windows where fenetre.canBecomeMain { fenetre.close() }
            }
        }` : ''}` : ''}${menus.length ? `
        NSApp.servicesProvider = ServicesHumalis.commun
        NSUpdateDynamicServices()` : ''}
    }
    #endif` : ''}
}
`);

  // Le délégué du système : raccourcis, voiture, boutons des notifications, Mac.
  const delegueIos = raccourcis.length > 0 || voitures.length > 0 || boutons.length > 0;
  const delegueMac = Boolean(f?.demarrage) || menus.length > 0 || boutons.length > 0;
  const delegue = delegueIos || delegueMac;
  const categories = categoriesNotification(application, boutons.map((b) => b.bouton));
  if (delegue) {
    const transmettre = c.notifications
      ? `
    private let notifications = DelegueNotifications()

    func application(_ application: ApplicationSysteme, didRegisterForRemoteNotificationsWithDeviceToken jeton: Data) {
        notifications.application(application, didRegisterForRemoteNotificationsWithDeviceToken: jeton)
    }

    func application(_ application: ApplicationSysteme, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        notifications.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
    }
`
      : '';
    const notif = boutons.length > 0 || c.notifications;
    const inscrireCategories = boutons.length
      ? `
        UNUserNotificationCenter.current().setNotificationCategories([${categories.map((cat) => `
            UNNotificationCategory(identifier: ${chaineSwift(cat.id)}, actions: [${cat.boutons.map((b) => `UNNotificationAction(identifier: ${chaineSwift(b)}, title: ${chaineSwift(b)}, options: [])`).join(', ')}], intentIdentifiers: [], options: [])`).join(',')}
        ])`
      : '';
    const reponse = notif
      ? `

    /** Une notification reçue pendant qu'on utilise l'application s'affiche quand même. */
    nonisolated func userNotificationCenter(_ centre: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }

    /** Un bouton touché dans une notification : son « quand l'utilisateur touche … », sans ouvrir l'application. */
    nonisolated func userNotificationCenter(_ centre: UNUserNotificationCenter, didReceive reponse: UNNotificationResponse) async {
        let bouton = reponse.actionIdentifier
        await FormesHumalis.boutonNotification(bouton)
    }`
      : '';
    ligne(`#if os(macOS)
typealias DelegueSystemeHumalis = NSApplicationDelegate
#else
typealias DelegueSystemeHumalis = UIApplicationDelegate
#endif

/** Ce que le système demande à l'application : ${[raccourcis.length && 'les raccourcis de l\'icône', voitures.length && 'CarPlay', boutons.length && 'les boutons des notifications', f?.demarrage && 'le démarrage', menus.length && 'le clic droit'].filter(Boolean).join(', ')}. */
final class DelegueFormesHumalis: NSObject, DelegueSystemeHumalis${notif ? ', UNUserNotificationCenterDelegate' : ''} {${transmettre}
    #if os(macOS)
    func applicationDidFinishLaunching(_ notification: Notification) {${notif ? '\n        UNUserNotificationCenter.current().delegate = self' : ''}${inscrireCategories}${f?.demarrage || menus.length ? '\n        FormesHumalis.auDemarrageDuMac()' : ''}
    }
    #else
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {${notif ? '\n        UNUserNotificationCenter.current().delegate = self' : ''}${inscrireCategories}
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {${voitures.length ? `
        #if canImport(CarPlay)
        if session.role == .carTemplateApplication {
            let voiture = UISceneConfiguration(name: "Voiture", sessionRole: session.role)
            voiture.delegateClass = VoitureHumalis.self
            return voiture
        }
        #endif` : ''}
        let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)
        configuration.delegateClass = SceneHumalis.self
        return configuration
    }
    #endif${reponse}
}

#if os(iOS)
/** La fenêtre de l'iPhone : un raccourci de l'icône, au lancement ou après. */
final class SceneHumalis: NSObject, UIWindowSceneDelegate {
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        if let raccourci = options.shortcutItem?.type { FormesHumalis.raccourci(raccourci) }
    }

    func windowScene(_ windowScene: UIWindowScene, performActionFor raccourci: UIApplicationShortcutItem) async -> Bool {
        FormesHumalis.raccourci(raccourci.type)
        return true
    }
}
#endif
`);
  }
  if (menus.length) {
    ligne(`#if os(macOS)
/** Le clic droit dans le Finder : un service par « menu clic droit », pour ses extensions de fichier. */
final class ServicesHumalis: NSObject, @unchecked Sendable {
    static let commun = ServicesHumalis()
${menus.map((m, i) => `
    /** « ${m.titre} » (${m.extensions.join(', ')}). */
    @objc func menuClicDroit${i + 1}(_ presse: NSPasteboard, userData: String?, error: AutoreleasingUnsafeMutablePointer<NSString?>) {
        let adresses = presse.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] ?? []
        Task { @MainActor in
            for url in adresses {
                let lu = FormesHumalis.lireFichier(url)
                await menuClicDroit${i + 1}Humalis(nom: lu.nom, type: lu.type, contenu: lu.contenu)
            }
        }
    }`).join('\n')}
}
#endif
`);
  }
  if (voitures.length) {
    ligne(`#if os(iOS) && canImport(CarPlay)
/** CarPlay : chaque écran de voiture est une liste ; plusieurs se rangent en onglets. */
final class VoitureHumalis: UIResponder, CPTemplateApplicationSceneDelegate {
    @MainActor static weak var actuelle: VoitureHumalis?
    private var interface: CPInterfaceController?

    func templateApplicationScene(_ scene: CPTemplateApplicationScene, didConnect interface: CPInterfaceController) {
        self.interface = interface
        VoitureHumalis.actuelle = self
        interface.setRootTemplate(VoitureHumalis.modele(), animated: false, completion: nil)
    }

    func templateApplicationScene(_ scene: CPTemplateApplicationScene, didDisconnectInterfaceController interface: CPInterfaceController) {
        self.interface = nil
    }

    func actualiser() {
        interface?.setRootTemplate(VoitureHumalis.modele(), animated: false, completion: nil)
    }

    static func modele() -> CPTemplate {
        let listes = [${voitures.map((_, i) => `liste${i + 1}()`).join(', ')}]
        return listes.count == 1 ? listes[0] : CPTabBarTemplate(templates: listes)
    }
${voitures.map((v, i) => {
      const element = listeElement(c, v.liste);
      return `
    /** « ${v.nom} ». */
    static func liste${i + 1}() -> CPListTemplate {
        let lignes = Partage.commun.${nomSwift(v.liste)}.map { element in
            let ligne = CPListItem(text: ${element(v.titre)}, detailText: ${v.texte ? element(v.texte) : 'nil'})${v.vers ? `
            ligne.handler = { _, fin in
                FormesHumalis.aller(${chaineSwift(v.vers)})
                fin()
            }` : ''}
            return ligne
        }
        let modele = CPListTemplate(title: ${chaineSwift(v.nom)}, sections: [CPListSection(items: lignes)])
        modele.tabTitle = ${chaineSwift(v.nom)}
        modele.tabImage = UIImage(systemName: "list.bullet")
        return modele
    }`;
    }).join('\n')}
}
#endif
`);
  }
  ligne(`/** Les formes suivent la vie de la fenêtre : un partage reçu se lit quand l'application revient. */
struct PhaseFormesHumalis: ViewModifier {
    @Environment(\\.scenePhase) private var phase

    func body(content: Content) -> some View {
        content
            .task { await FormesHumalis.auLancement() }
            .onChange(of: phase) { _, nouvelle in
                if nouvelle == .active { Task { await FormesHumalis.auLancement() } }
            }
    }
}
`);
  for (const fn of fonctions) ligne(fn);
  // Tout ce qui précède n'est qu'à l'application ; les fonctions des tuiles, que l'extension appelle aussi, sortent de la garde.
  const formesSwift = `${swift.texte()}#endif\n`;
  fichiers.set(`${c.nom}/Humalis/Formes.swift`, deplacerTuiles(formesSwift, tuiles.length));

  // ─── L'extension des widgets : widgets, activités en direct, tuiles ──────
  if (avecWidgets) {
    widgets.forEach((w, i) => vue(`VueWidget${i + 1}`, w.ecran));
    activites.forEach((a, i) => vue(`VueActivite${i + 1}`, a.ecran));
    for (const v of vues) fichiers.set(`${c.nom}/Formes/${v.nom}.swift`, `#if HUMALIS_WIDGETS || !HUMALIS_AUTRE_CIBLE\n${v.code}#endif\n`);
    const nomCible = `${c.nom}Widgets`;
    cibles.push({ nom: nomCible, genre: 'extension', plateformes: activites.length || tuiles.length ? 'apple' : 'apple', identifiant: `${c.identifiant}.widgets`, nomAffiche: c.nomAffiche, partageDossier: true, info: `Info-${nomCible}.plist`, droits: `${nomCible}.entitlements`, conditions: ['HUMALIS_AUTRE_CIBLE', 'HUMALIS_SANS_FENETRE', 'HUMALIS_WIDGETS'] });
    fichiers.set(`Info-${nomCible}.plist`, plistExtension('com.apple.widgetkit-extension'));
    fichiers.set(`${nomCible}/${nomCible}.entitlements`, droitsExtension(groupe!));
    fichiers.set(`${nomCible}/Widgets.swift`, widgetsSwift(c, schema));
  }

  // ─── Les claviers : une extension par clavier, sur iPhone et iPad ───────
  (f?.claviers ?? []).forEach((k, i) => {
    const nomCible = `${c.nom}Clavier${i + 1}`;
    cibles.push({ nom: nomCible, genre: 'extension', plateformes: 'ios', identifiant: `${c.identifiant}.clavier${i + 1}`, nomAffiche: k.nom, partageDossier: false, info: `Info-${nomCible}.plist`, conditions: ['HUMALIS_AUTRE_CIBLE'] });
    fichiers.set(`Info-${nomCible}.plist`, plistExtension('com.apple.keyboard-service', 'ClavierHumalis', `
			<key>IsASCIICapable</key>
			<false/>
			<key>PrefersRightToLeft</key>
			<false/>
			<key>PrimaryLanguage</key>
			<string>fr-FR</string>
			<key>RequestsOpenAccess</key>
			<false/>`));
    fichiers.set(`${nomCible}/Clavier.swift`, clavierSwift(k.touches));
  });

  // ─── La montre, la télévision, l'App Clip : des applications du même projet ──
  const applicationDe = (genre: 'montre' | 'tele' | 'clip', pages: string[], plateformes: CibleXcode['plateformes'], identifiant: string, condition: string) => {
    const nomCible = `${c.nom}${genre === 'montre' ? 'Montre' : genre === 'tele' ? 'Tele' : 'Clip'}`;
    cibles.push({ nom: nomCible, genre, plateformes, identifiant, nomAffiche: c.nomAffiche, partageDossier: true, info: `Info-${nomCible}.plist`, ...(genre === 'clip' ? { droits: `${nomCible}.entitlements` } : {}), conditions: ['HUMALIS_AUTRE_CIBLE', ...(genre === 'clip' ? [] : ['HUMALIS_SANS_FENETRE']), condition] });
    fichiers.set(`Info-${nomCible}.plist`, plistApplication(genre));
    fichiers.set(`${nomCible}/${nomCible}App.swift`, applicationSecondaire(nomCible, pages, app));
    if (genre === 'clip') {
      fichiers.set(`${nomCible}/${nomCible}.entitlements`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.on-demand-install-capable</key>
	<true/>
	<key>com.apple.developer.parent-application-identifiers</key>
	<array>
		<string>$(AppIdentifierPrefix)${c.identifiant}</string>
	</array>
</dict>
</plist>
`);
    }
  };
  if (montre.length) applicationDe('montre', montre.map((e) => e.nom), 'watchos', `${c.identifiant}.watchkitapp`, 'HUMALIS_MONTRE');
  if (tele.length) applicationDe('tele', tele.map((e) => e.nom), 'tvos', `${c.identifiant}.tv`, 'HUMALIS_TELE');
  if (minis[0]) applicationDe('clip', [minis[0].page], 'ios', `${c.identifiant}.Clip`, 'HUMALIS_CLIP');

  // ─── La barre des menus du Mac ───────────────────────────────────────────
  const scenes = barres.length
    ? `
        #if os(macOS)${barres.map((e) => `
        MenuBarExtra(${chaineSwift(titreDePage(e))}, systemImage: ${chaineSwift(e.barreSysteme?.icone ? iconeForme(e.barreSysteme.icone) : 'circle')}) {
            NavigationStack { ${nomPage(e.nom)}() }
                .frame(width: 340, height: 440)
                .overlay(alignment: .top) { PileMessagesHumalis() }
        }
        .menuBarExtraStyle(.window)`).join('')}
        #endif`
    : '';
  const racine = `
                .modifier(PhaseFormesHumalis())${recherches.length ? `
                .onContinueUserActivity(FormesHumalis.actionRecherche) { FormesHumalis.ouvrirRecherche($0) }` : ''}`;
  const avecSchema = widgets.some((w) => w.vers) || Boolean(f?.partageRecu);

  return {
    fichiers,
    cibles,
    ...(groupe ? { groupe } : {}),
    suivies,
    infos: infos.join(''),
    ...(voitures.length ? { droitsSimulateur: `
	<key>com.apple.developer.carplay-driving-task</key>
	<true/>` } : {}),
    ...(avecSchema ? { schemaInterne: schema } : {}),
    app: { scenes, racine, delegue, autresCibles: cibles.some((x) => x.partageDossier), url: avecSchema || fichiersOuverts.length > 0 },
    horsEntree,
  };
}

/** Le titre d'une page pour la barre des menus : son premier titre écrit, sinon son nom. */
function titreDePage(e: Ecran): string {
  const titre = e.vue.find((n) => n.type === 'element' && n.genre === 'titre');
  const parties = titre && titre.type === 'element' && titre.contenu.type === 'texte' ? titre.contenu.parties : undefined;
  if (parties && parties.every((p) => 'texte' in p)) return parties.map((p) => ('texte' in p ? p.texte : '')).join('');
  return e.nom;
}

/** Le titre d'une activité en direct pour l'îlot dynamique : son premier titre, en Swift. */
function titreDe(ecran: Ecran, c: ContexteFormes): string {
  const titre = ecran.vue.find((n) => n.type === 'element' && n.genre === 'titre');
  if (!titre || titre.type !== 'element') return chaineSwift(ecran.nom);
  c.portee.variables.clear();
  for (const p of c.application.partages) c.portee.variables.set(p.nom, { code: `Partage.commun.${nomSwift(p.nom)}`, type: p.type, opt: p.facultatif ?? false });
  return new Valeurs(c.app.types, c.portee, () => undefined).enTexte(titre.contenu);
}

/** Le texte d'un champ d'un élément de liste (« nom » de « produits »), comme dans un « {…} ». */
function listeElement(c: ContexteFormes, liste: string): (champ: string) => string {
  const partage = c.application.partages.find((p) => p.nom === liste);
  return (champ: string) => {
    if (!partage || partage.type.genre !== 'liste') return '""';
    c.portee.variables.clear();
    c.portee.variables.set('element', { code: 'element', type: partage.type.de, opt: false });
    return new Valeurs(c.app.types, c.portee, (q) => c.app.refuser(1, `${q} ne se traduit pas en Swift (liste « ${liste} »)`)).enTexte({ type: 'champDonnee', objet: { type: 'variable', nom: 'element' }, champ });
  };
}

/** Les catégories de notification : une par liste de boutons envoyée par le serveur, et une avec tous les boutons attendus. */
export function categoriesNotification(application: Application, attendus: string[]): { id: string; boutons: string[] }[] {
  const listes = JSON.stringify(application.serveurs ?? []).match(/"boutons":\[[^\]]*\]/g)?.map((m) => JSON.parse(m.slice(10)) as string[]) ?? [];
  const categories = new Map<string, string[]>();
  for (const l of listes) categories.set(idCategorie(l), l);
  if (attendus.length) categories.set('humalis.boutons', [...new Set(attendus)].slice(0, 4));
  return [...categories].map(([id, boutons]) => ({ id, boutons }));
}

/** L'identifiant de catégorie qu'un serveur Humalis donne à une notification qui a ces boutons. */
export const idCategorie = (boutons: string[]): string => `humalis.boutons.${boutons.join('|')}`;

/** Les fonctions des tuiles sortent de la garde de l'application : l'extension les lit aussi. */
function deplacerTuiles(texte: string, nombre: number): string {
  if (!nombre) return texte;
  const fonctions: string[] = [];
  let reste = texte;
  for (let i = 1; i <= nombre; i++) {
    const motif = new RegExp(`/\\*\\* La tuile « [^\\n]* »\\. \\*/\\n@MainActor func tuile${i}Humalis\\(\\) async \\{\\n[\\s\\S]*?\\n\\}\\n`);
    const trouve = motif.exec(reste);
    if (!trouve) continue;
    fonctions.push(trouve[0]);
    reste = reste.replace(trouve[0], '');
  }
  return `${reste}\n${fonctions.join('\n')}`;
}

function plistExtension(point: string, principale?: string, attributs = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSExtension</key>
	<dict>${attributs ? `
		<key>NSExtensionAttributes</key>
		<dict>${attributs}
		</dict>` : ''}
		<key>NSExtensionPointIdentifier</key>
		<string>${point}</string>${principale ? `
		<key>NSExtensionPrincipalClass</key>
		<string>$(PRODUCT_MODULE_NAME).${principale}</string>` : ''}
	</dict>
</dict>
</plist>
`;
}

function plistApplication(genre: 'montre' | 'tele' | 'clip'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>ITSAppUsesNonExemptEncryption</key>
	<false/>${genre === 'montre' ? `
	<key>WKApplication</key>
	<true/>` : ''}${genre === 'clip' ? `
	<key>NSAppClip</key>
	<dict>
		<key>NSAppClipRequestEphemeralUserNotification</key>
		<false/>
		<key>NSAppClipRequestLocationConfirmation</key>
		<false/>
	</dict>` : ''}
</dict>
</plist>
`;
}

function droitsExtension(groupe: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.app-sandbox</key>
	<true/>
	<key>com.apple.security.network.client</key>
	<true/>
	<key>com.apple.security.application-groups</key>
	<array>
		<string>${groupe}</string>
	</array>
</dict>
</plist>
`;
}

/** L'application de la montre, de la télévision ou l'App Clip : ses pages, avec la même navigation. */
function applicationSecondaire(nomCible: string, pages: string[], app: ContexteApple): string {
  const premiere = pages[0]!;
  const racine = pages.length === 1
    ? `${nomPage(premiere)}()`
    : `List {${pages.map((p) => `
                    Button(${chaineSwift(p)}) { Routeur.commun.aller(.${nomRoute(p)}${app.pages.get(p)?.filtres.length ? '()' : ''}) }`).join('')}
                }`;
  return `// Produit par Humalis : ${nomCible.endsWith('Montre') ? "l'application de la montre" : nomCible.endsWith('Tele') ? "l'application de la télévision" : "l'App Clip, sans installation"}.
import SwiftUI

@main
struct ${nomCible}App: App {
    var body: some Scene {
        WindowGroup {
            Racine${nomCible}()
        }
    }
}

struct Racine${nomCible}: View {
    var body: some View {
        @Bindable var routeur = Routeur.commun
        NavigationStack(path: $routeur.chemin) {
            ${racine}
                .navigationDestination(for: Route.self) { route in route.vue }
        }
        .overlay(alignment: .top) { PileMessagesHumalis() }
        .preferredColorScheme(Apparence.commun.schema)
    }
}
`;
}

/** L'extension des widgets : les widgets, les activités en direct, les tuiles du Centre de contrôle. */
function widgetsSwift(c: ContexteFormes, schema: string): string {
  const f = c.application.formes!;
  const familles: Record<string, string> = { petite: '.systemSmall', moyenne: '.systemMedium', grande: '.systemLarge' };
  const widgets = f.widgets.map((w, i) => {
    const minutes = w.actualiser ? w.actualiser.nombre * (w.actualiser.unite === 'heures' ? 60 : 1) : 0;
    return `
/** Le widget « ${w.nom} ». */
struct Widget${i + 1}: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: ${chaineSwift(`widget.${w.nom}`)}, provider: FournisseurHumalis(minutes: ${minutes})) { _ in
            CadreWidgetHumalis { VueWidget${i + 1}() }${w.vers ? `
                .widgetURL(URL(string: ${chaineSwift(`${schema}://page/${w.vers}`)}))` : ''}
        }
        .configurationDisplayName(${chaineSwift(w.nom)})
        .supportedFamilies([${w.taille ? familles[w.taille] : '.systemSmall, .systemMedium, .systemLarge'}])
    }
}`;
  }).join('\n');
  const activites = f.activites.length
    ? `

#if os(iOS)
/** Les activités en direct : l'écran verrouillé et l'îlot dynamique. */
struct ActivitesWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ActiviteHumalis.self) { contexte in
            VueActiviteHumalis(nom: contexte.attributes.nom).padding()
        } dynamicIsland: { contexte in
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) { VueActiviteHumalis(nom: contexte.attributes.nom) }
            } compactLeading: {
                Text(verbatim: String(contexte.attributes.titre.prefix(1))).bold()
            } compactTrailing: {
                Text(verbatim: contexte.attributes.titre).lineLimit(1)
            } minimal: {
                Text(verbatim: String(contexte.attributes.titre.prefix(1))).bold()
            }
        }
    }
}

struct VueActiviteHumalis: View {
    let nom: String

    var body: some View {
        let _ = Partage.commun.relireDuGroupe()
        VStack(alignment: .leading, spacing: 4) {
            switch nom {${f.activites.map((a, i) => `
            case ${chaineSwift(a.nom)}: VueActivite${i + 1}()`).join('')}
            default: EmptyView()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
#endif`
    : '';
  const tuiles = f.tuiles.map((t, i) => `

#if os(iOS)
/** La tuile « ${t.nom} » : le Centre de contrôle, l'écran verrouillé, le bouton Action. */
@available(iOS 18.0, *)
struct Tuile${i + 1}: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: ${chaineSwift(`${c.identifiant}.tuile${i + 1}`)}) {
            ControlWidgetButton(action: IntentionTuile${i + 1}()) {
                Label(${chaineSwift(t.nom)}, systemImage: ${chaineSwift(t.icone ? iconeForme(t.icone) : 'circle')})
            }
        }
        .displayName(${chaineSwift(t.nom)})
    }
}
#endif`).join('');
  return `// Produit par Humalis : les widgets, les activités en direct et les tuiles.
import SwiftUI
import WidgetKit
import AppIntents

@main
struct WidgetsHumalis: WidgetBundle {
    var body: some Widget {${f.widgets.map((_, i) => `
        Widget${i + 1}()`).join('')}${f.activites.length ? `
        #if os(iOS)
        ActivitesWidget()
        #endif` : ''}${f.tuiles.map((_, i) => `
        #if os(iOS)
        if #available(iOS 18.0, *) { Tuile${i + 1}() }
        #endif`).join('')}
    }
}

/** Le moment où le widget se redessine ; ses valeurs viennent du groupe d'applications. */
struct MomentHumalis: TimelineEntry {
    let date: Date
}

struct FournisseurHumalis: TimelineProvider {
    /** « actualiser toutes les 30 minutes » ; sans, le widget suit les changements de l'application. */
    let minutes: Double

    func placeholder(in context: Context) -> MomentHumalis { MomentHumalis(date: .now) }

    func getSnapshot(in context: Context, completion: @escaping (MomentHumalis) -> Void) {
        completion(MomentHumalis(date: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MomentHumalis>) -> Void) {
        let suite: TimelineReloadPolicy = minutes > 0 ? .after(Date(timeIntervalSinceNow: max(minutes, 15) * 60)) : .never
        completion(Timeline(entries: [MomentHumalis(date: .now)], policy: suite))
    }
}

/** Le contenu d'un widget : les valeurs relues, rangées en haut à gauche. */
struct CadreWidgetHumalis<Contenu: View>: View {
    @ViewBuilder let contenu: () -> Contenu

    var body: some View {
        let _ = Partage.commun.relireDuGroupe()
        VStack(alignment: .leading, spacing: 4) { contenu() }
            .minimumScaleFactor(0.6)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .containerBackground(.background, for: .widget)
    }
}
${widgets}${activites}${tuiles}
`;
}

/** Le clavier : une touche par « touche … ecrit … », et le globe pour passer au clavier suivant. */
function clavierSwift(touches: { texte: string; ecrit: string }[]): string {
  return `// Produit par Humalis : le clavier personnalisé.
import SwiftUI
import UIKit

final class ClavierHumalis: UIInputViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let ecrire: @MainActor (String) -> Void = { [weak self] texte in self?.textDocumentProxy.insertText(texte) }
        var suivant: (@MainActor () -> Void)?
        if needsInputModeSwitchKey { suivant = { [weak self] in self?.advanceToNextInputMode() } }
        let hote = UIHostingController(rootView: TouchesHumalis(ecrire: ecrire, suivant: suivant))
        hote.view.backgroundColor = UIColor.clear
        hote.view.translatesAutoresizingMaskIntoConstraints = false
        addChild(hote)
        view.addSubview(hote.view)
        NSLayoutConstraint.activate([
            hote.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hote.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hote.view.topAnchor.constraint(equalTo: view.topAnchor),
            hote.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            hote.view.heightAnchor.constraint(equalToConstant: 236),
        ])
        hote.didMove(toParent: self)
    }
}

struct TouchesHumalis: View {
    let ecrire: @MainActor (String) -> Void
    let suivant: (@MainActor () -> Void)?
    private let touches: [(texte: String, ecrit: String)] = [${touches.map((t) => `(${chaineSwift(t.texte)}, ${chaineSwift(t.ecrit)})`).join(', ')}]

    var body: some View {
        VStack(spacing: 8) {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], spacing: 8) {
                    ForEach(touches.indices, id: \\.self) { i in
                        Button { ecrire(touches[i].ecrit) } label: {
                            Text(verbatim: touches[i].texte).frame(maxWidth: .infinity, minHeight: 40)
                        }
                        .buttonStyle(.bordered)
                        .accessibilityHint(Text(verbatim: touches[i].ecrit))
                    }
                }
                .padding(8)
            }
            if let suivant {
                HStack {
                    Button { suivant() } label: { Image(systemName: "globe").frame(width: 44, height: 36) }
                        .buttonStyle(.bordered)
                        .accessibilityLabel("Clavier suivant")
                    Spacer()
                }
                .padding(.horizontal, 8)
                .padding(.bottom, 4)
            }
        }
    }
}
`;
}

/** L'extension de partage : ce qui est reçu va dans le groupe d'applications, que l'application lit en revenant. */
function partageSwift(groupe: string, schema: string): string {
  return `// Produit par Humalis : le bouton « Partager » des autres applications.
import UniformTypeIdentifiers
#if os(iOS)
import UIKit
typealias ControleurSystemeHumalis = UIViewController
#else
import AppKit
typealias ControleurSystemeHumalis = NSViewController
#endif

final class ControleurPartage: ControleurSystemeHumalis {
    private let groupe = ${chaineSwift(groupe)}

    #if os(macOS)
    override func loadView() {
        view = NSView(frame: NSRect(x: 0, y: 0, width: 1, height: 1))
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        recevoir()
    }
    #else
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        recevoir()
    }
    #endif

    private func recevoir() {
        let pieces = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        Task {
            var recu = ["texte": "", "lien": "", "fichier": ""]
            for piece in pieces {
                if piece.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier), let url = try? await piece.loadItem(forTypeIdentifier: UTType.fileURL.identifier) as? URL {
                    recu["fichier"] = copier(url)
                } else if piece.hasItemConformingToTypeIdentifier(UTType.url.identifier), let url = try? await piece.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                    if url.isFileURL { recu["fichier"] = copier(url) } else { recu["lien"] = url.absoluteString }
                } else if piece.hasItemConformingToTypeIdentifier(UTType.plainText.identifier), let texte = try? await piece.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                    recu["texte"] = texte
                } else if piece.hasItemConformingToTypeIdentifier(UTType.image.identifier), let url = try? await piece.loadItem(forTypeIdentifier: UTType.image.identifier) as? URL {
                    recu["fichier"] = copier(url)
                }
            }
            UserDefaults(suiteName: groupe)?.set(recu, forKey: "humalis.partage")
            #if os(macOS)
            // Sur Mac, l'application s'ouvre et lit le partage tout de suite.
            if let adresse = URL(string: ${chaineSwift(`${schema}://partage`)}) { NSWorkspace.shared.open(adresse) }
            #endif
            extensionContext?.completeRequest(returningItems: nil)
        }
    }

    /** Le fichier partagé, recopié dans le groupe : l'application le lit ensuite. */
    private func copier(_ url: URL) -> String {
        guard let dossier = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupe)?.appendingPathComponent("partages", isDirectory: true) else { return url.path }
        try? FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
        let copie = dossier.appendingPathComponent(url.lastPathComponent)
        try? FileManager.default.removeItem(at: copie)
        let acces = url.startAccessingSecurityScopedResource()
        defer { if acces { url.stopAccessingSecurityScopedResource() } }
        return (try? FileManager.default.copyItem(at: url, to: copie)) != nil ? copie.path : url.path
    }
}
`;
}
