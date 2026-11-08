/**
 * Les fonctions de l'appareil (photo, scanner, Face ID, vibration, signature,
 * hors ligne) n'existent pour l'instant que sur la cible Apple. Ailleurs, le
 * compilateur le dit au lieu de produire un bouton qui ne ferait rien.
 */
import type { Diagnostic } from '../analyse/erreurs.js';
import type { Application } from '../ri/types.js';

const CONSTRUCTIONS: { motif: RegExp; nom: string }[] = [
  { motif: /"type":"prisePhoto"/, nom: '« photo dans … »' },
  { motif: /"type":"scanCode"/, nom: '« scanner code dans … »' },
  { motif: /"type":"verificationIdentite"/, nom: '« verifier identite »' },
  { motif: /"type":"vibration"/, nom: '« vibrer »' },
  { motif: /"genre":"signature"/, nom: '« signature dans … »' },
  { motif: /"horsLigne":true/, nom: '« avec hors ligne »' },
  { motif: /"type":"localisation"/, nom: '« position dans … »' },
  { motif: /"enAttente":true/, nom: '« … hors ligne » sur un envoi' },
  { motif: /"declencheur":"arrierePlan"/, nom: '« en arriere plan : »' },
];

export function verifierAppareilPourLaCible(application: Application, cible: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lieux = [...application.ecrans, ...application.composants, ...[application.disposition?.entete?.ecran, application.disposition?.pied?.ecran].flatMap((e) => (e ? [e] : []))];
  for (const { motif, nom } of CONSTRUCTIONS) {
    const lieu = lieux.find((e) => motif.test(JSON.stringify(e)));
    const partage = application.partages.find((p) => motif.test(JSON.stringify(p)));
    const ligne = lieu?.ligne ?? partage?.ligne;
    if (ligne !== undefined) diagnostics.push({ gravite: 'erreur', ligne, message: `${nom} n'est disponible que sur la cible Apple pour l'instant : compilez avec --cible apple (ici, --cible ${cible}).` });
  }
  if (application.liensProfonds) diagnostics.push({ gravite: 'erreur', ligne: application.liensProfonds.ligne, message: `« liens profonds » n'est disponible que sur la cible Apple pour l'instant : compilez avec --cible apple, ou retirez cette ligne.` });
  return diagnostics;
}
