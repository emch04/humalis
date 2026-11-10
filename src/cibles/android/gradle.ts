/**
 * Les fichiers de construction du projet Android : Gradle, le manifeste et
 * les ressources. Les versions sont épinglées : une construction donne
 * toujours la même application.
 */

/** Android 8.0 au minimum (java.time sans bibliothèque en plus), compilé pour Android 16. */
export const VERSIONS = {
  gradle: '9.3.1',
  pluginAndroid: '9.1.1',
  kotlin: '2.3.21',
  composeBom: '2026.06.01',
  activite: '1.12.4',
  navigation: '2.9.7',
  fragment: '1.8.9',
  biometrie: '1.1.0',
  zxing: '4.3.0',
  zxingCore: '3.5.3',
  media3: '1.8.0',
  osmdroid: '6.1.20',
  identifiants: '1.5.0',
  googleid: '1.1.1',
  navigateur: '1.9.0',
  travail: '2.10.5',
  firebase: '24.1.2',
  sdkMinimum: 26,
  sdkCible: 36,
} as const;

export function reglagesGradle(nom: string): string {
  return `// Produit par Humalis.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "${nom}"
include(":app")
`;
}

export const CONSTRUCTION_RACINE = `// Produit par Humalis.
plugins {
    id("com.android.application") version "${VERSIONS.pluginAndroid}" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "${VERSIONS.kotlin}" apply false
}
`;

export const PROPRIETES_GRADLE = `# Produit par Humalis.
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
`;

export const ENVELOPPE_GRADLE = `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-${VERSIONS.gradle}-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;

export function constructionApp(identifiant: string, nomAffiche: string, avec: { appareil?: boolean; scanner?: boolean; qr?: boolean; lecteurs?: boolean; cartes?: boolean; google?: boolean; apple?: boolean; travail?: boolean; notifications?: boolean; paquets?: { nom: string; version: string }[]; formes?: string[] } = {}): string {
  const travail = `implementation("androidx.work:work-runtime-ktx:${VERSIONS.travail}")`;
  const formes = (avec.formes ?? []).filter((d) => !(avec.travail && d.startsWith('implementation("androidx.work:')));
  return `// Produit par Humalis.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "${identifiant}"
    compileSdk = ${VERSIONS.sdkCible}

    defaultConfig {
        applicationId = "${identifiant}"
        minSdk = ${VERSIONS.sdkMinimum}
        targetSdk = ${VERSIONS.sdkCible}
        versionCode = 1
        versionName = "1.0"
        resValue("string", "app_name", "${nomAffiche.replace(/["\\$]/g, '')}")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        compose = true
        resValues = true
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:${VERSIONS.composeBom}"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.activity:activity-compose:${VERSIONS.activite}")
    implementation("androidx.navigation:navigation-compose:${VERSIONS.navigation}")
    implementation("androidx.fragment:fragment-ktx:${VERSIONS.fragment}")
