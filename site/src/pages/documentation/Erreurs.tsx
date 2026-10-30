import { PageDoc } from '../../composants/PageDoc';
import { BlocCode } from '../../composants/BlocCode';
import { MessageErreur } from '../../composants/MessageErreur';
import { ENTREES_ERREURS, GROUPES_ERREURS, type GroupeErreur } from '../../contenu/erreurs';

export function Erreurs() {
  const groupes = Object.keys(GROUPES_ERREURS) as GroupeErreur[];
  return (
    <PageDoc chemin="/documentation/erreurs">
      <p>
        Quand quelque chose ne va pas, Humalis te le dit en français, avec le numéro de ligne. Cette page
        explique chaque message.
      </p>
      <p>
        Les messages ci-dessous ne sont pas écrits à la main : à chaque affichage, le site donne le programme fautif
        au compilateur et montre ce qu’il répond vraiment. Un message qui change dans le compilateur change ici aussi.
      </p>
      <p>
        L’analyse signale toutes ses erreurs en une fois, triées par ligne. Les erreurs d’écriture et de grammaire
        arrivent une par une : corrige la première, puis relance.
      </p>

      {groupes.map((groupe) => (
        <section key={groupe} aria-labelledby={`groupe-${groupe}`}>
          <h2 id={`groupe-${groupe}`}>{GROUPES_ERREURS[groupe].titre}</h2>
          <p>{GROUPES_ERREURS[groupe].intro}</p>
          {ENTREES_ERREURS.filter((x) => x.groupe === groupe).map((entree) => (
            <div key={entree.id} className="erreur-fiche" id={entree.id}>
              <h3>{entree.titre}</h3>
              <p>{entree.explication}</p>
              <div className="deux-colonnes">
                <div>
                  <BlocCode code={entree.fautif} legende="Le programme fautif" variante={entree.gravite} />
                  {entree.atteignable ? (
                    <MessageErreur source={entree.fautif} gravite={entree.gravite} />
                  ) : (
                    <p>Aucun programme ne peut produire ce message : il existe par sécurité.</p>
                  )}
                </div>
                <div>
                  <BlocCode code={entree.corrige} legende="Une version corrigée" />
                </div>
              </div>
              <p>
                <strong>Comment corriger.</strong> {entree.correction}
              </p>
            </div>
          ))}
        </section>
      ))}
    </PageDoc>
  );
}
