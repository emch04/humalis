/**
 * L'audio, la vidéo et les cartes en WPF. Un son ou une vidéo du projet est rangé dans
 * l'application, puis écrit une fois dans un dossier temporaire (le lecteur de Windows lit
 * un fichier, pas une ressource). La carte pose les tuiles d'OpenStreetMap (ou d'un autre
 * fournisseur), ses marqueurs, l'attribution toujours visible, le zoom et le déplacement.
 */
export const MEDIAS_CS = String.raw`// Produit par Humalis : l'audio, la vidéo et les cartes.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace Humalis;

public static class Medias
{
    /// <summary>L'adresse que le lecteur de Windows peut lire : une adresse web, ou le fichier du projet écrit sur le disque.</summary>
    public static Uri? Adresse(string chemin)
    {
        if (chemin.Length == 0) return null;
        if (chemin.StartsWith("https://") || chemin.StartsWith("http://") || chemin.StartsWith("file:")) return new Uri(chemin);
        var nom = chemin.TrimStart('.', '/').Replace('\\', '/');
        var dossier = Path.Combine(Path.GetTempPath(), "humalis-" + Configuration.Identifiant);
        var fichier = Path.Combine(dossier, nom.Replace('/', '_'));
        if (!File.Exists(fichier))
        {
            var ressource = System.Windows.Application.GetResourceStream(new Uri("pack://application:,,,/Ressources/" + nom));
            if (ressource is null) return null;
            Directory.CreateDirectory(dossier);
            using var sortie = File.Create(fichier);
            ressource.Stream.CopyTo(sortie);
        }
        return new Uri(fichier);
    }

    /// <summary>« audio "…" », « video "…" » : le lecteur, ses commandes, et la transcription à déplier.</summary>
    public static FrameworkElement Lecteur(Func<string> source, string description, bool video, bool boucle = false, string? transcription = null, bool automatique = false)
    {
        var lecteur = new MediaElement { LoadedBehavior = MediaState.Manual, UnloadedBehavior = MediaState.Stop, Stretch = Stretch.Uniform };
        AutomationProperties.SetName(lecteur, description);
        if (video) { lecteur.MaxHeight = 480; lecteur.HorizontalAlignment = HorizontalAlignment.Left; }
        var lecture = new Button { Content = Icones.Element("lecture", 14), Padding = new Thickness(10, 6, 10, 6) };
        AutomationProperties.SetName(lecture, "Lire");
        var position = new Slider { Minimum = 0, Maximum = 1, Width = 220, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(8, 0, 8, 0) };
        AutomationProperties.SetName(position, "Position");
        var temps = new TextBlock { VerticalAlignment = VerticalAlignment.Center, Opacity = 0.75 };
        var enLecture = false;
        void Etat(bool lit)
        {
            enLecture = lit;
            lecture.Content = Icones.Element(lit ? "pause" : "lecture", 14);
            AutomationProperties.SetName(lecture, lit ? "Mettre en pause" : "Lire");
        }
        lecture.Click += (_, _) => { if (enLecture) lecteur.Pause(); else lecteur.Play(); Etat(!enLecture); };
        var horloge = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(250) };
        var deplace = false;
        horloge.Tick += (_, _) =>
        {
            if (!lecteur.NaturalDuration.HasTimeSpan) return;
            var total = lecteur.NaturalDuration.TimeSpan;
            position.Maximum = Math.Max(1, total.TotalSeconds);
            if (!deplace) position.Value = lecteur.Position.TotalSeconds;
            temps.Text = $"{lecteur.Position:m\\:ss} / {total:m\\:ss}";
        };
        horloge.Start();
        Effet.Attacher(new Fermeture(() => { horloge.Stop(); lecteur.Close(); }));
        position.PreviewMouseDown += (_, _) => deplace = true;
        position.PreviewMouseUp += (_, _) => { deplace = false; lecteur.Position = TimeSpan.FromSeconds(position.Value); };
        lecteur.MediaEnded += (_, _) =>
        {
            lecteur.Position = TimeSpan.Zero;
            if (boucle) lecteur.Play(); else { lecteur.Stop(); Etat(false); }
        };
        lecteur.MediaFailed += (_, _) => temps.Text = "Ce média n'a pas pu être lu.";
        new Effet(() =>
        {
            var adresse = Medias.Adresse(source());
            lecteur.Source = adresse;
            Etat(false);
            if (automatique && adresse is not null) { lecteur.Play(); Etat(true); }
        });
        var commandes = new StackPanel { Orientation = Orientation.Horizontal };
        commandes.Children.Add(lecture);
        commandes.Children.Add(position);
        commandes.Children.Add(temps);
        var pile = new PileHumalis { Ecart = 6 };
        pile.Children.Add(lecteur);
        pile.Children.Add(commandes);
        if (!string.IsNullOrWhiteSpace(transcription))
            pile.Children.Add(new Expander { Header = "Transcription", Content = new TextBlock { Text = transcription, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) } });
        return pile;
    }
}

/// <summary>Un marqueur : sa position, son nom (la bulle) et son adresse.</summary>
public sealed record Marqueur(double Latitude, double Longitude, string Nom, string? Adresse);

public sealed class CarteHumalis : Grid
{
    private static readonly HttpClient http = CreerClient();
    private static readonly Dictionary<string, BitmapImage> cache = new();

    private static HttpClient CreerClient()
    {
        var c = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        // La politique d'OpenStreetMap demande que chaque application se nomme.
        c.DefaultRequestHeaders.UserAgent.ParseAdd("HumalisWindows/1.0 (+https://humalis.dev)");
        return c;
    }

    private readonly Canvas tuiles = new() { ClipToBounds = true };
    private readonly Canvas reperes = new() { ClipToBounds = true };
    private readonly string modele;
    private double latitude, longitude;
    private int zoom;
    private Marqueur[] marqueurs = Array.Empty<Marqueur>();
    private Point? prise;

    public CarteHumalis(string nom, string? modele, string attribution, string? lienAttribution)
    {
        this.modele = modele ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
        Height = 320;
        ClipToBounds = true;
        Background = Apparence.FondDiscret;
        AutomationProperties.SetName(this, nom);
        Children.Add(tuiles);
        Children.Add(reperes);
        var boutons = new StackPanel { HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(8) };
        foreach (var (texte, nomBouton, pas) in new[] { ("+", "Rapprocher", 1), ("−", "Éloigner", -1) })
        {
            var b = new Button { Content = texte, Width = 32, Height = 32, Margin = new Thickness(0, 0, 0, 4), FontSize = 16 };
            AutomationProperties.SetName(b, nomBouton);
            b.Click += (_, _) => { zoom = Math.Clamp(zoom + pas, 1, 19); Dessiner(); };
            boutons.Children.Add(b);
        }
        Children.Add(boutons);
        // L'attribution du fournisseur de tuiles : toujours affichée.
        var mention = new TextBlock { FontSize = 11, Padding = new Thickness(6, 2, 6, 2), Background = new SolidColorBrush(Color.FromArgb(0xCC, 0xFF, 0xFF, 0xFF)), Foreground = Brushes.Black, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Bottom };
        if (lienAttribution is not null)
        {
            var lien = new System.Windows.Documents.Hyperlink(new System.Windows.Documents.Run(attribution));
            lien.Click += (_, _) => UI.OuvrirExterne(lienAttribution);
            mention.Inlines.Add(lien);
        }
        else mention.Text = attribution;
        Children.Add(mention);
        SizeChanged += (_, _) => Dessiner();
        MouseLeftButtonDown += (_, e) => { prise = e.GetPosition(this); CaptureMouse(); };
        MouseLeftButtonUp += (_, _) => { prise = null; ReleaseMouseCapture(); };
        MouseMove += (_, e) =>
        {
            if (prise is not Point depart) return;
            var ici = e.GetPosition(this);
            var (px, py) = Pixel(latitude, longitude, zoom);
            (latitude, longitude) = Lieu(px - (ici.X - depart.X), py - (ici.Y - depart.Y), zoom);
            prise = ici;
            Dessiner();
        };
        MouseWheel += (_, e) => { zoom = Math.Clamp(zoom + (e.Delta > 0 ? 1 : -1), 1, 19); Dessiner(); };
    }

    private static (double x, double y) Pixel(double lat, double lon, int z)
    {
        var n = 256 * Math.Pow(2, z);
        var sin = Math.Sin(Math.Clamp(lat, -85, 85) * Math.PI / 180);
        return ((lon + 180) / 360 * n, (0.5 - Math.Log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n);
    }

    private static (double lat, double lon) Lieu(double x, double y, int z)
    {
        var n = 256 * Math.Pow(2, z);
        var lon = x / n * 360 - 180;
        var lat = Math.Atan(Math.Sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
        return (lat, lon);
    }

    /// <summary>Le centre et le zoom écrits ; sans eux, la carte s'ajuste à ses marqueurs.</summary>
    public void Placer(double? lat, double? lon, double? z, Marqueur[] liste)
    {
        marqueurs = liste;
        if (lat is double la && lon is double lo) { latitude = la; longitude = lo; zoom = (int)(z ?? 15); }
        else if (liste.Length > 0)
        {
            latitude = (liste.Min(m => m.Latitude) + liste.Max(m => m.Latitude)) / 2;
            longitude = (liste.Min(m => m.Longitude) + liste.Max(m => m.Longitude)) / 2;
            zoom = (int)(z ?? 16);
            var largeur = ActualWidth > 0 ? ActualWidth : 600;
            while (zoom > 2)
            {
                var (x1, y1) = Pixel(liste.Max(m => m.Latitude), liste.Min(m => m.Longitude), zoom);
                var (x2, y2) = Pixel(liste.Min(m => m.Latitude), liste.Max(m => m.Longitude), zoom);
                if (x2 - x1 < largeur - 80 && y2 - y1 < Height - 80) break;
                zoom--;
            }
        }
        else { latitude = 46.6; longitude = 2.4; zoom = (int)(z ?? 5); }
        Dessiner();
    }

    private void Dessiner()
    {
        var l = ActualWidth;
        var h = ActualHeight;
        if (l <= 0 || h <= 0) return;
        tuiles.Children.Clear();
        reperes.Children.Clear();
        var (cx, cy) = Pixel(latitude, longitude, zoom);
        var gauche = cx - l / 2;
        var haut = cy - h / 2;
        var max = 1 << zoom;
        for (var tx = (int)Math.Floor(gauche / 256); tx <= (int)Math.Floor((gauche + l) / 256); tx++)
            for (var ty = (int)Math.Floor(haut / 256); ty <= (int)Math.Floor((haut + h) / 256); ty++)
            {
                if (ty < 0 || ty >= max) continue;
                var x = ((tx % max) + max) % max;
                var image = new Image { Width = 256, Height = 256 };
                Canvas.SetLeft(image, tx * 256 - gauche);
                Canvas.SetTop(image, ty * 256 - haut);
                tuiles.Children.Add(image);
                _ = Charger(image, modele.Replace("{z}", zoom.ToString(CultureInfo.InvariantCulture)).Replace("{x}", x.ToString(CultureInfo.InvariantCulture)).Replace("{y}", ty.ToString(CultureInfo.InvariantCulture)));
            }
        foreach (var m in marqueurs)
        {
            var (mx, my) = Pixel(m.Latitude, m.Longitude, zoom);
            var epingle = new Border { Width = 18, Height = 18, CornerRadius = new CornerRadius(9), Background = Apparence.Accent, BorderBrush = Brushes.White, BorderThickness = new Thickness(3), Cursor = Cursors.Hand, ToolTip = m.Adresse is null ? m.Nom : m.Nom + "\n" + m.Adresse };
            AutomationProperties.SetName(epingle, m.Adresse is null ? m.Nom : $"{m.Nom}, {m.Adresse}");
            Canvas.SetLeft(epingle, mx - gauche - 9);
            Canvas.SetTop(epingle, my - haut - 9);
            reperes.Children.Add(epingle);
        }
    }

    private static async Task Charger(Image image, string adresse)
    {
        try
        {
            if (!cache.TryGetValue(adresse, out var bitmap))
            {
                var octets = await http.GetByteArrayAsync(adresse);
                bitmap = new BitmapImage();
                bitmap.BeginInit();
                bitmap.StreamSource = new MemoryStream(octets);
                bitmap.CacheOption = BitmapCacheOption.OnLoad;
                bitmap.EndInit();
                bitmap.Freeze();
                cache[adresse] = bitmap;
            }
            image.Source = bitmap;
        }
        catch (Exception) { }
    }

    /// <summary>« carte "…" » : la carte et ses marqueurs, replacés quand la liste change.</summary>
    public static FrameworkElement Creer(string nom, Func<(double? lat, double? lon, double? zoom)> centre, Func<Marqueur[]> liste, string? modele = null, string attribution = "© les contributeurs d’OpenStreetMap", string? lienAttribution = "https://www.openstreetmap.org/copyright")
    {
        var carte = new CarteHumalis(nom, modele, attribution, lienAttribution);
        new Effet(() =>
        {
            var (lat, lon, zoom) = centre();
            var marqueurs = liste();
            carte.Placer(lat, lon, zoom, marqueurs);
        });
        return carte;
    }
}
`;
