/**
 * Les cibles sans temps réel : la cible `mobile` (Expo), les pages statiques et React.
 * Le programme s'y arrête avec une raison claire plutôt que d'y être imité.
 */
import type { Diagnostic } from '../analyse/erreurs.js';
import type { Application } from '../ri/types.js';

export function verifierTempsReelPourLaCible(application: Application, cible: string, moteur: string | undefined): Diagnostic[] {
  const serveur = application.serveurs.find((s) => s.routes.some((r) => r.interne !== undefined));
  if (!serveur) return [];
  const phrase = serveur.discussions?.[0] ? `la discussion « ${serveur.discussions[0].nom} »` : serveur.salles?.[0] ? `la salle « ${serveur.salles[0].nom} »` : 'les appels';
  const ligne = serveur.discussions?.[0]?.ligne ?? serveur.salles?.[0]?.ligne ?? 1;
  if (cible === 'mobile') return [{ gravite: 'erreur', ligne, message: `${phrase} n'existe pas sur la cible mobile (Expo) : compilez avec --cible apple ou --cible android.` }];
  if (cible === 'statique') return [{ gravite: 'erreur', ligne, message: `${phrase} a besoin d'un serveur en direct : une page statique ne peut pas la montrer. Compilez avec --cible web.` }];
  if ((cible === 'web' || cible === 'desktop') && moteur === 'react') return [{ gravite: 'erreur', ligne, message: `${phrase} n'existe qu'avec le moteur Humalis : retirez --moteur react.` }];
  return [];
}
