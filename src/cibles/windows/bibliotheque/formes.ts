/**
 * Les formes d'application spéciales sur Windows, sans paquet MSIX : une seule instance (les
 * lancements suivants lui passent leurs arguments par un tube nommé), l'inscription dans le
 * registre de la personne (HKCU : « Ouvrir avec », clic droit, lancement à l'ouverture de la
 * session, protocole des notifications), la liste de raccourcis de la barre des tâches, la
 * zone de notification, et la tâche planifiée de « en arriere plan ».
 */
export const FORMES_CS = String.raw`// Produit par Humalis : l'application hors de sa fenêtre (zone de notification, Jump List, Explorateur, démarrage).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Win32;

namespace Humalis;

/// <summary>Une seule instance : un deuxième lancement (fichier ouvert, clic droit, notification…) passe ses arguments au premier.</summary>
public static class InstanceUnique
{
    private static Mutex? verrou;
    public static event Action<string[]>? Recu;

    private static string Tube => "Humalis-" + Configuration.Identifiant + "-" + Environment.UserName;

    [DllImport("user32.dll")]
    private static extern bool AllowSetForegroundWindow(int processus);

    /// <summary>Vrai pour la première instance ; les suivantes transmettent leurs arguments et rendent faux.</summary>
    public static bool Premiere(string[] arguments)
    {
        verrou = new Mutex(true, @"Local\Humalis-" + Configuration.Identifiant, out var premiere);
        if (premiere)
        {
            Ecouter();
            return true;
        }
        try
        {
            // Ce lancement vient de la personne (Explorateur, Jump List) : la première instance peut passer devant.
            AllowSetForegroundWindow(-1);
            using var tube = new NamedPipeClientStream(".", Tube, PipeDirection.Out);
            tube.Connect(5000);
            tube.Write(JsonSerializer.SerializeToUtf8Bytes(arguments));
        }
        catch (Exception) { }
        return false;
    }

    private static void Ecouter()
    {
        var fil = new Thread(() =>
        {
            while (true)
            {
                try
                {
                    using var tube = new NamedPipeServerStream(Tube, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.CurrentUserOnly);
                    tube.WaitForConnection();
                    using var lu = new MemoryStream();
                    tube.CopyTo(lu);
                    var arguments = JsonSerializer.Deserialize<string[]>(lu.ToArray()) ?? Array.Empty<string>();
                    System.Windows.Application.Current?.Dispatcher.BeginInvoke(() => Recu?.Invoke(arguments));
                }
                catch (Exception) { Thread.Sleep(200); }
            }
        }) { IsBackground = true, Name = "Humalis : instance unique" };
        fil.Start();
    }
}

/// <summary>L'inscription de l'application dans Windows, pour la personne connectée (HKCU) : rien à installer, rien d'administrateur.</summary>
public static class Integration
{
    public static string Exe => Environment.ProcessPath ?? Process.GetCurrentProcess().MainModule!.FileName;
    private static string Q(string s) => "\"" + s + "\"";

    /// <summary>Le protocole des notifications : « humalis.boutique: ».</summary>
    public static string Schema => new string(Configuration.Identifiant.ToLowerInvariant().Select(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '-' or '+' ? c : '-').ToArray());

    /// <summary>L'identifiant d'application de Windows (AppUserModelID) : la barre des tâches, la Jump List et les notifications le partagent.</summary>
    public static string Aumid => Configuration.Identifiant;

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SetCurrentProcessExplicitAppUserModelID(string id);

    [DllImport("shell32.dll")]
    private static extern void SHChangeNotify(int evenement, uint options, IntPtr a, IntPtr b);

    /// <summary>Les derniers lancements reçus (lancements.txt, à côté de la mémoire) : pour comprendre un clic droit ou un bouton sans effet.</summary>
    public static void Noter(string[] arguments, bool dejaLance)
    {
        try
        {
            var fichier = Path.Combine(Memoire.Dossier, "lancements.txt");
            var lignes = File.Exists(fichier) ? File.ReadAllLines(fichier).TakeLast(49).ToList() : new List<string>();
            lignes.Add(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + (dejaLance ? " (transmis) " : " ") + string.Join(" ", arguments.Select(x => "[" + x + "]")));
            File.WriteAllLines(fichier, lignes);
        }
        catch (Exception) { }
    }

    public static void Identifier()
    {
        try { SetCurrentProcessExplicitAppUserModelID(Aumid); } catch (Exception) { }
    }

    private static void Ecrire(string cle, string? nom, string valeur)
    {
        using var k = Registry.CurrentUser.CreateSubKey(cle);
        k.SetValue(nom ?? "", valeur);
    }

    private static void Retirer(string cle)
    {
        try { Registry.CurrentUser.DeleteSubKeyTree(cle, false); } catch (Exception) { }
    }

    private static void RetirerValeur(string cle, string nom)
    {
        try
        {
            using var k = Registry.CurrentUser.OpenSubKey(cle, true);
            k?.DeleteValue(nom, false);
        }
        catch (Exception) { }
    }

    /// <summary>« quand on ouvre un fichier ".csv" » : l'application apparaît dans « Ouvrir avec » pour ces extensions.</summary>
    public static void AssocierExtensions(string[] extensions, bool retirer = false)
    {
        var exe = Path.GetFileName(Exe);
        foreach (var ext in extensions)
        {
            var progId = Configuration.Identifiant + ext;
            if (retirer)
            {
                Retirer(@"Software\Classes\" + progId);
                RetirerValeur(@"Software\Classes\" + ext + @"\OpenWithProgids", progId);
                continue;
            }
            Ecrire(@"Software\Classes\" + progId, null, Configuration.Nom + " (" + ext + ")");
            Ecrire(@"Software\Classes\" + progId + @"\DefaultIcon", null, Q(Exe) + ",0");
            Ecrire(@"Software\Classes\" + progId + @"\shell\open\command", null, Q(Exe) + " --fichier \"%1\"");
            Ecrire(@"Software\Classes\" + ext + @"\OpenWithProgids", progId, "");
            Ecrire(@"Software\Classes\Applications\" + exe + @"\SupportedTypes", ext, "");
        }
        if (retirer) Retirer(@"Software\Classes\Applications\" + exe);
        else
        {
            Ecrire(@"Software\Classes\Applications\" + exe, "FriendlyAppName", Configuration.Nom);
            Ecrire(@"Software\Classes\Applications\" + exe + @"\shell\open\command", null, Q(Exe) + " --fichier \"%1\"");
        }
        SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero);
    }

    /// <summary>« menu clic droit "…" pour les fichiers ".jpg" » : une commande du clic droit de l'Explorateur, pour ces extensions.</summary>
    public static void MenuClicDroit(int numero, string titre, string[] extensions, bool retirer = false)
    {
        foreach (var ext in extensions)
        {
            var cle = @"Software\Classes\SystemFileAssociations\" + ext + @"\shell\" + Configuration.Identifiant + ".menu" + numero;
            if (retirer) { Retirer(cle); continue; }
            Ecrire(cle, "MUIVerb", titre);
            Ecrire(cle, "Icon", Q(Exe) + ",0");
            Ecrire(cle + @"\command", null, Q(Exe) + " --menu " + numero + " \"%1\"");
        }
    }

    /// <summary>« lancer au demarrage de l'ordinateur » : la clé Run de la personne (visible dans le Gestionnaire des tâches, « Applications de démarrage »).</summary>
    public static void LancerAuDemarrage(bool oui)
    {
        const string run = @"Software\Microsoft\Windows\CurrentVersion\Run";
        if (oui) Ecrire(run, Configuration.Identifiant, Q(Exe) + " --demarrage");
        else RetirerValeur(run, Configuration.Identifiant);
    }

    /// <summary>Le protocole des boutons des notifications : Windows relance l'application avec « humalis.boutique:notification?bouton=… ».</summary>
    public static void Protocole(bool retirer = false)
    {
        var cle = @"Software\Classes\" + Schema;
        if (retirer) { Retirer(cle); Retirer(@"Software\Classes\AppUserModelId\" + Aumid); return; }
        Ecrire(cle, null, "URL:" + Configuration.Nom);
        Ecrire(cle, "URL Protocol", "");
        Ecrire(cle + @"\shell\open\command", null, Q(Exe) + " \"%1\"");
        // Le nom et l'icône montrés en tête des notifications.
        Ecrire(@"Software\Classes\AppUserModelId\" + Aumid, "DisplayName", Configuration.Nom);
        try { Ecrire(@"Software\Classes\AppUserModelId\" + Aumid, "IconUri", IconesFichier.Png("notification", Colors.White, Color.FromRgb(0x00, 0x67, 0xC0))); }
        catch (Exception) { }
    }

    /// <summary>« quand on partage vers l'application » sans paquet MSIX : l'application dans « Envoyer vers » (clic droit de l'Explorateur).</summary>
    public static void EnvoyerVers(bool retirer = false)
    {
        var lien = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.SendTo), Configuration.Nom + ".lnk");
        if (retirer) { try { File.Delete(lien); } catch (Exception) { } return; }
        try
        {
            var type = Type.GetTypeFromProgID("WScript.Shell");
            if (type is null) return;
            dynamic coquille = Activator.CreateInstance(type)!;
            dynamic raccourci = coquille.CreateShortcut(lien);
            raccourci.TargetPath = Exe;
            raccourci.Arguments = "--partage";
            raccourci.IconLocation = Exe + ",0";
            raccourci.Description = Configuration.Nom;
            raccourci.Save();
        }
        catch (Exception) { }
    }

    /// <summary>« en arriere plan : » : une tâche planifiée de la personne, toutes les 15 minutes, qui lance l'application sans fenêtre.</summary>
    public static void TachePlanifiee(bool oui)
    {
        var nom = @"Humalis\" + Configuration.Identifiant;
        var info = new ProcessStartInfo("schtasks.exe") { CreateNoWindow = true, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
        if (oui) foreach (var a in new[] { "/Create", "/F", "/SC", "MINUTE", "/MO", "15", "/TN", nom, "/TR", Q(Exe) + " --arriere-plan" }) info.ArgumentList.Add(a);
        else foreach (var a in new[] { "/Delete", "/F", "/TN", nom }) info.ArgumentList.Add(a);
        try
        {
            var p = Process.Start(info);
            if (!oui) p?.WaitForExit(10000);
        }
        catch (Exception) { }
    }

    /// <summary>« raccourcis de l'icone » : la liste de raccourcis (Jump List) de l'icône dans la barre des tâches.</summary>
    public static void RaccourcisIcone((string titre, string page, string? icone)[] raccourcis)
    {
        var liste = new System.Windows.Shell.JumpList { ShowRecentCategory = false, ShowFrequentCategory = false };
        foreach (var (titre, page, icone) in raccourcis)
        {
            var tache = new System.Windows.Shell.JumpTask { Title = titre, Arguments = "--page " + Q(page), ApplicationPath = Exe, IconResourcePath = Exe, IconResourceIndex = 0 };
            if (icone is not null)
            {
                try { tache.IconResourcePath = IconesFichier.Ico(icone); } catch (Exception) { }
            }
            liste.JumpItems.Add(tache);
        }
        if (System.Windows.Application.Current is { } app) System.Windows.Shell.JumpList.SetJumpList(app, liste);
        liste.Apply();
    }
}

/// <summary>Les icônes de Humalis (Segoe Fluent Icons) en fichiers .ico et .png, pour la zone de notification et la Jump List.</summary>
public static class IconesFichier
{
    /// <summary>La barre des tâches est claire : les icônes y sont noires ; sinon blanches.</summary>
    public static bool BarreClaire
    {
        get
        {
            try
            {
                using var cle = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
                return cle?.GetValue("SystemUsesLightTheme") is int clair && clair == 1;
            }
            catch (Exception) { return false; }
        }
    }

    private static string Dossier
    {
        get
        {
            var d = Path.Combine(Memoire.Dossier, "icones");
            Directory.CreateDirectory(d);
            return d;
        }
    }

    public static byte[] Image(string nom, int taille, Color couleur, Color? fond = null)
    {
        var glyphe = Icones.Glyphe(nom);
        if (glyphe.Length == 0) glyphe = Configuration.Nom.Length > 0 ? Configuration.Nom[..1].ToUpperInvariant() : "H";
        var police = Icones.Glyphe(nom).Length > 0 ? new Typeface(Icones.Police, FontStyles.Normal, FontWeights.Normal, FontStretches.Normal) : new Typeface("Segoe UI Semibold");
        var visuel = new DrawingVisual();
        using (var dc = visuel.RenderOpen())
        {
            if (fond is Color f) dc.DrawRoundedRectangle(new SolidColorBrush(f), null, new Rect(0, 0, taille, taille), taille * 0.2, taille * 0.2);
            var texte = new FormattedText(glyphe, CultureInfo.InvariantCulture, FlowDirection.LeftToRight, police, taille * (fond is null ? 0.85 : 0.6), new SolidColorBrush(couleur), 1.0);
            dc.DrawText(texte, new Point((taille - texte.Width) / 2, (taille - texte.Height) / 2));
        }
        var rendu = new RenderTargetBitmap(taille, taille, 96, 96, PixelFormats.Pbgra32);
        rendu.Render(visuel);
        var encodeur = new PngBitmapEncoder();
        encodeur.Frames.Add(BitmapFrame.Create(rendu));
        using var flux = new MemoryStream();
        encodeur.Save(flux);
        return flux.ToArray();
    }

    /// <summary>Un fichier .png (l'icône des notifications).</summary>
    public static string Png(string nom, Color couleur, Color? fond = null)
    {
        var chemin = Path.Combine(Dossier, nom + "-" + couleur.ToString().TrimStart('#') + ".png");
        File.WriteAllBytes(chemin, Image(nom, 96, couleur, fond));
        return chemin;
    }

    /// <summary>Un fichier .ico de plusieurs tailles, chacune en PNG (lu par Windows depuis Vista).</summary>
    public static string Ico(string nom, Color? couleur = null)
    {
        var c = couleur ?? (BarreClaire ? Color.FromRgb(0x1F, 0x1F, 0x1F) : Colors.White);
        var chemin = Path.Combine(Dossier, nom + "-" + c.ToString().TrimStart('#') + ".ico");
        var tailles = new[] { 16, 20, 24, 32, 40, 48, 64, 256 };
        var images = tailles.Select(t => Image(nom, t, c)).ToArray();
        using var f = new MemoryStream();
        using var w = new BinaryWriter(f);
        w.Write((short)0); w.Write((short)1); w.Write((short)tailles.Length);
        var position = 6 + 16 * tailles.Length;
        for (var i = 0; i < tailles.Length; i++)
        {
            w.Write((byte)(tailles[i] >= 256 ? 0 : tailles[i])); w.Write((byte)(tailles[i] >= 256 ? 0 : tailles[i]));
            w.Write((byte)0); w.Write((byte)0); w.Write((short)1); w.Write((short)32);
            w.Write(images[i].Length); w.Write(position);
            position += images[i].Length;
        }
        foreach (var image in images) w.Write(image);
        w.Flush();
        File.WriteAllBytes(chemin, f.ToArray());
        return chemin;
    }
}
`;

