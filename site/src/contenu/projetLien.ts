import boutiqueComplete from '../../../exemples/boutique-complete.humalis?raw';
import { compiler } from '../../../src/compilateur';
import { genererProjetWeb } from '../../../src/cibles/web/projet';

/**
 * Le projet web que le compilateur produit pour `exemples/boutique-complete.humalis`
 * (le serveur et les pages dans le même fichier), calculé par `genererProjetWeb` :
 * les extraits de la page « Relier les pages au serveur » ne peuvent pas mentir.
 */
const { application } = compiler(boutiqueComplete);
if (!application) throw new Error('exemples/boutique-complete.humalis ne compile plus');

const FICHIERS: ReadonlyMap<string, string> = genererProjetWeb(application, {
  nom: 'boutique',
  adresse: 'https://boutique.example',
  source: 'boutique-complete.humalis',
});

/** `vite.config.ts` : le relais de /api et /auth vers le serveur. */
export const VITE_CONFIG_LIEN: string = FICHIERS.get('vite.config.ts') ?? '';

/** `src/humalis/donnees.ts` : une interface par donnée du serveur. */
export const DONNEES_LIEN: string = FICHIERS.get('src/humalis/donnees.ts') ?? '';

/** `src/pages/Boutique.tsx` : la page qui lit les produits. */
export const PAGE_LIEN: string = FICHIERS.get('src/pages/Boutique.tsx') ?? '';
