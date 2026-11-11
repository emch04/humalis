//! L'extension Humalis pour Zed : elle lance le serveur de langage
//! « humalis editeur --stdio » (paquet npm humalis, 1.10 ou plus récent).
//!
//! La commande « humalis » trouvée dans le PATH du projet est préférée ;
//! sinon, l'extension installe le paquet npm humalis dans son propre
//! dossier et le lance avec le Node de Zed.

use zed_extension_api::{self as zed, settings::LspSettings, LanguageServerId, Result};

const PAQUET: &str = "humalis";
const CLI: &str = "node_modules/humalis/dist/cli.js";

struct Humalis {
    installe: bool,
}

impl Humalis {
    /// Installe (ou met à jour) le paquet npm humalis dans le dossier de l'extension.
    fn installer(&mut self, id: &LanguageServerId) -> Result<()> {
        if self.installe {
            return Ok(());
        }
        zed::set_language_server_installation_status(id, &zed::LanguageServerInstallationStatus::CheckingForUpdate);
        let derniere = zed::npm_package_latest_version(PAQUET)?;
        let presente = zed::npm_package_installed_version(PAQUET)?;
        if presente.as_deref() != Some(derniere.as_str()) {
            zed::set_language_server_installation_status(id, &zed::LanguageServerInstallationStatus::Downloading);
            if let Err(erreur) = zed::npm_install_package(PAQUET, &derniere) {
                if presente.is_none() {
                    return Err(format!("impossible d'installer le paquet npm humalis : {erreur}"));
                }
            }
        }
        self.installe = true;
        Ok(())
    }
}

impl zed::Extension for Humalis {
    fn new() -> Self {
        Humalis { installe: false }
    }

    fn language_server_command(&mut self, id: &LanguageServerId, worktree: &zed::Worktree) -> Result<zed::Command> {
        // Un chemin choisi dans les réglages de Zed (« lsp » → « humalis » → « binary »).
        let reglage = LspSettings::for_worktree("humalis", worktree).ok().and_then(|r| r.binary);
        if let Some(binaire) = reglage.as_ref().and_then(|b| b.path.clone()) {
            let args = reglage.and_then(|b| b.arguments).unwrap_or_else(|| vec!["editeur".into(), "--stdio".into()]);
            return Ok(zed::Command { command: binaire, args, env: Default::default() });
        }
        if let Some(humalis) = worktree.which("humalis") {
            return Ok(zed::Command {
                command: humalis,
                args: vec!["editeur".into(), "--stdio".into()],
                env: worktree.shell_env(),
            });
        }
        self.installer(id)?;
        let cli = std::env::current_dir()
            .map_err(|e| e.to_string())?
            .join(CLI)
            .to_string_lossy()
            .into_owned();
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![cli, "editeur".into(), "--stdio".into()],
            env: Default::default(),
        })
    }
}

zed::register_extension!(Humalis);
