/**
 * La cible Apple : un programme Humalis devient un projet Xcode en SwiftUI,
 * une seule application native pour iPhone, iPad et Mac, sans navigateur
 * embarqué. Comme la cible web écrit du React, celle-ci écrit du Swift lisible.
 */
import type { TypeValeur } from '../../ri/types.js';
import type { Diagnostic } from '../../analyse/erreurs.js';
import { simplifier } from '../../analyse/elements.js';
import { sousActions } from '../../ri/actions.js';
import { nomDeLaCopie, type InfoMedia } from '../../ri/medias.js';
import type { Action, Application, Ecran, Etat, NoeudVue, SourceRI, ThemeRI } from '../../ri/types.js';
import { contenuBinaire } from '../binaire.js';
import { Ecrivain } from '../web/ecrivain.js';
import { cheminsDesPages, donneesDesPages } from '../web/projet.js';
import { COULEURS_CSS } from '../web/styles.js';
import { EcrivainActions, type HotePage } from './actions.js';
import { FORMATS_SWIFT, INTERFACE_SWIFT, VALEURS_SWIFT } from './bibliotheque.js';
import { fichiersElements } from './elements.js';
import { nomIcone } from './icones.js';
import { chaineSwift, nomApplication, nomComposant, nomPage, nomRoute, nomSwift } from './noms.js';
import { GenerateurPage, type ContexteApple } from './page.js';
import { CssApple } from './css.js';
import { CssExact } from './css-exact.js';
import { DESSIN_SWIFT, tablesDessin } from './dessin.js';
import { touches } from './styles.js';
import { CONNEXIONS_SWIFT, ENVOIS_SWIFT, LANGUES_SWIFT, MEMOIRE_SWIFT, MESSAGES_SWIFT, MINUTERIES_SWIFT, NOTIFICATIONS_SWIFT, SERVEUR_SWIFT, SYSTEME_SWIFT } from './systeme.js';
import { Types, Valeurs, plusPrecis, type Portee } from './valeurs.js';
import { CONFIDENTIALITE, assets, associationSite, infoSupplementaire, type PaquetSwift, droits, projetXcode, schemaXcode } from './xcode.js';

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
  /** Le contenu des fichiers CSS du projet. */
  fichiersStyle?: Map<string, string>;
  medias?: Map<string, InfoMedia>;
  images?: Map<string, string>;
  /** Pour chaque composant Swift (« sur apple "Carte.swift" ») : son fichier. */
  natifs?: Map<string, { nom: string; contenu: string }>;
  /** Les fichiers de police du thème, en base 64. */
  polices?: Map<string, string>;
  /** Un test XCUITest, ajouté au projet pour l'essai de bout en bout. */
  essaisUi?: string;
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

  // Seul ce que l'appli affiche compte : un module écrit dans « sur site : » n'est pas refusé ici.
  const utilises = new Set<string>();
  const parcourir = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(parcourir);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (o.type === 'composant' && typeof o.nom === 'string') utilises.add(o.nom);
      Object.values(o).forEach(parcourir);
    }
  };
  parcourir([application.ecrans, application.disposition]);
  for (const c of application.composantsReact) {
    if (!utilises.has(c.nom) && c.apple === undefined) continue;
    if (c.module && c.apple === undefined) refuser(c.ligne, `« utiliser module » (${c.nom}) charge une bibliothèque JavaScript : la cible Apple n'a pas de JavaScript. Écrivez une vue Swift à la place : « utiliser composant "${c.nom}" depuis "…" sur apple "${c.nom}.swift" ».`);
    else if (c.apple === undefined) refuser(c.ligne, `le composant React « ${c.nom} » n'existe pas sur la cible Apple : donnez-lui une vue Swift avec « utiliser composant "${c.nom}" depuis "${c.chemin}" sur apple "${c.nom}.swift" ».`);
  }
  for (const p of application.theme?.polices ?? []) {
    if (p.fichier && !/\.(ttf|otf|woff2?)$/i.test(p.fichier)) avertir(1, `la police « ${p.fichier} » n'est pas chargée sur la cible Apple, qui lit les fichiers .ttf, .otf, .woff et .woff2 : la police du système est utilisée à la place.`);
  }
  const logo = application.site?.logo;
  if (logo && !/\.png$/i.test(logo)) avertir(application.site!.ligne, `le logo « ${logo} » ne peut pas servir d'icône sur la cible Apple, qui demande un PNG carré de 1024×1024 : l'application garde l'icône par défaut.`);
  const apercu = application.ecrans.find((e) => e.apercu);
  if (apercu) avertir(apercu.ligne, "« apercu » est sans effet sur la cible Apple : une application n'a ni onglet, ni moteur de recherche, ni aperçu de partage.");
  if (JSON.stringify(application.ecrans).includes('"type":"choixMotDePasse"') && !application.liensProfonds?.domaine) avertir(1, "« choisir le mot de passe » : le lien reçu par e-mail ouvre le site. Pour qu'il ouvre l'application, ajoutez « liens profonds \"…\" et domaine \"…\" ».");
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
      if (p.memorisee || p.horsLigne) e.ligne(`var ${nom}: ${types.swift(p.type, p.facultatif)} = ${valeur} { didSet { Memoire.ecrire(${chaineSwift(`${cle}:partage:${simplifier(p.nom)}`)}, ${nom}${p.secret ? ', secret: true' : ''}${p.horsLigne ? ', fichier: true' : ''}) } }`);
      else e.ligne(`var ${nom}: ${types.swift(p.type, p.facultatif)} = ${valeur}`);
    }
    e.ligne();
    e.bloc('private init() {', () => {
      for (const p of partages.filter((x) => x.memorisee || x.horsLigne)) e.ligne(`if let lue: ${types.swift(p.type, p.facultatif)} = Memoire.lire(${chaineSwift(`${cle}:partage:${simplifier(p.nom)}`)}${p.secret ? ', secret: true' : ''}${p.horsLigne ? ', fichier: true' : ''}) { ${nomSwift(p.nom)} = lue }`);
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
      estHorsLigne: () => false,
      retourSouple: info.retour.genre === 'inconnu',
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

/** « en arriere plan : » : du code sans page ouverte, qui ne voit donc que les variables partagées. */
function arrierePlanSwift(application: Application, app: ContexteApple, portee: Portee, identifiant: string, envois: boolean): string {
  portee.variables.clear();
  for (const p of application.partages) portee.variables.set(p.nom, { code: `Partage.commun.${nomSwift(p.nom)}`, type: p.type, opt: p.facultatif ?? false });
  const corps = new Ecrivain();
  let ligne = 1;
  const precision = ' : « en arriere plan » ne voit que les variables partagées';
  const hote: HotePage = {
    valeurs: new Valeurs(app.types, portee, (quoi) => app.refuser(ligne, `${quoi}${precision}.`)),
    refuser: (l, quoi) => app.refuser(l, `${quoi}${precision}.`),
    ligne,
    pages: app.pages,
    etatsRequetes: new Set(),
    estEtat: () => false,
    nomEtatRequete: (n) => n,
    estHorsLigne: (nom) => application.partages.some((p) => p.nom === nom && p.horsLigne),
  };
  const ecrivain = new EcrivainActions(hote, new Map());
  for (const ecran of application.ecrans) {
    for (const g of ecran.gestionnaires.filter((x) => x.declencheur === 'arrierePlan')) {
      ligne = g.ligne;
      hote.ligne = g.ligne;
      corps.indenter(() => ecrivain.ecrire(corps, g.actions));
    }
  }
  const texte = corps.texte();
  if (/\b(planificateur\.|directs\.|relances\[)/.test(texte)) app.refuser(ligne, '« en arriere plan » : une minuterie ou une lecture « en direct » demande une page ouverte.');
  return `// Produit par Humalis : ce que l'application fait quand le système la réveille.
import SwiftUI
#if os(iOS)
import BackgroundTasks
#endif

enum ArrierePlanHumalis {
    static let identifiant = ${chaineSwift(identifiant)}

    /** Le système choisit le moment : pas avant 15 minutes, souvent plus tard. */
    static func planifier() {
        #if os(iOS)
        let demande = BGAppRefreshTaskRequest(identifier: identifiant)
        demande.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(demande)
        #endif
    }

    /** Pour les essais : le simulateur ne réveille jamais une application. */
    @MainActor static func lancerSiEssai() {
        #if os(macOS)
        demarrerSurMac()
        #endif
        if ProcessInfo.processInfo.environment["HUMALIS_ESSAI_ARRIERE_PLAN"] != nil { Task { await tacheArrierePlanHumalis() } }
    }

    #if os(macOS)
    @MainActor private static let activite = NSBackgroundActivityScheduler(identifier: identifiant)

    /** Sur Mac, l'application doit être ouverte ; la tâche revient toutes les 15 minutes environ. */
    @MainActor static func demarrerSurMac() {
        activite.repeats = true
        activite.interval = 15 * 60
        activite.schedule { termine in
            nonisolated(unsafe) let fin = termine
            Task { @MainActor in
                await tacheArrierePlanHumalis()
                fin(.finished)
            }
        }
    }
    #endif
}

@MainActor func tacheArrierePlanHumalis() async {
${/\bjetons\./.test(texte) ? '  let jetons = JetonsRequetes()\n' : ''}${texte}${envois ? '  await EnvoisGardes.commun.envoyer(annoncer: false)\n' : ''}}
`;
}

/** Les commandes des « menu de l'application » : du code sans page ouverte, comme le travail en arrière-plan. */
function commandesSwift(application: Application, app: ContexteApple, portee: Portee): { code: string; menus: { menu: string; commandes: { titre: string; fonction: string; raccourci?: string }[] }[] } {
  portee.variables.clear();
  for (const p of application.partages) portee.variables.set(p.nom, { code: `Partage.commun.${nomSwift(p.nom)}`, type: p.type, opt: p.facultatif ?? false });
  const e = new Ecrivain();
  e.ligne("// Produit par Humalis : les commandes des menus de l'application.");
  e.ligne('import SwiftUI');
  const menus: { menu: string; commandes: { titre: string; fonction: string; raccourci?: string }[] }[] = [];
  let n = 0;
  for (const g of application.ecrans.flatMap((x) => x.gestionnaires.filter((y) => y.declencheur === 'commandeMenu'))) {
    const hote: HotePage = {
      valeurs: new Valeurs(app.types, portee, (quoi) => app.refuser(g.ligne, `${quoi} : une commande de menu ne voit que les variables partagées.`)),
      refuser: (l, quoi) => app.refuser(l, `${quoi} : une commande de menu ne voit que les variables partagées.`),
      ligne: g.ligne,
      pages: app.pages,
      etatsRequetes: new Set(),
      estEtat: () => false,
      nomEtatRequete: (x) => x,
      estHorsLigne: () => false,
    };
    const corps = new Ecrivain();
    corps.indenter(() => new EcrivainActions(hote, new Map()).ecrire(corps, g.actions));
    const texte = corps.texte();
    if (/\b(planificateur\.|directs\.|relances\[)/.test(texte)) app.refuser(g.ligne, 'une commande de menu ne peut pas lancer de minuterie ni de lecture « en direct ».');
    const fonction = `commandeMenu${++n}`;
    e.ligne();
    e.ligne(`@MainActor func ${fonction}() async {`);
    if (/\bjetons\./.test(texte)) e.ligne('  let jetons = JetonsRequetes()');
    for (const l of texte.trimEnd().split('\n')) e.ligne(l);
    e.ligne('}');
    let menu = menus.find((m) => m.menu === g.menu);
    if (!menu) menus.push((menu = { menu: g.menu ?? '', commandes: [] }));
    menu.commandes.push({ titre: g.titreCommande ?? '', fonction, ...(g.touches ? { raccourci: g.touches } : {}) });
  }
  return { code: e.texte(), menus };
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
        ...(s.session ? ['session: true'] : []),
        `essais: ${s.essais ?? 2}`,
        `delai: ${(s.delai ?? 10) * 1000}`,
      ];
      e.ligne(`static let ${nomSwift(s.nom)} = SourceHumalis(${champs.join(', ')})`);
    }
  });
  return e.texte();
}

