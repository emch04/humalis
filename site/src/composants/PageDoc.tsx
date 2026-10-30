import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { SOMMAIRE, voisines } from '../contenu/sommaire';
import { NavigationDoc } from './NavigationDoc';
import { useTitre } from './useTitre';

/** Une page de la documentation : navigation, titre (le seul h1), contenu, pages voisines. */
export function PageDoc({ chemin, children }: { chemin: string; children: ReactNode }) {
  const entree = SOMMAIRE.find((e) => e.chemin === chemin);
  if (!entree) throw new Error(`Page absente du sommaire : « ${chemin} »`);
  useTitre(entree.titre);
  const { precedente, suivante } = voisines(chemin);

  return (
    <div className="doc">
      <NavigationDoc />
      <article className="article">
        <h1>{entree.titre}</h1>
        {children}
        <nav className="voisines" aria-label="Pages voisines">
          {precedente ? <Link to={precedente.chemin}>← {precedente.titre}</Link> : <span />}
          {suivante ? <Link to={suivante.chemin}>{suivante.titre} →</Link> : <span />}
        </nav>
      </article>
    </div>
  );
}
