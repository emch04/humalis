import boutique from '../../../exemples/boutique.humalis?raw';
import { compiler } from '../../../src/compilateur';
import { genererProjetMobile, MARQUE_MOBILE, VERSIONS_MOBILE } from '../../../src/cibles/mobile/projet';

/**
 * Le projet Expo que le compilateur produit pour `exemples/boutique.humalis`,
 * calculé par `genererProjetMobile` (le vrai générateur) : les extraits de la
 * page « Ton application mobile » suivent toujours le compilateur.
 */
const { application } = compiler(boutique);
if (!application) throw new Error('exemples/boutique.humalis ne compile plus');

export const FICHIERS_MOBILE: ReadonlyMap<string, string> = genererProjetMobile(application, {
  nom: 'boutique',
  source: 'boutique.humalis',
});

export const CHEMINS_MOBILE: readonly string[] = [...FICHIERS_MOBILE.keys()].sort();

export const MARQUE_PROJET_MOBILE = MARQUE_MOBILE;

/** La version d'Expo des projets produits (« 57.0.29 »). */
export const VERSION_EXPO = VERSIONS_MOBILE.expo;

/** Le code React Native produit pour la page « boutique » (la page d'entrée). */
export const PAGE_MOBILE: string = FICHIERS_MOBILE.get('app/index.tsx') ?? '';