interface EntreeMenu {
  titre: string;
  icone?: string;
  route: string;
}

interface Disposition {
  entete?: { nom: string; sans: string[]; css: string[]; haut: boolean };
  pied?: { nom: string; sans: string[]; colle: boolean; css: string[] };
  /** Les liens du menu de l'en-tête : la barre latérale de l'iPad et du Mac, et le menu « Aller à ». */
  menu?: EntreeMenu[];
  /** L'en-tête montre autre chose que son menu : il reste au-dessus des pages, même avec la barre latérale. */
  enteteAvecAutreChose?: boolean;
}

/** Le premier menu d'une suite de nœuds. */
function premierMenu(noeuds: NoeudVue[]): Extract<NoeudVue, { type: 'bloc' }> | undefined {
  for (const n of noeuds) {
    if (n.type !== 'bloc') continue;
    if (n.genre === 'menu') return n;
    const dedans = premierMenu(n.corps);
    if (dedans) return dedans;
  }
  return undefined;
}

/** Vrai si quelque chose d'autre que ce menu est montré. */
function montreAutreChose(noeuds: NoeudVue[], menu: NoeudVue): boolean {
  return noeuds.some((n) => n !== menu && (n.type !== 'bloc' || montreAutreChose(n.corps, menu)));
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
    // Revenir en arrière depuis une page de connexion ne ferait que renvoyer vers elle.
    // Une page sans entete et en pleine fenetre occupe aussi toute la fenêtre, sans barre latérale.
    const pagesConnexion = application.ecrans.filter((ecran) => /"type":"connexion(Google|Apple)?"/.test(JSON.stringify(ecran)) || (ecran.sansEntete && ecran.pleineFenetre)).map((ecran) => `.${nomRoute(ecran.nom)}`);
    e.ligne(pagesConnexion.length ? `var sansRetour: Bool { switch self { case ${pagesConnexion.join(', ')}: return true; default: return false } }` : 'var sansRetour: Bool { false }');
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
              const qui = ecran.reservee.qui.startsWith('role:') ? `.roles([${ecran.reservee.qui.slice(5).split(',').map(chaineSwift).join(', ')}])` : `.${ecran.reservee.qui}`;
              e.ligne(`GardeHumalis(qui: ${qui}, sinon: ${routeSimple(ecran.reservee.sinon, app)}, ici: ${ici}) { ${contenu} }`);
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
    e.ligne('private(set) var apresConnexion: Route?');
    e.ligne();
    e.bloc('func aller(_ route: Route, ancre: String? = nil) {', () => {
      if (application.ongletsApplication) e.ligne('if enOnglets, let rang = racinesDesOnglets.firstIndex(of: route) { choisirOnglet(rang); self.ancre = ancre; return }');
      e.ligne('if route == .accueilHumalis { chemin = [] } else if chemin.last != route { chemin.append(route) }');
      e.ligne('self.ancre = ancre');
    });
    e.ligne();
    e.bloc('/** Un lien du menu : la pile repart de cette page. */\n  func allerAuMenu(_ route: Route) {', () => {
      e.ligne('chemin = route == .accueilHumalis ? [] : [route]');
    });
    e.ligne();
    if (application.ongletsApplication) {
      e.ligne('var onglet = 0');
      e.ligne('var enOnglets = false');
      e.ligne(`private let racinesDesOnglets: [Route] = [${application.ongletsApplication.map((o) => routeSimple(o.page, app)).join(', ')}]`);
      e.bloc('func choisirOnglet(_ rang: Int) {', () => {
        e.ligne('onglet = rang');
        e.ligne('chemin = []');
      });
      e.ligne();
    }
    e.bloc('func revenir(sinon: Route? = nil) {', () => {
      e.ligne('if !chemin.isEmpty { chemin.removeLast() } else if let sinon { aller(sinon) }');
    });
    e.ligne();
    e.bloc('/** Vers la page de connexion, en se souvenant de la page voulue. */\n  func remplacerPourConnexion(_ route: Route, puis ici: Route) {', () => {
      // Déjà partie de cette page (une déconnexion suivie d'une redirection) : rien à faire.
      e.ligne('guard chemin.last == ici || (chemin.isEmpty && ici == .accueilHumalis) else { return }');
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
    if (application.liensProfonds) lienProfondSwift(e, application, app, entree, chemins);
    e.bloc('/** L\'adresse publique d\'une page, pour la partager. */\n  nonisolated static func adressePublique(_ page: String) -> String {', () => {
      e.ligne('Configuration.adresseDuSite + "/" + page');
    });
  });
  e.ligne('}');
  return e.texte();
}

