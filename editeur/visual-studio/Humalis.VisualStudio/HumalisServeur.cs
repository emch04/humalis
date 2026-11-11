using System.Diagnostics;
using System.IO.Pipelines;
using Microsoft.VisualStudio.Extensibility;
using Microsoft.VisualStudio.Extensibility.Editor;
using Microsoft.VisualStudio.Extensibility.LanguageServer;
using Microsoft.VisualStudio.RpcContracts.LanguageServerProvider;
using Nerdbank.Streams;

namespace Humalis.VisualStudio;

/// <summary>
/// Lance « humalis editeur --stdio » pour les fichiers .humalis et le branche
/// sur le client LSP de Visual Studio.
/// </summary>
[VisualStudioContribution]
internal sealed class HumalisServeur : LanguageServerProvider
{
    [VisualStudioContribution]
    public static DocumentTypeConfiguration HumalisDocumentType => new("humalis")
    {
        FileExtensions = [".humalis"],
        BaseDocumentType = LanguageServerBaseDocumentType,
    };

    public override LanguageServerProviderConfiguration LanguageServerProviderConfiguration => new(
        "%Humalis.Serveur.Nom%",
        [DocumentFilter.FromDocumentType(HumalisDocumentType)]);

    public override Task<IDuplexPipe?> CreateServerConnectionAsync(CancellationToken cancellationToken)
    {
        string? humalis = TrouverHumalis();
        if (humalis is null)
        {
            throw new InvalidOperationException(
                "La commande « humalis » est introuvable. Installez-la avec « npm install -g humalis » (Node 24 ou plus récent), puis rouvrez Visual Studio.");
        }

        // npm installe « humalis.cmd » : un fichier de commandes se lance par cmd.exe.
        var info = new ProcessStartInfo
        {
            FileName = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe",
            Arguments = $"/d /s /c \"\"{humalis}\" editeur --stdio\"",
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        var processus = new Process { StartInfo = info };
        if (!processus.Start())
        {
            return Task.FromResult<IDuplexPipe?>(null);
        }

        // La sortie d'erreur du serveur est lue pour ne jamais bloquer le processus.
        processus.ErrorDataReceived += (_, _) => { };
        processus.BeginErrorReadLine();
        return Task.FromResult<IDuplexPipe?>(new DuplexPipe(
            PipeReader.Create(processus.StandardOutput.BaseStream),
            PipeWriter.Create(processus.StandardInput.BaseStream)));
    }

    /// <summary>« humalis.cmd » dans le PATH, sinon dans le dossier global de npm (%APPDATA%\npm).</summary>
    private static string? TrouverHumalis()
    {
        string[] noms = ["humalis.cmd", "humalis.exe"];
        var dossiers = (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
            .Append(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "npm"));
        foreach (string dossier in dossiers)
        {
            foreach (string nom in noms)
            {
                string chemin = Path.Combine(dossier.Trim('"'), nom);
                if (File.Exists(chemin))
                {
                    return chemin;
                }
            }
        }

        return null;
    }
}
