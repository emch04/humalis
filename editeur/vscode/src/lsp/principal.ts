/**
 * Le serveur de langage Humalis sur l'entrée et la sortie standard :
 *
 *     node dist/serveur-lsp.js --stdio
 *
 * C'est ce que lance un éditeur (Neovim, Helix, Zed, Emacs…). La sortie
 * standard ne porte que les messages du protocole ; les incidents vont sur
 * la sortie d'erreur.
 *
 * Avec HUMALIS_JOURNAL_LSP=<fichier>, chaque message reçu (←) et envoyé (→)
 * y est ajouté : de quoi savoir ce qu'un éditeur demande vraiment.
 */
import { appendFileSync } from 'node:fs';
import { LecteurMessages, ecrireMessage } from './protocole.js';
import { ServeurLangage } from './serveur.js';

const fichierJournal = process.env.HUMALIS_JOURNAL_LSP;
const journal = (sens: '←' | '→', message: unknown): void => {
  if (!fichierJournal) return;
  try {
    const texte = JSON.stringify(message);
    appendFileSync(fichierJournal, `${new Date().toISOString()} ${sens} ${texte.length > 4000 ? `${texte.slice(0, 4000)}…` : texte}\n`);
  } catch { /* Le journal ne doit jamais gêner le serveur. */ }
};

const lecteur = new LecteurMessages();
const serveur = new ServeurLangage((message) => {
  journal('→', message);
  process.stdout.write(ecrireMessage(message));
});

process.stdin.on('data', (morceau: Buffer) => {
  let messages: unknown[];
  try {
    messages = lecteur.ajouter(morceau);
  } catch (erreur) {
    console.error(`serveur Humalis : message illisible (${erreur instanceof Error ? erreur.message : String(erreur)})`);
    return;
  }
  for (const message of messages) {
    journal('←', message);
    serveur.recevoir(message as Parameters<ServeurLangage['recevoir']>[0]);
  }
});

// L'éditeur a fermé le tuyau sans dire « exit » : on s'arrête aussi.
process.stdin.on('end', () => process.exit(0));