/** « magasin://produit/42 » : la page « produit » avec son paramètre ; une page protégée reste gardée par sa page. */
function lienProfondSwift(e: Ecrivain, application: Application, app: ContexteApple, entree: Ecran, chemins: Map<string, string>): void {
  e.bloc('func ouvrirLien(_ url: URL) {', () => {
    const { schema, domaine } = application.liensProfonds!;
    const parLeSchema = `[url.host(percentEncoded: false)].compactMap { $0 } + url.pathComponents.filter { $0 != "/" }`;
    if (domaine) {
      const [hote, ...debut] = domaine.split('/');
      e.ligne('let parties = url.pathComponents.filter { $0 != "/" }');
      e.ligne('let morceaux: [String]');
      e.ligne('if url.scheme?.lowercased() == "https" {');
      e.indenter(() => {
        e.ligne(`guard url.host(percentEncoded: false)?.lowercased() == ${chaineSwift(hote)}, parties.starts(with: [${debut.map(chaineSwift).join(', ')}] as [String]) else { return }`);
        e.ligne(`morceaux = Array(parties.dropFirst(${debut.length}))`);
      });
      e.ligne('} else {');
      e.indenter(() => {
        e.ligne(`guard url.scheme?.lowercased() == ${chaineSwift(schema)} else { return }`);
        e.ligne(`morceaux = ${parLeSchema}`);
      });
      e.ligne('}');
    } else {
      e.ligne(`guard url.scheme?.lowercased() == ${chaineSwift(schema)} else { return }`);
      e.ligne(`let morceaux = ${parLeSchema}`);
    }
    e.ligne('if let fragment = url.fragment(percentEncoded: false), fragment.hasPrefix("jeton=") { Session.commun.jetonDeLien = String(fragment.dropFirst(6)) }');
    e.ligne('if morceaux.isEmpty { chemin = []; return }');
    for (const ecran of application.ecrans.filter((x) => x !== entree)) {
      const info = app.pages.get(ecran.nom)!;
      // « /collections/:slug » : un morceau fixe se compare, un « : » reçoit un paramètre, dans l'ordre.
      const morceaux = (chemins.get(ecran.nom) ?? `/${ecran.nom}`).split('/').filter(Boolean);
      let rang = 0;
      const valeurs = morceaux.flatMap((m, i) => (m.startsWith(':') && rang < info.parametres.length ? [`${nomSwift(info.parametres[rang++])}: morceaux[${i}]`] : []));
      const fixes = morceaux.flatMap((m, i) => (m.startsWith(':') ? [] : [`morceaux[${i}] == ${chaineSwift(m)}`]));
      const route = `.${nomRoute(ecran.nom)}${valeurs.length ? `(${valeurs.join(', ')})` : info.filtres.length ? '()' : ''}`;
      e.ligne(`if ${[`morceaux.count == ${morceaux.length}`, ...fixes].join(' && ')} { allerAuMenu(${route}); return }`);
    }
    e.ligne('Messages.commun.afficher("Cette page n\'existe pas.", .erreur)');
  });
  e.ligne();
}

function routeSimple(page: string, app: ContexteApple): string {
  const info = app.pages.get(page);
  return `.${nomRoute(page)}${info && info.filtres.length ? '()' : ''}`;
}

function menuSwift(entrees: EntreeMenu[]): string {
  const e = new Ecrivain();
  e.ligne('// Produit par Humalis : le menu de l\'en-tête, dans la barre latérale de l\'iPad et du Mac.');
  e.ligne('import SwiftUI');
  e.ligne();
  e.bloc('struct EntreeMenu: Identifiable {', () => {
    e.ligne('let id: Int');
    e.ligne('let titre: String');
    e.ligne('let icone: String?');
    e.ligne('let route: Route');
  });
  e.ligne();
  e.bloc('@MainActor var entreesDuMenu: [EntreeMenu] {', () => {
    e.ligne('[');
    e.indenter(() => entrees.forEach((m, i) => e.ligne(`EntreeMenu(id: ${i}, titre: ${m.titre}, icone: ${m.icone ? chaineSwift(m.icone) : 'nil'}, route: ${m.route}),`)));
    e.ligne(']');
  });
  return e.texte();
}

/** Tailles du système, pour garder les mêmes hauteurs avec la police du thème. */
const STYLES_POLICE: Record<string, number> = { largeTitle: 34, title: 28, title2: 22, title3: 20, headline: 17, body: 17, callout: 16, subheadline: 15, footnote: 13 };

