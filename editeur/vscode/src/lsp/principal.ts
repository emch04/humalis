/**
 * Le serveur de langage Humalis sur l'entrée et la sortie standard :
 *
 *     node dist/serveur-lsp.js --stdio
 *
 * C'est ce que lance un éditeur (Neovim, Helix, Zed, Emacs…). La sortie
 * standard ne porte que les messages du protocole ; les incidents vont sur
 * la sortie d'erreur.
 */
import { LecteurMessages, ecrireMessage } from './protocole.js';
import { ServeurLangage } from './serveur.js';

const lecteur = new LecteurMessages();
const serveur = new ServeurLangage((message) => process.stdout.write(ecrireMessage(message)));

process.stdin.on('data', (morceau: Buffer) => {
  let messages: unknown[];
  try {
    messages = lecteur.ajouter(morceau);
  } catch (erreur) {
    console.error(`serveur Humalis : message illisible (${erreur instanceof Error ? erreur.message : String(erreur)})`);
    return;
  }
  for (const message of messages) serveur.recevoir(message as Parameters<ServeurLangage['recevoir']>[0]);
});

// L'éditeur a fermé le tuyau sans dire « exit » : on s'arrête aussi.
process.stdin.on('end', () => process.exit(0));
