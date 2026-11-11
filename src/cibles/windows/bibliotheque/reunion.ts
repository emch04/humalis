/**
 * Les réunions et les appels sur Windows : LiveKit par sa bibliothèque native (livekit_ffi.dll, x64 et ARM64),
 * à travers le paquet Livekit.Rtc.Dotnet. Cette bibliothèque transporte le son et l'image, sans toucher aux
 * appareils : le micro et le haut-parleur passent par NAudio (winmm, présent sur tout Windows), la caméra par
 * Windows.Media.Capture (comme « enregistrer video »), l'écran par une copie GDI. La barre (micro, caméra,
 * écran, main) s'écrit en Humalis ; ici, l'image des participants et les gestes, comme Reunion.swift.
 */

/** Versions épinglées. 0.1.7 : les versions 0.1.5 et 0.1.6 corrigent des plantages natifs en capturant des images, et 0.1.6 ajoute les attributs des participants. */
export const PAQUETS_REUNION_WINDOWS = [
  { nom: 'Livekit.Rtc.Dotnet', version: '0.1.7' },
  { nom: 'NAudio.WinMM', version: '2.2.1' },
] as const;

export const REUNION_CS = String.raw`// Produit par Humalis : la réunion en cours, par LiveKit (livekit_ffi.dll, x64 et ARM64).
using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using LiveKit.Rtc;
using NAudio.Wave;
using global::Windows.Devices.Enumeration;
using global::Windows.Graphics.Imaging;
using global::Windows.Media.Capture;
using global::Windows.Media.Capture.Frames;
using global::Windows.Media.MediaProperties;
using P = LiveKit.Proto;

namespace Humalis;

public static class Reunion
{
    /// <summary>L'image d'une piste vidéo, mise à jour à chaque trame ; les tuiles la montrent sans la copier.</summary>
    private sealed class Rendu : IDisposable
    {
        public WriteableBitmap? Image;
        public readonly CancellationTokenSource Arret = new();
        private int enAttente;

        /// <summary>Une trame BGRA : l'écran la dessine quand il est libre ; une trame arrivée entre-temps remplace la précédente.</summary>
        public void Recevoir(byte[] octets, int largeur, int hauteur)
        {
            if (Interlocked.Exchange(ref enAttente, 1) == 1) return;
            Application.Current?.Dispatcher.BeginInvoke(() =>
            {
                enAttente = 0;
                if (Arret.IsCancellationRequested) return;
                var nouvelle = Image is null || Image.PixelWidth != largeur || Image.PixelHeight != hauteur;
                if (nouvelle) Image = new WriteableBitmap(largeur, hauteur, 96, 96, PixelFormats.Bgr32, null);
                Image!.WritePixels(new Int32Rect(0, 0, largeur, hauteur), octets, largeur * 4, 0);
                if (nouvelle) Dessiner();
            });
        }

        public void Dispose() => Arret.Cancel();
    }

    /// <summary>Le son d'une personne : ses trames vont au haut-parleur par winmm.</summary>
    private sealed class HautParleur : IDisposable
    {
        private readonly WaveOutEvent sortie = new() { DesiredLatency = 120 };
        private readonly BufferedWaveProvider tampon = new(new WaveFormat(48000, 16, 1)) { DiscardOnBufferOverflow = true, BufferDuration = TimeSpan.FromSeconds(1) };
        private readonly CancellationTokenSource arret = new();

        public HautParleur(Track piste)
        {
            sortie.Init(tampon);
            sortie.Play();
            var flux = AudioStream.FromTrack(piste, 48000, 1);
            _ = Task.Run(async () =>
            {
                try { await foreach (var e in flux.WithCancellation(arret.Token)) { var o = e.Frame.DataBytes; tampon.AddSamples(o, 0, o.Length); } }
                catch (OperationCanceledException) { }
                catch (Exception) { }
                finally { flux.Dispose(); }
            });
        }

        public void Dispose()
        {
            arret.Cancel();
            sortie.Stop();
            sortie.Dispose();
        }
    }

    private static Room? piece;
    private static string salle = "";
    private static readonly Dictionary<string, Rendu> rendus = new();
    private static readonly Dictionary<string, HautParleur> sons = new();
    private static readonly List<WeakReference<WrapPanel>> grilles = new();

    // Ce qui part de cet ordinateur.
    private static AudioSource? sourceMicro;
    private static LocalAudioTrack? pisteMicro;
    private static string? sidMicro;
    private static WaveInEvent? micro;
    private static VideoSource? sourceCamera;
    private static string? sidCamera;
    private static MediaCapture? camera;
    private static MediaFrameReader? lecteurCamera;
    private static readonly Rendu renduLocal = new();
    private static VideoSource? sourceEcran;
    private static string? sidEcran;
    private static CancellationTokenSource? arretEcran;

    private static void SurEcran(Action action) => Application.Current?.Dispatcher.BeginInvoke(action);

    // ─── La grille ──────────────────────────────────────────────────────────

    /// <summary>« reunion "…" » : les images des participants, en grille.</summary>
    public static FrameworkElement Vue()
    {
        var grille = new WrapPanel { Orientation = Orientation.Horizontal };
        AutomationProperties.SetName(grille, "Participants de la réunion");
        grilles.Add(new WeakReference<WrapPanel>(grille));
        Remplir(grille);
        return grille;
    }

    private static void Dessiner()
    {
        grilles.RemoveAll(g => !g.TryGetTarget(out _));
        foreach (var g in grilles) if (g.TryGetTarget(out var grille)) Remplir(grille);
    }

    private static bool Coupe(Participant p, P.TrackSource source) =>
        !p.TrackPublications.Values.Any(t => t.Source == source && !t.IsMuted);

    private static void Remplir(WrapPanel grille)
    {
        grille.Children.Clear();
        var p = piece;
        if (p?.LocalParticipant is null) return;
        var tous = new List<Participant> { p.LocalParticipant };
        tous.AddRange(p.RemoteParticipants.Values.OrderBy(r => r.Name ?? r.Identity, StringComparer.CurrentCulture));
        foreach (var personne in tous)
        {
            var locale = personne is LocalParticipant;
            var nom = string.IsNullOrEmpty(personne.Name) ? personne.Identity : personne.Name;
            var main = personne.Attributes.TryGetValue("main", out var m) && m == "1";
            var microCoupe = locale ? (pisteMicro is null || pisteMicro.IsMuted) : Coupe(personne, P.TrackSource.SourceMicrophone);
            if (!locale)
            {
                var ecran = personne.TrackPublications.Values.FirstOrDefault(t => t.Source == P.TrackSource.SourceScreenshare && !t.IsMuted && t.Track is not null);
                if (ecran is not null && rendus.TryGetValue(ecran.Sid, out var r)) grille.Children.Add(Tuile(nom, r.Image, main, microCoupe, false));
            }
            WriteableBitmap? image = null;
            if (locale) image = sidCamera is not null ? renduLocal.Image : null;
            else
            {
                var cam = personne.TrackPublications.Values.FirstOrDefault(t => t.Source == P.TrackSource.SourceCamera && !t.IsMuted && t.Track is not null);
                if (cam is not null && rendus.TryGetValue(cam.Sid, out var r)) image = r.Image;
            }
            grille.Children.Add(Tuile(nom, image, main, microCoupe, locale));
        }
    }

    private static FrameworkElement Tuile(string nom, WriteableBitmap? image, bool main, bool microCoupe, bool miroir)
    {
        var legende = nom + (main ? " ✋" : "") + (microCoupe ? " (micro coupé)" : "");
        var fond = new Grid { Width = 320, Height = 180, Margin = new Thickness(0, 0, 8, 8), Background = new SolidColorBrush(Color.FromRgb(0x1C, 0x1C, 0x1C)), ClipToBounds = true };
        if (image is not null)
        {
            var vue = new Image { Source = image, Stretch = Stretch.UniformToFill };
            if (miroir) { vue.RenderTransformOrigin = new Point(0.5, 0.5); vue.RenderTransform = new ScaleTransform(-1, 1); }
            fond.Children.Add(vue);
        }
        else fond.Children.Add(new TextBlock { Text = nom.Length > 0 ? nom[..1].ToUpperInvariant() : "?", FontSize = 40, Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center });
        fond.Children.Add(new TextBlock { Text = legende, Foreground = Brushes.White, Margin = new Thickness(8), VerticalAlignment = VerticalAlignment.Bottom, TextWrapping = TextWrapping.Wrap });
        AutomationProperties.SetName(fond, legende);
        return new Border { CornerRadius = new CornerRadius(8), Child = fond, ClipToBounds = true };
    }

    // ─── Entrer, sortir ─────────────────────────────────────────────────────

    /// <summary>Dit au serveur que l'état a changé : les listes de participants se relisent.</summary>
    private static void Annoncer()
    {
        if (salle.Length == 0) return;
        var nom = salle;
        _ = Serveur.Reussi("/api/salles_geste", "POST", V.FicheDe(("salle", nom), ("participant", ""), ("geste", "etat")));
    }

    public static async Task Rejoindre(string nom)
    {
        if (piece is not null && salle == nom) return;
        await Quitter();
        object? acces;
        try { acces = await Serveur.Appel("/api/salles_jeton", "POST", V.FicheDe(("salle", nom))); }
        catch (ErreurHumalis e) { Messages.Afficher(e.Message, "erreur"); return; }
        var nouvelle = new Room();
        nouvelle.ParticipantConnected += (_, _) => SurEcran(Dessiner);
        nouvelle.ParticipantDisconnected += (_, _) => SurEcran(Dessiner);
        nouvelle.TrackSubscribed += (_, e) => SurEcran(() => Abonner(e.Track, e.Publication.Sid));
        nouvelle.TrackUnsubscribed += (_, e) => SurEcran(() => Desabonner(e.Publication.Sid));
        nouvelle.TrackMuted += (_, e) => SurEcran(() => { Dessiner(); if (e.Participant is LocalParticipant) Annoncer(); });
        nouvelle.TrackUnmuted += (_, e) => SurEcran(() => { Dessiner(); if (e.Participant is LocalParticipant) Annoncer(); });
        nouvelle.ParticipantAttributesChanged += (_, _) => SurEcran(Dessiner);
        nouvelle.Disconnected += (_, _) => SurEcran(() =>
        {
            if (piece != nouvelle) return;
            Arreter();
            piece = null;
            salle = "";
            Dessiner();
            Messages.Afficher("Vous n'êtes plus dans la réunion.", "avertissement");
        });
        piece = nouvelle;
        salle = nom;
        try { await nouvelle.ConnectAsync(V.T(V.Champ(acces, "adresse")), V.T(V.Champ(acces, "jeton")), new RoomOptions { AutoSubscribe = true, Dynacast = true, AdaptiveStream = false }); }
        catch (Exception)
        {
            piece = null;
            salle = "";
            Messages.Afficher("La réunion n'a pas pu commencer : le serveur des réunions ne répond pas.", "erreur");
            return;
        }
        // Ceux qui étaient déjà là : leurs pistes arrivent par TrackSubscribed, ou sont déjà abonnées.
        foreach (var r in nouvelle.RemoteParticipants.Values)
            foreach (var t in r.TrackPublications.Values)
                if (t.Track is not null) Abonner(t.Track, t.Sid);
        // Le micro et la caméra séparément : une caméra absente ou refusée n'empêche pas de parler.
        await DemarrerMicro();
        if (V.Champ(acces, "video") is true) await DemarrerCamera();
        Dessiner();
        Annoncer();
    }

    public static async Task Quitter()
    {
        var ancienne = piece;
        var ancienneSalle = salle;
        if (ancienne is null) return;
        piece = null;
        salle = "";
        Arreter();
        Dessiner();
        try { await ancienne.DisconnectAsync(); } catch (Exception) { }
        await Serveur.Reussi("/api/salles_geste", "POST", V.FicheDe(("salle", ancienneSalle), ("participant", ""), ("geste", "etat")));
    }

    /// <summary>Tout ce qui tourne s'arrête : les appareils, les images et les sons reçus.</summary>
    private static void Arreter()
    {
        ArreterMicro();
        _ = ArreterCamera(false);
        ArreterEcranLocal();
        foreach (var r in rendus.Values) r.Dispose();
        rendus.Clear();
        foreach (var s in sons.Values) s.Dispose();
        sons.Clear();
    }

    private static void Abonner(Track piste, string sid)
    {
        if (piece is null) return;
        if (piste.Kind == P.TrackKind.KindVideo && !rendus.ContainsKey(sid))
        {
            var rendu = new Rendu();
            rendus[sid] = rendu;
            var flux = VideoStream.FromTrack(piste, P.VideoBufferType.Bgra);
            _ = Task.Run(async () =>
            {
                try { await foreach (var e in flux.WithCancellation(rendu.Arret.Token)) rendu.Recevoir(e.Frame.DataBytes, e.Frame.Width, e.Frame.Height); }
                catch (OperationCanceledException) { }
                catch (Exception) { }
                finally { flux.Dispose(); }
            });
        }
        else if (piste.Kind == P.TrackKind.KindAudio && !sons.ContainsKey(sid))
        {
            try { sons[sid] = new HautParleur(piste); }
            catch (Exception) { Messages.Afficher("Le son des autres ne peut pas être joué : aucun haut-parleur n'est disponible.", "erreur"); }
        }
        Dessiner();
    }

    private static void Desabonner(string sid)
    {
        if (rendus.Remove(sid, out var r)) r.Dispose();
        if (sons.Remove(sid, out var s)) s.Dispose();
        Dessiner();
    }

    // ─── Le micro ───────────────────────────────────────────────────────────

    private static async Task DemarrerMicro()
    {
        var p = piece;
        if (p?.LocalParticipant is null || pisteMicro is not null) return;
        if (WaveInEvent.DeviceCount == 0) { Messages.Afficher("Cet ordinateur n'a pas de micro : les autres ne vous entendront pas.", "avertissement"); return; }
        var source = new AudioSource(48000, 1);
        var piste = LocalAudioTrack.Create("micro", source);
        var entree = new WaveInEvent { WaveFormat = new WaveFormat(48000, 16, 1), BufferMilliseconds = 20 };
        var reste = new List<byte>(1920);
        entree.DataAvailable += (_, e) =>
        {
            // Des trames de 10 ms : 480 échantillons de 16 bits.
            for (var i = 0; i < e.BytesRecorded; i++) reste.Add(e.Buffer[i]);
            while (reste.Count >= 960)
            {
                var trame = reste.GetRange(0, 960).ToArray();
                reste.RemoveRange(0, 960);
                try { source.CaptureFrame(new AudioFrame(trame, 48000, 1, 480)); } catch (Exception) { }
            }
        };
        try { entree.StartRecording(); }
        catch (Exception)
        {
            entree.Dispose();
            source.Dispose();
            Messages.Afficher("Le micro n'a pas pu démarrer : autorisez les applications de bureau à l'utiliser dans Paramètres, Confidentialité, Microphone.", "erreur");
            return;
        }
        try
        {
            var publication = await p.LocalParticipant.PublishTrackAsync(piste, new TrackPublishOptions { Source = P.TrackSource.SourceMicrophone, Dtx = true });
            micro = entree;
            sourceMicro = source;
            pisteMicro = piste;
            sidMicro = publication.Sid;
        }
        catch (Exception)
        {
            entree.StopRecording();
            entree.Dispose();
            source.Dispose();
            Messages.Afficher("Le micro n'a pas pu démarrer.", "erreur");
        }
    }

    private static void ArreterMicro()
    {
        micro?.StopRecording();
        micro?.Dispose();
        micro = null;
        sourceMicro?.Dispose();
        sourceMicro = null;
        pisteMicro = null;
        sidMicro = null;
    }

    // ─── La caméra ──────────────────────────────────────────────────────────

    private static async Task DemarrerCamera()
    {
        var p = piece;
        if (p?.LocalParticipant is null || sidCamera is not null) return;
        var cameras = await DeviceInformation.FindAllAsync(DeviceClass.VideoCapture);
        if (cameras.Count == 0) { Messages.Afficher("Cet ordinateur n'a pas de caméra : les autres ne vous verront pas.", "avertissement"); return; }
        var capture = new MediaCapture();
        try
        {
            await capture.InitializeAsync(new MediaCaptureInitializationSettings { StreamingCaptureMode = StreamingCaptureMode.Video, MemoryPreference = MediaCaptureMemoryPreference.Cpu, SharingMode = MediaCaptureSharingMode.SharedReadOnly, VideoDeviceId = cameras[0].Id });
        }
        catch (UnauthorizedAccessException)
        {
            capture.Dispose();
            Messages.Afficher("L'accès à la caméra est refusé : autorisez les applications de bureau dans Paramètres, Confidentialité, Caméra.", "erreur");
            return;
        }
        catch (Exception)
        {
            capture.Dispose();
            Messages.Afficher("La caméra n'a pas pu démarrer : une autre application s'en sert peut-être.", "erreur");
            return;
        }
        var couleurs = capture.FrameSources.Values.Where(s => s.Info.SourceKind == MediaFrameSourceKind.Color).ToList();
        var origine = couleurs.FirstOrDefault(s => s.Info.MediaStreamType == MediaStreamType.VideoPreview) ?? couleurs.FirstOrDefault();
        if (origine is null) { capture.Dispose(); Messages.Afficher("La caméra n'a pas pu démarrer.", "erreur"); return; }
        VideoSource? source = null;
        var lecteur = await capture.CreateFrameReaderAsync(origine, MediaEncodingSubtypes.Bgra8);
        lecteur.AcquisitionMode = MediaFrameReaderAcquisitionMode.Realtime;
        var premiere = new TaskCompletionSource<(int, int)>();
        lecteur.FrameArrived += (l, _) =>
        {
            using var trame = l.TryAcquireLatestFrame();
            var image = trame?.VideoMediaFrame?.SoftwareBitmap;
            if (image is null) return;
            using var bgra = SoftwareBitmap.Convert(image, BitmapPixelFormat.Bgra8, BitmapAlphaMode.Ignore);
            var octets = new byte[bgra.PixelWidth * bgra.PixelHeight * 4];
            bgra.CopyToBuffer(octets.AsBuffer());
            premiere.TrySetResult((bgra.PixelWidth, bgra.PixelHeight));
            renduLocal.Recevoir(octets, bgra.PixelWidth, bgra.PixelHeight);
            try { source?.CaptureFrame(new VideoFrame(bgra.PixelWidth, bgra.PixelHeight, P.VideoBufferType.Bgra, octets)); } catch (Exception) { }
        };
        if (await lecteur.StartAsync() != MediaFrameReaderStartStatus.Success) { lecteur.Dispose(); capture.Dispose(); Messages.Afficher("La caméra n'a pas pu démarrer.", "erreur"); return; }
        camera = capture;
        lecteurCamera = lecteur;
        // La taille de la source est celle des images de la caméra.
        var fini = await Task.WhenAny(premiere.Task, Task.Delay(5000));
        if (fini != premiere.Task) { await ArreterCamera(false); Messages.Afficher("La caméra ne donne pas d'image.", "erreur"); return; }
        var (largeur, hauteur) = premiere.Task.Result;
        var nouvelle = new VideoSource(largeur, hauteur);
        try
        {
            var publication = await p.LocalParticipant.PublishTrackAsync(LocalVideoTrack.Create("camera", nouvelle), new TrackPublishOptions { Source = P.TrackSource.SourceCamera, Simulcast = true });
            source = nouvelle;
            sourceCamera = nouvelle;
            sidCamera = publication.Sid;
        }
        catch (Exception)
        {
            await ArreterCamera(false);
            nouvelle.Dispose();
            Messages.Afficher("La caméra n'a pas pu démarrer.", "erreur");
        }
    }

    private static async Task ArreterCamera(bool retirer)
    {
        var sid = sidCamera;
        sidCamera = null;
        if (lecteurCamera is not null) { try { await lecteurCamera.StopAsync(); } catch (Exception) { } lecteurCamera.Dispose(); lecteurCamera = null; }
        camera?.Dispose();
        camera = null;
        if (retirer && sid is not null && piece?.LocalParticipant is { } moi) { try { await moi.UnpublishTrackAsync(sid); } catch (Exception) { } }
        sourceCamera?.Dispose();
        sourceCamera = null;
        renduLocal.Image = null;
    }

    // ─── L'écran ────────────────────────────────────────────────────────────

    [DllImport("user32.dll")] private static extern IntPtr GetDC(IntPtr fenetre);
    [DllImport("user32.dll")] private static extern int ReleaseDC(IntPtr fenetre, IntPtr dc);
    [DllImport("user32.dll")] private static extern int GetSystemMetrics(int index);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateCompatibleBitmap(IntPtr dc, int largeur, int hauteur);
    [DllImport("gdi32.dll")] private static extern IntPtr SelectObject(IntPtr dc, IntPtr objet);
    [DllImport("gdi32.dll")] private static extern bool BitBlt(IntPtr dest, int x, int y, int l, int h, IntPtr source, int xs, int ys, uint operation);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr objet);
    [DllImport("gdi32.dll")] private static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] private static extern int GetDIBits(IntPtr dc, IntPtr bitmap, uint debut, uint lignes, byte[] bits, ref InfoImage info, uint usage);

    [StructLayout(LayoutKind.Sequential)]
    private struct InfoImage
    {
        public uint Taille; public int Largeur; public int Hauteur; public ushort Plans; public ushort Bits; public uint Compression;
        public uint TailleImage; public int XParMetre; public int YParMetre; public uint Couleurs; public uint Importantes;
    }

    /// <summary>Une copie de l'écran principal, en BGRA, de haut en bas.</summary>
    private static byte[] CopieEcran(int largeur, int hauteur)
    {
        var ecran = GetDC(IntPtr.Zero);
        var memoire = CreateCompatibleDC(ecran);
        var image = CreateCompatibleBitmap(ecran, largeur, hauteur);
        var ancienne = SelectObject(memoire, image);
        BitBlt(memoire, 0, 0, largeur, hauteur, ecran, 0, 0, 0x00CC0020 | 0x40000000);
        var info = new InfoImage { Taille = (uint)Marshal.SizeOf<InfoImage>(), Largeur = largeur, Hauteur = -hauteur, Plans = 1, Bits = 32 };
        var octets = new byte[largeur * hauteur * 4];
        GetDIBits(memoire, image, 0, (uint)hauteur, octets, ref info, 0);
        SelectObject(memoire, ancienne);
        DeleteObject(image);
        DeleteDC(memoire);
        ReleaseDC(IntPtr.Zero, ecran);
        return octets;
    }

    private static void ArreterEcranLocal()
    {
        arretEcran?.Cancel();
        arretEcran = null;
        sourceEcran?.Dispose();
        sourceEcran = null;
        sidEcran = null;
    }

    // ─── Les gestes ─────────────────────────────────────────────────────────

    private static async Task Essayer(Func<LocalParticipant, Task> action)
    {
        if (piece?.LocalParticipant is not { } moi) return;
        try { await action(moi); }
        catch (Exception) { Messages.Afficher("La caméra, le micro ou l'écran n'ont pas pu changer : vérifiez les autorisations dans Paramètres, Confidentialité.", "erreur"); }
        Dessiner();
        Annoncer();
    }

    public static Task CouperMicro() => Essayer(_ => { pisteMicro?.Mute(); return Task.CompletedTask; });
    public static Task ActiverMicro() => Essayer(async _ => { if (pisteMicro is null) await DemarrerMicro(); else pisteMicro.Unmute(); });
    public static Task CouperCamera() => Essayer(_ => ArreterCamera(true));
    public static Task ActiverCamera() => Essayer(_ => DemarrerCamera());
    public static Task LeverMain() => Essayer(moi => moi.SetAttributesAsync(new Dictionary<string, string> { ["main"] = "1" }));
    public static Task BaisserMain() => Essayer(moi => moi.SetAttributesAsync(new Dictionary<string, string> { ["main"] = "0" }));

    /// <summary>L'écran principal, dix images par seconde, tant que le partage dure.</summary>
    public static Task PartagerEcran() => Essayer(async moi =>
    {
        if (sidEcran is not null) return;
        int largeur = GetSystemMetrics(0), hauteur = GetSystemMetrics(1);
        var source = new VideoSource(largeur, hauteur);
        var publication = await moi.PublishTrackAsync(LocalVideoTrack.Create("ecran", source), new TrackPublishOptions { Source = P.TrackSource.SourceScreenshare });
        sourceEcran = source;
        sidEcran = publication.Sid;
        var arret = new CancellationTokenSource();
        arretEcran = arret;
        _ = Task.Run(async () =>
        {
            while (!arret.IsCancellationRequested)
            {
                try { source.CaptureFrame(new VideoFrame(largeur, hauteur, P.VideoBufferType.Bgra, CopieEcran(largeur, hauteur))); } catch (Exception) { }
                try { await Task.Delay(100, arret.Token); } catch (OperationCanceledException) { }
            }
        });
    });

    public static Task ArreterPartage() => Essayer(async moi =>
    {
        var sid = sidEcran;
        ArreterEcranLocal();
        if (sid is not null) await moi.UnpublishTrackAsync(sid);
    });
}
`;
