/**
 * Les vérifications du choix et de l'envoi d'un fichier.
 *
 * Règle d'honnêteté : Humalis ne « sécurise » jamais un fichier. Le type et
 * la taille choisis ici sont un confort (un message tout de suite, sans
 * attendre le réseau) ; la vérification qui compte est celle du serveur.
 */
import type { ChoixFichier, Element, EnvoiFichier, Instruction } from '../parser/ast.js';
import { NOMBRE, TEXTE, estConnu, decrireType, listeDe, type TypeValeur } from './types.js';
import { proposerNom } from './suggestions.js';
import { cheminSource, regleDeRoute, routeDeSource, type InfoSource } from './sources.js';
import { texteSimple, type Signaler } from './ecran.js';

/** Ce que « accepte … » permet : les types MIME écrits dans la page, et si on peut afficher un aperçu. */
export interface FamilleFichier {
  mime: string[];
  /** Un aperçu (`photo.apercu`) existe pour des images, des sons et des vidéos. */
  apercu: boolean;
  /** La phrase du refus : « Ce fichier n'est pas une image. » */
  refus: string;
}

/** La liste fermée de « accepte » (décision M8) : pas de types MIME à connaître. Le SVG n'est pas une « image » : il peut contenir du script. */
export const FAMILLES_FICHIER: Record<string, FamilleFichier> = {
  images: { mime: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'], apercu: true, refus: "n'est pas une image" },
  audio: { mime: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/flac', 'audio/webm'], apercu: true, refus: "n'est pas un son" },
  videos: { mime: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'], apercu: true, refus: "n'est pas une vidéo" },
  pdf: { mime: ['application/pdf'], apercu: false, refus: "n'est pas un PDF" },
  documents: {
    mime: [
      'text/plain',
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
    ],
    apercu: false,
    refus: "n'est pas un document",
  },
};

const SINGULIERS: Record<string, string> = { image: 'images', photo: 'images', photos: 'images', son: 'audio', video: 'videos', document: 'documents' };

/** Le nom de la famille (« image » donne « images »), ou undefined. */
export const familleDe = (mot: string): string | undefined => {
  const nom = SINGULIERS[mot] ?? mot;
  return nom in FAMILLES_FICHIER ? nom : undefined;
};

/** Le type d'un fichier choisi : une fiche de quatre champs, ou une liste avec « plusieurs ». */
export function typeFichierChoisi(plusieurs: boolean | undefined): TypeValeur {
  const fiche: TypeValeur = {
    genre: 'fiche',
    champs: [
      { nom: 'nom', type: TEXTE },
      { nom: 'taille', type: NOMBRE },
      { nom: 'type', type: TEXTE },
      { nom: 'apercu', type: TEXTE },
    ],
  };
  return plusieurs ? listeDe(fiche) : fiche;
}

/** « 8,2 Mo », « 340 Ko » : pour les messages du compilateur. */
export function ecrireTaille(octets: number): string {
  if (octets >= 1024 * 1024) return `${(octets / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
  if (octets >= 1024) return `${Math.round(octets / 1024).toLocaleString('fr-FR')} Ko`;
  return `${octets} octets`;
}

/** Les choix de fichier de la page, par variable. */
export type FichiersDeLaPage = Map<string, { choix: ChoixFichier; ligne: number }>;

/** « fichier "Choisir" dans photo … » : le libellé, les types acceptés et la taille. */
export function verifierChoixFichier(element: Element, s: Signaler): void {
  const choix = element.fichier!;
  const libelle = texteSimple(element.contenu);
  if (libelle !== undefined && libelle.trim() === '') {
    s.erreur('le libellé du choix de fichier est vide : écrivez ce que la personne lit sur le bouton, par exemple fichier "Choisir une photo" dans photo.', element.ligne);
  }
  const connus = Object.keys(FAMILLES_FICHIER);
  for (const mot of choix.accepte) {
    if (mot === 'svg') {
      s.erreur("le SVG n'est pas accepté : un fichier SVG peut contenir du script, ce n'est pas une « image » pour « accepte ». Acceptez images (PNG, JPEG, WebP, GIF, AVIF).", element.ligne);
    } else if (!familleDe(mot)) {
      s.erreur(`« ${mot} » n'est pas un type de fichier connu. Types possibles : ${connus.join(', ')}.${proposerNom(mot, connus)}`, element.ligne);
    }
  }
  if (choix.octets !== undefined && choix.octets <= 0) s.erreur('la taille maximale est positive : maximum 5 Mo.', element.ligne);
  if (choix.accepte.length === 0) {
    s.avertissement("sans « accepte », tout fichier peut être choisi : le serveur doit vérifier le type. Écrivez par exemple accepte images ou accepte pdf.", element.ligne);
  }
}

/** Les familles connues de « accepte », sans doublon. */
export const famillesAcceptees = (choix: ChoixFichier): string[] => [...new Set(choix.accepte.map(familleDe).filter((f): f is string => f !== undefined))];

/** Faux pour un choix dont on sait qu'il n'a pas d'aperçu (« un PDF n'a pas d'aperçu »). */
export function aUnApercu(choix: ChoixFichier): boolean {
  const familles = famillesAcceptees(choix);
  return familles.length === 0 || familles.some((f) => FAMILLES_FICHIER[f].apercu);
}

/** Ce que l'analyse de la page donne à l'envoi pour juger. */
export interface ContexteEnvoi {
  fichiers: FichiersDeLaPage;
  sources: Map<string, InfoSource>;
  /** Le type d'une variable de la page (undefined : elle n'existe pas). */
  typeDe(nom: string, ligne: number): TypeValeur | undefined;
}

/** Les phrases d'un refus qui reviennent (aussi dans le catalogue d'erreurs du site). */
export const SANS_PACK_DE_TELEVERSEMENT =
  "le serveur de ce fichier ne reçoit pas de fichier : les packs Astratra n'ont pas encore de route d'envoi, et Humalis n'invente pas de récepteur (taille, type, nom, droits : ce serait de la sécurité inventée). Envoyez le fichier à une source déclarée : envoyer fichier … vers \"…\" de la source \"…\".";

/** « envoyer fichier photo vers "route" de la source "x" … ». */
export function verifierEnvoiFichier(envoi: EnvoiFichier, contexte: ContexteEnvoi, s: Signaler): void {
  const { ligne } = envoi;
  const choisi = contexte.fichiers.get(envoi.variable);
  if (!choisi) {
    const noms = [...contexte.fichiers.keys()];
    s.erreur(
      noms.length === 0
        ? `« ${envoi.variable} » n'est pas un fichier choisi : la page n'a aucun choix de fichier. Écrivez fichier "Choisir une photo" dans ${envoi.variable}, puis envoyer fichier ${envoi.variable} vers …`
        : `« ${envoi.variable} » n'est pas un fichier choisi. Fichiers choisis dans cette page : ${noms.join(', ')}.${proposerNom(envoi.variable, noms)}`,
      ligne,
    );
  }

  if (envoi.source === undefined) {
    s.erreur(SANS_PACK_DE_TELEVERSEMENT, ligne);
  } else {
    const info = contexte.sources.get(envoi.source);
    if (!info) {
      s.erreur(`aucune source « ${envoi.source} ». Sources : ${[...contexte.sources.keys()].join(', ') || 'aucune'}.${proposerNom(envoi.source, contexte.sources.keys())}`, ligne);
    } else {
      if (info.source.jeton?.genre === 'secret') {
        s.erreur(
          `la source « ${info.source.nom} » a un jeton secret : un fichier ne peut pas passer par la passerelle du serveur pour l'instant (corps binaire, taille), et le secret ne doit jamais partir dans le navigateur. Envoyez le fichier à une source à session ou à jeton public.`,
          ligne,
        );
      }
      if (info.source.routes.length === 0) {
        s.avertissement(`la source « ${info.source.nom} » ne décrit pas ses routes : « ${cheminSource(envoi.adresse)} » n'est pas vérifiée.`, ligne);
      } else {
        const route = routeDeSource(info.source, envoi.adresse);
        if (!route) {
          s.erreur(`aucune route « ${envoi.adresse} » dans la source « ${info.source.nom} ». Routes : ${info.source.routes.map((r) => r.adresse).join(', ')}.`, ligne);
        } else if (!regleDeRoute(route, 'creer')) {
          s.erreur(`la route « ${route.adresse} » de la source « ${info.source.nom} » ne dit pas « creer … » : l'envoi d'un fichier n'est pas permis.`, ligne);
        }
      }
    }
  }

  if (envoi.suivi !== undefined) {
    const type = contexte.typeDe(envoi.suivi, ligne);
    if (type && estConnu(type) && type.genre !== 'nombre') {
      s.erreur(`« suivi dans ${envoi.suivi} » : la progression est un nombre de 0 à 100, mais « ${envoi.suivi} » est ${decrireType(type)}. Déclarez variable ${envoi.suivi} = 0.`, ligne);
    }
  }
  if (envoi.resultat !== undefined) contexte.typeDe(envoi.resultat, ligne);
}

/** Les choix de fichier d'un bloc de la vue (conditions, boucles, blocs et formulaires compris). */
export function recenserFichiers(instructions: Instruction[], trouves: FichiersDeLaPage = new Map()): FichiersDeLaPage {
  for (const i of instructions) {
    if (i.type === 'Element' && i.element === 'fichier' && i.fichier) trouves.set(i.fichier.variable, { choix: i.fichier, ligne: i.ligne });
    else if (i.type === 'Condition') {
      recenserFichiers(i.alors, trouves);
      recenserFichiers(i.sinon, trouves);
    } else if (i.type === 'Boucle' || i.type === 'Bloc' || i.type === 'Formulaire') recenserFichiers(i.corps, trouves);
  }
  return trouves;
}
