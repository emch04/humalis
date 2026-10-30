import type { EntreeVocabulaire } from '../vocabulaire/adaptateur';
import { BlocCode } from './BlocCode';

const NOMS_CIBLES: Record<string, string> = {
  web: 'Web (React)',
  mobile: 'Mobile (Expo)',
  desktop: 'Desktop (Electron)',
  serveur: 'Serveur (Node)',
  statique: 'Statique (HTML)',
};

/** Une fiche : tout ce que la table dit d'un mot. `data-mot` sert aux tests et au navigateur. */
export function FicheMot({ entree }: { entree: EntreeVocabulaire }) {
  const traductions = Object.entries(entree.traductions);
  const statut = entree.categorie === 'liaison' ? 'ignoré' : entree.reserve ? 'réservé' : 'contextuel';

  return (
    <article className="fiche" id={entree.id} data-mot={entree.mot}>
      <h3>
        <code>{entree.mot}</code>
        <span className="fiche__etiquettes">
          <span className={`etiquette ${entree.disponible ? 'etiquette--fait' : 'etiquette--prevu'}`}>
            {entree.disponible ? 'disponible' : 'prévu'}
          </span>
          <span className="etiquette">{statut}</span>
        </span>
      </h3>
      <p>{entree.concept}</p>
      {entree.note && <p><strong>À savoir :</strong> {entree.note}</p>}
      <dl>
        {entree.variantes.length > 0 && (
          <>
            <dt>Autres façons de l’écrire</dt>
            <dd>
              {entree.variantes.map((v) => (
                <code key={v}>{v}</code>
              ))}
            </dd>
          </>
        )}
        {traductions.length > 0 && (
          <>
            <dt>Traductions par cible (les cibles web et serveur existent aujourd’hui ; les autres sont prévues)</dt>
            <dd>
              <ul>
                {traductions.map(([cible, valeur]) => (
                  <li key={cible}>
                    {NOMS_CIBLES[cible] ?? cible} : <code>{valeur}</code>
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>
      {entree.exemple && <BlocCode code={entree.exemple} legende="Exemple" />}
    </article>
  );
}
