/** Messages d'un projet à plusieurs services : comptes partagés, appels d'un service à l'autre, messages. */
import type { EntreeErreur, GroupeErreur } from './erreurs';

/** Trois services qui se parlent : il ne signale rien. Chaque entrée en change une ligne. */
const PROJET = `serveur "comptes" :
    roles gerant
    donnee annonce :
        texte : texte
    route "annonces" :
        tout le monde peut lire annonce
        seul admin peut modifier annonce

serveur "catalogue" :
    comptes du serveur "comptes"
    donnee produit :
        nom : texte
        stock : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
        connecte peut faire "reserver" sur produit avec quantite : nombre :
            changer produit.stock par produit.stock - quantite
        le serveur "commandes" peut faire "reserver" sur produit
    quand le serveur "commandes" signale "commande-validee" avec c :
        noter c.quantite

serveur "commandes" :
    comptes du serveur "comptes"
    donnee commande :
        produit : texte
        quantite : nombre
    route "commandes" :
        tout le monde peut lire commande
        seul admin peut modifier commande
        connecte peut faire "valider" sur commande :
            envoyer requete vers "produits" du serveur "catalogue" avec id commande.produit dans produit
            faire "reserver" sur produit du serveur "catalogue" avec quantite = commande.quantite
            signaler "commande-validee" avec commande

page "accueil" :
    titre "Accueil"`;

/** Un seul serveur, pour les messages qui disent qu'il n'y en a qu'un. */
const SEUL = `serveur "boutique" :
    donnee commande :
        total : nombre
    route "commandes" :
        tout le monde peut lire commande
        seul admin peut modifier commande

page "accueil" :
    titre "Accueil"`;

const changer = (avant: string, apres: string, source = PROJET): string => {
  if (!source.includes(avant)) throw new Error('catalogue des services : « ' + avant + ' » introuvable');
  return source.replace(avant, apres);
};

const LIGNE_VALIDER = '            signaler "commande-validee" avec commande';
const TACHE = '    tous les jours a 7 h :\n        pour chaque c dans commande :\n';

const entree = (id: string, groupe: GroupeErreur, titre: string, explication: string, correction: string, fautif: string, corrige: string, motif: string, options: { sites?: number; gravite?: 'erreur' | 'avertissement'; atteignable?: boolean } = {}): EntreeErreur => ({
  id,
  groupe,
  titre,
  explication,
  correction,
  fautif,
  corrige,
  motif,
  gravite: options.gravite ?? 'erreur',
  sites: options.sites ?? 1,
  atteignable: options.atteignable ?? true,
});

