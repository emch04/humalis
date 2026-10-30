import { CIBLES, ETAT } from '../contenu/etat';

export function EtatDuProjet() {
  return (
    <>
      <ul className="etat">
        {ETAT.map((ligne) => (
          <li key={ligne.nom}>
            <span className="etat__nom">{ligne.nom}</span>
            <span className={`etiquette ${ligne.fait ? 'etiquette--fait' : 'etiquette--prevu'}`}>
              {ligne.fait ? 'fait' : 'à faire'}
            </span>
            <span className="etat__detail">{ligne.detail}</span>
          </li>
        ))}
      </ul>
      <h3>Ce qui est sur la feuille de route</h3>
      <ul className="grille grille--quatre">
        {CIBLES.map((c) => (
          <li key={c.cible} className="carte">
            <h3>{c.cible}</h3>
            <p>
              {c.disponible ? (
                <span className="etiquette etiquette--fait">disponible</span>
              ) : (
                <span className="etiquette etiquette--prevu">pas encore disponible</span>
              )}
            </p>
            <p>{c.description}</p>
            <p>
              <strong>Étape {c.etape}.</strong> {c.terminee ? 'Terminée : ' : 'Terminée quand '}
              {c.termineeQuand}
              {!c.terminee && c.disponible && ' (pas encore vérifié)'}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
