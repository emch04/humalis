/** Source unique de la navigation de la documentation, de ses liens « suivant / précédent » et du test des liens morts. */
export interface EntreeSommaire {
  chemin: string;
  titre: string;
  groupe: string;
  /** Une phrase pour la page d'accueil de la documentation. */
  resume: string;
}

export const SOMMAIRE: readonly EntreeSommaire[] = [
  {
    chemin: '/documentation/prise-en-main',
    titre: 'Prise en main',
    groupe: 'Pour commencer',
    resume: 'Lancer les tests, lire un premier programme, savoir ce que le compilateur fait déjà.',
  },
  {
    chemin: '/documentation/creer-ton-site-web',
    titre: 'Créer ton site web',
    groupe: 'Pour commencer',
    resume: 'Compiler un programme en projet React prérendu, le lancer et le construire.',
  },
  {
    chemin: '/documentation/ton-application-mobile',
    titre: 'Ton application mobile',
    groupe: 'Pour commencer',
    resume: 'Compiler le même programme en application Expo pour iPhone et Android.',
  },
  {
    chemin: '/documentation/ton-application-de-bureau',
    titre: 'Ton application de bureau',
    groupe: 'Pour commencer',
    resume: 'Le même programme en application Electron, pour Mac, Windows et Linux.',
  },
  {
    chemin: '/documentation/ton-site-statique',
    titre: 'Ton site statique',
    groupe: 'Pour commencer',
    resume: 'Du HTML, du CSS et un petit JavaScript, sans construction, à déposer chez un hébergeur.',
  },
  {
    chemin: '/documentation/principes',
    titre: 'Les principes',
    groupe: 'Pour commencer',
    resume: 'Mots de liaison, accents, indentation, commentaires : comment Humalis lit ce que tu écris.',
  },
  {
    chemin: '/documentation/pages',
    titre: 'Les pages',
    groupe: 'Le langage',
    resume: 'Une page est un écran. Tout s’écrit à l’intérieur.',
  },
  {
    chemin: '/documentation/elements',
    titre: 'Les éléments',
    groupe: 'Le langage',
    resume: 'Titre, texte, image, bouton, lien, champ.',
  },
  {
    chemin: '/documentation/styles',
    titre: 'Les styles et les noms',
    groupe: 'Le langage',
    resume: 'Les options après « avec » : couleur, taille, nom.',
  },
  {
    chemin: '/documentation/mise-en-page',
    titre: 'La mise en page',
    groupe: 'Le langage',
    resume: 'Blocs, réglages (colonnes, espacement, ombre), selon l’appareil, thème du projet, en-tête et pied communs.',
  },
  {
    chemin: '/documentation/elements-ecran',
    titre: 'Les éléments d’écran',
    groupe: 'Le langage',
    resume: 'Icônes, onglets, accordéon, carrousel, étoiles, compteur, code QR : un site complet sans React.',
  },
  {
    chemin: '/documentation/evenements',
    titre: 'Les événements',
    groupe: 'Le langage',
    resume: 'Ce qui se passe quand l’utilisateur clique, survole, ou quand la page se charge.',
  },
  {
    chemin: '/documentation/actions',
    titre: 'Les actions',
    groupe: 'Le langage',
    resume: 'Afficher, montrer, cacher, changer un texte, rediriger.',
  },
  {
    chemin: '/documentation/variables',
    titre: 'Les variables',
    groupe: 'Le langage',
    resume: 'Garder une valeur, la changer, l’écrire dans un texte.',
  },
  {
    chemin: '/documentation/conditions',
    titre: 'Les conditions',
    groupe: 'Le langage',
    resume: 'Faire une chose ou une autre selon une comparaison.',
  },
  {
    chemin: '/documentation/listes-et-boucles',
    titre: 'Les listes et les boucles',
    groupe: 'Le langage',
    resume: 'Parcourir une liste avec « pour chaque ».',
  },
  {
    chemin: '/documentation/requetes',
    titre: 'Les requêtes',
    groupe: 'Le langage',
    resume: 'Demander ou envoyer des données à une adresse.',
  },
  {
    chemin: '/documentation/partager-entre-les-pages',
    titre: 'Partager entre les pages',
    groupe: 'Le langage',
    resume: 'Une variable vue par toutes les pages, gardée après un rechargement, et pourquoi pas en secret.',
  },
  {
    chemin: '/documentation/plusieurs-fichiers',
    titre: 'Un projet en plusieurs fichiers',
    groupe: 'Le langage',
    resume: 'Ranger chaque partie de l’application dans son fichier avec « utiliser fichier ».',
  },
  {
    chemin: '/documentation/composants',
    titre: 'Les composants',
    groupe: 'Le langage',
    resume: 'Utiliser un composant React dans Humalis, ou écrire un composant en Humalis.',
  },
  {
    chemin: '/documentation/humalis-dans-react',
    titre: 'Humalis dans un projet React',
    groupe: 'Le langage',
    resume: 'Ajouter des pages Humalis à un projet React existant avec --composants et HumalisRacine.',
  },
  {
    chemin: '/documentation/le-serveur',
    titre: 'Le serveur',
    groupe: 'Le langage',
    resume: 'Décrire des données, des routes et qui peut faire quoi, puis produire un serveur Node avec les packs Astratra.',
  },
  {
    chemin: '/documentation/relier-au-serveur',
    titre: 'Relier les pages au serveur',
    groupe: 'Le langage',
    resume: 'Lire les données du serveur depuis une page (p.nom), et ce que le compilateur vérifie avant de lancer.',
  },
  {
    chemin: '/documentation/vocabulaire',
    titre: 'Le vocabulaire',
    groupe: 'Référence',
    resume: 'Tous les mots du langage, avec leurs variantes et un exemple.',
  },
  {
    chemin: '/documentation/erreurs',
    titre: 'Les messages d’erreur',
    groupe: 'Référence',
    resume: 'Chaque message du compilateur, expliqué, avec comment le corriger.',
  },
];

export const GROUPES: readonly string[] = [...new Set(SOMMAIRE.map((e) => e.groupe))];

/** Pages voisines d'une page de la documentation, pour les liens « précédent / suivant ». */
export function voisines(chemin: string): { precedente?: EntreeSommaire; suivante?: EntreeSommaire } {
  const i = SOMMAIRE.findIndex((e) => e.chemin === chemin);
  if (i < 0) return {};
  return { precedente: SOMMAIRE[i - 1], suivante: SOMMAIRE[i + 1] };
}
