// Essai du cœur des données locales de Windows : la base SQLite, le chiffrement, la file, les conflits.
// Lancé par scripts/essai-windows-coeur.mjs : un programme console, qui tourne sur n'importe quel système.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Humalis;
using Microsoft.Data.Sqlite;

var dossier = args[0];
Directory.CreateDirectory(dossier);
var problemes = 0;
void Verifier(bool ok, string message)
{
    if (!ok) problemes++;
    Console.WriteLine((ok ? "✓ " : "✗ ") + message);
}
var numeroBase = 0;
string NouveauChemin() => Path.Combine(dossier, $"base-{++numeroBase}-{Guid.NewGuid():N}.db");
var coffre = new CoffreCle(c => c.Select(o => (byte)(o ^ 0x5A)).ToArray(), c => c.Select(o => (byte)(o ^ 0x5A)).ToArray());
Fiche Note(string titre) => V.FicheDe(("titre", titre), ("lu", false));
Liste Avec(Liste l, params object?[] plus) => new(l.Concat(plus));

// Sur 401 et les pannes, le comportement dépend de ces réponses : chaque essai les choisit.
var sortie = await Essais();
return sortie;

async Task<int> Essais()
{
    {
        var serveur = new FauxServeur();
        using var appareil = await Appareil.Ouvrir(NouveauChemin(), coffre, serveur);
        appareil.Liste = Avec(appareil.Liste, Note("Une"));
        appareil.Observer();
        await appareil.Coeur.Fini();
        var ecrite = (Fiche)appareil.Liste[0]!;
        Verifier(ecrite["id"] is string s && Guid.TryParse(s, out _), "une fiche sans id reçoit un UUID");
        Verifier(appareil.Coeur.EnAttente == 1, "elle attend dans la file");
        await appareil.Coeur.Synchroniser();
        var envoi = (Fiche)V.L(serveur.Envois[0]["envois"])[0]!;
        Verifier(V.T(envoi["operation"]).Length == 32 && V.T(envoi["operation"]).All(Uri.IsHexDigit), "l'opération fait 32 chiffres hexadécimaux");
        Verifier(V.T(V.Champ(envoi["valeurs"], "titre")) == "Une" && !((Fiche)envoi["valeurs"]!).ContainsKey("id"), "les valeurs partent sans l'id");
        Verifier(appareil.Coeur.EnAttente == 0, "acceptée, elle quitte la file");
        Verifier(serveur.Lectures.Contains("/api/notes/synchro?depuis=0"), "puis on reçoit depuis le curseur");
    }
    {
        var serveur = new FauxServeur();
        var chemin = NouveauChemin();
        var appareil = await Appareil.Ouvrir(chemin, coffre, serveur);
        appareil.Liste = Avec(appareil.Liste, Note("Secrète"));
        appareil.Observer();
        await appareil.Coeur.Fini();
        appareil.Dispose();
        var brut = Encoding.UTF8.GetString(File.ReadAllBytes(chemin)) + (File.Exists(chemin + "-wal") ? Encoding.UTF8.GetString(File.ReadAllBytes(chemin + "-wal")) : "");
        Verifier(!brut.Contains("Secrète") && !brut.Contains("titre"), "dans le fichier, le contenu est chiffré");
        using var relancee = await Appareil.Ouvrir(chemin, coffre, serveur);
        Verifier(V.T(V.Champ(relancee.Liste.Single(), "titre")) == "Secrète" && relancee.Coeur.EnAttente == 1, "après une relance, la fiche et la file reviennent");
        relancee.Dispose();
        var mauvais = new CoffreCle(c => c, c => null);
        var refus = false;
        try { await BaseSqlite.Ouvrir(chemin, mauvais); } catch (Exception) { refus = true; }
        Verifier(refus, "sans le coffre, la base ne s'ouvre pas");
        // Un contenu déplacé sur une autre fiche ne s'ouvre pas : l'id est dans les données associées.
        using (var c = new SqliteConnection($"Data Source={chemin};Pooling=False"))
        {
            c.Open();
            using var m = c.CreateCommand();
            m.CommandText = "UPDATE fiches SET id = '00000000-0000-4000-8000-000000000000'";
            m.ExecuteNonQuery();
        }
        var base2 = await BaseSqlite.Ouvrir(chemin, coffre);
        var deplace = false;
        try { await base2.Lire(); } catch (Exception) { deplace = true; }
        base2.Dispose();
        Verifier(deplace, "un contenu déplacé sur une autre fiche est refusé");
    }
    {
        var serveur = new FauxServeur();
        using var appareil = await Appareil.Ouvrir(NouveauChemin(), coffre, serveur);
        appareil.Liste = Avec(appareil.Liste, Note("Éphémère"));
        appareil.Observer();
        appareil.Liste = new Liste();
        appareil.Observer();
        await appareil.Coeur.Fini();
        await appareil.Coeur.Synchroniser();
        Verifier(serveur.Envois.Count == 0, "créée puis supprimée sans envoi : rien ne part");
    }
    {
        var serveur = new FauxServeur { Etat = _ => ("ignore", V.FicheDe(("titre", "Du serveur"), ("lu", true)), null) };
        using var appareil = await Appareil.Ouvrir(NouveauChemin(), coffre, serveur);
        appareil.Liste = Avec(appareil.Liste, Note("Locale"));
        appareil.Observer();
        await appareil.Coeur.Synchroniser();
        Verifier(V.T(V.Champ(appareil.Liste.Single(), "titre")) == "Du serveur", "conflit perdu : on adopte la version du serveur");
    }
    {
        var serveur = new FauxServeur { Etat = _ => ("refuse", null, "Interdit ici.") };
        using var appareil = await Appareil.Ouvrir(NouveauChemin(), coffre, serveur);
        appareil.Liste = Avec(appareil.Liste, Note("Refusée"));
        appareil.Observer();
        await appareil.Coeur.Synchroniser();
        Verifier(appareil.Liste.Count == 0 && appareil.Dits.Contains("Interdit ici."), "refusée sans version actuelle : la fiche part, la raison est dite");
    }
    {
        var serveur = new FauxServeur();
        using var appareil = await Appareil.Ouvrir(NouveauChemin(), coffre, serveur);
        appareil.Liste = Avec(appareil.Liste, Note("Avant"));
        appareil.Observer();
        var attente = new TaskCompletionSource();
        var parti = new TaskCompletionSource();
        serveur.AvantReponse = async () => { parti.TrySetResult(); await attente.Task; serveur.AvantReponse = null; };
        var synchro = appareil.Coeur.Synchroniser();
        await parti.Task;
        var f = (Fiche)appareil.Liste[0]!;
        appareil.Liste = new Liste { new Fiche(f) { ["titre"] = "Après" } };
        appareil.Observer();
        attente.SetResult();
        await synchro;
        Verifier(serveur.Envois.Count == 2 && V.T(V.Champ(((Fiche)V.L(serveur.Envois[1]["envois"])[0]!)["valeurs"], "titre")) == "Après", "changée pendant l'envoi : la nouvelle version repart");
        Verifier(appareil.Coeur.EnAttente == 0, "et la file se vide");
    }
    {
        var serveur = new FauxServeur();
        using var appareil = await Appareil.Ouvrir(NouveauChemin(), coffre, serveur);
        for (var i = 0; i < 250; i++) appareil.Liste = Avec(appareil.Liste, Note("N" + i));
        appareil.Observer();
        await appareil.Coeur.Synchroniser();
        Verifier(serveur.Envois.Select(e => V.L(e["envois"]).Count).SequenceEqual(new[] { 100, 100, 50 }), "les envois partent par lots de 100");
    }
    {
        var serveur = new FauxServeur();
        var chemin = NouveauChemin();
        var appareil = await Appareil.Ouvrir(chemin, coffre, serveur);
        var a = Guid.NewGuid().ToString();
        var b = Guid.NewGuid().ToString();
        serveur.Pages.Enqueue(V.FicheDe(("changements", new Liste { V.FicheDe(("id", a), ("supprime", false), ("valeurs", Note("A")), ("version", 1d)) }), ("curseur", 5d), ("encore", true), ("reinitialiser", false)));
        serveur.Pages.Enqueue(V.FicheDe(("changements", new Liste { V.FicheDe(("id", b), ("supprime", false), ("valeurs", Note("B")), ("version", 2d)) }), ("curseur", 9d), ("encore", false), ("reinitialiser", false)));
        await appareil.Coeur.Synchroniser();
        Verifier(appareil.Liste.Count == 2 && serveur.Lectures.SequenceEqual(new[] { "/api/notes/synchro?depuis=0", "/api/notes/synchro?depuis=5" }), "la lecture boucle tant que « encore »");
        appareil.Dispose();
        var relancee = await Appareil.Ouvrir(chemin, coffre, serveur);
        serveur.Lectures.Clear();
        // Une fiche à nous attend dans la file : une réinitialisation la garde.
        var locale = (Fiche)relancee.Liste[0]!;
        relancee.Liste = new Liste { new Fiche(locale) { ["titre"] = "A changée" }, relancee.Liste[1] };
        relancee.Observer();
        serveur.BloquerEnvois = true;
        serveur.Pages.Enqueue(V.FicheDe(("changements", new Liste { V.FicheDe(("id", a), ("supprime", false), ("valeurs", Note("Ne passe pas")), ("version", 3d)) }), ("curseur", 12d), ("encore", false), ("reinitialiser", true)));
        await relancee.Coeur.Synchroniser();
        Verifier(serveur.Lectures.Single() == "/api/notes/synchro?depuis=9", "après une relance, le curseur est relu");
        Verifier(relancee.Liste.Count == 1 && V.T(V.Champ(relancee.Liste[0], "titre")) == "A changée", "réinitialiser : seul ce qui attend reste, et le serveur ne l'écrase pas");
        relancee.Dispose();
    }
    {
        var serveur = new FauxServeur { Statut = 401 };
        using var appareil = await Appareil.Ouvrir(NouveauChemin(), coffre, serveur);
        appareil.Liste = Avec(appareil.Liste, Note("Sans session"));
        appareil.Observer();
        await appareil.Coeur.Synchroniser();
        Verifier(appareil.Coeur.EnAttente == 1 && serveur.Lectures.Count == 0, "401 : on s'arrête sans erreur, la file reste");
        serveur.Statut = 500;
        var panne = false;
        try { await appareil.Coeur.Synchroniser(); } catch (InvalidOperationException) { panne = true; }
        Verifier(panne && appareil.Coeur.EnAttente == 1, "500 : l'erreur remonte pour la reprise, la file reste");
    }
    {
        var serveur = new FauxServeur();
        using var a = await Appareil.Ouvrir(NouveauChemin(), coffre, serveur);
        a.Liste = Avec(a.Liste, Note("De A"));
        a.Observer();
        var attente = new TaskCompletionSource();
        var parti = new TaskCompletionSource();
        serveur.AvantReponse = async () => { parti.TrySetResult(); await attente.Task; serveur.AvantReponse = null; };
        var synchro = a.Coeur.Synchroniser();
        await parti.Task;
        a.Coeur.Suspendre();
        var autreChemin = NouveauChemin();
        var autre = await BaseSqlite.Ouvrir(autreChemin, coffre);
        await a.Coeur.Ouvrir(autre);
        attente.SetResult();
        await synchro;
        var lu = await autre.Lire();
        Verifier(lu.Fiches.Count == 0 && lu.File.Count == 0 && lu.Curseur == 0, "le compte change pendant un envoi : la réponse n'écrit pas dans l'autre base");
        autre.Dispose();
    }
    Console.WriteLine(problemes == 0 ? "\nTout est vérifié." : $"\n{problemes} problème(s).");
    return problemes == 0 ? 0 : 1;
}

