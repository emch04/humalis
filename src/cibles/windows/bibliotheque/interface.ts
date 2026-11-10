/**
 * Les éléments Humalis en WPF : titres, textes, boutons, liens, images, champs, blocs,
 * conditions et listes. Chaque fonction rend un élément déjà relié à ses variables :
 * le code d'une page n'a qu'à les assembler.
 */
export const INTERFACE_CS = String.raw`// Produit par Humalis : les éléments d'une page, en WPF.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;

namespace Humalis;

/// <summary>Le style d'un élément : ses options (« avec fond primaire ») et ses styles nommés, réunis.</summary>
public sealed class StyleHumalis
{
    public Brush? Fond { get; init; }
    public Brush? Couleur { get; init; }
    public double? Taille { get; init; }
    public FontWeight? Graisse { get; init; }
    public FontStyle? Italique { get; init; }
    public FontFamily? Police { get; init; }
    public Thickness? Remplissage { get; init; }
    public Thickness? Marge { get; init; }
    public double? Arrondi { get; init; }
    public Thickness? Bordure { get; init; }
    public Brush? CouleurBordure { get; init; }
    public double? Largeur { get; init; }
    public double? LargeurMax { get; init; }
    public double? LargeurMin { get; init; }
    public double? Hauteur { get; init; }
    public double? HauteurMin { get; init; }
    public double? HauteurMax { get; init; }
    public TextAlignment? Alignement { get; init; }
    public HorizontalAlignment? Position { get; init; }
    public double? Ecart { get; init; }
    public double? Opacite { get; init; }
    public double? Interligne { get; init; }
    public bool? Majuscules { get; init; }
    public DropShadowEffect? Ombre { get; init; }
    public bool Pleine { get; init; }

    /// <summary>Les styles dans l'ordre : le dernier écrit l'emporte, propriété par propriété.</summary>
    public static StyleHumalis? Fondre(IEnumerable<StyleHumalis?> styles)
    {
        StyleHumalis? r = null;
        foreach (var s in styles)
        {
            if (s is null) continue;
            if (r is null) { r = s; continue; }
            r = new StyleHumalis
            {
                Fond = s.Fond ?? r.Fond, Couleur = s.Couleur ?? r.Couleur, Taille = s.Taille ?? r.Taille, Graisse = s.Graisse ?? r.Graisse,
                Italique = s.Italique ?? r.Italique, Police = s.Police ?? r.Police, Remplissage = s.Remplissage ?? r.Remplissage, Marge = s.Marge ?? r.Marge,
                Arrondi = s.Arrondi ?? r.Arrondi, Bordure = s.Bordure ?? r.Bordure, CouleurBordure = s.CouleurBordure ?? r.CouleurBordure,
                Largeur = s.Largeur ?? r.Largeur, LargeurMax = s.LargeurMax ?? r.LargeurMax, LargeurMin = s.LargeurMin ?? r.LargeurMin,
                Hauteur = s.Hauteur ?? r.Hauteur, HauteurMin = s.HauteurMin ?? r.HauteurMin, HauteurMax = s.HauteurMax ?? r.HauteurMax,
                Alignement = s.Alignement ?? r.Alignement, Position = s.Position ?? r.Position, Ecart = s.Ecart ?? r.Ecart, Opacite = s.Opacite ?? r.Opacite,
                Interligne = s.Interligne ?? r.Interligne, Majuscules = s.Majuscules ?? r.Majuscules, Ombre = s.Ombre ?? r.Ombre, Pleine = s.Pleine || r.Pleine,
            };
        }
        return r;
    }
}

/// <summary>Une pile d'éléments, verticale (un bloc) ou horizontale qui passe à la ligne (une ligne), avec un écart.</summary>
public sealed class PileHumalis : Panel
{
    public bool Horizontale { get; set; }
    public double Ecart { get; set; } = 12;

    protected override Size MeasureOverride(Size disponible)
    {
        if (!Horizontale)
        {
            double hauteur = 0, largeur = 0;
            var visibles = 0;
            foreach (UIElement e in InternalChildren)
            {
                e.Measure(new Size(disponible.Width, double.PositiveInfinity));
                if (e.Visibility == Visibility.Collapsed) continue;
                if (visibles++ > 0) hauteur += Ecart;
                hauteur += e.DesiredSize.Height;
                largeur = Math.Max(largeur, e.DesiredSize.Width);
            }
            return new Size(double.IsInfinity(disponible.Width) ? largeur : Math.Min(largeur, disponible.Width), hauteur);
        }
        double x = 0, y = 0, ligne = 0, plusLarge = 0;
        foreach (UIElement e in InternalChildren)
        {
            e.Measure(new Size(disponible.Width, double.PositiveInfinity));
            if (e.Visibility == Visibility.Collapsed) continue;
            var l = e.DesiredSize.Width;
            if (x > 0 && x + l > disponible.Width) { y += ligne + Ecart; x = 0; ligne = 0; }
            x += l + Ecart;
            ligne = Math.Max(ligne, e.DesiredSize.Height);
            plusLarge = Math.Max(plusLarge, x - Ecart);
        }
        return new Size(Math.Min(plusLarge, double.IsInfinity(disponible.Width) ? plusLarge : disponible.Width), y + ligne);
    }

    protected override Size ArrangeOverride(Size taille)
    {
        if (!Horizontale)
        {
            double y = 0;
            var visibles = 0;
            foreach (UIElement e in InternalChildren)
            {
                if (e.Visibility == Visibility.Collapsed) continue;
                if (visibles++ > 0) y += Ecart;
                e.Arrange(new Rect(0, y, taille.Width, e.DesiredSize.Height));
                y += e.DesiredSize.Height;
            }
            return taille;
        }
        // Une ligne : les éléments passent à la ligne, chaque ligne centrée verticalement.
        var lignes = new List<List<UIElement>>();
        var courante = new List<UIElement>();
        double xx = 0;
        foreach (UIElement e in InternalChildren)
        {
            if (e.Visibility == Visibility.Collapsed) continue;
            if (courante.Count > 0 && xx + e.DesiredSize.Width > taille.Width) { lignes.Add(courante); courante = new(); xx = 0; }
            courante.Add(e);
            xx += e.DesiredSize.Width + Ecart;
        }
        if (courante.Count > 0) lignes.Add(courante);
        double yy = 0;
        foreach (var l in lignes)
        {
            var haut = l.Max(e => e.DesiredSize.Height);
            double x = 0;
            foreach (var e in l)
            {
                e.Arrange(new Rect(x, yy + (haut - e.DesiredSize.Height) / 2, e.DesiredSize.Width, e.DesiredSize.Height));
                x += e.DesiredSize.Width + Ecart;
            }
            yy += haut + Ecart;
        }
        return taille;
    }
}

/// <summary>Une grille : autant de colonnes que la largeur en permet, chacune d'au moins Minimum.</summary>
public sealed class GrilleHumalis : Panel
{
    public double Minimum { get; set; } = 240;
    public double Ecart { get; set; } = 16;
    public int? Colonnes { get; set; }

    private int Nombre(double largeur) => Colonnes ?? Math.Max(1, (int)((largeur + Ecart) / (Minimum + Ecart)));

    protected override Size MeasureOverride(Size disponible)
    {
        var largeur = double.IsInfinity(disponible.Width) ? Minimum * 3 : disponible.Width;
        var n = Nombre(largeur);
        var colonne = (largeur - Ecart * (n - 1)) / n;
        var enfants = InternalChildren.Cast<UIElement>().Where(e => e.Visibility != Visibility.Collapsed).ToList();
        double hauteur = 0;
        for (var i = 0; i < enfants.Count; i += n)
        {
            double ligne = 0;
            foreach (var e in enfants.Skip(i).Take(n)) { e.Measure(new Size(colonne, double.PositiveInfinity)); ligne = Math.Max(ligne, e.DesiredSize.Height); }
            hauteur += ligne + (i > 0 ? Ecart : 0);
        }
        return new Size(largeur, hauteur);
    }

    protected override Size ArrangeOverride(Size taille)
    {
        var n = Nombre(taille.Width);
        var colonne = (taille.Width - Ecart * (n - 1)) / n;
        var enfants = InternalChildren.Cast<UIElement>().Where(e => e.Visibility != Visibility.Collapsed).ToList();
        double y = 0;
        for (var i = 0; i < enfants.Count; i += n)
        {
            var rang = enfants.Skip(i).Take(n).ToList();
            var ligne = rang.Max(e => e.DesiredSize.Height);
            for (var j = 0; j < rang.Count; j++) rang[j].Arrange(new Rect(j * (colonne + Ecart), y, colonne, ligne));
            y += ligne + Ecart;
        }
        return taille;
    }
}

/// <summary>Les icônes du système (Segoe Fluent Icons sur Windows 11, Segoe MDL2 Assets sur Windows 10).</summary>
public static class Icones
{
    public static readonly FontFamily Police = new("Segoe Fluent Icons, Segoe MDL2 Assets");

    private static readonly Dictionary<string, string> glyphes = new()
    {
        ["accueil"] = "", ["maison"] = "", ["panier"] = "", ["recherche"] = "", ["chercher"] = "",
        ["utilisateur"] = "", ["personne"] = "", ["compte"] = "", ["reglages"] = "", ["parametres"] = "",
        ["ajouter"] = "", ["plus"] = "", ["supprimer"] = "", ["poubelle"] = "", ["modifier"] = "", ["crayon"] = "",
        ["fermer"] = "", ["croix"] = "", ["valider"] = "", ["coche"] = "", ["retour"] = "", ["fleche-gauche"] = "",
        ["fleche-droite"] = "", ["suivant"] = "", ["menu"] = "", ["email"] = "", ["message"] = "", ["telephone"] = "",
        ["calendrier"] = "", ["date"] = "", ["horloge"] = "", ["etoile"] = "", ["coeur"] = "", ["partager"] = "",
        ["telecharger"] = "", ["envoyer"] = "", ["info"] = "", ["attention"] = "", ["erreur"] = "", ["cadenas"] = "",
        ["deconnexion"] = "", ["connexion"] = "", ["image"] = "", ["fichier"] = "", ["dossier"] = "", ["carte"] = "",
        ["lieu"] = "", ["argent"] = "", ["camion"] = "", ["livraison"] = "", ["lien"] = "", ["copier"] = "",
        ["actualiser"] = "", ["filtre"] = "", ["graphique"] = "", ["notification"] = "", ["cloche"] = "", ["oeil"] = "", ["lecture"] = "", ["pause"] = "",
    };

    public static string Glyphe(string nom) => glyphes.TryGetValue(nom, out var g) ? g : "";

    public static TextBlock Element(string nom, double taille = 16) => new()
    {
        Text = Glyphe(nom), FontFamily = Police, FontSize = taille, VerticalAlignment = VerticalAlignment.Center,
    };
}

public static class UI
{
    // ─── Assembler ───────────────────────────────────────────────────────

    public static FrameworkElement Pile(params UIElement?[] enfants) => Remplir(new PileHumalis(), enfants);
    public static FrameworkElement Ligne(params UIElement?[] enfants) => Remplir(new PileHumalis { Horizontale = true }, enfants);
    public static FrameworkElement Grille(params UIElement?[] enfants) => Remplir(new GrilleHumalis(), enfants);
    /// <summary>« grille avec colonnes 3 ».</summary>
    public static FrameworkElement GrilleDe(int colonnes, params UIElement?[] enfants) => Remplir(new GrilleHumalis { Colonnes = colonnes }, enfants);

    private static FrameworkElement Remplir(Panel panneau, IEnumerable<UIElement?> enfants)
    {
        foreach (var e in enfants) if (e is not null) panneau.Children.Add(e);
        return panneau;
    }

    /// <summary>Une liste à puces ou numérotée.</summary>
    public static FrameworkElement Puces(bool numerotee, params UIElement?[] enfants)
    {
        var pile = new PileHumalis { Ecart = 6 };
        var rang = 0;
        foreach (var e in enfants)
        {
            if (e is null) continue;
            rang++;
            var ligne = new DockPanel();
            var puce = new TextBlock { Text = numerotee ? rang + "." : "•", Width = 24, VerticalAlignment = VerticalAlignment.Top };
            DockPanel.SetDock(puce, Dock.Left);
            ligne.Children.Add(puce);
            ligne.Children.Add(e);
            pile.Children.Add(ligne);
        }
        return pile;
    }

    /// <summary>Une partie redessinée seule quand ce qu'elle lit change (une variable locale, un composant).</summary>
    public static FrameworkElement Zone(Func<UIElement?> construire)
    {
        var zone = new ContentControl { Focusable = false, IsTabStop = false, HorizontalContentAlignment = HorizontalAlignment.Stretch };
        new Effet(() => zone.Content = construire());
        return zone;
    }

    /// <summary>« si … : » dans la page : seule la branche choisie est construite, et reconstruite quand le choix change.</summary>
    public static FrameworkElement Si(Func<bool> test, Func<UIElement?> alors, Func<UIElement?>? sinon = null)
    {
        var zone = new ContentControl { Focusable = false, IsTabStop = false, HorizontalContentAlignment = HorizontalAlignment.Stretch };
        var choix = new Signal();
        new Effet(() => choix.Ecrire(test()));
        new Effet(() => zone.Content = V.B(choix.Lire()) ? alors() : sinon?.Invoke());
        return zone;
    }

    /// <summary>« pour chaque … dans … : » : une ligne par élément, reconstruites quand la liste change.</summary>
    public static FrameworkElement Pour(Func<object?> liste, Func<object?, int, UIElement?> ligne, Panel? panneau = null)
    {
        var pile = panneau ?? new PileHumalis();
        new Effet(() =>
        {
            var elements = V.L(liste());
            pile.Children.Clear();
            for (var i = 0; i < elements.Count; i++)
            {
                var e = ligne(elements[i], i);
                if (e is not null) pile.Children.Add(e);
            }
        });
        return pile;
    }

    /// <summary>Un composant écrit en Humalis, monté une fois : ses valeurs suivent celles de la page.</summary>
    public static FrameworkElement Composant(Func<ComposantHumalis> creer)
    {
        var zone = new ContentControl { Focusable = false, IsTabStop = false, HorizontalContentAlignment = HorizontalAlignment.Stretch };
        new Effet(() => zone.Content = Effet.SansSuivre(creer).Monter());
        return zone;
    }

    /// <summary>« quand l'utilisateur clique sur » une image ou un texte : il devient un bouton pour le clavier aussi.</summary>
    public static FrameworkElement AuClic(FrameworkElement element, Func<Task> action)
    {
        element.Cursor = Cursors.Hand;
        element.Focusable = true;
        element.MouseLeftButtonUp += (_, e) => { e.Handled = true; Lancer(action); };
        element.KeyDown += (_, e) => { if (e.Key is Key.Enter or Key.Space) { e.Handled = true; Lancer(action); } };
        return element;
    }

    public static FrameworkElement AuSurvol(FrameworkElement element, Func<Task> action)
    {
        element.MouseEnter += (_, _) => Lancer(action);
        return element;
    }

    /// <summary>Un tableau : une ligne d'en-têtes, puis une ligne par rangée.</summary>
    public static FrameworkElement Tableau(Func<string>[] colonnes, Func<string>[][] rangees)
    {
        var grille = new Grid();
        for (var i = 0; i < colonnes.Length; i++) grille.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        for (var r = 0; r <= rangees.Length; r++) grille.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        void Cellule(Func<string> texte, int ligne, int colonne, bool entete)
        {
            var t = Texte(texte);
            t.Margin = new Thickness(0, 4, 12, 4);
            if (entete) t.FontWeight = FontWeights.SemiBold;
            Grid.SetRow(t, ligne);
            Grid.SetColumn(t, colonne);
            grille.Children.Add(t);
        }
        for (var c = 0; c < colonnes.Length; c++) Cellule(colonnes[c], 0, c, true);
        for (var r = 0; r < rangees.Length; r++)
            for (var c = 0; c < Math.Min(colonnes.Length, rangees[r].Length); c++) Cellule(rangees[r][c], r + 1, c, false);
        return grille;
    }

    /// <summary>« montrer » et « cacher » : l'élément reste à sa place, visible ou non.</summary>
    public static FrameworkElement Visible(Func<bool> visible, FrameworkElement element)
    {
        new Effet(() => element.Visibility = visible() ? Visibility.Visible : Visibility.Collapsed);
        return element;
    }

    // ─── Textes ──────────────────────────────────────────────────────────

    private static readonly double[] taillesTitres = { 32, 26, 21, 18, 16, 14 };

    public static TextBlock Titre(int niveau, Func<string> texte, string? id = null)
    {
        var t = Texte(texte, id);
        t.FontSize = taillesTitres[Math.Clamp(niveau, 1, 6) - 1];
        t.FontWeight = niveau <= 2 ? FontWeights.Bold : FontWeights.SemiBold;
        AutomationProperties.SetHeadingLevel(t, (AutomationHeadingLevel)Math.Clamp(niveau, 1, 9));
        return t;
    }

    public static TextBlock Texte(Func<string> texte, string? id = null)
    {
        var t = new TextBlock { TextWrapping = TextWrapping.Wrap };
        if (id is not null) AutomationProperties.SetAutomationId(t, id);
        new Effet(() => t.Text = texte());
        return t;
    }

    /// <summary>Un bloc de code : police à chasse fixe, sur un fond.</summary>
    public static FrameworkElement Code(string code) => new Border
    {
        Padding = new Thickness(12), CornerRadius = new CornerRadius(6), Background = Apparence.FondDiscret,
        Child = new TextBlock { Text = code, FontFamily = new FontFamily("Cascadia Mono, Consolas"), TextWrapping = TextWrapping.Wrap },
    };

    // ─── Agir ────────────────────────────────────────────────────────────

    /// <summary>Lance une action : les changements du début sont regroupés, une erreur devient un message.</summary>
    public static async void Lancer(Func<Task>? action)
    {
        if (action is null) return;
        try
        {
            Task? tache = null;
            Effet.Lot(() => tache = action());
            if (tache is not null) await tache;
        }
        catch (ErreurHumalis e) { Messages.Afficher(e.Message, "erreur"); }
        catch (Exception e) { Messages.Afficher("Une erreur est survenue : " + e.Message, "erreur"); }
    }

    public static Button Bouton(Func<string> texte, Func<Task>? clic, string? id = null, Func<bool>? desactive = null, string? icone = null, bool principal = false)
    {
        var libelle = new TextBlock { TextWrapping = TextWrapping.Wrap };
        new Effet(() => libelle.Text = texte());
        object contenu = libelle;
        if (icone is not null)
        {
            var avecIcone = new StackPanel { Orientation = Orientation.Horizontal };
            var glyphe = Icones.Element(icone, 14);
            glyphe.Margin = new Thickness(0, 0, 8, 0);
            avecIcone.Children.Add(glyphe);
            avecIcone.Children.Add(libelle);
            contenu = avecIcone;
        }
        var b = new Button { Content = contenu, HorizontalAlignment = HorizontalAlignment.Left, Padding = new Thickness(16, 6, 16, 6) };
        if (principal) b.SetResourceReference(FrameworkElement.StyleProperty, "AccentButtonStyle");
        if (id is not null) AutomationProperties.SetAutomationId(b, id);
        new Effet(() => AutomationProperties.SetName(b, texte()));
        if (desactive is not null) new Effet(() => b.IsEnabled = !desactive());
        b.Click += (_, _) => Lancer(clic);
        return b;
    }

    /// <summary>Un lien : vers une page de l'application, ou une adresse externe ouverte par le navigateur.</summary>
    public static FrameworkElement Lien(Func<string> texte, Func<Task>? aller, string? id = null)
    {
        var run = new Run();
        new Effet(() => run.Text = texte());
        var lien = new Hyperlink(run);
        lien.Click += (_, _) => Lancer(aller);
        var t = new TextBlock(lien) { TextWrapping = TextWrapping.Wrap };
        if (id is not null) AutomationProperties.SetAutomationId(t, id);
        return t;
    }

    /// <summary>Ouvre une adresse externe : https, http, mailto et tel seulement.</summary>
    public static Task OuvrirExterne(string adresse)
    {
        var propre = adresse.Trim();
        var schema = propre.Split(':')[0].ToLowerInvariant();
        if (schema is "https" or "http" or "mailto" or "tel")
        {
            try { Process.Start(new ProcessStartInfo(propre) { UseShellExecute = true }); }
            catch (Exception) { Messages.Afficher("Ce lien n'a pas pu s'ouvrir.", "erreur"); }
        }
        return Task.CompletedTask;
    }

    // ─── Images ──────────────────────────────────────────────────────────

    /// <summary>Une image du projet (copiée dans l'application) ou d'une adresse https.</summary>
    public static FrameworkElement Image(Func<string> source, string description, string? id = null)
    {
        var image = new System.Windows.Controls.Image { Stretch = Stretch.Uniform, StretchDirection = StretchDirection.DownOnly, HorizontalAlignment = HorizontalAlignment.Left };
        AutomationProperties.SetName(image, description);
        if (id is not null) AutomationProperties.SetAutomationId(image, id);
        new Effet(() =>
        {
            var chemin = source();
            try
            {
                var distante = chemin.StartsWith("https://") || chemin.StartsWith("http://");
                var locale = chemin.StartsWith("file:");
                var uri = distante || locale ? new Uri(chemin) : new Uri("pack://application:,,,/Ressources/" + chemin.TrimStart('.', '/').Replace('\\', '/'));
                if (chemin.Length == 0) image.Source = null;
                else if (chemin.Split('?')[0].EndsWith(".svg", StringComparison.OrdinalIgnoreCase))
                {
                    // Un SVG : WPF ne le lit pas, la bibliothèque en fait un dessin vectoriel.
                    if (distante) _ = ChargerSvg(image, uri);
                    else if (locale) { using var flux = System.IO.File.OpenRead(uri.LocalPath); image.Source = Svg.Lire(flux); }
                    else image.Source = System.Windows.Application.GetResourceStream(uri) is { } ressource ? Svg.Lire(ressource.Stream) : null;
                }
                else image.Source = new BitmapImage(uri);
            }
            catch (Exception) { image.Source = null; }
        });
        return image;
    }

    private static readonly System.Net.Http.HttpClient telechargeur = new() { Timeout = TimeSpan.FromSeconds(20) };

    private static async Task ChargerSvg(System.Windows.Controls.Image image, Uri uri)
    {
        try
        {
            using var flux = await telechargeur.GetStreamAsync(uri);
            var copie = new System.IO.MemoryStream();
            await flux.CopyToAsync(copie);
            copie.Position = 0;
            image.Source = Svg.Lire(copie);
        }
        catch (Exception) { image.Source = null; }
    }

    // ─── Champs ──────────────────────────────────────────────────────────

    private static TextBlock Libelle(string texte) => new() { Text = texte, Margin = new Thickness(0, 0, 0, 4), TextWrapping = TextWrapping.Wrap };

    /// <summary>Un texte gris tant que le champ est vide.</summary>
    private static FrameworkElement AvecIndice(Control champ, Func<bool> vide, string? indice)
    {
        if (string.IsNullOrEmpty(indice)) return champ;
        var grille = new Grid();
        grille.Children.Add(champ);
        var gris = new TextBlock { Text = indice, IsHitTestVisible = false, Opacity = 0.55, Margin = new Thickness(12, 0, 12, 0), VerticalAlignment = champ is TextBox { AcceptsReturn: true } ? VerticalAlignment.Top : VerticalAlignment.Center };
        if (champ is TextBox { AcceptsReturn: true }) gris.Margin = new Thickness(12, 8, 12, 0);
        grille.Children.Add(gris);
        void MettreAJour() => gris.Visibility = vide() ? Visibility.Visible : Visibility.Collapsed;
        champ.GotFocus += (_, _) => MettreAJour();
        if (champ is TextBox tb) tb.TextChanged += (_, _) => MettreAJour();
        if (champ is PasswordBox pb) pb.PasswordChanged += (_, _) => MettreAJour();
        MettreAJour();
        return grille;
    }

    /// <summary>
    /// Un champ : son libellé au-dessus, et la saisie qui convient à sa sorte. La valeur vit dans un Signal :
    /// la page la lit, « vider champ » ou « avec valeur » l'écrivent.
    /// </summary>
    public static FrameworkElement Champ(string id, string libelle, Signal valeur, string sorte = "texte", string? indice = null, Func<object?>? parmi = null, Func<bool>? desactive = null, Action? entree = null, Func<object?>? depart = null)
    {
        if (depart is not null)
        {
            // « avec valeur … » : la valeur de départ est suivie tant que la personne n'a rien changé.
            var touche = false;
            var ecriture = false;
            valeur.Change += _ => { if (!ecriture) touche = true; };
            new Effet(() =>
            {
                var v = depart();
                if (touche) return;
                ecriture = true;
                try { valeur.Ecrire(sorte == "case" ? V.B(v) : sorte == "nombre" ? (v is null ? null : V.N(v)) : V.T(v)); }
                finally { ecriture = false; }
            });
        }
        Control saisie;
        switch (sorte)
        {
            case "case":
            {
                var c = new CheckBox { Content = libelle };
                c.Checked += (_, _) => valeur.Ecrire(true);
                c.Unchecked += (_, _) => valeur.Ecrire(false);
                new Effet(() => c.IsChecked = V.B(valeur.Lire()));
                saisie = c;
                break;
            }
            case "liste":
            {
                var c = new ComboBox { MinWidth = 200, HorizontalAlignment = HorizontalAlignment.Left };
                new Effet(() => { c.ItemsSource = V.L(parmi?.Invoke()).Select(V.T).ToList(); c.SelectedItem = V.T(valeur.Lire()); });
                c.SelectionChanged += (_, _) => { if (c.SelectedItem is string s) valeur.Ecrire(s); };
                saisie = c;
                break;
            }
            case "choix":
            {
                var groupe = new PileHumalis { Ecart = 4 };
                new Effet(() =>
                {
                    groupe.Children.Clear();
                    var actuel = V.T(valeur.Lire());
                    foreach (var option in V.L(parmi?.Invoke()).Select(V.T))
                    {
                        var r = new RadioButton { Content = option, GroupName = id, IsChecked = option == actuel };
                        r.Checked += (_, _) => valeur.Ecrire(option);
                        groupe.Children.Add(r);
                    }
                });
                var bloc = new PileHumalis { Ecart = 0 };
                bloc.Children.Add(Libelle(libelle));
                bloc.Children.Add(groupe);
                AutomationProperties.SetAutomationId(bloc, id);
                if (desactive is not null) new Effet(() => groupe.IsEnabled = !desactive());
                return bloc;
            }
            case "date":
            {
                var d = new DatePicker { HorizontalAlignment = HorizontalAlignment.Left, MinWidth = 200 };
                d.SelectedDateChanged += (_, _) => valeur.Ecrire(d.SelectedDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "");
                new Effet(() =>
                {
                    var texte = V.T(valeur.Lire());
                    d.SelectedDate = DateTime.TryParseExact(texte, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var jour) ? jour : null;
                });
                saisie = d;
                break;
            }
            case "motDePasse":
            {
                var p = new PasswordBox();
                p.PasswordChanged += (_, _) => valeur.Ecrire(p.Password);
                new Effet(() => { var v = V.T(valeur.Lire()); if (p.Password != v) p.Password = v; });
                saisie = p;
                break;
            }
            default:
            {
                var t = new TextBox();
                if (sorte == "texteLong") { t.AcceptsReturn = true; t.TextWrapping = TextWrapping.Wrap; t.MinHeight = 96; t.VerticalContentAlignment = VerticalAlignment.Top; }
                if (sorte == "nombre")
                {
                    t.TextChanged += (_, _) => valeur.Ecrire(V.EstNombre(t.Text) ? V.LireNombre(t.Text) : t.Text.Trim().Length == 0 ? null : valeur.Valeur);
                    new Effet(() => { var v = valeur.Lire(); if (V.LireNombre(t.Text) != V.N(v) || (v is null && t.Text.Length > 0)) t.Text = v is null ? "" : V.T(v); });
                }
                else
                {
                    t.TextChanged += (_, _) => valeur.Ecrire(t.Text);
                    new Effet(() => { var v = V.T(valeur.Lire()); if (t.Text != v) t.Text = v; });
                }
                saisie = t;
                break;
            }
        }
        AutomationProperties.SetAutomationId(saisie, id);
        AutomationProperties.SetName(saisie, libelle);
        if (desactive is not null) new Effet(() => saisie.IsEnabled = !desactive());
        if (entree is not null && sorte != "texteLong")
            saisie.KeyDown += (_, e) => { if (e.Key == Key.Enter) { e.Handled = true; entree(); } };
        if (sorte == "case") return saisie;
        var pile = new PileHumalis { Ecart = 0 };
        pile.Children.Add(Libelle(libelle));
        pile.Children.Add(AvecIndice(saisie, () => saisie switch { TextBox t => t.Text.Length == 0, PasswordBox p => p.Password.Length == 0, _ => false }, indice));
        return pile;
    }

    // ─── Éléments d'une ligne ────────────────────────────────────────────

    public static FrameworkElement Badge(Func<string> texte) => new Border
    {
        Background = Apparence.Accent, CornerRadius = new CornerRadius(999), Padding = new Thickness(8, 2, 8, 2), HorizontalAlignment = HorizontalAlignment.Left,
        Child = WithForeground(Texte(texte), Brushes.White),
    };

    private static TextBlock WithForeground(TextBlock t, Brush b) { t.Foreground = b; return t; }

    public static FrameworkElement Progression(Func<double> valeur, double maximum = 100)
    {
        var p = new ProgressBar { Maximum = maximum, Height = 6, MinWidth = 160 };
        new Effet(() => p.Value = valeur());
        return p;
    }

    public static FrameworkElement Chargement() => new ProgressBar { IsIndeterminate = true, Height = 6, MinWidth = 160, HorizontalAlignment = HorizontalAlignment.Left };

    public static FrameworkElement Etoiles(Func<double> note, int maximum = 5)
    {
        var t = new TextBlock { Foreground = Brushes.Goldenrod, FontSize = 16 };
        new Effet(() =>
        {
            var n = (int)Math.Round(Math.Clamp(note(), 0, maximum));
            t.Text = new string('★', n) + new string('☆', maximum - n);
            AutomationProperties.SetName(t, $"{n} sur {maximum}");
        });
        return t;
    }

    public static FrameworkElement Separateur() => new Separator();

    /// <summary>« selecteur de langue » : la liste des langues du programme.</summary>
    public static FrameworkElement SelecteurLangue()
    {
        var c = new ComboBox { HorizontalAlignment = HorizontalAlignment.Left, MinWidth = 140 };
        AutomationProperties.SetName(c, "Langue");
        AutomationProperties.SetAutomationId(c, "humalis_langue");
        foreach (var (code, nom) in Langues.Toutes) c.Items.Add(new ComboBoxItem { Content = nom, Tag = code });
        c.SelectedItem = c.Items.Cast<ComboBoxItem>().FirstOrDefault(i => (string)i.Tag == Langues.Actuelle);
        c.SelectionChanged += (_, _) => { if (c.SelectedItem is ComboBoxItem { Tag: string code } && code != Langues.Actuelle) Langues.Changer(code); };
        return c;
    }

    // ─── Blocs qui s'ouvrent ─────────────────────────────────────────────

    public static FrameworkElement Deroulant(Func<string> titre, UIElement corps)
    {
        var e = new Expander { Content = corps, HorizontalAlignment = HorizontalAlignment.Stretch };
        new Effet(() => e.Header = titre());
        return e;
    }

    public static FrameworkElement Onglets(params (Func<string> titre, Func<UIElement?> corps)[] onglets)
    {
        var t = new TabControl();
        foreach (var (titre, corps) in onglets)
        {
            var item = new TabItem();
            new Effet(() => item.Header = titre());
            item.Content = corps();
            t.Items.Add(item);
        }
        return t;
    }

    // ─── Styles ──────────────────────────────────────────────────────────

    /// <summary>Applique les styles à un élément ; un fond, une bordure ou un remplissage l'entourent d'un cadre.</summary>
    public static FrameworkElement Styler(FrameworkElement element, params StyleHumalis?[] styles)
    {
        var s = StyleHumalis.Fondre(styles);
        if (s is null) return element;

        if (element is TextBlock t)
        {
            if (s.Couleur is not null) t.Foreground = s.Couleur;
            if (s.Taille is not null) t.FontSize = s.Taille.Value;
            if (s.Graisse is not null) t.FontWeight = s.Graisse.Value;
            if (s.Italique is not null) t.FontStyle = s.Italique.Value;
            if (s.Police is not null) t.FontFamily = s.Police;
            if (s.Alignement is not null) t.TextAlignment = s.Alignement.Value;
            if (s.Interligne is not null) t.LineHeight = s.Interligne.Value;
        }
        else if (element is Control c)
        {
            if (s.Couleur is not null) c.Foreground = s.Couleur;
            if (s.Fond is not null) c.Background = s.Fond;
            if (s.Taille is not null) c.FontSize = s.Taille.Value;
            if (s.Graisse is not null) c.FontWeight = s.Graisse.Value;
            if (s.Police is not null) c.FontFamily = s.Police;
            if (s.Remplissage is not null) c.Padding = s.Remplissage.Value;
            if (s.Bordure is not null) c.BorderThickness = s.Bordure.Value;
            if (s.CouleurBordure is not null) c.BorderBrush = s.CouleurBordure;
        }
        else
        {
            if (s.Couleur is not null) TextElement.SetForeground(element, s.Couleur);
            if (s.Taille is not null) TextElement.SetFontSize(element, s.Taille.Value);
            if (s.Graisse is not null) TextElement.SetFontWeight(element, s.Graisse.Value);
            if (s.Police is not null) TextElement.SetFontFamily(element, s.Police);
        }
        if (s.Ecart is not null && element is PileHumalis p) p.Ecart = s.Ecart.Value;
        if (s.Ecart is not null && element is GrilleHumalis g) g.Ecart = s.Ecart.Value;

        var cadre = element is not Control && (s.Fond is not null || s.Bordure is not null || s.Arrondi is not null || s.Remplissage is not null || s.Ombre is not null);
        FrameworkElement resultat = element;
        if (cadre)
        {
            var b = new Border { Child = element, Background = s.Fond, Padding = s.Remplissage ?? new Thickness(0), BorderThickness = s.Bordure ?? new Thickness(0), BorderBrush = s.CouleurBordure };
            if (s.Arrondi is not null) b.CornerRadius = new CornerRadius(s.Arrondi.Value);
            if (s.Ombre is not null) b.Effect = s.Ombre;
            if (s.Couleur is not null) TextElement.SetForeground(b, s.Couleur);
            resultat = b;
        }
        if (s.Marge is not null) resultat.Margin = s.Marge.Value;
        if (s.Largeur is not null) resultat.Width = s.Largeur.Value;
        if (s.LargeurMax is not null) resultat.MaxWidth = s.LargeurMax.Value;
        if (s.LargeurMin is not null) resultat.MinWidth = s.LargeurMin.Value;
        if (s.Hauteur is not null) resultat.Height = s.Hauteur.Value;
        if (s.HauteurMin is not null) resultat.MinHeight = s.HauteurMin.Value;
        if (s.HauteurMax is not null) resultat.MaxHeight = s.HauteurMax.Value;
        if (s.Opacite is not null) resultat.Opacity = s.Opacite.Value;
        if (s.Position is not null) resultat.HorizontalAlignment = s.Position.Value;
        else if (s.LargeurMax is not null || s.Pleine) resultat.HorizontalAlignment = s.Pleine ? HorizontalAlignment.Stretch : HorizontalAlignment.Left;
        return resultat;
    }
}
`;
