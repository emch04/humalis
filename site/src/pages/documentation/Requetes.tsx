import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { Exemple } from '../../composants/Exemple';
import { MotsDeLaCategorie } from '../../composants/MotsDeLaCategorie';
import { Encadre } from '../../composants/Encadre';

export function Requetes() {
  return (
    <PageDoc chemin="/documentation/requetes">
      <p>Une requête demande des données à une adresse, ou lui en envoie.</p>

      <h2>La syntaxe</h2>
      <p>
        <code>envoyer requete vers "/adresse"</code>. Ajoute <code>avec</code> pour envoyer des données, et{' '}
        <code>dans</code> pour ranger la réponse dans une variable.
      </p>
      <Exemple id="requetes-lecture" />
      <Exemple id="requetes-envoi" />

      <Encadre titre="Ce que le compilateur fait de ça" attention>
        <p>
          Il comprend la requête et vérifie les variables qu’elle utilise. Le site web produit appelle l’adresse avec{' '}
          <code>fetch</code>. Si ton fichier contient aussi un <Link to="/documentation/le-serveur">serveur</Link>, le
          compilateur relie les deux : il vérifie la route, les champs lus et les champs envoyés (voir{' '}
          <Link to="/documentation/relier-au-serveur">Relier les pages au serveur</Link>). Sans serveur dans le
          fichier, tu écris l’adresse toi-même et rien ne vérifie qu’elle existe.
        </p>
      </Encadre>

      <h2>Les pièges</h2>
      <p>Une requête se place dans un événement, par exemple <code>quand la page se charge</code>.</p>
      <Exemple id="requetes-hors-evenement" />

      <h2>Mots utilisés</h2>
      <MotsDeLaCategorie categorie="requete" />
    </PageDoc>
  );
}
