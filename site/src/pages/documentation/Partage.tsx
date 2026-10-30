import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { Exemple } from '../../composants/Exemple';
import { Encadre } from '../../composants/Encadre';

export function Partage() {
  return (
    <PageDoc chemin="/documentation/partager-entre-les-pages">
      <p>
        Une variable déclarée dans une page n’existe que dans cette page. Pour qu’un panier, par exemple, soit vu par la
        page « boutique » <em>et</em> par la page « panier », Humalis la <strong>partage</strong>.
      </p>

      <h2>Une variable partagée</h2>
      <p>
        Écris la variable <strong>en haut du fichier</strong>, hors de toute page, et ajoute <code>avec partagee</code>.
        Toutes les pages la voient et peuvent la changer. Dans l’exemple, un clic sur « Ajouter un livre » ajoute un
        article, et la page « panier » le montre.
      </p>
      <Exemple id="partage-panier" />
      <p>
        Sur le web, la variable partagée devient un contexte React (fichier <code>src/humalis/partage.tsx</code>) que le
        routeur place autour de toutes les pages. Les pages produites lisent ce contexte au lieu de garder leur propre
        état. Voir <Link to="/documentation/humalis-dans-react">Humalis dans un projet React</Link> pour la même chose
        dans un projet existant.
      </p>

      <h2>La garder après un rechargement</h2>
      <p>
        Avec <code>avec memorisee</code>, la valeur est gardée dans le navigateur (<code>localStorage</code>) : elle est
        encore là quand l’utilisateur recharge la page ou revient le lendemain. Les deux options se relient par{' '}
        <code>et</code>. <code>memorisee</code> marche aussi sur une variable de page, sans <code>partagee</code>.
      </p>
      <Exemple id="partage-memorisee" />
      <p>
        La valeur est gardée dans le navigateur de la personne, sur son appareil seulement. Elle n’est pas envoyée à un
        serveur et ne passe pas d’un appareil à l’autre.
      </p>

      <h2>Les pièges</h2>
      <p>Une variable en haut du fichier doit dire qu’elle est partagée :</p>
      <Exemple id="partage-sans-option" />
      <p>Et une variable partagée ne se déclare pas dans une page :</p>
      <Exemple id="partage-dans-une-page" />

      <h2>Pourquoi « memorisee en secret » est refusé sur le web</h2>
      <p>
        Pour un jeton de connexion ou un mot de passe, on pourrait écrire <code>avec memorisee en secret</code>. Le
        langage connaît cette forme, mais la cible web la refuse : le navigateur n’a pas de coffre sûr. Tout ce qu’il
        garde (<code>localStorage</code>) peut être lu par n’importe quel script de la page.
      </p>
      <Exemple id="partage-secret" />
      <Encadre titre="Pas de sécurité inventée" attention>
        <p>
          Humalis préfère refuser plutôt que de faire semblant de protéger un secret. La connexion et les secrets
          passent par les packs Astratra, avec la <Link to="/documentation/le-serveur">cible serveur</Link>. Côté
          navigateur, aucun secret ne se mémorise.
        </p>
      </Encadre>
      <p>
        Le refus vient de <code>humalis compile</code>, pas de <code>humalis verifier</code> : le langage accepte la
        forme, c’est la cible qui dit non. Rien n’est écrit dans le dossier de sortie.
      </p>
    </PageDoc>
  );
}
