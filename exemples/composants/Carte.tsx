// Un composant React écrit à la main, utilisé depuis exemples/vitrine.humalis
// avec « utiliser composant "Carte" depuis "./composants/Carte" ».
interface ProprietesCarte {
  titre: string;
  prix?: number;
}

export default function Carte({ titre, prix }: ProprietesCarte) {
  return (
    <article data-carte style={{ border: '1px solid #8a8a90', borderRadius: '0.75rem', padding: '1rem', margin: '1rem 0' }}>
      <strong>{titre}</strong>
      {prix !== undefined && <p>À partir de {prix} €</p>}
    </article>
  );
}
