/**
 * Les fichiers en WPF : « fichier "Choisir" dans photo accepte images avec maximum 5 Mo »
 * ouvre la fenêtre « Ouvrir » de Windows, vérifie le type et la taille (pour aider la
 * personne : le serveur revérifie), et met dans la variable une fiche { nom, taille, type,
 * mime, apercu }. « envoyer fichier … » l'envoie, en corps brut ou en formulaire, avec sa
 * progression de 0 à 100.
 */
export const FICHIERS_CS = String.raw`// Produit par Humalis : choisir un fichier et l'envoyer.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;

namespace Humalis;

public static class Fichiers
{
    private static readonly Dictionary<string, string> types = new(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = "image/png", [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg", [".gif"] = "image/gif", [".webp"] = "image/webp", [".bmp"] = "image/bmp",
        [".svg"] = "image/svg+xml", [".heic"] = "image/heic", [".pdf"] = "application/pdf", [".mp3"] = "audio/mpeg", [".wav"] = "audio/wav", [".m4a"] = "audio/mp4",
        [".ogg"] = "audio/ogg", [".mp4"] = "video/mp4", [".mov"] = "video/quicktime", [".webm"] = "video/webm", [".txt"] = "text/plain", [".csv"] = "text/csv",
        [".doc"] = "application/msword", [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".xls"] = "application/vnd.ms-excel", [".xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [".odt"] = "application/vnd.oasis.opendocument.text",
    };

    private static readonly Dictionary<string, string> refus = new() { ["images"] = "une image", ["audio"] = "un son", ["videos"] = "une vidéo", ["pdf"] = "un PDF", ["documents"] = "un document" };

    public static string MimeDe(string chemin) => types.TryGetValue(Path.GetExtension(chemin), out var m) ? m : "application/octet-stream";

    private static bool Accepte(string mime, string[] familles) => familles.Any(f => f.EndsWith("/*") ? mime.StartsWith(f[..^1], StringComparison.OrdinalIgnoreCase) : string.Equals(f, mime, StringComparison.OrdinalIgnoreCase));

    /// <summary>La fiche d'un fichier choisi : ce que la page peut lire (photo.nom, photo.apercu…).</summary>
    public static Fiche FicheDe(string chemin, bool apercu)
    {
        var info = new FileInfo(chemin);
        var mime = MimeDe(chemin);
        var fiche = V.FicheDe(("nom", info.Name), ("taille", (double)info.Length), ("type", mime.Split('/')[0]), ("mime", mime), ("chemin", info.FullName));
        if (apercu && mime.StartsWith("image/")) fiche["apercu"] = new Uri(info.FullName).AbsoluteUri;
        return fiche;
    }

    /// <summary>Le bouton qui ouvre la fenêtre « Ouvrir », et le nom du fichier choisi à côté.</summary>
    public static FrameworkElement Choix(Func<string> libelle, Signal cible, (string nom, string[] mime)[] familles, double? octets = null, bool plusieurs = false, bool apercu = true, string? id = null)
    {
        var nom = new TextBlock { VerticalAlignment = VerticalAlignment.Center, Opacity = 0.75, Margin = new Thickness(12, 0, 0, 0) };
        var bouton = UI.Bouton(libelle, () =>
        {
            var extensions = familles.Length == 0 ? new[] { "*.*" } : types.Where(t => Accepte(t.Value, familles.SelectMany(f => f.mime).ToArray())).Select(t => "*" + t.Key).ToArray();
            var choix = new Microsoft.Win32.OpenFileDialog { Multiselect = plusieurs, Filter = $"{libelle()}|{string.Join(";", extensions)}|Tous les fichiers|*.*" };
            if (choix.ShowDialog() != true) return Task.CompletedTask;
            var retenus = new Liste();
            foreach (var chemin in choix.FileNames)
            {
                var mime = MimeDe(chemin);
                if (familles.Length > 0 && !familles.Any(f => Accepte(mime, f.mime)))
                {
                    Messages.Afficher($"« {Path.GetFileName(chemin)} » n'est pas {string.Join(" ni ", familles.Select(f => refus.GetValueOrDefault(f.nom, f.nom)))}.", "erreur");
                    continue;
                }
                if (octets is double max && new FileInfo(chemin).Length > max)
                {
                    Messages.Afficher($"« {Path.GetFileName(chemin)} » est trop lourd : {V.Taille(max, max >= 1_048_576 ? "Mo" : "Ko")} au plus.", "erreur");
                    continue;
                }
                retenus.Add(FicheDe(chemin, apercu));
            }
            if (retenus.Count == 0) return Task.CompletedTask;
            cible.Ecrire(plusieurs ? new Liste(V.L(cible.Valeur).Concat(retenus)) : retenus[0]);
            return Task.CompletedTask;
        }, id);
        new Effet(() =>
        {
            var v = cible.Lire();
            nom.Text = v is Liste l ? (l.Count == 0 ? "" : l.Count == 1 ? V.T(V.Champ(l[0], "nom")) : $"{l.Count} fichiers") : V.T(V.Champ(v, "nom"));
        });
        var ligne = new StackPanel { Orientation = Orientation.Horizontal };
        ligne.Children.Add(bouton);
        ligne.Children.Add(nom);
        return ligne;
    }

    /// <summary>Un contenu qui dit combien il a déjà envoyé.</summary>
    private sealed class ContenuSuivi(byte[] octets, Action<double>? progression) : HttpContent
    {
        protected override async Task SerializeToStreamAsync(Stream flux, TransportContext? contexte)
        {
            const int morceau = 64 * 1024;
            for (var envoye = 0; envoye < octets.Length; envoye += morceau)
            {
                var n = Math.Min(morceau, octets.Length - envoye);
                await flux.WriteAsync(octets.AsMemory(envoye, n));
                var p = Math.Round((envoye + n) * 100.0 / Math.Max(1, octets.Length));
                if (progression is not null) System.Windows.Application.Current?.Dispatcher.BeginInvoke(() => progression(p));
            }
        }

        protected override bool TryComputeLength(out long longueur)
        {
            longueur = octets.Length;
            return true;
        }
    }

    private static readonly HttpClient http = new() { Timeout = TimeSpan.FromMinutes(10) };

    /// <summary>« envoyer fichier … » : lève son erreur ; la réponse du serveur, ou null.</summary>
    public static async Task<object?> Envoyer(object? fichier, string adresse, Source? source = null, bool corpsBrut = false, string champ = "fichier", Signal? suivi = null, EtatRequete? etat = null)
    {
        if (V.Champ(fichier, "chemin") is not string chemin) throw new ErreurHumalis("Choisissez d'abord un fichier.");
        byte[] octets;
        try { octets = await File.ReadAllBytesAsync(chemin); }
        catch (Exception) { throw new ErreurHumalis("Le fichier n'a pas pu être lu."); }
        etat?.Changer("chargement");
        suivi?.Ecrire(0d);
        try
        {
            var mime = V.T(V.Champ(fichier, "mime"));
            HttpContent corps;
            var suiviContenu = new ContenuSuivi(octets, p => suivi?.Ecrire(p));
            suiviContenu.Headers.ContentType = new MediaTypeHeaderValue(mime.Length > 0 ? mime : "application/octet-stream");
            if (corpsBrut) corps = suiviContenu;
            else
            {
                var formulaire = new MultipartFormDataContent();
                formulaire.Add(suiviContenu, champ, V.T(V.Champ(fichier, "nom")));
                corps = formulaire;
            }
            var base_ = (source?.Adresse ?? Serveur.Base).TrimEnd('/');
            using var requete = new HttpRequestMessage(HttpMethod.Post, base_ + (adresse.StartsWith('/') ? adresse : "/" + adresse)) { Content = corps };
            requete.Headers.TryAddWithoutValidation("Accept", "application/json");
            if (source is null || source.Session)
            {
                requete.Headers.TryAddWithoutValidation("x-humalis-mobile", "1");
                if (Session.Jeton is { } jeton) requete.Headers.TryAddWithoutValidation("Authorization", "Bearer " + jeton);
            }
            foreach (var (nom, valeur) in source?.Entetes ?? Array.Empty<(string, string)>()) requete.Headers.TryAddWithoutValidation(nom, valeur);
            if (source?.Jeton is { } cle && source.PlaceJeton == "autorisation") requete.Headers.TryAddWithoutValidation("Authorization", "Bearer " + cle);
            HttpResponseMessage reponse;
            try { reponse = await http.SendAsync(requete); }
            catch (Exception) { throw new ErreurHumalis(Serveur.PasDeReponse, sansReseau: true); }
            var texte = await reponse.Content.ReadAsStringAsync();
            if (!reponse.IsSuccessStatusCode)
            {
                var message = V.T(V.Champ(V.LireJson(texte), source?.ErreurDans ?? "erreur"));
                throw new ErreurHumalis(message.Length > 0 ? V.AvecMajuscule(message.TrimEnd('.')) + "." : Serveur.PasDeReponse);
            }
            suivi?.Ecrire(100d);
            etat?.Changer("repos");
            var lue = V.LireJson(texte);
            return source?.Enveloppe is { } enveloppe ? V.Champ(lue, enveloppe) ?? lue : lue;
        }
        catch (ErreurHumalis e)
        {
            etat?.Changer("erreur", e.Message);
            throw;
        }
    }
}
`;
