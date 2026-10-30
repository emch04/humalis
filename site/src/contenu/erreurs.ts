/**
 * Le catalogue des messages d'erreur de Humalis.
 *
 * Aucun message n'est écrit ici : chaque entrée donne un programme fautif et
 * sa version corrigée, et le site affiche le message RÉEL produit par le
 * compilateur sur le programme fautif. Si un message change, le test
 * `tests/erreurs.test.ts` échoue ; si le compilateur gagne un message, le
 * même test échoue tant qu'il n'est pas expliqué ici.
 */
import { ENTREES_ERREURS_MEDIAS } from './erreurs-medias';
import { ENTREES_ERREURS_INTERACTIONS } from './erreurs-interactions';
import { ENTREES_ERREURS_LANGUES } from './erreurs-langues';

export type GroupeErreur = 'ecriture' | 'grammaire' | 'sens' | 'avertissement';

export const GROUPES_ERREURS: Record<GroupeErreur, { titre: string; intro: string }> = {
  ecriture: {
    titre: 'L’écriture des lignes',
    intro: 'Humalis commence par lire tes lignes : les espaces au début, les guillemets, les accolades. Ces erreurs viennent du lexer.',
  },
  grammaire: {
    titre: 'La grammaire',
    intro: 'Les mots sont bien écrits, mais la phrase n’a pas la forme attendue. Ces erreurs viennent du parser.',
  },
  sens: {
    titre: 'Le sens du programme',
    intro: 'La phrase est correcte, mais elle ne veut rien dire : une variable inconnue, un élément introuvable, un nombre comparé à du texte. Ces erreurs viennent de l’analyse, qui les signale toutes en une fois.',
  },
  avertissement: {
    titre: 'Les avertissements',
    intro: 'Le programme est accepté, mais Humalis te prévient d’un détail. Un avertissement ne bloque rien.',
  },
};

export interface EntreeErreur {
  id: string;
  groupe: GroupeErreur;
  titre: string;
  /** Pour un débutant : ce qui s'est passé, et pourquoi. */
  explication: string;
  /** Comment corriger. */
  correction: string;
  fautif: string;
  corrige: string;
  /** Un morceau du message réel, qui identifie cette entrée. */
  motif: string;
  gravite: 'erreur' | 'avertissement';
  /** Combien d'endroits du compilateur produisent ce message (pour le test de couverture). */
  sites: number;
  /** Faux si aucun programme ne peut produire ce message (code de sécurité du compilateur). */
  atteignable: boolean;
}

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
  gravite: options.gravite ?? 'erreur',
  sites: options.sites ?? 1,
  atteignable: options.atteignable ?? true,
});

/** Retire le premier saut de ligne : on écrit les programmes à partir de la ligne suivante. */
const p = (texte: string): string => texte.replace(/^\n/, '').replace(/\n\s*$/, '');

