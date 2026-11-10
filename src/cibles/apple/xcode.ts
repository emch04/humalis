/**
 * Le projet Xcode produit : une seule application native pour iPhone, iPad et
 * Mac. Le fichier du projet est écrit directement, pour ne dépendre que
 * d'Xcode ; le dossier de sources est « synchronisé » : Xcode y prend tous les
 * fichiers, le projet n'a donc pas à les citer.
 */

export interface PaquetSwift {
  adresse: string;
  version: string;
  produit: string;
}

export interface OptionsXcode {
  /** L'identifiant Swift de l'application (« Boutique ») : la cible et le dossier. */
  nom: string;
  /** Le nom montré sous l'icône. */
  nomAffiche: string;
  /** L'identifiant du paquet (« dev.exemple.boutique »). */
  identifiant: string;
  /** L'équipe Apple Developer, pour signer. */
  equipe?: string;
  /** Les clés Info.plist propres au programme (phrases de permission…). */
  infos?: Record<string, string>;
  /** Vrai si une adresse http:// de cet ordinateur doit passer, pour essayer contre un serveur local. */
  serveurLocal?: boolean;
  /** Le Mac peut lire les fichiers que la personne choisit. */
  fichiers?: boolean;
  /** Les bibliothèques Swift du programme. */
  paquets?: PaquetSwift[];
  /** Le Mac a son propre fichier de droits (les notifications s'y déclarent autrement). */
  droitsMac?: boolean;
  /** Vrai s'il y a une icône dans les assets. */
  icone?: boolean;
  /** Ajoute une cible de tests XCUITest (pour l'essai de bout en bout). */
  essaisUi?: boolean;
  /** Les cibles des formes d'application (widget, partage, clavier, montre, télé, App Clip). */
  cibles?: CibleXcode[];
  /** Le simulateur iPhone a son propre fichier de droits (CarPlay, qu'Apple accorde sur demande). */
  droitsSimulateur?: boolean;
}

/**
 * Une cible de plus dans le projet : une extension (widget, partage, clavier), l'application de la montre,
 * celle de la télévision, ou l'App Clip. Les cibles qui montrent des pages reprennent le dossier de
 * l'application (`partageDossier`) : les pages et la bibliothèque Humalis y sont écrites une seule fois.
 */
export interface CibleXcode {
  /** Le nom de la cible, du produit et de son dossier (« BoutiqueWidgets »). */
  nom: string;
  genre: 'extension' | 'montre' | 'tele' | 'clip';
  /** Les plateformes : iPhone et Mac, iPhone seul, la montre, la télévision. */
  plateformes: 'apple' | 'ios' | 'macos' | 'watchos' | 'tvos';
  identifiant: string;
  nomAffiche: string;
  /** Vrai si la cible compile aussi le dossier de l'application. */
  partageDossier: boolean;
  /** Le fichier Info propre à la cible, à la racine du projet. */
  info: string;
  /** Le fichier des droits, dans le dossier de la cible. */
  droits?: string;
  /** Les conditions de compilation (`#if HUMALIS_WIDGETS`). */
  conditions: string[];
}

/** Les versions minimales : celles de `@Observable` (et de Muzika). */
export const VERSION_IOS = '17.0';
export const VERSION_MACOS = '14.0';

const ID = {
  projet: '1A0000000000000000000001',
  cible: '1A0000000000000000000002',
  racine: '1A0000000000000000000003',
  produits: '1A0000000000000000000004',
  application: '1A0000000000000000000005',
  sources: '1A0000000000000000000006',
  phaseSources: '1A0000000000000000000007',
  phaseFrameworks: '1A0000000000000000000008',
  phaseRessources: '1A0000000000000000000009',
  configsProjet: '1A000000000000000000000A',
  configsCible: '1A000000000000000000000B',
  debugProjet: '1A000000000000000000000C',
  releaseProjet: '1A000000000000000000000D',
  debugCible: '1A000000000000000000000E',
  releaseCible: '1A000000000000000000000F',
  essais: '1A0000000000000000000010',
  essaisSources: '1A0000000000000000000011',
  essaisProduit: '1A0000000000000000000012',
  essaisPhaseSources: '1A0000000000000000000013',
  essaisPhaseFrameworks: '1A0000000000000000000014',
  essaisPhaseRessources: '1A0000000000000000000015',
  essaisConfigs: '1A0000000000000000000016',
  essaisDebug: '1A0000000000000000000017',
  essaisRelease: '1A0000000000000000000018',
  proxy: '1A0000000000000000000019',
  dependance: '1A000000000000000000001A',
};

