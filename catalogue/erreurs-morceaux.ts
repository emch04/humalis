/**
 * Les messages de la lecture d'une liste par morceaux :
 * « envoyer requete vers "produits" par 20 dans produits », « charger la suite de produits »,
 * « produits a une suite ». Rangés à part et ajoutés à la fin du catalogue (`erreurs.ts`).
 * Comme partout : aucun message n'est écrit ici, le site affiche celui que produit le compilateur.
 */
import type { EntreeErreur, GroupeErreur } from './erreurs';

const e = (
  id: string,
  groupe: GroupeErreur,
  titre: string,
  explication: string,
  correction: string,
  fautif: string,
  corrige: string,
  motif: string,
  options: { gravite?: 'erreur' | 'avertissement'; sites?: number; atteignable?: boolean } = {},
): EntreeErreur => ({
  id, groupe, titre, explication, correction, fautif, corrige, motif,
  gravite: options.gravite ?? (groupe === 'avertissement' ? 'avertissement' : 'erreur'),
  sites: options.sites ?? 1,
  atteignable: options.atteignable ?? true,
});

const SERVEUR = ['serveur "boutique" :', '    donnee produit :', '        nom : texte', '    route "produits" :', '        tout le monde peut lire produit', '        seul admin peut creer produit', '        seul admin peut modifier produit', '        seul admin peut supprimer produit', ''];
/** Un serveur, puis une page « accueil » avec la liste « produits » et un bouton « Encore » ; `lignes` sont décalées de quatre espaces. */
const page = (...lignes: string[]) => [...SERVEUR, 'page "accueil" :', '    variable produits = []', '    titre "Accueil"', '    bouton "Encore"', ...lignes.map((l) => `    ${l}`)].join('\n');
const chargement = (...lignes: string[]) => page('quand la page se charge :', ...lignes.map((l) => `    ${l}`));
const BONNE = chargement('envoyer requete vers "produits" par 20 dans produits');
const AVEC_SUITE = page('quand la page se charge :', '    envoyer requete vers "produits" par 20 dans produits', 'quand l\'utilisateur clique sur "Encore" :', '    charger la suite de produits');

