/**
 * Les formes d'application spéciales, cible par cible (validées par Emch le 10 novembre 2026).
 * Une forme prévue sur une cible mais pas encore écrite y est refusée clairement ; une forme qui
 * n'a pas de sens sur une cible (un widget sur le web) y est ignorée, dite une fois.
 * Quand une cible écrit une forme, elle s'ajoute à `ECRITES` : c'est le seul endroit à changer.
 */
import type { Diagnostic } from '../analyse/erreurs.js';
import type { Application } from '../ri/types.js';
import { requetesCapture } from './capture-erreurs.js';

export type Forme =
  | 'captureErreur'
  | 'widget'
  | 'barreSysteme'
  | 'partageRecu'
  | 'montre'
  | 'tele'
  | 'clavier'
  | 'activite'
  | 'raccourcisIcone'
  | 'commandeVocale'
  | 'fichierOuvert'
  | 'demarrage'
  | 'boutonsNotification'
  | 'rechercheSysteme'
  | 'tuile'
  | 'miniApplication'
  | 'voiture'
  | 'menuClicDroit'
  | 'donneeLocale'
  | 'cleAcces'
  | 'doubleAuthentification'
    | 'enregistrerAudio' | 'enregistrerVideo' | 'scannerDocument' | 'recadrerPhoto';

/** Les cibles où chaque forme a un sens : ailleurs, elle est ignorée. */
export const PREVUES: Record<Forme, string[]> = {
  captureErreur: ['web', 'statique', 'desktop', 'mobile', 'apple', 'android', 'windows', 'serveur'],
  widget: ['apple', 'android'],
  barreSysteme: ['apple', 'windows', 'desktop'],
  partageRecu: ['apple', 'android', 'windows'],
  montre: ['apple', 'android'],
  tele: ['apple', 'android'],
  clavier: ['apple', 'android'],
  activite: ['apple', 'android', 'serveur'],
  raccourcisIcone: ['apple', 'android', 'windows'],
  commandeVocale: ['apple', 'android'],
  fichierOuvert: ['apple', 'android', 'windows', 'desktop'],
  demarrage: ['apple', 'windows', 'desktop'],
  boutonsNotification: ['apple', 'android', 'windows', 'serveur'],
  rechercheSysteme: ['apple', 'android'],
  tuile: ['apple', 'android'],
  miniApplication: ['apple'],
  voiture: ['apple', 'android'],
  menuClicDroit: ['apple', 'windows', 'desktop'],
  donneeLocale: ['web', 'desktop', 'apple', 'android', 'windows'],
  cleAcces: ['web', 'desktop', 'apple', 'android', 'windows', 'serveur'],
  doubleAuthentification: ['web', 'desktop', 'apple', 'android', 'windows', 'serveur'],
  enregistrerAudio: ['web', 'desktop', 'apple', 'android', 'windows'],
  enregistrerVideo: ['web', 'desktop', 'apple', 'android', 'windows'],
  scannerDocument: ['apple', 'android'],
  recadrerPhoto: ['web', 'desktop', 'apple', 'android', 'windows'],
};

/** Les formes déjà écrites par chaque cible. */
export const ECRITES: Record<string, Set<Forme>> = {};
ECRITES.web = new Set<Forme>(['captureErreur']);
ECRITES.statique = new Set<Forme>(['captureErreur']);
ECRITES.mobile = new Set<Forme>(['captureErreur']);

const NOMS_CIBLES: Record<string, string> = { apple: 'Apple', android: 'Android', windows: 'Windows', desktop: 'bureau (Electron)', web: 'web', serveur: 'serveur' };