/** Une valeur du fichier du projet, entre guillemets si elle en a besoin. */
const pb = (valeur: string): string => (/^[A-Za-z0-9_./]+$/.test(valeur) ? valeur : `"${valeur.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);

function reglagesCible(o: OptionsXcode, debug: boolean): string[] {
  const infos = Object.entries(o.infos ?? {}).map(([cle, valeur]) => `INFOPLIST_KEY_${cle} = ${pb(valeur)};`);
  return [
    ...(o.icone ? ['ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;'] : []),
    'ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;',
    `CODE_SIGN_ENTITLEMENTS = ${pb(`${o.nom}/${o.nom}.entitlements`)};`,
    ...(o.droitsMac ? [`"CODE_SIGN_ENTITLEMENTS[sdk=macosx*]" = ${pb(`${o.nom}/${o.nom}-mac.entitlements`)};`] : []),
    ...(o.droitsSimulateur ? [`"CODE_SIGN_ENTITLEMENTS[sdk=iphonesimulator*]" = ${pb(`${o.nom}/${o.nom}-simulateur.entitlements`)};`] : []),
    // Sans équipe : signé pour cet ordinateur et le simulateur seulement.
    ...(o.equipe ? ['CODE_SIGN_STYLE = Automatic;', `DEVELOPMENT_TEAM = ${pb(o.equipe)};`] : ['CODE_SIGN_IDENTITY = "-";', 'CODE_SIGN_STYLE = Manual;', 'DEVELOPMENT_TEAM = "";']),
    'CURRENT_PROJECT_VERSION = 1;',
    'ENABLE_HARDENED_RUNTIME = YES;',
    'ENABLE_PREVIEWS = YES;',
    'GENERATE_INFOPLIST_FILE = YES;',
    'INFOPLIST_FILE = Info.plist;',
    `INFOPLIST_KEY_CFBundleDisplayName = ${pb(o.nomAffiche)};`,
    'INFOPLIST_KEY_LSApplicationCategoryType = "public.app-category.utilities";',
    '"INFOPLIST_KEY_UIApplicationSceneManifest_Generation[sdk=iphoneos*]" = YES;',
    '"INFOPLIST_KEY_UIApplicationSceneManifest_Generation[sdk=iphonesimulator*]" = YES;',
    '"INFOPLIST_KEY_UILaunchScreen_Generation[sdk=iphoneos*]" = YES;',
    '"INFOPLIST_KEY_UILaunchScreen_Generation[sdk=iphonesimulator*]" = YES;',
    'INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad = "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";',
    'INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone = "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";',
    ...infos,
    'LD_RUNPATH_SEARCH_PATHS = "@executable_path/Frameworks";',
    '"LD_RUNPATH_SEARCH_PATHS[sdk=macosx*]" = "@executable_path/../Frameworks";',
    'MARKETING_VERSION = 1.0;',
    `PRODUCT_BUNDLE_IDENTIFIER = ${pb(o.identifiant)};`,
    'PRODUCT_NAME = "$(TARGET_NAME)";',
    'SDKROOT = auto;',
    'SUPPORTED_PLATFORMS = "iphoneos iphonesimulator macosx";',
    'SUPPORTS_MACCATALYST = NO;',
    'SWIFT_EMIT_LOC_STRINGS = YES;',
    'SWIFT_VERSION = 6.0;',
    'TARGETED_DEVICE_FAMILY = "1,2";',
    ...(debug ? [] : ['VALIDATE_PRODUCT = YES;']),
  ].sort();
}

function reglagesProjet(debug: boolean): string[] {
  return [
    'ALWAYS_SEARCH_USER_PATHS = NO;',
    'CLANG_ENABLE_MODULES = YES;',
    'CLANG_ENABLE_OBJC_ARC = YES;',
    'COPY_PHASE_STRIP = NO;',
    `DEBUG_INFORMATION_FORMAT = ${debug ? 'dwarf' : '"dwarf-with-dsym"'};`,
    'ENABLE_STRICT_OBJC_MSGSEND = YES;',
    'ENABLE_USER_SCRIPT_SANDBOXING = YES;',
    `GCC_OPTIMIZATION_LEVEL = ${debug ? '0' : 's'};`,
    `IPHONEOS_DEPLOYMENT_TARGET = ${VERSION_IOS};`,
    `MACOSX_DEPLOYMENT_TARGET = ${VERSION_MACOS};`,
    ...(debug ? ['ENABLE_TESTABILITY = YES;', 'ONLY_ACTIVE_ARCH = YES;', 'SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;', 'SWIFT_OPTIMIZATION_LEVEL = "-Onone";'] : ['ENABLE_NS_ASSERTIONS = NO;', 'SWIFT_COMPILATION_MODE = wholemodule;']),
  ].sort();
}

const config = (id: string, nom: 'Debug' | 'Release', reglages: string[]): string => `\t\t${id} /* ${nom} */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
${reglages.map((r) => `\t\t\t\t${r}`).join('\n')}
\t\t\t};
\t\t\tname = ${nom};
\t\t};`;

/** Le fichier `project.pbxproj`. */
export function projetXcode(o: OptionsXcode): string {
  const produit = `${o.nom}.app`;
  let texte = avecPaquets(projetDeBase(o, produit), o.paquets ?? []);
  if (o.cibles?.length) texte = avecCibles(texte, o, o.cibles);
  return o.essaisUi ? avecEssaisUi(texte, o) : texte;
}

const PLATEFORMES: Record<CibleXcode['plateformes'], string[]> = {
  apple: ['SDKROOT = auto;', 'SUPPORTED_PLATFORMS = "iphoneos iphonesimulator macosx";', 'TARGETED_DEVICE_FAMILY = "1,2";'],
  ios: ['SDKROOT = iphoneos;', 'SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";', 'TARGETED_DEVICE_FAMILY = "1,2";'],
  macos: ['SDKROOT = macosx;', 'SUPPORTED_PLATFORMS = macosx;'],
  watchos: ['SDKROOT = watchos;', 'SUPPORTED_PLATFORMS = "watchos watchsimulator";', 'TARGETED_DEVICE_FAMILY = 4;', 'WATCHOS_DEPLOYMENT_TARGET = 10.0;'],
  tvos: ['SDKROOT = appletvos;', 'SUPPORTED_PLATFORMS = "appletvos appletvsimulator";', 'TARGETED_DEVICE_FAMILY = 3;', 'TVOS_DEPLOYMENT_TARGET = 17.0;'],
};

/** Le type de produit d'une cible, et l'extension de son paquet. */
const PRODUITS: Record<CibleXcode['genre'], { type: string; fichier: string; extension: string }> = {
  extension: { type: 'com.apple.product-type.app-extension', fichier: 'wrapper.app-extension', extension: 'appex' },
  montre: { type: 'com.apple.product-type.application', fichier: 'wrapper.application', extension: 'app' },
  tele: { type: 'com.apple.product-type.application', fichier: 'wrapper.application', extension: 'app' },
  clip: { type: 'com.apple.product-type.application.on-demand-install-capable', fichier: 'wrapper.application', extension: 'app' },
};

/** Où l'application range chaque cible : les extensions dans PlugIns, la montre dans Watch, l'App Clip dans AppClips. */
const INCORPORATIONS = [
  { genres: ['extension'], nom: 'Embed Foundation Extensions', chemin: '""', dossier: 13 },
  { genres: ['montre'], nom: 'Embed Watch Content', chemin: '"$(CONTENTS_FOLDER_PATH)/Watch"', dossier: 16 },
  { genres: ['clip'], nom: 'Embed App Clips', chemin: '"$(CONTENTS_FOLDER_PATH)/AppClips"', dossier: 16 },
] as const;

/** L'identifiant d'un objet d'une cible de plus : unique par cible et par rôle. */
export const idCible = (rang: number, role: number): string => `1C${rang.toString(16).toUpperCase().padStart(2, '0')}${role.toString(16).toUpperCase().padStart(20, '0')}`;

function reglagesCibleSecondaire(o: OptionsXcode, c: CibleXcode, debug: boolean): string[] {
  return [
    ...PLATEFORMES[c.plateformes],
    ...(c.droits ? [`CODE_SIGN_ENTITLEMENTS = ${pb(`${c.nom}/${c.droits}`)};`] : []),
    ...(o.equipe ? ['CODE_SIGN_STYLE = Automatic;', `DEVELOPMENT_TEAM = ${pb(o.equipe)};`] : ['CODE_SIGN_IDENTITY = "-";', 'CODE_SIGN_STYLE = Manual;', 'DEVELOPMENT_TEAM = "";']),
    'CURRENT_PROJECT_VERSION = 1;',
    'ENABLE_HARDENED_RUNTIME = YES;',
    'GENERATE_INFOPLIST_FILE = YES;',
    `INFOPLIST_FILE = ${pb(c.info)};`,
    `INFOPLIST_KEY_CFBundleDisplayName = ${pb(c.nomAffiche)};`,
    ...(c.genre === 'extension' ? ['APPLICATION_EXTENSION_API_ONLY = YES;', 'SKIP_INSTALL = YES;', 'LD_RUNPATH_SEARCH_PATHS = "@executable_path/Frameworks @executable_path/../../Frameworks";', '"LD_RUNPATH_SEARCH_PATHS[sdk=macosx*]" = "@executable_path/../Frameworks @executable_path/../../../../Frameworks";'] : ['LD_RUNPATH_SEARCH_PATHS = "@executable_path/Frameworks";']),
    ...(c.genre === 'montre' ? ['SKIP_INSTALL = YES;', `INFOPLIST_KEY_WKCompanionAppBundleIdentifier = ${pb(o.identifiant)};`, 'INFOPLIST_KEY_WKRunsIndependentlyOfCompanionApp = NO;'] : []),
    ...(c.genre === 'clip' ? ['SKIP_INSTALL = YES;'] : []),
    ...(c.genre !== 'extension' ? ['ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;', 'INFOPLIST_KEY_UILaunchScreen_Generation = YES;', 'INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;'] : []),
    'MARKETING_VERSION = 1.0;',
    `PRODUCT_BUNDLE_IDENTIFIER = ${pb(c.identifiant)};`,
    'PRODUCT_NAME = "$(TARGET_NAME)";',
    `SWIFT_ACTIVE_COMPILATION_CONDITIONS = ${pb(['$(inherited)', ...c.conditions].join(' '))};`,
    'SWIFT_EMIT_LOC_STRINGS = YES;',
    'SWIFT_VERSION = 6.0;',
    ...(debug ? [] : ['VALIDATE_PRODUCT = YES;']),
  ].sort();
}

/** Ajoute au projet les cibles des formes d'application, et les range dans l'application. */
function avecCibles(texte: string, o: OptionsXcode, cibles: CibleXcode[]): string {
  const ajouter = (repere: string, ajout: string) => {
    if (!texte.includes(repere)) throw new Error(`modèle du projet inattendu : ${repere}`);
    texte = texte.replace(repere, ajout + repere);
  };
  const remplacer = (avant: string, apres: string) => {
    if (!texte.includes(avant)) throw new Error(`modèle du projet inattendu : ${avant}`);
    texte = texte.replace(avant, apres);
  };
  const phase = (id: string, genre: string) => `\t\t${id} = {\n\t\t\tisa = ${genre};\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};\n`;
  const filtre = (c: CibleXcode) => (c.plateformes === 'ios' || c.plateformes === 'watchos' ? 'platformFilter = ios; ' : c.plateformes === 'macos' ? 'platformFilter = macos; ' : '');
  // Rôles : 1 produit, 2 dossier, 3-5 phases, 6 cible, 7 réglages, 8-9 Debug et Release, 10 relais, 11 dépendance, 12 copie.
  const fichiers: string[] = [];
  const dossiers: string[] = [];
  const phases: string[] = [];
  const natives: string[] = [];
  const relais: string[] = [];
  const dependances: string[] = [];
  const configs: string[] = [];
  const listes: string[] = [];
  const copies: string[] = [];
  cibles.forEach((c, i) => {
    const id = (role: number) => idCible(i, role);
    const produit = PRODUITS[c.genre];
    fichiers.push(`\t\t${id(1)} /* ${c.nom}.${produit.extension} */ = {isa = PBXFileReference; explicitFileType = ${produit.fichier}; includeInIndex = 0; path = ${pb(`${c.nom}.${produit.extension}`)}; sourceTree = BUILT_PRODUCTS_DIR; };\n`);
    dossiers.push(`\t\t${id(2)} /* ${c.nom} */ = {isa = PBXFileSystemSynchronizedRootGroup; path = ${pb(c.nom)}; sourceTree = "<group>"; };\n`);
    phases.push(phase(id(3), 'PBXSourcesBuildPhase'), phase(id(4), 'PBXFrameworksBuildPhase'), phase(id(5), 'PBXResourcesBuildPhase'));
    const groupes = [...(c.partageDossier ? [`${ID.sources} /* ${o.nom} */`] : []), `${id(2)} /* ${c.nom} */`];
    natives.push(`\t\t${id(6)} /* ${c.nom} */ = {\n\t\t\tisa = PBXNativeTarget;\n\t\t\tbuildConfigurationList = ${id(7)};\n\t\t\tbuildPhases = (\n\t\t\t\t${id(3)},\n\t\t\t\t${id(4)},\n\t\t\t\t${id(5)},\n\t\t\t);\n\t\t\tbuildRules = (\n\t\t\t);\n\t\t\tdependencies = (\n\t\t\t);\n\t\t\tfileSystemSynchronizedGroups = (\n${groupes.map((g) => `\t\t\t\t${g},`).join('\n')}\n\t\t\t);\n\t\t\tname = ${pb(c.nom)};\n\t\t\tproductName = ${pb(c.nom)};\n\t\t\tproductReference = ${id(1)};\n\t\t\tproductType = ${pb(produit.type)};\n\t\t};\n`);
    configs.push(`${config(id(8), 'Debug', reglagesCibleSecondaire(o, c, true))}\n${config(id(9), 'Release', reglagesCibleSecondaire(o, c, false))}\n`);
    listes.push(`\t\t${id(7)} = {\n\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n\t\t\t\t${id(8)},\n\t\t\t\t${id(9)},\n\t\t\t);\n\t\t\tdefaultConfigurationIsVisible = 0;\n\t\t\tdefaultConfigurationName = Release;\n\t\t};\n`);
    // La télévision a sa propre application : elle n'est pas rangée dans celle de l'iPhone.
    if (c.genre === 'tele') return;
    relais.push(`\t\t${id(10)} = {\n\t\t\tisa = PBXContainerItemProxy;\n\t\t\tcontainerPortal = ${ID.projet};\n\t\t\tproxyType = 1;\n\t\t\tremoteGlobalIDString = ${id(6)};\n\t\t\tremoteInfo = ${pb(c.nom)};\n\t\t};\n`);
    dependances.push(`\t\t${id(11)} = {\n\t\t\tisa = PBXTargetDependency;\n\t\t\t${filtre(c).trim() ? `${filtre(c).trim()}\n\t\t\t` : ''}target = ${id(6)};\n\t\t\ttargetProxy = ${id(10)};\n\t\t};\n`);
    copies.push(`\t\t${id(12)} = {isa = PBXBuildFile; fileRef = ${id(1)}; ${filtre(c)}settings = {ATTRIBUTES = (RemoveHeadersOnCopy, ); }; };\n`);
  });
  const avecCopie = cibles.map((c, i) => ({ c, i })).filter(({ c }) => c.genre !== 'tele');
  const phasesCopie = INCORPORATIONS.flatMap((inc, k) => {
    const dedans = avecCopie.filter(({ c }) => (inc.genres as readonly string[]).includes(c.genre));
    if (!dedans.length) return [];
    const id = `1D${String(k).padStart(22, '0')}`;
    return [{ id, texte: `\t\t${id} /* ${inc.nom} */ = {\n\t\t\tisa = PBXCopyFilesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tdstPath = ${inc.chemin};\n\t\t\tdstSubfolderSpec = ${inc.dossier};\n\t\t\tfiles = (\n${dedans.map(({ i }) => `\t\t\t\t${idCible(i, 12)},`).join('\n')}\n\t\t\t);\n\t\t\tname = ${pb(inc.nom)};\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};\n` }];
  });
  if (copies.length) {
    if (texte.includes('/* Begin PBXBuildFile section */')) ajouter('/* End PBXBuildFile section */', copies.join(''));
    else remplacer('/* Begin PBXFileReference section */', `/* Begin PBXBuildFile section */\n${copies.join('')}/* End PBXBuildFile section */\n\n/* Begin PBXFileReference section */`);
    remplacer('/* Begin PBXFileReference section */', `/* Begin PBXContainerItemProxy section */\n${relais.join('')}/* End PBXContainerItemProxy section */\n\n/* Begin PBXCopyFilesBuildPhase section */\n${phasesCopie.map((p) => p.texte).join('')}/* End PBXCopyFilesBuildPhase section */\n\n/* Begin PBXFileReference section */`);
    ajouter('/* Begin XCBuildConfiguration section */', `/* Begin PBXTargetDependency section */\n${dependances.join('')}/* End PBXTargetDependency section */\n\n`);
    // L'application attend ses cibles, puis les range.
    remplacer(`\t\t\t\t${ID.phaseRessources} /* Resources */,\n\t\t\t);\n\t\t\tbuildRules = (\n\t\t\t);\n\t\t\tdependencies = (\n\t\t\t);`, `\t\t\t\t${ID.phaseRessources} /* Resources */,\n${phasesCopie.map((p) => `\t\t\t\t${p.id},`).join('\n')}\n\t\t\t);\n\t\t\tbuildRules = (\n\t\t\t);\n\t\t\tdependencies = (\n${avecCopie.map(({ i }) => `\t\t\t\t${idCible(i, 11)},`).join('\n')}\n\t\t\t);`);
  }
  ajouter('/* End PBXFileReference section */', fichiers.join(''));
  ajouter('/* End PBXFileSystemSynchronizedRootGroup section */', dossiers.join(''));
  ajouter('/* End PBXFrameworksBuildPhase section */', phases.filter((_, k) => k % 3 === 1).join(''));
  ajouter('/* End PBXResourcesBuildPhase section */', phases.filter((_, k) => k % 3 === 2).join(''));
  ajouter('/* End PBXSourcesBuildPhase section */', phases.filter((_, k) => k % 3 === 0).join(''));
  ajouter('/* End PBXNativeTarget section */', natives.join(''));
  ajouter('/* End XCBuildConfiguration section */', configs.join(''));
  ajouter('/* End XCConfigurationList section */', listes.join(''));
  remplacer(`\t\t\t\t${ID.cible} /* ${o.nom} */,\n\t\t\t);\n\t\t};\n/* End PBXProject section */`, `\t\t\t\t${ID.cible} /* ${o.nom} */,\n${cibles.map((c, i) => `\t\t\t\t${idCible(i, 6)} /* ${c.nom} */,`).join('\n')}\n\t\t\t);\n\t\t};\n/* End PBXProject section */`);
  remplacer(`\t\t\t\t${ID.sources} /* ${o.nom} */,\n\t\t\t\t${ID.produits} /* Products */,`, `\t\t\t\t${ID.sources} /* ${o.nom} */,\n${cibles.map((c, i) => `\t\t\t\t${idCible(i, 2)} /* ${c.nom} */,`).join('\n')}\n\t\t\t\t${ID.produits} /* Products */,`);
  remplacer(`\t\t\t\t${ID.application} /* ${o.nom}.app */,\n\t\t\t);\n\t\t\tname = Products;`, `\t\t\t\t${ID.application} /* ${o.nom}.app */,\n${cibles.map((c, i) => `\t\t\t\t${idCible(i, 1)} /* ${c.nom}.${PRODUITS[c.genre].extension} */,`).join('\n')}\n\t\t\t);\n\t\t\tname = Products;`);
  return texte;
}

/** Ajoute au projet les bibliothèques Swift : la référence au dépôt, et le lien avec l'application. */
function avecPaquets(texte: string, paquets: PaquetSwift[]): string {
  if (paquets.length === 0) return texte;
  const id = (genre: string, i: number) => `1B${genre}${String(i).padStart(21, '0')}`;
  const liste = (cle: string) => paquets.map((_, i) => `\t\t\t\t${id(cle, i)},`).join('\n');
  const remplacer = (avant: string, apres: string) => {
    if (!texte.includes(avant)) throw new Error(`modèle du projet inattendu : ${avant}`);
    texte = texte.replace(avant, apres);
  };
  remplacer('/* Begin PBXFileReference section */', `/* Begin PBXBuildFile section */\n${paquets.map((p, i) => `\t\t${id('A', i)} = {isa = PBXBuildFile; productRef = ${id('C', i)}; };`).join('\n')}\n/* End PBXBuildFile section */\n\n/* Begin PBXFileReference section */`);
  remplacer(`${ID.phaseFrameworks} /* Frameworks */ = {\n\t\t\tisa = PBXFrameworksBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n`, `${ID.phaseFrameworks} /* Frameworks */ = {\n\t\t\tisa = PBXFrameworksBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n${liste('A')}\n`);
  remplacer('\t\t\tfileSystemSynchronizedGroups = (', `\t\t\tpackageProductDependencies = (\n${liste('C')}\n\t\t\t);\n\t\t\tfileSystemSynchronizedGroups = (`);
  remplacer('\t\t\tproductRefGroup =', `\t\t\tpackageReferences = (\n${liste('B')}\n\t\t\t);\n\t\t\tproductRefGroup =`);
  remplacer('\t};\n\trootObject', `/* Begin XCRemoteSwiftPackageReference section */\n${paquets.map((p, i) => `\t\t${id('B', i)} = {\n\t\t\tisa = XCRemoteSwiftPackageReference;\n\t\t\trepositoryURL = ${pb(p.adresse)};\n\t\t\trequirement = {\n\t\t\t\tkind = upToNextMajorVersion;\n\t\t\t\tminimumVersion = ${pb(p.version)};\n\t\t\t};\n\t\t};`).join('\n')}\n/* End XCRemoteSwiftPackageReference section */\n\n/* Begin XCSwiftPackageProductDependency section */\n${paquets.map((p, i) => `\t\t${id('C', i)} = {\n\t\t\tisa = XCSwiftPackageProductDependency;\n\t\t\tpackage = ${id('B', i)};\n\t\t\tproductName = ${pb(p.produit)};\n\t\t};`).join('\n')}\n/* End XCSwiftPackageProductDependency section */\n\t};\n\trootObject`);
  return texte;
}

/** Ajoute au projet une cible XCUITest, seulement pour l'essai de bout en bout. */
function avecEssaisUi(texte: string, o: OptionsXcode): string {
  const nom = `${o.nom}Essais`;
  const reglages = (debug: boolean) => [
    'CODE_SIGN_IDENTITY = "-";', 'CODE_SIGN_STYLE = Manual;', 'DEVELOPMENT_TEAM = "";', 'GENERATE_INFOPLIST_FILE = YES;', 'PRODUCT_BUNDLE_IDENTIFIER = local.humalis.essais;',
    'PRODUCT_NAME = "$(TARGET_NAME)";', 'SDKROOT = auto;', 'SUPPORTED_PLATFORMS = "iphoneos iphonesimulator macosx";', 'SWIFT_VERSION = 6.0;', 'TARGETED_DEVICE_FAMILY = "1,2";', `TEST_TARGET_NAME = ${pb(o.nom)};`,
    ...(debug ? [] : ['VALIDATE_PRODUCT = YES;']),
  ].sort();
  const ajouter = (repere: string, ajout: string) => {
    if (!texte.includes(repere)) throw new Error(`modèle du projet inattendu : ${repere}`);
    texte = texte.replace(repere, ajout + repere);
  };
  const phase = (id: string, genre: string) => `\t\t${id} = {\n\t\t\tisa = ${genre};\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};\n`;
  ajouter('/* End PBXFileReference section */', `\t\t${ID.essaisProduit} = {isa = PBXFileReference; explicitFileType = wrapper.cfbundle; includeInIndex = 0; path = ${pb(`${nom}.xctest`)}; sourceTree = BUILT_PRODUCTS_DIR; };\n`);
  ajouter('/* End PBXFileSystemSynchronizedRootGroup section */', `\t\t${ID.essaisSources} = {isa = PBXFileSystemSynchronizedRootGroup; path = ${pb(nom)}; sourceTree = "<group>"; };\n`);
  ajouter('/* End PBXFrameworksBuildPhase section */', phase(ID.essaisPhaseFrameworks, 'PBXFrameworksBuildPhase'));
  ajouter('/* End PBXResourcesBuildPhase section */', phase(ID.essaisPhaseRessources, 'PBXResourcesBuildPhase'));
  ajouter('/* End PBXSourcesBuildPhase section */', phase(ID.essaisPhaseSources, 'PBXSourcesBuildPhase'));
  ajouter('/* End PBXNativeTarget section */', `\t\t${ID.essais} = {\n\t\t\tisa = PBXNativeTarget;\n\t\t\tbuildConfigurationList = ${ID.essaisConfigs};\n\t\t\tbuildPhases = (\n\t\t\t\t${ID.essaisPhaseSources},\n\t\t\t\t${ID.essaisPhaseFrameworks},\n\t\t\t\t${ID.essaisPhaseRessources},\n\t\t\t);\n\t\t\tbuildRules = (\n\t\t\t);\n\t\t\tdependencies = (\n\t\t\t\t${ID.dependance},\n\t\t\t);\n\t\t\tfileSystemSynchronizedGroups = (\n\t\t\t\t${ID.essaisSources},\n\t\t\t);\n\t\t\tname = ${pb(nom)};\n\t\t\tproductName = ${pb(nom)};\n\t\t\tproductReference = ${ID.essaisProduit};\n\t\t\tproductType = "com.apple.product-type.bundle.ui-testing";\n\t\t};\n`);
  ajouter('/* Begin PBXProject section */', `/* Begin PBXContainerItemProxy section */\n\t\t${ID.proxy} = {\n\t\t\tisa = PBXContainerItemProxy;\n\t\t\tcontainerPortal = ${ID.projet};\n\t\t\tproxyType = 1;\n\t\t\tremoteGlobalIDString = ${ID.cible};\n\t\t\tremoteInfo = ${pb(o.nom)};\n\t\t};\n/* End PBXContainerItemProxy section */\n\n/* Begin PBXTargetDependency section */\n\t\t${ID.dependance} = {\n\t\t\tisa = PBXTargetDependency;\n\t\t\ttarget = ${ID.cible};\n\t\t\ttargetProxy = ${ID.proxy};\n\t\t};\n/* End PBXTargetDependency section */\n\n`);
  ajouter('/* End XCBuildConfiguration section */', `${config(ID.essaisDebug, 'Debug', reglages(true))}\n${config(ID.essaisRelease, 'Release', reglages(false))}\n`);
  ajouter('/* End XCConfigurationList section */', `\t\t${ID.essaisConfigs} = {\n\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n\t\t\t\t${ID.essaisDebug},\n\t\t\t\t${ID.essaisRelease},\n\t\t\t);\n\t\t\tdefaultConfigurationIsVisible = 0;\n\t\t\tdefaultConfigurationName = Release;\n\t\t};\n`);
  texte = texte.replace(`\t\t\t\t${ID.cible} /* ${o.nom} */,\n\t\t\t);\n\t\t};\n/* End PBXProject section */`, `\t\t\t\t${ID.cible} /* ${o.nom} */,\n\t\t\t\t${ID.essais},\n\t\t\t);\n\t\t};\n/* End PBXProject section */`);
  texte = texte.replace(`\t\t\t\t${ID.sources} /* ${o.nom} */,\n\t\t\t\t${ID.produits} /* Products */,`, `\t\t\t\t${ID.sources} /* ${o.nom} */,\n\t\t\t\t${ID.essaisSources},\n\t\t\t\t${ID.produits} /* Products */,`);
  return texte;
}

function projetDeBase(o: OptionsXcode, produit: string): string {
  return `// !$*UTF8*$!
{
\tarchiveVersion = 1;
\tclasses = {
\t};
\tobjectVersion = 77;
\tobjects = {

/* Begin PBXFileReference section */
\t\t${ID.application} /* ${produit} */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = ${pb(produit)}; sourceTree = BUILT_PRODUCTS_DIR; };
/* End PBXFileReference section */

/* Begin PBXFileSystemSynchronizedRootGroup section */
\t\t${ID.sources} /* ${o.nom} */ = {isa = PBXFileSystemSynchronizedRootGroup; path = ${pb(o.nom)}; sourceTree = "<group>"; };
/* End PBXFileSystemSynchronizedRootGroup section */

/* Begin PBXFrameworksBuildPhase section */
\t\t${ID.phaseFrameworks} /* Frameworks */ = {
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
\t\t${ID.racine} = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t${ID.sources} /* ${o.nom} */,
\t\t\t\t${ID.produits} /* Products */,
\t\t\t);
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${ID.produits} /* Products */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t${ID.application} /* ${produit} */,
\t\t\t);
\t\t\tname = Products;
\t\t\tsourceTree = "<group>";
\t\t};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
\t\t${ID.cible} /* ${o.nom} */ = {
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = ${ID.configsCible};
\t\t\tbuildPhases = (
\t\t\t\t${ID.phaseSources} /* Sources */,
\t\t\t\t${ID.phaseFrameworks} /* Frameworks */,
\t\t\t\t${ID.phaseRessources} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tfileSystemSynchronizedGroups = (
\t\t\t\t${ID.sources} /* ${o.nom} */,
\t\t\t);
\t\t\tname = ${pb(o.nom)};
\t\t\tproductName = ${pb(o.nom)};
\t\t\tproductReference = ${ID.application} /* ${produit} */;
\t\t\tproductType = "com.apple.product-type.application";
\t\t};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
\t\t${ID.projet} /* Project object */ = {
\t\t\tisa = PBXProject;
\t\t\tattributes = {
\t\t\t\tBuildIndependentTargetsInParallel = 1;
\t\t\t\tLastSwiftUpdateCheck = 2700;
\t\t\t\tLastUpgradeCheck = 2700;
\t\t\t};
\t\t\tbuildConfigurationList = ${ID.configsProjet};
\t\t\tcompatibilityVersion = "Xcode 15.0";
\t\t\tdevelopmentRegion = fr;
\t\t\thasScannedForEncodings = 0;
\t\t\tknownRegions = (
\t\t\t\tBase,
\t\t\t\tfr,
\t\t\t\ten,
\t\t\t);
\t\t\tmainGroup = ${ID.racine};
\t\t\tminimizedProjectReferenceProxies = 1;
\t\t\tpreferredProjectObjectVersion = 77;
\t\t\tproductRefGroup = ${ID.produits} /* Products */;
\t\t\tprojectDirPath = "";
\t\t\tprojectRoot = "";
\t\t\ttargets = (
\t\t\t\t${ID.cible} /* ${o.nom} */,
\t\t\t);
\t\t};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
\t\t${ID.phaseRessources} /* Resources */ = {
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
\t\t${ID.phaseSources} /* Sources */ = {
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
${config(ID.debugProjet, 'Debug', reglagesProjet(true))}
${config(ID.releaseProjet, 'Release', reglagesProjet(false))}
${config(ID.debugCible, 'Debug', reglagesCible(o, true))}
${config(ID.releaseCible, 'Release', reglagesCible(o, false))}
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
\t\t${ID.configsProjet} = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t${ID.debugProjet} /* Debug */,
\t\t\t\t${ID.releaseProjet} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};
\t\t${ID.configsCible} = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t${ID.debugCible} /* Debug */,
\t\t\t\t${ID.releaseCible} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};
/* End XCConfigurationList section */
\t};
\trootObject = ${ID.projet} /* Project object */;
}
`;
}

/** Le schéma partagé : `xcodebuild -scheme` le trouve sans ouvrir Xcode. Une autre cible (la télévision) a le sien. */
export function schemaXcode(nom: string, essais = false, autre?: { nom: string; rang: number; projet: string }): string {
  const reference = `<BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "${autre ? idCible(autre.rang, 6) : ID.cible}"
               BuildableName = "${autre ? autre.nom : nom}.app"
               BlueprintName = "${autre ? autre.nom : nom}"
               ReferencedContainer = "container:${autre ? autre.projet : nom}.xcodeproj">
            </BuildableReference>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion = "2700" version = "1.7">
   <BuildAction parallelizeBuildables = "YES" buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry buildForTesting = "YES" buildForRunning = "YES" buildForProfiling = "YES" buildForArchiving = "YES" buildForAnalyzing = "YES">
            ${reference}
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv = "YES">${essais ? `
      <Testables>
         <TestableReference skipped = "NO">
            <BuildableReference BuildableIdentifier = "primary" BlueprintIdentifier = "${ID.essais}" BuildableName = "${nom}Essais.xctest" BlueprintName = "${nom}Essais" ReferencedContainer = "container:${nom}.xcodeproj"></BuildableReference>
         </TestableReference>
      </Testables>` : ''}
   </TestAction>
   <LaunchAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle = "0" useCustomWorkingDirectory = "NO" ignoresPersistentStateOnLaunch = "NO" debugDocumentVersioning = "YES" allowLocationSimulation = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         ${reference}
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction buildConfiguration = "Release" shouldUseLaunchSchemeArgsEnv = "YES" savedToolIdentifier = "" useCustomWorkingDirectory = "NO" debugDocumentVersioning = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         ${reference}
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction buildConfiguration = "Release" revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
`;
}

/**
 * Les droits de l'application : le Mac l'enferme dans son bac à sable, et lui
 * ouvre seulement le réseau sortant (et les fichiers choisis, s'il en faut).
 */
export function droits(fichiers: boolean, notifications?: 'ios' | 'mac', position = false, domaine?: string, connexionApple = false, groupe?: string, autres = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.app-sandbox</key>
	<true/>
	<key>com.apple.security.network.client</key>
	<true/>${fichiers ? `
	<key>com.apple.security.files.user-selected.read-only</key>
	<true/>` : ''}${position ? `
	<key>com.apple.security.personal-information.location</key>
	<true/>` : ''}${domaine ? `
	<key>com.apple.developer.associated-domains</key>
	<array>
		<string>applinks:${domaine.split('/')[0]}</string>
	</array>` : ''}${connexionApple ? `
	<key>com.apple.developer.applesignin</key>
	<array>
		<string>Default</string>
	</array>` : ''}${notifications ? `
	<key>${notifications === 'mac' ? 'com.apple.developer.aps-environment' : 'aps-environment'}</key>
	<string>development</string>` : ''}${groupe ? `
	<key>com.apple.security.application-groups</key>
	<array>
		<string>${groupe}</string>
	</array>` : ''}${autres}
</dict>
</plist>
`;
}

