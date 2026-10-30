import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { Exemple } from '../../composants/Exemple';
import { Encadre } from '../../composants/Encadre';
import { BlocTerminal } from '../../composants/BlocCode';
import { DONNEES_LIEN, PAGE_LIEN, VITE_CONFIG_LIEN } from '../../contenu/projetLien';

export function RelierAuServeur() {
  return (
    <PageDoc chemin="/documentation/relier-au-serveur">
      <p>
        Quand le <Link to="/documentation/le-serveur">serveur</Link> et les pages sont dans le <strong>même
        fichier</strong>, Humalis les vérifie <strong>ensemble</strong>, avant de lancer quoi que ce soit. Une page lit
        les données de ton serveur, et le compilateur sait ce que ces données contiennent : il te dit tout de suite si
        tu te trompes de route, de champ ou de type.
      </p>

      <h2>Le serveur et les pages dans le même fichier</h2>
      <p>
        Voici toute la boutique dans un seul fichier, <code>exemples/boutique-complete.humalis</code> : un serveur qui
        garde les produits, et une page qui les montre.
      </p>
      <Exemple id="lien-complet" legende="exemples/boutique-complete.humalis" />
      <p>
        Le fichier se compile deux fois, une fois pour chaque cible : le serveur d’un côté, le site web de l’autre
        (voir <a href="#lancer">Lancer les deux projets</a>).
      </p>

      <h2>Lire les données du serveur</h2>
      <p>
        <code>envoyer requete vers "produits" dans produits</code> demande la liste des produits au serveur et la range
        dans la variable <code>produits</code>. Tu écris le <strong>nom de la route</strong>, sans <code>/api/</code> :
        Humalis connaît l’adresse. (Écrire <code>"/api/produits"</code> marche aussi.)
      </p>
      <p>
        La variable devient une <strong>liste de la donnée</strong> : ici, une liste de <code>produit</code>. Dans une
        boucle, chaque élément a les champs de la donnée, et le <strong>point</strong> les lit :
      </p>
      <ul>
        <li>
          <code>p.nom</code> lit le champ <code>nom</code> de l’élément <code>p</code> ;
        </li>
        <li>
          <code>"{'{p.prix}'} €"</code> met le champ <code>prix</code> dans un texte, comme n’importe quelle valeur.
        </li>
      </ul>
      <p>
        Dans le code produit, la liste est typée avec l’interface de la donnée, écrite pour toi (le site calcule ces
        extraits avec le vrai générateur) :
      </p>
      <BlocTerminal code={DONNEES_LIEN.trimEnd()} legende="src/humalis/donnees.ts" etiquette="Interface de la donnée produite" />
      <BlocTerminal code={PAGE_LIEN.trimEnd()} legende="src/pages/Boutique.tsx" etiquette="Page produite qui lit les produits" />

      <h2>Ce que le compilateur vérifie</h2>
      <p>
        Chaque erreur ci-dessous est signalée à la compilation, avec sa ligne et en français. Rien n’est écrit tant que
        le programme a une erreur. Tous les messages sont dans <Link to="/documentation/erreurs">la liste des
        erreurs</Link>.
      </p>

      <h3>La route existe</h3>
      <p>Un singulier à la place d’un pluriel, et le compilateur te donne les routes qui existent :</p>
      <Exemple id="lien-route-inconnue" />

      <h3>Le champ lu existe</h3>
      <p>
        Le compilateur connaît les champs de la donnée. Une faute de frappe dans <code>p.prixx</code> est refusée, avec
        la liste des bons champs :
      </p>
      <Exemple id="lien-champ-inconnu" />

      <h3>Le type est le bon</h3>
      <p>
        Le type d’un champ vient de la donnée. Comparer un texte avec un nombre est refusé, comme pour une variable :
      </p>
      <Exemple id="lien-type" />

      <h3>Les champs envoyés existent</h3>
      <p>
        Quand une requête envoie des valeurs (<code>avec …</code>), leur nom doit être celui d’un champ de la donnée.
        Le nom d’une variable, ou celui d’un champ de la page, fait le lien :
      </p>
      <Exemple id="lien-champ-envoye" />
      <p>Et la valeur envoyée doit avoir le type du champ :</p>
      <Exemple id="lien-type-envoye" />

      <h3>Un visiteur sera refusé : un avertissement</h3>
      <p>
        Les règles du serveur sont connues du compilateur. Si une page envoie quelque chose que la règle refusera à
        un visiteur sans compte, Humalis te prévient. Ce n’est pas une erreur : le programme compile.
      </p>
      <Exemple id="lien-visiteur" />
      <p>
        L’avertissement ne change pas la règle. Elle vient toujours du serveur : la page ne contourne rien, et
        Humalis n’invente aucune sécurité (voir <Link to="/documentation/le-serveur">le serveur</Link>).
      </p>

      <Encadre titre="Sans serveur dans le fichier, rien ne change">
        <p>
          Si le fichier ne contient pas de bloc <code>serveur</code>, <code>envoyer requete</code> marche comme avant
          (voir <Link to="/documentation/requetes">les requêtes</Link>) : tu écris l’adresse, et le compilateur ne
          vérifie ni l’adresse ni la réponse.
        </p>
      </Encadre>

      <h2 id="lancer">Lancer les deux projets ensemble</h2>
      <p>
        Tu compiles le même fichier deux fois. Comme avant, construis d’abord le compilateur (voir{' '}
        <Link to="/documentation/creer-ton-site-web">Créer ton site web</Link>), puis :
      </p>
      <BlocTerminal
        code={
          'node dist/cli.js compile exemples/boutique-complete.humalis --cible serveur --sortie ../boutique-serveur\n' +
          'node dist/cli.js compile exemples/boutique-complete.humalis --cible web --sortie ../boutique-web'
        }
      />
      <p>
        Lance le serveur d’abord (voir <Link to="/documentation/le-serveur">le serveur</Link> pour le fichier{' '}
        <code>.env</code> et npm 11), puis le site, en lui disant où est le serveur avec <code>HUMALIS_SERVEUR</code> :
      </p>
      <BlocTerminal
        code={
          '# premier terminal : le serveur (port 3000 par défaut)\n' +
          'cd ../boutique-serveur\nnpm install\ncp .env.exemple .env      # puis remplis JWT_SECRET et l’administrateur\nnpm run build && npm start\n\n' +
          '# second terminal : le site\n' +
          'cd ../boutique-web\nnpm install\nHUMALIS_SERVEUR=http://localhost:3000 npm run dev'
        }
      />
      <p>
        Sans <code>HUMALIS_SERVEUR</code>, le site cherche le serveur sur <code>http://localhost:3000</code>. Le site
        produit relaie les adresses <code>/api</code> et <code>/auth</code> vers ton serveur, avec{' '}
        <code>vite dev</code> comme avec <code>vite preview</code> ; c’est son fichier <code>vite.config.ts</code> :
      </p>
      <BlocTerminal code={VITE_CONFIG_LIEN.trimEnd()} legende="vite.config.ts" etiquette="Relais du site vers le serveur" />
      <ul>
        <li>
          Le navigateur parle toujours au site, jamais directement au serveur : pas de réglage de domaine à faire en
          développement.
        </li>
        <li>
          La <strong>protection CSRF</strong> est gérée pour toi : le code produit lit le jeton que pose le pack
          Astratra (le cookie <code>astratra_csrf</code>) et l’envoie dans l’en-tête <code>x-csrf-token</code> pour
          chaque envoi. Tu n’écris rien.
        </li>
        <li>
          Pour publier, le site et le serveur peuvent partager le même domaine, ou le site peut être construit avec{' '}
          <code>VITE_HUMALIS_SERVEUR</code> (l’adresse du serveur). Ce chemin-là n’a pas été essayé.
        </li>
      </ul>

      <Encadre titre="Ce qui est vérifié en vrai">
        <p>
          Le lien a été essayé dans un vrai navigateur (<code>npm run essai:lien</code>, dans le dépôt) : l’administrateur
          crée un produit sur le serveur démarré, et la page web, servie avec son relais, l’affiche avec son nom et
          son prix. Les vérifications du compilateur, elles, sont testées une par une.
        </p>
      </Encadre>

      <h2>Modifier et supprimer</h2>
      <p>
        Une page change ou supprime une donnée qu’elle a lue : <code>modifier p dans "produits" avec prix = …</code>{' '}
        ne change que les champs nommés, <code>supprimer p de "produits"</code> la retire du serveur. À ne pas confondre
        avec <code>retirer … de …</code>, qui ne change que la liste de la page. Le compilateur vérifie la route, les
        champs et leurs types, et te prévient si la règle d’accès refusera un visiteur.
      </p>
      <Exemple id="lien-gestion" legende="exemples/gestion.humalis" />

      <h2>Une page par produit</h2>
      <p>
        Une page peut recevoir une valeur dans son adresse : <code>page "produit" avec parametre id :</code>. Un lien la
        lui donne (<code>lien p.nom vers "produit" avec id p.id</code>), et la page lit ce seul produit avec{' '}
        <code>envoyer requete vers "produits" avec id dans produit</code>. Tant que le serveur n’a pas répondu, la
        variable vaut <code>rien</code> : <code>si produit est rien :</code> affiche un message d’attente. L’adresse est{' '}
        <code>/produit/42</code> sur le web et le mobile, <code>produit.html?id=42</code> en site statique.
      </p>
      <Exemple id="lien-catalogue" legende="exemples/catalogue.humalis" />

      <h2>Se connecter depuis une page</h2>
      <Encadre titre="La connexion passe par les packs">
        <p>
          Pour créer, modifier ou supprimer ce que le serveur réserve à une personne connectée, la page ouvre une
          session : <code>se connecter avec champ "email" et champ "mot de passe"</code>, dans un événement. Ensuite,{' '}
          <code>si utilisateur est connecte :</code> montre ce qui lui est réservé, et <code>se deconnecter</code>{' '}
          ferme la session. La session est le cookie <code>HttpOnly</code> posé par les packs Astratra : ta page ne
          garde jamais le mot de passe.
        </p>
      </Encadre>
      <h2>Ce qui n’existe pas encore</h2>
      <p>
        Il n’y a pas, pour l’instant, de lecture d’<em>un seul</em> élément par son identifiant depuis une
        page : une requête lit la liste de la route.
      </p>
    </PageDoc>
  );
}
