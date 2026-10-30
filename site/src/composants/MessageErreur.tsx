import { useMemo } from 'react';
import { diagnostiquer, formater } from '../contenu/verification';

/**
 * Exécute le compilateur sur le programme et affiche le message RÉEL qu'il
 * produit : rien n'est écrit à la main.
 */
export function MessageErreur({ source, gravite }: { source: string; gravite?: 'erreur' | 'avertissement' }) {
  const diagnostics = useMemo(
    () => diagnostiquer(source).filter((d) => !gravite || d.gravite === gravite),
    [source, gravite],
  );

  if (diagnostics.length === 0) {
    return (
      <div role="note" className="message message--succes">
        <span className="message__genre">Aucune erreur</span>
        Le compilateur accepte ce programme.
      </div>
    );
  }

  return (
    <>
      {diagnostics.map((d, i) => (
        <div key={i} role="note" className={`message message--${d.gravite}`}>
          <span className="message__genre">
            {d.gravite === 'erreur' ? 'Erreur affichée par Humalis' : 'Avertissement affiché par Humalis'}
          </span>
          {formater(d)}
        </div>
      ))}
    </>
  );
}
