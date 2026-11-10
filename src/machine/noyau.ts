/**
 * Le cœur de la machine Humalis : compile un programme en mémoire (lexique, syntaxe, analyse,
 * représentation intermédiaire) puis produit, toujours en mémoire, les fichiers du moteur de rendu.
 * Aucun accès au disque ni à Node ici : ce qui est lu (autres fichiers du projet, styles, images)
 * passe par le Lecteur et les Ressources que l'appelant donne. La commande `humalis lancer` donne le
 * disque ; le bac à sable du site donne des fichiers déjà en mémoire.
 */
import { compilerProjet, situer, type Lecteur } from '../fichiers.js';
import type { Diagnostic } from '../analyse/erreurs.js';
import type { Application } from '../ri/types.js';
import { pourLaCible } from '../ri/plateforme.js';
import { mediasLocaux, type InfoMedia } from '../ri/medias.js';
import { dimensionsImage } from '../image/entete.js';
import { verifierNomsPourLeWeb } from '../cibles/sources.js';
import { verifierFormesPourLaCible } from '../cibles/formes.js';
import { verifierAppareilPourLaCible } from '../cibles/appareil.js';
import { cheminsDesPages } from '../cibles/web/projet.js';
import { genererProjetMoteur, verifierPourLeMoteur } from '../cibles/moteur/projet.js';

/** Les fichiers à côté du programme (styles, images, polices, sons), lus par leur chemin relatif. */
export interface Ressources {
  texte(chemin: string): string | undefined;
  octets(chemin: string): Uint8Array | undefined;
}

export interface EntreeMachine {
  source: string;
  /** Le chemin du fichier principal (pour situer les autres fichiers du projet) ; absent pour un programme seul. */
  principal?: string;
  lire?: Lecteur;
  ressources?: Ressources;
  /** L'adresse où la machine sert l'application. */
  adresse: string;
}

export interface Programme {
  application: Application;
  /** Les fichiers du moteur de rendu, en mémoire : le même ensemble que `humalis compile --cible web`. */
  fichiers: Map<string, string>;
  /** L'adresse de chaque page par son nom. */
  chemins: Map<string, string>;
  /** Les fichiers Humalis du projet, le principal d'abord. */
  fichiersProjet: string[];
  /** Les fichiers lus à côté du programme (styles, images…), pour le rechargement. */
  ressourcesLues: string[];
  avertissements: Diagnostic[];
}

export type ResultatMachine =
  | { ok: true; programme: Programme }
  | { ok: false; diagnostics: Diagnostic[]; fichiersProjet: string[] };

const erreur = (message: string, ligne = 0): Diagnostic => ({ gravite: 'erreur', message, ligne });

const octetsEnBase64 = (octets: Uint8Array): string => {
  let texte = '';
  for (let i = 0; i < octets.length; i += 0x8000) texte += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(texte);
};

