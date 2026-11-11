/**
 * Construit le serveur de langage de « humalis editeur --stdio »
 * (dist/editeur/serveur.js), lancé par les éditeurs autres que VS Code :
 * JetBrains, Zed, Neovim, Helix, Emacs, Sublime Text, Visual Studio…
 *
 * Le serveur est écrit une seule fois, dans editeur/vscode/src/lsp (avec
 * les fonctions de editeur/vscode/src/langage), et partagé : l'extension
 * VS Code l'emballe dans dist/serveur-lsp.js, le paquet npm l'emballe ici.
 * Les modules du compilateur (src/…) ne sont pas recopiés : le serveur les
 * importe depuis dist/, déjà produit par tsc, pour n'avoir qu'un compilateur
 * dans le paquet. Le numéro de version annoncé à l'éditeur est celui du
 * paquet humalis, pas celui de l'extension.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sources = join(racine, 'src') + sep;
const paquetExtension = join(racine, 'editeur', 'vscode', 'package.json');

/**
 * Écrit le serveur dans `sortie` ; ses imports du compilateur visent
 * `compilateur` (dist/ par défaut, où tsc a écrit src/).
 */
export async function construireServeurEditeur({ sortie = join(racine, 'dist', 'editeur', 'serveur.js'), compilateur = join(racine, 'dist') } = {}) {
  const { version } = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8'));
  await build({
    input: join(racine, 'editeur', 'vscode', 'src', 'lsp', 'principal.ts'),
    platform: 'node',
    logLevel: 'warn',
    output: { file: sortie, format: 'esm', minify: false },
    plugins: [
      {
        name: 'humalis-editeur',
        resolveId(source, importeur) {
          if (!importeur || !source.startsWith('.')) return null;
          const cible = resolve(dirname(importeur), source);
          if (cible === paquetExtension) return { id: '\0paquet-humalis' };
          if (!cible.startsWith(sources)) return null;
          // Un module du compilateur : importé depuis dist/, tel que tsc l'a écrit.
          let chemin = relative(dirname(sortie), join(compilateur, relative(sources, cible))).split(sep).join('/');
          if (!chemin.startsWith('.')) chemin = `./${chemin}`;
          return { id: chemin, external: true };
        },
        load(id) {
          return id === '\0paquet-humalis' ? `export default ${JSON.stringify({ name: 'humalis', version })};` : null;
        },
      },
    ],
  });
  return sortie;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sortie = await construireServeurEditeur();
  console.error(`Serveur de langage écrit dans ${relative(racine, sortie)}.`);
}
