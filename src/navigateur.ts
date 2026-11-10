/**
 * Le compilateur pour un navigateur (le bac à sable du site public) :
 * regroupé en un seul fichier, `dist/navigateur.js`, par `npm run build`.
 * Il compile un programme et produit son site statique, sans rien lire sur le disque.
 */
export { compiler } from './compilateur.js';
export { genererProjetStatique } from './cibles/statique/projet.js';

/**
 * La machine Humalis dans le navigateur : compile un programme, joue son serveur en mémoire et
 * répond aux requêtes d'une iframe d'aperçu par un Service Worker (voir src/machine/apercu.ts).
 */
export { Machine } from './machine/machine.js';
export { brancherApercu, SERVICE_WORKER_JS } from './machine/apercu.js';
