/**
 * La cible Apple : un programme Humalis devient un projet Xcode en SwiftUI,
 * une seule application native pour iPhone, iPad et Mac, sans navigateur
 * embarqué. Comme la cible web écrit du React, celle-ci écrit du Swift lisible.
 */
import type { Diagnostic } from '../../analyse/erreurs.js';
import { simplifier } from '../../analyse/elements.js';
import { sousActions } from '../../ri/actions.js';
import { nomDeLaCopie, type InfoMedia } from '../../ri/medias.js';
import type { Action, Application, Ecran, Etat, SourceRI, ThemeRI } from '../../ri/types.js';
import { contenuBinaire } from '../binaire.js';
import { Ecrivain } from '../web/ecrivain.js';
import { donneesDesPages } from '../web/projet.js';
import { COULEURS_CSS } from '../web/styles.js';
import { EcrivainActions, type HotePage } from './actions.js';
import { FORMATS_SWIFT, INTERFACE_SWIFT, VALEURS_SWIFT } from './bibliotheque.js';
import { fichiersElements } from './elements.js';
import { chaineSwift, nomApplication, nomComposant, nomPage, nomRoute, nomSwift } from './noms.js';
import { GenerateurPage, type ContexteApple } from './page.js';
import { LANGUES_SWIFT, MEMOIRE_SWIFT, MESSAGES_SWIFT, MINUTERIES_SWIFT, SERVEUR_SWIFT, SYSTEME_SWIFT } from './systeme.js';
import { Types, Valeurs, plusPrecis, type Portee } from './valeurs.js';
import { CONFIDENTIALITE, assets, droits, projetXcode, schemaXcode } from './xcode.js';

export const MARQUE_APPLE = '.humalis-projet';

export interface OptionsApple {
  /** Le nom du projet, tiré du fichier Humalis (« boutique »). */
  nom: string;
  source: string;
  /** L'adresse du serveur que l'application appelle. */
  serveur?: string;
  /** L'identifiant du paquet (« dev.exemple.boutique »). */
  identifiant?: string;
  /** L'équipe Apple Developer, pour signer. */
  equipe?: string;
  medias?: Map<string, InfoMedia>;
  images?: Map<string, string>;
  /** Pour chaque composant Swift (« sur apple "Carte.swift" ») : son fichier. */
  natifs?: Map<string, { nom: string; contenu: string }>;
}

/** Les données des pages : celles des serveurs et des sources. */
function donneesDe(a: Application) {
  return [
    ...a.serveurs.flatMap((s) => donneesDesPages(s).map((d) => ({ ...d, source: s.nom }))),
    ...a.sources.flatMap((s) => s.donnees.map((d) => ({ ...d, source: s.nom }))),
  ];
}

/** Ce qui n'a pas d'équivalent ici : rien n'est écrit, ou la différence est dite. */
function verifier(application: Application): Diagnostic[] {
  const d: Diagnostic[] = [];
  const avertir = (ligne: number, message: string) => d.push({ gravite: 'avertissement', ligne, message });
  const refuser = (ligne: number, message: string) => d.push({ gravite: 'erreur', ligne, message });

  if (application.css.length > 0 || application.fichiersStyle.length > 0) {
    avertir(application.fichiersStyle[0]?.ligne ?? 1, "le CSS ne s'applique pas sur la cible Apple : seuls les styles nommés (couleur, fond, taille, position, bordure…) y sont traduits.");
  }
  for (const c of application.composantsReact) {
    if (c.module) refuser(c.ligne, `« utiliser module » (${c.nom}) charge une bibliothèque JavaScript : la cible Apple n'a pas de JavaScript. Écrivez une vue Swift à la place : « utiliser composant "${c.nom}" depuis "…" sur apple "${c.nom}.swift" ».`);
    else if (!c.chemin.endsWith('.swift') && !('natif' in c)) refuser(c.ligne, `le composant React « ${c.nom} » n'existe pas sur la cible Apple : donnez-lui une vue Swift avec « utiliser composant "${c.nom}" depuis "${c.chemin}" sur apple "${c.nom}.swift" ».`);
  }
  if ((application.theme?.polices.length ?? 0) > 0) avertir(1, "les polices du bloc « theme » ne sont pas encore chargées sur la cible Apple : la police du système est utilisée.");
  const logo = application.site?.logo;
  if (logo && !/\.png$/i.test(logo)) refuser(application.site!.ligne, `le logo « ${logo} » ne peut pas servir d'icône sur la cible Apple : donnez un PNG carré de 1024×1024.`);
  const apercu = application.ecrans.find((e) => e.apercu);
  if (apercu) avertir(apercu.ligne, "« apercu » est sans effet sur la cible Apple : une application n'a ni onglet, ni moteur de recherche, ni aperçu de partage.");
  if (JSON.stringify(application.ecrans).includes('"type":"connexionGoogle"')) avertir(1, "« se connecter avec google » n'est pas encore disponible sur la cible Apple : le bouton répond par un message clair.");
  if (/"type":"(invitation|demandeLienMotDePasse|choixMotDePasse)"/.test(JSON.stringify(application.ecrans))) avertir(1, "les invitations et les liens de mot de passe s'ouvrent sur le site : sur la cible Apple, ces actions répondent par un message clair.");
  return d;
}

