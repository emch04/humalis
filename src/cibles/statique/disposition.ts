/**
 * L'en-tête et le pied de page communs, sur le site statique (plan
 * 2026-10-30-mise-en-page-et-elements, chapitre 4.6).
 *
 * Chaque page est un document : l'en-tête et le pied sont recopiés dans
 * chacune, avec leurs variables, leurs événements et leurs éléments (ils
 * sont ajoutés à l'écran de la page avant d'écrire son HTML et son script).
 * L'état d'un en-tête repart donc de zéro à chaque page, ce que la
 * documentation dit.
 */
import type { Application, Ecran, NoeudVue, DispositionRI } from '../../ri/types.js';

/** Les identifiants de tous les éléments d'une vue. */
function identifiants(vue: NoeudVue[]): string[] {
  return vue.flatMap((n) =>
    n.type === 'element'
      ? [n.id]
      : n.type === 'formulaire'
        ? [n.id, ...identifiants(n.corps)]
        : n.type === 'bloc' || n.type === 'repetition'
          ? identifiants(n.corps)
          : n.type === 'condition'
            ? [...identifiants(n.alors), ...identifiants(n.sinon)]
            : [],
  );
}

/** L'écran de la page avec l'en-tête et le pied communs, sauf si la page s'en passe. */
export function avecDisposition(ecran: Ecran, disposition: Application['disposition']): Ecran {
  const entete = disposition?.entete && !ecran.sansEntete ? disposition.entete : undefined;
  const pied = disposition?.pied && !ecran.sansPied ? disposition.pied : undefined;
  if (!entete && !pied) return ecran;

  const bloc = (genre: 'entete' | 'pied', d: DispositionRI): NoeudVue => ({
    type: 'bloc',
    genre,
    options: d.options,
    classes: d.classes,
    corps: d.ecran.vue,
    ligne: d.ecran.ligne,
  });
  const ajoutes = [entete, pied].filter((d): d is DispositionRI => d !== undefined);

  // Une même variable ou un même élément dans la page et dans l'en-tête se confondraient dans le script de la page.
  const noms = new Set(ecran.etat.map((e) => e.nom).concat(ecran.calculs.map((c) => c.nom)));
  const ids = new Set(identifiants(ecran.vue));
  for (const d of ajoutes) {
    for (const nom of [...d.ecran.etat.map((e) => e.nom), ...d.ecran.calculs.map((c) => c.nom)]) {
      if (noms.has(nom)) {
        throw new Error(
          `le nom « ${nom} » est utilisé dans la page « ${ecran.nom} » et dans l'en-tête ou le pied commun : sur un site statique, chaque page recopie l'en-tête, donc leurs noms ne peuvent pas se confondre. Renommez l'une des deux variables.`,
        );
      }
      noms.add(nom);
    }
    // Deux liens de même libellé (le menu et le fil d'Ariane) ne gênent personne ; deux éléments visés par un événement, si.
    const vises = new Set([...ecran.gestionnaires, ...d.ecran.gestionnaires].flatMap((g) => g.cibles));
    for (const id of identifiants(d.ecran.vue)) {
      if (ids.has(id) && vises.has(id)) {
        throw new Error(
          `l'élément « ${id} » existe dans la page « ${ecran.nom} » et dans l'en-tête ou le pied commun : donnez-lui un autre libellé ou un autre nom (avec nom "…") dans l'un des deux.`,
        );
      }
      ids.add(id);
    }
  }

  return {
    ...ecran,
    etat: [...ecran.etat, ...ajoutes.flatMap((d) => d.ecran.etat)],
    calculs: [...ecran.calculs, ...ajoutes.flatMap((d) => d.ecran.calculs)],
    gestionnaires: [...ecran.gestionnaires, ...ajoutes.flatMap((d) => d.ecran.gestionnaires)],
    // Le contenu de la page garde sa largeur (humalis-page) ; l'en-tête et le pied couvrent toute celle du site.
    vue: [
      ...(entete ? [bloc('entete', entete)] : []),
      { type: 'bloc', genre: 'contenu', options: [], classes: ['humalis-page'], corps: ecran.vue, ligne: ecran.ligne },
      ...(pied ? [bloc('pied', pied)] : []),
    ],
  };
}
