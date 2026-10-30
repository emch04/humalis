import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { BlocTerminal } from '../../composants/BlocCode';
import { Encadre } from '../../composants/Encadre';
import { CHEMINS_BOUTIQUE, MARQUE_PROJET, PAGE_BOUTIQUE } from '../../contenu/projetWeb';

export function CreerTonSiteWeb() {
  return (
    <PageDoc chemin="/documentation/creer-ton-site-web">
      <p>
        Humalis transforme un fichier <code>.humalis</code> en un vrai site web : un projet Vite + React en TypeScript,
        prérendu, que tu peux lancer, construire et reprendre à la main.
      </p>

      <Encadre titre="Ce qui existe, et ce qui n’existe pas" attention>
        <p>
          Cette page parle de la cible <strong>web</strong>. Les cibles <Link to="/documentation/le-serveur">serveur</Link>,{' '}
          <Link to="/documentation/ton-application-mobile">mobile</Link>, desktop (Electron) et statique existent aussi. Humalis
          n’est pas non plus publié sur npm : tu le construis depuis le dépôt.
        </p>
      </Encadre>

      <h2>Installer</h2>
      <p>
        Il te faut Node.js 24 ou plus récent, puis le dépôt d’Humalis. Dans son dossier, construis le compilateur :
      </p>
      <BlocTerminal code={'npm install\nnpm run build'} />
      <p>
        La commande <code>npm run build</code> écrit le compilateur dans <code>dist/</code>. C’est <code>dist/cli.js</code>{' '}
        que tu lances ensuite.
      </p>

      <h2>Compiler un programme</h2>
      <BlocTerminal
        code={'node dist/cli.js compile exemples/boutique.humalis --cible web --sortie ../boutique-web --adresse https://mon-site.cd'}
      />
      <ul>
        <li>
          <code>--cible web</code> : la cible de cette page (les autres sont <code>mobile</code> et <code>serveur</code>).
        </li>
        <li>
          <code>--sortie</code> : le dossier où écrire le projet. Il est créé s’il n’existe pas.
        </li>
        <li>
          <code>--adresse</code> : l’adresse publique de ton site. Le prérendu et le plan du site (<code>sitemap</code>)
          s’en servent. Sans elle, Humalis te prévient et utilise <code>http://localhost</code>.
        </li>
      </ul>
      <p>
        Si ton programme a des erreurs, rien n’est écrit : le compilateur les affiche avec leur ligne, comme{' '}
        <code>verifier</code> (voir <Link to="/documentation/erreurs">les messages d’erreur</Link>).
      </p>

      <h2>La règle du dossier</h2>
      <p>
        Humalis réécrit le dossier de sortie à chaque compilation. Pour ne jamais écraser ton travail, il applique une
        règle simple : un dossier <strong>vide</strong>, ou un dossier qui contient le fichier{' '}
        <code>{MARQUE_PROJET}</code>, est accepté. Tout autre dossier est refusé, et rien n’est écrit.
      </p>
      <p>
        Ce fichier <code>{MARQUE_PROJET}</code> est posé par Humalis dans le projet produit. Ne le supprime pas si tu
        veux pouvoir recompiler au même endroit.
      </p>
      <Encadre titre="Reprendre à la main" attention>
        <p>
          Recompiler réécrit tous les fichiers du projet. Si tu modifies le code produit à la main, copie ton projet
          ailleurs avant de recompiler, et retire le fichier <code>{MARQUE_PROJET}</code> de la copie.
        </p>
      </Encadre>

      <p>
        Si ton programme utilise un fichier CSS (<code>utiliser style "./theme.css"</code>), la commande le cherche à côté
        de ton fichier <code>.humalis</code> et le copie dans <code>src/styles/</code>. Voir{' '}
        <Link to="/documentation/styles">les styles</Link>.
      </p>

      <h2>Ce que contient le projet</h2>
      <p>Pour l’exemple « boutique », le compilateur écrit ces {CHEMINS_BOUTIQUE.length} fichiers :</p>
      <BlocTerminal code={CHEMINS_BOUTIQUE.join('\n')} etiquette="Liste des fichiers du projet produit" />
      <ul>
        <li>
          <code>src/pages/</code> : un composant React par page Humalis (<code>Boutique.tsx</code>,{' '}
          <code>Panier.tsx</code>). C’est le code que tu liras et reprendras.
        </li>
        <li>
          <code>src/main.tsx</code> : le routeur. Chaque page a son adresse : la page « accueil » (ou, à défaut, la
          première) est à <code>/</code>, la page « panier » est à <code>/panier</code>.
        </li>
        <li>
          <code>src/humalis/</code> : les petits outils partagés (messages, titre de page, appels au serveur, styles
          par défaut), identiques d’un projet à l’autre.
        </li>
        <li>
          <code>astratra.prerender.config.cjs</code> : la configuration du prérendu, avec une route par page et la
          liste de ton <code>--adresse</code>.
        </li>
        <li>
          <code>LISEZMOI.md</code> : le mode d’emploi du projet, en français.
        </li>
      </ul>

      <h2>Le prérendu</h2>
      <p>
        Pour que chaque page soit lisible sans JavaScript (et bien référencée), le projet se construit avec{' '}
        <code>@astratra/prerender</code> : à la fin du build, il ouvre ton site dans un navigateur et enregistre une page
        HTML par adresse, plus le plan du site. Ce navigateur est Chromium, piloté par Playwright. Installe-le{' '}
        <strong>une seule fois</strong> sur ta machine :
      </p>
      <BlocTerminal code="npx playwright install chromium" />

      <h2>Lancer et construire</h2>
      <BlocTerminal code={'cd ../boutique-web\nnpm install\nnpm run dev'} />
      <p>
        <code>npm run dev</code> lance le site en développement : ouvre l’adresse affichée dans ton navigateur. Pour
        produire le site final, prérendu :
      </p>
      <BlocTerminal code="npm run build" />
      <p>
        Le résultat est dans le dossier <code>dist/</code> du projet : une page HTML par adresse. Si tu veux seulement
        vérifier le code sans lancer le prérendu (donc sans Chromium), utilise <code>npm run build:sans-prerendu</code>.
      </p>

      <h2>Un extrait du code produit</h2>
      <p>
        Voici la page « boutique » de <code>exemples/boutique.humalis</code>, telle que le compilateur l’écrit. Ce texte
        n’est pas recopié : le site le calcule avec le vrai générateur, donc il suit toujours le compilateur.
      </p>
      <BlocTerminal code={PAGE_BOUTIQUE.trimEnd()} legende="src/pages/Boutique.tsx" etiquette="Code React produit pour la page boutique" />
      <p>
        On y retrouve ton programme : chaque <code>variable</code> devient un état React (<code>useState</code>), la
        boucle <code>pour chaque</code> devient un <code>.map()</code>, la condition <code>si … sinon</code> devient un
        choix entre deux éléments, et chaque <code>quand l’utilisateur clique sur</code> devient une fonction branchée
        sur <code>onClick</code>. Les options après <code>avec</code> deviennent des classes, définies dans{' '}
        <code>src/humalis/styles.css</code>.
      </p>

      <h2>La suite</h2>
      <ul>
        <li>
          <Link to="/documentation/pages">Les pages</Link> et <Link to="/documentation/elements">les éléments</Link>{' '}
          te disent ce que tu peux écrire.
        </li>
        <li>
          <Link to="/documentation/vocabulaire">Le vocabulaire</Link> donne, pour chaque mot, sa traduction web.
        </li>
      </ul>
    </PageDoc>
  );
}
