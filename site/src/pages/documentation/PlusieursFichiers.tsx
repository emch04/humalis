import { useMemo } from 'react';
import { Link } from 'react-router';
import { PageDoc } from '../../composants/PageDoc';
import { BlocCode, BlocTerminal } from '../../composants/BlocCode';
import { Encadre } from '../../composants/Encadre';
import { PROJETS } from '../../contenu/projets';
import { diagnostiquerProjet, formater } from '../../contenu/verification';

/**
 * Un projet de `contenu/projets.ts`, fichier par fichier, avec le message
 * RÉEL du compilateur (`compilerProjet`) : rien n'est écrit à la main.
 */
function Projet({ id }: { id: string }) {
  const projet = PROJETS.find((p) => p.id === id);
  if (!projet) throw new Error(`Projet introuvable : « ${id} »`);
  const erreurs = useMemo(() => diagnostiquerProjet(projet).filter((d) => d.gravite === 'erreur'), [projet]);
  const refuse = projet.attendu !== undefined;

  return (
    <div data-exemple={id}>
      {projet.fichiers.map((f, i) => (
        <BlocCode
          key={f.nom}
          code={f.code}
          legende={i === 0 ? `Fichier principal : ${f.nom}` : `Fichier ${f.nom}`}
          variante={refuse ? 'erreur' : undefined}
        />
      ))}
      {erreurs.length === 0 ? (
        <div role="note" className="message message--succes">
          <span className="message__genre">Aucune erreur</span>
          Le compilateur accepte ce projet.
        </div>
      ) : (
        erreurs.map((d, i) => (
          <div key={i} role="note" className="message message--erreur">
            <span className="message__genre">Erreur affichée par Humalis</span>
            {d.fichier ? `${d.fichier}, ligne ${d.ligne} : ${d.message}` : formater(d)}
          </div>
        ))
      )}
    </div>
  );
}

export function PlusieursFichiers() {
  return (
    <PageDoc chemin="/documentation/plusieurs-fichiers">
      <p>
        Quand une application grandit, un seul fichier devient long à lire. Chaque partie peut alors avoir son
        fichier : la boutique dans l’un, le panier dans l’autre, le serveur dans un troisième.
      </p>

      <h2>Utiliser un autre fichier</h2>
      <p>
        En haut du fichier principal, <code>utiliser fichier "./panier.humalis"</code> ajoute au projet tout ce que
        l’autre fichier déclare : ses pages, ses composants, ses{' '}
        <Link to="/documentation/partager-entre-les-pages">variables partagées</Link> et son serveur. Ici, la page
        « boutique » ajoute un livre au panier déclaré dans <code>panier.humalis</code>, et le lien mène à la page
        « panier » de l’autre fichier.
      </p>
      <Projet id="boutique-et-panier" />
      <p>
        Le chemin part du fichier qui l’écrit : <code>"./panier.humalis"</code> est à côté de{' '}
        <code>boutique.humalis</code>, <code>"./pages/panier.humalis"</code> serait dans un dossier{' '}
        <code>pages</code>. Compile le fichier principal, comme d’habitude :
      </p>
      <BlocTerminal code={'node dist/cli.js compile boutique.humalis --cible web --sortie ../boutique-web'} />
      <p>Toutes les cibles lisent le projet entier : web, mobile, bureau, site statique et serveur.</p>

      <h2>Les règles</h2>
      <ul>
        <li>Chaque fichier n’est lu qu’une fois, même si deux fichiers l’utilisent.</li>
        <li>Une page ou un composant ne se déclare que dans un seul fichier.</li>
        <li>Une application n’a qu’un seul serveur, dans le fichier de ton choix.</li>
        <li>Deux fichiers ne peuvent pas s’utiliser l’un l’autre, en boucle.</li>
      </ul>

      <h2>Les erreurs disent dans quel fichier regarder</h2>
      <p>Une faute dans un fichier utilisé donne son nom et sa ligne :</p>
      <Projet id="erreur-dans-un-fichier-utilise" />
      <p>Deux fichiers qui s’utilisent en boucle sont refusés, avec le chemin de la boucle :</p>
      <Projet id="fichiers-en-boucle" />
      <p>Une page déclarée deux fois est refusée, et le message dit où se trouve la première :</p>
      <Projet id="page-dans-deux-fichiers" />

      <Encadre titre="Dans l’éditeur">
        <p>
          L’extension VS Code suit les <code>utiliser fichier</code> : une erreur dans un fichier utilisé s’affiche à
          sa ligne, et F12 sur une page ou un composant ouvre le fichier où il est déclaré.
        </p>
      </Encadre>
    </PageDoc>
  );
}
