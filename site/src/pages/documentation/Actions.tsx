import { PageDoc } from '../../composants/PageDoc';
import { Exemple } from '../../composants/Exemple';
import { MotsDeLaCategorie } from '../../composants/MotsDeLaCategorie';

export function Actions() {
  return (
    <PageDoc chemin="/documentation/actions">
      <p>Une action est ce que Humalis fait quand un événement arrive. Les actions se placent dans un événement.</p>

      <h2>Afficher un message</h2>
      <p><code>afficher "…"</code> montre toujours un message. C’est la seule action permise hors d’un événement.</p>
      <Exemple id="actions-afficher" />
      <p><code>afficher erreur "…"</code> montre un message d’erreur.</p>
      <Exemple id="actions-afficher-erreur" />

      <h2>Montrer et cacher un élément</h2>
      <p>
        <code>montrer "…"</code> fait apparaître un élément, <code>cacher "…"</code> le fait disparaître. Entre
        guillemets, le nom ou le libellé de l’élément, écrit en toutes lettres.
      </p>
      <Exemple id="actions-montrer-cacher" />

      <h2>Changer le texte d’un élément</h2>
      <Exemple id="actions-changer-texte" />

      <h2>Aller vers une autre page</h2>
      <Exemple id="actions-rediriger" />

      <h2>Les pièges</h2>
      <p>
        Hors d’un événement, <code>montrer</code>, <code>cacher</code>, <code>changer</code>, <code>rediriger</code>,{' '}
        <code>ajouter</code>, <code>retirer</code> et <code>envoyer requete</code> n’ont pas de moment où s’exécuter :
        Humalis les refuse.
      </p>
      <Exemple id="actions-hors-evenement" />

      <h2>Mots utilisés</h2>
      <MotsDeLaCategorie categorie="action" />
    </PageDoc>
  );
}
