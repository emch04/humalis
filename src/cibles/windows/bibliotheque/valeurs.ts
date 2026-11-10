/**
 * Les valeurs Humalis en C# : rien (null), un nombre (double), un texte, vrai ou faux,
 * une liste et une fiche. Les opérations du langage (additionner, comparer, filtrer,
 * écrire un nombre ou une date à la française) sont des fonctions de la classe V.
 */
export const VALEURS_CS = String.raw`// Produit par Humalis : les valeurs du langage et leurs opérations.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace Humalis;

/// <summary>Une liste Humalis.</summary>
public sealed class Liste : List<object?>
{
    public Liste() { }
    public Liste(IEnumerable<object?> elements) : base(elements) { }
}

/// <summary>Une fiche Humalis : des champs nommés (une donnée du serveur, ou « fiche avec … »).</summary>
public sealed class Fiche : Dictionary<string, object?>
{
    public Fiche() : base(StringComparer.Ordinal) { }
    public Fiche(IDictionary<string, object?> champs) : base(champs, StringComparer.Ordinal) { }
}

/// <summary>Une erreur montrée à la personne (un refus du serveur, une coupure).</summary>
public sealed class ErreurHumalis : Exception
{
    public bool SansReseau { get; }
    public ErreurHumalis(string message, bool sansReseau = false) : base(message) { SansReseau = sansReseau; }
}

public static class V
{
    public static readonly CultureInfo Fr = CultureInfo.GetCultureInfo("fr-FR");
    private static readonly Random hasard = new();

    // ─── Lire une valeur ─────────────────────────────────────────────────

    public static double N(object? v) => v switch
    {
        null => 0,
        double d => d,
        int i => i,
        long l => l,
        bool b => b ? 1 : 0,
        string s => LireNombre(s),
        _ => 0,
    };

    /// <summary>Un nombre écrit à la française (« 4,5 ») ou à l'anglaise ; 0 pour ce qui n'en est pas un.</summary>
    public static double LireNombre(string texte)
    {
        var propre = texte.Trim().Replace(" ", "").Replace(" ", "").Replace(" ", "").Replace(',', '.');
        return double.TryParse(propre, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : 0;
    }

    public static bool B(object? v) => v switch
    {
        null => false,
        bool b => b,
        double d => d != 0 && !double.IsNaN(d),
        string s => s.Length > 0,
        ICollection c => c.Count > 0,
        _ => true,
    };

    public static string T(object? v) => v switch
    {
        null => "",
        string s => s,
        bool b => b ? "vrai" : "faux",
        double d => Nombre(d),
        int i => Nombre(i),
        long l => Nombre(l),
        Liste l => string.Join(", ", l.Select(T)),
        Fiche f => f.TryGetValue("nom", out var nom) ? T(nom) : "",
        _ => v.ToString() ?? "",
    };

    /// <summary>La liste d'une valeur ; une liste vide pour ce qui n'en est pas une.</summary>
    public static Liste L(object? v) => v as Liste ?? (v is IEnumerable<object?> e && v is not string ? new Liste(e) : new Liste());

    // ─── Calculer ────────────────────────────────────────────────────────

    public static object? Plus(object? a, object? b) => a is string || b is string ? T(a) + T(b) : N(a) + N(b);
    public static object? Moins(object? a, object? b) => N(a) - N(b);
    public static object? Fois(object? a, object? b) => N(a) * N(b);
    public static object? Divise(object? a, object? b) => N(b) == 0 ? 0d : N(a) / N(b);

    public static double Arrondi(object? v, int chiffres = 0) => Math.Round(N(v), chiffres, MidpointRounding.AwayFromZero);

    public static double Hasard(object? minimum, object? maximum)
    {
        var bas = (int)Math.Ceiling(N(minimum));
        var haut = (int)Math.Floor(N(maximum));
        return haut < bas ? bas : hasard.Next(bas, haut + 1);
    }

    // ─── Comparer ────────────────────────────────────────────────────────

    public static bool Egal(object? a, object? b)
    {
        if (a is null || b is null) return Vide(a) && Vide(b);
        if (a is bool || b is bool) return B(a) == B(b);
        if (a is double || b is double) return EstNombre(a) && EstNombre(b) && N(a) == N(b);
        if (a is string || b is string) return T(a) == T(b);
        return Equals(a, b);
    }

    public static bool EstNombre(object? v) => v is double || v is int || v is long || (v is string s && s.Trim().Length > 0 && double.TryParse(s.Trim().Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out _));

    /// <summary>Négatif, zéro ou positif : des nombres comparés comme des nombres, des textes dans l'ordre du français.</summary>
    public static int Comparer(object? a, object? b)
    {
        if ((a is double || a is null) && (b is double || b is null)) return N(a).CompareTo(N(b));
        if (EstNombre(a) && EstNombre(b)) return N(a).CompareTo(N(b));
        return string.Compare(T(a), T(b), Fr, CompareOptions.None);
    }

    public static bool Vide(object? v) => v switch
    {
        null => true,
        string s => s.Trim().Length == 0,
        ICollection c => c.Count == 0,
        _ => false,
    };

    public static bool Contient(object? dans, object? cherche)
    {
        if (dans is Liste l) return l.Any(e => Egal(e, cherche));
        // Une recherche vide trouve tout, comme sur le web.
        var texte = T(cherche);
        return texte.Length == 0 || T(dans).Contains(texte, StringComparison.CurrentCultureIgnoreCase);
    }

    /// <summary>Vrai si le texte suit le modèle (une expression régulière).</summary>
    public static bool Correspond(object? v, string motif) => System.Text.RegularExpressions.Regex.IsMatch(T(v).Trim(), motif);

    public static bool CommencePar(object? texte, object? debut) => T(texte).StartsWith(T(debut), StringComparison.CurrentCultureIgnoreCase);
    public static bool FinitPar(object? texte, object? fin) => T(texte).EndsWith(T(fin), StringComparison.CurrentCultureIgnoreCase);

    // ─── Fiches ──────────────────────────────────────────────────────────

    /// <summary>Le champ d'une fiche ; « prixAvant » se lit aussi « prix_avant ».</summary>
    public static object? Champ(object? objet, string nom)
    {
        if (objet is not Fiche f) return null;
        if (f.TryGetValue(nom, out var v)) return v;
        var serpent = string.Concat(nom.Select((c, i) => char.IsUpper(c) && i > 0 ? "_" + char.ToLowerInvariant(c) : c.ToString()));
        return f.TryGetValue(serpent, out v) ? v : null;
    }

    public static Fiche FicheDe(params (string nom, object? valeur)[] champs)
    {
        var f = new Fiche();
        foreach (var (nom, valeur) in champs) f[nom] = valeur;
        return f;
    }

    /// <summary>Une copie de la fiche où le champ (et ses sous-champs) change : la variable est ensuite remplacée.</summary>
    public static Fiche AvecChamp(object? objet, string[] chemin, object? valeur)
    {
        var copie = objet is Fiche f ? new Fiche(f) : new Fiche();
        if (chemin.Length == 1) copie[chemin[0]] = valeur;
        else copie[chemin[0]] = AvecChamp(Champ(copie, chemin[0]), chemin[1..], valeur);
        return copie;
    }

    // ─── Listes ──────────────────────────────────────────────────────────

    public static double Compte(object? v) => v switch { ICollection c => c.Count, string s => s.Length, _ => 0 };

    public static Liste ListeDe(params object?[] elements) => new(elements);

    public static Liste Ajouter(object? liste, object? valeur) => new(L(liste)) { valeur };

    public static Liste Retirer(object? liste, object? valeur)
    {
        var copie = new Liste(L(liste));
        var rang = copie.FindIndex(e => Egal(e, valeur));
        if (rang >= 0) copie.RemoveAt(rang);
        return copie;
    }

    public static Liste Filtrer(object? liste, Func<object?, bool> garder) => new(L(liste).Where(garder));

    public static Liste Champs(object? liste, string champ) => new(L(liste).Select(e => Champ(e, champ)));

    public static Liste Trier(object? liste, string? champ, bool decroissant)
    {
        var tries = L(liste).Select((e, rang) => (e, rang)).ToList();
        tries.Sort((x, y) =>
        {
            var c = Comparer(champ is null ? x.e : Champ(x.e, champ), champ is null ? y.e : Champ(y.e, champ));
            if (decroissant) c = -c;
            return c != 0 ? c : x.rang.CompareTo(y.rang);
        });
        return new Liste(tries.Select(t => t.e));
    }

    /// <summary>« grouper produits par categorie » : des fiches { nom, elements }, dans l'ordre d'apparition.</summary>
    public static Liste Grouper(object? liste, string champ)
    {
        var groupes = new Liste();
        var parNom = new Dictionary<string, Liste>();
        foreach (var e in L(liste))
        {
            var nom = T(Champ(e, champ));
            if (!parNom.TryGetValue(nom, out var elements))
            {
                elements = new Liste();
                parNom[nom] = elements;
                groupes.Add(FicheDe(("nom", nom), ("elements", elements)));
            }
            elements.Add(e);
        }
        return groupes;
    }

    public static object? Premier(object? liste) => L(liste).FirstOrDefault();
    public static Liste Premiers(object? nombre, object? liste) => new(L(liste).Take(Math.Max(0, (int)N(nombre))));

    public static double Somme(object? liste) => L(liste).Sum(N);
    public static double Moyenne(object? liste) { var l = L(liste); return l.Count == 0 ? 0 : l.Average(N); }
    public static double Minimum(object? liste) { var l = L(liste); return l.Count == 0 ? 0 : l.Min(N); }
    public static double Maximum(object? liste) { var l = L(liste); return l.Count == 0 ? 0 : l.Max(N); }

    // ─── Textes ──────────────────────────────────────────────────────────

    public static string Majuscules(object? v) => T(v).ToUpper(Fr);
    public static string Minuscules(object? v) => T(v).ToLower(Fr);
    public static double Longueur(object? v) => v is Liste l ? l.Count : new StringInfo(T(v)).LengthInTextElements;
    public static string Initiales(object? v) => string.Concat(T(v).Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(2).Select(m => char.ToUpper(m[0], Fr)));
    public static string Remplacer(object? cherche, object? remplace, object? dans) => T(cherche).Length == 0 ? T(dans) : T(dans).Replace(T(cherche), T(remplace));
    public static string AvecMajuscule(string texte) => texte.Length == 0 ? texte : char.ToUpper(texte[0], Fr) + texte[1..];

    // ─── Écrire à la française ───────────────────────────────────────────

    public static string Nombre(object? v)
    {
        var d = N(v);
        return double.IsFinite(d) ? d.ToString("#,##0.###", Fr) : "";
    }

    /// <summary>15000, FC → « 15 000 FC » ; 12.5, EUR → « 12,50 € » ; 12.5, USD → « 12,50 $ ».</summary>
    public static string Argent(object? v, string devise)
    {
        var d = N(v);
        return devise switch
        {
            "EUR" => d.ToString("#,##0.00", Fr) + " €",
            "USD" => d.ToString(d == Math.Round(d) ? "#,##0" : "#,##0.00", Fr) + " $",
            _ => Nombre(d) + " FC",
        };
    }

    public static string Taille(object? v, string unite)
    {
        var octets = N(v);
        var valeur = unite == "Mo" ? octets / 1_048_576 : octets / 1024;
        return valeur.ToString("#,##0.#", Fr) + " " + unite;
    }

    /// <summary>3, « article » → « 3 articles » ; 1 → « 1 article ».</summary>
    public static string Accorder(object? nombre, string mot)
    {
        var n = N(nombre);
        var ecrit = Nombre(n);
        if (Math.Abs(n) < 2) return ecrit + " " + mot;
        if (mot.EndsWith("s") || mot.EndsWith("x") || mot.EndsWith("z")) return ecrit + " " + mot;
        if (mot.EndsWith("al") && mot != "bal" && mot != "festival" && mot != "carnaval") return ecrit + " " + mot[..^2] + "aux";
        if (mot.EndsWith("eau") || mot.EndsWith("au") || mot.EndsWith("eu")) return ecrit + " " + mot + "x";
        return ecrit + " " + mot + "s";
    }

    private static readonly string[] Mois = { "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre" };
    private static readonly string[] Jours = { "dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi" };

    private static DateTime? JourDe(string texte)
    {
        if (texte.Length < 10) return null;
        return DateTime.TryParseExact(texte[..10], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;
    }

    public static string Date(object? v)
    {
        var texte = T(v);
        if (texte.Length == 0) return "";
        var d = JourDe(texte);
        return d is null ? texte : $"{d.Value.Day} {Mois[d.Value.Month - 1]} {d.Value.Year}";
    }

    public static string DateLongue(object? v)
    {
        var texte = T(v);
        if (texte.Length == 0) return "";
        var d = JourDe(texte);
        return d is null ? texte : $"{Jours[(int)d.Value.DayOfWeek]} {d.Value.Day} {Mois[d.Value.Month - 1]}";
    }

    public static string Depuis(object? v)
    {
        var texte = T(v);
        if (texte.Length == 0) return "";
        DateTime lue;
        if (texte.Length == 10 && JourDe(texte) is DateTime jour) lue = jour;
        else if (!DateTime.TryParse(texte, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out lue)) return "";
        else lue = lue.ToLocalTime();
        var minutes = (int)(DateTime.Now - lue).TotalMinutes;
        string Dire(int n, string mot) => $"il y a {n} {mot}{(n > 1 && !mot.EndsWith("s") ? "s" : "")}";
        if (minutes < 1) return "à l’instant";
        if (minutes < 60) return Dire(minutes, "minute");
        if (minutes < 1440) return Dire(minutes / 60, "heure");
        if (minutes < 43200) return Dire(minutes / 1440, "jour");
        if (minutes < 525600) return Dire(minutes / 43200, "mois");
        return Dire(minutes / 525600, "an");
    }

    /// <summary>Un nombre entier écrit en lettres, en français (« deux cent quarante »).</summary>
    public static string EnLettres(object? v)
    {
        var d = N(v);
        if (d != Math.Round(d) || Math.Abs(d) >= 1e12) return Nombre(d);
        var n = (long)Math.Abs(d);
        if (n == 0) return "zéro";
        string[] u = { "", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf" };
        string[] dz = { "", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt" };
        string Cent(int x, bool fin)
        {
            var c = x / 100;
            var r = x % 100;
            var mots = new List<string>();
            if (c > 0) mots.Add(c == 1 ? "cent" : u[c] + (r == 0 && fin ? " cents" : " cent"));
            if (r > 0)
            {
                if (r < 20) mots.Add(u[r]);
                else
                {
                    var t = r / 10;
                    var un = r % 10;
                    if (t == 7 || t == 9) mots.Add(dz[t] + (un == 1 && t == 7 ? " et " : "-") + u[10 + un]);
                    else if (un == 0) mots.Add(dz[t] + (t == 8 && fin ? "s" : ""));
                    else mots.Add(dz[t] + (un == 1 && t != 8 ? " et " : "-") + u[un]);
                }
            }
            return string.Join(" ", mots);
        }
        var parties = new List<string>();
        var milliards = (int)(n / 1_000_000_000);
        var millions = (int)(n / 1_000_000 % 1000);
        var milliers = (int)(n / 1000 % 1000);
        var reste = (int)(n % 1000);
        if (milliards > 0) parties.Add(Cent(milliards, true) + (milliards > 1 ? " milliards" : " milliard"));
        if (millions > 0) parties.Add(Cent(millions, true) + (millions > 1 ? " millions" : " million"));
        if (milliers > 0) parties.Add(milliers == 1 ? "mille" : Cent(milliers, false) + " mille");
        if (reste > 0) parties.Add(Cent(reste, true));
        return (d < 0 ? "moins " : "") + string.Join(" ", parties);
    }

    // ─── Dates ───────────────────────────────────────────────────────────

    public static string Aujourdhui() => DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    public static string Maintenant() => DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);

    public static string Decaler(object? date, object? nombre, string unite, int signe)
    {
        var jour = JourDe(T(date)) ?? DateTime.Today;
        var n = (int)N(nombre) * signe;
        var resultat = unite switch { "semaines" => jour.AddDays(7 * n), "mois" => jour.AddMonths(n), _ => jour.AddDays(n) };
        return resultat.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    public static double JoursEntre(object? debut, object? fin)
    {
        var a = JourDe(T(debut));
        var b = JourDe(T(fin));
        return a is null || b is null ? 0 : (b.Value - a.Value).TotalDays;
    }

    // ─── JSON ────────────────────────────────────────────────────────────

    public static object? DepuisJson(JsonElement e) => e.ValueKind switch
    {
        JsonValueKind.String => e.GetString(),
        JsonValueKind.Number => e.GetDouble(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Array => new Liste(e.EnumerateArray().Select(DepuisJson)),
        JsonValueKind.Object => new Fiche(e.EnumerateObject().ToDictionary(p => p.Name, p => DepuisJson(p.Value))),
        _ => null,
    };

    public static object? LireJson(string texte)
    {
        if (string.IsNullOrWhiteSpace(texte)) return null;
        try
        {
            using var document = JsonDocument.Parse(texte);
            return DepuisJson(document.RootElement);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static string EnJson(object? v)
    {
        using var flux = new MemoryStream();
        using (var w = new Utf8JsonWriter(flux)) Ecrire(w, v);
        return Encoding.UTF8.GetString(flux.ToArray());
    }

    private static void Ecrire(Utf8JsonWriter w, object? v)
    {
        switch (v)
        {
            case null: w.WriteNullValue(); break;
            case string s: w.WriteStringValue(s); break;
            case bool b: w.WriteBooleanValue(b); break;
            case double d: if (double.IsFinite(d)) w.WriteNumberValue(d); else w.WriteNullValue(); break;
            case int i: w.WriteNumberValue(i); break;
            case long l: w.WriteNumberValue(l); break;
            case Fiche f:
                w.WriteStartObject();
                foreach (var (cle, valeur) in f) { w.WritePropertyName(cle); Ecrire(w, valeur); }
                w.WriteEndObject();
                break;
            case IEnumerable<object?> l:
                w.WriteStartArray();
                foreach (var e in l) Ecrire(w, e);
                w.WriteEndArray();
                break;
            default: w.WriteStringValue(v.ToString()); break;
        }
    }

    /// <summary>Une liste de fiches en CSV (séparateur « ; », comme l'attend un tableur français).</summary>
    public static string EnCsv(object? liste)
    {
        var lignes = L(liste).OfType<Fiche>().ToList();
        if (lignes.Count == 0) return "";
        var colonnes = lignes.SelectMany(f => f.Keys).Distinct().ToList();
        string Cellule(string t) => t.Contains(';') || t.Contains('"') || t.Contains('\n') ? "\"" + t.Replace("\"", "\"\"") + "\"" : t;
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(";", colonnes.Select(Cellule)));
        foreach (var f in lignes) sb.AppendLine(string.Join(";", colonnes.Select(c => Cellule(T(f.GetValueOrDefault(c))))));
        return sb.ToString();
    }
}
`;
