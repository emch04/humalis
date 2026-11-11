"""
Essai en vrai du paquet Humalis (editeur/sublime/Humalis) dans Sublime Text,
avec le module LSP. Copié dans Packages/User par editeur/essais/sublime.sh,
il ne fait rien sauf si le fichier Packages/User/essai-humalis.json existe :
il ouvre alors le fichier qui y est nommé, appelle les commandes de
l'éditeur (survol, complétion, déclaration, plan, mise en forme), écrit ses
verdicts dans le journal nommé, puis ferme Sublime.
"""
import json
import os
import time

import sublime
import sublime_plugin



class Essai:
    def __init__(self, reglage):
        self.fichier = reglage['fichier']
        self.journal = reglage['journal']
        self.trafic = reglage['trafic']
        self.original = reglage['original']
        self.resultats = []
        self.etapes = []
        self.view = None

    def noter(self, texte):
        with open(self.journal + '.deroulement', 'a', encoding='utf-8') as f:
            f.write(texte + '\n')

    def verifier(self, nom, ok, detail=''):
        self.noter('%s : %s' % (nom, ok))
        self.resultats.append('%s %s — %s' % ('ok  ' if ok else 'RATÉ', nom, detail))

    def trafic_contient(self, texte):
        try:
            with open(self.trafic, encoding='utf-8') as f:
                return texte in f.read()
        except OSError:
            return False

    def attendre(self, condition, suite, delai=20.0, debut=None):
        debut = debut or time.time()
        try:
            ok = condition()
        except Exception:
            ok = False
        if ok or time.time() - debut > delai:
            suite(ok)
        else:
            sublime.set_timeout(lambda: self.attendre(condition, suite, delai, debut), 200)

    def aller(self, motif, decalage=0):
        region = self.view.find(motif, 0, sublime.LITERAL)
        self.view.sel().clear()
        self.view.sel().add(sublime.Region(region.a + decalage))
        return region.a + decalage

    def lancer(self):
        try:
            from LSP.plugin import AbstractPlugin  # noqa: F401
            self.noter('module LSP chargé')
        except Exception as erreur:
            self.noter('module LSP absent : %r' % erreur)
        # Au démarrage, Sublime indexe ses syntaxes en arrière-plan : un fichier ouvert avant reste en texte brut.
        def ouvrir(_):
            self.view = sublime.active_window().open_file(self.fichier)
            self.attendre(lambda: not self.view.is_loading(), lambda ok: self.coloration())
        self.attendre(lambda: sublime.find_syntax_for_file(self.fichier).path.endswith('Humalis.tmLanguage'), ouvrir)

    def coloration(self):
        v = self.view
        trouvee = sublime.find_syntax_for_file(self.fichier)
        self.noter('syntaxes trouvées pour source.humalis : %r ; pour le fichier : %r ; syntaxe de la vue : %r ; hidden : %r' % (
            [x.path for x in sublime.find_syntax_by_scope('source.humalis')], trouvee and trouvee.path, v.syntax() and v.syntax().path,
            [x.hidden for x in sublime.find_syntax_by_scope('source.humalis')]))
        self.verifier('syntaxe Humalis', v.match_selector(0, 'source.humalis'), v.syntax().name if v.syntax() else 'aucune')
        page = v.find('page "boutique"', 0, sublime.LITERAL).a
        self.verifier('coloration', 'keyword' in v.scope_name(page) and 'string' in v.scope_name(page + 6),
                      '%s | %s' % (v.scope_name(page).strip(), v.scope_name(page + 6).strip()))
        self.attendre(lambda: self.trafic_contient('"serverInfo"'), self.serveur)

    def serveur(self, ok):
        self.verifier('serveur lancé (humalis editeur --stdio)', ok, '')
        # Erreur en direct : un guillemet retiré.
        fin = self.view.find('titre "Votre panier"', 0, sublime.LITERAL).b
        self.view.run_command('essai_humalis_remplacer', {'a': fin - 1, 'b': fin, 'texte': ''})
        self.attendre(lambda: self.trafic_contient('guillemet manquant'), self.erreur)

    def erreur(self, ok):
        self.verifier('erreur en direct', ok, 'publishDiagnostics « guillemet manquant »')
        fin = self.view.find('titre "Votre panier', 0, sublime.LITERAL).b
        self.view.run_command('essai_humalis_remplacer', {'a': fin, 'b': fin, 'texte': '"'})
        self.aller('bouton "Ajouter"', 2)
        sublime.set_timeout(lambda: self.view.run_command('lsp_hover'), 1500)
        self.attendre(lambda: self.view.is_popup_visible(), self.survol)

    def survol(self, ok):
        self.verifier('survol de « bouton » (fenêtre affichée)', ok and self.trafic_contient('**bouton**'), '')
        self.view.hide_popup()
        fin = self.view.find('    bouton "Commander"', 0, sublime.LITERAL).b
        self.view.run_command('essai_humalis_remplacer', {'a': fin, 'b': fin, 'texte': '\n        bout'})
        self.view.sel().clear()
        self.view.sel().add(sublime.Region(fin + len('\n        bout')))
        sublime.set_timeout(lambda: self.view.run_command('auto_complete'), 800)
        self.attendre(lambda: self.view.is_auto_complete_visible(), self.completion)

    def completion(self, ok):
        self.verifier('complétion (liste affichée)', ok and self.trafic_contient('"label":"bouton"'), '')
        self.view.run_command('hide_auto_complete')
        fin = self.view.find('    bouton "Commander"', 0, sublime.LITERAL).b
        self.view.run_command('essai_humalis_remplacer', {'a': fin, 'b': fin + len('\n        bout'), 'texte': ''})
        self.aller('à panier', 3)
        sublime.set_timeout(lambda: self.view.run_command('lsp_symbol_definition'), 800)
        self.attendre(lambda: self.view.rowcol(self.view.sel()[0].a)[0] == 0, self.declaration)

    def declaration(self, ok):
        self.verifier('déclaration de « panier »', ok, 'curseur ligne %d' % (self.view.rowcol(self.view.sel()[0].a)[0] + 1))
        self.view.window().run_command('lsp_document_symbols')
        self.attendre(lambda: self.trafic_contient('"name":"boutique"'), self.plan)

    def plan(self, ok):
        self.verifier('plan du fichier', ok, '')
        self.view.window().run_command('hide_overlay')
        debut = self.view.find('titre "Votre panier"', 0, sublime.LITERAL).a + len('titre')
        self.view.run_command('essai_humalis_remplacer', {'a': debut, 'b': debut, 'texte': '   '})
        sublime.set_timeout(lambda: self.view.run_command('lsp_format_document'), 800)
        texte = lambda: self.view.substr(sublime.Region(0, self.view.size()))
        self.attendre(lambda: texte() == self.original, self.forme)

    def forme(self, ok):
        self.verifier('mise en forme', ok, '')
        with open(self.journal, 'w', encoding='utf-8') as f:
            echecs = sum(1 for r in self.resultats if r.startswith('RATÉ'))
            f.write('\n'.join(self.resultats) + '\n%d vérifications, %d ratée(s), Sublime Text %s\n' % (len(self.resultats), echecs, sublime.version()))
        self.view.set_scratch(True)
        sublime.set_timeout(lambda: sublime.run_command('exit'), 500)


class EssaiHumalisRemplacerCommand(sublime_plugin.TextCommand):
    def run(self, edit, a, b, texte):
        self.view.replace(edit, sublime.Region(a, b), texte)


def plugin_loaded():
    REGLAGE = os.path.join(sublime.packages_path(), 'User', 'essai-humalis.json')
    if not os.path.exists(REGLAGE):
        return
    with open(REGLAGE, encoding='utf-8') as f:
        reglage = json.load(f)
    os.remove(REGLAGE)
    essai = Essai(reglage)
    essai.noter('essai chargé, Sublime Text %s' % sublime.version())
    sublime.set_timeout(essai.lancer, 3000)
