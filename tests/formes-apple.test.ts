import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../src/compilateur.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { verifierFormesPourLaCible } from '../src/cibles/formes.js';
import { pourLaCible } from '../src/ri/plateforme.js';
import { idCategorie, iconeForme } from '../src/cibles/apple/formes.js';

/** Le programme d'essai : toutes les formes Apple d'un coup. */
const ESSAI = readFileSync(new URL('../scripts/essais-apple/formes.humalis', import.meta.url), 'utf8');

const apple = (source: string, equipe: string | null = 'EQUIPE1234') => {
  const r = compiler(source);
  expect(r.diagnostics.filter((d) => d.gravite === 'erreur'), JSON.stringify(r.diagnostics)).toEqual([]);
  const application = pourLaCible(r.application!, 'apple');
  const projet = genererProjetApple(application, { nom: 'Essai', source: 'essai.humalis', ...(equipe ? { equipe } : {}) });
  expect(projet.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  const lire = (chemin: string) => {
    const contenu = projet.fichiers.get(chemin);
    expect(contenu, `${chemin} manque`).toBeDefined();
    return contenu!;
  };
  return { ...projet, application, lire };
};

const P = 'page "accueil" :\n    titre "Accueil"\n';
const formes = (projet: ReturnType<typeof apple>) => projet.lire('Essai/Humalis/Formes.swift');

describe('les formes d’application sur Apple', () => {
  it('ne refuse plus aucune forme', () => {
    const r = compiler(ESSAI);
    const diagnostics = verifierFormesPourLaCible(pourLaCible(r.application!, 'apple'), 'apple');
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  });

  it('un projet sans forme reste comme avant : pas de Formes.swift, pas de cible de plus', () => {
    const p = apple(P);
    expect(p.fichiers.has('Essai/Humalis/Formes.swift')).toBe(false);
    expect(p.lire('Essai.xcodeproj/project.pbxproj')).not.toContain('1C00');
    expect(p.lire('Essai/EssaiApp.swift')).not.toContain('HUMALIS_AUTRE_CIBLE');
  });

  it('widget : une extension WidgetKit, sa taille, son lien et son actualisation ; les valeurs passent par le groupe d’applications', () => {
    const p = apple(`variable solde = 120 avec partagee\nwidget "solde" avec taille petite vers "compte" :\n    titre "Solde"\n    texte "{solde} €"\n    actualiser toutes les 30 minutes\n${P}page "compte" :\n    titre "Compte"\n`);
    const w = p.lire('EssaiWidgets/Widgets.swift');
    expect(w).toContain('struct WidgetsHumalis: WidgetBundle');
    expect(w).toContain('.supportedFamilies([.systemSmall])');
    expect(w).toContain('FournisseurHumalis(minutes: 30)');
    expect(w).toContain('.widgetURL(URL(string: "local.humalis.essai://page/compte"))');
    expect(p.lire('Essai/Formes/VueWidget1.swift')).toContain('Partage.commun.solde');
    expect(p.lire('Info-EssaiWidgets.plist')).toContain('com.apple.widgetkit-extension');
    expect(p.lire('EssaiWidgets/EssaiWidgets.entitlements')).toContain('group.local.humalis.essai');
    expect(p.lire('Essai/Essai.entitlements')).toContain('group.local.humalis.essai');
    const partage = p.lire('Essai/Humalis/Partage.swift');
    expect(partage).toContain('GroupeHumalis.ecrire("partage:solde", solde)');
    expect(partage).toContain('func relireDuGroupe()');
    const pbx = p.lire('Essai.xcodeproj/project.pbxproj');
    expect(pbx).toContain('com.apple.product-type.app-extension');
    expect(pbx).toContain('Embed Foundation Extensions');
    expect(pbx).toContain('HUMALIS_SANS_FENETRE');
    expect(pbx).toContain('APPLICATION_EXTENSION_API_ONLY = YES;');
    // L'application lit l'adresse du widget.
    expect(p.lire('Info.plist')).toContain('<string>local.humalis.essai</string>');
    expect(p.lire('Essai/EssaiApp.swift')).toContain('.onOpenURL { FormesHumalis.ouvrir($0) }');
    expect(p.lire('Essai/EssaiApp.swift')).toContain('#if !HUMALIS_AUTRE_CIBLE');
  });

  it('page dans la barre du système : un MenuBarExtra sur Mac, et l’application ne s’y ouvre pas', () => {
    const p = apple(`page "rapide" dans la barre du systeme avec icone "clock" :\n    titre "Rapide"\n${P}`);
    const app = p.lire('Essai/EssaiApp.swift');
    expect(app).toContain('MenuBarExtra("Rapide", systemImage: "clock")');
    expect(app).toContain('.menuBarExtraStyle(.window)');
    expect(app).toContain('PageAccueil()');
  });

  it('partage reçu : une extension de partage iPhone et Mac, lue par l’application', () => {
    const p = apple(`variable notes = [] avec partagee\nquand on partage vers l'application :\n    ajouter partage.texte a notes\n${P}`);
    expect(p.lire('Info-EssaiPartage.plist')).toContain('com.apple.share-services');
    expect(p.lire('EssaiPartage/ControleurPartage.swift')).toContain('UserDefaults(suiteName: groupe)?.set(recu, forKey: "humalis.partage")');
    const f = formes(p);
    expect(f).toContain('func partageRecuHumalis(texte: String, lien: String, fichier: String) async');
    expect(f).toContain('partage.texte = texte');
    expect(f).toContain('Partage.commun.notes.append(partage.texte)');
  });

  it('montre et télévision : une application watchOS rangée dans celle de l’iPhone, une application tvOS avec son schéma ; « sur montre » est gardé', () => {
    const p = apple(`${P}page "minuteur" sur montre :\n    titre "Minuteur"\n    sur montre :\n        texte "Poignet"\npage "salon" sur tele :\n    titre "Salon"\n`);
    expect(p.lire('Essai/Pages/PageMinuteur.swift')).toContain('#if os(watchOS)');
    expect(p.lire('EssaiMontre/EssaiMontreApp.swift')).toContain('PageMinuteur()');
    expect(p.lire('EssaiTele/EssaiTeleApp.swift')).toContain('PageSalon()');
    expect(p.lire('Info-EssaiMontre.plist')).toContain('<key>WKApplication</key>');
    const pbx = p.lire('Essai.xcodeproj/project.pbxproj');
    expect(pbx).toContain('SDKROOT = watchos;');
    expect(pbx).toContain('SDKROOT = appletvos;');
    expect(pbx).toContain('Embed Watch Content');
    expect(pbx).toContain('PRODUCT_BUNDLE_IDENTIFIER = local.humalis.essai.watchkitapp;');
    expect(pbx).toContain('INFOPLIST_KEY_WKCompanionAppBundleIdentifier = local.humalis.essai;');
    expect(p.fichiers.has('Essai.xcodeproj/xcshareddata/xcschemes/EssaiTele.xcscheme')).toBe(true);
    // La page d'entrée de l'iPhone n'est pas celle de la montre.
    expect(p.lire('Essai/EssaiApp.swift')).toContain('PageAccueil()');
  });

  it('clavier : une extension clavier iPhone, une touche par « touche … ecrit … »', () => {
    const p = apple(`clavier "Réponses" :\n    touche "Merci" ecrit "Merci beaucoup !"\n${P}`);
    const k = p.lire('EssaiClavier1/Clavier.swift');
    expect(k).toContain('final class ClavierHumalis: UIInputViewController');
    expect(k).toContain('("Merci", "Merci beaucoup !")');
    expect(k).toContain('advanceToNextInputMode()');
    expect(p.lire('Info-EssaiClavier1.plist')).toContain('com.apple.keyboard-service');
    expect(p.lire('Essai.xcodeproj/project.pbxproj')).toContain('platformFilter = ios;');
  });

  it('activité en direct : ActivityKit, l’îlot dynamique, commencer et terminer', () => {
    const p = apple(`activite en direct "livraison" :\n    titre "En route"\n${P}    bouton "Suivre"\n    bouton "Fin"\n    quand l'utilisateur clique sur "Suivre" :\n        commencer activite "livraison"\n    quand l'utilisateur clique sur "Fin" :\n        terminer activite "livraison"\n`);
    const page = p.lire('Essai/Pages/PageAccueil.swift');
    expect(page).toContain('await ActivitesHumalis.commencer("livraison")');
    expect(page).toContain('await ActivitesHumalis.terminer("livraison")');
    const f = formes(p);
    expect(f).toContain('struct ActiviteHumalis: ActivityAttributes');
    expect(f).toContain('case "livraison": return "En route"');
    expect(f).not.toContain('pushType: .token');
    const w = p.lire('EssaiWidgets/Widgets.swift');
    expect(w).toContain('ActivityConfiguration(for: ActiviteHumalis.self)');
    expect(w).toContain('DynamicIsland {');
    expect(p.lire('Info.plist')).toContain('NSSupportsLiveActivities');
  });

  it('activité mise à jour par le serveur : le jeton part vers /auth/activites, et l’oubli à la fin', () => {
    const source = `activite en direct "livraison" :\n    titre "En route"\nserveur "boutique" :\n    roles gerant\n    donnee commande :\n        total : nombre\n    route "commandes" :\n        seul gerant peut lire commande\n        seul gerant peut modifier commande\n        seul gerant peut faire "valider" sur commande :\n            mettre a jour activite "livraison" pour gerant\n${P}    bouton "Suivre"\n    quand l'utilisateur clique sur "Suivre" :\n        commencer activite "livraison"\n`;
    const f = formes(apple(source));
    expect(f).toContain('pushType: .token');
    expect(f).toContain('"/auth/activites", methode: "POST", envoi: ["nom": .texte(nom), "apple": .texte(texte)]');
    expect(f).toContain('"fin": .booleen(true)');
    expect(apple(source).lire('Essai/Essai.entitlements')).toContain('aps-environment');
  });

  it('raccourcis de l’icône : UIApplicationShortcutItems, ouverts par la scène', () => {
    const p = apple(`raccourcis de l'icone :\n    raccourci "Mon compte" vers "compte" avec icone "user"\n${P}page "compte" :\n    titre "Compte"\n`);
    const info = p.lire('Info.plist');
    expect(info).toContain('UIApplicationShortcutItems');
    expect(info).toContain('<string>person</string>');
    const f = formes(p);
    expect(f).toContain('case "raccourci1": aller("compte")');
    expect(f).toContain('options.shortcutItem?.type');
    expect(p.lire('Essai/EssaiApp.swift')).toContain('@UIApplicationDelegateAdaptor(DelegueFormesHumalis.self)');
  });

  it('commande vocale : un AppIntent, ses phrases pour Siri, « {produit} » en paramètre et « dire » en réponse', () => {
    const p = apple(`variable solde = 1 avec partagee\ncommande vocale "Mon solde" :\n    dire "Solde {solde}"\ncommande vocale "Voir {produit}" vers "accueil"\n${P}`);
    const f = formes(p);
    expect(f).toContain('struct CommandeVocale1: AppIntent');
    expect(f).toContain('static let openAppWhenRun: Bool = false');
    expect(f).toContain('Voix.dire("Solde \\(formaterNombre(Partage.commun.solde))")');
    expect(f).toContain('@Parameter(title: "produit")');
    expect(f).toContain('"Voir dans \\(.applicationName)"');
    expect(f).toContain('struct CommandesVocalesHumalis: AppShortcutsProvider');
    expect(f).toContain('IntentDialog(stringLiteral:');
  });

  it('fichier ouvert : les types de documents, le fichier lu par son adresse', () => {
    const p = apple(`quand on ouvre un fichier ".csv" ou ".plume" :\n    afficher "{fichier.nom}"\n${P}`);
    const info = p.lire('Info.plist');
    expect(info).toContain('CFBundleDocumentTypes');
    expect(info).toContain('public.comma-separated-values-text');
    expect(info).toContain('UTImportedTypeDeclarations');
    expect(info).toContain('<string>local.humalis.essai.plume</string>');
    const f = formes(p);
    expect(f).toContain('case ".csv", ".plume": await fichierOuvert1Humalis(nom: lu.nom, type: lu.type, contenu: lu.contenu)');
    expect(f).toContain('preferredMIMEType');
  });

  it('démarrage : SMAppService sur Mac, sans fenêtre avec « discret »', () => {
    const f = formes(apple(`lancer au demarrage de l'ordinateur avec discret\n${P}`));
    expect(f).toContain('SMAppService.mainApp.register()');
    expect(f).toContain('keyAELaunchedAsLogInItem');
  });

  it('boutons des notifications : les catégories du serveur et la réponse', () => {
    const source = `serveur "boutique" :\n    roles gerant\n    donnee commande :\n        total : nombre\n    route "commandes" :\n        seul gerant peut lire commande\n        seul gerant peut modifier commande\n        seul gerant peut faire "valider" sur commande :\n            envoyer notification aux gerant avec titre "Nouvelle" et texte "Commande" et boutons "Accepter" et "Refuser"\nquand l'utilisateur touche "Accepter" dans une notification :\n    afficher "Acceptée"\n${P}`;
    const f = formes(apple(source));
    expect(idCategorie(['Accepter', 'Refuser'])).toBe('humalis.boutons.Accepter|Refuser');
    expect(f).toContain('UNNotificationCategory(identifier: "humalis.boutons.Accepter|Refuser"');
    expect(f).toContain('case "Accepter": await boutonNotification1Humalis()');
    expect(f).toContain('didReceive reponse: UNNotificationResponse');
  });

  it('recherche du système : Core Spotlight, le résultat ouvre la page', () => {
    const p = apple(`variable produits = [fiche avec nom "Livre" et description "Poche"] avec partagee\nrecherche du systeme :\n    produits avec titre nom et texte description vers "accueil"\n${P}`);
    const f = formes(p);
    expect(f).toContain('CSSearchableItem(uniqueIdentifier: "recherche1:\\(rang)"');
    expect(f).toContain('attributs.title = element.nom');
    expect(f).toContain('case "recherche1": aller("accueil")');
    expect(p.lire('Essai/Humalis/Partage.swift')).toContain('FormesHumalis.partageChange("produits")');
    expect(p.lire('Essai/EssaiApp.swift')).toContain('.onContinueUserActivity(FormesHumalis.actionRecherche)');
  });

  it('tuile : un ControlWidget (iOS 18) dont l’intention fait les actions dans l’application', () => {
    const p = apple(`tuile "Pointer" avec icone "clock" :\n    afficher "Pointé"\n${P}`);
    const w = p.lire('EssaiWidgets/Widgets.swift');
    expect(w).toContain('struct Tuile1: ControlWidget');
    expect(w).toContain('ControlWidgetButton(action: IntentionTuile1())');
    const f = formes(p);
    expect(f).toContain('static let openAppWhenRun: Bool = true');
    // La fonction de la tuile reste lue par l'extension : elle est après la garde de l'application.
    expect(f.lastIndexOf('func tuile1Humalis()')).toBeGreaterThan(f.lastIndexOf('#endif'));
  });

  it('mini application : une App Clip qui montre la page donnée ; une seconde est refusée', () => {
    const p = apple(`mini application "commander" :\n    page "accueil"\n${P}`);
    expect(p.lire('EssaiClip/EssaiClipApp.swift')).toContain('PageAccueil()');
    expect(p.lire('EssaiClip/EssaiClip.entitlements')).toContain('$(AppIdentifierPrefix)local.humalis.essai');
    expect(p.lire('Essai.xcodeproj/project.pbxproj')).toContain('com.apple.product-type.application.on-demand-install-capable');
    const r = compiler(`mini application "a" :\n    page "accueil"\nmini application "b" :\n    page "accueil"\n${P}`);
    const deux = genererProjetApple(pourLaCible(r.application!, 'apple'), { nom: 'Essai', source: 'e' });
    expect(deux.diagnostics.find((d) => d.gravite === 'erreur')?.message).toContain("n'a qu'une App Clip");
  });

  it('voiture : CarPlay (CPListTemplate), le droit pour le simulateur, et l’autorisation d’Apple dite dans LISEZMOI.md', () => {
    const p = apple(`variable produits = [fiche avec nom "Livre"] avec partagee\nvoiture "Livraisons" :\n    liste produits avec titre nom vers "accueil"\n${P}`);
    const f = formes(p);
    expect(f).toContain('final class VoitureHumalis: UIResponder, CPTemplateApplicationSceneDelegate');
    expect(f).toContain('CPListItem(text: element.nom, detailText: nil)');
    expect(p.lire('Info.plist')).toContain('CPTemplateApplicationSceneSessionRoleApplication');
    expect(p.lire('Essai/Essai-simulateur.entitlements')).toContain('com.apple.developer.carplay-driving-task');
    expect(p.lire('Essai/Essai.entitlements')).not.toContain('carplay');
    expect(p.lire('LISEZMOI.md')).toContain('Apple doit d\'abord accorder');
  });

  it('menu clic droit : un service du Finder pour ses extensions', () => {
    const p = apple(`menu clic droit "Envoyer" pour les fichiers ".jpg" et ".png" :\n    afficher "{fichier.nom}"\n${P}`);
    const info = p.lire('Info.plist');
    expect(info).toContain('NSServices');
    expect(info).toContain('<string>menuClicDroit1</string>');
    expect(info).toContain('<string>public.jpeg</string>');
    const f = formes(p);
    expect(f).toContain('@objc func menuClicDroit1(_ presse: NSPasteboard');
    expect(f).toContain('NSApp.servicesProvider = ServicesHumalis.commun');
  });

  it('« dire » dans une page parle avec la voix de l’appareil', () => {
    const p = apple(`${P}    bouton "Parler"\n    quand l'utilisateur clique sur "Parler" :\n        dire "Bonjour"\n`);
    expect(p.lire('Essai/Pages/PageAccueil.swift')).toContain('Voix.dire("Bonjour")');
    expect(formes(p)).toContain('AVSpeechSynthesizer');
  });

  it('un widget qui vise une page à paramètre est refusé clairement', () => {
    const r = compiler(`widget "w" vers "produit" :\n    titre "W"\n${P}page "produit" avec parametre id :\n    titre "Produit {id}"\n`);
    const p = genererProjetApple(pourLaCible(r.application!, 'apple'), { nom: 'Essai', source: 'e' });
    expect(p.diagnostics.find((d) => d.gravite === 'erreur')?.message).toContain('attend un paramètre');
  });

  it('sans équipe, le groupe d’applications est dit', () => {
    const p = apple(`widget "w" :\n    titre "W"\n${P}`, null);
    expect(p.diagnostics.some((d) => d.gravite === 'avertissement' && d.message.includes('groupe d\'applications'))).toBe(true);
  });

  it('les icônes des formes acceptent les noms Humalis et Lucide', () => {
    expect(iconeForme('horloge')).toBe('clock');
    expect(iconeForme('user')).toBe('person');
    expect(iconeForme('inconnue')).toBe('circle');
  });

  it('le programme d’essai produit toutes les cibles', () => {
    const r = compiler(ESSAI);
    const p = genererProjetApple(pourLaCible(r.application!, 'apple'), { nom: 'Formes', source: 'formes.humalis', equipe: 'EQUIPE1234' });
    expect(p.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    for (const dossier of ['FormesWidgets', 'FormesPartage', 'FormesClavier1', 'FormesMontre', 'FormesTele', 'FormesClip']) {
      expect([...p.fichiers.keys()].some((f) => f.startsWith(`${dossier}/`)), dossier).toBe(true);
    }
  });
});
