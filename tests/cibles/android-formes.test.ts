import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../../src/compilateur.js';
import { pourLaCible } from '../../src/ri/plateforme.js';
import { verifierFormesPourLaCible } from '../../src/cibles/formes.js';
import { genererProjetAndroid } from '../../src/cibles/android/projet.js';
import { iconeDrawable, mimesDe } from '../../src/cibles/android/formes.js';

const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return pourLaCible(application!, 'android');
};
const produire = (source: string) => genererProjetAndroid(compile(source), { nom: 'essai', source: 'essai.humalis' });
const projet = (source: string) => {
  const { fichiers, diagnostics } = produire(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return fichiers;
};
const avertissements = (source: string) => produire(source).diagnostics.filter((d) => d.gravite === 'avertissement').map((d) => d.message);
const CODE = 'app/src/main/java/local/humalis/essai';
const kt = (f: Map<string, string>, nom: string) => f.get(`${CODE}/${nom}.kt`) ?? '';
const manifeste = (f: Map<string, string>) => f.get('app/src/main/AndroidManifest.xml')!;
const PAGE = 'page "compte" :\n    titre "Compte"\n';

describe('cible Android — les formes d’application spéciales', () => {
  it('écrit les formes prévues sur Android : aucune n’y est plus refusée', () => {
    const tout = readFileSync(new URL('../formes/toutes.humalis', import.meta.url), 'utf8');
    const app = compile(tout);
    const diagnostics = verifierFormesPourLaCible(app, 'android');
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    // Ce qui n'a pas de sens sur un téléphone est ignoré, et dit une fois.
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain('le lancement au démarrage');
    expect(diagnostics[0]!.message).toContain('le menu clic droit');
    expect(produire(tout).diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  });

  it('widget : un GlanceAppWidget, sa taille, « vers » et l’actualisation par WorkManager', () => {
    const f = projet(`variable solde = 120 avec partagee et memorisee\nwidget "solde" avec taille moyenne vers "compte" :\n    titre "Solde"\n    texte "{solde} €"\n    progression solde\n    actualiser toutes les 30 minutes\n${PAGE}`);
    const w = kt(f, 'WidgetSolde');
    expect(w).toContain('class WidgetSolde : GlanceAppWidget() {');
    expect(w).toContain('provideContent {');
    expect(w).toContain('Text("Solde"');
    expect(w).toMatch(/Text\(.*Partage\.solde/);
    expect(w).toContain('LinearProgressIndicator(progress = ');
    expect(w).toContain('.putExtra("humalis.page", "compte")');
    expect(w).toContain('clickable(actionStartActivity(ouvrir))');
    expect(w).toContain('PeriodicWorkRequestBuilder<ActualiserWidgetSolde>(30, TimeUnit.MINUTES)');
    expect(w).toContain('WidgetSolde().updateAll(applicationContext)');
    const xml = f.get('app/src/main/res/xml/widget_solde.xml')!;
    expect(xml).toContain('android:minWidth="250dp"');
    expect(xml).toContain('android:targetCellWidth="4"');
    expect(xml).toContain('android:targetCellHeight="2"');
    expect(manifeste(f)).toContain('<receiver android:name=".RecepteurWidgetSolde"');
    expect(manifeste(f)).toContain('android:resource="@xml/widget_solde"');
    expect(f.get('app/build.gradle.kts')).toContain('androidx.glance:glance-appwidget:');
    expect(f.get('app/build.gradle.kts')).toContain('androidx.work:work-runtime-ktx:');
    // En passant à l'arrière-plan, l'application redessine le widget.
    expect(kt(f, 'Formes')).toContain('WidgetSolde().updateAll(contexte)');
    expect(kt(f, 'MainActivity')).toContain('FormesHumalis.quitter(applicationContext)');
  });

  it('widget : son chargement lit le serveur, et une variable non mémorisée est signalée', () => {
    const f = projet(`widget "dernier" :\n    variable commandes = []\n    quand la page se charge :\n        envoyer requete vers "commandes" dans commandes\n    titre "Commandes"\n    pour chaque c dans commandes :\n        texte "{c.total}"\n${PAGE}`);
    const w = kt(f, 'WidgetDernier');
    expect(w).toContain('var lCommandes: Any? = ');
    expect(w).toMatch(/Serveur\.lire\("[^"]*commandes"/);
    expect(w).toContain('liste(lCommandes).take(8)');
    expect(avertissements(`variable solde = 1 avec partagee\nwidget "s" :\n    texte "{solde}"\n${PAGE}`).join('\n')).toContain('« avec memorisee »');
  });

  it('widget : ce qui ne se dessine pas dans un widget est refusé clairement', () => {
    const { diagnostics } = produire(`widget "s" :\n    champ "Nom"\n${PAGE}`);
    expect(diagnostics.find((d) => d.gravite === 'erreur')?.message).toContain('ne se dessine pas dans le widget « s » sur Android');
  });

  it('partage reçu : ACTION_SEND et SEND_MULTIPLE, qui donnent partage.texte, lien et fichier', () => {
    const f = projet(`variable notes = [] avec partagee\nquand on partage vers l'application :\n    ajouter partage.texte a notes\n    rediriger vers "compte"\n${PAGE}`);
    expect(manifeste(f)).toContain('<action android:name="android.intent.action.SEND" />');
    expect(manifeste(f)).toContain('<action android:name="android.intent.action.SEND_MULTIPLE" />');
    const formes = kt(f, 'Formes');
    expect(formes).toContain('fun lirePartage(contexte: Context, intent: Intent): Map<String, Any?>');
    expect(formes).toContain('"texte" to texte, "lien" to lien, "fichier" to');
    expect(formes).toContain('suspend fun partageRecu(nav: NavHostController, partage: Any?) {');
    expect(formes).toContain('champ(partage, "texte")');
    expect(formes).toContain('allerVers(nav, "compte")');
    // La première page prête fait ce que l'application a reçu.
    const activite = kt(f, 'MainActivity');
    expect(activite).toContain('if (savedInstanceState == null) FormesHumalis.recevoir(applicationContext, intent)');
    expect(activite).toContain('override fun onNewIntent(intent: Intent) {');
    expect(activite).toContain('LaunchedEffect(FormesHumalis.enAttente)');
  });

  it('fichiers ouverts : un filtre ACTION_VIEW par type MIME, et par nom pour une extension inconnue', () => {
    const f = projet(`quand on ouvre un fichier ".csv" ou ".pdf" :\n    afficher "Fichier {fichier.nom}"\nquand on ouvre un fichier ".humalis" :\n    afficher "Programme {fichier.nom}"\n${PAGE}`);
    const m = manifeste(f);
    expect(m).toContain('<data android:mimeType="text/csv" />');
    expect(m).toContain('<data android:mimeType="application/pdf" />');
    expect(m).toContain('<data android:pathPattern=".*\\\\.humalis" />');
    const formes = kt(f, 'Formes');
    expect(formes).toContain('fun lireFichierOuvert(contexte: Context, adresse: Uri): Map<String, Any?>?');
    expect(formes).toContain('"nom" to nom, "type" to type, "contenu" to contenu');
    expect(formes).toContain('in setOf("csv", "pdf")');
    expect(formes).toContain('-> fichierOuvert2(nav, fichier)');
    expect(mimesDe('.CSV')).toContain('text/csv');
    expect(avertissements(`quand on ouvre un fichier ".humalis" :\n    afficher "x"\n${PAGE}`).join('\n')).toContain('pas de type connu');
  });

  it('montre et télévision : un module Wear OS et un module Android TV, chacun avec ses pages', () => {
    const f = projet(`variable solde = 3 avec partagee\npage "accueil" :\n    titre "Téléphone"\n    sur montre :\n        texte "seulement sur la montre"\n    sur tele :\n        texte "seulement sur la télé"\npage "poignet" sur montre :\n    titre "Montre"\n    sur montre :\n        texte "au poignet"\npage "salon" sur tele :\n    titre "Télé"\n`);
    expect(f.get('settings.gradle.kts')).toContain('include(":app")\ninclude(":montre")\ninclude(":tele")');
    // Le téléphone n'a ni la page de la montre, ni ses blocs.
    expect(f.has(`${CODE}/PagePoignet.kt`)).toBe(false);
    expect(kt(f, 'PageAccueil')).not.toContain('seulement sur');
    const montre = 'montre/src/main/java/local/humalis/essai/montre';
    expect(f.get(`${montre}/PagePoignet.kt`)).toContain('au poignet');
    expect(f.has(`${montre}/PageAccueil.kt`)).toBe(false);
    expect(f.get(`${montre}/MainActivity.kt`)).toContain('SwipeDismissableNavHost(nav, ');
    expect(f.get(`${montre}/MainActivity.kt`)).toContain('setContent { CadreMontre { ApplicationHumalis() } }');
    expect(f.get(`${montre}/CadreMontre.kt`)).toContain('TimeText');
    expect(f.get('montre/build.gradle.kts')).toContain('applicationId = "local.humalis.essai"');
    expect(f.get('montre/build.gradle.kts')).toContain('androidx.wear.compose:compose-material3:');
    expect(f.get('montre/build.gradle.kts')).toContain('minSdk = 30');
    expect(f.get('montre/src/main/AndroidManifest.xml')).toContain('android.hardware.type.watch');
    const tele = 'tele/src/main/java/local/humalis/essai/tele';
    expect(f.get(`${tele}/PageSalon.kt`)).toContain('"Télé"');
    expect(f.get(`${tele}/MainActivity.kt`)).toContain('CadreTele { ApplicationHumalis() }');
    expect(f.get('tele/build.gradle.kts')).toContain('androidx.tv:tv-material:');
    expect(f.get('tele/src/main/AndroidManifest.xml')).toContain('android.intent.category.LEANBACK_LAUNCHER');
    expect(f.get('tele/src/main/AndroidManifest.xml')).toContain('android:banner="@drawable/banniere_tele"');
    expect(f.has('tele/src/main/res/drawable/banniere_tele.xml')).toBe(true);
  });

  it('clavier : un InputMethodService, avec ses touches, Espace, Effacer et le clavier suivant', () => {
    const f = projet(`clavier "Réponses rapides" :\n    touche "Merci" ecrit "Merci beaucoup !"\n    touche "Bonjour" ecrit "Bonjour, comment allez-vous ?"\n${PAGE}`);
    const c = kt(f, 'ClavierReponsesRapides');
    expect(c).toContain('class ClavierReponsesRapides : InputMethodService() {');
    expect(c).toContain('"Merci" to "Merci beaucoup !"');
    expect(c).toContain('currentInputConnection?.commitText(ecrit, 1)');
    expect(c).toContain('switchToNextInputMethod(false)');
    expect(manifeste(f)).toContain('android:permission="android.permission.BIND_INPUT_METHOD"');
    expect(f.get('app/src/main/res/xml/clavier_reponses_rapides.xml')).toContain('<input-method');
  });

  it('activité en direct : une notification « en cours » avec progression, commencée et terminée', () => {
    const f = projet(`variable progres = 40 avec partagee\nactivite en direct "livraison" :\n    titre "Commande en route"\n    texte "Avancement {progres} %"\n    progression progres\npage "compte" :\n    bouton "Suivre"\n    bouton "Fin"\n    quand l'utilisateur clique sur "Suivre" :\n        commencer activite "livraison"\n    quand l'utilisateur clique sur "Fin" :\n        terminer activite "livraison"\n`);
    expect(kt(f, 'PageCompte')).toContain('Activites.commencer("livraison")');
    expect(kt(f, 'PageCompte')).toContain('Activites.terminer("livraison")');
    const a = kt(f, 'Activites');
    expect(a).toContain('.setOngoing(true)');
    expect(a).toContain('.setRequestPromotedOngoing(true)');
    expect(a).toContain('n.setProgress(100, (it * 100).toInt(), false)');
    expect(a).toContain('titre = "Commande en route"');
    expect(a).toMatch(/progression = \(nombre\(Partage\.progres\) \/ 100\.0\)/);
    expect(manifeste(f)).toContain('android.permission.POST_PROMOTED_NOTIFICATIONS');
  });

  it('activité en direct : le serveur la fait relire par un message de données Firebase', () => {
    const f = projet(`activite en direct "livraison" :\n    titre "En route"\nserveur "boutique" :\n    roles gerant\n    donnee commande :\n        total : nombre\n    route "commandes" :\n        seul gerant peut lire commande\n        seul gerant peut modifier commande\n        seul gerant peut faire "valider" sur commande :\n            mettre a jour activite "livraison" pour gerant\npage "a" :\n    bouton "Go"\n    quand l'utilisateur clique sur "Go" :\n        commencer activite "livraison"\n        activer notifications\n`);
    const n = kt(f, 'Notifications');
    expect(n).toContain('if (message.data["humalis"] == "activite") {');
    expect(n).toContain('Activites.actualiser(applicationContext, nom)');
  });

  it('raccourcis de l’icône : des raccourcis statiques, avec leur icône et la page qu’ils ouvrent', () => {
    const f = projet(`raccourcis de l'icone :\n    raccourci "Mon compte" vers "compte" avec icone "user"\n${PAGE}`);
    const r = f.get('app/src/main/res/xml/shortcuts.xml')!;
    expect(r).toContain('android:shortcutId="raccourci_1"');
    expect(r).toContain('android:icon="@drawable/icone_user"');
    expect(r).toContain('android:targetClass="local.humalis.essai.MainActivity"');
    expect(r).toContain('<extra android:name="humalis.page" android:value="compte" />');
    expect(f.get('app/src/main/res/values/formes.xml')).toContain('<string name="raccourci_1">Mon compte</string>');
    expect(f.get('app/src/main/res/drawable/icone_user.xml')).toContain('android:strokeWidth="2"');
    expect(manifeste(f)).toContain('<meta-data android:name="android.app.shortcuts" android:resource="@xml/shortcuts" />');
    expect(kt(f, 'Formes')).toContain('intent.getStringExtra("humalis.page")');
  });

  it('commandes vocales : des App Actions ; « dire » est lu par le téléphone, et l’assistant ne répond pas : c’est dit', () => {
    const source = `variable solde = 120 avec partagee\ncommande vocale "Mon solde" :\n    dire "Votre solde est de {solde} €"\ncommande vocale "Voir {produit}" vers "compte"\n${PAGE}`;
    const f = projet(source);
    const r = f.get('app/src/main/res/xml/shortcuts.xml')!;
    expect(r).toContain('<capability android:name="custom.actions.intent.MON_SOLDE" app:queryPatterns="@array/commande_vocale_1">');
    expect(r).toContain('<parameter android:name="produit" android:key="produit" android:mimeType="https://schema.org/Text" />');
    expect(f.get('app/src/main/res/values/formes.xml')).toContain('<item>Voir $produit</item>');
    const formes = kt(f, 'Formes');
    expect(formes).toContain('suspend fun commandeVocale1(nav: NavHostController) {');
    expect(formes).toContain('Voix.dire("Votre solde est de ${formaterNombre(nombre(Partage.solde))} €")');
    expect(formes).toContain('suspend fun commandeVocale2(nav: NavHostController, produit: Any?) {');
    expect(formes).toContain('val produit = intent.getStringExtra("produit") ?: ""');
    expect(kt(f, 'Voix')).toContain('TextToSpeech');
    expect(avertissements(source).join('\n')).toContain("l'assistant Google ne laisse pas une application lui donner la réponse à dire");
  });

  it('boutons des notifications : les actions de la notification, et la réponse qui exécute le corps', () => {
    const f = projet(`variable solde = 1 avec partagee\nserveur "boutique" :\n    roles gerant\n    donnee commande :\n        total : nombre\n    route "commandes" :\n        seul gerant peut lire commande\n        seul gerant peut modifier commande\n        seul gerant peut faire "valider" sur commande :\n            envoyer notification aux gerant avec titre "Nouvelle" et texte "Commande" et boutons "Accepter" et "Refuser"\nquand l'utilisateur touche "Accepter" dans une notification :\n    changer solde par solde + 1\n    afficher "Acceptée"\npage "a" :\n    bouton "Go"\n    quand l'utilisateur clique sur "Go" :\n        activer notifications\n`);
    const b = kt(f, 'Boutons');
    expect(b).toContain('class RecepteurBoutonsHumalis : BroadcastReceiver() {');
    expect(b).toContain('"Accepter" -> boutonNotification1()');
    expect(b).toContain('Partage.solde = plus(Partage.solde, 1.0)');
    expect(b).toContain('val BOUTONS_ECRITS = setOf("Accepter")');
    const n = kt(f, 'Notifications');
    expect(n).toContain('if (message.data["humalis"] == "notification") {');
    expect(n).toContain('notification.addAction(0, bouton, action)');
    expect(n).toContain('boutons.take(3)');
    expect(manifeste(f)).toContain('<receiver android:name=".RecepteurBoutonsHumalis" android:exported="false" />');
    // Sans page ouverte, les messages passent par le système.
    expect(kt(f, 'Formes')).toContain('Toast.makeText(contexte.applicationContext, m.texte');
  });

  it('boutons des notifications : un bouton ne peut pas changer de page, rien n’est ouvert', () => {
    const { diagnostics } = produire(`quand l'utilisateur touche "Voir" dans une notification :\n    rediriger vers "compte"\n${PAGE}`);
    expect(diagnostics.find((d) => d.gravite === 'erreur')?.message).toContain("rien n'est ouvert à l'écran");
  });

  it('recherche du système : AppSearch, visible par le système, et ce que cela ne garantit pas est dit', () => {
    const source = `variable produits = [fiche avec nom "Livre" et description "Un livre"] avec partagee\nrecherche du systeme :\n    produits avec titre nom et texte description vers "compte"\n${PAGE}`;
    const f = projet(source);
    const r = kt(f, 'Recherche');
    expect(r).toContain('PlatformStorage.createSearchSessionAsync');
    expect(r).toContain('setSchemaTypeDisplayedBySystem(GENRE, true)');
    expect(r).toContain('texte(champ(fiche, "nom"))');
    expect(r).toContain('if (Build.VERSION.SDK_INT < 31) return');
    expect(f.get('app/build.gradle.kts')).toContain('androidx.appsearch:appsearch-platform-storage:');
    expect(avertissements(source).join('\n')).toContain('Android ne garantit pas que le lanceur du téléphone les montre');
  });

  it('tuile : un TileService des réglages rapides, avec son icône, qui exécute ses actions', () => {
    const f = projet(`variable pointages = 0 avec partagee\ntuile "Pointer" avec icone "clock" :\n    changer pointages par pointages + 1\n    afficher "Pointé"\n${PAGE}`);
    const t = kt(f, 'TuilePointer');
    expect(t).toContain('class TuilePointer : TileService() {');
    expect(t).toContain('HorsPage.lancer(this@TuilePointer) { actionsTuile1() }');
    expect(t).toContain('Messages.afficher("Pointé", "info")');
    expect(manifeste(f)).toContain('android:permission="android.permission.BIND_QUICK_SETTINGS_TILE"');
    expect(manifeste(f)).toContain('android:icon="@drawable/icone_clock"');
    expect(iconeDrawable('clock')).toContain('<vector');
  });

  it('voiture : Android Auto, un ListTemplate de la liste ; l’autorisation de Google est dite dans LISEZMOI.md', () => {
    const source = `variable livraisons = [fiche avec adresse "1 rue A" et client "Ana"] avec partagee\nvoiture "Livraisons" :\n    liste livraisons avec titre adresse et texte client\n${PAGE}`;
    const f = projet(source);
    const v = kt(f, 'Voiture');
    expect(v).toContain('class VoitureHumalis : CarAppService() {');
    expect(v).toContain('ListTemplate.Builder().setTitle("Livraisons")');
    expect(v).toContain('texte(champ(fiche, "adresse"))');
    expect(manifeste(f)).toContain('<action android:name="androidx.car.app.CarAppService" />');
    expect(manifeste(f)).toContain('com.google.android.gms.car.application');
    expect(f.get('app/src/main/res/xml/automotive_app_desc.xml')).toContain('<uses name="template" />');
    expect(f.get('LISEZMOI.md')).toContain("**Google doit autoriser\nl'application**");
    expect(avertissements(source).join('\n')).toContain("Google doit autoriser l'application");
  });

  it('sans forme, rien de plus n’est écrit', () => {
    const f = projet(PAGE);
    expect(f.has(`${CODE}/Formes.kt`)).toBe(false);
    expect(kt(f, 'MainActivity')).not.toContain('FormesHumalis');
    expect(f.get('settings.gradle.kts')).toContain('include(":app")\n');
    expect(f.get('settings.gradle.kts')).not.toContain(':montre');
  });
});