export const ENTREES_ERREURS_SERVICES: EntreeErreur[] = [
  // La grammaire.
  entree('comptes-du-serveur-double', 'grammaire', '« comptes du serveur » écrit deux fois', 'Un service prend ses comptes chez un seul autre service.', 'Garde une seule ligne « comptes du serveur "…" ».', changer('    comptes du serveur "comptes"\n    donnee produit', '    comptes du serveur "comptes"\n    comptes du serveur "comptes"\n    donnee produit'), PROJET, '« comptes du serveur » est déjà écrit'),
  entree('receveur-sans-signale', 'grammaire', 'Un message reçu sans « signale »', 'Un message reçu s’écrit : quand le serveur "…" signale "…" avec c :', 'Écris « signale » après le nom du service.', changer('quand le serveur "commandes" signale "commande-validee"', 'quand le serveur "commandes" envoie "commande-validee"'), PROJET, 'on écrit : quand le serveur'),
  entree('receveur-sans-avec', 'grammaire', 'Un message reçu sans le nom de sa fiche', 'La fiche reçue prend un nom, après « avec », pour être lue dans les lignes qui suivent.', 'Ajoute « avec c » avant les deux-points.', changer('signale "commande-validee" avec c :', 'signale "commande-validee" :'), PROJET, '« avec » et le nom de la fiche reçue'),
  entree('droit-service-sans-peut', 'grammaire', 'Un droit de service sans « peut »', 'Le droit d’un autre service s’écrit comme celui d’une personne : le serveur "commandes" peut lire produit.', 'Écris « peut » après le nom du service.', changer('le serveur "commandes" peut faire', 'le serveur "commandes" fait'), PROJET, 'on écrit : le serveur "commandes" peut lire produit'),
  entree('droit-service-faire-sans-sur', 'grammaire', 'Un droit d’action sans « sur »', 'Une action vise une donnée : le serveur "commandes" peut faire "reserver" sur produit.', 'Ajoute « sur » et la donnée.', changer('peut faire "reserver" sur produit\n    quand', 'peut faire "reserver" produit\n    quand'), PROJET, 'peut faire "reserver" sur produit'),
  entree('droit-service-avec-corps', 'grammaire', 'Un droit d’action avec un corps', 'Le droit d’un service donne une action déjà écrite dans la route ; il n’a ni deux-points ni lignes à lui.', 'Retire les deux-points et les lignes en dessous.', changer('le serveur "commandes" peut faire "reserver" sur produit\n', 'le serveur "commandes" peut faire "reserver" sur produit :\n            refuser "Non"\n'), PROJET, 'sans deux-points ni corps'),
  entree('droit-service-action-inconnue', 'grammaire', 'Un droit de service sur une action qui n’existe pas', 'Après « peut », on écrit lire, creer, modifier, supprimer, ou faire "…" sur ….', 'Écris une des actions possibles.', changer('le serveur "commandes" peut faire "reserver" sur produit', 'le serveur "commandes" peut vendre produit'), PROJET, 'n\'est pas une action. Actions possibles'),
  entree('appel-service-sans-id', 'grammaire', 'Une fiche d’un autre service lue sans identifiant', 'Un serveur lit une fiche d’un autre service par son identifiant : avec id ….', 'Ajoute « avec id » et la valeur.', changer('du serveur "catalogue" avec id commande.produit dans produit', 'du serveur "catalogue" dans produit'), PROJET, 'par son identifiant'),
  entree('appel-service-sans-dans', 'grammaire', 'Une fiche d’un autre service lue sans nom', 'La fiche lue prend un nom, après « dans », pour les lignes qui suivent.', 'Ajoute « dans » et un nom.', changer('avec id commande.produit dans produit', 'avec id commande.produit'), PROJET, '« dans » et le nom de la fiche lue'),
  entree('faire-service-sans-sur', 'grammaire', 'Une action d’un autre service sans « sur »', 'Une action vise une fiche : faire "reserver" sur produit du serveur "catalogue".', 'Ajoute « sur » et la fiche.', changer('faire "reserver" sur produit du serveur', 'faire "reserver" produit du serveur'), PROJET, 'on écrit : faire "reserver" sur produit du serveur'),
  entree('faire-service-sans-serveur', 'grammaire', 'Une action sans le service qui la fait', 'Sur le serveur, « faire » demande une action à un autre service du projet : il faut le nommer.', 'Ajoute « du serveur "…" » après la fiche.', changer('faire "reserver" sur produit du serveur "catalogue" avec', 'faire "reserver" sur produit avec'), PROJET, 'vise une action d\'un autre service'),
  entree('signaler-sans-avec', 'grammaire', 'Un message sans fiche', 'Un message emporte une fiche : signaler "commande-validee" avec commande.', 'Ajoute « avec » et la fiche.', changer(LIGNE_VALIDER, '            signaler "commande-validee"'), PROJET, '« avec » et la fiche envoyée'),

  // Le sens.
  entree('service-inconnu', 'sens', 'Un service qui n’existe pas dans le projet', 'Le nom écrit ne correspond à aucun bloc « serveur » du projet.', 'Écris le nom d’un des serveurs du projet.', changer('du serveur "catalogue" avec id', 'du serveur "catalog" avec id'), PROJET, 'n\'existe pas dans le projet', { sites: 5 }),
  entree('service-lui-meme', 'sens', 'Un service qui s’appelle lui-même', '« du serveur "…" » vise un autre service ; ses propres fiches, un service les lit et les change directement.', 'Lis la donnée directement, sans « du serveur ».', changer('avec id commande.produit dans produit', 'avec id commande.id dans produit', changer('envoyer requete vers "produits" du serveur "catalogue"', 'envoyer requete vers "commandes" du serveur "commandes"')).replace('            faire "reserver" sur produit du serveur "catalogue" avec quantite = commande.quantite\n', ''), PROJET, 'vise un autre service'),
  entree('route-distante-inconnue', 'sens', 'Une route qu’un autre service n’a pas', 'Le service nommé n’a pas de route à cette adresse.', 'Écris une des routes de ce service.', changer('envoyer requete vers "produits" du serveur', 'envoyer requete vers "articles" du serveur'), PROJET, 'n\'a pas de route « articles »'),
  entree('appel-service-sans-droit', 'sens', 'Une lecture sans personne et sans droit', 'Dans une tâche ou un message reçu, personne n’est connecté : le service lit en son propre nom, et l’autre service doit le lui permettre.', 'Ajoute dans la route de l’autre service : le serveur "…" peut lire ….', changer('page "accueil"', TACHE + '            envoyer requete vers "produits" du serveur "catalogue" avec id c.produit dans p\n            noter p.nom\n\npage "accueil"'), changer('page "accueil"', TACHE + '            envoyer requete vers "produits" du serveur "catalogue" avec id c.produit dans p\n            noter p.nom\n\npage "accueil"', changer('        le serveur "commandes" peut faire "reserver" sur produit\n', '        le serveur "commandes" peut faire "reserver" sur produit\n        le serveur "commandes" peut lire produit\n')), 'personne n\'est connecté : le serveur « commandes » lit'),
  entree('faire-service-fiche-inconnue', 'sens', 'Une action sur une fiche inconnue', 'La fiche visée par « faire » doit avoir été lue avant, ou être la fiche de l’action.', 'Lis d’abord la fiche, ou corrige son nom.', changer('faire "reserver" sur produit du serveur', 'faire "reserver" sur article du serveur'), PROJET, '« article » n\'existe pas ici'),
  entree('faire-service-autre-donnee', 'sens', 'Une action sur une fiche d’un autre service', 'Une action d’un service vise une de ses fiches à lui ; une fiche d’ici ne lui appartient pas.', 'Lis d’abord la fiche chez ce service (envoyer requete … du serveur … dans …).', changer('faire "reserver" sur produit du serveur', 'faire "reserver" sur commande du serveur'), PROJET, 'qui n\'est pas au serveur « catalogue »'),
  entree('faire-service-action-inconnue', 'sens', 'Une action qu’un autre service n’a pas', 'Le service nommé n’a pas d’action de ce nom sur cette donnée.', 'Écris une des actions de ce service.', changer('faire "reserver" sur produit du serveur', 'faire "vendre" sur produit du serveur'), PROJET, 'n\'a pas d\'action « vendre »'),
  entree('faire-service-valeur-en-trop', 'sens', 'Une valeur que l’action n’attend pas', 'Une action reçoit seulement les valeurs déclarées après « avec », dans sa route.', 'Retire la valeur, ou ajoute-la à l’action.', changer('avec quantite = commande.quantite', 'avec quantite = commande.quantite et remise = 2'), PROJET, 'n\'attend pas « remise »'),
  entree('faire-service-valeur-manquante', 'sens', 'Une valeur attendue qui manque', 'L’action déclare des valeurs : chacune doit être donnée.', 'Ajoute la valeur après « avec ».', changer(' avec quantite = commande.quantite', ''), PROJET, 'attend « quantite »'),
  entree('faire-service-sans-droit', 'sens', 'Une action sans personne et sans droit', 'Dans une tâche ou un message reçu, personne n’est connecté : le service agit en son propre nom, et l’autre service doit le lui permettre.', 'Ajoute dans la route de l’autre service : le serveur "…" peut faire "…" sur ….', changer('        le serveur "commandes" peut faire "reserver" sur produit\n', '', changer('page "accueil"', TACHE + '            envoyer requete vers "produits" du serveur "catalogue" avec id c.produit dans p\n            faire "reserver" sur p du serveur "catalogue" avec quantite = 1\n\npage "accueil"', changer('        le serveur "commandes" peut faire "reserver" sur produit\n', '        le serveur "commandes" peut faire "reserver" sur produit\n        le serveur "commandes" peut lire produit\n'))).replace('            faire "reserver" sur produit du serveur "catalogue" avec quantite = commande.quantite\n', ''), changer('page "accueil"', TACHE + '            envoyer requete vers "produits" du serveur "catalogue" avec id c.produit dans p\n            faire "reserver" sur p du serveur "catalogue" avec quantite = 1\n\npage "accueil"', changer('        le serveur "commandes" peut faire "reserver" sur produit\n', '        le serveur "commandes" peut faire "reserver" sur produit\n        le serveur "commandes" peut lire produit\n')), 'personne n\'est connecté : le serveur « commandes » fait'),
  entree('signaler-fiche-inconnue', 'sens', 'Un message avec une fiche inconnue', 'Un message emporte une fiche connue à cet endroit.', 'Écris le nom d’une fiche de l’action.', changer(LIGNE_VALIDER, '            signaler "commande-validee" avec achat'), PROJET, 'on signale une fiche'),
  entree('signaler-un-seul-serveur', 'sens', 'Un message dans un projet à un seul serveur', '« signaler » parle aux autres services du projet ; avec un seul serveur, il n’y a personne à qui parler.', 'Retire « signaler », ou ajoute le service qui écoute.', changer('        seul admin peut modifier commande', '        seul admin peut modifier commande\n        connecte peut faire "valider" sur commande :\n            signaler "commande-validee" avec commande', SEUL), changer('        seul admin peut modifier commande', '        seul admin peut modifier commande\n        connecte peut faire "valider" sur commande :\n            refuser "Pas encore"', SEUL), 'il n\'y a qu\'un serveur'),
  entree('fiche-distante-changee', 'sens', 'Une fiche d’un autre service changée ici', 'Une fiche lue chez un autre service ne se change pas ici : elle appartient à ce service.', 'Demande-le à ce service (faire "…" sur … du serveur "…"), ou signale un message.', changer('            faire "reserver" sur produit du serveur "catalogue" avec quantite = commande.quantite', '            changer produit.stock par 0'), PROJET, 'elle ne se change pas ici', { sites: 2 }),
  entree('receveur-lui-meme', 'sens', 'Un service qui s’écoute lui-même', '« quand le serveur "…" signale » nomme un autre service du projet.', 'Nomme le service qui signale le message.', changer('\nserveur "commandes" :', '    quand le serveur "catalogue" signale "inventaire" avec c :\n        noter c.nom\n\nserveur "commandes" :'), PROJET, 'ne s\'écoute pas lui-même', { sites: 0 }),
  entree('receveur-jamais-signale', 'sens', 'Un message que l’autre service ne signale jamais', 'Le service nommé n’écrit nulle part « signaler » avec ce message.', 'Corrige le nom du message, ou ajoute « signaler » dans l’autre service.', changer('\nserveur "commandes" :', '    quand le serveur "commandes" signale "commande-payee" avec c :\n        noter c.quantite\n\nserveur "commandes" :'), PROJET, 'ne signale jamais « commande-payee »'),
  entree('requete-autre-serveur', 'sens', 'Une route nommée avec le mauvais service', '« du serveur "…" » est facultatif dans une page ; s’il est écrit, la route doit être celle de ce service.', 'Retire « du serveur », ou écris le bon service.', changer('page "accueil" :\n    titre "Accueil"', 'page "accueil" :\n    variable produits = []\n    titre "Accueil"\n    quand la page se charge :\n        envoyer requete vers "produits" du serveur "commandes" dans produits\n    pour chaque p dans produits :\n        texte p.nom'), changer('page "accueil" :\n    titre "Accueil"', 'page "accueil" :\n    variable produits = []\n    titre "Accueil"\n    quand la page se charge :\n        envoyer requete vers "produits" du serveur "catalogue" dans produits\n    pour chaque p dans produits :\n        texte p.nom'), 'est celle du serveur « catalogue »'),

  // Les règles du projet.
  entree('comptes-du-serveur-seul', 'sens', '« comptes du serveur » avec un seul serveur', 'Un projet à un seul serveur garde lui-même ses comptes.', 'Retire la ligne.', changer('serveur "boutique" :\n', 'serveur "boutique" :\n    comptes du serveur "comptes"\n', SEUL), SEUL, 'le projet n\'a qu\'un serveur, qui garde lui-même ses comptes'),
  entree('receveur-seul', 'sens', 'Un message reçu avec un seul serveur', 'Il n’y a pas d’autre service pour envoyer ce message.', 'Retire ce bloc, ou ajoute le service qui signale.', changer('\npage "accueil"', '    quand le serveur "commandes" signale "x" avec c :\n        noter c.total\n\npage "accueil"', SEUL), SEUL, 'signale … » : le projet n\'a qu\'un serveur'),
  entree('droit-service-seul', 'sens', 'Un droit de service avec un seul serveur', 'Il n’y a pas d’autre service à qui donner ce droit.', 'Retire la ligne.', changer('        seul admin peut modifier commande', '        seul admin peut modifier commande\n        le serveur "caisse" peut lire commande', SEUL), SEUL, 'peut … » : le projet n\'a qu\'un serveur'),
  entree('service-double', 'sens', 'Deux services du même nom', 'Chaque service a son nom : il nomme son dossier, ses variables et ses messages.', 'Donne un autre nom à l’un des deux.', changer('\npage "accueil"', '\nserveur "commandes" :\n    comptes du serveur "comptes"\n\npage "accueil"'), PROJET, 'est déjà déclaré (ligne'),
  entree('route-double-services', 'sens', 'Une route dans deux services', 'Une adresse appartient à un seul service : le relais « entree » envoie chaque route au service qui l’a.', 'Donne un autre nom à l’une des deux routes.', changer('    route "annonces" :', '    route "produits" :'), PROJET, 'est déjà celle du serveur « comptes »'),
  entree('donnee-double-services', 'sens', 'Une donnée dans deux services', 'Une donnée appartient à un seul service ; un autre service la lit chez lui.', 'Donne un autre nom à l’une des deux, ou lis-la chez l’autre service.', changer('    donnee annonce :\n        texte : texte\n    route "annonces" :\n        tout le monde peut lire annonce\n        seul admin peut modifier annonce', '    donnee produit :\n        texte : texte\n    route "annonces" :\n        tout le monde peut lire produit\n        seul admin peut modifier produit'), PROJET, 'est déjà celle du serveur « comptes » : une donnée appartient'),
  entree('aucun-gardien', 'sens', 'Aucun service ne garde les comptes', 'Chaque serveur prend ses comptes chez un autre : l’un d’eux doit les garder.', 'Retire « comptes du serveur » du service qui garde les comptes.', changer('serveur "comptes" :\n', 'serveur "comptes" :\n    comptes du serveur "catalogue"\n'), PROJET, 'l\'un d\'eux doit garder les comptes'),
  entree('plusieurs-gardiens', 'sens', 'Deux services qui gardent leurs comptes', 'Dans un projet en services, un seul service garde les comptes ; les autres écrivent « comptes du serveur "…" ».', 'Écris dans l’autre service : comptes du serveur "…".', changer('serveur "commandes" :\n    comptes du serveur "comptes"\n', 'serveur "commandes" :\n'), PROJET, 'gardent chacun leurs comptes : un seul service'),
  entree('comptes-chez-soi', 'sens', 'Un service qui prend ses comptes chez lui-même', '« comptes du serveur » nomme le service qui garde les comptes.', 'Nomme le service des comptes.', changer('serveur "catalogue" :\n    comptes du serveur "comptes"', 'serveur "catalogue" :\n    comptes du serveur "catalogue"'), PROJET, 'ne prend pas ses comptes chez lui-même'),
  entree('comptes-chez-un-autre-dependant', 'sens', 'Des comptes pris chez un service qui ne les garde pas', 'Le service nommé prend lui-même ses comptes ailleurs.', 'Nomme le service qui garde les comptes.', changer('serveur "commandes" :\n    comptes du serveur "comptes"', 'serveur "commandes" :\n    comptes du serveur "catalogue"'), PROJET, 'ne garde pas de comptes : il les prend chez'),
  entree('comptes-pas-le-gardien', 'sens', 'Des comptes pris chez un autre que le gardien', 'Un seul service garde les comptes : les autres les prennent chez lui.', 'Nomme le service qui garde les comptes.', PROJET, PROJET, 'les comptes sont gardés par', { atteignable: false }),
  entree('compte-hors-gardien', 'sens', 'Un réglage des comptes hors du service des comptes', 'La connexion, l’inscription, les rôles, la double authentification, le temps réel, les e-mails aux admins et les notifications lisent les comptes : ils s’écrivent dans le service qui les garde.', 'Déplace la ligne dans le service des comptes.', changer('serveur "catalogue" :\n    comptes du serveur "comptes"', 'serveur "catalogue" :\n    comptes du serveur "comptes"\n    double authentification'), PROJET, 's\'écrit dans le serveur qui garde les comptes'),
  entree('droit-service-soi', 'sens', 'Un service qui se donne un droit à lui-même', 'Un service a déjà tous les droits sur ses propres données.', 'Nomme un autre service, ou retire la ligne.', changer('le serveur "commandes" peut faire "reserver" sur produit', 'le serveur "catalogue" peut faire "reserver" sur produit'), PROJET, 'a déjà tous les droits sur ses propres données'),
  entree('droit-service-donnee', 'sens', 'Un droit de service sur une autre donnée', 'Une route sert une donnée : le droit d’un service vise cette donnée.', 'Écris la donnée de la route.', changer('le serveur "commandes" peut faire "reserver" sur produit', 'le serveur "commandes" peut lire commande'), PROJET, 'sert « produit », pas « commande »'),
  entree('droit-service-faire-inconnu', 'sens', 'Un droit sur une action que la route n’a pas', 'Le droit d’action d’un service vise une action écrite dans la route.', 'Écris le nom d’une action de la route.', changer('le serveur "commandes" peut faire "reserver" sur produit', 'le serveur "commandes" peut faire "vendre" sur produit'), PROJET, 'n\'a pas d\'action « vendre ». Actions'),
  entree('message-sans-ecoute', 'avertissement', 'Un message que personne n’écoute', 'Aucun service du projet n’écrit « quand le serveur … signale … » pour ce message : il ne part nulle part.', 'Ajoute un « quand le serveur … signale … » dans le service qui doit le recevoir, ou retire « signaler ».', changer('    quand le serveur "commandes" signale "commande-validee" avec c :\n        noter c.quantite\n', ''), PROJET, 'personne n\'écoute « commande-validee »', { gravite: 'avertissement' }),
];
