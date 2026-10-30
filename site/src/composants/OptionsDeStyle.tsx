import { OPTIONS } from '../../../src/analyse/styles';

/** Les options de style et leurs valeurs, lues dans le compilateur (rien n'est recopié). */
export function OptionsDeStyle() {
  return (
    <ul>
      {Object.entries(OPTIONS).map(([nom, option]) => (
        <li key={nom}>
          <code>{nom}</code> : {option.valeurs.map((v, i) => (
            <span key={v}>
              {i > 0 && ', '}
              <code>{v}</code>
            </span>
          ))}
        </li>
      ))}
      <li>
        <code>nom</code> : un nom entre guillemets, pour viser l’élément (voir plus bas).
      </li>
    </ul>
  );
}
