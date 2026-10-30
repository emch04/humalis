/**
 * L’état honnête du projet, tel que le dit CONTRIBUER.md (tableau
 * « Comment ça marche »). Un test relit ce fichier et signale tout écart.
 */
export interface LigneEtat {
  nom: string;
  /** Le libellé de la ligne dans le tableau du README. */
  readme: string;
  fait: boolean;
  detail: string;
}

export const ETAT: readonly LigneEtat[] = [
  { nom: 'Lexer', readme: 'Lexer', fait: true, detail: 'Découpe ton programme en mots, gère les accents et l’indentation.' },
  { nom: 'Parser', readme: 'Parser', fait: true, detail: 'Comprend la forme des phrases et construit un arbre.' },
  {
    nom: 'Analyse',
    readme: 'Analyse, représentation intermédiaire',
    fait: true,
    detail: 'Vérifie le sens : variables déclarées, éléments visés, types simples, place des instructions.',
  },
  {
    nom: 'Représentation intermédiaire',
    readme: 'Analyse, représentation intermédiaire',
    fait: true,
    detail: 'Un arbre neutre, sans plateforme, que liront les cibles.',
  },
  { nom: 'Commande humalis verifier', readme: 'Commande `humalis verifier`', fait: true, detail: 'Vérifie un fichier .humalis depuis le terminal.' },
  {
    nom: 'Extension VS Code',
    readme: 'Extension VS Code',
    fait: true,
    detail:
      'Erreurs soulignées, coloration, survol (la fiche de chaque mot), complétion, saut à la déclaration ; un serveur de langage (LSP) pour les autres éditeurs. À essayer à la main dans VS Code, rien n’est publié.',
  },
  {
    nom: 'Cible web (React, prérendue)',
    readme: 'Cible web (React, prérendue)',
    fait: true,
    detail: 'Un projet Vite + React lisible, une page HTML prérendue par adresse ; vérifié dans un vrai navigateur.',
  },
  {
    nom: 'Commande humalis compile',
    readme: 'Commande `humalis compile`',
    fait: true,
    detail: 'Produit le projet de la cible web, mobile, desktop, serveur ou statique (--cible).',
  },
  {
    nom: 'Interop React',
    readme: 'Interop React',
    fait: true,
    detail:
      'Des pages Humalis dans un projet React (--composants), et des composants React dans Humalis (utiliser composant) ; vérifié dans un vrai navigateur.',
  },
  {
    nom: 'Cible serveur (Node + packs Astratra)',
    readme: 'Cible serveur (Node + packs Astratra)',
    fait: true,
    detail: 'Données, routes et règles d’accès ; la sécurité vient des packs Astratra. Le serveur produit démarre, et ses règles sont testées.',
  },
  {
    nom: 'Lien écran ↔ serveur (vérifié à la compilation)',
    readme: 'Lien écran ↔ serveur (vérifié à la compilation)',
    fait: true,
    detail: 'Les pages lisent les données de leur serveur (p.prix) ; une route ou un champ inconnu est refusé avant le lancement.',
  },
  {
    nom: 'Connexion depuis une page',
    readme: 'Connexion depuis une page (packs Astratra)',
    fait: true,
    detail: 'se connecter, se deconnecter, si utilisateur est connecte : la session reste le cookie HttpOnly des packs Astratra.',
  },
  {
    nom: 'Mises à jour des packs Astratra',
    readme: 'Mises à jour des packs Astratra (`humalis packs`)',
    fait: true,
    detail: 'humalis packs compare les packs du compilateur à npm ; humalis packs --verifier dit si une application produite est en retard.',
  },
  {
    nom: 'Cible mobile (Expo)',
    readme: 'Cible mobile (Expo)',
    fait: true,
    detail: 'Un projet Expo pour iPhone et Android. Essayé dans le simulateur iPhone : panier partagé entre les pages, navigation.',
  },
  {
    nom: 'Cible desktop (Electron)',
    readme: 'Cible desktop (Electron)',
    fait: true,
    detail: 'Les pages du web dans une fenêtre Electron, avec un menu en français. Lancée et pilotée sur Mac et sous Linux, application Mac construite comprise.',
  },
  {
    nom: 'Cible statique (HTML, CSS, JavaScript)',
    readme: 'Cible statique (HTML, CSS, JavaScript)',
    fait: true,
    detail: 'Un site sans framework ni construction : une page HTML lisible sans JavaScript par page, et un petit script écrit en clair ; vérifié dans un vrai navigateur.',
  },
];

export interface EtapeCible {
  cible: string;
  etape: number;
  /** La cible existe-t-elle, et a-t-elle été vérifiée ? */
  disponible: boolean;
  /** Le « terminée quand… » de la feuille de route. */
  termineeQuand: string;
  /** Ce critère est-il vérifié en vrai ? (Une cible peut être disponible avant que son critère soit essayé.) */
  terminee: boolean;
  description: string;
}

/** Les cibles de la feuille de route. Les cibles web, serveur, mobile, desktop et statique existent. */
export const CIBLES: readonly EtapeCible[] = [
  {
    cible: 'Web',
    etape: 1,
    disponible: true,
    description: 'Un projet Vite + React en TypeScript lisible, prérendu, que tu peux reprendre à la main.',
    termineeQuand: 'exemples/boutique.humalis et connexion.humalis tournent dans un navigateur.',
    terminee: true,
  },
  {
    cible: 'Serveur',
    etape: 3,
    disponible: true,
    description: 'Node et les packs Astratra, pour la connexion, les droits et les données.',
    termineeQuand: 'un exemple avec données, routes et règles démarre, et ses règles d’accès sont testées.',
    terminee: true,
  },
  {
    cible: 'Mobile',
    etape: 5,
    disponible: true,
    description: 'Expo (React Native), pour iPhone et Android : --cible mobile. Essayée dans le simulateur iPhone.',
    termineeQuand: 'la boutique tourne dans le simulateur iPhone.',
    terminee: true,
  },
  {
    cible: 'Desktop',
    etape: 6,
    disponible: true,
    description: 'Electron : la cible web dans une fenêtre, --cible desktop. Lancée et pilotée sur Mac et sous Linux.',
    termineeQuand: 'la boutique tourne en application Mac.',
    terminee: true,
  },
  {
    cible: 'Statique',
    etape: 7,
    disponible: true,
    description: 'HTML, CSS et JavaScript écrit en clair, sans framework ni construction : --cible statique. Chaque page est lisible sans JavaScript.',
    termineeQuand: 'la boutique sort en site statique.',
    terminee: true,
  },
];