/** Une taille écrite en CSS, ou un style de texte, garde la police du thème au lieu de repasser à celle du système. */
export function avecPoliceDuTheme(code: string, police: string): string {
  const nom = `PolicesHumalis.vrai(${chaineSwift(police)})`;
  return code
    .replace(/\.font\(\.system\(size: ([\d.]+)\)\)/g, `.font(.custom(${nom}, size: $1))`)
    .replace(/\.font\(\.(largeTitle|title3?|title2|headline|callout|subheadline|footnote)\)/g, (_, style: string) =>
      `.font(.custom(${nom}, size: ${STYLES_POLICE[style]}, relativeTo: .${style})${style === 'headline' ? '.weight(.semibold)' : ''})`);
}

function applicationSwift(nom: string, nomAffiche: string, entree: Ecran, disposition: Disposition, polices: { fichier: string; nom: string }[], policeTexte?: string, notifications = false, fonds: { dessin?: { largeur: number; hauteur: number; barre: boolean; barreVisible?: boolean[] }; barreLaterale?: string; liens?: boolean; domaine?: boolean; envois?: boolean; arrierePlan?: boolean; onglets?: { titre: string; route: string; icone: string }[]; menus?: ReturnType<typeof commandesSwift>['menus']; reglages?: string } = {}): string {
  // Par la route, et non la page directement : une page d'entrée réservée garde sa protection.
  const racine = entree.reservee ? 'Route.accueilHumalis.vue' : `${nomPage(entree.nom)}()`;
  const sans = (liste: string[]) => (liste.length ? `![${liste.map((r) => `Route.${r}`).join(', ')}].contains(Routeur.commun.chemin.last ?? .accueilHumalis)` : 'true');
  const entete = disposition.entete;
  const pied = disposition.pied;
  const menu = disposition.menu && disposition.menu.length > 0 ? disposition.menu : undefined;
  // Avec la barre latérale, un en-tête qui n'a que son menu disparaît.
  const montrerEntete = entete ? `${sans(entete.sans)}${menu && !disposition.enteteAvecAutreChose ? (fonds.onglets ? ' && false' : ' && !large') : ''}${entete.haut ? ' && large' : ''}` : '';
  const piedColle = pied?.colle ? pied : undefined;
  const piedQuiDefile = pied && !pied.colle ? pied : undefined;
  const enteteDansLaPage = entete ? `AnyView(${entete.nom}().padding(.horizontal, 16).padding(.vertical, 8).frame(maxWidth: .infinity, alignment: .leading)${entete.css.length ? `\n${entete.css.join("\n")}\n` : ""})` : '';
  const insets = `${entete ? `
            #if os(iOS)
            .safeAreaInset(edge: .top, spacing: 0) {
                if ${montrerEntete} {
                    VStack(spacing: 0) {
                        ${entete.nom}().padding(.horizontal, 16).padding(.vertical, 8)
                        Divider()
                    }
                    .background(.bar)${entete.css.map((l) => `\n                    ${l}`).join('')}
                }
            }${entete.haut ? `
            .environment(\\.enteteHumalis, !large && ${sans(entete.sans)} ? ${enteteDansLaPage} : nil)` : ''}
            #else
            // Sur Mac, le haut de la fenêtre appartient à la barre de titre : l'en-tête vit dans la page.${menu && !disposition.enteteAvecAutreChose ? '' : `
            .environment(\\.enteteHumalis, ${sans(entete.sans)} ? ${enteteDansLaPage} : nil)`}
            #endif` : ''}${piedColle ? `
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if ${sans(piedColle.sans)} {
                    VStack(spacing: 0) {
                        Divider()
                        ${piedColle.nom}().padding(.horizontal, 16).padding(.vertical, 8)
                    }
                    .background(.bar)${piedColle.css.map((l) => `\n                    ${l}`).join('')}
                }
            }` : ''}${piedQuiDefile ? `
            .environment(\\.piedHumalis, ${sans(piedQuiDefile.sans)} ? AnyView(${piedQuiDefile.nom}().padding(.horizontal, 16).padding(.vertical, 24).frame(maxWidth: .infinity, alignment: .leading)${piedQuiDefile.css.length ? `\n${piedQuiDefile.css.join("\n")}\n` : ""}) : nil)` : ''}`;
  const active = menu
    ? `    /** La page montrée, surlignée dans la barre latérale. */
    private var entreeActive: Int? {
        let ici = Routeur.commun.chemin.last ?? .accueilHumalis
        return entreesDuMenu.first { $0.route == ici }?.id
    }

`
    : '';
  const pile = `${active}    @ViewBuilder private var pile: some View {
        @Bindable var routeur = Routeur.commun
        NavigationStack(path: $routeur.chemin) {
            ${racine}
                .navigationDestination(for: Route.self) { route in route.vue.navigationBarBackButtonHidden(routeur.apresConnexion != nil || route.sansRetour${menu ? ' || entreesDuMenu.contains { $0.route == route }' : ''}) }
        }${insets}
    }
`;
  const largeur = `    #if os(iOS)
    @Environment(\\.horizontalSizeClass) private var classe
    private var large: Bool { classe == .regular }
    #else
    private let large = true
    #endif
`;
  // Un menu que le système a déjà s'enrichit au lieu d'apparaître en double.
  const groupes: Record<string, string> = { fichier: '.newItem', edition: '.pasteboard', presentation: '.toolbar', affichage: '.toolbar', fenetre: '.windowSize', aide: '.help' };
  const menusEcrits = (fonds.menus ?? []).map((m) => `
            ${groupes[simplifier(m.menu)] ? `CommandGroup(after: ${groupes[simplifier(m.menu)]})` : `CommandMenu(${chaineSwift(m.menu)})`} {${m.commandes.map((c) => `
                Button(${chaineSwift(c.titre)}) { Task { await ${c.fonction}() } }${c.raccourci ? touches(c.raccourci) : ''}`).join('')}
            }`).join('');
  const commandes = menu || menusEcrits
    ? `
        .commands {${menu ? `
            CommandMenu("Aller à") {
                ForEach(entreesDuMenu.prefix(9)) { entree in
                    Button(entree.titre) { Routeur.commun.allerAuMenu(entree.route) }
                        .keyboardShortcut(KeyEquivalent(Character("\\(entree.id + 1)")), modifiers: .command)
                }
            }` : ''}${menusEcrits}
        }`
    : '';
  const ongletsVue = fonds.onglets
    ? `    /** Sur iPhone, la vraie barre d'onglets ; chaque onglet garde sa page de départ. */
    private var ongletsCompacts: some View {
        @Bindable var routeur = Routeur.commun
        return TabView(selection: Binding(get: { routeur.onglet }, set: { routeur.choisirOnglet($0) })) {${fonds.onglets.map((o, i) => `
            NavigationStack(path: routeur.onglet == ${i} ? $routeur.chemin : .constant([])) {
                ${o.route}.vue
                    .navigationDestination(for: Route.self) { route in route.vue.navigationBarBackButtonHidden(routeur.apresConnexion != nil || route.sansRetour${menu ? ' || entreesDuMenu.contains { $0.route == route }' : ''}) }
            }
            .tabItem { Label(${chaineSwift(o.titre)}, systemImage: ${chaineSwift(o.icone)}) }
            .tag(${i})`).join('')}
        }${insets}
        .onAppear { routeur.enOnglets = true }
        .onDisappear { routeur.enOnglets = false }
    }