export const ENTREES_ERREURS: readonly EntreeErreur[] = [
  e('accessibilite-texte-vide', 'sens', 'Un élément sans texte', 'Un bouton, un lien ou un champ doit avoir un nom lisible.', 'Écris un libellé entre guillemets.', 'page "a" :\n    titre "A"\n    bouton ""', 'page "a" :\n    titre "A"\n    bouton "Continuer"', "n'a pas de texte"),
  e('accessibilite-champ-sans-lettre', 'avertissement', 'Un libellé sans lettre', 'Le signe seul ne nomme pas le champ.', 'Écris le nom du champ.', 'page "a" :\n    titre "A"\n    champ texte ":"', 'page "a" :\n    titre "A"\n    champ texte "Nom"', 'ne contient aucune lettre', { gravite: 'avertissement' }),
  e('accessibilite-champ-double', 'avertissement', 'Deux champs de même nom', 'Un lecteur d’écran ne peut pas les distinguer.', 'Donne un nom différent à chaque champ.', 'page "a" :\n    titre "A"\n    formulaire "contact" :\n        champ texte "Nom"\n        champ texte "Nom"', 'page "a" :\n    titre "A"\n    formulaire "contact" :\n        champ texte "Nom"\n        champ texte "Prénom"', 'deux champs du même formulaire', { gravite: 'avertissement' }),
  e('accessibilite-description-vague', 'avertissement', 'Une description vague', '« image » ne décrit pas ce que montre la photo.', 'Décris ce que l’image montre.', 'page "a" :\n    titre "A"\n    image "salle.jpg" avec description "image"', 'page "a" :\n    titre "A"\n    image "salle.jpg" avec description "Une salle claire"', "ne dit rien", { gravite: 'avertissement' }),
  e('accessibilite-icone-sans-description', 'avertissement', 'Une icône seule sans nom', 'Le dessin seul ne dit pas sa fonction.', 'Ajoute une description ou marque l’icône décorative.', 'page "a" :\n    titre "A"\n    icone "panier"', 'page "a" :\n    titre "A"\n    icone "panier" avec description "Panier"', 'cette icône seule', { gravite: 'avertissement' }),
  e('accessibilite-etoiles-sans-description', 'avertissement', 'Des étoiles sans explication', 'La note doit aussi être lisible.', 'Décris la note en mots.', 'page "a" :\n    titre "A"\n    etoiles 4', 'page "a" :\n    titre "A"\n    etoiles 4 avec description "Note : 4 sur 5"', 'ces étoiles', { gravite: 'avertissement' }),
  e('accessibilite-lien-vague', 'avertissement', 'Un lien vague', '« ici » ne dit pas où mène le lien.', 'Écris sa destination dans le lien.', 'page "a" :\n    titre "A"\n    lien "ici" vers "a"', 'page "a" :\n    titre "A"\n    lien "Retour à l’accueil" vers "a"', "n'explique pas sa destination", { gravite: 'avertissement' }),
  e('accessibilite-plusieurs-titres', 'avertissement', 'Plusieurs titres principaux', 'La page doit avoir un titre principal clair.', 'Garde un seul titre principal.', 'page "a" :\n    titre "A"\n    titre "B"', 'page "a" :\n    titre "A"\n    texte "B"', 'plusieurs titres principaux', { gravite: 'avertissement' }),
  e('accessibilite-survol-seul', 'avertissement', 'Une action seulement au survol', 'Un écran tactile et le clavier ne survolent pas.', 'Ajoute une action au clic.', 'page "a" :\n    titre "A"\n    quand l\'utilisateur survole "A" :\n        afficher "ok"', 'page "a" :\n    titre "A"\n    quand l\'utilisateur survole "A" :\n        afficher "ok"\n    quand l\'utilisateur clique sur "A" :\n        afficher "ok"', 'ce survol', { gravite: 'avertissement' }),
  e('accessibilite-sans-titre', 'avertissement', 'Une page sans titre', 'Le lecteur d’écran a besoin d’un titre principal.', 'Ajoute un titre à la page.', 'page "a" :\n    texte "Bonjour"', 'page "a" :\n    titre "A"\n    texte "Bonjour"', "n'a pas de titre principal", { gravite: 'avertissement' }),
  e('accessibilite-contraste', 'avertissement', 'Un contraste trop faible', 'Le texte se lit mal sur son fond.', 'Choisis une couleur proposée par le message.', 'page "a" :\n    titre "A"\n    texte "Promo" avec couleur jaune', 'page "a" :\n    titre "A"\n    texte "Promo" avec couleur bleu', 'le contraste du texte', { gravite: 'avertissement' }),
  e('accessibilite-niveau-invalide', 'sens', 'Un niveau de sous-titre invalide', 'Les sous-titres ont un niveau de 2 à 6.', 'Choisis un niveau de 2 à 6.', 'page "a" :\n    titre "A"\n    soustitre "Détails" avec niveau 7', 'page "a" :\n    titre "A"\n    soustitre "Détails" avec niveau 2', 'niveau d’un sous-titre'),
  e('accessibilite-soustitre-avant', 'avertissement', 'Un sous-titre avant le titre', 'La page doit commencer par son titre principal.', 'Place le titre avant le sous-titre.', 'page "a" :\n    soustitre "Détails"\n    titre "A"', 'page "a" :\n    titre "A"\n    soustitre "Détails"', 'apparaît avant le titre', { gravite: 'avertissement' }),
  e('accessibilite-saut-niveau', 'avertissement', 'Un saut de niveau de titre', 'Les niveaux suivent l’ordre des sections.', 'Utilise le niveau suivant.', 'page "a" :\n    titre "A"\n    soustitre "Détails" avec niveau 4', 'page "a" :\n    titre "A"\n    soustitre "Détails" avec niveau 2', 'saut de niveau', { gravite: 'avertissement' }),
  // --- L'écriture des lignes (lexer) ---
  e('tabulation', 'ecriture', 'Une tabulation au début d’une ligne',
    'Humalis repère les blocs à leur indentation. Une tabulation peut être large ou étroite selon l’éditeur : Humalis la refuse pour que tout le monde voie la même chose.',
    'Remplace la tabulation par 4 espaces. La plupart des éditeurs savent transformer la touche Tab en 4 espaces.',
    'page "accueil" :\n\ttitre "Bienvenue"',
    p(`
page "accueil" :
    titre "Bienvenue"
`),
    'tabulation interdite'),
  e('indentation-multiple', 'ecriture', 'Une indentation qui n’est pas un multiple de 4',
    'Chaque niveau d’un bloc se décale de 4 espaces. Ici, la ligne est décalée de 3 espaces : Humalis ne sait pas à quel niveau elle appartient.',
    'Utilise 0, 4, 8, 12… espaces au début de la ligne.',
    p(`
page "accueil" :
   titre "Bienvenue"
`),
    p(`
page "accueil" :
    titre "Bienvenue"
`),
    'un multiple de 4 est attendu'),
  e('indentation-saut', 'ecriture', 'Un bloc qui descend de deux niveaux d’un coup',
    'Quand une ligne se termine par deux-points, la suivante se décale d’un seul niveau, pas de deux.',
    'Décale la ligne de 4 espaces seulement par rapport à la ligne qui ouvre le bloc.',
    'page "accueil" :\n        titre "Bienvenue"',
    p(`
page "accueil" :
    titre "Bienvenue"
`),
    'un seul niveau à la fois'),
  e('indentation-bloc', 'ecriture', 'Un niveau qui ne ferme aucun bloc',
    'Quand on remonte d’un niveau, la ligne doit retrouver le niveau d’un bloc déjà ouvert. Avec la règle « 4 espaces, un niveau à la fois », cette situation ne peut pas se produire en pratique : le message existe par sécurité.',
    'Si tu le vois un jour, c’est une vraie surprise : préviens-nous.',
    p(`
page "accueil" :
    titre "Bienvenue"
`),
    p(`
page "accueil" :
    titre "Bienvenue"
`),
    'ce niveau ne correspond à aucun bloc ouvert',
    { atteignable: false }),
  e('chaine-non-fermee', 'ecriture', 'Un guillemet oublié',
    'Un texte commence et se termine par un guillemet. Ici, le guillemet de fin manque, donc Humalis ne sait pas où le texte s’arrête.',
    'Ajoute le guillemet fermant avant la fin de la ligne.',
    p(`
page "accueil" :
    titre "Bienvenue
`),
    p(`
page "accueil" :
    titre "Bienvenue"
`),
    'guillemet manquant'),
  e('accolade-non-fermee', 'ecriture', 'Une accolade oubliée dans un texte',
    'Dans un texte, {nom} insère la valeur d’une variable. L’accolade ouvrante est là, mais pas la fermante.',
    'Ferme l’accolade : {nom}.',
    p(`
page "accueil" :
    variable nom = "Awa"
    texte "Bonjour {nom"
`),
    p(`
page "accueil" :
    variable nom = "Awa"
    texte "Bonjour {nom}"
`),
    'accolade non fermée'),

  // --- La grammaire (parser) ---
  e('page-doublon', 'grammaire', 'Deux pages avec le même nom',
    'Une page est désignée par son nom : il ne peut pas y en avoir deux avec le même. La ligne indiquée est celle de la seconde.',
    'Donne un autre nom à l’une des deux pages.',
    p(`
page "accueil" :
    titre "Bienvenue"

page "accueil" :
    texte "Une deuxième fois"
`),
    p(`
page "accueil" :
    titre "Bienvenue"

page "contact" :
    texte "Une deuxième page"
`),
    'est déjà déclarée'),
  e('instruction-inconnue', 'grammaire', 'Une instruction que Humalis ne connaît pas',
    'Dans une page, chaque ligne commence par un mot que Humalis connaît : un élément (titre, texte…), « variable », « si », « pour », « quand » ou une action. Ici, le mot n’en est aucun, souvent à cause d’une faute de frappe.',
    'Vérifie l’orthographe, ou cherche le mot dans la page du vocabulaire.',
    p(`
page "accueil" :
    titr "Bienvenue"
`),
    p(`
page "accueil" :
    titre "Bienvenue"
`),
    'instruction inconnue'),
  e('mot-prevu', 'grammaire', 'Un mot prévu, pas encore disponible',
    'Le mot fait partie du vocabulaire prévu de Humalis (sa fiche est dans la page du vocabulaire), mais le compilateur ne le comprend pas encore. C’est le cas de « non », réservé pour la négation.',
    'En attendant, utilise un mot déjà disponible : ici, un texte.',
    p(`
page "accueil" :
    tableau "Détails"
`),
    p(`
page "accueil" :
    texte "Détails"
`),
    'n’est pas encore disponible',
    { sites: 2 }),
  e('propriete-attendue', 'grammaire', 'Une option sans nom après « avec »',
    'Après « avec », Humalis attend le nom d’une option (couleur, taille, nom…), puis sa valeur. Ici, il trouve un texte entre guillemets à la place du nom.',
    'Écris le nom de l’option sans guillemets, puis sa valeur : avec couleur bleu.',
    p(`
page "accueil" :
    titre "Bienvenue" avec "bleu"
`),
    p(`
page "accueil" :
    titre "Bienvenue" avec couleur bleu
`),
    'un nom de propriété de style est attendu'),
  e('valeur-de-style', 'grammaire', 'Une option sans valeur',
    'Chaque option après « avec » va par paire : un nom et une valeur. Ici, la valeur manque.',
    'Ajoute la valeur : avec couleur bleu.',
    p(`
page "accueil" :
    titre "Bienvenue" avec couleur
`),
    p(`
page "accueil" :
    titre "Bienvenue" avec couleur bleu
`),
    'une valeur est attendue pour le style'),
  e('comparaison-inconnue', 'grammaire', 'Une comparaison inconnue',
    'Après « est », Humalis connaît : vide, vrai, faux, égal à, différent de, inférieur à, supérieur à, plus grand que et plus petit que.',
    'Choisis l’une des comparaisons connues. Elles sont dans la page des conditions.',
    p(`
page "resultat" :
    variable note = 8
    si note est petite :
        afficher "Échec"
`),
    p(`
page "resultat" :
    variable note = 8
    si note est inférieure à 10 :
        afficher "Échec"
`),
    'comparaison inconnue'),
  e('comparaison-plus-incomplete', 'grammaire', 'Une comparaison incomplète',
    'Après « est plus », indique si la valeur est grande ou petite.',
    'Écris « est plus grand que » ou « est plus petit que ». ',
    p(`page "a" :
    variable age = 18
    si age est plus rapide que 10 :
        texte "oui"`),
    p(`page "a" :
    variable age = 18
    si age est plus grand que 10 :
        texte "oui"`),
    'après « est plus »'),
  e('comparaison-ou-incomplete', 'grammaire', 'Une égalité manquante',
    'Après « plus grand ou », il manque « égal à ». ',
    'Écris « est plus grand ou égal à ». ',
    p(`page "a" :
    variable age = 18
    si age est plus grand ou petit que 10 :
        texte "oui"`),
    p(`page "a" :
    variable age = 18
    si age est plus grand ou égal à 10 :
        texte "oui"`),
    'après « plus grand ou »'),
  e('comparaison-que-manquant', 'grammaire', 'Le mot « que » manque',
    'Après « plus grand », indique ce à quoi tu compares.',
    'Écris « est plus grand que ». ',
    p(`page "a" :
    variable age = 18
    si age est plus grand 10 :
        texte "oui"`),
    p(`page "a" :
    variable age = 18
    si age est plus grand que 10 :
        texte "oui"`),
    'après « plus grand »'),
  e('action-utilisateur-inconnue', 'grammaire', 'Une action de l’utilisateur inconnue',
    'Après « quand l’utilisateur », Humalis connaît « clique sur » et « survole ». Il ne connaît pas encore les autres gestes.',
    'Utilise « clique sur » ou « survole ».',
    p(`
page "accueil" :
    bouton "Valider"
    quand l'utilisateur tape sur "Valider" :
        afficher "Merci"
`),
    p(`
page "accueil" :
    bouton "Valider"
    quand l'utilisateur clique sur "Valider" :
        afficher "Merci"
`),
    'action utilisateur inconnue'),
  e('evenement-inconnu', 'grammaire', 'Un événement inconnu',
    'Après « quand », Humalis connaît trois débuts : « l’utilisateur … », « la page se charge » et « le formulaire … est soumis ».',
    'Commence l’événement par l’une de ces trois formes.',
    p(`
page "accueil" :
    quand "Valider" :
        afficher "Merci"
`),
    p(`
page "accueil" :
    quand la page se charge :
        afficher "Merci"
`),
    'événement inconnu'),
  e('valeur-attendue', 'grammaire', 'Une valeur qui manque',
    'À cet endroit, Humalis attend une valeur : un texte, un nombre, vrai, faux, une liste ou le nom d’une variable. Il trouve autre chose, ou rien.',
    'Écris la valeur après le signe égal.',
    p(`
page "accueil" :
    variable note =
`),
    p(`
page "accueil" :
    variable note = 12
`),
    'une valeur est attendue, mais'),
  e('mot-attendu', 'grammaire', 'Un mot ou un signe qui manque',
    'Le message dit ce qui manque et ce qu’on trouve à la place. Ici, il manque les deux-points qui ouvrent le bloc d’un « si ».',
    'Ajoute ce qui manque, à l’endroit indiqué par le message.',
    p(`
page "accueil" :
    variable note = 8
    si note est vide
        afficher "Échec"
`),
    p(`
page "accueil" :
    variable note = 8
    si note est inférieure à 10 :
        afficher "Échec"
`),
    'il manque'),
  e('mot-reserve', 'grammaire', 'Un mot réservé comme nom de variable',
    'Dix-neuf mots sont réservés partout (page, composant, serveur, variable, si, sinon, quand, pour, et, ou, non, est, vrai, faux, rien, avec, vers, dans, par) : ils servent à structurer le programme et ne peuvent pas être un nom. Les autres, comme titre ou menu, peuvent nommer une variable.',
    'Choisis un autre nom.',
    p(`
page "accueil" :
    variable si = 3
`),
    p(`
page "accueil" :
    variable reponse = 3
`),
    'est un mot réservé'),
  e('mot-reserve-valeur', 'grammaire', 'Un mot réservé à la place d’une valeur',
    'À cet endroit, Humalis attend une valeur. Un mot réservé (ici « quand », qui commence un événement) ne peut pas nommer une variable, donc il ne peut pas non plus servir de valeur.',
    'Écris la valeur voulue : un texte entre guillemets, un nombre, ou le nom d’une variable.',
    p(`
page "accueil" :
    texte quand
`),
    p(`
page "accueil" :
    texte "quand"
`),
    'est un mot réservé du langage : il ne peut pas servir de nom de variable'),
  e('petit-mot-nom', 'grammaire', 'Un petit mot ignoré pris comme nom',
    'Les petits mots (le, la, de, a, au…) sont sautés par Humalis pour lire la phrase. « variable a = 1 » se lit donc « variable = 1 » : il manque le nom. Humalis te dit quel petit mot a été sauté.',
    'Choisis un autre nom, plus parlant : « variable age = 1 ».',
    p(`
page "accueil" :
    variable a = 1
`),
    p(`
page "accueil" :
    variable age = 1
`),
    'est un petit mot ignoré par Humalis'),
  e('petit-mot-valeur', 'grammaire', 'Un petit mot ignoré à la place d’une valeur',
    'Un petit mot (le, la, de, a, au…) ne compte pas comme une valeur : Humalis le saute. S’il devait nommer une variable, il faut lui choisir un autre nom.',
    'Écris la valeur voulue, ou renomme la variable.',
    p(`
page "accueil" :
    texte des
`),
    p(`
page "accueil" :
    texte "des"
`),
    'une valeur est attendue. « des »'),

  // --- Le sens du programme (analyse) ---
  e('variable-non-declaree', 'sens', 'Une variable jamais déclarée',
    'Un mot sans guillemets désigne une variable. Ici, personne n’a écrit « variable message = … » : Humalis ne sait pas de quoi tu parles.',
    'Déclare la variable avant de l’utiliser, ou mets le mot entre guillemets si tu voulais du texte.',
    p(`
page "accueil" :
    texte message
`),
    p(`
page "accueil" :
    variable message = "Bonjour"
    texte message
`),
    'n\'est pas déclarée'),
  e('variable-avant-declaration', 'sens', 'Une variable utilisée avant d’être déclarée',
    'Humalis lit la page de haut en bas. Une variable doit être déclarée avant la première ligne qui l’utilise.',
    'Déplace la déclaration plus haut.',
    p(`
page "accueil" :
    texte score
    variable score = 0
`),
    p(`
page "accueil" :
    variable score = 0
    texte score
`),
    'avant d\'être déclarée'),
  e('variable-existe-deja', 'sens', 'Une variable déclarée deux fois',
    'Une variable se déclare une seule fois. Pour changer sa valeur ensuite, on utilise « changer ».',
    'Remplace la seconde déclaration par : changer clics par 1.',
    p(`
page "accueil" :
    variable clics = 0
    variable clics = 1
`),
    p(`
page "accueil" :
    variable clics = 0
    bouton "Cliquer"
    quand l'utilisateur clique sur "Cliquer" :
        changer clics par 1
`),
    'existe déjà'),
  e('variable-hors-boucle', 'sens', 'Une variable de boucle utilisée après la boucle',
    'Dans « pour chaque nom dans produits », la variable « nom » n’existe que dans la boucle. Après, elle a disparu.',
    'Utilise la variable à l’intérieur de la boucle, ou déclare une autre variable avant la boucle.',
    p(`
page "produits" :
    variable produits = ["Pomme", "Banane"]
    pour chaque nom dans produits :
        texte nom
    texte nom
`),
    p(`
page "produits" :
    variable produits = ["Pomme", "Banane"]
    pour chaque nom dans produits :
        texte nom
`),
    'n\'existe que dans la boucle'),
  e('interpolation-inconnue', 'sens', 'Une variable inconnue dans un texte',
    'Entre accolades, dans un texte, Humalis cherche la variable : {nom}. Ici, elle n’est pas déclarée.',
    'Déclare la variable, ou corrige son nom.',
    p(`
page "accueil" :
    texte "Bonjour {nom}"
`),
    p(`
page "accueil" :
    variable nom = "Awa"
    texte "Bonjour {nom}"
`),
    'n\'est pas déclarée'),
  e('type-affectation', 'sens', 'Une valeur d’un autre type',
    'Une variable garde son type : un nombre reste un nombre, un texte reste un texte. « changer » ne peut pas lui donner autre chose.',
    'Donne une valeur du même type, ou déclare une nouvelle variable.',
    p(`
page "accueil" :
    variable clics = 0
    quand la page se charge :
        changer clics par "beaucoup"
`),
    p(`
page "accueil" :
    variable clics = 0
    quand la page se charge :
        changer clics par 10
`),
    'on ne peut pas lui donner'),
  e('comparer-types', 'sens', 'Deux valeurs de types différents',
    '« est égal à » compare deux choses du même genre : deux nombres, ou deux textes. Comparer un nombre à un texte n’a pas de sens.',
    'Compare des valeurs du même type.',
    p(`
page "accueil" :
    variable note = 8
    si note est égal à "dix" :
        afficher "Dix"
`),
    p(`
page "accueil" :
    variable note = 8
    si note est égal à 10 :
        afficher "Dix"
`),
    'on ne peut pas comparer'),
  e('comparer-nombres', 'sens', 'Comparer autre chose que des nombres',
    '« inférieur à » et « supérieur à » comparent des nombres. Un texte ne peut pas être plus petit qu’un nombre.',
    'Utilise une variable qui contient un nombre.',
    p(`
page "accueil" :
    variable nom = "Awa"
    si nom est inférieur à 10 :
        afficher "Petit"
`),
    p(`
page "accueil" :
    variable age = 8
    si age est inférieur à 10 :
        afficher "Petit"
`),
    'compare des nombres'),
  e('vide-type', 'sens', '« est vide » sur un nombre',
    '« est vide » s’applique à un texte ou à une liste. Un nombre n’est jamais vide.',
    'Teste un texte ou une liste. Pour un nombre, compare-le avec « est égal à ».',
    p(`
page "accueil" :
    variable note = 3
    si note est vide :
        afficher "Rien"
`),
    p(`
page "accueil" :
    variable notes = []
    si notes est vide :
        afficher "Rien"
`),
    '« est vide » s\'applique'),
  e('vrai-faux-type', 'sens', '« est vrai » sur autre chose qu’un booléen',
    '« est vrai » et « est faux » s’appliquent à une variable qui vaut vrai ou faux.',
    'Utilise une variable booléenne, ou une autre comparaison.',
    p(`
page "accueil" :
    variable note = 3
    si note est vrai :
        afficher "Oui"
`),
    p(`
page "accueil" :
    variable connecte = vrai
    si connecte est vrai :
        afficher "Oui"
`),
    'attend vrai ou faux'),
  e('boucle-pas-liste', 'sens', 'Une boucle sur autre chose qu’une liste',
    '« pour chaque … dans … » parcourt une liste. Ici, la variable désignée est un nombre.',
    'Parcours une liste, écrite entre crochets : ["Pomme", "Banane"].',
    p(`
page "accueil" :
    variable produits = 3
    pour chaque nom dans produits :
        texte nom
`),
    p(`
page "accueil" :
    variable produits = ["Pomme", "Banane"]
    pour chaque nom dans produits :
        texte nom
`),
    'attend une liste'),
  e('champ-introuvable', 'sens', 'Un champ qui n’existe pas',
    'Pour lire un champ, on écrit « le champ "email" ». Humalis cherche un champ de ce nom dans la page, et n’en trouve pas.',
    'Vérifie le nom du champ.',
    p(`
page "connexion" :
    champ "email"
    bouton "Se connecter"
    quand l'utilisateur clique sur "Se connecter" :
        si le champ "mail" est vide :
            afficher erreur "Email requis"
`),
    p(`
page "connexion" :
    champ "email"
    bouton "Se connecter"
    quand l'utilisateur clique sur "Se connecter" :
        si le champ "email" est vide :
            afficher erreur "Email requis"
`),
    'aucun champ'),
  e('element-introuvable', 'sens', 'Un élément qui n’existe pas',
    'Un événement ou une action désigne un élément par son nom ou son libellé. Humalis le cherche dans la page, et ne le trouve pas.',
    'Vérifie l’orthographe, ou donne un nom à l’élément avec « avec nom "…" ».',
    p(`
page "accueil" :
    bouton "Envoyer"
    quand l'utilisateur clique sur "Valider" :
        afficher "Merci"
`),
    p(`
page "accueil" :
    bouton "Valider"
    quand l'utilisateur clique sur "Valider" :
        afficher "Merci"
`),
    'aucun élément'),
  e('elements-homonymes', 'sens', 'Deux éléments qui s’appellent pareil',
    'Quand deux éléments ont le même libellé, Humalis ne sait pas lequel tu vises.',
    'Donne un nom à l’un d’eux : avec nom "…", et vise ce nom.',
    p(`
page "accueil" :
    bouton "Valider"
    bouton "Valider"
    quand l'utilisateur clique sur "Valider" :
        afficher "Merci"
`),
    p(`
page "accueil" :
    bouton "Valider"
    bouton "Valider" avec nom "second"
    quand l'utilisateur clique sur "second" :
        afficher "Merci"
`),
    's\'appellent'),
  e('nom-entre-guillemets', 'sens', 'Un nom d’élément calculé',
    'Pour montrer, cacher ou changer un élément, Humalis veut son nom écrit en toutes lettres entre guillemets, pas une variable.',
    'Écris le nom directement : montrer "menu".',
    p(`
page "accueil" :
    variable choix = "menu"
    texte "Menu" avec nom "menu"
    quand la page se charge :
        montrer "{choix}"
`),
    p(`
page "accueil" :
    texte "Menu" avec nom "menu"
    quand la page se charge :
        montrer "menu"
`),
    'écrivez le nom de l\'élément entre guillemets'),
  e('hors-evenement', 'sens', 'Une action placée dans la page, hors d’un événement',
    '« montrer », « cacher », « changer », « rediriger » et « envoyer requete » agissent quand quelque chose se passe. Posés directement dans la page, ils n’ont pas de moment où s’exécuter. Seul « afficher » est permis partout.',
    'Place l’action dans un événement : quand l’utilisateur clique sur … ou quand la page se charge.',
    p(`
page "accueil" :
    texte "Bonjour" avec nom "message"
    cacher "message"
`),
    p(`
page "accueil" :
    texte "Bonjour" avec nom "message"
    quand la page se charge :
        cacher "message"
`),
    'ne s\'utilise que dans un événement',
    { sites: 5 }),
  e('element-dans-evenement', 'sens', 'Un élément créé dans un événement',
    'Les éléments font partie de la page : ils sont posés au départ. Un événement peut seulement les montrer, les cacher ou les modifier.',
    'Place l’élément dans la page, puis utilise « montrer » dans l’événement.',
    p(`
page "accueil" :
    bouton "Ouvrir"
    quand l'utilisateur clique sur "Ouvrir" :
        texte "Bonjour"
`),
    p(`
page "accueil" :
    bouton "Ouvrir"
    texte "Bonjour" avec nom "message"
    quand l'utilisateur clique sur "Ouvrir" :
        montrer "message"
`),
    'un élément ne peut pas être créé dans un événement'),
  e('evenement-mal-place', 'sens', 'Un événement dans un autre événement',
    'Un événement s’écrit dans la page, sous son élément : dans un « si », une boucle, une section ou un formulaire aussi. Mais pas à l’intérieur d’un autre événement : il ne serait jamais prêt à temps.',
    'Sors l’événement : écris-le sous son bouton, au même niveau que l’autre événement.',
    p(`
page "accueil" :
    bouton "Valider"
    bouton "Annuler"
    quand l'utilisateur clique sur "Valider" :
        quand l'utilisateur clique sur "Annuler" :
            afficher "Annulé"
`),
    p(`
page "accueil" :
    bouton "Valider"
    bouton "Annuler"
    quand l'utilisateur clique sur "Valider" :
        afficher "Merci"
    quand l'utilisateur clique sur "Annuler" :
        afficher "Annulé"
`),
    'ne se place pas dans un autre événement'),

  e('option-inconnue', 'sens', 'Une option ou une valeur de style inconnue',
    'Les styles viennent d’un petit jeu de valeurs nommées, communes à toutes les plateformes : couleurs, tailles, position, bordure. Ici, la valeur n’en fait pas partie. Si c’est le nom de l’option qui est inconnu, le message le dit aussi, et liste les options possibles.',
    'Choisis l’une des valeurs listées par le message. La page des styles les donne toutes.',
    p(`
page "accueil" :
    titre "Bienvenue" avec couleur pourpre
`),
    p(`
page "accueil" :
    titre "Bienvenue" avec couleur violet
`),
    'n\'est pas une valeur possible',
    { sites: 2 }),
  e('calcul-non-nombre', 'sens', 'Un calcul avec autre chose que des nombres',
    '+ - * / calculent avec des nombres. Ici, une des deux valeurs est un texte. Pour coller du texte, on n’utilise pas « + » : on met la variable entre accolades dans un texte.',
    'Calcule avec des nombres, ou écris par exemple "Total : {total}".',
    p(`
page "accueil" :
    variable nom = "Awa"
    variable total = nom + 1
`),
    p(`
page "accueil" :
    variable age = 8
    variable total = age + 1
`),
    'calcule avec des nombres'),
  e('division-par-zero', 'sens', 'Une division par zéro',
    'On ne peut pas diviser par zéro. Humalis le voit quand le nombre après « / » est écrit 0.',
    'Divise par un autre nombre.',
    p(`
page "accueil" :
    variable moitie = 4 / 0
`),
    p(`
page "accueil" :
    variable moitie = 4 / 2
`),
    'division par zéro'),
  e('calcul-modifie', 'sens', 'Changer une variable qui est un calcul',
    'Un calcul déclaré avec le mot « calcul » (calcul total = prix * 2) se recalcule toute seule quand prix change. On ne peut donc pas lui donner une valeur à la main.',
    'Change plutôt les variables dont elle dépend, ici prix.',
    p(`
page "accueil" :
    variable prix = 12
    calcul total = prix * 2
    quand la page se charge :
        changer total par 5
`),
    p(`
page "accueil" :
    variable prix = 12
    calcul total = prix * 2
    quand la page se charge :
        changer prix par 5
`),
    'est un calcul'),
  e('compte-pas-liste', 'sens', '« nombre de » sur autre chose qu’une liste',
    '« nombre de panier » compte les éléments d’une liste. Ici, la variable est un nombre.',
    'Compte une liste, écrite entre crochets.',
    p(`
page "accueil" :
    variable x = 4
    variable n = nombre de x
`),
    p(`
page "accueil" :
    variable x = [4]
    variable n = nombre de x
`),
    'compte les éléments d'),
  e('modification-pas-liste', 'sens', 'Ajouter ou retirer dans autre chose qu’une liste',
    '« ajouter » et « retirer » travaillent sur une liste. Ici, la variable désignée est un nombre.',
    'Déclare la variable comme une liste : variable panier = [].',
    p(`
page "accueil" :
    variable x = 4
    quand la page se charge :
        ajouter 1 à x
`),
    p(`
page "accueil" :
    variable x = []
    quand la page se charge :
        ajouter 1 à x
`),
    'on ne peut ajouter ou retirer que dans une liste'),
  e('modification-type', 'sens', 'Ajouter une valeur d’un autre type',
    'Une liste garde son type : une liste de nombres ne reçoit que des nombres.',
    'Ajoute une valeur du même type que le reste de la liste.',
    p(`
page "accueil" :
    variable notes = [8, 14]
    quand la page se charge :
        ajouter "un" à notes
`),
    p(`
page "accueil" :
    variable notes = [8, 14]
    quand la page se charge :
        ajouter 1 à notes
`),
    'on ne peut pas y ajouter'),
  e('evenement-hors-boucle', 'sens', 'Un événement qui vise un élément hors de sa boucle',
    'Un événement écrit dans une boucle « pour chaque » voit la variable de la boucle, mais ne peut viser qu’un élément de la même boucle.',
    'Vise un élément qui est dans la boucle, ou sors l’événement de la boucle.',
    p(`
page "produits" :
    variable produits = ["Livre", "Stylo"]
    bouton "Fermer"
    pour chaque nom dans produits :
        texte nom
        quand l'utilisateur clique sur "Fermer" :
            afficher nom
`),
    p(`
page "produits" :
    variable produits = ["Livre", "Stylo"]
    pour chaque nom dans produits :
        bouton "Fermer"
        quand l'utilisateur clique sur "Fermer" :
            afficher nom
`),
    'n’est pas dans cette boucle'),

  // --- Les formulaires et leurs champs ---
  e('formulaire-inconnu', 'sens', 'Un événement sur un formulaire qui n’existe pas',
    '« quand le formulaire "…" est soumis » vise un formulaire de la page par son nom. Humalis n’en trouve aucun de ce nom, et te donne la liste de ceux qui existent.',
    'Corrige le nom dans l’événement, ou donne ce nom au formulaire.',
    p(`
page "contact" :
    formulaire "message" :
        champ "email"
        bouton "Envoyer"
    quand le formulaire "messages" est soumis :
        afficher "Merci !"
`),
    p(`
page "contact" :
    formulaire "message" :
        champ "email"
        bouton "Envoyer"
    quand le formulaire "message" est soumis :
        afficher "Merci !"
`),
    'Formulaires de la page : message'),
  e('formulaire-absent', 'sens', 'Un événement de formulaire dans une page sans formulaire',
    'La page n’a aucun bloc « formulaire "…" : ». L’événement ne peut donc rien viser.',
    'Crée le formulaire : ses champs et son bouton, dans un bloc « formulaire "…" : ».',
    p(`
page "contact" :
    champ "email"
    quand le formulaire "message" est soumis :
        afficher "Merci !"
`),
    p(`
page "contact" :
    formulaire "message" :
        champ "email"
        bouton "Envoyer"
    quand le formulaire "message" est soumis :
        afficher "Merci !"
`),
    'créez-le avec formulaire'),
  e('formulaire-hors-boucle', 'sens', 'Un événement de formulaire qui vise un formulaire hors de sa boucle',
    'Comme pour un élément : un événement écrit dans une boucle ne vise qu’un formulaire de la même boucle.',
    'Place le formulaire dans la boucle, ou sors l’événement de la boucle.',
    p(`
page "avis" :
    variable sujets = ["Livre", "Stylo"]
    formulaire "avis" :
        champ "note"
        bouton "Envoyer"
    pour chaque sujet dans sujets :
        texte sujet
        quand le formulaire "avis" est soumis :
            afficher "Merci pour {sujet}"
`),
    p(`
page "avis" :
    variable sujets = ["Livre", "Stylo"]
    pour chaque sujet dans sujets :
        formulaire "avis" :
            champ "note"
            bouton "Envoyer"
        quand le formulaire "avis" est soumis :
            afficher "Merci pour {sujet}"
`),
    'vise un formulaire de la même boucle'),
  e('formulaire-deux-evenements', 'sens', 'Deux événements pour le même formulaire',
    'À l’envoi, Humalis vérifie les champs, fait ce que dit l’événement, puis vide les champs : il ne peut y avoir qu’un seul événement « est soumis » par formulaire.',
    'Réunis les actions des deux événements dans un seul.',
    p(`
page "contact" :
    formulaire "message" :
        champ "email"
        bouton "Envoyer"
    quand le formulaire "message" est soumis :
        afficher "Merci !"
    quand le formulaire "message" est soumis :
        rediriger vers "contact"
`),
    p(`
page "contact" :
    formulaire "message" :
        champ "email"
        bouton "Envoyer"
    quand le formulaire "message" est soumis :
        afficher "Merci !"
        rediriger vers "contact"
`),
    'a déjà son événement « est soumis »'),
  e('formulaire-en-double', 'sens', 'Deux formulaires du même nom',
    'Un formulaire est désigné par son nom, dans « quand le formulaire "…" est soumis ». Deux formulaires du même nom dans la même page ne pourraient pas être distingués.',
    'Donne un nom différent à chaque formulaire de la page.',
    p(`
page "contact" :
    formulaire "message" :
        champ "email"
    formulaire "message" :
        champ "nom"
    quand le formulaire "message" est soumis :
        afficher "Merci !"
`),
    p(`
page "contact" :
    formulaire "message" :
        champ "email"
        champ "nom"
    quand le formulaire "message" est soumis :
        afficher "Merci !"
`),
    'existe déjà dans cette page'),
  e('formulaire-dans-evenement', 'sens', 'Un formulaire créé dans un événement',
    'Comme un élément, un formulaire fait partie de la page : il est posé au départ. Un événement peut le montrer ou le cacher.',
    'Place le formulaire dans la page, caché au départ, puis montre-le dans l’événement.',
    p(`
page "contact" :
    bouton "Écrire"
    quand l'utilisateur clique sur "Écrire" :
        formulaire "message" :
            champ "email"
`),
    p(`
page "contact" :
    bouton "Écrire"
    formulaire "message" :
        champ "email"
    quand l'utilisateur clique sur "Écrire" :
        montrer "message"
    quand le formulaire "message" est soumis :
        cacher "message"
`),
    'un formulaire ne peut pas être créé dans un événement'),
  e('bloc-dans-evenement', 'sens', 'Un bloc créé dans un événement',
    'Une section, une ligne, une grille ou un bloc font partie de la page : ils sont posés au départ, avec ce qu’ils contiennent. Un événement change ce qui s’affiche, il ne crée pas de nouveaux blocs.',
    'Place le bloc dans la page ; dans l’événement, montre ou cache ce qu’il contient.',
    p(`
page "accueil" :
    bouton "Voir les horaires"
    quand l'utilisateur clique sur "Voir les horaires" :
        section "Horaires" :
            texte "Ouvert tous les jours"
`),
    p(`
page "accueil" :
    bouton "Voir les horaires"
    section "Horaires" :
        texte "Ouvert tous les jours" avec nom "horaires"
    quand l'utilisateur clique sur "Voir les horaires" :
        montrer "horaires"
`),
    'un bloc ne peut pas être créé dans un événement'),
  e('fiche-champ-inconnu', 'sens', 'Un champ qui n’existe pas dans une fiche',
    'Une fiche a les champs qu’on lui donne en l’écrivant (fiche avec nom … et prix …). Lire un autre champ est une faute de frappe, ou un champ oublié. Le message liste les champs de la fiche.',
    'Corrige le nom du champ, ou ajoute-le à la fiche.',
    p(`
page "accueil" :
    variable livre = fiche avec nom "Le Petit Prince" et prix 12000
    texte "{livre.auteur}"
`),
    p(`
page "accueil" :
    variable livre = fiche avec nom "Le Petit Prince" et auteur "Saint-Exupéry" et prix 12000
    texte "{livre.auteur}"
`),
    'n\'existe pas dans cette fiche'),
  e('fiche-champ-double', 'sens', 'Un champ donné deux fois dans une fiche',
    'Chaque champ d’une fiche n’a qu’une valeur. Le donner deux fois laisserait deviner laquelle garder.',
    'Garde une seule fois chaque champ.',
    p(`
page "accueil" :
    variable livre = fiche avec nom "A" et nom "B"
`),
    p(`
page "accueil" :
    variable livre = fiche avec nom "A" et auteur "B"
`),
    'est donné deux fois dans cette fiche'),
  e('fonction-inconnue', 'sens', 'Une fonction qui n’existe pas',
    'On appelle une fonction par son nom suivi de parenthèses. Ce nom doit être celui d’une fonction écrite en haut du fichier (ou dans un fichier utilisé). Le message liste les fonctions connues.',
    'Corrige le nom, ou écris la fonction en haut du fichier.',
    p(`
fonction double avec n :
    rendre n * 2

page "accueil" :
    calcul x = triple(3)
    texte "{x}"
`),
    p(`
fonction triple avec n :
    rendre n * 3

page "accueil" :
    calcul x = triple(3)
    texte "{x}"
`),
    'n\'existe pas. Fonctions'),
  e('fonction-nombre-de-valeurs', 'sens', 'Une fonction appelée avec trop ou trop peu de valeurs',
    'Une fonction reçoit autant de valeurs qu’elle a de noms après « avec », dans le même ordre, séparées par des virgules.',
    'Donne une valeur pour chaque nom de la fonction.',
    p(`
fonction remise avec prix et taux :
    rendre prix - prix * taux / 100

page "accueil" :
    calcul x = remise(20000)
    texte "{x}"
`),
    p(`
fonction remise avec prix et taux :
    rendre prix - prix * taux / 100

page "accueil" :
    calcul x = remise(20000, 10)
    texte "{x}"
`),
    'attend 2 valeurs'),
  e('rendre-hors-fonction', 'sens', '« rendre » en dehors d’une fonction',
    '« rendre » donne la valeur d’une fonction et l’arrête. Ailleurs, il n’y a rien à rendre : pour garder une valeur, on la met dans une variable.',
    'Écris le calcul dans une fonction, ou utilise « changer … par » dans l’événement.',
    p(`
page "accueil" :
    variable total = 0
    bouton "Calculer"
    quand l'utilisateur clique sur "Calculer" :
        rendre 12
`),
    p(`
page "accueil" :
    variable total = 0
    bouton "Calculer"
    quand l'utilisateur clique sur "Calculer" :
        changer total par 12
`),
    'ne s\'écrit que dans une fonction'),
  e('action-dans-fonction', 'sens', 'Une action dans une fonction',
    'Une fonction écrite en haut du fichier calcule une valeur et la rend. Afficher un message, changer de page ou envoyer une requête se fait dans un événement, qui peut appeler la fonction.',
    'Garde le calcul dans la fonction et l’action dans l’événement.',
    p(`
fonction saluer avec nom :
    afficher "Bonjour {nom}"
    rendre nom

page "accueil" :
    calcul x = saluer("Awa")
    texte "{x}"
`),
    p(`
fonction saluer avec nom :
    rendre "Bonjour {nom}"

page "accueil" :
    calcul x = saluer("Awa")
    texte "{x}"
`),
    'pas dans une fonction'),
  e('boucle-dans-la-page', 'sens', 'Une boucle ou un choix écrit dans la page',
    '« tant que », « repeter » et « selon » calculent : ils s’écrivent dans un événement ou une fonction. Dans la page, « pour chaque » affiche une liste et « si » choisit ce qui s’affiche.',
    'Mets la boucle dans un événement, ou affiche la liste avec « pour chaque ».',
    p(`
page "accueil" :
    repeter 3 fois :
        texte "Bonjour"
`),
    p(`
page "accueil" :
    variable lignes = ["Bonjour", "Bonjour", "Bonjour"]
    pour chaque ligne dans lignes :
        texte ligne
`),
    's\'écrit dans un événement ou une fonction'),
  e('boucle-sans-fin', 'avertissement', 'Une boucle qui risque de ne jamais s’arrêter',
    'Une boucle « tant que » recommence tant que sa condition est vraie. Si rien dans la boucle ne change ce que la condition lit, elle reste vraie pour toujours, et la page se fige.',
    'Change, dans la boucle, une variable que la condition lit.',
    p(`
page "accueil" :
    variable n = 0
    bouton "Compter"
    quand l'utilisateur clique sur "Compter" :
        tant que n est inferieur a 3 :
            afficher "encore"
`),
    p(`
page "accueil" :
    variable n = 0
    bouton "Compter"
    quand l'utilisateur clique sur "Compter" :
        tant que n est inferieur a 3 :
            changer n par n + 1
`),
    'risque de ne jamais s\'arrêter',
    { gravite: 'avertissement' }),
  e('repeter-sans-nombre', 'sens', '« repeter » sans nombre',
    '« repeter » répète un nombre de fois : il attend un nombre, ou une variable qui contient un nombre.',
    'Écris un nombre après « repeter ».',
    p(`
page "accueil" :
    bouton "Go"
    quand l'utilisateur clique sur "Go" :
        repeter "trois" fois :
            afficher "x"
`),
    p(`
page "accueil" :
    bouton "Go"
    quand l'utilisateur clique sur "Go" :
        repeter 3 fois :
            afficher "x"
`),
    'attend un nombre de fois'),
  e('arreter-hors-boucle', 'sens', '« arreter » ou « passer au suivant » hors d’une boucle',
    '« arreter » sort d’une boucle, « passer au suivant » saute au tour suivant. Hors d’une boucle, il n’y a rien à arrêter.',
    'Place-les dans une boucle « pour chaque », « tant que » ou « repeter ».',
    p(`
page "accueil" :
    bouton "Go"
    quand l'utilisateur clique sur "Go" :
        arreter
`),
    p(`
page "accueil" :
    variable notes = [12, 0, 15]
    bouton "Go"
    quand l'utilisateur clique sur "Go" :
        pour chaque note dans notes :
            si note est egal a 0 :
                arreter
`),
    's\'écrit dans une boucle',
    { sites: 1 }),
  e('repeter-sans-fois', 'grammaire', '« repeter » sans « fois »',
    'La boucle s’écrit « repeter 3 fois : », avec le mot « fois » avant les deux-points.',
    'Ajoute « fois » après le nombre.',
    p(`
page "accueil" :
    bouton "Go"
    quand l'utilisateur clique sur "Go" :
        repeter 3 :
            afficher "x"
`),
    p(`
page "accueil" :
    bouton "Go"
    quand l'utilisateur clique sur "Go" :
        repeter 3 fois :
            afficher "x"
`),
    'il manque « fois »'),
  e('selon-ligne-inconnue', 'grammaire', 'Une ligne inattendue dans « selon »',
    'Sous « selon valeur : », chaque ligne décalée commence par « cas … : » (une ou plusieurs valeurs, reliées par « ou ») ou par « sinon : ».',
    'Commence chaque ligne par « cas » ou « sinon ».',
    p(`
page "accueil" :
    variable jour = "lundi"
    bouton "Go"
    quand l'utilisateur clique sur "Go" :
        selon jour :
            "lundi" :
                afficher "Ouvert"
`),
    p(`
page "accueil" :
    variable jour = "lundi"
    bouton "Go"
    quand l'utilisateur clique sur "Go" :
        selon jour :
            cas "lundi" :
                afficher "Ouvert"
`),
    'chaque ligne commence par « cas'),
  e('calcul-de-liste-sans-liste', 'sens', 'Une moyenne ou une somme sur autre chose qu’une liste de nombres',
    '« moyenne de », « somme de », « minimum de » et « maximum de » calculent sur une liste de nombres. Pour une liste de fiches, on choisit le champ : « somme de panier.prix ».',
    'Donne une liste de nombres, ou le champ d’une liste de fiches.',
    p(`
page "accueil" :
    variable note = 12
    calcul m = moyenne de note
    texte "{m}"
`),
    p(`
page "accueil" :
    variable notes = [12, 15, 9]
    calcul m = moyenne de notes
    texte "{m}"
`),
    'calcule sur une liste de nombres'),
  e('arrondi-sans-nombre', 'sens', '« arrondi de » ou « hasard entre » sans nombre',
    'On arrondit un nombre, et on tire au hasard entre deux nombres. Un texte ne s’arrondit pas.',
    'Donne un nombre, ou une variable qui contient un nombre.',
    p(`
page "accueil" :
    variable prix = "dix"
    calcul p = arrondi de prix
    texte "{p}"
`),
    p(`
page "accueil" :
    variable prix = 10,4
    calcul p = arrondi de prix
    texte "{p}"
`),
    'attend un nombre'),
  e('contient-sans-texte-ni-liste', 'sens', '« contient » sur autre chose qu’un texte ou une liste',
    '« contient » cherche un élément dans une liste (panier contient "Livre") ou un morceau dans un texte (nom contient "Liv"). Un nombre ne contient rien.',
    'Utilise « contient » sur un texte ou une liste ; pour un nombre, compare avec « est egal a ».',
    p(`
page "accueil" :
    variable n = 12
    si n contient 1 :
        texte "oui"
`),
    p(`
page "accueil" :
    variable notes = [12, 15]
    si notes contient 12 :
        texte "oui"
`),
    's\'applique à un texte ou à une liste'),
  e('operation-sans-liste', 'sens', 'Trier, filtrer ou couper autre chose qu’une liste',
    '« trier », « dont », « premier de » et « les … premiers de » travaillent sur une liste. Le nombre de « les … premiers de » est un nombre.',
    'Donne une liste (variable [] ou réponse d’une requête).',
    p(`
page "accueil" :
    variable note = 12
    calcul t = trier note
    texte "{t}"
`),
    p(`
page "accueil" :
    variable notes = [12, 9]
    calcul t = trier notes
    texte "{t}"
`),
    's\'applique à une liste',
    { sites: 2 }),
  e('champ-des-elements-inconnu', 'sens', 'Un champ que les éléments de la liste n’ont pas',
    'Après « dont » ou « trier … par », les noms désignent les champs de chaque élément de la liste. Le message liste les champs connus.',
    'Corrige le nom du champ.',
    p(`
page "accueil" :
    variable produits = [fiche avec nom "Pagne" et prix 25000]
    calcul t = trier produits par poids
    calcul n = nombre de t
    texte "{n}"
`),
    p(`
page "accueil" :
    variable produits = [fiche avec nom "Pagne" et prix 25000]
    calcul t = trier produits par prix
    calcul n = nombre de t
    texte "{n}"
`),
    'n\'est pas un champ des éléments'),
  e('dont-sans-fiches', 'sens', '« dont » sur une liste simple',
    '« dont » garde les éléments dont un champ vérifie la condition : il faut une liste de fiches ou de données du serveur. Pour une liste de nombres ou de textes, on teste chaque valeur dans une boucle.',
    'Utilise une liste de fiches, ou une boucle « pour chaque » avec un « si ».',
    p(`
page "accueil" :
    variable notes = [12, 9]
    calcul bonnes = notes dont note est superieur a 10
    calcul n = nombre de bonnes
    texte "{n}"
`),
    p(`
page "accueil" :
    variable eleves = [fiche avec nom "Awa" et note 12, fiche avec nom "Jean" et note 9]
    calcul bons = eleves dont note est superieur a 10
    calcul n = nombre de bons
    texte "{n}"
`),
    'filtre une liste de fiches'),
  e('devise-inconnue', 'sens', 'Une devise inconnue',
    'Dans un texte, « {prix en FC} » écrit un montant avec sa devise. Humalis connaît les francs congolais (FC), les euros et les dollars.',
    'Écris « en FC », « en euros » ou « en dollars ».',
    p(`
page "accueil" :
    variable prix = 15000
    texte "{prix en yens}"
`),
    p(`
page "accueil" :
    variable prix = 15000
    texte "{prix en FC}"
`),
    'n\'est pas une devise connue'),
  e('argent-sans-nombre', 'sens', 'Un montant ou un pluriel sur autre chose qu’un nombre',
    '« {prix en FC} » et « {n article} » écrivent un nombre : un montant, ou un nombre suivi du mot accordé (« 3 articles »). Un texte ne s’accorde pas.',
    'Mets un nombre entre les accolades.',
    p(`
page "accueil" :
    variable nom = "Awa"
    texte "{nom en FC}"
`),
    p(`
page "accueil" :
    variable prix = 15000
    texte "{prix en FC}"
`),
    's\'écrit après un nombre'),
  e('texte-attendu', 'sens', 'Une opération sur le texte avec autre chose qu’un texte',
    '« majuscules de », « minuscules de », « longueur de », « remplacer », « commence par » et « finit par » travaillent sur du texte.',
    'Donne un texte, ou une variable qui contient un texte.',
    p(`
page "accueil" :
    variable n = 3
    calcul m = majuscules de n
    texte "{m}"
`),
    p(`
page "accueil" :
    variable nom = "Awa"
    calcul m = majuscules de nom
    texte "{m}"
`),
    'attend un texte',
    { sites: 2 }),
  e('option-mal-placee', 'sens', 'Un réglage sur un élément qui ne le comprend pas',
    'Certains réglages n’ont de sens que sur certains blocs : le nombre de colonnes ne se règle que sur une grille, l’espacement sur une ligne, une colonne ou une grille.',
    'Place le réglage sur le bon bloc, ou enveloppe l’élément dans ce bloc.',
    p(`
page "carte" :
    texte "Nos plats" avec colonnes 3
`),
    p(`
page "carte" :
    grille avec colonnes 3 :
        texte "Nos plats"
`),
    'se règle seulement sur', { sites: 2 }),
  e('theme-valeur', 'sens', 'Un thème qui n’existe pas',
    'Le visiteur peut choisir le thème clair, le thème sombre, ou laisser son appareil décider (automatique). Aucun autre choix n’existe.',
    'Écris clair, sombre ou automatique après « changer theme par ».',
    p(`
page "accueil" :
    bouton "Thème"
    quand l'utilisateur clique sur "Thème" :
        changer theme par "bleu"
`),
    p(`
page "accueil" :
    bouton "Thème"
    quand l'utilisateur clique sur "Thème" :
        changer theme par sombre
`),
    'prend clair, sombre ou automatique'),
  e('theme-double', 'sens', 'Deux blocs theme',
    'Le thème est unique : toutes les couleurs et toutes les polices du projet sont dans un seul bloc.',
    'Réunis les lignes des deux blocs en un seul.',
    p(`
theme :
    couleur marque "#0e5a6b"

theme :
    couleur sable "#f3e9d2"

page "accueil" :
    titre "Le Fleuve"
`),
    p(`
theme :
    couleur marque "#0e5a6b"
    couleur sable "#f3e9d2"

page "accueil" :
    titre "Le Fleuve"
`),
    'un seul bloc « theme » par application'),
  e('entete-double', 'sens', 'Deux en-têtes (ou deux pieds de page)',
    'L’en-tête et le pied de page sont communs à toute l’application : il n’y en a qu’un de chaque.',
    'Réunis le contenu des deux blocs en un seul.',
    p(`
entete :
    lien "Accueil" vers "accueil"

entete :
    lien "Carte" vers "accueil"

page "accueil" :
    titre "Le Fleuve"
`),
    p(`
entete :
    lien "Accueil" vers "accueil"
    lien "Carte" vers "accueil"

page "accueil" :
    titre "Le Fleuve"
`),
    'un seul « entete » par application'),
  e('sans-entete-inutile', 'sens', 'Une page sans en-tête, dans une application qui n’en a pas',
    '« sans entete » dit à une page de se passer de l’en-tête commun. Il n’y en a pas, donc la précision ne sert à rien.',
    'Écris le bloc « entete : » en haut du fichier, ou retire « sans entete ».',
    p(`
page "connexion" sans entete :
    titre "Connexion"
`),
    p(`
entete :
    lien "Accueil" vers "connexion"

page "connexion" sans entete :
    titre "Connexion"
`),
    'se passe d\'un en-tête, mais l\'application n\'en a pas', { gravite: 'avertissement', sites: 0 }),
  e('couleur-peu-lisible', 'sens', 'Un texte de couleur trop pâle',
    'Une couleur du thème peut très bien servir de fond, mais en texte elle doit se lire sur le fond de la page, en mode clair comme en mode sombre. Sous un contraste de 3 pour 1, elle se voit mal.',
    'Choisis une couleur plus foncée pour le mode clair (ou plus claire pour le mode sombre), ou emploie-la en fond.',
    p(`
theme :
    couleur sable "#f3e9d2"

page "accueil" :
    titre "Le Fleuve" avec couleur sable
`),
    p(`
theme :
    couleur sable clair "#7a5c1e" sombre "#f3e9d2"

page "accueil" :
    titre "Le Fleuve" avec couleur sable
`),
    'se voit mal sur le fond de la page', { gravite: 'avertissement' }),
  e('formulaire-imbrique', 'sens', 'Un formulaire dans un formulaire',
    'Un formulaire s’envoie en entier : un formulaire placé dedans ne saurait pas lequel des deux envoyer.',
    'Place les deux formulaires l’un à côté de l’autre, ou réunis leurs champs dans un seul.',
    p(`
page "contact" :
    formulaire "message" :
        champ "email"
        formulaire "adresse" :
            champ "ville"
    quand le formulaire "message" est soumis :
        afficher "Merci !"
`),
    p(`
page "contact" :
    formulaire "message" :
        champ "email"
        champ "ville"
    quand le formulaire "message" est soumis :
        afficher "Merci !"
`),
    'un formulaire ne peut pas contenir un autre formulaire'),
  e('choix-sans-parmi', 'grammaire', 'Un choix sans ses valeurs',
    'Un choix ou une liste déroulante propose des valeurs : Humalis attend « parmi » suivi de la liste de ces valeurs.',
    'Ajoute « parmi » et la liste des valeurs, écrite entre crochets ou dans une variable.',
    p(`
page "commande" :
    choix "Taille"
`),
    p(`
page "commande" :
    choix "Taille" parmi ["S", "M", "L"]
`),
    'il manque « parmi »'),
  e('parmi-pas-une-liste-de-textes', 'sens', 'Des valeurs qui ne sont pas des textes',
    'Les valeurs d’un choix ou d’une liste déroulante sont des textes : c’est ce que la personne lit et ce que le champ vaut ensuite.',
    'Écris les valeurs entre guillemets.',
    p(`
page "commande" :
    choix "Quantité" parmi [1, 2, 3]
`),
    p(`
page "commande" :
    choix "Quantité" parmi ["1", "2", "3"]
`),
    'il faut une liste de textes'),
  e('option-hors-champ', 'sens', 'Une option de champ sur un autre élément',
    '« obligatoire », « indice », « minimum » et « maximum » décrivent ce qu’on écrit dans un champ. Un bouton, un texte ou un titre n’en a pas.',
    'Retire l’option, ou place-la sur le champ concerné.',
    p(`
page "paiement" :
    bouton "Payer" avec obligatoire
`),
    p(`
page "paiement" :
    bouton "Payer"
`),
    'pas à un bouton'),
  e('borne-hors-nombre', 'sens', 'Un minimum sur un champ qui n’est pas un nombre',
    '« minimum » et « maximum » comparent des nombres : ils ne valent que pour un champ nombre.',
    'Écris la sorte du champ : champ nombre "…".',
    p(`
page "commande" :
    formulaire "commande" :
        champ "Places" avec minimum 1
    quand le formulaire "commande" est soumis :
        afficher "Merci !"
`),
    p(`
page "commande" :
    formulaire "commande" :
        champ nombre "Places" avec minimum 1
    quand le formulaire "commande" est soumis :
        afficher "Merci !"
`),
    's’applique à un champ nombre'),
  e('bornes-inversees', 'sens', 'Un minimum plus grand que le maximum',
    'Aucun nombre ne peut être à la fois au moins 10 et au plus 2 : le champ refuserait tout.',
    'Échange les deux nombres.',
    p(`
page "commande" :
    formulaire "commande" :
        champ nombre "Places" avec minimum 10 et maximum 2
    quand le formulaire "commande" est soumis :
        afficher "Merci !"
`),
    p(`
page "commande" :
    formulaire "commande" :
        champ nombre "Places" avec minimum 2 et maximum 10
    quand le formulaire "commande" est soumis :
        afficher "Merci !"
`),
    'est plus grand que le maximum'),
  e('indice-sur-case', 'sens', 'Un indice sur une case à cocher ou un choix',
    'L’indice est le texte gris d’un champ vide, là où l’on écrit. Dans une case à cocher ou un choix, on n’écrit rien.',
    'Retire l’indice ; le libellé de la case suffit.',
    p(`
page "inscription" :
    case a cocher "J'accepte" avec indice "Cochez ici"
`),
    p(`
page "inscription" :
    case a cocher "J'accepte"
`),
    'ne s’applique pas à une case à cocher'),

  // --- Les avertissements ---
  e('nom-mot-du-langage', 'avertissement', 'Une variable qui porte le nom d’un mot du langage',
    'Une variable peut s’appeler « titre » ou « vide » : c’est permis. Mais la même ligne peut alors contenir deux fois le même mot avec deux sens (« titre titre »), ce qui se relit mal. Humalis te prévient, sans rien bloquer.',
    'Si tu veux éviter la confusion, choisis un nom plus précis : « titre_page », « message ».',
    p(`
page "accueil" :
    variable titre = "Bienvenue"
    titre titre
`),
    p(`
page "accueil" :
    variable titre_page = "Bienvenue"
    titre titre_page
`),
    'porte le nom d\'un mot du langage',
    { gravite: 'avertissement' }),
  e('formulaire-sans-envoi', 'avertissement', 'Un formulaire qui n’envoie rien',
    'Un formulaire s’envoie par la touche Entrée ou par son bouton. Sans « quand le formulaire … est soumis », rien ne se passe à l’envoi : Humalis te prévient pour que tu n’attendes pas un effet qui ne viendra pas.',
    'Ajoute l’événement du formulaire, avec ce qu’il faut faire quand on l’envoie.',
    p(`
page "contact" :
    formulaire "message" :
        champ "email"
        bouton "Envoyer"
`),
    p(`
page "contact" :
    formulaire "message" :
        champ "email"
        bouton "Envoyer"
    quand le formulaire "message" est soumis :
        afficher "Merci !"
`),
    'n’envoie rien',
    { gravite: 'avertissement' }),
  e('verification-hors-formulaire', 'avertissement', 'Un champ obligatoire hors d’un formulaire',
    '« obligatoire », « minimum » et « maximum » sont vérifiés au moment où l’on envoie un formulaire. Un champ posé seul dans la page n’est jamais envoyé : la vérification n’aurait pas lieu.',
    'Place le champ dans un bloc formulaire, avec son bouton et son événement.',
    p(`
page "contact" :
    champ "Nom" avec obligatoire
`),
    p(`
page "contact" :
    formulaire "contact" :
        champ "Nom" avec obligatoire
        bouton "Envoyer"
    quand le formulaire "contact" est soumis :
        afficher "Merci !"
`),
    'sont vérifiés à l’envoi d’un formulaire',
    { gravite: 'avertissement' }),
  e('classe-css-sans-guillemets', 'grammaire', 'Un nom de classe CSS sans guillemets',
    'Après « avec style », Humalis attend le nom d’une ou plusieurs classes CSS, entre guillemets, comme tout texte.',
    'Mets le nom de la classe entre guillemets. Pour plusieurs classes, sépare-les par des espaces : avec style "principal large".',
    p(`
page "accueil" :
    titre "Bienvenue" avec style grand
`),
    p(`
style :
    .grand { font-size: 3rem; }

page "accueil" :
    titre "Bienvenue" avec style "grand"
`),
    'il manque le nom de la classe CSS entre guillemets',
    { sites: 0 }),
  e('utiliser-sans-style', 'grammaire', '« utiliser » sans « style »',
    'En haut du fichier, « utiliser » sert à charger un fichier CSS : il est suivi de « style », puis du chemin du fichier.',
    'Écris : utiliser style "./theme.css".',
    p(`
utiliser "./theme.css"

page "accueil" :
    titre "Bienvenue"
`),
    p(`
page "accueil" :
    titre "Bienvenue"
`),
    'il manque « style » après « utiliser »',
    { sites: 0 }),
  e('fichier-css-sans-guillemets', 'grammaire', 'Un chemin de fichier CSS sans guillemets',
    'Le chemin du fichier CSS est un texte : il s’écrit entre guillemets.',
    'Écris : utiliser style "./theme.css".',
    p(`
utiliser style theme

page "accueil" :
    titre "Bienvenue"
`),
    p(`
page "accueil" :
    titre "Bienvenue"
`),
    'il manque le chemin du fichier CSS entre guillemets',
    { sites: 0 }),
  e('classe-css-inconnue', 'avertissement', 'Une classe CSS définie nulle part',
    'Un élément porte une classe donnée par « avec style "…" », mais aucun bloc « style : » du fichier ne la définit. C’est souvent une faute de frappe. Humalis ne dit rien quand tu utilises un fichier CSS séparé, qu’il ne lit pas.',
    'Corrige le nom de la classe, ou définis-la dans un bloc « style : ».',
    p(`
style :
    .grand { font-size: 3rem; }

page "accueil" :
    titre "Bienvenue" avec style "grnad"
`),
    p(`
style :
    .grand { font-size: 3rem; }

page "accueil" :
    titre "Bienvenue" avec style "grand"
`),
    'n\'est définie dans aucun bloc style',
    { gravite: 'avertissement', sites: 2 }),
  e('option-variable-inconnue', 'grammaire', 'Une option de variable inconnue',
    'Après « avec », une variable accepte deux options : « partagee » (visible dans toutes les pages) et « memorisee » (gardée après un rechargement). Un autre mot n’a pas de sens ici.',
    'Écris « avec partagee », « avec memorisee », ou les deux reliés par « et ».',
    p(`
page "accueil" :
    variable visites = 0 avec rapide
    texte "{visites}"
`),
    p(`
page "accueil" :
    variable visites = 0 avec memorisee
    texte "{visites}"
`),
    'n\'est pas une option de variable'),
  e('memorisee-en-secret', 'grammaire', 'Un mot après « memorisee en » qui n’est pas « secret »',
    'La seule suite possible de « memorisee en » est « secret ».',
    'Écris « avec memorisee en secret », ou seulement « avec memorisee ».',
    p(`
page "accueil" :
    variable jeton = "" avec memorisee en clair
    texte jeton
`),
    p(`
page "accueil" :
    variable jeton = "" avec memorisee
    texte jeton
`),
    'est attendu après « memorisee en »'),
  e('variable-haut-non-partagee', 'sens', 'Une variable en haut du fichier sans « avec partagee »',
    'Une variable écrite en haut du fichier, hors des pages, est vue par toutes les pages. Humalis demande de l’écrire clairement, pour que personne ne la prenne pour une variable de page.',
    'Ajoute « avec partagee » à la fin de la ligne, ou déplace la variable dans une page.',
    p(`
variable panier = []

page "accueil" :
    texte "{panier}"
`),
    p(`
variable panier = [] avec partagee

page "accueil" :
    texte "{panier}"
`),
    'ajoutez « avec partagee »'),
  e('partagee-dans-une-page', 'sens', 'Une variable partagée déclarée dans une page',
    'Une variable partagée appartient à tout le site : elle se déclare en haut du fichier, pas dans une page.',
    'Déplace la ligne en haut du fichier, hors de toute page.',
    p(`
page "accueil" :
    variable panier = [] avec partagee
    texte "{panier}"
`),
    p(`
variable panier = [] avec partagee

page "accueil" :
    texte "{panier}"
`),
    'se déclare en haut du fichier'),
  e('composant-inconnu', 'sens', 'Un composant qui n’est déclaré nulle part',
    'Un mot qui commence par une majuscule, en tête de ligne, est un composant. Humalis doit savoir d’où il vient : d’un fichier React (« utiliser composant ») ou d’un composant écrit en Humalis (« composant "…" : »).',
    'Déclare le composant en haut du fichier, ou corrige son nom.',
    p(`
page "accueil" :
    Fiche avec nom "Livre"
`),
    p(`
composant "Fiche" :
    parametre nom
    texte nom

page "accueil" :
    Fiche avec nom "Livre"
`),
    'n\'est pas déclaré. Ajoutez en haut du fichier'),
  e('composant-dans-evenement', 'sens', 'Un composant créé dans un événement',
    'Comme un élément, un composant fait partie de la page : il ne peut pas apparaître seulement quand l’utilisateur clique.',
    'Place le composant dans la page. Pour le montrer plus tard, donne-lui un nom et utilise montrer.',
    p(`
composant "Fiche" :
    parametre nom
    texte nom

page "accueil" :
    bouton "Voir"
    quand l'utilisateur clique sur "Voir" :
        Fiche avec nom "Livre"
`),
    p(`
composant "Fiche" :
    parametre nom
    texte nom

page "accueil" :
    Fiche avec nom "Livre"
`),
    'un composant ne peut pas être créé dans un événement'),
  e('parametre-inconnu', 'sens', 'Une propriété qui n’est pas un paramètre du composant',
    'Un composant écrit en Humalis annonce ses paramètres avec « parametre ». On ne peut lui donner que ceux-là.',
    'Utilise un des paramètres listés par le message, ou ajoute-le au composant.',
    p(`
composant "Fiche" :
    parametre nom
    texte nom

page "accueil" :
    Fiche avec nom "Livre" et prix 12
`),
    p(`
composant "Fiche" :
    parametre nom
    parametre prix
    texte nom
    texte "{prix} €"

page "accueil" :
    Fiche avec nom "Livre" et prix 12
`),
    'n\'est pas un paramètre du composant'),
  e('parametre-hors-composant', 'sens', '« parametre » en dehors d’un composant',
    'Un paramètre est une valeur que reçoit un composant : il n’a de sens qu’au début d’un composant écrit en Humalis.',
    'Déplace la ligne au début d’un composant, ou utilise une variable.',
    p(`
page "accueil" :
    parametre nom
    titre "Bienvenue"
`),
    p(`
page "accueil" :
    titre "Bienvenue"
`),
    'ne s\'utilise qu\'au début d\'un composant'),
  e('parametre-oublie', 'avertissement', 'Un paramètre de composant oublié',
    'Le composant attend un paramètre qui ne lui est pas donné : il affichera une valeur vide à cet endroit.',
    'Donne le paramètre après « avec ».',
    p(`
composant "Fiche" :
    parametre nom
    parametre prix
    texte nom
    texte "{prix} €"

page "accueil" :
    Fiche avec nom "Livre"
`),
    p(`
composant "Fiche" :
    parametre nom
    parametre prix
    texte nom
    texte "{prix} €"

page "accueil" :
    Fiche avec nom "Livre" et prix 12
`),
    'n\'est pas donné',
    { gravite: 'avertissement' }),
  e('serveur-ligne-inconnue', 'grammaire', 'Une ligne inconnue dans un serveur',
    'Un bloc serveur ne contient que des données (« donnee … : ») et des routes (« route "…" : »).',
    'Range la ligne dans une donnée ou une route, ou retire-la.',
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    page "accueil" :
        titre "x"
`),
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`),
    'dans un serveur, on écrit',
    { gravite: 'erreur' }),
  e('type-de-champ-inconnu', 'grammaire', 'Un type de champ inconnu',
    'Chaque champ d’une donnée a un type : texte, nombre, booleen, date, ou liste de … .',
    'Choisis un des types listés par le message.',
    p(`
serveur "boutique" :
    donnee produit :
        prix : argent
    route "produits" :
        tout le monde peut lire produit
`),
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`),
    'n\'est pas un type de champ',
    { gravite: 'erreur' }),
  e('qui-peut-agir', 'grammaire', 'Une règle qui ne dit pas qui peut agir',
    'Une règle d’accès commence par qui a le droit : tout le monde, un utilisateur connecté, ou seulement l’administrateur.',
    'Commence la règle par « tout le monde », « connecte » ou « seul admin ».',
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        visiteurs peut lire produit
`),
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`),
    'qui peut agir',
    { gravite: 'erreur' }),
  e('action-inconnue', 'grammaire', 'Une action inconnue dans une règle',
    'Une règle autorise une action sur une donnée : lire, creer, modifier ou supprimer.',
    'Utilise une de ces quatre actions.',
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut voir produit
`),
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`),
    'n\'est pas une action',
    { gravite: 'erreur' }),
  e('donnee-en-double', 'sens', 'Une donnée déclarée deux fois',
    'Deux données portent le même nom dans le même serveur : Humalis ne saurait pas laquelle utiliser.',
    'Renomme l’une des deux, ou réunis leurs champs.',
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    donnee produit :
        nom : texte
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`),
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`),
    'est déjà déclarée (ligne',
    { gravite: 'erreur' }),
  e('champ-en-double', 'sens', 'Un champ déclaré deux fois',
    'Une donnée a deux champs du même nom.',
    'Renomme ou retire l’un des deux.',
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        nom : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`),
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`),
    'le champ « nom » est déjà déclaré',
    { gravite: 'erreur' }),
  e('route-en-double', 'sens', 'Deux routes à la même adresse',
    'Chaque route a sa propre adresse (« /api/produits »). Deux routes ne peuvent pas partager la même.',
    'Change l’adresse de l’une des deux, ou réunis leurs règles.',
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`),
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`),
    'la route « produits » est déjà déclarée',
    { gravite: 'erreur' }),
  e('regle-donnee-inconnue', 'sens', 'Une règle sur une donnée qui n’existe pas',
    'La règle vise une donnée que le serveur ne déclare pas : souvent une faute de frappe ou un pluriel.',
    'Utilise le nom exact de la donnée, listé par le message.',
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
        connecte peut lire produits
`),
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`),
    'n\'existe pas dans le serveur',
    { gravite: 'erreur' }),
  e('route-deux-donnees', 'sens', 'Une route qui sert deux données',
    'Une route correspond à une seule donnée, pour que son adresse dise ce qu’elle contient.',
    'Écris une route par donnée.',
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    donnee client :
        nom : texte
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
        tout le monde peut lire client
    route "clients" :
        tout le monde peut lire client
        seul admin peut modifier client
`),
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`),
    'une route ne sert qu\'une donnée',
    { gravite: 'erreur' }),
  e('action-sans-regle', 'avertissement', 'Une action que personne ne peut faire',
    'Sur un serveur Humalis, la porte est fermée par défaut : une action sans règle est refusée à tout le monde. C’est souvent voulu, mais Humalis te le rappelle.',
    'Ajoute une règle pour cette action si quelqu’un doit pouvoir la faire.',
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
`),
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`),
    'ces actions seront refusées',
    { gravite: 'avertissement' }),
  e('donnee-sans-route', 'avertissement', 'Une donnée sans route',
    'Une donnée qu’aucune route ne sert ne peut être ni lue ni modifiée depuis l’application.',
    'Ajoute une route avec des règles pour cette donnée.',
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre

`),
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        seul admin peut modifier produit
`),
    'aucune route ne donne accès',
    { gravite: 'avertissement' }),
  e('champ-donnee-inconnu', 'sens', 'Un champ qui n’existe pas dans la donnée',
    'La page lit un champ (p.prixx) que la donnée du serveur ne déclare pas. Humalis le voit avant même de lancer quoi que ce soit, parce que les pages et le serveur sont dans le même fichier.',
    'Utilise un des champs listés par le message, ou ajoute le champ à la donnée.',
    p(`
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

