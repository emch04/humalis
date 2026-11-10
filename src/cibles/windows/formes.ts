/**
 * Les formes d'application spéciales sur Windows (validées par Emch le 10 novembre 2026), sans paquet MSIX :
 * la zone de notification (« dans la barre du systeme »), la Jump List (« raccourcis de l'icone »), « Ouvrir avec »
 * (« quand on ouvre un fichier »), le lancement à l'ouverture de la session, les notifications avec boutons,
 * le clic droit de l'Explorateur, « Envoyer vers » (« quand on partage vers l'application ») et la tâche
 * planifiée de « en arriere plan ». Tout s'inscrit dans le registre de la personne (HKCU), au lancement.
 */
import type { Application, Ecran, Gestionnaire } from '../../ri/types.js';
import { Ecrivain } from '../web/ecrivain.js';
import { chaineCs } from './noms.js';
import { GenerateurBloc, quatreEspaces, type ContexteWindows } from './page.js';
import { INTERFACE_CS } from './bibliotheque/interface.js';
import { ICONES } from '../../vocabulaire/icones.js';

/** Les icônes que la bibliothèque C# sait dessiner (Segoe Fluent Icons), par leur nom. */
const GLYPHES = new Set([...INTERFACE_CS.matchAll(/\["([a-z-]+)"\] = "/g)].map((m) => m[1]));

/** « clock », « horloge », « heure » : le nom que la bibliothèque C# connaît, ou le nom tel quel. */
export function iconeWindows(nom: string): string {
  if (GLYPHES.has(nom)) return nom;
  const icone = ICONES.find((i) => i.nom === nom || i.lucide === nom || i.alias?.includes(nom));
  return [icone?.nom, ...(icone?.alias ?? [])].find((n): n is string => n !== undefined && GLYPHES.has(n)) ?? nom;
}

export interface FormesWindows {
  /** Les fichiers C# des formes (leurs corps, et la classe qui les aiguille). */
  fichiers: Map<string, string>;
  /** Vrai s'il y a au moins une forme : App.cs passe alors par FormesApplication. */
  actives: boolean;
  /** Une icône dans la zone de notification (WinForms NotifyIcon). */
  zone: boolean;
  /** Des notifications avec boutons (API de Windows 10 : un TargetFramework plus précis). */
  toasts: boolean;
  /** Les pages « dans la barre du systeme » : la page d'entrée de la fenêtre n'en est pas une. */
  pagesBarre: Set<string>;
}

/** Les gestionnaires « en arriere plan : » de toutes les pages. */
export const gestionnairesArrierePlan = (application: Application): Gestionnaire[] => application.ecrans.flatMap((e) => e.gestionnaires.filter((g) => g.declencheur === 'arrierePlan'));

export function formesWindows(application: Application, ctx: ContexteWindows, espace: string): FormesWindows {
  const f = application.formes;
  const fichiers = new Map<string, string>();
  const avertir = (ligne: number, message: string) => ctx.diagnostics.push({ gravite: 'avertissement', ligne, message });
  const pagesBarre = application.ecrans.filter((e) => e.barreSysteme);
  const fonds = gestionnairesArrierePlan(application);
  const menus = f?.menusClicDroit ?? [];
  const ouverts = f?.fichiersOuverts ?? [];
  const boutons = f?.boutonsNotification ?? [];
  const raccourcis = f?.raccourcisIcone ?? [];
  const demarrage = f?.demarrage;
  const partage = f?.partageRecu;
  const actives = pagesBarre.length > 0 || fonds.length > 0 || menus.length > 0 || ouverts.length > 0 || boutons.length > 0 || raccourcis.length > 0 || demarrage !== undefined || partage !== undefined;
  const zone = pagesBarre.length > 0 || demarrage?.discret === true;
  const toasts = boutons.length > 0;
  if (!actives) return { fichiers, actives, zone, toasts, pagesBarre: new Set() };

  /** Un corps de forme : une page dont le chargement porte les actions, et ses variables reçues du système. */
  const corps = (ecran: Ecran, classe: string, recues: string[] = []) => {
    const g = new GenerateurBloc(ecran, ctx, 'page', classe);
    for (const r of recues) g.depuisArguments.add(r);
    fichiers.set(`Formes/${classe}.cs`, g.generer(espace));
  };
  ouverts.forEach((o, i) => corps(o.ecran, `FormeFichier${i + 1}`, ['fichier']));
  menus.forEach((m, i) => corps(m.ecran, `FormeMenu${i + 1}`, ['fichier']));
  boutons.forEach((b, i) => corps(b.ecran, `FormeBouton${i + 1}`));
  if (partage) corps(partage.ecran, 'FormePartage', ['partage']);
  if (fonds.length > 0) {
    // Sans page ouverte : seules les variables partagées sont visibles.
    const avant = ctx.diagnostics.length;
    const ecran: Ecran = { nom: 'en arriere plan', etat: [], calculs: [], vue: [], gestionnaires: fonds.map((g) => ({ ...g, declencheur: 'chargement' as const })), ligne: fonds[0].ligne };
    corps(ecran, 'FormeArrierePlan');
    for (const d of ctx.diagnostics.slice(avant)) if (d.gravite === 'erreur') d.message = `${d.message.replace(/\.$/, '')} : « en arriere plan » ne voit que les variables partagées (avec partagee).`;
  }

  if (partage) avertir(partage.ligne, "sur Windows, le panneau « Partager » n'accepte que les applications empaquetées (MSIX), que Humalis ne produit pas encore : sans paquet, l'application reçoit les fichiers par « Envoyer vers » (clic droit dans l'Explorateur), et partage.texte et partage.lien restent vides sauf pour un fichier .txt ou un raccourci Internet (.url).");
  if (menus.length > 0) avertir(menus[0].ligne, "sur Windows 11, le menu du clic droit de l'Explorateur montre les commandes des applications non empaquetées (MSIX) sous « Afficher d'autres options » (ou Maj+F10) ; sur Windows 10, elles sont dans le menu directement.");
  if (toasts) avertir(boutons[0].ligne, "sur Windows, les notifications envoyées par le serveur n'arrivent pas encore (« activer notifications » n'y existe pas) : les boutons répondent aux notifications que l'application montre elle-même (essai : Application.exe --notification \"Titre\" \"Texte\" \"Accepter\").");

  // ─── La classe qui aiguille ──────────────────────────────────────────────
  const e = new Ecrivain();
  const extensionsOuvertes = [...new Set(ouverts.flatMap((o) => o.extensions))];
  e.ligne('// Produit par Humalis : les formes de l\'application sur Windows, et ce qui les lance.');
  e.ligne('using System;');
  e.ligne('using System.Collections.Generic;');
  e.ligne('using System.IO;');
  e.ligne('using System.Linq;');
  e.ligne('using System.Threading.Tasks;');
  e.ligne('using System.Windows;');
  e.ligne('using Humalis;');
  e.ligne();
  e.ligne(`namespace ${espace};`);
  e.ligne();
  e.ligne('public static class FormesApplication');
  e.ligne('{');
  e.indenter(() => {
    e.ligne('private static System.Windows.Application? application;');
    e.ligne('private static FenetrePrincipale? fenetre;');
    e.ligne('private static bool fenetreVue;');
    e.ligne('private static bool quitter;');
    if (zone) e.ligne('private static readonly List<ZoneNotification> zones = new();');
    e.ligne();
    e.ligne('/// <summary>Avant tout : « --desinstaller » retire ce que l\'application a inscrit ; un deuxième lancement passe ses arguments au premier.</summary>');
    e.ligne('public static bool Avant(string[] arguments)');
    e.ligne('{');
    e.indenter(() => {
      e.ligne('if (arguments.Contains("--desinstaller"))');
      e.ligne('{');
      e.indenter(() => {
        e.ligne('Installer(retirer: true);');
        e.ligne('return true;');
      });
      e.ligne('}');
      e.ligne('Integration.Identifier();');
      e.ligne('return !InstanceUnique.Premiere(arguments);');
    });
    e.ligne('}');
    e.ligne();
    e.ligne('/// <summary>L\'inscription dans Windows, refaite à chaque lancement (le chemin du .exe peut avoir changé).</summary>');
    e.ligne('public static void Installer(bool retirer = false)');
    e.ligne('{');
    e.indenter(() => {
      if (extensionsOuvertes.length) e.ligne(`Integration.AssocierExtensions(new[] { ${extensionsOuvertes.map(chaineCs).join(', ')} }, retirer);`);
      menus.forEach((m, i) => e.ligne(`Integration.MenuClicDroit(${i + 1}, ${chaineCs(m.titre)}, new[] { ${m.extensions.map(chaineCs).join(', ')} }, retirer);`));
      e.ligne(`Integration.LancerAuDemarrage(${demarrage ? '!retirer' : 'false'});`);
      if (toasts) e.ligne('Integration.Protocole(retirer);');
      if (partage) e.ligne('Integration.EnvoyerVers(retirer);');
      e.ligne(`Integration.TachePlanifiee(${fonds.length ? '!retirer' : 'false'});`);
    });
    e.ligne('}');
    e.ligne();
    e.ligne('/// <summary>Les lancements qui font une chose et s\'arrêtent, sans fenêtre : clic droit, bouton de notification, arrière-plan.</summary>');
    e.ligne('private static bool Ponctuel(string[] a) => a.Length > 0 && (a[0] == "--menu" || a[0] == "--arriere-plan" || a[0].StartsWith(Integration.Schema + ":notification", StringComparison.OrdinalIgnoreCase));');
    e.ligne();
    e.ligne('public static void Demarrer(System.Windows.Application app, FenetrePrincipale principale, string[] arguments)');
    e.ligne('{');
    e.indenter(() => {
      e.ligne('application = app;');
      e.ligne('fenetre = principale;');
      e.ligne('var ponctuel = Ponctuel(arguments);');
      e.ligne(`var discret = ${demarrage?.discret ? 'arguments.Contains("--demarrage")' : 'false'};`);
      e.ligne(`var avecZone = ${zone ? '!ponctuel' : 'false'};`);
      e.ligne('app.ShutdownMode = avecZone || ponctuel ? ShutdownMode.OnExplicitShutdown : ShutdownMode.OnMainWindowClose;');
      e.ligne('// Avec une icône dans la zone de notification, fermer la fenêtre la cache : « Quitter » arrête l\'application.');
      e.ligne('principale.Closing += (_, e) =>');
      e.ligne('{');
      e.indenter(() => {
        e.ligne('if (quitter || !avecZone) return;');
        e.ligne('e.Cancel = true;');
        e.ligne('principale.Hide();');
      });
      e.ligne('};');
      e.ligne('app.Startup += async (_, _) =>');
      e.ligne('{');
      e.indenter(() => {
        e.ligne('try { Installer(); } catch (Exception) { }');
        if (raccourcis.length) e.ligne(`try { Integration.RaccourcisIcone(new (string, string, string?)[] { ${raccourcis.map((r) => `(${chaineCs(r.titre)}, ${chaineCs(r.page)}, ${r.icone ? chaineCs(iconeWindows(r.icone)) : 'null'})`).join(', ')} }); } catch (Exception) { }`);
        if (zone) {
          e.ligne('if (avecZone)');
          e.ligne('{');
          e.indenter(() => {
            if (pagesBarre.length) for (const p of pagesBarre) e.ligne(`zones.Add(new ZoneNotification(Configuration.Nom, ${p.barreSysteme?.icone ? chaineCs(iconeWindows(p.barreSysteme.icone)) : 'null'}, () => Routeur.Fabrique(${chaineCs(p.nom)}, new Arguments()), MontrerFenetre, Quitter));`);
            else e.ligne('zones.Add(new ZoneNotification(Configuration.Nom, null, null, MontrerFenetre, Quitter));');
          });
          e.ligne('}');
        }
        const seulementBarre = pagesBarre.length > 0 && pagesBarre.length === application.ecrans.length;
        e.ligne(`if (!ponctuel && !discret${seulementBarre ? ' && false' : ''}) MontrerFenetre();`);
        e.ligne('InstanceUnique.Recu += async a => await Traiter(a, dejaLance: true);');
        e.ligne('await Traiter(arguments, dejaLance: false);');
        e.ligne('// Une forme qui change de page montre la fenêtre.');
        e.ligne('Routeur.Montrer += _ => MontrerFenetre();');
        e.ligne('if (ponctuel && !fenetreVue) app.Shutdown();');
      });
      e.ligne('};');
    });
    e.ligne('}');
    e.ligne();
    e.ligne('public static void MontrerFenetre()');
    e.ligne('{');
    e.indenter(() => {
      e.ligne('if (fenetre is null) return;');
      e.ligne('if (!fenetreVue && application is not null && application.ShutdownMode == ShutdownMode.OnExplicitShutdown && !' + (zone ? 'zones.Any()' : 'false') + ') application.ShutdownMode = ShutdownMode.OnMainWindowClose;');
      e.ligne('fenetreVue = true;');
      e.ligne('fenetre.Show();');
      e.ligne('if (fenetre.WindowState == WindowState.Minimized) fenetre.WindowState = WindowState.Normal;');
      e.ligne('fenetre.Activate();');
    });
    e.ligne('}');
    e.ligne();
    e.ligne('public static void Quitter()');
    e.ligne('{');
    e.indenter(() => {
      e.ligne('quitter = true;');
      if (zone) {
        e.ligne('foreach (var z in zones) z.Dispose();');
        e.ligne('zones.Clear();');
      }
      e.ligne('application?.Shutdown();');
    });
    e.ligne('}');
    e.ligne();
    e.ligne('/// <summary>Les arguments du lancement : ceux de Windows (fichier, clic droit, Jump List, protocole) et les essais.</summary>');
    e.ligne('public static async Task Traiter(string[] a, bool dejaLance)');
    e.ligne('{');
    e.indenter(() => {
      e.ligne('try');
      e.ligne('{');
      e.indenter(() => {
        e.ligne('Integration.Noter(a, dejaLance);');
        e.ligne('if (a.Length == 0 || (a.Length == 1 && a[0] == "--demarrage"))');
        e.ligne('{');
        e.indenter(() => e.ligne('if (dejaLance && a.Length == 0) MontrerFenetre();'));
        e.ligne('return;');
        e.ligne('}');
        e.ligne('var reste = a.Skip(1).ToArray();');
        e.ligne('switch (a[0])');
        e.ligne('{');
        e.indenter(() => {
          e.ligne('case "--page" when reste.Length > 0:');
          e.indenter(() => {
            e.ligne('MontrerFenetre();');
            e.ligne('Routeur.Aller(reste[0]);');
            e.ligne('return;');
          });
          e.ligne('case "--fichier":');
          e.indenter(() => {
            e.ligne('foreach (var chemin in reste) await OuvrirFichier(chemin);');
            e.ligne('return;');
          });
          if (menus.length) {
            e.ligne('case "--menu" when reste.Length > 1 && int.TryParse(reste[0], out var numero):');
            e.indenter(() => {
              e.ligne('foreach (var chemin in reste.Skip(1)) await Menu(numero, chemin);');
              e.ligne('return;');
            });
          }
          if (partage) {
            e.ligne('case "--partage":');
            e.indenter(() => {
              e.ligne('MontrerFenetre();');
              e.ligne('foreach (var chemin in reste) await Executer(new FormePartage(new Arguments { ["partage"] = FichePartage(chemin) }));');
              e.ligne('return;');
            });
          }
          if (fonds.length) {
            e.ligne('case "--arriere-plan":');
            e.indenter(() => {
              e.ligne('await Executer(new FormeArrierePlan(new Arguments()));');
              e.ligne('return;');
            });
          }
          if (toasts) {
            e.ligne('case "--notification" when reste.Length > 1:');
            e.indenter(() => {
              e.ligne('Toasts.Montrer(reste[0], reste[1], reste.Skip(2).Take(3).ToArray());');
              e.ligne('return;');
            });
          }
        });
        e.ligne('}');
        if (toasts) {
          e.ligne('var schema = Integration.Schema + ":";');
          e.ligne('if (a[0].StartsWith(schema, StringComparison.OrdinalIgnoreCase))');
          e.ligne('{');
          e.indenter(() => {
            e.ligne('var demande = a[0][schema.Length..].TrimStart(\'/\');');
            e.ligne('const string prefixe = "notification?bouton=";');
            e.ligne('if (demande.StartsWith(prefixe, StringComparison.OrdinalIgnoreCase)) await Bouton(Uri.UnescapeDataString(demande[prefixe.Length..]));');
            e.ligne('else MontrerFenetre();');
            e.ligne('return;');
          });
          e.ligne('}');
        }
        e.ligne('// Un fichier posé sur le .exe.');
        e.ligne('foreach (var chemin in a.Where(File.Exists)) await OuvrirFichier(chemin);');
      });
      e.ligne('}');
      e.ligne('catch (Exception erreur)');
      e.ligne('{');
      e.indenter(() => e.ligne('Messages.Afficher(erreur.Message, "erreur");'));
      e.ligne('}');
    });
    e.ligne('}');
    e.ligne();
    e.ligne('private static async Task Executer(PageHumalis forme)');
    e.ligne('{');
    e.indenter(() => {
      e.ligne('try { await forme.Charger(); }');
      e.ligne('catch (ErreurHumalis erreur) { Messages.Afficher(erreur.Message, "erreur"); }');
    });
    e.ligne('}');
    e.ligne();
    e.ligne('/// <summary>« fichier.nom », « fichier.type », « fichier.contenu » (le texte d\'un fichier texte, sinon vide) et « fichier.chemin ».</summary>');
    e.ligne('private static Fiche FicheFichier(string chemin)');
    e.ligne('{');
    e.indenter(() => {
      e.ligne('var fiche = Fichiers.FicheDe(chemin, true);');
      e.ligne('var mime = Fichiers.MimeDe(chemin);');
      e.ligne('var texte = mime.StartsWith("text/") || new[] { ".json", ".xml", ".md", ".csv", ".txt", ".html", ".htm", ".ics", ".vcf", ".log", ".ini" }.Contains(Path.GetExtension(chemin).ToLowerInvariant());');
      e.ligne('fiche["contenu"] = texte && new FileInfo(chemin).Length < 10_000_000 ? File.ReadAllText(chemin) : "";');
      e.ligne('return fiche;');
    });
    e.ligne('}');
    e.ligne();
    e.ligne('private static async Task OuvrirFichier(string chemin)');
    e.ligne('{');
    e.indenter(() => {
      e.ligne('if (!File.Exists(chemin)) return;');
      e.ligne('var extension = Path.GetExtension(chemin).ToLowerInvariant();');
      e.ligne('MontrerFenetre();');
      ouverts.forEach((o, i) => e.ligne(`if (new[] { ${o.extensions.map(chaineCs).join(', ')} }.Contains(extension)) { await Executer(new FormeFichier${i + 1}(new Arguments { ["fichier"] = FicheFichier(chemin) })); return; }`));
      e.ligne('Messages.Afficher($"{Configuration.Nom} n\'ouvre pas les fichiers {extension}.", "erreur");');
    });
    e.ligne('}');
    if (menus.length) {
      e.ligne();
      e.ligne('private static async Task Menu(int numero, string chemin)');
      e.ligne('{');
      e.indenter(() => {
        e.ligne('if (!File.Exists(chemin)) return;');
        e.ligne('var arguments = new Arguments { ["fichier"] = FicheFichier(chemin) };');
        e.ligne('switch (numero)');
        e.ligne('{');
        e.indenter(() => menus.forEach((_, i) => e.ligne(`case ${i + 1}: await Executer(new FormeMenu${i + 1}(arguments)); break;`)));
        e.ligne('}');
      });
      e.ligne('}');
    }
    if (toasts) {
      e.ligne();
      e.ligne('/// <summary>« quand l\'utilisateur touche "Accepter" dans une notification ».</summary>');
      e.ligne('private static async Task Bouton(string bouton)');
      e.ligne('{');
      e.indenter(() => {
        e.ligne('switch (bouton)');
        e.ligne('{');
        e.indenter(() => boutons.forEach((b, i) => e.ligne(`case ${chaineCs(b.bouton)}: await Executer(new FormeBouton${i + 1}(new Arguments())); break;`)));
        e.ligne('}');
      });
      e.ligne('}');
    }
    if (partage) {
      e.ligne();
      e.ligne('/// <summary>« partage.fichier » : le chemin ; « partage.texte » pour un fichier .txt ; « partage.lien » pour un raccourci Internet (.url).</summary>');
      e.ligne('private static Fiche FichePartage(string chemin)');
      e.ligne('{');
      e.indenter(() => {
        e.ligne('var extension = Path.GetExtension(chemin).ToLowerInvariant();');
        e.ligne('var texte = extension == ".txt" && File.Exists(chemin) ? File.ReadAllText(chemin) : "";');
        e.ligne('var lien = extension == ".url" && File.Exists(chemin) ? File.ReadLines(chemin).FirstOrDefault(l => l.StartsWith("URL=", StringComparison.OrdinalIgnoreCase))?[4..] ?? "" : "";');
        e.ligne('return V.FicheDe(("texte", texte), ("lien", lien), ("fichier", Path.GetFullPath(chemin)));');
      });
      e.ligne('}');
    }
  });
  e.ligne('}');
  fichiers.set('Formes.cs', quatreEspaces(e.texte()));
  return { fichiers, actives, zone, toasts, pagesBarre: new Set(pagesBarre.map((p) => p.nom)) };
}

