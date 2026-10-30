import { Link } from 'react-router';
import { TABLE } from '../vocabulaire/adaptateur';

/** Les mots d'une catégorie de la table, avec un lien vers leur fiche. Rien n'est recopié. */
export function MotsDeLaCategorie({ categorie }: { categorie: string }) {
  const mots = TABLE.filter((e) => e.categorie === categorie);
  return (
    <ul className="mots" aria-label="Mots de cette catégorie">
      {mots.map((e) => (
        <li key={e.id}>
          <Link to={`/documentation/vocabulaire#${e.id}`}>{e.mot}</Link>
        </li>
      ))}
    </ul>
  );
}