// ─── Les fichiers partagés ───────────────────────────────────────────────

function couleursSwift(theme: ThemeRI | undefined): string {
  const hex = (c: string) => `0x${c.slice(1, 7).toUpperCase()}`;
  const couleurs = new Map(Object.entries(COULEURS_CSS).map(([nom, c]) => [nom, c]));
  for (const c of theme?.couleurs ?? []) couleurs.set(c.nom, { clair: c.clair, sombre: c.sombre, encreClair: c.encreClair, encreSombre: c.encreSombre });
  const marque = theme?.couleurs.find((c) => c.nom === 'marque');
  const e = new Ecrivain();
  e.ligne('// Produit par Humalis : les couleurs, en clair et en sombre.');
  e.ligne('import SwiftUI');
  e.ligne();
  e.bloc('enum Couleurs {', () => {
    e.ligne(marque ? `static let accent = couleurHumalis(${hex(marque.clair)}, ${hex(marque.sombre)})` : 'static let accent = Color.accentColor');
    for (const [nom, c] of couleurs) {
      const swift = nomSwift(nom);
      e.ligne(`static let ${swift} = couleurHumalis(${hex(c.clair)}, ${hex(c.sombre)})`);
      e.ligne(`static let encre${swift.charAt(0).toUpperCase()}${swift.slice(1)} = couleurHumalis(${hex(c.encreClair)}, ${hex(c.encreSombre)})`);
    }
  });
  return e.texte();
}

function donneesSwift(types: Types): string {
  const e = new Ecrivain();
  e.ligne('// Produit par Humalis : les données du serveur et les fiches, telles que les pages les lisent.');
  e.ligne('import Foundation');
  for (const s of types.tous()) {
    e.ligne();
    e.ligne(`/** ${s.commentaire} */`);
    e.bloc(`struct ${s.nom}: FicheHumalis, Identifiable {`, () => {
      // Une fiche a un identifiant pour SwiftUI, même sans champ « id ».
      for (const c of s.champs) e.ligne(`var ${c.swift}: ${types.swift(c.type, c.opt)} = ${c.opt ? 'nil' : types.defaut(c.type)}`);
      if (!s.champs.some((c) => c.swift === 'id')) e.ligne('var id: Int { hashValue }');
      if (s.champs.some((c) => c.swift !== c.cle)) {
        e.ligne();
        e.bloc('enum CodingKeys: String, CodingKey {', () => {
          for (const c of s.champs) e.ligne(c.swift === c.cle ? `case ${c.swift}` : `case ${c.swift} = ${chaineSwift(c.cle)}`);
        });
      }
    });
    e.ligne();
    // À part : le constructeur champ par champ reste disponible.
    e.bloc(`extension ${s.nom} {`, () => {
      if (s.champs.length === 0) {
        e.ligne('init(from decoder: Decoder) throws { self.init() }');
        return;
      }
      e.bloc('init(from decoder: Decoder) throws {', () => {
        e.ligne(`let boite = try decoder.container(keyedBy: CodingKeys.self)`);
        e.ligne('self.init()');
        for (const c of s.champs) {
          e.ligne(c.cle === 'id' && c.type.genre === 'texte' ? `${c.swift} = boite.lireIdentifiant(.${c.swift})` : `${c.swift} = boite.lire(.${c.swift}, ${c.swift})`);
        }
      });
    });
  }
  return e.texte();
}

