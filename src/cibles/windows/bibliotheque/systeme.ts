/**
 * Ce qui entoure les pages : la fenêtre, la navigation, le thème, les messages, les
 * minuteries, la mémoire de l'appareil (chiffrée par Windows pour les secrets), le serveur
 * Humalis et la session.
 */
export const SYSTEME_CS = String.raw`// Produit par Humalis : la fenêtre, la navigation, le thème, les messages et la mémoire.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;

namespace Humalis;

/// <summary>Les réglages écrits par le compilateur au démarrage (App.cs).</summary>
public static class Configuration
{
    public static string Nom = "Application";
    public static string Serveur = "http://localhost:3000";
    /// <summary>Le dossier des données de l'application, dans %LOCALAPPDATA%.</summary>
    public static string Identifiant = "humalis.application";
    public static string ModeDepart = "automatique";
    public static double LargeurContenu = 960;
}

/// <summary>Le thème : clair, sombre ou celui de Windows ; le choix de la personne est gardé.</summary>
public static class Apparence
{
    public static readonly Signal Mode = new(Memoire.Lire("humalis:theme") as string ?? Configuration.ModeDepart);

    public static bool Sombre
    {
        get
        {
            var mode = Mode.Lire() as string;
            if (mode == "sombre") return true;
            if (mode == "clair") return false;
            try
            {
                using var cle = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
                return cle?.GetValue("AppsUseLightTheme") is int clair && clair == 0;
            }
            catch (Exception) { return false; }
        }
    }

#pragma warning disable WPF0001
    public static void Appliquer()
    {
        if (System.Windows.Application.Current is not { } app) return;
        app.ThemeMode = (Mode.Valeur as string) switch { "sombre" => ThemeMode.Dark, "clair" => ThemeMode.Light, _ => ThemeMode.System };
    }
#pragma warning restore WPF0001

    /// <summary>« changer theme par sombre » ; « bascule » passe de l'un à l'autre.</summary>
    public static void Definir(string mode)
    {
        var nouveau = mode == "bascule" ? (Sombre ? "clair" : "sombre") : mode;
        Mode.Ecrire(nouveau);
        Memoire.Ecrire("humalis:theme", nouveau);
        Appliquer();
        Routeur.Redessiner();
    }

    private static readonly Dictionary<string, SolidColorBrush> pinceaux = new();

    public static SolidColorBrush Pinceau(string hexa)
    {
        if (pinceaux.TryGetValue(hexa, out var p)) return p;
        try { p = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hexa)); }
        catch (Exception) { p = new SolidColorBrush(Colors.Transparent); }
        p.Freeze();
        pinceaux[hexa] = p;
        return p;
    }

    /// <summary>« avec degrade bleu-violet-horizontal ».</summary>
    public static Brush Degrade(Brush de, Brush vers, string direction)
    {
        var a = (de as SolidColorBrush)?.Color ?? Colors.Transparent;
        var b = (vers as SolidColorBrush)?.Color ?? Colors.Transparent;
        var fin = direction switch { "horizontal" => new Point(1, 0), "vertical" => new Point(0, 1), _ => new Point(1, 1) };
        return new LinearGradientBrush(a, b, new Point(0, 0), fin);
    }

    /// <summary>Une couleur du thème, dans le mode actuel.</summary>
    public static Brush Choisir(string clair, string sombre) => Pinceau(Sombre ? sombre : clair);

    private static Brush Ressource(string nom, string defaut) => System.Windows.Application.Current?.TryFindResource(nom) as Brush ?? Pinceau(defaut);

    public static Brush Accent => Ressource("AccentFillColorDefaultBrush", "#0067C0");
    public static Brush FondDiscret => Ressource("CardBackgroundFillColorDefaultBrush", Sombre ? "#2B2B2B" : "#F3F3F3");
    public static Brush FondCarte => Ressource("CardBackgroundFillColorDefaultBrush", Sombre ? "#2B2B2B" : "#FFFFFF");
    public static Brush BordureCarte => Ressource("CardStrokeColorDefaultBrush", Sombre ? "#3A3A3A" : "#E5E5E5");
}

/// <summary>Les messages qui apparaissent en bas de la fenêtre, et les questions Oui / Non.</summary>
public static class Messages
{
    internal static Panel? Zone;

    public static void Afficher(string texte, string genre = "info", double millisecondes = 4000, bool persistant = false, string? libelle = null, Func<Task>? action = null)
    {
        if (Zone is null) { MessageBox.Show(texte, Configuration.Nom); return; }
        var couleur = genre switch { "erreur" => "#C42B1C", "reussite" => "#0F7B0F", "avertissement" => "#9D5D00", _ => "#005FB8" };
        var ligne = new DockPanel { LastChildFill = true };
        var fermer = new Button { Content = Icones.Element("fermer", 10), Padding = new Thickness(6), Margin = new Thickness(8, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center };
        AutomationProperties.SetName(fermer, "Fermer");
        DockPanel.SetDock(fermer, Dock.Right);
        ligne.Children.Add(fermer);
        if (libelle is not null && action is not null)
        {
            var bouton = new Button { Content = libelle, Margin = new Thickness(8, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center };
            DockPanel.SetDock(bouton, Dock.Right);
            ligne.Children.Add(bouton);
            bouton.Click += (_, _) => UI.Lancer(action);
        }
        var t = new TextBlock { Text = texte, TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center };
        ligne.Children.Add(t);
        var carte = new Border
        {
            Child = ligne, Padding = new Thickness(12, 8, 8, 8), Margin = new Thickness(0, 8, 0, 0), CornerRadius = new CornerRadius(8),
            Background = Apparence.FondCarte, BorderBrush = Apparence.Pinceau(couleur), BorderThickness = new Thickness(4, 1, 1, 1), MaxWidth = 420,
        };
        AutomationProperties.SetLiveSetting(carte, genre == "erreur" ? AutomationLiveSetting.Assertive : AutomationLiveSetting.Polite);
        Zone.Children.Add(carte);
        void Retirer() => Zone?.Children.Remove(carte);
        fermer.Click += (_, _) => Retirer();
        if (!persistant)
        {
            var minuterie = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(millisecondes) };
            minuterie.Tick += (_, _) => { minuterie.Stop(); Retirer(); };
            minuterie.Start();
        }
    }

    /// <summary>« confirmer "…" » : une question, deux boutons.</summary>
    public static Task<bool> Confirmer(string question, string oui = "Oui", string non = "Non")
    {
        var fenetre = new Window
        {
            Title = Configuration.Nom, SizeToContent = SizeToContent.WidthAndHeight, ResizeMode = ResizeMode.NoResize,
            WindowStartupLocation = WindowStartupLocation.CenterOwner, Owner = System.Windows.Application.Current?.MainWindow, ShowInTaskbar = false,
        };
        var pile = new PileHumalis { Ecart = 16, Margin = new Thickness(24), MaxWidth = 420 };
        pile.Children.Add(new TextBlock { Text = question, TextWrapping = TextWrapping.Wrap });
        var boutons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        var bNon = new Button { Content = non, Padding = new Thickness(16, 6, 16, 6), IsCancel = true };
        var bOui = new Button { Content = oui, Padding = new Thickness(16, 6, 16, 6), Margin = new Thickness(8, 0, 0, 0), IsDefault = true };
        bOui.SetResourceReference(FrameworkElement.StyleProperty, "AccentButtonStyle");
        bOui.Click += (_, _) => fenetre.DialogResult = true;
        boutons.Children.Add(bNon);
        boutons.Children.Add(bOui);
        pile.Children.Add(boutons);
        fenetre.Content = pile;
        return Task.FromResult(fenetre.ShowDialog() == true);
    }

    /// <summary>« copier … » : le presse-papiers, puis un message.</summary>
    public static void Copier(string texte, string? message)
    {
        try { Clipboard.SetText(texte); }
        catch (Exception) { Afficher("Le presse-papiers n'est pas disponible.", "erreur"); return; }
        if (message is not null) Afficher(message, "reussite");
    }

    /// <summary>« telecharger … en csv » : la personne choisit où enregistrer le fichier.</summary>
    public static Task TelechargerCsv(object? liste, string fichier)
    {
        var choix = new Microsoft.Win32.SaveFileDialog { FileName = fichier, Filter = "Fichier CSV|*.csv" };
        if (choix.ShowDialog() == true) File.WriteAllText(choix.FileName, V.EnCsv(liste), new UTF8Encoding(true));
        return Task.CompletedTask;
    }
}

/// <summary>« apres 3 secondes : », « toutes les 5 secondes : » ; arrêtées quand la page est quittée.</summary>
public sealed class Minuterie : IDisposable
{
    private readonly DispatcherTimer minuterie;

    private Minuterie(double millisecondes, bool repete, Func<Task> action, Func<bool>? tantQue)
    {
        minuterie = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(Math.Max(1, millisecondes)) };
        minuterie.Tick += (_, _) =>
        {
            if (!repete) minuterie.Stop();
            if (tantQue is not null && !tantQue()) return;
            UI.Lancer(action);
        };
        minuterie.Start();
    }

    public static Minuterie Apres(double millisecondes, Func<Task> action, Func<bool>? tantQue = null) => new(millisecondes, false, action, tantQue);
    public static Minuterie Toutes(double millisecondes, Func<Task> action, Func<bool>? tantQue = null) => new(millisecondes, true, action, tantQue);

    public void Arreter() => minuterie.Stop();
    public void Dispose() => minuterie.Stop();
}

/// <summary>Les valeurs données à une page (« avec id p.id ») ou lues dans son adresse.</summary>
public sealed class Arguments : Dictionary<string, object?>
{
    public object? Lire(string nom) => TryGetValue(nom, out var v) ? v : null;
}

/// <summary>L'état de la requête qui remplit une variable : en chargement, en erreur, introuvable.</summary>
public sealed class EtatRequete
{
    public readonly Signal Statut = new("repos");
    public readonly Signal Message = new("");
    public bool Est(string statut) => (Statut.Lire() as string) == statut;

    public void Changer(string statut, string message = "")
    {
        Effet.Lot(() =>
        {
            Statut.Ecrire(statut);
            Message.Ecrire(message);
        });
    }
}

/// <summary>Ce qu'une page et un composant ont en commun : l'affichage, le chargement, les minuteries, les fenêtres.</summary>
public abstract class BlocHumalis
{
    public abstract FrameworkElement Construire();
    public virtual Task Charger() => Task.CompletedTask;
    /// <summary>« appuie sur "controle+k" » : vrai si la touche a servi.</summary>
    public virtual bool Touche(string touches) => false;
    /// <summary>« quand l'utilisateur arrive en bas de » : le bas de la page est visible.</summary>
    public virtual Task EnBas() => Task.CompletedTask;

    protected readonly List<IDisposable> aArreter = new();
    private readonly Dictionary<string, Signal> visibilite = new();
    private readonly Dictionary<string, Signal> textes = new();
    private readonly Dictionary<string, EtatRequete> etats = new();
    protected readonly Dictionary<string, Func<Task>> relances = new();

    public void Quitter()
    {
        foreach (var d in aArreter) d.Dispose();
        aArreter.Clear();
    }

    protected void Arreter(IDisposable d) => aArreter.Add(d);

    protected Signal Visibilite(string id, bool depart = true)
    {
        if (!visibilite.TryGetValue(id, out var s)) visibilite[id] = s = new Signal(depart);
        return s;
    }

    protected bool EstVisible(string id, bool depart = true) => V.B(Visibilite(id, depart).Lire());

    /// <summary>« changer texte de "x" par … » : le texte écrit remplace celui de la page.</summary>
    protected string TexteDe(string id, Func<string> original)
    {
        if (!textes.TryGetValue(id, out var s)) textes[id] = s = new Signal();
        return s.Lire() is string t ? t : original();
    }

    protected void ChangerTexte(string id, string texte)
    {
        if (!textes.TryGetValue(id, out var s)) textes[id] = s = new Signal();
        s.Ecrire(texte);
    }

    protected EtatRequete Etat(string variable)
    {
        if (!etats.TryGetValue(variable, out var e)) etats[variable] = e = new EtatRequete();
        return e;
    }

    protected Task Recharger(string variable) => relances.TryGetValue(variable, out var relance) ? relance() : Task.CompletedTask;

    private readonly Dictionary<string, int> jetons = new();

    /// <summary>Chaque requête reçoit un numéro : une réponse arrivée après une plus récente ne remplace rien.</summary>
    protected int Jeton(string variable)
    {
        jetons[variable] = jetons.GetValueOrDefault(variable) + 1;
        return jetons[variable];
    }

    protected bool EstDernier(string variable, int jeton) => jetons.GetValueOrDefault(variable) == jeton;

    /// <summary>Une fenêtre (« fenetre "Détails" : ») posée sur la page, ouverte par « montrer ».</summary>
    protected FrameworkElement Fenetre(string id, string titre, Func<UIElement?> corps, bool obligatoire = false)
    {
        var place = new Border { Visibility = Visibility.Collapsed };
        Border? voile = null;
        new Effet(() =>
        {
            var ouverte = EstVisible(id, false);
            if (ouverte && voile is null)
            {
                var carte = new Border
                {
                    Background = Apparence.FondCarte, CornerRadius = new CornerRadius(8), Padding = new Thickness(24), MaxWidth = 560, MinWidth = 320,
                    HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, BorderBrush = Apparence.BordureCarte, BorderThickness = new Thickness(1),
                };
                var pile = new PileHumalis { Ecart = 16 };
                var entete = new DockPanel();
                if (!obligatoire)
                {
                    var fermer = new Button { Content = Icones.Element("fermer", 12), Padding = new Thickness(8) };
                    AutomationProperties.SetName(fermer, "Fermer");
                    fermer.Click += (_, _) => Visibilite(id, false).Ecrire(false);
                    DockPanel.SetDock(fermer, Dock.Right);
                    entete.Children.Add(fermer);
                }
                entete.Children.Add(new TextBlock { Text = titre, FontSize = 20, FontWeight = FontWeights.SemiBold, VerticalAlignment = VerticalAlignment.Center });
                pile.Children.Add(entete);
                pile.Children.Add(Effet.SansSuivre(() => UI.Zone(corps)));
                carte.Child = new ScrollViewer { Content = pile, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, MaxHeight = 640 };
                AutomationProperties.SetName(carte, titre);
                voile = new Border { Background = new SolidColorBrush(Color.FromArgb(0x80, 0, 0, 0)), Child = carte };
                if (!obligatoire) voile.MouseLeftButtonDown += (_, e) => { if (e.OriginalSource == voile) Visibilite(id, false).Ecrire(false); };
                FenetrePrincipale.Courante?.Couche.Children.Add(voile);
            }
            else if (!ouverte && voile is not null)
            {
                FenetrePrincipale.Courante?.Couche.Children.Remove(voile);
                voile = null;
            }
        });
        aArreter.Add(new Fermeture(() => { if (voile is not null) FenetrePrincipale.Courante?.Couche.Children.Remove(voile); voile = null; }));
        return place;
    }

}

/// <summary>Une action faite en quittant (fermer une fenêtre, arrêter un composant).</summary>
public sealed class Fermeture(Action action) : IDisposable
{
    public void Dispose() => action();
}

/// <summary>Une page Humalis : ce qu'elle affiche, ce qu'elle fait au chargement, ce qu'elle arrête en partant.</summary>
public abstract class PageHumalis : BlocHumalis
{
    public abstract string Nom { get; }
    public virtual string Titre => Configuration.Nom;
    /// <summary>« connecte », « admin » ou « role:gerant,vendeur » ; null pour une page ouverte à tous.</summary>
    public virtual string? Reservee => null;
    public virtual string? Sinon => null;
    public virtual bool SansEntete => false;
    public virtual bool SansPied => false;
}

/// <summary>Un composant écrit en Humalis : il se monte dans la page, et s'arrête avec la partie qui le contient.</summary>
public abstract class ComposantHumalis : BlocHumalis
{
    public FrameworkElement Monter()
    {
        var element = Effet.SansSuivre(Construire);
        Effet.Attacher(new Fermeture(Quitter));
        Effet.SansSuivre(() => { UI.Lancer(Charger); return 0; });
        return element;
    }
}

/// <summary>« quand on arrete d'ecrire dans » : l'action part après un temps sans frappe.</summary>
public sealed class Pause : IDisposable
{
    private readonly DispatcherTimer minuterie;

    public Pause(double millisecondes, Func<Task> action)
    {
        minuterie = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(Math.Max(1, millisecondes)) };
        minuterie.Tick += (_, _) => { minuterie.Stop(); UI.Lancer(action); };
    }

    public void Relancer()
    {
        minuterie.Stop();
        minuterie.Start();
    }

    public void Dispose() => minuterie.Stop();
}

/// <summary>La navigation : une page à la fois, avec un historique et le bouton Retour.</summary>
public static class Routeur
{
    public static Func<string, Arguments, PageHumalis?> Fabrique = (_, _) => null;
    public static Func<string, (string nom, Arguments arguments)?> ParAdresse = _ => null;
    public static readonly Signal PeutRevenir = new(false);
    public static PageHumalis? Page { get; private set; }
    public static event Action<PageHumalis>? Montrer;

    private static readonly List<(string nom, Arguments arguments)> historique = new();
    private static (string nom, Arguments arguments)? actuelle;

    public static void Aller(string nom, Arguments? arguments = null)
    {
        if (actuelle is not null) historique.Add(actuelle.Value);
        Ouvrir(nom, arguments ?? new Arguments());
    }

    /// <summary>La page réservée qu'on voulait ouvrir avant de se connecter.</summary>
    private static (string nom, Arguments arguments)? voulue;

    /// <summary>« continuer vers "accueil" » : la page voulue avant la connexion, sinon celle-ci.</summary>
    public static void Continuer(string nom, Arguments? arguments = null)
    {
        if (voulue is { } page)
        {
            voulue = null;
            Aller(page.nom, page.arguments);
        }
        else Aller(nom, arguments);
    }

    /// <summary>Un lien vers une page : la navigation, comme une action qui attend.</summary>
    public static Task AllerVers(string nom, Arguments? arguments = null)
    {
        Aller(nom, arguments);
        return Task.CompletedTask;
    }

    /// <summary>« lien … vers variable » : une adresse externe s'ouvre dans le navigateur, une adresse du site ouvre sa page.</summary>
    public static Task AllerAdresse(string adresse)
    {
        var propre = adresse.Trim();
        if (propre.Contains(':')) return UI.OuvrirExterne(propre);
        if (ParAdresse(propre) is { } trouvee) Aller(trouvee.nom, trouvee.arguments);
        else Aller(propre.Trim('/'));
        return Task.CompletedTask;
    }

    /// <summary>« revenir » : la page d'avant, ou « sinon » s'il n'y en a pas.</summary>
    public static void Revenir(string? sinon = null)
    {
        if (historique.Count == 0)
        {
            if (sinon is not null) Ouvrir(sinon, new Arguments());
            return;
        }
        var avant = historique[^1];
        historique.RemoveAt(historique.Count - 1);
        Ouvrir(avant.nom, avant.arguments);
    }

    /// <summary>Redessine la page actuelle (après un changement de thème).</summary>
    public static void Redessiner()
    {
        if (Page is not null) Montrer?.Invoke(Page);
    }

    private static async void Ouvrir(string nom, Arguments arguments)
    {
        var page = Fabrique(nom, arguments);
        if (page is null)
        {
            Messages.Afficher($"La page « {nom} » n'existe pas.", "erreur");
            return;
        }
        if (page.Reservee is { } qui)
        {
            await Session.Attendre();
            if (!Session.Autorise(qui))
            {
                voulue = (nom, arguments);
                if (page.Sinon is { } sinon && sinon != nom) Ouvrir(sinon, new Arguments());
                return;
            }
        }
        Page?.Quitter();
        actuelle = (nom, arguments);
        PeutRevenir.Ecrire(historique.Count > 0);
        Page = page;
        Montrer?.Invoke(page);
        UI.Lancer(page.Charger);
    }
}

/// <summary>La fenêtre de l'application : l'en-tête, la page, le pied, les fenêtres posées dessus et les messages.</summary>
public sealed class FenetrePrincipale : Window
{
    public static FenetrePrincipale? Courante { get; private set; }

    public readonly Grid Couche = new();
    private readonly ContentControl entete = new() { Focusable = false, IsTabStop = false, HorizontalContentAlignment = HorizontalAlignment.Stretch };
    private readonly ContentControl pied = new() { Focusable = false, IsTabStop = false, HorizontalContentAlignment = HorizontalAlignment.Stretch };
    private readonly ContentControl contenu = new() { Focusable = false, IsTabStop = false, HorizontalContentAlignment = HorizontalAlignment.Stretch };
    private readonly ScrollViewer defilement = new() { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };
    private readonly Func<FrameworkElement?>? construireEntete;
    private readonly Func<FrameworkElement?>? construireP;

    public FenetrePrincipale(Func<FrameworkElement?>? construireEntete = null, Func<FrameworkElement?>? construirePied = null)
    {
        Courante = this;
        this.construireEntete = construireEntete;
        construireP = construirePied;
        Title = Configuration.Nom;
        Width = 1100;
        Height = 760;
        MinWidth = 360;
        MinHeight = 320;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;

        var racine = new Grid();
        var barre = new DockPanel { Margin = new Thickness(8, 8, 8, 0) };
        var retour = new Button { Content = Icones.Element("retour", 14), Padding = new Thickness(10, 6, 10, 6), ToolTip = "Revenir (Alt+←)" };
        AutomationProperties.SetName(retour, "Revenir");
        AutomationProperties.SetAutomationId(retour, "humalis_revenir");
        retour.Click += (_, _) => Routeur.Revenir();
        new Effet(() => retour.Visibility = V.B(Routeur.PeutRevenir.Lire()) ? Visibility.Visible : Visibility.Collapsed);
        DockPanel.SetDock(retour, Dock.Left);
        barre.Children.Add(retour);
        barre.Children.Add(entete);

        var page = new DockPanel();
        DockPanel.SetDock(barre, Dock.Top);
        page.Children.Add(barre);
        DockPanel.SetDock(pied, Dock.Bottom);
        page.Children.Add(pied);
        var cadre = new Border { Padding = new Thickness(24), MaxWidth = Configuration.LargeurContenu + 48, Child = contenu };
        defilement.Content = cadre;
        page.Children.Add(defilement);
        racine.Children.Add(page);
        racine.Children.Add(Couche);

        var zoneMessages = new StackPanel { HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(16) };
        Messages.Zone = zoneMessages;
        racine.Children.Add(zoneMessages);
        Content = racine;

        Routeur.Montrer += Afficher;
        // Le bas de la page devient visible : la page peut charger la suite (« arrive en bas de »).
        var enBas = false;
        defilement.ScrollChanged += async (_, _) =>
        {
            if (enBas || Routeur.Page is not { } page || defilement.ScrollableHeight - defilement.VerticalOffset > 200) return;
            enBas = true;
            try { await page.EnBas(); }
            catch (ErreurHumalis e) { Messages.Afficher(e.Message, "erreur"); }
            finally { enBas = false; }
        };
        PreviewKeyDown += QuandTouche;
        MouseDown += (_, e) => { if (e.ChangedButton == MouseButton.XButton1) Routeur.Revenir(); };
    }

    private void Afficher(PageHumalis page)
    {
        Title = page.Titre;
        entete.Content = page.SansEntete ? null : construireEntete?.Invoke();
        pied.Content = page.SansPied ? null : construireP?.Invoke();
        contenu.Content = page.Construire();
        defilement.ScrollToTop();
    }

    private void QuandTouche(object sender, KeyEventArgs e)
    {
        var touche = e.Key == Key.System ? e.SystemKey : e.Key;
        if (touche == Key.Left && Keyboard.Modifiers == ModifierKeys.Alt) { Routeur.Revenir(); e.Handled = true; return; }
        if (Routeur.Page is null) return;
        var morceaux = new List<string>();
        if (Keyboard.Modifiers.HasFlag(ModifierKeys.Control)) morceaux.Add("controle");
        if (Keyboard.Modifiers.HasFlag(ModifierKeys.Shift)) morceaux.Add("maj");
        if (Keyboard.Modifiers.HasFlag(ModifierKeys.Alt)) morceaux.Add("alt");
        var nom = touche switch
        {
            Key.Enter => "entree", Key.Escape => "echap", Key.Space => "espace", Key.Tab => "tab", Key.Up => "haut", Key.Down => "bas",
            Key.Left => "gauche", Key.Right => "droite", Key.Back => "retour", Key.Delete => "suppr",
            >= Key.A and <= Key.Z => touche.ToString().ToLowerInvariant(),
            >= Key.D0 and <= Key.D9 => ((int)(touche - Key.D0)).ToString(),
            _ => null,
        };
        if (nom is null) return;
        morceaux.Add(nom);
        if (Routeur.Page.Touche(string.Join("+", morceaux))) e.Handled = true;
    }
}

/// <summary>Ce qui est gardé sur l'appareil (« avec memorisee ») : un fichier JSON dans %LOCALAPPDATA%.</summary>
public static class Memoire
{
    internal static string Dossier
    {
        get
        {
            var dossier = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Configuration.Identifiant);
            Directory.CreateDirectory(dossier);
            return dossier;
        }
    }

    private static Fiche? valeurs;
    private static string Fichier => Path.Combine(Dossier, "memoire.json");

    private static Fiche Toutes()
    {
        if (valeurs is not null) return valeurs;
        try { valeurs = File.Exists(Fichier) ? V.LireJson(File.ReadAllText(Fichier)) as Fiche : null; }
        catch (Exception) { valeurs = null; }
        return valeurs ??= new Fiche();
    }

    public static object? Lire(string cle) => Toutes().TryGetValue(cle, out var v) ? v : null;

    public static void Ecrire(string cle, object? valeur)
    {
        Toutes()[cle] = valeur;
        try { File.WriteAllText(Fichier, V.EnJson(Toutes())); } catch (Exception) { }
    }

    /// <summary>Une variable gardée : relue au démarrage, écrite à chaque changement. Un secret passe par le coffre.</summary>
    public static Signal Garder(string cle, object? depart, bool secret = false)
    {
        object? lue = secret ? (Coffre.Lire(cle) is { } texte ? V.LireJson(texte) : null) : Lire(cle);
        var signal = new Signal(lue ?? depart);
        signal.Change += v => { if (secret) Coffre.Ecrire(cle, V.EnJson(v)); else Ecrire(cle, v); };
        return signal;
    }
}

/// <summary>Le coffre : chiffré par Windows (DPAPI) pour la personne connectée à la session Windows seulement.</summary>
public static class Coffre
{
    [StructLayout(LayoutKind.Sequential)]
    private struct DonneesBlob
    {
        public int Taille;
        public IntPtr Octets;
    }

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CryptProtectData(ref DonneesBlob entree, string? description, IntPtr entropie, IntPtr reserve, IntPtr invite, int options, ref DonneesBlob sortie);

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CryptUnprotectData(ref DonneesBlob entree, IntPtr description, IntPtr entropie, IntPtr reserve, IntPtr invite, int options, ref DonneesBlob sortie);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memoire);

    private const int SansFenetre = 0x1;

    private static byte[]? Transformer(byte[] donnees, bool chiffrer)
    {
        var entree = new DonneesBlob { Taille = donnees.Length, Octets = Marshal.AllocHGlobal(Math.Max(1, donnees.Length)) };
        var sortie = new DonneesBlob();
        try
        {
            Marshal.Copy(donnees, 0, entree.Octets, donnees.Length);
            var reussi = chiffrer
                ? CryptProtectData(ref entree, null, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, SansFenetre, ref sortie)
                : CryptUnprotectData(ref entree, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, SansFenetre, ref sortie);
            if (!reussi) return null;
            var resultat = new byte[sortie.Taille];
            Marshal.Copy(sortie.Octets, resultat, 0, sortie.Taille);
            return resultat;
        }
        finally
        {
            Marshal.FreeHGlobal(entree.Octets);
            if (sortie.Octets != IntPtr.Zero) LocalFree(sortie.Octets);
        }
    }

    private static string Chemin(string cle)
    {
        var dossier = Path.Combine(Memoire.Dossier, "coffre");
        Directory.CreateDirectory(dossier);
        var nom = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(cle)));
        return Path.Combine(dossier, nom + ".bin");
    }

    public static string? Lire(string cle)
    {
        try
        {
            var chemin = Chemin(cle);
            if (!File.Exists(chemin)) return null;
            var clair = Transformer(File.ReadAllBytes(chemin), false);
            return clair is null ? null : Encoding.UTF8.GetString(clair);
        }
        catch (Exception) { return null; }
    }

    public static void Ecrire(string cle, string valeur)
    {
        try
        {
            var chiffre = Transformer(Encoding.UTF8.GetBytes(valeur), true);
            if (chiffre is not null) File.WriteAllBytes(Chemin(cle), chiffre);
        }
        catch (Exception) { }
    }

    public static void Effacer(string cle)
    {
        try { File.Delete(Chemin(cle)); } catch (Exception) { }
    }
}
`;
