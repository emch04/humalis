/**
 * Les données sur l'appareil, le code à six chiffres et les clés d'accès, en C#.
 * Le cœur est un portage fidèle de `creerCoeur` et de `creerCompteSecurise`
 * (src/cibles/commun/donnees-comptes-web.ts) : la même file, le même curseur, les mêmes conflits.
 *
 * COEUR_LOCAL_CS n'emploie ni WPF ni Windows : il se compile et s'essaie sur n'importe quel système.
 * La base est un fichier SQLite ; `avec chiffree` chiffre chaque contenu en AES-256-GCM, avec une
 * clé scellée par DPAPI : lisible seulement par la personne connectée à cette session Windows.
 */

/** Humalis/CoeurLocal.cs */
export const COEUR_LOCAL_CS = String.raw`// Produit par Humalis : une donnée locale, une vraie base sur l'appareil, et sa file d'envoi.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;

namespace Humalis;

public sealed record FicheLocale(string Id, long Ordre, Fiche Valeurs);

/// <summary>Une ligne de la file d'envoi : une seule par fiche, la dernière modification remplace la précédente.</summary>
public sealed record LigneFile(string Id, string Operation, double ModifieLe, bool Supprime, bool Creation, Fiche? Valeurs);

/// <summary>Ce qu'une transaction écrit dans la base.</summary>
public sealed class EcrituresLocales
{
    public readonly List<FicheLocale> Fiches = new();
    public readonly List<string> Retirees = new();
    public readonly List<LigneFile> File = new();
    public readonly List<string> Envoyees = new();
    public double? Curseur;

    public bool Vide => Fiches.Count == 0 && Retirees.Count == 0 && File.Count == 0 && Envoyees.Count == 0 && Curseur is null;
}

public sealed record LectureLocale(List<FicheLocale> Fiches, List<LigneFile> File, double Curseur);

public interface IBaseLocale : IDisposable
{
    Task<LectureLocale> Lire();
    Task Appliquer(EcrituresLocales ecritures);
}

public sealed record ReponseLocale(int Statut, object? Corps)
{
    public bool Ok => Statut >= 200 && Statut < 300;
}

public interface ITransportLocal
{
    Task<ReponseLocale> Envoyer(string chemin, Fiche corps);
    Task<ReponseLocale> Lire(string chemin);
}

public sealed class OptionsCoeur
{
    public required string[] Champs { get; init; }
    public string? Route { get; init; }
    public required ITransportLocal Transport { get; init; }
    public required Func<object?> Lire { get; init; }
    public required Action<Liste> Ecrire { get; init; }
    public Action? Planifier { get; init; }
    public Action<string>? Dire { get; init; }
    public Action<Exception>? Panne { get; init; }
    public Func<double>? Maintenant { get; init; }
    public Func<string>? NouvelId { get; init; }
}

/// <summary>
/// La liste affichée d'un côté, la base de l'autre. La liste reste la vérité de la page : chaque
/// changement y est comparé à ce que la base connaît, et devient une écriture, puis une ligne de la file.
/// </summary>
public sealed class CoeurLocal
{
    private const int Lot = 100;

    private readonly OptionsCoeur o;
    private readonly Func<double> maintenant;
    private readonly Func<string> nouvelId;
    private IBaseLocale? baseLocale;
    private bool pret;
    private Dictionary<string, string> connus = new();
    private Dictionary<string, Fiche> objets = new();
    private Dictionary<string, long> ordres = new();
    private Dictionary<string, LigneFile> file = new();
    private double curseur;
    private long prochain = 1;
    private readonly HashSet<string> enVol = new();
    private Task suite = Task.CompletedTask;
    private Task<bool>? enCours;
    private bool encoreUneFois;
    // Change avec le compte : une réponse demandée pour un compte n'écrit jamais dans la base d'un autre.
    private int generation;

    public CoeurLocal(OptionsCoeur options)
    {
        o = options;
        maintenant = o.Maintenant ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        nouvelId = o.NouvelId ?? (() => Guid.NewGuid().ToString());
    }

    public int EnAttente => file.Count;

    /// <summary>Toutes les écritures demandées sont faites.</summary>
    public Task Fini() => Calme(suite);

    private string NouvelleOperation() => nouvelId().Replace("-", "");

    private static async Task Calme(Task tache)
    {
        try { await tache; } catch (Exception) { }
    }

    private static async Task Apres(Task avant, Func<Task> travail)
    {
        await Calme(avant);
        await travail();
    }

    private Task EnOrdre(Func<Task> travail)
    {
        var resultat = Apres(suite, travail);
        suite = resultat;
        return resultat;
    }

    private Fiche ValeursDe(Fiche fiche)
    {
        var valeurs = new Fiche();
        foreach (var champ in o.Champs) valeurs[champ] = V.Champ(fiche, champ);
        return valeurs;
    }

    private Liste ListeTriee() => new(ordres.OrderBy(p => p.Value).Select(p => (object?)objets[p.Key]));

    private void Publier() => o.Ecrire(ListeTriee());

    private bool Adopter(string id, Fiche valeurs, EcrituresLocales ecritures)
    {
        var propres = ValeursDe(valeurs);
        var texte = V.EnJson(propres);
        if (connus.TryGetValue(id, out var connu) && connu == texte) return false;
        connus[id] = texte;
        objets[id] = new Fiche(propres) { ["id"] = id };
        if (!ordres.ContainsKey(id)) ordres[id] = prochain++;
        ecritures.Fiches.Add(new FicheLocale(id, ordres[id], propres));
        return true;
    }

    private bool Oublier(string id, EcrituresLocales ecritures)
    {
        if (!connus.Remove(id)) return false;
        objets.Remove(id);
        ordres.Remove(id);
        ecritures.Retirees.Add(id);
        return true;
    }

    /// <summary>Compare la liste à la base : ce qui a changé part dans la base et dans la file.</summary>
    public void Observer(object? valeur)
    {
        if (!pret || valeur is not Liste liste) return;
        var vus = new HashSet<string>();
        var completee = false;
        var sortie = new Liste();
        foreach (var element in liste)
        {
            if (element is not Fiche fiche) { sortie.Add(element); continue; }
            if (fiche.TryGetValue("id", out var existant) && existant is string identifiant && vus.Add(identifiant)) { sortie.Add(fiche); continue; }
            completee = true;
            var id = nouvelId();
            vus.Add(id);
            sortie.Add(new Fiche(fiche) { ["id"] = id });
        }
        var ecritures = new EcrituresLocales();
        var moment = maintenant();
        foreach (var fiche in sortie.OfType<Fiche>())
        {
            var id = (string)fiche["id"]!;
            var propres = ValeursDe(fiche);
            var texte = V.EnJson(propres);
            var nouvelle = !connus.TryGetValue(id, out var connu);
            if (connu != texte)
            {
                var ordre = nouvelle ? prochain++ : ordres[id];
                connus[id] = texte;
                objets[id] = fiche;
                ordres[id] = ordre;
                ecritures.Fiches.Add(new FicheLocale(id, ordre, propres));
                if (o.Route is not null)
                {
                    file.TryGetValue(id, out var avant);
                    var entree = new LigneFile(id, NouvelleOperation(), moment, false, nouvelle || avant?.Creation == true, propres);
                    file[id] = entree;
                    ecritures.File.Add(entree);
                }
            }
            else objets[id] = fiche;
        }
        foreach (var id in connus.Keys.ToList())
        {
            if (vus.Contains(id)) continue;
            Oublier(id, ecritures);
            if (o.Route is null) continue;
            file.TryGetValue(id, out var avant);
            // Créée et supprimée sans avoir jamais quitté l'appareil : le serveur n'a pas à le savoir.
            if (avant?.Creation == true && !enVol.Contains(id))
            {
                file.Remove(id);
                ecritures.Envoyees.Add(id);
            }
            else
            {
                var entree = new LigneFile(id, NouvelleOperation(), moment, true, false, null);
                file[id] = entree;
                ecritures.File.Add(entree);
            }
        }
        if (completee) o.Ecrire(sortie);
        if (ecritures.Vide) return;
        var cible = baseLocale!;
        Suivre(EnOrdre(() => cible.Appliquer(ecritures)));
        if (o.Route is not null) o.Planifier?.Invoke();
    }

    private async void Suivre(Task tache)
    {
        try { await tache; }
        catch (Exception e) { o.Panne?.Invoke(e); }
    }

    /// <summary>Le compte change : plus rien n'est lu ni envoyé tant que sa base n'est pas ouverte.</summary>
    public void Suspendre()
    {
        pret = false;
        generation++;
    }

    /// <summary>Ouvre la base d'un compte et publie ce qu'elle contient.</summary>
    public Task Ouvrir(IBaseLocale nouvelle) => EnOrdre(async () =>
    {
        // Ce qui a été ajouté avant l'ouverture n'a pas encore d'identifiant : on le garde.
        var enAttente = pret ? new List<object?>() : V.L(o.Lire()).Where(f => f is Fiche fiche && fiche.GetValueOrDefault("id") is not string).ToList();
        pret = false;
        baseLocale = nouvelle;
        await Charger();
        pret = true;
        if (enAttente.Count > 0)
        {
            var liste = ListeTriee();
            liste.AddRange(enAttente);
            o.Ecrire(liste);
            return;
        }
        Publier();
    });

    private async Task Charger()
    {
        var lu = await baseLocale!.Lire();
        connus = new();
        objets = new();
        ordres = new();
        file = lu.File.ToDictionary(e => e.Id);
        curseur = lu.Curseur;
        prochain = 1;
        foreach (var fiche in lu.Fiches)
        {
            var propres = ValeursDe(fiche.Valeurs);
            connus[fiche.Id] = V.EnJson(propres);
            objets[fiche.Id] = new Fiche(propres) { ["id"] = fiche.Id };
            ordres[fiche.Id] = fiche.Ordre;
            prochain = Math.Max(prochain, fiche.Ordre + 1);
        }
    }

    /// <summary>Un autre lancement de l'application a écrit : la base fait foi.</summary>
    public Task Recharger()
    {
        if (baseLocale is null) return Task.CompletedTask;
        return EnOrdre(async () =>
        {
            if (!pret) return;
            await Charger();
            Publier();
        });
    }

    private static Fiche Envoi(LigneFile e)
    {
        var f = V.FicheDe(("id", e.Id), ("operation", e.Operation), ("modifieLe", e.ModifieLe));
        if (e.Supprime) f["supprime"] = true;
        else f["valeurs"] = e.Valeurs;
        return f;
    }

    private async Task<bool> Envoyer(int moment)
    {
        var taille = Lot;
        while (file.Count > 0 && moment == generation)
        {
            var lot = file.Values.Take(taille).ToList();
            foreach (var entree in lot) enVol.Add(entree.Id);
            ReponseLocale reponse;
            try
            {
                reponse = await o.Transport.Envoyer(o.Route + "/synchro", V.FicheDe(("heure", maintenant()), ("envois", new Liste(lot.Select(e => (object?)Envoi(e))))));
            }
            finally
            {
                foreach (var entree in lot) enVol.Remove(entree.Id);
            }
            if (moment != generation) return false;
            if (reponse.Statut is 401 or 403) return false;
            if (reponse.Statut == 413)
            {
                // Trop lourd : on coupe le lot en deux. Une fiche seule trop lourde ne bloque pas les suivantes.
                if (lot.Count > 1)
                {
                    taille = (lot.Count + 1) / 2;
                    continue;
                }
                var seule = lot[0];
                var retrait = new EcrituresLocales();
                file.Remove(seule.Id);
                retrait.Envoyees.Add(seule.Id);
                var retiree = seule.Creation && Oublier(seule.Id, retrait);
                var base413 = baseLocale!;
                await EnOrdre(() => base413.Appliquer(retrait));
                if (retiree) Publier();
                o.Dire?.Invoke("Cette fiche est trop lourde pour être envoyée au serveur.");
                continue;
            }
            if (!reponse.Ok) throw new InvalidOperationException("envoi refusé (" + reponse.Statut + ")");
            var ecritures = new EcrituresLocales();
            var change = false;
            var resultats = V.L(V.Champ(reponse.Corps, "resultats"));
            foreach (var resultat in resultats)
            {
                var id = V.T(V.Champ(resultat, "id"));
                file.TryGetValue(id, out var entree);
                var encoreLaMeme = entree is not null && entree.Operation == V.T(V.Champ(resultat, "operation"));
                if (!encoreLaMeme) continue;
                file.Remove(id);
                ecritures.Envoyees.Add(id);
                var etat = V.T(V.Champ(resultat, "etat"));
                if (etat == "applique") continue;
                // Le serveur a gardé autre chose : sa version remplace la nôtre, sauf si l'on a déjà rechangé cette fiche.
                if (V.Champ(resultat, "actuelle") is Fiche actuelle) change = Adopter(id, actuelle, ecritures) || change;
                else change = Oublier(id, ecritures) || change;
                if (etat == "refuse")
                {
                    var raison = V.T(V.Champ(resultat, "raison"));
                    o.Dire?.Invoke(raison.Length > 0 ? raison : "Le serveur a refusé une modification.");
                }
            }
            var cible = baseLocale!;
            await EnOrdre(() => cible.Appliquer(ecritures));
            if (change) Publier();
            // Un serveur qui ne répond rien sur un lot : on ne boucle pas.
            if (resultats.Count == 0) break;
        }
        return moment == generation;
    }

    private async Task Recevoir(int moment)
    {
        while (moment == generation)
        {
            var reponse = await o.Transport.Lire(o.Route + "/synchro?depuis=" + Uri.EscapeDataString(curseur.ToString("R", CultureInfo.InvariantCulture)));
            if (moment != generation) return;
            if (reponse.Statut is 401 or 403) return;
            if (!reponse.Ok) throw new InvalidOperationException("lecture refusée (" + reponse.Statut + ")");
            var ecritures = new EcrituresLocales();
            var change = false;
            if (V.B(V.Champ(reponse.Corps, "reinitialiser")))
            {
                // Absent trop longtemps : seul ce qui attend encore d'être envoyé reste.
                foreach (var id in connus.Keys.ToList())
                    if (!file.ContainsKey(id)) change = Oublier(id, ecritures) || change;
            }
            foreach (var changement in V.L(V.Champ(reponse.Corps, "changements")))
            {
                var id = V.T(V.Champ(changement, "id"));
                // Une modification locale attend son tour : elle partira, et le serveur tranchera.
                if (file.ContainsKey(id)) continue;
                if (V.B(V.Champ(changement, "supprime"))) change = Oublier(id, ecritures) || change;
                else if (V.Champ(changement, "valeurs") is Fiche valeurs) change = Adopter(id, valeurs, ecritures) || change;
            }
            curseur = V.N(V.Champ(reponse.Corps, "curseur"));
            ecritures.Curseur = curseur;
            var cible = baseLocale!;
            await EnOrdre(() => cible.Appliquer(ecritures));
            if (change) Publier();
            if (!V.B(V.Champ(reponse.Corps, "encore"))) return;
        }
    }

    /// <summary>Envoie ce qui attend, puis reçoit ce qui a changé. Une seule à la fois.</summary>
    public Task<bool> Synchroniser()
    {
        if (o.Route is null || !pret) return Task.FromResult(false);
        if (enCours is not null)
        {
            encoreUneFois = true;
            return enCours;
        }
        enCours = Faire();
        return enCours;

        async Task<bool> Faire()
        {
            await Task.Yield();
            var moment = generation;
            try
            {
                do
                {
                    encoreUneFois = false;
                    Observer(o.Lire());
                    await Calme(suite);
                    if (await Envoyer(moment)) await Recevoir(moment);
                } while (encoreUneFois && moment == generation);
                return true;
            }
            finally
            {
                enCours = null;
                // Le compte a changé pendant l'échange : la nouvelle base attend son tour.
                if (moment != generation) o.Planifier?.Invoke();
            }
        }
    }
}

/// <summary>Scelle la clé d'une base : le coffre du système (DPAPI sous Windows).</summary>
public sealed record CoffreCle(Func<byte[], byte[]?> Sceller, Func<byte[], byte[]?> Ouvrir);

/// <summary>La base de l'appareil : un fichier SQLite ; avec un coffre, chaque contenu est chiffré.</summary>
public sealed class BaseSqlite : IBaseLocale
{
    private const int TailleIv = 12;
    private const int TailleEtiquette = 16;

    private readonly SqliteConnection connexion;
    private readonly object verrou = new();
    private readonly byte[]? cle;
    private long versionVue = -1;

    private BaseSqlite(SqliteConnection connexion, byte[]? cle)
    {
        this.connexion = connexion;
        this.cle = cle;
    }

    /// <summary>Ouvre (ou crée) la base ; lève une exception si sa clé ne peut pas être ouverte.</summary>
    public static Task<BaseSqlite> Ouvrir(string chemin, CoffreCle? coffre) => Task.Run(() =>
    {
        Directory.CreateDirectory(Path.GetDirectoryName(chemin)!);
        var connexion = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = chemin, Mode = SqliteOpenMode.ReadWriteCreate, Pooling = false, DefaultTimeout = 30 }.ToString());
        try
        {
            connexion.Open();
            Executer(connexion, "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; PRAGMA busy_timeout=10000;");
            Executer(connexion, "CREATE TABLE IF NOT EXISTS fiches (id TEXT PRIMARY KEY, ordre INTEGER NOT NULL, contenu BLOB NOT NULL);" +
                "CREATE TABLE IF NOT EXISTS file (id TEXT PRIMARY KEY, operation TEXT NOT NULL, modifieLe REAL NOT NULL, supprime INTEGER NOT NULL, creation INTEGER NOT NULL, contenu BLOB);" +
                "CREATE TABLE IF NOT EXISTS meta (cle TEXT PRIMARY KEY, valeur BLOB);");
            var base_ = new BaseSqlite(connexion, coffre is null ? null : CleDe(connexion, coffre));
            return base_;
        }
        catch (Exception)
        {
            connexion.Dispose();
            throw;
        }
    });

    private static void Executer(SqliteConnection connexion, string sql)
    {
        using var commande = connexion.CreateCommand();
        commande.CommandText = sql;
        commande.ExecuteNonQuery();
    }

    /// <summary>La clé de cette base : créée une fois, gardée dans la base, scellée par le coffre : le fichier seul ne l'ouvre pas.</summary>
    private static byte[] CleDe(SqliteConnection connexion, CoffreCle coffre)
    {
        byte[]? Lue()
        {
            using var commande = connexion.CreateCommand();
            commande.CommandText = "SELECT valeur FROM meta WHERE cle = 'cle'";
            return commande.ExecuteScalar() as byte[];
        }
        var scellee = Lue();
        if (scellee is null)
        {
            var neuve = RandomNumberGenerator.GetBytes(32);
            var fermee = coffre.Sceller(neuve) ?? throw new CryptographicException("le coffre du système ne répond pas");
            // Un autre lancement a pu la créer pendant ce temps : la première écrite reste.
            using var commande = connexion.CreateCommand();
            commande.CommandText = "INSERT OR IGNORE INTO meta (cle, valeur) VALUES ('cle', $valeur)";
            commande.Parameters.AddWithValue("$valeur", fermee);
            commande.ExecuteNonQuery();
            scellee = Lue()!;
        }
        return coffre.Ouvrir(scellee) ?? throw new CryptographicException("la clé de cette base ne peut pas être ouverte");
    }

    private byte[] Sceller(string id, Fiche valeurs)
    {
        var clair = Encoding.UTF8.GetBytes(V.EnJson(valeurs));
        if (cle is null) return clair;
        var sortie = new byte[TailleIv + TailleEtiquette + clair.Length];
        var iv = sortie.AsSpan(0, TailleIv);
        RandomNumberGenerator.Fill(iv);
        using var aes = new AesGcm(cle, TailleEtiquette);
        aes.Encrypt(iv, clair, sortie.AsSpan(TailleIv + TailleEtiquette), sortie.AsSpan(TailleIv, TailleEtiquette), Encoding.UTF8.GetBytes(id));
        return sortie;
    }

    private Fiche Ouvrir(string id, byte[] contenu)
    {
        byte[] clair;
        if (cle is null) clair = contenu;
        else
        {
            clair = new byte[contenu.Length - TailleIv - TailleEtiquette];
            using var aes = new AesGcm(cle, TailleEtiquette);
            aes.Decrypt(contenu.AsSpan(0, TailleIv), contenu.AsSpan(TailleIv + TailleEtiquette), contenu.AsSpan(TailleIv, TailleEtiquette), clair, Encoding.UTF8.GetBytes(id));
        }
        return V.LireJson(Encoding.UTF8.GetString(clair)) as Fiche ?? new Fiche();
    }

    public Task<LectureLocale> Lire() => Task.Run(() =>
    {
        lock (verrou)
        {
            var fiches = new List<FicheLocale>();
            using (var commande = connexion.CreateCommand())
            {
                commande.CommandText = "SELECT id, ordre, contenu FROM fiches";
                using var lecteur = commande.ExecuteReader();
                while (lecteur.Read())
                {
                    var id = lecteur.GetString(0);
                    fiches.Add(new FicheLocale(id, lecteur.GetInt64(1), Ouvrir(id, (byte[])lecteur.GetValue(2))));
                }
            }
            var lignes = new List<LigneFile>();
            using (var commande = connexion.CreateCommand())
            {
                commande.CommandText = "SELECT id, operation, modifieLe, supprime, creation, contenu FROM file";
                using var lecteur = commande.ExecuteReader();
                while (lecteur.Read())
                {
                    var id = lecteur.GetString(0);
                    lignes.Add(new LigneFile(id, lecteur.GetString(1), lecteur.GetDouble(2), lecteur.GetInt64(3) != 0, lecteur.GetInt64(4) != 0, lecteur.IsDBNull(5) ? null : Ouvrir(id, (byte[])lecteur.GetValue(5))));
                }
            }
            double curseur = 0;
            using (var commande = connexion.CreateCommand())
            {
                commande.CommandText = "SELECT valeur FROM meta WHERE cle = 'curseur'";
                if (commande.ExecuteScalar() is byte[] octets) curseur = double.Parse(Encoding.UTF8.GetString(octets), CultureInfo.InvariantCulture);
            }
            return new LectureLocale(fiches, lignes, curseur);
        }
    });

    public Task Appliquer(EcrituresLocales e) => Task.Run(() =>
    {
        lock (verrou)
        {
            using var transaction = connexion.BeginTransaction();
            void Faire(string sql, params (string nom, object? valeur)[] parametres)
            {
                using var commande = connexion.CreateCommand();
                commande.Transaction = transaction;
                commande.CommandText = sql;
                foreach (var (nom, valeur) in parametres) commande.Parameters.AddWithValue(nom, valeur ?? DBNull.Value);
                commande.ExecuteNonQuery();
            }
            foreach (var f in e.Fiches) Faire("INSERT OR REPLACE INTO fiches (id, ordre, contenu) VALUES ($id, $ordre, $contenu)", ("$id", f.Id), ("$ordre", f.Ordre), ("$contenu", Sceller(f.Id, f.Valeurs)));
            foreach (var id in e.Retirees) Faire("DELETE FROM fiches WHERE id = $id", ("$id", id));
            foreach (var id in e.Envoyees) Faire("DELETE FROM file WHERE id = $id", ("$id", id));
            foreach (var l in e.File) Faire("INSERT OR REPLACE INTO file (id, operation, modifieLe, supprime, creation, contenu) VALUES ($id, $operation, $modifieLe, $supprime, $creation, $contenu)", ("$id", l.Id), ("$operation", l.Operation), ("$modifieLe", l.ModifieLe), ("$supprime", l.Supprime ? 1 : 0), ("$creation", l.Creation ? 1 : 0), ("$contenu", l.Valeurs is null ? null : Sceller(l.Id, l.Valeurs)));
            if (e.Curseur is { } curseur) Faire("INSERT OR REPLACE INTO meta (cle, valeur) VALUES ('curseur', $valeur)", ("$valeur", Encoding.UTF8.GetBytes(curseur.ToString("R", CultureInfo.InvariantCulture))));
            transaction.Commit();
        }
    });

    /// <summary>Vrai si un autre lancement de l'application a écrit depuis la dernière fois.</summary>
    public Task<bool> ChangeeAilleurs() => Task.Run(() =>
    {
        lock (verrou)
        {
            using var commande = connexion.CreateCommand();
            commande.CommandText = "PRAGMA data_version";
            var version = (long)commande.ExecuteScalar()!;
            var change = versionVue >= 0 && version != versionVue;
            versionVue = version;
            return change;
        }
    });

    public void Dispose()
    {
        lock (verrou) connexion.Dispose();
    }
}

/// <summary>Une base en mémoire : la vraie ne s'ouvre pas, la page marche quand même le temps du lancement.</summary>
public sealed class BaseEnMemoire : IBaseLocale
{
    private readonly Dictionary<string, FicheLocale> fiches = new();
    private readonly Dictionary<string, LigneFile> file = new();
    private double curseur;

    public Task<LectureLocale> Lire() => Task.FromResult(new LectureLocale(fiches.Values.ToList(), file.Values.ToList(), curseur));

    public Task Appliquer(EcrituresLocales e)
    {
        foreach (var f in e.Fiches) fiches[f.Id] = f;
        foreach (var id in e.Retirees) fiches.Remove(id);
        foreach (var id in e.Envoyees) file.Remove(id);
        foreach (var l in e.File) file[l.Id] = l;
        if (e.Curseur is { } c) curseur = c;
        return Task.CompletedTask;
    }

    public void Dispose() { }
}
`;