/** La zone de notification (Windows Forms NotifyIcon) : seulement si l'application y met une icône. */
export const ZONE_CS = String.raw`// Produit par Humalis : l'icône de la zone de notification et sa petite fenêtre.
using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace Humalis;

/// <summary>« page "…" dans la barre du systeme » : une icône dans la zone de notification ; un clic ouvre la page dans une petite fenêtre près de l'icône.</summary>
public sealed class ZoneNotification : IDisposable
{
    private readonly System.Windows.Forms.NotifyIcon icone;
    private readonly Func<PageHumalis?>? fabrique;
    private readonly Action ouvrir;
    private Window? petite;
    private DateTime cacheeA;

    public ZoneNotification(string infobulle, string? nomIcone, Func<PageHumalis?>? fabrique, Action ouvrir, Action quitter)
    {
        this.fabrique = fabrique;
        this.ouvrir = ouvrir;
        icone = new System.Windows.Forms.NotifyIcon { Text = infobulle.Length > 63 ? infobulle[..63] : infobulle };
        try { icone.Icon = nomIcone is not null ? new System.Drawing.Icon(IconesFichier.Ico(nomIcone)) : System.Drawing.Icon.ExtractAssociatedIcon(Integration.Exe); }
        catch (Exception) { icone.Icon = System.Drawing.SystemIcons.Application; }
        var menu = new System.Windows.Forms.ContextMenuStrip();
        menu.Items.Add("Ouvrir " + Configuration.Nom, null, (_, _) => ouvrir());
        menu.Items.Add(new System.Windows.Forms.ToolStripSeparator());
        menu.Items.Add("Quitter", null, (_, _) => quitter());
        icone.ContextMenuStrip = menu;
        icone.MouseClick += (_, e) =>
        {
            if (e.Button != System.Windows.Forms.MouseButtons.Left) return;
            if (this.fabrique is null) ouvrir();
            else Basculer();
        };
        icone.Visible = true;
    }

    private void Basculer()
    {
        // Le clic sur l'icône ferme d'abord la petite fenêtre (elle perd le focus) : ne pas la rouvrir aussitôt.
        if (petite is { IsVisible: true } || (DateTime.Now - cacheeA).TotalMilliseconds < 300)
        {
            petite?.Hide();
            return;
        }
        if (petite is null)
        {
            var page = fabrique?.Invoke();
            if (page is null) { ouvrir(); return; }
            petite = new Window
            {
                Title = page.Titre, WindowStyle = WindowStyle.None, ResizeMode = ResizeMode.NoResize, ShowInTaskbar = false, Topmost = true,
                Width = 360, SizeToContent = SizeToContent.Height, MaxHeight = 560, Background = Apparence.FondCarte,
                BorderBrush = Apparence.BordureCarte, BorderThickness = new Thickness(1),
            };
            petite.Content = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = new Border { Padding = new Thickness(16), Child = page.Construire() } };
            petite.Deactivated += (_, _) => { petite.Hide(); cacheeA = DateTime.Now; };
            petite.KeyDown += (_, e) => { if (e.Key == System.Windows.Input.Key.Escape) petite.Hide(); };
            UI.Lancer(page.Charger);
        }
        petite.Opacity = 0;
        petite.Show();
        Placer(petite);
        petite.Opacity = 1;
        petite.Activate();
    }

    /// <summary>Dans le coin de l'écran le plus proche de l'icône (la barre des tâches peut être en haut ou sur un côté).</summary>
    private static void Placer(Window fenetre)
    {
        var zone = SystemParameters.WorkArea;
        var curseur = System.Windows.Forms.Cursor.Position;
        var versDip = PresentationSource.FromVisual(fenetre)?.CompositionTarget?.TransformFromDevice ?? Matrix.Identity;
        var point = versDip.Transform(new Point(curseur.X, curseur.Y));
        var hauteur = fenetre.ActualHeight;
        fenetre.Left = Math.Clamp(point.X - fenetre.Width / 2, zone.Left + 8, zone.Right - fenetre.Width - 8);
        fenetre.Top = point.Y > zone.Top + zone.Height / 2 ? zone.Bottom - hauteur - 8 : zone.Top + 8;
    }

    public void Dispose()
    {
        icone.Visible = false;
        icone.Dispose();
        petite?.Close();
    }
}
`;

