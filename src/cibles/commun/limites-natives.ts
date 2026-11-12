/**
 * Les limites des données du serveur, vérifiées dans l'application avant l'envoi, sur Apple (Swift),
 * Android (Kotlin) et Windows (C#) : la même règle et les mêmes phrases que le serveur produit
 * (src/cibles/serveur/bornes.ts) et que la page web. Le serveur reste seul juge ; l'application évite
 * seulement un aller-retour, et montre la raison tout de suite, même sans réseau.
 *
 * Trois écritures d'une même fonction : scripts/essai-limites-natives.mjs les compile avec leurs vrais
 * outils et passe les mêmes cas que tests/bornes.test.ts, pour qu'elles ne divergent pas.
 */
import type { Bornes } from '../serveur/bornes.js';

type Limites = Record<string, Record<string, Bornes>>;

const texte = (valeur: string) => JSON.stringify(valeur);
const nombre = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));

// ─── Swift ──────────────────────────────────────────────────────────────

function bornesSwift(b: Bornes): string {
  const champs = [
    b.min !== undefined ? `min: ${nombre(b.min)}` : '',
    b.max !== undefined ? `max: ${nombre(b.max)}` : '',
    b.entier ? 'entier: true' : '',
    b.longueurMin !== undefined ? `longueurMin: ${b.longueurMin}` : '',
    b.longueurMax !== undefined ? `longueurMax: ${b.longueurMax}` : '',
    b.format ? `format: ${texte(b.format)}` : '',
    b.parmi ? `parmi: [${b.parmi.map(texte).join(', ')}]` : '',
    b.elementsMax !== undefined ? `elementsMax: ${b.elementsMax}` : '',
  ].filter(Boolean);
  return `BornesHumalis(${champs.join(', ')})`;
}

const SWIFT = String.raw`
/** Les limites d'un champ, telles que le serveur les vérifie. */
struct BornesHumalis: Sendable {
    var min: Double? = nil
    var max: Double? = nil
    var entier = false
    var longueurMin: Int? = nil
    var longueurMax: Int? = nil
    var format: String? = nil
    var parmi: [String]? = nil
    var elementsMax: Int? = nil
}

enum Limites {
    /** Un nombre comme le serveur l'écrit : « 1000 », « 45.5 ». */
    private static func ecrit(_ n: Double) -> String {
        n == n.rounded() && abs(n) < 1e15 ? String(Int64(n)) : String(n)
    }

    private static func va(_ valeur: String, _ motif: String) -> Bool {
        valeur.range(of: motif, options: .regularExpression) != nil
    }

    /** Ce qui ne va pas dans une valeur : la fin de la phrase « Le champ « prix » … » ; nil si elle respecte ses limites. */
    static func horsBornes(_ valeur: ValeurHumalis, _ bornes: BornesHumalis = BornesHumalis()) -> String? {
        switch valeur {
        case .nombre(let n):
            if bornes.entier && n != n.rounded() { return "doit être un nombre entier" }
            let sous = bornes.min.map { n < $0 } ?? false
            let sur = bornes.max.map { n > $0 } ?? false
            guard sous || sur else { return nil }
            if let min = bornes.min, let max = bornes.max { return "doit être entre " + ecrit(min) + " et " + ecrit(max) }
            if let min = bornes.min { return "doit être au moins " + ecrit(min) }
            return "doit être au plus " + ecrit(bornes.max ?? 0)
        case .texte(let t):
            // Les caractères tels qu'on les voit : un émoji compte pour un.
            let longueur = t.unicodeScalars.count
            let bas = bornes.longueurMin ?? 0
            let haut = bornes.longueurMax ?? (t.hasPrefix("data:image/") ? 95000 : 10000)
            if longueur < bas || longueur > haut {
                if bornes.longueurMin != nil && bornes.longueurMax != nil { return "doit avoir entre " + String(bas) + " et " + String(haut) + " caractères" }
                return longueur < bas ? "doit avoir au moins " + String(bas) + " caractères" : "doit avoir au plus " + String(haut) + " caractères"
            }
            if let parmi = bornes.parmi, !parmi.contains(t) { return "doit être l’une de ces valeurs : " + parmi.joined(separator: ", ") }
            if bornes.format == "email" && !(longueur <= 254 && va(t, #"^[^\s@]+@[^\s@]+\.[^\s@]+\z"#)) { return "doit être une adresse e-mail" }
            if bornes.format == "telephone" && !va(t.replacingOccurrences(of: #"[\s.()-]"#, with: "", options: .regularExpression), #"^\+?[0-9]{6,15}\z"#) { return "doit être un numéro de téléphone" }
            if bornes.format == "adresse_web" && !va(t, #"^https?://[^\s"<>.]+\.[^\s"<>]+\z"#) { return "doit être une adresse web (https://…)" }
            return nil
        case .liste(let elements):
            let haut = bornes.elementsMax ?? 1000
            if elements.count > haut { return "doit avoir au plus " + String(haut) + " éléments" }
            for element in elements {
                if let faute = horsBornes(element) { return "a un élément qui " + faute }
            }
            return nil
        default:
            return nil
        }
    }

    /** Avant une création (POST sur la route) ou une modification (PATCH sur une fiche) : la raison du refus, s'il y en a une. */
    static func faute(_ adresse: String, _ verbe: String, _ id: String?, _ envoi: [String: ValeurHumalis]) -> String? {
        guard (verbe == "POST" && id == nil) || (verbe == "PATCH" && id != nil), let route = routes[adresse] else { return nil }
        for (champ, valeur) in envoi.sorted(by: { $0.key < $1.key }) {
            if let faute = horsBornes(valeur, route[champ] ?? BornesHumalis()) { return "Le champ « " + champ + " » " + faute + "." }
        }
        return nil
    }
`;