`
    : '';
  const contenu = menu
    ? `        Group {
            // Une page de connexion occupe toute la fenêtre : ni menu ni barre latérale.
            if Routeur.commun.chemin.last?.sansRetour == true {
                pile
            } else if large {${fonds.barreLaterale ? `
                #if os(macOS)
                ${fonds.barreLaterale} { pile }
                #else` : ''}
                NavigationSplitView {
                    List(entreesDuMenu) { entree in
                        Button { Routeur.commun.allerAuMenu(entree.route) } label: {
                            Label {
                                Text(verbatim: entree.titre)${policeTexte ? `.font(.custom(PolicesHumalis.vrai(${chaineSwift(policeTexte)}), size: 13))` : ''}
                            } icon: {
                                if let icone = entree.icone { Image(systemName: icone) }
                            }
                            // Toute la ligne se clique, pas seulement son texte.
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(entree.id == entreeActive ? Color.accentColor.opacity(0.18) : Color.clear)
                        .accessibilityAddTraits(entree.id == entreeActive ? .isSelected : [])
                        .accessibilityIdentifier("menu_\\(entree.id)")
                    }
                    .navigationTitle(${chaineSwift(nomAffiche)})
                } detail: {
                    pile
                }
                .environment(\\.menuLateral, true)${fonds.barreLaterale ? `
                #endif` : ''}
            } else {
                ${fonds.onglets ? 'ongletsCompacts' : 'pile'}
            }
        }`
    : `        ${fonds.onglets ? 'ongletsCompacts' : 'pile'}`;
  const inscrire = polices.length
    ? `
    init() {
        for (fichier, nom) in [${polices.map((p) => `(${chaineSwift(p.fichier)}, ${chaineSwift(p.nom)})`).join(', ')}] {
            guard let url = Bundle.main.url(forResource: fichier, withExtension: nil) else { continue }
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            // Le nom écrit dans le thème n'est pas toujours celui que porte le fichier.
            let descripteurs = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor] ?? []
            let noms = descripteurs.compactMap { CTFontDescriptorCopyAttribute($0, kCTFontNameAttribute) as? String }
            if let vrai = noms.first(where: { $0.lowercased().contains("regular") }) ?? noms.first { PolicesHumalis.noms[nom] = vrai }
        }
    }
`
    : '';
  const phase = fonds.envois || fonds.arrierePlan;
  const auLancement = [...(fonds.domaine ? ['if let lien = ProcessInfo.processInfo.environment["HUMALIS_ESSAI_LIEN"], let url = URL(string: lien) { Routeur.commun.ouvrirLien(url) }'] : []), ...(fonds.envois ? ['EnvoisGardes.commun.demarrer()'] : []), ...(fonds.arrierePlan ? ['ArrierePlanHumalis.lancerSiEssai()'] : [])];
  const racineScene = `RacineHumalis()${fonds.liens ? `
                .onOpenURL { Routeur.commun.ouvrirLien($0) }
                .handlesExternalEvents(preferring: ["*"], allowing: ["*"])` : ''}${auLancement.length ? `
                .task { ${auLancement.join('; ')} }` : ''}`;
  const aLaPhase = phase
    ? `
        .onChange(of: phase) { _, nouvelle in${fonds.envois ? `
            if nouvelle == .active { Task { await EnvoisGardes.commun.envoyer() } }` : ''}${fonds.arrierePlan ? `
            if nouvelle == .background { ArrierePlanHumalis.planifier() }` : ''}
        }`
    : '';
  const tacheFond = fonds.arrierePlan
    ? `
        #if os(iOS)
        .backgroundTask(.appRefresh(ArrierePlanHumalis.identifiant)) {
            await tacheArrierePlanHumalis()
            ArrierePlanHumalis.planifier()
        }
        #endif`
    : '';
  return `// Produit par Humalis : l'application.
import SwiftUI${polices.length ? '\nimport CoreText' : ''}

@main
struct ${nom}App: App {${notifications ? `
    #if os(macOS)
    @NSApplicationDelegateAdaptor(DelegueNotifications.self) private var delegue
    #else
    @UIApplicationDelegateAdaptor(DelegueNotifications.self) private var delegue
    #endif
` : ''}${phase ? `    @Environment(\\.scenePhase) private var phase\n` : ''}${inscrire}
    var body: some Scene {
        WindowGroup {
            ${racineScene}
        }${fonds.liens ? `
        .handlesExternalEvents(matching: ["*"])` : ''}${aLaPhase}${tacheFond}
        #if os(macOS)
        .windowResizability(.contentMinSize)
        .defaultSize(width: ${fonds.dessin ? Math.floor(fonds.dessin.largeur * 0.82) : 1000}, height: ${fonds.dessin ? Math.floor(fonds.dessin.hauteur * 0.82) : 720})
        #endif${commandes}${fonds.reglages ? `
        #if os(macOS)
        Settings {
            ${fonds.reglages}.vue.frame(minWidth: 480, minHeight: 360)
        }
        #endif` : ''}
    }
}

/** La pile des pages, l'en-tête et le pied communs, les messages et les questions. */
struct RacineHumalis: View {
${entete || pied || menu ? largeur : ''}${fonds.dessin?.barre ? `    #if os(iOS)
    @Environment(\\.horizontalSizeClass) private var classeDessin
    @Environment(\\.colorScheme) private var themeDessin
    /** La barre dessinée, variante par variante : cachée par le CSS, elle laisse la navigation native. */
    private let barreVisible: [Bool] = [${(fonds.dessin.barreVisible ?? [true]).join(', ')}]
    #endif
` : ''}${pile}${ongletsVue}
    var body: some View {
${fonds.dessin?.barre ? `        Group {
            #if os(macOS)
            CoquilleDessineeHumalis(largeur: ${fonds.dessin.largeur}, hauteur: ${fonds.dessin.hauteur}, sansBarre: Routeur.commun.chemin.last?.sansRetour == true) { BarreSite() } contenu: { pile }
            #else
            // Sur iPad en grand, la barre dessinée comme sur le site ; sur iPhone, la navigation native.
            GeometryReader { g in
                if classeDessin == .regular && barreVisible[min(barreVisible.count - 1, VarianteDessinHumalis.indexPour(g.size.width, themeDessin == .dark))] {
                    CoquilleDessineeHumalis(largeur: ${fonds.dessin.largeur}, hauteur: ${fonds.dessin.hauteur}, sansBarre: Routeur.commun.chemin.last?.sansRetour == true) { BarreSite() } contenu: { pile }
                } else {
    ${contenu.replace(/\n/g, '\n    ')}
                }
            }
            #endif
        }` : contenu}
        .overlay(alignment: .top) { PileMessagesHumalis(${entete ? (menu && !disposition.enteteAvecAutreChose ? 'decalage: large ? 0 : 56' : 'decalage: 56') : ''}) }
        .modifier(QuestionHumalis())
        .preferredColorScheme(Apparence.commun.schema)${policeTexte ? `
        .font(.custom(PolicesHumalis.vrai(${chaineSwift(policeTexte)}), size: 17, relativeTo: .body))` : ''}
        #if os(macOS)
        .frame(minWidth: ${fonds.dessin ? 720 : 480}, minHeight: ${fonds.dessin ? 450 : 400})
        #endif
    }
}
`;
}

function entreesDuMenu(menu: Extract<NoeudVue, { type: 'bloc' }>, app: ContexteApple, valeurs: Valeurs): EntreeMenu[] {
  const entrees: EntreeMenu[] = [];
  for (const n of menu.corps) {
    if (n.type !== 'element' || n.genre !== 'lien' || n.cible === undefined) continue;
    const info = app.pages.get(n.cible);
    if (!info || info.parametres.length > 0) continue;
    entrees.push({
      titre: valeurs.enTexte(n.contenu),
      ...(n.reglages?.icone ? { icone: nomIcone(n.reglages.icone) } : {}),
      route: `.${nomRoute(n.cible)}${info.filtres.length ? '()' : ''}`,
    });
  }
  return entrees;
}

function configurationSwift(application: Application, options: OptionsApple): string {
  const mode = application.theme?.mode ?? 'automatique';
  const adresse = (application.site?.adresse ?? '').replace(/\/+$/, '');
  return `// Produit par Humalis : ce que la compilation a décidé.