function partageSwift(partages: Etat[], types: Types, cle: string, v: Valeurs): string {
  const e = new Ecrivain();
  e.ligne('// Produit par Humalis : les variables partagées entre les pages.');
  e.ligne('import SwiftUI');
  e.ligne();
  e.ligne('@MainActor @Observable final class Partage {');
  e.indenter(() => {
    e.ligne('static let commun = Partage()');
    for (const p of partages) {
      const initiale = v.expr(p.initiale, p.type);
      const valeur = p.facultatif ? v.versOpt(initiale, p.type) : v.vers(initiale, p.type);
      const nom = nomSwift(p.nom);
      if (p.memorisee) e.ligne(`var ${nom}: ${types.swift(p.type, p.facultatif)} = ${valeur} { didSet { Memoire.ecrire(${chaineSwift(`${cle}:partage:${simplifier(p.nom)}`)}, ${nom}${p.secret ? ', secret: true' : ''}) } }`);
      else e.ligne(`var ${nom}: ${types.swift(p.type, p.facultatif)} = ${valeur}`);
    }
    e.ligne();
    e.bloc('private init() {', () => {
      for (const p of partages.filter((x) => x.memorisee)) e.ligne(`if let lue: ${types.swift(p.type, p.facultatif)} = Memoire.lire(${chaineSwift(`${cle}:partage:${simplifier(p.nom)}`)}${p.secret ? ', secret: true' : ''}) { ${nomSwift(p.nom)} = lue }`);
    });
  });
  e.ligne('}');
  return e.texte();
}

function fonctionsSwift(application: Application, app: ContexteApple, portee: Portee): string {
  const e = new Ecrivain();
  e.ligne('// Produit par Humalis : les fonctions écrites en haut du fichier.');
  e.ligne('import SwiftUI');
  for (const f of application.fonctions) {
    const info = app.fonctions.get(f.nom)!;
    portee.variables.clear();
    for (const p of f.parametres) portee.variables.set(p.nom, { code: nomSwift(p.nom), type: p.type, opt: false });
    let ligne = f.ligne;
    const hote: HotePage = {
      valeurs: new Valeurs(app.types, portee, (quoi) => app.refuser(ligne, `${quoi} ne se traduit pas en Swift (fonction « ${f.nom} »).`)),
      refuser: (l, quoi) => app.refuser(l, `${quoi} (fonction « ${f.nom} »).`),
      ligne,
      pages: app.pages,
      etatsRequetes: new Set(),
      estEtat: () => false,
      nomEtatRequete: (n) => n,
    };
    ligne = f.ligne;
    const corps = new Ecrivain();
    corps.indenter(() => new EcrivainActions(hote, new Map()).ecrire(corps, f.corps, { fonction: true }));
    const texte = corps.texte();
    const retour = /\breturn\b/.test(texte) ? ` -> ${app.types.swift(info.retour, info.opt)}` : '';
    const parametres = f.parametres.map((p) => `${nomSwift(p.nom)}: ${app.types.swift(p.type)}`).join(', ');
    e.ligne();
    e.ligne(`@MainActor func ${nomSwift(f.nom)}(${parametres})${/\bawait\b/.test(texte) ? ' async' : ''}${retour} {`);
    for (const l of texte.trimEnd().split('\n')) e.ligne(l);
    if (retour && !/^\s*return\b.*$/m.test(texte.trimEnd().split('\n').at(-1) ?? '')) e.ligne(`  return ${info.opt ? 'nil' : app.types.defaut(info.retour)}`);
    e.ligne('}');
  }
  return e.texte();
}

