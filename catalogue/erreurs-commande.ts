/**
 * Messages de la commande elle-même (« humalis compile », « humalis verifier --cible ») : un fichier cherché à côté
 * du programme, une image trop petite, une adresse bloquée. Aucun programme seul ne les produit (ils dépendent du
 * disque ou de la cible) : chaque entrée donne le message tel que la commande l'écrit (`exemple`), qui lui vaut son code.
 */
import type { EntreeErreur, GroupeErreur } from './erreurs';

const PAGE = 'page "accueil" :\n    titre "Accueil"';
const entree = (id: string, groupe: GroupeErreur, gravite: 'erreur' | 'avertissement', titre: string, explication: string, correction: string, exemple: string, motif: string): EntreeErreur => ({
  id,
  groupe,
  titre,
  explication,
  correction,
  fautif: PAGE,
  corrige: PAGE,
  motif,
  gravite,
  sites: 0,
  atteignable: false,
  exemple,
});

export const ENTREES_ERREURS_COMMANDE: EntreeErreur[] = [
  entree('commande-animation-hors-web', 'avertissement', 'avertissement', '« avec animation » sur une cible qui ne l’anime pas', 'Les lignes d’une liste glissent sur le web, Apple et Android ; ailleurs, elles changent sans glisser.', 'Rien à faire : la liste marche, sans le mouvement.', '« avec animation » n\'a d\'effet que sur le web : ici, les lignes changent sans glisser.', 'les lignes changent sans glisser'),
  entree('commande-direct-statique', 'avertissement', 'avertissement', '« en direct » sur le site statique', 'Un site statique n’a pas de serveur qui annonce les changements : la liste est lue une fois.', 'Prends la cible web pour une liste en direct.', '« en direct » n\'a pas d\'effet sur la cible statique : ici, la liste est lue une fois.', 'ici, la liste est lue une fois'),
  entree('commande-sans-adresse', 'avertissement', 'avertissement', 'Un site compilé sans son adresse', 'Le prérendu et le plan du site ont besoin de l’adresse publique du site.', 'Ajoute « --adresse https://… », ou « adresse "https://…" » dans le bloc « site ».', 'sans --adresse, le prérendu et le plan du site utilisent http://localhost.', 'sans --adresse, le prérendu'),
  entree('commande-style-introuvable', 'sens', 'erreur', 'Un fichier de style introuvable', 'Le fichier de « utiliser style » est cherché à côté du programme.', 'Corrige le chemin, ou place le fichier à côté du programme.', 'le fichier de style « styles.css » est introuvable (il est cherché à côté de boutique.humalis).', 'le fichier de style'),
  entree('commande-image-introuvable', 'sens', 'erreur', 'Une image introuvable', 'Une image locale est cherchée à côté du programme.', 'Corrige le chemin, ou place le fichier à côté du programme.', 'l\'image « photo.png » est introuvable (elle est cherchée à côté de boutique.humalis).', 'l\'image «'),
  entree('commande-video-introuvable', 'sens', 'erreur', 'Une vidéo introuvable', 'Une vidéo locale est cherchée à côté du programme.', 'Corrige le chemin, ou place le fichier à côté du programme.', 'la vidéo « film.mp4 » est introuvable (elle est cherchée à côté de boutique.humalis).', 'la vidéo «'),
  entree('commande-son-introuvable', 'sens', 'erreur', 'Un son introuvable', 'Un son local est cherché à côté du programme.', 'Corrige le chemin, ou place le fichier à côté du programme.', 'le son « bip.mp3 » est introuvable (il est cherché à côté de boutique.humalis).', 'le son «'),
  entree('commande-son-lourd', 'avertissement', 'avertissement', 'Un son lourd', 'Au-delà de 10 Mo, un son est long à télécharger sur un téléphone.', 'Réduis le fichier.', 'le son « bip.mp3 » pèse 12 Mo : c\'est lourd à télécharger, surtout sur un téléphone.', 'c\'est lourd à télécharger, surtout sur un téléphone.'),
  entree('commande-video-lourde', 'avertissement', 'avertissement', 'Une vidéo lourde', 'Au-delà de 50 Mo, une vidéo est longue à télécharger sur un téléphone.', 'Réduis le fichier, ou donne l’adresse d’un service vidéo.', 'la vidéo « film.mp4 » pèse 60 Mo : c\'est lourd à télécharger, surtout sur un téléphone. Une adresse vers un service vidéo peut convenir mieux.', 'Une adresse vers un service vidéo peut convenir mieux'),
  entree('commande-logo-introuvable', 'sens', 'erreur', 'Le logo du site introuvable', 'Le logo du bloc « site » est cherché à côté du programme.', 'Corrige le chemin, ou place le fichier à côté du programme.', 'le fichier « logo.svg » (logo du bloc « site ») est introuvable (il est cherché à côté de boutique.humalis).', '(logo du bloc « site ») est introuvable'),
  entree('commande-image-partage-introuvable', 'sens', 'erreur', 'L’image de partage introuvable', 'L’image de partage du bloc « site » est cherchée à côté du programme.', 'Corrige le chemin, ou place le fichier à côté du programme.', 'le fichier « partage.png » (image du bloc « site ») est introuvable (il est cherché à côté de boutique.humalis).', '(image du bloc « site ») est introuvable'),
  entree('commande-logo-petit', 'avertissement', 'avertissement', 'Un logo trop petit ou pas carré', 'Une icône nette demande un carré de 512×512 au moins.', 'Prends un SVG, ou un PNG carré de 512×512 au moins.', 'le logo « logo.png » fait 200×100 : une icône nette demande un carré de 512×512 au moins.', 'une icône nette demande un carré'),
  entree('commande-image-partage-petite', 'avertissement', 'avertissement', 'Une image de partage trop petite', 'Les réseaux sociaux montrent mal une image de partage plus petite que 600×315.', 'Prends une image de 1200×630.', 'l\'image de partage « partage.png » fait 300×200 : les réseaux sociaux la montrent mal en dessous de 600×315 (1200×630 conseillé).', 'les réseaux sociaux la montrent mal'),
  entree('commande-image-lourde', 'avertissement', 'avertissement', 'Une image du site trop lourde', 'Au-delà de 5 Mo, les aperçus de partage risquent d’ignorer l’image.', 'Réduis le fichier.', '« partage.png » pèse plus de 5 Mo : les aperçus de partage risquent de l\'ignorer.', 'les aperçus de partage risquent de l'),
  entree('commande-police-introuvable', 'sens', 'erreur', 'Un fichier de police introuvable', 'Le fichier d’une police du thème est cherché à côté du programme.', 'Corrige le chemin, ou place le fichier à côté du programme.', 'le fichier de police « titres.woff2 » est introuvable (il est cherché à côté de boutique.humalis).', 'le fichier de police'),
  entree('commande-bureau-http', 'avertissement', 'avertissement', 'Une adresse http:// dans l’application de bureau', 'L’application de bureau bloque une adresse http:// (sauf sur cet ordinateur).', 'Utilise une adresse https://.', 'l\'application de bureau ne peut pas appeler « http://api.exemple.fr » : une adresse http:// est bloquée par Electron. Utilisez https://.', 'une adresse http:// est bloquée'),
  entree('commande-bureau-partager', 'avertissement', 'avertissement', '« partager » dans l’application de bureau', 'L’application de bureau n’a pas de feuille de partage : « partager » copie le lien et le dit.', 'Rien à faire : le lien est copié.', 'sur l\'application de bureau, « partager » copie le lien (ou le texte) et le dit : Electron n\'a pas de feuille de partage.', 'n\'a pas de feuille de partage'),
  entree('commande-lecture-adresse', 'avertissement', 'avertissement', 'Une adresse de lecture refusée à la construction', 'Le serveur se lit à la construction seulement en https, sans mot de passe dans l’adresse.', 'Donne une adresse https:// sans mot de passe.', 'l\'adresse « http://api.exemple.fr » n\'est pas permise : https seulement, sans mot de passe.', 'https seulement, sans mot de passe'),
  entree('commande-lecture-source-cle', 'avertissement', 'avertissement', 'Une source avec clé, non lue à la construction', 'Une source qui envoie une clé ou des en-têtes ne se lit pas à la construction : la clé ne doit pas partir d’ici.', 'Rien à faire : la page la lit chez la personne.', 'la source « meteo » envoie une clé ou des en-têtes : elle n\'est pas lue à la construction.', 'envoie une clé ou des en-têtes'),
  entree('commande-lecture-source-http', 'avertissement', 'avertissement', 'Une source en http, non lue à la construction', 'À la construction, seules les sources en https sont lues.', 'Donne à la source une adresse https://.', 'la source « boutique » n\'est pas en https : elle n\'est pas lue à la construction.', 'n\'est pas en https : elle n\'est pas lue'),
  entree('commande-lecture-echec', 'avertissement', 'avertissement', 'Une lecture qui échoue à la construction', 'La lecture n’a pas répondu à la construction : la page garde son état de départ, et la lit chez la personne.', 'Vérifie que le serveur répond, puis recompile.', '« produits » n\'a pas pu être lu à la construction (délai dépassé) : la page garde son état de départ.', 'n\'a pas pu être lu à la construction'),
  entree('commande-composant-swift', 'sens', 'erreur', 'Le fichier Swift d’un composant introuvable', 'La vue SwiftUI écrite à la main est cherchée à côté du programme.', 'Corrige le chemin, ou place le fichier à côté du programme.', 'le fichier Swift du composant « Carte » est introuvable (Carte.swift, cherché à côté de boutique.humalis).', 'le fichier Swift du composant'),
  entree('commande-composant-kotlin', 'sens', 'erreur', 'Le fichier Kotlin d’un composant introuvable', 'La vue Jetpack Compose écrite à la main est cherchée à côté du programme.', 'Corrige le chemin, ou place le fichier à côté du programme.', 'le fichier Kotlin du composant « Carte » est introuvable (Carte.kt, cherché à côté de boutique.humalis).', 'le fichier Kotlin du composant'),
  entree('commande-composant-csharp', 'sens', 'erreur', 'Le fichier C# d’un composant introuvable', 'La vue WPF écrite à la main est cherchée à côté du programme.', 'Corrige le chemin, ou place le fichier à côté du programme.', 'le fichier C# du composant « Carte » est introuvable (Carte.cs, cherché à côté de boutique.humalis).', 'le fichier C# du composant'),
];