page "boutique" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" dans produits
    pour chaque p dans produits :
        texte p.prixx
`),
    p(`
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

page "boutique" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" dans produits
    pour chaque p dans produits :
        texte p.nom
`),
    'n\'existe pas dans la donnée',
    { gravite: 'erreur' }),
  e('champ-sur-une-valeur', 'sens', 'Lire un champ sur autre chose qu’une donnée',
    'Le point (x.nom) lit le champ d’une donnée reçue du serveur. Sur un nombre ou un texte, il n’y a pas de champ à lire.',
    'Utilise le point seulement sur une donnée du serveur, par exemple sur la variable d’une boucle sur une liste lue avec envoyer requete.',
    p(`
page "accueil" :
    variable prix = 12
    texte prix.montant
`),
    p(`
page "accueil" :
    variable prix = 12
    texte prix
`),
    'on ne lit un champ',
    { gravite: 'erreur' }),
  e('route-inconnue', 'sens', 'Une requête vers une route qui n’existe pas',
    'La page appelle une adresse que le serveur du fichier ne déclare pas : souvent un singulier au lieu d’un pluriel.',
    'Utilise une des routes listées par le message.',
    p(`
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

page "boutique" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produit" dans produits
    pour chaque p dans produits :
        texte p.nom
`),
    p(`
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

