;;; humalis-mode.el --- Le langage Humalis dans Emacs  -*- lexical-binding: t; -*-

;; Auteur : emch04
;; Version : 1.0.0
;; Package-Requires: ((emacs "29.1"))
;; Mots-clés : languages
;; URL : https://humalis.dev

;;; Commentary:

;; Mode majeur pour les fichiers .humalis : coloration des mots du
;; langage (avec ou sans accents, dans n'importe quelle casse),
;; commentaires « # », indentation de quatre espaces après « : ».
;;
;; Avec eglot (inclus dans Emacs 29 et plus récent) et la commande
;; « humalis » (npm install -g humalis), le serveur de langage donne les
;; erreurs en direct (flymake), le survol (eldoc), la complétion
;; (completion-at-point), la déclaration (M-.), le plan (imenu) et la mise
;; en forme (eglot-format-buffer).
;;
;; Installation : copier ce fichier dans un dossier du load-path, puis
;; dans init.el :
;;
;;     (require 'humalis-mode)
;;     (add-hook 'humalis-mode-hook #'eglot-ensure)

;;; Code:

(require 'eglot)

(defgroup humalis nil
  "Le langage Humalis."
  :group 'languages
  :prefix "humalis-")

(defcustom humalis-indentation 4
  "Nombre d'espaces d'un niveau d'indentation (Humalis attend 4)."
  :type 'integer)

(defcustom humalis-commande-serveur '("humalis" "editeur" "--stdio")
  "Commande qui lance le serveur de langage Humalis."
  :type '(repeat string))

;; Les mots du langage, tirés du vocabulaire du compilateur
;; (editeur/tree-sitter-humalis/mots.json) : un test du dépôt vérifie
;; que ces listes sont à jour.
;; <mots>
(defconst humalis--mots-reserves
  '("avec" "composant" "dans" "est" "et" "non" "ou" "page" "par" "pour" "quand" "rien" "serveur" "si" "sinon" "variable" "vers"))
(defconst humalis--mots-contextuels
  '("afficher" "ajouter" "bouton" "cacher" "calcul" "champ" "changer" "chaque" "charge" "clique" "cliques" "egal" "egale" "egales" "egaux" "envoyer" "erreur" "formulaire" "image" "inferieur" "inferieure" "inferieures" "inferieurs" "lien" "liste" "listes" "montrer" "nombre" "rediriger" "requete" "retirer" "soumis" "soustitre" "soustitres" "style" "superieur" "superieure" "superieures" "superieurs" "sur" "survole" "survolent" "tableau" "tableaux" "texte" "titre" "utilisateur" "utiliser" "vide"))
(defconst humalis--constantes '("faux" "vrai"))
;; </mots>

(defconst humalis--lettres
  '((?a . "aàâäAÀÂÄ") (?c . "cçCÇ") (?e . "eéèêëEÉÈÊË") (?i . "iîïIÎÏ") (?o . "oôöOÔÖ") (?u . "uùûüUÙÛÜ"))
  "Chaque voyelle (et le c) avec ses accents : le compilateur les ignore.")

(defun humalis--mot-souple (mot)
  "Expression régulière de MOT, avec ou sans accents."
  (mapconcat (lambda (lettre)
               (let ((variantes (alist-get lettre humalis--lettres)))
                 (if variantes (concat "[" variantes "]") (regexp-quote (string lettre)))))
             mot ""))

(defun humalis--mots (mots)
  "Expression régulière d'un des MOTS, entier."
  (concat "\\_<\\(?:" (mapconcat #'humalis--mot-souple (sort (copy-sequence mots) (lambda (a b) (> (length a) (length b)))) "\\|") "\\)\\_>"))

(defconst humalis--coloration
  `((,(humalis--mots humalis--constantes) . font-lock-constant-face)
    (,(humalis--mots humalis--mots-reserves) . font-lock-keyword-face)
    (,(humalis--mots humalis--mots-contextuels) . font-lock-builtin-face)
    ("\\_<[0-9]+\\(?:\\.[0-9]+\\)?\\_>" . font-lock-constant-face)
    ("{[^}\"\n]*}" 0 font-lock-variable-name-face prepend))
  "Coloration de Humalis.")

(defvar humalis-mode-syntax-table
  (let ((table (make-syntax-table)))
    (modify-syntax-entry ?# "<" table)
    (modify-syntax-entry ?\n ">" table)
    (modify-syntax-entry ?\" "\"" table)
    (modify-syntax-entry ?\\ "\\" table)
    (modify-syntax-entry ?_ "_" table)
    (modify-syntax-entry ?' "." table)
    (modify-syntax-entry ?` "." table)
    table)
  "Table de syntaxe de Humalis.")

(defun humalis--indentation-attendue ()
  "Indentation de la ligne courante : celle de la ligne précédente, plus un niveau après « : »."
  (save-excursion
    (beginning-of-line)
    (if (not (re-search-backward "^[ \t]*[^ \t\n#]" nil t))
        0
      (let ((base (current-indentation))
            (fin (progn (end-of-line) (point))))
        (beginning-of-line)
        (if (re-search-forward "^[^#\n]*:[ \t]*\\(?:#.*\\)?$" fin t)
            (+ base humalis-indentation)
          base)))))

(defun humalis-indenter-ligne ()
  "Indente la ligne ; répété, enlève un niveau à chaque fois (pour fermer un bloc)."
  (interactive)
  (let* ((attendue (humalis--indentation-attendue))
         (actuelle (current-indentation))
         (cible (if (and (eq last-command this-command) (> actuelle 0))
                    (max 0 (- actuelle humalis-indentation))
                  attendue)))
    (if (<= (current-column) actuelle)
        (indent-line-to cible)
      (save-excursion (indent-line-to cible)))))

;;;###autoload
(define-derived-mode humalis-mode prog-mode "Humalis"
  "Mode majeur pour les fichiers du langage Humalis."
  :syntax-table humalis-mode-syntax-table
  (setq-local comment-start "# ")
  (setq-local comment-start-skip "#+[ \t]*")
  (setq-local indent-tabs-mode nil)
  (setq-local tab-width humalis-indentation)
  (setq-local indent-line-function #'humalis-indenter-ligne)
  (setq-local electric-indent-inhibit nil)
  (setq-local font-lock-defaults '(humalis--coloration nil t)))

;;;###autoload
(add-to-list 'auto-mode-alist '("\\.humalis\\'" . humalis-mode))

(defun humalis--serveur (&rest _)
  "La commande du serveur de langage, lue dans `humalis-commande-serveur' à chaque lancement."
  humalis-commande-serveur)

(add-to-list 'eglot-server-programs '(humalis-mode . humalis--serveur))

(provide 'humalis-mode)
;;; humalis-mode.el ends here