function sourcesSwift(sources: SourceRI[]): string {
  const e = new Ecrivain();
  e.ligne("// Produit par Humalis : les API que les pages appellent. Un jeton public part avec l'application ; un secret n'est jamais écrit ici.");
  e.ligne('import Foundation');
  e.ligne();
  e.bloc('enum Sources {', () => {
    for (const s of sources) {
      const champs = [
        `nom: ${chaineSwift(s.nom)}`,
        `adresse: ${chaineSwift(s.adresse)}`,
        ...(s.entetes.length ? [`entetes: [${s.entetes.map((h) => `(${chaineSwift(h.nom)}, ${chaineSwift(h.valeur)})`).join(', ')}]`] : []),
        ...(s.jetonPublic ? [`jeton: (${chaineSwift(s.jetonPublic.valeur)}, ${s.jetonPublic.place.genre === 'autorisation' ? '.autorisation' : `.${s.jetonPublic.place.genre}(${chaineSwift(s.jetonPublic.place.nom)})`})`] : []),
        ...(s.enveloppe !== undefined ? [`enveloppe: ${chaineSwift(s.enveloppe)}`] : []),
        ...(s.erreurDans !== undefined ? [`erreurDans: ${chaineSwift(s.erreurDans)}`] : []),
        `essais: ${s.essais ?? 2}`,
        `delai: ${(s.delai ?? 10) * 1000}`,
      ];
      e.ligne(`static let ${nomSwift(s.nom)} = SourceHumalis(${champs.join(', ')})`);
    }
  });
  return e.texte();
}

interface Disposition {
  entete?: { nom: string; sans: string[] };
  pied?: { nom: string; sans: string[] };
}

/** Le routeur : une route par page, et la vue de chaque route. */
function routesSwift(application: Application, app: ContexteApple, entree: Ecran, chemins: Map<string, string>): string {
  const e = new Ecrivain();
  e.ligne('// Produit par Humalis : les pages et la navigation.');
  e.ligne('import SwiftUI');
  e.ligne();
  e.bloc('enum Route: Hashable {', () => {
    for (const ecran of application.ecrans) {
      const info = app.pages.get(ecran.nom)!;
      const valeurs = [...info.parametres.map((p) => `${nomSwift(p)}: String`), ...info.filtres.map((f) => `${nomSwift(f.nom)}: ${f.nombre ? 'Double?' : 'String?'} = nil`)];
      e.ligne(`case ${nomRoute(ecran.nom)}${valeurs.length ? `(${valeurs.join(', ')})` : ''}`);
    }
    e.ligne();
    e.ligne(`static let accueilHumalis: Route = .${nomRoute(entree.nom)}`);
    e.ligne();
    e.ligne('/** La vue de chaque page ; une sous-page se montre dans sa page parente. */');
    e.bloc('@MainActor @ViewBuilder var vue: some View {', () => {
      e.bloc('switch self {', () => {
        for (const ecran of application.ecrans) {
          const info = app.pages.get(ecran.nom)!;
          const noms = [...info.parametres, ...info.filtres.map((f) => f.nom)].map(nomSwift);
          e.ligne(`case .${nomRoute(ecran.nom)}${noms.length ? `(${noms.map((n) => `let ${n}`).join(', ')})` : ''}:`);
          e.indenter(() => {
            const appel = `${nomPage(ecran.nom)}(${noms.map((n) => `${n}: ${n}`).join(', ')})`;
            const parent = ecran.parent !== undefined ? application.ecrans.find((p) => p.nom === ecran.parent) : undefined;
            const contenu = parent ? `${nomPage(parent.nom)}(sousPage: AnyView(${appel}))` : appel;
            if (ecran.reservee) {
              const ici = noms.length ? `.${nomRoute(ecran.nom)}(${noms.map((n) => `${n}: ${n}`).join(', ')})` : `.${nomRoute(ecran.nom)}`;
              e.ligne(`GardeHumalis(qui: .${ecran.reservee.qui}, sinon: ${routeSimple(ecran.reservee.sinon, app)}, ici: ${ici}) { ${contenu} }`);
            } else e.ligne(contenu);
          });
        }
      });
    });
  });
  e.ligne();
  e.ligne('/** Où en est la personne dans les pages. */');
  e.ligne('@MainActor @Observable final class Routeur {');
  e.indenter(() => {
    e.ligne('static let commun = Routeur()');
    e.ligne('var chemin: [Route] = []');
    e.ligne('var ancre: String?');
    e.ligne('private var apresConnexion: Route?');
    e.ligne();
    e.bloc('func aller(_ route: Route, ancre: String? = nil) {', () => {
      e.ligne('if route == .accueilHumalis { chemin = [] } else if chemin.last != route { chemin.append(route) }');
      e.ligne('self.ancre = ancre');
    });
    e.ligne();
    e.bloc('func revenir(sinon: Route? = nil) {', () => {
      e.ligne('if !chemin.isEmpty { chemin.removeLast() } else if let sinon { aller(sinon) }');
    });
    e.ligne();
    e.bloc('/** Vers la page de connexion, en se souvenant de la page voulue. */\n  func remplacerPourConnexion(_ route: Route, puis ici: Route) {', () => {
      e.ligne('apresConnexion = ici');
      e.ligne('if chemin.last == ici { chemin.removeLast() }');
      e.ligne('aller(route)');
    });
    e.ligne();
    e.bloc('/** « continuer vers » : la page voulue avant la connexion, sinon celle-ci. */\n  func continuer(sinon: Route) {', () => {
      e.ligne('if !chemin.isEmpty { chemin.removeLast() }');
      e.ligne('aller(apresConnexion ?? sinon)');
      e.ligne('apresConnexion = nil');
    });
    e.ligne();
    e.bloc('/** Une adresse reçue : une page du programme, ou une adresse externe permise. */\n  func allerVers(_ adresse: String) {', () => {
      e.ligne('if adresse.contains(":") && !adresse.hasPrefix("/") { ouvrirExterne(adresse); return }');
      e.bloc('switch adresse.hasPrefix("/") ? adresse : "/" + adresse {', () => {
        for (const ecran of application.ecrans) {
          const info = app.pages.get(ecran.nom)!;
          if (info.parametres.length > 0) continue;
          e.ligne(`case ${chaineSwift(chemins.get(ecran.nom) ?? `/${ecran.nom}`)}: aller(.${nomRoute(ecran.nom)}${info.filtres.length ? '()' : ''})`);
        }
        e.ligne('default: Messages.commun.afficher("Cette page n\'existe pas.", .erreur)');
      });
    });
    e.ligne();
    e.bloc('/** L\'adresse publique d\'une page, pour la partager. */\n  nonisolated static func adressePublique(_ page: String) -> String {', () => {
      e.ligne('Configuration.adresseDuSite + "/" + page');
    });
  });
  e.ligne('}');
  return e.texte();
}