page "boutique" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" dans produits
    pour chaque p dans produits :
        texte p.nom
`),
    'aucune route',
    { gravite: 'erreur' }),
  e('champ-envoye-inconnu', 'sens', 'Un champ envoyé que la donnée ne connaît pas',
    'Une requête qui envoie des valeurs vers une route doit n’envoyer que des champs de sa donnée : le nom d’un champ de la page, ou d’une variable, doit être celui d’un champ de la donnée.',
    'Renomme le champ de la page ou la variable comme le champ de la donnée.',
    p(`
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
        tout le monde peut creer avis
        seul admin peut modifier avis

page "avis" :
    variable note = 5
    champ "commentair"
    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer requete vers "avis" avec note et champ "commentair"
`),
    p(`
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
        tout le monde peut creer avis
        seul admin peut modifier avis

page "avis" :
    variable note = 5
    champ "commentaire"
    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer requete vers "avis" avec note et champ "commentaire"
`),
    'n\'a pas de champ',
    { gravite: 'erreur' }),
  e('champ-envoye-mauvais-type', 'sens', 'Un champ envoyé du mauvais type',
    'La valeur envoyée n’a pas le type que la donnée attend : un texte à la place d’un nombre, par exemple. Le serveur la refuserait ; Humalis le dit avant.',
    'Envoie une valeur du type attendu.',
    p(`
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
        tout le monde peut creer avis
        seul admin peut modifier avis

