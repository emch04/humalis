/**
 * « en direct » sur Windows : le serveur annonce qu'une route a changé, la page relit
 * cette route avec ses droits. Le même canal que le web, Apple et Android.
 */
export const DIRECT_CS = String.raw`// Produit par Humalis : « en direct » : le serveur annonce un changement, la page relit sa route.
using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Humalis;

/// <summary>
/// Écoute « adresse/direct » tant que la page est ouverte. Tout se passe sur le fil de l'interface :
/// la lecture attend sans le bloquer, et la page se réécrit sans changer de fil.
/// </summary>
public sealed class Direct : IDisposable
{
    private static readonly HttpClient http = new(new HttpClientHandler { UseCookies = false, AllowAutoRedirect = false }) { Timeout = Timeout.InfiniteTimeSpan };

    /// <summary>Le serveur bat toutes les 25 secondes : un silence plus long est une coupure muette.</summary>
    private static readonly TimeSpan Silence = TimeSpan.FromSeconds(60);

    private readonly string adresse;
    private readonly CancellationTokenSource fin = new();
    private bool enCours;
    private bool encore;

    public Func<Task> Relire { get; set; }

    public Direct(string adresse, Func<Task> relire)
    {
        this.adresse = adresse.StartsWith('/') ? adresse : "/" + adresse;
        Relire = relire;
        _ = Ecouter();
    }

    private async Task Ecouter()
    {
        var attente = 1000;
        var dejaOuvert = false;
        while (!fin.IsCancellationRequested)
        {
            try
            {
                using var requete = new HttpRequestMessage(HttpMethod.Get, Serveur.Base + adresse + "/direct");
                requete.Headers.TryAddWithoutValidation("Accept", "text/event-stream");
                requete.Headers.TryAddWithoutValidation("x-humalis-mobile", "1");
                if (Session.Jeton is { } jeton) requete.Headers.TryAddWithoutValidation("Authorization", "Bearer " + jeton);
                using var ouverture = CancellationTokenSource.CreateLinkedTokenSource(fin.Token);
                ouverture.CancelAfter(Silence);
                using var reponse = await http.SendAsync(requete, HttpCompletionOption.ResponseHeadersRead, ouverture.Token);
                if (reponse.StatusCode == HttpStatusCode.Unauthorized) await Session.Renouveler();
                else if (reponse.IsSuccessStatusCode)
                {
                    attente = 1000;
                    // Après une coupure, on rattrape ce qui a changé entre-temps.
                    if (dejaOuvert) Demander();
                    dejaOuvert = true;
                    await using var flux = await reponse.Content.ReadAsStreamAsync(fin.Token);
                    using var lecteur = new StreamReader(flux, Encoding.UTF8);
                    while (true)
                    {
                        using var veille = CancellationTokenSource.CreateLinkedTokenSource(fin.Token);
                        veille.CancelAfter(Silence);
                        var ligne = await lecteur.ReadLineAsync(veille.Token);
                        if (ligne is null) break;
                        if (ligne == "data: change") Demander();
                    }
                }
            }
            catch (Exception) when (!fin.IsCancellationRequested) { }
            catch (Exception) { return; }
            try { await Task.Delay(attente + Random.Shared.Next(500), fin.Token); }
            catch (OperationCanceledException) { return; }
            attente = Math.Min(attente * 2, 30000);
        }
    }

    /// <summary>Une lecture à la fois, et une de plus si une annonce arrive pendant : la dernière réponse est toujours la plus récente.</summary>
    private async void Demander()
    {
        if (enCours)
        {
            encore = true;
            return;
        }
        enCours = true;
        try
        {
            do
            {
                encore = false;
                // Le hasard évite que tout le monde relise au même instant.
                await Task.Delay(120 + Random.Shared.Next(800), fin.Token);
                await Relire();
            } while (encore && !fin.IsCancellationRequested);
        }
        // Une relecture manquée ne dit rien : la prochaine annonce ou la reconnexion la refera.
        catch (Exception) { }
        finally { enCours = false; }
    }

    public void Dispose() => fin.Cancel();
}
`;
