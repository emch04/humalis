import boutique from '../../../exemples/boutique.humalis?raw';
import connexion from '../../../exemples/connexion.humalis?raw';
import vitrine from '../../../exemples/vitrine.humalis?raw';
import boutiqueServeur from '../../../exemples/boutique-serveur.humalis?raw';
import boutiqueComplete from '../../../exemples/boutique-complete.humalis?raw';
import catalogue from '../../../exemples/catalogue.humalis?raw';
import gestion from '../../../exemples/gestion.humalis?raw';
import { diagnostiquer, envelopper } from './verification';

export { envelopper };

/**
 * Tous les exemples de la documentation sont des DONNÉES, vérifiées par le
 * compilateur dans `tests/exemples.test.ts`. Un exemple faux, ou jamais
 * utilisé dans une page, fait échouer les tests.
 *
 * - `programme` : une page complète, compilée sans aucune erreur ;
 * - `fragment`  : une suite d'instructions, enveloppée dans une page pour la
 *                 vérification seulement, compilée sans aucune erreur ;
 * - `erreur`    : un programme volontairement faux, qui doit produire
 *                 l'erreur annoncée ;
 * - `refus-web` : un programme que le langage accepte mais que la cible web refuse
 *                 (`humalis compile`), avec le message annoncé ;
 * - `avertissement` : un programme accepté, qui doit produire l'avertissement annoncé.
 */
export interface Exemple {
  id: string;
  code: string;
  mode: 'programme' | 'fragment' | 'erreur' | 'avertissement' | 'refus-web';
  /** Pour `erreur`, `avertissement` et `refus-web` : la ligne et un morceau du message attendu. */
  attendu?: { ligne: number; contient: string };
  /** Pour `programme` : l'exemple est accepté mais le compilateur lui fait une remarque (avertissement). */
  tolere?: string;
}

const programme = (id: string, code: string): Exemple => ({ id, code, mode: 'programme' });
const fragment = (id: string, code: string): Exemple => ({ id, code, mode: 'fragment' });
const erreur = (id: string, code: string, ligne: number, contient: string): Exemple => ({
  id, code, mode: 'erreur', attendu: { ligne, contient },
});
const avertissement = (id: string, code: string, ligne: number, contient: string): Exemple => ({
  id, code, mode: 'avertissement', attendu: { ligne, contient },
});

const refusWeb = (id: string, code: string, ligne: number, contient: string): Exemple => ({
  id, code, mode: 'refus-web', attendu: { ligne, contient },
});

/** Retire l'indentation commune et les lignes vides de début et de fin. */
const bloc = (texte: string): string => texte.replace(/^\n/, '').replace(/\n\s*$/, '');

