import { describe, it, expect } from 'vitest';
import { compiler } from '../../src/compilateur.js';
import { genererProjetWindows } from '../../src/cibles/windows/projet.js';
import { iconeWindows } from '../../src/cibles/windows/formes.js';
import { verifierFormesPourLaCible } from '../../src/cibles/formes.js';
import { verifierAppareilPourLaCible } from '../../src/cibles/appareil.js';
import { readFileSync } from 'node:fs';
import { pourLaCible } from '../../src/ri/plateforme.js';

const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const produire = (source: string) => genererProjetWindows(compile(source), { nom: 'essai', source: 'essai.humalis', identifiant: 'dev.exemple.essai' });
const projet = (source: string) => {
  const { fichiers, diagnostics } = produire(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return { fichiers, diagnostics };
};
const ACCUEIL = 'page "accueil" :\n    titre "Accueil"\n';

describe('cible Windows — les formes d’application', () => {
  it('une application sans forme ne change pas : pas d’instance unique ni d’inscription', () => {
    const { fichiers } = projet(ACCUEIL);
    expect(fichiers.has('Formes.cs')).toBe(false);
    expect(fichiers.has('Humalis/Formes.cs')).toBe(false);
    expect(fichiers.get('App.cs')).toContain('public static void Main()');
    expect(fichiers.get('App.cs')).toContain('fenetre.Show();');
    expect(fichiers.get('Essai.csproj')).not.toContain('UseWindowsForms');
  });

  it('toutes les formes prévues sur Windows y sont écrites : plus aucun refus', () => {
    const source = `raccourcis de l'icone :
    raccourci "Compte" vers "accueil"

quand on partage vers l'application :
    afficher partage.fichier

quand on ouvre un fichier ".csv" :
    afficher fichier.nom

lancer au demarrage de l'ordinateur

quand l'utilisateur touche "Accepter" dans une notification :
    afficher "ok"

menu clic droit "Noter" pour les fichiers ".jpg" :
    afficher fichier.nom

page "rapide" dans la barre du systeme :
    titre "Rapide"

${ACCUEIL}`;
    const erreurs = verifierFormesPourLaCible(compile(source), 'windows').filter((d) => d.gravite === 'erreur');
    expect(erreurs).toEqual([]);
  });

  it('les formes sans sens sur Windows (widget, tuile…) restent ignorées, dites une fois', () => {
    const d = verifierFormesPourLaCible(compile(`tuile "Pointer" :\n    afficher "x"\n\n${ACCUEIL}`), 'windows');
    expect(d).toHaveLength(1);
    expect(d[0].gravite).toBe('avertissement');
  });

  it('une seule instance : le lancement suivant passe ses arguments au premier, par un tube nommé', () => {
    const { fichiers } = projet(`lancer au demarrage de l'ordinateur\n\n${ACCUEIL}`);
    const app = fichiers.get('App.cs')!;
    expect(app).toContain('public static void Main(string[] arguments)');
    expect(app).toContain('if (FormesApplication.Avant(arguments)) return;');
    expect(app).toContain('FormesApplication.Demarrer(application, fenetre, arguments);');
    const bib = fichiers.get('Humalis/Formes.cs')!;
    expect(bib).toContain('new Mutex(true, @"Local\\Humalis-" + Configuration.Identifiant');
    expect(bib).toContain('NamedPipeServerStream(Tube, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.CurrentUserOnly)');
    expect(fichiers.get('Formes.cs')).toContain('if (arguments.Contains("--desinstaller"))');
    expect(fichiers.get('LISEZMOI.md')).toContain('Essai.exe --desinstaller');
    // Le lancement suivant laisse la fenêtre déjà ouverte passer devant ; chaque lancement reçu est noté.
    expect(bib).toContain('AllowSetForegroundWindow(-1);');
    expect(fichiers.get('Formes.cs')).toContain('Integration.Noter(a, dejaLance);');
    expect(bib).toContain('"lancements.txt"');
  });

  it('« dans la barre du systeme » : une icône dans la zone de notification, sa page dans une petite fenêtre, et Ouvrir / Quitter', () => {
    const { fichiers } = projet(`page "rapide" dans la barre du systeme avec icone "clock" :\n    titre "Rapide"\n\n${ACCUEIL}`);
    const formes = fichiers.get('Formes.cs')!;
    expect(formes).toContain('zones.Add(new ZoneNotification(Configuration.Nom, "horloge", () => Routeur.Fabrique("rapide", new Arguments()), MontrerFenetre, Quitter));');
    expect(formes).toContain('ShutdownMode.OnExplicitShutdown');
    expect(formes).toContain('principale.Hide();');
    const zone = fichiers.get('Humalis/Zone.cs')!;
    expect(zone).toContain('new System.Windows.Forms.NotifyIcon');
    expect(zone).toContain('menu.Items.Add("Ouvrir " + Configuration.Nom');
    expect(zone).toContain('menu.Items.Add("Quitter"');
    expect(zone).toContain('WindowStyle = WindowStyle.None');
    expect(fichiers.get('Essai.csproj')).toContain('<UseWindowsForms>true</UseWindowsForms>');
    // La page d'entrée de la fenêtre n'est pas celle de la zone de notification.
    expect(fichiers.get('Pages.cs')).toContain('public const string Entree = "accueil";');
  });

  it('une application faite seulement d’une page dans la zone de notification ne montre pas de fenêtre au lancement', () => {
    const { fichiers } = projet('page "rapide" dans la barre du systeme :\n    titre "Rapide"\n');
    expect(fichiers.get('Formes.cs')).toContain('if (!ponctuel && !discret && false) MontrerFenetre();');
  });

  it('les icônes s’écrivent en français ou avec le nom de Lucide', () => {
    expect(iconeWindows('clock')).toBe('horloge');
    expect(iconeWindows('horloge')).toBe('horloge');
    expect(iconeWindows('user')).toBe('utilisateur');
    expect(iconeWindows('inconnue')).toBe('inconnue');
  });

  it('« raccourcis de l’icone » : la Jump List de la barre des tâches, qui ouvre chaque page', () => {
    const { fichiers } = projet(`raccourcis de l'icone :\n    raccourci "Mon compte" vers "accueil" avec icone "user"\n    raccourci "Aide" vers "accueil"\n\n${ACCUEIL}`);
    expect(fichiers.get('Formes.cs')).toContain('Integration.RaccourcisIcone(new (string, string, string?)[] { ("Mon compte", "accueil", "utilisateur"), ("Aide", "accueil", null) });');
    expect(fichiers.get('Formes.cs')).toContain('case "--page" when reste.Length > 0:');
    const bib = fichiers.get('Humalis/Formes.cs')!;
    expect(bib).toContain('new System.Windows.Shell.JumpTask');
    expect(bib).toContain('Arguments = "--page " + Q(page)');
  });

  it('« quand on ouvre un fichier » : « Ouvrir avec » pour chaque extension, et fichier.nom, fichier.type, fichier.contenu', () => {
    const { fichiers } = projet(`quand on ouvre un fichier ".csv" ou ".txt" :\n    afficher fichier.contenu\n\nquand on ouvre un fichier ".pdf" :\n    afficher fichier.nom\n\n${ACCUEIL}`);
    const formes = fichiers.get('Formes.cs')!;
    expect(formes).toContain('Integration.AssocierExtensions(new[] { ".csv", ".txt", ".pdf" }, retirer);');
    expect(formes).toContain('if (new[] { ".csv", ".txt" }.Contains(extension)) { await Executer(new FormeFichier1(new Arguments { ["fichier"] = FicheFichier(chemin) })); return; }');
    expect(formes).toContain('if (new[] { ".pdf" }.Contains(extension)) { await Executer(new FormeFichier2(');
    expect(formes).toContain('fiche["contenu"] =');
    expect(fichiers.get('Formes/FormeFichier1.cs')).toContain('fichier = new Signal(arguments.Lire("fichier") ?? V.FicheDe(("nom", ""), ("type", ""), ("contenu", "")));');
    const bib = fichiers.get('Humalis/Formes.cs')!;
    expect(bib).toContain('@"\\OpenWithProgids", progId, ""');
    expect(bib).toContain('" --fichier \\"%1\\""');
  });

  it('« lancer au demarrage de l’ordinateur avec discret » : la clé Run, et un démarrage dans la zone de notification', () => {
    const { fichiers } = projet(`lancer au demarrage de l'ordinateur avec discret\n\n${ACCUEIL}`);
    const formes = fichiers.get('Formes.cs')!;
    expect(formes).toContain('Integration.LancerAuDemarrage(!retirer);');
    expect(formes).toContain('var discret = arguments.Contains("--demarrage");');
    expect(formes).toContain('zones.Add(new ZoneNotification(Configuration.Nom, null, null, MontrerFenetre, Quitter));');
    expect(fichiers.get('Humalis/Formes.cs')).toContain('@"Software\\Microsoft\\Windows\\CurrentVersion\\Run"');
    // Sans « avec discret » : la fenêtre s'ouvre, pas d'icône.
    const simple = projet(`lancer au demarrage de l'ordinateur\n\n${ACCUEIL}`).fichiers;
    expect(simple.get('Formes.cs')).toContain('var discret = false;');
    expect(simple.has('Humalis/Zone.cs')).toBe(false);
  });

  it('les boutons d’une notification : un toast de Windows, et chaque bouton relance l’application par son protocole', () => {
    const { fichiers, diagnostics } = projet(`quand l'utilisateur touche "Accepter" dans une notification :\n    afficher "Accepté"\n\nquand l'utilisateur touche "Refuser" dans une notification :\n    afficher "Refusé"\n\n${ACCUEIL}`);
    const formes = fichiers.get('Formes.cs')!;
    expect(formes).toContain('case "Accepter": await Executer(new FormeBouton1(new Arguments())); break;');
    expect(formes).toContain('case "Refuser": await Executer(new FormeBouton2(new Arguments())); break;');
    expect(formes).toContain('Integration.Protocole(retirer);');
    expect(formes).toContain('const string prefixe = "notification?bouton=";');
    const toasts = fichiers.get('Humalis/Toasts.cs')!;
    expect(toasts).toContain('activationType=\\"protocol\\" arguments=\\"');
    expect(toasts).toContain('ToastNotificationManager.CreateToastNotifier(Integration.Aumid)');
    const csproj = fichiers.get('Essai.csproj')!;
    expect(csproj).toContain('<TargetFramework>net10.0-windows10.0.19041.0</TargetFramework>');
    expect(csproj).toContain('<SupportedOSPlatformVersion>10.0.17763.0</SupportedOSPlatformVersion>');
    expect(diagnostics.some((d) => d.message.includes('« activer notifications » n\'y existe pas'))).toBe(true);
  });

  it('« menu clic droit » : les clés de l’Explorateur pour ces extensions, et la limite de Windows 11 dite', () => {
    const { fichiers, diagnostics } = projet(`menu clic droit "Noter" pour les fichiers ".jpg" et ".png" :\n    afficher fichier.nom\n\n${ACCUEIL}`);
    expect(fichiers.get('Formes.cs')).toContain('Integration.MenuClicDroit(1, "Noter", new[] { ".jpg", ".png" }, retirer);');
    expect(fichiers.get('Formes.cs')).toContain('case 1: await Executer(new FormeMenu1(arguments)); break;');
    expect(fichiers.get('Humalis/Formes.cs')).toContain('@"Software\\Classes\\SystemFileAssociations\\" + ext + @"\\shell\\"');
    expect(diagnostics.some((d) => d.message.includes('« Afficher d\'autres options »'))).toBe(true);
  });

  it('« quand on partage vers l’application » : « Envoyer vers » sans MSIX, et l’empaquetage dit clairement', () => {
    const { fichiers, diagnostics } = projet(`quand on partage vers l'application :\n    afficher partage.fichier\n\n${ACCUEIL}`);
    expect(fichiers.get('Formes.cs')).toContain('Integration.EnvoyerVers(retirer);');
    expect(fichiers.get('Formes.cs')).toContain('new FormePartage(new Arguments { ["partage"] = FichePartage(chemin) })');
    expect(fichiers.get('Formes/FormePartage.cs')).toContain('arguments.Lire("partage")');
    expect(fichiers.get('Humalis/Formes.cs')).toContain('Environment.SpecialFolder.SendTo');
    expect(diagnostics.some((d) => d.gravite === 'avertissement' && d.message.includes('(MSIX)') && d.message.includes('« Envoyer vers »'))).toBe(true);
  });

  it('« en arriere plan : » sur Windows : une tâche planifiée qui lance l’application sans fenêtre', () => {
    const source = 'variable reveils = 0 avec partagee\n\npage "accueil" :\n    titre "A"\n    en arriere plan :\n        changer reveils par reveils + 1\n';
    expect(verifierAppareilPourLaCible(compile(source), 'windows')).toEqual([]);
    const { fichiers } = projet(source);
    expect(fichiers.get('Formes/FormeArrierePlan.cs')).toContain('Partage.reveils.Ecrire(V.Plus(Partage.reveils.Lire(), 1d));');
    expect(fichiers.get('Formes.cs')).toContain('Integration.TachePlanifiee(!retirer);');
    expect(fichiers.get('Formes.cs')).toContain('a[0] == "--arriere-plan"');
    expect(fichiers.get('Humalis/Formes.cs')).toContain('"/SC", "MINUTE", "/MO", "15"');
    // La page elle-même n'a pas de méthode d'arrière-plan.
    expect(fichiers.get('Pages/PageAccueil.cs')).not.toContain('EnArrierePlan');
  });

  it('« en arriere plan » ne voit que les variables partagées', () => {
    const { diagnostics } = produire('page "accueil" :\n    variable x = 0\n    titre "A"\n    en arriere plan :\n        changer x par 1\n');
    expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message).join('\n')).toContain('ne voit que les variables partagées');
  });

  it('« en arriere plan » reste refusé sur le web et le bureau', () => {
    const source = 'variable n = 0 avec partagee\n\npage "accueil" :\n    titre "A"\n    en arriere plan :\n        changer n par 1\n';
    expect(verifierAppareilPourLaCible(compile(source), 'desktop').map((d) => d.message).join('\n')).toContain('Apple, Android et Windows');
  });

  it('tests/formes/toutes.humalis se compile sur Windows : les formes sans sens et leurs actions (« commencer activite », « dire ») sont ignorées', () => {
    const application = pourLaCible(compile(readFileSync('tests/formes/toutes.humalis', 'utf8')), 'windows');
    const erreurs = [...verifierFormesPourLaCible(application, 'windows'), ...verifierAppareilPourLaCible(application, 'windows')].filter((d) => d.gravite === 'erreur');
    expect(erreurs).toEqual([]);
    const { fichiers, diagnostics } = genererProjetWindows(application, { nom: 'toutes', source: 'toutes.humalis' });
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect([...fichiers.values()].join('\n')).toContain('// « commencer activite "livraison" » : pas d\'activité en direct sur Windows.');
  });
});
