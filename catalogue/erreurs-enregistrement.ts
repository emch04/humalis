/** Messages liés aux nouvelles actions de capture et de recadrage. */
import type { EntreeErreur } from './erreurs';

export const ENTREES_ERREURS_ENREGISTREMENT: readonly EntreeErreur[] = [{
  id: 'media-variable-incompatible',
  groupe: 'sens',
  titre: 'Une capture doit remplir une variable de fichier',
  explication: 'Un enregistrement ou un document scanné produit un fichier.',
  correction: 'Déclare la variable avec rien avant l’action.',
  fautif: 'page "p" :\n    titre "P"\n    variable note = 1\n    bouton "Enregistrer"\n    quand l\'utilisateur clique sur "Enregistrer" :\n        enregistrer audio dans note',
  corrige: 'page "p" :\n    titre "P"\n    variable note = rien\n    bouton "Enregistrer"\n    quand l\'utilisateur clique sur "Enregistrer" :\n        enregistrer audio dans note',
  motif: 'elle reçoit un fichier',
  gravite: 'erreur',
  sites: 1,
  atteignable: true,
}];
