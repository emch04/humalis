"""Branche le serveur de langage Humalis (« humalis editeur --stdio ») sur
le module LSP de Sublime Text : erreurs en direct, survol, complétion,
déclaration, plan et mise en forme. Sans le module LSP, seule la coloration
est active.

Sublime charge les paquets par ordre alphabétique : « Humalis » passe avant
« LSP ». Le module LSP n'est donc lu qu'une fois tous les paquets chargés,
dans plugin_loaded."""

_client = None


def plugin_loaded() -> None:
    global _client
    try:
        import sublime
        from LSP.plugin import AbstractPlugin, register_plugin
    except ImportError:
        print("Humalis : le module LSP n'est pas installé ; seule la coloration est active.")
        return

    class Humalis(AbstractPlugin):
        @classmethod
        def name(cls) -> str:
            return "humalis"

        @classmethod
        def configuration(cls):
            # Les réglages sont dans ce paquet (Humalis), pas dans un paquet « LSP-humalis ».
            return sublime.load_settings("LSP-humalis.sublime-settings"), "Packages/Humalis/LSP-humalis.sublime-settings"

    _client = Humalis
    register_plugin(Humalis)


def plugin_unloaded() -> None:
    global _client
    if _client is None:
        return
    try:
        from LSP.plugin import unregister_plugin
        unregister_plugin(_client)
    except ImportError:
        pass
    _client = None