/** Humalis/DonneeLocale.cs */
export const DONNEE_LOCALE_CS = String.raw`// Produit par Humalis : une donnée locale dans l'application : son compte, sa synchronisation et ses reprises.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;

namespace Humalis;

/// <summary>Les réglages écrits par le compilateur.</summary>
public sealed record ReglagesLocale(string Nom, bool Chiffree, string[] Champs, string? Route, bool Public);

/// <summary>
/// Une donnée locale. Une base par compte : une session n'en voit jamais une autre,
/// et ce qui attend d'être envoyé reste au compte qui l'a écrit.
/// </summary>
public sealed class DonneeLocale : ITransportLocal
{
    private const int Attente = 400;
    private const int RepriseMinimum = 2000;
    private const int RepriseMaximum = 300000;
    private const int Veille = 60000;
    private const int Regard = 2000;

    private static readonly CoffreCle CoffreWindows = new(cle => Coffre.Transformer(cle, true), cle => Coffre.Transformer(cle, false));

    private readonly ReglagesLocale reglages;
    private readonly CoeurLocal coeur;
    private readonly DispatcherTimer minuteur = new();
    private readonly Dispatcher dispatcher = Dispatcher.CurrentDispatcher;
    private int reprise = RepriseMinimum;
    private IBaseLocale? baseOuverte;
    private string? cheminOuvert;
    private bool compteConnu;
    private string? compteOuvert;
    private bool misEnGarde;
    private bool enCours;
    private bool relancer;
    private Task comptes = Task.CompletedTask;

    private DonneeLocale(ReglagesLocale reglages, Signal liste)
    {
        this.reglages = reglages;
        coeur = new CoeurLocal(new OptionsCoeur
        {
            Champs = reglages.Champs,
            Route = reglages.Route,
            Transport = this,
            Lire = () => liste.Valeur,
            Ecrire = l => liste.Ecrire(l),
            Planifier = () => Planifier(Attente),
            Dire = raison => Messages.Afficher(raison, "erreur"),
            Panne = Panne,
        });
        liste.Change += coeur.Observer;
        minuteur.Tick += (_, _) => { minuteur.Stop(); _ = Lancer(); };
    }

    /// <summary>Branche une liste partagée sur sa base : appelé une fois, la fenêtre créée.</summary>
    public static void Creer(ReglagesLocale reglages, Signal liste, FenetrePrincipale fenetre)
    {
        var donnee = new DonneeLocale(reglages, liste);
        donnee.Demarrer(fenetre);
    }

    public async Task<ReponseLocale> Envoyer(string chemin, Fiche corps)
    {
        var (statut, reponse) = await Serveur.Brut(chemin, "POST", corps);
        return new ReponseLocale(statut, reponse);
    }

    public async Task<ReponseLocale> Lire(string chemin)
    {
        var (statut, reponse) = await Serveur.Brut(chemin, "GET");
        return new ReponseLocale(statut, reponse);
    }

    private void Panne(Exception erreur)
    {
        Trace.TraceError(erreur.ToString());
        MettreEnGarde("Une donnée n'a pas pu être écrite sur l'appareil. Vérifiez la place libre sur le disque.");
    }

    private void MettreEnGarde(string message)
    {
        if (misEnGarde) return;
        misEnGarde = true;
        Messages.Afficher(message, "avertissement", persistant: true);
    }

    private void Planifier(int delai)
    {
        minuteur.Stop();
        minuteur.Interval = TimeSpan.FromMilliseconds(delai);
        minuteur.Start();
    }

    private async Task Lancer()
    {
        if (reglages.Route is null || !NetworkInterface.GetIsNetworkAvailable()) return;
        // Sans session, une route réservée n'a rien à dire : on attend la connexion.
        if (!compteConnu || (compteOuvert is null && !reglages.Public)) return;
        if (enCours) { relancer = true; return; }
        enCours = true;
        try
        {
            // Plusieurs lancements de l'application : un seul synchronise à la fois.
            using var verrou = await Verrou();
            if (verrou is null) { Planifier(RepriseMinimum); return; }
            if (baseOuverte is BaseSqlite sqlite && await sqlite.ChangeeAilleurs()) await coeur.Recharger();
            await coeur.Synchroniser();
            reprise = RepriseMinimum;
        }
        catch (Exception)
        {
            // Pas de réseau, serveur en panne : on recommence de plus en plus lentement, sans rien dire.
            Planifier(reprise);
            reprise = Math.Min(reprise * 2, RepriseMaximum);
        }
        finally
        {
            enCours = false;
            if (relancer) { relancer = false; Planifier(0); }
        }
    }

    private async Task<FileStream?> Verrou()
    {
        if (cheminOuvert is null) return null;
        for (var essai = 0; essai < 40; essai++)
        {
            try { return new FileStream(cheminOuvert + ".verrou", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
            catch (IOException) { await Task.Delay(250); }
            catch (UnauthorizedAccessException) { await Task.Delay(250); }
        }
        return null;
    }

    private static string CheminDe(string nom, string compte)
    {
        var empreinte = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(compte)))[..24];
        var propre = string.Concat(nom.Select(c => char.IsLetterOrDigit(c) ? c : '_'));
        return Path.Combine(Memoire.Dossier, "locales", propre + "-" + empreinte + ".db");
    }

    private async Task OuvrirCompte(string? compte)
    {
        var chemin = CheminDe(reglages.Nom, compte ?? "visiteur");
        IBaseLocale neuve;
        try { neuve = await BaseSqlite.Ouvrir(chemin, reglages.Chiffree ? CoffreWindows : null); }
        catch (Exception erreur)
        {
            Trace.TraceError(erreur.ToString());
            MettreEnGarde("Cette application ne garde pas les données sur l'appareil : elles seront perdues à la fermeture.");
            neuve = new BaseEnMemoire();
            chemin = Path.Combine(Path.GetTempPath(), "humalis-" + Guid.NewGuid().ToString("N"));
        }
        var ancienne = baseOuverte;
        await coeur.Ouvrir(neuve);
        baseOuverte = neuve;
        cheminOuvert = chemin;
        // Après Ouvrir : les écritures en attente sont passées, l'ancienne base peut se fermer.
        ancienne?.Dispose();
        Planifier(0);
    }

    /// <summary>Appelé quand on connaît le compte (null : personne) ; sans route, une seule base pour l'appareil.</summary>
    private void ChangerCompte(string? compte)
    {
        var voulu = reglages.Route is not null ? compte : "appareil";
        if (compteConnu && voulu == compteOuvert) return;
        compteConnu = true;
        compteOuvert = voulu;
        coeur.Suspendre();
        comptes = Suite(comptes, voulu);

        async Task Suite(Task avant, string? c)
        {
            try { await avant; } catch (Exception) { }
            // Un autre changement est déjà demandé : on saute celui-ci.
            if (c == compteOuvert) await OuvrirCompte(c);
        }
    }

    private void Demarrer(FenetrePrincipale fenetre)
    {
        if (reglages.Route is null) ChangerCompte(null);
        else new Effet(() => { if (Session.Pret) ChangerCompte(Session.IdCompte); });

        // Les écritures en cours finissent avant la fermeture.
        fenetre.Closing += (_, _) =>
        {
            var cadre = new DispatcherFrame();
            Task.WhenAny(coeur.Fini(), Task.Delay(3000)).ContinueWith(_ => cadre.Continue = false, TaskScheduler.Default);
            Dispatcher.PushFrame(cadre);
        };

        var regard = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(Regard) };
        regard.Tick += async (_, _) =>
        {
            if (enCours || baseOuverte is not BaseSqlite sqlite) return;
            try { if (await sqlite.ChangeeAilleurs()) await coeur.Recharger(); }
            catch (Exception) { }
        };
        regard.Start();

        if (reglages.Route is null) return;
        void Reseau() => dispatcher.BeginInvoke(() => { if (NetworkInterface.GetIsNetworkAvailable()) Planifier(0); });
        NetworkChange.NetworkAvailabilityChanged += (_, _) => Reseau();
        NetworkChange.NetworkAddressChanged += (_, _) => Reseau();
        fenetre.Activated += (_, _) => Planifier(0);
        var veille = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(Veille) };
        veille.Tick += (_, _) => { if (fenetre.IsVisible) _ = Lancer(); };
        veille.Start();
    }
}
`;

