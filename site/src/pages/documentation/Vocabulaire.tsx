import { useMemo, useState } from 'react';
import { PageDoc } from '../../composants/PageDoc';
import { FicheMot } from '../../composants/FicheMot';
import { CATEGORIES, TABLE } from '../../vocabulaire/adaptateur';
import { filtrer, regrouperParCategorie } from '../../vocabulaire/regrouper';

export function Vocabulaire() {
  const [texte, setTexte] = useState('');
  const [categorie, setCategorie] = useState<string | undefined>(undefined);

  const visibles = useMemo(() => filtrer(TABLE, texte, categorie), [texte, categorie]);
  const groupes = useMemo(() => regrouperParCategorie(visibles), [visibles]);
  const categories = useMemo(() => [...regrouperParCategorie(TABLE).keys()], []);

  return (
    <PageDoc chemin="/documentation/vocabulaire">
      <p>
        Tous les mots du langage, ceux que le compilateur connaît déjà et ceux qui sont prévus. Cette page est
        générée depuis la table de vocabulaire du compilateur : quand un mot est ajouté à la table, sa fiche
        apparaît ici.
      </p>
      <p>
        Un mot <strong>réservé</strong> ne peut jamais nommer une variable. Un mot <strong>contextuel</strong> n’a
        un sens spécial qu’à sa place : <code>titre</code> est un élément en début de ligne, mais peut nommer une
        variable ailleurs. Un mot <strong>ignoré</strong> sert seulement à rendre la phrase lisible.
      </p>

      <div className="recherche">
        <label htmlFor="recherche-mot">Chercher un mot</label>
        <input
          id="recherche-mot"
          type="search"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="par exemple : inférieure"
          autoComplete="off"
        />
      </div>

      <div className="filtres" role="group" aria-label="Filtrer par catégorie">
        <button type="button" aria-pressed={categorie === undefined} onClick={() => setCategorie(undefined)}>
          Toutes
        </button>
        {categories.map((c) => (
          <button key={c} type="button" aria-pressed={categorie === c} onClick={() => setCategorie(c)}>
            {CATEGORIES[c] ?? c}
          </button>
        ))}
      </div>

      <p aria-live="polite" data-total={TABLE.length} data-visibles={visibles.length}>
        {visibles.length} mot{visibles.length > 1 ? 's' : ''} sur {TABLE.length}.
      </p>

      {visibles.length === 0 && <p>Aucun mot ne correspond à cette recherche.</p>}

      {[...groupes.entries()].map(([cat, entrees]) => (
        <section key={cat} aria-labelledby={`categorie-${cat}`}>
          <h2 id={`categorie-${cat}`}>{CATEGORIES[cat] ?? cat}</h2>
          {entrees.map((entree) => (
            <FicheMot key={entree.id} entree={entree} />
          ))}
        </section>
      ))}
    </PageDoc>
  );
}
