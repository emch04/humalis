/**
 * « connecte peut supprimer son compte » : ce que deviennent les fiches de la personne, donnée par donnée
 * (« a la suppression du compte : effacer | anonymiser | garder », ou la règle par défaut lue dans la RI).
 */
import type { ServeurRI } from '../../ri/types.js';
import { camel } from '../web/noms.js';

const chaine = (texte: string) => JSON.stringify(texte);

/** Les champs qui retrouvent les fiches de la personne : « auteur_nom » la nomme sans la désigner. */
const cherches = (champs: string[]) => champs.filter((c) => c !== 'auteur_nom');

/** Les deux fonctions de serveur.ts : effacerLesDonnees, dans une seule transaction, et le travail d'une donnée. */
export function codeEffacerLesDonnees(serveur: ServeurRI): string {
  const lignes = serveur.donnees.flatMap((donnee) => {
    const champs = donnee.champsDeLaPersonne ?? [];
    if (!donnee.suppressionCompte || donnee.suppressionCompte === 'garder' || champs.length === 0) return [];
    // Une fiche payée reste pour la comptabilité : elle devient anonyme, jamais effacée.
    const payee = donnee.champs.find((c) => c.regle?.genre === 'depart' && c.regle.paiement === true);
    const effacer = donnee.suppressionCompte === 'effacer';
    return [
      `    // « ${donnee.nom} » : ${effacer ? `effacer${payee ? ', sauf une fiche payée, rendue anonyme' : ''}` : 'anonymiser'}.`,
      `    await fichesDeLaPersonne(s.${camel(donnee.nom)}, id, ${JSON.stringify(cherches(champs).map(camel))}, ${JSON.stringify(champs.map(camel))}, ${effacer}, ${payee ? chaine(camel(payee.nom)) : 'null'});`,
    ];
  });
  if (lignes.length === 0) {
    return `
/** « connecte peut supprimer son compte » : aucune donnée de ce serveur ne retient qui l'a écrite. */
async function effacerLesDonnees(_id: string, _transaction: Transaction<OptionsDuServeur['stockages']>): Promise<void> {}
`;
  }
  return `
/**
 * « connecte peut supprimer son compte » : les fiches de la personne, toutes dans la même transaction. Une panne
 * n'en laisse aucune à moitié traitée ; le compte n'est vidé qu'ensuite (src/humalis/comptes.ts).
 */
async function effacerLesDonnees(id: string, transaction: Transaction<OptionsDuServeur['stockages']>): Promise<void> {
  await transaction(async (s) => {
${lignes.join('\n')}
  });
}

/**
 * Les fiches où ce compte est nommé, par lots de 500, quel que soit leur nombre : effacées, ou rendues anonymes
 * (les champs qui désignent la personne sont vidés). Une fiche traitée ne porte plus ce compte : chaque lot se relit
 * depuis le début, jusqu'à ce qu'il n'en reste aucune.
 */
async function fichesDeLaPersonne(stockage: Stockage, id: string, cherches: string[], vides: string[], effacer: boolean, payee: string | null): Promise<void> {
  const anonyme = Object.fromEntries(vides.map((champ) => [champ, '']));
  for (const champ of cherches) {
    const vues = new Set<string>();
    for (;;) {
      const lot = await stockage.lister({ egal: { [champ]: id }, limite: 500 });
      if (lot.length === 0) break;
      for (const fiche of lot) {
        // Une fiche relue après avoir été traitée : elle n'a pas changé, la transaction est annulée plutôt que de tourner sans fin.
        if (vues.has(fiche.id)) throw new Error('une fiche garde le compte supprimé : rien n’est changé');
        vues.add(fiche.id);
        if (effacer && !(payee !== null && fiche[payee] === true)) await stockage.supprimer(fiche.id);
        else await stockage.modifier(fiche.id, anonyme);
      }
    }
  }
}
`;
}