page "avis" :
    variable note = "cinq"
    champ "commentaire"
    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer requete vers "avis" avec note et champ "commentaire"
`),
    p(`
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
        tout le monde peut creer avis
        seul admin peut modifier avis

page "avis" :
    variable note = 5
    champ "commentaire"
    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer requete vers "avis" avec note et champ "commentaire"
`),
    'attend un nombre',
    { gravite: 'erreur' }),
  e('requete-connexion-requise', 'avertissement', 'Une requête réservée aux utilisateurs connectés',
    'La règle du serveur demande d’être connecté : un visiteur qui fait cette requête sera refusé. C’est souvent voulu ; Humalis te le rappelle.',
    'Rien à corriger si c’est voulu. Sinon, change la règle d’accès dans la route.',
    p(`
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

page "avis" :
    variable note = 5
    champ "commentaire"
    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer requete vers "avis" avec note et champ "commentaire"
`),
    p(`
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
        tout le monde peut creer avis
        seul admin peut modifier avis

page "avis" :
    variable note = 5
    champ "commentaire"
    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer requete vers "avis" avec note et champ "commentaire"
`),
    'il faut être connecté',
    { gravite: 'avertissement' }),
  e('requete-admin-requis', 'avertissement', 'Une requête réservée à l’admin',
    'La règle du serveur réserve cette action à l’administrateur : la requête sera refusée à un visiteur.',
    'Rien à corriger si c’est voulu. Sinon, change la règle d’accès dans la route.',
    p(`
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
        seul admin peut creer avis
        seul admin peut modifier avis

page "avis" :
    variable note = 5
    champ "commentaire"
    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer requete vers "avis" avec note et champ "commentaire"
`),
    p(`
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
        tout le monde peut creer avis
        seul admin peut modifier avis

page "avis" :
    variable note = 5
    champ "commentaire"
    bouton "Envoyer"
    quand l'utilisateur clique sur "Envoyer" :
        envoyer requete vers "avis" avec note et champ "commentaire"
`),
    'seul un admin peut',
    { gravite: 'avertissement' }),
  e('page-cible-absente', 'avertissement', 'Une page cible qui n’existe pas',
    'Un lien ou une redirection mène vers une page qui n’est pas dans ce fichier. Ce n’est pas forcément une faute (la page peut être dans un autre fichier plus tard), alors Humalis avertit sans bloquer.',
    'Vérifie le nom de la page cible, ou ajoute la page.',
    p(`
page "accueil" :
    lien "Nous contacter" vers "contact"
`),
    p(`
page "accueil" :
    lien "Nous contacter" vers "contact"

page "contact" :
    titre "Contact"
`),
    'n\'existe pas dans ce fichier',
    { gravite: 'avertissement' }),

  // --- La connexion depuis une page (décision L5) ---
  e('connexion-sans-serveur', 'sens', 'Se connecter sans serveur',
    'La connexion passe par le serveur du même fichier et ses packs Astratra : ce sont eux qui vérifient le mot de passe et ouvrent la session. Sans serveur, il n’y a personne à qui demander.',
    'Ajoute un bloc serveur "…" : dans le même fichier.',
    p(`
page "connexion" :
    champ "email"
    champ "mot de passe"
    bouton "Se connecter"
    quand l'utilisateur clique sur "Se connecter" :
        se connecter avec champ "email" et champ "mot de passe"
`),
    p(`
serveur "club" :
    donnee membre :
        nom : texte
    route "membres" :
        tout le monde peut lire membre
        seul admin peut modifier membre

page "connexion" :
    champ "email"
    champ "mot de passe"
    bouton "Se connecter"
    quand l'utilisateur clique sur "Se connecter" :
        se connecter avec champ "email" et champ "mot de passe"
`),
    'demande un serveur dans le même fichier'),
  e('connexion-deux-champs', 'sens', 'Se connecter sans deux champs',
    '« se connecter » envoie l’email et le mot de passe que la personne a tapés : ils doivent venir de deux champs de la page.',
    'Écris : se connecter avec champ "email" et champ "mot de passe".',
    p(`
serveur "club" :
    donnee membre :
        nom : texte
    route "membres" :
        tout le monde peut lire membre
        seul admin peut modifier membre

page "connexion" :
    variable email = "emch@exemple.cd"
    champ "mot de passe"
    bouton "Se connecter"
    quand l'utilisateur clique sur "Se connecter" :
        se connecter avec email et champ "mot de passe"
`),
    p(`
serveur "club" :
    donnee membre :
        nom : texte
    route "membres" :
        tout le monde peut lire membre
        seul admin peut modifier membre

page "connexion" :
    champ "email"
    champ "mot de passe"
    bouton "Se connecter"
    quand l'utilisateur clique sur "Se connecter" :
        se connecter avec champ "email" et champ "mot de passe"
`),
    'attend deux champs de la page'),
  e('connexion-meme-champ', 'sens', 'Le même champ deux fois',
    'L’email et le mot de passe viennent du même champ : la connexion ne peut pas réussir.',
    'Donne deux champs différents : d’abord l’email, puis le mot de passe.',
    p(`
serveur "club" :
    donnee membre :
        nom : texte
    route "membres" :
        tout le monde peut lire membre
        seul admin peut modifier membre

page "connexion" :
    champ "email"
    champ "mot de passe"
    bouton "Se connecter"
    quand l'utilisateur clique sur "Se connecter" :
        se connecter avec champ "email" et champ "email"
`),
    p(`
serveur "club" :
    donnee membre :
        nom : texte
    route "membres" :
        tout le monde peut lire membre
        seul admin peut modifier membre

page "connexion" :
    champ "email"
    champ "mot de passe"
    bouton "Se connecter"
    quand l'utilisateur clique sur "Se connecter" :
        se connecter avec champ "email" et champ "mot de passe"
`),
    'attend deux champs différents'),
  e('connexion-hors-evenement', 'sens', 'Se connecter en dehors d’un événement',
    'Se connecter, c’est une action : elle se fait quand la personne touche un bouton, pas pendant l’affichage de la page.',
    'Place « se connecter » dans un « quand l’utilisateur clique sur … : ».',
    p(`
serveur "club" :
    donnee membre :
        nom : texte
    route "membres" :
        tout le monde peut lire membre
        seul admin peut modifier membre

page "compte" :
    bouton "Se déconnecter"
    se deconnecter
`),
    p(`
serveur "club" :
    donnee membre :
        nom : texte
    route "membres" :
        tout le monde peut lire membre
        seul admin peut modifier membre

page "compte" :
    bouton "Se déconnecter"
    quand l'utilisateur clique sur "Se déconnecter" :
        se deconnecter
`),
    'ne s\'utilise que dans un événement'),
  e('connexion-nom-utilisateur', 'sens', 'Une variable qui s’appelle « utilisateur »',
    'Dans une page qui lit la session (« si utilisateur est connecte », « se connecter »), le mot « utilisateur » désigne la personne connectée. Une variable du même nom la cacherait.',
    'Donne un autre nom à ta variable, par exemple « membre ».',
    p(`
serveur "club" :
    donnee membre :
        nom : texte
    route "membres" :
        tout le monde peut lire membre
        seul admin peut modifier membre

page "accueil" :
    variable utilisateur = "Emch"
    si utilisateur est connecte :
        texte "Bonjour"
`),
    p(`
serveur "club" :
    donnee membre :
        nom : texte
    route "membres" :
        tout le monde peut lire membre
        seul admin peut modifier membre

page "accueil" :
    variable membre = "Emch"
    si utilisateur est connecte :
        texte "Bonjour {membre}"
`),
    'le nom « utilisateur » est pris par la session'),

  // --- Modifier et supprimer depuis une page (trou G2) ---
  e('operation-sans-serveur', 'sens', 'Supprimer sans serveur',
    '« supprimer » et « modifier » changent une donnée sur le serveur du même fichier. Sans serveur, il n’y a rien à changer.',
    'Ajoute un bloc serveur "…" : avec la route visée, ou utilise « retirer … de … » pour ne changer que la liste de la page.',
    p(`
page "gestion" :
    variable produits = []
    pour chaque p dans produits :
        texte p
        bouton "Supprimer"
        quand l'utilisateur clique sur "Supprimer" :
            supprimer p de "produits"
`),
    p(`
page "gestion" :
    variable produits = ["Livre", "Stylo"]
    pour chaque p dans produits :
        texte p
        bouton "Retirer"
        quand l'utilisateur clique sur "Retirer" :
            retirer p de produits
`),
    'demande un serveur dans le même fichier : ajoutez'),
  e('operation-pas-une-donnee', 'sens', 'Supprimer autre chose qu’une donnée',
    'Pour supprimer ou modifier sur le serveur, Humalis envoie l’identifiant de la donnée. Il faut donc une donnée lue sur cette route, par exemple la variable d’une boucle sur la liste reçue.',
    'Parcours la liste lue sur la route avec « pour chaque p dans produits », et supprime p.',
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        connecte peut modifier produit

page "gestion" :
    variable nom = "Livre"
    si utilisateur est connecte :
        bouton "Supprimer"
    quand l'utilisateur clique sur "Supprimer" :
        supprimer nom de "produits"
`),
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        connecte peut modifier produit

page "gestion" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" dans produits
    pour chaque p dans produits :
        texte p.nom
        si utilisateur est connecte :
            bouton "Supprimer"
        quand l'utilisateur clique sur "Supprimer" :
            supprimer p de "produits"
