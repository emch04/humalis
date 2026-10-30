import { PageDoc } from '../../composants/PageDoc';
import { Exemple } from '../../composants/Exemple';
import { MotsDeLaCategorie } from '../../composants/MotsDeLaCategorie';

export function ListesEtBoucles() {
  return (
    <PageDoc chemin="/documentation/listes-et-boucles">
      <p>Une liste regroupe plusieurs valeurs. Une boucle fait la même chose pour chacune.</p>

      <h2>Écrire une liste</h2>
      <p>Entre crochets, séparée par des virgules : <code>["Pomme", "Banane"]</code>. <code>[]</code> est une liste vide.</p>

      <h2>Parcourir une liste</h2>
      <p>
        <code>pour chaque nom dans produits :</code>. Dans le bloc, <code>nom</code> désigne l’élément en cours.
      </p>
      <Exemple id="listes-simple" />
      <Exemple id="listes-style" />
      <Exemple id="listes-notes" />

      <h2>Une liste vide</h2>
      <p>On la teste avant la boucle, avec <code>si … est vide</code>.</p>
      <Exemple id="listes-vide" />

      <h2>Ajouter, retirer, compter</h2>
      <p>
        <code>ajouter "Pomme" à panier</code> et <code>retirer "Pomme" de panier</code> modifient la liste, dans un
        événement. <code>nombre de panier</code> donne le nombre d’éléments.
      </p>
      <Exemple id="listes-ajouter-retirer" />
      <Exemple id="listes-nombre" />

      <h2>Les pièges</h2>
      <p>La variable d’une boucle n’existe que dans la boucle :</p>
      <Exemple id="listes-hors-boucle" />
      <p>Une liste garde son type :</p>
      <Exemple id="listes-type" />

      <h2>Mots utilisés</h2>
      <MotsDeLaCategorie categorie="boucle" />
    </PageDoc>
  );
}