export const ENTREES_ERREURS_MORCEAUX: readonly EntreeErreur[] = [
  e('morceau-sans-nombre', 'grammaire', 'Un « par » sans la taille du morceau',
    'Dans une lecture, « par » annonce combien de fiches lire à la fois : il lui faut un nombre.',
    'Écris le nombre de fiches de chaque morceau : par 20.',
    chargement('envoyer requete vers "produits" par dans produits'),
    BONNE,
    'après « par », le nombre de fiches'),
  e('morceau-taille', 'sens', 'Un morceau trop petit, trop grand, ou pas entier',
    'Un morceau compte des fiches : au moins une, au plus 500, et pas la moitié d’une. Au-delà, la page attendrait longtemps une réponse que personne ne lit en entier.',
    'Choisis un nombre entier de 1 à 500 ; 20 convient à la plupart des listes.',
    chargement('envoyer requete vers "produits" par 0 dans produits'),
    BONNE,
    'un morceau compte de 1 à 500 fiches'),
  e('morceau-d-une-source', 'sens', '« par 20 » sur une source',
    'Le serveur de ton fichier sait découper ses listes. Une source est une API écrite par quelqu’un d’autre : chacune a sa façon de donner ses pages.',
    'Lis la source avec ses propres paramètres : filtrant par numero = suivant.',
    ['source "catalogue" :', '    adresse "https://api.exemple.fr"', '    donnee produit :', '        nom : texte', '    route "produits" :', '        lire une liste de produit', '', 'page "accueil" :', '    variable produits = []', '    titre "Accueil"', '    quand la page se charge :', '        envoyer requete vers "produits" de la source "catalogue" par 20 dans produits'].join('\n'),
    ['source "catalogue" :', '    adresse "https://api.exemple.fr"', '    donnee produit :', '        nom : texte', '    route "produits" :', '        lire une liste de produit', '', 'page "accueil" :', '    variable produits = []', '    variable suivant = 1', '    titre "Accueil"', '    quand la page se charge :', '        envoyer requete vers "produits" de la source "catalogue" filtrant par numero = suivant dans produits'].join('\n'),
    'Une source se lit page par page'),
  e('morceau-avec-envoi', 'sens', 'Une lecture par morceaux qui envoie',
    '« par 20 » lit une liste. Avec « avec », la requête envoie une fiche ou lit une seule fiche ; « hors ligne » garde un envoi pour plus tard. Aucun des deux ne se découpe.',
    'Retire « avec » ou « hors ligne », ou retire « par 20 ».',
    page('variable choix = "a"', 'quand la page se charge :', '    envoyer requete vers "produits" par 20 avec choix dans produits'),
    BONNE,
    'une lecture par morceaux lit une liste'),
  e('morceau-sans-liste', 'grammaire', 'Une lecture par morceaux sans liste pour la recevoir',
    'Les fiches lues doivent aller quelque part : la liste que la page affiche, et que « charger la suite » fera grandir.',
    'Ajoute « dans » et le nom de la liste.',
    chargement('envoyer requete vers "produits" par 20'),
    BONNE,
    'il manque « dans » et la liste'),
  e('morceau-en-direct', 'sens', '« par 20 » avec « en direct »',
    '« en direct » relit toute la liste à chaque changement sur le serveur ; « par 20 » n’en lit qu’un morceau. Les deux ensemble feraient disparaître ce que la personne a déjà fait défiler.',
    'Garde « en direct » pour une liste courte, « par 20 » pour une liste longue.',
    chargement('envoyer requete vers "produits" par 20 dans produits en direct'),
    BONNE,
    'il ne va pas avec « par'),
  e('morceau-deux-facons', 'sens', 'La même liste lue par morceaux de deux façons',
    '« charger la suite de produits » continue la lecture de « produits ». Si la page lit cette liste de deux adresses, ou avec deux tailles, il ne sait pas laquelle continuer.',
    'Garde la même adresse et la même taille, ou range la seconde lecture dans une autre liste.',
    page('quand la page se charge :', '    envoyer requete vers "produits" par 20 dans produits', 'quand l\'utilisateur clique sur "Encore" :', '    envoyer requete vers "produits" par 50 dans produits'),
    AVEC_SUITE,
    'de deux façons dans cette page'),
  e('suite-sans-morceaux', 'sens', 'Une suite demandée pour une liste lue d’un coup',
    '« charger la suite de produits » et « produits a une suite » n’ont de sens que si la page lit « produits » par morceaux : sans « par 20 », la liste arrive entière, il n’y a pas de suite.',
    'Lis d’abord la liste par morceaux, dans la même page.',
    page('quand la page se charge :', '    envoyer requete vers "produits" dans produits', 'quand l\'utilisateur clique sur "Encore" :', '    charger la suite de produits'),
    AVEC_SUITE,
    'demande une liste lue par morceaux dans cette page', { sites: 2 }),
  e('suite-sans-nom', 'grammaire', '« charger la suite » sans dire de quelle liste',
    'Une page peut lire plusieurs listes par morceaux : il faut nommer celle qui continue.',
    'Ajoute « de » et le nom de la liste.',
    page('quand la page se charge :', '    envoyer requete vers "produits" par 20 dans produits', 'quand l\'utilisateur clique sur "Encore" :', '    charger la suite'),
    AVEC_SUITE,
    'il manque le nom de la liste'),
  e('morceaux-hors-page', 'sens', 'Une lecture par morceaux hors d’une page',
    'La liste, sa suite et le témoin « a une suite » vivent dans une page : c’est elle qui garde où la lecture s’est arrêtée.',
    'Écris la lecture dans la page, et donne la liste au composant.',
    BONNE,
    BONNE,
    's’écrit dans une page, pas dans un composant', { atteignable: false }),
  e('morceau-hors-serveur', 'sens', '« par 20 » vers une adresse qui n’est pas une route du serveur',
    'C’est le serveur de ton fichier qui découpe la liste. Une adresse d’ailleurs, ou une route qui ne rend pas une liste de fiches, ne promet rien de tel.',
    'Vise une route déclarée dans le bloc « serveur » du fichier.',
    ['page "accueil" :', '    variable produits = []', '    titre "Accueil"', '    quand la page se charge :', '        envoyer requete vers "/produits" par 20 dans produits'].join('\n'),
    BONNE,
    'lit une route du serveur de ce fichier'),
];
