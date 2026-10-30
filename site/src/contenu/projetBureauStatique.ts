import boutique from '../../../exemples/boutique.humalis?raw';
import { compiler } from '../../../src/compilateur';
import { genererProjetDesktop, VERSIONS_DESKTOP } from '../../../src/cibles/desktop/projet';
import { genererProjetStatique } from '../../../src/cibles/statique/projet';

/**
 * Les projets desktop et statique que le compilateur produit pour
 * `exemples/boutique.humalis`, calculés par les vrais générateurs : les
 * extraits des pages « Ton application de bureau » et « Ton site statique »
 * suivent toujours le compilateur.
 */
const { application } = compiler(boutique);
if (!application) throw new Error('exemples/boutique.humalis ne compile plus');

const DESKTOP: ReadonlyMap<string, string> = genererProjetDesktop(application, { nom: 'boutique', source: 'boutique.humalis' });
const STATIQUE: ReadonlyMap<string, string> = genererProjetStatique(application, { nom: 'boutique', source: 'boutique.humalis' });

/** Les fichiers propres au bureau : tout le reste est le projet web, recopié. */
export const CHEMINS_DESKTOP: readonly string[] = [...DESKTOP.keys()].filter((f) => f.startsWith('electron/') || !f.startsWith('src/')).sort();
export const VERSION_ELECTRON = VERSIONS_DESKTOP.electron;

export const CHEMINS_STATIQUE: readonly string[] = [...STATIQUE.keys()].sort();
/** La page « boutique » du site statique : son HTML de départ, lisible sans JavaScript. */
export const HTML_STATIQUE: string = STATIQUE.get('index.html') ?? '';
/** Le script de la page « boutique », écrit en clair. */
export const SCRIPT_STATIQUE: string = STATIQUE.get('pages/boutique.js') ?? '';
