/** Capture des exceptions WPF et .NET, écrite seulement quand la forme est présente. */
import type { RequeteCapture } from '../capture-erreurs.js';
import { chaineCs } from './noms.js';

export function captureErreursCs(requetes: RequeteCapture[]): string {
  const envois = requetes.map((r) => `            try {
                using var corps = new StringContent(JsonSerializer.Serialize(new Dictionary<string, string> { ${r.champs.map((c) => `[${chaineCs(c.nom)}] = ${typeof c.valeur === 'string' ? `rapport.${c.valeur}` : chaineCs(c.valeur.texte)}`).join(', ')} }), Encoding.UTF8, "application/json");
                _ = Client.PostAsync(${chaineCs(r.adresse)}, corps).GetAwaiter().GetResult();
            } catch { /* L'envoi ne doit pas déclencher une nouvelle exception. */ }`).join('\n');
  return `// Produit par Humalis : capture des exceptions de Windows, sans lire les formulaires.
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;

namespace Humalis;

public static class CaptureErreurs
{
    private static readonly HttpClient Client = new() { Timeout = TimeSpan.FromSeconds(3) };
    private static readonly object Verrou = new();
    private static readonly Dictionary<string, List<DateTime>> Passages = new();
    private static bool enCours;

    private static string Nettoyer(string? texte) => Regex.Replace(
        Regex.Replace((texte ?? "")[..Math.Min(texte?.Length ?? 0, 4000)], @"([?&][^=\\s]+)=([^&\\s]+)", "$1=[masqué]"),
        @"(password|mot.?de.?passe|secret|token|jeton|authorization)(\\s*[:=]\\s*)[^\\s,;]+", "$1$2[masqué]", RegexOptions.IgnoreCase);

    public static void Installer(Application application)
    {
        application.DispatcherUnhandledException += (_, evenement) => Signaler(evenement.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, evenement) => Signaler(evenement.ExceptionObject as Exception);
        TaskScheduler.UnobservedTaskException += (_, evenement) => { Signaler(evenement.Exception); evenement.SetObserved(); };
    }

    private static void Signaler(Exception? exception)
    {
        if (exception is null) return;
        var rapport = new Rapport(Nettoyer(exception.Message), Nettoyer(exception.StackTrace), "", "1.0.0");
        var cle = rapport.message + "|" + rapport.pile.Split('\\n')[0];
        lock (Verrou) {
            if (enCours) return;
            var maintenant = DateTime.UtcNow;
            if (!Passages.TryGetValue(cle, out var dates)) Passages[cle] = dates = new();
            dates.RemoveAll(date => maintenant - date >= TimeSpan.FromMinutes(1));
            if (dates.Count >= 3) return;
            dates.Add(maintenant);
            enCours = true;
        }
        try {
${envois}
        } finally { lock (Verrou) enCours = false; }
    }

    private sealed record Rapport(string message, string pile, string page, string version);
}
`;
}
