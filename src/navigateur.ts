/**
 * Le compilateur pour un navigateur (le bac à sable du site public) :
 * regroupé en un seul fichier, `dist/navigateur.js`, par `npm run build`.
 * Il compile un programme et produit son site statique, sans rien lire sur le disque.
 */
export { compiler } from './compilateur.js';
export { genererProjetStatique } from './cibles/statique/projet.js';
