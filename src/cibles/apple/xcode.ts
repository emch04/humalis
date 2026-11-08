/**
 * Le projet Xcode produit : une seule application native pour iPhone, iPad et
 * Mac. Le fichier du projet est écrit directement, pour ne dépendre que
 * d'Xcode ; le dossier de sources est « synchronisé » : Xcode y prend tous les
 * fichiers, le projet n'a donc pas à les citer.
 */

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
  /** Vrai s'il y a une icône dans les assets. */
  icone?: boolean;
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
};

/** Une valeur du fichier du projet, entre guillemets si elle en a besoin. */
const pb = (valeur: string): string => (/^[A-Za-z0-9_./]+$/.test(valeur) ? valeur : `"${valeur.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);

function reglagesCible(o: OptionsXcode, debug: boolean): string[] {
  const infos = Object.entries(o.infos ?? {}).map(([cle, valeur]) => `INFOPLIST_KEY_${cle} = ${pb(valeur)};`);
  return [
    ...(o.icone ? ['ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;'] : []),
    'ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;',
    `CODE_SIGN_ENTITLEMENTS = ${pb(`${o.nom}/${o.nom}.entitlements`)};`,
    // Sans équipe : signé pour cet ordinateur et le simulateur seulement.
    ...(o.equipe ? ['CODE_SIGN_STYLE = Automatic;', `DEVELOPMENT_TEAM = ${pb(o.equipe)};`] : ['CODE_SIGN_IDENTITY = "-";', 'CODE_SIGN_STYLE = Manual;', 'DEVELOPMENT_TEAM = "";']),
    'CURRENT_PROJECT_VERSION = 1;',
    'ENABLE_HARDENED_RUNTIME = YES;',
    'ENABLE_PREVIEWS = YES;',
    'GENERATE_INFOPLIST_FILE = YES;',
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

/** Le schéma partagé : `xcodebuild -scheme` le trouve sans ouvrir Xcode. */
export function schemaXcode(nom: string): string {
  const reference = `<BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "${ID.cible}"
               BuildableName = "${nom}.app"
               BlueprintName = "${nom}"
               ReferencedContainer = "container:${nom}.xcodeproj">
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
   <TestAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv = "YES">
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
export function droits(fichiers: boolean): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.app-sandbox</key>
	<true/>
	<key>com.apple.security.network.client</key>
	<true/>${fichiers ? `
	<key>com.apple.security.files.user-selected.read-only</key>
	<true/>` : ''}
</dict>
</plist>
`;
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
