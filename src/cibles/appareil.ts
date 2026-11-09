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
  { motif: /"declencheur":"commandeMenu"/, nom: '« menu de l’application »' },
];

/** Sur le web, presque tout existe. Ce que le navigateur ne peut pas faire est dit, jamais simulé. */
function verifierPourLeNavigateur(application: Application): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lieux = [...application.ecrans, ...application.composants];
  const ligneDe = (motif: RegExp) => lieux.find((e) => motif.test(JSON.stringify(e)))?.ligne;
  const fond = ligneDe(/"declencheur":"arrierePlan"/);
  if (fond !== undefined) diagnostics.push({ gravite: 'erreur', ligne: fond, message: "« en arriere plan : » n'existe pas sur le web : une page fermée ne peut pas être réveillée par le navigateur. Compilez avec --cible apple, ou faites ce travail sur le serveur avec une tâche planifiée." });
  const commande = ligneDe(/"declencheur":"commandeMenu"/);
  if (commande !== undefined) diagnostics.push({ gravite: 'erreur', ligne: commande, message: "« menu de l'application » n'existe pas sur le web : un site n'a pas de barre de menus. Compilez avec --cible apple, ou retirez ce bloc." });
  const vibration = ligneDe(/"type":"vibration"/);
  if (vibration !== undefined) diagnostics.push({ gravite: 'avertissement', ligne: vibration, message: "« vibrer » n'a d'effet sur le web que sur les téléphones Android : rien ne se passe sur iPhone ni sur un ordinateur." });
  if (application.liensProfonds) diagnostics.push({ gravite: 'avertissement', ligne: application.liensProfonds.ligne, message: "« liens profonds » ne change rien sur le web : chaque page a déjà sa propre adresse." });
  return diagnostics;
}

export function verifierAppareilPourLaCible(application: Application, cible: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (cible === 'web') return verifierPourLeNavigateur(application);
  const lieux = [...application.ecrans, ...application.composants, ...[application.disposition?.entete?.ecran, application.disposition?.pied?.ecran].flatMap((e) => (e ? [e] : []))];
  for (const { motif, nom } of CONSTRUCTIONS) {
    const lieu = lieux.find((e) => motif.test(JSON.stringify(e)));
    const partage = application.partages.find((p) => motif.test(JSON.stringify(p)));
    const ligne = lieu?.ligne ?? partage?.ligne;
    if (ligne !== undefined) diagnostics.push({ gravite: 'erreur', ligne, message: `${nom} n'est disponible que sur la cible Apple pour l'instant : compilez avec --cible apple (ici, --cible ${cible}).` });
  }
  if (['mobile', 'desktop', 'statique'].includes(cible)) {
    const lieu = lieux.find((e) => /"type":"connexionApple"/.test(JSON.stringify(e)));
    if (lieu) diagnostics.push({ gravite: 'erreur', ligne: lieu.ligne, message: `« se connecter avec apple » n'existe pas pour cette cible : compilez avec --cible web ou --cible apple, ou retirez cette ligne.` });
  }
  if (application.liensProfonds) diagnostics.push({ gravite: 'erreur', ligne: application.liensProfonds.ligne, message: `« liens profonds » n'est disponible que sur la cible Apple pour l'instant : compilez avec --cible apple, ou retirez cette ligne.` });
  return diagnostics;
}
