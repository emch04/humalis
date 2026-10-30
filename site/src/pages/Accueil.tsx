import { Link } from 'react-router';
import { EtatDuProjet } from '../composants/EtatDuProjet';
import { Exemple } from '../composants/Exemple';
import { useTitre } from '../composants/useTitre';

export function Accueil() {
  useTitre();
  return (
    <>
      <section className="heros">
        <h1>Un seul langage, en français, pour créer une application complète.</h1>
        <p className="accroche">
          Humalis se lit comme une phrase. Tu écris ce que tu veux voir à l’écran, et il te dit en français,
          avec le numéro de ligne, quand quelque chose ne va pas.
        </p>
        <div className="heros__actions">
          <Link className="bouton" to="/documentation/prise-en-main">
            Commencer la documentation
          </Link>
          <Link className="bouton bouton--discret" to="/documentation/vocabulaire">
            Voir le vocabulaire
          </Link>
        </div>
      </section>

      <section aria-labelledby="titre-exemple">
        <h2 id="titre-exemple">Un programme, lu à voix haute</h2>
        <div className="vitrine-exemple">
          <Exemple id="accueil-vitrine" legende="exemples/boutique.humalis" />
          <div>
            <p>
              Lis ce programme comme une phrase : une page « boutique », une liste de produits, un panier vide, un
              titre bleu, et pour chaque produit un bouton vert « Ajouter » qui met le produit dans le panier.
              S’il n’y a plus de stock, un message le dit. Un second bouton mène à la page « panier ».
            </p>
            <p>
              Les petits mots (<code>le</code>, <code>la</code>, <code>l’</code>…) sont ignorés, et les mots-clés
              s’écrivent avec ou sans accent. Les blocs se repèrent à l’indentation, comme en Python.
            </p>
            <p>
              Le compilateur lit cette page, la comprend et la vérifie : il n’y trouve aucune erreur. Il en fait
              aussi un site web React prérendu, que tu peux lancer dans ton navigateur.{' '}
              <Link to="/documentation/creer-ton-site-web">Voir comment créer ton site web.</Link>
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="titre-principes">
        <h2 id="titre-principes">Ce qui compte pour Humalis</h2>
        <ul className="grille">
          <li className="carte">
            <h3>Du français qui se lit</h3>
            <p>Un vocabulaire neutre (<code>bouton</code>, <code>page</code>, <code>texte</code>) que chaque cible traduit à sa façon : React pour le web aujourd’hui, les autres plus tard.</p>
          </li>
          <li className="carte">
            <h3>Des erreurs qui parlent</h3>
            <p>
              Chaque message est en français et dit la ligne. <Link to="/documentation/erreurs">Tous les messages sont expliqués.</Link>
            </p>
          </li>
          <li className="carte">
            <h3>Un résultat lisible</h3>
            <p>Le site produit est un projet Vite + React en TypeScript propre, que tu peux reprendre à la main.</p>
          </li>
          <li className="carte">
            <h3>Jamais enfermé</h3>
            <p>Humalis parle avec React dans les deux sens : tes pages Humalis entrent dans un projet React, et tes composants React entrent dans Humalis.</p>
          </li>
        </ul>
      </section>

      <section aria-labelledby="titre-etat">
        <h2 id="titre-etat">Où en est le projet, honnêtement</h2>
        <p>
          Aujourd’hui, Humalis <strong>lit, comprend et vérifie</strong> un programme, puis{' '}
          <strong>produit un site web React prérendu</strong> (commande <code>humalis compile</code>), et il parle avec React dans les deux sens. Il produit aussi un <strong>serveur Node</strong> (données, routes et règles d’accès, avec les packs Astratra), et vérifie les pages et le serveur du même fichier ensemble : une page lit les données de son serveur, et s’y connecte. Il produit enfin une <strong>application mobile</strong> Expo
          (iPhone et Android), vérifiée par sa version web et son paquet iOS, pas encore dans le simulateur iPhone, une{' '}
          <strong>application de bureau</strong> Electron, lancée sous Linux mais pas encore essayée sur un Mac, et un{' '}
          <strong>site statique</strong> en HTML, CSS et JavaScript. Ce qui n’est pas encore vérifié sur un vrai appareil est
          dit pour chaque cible ci-dessous. Humalis n’est pas encore publié : tu le construis depuis le dépôt.
        </p>
        <EtatDuProjet />
      </section>
    </>
  );
}