/** Le serveur partagé par les exemples du lien écran ↔ serveur : 14 lignes, une ligne vide, puis la page. */
const lien = (page: string): string =>
  bloc(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    donnee avis :
        note : nombre
        commentaire : texte
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
    route "avis" :
        tout le monde peut lire avis
        connecte peut creer avis
        seul admin peut modifier avis
`) + '\n\n' + bloc(page);

export const EXEMPLES: readonly Exemple[] = [
  // Vitrine et prise en main : les vrais fichiers du dépôt, jamais recopiés.
  programme('accueil-vitrine', boutique.trimEnd()),
  programme('fichier-connexion', connexion.trimEnd()),
  programme('composants-vitrine', vitrine.trimEnd()),
  programme('lien-complet', boutiqueComplete.trimEnd()),
  programme('lien-gestion', gestion.trimEnd()),
  programme('lien-catalogue', catalogue.trimEnd()),
  { ...programme('serveur-boutique', boutiqueServeur.trimEnd()), tolere: 'personne ne peut modifier' },

  // Pages
  programme('pages-simple', bloc(`
page "accueil" :
    titre "Bienvenue sur mon site"
`)),
  programme('pages-deux', bloc(`
page "accueil" :
    titre "Bienvenue"
    lien "Nous contacter" vers "contact"

page "contact" :
    texte "Contacte-nous ici"
`)),
  erreur('pages-doublon', bloc(`
page "accueil" :
    titre "Bienvenue"

page "accueil" :
    texte "Une deuxième fois"
`), 4, 'est déjà déclarée'),

  // Éléments
  programme('elements-titre-texte', bloc(`
page "accueil" :
    titre "Bienvenue"
    texte "Ceci est la page d'accueil"
    tableau "Exemples" :
        colonnes "Élément"
        rangee "texte"
`)),
  programme('elements-soustitre', bloc(`
page "carte" :
    titre "La carte"
    soustitre "Les plats"
    texte "Poisson braisé, pondu, chikwangue."
    soustitre "Les boissons" avec niveau 3
    texte "Jus de gingembre, bissap."
`)),
  programme('elements-image', bloc(`
page "profil" :
    image "photo_profil.png" avec description "Photo de profil"
`)),
  programme('elements-bouton', bloc(`
page "contact" :
    texte "Une question ?"
    bouton "Envoyer"
`)),
  programme('elements-lien', bloc(`
page "accueil" :
    lien "En savoir plus" vers "apropos"

page "apropos" :
    titre "À propos"
`)),
  programme('elements-champ', bloc(`
page "connexion" :
    champ "email"
    bouton "Se connecter"
`)),
  programme('elements-sortes', bloc(`
page "inscription" :
    formulaire "inscription" :
        champ "Nom" avec obligatoire
        champ email "Email" avec indice "vous@exemple.cd"
        champ telephone "Téléphone"
        champ nombre "Âge" avec minimum 0 et maximum 130
        champ date "Naissance"
        champ heure "Heure d'appel"
        champ mot de passe "Mot de passe"
        champ texte long "Présentation"
        champ adresse web "Site"
        bouton "S'inscrire"
    quand le formulaire "inscription" est soumis :
        afficher "Bienvenue"
`)),
  programme('elements-choix', bloc(`
page "commande" :
    variable pays = ["Congo", "Belgique", "France"]
    formulaire "commande" :
        choix "Taille" parmi ["S", "M", "L"] avec obligatoire
        liste deroulante "Pays" parmi pays avec indice "Choisissez un pays"
        case a cocher "J'accepte les conditions" avec obligatoire
        bouton "Commander"
    quand le formulaire "commande" est soumis :
        si champ "Taille" est egal a "L" :
            afficher "Grande taille"
        afficher "Commande envoyée"
`)),
  erreur('elements-option-mal-placee', bloc(`
page "paiement" :
    champ "Nom" avec minimum 2
`), 2, 's’applique à un champ nombre'),

  // Styles et noms
  fragment('styles-titre', 'titre "Bienvenue" avec couleur bleu et taille grande'),
  fragment('styles-bouton', 'bouton "Valider" avec fond vert et texte blanc'),
  fragment('styles-position', 'titre "Titre" avec position centrée'),
  fragment('styles-bordure', 'bouton "Annuler" avec fond gris et bordure arrondie'),
  programme('styles-classe', bloc(`
style :
    .grand { font-size: 3rem; }
    .principal { border: 2px solid navy; }

page "accueil" :
    titre "Bienvenue" avec style "grand"
    bouton "Valider" avec fond vert et style "principal"
`)),
  programme('styles-fichier', bloc(`
utiliser style "./theme.css"

page "accueil" :
    titre "Bienvenue" avec style "grand"
`)),
  avertissement('styles-classe-inconnue', bloc(`
style :
    .grand { font-size: 3rem; }

page "accueil" :
    titre "Bienvenue" avec style "grnad"
`), 5, 'n\'est définie dans aucun bloc style'),
  erreur('styles-classe-sans-guillemets', bloc(`
page "accueil" :
    titre "Bienvenue" avec style grand
`), 2, 'il manque le nom de la classe CSS entre guillemets'),
  programme('styles-nom', bloc(`
page "connexion" :
    champ "email"
    bouton "Se connecter" avec fond vert et nom "connexion"
    quand l'utilisateur clique sur "connexion" :
        afficher "Connexion en cours"
`)),
  erreur('styles-valeur-manquante', bloc(`
page "accueil" :
    titre "Bienvenue" avec couleur
`), 2, 'une valeur est attendue pour le style'),

  erreur('styles-valeur-inconnue', bloc(`
page "accueil" :
    titre "Bienvenue" avec couleur pourpre
`), 2, 'n\'est pas une valeur possible'),

  // Événements
  programme('evenements-clic', bloc(`
page "connexion" :
    bouton "Se connecter"
    quand l'utilisateur clique sur "Se connecter" :
        afficher "Connexion en cours"
`)),
  programme('evenements-survol', bloc(`
page "produit" :
    image "produit.png" avec description "Le produit"
    quand l'utilisateur survole "produit.png" :
        afficher "Aperçu du produit"
`)),
  programme('evenements-chargement', bloc(`
page "accueil" :
    quand la page se charge :
        afficher "Chargement terminé"
`)),
  programme('evenements-formulaire', bloc(`
page "contact" :
    formulaire "message" :
        champ email "Email" avec obligatoire
        champ texte long "Message"
        bouton "Envoyer"
    quand le formulaire "message" est soumis :
        afficher "Message envoyé"
`)),
  programme('evenements-plusieurs', bloc(`
page "accueil" :
    titre "Bienvenue"
    bouton "Commencer"
    quand la page se charge :
        afficher "Prêt"
    quand l'utilisateur clique sur "Commencer" :
        afficher "C'est parti"
`)),

  // Actions
  programme('actions-afficher', bloc(`
page "accueil" :
    bouton "Dire bonjour"
    quand l'utilisateur clique sur "Dire bonjour" :
        afficher "Bonjour !"
`)),
  programme('actions-montrer-cacher', bloc(`
page "accueil" :
    bouton "Menu"
    texte "Accueil, Produits, Contact" avec nom "menu_deroulant"
    bouton "Fermer"
    quand l'utilisateur clique sur "Menu" :
        montrer "menu_deroulant"
    quand l'utilisateur clique sur "Fermer" :
        cacher "menu_deroulant"
`)),
  programme('actions-changer-texte', bloc(`
page "produit" :
    texte "Un livre." avec nom "description"
    bouton "Voir plus"
    quand l'utilisateur clique sur "Voir plus" :
        changer texte de "description" par "Un livre de 200 pages, illustré."
`)),
  programme('actions-rediriger', bloc(`
page "accueil" :
    lien "Accueil" vers "accueil"
    bouton "Commencer"
    quand l'utilisateur clique sur "Commencer" :
        rediriger vers "bienvenue"

page "bienvenue" :
    titre "Bienvenue !"
`)),
  programme('actions-afficher-erreur', bloc(`
page "connexion" :
    champ "email"
    bouton "Se connecter"
    quand l'utilisateur clique sur "Se connecter" :
        si le champ "email" est vide :
            afficher erreur "Email requis"
        sinon :
            afficher "Connexion réussie"
`)),
  erreur('actions-hors-evenement', bloc(`
page "accueil" :
    texte "Bonjour" avec nom "message"
    cacher "message"
`), 3, 'ne s\'utilise que dans un événement'),

  // Variables
  programme('variables-declarations', bloc(`
page "profil" :
    variable note = 12
    variable nom_utilisateur = "Camille"
    variable connecte = faux
    variable panier_vide = vrai
`)),
  programme('variables-interpolation', bloc(`
page "accueil" :
    variable nom_utilisateur = "Camille"
    titre "Bonjour {nom_utilisateur} !"
`)),
  programme('variables-changer', bloc(`
page "compteur" :
    variable clics = 0
    texte "Tu as cliqué {clics} fois"
    bouton "Remettre à zéro"
    quand l'utilisateur clique sur "Remettre à zéro" :
        changer clics par 0
`)),
  programme('variables-litteral', bloc(`
page "accueil" :
    variable nom = "Awa"
    texte "nom"
    texte nom
`)),
  erreur('variables-non-declaree', bloc(`
page "accueil" :
    texte message
`), 2, 'n\'est pas déclarée'),
  erreur('variables-deja-declaree', bloc(`
page "accueil" :
    variable clics = 0
    variable clics = 1
`), 3, 'existe déjà'),

  // Conditions
  programme('conditions-si-sinon', bloc(`
page "resultat" :
    variable note = 8
    si note est inférieure à 10 :
        afficher "Échec"
    sinon :
        afficher "Réussite"
`)),
  programme('conditions-vrai', bloc(`
page "accueil" :
    variable connecte = faux
    texte "Mon espace" avec nom "menu_utilisateur"
    bouton "Se connecter" avec nom "bouton_connexion"
    quand la page se charge :
        si connecte est vrai :
            montrer "menu_utilisateur"
        sinon :
            montrer "bouton_connexion"
`)),
  programme('conditions-age', bloc(`
page "acces" :
    variable age = 22
    si age est supérieur ou égal à 18 :
        afficher "Accès autorisé"
    sinon :
        afficher "Accès refusé"
`)),
  programme('conditions-egal', bloc(`
page "produit" :
    variable stock = 0
    titre "Détail du produit"
    si stock est égal à 0 :
        afficher "Rupture de stock"
    sinon :
        bouton "Ajouter au panier"
`)),
  programme('conditions-sans-accent', bloc(`
page "resultat" :
    variable note = 8
    si note est inferieure a 10 :
        afficher "Échec"
`)),
  programme('conditions-vide', bloc(`
page "panier" :
    variable panier = []
    si panier est vide :
        afficher "Le panier est vide"
`)),
  erreur('conditions-comparaison-inconnue', bloc(`
page "resultat" :
    variable note = 8
    si note est petite :
        afficher "Échec"
`), 3, 'comparaison inconnue'),

  // Listes et boucles
  programme('listes-simple', bloc(`
page "produits" :
    variable produits = ["Pomme", "Banane", "Orange"]
    pour chaque nom dans produits :
        texte nom
`)),
  programme('listes-style', bloc(`
page "classe" :
    variable eleves = ["Marie", "Jean", "Awa"]
    pour chaque nom dans eleves :
        texte nom avec couleur bleu
`)),
  programme('listes-vide', bloc(`
page "panier" :
    variable panier = []
    si panier est vide :
        afficher "Le panier est vide"
    sinon :
        pour chaque nom dans panier :
            afficher nom
`)),
  programme('listes-notes', bloc(`
page "resultats" :
    variable notes = [8, 14, 11]
    pour chaque note dans notes :
        si note est inférieure à 10 :
            afficher "Échec pour {note}"
        sinon :
            afficher "Réussite pour {note}"
`)),
  erreur('listes-hors-boucle', bloc(`
page "produits" :
    variable produits = ["Pomme", "Banane"]
    pour chaque nom dans produits :
        texte nom
    texte nom
`), 5, 'n\'existe que dans la boucle'),

  // Calculs
  programme('calculs-compteur', bloc(`
page "compteur" :
    variable clics = 0
    texte "Clics : {clics}"
    bouton "Ajouter un clic"
    quand l'utilisateur clique sur "Ajouter un clic" :
        changer clics par clics + 1
`)),
  programme('calculs-priorite', bloc(`
page "panier" :
    variable prix = 12
    variable quantite = 3
    variable total = (prix + 2) * quantite
    texte "Total : {total}"
`)),
  programme('calculs-recalcul', bloc(`
page "panier" :
    variable prix = 12
    calcul total = prix * 2
    bouton "Plus cher"
    texte "Total : {total}"
    quand l'utilisateur clique sur "Plus cher" :
        changer prix par prix + 1
`)),
  erreur('calculs-texte', bloc(`
page "accueil" :
    variable nom = "Awa"
    variable total = nom + 1
`), 3, 'calcule avec des nombres'),
  erreur('calculs-division-zero', bloc(`
page "accueil" :
    variable moitie = 4 / 0
`), 2, 'division par zéro'),

  // Modifier une liste
  programme('listes-ajouter-retirer', bloc(`
page "panier" :
    variable panier = []
    bouton "Ajouter une pomme"
    bouton "Retirer la pomme"
    quand l'utilisateur clique sur "Ajouter une pomme" :
        ajouter "Pomme" à panier
    quand l'utilisateur clique sur "Retirer la pomme" :
        retirer "Pomme" de panier
`)),
  programme('listes-nombre', bloc(`
page "panier" :
    variable panier = ["Livre", "Stylo"]
    variable total = nombre de panier
    si total est supérieur à 1 :
        afficher "Plusieurs articles : {total}"
`)),
  erreur('listes-type', bloc(`
page "accueil" :
    variable notes = [8, 14]
    quand la page se charge :
        ajouter "un" à notes
`), 4, 'on ne peut pas y ajouter'),
  programme('evenements-boucle', bloc(`
page "produits" :
    variable produits = ["Livre", "Stylo"]
    pour chaque nom dans produits :
        texte nom
        bouton "Acheter"
        quand l'utilisateur clique sur "Acheter" :
            afficher "Tu as acheté {nom}"
`)),
  erreur('evenements-boucle-hors', bloc(`
page "produits" :
    variable produits = ["Livre", "Stylo"]
    bouton "Fermer"
    pour chaque nom dans produits :
        texte nom
        quand l'utilisateur clique sur "Fermer" :
            afficher nom
`), 6, 'n’est pas dans cette boucle'),
  programme('evenements-dans-un-si', bloc(`
page "compteur" :
    variable clics = 0
    texte "Clics : {clics}"
    si clics est inferieur a 3 :
        bouton "Encore"
        quand l'utilisateur clique sur "Encore" :
            changer clics par clics + 1
    sinon :
        bouton "Recommencer"
        quand l'utilisateur clique sur "Recommencer" :
            changer clics par 0
`)),
  erreur('evenements-dans-un-evenement', bloc(`
page "accueil" :
    bouton "Valider"
    bouton "Annuler"
    quand l'utilisateur clique sur "Valider" :
        quand l'utilisateur clique sur "Annuler" :
            afficher "Annulé"
`), 5, 'ne se place pas dans un autre événement'),

  // La mise en page : section, bloc, ligne, colonne, grille
  programme('mise-en-page-section', bloc(`
page "accueil" :
    titre "Le Fleuve"
    section "Notre maison" :
        texte "Une cuisine de famille, au bord du fleuve."
        ligne :
            lien "Voir la carte" vers "accueil"
            lien "Réserver" vers "accueil"
`)),
  programme('mise-en-page-grille', bloc(`
page "carte" :
    variable plats = ["Poisson braisé", "Liboke", "Pondu"]
    titre "La carte"
    grille :
        pour chaque plat dans plats :
            bloc :
                texte plat
                bouton "Choisir"
                quand l'utilisateur clique sur "Choisir" :
                    afficher "{plat} : bon choix"
`)),
  programme('mise-en-page-colonne', bloc(`
page "contact" :
    colonne :
        texte "Mardi à dimanche"
        texte "12 h – 15 h et 19 h – 23 h"
`)),
  programme('mise-en-page-css', bloc(`
style :
    .plats { grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); }
    .fiche { padding: 1rem; border-radius: 1rem; background: #f7f2ea; }

page "carte" :
    variable plats = ["Poisson braisé", "Liboke"]
    grille avec style "plats" :
        pour chaque plat dans plats :
            bloc avec style "fiche" :
                texte plat
`)),

  // La mise en page et le style : réglages, appareils, thème, en-tête et pied
  programme('reglages-blocs', bloc(`
page "carte" :
    section "Nos plats" avec largeur large et remplissage grande :
        grille avec colonnes 3 et espacement moyenne :
            bloc avec ombre legere et bordure douce et remplissage moyenne :
                texte "Poisson braisé"
            bloc avec ombre legere et bordure douce et remplissage moyenne :
                texte "Liboke de capitaine"
    ligne avec repartition entre et alignement centre :
        lien "Accueil" vers "carte"
        bouton "Réserver"
`)),
  programme('degrade-colle', bloc(`
page "accueil" :
    bloc avec degrade bleu vers violet et remplissage grande :
        titre "Réservez" avec texte blanc
    bloc avec colle et fond blanc :
        texte "Cette ligne reste en haut pendant le défilement."
`)),
  programme('par-appareil', bloc(`
page "accueil" :
    sur telephone :
        bouton "Menu"
    sur tablette ou ordinateur :
        ligne :
            lien "La carte" vers "accueil"
            lien "Réserver" vers "accueil"
`)),
  programme('theme', bloc(`
theme :
    couleur marque clair "#0e5a6b" sombre "#5fc3d6"
    couleur sable "#f3e9d2"
    police titres "Georgia"
    mode automatique
    largeur large

page "accueil" :
    titre "Le Fleuve" avec couleur marque
    bouton "Réserver" avec fond sable et couleur marque
    bouton "Mode sombre"
    quand l'utilisateur clique sur "Mode sombre" :
        changer theme par sombre
`)),
  programme('entete-pied', bloc(`
entete avec colle :
    ligne avec repartition entre :
        lien "Le Fleuve" vers "accueil"
        lien "La carte" vers "carte"

pied :
    texte "Ouvert de mardi à dimanche"

page "accueil" :
    titre "Bienvenue"

page "carte" :
    titre "La carte"

page "connexion" sans entete et sans pied :
    titre "Connexion"
`)),

  // Les éléments d'écran
  programme('elements-icones', bloc(`
page "accueil" :
    icone "panier" avec taille grande et description "Panier"
    bouton "Ajouter au panier" avec icone "plus"
    lien "Réserver" vers "accueil" avec icone "calendrier"
`)),
  programme('elements-petits', bloc(`
page "profil" :
    variable envoi = 40
    badge "Nouveau" avec fond vert
    avatar "Camille Martin"
    progression envoi avec pourcentage et maximum 100
    chargement "Chargement des plats…"
    code qr "https://lefleuve.cd/reservation" avec taille petite et description "Votre billet"
`)),
  programme('elements-note-compteur', bloc(`
page "plat" :
    variable note = 3
    variable quantite = 1
    calcul total = quantite * 28000
    etoiles note avec modifiable
    compteur quantite avec minimum 1 et maximum 10 et description "Quantité"
    texte "Total : {total} FC"
`)),
  programme('elements-onglets', bloc(`
page "plat" :
    onglets :
        onglet "Description" avec icone "document" :
            texte "Poisson braisé, riz et banane plantain."
        onglet "Avis" :
            texte "Un régal."
`)),
  programme('elements-accordeon', bloc(`
page "aide" :
    deroulant "Comment réserver ?" :
        texte "Choisissez une date, puis envoyez le formulaire."
    accordeon :
        deroulant "Annulation" avec ouvert :
            texte "Jusqu'à 24 heures avant."
        deroulant "Paiement" :
            texte "Sur place."
`)),
  programme('elements-carrousel', bloc(`
page "accueil" :
    carrousel avec automatique 5 et visibles 1 :
        image "salle.jpg" avec description "La salle du restaurant"
        image "terrasse.jpg" avec description "La terrasse au bord du fleuve"
        bloc :
            titre "Menu du jour"
`)),
  programme('elements-fil', bloc(`
page "carte" :
    texte "La carte"

page "plat" :
    fil d'Ariane :
        lien "Accueil" vers "carte"
        lien "La carte" vers "carte"
        texte "Poisson braisé"
`)),

  // Le format français des nombres et des dates
  programme('format-nombre', bloc(`
page "devis" :
    variable prix = 14000
    variable quantite = 2
    calcul total = prix * quantite
    texte "Total : {total} FC"
    calcul par_personne = total / 3
    texte "Par personne : {par_personne} FC"
`)),

  // Requêtes
  programme('requetes-lecture', bloc(`
page "catalogue" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "/produits" dans produits
    pour chaque nom dans produits :
        texte nom
`)),
  programme('requetes-envoi', bloc(`
page "inscription" :
    champ "email"
    bouton "S'inscrire"
    quand l'utilisateur clique sur "S'inscrire" :
        si le champ "email" est vide :
            afficher erreur "Email requis"
        sinon :
            envoyer requete vers "/inscription" avec le champ "email"
            afficher "Merci !"
`)),
  erreur('requetes-hors-evenement', bloc(`
page "catalogue" :
    variable produits = []
    envoyer requete vers "/produits" dans produits
`), 3, 'ne s\'utilise que dans un événement'),

  // Partager entre les pages
  programme('partage-panier', bloc(`
variable panier = [] avec partagee

page "boutique" :
    calcul nombre_articles = nombre de panier
    texte "Articles : {nombre_articles}"
    bouton "Ajouter un livre"
    quand l'utilisateur clique sur "Ajouter un livre" :
        ajouter "Livre" à panier
    lien "Voir le panier" vers "panier"

page "panier" :
    titre "Ton panier"
    pour chaque nom dans panier :
        texte nom
    lien "Retour" vers "boutique"
`)),
  programme('partage-memorisee', bloc(`
variable panier = [] avec partagee et memorisee

page "boutique" :
    variable visites = 0 avec memorisee
    texte "Tu es venu {visites} fois."
    texte "Articles : {panier}"
    bouton "Compter ma visite"
    quand l'utilisateur clique sur "Compter ma visite" :
        changer visites par visites + 1
`)),
  erreur('partage-sans-option', bloc(`
variable panier = []

page "boutique" :
    texte "{panier}"
`), 1, 'ajoutez « avec partagee »'),
  erreur('partage-dans-une-page', bloc(`
page "boutique" :
    variable panier = [] avec partagee
    texte "{panier}"
`), 2, 'se déclare en haut du fichier'),
  refusWeb('partage-secret', bloc(`
page "connexion" :
    variable jeton = "" avec memorisee en secret
    texte "Connecté"
`), 2, "« memorisee en secret » n'existe pas sur le web"),

  // Composants
  programme('composants-carte', bloc(`
utiliser composant "Carte" depuis "./composants/Carte"

page "accueil" :
    variable prix_minimum = 2
    Carte avec titre "Fournitures scolaires" et prix prix_minimum
    Carte
`)),
  programme('composants-fiche', bloc(`
composant "Fiche" :
    parametre nom
    parametre prix
    texte nom
    texte "{prix} €"

page "boutique" :
    Fiche avec nom "Livre" et prix 12
    Fiche avec nom "Stylo" et prix 2
`)),
  avertissement('composants-parametre-oublie', bloc(`
composant "Fiche" :
    parametre nom
    parametre prix
    texte nom
    texte "{prix} €"

page "boutique" :
    Fiche avec nom "Livre"
`), 8, 'le paramètre « prix » du composant « Fiche » n\'est pas donné'),
  erreur('composants-inconnu', bloc(`
page "accueil" :
    Crate avec titre "Fournitures"
`), 2, 'n\'est pas déclaré'),
  erreur('composants-minuscule', bloc(`
composant "fiche" :
    texte "Une fiche"

page "accueil" :
    titre "Accueil"
`), 1, 'commence par une majuscule'),
  erreur('composants-propriete-inconnue', bloc(`
composant "Fiche" :
    parametre nom
    texte nom

page "accueil" :
    Fiche avec couleur "rouge"
`), 6, 'n\'est pas un paramètre du composant'),

  // Principes
  programme('principes-liaison-avec', bloc(`
page "accueil" :
    bouton "Valider"
    quand l'utilisateur clique sur "Valider" :
        afficher "Merci"
`)),
  programme('principes-liaison-sans', bloc(`
page "accueil" :
    bouton "Valider"
    quand utilisateur clique sur "Valider" :
        afficher "Merci"
`)),
  programme('principes-accents', bloc(`
page "acces" :
    variable age = 22
    si age est supérieur ou égal à 18 :
        afficher "Accès autorisé"
    si age est superieur ou egal a 18 :
        afficher "Accès autorisé"
`)),
  programme('principes-commentaires', bloc(`
# La page d'accueil du site
page "accueil" :
    titre "Article #1"    # le # entre guillemets reste du texte
`)),
  avertissement('principes-contextuel', bloc(`
page "accueil" :
    variable titre = "Mon site"
    variable menu = "Accueil"
    titre titre
    texte menu
`), 2, "porte le nom d'un mot du langage"),
  erreur('principes-reserve', bloc(`
page "accueil" :
    variable si = 3
`), 2, 'est un mot réservé'),
  erreur('principes-variable-a', bloc(`
page "accueil" :
    variable a = 1
`), 2, 'est un petit mot ignoré par Humalis'),
  erreur('principes-indentation', bloc(`
page "accueil" :
   titre "Bienvenue"
`), 2, 'indentation incohérente'),

  // Le serveur
  programme('serveur-minimal', bloc(`
serveur "carnet" :
    donnee note :
        titre : texte
        contenu : texte
    route "notes" :
        tout le monde peut lire note
        seul admin peut modifier note
`)),
  programme('serveur-champs', bloc(`
serveur "bibliotheque" :
    donnee livre :
        titre : texte
        pages : nombre
        disponible : booleen
        parution : date
        auteurs : liste de texte
    route "livres" :
        tout le monde peut lire livre
        seul admin peut modifier livre
`)),
  programme('serveur-qui', bloc(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        connecte peut creer produit
        seul admin peut modifier produit
`)),
  programme('serveur-modifier-couvre', bloc(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`)),
  programme('serveur-droits-precis', bloc(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        connecte peut creer produit
        seul admin peut modifier et supprimer produit
`)),
  avertissement('serveur-porte-fermee', bloc(`
serveur "boutique" :
    donnee avis :
        note : nombre
    route "avis" :
        connecte peut creer avis
`), 4, 'personne ne peut lire, modifier, supprimer'),
  programme('serveur-et-page', bloc(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit

page "accueil" :
    titre "Bienvenue dans la boutique"
    variable produits = []
    quand la page se charge :
        envoyer requete vers "/api/produits" dans produits
    pour chaque produit dans produits :
        texte "Un produit"
`)),
  erreur('serveur-type-inconnu', bloc(`
serveur "boutique" :
    donnee produit :
        prix : argent
    route "produits" :
        tout le monde peut lire produit
`), 3, "n'est pas un type de champ"),

  // Relier les pages au serveur (étape 4)
  erreur('lien-champ-inconnu', lien(`
page "boutique" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" dans produits
    pour chaque p dans produits :
        texte p.prixx
`), 21, 'le champ « prixx » n\'existe pas dans la donnée « produit »'),
  erreur('lien-type', lien(`
page "boutique" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" dans produits
    pour chaque p dans produits :
        si p.nom est superieur a 10 :
            texte "cher"
`), 21, '« p.nom » est un texte'),
  erreur('lien-route-inconnue', lien(`
page "boutique" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produit" dans produits
`), 19, 'aucune route « produit »'),
  erreur('lien-champ-envoye', lien(`
page "avis" :
    variable note = 5
    champ "commentair"
    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer requete vers "avis" avec note et champ "commentair"
`), 21, 'n\'a pas de champ « commentair »'),
  erreur('lien-type-envoye', lien(`
page "avis" :
    variable note = "cinq"
    champ "commentaire"
    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer requete vers "avis" avec note et champ "commentaire"
`), 21, '« note » est un texte ; le champ « note » de « avis » attend un nombre'),
  avertissement('lien-visiteur', lien(`
page "avis" :
    variable note = 5
    champ "commentaire"
    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer requete vers "avis" avec note et champ "commentaire"
`), 21, 'cette requête sera refusée à un visiteur'),
];
