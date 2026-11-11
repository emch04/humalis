"""
Un terminal virtuel pour essayer en vrai un éditeur plein écran (Helix,
Neovim…) : lance le programme dans un pseudo-terminal, lui envoie des
touches et lit l'écran tel qu'il est dessiné, grâce à pyte
(pip install pyte, dans un environnement à part).

    from terminal import Terminal
    with Terminal(['hx', 'fichier.humalis']) as t:
        t.attendre('NOR')
        t.touches(' d')
        print(t.ecran())
"""
import fcntl
import os
import pty
import select
import signal
import struct
import termios
import time

import pyte


class Terminal:
    def __init__(self, commande, lignes=45, colonnes=140, env=None):
        self.ecran_virtuel = pyte.Screen(colonnes, lignes)
        self.flux = pyte.ByteStream(self.ecran_virtuel)
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            os.environ.update(env or {})
            os.environ['TERM'] = 'xterm-256color'
            os.execvp(commande[0], commande)
        fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack('HHHH', lignes, colonnes, 0, 0))

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.fermer()

    def lire(self, duree=0.2):
        """Lit ce que le programme dessine pendant `duree` secondes."""
        fin = time.time() + duree
        while True:
            reste = fin - time.time()
            if reste <= 0:
                return
            pret, _, _ = select.select([self.fd], [], [], reste)
            if not pret:
                return
            try:
                donnees = os.read(self.fd, 65536)
            except OSError:
                return
            if not donnees:
                return
            self.flux.feed(donnees)

    def ecran(self):
        return '\n'.join(ligne.rstrip() for ligne in self.ecran_virtuel.display)

    def couleur(self, ligne, colonne):
        return self.ecran_virtuel.buffer[ligne][colonne].fg

    def touches(self, texte, pause=0.3):
        os.write(self.fd, texte.encode('utf-8'))
        self.lire(pause)

    def attendre(self, motif, delai=20):
        """Attend que `motif` (texte, ou fonction de l'écran) soit à l'écran ; renvoie True s'il y est."""
        fin = time.time() + delai
        while time.time() < fin:
            self.lire(0.2)
            ecran = self.ecran()
            if (motif(ecran) if callable(motif) else motif in ecran):
                return True
        return False

    def fermer(self):
        """Arrête le programme s'il tourne encore : SIGTERM, puis SIGKILL au bout de 3 secondes."""
        for sig in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.kill(self.pid, sig)
            except ProcessLookupError:
                break
            fin = time.time() + 3
            while time.time() < fin:
                try:
                    if os.waitpid(self.pid, os.WNOHANG)[0] != 0:
                        return
                except ChildProcessError:
                    return
                self.lire(0.1)
        try:
            os.waitpid(self.pid, 0)
        except ChildProcessError:
            pass
