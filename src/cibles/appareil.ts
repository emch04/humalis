/**
 * Les fonctions de l'appareil (photo, scanner, Face ID, vibration, signature,
 * hors ligne) n'existent pour l'instant que sur la cible Apple. Ailleurs, le
 * compilateur le dit au lieu de produire un bouton qui ne ferait rien.
 */
import type { Diagnostic } from '../analyse/erreurs.js';
import type { Application } from '../ri/types.js';

/** `android` : la construction existe aussi sur la cible Android. */
const CONSTRUCTIONS: { motif: RegExp; nom: string; android?: true }[] = [
  { motif: /"type":"prisePhoto"/, android: true, nom: '« photo dans … »' },
  { motif: /"type":"scanCode"/, android: true, nom: '« scanner code dans … »' },
  { motif: /"type":"verificationIdentite"/, android: true, nom: '« verifier identite »' },
  { motif: /"type":"vibration"/, android: true, nom: '« vibrer »' },
  { motif: /"genre":"signature"/, android: true, nom: '« signature dans … »' },
  { motif: /"horsLigne":true/, android: true, nom: '« avec hors ligne »' },
  { motif: /"type":"localisation"/, android: true, nom: '« position dans … »' },
  { motif: /"enAttente":true/, android: true, nom: '« … hors ligne » sur un envoi' },
  { motif: /"declencheur":"arrierePlan"/, android: true, nom: '« en arriere plan : »' },
  { motif: /"declencheur":"commandeMenu"/, android: true, nom: '« menu de l’application »' },
];

/** Sur le web, presque tout existe. Ce que le navigateur ne peut pas faire est dit, jamais simulé. */
function verifierPourLeNavigateur(application: Application): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lieux = [...application.ecrans, ...application.composants];
  const ligneDe = (motif: RegExp) => lieux.find((e) => motif.test(JSON.stringify(e)))?.ligne;
  const fond = ligneDe(/"declencheur":"arrierePlan"/);
  if (fond !== undefined) diagnostics.push({ gravite: 'erreur', ligne: fond, message: "« en arriere plan : » n'existe pas sur le web : une page fermée ne peut pas être réveillée par le navigateur. Compilez avec --cible apple, ou faites ce travail sur le serveur avec une tâche planifiée." });
  const commande = ligneDe(/"declencheur":"commandeMenu"/);
  if (commande !== undefined) diagnostics.push({ gravite: 'erreur', ligne: commande, message: "« menu de l'application » n'existe pas sur le web : un site n'a pas de barre de menus. Compilez avec --cible apple ou --cible android, ou retirez ce bloc." });
  const vibration = ligneDe(/"type":"vibration"/);
  if (vibration !== undefined) diagnostics.push({ gravite: 'avertissement', ligne: vibration, message: "« vibrer » n'a d'effet sur le web que sur les téléphones Android : rien ne se passe sur iPhone ni sur un ordinateur." });
  if (application.liensProfonds) diagnostics.push({ gravite: 'avertissement', ligne: application.liensProfonds.ligne, message: "« liens profonds » ne change rien sur le web : chaque page a déjà sa propre adresse." });
  return diagnostics;
}

/**
 * « utiliser composant "Carte" sur apple "….swift" … » sans « depuis » : le composant n'a que des vues natives.
 * Sur le web, le bureau et le mobile Expo, il n'a rien pour se dessiner : la compilation le dit.
 */
export function verifierComposantsSansWeb(application: Application, cible: string): Diagnostic[] {
  if (!['web', 'statique', 'desktop', 'mobile'].includes(cible)) return [];
  return application.composantsReact
    .filter((c) => c.chemin === undefined)
    .map((c) => ({
      gravite: 'erreur' as const,
      ligne: c.ligne,
      message: `le composant « ${c.nom} » n'a que des vues natives (Swift, Kotlin ou C#) : ici, --cible ${cible}, il n'a rien pour se dessiner. Écrivez-le en Humalis (« composant "${c.nom}" : »), ou donnez-lui un module JavaScript : « utiliser module "${c.nom}" depuis "./modules/${c.nom}.js" » suivi des mêmes « sur … ».`,
    }));
}

export function verifierAppareilPourLaCible(application: Application, cible: string): Diagnostic[] {
  const sansWeb = verifierComposantsSansWeb(application, cible);
  if (cible === 'web') return [...sansWeb, ...verifierPourLeNavigateur(application)];
  const diagnostics: Diagnostic[] = [...sansWeb];
  const lieux = [...application.ecrans, ...application.composants, ...[application.disposition?.entete?.ecran, application.disposition?.pied?.ecran].flatMap((e) => (e ? [e] : []))];
  for (const { motif, nom, android } of CONSTRUCTIONS) {
    if (android && cible === 'android') continue;
    const lieu = lieux.find((e) => motif.test(JSON.stringify(e)));
    const partage = application.partages.find((p) => motif.test(JSON.stringify(p)));
    const ligne = lieu?.ligne ?? partage?.ligne;
    if (ligne !== undefined) diagnostics.push({ gravite: 'erreur', ligne, message: android ? `${nom} n'est disponible que sur les cibles Apple et Android pour l'instant : compilez avec --cible apple ou --cible android (ici, --cible ${cible}).` : `${nom} n'est disponible que sur la cible Apple pour l'instant : compilez avec --cible apple (ici, --cible ${cible}).` });
  }
  if (['mobile', 'desktop', 'statique'].includes(cible)) {
    const lieu = lieux.find((e) => /"type":"connexionApple"/.test(JSON.stringify(e)));
    if (lieu) diagnostics.push({ gravite: 'erreur', ligne: lieu.ligne, message: `« se connecter avec apple » n'existe pas pour cette cible : compilez avec --cible web ou --cible apple, ou retirez cette ligne.` });
  }
  if (application.liensProfonds && cible !== 'android') diagnostics.push({ gravite: 'erreur', ligne: application.liensProfonds.ligne, message: `« liens profonds » n'est disponible que sur les cibles Apple et Android pour l'instant : compilez avec --cible apple ou --cible android, ou retirez cette ligne.` });
  return diagnostics;
}
