import { PageDoc } from '../../composants/PageDoc';
import { Exemple } from '../../composants/Exemple';
import { MotsDeLaCategorie } from '../../composants/MotsDeLaCategorie';

export function Variables() {
  return (
    <PageDoc chemin="/documentation/variables">
      <p>Une variable garde une valeur sous un nom. Cette valeur peut changer.</p>

      <h2>Déclarer une variable</h2>
      <p>
        <code>variable nom = valeur</code>. La valeur est un texte, un nombre, <code>vrai</code> ou <code>faux</code>,
        ou une liste. Une variable se déclare une seule fois dans sa page, avant son premier usage.
      </p>
      <Exemple id="variables-declarations" />

      <h2>Texte ou variable ?</h2>
      <p>
        Entre guillemets, c’est du texte. Sans guillemets, c’est une variable déjà déclarée. Dans l’exemple, le premier{' '}
        <code>texte</code> affiche le mot « nom », le second affiche « Awa ».
      </p>
      <Exemple id="variables-litteral" />

      <h2>Mettre une variable dans un texte</h2>
      <p>Écris le nom entre accolades, dans le texte : <code>{'{nom}'}</code>. On ne colle pas du texte avec « + ».</p>
      <Exemple id="variables-interpolation" />

      <h2>Changer la valeur</h2>
      <p>
        <code>changer clics par 0</code>. Le type ne change pas : un nombre reste un nombre. Le changement se fait dans
        un événement.
      </p>
      <Exemple id="variables-changer" />

      <h2>Calculer</h2>
      <p>
        Avec des nombres, tu peux utiliser <code>+</code>, <code>-</code>, <code>*</code> et <code>/</code>, et des
        parenthèses. <code>*</code> et <code>/</code> passent avant <code>+</code> et <code>-</code>.
      </p>
      <Exemple id="calculs-compteur" />
      <Exemple id="calculs-priorite" />
      <p>
        Avec <code>calcul</code> au lieu de <code>variable</code>, la valeur se recalcule toute seule quand les
        variables dont elle dépend changent. On ne la change donc pas à la main.
      </p>
      <Exemple id="calculs-recalcul" />

      <h2>Les nombres et les dates, au format français</h2>
      <p>
        Dans un texte, un nombre s’écrit tout seul au format français : 28 000 avec l’espace des milliers, 3,5 avec
        la virgule. Une date lue sur le serveur s’écrit « 7 novembre 2026 ». Tu n’as rien à ajouter.
      </p>
      <Exemple id="format-nombre" />

      <h2>Les pièges</h2>
      <p>Utiliser une variable jamais déclarée :</p>
      <Exemple id="variables-non-declaree" />
      <p>Déclarer deux fois la même :</p>
      <Exemple id="variables-deja-declaree" />
      <p>Calculer avec un texte, ou diviser par zéro :</p>
      <Exemple id="calculs-texte" />
      <Exemple id="calculs-division-zero" />

      <h2>Mots utilisés</h2>
      <MotsDeLaCategorie categorie="variable" />
      <MotsDeLaCategorie categorie="valeur" />
    </PageDoc>
  );
}