/** Humalis/CleAcces.cs */
export const CLE_ACCES_CS = String.raw`// Produit par Humalis : les clés d'accès par Windows Hello (webauthn.dll, sans paquet MSIX).
using System;
using System.Buffers.Text;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace Humalis;

/// <summary>Windows a refusé ou la personne a annulé.</summary>
public sealed class RefusCleAcces : Exception
{
    public string Nom { get; }
    public RefusCleAcces(string nom, int code) : base(nom + " (0x" + code.ToString("X8") + ")") { Nom = nom; }
}

/// <summary>
/// L'API WebAuthn de Windows (Windows 10 1903 et après). Une application Win32 y accède directement :
/// c'est elle qui écrit clientDataJSON, avec l'origine https://domaine-des-clés, comme l'iPhone et Android le font pour la leur.
/// </summary>
public static class CleAcces
{
    private const string Dll = "webauthn.dll";

    [StructLayout(LayoutKind.Sequential)]
    private struct Rp { public uint Version; public IntPtr Id; public IntPtr Nom; public IntPtr Icone; }

    [StructLayout(LayoutKind.Sequential)]
    private struct Utilisateur { public uint Version; public uint TailleId; public IntPtr Id; public IntPtr Nom; public IntPtr Icone; public IntPtr NomAffiche; }

    [StructLayout(LayoutKind.Sequential)]
    private struct DonneesClient { public uint Version; public uint Taille; public IntPtr Json; public IntPtr Empreinte; }

    [StructLayout(LayoutKind.Sequential)]
    private struct Parametre { public uint Version; public IntPtr Type; public int Algorithme; }

    [StructLayout(LayoutKind.Sequential)]
    private struct Parametres { public uint Nombre; public IntPtr Liste; }

    [StructLayout(LayoutKind.Sequential)]
    private struct Identite { public uint Version; public uint Taille; public IntPtr Id; public IntPtr Type; }

    [StructLayout(LayoutKind.Sequential)]
    private struct Identites { public uint Nombre; public IntPtr Liste; }

    [StructLayout(LayoutKind.Sequential)]
    private struct Extensions { public uint Nombre; public IntPtr Liste; }

    // Version 3 : tout ce que Windows 10 1903 connaît.
    [StructLayout(LayoutKind.Sequential)]
    private struct OptionsCreation
    {
        public uint Version; public uint Delai; public Identites Exclues; public Extensions Extensions;
        public uint Attachement; public int Residente; public uint Verification; public uint Attestation; public uint Drapeaux;
        public IntPtr Annulation; public IntPtr ExclusionEtendue;
    }

    // Version 4 : idem.
    [StructLayout(LayoutKind.Sequential)]
    private struct OptionsSignature
    {
        public uint Version; public uint Delai; public Identites Permises; public Extensions Extensions;
        public uint Attachement; public uint Verification; public uint Drapeaux;
        public IntPtr U2fId; public IntPtr U2fUtilise; public IntPtr Annulation; public IntPtr PermissionEtendue;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Attestation
    {
        public uint Version; public IntPtr Format; public uint TailleDonnees; public IntPtr Donnees; public uint TailleAttestation; public IntPtr Brute;
        public uint TypeDecodage; public IntPtr Decodee; public uint TailleObjet; public IntPtr Objet; public uint TailleId; public IntPtr Id;
        public Extensions Extensions; public uint Transport;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Signature
    {
        public uint Version; public uint TailleDonnees; public IntPtr Donnees; public uint TailleSignature; public IntPtr Octets;
        public Identite Identite; public uint TailleUtilisateur; public IntPtr IdUtilisateur;
    }

    [DllImport(Dll)] private static extern uint WebAuthNGetApiVersionNumber();
    [DllImport(Dll)] private static extern int WebAuthNIsUserVerifyingPlatformAuthenticatorAvailable(out int disponible);
    [DllImport(Dll)] private static extern int WebAuthNAuthenticatorMakeCredential(IntPtr fenetre, IntPtr rp, IntPtr utilisateur, IntPtr parametres, IntPtr client, IntPtr options, out IntPtr attestation);
    [DllImport(Dll, CharSet = CharSet.Unicode)] private static extern int WebAuthNAuthenticatorGetAssertion(IntPtr fenetre, string rpId, IntPtr client, IntPtr options, out IntPtr signature);
    [DllImport(Dll)] private static extern void WebAuthNFreeCredentialAttestation(IntPtr attestation);
    [DllImport(Dll)] private static extern void WebAuthNFreeAssertion(IntPtr signature);
    [DllImport(Dll)] private static extern IntPtr WebAuthNGetErrorName(int code);

    /// <summary>Windows connaît-il les clés d'accès ?</summary>
    public static bool Disponible
    {
        get
        {
            try { return WebAuthNGetApiVersionNumber() >= 1; }
            catch (DllNotFoundException) { return false; }
            catch (EntryPointNotFoundException) { return false; }
        }
    }

    /// <summary>Windows Hello est-il configuré pour cette session ?</summary>
    public static bool HelloConfigure => WebAuthNIsUserVerifyingPlatformAuthenticatorAvailable(out var oui) == 0 && oui != 0;

    /// <summary>La mémoire non managée d'un appel : tout est rendu à la fin.</summary>
    private sealed class Arene : IDisposable
    {
        private readonly List<IntPtr> blocs = new();

        public IntPtr Texte(string texte)
        {
            var p = Marshal.StringToHGlobalUni(texte);
            blocs.Add(p);
            return p;
        }

        public IntPtr Octets(byte[] octets)
        {
            var p = Marshal.AllocHGlobal(Math.Max(1, octets.Length));
            blocs.Add(p);
            Marshal.Copy(octets, 0, p, octets.Length);
            return p;
        }

        public IntPtr Structure<T>(T valeur) where T : struct
        {
            var p = Marshal.AllocHGlobal(Marshal.SizeOf<T>());
            blocs.Add(p);
            Marshal.StructureToPtr(valeur, p, false);
            return p;
        }

        public IntPtr Tableau<T>(IReadOnlyList<T> valeurs) where T : struct
        {
            var taille = Marshal.SizeOf<T>();
            var p = Marshal.AllocHGlobal(Math.Max(1, taille * valeurs.Count));
            blocs.Add(p);
            for (var i = 0; i < valeurs.Count; i++) Marshal.StructureToPtr(valeurs[i], p + i * taille, false);
            return p;
        }

        public void Dispose()
        {
            foreach (var p in blocs) Marshal.FreeHGlobal(p);
        }
    }

    private static string EnTexte(byte[] octets) => Base64Url.EncodeToString(octets);
    private static byte[] EnOctets(string texte) => Base64Url.DecodeFromChars(texte);

    private static byte[] Lire(IntPtr p, uint taille)
    {
        var octets = new byte[taille];
        if (taille > 0) Marshal.Copy(p, octets, 0, (int)taille);
        return octets;
    }

    private static string NomErreur(int code)
    {
        var p = WebAuthNGetErrorName(code);
        return (p == IntPtr.Zero ? null : Marshal.PtrToStringUni(p)) ?? "UnknownError";
    }

    private static uint VerificationDe(object? valeur) => V.T(valeur) switch { "required" => 1u, "preferred" => 2u, "discouraged" => 3u, _ => 0u };

    private static byte[] DonneesDuClient(string type, string defi, string rpId) =>
        Encoding.UTF8.GetBytes(V.EnJson(V.FicheDe(("type", type), ("challenge", defi), ("origin", "https://" + rpId), ("crossOrigin", false))));

    private static IntPtr Client(Arene arene, byte[] json) => arene.Structure(new DonneesClient { Version = 1, Taille = (uint)json.Length, Json = arene.Octets(json), Empreinte = arene.Texte("SHA-256") });

    private static string[] Transports(uint masque)
    {
        var noms = new List<string>();
        if ((masque & 0x01) != 0) noms.Add("usb");
        if ((masque & 0x02) != 0) noms.Add("nfc");
        if ((masque & 0x04) != 0) noms.Add("ble");
        if ((masque & 0x10) != 0) noms.Add("internal");
        if ((masque & 0x20) != 0) noms.Add("hybrid");
        return noms.ToArray();
    }

    private static string Attachement(uint masque) => (masque & 0x10) != 0 ? "platform" : "cross-platform";

    /// <summary>navigator.credentials.create : la réponse au format JSON de WebAuthn. Windows bloque pendant la question, d'où un autre fil.</summary>
    public static Task<Fiche> Creer(object? options, IntPtr fenetre) => Task.Run(() =>
    {
        using var arene = new Arene();
        var rp = V.Champ(options, "rp");
        var rpId = V.T(V.Champ(rp, "id"));
        var utilisateur = V.Champ(options, "user");
        var identifiant = EnOctets(V.T(V.Champ(utilisateur, "id")));
        var defi = V.T(V.Champ(options, "challenge"));
        var parametres = V.L(V.Champ(options, "pubKeyCredParams")).Select(p => new Parametre { Version = 1, Type = arene.Texte("public-key"), Algorithme = (int)V.N(V.Champ(p, "alg")) }).ToArray();
        var exclues = V.L(V.Champ(options, "excludeCredentials")).Select(c => EnOctets(V.T(V.Champ(c, "id")))).Select(id => new Identite { Version = 1, Taille = (uint)id.Length, Id = arene.Octets(id), Type = arene.Texte("public-key") }).ToArray();
        var selection = V.Champ(options, "authenticatorSelection");
        var json = DonneesDuClient("webauthn.create", defi, rpId);
        var delai = V.N(V.Champ(options, "timeout"));
        var reglage = new OptionsCreation
        {
            Version = 3,
            Delai = delai > 0 ? (uint)delai : 60000,
            Exclues = new Identites { Nombre = (uint)exclues.Length, Liste = arene.Tableau(exclues) },
            Attachement = V.T(V.Champ(selection, "authenticatorAttachment")) switch { "platform" => 1u, "cross-platform" => 2u, _ => 0u },
            // Clé découvrable : la connexion se fait sans adresse.
            Residente = 1,
            Verification = VerificationDe(V.Champ(selection, "userVerification")),
            Attestation = 1,
        };
        var code = WebAuthNAuthenticatorMakeCredential(
            fenetre,
            arene.Structure(new Rp { Version = 1, Id = arene.Texte(rpId), Nom = arene.Texte(V.T(V.Champ(rp, "name"))) }),
            arene.Structure(new Utilisateur { Version = 1, TailleId = (uint)identifiant.Length, Id = arene.Octets(identifiant), Nom = arene.Texte(V.T(V.Champ(utilisateur, "name"))), NomAffiche = arene.Texte(V.T(V.Champ(utilisateur, "displayName"))) }),
            arene.Structure(new Parametres { Nombre = (uint)parametres.Length, Liste = arene.Tableau(parametres) }),
            Client(arene, json),
            arene.Structure(reglage),
            out var resultat);
        if (code != 0 || resultat == IntPtr.Zero) throw new RefusCleAcces(NomErreur(code), code);
        try
        {
            var a = Marshal.PtrToStructure<Attestation>(resultat);
            var id = EnTexte(Lire(a.Id, a.TailleId));
            return V.FicheDe(
                ("id", id), ("rawId", id), ("type", "public-key"), ("clientExtensionResults", new Fiche()), ("authenticatorAttachment", Attachement(a.Transport)),
                ("response", V.FicheDe(("clientDataJSON", EnTexte(json)), ("attestationObject", EnTexte(Lire(a.Objet, a.TailleObjet))), ("transports", new Liste(Transports(a.Transport))))));
        }
        finally { WebAuthNFreeCredentialAttestation(resultat); }
    });

    /// <summary>navigator.credentials.get : une clé découvrable, la personne choisit dans la fenêtre de Windows.</summary>
    public static Task<Fiche> Signer(object? options, IntPtr fenetre) => Task.Run(() =>
    {
        using var arene = new Arene();
        var rpId = V.T(V.Champ(options, "rpId"));
        var json = DonneesDuClient("webauthn.get", V.T(V.Champ(options, "challenge")), rpId);
        var delai = V.N(V.Champ(options, "timeout"));
        var reglage = new OptionsSignature { Version = 4, Delai = delai > 0 ? (uint)delai : 60000, Verification = VerificationDe(V.Champ(options, "userVerification")) };
        var code = WebAuthNAuthenticatorGetAssertion(fenetre, rpId, Client(arene, json), arene.Structure(reglage), out var resultat);
        if (code != 0 || resultat == IntPtr.Zero) throw new RefusCleAcces(NomErreur(code), code);
        try
        {
            var s = Marshal.PtrToStructure<Signature>(resultat);
            var id = EnTexte(Lire(s.Identite.Id, s.Identite.Taille));
            var reponse = V.FicheDe(("clientDataJSON", EnTexte(json)), ("authenticatorData", EnTexte(Lire(s.Donnees, s.TailleDonnees))), ("signature", EnTexte(Lire(s.Octets, s.TailleSignature))));
            if (s.TailleUtilisateur > 0) reponse["userHandle"] = EnTexte(Lire(s.IdUtilisateur, s.TailleUtilisateur));
            return V.FicheDe(("id", id), ("rawId", id), ("type", "public-key"), ("clientExtensionResults", new Fiche()), ("response", reponse));
        }
        finally { WebAuthNFreeAssertion(resultat); }
    });
}
`;