import Foundation

enum Configuration {
    /** L'adresse du serveur que l'application appelle (--serveur). */
    static let serveur = ${chaineSwift(options.serveur ?? application.sources.find((s) => s.session)?.adresse ?? 'http://localhost:3000')}
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

Ouvrez ensuite l'archive dans Xcode (Window > Organizer) pour l'envoyer sur TestFlight. Apple demande une version récente d'Xcode pour accepter un envoi.

Le fichier \`Info.plist\` déclare que l'application ne chiffre qu'avec ce que fournit le système (HTTPS, Keychain). Si vous ajoutez votre propre chiffrement en Swift, changez cette déclaration. Avec une adresse \`http://localhost\`, il permet aussi le réseau local : compilez avec \`--serveur https://…\` pour publier.
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
  const feuilles = application.fichiersStyle.flatMap((f) => (options.fichiersStyle?.has(f.chemin) ? [{ css: options.fichiersStyle.get(f.chemin)!, ...(f.plateforme === 'ios' || f.plateforme === 'macos' ? { os: f.plateforme } : {}) }] : []));
  const css = new CssApple([...application.css.map((c) => ({ css: c })), ...feuilles]);
  if (css.total > 0) {
    avertir(application.fichiersStyle[0]?.ligne ?? 1, `CSS : ${css.traduites} déclarations sur ${css.total} traduites en SwiftUI (${Math.round((css.traduites * 100) / css.total)} %). Le reste est listé, avec sa raison, dans CSS-SUR-APPLE.md.`);
  }
  const dessinPrincipal = application.ecrans.find((e) => e.dessin)?.dessin;
  const cssExact = dessinPrincipal
    ? new CssExact([...application.css.map((c) => ({ css: c })), ...feuilles], new Set((application.theme?.polices ?? []).map((p) => p.nom)))
    : undefined;
  const app: ContexteApple = {
    css,
    ...(cssExact ? { cssExact } : {}),
    ...(application.iconesDessinees?.length ? { iconesDessinees: new Set(application.iconesDessinees.map((i) => i.nom)) } : {}),
    types,
    partages: application.partages,
    fonctions,
    ...(application.langues ? { langues: application.langues } : {}),
    pages,
    cle,
    composants: new Map(application.composants.map((c) => [c.nom, c.parametres])),
    natifs: new Set(application.composantsReact.filter((c) => c.apple !== undefined).map((c) => c.nom)),
    typesNatifs: typesDesNatifs(options.natifs),
    ressource(chemin) {
      const fichier = chemin.replace(/[^A-Za-z0-9._-]/g, '_');
      ressources.set(chemin, fichier);
      return fichier;
    },
    refuser,
    avertir,
    session: false,
    ...(application.theme?.polices.find((p) => p.role === 'titres') ? { policeTitres: application.theme.polices.find((p) => p.role === 'titres')!.nom } : {}),
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

  const simple = (e: Ecran) => !e.parametresAdresse?.length && e.parent === undefined;
  const entree = application.ecrans.find((e) => e.nom === 'accueil' && simple(e)) ?? application.ecrans.find((e) => simple(e) && e.nom !== 'introuvable') ?? application.ecrans.find(simple) ?? application.ecrans[0];
  app.pageEntree = entree.nom;

  const fichiers = new Map<string, string>();
  if (css.total > 0) fichiers.set('CSS-SUR-APPLE.md', css.rapport());
  const dossier = nom;
  const policeDuTheme = application.theme?.polices.find((p) => p.role === 'texte')?.nom;
  const ecrire = (chemin: string, contenu: string) =>
    fichiers.set(`${dossier}/${chemin}`, policeDuTheme && chemin.endsWith('.swift') && !chemin.startsWith('Natif/') ? avecPoliceDuTheme(contenu, policeDuTheme) : contenu);

  for (const c of application.composants) ecrire(`Composants/${nomComposant(c.nom)}.swift`, new GenerateurPage(c, app, c.parametres).generer());
  const disposition: Disposition = {};
  for (const [genre, composant, d] of [['entete', 'EnteteSite', application.disposition?.entete], ['pied', 'PiedSite', application.disposition?.pied]] as const) {
    if (!d) continue;
    const menu = genre === 'entete' ? premierMenu(d.ecran.vue) : undefined;
    ecrire(`Composants/${composant}.swift`, new GenerateurPage({ ...d.ecran, nom: composant }, app, [], composant, menu !== undefined).generer());
    const sans = application.ecrans.filter((e) => (genre === 'entete' ? e.sansEntete : e.sansPied)).map((e) => nomRoute(e.nom));
    const cssCommun = app.css.modificateurs([`humalis-${genre}`, ...d.classes], 'bloc');
    if (genre === 'pied') disposition.pied = { nom: composant, sans, colle: d.options.some((o) => o.nom === 'colle'), css: cssCommun };
    else disposition.entete = { nom: composant, sans, css: cssCommun, haut: (JSON.stringify(d.ecran.vue).match(/"type":"element"/g)?.length ?? 0) > 5 };
    if (menu) {
      disposition.menu = entreesDuMenu(menu, app, valeurs);
      disposition.enteteAvecAutreChose = montreAutreChose(d.ecran.vue, menu);
    }
  }
  // « barre laterale » : une racine qui porte ses styles, écrite comme une page, à l'échelle de la fenêtre.
  const barre = application.disposition?.barre;
  let barreVisible: boolean[] | undefined;
  if (barre && !dessinPrincipal) {
    avertir(barre.ecran.ligne, "« barre laterale : » n'est dessinée sur Mac et sur iPad qu'avec des pages « dessinee pour … » : sans elles, l'application garde sa barre latérale native, tirée des onglets ou du menu.");
  }
  if (barre && dessinPrincipal) {
    const racine: NoeudVue = { type: 'bloc', genre: 'bloc', options: barre.options, classes: ['humalis-barre-laterale', ...barre.classes], corps: barre.ecran.vue, ligne: barre.ecran.ligne };
    ecrire('Composants/BarreSite.swift', new GenerateurPage({ ...barre.ecran, nom: 'BarreSite', vue: [racine], dessin: dessinPrincipal }, app, [], 'BarreSite').generer());
    // Sur iPad, la barre se dessine dans les variantes où le CSS la montre.
    barreVisible = cssExact!.variantes('ios', dessinPrincipal).map((v) => !cssExact!.resoudre([racine], { largeur: v.largeur, hauteur: dessinPrincipal.hauteur }, [], 'ios', v.sombre).de(racine)?.masque);
  }
  for (const ecran of application.ecrans) ecrire(`Pages/${nomPage(ecran.nom)}.swift`, new GenerateurPage(ecran, app).generer());
  // Les styles ne sont connus qu'une fois toutes les pages écrites.
  if (cssExact || application.iconesDessinees?.length) {
    ecrire('Humalis/Dessin.swift', DESSIN_SWIFT + tablesDessin(application.iconesDessinees ?? [], cssExact?.iconesDeMasque ?? [], (cssExact ?? new CssExact([], new Set())).swift()));
  }
  if (application.fonctions.length > 0) ecrire('Humalis/Fonctions.swift', fonctionsSwift(application, app, portee));
  const identifiantApp = options.identifiant ?? `local.humalis.${simplifier(options.nom).replace(/_/g, '-') || 'application'}`;
  for (const c of application.composants) {
    if (c.gestionnaires.some((g) => g.declencheur === 'arrierePlan')) refuser(c.ligne, '« en arriere plan : » s\'écrit dans une page, pas dans un composant.');
  }
  const avecEnvois = /\b(appelOuGarder|appelReussiOuGarder)\(/.test([...fichiers.values()].join('\n'));
  const avecArrierePlan = application.ecrans.some((x) => x.gestionnaires.some((g) => g.declencheur === 'arrierePlan'));
  const identifiantFond = `${identifiantApp}.arriere-plan`;
  const commandesEcrites = commandesSwift(application, app, portee);
  if (commandesEcrites.menus.length > 0) ecrire('Humalis/Commandes.swift', commandesEcrites.code);
  const ongletsSwift = application.ongletsApplication?.map((o) => {
    if (!app.pages.has(o.page) || app.pages.get(o.page)!.parametres.length > 0) refuser(o.ligne, `l'onglet « ${o.titre} » vise la page « ${o.page} », qui n'existe pas ou attend un paramètre.`);
    return { titre: o.titre, route: `Route${routeSimple(o.page, app)}`, icone: o.icone ? nomIcone(o.icone) : 'circle' };
  });
  const pageReglages = application.ecrans.find((x) => x.reglages);
  if (pageReglages && (app.pages.get(pageReglages.nom)?.parametres.length ?? 0) > 0) refuser(pageReglages.ligne, `« page "${pageReglages.nom}" en reglages » : une page de réglages n'attend pas de paramètre.`);
  if (avecArrierePlan) ecrire('Humalis/ArrierePlan.swift', arrierePlanSwift(application, app, portee, identifiantFond, avecEnvois));
  if (avecEnvois) ecrire('Humalis/Envois.swift', ENVOIS_SWIFT);

