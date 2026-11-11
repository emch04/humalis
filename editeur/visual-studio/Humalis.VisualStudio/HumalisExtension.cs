using Microsoft.VisualStudio.Extensibility;

namespace Humalis.VisualStudio;

/// <summary>L'extension Humalis : le serveur de langage pour les fichiers .humalis.</summary>
[VisualStudioContribution]
internal sealed class HumalisExtension : Extension
{
    public override ExtensionConfiguration ExtensionConfiguration => new()
    {
        Metadata = new(
            id: "Humalis.VisualStudio.emch04",
            version: this.ExtensionAssemblyVersion,
            publisherName: "emch04",
            displayName: "Humalis",
            description: "Le langage Humalis : erreurs en direct, survol, complétion, déclaration, plan et mise en forme.")
        {
            Icon = "Images\\humalis.png",
            License = "LICENSE",
            MoreInfo = "https://humalis.dev",
            Tags = ["Humalis", "langage", "LSP"],
        },
    };
}
