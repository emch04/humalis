/**
 * Le serveur Humalis et les API existantes, en C# : les mêmes règles que la cible Apple.
 * La session voyage par un jeton (gardé dans le coffre de Windows), renouvelé sur un refus 401 ;
 * un visiteur renvoie le jeton CSRF posé par le serveur avec ses envois.
 */
export const SERVEUR_CS = String.raw`// Produit par Humalis : les requêtes vers le serveur et les API, et la session.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace Humalis;

/// <summary>Une API existante (« source "…" : »). Un jeton secret n'est jamais dans l'application.</summary>
public sealed record Source(string Nom, string Adresse, bool Session = false, string? Enveloppe = null, string? ErreurDans = null, (string nom, string valeur)[]? Entetes = null, string? Jeton = null, string? PlaceJeton = null, int Essais = 0, double? Delai = null);

public static class Serveur
{
    public const string PasDeReponse = "Le serveur n'a pas répondu. Réessayez dans un instant.";

    private static readonly HttpClient http = new(new HttpClientHandler { UseCookies = false, AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(30) };

    /// <summary>L'adresse du serveur : celle de la compilation, ou HUMALIS_SERVEUR pour essayer.</summary>
    public static string Base => (Environment.GetEnvironmentVariable("HUMALIS_SERVEUR") ?? Configuration.Serveur).TrimEnd('/');

    private static string? jetonCsrf;

    private static void RetenirCsrf(HttpResponseMessage reponse)
    {
        if (!reponse.Headers.TryGetValues("Set-Cookie", out var cookies)) return;
        foreach (var cookie in cookies)
        {
            var debut = cookie.IndexOf("astratra_csrf=", StringComparison.Ordinal);
            if (debut < 0) continue;
            var valeur = new string(cookie[(debut + 14)..].TakeWhile(c => c != ';' && c != ',').ToArray());
            if (valeur.Length > 0) jetonCsrf = valeur;
        }
    }

    private static Uri Adresse(string adresse, string? id, Source? source, IEnumerable<(string cle, object? valeur)>? filtres)
    {
        var chemin = adresse.StartsWith('/') ? adresse : "/" + adresse;
        if (id is not null)
        {
            var propre = Uri.EscapeDataString(id);
            chemin = chemin.Contains(":id") ? chemin.Replace(":id", propre) : chemin + "/" + propre;
        }
        var parametres = new List<string>();
        // Une valeur absente n'est pas envoyée : un filtre vide ne fait pas « ?categorie= ».
        foreach (var (cle, valeur) in filtres ?? Enumerable.Empty<(string, object?)>())
        {
            var texte = V.T(valeur);
            if (texte.Length > 0) parametres.Add(Uri.EscapeDataString(cle) + "=" + Uri.EscapeDataString(texte));
        }
        if (source?.PlaceJeton is { } place && place.StartsWith("parametre:") && source.Jeton is { } jeton) parametres.Add(Uri.EscapeDataString(place[10..]) + "=" + Uri.EscapeDataString(jeton));
        var texteAdresse = (source?.Adresse ?? Base).TrimEnd('/') + chemin;
        if (parametres.Count > 0) texteAdresse += (texteAdresse.Contains('?') ? "&" : "?") + string.Join("&", parametres);
        return Uri.TryCreate(texteAdresse, UriKind.Absolute, out var uri) ? uri : throw new ErreurHumalis(PasDeReponse);
    }

    private static HttpRequestMessage Requete(Uri uri, string methode, Fiche? envoi, Source? source)
    {
        var r = new HttpRequestMessage(new HttpMethod(methode), uri);
        r.Headers.TryAddWithoutValidation("Accept", "application/json");
        if (source is null || source.Session) r.Headers.TryAddWithoutValidation("x-humalis-mobile", "1");
        foreach (var (nom, valeur) in source?.Entetes ?? Array.Empty<(string, string)>()) r.Headers.TryAddWithoutValidation(nom, valeur);
        if (source?.Jeton is { } jeton)
        {
            if (source.PlaceJeton == "autorisation") r.Headers.TryAddWithoutValidation("Authorization", "Bearer " + jeton);
            else if (source.PlaceJeton is { } place && place.StartsWith("entete:")) r.Headers.TryAddWithoutValidation(place[7..], jeton);
        }
        if (envoi is not null) r.Content = new StringContent(V.EnJson(envoi), Encoding.UTF8, "application/json");
        return r;
    }

    /// <summary>Un appel brut, avec le jeton de session ; sur un 401, la session se renouvelle et l'appel repart une fois.</summary>
    private static async Task<(HttpResponseMessage reponse, string corps)> Lancer(Func<HttpRequestMessage> fabriquer, Source? source)
    {
        var avecSession = source is null || source.Session;
        async Task<HttpRequestMessage> Preparer()
        {
            var r = fabriquer();
            if (avecSession && Session.Jeton is { } jeton) r.Headers.TryAddWithoutValidation("Authorization", "Bearer " + jeton);
            else if (avecSession && r.Method != HttpMethod.Get)
            {
                // Un visiteur : le serveur demande le jeton CSRF qu'il a posé à la première lecture.
                if (jetonCsrf is null)
                {
                    try
                    {
                        using var amorce = new HttpRequestMessage(HttpMethod.Get, r.RequestUri);
                        amorce.Headers.TryAddWithoutValidation("x-humalis-mobile", "1");
                        using var premiere = await http.SendAsync(amorce);
                        RetenirCsrf(premiere);
                    }
                    catch (Exception) { }
                }
                if (jetonCsrf is not null)
                {
                    r.Headers.TryAddWithoutValidation("Cookie", "astratra_csrf=" + jetonCsrf);
                    r.Headers.TryAddWithoutValidation("x-csrf-token", jetonCsrf);
                }
            }
            return r;
        }

        var essais = 0;
        while (true)
        {
            try
            {
                using var requete = await Preparer();
                var delai = source?.Delai is { } ms ? TimeSpan.FromMilliseconds(ms) : TimeSpan.FromSeconds(30);
                using var annulation = new System.Threading.CancellationTokenSource(delai);
                var reponse = await http.SendAsync(requete, annulation.Token);
                // Seules les lectures sont rejouées : un envoi rejoué pourrait commander deux fois.
                if (requete.Method == HttpMethod.Get && essais < (source?.Essais ?? 0) && (int)reponse.StatusCode is 429 or 502 or 503 or 504)
                {
                    await Task.Delay(essais == 0 ? 500 : 1500);
                    essais++;
                    continue;
                }
                if (reponse.StatusCode == HttpStatusCode.Unauthorized && avecSession && await Session.Renouveler())
                {
                    using var deuxieme = await Preparer();
                    reponse = await http.SendAsync(deuxieme);
                }
                RetenirCsrf(reponse);
                return (reponse, await reponse.Content.ReadAsStringAsync());
            }
            catch (ErreurHumalis) { throw; }
            catch (Exception)
            {
                if (essais < (source?.Essais ?? 0))
                {
                    await Task.Delay(essais == 0 ? 500 : 1500);
                    essais++;
                    continue;
                }
                throw new ErreurHumalis("Pas de connexion au serveur. Vérifiez le réseau, puis réessayez.", sansReseau: true);
            }
        }
    }

    private static object? Suivre(object? depart, string? chemin)
    {
        if (string.IsNullOrEmpty(chemin)) return depart;
        return chemin.Split('.').Aggregate(depart, (v, cle) => V.Champ(v, cle));
    }

    private static ErreurHumalis Refus(string corps, int code, Source? source)
    {
        if (source is not null && code == 429) return new ErreurHumalis("Trop de demandes en peu de temps. Patientez un moment, puis réessayez.");
        if (source is not null && code == 401) return new ErreurHumalis("Connectez-vous pour continuer.");
        var texte = V.T(Suivre(V.LireJson(corps), source?.ErreurDans ?? "erreur"));
        if (source is not null && code == 404 && texte.Length == 0) return new ErreurHumalis("Ce que vous cherchez n'existe pas.");
        if (texte.Length == 0 || (source is not null && code >= 500)) return new ErreurHumalis(PasDeReponse);
        texte = V.AvecMajuscule(texte);
        return new ErreurHumalis(texte.EndsWith('.') ? texte : texte + ".");
    }

    /// <summary>Un appel qui lève son erreur ; null pour une réponse vide ou un élément qui n'existe plus.</summary>
    public static async Task<object?> Appel(string adresse, string? methode = null, Fiche? envoi = null, string? id = null, Source? source = null, IEnumerable<(string, object?)>? filtres = null, string? dans = null, EtatRequete? suivi = null)
    {
        suivi?.Changer("chargement");
        try
        {
            var verbe = methode ?? (envoi is not null ? "POST" : "GET");
            var uri = Adresse(adresse, id, source, filtres);
            var (reponse, corps) = await Lancer(() => Requete(uri, verbe, envoi, source), source);
            var code = (int)reponse.StatusCode;
            if (code == 404 && verbe == "GET" && source is null)
            {
                suivi?.Changer("introuvable");
                return null;
            }
            if (code == 401 && (source is null || source.Session)) throw new ErreurHumalis("Connectez-vous pour continuer.");
            if (code < 200 || code >= 300)
            {
                var erreur = Refus(corps, code, source);
                if (code == 404 && suivi is not null)
                {
                    suivi.Changer("introuvable", erreur.Message);
                    return null;
                }
                throw erreur;
            }
            suivi?.Changer("repos");
            return Suivre(Suivre(V.LireJson(corps), source?.Enveloppe), dans);
        }
        catch (ErreurHumalis e)
        {
            suivi?.Changer("erreur", e.Message);
            throw;
        }
    }

    /// <summary>Une lecture : refusée, le message s'affiche (sauf si la page montre elle-même l'erreur) ; « ok » dit si la valeur est arrivée.</summary>
    public static async Task<(bool ok, object? valeur)> Lire(string adresse, Fiche? envoi = null, string? id = null, Source? source = null, IEnumerable<(string, object?)>? filtres = null, string? dans = null, EtatRequete? suivi = null, bool horsLigne = false)
    {
        try
        {
            var valeur = await Appel(adresse, null, envoi, id, source, filtres, dans, suivi);
            return (true, valeur);
        }
        catch (ErreurHumalis e)
        {
            if (suivi is null && !(horsLigne && e.SansReseau)) Messages.Afficher(e.Message, "erreur");
            return (false, null);
        }
    }

    /// <summary>Un envoi : refusé, le message s'affiche ; vrai s'il a réussi.</summary>
    public static async Task<bool> Reussi(string adresse, string? methode = null, Fiche? envoi = null, string? id = null, Source? source = null, IEnumerable<(string, object?)>? filtres = null, string? dans = null)
    {
        try
        {
            await Appel(adresse, methode, envoi, id, source, filtres, dans);
            return true;
        }
        catch (ErreurHumalis e)
        {
            Messages.Afficher(e.Message, "erreur");
            return false;
        }
    }

    /// <summary>L'identifiant d'une donnée, pour la modifier ou la supprimer.</summary>
    public static string Identifiant(object? objet) => V.T(V.Champ(objet, "id"));
}

/// <summary>Qui est connecté : toujours lu sur /auth/me du serveur, jamais deviné par l'application.</summary>
public static class Session
{
    private const string CleJeton = "humalis.jeton";
    private const string CleRenouvellement = "humalis.renouvellement";

    private static readonly Signal personne = new();
    private static readonly Signal recue = new(false);
    private static Task? demande;
    private static Task<bool>? renouvellement;
    private static readonly HttpClient http = new(new HttpClientHandler { UseCookies = false, AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(30) };

    public static string? Jeton => Coffre.Lire(CleJeton);

    private static void Demander() => demande ??= Relire();

    public static async Task Attendre()
    {
        Demander();
        if (demande is not null) await demande;
    }

    public static bool Pret { get { Demander(); return V.B(recue.Lire()); } }
    public static bool Connecte { get { Demander(); return personne.Lire() is Fiche; } }
    public static bool Admin { get { Demander(); return V.T(V.Champ(personne.Lire(), "role")) == "admin"; } }

    /// <summary>« si utilisateur est gerant » : un admin passe toujours.</summary>
    public static bool ARole(params string[] roles)
    {
        Demander();
        var role = V.T(V.Champ(personne.Lire(), "role"));
        return role.Length > 0 && (role == "admin" || roles.Contains(role));
    }

    /// <summary>« connecte », « admin » ou « role:a,b ».</summary>
    public static bool Autorise(string qui) => qui switch
    {
        "connecte" => Connecte,
        "admin" => Admin,
        _ when qui.StartsWith("role:") => ARole(qui[5..].Split(',')),
        _ => true,
    };

    private static HttpRequestMessage Requete(string chemin, HttpMethod methode, Fiche? corps = null)
    {
        var r = new HttpRequestMessage(methode, Serveur.Base + chemin);
        r.Headers.TryAddWithoutValidation("x-humalis-mobile", "1");
        r.Headers.TryAddWithoutValidation("Accept", "application/json");
        if (Jeton is { } jeton) r.Headers.TryAddWithoutValidation("Authorization", "Bearer " + jeton);
        if (corps is not null) r.Content = new StringContent(V.EnJson(corps), Encoding.UTF8, "application/json");
        return r;
    }

    private static void Garder(object? corps)
    {
        if (V.Champ(corps, "token") is string jeton) Coffre.Ecrire(CleJeton, jeton);
        if (V.Champ(corps, "refreshToken") is string suite) Coffre.Ecrire(CleRenouvellement, suite);
    }

    private static void Oublier()
    {
        Coffre.Effacer(CleJeton);
        Coffre.Effacer(CleRenouvellement);
    }

    private static async Task Relire()
    {
        try
        {
            using var r = Requete("/auth/me", HttpMethod.Get);
            using var reponse = await http.SendAsync(r);
            if (reponse.StatusCode == HttpStatusCode.Unauthorized && await Renouveler())
            {
                await Relire();
                return;
            }
            var lue = V.Champ(V.LireJson(await reponse.Content.ReadAsStringAsync()), "data");
            personne.Ecrire(reponse.IsSuccessStatusCode && V.Champ(lue, "id") is not null ? lue : null);
        }
        catch (Exception) { personne.Ecrire(null); }
        finally { recue.Ecrire(true); }
    }

    /// <summary>Le jeton d'accès dure 15 minutes ; le jeton de renouvellement en donne un autre. Plusieurs refus, un seul renouvellement.</summary>
    public static Task<bool> Renouveler()
    {
        return renouvellement ??= Faire();

        static async Task<bool> Faire()
        {
            try
            {
                if (Coffre.Lire(CleRenouvellement) is not { } suite) return false;
                using var r = Requete("/auth/refresh", HttpMethod.Post, V.FicheDe(("refreshToken", suite)));
                using var reponse = await http.SendAsync(r);
                if (!reponse.IsSuccessStatusCode)
                {
                    // Une coupure ou une limite ne ferme pas la session ; un refus, si.
                    if ((int)reponse.StatusCode is 400 or 401 or 403)
                    {
                        var etaitConnecte = personne.Valeur is Fiche;
                        Oublier();
                        personne.Ecrire(null);
                        if (etaitConnecte) Messages.Afficher("Votre session a expiré. Connectez-vous de nouveau.", "avertissement");
                    }
                    return false;
                }
                Garder(V.Champ(V.LireJson(await reponse.Content.ReadAsStringAsync()), "data"));
                return true;
            }
            catch (Exception) { return false; }
            finally { renouvellement = null; }
        }
    }

    private static async Task<(HttpResponseMessage reponse, object? corps)> Envoyer(string chemin, Fiche corps)
    {
        try
        {
            using var r = Requete(chemin, HttpMethod.Post, corps);
            var reponse = await http.SendAsync(r);
            return (reponse, V.LireJson(await reponse.Content.ReadAsStringAsync()));
        }
        catch (Exception) { throw new ErreurHumalis(Serveur.PasDeReponse); }
    }

    public static async Task SeConnecter(string email, string motDePasse)
    {
        var (reponse, corps) = await Envoyer("/auth/login", V.FicheDe(("email", email), ("password", motDePasse)));
        if ((int)reponse.StatusCode == 429) throw new ErreurHumalis("Trop de tentatives de connexion. Réessayez dans quelques minutes.");
        // Jamais lequel des deux est faux : on ne dit pas si un compte existe.
        if (!reponse.IsSuccessStatusCode) throw new ErreurHumalis("Email ou mot de passe incorrect.");
        Garder(V.Champ(corps, "data"));
        demande = Relire();
        await demande;
    }

    public static async Task ChangerMotDePasse(string actuel, string nouveau)
    {
        var (reponse, corps) = await Envoyer("/auth/mot-de-passe", V.FicheDe(("actuel", actuel), ("nouveau", nouveau)));
        if ((int)reponse.StatusCode == 429) throw new ErreurHumalis("Trop de tentatives. Réessayez dans quelques minutes.");
        if (!reponse.IsSuccessStatusCode)
        {
            var raison = V.T(V.Champ(corps, "erreur"));
            throw new ErreurHumalis(V.AvecMajuscule(raison.Length > 0 ? raison : "le mot de passe n'a pas été changé") + ".");
        }
        Garder(corps);
    }

    public static async Task SeDeconnecter()
    {
        try { await Envoyer("/auth/logout", new Fiche()); } catch (ErreurHumalis) { }
        Oublier();
        demande = Relire();
        await demande;
    }

    /// <summary>Une action sur le compte : refusée, le message s'affiche ; vrai si elle a réussi.</summary>
    public static async Task<bool> AfficherSiRefus(Func<Task> action)
    {
        try
        {
            await action();
            return true;
        }
        catch (ErreurHumalis e)
        {
            Messages.Afficher(e.Message, "erreur");
            return false;
        }
    }
}
`;
