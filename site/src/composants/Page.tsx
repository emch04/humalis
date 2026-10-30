import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';

/**
 * La mise en page de tout le site : lien d'évitement, en-tête, contenu, pied.
 * Elle est utilisée comme route parente (les pages arrivent dans `Outlet`).
 */
export function Page() {
  const { pathname, hash } = useLocation();
  const contenu = useRef<HTMLElement>(null);
  const premiere = useRef(true);

  // À chaque changement de page : retour en haut, et le focus passe au contenu
  // (utile au clavier et aux lecteurs d'écran). Avec une ancre, on y va.
  useEffect(() => {
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
      return;
    }
    window.scrollTo(0, 0);
    if (premiere.current) premiere.current = false;
    else contenu.current?.focus({ preventScroll: true });
  }, [pathname, hash]);

  return (
    <>
      <a className="evitement" href="#contenu">
        Aller au contenu
      </a>
      <header className="entete">
        <div className="conteneur entete__interieur">
          <Link to="/" className="marque">
            <span className="marque__pastille" aria-hidden="true">
              H
            </span>
            Humalis
          </Link>
          <nav aria-label="Principale">
            <ul className="menu">
              <li>
                <NavLink to="/" end>
                  Accueil
                </NavLink>
              </li>
              <li>
                <NavLink to="/documentation" end>
                  Documentation
                </NavLink>
              </li>
              <li>
                <NavLink to="/documentation/vocabulaire">Vocabulaire</NavLink>
              </li>
              <li>
                <NavLink to="/documentation/erreurs">Erreurs</NavLink>
              </li>
              <li>
                <NavLink to="/bac-a-sable">Bac à sable</NavLink>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      <main id="contenu" ref={contenu} tabIndex={-1} className="principal">
        <div className="conteneur">
          <Outlet />
        </div>
      </main>
      <footer className="pied">
        <div className="conteneur">
          <p>Humalis : un seul langage, en français, pour créer une application complète.</p>
          <p>
            Le guide complet du langage est dans <code>docs/guide.md</code>, dans le dépôt du projet.
          </p>
        </div>
      </footer>
    </>
  );
}
