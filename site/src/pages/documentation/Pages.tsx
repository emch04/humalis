import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { Exemple } from '../../composants/Exemple';
import { MotsDeLaCategorie } from '../../composants/MotsDeLaCategorie';

export function Pages() {
  return (
    <PageDoc chemin="/documentation/pages">
      <p>Une page est un écran de ton application. Tout ce que tu écris vit dans une page.</p>

      <h2>La syntaxe</h2>
      <p>
        <code>page "nom" :</code> ouvre une page. Les lignes décalées de 4 espaces en dessous lui appartiennent.
      </p>
      <Exemple id="pages-simple" />

      <h2>Plusieurs pages dans un fichier</h2>
      <p>
        Écris-les l’une après l’autre, sans décalage. Un lien peut mener de l’une à l’autre grâce à{' '}
        <code>vers</code>.
      </p>
      <Exemple id="pages-deux" />

      <h2>Les pièges</h2>
      <p>
        Une page se désigne par son nom : deux pages ne peuvent pas porter le même. À la racine du fichier, Humalis
        n’accepte que des pages.
      </p>
      <Exemple id="pages-doublon" />
      <p>
        Tous les messages d’erreur sont expliqués dans <Link to="/documentation/erreurs">la page des erreurs</Link>.
      </p>

      <h2>Mots utilisés</h2>
      <MotsDeLaCategorie categorie="structure" />
    </PageDoc>
  );
}
