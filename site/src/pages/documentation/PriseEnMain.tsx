import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { BlocTerminal } from '../../composants/BlocCode';
import { Encadre } from '../../composants/Encadre';
import { Exemple } from '../../composants/Exemple';

export function PriseEnMain() {
  return (
    <PageDoc chemin="/documentation/prise-en-main">
      <p>Voici comment lire un premier programme Humalis, et ce que le compilateur fait pour toi aujourd’hui.</p>

      <Encadre titre="Ce que Humalis fait aujourd’hui" attention>
        <p>
          Humalis <strong>lit une page, la comprend et la vérifie</strong> (variables, éléments, types), puis{' '}
          <strong>produit un site web React prérendu</strong>, une <Link to="/documentation/ton-application-mobile">application mobile</Link>{' '}
          Expo, une <Link to="/documentation/ton-application-de-bureau">application de bureau</Link> Electron, un{' '}
          <Link to="/documentation/ton-site-statique">site statique</Link>, ou un <Link to="/documentation/le-serveur">serveur Node</Link>. <Link to="/documentation/creer-ton-site-web">Créer ton site web</Link> explique comment.
        </p>
      </Encadre>

      <h2>Un premier programme</h2>
      <p>
        Un fichier Humalis finit par <code>.humalis</code>. Il contient des pages. Voici l’exemple « boutique » du
        dépôt, lu directement depuis son fichier :
      </p>
      <Exemple id="accueil-vitrine" legende="exemples/boutique.humalis" />
      <p>
        Lis-le ligne par ligne. <code>page "boutique" :</code> ouvre une page. Tout ce qui est décalé de 4 espaces
        appartient à cette page. <code>titre</code>, <code>texte</code> et <code>bouton</code> sont des éléments.{' '}
        <code>avec couleur bleu</code> est un style. <code>pour chaque nom dans produits :</code> répète le bloc pour
        chaque produit.
      </p>
      <p>Et un deuxième, avec un champ et une condition :</p>
      <Exemple id="fichier-connexion" legende="exemples/connexion.humalis" />

      <h2>Vérifier un programme</h2>
      <p>
        Il faut Node.js 24 ou plus récent. Dans le dossier du dépôt :
      </p>
      <BlocTerminal code={'npm install\nnpm test\nnpm run build\nnode dist/cli.js verifier exemples/boutique.humalis'} />
      <p>
        <code>npm test</code> lance tous les tests du compilateur. La commande <code>verifier</code> affiche les erreurs
        et les avertissements avec leur ligne, puis la représentation intermédiaire du programme (un arbre neutre, sans
        plateforme, que lisent les cibles). Elle sort avec le code 1 s’il y a une erreur.
      </p>
      <p>
        Sur l’exemple « boutique », elle répond « Aucune erreur. ». Si le programme avait un détail douteux, elle
        afficherait un avertissement, qui te prévient sans rien bloquer.
      </p>

      <h2>Dans ton éditeur</h2>
      <p>
        Le dépôt contient une extension pour VS Code (dossier <code>editeur/vscode</code>). Elle souligne les erreurs
        du compilateur à la bonne ligne, avec son message en français, et colore le code. Elle se construit à la main
        et n’est pas publiée.
      </p>

      <h2>La suite</h2>
      <ul>
        <li>
          <Link to="/documentation/principes">Les principes</Link> expliquent comment Humalis lit ce que tu écris.
        </li>
        <li>
          <Link to="/documentation/creer-ton-site-web">Créer ton site web</Link> transforme ton programme en projet React.
        </li>
        <li>
          <Link to="/documentation/pages">Les pages</Link> ouvrent la partie sur le langage.
        </li>
        <li>
          <Link to="/documentation/erreurs">Les messages d’erreur</Link> te serviront dès ta première faute de frappe.
        </li>
      </ul>
    </PageDoc>
  );
}
