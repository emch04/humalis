import { useState } from 'react';
import { NavLink } from 'react-router';
import { GROUPES, SOMMAIRE } from '../contenu/sommaire';

/** La navigation de la documentation : une liste à gauche, repliable sur mobile. */
export function NavigationDoc() {
  const [ouvert, setOuvert] = useState(false);

  return (
    <nav className="nav-doc" aria-label="Documentation">
      <button
        type="button"
        className="nav-doc__bouton"
        aria-expanded={ouvert}
        aria-controls="liste-doc"
        onClick={() => setOuvert(!ouvert)}
      >
        {ouvert ? 'Cacher le sommaire' : 'Afficher le sommaire de la documentation'}
      </button>
      <div id="liste-doc" className={`nav-doc__liste${ouvert ? ' nav-doc__liste--ouverte' : ''}`}>
        {GROUPES.map((groupe) => (
          <section key={groupe}>
            <p className="nav-doc__groupe">{groupe}</p>
            <ul>
              {SOMMAIRE.filter((e) => e.groupe === groupe).map((e) => (
                <li key={e.chemin}>
                  <NavLink to={e.chemin} onClick={() => setOuvert(false)}>
                    {e.titre}
                  </NavLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}