function routeSimple(page: string, app: ContexteApple): string {
  const info = app.pages.get(page);
  return `.${nomRoute(page)}${info && info.filtres.length ? '()' : ''}`;
}

function applicationSwift(nom: string, entree: Ecran, disposition: Disposition): string {
  const racine = `${nomPage(entree.nom)}()`;
  const sans = (liste: string[]) => (liste.length ? `![${liste.map((r) => `Route.${r}`).join(', ')}].contains(Routeur.commun.chemin.last ?? .accueilHumalis)` : 'true');
  const enteteCond = disposition.entete ? sans(disposition.entete.sans) : '';
  const piedCond = disposition.pied ? sans(disposition.pied.sans) : '';
  return `// Produit par Humalis : l'application.
import SwiftUI

@main
struct ${nom}App: App {
    var body: some Scene {
        WindowGroup {
            RacineHumalis()
        }
        #if os(macOS)
        .windowResizability(.contentMinSize)
        .defaultSize(width: 1000, height: 720)
        #endif
    }
}

/** La pile des pages, l'en-tête et le pied communs, les messages et les questions. */
struct RacineHumalis: View {
    var body: some View {
        @Bindable var routeur = Routeur.commun
        NavigationStack(path: $routeur.chemin) {
            ${racine}
                .navigationDestination(for: Route.self) { $0.vue }
        }
${disposition.entete ? `        .safeAreaInset(edge: .top, spacing: 0) {
            if ${enteteCond} {
                VStack(spacing: 0) {
                    ${disposition.entete.nom}().padding(.horizontal, 16).padding(.vertical, 8)
                    Divider()
                }
                .background(.bar)
            }
        }
` : ''}${disposition.pied ? `        .safeAreaInset(edge: .bottom, spacing: 0) {
            if ${piedCond} {
                VStack(spacing: 0) {
                    Divider()
                    ${disposition.pied.nom}().padding(.horizontal, 16).padding(.vertical, 8)
                }
                .background(.bar)
            }
        }
` : ''}        .overlay(alignment: .top) { PileMessagesHumalis() }
        .modifier(QuestionHumalis())
        .preferredColorScheme(Apparence.commun.schema)
        #if os(macOS)
        .frame(minWidth: 480, minHeight: 400)
        #endif
    }
}
`;
}

