import { PageDoc } from '../../composants/PageDoc';
import { Exemple } from '../../composants/Exemple';
import { MotsDeLaCategorie } from '../../composants/MotsDeLaCategorie';
import { Link } from 'react-router';

export function Evenements() {
  return (
    <PageDoc chemin="/documentation/evenements">
      <p>Un événement dit ce qui doit se passer quand quelque chose arrive : un clic, un survol, l’ouverture de la page.</p>

      <h2>La syntaxe</h2>
      <p>
        <code>quand …</code>, deux-points, puis les actions du bloc décalées de 4 espaces. L’événement s’écrit dans la
        page, de préférence juste sous l’élément qu’il vise.
      </p>

      <h2>Un clic</h2>
      <p>
        <code>quand l’utilisateur clique sur "…"</code>. Entre guillemets, le libellé ou le nom de l’élément visé.
      </p>
      <Exemple id="evenements-clic" />

      <h2>Un survol</h2>
      <p>
        <code>quand l’utilisateur survole "…"</code>. Il n’y a pas de « sur » ici : survoler se construit directement.
      </p>
      <Exemple id="evenements-survol" />

      <h2>L’ouverture de la page</h2>
      <p><code>quand la page se charge :</code> s’exécute quand la page s’ouvre.</p>
      <Exemple id="evenements-chargement" />

      <h2>Plusieurs événements</h2>
      <Exemple id="evenements-plusieurs" />

      <h2>Dans une boucle</h2>
      <p>
        Un événement peut aussi s’écrire dans une boucle <code>pour chaque</code> de la page. Il voit alors la variable
        de la boucle, et ne vise qu’un élément de la même boucle.
      </p>
      <Exemple id="evenements-boucle" />
      <p>Viser un élément qui est hors de la boucle est refusé :</p>
      <Exemple id="evenements-boucle-hors" />

      <h2>Sous son élément, même dans un « si »</h2>
      <p>
        Un événement s’écrit là où est son élément : dans un <code>si</code>, un <code>sinon</code>, une{' '}
        <Link to="/documentation/mise-en-page">section ou une ligne</Link>, un formulaire. Il n’agit que tant que son
        élément est affiché.
      </p>
      <Exemple id="evenements-dans-un-si" />
      <p>Mais jamais à l’intérieur d’un autre événement :</p>
      <Exemple id="evenements-dans-un-evenement" />

      <h2>Les formulaires</h2>
      <p>
        Un bloc <code>formulaire "…" :</code> regroupe des champs et un bouton. La touche Entrée dans un champ, ou
        le bouton, l’envoie : <code>quand le formulaire "…" est soumis</code> dit ce qui se passe. Les champs
        obligatoires sont vérifiés avant, avec un message en français ; après un envoi réussi, les champs sont vidés.
        Si le serveur refuse l’envoi, l’événement s’arrête et les champs restent remplis pour corriger (voir{' '}
        <Link to="/documentation/elements">les champs</Link>).
      </p>
      <Exemple id="evenements-formulaire" />

      <h2>Mots utilisés</h2>
      <MotsDeLaCategorie categorie="evenement" />
    </PageDoc>
  );
}
