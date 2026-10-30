/**
 * Les vérifications des éléments d'écran :
 * icônes, badge, avatar, progression, étoiles, compteur, code QR, et les
 * blocs onglets, accordéon, carrousel, fil d'Ariane.
 *
 * Elles sont dans leur fichier pour ne pas alourdir `analyse.ts` : elles
 * reçoivent de quoi signaler (`Signaler`) et de quoi typer une expression.
 */
import type { Bloc, Element, Expression, Instruction, Style } from '../parser/ast.js';
import { chercherIcone, iconeProche, contientUnEmoji, ICONES } from '../vocabulaire/icones.js';
import { normaliser } from '../lexer/motsCles.js';
import { NOMBRE, estConnu, decrireType, type TypeValeur } from './types.js';

export interface Signaler {
  erreur(message: string, ligne: number): void;
  avertissement(message: string, ligne: number): void;
  typeDe(expression: Expression): TypeValeur;
}

/** Le texte d'une valeur écrite entre guillemets sans {variable}, sinon undefined. */
export function texteSimple(expression: Expression): string | undefined {
  return expression.type === 'Chaine' && expression.parties.every((p) => p.type === 'texte')
    ? expression.parties.map((p) => p.valeur).join('')
    : undefined;
}

const reglage = (styles: Style[], nom: string): Style | undefined => styles.find((s) => normaliser(s.propriete) === nom);

/** Le nom d'une icône : connu, sans émoji, avec une suggestion sinon. */
export function verifierNomIcone(nom: string, ligne: number, s: Signaler): void {
  if (contientUnEmoji(nom)) {
    s.erreur(`une icône est un dessin, pas un émoji : écrivez son nom, par exemple icone "panier". Icônes possibles : ${ICONES.slice(0, 12).map((i) => i.nom).join(', ')}…`, ligne);
  } else if (!chercherIcone(nom)) {
    const proche = iconeProche(nom);
    s.erreur(`l'icône « ${nom} » n'existe pas.${proche ? ` Peut-être « ${proche} » ?` : ` Icônes possibles : ${ICONES.slice(0, 12).map((i) => i.nom).join(', ')}…`}`, ligne);
  }
}

/** Les vérifications d'un élément d'écran, et du réglage `icone` d'un bouton, d'un lien, d'un titre ou d'un texte. */
export function verifierElementEcran(element: Element, s: Signaler): void {
  const { ligne, contenu, styles } = element;
  const icone = reglage(styles, 'icone');
  if (icone) verifierNomIcone(icone.valeur, ligne, s);

  const texte = texteSimple(contenu);
  switch (element.element) {
    case 'icone':
      if (texte === undefined) s.erreur('le nom de l\'icône s\'écrit entre guillemets, sans {variable} : icone "panier".', ligne);
      else verifierNomIcone(texte, ligne, s);
      break;

    case 'badge':
      if (texte !== undefined && texte.length > 12) s.avertissement('un badge est court : « ' + texte + ' » a plus de 12 caractères.', ligne);
      break;

    case 'avatar':
      if (texte !== undefined && texte.trim() === '') s.erreur('un avatar prend le nom de la personne : avatar "Camille Martin".', ligne);
      break;

    case 'progression': {
      const type = s.typeDe(contenu);
      if (contenu.type !== 'Rien' && estConnu(type) && type.genre !== 'nombre') {
        s.erreur(`une progression prend un nombre (ici, ${decrireType(type)}) : progression 40, ou rien pour une barre qui avance sans fin.`, ligne);
      }
      const max = element.maximum ?? 100;
      if (max <= 0) s.erreur('le maximum d\'une progression doit être positif.', ligne);
      if (contenu.type === 'Nombre' && contenu.valeur > max) s.avertissement(`la valeur ${contenu.valeur} dépasse le maximum ${max} de la progression.`, ligne);
      break;
    }

    case 'etoiles': {
      const type = s.typeDe(contenu);
      if (estConnu(type) && type.genre !== 'nombre') s.erreur(`des étoiles prennent un nombre (ici, ${decrireType(type)}) : etoiles 4.`, ligne);
      const max = element.maximum ?? 5;
      if (max < 1 || max > 10) s.erreur('des étoiles vont de 1 à 10 au maximum (5 par défaut) : etoiles note avec maximum 10.', ligne);
      if (reglage(styles, 'modifiable') && contenu.type !== 'Reference') {
        s.erreur('des étoiles « modifiable » changent une variable : écrivez variable note = 3, puis etoiles note avec modifiable.', ligne);
      }
      break;
    }

    case 'compteur': {
      if (contenu.type !== 'Reference') {
        s.erreur('un compteur change une variable : écrivez variable quantite = 1 d\'abord, puis compteur quantite.', ligne);
        break;
      }
      const type = s.typeDe(contenu);
      if (estConnu(type) && type.genre !== 'nombre') s.erreur(`un compteur change une variable de type nombre (« ${contenu.nom} » est ${decrireType(type)}).`, ligne);
      if (element.minimum !== undefined && element.maximum !== undefined && element.minimum > element.maximum) {
        s.erreur(`le minimum (${element.minimum}) du compteur dépasse son maximum (${element.maximum}).`, ligne);
      }
      break;
    }

    case 'qr':
      if (texte !== undefined && new TextEncoder().encode(texte).length > 2900) s.erreur('ce texte est trop long pour un code QR (2 900 caractères au plus).', ligne);
      break;
  }
  void NOMBRE;
}

