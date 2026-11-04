import type { Application } from '../../ri/types.js';

/** « erreurs pendant 2 secondes » du bloc site : le modèle des messages avec cette durée. Sans la ligne, il ne change pas. */
export function avecDureeDesErreurs(modele: string, application: Application): string {
  const duree = application.site?.dureeErreurs;
  if (duree === undefined) return modele;
  if (!modele.includes('erreur: 8000 }')) throw new Error('modèle des messages inattendu : erreur: 8000');
  return modele.replace('erreur: 8000 }', `erreur: ${duree} }`);
}
