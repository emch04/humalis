/**
 * Les icônes de Humalis (plan 2026-10-30-mise-en-page-et-elements, 5.1) :
 * des noms français, d'une liste fermée, qui désignent chacun une icône de
 * Lucide (https://lucide.dev, licence ISC). Le compilateur ne dépend pas
 * de Lucide : il ne connaît que cette table de noms. Le code produit
 * utilise `lucide-react` (web, desktop) ou `lucide-react-native` (mobile) ;
 * le site statique reçoit les tracés des icônes utilisées
 * (`src/cibles/icones-donnees.ts`, recopiés de Lucide par
 * `scripts/generer-icones.mjs`).
 *
 * Jamais d'émojis : ce sont des dessins vectoriels qui suivent la couleur
 * du texte, donc le thème.
 */

export interface Icone {
  /** Le nom français, tel qu'on l'écrit : `icone "panier"`. */
  nom: string;
  /** Le nom de l'icône dans Lucide (en minuscules, avec des traits d'union). */
  lucide: string;
  /** D'autres façons de l'appeler. */
  alias?: readonly string[];
}

export const ICONES: readonly Icone[] = [
  { nom: 'panier', lucide: 'shopping-cart', alias: ['caddie', 'chariot'] },
  { nom: 'sac', lucide: 'shopping-bag', alias: ['cabas'] },
  { nom: 'maison', lucide: 'house', alias: ['accueil'] },
  { nom: 'recherche', lucide: 'search', alias: ['loupe', 'chercher'] },
  { nom: 'utilisateur', lucide: 'user', alias: ['profil', 'personne', 'compte'] },
  { nom: 'utilisateurs', lucide: 'users', alias: ['equipe', 'groupe'] },
  { nom: 'menu', lucide: 'menu', alias: ['hamburger'] },
  { nom: 'fermer', lucide: 'x', alias: ['croix'] },
  { nom: 'plus', lucide: 'plus', alias: ['ajouter'] },
  { nom: 'moins', lucide: 'minus', alias: ['retirer'] },
  { nom: 'coche', lucide: 'check', alias: ['valider'] },
  { nom: 'etoile', lucide: 'star', alias: ['favori'] },
  { nom: 'demi_etoile', lucide: 'star-half' },
  { nom: 'coeur', lucide: 'heart', alias: ['aimer'] },
  { nom: 'calendrier', lucide: 'calendar', alias: ['date', 'agenda'] },
  { nom: 'horloge', lucide: 'clock', alias: ['heure'] },
  { nom: 'telephone', lucide: 'phone', alias: ['appel'] },
  { nom: 'courrier', lucide: 'mail', alias: ['mail', 'email', 'enveloppe'] },
  { nom: 'lieu', lucide: 'map-pin', alias: ['adresse', 'position'] },
  { nom: 'carte', lucide: 'map', alias: ['plan'] },
  { nom: 'soleil', lucide: 'sun', alias: ['clair'] },
  { nom: 'lune', lucide: 'moon', alias: ['sombre', 'nuit'] },
  { nom: 'fleche_droite', lucide: 'arrow-right' },
  { nom: 'fleche_gauche', lucide: 'arrow-left' },
  { nom: 'fleche_haut', lucide: 'arrow-up' },
  { nom: 'fleche_bas', lucide: 'arrow-down' },
  { nom: 'chevron_droite', lucide: 'chevron-right' },
  { nom: 'chevron_gauche', lucide: 'chevron-left' },
  { nom: 'chevron_haut', lucide: 'chevron-up' },
  { nom: 'chevron_bas', lucide: 'chevron-down' },
  { nom: 'info', lucide: 'info', alias: ['information'] },
  { nom: 'alerte', lucide: 'triangle-alert', alias: ['attention', 'avertissement'] },
  { nom: 'erreur', lucide: 'circle-x' },
  { nom: 'succes', lucide: 'circle-check', alias: ['reussite'] },
  { nom: 'aide', lucide: 'circle-help', alias: ['question'] },
  { nom: 'parametres', lucide: 'settings', alias: ['reglages', 'engrenage'] },
  { nom: 'sortie', lucide: 'log-out', alias: ['deconnexion'] },
  { nom: 'entree', lucide: 'log-in', alias: ['connexion'] },
  { nom: 'cadenas', lucide: 'lock', alias: ['verrou'] },
  { nom: 'cle', lucide: 'key' },
  { nom: 'oeil', lucide: 'eye', alias: ['voir'] },
  { nom: 'oeil_barre', lucide: 'eye-off', alias: ['masquer'] },
  { nom: 'corbeille', lucide: 'trash-2', alias: ['poubelle', 'supprimer'] },
  { nom: 'modifier', lucide: 'pencil', alias: ['crayon', 'editer'] },
  { nom: 'copier', lucide: 'copy' },
  { nom: 'telecharger', lucide: 'download' },
  { nom: 'envoyer', lucide: 'send' },
  { nom: 'partager', lucide: 'share-2' },
  { nom: 'lien', lucide: 'link', alias: ['chaine'] },
  { nom: 'image', lucide: 'image' },
  { nom: 'photo', lucide: 'camera', alias: ['appareil_photo'] },
  { nom: 'video', lucide: 'video', alias: ['camera'] },
  { nom: 'musique', lucide: 'music' },
  { nom: 'livre', lucide: 'book-open', alias: ['lecture'] },
  { nom: 'document', lucide: 'file-text', alias: ['fichier', 'texte'] },
  { nom: 'dossier', lucide: 'folder' },
  { nom: 'filtre', lucide: 'funnel', alias: ['entonnoir'] },
  { nom: 'tri', lucide: 'arrow-up-down', alias: ['trier'] },
  { nom: 'liste', lucide: 'list' },
  { nom: 'grille', lucide: 'layout-grid', alias: ['mosaique'] },
  { nom: 'cloche', lucide: 'bell', alias: ['notification'] },
  { nom: 'message', lucide: 'message-circle', alias: ['bulle'] },
  { nom: 'discussion', lucide: 'messages-square', alias: ['conversation', 'chat'] },
  { nom: 'couverts', lucide: 'utensils', alias: ['restaurant', 'repas'] },
  { nom: 'cafe', lucide: 'coffee', alias: ['the'] },
  { nom: 'vin', lucide: 'wine', alias: ['verre'] },
  { nom: 'poisson', lucide: 'fish' },
  { nom: 'feuille', lucide: 'leaf', alias: ['nature', 'bio'] },
  { nom: 'flamme', lucide: 'flame', alias: ['feu', 'piquant'] },
  { nom: 'goutte', lucide: 'droplet', alias: ['eau'] },
  { nom: 'vagues', lucide: 'waves', alias: ['fleuve', 'mer'] },
  { nom: 'voiture', lucide: 'car', alias: ['auto'] },
  { nom: 'velo', lucide: 'bike' },
  { nom: 'avion', lucide: 'plane' },
  { nom: 'bateau', lucide: 'ship' },
  { nom: 'train', lucide: 'train-front' },
  { nom: 'carte_bancaire', lucide: 'credit-card', alias: ['paiement'] },
  { nom: 'argent', lucide: 'banknote', alias: ['billet'] },
  { nom: 'cadeau', lucide: 'gift' },
  { nom: 'etiquette', lucide: 'tag', alias: ['prix'] },
  { nom: 'recompense', lucide: 'award', alias: ['medaille'] },
  { nom: 'trophee', lucide: 'trophy' },
  { nom: 'eclair', lucide: 'zap', alias: ['rapide'] },
  { nom: 'globe', lucide: 'globe', alias: ['monde', 'langue'] },
  { nom: 'wifi', lucide: 'wifi' },
  { nom: 'batterie', lucide: 'battery' },
  { nom: 'mobile', lucide: 'smartphone', alias: ['smartphone'] },
  { nom: 'ordinateur', lucide: 'monitor', alias: ['ecran'] },
  { nom: 'imprimante', lucide: 'printer', alias: ['imprimer'] },
  { nom: 'micro', lucide: 'mic' },
  { nom: 'son', lucide: 'volume-2', alias: ['haut_parleur'] },
  { nom: 'muet', lucide: 'volume-x' },
  { nom: 'lecture_media', lucide: 'play', alias: ['jouer'] },
  { nom: 'pause', lucide: 'pause' },
  { nom: 'stop', lucide: 'square', alias: ['arreter', 'carre'] },
  { nom: 'rafraichir', lucide: 'refresh-cw', alias: ['actualiser', 'recharger'] },
  { nom: 'plus_cercle', lucide: 'circle-plus' },
  { nom: 'moins_cercle', lucide: 'circle-minus' },
  { nom: 'points', lucide: 'ellipsis', alias: ['plus_options'] },
  { nom: 'points_verticaux', lucide: 'ellipsis-vertical' },
  { nom: 'epingle', lucide: 'pin' },
  { nom: 'drapeau', lucide: 'flag' },
  { nom: 'signet', lucide: 'bookmark', alias: ['marque_page'] },
  { nom: 'ampoule', lucide: 'lightbulb', alias: ['idee'] },
  { nom: 'bouclier', lucide: 'shield', alias: ['securite'] },
];