`),
    'attend un « produit » lu sur cette route'),
  e('operation-hors-evenement', 'sens', 'Supprimer en dehors d’un événement',
    'Supprimer ou modifier, c’est une action : elle se fait quand la personne touche un bouton, pas pendant l’affichage de la page.',
    'Place « supprimer » ou « modifier » dans un « quand l’utilisateur clique sur … : ».',
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        connecte peut modifier produit

page "gestion" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" dans produits
    pour chaque p dans produits :
        texte p.nom
        si utilisateur est connecte :
            bouton "Supprimer"
            supprimer p de "produits"
`),
    p(`
serveur "boutique" :
    donnee produit :
        nom : texte
        prix : nombre
    route "produits" :
        tout le monde peut lire produit
        connecte peut modifier produit

page "gestion" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" dans produits
    pour chaque p dans produits :
        texte p.nom
        si utilisateur est connecte :
            bouton "Supprimer"
        quand l'utilisateur clique sur "Supprimer" :
            supprimer p de "produits"
`),
    '« supprimer » ne s\'utilise que dans un événement'),
  // --- Les pages à paramètre (trou G3) ---
  e('parametre-page-manquant', 'sens', 'Un lien qui oublie le paramètre de la page',
    'La page cible lit une valeur dans son adresse (« page "produit" avec parametre nom »). Un lien vers elle doit donc donner cette valeur, sinon la page ne saurait pas quoi afficher.',
    'Ajoute la valeur après « avec » : lien … vers "produit" avec article …',
    p(`
page "boutique" :
    variable produits = ["Livre", "Stylo"]
    pour chaque article dans produits :
        lien article vers "produit"

page "produit" avec parametre article :
    titre "{article}"
`),
    p(`
page "boutique" :
    variable produits = ["Livre", "Stylo"]
    pour chaque article dans produits :
        lien article vers "produit" avec article article

page "produit" avec parametre article :
    titre "{article}"
`),
    'attend le paramètre'),
  e('parametre-page-inconnu', 'sens', 'Un paramètre que la page ne connaît pas',
    'Le lien donne une valeur que la page cible n’attend pas : elle serait perdue. Les paramètres possibles sont ceux écrits après « page "…" avec parametre ».',
    'Retire ce paramètre du lien, ou ajoute-le à la page cible (et parametre …).',
    p(`
page "boutique" :
    variable produits = ["Livre", "Stylo"]
    pour chaque article dans produits :
        lien article vers "produit" avec article article et quantite 2

page "produit" avec parametre article :
    titre "{article}"
`),
    p(`
page "boutique" :
    variable produits = ["Livre", "Stylo"]
    pour chaque article dans produits :
        lien article vers "produit" avec article article

page "produit" avec parametre article :
    titre "{article}"
`),
    'n\'a pas de paramètre'),
  e('parametre-page-option', 'sens', 'Un paramètre de page qui porte le nom d’une option',
    '« nom », « couleur », « taille »… sont des options des éléments (« avec nom "…" », « avec couleur bleu »). Un lien ne pourrait jamais donner ce paramètre : Humalis lirait une option.',
    'Choisis un autre nom pour le paramètre, par exemple « article » au lieu de « nom ».',
    p(`
page "produit" avec parametre nom :
    titre "{nom}"
`),
    p(`
page "produit" avec parametre article :
    titre "{article}"
`),
    'ne peut pas nommer un paramètre de page'),
  e('rediriger-parametre-calcule', 'sens', 'Des paramètres vers une page calculée',
    'Pour donner un paramètre à une page, Humalis doit savoir laquelle, dès la compilation : c’est elle qui dit quels paramètres elle attend et où ils vont dans l’adresse. Une page dont le nom est dans une variable n’est connue qu’à l’exécution.',
    'Écris le nom de la page entre guillemets : rediriger vers "produit" avec id …',
    p(`
page "liste" :
    variable destination = "produit"
    bouton "Voir"
    quand l'utilisateur clique sur "Voir" :
        rediriger vers destination avec id "1"

page "produit" avec parametre id :
    texte "{id}"
`),
    p(`
page "liste" :
    bouton "Voir"
    quand l'utilisateur clique sur "Voir" :
        rediriger vers "produit" avec id "1"

page "produit" avec parametre id :
    texte "{id}"
`),
    'demande le nom de la page entre guillemets'),
  // --- Les sources (API existantes) ---
  e('source-ligne-inconnue', 'grammaire', 'Une ligne qui n’existe pas dans une source',
    'Un bloc « source » décrit une API qui existe déjà, avec un petit nombre de lignes : adresse, session, enveloppe, erreur, entete, jeton, cache, essais, delai, donnee, route. Un autre mot est refusé.',
    'Écris une des lignes permises. Ici, « adresse » (au singulier).',
    p(`
source "boutique" :
    adresses "https://api.exemple.cd"

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"

page "accueil" :
    texte "Bonjour"
`),
    "n'est pas une ligne d'une source"),
  e('source-session', 'grammaire', 'Une session qui n’est pas celle des packs Astratra',
    'La session d’une source est celle des packs Astratra (cookie HttpOnly et jeton CSRF). Humalis n’en invente pas d’autre : le seul mot permis après « session » est « astratra ».',
    'Écris « session astratra », ou retire la ligne si l’API n’a pas de connexion.',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    session maison

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    session astratra

page "accueil" :
    texte "Bonjour"
`),
    '« session » est suivi de « astratra »'),
  e('source-duree', 'grammaire', 'Une durée sans unité, ou un nombre qui n’en est pas un',
    'Un cache ou un délai s’écrit avec un nombre entier et une unité (secondes, minutes ou heures). Le nombre d’essais est un nombre entier seul.',
    'Écris « cache 5 minutes », « delai 10 secondes », « essais 2 ».',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    cache 5

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    cache 5 minutes

page "accueil" :
    texte "Bonjour"
`),
    "une durée s'écrit avec un nombre entier et une unité", { sites: 2 }),
  e('jeton-secret-en-clair', 'grammaire', 'Un jeton secret écrit dans le fichier',
    'Le fichier Humalis est lu par tout le monde qui reçoit le projet, et le code produit part dans le navigateur. Un secret ne s’y écrit donc jamais : on n’écrit que le nom de la variable d’environnement du serveur, qui garde la valeur.',
    'Si la valeur peut être vue (une clé publiable), écris « jeton public ». Sinon, « jeton secret depuis l’environnement "NOM" », avec un bloc serveur, et mets la valeur dans le fichier .env du serveur.',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    jeton secret "abc123"

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    jeton public "pk_abc123"

page "accueil" :
    texte "Bonjour"
`),
    "ne s'écrit jamais dans le fichier"),
  e('jeton-genre', 'grammaire', 'Un jeton ni public ni secret',
    'Il y a deux sortes de jetons : le public, fait pour être vu, et le secret, qui reste sur le serveur. Après « jeton », il faut dire lequel. Un jeton se place dans l’en-tête (« dans l’entete "X-Cle" ») ou dans l’adresse (« dans le parametre "key" »).',
    'Écris « jeton public "…" » ou « jeton secret depuis l’environnement "NOM" ».',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    jeton prive "abc"

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    jeton public "abc"

page "accueil" :
    texte "Bonjour"
`),
    'après « jeton », écrivez', { sites: 2 }),
  e('source-regle', 'grammaire', 'Une règle de route qui n’en est pas une',
    'Une route de source dit ce que l’API sait faire avec une action : lire, creer, modifier ou supprimer, puis la donnée. Devant l’action, une source à jeton secret écrit aussi qui peut l’appeler.',
    'Écris une des quatre actions, par exemple « lire une liste de produit ».',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee produit :
        nom : texte
    route "produits" :
        voir une liste de produit

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee produit :
        nom : texte
    route "produits" :
        lire une liste de produit

page "accueil" :
    texte "Bonjour"
`),
    "n'est pas une action", { sites: 3 }),
  e('source-sans-adresse', 'sens', 'Une source sans adresse',
    'Sans adresse de base, Humalis ne sait pas où appeler l’API.',
    'Ajoute la ligne « adresse "https://…" » dans la source.',
    p(`
source "boutique" :
    cache 5 minutes

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"

page "accueil" :
    texte "Bonjour"
`),
    "n'a pas d'adresse"),
  e('source-doublon', 'sens', 'Un nom pris deux fois dans les sources',
    'Une source, une donnée, un champ ou une route ne se déclare qu’une fois : sinon Humalis ne saurait pas laquelle tu veux.',
    'Retire la seconde déclaration, ou change son nom.',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
source "boutique" :
    adresse "https://autre.exemple.cd"

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
source "autre" :
    adresse "https://autre.exemple.cd"

page "accueil" :
    texte "Bonjour"
`),
    'est déjà déclarée', { sites: 4 }),
  e('source-entete-identification', 'sens', 'Un en-tête d’identification écrit dans le fichier',
    'Un en-tête fixe est public : sa valeur part dans le code envoyé au navigateur. Les en-têtes qui identifient (Authorization, Cookie, X-Api-Key…) doivent passer par « jeton », pour que le secret soit traité comme tel.',
    'Remplace la ligne « entete » par « jeton public "…" » ou « jeton secret depuis l’environnement "NOM" ».',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    entete "Authorization" vaut "Bearer abc"

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    jeton public "abc"

page "accueil" :
    texte "Bonjour"
`),
    "voyagerait jusqu'au navigateur"),
  e('source-secret-reconnu', 'sens', 'Une valeur qui ressemble à un secret',
    'Un jeton public est lisible par tout le monde. Humalis reconnaît quelques formes de secrets connues (sk_live_, ghp_, AKIA…) et refuse de les envoyer au navigateur. Cette liste est une aide, pas une garantie : c’est à toi de savoir ce qui est secret.',
    'Si c’est un vrai secret, utilise « jeton secret depuis l’environnement "NOM" » et un bloc serveur. Sinon, utilise la clé publiable de l’API.',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    jeton public "sk_live_abcdefghijklmnop"

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    jeton public "pk_live_abcdefghijklmnop"

page "accueil" :
    texte "Bonjour"
`),
    'ressemble à un secret', { sites: 2 }),
  e('source-secret-sans-serveur', 'sens', 'Un jeton secret sans serveur pour le garder',
    'Un secret ne peut pas partir dans le navigateur : l’appel doit passer par un serveur qui connaît le secret. Sans bloc serveur, Humalis refuse. Et la passerelle du serveur n’est pas encore écrite : tant qu’elle manque, un jeton secret est refusé même avec un serveur, plutôt que d’être mal traité.',
    'Pour l’instant, utilise un jeton public, ou appelle l’API depuis ton propre serveur.',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    jeton secret depuis l'environnement "BOUTIQUE_CLE"

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    jeton public "pk_abc"

page "accueil" :
    texte "Bonjour"
`),
    'ne peut pas partir dans le navigateur', { sites: 3 }),
  e('source-donnee-inconnue', 'sens', 'Une route qui parle d’une donnée absente',
    'Chaque route dit quelle donnée elle rend ; cette donnée doit être déclarée dans la même source, avec ses champs.',
    'Déclare la donnée (donnee produit : …) ou corrige son nom.',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    route "produits" :
        lire une liste de produit

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee produit :
        nom : texte
    route "produits" :
        lire une liste de produit

page "accueil" :
    texte "Bonjour"
`),
    "n'existe pas dans la source"),
  e('source-qui-peut', 'sens', '« Qui peut » dans une source qui n’en a pas besoin',
    'Les mots « tout le monde peut », « connecte peut », « seul admin peut » ne servent que quand le serveur Humalis est la porte, c’est-à-dire pour une source à jeton secret. Pour une autre API, c’est elle qui décide qui peut.',
    'Retire « tout le monde peut » devant l’action.',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee produit :
        nom : texte
    route "produits" :
        tout le monde peut lire une liste de produit

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee produit :
        nom : texte
    route "produits" :
        lire une liste de produit

page "accueil" :
    texte "Bonjour"
`),
    "n'a de sens que pour une source à jeton secret", { sites: 2 }),
  e('source-session-double', 'sens', 'Deux sources, ou une source et un serveur, qui donnent la session',
    'La session (utilisateur, se connecter, se deconnecter) vient d’un seul endroit.',
    'Garde « session astratra » dans une seule source, et pas dans une source si le serveur du fichier la donne déjà.',
    p(`
source "a" :
    adresse "https://a.exemple.cd"
    session astratra
source "b" :
    adresse "https://b.exemple.cd"
    session astratra

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "a" :
    adresse "https://a.exemple.cd"
    session astratra
source "b" :
    adresse "https://b.exemple.cd"

page "accueil" :
    texte "Bonjour"
`),
    'une seule source peut donner la session', { sites: 2 }),
  e('source-http', 'avertissement', 'Un jeton envoyé sans chiffrement',
    'Une adresse en http:// ne chiffre rien : le jeton voyage en clair sur le réseau.',
    'Utilise une adresse en https://.',
    p(`
source "boutique" :
    adresse "http://api.exemple.cd"
    jeton public "pk_abc"

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    jeton public "pk_abc"

page "accueil" :
    texte "Bonjour"
`),
    'envoie un jeton en clair', { gravite: 'avertissement' }),
  e('requete-filtrant-sans-source', 'sens', '« filtrant par » sans source',
    '« filtrant par » ajoute des paramètres à l’adresse d’une lecture sur une API. Il faut dire quelle API : « de la source "…" ».',
    'Écris « de la source "boutique" » avant « filtrant par ».',
    p(`
page "catalogue" :
    variable p = []
    quand la page se charge :
        envoyer requete vers "x" filtrant par k = "v" dans p
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"

page "catalogue" :
    variable p = []
    quand la page se charge :
        envoyer requete vers "x" de la source "boutique" filtrant par k = "v" dans p
`),
    'demande la source visée'),
  e('requete-source-inconnue', 'sens', 'Une source qui n’existe pas',
    'Le nom après « de la source » doit être celui d’un bloc « source » du programme. Humalis liste ceux qui existent.',
    'Corrige le nom, ou déclare la source.',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee produit :
        nom : texte
    route "produits" :
        lire une liste de produit

page "catalogue" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" de la source "boutik" dans produits
    pour chaque p dans produits :
        texte p.nom
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee produit :
        nom : texte
    route "produits" :
        lire une liste de produit

page "catalogue" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" de la source "boutique" dans produits
    pour chaque p dans produits :
        texte p.nom
`),
    'aucune source « boutik »', { sites: 2 }),
  e('requete-lit-et-envoie', 'sens', 'Lire et envoyer dans la même requête',
    '« filtrant par » sert à lire, « avec » à envoyer des données : une requête fait l’un ou l’autre.',
    'Garde « filtrant par » pour une lecture, ou « avec » pour un envoi.',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee produit :
        nom : texte
    route "produits" :
        lire une liste de produit
        creer produit

page "catalogue" :
    variable produits = []
    variable k = "v"
    quand la page se charge :
        envoyer requete vers "produits" de la source "boutique" filtrant par k = "v" avec k dans produits
    texte "x"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee produit :
        nom : texte
    route "produits" :
        lire une liste de produit

page "catalogue" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" de la source "boutique" dans produits
    pour chaque p dans produits :
        texte p.nom
`),
    "ne lit et n'envoie pas à la fois"),
  e('requete-route-inconnue', 'sens', 'Une route que la source ne connaît pas',
    'Quand une source déclare ses routes, les requêtes doivent en viser une. Humalis liste celles qui existent.',
    'Corrige l’adresse, ou ajoute la route à la source.',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee produit :
        nom : texte
    route "produits" :
        lire une liste de produit

page "catalogue" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produit" de la source "boutique" dans produits
    pour chaque p dans produits :
        texte p.nom
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee produit :
        nom : texte
    route "produits" :
        lire une liste de produit

page "catalogue" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" de la source "boutique" dans produits
    pour chaque p dans produits :
        texte p.nom
`),
    'dans la source « boutique ». Routes', { sites: 2 }),
  e('requete-action-non-permise', 'sens', 'Une action que la route ne permet pas',
    'La route dit ce que l’API sait faire (lire une liste, lire un élément, creer, modifier, supprimer). Une requête qui fait autre chose est refusée avant même de partir.',
    'Ajoute l’action à la route de la source, si l’API la permet.',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee produit :
        nom : texte
    route "produits" :
        lire une liste de produit

page "catalogue" :
    variable produits = []
    variable k = "v"
    quand la page se charge :
        envoyer requete vers "produits" de la source "boutique" avec k dans produits
    texte "x"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee produit :
        nom : texte
    route "produits" :
        lire une liste de produit

page "catalogue" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" de la source "boutique" dans produits
    pour chaque p dans produits :
        texte p.nom
`),
    'ne dit pas', { sites: 2 }),
  e('operation-objet-attendu', 'sens', 'Supprimer ou modifier autre chose qu’une donnée de la route',
    'Pour supprimer ou modifier sur une API, Humalis a besoin de l’identifiant d’une donnée lue sur cette route : la variable d’une boucle sur la liste.',
    'Écris « pour chaque m dans membres : » puis « supprimer m de … ».',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee membre :
        nom : texte
    donnee produit :
        nom : texte
    route "membres" :
        lire une liste de membre
        supprimer membre
    route "produits" :
        lire une liste de produit

page "equipe" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" de la source "boutique" dans produits
    pour chaque p dans produits :
        bouton "Retirer"
        quand l'utilisateur clique sur "Retirer" :
            supprimer p de "membres" de la source "boutique"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee membre :
        nom : texte
    route "membres" :
        lire une liste de membre
        supprimer membre

page "equipe" :
    variable membres = []
    quand la page se charge :
        envoyer requete vers "membres" de la source "boutique" dans membres
    pour chaque m dans membres :
        bouton "Retirer"
        quand l'utilisateur clique sur "Retirer" :
            supprimer m de "membres" de la source "boutique"
`),
    'attend un « membre » lu sur cette route'),
  e('recharger-hors-evenement', 'sens', 'Recharger en dehors d’un événement',
    '« recharger » relance une requête : c’est une action, qui n’a de sens que quand quelque chose se passe (un clic, le chargement de la page).',
    'Place « recharger » sous un événement, par exemple un bouton « Réessayer ».',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"

page "catalogue" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" de la source "boutique" dans produits
    recharger produits
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"

page "catalogue" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" de la source "boutique" dans produits
    bouton "Réessayer"
    quand l'utilisateur clique sur "Réessayer" :
        recharger produits
`),
    "« recharger » ne s'utilise que dans un événement"),
  e('etat-sans-requete', 'sens', 'L’état d’une variable qui ne reçoit pas de requête',
    '« produits est en chargement », « produits est en erreur », « erreur de produits » et « recharger produits » parlent de la requête qui remplit la variable. Il faut donc qu’une requête vers une source la remplisse (« dans produits »).',
    'Ajoute « envoyer requete vers "…" de la source "…" dans produits », ou retire la condition.',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"

page "catalogue" :
    variable produits = []
    si produits est en chargement :
        texte "Chargement…"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"

page "catalogue" :
    variable produits = []
    quand la page se charge :
        envoyer requete vers "produits" de la source "boutique" dans produits
    si produits est en chargement :
        texte "Chargement…"
`),
    "ne reçoit aucune requête vers une source", { sites: 0 }),
  e('source-donnee-imbriquee', 'sens', 'Un champ qui parle d’une donnée absente',
    'Un champ d’une donnée de source peut être une autre donnée de la même source (un produit a des variantes) ou une liste de celles-ci. Cette autre donnée doit être déclarée dans la source.',
    'Déclare la donnée (donnee variante : …) ou corrige son nom.',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee produit :
        nom : texte
        variantes : liste de variante

page "accueil" :
    texte "Bonjour"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    donnee variante :
        label : texte
    donnee produit :
        nom : texte
        variantes : liste de variante

page "accueil" :
    texte "Bonjour"
`),
    "n'est ni un type (texte, nombre, booleen, date) ni une donnée de la source"),
  // --- La navigation (adresses, page 404, pages réservées) ---
  e('page-reservee-mot', 'grammaire', 'Une page réservée à personne',
    'Une page peut être réservée aux personnes connectées ou aux admins. Les deux seuls mots permis après « reservee » sont « connecte » et « admin », comme dans les règles du serveur.',
    'Écris « reservee a connecte » ou « reservee a admin ».',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    session astratra

page "compte" reservee a tous :
    titre "Compte"

page "connexion" :
    titre "Connexion"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    session astratra

page "compte" reservee a connecte :
    titre "Compte"

page "connexion" :
    titre "Connexion"
`),
    '« reservee » est suivi de « connecte » ou de « admin »'),
  e('page-adresse-slash', 'sens', 'Une adresse de page qui ne commence pas par /',
    'L’adresse choisie d’une page est un chemin du site : elle commence toujours par une barre oblique. Un morceau « :slug » déclare une valeur lue dans l’adresse.',
    'Écris l’adresse avec une barre au début : "/collections/:slug".',
    p(`
page "collection" adresse "collections/:slug" :
    titre "Collection"
`),
    p(`
page "collection" adresse "/collections/:slug" :
    titre "Collection"
`),
    'doit commencer par /'),
  e('page-adresse-doublon', 'sens', 'Deux pages à la même adresse',
    'Une adresse ne mène qu’à une seule page : sinon Humalis ne saurait pas laquelle afficher.',
    'Change l’adresse de l’une des deux pages.',
    p(`
page "a" adresse "/pareil" :
    titre "A"

page "b" adresse "/pareil" :
    titre "B"
`),
    p(`
page "a" adresse "/pareil" :
    titre "A"

page "b" adresse "/autre" :
    titre "B"
`),
    'est déjà celle de la page'),
  e('page-introuvable-regles', 'sens', 'Une page 404 avec une adresse, un paramètre ou une réservation',
    'La page nommée « introuvable » s’affiche pour toute adresse inconnue. Elle n’a donc pas d’adresse à elle, pas de paramètre, et n’est pas réservée.',
    'Retire l’adresse, le paramètre ou la réservation de cette page.',
    p(`
page "accueil" :
    titre "Accueil"

page "introuvable" adresse "/perdu" :
    titre "Perdu"
`),
    p(`
page "accueil" :
    titre "Accueil"

page "introuvable" :
    titre "Perdu"
`),
    'est la page 404'),
  e('page-reservee-sans-session', 'sens', 'Une page réservée sans session',
    'Réserver une page, c’est demander qui est connecté. Cette information vient de la session des packs Astratra : il faut donc un bloc serveur, ou une source avec « session astratra ».',
    'Ajoute « session astratra » à la source de ton API (ou un bloc serveur), puis écris la page « connexion ».',
    p(`
page "compte" reservee a connecte sinon vers "accueil" :
    titre "Compte"

page "accueil" :
    titre "Accueil"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    session astratra

page "compte" reservee a connecte sinon vers "accueil" :
    titre "Compte"

page "accueil" :
    titre "Accueil"
`),
    'demande une session'),
  e('page-reservee-sinon', 'sens', 'Une page réservée qui ne sait pas où renvoyer les visiteurs',
    'Un visiteur refusé est renvoyé vers une page. Sans « sinon vers "…" », Humalis cherche une page nommée « connexion » ; elle doit exister, et ne pas être réservée elle-même (les visiteurs tourneraient en rond).',
    'Écris une page « connexion », ou « sinon vers » avec le nom d’une page qui existe.',
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    session astratra

page "compte" reservee a connecte :
    titre "Compte"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    session astratra

page "compte" reservee a connecte :
    titre "Compte"

page "connexion" :
    titre "Connexion"
`),
    'dites où envoyer les visiteurs'),
  e("page-ordre-entete", "grammaire", "Un en-tête de page dans le désordre",
    "L’en-tête d’une page a un ordre fixe : dans \"parent\", puis a l’adresse \"/…\", puis reservee a …, puis avec parametre … et filtre …, puis les deux-points. Chaque morceau est facultatif.",
    "Remets les morceaux dans cet ordre.",
    p(`
page "x" :
    sous page

page "accueil" adresse "/" dans "x" :
    titre "Accueil"
`),
    p(`
page "x" :
    sous page

page "accueil" dans "x" adresse "/x" :
    titre "Accueil"
`),
    "n'est pas à sa place"),
  e("sous-page-parent-inconnu", "sens", "Une sous-page dans une page qui n’existe pas",
    "Une sous-page s’affiche dans sa page parente. Le nom écrit après « dans » doit être celui d’une page du fichier ; une faute de frappe est la cause la plus fréquente.",
    "Corrige le nom du parent : le message liste les pages qui existent.",
    p(`
page "commandes" dans "admine" :
    titre "Commandes"
`),
    p(`
page "admin" :
    sous page

page "commandes" dans "admin" :
    titre "Commandes"
`),
    "qui n'existe pas. Pages : commandes"),
  e("sous-page-elle-meme", "sens", "Une page dans elle-même",
    "Une page ne peut pas s’afficher dans elle-même : elle ne finirait jamais.",
    "Mets la page dans une autre page.",
    p(`
page "a" dans "a" :
    titre "A"
`),
    p(`
page "a" :
    sous page

page "b" dans "a" :
    titre "B"
`),
    "dans elle-même"),
  e("sous-page-cycle", "sens", "Des sous-pages qui tournent en rond",
    "La page « a » est dans « b », qui est dans « a » : aucune des deux ne peut s’afficher la première.",
    "Casse le cercle : l’une des deux pages n’est dans aucune autre.",
    p(`
page "a" dans "b" :
    sous page

page "b" dans "a" :
    sous page
`),
    p(`
page "a" dans "b" :
    titre "A"

page "b" :
    sous page
`),
    "tournent pas en rond"),
  e("sous-page-introuvable", "sens", "La page 404 comme sous-page",
    "La page « introuvable » est la page 404 : elle s’affiche seule, quand une adresse n’existe pas. Elle ne peut pas vivre dans une autre page.",
    "Retire le « dans » de la page « introuvable ».",
    p(`
page "admin" :
    sous page

page "commandes" dans "admin" :
    titre "Commandes"

page "introuvable" dans "admin" :
    titre "Perdu"
`),
    p(`
page "admin" :
    sous page

page "commandes" dans "admin" :
    titre "Commandes"

page "introuvable" :
    titre "Perdu"
`),
    "ne peut pas être une sous-page"),
  e("sous-page-parent-parametre", "sens", "Un parent qui a un paramètre",
    "Dans cette version, une page qui a des sous-pages n’a pas de paramètre dans son adresse. L’enfant peut avoir le sien.",
    "Enlève le paramètre du parent, et donne-le à l’enfant.",
    p(`
page "admin" avec parametre id :
    sous page

page "commandes" dans "admin" :
    titre "Commandes"
`),
    p(`
page "admin" :
    sous page

page "commandes" dans "admin" avec parametre id :
    titre "Commandes"
`),
    "le parent d'une sous-page n'a pas de paramètre"),
  e("sous-page-prefixe", "sens", "Une adresse qui sort de celle du parent",
    "L’adresse d’une sous-page commence par celle de son parent : /admin/commandes pour une page dans « admin ».",
    "Écris une adresse qui commence par celle du parent, ou retire « a l’adresse » pour qu’elle soit choisie toute seule.",
    p(`
page "admin" :
    sous page

page "commandes" dans "admin" adresse "/boutique/x" :
    titre "Commandes"
`),
    p(`
page "admin" :
    sous page

page "commandes" dans "admin" adresse "/admin/x" :
    titre "Commandes"
`),
    "ne commence pas par celle de son parent"),
  e("sous-page-moins-protegee", "sens", "Une sous-page moins protégée que son parent",
    "La protection d’un parent vaut pour ses sous-pages. Une sous-page peut être plus protégée que son parent (admin dans connecté), jamais moins.",
    "Réserve la sous-page à la même qualité que son parent, ou à une plus haute.",
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    session astratra

page "connexion" :
    titre "Connexion"

page "admin" reservee a admin :
    sous page

page "commandes" dans "admin" reservee a connecte :
    titre "Commandes"
`),
    p(`
source "boutique" :
    adresse "https://api.exemple.cd"
    session astratra

page "connexion" :
    titre "Connexion"

page "admin" reservee a admin :
    sous page

page "commandes" dans "admin" reservee a admin :
    titre "Commandes"
`),
    "jamais moins"),
  e("sous-page-endroit-manquant", "sens", "Un parent sans « sous page »",
    "Le parent montre sa sous-page à l’endroit où la ligne « sous page » est écrite. Sans elle, la sous-page n’apparaîtrait nulle part.",
    "Écris « sous page » là où le contenu de la sous-page doit s’afficher.",
    p(`
page "admin" :
    titre "Admin"

page "commandes" dans "admin" :
    titre "Commandes"
`),
    p(`
page "admin" :
    titre "Admin"
    sous page

page "commandes" dans "admin" :
    titre "Commandes"
`),
    "pas d'endroit pour les montrer"),
  e("sous-page-sans-enfants", "sens", "Un « sous page » dans une page sans sous-page",
    "La ligne « sous page » marque l’endroit où une page enfant s’affiche. Aucune page n’est dans celle-ci : l’endroit resterait vide.",
    "Écris une page avec « dans \"cette-page\" », ou retire la ligne.",
    p(`
page "a" :
    sous page
`),
    p(`
page "a" :
    sous page

page "b" dans "a" :
    titre "B"
`),
    "qui n'a aucune sous-page"),
  e("sous-page-repetee", "sens", "Deux « sous page » dans une page",
    "La sous-page ne s’affiche qu’à un seul endroit de son parent.",
    "Garde une seule ligne « sous page ».",
    p(`
page "admin" :
    sous page
    sous page

page "commandes" dans "admin" :
    titre "Commandes"
`),
    p(`
page "admin" :
    sous page

page "commandes" dans "admin" :
    titre "Commandes"
`),
    "fois dans la page"),
  e("sous-page-index-double", "sens", "Deux sous-pages d’index",
    "La sous-page d’index est celle dont l’adresse est celle du parent : elle s’affiche quand on ouvre /admin tout court. Il n’y en a qu’une.",
    "Donne à l’une des deux une autre adresse.",
    p(`
page "admin" :
    sous page

page "a" dans "admin" adresse "/admin" :
    titre "A"

page "b" dans "admin" adresse "/admin" :
    titre "B"
`),
    p(`
page "admin" :
    sous page

page "a" dans "admin" adresse "/admin" :
    titre "A"

page "b" dans "admin" :
    titre "B"
`),
    "sous-page d'index"),
  e("sous-page-dans-un-evenement", "sens", "« sous page » dans un événement",
    "« sous page » est un endroit de la page, comme un titre : ce n’est pas une action.",
    "Place la ligne dans la page, hors de « quand … ».",
    p(`
page "admin" :
    sous page
    bouton "x"
    quand l'utilisateur clique sur "x" :
        sous page

page "c" dans "admin" :
    titre "C"
`),
    p(`
page "admin" :
    sous page
    bouton "x"

page "c" dans "admin" :
    titre "C"
`),
    "est un endroit de la page, pas une action"),
  e("ancre-invalide", "sens", "Un nom d’ancre qui n’est pas valable",
    "Une ancre fait partie de l’adresse (carte#desserts) : des lettres sans accent, des chiffres et des tirets, sans espace.",
    "Écris un nom simple : avec ancre \"desserts\".",
    p(`
page "carte" :
    texte "Beignets" avec ancre "à voir"
`),
    p(`
page "carte" :
    texte "Beignets" avec ancre "a-voir"
`),
    "n'est pas valable"),
  e("ancre-doublon", "sens", "Deux ancres de même nom",
    "Une ancre désigne un seul endroit de la page.",
    "Donne un autre nom à l’une des deux.",
    p(`
page "carte" :
    texte "Plats" avec ancre "z"
    texte "Desserts" avec ancre "z"
`),
    p(`
page "carte" :
    texte "Plats" avec ancre "plats"
    texte "Desserts" avec ancre "desserts"
`),
    "est déjà utilisée dans la page"),
  e("ancre-inexistante", "sens", "Un lien vers une ancre qui n’existe pas",
    "Un lien « vers \"carte#desserts\" » mène à un endroit de la page « carte » marqué par « avec ancre \"desserts\" ». Le message liste les ancres qui existent.",
    "Corrige le nom de l’ancre, ou ajoute « avec ancre \"…\" » à l’endroit voulu.",
    p(`
page "carte" :
    section "Desserts" avec ancre "desserts" :
        texte "Beignets"

page "accueil" :
    lien "Nos desserts" vers "carte#dessert"
`),
    p(`
page "carte" :
    section "Desserts" avec ancre "desserts" :
        texte "Beignets"

page "accueil" :
    lien "Nos desserts" vers "carte#desserts"
`),
    "n'existe pas dans la page « carte »"),
  e("adresse-refusee", "sens", "Une adresse qui peut exécuter du code",
    "Un lien mène à une page, ou à une adresse en https://, http://, mailto: ou tel:. Les autres schémas (javascript:, data:, file:…) peuvent exécuter du code ou lire des fichiers : Humalis les refuse partout.",
    "Écris une adresse https:// (ou mailto:, tel:).",
    p(`
page "accueil" :
    lien "Cliquer" vers "javascript:alert(1)"
`),
    p(`
page "accueil" :
    lien "Cliquer" vers "https://exemple.cd"
`),
    "est refusée"),
  e("lien-externe-parametres", "sens", "Des paramètres de page sur une adresse externe",
    "Les paramètres (avec id p.id) se donnent à une page de l’application, pas à une adresse externe.",
    "Retire les paramètres, ou écris l’identifiant dans l’adresse.",
    p(`
page "accueil" :
    lien "Aide" vers "https://exemple.cd" avec id 1
`),
    p(`
page "accueil" :
    lien "Aide" vers "https://exemple.cd"
`),
    "n'a pas de paramètres de page"),
  e("nouvel-onglet-pas-un-lien", "sens", "« nouvel onglet » sur autre chose qu’un lien",
    "Seul un lien s’ouvre dans un nouvel onglet.",
    "Mets l’option sur un lien.",
    p(`
page "accueil" :
    bouton "x" avec nouvel onglet
`),
    p(`
page "accueil" :
    lien "x" vers "https://exemple.cd" avec nouvel onglet
`),
    "s'applique à un lien"),
  e("rediriger-avec-sans-page", "sens", "Des paramètres donnés à une adresse externe",
    "« rediriger vers … avec … » donne des paramètres à une page de l’application.",
    "Retire « avec … », ou vise une page.",
    p(`
page "accueil" :
    bouton "x"
    quand l'utilisateur clique sur "x" :
        rediriger vers "https://exemple.cd" avec id 1
`),
    p(`
page "accueil" :
    bouton "x"
    quand l'utilisateur clique sur "x" :
        rediriger vers "https://exemple.cd"
`),
    "demande une page"),
  e("revenir-vers-dynamique", "sens", "« revenir vers » une page calculée",
    "La page de secours de « revenir vers » s’écrit entre guillemets, pour que Humalis vérifie qu’elle existe.",
    "Écris le nom de la page entre guillemets.",
    p(`
page "accueil" :
    variable retour = "accueil"
    bouton "x"
    quand l'utilisateur clique sur "x" :
        revenir vers retour
`),
    p(`
page "accueil" :
    bouton "x"
    quand l'utilisateur clique sur "x" :
        revenir vers "accueil"
`),
    "demande le nom de la page entre guillemets : revenir vers"),
  e("revenir-vers-inconnue", "sens", "« revenir vers » une page qui n’existe pas",
    "Le message liste les pages du fichier.",
    "Corrige le nom de la page.",
    p(`
page "accueil" :
    bouton "x"
    quand l'utilisateur clique sur "x" :
        revenir vers "catalogu"
`),
    p(`
page "accueil" :
    bouton "x"
    quand l'utilisateur clique sur "x" :
        revenir vers "accueil"
`),
    "la page n'existe pas. Pages"),
  e("filtre-nom-option", "sens", "Un filtre qui porte le nom d’une option",
    "Après « vers \"page\" », « avec couleur … » est une option du lien. Un filtre appelé « couleur » serait pris pour elle.",
    "Choisis un autre nom, par exemple « teinte ».",
    p(`
page "catalogue" avec filtre couleur :
    titre "Catalogue"
`),
    p(`
page "catalogue" avec filtre teinte :
    titre "Catalogue"
`),
    "ne peut pas nommer un filtre"),
  e("filtre-et-parametre", "sens", "Un nom à la fois paramètre et filtre",
    "Un paramètre est dans le chemin (/produit/12), obligatoire ; un filtre est dans la requête (?id=12), facultatif. Un même nom ne peut pas faire les deux.",
    "Garde un seul rôle, ou deux noms.",
    p(`
page "catalogue" avec parametre id et filtre id :
    titre "Catalogue"
`),
    p(`
page "catalogue" avec parametre id et filtre tri :
    titre "Catalogue"
`),
    "à la fois un paramètre et un filtre"),
  e("changer-parametre", "sens", "« changer » sur un paramètre de page",
    "Un paramètre vient du chemin de l’adresse : il ne se change pas sur place. Pour montrer une autre valeur, on change de page.",
    "Utilise rediriger vers la page avec la nouvelle valeur, ou un filtre (avec filtre …) qui, lui, se change.",
    p(`
page "produit" avec parametre id :
    bouton "x"
    quand l'utilisateur clique sur "x" :
        changer id par "2"
`),
    p(`
page "produit" avec filtre id :
    bouton "x"
    quand l'utilisateur clique sur "x" :
        changer id par "2"
`),
    "un paramètre vient du chemin"),
  e("changer-filtre-champs", "sens", "Un champ lu sur un filtre",
    "Un filtre est un simple texte ou nombre lu dans l’adresse : il n’a pas de champs.",
    "Change le filtre lui-même : changer categorie par \"…\".",
    p(`
page "catalogue" avec filtre categorie :
    bouton "x"
    quand l'utilisateur clique sur "x" :
        changer categorie.nom par "robes"
`),
    p(`
page "catalogue" avec filtre categorie :
    bouton "x"
    quand l'utilisateur clique sur "x" :
        changer categorie par "robes"
`),
    "il n'a pas de champs"),
  e("filtre-type", "sens", "Une valeur du mauvais type pour un filtre",
    "Un filtre est un texte, ou un nombre quand on écrit « filtre tri nombre ». Le lien ou le « changer » doit lui donner la même sorte de valeur.",
    "Donne un nombre à un filtre nombre (ou retire « nombre » du filtre).",
    p(`
page "catalogue" avec filtre tri nombre :
    bouton "x"
    quand l'utilisateur clique sur "x" :
        changer tri par "haut"
`),
    p(`
page "catalogue" avec filtre tri nombre :
    bouton "x"
    quand l'utilisateur clique sur "x" :
        changer tri par 2
`),
    "le filtre « tri » est un nombre", { sites: 2 }),
  // --- Publier : le bloc site et l’aperçu de partage (plan qualité et publication, parties 3 à 5) ---
  e('site-double', 'grammaire', 'Deux blocs site',
    'Le bloc « site » décrit le site entier (son nom, son icône, son adresse) : il n’y en a qu’un.',
    'Réunis les lignes des deux blocs en un seul.',
    p(`
site :
    nom "Le Fleuve"

site :
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    'un seul bloc « site »'),
  e('site-apres-page', 'grammaire', 'Le bloc site écrit après une page',
    'Le bloc « site » s’écrit en haut du fichier : il annonce le site avant ses pages.',
    'Remonte le bloc « site » au-dessus de la première page.',
    p(`
page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."

site :
    nom "Le Fleuve"
    logo "./logo.svg"
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    'avant les pages'),
  e('apercu-double', 'grammaire', 'Deux blocs apercu dans une page',
    'Le bloc « apercu » donne le titre, la description et l’image de partage d’une page : un seul par page.',
    'Réunis les lignes dans un seul bloc « apercu ».',
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    apercu :
        titre "Le Fleuve"
    apercu :
        indexation non
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    apercu :
        titre "Le Fleuve"
        indexation non
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    'un seul bloc « apercu » par page'),
  e('apercu-mal-place', 'sens', 'Un bloc apercu dans un bloc ou un événement',
    'Le bloc « apercu » décrit toute la page : il n’est pas affiché, et ne dépend pas d’un clic. Il s’écrit donc directement sous « page "…" : ».',
    'Sors le bloc « apercu » de la section ou de l’événement, au premier niveau de la page.',
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    section :
        apercu :
            indexation non
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    apercu :
        indexation non
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    '« apercu » décrit toute la page'),
  e('bloc-site-ligne-sans-mot', 'grammaire', 'Une ligne de site ou d’apercu qui ne commence pas par un mot',
    'Chaque ligne des blocs « site » et « apercu » commence par le réglage qu’elle donne (nom, description, image…), puis sa valeur.',
    'Écris le nom du réglage avant sa valeur : nom "Le Fleuve".',
    p(`
site :
    "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    'une ligne de ce bloc commence par'),
  e('indexation-valeur', 'grammaire', '« indexation » sans « non » ni « oui »',
    '« indexation non » cache une page, ou tout le site, aux moteurs de recherche. Le mot attend « non » (ou « oui »).',
    'Écris « indexation non ».',
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"
    indexation jamais

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"
    indexation non

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    'est suivi de « non »'),
  e('site-ligne-inconnue', 'grammaire', 'Une ligne inconnue dans le bloc site',
    'Le bloc « site » connaît six lignes : nom, description, image, logo, adresse et indexation. Les couleurs se donnent dans le bloc « theme ».',
    'Garde seulement les lignes connues ; mets les couleurs dans « theme : ».',
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"
    couleur "bleu"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    "n'est pas une ligne du bloc « site »"),
  e('site-ligne-double', 'grammaire', 'Une ligne donnée deux fois dans le bloc site',
    'Chaque réglage du site n’a qu’une valeur : le donner deux fois laisserait deviner laquelle garder.',
    'Garde une seule fois chaque ligne.',
    p(`
site :
    nom "Le Fleuve"
    nom "Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    'est déjà donné dans le bloc « site »'),
  e('apercu-ligne-inconnue', 'grammaire', 'Une ligne inconnue dans le bloc apercu',
    'Le bloc « apercu » connaît quatre lignes : titre, description, image et indexation. Le logo est celui du site.',
    'Garde seulement ces lignes ; le logo va dans le bloc « site ».',
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    apercu :
        logo "./plat.png"
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    apercu :
        image "./plat.png"
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    "n'est pas une ligne du bloc « apercu »"),
  e('apercu-ligne-double', 'grammaire', 'Une ligne donnée deux fois dans le bloc apercu',
    'Une page n’a qu’un titre de partage et qu’une description.',
    'Garde une seule fois chaque ligne.',
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    apercu :
        titre "Le Fleuve"
        titre "Fleuve"
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    apercu :
        titre "Le Fleuve"
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    'est déjà donné dans le bloc « apercu »'),
  e('site-adresse', 'sens', 'Une adresse de site sans https://',
    'L’adresse du site sert aux liens complets des aperçus de partage et du plan du site : elle commence par https://. Pour un essai sur ton ordinateur, http://localhost est permis.',
    'Écris l’adresse complète, avec https://.',
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"
    adresse "lefleuve.cd"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"
    adresse "https://lefleuve.cd"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    'doit commencer par https://'),
  e('site-sans-logo', 'avertissement', 'Un site sans icône',
    'L’icône s’affiche dans l’onglet, les favoris et sur l’écran d’accueil d’un téléphone. Humalis n’en impose aucune : c’est ton site.',
    'Ajoute « logo "./logo.svg" » au bloc site (un SVG, ou un PNG carré de 512×512 au moins).',
    p(`
site :
    nom "Le Fleuve"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    "le site n'a pas d'icône", { gravite: 'avertissement' }),
  e('image-partage-externe', 'avertissement', 'Une image de partage prise sur un autre site',
    'L’image de partage peut venir d’un autre site, mais si elle y disparaît, l’aperçu de tes liens la perd.',
    'Mets l’image dans ton projet et donne son chemin : image "./partage.jpg".',
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"
    image "https://images.exemple.cd/fleuve.jpg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"
    image "./partage.jpg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    'est sur un autre site', { gravite: 'avertissement' }),
  e('titre-trop-long', 'avertissement', 'Un titre de page trop long',
    'Les moteurs de recherche coupent un titre au-delà d’environ 60 caractères : la fin ne se voit plus.',
    'Raccourcis le titre, ou donne un titre plus court dans le bloc « apercu ».',
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve, le restaurant au bord du fleuve Congo, à Kinshasa, Gombe"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    apercu :
        titre "Le Fleuve, restaurant à Kinshasa"
    titre "Le Fleuve, le restaurant au bord du fleuve Congo, à Kinshasa, Gombe"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    'fait plus de 60 caractères', { gravite: 'avertissement' }),
  e('description-trop-courte', 'avertissement', 'Une description de page trop courte',
    'La description est la phrase que les moteurs montrent sous le titre. Trop courte, elle ne dit pas ce qu’on trouve sur la page.',
    'Écris une phrase de 50 à 160 caractères.',
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
    texte "Bienvenue."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    'fait moins de 50 caractères', { gravite: 'avertissement' }),
  e('description-trop-longue', 'avertissement', 'Une description de page trop longue',
    'Au-delà d’environ 160 caractères, la description est coupée dans les résultats de recherche.',
    'Garde l’essentiel dans une phrase de 50 à 160 caractères, par exemple dans le bloc « apercu ».',
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche, avec une terrasse, des poissons grillés, du pondu, de la chikwangue et des jus frais pressés sur place."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    apercu :
        description "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche, avec une terrasse, des poissons grillés, du pondu, de la chikwangue et des jus frais pressés sur place."
`),
    'fait plus de 160 caractères', { gravite: 'avertissement' }),
  e('page-sans-description', 'avertissement', 'Une page sans description',
    'Sans texte ni description, les moteurs de recherche n’ont rien à montrer sous le titre de la page.',
    'Ajoute un « texte » à la page, ou « description "…" » dans un bloc « apercu ».',
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."
`),
    "n'a pas de description", { gravite: 'avertissement' }),
  e('apercu-calcule', 'avertissement', 'Un aperçu de partage calculé',
    'Un titre calculé (« {plat} ») s’affiche bien dans l’onglet. Mais les réseaux sociaux ne lisent pas le JavaScript : un lien partagé vers cette page montrera l’aperçu du site.',
    'Écris l’aperçu en clair si la page doit avoir le sien dans les partages.',
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "plat" avec parametre plat :
    apercu :
        titre "{plat} au Fleuve"
    titre "Nos plats"
    texte "Un plat du restaurant Le Fleuve, préparé le jour même à Kinshasa."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "plat" avec parametre plat :
    apercu :
        titre "Un plat du Fleuve"
    titre "Nos plats"
    texte "Un plat du restaurant Le Fleuve, préparé le jour même à Kinshasa."
`),
    'dépend de données', { gravite: 'avertissement' }),
  e('titres-identiques', 'avertissement', 'Deux pages avec le même titre',
    'Deux pages au même titre se ressemblent pour un moteur de recherche : il ne sait pas laquelle montrer.',
    'Donne à chaque page un titre qui la distingue.',
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."

page "carte" :
    titre "Le Fleuve"
    texte "La carte du restaurant : poissons grillés, pondu, chikwangue et jus frais."
`),
    p(`
site :
    nom "Le Fleuve"
    logo "./logo.svg"

page "accueil" :
    titre "Le Fleuve"
    texte "Un restaurant au bord du fleuve Congo, ouvert du mardi au dimanche."

page "carte" :
    titre "La carte"
    texte "La carte du restaurant : poissons grillés, pondu, chikwangue et jus frais."
`),
    'ont le même titre', { gravite: 'avertissement' }),

  // --- Graphiques, médias et mouvement (erreurs-medias.ts) ---
  ...ENTREES_ERREURS_MEDIAS,
  ...ENTREES_ERREURS_INTERACTIONS,
  // --- Les langues (erreurs-langues.ts) ---
  ...ENTREES_ERREURS_LANGUES,
  e('supposant-forme', 'grammaire', 'Écrire le bloc optimiste',
    'Le bloc annonce que la requête suivante pourrait échouer.',
    'Écris « en supposant que ça marche : ».',
    p('page "a" :\n    en supposant que oui :'),
    p('page "a" :\n    texte "Bonjour"'),
    'en supposant que ça marche', { atteignable: false }),
  e('supposant-deux-points', 'grammaire', 'Fermer la phrase du bloc optimiste',
    'Le deux-points ouvre les actions à exécuter immédiatement.',
    'Ajoute « : » après « marche ».',
    p('page "a" :\n    en supposant que ca marche'),
    p('page "a" :\n    texte "Bonjour"'),
    'deux-points après', { atteignable: false }),
  e('supposant-evenement', 'sens', 'Placer le bloc dans un événement',
    'Une mise à jour optimiste répond à une action de la personne.',
    'Place le bloc dans un clic ou une soumission.',
    p('page "a" :\n    en supposant que ca marche :\n        changer x par 2'),
    p('page "a" :\n    texte "Bonjour"'),
    'ne sert que dans un événement', { atteignable: false }),
  e('supposant-actions', 'sens', 'Modifier seulement des variables locales',
    'Un élément ou une navigation ne peut pas être remis à son état précédent.',
    'Utilise changer, ajouter ou retirer dans le bloc.',
    p('page "a" :\n    en supposant que ca marche :\n        afficher "Bonjour"'),
    p('page "a" :\n    texte "Bonjour"'),
    'un élément ne se défait pas', { atteignable: false }),
  e('supposant-requete', 'sens', 'Faire suivre le bloc par une requête',
    'Sans requête, il n’y a aucun résultat qui puisse confirmer ou annuler le changement.',
    'Ajoute une requête dans le même événement.',
    p('page "a" :\n    en supposant que ca marche :\n        changer x par 2'),
    p('page "a" :\n    texte "Bonjour"'),
    'demande une requête juste après', { atteignable: false }),
  e('donnees-changer', 'sens', 'Changer une donnée issue d’un fichier',
    'Les données locales sont intégrées à la compilation et se lisent seulement.',
    'Copie la donnée dans une variable de page avant de la changer.',
    p('utiliser donnees "produits" depuis "./produits.csv"\npage "a" :\n    texte produits'),
    p('page "a" :\n    texte "Bonjour"'),
    "vient d'un fichier", { atteignable: false }),
  e('donnees-liste', 'sens', 'Ajouter ou retirer dans un fichier lu',
    'Une liste issue d’un fichier est en lecture seule.',
    'Copie la liste dans une variable de page avant de la modifier.',
    p('utiliser donnees "produits" depuis "./produits.csv"\npage "a" :\n    texte produits'),
    p('page "a" :\n    texte "Bonjour"'),
    "vient d'un fichier", { atteignable: false }),
  // --- Les conditions combinées (et, ou, est dans) ---
  e('est-dans-sans-liste', 'sens', '« est dans » sans liste',
    '« est dans » cherche une valeur parmi celles d’une liste : « categorie est dans ["robes", "pagnes"] ». Après « dans », il faut donc une liste.',
    'Écris une liste entre crochets, ou une variable qui contient une liste ; pour une seule valeur, compare avec « est egal a ».',
    p(`
page "boutique" :
    titre "La boutique"
    variable categorie = "robes"
    si categorie est dans "robes" :
        texte "Tissus"
`),
    p(`
page "boutique" :
    titre "La boutique"
    variable categorie = "robes"
    si categorie est dans ["robes", "pagnes"] :
        texte "Tissus"
`),
    '« est dans » cherche dans une liste'),
  e('est-dans-type', 'sens', '« est dans » avec une liste d’un autre type',
    'On cherche un texte dans une liste de textes, un nombre dans une liste de nombres. Un nombre n’est jamais égal à un texte.',
    'Cherche une valeur du même type que les éléments de la liste.',
    p(`
page "boutique" :
    titre "La boutique"
    variable taille = 38
    si taille est dans ["S", "M", "L"] :
        texte "Disponible"
`),
    p(`
page "boutique" :
    titre "La boutique"
    variable taille = "M"
    si taille est dans ["S", "M", "L"] :
        texte "Disponible"
`),
    'on ne peut pas chercher'),
  // --- Les constantes ---
  e('constante-changee', 'sens', 'Une constante qu’on essaie de changer',
    'Une constante garde la même valeur du début à la fin : c’est ce qui la distingue d’une variable.',
    'Si la valeur doit changer, déclare-la avec « variable » au lieu de « constante ».',
    p(`
constante tva = 16

page "panier" :
    titre "Panier"
    bouton "Changer la TVA"
    quand l'utilisateur clique sur "Changer la TVA" :
        changer tva par 18
`),
    p(`
variable tva = 16 avec partagee

page "panier" :
    titre "Panier"
    bouton "Changer la TVA"
    quand l'utilisateur clique sur "Changer la TVA" :
        changer tva par 18
`),
    'est une constante'),
  // --- grouper ---
  e('grouper-sans-fiches', 'sens', '« grouper » sur une liste simple',
    '« grouper » range des fiches (ou des données du serveur) selon un de leurs champs : « grouper produits par categorie ». Une liste de nombres ou de textes n’a pas de champ.',
    'Groupe une liste de fiches, par le nom d’un de leurs champs.',
    p(`
page "catalogue" :
    titre "Catalogue"
    variable notes = [12, 15, 9]
    calcul groupes = grouper notes par note
    calcul n = nombre de groupes
    texte "{n}"
`),
    p(`
page "catalogue" :
    titre "Catalogue"
    variable produits = [fiche avec nom "Pagne" et categorie "Tissus"]
    calcul groupes = grouper produits par categorie
    calcul n = nombre de groupes
    texte "{n}"
`),
    'range une liste de fiches'),
  // --- Les fonctions d’actions ---
  e('fonction-actions-recursive', 'grammaire', 'Une fonction d’actions qui s’appelle elle-même',
    'Une fonction d’actions est remplacée par son corps là où on l’appelle. Si elle s’appelle elle-même, ce remplacement ne s’arrêterait jamais.',
    'Retire l’appel à elle-même ; pour répéter, utilise « repeter » ou « tant que ».',
    p(`
fonction ranger :
    afficher "Rangé"
    ranger()

page "a" :
    titre "A"
    bouton "Vider"
    quand l'utilisateur clique sur "Vider" :
        ranger()
`),
    p(`
fonction ranger :
    afficher "Rangé"

page "a" :
    titre "A"
    bouton "Vider"
    quand l'utilisateur clique sur "Vider" :
        ranger()
`),
    "s'appelle elle-même"),
  e('fonction-actions-nombre', 'sens', 'Une fonction d’actions appelée avec trop ou trop peu de valeurs',
    'Une fonction reçoit autant de valeurs qu’elle a de noms après « avec », dans le même ordre, séparées par des virgules.',
    'Donne une valeur pour chaque nom de la fonction.',
    p(`
fonction saluer avec nom :
    afficher "Bonjour {nom}"

page "a" :
    titre "A"
    bouton "Vider"
    quand l'utilisateur clique sur "Vider" :
        saluer()
`),
    p(`
fonction saluer avec nom :
    afficher "Bonjour {nom}"

page "a" :
    titre "A"
    bouton "Vider"
    quand l'utilisateur clique sur "Vider" :
        saluer("Awa")
`),
    'attend 1 valeur'),
  e('fonction-calcul-dans-page', 'grammaire', 'Une fonction de calcul écrite dans une page',
    'Une fonction qui rend une valeur sert à toutes les pages : elle s’écrit en haut du fichier. Dans une page, on écrit seulement des fonctions d’actions.',
    'Remonte la fonction en haut du fichier, avant les pages.',
    p(`
page "a" :
    titre "A"
    fonction double avec n :
        rendre n * 2
    calcul x = double(3)
    texte "{x}"
`),
    p(`
fonction double avec n :
    rendre n * 2

page "a" :
    titre "A"
    calcul x = double(3)
    texte "{x}"
`),
    "s'écrit en haut du fichier"),
  e('fonction-actions-comme-valeur', 'sens', 'Une fonction d’actions employée comme une valeur',
    'Une fonction sans « rendre » fait des actions mais ne donne aucune valeur : on ne peut pas la mettre dans un calcul.',
    'Appelle-la seule sur une ligne, dans un événement ; pour une valeur, écris une fonction avec « rendre ».',
    p(`
fonction saluer :
    afficher "Bonjour"

page "a" :
    titre "A"
    calcul x = saluer()
    texte "{x}"
`),
    p(`
fonction saluer :
    afficher "Bonjour"

page "a" :
    titre "A"
    bouton "Saluer"
    quand l'utilisateur clique sur "Saluer" :
        saluer()
`),
    'fait des actions sans rendre de valeur'),
  e('fonction-calcul-seule', 'sens', 'Une fonction de calcul appelée seule sur une ligne',
    'Une fonction avec « rendre » donne une valeur. Appelée seule sur une ligne, sa valeur serait perdue.',
    'Garde sa valeur dans un calcul ou une variable.',
    p(`
fonction double avec n :
    rendre n * 2

page "a" :
    titre "A"
    variable x = 0
    bouton "Doubler"
    quand l'utilisateur clique sur "Doubler" :
        double(3)
`),
    p(`
fonction double avec n :
    rendre n * 2

page "a" :
    titre "A"
    variable x = 0
    bouton "Doubler"
    quand l'utilisateur clique sur "Doubler" :
        changer x par double(3)
`),
    'rend une valeur : emploie-la'),
  // --- essayer ---
  e('essayer-hors-evenement', 'sens', '« essayer » écrit dans la page',
    '« essayer » attrape l’erreur d’une requête ou d’une action : il ne sert que dans un événement, quand quelque chose se passe.',
    'Place « essayer » dans un événement (quand l’utilisateur clique, quand le formulaire est soumis…).',
    p(`
page "a" :
    titre "A"
    essayer :
        texte "Bonjour"
`),
    p(`
page "a" :
    titre "A"
    bouton "Saluer"
    quand l'utilisateur clique sur "Saluer" :
        essayer :
            afficher "Bonjour"
        si erreur :
            afficher erreur "Impossible : {raison}"
`),
    "« essayer » s'écrit dans un événement"),
  // --- Les dates ---
  e('date-attendue', 'sens', 'Une date attendue',
    '« plus 3 jours », « moins 1 semaine » et « jours entre … et … » travaillent sur des dates : « aujourd’hui », une date écrite comme "2026-11-07", ou le champ date d’une donnée.',
    'Donne une date à la place du nombre ou du texte.',
    p(`
page "livraison" :
    titre "Livraison"
    variable n = 5
    calcul d = n plus 3 jours
    texte "{d}"
`),
    p(`
page "livraison" :
    titre "Livraison"
    calcul d = aujourd'hui plus 3 jours
    texte "{d}"
`),
    "une date s'écrit comme"),
  e('decalage-sans-nombre', 'sens', 'Un décalage de date sans nombre',
    '« plus 3 jours » compte un nombre de jours, de semaines ou de mois : il faut un nombre.',
    'Écris un nombre, ou une variable qui contient un nombre.',
    p(`
page "livraison" :
    titre "Livraison"
    calcul d = aujourd'hui plus "trois" jours
    texte "{d}"
`),
    p(`
page "livraison" :
    titre "Livraison"
    calcul d = aujourd'hui plus 3 jours
    texte "{d}"
`),
    'attend un nombre ;'),
  e('depuis-sans-date', 'sens', '« depuis » après autre chose qu’une date',
    '« {x depuis} » écrit le temps passé depuis une date : « il y a 3 jours ». Un nombre n’a pas de date.',
    'Mets une date entre les accolades, avant « depuis ».',
    p(`
page "livraison" :
    titre "Livraison"
    variable n = 3
    texte "{n depuis}"
`),
    p(`
page "livraison" :
    titre "Livraison"
    variable commande = maintenant
    texte "Commandée {commande depuis}"
`),
    "« depuis » s'écrit après une date"),
];
