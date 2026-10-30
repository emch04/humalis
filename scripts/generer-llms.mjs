import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VOCABULAIRE } from '../src/vocabulaire/table.ts';
import { ENTREES_ERREURS } from '../catalogue/erreurs.ts';

const racine = new URL('../', import.meta.url);
const exemple = VOCABULAIRE.find((entree) => entree.concept === 'structure.page')?.exemple;
if (!exemple) throw new Error('Exemple de page absent de la table de vocabulaire');

export function produireLlms() {
  const mots = (categorie) => VOCABULAIRE.filter((entree) => entree.categorie === categorie && entree.statut === 'supporte')
    .map((entree) => entree.accentue ?? entree.mot).join(', ');
  return `# Humalis — guide court pour les assistants\n\nHumalis est un langage en français. Un fichier .humalis décrit des pages, des éléments et des actions ; le compilateur produit web, mobile, statique, desktop ou serveur selon la cible.\n\n## Grammaire en une page\n\n- Une page commence par \`page "nom" :\`. Son contenu est indenté de 4 espaces ; chaque bloc ajoute 4 espaces.\n- Les éléments d’écran pris en charge : ${mots('element')}. Leur texte s’écrit entre guillemets.\n- Déclare une valeur avec \`variable nom = valeur\` ; une condition commence par \`si ... :\`.\n- Les événements pris en charge : ${mots('evenement')}. Écris l’événement sous l’élément visé, puis l’action dans son bloc.\n- Les actions prises en charge : ${mots('action')}.\n- Les mots de liaison (ignorés dans une phrase mais interdits comme nom de variable) : ${mots('liaison')}.\n\n## Pièges fréquents\n\n- \`a\` et \`de\` ne peuvent pas nommer une variable : ce sont des mots de liaison.\n- Dans \`{nom}\`, les accolades n’acceptent qu’un nom de variable, sans calcul ni phrase.\n- Un événement s’écrit sous l’élément concerné, jamais comme une instruction isolée.\n- Utilise des espaces, jamais des tabulations ; indentation par multiples de 4.\n\n## Exemple complet vérifié\n\n\`\`\`humalis\n${exemple}\n\`\`\`\n\n## Messages d’erreur\n\n${ENTREES_ERREURS.map((entree) => `- ${entree.titre} : ${entree.motif}`).join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(process.argv[1], 'file://'))) {
  const contenu = produireLlms();
  writeFileSync(new URL('llms.txt', racine), contenu);
}
