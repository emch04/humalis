import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { BlocTerminal } from '../../composants/BlocCode';
import { Encadre } from '../../composants/Encadre';
import { CHEMINS_COMPOSANTS_BOUTIQUE, LISEZMOI_COMPOSANTS, PROJET_REACT_HOTE, RACINE_COMPOSANTS } from '../../contenu/projetWeb';

export function HumalisDansReact() {
  return (
    <PageDoc chemin="/documentation/humalis-dans-react">
      <p>
        Tu as déjà un projet React et tu veux y ajouter des pages écrites en Humalis ? Tu n’as pas besoin de tout
        changer : Humalis peut écrire <strong>seulement les pages</strong>, que ton projet importe comme n’importe
        quel composant.
      </p>

      <h2>L’option --composants</h2>
      <BlocTerminal code="node dist/cli.js compile exemples/boutique.humalis --cible web --composants src/humalis-boutique" />
      <p>
        Avec <code>--composants</code>, le dossier donné reçoit les pages et leurs outils, mais pas de projet Vite :
        ni <code>package.json</code>, ni <code>main.tsx</code>, ni prérendu. Il n’y a donc pas besoin de{' '}
        <code>--sortie</code> ni de <code>--adresse</code>. Les mêmes règles s’appliquent : un dossier vide, ou déjà
        produit par Humalis, est accepté ; un autre est refusé et rien n’est écrit. Pour la boutique, le compilateur
        écrit ces {CHEMINS_COMPOSANTS_BOUTIQUE.length} fichiers :
      </p>
      <BlocTerminal code={CHEMINS_COMPOSANTS_BOUTIQUE.join('\n')} etiquette="Fichiers écrits avec l’option --composants" />
      <ul>
        <li>
          <code>pages/</code> : un composant React par page, exporté par défaut (<code>Boutique</code>,{' '}
          <code>Panier</code>) ;
        </li>
        <li>
          <code>humalis/</code> : les petits outils des pages (messages, titre, appels au serveur) et, quand le
          programme partage des variables, <code>partage.tsx</code> ;
        </li>
        <li>
          <code>humalis/racine.tsx</code> : le composant <code>HumalisRacine</code> ;
        </li>
        <li>
          <code>LISEZMOI.md</code> : le mode d’emploi, écrit pour ton programme.
        </li>
      </ul>

      <h2>HumalisRacine</h2>
      <p>
        Les pages ont besoin de quelques services autour d’elles : les messages (<code>afficher</code>), les variables
        partagées et le CSS d’Humalis. <code>HumalisRacine</code> les regroupe. Place-le <strong>une fois</strong>,
        autour des pages Humalis, <strong>à l’intérieur du routeur</strong> de ton projet (<code>BrowserRouter</code> de
        react-router), parce que les pages utilisent les liens et la navigation du routeur.
      </p>
      <BlocTerminal code={RACINE_COMPOSANTS.trimEnd()} legende="humalis/racine.tsx, écrit par genererComposantsWeb" etiquette="Code de HumalisRacine" />
      <p>
        Ce texte n’est pas recopié : le site le calcule avec le vrai générateur. Comme la boutique partage son panier,
        <code> HumalisRacine</code> contient <code>Partage</code>. Un programme sans variable partagée n’en aurait pas.
      </p>

      <h2>Les routes à déclarer</h2>
      <p>
        Les pages Humalis naviguent entre elles avec leurs adresses (<code>lien "Voir le panier" vers "panier"</code>{' '}
        mène à <code>/panier</code>). C’est <strong>à toi</strong> de déclarer ces routes dans ton routeur, avec les
        mêmes adresses. Le <code>LISEZMOI.md</code> produit en donne la liste :
      </p>
      <BlocTerminal code={LISEZMOI_COMPOSANTS.trimEnd()} legende="LISEZMOI.md, écrit par genererComposantsWeb" etiquette="Le LISEZMOI produit pour la boutique" />

      <h2>Un projet React qui l’utilise</h2>
      <p>
        Dans le dépôt, <code>essais/react-hote/</code> est un projet React écrit à la main, qui n’est pas produit par
        Humalis. Voici son point d’entrée, lu directement dans le dépôt :
      </p>
      <BlocTerminal code={PROJET_REACT_HOTE.trimEnd()} legende="essais/react-hote/src/main.tsx" etiquette="Un projet React qui importe les pages de la boutique" />
      <p>
        La commande <code>npm run essai:react-hote</code>, à la racine du dépôt, compile la boutique dans ce projet, le
        construit et le pilote dans Chromium : la boutique y marche, avec son panier partagé entre les deux pages.
      </p>

      <Encadre titre="À savoir" attention>
        <ul>
          <li>
            Ton projet doit avoir <code>react</code>, <code>react-dom</code> et <code>react-router</code> (les versions
            sont dans le <code>LISEZMOI.md</code>).
          </li>
          <li>
            Le dossier est <strong>réécrit à chaque compilation</strong> : ne modifie pas les fichiers à la main, mets
            ton propre code à côté.
          </li>
          <li>
            Le prérendu (une page HTML par adresse) ne fait pas partie de ce mode : il appartient au projet complet de{' '}
            <Link to="/documentation/creer-ton-site-web">Créer ton site web</Link>.
          </li>
        </ul>
      </Encadre>

      <h2>La suite</h2>
      <p>
        Pour faire l’inverse, utiliser tes composants React dans Humalis, lis{' '}
        <Link to="/documentation/composants">Les composants</Link>.
      </p>
    </PageDoc>
  );
}
