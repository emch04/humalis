"""
Essai en vrai du réglage Helix (editeur/helix) dans Helix, sur un terminal
virtuel (terminal.py, avec pyte) :

    python editeur/essais/helix.py <dossier-de-travail>

Construit la grammaire dans une configuration à part, vérifie
« hx --health humalis », puis ouvre une copie de exemples/boutique.humalis
dont un guillemet a été retiré : la coloration, l'erreur (espace d), le
survol (espace k), le plan (espace s), la déclaration (g d), la complétion
et la mise en forme (:format), chacune lue sur l'écran. Il faut « hx » et
« humalis » dans le PATH (et HELIX_RUNTIME si besoin).
"""
import os
import re
import shutil
import subprocess
import sys

from terminal import Terminal

ici = os.path.dirname(os.path.abspath(__file__))
depot = os.path.abspath(os.path.join(ici, '..', '..'))
travail = os.path.abspath(sys.argv[1])
shutil.rmtree(travail, ignore_errors=True)
config = os.path.join(travail, 'helix')
os.makedirs(os.path.join(config, 'runtime', 'grammars'))
os.makedirs(os.path.join(config, 'runtime', 'queries', 'humalis'))
with open(os.path.join(depot, 'editeur', 'helix', 'languages.toml'), encoding='utf-8') as f:
    reglage = f.read()
reglage = re.sub(r'^source = \{ git = .*$', f'source = {{ path = "{depot}/editeur/tree-sitter-humalis" }}', reglage, flags=re.M)
with open(os.path.join(config, 'languages.toml'), 'w', encoding='utf-8') as f:
    f.write('use-grammars = { only = ["humalis"] }\n' + reglage)
shutil.copy(os.path.join(depot, 'editeur', 'tree-sitter-humalis', 'queries', 'helix', 'highlights.scm'), os.path.join(config, 'runtime', 'queries', 'humalis'))
env = dict(os.environ, XDG_CONFIG_HOME=travail)

resultats = []
def verifier(nom, ok, detail=''):
    resultats.append((nom, bool(ok), detail))

subprocess.run(['hx', '--grammar', 'build'], env=env, check=True, capture_output=True)
sante = re.sub(r'\x1b\[[0-9;]*m', '', subprocess.run(['hx', '--health', 'humalis'], env=env, capture_output=True, text=True).stdout)
verifier('hx --health : serveur, grammaire, coloration', '✓ humalis' in sante and 'Tree-sitter parser: ✓' in sante and 'Highlight queries: ✓' in sante)

with open(os.path.join(depot, 'exemples', 'boutique.humalis'), encoding='utf-8') as f:
    original = f.read()
fichier = os.path.join(travail, 'boutique.humalis')
with open(fichier, 'w', encoding='utf-8') as f:
    f.write(original.replace('    titre "Votre panier"', '    titre "Votre panier'))

def position(t):
    for ligne in reversed(t.ecran().splitlines()):
        m = re.search(r'\s(\d+):(\d+)\s', ligne + ' ')
        if m and 'NOR' in ligne:
            return int(m.group(1)), int(m.group(2))
    return None

with Terminal(['hx', fichier], env={'XDG_CONFIG_HOME': travail}) as t:
    verifier('ouverture', t.attendre('NOR'))
    t.lire(4)

    # Coloration : le mot réservé « page », la chaîne qui suit et un nom n'ont pas la même couleur.
    lignes = t.ecran_virtuel.display
    y = next(i for i, l in enumerate(lignes) if 'page "boutique"' in l)
    x = lignes[y].index('page "boutique"')
    y_nom = next(i for i, l in enumerate(lignes) if 'variable stock' in l)
    x_nom = lignes[y_nom].index('stock')
    couleurs = (t.couleur(y, x), t.couleur(y, x + 6), t.couleur(y_nom, x_nom))
    verifier('coloration (grammaire tree-sitter)', len(set(couleurs)) == 3 and 'default' not in couleurs[:2], f'mot réservé {couleurs[0]}, chaîne {couleurs[1]}, nom {couleurs[2]}')

    t.touches(' d')
    verifier('erreur en direct (liste des erreurs)', t.attendre(lambda e: 'ERROR' in e and 'Humalis' in e and 'non fermée' in e, 15))
    t.touches('\x1b', 0.5)

    t.touches(':goto 11\r')
    t.touches('gs')
    t.touches(' k')
    verifier('survol de « bouton »', t.attendre('élément', 10))
    t.touches('\x1b', 0.5)

    t.touches(' s')
    verifier('plan du fichier', t.attendre(lambda e: 'boutique' in e and 'panier' in e and 'page' in e.lower(), 10))
    t.touches('\x1b', 0.5)

    t.touches(':goto 13\r')
    t.touches('gl')
    t.touches('gd', 1.5)
    pos = position(t)
    verifier('déclaration de « panier » (g d)', pos is not None and pos[0] == 1, f'curseur en {pos}')

    t.touches(':goto 7\r')
    t.touches('o')
    t.touches('bout', 0.5)
    verifier('complétion en tapant « bout »', t.attendre(lambda e: e.count('bouton') >= 3, 10))
    t.touches('\x1b', 0.4)
    t.touches('\x1b', 0.4)
    t.touches('u', 0.5)

    t.touches(':goto 23\r')
    t.touches('gl')
    t.touches('a"\x1b', 0.5)
    t.touches(':goto 7\r')
    t.touches('gs')
    t.touches('e')
    t.touches('a  \x1b', 1)
    t.touches(':format\r', 2)
    t.touches(':write\r', 1)
    verifier('enregistré', t.attendre('written', 5), t.ecran().splitlines()[-1].strip())
    t.touches(':quit!\r', 0.5)

with open(fichier, encoding='utf-8') as f:
    final = f.read()
verifier('mise en forme (:format) et correction', final == original, 'identique à exemples/boutique.humalis' if final == original else 'différent')

version = subprocess.run(['hx', '--version'], capture_output=True, text=True).stdout.strip()
for nom, ok, detail in resultats:
    print(f"{'ok  ' if ok else 'RATÉ'} {nom}{' — ' + detail if detail else ''}")
echecs = sum(1 for _, ok, _ in resultats if not ok)
print(f'{len(resultats)} vérifications, {echecs} ratée(s), {version}')
sys.exit(1 if echecs else 0)