/** Où chaque forme est écrite dans le programme : une ligne et un nom lisible. */
function formesDuProgramme(application: Application): { forme: Forme; quoi: string; ligne: number }[] {
  const f = application.formes;
  const trouvees: { forme: Forme; quoi: string; ligne: number }[] = [];
  const ajouter = (forme: Forme, quoi: string, ligne: number) => trouvees.push({ forme, quoi, ligne });
  if (f?.erreurArrive) ajouter('captureErreur', 'la capture des erreurs', f.erreurArrive.ligne);
  for (const w of f?.widgets ?? []) ajouter('widget', `le widget « ${w.nom} »`, w.ligne);
  for (const a of f?.activites ?? []) ajouter('activite', `l'activité en direct « ${a.nom} »`, a.ligne);
  if (f?.raccourcisIcone.length) ajouter('raccourcisIcone', 'les raccourcis de l’icône', f.raccourcisIcone[0]!.ligne);
  for (const c of f?.commandesVocales ?? []) ajouter('commandeVocale', `la commande vocale « ${c.phrase} »`, c.ligne);
  if (f?.demarrage) ajouter('demarrage', 'le lancement au démarrage', f.demarrage.ligne);
  if (f?.recherches.length) ajouter('rechercheSysteme', 'la recherche du système', f.recherches[0]!.ligne);
  for (const t of f?.tuiles ?? []) ajouter('tuile', `la tuile « ${t.nom} »`, t.ligne);
  for (const m of f?.minis ?? []) ajouter('miniApplication', `la mini-application « ${m.nom} »`, m.ligne);
  for (const v of f?.voitures ?? []) ajouter('voiture', `l'écran de voiture « ${v.nom} »`, v.ligne);
  for (const m of f?.menusClicDroit ?? []) ajouter('menuClicDroit', `le menu clic droit « ${m.titre} »`, m.ligne);
  for (const k of f?.claviers ?? []) ajouter('clavier', `le clavier « ${k.nom} »`, k.ligne);
  if (f?.partageRecu) ajouter('partageRecu', 'le partage reçu', f.partageRecu.ligne);
  for (const o of f?.fichiersOuverts ?? []) ajouter('fichierOuvert', `l'ouverture des fichiers ${o.extensions.join(', ')}`, o.ligne);
  for (const b of f?.boutonsNotification ?? []) ajouter('boutonsNotification', `le bouton « ${b.bouton} » d'une notification`, b.ligne);
  for (const d of f?.donneesLocales ?? []) ajouter('donneeLocale', `la donnée locale « ${d.nom} »`, d.ligne);
  for (const e of application.ecrans) {
    if (e.barreSysteme) ajouter('barreSysteme', `la page « ${e.nom} » dans la barre du système`, e.ligne);
    if (e.appareil) ajouter(e.appareil, `la page « ${e.nom} » sur ${e.appareil === 'montre' ? 'la montre' : 'la télévision'}`, e.ligne);
  }
  // Les actions des pages : « commencer activite », « dire ».
  const lignes = JSON.stringify([application.ecrans, application.composants]);
  if (/"type":"activite","mode"/.test(lignes) && !trouvees.some((t) => t.forme === 'activite')) ajouter('activite', '« commencer activite »', 1);
  if (/"type":"dire"/.test(lignes) && !trouvees.some((t) => t.forme === 'commandeVocale')) ajouter('commandeVocale', '« dire »', 1);
  if (/"quoi":"(connexionCle|ajoutCle)"/.test(lignes)) ajouter('cleAcces', 'les clés d’accès', 1);
  if (/"quoi":"doubleAuthentification"/.test(lignes)) ajouter('doubleAuthentification', 'la double authentification', 1);
  for (const m of lignes.matchAll(/"type":"(enregistrerAudio|enregistrerVideo|scannerDocument|recadrerPhoto)","variable":"([^"]+)"/g)) {
    const phrase = { enregistrerAudio: `enregistrer audio dans ${m[2]}`, enregistrerVideo: `enregistrer video dans ${m[2]}`, scannerDocument: `scanner document dans ${m[2]}`, recadrerPhoto: `recadrer ${m[2]}` }[m[1] as 'enregistrerAudio'];
    ajouter(m[1] as Forme, `« ${phrase} »`, 1);
  }
  // Le serveur : « mettre a jour activite », « … et boutons ».
  for (const s of application.serveurs ?? []) {
    if (s.captureErreurs) ajouter('captureErreur', 'la capture des erreurs du serveur', 1);
    const texte = JSON.stringify(s);
    if (texte.includes('"type":"activite"')) ajouter('activite', '« mettre a jour activite » du serveur', 1);
    if (texte.includes('"boutons":[')) ajouter('boutonsNotification', 'les boutons des notifications du serveur', 1);
    if (s.connexionCleAcces) ajouter('cleAcces', 'les clés d’accès du serveur', 1);
    if (s.doubleAuthentification) ajouter('doubleAuthentification', 'la double authentification du serveur', 1);
  }
  return trouvees;
}

