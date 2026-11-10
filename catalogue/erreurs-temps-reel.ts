/**
 * Les messages du temps réel : discussions, appels, réunions. Rangés à part et ajoutés à la fin du
 * catalogue (`erreurs.ts`). Comme partout : le site affiche le message que produit le compilateur.
 */
import type { EntreeErreur, GroupeErreur } from './erreurs';

const e = (id: string, groupe: GroupeErreur, titre: string, explication: string, correction: string, fautif: string, corrige: string, motif: string): EntreeErreur => ({
  id, groupe, titre, explication, correction, fautif, corrige, motif, gravite: 'erreur', sites: 1, atteignable: true,
});

const PAGE = 'page "accueil" :\n    titre "Accueil"';
const S = (lignes: string, fin = PAGE) => `serveur "agence" :\n    roles client et agent\n${lignes}\n\n${fin}`;
const AVEC = (corps: string) => `${PAGE}\n${corps}`;
const CLIC = (ligne: string) => AVEC(`    bouton "Go"\n    quand l'utilisateur clique sur "Go" :\n        ${ligne}`);
const D = '    discussion "support" entre client et agent';
const SA = '    salle "conseil" pour client';

export const ENTREES_ERREURS_TEMPS_REEL: EntreeErreur[] = [
  e('discussion-sans-entre', 'grammaire', 'Une discussion sans ses rôles', 'Une discussion dit entre quels rôles elle se fait.', 'Ajoute « entre » et les rôles.', S('    discussion "support"'), S(D), 'il manque « entre » et les rôles'),
  e('discussion-role-manquant', 'grammaire', 'Un rôle oublié', 'Après « entre » ou « pour », il faut au moins un rôle.', 'Écris le nom du rôle.', S('    discussion "support" entre'), S(D), 'il manque le nom d’un rôle'),
  e('discussion-trop-de-roles', 'grammaire', 'Trop de rôles dans une discussion', 'Une discussion oppose deux rôles (une personne et ceux qui lui répondent), ou réunit un seul rôle.', 'Garde un ou deux rôles.', S('    discussion "support" entre client, agent et admin'), S(D), 'une discussion se fait entre un rôle ou deux'),
  e('discussion-double', 'noms', 'Deux discussions du même nom', 'Le nom d’une discussion la désigne dans les pages.', 'Donne-lui un autre nom.', S(`${D}\n${D}`), S(D), 'est déjà écrite : donnez-lui un autre nom'),
  e('salle-sans-pour', 'grammaire', 'Une salle sans ses rôles', 'Une salle dit qui peut y entrer.', 'Ajoute « pour » et les rôles.', S('    salle "conseil"'), S(SA), 'il manque « pour » et les rôles'),
  e('salle-animee-sans-par', 'grammaire', '« animee » sans « par »', 'Une salle animée dit par quels rôles.', 'Écris « animee par » et le rôle.', S('    salle "conseil" pour client animee'), S('    salle "conseil" pour client animee par agent'), 'il manque « par »'),
  e('salle-double', 'noms', 'Deux salles du même nom', 'Le nom d’une salle la désigne dans les pages.', 'Donne-lui un autre nom.', S(`${SA}\n${SA}`), S(SA), 'est déjà écrite : donnez-lui un autre nom'),
  e('temps-reel-composant', 'grammaire', 'Une discussion dans un composant', 'Une discussion lit le serveur au chargement de sa page : un composant n’a pas de chargement à lui.', 'Écris-la dans une page.', S(D, `composant "aide" :\n    discussion "support"\n\n${PAGE}`), S(D, AVEC('    discussion "support"')), 's’écrit dans une page, pas dans un composant'),
  e('ouvrir-discussion-sans-avec', 'grammaire', 'Ouvrir une discussion sans dire avec qui', 'Il faut dire avec quelle personne ouvrir la conversation.', 'Ajoute « avec » et la personne.', S(D, `${AVEC('    discussion "support"\n    bouton "Go"\n    quand l\'utilisateur clique sur "Go" :\n        ouvrir discussion "support"')}`), S(D, `${AVEC('    discussion "support"\n    bouton "Go"\n    quand l\'utilisateur clique sur "Go" :\n        ouvrir discussion "support" avec "compte-1"')}`), 'il manque « avec » et la personne'),
  e('discussion-inconnue', 'noms', 'Une discussion non déclarée', 'Une page ne montre qu’une discussion déclarée dans le serveur.', 'Déclare-la dans le serveur.', S('    donnee note :\n        titre : texte\n    route "notes" :\n        connecte peut lire note', AVEC('    discussion "support"')), S(D, AVEC('    discussion "support"')), 'n’est pas déclarée : écrivez dans le serveur discussion'),
  e('salle-inconnue', 'noms', 'Une salle non déclarée', 'Une page ne montre qu’une salle déclarée dans le serveur.', 'Déclare-la dans le serveur.', S(D, AVEC('    reunion "conseil"')), S(SA, AVEC('    reunion "conseil"')), 'n’est pas déclarée : écrivez dans le serveur salle'),
  e('temps-reel-sans-serveur', 'noms', 'Un appel sans serveur', 'Les appels, les réunions et la présence passent par le serveur.', 'Ajoute un bloc serveur.', CLIC('appeler en video "compte-1"'), S(D, CLIC('appeler en video "compte-1"')), 'passent par le serveur'),
  e('discussion-sans-page', 'noms', 'Ouvrir une discussion qu’aucune page ne montre', '« ouvrir discussion » mène à la page qui montre cette discussion.', 'Écris la discussion dans une page.', S(D, CLIC('ouvrir discussion "support" avec "compte-1"')), S(D, `${AVEC('    discussion "support"\n    bouton "Go"\n    quand l\'utilisateur clique sur "Go" :\n        ouvrir discussion "support" avec "compte-1"')}`), 'aucune page ne montre la discussion'),
  e('reunion-geste-hors-evenement', 'grammaire', 'Un geste de réunion hors d’un événement', 'Couper le micro est une action : elle se fait quand quelque chose arrive.', 'Mets-la dans un événement.', S(SA, AVEC('    couper micro')), S(SA, CLIC('couper micro')), 'ne s\'utilise que dans un événement'),
  e('temps-reel-role-inconnu', 'noms', 'Un rôle non déclaré', 'Une discussion et une salle nomment des rôles déclarés dans le serveur.', 'Déclare le rôle, ou corrige son nom.', S('    discussion "support" entre client et vendeur'), S(D), 'qui n\'est pas déclaré'),
];