/**
 * Les réglages ajoutés au fichier Info. L'application ne chiffre qu'avec ce que le système fournit
 * (HTTPS, Keychain) : TestFlight ne repose donc pas la question du chiffrement à chaque envoi.
 * `http://` reste permis sur le réseau local, seulement pour essayer contre un serveur de cet ordinateur.
 */
export function infoSupplementaire(serveurLocal: boolean, usages: { camera?: boolean; identite?: boolean; position?: boolean; liens?: { schema: string; identifiant: string }; arrierePlan?: string; schemaInterne?: string; formes?: string } = {}): string {
  const schemas = [...(usages.liens ? [{ nom: usages.liens.identifiant, schema: usages.liens.schema }] : []), ...(usages.schemaInterne ? [{ nom: `${usages.schemaInterne}.formes`, schema: usages.schemaInterne }] : [])];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>ITSAppUsesNonExemptEncryption</key>
	<false/>${usages.camera ? `
	<key>NSCameraUsageDescription</key>
	<string>L'application utilise l'appareil photo pour prendre une photo ou scanner un code.</string>` : ''}${usages.identite ? `
	<key>NSFaceIDUsageDescription</key>
	<string>L'application vérifie qu'il s'agit bien de vous.</string>` : ''}${usages.position ? `
	<key>NSLocationWhenInUseUsageDescription</key>
	<string>L'application utilise votre position quand vous le demandez.</string>
	<key>NSLocationUsageDescription</key>
	<string>L'application utilise votre position quand vous le demandez.</string>` : ''}${schemas.length ? `
	<key>CFBundleURLTypes</key>
	<array>${schemas.map((s) => `
		<dict>
			<key>CFBundleURLName</key>
			<string>${s.nom}</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>${s.schema}</string>
			</array>
		</dict>`).join('')}
	</array>` : ''}${usages.arrierePlan ? `
	<key>BGTaskSchedulerPermittedIdentifiers</key>
	<array>
		<string>${usages.arrierePlan}</string>
	</array>
	<key>UIBackgroundModes</key>
	<array>
		<string>fetch</string>
	</array>` : ''}${serveurLocal ? `
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsLocalNetworking</key>
		<true/>
	</dict>` : ''}${usages.formes ?? ''}
</dict>
</plist>
`;
}

/** Le fichier que le site doit servir : il prouve à Apple que l'application peut ouvrir ces liens. */
export function associationSite(equipe: string, identifiant: string, domaine: string): string {
  const chemin = domaine.includes('/') ? `/${domaine.split('/').slice(1).join('/')}` : '';
  const composants = chemin ? [{ '/': chemin }, { '/': `${chemin}/*` }] : [{ '/': '/*' }];
  return `${JSON.stringify({ applinks: { details: [{ appIDs: [`${equipe}.${identifiant}`], components: composants }] } }, null, 2)}\n`;
}

/** Ce que l'App Store demande de déclarer : `UserDefaults` sert à garder les préférences de l'application. */
export const CONFIDENTIALITE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSPrivacyTracking</key>
	<false/>
	<key>NSPrivacyTrackingDomains</key>
	<array/>
	<key>NSPrivacyCollectedDataTypes</key>
	<array/>
	<key>NSPrivacyAccessedAPITypes</key>
	<array>
		<dict>
			<key>NSPrivacyAccessedAPIType</key>
			<string>NSPrivacyAccessedAPICategoryUserDefaults</string>
			<key>NSPrivacyAccessedAPITypeReasons</key>
			<array>
				<string>CA92.1</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
`;

/** Le catalogue d'images : la couleur d'accent et, s'il y a un logo, l'icône de l'application. */
export function assets(icone: boolean, accent: { clair: string; sombre: string } | undefined): Map<string, string> {
  const fichiers = new Map<string, string>();
  fichiers.set('Assets.xcassets/Contents.json', `${JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2)}\n`);
  const composantes = (hex: string) => {
    const n = parseInt(hex.slice(1, 7), 16);
    const c = (d: number) => (((n >> d) & 255) / 255).toFixed(3);
    return { red: c(16), green: c(8), blue: c(0), alpha: '1.000' };
  };
  const { clair, sombre } = accent ?? { clair: '#1f5fbf', sombre: '#7fb0ff' };
  fichiers.set(
    'Assets.xcassets/AccentColor.colorset/Contents.json',
    `${JSON.stringify(
      {
        colors: [
          { color: { 'color-space': 'srgb', components: composantes(clair) }, idiom: 'universal' },
          { appearances: [{ appearance: 'luminosity', value: 'dark' }], color: { 'color-space': 'srgb', components: composantes(sombre) }, idiom: 'universal' },
        ],
        info: { author: 'xcode', version: 1 },
      },
      null,
      2,
    )}\n`,
  );
  if (icone) {
    const macs = [16, 32, 128, 256, 512].flatMap((taille) => [1, 2].map((echelle) => ({ filename: 'icone.png', idiom: 'mac', scale: `${echelle}x`, size: `${taille}x${taille}` })));
    fichiers.set(
      'Assets.xcassets/AppIcon.appiconset/Contents.json',
      `${JSON.stringify({ images: [{ filename: 'icone.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }, ...macs], info: { author: 'xcode', version: 1 } }, null, 2)}\n`,
    );
  }
  return fichiers;
}
