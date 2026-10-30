import boutique from '../../../exemples/boutique.humalis?raw';
import { compiler } from '../../../src/compilateur';
import carte from '../../../exemples/composants/Carte.tsx?raw';
import hote from '../../../essais/react-hote/src/main.tsx?raw';
import { genererComposantsWeb, genererProjetWeb, MARQUE } from '../../../src/cibles/web/projet';

/**
 * Le projet web que le compilateur produit pour `exemples/boutique.humalis`,
 * calculé par `genererProjetWeb` (le vrai générateur) : l'extrait affiché sur
 * la page « Créer ton site web » ne peut donc pas mentir.
 */
const { application } = compiler(boutique);
if (!application) throw new Error('exemples/boutique.humalis ne compile plus');

export const FICHIERS_BOUTIQUE: ReadonlyMap<string, string> = genererProjetWeb(application, {
  nom: 'boutique',
  adresse: 'https://boutique.example',
  source: 'boutique.humalis',
});

export const CHEMINS_BOUTIQUE: readonly string[] = [...FICHIERS_BOUTIQUE.keys()].sort();

export const MARQUE_PROJET = MARQUE;

/** Le code React produit pour la page « boutique ». */
export const PAGE_BOUTIQUE: string = FICHIERS_BOUTIQUE.get('src/pages/Boutique.tsx') ?? '';

/**
 * Le mode `--composants` (seulement les pages et leurs outils, pour un
 * projet React existant), calculé par `genererComposantsWeb` : le vrai
 * générateur, avec les mêmes options que `humalis compile … --composants`.
 */
export const FICHIERS_COMPOSANTS_BOUTIQUE: ReadonlyMap<string, string> = genererComposantsWeb(application, {
  nom: 'boutique',
  adresse: 'http://localhost',
  source: 'boutique.humalis',
});

export const CHEMINS_COMPOSANTS_BOUTIQUE: readonly string[] = [...FICHIERS_COMPOSANTS_BOUTIQUE.keys()].sort();

/** `humalis/racine.tsx` : le composant `HumalisRacine`. */
export const RACINE_COMPOSANTS: string = FICHIERS_COMPOSANTS_BOUTIQUE.get('humalis/racine.tsx') ?? '';

/** Le `LISEZMOI.md` écrit à côté des pages. */
export const LISEZMOI_COMPOSANTS: string = FICHIERS_COMPOSANTS_BOUTIQUE.get('LISEZMOI.md') ?? '';

/** Le projet React écrit à la main de `essais/react-hote/`, qui importe ces pages (vérifié par `npm run essai:react-hote`). */
export const PROJET_REACT_HOTE: string = hote;

/** Le composant React écrit à la main que `exemples/vitrine.humalis` utilise. */
export const CARTE_REACT: string = carte;
