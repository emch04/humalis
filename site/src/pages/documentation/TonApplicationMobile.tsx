import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { BlocTerminal } from '../../composants/BlocCode';
import { Encadre } from '../../composants/Encadre';
import { CHEMINS_MOBILE, MARQUE_PROJET_MOBILE, PAGE_MOBILE, VERSION_EXPO } from '../../contenu/projetMobile';

export function TonApplicationMobile() {
  return (
    <PageDoc chemin="/documentation/ton-application-mobile">
      <p>
        Le même programme Humalis devient une application pour <strong>iPhone et Android</strong> : un projet Expo
        (React Native) en TypeScript, que tu peux lancer sur ton téléphone et reprendre à la main. Tu n’écris rien de
        plus : c’est le même langage, traduit autrement.
      </p>

      <Encadre titre="Ce qui est vérifié, et ce qui ne l’est pas encore" attention>
        <p>
          Le projet produit passe la vérification des types, son paquet iOS se construit, et sa version web marche dans
          un navigateur à la taille d’un iPhone (<code>npm run essai:mobile</code>, dans le dépôt). Il n’a pas encore
          été essayé dans le <strong>simulateur iPhone</strong>, qui demande un Mac avec Xcode.
        </p>
      </Encadre>

      <h2>Compiler pour le mobile</h2>
      <BlocTerminal code="node dist/cli.js compile exemples/boutique.humalis --cible mobile --sortie ../boutique-mobile" />
      <p>
        La règle du dossier est la même que pour le web (voir <Link to="/documentation/creer-ton-site-web">Créer ton site
        web</Link>) : un dossier vide, ou qui contient <code>{MARQUE_PROJET_MOBILE}</code>.
      </p>

      <h2>Lancer sur ton téléphone</h2>
      <BlocTerminal code={'cd ../boutique-mobile\nnpm install\nnpx expo start'} />
      <ul>
        <li>
          scanne le code QR avec l’application <strong>Expo Go</strong> sur ton téléphone ;
        </li>
        <li>
          ou appuie sur <code>i</code> pour le simulateur iPhone (sur un Mac avec Xcode), <code>a</code> pour Android ;
        </li>
        <li>
          <code>npm run web</code> ouvre la même application dans ton navigateur.
        </li>
      </ul>

      <h2>Ce que contient le projet</h2>
      <p>
        Un projet Expo {VERSION_EXPO.split('.')[0]} avec expo-router. Pour l’exemple « boutique », {CHEMINS_MOBILE.length}{' '}
        fichiers :
      </p>
      <BlocTerminal code={CHEMINS_MOBILE.join('\n')} etiquette="Liste des fichiers du projet mobile produit" />
      <ul>
        <li>
          <code>app/</code> : une page par fichier, à la même adresse que sur le web. La page d’entrée est{' '}
          <code>app/index.tsx</code>, la page « panier » est <code>app/panier.tsx</code>.
        </li>
        <li>
          <code>app/_layout.tsx</code> : la navigation entre les pages, les messages et les variables partagées.
        </li>
        <li>
          <code>humalis/styles.ts</code> : les styles nommés, en thème clair et en thème sombre.
        </li>
      </ul>

      <h2>Chaque élément, sur le téléphone</h2>
      <ul>
        <li>
          <code>titre</code> et <code>texte</code> deviennent des <code>Text</code> ;
        </li>
        <li>
          <code>bouton</code> devient un <code>Pressable</code> : on le touche au lieu de cliquer ;
        </li>
        <li>
          <code>champ</code> devient un <code>TextInput</code> ; le mot de passe est masqué ;
        </li>
        <li>
          <code>image</code> devient une <code>Image</code>, <code>lien</code> un lien d’expo-router ;
        </li>
        <li>
          <code>avec fond vert</code>, <code>taille grande</code> et les autres styles nommés sont traduits.
        </li>
      </ul>

      <h2>Un extrait du code produit</h2>
      <p>Voici la page « boutique », calculée par le vrai générateur :</p>
      <BlocTerminal code={PAGE_MOBILE.trimEnd()} legende="app/index.tsx" etiquette="Code React Native produit pour la page boutique" />
      <p>
        La logique est exactement celle du web (les mêmes états, les mêmes fonctions) : seuls les éléments changent.
      </p>

      <h2>Ce qui change sur un téléphone</h2>
      <Encadre titre="Le CSS ne s’applique pas">
        <p>
          Un téléphone n’a pas de feuilles de style. Le bloc <code>style :</code>, <code>utiliser style "…"</code> et{' '}
          <code>avec style "…"</code> sont ignorés sur le mobile, et le compilateur te prévient. Les styles nommés, eux,
          sont traduits.
        </p>
      </Encadre>
      <ul>
        <li>
          <strong>Le survol</strong> (<code>quand l’utilisateur survole …</code>) n’existe pas : il n’y a pas de souris.
          Il est ignoré, avec un avertissement.
        </li>
        <li>
          <strong>Ce qui est mémorisé</strong> (<code>avec memorisee</code>) reste sur le téléphone, même après l’avoir
          fermé. <code>avec memorisee en secret</code> est permis ici : la valeur va dans le coffre du téléphone
          (Keychain sur iPhone, Keystore sur Android).
        </li>
        <li>
          <strong>Le serveur</strong> : un téléphone ne connaît pas le <code>localhost</code> de ton ordinateur. Donne
          l’adresse du serveur avec <code>EXPO_PUBLIC_HUMALIS_SERVEUR</code> (par exemple{' '}
          <code>http://192.168.1.20:3000</code>).
        </li>
        <li>
          <strong>La connexion</strong> passe par les packs Astratra : le jeton qu’ils donnent est rangé dans le coffre
          du téléphone. Un envoi au serveur <strong>sans être connecté</strong> est refusé par la protection des packs ;
          le compilateur te prévient.
        </li>
      </ul>
    </PageDoc>
  );
}
