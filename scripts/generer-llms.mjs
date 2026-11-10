import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VOCABULAIRE } from '../src/vocabulaire/table.ts';
import { ENTREES_ERREURS } from '../catalogue/erreurs.ts';

const racine = new URL('../', import.meta.url);
const exemple = VOCABULAIRE.find((entree) => entree.concept === 'structure.page')?.exemple;
if (!exemple) throw new Error('Exemple de page absent de la table de vocabulaire');

/** Des phrases récentes, chacune avec un programme complet que tests/llms.test.ts compile. */
const PHRASES = [
  ['style "carte" :', 'En haut du fichier, un style écrit en Humalis, une propriété par ligne ; on l’emploie avec « avec style "carte" ».', 'style "carte" :\n    fond blanc\n    bord 1 gris clair\n    arrondi 12\n    espace interieur 16\n\npage "accueil" :\n    titre "Accueil"\n    bloc avec style "carte" :\n        texte "Un produit"'],
  ['seul son auteur peut …', 'Dans une route du serveur : seul le compte qui a créé la fiche peut la modifier ou la supprimer. Le champ « auteur » est rempli par le serveur.', 'serveur "avis" :\n    donnee avis :\n        texte : texte\n    route "avis" :\n        tout le monde peut lire avis\n        connecte peut creer avis\n        seul son auteur peut modifier et supprimer avis\n\npage "accueil" :\n    titre "Avis"'],
  ['donnees de depart pour …', 'Les premières fiches, écrites au premier démarrage si la table est vide.', 'serveur "boutique" :\n    donnee produit :\n        nom : texte\n        prix : nombre\n    route "produits" :\n        tout le monde peut lire produit\n    donnees de depart pour produit :\n        nom "Café", prix 3\n        nom "Thé", prix 2\n\npage "accueil" :\n    titre "Boutique"'],
  ['avec adresse par langue', 'Chaque langue a ses propres adresses : /contact en français, /en/contact en anglais.', 'langues : francais, anglais avec adresse par langue\n\npage "accueil" :\n    titre "Bienvenue" en anglais "Welcome"'],
  ['{a la ligne}', 'Un saut de ligne dans un texte.', 'page "accueil" :\n    titre "Adresse"\n    texte "12 rue des Lilas{a la ligne}Lyon"'],
];

export function produireLlms() {
  const mots = (categorie) => VOCABULAIRE.filter((entree) => entree.categorie === categorie && entree.statut === 'supporte')
    .map((entree) => entree.accentue ?? entree.mot).join(', ');
  const exemplesDe = (concepts) => concepts.map((c) => VOCABULAIRE.find((e) => e.concept === c && e.statut === 'supporte')).filter(Boolean);
  const exemplesTable = exemplesDe(['option.desactive', 'element.video', 'page.dessinee', 'texte.initiales', 'texte.enLettres', 'texte.dateLongue', 'comparaison.non', 'serveur.auDepart', 'serveur.avant'])
    .map((e) => `### ${e.accentue ?? e.mot}\n\n${e.description}\n\n\`\`\`humalis\n${e.exemple}\n\`\`\``).join('\n\n');
  const phrases = PHRASES.map(([titre, explication, code]) => `### ${titre}\n\n${explication}\n\n\`\`\`humalis\n${code}\n\`\`\``).join('\n\n');
  return `# Humalis — guide court pour les assistants\n\nHumalis est un langage en français. Un fichier .humalis décrit des pages, des éléments et des actions ; le compilateur produit web, mobile, statique, desktop ou serveur selon la cible.\n\n## Grammaire en une page\n\n- Une page commence par \`page "nom" :\`. Son contenu est indenté de 4 espaces ; chaque bloc ajoute 4 espaces.\n- Les éléments d’écran pris en charge : ${mots('element')}. Leur texte s’écrit entre guillemets.\n- Déclare une valeur avec \`variable nom = valeur\` ; une condition commence par \`si ... :\`.\n- Les événements pris en charge : ${mots('evenement')}. Écris l’événement sous l’élément visé, puis l’action dans son bloc.\n- Les actions prises en charge : ${mots('action')}.\n- Les mots de liaison (ignorés dans une phrase mais interdits comme nom de variable) : ${mots('liaison')}.\n- Les options d’un élément (après « avec », séparées par « et ») : ${mots('option')}.\n- Les droits d’une route du serveur : ${mots('droit')}.\n\n## Pièges fréquents\n\n- \`a\` et \`de\` ne peuvent pas nommer une variable : ce sont des mots de liaison.\n- Dans \`{nom}\`, les accolades n’acceptent qu’un nom de variable, sans calcul ni phrase.\n- Un événement s’écrit sous l’élément concerné, jamais comme une instruction isolée.\n- Utilise des espaces, jamais des tabulations ; indentation par multiples de 4.\n- La 3D n’existe pas dans le langage : écris la scène dans un composant React (\`.tsx\` ou \`.jsx\`) et utilise-le avec \`utiliser composant "Scene3D" depuis "./composants/Scene3D"\`. Ses paquets (\`three\`, \`gsap\`…) sont ajoutés seuls au projet.\n\n## Exemple complet vérifié\n\n\`\`\`humalis\n${exemple}\n\`\`\`\n\n## Phrases utiles, vérifiées\n\n${phrases}\n\n${exemplesTable}\n\n## Messages d’erreur\n\n${ENTREES_ERREURS.map((entree) => `- ${entree.titre} : ${entree.motif}`).join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(process.argv[1], 'file://'))) {
  const contenu = produireLlms();
  writeFileSync(new URL('llms.txt', racine), contenu);
}
