import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { Exemple } from '../../composants/Exemple';
import { Encadre } from '../../composants/Encadre';
import { BlocTerminal } from '../../composants/BlocCode';
import { MotsDeLaCategorie } from '../../composants/MotsDeLaCategorie';
import {
  CHEMINS_SERVEUR,
  DONNEES_SERVEUR,
  ENV_EXEMPLE_SERVEUR,
  MARQUE_PROJET_SERVEUR,
  ROUTE_AVIS_SERVEUR,
  TESTS_REGLES_SERVEUR,
  VERSIONS_PACKS,
} from '../../contenu/projetServeur';

export function Serveur() {
  return (
    <PageDoc chemin="/documentation/le-serveur">
      <p>
        Un bloc <code>serveur</code> décrit ce que ton application garde (les <strong>données</strong>), où on y accède
        (les <strong>routes</strong>) et <strong>qui a le droit de faire quoi</strong>. Humalis en fait un vrai serveur
        Node.js en TypeScript, que tu peux lire, lancer et reprendre à la main.
      </p>

      <Encadre titre="Et les pages ?">
        <p>
          La cible <strong>serveur</strong> produit un projet qui démarre, et dont les règles d’accès sont testées. Quand
          le serveur et les pages sont dans le même fichier, le compilateur les <strong>relie</strong> : une page lit
          les données du serveur et il vérifie routes, champs et types. Voir{' '}
          <Link to="/documentation/relier-au-serveur">Relier les pages au serveur</Link>.
        </p>
      </Encadre>

      <h2>Un premier serveur</h2>
      <p>
        Un serveur a un nom entre guillemets, puis ses données et ses routes. Ici, une donnée « note » avec deux champs,
        et une route pour la lire :
      </p>
      <Exemple id="serveur-minimal" />
      <p>
        Le bloc <code>serveur</code> peut être seul dans son fichier, ou à côté des pages. Pour l’instant, un seul
        serveur par fichier.
      </p>

      <h2>Les données et leurs champs</h2>
      <p>
        <code>donnee</code> (ou <code>donnée</code>) décrit une sorte de données. Chaque ligne en dessous est un{' '}
        <strong>champ</strong> : son nom, deux-points, son type. Les types possibles :
      </p>
      <ul>
        <li>
          <code>texte</code> : des mots ;
        </li>
        <li>
          <code>nombre</code> : un nombre, entier ou à virgule ;
        </li>
        <li>
          <code>booleen</code> (ou <code>booléen</code>) : vrai ou faux ;
        </li>
        <li>
          <code>date</code> : une date, écrite comme <code>2026-01-31</code> ;
        </li>
        <li>
          <code>liste de …</code> : plusieurs valeurs du même type, par exemple <code>liste de texte</code>.
        </li>
      </ul>
      <Exemple id="serveur-champs" />
      <p>
        Chaque donnée reçoit en plus un identifiant, ajouté par le serveur. Le serveur produit vérifie chaque envoi
        d’après ces champs : un champ du mauvais type, ou inconnu, est refusé avec un message en français (code 400).
        Ce n’est pas de la sécurité : c’est la forme des données, que seul ton programme connaît.
      </p>
      <p>Un type qui n’existe pas est refusé, avec la liste des bons :</p>
      <Exemple id="serveur-type-inconnu" />
      <p>
        Les mots <code>donnee</code>, <code>route</code>, <code>date</code>, <code>admin</code> et les autres mots du
        serveur n’ont un sens spécial qu’à leur place. Ailleurs, ils peuvent toujours nommer une variable ou un champ.
      </p>

      <h2>Les routes</h2>
      <p>
        <code>route "produits"</code> ouvre l’adresse <code>/api/produits</code>. Une route sert <strong>une seule
        donnée</strong>, celle que ses règles nomment. Elle comprend cinq appels :
      </p>
      <ul>
        <li>
          <code>GET /api/produits</code> : la liste ; <code>GET /api/produits/:id</code> : un élément (action{' '}
          <code>lire</code>) ;
        </li>
        <li>
          <code>POST /api/produits</code> : en ajouter un (action <code>creer</code>) ;
        </li>
        <li>
          <code>PATCH /api/produits/:id</code> : en changer un (action <code>modifier</code>) ;
        </li>
        <li>
          <code>DELETE /api/produits/:id</code> : en enlever un (action <code>supprimer</code>).
        </li>
      </ul>

      <h2>Qui peut quoi</h2>
      <p>
        Une règle est une phrase : <strong>qui</strong> <code>peut</code> <strong>quoi</strong> <strong>quelle
        donnée</strong>. Il y a trois « qui » :
      </p>
      <ul>
        <li>
          <code>tout le monde</code> : n’importe qui, même sans compte ;
        </li>
        <li>
          <code>connecte</code> (ou <code>utilisateur connecté</code>) : toute personne qui s’est connectée ;
        </li>
        <li>
          <code>seul admin</code> : seulement les administrateurs.
        </li>
      </ul>
      <p>
        Et quatre actions : <code>lire</code>, <code>creer</code>, <code>modifier</code>, <code>supprimer</code>. On peut
        en relier plusieurs avec <code>et</code>.
      </p>
      <Exemple id="serveur-qui" />

      <h2>« modifier » couvre créer et supprimer</h2>
      <p>
        Pour aller vite, <code>modifier</code> pris seul veut dire « changer les données » au sens large : il couvre
        aussi <code>creer</code> et <code>supprimer</code>, tant que ceux-ci n’ont pas leur propre règle.
      </p>
      <Exemple id="serveur-modifier-couvre" />
      <p>
        Ici, seul un administrateur peut ajouter, changer et enlever un produit. Pour être plus précis, écris{' '}
        <code>creer</code> ou <code>supprimer</code> à part : la règle précise gagne sur <code>modifier</code>.
      </p>
      <Exemple id="serveur-droits-precis" />

      <h2>La porte est fermée par défaut</h2>
      <p>
        <strong>Une action sans règle est refusée à tout le monde</strong>, administrateur compris. Si tu oublies une
        règle, rien ne s’ouvre par erreur. Humalis te le dit, parce que c’est parfois un oubli :
      </p>
      <Exemple id="serveur-porte-fermee" />
      <p>
        Ce message est un avertissement, pas une erreur : le programme compile, et les actions sans règle répondent{' '}
        <code>403</code>. C’est souvent voulu (personne ne doit modifier un avis, par exemple), comme dans l’exemple
        réel du dépôt :
      </p>
      <Exemple id="serveur-boutique" legende="exemples/boutique-serveur.humalis" />

      <h2>La sécurité vient des packs Astratra</h2>
      <Encadre titre="Humalis n’invente aucune sécurité" attention>
        <p>
          Connexion, mots de passe, sessions, rôles, protection CSRF, limites de requêtes : tout passe par les packs
          Astratra. Le code produit les <strong>assemble</strong>, il n’écrit lui-même aucune de ces protections.
        </p>
      </Encadre>
      <p>Voici ce que chaque règle devient, et d’où ça vient :</p>
      <ul>
        <li>
          <strong>La connexion et les sessions</strong> : les routes <code>/auth/login</code>, <code>/auth/logout</code>{' '}
          et <code>/auth/me</code> de <code>createSaasApp</code> ({Object.keys(VERSIONS_PACKS)[0]}). On se connecte en
          envoyant <code>{'{ "email", "password" }'}</code> à <code>/auth/login</code> ; la session est un jeton gardé
          dans un cookie <code>HttpOnly</code>.
        </li>
        <li>
          <strong>« connecte »</strong> : la garde <code>authMiddleware</code> du pack.
        </li>
        <li>
          <strong>« seul admin »</strong> : <code>authMiddleware</code>, puis <code>authorizeAdmin</code> (le rôle{' '}
          <code>admin</code>).
        </li>
        <li>
          <strong>Les envois (POST, PATCH, DELETE)</strong> : protégés par <code>csrfMiddleware</code>, en plus de la
          règle.
        </li>
        <li>
          <strong>Les mots de passe</strong> : <code>hashPassword</code> et <code>isStrongPassword</code> de{' '}
          <code>@astratra/security</code>. Aucun mot de passe n’est écrit dans le code produit.
        </li>
        <li>
          <strong>Les limites de requêtes et les en-têtes de sécurité</strong> : déjà dans <code>createSaasApp</code>.
        </li>
        <li>
          <strong>Les utilisateurs</strong> : en mémoire pendant le développement, dans PostgreSQL avec{' '}
          <code>@astratra/store-postgres</code> pour de vrai.
        </li>
      </ul>
      <p>
        Une seule chose n’est pas dans les packs : le stockage des <em>données de ton application</em> (les produits
        d’une boutique). Le projet produit en contient un petit, écrit pour lui : en mémoire pour le développement, une
        table PostgreSQL par donnée avec <code>DATABASE_URL</code>.
      </p>

      <h2>Compiler le serveur</h2>
      <p>
        Comme pour le web, tu construis d’abord le compilateur (voir{' '}
        <Link to="/documentation/creer-ton-site-web">Créer ton site web</Link>), puis :
      </p>
      <BlocTerminal
        code={'node dist/cli.js compile exemples/boutique-serveur.humalis --cible serveur --sortie ../boutique-serveur'}
      />
      <ul>
        <li>
          <code>--cible serveur</code> : écrit un projet Node. Le fichier doit contenir un bloc{' '}
          <code>serveur "…" :</code>, sinon le compilateur te le dit.
        </li>
        <li>
          <code>--sortie</code> : le dossier du projet. Même règle qu’au web : un dossier vide, ou qui contient le
          fichier <code>{MARQUE_PROJET_SERVEUR}</code>, est accepté ; tout autre dossier est refusé et rien n’est écrit.
        </li>
      </ul>
      <p>
        S’il y a des erreurs dans le programme, rien n’est écrit : le compilateur les affiche avec leur ligne (voir{' '}
        <Link to="/documentation/erreurs">les messages d’erreur</Link>).
      </p>

      <h2>Le projet produit</h2>
      <p>Pour l’exemple « boutique », le compilateur écrit ces {CHEMINS_SERVEUR.length} fichiers :</p>
      <BlocTerminal code={CHEMINS_SERVEUR.join('\n')} etiquette="Liste des fichiers du projet serveur produit" />
      <ul>
        <li>
          <code>src/serveur.ts</code> : <code>createSaasApp</code>, et une route par donnée avec ses gardes.
        </li>
        <li>
          <code>src/donnees.ts</code> : un type TypeScript et un schéma de champs par donnée.
        </li>
        <li>
          <code>src/demarrer.ts</code> : lit l’environnement, crée le premier administrateur, écoute le port.
        </li>
        <li>
          <code>src/humalis/</code> : la vérification des envois et le stockage, identiques d’un projet à l’autre.
        </li>
        <li>
          <code>tests/regles.test.ts</code> : un test par règle d’accès (voir plus bas).
        </li>
        <li>
          <code>.env.exemple</code> et <code>LISEZMOI.md</code> : les variables à remplir et le mode d’emploi.
        </li>
      </ul>

      <h2>Le lancer</h2>
      <Encadre titre="npm 11 est requis" attention>
        <p>
          Il faut Node.js 24 <strong>et son npm 11</strong>. Avec npm 10, <code>npm install</code> peut échouer sur
          l’erreur « edgesOut », un bug de npm : mets npm à jour avant d’installer.
        </p>
      </Encadre>
      <BlocTerminal
        code={'cd ../boutique-serveur\nnpm install\ncp .env.exemple .env      # puis remplis JWT_SECRET et l’administrateur\nnpm test\nnpm run build && npm start'}
      />
      <p>
        Le fichier <code>.env</code> est à toi : il n’est jamais écrit par Humalis, et le projet le met dans{' '}
        <code>.gitignore</code>. Voici le <code>.env.exemple</code> produit :
      </p>
      <BlocTerminal code={ENV_EXEMPLE_SERVEUR.trimEnd()} legende=".env.exemple" etiquette="Variables d’environnement du serveur produit" />
      <ul>
        <li>
          <code>JWT_SECRET</code> trop court ou absent : le serveur refuse de démarrer.
        </li>
        <li>
          Le premier administrateur est créé au premier démarrage depuis <code>HUMALIS_ADMIN_EMAIL</code> et{' '}
          <code>HUMALIS_ADMIN_MOT_DE_PASSE</code>. Un mot de passe trop faible arrête le démarrage, avec un message clair.
        </li>
        <li>
          Sans <code>DATABASE_URL</code>, les données restent <strong>en mémoire</strong> : elles sont perdues à
          l’arrêt. C’est pour développer, pas pour publier.
        </li>
      </ul>

      <h2>Les règles sont testées</h2>
      <p>
        <code>npm test</code> dans le projet produit ne teste pas ton application : il vérifie <strong>chaque règle
        d’accès</strong> que tu as écrite, avec un visiteur, un utilisateur connecté et un administrateur. Par exemple,
        pour <code>seul admin peut modifier produit</code>, un visiteur reçoit 401, un utilisateur non administrateur
        403, et un administrateur 201 :
      </p>
      <BlocTerminal code={TESTS_REGLES_SERVEUR} legende="tests/regles.test.ts (extrait)" etiquette="Tests des règles d’accès produits" />
      <p>
        Les tests vérifient aussi qu’un envoi mal formé est refusé (400) et qu’une action sans règle est refusée à tous
        (403). Si tu changes une règle dans ton fichier <code>.humalis</code> et recompiles, les tests suivent.
      </p>

      <h2>Un extrait du code produit</h2>
      <p>
        Ces extraits ne sont pas recopiés : le site les calcule avec le vrai générateur, à partir de{' '}
        <code>exemples/boutique-serveur.humalis</code>. Les données d’abord :
      </p>
      <BlocTerminal code={DONNEES_SERVEUR.trimEnd()} legende="src/donnees.ts" etiquette="Données du serveur produit" />
      <p>
        Puis la route « avis », abrégée (les corps sont coupés). On y lit les trois sortes de règles :{' '}
        <code>acces.connecte</code> pour « connecte peut creer », <code>acces.seulAdmin</code> pour « seul admin peut
        supprimer », et <code>refuse</code> pour « modifier », qui n’a pas de règle. Les envois passent par{' '}
        <code>csrfMiddleware</code> :
      </p>
      <BlocTerminal code={ROUTE_AVIS_SERVEUR} legende="src/serveur.ts (extrait, abrégé)" etiquette="Route avis du serveur produit" />

      <h2 id="et-les-pages">Le serveur et les pages</h2>
      <p>
        Le serveur et les pages vivent dans le même fichier, et le compilateur les vérifie ensemble : une page lit les
        données du serveur avec <code>envoyer requete vers "produits" dans produits</code>, puis <code>p.nom</code>. Toute
        l’explication est dans <Link to="/documentation/relier-au-serveur">Relier les pages au serveur</Link>.
      </p>
      <p>
        Une page qui appelle une adresse sans que le fichier contienne un serveur reste possible : tu écris l’adresse
        toi-même (voir <Link to="/documentation/requetes">les requêtes</Link>), et rien ne vérifie qu’elle existe.
      </p>
      <Exemple id="serveur-et-page" />
      <p>
        Cette page compile, mais comme elle appelle <code>/api/produits</code> à la main, c’est à toi de lancer le
        serveur et de vérifier l’adresse. Avec le lien, le compilateur le fait pour toi.
      </p>

      <h2>Mots utilisés</h2>
      <MotsDeLaCategorie categorie="serveur" />
    </PageDoc>
  );
}