  if (!simple(entree)) refuser(entree.ligne, `la page d'entrée « ${entree.nom} » attend un paramètre`);
  const cheminsPages = cheminsDesPages(application);
  ecrire('Humalis/Routes.swift', routesSwift(application, app, entree, cheminsPages));
  const notifications = JSON.stringify([application.ecrans, application.composants]).includes('"type":"activationNotifications"');
  if (notifications && !options.equipe) avertir(1, "« activer notifications » : sans --equipe, l'application demande la permission mais ne peut pas recevoir de notification d'Apple. Compilez avec --equipe pour qu'elle les reçoive.");
  const policesCopiees = (application.theme?.polices ?? []).flatMap((p) => (p.fichier && /\.(ttf|otf|woff2?)$/i.test(p.fichier) && options.polices?.has(p.fichier) ? [{ fichier: p.fichier, nom: p.nom }] : []));
  ecrire(`${nom}App.swift`, applicationSwift(nom, application.site?.nom ?? options.nom, entree, disposition, policesCopiees.map((p) => ({ fichier: nomFichierPlat(p.fichier), nom: p.nom })), application.theme?.polices.find((p) => p.role === 'texte')?.nom, notifications, { ...(dessinPrincipal ? { dessin: { ...dessinPrincipal, barre: application.disposition?.barre !== undefined, ...(barreVisible ? { barreVisible } : {}) } } : {}), barreLaterale: application.barreLaterale, liens: application.liensProfonds !== undefined, domaine: application.liensProfonds?.domaine !== undefined, envois: avecEnvois, arrierePlan: avecArrierePlan, ...(ongletsSwift ? { onglets: ongletsSwift } : {}), ...(commandesEcrites.menus.length ? { menus: commandesEcrites.menus } : {}), ...(pageReglages ? { reglages: `Route${routeSimple(pageReglages.nom, app)}` } : {}) }));
  if (disposition.menu?.length) ecrire('Humalis/Menu.swift', menuSwift(disposition.menu));
  for (const p of policesCopiees) ecrire(`Ressources/${nomFichierPlat(p.fichier)}`, contenuBinaire(options.polices!.get(p.fichier)!));
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
  // Une vue Swift écrite à la main peut aussi appeler la connexion Apple ou Google.
  const codeAvecNatifs = [pagesCode, ...[...(options.natifs ?? [])].map(([, natif]) => natif.contenu)].join('\n');
  if (/\bseConnecterAvec(Apple|Google)\(/.test(codeAvecNatifs)) ecrire('Humalis/Connexions.swift', CONNEXIONS_SWIFT);
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
    if (!fichier || info.contenu === undefined) continue;
    // Un SVG passe par le catalogue d'images : c'est là que le système sait le dessiner.
    if (/\.svg$/i.test(fichier)) {
      const nomAsset = fichier.replace(/\.svg$/i, '');
      ecrire(`Assets.xcassets/${nomAsset}.imageset/${fichier}`, contenuBinaire(info.contenu));
      ecrire(`Assets.xcassets/${nomAsset}.imageset/Contents.json`, `${JSON.stringify({ images: [{ filename: fichier, idiom: 'universal' }], info: { author: 'xcode', version: 1 }, properties: { 'preserves-vector-representation': true } }, null, 2)}\n`);
    } else ecrire(`Ressources/${fichier}`, contenuBinaire(info.contenu));
  }

