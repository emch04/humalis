import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function creerProjet(racine: string, nom: string): string {
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9_-]*$/u.test(nom)) throw new Error('Le nom doit commencer par une lettre et contenir seulement des lettres, chiffres, _ ou -.');
  const dossier = join(racine, nom);
  if (existsSync(dossier)) throw new Error(`Le dossier « ${dossier} » existe déjà.`);
  mkdirSync(join(dossier, 'tests'), { recursive: true });
  const fichiers = new Map([
    ['humalis.projet.json', JSON.stringify({ principal: `${nom}.humalis` }, null, 2) + '\n'],
    [`${nom}.humalis`, 'utiliser style "./theme.css"\n\npage "accueil" :\n    titre "Bienvenue"\n    texte "Mon premier site Humalis"\n    bouton "Dire bonjour"\n    quand l\'utilisateur clique sur "Dire bonjour" :\n        afficher "Bonjour !"\n'],
    ['theme.css', 'h1 { color: #174274; }\nbutton { border-radius: 0.5rem; }\n'],
    ['tests/accueil.test.humalis', 'test "la page d\'accueil présente le site" de page "accueil" :\n    verifier que texte "Bienvenue" est visible\n    verifier que texte "Mon premier site Humalis" est visible\n    verifier que page est "accueil"\n\ntest "le bouton dit bonjour" de page "accueil" :\n    cliquer sur "Dire bonjour"\n    verifier que texte "Bonjour !" est visible\n'],
    ['LISEZMOI.md', `# ${nom}\n\nExécutez \`humalis developper ${nom}.humalis\`, puis installez les dépendances dans .humalis/web avec \`npm install\` et relancez.\n\nFormatez avec \`humalis formater ${nom}.humalis\`. Lancez les tests avec \`humalis tester\`.\n`],
    ['.gitignore', '.humalis/\nnode_modules/\n'],
  ]);
  for (const [chemin, contenu] of fichiers) writeFileSync(join(dossier, chemin), contenu);
  return dossier;
}