sealed class FauxServeur : ITransportLocal
{
    public readonly List<Fiche> Envois = new();
    public readonly List<string> Lectures = new();
    public readonly Queue<Fiche> Pages = new();
    public Func<Fiche, (string etat, Fiche? actuelle, string? raison)> Etat = _ => ("applique", null, null);
    public Func<Task>? AvantReponse;
    public int Statut = 200;
    public bool BloquerEnvois;

    public async Task<ReponseLocale> Envoyer(string chemin, Fiche corps)
    {
        if (Statut != 200) return new ReponseLocale(Statut, null);
        if (BloquerEnvois) return new ReponseLocale(200, V.FicheDe(("resultats", new Liste()), ("heure", 1d)));
        Envois.Add(corps);
        if (AvantReponse is { } attendre) await attendre();
        var resultats = new Liste(V.L(corps["envois"]).OfType<Fiche>().Select(e =>
        {
            var (etat, actuelle, raison) = Etat(e);
            var r = V.FicheDe(("operation", e["operation"]), ("id", e["id"]), ("etat", etat));
            if (etat != "applique") r["actuelle"] = actuelle;
            if (raison is not null) r["raison"] = raison;
            return (object?)r;
        }));
        return new ReponseLocale(200, V.FicheDe(("resultats", resultats), ("heure", 1d)));
    }

