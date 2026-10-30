import { Link } from 'react-router';
import { NavigationDoc } from '../../composants/NavigationDoc';
import { useTitre } from '../../composants/useTitre';
import { GROUPES, SOMMAIRE } from '../../contenu/sommaire';

/** La page d'entrée de la documentation : la liste des pages, groupe par groupe. */
export function Sommaire() {
  useTitre('Documentation');
  return (
    <div className="doc">
      <NavigationDoc />
      <article className="article">
        <h1>Documentation</h1>
        <p>
          Cette documentation décrit ce que Humalis sait faire aujourd’hui : le langage, ses cinq cibles (site web,
          application mobile, application de bureau, site statique et serveur) et chaque message du compilateur. Elle
          grandit avec chaque étape de la feuille de route.
        </p>
        <p>Tu peux aussi <Link to="/bac-a-sable">essayer Humalis dans le bac à sable</Link> sans installer quoi que ce soit.</p>
        {GROUPES.map((groupe) => (
          <section key={groupe}>
            <h2>{groupe}</h2>
            <ul>
              {SOMMAIRE.filter((e) => e.groupe === groupe).map((e) => (
                <li key={e.chemin}>
                  <Link to={e.chemin}>{e.titre}</Link> : {e.resume}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </article>
    </div>
  );
}
