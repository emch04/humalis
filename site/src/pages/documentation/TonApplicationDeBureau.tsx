import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { BlocTerminal } from '../../composants/BlocCode';
import { Encadre } from '../../composants/Encadre';
import { CHEMINS_DESKTOP, VERSION_ELECTRON } from '../../contenu/projetBureauStatique';

export function TonApplicationDeBureau() {
  return (
    <PageDoc chemin="/documentation/ton-application-de-bureau">
      <p>
        Le même programme Humalis devient une <strong>application de bureau</strong> pour Mac, Windows et Linux, avec
        Electron. Les pages sont exactement celles du <Link to="/documentation/creer-ton-site-web">site web</Link>,
        ouvertes dans une fenêtre, avec un menu en français.
      </p>

      <Encadre titre="Ce qui est vérifié, et ce qui ne l’est pas encore" attention>
        <p>
          L’application a été lancée et pilotée pour de bon sous Linux (<code>npm run essai:desktop</code>, dans le
          dépôt) : la boutique, la connexion avec son serveur, la sécurité. Elle n’a pas encore été essayée en{' '}
          <strong>application Mac</strong>.
        </p>
      </Encadre>

      <h2>Compiler et lancer</h2>
      <BlocTerminal code="node dist/cli.js compile exemples/boutique.humalis --cible desktop --sortie ../boutique-desktop" />
      <BlocTerminal code={'cd ../boutique-desktop\nnpm install\nnpm start'} />
      <p>
        Pour construire l’application à installer (un <code>.app</code> sur Mac, un installateur sur Windows) :{' '}
        <code>npm run paquet</code>. Elle arrive dans le dossier <code>paquets/</code>.
      </p>

      <h2>Ce que contient le projet</h2>
      <p>
        Le projet web complet, plus ce qui fait l’application (Electron {VERSION_ELECTRON.split('.')[0]}) :
      </p>
      <BlocTerminal code={CHEMINS_DESKTOP.join('\n')} etiquette="Fichiers propres à l’application de bureau" />
      <p>
        <code>electron/principal.ts</code> ouvre la fenêtre, le menu, et sert les pages par une adresse propre à
        l’application (<code>humalis://application</code>), jamais depuis le disque.
      </p>

      <h2>La sécurité, réglée d’office</h2>
      <ul>
        <li>la page n’a aucun accès à l’ordinateur (bac à sable, isolation, pas de Node dans la page) ;</li>
        <li>elle ne peut ni ouvrir une autre fenêtre, ni aller sur un autre site, ni demander la caméra ou le micro ;</li>
        <li>
          les requêtes vers ton serveur passent par l’application : le cookie de session des packs Astratra reste
          hors de la page ;
        </li>
        <li>
          <code>avec memorisee en secret</code> est permis : la valeur est chiffrée par le trousseau de l’ordinateur.
        </li>
      </ul>
      <p>
        L’adresse du serveur se donne à la compilation (<code>--serveur https://…</code>) ou au lancement, avec{' '}
        <code>HUMALIS_SERVEUR</code>. Une adresse <code>http://</code> (sauf sur ton ordinateur) est refusée par
        Electron : utilise <code>https://</code>.
      </p>
    </PageDoc>
  );
}