const nombre = (styles: Style[], nom: string): number | undefined => {
  const s = reglage(styles, nom);
  return s ? Number(s.valeur) : undefined;
};

/** Les vérifications des blocs d'éléments d'écran : onglets, accordéon, carrousel, fil d'Ariane. */
export function verifierBlocEcran(bloc: Bloc, parent: Bloc | undefined, s: Signaler): void {
  const genres = (instructions: Instruction[]) => instructions.filter((i): i is Bloc => i.type === 'Bloc');
  const icone = reglage(bloc.styles, 'icone');
  if (icone) verifierNomIcone(icone.valeur, bloc.ligne, s);

  switch (bloc.genre) {
    case 'onglets': {
      const intrus = bloc.corps.find((i) => !(i.type === 'Bloc' && i.genre === 'onglet'));
      if (intrus) s.erreur('« onglets » ne contient que des onglets : onglet "Description" : …', 'ligne' in intrus ? intrus.ligne : bloc.ligne);
      const onglets = genres(bloc.corps).filter((b) => b.genre === 'onglet');
      if (onglets.length === 0) s.erreur('« onglets » doit contenir au moins un onglet : onglet "Description" : …', bloc.ligne);
      if (onglets.length === 1) s.avertissement('un seul onglet : à quoi bon des onglets ?', bloc.ligne);
      if (onglets.filter((o) => reglage(o.styles, 'ouvert')).length > 1) s.erreur('un seul onglet peut être « ouvert » au départ.', bloc.ligne);
      break;
    }
    case 'onglet':
      if (parent?.genre !== 'onglets') s.erreur('un onglet se place dans un bloc « onglets ».', bloc.ligne);
      if (!bloc.titre) s.erreur('un onglet a un titre entre guillemets : onglet "Avis" :', bloc.ligne);
      break;
    case 'accordeon': {
      const intrus = bloc.corps.find((i) => !(i.type === 'Bloc' && i.genre === 'deroulant'));
      if (intrus) s.erreur('« accordeon » ne contient que des deroulant : deroulant "Question" : …', 'ligne' in intrus ? intrus.ligne : bloc.ligne);
      if (genres(bloc.corps).filter((b) => reglage(b.styles, 'ouvert')).length > 1 && !reglage(bloc.styles, 'plusieurs')) {
        s.erreur('dans un accordéon, un seul deroulant est « ouvert » à la fois (ou écrivez « accordeon avec plusieurs »).', bloc.ligne);
      }
      break;
    }
    case 'deroulant':
      if (!bloc.titre) s.erreur('un deroulant a un titre entre guillemets : deroulant "Détails" :', bloc.ligne);
      break;
    case 'carrousel': {
      if (bloc.corps.length === 0) s.erreur('un carrousel est vide : mettez-y des images ou des blocs, une diapositive par élément.', bloc.ligne);
      const visibles = nombre(bloc.styles, 'visibles');
      if (visibles !== undefined && (visibles < 1 || visibles > 4)) s.erreur('un carrousel montre de 1 à 4 diapositives à la fois (visibles 1 à 4).', bloc.ligne);
      const auto = nombre(bloc.styles, 'automatique');
      if (auto !== undefined && (auto < 2 || auto > 60)) s.erreur('le défilement automatique va de 2 à 60 secondes : automatique 5.', bloc.ligne);
      break;
    }
    case 'filAriane': {
      const intrus = bloc.corps.find((i) => !(i.type === 'Element' && (i.element === 'lien' || i.element === 'texte')));
      if (intrus) s.erreur('un fil d\'Ariane ne contient que des liens, puis un texte pour la page en cours.', 'ligne' in intrus ? intrus.ligne : bloc.ligne);
      const dernier = bloc.corps[bloc.corps.length - 1];
      if (bloc.corps.length < 2) s.erreur('un fil d\'Ariane a au moins deux éléments : un lien, puis le texte de la page en cours.', bloc.ligne);
      else if (dernier.type === 'Element' && dernier.element !== 'texte') {
        s.erreur('le dernier élément d\'un fil d\'Ariane est la page en cours : un texte, pas un lien.', dernier.ligne);
      }
      break;
    }
  }
}