const normaliser = (texte: string) =>
  texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const parNom = new Map<string, Icone>();
for (const icone of ICONES) {
  parNom.set(icone.nom, icone);
  for (const alias of icone.alias ?? []) parNom.set(alias, icone);
}

/** L'icône que désigne ce nom (ou un de ses alias), sans souci des accents ni des majuscules. */
export function chercherIcone(nom: string): Icone | undefined {
  return parNom.get(normaliser(nom));
}

/** La distance entre deux mots (nombre de lettres à changer), pour proposer une orthographe. */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/** Le nom connu le plus proche d'un nom inconnu, s'il ressemble assez. */
export function iconeProche(nom: string): string | undefined {
  const voulu = normaliser(nom);
  let meilleur: { nom: string; d: number } | undefined;
  for (const connu of parNom.keys()) {
    const d = distance(voulu, connu);
    if (!meilleur || d < meilleur.d) meilleur = { nom: connu, d };
  }
  return meilleur && meilleur.d <= Math.max(1, Math.floor(voulu.length / 4)) ? parNom.get(meilleur.nom)!.nom : undefined;
}

/** Vrai si le texte contient un émoji ou un symbole graphique (interdits : ce sont des icônes qu'on veut). */
export const contientUnEmoji = (texte: string): boolean => /\p{Extended_Pictographic}/u.test(texte);

/** Le nom du composant de lucide-react (`shopping-cart` devient `ShoppingCart`). */
export const composantLucide = (lucide: string): string =>
  lucide
    .split('-')
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1))
    .join('');
