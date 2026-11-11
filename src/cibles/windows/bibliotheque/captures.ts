/**
 * Les médias sur Windows. « enregistrer audio dans note » et « enregistrer video dans clip » :
 * Windows.Media.Capture, qui marche dans une application sans paquet MSIX. Le son est écrit en
 * .m4a, la vidéo en .mp4. « recadrer photo » : une fenêtre WPF. Le résultat a la forme d'un
 * fichier choisi (voir Fichiers.FicheDe) ; annuler rend null et la variable ne change pas.
 * Le scan de document n'est pas prévu sur Windows.
 */

/** L'enregistrement : il demande les API de Windows (WinRT), donc un .NET ciblant Windows 10. */
export const ENREGISTREMENT_CS = String.raw`// Produit par Humalis : enregistrer un son ou une vidéo, avec Windows.Media.Capture.
using System;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using global::Windows.Devices.Enumeration;
using global::Windows.Graphics.Imaging;
using global::Windows.Media.Capture;
using global::Windows.Media.Capture.Frames;
using global::Windows.Media.MediaProperties;
using global::Windows.Storage;

namespace Humalis;

public static class Enregistrement
{
    private enum Etape { Preparation, Pret, EnCours, Arret, Termine }

    private static Button Bouton(string glyphe, string nom, string id)
    {
        var bouton = new Button { Content = new TextBlock { Text = glyphe, FontFamily = Icones.Police, FontSize = 22 }, Width = 52, Height = 52, Margin = new Thickness(10, 0, 10, 0) };
        AutomationProperties.SetName(bouton, nom);
        AutomationProperties.SetAutomationId(bouton, id);
        bouton.ToolTip = nom;
        return bouton;
    }

    /// <summary>Ouvre le micro et, pour une vidéo, la caméra ; null si l'appareil ou Windows refuse, et la personne le lit.</summary>
    private static async Task<MediaCapture?> Ouvrir(bool video)
    {
        var micros = await DeviceInformation.FindAllAsync(DeviceClass.AudioCapture);
        if (micros.Count == 0)
        {
            Messages.Afficher("Cet ordinateur n'a pas de micro.", "erreur");
            return null;
        }
        var reglages = new MediaCaptureInitializationSettings
        {
            StreamingCaptureMode = video ? StreamingCaptureMode.AudioAndVideo : StreamingCaptureMode.Audio,
            MemoryPreference = MediaCaptureMemoryPreference.Cpu,
            SharingMode = MediaCaptureSharingMode.ExclusiveControl,
        };
        if (video)
        {
            var cameras = await DeviceInformation.FindAllAsync(DeviceClass.VideoCapture);
            if (cameras.Count == 0)
            {
                Messages.Afficher("Cet ordinateur n'a pas de caméra.", "erreur");
                return null;
            }
            reglages.VideoDeviceId = cameras[0].Id;
        }
        var capture = new MediaCapture();
        try
        {
            await capture.InitializeAsync(reglages);
            return capture;
        }
        catch (UnauthorizedAccessException)
        {
            capture.Dispose();
            Messages.Afficher(video ? "L'accès à la caméra ou au micro est refusé : autorisez les applications de bureau dans Paramètres, Confidentialité." : "L'accès au micro est refusé : autorisez les applications de bureau dans Paramètres, Confidentialité.", "erreur");
            return null;
        }
        catch (Exception)
        {
            capture.Dispose();
            Messages.Afficher(video ? "La caméra n'a pas pu être ouverte." : "Le micro n'a pas pu être ouvert.", "erreur");
            return null;
        }
    }

    /// <summary>L'image de la caméra : la source d'aperçu si elle existe, sinon celle de l'enregistrement.</summary>
    private static async Task<MediaFrameReader?> LecteurImages(MediaCapture capture, Action<SoftwareBitmap> recue)
    {
        var couleurs = capture.FrameSources.Values.Where(s => s.Info.SourceKind == MediaFrameSourceKind.Color).ToList();
        var source = couleurs.FirstOrDefault(s => s.Info.MediaStreamType == MediaStreamType.VideoPreview) ?? couleurs.FirstOrDefault();
        if (source is null) return null;
        try
        {
            var lecteur = await capture.CreateFrameReaderAsync(source, MediaEncodingSubtypes.Bgra8);
            lecteur.AcquisitionMode = MediaFrameReaderAcquisitionMode.Realtime;
            lecteur.FrameArrived += (l, _) =>
            {
                using var image = l.TryAcquireLatestFrame();
                var bitmap = image?.VideoMediaFrame?.SoftwareBitmap;
                if (bitmap is null) return;
                recue(SoftwareBitmap.Convert(bitmap, BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied));
            };
            return await lecteur.StartAsync() == MediaFrameReaderStartStatus.Success ? lecteur : null;
        }
        catch (Exception) { return null; }
    }

    private static string Duree(int s) => $"{s / 60:00}:{s % 60:00}";

    /// <summary>« enregistrer audio dans note », « enregistrer video dans clip » : démarrer, arrêter, réécouter, valider ou annuler.</summary>
    public static async Task<Fiche?> Media(string genre)
    {
        var video = genre == "video";
        var capture = await Ouvrir(video);
        if (capture is null) return null;

        var dossier = Path.Combine(Path.GetTempPath(), "humalis-" + Configuration.Identifiant, "captures");
        Directory.CreateDirectory(dossier);
        var dossierWinrt = await StorageFolder.GetFolderFromPathAsync(dossier);

        var fenetre = new Window
        {
            Title = video ? "Enregistrer une vidéo" : "Enregistrer un audio", Width = 680, Height = video ? 620 : 340, MinWidth = 420, MinHeight = 300,
            WindowStartupLocation = WindowStartupLocation.CenterOwner, Owner = System.Windows.Application.Current?.MainWindow, ShowInTaskbar = false,
        };
        var duree = new TextBlock { Text = "00:00", FontSize = 34, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 0, 0, 12) };
        AutomationProperties.SetName(duree, "Durée");
        AutomationProperties.SetLiveSetting(duree, AutomationLiveSetting.Off);
        var milieu = new ContentControl { HorizontalContentAlignment = HorizontalAlignment.Stretch, VerticalContentAlignment = VerticalAlignment.Stretch };
        var image = new System.Windows.Controls.Image { Stretch = System.Windows.Media.Stretch.Uniform };
        AutomationProperties.SetName(image, "Image de la caméra");
        var micro = new TextBlock { Text = "", FontFamily = Icones.Police, FontSize = 64, Opacity = 0.6, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        var erreur = new TextBlock { TextWrapping = TextWrapping.Wrap, Foreground = Apparence.Pinceau("#C42B1C"), HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 8, 0, 0) };
        AutomationProperties.SetLiveSetting(erreur, AutomationLiveSetting.Assertive);
        var annuler = Bouton("", "Annuler", "media_annuler");
        annuler.IsCancel = true;
        var demarrer = Bouton("", "Démarrer", "media_demarrer");
        var arreter = Bouton("", "Arrêter", "media_arreter");
        var recommencer = Bouton("", "Recommencer", "media_recommencer");
        var valider = Bouton("", "Valider", "media_valider");
        var boutons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 12, 0, 0) };
        foreach (var b in new[] { annuler, demarrer, arreter, recommencer, valider }) boutons.Children.Add(b);
        var grille = new DockPanel { Margin = new Thickness(20) };
        DockPanel.SetDock(duree, Dock.Top);
        DockPanel.SetDock(boutons, Dock.Bottom);
        DockPanel.SetDock(erreur, Dock.Bottom);
        grille.Children.Add(duree);
        grille.Children.Add(boutons);
        grille.Children.Add(erreur);
        grille.Children.Add(milieu);
        fenetre.Content = grille;

        var etape = Etape.Preparation;
        string? chemin = null;
        Fiche? resultat = null;
        Effet? relecture = null;
        MediaFrameReader? images = null;
        WriteableBitmap? surface = null;
        var enTrain = 0;
        var debut = DateTime.UtcNow;
        var horloge = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(250) };
        horloge.Tick += (_, _) => duree.Text = Duree((int)(DateTime.UtcNow - debut).TotalSeconds);

        void Montrer(Etape nouvelle)
        {
            etape = nouvelle;
            demarrer.Visibility = etape == Etape.Pret ? Visibility.Visible : Visibility.Collapsed;
            arreter.Visibility = etape == Etape.EnCours ? Visibility.Visible : Visibility.Collapsed;
            recommencer.Visibility = etape == Etape.Termine ? Visibility.Visible : Visibility.Collapsed;
            valider.Visibility = etape == Etape.Termine ? Visibility.Visible : Visibility.Collapsed;
            // Hors enregistrement, la couleur du thème : un pinceau vide rendrait la durée invisible.
            if (etape == Etape.EnCours) duree.Foreground = Apparence.Pinceau("#C42B1C");
            else duree.ClearValue(TextBlock.ForegroundProperty);
            if (etape == Etape.Termine) return;
            relecture?.Dispose();
            relecture = null;
            milieu.Content = video ? image : micro;
        }

        void Effacer()
        {
            if (chemin is null) return;
            try { File.Delete(chemin); } catch (Exception) { /* Le fichier est encore ouvert : le dossier temporaire sera vidé par Windows. */ }
            chemin = null;
        }

        void Recue(SoftwareBitmap bitmap)
        {
            // Une image à la fois : si l'écran est en retard, les suivantes sont sautées.
            if (Interlocked.CompareExchange(ref enTrain, 1, 0) != 0) { bitmap.Dispose(); return; }
            var largeur = bitmap.PixelWidth;
            var hauteur = bitmap.PixelHeight;
            var octets = new byte[4 * largeur * hauteur];
            bitmap.CopyToBuffer(octets.AsBuffer());
            bitmap.Dispose();
            fenetre.Dispatcher.BeginInvoke(() =>
            {
                try
                {
                    if (surface is null || surface.PixelWidth != largeur || surface.PixelHeight != hauteur)
                    {
                        surface = new WriteableBitmap(largeur, hauteur, 96, 96, System.Windows.Media.PixelFormats.Bgra32, null);
                        image.Source = surface;
                    }
                    surface.WritePixels(new Int32Rect(0, 0, largeur, hauteur), octets, 4 * largeur, 0);
                }
                finally { Interlocked.Exchange(ref enTrain, 0); }
            });
        }

        async Task Arreter()
        {
            if (etape != Etape.EnCours) return;
            Montrer(Etape.Arret);
            horloge.Stop();
            try { await capture.StopRecordAsync(); }
            catch (Exception)
            {
                Effacer();
                erreur.Text = "L'enregistrement a échoué. Réessayez.";
                Montrer(Etape.Pret);
                return;
            }
            if (chemin is null || new FileInfo(chemin).Length == 0)
            {
                Effacer();
                erreur.Text = "L'enregistrement est vide. Réessayez.";
                Montrer(Etape.Pret);
                return;
            }
            var adresse = new Uri(chemin).AbsoluteUri;
            FrameworkElement? lecteur = null;
            relecture = new Effet(() => lecteur = Medias.Lecteur(() => adresse, video ? "Revoir la vidéo" : "Réécouter", video));
            milieu.Content = lecteur;
            Montrer(Etape.Termine);
        }

        demarrer.Click += async (_, _) =>
        {
            if (etape != Etape.Pret) return;
            Effacer();
            erreur.Text = "";
            duree.Text = "00:00";
            try
            {
                var fichier = await dossierWinrt.CreateFileAsync((video ? "video-" : "audio-") + Guid.NewGuid() + (video ? ".mp4" : ".m4a"), CreationCollisionOption.ReplaceExisting);
                chemin = fichier.Path;
                var profil = video ? MediaEncodingProfile.CreateMp4(VideoEncodingQuality.Auto) : MediaEncodingProfile.CreateM4a(AudioEncodingQuality.High);
                await capture.StartRecordToStorageFileAsync(profil, fichier);
            }
            catch (Exception)
            {
                Effacer();
                erreur.Text = "L'enregistrement n'a pas pu démarrer.";
                return;
            }
            debut = DateTime.UtcNow;
            horloge.Start();
            Montrer(Etape.EnCours);
        };
        arreter.Click += async (_, _) => await Arreter();
        recommencer.Click += (_, _) =>
        {
            relecture?.Dispose();
            relecture = null;
            milieu.Content = null;
            Effacer();
            duree.Text = "00:00";
            Montrer(Etape.Pret);
        };
        valider.Click += (_, _) =>
        {
            if (chemin is null) return;
            var fiche = Fichiers.FicheDe(chemin, false);
            fiche["apercu"] = new Uri(chemin).AbsoluteUri;
            resultat = fiche;
            fenetre.Close();
        };
        annuler.Click += (_, _) => fenetre.Close();
        // Une caméra débranchée, un micro retiré : ce qui a été enregistré est gardé.
        capture.Failed += (_, _) => fenetre.Dispatcher.BeginInvoke(async () =>
        {
            erreur.Text = "L'appareil d'enregistrement ne répond plus.";
            await Arreter();
        });

        fenetre.Loaded += async (_, _) =>
        {
            if (video)
            {
                images = await LecteurImages(capture, Recue);
                if (images is null) erreur.Text = "L'image de la caméra n'est pas disponible ; l'enregistrement reste possible.";
            }
            Montrer(Etape.Pret);
        };
        Montrer(Etape.Preparation);
        var fermeture = new TaskCompletionSource();
        fenetre.Closed += async (_, _) =>
        {
            horloge.Stop();
            relecture?.Dispose();
            try
            {
                if (etape == Etape.EnCours) await capture.StopRecordAsync();
                if (images is not null) await images.StopAsync();
            }
            catch (Exception) { /* La caméra est déjà partie. */ }
            images?.Dispose();
            capture.Dispose();
            if (resultat is null) Effacer();
            fermeture.TrySetResult();
        };
        fenetre.ShowDialog();
        await fermeture.Task;
        return resultat;
    }
}
`;