/** Compile en mémoire. Une faute dans le programme donne des diagnostics, jamais une exception. */
export function compilerPourLaMachine(entree: EntreeMachine): ResultatMachine {
  const resultat = compilerProjet(entree.principal, entree.lire ?? (() => undefined), entree.source);
  const fichiersProjet = resultat.fichiers ?? [];
  const situes = (liste: Diagnostic[]) => liste.map((d) => situer(d, fichiersProjet));
  const diagnostics = situes(resultat.diagnostics);
  if (!resultat.application || diagnostics.some((d) => d.gravite === 'erreur')) return { ok: false, diagnostics, fichiersProjet };
  const application = pourLaCible(resultat.application, 'web');

  // Ce que le moteur et le web refusent, plus ce que la machine ne sait pas faire : dit, avec sa ligne.
  const refus: Diagnostic[] = [...verifierPourLeMoteur(application), ...verifierNomsPourLeWeb(application), ...verifierFormesPourLaCible(application, 'web'), ...verifierAppareilPourLaCible(application, 'web')];
  for (const c of application.composantsReact) {
    refus.push(erreur(`le composant « ${c.nom} » vient d'un fichier externe (npm) : la machine ne lance que du Humalis, sans installation. Utilisez « humalis developper » pour ce projet.`, c.ligne));
  }
  if (application.serveurs.length > 1) refus.push(erreur("un seul serveur par fichier pour l'instant."));
  if (application.ecrans.length === 0 && application.serveurs.length === 0) refus.push(erreur('le fichier ne contient ni page ni serveur : il n\'y a rien à lancer.'));
  const tous = [...diagnostics, ...situes(refus)];
  if (tous.some((d) => d.gravite === 'erreur')) return { ok: false, diagnostics: tous, fichiersProjet };

  // Les fichiers à côté du programme, comme le fait la commande de compilation.
  const lues: string[] = [];
  const manquants: Diagnostic[] = [];
  const ressources = entree.ressources;
  const fichiersStyle = new Map<string, string>();
  for (const style of application.fichiersStyle) {
    const texte = ressources?.texte(style.chemin);
    if (texte === undefined) manquants.push(erreur(`le fichier de style « ${style.chemin} » est introuvable (il est cherché à côté du programme).`, style.ligne));
    else { fichiersStyle.set(style.chemin, texte); lues.push(style.chemin); }
  }
  const medias = new Map<string, InfoMedia>();
  for (const media of mediasLocaux(application)) {
    const octets = ressources?.octets(media.chemin);
    const quoi = media.genre === 'audio' ? 'le son' : media.genre === 'video' ? 'la vidéo' : "l'image";
    if (octets === undefined) { manquants.push(erreur(`${quoi} « ${media.chemin} » est introuvable (elle est cherchée à côté du programme).`, media.ligne)); continue; }
    lues.push(media.chemin);
    const dimensions = media.genre === 'image' ? dimensionsImage(octets as Parameters<typeof dimensionsImage>[0]) : undefined;
    medias.set(media.chemin, { octets: octets.length, genre: media.genre, ...(dimensions ? { largeur: dimensions.largeur, hauteur: dimensions.hauteur } : {}), contenu: octetsEnBase64(octets) });
  }
  const images = new Map<string, string>();
  const site = application.site;
  for (const [role, fichier] of [['logo', site?.logo], ['image', site?.image]] as const) {
    if (!fichier || /^https?:\/\//.test(fichier)) continue;
    const octets = ressources?.octets(fichier);
    if (octets === undefined) manquants.push(erreur(`le fichier « ${fichier} » (${role} du bloc « site ») est introuvable (il est cherché à côté du programme).`, site?.ligne ?? 0));
    else { images.set(fichier, octetsEnBase64(octets)); lues.push(fichier); }
  }
  const polices = new Map<string, string>();
  for (const police of application.theme?.polices ?? []) {
    if (!police.fichier) continue;
    const octets = ressources?.octets(police.fichier);
    if (octets === undefined) manquants.push(erreur(`le fichier de police « ${police.fichier} » est introuvable (il est cherché à côté du programme).`));
    else { polices.set(police.fichier, octetsEnBase64(octets)); lues.push(police.fichier); }
  }
  if (manquants.length > 0) return { ok: false, diagnostics: [...tous, ...manquants], fichiersProjet };

  const nom = (entree.principal ?? 'programme.humalis').split('/').pop()!.replace(/\.humalis$/, '');
  const chemins = cheminsDesPages(application);
  const fichiers = application.ecrans.length === 0
    ? new Map<string, string>()
    : genererProjetMoteur(application, { nom, source: `${nom}.humalis`, fichiersStyle, polices, images, medias, externes: new Map(), adresse: entree.adresse, sources: fichiersProjet });
  return { ok: true, programme: { application, fichiers, chemins, fichiersProjet, ressourcesLues: lues, avertissements: tous.filter((d) => d.gravite === 'avertissement') } };
}
