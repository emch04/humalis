/**
 * Les exemples en plusieurs fichiers (« utiliser fichier "…" »). Comme les
 * exemples d'un seul fichier, ce sont des DONNÉES, compilées par le vrai
 * compilateur (`compilerProjet`) dans `tests/projets.test.ts`.
 *
 * Le premier fichier est le fichier principal ; les autres sont lus quand il
 * les utilise. `attendu` décrit l'erreur que le projet doit produire.
 */
export interface ProjetExemple {
  id: string;
  fichiers: { nom: string; code: string }[];
  attendu?: { fichier?: string; ligne: number; contient: string };
}

/** Retire la ligne vide de début et de fin. */
const bloc = (texte: string): string => texte.replace(/^\n/, '').replace(/\n\s*$/, '');

export const PROJETS: readonly ProjetExemple[] = [
  {
    id: 'boutique-et-panier',
    fichiers: [
      {
        nom: 'boutique.humalis',
        code: bloc(`
utiliser fichier "./panier.humalis"

page "boutique" :
    titre "Nos produits"
    bouton "Ajouter un livre"
    quand l'utilisateur clique sur "Ajouter un livre" :
        ajouter "Livre" à panier
    lien "Voir le panier" vers "panier"
`),
      },
      {
        nom: 'panier.humalis',
        code: bloc(`
variable panier = [] avec partagee

page "panier" :
    titre "Ton panier"
    pour chaque nom dans panier :
        texte nom
    lien "Retour à la boutique" vers "boutique"
`),
      },
    ],
  },
  {
    id: 'erreur-dans-un-fichier-utilise',
    fichiers: [
      {
        nom: 'boutique.humalis',
        code: bloc(`
utiliser fichier "./panier.humalis"

page "boutique" :
    titre "Nos produits"
`),
      },
      {
        nom: 'panier.humalis',
        code: bloc(`
page "panier" :
    titre "Ton panier"
    texte total
`),
      },
    ],
    attendu: { fichier: 'panier.humalis', ligne: 3, contient: 'la variable « total » n\'est pas déclarée' },
  },
  {
    id: 'fichiers-en-boucle',
    fichiers: [
      {
        nom: 'boutique.humalis',
        code: bloc(`
utiliser fichier "./panier.humalis"

page "boutique" :
    titre "Nos produits"
`),
      },
      {
        nom: 'panier.humalis',
        code: bloc(`
utiliser fichier "./boutique.humalis"

page "panier" :
    titre "Ton panier"
`),
      },
    ],
    attendu: { fichier: 'panier.humalis', ligne: 1, contient: 's\'utilisent en boucle' },
  },
  {
    id: 'page-dans-deux-fichiers',
    fichiers: [
      {
        nom: 'boutique.humalis',
        code: bloc(`
utiliser fichier "./panier.humalis"

page "panier" :
    titre "Mon panier"
`),
      },
      {
        nom: 'panier.humalis',
        code: bloc(`
page "panier" :
    titre "Ton panier"
`),
      },
    ],
    attendu: { fichier: 'panier.humalis', ligne: 1, contient: 'déjà déclarée (ligne 3 de boutique.humalis)' },
  },
];