    public Task<ReponseLocale> Lire(string chemin)
    {
        if (Statut != 200) return Task.FromResult(new ReponseLocale(Statut, null));
        Lectures.Add(chemin);
        var page = Pages.Count > 0 ? Pages.Dequeue() : V.FicheDe(("changements", new Liste()), ("curseur", 0d), ("encore", false), ("reinitialiser", false));
        return Task.FromResult(new ReponseLocale(200, page));
    }
}

sealed class Appareil : IDisposable
{
    public Liste Liste = new();
    public readonly List<string> Dits = new();
    public CoeurLocal Coeur = null!;
    private BaseSqlite baseLocale = null!;

    public static async Task<Appareil> Ouvrir(string chemin, CoffreCle coffre, ITransportLocal transport)
    {
        var a = new Appareil();
        a.Coeur = new CoeurLocal(new OptionsCoeur { Champs = new[] { "titre", "lu" }, Route = "/api/notes", Transport = transport, Lire = () => a.Liste, Ecrire = l => a.Liste = l, Dire = a.Dits.Add });
        a.baseLocale = await BaseSqlite.Ouvrir(chemin, coffre);
        await a.Coeur.Ouvrir(a.baseLocale);
        return a;
    }

    public void Observer() => Coeur.Observer(Liste);

    public void Dispose()
    {
        Coeur.Fini().Wait();
        baseLocale.Dispose();
    }
}
