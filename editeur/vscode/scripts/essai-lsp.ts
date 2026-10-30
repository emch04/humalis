/**
 * Essai en vrai du serveur de langage construit (npm run essai:lsp) :
 * lance `node dist/serveur-lsp.js --stdio`, lui parle en JSON-RPC sur
 * son entrée standard comme le ferait un éditeur, et affiche chaque
 * vérification.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ClientLsp, parcours } from './client-lsp.js';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const serveur = join(racine, 'dist', 'serveur-lsp.js');
const fichier = join(racine, '..', '..', 'exemples', 'boutique.humalis');

async function essayer(): Promise<number> {
  if (!existsSync(serveur)) {
    console.error('dist/serveur-lsp.js est absent : lancez d’abord npm run build.');
    return 1;
  }
  const client = new ClientLsp(process.execPath, [serveur, '--stdio'], racine);
  try {
    const verifications = await parcours(client, pathToFileURL(fichier).href, readFileSync(fichier, 'utf8'));
    for (const [nom, ok, detail] of verifications) console.log(`${ok ? 'ok   ' : 'RATÉ '} ${nom} — ${detail}`);
    const ratees = verifications.filter(([, ok]) => !ok).length;
    console.log(`\n${verifications.length - ratees} vérifications réussies sur ${verifications.length}, avec ${serveur}.`);
    return ratees === 0 ? 0 : 1;
  } catch (erreur) {
    console.error(erreur);
    client.tuer();
    return 1;
  }
}

essayer().then((code) => process.exit(code));
