#!/bin/sh
# Essai en vrai du paquet Sublime Text (editeur/sublime/Humalis), avec le
# module LSP déjà installé dans Sublime :
#
#     sh editeur/essais/sublime.sh <dossier-de-travail> [<dossier-de-données-de-sublime>]
#
# Branche le paquet (lien vers editeur/sublime/Humalis), copie l'essai
# (sublime_essai.py) dans Packages/User, lance le serveur derrière un
# script qui garde le trafic, ouvre Sublime et attend ses verdicts. Sublime
# se ferme à la fin. Il faut « humalis » dans le PATH.
set -eu
ici=$(cd "$(dirname "$0")" && pwd)
depot=$(cd "$ici/../.." && pwd)
travail=$1
donnees=${2:-"$HOME/Library/Application Support/Sublime Text"}
app="${SUBLIME_APP:-/Applications/Sublime Text.app}"
rm -rf "$travail"; mkdir -p "$travail"
cp "$depot/exemples/boutique.humalis" "$travail/boutique.humalis"

cat > "$travail/serveur" <<FIN
#!/bin/sh
tee -a "$travail/entree.log" | "$(command -v humalis)" editeur --stdio | tee -a "$travail/trafic.log"
FIN
chmod +x "$travail/serveur"

ln -sfn "$depot/editeur/sublime/Humalis" "$donnees/Packages/Humalis"
cp "$ici/sublime_essai.py" "$donnees/Packages/User/essai_humalis.py"
printf '{\n\t"command": ["%s"]\n}\n' "$travail/serveur" > "$donnees/Packages/User/LSP-humalis.sublime-settings"
python3 -c "import json,sys; print(json.dumps({'fichier': sys.argv[1], 'journal': sys.argv[2], 'trafic': sys.argv[3], 'original': open(sys.argv[1], encoding='utf-8').read()}))" \
  "$travail/boutique.humalis" "$travail/verdicts.txt" "$travail/trafic.log" > "$donnees/Packages/User/essai-humalis.json"

# Une session vierge : sans elle, Sublime rouvre le fichier de l'essai précédent avec sa syntaxe d'alors.
rm -f "$donnees/Local/Session.sublime_session" "$donnees/Local/Auto Save Session.sublime_session"
open -g -a "$app"
i=0
while [ ! -s "$travail/verdicts.txt" ] && [ $i -lt 120 ]; do sleep 1; i=$((i + 1)); done
rm -f "$donnees/Packages/User/essai_humalis.py" "$donnees/Packages/User/LSP-humalis.sublime-settings" "$donnees/Packages/User/essai-humalis.json"
if [ ! -s "$travail/verdicts.txt" ]; then echo "RATÉ pas de verdict de Sublime au bout de 120 s"; exit 1; fi
cat "$travail/verdicts.txt"
! grep -q '^RATÉ' "$travail/verdicts.txt"
