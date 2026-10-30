import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { Exemple } from '../../composants/Exemple';
import { MotsDeLaCategorie } from '../../composants/MotsDeLaCategorie';

export function Elements() {
  return (
    <PageDoc chemin="/documentation/elements">
      <p>
        Un élément est ce que l’utilisateur voit dans une page : un titre, un texte, une image, un bouton, un lien,
        un champ.
      </p>

      <h2>La syntaxe</h2>
      <p>
        Le nom de l’élément, puis son contenu entre guillemets : <code>titre "Bienvenue"</code>. Tu peux ajouter des
        options avec <code>avec</code> (voir <Link to="/documentation/styles">les styles</Link>).
      </p>

      <h2>Titre et texte</h2>
      <Exemple id="elements-titre-texte" />

      <h2>Sous-titre</h2>
      <p>
        <code>soustitre</code> ouvre une partie de la page, sous le titre principal (niveau 2 par défaut). Pour une
        partie plus petite, <code>avec niveau 3</code> (de 2 à 6). Un lecteur d’écran s’en sert pour parcourir la page :
        garde l’ordre des niveaux, sans en sauter.
      </p>
      <Exemple id="elements-soustitre" />

      <h2>Image</h2>
      <p>Le contenu est le nom du fichier de l’image.</p>
      <Exemple id="elements-image" />

      <h2>Bouton</h2>
      <p>Le contenu est le libellé écrit sur le bouton.</p>
      <Exemple id="elements-bouton" />

      <h2>Lien</h2>
      <p>Un lien a un libellé et une page cible, introduite par <code>vers</code>.</p>
      <Exemple id="elements-lien" />

      <h2>Champ</h2>
      <p>
        Un champ est une zone où l’utilisateur écrit. Son contenu est son nom. Pour lire ce qu’il contient, on écrit{' '}
        <code>le champ "email"</code> (voir <Link to="/documentation/conditions">les conditions</Link>).
      </p>
      <Exemple id="elements-champ" />

      <h2>Les sortes de champ</h2>
      <p>
        La sorte s’écrit juste après <code>champ</code>, avant le libellé : <code>email</code>,{' '}
        <code>telephone</code>, <code>nombre</code>, <code>date</code>, <code>heure</code>,{' '}
        <code>mot de passe</code>, <code>texte long</code>, <code>adresse web</code>. Chaque cible choisit la bonne
        saisie : le bon clavier sur un téléphone, le bon type de champ dans le navigateur. Un champ{' '}
        <code>nombre</code> vaut un nombre : on peut le comparer et l’envoyer à un champ <code>nombre</code> du
        serveur. Les options : <code>obligatoire</code>, <code>indice "…"</code> (le texte gris d’un champ vide), et
        pour un nombre <code>minimum</code> et <code>maximum</code>. Elles sont vérifiées avant l’envoi du formulaire
        (voir <Link to="/documentation/evenements">les événements</Link>).
      </p>
      <Exemple id="elements-sortes" />

      <h2>Case à cocher, choix et liste déroulante</h2>
      <p>
        <code>case a cocher "…"</code> vaut vrai ou faux. <code>choix "…" parmi […]</code> propose quelques valeurs
        (des boutons radio) ; <code>liste deroulante "…" parmi …</code>, une liste qui se déplie. Leur valeur est le
        texte choisi.
      </p>
      <Exemple id="elements-choix" />
      <p>Une option qui ne va pas avec la sorte du champ est refusée :</p>
      <Exemple id="elements-option-mal-placee" />

      <h2>Les pièges</h2>
      <p>
        Un élément se pose dans la page. Tu ne peux pas en créer un dans un événement : pose-le dans la page, puis
        utilise <code>montrer</code> pour le faire apparaître.
      </p>

      <h2>Mots utilisés</h2>
      <MotsDeLaCategorie categorie="element" />
    </PageDoc>
  );
}