function configurationSwift(application: Application, options: OptionsApple): string {
  const mode = application.theme?.mode ?? 'automatique';
  const adresse = (application.site?.adresse ?? '').replace(/\/+$/, '');
  return `// Produit par Humalis : ce que la compilation a décidé.
import Foundation

enum Configuration {
    /** L'adresse du serveur que l'application appelle (--serveur). */
    static let serveur = ${chaineSwift(options.serveur ?? 'http://localhost:3000')}
    static let themeDeDepart: Apparence.Mode = .${mode}
    static let adresseDuSite = ${chaineSwift(adresse)}
${application.langues ? `    static let langues: [(code: String, nom: String)] = [${application.langues.map((l) => `(${chaineSwift(l.code)}, ${chaineSwift(l.nom)})`).join(', ')}]\n` : ''}}
`;
}

function lisezmoi(nom: string, options: OptionsApple): string {
  return `# ${nom}

Projet SwiftUI produit par Humalis depuis \`${options.source}\` : une seule application native pour iPhone, iPad et Mac.

Le compilateur réécrit ce dossier à chaque compilation : pour du Swift écrit à la main, utilisez \`sur apple "Vue.swift"\` dans le fichier Humalis.

## Lancer

Ouvrez \`${nom}.xcodeproj\` dans Xcode, choisissez un simulateur ou « My Mac », puis lancez. Ou en ligne de commande :

\`\`\`sh
xcodebuild -project ${nom}.xcodeproj -scheme ${nom} -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
xcodebuild -project ${nom}.xcodeproj -scheme ${nom} -destination 'platform=macOS' build
\`\`\`

Il faut Xcode 16 ou plus récent ; l'application tourne à partir d'iOS 17 et de macOS 14.

${options.serveur ? `L'application appelle le serveur \`${options.serveur}\`. ` : ''}La variable d'environnement \`HUMALIS_SERVEUR\` remplace l'adresse du serveur au lancement, pour essayer.

## Signer et publier

${options.equipe ? `Le projet est réglé pour l'équipe \`${options.equipe}\`.` : "Recompilez avec `--equipe VOTRE_EQUIPE` (les 10 caractères de votre compte Apple Developer) et `--identifiant com.exemple.application`."}

\`\`\`sh
xcodebuild -project ${nom}.xcodeproj -scheme ${nom} -destination 'generic/platform=iOS' -archivePath build/${nom}.xcarchive archive
\`\`\`

Ouvrez ensuite l'archive dans Xcode (Window > Organizer) pour l'envoyer sur TestFlight.
`;
}