/**
 * Les notifications de Windows (toasts) avec des boutons. Chaque bouton relance l'application par son
 * protocole (« humalis.boutique:notification?bouton=Accepter ») : sans paquet MSIX ni serveur COM.
 */
export const TOASTS_CS = String.raw`// Produit par Humalis : les notifications de Windows avec des boutons.
using System;
using System.Text;

namespace Humalis;

public static class Toasts
{
    private static string E(string s) => System.Security.SecurityElement.Escape(s) ?? "";

    /// <summary>Une notification : titre, texte, et trois boutons au plus ; un bouton répond sans ouvrir l'application.</summary>
    public static void Montrer(string titre, string texte, params string[] boutons)
    {
        var x = new StringBuilder();
        x.Append("<toast activationType=\"protocol\" launch=\"").Append(E(Integration.Schema + ":ouvrir")).Append("\">");
        x.Append("<visual><binding template=\"ToastGeneric\"><text>").Append(E(titre)).Append("</text><text>").Append(E(texte)).Append("</text></binding></visual>");
        if (boutons.Length > 0)
        {
            x.Append("<actions>");
            foreach (var b in boutons) x.Append("<action content=\"").Append(E(b)).Append("\" activationType=\"protocol\" arguments=\"").Append(E(Integration.Schema + ":notification?bouton=" + Uri.EscapeDataString(b))).Append("\"/>");
            x.Append("</actions>");
        }
        x.Append("</toast>");
        var document = new global::Windows.Data.Xml.Dom.XmlDocument();
        document.LoadXml(x.ToString());
        global::Windows.UI.Notifications.ToastNotificationManager.CreateToastNotifier(Integration.Aumid).Show(new global::Windows.UI.Notifications.ToastNotification(document));
    }
}
`;
