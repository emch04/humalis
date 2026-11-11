;;; emacs.el --- Essai en vrai de humalis-mode.el et d'eglot  -*- lexical-binding: t; -*-

;; Emacs sans écran :
;;
;;     emacs --batch -Q -l editeur/essais/emacs.el <fichier.humalis>
;;
;; Charge le mode tel qu'un utilisateur l'installerait, ouvre le fichier,
;; lance eglot (« humalis editeur --stdio »), puis vérifie la coloration,
;; l'indentation, l'erreur en direct (flymake), le survol, la complétion,
;; la déclaration (xref), le plan (imenu) et la mise en forme.

;;; Code:

(let ((ici (file-name-directory (or load-file-name buffer-file-name))))
  (add-to-list 'load-path (expand-file-name "../emacs" ici)))
(require 'humalis-mode)
(add-hook 'humalis-mode-hook #'eglot-ensure)

(defvar essai-resultats nil)
(defun essai-verifier (nom ok detail)
  (push (format "%s %s — %s" (if ok "ok  " "RATÉ") nom detail) essai-resultats)
  ok)

(defun essai-attendre (condition &optional delai)
  "Attend que CONDITION soit vraie, au plus DELAI secondes (15 par défaut)."
  (let ((fin (+ (float-time) (or delai 15))))
    (while (and (not (funcall condition)) (< (float-time) fin))
      (accept-process-output nil 0.1))
    (funcall condition)))

(defun essai-aller (motif &optional decalage)
  (goto-char (point-min))
  (search-forward motif)
  (goto-char (+ (match-beginning 0) (or decalage 0))))

(let* ((fichier (expand-file-name (car command-line-args-left)))
       (original (with-temp-buffer (insert-file-contents fichier) (buffer-string))))
  (find-file fichier)
  (essai-verifier "mode majeur" (eq major-mode 'humalis-mode) (symbol-name major-mode))

  ;; Coloration.
  (font-lock-ensure)
  (essai-aller "page \"boutique\"")
  (let ((mot (get-text-property (point) 'face))
        (chaine (get-text-property (+ (point) 6) 'face)))
    (essai-aller "bouton \"Ajouter\"")
    (let ((element (get-text-property (point) 'face)))
      (essai-verifier "coloration" (and (eq mot 'font-lock-keyword-face) (eq chaine 'font-lock-string-face) (eq element 'font-lock-builtin-face))
                      (format "page %s, chaîne %s, bouton %s" mot chaine element))))
  (with-temp-buffer
    (humalis-mode)
    (insert "Si Égal")
    (font-lock-ensure)
    (essai-verifier "coloration sans tenir compte des accents ni de la casse"
                    (and (eq (get-text-property 1 'face) 'font-lock-keyword-face) (eq (get-text-property 4 'face) 'font-lock-builtin-face))
                    (format "%s / %s" (get-text-property 1 'face) (get-text-property 4 'face))))

  ;; Indentation : après « : », un niveau de plus.
  (with-temp-buffer
    (humalis-mode)
    (insert "page \"a\" :\ntitre \"b\"")
    (humalis-indenter-ligne)
    (essai-verifier "indentation après « : »" (= (current-indentation) 4) (format "%d espaces" (current-indentation))))

  ;; Serveur de langage : eglot-ensure attend la fin de la première commande, que le mode sans écran n'a pas.
  (run-hooks 'post-command-hook)
  (essai-verifier "eglot lancé" (essai-attendre (lambda () (eglot-current-server)))
                  (if (eglot-current-server) (format "%S" (plist-get (eglot--server-info (eglot-current-server)) :version)) "aucun serveur"))
  (let ((serveur (eglot-current-server)))
    ;; Erreur en direct : un guillemet retiré.
    (essai-aller "titre \"Votre panier\"")
    (end-of-line)
    (delete-char -1)
    (essai-verifier "erreur en direct (flymake)"
                    ;; Sans écran, Emacs n'est jamais « au repos » : on fait ce que feraient les minuteries
                    ;; d'eglot (envoyer la modification) et de flymake (relancer la vérification).
                    (essai-attendre (lambda () (eglot--signal-textDocument/didChange) (flymake-start) (seq-some (lambda (d) (string-match-p "guillemet manquant" (flymake-diagnostic-text d))) (flymake-diagnostics))))
                    (format "%s / flymake-mode %s / %S" (mapconcat #'flymake-diagnostic-text (flymake-diagnostics) " | ") flymake-mode (flymake-running-backends)))
    (insert "\"")
    (essai-attendre (lambda () (eglot--signal-textDocument/didChange) (flymake-start) (null (flymake-diagnostics))))

    (essai-aller "bouton \"Ajouter\"" 2)
    (let ((survol (jsonrpc-request serveur :textDocument/hover (eglot--TextDocumentPositionParams))))
      (essai-verifier "survol de « bouton »" (string-match-p "\\*\\*bouton\\*\\*" (or (plist-get (plist-get survol :contents) :value) ""))
                      (car (split-string (or (plist-get (plist-get survol :contents) :value) "") "\n"))))

    (essai-aller "    bouton \"Commander\"")
    (end-of-line)
    (insert "\n        bout")
    (let* ((capf (eglot-completion-at-point))
           (choix (and capf (all-completions "bout" (nth 2 capf)))))
      (essai-verifier "complétion (completion-at-point)" (member "bouton" choix) (format "%S" (mapcar #'substring-no-properties (seq-take choix 5)))))
    (delete-region (line-beginning-position) (line-end-position))
    (delete-char -1)

    (essai-aller "à panier" 3)
    (let* ((backend (xref-find-backend))
           (lieux (xref-backend-definitions backend (xref-backend-identifier-at-point backend)))
           (ligne (and lieux (xref-location-line (xref-item-location (car lieux))))))
      (essai-verifier "déclaration (xref, M-.)" (eql ligne 1) (format "ligne %s" ligne)))

    (setq imenu--index-alist nil)
    (let ((plan (imenu--make-index-alist t)))
      (essai-verifier "plan (imenu)" (assoc "boutique" (mapcar (lambda (e) (cons (car e) t)) plan)) (format "%S" (mapcar (lambda (e) (substring-no-properties (car e))) plan))))

    (essai-aller "titre \"Votre panier\"")
    (search-forward "titre")
    (insert "   ")
    (eglot-format-buffer)
    (essai-verifier "mise en forme (eglot-format-buffer)" (string= (buffer-string) original) (if (string= (buffer-string) original) "identique à l'original" (format "différent :\n%s" (buffer-string))))
    (set-buffer-modified-p nil)
    (eglot-shutdown serveur)))

(dolist (ligne (reverse essai-resultats)) (princ (concat ligne "\n")))
(let ((echecs (seq-count (lambda (l) (string-prefix-p "RATÉ" l)) essai-resultats)))
  (princ (format "%d vérifications, %d ratée(s), %s\n" (length essai-resultats) echecs (emacs-version)))
  (kill-emacs (if (zerop echecs) 0 1)))

;;; emacs.el ends here