/** Le recadrage : du WPF seul. */
export const RECADRAGE_CS = String.raw`// Produit par Humalis : recadrer une photo.
using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;

namespace Humalis;

public static class Recadrage
{
    /// <summary>L'image telle qu'on la voit : WPF ne suit pas seul le sens enregistré par l'appareil photo.</summary>
    private static BitmapSource? Lire(string chemin)
    {
        try
        {
            using var flux = File.OpenRead(chemin);
            var image = BitmapDecoder.Create(flux, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad).Frames[0];
            ushort sens = 1;
            try { if (image.Metadata is BitmapMetadata m && m.GetQuery("/app1/ifd/{ushort=274}") is ushort lu) sens = lu; }
            catch (Exception) { /* Ce format n'a pas cette information. */ }
            Transform? t = sens switch
            {
                2 => new ScaleTransform(-1, 1),
                3 => new RotateTransform(180),
                4 => new ScaleTransform(1, -1),
                5 => new TransformGroup { Children = { new RotateTransform(90), new ScaleTransform(-1, 1) } },
                6 => new RotateTransform(90),
                7 => new TransformGroup { Children = { new RotateTransform(270), new ScaleTransform(-1, 1) } },
                8 => new RotateTransform(270),
                _ => null,
            };
            BitmapSource droite = t is null ? image : new TransformedBitmap(image, t);
            droite.Freeze();
            return droite;
        }
        catch (Exception) { return null; }
    }

    private static Button Bouton(string glyphe, string nom, string id)
    {
        var bouton = new Button { Content = new TextBlock { Text = glyphe, FontFamily = Icones.Police, FontSize = 22 }, Width = 52, Height = 52, Margin = new Thickness(10, 0, 10, 0) };
        AutomationProperties.SetName(bouton, nom);
        AutomationProperties.SetAutomationId(bouton, id);
        bouton.ToolTip = nom;
        return bouton;
    }

    /// <summary>« recadrer photo » : la variable reçoit l'image recadrée ; annuler la laisse telle quelle.</summary>
    public static Task<Fiche?> Photo(object? valeur)
    {
        if (V.Champ(valeur, "chemin") is not string chemin || !V.T(V.Champ(valeur, "mime")).StartsWith("image/"))
        {
            Messages.Afficher("La variable ne contient pas une image à recadrer.", "erreur");
            return Task.FromResult<Fiche?>(null);
        }
        var image = Lire(chemin);
        if (image is null)
        {
            Messages.Afficher("L'image ne peut pas être ouverte.", "erreur");
            return Task.FromResult<Fiche?>(null);
        }

        const double LargeurMax = 720, HauteurMax = 480;
        var e = Math.Min(LargeurMax / image.PixelWidth, HauteurMax / image.PixelHeight);
        var l = image.PixelWidth * e;
        var h = image.PixelHeight * e;
        var toile = new Canvas { Width = l, Height = h, Background = Brushes.Transparent, ClipToBounds = true, Focusable = true, Cursor = Cursors.Cross };
        AutomationProperties.SetName(toile, "Zone de recadrage. Plus et moins élargissent ou resserrent la zone.");
        AutomationProperties.SetAutomationId(toile, "media_zone");
        var fond = new System.Windows.Controls.Image { Source = image, Width = l, Height = h, Stretch = Stretch.Fill };
        var voile = new System.Windows.Shapes.Path { Fill = new SolidColorBrush(Color.FromArgb(128, 0, 0, 0)) };
        var cadre = new Rectangle { Stroke = Brushes.White, StrokeThickness = 2 };
        var coins = new Ellipse[4];
        toile.Children.Add(fond);
        toile.Children.Add(voile);
        toile.Children.Add(cadre);
        for (var i = 0; i < 4; i++)
        {
            coins[i] = new Ellipse { Width = 16, Height = 16, Fill = Brushes.White };
            toile.Children.Add(coins[i]);
        }

        var zone = new Rect(0, 0, l, h);
        void Dessiner()
        {
            voile.Data = new CombinedGeometry(GeometryCombineMode.Exclude, new RectangleGeometry(new Rect(0, 0, l, h)), new RectangleGeometry(zone));
            Canvas.SetLeft(cadre, zone.X);
            Canvas.SetTop(cadre, zone.Y);
            cadre.Width = zone.Width;
            cadre.Height = zone.Height;
            var points = new[] { zone.TopLeft, zone.TopRight, zone.BottomLeft, zone.BottomRight };
            for (var i = 0; i < 4; i++)
            {
                Canvas.SetLeft(coins[i], points[i].X - 8);
                Canvas.SetTop(coins[i], points[i].Y - 8);
            }
        }

        Point Borne(Point p) => new(Math.Clamp(p.X, 0, l), Math.Clamp(p.Y, 0, h));
        int coin = -1;
        Point? nouveau = null;
        Point? depart = null;
        var origine = zone;
        var entiere = new Rect(0, 0, l, h);
        const double Minimum = 12;

        toile.MouseLeftButtonDown += (_, a) =>
        {
            var p = Borne(a.GetPosition(toile));
            toile.Focus();
            toile.CaptureMouse();
            var points = new[] { zone.TopLeft, zone.TopRight, zone.BottomLeft, zone.BottomRight };
            coin = Array.FindIndex(points, c => (c - p).Length < 16);
            nouveau = null;
            depart = null;
            origine = zone;
            if (coin >= 0) return;
            if (zone != entiere && zone.Contains(p)) depart = p;
            else nouveau = p;
        };
        toile.MouseMove += (_, a) =>
        {
            if (!toile.IsMouseCaptured) return;
            var p = Borne(a.GetPosition(toile));
            if (coin >= 0)
            {
                var gauche = coin % 2 == 0 ? Math.Min(p.X, origine.Right - Minimum) : origine.Left;
                var droite = coin % 2 == 1 ? Math.Max(p.X, origine.Left + Minimum) : origine.Right;
                var haut = coin < 2 ? Math.Min(p.Y, origine.Bottom - Minimum) : origine.Top;
                var bas = coin >= 2 ? Math.Max(p.Y, origine.Top + Minimum) : origine.Bottom;
                zone = new Rect(new Point(gauche, haut), new Point(droite, bas));
            }
            else if (depart is Point d)
            {
                var dx = Math.Clamp(p.X - d.X, -origine.Left, l - origine.Right);
                var dy = Math.Clamp(p.Y - d.Y, -origine.Top, h - origine.Bottom);
                zone = new Rect(origine.X + dx, origine.Y + dy, origine.Width, origine.Height);
            }
            else if (nouveau is Point n) zone = new Rect(n, p);
            Dessiner();
        };
        toile.MouseLeftButtonUp += (_, _) => toile.ReleaseMouseCapture();
        toile.KeyDown += (_, a) =>
        {
            var pas = a.Key is Key.Add or Key.OemPlus ? 0.05 : a.Key is Key.Subtract or Key.OemMinus ? -0.05 : 0;
            if (pas == 0) return;
            var nl = Math.Clamp(zone.Width + pas * l, Minimum, l);
            var nh = Math.Clamp(zone.Height + pas * h, Minimum, h);
            var cx = zone.X + zone.Width / 2;
            var cy = zone.Y + zone.Height / 2;
            zone = new Rect(Math.Clamp(cx - nl / 2, 0, l - nl), Math.Clamp(cy - nh / 2, 0, h - nh), nl, nh);
            Dessiner();
            a.Handled = true;
        };

        var fenetre = new Window
        {
            Title = "Recadrer la photo", SizeToContent = SizeToContent.WidthAndHeight, ResizeMode = ResizeMode.NoResize,
            WindowStartupLocation = WindowStartupLocation.CenterOwner, Owner = System.Windows.Application.Current?.MainWindow, ShowInTaskbar = false,
        };
        var erreur = new TextBlock { TextWrapping = TextWrapping.Wrap, Foreground = Apparence.Pinceau("#C42B1C"), HorizontalAlignment = HorizontalAlignment.Center };
        AutomationProperties.SetLiveSetting(erreur, AutomationLiveSetting.Assertive);
        var annuler = Bouton("", "Annuler", "media_annuler");
        annuler.IsCancel = true;
        var valider = Bouton("", "Valider", "media_valider");
        Fiche? resultat = null;
        annuler.Click += (_, _) => fenetre.Close();
        valider.Click += (_, _) =>
        {
            var x = (int)Math.Round(zone.X / e);
            var y = (int)Math.Round(zone.Y / e);
            var w = Math.Min((int)Math.Round(zone.Width / e), image.PixelWidth - x);
            var hh = Math.Min((int)Math.Round(zone.Height / e), image.PixelHeight - y);
            if (w < 2 || hh < 2)
            {
                erreur.Text = "Tracez une zone à conserver.";
                return;
            }
            try
            {
                var png = V.T(V.Champ(valeur, "mime")) == "image/png";
                BitmapEncoder encodeur = png ? new PngBitmapEncoder() : new JpegBitmapEncoder { QualityLevel = 92 };
                encodeur.Frames.Add(BitmapFrame.Create(new CroppedBitmap(image, new Int32Rect(x, y, w, hh))));
                var dossier = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "humalis-" + Configuration.Identifiant, "captures", Guid.NewGuid().ToString());
                Directory.CreateDirectory(dossier);
                var nom = System.IO.Path.GetFileNameWithoutExtension(V.T(V.Champ(valeur, "nom")));
                var sortie = System.IO.Path.Combine(dossier, (nom.Length > 0 ? nom : "photo") + "-recadree" + (png ? ".png" : ".jpg"));
                using (var flux = File.Create(sortie)) encodeur.Save(flux);
                resultat = Fichiers.FicheDe(sortie, true);
                fenetre.Close();
            }
            catch (Exception) { erreur.Text = "Le recadrage a échoué."; }
        };

        var boutons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Center };
        boutons.Children.Add(annuler);
        boutons.Children.Add(valider);
        var pile = new PileHumalis { Ecart = 12, Margin = new Thickness(20) };
        pile.Children.Add(new TextBlock { Text = "Tracez un rectangle, ou tirez ses coins.", Opacity = 0.75, HorizontalAlignment = HorizontalAlignment.Center });
        pile.Children.Add(toile);
        pile.Children.Add(erreur);
        pile.Children.Add(boutons);
        fenetre.Content = pile;
        Dessiner();
        fenetre.ShowDialog();
        return Task.FromResult(resultat);
    }
}
`;