${avec.appareil ? `    implementation("androidx.biometric:biometric:${VERSIONS.biometrie}")
` : ''}${avec.scanner ? `    implementation("com.journeyapps:zxing-android-embedded:${VERSIONS.zxing}")
` : ''}${avec.qr && !avec.scanner ? `    implementation("com.google.zxing:core:${VERSIONS.zxingCore}")
` : ''}${avec.lecteurs ? `    implementation("androidx.media3:media3-exoplayer:${VERSIONS.media3}")
    implementation("androidx.media3:media3-ui:${VERSIONS.media3}")
` : ''}${avec.cartes ? `    implementation("org.osmdroid:osmdroid-android:${VERSIONS.osmdroid}")
` : ''}${avec.google ? `    implementation("androidx.credentials:credentials:${VERSIONS.identifiants}")
    implementation("androidx.credentials:credentials-play-services-auth:${VERSIONS.identifiants}")
    implementation("com.google.android.libraries.identity.googleid:googleid:${VERSIONS.googleid}")
` : ''}${avec.apple ? `    implementation("androidx.browser:browser:${VERSIONS.navigateur}")
` : ''}${avec.travail ? `    ${travail}
` : ''}${avec.notifications ? `    implementation("com.google.firebase:firebase-messaging:${VERSIONS.firebase}")
` : ''}${formes.length ? `    // Les formes de l'application (widget, recherche, voiture…).\n${formes.map((d) => `    ${d}\n`).join('')}` : ''}${(avec.paquets ?? []).map((p) => `    // « paquet android » : pour les vues et les styles écrits à la main.\n    implementation(${JSON.stringify(`${p.nom}:${p.version}`)})\n`).join('')}    debugImplementation("androidx.compose.ui:ui-tooling")
}
`;
}

export function manifeste(reseau: boolean, liens?: { schema: string; domaine?: string }, besoins: { photo?: boolean; position?: boolean; vibration?: boolean; fichiers?: boolean; notifications?: boolean; micro?: boolean; camera?: boolean; ecranCapture?: boolean } = {}, formes?: { activite: string; application: string; permissions: string[] }): string {
  const permissions = [...new Set([
    ...(reseau ? ['android.permission.INTERNET'] : []),
    ...(besoins.vibration ? ['android.permission.VIBRATE'] : []),
    ...(besoins.position ? ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'] : []),
    ...(besoins.notifications ? ['android.permission.POST_NOTIFICATIONS'] : []),
    ...(besoins.micro ? ['android.permission.RECORD_AUDIO'] : []),
    ...(besoins.camera ? ['android.permission.CAMERA'] : []),
    ...(formes?.permissions ?? []),
  ])];
  const service = besoins.notifications
    ? `
        <service android:name=".ServiceNotificationsHumalis" android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>`
    : '';
  const fournisseur = besoins.fichiers
    ? `
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.fichiers"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data android:name="android.support.FILE_PROVIDER_PATHS" android:resource="@xml/chemins_fichiers" />
        </provider>`
    : '';
  const hote = liens?.domaine?.split('/')[0];
  const debut = liens?.domaine?.split('/').slice(1).filter(Boolean).join('/');
  const profonds = liens
    ? `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${liens.schema}" />
            </intent-filter>${
              hote
                ? `
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="${hote}"${debut ? ` android:pathPrefix="/${debut}"` : ''} />
            </intent-filter>`
                : ''
            }`
    : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis. -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
${permissions.map((p) => `    <uses-permission android:name="${p}" />\n`).join('')}${besoins.photo || besoins.camera ? '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n' : ''}${besoins.micro ? '    <uses-feature android:name="android.hardware.microphone" android:required="false" />\n' : ''}
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:networkSecurityConfig="@xml/network_security_config"
        android:theme="@style/Theme.Humalis">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>${profonds}${formes?.activite ?? ''}
        </activity>${besoins.ecranCapture ? `
        <activity
            android:name=".EcranCaptureHumalis"
            android:exported="false"
            android:screenOrientation="locked" />` : ''}${fournisseur}${service}${formes?.application ?? ''}
    </application>
</manifest>
`;
}

/** Le thème de la fenêtre avant que Compose ne dessine : sans barre de titre, clair ou sombre comme le système. */
export const THEME_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis. -->
<resources>
    <style name="Theme.Humalis" parent="android:Theme.Material.Light.NoActionBar" />
</resources>
`;

/** http:// n'est permis que vers l'ordinateur de développement (10.0.2.2 depuis l'émulateur) : tout le reste passe en https. */
export const SECURITE_RESEAU = `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">10.0.2.2</domain>
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
    </domain-config>
</network-security-config>
`;

/** L'icône par défaut : un fond de la couleur de la marque et un « H ». */
export function iconeAdaptative(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`;
}

export function couleurIcone(marque: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis. -->
<resources>
    <color name="ic_launcher_background">${marque}</color>
</resources>
`;
}

export const AVANT_PLAN_ICONE = `<?xml version="1.0" encoding="utf-8"?>
<!-- Produit par Humalis : un « H » blanc au centre de l'icône. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M40,34h7v17h14v-17h7v40h-7v-17h-14v17h-7z" />
</vector>
`;

export const IGNORES_GIT = `# Produit par Humalis.
.gradle/
build/
app/build/
local.properties
.idea/
*.iml
`;