/** Ce que cette cible dit des formes du programme : refus de ce qui y est prévu sans être écrit, avertissement pour le reste. */
export function verifierFormesPourLaCible(application: Application, cible: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (application.formes?.erreurArrive) {
    // Un même fichier se compile pour le serveur et pour les applications : le serveur ignore la capture des pages.
    if (cible !== 'serveur') for (const message of requetesCapture(application.formes).erreurs) diagnostics.push({ gravite: 'erreur', ligne: application.formes.erreurArrive.ligne, message });
  }
  const ignorees: string[] = [];
  const ecrites = ECRITES[cible] ?? new Set<Forme>();
  for (const { forme, quoi, ligne } of formesDuProgramme(application)) {
    const prevues = PREVUES[forme];
    // Le serveur ne regarde que ses propres phrases ; les applications, que les leurs.
    if (cible === 'serveur' && !quoi.includes('serveur')) continue;
    if (cible !== 'serveur' && quoi.includes('du serveur')) continue;
    if (!prevues.includes(cible)) {
      if (['enregistrerAudio', 'enregistrerVideo', 'scannerDocument', 'recadrerPhoto'].includes(forme)) {
        diagnostics.push({ gravite: 'erreur', ligne, message: `${quoi} : cette action n'est pas disponible sur la cible ${NOMS_CIBLES[cible] ?? cible}. Cibles prévues : ${prevues.map((c) => NOMS_CIBLES[c] ?? c).join(', ')}.` });
      } else ignorees.push(quoi);
      continue;
    }
    if (!ecrites.has(forme)) {
      diagnostics.push({ gravite: 'erreur', ligne, message: `${quoi} : cela n'est pas encore disponible sur la cible ${NOMS_CIBLES[cible] ?? cible}, où c'est prévu. Cibles prévues : ${prevues.map((c) => NOMS_CIBLES[c] ?? c).join(', ')}.` });
    }
  }
  if (ignorees.length) diagnostics.push({ gravite: 'avertissement', ligne: 1, message: `sur la cible ${NOMS_CIBLES[cible] ?? cible}, ${ignorees.length > 1 ? 'ces formes n\'existent pas et sont ignorées' : 'cette forme n\'existe pas et est ignorée'} : ${ignorees.join(', ')}.` });
  return diagnostics;
}

// Windows (C# et WPF, sans paquet MSIX) : src/cibles/windows/formes.ts.
ECRITES.windows = new Set<Forme>(['barreSysteme', 'partageRecu', 'raccourcisIcone', 'fichierOuvert', 'demarrage', 'boutonsNotification', 'menuClicDroit', 'captureErreur']);

// Android (Kotlin et Compose) et le serveur (APNs, Firebase).
ECRITES.android = new Set<Forme>(['widget', 'partageRecu', 'montre', 'tele', 'clavier', 'activite', 'raccourcisIcone', 'commandeVocale', 'fichierOuvert', 'boutonsNotification', 'rechercheSysteme', 'tuile', 'voiture', 'captureErreur']);
ECRITES.serveur = new Set<Forme>(['activite', 'boutonsNotification', 'captureErreur']);
ECRITES.apple = new Set<Forme>(['widget', 'barreSysteme', 'partageRecu', 'montre', 'tele', 'clavier', 'activite', 'raccourcisIcone', 'commandeVocale', 'fichierOuvert', 'demarrage', 'boutonsNotification', 'rechercheSysteme', 'tuile', 'miniApplication', 'voiture', 'menuClicDroit', 'captureErreur']);

// Le bureau (Electron, Linux compris) : src/cibles/desktop/formes.ts.
ECRITES.desktop = new Set<Forme>(['barreSysteme', 'fichierOuvert', 'demarrage', 'menuClicDroit', 'captureErreur']);

// Le navigateur et Electron partagent les fonctions de capture et de recadrage.
for (const cible of ['web', 'desktop'] as const) for (const forme of ['enregistrerAudio', 'enregistrerVideo', 'recadrerPhoto'] as const) (ECRITES[cible] ??= new Set<Forme>()).add(forme);

// Les médias natifs : src/cibles/apple/captures.ts, src/cibles/android/captures.ts, src/cibles/windows/bibliotheque/captures.ts.
for (const forme of ['enregistrerAudio', 'enregistrerVideo', 'scannerDocument', 'recadrerPhoto'] as const) {
  ECRITES.apple!.add(forme);
  ECRITES.android!.add(forme);
}
