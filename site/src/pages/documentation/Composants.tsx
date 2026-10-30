import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { Exemple } from '../../composants/Exemple';
import { Encadre } from '../../composants/Encadre';
import { BlocTerminal } from '../../composants/BlocCode';
import { CARTE_REACT } from '../../contenu/projetWeb';

export function Composants() {
  return (
    <PageDoc chemin="/documentation/composants">
      <p>
        Un composant est un morceau d’écran qu’on réutilise. Humalis parle avec React dans les deux sens : tu peux
        utiliser un composant React écrit à la main, ou écrire un composant en Humalis.
      </p>

      <h2>Utiliser un composant React</h2>
      <p>
        En haut du fichier, dis d’où vient le composant : <code>utiliser composant "Carte" depuis "./composants/Carte"</code>.
        Ensuite, dans une page, écris son nom <strong>avec une majuscule</strong>, comme en React. Les propriétés suivent{' '}
        <code>avec</code>, reliées par <code>et</code> :
      </p>
      <ul>
        <li>
          un texte entre guillemets devient un attribut : <code>titre "Fournitures"</code> donne{' '}
          <code>{'titre="Fournitures"'}</code> ;
        </li>
        <li>
          une variable, un nombre ou une expression devient une valeur React : <code>prix prix_minimum</code> donne{' '}
          <code>{'prix={prix_minimum}'}</code>.
        </li>
      </ul>
      <Exemple id="composants-carte" />

      <h3>Où est le fichier React ?</h3>
      <p>
        Humalis cherche le fichier <strong>à côté de ton fichier <code>.humalis</code></strong>, avec ou sans extension
        (<code>.tsx</code>, <code>.ts</code>, <code>.jsx</code>, <code>.js</code>). Le fichier doit exporter son
        composant <strong>par défaut</strong> (<code>export default</code>). À la compilation, il est recopié dans{' '}
        <code>src/composants/</code> du projet produit. S’il est introuvable, la commande s’arrête avec la ligne du{' '}
        <code>utiliser composant</code>, et rien n’est écrit.
      </p>
      <p>Voici le composant React de l’exemple complet <code>exemples/vitrine.humalis</code>, lu directement dans le dépôt :</p>
      <BlocTerminal code={CARTE_REACT.trimEnd()} legende="exemples/composants/Carte.tsx" etiquette="Composant React écrit à la main" />

      <h2>Écrire un composant en Humalis</h2>
      <p>
        <code>composant "Fiche" :</code> déclare un composant. Son nom commence par une majuscule. Chaque{' '}
        <code>parametre</code> est une valeur que l’appelant donnera, et le composant s’en sert comme d’une variable.
        Sur le web, il devient un composant React exporté, dans <code>src/composants/Fiche.tsx</code>.
      </p>
      <Exemple id="composants-fiche" />

      <h3>Un paramètre oublié</h3>
      <p>
        Si tu ne donnes pas un paramètre, Humalis ne bloque rien mais te prévient, avec la ligne de l’appel.
      </p>
      <Exemple id="composants-parametre-oublie" />

      <h2>Un exemple complet</h2>
      <p>
        <code>exemples/vitrine.humalis</code> mélange les deux sens : une carte React écrite à la main et deux fiches
        écrites en Humalis.
      </p>
      <Exemple id="composants-vitrine" legende="exemples/vitrine.humalis" />
      <BlocTerminal
        code="node dist/cli.js compile exemples/vitrine.humalis --cible web --sortie ../vitrine-web --adresse https://mon-site.cd"
      />

      <h2>Les pièges</h2>
      <p>Un composant jamais déclaré. Le message dit comment le déclarer :</p>
      <Exemple id="composants-inconnu" />
      <p>Un nom de composant sans majuscule :</p>
      <Exemple id="composants-minuscule" />
      <p>Une propriété que le composant Humalis n’a pas déclarée comme paramètre :</p>
      <Exemple id="composants-propriete-inconnue" />

      <Encadre titre="Ce qui est vérifié, et ce qui ne l’est pas" attention>
        <p>
          Humalis vérifie ton programme, mais <strong>pas</strong> le fichier React : il ne contrôle pas que les
          propriétés données à <code>Carte</code> existent dans <code>Carte.tsx</code>. C’est TypeScript, dans le projet
          produit, qui le fera. Un composant ne peut pas non plus être créé dans un événement : place-le dans la page.
        </p>
      </Encadre>

      <h2>La suite</h2>
      <ul>
        <li>
          <Link to="/documentation/humalis-dans-react">Humalis dans un projet React</Link> : le chemin inverse, des pages
          Humalis dans ton projet React.
        </li>
        <li>
          <Link to="/documentation/partager-entre-les-pages">Partager entre les pages</Link>.
        </li>
      </ul>
    </PageDoc>
  );
}