/** Humalis/Limites.swift */
export function limitesSwift(limites: Limites): string {
  const routes = Object.entries(limites).map(([adresse, champs]) => `        ${texte(adresse)}: [${Object.entries(champs).map(([champ, b]) => `${texte(champ)}: ${bornesSwift(b)}`).join(', ') || ':'}],`);
  return `// Produit par Humalis : les limites des données du serveur, vérifiées dans l'application avant l'envoi.
import Foundation
${SWIFT}
    /** Les limites de chaque route de données ; une route sans limite écrite garde celles par défaut. */
    static let routes: [String: [String: BornesHumalis]] = [
${routes.join('\n') || '        :'}
    ]
}
`;
}

// ─── Kotlin ─────────────────────────────────────────────────────────────

function bornesKotlin(b: Bornes): string {
  const champs = [
    b.min !== undefined ? `min = ${nombre(b.min)}` : '',
    b.max !== undefined ? `max = ${nombre(b.max)}` : '',
    b.entier ? 'entier = true' : '',
    b.longueurMin !== undefined ? `longueurMin = ${b.longueurMin}` : '',
    b.longueurMax !== undefined ? `longueurMax = ${b.longueurMax}` : '',
    b.format ? `format = ${texte(b.format)}` : '',
    b.parmi ? `parmi = listOf(${b.parmi.map((v) => texte(v).replace(/\$/g, '\\$')).join(', ')})` : '',
    b.elementsMax !== undefined ? `elementsMax = ${b.elementsMax}` : '',
  ].filter(Boolean);
  return `BornesHumalis(${champs.join(', ')})`;
}

