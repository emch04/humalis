import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { Encadre } from '../../composants/Encadre';
import { Exemple } from '../../composants/Exemple';

export function Principes() {
  return (
    <PageDoc chemin="/documentation/principes">
      <p>Cinq règles à connaître. Une fois comprises, tout le reste se lit comme une phrase.</p>

      <h2>1. Les petits mots sont ignorés</h2>
      <p>
        Les articles et les élisions (<code>le</code>, <code>la</code>, <code>les</code>, <code>un</code>,{' '}
        <code>une</code>, <code>des</code>, <code>de</code>, <code>du</code>, <code>au</code>, <code>aux</code>,{' '}
        <code>se</code>, <code>l’</code>, <code>d’</code>…) ne servent qu’à rendre la phrase lisible : Humalis les
        repère, puis les saute pour comprendre. Ces deux
        programmes sont donc identiques :
      </p>
      <Exemple id="principes-liaison-avec" />
      <Exemple id="principes-liaison-sans" />
      <Encadre titre="Attention au petit mot « a »" attention>
        <p>
          <code>a</code> (et <code>à</code>) est un mot de liaison ignoré, comme dans « est égal à 0 ». N’appelle donc
          jamais une variable <code>a</code> : Humalis te le dit, et te demande de choisir un autre nom. C’est pareil pour
          les autres petits mots (<code>le</code>, <code>de</code>, <code>au</code>…).
        </p>
        <Exemple id="principes-variable-a" />
      </Encadre>

      <h2>2. Les accents sont facultatifs</h2>
      <p>
        Écris <code>égal</code> ou <code>egal</code>, <code>inférieure</code> ou <code>inferieure</code> : c’est la
        même chose. Les accords (<code>inférieure</code>, <code>égaux</code>…) sont aussi compris. Une faute
        d’accent ne bloque donc jamais.
      </p>
      <Exemple id="principes-accents" />

      <h2>3. Les blocs se repèrent à l’indentation</h2>
      <p>
        Une ligne qui finit par deux-points ouvre un bloc. Les lignes du bloc sont décalées de <strong>4 espaces</strong>,
        pas plus, pas moins, et jamais avec une tabulation. Il n’y a pas de mot pour fermer un bloc : on revient en
        arrière dans les espaces.
      </p>
      <Exemple id="principes-indentation" />

      <h2>4. Entre guillemets, du texte ; sans guillemets, une variable</h2>
      <p>
        <code>"nom"</code> est le texte « nom ». <code>nom</code> est la variable qui s’appelle ainsi. Voir{' '}
        <Link to="/documentation/variables">les variables</Link>.
      </p>

      <h2>5. Les commentaires commencent par #</h2>
      <p>Tout ce qui suit <code>#</code>, jusqu’à la fin de la ligne, est ignoré. Sauf entre guillemets.</p>
      <Exemple id="principes-commentaires" />

      <h2>Mots réservés et mots contextuels</h2>
      <p>
        Dix-neuf mots sont <strong>réservés</strong> partout : <code>page</code>, <code>composant</code>,{' '}
        <code>serveur</code>, <code>variable</code>, <code>si</code>, <code>sinon</code>, <code>quand</code>,{' '}
        <code>pour</code>, <code>et</code>, <code>ou</code>, <code>non</code>, <code>est</code>, <code>vrai</code>,{' '}
        <code>faux</code>, <code>rien</code>, <code>avec</code>, <code>vers</code>, <code>dans</code>,{' '}
        <code>par</code>. Ils ne peuvent jamais être un nom. Deux d’entre eux (<code>non</code> et{' '}
        <code>rien</code>) ne servent pas encore : ils sont réservés dès maintenant pour qu’aucun programme ne les
        prenne comme noms.
      </p>
      <Exemple id="principes-reserve" />
      <p>
        Tous les autres mots du langage sont <strong>contextuels</strong> : <code>titre</code> est un élément en début
        de ligne, mais peut aussi nommer une variable. C’est permis, mais Humalis te prévient par un avertissement, car
        cela peut prêter à confusion.
      </p>
      <Exemple id="principes-contextuel" />
      <p>
        Les mots des <Link to="/documentation/le-serveur">données et des règles d’accès</Link> (<code>donnee</code>,{' '}
        <code>route</code>, <code>peut</code>, <code>admin</code>, <code>date</code>…) sont encore plus discrets : ils
        n’ont un sens que dans un bloc <code>serveur</code>, et une variable appelée <code>date</code> ou{' '}
        <code>admin</code> ne déclenche aucun avertissement.
      </p>
      <p>
        La liste complète, avec le statut de chaque mot, est dans <Link to="/documentation/vocabulaire">le vocabulaire</Link>.
      </p>
    </PageDoc>
  );
}
