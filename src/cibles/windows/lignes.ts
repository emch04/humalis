/**
 * Les lignes Humalis dans l'application Windows. Le code produit porte des
 * directives `#line N "fichier.humalis"` (voir cibles/lignes-humalis.ts) et
 * le PDB est intégré à l'application : une pile d'exception nomme déjà le
 * fichier Humalis et sa ligne. Cette classe la met en forme (« ligne 12 de
 * boutique.humalis »), pour la fenêtre Sortie de Visual Studio, la sortie
 * d'erreur et `erreur.ligne` dans « quand une erreur arrive ».
 */
export const HUMALIS_LIGNES_CS = `// Produit par Humalis : les exceptions rendues à leurs lignes Humalis.
using System;
using System.Diagnostics;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows;

namespace Humalis;

public static class HumalisLignes
{
    /** Les fichiers Humalis du projet, remplis quand le projet est écrit. */
    private static readonly string[] Fichiers = new string[] { /*@humalis-fichiers*/ };
    private static readonly Regex Motif = new(@"\\s+(?:in|dans)\\s+(.+?\\.humalis):(?:line|ligne)\\s+(\\d+)", RegexOptions.Compiled);

    /** « pages/panier.humalis » : le nom donné par l'auteur, retrouvé à la fin du chemin. */
    private static string NomDe(string chemin)
    {
        var normal = chemin.Replace('\\\\', '/');
        var trouve = Fichiers.Where(f => normal.EndsWith("/" + f, StringComparison.OrdinalIgnoreCase) || normal.Equals(f, StringComparison.OrdinalIgnoreCase)).OrderByDescending(f => f.Length).FirstOrDefault();
        return trouve ?? normal[(normal.LastIndexOf('/') + 1)..];
    }

    /** La pile, chaque position Humalis écrite « (ligne 12 de boutique.humalis) ». */
    public static string Pile(Exception exception) => Motif.Replace(exception.ToString(), m => $" (ligne {m.Groups[2].Value} de {NomDe(m.Groups[1].Value)})");

    /** « boutique.humalis:12 » : la première ligne Humalis de la pile, ou "" si aucune. */
    public static string Ligne(Exception exception)
    {
        var m = Motif.Match(exception.ToString());
        return m.Success ? $"{NomDe(m.Groups[1].Value)}:{m.Groups[2].Value}" : "";
    }

    /** Écrit l'exception avec sa ligne Humalis : fenêtre Sortie de Visual Studio et sortie d'erreur. */
    public static void Journaliser(Exception? exception)
    {
        if (exception is null) return;
        var ligne = Ligne(exception);
        if (ligne.Length == 0) return;
        var i = ligne.LastIndexOf(':');
        var lignes = Pile(exception).Split('\\n').Select(l => l.TrimEnd('\\r')).Where(l => l.Contains(".humalis)"));
        var texte = $"Erreur, ligne {ligne[(i + 1)..]} de {ligne[..i]} : {exception.Message}\\n{string.Join("\\n", lignes)}";
        Trace.WriteLine(texte);
        try { Console.Error.WriteLine(texte); } catch { /* Sans console, la fenêtre Sortie suffit. */ }
    }

    public static void Installer(Application application)
    {
        application.DispatcherUnhandledException += (_, evenement) => Journaliser(evenement.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, evenement) => Journaliser(evenement.ExceptionObject as Exception);
    }
}
`;