const KOTLIN = String.raw`
/** Les limites d'un champ, telles que le serveur les vérifie. */
data class BornesHumalis(
    val min: Double? = null,
    val max: Double? = null,
    val entier: Boolean = false,
    val longueurMin: Int? = null,
    val longueurMax: Int? = null,
    val format: String? = null,
    val parmi: List<String>? = null,
    val elementsMax: Int? = null,
)

object Limites {
    private val EMAIL = Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")
    private val TELEPHONE = Regex("\\+?[0-9]{6,15}")
    private val SEPARATEURS = Regex("[\\s.()-]")
    private val ADRESSE_WEB = Regex("https?://[^\\s\"<>.]+\\.[^\\s\"<>]+")

    /** Un nombre comme le serveur l'écrit : « 1000 », « 45.5 ». */
    private fun ecrit(n: Double): String = if (n == Math.rint(n) && Math.abs(n) < 1e15) n.toLong().toString() else n.toString()

    /** Ce qui ne va pas dans une valeur : la fin de la phrase « Le champ « prix » … » ; null si elle respecte ses limites. */
    fun horsBornes(valeur: Any?, bornes: BornesHumalis = BornesHumalis()): String? {
        when (valeur) {
            is Number -> {
                val n = valeur.toDouble()
                if (bornes.entier && n != Math.rint(n)) return "doit être un nombre entier"
                val min = bornes.min
                val max = bornes.max
                if ((min == null || n >= min) && (max == null || n <= max)) return null
                if (min != null && max != null) return "doit être entre " + ecrit(min) + " et " + ecrit(max)
                return if (min != null) "doit être au moins " + ecrit(min) else "doit être au plus " + ecrit(max ?: 0.0)
            }
            is String -> {
                // Les caractères tels qu'on les voit : un émoji compte pour un.
                val longueur = valeur.codePointCount(0, valeur.length)
                val bas = bornes.longueurMin ?: 0
                val haut = bornes.longueurMax ?: if (valeur.startsWith("data:image/")) 95000 else 10000
                if (longueur < bas || longueur > haut) {
                    if (bornes.longueurMin != null && bornes.longueurMax != null) return "doit avoir entre " + bas + " et " + haut + " caractères"
                    return if (longueur < bas) "doit avoir au moins " + bas + " caractères" else "doit avoir au plus " + haut + " caractères"
                }
                val parmi = bornes.parmi
                if (parmi != null && valeur !in parmi) return "doit être l’une de ces valeurs : " + parmi.joinToString(", ")
                if (bornes.format == "email" && !(longueur <= 254 && EMAIL.matches(valeur))) return "doit être une adresse e-mail"
                if (bornes.format == "telephone" && !TELEPHONE.matches(SEPARATEURS.replace(valeur, ""))) return "doit être un numéro de téléphone"
                if (bornes.format == "adresse_web" && !ADRESSE_WEB.matches(valeur)) return "doit être une adresse web (https://…)"
                return null
            }
            is List<*> -> {
                val haut = bornes.elementsMax ?: 1000
                if (valeur.size > haut) return "doit avoir au plus " + haut + " éléments"
                for (element in valeur) {
                    val faute = horsBornes(element)
                    if (faute != null) return "a un élément qui " + faute
                }
                return null
            }
            else -> return null
        }
    }

    /** Avant une création (POST sur la route) ou une modification (PATCH sur une fiche) : la raison du refus, s'il y en a une. */
    fun faute(adresse: String, verbe: String, id: String?, envoi: Map<String, Any?>): String? {
        if (!((verbe == "POST" && id == null) || (verbe == "PATCH" && id != null))) return null
        val route = routes[adresse] ?: return null
        for ((champ, valeur) in envoi.toSortedMap()) {
            val faute = horsBornes(valeur, route[champ] ?: BornesHumalis())
            if (faute != null) return "Le champ « " + champ + " » " + faute + "."
        }
        return null
    }
`;

/** Limites.kt (sans sa ligne « package », que la cible ajoute). */
export function limitesKotlin(limites: Limites): string {
  const routes = Object.entries(limites).map(([adresse, champs]) => `        ${texte(adresse)} to mapOf<String, BornesHumalis>(${Object.entries(champs).map(([champ, b]) => `${texte(champ)} to ${bornesKotlin(b)}`).join(', ')}),`);
  return `// Produit par Humalis : les limites des données du serveur, vérifiées dans l'application avant l'envoi.
package PAQUET
${KOTLIN}
    /** Les limites de chaque route de données ; une route sans limite écrite garde celles par défaut. */
    val routes: Map<String, Map<String, BornesHumalis>> = mapOf(
${routes.join('\n')}
    )
}
`;
}

// ─── C# ─────────────────────────────────────────────────────────────────

function bornesCsharp(b: Bornes): string {
  const champs = [
    b.min !== undefined ? `Min: ${nombre(b.min)}` : '',
    b.max !== undefined ? `Max: ${nombre(b.max)}` : '',
    b.entier ? 'Entier: true' : '',
    b.longueurMin !== undefined ? `LongueurMin: ${b.longueurMin}` : '',
    b.longueurMax !== undefined ? `LongueurMax: ${b.longueurMax}` : '',
    b.format ? `Format: ${texte(b.format)}` : '',
    b.parmi ? `Parmi: new[] { ${b.parmi.map(texte).join(', ')} }` : '',
    b.elementsMax !== undefined ? `ElementsMax: ${b.elementsMax}` : '',
  ].filter(Boolean);
  return `new BornesHumalis(${champs.join(', ')})`;
}