  const logo = application.site?.logo;
  const octetsLogo = logo && /\.png$/i.test(logo) ? options.images?.get(logo) : undefined;
  for (const [chemin, contenu] of assets(octetsLogo !== undefined, marqueDe(application.theme))) ecrire(chemin, contenu);
  if (octetsLogo !== undefined) ecrire('Assets.xcassets/AppIcon.appiconset/icone.png', contenuBinaire(octetsLogo));
  const avecFichiers = /\b(ChoixFichierHumalis|prendrePhoto)\b/.test(tout);
  const avecPosition = /\blirePosition\(/.test(tout);
  // Sans équipe, l'application ne peut pas être signée avec ce droit : elle ne se construirait plus.
  const domaineLiens = options.equipe ? application.liensProfonds?.domaine : undefined;
  const avecConnexionApple = /\bseConnecterAvecApple\(/.test(codeAvecNatifs);
  if (avecConnexionApple && !options.equipe) avertir(1, "« se connecter avec apple » : sans --equipe, la fenêtre d'Apple ne peut pas s'ouvrir, et l'application le dit à la personne. Compilez avec --equipe.");
  const droitConnexionApple = avecConnexionApple && options.equipe !== undefined;
  ecrire(`${nom}.entitlements`, droits(avecFichiers, notifications && options.equipe ? 'ios' : undefined, avecPosition, domaineLiens, droitConnexionApple));
  if (notifications && options.equipe) ecrire(`${nom}-mac.entitlements`, droits(avecFichiers, 'mac', avecPosition, domaineLiens, droitConnexionApple));
  if (application.liensProfonds?.domaine && !options.equipe) avertir(application.liensProfonds.ligne, `« domaine "${application.liensProfonds.domaine}" » : sans --equipe, les liens https:// ouvrent le site et pas l'application. Compilez avec --equipe.`);
  if (domaineLiens) {
    fichiers.set('a-publier-sur-le-site/.well-known/apple-app-site-association', associationSite(options.equipe!, identifiantApp, domaineLiens));
    avertir(application.liensProfonds!.ligne, `« domaine "${domaineLiens}" » : publiez a-publier-sur-le-site/.well-known/apple-app-site-association sur ${domaineLiens.split('/')[0]} pour que les liens https:// ouvrent l'application.`);
  }
  if (notifications) ecrire('Humalis/Notifications.swift', NOTIFICATIONS_SWIFT);
  ecrire('PrivacyInfo.xcprivacy', CONFIDENTIALITE);

  const nomAffiche = application.site?.nom ?? options.nom;
  // Le système refuse http:// : seul le réseau local reste permis, pour essayer.
  const adresses = [...(reseau || application.sources.length > 0 ? [options.serveur ?? application.sources.find((x) => x.session)?.adresse ?? 'http://localhost:3000'] : []), ...application.sources.map((x) => x.adresse)];
  const serveurLocal = adresses.some((a) => /^http:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(a));
  for (const adresse of new Set(adresses)) {
    if (/^http:\/\//i.test(adresse) && !/^http:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(adresse)) avertir(1, `l'application Apple ne peut pas appeler « ${adresse} » : le système bloque http://. Utilisez https://.`);
  }
  fichiers.set('Info.plist', infoSupplementaire(serveurLocal, { camera: /\b(prendrePhoto|scannerCode)\(/.test(tout), identite: /\bverifierIdentite\(/.test(tout), position: avecPosition, ...(application.liensProfonds ? { liens: { schema: application.liensProfonds.schema, identifiant: identifiantApp } } : {}), ...(avecArrierePlan ? { arrierePlan: identifiantFond } : {}) }));
  fichiers.set(
    `${nom}.xcodeproj/project.pbxproj`,
    projetXcode({
      nom,
      nomAffiche,
      identifiant: identifiantApp,
      ...(options.equipe ? { equipe: options.equipe } : {}),
      icone: octetsLogo !== undefined,
      serveurLocal,
      paquets: paquetsDe(application, refuser),
      droitsMac: notifications && options.equipe !== undefined,
      essaisUi: options.essaisUi !== undefined,
      fichiers: avecFichiers,
    }),
  );
  fichiers.set(`${nom}.xcodeproj/xcshareddata/xcschemes/${nom}.xcscheme`, schemaXcode(nom, options.essaisUi !== undefined));
  if (options.essaisUi !== undefined) fichiers.set(`${nom}Essais/Parcours.swift`, options.essaisUi);
  fichiers.set(MARQUE_APPLE, `Projet produit par Humalis depuis ${options.source}.\nLe compilateur réécrit ce dossier à chaque compilation.\n`);
  fichiers.set('LISEZMOI.md', lisezmoi(nom, options));
  return { fichiers, diagnostics };
}

const nomFichierPlat = (chemin: string): string => chemin.replace(/^(\.\/)+/, '').replace(/[^A-Za-z0-9._-]/g, '_');

/** Les paquets Swift, avec leur nom de produit : celui du dépôt, sauf s'il est écrit. */
function paquetsDe(application: Application, refuser: (ligne: number, message: string) => void): PaquetSwift[] {
  return (application.paquetsSwift ?? []).flatMap((p) => {
    if (!/^https:\/\/\S+$/.test(p.adresse)) {
      refuser(p.ligne, `l'adresse du paquet « ${p.adresse} » doit commencer par https://`);
      return [];
    }
    if (!/^\d+(\.\d+){0,2}$/.test(p.version)) {
      refuser(p.ligne, `la version « ${p.version} » du paquet doit s'écrire avec des chiffres, comme "1.2" ou "1.2.3"`);
      return [];
    }
    const parties = p.version.split('.');
    while (parties.length < 3) parties.push('0');
    return [{ adresse: p.adresse, version: parties.join('.'), produit: p.produit ?? p.adresse.replace(/\/$/, '').split('/').pop()!.replace(/\.git$/, '') }];
  });
}

function marqueDe(theme: ThemeRI | undefined): { clair: string; sombre: string } | undefined {
  const marque = theme?.couleurs.find((c) => c.nom === 'marque');
  return marque ? { clair: marque.clair, sombre: marque.sombre } : undefined;
}

/** Les paramètres d'une vue Swift écrite à la main : « var valeur: Double = 0 » donne valeur → nombre. */
export function typesDesNatifs(natifs?: Map<string, { nom: string; contenu: string }>): Map<string, Map<string, TypeValeur>> {
  const sortie = new Map<string, Map<string, TypeValeur>>();
  const genres: Record<string, TypeValeur['genre']> = { Double: 'nombre', Int: 'nombre', CGFloat: 'nombre', Float: 'nombre', String: 'texte', Bool: 'booleen' };
  for (const [nom, { contenu }] of natifs ?? []) {
    const vue = new RegExp(`struct\\s+${nom}\\s*:[^{]*\\{([\\s\\S]*?)(?:var\\s+body\\b|$)`).exec(contenu);
    if (!vue) continue;
    const params = new Map<string, TypeValeur>();
    for (const m of vue[1]!.matchAll(/^\s*(?:var|let)\s+(\w+)\s*:\s*(\w+)\s*(?:=|$)/gm)) {
      const genre = genres[m[2]!];
      if (genre) params.set(m[1]!, { genre } as TypeValeur);
    }
    sortie.set(nom, params);
  }
  return sortie;
}
