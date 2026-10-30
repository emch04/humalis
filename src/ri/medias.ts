/**
 * Les médias dans la représentation intermédiaire (plan des médias) : ce
 * qu'une image sait d'elle-même, et la liste des fichiers locaux qu'un
 * programme emploie (pour que la commande les lise et les recopie).
 */
import { contenuBinaire } from '../cibles/binaire.js';
import type { Element, Expression, Style } from '../parser/ast.js';
import { normaliser } from '../lexer/motsCles.js';
import { aUnApercu, famillesAcceptees, FAMILLES_FICHIER } from '../analyse/fichiers.js';
import type { ChoixFichier } from '../parser/ast.js';
import type { Application, ChoixFichierRI, ImageRI, NoeudVue, Valeur } from './types.js';

/** Les réglages d'une image qui ne sont pas des classes CSS. */
export const REGLAGES_IMAGE = new Set(['description', 'decoratif', 'prioritaire', 'proportions']);

const reglage = (styles: Style[], nom: string) => styles.find((s) => normaliser(s.propriete) === nom);

/** Un texte écrit entre guillemets, sans {variable} ; sinon undefined. */
function texteSimple(expression: Expression): string | undefined {
  return expression.type === 'Chaine' && expression.parties.every((p) => p.type === 'texte') ? expression.parties.map((p) => p.valeur).join('') : undefined;
}

/** Vrai pour un fichier écrit à côté du fichier Humalis : ni une adresse, ni un chemin absolu, ni des données. */
export const estFichierLocal = (chemin: string): boolean => !/^([a-z][a-z0-9+.-]*:|\/)/i.test(chemin.trim());

/** Ce qu'une image sait d'elle-même : description, fichier local, proportions, priorité. */
export function imageDe(element: Element, valeur: (e: Expression) => Valeur): ImageRI {
  const description = reglage(element.styles, 'description');
  const proportions = reglage(element.styles, 'proportions');
  const fichier = texteSimple(element.contenu);
  const image: ImageRI = {};
  if (description && !reglage(element.styles, 'decoratif')) {
    image.description = valeur(description.texte ?? { type: 'Chaine', parties: description.parties ?? [{ type: 'texte', valeur: description.valeur }], ligne: element.ligne });
  }
  if (fichier !== undefined && estFichierLocal(fichier)) image.locale = fichier;
  if (proportions) {
    const [largeur, hauteur] = proportions.valeur.split(':').map(Number);
    image.proportions = [largeur, hauteur];
  }
  if (reglage(element.styles, 'prioritaire')) image.prioritaire = true;
  return image;
}

/** Un fichier local employé par le programme : une image ou un son. */
export interface MediaLocal {
  chemin: string;
  genre: 'image' | 'audio';
  ligne: number;
}

/** Les fichiers locaux de toutes les pages, composants, en-tête et pied, chacun une fois. */
export function mediasLocaux(application: Application): MediaLocal[] {
  const vus = new Map<string, MediaLocal>();
  const parcourir = (noeuds: NoeudVue[]) => {
    for (const n of noeuds) {
      if (n.type === 'element' && n.image?.locale !== undefined && !vus.has(n.image.locale)) vus.set(n.image.locale, { chemin: n.image.locale, genre: 'image', ligne: n.ligne });
      // Un son écrit entre guillemets, à côté du fichier Humalis : recopié lui aussi.
      if (n.type === 'widget' && n.genre === 'audio' && n.contenu.type === 'texte' && n.contenu.parties.every((p) => 'texte' in p)) {
        const chemin = n.contenu.parties.map((p) => ('texte' in p ? p.texte : '')).join('');
        if (estFichierLocal(chemin) && !vus.has(chemin)) vus.set(chemin, { chemin, genre: 'audio', ligne: n.ligne });
      }
      if (n.type === 'condition') {
        parcourir(n.alors);
        parcourir(n.sinon);
      } else if (n.type === 'repetition' || n.type === 'bloc' || n.type === 'formulaire') {
        parcourir(n.corps);
      }
    }
  };
  for (const ecran of [...application.ecrans, ...application.composants]) parcourir(ecran.vue);
  for (const d of [application.disposition?.entete, application.disposition?.pied]) if (d) parcourir(d.ecran.vue);
  return [...vus.values()];
}

/**
 * Le chemin de la copie dans le projet produit, relatif au dossier des
 * images (« salle.jpg », « plats/moambe.jpg ») : le chemin écrit, sans « ./ ».
 * Un chemin qui remonte (« ../ ») garde seulement le nom du fichier.
 */
export function nomDeLaCopie(chemin: string): string {
  const propre = chemin.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  return propre.split('/').some((m) => m === '..' || m === '') ? propre.split('/').pop()! : propre;
}

/** Ce que la commande a lu d'un fichier local : sa taille, et les dimensions d'une image quand elles se lisent. */
export interface InfoMedia {
  octets: number;
  largeur?: number;
  hauteur?: number;
  /** Le fichier lui-même, en base 64, quand la commande l'a lu : il est recopié dans le projet produit. */
  contenu?: string;
  /** Une image (par défaut) ou un son : chacun a son dossier dans le projet produit. */
  genre?: 'image' | 'audio';
}

/** Les copies des images locales dans le projet produit, dans `dossier` (« public/images/ », « images/ », « assets/images/ »). */
export function copiesDesMedias(medias: Map<string, InfoMedia> | undefined, dossier: string, genre: 'image' | 'audio' = 'image'): Map<string, string> {
  const copies = new Map<string, string>();
  for (const [chemin, info] of medias ?? []) if (info.contenu !== undefined && (info.genre ?? 'image') === genre) copies.set(`${dossier}${nomDeLaCopie(chemin)}`, contenuBinaire(info.contenu));
  return copies;
}

/** Le choix d'un fichier tel que les cibles l'écrivent : les types MIME de chaque famille demandée. */
export function choixFichierDe(choix: ChoixFichier): ChoixFichierRI {
  return {
    variable: choix.variable,
    familles: famillesAcceptees(choix).map((nom) => ({ nom, mime: FAMILLES_FICHIER[nom].mime })),
    ...(choix.octets !== undefined ? { octets: choix.octets } : {}),
    plusieurs: choix.plusieurs === true,
    apercu: aUnApercu(choix),
  };
}