const CSHARP = String.raw`
/// <summary>Les limites d'un champ, telles que le serveur les vérifie.</summary>
public sealed record BornesHumalis(double? Min = null, double? Max = null, bool Entier = false, int? LongueurMin = null, int? LongueurMax = null, string? Format = null, string[]? Parmi = null, int? ElementsMax = null);

public static class Limites
{
    private static readonly BornesHumalis SansLimite = new();

    /// <summary>Un nombre comme le serveur l'écrit : « 1000 », « 45.5 ».</summary>
    private static string Ecrit(double n) =>
        n == Math.Round(n) && Math.Abs(n) < 1e15 ? ((long)n).ToString(CultureInfo.InvariantCulture) : n.ToString(CultureInfo.InvariantCulture);

    /// <summary>Ce qui ne va pas dans une valeur : la fin de la phrase « Le champ « prix » … » ; null si elle respecte ses limites.</summary>
    public static string? HorsBornes(object? valeur, BornesHumalis? limites = null)
    {
        var bornes = limites ?? SansLimite;
        if (valeur is string t)
        {
            // Les caractères tels qu'on les voit : un émoji compte pour un.
            var longueur = t.EnumerateRunes().Count();
            var bas = bornes.LongueurMin ?? 0;
            var haut = bornes.LongueurMax ?? (t.StartsWith("data:image/", StringComparison.Ordinal) ? 95000 : 10000);
            if (longueur < bas || longueur > haut)
            {
                if (bornes.LongueurMin is not null && bornes.LongueurMax is not null) return "doit avoir entre " + bas + " et " + haut + " caractères";
                return longueur < bas ? "doit avoir au moins " + bas + " caractères" : "doit avoir au plus " + haut + " caractères";
            }
            if (bornes.Parmi is not null && !bornes.Parmi.Contains(t)) return "doit être l’une de ces valeurs : " + string.Join(", ", bornes.Parmi);
            if (bornes.Format == "email" && !(longueur <= 254 && Regex.IsMatch(t, @"^[^\s@]+@[^\s@]+\.[^\s@]+\z"))) return "doit être une adresse e-mail";
            if (bornes.Format == "telephone" && !Regex.IsMatch(Regex.Replace(t, @"[\s.()-]", ""), @"^\+?[0-9]{6,15}\z")) return "doit être un numéro de téléphone";
            if (bornes.Format == "adresse_web" && !Regex.IsMatch(t, @"^https?://[^\s""<>.]+\.[^\s""<>]+\z")) return "doit être une adresse web (https://…)";
            return null;
        }
        if (valeur is bool) return null;
        if (valeur is double or float or decimal or int or long or short or byte)
        {
            var n = Convert.ToDouble(valeur, CultureInfo.InvariantCulture);
            if (bornes.Entier && n != Math.Round(n)) return "doit être un nombre entier";
            var sous = bornes.Min is double min && n < min;
            var sur = bornes.Max is double max && n > max;
            if (!sous && !sur) return null;
            if (bornes.Min is double a && bornes.Max is double b) return "doit être entre " + Ecrit(a) + " et " + Ecrit(b);
            return bornes.Min is double seul ? "doit être au moins " + Ecrit(seul) : "doit être au plus " + Ecrit(bornes.Max ?? 0);
        }
        if (valeur is System.Collections.IEnumerable elements and not System.Collections.IDictionary)
        {
            var liste = elements.Cast<object?>().ToList();
            var haut = bornes.ElementsMax ?? 1000;
            if (liste.Count > haut) return "doit avoir au plus " + haut + " éléments";
            foreach (var element in liste)
            {
                var faute = HorsBornes(element);
                if (faute is not null) return "a un élément qui " + faute;
            }
        }
        return null;
    }

    /// <summary>Avant une création (POST sur la route) ou une modification (PATCH sur une fiche) : la raison du refus, s'il y en a une.</summary>
    public static string? Faute(string adresse, string verbe, string? id, IEnumerable<KeyValuePair<string, object?>> envoi)
    {
        if (!((verbe == "POST" && id is null) || (verbe == "PATCH" && id is not null)) || !Routes.TryGetValue(adresse, out var route)) return null;
        foreach (var (champ, valeur) in envoi.OrderBy(paire => paire.Key, StringComparer.Ordinal))
        {
            var faute = HorsBornes(valeur, route.GetValueOrDefault(champ));
            if (faute is not null) return "Le champ « " + champ + " » " + faute + ".";
        }
        return null;
    }
`;

/** Humalis/Limites.cs */
export function limitesCsharp(limites: Limites): string {
  const routes = Object.entries(limites).map(([adresse, champs]) => `        [${texte(adresse)}] = new() { ${Object.entries(champs).map(([champ, b]) => `[${texte(champ)}] = ${bornesCsharp(b)}`).join(', ')} },`);
  return `#line hidden
// Produit par Humalis : les limites des données du serveur, vérifiées dans l'application avant l'envoi.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace Humalis;
${CSHARP}
    /// <summary>Les limites de chaque route de données ; une route sans limite écrite garde celles par défaut.</summary>
    public static readonly Dictionary<string, Dictionary<string, BornesHumalis>> Routes = new()
    {
${routes.join('\n')}
    };
}
`;
}
