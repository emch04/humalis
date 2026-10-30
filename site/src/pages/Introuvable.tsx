import { Link } from 'react-router';
import { useTitre } from '../composants/useTitre';

export function Introuvable() {
  useTitre('Page introuvable');
  return (
    <div className="article">
      <h1>Page introuvable</h1>
      <p>Cette adresse ne mène à aucune page du site.</p>
      <p>
        <Link to="/">Retour à l’accueil</Link> ou <Link to="/documentation">la documentation</Link>.
      </p>
    </div>
  );
}
