import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { Exemple } from '../../composants/Exemple';
import { Encadre } from '../../composants/Encadre';

export function ElementsEcran() {
  return (
    <PageDoc chemin="/documentation/elements-ecran">
      <p>
        De quoi écrire un site complet sans une ligne de React : des icônes, des onglets, un accordéon, un carrousel,
        une note en étoiles, un compteur, un code QR… Chacun s’écrit en tête de ligne, comme un élément ordinaire (voir{' '}
        <Link to="/documentation/elements">les éléments</Link>), accepte les styles nommés et{' '}
        <code>avec style "…"</code>, et reste lisible au clavier et par un lecteur d’écran :{' '}
        <code>avec description "…"</code> donne le texte qu’un lecteur d’écran lit quand l’élément n’en a pas.
      </p>

      <h2>Une icône</h2>
      <p>
        <code>icone "panier"</code> dessine une icône vectorielle (jamais un émoji) à la couleur du texte, donc du
        thème. Sur un bouton ou un lien, <code>avec icone "plus"</code> la place avant le texte. Les noms sont français,
        d’une liste fermée (environ 105 icônes) ; un nom inconnu propose le plus proche.
      </p>
      <Exemple id="elements-icones" />

      <h2>Badge, avatar, progression, chargement, code QR</h2>
      <p>
        <code>badge</code> est une petite étiquette ; <code>avatar "Camille Martin"</code> montre la photo (
        <code>avec photo "camille.jpg"</code>) ou les initiales ; <code>progression 40</code> une barre (avec{' '}
        <code>maximum</code> et <code>pourcentage</code>, <code>progression rien</code> pour une barre qui avance sans
        fin) ; <code>chargement</code> un indicateur qui tourne, avec ou sans texte. <code>code qr "…"</code> dessine
        un code QR, toujours noir sur blanc, même en mode sombre, pour rester lisible.
      </p>
      <Exemple id="elements-petits" />

      <h2>Une note en étoiles, un compteur</h2>
      <p>
        <code>etoiles note</code> montre une note de 0 à 5, avec les demi-étoiles (<code>maximum</code> change
        l’échelle) ; avec <code>modifiable</code>, on clique sur une étoile pour changer la variable.{' '}
        <code>compteur quantite</code> est le « – 1 + » lié à une variable nombre ; <code>minimum</code> et{' '}
        <code>maximum</code> la bornent.
      </p>
      <Exemple id="elements-note-compteur" />

      <h2>Des onglets</h2>
      <p>
        <code>onglets :</code> contient des <code>onglet "Titre" :</code> ; un seul contenu est visible à la fois, le
        premier au départ (ou celui qui est <code>avec ouvert</code>). Les flèches, Début et Fin changent d’onglet sur
        le web.
      </p>
      <Exemple id="elements-onglets" />

      <h2>Déplier : deroulant et accordeon</h2>
      <p>
        <code>deroulant "Titre" :</code> se déplie en cliquant sur son titre. Réunis dans un <code>accordeon :</code>,
        un seul est ouvert à la fois (<code>accordeon avec plusieurs</code> les laisse tous s’ouvrir).
      </p>
      <Exemple id="elements-accordeon" />

      <h2>Un carrousel</h2>
      <p>
        Chaque élément de <code>carrousel :</code> est une diapositive, aussi ceux d’un <code>pour chaque</code>.
        Le doigt et la molette font défiler ; des flèches et des points s’y ajoutent.{' '}
        <code>avec automatique 5</code> le fait défiler seul (il s’arrête sous la souris et si l’appareil demande moins
        de mouvement), <code>avec visibles 2</code> en montre deux à la fois (une seule sur un téléphone).
      </p>
      <Exemple id="elements-carrousel" />

      <h2>Un fil d’Ariane</h2>
      <p>
        <code>fil d'Ariane :</code> montre le chemin qui mène à la page : des liens, puis le texte de la page en cours.
        Il s’écrit à la main : Humalis ne déduit pas de hiérarchie entre les pages.
      </p>
      <Exemple id="elements-fil" />

      <Encadre titre="Sur chaque cible">
        <p>
          Sur le web et le bureau, les icônes viennent de <code>lucide-react</code> et le code QR de{' '}
          <code>qrcode.react</code> : ces bibliothèques, et le petit composant de l’élément (étoiles, compteur,
          carrousel…), ne sont ajoutés au projet produit que si le programme s’en sert. Sur le site statique, qui n’a pas
          de <code>npm install</code>, les icônes sont des SVG écrits dans la page et le code QR est dessiné par un
          petit fichier recopié dans le site (<code>humalis/qrcode.js</code>). Sur le téléphone : <code>lucide-react-native</code>,{' '}
          <code>react-native-qrcode-svg</code> et <code>react-native-svg</code> ; une icône n’est pas encore placée
          avant le texte d’un bouton, et les flèches du clavier ne changent pas d’onglet sur le site statique.
        </p>
      </Encadre>
    </PageDoc>
  );
}