/** Les fichiers du projet, ou les refus : rien n'est écrit tant qu'une construction manque. */
export function genererProjetApple(application: Application, options: OptionsApple): { fichiers: Map<string, string>; diagnostics: Diagnostic[] } {
  const diagnostics = verifier(application);
  const nom = nomApplication(options.nom);
  const cle = `humalis:${simplifier(options.nom) || 'application'}`;
  const refuser = (ligne: number, message: string) => diagnostics.push({ gravite: 'erreur', ligne, message: `${message.replace(/\.$/, '')} : cela n'est pas encore disponible sur la cible Apple.` });
  const avertir = (ligne: number, message: string) => {
    if (!diagnostics.some((d) => d.message === message)) diagnostics.push({ gravite: 'avertissement', ligne, message });
  };

  const types = new Types(application, donneesDe);
  const fonctions: Portee['fonctions'] = new Map();
  const pages: HotePage['pages'] = new Map(application.ecrans.map((e) => [e.nom, { parametres: e.parametresAdresse ?? [], filtres: e.filtres ?? [] }]));
  const ressources = new Map<string, string>();
  const app: ContexteApple = {
    types,
    partages: application.partages,
    fonctions,
    ...(application.langues ? { langues: application.langues } : {}),
    pages,
    cle,
    composants: new Map(application.composants.map((c) => [c.nom, c.parametres])),
    natifs: new Set(application.composantsReact.filter((c) => c.chemin.endsWith('.swift') || 'natif' in c).map((c) => c.nom)),
    ressource(chemin) {
      const fichier = chemin.replace(/[^A-Za-z0-9._-]/g, '_');
      ressources.set(chemin, fichier);
      return fichier;
    },
    refuser,
    avertir,
    session: false,
  };

  const portee: Portee = { variables: new Map(), champs: new Map(), fonctions, etatsRequetes: new Set(), besoins: new Set(), langues: application.langues !== undefined };
  const valeurs = new Valeurs(types, portee, (quoi) => refuser(1, `${quoi} ne se traduit pas en Swift`));
  // Le type de retour d'une fonction : celui écrit par la représentation intermédiaire, sinon celui de son premier « rendre ».
  for (const f of application.fonctions) fonctions.set(f.nom, { parametres: f.parametres, retour: f.retour, opt: false });
  for (const f of application.fonctions) {
    portee.variables.clear();
    for (const p of f.parametres) portee.variables.set(p.nom, { code: nomSwift(p.nom), type: p.type, opt: false });
    const rendus: { valeur: Parameters<Valeurs['expr']>[0] }[] = [];
    const chercher = (actions: Action[]) => {
      for (const a of actions) {
        if (a.type === 'locale') portee.variables.set(a.nom, { code: nomSwift(a.nom), type: a.typeValeur, opt: false });
        if (a.type === 'rendre') rendus.push({ valeur: a.valeur });
        sousActions(a).forEach(chercher);
      }
    };
    chercher(f.corps);
    const lu = rendus[0] ? valeurs.expr(rendus[0].valeur) : undefined;
    if (lu) fonctions.set(f.nom, { parametres: f.parametres, retour: plusPrecis(f.retour, lu.type), opt: lu.opt });
  }
  portee.variables.clear();

  const fichiers = new Map<string, string>();
  const dossier = nom;
  const ecrire = (chemin: string, contenu: string) => fichiers.set(`${dossier}/${chemin}`, contenu);

  for (const c of application.composants) ecrire(`Composants/${nomComposant(c.nom)}.swift`, new GenerateurPage(c, app, c.parametres).generer());
  const disposition: Disposition = {};
  for (const [genre, composant, d] of [['entete', 'EnteteSite', application.disposition?.entete], ['pied', 'PiedSite', application.disposition?.pied]] as const) {
    if (!d) continue;
    ecrire(`Composants/${composant}.swift`, new GenerateurPage({ ...d.ecran, nom: composant }, app, [], composant).generer());
    const sans = application.ecrans.filter((e) => (genre === 'entete' ? e.sansEntete : e.sansPied)).map((e) => nomRoute(e.nom));
    disposition[genre] = { nom: composant, sans };
  }
  for (const ecran of application.ecrans) ecrire(`Pages/${nomPage(ecran.nom)}.swift`, new GenerateurPage(ecran, app).generer());
  if (application.fonctions.length > 0) ecrire('Humalis/Fonctions.swift', fonctionsSwift(application, app, portee));

  const simple = (e: Ecran) => !e.parametresAdresse?.length && e.parent === undefined;
  const entree = application.ecrans.find((e) => e.nom === 'accueil' && simple(e)) ?? application.ecrans.find((e) => simple(e) && e.nom !== 'introuvable') ?? application.ecrans.find(simple) ?? application.ecrans[0];
  if (!simple(entree)) refuser(entree.ligne, `la page d'entrée « ${entree.nom} » attend un paramètre`);
  const cheminsPages = new Map(application.ecrans.map((e) => [e.nom, e === entree ? '/' : `/${simplifier(e.nom)}`]));
  ecrire('Humalis/Routes.swift', routesSwift(application, app, entree, cheminsPages));
  ecrire(`${nom}App.swift`, applicationSwift(nom, entree, disposition));
  ecrire('Humalis/Configuration.swift', configurationSwift(application, options));
  if (application.sources.length > 0) ecrire('Humalis/Sources.swift', sourcesSwift(application.sources));

  // Les variables partagées peuvent citer des types de fiches : avant Donnees.swift.
  portee.variables.clear();
  ecrire('Humalis/Partage.swift', partageSwift(application.partages, types, cle, valeurs));

  const pagesCode = [...fichiers.values()].join('\n');
  ecrire('Humalis/Valeurs.swift', VALEURS_SWIFT);
  ecrire('Humalis/Formats.swift', FORMATS_SWIFT);
  ecrire('Humalis/Interface.swift', INTERFACE_SWIFT);
  ecrire('Humalis/Couleurs.swift', couleursSwift(application.theme));
  ecrire('Humalis/Messages.swift', MESSAGES_SWIFT);
  ecrire('Humalis/Systeme.swift', SYSTEME_SWIFT);
  ecrire('Humalis/Minuteries.swift', MINUTERIES_SWIFT);
  ecrire('Humalis/Memoire.swift', MEMOIRE_SWIFT);
  const reseau = /\b(Serveur\.commun|Session\.commun|GardeHumalis)\b/.test(pagesCode);
  // La session est lue par le serveur : les deux vont ensemble.
  if (reseau || application.sources.length > 0) ecrire('Humalis/Serveur.swift', SERVEUR_SWIFT);
  if (application.langues) ecrire('Humalis/Langues.swift', LANGUES_SWIFT);
  const tout = [...fichiers.values()].join('\n');
  for (const [chemin, contenu] of fichiersElements(tout)) ecrire(chemin, contenu);
  ecrire('Humalis/Donnees.swift', donneesSwift(types));

  // Les fichiers écrits à la main (« sur apple "…" »).
  for (const [, natif] of options.natifs ?? []) ecrire(`Natif/${natif.nom}`, natif.contenu);

  // Les images et les sons : recopiés dans l'application, sous un nom plat.
  for (const [chemin, info] of options.medias ?? []) {
    const copie = nomDeLaCopie(chemin);
    const fichier = ressources.get(copie) ?? ressources.get(chemin);
    if (fichier && info.contenu !== undefined) ecrire(`Ressources/${fichier}`, contenuBinaire(info.contenu));
  }

  const logo = application.site?.logo;
  const octetsLogo = logo ? options.images?.get(logo) : undefined;
  for (const [chemin, contenu] of assets(octetsLogo !== undefined, marqueDe(application.theme))) ecrire(chemin, contenu);
  if (octetsLogo !== undefined) ecrire('Assets.xcassets/AppIcon.appiconset/icone.png', contenuBinaire(octetsLogo));
  const avecFichiers = /\bChoixFichierHumalis\b/.test(tout);
  ecrire(`${nom}.entitlements`, droits(avecFichiers));
  ecrire('PrivacyInfo.xcprivacy', CONFIDENTIALITE);

  const nomAffiche = application.site?.nom ?? options.nom;
  fichiers.set(
    `${nom}.xcodeproj/project.pbxproj`,
    projetXcode({
      nom,
      nomAffiche,
      identifiant: options.identifiant ?? `local.humalis.${simplifier(options.nom).replace(/_/g, '-') || 'application'}`,
      ...(options.equipe ? { equipe: options.equipe } : {}),
      icone: octetsLogo !== undefined,
      fichiers: avecFichiers,
    }),
  );
  fichiers.set(`${nom}.xcodeproj/xcshareddata/xcschemes/${nom}.xcscheme`, schemaXcode(nom));
  fichiers.set(MARQUE_APPLE, `Projet produit par Humalis depuis ${options.source}.\nLe compilateur réécrit ce dossier à chaque compilation.\n`);
  fichiers.set('LISEZMOI.md', lisezmoi(nom, options));
  return { fichiers, diagnostics };
}

function marqueDe(theme: ThemeRI | undefined): { clair: string; sombre: string } | undefined {
  const marque = theme?.couleurs.find((c) => c.nom === 'marque');
  return marque ? { clair: marque.clair, sombre: marque.sombre } : undefined;
}