/** Humalis/CompteSecurise.cs */
export const COMPTE_SECURISE_CS = String.raw`// Produit par Humalis : l'écran du code à six chiffres, son activation, et les clés d'accès.
using System;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;

namespace Humalis;

public static class CompteSecurise
{
    private const string SansReseau = "Le serveur n'a pas répondu. Réessayez dans un instant.";

    /// <summary>Une fenêtre du système : un titre, du contenu, Échap ou la croix pour fermer.</summary>
    private sealed class Fenetre
    {
        public readonly PileHumalis Corps = new() { Ecart = 12 };
        private readonly TextBlock alerte = new() { Foreground = Apparence.Pinceau("#C42B1C"), TextWrapping = TextWrapping.Wrap, Visibility = Visibility.Collapsed };
        private readonly Window fenetre;
        private bool fermee;

        public Fenetre(string titre, Action surFermeture)
        {
            fenetre = new Window
            {
                Title = titre, SizeToContent = SizeToContent.WidthAndHeight, ResizeMode = ResizeMode.NoResize,
                WindowStartupLocation = WindowStartupLocation.CenterOwner, Owner = System.Windows.Application.Current?.MainWindow, ShowInTaskbar = false,
            };
            AutomationProperties.SetLiveSetting(alerte, AutomationLiveSetting.Assertive);
            AutomationProperties.SetAutomationId(alerte, "humalis_alerte");
            var pile = new PileHumalis { Ecart = 14, Margin = new Thickness(24), Width = 340 };
            pile.Children.Add(new TextBlock { Text = titre, FontSize = 20, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap });
            pile.Children.Add(Corps);
            pile.Children.Add(alerte);
            fenetre.Content = pile;
            fenetre.PreviewKeyDown += (_, e) => { if (e.Key == Key.Escape) { e.Handled = true; fenetre.Close(); } };
            fenetre.Closed += (_, _) =>
            {
                if (fermee) return;
                fermee = true;
                surFermeture();
            };
            // La fenêtre est modale, mais celui qui l'ouvre attend sa réponse sans bloquer.
            fenetre.Dispatcher.BeginInvoke(() => { if (!fermee) fenetre.ShowDialog(); });
        }

        public void Fermer()
        {
            fermee = true;
            fenetre.Close();
        }

        public void Dire(string message)
        {
            alerte.Text = message;
            alerte.Visibility = message.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
        }

        public void Vider()
        {
            Corps.Children.Clear();
            Dire("");
        }
    }

    private static TextBlock Paragraphe(string texte) => new() { Text = texte, TextWrapping = TextWrapping.Wrap };

    private static Button Bouton(string texte, bool principal, Action? action = null)
    {
        var b = new Button { Content = texte, Padding = new Thickness(14, 8, 14, 8), HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Center };
        AutomationProperties.SetName(b, texte);
        if (principal) { b.SetResourceReference(FrameworkElement.StyleProperty, "AccentButtonStyle"); b.IsDefault = true; }
        if (action is not null) b.Click += (_, _) => action();
        return b;
    }

    private static void Focaliser(UIElement element) => element.Dispatcher.BeginInvoke(DispatcherPriority.Input, () => { element.Focus(); Keyboard.Focus(element); });

    private static (UIElement bloc, TextBox entree) Saisie(string etiquette)
    {
        var entree = new TextBox { MaxLength = 9 };
        AutomationProperties.SetName(entree, etiquette);
        var bloc = new PileHumalis { Ecart = 6 };
        bloc.Children.Add(new TextBlock { Text = etiquette });
        bloc.Children.Add(entree);
        return (bloc, entree);
    }

    private static string RaisonDe(int statut, object? corps, string sinon)
    {
        if (statut == 429) return "Trop de tentatives. Réessayez dans quelques minutes.";
        return V.Champ(corps, "erreur") is string erreur ? V.AvecMajuscule(erreur) + "." : sinon;
    }

    private static bool Refuser(string message, bool dansUnEssai)
    {
        if (dansUnEssai) throw new ErreurHumalis(message);
        Messages.Afficher(message, "erreur");
        return false;
    }

    private static IntPtr Poignee() => FenetrePrincipale.Courante is { } f ? new WindowInteropHelper(f).Handle : IntPtr.Zero;

    /// <summary>Après un mot de passe juste, quand le compte a le code : vrai si la session est ouverte.</summary>
    public static Task<bool> DemanderCode(string jeton)
    {
        var fin = new TaskCompletionSource<bool>();
        var fenetre = new Fenetre("Code de vérification", () => fin.TrySetResult(false));
        var secours = false;
        void Dessiner()
        {
            fenetre.Vider();
            var (bloc, entree) = Saisie(secours ? "Code de secours" : "Code à six chiffres");
            var envoi = Bouton("Vérifier", true);
            async void Verifier()
            {
                envoi.IsEnabled = false;
                try
                {
                    var (statut, corps) = await Session.Direct("/auth/double/verifier", "POST", V.FicheDe(("jeton", jeton), ("code", entree.Text)));
                    if (statut is >= 200 and < 300)
                    {
                        fenetre.Fermer();
                        await Session.Ouvrir(V.Champ(corps, "data"));
                        fin.TrySetResult(true);
                        return;
                    }
                    fenetre.Dire(RaisonDe(statut, corps, "Ce code est incorrect."));
                    entree.Text = "";
                    Focaliser(entree);
                }
                catch (ErreurHumalis) { fenetre.Dire(SansReseau); }
                envoi.IsEnabled = true;
            }
            envoi.Click += (_, _) => Verifier();
            fenetre.Corps.Children.Add(Paragraphe(secours ? "Saisissez un de vos codes de secours : il ne servira qu’une fois." : "Saisissez le code affiché par votre application d’authentification."));
            fenetre.Corps.Children.Add(bloc);
            fenetre.Corps.Children.Add(envoi);
            fenetre.Corps.Children.Add(Bouton(secours ? "Utiliser le code à six chiffres" : "Utiliser un code de secours", false, () => { secours = !secours; Dessiner(); }));
            Focaliser(entree);
        }
        Dessiner();
        return fin.Task;
    }

    /// <summary>Redemande le mot de passe ; null si la personne ferme la fenêtre.</summary>
    private static Task<string?> MotDePasse(string titre)
    {
        var fin = new TaskCompletionSource<string?>();
        var fenetre = new Fenetre(titre, () => fin.TrySetResult(null));
        var entree = new PasswordBox();
        AutomationProperties.SetName(entree, "Votre mot de passe");
        var bloc = new PileHumalis { Ecart = 6 };
        bloc.Children.Add(new TextBlock { Text = "Votre mot de passe" });
        bloc.Children.Add(entree);
        fenetre.Corps.Children.Add(bloc);
        fenetre.Corps.Children.Add(Bouton("Continuer", true, () => { fenetre.Fermer(); fin.TrySetResult(entree.Password); }));
        Focaliser(entree);
        return fin.Task;
    }

    private static void MontrerCodes(Fenetre fenetre, string[] codes, Action fini)
    {
        fenetre.Vider();
        var texte = string.Join("\n", codes);
        var liste = new TextBox { Text = texte, IsReadOnly = true, FontFamily = new FontFamily("Consolas"), AcceptsReturn = true };
        AutomationProperties.SetName(liste, "Codes de secours");
        fenetre.Corps.Children.Add(Paragraphe("Gardez ces codes en lieu sûr : chacun remplace une fois le code à six chiffres. Ils ne seront plus affichés."));
        fenetre.Corps.Children.Add(liste);
        Button copier = null!;
        copier = Bouton("Copier", false, () =>
        {
            try { Clipboard.SetText(texte); copier.Content = "Copié"; }
            catch (Exception) { fenetre.Dire("Le presse-papiers n'est pas disponible."); }
        });
        fenetre.Corps.Children.Add(copier);
        fenetre.Corps.Children.Add(Bouton("J’ai gardé ces codes", true, () => { fenetre.Fermer(); fini(); }));
    }

    /// <summary>« activer double authentification » : le QR, ou la gestion si elle est déjà active.</summary>
    public static async Task<bool> Activer(bool dansUnEssai = false)
    {
        int statut;
        object? etat;
        try { (statut, etat) = await Session.Direct("/auth/double", "GET", null, renouveler: true); }
        catch (ErreurHumalis) { return Refuser(SansReseau, dansUnEssai); }
        if (statut == 401) return Refuser("Connectez-vous pour continuer.", dansUnEssai);
        if (statut is < 200 or >= 300) return Refuser(RaisonDe(statut, etat, SansReseau), dansUnEssai);
        if (V.B(V.Champ(etat, "actif"))) return await Gerer(V.Champ(etat, "codesRestants"));
        var preuve = new Fiche();
        if (V.B(V.Champ(etat, "motDePasseRequis")))
        {
            var saisi = await MotDePasse("Confirmez votre mot de passe");
            if (saisi is null) return false;
            preuve["motDePasse"] = saisi;
        }
        object? reponse;
        try { (statut, reponse) = await Session.Direct("/auth/double/activer", "POST", preuve); }
        catch (ErreurHumalis) { return Refuser(SansReseau, dansUnEssai); }
        if (statut is < 200 or >= 300) return Refuser(RaisonDe(statut, reponse, "La double authentification n'a pas pu commencer."), dansUnEssai);

        var fin = new TaskCompletionSource<bool>();
        var fenetre = new Fenetre("Double authentification", () => fin.TrySetResult(false));
        var (bloc, entree) = Saisie("Code à six chiffres");
        var envoi = Bouton("Activer", true);
        async void Confirmer()
        {
            envoi.IsEnabled = false;
            try
            {
                var (code, corps) = await Session.Direct("/auth/double/confirmer", "POST", V.FicheDe(("code", entree.Text)));
                if (code is >= 200 and < 300)
                {
                    MontrerCodes(fenetre, V.L(V.Champ(corps, "codesSecours")).Select(V.T).ToArray(), () => fin.TrySetResult(true));
                    return;
                }
                fenetre.Dire(RaisonDe(code, corps, "Ce code est incorrect."));
                entree.Text = "";
            }
            catch (ErreurHumalis) { fenetre.Dire(SansReseau); }
            envoi.IsEnabled = true;
        }
        envoi.Click += (_, _) => Confirmer();
        var uri = V.T(V.Champ(reponse, "uri"));
        var qr = Qr.Element(() => uri, "Code QR à scanner dans une application d'authentification", 210);
        qr.HorizontalAlignment = HorizontalAlignment.Center;
        var cle = new TextBox { Text = V.T(V.Champ(reponse, "secret")), IsReadOnly = true, TextWrapping = TextWrapping.Wrap, FontSize = 12 };
        AutomationProperties.SetName(cle, "Clé à saisir à la main");
        fenetre.Corps.Children.Add(Paragraphe("Scannez ce code dans votre application d’authentification, puis saisissez le code qu’elle affiche."));
        fenetre.Corps.Children.Add(qr);
        fenetre.Corps.Children.Add(Paragraphe("Clé à saisir à la main :"));
        fenetre.Corps.Children.Add(cle);
        fenetre.Corps.Children.Add(bloc);
        fenetre.Corps.Children.Add(envoi);
        Focaliser(entree);
        return await fin.Task;
    }

    private static Task<bool> Gerer(object? codesRestants)
    {
        var fin = new TaskCompletionSource<bool>();
        var fenetre = new Fenetre("Double authentification", () => fin.TrySetResult(false));
        var (bloc, entree) = Saisie("Code à six chiffres");
        async void Agir(string chemin)
        {
            try
            {
                var (statut, corps) = await Session.Direct(chemin, "POST", V.FicheDe(("code", entree.Text)));
                if (statut is < 200 or >= 300) { fenetre.Dire(RaisonDe(statut, corps, "Ce code est incorrect.")); return; }
                if (V.Champ(corps, "codesSecours") is Liste codes) { MontrerCodes(fenetre, codes.Select(V.T).ToArray(), () => fin.TrySetResult(true)); return; }
                fenetre.Fermer();
                Messages.Afficher("La double authentification est désactivée.", "reussite");
                fin.TrySetResult(true);
            }
            catch (ErreurHumalis) { fenetre.Dire(SansReseau); }
        }
        fenetre.Corps.Children.Add(Paragraphe("La double authentification est active. Codes de secours restants : " + V.T(codesRestants) + "."));
        fenetre.Corps.Children.Add(bloc);
        fenetre.Corps.Children.Add(Bouton("Nouveaux codes de secours", true, () => Agir("/auth/double/codes")));
        fenetre.Corps.Children.Add(Bouton("Désactiver", false, () => Agir("/auth/double/desactiver")));
        Focaliser(entree);
        return fin.Task;
    }

    /// <summary>« ajouter cle d'acces ».</summary>
    public static async Task<bool> AjouterCle(bool dansUnEssai = false)
    {
        if (!CleAcces.Disponible) return Refuser("Cet appareil ne gère pas les clés d'accès.", dansUnEssai);
        int statut;
        object? options;
        try
        {
            (statut, options) = await Session.Direct("/auth/cle-acces/inscription/options", "POST", new Fiche(), renouveler: true);
            if (statut == 403 && V.B(V.Champ(options, "motDePasseRequis")))
            {
                var saisi = await MotDePasse("Confirmez votre mot de passe");
                if (saisi is null) return false;
                (statut, options) = await Session.Direct("/auth/cle-acces/inscription/options", "POST", V.FicheDe(("motDePasse", saisi)));
            }
        }
        catch (ErreurHumalis) { return Refuser(SansReseau, dansUnEssai); }
        if (statut == 401) return Refuser("Connectez-vous pour continuer.", dansUnEssai);
        if (statut is < 200 or >= 300) return Refuser(RaisonDe(statut, options, "La clé d'accès n'a pas pu être préparée."), dansUnEssai);
        if (V.T(V.Champ(V.Champ(options, "authenticatorSelection"), "authenticatorAttachment")) == "platform" && !CleAcces.HelloConfigure)
            return Refuser("Windows Hello n'est pas configuré sur cet appareil : créez un code PIN dans les paramètres de Windows.", dansUnEssai);
        Fiche identite;
        try { identite = await CleAcces.Creer(options, Poignee()); }
        catch (RefusCleAcces erreur) { return Refuser(erreur.Nom == "InvalidStateError" ? "Cet appareil a déjà une clé d'accès pour ce compte." : "La création de la clé d'accès a été annulée.", dansUnEssai); }
        try
        {
            var (code, corps) = await Session.Direct("/auth/cle-acces/inscription/verifier", "POST", V.FicheDe(("reponse", identite), ("nom", Environment.MachineName)));
            if (code is < 200 or >= 300) return Refuser(RaisonDe(code, corps, "Cette clé d'accès n'a pas été acceptée."), dansUnEssai);
        }
        catch (ErreurHumalis) { return Refuser(SansReseau, dansUnEssai); }
        Messages.Afficher("Clé d'accès ajoutée.", "reussite");
        return true;
    }

    /// <summary>« se connecter par cle d'acces » : sans adresse, Windows propose ses clés.</summary>
    public static async Task<bool> SeConnecterParCle(bool dansUnEssai = false)
    {
        if (!CleAcces.Disponible) return Refuser("Cet appareil ne gère pas les clés d'accès.", dansUnEssai);
        int statut;
        object? debut;
        try { (statut, debut) = await Session.Direct("/auth/cle-acces/connexion/options", "POST", new Fiche()); }
        catch (ErreurHumalis) { return Refuser(SansReseau, dansUnEssai); }
        if (statut is < 200 or >= 300) return Refuser(RaisonDe(statut, debut, "La connexion n'a pas pu commencer."), dansUnEssai);
        Fiche identite;
        try { identite = await CleAcces.Signer(V.Champ(debut, "options"), Poignee()); }
        catch (RefusCleAcces) { return Refuser("La connexion par clé d'accès a été annulée.", dansUnEssai); }
        try
        {
            var (code, corps) = await Session.Direct("/auth/cle-acces/connexion/verifier", "POST", V.FicheDe(("ceremonie", V.Champ(debut, "ceremonie")), ("reponse", identite)));
            if (code is < 200 or >= 300) return Refuser(RaisonDe(code, corps, "Cette clé d'accès n'est pas reconnue."), dansUnEssai);
            await Session.Ouvrir(V.Champ(corps, "data"));
        }
        catch (ErreurHumalis) { return Refuser(SansReseau, dansUnEssai); }
        return true;
    }
}
`;
