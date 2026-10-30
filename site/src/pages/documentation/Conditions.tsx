import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { Exemple } from '../../composants/Exemple';
import { MotsDeLaCategorie } from '../../composants/MotsDeLaCategorie';

export function Conditions() {
  return (
    <PageDoc chemin="/documentation/conditions">
      <p>Une condition fait une chose ou une autre, selon une comparaison.</p>

      <h2>La syntaxe</h2>
      <p>
        <code>si … est … :</code>, un bloc, puis éventuellement <code>sinon :</code> et un autre bloc.
      </p>
      <Exemple id="conditions-si-sinon" />

      <h2>Les comparaisons</h2>
      <ul>
        <li><code>est égal à</code>, avec un nombre ou un texte.</li>
        <li><code>est inférieur à</code> et <code>est supérieur à</code>, avec des nombres. <code>supérieur ou égal à</code> accepte aussi l’égalité.</li>
        <li><code>est vrai</code> et <code>est faux</code>, pour une variable booléenne.</li>
        <li><code>est vide</code>, pour un texte ou une liste.</li>
      </ul>
      <Exemple id="conditions-egal" />
      <Exemple id="conditions-age" />
      <Exemple id="conditions-vrai" />
      <Exemple id="conditions-vide" />
      <p>Les accents et les accords sont facultatifs :</p>
      <Exemple id="conditions-sans-accent" />

      <h2>Lire un champ</h2>
      <p>
        Dans une condition, <code>le champ "email" est vide</code> teste ce que l’utilisateur a écrit (voir l’exemple
        de <Link to="/documentation/actions">l’action afficher erreur</Link>).
      </p>

      <h2>Les pièges</h2>
      <Exemple id="conditions-comparaison-inconnue" />

      <h2>Mots utilisés</h2>
      <MotsDeLaCategorie categorie="condition" />
    </PageDoc>
  );
}
