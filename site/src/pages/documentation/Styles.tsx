import { PageDoc } from '../../composants/PageDoc';
import { Exemple } from '../../composants/Exemple';
import { MotsDeLaCategorie } from '../../composants/MotsDeLaCategorie';
import { Encadre } from '../../composants/Encadre';
import { OptionsDeStyle } from '../../composants/OptionsDeStyle';

export function Styles() {
  return (
    <PageDoc chemin="/documentation/styles">
      <p>
        Après <code>avec</code>, tu donnes des options à un élément : un style (couleur, taille…) ou un nom.
      </p>

      <h2>La syntaxe</h2>
      <p>
        Chaque style est une paire : <code>propriété valeur</code>. Enchaîne plusieurs options avec <code>et</code>.
      </p>
      <Exemple id="styles-titre" />
      <Exemple id="styles-bouton" />
      <Exemple id="styles-position" />
      <Exemple id="styles-bordure" />

      <h2>Les options possibles</h2>
      <p>
        Les styles viennent d’un petit jeu de valeurs nommées, le même pour toutes les plateformes : chaque cible les
        traduira à sa façon quand elle existera. Les accords sont acceptés (<code>bleue</code>, <code>centrée</code>…).
        Cette liste est lue dans le compilateur.
      </p>
      <OptionsDeStyle />

      <h2>Ton propre CSS</h2>
      <p>
        Humalis s’occupe des composants ; le CSS fait son travail. Les raccourcis ci-dessus (<code>avec couleur bleu</code>…)
        restent, mais pour une mise en page à ton goût, écris du vrai CSS et donne des classes aux éléments avec{' '}
        <code>avec style "…"</code>. Mets plusieurs classes dans les mêmes guillemets, séparées par une espace. Elles sont
        ajoutées après les styles nommés.
      </p>
      <h3>Un bloc style dans le fichier</h3>
      <p>
        Un bloc <code>style :</code>, placé en haut du fichier (hors d’une page), contient du CSS recopié tel quel, comme
        la balise <code>&lt;style&gt;</code> en HTML. Les <code>{'{'}</code>, les <code>:</code> et les <code>#</code> du CSS
        ne sont pas lus comme du Humalis.
      </p>
      <Exemple id="styles-classe" />
      <h3>Un fichier CSS séparé</h3>
      <p>
        <code>utiliser style "./theme.css"</code>, en haut du fichier, charge un fichier CSS. La commande{' '}
        <code>humalis compile</code> le cherche à côté du fichier <code>.humalis</code> et le copie dans{' '}
        <code>src/styles/</code> du projet. S’il est introuvable, elle le dit et n’écrit rien.
      </p>
      <Exemple id="styles-fichier" />
      <p>
        Ton CSS est chargé <strong>après</strong> celui de Humalis : tu peux donc redéfinir ses styles. Le CSS ne vaut
        que pour le web ; ce qu’on en fera sur mobile sera décidé plus tard.
      </p>
      <Encadre titre="Une classe qui n’existe pas" attention>
        <p>
          Si une classe n’est définie dans aucun bloc <code>style :</code>, Humalis te prévient (sauf si tu utilises un
          fichier CSS séparé, qu’il ne lit pas).
        </p>
      </Encadre>
      <Exemple id="styles-classe-inconnue" />
      <p>Et les guillemets sont obligatoires autour du nom de la classe :</p>
      <Exemple id="styles-classe-sans-guillemets" />

      <h2>Donner un nom à un élément</h2>
      <p>
        <code>avec nom "…"</code> donne un nom à un élément. Un événement ou une action peut ensuite le viser par ce
        nom. Sans nom, on le vise par son libellé ; Humalis cherche d’abord le nom.
      </p>
      <Exemple id="styles-nom" />
      <p>Si deux éléments ont le même libellé, donne un nom à l’un d’eux.</p>

      <h2>Les pièges</h2>
      <p>Chaque style a besoin de sa valeur, et cette valeur doit faire partie de la liste.</p>
      <Exemple id="styles-valeur-manquante" />
      <Exemple id="styles-valeur-inconnue" />

      <h2>Mots utilisés</h2>
      <MotsDeLaCategorie categorie="style" />
    </PageDoc>
  );
}
