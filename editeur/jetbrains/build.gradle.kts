import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import org.jetbrains.kotlin.gradle.dsl.JvmDefaultMode
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.4.21"
    id("org.jetbrains.intellij.platform") version "2.20.1"
}

group = "dev.humalis"
version = providers.gradleProperty("version").get()

// Du code pour Java 21, quel que soit le Java qui construit (celui d'IntelliJ convient).
// Sans ponts de compatibilité vers les méthodes par défaut des interfaces : Kotlin n'ajoute pas dans nos classes
// des méthodes que nous n'écrivons pas (ni, avec elles, des appels à des méthodes dépréciées de la plateforme).
tasks.withType<KotlinCompile>().configureEach {
    compilerOptions.jvmTarget.set(JvmTarget.JVM_21)
    compilerOptions.jvmDefault.set(JvmDefaultMode.NO_COMPATIBILITY)
}
tasks.withType<JavaCompile>().configureEach { options.release = 21 }
java { sourceCompatibility = JavaVersion.VERSION_21; targetCompatibility = JavaVersion.VERSION_21 }

repositories {
    mavenCentral()
    intellijPlatform { defaultRepositories() }
}

dependencies {
    intellijPlatform {
        val ideLocal = providers.gradleProperty("ideLocal").get()
        if (ideLocal.isNotBlank()) local(ideLocal) else intellijIdea(providers.gradleProperty("ideVersion").get())
        plugin("com.redhat.devtools.lsp4ij", providers.gradleProperty("lsp4ijVersion").get())
        // Le débogueur Java : les points d'arrêt dans les fichiers .humalis (applications Android).
        bundledPlugin("com.intellij.java")
        testFramework(TestFrameworkType.Platform)
    }
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.opentest4j:opentest4j:1.3.0")
}

// Les mots du langage viennent du vocabulaire du compilateur, comme pour les autres éditeurs.
val copierMots = tasks.register<Copy>("copierMots") {
    from(layout.projectDirectory.file("../tree-sitter-humalis/mots.json")) { into("dev/humalis/intellij") }
    into(layout.buildDirectory.dir("ressources-generees"))
}
sourceSets.main { resources.srcDir(copierMots) }

intellijPlatform {
    pluginConfiguration {
        id = "dev.humalis"
        name = "Humalis"
        version = project.version.toString()
        changeNotes = """
            <p>Le débogueur n'utilise plus que des interfaces stables de la plateforme
            (ni interface interne, ni interface dépréciée, ni interface en essai).</p>
            <p>IDE JetBrains 2025.3 et plus récents.</p>
        """.trimIndent()
        ideaVersion {
            sinceBuild = providers.gradleProperty("plateformeMinimale")
            untilBuild = provider { null }
        }
    }
    pluginVerification { ides { recommended() } }
}

// L'outil de vérification télécharge des extensions pour chaque IDE : dans le cache de Gradle (GRADLE_USER_HOME),
// jamais dans le dossier personnel (~/.pluginVerifier).
tasks.verifyPlugin { jvmArgs("-Dplugin.verifier.home.dir=${gradle.gradleUserHomeDir}/pluginVerifier") }

tasks.test {
    // L'essai lance le vrai serveur : « humalis » doit être dans le PATH de Gradle.
    environment("PATH", System.getenv("PATH"))
    systemProperty("humalis.exemples", layout.projectDirectory.dir("../../exemples").asFile.absolutePath)
}
