/** Messages propres à « quand une erreur arrive ». */
import type { EntreeErreur } from './erreurs';
const page = 'page "accueil" :\n    titre "Accueil"';
const bonne = 'envoyer requete vers "https://centrale.exemple.fr/v1/envoi" avec message = erreur.message';
const app = (corps: string) => `quand une erreur arrive :\n    ${corps}\n${page}`;
const serveur = (corps: string) => `serveur "api" :\n    quand une erreur arrive :\n        ${corps}\n${page}`;
const entree = (id: string, titre: string, fautif: string, corrige: string, motif: string, sites = 1): EntreeErreur => ({ id, groupe: 'grammaire', titre, explication: titre, correction: 'Corrige la ligne indiquée selon la phrase complète.', fautif, corrige, motif, gravite: 'erreur', sites, atteignable: true });
export const ENTREES_ERREURS_CAPTURE: EntreeErreur[] = [
  entree('capture-double-app', 'Une capture déjà écrite dans l’application', app(bonne) .replace(page, `quand une erreur arrive :\n    ${bonne}\n${page}`), app(bonne), 'est déjà écrit ligne'),
  entree('capture-double-serveur', 'Une capture déjà écrite dans le serveur', serveur(bonne).replace(page, `    quand une erreur arrive :\n        ${bonne}\n${page}`), serveur(bonne), 'est déjà écrit ligne'),
  entree('capture-sans-vers', 'La destination de la requête manque', serveur('envoyer requete "https://centrale.exemple.fr" avec message = erreur.message'), serveur(bonne), 'on écrit : envoyer requete vers'),
  entree('capture-sans-https', 'La requête exige HTTPS', serveur('envoyer requete vers "http://centrale.exemple.fr" avec message = erreur.message'), serveur(bonne), 'adresse HTTPS complète'),
  entree('capture-sans-champs', 'Les champs de la requête manquent', serveur('envoyer requete vers "https://centrale.exemple.fr"'), serveur(bonne), 'demande des champs'),
  entree('capture-champ-inconnu', 'Un champ d’erreur inconnu', serveur('envoyer requete vers "https://centrale.exemple.fr" avec message = erreur.inconnu'), serveur(bonne), 'la capture ne connaît pas'),
  entree('capture-champ-double', 'Un champ envoyé deux fois', serveur('envoyer requete vers "https://centrale.exemple.fr" avec message = erreur.message et message = erreur.pile'), serveur(bonne), 'est envoyé deux fois'),
  entree('capture-champ-secret', 'Un champ sensible envoyé', serveur('envoyer requete vers "https://centrale.exemple.fr" avec password = erreur.message'), serveur(bonne), 'ne peut pas être envoyé'),
  entree('capture-valeur-serveur', 'Une valeur non sûre dans le rapport', serveur('envoyer requete vers "https://centrale.exemple.fr" avec message = 42'), serveur(bonne), 'n’envoie que erreur.message'),
  entree('requete-hors-capture', 'Une requête hors capture', `serveur "api" :\n    tous les jours a 7 h :\n        ${bonne}\n${page}`, serveur(bonne), 's’écrit seulement dans'),
  entree('capture-action-serveur', 'Une action non disponible dans la capture', serveur('refuser "Non"'), serveur(bonne), 'seules les requêtes HTTP'),
];
